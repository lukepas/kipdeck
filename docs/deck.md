# The deck

Back to the [README](../README.md).

Every project is a deck: one operations floor floating in a slate void, the same on every project. It is built so that a glance from anywhere on it (or from the Overview above it) tells you which units need a person, which are stuck and which are only at work. The plan is `src/shared/layout.ts`, which the server checks seats against and the 2D view reads too, so the 3D deck and the rest never drift apart.

## What's where

The deck is 36 by 26 m. North is the Main board's wall, and the Deck lift you arrive in is on it, east of the board.

| Place | Where | What it's for |
| --- | --- | --- |
| Mission table | the middle | The floor's mission on its top: the statement in the middle, a wedge per milestone round it (filled once done, ruled brighter while it's the one you're on) and a tick on the rim for each. Every console faces it. |
| Pods A to D | four arcs of four consoles, 7.5 m out: A north-west, B north-east, C south-east, D south-west | Where units sit, one per console (`desk-1` to `desk-16`, four to a pod). Each pod's floor plate, past its arc, names the goal most of its units work toward. |
| Ready line | a painted orange double stripe in front of each pod, 1.4 m out from the table, with numbered ticks | Where units that need you stand, tick 1 for whoever has waited longest (see [Units](#units)). |
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

## Units

A unit is one agent at its console: a faceless figure about 1.3 m tall on a hover base, with a flat head plate, a dark visor strip that flickers as its terminal prints, and a band round its chest. Nothing about it is decoration: its state shows four ways at once, all read from the building's one ranking (`src/shared/attention.ts`), so it agrees with the top bar, the alert strip, the Attention board and Mission control.

| State | Band | Ring on the floor | Glyph over it | Where it is |
| --- | --- | --- | --- | --- |
| Needs you | Signal orange | orange, a pulse spreading from it every 1.2 s | solid diamond | on its pod's ready line, facing the table, with a faint orange shaft over it |
| Stuck | red, blinking at 0.5 Hz | red, with a hatched band inside it | hollow triangle with a bar | at its console, darker and slumped forward |
| To review | amber | amber outline | hollow circle with a dot | at its console, turned toward the Review bay |
| Working | steel, breathing | faint steel | none | at its console |
| Parked | dark | none | none | at its console or on the Standby bench; dimmer still when its process is asleep |
| Merged | violet, for 6 s once its pull request merges | violet | check in a square | at its console |

Over each unit is a callout with its **call sign**, the seat it holds: `A-03` is the third console of pod A, `O-` the overflow bay, `S-` the Standby bench, `L-` a board agent's lectern and `R-` a chair in the Review bay (`src/shared/callsign.ts`, which the Units list and the Attention board use too). From across the deck the callout is one line, the call sign and the unit's name; near (or from twice as far for one that needs you or is stuck) it adds its task and how long it has been in its state. The glyph stays the same size on screen however far off it is, in Walk and in the Overview alike. The provider's letter is on the visor (C Claude Code, X Codex, P Pi, CU Cursor) and a muted stripe in the provider's tint runs down its back.

The ready line keeps its order: a unit on it keeps its tick when the ranking moves, a new one takes the lowest free tick on its pod, a fifth one on a pod starts a second row, and a unit that has been answered holds its tick for 8 s before it glides back, so a state that flips back and forth doesn't send it to and fro (its ring changes color at once). Four lights hang over the four units most in need on the deck, orange or red: never one light per unit. `src/client/features/readyline/` does both, and `tests/units.test.ts` checks the ticks and the call signs.

A new unit builds up from its hover base in half a second, and one stood down goes dark, lifts off its pad and folds away into a line of light. Units glide, leaning a couple of degrees into the move; nothing hops, walks or bobs. Under reduced motion, glides and the build-up are cuts, the pulse is a still ring and the stuck blink is a steady band.

The people on the deck are **operators**: the same family at 1.75 m, with a narrow head plate and a visor slit, a light steel shell (so a person never reads as a unit) and a shoulder yoke in their own color, the one place it shows. While they talk the yoke's edge brightens and a mic tick lights beside their mono name plate. Settings > Your operator picks the shell's tone, the head plate and its tone, and the yoke.

## Walk and Overview

You arrive in **Walk**: first person, as before (third person is in Settings). Press **G** for the **Overview**: the whole deck from above at 35 degrees, with no perspective, the shot to show someone the deck in one look.

| Key | In the Overview |
| --- | --- |
| Q / E | Turn the deck a quarter (280 ms) |
| W A S D / arrows, or drag | Pan |
| Wheel | Zoom |
| G / Esc | Back to Walk |

A window opened from the Overview closes back to it with no extra click; one opened from Walk closes straight back to mouse-look. Going to a unit (N, a click on the alert strip, a search result) flies the view there in a 700 ms arc in Walk (`src/client/core/flight.ts`), or pans and zooms the Overview onto it in 300 ms (`flyTo` in `src/client/core/camera-overview.ts`). Under reduced motion, the turn and every flight are cuts. In demo mode (`?demo=1`) the Overview turns slowly round the table until you take over; see [docs/design.md](design.md#demo-mode).

## The merge beat

A merge is the one moment the deck celebrates, and it does it with light, not confetti. When a person merges a unit's pull request, a violet pulse runs from the unit's console to the mission table and its rim lights. When the bounty for it is released on devnet, the pulse runs on across the floor to the Proof corner and up the attestation rail, and parks as the rail's new lit segment; the vault's lid lifts with a violet glow, the top bar's violet counter rolls, and a proof toast shows the devnet transaction in mono with a settled tick and an explorer link. An attestation landing on Base Sepolia plays the merged cue (when sound is on) and a toast of its own, and a unit's first ERC-8004 record makes the plinth glow as its step lights. A unit deployed to a console gets a shorter beat of its own: a steel trace from the table out to it. The camera never moves for a beat, and under reduced motion there is no traveling light: the rail and the lid change at once and the toast says the rest (`src/client/features/beats/`).

## Light and materials

The deck is lit like a control room at night: a cool fill from above and the slate below, one cool key from high in the north-west that throws the only shadows, a spot over each pod and one over the table. Every surface is matte (`src/client/world/office/materials.ts`), consoles and units flat-shaded, with soft contact shadows under what stands on the floor and lit hairlines along the edges that have to read in a dark frame: the slab, the walls' tops, the table's rim, the lift's portal. There are no outlines, no windows, no plants and no model files; everything is built in code. The colors are DESIGN.md's 3D row.
