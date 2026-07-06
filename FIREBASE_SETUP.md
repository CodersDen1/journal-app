# Firebase & API setup — step by step

Everything you need to create the Firebase project and generate the keys/files
the app and backend require. Follow it top to bottom. When you finish you'll have
filled in `mobile/.env`, `server/.env`, and dropped two Google config files into
`mobile/`.

The app's bundle id / package (from `mobile/app.json`) is **`com.still.journal`**
for both iOS and Android — use exactly this when registering the apps.

## What you'll generate (checklist)

| # | Artifact | Used by | Goes into |
|---|----------|---------|-----------|
| 1 | Firebase **project id** | backend | `server/.env` → `FIREBASE_PROJECT_ID` |
| 2 | **GoogleService-Info.plist** (iOS) | mobile | `mobile/GoogleService-Info.plist` |
| 3 | **google-services.json** (Android) | mobile | `mobile/google-services.json` |
| 4 | **Web client ID** (OAuth) | mobile | `mobile/.env` → `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| 5 | Android **SHA-1** fingerprint | Firebase console | added to the Android app |
| 6 | **Service-account JSON** key | backend | `server/` (path in `GOOGLE_APPLICATION_CREDENTIALS`) |
| 7 | **Gemini API key** | backend | `server/.env` → `GEMINI_API_KEY` |
| 8 | **Storage bucket** name | backend | `server/.env` → `FIREBASE_STORAGE_BUCKET` |

---

## Part 1 — Create the Firebase project

1. Go to <https://console.firebase.google.com/> and click **Add project**.
2. Name it (e.g. `still-journal`), continue. Google Analytics is optional — you
   can disable it.
3. When it's ready, open the project. Note the **Project ID** (Project settings →
   *General* → *Project ID*, e.g. `still-journal-1a2b3`). This is artifact **#1**.

---

## Part 2 — Enable Google Sign-In

1. Left nav → **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Add new provider → Google → Enable**.
3. Set a **Project support email**, then **Save**.

Enabling Google here auto-creates the OAuth clients you'll need (Part 6).

---

## Part 3 — Configure the OAuth consent screen

Native Google sign-in will fail until the consent screen exists.

1. Open **Google Cloud Console** for the *same* project:
   <https://console.cloud.google.com/apis/credentials/consent> (pick your Firebase
   project in the top project selector).
2. Choose **External**, click **Create**.
3. Fill **App name**, **User support email**, and **Developer contact email**.
   Save and continue through the scopes screen (no extra scopes needed).
4. While in **Testing** mode, add your Google account under **Test users** (only
   test users can sign in until you publish the app).

---

## Part 4 — Register the iOS app → `GoogleService-Info.plist`

1. Project **Overview** (or Project settings → *General*) → **Add app → iOS**.
2. **Apple bundle ID:** `com.still.journal`. App nickname optional. Register.
3. **Download `GoogleService-Info.plist`.**
4. Place it at **`mobile/GoogleService-Info.plist`** (artifact **#2**).

> You do **not** need an APNs key — the app only uses Auth, not push messaging.
> The plist contains `REVERSED_CLIENT_ID`; the google-signin Expo plugin reads it
> automatically (that's why `app.json` sets `ios.googleServicesFile`).

---

## Part 5 — Register the Android app (+ SHA-1) → `google-services.json`

1. Project settings → **Add app → Android**.
2. **Android package name:** `com.still.journal`. Register.
3. **Add your SHA-1** certificate fingerprint — **required** for Google Sign-In on
   Android (without it you'll hit `DEVELOPER_ERROR` / status code `10`). Get it one
   of these ways:

   **Debug keystore (local dev):**
   ```sh
   keytool -list -v \
     -alias androiddebugkey \
     -keystore ~/.android/debug.keystore \
     -storepass android -keypass android
   # copy the "SHA1:" line
   ```

   **After `expo prebuild` (uses the generated Gradle project):**
   ```sh
   cd android && ./gradlew signingReport   # look for Variant: debug → SHA1
   ```

   **EAS-managed keystore (for real builds):**
   ```sh
   eas credentials      # Android → view the keystore's SHA-1 (and SHA-256)
   ```
   Add both your **debug** SHA-1 (for local dev builds) and your **release**
   SHA-1 (from EAS or your keystore) in Firebase → Project settings → your Android
   app → **Add fingerprint**.
4. **Download `google-services.json`** (re-download it *after* adding the SHA-1 so
   it includes the OAuth client) and place it at **`mobile/google-services.json`**
   (artifact **#3**).

---

## Part 6 — Get the Web client ID

The native Google flow needs the **Web** OAuth client id (not the iOS/Android one).

- **Firebase console:** Authentication → Sign-in method → **Google** → expand
  **Web SDK configuration** → copy **Web client ID**.
- **or Google Cloud console:** APIs & Services → **Credentials** → under *OAuth 2.0
  Client IDs*, copy the one named **“Web client (auto created by Google Service)”**.

It looks like `1234567890-abcdef….apps.googleusercontent.com`. This is artifact
**#4** → `mobile/.env` → `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

---

## Part 7 — Create Firestore + deploy security rules

1. Build → **Firestore Database → Create database**.
2. Choose **Production mode** and a region close to your users (this is permanent).
3. Deploy the deny-all rules shipped in this repo (`firestore.rules`). All data
   access is brokered by the backend's Admin SDK, which **bypasses** rules, so the
   app never touches Firestore directly — deny all client access for safety.

   Using the Firebase CLI:
   ```sh
   npm i -g firebase-tools
   firebase login
   firebase use --add            # pick your project, give it an alias
   firebase deploy --only firestore:rules
   ```
   (`firebase.json` in this repo already points at `firestore.rules`.) Or paste the
   contents of `firestore.rules` into Firestore → **Rules** and Publish.

## Part 7b — Enable Cloud Storage (for audio)

Voice recordings and generated speech ("audio of the text") are stored as files in
**Firebase Cloud Storage** — Firestore can't hold audio (1 MB doc limit).

1. Build → **Storage → Get started** (production mode). This creates your default
   bucket, named like `your-project.appspot.com` or `your-project.firebasestorage.app`.
2. Copy the **bucket name** → `server/.env` → `FIREBASE_STORAGE_BUCKET`.
3. Access is server-only via the Admin SDK (same service account), so no extra
   rules are needed — but you can leave Storage rules denying direct client access.

With this set, `GET /api/tts` generates each entry's speech **once**, stores the
WAV in Storage, and reuses it (the app also caches it on-device). Without it, the
server still works but regenerates TTS on demand and can't store recordings.

---

## Part 8 — Generate the backend service-account key

The Go backend authenticates to Firestore/Firebase with a service account.

1. Firebase → **Project settings → Service accounts**.
2. **Generate new private key** → confirm → a JSON file downloads.
3. Save it somewhere safe **outside** or ignored by git, e.g.
   `server/service-account.json` (the repo's `.gitignore` already excludes
   `service-account*.json` and `.env`). This is artifact **#6**.

You'll reference it from `server/.env` via `GOOGLE_APPLICATION_CREDENTIALS`
(a path) or `FIREBASE_SERVICE_ACCOUNT_JSON` (the JSON inline).

---

## Part 9 — Generate the Gemini API key

1. Go to **Google AI Studio**: <https://aistudio.google.com/app/apikey>.
2. **Create API key** — you can create it inside your existing Google Cloud /
   Firebase project or a new one. This enables the *Generative Language API*.
3. Copy the key (artifact **#7**) → `server/.env` → `GEMINI_API_KEY`.

Default model is `gemini-2.5-flash` (override with `GEMINI_MODEL`). Keep this key
server-side only — it is never shipped in the app.

---

## Part 10 — Put it all together

### Mobile (`mobile/`)

1. Files in place: `mobile/GoogleService-Info.plist`, `mobile/google-services.json`.
2. Create `mobile/.env` from `mobile/.env.example`:
   ```sh
   EXPO_PUBLIC_API_URL=http://<your-computer-LAN-ip>:8080
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=1234567890-abcdef….apps.googleusercontent.com
   ```
   Use your machine's LAN IP (e.g. `192.168.1.20`) so a phone can reach the backend
   — `localhost` only works in a simulator.

### Backend (`server/`)

Create `server/.env` from `server/.env.example`:
```sh
AUTH_MODE=firebase
STORE=firestore
FIREBASE_PROJECT_ID=still-journal-1a2b3
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
FIREBASE_STORAGE_BUCKET=still-journal-1a2b3.appspot.com
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
CORS_ORIGINS=*
```

---

## Part 11 — Build & run

Native Google sign-in uses native modules, so the app runs as a **development
build**, not Expo Go.

```sh
# 1) Backend
cd server && cp .env.example .env   # fill in values from above
go run ./cmd/server                 # http://localhost:8080

# 2) Mobile (Node 20+)
cd ../mobile
nvm use 22 && npm install
npx expo prebuild --clean
npx expo run:ios          # or: npx expo run:android
```

For distributable builds use EAS: `eas build --profile development --platform ios`
(and `android`).

Sanity check the backend without any of the above:
```sh
cd server && AUTH_MODE=disabled STORE=memory go run ./cmd/server
curl localhost:8080/api/health     # {"status":"ok"}
```

---

## Part 12 — Troubleshooting

| Symptom | Fix |
|---|---|
| `Native module RNFBAppModule not installed` (or `RNFBAuthModule`) | The Firebase native module isn't in the running app. You're in **Expo Go** (not supported) or a **stale** dev build. Run `npx expo prebuild --clean` then `npx expo run:ios` / `run:android` and open the **Still** dev build — never Expo Go. Native changes need a rebuild, not a JS reload. |
| Android sign-in `DEVELOPER_ERROR` / code `10` | SHA-1 missing/mismatched. Add the exact SHA-1 for the keystore you're building with, re-download `google-services.json`, rebuild. |
| `Web client ID` errors / sign-in returns no token | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` must be the **Web** client id, not iOS/Android. |
| Sign-in works but backend returns `401 unauthorized` | `FIREBASE_PROJECT_ID` on the server must match the project the app signed into; service account must belong to that project. |
| iOS build can't find Firebase headers | Ensure `expo-build-properties` sets iOS `useFrameworks: "static"` (already in `app.json`) and re-run `expo prebuild --clean`. |
| `blocked by CORS` from a web client | Set `CORS_ORIGINS` to your origin(s). |
| Only you can sign in | Add testers under the OAuth consent screen, or publish the consent screen. |
| `POST /api/transcribe` → 503 | `GEMINI_API_KEY` is unset on the server. |
| Phone can't reach backend | Use your LAN IP in `EXPO_PUBLIC_API_URL`, same Wi-Fi, backend not firewalled. |

---

## Where each value goes (summary)

```
Firebase project id            → server/.env  FIREBASE_PROJECT_ID
GoogleService-Info.plist       → mobile/GoogleService-Info.plist
google-services.json           → mobile/google-services.json
Web client ID                  → mobile/.env  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
Android SHA-1                   → Firebase console (Android app fingerprints)
Service-account JSON            → server/  (GOOGLE_APPLICATION_CREDENTIALS path)
Gemini API key                 → server/.env  GEMINI_API_KEY
Backend LAN URL                 → mobile/.env  EXPO_PUBLIC_API_URL
```
