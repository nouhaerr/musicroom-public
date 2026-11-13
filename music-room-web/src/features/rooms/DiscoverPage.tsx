import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ApiClient } from '../../api/contract';
import { ROOMS_PAGE_SIZE, partiesApi, progress, type PartyCard, type RoomFilter } from './parties';
import { Icon } from './icons';
import { useListAddress } from './useListAddress';
import './rooms.css';

const CHIPS: { filter: RoomFilter; label: string; empty: string }[] = [
  { filter: 'public', label: 'Public', empty: 'No public rooms yet. Create the first one!' },
  { filter: 'private', label: 'Private', empty: 'No private rooms yet. The ones you create or are invited to show here.' },
  { filter: 'location', label: 'Location & time', empty: 'No location & time rooms yet.' },
];

// The Rooms tab: the rooms you may see, one chip at a time, found by name, and the way into one of them or into a new one.
// Where you are (chip, search, page) lives in the address: Back from a room comes back here, and a list can be bookmarked.
export function DiscoverPage({ client }: { client: ApiClient }) {
  const api = useMemo(() => partiesApi(client), [client]);
  const { filter, query, page, text, setText, go } = useListAddress(CHIPS.map(each => each.filter));
  const [rooms, setRooms] = useState<{ filter: RoomFilter; list: PartyCard[] } | null>(null); // null until the first answer
  const [receivedAt, setReceivedAt] = useState(0); // when the rooms arrived, on this computer's clock
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0); // counts the "Try again"

  // Load a page of rooms; a late answer, for an older search or chip, is ignored
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void api.list(page, query, filter).then(found => {
      if (!active) return;
      const at = Date.now();
      setRooms({ filter, list: found }); setReceivedAt(at); setNow(at);
    })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load the rooms.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, page, query, filter, reload]);

  // The cards follow the clock, so a song turns to "Last played" when its time runs out
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const firstName = client.user?.name.trim().split(/\s+/)[0] ?? '';
  const chip = CHIPS.find(each => each.filter === filter)!;
  const shown = rooms?.filter === filter ? rooms.list : null; // another chip's rooms are never shown under this one
  return <section className="rooms">
    <header className="rooms-header">
      <div>
        <p className="eyebrow">TONIGHT IS YOURS{firstName ? `, ${firstName.toUpperCase()}` : ''}</p>
        <h1>Discover</h1>
      </div>
      <Link to="/rooms/new" className="rooms-create"><Icon name="plus" /> Create a room</Link>
    </header>

    <input className="rooms-search" type="search" aria-label="Search rooms" placeholder="Search rooms" maxLength={100}
      value={text} onChange={event => setText(event.target.value)} />
    <div className="rooms-chips" role="tablist" aria-label="Kind of room">
      {CHIPS.map(each => <button key={each.filter} type="button" role="tab" aria-selected={filter === each.filter}
        onClick={() => go({ filter: each.filter, page: 1 })}>{each.label}</button>)}
    </div>

    {error ? <div className="rooms-error" role="alert"><p>{error}</p>
      <button type="button" className="rooms-outline" onClick={() => setReload(n => n + 1)}>Try again</button></div> : null}
    {shown === null ? (loading ? <p className="rooms-loading" role="status">Loading the rooms…</p> : null) : <>
      {shown.length === 0 && !loading ? <p>{query ? 'No room matches this search.' : chip.empty}</p> : null}
      <div className="rooms-grid">{shown.map(room => <RoomCard key={room.id} room={room} you={client.user?.id} receivedAt={receivedAt} now={now} />)}</div>
      {page > 1 || shown.length === ROOMS_PAGE_SIZE ? <div className="rooms-pages">
        <button type="button" className="rooms-outline" disabled={page === 1 || loading} onClick={() => go({ page: page - 1 })}>Previous</button>
        <button type="button" className="rooms-outline" disabled={shown.length < ROOMS_PAGE_SIZE || loading} onClick={() => go({ page: page + 1 })}>Next</button>
      </div> : null}
    </>}
  </section>;
}

// One room in the list. The server's measure plus the time since the list arrived: a song whose time is over is the last one played
function RoomCard({ room, you, receivedAt, now }: { room: PartyCard; you?: string; receivedAt: number; now: number }) {
  const playing = progress({ party: room, playingForMs: room.playingForMs }, receivedAt, now);
  const over = playing !== null && playing.elapsedSec >= playing.durationSec;
  return <Link to={`/rooms/${encodeURIComponent(room.id)}`} className="rooms-card" aria-label={`Open ${room.name}`}>
    {room.nowPlaying?.thumbnailUrl ? <img src={room.nowPlaying.thumbnailUrl} alt="" className="rooms-cover" />
      : <span className="rooms-cover rooms-blank"><Icon name={room.visibility === 'PRIVATE' ? 'lock' : 'music'} /></span>}
    <span className="rooms-text">
      <strong>{room.name}</strong>
      <span>Hosted by {room.owner.id === you ? 'you' : room.owner.name}</span>
      <span className="rooms-playing">{room.nowPlaying ? `${over ? 'Last played' : 'Now playing'} · ${room.nowPlaying.title} — ${room.nowPlaying.artist}` : 'Nothing playing yet'}</span>
    </span>
    <Icon name="chevron" size={16} />
  </Link>;
}
