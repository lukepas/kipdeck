# The deck

Back to the [README](../README.md).

Every project is a deck: one operations floor floating in a slate void, the same on every project. It is built so that a glance from anywhere on it (or from the Overview above it) tells you which units need a person, which are stuck and which are only at work. The plan is `src/shared/layout.ts`, which the server checks seats against and the 2D view reads too, so the 3D deck and the rest never drift apart.

## What's where

The deck is 36 by 26 m. North is the Main board's wall, and the Deck lift you arrive in is on it, east of the board.

| Place | Where | What it's for |
| --- | --- | --- |
| Mission table | the middle | The floor's mission on its top: the statement in the middle, a wedge per milestone round it (filled once done, ruled brighter while it's the one you're on) and a tick on the rim for each. Every console faces it. |
| Pods A to D | four arcs of four consoles, 7.5 m out: A north-west, B north-east, C south-east, D south-west | Where units sit, one per console (`desk-1` to `desk-16`, four to a pod). Each pod's floor plate, past its arc, names the goal most of its units work toward. |
| Ready line | a painted orange double stripe in front of each pod, 1.4 m out from the table, with numbered ticks | Where units that need you will stand, tick 1 for whoever has waited longest. |
| Main board | the north wall | Three panels edge to edge: Issues, Queue and Pull requests, each with its board agent's lectern at its west end. |
| Attention board | the east wall | The floor's units ranked by who needs someone most, in the top bar's order, each with its glyph, its cell, why and for how long. While someone shares their screen, it shows that instead. The operator bench faces it. |
| Proof corner | the west wall | The capacity panel (CPU, memory, units against the limit), then the violet attestation rail with a lit segment per merge paid out on devnet, the escrow vault (its seam glows while a bounty is held, and its lid lifts as one is released), and the ERC-8004 plinth with a lit step per unit with a reputation record. |
| Review bay | the south-east corner | Smoked glass, a small table with the pull requests waiting on it as lit sheets, and the review's output on the east wall. Called reviews (meetings) sit here. |
| Standby bench | along the south curb | The overflow seats, out one at a time once every console is taken (`beanbag-1` to `beanbag-12`). Parked units wait here. |
| Overflow bay | through the north wall past the lift | Two more consoles a row, up to two rows, at the Room to grow sign (`desk-17` to `desk-20`). |
| Title block | on the floor in the south-east, west of the Review bay | The deck's name and number, who's looking, the build's revision and the credit to agent-office. |

The docs rack stands against the north wall west of the Main board, and the whiteboard on wheels in the east aisle.

### Cell addresses

A grid of columns every 4.5 m is stencilled round the deck's edge: letters A to H west to east, numbers 1 to 6 north to south. Every spot is in a cell, like `C4`, and the Attention board names each unit's cell. `cellOf(x, z)` in `src/shared/layout.ts` works one out.

### Pods and goals

A pod takes on the goal most of the units at its consoles work toward. The task queue seats a new unit with a goal in that goal's pod while it has a free console, then in a pod nobody has claimed yet, then wherever is free (`src/shared/pods.ts`). A unit whose goal changes keeps its console.

### The sightline rule

Nothing taller than 1.1 m stands between the mission table and the consoles, and the south wall is only a 0.4 m curb, so a person at the table (or the Overview) sees every unit. `tests/layout.test.ts` checks it, along with every seat id, that every seat can be walked to from the lift, and that the ready line has a walkable tick for each unit that needs someone.

## Walk and Overview

You arrive in **Walk**: first person, as before (third person is in Settings). Press **G** for the **Overview**: the whole deck from above at 35 degrees, with no perspective, the shot to show someone the deck in one look.

| Key | In the Overview |
| --- | --- |
| Q / E | Turn the deck a quarter (280 ms) |
| W A S D / arrows, or drag | Pan |
| Wheel | Zoom |
| G / Esc | Back to Walk |

A window opened from the Overview closes back to it with no extra click; one opened from Walk closes straight back to mouse-look. Under reduced motion, the turn and any flight to a unit are cuts. `flyTo(x, z)` on the Overview (`src/client/core/camera-overview.ts`) is where a click on an alert will land.

## Light and materials

The deck is lit like a control room at night: a cool fill from above and the slate below, one cool key from high in the north-west that throws the only shadows, a spot over each pod and one over the table. Every surface is matte (`src/client/world/office/materials.ts`), consoles and units flat-shaded, with soft contact shadows under what stands on the floor and lit hairlines along the edges that have to read in a dark frame: the slab, the walls' tops, the table's rim, the lift's portal. There are no outlines, no windows, no plants and no model files; everything is built in code. The colors are DESIGN.md's 3D row.
