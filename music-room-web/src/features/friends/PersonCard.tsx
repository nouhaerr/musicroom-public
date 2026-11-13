import type { ReactNode } from 'react';
import type { PublicProfile } from '../../api/profiles';

/** Shared by Discover, Friends and both kinds of pending requests. */
export function PersonCard({ person, disabled, onOpen, actions, caption }: {
  person: PublicProfile; disabled: boolean; onOpen: () => void; actions: ReactNode; caption?: string;
}) {
  const name = Array.from(person.name);
  return <article className="people-card discover-card">
    {caption && <p className="person-card-caption">{caption}</p>}
    <div className="discover-heading">
      <button className="person-identity" disabled={disabled} aria-label={`View ${person.name}'s profile`} onClick={onOpen}>
        <Avatar person={person} /><span><strong title={person.name}>{name.length > 12 ? name.slice(0, 12).join('') + '.' : person.name}</strong><small>{person.username ? '@' + person.username : 'Sonora listener'}</small></span>
      </button>
      <div className="discover-action">{actions}</div>
    </div>
    <Genres person={person} />
  </article>;
}
export function Avatar({ person }: { person: PublicProfile }) { const photo = person.publicInfo?.avatar; return <span className="person-avatar">{typeof photo === 'string' && photo ? <img src={photo} alt="" /> : person.name.slice(0, 2).toUpperCase()}</span>; }
export function Genres({ person }: { person: PublicProfile }) { return <div className="person-genres">{person.musicPreferences.length ? person.musicPreferences.map(g => <span key={g}>{g}</span>) : <p>No music preferences yet.</p>}</div>; }
export function FriendIcon({ state }: { state: 'add' | 'pending' | 'remove' | 'accept' | 'decline' }) {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{state === 'accept' ? <path d="m5 12 4 4L19 6" /> : state === 'decline' ? <path d="m6 6 12 12M6 18 18 6" /> : <><circle cx="8" cy="7" r="3" /><path d="M2 20v-2a6 6 0 0 1 12 0v2" />{state === 'pending' ? <><circle cx="18" cy="9" r="4" /><path d="M18 7v2l1.5 1" /></> : <><path d="M15 9h7" />{state === 'add' && <path d="M18.5 5.5v7" />}</>}</>}</svg>;
}
