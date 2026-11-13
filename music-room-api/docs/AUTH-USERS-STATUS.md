# Authentication, users, and social feature status

Status as of November 5, 2026. This report reflects the implementation and
validation recorded below. Passing automated tests does not validate every
production setup or every screen on every platform.

## Backend scope in the work split

| Work item | Status | Verification |
|---|---|---|
| A1 Auth and sessions | Implemented | Google/Facebook, explicit linking, database-backed refresh, rotation, replay detection, logout, single-use reset |
| A2 Friends | Implemented | Send, reject, cancel, accept, remove, duplicates, and concurrent reciprocal requests |
| A3 Profiles and genres | Implemented | Public/friends-only/private fields, name and genre search, sensitive-data filtering |
| A4 Invitations | Implemented | Accept/decline, private-resource visibility, revocation, and accept/revoke concurrency |
| A5 Devices and logs | Implemented | Validate `X-Device-Id` ownership; deletion restricted to the owner |
| A12 Tests for these modules | Present | Unit tests and PostgreSQL integration tests using disposable schemas |
| A13 Pagination for these modules | Implemented | Bounds, distinct pages, stable ordering, user-specific lists |
| A6 Control delegation | Implemented | Per-device grant/revoke, delegated playlist playback commands and live preview progress. Test remote playback with two online devices before presenting it as fully accepted. |

## Manual tests already confirmed by the user

- Registration, receipt of the real email, verification, and login.
- Password reset: email received, token unusable after use, old password rejected, and new password accepted.
- Google: new account, 409 for an existing email, explicit linking, then sign-in.
- Facebook: 409 for an existing email, explicit linking, then sign-in without a duplicate account.
- Sessions: after refresh followed by replay of the old refresh token, the protected request returns 401 “Session expired or revoked,” confirmed manually. Revocation of the user’s other sessions is covered by automated tests.
- Friends and profiles: send and accept a request; friends-only information is visible only after acceptance and hidden again after unfriending. Private information remains hidden from the other account, confirmed manually.
- Private playlist invitations: hidden before invitation, visible after invitation, accepted and listed in `/playlists/mine`; access is then revoked and returns 403 after removal, confirmed manually.
- Devices: created and visible in the owner’s list, absent from another account’s list, deletion by the other account rejected (404), then deletion by the owner (200) and removed from their list, all confirmed manually in Swagger. Log association is covered by automated tests.
- Private party invitations: hidden before invitation, visible after invitation, accepted and listed in `/parties/mine`; removed from lists and returns 403 after revocation, confirmed manually in Swagger.

Integration tests mock email delivery and social providers. They use real JWT guards, Prisma, PostgreSQL, and migrations.

Results from the October 7, 2026 run: **96 unit tests** and
**25 integration/migration tests** passed in Docker after upgrading to NestJS 11,
Express 5, bcrypt 6 and Jest 30. Lint (`npm run lint`), TypeScript checks
(`npm run typecheck`), and compilation also pass in Docker.
The image was rebuilt with `npm ci` and anonymous dependency volumes were renewed. Two additional tests verify Swagger request bodies and parameters, as well as login with a password hash created by bcrypt 5.1.1.
The running backend uses NestJS 11.2.7 and bcrypt 6.0.0; Swagger returns HTTP 200.

JWT secret validation at startup is implemented, with no fallback secrets.
The generator replaces only the two JWT values and does not print them.
The GitHub Actions audit/lint/types/tests/build/integration workflow passed for
`c74e20b` in PR #4: [October 8 run](https://github.com/nouhaerr/musicroom/actions/runs/37807903307).
Every backend job step is green. See [CI.md](CI.md).
Both local JWT secrets were replaced with the user’s approval, the backend was recreated, and `.env` correspondence was checked without displaying any secret.
Swagger returns HTTP 200. Existing tokens and links must be replaced.

## Swagger manual acceptance summary

The user confirmed all flows in the guided checklist above.
This test series is complete for the current backend. Concurrency scenarios,
provider failure, pagination, and log association are covered by automated tests; they are not all claimed as manually tested.
The user has also confirmed native authentication tests on Android and iOS.
Full application acceptance and production checks remain separate tasks.

See [AUTH-USERS.md](AUTH-USERS.md) for routes and expected request bodies.

## Current follow-up

- Native authentication flows have been manually verified on both iOS and
  Android, as confirmed by the user. Other app screens still need their own
  platform acceptance checks; see the [mobile guide](../../music-room-mobile/README.md).
- Control delegation, including remote playlist commands and preview progress,
  is implemented. Test remote playback with two online devices before
  presenting it as fully accepted.
- API routes and response contracts are documented in Swagger and
  [API.md](API.md). The current docs should be used instead of the historical
  progress notes below for implementation status.
- Production readiness remains separate: configure HTTPS, environment-specific
  secrets and suitable rate limits; complete Meta publication requirements and
  finalize the hosted legal pages and real data-deletion process.

## Update — October 11, 2026

- iOS acceptance confirmed by the user: the email remains displayed after a login
  403, and the message disappears after seven seconds.
- Success/error notifications are in English and expire after seven seconds
  in auth, profile, and friends. Validation under form fields remains visible.
- Native Facebook: sign-up/login buttons and explicit linking from the profile.
  iOS Limited Login validates the Meta RS256/JWKS signature, audience, issuer,
  expiration, and nonce; Android uses `debug_token` and identity checks. The
  user has confirmed native authentication tests on Android as well as iOS.
- Local durations checked: access token 15 minutes, refresh token 7 days. Each rotation
  extends the session; no absolute maximum session lifetime is currently enforced.
  The server applies the same rule to web and mobile clients. Logout revokes one session;
  password reset and replay of a consumed refresh token revoke all sessions for that account.
- Do not treat mobile logic tests as simulator UI tests.


## Profile and settings — October 12, 2026

- User confirmed the manual iOS authentication scenarios: Google/Facebook login,
  cancellation and explicit linking, restoration after closing the app, remaining
  signed out after logout, verification/reset links with the app closed.
- Profile screen follows `MobileDesign/Profile.png`: editable public name, display
  handle and bio; friends-only city; private birthday;
  public genres and favorite artists; linked accounts; backend address; logout.
- Each editor PATCHes only its relevant section and preserves unrelated JSON keys.
  The handle is a display label, not a unique username or login identifier.
- Password accounts can request the existing reset email from Private information.
  Social-only accounts show that no password is set. No password-creation flow added.
- Authenticated `DELETE /auth/link/google` and `/auth/link/facebook` return the
  updated own profile. Removal retains existing sessions and requires another
  social provider or a password with a verified email. A row lock prevents concurrent
  removals from leaving the user without a sign-in method. Own profiles expose
  `hasPassword`, never the password hash.
- The unused listening-activity switch has been removed. Bottom navigation opens
  the account's rooms, playlists and devices; full room and playlist workflows
  are implemented in the current mobile app.
- Validation: 344 backend unit tests, 29 auth/users integration tests in a disposable
  database schema, 54 mobile tests, both TypeScript checks, backend lint and iOS
  export passed. The top of the profile and navigation were inspected in the iOS
  simulator; new edit/unlink controls still need manual UI acceptance.

### Profile manual acceptance

1. Edit each section, save, leave the profile and return: verify persistence.
2. Inspect another user's profile as a friend and non-friend: private birthday/email
   must never appear; city is available only to friends.
3. Link Google/Facebook, then unlink one. Unlinking the last usable method must
   show an English error and keep the provider connected.
4. Request a password reset from Private information, follow the email and confirm
   existing sessions are revoked once the password changes.
5. Change the backend URL: confirm local configuration persists and you are signed out.
6. Check validation/error/success messages disappear after seven seconds; inspect
   all sections on a small screen and with larger accessibility text.


## Public profile photos — October 12, 2026

- Added authenticated PUT/DELETE `/users/me/avatar`, a bounded JPEG thumbnail,
  256px server re-encoding and metadata removal. Stored in `publicInfo.avatar`.
  The normal profile PATCH preserves the server's photo and ignores incoming
  avatar fields, preventing stale edits or bypassing the dedicated validator.
- Mobile: library picker/crop, replace/remove, initials fallback, photo display in
  profile and people screens. Native rebuild required for the new Expo modules.
- Validation: 351 backend unit tests and 55 mobile tests pass; the focused photo
  integration test passes against an isolated schema. Backend lint, both TypeScript
  checks, iOS JavaScript export and the native iOS build pass (0 errors). Real photo selection remains a manual test.
- UI acceptance steps and limitations: `music-room-mobile/docs/PROFILE.md`.


## Unique usernames and social password setup — October 13, 2026

- Optional `User.username` now has a unique index and lowercase ASCII format
  constraint (3–30 letters, numbers, underscores). PATCH normalizes it; competing
  claims return 409. Names and usernames are searchable. Email remains the login ID.
- Migration `20261012010000_unique_username` applied locally. It imports only valid,
  unambiguous legacy handles while retaining the original JSON for reference.
- Authenticated, throttled POST `/auth/password/setup` emails a single-use 30-minute
  password link to social-only users. Existing password accounts receive 409.
  Completion verifies the email, sets the hash and revokes every session. Social
  provider links are preserved. The token's email must still match the account.
- Mobile provides Create password, and the password-link form now works while
  signed in. The normal reset/login flows remain available.
- Validation: 351 unit tests, 34 auth/migration integration tests, 56 mobile tests;
  TypeScript and backend lint pass. Manual receipt/opening of the setup email and
  duplicate username feedback in the app remain acceptance checks.


## PR #6 profile review follow-up

- User search and other-user profiles now require an authenticated session.
- Registration and profile updates trim display names and reject whitespace-only names.
- Profile sections accept at most 20 short text fields (key: 50 characters; value: 500).
  A guard validates these before DTO transformation to reject deeply nested JSON with 400.
- Photos still use the dedicated avatar routes; echoed avatars from older clients are ignored.
- The unused listening-activity preference is no longer displayed or submitted by the mobile app.
- Validation: 351 backend unit tests, 39 auth/users integration tests in an isolated
  schema, 60 mobile tests, both TypeScript checks and backend lint passed.
