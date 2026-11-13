import { ArrowIcon } from '../../components/ui/ArrowIcon';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCrosshairs, faGlobe, faLocationDot, faLock, faUserCheck, faUsers } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ApiClient } from '../../api/contract';
import { partiesApi, votingWindow, type Party, type Position } from './parties';
import { currentPosition, useAutoDismiss } from './helpers';
import { FriendPicker } from './FriendPicker';
import { VenueMap } from './VenueMap';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import './rooms.css';

const RADII = [100, 200, 500]; // meters around the venue
const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; // as a date field writes it
const timeOf = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`; // as a time field writes it

// The next full hour, e.g. 21:00 at 20:14: the default start of the voting hours
function nextFullHour() {
  const hour = new Date();
  hour.setHours(hour.getHours() + 1, 0, 0, 0);
  return hour;
}

// A new room: its name, who can find it, who can vote (with the venue and the hours for "Location & time"), and the
// friends invited to it
export function CreateRoomPage({ client }: { client: ApiClient }) {
  const api = useMemo(() => partiesApi(client), [client]);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Party['visibility']>('PUBLIC');
  const [voteLicense, setVoteLicense] = useState<Party['voteLicense']>('EVERYONE');
  const [pin, setPin] = useState<Position | null>(null);
  const [radius, setRadius] = useState(200);
  const [day, setDay] = useState(() => dayOf(nextFullHour())); // the day of the next full hour: 23:30 starts tomorrow
  const [from, setFrom] = useState(() => timeOf(nextFullHour()));
  const [until, setUntil] = useState(() => timeOf(new Date(nextFullHour().getTime() + 3 * 3_600_000)));
  const [locating, setLocating] = useState(false); // a position reading the page waits for
  const [invited, setInvited] = useState(new Map<string, string>()); // maps friend IDs to names
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creationNotice, setCreationNotice] = useState<{ message: string; id: string } | null>(null);
  useAutoDismiss(error, setError);
  const alive = useRef(false);
  const working = useRef(false);
  const byLocation = voteLicense === 'LOCATION_TIME';
  const inviting = visibility === 'PRIVATE' || voteLicense === 'INVITED_ONLY'; // an invitation gives something only there
  // The fields give text; a missing value (a cleared field) leaves the hours unknown, and the room cannot be created
  const hours = day && from && until ? votingWindow(new Date(`${day}T00:00`), new Date(`2000-01-01T${from}`), new Date(`2000-01-01T${until}`)) : null;
  const nextDay = hours !== null && new Date(hours.voteEndsAt).getDate() !== new Date(hours.voteStartsAt).getDate();

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Choosing "Location & time" puts the pin where the computer is, unless the user already placed it.
  // Quietly: if the position cannot be read, the user clicks the map instead.
  useEffect(() => {
    if (!byLocation) return;
    let active = true;
    void locate().then(found => { if (active) setPin(current => current ?? found); }).catch(() => {});
    return () => { active = false; };
  }, [byLocation]);

  async function run(operation: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await operation(); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Unable to create the room.'); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }

  // A position reading the page waits for: the line "Finding your position…" shows meanwhile
  async function locate() {
    setLocating(true);
    try { return await currentPosition(); }
    finally { if (alive.current) setLocating(false); }
  }

  async function create() {
    if (byLocation && hours && new Date(hours.voteEndsAt) <= new Date()) throw new Error('These hours are already over. Choose later hours.');
    const party = await api.create({
      name: name.trim(), visibility, voteLicense,
      ...(byLocation && pin && hours ? { ...pin, radiusMeters: radius, ...hours } : {}),
    });
    // The party exists from here on: a failed invitation does not undo it. Like the hidden map, a hidden list sends nothing.
    const guests = inviting ? [...invited] : [];
    const answers = await Promise.allSettled(guests.map(([userId]) => api.invite(party.id, userId)));
    const missed = guests.filter((_, index) => answers[index].status === 'rejected').map(([, friend]) => friend);
    if (!alive.current) return;
    if (missed.length > 0) { setCreationNotice({ message: `These friends could not be invited: ${missed.join(', ')}.`, id: party.id }); return; }
    navigate(`/rooms/${encodeURIComponent(party.id)}`, { replace: true }); // Back then returns to the list, not to this form
  }

  const choice = (selected: boolean, icon: IconDefinition, title: string, text: string, onChoose: () => void) =>
    <button type="button" role="radio" aria-checked={selected} disabled={busy} onClick={onChoose} className={`rooms-choice${selected ? ' rooms-chosen' : ''}`}>
      <FontAwesomeIcon icon={icon} aria-hidden="true" /><span className="rooms-choice-copy"><strong>{title}</strong><span>{text}</span></span>
    </button>;
  const ready = name.trim().length > 0 && (!byLocation || (pin !== null && hours !== null));

  return <section className="rooms rooms-form">{creationNotice ? <ConfirmDialog title="Room created" message={creationNotice.message} confirmLabel="Continue" cancelLabel={null} onCancel={() => navigate(`/rooms/${encodeURIComponent(creationNotice.id)}`, { replace: true })} onConfirm={() => navigate(`/rooms/${encodeURIComponent(creationNotice.id)}`, { replace: true })} /> : null}
    <Link to="/rooms" className="rooms-back"><ArrowIcon direction="left" /> Back to rooms</Link>
    <h1>Create a room</h1>
    {error ? <p className="rooms-alert" role="alert">{error}</p> : null}
    <label className="rooms-field">Room name
      <input value={name} maxLength={100} onChange={event => setName(event.target.value)} />
    </label>

    <h2>Who can find it?</h2>
    <div className="rooms-choices" role="radiogroup" aria-label="Who can find it">
      {choice(visibility === 'PUBLIC', faGlobe, 'Public', 'Anyone can discover your room.', () => setVisibility('PUBLIC'))}
      {choice(visibility === 'PRIVATE', faLock, 'Private', 'Only invited people can find it and vote.', () => setVisibility('PRIVATE'))}
    </div>

    <h2>Who can vote?</h2>
    <div className="rooms-choices" role="radiogroup" aria-label="Who can vote">
      {choice(voteLicense === 'EVERYONE', faUsers, 'Everyone', 'Everyone who can see the room.', () => setVoteLicense('EVERYONE'))}
      {choice(voteLicense === 'INVITED_ONLY', faUserCheck, 'Invited people only', 'Only your guest list.', () => setVoteLicense('INVITED_ONLY'))}
      {choice(byLocation, faLocationDot, 'Location & time', 'People at your venue during your event.', () => setVoteLicense('LOCATION_TIME'))}
    </div>

    {byLocation ? <div className="rooms-card-box">
      <strong>Venue</strong>
      <VenueMap pin={pin} radius={radius} onPin={setPin} />
      {locating ? <p className="rooms-loading" role="status">Finding your position…</p> : pin ? null : <p>Click the map to place the venue.</p>}
      <button type="button" className="rooms-outline" disabled={busy || locating}
        onClick={() => void run(async () => { const here = await locate(); if (alive.current) setPin(here); })}><FontAwesomeIcon icon={faCrosshairs} aria-hidden="true" /> Use my current position</button>
      <strong>Voting radius</strong>
      <div className="rooms-chips" role="radiogroup" aria-label="Voting radius">{RADII.map(meters =>
        <button key={meters} type="button" role="radio" aria-checked={radius === meters} aria-selected={radius === meters} disabled={busy}
          onClick={() => setRadius(meters)}>{meters} m</button>)}</div>
      <strong>Hours</strong>
      <div className="rooms-hours">
        <label className="rooms-field">Date<input type="date" value={day} min={dayOf(new Date())} disabled={busy} onChange={event => setDay(event.target.value)} /></label>
        <label className="rooms-field">From<input type="time" value={from} disabled={busy} onChange={event => setFrom(event.target.value)} /></label>
        <label className="rooms-field">Until{nextDay ? ' (next day)' : ''}<input type="time" value={until} disabled={busy} onChange={event => setUntil(event.target.value)} /></label>
      </div>
    </div> : null}

    {inviting ? <>
      <h2>Invite your circle</h2>
      <FriendPicker client={client} picked={invited} onChange={setInvited} disabled={busy} />
    </> : null}

    {byLocation && !pin && !locating ? <p>Place the venue on the map to create the room.</p> : null}
    <button type="button" className="rooms-outline rooms-main" disabled={busy || !ready} onClick={() => void run(create)}>
      {visibility === 'PUBLIC' ? 'Create public room' : 'Create private room'}
    </button>
  </section>;
}
