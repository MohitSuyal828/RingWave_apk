# Contributing to RingWave

This file captures the things that aren't obvious from reading either half of the codebase in isolation, mostly lessons from bugs that have already been hit once and shouldn't be reintroduced.

## Setup

Follow the [README](./README.md)'s **Getting Started** section. The one step people actually miss:

> `npm run migrate up` only creates `refresh_tokens`. You also need to run both scripts in `RingWave_Backend/sql_archive/` by hand, **in order**, before the app will work at all:
> ```bash
> psql -U postgres -d ringwave_db -f sql_archive/initial_schema.sql
> psql -U postgres -d ringwave_db -f sql_archive/002_add_call_session_id.sql
> ```
> If you skip the second one, every call silently fails to log and the dashboard/history/notifications all stay empty with no visible error on the frontend — the only sign is a 500 in the Network tab whose body says `column "call_session_id" of relation "call_history" does not exist`. This has already cost real debugging time once — don't let it happen again.

## Testing calls locally

You need **two different user accounts** logged in simultaneously (e.g. one normal window, one incognito). The backend explicitly rejects `receiver_id === caller_id`, so testing with one account across two tabs will silently produce nothing.

## Conventions that matter here

### 1. Socket event names are duplicated, not shared — keep them in sync by hand

`RingWave_Backend/src/socket/events.js` and `RingWave_Frontend/src/services/socket.ts` each define their own copy of every event name string. There's no shared package between the two repos. **If you add, rename, or remove a socket event, update both files in the same PR.** A typo'd string in one side just means the listener silently never fires — there's no compile error to catch it.

### 2. The server is the source of truth for display names — never trust a client-supplied name

Every socket event that shows one person's name to someone else (`callerName` on an incoming call, an invitee's name on a group invite broadcast) is resolved server-side from `onlineUserNames`, a cache populated by a real DB lookup (`findUserById`) at connection time — **not** from any `name` field a client includes in its payload.

This exists because it used to be client-trusted, and it silently broke: whenever a caller's local auth state happened to be even briefly out of sync, the callee would see `??` instead of a name, with no server-side fallback to catch it. If you add a new place that needs to show someone's name, resolve it from `onlineUserNames.get(userId)` (or a DB lookup if they might be offline), not from the payload.

### 3. Call-outcome logging is owned per-invite, not per-call

Call logging happens client-side (`POST /calls`), and each client only logs outcomes for people **it personally invited** — tracked in `CallContext.tsx` as `invitedByMeIds`, populated by both `startCall()` and `inviteToCall()`.

This used to be gated on a single "am I the original call initiator" boolean, which meant that when a non-initiator added someone to a group call, nobody ever logged that invite's outcome — it silently vanished. If you touch invite/logging logic, keep it scoped to "whoever sent this specific invite," not "whoever started the call."

### 4. Decline / timeout / end events broadcast to the whole call room, not just one person

`notifyInviteeUnavailable` and `notifyCallEnded` (backend, `socket/index.js`) both emit via `io.to(getRoomName(call.callId))`. This used to target only the original initiator's socket, which meant that in a group call, anyone who wasn't the initiator (including whoever actually sent the invite that got declined) never found out — their UI just showed "connecting…" forever and the participant count never updated. Any new call-outcome event needs to reach everyone currently in the room, not just whoever happens to be considered "in charge" of the call.

### 5. `isCallEffectivelyOver` treats zero participants as call-over, even with pending invites

```js
const isCallEffectivelyOver = (call) =>
  getParticipantIds(call).length === 0 ||
  (getParticipantIds(call).length <= 1 && getInvitedUserIds(call).length === 0);
```

The first clause exists specifically for: caller invites someone, then hangs up before they answer. Without it, the invitee's phone rings forever because the "is this call over" check only considered pending invites, never "is anyone actually still in the call at all." Don't simplify this back to just the second clause.

### 6. `Participant.status` vs `Participant.connectionState` are different things — keep both in sync

`connectionState` is the raw WebRTC `RTCPeerConnectionState` and doesn't exist meaningfully until an offer/answer has actually been exchanged. `status` (`ringing | connecting | connected | declined | no_answer | offline`) covers the whole lifecycle including "invited but no peer connection exists yet." If you add a new participant lifecycle event, make sure you're setting `status`, not just `connectionState` — the UI (`GroupCallPage.tsx`) reads `status` for what it shows on each tile.

### 7. Mic mute state lives in `WebRTCManager`, not just on the shared `MediaStreamTrack`

`setMicrophoneEnabled()` tracks `micEnabled` internally and re-applies it whenever a track gets (re)attached to a (new) peer connection — it doesn't rely purely on every sender happening to reference the exact same track object. If you touch track-attachment logic (`attachLocalTracks`), make sure newly attached tracks still respect current mute state.

## Known-unfinished areas (see README for full list)

If you're picking up detection model integration, contacts request/accept flow, or an SFU migration for group calls — these are real, intentional gaps, not bugs. Check the README's **Known simplifications** and **Suggested next steps** sections before assuming something is broken vs. simply not built yet.

## Before opening a PR

- Frontend: `npx tsc --noEmit` — the codebase is currently fully clean, keep it that way.
- Backend: at minimum `node -c <changed files>` to catch syntax errors; there's no automated test suite yet.
- If you touched call/socket logic at all, actually test it with two real logged-in accounts — a lot of the bugs above only show up with two genuine participants, not by reading the code.