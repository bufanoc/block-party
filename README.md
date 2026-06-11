# Block Party

A 3D brick-building sandbox that runs in your browser. Snap bricks onto a grid,
stack them up, and build your **World** — solo today, together soon.

Built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/).

## Features

- Click to place bricks, right-click to delete
- Live ghost preview of where the next brick lands
- Grid snapping and automatic stacking
- Multiple brick shapes and a classic color palette
- Rotate (`R`), Undo (`Ctrl/Cmd+Z`), and Clear
- Your build is auto-saved to the browser (localStorage)
- Orbit / pan / zoom camera

### Coming next: the *Party*

Real-time multiplayer — multiple people building in the same World over the
network at the same time. (In planning.)

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # production build into dist/
npm run preview  # preview the production build
```

## Controls

| Action        | Input                       |
| ------------- | --------------------------- |
| Place brick   | Left click                  |
| Delete brick  | Right click                 |
| Orbit camera  | Left drag                   |
| Zoom          | Scroll                      |
| Rotate piece  | `R`                         |
| Undo          | `Ctrl+Z` / `Cmd+Z`          |

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
