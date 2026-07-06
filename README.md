# Still

A calm, private journaling app — warm paper, soft ink, muted sage. Text and voice
entries, photo attachments, gentle AI insights, search, and a quiet profile.

- **`mobile/`** — Expo + React Native (TypeScript). Native **Google sign-in** via
  Firebase Auth; entries sync to the backend; voice notes are transcribed by Gemini.
  Works fully offline (local storage) when signed out.
- **`server/`** — production-grade **Go** backend: verifies Firebase ID tokens,
  stores per-user data in **Firestore**, and calls **Gemini** for voice transcription.

**Full setup (Firebase project, service account, dev build, Gemini key) is in
[SETUP.md](SETUP.md).** This page is the short version.

## Architecture

```
Mobile (Expo dev build)
  Firebase Auth (native Google Sign-In) ──► Firebase ID token
        │  Authorization: Bearer <idToken>
        ▼
Go backend ── verifies token (Firebase Admin) ─► uid
  • Firestore: users/{uid}/entries · /insights · profile
  • Gemini: audio ─► transcript
```

## Quick start

### Backend

```sh
cd server
# Production: point at Firestore + Firebase + Gemini
FIREBASE_PROJECT_ID=… GOOGLE_APPLICATION_CREDENTIALS=… GEMINI_API_KEY=… go run ./cmd/server

# Local dev without any cloud setup (curl-friendly):
AUTH_MODE=disabled STORE=memory go run ./cmd/server
```

### Mobile (requires Node 20+ and a dev build — not Expo Go)

```sh
cd mobile
nvm use 22 && npm install
# add google-services.json + GoogleService-Info.plist and mobile/.env (see SETUP.md)
npx expo prebuild --clean
npx expo run:ios          # or: npx expo run:android
```

> Native Google sign-in uses native modules, so the app runs in a **development
> build**, not Expo Go. Signed out, it still works offline with seed data.

## What's inside

| Area | Notes |
| --- | --- |
| Navigation | 3 bottom tabs — Today, Journals, Insights. Profile from the top-right icon; Reminder Rhythm is a Profile sub-screen. |
| Auth | Firebase Auth + native Google Sign-In. |
| Entries | Text and voice, with optional photos. Swipe left to archive, right to delete, with undo. |
| Voice | Recorded with `expo-audio`, transcribed server-side by **Gemini**. |
| Data | Firestore (per user) via the Go backend when signed in; local `AsyncStorage` cache/offline. |
| Insights | Weekly / monthly digests, stored in Firestore (Gemini generation optional). |

## Theme tokens

Paper `#F6F1E8`, surface `#FFFFFF`, soft surface `#EFE7DA`, ink `#1F1D1A`, muted
`#7A7369`, border `#DDD2C2`, sage `#6F7D5A` / `#4F5D3E`, terracotta `#B86F52`,
recording `#9A4F3F`. IBM Plex Sans for UI, Literata for reading.

See `mobile/README.md`, `server/README.md`, and [SETUP.md](SETUP.md).
```
