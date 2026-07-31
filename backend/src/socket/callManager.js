const { randomUUID } = require("crypto");

const { CALL_STATE } = require("./events");
const {
  getCall,
  getParticipant,
} = require("./helpers");

const activeCalls = new Map();

/**
 * Creates a new call session.
 *
 * `invitedUsers` is an array of { id, name } — the display name is carried
 * client-side (from the caller's contacts list) since the JWT payload only
 * has { id, email }, and group call UIs need names to render a roster
 * without a second round trip.
 *
 * `ringTimers` holds the per-invitee 60s no-answer timeout handles, keyed
 * by invitee userId, so each person in a group call rings independently —
 * one person not answering doesn't hold up (or end) the call for others.
 */
const createCallSession = ({
  initiatorId,
  initiatorName,
  initiatorSocketId,
  invitedUsers,
}) => {
  const now = Date.now();

  const callId = randomUUID();

  return {
    callId,
    initiatorId,
    state: CALL_STATE.RINGING,
    createdAt: now,
    invitedUsers: new Map(
      invitedUsers.map(({ id, name }) => [
        id,
        {
          name,
          invitedAt: now,
        },
      ])
    ),

    participants: new Map([
      [
        initiatorId,
        {
          socketId: initiatorSocketId,
          name: initiatorName,
          joinedAt: now,
        },
      ],
    ]),

    ringTimers: new Map(),
  };
};

/**
 * Creates and stores a call.
 */
const createCall = ({
  initiatorId,
  initiatorName,
  initiatorSocketId,
  invitedUsers,
}) => {
  const session = createCallSession({
    initiatorId,
    initiatorName,
    initiatorSocketId,
    invitedUsers,
  });

  activeCalls.set(session.callId, session);

  return session;
};

/**
 * Returns a call session.
 */
const findCall = (callId) => {
  return getCall(activeCalls, callId);
};

/**
 * Adds a new invitee to an already-active call — used for turning a 1:1
 * call into a group call mid-conversation. Returns null if the user is
 * already a participant or already invited.
 */
const addInvitee = (call, userId, name) => {
  if (call.participants.has(userId) || call.invitedUsers.has(userId)) {
    return null;
  }

  call.invitedUsers.set(userId, {
    name,
    invitedAt: Date.now(),
  });

  return call;
};

/**
 * Starts (or restarts) a 60s no-answer timer for one invitee. `onTimeout`
 * is called with (call, userId) once the timer fires, but only if that
 * invitee still hasn't answered by then.
 */
const RING_TIMEOUT_MS = 60_000;

const setRingTimer = (call, userId, onTimeout) => {
  clearRingTimer(call, userId);

  const timer = setTimeout(() => {
    call.ringTimers.delete(userId);

    if (!call.invitedUsers.has(userId)) {
      // Already answered, declined, or cancelled in the meantime.
      return;
    }

    onTimeout(call, userId);
  }, RING_TIMEOUT_MS);

  call.ringTimers.set(userId, timer);
};

const clearRingTimer = (call, userId) => {
  const timer = call.ringTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    call.ringTimers.delete(userId);
  }
};

const clearAllRingTimers = (call) => {
  for (const timer of call.ringTimers.values()) {
    clearTimeout(timer);
  }
  call.ringTimers.clear();
};

/**
 * Accepts an incoming call. Carries the invitee's display name (captured at
 * invite time) over into the participant record.
 */
const acceptCall = ({
  callId,
  userId,
  socketId,
}) => {
  const call = findCall(callId);

  if (!call) {
    return null;
  }

  if (!call.invitedUsers.has(userId)) {
    return null;
  }

  const invite = call.invitedUsers.get(userId);

  call.invitedUsers.delete(userId);
  clearRingTimer(call, userId);

  call.participants.set(userId, {
    socketId,
    name: invite?.name,
    joinedAt: Date.now(),
  });

  call.state = CALL_STATE.ACTIVE;

  return call;
};

/**
 * Rejects/declines an invite from one user.
 *
 * Non-destructive by design: a group call with other active participants
 * or other still-pending invitees must survive one person declining. The
 * whole session is only torn down once nobody meaningful is left in it.
 */
const rejectCall = (callId, userId) => {
  const call = findCall(callId);

  if (!call) {
    return null;
  }

  call.invitedUsers.delete(userId);
  clearRingTimer(call, userId);

  if (call.participants.size <= 1 && call.invitedUsers.size === 0) {
    clearAllRingTimers(call);
    activeCalls.delete(callId);
  }

  return call;
};

/**
 * Removes a participant from a call. Mutates and returns the call — does
 * NOT decide whether the whole session should end; the socket layer does
 * that based on who (if anyone) is left.
 */
const leaveCall = ({
  callId,
  userId,
}) => {
  const call = findCall(callId);

  if (!call) {
    return null;
  }

  call.participants.delete(userId);

  return call;
};

/**
 * Permanently destroys a call.
 *
 * Clears any still-pending ring timers (so they don't fire against a
 * deleted call) and returns the removed session so the socket layer can
 * notify participants.
 */
const destroyCall = (callId) => {
  const call = findCall(callId);

  if (!call) {
    return null;
  }

  clearAllRingTimers(call);
  activeCalls.delete(callId);

  return call;
};

/**
 * Updates a participant's socket after reconnect.
 */
const reconnectParticipant = ({
  userId,
  socketId,
}) => {
  const updatedCalls = [];

  for (const call of activeCalls.values()) {
    const participant = getParticipant(call, userId);

    if (!participant) {
      continue;
    }

    participant.socketId = socketId;

    updatedCalls.push(call);
  }

  return updatedCalls;
};

/**
 * Returns true if nobody is left in the call.
 */
const isCallEmpty = (call) => {
  return call.participants.size === 0;
};

/**
 * Cleans up a user after disconnect.
 *
 * Returns every affected call so the socket
 * layer can decide how to notify clients.
 */
const cleanupUserDisconnect = (userId) => {
  const affectedCalls = [];

  for (const call of activeCalls.values()) {
    // User was an active participant.
    if (call.participants.has(userId)) {
      call.participants.delete(userId);

      affectedCalls.push({
        type: "participant_left",
        call,
      });

      continue;
    }

    // User was invited but never answered.
    if (call.invitedUsers.has(userId)) {
      call.invitedUsers.delete(userId);
      clearRingTimer(call, userId);

      affectedCalls.push({
        type: "invite_cancelled",
        call,
      });
    }
  }

  return affectedCalls;
};

/**
 * Returns every active call for a user.
 * Useful for reconnect support.
 */
const getUserCalls = (userId) => {
  const calls = [];

  for (const call of activeCalls.values()) {
    if (
      call.participants.has(userId) ||
      call.invitedUsers.has(userId)
    ) {
      calls.push(call);
    }
  }

  return calls;
};

/**
 * Returns every socket currently participating
 * in the call.
 */
const getParticipantSocketIds = (call) => {
  return [...call.participants.values()]
    .map((participant) => participant.socketId)
    .filter(Boolean);
};

/**
 * Returns all participant user IDs.
 */
const getParticipantIds = (call) => {
  return [...call.participants.keys()];
};

/**
 * Returns { id, name } for every current participant — used when telling a
 * newly-joined member of a group call who else is already on the line.
 */
const getParticipants = (call) => {
  return [...call.participants.entries()].map(([id, p]) => ({
    id,
    name: p.name,
  }));
};

/**
 * Returns invited user IDs.
 */
const getInvitedUserIds = (call) => {
  return [...call.invitedUsers.keys()];
};

module.exports = {
  activeCalls,
  createCall,
  findCall,
  addInvitee,
  setRingTimer,
  clearRingTimer,
  clearAllRingTimers,
  RING_TIMEOUT_MS,
  acceptCall,
  rejectCall,
  leaveCall,
  destroyCall,
  reconnectParticipant,
  cleanupUserDisconnect,
  getUserCalls,
  isCallEmpty,
  getParticipantIds,
  getParticipants,
  getParticipantSocketIds,
  getInvitedUserIds,
};
