# Heli Attack

A modern retro side-scrolling helicopter shooter for the browser, inspired by the early-80s arcade cave shooters.

**Play:** https://heliattack.sala.company/ (installable as an app: on iPhone use Share → Add to Home Screen for full screen)

Fly through six stages, shoot and bomb ground targets, destroy fuel tanks to refuel, defeat the gunship at the end of the fortress, grab the data core and escape. Each completed mission loops back harder.

## Stages and set pieces

| Stage | Set pieces |
|---|---|
| 1 Hills | Missile battery on a plateau, fuel depot in a valley |
| 2 Caverns | Serpent passage, UFO squadron |
| 3 Meteor Storm | Meteor shower (warning first), crater missile nest |
| 4 City | Skyline climb with turrets, armoured column on a long roof |
| 5 Tunnels | Timed laser gates, zigzag run |
| 6 Fortress | Bunker row under a low roof, gunship boss |

Every stage has a mid-stage checkpoint (flag) - die after passing it and you restart there.

## Power-ups

Destroy radar dishes (and sometimes UFOs, jets and tanks) to drop capsules:
**S** spread shot (15 s), **B** triple bombs (15 s), **H** shield (absorbs one hit).

## Controls

| | Keyboard | Phone | Gamepad |
|---|---|---|---|
| Fly | Arrows / WASD | Left thumb (drag anywhere) | Stick / D-pad |
| Fire | Space / Z (or auto-fire) | Auto-fire, or hold right side | A |
| Bomb | X | Tap right side (auto-fire on) or BOMB ring | B / X |
| Pause | P / Esc | Pause icon (top centre) | Start |
| Auto-fire | F | Title / pause menu | |
| Mute | M | Title / pause menu (music and SFX levels) | |

## Tech

Plain HTML5 Canvas and Web Audio (all sound effects and the chiptune music are synthesized at runtime), no build step. `index.html` + `game.js`, a network-first service worker (`sw.js`) for offline play, and a web app manifest. Deployed to GitHub Pages by `.github/workflows/pages.yml`; `check-site.yml` is a manual DNS/HTTPS check. Analytics: GoatCounter (shared sala.company dashboard), including game events (start, game over stage, boss defeated, mission complete).
