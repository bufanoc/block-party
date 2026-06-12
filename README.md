# Block Party

A 3D brick-building sandbox that runs in your browser. Snap bricks onto a grid,
stack them up, and build your **World** — on your own, or together with others
in real time over the network.

Built with [Three.js](https://threejs.org/), [Vite](https://vitejs.dev/), and
[Socket.IO](https://socket.io/).

> **A LAN-party game (v1.0).** Block Party is made for people on the same network
> (or the same room): play side-by-side on your **LAN**, or with remote friends
> over a private encrypted overlay like [ZeroTier](https://www.zerotier.com/) or
> Tailscale. It's intentionally lightweight — a username + PIN, plain HTTP — which
> is exactly right on a trusted network, and exactly why you should **not put it
> on a public IP**. Keep it on your LAN/VPN and you're all set.

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

Playing needs nothing but a browser — open the URL your host gives you on any
**desktop or laptop** (Windows, macOS, Linux). **Solo sandbox** works with no
account; **Play together** asks for a name and a PIN.

> Mobile (phones/tablets) is **experimental** in this release — the 3D builder
> may run, but the touch controls and on-screen panels aren't tuned for small
> screens yet. It's on the roadmap.

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

### Security & networking

Block Party is designed to live on a **trusted network**, and its security model
assumes exactly that:

- **On your LAN** — just share the URL with people on the same Wi-Fi/network.
- **With remote friends** — put everyone on a private encrypted overlay like
  [ZeroTier](https://www.zerotier.com/) or [Tailscale](https://tailscale.com/),
  then share the server's overlay address. Your traffic rides inside their
  end-to-end encryption, and only invited members can reach it.
- **Do not expose it directly on a public IP.** Auth is a lightweight username +
  PIN (hashed with `scrypt`), traffic is plain HTTP, and there's no rate-limiting
  or quotas — all fine among people you've invited to a private network, not fine
  facing the open internet.

If you ever *do* want a public, hardened deployment, that's a future step
(reverse proxy + HTTPS + rate-limiting) — but it's deliberately out of scope for
this LAN-party release.

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
