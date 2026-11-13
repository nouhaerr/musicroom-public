# Security: authentication, users, and social login

This note describes existing protections and their limitations. It is not a
complete security audit of the product.

| Risk | Implemented protection | Automated evidence |
|---|---|---|
| Repeated login attempts | 10 login requests per minute per IP; passwords hashed with bcrypt, cost 12 | Integration: the 11th attempt receives 429 through the real guard |
| Refresh token replay | SHA-256 hash in the database, transactional rotation, all sessions revoked on replay | Session and concurrent integration tests |
| Session use after logout/reset | Session checked in the database on every protected request; logout/reset revoke sessions | Integration: old access and refresh tokens are rejected |
| Reuse of a reset link | Hashed in the database, expires, single use, and invalidates other links | Integration with two simultaneous resets |
| Social identity substitution | Google: signature, issuer, audience, expiration, verified email; Facebook: `debug_token`, matching app, user, and profile | Provider tests with invalid responses |
| Account merging by email | 409 if the email already exists; linking requires a Sonora JWT and a valid social token | Google and Facebook integration tests |
| Private profile/resource data leak | Explicit field selection and friendship, visibility, and active-invitation checks | Profile, search, and invitation integration tests |
| Use of another user's device | Device attached to logs only for its owner; deletion scoped to owner | Device integration tests |
| Social provider tokens leaked in errors | Generic outage messages; raw Meta responses and provider network errors are not returned | Network, JSON, and HTTP error tests |

Verification resend and forgot-password routes return the same message when an
account is missing or SMTP fails. This does not guarantee timing indistinguishability;
registration explicitly returns 409 when an email is already in use.

## Deployment limitations to address

- Secret-format checks do not prove entropy. Use the provided generator or a
  cryptographic generator, and store secrets in a deployment-appropriate secret
  manager.
- The current rate limiter uses one instance's memory and its interpretation of
  the client IP. Deployments behind a proxy or across multiple instances require
  configuration and specific tests; do not blindly trust client-provided IP headers.
- A stolen access token remains usable until its session is revoked or it expires.
  Refresh replay protection does not prevent every form of session theft.
- HTTPS and secure token storage on Android/iOS depend on deployment and frontend
  configuration. Backend tests do not validate them.
- Mail `log` mode prints links in development and is prohibited with
  `NODE_ENV=production`. Use SMTP for real email.
- Retention of consumed sessions, logs, and backups, as well as data deletion,
  requires a policy and an operational process.
- `ActionLogMiddleware` records completed HTTP responses on matched routes,
  including guard rejections (for example, 401), with status, platform, model,
  and version. Unmatched URLs and 429 responses are excluded before database
  access to avoid amplifying writes. A 404 for a missing resource on a matched
  route is still logged. The mobile app sends `X-Device-Platform`,
  `X-Device-Model`, and `X-App-Version` even before login (values encoded with
  `encodeURIComponent`). These metadata headers are descriptive and length-limited,
  never proof of identity. `X-Device-Id` is attached only if the device belongs
  to the authenticated user. The model remains in `metadata.deviceModel` after
  detachment. Only the HTTP method and route pattern are recorded: no body, query
  string, token, or exception message. Writes are asynchronous and best effort.
  Purely local interactions without an HTTP request and connections interrupted
  before a response completes are not covered. These logs do not replace monitoring.

Load tests and protections specific to the music modules are outside this note.

## JWT secret configuration

Configuration is validated by `ConfigModule` before services are instantiated.
Both secrets are required in every environment and must be different, contain
no spaces, and be at least 32 bytes long. The values `change_me`, `replace_me`,
old `dev_*_secret` values, and values made of a single repeated character are
rejected. Errors never include the secret values. Services use `getOrThrow`;
there is no fallback value for signing tokens.

On the first `make`, if `.env` does not exist, the generator creates it from the
template and generates two independent values with `crypto.randomBytes(32)`.
An existing file is never rewritten automatically at startup.

On Linux/macOS, the generator runs with the host user's UID/GID. On Windows, this
mapping is omitted; the `//usr/src/app` path avoids Git Bash path rewriting.
Install `make` in the shell you use. A newly created file keeps POSIX mode
`0600` (Windows ACLs depend on Docker Desktop). Secret rotation preserves
existing permissions.

Compose reads `.env` with host permissions and injects the variables into the
backend. `CONFIG_IGNORE_ENV_FILE=true`, set in Compose, prevents Nest and the
SMTP diagnostic from reopening the file mounted with UID 1000. Launches outside
Compose continue to load `.env` normally. Injected secrets are still validated.
Do not make `.env` world-readable to work around a UID issue.

The `test/docker-startup.cjs` test runs only in a disposable Linux container as
root, with `SONORA_DISPOSABLE_STARTUP_TEST=true` and `TEST_DATABASE_URL` pointing
to a disposable database. After `npm run build`, it creates an `.env` as UID
4242, tests that it is not overwritten and can be rotated, then starts Prisma
and the backend as UID 1000. It checks `/docs` and rejection of a weak secret.
Never run it in a container containing a development `.env`.

To intentionally rotate secrets from the `music-room-api` directory:

```sh
make secrets
docker compose up -d --no-deps --force-recreate backend
```

Alternatively, with Node installed on the host, run
`npm run security:generate-secrets`. Only `JWT_ACCESS_SECRET` and
`JWT_REFRESH_SECRET` are replaced; their values are not printed. SMTP/OAuth
settings and database accounts are preserved. Rotation invalidates old access
tokens, refresh tokens, and verification/reset links. Sign in again or request a
new link. Across multiple instances, coordinate the update of both secrets.

## Dependencies

Recheck on October 9, 2026: the production audit still reports zero issues. A
new critical advisory affected Handlebars 4.7.9 in development tooling; the
lockfile now uses 4.7.10. The full audit reports 20 moderate entries, with no
high or critical entries. No forced major upgrade was applied.

After the October 6, 2026 update, `npm run security:audit`
(`npm audit --omit=dev`) reports no known vulnerabilities, down from 16 entries,
including 2 critical. This result depends on the npm registry at the audit date;
it does not guarantee the product is free of vulnerabilities.

The project now uses NestJS 11.2.7 / Express 5, bcrypt 6, and Jest 30. Node 22
and Prisma 5.22 are retained. `expiresIn` types follow those from `@nestjs/jwt`.
A limited override replaces the `js-yaml` 5.3.0 pinned by `@nestjs/swagger`
with a fixed compatible version 5.4.3 or later in the same major. Fixes for
`brace-expansion` 1.1.21 and `fast-uri` 3.1.8 are locked in the lockfile. No
`npm audit fix --force` was used.

The full audit, including development tools, still reports **20 moderate
entries**, with no high or critical entries, down from 65 before this update.
They come from one `sprintf-js` advisory through `argparse` 1, `js-yaml` 3, and
Jest/ts-jest coverage tools. At the time of this check, the registry offered no
fixed version of `sprintf-js`. This count includes indirectly affected packages;
it does not represent 20 distinct vulnerabilities. Follow
[GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) and
update this dependency chain when a compatible fix becomes available. The
development Docker image installs these tools, so the `--omit=dev` audit does
not mean the entire image has no advisories.

CI checks the production audit. Run `npm audit` to monitor development tools too.

## Device installation identity

`POST /devices` accepts an optional UUID `installationId`. A database unique
constraint on `(userId, installationId)` makes registration idempotent,
including concurrent calls, and updates the model/app version. The UUID
identifies an app installation and never replaces JWT authentication or
ownership checks. Separate accounts keep separate registrations. Legacy
clients without this UUID retain the previous create behavior; legacy rows are
preserved because their physical identity cannot be inferred safely.
