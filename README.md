# Heli Attack

A modern retro side-scrolling helicopter shooter for the browser, inspired by the early-80s arcade cave shooters.

**Play:** https://heliattack.sala.company/

Fly through six stages (Hills, Caverns, Meteor Storm, City, Tunnels, Fortress), shoot and bomb ground targets, destroy fuel tanks to refuel, grab the data core at the end of the fortress and escape. Each completed mission loops back harder.

## Controls

| | Keyboard | Phone | Gamepad |
|---|---|---|---|
| Fly | Arrows / WASD | Left thumb (drag) | Stick / D-pad |
| Fire | Space / Z | Right side of screen | A |
| Bomb | X | BOMB button | B / X |
| Pause | P / Esc | Pause icon (top) | Start |
| Mute | M | Pause menu | |

## Tech

Plain HTML5 Canvas and Web Audio (all sounds are synthesized), no build step. `index.html` + `game.js`, deployed to GitHub Pages by `.github/workflows/pages.yml`.
