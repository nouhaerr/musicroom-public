import { ArrowIcon } from '../../components/ui/ArrowIcon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, type ApiClient } from '../../api/client';
import { socialApi } from '../../api/social';
import { Avatar } from '../friends/PersonCard';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import type { OwnProfile } from '../../api/profiles';
import type { PlaylistPage } from '../playlists/playlists';
import '../rooms/rooms.css';
import './access.css';

type Visibility = 'PUBLIC' | 'PRIVATE';
type EditLicense = 'OWNER_ONLY' | 'EVERYONE' | 'INVITED_ONLY';
type Invitation = {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';
  invitedUserId: string;
  invitedUser: { id: string; name: string; username?: string | null; publicInfo: Record<string, unknown> | null; musicPreferences: string[] };
};

const PAGE_SIZE = 20;

export function AccessPeoplePage({ client }: { client: ApiClient }) {
  const { playlistId = '' } = useParams();
  const navigate = useNavigate();
  const api = useMemo(() => socialApi(client), [client]);
  const path = `/playlists/${encodeURIComponent(playlistId)}`;
  const [playlist, setPlaylist] = useState<PlaylistPage | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<OwnProfile | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC');
  const [editLicense, setEditLicense] = useState<EditLicense>('EVERYONE');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Awaited<ReturnType<typeof api.search>>>([]);
  const [stagedInvites, setStagedInvites] = useState<Awaited<ReturnType<typeof api.search>>>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<Invitation | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const alive = useRef(false);
  const working = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (!notice && !error) return;
    const timer = setTimeout(() => { setNotice(''); setError(''); }, 10000);
    return () => clearTimeout(timer);
  }, [notice, error]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void Promise.all([
      client.request<PlaylistPage>(path),
      client.request<Invitation[]>(`${path}/invitations?page=${page}&limit=${PAGE_SIZE}`),
      client.getMyProfile(),
    ]).then(([detail, invited, profile]) => {
      if (!active) return;
      if (detail.ownerId !== client.user?.id) throw new ApiError(403, 'Only the playlist owner can manage access.');
      setPlaylist(detail);
      setOwnerProfile(profile);
      setVisibility(detail.visibility);
      setEditLicense(detail.editLicense);
      setInvitations(invited);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load access settings.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, path, page, reload]);
  useEffect(() => { setStagedInvites([]); }, [playlistId]);
  useEffect(() => {
    let active = true;
    setPeople([]); setSearchError('');
    if (!picker || !query.trim()) { setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      void api.search(query.trim(), '', 1).then(result => { if (active) setPeople(result); })
        .catch(e => { if (active) setSearchError(e instanceof Error ? e.message : 'Unable to search people.'); })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [api, picker, query]);

  const settingsDirty = !!playlist && (playlist.visibility !== visibility || playlist.editLicense !== editLicense);
  const dirty = settingsDirty || stagedInvites.length > 0;
  const run = async (operation: () => Promise<void>, message: string) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setNotice('');
    try { await operation(); if (alive.current) { setNotice(message); setReload(value => value + 1); } }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Unable to save access settings.'); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  };
  const stagedInviteIds = new Set(stagedInvites.map(person => person.id));
  const stageInvite = (person: (typeof people)[number]) => setStagedInvites(current => current.some(item => item.id === person.id) ? current.filter(item => item.id !== person.id) : [...current, person]);
  const save = () => void run(async () => {
    if (settingsDirty) {
      await client.request(`${path}/access`, 'PATCH', { visibility, editLicense });
      setPlaylist(current => current ? { ...current, visibility, editLicense } : current);
    }
    if (!stagedInvites.length) return;
    const results = await Promise.allSettled(stagedInvites.map(person => client.request(`${path}/invite`, 'POST', { userId: person.id })));
    const sent = stagedInvites.filter((_, index) => results[index].status === 'fulfilled');
    const failed = stagedInvites.filter((_, index) => results[index].status === 'rejected');
    setStagedInvites(failed);
    if (sent.length) setInvitations(current => [...current, ...sent.map(person => ({ id: `pending-${person.id}`, status: 'PENDING' as const, invitedUserId: person.id, invitedUser: person }))]);
    if (failed.length) {
      throw new Error(`Access settings were saved, but invitations could not be sent to: ${failed.map(person => person.name).join(', ')}. Save again to retry.`);
    }
  }, stagedInvites.length ? 'Access settings saved and invitations sent.' : 'Access settings saved.');
  const back = () => {
    if (!dirty) navigate(`/playlists/${encodeURIComponent(playlistId)}`);
    else setDiscardOpen(true);
  };
  const disabled = loading || busy || !!error;
  const invitedIds = new Set(invitations.map(invite => invite.invitedUserId));
  const remove = (invitation: Invitation) => {
    void run(async () => {
      await client.request(`${path}/invitations/${encodeURIComponent(invitation.invitedUserId)}`, 'DELETE');
    }, 'Invitation removed.');
    setPendingRemoval(null);
  };
  const option = (title: string, description: string, selected: boolean, onClick: () => void, unavailable = false) =>
    <button type="button" className={`access-option${selected ? ' access-selected' : ''}${unavailable ? ' access-option-disabled' : ''}`} aria-pressed={selected} aria-disabled={unavailable || undefined} disabled={disabled || unavailable} onClick={onClick}>
      <strong>{title}</strong><span>{description}</span>
    </button>;

  return <section className="rooms access-page">
    {discardOpen ? <ConfirmDialog title="Discard changes?" message="Your access settings or invitations have not been saved." confirmLabel="Discard changes" destructive onCancel={() => setDiscardOpen(false)} onConfirm={() => { setDiscardOpen(false); navigate(`/playlists/${encodeURIComponent(playlistId)}`); }} /> : null}
    <button type="button" className="rooms-back" disabled={busy} onClick={back}><ArrowIcon direction="left" /> Back to playlist</button>
    <p className="eyebrow">PLAYLIST ACCESS</p>
    <h1>Access & people</h1>
    {error ? <div className="rooms-error"><p role="alert">{error}</p><button className="rooms-outline" onClick={() => { setError(''); setReload(value => value + 1); }}>Retry</button></div> : null}
    {loading ? <p className="rooms-loading" role="status">Loading access settings…</p> : null}
    {playlist && !error ? <>
      <div className="rooms-card-box access-playlist"><div className="rooms-blank access-art">♫</div><div className="rooms-text"><strong>{playlist.name}</strong><span>You own this collaborative playlist.</span></div></div>
      <div className="access-grid">
        <section className="rooms-card-box">
          <h2>Who can access?</h2>
          {option('Public · default', 'Anyone can discover and listen.', visibility === 'PUBLIC', () => setVisibility('PUBLIC'))}
          {option('Private', 'Only invited people can access.', visibility === 'PRIVATE', () => setVisibility('PRIVATE'))}
        </section>
        <section className="rooms-card-box">
          <h2>Who can edit?</h2>
          {option('Everyone with access', 'Anyone who can access it can edit the playlist.', editLicense === 'EVERYONE', () => setEditLicense('EVERYONE'), visibility === 'PRIVATE')}
          {option('Only me', 'Invited people can listen, but only you can edit.', editLicense === 'OWNER_ONLY', () => setEditLicense('OWNER_ONLY'))}
          {option('Invited people only', 'Only accepted invitees can add, move or remove tracks.', editLicense === 'INVITED_ONLY', () => setEditLicense('INVITED_ONLY'))}
          {visibility === 'PRIVATE' ? <p className="rooms-note access-private-note">For a private playlist, editing is limited to invited people.</p> : null}
        </section>
      </div>
      <div className="rooms-between"><h2>Invited people</h2><button className="rooms-outline" disabled={disabled} onClick={() => setPicker(value => !value)}>{picker ? 'Close' : 'Invite people'}</button></div>
      {picker ? <section className="rooms-card-box">
        <label className="rooms-field">Find people
          <span className="access-search-wrap"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name or username" maxLength={100} /><button type="button" className="access-search-clear" aria-label="Clear invited people search" title="Clear search" disabled={!query} onClick={() => setQuery('')}>×</button></span>
        </label>
        {searching ? <p className="rooms-loading">Searching…</p> : null}
        {searchError ? <p className="rooms-alert" role="alert">{searchError}</p> : null}
        {!searching && query.trim() && !searchError && !people.length ? <p className="rooms-note">No people found.</p> : null}
        <div className="access-people">{people.filter(person => person.id !== playlist.ownerId).map(person =>
          <div className="access-person" key={person.id}><Avatar person={person} /><div className="rooms-text"><strong>{person.name}</strong><span>{person.username ? `@${person.username}` : 'Sonora listener'}</span></div><button className="rooms-outline" disabled={disabled || invitedIds.has(person.id)} onClick={() => stageInvite(person)}>{invitedIds.has(person.id) ? 'Invited' : stagedInviteIds.has(person.id) ? 'Selected' : 'Invite'}</button></div>)}</div>
        {stagedInvites.length ? <p className="rooms-note">Selected invitations will be sent when you save.</p> : null}
      </section> : null}
      <section className="rooms-card-box">
        <div className="rooms-between"><h2>People with access</h2><span className="rooms-note">{invitations.length} on this page</span></div>
        <div className="access-person">{ownerProfile ? <Avatar person={ownerProfile} /> : <div className="access-owner">{client.user?.name.slice(0, 2).toUpperCase() ?? 'YOU'}</div>}<div className="rooms-text"><strong>{ownerProfile?.name ?? client.user?.name ?? 'You'}</strong><span>Playlist owner</span></div><span className="rooms-note">Owner</span></div>
        {invitations.map(invitation => <div className="access-person" key={invitation.id}><Avatar person={invitation.invitedUser} /><div className="rooms-text"><strong>{invitation.invitedUser.name}</strong><span>{invitation.status === 'ACCEPTED' ? 'Playlist access accepted' : invitation.status === 'PENDING' ? 'Playlist invitation pending' : `Invitation ${invitation.status.toLowerCase()}`}</span></div>{['PENDING', 'ACCEPTED'].includes(invitation.status) ? <button type="button" className="access-remove-icon" aria-label={invitation.status === 'PENDING' ? `Cancel invitation for ${invitation.invitedUser.name}` : `Remove ${invitation.invitedUser.name}`} title={invitation.status === 'PENDING' ? 'Cancel invitation' : 'Remove access'} disabled={disabled || dirty} onClick={() => setPendingRemoval(invitation)}><span aria-hidden="true">{invitation.status === 'PENDING' ? '×' : '−'}</span></button> : null}</div>)}
        {!invitations.length ? <p className="rooms-note">No invitations on this page.</p> : null}
        <div className="rooms-pages">{page > 1 ? <button className="rooms-back" disabled={disabled || dirty} onClick={() => setPage(value => value - 1)}>Previous</button> : null}<span className="rooms-note">Page {page}</span>{invitations.length === PAGE_SIZE ? <button className="rooms-back" disabled={disabled || dirty} onClick={() => setPage(value => value + 1)}>Next</button> : null}</div>
      </section>
      {dirty ? <button className="rooms-outline rooms-main" disabled={busy} onClick={save}>{stagedInvites.length ? 'Save access & invitations' : 'Save access settings'}</button> : null}
      {notice ? <p className="auth-success" role="status">{notice}</p> : null}
    </> : null}
    {pendingRemoval ? <ConfirmDialog title="Remove invitation?" message={`Remove ${pendingRemoval.invitedUser.name}'s playlist access? They will no longer be able to access this playlist.`} confirmLabel="Remove invitation" destructive onCancel={() => setPendingRemoval(null)} onConfirm={() => remove(pendingRemoval)} /> : null}
  </section>;
}
