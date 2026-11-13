# Sonora web

Responsive React + TypeScript client for the Music Room web bonus, built with Vite. It uses the existing NestJS API; this is not a Next.js project.

## Run locally

Use Node.js 24 LTS (the initial scaffold was checked with 24.18.0).

```sh
cd music-room-web
npm ci
cp .env.example .env
npm run dev
```

Open http://localhost:5173. Start the backend separately from `music-room-api` with `make` when implementing API features. `VITE_API_URL` defaults to `http://localhost:3000`; Vite variables are public browser configuration, never secrets. On another device, localhost refers to that device.

```sh
npm run typecheck
npm run build
npm run preview
```

## What exists now

Responsive navigation, email registration/login, resend verification, manual verification-link processing, password reset and logout are connected to the API. `/account` redirects to `/profile`, which loads the authenticated profile via `/users/me`. Errors/success notices disappear after 10 seconds; password requirements appear on invalid submission.

The portable mobile API client was copied into `src/api` with its session regression tests. Changes to that client must be coordinated with the mobile copy. Run `npm test` to check refresh serialization, logout races, authentication and device adapter behavior; these are mocked client tests, not browser acceptance tests.

Browser sessions survive refresh in the same tab: only the refresh token is stored in `sessionStorage`; access tokens stay in memory. Startup rotates the refresh token once before rendering protected pages. Logout clears storage. Closing a tab normally clears its storage; browser restore/duplicate-tab features can copy it, so logout is the explicit way to revoke a session. Tokens remain accessible to same-origin JavaScript: an HttpOnly-cookie design is a future hardening step. WEB devices register after sign-in, using a persistent localStorage installation UUID and an approximate OS/browser label. Authenticated requests include X-Device-Id.

Password-reset emails requested by the web open the web reset form directly when backend `WEB_APP_URL` is configured (see below). Verification emails still use the backend landing page; the web verification form also accepts the emailed link.

Production hosting must serve `index.html` for browser routes (including email verification/reset links). `vite preview` is only a local build preview, not a production server.

## Work split

| Owner | Feature folders |
| --- | --- |
| Auth/users developer | `src/features/auth`, `profile`, `friends`, `devices`, `invitations`, `access` |
| Rooms/music developer | `src/features/rooms`, `playlists`, `src/realtime` |
| Coordinate together | `src/app`, `src/components`, `src/api`, `src/styles`, dependency files |

Feature pages, components and endpoint adapters live inside their feature folder. Shared UI goes in `src/components/ui`; shared layout in `src/components/layout`. Replace placeholder elements in `src/app/App.tsx` as pages become functional. The playlist owner action should link to `/playlists/:playlistId/access`.

Agree on the shared HTTP/session client contract first: current user, authenticated requests, refresh, logout, device registration and `X-Device-Id`, consistent errors. Reuse backend contracts and portable mobile logic where appropriate, but do not import Expo SecureStore or native SDKs into the browser. Web authentication uses email/password and Google; Facebook remains mobile-only. Persistence across browser restarts is not provided.

## Branch workflow

The shared starting branch is `feat/web-auth-users-social`. The rooms developer can create a separate branch from it:

```sh
git fetch origin
git switch -c feat/web-rooms origin/feat/web-auth-users-social
```

Each developer commits their own feature changes. Coordinate changes to shared files and review integration before merging to main. The web client includes a demo Free/Premium plan switch. Free accounts can
create up to three playlists; Premium accounts can create unlimited playlists.
The plan and limit are enforced by the API, not only by the web UI. IoT and
offline bonuses are not implemented.

After pulling subscription changes, restart the API from the same branch and
apply the migration before using the switch:

```sh
cd music-room-api
npm run prisma:generate
npm run prisma:deploy
npm run start:dev
```

Google sign-in exchanges browser credentials with the backend. Configure `VITE_GOOGLE_CLIENT_ID` in `.env` and authorize the web origin in Google Cloud. Facebook remains available in the mobile app only.

## Web profile and password emails

The profile supports section editing, social linking and JPEG/PNG/WebP photo selection (up to 10 MB). Photos are cropped and compressed to a 256px JPEG before upload; the backend validates/re-encodes them.

Set backend `WEB_APP_URL=http://localhost:5173` locally (the deployed web origin in production), then recreate the backend container. Web forgot-password and password-setup requests send `client: "web"`; emails open `/auth/reset-password?token=...` directly on that configured origin. Mobile requests keep their existing link. Request a new email to test; already-sent links are unchanged. Never accept an arbitrary destination URL from the request.

## Friends

`/friends` provides Friends, Requests and Discover views using the existing social API.
Search supports names/usernames and a genre filter. Lists use 20-item pages; requests
can be accepted, declined or cancelled, and removing a friend asks for confirmation.
Opening a person fetches their profile again and displays only the visibility sections
returned by the backend. Action feedback lasts 10 seconds; loading errors offer Retry.

## Devices

`/devices` lists mobile and browser registrations with paginated results, device details and a
confirmed detach action. Detaching revokes sessions associated with that device. The add action
explains automatic registration after sign-in. Browser registrations are supported and the matching registration is labelled This device.
