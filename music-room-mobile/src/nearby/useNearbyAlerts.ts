import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { ApiClient } from '../api/client';
import { nearby } from './load';

// What the app does around "rooms nearby": a tapped notification opens its room, the venues are read again while
// someone is signed in, and a logout stops the watching (the next account decides for itself). Nothing in Expo Go.
export function useNearbyAlerts(client: ApiClient | null, userId: string | null, openRoom: (partyId: string) => void) {
  // A tap on a notification opens its room, also when the tap started the app
  useEffect(() => nearby?.onRoomTapped(openRoom), [openRoom]);

  // Signed in, and each time the app comes back to the front: the rooms around may have changed
  useEffect(() => {
    if (!nearby || !client || !userId) return;
    void nearby.refreshNearby(client).catch(() => undefined);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void nearby?.refreshNearby(client).catch(() => undefined); });
    return () => subscription.remove();
  }, [client, userId]);

  // From someone signed in to nobody (any logout, or an ended session): the phone stops watching
  const previous = useRef(userId);
  useEffect(() => {
    if (previous.current && !userId) void nearby?.turnNearbyOff().catch(() => undefined);
    previous.current = userId;
  }, [userId]);
}
