// Resolve the game-server URL from however the page was loaded.
//   localhost:5173      -> http://localhost:3001
//   192.168.88.x:5173   -> http://192.168.88.x:3001   (LAN / ZeroTier)
// The page is already reachable at `hostname`, so the same host on the
// game-server port is reachable too; the server binds 0.0.0.0.
export const GAME_SERVER_PORT = 3001;

export function serverUrl() {
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${GAME_SERVER_PORT}`;
}
