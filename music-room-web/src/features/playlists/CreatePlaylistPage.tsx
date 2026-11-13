import { ArrowIcon } from '../../components/ui/ArrowIcon';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGlobe, faLock, faUserCheck, faUsers } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ApiClient } from '../../api/contract';
import { playlistsApi, type Playlist } from './playlists';
import { useAutoDismiss } from '../rooms/helpers';
import { FriendPicker } from '../rooms/FriendPicker';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import '../rooms/rooms.css';

// A new playlist: its name, who can find it, who can edit it, and the friends invited to it
export function CreatePlaylistPage({ client }: { client: ApiClient }) {
  const api = useMemo(() => playlistsApi(client), [client]);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [creationNotice, setCreationNotice] = useState<{ message: string; id: string } | null>(null);
  const [visibility, setVisibility] = useState<Playlist['visibility']>('PUBLIC');
  const [editLicense, setEditLicense] = useState<Playlist['editLicense']>('EVERYONE');
  const [invited, setInvited] = useState(new Map<string, string>()); // maps friend IDs to names
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useAutoDismiss(error, setError);
  const alive = useRef(false);
  const working = useRef(false);
  const inviting = visibility === 'PRIVATE' || editLicense === 'INVITED_ONLY'; // an invitation gives something only there

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function run(operation: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await operation(); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Unable to create the playlist.'); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  async function create() {
    const playlist = await api.create({ name: name.trim(), visibility, editLicense });
    // The playlist exists from here on: a failed invitation does not undo it. A hidden list of friends sends nothing.
    const guests = inviting ? [...invited] : [];
    const answers = await Promise.allSettled(guests.map(([userId]) => api.invite(playlist.id, userId)));
    const missed = guests.filter((_, index) => answers[index].status === 'rejected').map(([, friend]) => friend);
    if (!alive.current) return;
    if (missed.length > 0) { setCreationNotice({ message: `These friends could not be invited: ${missed.join(', ')}.`, id: playlist.id }); return; }
    navigate(`/playlists/${encodeURIComponent(playlist.id)}`, { replace: true }); // Back then returns to the list, not to this form
  }

  const choice = (selected: boolean, icon: IconDefinition, title: string, text: string, onChoose: () => void, disabled = false) =>
    <button type="button" role="radio" aria-checked={selected} disabled={busy || disabled} onClick={onChoose} className={`rooms-choice${selected ? ' rooms-chosen' : ''}${disabled ? ' rooms-choice-disabled' : ''}`}>
      <FontAwesomeIcon icon={icon} aria-hidden="true" /><span className="rooms-choice-copy"><strong>{title}</strong><span>{text}</span></span>
    </button>;

  return <section className="rooms rooms-form">{creationNotice ? <ConfirmDialog title="Playlist created" message={creationNotice.message} confirmLabel="Continue" cancelLabel={null} onCancel={() => navigate(`/playlists/${encodeURIComponent(creationNotice.id)}`, { replace: true })} onConfirm={() => navigate(`/playlists/${encodeURIComponent(creationNotice.id)}`, { replace: true })} /> : null}
    <Link to="/playlists" className="rooms-back"><ArrowIcon direction="left" /> Back to playlists</Link>
    <h1>Create a playlist</h1>
    {error ? <p className="rooms-alert" role="alert">{error}</p> : null}
    <label className="rooms-field">Playlist name
      <input value={name} maxLength={100} onChange={event => setName(event.target.value)} />
    </label>

    <div className="playlist-access-grid">
      <section className="playlist-access-group">
        <h2>Who can find it?</h2>
        <div className="rooms-choices" role="radiogroup" aria-label="Who can find it">
          {choice(visibility === 'PUBLIC', faGlobe, 'Public · default', 'Anyone can discover and listen.', () => setVisibility('PUBLIC'))}
          {choice(visibility === 'PRIVATE', faLock, 'Private', 'Only invited people can access.', () => { setVisibility('PRIVATE'); if (editLicense === 'EVERYONE') setEditLicense('OWNER_ONLY'); })}
        </div>
      </section>
      <section className="playlist-access-group">
        <h2>Who can edit?</h2>
        <div className="rooms-choices" role="radiogroup" aria-label="Who can edit">
          {choice(editLicense === 'EVERYONE', faUsers, 'Everyone with access', 'Anyone who can see it can add, reorder and remove tracks.', () => setEditLicense('EVERYONE'), visibility === 'PRIVATE')}
          {choice(editLicense === 'OWNER_ONLY', faUserCheck, 'Only me', 'Invited people can listen, but only you can edit.', () => setEditLicense('OWNER_ONLY'))}
          {choice(editLicense === 'INVITED_ONLY', faUserCheck, 'Invited people only', 'Only invited people who accept can edit.', () => setEditLicense('INVITED_ONLY'))}
        </div>
      </section>
    </div>

    {inviting ? <>
      <h2>Invite your circle</h2>
      <FriendPicker client={client} picked={invited} onChange={setInvited} disabled={busy} />
    </> : null}
    <button type="button" className="rooms-outline rooms-main" disabled={busy || !name.trim()} onClick={() => void run(create)}>
      {visibility === 'PUBLIC' ? 'Create public playlist' : 'Create private playlist'}
    </button>
  </section>;
}
