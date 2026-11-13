import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import type { ApiClient } from '../api/client';
import { keep, notificationFor, regionsFor, type KeptRoom, type NearbyRoom } from './rules';

// "Rooms nearby" (the IoT bonus): each public place-and-time room around the phone acts like a beacon at its venue.
// The phone watches the venue circles itself, and tells its user when they walk into one, even with the app closed.

const TASK = 'sonora-rooms-nearby';
const ON_KEY = 'sonora.nearby.on'; // on this phone, the user turned it on
const ROOMS_KEY = 'sonora.nearby.rooms'; // the rooms watched, for the notification

// A notification also shows while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// Runs when the phone enters one of the venues saved at the last reading of the list (watchAround), even with the
// app closed; also right away for a venue the phone is already inside when it is saved. Loaded first, by index.ts.
TaskManager.defineTask<{ eventType: Location.LocationGeofencingEventType; region: Location.LocationRegion }>(TASK, async ({ data, error }) => {
  if (error || data.eventType !== Location.LocationGeofencingEventType.Enter) return;
  const rooms = JSON.parse((await SecureStore.getItemAsync(ROOMS_KEY)) ?? '[]') as KeptRoom[];
  const room = rooms.find(each => each.id === data.region.identifier);
  const content = room ? notificationFor(room, new Date()) : null;
  if (!room || !content) return;
  // One notification per room: entering again (GPS jitter at the edge) replaces it instead of adding another
  await Notifications.scheduleNotificationAsync({ identifier: `room-${room.id}`, content: { ...content, data: { partyId: room.id } }, trigger: null });
});

export const isNearbyOn = async () => (await SecureStore.getItemAsync(ON_KEY)) === 'on';

// Turning it on: the three permissions in order, then the venues around. A refusal stops here with a sentence for the user.
export async function turnNearbyOn(client: ApiClient) {
  if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error('Allow location access so Sonora can find rooms near you.');
  if (!(await Location.requestBackgroundPermissionsAsync()).granted) {
    throw new Error('Choose "Allow all the time" for location, so Sonora can tell you about rooms while the app is closed.');
  }
  if (!(await Notifications.requestPermissionsAsync()).granted) throw new Error('Allow notifications so Sonora can tell you about rooms near you.');
  await watchAround(client);
  await SecureStore.setItemAsync(ON_KEY, 'on');
}

// Back in the app: the venues around are read again, if it is still on and still allowed
export async function refreshNearby(client: ApiClient) {
  if (!(await isNearbyOn())) return;
  if (!(await Location.getBackgroundPermissionsAsync()).granted) { await turnNearbyOff(); return; }
  await watchAround(client);
}

export async function turnNearbyOff() {
  await SecureStore.deleteItemAsync(ON_KEY);
  await SecureStore.deleteItemAsync(ROOMS_KEY);
  if (await Location.hasStartedGeofencingAsync(TASK)) await Location.stopGeofencingAsync(TASK);
}

// A tap on a notification opens its room, also when the tap started the app. Gives back how to stop listening.
export function onRoomTapped(openRoom: (partyId: string) => void) {
  const opened = (response: Notifications.NotificationResponse) => {
    const partyId = response.notification.request.content.data?.partyId;
    if (typeof partyId === 'string') openRoom(partyId);
  };
  void Notifications.getLastNotificationResponseAsync().then(response => {
    if (!response) return;
    opened(response);
    void Notifications.clearLastNotificationResponseAsync();
  }).catch(() => undefined);
  const subscription = Notifications.addNotificationResponseReceivedListener(opened);
  return () => subscription.remove();
}

// The rooms around the phone now: asked from the server, kept for the notification, their venues given to the phone
async function watchAround(client: ApiClient) {
  const { coords } = await Location.getCurrentPositionAsync();
  const rooms = await client.request<NearbyRoom[]>(`/parties/nearby?latitude=${coords.latitude}&longitude=${coords.longitude}`);
  if (!Array.isArray(rooms)) throw new Error('Invalid nearby rooms response.');
  await SecureStore.setItemAsync(ROOMS_KEY, JSON.stringify(rooms.map(keep)));
  if (rooms.length > 0) await Location.startGeofencingAsync(TASK, regionsFor(rooms));
  else if (await Location.hasStartedGeofencingAsync(TASK)) await Location.stopGeofencingAsync(TASK);
}
