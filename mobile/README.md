# Still — mobile

Expo + React Native (TypeScript). Calm, private journaling: text and voice
entries, photo attachments, gentle AI insights, search, profile.

- **Expo SDK 57**, React Native 0.86, React 19, React Navigation 7.
- **Firebase Auth** (native Google Sign-In) + **Firestore** via the Go backend.
- **Gemini** voice transcription (server-side).
- Requires **Node 20+** and a **development build** — native modules mean it does
  **not** run in Expo Go. See [../SETUP.md](../SETUP.md).

## Run

```sh
nvm use 22
npm install
# add google-services.json, GoogleService-Info.plist, and .env (see ../SETUP.md)
npx expo prebuild --clean
npx expo run:ios          # or npx expo run:android
npm run typecheck         # tsc --noEmit
```

Signed **out**, the app runs fully offline on `AsyncStorage` with seed data.
Signed **in**, entries sync to your Firestore-backed account and voice notes are
transcribed by Gemini.

### Env (`.env`, see `.env.example`)

```
EXPO_PUBLIC_API_URL=http://<lan-ip>:8080
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
```

## Structure

```
App.tsx                     Root: fonts, providers (Auth→Profile→Journals→Snackbar), navigation
src/
  theme/                    Design tokens + typography
  types/                    JournalEntry, InsightDigest, ProfileSettings, …
  data/                     Seed mock journals, insights, default profile
  lib/                      format · storage · media · firebase (auth) · api (authed client)
  state/                    AuthContext · ProfileContext · JournalsContext · SnackbarContext
  components/               Reusable design system
  navigation/               RootNavigator + BottomTabs + types
  screens/                  One file per screen
```

### Design system (`src/components`)

`AppShell` · `ScreenHeader` · `JournalCard` · `PrimaryButton` · `SegmentedControl`
· `IconButton` · `AudioPlayer` · `PhotoStrip` · `PhotoGrid` · `EmptyState` ·
`SettingRow` · `PlanCard` · `UndoSnackbar` (+ `BottomTabs`). All read theme tokens.

## Behaviour notes

- **Auth**: Login screen does native Google sign-in (`AuthContext` → `lib/firebase`).
  `api.ts` attaches the Firebase ID token to every backend request.
- **Sync**: when signed in, `JournalsContext`/`ProfileContext` load from and push to
  the backend (Firestore), with `AsyncStorage` as the offline cache.
- **Voice**: `expo-audio` records; on stop, the audio is uploaded to the backend
  which transcribes it with Gemini. The transcript is editable before saving.
- **Photos**: `expo-image-picker`, always secondary to the writing.
- **Swipe** left to archive, right to delete — each with an undo snackbar.
- **Search** is a separate screen (no permanent search bar). Journal medium is
  shown with **icons only** (never the words "Text"/"Voice").
```
