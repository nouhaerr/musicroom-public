import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ApiClient } from '../../api/contract';
import { PLAYLISTS_PAGE_SIZE, playlistsApi, type PlaylistCard } from './playlists';
import { Icon } from '../rooms/icons';
import { useListAddress } from '../rooms/useListAddress';
import '../rooms/rooms.css';

const CHIPS = [
  { filter: 'public', visibility: 'PUBLIC', label: 'Public', empty: 'No public playlists yet.' },
  { filter: 'private', visibility: 'PRIVATE', label: 'Private', empty: 'No private playlists yet. The ones you create or are invited to show here.' },
] as const;

// The Playlists tab: the playlists you may see, one chip at a time, found by name, and the way into one of them.
// Like the rooms, where you are lives in the address.
export function PlaylistsPage({ client }: { client: ApiClient }) {
  const api = useMemo(() => playlistsApi(client), [client]);
  const { filter, query, page, text, setText, go } = useListAddress(CHIPS.map(each => each.filter));
  const chip = CHIPS.find(each => each.filter === filter)!;
  const [playlists, setPlaylists] = useState<{ filter: string; list: PlaylistCard[] } | null>(null); // null until the first answer
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0); // counts the "Try again"

  // Load a page of playlists; a late answer, for an older search or chip, is ignored
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void api.list(page, query, chip.visibility).then(found => { if (active) setPlaylists({ filter, list: found }); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load the playlists.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, page, query, filter, reload]);

  const shown = playlists?.filter === filter ? playlists.list : null; // another chip's playlists are never shown under this one
  return <section className="rooms">
    <header className="rooms-header">
      <div>
        <p className="eyebrow">YOUR PLAYLISTS</p>
        <h1>Made together.</h1>
      </div>
      <Link to="/playlists/new" className="rooms-create"><Icon name="plus" /> Create a playlist</Link>
    </header>

    <input className="rooms-search" type="search" aria-label="Search playlists" placeholder="Search playlists" maxLength={100}
      value={text} onChange={event => setText(event.target.value)} />
    <div className="rooms-chips" role="tablist" aria-label="Kind of playlist">
      {CHIPS.map(each => <button key={each.filter} type="button" role="tab" aria-selected={filter === each.filter}
        onClick={() => go({ filter: each.filter, page: 1 })}>{each.label}</button>)}
    </div>

    {error ? <div className="rooms-error" role="alert"><p>{error}</p>
      <button type="button" className="rooms-outline" onClick={() => setReload(n => n + 1)}>Try again</button></div> : null}
    {shown === null ? (loading ? <p className="rooms-loading" role="status">Loading the playlists…</p> : null) : <>
      {shown.length === 0 && !loading ? <p>{query ? 'No playlist matches this search.' : chip.empty}</p> : null}
      <div className="rooms-grid">{shown.map(playlist =>
        <Link key={playlist.id} to={`/playlists/${encodeURIComponent(playlist.id)}`} className="rooms-card" aria-label={`Open ${playlist.name}`}>
          {playlist.cover ? <img src={playlist.cover} alt="" className="rooms-cover" />
            : <span className="rooms-cover rooms-blank"><Icon name={playlist.visibility === 'PRIVATE' ? 'lock' : 'music'} /></span>}
          <span className="rooms-text">
            <strong>{playlist.name}</strong>
            <span>{playlist.songsCount} {playlist.songsCount === 1 ? 'track' : 'tracks'} · by {playlist.owner.id === client.user?.id ? 'you' : playlist.owner.name}</span>
            <span className="rooms-playing">{playlist.visibility === 'PUBLIC' ? 'Public' : 'Private'} · {playlist.editLicense === 'OWNER_ONLY' ? 'Owner edits' : playlist.editLicense === 'EVERYONE' ? 'Everyone edits' : 'Invitees edit'}</span>
          </span>
          <Icon name="chevron" size={16} />
        </Link>)}</div>
      {page > 1 || shown.length === PLAYLISTS_PAGE_SIZE ? <div className="rooms-pages">
        <button type="button" className="rooms-outline" disabled={page === 1 || loading} onClick={() => go({ page: page - 1 })}>Previous</button>
        <button type="button" className="rooms-outline" disabled={shown.length < PLAYLISTS_PAGE_SIZE || loading} onClick={() => go({ page: page + 1 })}>Next</button>
      </div> : null}
    </>}
  </section>;
}
