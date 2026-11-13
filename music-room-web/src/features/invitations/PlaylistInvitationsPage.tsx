import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { client } from '../../api/instance';
import { Icon } from '../rooms/icons';
import '../rooms/rooms.css';
import './playlist-invitations.css';

type PlaylistInvitation = {
  id: string;
  status: 'PENDING' | 'ACCEPTED';
  createdAt: string;
  playlist: { id: string; name: string; visibility: 'PUBLIC' | 'PRIVATE' } | null;
  invitedBy: { id: string; name: string };
};

export function PlaylistInvitationsPage() {
  const [invitations, setInvitations] = useState<PlaylistInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    void client.request<PlaylistInvitation[]>('/invitations/me/playlists?page=1&limit=50')
      .then(setInvitations)
      .catch(e => setError(e instanceof Error ? e.message : 'Unable to load playlist invitations.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  function answer(invitation: PlaylistInvitation, accept: boolean) {
    setBusy(invitation.id);
    setError('');
    void client.request(`/invitations/${encodeURIComponent(invitation.id)}/${accept ? 'accept' : 'decline'}`, 'POST', {})
      .then(() => { setNotice(accept ? 'Playlist invitation accepted.' : 'Playlist invitation declined.'); load(); })
      .catch(e => setError(e instanceof Error ? e.message : 'Unable to answer the invitation.'))
      .finally(() => setBusy(''));
  }

  return <section className="rooms playlist-invitations">
    <p className="eyebrow">YOUR INVITATIONS</p>
    <h1>Playlist invitations</h1>
    <p className="rooms-note">Invitations to both public and private playlists appear here.</p>
    {error ? <div className="rooms-error" role="alert"><p>{error}</p><button type="button" className="rooms-outline" onClick={load}>Retry</button></div> : null}
    {notice ? <p className="auth-success" role="status">{notice}</p> : null}
    {loading ? <p className="rooms-loading" role="status">Loading invitations…</p> : null}
    {!loading && !invitations.length ? <div className="rooms-card-box invitation-empty"><Icon name="people" size={32} /><h2>No playlist invitations</h2><p>When someone invites you to a playlist, it will appear here.</p></div> : null}
    <div className="playlist-invitation-list">{invitations.map(invitation => invitation.playlist ? <article className="rooms-card-box playlist-invitation" key={invitation.id}>
      <div className="playlist-invitation-heading"><span className="rooms-blank playlist-invitation-art"><Icon name={invitation.playlist.visibility === 'PRIVATE' ? 'lock' : 'music'} size={24} /></span><div className="rooms-text"><strong>{invitation.playlist.name}</strong><span>{invitation.playlist.visibility === 'PRIVATE' ? 'Private playlist' : 'Public playlist'} · invited by {invitation.invitedBy.name}</span></div></div>
      {invitation.status === 'PENDING' ? <div className="playlist-invitation-actions"><button type="button" className="rooms-square" aria-label="Accept playlist invitation" title="Accept invitation" disabled={busy === invitation.id} onClick={() => answer(invitation, true)}>✓</button><button type="button" className="rooms-square" aria-label="Decline playlist invitation" title="Decline invitation" disabled={busy === invitation.id} onClick={() => answer(invitation, false)}>×</button></div> : <Link className="rooms-outline" to={`/playlists/${encodeURIComponent(invitation.playlist.id)}`}>Open playlist</Link>}
    </article> : null)}</div>
  </section>;
}
