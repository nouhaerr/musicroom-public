import { ArrowIcon } from '../../components/ui/ArrowIcon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, type ApiClient } from '../../api/contract';
import type { GoneReason, Live } from '../../realtime/live';
import { clock, partiesApi, progress, songSeconds, type PartySnapshot, type QueueEntry } from './parties';
import { currentPosition, playExtract, useAutoDismiss, useExtractPlayer } from './helpers';
import { Icon } from './icons';
import { SuggestPanel } from './SuggestPanel';
import './rooms.css';

// Why the page can no longer show the party, in words for the user
const GONE: Record<GoneReason, string> = {
  FORBIDDEN: 'You no longer have access to this party.',
  NOT_FOUND: 'This party no longer exists.',
  TOO_MANY_CONNECTIONS: 'Your account is open on too many devices.',
  UNAUTHORIZED: 'The server refused the live connection. Please log in again.',
  SIGNED_OUT: 'You are logged out.',
  BAD_REQUEST: 'Live updates are unavailable for this party.',
  TOO_MANY: 'Too many pages are open at once.',
};

// One room, live: what plays, the queue in vote order, the votes, Next for the owner, and the sound on the owner's computer
export function RoomPage({ client, live }: { client: ApiClient; live: Live }) {
  const { roomId: partyId = '' } = useParams();
  const api = useMemo(() => partiesApi(client), [client]);
  const [snapshot, setSnapshot] = useState<PartySnapshot | null>(null);
  const [gone, setGone] = useState<GoneReason | null>(null);
  const [voted, setVoted] = useState(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receivedAt, setReceivedAt] = useState(0); // when the last snapshot arrived, on this computer's clock
  const [now, setNow] = useState(Date.now());
  const [suggesting, setSuggesting] = useState(false); // the Suggest panel is open, drawn in place of the room
  const [locating, setLocating] = useState<string | null>(null); // the song whose vote waits for a position reading
  useAutoDismiss(error, setError);
  const alive = useRef(false);
  const working = useRef(false);
  const disabled = loading || busy || locating !== null;
  const byLocation = snapshot?.party.voteLicense === 'LOCATION_TIME';

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Watch the party while the page is open: each snapshot replaces what is shown
  useEffect(() => live.watchParty(partyId, {
    onSnapshot: received => {
      const at = Date.now();
      setSnapshot(received); setReceivedAt(at); setNow(at);
    },
    onGone: setGone,
  }), [live, partyId]);

  // Load which songs I voted for. The snapshot cannot tell: it is the same message for everyone.
  useEffect(() => {
    let active = true;
    setLoading(true);
    void api.myVotes(partyId).then(ids => { if (active) setVoted(ids); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load your votes.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, partyId]);

  // The progress bar follows the clock
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // The owner's computer is the party's speaker: it plays the extract of the song playing now, from where the server
  // clock is, and asks for the next song when the song's time is over. Only a new playback starts this again, not a vote.
  const player = useExtractPlayer();
  const playback = snapshot && snapshot.party.ownerId === client.user?.id ? snapshot.party.playbackVersion : null;
  useEffect(() => {
    if (playback === null || !snapshot?.party.nowPlaying) { player.pause(); return; }
    const songId = snapshot.party.nowPlaying.id;
    const durationMs = songSeconds(snapshot.party.nowPlaying.durationSec) * 1000;
    const elapsedMs = (snapshot.playingForMs ?? 0) + Date.now() - receivedAt;
    let current = true; // false once this playback is over: late answers then do nothing
    const next = () => {
      if (!current) return;
      void api.next(partyId, playback).catch(e => {
        // Already moved on, by the Next button or the owner's other device: the new song comes with the next snapshot
        if (!(e instanceof ApiError && e.status === 409) && alive.current) setError(e instanceof Error ? e.message : 'Unable to play the next song.');
      });
    };
    const timer = setTimeout(next, Math.max(durationMs - elapsedMs, 0));
    if (elapsedMs < durationMs) {
      // Without an extract, or when it cannot be loaded, the party goes on with the next song
      const skip = (message: string) => { if (!current) return; setError(message); clearTimeout(timer); next(); };
      void playExtract(player, client, songId, elapsedMs / 1000, () => current)
        .then(found => { if (!found) skip('No extract for this song.'); })
        .catch(() => { if (current) skip('Unable to play this song.'); });
    }
    return () => { current = false; clearTimeout(timer); player.pause(); };
  }, [playback]);

  async function action(operation: () => Promise<unknown>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await operation(); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Unable to complete this action.'); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  // A position reading someone waits for: the vote buttons wait, with the line "Finding your position…"
  async function locate(who: string) {
    setLocating(who);
    try { return await currentPosition(); }
    finally { if (alive.current) setLocating(null); }
  }
  function toggleVote(entry: QueueEntry) {
    const had = voted.has(entry.id);
    void action(async () => {
      try {
        if (had) await api.unvote(partyId, entry.id);
        else await api.vote(partyId, entry.id, byLocation ? await locate(entry.id) : undefined);
      } catch (e) {
        // The server is already where we wanted to go (voted from another device, or the vote is gone): only the mark was wrong
        if (!(e instanceof ApiError && e.status === (had ? 404 : 409))) throw e;
      }
      if (!alive.current) return;
      setVoted(current => {
        const updated = new Set(current);
        if (had) updated.delete(entry.id);
        else updated.add(entry.id);
        return updated;
      });
    });
  }

  if (gone) {
    return <section className="rooms">
      <p className="rooms-alert" role="alert">{GONE[gone]}</p>
      <Link to="/rooms" className="rooms-back"><ArrowIcon direction="left" /> Back to rooms</Link>
    </section>;
  }
  if (!snapshot) {
    return <section className="rooms">
      <Link to="/rooms" className="rooms-back"><ArrowIcon direction="left" /> Back to rooms</Link>
      <p className="rooms-loading" role="status">Connecting…</p>
    </section>;
  }
  if (suggesting) return <SuggestPanel client={client} partyId={partyId} queue={snapshot.queue} onBack={() => setSuggesting(false)} />;

  const { party, queue, queueLength } = snapshot;
  const playing = progress(snapshot, receivedAt, now);
  const owner = client.user?.id === party.ownerId;
  return <section className="rooms rooms-room">
    <Link to="/rooms" className="rooms-back"><ArrowIcon direction="left" /> Back to rooms</Link>
    <header>
      <h1>{party.name}</h1>
      <p>{party.visibility === 'PUBLIC' ? 'Public' : 'Private'}</p>
    </header>
    {error ? <p className="rooms-alert" role="alert">{error}</p> : null}

    <div className="rooms-room-grid">
      <div className="rooms-card-box">
        <p className="eyebrow">NOW PLAYING</p>
        {party.nowPlaying ? <div className="rooms-now">
          {party.nowPlaying.thumbnailUrl ? <img src={party.nowPlaying.thumbnailUrl} alt="" className="rooms-big-cover" /> : null}
          <span className="rooms-text"><strong className="rooms-title">{party.nowPlaying.title}</strong><span>{party.nowPlaying.artist}</span></span>
        </div> : <p>Nothing is playing yet.</p>}
        {playing ? <>
          <div className="rooms-track"><span style={{ width: `${(100 * playing.elapsedSec) / Math.max(playing.durationSec, 1)}%` }} /></div>
          <div className="rooms-between"><span>{clock(playing.elapsedSec)}</span><span>{clock(playing.durationSec)} preview</span></div>
        </> : null}
        {owner ? <button type="button" className="rooms-outline" disabled={busy} onClick={() => void action(() => api.next(partyId, party.playbackVersion))}>Next song</button> : null}
      </div>

      <div className="rooms-queue">
        <div className="rooms-between">
          <h2>Up next</h2>
          <span className="rooms-note">{queueLength} {queueLength === 1 ? 'track' : 'tracks'}</span>
        </div>
        {locating ? <p className="rooms-loading" role="status">Finding your position…</p> : null}
        {queue.length === 0 ? <p>No song is waiting.</p> : null}
        <div className="rooms-list">{queue.map((entry, index) => {
          const mine = voted.has(entry.id);
          return <div key={entry.id} className="rooms-row">
            <span className="rooms-rank">{String(index + 1).padStart(2, '0')}</span>
            {entry.song.thumbnailUrl ? <img src={entry.song.thumbnailUrl} alt="" className="rooms-thumb" /> : <span className="rooms-thumb rooms-blank" />}
            <span className="rooms-text">
              <strong>{entry.song.title}</strong>
              <span>{entry.song.artist}</span>
              {mine ? <span className="rooms-note">You voted</span> : null}
            </span>
            <button type="button" className={`rooms-vote${mine ? ' rooms-on' : ''}`} disabled={disabled} aria-pressed={mine}
              aria-label={`${mine ? 'Remove your vote for' : 'Vote for'} ${entry.song.title}`} onClick={() => toggleVote(entry)}>
              {locating === entry.id ? '…' : <Icon name={mine ? 'check' : 'up'} size={14} />}
              <span>{entry.voteCount}</span>
            </button>
          </div>;
        })}</div>
        <button type="button" className="rooms-outline" onClick={() => setSuggesting(true)}><Icon name="plus" size={16} /> Suggest a track</button>
      </div>
    </div>
  </section>;
}
