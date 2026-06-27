const userSockets = new Map();

export function addUserSocket(userId, socketId) {
  const id = userId.toString();
  const sockets = userSockets.get(id) || new Set();
  sockets.add(socketId);
  userSockets.set(id, sockets);
}

export function removeUserSocket(userId, socketId) {
  const id = userId.toString();
  const sockets = userSockets.get(id);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSockets.delete(id);
    return true;
  }
  return false;
}

export function isUserOnline(userId) {
  return userSockets.has(userId.toString());
}
