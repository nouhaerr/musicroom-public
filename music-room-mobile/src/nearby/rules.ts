// What "rooms nearby" decides, without the phone: which areas to watch, what is kept, what the notification says

// A room of GET /parties/nearby: a public place-and-time room around the phone
export interface NearbyRoom {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  voteStartsAt: string;
  voteEndsAt: string;
}
// What the phone keeps of it, for the notification when its area is entered
export type KeptRoom = Pick<NearbyRoom, 'id' | 'name' | 'voteStartsAt' | 'voteEndsAt'>;

export const MIN_AREA_METERS = 100; // phones do not watch smaller circles reliably
export const NAME_LENGTH = 40; // kept names are cut there: the phone's secure storage keeps small values only

// One area per room: its venue circle, at least MIN_AREA_METERS wide, telling only when it is entered
export function regionsFor(rooms: NearbyRoom[]) {
  return rooms.map(room => ({
    identifier: room.id, latitude: room.latitude, longitude: room.longitude,
    radius: Math.max(room.radiusMeters, MIN_AREA_METERS), notifyOnEnter: true, notifyOnExit: false,
  }));
}

export function keep(room: NearbyRoom): KeptRoom {
  const name = room.name.length > NAME_LENGTH ? `${room.name.slice(0, NAME_LENGTH - 1)}…` : room.name;
  return { id: room.id, name, voteStartsAt: room.voteStartsAt, voteEndsAt: room.voteEndsAt };
}

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`; // the phone's own hours

// The notification for a room whose area was just entered, or null once its hours are over
export function notificationFor(room: KeptRoom, now: Date) {
  const starts = new Date(room.voteStartsAt);
  const ends = new Date(room.voteEndsAt);
  if (!(ends.getTime() > now.getTime())) return null; // over, or no hours that can be read
  const hours = starts.getTime() > now.getTime() ? `Voting from ${clock(starts)} to ${clock(ends)}` : `Voting until ${clock(ends)}`;
  return { title: `${room.name} is near you`, body: `${hours} · Tap to join` };
}
