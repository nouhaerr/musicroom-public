import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_AREA_METERS, NAME_LENGTH, keep, notificationFor, regionsFor, type NearbyRoom } from '../src/nearby/rules.ts';

const room = (changes: Partial<NearbyRoom> = {}): NearbyRoom => ({
  id: 'room-1', name: 'Friday night', latitude: 33.5731, longitude: -7.5898, radiusMeters: 200,
  voteStartsAt: new Date(2026, 10, 2, 20, 0).toISOString(), voteEndsAt: new Date(2026, 10, 2, 23, 0).toISOString(), ...changes,
});

test('one area per room: its venue, told only when entered, never smaller than the phones can watch', () => {
  assert.deepEqual(regionsFor([room(), room({ id: 'room-2', radiusMeters: 50 })]), [
    { identifier: 'room-1', latitude: 33.5731, longitude: -7.5898, radius: 200, notifyOnEnter: true, notifyOnExit: false },
    { identifier: 'room-2', latitude: 33.5731, longitude: -7.5898, radius: MIN_AREA_METERS, notifyOnEnter: true, notifyOnExit: false },
  ]);
  assert.deepEqual(regionsFor([]), []);
});

test('the phone keeps only what the notification needs, with long names cut', () => {
  assert.deepEqual(keep(room()), { id: 'room-1', name: 'Friday night', voteStartsAt: room().voteStartsAt, voteEndsAt: room().voteEndsAt });
  const long = keep(room({ name: 'A'.repeat(60) })).name;
  assert.equal(long.length, NAME_LENGTH);
  assert.ok(long.endsWith('…'));
  assert.equal(keep(room({ name: 'B'.repeat(NAME_LENGTH) })).name, 'B'.repeat(NAME_LENGTH)); // exactly the limit: kept whole
});

test('the notification: until when, or from when, and how to join', () => {
  assert.deepEqual(notificationFor(keep(room()), new Date(2026, 10, 2, 21, 30)),
    { title: 'Friday night is near you', body: 'Voting until 23:00 · Tap to join' });
  assert.deepEqual(notificationFor(keep(room()), new Date(2026, 10, 2, 18, 0)),
    { title: 'Friday night is near you', body: 'Voting from 20:00 to 23:00 · Tap to join' });
});

test('no notification once the hours are over, or when they cannot be read', () => {
  assert.equal(notificationFor(keep(room()), new Date(2026, 10, 2, 23, 0)), null); // the last minute is over
  assert.equal(notificationFor(keep(room()), new Date(2026, 10, 3, 1, 0)), null);
  assert.equal(notificationFor(keep(room({ voteEndsAt: 'not a date' })), new Date(2026, 10, 2, 21, 0)), null);
});
