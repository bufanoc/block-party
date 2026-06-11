import { io } from 'socket.io-client';
import { serverUrl } from './socket-url.js';
import { getToken } from './session.js';

// Single shared socket for the whole app. Created lazily so the landing/solo
// pages never open a connection. The stored session token is sent in the
// handshake so a page reload re-authenticates without another login.
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(serverUrl(), {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: { token: getToken() },
    });
  }
  return socket;
}

// After a fresh login, update the handshake auth so future reconnects re-auth.
export function setSocketToken(token) {
  if (socket) socket.auth = { token };
}

// Drop the connection and clear the singleton (used on logout so the next
// login opens a fresh, correctly-authenticated socket).
export function resetSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}

export function isConnected() {
  return !!socket && socket.connected;
}
