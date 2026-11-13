# Music Room API

NestJS + Prisma + PostgreSQL backend for the database, authentication, action
logs, and the **Music Track Vote** (`parties`) and **Music Playlist Editor**
(`playlists`) services.

## Quick start

```bash
cd music-room-api               # from the repository root
# Start Docker Desktop / Docker Engine.
make                            # builds, applies migrations, starts the API
make logs                       # follows backend logs
```

Automatically generated Swagger documentation: http://localhost:3000/docs

On Windows, use Docker Desktop with Linux containers and install `make` for your
shell (Git Bash or PowerShell). Secret generation skips UID/GID mapping on
Windows. On Linux/macOS, it uses the host user; a newly generated `.env` remains
mode `0600`. Compose injects the variables without requiring the backend user
to read that file. See the [security note](docs/SECURITY-AUTH.md).

PostgreSQL is published only on `127.0.0.1:5433` (the backend always uses
`postgres:5432` on the Docker network). Replace the template development
password before any deployment. Prisma migrations initialize the schema; no
`docker/postgres-init` directory is needed.

## Configuration

Edit `.env` (created by `make` if it is missing, from `.env.example`, with two
random JWT secrets). To prepare the configuration before the first start, run
`make .env`, edit `.env`, then run `make`. `make` never replaces an existing
`.env` file:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: PostgreSQL settings.
- `DATABASE_URL`: Prisma connection URL, using host `postgres` inside Docker.
  URL credentials must be percent-encoded if the password contains reserved
  characters. In that case, replace the template interpolation with the
  correctly encoded URL; keep the raw password in `POSTGRES_PASSWORD`.
- `MOBILE_DEEP_LINK`: scheme opened by email-verification and password-reset
  links; defaults to `sonora://auth`.
- An existing PostgreSQL volume keeps its credentials: changing `.env` does not
  change the password already stored in the database.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: required, different, at least 32
  bytes each, and must not contain spaces or example values. The API refuses to
  start if these checks fail, including in development. `make secrets` generates
  two random values without displaying them and preserves the other settings.
  Recreate the backend afterward; all old JWTs and verification/reset links
  become invalid. See [JWT secret configuration](docs/SECURITY-AUTH.md#jwt-secret-configuration).
- `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`: from
  https://developers.facebook.com/apps
- `GOOGLE_CLIENT_ID`: a Google Cloud OAuth **Web application** client, the same
  value as the mobile SDK's `webClientId`. This flow does not require a Google
  secret. Setup and browser testing: [Google Login guide](docs/GOOGLE-LOGIN.md).

If no Google OAuth client is available in development, add
`GOOGLE_AUTH_ENABLED=false` to `.env`. Google login and linking routes then
return 503; email authentication remains available. Google is enabled by
default, and the API will not start without `GOOGLE_CLIENT_ID`. After changing
`.env`, recreate the backend with
`docker compose up -d --no-deps --force-recreate backend`.

The mail service uses `MAIL_TRANSPORT=log` in development (links appear in the
logs) or `MAIL_TRANSPORT=smtp` to send real email. See the [SMTP guide](docs/SMTP.md)
for Gmail configuration, verification, and the first send.

Routes, security behavior, pagination, migrations, and A1–A5 tests:
[authentication and users guide](docs/AUTH-USERS.md). Facebook tests and
permissions: [Facebook Login guide](docs/FACEBOOK-LOGIN.md). Auth/social status
and remaining manual checks: [status report](docs/AUTH-USERS-STATUS.md).
Protections and deployment limits: [security note](docs/SECURITY-AUTH.md).
Rooms, playlists, real-time behavior, and the music catalog:
[music security note](docs/SECURITY-MUSIC.md). Technical decisions:
[justification](docs/TECH-CHOICES.md). AI assistance:
[usage note](docs/AI-USAGE.md). Technical choices for rooms, playlists, and
real-time behavior: [justification](docs/TECH-CHOICES-MUSIC.md). Load testing
(V.7): [measurements and user capacity](docs/RAMP-UP.md). API (V.4):
[REST, JSON, and Swagger documentation](docs/API.md). Expo project foundation
for Android/iOS: [mobile project guide](../music-room-mobile/README.md).

## Automated checks

```sh
make lint                      # checks without modifying files
make typecheck                 # TypeScript validation
make test                      # unit tests
docker compose exec backend npm run build
docker compose exec backend npm run security:audit
docker compose exec backend sh -c 'TEST_DATABASE_URL="$DATABASE_URL" npm run test:e2e'
```

The [Backend CI workflow](../.github/workflows/backend-ci.yml) runs installation,
production dependency audit, Prisma generation, lint, TypeScript checks, unit
tests, compilation, and integration tests on pushes to `main` and pull requests.
It uses a disposable PostgreSQL database and mocked social providers, without
SMTP/OAuth secrets. The run for PR #4 at `c74e20b` passed. See [CI.md](docs/CI.md)
for details.

`make down` stops services and keeps data. `make fclean` and `make re` remove
volumes and PostgreSQL data. To create a migration after changing the schema,
run `make migration name=change_name`.

## Main routes

### Authentication

| Method | Route | Description |
|---|---|---|
| POST | `/auth/register` | Register with email/password *(limited to 5/min)* |
| GET | `/auth/verify-email?token=...` | Verify email |
| POST | `/auth/login` | Sign in (verified email required) *(limited to 10/min)* |
| POST | `/auth/refresh` | Refresh tokens |
| POST | `/auth/forgot-password` / `/auth/reset-password` | Reset password |
| POST | `/auth/facebook` / `/auth/google` | Sign in with a mobile SDK token |
| POST | `/auth/link/facebook` / `/auth/link/google` | Link an account (JWT required) |

### Users and devices

| Method | Route | Description |
|---|---|---|
| GET/PATCH | `/users/me` | Signed-in user's profile |
| POST | `/devices` | Register a device (call when the mobile app starts) |
| GET | `/devices` | List my devices |
| GET | `/devices/delegations/received` | List friends' devices shared with me |
| GET | `/devices/:id/delegations` | List active friends with control access to my device |
| POST | `/devices/:id/delegations` | Grant a friend access (`{ "delegateUserId": "<uuid>" }`) |
| DELETE | `/devices/:id/delegations/:userId` | Revoke a friend's access |
| DELETE | `/devices/:id` | Detach a device and revoke its sessions and grants |

> Send the `X-Device-Id` header (returned by `POST /devices`) with requests so
> action logs (V.6) are associated with the correct device.
>
> Control access can only be granted to a current friend. Removing a device or
> ending the friendship revokes its active grants. Grants are per device and
> are reported to both users through `device:control-changed` in Socket.IO.

### Delegated playlist playback

| Method | Route | Description |
|---|---|---|
| POST | `/playlists/:id/playback` | Send `PLAY`, `NEXT`, or `STOP` to an online device belonging to the playlist owner and shared with you |

`PLAY` takes `{ "deviceId": "<uuid>", "action": "PLAY", "playlistSongId": "<uuid>" }`;
`NEXT` takes the current `playlistSongId`, and `STOP` needs only the device and action.
The server checks playlist visibility, accepted invitations for private playlists,
device ownership, and the active friend grant before sending `device:playback-command`
over Socket.IO. The receiving Sonora app must be open and connected. Offline commands
are not queued. Playback uses Deezer previews, not full-track streaming.
The target reports its preview state over the authenticated Socket.IO connection
once per second. `playlist:playback-status` relays the current track, state, elapsed
seconds, and preview duration (capped at 30 seconds) to playlist viewers. The report
is accepted only from the owner’s registered device for the active server-issued
playback command; it is transient and is not stored in the database.

### Music catalog (`/songs`)

| Method | Route | Description |
|---|---|---|
| GET | `/songs/search?q=&limit=&index=` | Search the Deezer catalog. Returns `externalId`, which is used to add a track |
| GET | `/songs/:id/preview` | Get a fresh playback URL for a stored track (`:id` is our track ID). Call just before playback; Deezer URLs expire after 15 minutes |

> The phone never sends a track title, artist, or URL. It sends only
> `externalId`, and the server fetches track details from the catalog (the
> backend remains authoritative, V.3).
>
> Catalog responses are external input, even for HTTP 200. Every field is
> validated (type, integer bounds, HTTP(S) URL, non-empty text without NUL
> characters, and reasonable length) before it is stored or returned. A missing,
> `null`, or empty optional field is treated as no value. Any other unexpected
> response returns `502` for a track; the entry is skipped in search results.
> Known limit: request duration is bounded (5 seconds), but response size is not.

### Music Track Vote (`/parties`)

| Method | Route | Description |
|---|---|---|
| POST | `/parties` | Create a voting event |
| GET | `/parties` / `/parties/mine` | Public events / my events, each with its host (`owner`: `id` and `name` only) and `nowPlaying` |
| GET | `/parties/:id` | Details (visibility rules apply), including `nowPlaying` and `playbackVersion` |
| POST | `/parties/:id/invite` | Invite a user (owner only) |
| POST | `/parties/:id/join` | Join an event |
| GET | `/parties/:id/queue` | Queue sorted by votes |
| POST | `/parties/:id/songs` | Suggest a track: `{ "externalId": "..." }` |
| POST/DELETE | `/parties/:id/songs/:partySongId/vote` | Vote / remove your vote |
| GET | `/parties/:id/votes/mine` | My votes in this event: paginated list of `partySongId` values, oldest first |
| POST | `/parties/:id/next` | Play the next track (owner only): `{ "expectedPlaybackVersion": n }`; see below |

### Music Playlist Editor (`/playlists`)

| Method | Route | Description |
|---|---|---|
| POST | `/playlists` | Create a playlist |
| GET | `/playlists` / `/playlists/mine` | Public playlists / my playlists |
| GET | `/playlists/:id` | Details (visibility rules apply) |
| POST | `/playlists/:id/invite` | Invite a collaborator (owner only) |
| GET | `/playlists/:id/songs` | Tracks sorted by position |
| POST | `/playlists/:id/songs` | Add a track: `{ "externalId": "...", "position"?: n }` |
| PATCH | `/playlists/:id/songs/:playlistSongId` | Move a track (optimistic locking; see below) |
| DELETE | `/playlists/:id/songs/:playlistSongId` | Remove a track |

## Concurrency handling

- **Votes**: the database constraint `@@unique([partySongId, userId])` prevents
  simultaneous duplicate votes at the SQL level, not just in application code.
  The vote-counter increment and vote creation run in the same Prisma transaction.
- **Moving a playlist track**: optimistic locking. The client sends
  `expectedPosition` (the last position it saw). Checking that position and
  moving the track happen in one SQL statement. If several requests move the
  same track at once, one succeeds; the others receive `409 Conflict` and must
  refresh before retrying. If the track was just removed, the response is `404`.
- **Removing a playlist track**: one SQL statement. If several requests remove
  the same track at once, one succeeds and the others receive `404` (not a server error).
- **Adding to the end of a playlist**: the position after the last track is
  calculated while holding a playlist lock, so concurrent additions get
  different positions.
- **Next party track**: optimistic locking with a counter. Each playback change
  increments `playbackVersion`; the client sends the version it saw
  (`expectedPlaybackVersion`, `0` before the first track). Checking and
  incrementing happen in one SQL statement, in the same transaction as removing
  the track from the queue. A stale version returns `409` without changing
  anything, even if the same track is played again (a counter never goes
  backwards, unlike a track ID). Of simultaneous “next” requests, only one
  succeeds. When the queue is empty, “next” stops playback (`nowPlaying` becomes `null`).
- **Voting while the track changes**: the playing track leaves the queue; a vote
  arriving at the same time receives `404` (not a server error). Votes for the
  track are removed before it enters the queue, using the same lock order as
  vote removal to avoid deadlocks.
- **Importing a catalog track**: each track is stored once (`externalId` is
  unique in canonical form). If two requests import the same track at once, the
  uniqueness constraint rejects the second insert, which then returns the row
  created by the first request.

## Real time (WebSocket)

The server pushes the state of a voting event or playlist to all connected
phones whenever it changes. The protocol is Socket.IO, on the same host and port
as the REST API.

### Snapshots, never diffs

The server does not send “a vote was added.” It sends the **complete state** (a
*snapshot*) each time: the same data returned by the REST routes at that moment.
The phone replaces its display with the received state, so it cannot drift from
the server even if it missed a message.

### Connecting

```ts
const socket = io(API_URL, { auth: { token: accessToken, deviceId } });
```

- `token`: the access token, same as for REST. It is also accepted in an
  `Authorization: Bearer ...` header. Never put it in the URL.
- `deviceId` (optional): ID returned by `POST /devices`, for action logs. It is
  also accepted in an `X-Device-Id` header.
- Without a valid login, the connection is rejected (`connect_error`:
  `Unauthorized`).

### Client messages

Two messages, with the same payload. Each always receives a response (a
Socket.IO acknowledgement).

| Message | Payload | Effect |
|---|---|---|
| `subscribe` | `{ "type": "party" \| "playlist", "id": "<uuid>" }` | Watch this event or playlist. Access rules match `GET /parties/:id` or `GET /playlists/:id`. The current snapshot is sent immediately |
| `unsubscribe` | same | Stop watching |

Response: `{ "ok": true }`, or
`{ "ok": false, "error": { "code": "...", "message": "..." } }`.

| `code` | Meaning |
|---|---|
| `BAD_REQUEST` | Invalid payload |
| `UNAUTHORIZED` | Session expired or revoked (the connection is then closed) |
| `FORBIDDEN` | Private; the user is neither owner nor invitee |
| `NOT_FOUND` | Does not exist |
| `TOO_MANY` | Already 20 subscriptions on this connection |
| `RATE_LIMITED` | More than 30 messages in 10 seconds on this connection |
| `INTERNAL` | Server error |

### Server events

| Event | Content | When |
|---|---|---|
| `party:snapshot` | `{ party, queue, queueLength, playingForMs }`. `party` matches `GET /parties/:id` (including `nowPlaying` and `playbackVersion`). `queue` matches `GET /parties/:id/queue`, up to `MAX_PARTY_SONGS` tracks (100 by default; see “Known limits”). `queueLength` is the queue size. `playingForMs` is how long the current track has been playing, measured by the server (`null` if nothing is playing). | On subscription and after each suggestion, vote, vote removal, or “next” |
| `playlist:snapshot` | `{ playlist, songs, songsLength }`. `playlist` matches `GET /playlists/:id`, without `owner`, `canEdit`, or `invitation` (these vary by user). `songs` matches `GET /playlists/:id/songs`, up to `MAX_PLAYLIST_SONGS` (100 by default; see “Known limits”). `songsLength` is the track count. | On subscription and after each addition, move, or removal |
| `device:control-changed` | `{ action: "GRANTED" \| "REVOKED", deviceId, delegatorUserId, delegateUserId }` | Sent to the device owner and friend when a grant changes, the device is detached, or the friendship ends |
| `playlist:playback-status` | `{ playlistId, playlistSongId, deviceId, state, positionSeconds, durationSeconds, updatedAt }`; `state` is `PLAYING`, `PAUSED`, `STOPPED`, `ENDED`, or `UNAVAILABLE` | Relayed to currently authorized playlist viewers while the target device reports playback (about once per second) |
| `unsubscribed` | `{ type, id, code: "FORBIDDEN" }` | User is no longer allowed to watch (invitation revoked or declined). The connection remains open |
| `session:expired` | none | Token expired or session closed (logout, password changed). The connection is closed immediately afterward |
| `connection:refused` | `{ code: "TOO_MANY_CONNECTIONS" }` | User already has 5 open connections. The connection is closed immediately afterward |

### Server guarantees

- **Same data as REST**: a snapshot contains what REST routes return at that moment.
- **A consistent state**: the event (or playlist) and its list are read together
  in one consistent read. A change that happens during the read never appears partially.
- **Ordered delivery**: for a given event or playlist, an older snapshot never
  arrives after a newer one.
- **The latest state is sent**: after a change, a snapshot containing it is sent.
  If the read fails, it is retried.
- **Access is rechecked**: immediately before each send, the server rechecks the
  session and each recipient's access rights.
- **At most five snapshots per second** per event or playlist: close-together
  changes are coalesced into the next snapshot.

### Client responsibilities

1. **Listen before subscribing**: register `socket.on('party:snapshot', ...)`,
   then send `subscribe`. No REST call is needed first; subscribing sends the
   current state.
2. **Replace, do not merge**: replace the display with each snapshot. With
   multiple subscriptions, `party.id` or `playlist.id` identifies the target.
3. **No pages to load**: a queue has at most `MAX_PARTY_SONGS` tracks and a
   playlist at most `MAX_PLAYLIST_SONGS` (100 by default; see `.env.example`;
   adding the next track is rejected with 409), so a snapshot contains the full
   list. Exception: a list longer than the limit (see “Known limits”).
4. **`session:expired`**: call `POST /auth/refresh`, open a new connection with
   the new token, then subscribe again. Socket.IO does not reconnect by itself
   when the server closes the connection.
5. **`unsubscribed`**: leave the corresponding screen.
6. **Unsubscribe when leaving a screen**: a connection allows 20 subscriptions.
7. **Resubscribe to resync**: sending `subscribe` again returns the current snapshot.
8. **During drag-and-drop**: wait for the gesture to finish before applying a
   snapshot. If moving the track returns `409`, display the received state.
9. **“You voted” state**: snapshots are the same for everyone and do not show
   which tracks *you* voted for. Load `GET /parties/:id/votes/mine` when opening
   the event and after each resubscription, then update that list from your own
   vote responses (`201`: add, `200` on removal: remove).
10. **Progress bar**: start from `playingForMs` and count from the time the
    snapshot is received. Do not compare the phone clock to `nowPlayingStartedAt`;
    the clocks may differ.

### Limits and action logging

- Per connection: 20 subscriptions, 30 messages per 10 seconds, 16 KB per message.
- Per user: 5 connections.
- Every connection, subscription, and unsubscription writes a line to `ActionLog`
  (`WS connect`, `WS subscribe party`, etc.), including device, platform, and app
  version, like REST routes (V.6). Rejected messages are logged with their reason.

### Known limits

- **Single server process**: snapshot ordering and subscriptions are kept in
  memory. Multiple instances would require a shared adapter (Redis).
- **Logout** takes effect on an already-open connection at its next message, at
  the next snapshot it would receive, or at the latest when its access token
  expires (15 minutes by default).
- **Connection attempts are not rate-limited by IP**: invalid tokens are
  rejected without a database query.
- **Queues and playlists are capped** at `MAX_PARTY_SONGS` and
  `MAX_PLAYLIST_SONGS` respectively (100 by default). A snapshot sends the entire
  available list after every change (see item 3 above).
- **The limit controls what is available, not just what can be added** (by
  design): if a list has more tracks than the limit (the limit was lowered in
  `.env`, or a future paid plan expired), extra tracks remain in the database but
  are not sent. A snapshot keeps the first tracks in list order: playlist
  position for a playlist, votes for a queue (later tracks enter as earlier ones
  are played). Nothing is deleted; hidden tracks return when the limit is raised.
  Adding is rejected (409) while the list is at or above the limit.
  `test/list-limit.e2e-spec.ts` verifies this: five tracks in the database with a
  limit of three produce a snapshot containing three.

## Next steps (not yet implemented)

- Music Control Delegation (the `ControlDelegation` model is already in the database).
