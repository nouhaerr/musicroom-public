import { ArrowIcon } from '../../components/ui/ArrowIcon';
import { PersonCard, Avatar, Genres, FriendIcon } from './PersonCard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { socialApi } from '../../api/social';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PAGE_SIZE, visibleProfileSections, type PublicProfile, type FriendRequest } from '../../api/profiles';
import './friends.css';

type Tab = 'friends' | 'requests' | 'search';
const labels: Record<Tab, string> = { friends: 'Friends', requests: 'Requests', search: 'Discover' };
export function FriendsPage() {
  const { client, user } = useAuth();
  const api = useMemo(() => socialApi(client), [client]);
  const [tab, setTab] = useState<Tab>('friends');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('');
  const [filters, setFilters] = useState({ query: '', genre: '' });
  const [rows, setRows] = useState<(PublicProfile | FriendRequest)[]>([]);
  const [selected, setSelected] = useState<PublicProfile | null>(null);
  const [friendToRemove, setFriendToRemove] = useState<PublicProfile | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const alive = useRef(false);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState({ message: '', error: false });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!feedback.message) return; const timer = setTimeout(() => setFeedback({ message: '', error: false }), 10000); return () => clearTimeout(timer); }, [feedback]);
  useEffect(() => {
    let active = true;
    if (!user) return;
    setLoading(true); setLoadError('');
    const request = tab === 'friends' ? api.friends(page) : tab === 'requests' ? api.pending(page) : api.search(filters.query, filters.genre, page);
    void request.then(result => { if (active) setRows(result); }).catch(e => { if (active) setLoadError(e instanceof Error ? e.message : 'Unable to load people.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, user?.id, tab, page, filters, reload]);
  if (!user) return <Navigate to="/auth/login" replace />;
  const disabled = busy || loading;
  async function action(operation: () => Promise<void>) {
    if (working.current || loading) return;
    working.current = true; setBusy(true); setFeedback({ message: '', error: false });
    try { await operation(); } catch (e) { if (alive.current) setFeedback({ message: e instanceof Error ? e.message : 'Please try again.', error: true }); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  function refresh(message: string, keepProfile = false) {
    if (!alive.current) return;
    if (!keepProfile) setSelected(null);
    setFeedback({ message, error: false });
    if (rows.length === 1 && page > 1) setPage(p => p - 1);
    else setReload(n => n + 1);
  }
  function updateSelectedRelationship(relationship: NonNullable<PublicProfile['relationship']>, friendRequestId: string | null = null) {
    setSelected(current => current ? { ...current, relationship, friendRequestId } : current);
  }
  function confirmRemoveFriend() {
    const person = friendToRemove;
    setFriendToRemove(null);
    if (person) void action(async () => { await api.remove(person.id); refresh('Friend removed.'); });
  }
  function changeTab(next: Tab) { setRows([]); setSelected(null); setPage(1); setTab(next); setFeedback({ message: '', error: false }); }
  const incoming = (id: string) => <div className="people-actions"><button disabled={disabled} aria-label="Accept friend request" title="Accept request" onClick={() => void action(async () => { await api.accept(id); updateSelectedRelationship('FRIENDS'); refresh('Friend request accepted.', true); })}><FriendIcon state="accept" /></button><button className="muted-action" disabled={disabled} aria-label="Decline friend request" title="Decline request" onClick={() => void action(async () => { await api.reject(id); updateSelectedRelationship('NONE'); refresh('Friend request declined.', true); })}><FriendIcon state="decline" /></button></div>;
  const pending = (id: string) => <button className="muted-action" disabled={disabled} aria-label="Cancel friend request" title="Cancel friend request" onClick={() => void action(async () => { await api.cancel(id); updateSelectedRelationship('NONE'); refresh('Friend request cancelled.', true); })}><FriendIcon state="pending" /></button>;
  const relationship = (person: PublicProfile) => {
    if (tab === 'friends' || person.relationship === 'FRIENDS') return <button className="muted-action" disabled={disabled} aria-label={`Remove ${person.name} from friends`} title="Remove friend" onClick={() => setFriendToRemove(person)}><FriendIcon state="remove" /></button>;
    if (person.relationship === 'OUTGOING' && person.friendRequestId) return pending(person.friendRequestId);
    if (person.relationship === 'INCOMING' && person.friendRequestId) return incoming(person.friendRequestId);
    return <button disabled={disabled} aria-label={`Add ${person.name} as a friend`} title="Add friend" onClick={() => void action(async () => { const result = await api.send(person.id); const isFriend = result.status === 'ACCEPTED'; updateSelectedRelationship(isFriend ? 'FRIENDS' : 'OUTGOING', isFriend ? null : result.id); refresh(isFriend ? 'You are now friends.' : 'Friend request sent.', true); })}><FriendIcon state="add" /></button>;
  };
  const openProfile = (person: PublicProfile) => void action(async () => { const profile = await api.profile(person.id); if (alive.current) setSelected({ ...person, ...profile }); });
  const visible = rows.filter(row => tab === 'requests' || row.id !== user.id);
  return <section className="people-page">{friendToRemove ? <ConfirmDialog title="Remove friend?" message={`${friendToRemove.name} will no longer have access to your friends-only information.`} confirmLabel="Remove friend" destructive onCancel={() => setFriendToRemove(null)} onConfirm={confirmRemoveFriend} /> : null}<p className="eyebrow">FRIENDS & DISCOVERY</p><h1>Find your people.</h1><p className="people-subtitle">Good music brings us together.</p>
    {feedback.message && <div className={'people-feedback ' + (feedback.error ? 'auth-error' : 'auth-success')} role={feedback.error ? 'alert' : 'status'}>{feedback.message}<button aria-label="Dismiss message" onClick={() => setFeedback({ message: '', error: false })}>×</button></div>}
    {selected ? <><button className="people-back" disabled={busy} onClick={() => setSelected(null)}><ArrowIcon direction="left" /> Back to people</button><div className="person-profile"><section className="people-card"><div className="person-heading"><Avatar person={selected} /><div className="person-heading-copy"><h2>{selected.name}</h2>{selected.username && <p>@{selected.username}</p>}</div><div className="person-profile-action">{relationship(selected)}</div></div><p className="eyebrow">MUSIC DNA</p><Genres person={selected} /></section><div>{visibleProfileSections(selected).map(section => { const entries = Object.entries(section.info ?? {}).filter(([key, value]) => !['avatar', 'username', 'shareListeningActivity'].includes(key) && typeof value === 'string' && value); return <section className="people-card" key={section.title}><h2>{section.title}</h2>{entries.length ? entries.map(([key, value]) => <div className="person-field" key={key}><span>{({ bio: 'Bio', city: 'City', favoriteArtists: 'Favorite artists' } as Record<string, string>)[key] ?? key}</span><p>{String(value)}</p></div>) : <p>No information shared yet.</p>}</section>; })}{!Object.hasOwn(selected, 'friendsOnlyInfo') && <p className="people-info">Friends-only details are shared after a friend request is accepted.</p>}</div></div></> : <>
    <div className="people-tabs" aria-label="People filters">{(Object.keys(labels) as Tab[]).map(key => <button key={key} disabled={busy} aria-pressed={tab === key} onClick={() => changeTab(key)}>{labels[key]}</button>)}</div>
    {tab === 'search' ? <form className="people-search people-card" onSubmit={e => { e.preventDefault(); setFilters({ query: query.trim(), genre: genre.trim().toLowerCase() }); setPage(1); }}><div><h2>A shared taste in music.</h2><p>Find listeners by name, username or favorite genre.</p></div><label>Name or username<div className="people-search-input"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></svg><input value={query} onChange={e => setQuery(e.target.value)} maxLength={100} placeholder="Search people" />{query && <button type="button" className="people-search-clear" aria-label="Clear name or username" title="Clear name or username" onClick={() => setQuery('')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>}</div></label><label>Music genre · optional<div className="people-search-input people-search-genre"><input value={genre} onChange={e => setGenre(e.target.value)} maxLength={50} placeholder="e.g. jazz" />{genre && <button type="button" className="people-search-clear" aria-label="Clear music genre" title="Clear music genre" onClick={() => setGenre('')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>}</div></label><button type="submit" disabled={busy}>Find people <ArrowIcon direction="up-right" /></button></form> : <p className="people-info">{tab === 'friends' ? 'Your circle. Your shared love of music.' : 'Accept an invitation or manage the requests you have sent.'}</p>}
    <div className="people-list-heading"><h2>{tab === 'friends' ? 'Your friends' : tab === 'requests' ? 'Pending requests' : 'People to discover'}</h2><button disabled={disabled} onClick={() => setReload(n => n + 1)}>↻ Refresh</button></div>
    {loading && <p role="status">Loading people…</p>}{loadError && <div className="auth-error" role="alert">{loadError}<button onClick={() => setReload(n => n + 1)}>Retry</button></div>}
    {!loading && !loadError && !visible.length && <div className="people-empty"><span aria-hidden="true">♫</span><h2>{tab === 'friends' ? 'Build your circle.' : tab === 'requests' ? 'All caught up.' : 'No matches yet.'}</h2><p>{tab === 'friends' ? 'Find people and send your first friend request.' : tab === 'requests' ? 'No pending requests on this page.' : 'Try another name or music genre.'}</p>{tab === 'friends' && <button onClick={() => changeTab('search')}>Discover people <ArrowIcon direction="up-right" /></button>}</div>}
    <div className="people-grid">{visible.map(row => {
      if (tab === 'requests') {
        const request = row as FriendRequest;
        const received = request.receiverId === user.id;
        const person: PublicProfile = { ...(received ? request.sender : request.receiver), relationship: received ? 'INCOMING' : 'OUTGOING', friendRequestId: request.id };
        return <PersonCard key={request.id} person={person} disabled={disabled} onOpen={() => openProfile(person)} caption={received ? 'RECEIVED REQUEST' : 'SENT REQUEST'} actions={received ? incoming(request.id) : pending(request.id)} />;
      }
      const person = row as PublicProfile;
      return <PersonCard key={person.id} person={person} disabled={disabled} onOpen={() => openProfile(person)} actions={relationship(person)} />;
    })}</div>
    {(page > 1 || rows.length >= PAGE_SIZE) && <div className="people-pagination"><button disabled={disabled || page === 1} onClick={() => setPage(p => p - 1)}><ArrowIcon direction="left" /> Previous</button><span>Page {page}</span><button disabled={disabled || rows.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>Next <ArrowIcon direction="right" /></button></div>}
    </>}
  </section>;
}
