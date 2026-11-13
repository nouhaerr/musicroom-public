# Technical choices: rooms, playlists, real time, and catalog

Companion to the [authentication and social technical choices](TECH-CHOICES.md),
covering the music modules. NestJS, PostgreSQL, Prisma, REST + JSON, Docker, and
Expo are justified there; this note covers rooms, playlists, and real time.

| Choice | Why it fits the project | Trade-offs and limitations |
|---|---|---|
| Deezer as the catalog | Public search API, no account or key required; a real catalog with 30-second previews and persistent links. The rest of the code depends only on the `MusicProvider` contract, so switching catalogs does not affect rooms or playlists. | Only 30-second previews (full tracks require an account and the Deezer SDK). If Deezer is unavailable, search returns 502. Preview URLs expire, so the app requests one before each playback. |
| Server imports tracks | The app sends only the Deezer ID (`externalId`); the server fetches, validates, and stores the track. Clients cannot invent a title or URL. | One Deezer request for each new track in the database. |
| Socket.IO for real time | WebSocket with automatic reconnection and an acknowledgement (`ok` or error) for each subscription; same library on the server and app. | Single server process: multiple instances would need a shared adapter (Redis). Not in Swagger; messages are described in the README. |
| Full snapshots, not diffs | Each update contains the complete room or playlist state. A lost or delayed message is corrected by the next one, and the app simply replaces its state. One sender per room preserves ordering; changes within 200 ms are grouped (at most 5 sends per second). | Heavier when the list is long: on our laptop, a room with a full queue supports 500–1,000 spectators (see [RAMP-UP.md](RAMP-UP.md)). |
| All changes go through REST | One place for rules, validation, and logs; the live connection only subscribes and receives updates. | A change takes two trips: the request, then the update pushed to everyone. |
| Locks and version numbers | Advancing sends `expectedPlaybackVersion`; moving a track sends `expectedPosition`; access changes lock the database row (`FOR UPDATE`). Concurrent actions do not overwrite one another: the second receives 409. | The app must handle 409: reload and retry if the user wants. |
| Limits in `.env` | `MAX_PARTY_SONGS`, `MAX_PLAYLIST_SONGS`, and `THROTTLE_LIMIT` are checked at startup (integer within a range). Change them without touching code, for example for load testing. | Lowering a limit hides extra tracks without deleting them (by design; see “Known limits” in the README). |
| Server-enforced voting rules | For invitees-only or on-site voting during scheduled hours, the server calculates distance and time on every vote. The backend remains authoritative. | Location comes from the phone and can be spoofed (see [SECURITY-MUSIC.md](SECURITY-MUSIC.md)). |
| One live connection in the app | All open pages share a connection; after reconnecting, the app resubscribes to everything it watches and receives a fresh snapshot. | No real-time updates without a network; the offline-mode bonus is not implemented. |
| Our script + `ab` for load tests | The script measures the user experience (time from a vote to its appearance on screen); `ab` is the tool named in the subject for pages. Both clean up their data. | They run on the same laptop as the server, so the results are a lower bound. |

## Alternatives considered

- **Spotify or YouTube** as a catalog: an app key is required, and Spotify
  playback requires a user account. Deezer supports search and preview playback
  without additional setup.
- **Sending diffs** (“track X got +1 vote”): smaller messages, but a lost
  message leaves the app incorrect until reload, and message ordering becomes
  critical. Full snapshots avoid both issues.
- **Polling every second** instead of real time: simpler, but creates thousands
  of unnecessary requests and adds a one-second delay. Real time sends only
  when something changes.
