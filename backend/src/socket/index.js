const jwt = require("jsonwebtoken");

const logger = require("../config/logger");
const { findUserById } = require("../models/userModel");

const { EVENTS } = require("./events");
const {
  createCall,
  findCall,
  addInvitee,
  setRingTimer,
  acceptCall,
  rejectCall,
  leaveCall,
  destroyCall,
  reconnectParticipant,
  cleanupUserDisconnect,
  getParticipantIds,
  getParticipants,
  getInvitedUserIds,
} = require("./callManager");

const {
  getRoomName,
  getSocketId,
} = require("./helpers");

const onlineUsers = new Map();
// userId -> socketId

const onlineUserNames = new Map();
// userId -> real display name, looked up from the DB at connection time.
// Names shown to *other* people (caller name on an incoming call, invitee
// name on an invite broadcast) must come from here, never from whatever a
// client claims about itself or someone else — the JWT payload only has
// { id, email } (see the comment this replaces on the frontend side), and
// trusting a client-supplied "name" field is exactly how the incoming-call
// screen ended up showing "??" whenever that field happened to be stale,
// unpopulated, or simply not sent.

/** True once nobody meaningful is left on a call: either nobody is
 * actually in it anymore (the initiator hung up before anyone joined —
 * pending invitees have no one left to talk to, so the call is over even
 * though they're technically still "invited"), or at most the lone
 * initiator remains with no one else still invited either. */
const isCallEffectivelyOver = (call) =>
  getParticipantIds(call).length === 0 ||
  (getParticipantIds(call).length <= 1 && getInvitedUserIds(call).length === 0);

/**
 * Notifies everyone tied to a call that it has ended entirely:
 * both room participants (already joined) and any invited users
 * who never joined the room (still ringing).
 */
const notifyCallEnded = (io, call, { from, reason }) => {
  io.to(getRoomName(call.callId)).emit(EVENTS.CALL_ENDED, {
    callId: call.callId,
    from,
    reason,
  });

  for (const invitedUserId of call.invitedUsers.keys()) {
    const invitedSocketId = getSocketId(onlineUsers, invitedUserId);

    if (invitedSocketId) {
      io.to(invitedSocketId).emit(EVENTS.CALL_ENDED, {
        callId: call.callId,
        from,
        reason,
      });
    }
  }
};

/**
 * Handles one participant leaving a call that has ALREADY had them removed
 * from `call.participants` (by leaveCall() or cleanupUserDisconnect()).
 *
 * If nobody meaningful is left (no other active participants, and nobody
 * still-pending), the whole session ends for everyone. Otherwise, the
 * remaining participants are just told this one person left, so each of
 * them can tear down that one peer connection instead of the whole call.
 */
const finalizeParticipantLeft = (io, call, userId, reason) => {
  const room = getRoomName(call.callId);

  if (isCallEffectivelyOver(call)) {
    notifyCallEnded(io, call, { from: userId, reason });

    for (const participantId of getParticipantIds(call)) {
      const participantSocketId = getSocketId(onlineUsers, participantId);
      const participantSocket =
        participantSocketId && io.sockets.sockets.get(participantSocketId);

      participantSocket?.leave(room);
    }

    destroyCall(call.callId);
    return;
  }

  io.to(room).emit(EVENTS.CALL_PARTICIPANT_LEFT, {
    callId: call.callId,
    userId,
    reason,
  });
};

/**
 * Notifies the caller that one invitee is out of the picture (declined,
 * offline, timed out, or disconnected before answering), and tells them
 * whether the whole call is now over as a result — a group call with
 * other people still on it (or still pending) survives this; a 1:1 call,
 * or the last remaining invite on a group call, does not.
 */
const notifyInviteeUnavailable = (io, call, userId, reason) => {
  const callEnded = isCallEffectivelyOver(call);

  // Broadcast to everyone currently on the call, not just the original
  // initiator — anyone who invited this person, or is simply already in
  // the call, needs to know the invite fell through so their UI can drop
  // the "ringing"/"connecting" tile instead of showing it forever.
  io.to(getRoomName(call.callId)).emit(EVENTS.CALL_REJECTED, {
    callId: call.callId,
    from: userId,
    reason,
    callEnded,
  });

  if (callEnded) {
    destroyCall(call.callId);
  }
};

const startInviteeRingTimer = (io, call, userId) => {
  setRingTimer(call, userId, (call, userId) => {
    logger.info({ callId: call.callId, userId }, "call:ring_timeout");

    call.invitedUsers.delete(userId);

    const inviteeSocketId = getSocketId(onlineUsers, userId);
    if (inviteeSocketId) {
      io.to(inviteeSocketId).emit(EVENTS.CALL_ENDED, {
        callId: call.callId,
        reason: "timeout",
      });
    }

    notifyInviteeUnavailable(io, call, userId, "no_answer");
  });
};

const socketHandler = (io) => {
  // =====================================================
  // AUTHENTICATION
  // =====================================================

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error("No token provided"));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      // decoded only carries { id, email } — fetch the real record so
      // `socket.user.name` is always trustworthy for every event that
      // needs to show this person's name to someone else.
      const dbUser = await findUserById(decoded.id);

      if (!dbUser) {
        return next(new Error("Unauthorized socket connection"));
      }

      socket.user = { id: dbUser.id, email: dbUser.email, name: dbUser.name };

      next();
    } catch (err) {
      next(new Error("Unauthorized socket connection"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;

    logger.info({ userId }, "socket:connected");

    onlineUsers.set(userId, socket.id);
    onlineUserNames.set(userId, socket.user.name);

    reconnectParticipant({
      userId,
      socketId: socket.id,
    });

    socket.emit(EVENTS.CONNECTED, {
      userId,
      message: "Socket connected successfully",
    });

    // =====================================================
    // OUTGOING CALL (1:1 or group — `to` is always an array)
    // =====================================================

    socket.on(
      EVENTS.CALL_OUTGOING,
      ({ to }) => {
        const callerName = socket.user.name;
        const invitees = Array.isArray(to) ? to : [to];

        logger.info(
          { from: userId, to: invitees.map((i) => i.id), callerName },
          "call:outgoing"
        );

        const onlineInvitees = invitees.filter((invitee) =>
          getSocketId(onlineUsers, invitee.id)
        );

        if (onlineInvitees.length === 0) {
          socket.emit(EVENTS.CALL_REJECTED, {
            reason: "offline",
            callEnded: true,
          });
          return;
        }

        const call = createCall({
          initiatorId: userId,
          initiatorName: callerName,
          initiatorSocketId: socket.id,
          invitedUsers: onlineInvitees,
        });

        socket.join(getRoomName(call.callId));

        // Acknowledge the caller with the generated callId.
        socket.emit(EVENTS.CALL_OUTGOING, {
          callId: call.callId,
          to: onlineInvitees.map((i) => i.id),
        });

        for (const invitee of onlineInvitees) {
          const receiverSocketId = getSocketId(onlineUsers, invitee.id);
          logger.info({
            caller: userId,
            receiver: invitee.id,
            receiverSocketId,
            onlineUsers: [...onlineUsers.entries()],
          }, "CALL DEBUG");

          io.to(receiverSocketId).emit(EVENTS.CALL_INCOMING, {
            callId: call.callId,
            from: userId,
            callerName,
            isGroup: onlineInvitees.length > 1,
          });

          startInviteeRingTimer(io, call, invitee.id);
        }

        logger.info({ callId: call.callId }, "call:created");
      }
    );

    // =====================================================
    // INVITE SOMEONE INTO AN ALREADY-ACTIVE CALL
    // (turns a 1:1 call into a group call, or adds to one already going)
    // =====================================================

    socket.on(EVENTS.CALL_INVITE, ({ callId, to }) => {
      const call = findCall(callId);

      if (!call || !call.participants.has(userId)) {
        return;
      }

      const targetSocketId = getSocketId(onlineUsers, to.id);

      if (!targetSocketId) {
        socket.emit(EVENTS.CALL_REJECTED, {
          callId,
          from: to.id,
          reason: "offline",
          callEnded: false,
        });
        return;
      }

      // Verified name for the person being invited — they must be online
      // to have a targetSocketId above, so they're guaranteed to be in
      // onlineUserNames already.
      const targetName = onlineUserNames.get(to.id);

      if (!addInvitee(call, to.id, targetName)) {
        // Already a participant or already invited — nothing to do.
        return;
      }

      io.to(targetSocketId).emit(EVENTS.CALL_INCOMING, {
        callId: call.callId,
        from: userId,
        callerName: call.participants.get(userId)?.name,
        isGroup: true,
      });

      // Let everyone else already on the call know this invite went out,
      // so their UI can show a "ringing" tile for the invitee instead of
      // staying silent until they either join or time out.
      socket.to(getRoomName(call.callId)).emit(EVENTS.CALL_INVITE_SENT, {
        callId: call.callId,
        userId: to.id,
        name: targetName,
        invitedBy: userId,
      });

      startInviteeRingTimer(io, call, to.id);

      logger.info({ callId, invitedUserId: to.id }, "call:invite");
    });

    // =====================================================
    // CALL ACCEPTED
    // =====================================================

    socket.on(
      EVENTS.CALL_ACCEPTED,
      ({ callId }) => {
        const call = acceptCall({
          callId,
          userId,
          socketId: socket.id,
        });

        if (!call) {
          return;
        }

        const room = getRoomName(call.callId);
        const existingParticipants = getParticipants(call).filter(
          (p) => p.id !== userId
        );

        socket.join(room);

        // Tell the new joiner who else is already on the call — used only
        // for roster display; they don't initiate offers themselves.
        socket.emit(EVENTS.CALL_ACCEPTED, {
          callId: call.callId,
          participants: existingParticipants,
        });

        // Tell everyone already in the call that this user joined, so each
        // of them creates a peer connection + offer targeted at the new
        // joiner (avoids "glare" from both sides offering at once).
        socket.to(room).emit(EVENTS.CALL_PARTICIPANT_JOINED, {
          callId: call.callId,
          userId,
          name: call.participants.get(userId)?.name,
        });

        logger.info({ callId: call.callId, userId }, "call:accepted");
      }
    );

    // =====================================================
    // CALL REJECTED
    // =====================================================

    socket.on(
      EVENTS.CALL_REJECTED,
      ({ callId, reason }) => {
        const call = rejectCall(callId, userId);

        if (!call) {
          return;
        }

        notifyInviteeUnavailable(io, call, userId, reason ?? "declined");

        logger.info({ callId, userId }, "call:rejected");
      }
    );

    // =====================================================
    // CALL ENDED (client-initiated leave/end)
    // =====================================================

    socket.on(
      EVENTS.CALL_ENDED,
      ({ callId }) => {
        const call = findCall(callId);

        if (!call) {
          return;
        }

        leaveCall({ callId, userId });
        finalizeParticipantLeft(io, call, userId, "ended");

        socket.leave(getRoomName(callId));

        logger.info({ callId, userId }, "call:left");
      }
    );

    // =====================================================
    // WEBRTC OFFER / ANSWER / ICE — all point-to-point via `to`
    // =====================================================

    socket.on(EVENTS.SIGNAL_OFFER, ({ callId, to, offer }) => {
      const call = findCall(callId);
      const targetSocketId = getSocketId(onlineUsers, to);

      if (!call || !targetSocketId) {
        return;
      }

      io.to(targetSocketId).emit(EVENTS.SIGNAL_OFFER, {
        callId,
        from: userId,
        offer,
      });
    });

    socket.on(EVENTS.SIGNAL_ANSWER, ({ callId, to, answer }) => {
      const call = findCall(callId);
      const targetSocketId = getSocketId(onlineUsers, to);

      if (!call || !targetSocketId) {
        return;
      }

      io.to(targetSocketId).emit(EVENTS.SIGNAL_ANSWER, {
        callId,
        from: userId,
        answer,
      });
    });

    socket.on(EVENTS.SIGNAL_ICE, ({ callId, to, candidate }) => {
      const call = findCall(callId);
      const targetSocketId = getSocketId(onlineUsers, to);

      if (!call || !targetSocketId) {
        return;
      }

      io.to(targetSocketId).emit(EVENTS.SIGNAL_ICE, {
        callId,
        from: userId,
        candidate,
      });
    });

    // =====================================================
    // DISCONNECT
    // =====================================================

    socket.on("disconnect", () => {
      logger.info({ userId }, "socket:disconnected");

      const currentSocket = onlineUsers.get(userId);
      if (currentSocket === socket.id) {
        onlineUsers.delete(userId);
        onlineUserNames.delete(userId);
      }

      const affectedCalls = cleanupUserDisconnect(userId);

      for (const { call, type } of affectedCalls) {
        // User disconnected before answering — just let the caller know
        // this one invitee is unreachable; don't tear down a call that
        // still has other active or pending participants.
        if (type === "invite_cancelled") {
          notifyInviteeUnavailable(io, call, userId, "offline");
          continue;
        }

        // Active participant disconnected. cleanupUserDisconnect() has
        // already removed them from call.participants by this point.
        if (type === "participant_left") {
          finalizeParticipantLeft(io, call, userId, "disconnect");
        }
      }
    });
  });
};

module.exports = {
  socketHandler,
  onlineUsers,
};
