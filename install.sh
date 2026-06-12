#!/usr/bin/env bash
#
# Block Party — pre-release installer for Ubuntu Server 24.04 LTS.
#
# Turns a fresh Ubuntu 24.04 LTS server into a running Block Party server:
# installs Node.js, fetches the code, builds the front-end, and runs it as a
# systemd service on port 8080.
#
#   curl -fsSL https://raw.githubusercontent.com/bufanoc/block-party/main/install.sh | sudo bash
#
# Re-running it updates an existing install in place. Opinionated by design;
# tweak the variables below if you want different paths/port/user.
#
# NOTE: pre-release software. Intended for a trusted network (LAN/VPN) or behind
# a reverse proxy with HTTPS. It is NOT hardened for direct public-internet use.

set -euo pipefail

APP_USER="blockparty"
APP_DIR="/opt/block-party"
PORT="80"
REPO="https://github.com/bufanoc/block-party.git"
NODE_MAJOR="20"

log() { printf '\n\033[1;33m==>\033[0m %s\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "This installer must run as root. Try:  curl -fsSL <url> | sudo bash" >&2
  exit 1
fi

if [ -r /etc/os-release ] && ! grep -qi ubuntu /etc/os-release; then
  echo "Warning: this installer is written for Ubuntu Server 24.04 LTS. Continuing anyway in 5s… (Ctrl-C to abort)"
  sleep 5
fi

log "Installing prerequisites (git, curl, ca-certificates)…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates

# Install Node.js only if it's missing or older than 18.
need_node=1
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "${major:-0}" -ge 18 ] && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
  log "Installing Node.js ${NODE_MAJOR}.x via NodeSource…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
else
  log "Node.js $(node -v) already present — keeping it."
fi

log "Creating service user '${APP_USER}'…"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/home/${APP_USER}" --shell /usr/sbin/nologin "$APP_USER"
fi

log "Fetching Block Party into ${APP_DIR}…"
if [ -d "${APP_DIR}/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  mkdir -p "$APP_DIR"
  git clone "$REPO" "$APP_DIR"
fi
chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"

log "Installing dependencies and building the front-end…"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm ci && npm run build"

log "Installing systemd service…"
NODE_BIN="$(command -v node)"
cat > /etc/systemd/system/block-party.service <<UNIT
[Unit]
Description=Block Party server
After=network.target

[Service]
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} server/index.js
Environment=PORT=${PORT}
Environment=NODE_ENV=production
Restart=on-failure
User=${APP_USER}
# Allow the unprivileged service user to bind the privileged port (80).
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now block-party

# Best-effort: open the port if ufw is active.
if command -v ufw >/dev/null 2>&1; then
  ufw allow "${PORT}/tcp" >/dev/null 2>&1 || true
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [ "$PORT" = "80" ]; then URL="http://${IP:-<server-ip>}"; else URL="http://${IP:-<server-ip>}:${PORT}"; fi
cat <<DONE

================================================================
  Block Party is running.

    Open:    ${URL}
    Status:  systemctl status block-party
    Logs:    journalctl -u block-party -f
    Stop:    systemctl stop block-party
    Update:  re-run this installer

  Worlds & accounts live in ${APP_DIR}/data  (back this up).
================================================================
DONE
