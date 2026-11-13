import { ArrowIcon } from '../../components/ui/ArrowIcon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ApiError, type ApiClient } from '../../api/contract';
import type { GoneReason, Live, PlaybackStatus } from '../../realtime/live';
import { clock, songSeconds } from '../rooms/parties';
import { droppedPosition, playlistsApi, type PlaylistEntry, type PlaylistPage as PageData, type PlaylistSnapshot } from './playlists';
import { EXTRACT_SECONDS, blockedByBrowser, playExtract, useAutoDismiss, useExtractPlayer } from '../rooms/helpers';
import { Icon } from '../rooms/icons';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AddTracksPanel } from './AddTracksPanel';
import { listDelegatedDevices, type DelegatedDevice } from '../../api/devices';
import '../rooms/rooms.css';
import './playlists.css';

// Why the page can no longer show the playlist, in words for the user
const GONE: Record<GoneReason, string> = {
  FORBIDDEN: 'You no longer have access to this playlist.',
  NOT_FOUND: 'This playlist no longer exists.',
  TOO_MANY_CONNECTIONS: 'Your account is open on too many devices.',
  UNAUTHORIZED: 'The server refused the live connection. Please log in again.',
  SIGNED_OUT: 'You are logged out.',
  BAD_REQUEST: 'Live updates are unavailable for this playlist.',
  TOO_MANY: 'Too many pages are open at once.',
};

// One playlist, live: its songs in order, moved by drag and drop, added, removed, and played one after the other
export function PlaylistPage({ client, live }: { client: ApiClient; live: Live }) {
  const { playlistId = '' } = useParams();
  const navigate = useNavigate();
  const api = useMemo(() => playlistsApi(client), [client]);
  const [snapshot, setSnapshot] = useState<PlaylistSnapshot | null>(null);
  const [gone, setGone] = useState<GoneReason | null>(null);
  const [page, setPage] = useState<PageData | null>(null);
  const [pageError, setPageError] = useState('');
  const [reloadPage, setReloadPage] = useState(0); // counts the reloads of the page data: "Try again", an answer, a refusal
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false); // a move is on its way to the server: no other drag until it is answered
  const [adding, setAdding] = useState(false); // the Add tracks panel is open, drawn in place of the playlist
  const [error, setError] = useState('');
  const [sharedDevices, setSharedDevices] = useState<DelegatedDevice[]>([]);
  const [remoteDeviceId, setRemoteDeviceId] = useState<string | null>(null);
  const [remoteNowPlayingId, setRemoteNowPlayingId] = useState<string | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<PlaybackStatus | null>(null);
  const [remoteClock, setRemoteClock] = useState(Date.now());
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState<PlaylistEntry | null>(null);
  useAutoDismiss(error, setError);
  const alive = useRef(false);
  const working = useRef(false);
  const declining = useRef(false); // a private playlist is being declined: losing access then means the decline worked
  const player = useExtractPlayer();
  const [listening, setListening] = useState<string | null>(null); // the song whose extract plays on this computer
  const [startedAt, setStartedAt] = useState<number | null>(null); // when its extract started, on this computer's clock
  const asked = useRef(0); // counts the songs asked for: the answer for an older one is dropped
  const listed = useRef<PlaylistEntry[]>([]); // the list as it is now, for the song that comes next
  listed.current = snapshot?.songs ?? [];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), // a mouse or a finger on the handle
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }), // Space on the handle, the arrows, Space again
  );

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Watch the playlist while the page is open: each snapshot replaces the songs shown
  // Load what the snapshot cannot tell, being the same message for everyone: the owner, whether I may edit, my invitation
  useEffect(() => {
    let active = true;
    setPageError('');
    void api.page(playlistId).then(found => { if (active) setPage(found); })
      .catch(e => { if (active) setPageError(e instanceof Error ? e.message : 'Unable to load the playlist.'); });
    return () => { active = false; };
  }, [api, playlistId, reloadPage]);
  useEffect(() => {
    if (!page || page.owner.id === client.user?.id) { setSharedDevices([]); setRemoteDeviceId(null); return; }
    let active = true;
    void listDelegatedDevices(client).then(rows => {
      if (!active) return;
      const shared = rows.filter(device => device.owner.id === page.owner.id);
      setSharedDevices(shared);
      setRemoteDeviceId(current => shared.some(device => device.id === current) ? current : shared[0]?.id ?? null);
    }).catch(() => { if (active) { setSharedDevices([]); setRemoteDeviceId(null); } });
    return () => { active = false; };
  }, [client, page?.owner.id]);
  useEffect(() => {
    if (!remoteDeviceId) { setRemoteStatus(null); return; }
    return live.watchPlaybackStatus(status => {
      if (status.playlistId !== playlistId || status.deviceId !== remoteDeviceId) return;
      setRemoteStatus(status);
      setRemoteNowPlayingId(status.playlistSongId);
    });
  }, [live, playlistId, remoteDeviceId]);
  useEffect(() => {
    const timer = window.setInterval(() => setRemoteClock(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  // A pending invitation hides only a private playlist: a public one shows its songs, without the editing tools until accepted
  const invitedToPrivate = page?.invitation?.status === 'PENDING' && page.visibility === 'PRIVATE';
  useEffect(() => {
    if (!page || invitedToPrivate) return;
    return live.watchPlaylist(playlistId, {
      onSnapshot: setSnapshot,
      // Declining a private playlist ends the right to watch it, often before the answer to the decline arrives: leave at once
      onGone: reason => { if (declining.current) navigate('/playlists'); else setGone(reason); },
    });
  }, [live, navigate, page, invitedToPrivate, playlistId]);

  // Plays this song on this computer, or stops when there is none. A song without an extract is skipped, like a radio would.
  const listen = useCallback((entry: PlaylistEntry | undefined) => {
    const ask = ++asked.current;
    player.pause(); // the last song stops at once, even while the link of the next one loads
    setStartedAt(null);
    if (!entry) { setListening(null); return; }
    setListening(entry.id);
    void playExtract(player, client, entry.song.id, 0, () => asked.current === ask)
      .then(found => {
        if (asked.current !== ask || !alive.current) return;
        if (found) setStartedAt(Date.now());
        else listen(after(listed.current, entry.id));
      })
      .catch(e => {
        if (asked.current !== ask || !alive.current) return;
        setListening(null);
        setError(blockedByBrowser(e) ? 'The browser refused the sound. Click ▶ to play.' : e instanceof Error ? e.message : 'Unable to play this song.');
      });
  }, [player, client]);
  const selectedRemote = sharedDevices.find(device => device.id === remoteDeviceId) ?? null;
  const remoteCurrent = snapshot?.songs.find(entry => entry.id === remoteNowPlayingId);
  const remoteDuration = remoteStatus?.durationSeconds ?? 30;
  const remoteStatusAge = remoteStatus ? remoteClock - remoteStatus.updatedAt : 0;
  const remoteElapsed = Math.min(remoteDuration, Math.max(0, (remoteStatus?.positionSeconds ?? 0)
    + (remoteStatus?.state === 'PLAYING' && remoteStatusAge < 2500 ? remoteStatusAge / 1000 : 0)));
  const remoteIsActive = remoteStatus?.state === 'PLAYING' || remoteStatus?.state === 'PAUSED';
  async function controlRemote(action: 'PLAY' | 'STOP' | 'NEXT', entry?: PlaylistEntry) {
    if (!selectedRemote || remoteBusy) return;
    setRemoteBusy(true); setError('');
    try {
      const result = await api.controlPlayback(playlistId, selectedRemote.id, action, entry?.id);
      setRemoteNowPlayingId(result.playlistSongId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to control playback on this device.'); }
    finally { setRemoteBusy(false); }
  }
  // At the end of an extract, the next song of the list plays
  useEffect(() => {
    const ended = () => { if (listening) listen(after(listed.current, listening)); };
    player.addEventListener('ended', ended);
    return () => player.removeEventListener('ended', ended);
  }, [player, listening, listen]);
  // Someone removed the song playing here: it stops
  useEffect(() => {
    if (listening && snapshot && !snapshot.songs.some(entry => entry.id === listening)) listen(undefined);
  }, [snapshot, listening, listen]);

  async function action(operation: () => Promise<unknown>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await operation(); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Unable to complete this action.'); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  function remove(entry: PlaylistEntry) {
    setConfirmingRemoval(entry);
  }
  function confirmRemove() {
    const entry = confirmingRemoval;
    setConfirmingRemoval(null);
    if (!entry) return;
    void action(async () => {
      try { await api.remove(playlistId, entry.id); }
      catch (e) {
        if (e instanceof ApiError && e.status === 404) return; // someone removed it first: the song is gone, as wanted
        if (e instanceof ApiError && e.status === 403) setReloadPage(n => n + 1); // no longer allowed: the bins go away
        throw e;
      }
    });
  }
  // A song dropped somewhere else: it alone gets a new place, shown at once so that a next drag counts with the right
  // places. Other drags wait for the server's answer; if it refuses, the list goes back to the order before the drop.
  function dropped({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || !snapshot) return;
    const before = snapshot.songs;
    const toIndex = before.findIndex(entry => entry.id === over.id);
    const data = arrayMove(before, before.findIndex(entry => entry.id === active.id), toIndex);
    const entry = data[toIndex];
    const position = droppedPosition(data, toIndex);
    const shown = data.map(item => item.id === entry.id ? { ...item, position } : item);
    setSnapshot(current => current && { ...current, songs: shown });
    setMoving(true);
    void api.move(playlistId, entry.id, position, entry.position)
      .catch(e => {
        if (!alive.current) return;
        // Back to the order before the drop, unless the server has sent a newer one meanwhile
        setSnapshot(current => current && current.songs === shown ? { ...current, songs: before } : current);
        if (e instanceof ApiError && e.status === 404) return; // someone removed the song: the live update takes it away
        if (e instanceof ApiError && e.status === 403) setReloadPage(n => n + 1); // no longer allowed: the handles and bins go away
        setError(e instanceof Error ? e.message : 'Unable to move this song.');
      })
      .finally(() => { if (alive.current) setMoving(false); });
  }
  function answer(accept: boolean) {
    const invitation = page?.invitation;
    if (!invitation) return;
    const leaves = !accept && snapshot?.playlist.visibility === 'PRIVATE'; // declining a private playlist ends the right to see it
    declining.current = leaves;
    void action(async () => {
      try { await api.answer(invitation.id, accept); }
      catch (e) {
        // Already answered, from another device: the page data tells what is true now
        if (e instanceof ApiError && e.status === 409) { if (alive.current) setReloadPage(n => n + 1); return; }
        throw e;
      }
      if (!alive.current) return; // already left: the end of access arrived first
      if (leaves) navigate('/playlists');
      else setReloadPage(n => n + 1);
    }).finally(() => { declining.current = false; });
  }

  if (gone) {
    return <section className="rooms">
      <p className="rooms-alert" role="alert">{GONE[gone]}</p>
      <Link to="/playlists" className="rooms-back"><ArrowIcon direction="left" /> Back to playlists</Link>
    </section>;
  }
  if (!page || (!invitedToPrivate && !snapshot)) {
    return <section className="rooms">
      <Link to="/playlists" className="rooms-back"><ArrowIcon direction="left" /> Back to playlists</Link>
      {pageError ? <div className="rooms-error" role="alert"><p>{pageError}</p>
        <button type="button" className="rooms-outline" onClick={() => setReloadPage(n => n + 1)}>Try again</button></div>
        : <p className="rooms-loading" role="status">Connecting…</p>}
    </section>;
  }
  if (invitedToPrivate && !snapshot) {
    return <section className="rooms">
      <Link to="/playlists" className="rooms-back"><ArrowIcon direction="left" /> Back to playlists</Link>
      <header className="playlist-header">
        <span className="playlist-cover rooms-blank"><Icon name="lock" size={32} /></span>
        <div className="rooms-text"><h1>{page.name}</h1><span className="rooms-playing">Private playlist</span><span>Created by {page.owner.name}</span></div>
      </header>
      {pageError ? <div className="rooms-error" role="alert"><p>{pageError}</p><button type="button" className="rooms-outline" onClick={() => setReloadPage(n => n + 1)}>Try again</button></div> : null}
      {error ? <p className="rooms-alert" role="alert">{error}</p> : null}
      <div className="rooms-card-box">
        <p className="eyebrow">INVITATION</p>
        <strong>You're invited to this playlist.</strong>
        <p>Accept the invitation to see its songs and collaborate.</p>
        <div className="rooms-pages">
          <button type="button" className="rooms-square" aria-label="Accept invitation" title="Accept invitation" disabled={busy} onClick={() => answer(true)}>✓</button>
          <button type="button" className="rooms-square" aria-label="Decline invitation" title="Decline invitation" disabled={busy} onClick={() => answer(false)}>×</button>
        </div>
      </div>
    </section>;
  }
  if (!snapshot) return null;
  if (adding) {
    return <AddTracksPanel client={client} playlistId={playlistId} name={snapshot.playlist.name} songs={snapshot.songs}
      onForbidden={() => setReloadPage(n => n + 1)} onBack={() => setAdding(false)} />;
  }

  const { playlist, songs, songsLength } = snapshot;
  const canEdit = page.canEdit;
  const cover = songs[0]?.song.thumbnailUrl;
  const mine = page.owner.id === client.user?.id;
  return <section className="rooms">
    {confirmingRemoval ? <ConfirmDialog title="Remove this song?" message={`${confirmingRemoval.song.title} will be removed from the playlist for everyone.`} confirmLabel="Remove" destructive onCancel={() => setConfirmingRemoval(null)} onConfirm={confirmRemove} /> : null}
    <div className="rooms-between">
      <Link to="/playlists" className="rooms-back"><ArrowIcon direction="left" /> Back to playlists</Link>
      <span className="rooms-pages">
        {/* The owner's Access & people page belongs to the auth part */}
        {mine ? <Link to={`/playlists/${encodeURIComponent(playlistId)}/access`} className="rooms-square" aria-label="Access & people"><Icon name="people" /></Link> : null}
        {canEdit ? <button type="button" className="rooms-square" aria-label="Add tracks" disabled={busy} onClick={() => setAdding(true)}><Icon name="plus" /></button> : null}
      </span>
    </div>
    <header className="playlist-header">
      {cover ? <img src={cover} alt="" className="playlist-cover" />
        : <span className="playlist-cover rooms-blank"><Icon name={playlist.visibility === 'PRIVATE' ? 'lock' : 'music'} size={32} /></span>}
      <div className="rooms-text">
        <h1>{playlist.name}</h1>
        <span className="rooms-playing">{playlist.visibility === 'PUBLIC' ? 'Public' : 'Private'} · {playlist.editLicense === 'OWNER_ONLY' ? 'Owner edits' : playlist.editLicense === 'EVERYONE' ? 'Everyone edits' : 'Invitees edit'}</span>
        <span>{songsLength} {songsLength === 1 ? 'track' : 'tracks'} · Created by {mine ? 'you' : page.owner.name}</span>
      </div>
    </header>
    {sharedDevices.length ? <section className="rooms-card-box remote-playback-card">
      <div className="rooms-between"><div className="rooms-text"><span className="eyebrow">REMOTE PLAYBACK</span><strong>Play on a shared device</strong></div>
        {remoteCurrent ? <span className="rooms-note">{remoteCurrent.song.title}</span> : null}</div>
      <div className="remote-playback-devices">{sharedDevices.map(device => <button type="button" key={device.id}
        className={`remote-playback-device${device.id === remoteDeviceId ? ' selected' : ''}`} aria-pressed={device.id === remoteDeviceId}
        onClick={() => { setRemoteDeviceId(device.id); setRemoteStatus(null); setRemoteNowPlayingId(null); }}><Icon name="broadcast" size={17} /><span>{device.model || 'Shared device'}</span></button>)}</div>
      <p className="remote-playback-caption">Shared by {page.owner.name}. The target device must have Sonora open.</p>
      {remoteStatus ? <div className="remote-playback-progress" aria-live="polite">
        <div className="remote-playback-progress-label"><span>{remoteStatus.state === 'PLAYING' && remoteStatusAge >= 2500 ? 'Waiting for device update' : remoteStatus.state === 'PLAYING' ? 'Playing' : remoteStatus.state === 'PAUSED' ? 'Paused' : remoteStatus.state === 'ENDED' ? 'Preview finished' : remoteStatus.state === 'UNAVAILABLE' ? 'Preview unavailable' : 'Stopped'}</span>
          <span>{clock(Math.floor(remoteElapsed))} / {clock(Math.floor(remoteDuration))}</span></div>
        <div className="remote-playback-progress-track"><span style={{ width: `${remoteDuration ? remoteElapsed / remoteDuration * 100 : 0}%` }} /></div>
      </div> : null}
      <div className="remote-playback-actions">
        <button type="button" className="rooms-square" aria-label="Play next track on shared device" disabled={!remoteCurrent || remoteBusy}
          onClick={() => remoteCurrent && void controlRemote('NEXT', remoteCurrent)}><Icon name="play" size={15} /></button>
        <button type="button" className="rooms-square" aria-label="Stop shared device playback" disabled={!remoteIsActive || remoteBusy}
          onClick={() => void controlRemote('STOP')}><Icon name="stop" size={15} /></button>
      </div>
    </section> : null}
    {page.invitation?.status === 'PENDING' ? <div className="rooms-card-box">
      <p className="eyebrow">INVITATION</p>
      <strong>You're invited to collaborate on this playlist.</strong>
      <p>Accept the invitation to add, move and remove its songs.</p>
      <div className="rooms-pages">
        <button type="button" className="rooms-square" aria-label="Accept invitation" title="Accept invitation" disabled={busy} onClick={() => answer(true)}>✓</button>
        <button type="button" className="rooms-square" aria-label="Decline invitation" title="Decline invitation" disabled={busy} onClick={() => answer(false)}>×</button>
      </div>
    </div> : null}
    {error ? <p className="rooms-alert" role="alert">{error}</p> : null}
    {listening ? <NowPlaying title={listed.current.find(entry => entry.id === listening)?.song.title ?? ''} startedAt={startedAt}
      onStop={() => listen(undefined)} /> : null}
    <h2>The tracklist</h2>
    {songs.length === 0 ? <p>No tracks yet.</p> : null}
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dropped}>
      <SortableContext items={songs.map(entry => entry.id)} strategy={verticalListSortingStrategy} disabled={!canEdit || busy || moving}>
        <div className="rooms-list">{songs.map(entry =>
          <SongRow key={entry.id} entry={entry} addedBy={entry.addedBy.id === client.user?.id ? 'you' : entry.addedBy.name}
            canEdit={canEdit} disabled={busy || remoteBusy} playing={entry.id === listening} remoteAvailable={!!selectedRemote} remotePlaying={entry.id === remoteNowPlayingId}
            onPlay={() => listen(entry.id === listening ? undefined : entry)} onRemotePlay={() => void controlRemote('PLAY', entry)} onRemove={() => remove(entry)} />)}
        </div>
      </SortableContext>
    </DndContext>
  </section>;
}

// One song of the tracklist: its handle to drag it (for those who may edit), play or stop, and its bin
function SongRow({ entry, addedBy, canEdit, disabled, playing, remoteAvailable, remotePlaying, onPlay, onRemotePlay, onRemove }: {
  entry: PlaylistEntry; addedBy: string; canEdit: boolean; disabled: boolean; playing: boolean; remoteAvailable: boolean; remotePlaying: boolean; onPlay: () => void; onRemotePlay: () => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  return <div ref={setNodeRef} className={`rooms-row${isDragging ? ' playlist-dragging' : ''}`}
    style={{ transform: CSS.Transform.toString(transform), transition }}>
    {canEdit ? <button type="button" ref={setActivatorNodeRef} className="playlist-handle" aria-label={`Move ${entry.song.title}`} {...attributes} {...listeners}>
      <Icon name="grip" size={16} />
    </button> : null}
    {entry.song.thumbnailUrl ? <img src={entry.song.thumbnailUrl} alt="" className="rooms-thumb" /> : <span className="rooms-thumb rooms-blank" />}
    <span className="rooms-text">
      <strong>{entry.song.title}</strong>
      <span>{entry.song.artist}</span>
      <span className="rooms-note">{clock(songSeconds(entry.song.durationSec))} · added by {addedBy}</span>
    </span>
    <button type="button" className={`rooms-square${playing ? ' playlist-playing' : ''}`} aria-label={`${playing ? 'Stop' : 'Play'} ${entry.song.title}`} onClick={onPlay}>
      <Icon name={playing ? 'stop' : 'play'} size={16} />
    </button>
    {remoteAvailable ? <button type="button" className={`rooms-square${remotePlaying ? ' playlist-playing' : ''}`} aria-label={`Play ${entry.song.title} on shared device`} disabled={disabled} onClick={onRemotePlay}>
      <Icon name="broadcast" size={16} />
    </button> : null}
    {canEdit ? <button type="button" className="rooms-square" aria-label={`Remove ${entry.song.title}`} disabled={disabled} onClick={onRemove}>
      <Icon name="trash" size={16} />
    </button> : null}
  </div>;
}

// The song after this one in the list, or none after the last one (or when this one is no longer in the list)
function after(list: PlaylistEntry[], id: string) {
  const index = list.findIndex(entry => entry.id === id);
  return index < 0 ? undefined : list[index + 1];
}

// The song playing on this computer, with its bar. The bar counts from when the extract started, so it never shows where
// the last song stopped. Apart from the page: only this card is drawn again every second.
function NowPlaying({ title, startedAt, onStop }: { title: string; startedAt: number | null; onStop: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = startedAt === null ? 0 : Math.min(Math.max(Math.floor((now - startedAt) / 1000), 0), EXTRACT_SECONDS);
  return <div className="rooms-card-box">
    <div className="rooms-between">
      <span className="rooms-text"><span className="eyebrow">NOW PLAYING</span><strong>{title}</strong></span>
      <button type="button" className="rooms-square playlist-playing" aria-label={`Stop ${title}`} onClick={onStop}><Icon name="stop" size={16} /></button>
    </div>
    <div className="rooms-track"><span style={{ width: `${(100 * elapsed) / EXTRACT_SECONDS}%` }} /></div>
    <div className="rooms-between"><span>{clock(elapsed)}</span><span>{clock(EXTRACT_SECONDS)}</span></div>
  </div>;
}
