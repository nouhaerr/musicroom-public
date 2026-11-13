# Technical choices: authentication, users, and social features

Status as of October 8, 2026. This justification covers the components in this
workstream; it does not validate every service in the project. For rooms,
playlists, and real time, see [TECH-CHOICES-MUSIC.md](TECH-CHOICES-MUSIC.md).

| Choice | Why it fits the project | Trade-offs and limitations |
|---|---|---|
| NestJS + TypeScript | Separate auth, users, friends, invitations, and devices modules; dependency injection makes SMTP/OAuth replaceable in tests; shared guards protect routes. | Decorators and injection take time to learn. Types do not validate a remote response at runtime. |
| PostgreSQL | Relations, foreign keys, and unique constraints for accounts, invitations, and votes; transactions for concurrent mutations. | Constraints do not replace application permissions. Lock order must be consistent and races must be tested. |
| Prisma | Typed client and versioned migrations; same schema for development and disposable tests. | An ORM does not make every operation atomic automatically. The project also uses explicit SQL locks and handles constraint collisions. |
| REST + JSON | Contract accessible through Swagger, `fetch`, and mobile clients; each mutation has a route and identifiable HTTP status. | Every route documents its response in Swagger (see [API.md](API.md)). Real-time flows need an additional layer. |
| JWT + persisted sessions | Signed access tokens, with a database session check to make logout/reset effective without waiting for token expiry. | Database read on protected requests. The client must serialize refreshes; replaying a consumed token revokes all sessions. |
| bcrypt for passwords | Expensive hash, with salt managed by the library; cost 12 in this application. | CPU cost must be measured under load. Hashing alone does not stop online guessing; rate limiting is also needed. |
| SHA-256 for refresh/reset tokens | Compare a database hash without storing usable tokens in plaintext. These tokens are not user-chosen passwords. | Security also depends on random signing secrets and secure client-side token storage. |
| SMTP via Nodemailer | Isolated sending service, testable and environment-configurable; sends real verification and reset emails. | SMTP outages happen. Resend/reset keep a generic response; deliverability depends on the provider and its configuration. |
| Server-validated social OAuth | Backend validates Google/Facebook tokens, then issues its own sessions. A shared email address alone never merges accounts. | Provider settings, permissions, and native SDKs must be tested separately. |
| Docker + Make | Shared Node/PostgreSQL versions and migrations at startup; common commands for developers. | Current container is for development. Production requires appropriate handling of mounts, Linux permissions, and secrets. |
| React Native + Expo | Shared TypeScript foundation and development tools for Android/iOS. The client uses the HTTP contract and does not access PostgreSQL directly. | Native Google/Facebook require a development build and platform credentials; a JS export does not prove the app works on a phone. |
| Expo SecureStore | Stores the refresh token using platform secure storage; access token remains in memory. | Does not replace HTTPS or server-side revocation. Here, a lost refresh response requires signing in again to avoid token replay. |
| Jest, PostgreSQL tests, and GitHub Actions | Check services separately, then real routes/transactions; run checks on pull requests. | Providers are mocked in the suites. Real-provider, load, and platform acceptance checks remain complementary; native authentication has been manually confirmed on iOS and Android. |

## Alternatives considered

Using Express alone would require fewer conventions at first, but more assembly
for the modules and dependency injection used here. Writing all SQL manually
would provide direct control at the cost of more mapping and migration code.
JWTs without database sessions would simplify some reads, but would not support
the immediate revocation chosen for this project. These comparisons explain the
trade-offs; they are not benchmarks.

## Evidence and shared work

The [backend CI run for commit c74e20b](https://github.com/nouhaerr/musicroom/actions/runs/37807903307)
passed. The [status report](AUTH-USERS-STATUS.md) distinguishes automated tests
from those confirmed manually. The [mobile guide](../../music-room-mobile/README.md)
describes available screens and remaining checks.

The justification for Socket.IO/Redis and capacity figures should be completed
with the real-time workstream owner, based on that implementation and its
measurements. No maximum user count is inferred from functional tests.
