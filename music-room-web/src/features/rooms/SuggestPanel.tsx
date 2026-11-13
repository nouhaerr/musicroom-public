import { ArrowIcon } from '../../components/ui/ArrowIcon';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiClient } from '../../api/contract';
import { partiesApi, type QueueEntry } from './parties';
import { songsApi, type CatalogTrack } from './songs';
import { useAutoDismiss } from './helpers';
import { Icon } from './icons';

const SEARCH_DELAY_MS = 400; // the search starts once the typing stops for this long

// Find songs in the catalog and add them to the party's queue. Drawn by the room page, which hands it the live queue.
export function SuggestPanel({ client, partyId, queue, onBack }: {
  client: ApiClient; partyId: string; queue: QueueEntry[]; onBack: () => void;
}) {
  const parties = useMemo(() => partiesApi(client), [client]);
  const songs = useMemo(() => songsApi(client), [client]);
  const [text, setText] = useState('');
  const [results, setResults] = useState<CatalogTrack[] | null>(null); // the last search's answer; null while the box is empty
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useAutoDismiss(error, setError);
  const alive = useRef(false);
  const working = useRef(false);
  const query = text.trim();
  const queued = new Map(queue.map(entry => [entry.song.externalId, entry])); // the songs already in the queue, by catalog id

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Search once the typing stops. A new text, or closing the panel, cancels the waiting search and ignores a late answer.
  useEffect(() => {
    if (!query) { setResults(null); return; }
    let active = true;
    const timer = setTimeout(() => {
      void songs.search(query).then(found => { if (active) setResults(found); })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to search.'); });
    }, SEARCH_DELAY_MS);
    return () => { active = false; clearTimeout(timer); };
  }, [songs, query]);

  async function action(operation: () => Promise<unknown>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await operation(); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Unable to complete this action.'); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }

  return <section className="rooms">
    <button type="button" className="rooms-back" onClick={onBack}><ArrowIcon direction="left" /> Back to the room</button>
    <h1>Suggest a track</h1>
    <input className="rooms-search" type="search" aria-label="Search songs" placeholder="Search songs" maxLength={100} autoFocus
      value={text} onChange={event => setText(event.target.value)} />
    {error ? <p className="rooms-alert" role="alert">{error}</p> : null}
    {results?.length === 0 ? <p>No song found.</p> : null}
    <div className="rooms-list">{results?.map(track => {
      const entry = queued.get(track.externalId);
      return <div key={track.externalId} className="rooms-row">
        {track.coverUrl ? <img src={track.coverUrl} alt="" className="rooms-thumb" /> : <span className="rooms-thumb rooms-blank" />}
        <span className="rooms-text">
          <strong>{track.title}</strong>
          <span>{track.artist}</span>
          {entry ? <span className="rooms-note">Already in queue · {entry.voteCount} {entry.voteCount === 1 ? 'vote' : 'votes'}</span> : null}
        </span>
        <button type="button" className={`rooms-square${entry ? ' rooms-on' : ''}`} disabled={busy || !!entry}
          aria-label={entry ? `${track.title} is in the queue` : `Add ${track.title} to the queue`}
          onClick={() => void action(() => parties.suggest(partyId, track.externalId))}>
          <Icon name={entry ? 'check' : 'plus'} size={16} />
        </button>
      </div>;
    })}</div>
  </section>;
}
