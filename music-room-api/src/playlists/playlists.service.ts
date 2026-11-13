import { InvitationsService, activeInvitation } from '../invitations/invitations.service';
import { PaginationDto, paginate } from '../common/pagination.dto';
import { literal } from '../common/literal';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SongsService } from '../songs/songs.service';
import { EditLicense, Playlist, Prisma, ResourceType, SubscriptionPlan, Visibility } from '../../generated/prisma';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { ListPlaylistsDto } from './dto/list-playlists.dto';
import { AddSongToPlaylistDto, MoveSongDto } from './dto/playlist-actions.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { ControlPlaybackDto } from './dto/control-playback.dto';

// Order of the songs of a playlist: by position, then the id so that two reads always agree.
// Shared by GET /songs and the realtime snapshot, so they never differ.
const SONG_ORDER: Prisma.PlaylistSongOrderByWithRelationInput[] = [{ position: 'asc' }, { id: 'asc' }];
// What each song of a playlist comes with, in GET /songs and in the realtime snapshot
const SONG_ENTRY = { song: true, addedBy: { select: { id: true, name: true } } } satisfies Prisma.PlaylistSongInclude;
// Who owns a playlist, as its card and its page show it: id and name, nothing else
const OWNER = { select: { id: true, name: true } } satisfies Prisma.UserDefaultArgs;

@Injectable()
export class PlaylistsService {
  private readonly maxSongs: number; // how many songs a playlist may hold, and so how many a snapshot carries (MAX_PLAYLIST_SONGS)

  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationsService,
    private readonly songsService: SongsService,
    private readonly realtime: RealtimeService,
    config: ConfigService,
  ) {
    this.maxSongs = config.getOrThrow<number>('MAX_PLAYLIST_SONGS');
  }

  async create(ownerId: string, dto: CreatePlaylistDto) {
    return this.prisma.$transaction(async tx => {
      // Lock the owner row so concurrent create requests cannot both pass the free quota.
      const owner = await tx.user.findUniqueOrThrow({
        where: { id: ownerId },
        select: { subscriptionPlan: true },
      });
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${ownerId} FOR UPDATE`;
      if (owner.subscriptionPlan === SubscriptionPlan.FREE) {
        const ownedCount = await tx.playlist.count({ where: { ownerId } });
        if (ownedCount >= 3) {
          throw new ForbiddenException('Free accounts can create up to 3 playlists. Switch to Premium for unlimited playlists.');
        }
      }
      return tx.playlist.create({
        data: {
          ownerId,
          name: dto.name,
          visibility: dto.visibility ?? Visibility.PUBLIC,
          editLicense: dto.editLicense ?? EditLicense.EVERYONE,
        },
      });
    });
  }

  async findPublic(userId: string, query: ListPlaylistsDto) {
    const playlists = await this.prisma.playlist.findMany({
      where: {
        OR: [
          { visibility: Visibility.PUBLIC }, { ownerId: userId },
          { invitations: { some: { invitedUserId: userId, status: { in: ['PENDING', 'ACCEPTED'] } } } },
        ],
        // A search keeps the rule above: only among the playlists this user may see
        name: query.q ? { contains: literal(query.q), mode: 'insensitive' as const } : undefined,
        visibility: query.visibility,
      },
      include: { owner: OWNER },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...paginate(query),
    });
    // For each playlist of the page, in one query: how many songs it has and the picture of its first
    // song (same order as SONG_ORDER). LATERAL runs its part once per playlist, so the database reads
    // one song each through the (playlistId, position) index, not every song of every playlist.
    const cards = await this.prisma.$queryRaw<{ id: string; songsCount: number; cover: string | null }[]>`
      SELECT p.id, c."songsCount", f.cover
      FROM unnest(${playlists.map((playlist) => playlist.id)}::text[]) AS p(id)
      CROSS JOIN LATERAL (SELECT COUNT(*)::int AS "songsCount" FROM "PlaylistSong" WHERE "playlistId" = p.id) c
      LEFT JOIN LATERAL (
        SELECT s."thumbnailUrl" AS cover FROM "PlaylistSong" ps JOIN "Song" s ON s.id = ps."songId"
        WHERE ps."playlistId" = p.id ORDER BY ps.position, ps.id LIMIT 1
      ) f ON true`;
    const card = new Map(cards.map(({ id, ...rest }) => [id, rest]));
    return playlists.map((playlist) => ({ ...playlist, ...card.get(playlist.id)! }));
  }

  findMine(userId: string, query: PaginationDto) {
    return this.prisma.playlist.findMany({
      where: { OR: [{ ownerId: userId }, { collaborators: { some: { id: userId } } }],
        AND: [{ OR: [{ visibility: Visibility.PUBLIC }, { ownerId: userId },
          { invitations: { some: { invitedUserId: userId, status: { in: ['PENDING', 'ACCEPTED'] } } } },
        ] }],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...paginate(query),
    });
  }

  async findByIdOrThrow(id: string): Promise<Playlist> {
    const playlist = await this.prisma.playlist.findUnique({ where: { id } });
    if (!playlist) {
      throw new NotFoundException('Playlist not found');
    }
    return playlist;
  }

  async getDetail(id: string, userId: string) {
    const playlist = await this.prisma.playlist.findUnique({ where: { id }, include: { owner: OWNER } });
    if (!playlist) throw new NotFoundException('Playlist not found');
    // For this user only, so never in a realtime snapshot: whether the page shows the editing tools,
    // and their own invitation, which is actionable while it is pending on a public playlist.
    const invitation = await this.prisma.invitation.findUnique({
      where: { playlistId_invitedUserId: { playlistId: id, invitedUserId: userId } },
      select: { id: true, status: true },
    });
    await this.assertCanView(playlist, userId);
    return { ...playlist, canEdit: await this.canEdit(playlist, userId), invitation };
  }

  async controlPlayback(playlistId: string, userId: string, dto: ControlPlaybackDto) {
    const playlist = await this.prisma.playlist.findUnique({ where: { id: playlistId }, select: { id: true, ownerId: true, visibility: true } });
    if (!playlist) throw new NotFoundException('Playlist not found');
    const access = await this.getDetail(playlistId, userId);
    if (playlist.visibility === Visibility.PRIVATE && access.invitation?.status === 'PENDING') {
      throw new ForbiddenException('Accept the playlist invitation before controlling playback');
    }
    return this.prisma.$transaction(async tx => {
      // Serialize with detach and revoke so a command cannot pass an old grant after it was removed.
      const rows = await tx.$queryRaw<{ id: string; userId: string }[]>`SELECT id, "userId" FROM "Device" WHERE id = ${dto.deviceId} FOR UPDATE`;
      const device = rows[0];
      if (!device || device.userId !== playlist.ownerId) throw new NotFoundException('Playback device not found');
      if (userId !== playlist.ownerId) {
        const grant = await tx.controlDelegation.findFirst({
          where: { deviceId: device.id, delegatorUserId: playlist.ownerId, delegateUserId: userId, revokedAt: null },
          select: { id: true },
        });
        if (!grant) throw new ForbiddenException('The playlist owner has not delegated this device to you');
      }

      let action: 'PLAY' | 'STOP' = dto.action === 'STOP' ? 'STOP' : 'PLAY';
      let playlistSongId: string | undefined;
      let songId: string | undefined;
      if (dto.action === 'PLAY') {
        const entry = await tx.playlistSong.findFirst({ where: { id: dto.playlistSongId, playlistId }, select: { id: true, songId: true } });
        if (!entry) throw new NotFoundException('Track is not in this playlist');
        playlistSongId = entry.id;
        songId = entry.songId;
      } else if (dto.action === 'NEXT') {
        const entries = await tx.playlistSong.findMany({ where: { playlistId }, orderBy: SONG_ORDER, select: { id: true, songId: true } });
        const currentIndex = entries.findIndex(entry => entry.id === dto.playlistSongId);
        if (currentIndex < 0) throw new NotFoundException('Current track is not in this playlist');
        const next = entries[currentIndex + 1];
        if (next) { playlistSongId = next.id; songId = next.songId; }
        else action = 'STOP';
      }

      if (!this.realtime.sendPlaybackCommand({ deviceId: device.id, playlistId, action, playlistSongId, songId, requestedByUserId: userId })) {
        throw new ServiceUnavailableException('The playback device is offline. Open Sonora on that device and try again.');
      }
      return { accepted: true, deviceId: device.id, playlistId, action, playlistSongId: playlistSongId ?? null };
    });
  }

  async updateAccess(id: string, ownerId: string, data: { visibility: Visibility; editLicense: EditLicense }) {
    const updated = await this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ ownerId: string }[]>`SELECT "ownerId" FROM "Playlist" WHERE id = ${id} FOR UPDATE`;
      if (!rows[0]) throw new NotFoundException('Playlist not found');
      if (rows[0].ownerId !== ownerId) throw new ForbiddenException('Owner access required');
      return tx.playlist.update({ where: { id }, data });
    });
    this.realtime.playlistChanged(id);
    return updated;
  }

  async listInvitations(id: string, ownerId: string, query: PaginationDto) {
    const playlist = await this.findByIdOrThrow(id);
    if (playlist.ownerId !== ownerId) throw new ForbiddenException('Owner access required');
    return this.prisma.invitation.findMany({
      where: { playlistId: id, ...activeInvitation },
      select: { id: true, status: true, invitedUserId: true, invitedUser: {
        select: { id: true, name: true, username: true, publicInfo: true, musicPreferences: true },
      } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], ...paginate(query),
    });
  }

  // Everything a client shows for a playlist (the same data as GET /playlists/:id and GET /songs),
  // read as one consistent state. The realtime gateway sends it to everyone watching the playlist.
  snapshot(playlistId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const playlist = await tx.playlist.findUniqueOrThrow({ where: { id: playlistId } });
        const songs = await tx.playlistSong.findMany({ where: { playlistId }, include: SONG_ENTRY, orderBy: SONG_ORDER, take: this.maxSongs });
        const songsLength = await tx.playlistSong.count({ where: { playlistId } });
        return { playlist, songs, songsLength };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  // A pending invitation is enough to open the invitation prompt, but accepting it is required
  // before a private playlist's songs can be read.
  invite(playlistId: string, inviterId: string, invitedUserId: string) {
    return this.invitations.invite(ResourceType.PLAYLIST, playlistId, inviterId, invitedUserId);
  }

  removeInvite(id: string, ownerId: string, userId: string) {
    return this.invitations.remove(ResourceType.PLAYLIST, id, ownerId, userId);
  }

  // -----------------------------------------------------------------
  // Morceaux
  // -----------------------------------------------------------------
  async getSongs(playlistId: string, userId: string, query: PaginationDto) {
    const playlist = await this.findByIdOrThrow(playlistId);
    await this.assertCanView(playlist, userId);

    return this.prisma.playlistSong.findMany({
      where: { playlistId },
      include: SONG_ENTRY,
      orderBy: SONG_ORDER, ...paginate(query),
    });
  }

  async addSong(playlistId: string, userId: string, dto: AddSongToPlaylistDto) {
    const playlist = await this.findByIdOrThrow(playlistId);
    await this.assertCanEdit(playlist, userId);

    const song = await this.songsService.findOrCreateByExternalId(dto.externalId);

    try {
      const added = await this.prisma.$transaction(async (tx) => {
        // Locked first, wherever the song goes: simultaneous additions count and place one after the other.
        // A playlist holds at most what one snapshot holds, so everyone always sees all of it.
        await tx.$queryRaw`SELECT id FROM "Playlist" WHERE id = ${playlistId} FOR UPDATE`;
        if (await tx.playlistSong.count({ where: { playlistId } }) >= this.maxSongs) {
          throw new ConflictException(`This playlist is full (${this.maxSongs} songs). Remove a song to add another.`);
        }
        const position = dto.position ?? (await this.nextPosition(tx, playlistId));
        return tx.playlistSong.create({
          data: { playlistId, songId: song.id, position, addedById: userId },
          include: { song: true },
        });
      });
      this.realtime.playlistChanged(playlistId);
      return added;
    } catch (e: unknown) {
      if (this.isUniqueConstraintError(e)) {
        throw new ConflictException('This track is already in the playlist');
      }
      throw e;
    }
  }

  // Déplacement avec verrou optimiste : si la position n'est plus celle que
  // le client pensait (quelqu'un d'autre a bougé le morceau entre-temps), on
  // renvoie un 409 pour que le client rafraîchisse avant de réessayer, plutôt
  // que d'écraser silencieusement le changement concurrent.
  async moveSong(playlistId: string, playlistSongId: string, userId: string, dto: MoveSongDto) {
    const playlist = await this.findByIdOrThrow(playlistId);
    await this.assertCanEdit(playlist, userId);

    const moved = await this.prisma.$transaction(async (tx) => {
      // The position the client saw is checked by the same statement that moves the song: of
      // several simultaneous moves of one song, the database lets exactly one find it there
      const { count } = await tx.playlistSong.updateMany({
        where: { id: playlistSongId, playlistId, position: dto.expectedPosition },
        data: { position: dto.position },
      });
      // After a move the row stays locked until the transaction ends, so it cannot be removed
      // before it is read here. Without a move, this read tells "gone" from "moved by someone else".
      const current = await tx.playlistSong.findFirst({ where: { id: playlistSongId, playlistId }, include: { song: true } });
      if (!current) throw new NotFoundException('Track not found in this playlist');
      if (count === 0) {
        throw new ConflictException(
          'This track was moved by another user. Refresh the playlist',
        );
      }
      return current;
    });
    this.realtime.playlistChanged(playlistId);
    return moved;
  }

  async removeSong(playlistId: string, playlistSongId: string, userId: string) {
    const playlist = await this.findByIdOrThrow(playlistId);
    await this.assertCanEdit(playlist, userId);

    // One statement: of several simultaneous removals, one deletes the song and the others find nothing
    const { count } = await this.prisma.playlistSong.deleteMany({ where: { id: playlistSongId, playlistId } });
    if (count === 0) throw new NotFoundException('Track not found in this playlist');
    this.realtime.playlistChanged(playlistId);
    return { deleted: true };
  }

  // -----------------------------------------------------------------
  // Autorisations
  // -----------------------------------------------------------------
  private async assertCanView(playlist: Playlist, userId: string): Promise<void> {
    if ((await this.viewers(playlist, [userId])).has(userId)) return;
    throw new ForbiddenException('This playlist is private');
  }

  // Which of these users may see the playlist: everyone if it is public, otherwise its owner and
  // users who accepted an invitation. Pending private invitations are answered from the inbox
  // and do not grant access to the playlist or its songs.
  // GET /playlists/:id uses it for one user, the realtime gateway for everyone about to receive a snapshot.
  async viewers(playlist: Pick<Playlist, 'id' | 'ownerId' | 'visibility'>, userIds: string[]): Promise<Set<string>> {
    if (playlist.visibility === Visibility.PUBLIC) return new Set(userIds);
    const allowed = new Set(userIds.filter((id) => id === playlist.ownerId));
    const others = userIds.filter((id) => id !== playlist.ownerId);
    if (others.length > 0) {
      const invitations = await this.prisma.invitation.findMany({
        where: { playlistId: playlist.id, invitedUserId: { in: others }, status: 'ACCEPTED' },
        select: { invitedUserId: true },
      });
      for (const { invitedUserId } of invitations) allowed.add(invitedUserId);
    }
    return allowed;
  }

  private async assertCanEdit(playlist: Playlist, userId: string): Promise<void> {
    await this.assertCanView(playlist, userId);
    if (await this.canEdit(playlist, userId)) return;
    throw new ForbiddenException('Only invited collaborators can edit this playlist');
  }

  // Whether a user who may see the playlist may also add, move and remove its songs: everyone, or only
  // its owner and the users who accepted an invitation. GET /playlists/:id gives the app this same answer.
  private async canEdit(playlist: Playlist, userId: string): Promise<boolean> {
    if (playlist.ownerId !== userId) {
      const invitation = await this.prisma.invitation.findUnique({
        where: { playlistId_invitedUserId: { playlistId: playlist.id, invitedUserId: userId } },
        select: { status: true },
      });
      // A public playlist is visible while an invitation is pending, but that invitation grants
      // no editing rights until the user explicitly accepts it.
      if (invitation?.status === 'PENDING') return false;
    }
    if (playlist.editLicense === EditLicense.OWNER_ONLY) return playlist.ownerId === userId;
    if (playlist.editLicense === EditLicense.EVERYONE) return true;
    if (playlist.ownerId === userId) return true;
    return this.isCollaborator(playlist.id, userId);
  }

  private async isCollaborator(playlistId: string, userId: string): Promise<boolean> {
    const match = await this.prisma.playlist.findFirst({
      where: { id: playlistId, collaborators: { some: { id: userId } } },
    });
    return Boolean(match);
  }

  // The position after the last song. Called with the playlist locked (see addSong): a second addition
  // "at the end" reads the song the first one inserted, instead of the same last position.
  private async nextPosition(tx: Prisma.TransactionClient, playlistId: string): Promise<number> {
    const last = await tx.playlistSong.findFirst({
      where: { playlistId },
      orderBy: { position: 'desc' },
    });
    return (last?.position ?? 0) + 1;
  }

  private isUniqueConstraintError(e: unknown): boolean {
    return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
  }
}
