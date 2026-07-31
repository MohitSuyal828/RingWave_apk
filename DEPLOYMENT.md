# Deploying RingWave

This covers three ways to run the full stack (Postgres + backend + AI
service + frontend) in production, plus what's still missing. It assumes
the reader has already skimmed each service's own `.env.example`.

---

## 1. Self-hosted, single machine (Docker Compose)

```
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  docker compose up --build
```

This brings up all four services (`postgres`, `backend`, `ai-service`,
`frontend`) on one host, publishing:

| Service     | Host port | Notes                                   |
|-------------|-----------|------------------------------------------|
| frontend    | 5173      | nginx serving the built SPA              |
| backend     | 5000      | REST API + Socket.IO                     |
| ai-service  | 8000      | detection WebSocket                      |
| postgres    | 5432      | not needed by any client, published for convenience (`psql`, a GUI client, etc.) |

`docker-compose.yml` requires `JWT_SECRET` to be set (it will refuse to
start otherwise, rather than silently booting with an empty/guessable
secret) and defaults `DB_PASSWORD` to `1234` — override that too for
anything beyond a throwaway local run.

**This setup has no HTTPS.** It's suitable for local testing or a LAN
deployment behind your own reverse proxy. For a real public deployment on
a single box, put nginx/Caddy/Traefik in front of it with a real TLS
certificate (Let's Encrypt via Caddy is the least amount of config) rather
than exposing these ports directly.

## 2. Split deployment: Railway + Render + Vercel (recommended)

This is the path the individual `railway.json` / `render.yaml` /
`vercel.json` files in this repo are built for. HTTPS is automatic and
free on all three — you don't configure it, it's the default for any
service on a platform-assigned domain.

1. **Database** — provision Postgres on either platform (Render's
   `render.yaml` in the repo root provisions one automatically as part of
   its Blueprint; on Railway, add a Postgres plugin to your project). Note
   the connection string either way.
2. **Backend** (`backend/`) — deploy to Railway or Render using
   `backend/Dockerfile`. Set every env var listed in
   `backend/.env.example`, in particular:
   - `DATABASE_URL` — from step 1
   - `JWT_SECRET` — long, random, **must match the AI service's**
   - `CORS_ORIGINS` — your deployed frontend's URL (see step 4 — you'll
     likely set this *after* deploying the frontend and come back)
   - `FRONTEND_URL` — same URL, used for password-reset email links
3. **AI service** (`ai-service/`) — deploy the same way using
   `ai-service/Dockerfile`. Set every var in `ai-service/.env.example`;
   `JWT_SECRET` must be byte-for-byte identical to the backend's, since it
   verifies the same access tokens.
4. **Frontend** (`frontend/`) — deploy to Vercel, pointing it at the
   `frontend/` subdirectory. Set these as Vercel Environment Variables
   (Vercel builds the app itself, so these are consumed at Vercel's build
   time, not container runtime):
   - `VITE_API_URL` = `https://<your-backend-domain>/api/v1`
   - `VITE_SOCKET_URL` = `https://<your-backend-domain>`
   - `VITE_DETECTION_WS_URL` = `wss://<your-ai-service-domain>/ws/detect`

   All three **must** be `https://`/`wss://`, not `http://`/`ws://` — a
   page served over HTTPS (which Vercel always is) cannot make plaintext
   requests to a different origin; browsers block it as mixed content.
5. **Go back to step 2/3** and set `CORS_ORIGINS` /
   `AI_SERVICE_ALLOWED_ORIGINS` to the real Vercel URL now that you have
   it, and redeploy the backend + AI service so the setting takes effect.

## 3. Health checks

All three services expose a real health endpoint that reflects actual
readiness, not just "the process is alive":

- Backend: `GET /health` → `{"status":"ok","db":"connected","uptime":...}`.
  This actually queries Postgres — if the DB connection is down, this
  reports it rather than returning a hollow 200.
- AI service: `GET /health` → `{"status":"ok","service":"ringwave-detection","model_device":"cpu"}`.
  Only returns 200 once the model has actually finished loading at
  startup (cold start can take 30-60s — the Dockerfiles' `HEALTHCHECK
  --start-period` and `render.yaml`'s health check timeout both account
  for this).
- Frontend: nginx's own root `/` (just confirms the static file server is
  up — there's no backend logic to check).

---

## What's NOT done

- **Android / APK: there is no Android project anywhere in this
  repository.** No `android/` directory, no `build.gradle`, no
  `AndroidManifest.xml`, nothing to configure. This isn't a bug that was
  fixed or a gap that was patched — the mobile app simply doesn't exist in
  this codebase. If one exists elsewhere, it wasn't part of what was
  uploaded here.
- **Password reset emails don't actually reach an inbox yet.** The
  mechanism (token generation, hashing, expiry, one-time use) is fully
  real and tested end-to-end — see `backend/src/utils/emailService.js`'s
  header comment for exactly what to swap in (a real SendGrid/SES/Postmark
  call) before real users rely on this.
- **No Docker daemon was available in the environment these Dockerfiles
  were authored in**, so none of the three images have been built and run
  end-to-end as containers. What *was* verified: the underlying install
  commands succeed in isolation (`npm ci --omit=dev` for the backend,
  including confirming `bcrypt`'s native binary actually loads; the exact
  Python healthcheck logic for the AI service; the rollup-native-binary
  guard for the frontend build), and every YAML/JSON config parses as
  valid. Building and running the actual images is the one remaining step
  before calling any of this fully proven.
