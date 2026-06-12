// Resolve the game-server URL.
//
// Dev: Vite serves the page on :5173 and the game server runs separately on
//      :3001 — connect there.
// Prod: the page is served by the game server itself (single port), so the
//       socket is same-origin.
export const DEV_VITE_PORT = '5173';
export const GAME_SERVER_PORT = 3001;

export function serverUrl() {
  const { protocol, hostname, port, origin } = window.location;
  if (port === DEV_VITE_PORT) return `${protocol}//${hostname}:${GAME_SERVER_PORT}`;
  return origin;
}
