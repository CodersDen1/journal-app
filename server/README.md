# Still — backend

Production-grade HTTP backend for the **Still** private journaling app.

Mobile clients sign in with Firebase (native Google sign-in) and send the
Firebase **ID token** on every request as `Authorization: Bearer <token>`. This
service verifies that token with the Firebase Admin SDK to resolve the user's
`uid`, then reads and writes that user's data in **Cloud Firestore**, scoped per
user. Voice notes are transcribed **server-side** by calling the Gemini API with
a server-held API key, which also powers text-to-speech playback of entries.

Requires Go 1.25+. Module path: `still/server`.

## Architecture

```
mobile app ──(Authorization: Bearer <firebase-id-token>)──▶  HTTP API
                                                              │
                        auth middleware ── VerifyIDToken ─────┤ (Firebase Admin Auth)
                                                              │
                        store (per-uid) ─────────────────────┤ (Firestore)
                                                              │
                        POST /api/transcribe ────────────────┘ (Gemini REST)
```

Packages:

| Package                  | Responsibility                                            |
| ------------------------ | --------------------------------------------------------- |
| `internal/config`        | Loads runtime config from the environment.                |
| `internal/firebaseapp`   | Initializes the Firebase Admin app; Auth + Firestore.     |
| `internal/auth`          | Bearer-token auth middleware; `uid`/`email` context.      |
| `internal/store`         | `Store` interface + `FirestoreStore` and `MemoryStore`.   |
| `internal/blob`          | Cloud Storage helper (default bucket) for TTS audio + recordings. |
| `internal/gemini`        | REST client: `Transcribe`, `Synthesize` (TTS), `GenerateInsight`. |
| `internal/api`           | HTTP handlers, router, CORS + logging middleware.         |
| `internal/model`         | Data types (JSON tags = Firestore tags, camelCase).       |
| `cmd/server`             | Wiring + graceful shutdown.                               |

## Two run modes

### 1. Local dev / testing (no external services)

Uses a fixed dev user (`dev-user`) and an in-process store — no Firebase or
Firestore required:

```sh
cd server
AUTH_MODE=disabled STORE=memory PORT=8091 go run ./cmd/server
```

All `/api/*` routes are reachable without a token in this mode. Data lives in
memory and is lost on exit. Transcription still requires a `GEMINI_API_KEY`
(otherwise `POST /api/transcribe` returns 503).

### 2. Production (Firebase + Firestore)

```sh
cd server
FIREBASE_PROJECT_ID=your-project-id \
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
GEMINI_API_KEY=your-gemini-key \
CORS_ORIGINS="https://app.example.com" \
go run ./cmd/server
# defaults: AUTH_MODE=firebase, STORE=firestore, PORT=8080
```

The server logs the effective `AUTH_MODE`/`STORE` and the listening address on
start, and shuts down gracefully on `SIGINT` / `SIGTERM`. Secrets are never
logged.

## Environment variables

| Var                             | Default            | Description                                                                 |
| ------------------------------- | ------------------ | --------------------------------------------------------------------------- |
| `PORT`                          | `8080`             | TCP port to listen on.                                                       |
| `AUTH_MODE`                     | `firebase`         | `firebase` (verify ID tokens) or `disabled` (fixed dev uid `dev-user`).      |
| `STORE`                         | `firestore`        | `firestore` or `memory` (in-process).                                        |
| `FIREBASE_PROJECT_ID`           | —                  | Firebase / GCP project id.                                                   |
| `GOOGLE_APPLICATION_CREDENTIALS`| —                  | Path to a service-account JSON key file.                                     |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | —                  | Inline service-account JSON (alternative to the file).                       |
| `GEMINI_API_KEY`                | —                  | Gemini API key. If empty, `/api/transcribe` and `/api/tts` return 503.       |
| `GEMINI_MODEL`                  | `gemini-2.5-flash` | Gemini model used for transcription/insights.                                |
| `GEMINI_TTS_MODEL`              | `gemini-2.5-flash-preview-tts` | Gemini model used by `GET /api/tts` for text-to-speech.          |
| `FIREBASE_STORAGE_BUCKET`       | —                  | Default Cloud Storage bucket (e.g. `your-project.appspot.com` or `your-project.firebasestorage.app`). When set (with Firebase available) it enables TTS-audio persistence and voice-recording storage. Requires Cloud Storage enabled in the Firebase console. |
| `CORS_ORIGINS`                  | `*`                | Comma-separated allowed origins (`*` = any).                                 |

Credential resolution order when Firebase is needed:
`FIREBASE_SERVICE_ACCOUNT_JSON` → `GOOGLE_APPLICATION_CREDENTIALS` →
Application Default Credentials (ADC).

### Using a `.env` file

Rather than exporting variables, copy `.env.example` to `.env` in the `server/`
directory and run from there — the server loads it on startup (zero-dependency
loader). Real environment variables always win over the file, and `.env` is
git-ignored.

```sh
cp .env.example .env    # then edit values
go run ./cmd/server
```

### Obtaining a service account

1. In the [Firebase console](https://console.firebase.google.com/), open your
   project → **Project settings** → **Service accounts**.
2. Click **Generate new private key** to download a JSON key file.
3. Set `FIREBASE_PROJECT_ID` to your project id and either point
   `GOOGLE_APPLICATION_CREDENTIALS` at the downloaded file, or paste its
   contents into `FIREBASE_SERVICE_ACCOUNT_JSON`.
4. Keep the key out of version control (already covered by `.gitignore`).

## Firestore layout (per user)

```
users/{uid}                     → ProfileSettings document
users/{uid}/entries/{entryId}   → JournalEntry documents
users/{uid}/insights/{period}   → InsightDigest documents (period = "weekly" | "monthly")
```

On first access for a user, the backend creates `users/{uid}` with the default
profile and seeds the two canned insight digests. Real journal entries are never
seeded. Listing filters out soft-deleted entries in-process, so no composite
index setup is required.

## API

Base path: `/api`. JSON in, JSON out. All routes except `GET /api/health`
require `Authorization: Bearer <firebase-id-token>` (in `AUTH_MODE=firebase`).
In `AUTH_MODE=disabled` the token is not required.

Examples below use `http://localhost:8080`. Add `-H "Authorization: Bearer $TOKEN"`
to every protected call when running in `firebase` mode.

### Health (no auth)

```sh
curl http://localhost:8080/api/health
# {"status":"ok"}
```

### Current identity

```sh
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/me
# {"uid":"...","email":"..."}
```

### List journals (non-deleted, newest-first)

```sh
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/journals
```

### Create a journal entry (201)

```sh
curl -X POST http://localhost:8080/api/journals \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"text","text":"A quiet Tuesday.","photos":[]}'
```

### Get / update / delete an entry

```sh
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/journals/ENTRY_ID

curl -X PUT http://localhost:8080/api/journals/ENTRY_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"text","text":"Edited text.","favorite":true,"photos":[]}'

# Soft delete (204; sets deleted=true)
curl -i -X DELETE http://localhost:8080/api/journals/ENTRY_ID \
  -H "Authorization: Bearer $TOKEN"
```

### Insights (weekly | monthly; defaults to weekly)

```sh
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/insights?period=monthly"

# Generate from the user's entries (falls back to the stored/canned digest
# when GEMINI_API_KEY is unset or generation fails)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/insights/generate?period=weekly"
```

### Profile

```sh
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/profile

curl -X PUT http://localhost:8080/api/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"plan":"plus","appLockEnabled":true,"backupEnabled":true,"defaultEntryMode":"voice","transcriptionLanguage":"English (US)","textToSpeechVoice":"Warm","reminderRhythm":"daily","missedYesterdayNudge":true,"accountEmail":"you@example.com"}'
```

### Transcribe a voice note

`multipart/form-data` with an `audio` file field (max ~20MB). MIME type is
inferred from the extension (`.m4a`/`.mp4`→`audio/mp4`, `.mp3`→`audio/mp3`,
`.wav`→`audio/wav`, `.aac`→`audio/aac`, `.ogg`→`audio/ogg`, `.flac`→`audio/flac`).

```sh
curl -X POST http://localhost:8080/api/transcribe \
  -H "Authorization: Bearer $TOKEN" \
  -F "audio=@note.m4a"
# {"transcript":"..."}
# 503 {"error":"transcription is not configured"} when GEMINI_API_KEY is unset
# 502 {"error":"transcription failed"} on a Gemini API error
```

### Text-to-speech (audio of an entry)

`GET /api/tts?entryId={id}&voice={optional}` synthesizes spoken audio for an
entry and returns a **`audio/wav`** file (200) that a mobile audio player can
stream directly. The spoken text is the entry's `text`, falling back to its
`transcript`. The voice defaults to `Kore` when `voice` is omitted. Responses
set `Cache-Control: private, max-age=86400` and `Accept-Ranges: bytes`, and a
`Range` request is honored (206).

When `FIREBASE_STORAGE_BUCKET` is set the audio is persisted in Cloud Storage at
`tts/{uid}/{entryId}-{hash}.wav` and generated **once per text version** (the
hash is derived from the text, so editing an entry yields a fresh object); later
plays stream the stored bytes without re-calling Gemini. When Storage is
unconfigured it falls back to on-demand generation with an in-process cache
keyed by entry revision + voice.

```sh
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/tts?entryId=ENTRY_ID&voice=Kore" \
  --output entry.wav
# 400 {"error":"nothing to read"} when the entry has no text or transcript
# 503 {"error":"text-to-speech is not configured"} when GEMINI_API_KEY is unset
#     (and no persisted audio exists)
# 502 {"error":"text-to-speech failed"} on a Gemini API error
```

### Voice recordings (Cloud Storage)

Durably store and retrieve the raw audio of a voice entry. Both routes require
`FIREBASE_STORAGE_BUCKET` (and Firebase); otherwise `POST` returns 503 and `GET`
returns 404. The recording is stored as a single object per entry at
`recordings/{uid}/{entryId}`; the Firestore entry need not exist.

`POST /api/journals/{id}/recording` — `multipart/form-data` with an `audio` file
field (max ~25MB). The stored content type is inferred from the extension
(`.m4a`/`.mp4`→`audio/mp4`, `.mp3`→`audio/mp3`, `.wav`→`audio/wav`,
`.aac`→`audio/aac`, `.caf`→`audio/x-caf`, default `audio/mp4`).

```sh
curl -X POST http://localhost:8080/api/journals/ENTRY_ID/recording \
  -H "Authorization: Bearer $TOKEN" \
  -F "audio=@note.m4a"
# {"ok":true}
# 503 {"error":"storage is not configured"} when FIREBASE_STORAGE_BUCKET is unset
```

`GET /api/journals/{id}/recording` — streams the stored recording with its
content type and `Cache-Control: private, max-age=86400` (Range honored, 206).

```sh
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/journals/ENTRY_ID/recording --output note.m4a
# 404 {"error":"recording not found"} when none is stored (or storage is off)
```

## Build & verify

```sh
cd server
go mod tidy
go vet ./...
go build ./...
```
