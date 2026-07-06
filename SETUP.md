# Still — setup guide

Production setup for the full stack: Expo app with native Google sign-in
(Firebase Auth), a Go backend on Firestore, and Gemini voice transcription.

```
Mobile (Expo dev build)
  Firebase Auth (native Google Sign-In) ──► Firebase ID token
        │  Authorization: Bearer <idToken>
        ▼
Go backend  ── verifies token (Firebase Admin) ─► uid
  • Firestore (Admin SDK): users/{uid}/entries, /insights, profile
  • Gemini: audio ─► transcript
```

> **Important:** native Google sign-in uses native modules, so the app **cannot
> run in Expo Go**. You need a development build (`expo prebuild` + `run`, or EAS).
> A local dev mode (below) lets you exercise the backend without any of this.

---

## 1. Prerequisites

- **Node 20+** (`nvm use 20` or `22`) — Expo SDK 57.
- **Go 1.25+**.
- A **Firebase project** (free tier is fine).
- A **Gemini API key** (Google AI Studio).
- For iOS builds: Xcode + CocoaPods. For Android: Android Studio / SDK.

---

## 2. Firebase project

1. Create a project at <https://console.firebase.google.com>.
2. **Authentication → Sign-in method →** enable **Google**.
3. **Add apps** for the platforms you target, using these bundle/package ids
   (from `mobile/app.json`): iOS `com.still.journal`, Android `com.still.journal`.
   - iOS: download **`GoogleService-Info.plist`** → place at `mobile/GoogleService-Info.plist`.
   - Android: download **`google-services.json`** → place at `mobile/google-services.json`.
   - For Android Google Sign-In, add your app's **SHA-1** (debug + release) in
     Firebase project settings.
4. Get the **Web client ID**: Firebase console → Authentication → Google
   provider (or Google Cloud → APIs & Services → Credentials → OAuth 2.0 Client
   IDs → *Web client (auto created by Google Service)*). You'll set this as
   `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
5. **Firestore:** create a Firestore database (production mode).
6. **Service account** (for the backend): Project settings → Service accounts →
   *Generate new private key* → download the JSON. Keep it secret.

---

## 3. Backend (`server/`)

Environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Listen port | `8080` |
| `AUTH_MODE` | `firebase` (verify tokens) or `disabled` (dev) | `firebase` |
| `STORE` | `firestore` or `memory` (dev) | `firestore` |
| `FIREBASE_PROJECT_ID` | Your Firebase project id | — |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to the service-account JSON | — |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Inline service-account JSON (alt to the path) | — |
| `GEMINI_API_KEY` | Enables `/api/transcribe` and insight generation | — |
| `GEMINI_MODEL` | Gemini model id | `gemini-2.5-flash` |
| `CORS_ORIGINS` | Allowed origins | `*` |

### Production run

```sh
cd server
export FIREBASE_PROJECT_ID=your-project-id
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
export GEMINI_API_KEY=your-gemini-key
go run ./cmd/server
```

### Local dev run (no Firebase, no Firestore)

Exercise the API with `curl` without any cloud setup:

```sh
cd server
AUTH_MODE=disabled STORE=memory GEMINI_API_KEY=your-gemini-key go run ./cmd/server
# All requests use a fixed "dev-user"; data lives in memory.
```

`/api/transcribe` still needs a real `GEMINI_API_KEY` (returns 503 without one).

---

## 4. Mobile (`mobile/`)

1. Place `google-services.json` and `GoogleService-Info.plist` in `mobile/`.
2. Create `mobile/.env` from `.env.example`:
   ```sh
   EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8080
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
   ```
3. Install and make a **development build** (Expo Go will not work):
   ```sh
   nvm use 22
   npm install
   npx expo prebuild --clean
   npx expo run:ios      # or: npx expo run:android
   ```
   Or use EAS: `eas build --profile development --platform ios` (and `android`).

Once installed, open the dev build (not Expo Go). Sign in with Google, write
entries (they sync to Firestore), record a voice note (transcribed by Gemini).

> Signed **out**, the app still runs fully offline on local storage with seed
> data. Signing in switches to your Firestore-backed account and unlocks
> transcription.

---

## 5. Data & security

Firestore layout, scoped per user:

```
users/{uid}                     ← ProfileSettings
users/{uid}/entries/{entryId}   ← JournalEntry
users/{uid}/insights/{period}   ← InsightDigest  (period = weekly | monthly)
```

All writes go through the Go backend, which verifies the Firebase ID token and
only ever touches the authenticated user's subtree — the app never holds the
service account or the Gemini key. Add matching Firestore **security rules**
(deny direct client access; the Admin SDK bypasses rules) for defence in depth.

---

## 6. Verify

```sh
# Backend
cd server && go vet ./... && go build ./...

# Mobile
cd mobile && nvm use 22 && npm run typecheck && npx expo-doctor
```
