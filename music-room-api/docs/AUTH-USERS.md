# Authentication, users and social features (A1–A5)

The API is documented at `/docs`. Protected requests use
`Authorization: Bearer <accessToken>`. In Swagger, paste only the access
token into **Authorize**. The POST/PATCH request fields below are
JSON, except for the verification token sent in the URL.

## Configuration and migration

- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: two distinct random secrets,
  each at least 32 bytes long. Missing or too-short values, values made from a
  single repeated character, containing spaces, or using example placeholders are rejected at startup.
  `make secrets` replaces only these two `.env` values; recreate the
  backend and sign in again. Existing tokens and links become invalid.
- `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN`: `15m` / `7d` by default.
- `GOOGLE_AUTH_ENABLED`: `true` by default. An empty `GOOGLE_CLIENT_ID`
  then prevents startup. Explicitly set this to `false` locally when no OAuth client is configured:
  Google routes return 503, while email login remains available.
- `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`: required to use Facebook;
  its routes return 503 when not configured.
- `APP_URL`: address used in links displayed by `MailService`.

`make` applies existing migrations. Migration `20260929120000_auth_users_social`
adds sessions, hashes for refresh/reset tokens, and
invitation status. It converts `musicPreferences` into a list of genres.
Existing JSON arrays, or the `genres` field of a JSON object, are normalized;
other shapes become an empty list. The original JSON is retained in
`_MusicPreferencesArchive`, and is not exposed by the API.

Old JWTs without a session identifier (`sid`) are rejected: sign in again
after upgrading. Existing collaborator/member invitations are
marked accepted by the migration.

## Authentication routes

| Route | Request body / parameters | Result |
|---|---|---|
| `POST /auth/register` | `email`, `password` (at least 8 characters, including a digit 0–9), `name` | Creates an unverified user; does not sign them in automatically |
| `GET /auth/verify-email?token=...` | Verification token | Email verified |
| `POST /auth/resend-verification` | `email` | Generic response |
| `POST /auth/login` | `email`, `password` | `accessToken`, `refreshToken`, `user` |
| `POST /auth/refresh` | `refreshToken` | New tokens and user |
| `POST /auth/logout` | Access token in the header | Revokes the current session |
| `POST /auth/forgot-password` | `email` | Generic response; sends a link if the account has a password |
| `POST /auth/reset-password` | `token`, `newPassword` (at least 8 characters, including a digit 0–9) | Changes the password and revokes sessions |
| `POST /auth/google` | Google SDK `idToken` | Signs in or creates a social account |
| `POST /auth/facebook` | Facebook SDK `accessToken` | Signs in or creates a social account |
| `POST /auth/link/google` | `idToken` + Music Room access token in the header | Links Google to the signed-in account |
| `POST /auth/link/facebook` | Facebook `accessToken` + Music Room access token in the header | Links Facebook to the signed-in account |

Google validates the signature, issuer, expiration, `aud`, and `email_verified` with
`google-auth-library`. `GOOGLE_CLIENT_ID` is the **Web** OAuth client shared
with the mobile SDK `webClientId`. See the [Google Login guide](GOOGLE-LOGIN.md)
for Android/iOS setup and local browser testing. Facebook validates
`debug_token` (`app_id`, token validity, user), then the profile. See the
[Facebook Login guide](FACEBOOK-LOGIN.md) for permissions, Swagger testing
and development-mode behavior. A network/Meta failure returns 503;
an invalid token or profile returns 401 without exposing the provider's raw response.
An email that already exists is never merged automatically: social sign-in returns
409 and asks the user to sign in to the existing account before linking it.
Provider tokens cannot be used in place of Music Room JWTs.

Each sign-in creates a database session. Refresh tokens are
stored as SHA-256 hashes and consumed on each refresh.
Reusing an already-consumed token revokes **all** of the user's sessions,
including their access tokens. The client must therefore serialize
refresh requests: two simultaneous calls with the same token trigger
this protection. Consumed hashes remain in the database to detect replays.
A new sign-in creates a separate session.

Password-reset links expire after 30 minutes and can only be used
once. A reset also invalidates any other active reset links and
revokes all sessions. Email verification expires after 24 hours.

`MailService` sends email with `MAIL_TRANSPORT=smtp`; `log` mode remains
available in development and is rejected when `NODE_ENV=production`.
See the [SMTP guide](SMTP.md) for Gmail and troubleshooting commands.
The backend does not provide a web page for the reset link.
To test in Swagger, copy the token from the email into the body of
`POST /auth/reset-password`. The [Expo mobile app](../../music-room-mobile/README.md)
also lets users paste the link or token into its reset screen;
automatic opening from email links still needs to be configured and tested on a device.
If SMTP fails, registration returns 503 but keeps the account unverified:
use `/auth/resend-verification` after fixing the configuration.
Resend and forgot-password keep a generic response even if
SMTP fails, to avoid revealing whether an account exists; check the SMTP error code
in the logs (without credentials, recipients, or tokens).

## Friends

All of these routes require authentication.

| Route | Purpose |
|---|---|
| `POST /friends/requests` with `{ "userId": "..." }` | Send a request |
| `GET /friends/requests` | Pending sent and received requests (`senderId` / `receiverId`) |
| `POST /friends/requests/:id/accept` | Accept; recipient only |
| `POST /friends/requests/:id/reject` | Reject; recipient only |
| `DELETE /friends/requests/:id` | Cancel; sender only |
| `GET /friends` | List friends |
| `DELETE /friends/:id` | Remove a friend for both users |

Requests to yourself are rejected (400); duplicates and already-processed
requests return 409. A reciprocal request automatically accepts the existing request
including when both requests arrive concurrently. Mutations
lock both users in a stable order and update the
relationships in one transaction.

## Profiles and search

- `GET /users/me` / `PATCH /users/me`: signed-in user's profile.
- `GET /users/:id` : public profile without authentication; with a valid access token,
  includes information the reader is allowed to see.
- `GET /users/search?q=Alice&genre=jazz` : public search by name and/or genre.

| Reader | Fields returned by `/users/:id` |
|---|---|
| Anonymous or another user | `id`, `name`, `publicInfo`, `musicPreferences` |
| Friend | Public fields + `friendsOnlyInfo` |
| Profile owner | Full profile, including `privateInfo`, without `passwordHash` |

Friend lists and search results return public fields only.
They do not reveal email addresses, social provider IDs, or private information.
An invalid authentication header on `/users/:id` returns 401.

`musicPreferences` is now an array of strings, for example
`["jazz", "rock"]`. Genres are converted to lowercase and trimmed;
duplicates are rejected. Maximum: 50 genres, each 1–50 characters long.
Legacy JSON objects are no longer accepted by `PATCH /users/me`.

## Invitations

Invitations are still created through the existing owner routes:
`POST /parties/:id/invite` and `POST /playlists/:id/invite`, with `{ "userId": "..." }`.
Both routes now return an **Invitation** object whose `id` is used to
respond, rather than the member profile or playlist.

| Route | Purpose |
|---|---|
| `GET /invitations/me` | Received invitations, pending or accepted |
| `POST /invitations/:id/accept` | Accept and become a member/collaborator |
| `POST /invitations/:id/decline` | Decline a pending invitation |
| `DELETE /parties/:id/invitations/:userId` | Owner: revoke invitation and remove member |
| `DELETE /playlists/:id/invitations/:userId` | Owner: revoke invitation and remove collaborator |

The `/parties` and `/playlists` lists include public resources, owned resources,
and private resources for which an invitation is active
(`PENDING` or `ACCEPTED`). A declined or revoked invitation grants no private access.
`/mine` lists owned or joined resources, not invitations that are still
pending. `POST /parties/:id/join` also accepts a pending invitation;
a private party requires an invitation.

Acceptance grants the collaborator role for an `INVITED_ONLY` playlist.
The `EVERYONE` license remains available to users allowed to view the
resource. Revoking an invitation does not ban someone from a public resource.
The owner can invite a user again after a decline or revocation.

## Devices, logs and pagination

`DELETE /devices/:id` revokes active sessions linked to the device and deletes only a
device belonging to the signed-in account; a nonexistent device or one owned by someone
else returns 404. A client is signed out through its real-time connection or next API
request; an offline client is denied when it reconnects. Sessions are pinned to a device on authenticated
requests that prove ownership with `X-Device-Id`. Logs
associate `X-Device-Id` only if the device belongs to the authenticated user.
An unknown or foreign ID is ignored for association without blocking
the action. URL parameters and verification tokens are not copied
into the action name.

Lists accept `page` (default 1) and `limit` (default 20, maximum 100):
friends, requests, search, invitations, devices, parties, playlists, track queues,
and playlist tracks. Responses remain arrays, without a total count.
Ordering is stable due to a secondary sort by ID. An invalid page/limit
returns 400.

## Verification

```bash
# Unit tests in an already-running backend
docker compose exec backend npm test -- --runInBand

# Integration: use a disposable database schema; never reset/truncate public.
# The test role must be allowed to create schemas.
docker compose exec backend sh -c 'TEST_DATABASE_URL="$DATABASE_URL" npm run test:e2e'
```

For a separate test database, pass its own `TEST_DATABASE_URL` to the
Jest process. Each run creates a `musicroom_test_<uuid>` schema and applies the real
migrations, starts a Nest application on an ephemeral port, and removes only
that schema at the end. Mail services and social provider responses
are mocked; JWT guards, Prisma, and PostgreSQL are real. Google/Facebook response
validation is covered separately by unit tests.
The rate limiter is disabled only in the e2e test process to allow creation
of the required accounts. One scenario enables it again to verify that
the eleventh login attempt from one IP is rejected.

The suite covers rotation/revocation, concurrent resets, social account conflicts,
concurrent friend requests, profile visibility filters, invitations, and
device association/deletion. It does not replace a real test with the application's
with the application's Google/Facebook SDKs and credentials.

Pagination is also checked for friends, requests, invitations, devices,
and search: distinct pages, stable ordering, and invalid bounds.
See the [status and remaining acceptance checks](AUTH-USERS-STATUS.md) and the
[security note](SECURITY-AUTH.md).
