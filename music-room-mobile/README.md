# Sonora mobile

React Native + Expo SDK 58 app, written in TypeScript for Android and iOS.
This directory is independent of `music-room-api`: do not copy the backend's
`.env` file here.

## Features implemented

- Email registration and login, email verification and resend.
- Password reset request and new password form.
- Google and Facebook login, plus explicit account linking. Native integrations
  require a development build and platform-specific OAuth configuration. See
  [native Google](docs/GOOGLE-NATIVE.md) and [native Facebook](docs/FACEBOOK-NATIVE.md).
- View and edit your profile: public, friends-only, and private information,
  profile photo, unique username, and music genres. Fields created by other
  clients are preserved when they are not edited here.
- Find people by name and music genre; view profiles filtered by the server.
- Friends and incoming/outgoing requests: send, accept, reject, cancel, and
  remove a friend (with confirmation). Lists are paginated at 20 items.
- Rooms: discover and create rooms; set public/private visibility and voting
  permissions; search Deezer, suggest tracks, vote, and follow the live queue.
- Playlists: create, search, and add tracks; reorder tracks; manage visibility,
  editing permissions (everyone by default, owner-only, or invitees only), and
  invitations. Shared state updates in real time.
- Devices: view the device list and details, detach a device registration, and
  grant or revoke device control to friends. Delegated remote playlist playback
  reports the Deezer preview progress while the target app is online.
- Room and playlist invitations: view and accept/decline them from their relevant screens.
- Token refresh and logout.
- Change the backend address from the **Server** screen; the setting is stored
  on the device.
- Refresh token stored in Expo SecureStore; access token held in memory only.
- Concurrent requests share a single refresh; there is no retry loop.
- Register the device after authentication, then send `X-Device-Id` on profile
  and social requests, which wait for registration to finish.
- Terms and privacy information are available offline during sign-up in a
  window that preserves the form. The test-version legal text must be finalized
  before release (data controller, hosting, retention, and deletion process).

These features are implemented in the client; this does not mean every flow has
been verified on a physical device. The user has confirmed that native
authentication flows were tested on both iOS and Android. This confirmation
covers authentication; it does not claim that every screen and feature has been
accepted on both platforms.
The in-app legal text is draft test content and must be finalized before release
(data controller, hosting, retention, and deletion process).

## Start the app

1. Start the backend from `music-room-api` with `make`.
2. From this directory, with Node 22 and npm, run:

   ```sh
   npm ci
   npm start -- --go
   ```

3. Open the app with an Expo Go version compatible with SDK 58 on Android/iOS,
   or use an installed simulator (press `i` for iOS or `a` for Android in
   Metro). Email login uses modules available in Expo Go; native social SDKs
   require a dedicated development build (`npm run dev:ios` /
   `npm run dev:android`).
4. Tap **Server** and save the appropriate address:

| Environment | Usual local address |
|---|---|
| iOS simulator on the Mac running the backend | `http://localhost:3000` |
| Standard Android emulator | `http://10.0.2.2:3000` |
| Physical phone on the same Wi-Fi | `http://<Mac-local-IP>:3000` |

On a phone, `localhost` means the phone itself. The firewall and network must
allow connections to the Mac. To check connectivity, open
`http://<Mac-local-IP>:3000/docs` in the phone's browser. Use HTTPS outside the
development network. Docker Compose already publishes port 3000.

The initial address can also be set with `EXPO_PUBLIC_API_URL` in a mobile
`.env` based on `.env.example`. An address saved from the **Server** screen takes
precedence. Changing servers clears the local session to prevent sending tokens
to a different environment.

## Email links

HTTPS email links open a backend page with an **Open Sonora** action. Email
verification activates the account and redirects to `sonora://auth/verified`.
Password reset opens `sonora://auth/reset-password?token=…`; the token is consumed
only when the new password is submitted via POST. Test these links with the app
open and fully closed in a development build. Universal Links / Android App
Links for a public domain still need to be configured.

## Sessions and devices

The stored refresh token is associated with the server address. Before a refresh,
it is removed from storage; the new token is saved only after a valid response.
If the network drops during refresh, the app asks the user to sign in again
instead of replaying a token that may already have been consumed (which would
revoke all sessions on the backend). As a result, opening the app offline with a
saved session requires signing in again after the network returns. There is no
offline mode.

Logout clears the local session and attempts server-side revocation. If the
server does not confirm revocation, the user is notified; the app does not claim
that remote revocation succeeded. A successful password reset also clears the
local session.

`POST /devices` requires a JWT. Device setup occurs on the first protected call
after sign-in or session restoration. Profile and social calls wait for the same
shared setup operation. The saved ID is associated with the server and account;
the paginated `GET /devices` list validates it before reuse in each new mobile
session. If the device was deleted, it is registered again before the business
request. Discovery and registration calls do not yet have a validated
`X-Device-Id`. On failure, the profile shows an error and **Retry** repeats
setup; no business request is sent without an ID. Local logout remains
available. A remote deletion during the current session is detected on the next
sign-in/restoration; there is no real-time deletion notification.

## Checks

```sh
npm run typecheck
npm test
npm run export:native
```

Client tests mock fetch and storage. They cover refresh races, late 401
responses, network/storage failures, logout during refresh, password reset,
server origin, and device registration. A 403 does not trigger a refresh. Profile
visibility is enforced by the backend. Six device tests cover concurrent calls,
pagination, deleted IDs, unavailable server validation, logout during setup, and
revalidation after reconnecting.

Native export creates Android/iOS JavaScript bundles; it is not an APK/IPA build
or a device test. Automated tests do not replace UI and integration checks on
the target platform. Native authentication flows have been manually confirmed
on iOS and Android; the remaining app screens still need platform-specific
acceptance checks.

1. Configure the server and test sign-up → email → verification → login.
2. Check the profile, then close and reopen the app to verify session restoration
   and token rotation.
3. In Swagger, confirm that the device is registered to the correct account.
4. Test logout and return to sign-in, then reset the password and confirm that
   the old password is rejected.
5. Turn off the network during an action: verify a clear message and no retry loop.
6. Check the keyboard, scrolling, buttons, and links on both platforms.

### Profile and friends: test with two accounts

1. With Alice, open **My profile → Edit profile**. Add public, friends-only, and
   private information and music genres (for example, `Jazz, rock`). Save,
   refresh, and confirm the values persist. Canceling an edit should leave the
   server data unchanged.
2. With Bob, open **Friends → Search** and find Alice by name, then by genre
   (`jazz`). Open her profile: only public information and genres should appear;
   email and private information must stay hidden.
3. Send Alice a request. Check that it appears as sent for Bob and received for
   Alice. Try cancel/reject, then send again. A duplicate request should show
   the server conflict.
4. Accept as Alice, refresh as Bob, and reopen the profile. The friends-only
   section should appear, but never the private section. Also test simultaneous
   reciprocal requests.
5. In **My friends**, remove Alice, refresh, and reopen her profile from search:
   friends-only information should no longer appear.
6. With more than 20 entries, browse the pages. Changing filters should return
   to page 1. Also test an empty search and a network error, then tap **Refresh list**.

Profile/social tests check submitted data, visible profile fields, pagination,
conflicts, and a late response after logout. Networking is mocked; these tests do
not replace testing with two accounts against the real backend.

Google and Facebook tests cover cancellation, conflicts, sessions, and late
responses after logout. They do not replace native testing on each platform.

The `mobile-ci.yml` workflow runs typecheck, tests, and export. Check GitHub
Actions for the result associated with the relevant branch and commit. A green
workflow does not prove the app works on a physical device.

## Dependencies and release notes

Before each distribution, rerun the dependency audit and review the latest
results. Alerts change as new versions are published, so an old audit does not
necessarily describe the current state. Never bundle the server's JWT, SMTP, or
Facebook secrets in the mobile app.

References: [Expo project creation](https://docs.expo.dev/more/create-expo/),
[SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/),
[native Google](https://docs.expo.dev/guides/google-authentication/),
[native Facebook](https://docs.expo.dev/guides/facebook-authentication/).

## New password validation

Sign-up and password reset require at least eight characters and one digit
(0–9), in both the mobile app and API. Validation messages under the fields
appear after typing, leaving a field, or submitting; none is displayed initially.
Password confirmation is recalculated when either password changes. Existing
passwords remain accepted by the login route.

### Device metadata and action logs

The API client sends the platform, model (`expo-device`), and app version with
every HTTP request, including registration, login, and password reset. Device
ownership still requires authentication; metadata headers are descriptive only.
The backend records completed HTTP responses on matched routes, including 401,
without bodies or token query strings. Unmatched URLs and 429 responses are
excluded before any logging database access; a missing resource (404) on a
matched route is still logged. Purely local UI interactions are not sent as
action logs.

After pulling the `expo-device` dependency, rebuild the development client with
`npm run dev:ios` (or `npm run dev:android`); a Metro reload alone is not enough.

Device registration uses a random installation UUID stored in secure storage,
independent of the account and backend address. The server upserts
`(userId, installationId)` and refreshes the model/version during registration.
Switching back to an account or using an alias for the same server reuses its
registration. Separate databases have separate registrations. Clearing app
storage can create a new installation identity.

Existing legacy registrations have no installation UUID. They cannot safely be
merged by model (two real phones can have the same model); detach obsolete
entries manually. Apply the new API migration before running this mobile version.

### Playlist access and people

Open **Playlists → Access & people** on a playlist you own. Save Public/Private
visibility and Everyone/Invited people only editing permissions before managing
invitations. Search for a user to invite them; pending and accepted invitations
are listed separately by status, with pagination and removal confirmation.
Invitations appear in the recipient's invitation list; this action does not send
an email reminder. A music icon is shown because playlists have no cover field.

The API adds owner-only `PATCH /playlists/:id/access` and
`GET /playlists/:id/invitations?page=1&limit=20`. Updating settings emits the
existing playlist real-time update after commit. Private playlists remain
restricted to the owner and active invitees regardless of editing permission.

Manual checks: change visibility and reopen the screen; invite a second
account; accept from that account and reopen the owner's screen to see the
accepted status; remove the invitation and verify private access is denied.
Check unsaved-change confirmation and retry after a network failure. This page
does not implement track editing.
