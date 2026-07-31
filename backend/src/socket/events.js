const EVENTS = Object.freeze({
  // Connection
  CONNECTED: "connected",

  // Call lifecycle
  CALL_OUTGOING: "call:outgoing",
  CALL_INCOMING: "call:incoming",
  CALL_ACCEPTED: "call:accepted",
  CALL_REJECTED: "call:rejected",
  CALL_ENDED: "call:ended",
  CALL_PARTICIPANT_JOINED: "call:participant_joined",
  CALL_PARTICIPANT_LEFT: "call:participant_left",
  CALL_INVITE: "call:invite",
  /** Broadcast to everyone already on the call (except the inviter, who
   *  already knows) when someone new gets invited mid-call — lets their
   *  clients show a "ringing" tile for the invitee instead of learning
   *  about them only once they actually join. */
  CALL_INVITE_SENT: "call:invite_sent",

  // WebRTC signaling
  SIGNAL_OFFER: "signal:offer",
  SIGNAL_ANSWER: "signal:answer",
  SIGNAL_ICE: "signal:ice",
});

const CALL_STATE = Object.freeze({
  RINGING: "ringing",
  ACTIVE: "active",
  ENDED: "ended",
});

module.exports = {
  EVENTS,
  CALL_STATE,
};