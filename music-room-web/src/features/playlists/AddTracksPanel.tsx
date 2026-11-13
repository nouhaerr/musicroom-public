import { ArrowIcon } from '../../components/ui/ArrowIcon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, type ApiClient } from '../../api/contract';
import { playlistsApi, type PlaylistEntry } from './playlists';
import { songsApi, type CatalogTrack } from '../rooms/songs';
import { useAutoDismiss } from '../rooms/helpers';
import { Icon } from '../rooms/icons';

const SEARCH_DELAY_MS = 400; // the search starts once the typing stops for this long

// Find songs in the catalog and add them at the end of the playlist. Drawn by the playlist page, which hands it the live songs.
export function AddTracksPanel({ client, playlistId, name, songs, onForbidden, onBack }: {
  client: ApiClient; playlistId: string; name: string; songs: PlaylistEntry[]; onForbidden: () => void; onBack: () => void;
}) {
  const playlists = useMemo(() => playlistsApi(client), [client]);
  const catalog = useMemo(() => songsApi(client), [client]);
  const [text, setText] = useState('');
  const [results, setResults] = useState<CatalogTrack[] | null>(null); // the last search's answer; null while the box is empty
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useAutoDismiss(error, setError);
  const alive = useRef(false);
  const working = useRef(false);
  const query = text.trim();
  const inPlaylist = new Set(songs.map(entry => entry.song.externalId)); // the songs already in the playlist, by catalog id

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Search once the typing stops. A new text, or closing the panel, cancels the waiting search and ignores a late answer.
  useEffect(() => {
    if (!query) { setResults(null); return; }
    let active = true;
    const timer = setTimeout(() => {
      void catalog.search(query).then(found => { if (active) setResults(found); })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to search.'); });
    }, SEARCH_DELAY_MS);
    return () => { active = false; clearTimeout(timer); };
  }, [catalog, query]);

  async function action(operation: () => Promise<unknown>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await operation(); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Unable to complete this action.'); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  function add(track: CatalogTrack) {
    void action(async () => {
      try { await playlists.add(playlistId, track.externalId); }
      catch (e) {
        if (e instanceof ApiError && e.status === 403) onForbidden(); // no longer allowed: the playlist page reloads what I may do
        throw e;
      }
    });
  }

  return <section className="rooms">
    <button type="button" className="rooms-back" onClick={onBack}><ArrowIcon direction="left" /> Back to {name}</button>
    <h1>Add tracks</h1>
    <input className="rooms-search" type="search" aria-label="Search songs" placeholder="Search songs" maxLength={100} autoFocus
      value={text} onChange={event => setText(event.target.value)} />
    {error ? <p className="rooms-alert" role="alert">{error}</p> : null}
    {results?.length === 0 ? <p>No song found.</p> : null}
    <div className="rooms-list">{results?.map(track => {
      const added = inPlaylist.has(track.externalId);
      return <div key={track.externalId} className="rooms-row">
        {track.coverUrl ? <img src={track.coverUrl} alt="" className="rooms-thumb" /> : <span className="rooms-thumb rooms-blank" />}
        <span className="rooms-text">
          <strong>{track.title}</strong>
          <span>{track.artist}</span>
          {added ? <span className="rooms-note">In the playlist</span> : null}
        </span>
        <button type="button" className="rooms-square" disabled={busy || added}
          aria-label={added ? `${track.title} is in the playlist` : `Add ${track.title}`} onClick={() => add(track)}>
          <Icon name={added ? 'check' : 'plus'} size={16} />
        </button>
      </div>;
    })}</div>
  </section>;
}
