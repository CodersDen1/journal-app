// PM2 process config for the Still Go backend (Ubuntu / any Linux server).
//
// PM2 runs the COMPILED binary, not `go run`. Build it first:
//
//   cd server
//   go build -o bin/still-server ./cmd/server        # build on the server, OR
//   GOOS=linux GOARCH=amd64 go build -o bin/still-server ./cmd/server   # cross-compile from macOS
//
// Put your config/secrets in `server/.env` (git-ignored) — the server loads it
// on startup from its working directory. Then:
//
//   npm install -g pm2
//   pm2 start ecosystem.config.cjs
//   pm2 save          # persist the process list
//   pm2 startup       # run the printed command so PM2 restarts on reboot
//   pm2 logs still-server
//
module.exports = {
  apps: [
    {
      name: 'still-server',
      // Path to the compiled binary, relative to `cwd` below.
      script: './bin/still-server',
      // It's a native executable, not a Node.js script.
      interpreter: 'none',
      // Run from the server/ folder so it finds ./.env and ./service-account.json.
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      max_memory_restart: '300M',
      watch: false,
      time: true,
      // Non-secret defaults. Secrets (FIREBASE_*, GEMINI_API_KEY, service-account
      // path) belong in `server/.env`, which the server reads on startup and which
      // is git-ignored. Anything set here overrides the .env file.
      env: {
        PORT: '8080',
        AUTH_MODE: 'firebase',
        STORE: 'firestore',
      },
    },
  ],
};
