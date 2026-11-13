# Local checks and GitHub Actions

## What are CI and lint for?

**Lint** analyzes code without starting the application. It catches issues such
as unused variables or suspicious constructs. Here it runs ESLint and
typescript-eslint via `npm run lint` (or `make lint` in Docker). It complements
tests; it does not prove that login or invitations work.

**CI**, or continuous integration, automatically runs checks on GitHub after a
push or when a pull request is opened. This avoids relying only on tests run on
a developer's computer. For example, a change that breaks login can fail a job
and show a red cross on the pull request. A branch protection rule is required
to make passing CI mandatory before merging.

## How the workflow runs

The `.github/workflows/backend-ci.yml` workflow runs on pushes to `main`, on
`pull_request`, and manually from Actions. A push to a pull request branch does
not trigger duplicate runs. It uses Node 22.23.3 and PostgreSQL 16.15, matching
the Docker development setup. GitHub Actions are pinned by commit.

Steps:

1. `npm ci`: install from the lockfile.
2. `npm run security:audit`: check npm advisories for production dependencies.
3. `npm run prisma:generate`.
4. `npm run lint`: ESLint and typescript-eslint, without rewriting files.
5. `npm run typecheck`.
6. `npm test -- --runInBand`.
7. `npm run build`.
8. `npm run test:e2e`: create temporary schemas and run real PostgreSQL migrations.

The audit queries the npm registry: a newly published vulnerability can fail CI
even when the code has not changed. The result also depends on registry
availability. A full audit including development tools is available with
`npm audit`; its limitations are described in
[SECURITY-AUTH.md](SECURITY-AUTH.md).

The security update on October 27, 2026 keeps NestJS 11 and requires
`multer ^2.5.0` only under `@nestjs/platform-express` through `overrides`. This
works around Multer 2.4.0 still pinned by NestJS 11 and can be removed once a
compatible version includes the fix. The lockfile also updates `body-parser`,
`qs`, and `nodemailer`. The production audit remains blocking.

The workflow's PostgreSQL credentials belong only to its temporary service. It
requires no development/production secrets or OAuth/SMTP provider credentials.
Tests generate their own JWT secrets. The GitHub token can only read the
repository; no step publishes or deploys the API.

The ESLint configuration covers `src`, `test`, Node scripts, and JavaScript
configuration files. Generated Prisma files, `dist`, coverage, and dependencies
are excluded. To apply automatic fixes explicitly, run `npm run lint:fix`.

After changing the lockfile, `make` rebuilds the image and renews anonymous
dependency volumes. To check inside the container:

```sh
make lint
make typecheck
make test
docker compose exec backend npm run build
docker compose exec backend sh -c 'TEST_DATABASE_URL="$DATABASE_URL" npm run test:e2e'
```

Commands can also run on the host with Node and `npm ci`, provided the Prisma
client is generated and `TEST_DATABASE_URL` is reachable from the host.
Integration tests require a role that can create schemas and never reset the
`public` schema.

The backend workflow passed on October 8, 2026 for `c74e20b` in PR #4:
[view the run](https://github.com/nouhaerr/musicroom/actions/runs/37807903307).
A GitHub branch protection rule can require the `Backend CI / backend` job
before merging; the YAML file does not configure that rule.

The separate `mobile-ci.yml` workflow checks the Expo project: TypeScript,
client tests, and export of iOS/Android bundles. It does not build an APK/IPA or
test on a device. Its first GitHub result still needs to be checked after push.

Configuration references: [typescript-eslint](https://typescript-eslint.io/getting-started/),
[checkout](https://github.com/actions/checkout),
[setup-node](https://github.com/actions/setup-node).
