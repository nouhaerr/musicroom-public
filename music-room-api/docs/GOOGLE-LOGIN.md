# Google Login — backend and Expo app

The backend receives a **Google ID token** at `POST /auth/google`, validates it with
`google-auth-library`, and returns its own `accessToken`, `refreshToken`, and `user`.
Validation covers the signature, audience, issuer, expiration, and verified email.
Google public keys are cached. Tokens are not sent to `tokeninfo` or written to
provider logs.

## Backend web client configuration

In [Google Cloud Console](https://console.cloud.google.com/), select the Sonora
project, then Google Auth Platform. Configure Branding and Audience (external for
personal accounts). If the app is in testing mode, add team accounts to the test
users list if needed. Only the `openid`, `email`, and `profile` sign-in scopes are
needed here.

Under Clients, create a **Web application** client named `Sonora Backend`. Its
client ID is the audience expected by the backend and is also used as the mobile
SDK's `webClientId`; using a Web client is intentional, even for Android/iOS.

In the backend `.env`:

```dotenv
GOOGLE_AUTH_ENABLED=true
GOOGLE_CLIENT_ID=WEB_CLIENT_ID.apps.googleusercontent.com
```

The flow uses an ID token: `GOOGLE_CLIENT_SECRET` and `GOOGLE_CALLBACK_URL` are
not used. No `/auth/google/callback` route is needed. Gmail SMTP credentials are
independent of Google Login.

After installing new dependencies, run `make`. After changing only `.env`:

```bash
docker compose up -d --no-deps --force-recreate backend
```

## Test in a browser before testing on mobile

In the Web client settings, add these **Authorized JavaScript origins**:

```text
http://localhost
http://localhost:8085
```

This test uses a JavaScript callback in a Google popup. Leave redirect URIs empty
if no other flow requires them. Google configuration changes may take a little
time to propagate.

From `music-room-api`, on a Mac with Node 22 and dependencies installed, run:

```bash
npm run google:test
```

Open **http://localhost:8085**, choose a Google account, then click **Test Sonora
sign-in**. This may create an account and opens a session in the real local database.
The page shows the result without displaying session tokens. Swagger lets you copy
the `{ "idToken": "..." }` JSON body. Close the page and stop the server with
Ctrl+C when finished.

This tool listens only on the Mac's loopback interface. It exposes the public
client ID and `APP_URL`, never `.env` contents. No token is written to disk or
localStorage. It tests the backend with Google but does not replace Android and
iOS device tests.

### Existing email account: expected 409

If the Google email already belongs to a password account, the backend refuses
to merge the accounts automatically. In Swagger:

1. Call `POST /auth/login` with that account.
2. Paste its Sonora access token into **Authorize**.
3. Call `POST /auth/link/google` with the ID token JSON copied from the page.
4. Call `POST /auth/google` again; sign-in should now succeed.

A client ID is not an ID token: the former identifies the app, while the latter
is obtained after the user signs in to Google.

## Expo Android/iOS setup

The Expo project is the mobile frontend folder (screens, navigation, buttons),
with `app.json` or `app.config.*`. An email/session app foundation is available
in [`music-room-mobile`](../../music-room-mobile/README.md). Google sign-in and
linking are integrated in the mobile app via `react-native-nitro-google-signin`;
native client IDs and real-device acceptance still need to be completed. See the
[native Google guide](../../music-room-mobile/docs/GOOGLE-NATIVE.md). Facebook
native integration remains separate. The native Google SDK requires an Expo
development build; Expo Go is not sufficient.

Create native clients in the **same Google Cloud project** once you know their
identifiers:

| OAuth client | Required values | Use |
|---|---|---|
| Web | Existing client ID | Backend `GOOGLE_CLIENT_ID` and mobile `webClientId` |
| Android | `android.package` and SHA-1 of the certificate signing the tested build | Identifies the Android app |
| iOS | `ios.bundleIdentifier` | iOS client and the plugin's reverse URL scheme |

For Android, local signing, EAS builds, and Play Store signing may use different
certificates; configure the fingerprints for the builds you actually use. For
iOS without Firebase, the `react-native-nitro-google-signin` plugin uses
`iosUrlScheme`, derived here from the Google iOS client ID.

Configure the mobile SDK with the shared Web client and the iOS client. Send its
`idToken` to the backend, then use Sonora JWTs for other routes. Serialize refresh
requests and store the refresh token in the platform's secure storage. Do not put
OAuth or SMTP secrets in public Expo environment variables.

## Useful errors

- 400: invalid JSON body (for example, an empty or too-long token).
- 401: invalid signature/claims, expired token, wrong audience, or unverified email.
- 409: an email account already exists; explicit account linking is required.
- 503: Google Login is disabled or public keys could not be retrieved.
- Google `origin not allowed` error: check the **Web client** origins and open
  exactly `http://localhost:8085`.

Provider tests use real RSA signatures and mock only certificate downloads. They
cover invalid signatures, audience, expiration, or identity, as well as unavailable
keys.

References: [Google server-side validation](https://developers.google.com/identity/sign-in/web/backend-auth),
[Google Web configuration](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid),
[Expo Google Authentication](https://docs.expo.dev/guides/google-authentication/),
[native client configuration](https://react-native-google-signin.github.io/docs/setting-up/get-config-file),
[Expo plugin](https://react-native-google-signin.github.io/docs/setting-up/expo).
