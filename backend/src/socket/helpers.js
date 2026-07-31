const getRoomName = (callId) => `call:${callId}`;
const getSocketId = (onlineUsers, userId) => {
  return onlineUsers.get(userId) ?? null;
};
const getCall = (activeCalls, callId) => {
  return activeCalls.get(callId) ?? null;
};
const getParticipant = (call, userId) => {
  return call.participants.get(userId) ?? null;
};
const isParticipant = (call, userId) => {
  return call.participants.has(userId);
};
const isInvited = (call, userId) => {
  return call.invitedUsers.has(userId);
};

module.exports = {
  getRoomName,
  getSocketId,
  getCall,
  getParticipant,
  isParticipant,
  isInvited,
};