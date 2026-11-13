# Security: rooms, playlists, real time, and the catalog

This is a companion to the [authentication and social security note](SECURITY-AUTH.md),
covering the music modules (subject V.6: protect users, identify other risks,
and explain possible safeguards). As with that note, this is not a full audit.

## Risks and safeguards

| Risk | Implemented safeguard | Automated evidence |
|---|---|---|
| Voting more than once for the same track | One vote per person per track, enforced by a database unique constraint (`Vote`, `partySongId` + `userId`); a duplicate receives 409 | `parties-room-data.e2e-spec.ts` |
| Voting without permission | The server checks the room's voting rule on every vote: everyone, invitees only, or people at the venue during the scheduled hours (distance is calculated by the server) | `parties-room-data.e2e-spec.ts` |
| Suggesting the same track twice or growing a queue without limit | A track can appear only once per room (409); queue and playlist capped at `MAX_PARTY_SONGS` / `MAX_PLAYLIST_SONGS` (100 by default, 409 beyond that) | `list-limit.e2e-spec.ts` |
| Advancing playback without being the host, or advancing twice concurrently | Only the owner may do this (403); optimistic `playbackVersion` lock returns 409 for stale state | `parties-playback.e2e-spec.ts` (locking tests fail without the lock) |
| Editing a playlist without permission | `editLicense` checked on every add, move, or removal (403); only the owner can change access settings | `playlists-editing.e2e-spec.ts` |
| Two people moving the same track concurrently | The client sends the position it saw (`expectedPosition`); if it has changed, the server returns 409 and the app reloads | `playlists-editing.e2e-spec.ts` |
| Viewing a private room or playlist | Visible only to the owner and invitees (pending or accepted invitation); same rule applies to lists, routes, and real time | `playlists-data.e2e-spec.ts`, `realtime.e2e-spec.ts` |
| Staying subscribed after access is removed | Access is checked before each update is sent. A revoked or declined invitation ends the subscription (`unsubscribed`, `FORBIDDEN`) before the next send | `realtime.e2e-spec.ts` |
| Keeping a live connection after logout | Session is checked on every message, using the same rules as at connection time | `realtime.e2e-spec.ts` |
| Overloading the live connection | 5 connections per account, 20 subscriptions per connection, 30 messages per 10 seconds, 16 KB per message; at most 5 updates per second per room (intermediate changes are grouped) | `realtime.e2e-spec.ts` |
| Overloading HTTP routes | `THROTTLE_LIMIT` requests per minute, per route and IP (60 by default, 429 above the limit) | `list-limit.e2e-spec.ts` |
| Invalid or malicious catalog response (Deezer) | Track IDs must contain digits only; every response is validated (fields, types, lengths); maximum 5 seconds, then 502 without a crash; expiring preview URLs are never stored | `deezer.provider.spec.ts` |
| Importing the same track concurrently | Catalog ID is unique in the database; the second import returns the row created by the first | `songs.e2e-spec.ts` (race forced) |

## Known limitations

- **Fake location.** The “at the venue during scheduled hours” rule uses a
  location sent by the phone. The server cannot prove it; someone can send fake
  coordinates with `curl`. This prevents honest mistakes, not cheating. Actual
  proof would require something at the venue (a displayed code or rotating QR code).
- **Multiple accounts.** There is one vote per account, but one person can create
  multiple accounts, each with its own email. The “invitees only” rule limits this risk.
- **IP rate limiter.** Several phones sharing an IP (such as school Wi-Fi) share
  the per-minute limit. See the deployment limits in the
  [authentication security note](SECURITY-AUTH.md#deployment-limitations-to-address).
- **A very popular room.** A room with a full queue supports 500–1,000 spectators
  on our laptop; see [RAMP-UP.md](RAMP-UP.md).
