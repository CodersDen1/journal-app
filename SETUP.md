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
| `REVENUECAT_SECRET_KEY` | RevenueCat REST **secret** key (`sk_…`); enables server-side entitlement verification | — |
| `REVENUECAT_ENTITLEMENT_ID` | Entitlement id gated on | `pro` |
| `REVENUECAT_WEBHOOK_AUTH` | Shared secret expected as the webhook's `Authorization` header | — |
| `PAYWALL_ENFORCED` | Force the paywall on/off | on iff `REVENUECAT_SECRET_KEY` is set |

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
The **paywall is off** in this mode (no secret key), so every endpoint is
reachable — this keeps `curl`-driven development friction-free.

---

## 4. Mobile (`mobile/`)

1. Place `google-services.json` and `GoogleService-Info.plist` in `mobile/`.
2. Create `mobile/.env`:
   ```sh
   EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8080
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
   # RevenueCat public SDK keys (safe to ship in the client):
   EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_xxxxxxxx
   EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxxxxxxx
   EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro
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

## 5. Subscriptions (RevenueCat)

Access is a **hard paywall**: a single "Still Pro" subscription (monthly +
annual) with an introductory free trial, and no permanent free tier. The **Go
server is the gate** — every data/feature endpoint requires an active `pro`
entitlement resolved from RevenueCat. The mobile client cannot grant itself
access (a tampered client still gets `402` from the server on every request).

**App stores**

1. **App Store Connect** → create a subscription group with two products
   (monthly + annual), each carrying a **7-day introductory free-trial** offer.
2. **Google Play Console** → create a subscription with base plans/offers that
   include a free trial.

**RevenueCat dashboard**

3. Create a project; add your **App Store** and **Play** apps.
4. Import the products; create an **entitlement** named `pro` and attach both
   products; create an **Offering** (`default`) with a monthly and an annual
   package.
5. Collect: the **iOS** and **Android** public SDK keys, one **secret API key**,
   and choose a **webhook Authorization** value.
6. **Integrations → Webhooks** → set the URL to
   `https://<your-server>/api/revenuecat/webhook` and the Authorization header to
   the value you chose (must equal `REVENUECAT_WEBHOOK_AUTH`).

**Env** — server: `REVENUECAT_SECRET_KEY`, `REVENUECAT_ENTITLEMENT_ID=pro`,
`REVENUECAT_WEBHOOK_AUTH`, `PAYWALL_ENFORCED=true`. Mobile: the three
`EXPO_PUBLIC_REVENUECAT_*` keys above.

**Internal accounts** — `PAYWALL_BYPASS_DOMAINS` (default `famproperties.com`)
lists verified email domains that always have full access with no subscription
and no locked features. The bypass keys off the Firebase token's verified email
(`email_verified` must be true), so it cannot be spoofed by the client. Set it to
a comma-separated list, or empty to disable.

**How it stays strict**

- On each protected request the server resolves entitlement via the RevenueCat
  REST API (`GET /v1/subscribers/{uid}`), cached ~60s and kept fresh by webhooks.
- The client identifies to RevenueCat with `Purchases.logIn(<firebase-uid>)`, so
  `app_user_id` == the uid the server verifies.
- `profile.plan` is server-derived; a client `PUT /api/profile {plan:"pro"}` is
  ignored and never grants access.

Purchases need a **development/EAS build** on a device or simulator with store
**sandbox** accounts — they cannot be exercised in Expo Go or over `curl`.

---

## 6. Data & security

Firestore layout, scoped per user:

```
users/{uid}                       ← ProfileSettings
users/{uid}/entries/{entryId}     ← JournalEntry
users/{uid}/insights/{period}     ← InsightDigest  (period = weekly | monthly)
users/{uid}/billing/entitlement   ← Entitlement    (written only by server/webhook)
```

All writes go through the Go backend, which verifies the Firebase ID token and
only ever touches the authenticated user's subtree — the app never holds the
service account or the Gemini key. The entitlement doc is written **only** by the
RevenueCat webhook and server-side verification, never by client profile writes.
Add matching Firestore **security rules** (deny direct client access; the Admin
SDK bypasses rules) for defence in depth.

---

## 7. Verify

```sh
# Backend (no cloud needed)
cd server && go vet ./... && go build ./... && go test ./...

# Server paywall gate, enforced without a RevenueCat key:
AUTH_MODE=disabled STORE=memory PAYWALL_ENFORCED=true REVENUECAT_WEBHOOK_AUTH=test \
  go run ./cmd/server
#   GET  /api/journals                       → 402 subscription_required
#   POST /api/revenuecat/webhook (Auth:test, INITIAL_PURCHASE, future expiry) → 200
#   GET  /api/journals                       → 200 (gate opened)

# Mobile
cd mobile && nvm use 22 && npm run typecheck && npx expo-doctor
```
