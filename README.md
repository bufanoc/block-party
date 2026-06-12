# Block Party

A 3D brick-building sandbox that runs in your browser. Snap bricks onto a grid,
stack them up, and build your **World** — on your own, or together with others
in real time over the network.

Built with [Three.js](https://threejs.org/), [Vite](https://vitejs.dev/), and
[Socket.IO](https://socket.io/).

> ⚠️ **Pre-release (v1.0.0-pre).** Block Party works and is fun to self-host, but
> it is **not hardened for the public internet** — auth is a lightweight
> username + PIN, traffic is plain HTTP, and there's no rate-limiting or quotas.
> Run it on a **trusted network (LAN/VPN)** or behind a reverse proxy with HTTPS.

## Quick start — self-host on Ubuntu Server 24.04 LTS

On a fresh **Ubuntu Server 24.04 LTS** box, one command installs everything
(Node.js, the app, a build) and starts it as a service on port **80**:

```bash
curl -fsSL https://raw.githubusercontent.com/bufanoc/block-party/main/install.sh | sudo bash
```

Then open **`http://<your-server-ip>`**. Re-run the same command to update.

> Want to see what it does first? Read [`install.sh`](install.sh) — it's short.
> Prefer to do it by hand? See [Run your own server](#run-your-own-server) below.

## Features

- Click to place bricks, right-click to delete, with a live ghost preview
- Grid snapping and automatic stacking; many brick shapes + a classic palette
- **Solo sandbox** — offline, saved to your browser (no server needed)
- **Play together** — accounts, a lobby of shared **Projects**, and real-time
  co-building in the same World
- **Project sizes & colors** — pick a baseplate size (Small / Medium / Large)
  and color when you create a World
- **Creator controls** — each Project has an owner who can require approval to
  join, freeze the build, rename, clear, or delete it
- Rotate (`R`), Undo (`Ctrl/Cmd+Z` — solo), and Clear

## Play

Playing needs nothing but a browser — open the URL your host gives you on
Windows, macOS, Linux, Android, or iPhone. **Solo sandbox** works with no
account; **Play together** asks for a name and a PIN.

## Develop

Two processes — the Vite dev server for the front-end, and the game server:

```bash
npm install
npm run dev      # front-end on http://localhost:5173
npm run server   # multiplayer game server on http://localhost:3001 (separate terminal)
```

Open http://localhost:5173. (Solo mode needs only `npm run dev`.)

## Run your own server

> **Supported platform: Ubuntu Server 24.04 LTS.** That's what Block Party is
> built and tested on. It will likely run on any 64-bit Linux with Node.js 18+,
> but Ubuntu 24.04 LTS is the only configuration guaranteed to work. The server
> needs **Node.js 18 or newer**.

### 1. Install Node.js and git

Ubuntu 24.04 ships a compatible Node.js (18.x):

```bash
sudo apt update
sudo apt install -y nodejs npm git
```

(Optional — for a current LTS via NodeSource instead:)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
```

### 2. Get the code and build it

```bash
git clone https://github.com/bufanoc/block-party.git
cd block-party
npm ci
npm run build
```

### 3. Run it

In production the server serves the whole app **and** the multiplayer socket on
a **single port** — and defaults to **port 80** (clean URLs). Port 80 is
privileged, so for a quick foreground run either use `sudo`, or pick an
unprivileged port:

```bash
sudo npm start                 # port 80  → http://<server-ip>
# or, no sudo needed:
PORT=8080 npm start            # port 8080 → http://<server-ip>:8080
```

If you use the firewall, open the port (`80` or `8080`):

```bash
sudo ufw allow 80/tcp
```

For anything long-lived, use the systemd service below — it binds port 80
without running as root.

### Keep it running (systemd) — recommended

So it starts on boot, restarts on failure, and binds port 80 as an unprivileged
user. Create `/etc/systemd/system/block-party.service` (replace the path and
user):

```ini
[Unit]
Description=Block Party server
After=network.target

[Service]
WorkingDirectory=/home/USER/block-party
ExecStart=/usr/bin/node server/index.js
Environment=PORT=80
Environment=NODE_ENV=production
Restart=on-failure
User=USER
# Lets the unprivileged user bind port 80 (no running as root).
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
```

Then enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now block-party
sudo systemctl status block-party
```

### Updating to a newer version

```bash
cd block-party
git pull
npm ci
npm run build
sudo systemctl restart block-party   # or restart your `npm start` process
```

### Data and backups

Accounts and Worlds are stored as plain JSON under **`data/`** (git-ignored).
Back up that folder to preserve everyone's builds.

### Changing the port

```bash
PORT=3000 node server/index.js
```

(or edit the `Environment=PORT=` line in the service file).

### Security note

Accounts use a username + PIN, hashed server-side with `scrypt` — lightweight,
meant for friends and self-hosting, not bank-grade. The server speaks plain
HTTP. To expose it to the public internet, put it behind a reverse proxy
(nginx / Caddy) terminating HTTPS.

## Controls

| Action        | Input                       |
| ------------- | --------------------------- |
| Place brick   | Left click                  |
| Delete brick  | Right click                 |
| Orbit camera  | Left drag                   |
| Zoom          | Scroll                      |
| Rotate piece  | `R`                         |
| Undo (solo)   | `Ctrl+Z` / `Cmd+Z`          |

## License

Released under the **Block Party License** (BSD 3-Clause with an attribution
requirement) — see [LICENSE](LICENSE).

You are free to use, modify, and redistribute this software, in whole or in
part, **provided you give clear, visible credit** to the original author:

> Based on Block Party by Carmine Bufano
> https://carminebufano.com
> https://github.com/bufanoc/block-party

## Disclaimer

LEGO® is a trademark of the LEGO Group, which does not sponsor, authorize, or
endorse this project. Block Party is an independent, fan-made building sandbox
and is not affiliated with the LEGO Group.
