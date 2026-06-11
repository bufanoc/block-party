import { io } from 'socket.io-client';
import { serverUrl } from './socket-url.js';

// Single shared socket for the whole app. Created lazily so the landing/solo
// pages never open a connection. Auth (a token in the handshake) is wired in
// Phase 2; for now the connection is anonymous.
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(serverUrl(), {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function isConnected() {
  return !!socket && socket.connected;
}
