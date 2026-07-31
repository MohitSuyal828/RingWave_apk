# RingWave 

> Real-time audio calling platform, built as the foundation for AI-powered deepfake / synthetic-voice detection.

This is a monorepo containing both halves of RingWave:

```
RingWave/
├── RingWave_Frontend/   # React 19 + TypeScript client
└── RingWave_Backend/    # Node.js + Express + Socket.IO + PostgreSQL API
```

This README describes the system **as it actually works today**, not as originally planned — the two READMEs each half shipped with described a lot of infrastructure (contact requests, React Query data fetching, live detection events) that was either simplified or never wired up during development. Where something is scaffolded but not yet functional, it's called out explicitly below.

---

## What actually works right now

- **Auth** — register / login / OTP-free JWT auth with access + refresh tokens, silent refresh on 401
- **1:1 audio calls** — full WebRTC flow: ringing, accept/decline, live call, hang up
- **Group audio calls** — invite people into an existing call, mid-call; a peer-to-peer mesh (no media server)
- **Call history** — every call outcome (completed / missed / rejected) is logged and visible per-user
- **Notifications** — derived live from call history (missed calls, declines, group call summaries), not a separate notification system
- **Contacts** — a flat directory of every other registered user (see [Known simplifications](#known-simplifications--whats-not-implemented))
- **Detection** — **not implemented**. The API, DB table, and validation schema exist and are ready to receive results, but no model is integrated and the frontend shows an honest "not wired up yet" placeholder instead of fake data.

---

## Tech Stack

### Frontend (`RingWave_Frontend/`)

| Category | Technology |
|---|---|
| Framework | React 19 + TypeScript 5 |
| Build tool | Vite 6 |
| Styling | TailwindCSS 3.4 (hand-written components — no shadcn/ui is actually installed, despite older docs) |
| State | Zustand 5 (auth, notifications) + React Context (`CallContext`, the real source of truth for all call state) |
| Real-time | socket.io-client 4.8 |
| Calling | Native WebRTC (`RTCPeerConnection`), no third-party SDK |
| Animation | Framer Motion 11 |
| Routing | React Router DOM 6 |
| Forms/validation | React Hook Form 7 + Zod 3 |
| HTTP | Axios (with a token-refresh interceptor) |

> **Note:** `@tanstack/react-query` is installed and a `QueryClientProvider` wraps the app in `main.tsx`, but no page actually uses `useQuery`/`useMutation` — every page fetches data with `axios` directly inside `useEffect`. It's present as scaffolding, not in active use.
>
> `src/store/callStore.ts` also still exists in the repo but is dead code — active-call state was moved entirely into `CallContext.tsx` (React Context + `useState`/`useRef`) during development and nothing imports `callStore` anymore.

### Backend (`RingWave_Backend/`)

| Category | Technology |
|---|---|
| Runtime | Node.js + Express 5 |
| Database | PostgreSQL (via `pg`, raw SQL — no ORM) |
| Real-time | Socket.IO 4.8 (signaling only — see [Call architecture](#call-architecture)) |
| Auth | JWT access tokens + hashed, rotating refresh tokens |
| Validation | Zod 4 |
| Logging | Pino + pino-http (request IDs, redaction, pretty-printed in dev) |
| Security | Helmet, bcrypt, express-rate-limit |
| Migrations | node-pg-migrate — **partially used**, see [Database setup](#database-setup) |

---

## Call architecture

This is the part most worth understanding before touching the code.

**Audio never touches the backend.** RingWave uses a pure peer-to-peer WebRTC mesh:

1. The backend's Socket.IO layer (`RingWave_Backend/src/socket/`) is **signaling only** — it relays SDP offers/answers and ICE candidates as JSON between browsers (`signal:offer`, `signal:answer`, `signal:ice`). It never sees a single audio byte.
2. Each browser calls `getUserMedia()` once per call and shares that **same** `MediaStreamTrack` across every peer connection it opens (`RingWave_Frontend/src/lib/WebRTCManager.ts`).
3. For a group call, every participant opens a direct `RTCPeerConnection` to every other participant — a full mesh, not a star topology through a server. This is simple and works well for small groups; it does **not** scale to large calls and would need an SFU (e.g. mediasoup, LiveKit) to do so.
4. ICE is currently **STUN-only** (`stun:stun.l.google.com:19302`) — there is no TURN server configured, so calls across restrictive NATs/firewalls may fail to connect. Add a TURN server before relying on this outside trusted networks.

**Call session lifecycle** (`RingWave_Backend/src/socket/index.js` + `callManager.js`):

- A call session lives entirely in an in-memory `Map` on the server (`activeCalls`) — there is no DB row for a call *while it's happening*, only once it's over.
- `call:outgoing` creates a session and starts a **60-second ring timer per invitee**. If they don't answer in time, the server auto-rejects with reason `no_answer` and notifies everyone currently on the call (not just the original caller).
- Group calls: anyone already on a call can invite someone else (`call:invite`). Every other existing participant is broadcast a `call:invite_sent` event so their UI shows a "ringing" tile for the invitee in real time, not just once they join or the timer expires.
- Display names are **never trusted from the client**. On socket connection, the server looks up the real name from the database once and caches it (`onlineUserNames`) — every event that shows a name to someone else uses that verified value, not whatever the client claims about itself or someone else.
- A call is considered fully over when there are zero active participants left, or at most one participant remains with nobody still ringing — this correctly ends the session (and stops the other side's phone from ringing) even if the caller cancels before anyone picks up.

**Call logging is entirely client-driven**, not server-driven:

- The backend socket layer never writes to the database.
- Each client tracks, per call, which peers *it personally* invited (`invitedByMeIds` in `CallContext.tsx`) — whoever invited someone is the one who logs that pairing's outcome via `POST /api/v1/calls` once it resolves (completed / missed / rejected). This deliberately avoids duplicate rows when a call has been through multiple invites from different people, while still working correctly when a non-initiator invites a new participant mid-call.
- Group call rows share a `call_session_id` (UUID) so the frontend can regroup them into a single "Group call — Alice (2:14), Bob (missed)" entry (`src/lib/callGrouping.ts`) instead of showing unrelated-looking rows.

**Notifications have no dedicated backend or table.** They're derived client-side from call history rows on load (`src/store/notificationStore.ts`) — a missed call becomes a "Missed call" notification, a group session's rows become one "Group call" notification with an expandable per-person breakdown, etc. Read/unread state is tracked in `localStorage`, not the database.

---

## Project Structure

```
RingWave/
├── RingWave_Frontend/
│   ├── .env
│   └── src/
│       ├── main.tsx                  # App entry — QueryClientProvider, router
│       ├── router/index.tsx          # All routes (guest/protected/full-screen)
│       ├── context/
│       │   └── CallContext.tsx       # Real source of truth for all call state
│       ├── lib/
│       │   ├── WebRTCManager.ts      # RTCPeerConnection mesh management
│       │   ├── callGrouping.ts       # Regroups call_history rows into UI entries
│       │   ├── settings.ts, utils.ts, queryClient.ts (unused)
│       ├── services/
│       │   ├── axios.ts              # Axios instance + refresh-token interceptor
│       │   ├── socket.ts             # Socket.IO client + event name constants
│       │   └── auth.ts
│       ├── store/
│       │   ├── authStore.ts          # Zustand — user, tokens
│       │   ├── notificationStore.ts  # Zustand — derived notifications (see above)
│       │   └── callStore.ts          # Unused / dead code
│       ├── components/
│       │   ├── layout/               # AppLayout, AuthLayout, Sidebar, Topbar
│       │   ├── routing/              # ProtectedRoute, GuestRoute, CallRouteSync
│       │   ├── AddParticipantModal.tsx
│       │   └── CallIconButton.tsx
│       ├── pages/
│       │   ├── auth/                 # Login, Register, OTP, Forgot/Reset password
│       │   ├── calls/                # Incoming, Outgoing, Active (1:1), Group
│       │   ├── DashboardPage.tsx
│       │   ├── ContactsPage.tsx
│       │   ├── CallHistoryPage.tsx
│       │   ├── NotificationsPage.tsx
│       │   ├── DetectionReportsPage.tsx  # Honest "not wired up yet" placeholder
│       │   ├── ProfilePage.tsx / SettingsPage.tsx / NotFoundPage.tsx
│       └── constants/, types/
│
└── RingWave_Backend/
    ├── .env
    ├── server.js                     # Express app + HTTP server + Socket.IO attach
    ├── migrations/                   # node-pg-migrate — refresh_tokens ONLY
    ├── sql_archive/                  # Manually-applied SQL — see Database setup
    └── src/
        ├── config/                   # db.js (pg Pool), logger.js (Pino)
        ├── controllers/               # auth, user, call, detection
        ├── models/                    # raw-SQL data access per table
        ├── routes/                    # authRoutes, userRoutes, callRoutes, detectionRoutes
        ├── middleware/                # auth, validate (Zod), rateLimiter, errorHandler, requestLogger, deprecationNotice
        ├── socket/
        │   ├── index.js               # Connection handling + all event handlers
        │   ├── callManager.js         # In-memory call session state machine
        │   ├── events.js              # Event name constants (shared shape with frontend)
        │   └── helpers.js
        └── utils/                    # response.js, token.js, gracefulShutdown.js
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL running locally (or reachable via `DATABASE_URL`)

### 1. Backend

```bash
cd RingWave_Backend
npm install
cp .env.example .env   # then fill in the values below
```

**`.env`:**
```env
PORT=5000

DB_USER=postgres
DB_HOST=localhost
DB_NAME=ringwave_db
DB_PASSWORD=your_password
DB_PORT=5432
DATABASE_URL=postgres://postgres:your_password@localhost:5432/ringwave_db

JWT_SECRET=some_long_random_string
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN_DAYS=7

LOG_LEVEL=info
NODE_ENV=development
```

#### Database setup

This is the part that's easy to get wrong — **`npm run migrate up` alone is not enough.** Only the `refresh_tokens` table is managed by node-pg-migrate. `users`, `call_history`, and `detection_logs` — and a later column added to `call_history` — live in `sql_archive/` and must be applied by hand, in order:

```bash
psql -U postgres -d ringwave_db -f sql_archive/initial_schema.sql
psql -U postgres -d ringwave_db -f sql_archive/002_add_call_session_id.sql
npm run migrate up
```

Verify it actually landed before moving on:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'call_history';
-- should include call_session_id
```
Skipping the second script is a real, previously-hit failure mode: every `POST /api/v1/calls` and `GET /api/v1/calls/history` request will 500 with `column "call_session_id" of relation "call_history" does not exist` until it's applied, and it fails completely silently on the frontend (call history/dashboard/notifications just stay empty with no visible error).

Run the server:
```bash
npm run dev      # nodemon, auto-restart
npm start        # production
```

### 2. Frontend

```bash
cd RingWave_Frontend
npm install
cp .env.example .env
```

**`.env`:**
```env
VITE_API_URL=http://localhost:5000/api/v1
VITE_SOCKET_URL=http://localhost:5000
VITE_APP_NAME=RingWave
VITE_APP_VERSION=1.0.0
```

```bash
npm run dev       # http://localhost:5173
npm run build     # tsc && vite build
npm run preview
npx tsc --noEmit  # type-check only
```

Test calling locally: register two different accounts (the backend rejects calling yourself), open one in a normal window and one in an incognito window (so two separate auth sessions coexist), and call between them.

---

## API Reference

Base path: `/api/v1` (deprecated aliases still respond at `/api/`, un-versioned, with a deprecation warning header).

All protected routes require `Authorization: Bearer <access_token>`.

### Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | Rate-limited |
| POST | `/auth/login` | Rate-limited |
| POST | `/auth/refresh` | Refresh token in body, not header |
| POST | `/auth/logout` | Revokes the refresh token |
| GET | `/auth/profile` | Protected |
| PATCH | `/auth/profile` | Protected |

### Users
| Method | Path | Notes |
|---|---|---|
| GET | `/users` | All other registered users — this **is** the contacts list, see below |

### Calls
| Method | Path | Notes |
|---|---|---|
| POST | `/calls` | Body: `receiver_id`, `duration` (seconds), `status` (`completed`\|`missed`\|`rejected`), `call_session_id?` (UUID, present for group calls) |
| GET | `/calls/history` | Paginated (`?page=&limit=`, max `limit=100`) |

### Detection
| Method | Path | Notes |
|---|---|---|
| POST | `/detections` | Body: `prediction` (`likely_synthetic`\|`likely_real`\|`uncertain`), `confidence_score` (0–100). **Ready to receive results; nothing calls this yet.** |
| GET | `/detections/history` | Paginated. **Ready; unused by any current UI.** |

---

## Socket Events

Defined once in `RingWave_Backend/src/socket/events.js` and mirrored in `RingWave_Frontend/src/services/socket.ts` — the two must be kept in sync manually, there's no shared package.

```ts
// Call lifecycle
call:outgoing            // client → server: start a call (1 or more invitees)
call:incoming             // server → client: you're being called
call:accepted             // client → server: accept
call:rejected             // server → client: declined / no_answer / offline / busy
call:ended                // either direction: call session torn down
call:participant_joined   // server → existing participants: someone joined a group call
call:participant_left     // server → remaining participants: someone left
call:invite                // client → server: invite someone into an active call
call:invite_sent          // server → other existing participants: an invite just went out

// WebRTC signaling (pure relay, server never inspects payload)
signal:offer
signal:answer
signal:ice
```

Events referenced in the original individual READMEs but **not implemented**: `detection:update`, `detection:alert`, `contact:request`, `contact:accepted`, `contact:online`, `contact:offline`, `notification:new`. There is no presence/online-status system beyond whatever a socket connection being open implies.

---

## Known simplifications / what's not implemented

Being upfront about the gap between the original planning docs and the current build:

- **Contacts** are just "every other registered user," fetched flat from `GET /users`. There's no contact-request/accept/block flow, no relationship state at all — anyone can call anyone.
- **Detection** has a real API endpoint, DB table, and validated schema, but nothing calls it. `DetectionReportsPage` says so honestly rather than showing fake data.
- **No TURN server** — WebRTC connections across restrictive NATs may fail. Fine for same-network dev/testing, not production-ready as-is.
- **Group calls are a full mesh**, not routed through a media server — fine for small groups, won't scale.
- **React Query is installed but unused** — all data fetching is direct `axios` calls in `useEffect`.
- `callStore.ts` (Zustand) is dead code — call state lives in `CallContext.tsx`.

## Suggested next steps for the AI detection integration

Since audio never reaches the backend today, wiring in a detection model is a real architecture decision, not just a coding task. Two viable paths:

1. **Client-side capture + upload** — tap local/remote `MediaStream`s in-browser (`MediaRecorder` or an `AudioWorklet` for raw PCM), stream chunks to a new endpoint for the model to consume. Smaller change, keeps the current mesh architecture untouched.
2. **Route audio through an SFU** — restructure calls so each stream flows through a media server (mediasoup, LiveKit, Janus, etc.) with a server-side tap for the model. Bigger change, but gives a clean low-latency server-side hook and would also fix the group-call scaling limitation above.

The `detection_logs` table and `POST /detections` endpoint are already shaped to receive whatever either approach produces (`prediction` + `confidence_score`).

---

## License

Developed for the RingWave project under Reagvis Labs.
