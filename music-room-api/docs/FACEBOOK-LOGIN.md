# Facebook Login: setup and testing

## Backend configuration

Set `FACEBOOK_CLIENT_ID` (App ID) and `FACEBOOK_CLIENT_SECRET` in `.env`. Keep
the secret on the backend only; never put it in the mobile app, screenshots, or
version-controlled files.

After changing `.env`:

```sh
docker compose up -d --no-deps --force-recreate backend
```

Without these values, Facebook routes return 503.

## Get a user token for manual testing

1. In Meta Developers, select the Sonora app.
2. Under **Use cases → Facebook Login → Customize**, enable `email` in addition
   to `public_profile` for testing.
3. In Graph API Explorer, select **Sonora** and **User Token**.
4. Select `email`, generate a new token, and approve the permissions.
5. Run `GET /me/permissions`: `email` and `public_profile` must be granted.
6. Run `GET /me?fields=id,name,email` and confirm all three fields are present.

Selecting a permission in the Explorer does not change a token that was already
created. If email is still missing, check granted permissions and the confirmed
address on the Facebook account. The backend rejects a profile without an email;
it does not invent one.

## Test in Swagger

`POST /auth/facebook` takes the **Facebook user token**:

```json
{ "accessToken": "FACEBOOK_USER_TOKEN" }
```

- New email: create an account and return Sonora tokens.
- Facebook identity already linked: sign in to the same user.
- Email belongs to an existing account but the identity is not linked: return
  409 without automatically merging accounts.

For the 409 case, sign in to the existing Sonora account, paste its **Sonora
access token** in **Authorize**, then call `POST /auth/link/facebook` with the
Facebook user token in the JSON body. Call `POST /auth/facebook` again; the
Sonora user ID should remain the same.

A Facebook token is not a Sonora JWT. Do not use it in **Authorize** for
`/users/me` or other protected routes.

## Provider checks

The backend calls `debug_token` and checks validity, intended app, user ID, and
provided expirations. The `/me` profile must belong to the same user and contain
a non-empty email.

Important distinction: `debug_token` validates the Facebook identity and app,
not ownership of the email inbox. Our `/me` request does not retrieve an
`email_verified` indicator. `createFromSocial` currently sets `emailVerifiedAt`
for both Google and Facebook. This Facebook assumption still needs to be
replaced with Sonora email verification or justified by a current provider
guarantee; the review did not confirm such a guarantee. Automatic merging with
an existing account remains disabled.

- Rejected token, wrong app, inconsistent user, or missing email: 401.
- Meta unavailable, timeout, HTTP 429/5xx, or unreadable JSON: generic 503.
- Empty token or token longer than 16,384 characters in the route body: 400.

Raw Meta responses, network details, and tokens are not copied into provider
errors returned to the client.

## Test status updated November 5, 2026

- Explicit linking followed by sign-in to the existing account, without a
  duplicate: manually confirmed by the user with a real Facebook token.
- New account creation, stable identity, collisions, and session isolation: covered
  by integration tests with a mocked provider.
- Meta response validation, expirations, and outages: unit tests, no live calls.
- Native Facebook login and explicit linking are integrated in the mobile app.
  The user has confirmed authentication testing on both iOS and Android; this
  does not replace production Meta review or testing every app screen.

## Publication deferred

Sonora is not published. Development-mode tests are restricted to accounts with
a role on the app (administrator, developer, or tester). Invited people must
accept their role. See the [Facebook Login testing guide](https://supabase.com/docs/guides/auth/social-login/auth-facebook#testing-your-integration).

Meta review, privacy information, and the data deletion process must be completed
before public launch according to the dashboard requirements. Files in
`../../sonora-legal/` are local drafts, not published pages.
