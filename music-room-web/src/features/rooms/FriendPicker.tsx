import { useEffect, useState } from 'react';
import type { ApiClient } from '../../api/contract';

const PAGE_SIZE = 20;
type Friend = { id: string; name: string; username: string | null };

// Your friends, each with a box to tick, page by page. The ticked friends survive a change of page: the page that uses
// this keeps them, by id with their name.
export function FriendPicker({ client, picked, onChange, disabled }: {
  client: ApiClient; picked: Map<string, string>; onChange: (picked: Map<string, string>) => void; disabled: boolean;
}) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void client.request<Friend[]>(`/friends?page=${page}&limit=${PAGE_SIZE}`).then(found => { if (active) setFriends(found); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load your friends.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, page]);

  function toggle(friend: Friend) {
    const updated = new Map(picked);
    if (updated.has(friend.id)) updated.delete(friend.id);
    else updated.set(friend.id, friend.name);
    onChange(updated);
  }

  if (loading) return <p className="rooms-loading" role="status">Loading your friends…</p>;
  if (error) return <p className="rooms-alert" role="alert">{error}</p>;
  if (page === 1 && friends.length === 0) return <p>No friends yet. Add some from the People page.</p>;
  return <div className="rooms-friends">
    {friends.map(friend => <label key={friend.id} className="rooms-friend">
      <input type="checkbox" checked={picked.has(friend.id)} disabled={disabled} onChange={() => toggle(friend)} />
      <span className="rooms-text"><strong>{friend.name}</strong>{friend.username ? <span>@{friend.username}</span> : null}</span>
    </label>)}
    {page > 1 || friends.length === PAGE_SIZE ? <div className="rooms-pages">
      <button type="button" className="rooms-outline" disabled={page === 1} onClick={() => setPage(n => n - 1)}>Previous</button>
      <button type="button" className="rooms-outline" disabled={friends.length < PAGE_SIZE} onClick={() => setPage(n => n + 1)}>Next</button>
    </div> : null}
  </div>;
}
