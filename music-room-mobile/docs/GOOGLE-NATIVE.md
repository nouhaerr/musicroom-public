# Google sign-in and account linking in Sonora

The mobile app uses `react-native-nitro-google-signin` (Credential Manager on
Android and Google Sign-In on iOS), without Firebase. A compiled development
build is required. Expo Go can still be used for email and non-Google social
flows; its Google button explains the limitation without loading the native module.

## 1. Create the iOS client

In [Google Cloud Console](https://console.cloud.google.com/), select the same
project as the Web client already used by the backend. Go to
**Google Auth Platform → Clients → Create client**:

| Field | Value |
|---|---|
| Application type | iOS |
| Name | Sonora iOS |
| Bundle ID | `com.sonora.musicroom` |

Do not replace the existing Web client. If Google asks for an App Store ID or
Apple team, do not invent a value; local testing is not App Store publication.
Use real values if the account has them.

Copy the client ID (it ends in `.apps.googleusercontent.com`) to
`music-room-mobile/.env`:

```dotenv
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=PASTE_IOS_CLIENT_ID_HERE
```

`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` must exactly match the backend's
`GOOGLE_CLIENT_ID`. The local file has already been prepared with this Web ID.
On another clone, copy `.env.example` and enter both IDs. Never put a **client
secret**, JWT secret, or SMTP password in the mobile app. Client IDs are public
in a compiled app, even though they remain out of Git.

The bundle ID is set in `app.json`. `app.config.ts` calculates the reversed URL
scheme from the iOS client ID and enables the related plugins. A local plugin
forwards the OAuth callback to Google while preserving other Sonora/Expo links.

## 2. Build on the Mac

Open Xcode and complete its initial setup, including the license and iOS
simulator installation. CocoaPods must also be available (`brew install
cocoapods` if needed). Xcode 27 and iOS 27 Simulator are available on the
development Mac. `expo-build-properties` enables `enableSceneSupport` for Expo
SDK 57; without it, iOS 27 refuses to start. Google callbacks and other links
pass through Expo's scene delegate to the AppDelegate.

From the mobile directory:

```sh
npm ci
npm run dev:ios
```

This command validates the IDs, generates/compiles the native project, and opens
the simulator. To restart Metro with the already-installed app, run
`npm run start:dev`. After prebuild, `npm run ios` and `npm run android` are
Expo-generated build shortcuts. Prefer `dev:ios` / `dev:android` to check IDs
before compiling. After changing the iOS ID or a plugin, regenerate with
`npx expo prebuild --platform ios`, then run `npm run dev:ios` again. Generated
native directories remain ignored by Git.

## 3. Android

Also create an **Android** OAuth client in the same Google project, using the
package `com.sonora.musicroom` and the SHA-1 of the certificate that actually
signs the test build. You need the Android SDK, Java, an emulator with Google
Play Services, and the test certificate. Run `npm run dev:android`, then use
Gradle's signing report (`./gradlew signingReport` in the generated `android`
directory) to find the actual fingerprint. Do not send the Android client ID
instead of the Web client ID. Distributed builds may use another certificate;
configure those SHA-1 fingerprints too.

## Sign-in and acceptance checks

- **Continue with Google**: choose an account; only the ID token is sent to
  `POST /auth/google`. The backend checks signature, audience, expiration, and
  verified email, then issues a Sonora session. Only the Sonora refresh token is
  stored in SecureStore.
- **409 for an existing email**: no automatic linking. Sign in using the usual
  method, open **My profile → Link Google**, confirm, and choose the account.
  `POST /auth/link/google` uses the current Sonora session and device.
- Canceling sends nothing to the backend; if a session closes while the account
  picker is open, no late request is sent. Linking a Google account owned by
  someone else keeps the current Sonora session intact and shows the conflict.
- After linking, sign out and test Google again. Confirm no second user was
  created. Also test an unknown Google account, cancellation, network failure,
  and session restoration after restarting the app.

On October 10, 2026, the iOS build succeeded and Sonora appeared in the iPhone
18 Pro / iOS 27 simulator. The first launch required reopening the Expo link
after the launch timed out. If `--localhost` listens only on `::1` while the app
requests `127.0.0.1`, restart Metro with
`npm run start:dev -- --lan --port 8082`, then open `http://127.0.0.1:8082` in
the development client. Start the backend separately to test accounts.

Real native sign-in still needs **acceptance testing**. Tests use a simulated
SDK and network; JS export is not an iOS/Android build. The iOS scheme was
checked with a fake ID through Expo config; the real browser callback must be
tested in the build. No unlink button is added here because the backend does not
provide that operation. Native Facebook is a separate task.

References: [Expo Google](https://docs.expo.dev/guides/google-authentication/),
[native setup](https://react-native-nitro-google-sign-in.github.io/docs/setup/expo/),
[Google flow and server validation](https://react-native-nitro-google-sign-in.github.io/docs/guide/usage/).
