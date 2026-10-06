# The review round: before and after

Back to the [README](../README.md) and the [design system](../DESIGN.md).

The latest round is first, [the Relay Beacon](#the-relay-beacon); the earlier rounds follow it in order.

## The Relay Beacon

An original landmark high off the starboard bow, over the arc's starboard wing from the chair: a lattice tower with a warm lamp at the heart of three turning rings, the rings lit by an emissive rim and tracers, a node-star on them for each unit at work in the fleet, the lamp flaring on a merge and a ledger ring lighting a segment per bounty released ([docs/design.md](../docs/design.md#the-relay-beacon), with the Stellar brand rules it follows). It is seen from the captain's chair and the forward starboard glass only. Shots in `shots/stellar/final/` (`node design/shoot-relay.mjs stellar/final`, GPU, 1440x900): `<light>-<quality>-conn.png` from the chair and `-conn-crop.png` the beacon from it at 3x (its lamp and hub in clear glass, the canopy's ribs passing the rings' rims), `-starboard` the chair turned toward it, `-deck-fwd` from the forward starboard glass, `-overview` (it is on the bridge layer, so not there), Night and Day at High and Low from the chair, and `night-high-clip.mp4`, 12 s from the chair turned to it and zoomed to 30 degrees (`SHOOT_CLIP=1`), of a deploy, a merge, a payout and the jump. Frame time (`node design/perf-probe.mjs metal`; `frames-before.jsonl` from the round before it, `frames-after.jsonl` and `frames-after-relay-off.jsonl` back to back on this build): from the conn 381 draws with it against 379 without (budget 400; the one call and 24 triangles over the earlier 378 show on the world-off line too, where it is never drawn, so they are another part's), the forced render 1.9 to 2.1 ms with it and 1.9 to 2.0 ms without, inside the run-to-run spread and well under 0.4 ms; from a side port 137 draws either way (looking away, none of its draws are made); rAF holds 16.7 ms. `node design/flicker-check.mjs metal` passes, and so does `FLICKER_RELAY=1`, which faces it and plays its merge flare at the bloom's peak (`flicker.txt`).

## The interior: the hype round

The captain said the room looked poor: no clarity, no readability, no hype, and he could not tell what had changed. Every shot here is on the GPU (ANGLE Metal, M3 Pro) at 1440x900, Quality forced to High unless it says Medium, sat in the captain's chair, captured with a seeded demo crew (desk-2's unit asking, two to review, the rest at work, a course set). The before set is the build of 65a6819 from a `git archive` (`shots/interior-final/baseline-commit.txt`).

### What changed (check it in under a minute)

1. **The sky is deep, not a white haze.** Sit down by Night: the top of the frame is a saturated magenta, teal and indigo galaxy with crisp stars, and nothing glows over the boards (`before-after-night-high-sit.png`).
2. **The Attention board fills its glass.** Three cards or fewer go full width; the one that needs you is a big lit hero card with an **N** key on it; a spare row says how many are on task; with nobody waiting it says **ALL CLEAR**.
3. **Every board reads whole from the chair.** With the Units rail open the view is centred on the canvas right of it, so Issues is no longer cut off.
4. **The countdown is the hype beat.** A milestone done shows **JUMP IN** and a huge digit with a ring wiping round it and a punch each second, never cut (`before-after-night-high-calm-sit-jump-countdown.png`).
5. **The room moves at rest.** Every 7 s a wave of light runs down the canopy's ribs, a glint turns round the halo, and at High lit dust streams over the glass (`reel-15s.mp4`).
6. **Stand up behind the chair** and you see the pit: the back is shoulder high with a headrest and a cyan rim (`before-after-night-high-sit-stand.png`).
7. **Press G**: the Overview is a dark slate plan with the arc facing you and the deck filling the frame (`before-after-night-high-sit-overview.png`).
8. **Less clutter**: the holo's caption is a third smaller, the orange beam is a faint thread, a free seat's plus shows only up close, and the chair's hint shrinks to "E Get up" after 3 s.

### Before and after

In `shots/interior-final/`: side by side, `before-after-<shot>.png` (Night High seated, Day High seated, Night Medium seated, the Overview, standing behind the chair, from the table, the countdown); the stills alone in `before/` and `after/`; `reel-15s.mp4` (6 s of the idle bridge, then a merge, the countdown and the jump, Night, High, from the chair) and its contact sheet `reel-sheet.png`. Taken with `SHOOT_POSE=sit SHOOT_MISSION=1 SHOOT_QUALITY=<high|medium> SHOOT_LIGHT=<night|day> SHOOT_OVERVIEW=1 node design/shoot-interior.mjs interior-final/<side>` (`SHOOT_CREW=calm SHOOT_MOTION=jump` for the countdown) and `SHOOT_POSE=sit SHOOT_QUALITY=high SHOOT_OUT=interior-final/after node design/shoot-life.mjs idle,seatmerge` for the reel.

### Frame time

`node design/perf-probe.mjs metal` from the chair (`PROBE_CONN='[[0,2.98,11],[0,3.5,-6.5]]'`), before and after, two runs each at High and one at Medium, Low and Auto (`frames-before.jsonl`, `frames-after.jsonl`).

| | Before | After |
| --- | --- | --- |
| High, conn: draw calls (budget 400) | 364 | 364 |
| High, conn: forced render p50 / p95 | 1.8 to 2.0 / 2.3 to 2.4 ms | 1.9 to 2.1 / 2.2 to 2.5 ms |
| High, jump with the tunnel open | 396 calls, 1.9 to 2.0 ms | 396 calls, 2.0 to 2.1 ms |
| High, conn, CPU 4x | 7.2 to 10.9 ms | 7.5 to 7.6 ms |
| Medium, conn | 303 calls, 1.4 to 1.6 ms | 302 calls, 1.6 to 1.8 ms |
| Low, conn | 254 calls, 1.4 to 1.8 ms | 252 calls, 1.5 to 1.7 ms |
| Motion layer (Ship motion on against off), High | 0.1 ms | 0 to 0.1 ms (budget 0.6) |
| Auto on the M3 Pro | | picked High, stayed at High |
| rAF p95 | 16.7 ms | 16.7 ms (60 fps) |

The pulse is two draws animated on the GPU from one clock (no per-frame CPU work but a few uniforms); the sky's cap is a few instructions in a shader that was already drawn. The Low motion line read 0.3 ms (p95 0.2) in one run, against 0.1 before: the pulse does nothing at Low (it returns at once), so that is the 0.1 ms clock's noise.

### Checks

- `npm run typecheck` and `npm run build` clean. `npm test`: 1024 of 1025; the one failure is `mission-e2e`'s debrief test, which waits 60 s for a 3D office under SwiftShader that takes about 63 s, and fails the same way on the before build (run here on its `git archive`).
- `node design/flicker-check.mjs` passes by Night and by Day, at High, by default and through a jump (`FLICKER_JUMP=1`).
- New tests: `tests/seatframe.test.ts` (every board whole right of the rail from the seat), `tests/interior-hype.test.ts` (the sky's cap under the glow and the tone mapping, the rib wave, when the pulse plays, the tiers, the plus marks), the wide board and ALL CLEAR in `tests/boards-screen.test.ts`, the countdown's copy, beat and fit in `tests/motion-layer.test.ts`, the Overview's framing in `tests/cinema.test.ts`.

### Left for later

- Day is still blue-lit by the planet and close to the before set apart from the board and the sky; a warmer sun rim and a cooler key were not tuned this round.
- Armrest console screens and a warm amber counter-colour for the captain's controls (the critics' identity notes) were not built.
- The mission bar in the bottom HUD still cuts the goal and the course.
- The working pip over a unit near the camera still reads as a floating cyan disc from close by.

Three critics (visual, originality and a hackathon judge) reviewed the redesign from the shots in `shots/review/`. This round fixed every item they marked must and most of the should and nice ones. The after shots are in `shots/final/`; `shoot.mjs final` and `node --import tsx shoot-pom.ts final` take them again from a built office.

## Why it changed

The redesign had a new skin on upstream's skeleton. Under the slate and orange, the floor plan, the HUD wireframe, the menu and the README were agent-office's, and someone who laid an upstream screenshot over ours saw the same room. Worse for a judge, the product contradicted itself: the 3D view called a crashed unit stuck while the 2D view called it working, the office paid in SOL while the ledger paid in USDC, labels piled on top of each other in the overview, and the biggest text in the room was a `gh` error.

So this round did two things. It made the product tell one truth everywhere: one ranking, one row text, one clock and one way of writing money, each in a shared module with tests. And it rebuilt the frame instead of reskinning it: a new deck plan, a new HUD layout, a new menu, the product's own words, and its own palette.

## Before and after

### The deck plan

The 36 by 26 m room with the lift mid-north, three boards on the north wall and a glass room in the south-east is now a 32 m square. The work boards and the Attention board stand on a curved situation wall round the north of the mission table, the lift is in the middle of the south curb, and the Review bay is in the north-west corner. The 2D plan and the sign-in backdrop draw the same constants.

| Before | After |
| --- | --- |
| ![](shots/review/deck-high.png) | ![](shots/final/deck-high.png) |
| ![](shots/review/deck-overview.png) | ![](shots/final/deck-overview.png) |
| ![](shots/review/login.png) | ![](shots/final/login.png) |

### Arrival

You used to arrive facing the whiteboard and an empty corner. Now you step out of the lift looking across the mission table at the Attention board, with pods C and D either side of you and the units that need you on the ready line ahead.

| Before | After |
| --- | --- |
| ![](shots/review/office.png) | ![](shots/final/office.png) |

### The HUD frame

The Units list is a full-height rail down the left, grouped by state, with a 2px rule for the state instead of a wide badge. It folds to call signs, and folds by itself for a merge beat. The top bar is the only surface that counts. The floating needs-you banner is gone: a toast in the single stack names the unit, then folds into the counter, which pulses. The mission strip, the key hints and the chat chip live in a bottom bar, and *Click to look around* no longer sits in the middle of the deck.

| Before | After |
| --- | --- |
| ![](shots/review/office-workers.png) | ![](shots/final/toasts.png) |
| ![](shots/review/toasts.png) | ![](shots/final/rail-folded.png) |

### Labels that never collide

Callouts are placed in ranking order. A callout in the way lifts a little, then shrinks to its call sign. A working unit's callout hides when there is no room, and a callout for a unit that needs someone always shows. The state glyph no longer floats over a neighbour's name.

| Before | After |
| --- | --- |
| ![](shots/review/demo.png) | ![](shots/final/demo.png) |
| ![](shots/review/units-near.png) | ![](shots/final/units-near.png) |

### One truth: counts, rows and money

Walking onto a deck used to wake every exited process, so a crash vanished from every view but the one that saw it. A crashed unit now stays stuck until a person resumes it, and the 3D top bar, the 2D view and Mission control count the same fixture the same way (`tests/one-truth.test.ts`). Each row has one title with its [tag] as a chip, one status phrase with no time in it, and one relative time. Bounties are devnet USDC everywhere, written one way.

| Before | After |
| --- | --- |
| ![](shots/review/lite.png) | ![](shots/final/lite.png) |
| ![](shots/review/mission-attention.png) | ![](shots/final/mission.png) |
| ![](shots/review/mission-review.png) | ![](shots/final/mission-review.png) |

### Goals and the mission strip

When there is no mission, the strip is a call to action: a target icon and *Set the mission*. The Goals tab explains why a mission matters, offers a primary *Write the mission* button and an example to use, and the window fits its content.

| Before | After |
| --- | --- |
| ![](shots/review/mission-goals.png) | ![](shots/final/mission-goals-empty.png) |

### Phones

A phone opens the 2D view. A phone that asks for 3D gets a single surface: glyph-and-number counters in fixed widths, the Units rail as a bottom sheet, and no keyboard hints.

| Before | After |
| --- | --- |
| ![](shots/review/office-phone.png) | ![](shots/final/office-phone-sheet.png) |
| ![](shots/review/lite-phone.png) | ![](shots/final/phone-redirect.png) |

### The menu, decks and settings

The menu is grouped by the product's jobs: Command, Work, Proof and Deck, with Comms folded at the bottom and the HUD layers shown as chips. The UI says deck everywhere. Each Deck lift row shows its path shortened to the repo and its folder, its units as the top bar's chips, and a delete action behind a kebab menu and a confirm. A selected segment is filled, not just outlined.

| Before | After |
| --- | --- |
| ![](shots/review/menu.png) | ![](shots/final/menu.png) |
| ![](shots/review/floors.png) | ![](shots/final/floors.png) |
| ![](shots/review/settings.png) | ![](shots/final/settings.png) |

### Honest wall boards

A board that can't reach GitHub shows its own name, a link glyph and *Connect GitHub to see it here*; the command to run stays in the board's window. With gh signed in (seeded in the shots), the boards show the work.

| Before | After |
| --- | --- |
| ![](shots/review/beat-landed.png) | ![](shots/final/boards-offline.png) |

### The unit console

The terminal has a column for the unit beside it: call sign, state, harness, branch, PR and the bounty it would earn. It has padding, the quick keys form one control in the reply bar, and *Pin a link* replaces the dashed *+ Web page* button.

| Before | After |
| --- | --- |
| ![](shots/review/terminal.png) | ![](shots/final/terminal.png) |

### The Proof ledger

The four totals share one uppercase label style, and the header names the last merge and the last attestation separately. Thin rates say *needs 5 outcomes*. Self-merged rows are dimmed and explained. Live units carry call signs, and the deck render is the new plan. The office's `/pom/` while the showcase is off is a branded page that says how to turn it on.

| Before | After |
| --- | --- |
| ![](shots/review/pom-dark-desktop-top.png) | ![](shots/final/pom-dark-desktop-top.png) |
| ![](shots/review/pom.png) | ![](shots/final/pom.png) |

## Also in this round

- The product calls itself UGC Army wherever agents, tools and commits see it: prompts, the MCP serverInfo, meeting commits, generated config and the CLI help (`ugc-army` is a bin alias). Server strings are plain ASCII with no emoji, units stand down rather than go home, and `tests/copy.test.ts` keeps it that way.
- The README is written in the fork's own words, with one upstream credit block. The credit everywhere names AgentSystemLabs and webdevcody. LICENSE adds a line for the fork, and NOTICE lists what was replaced.
- One data palette (`src/shared/datacolors.ts`) replaces upstream's pastels for yokes, workers, signs and pins. Saved colours are remapped by their index.
- Each unit wears the Formation mark on its chest plate.

## Left for later

- The installers and deploy scripts still fetch upstream releases, until the fork publishes its own.
- The `/pom/` ledger shows who merged as a keyed pseudonym, not a GitHub login, because the chain does not hold accounts.
- The ledger shots still use fixture data from `acme/app`. Before submission, take them from real devnet data on a public repository.

## The bridge: shell

The captain asked for the deck as a starship's bridge, with windows to see space through. This stage builds the shell round the same plan: viewports in the hull, a canopy, the conn where you arrive, the holo course plot over the table, bezels and an overhead strip on the forward displays, station fins and traces, deck inlays, and the ship outside. Nothing in the plan moved but the new conn, and units sit a little bigger (0.95 of full size instead of 0.82). Space through the glass and the light rig are the next stages, so the viewports still show the slate void here.

`shoot.mjs bridge-shell/after` takes the stills again from a built office (the `bridge-*` vantages are new). The clip `shots/bridge-shell/after/bridge-walk.mp4` is a camera move from the conn toward the west ports, rendered on the GPU.

| Before | After |
| --- | --- |
| ![](shots/bridge-shell/before/office.png) | ![](shots/bridge-shell/after/office.png) |
| ![](shots/bridge-shell/before/deck-overview.png) | ![](shots/bridge-shell/after/deck-overview.png) |
| ![](shots/bridge-shell/before/deck-table.png) | ![](shots/bridge-shell/after/bridge-holo.png) |
| ![](shots/bridge-shell/before/units-a.png) | ![](shots/bridge-shell/after/units-a.png) |

| The canopy | Aft, the nacelles | The captain's panel |
| --- | --- | --- |
| ![](shots/bridge-shell/after/bridge-up.png) | ![](shots/bridge-shell/after/bridge-aft.png) | ![](shots/bridge-shell/after/bridge-captain.png) |

Frame time at 1440x900 with nine seeded units, before and after: on the GPU (Apple M3 Pro through ANGLE Metal) the frame stays on vsync at 16.7 ms and a forced render takes 6.6 ms against 7.0 ms before; draw calls went from 1086 to 948, because the walls round the viewports are now drawn as one mesh per paint. On SwiftShader, which the stills use, a frame takes about 185 ms against 167 ms before, mostly from the canopy's glass over the whole frame.

## The bridge: space

The viewports now look out on space. A sky is baked once at load into a cube: a deep blue-black, the galactic band crossing the forward viewport on a slant and climbing into the canopy with dust lanes along its middle, and a teal and indigo nebula just right of the bow. Stars are drawn over it per pixel, so they stay a pixel or two wide in Walk and in the Overview. Three layers of stars stream aft past the glass as the ship makes way north, the near ones fast enough to read as parallax in the side ports. Every six to ten minutes something goes by: a planet or moon across a side port, an asteroid field tumbling past, or a comet high across the forward glass. A merge surges the ship for 1.4 s; a milestone done jumps it to a new region of space behind a 120 ms flash on the glass. All of it keeps to neutrals, blues, teals and ship-cyan (a test checks every colour against the states' hues), stays outside the glass, and never moves the camera.

Speed is the one tie to the deck: 0.4x cruise with no merges in the last hour, a quarter more for each, at most 1.6x, and 0.15x holding station when no unit is deployed. The nacelles' drive glow follows it. Settings has a new Bridge pane: Ship motion at Full, Calm (half speed, no flybys) or Off, which stills the whole deck as the system's reduce-motion setting does, CSS included.

`shoot.mjs bridge-space/after` takes the stills again from a built office (the `space-*` shots and `settings-bridge` are new; the flybys and flourishes are driven through `window.__office.space`). The clip `shots/bridge-space/after/space-motion.mp4` is rendered on the GPU: cruise from the conn, a surge, a jump, an asteroid field, then a planet past the west ports at six times speed.

| Before | After |
| --- | --- |
| ![](shots/bridge-space/before/office.png) | ![](shots/bridge-space/after/office.png) |
| ![](shots/bridge-space/before/bridge-conn.png) | ![](shots/bridge-space/after/bridge-conn.png) |
| ![](shots/bridge-space/before/bridge-up.png) | ![](shots/bridge-space/after/bridge-up.png) |
| ![](shots/bridge-space/before/deck-overview.png) | ![](shots/bridge-space/after/deck-overview.png) |

| A planet past the ports | An asteroid field | A comet over the canopy |
| --- | --- | --- |
| ![](shots/bridge-space/after/space-planet.png) | ![](shots/bridge-space/after/space-asteroids.png) | ![](shots/bridge-space/after/space-comet.png) |

| The surge | The jump, stretching | The jump's flash | New space |
| --- | --- | --- | --- |
| ![](shots/bridge-space/after/space-surge-2.png) | ![](shots/bridge-space/after/space-jump-1.png) | ![](shots/bridge-space/after/space-jump-2.png) | ![](shots/bridge-space/after/space-jump-4.png) |

Frame time at 1440x900 with nine seeded units, measured by hiding space and showing it again in the same session: on the GPU (Apple M3 Pro through ANGLE Metal) the frame stays on vsync at 16.7 ms, p95 16.8 ms, and a forced render takes 6.3 to 8.3 ms either way (the run-to-run spread is wider than space's share). Space adds four draw calls (the sky and three star layers, 8,900 points) and one more while something passes; the planet's surface is baked into a small map when it comes up, so it draws as one texture read. On SwiftShader, which the stills use, a forced render takes about 180 to 210 ms against 150 to 160 ms without space, most of it the sky's per-pixel stars over the whole frame.

## The bridge: light

The captain watches at night and found the deck too dark. This stage gives the bridge a light rig of its own and two modes for it, set in Settings > Bridge > Bridge lights: **Night** (low light, comfortable in a dark room yet clearly readable), **Day** (high light, a bright ship interior) and **Auto**, which follows the system's dark or light setting. A **Brightness** step turns every light up or down by 12%, two steps either way. The same setting paints the HUD (the dark set by night, the print set by day), the 2D view, whose contrast button now flips it, and the sign-in pages.

The rig is one table (`LIGHT_MODES`, `src/client/features/lights/modes.ts`) that the scene is built from and the mode retunes: a key through the forward viewport from high over the bow (it was over the north-west corner), a fill from aft, two low rims from east and west that cut units and consoles out of the floor, the pods' and the table's spots, and a new ship-cyan uplight in the holo table. Night keeps the old exposure, so what gives its own light (boards, callouts, a needs-you beam) holds its level, and the lights do the lifting. The night slate is a step lighter (floor `#222C38`, units `#333D49`), and a restrained glow (bloom at threshold 0.86, smoothed by FXAA instead of multisampling, which made one frame in twenty miss vsync on Apple's GPUs) lifts only the brightest things. Day repaints the neutrals on the same materials: a light hull and floor, consoles darker still as graphite blocks, units graphite, lettering on walls and floor dark, and no glow, since the lit floor would pass any threshold.

Attention never depends on the mode. Every unit's marks now sit on a 6 cm disc of instrument black, and every callout on a denser chip (92%, up from 86%: at 86% stuck red was 4.28:1 over Day's lightest wall). `tests/lights.test.ts` runs every state's hue through the WCAG formula on both carriers in both modes, and the print set on its panels: all at 4.5:1 or better.

`SHOOT_LIGHT=night` or `SHOOT_LIGHT=day` before `shoot.mjs` takes the shots under those lights; `bridge-light/before` is the stage before this one. The clip `shots/bridge-light/night-day.mp4` is rendered on the GPU from the conn: Night, Day, Day at -1 and +1, Night at +1 and -1, and back.

| Before | Night | Day |
| --- | --- | --- |
| ![](shots/bridge-light/before/office.png) | ![](shots/bridge-light/night/office.png) | ![](shots/bridge-light/day/office.png) |
| ![](shots/bridge-light/before/deck-high.png) | ![](shots/bridge-light/night/deck-high.png) | ![](shots/bridge-light/day/deck-high.png) |
| ![](shots/bridge-light/before/units-c.png) | ![](shots/bridge-light/night/units-c.png) | ![](shots/bridge-light/day/units-c.png) |
| ![](shots/bridge-light/before/bridge-station.png) | ![](shots/bridge-light/night/bridge-station.png) | ![](shots/bridge-light/day/bridge-station.png) |
| ![](shots/bridge-light/before/deck-overview.png) | ![](shots/bridge-light/night/deck-overview.png) | ![](shots/bridge-light/day/deck-overview.png) |
| ![](shots/bridge-light/before/settings-bridge.png) | ![](shots/bridge-light/night/settings-bridge.png) | ![](shots/bridge-light/day/settings-bridge.png) |
| ![](shots/bridge-light/before/lite.png) | ![](shots/bridge-light/night/lite.png) | ![](shots/bridge-light/day/lite.png) |
| ![](shots/bridge-light/before/login.png) | ![](shots/bridge-light/night/login.png) | ![](shots/bridge-light/day/login.png) |

Mean lightness (CIE L*) of the 3D view past the rail and the top bar, space through the glass included:

| Shot | Before | Night | Day |
| --- | --- | --- | --- |
| office (arrival) | 13.9 | 23.6 | 43.4 |
| deck-high | 10.7 | 21.5 | 51.6 |
| bridge-conn | 15.5 | 24.0 | 41.5 |
| units-c | 16.7 | 29.2 | 55.4 |
| bridge-station | 11.0 | 18.4 | 32.7 |
| deck-overview | 11.0 | 19.2 | 51.8 |

Pure black (L* under 5) inside the frame fell from 20 to 44% of it before to 3 to 25% by night; what is left is space through the glass and the boards' faces.

Frame time at 1440x900 with nine seeded units on the GPU (Apple M3 Pro through ANGLE Metal), the same probe on a build of the stage before and on this one, a forced render timed over 30 frames with `gl.finish`: before, 2.2 ms (2.4 ms at device pixel ratio 2) with rAF at 16.7 ms, p95 16.8 ms. Now by night, with the glow, 2.4 to 2.7 ms, p95 16.8 ms; by day 2.2 ms. The unit inlays add one draw call per unit; the rim lights and the holo uplight are three more lights, set up at load and never added or removed.

## The bridge: life

The captain found the deck a bit dead: nothing moved unless a state changed, and working units were grey. This stage gives a healthy, busy bridge visible life and keeps it out of the way of what needs you (`src/client/features/life/`, its numbers in `logic.ts`, tested in `tests/life.test.ts`).

- **Station screens.** The face of every console's pedestal, toward the table, is a screen. On its left the unit's state glyph in its own hue and shape (a dash at work); on its right a working station runs ship-cyan bars that scroll and grow with its terminal's output, a scan line passes every 6 s, and three blinkers twinkle on slow periods of their own (4.3, 6.1, 8.9 s). Stuck shows still red hatching, to review a steady amber line, standing by a dim dash. All sixteen are one instanced mesh with one shader.
- **Busy units.** A working unit's hands go to its console and work it while its terminal prints, a slow sway of the shoulders now and then, and its band and the glow under it lean toward ship-cyan the busier it is. The console's hood trace brightens with it.
- **Data pulses.** A busy station now and then sends a point of ship-cyan light in a low arc to the holo table, every 1.8 to 6 s by how busy it is. Dashes run along the holo's course to the ship.
- **The heading.** A band of light lettering turns round the holo plot: "CAPTAIN, WE ARE 40% OF THE WAY TO AUTH REWRITE" (issues closed of those linked to the active milestone; with none linked it only says where the ship is making for), the waypoint, the issues out, the units on it and the course. A ring on the tabletop shows the same fraction.
- **The ticker.** Over the overhead strip: the ship's clock ticking by the second, how long the deck has been under way, and the deck's log (the timeline's latest events) running right to left.
- **Giving way.** For 3 s after a unit starts needing you or gets stuck, everything ambient dims to 40%; a pod with such a unit stays hushed (bars at 30%, no pulses, no blinkers) while it lasts; and the bridge runs a quarter quieter while anyone waits on you. Ship motion at Calm halves it, Off or reduced motion stills it (the screens still read).

`shoot.mjs` now sets a real course with issues on the active waypoint (`SHOOT_MISSION=0` skips it), so the holo, the strip and the ticker read it, and has two new shots, `life-heading` and `life-ticker`. `bridge-life/before` is the stage before this one, `after` this one by night and `day` by day. The clip `shots/bridge-life/after/bridge-life.mp4` is recorded in real time on the GPU with twelve units whose terminals print a few lines a second, as real agents do: pod C's stations from the table (C-03 stuck, so its pod is hushed), pod B, the holo with its pulses and heading, and up to the ticker.

| Before | After |
| --- | --- |
| ![](shots/bridge-life/before/units-c.png) | ![](shots/bridge-life/after/units-c.png) |
| ![](shots/bridge-life/before/units-b.png) | ![](shots/bridge-life/after/units-b.png) |
| ![](shots/bridge-life/before/bridge-holo.png) | ![](shots/bridge-life/after/bridge-holo.png) |
| ![](shots/bridge-life/before/office.png) | ![](shots/bridge-life/after/office.png) |

| The heading band | The clock and the log | By day |
| --- | --- | --- |
| ![](shots/bridge-life/after/life-heading.png) | ![](shots/bridge-life/after/life-ticker.png) | ![](shots/bridge-life/day/units-c.png) |

Frame time at 1440x900 by night on the GPU (Apple M3 Pro through ANGLE Metal), twelve busy units, from the conn, a forced render timed over 30 frames with `gl.finish`, in one session with the life's meshes shown, hidden and shown again: 2.92, 2.74 and 2.78 ms, rAF p50 and p95 16.7 ms throughout (on vsync). The life adds seven draw calls (the screens, the pulses, the heading band, its track and arc, the clock and the log) and two light ticks of work a frame; the screens animate in their shader, the ticker scrolls by texture offset, and the clock repaints a small canvas once a second.

## The bridge: final round

The review of the bridge (`shots/bridge-review/`) found the needs-you beacon a cheap opaque slab, the ship from outside a house with double-hung windows, the side ports near-black slits, working units still grey, callouts colliding, the merge with no moment on the deck, and a jump flash that whited out the canopy at night. This round fixes those and gives the bridge more life and light. Everything is still built in code: shaders, geometry and canvas textures, no images or models.

- **The needs-you beacon** is light now: an additive column that fades toward its edges and its top, with slow scanlines climbing it and a wave spreading across the floor from the unit. It stops at about one and a half units, so it no longer runs up through the Issues and Queue boards, and it drops to a third with the camera close.
- **Working units wear ship-cyan** on the band, the visor and a soft floor halo that breathes faster the busier they are; their hands stay at the console, their heads bob a little, and motes rise off their screens. Every unit's shell catches a cool rim light, so it holds its silhouette against the dark.
- **Callouts** draw over the boards rather than being cut by them, never grow past 7.5% of the view's height up close, slide back in when they would run off the side or under the Units rail, and keep a hairline to their unit when lifted. From the Overview, the tags of units that need you or are stuck are half again as big. The edge marks now point to stuck units too, in the order needs you, stuck, to review.
- **Windows.** Each side bay has a wide, low port at a seated eye's height with rounded ends and a slim strip over it, the forward band has rounded corners, and no mullions cross the glass. A bezel with a cyan line inside and a brighter one outside lines every port, and the glass thickens to a cold tint at a slant. The galaxy's band is tilted and brighter, so it crosses the side ports as well as the canopy. (The walls had been building a column of wall per opening, which filled a port with wall once a strip stood over it.)
- **The ship from outside**: plated walls and plate, a sloped skirt rising at the bow into a glacis, an armoured brow along the tops of the walls, rounded lit ports, hot cores in the plumes, and running lights. The red and green are drawn for the Overview's camera only, so a state's red never shows through a port.
- **The merge is the bridge's moment**: a ring of violet light sweeps out from the holo table, the Pull requests board flashes green, a ring rises off the unit's console and every lit line on the bridge swells, 1.2 s. With motion off it is a steady colour for the same moment.
- **The holo** has a volume: a small spiral galaxy turning over the course plot in a cone of scanlined light, with a glow where the ship is.
- **Space**: planets with drifting clouds, a lit limb and a ring round a gas giant; a comet you can see, lower and twice as bright, with a 20 degree tail; a meteor every 20 to 40 s. The jump widens the view 4 degrees, leans the room's light cool going in and warm coming out, and its flash is a glint added over the sky, a third by Night and half by Day. Stars are never drawn under two pixels, as soft dots, so they no longer crawl.
- **Light.** Night has a darker floor, a cyan cove where the walls meet the canopy, and the units' rim light. Day is a cool mid-grey ship with the exposure lifted, not a white room; the consoles' hoods stay instrument black, so the call signs on them read (they were about 1.9:1), and the print set's orange is darker for text.

### The lighting setting and the motion toggle

Settings > Bridge > **Bridge lights** sets Night (low light, for watching in a dark room), Day (high light) or Auto, which follows the system; **Brightness** steps every light 12% either way, two steps. Settings > Bridge > **Ship motion** is the in-app motion toggle: Full; Calm, which halves space and drops its streaks, flybys and meteors, and turns a waypoint into a crossfade; and Off, which stills the whole deck as the system's reduce-motion setting does. Under either, the beacon is a still column with one still ring, the merge is a colour flash, and the running lights hold steady. Nothing in space plays while the tab is hidden.

### Before and after

`SHOOT_LIGHT=night` and `SHOOT_LIGHT=day node design/shoot.mjs bridge-final/<mode> ...` took the stills from a built office; `bridge-window` and `bridge-window-e` are new vantages out of the side ports. `shoot.mjs bridge-final clip` made `shots/bridge-final/bridge.mp4`, 10 s on a clock of its own (one frame each thirtieth of a second, so software rendering gives smooth motion): a push in from the conn past the holo, a merge landing, meteors, a turn to the west ports and back to the bow for a jump. Stills of the merge and the jump from it are in `shots/bridge-final/sequence/`.

| Before | Night | Day |
| --- | --- | --- |
| ![](shots/bridge-review/night/units-a.png) | ![](shots/bridge-final/night/units-a.png) | ![](shots/bridge-final/day/units-a.png) |
| ![](shots/bridge-review/night/deck-overview.png) | ![](shots/bridge-final/night/deck-overview.png) | ![](shots/bridge-final/day/deck-overview.png) |
| ![](shots/bridge-review/night/bridge-port.png) | ![](shots/bridge-final/night/bridge-port.png) | ![](shots/bridge-final/day/bridge-port.png) |
| ![](shots/bridge-review/night/units-c.png) | ![](shots/bridge-final/night/units-c.png) | ![](shots/bridge-final/day/units-c.png) |
| ![](shots/bridge-review/night/bridge-conn.png) | ![](shots/bridge-final/night/bridge-conn.png) | ![](shots/bridge-final/day/bridge-conn.png) |
| ![](shots/bridge-review/night/bridge-holo.png) | ![](shots/bridge-final/night/bridge-holo.png) | ![](shots/bridge-final/day/bridge-holo.png) |
| ![](shots/bridge-review/night/space-planet.png) | ![](shots/bridge-final/night/space-planet.png) | ![](shots/bridge-final/day/space-planet.png) |
| ![](shots/bridge-review/night/space-comet.png) | ![](shots/bridge-final/night/space-comet.png) | ![](shots/bridge-final/day/space-comet.png) |

| Out of a side port | The merge's sweep | The jump's glint |
| --- | --- | --- |
| ![](shots/bridge-final/night/bridge-window.png) | ![](shots/bridge-final/sequence/merge-02-500ms.png) | ![](shots/bridge-final/sequence/warp-04-967ms.png) |

### Left for later

- Frame time was not measured on a GPU in this round; the stills and the clip are software rendered. The renderer now draws at most 1.5 pixels per CSS pixel, which bounds the Retina case, but the draw calls (about a thousand) and the lights per fragment are as they were.
- The radial streak tunnel through the forward glass during a jump, warm task lights over occupied stations, and a bigger count band on the situation wall from the conn were not done.
- The Overview still frames the deck rather than the whole ship; zoom out (wheel) to see the nacelles.

## Black frames at the mission table

At Night, near the holo table, a whole frame sometimes went black for one frame. The holo's cone of light raised `1.0 - vY` to a power, and `vY` (the cylinder's `uv.y`) comes out a hair over 1.0 along the top rim when the rim crosses the screen at a slant. `pow()` of a negative number is NaN on Apple GPUs (ANGLE Metal), and the bloom blurs that one NaN pixel through its mip chain over the whole screen, which the output pass shows as black. Day has no bloom, so the pixel stayed invisible there; SwiftShader never produced the NaN, so the stills never showed it.

Every `pow()` in the office's shaders now keeps its base at zero or above (`max(..., 0.0)`), including the needs-you beacon, the viewport glass, the planet's rim and halo and the sky's stars, which had the same pattern. `tests/shader-pow.test.ts` fails on a new one that doesn't.

`node design/flicker-check.mjs [metal|swiftshader] [frames]` checks it for real: it starts the built office on a spare port (`FLICKER_PORT`, default 4697), sweeps the camera round, over and past the table in Night and Day, reads back every frame and the bloom's input, and fails on a black frame or a NaN pixel. On an M3 Pro with Metal, 900 frames per mode: before the fix 3 bad frames at Night (each with a NaN pixel, two 99% black and one fully black), after it none in 2000. It skips when there's no build or no browser.

## The bridge: world

The captain still found the bridge lacking life: it should feel like part of something big, moving toward a goal. This stage puts a world round the ship that moves with the work and only with the work, inspired by the feel of a fleet under way rather than by any film's ships or names. Everything is built in code (geometry, shaders, canvas lettering); nothing is downloaded and nothing makes a sound.

- **The destination ahead** (`src/client/features/destination/`). The mission is a world dead ahead in the canopy: a rocky world, a ringed giant or a ring station, the same one for the same mission. It starts as a bright point and grows only with real progress (waypoints passed, plus the open waypoint's issues closed of those linked) toward a third of the forward view, eased over 4 s, still otherwise. A mono band under it says "MAKING FOR AUTH REWRITE - WAYPOINT 2 OF 4 - 35%", and "BEHIND SCHEDULE: 4 DAYS" in plain words while the waypoint is overdue, when the world stops growing. Waypoints passed are markers astern. With every waypoint passed the ship drops into orbit over 30 s and holds there; that waits behind anyone who needs you, and is a crossfade and a card under reduced motion. It is drawn as part of the sky (its depth squeezed to the far end), so the room, the escorts and the fighters always pass in front of it, even in orbit.
- **The fleet in formation** (`src/client/features/fleet/`). Every other deck is an escort in a V off the side ports, one rank at a seated eye's height and the next high over the walls: a corvette, frigate or cruiser by its units, a port lit per unit at work, drives by the share at work, its repository's name on its flank. A sister's merge eases its ship a length ahead; its waypoint blinks its running lights twice and puts a hail line in the canopy's corner; a deck being cloned is built plate by plate in a slip and drops out of hyperspace into its slot. A deck with a unit that needs you carries the needs-you diamond over its bridge, and clicking the ship opens the Decks lift.
- **Squadron sorties** (`src/client/features/sorties/`). Each working unit has a fighter patrolling past its pod's side port (8 to 14 s a loop, by how busy its terminal is). An open pull request peels it to the picket ahead of the bow, left and right of the destination, so the review queue is visible from the conn; a merge sends it home over the canopy, trailing ship-cyan, to land in the hangar as the merge beat fires; a unit that needs you or is stuck cuts its engine and drifts dark just outside the glass.
- **Giving way, and Settings > Bridge > Life** (`src/client/features/giveway/`). One signal the three read: a new needs-you or stuck ducks life for 3 s, that pod's patrols slow to stillness while it lasts, the escorts hold still and their salutes and hails are dropped. Life is Full, Calm (no salutes, hails or patrols) or Silent running (no ambient life, the stars at a crawl, the ticker paused), with a switch for each part. Ship motion at Off and reduced motion still everything.

The words are in `src/shared/shiplog.ts` (`tests/copy.test.ts` keeps them free of exclamation marks, war words and anything but ASCII). The numbers are in each feature's `logic.ts`, tested in `tests/destination.test.ts`, `tests/fleet.test.ts`, `tests/sorties.test.ts` and `tests/giveway.test.ts`.

`node design/shoot.mjs life-world/after <shots>` takes the stills: `SHOOT_CREW=busy` deploys a healthy crew (nobody waiting), `SHOOT_GPU=1` renders on the GPU so the fighters fly at their real pace, and sister decks are seeded into the page as the boards' fixture is. `yield/` is the default crew, with units that need you, and `day/` the Day lights. The clip `shots/life-world/after/life-world.mp4` (16 s, one frame each thirtieth of a second) runs from the conn as a unit's pull request merges and its fighter runs home, to the west ports as a sister deck merges and hails, then outside the ship to the whole formation as a cloned deck drops into its slot.

| Before | After |
| --- | --- |
| ![](shots/life-world/before/bridge-conn.png) | ![](shots/life-world/after/bridge-conn.png) |
| ![](shots/life-world/before/bridge-window.png) | ![](shots/life-world/after/bridge-window.png) |
| ![](shots/life-world/before/deck-overview.png) | ![](shots/life-world/after/deck-overview.png) |

| The destination and the picket | The formation from outside | Escorts past a side port |
| --- | --- | --- |
| ![](shots/life-world/after/life-ahead.png) | ![](shots/life-world/after/life-high.png) | ![](shots/life-world/after/life-fleet-w.png) |

| A merge: the fighter runs home | A sister's hail and salute | In orbit, every waypoint passed |
| --- | --- | --- |
| ![](shots/life-world/after/life-merge-2.png) | ![](shots/life-world/after/life-salute-1.png) | ![](shots/life-world/after/life-orbit-3.png) |

| Units need you: fighters drift dark | Silent running | Settings > Bridge > Life | By day |
| --- | --- | --- | --- |
| ![](shots/life-world/yield/life-dark.png) | ![](shots/life-world/after/life-silent.png) | ![](shots/life-world/after/settings-life.png) | ![](shots/life-world/day/life-fleet-w.png) |

Frame time at 1440x900 by night on the GPU (Apple M3 Pro through ANGLE Metal), twelve units at work, six sister decks and two open pull requests, a forced render timed over 30 frames with `gl.finish` (`node design/perf-probe.mjs metal`). On the build before this stage: 3.1 ms from the conn (1045 draw calls) and 1.0 ms out of a side port (375). On this one, in one session with the world on, off (Settings > Bridge > Life) and on again: 3.0 to 3.3 ms against 2.9 to 3.2 ms from the conn (1057 draw calls against 1045), and 0.9 to 1.2 ms against 0.9 ms out of the port (386 against 375); rAF p50 16.7 ms and p95 16.8 ms throughout (on vsync). The world adds 12 draw calls and about 4,000 triangles; the fleet is three instanced meshes, the fighters one, their engines and trails one layer of points, and nothing is added or removed while it runs. Some twenty seconds into a session the forced render on this machine rises to 12 to 16 ms, with the world on or off alike and on the build before this stage too (13 ms), while rAF stays on vsync; the comparisons above are the samples before that. The probe holds space's clock so a flyby doesn't land in one sample and not another. `design/flicker-check.mjs metal` passes (no black frame or NaN pixel in 600 frames by Night and by Day).

### Left for later

- The droid companion, VESPER, celebration tiers and the debrief are later stages; this one is the world outside.
- The destination's band sits in the clear glass between the canopy's lower rings as seen from the conn; from elsewhere on the deck a rib can cross it.
- Clicking an escort opens the Decks lift; it doesn't yet pick that deck in it.

## The bridge: crew

The captain asked for more life and the feeling that this is something big. The world outside already moves with the work; this stage gives the bridge a crew with a record and a ship with a mind, and all of it speaks only of what really happened.

- **VESPER, the ship's mind** (`src/client/features/vesper/`, phrasebook `src/shared/shipvoice.ts`): a dry line now and then, as a caption under the view and at the head of the ticker. Seeded by the event, so every viewer reads the same line; one in 90 s at most; one plain sentence the moment a unit needs you, then silence.
- **Crew dossiers** (`src/client/features/crew/`, rules `src/shared/epithet.ts` and `src/shared/commendations.ts`): epithets earned from the record (the Mechanic, the Anchor, the Comeback, the Night Owl, the Quick Study, the Steady Hand, the Rookie), chevrons on the shoulder, the unit of the watch on the Proof corner's plinth, and a Crew tab in Mission control. Pull requests' timeline events now name the unit they came from, so a merge counts on its unit's record.
- **Bolt, the bridge droid** (`src/client/features/droid/`): carries a finished unit's work to the Review bay, makes a slow turn by the table for a merge, rounds the busiest pod, and holds still by a pod whose unit needs you. Off until the captain signs it off.

`node design/shoot-crew.mjs life-crew/after` takes the stills from a built office: a healthy crew of stand-in units, a few days of their record painted into the page's timeline (no GitHub here, as the boards' fixture), and live moments (a merge, a unit finishing, a unit that needs you) played in as the server sends them. `SHOOT_ROOT=<a build of the commit before> ... life-crew/before` takes the same views of the build before, `SHOOT_LIGHT=day` the Day set, and `SHOOT_GPU=1 ... crew-clip` the clip `shots/life-crew/after/crew-clip.mp4` (14 s, a frame each thirtieth of a second): Bolt carrying a finished unit's work round the table toward the Review bay, a camera riding behind it, as a merge lands with VESPER's line.

| Before | After |
| --- | --- |
| ![](shots/life-crew/before/vesper-merge.png) | ![](shots/life-crew/after/vesper-merge.png) |
| ![](shots/life-crew/before/crew-shoulder.png) | ![](shots/life-crew/after/crew-shoulder.png) |
| ![](shots/life-crew/before/crew-plinth.png) | ![](shots/life-crew/after/crew-plinth.png) |
| ![](shots/life-crew/before/crew-yield-1.png) | ![](shots/life-crew/after/crew-yield-1.png) |
| ![](shots/life-crew/before/mission-rows.png) | ![](shots/life-crew/after/mission-rows.png) |
| ![](shots/life-crew/before/console-record.png) | ![](shots/life-crew/after/console-record.png) |

| Bolt picks up the work | Carrying it round the table | Holding by a unit that needs you |
| --- | --- | --- |
| ![](shots/life-crew/after/droid-carry-1.png) | ![](shots/life-crew/after/clip-5.png) | ![](shots/life-crew/after/crew-yield-droid.png) |

| The Crew tab | Settings > Bridge > Life | The Overview: none of it | By day |
| --- | --- | --- | --- |
| ![](shots/life-crew/after/mission-crew.png) | ![](shots/life-crew/after/settings-life.png) | ![](shots/life-crew/after/crew-overview.png) | ![](shots/life-crew/day/crew-shoulder.png) |

Frame time at 1440x900 by night on the GPU (Apple M3 Pro through ANGLE Metal), with `node design/perf-probe.mjs metal` (twelve units at work, six sister decks, two open pull requests; `PROBE_SETTINGS` turns the droid on): from the conn 2.6 to 2.7 ms against 2.6 ms before, 1057 draw calls both, and out of a side port 0.9 to 1.0 ms against 0.9 to 1.1 ms, 386 both; rAF p50 16.7 ms and p95 16.7 to 16.8 ms throughout, on vsync. Neither vantage sees the crew's pieces, so `shoot-crew.mjs crew-perf` times the one place that sees all of them at once (the plinth with its hologram, cone and plaque, a unit's chevrons, Bolt parked in view): 421 draw calls a frame with the crew on against 412 off (nine more: Bolt's body, cap, lens, shadow and charger, the two layers of chevrons, the plinth's figure, cone and plaque, less what is out of view), rAF p50 16.7 ms either way. `design/flicker-check.mjs metal` passes (no black frame or NaN pixel in 600 frames by Night and by Day).

### Left for later

- Celebration tiers, the start-of-watch card and the debrief are later stages; `Parts.vesper.line()` is there for their subtitles.
- A unit's record is the deck log as far as the page has loaded it (the server keeps a capped log per deck), and reverts come only from the agents' reputation records, which count per agent identity, not per unit.
- Bolt waits for the captain's sign-off: it ships off.

## The bridge: moments

The captain still wanted more life, and the feeling of being part of something big that pushes the team on. This stage gives the bridge moments the crew earns and a way of saying how the deck is doing, in the spirit of a crew bringing a ship home rather than any film's ships, names or sounds. All of it answers real events (a merge, a recovery, a streak, a waypoint, the mission), none of it runs on a timer, and when a unit needs the captain it waits.

- **Earned celebrations, in tiers** (`src/client/features/moments/`, rules in `src/client/features/beats/tiers.ts`): a unit's first merge turns its pod to it with a nod; a unit back from stuck gets a white sweep across its pod and "BOLT (C-01) RECOVERED, 40M STUCK" on the band; three merges inside an hour with nothing stuck put hands up across the ship and run the surge harder; a waypoint brings the jump with the crew standing to face the bow, then the log card with the real numbers; the mission complete brings the arrival, the fleet's slow fly-by and a card naming every unit that merged. One at a time, a higher tier swallowing a lower one, held behind any call and only the card after ten minutes held.
- **Hyperspace** (`src/client/features/space/tunnel.ts`): 3, 2, 1 on the band and big across the forward glass, the escorts streaking away, a ship-cyan and white tunnel round the ship for 1.5 s, and the next waypoint's name across the glass as the ship comes out and the escorts drop back. It waits for the captain (JUMP READY - AWAITING CAPTAIN) and becomes the crossfade if a call comes in mid-jump.
- **Alert conditions** (`src/client/features/alert/`): the room steps darker, never orange or red, at amber (a unit waited past five minutes, or a reminder fired) and red (one stuck past ten, or three stuck), the pod lights over the units that wait kept up and the band saying why with the state's glyph; the lights come back up aft to bow when the last call clears.
- **Settings > Bridge > Moments**: Celebrations (Full, Cards only, Off) and Alert conditions (on or off, amber after 2 to 15 minutes, red after 5 to 30).

The words are in `src/shared/shiplog.ts` (`tests/copy.test.ts`), the numbers in `tests/motion.test.ts` (tiers, gestures, the jump, the countdown), `tests/alert.test.ts` (thresholds, the latch, the dimmer, the stand-down, the band's lines), `tests/lights.test.ts` (every state at 4.5:1 or more on its carrier on the dimmed rigs, Night and Day) and `tests/fleet.test.ts` (the escorts' jump and fly-by).

`node design/shoot-moments.mjs life-moments/after` takes the stills from a built office with the page's clock stepped a frame at a time, so each lands on the same instant every take: a healthy crew of stand-in units, six sister decks, a course of four waypoints; merges and a recovery played in as the server sends them, waypoints marked done for real, and a unit's wait aged in the page. `SHOOT_ROOT=<a build of the commit before> ... life-moments/before` takes the same moments on the build before, `SHOOT_LIGHT=day ... life-moments/day` the Day set, and `... moments-clip` the clip `shots/life-moments/after/moments-clip.mp4` (16 s, a frame each thirtieth of a second, from the conn): a unit's first merge (its pod nods), a streak (hands up, the harder surge), then a waypoint's countdown, the jump through the tunnel, the name across the glass and the log card.

| Before | After |
| --- | --- |
| ![](shots/life-moments/before/nod.png) | ![](shots/life-moments/after/nod.png) |
| ![](shots/life-moments/before/streak.png) | ![](shots/life-moments/after/streak.png) |
| ![](shots/life-moments/before/recovery.png) | ![](shots/life-moments/after/recovery.png) |
| ![](shots/life-moments/before/jump-countdown.png) | ![](shots/life-moments/after/jump-countdown.png) |
| ![](shots/life-moments/before/jump-tunnel.png) | ![](shots/life-moments/after/jump-tunnel.png) |
| ![](shots/life-moments/before/jump-banner.png) | ![](shots/life-moments/after/jump-banner.png) |
| ![](shots/life-moments/before/alert-amber.png) | ![](shots/life-moments/after/alert-amber.png) |
| ![](shots/life-moments/before/alert-red.png) | ![](shots/life-moments/after/alert-red.png) |
| ![](shots/life-moments/before/stand-down.png) | ![](shots/life-moments/after/stand-down.png) |
| ![](shots/life-moments/before/mission-card.png) | ![](shots/life-moments/after/mission-card.png) |

| Hands up, close | Standing to face the bow | The log card | The jump held for the captain |
| --- | --- | --- | --- |
| ![](shots/life-moments/after/streak-close.png) | ![](shots/life-moments/after/jump-stand.png) | ![](shots/life-moments/after/waypoint-card.png) | ![](shots/life-moments/after/jump-held.png) |

| Condition red on the band | Standing down | The fleet's fly-by, in orbit | Cards only |
| --- | --- | --- | --- |
| ![](shots/life-moments/after/alert-red-band.png) | ![](shots/life-moments/after/stand-down-band.png) | ![](shots/life-moments/after/mission-flyby.png) | ![](shots/life-moments/after/card-streak.png) |

| Settings > Bridge > Moments | Day: condition red | Day: the waypoint's name | Day: the recovery |
| --- | --- | --- | --- |
| ![](shots/life-moments/after/settings-moments.png) | ![](shots/life-moments/day/alert-red.png) | ![](shots/life-moments/day/jump-banner.png) | ![](shots/life-moments/day/recovery.png) |

Frame time at 1440x900 by night on the GPU (Apple M3 Pro through ANGLE Metal), `node design/perf-probe.mjs metal` (twelve units at work, six sister decks, two open pull requests), the build before and this one run back to back: from the conn 2.9 to 3.1 ms before against 2.7 to 3.0 ms after, 1057 draw calls both; out of a side port 0.9 to 1.0 ms both, 386 draw calls both; rAF p50 16.7 ms and p95 16.7 to 16.8 ms throughout, on vsync. Idle, the moments draw nothing (the band, the sweep, the tunnel and the name are hidden). Mid-jump with the tunnel open, `shoot-moments.mjs perf-jump` times a forced render at 3.6 ms against 3.8 ms idle from the conn (986 draw calls against 966: the 4-degree wider view takes in more of the deck; the tunnel and the name are one draw each). `FLICKER_JUMP=1 node design/flicker-check.mjs metal 900` (new: it jumps the ship every 420 frames of the sweep) passes with 160 frames by Night and 206 by Day inside the tunnel: no black frame, no NaN pixel.

### Left for later

- The holo ring over the mission table doesn't count down with the band and the glass; it keeps its heading.
- Reverts appear on a waypoint's card only when the reputation index has them, which counts per agent identity, so the card leaves them out for now.
- The start-of-watch card and the captain's debrief (with the recoveries the waypoint cards count) are later stages.

## The bridge: rituals

The captain still wanted more life, and the feeling of a big thing pushing the team toward its best. This stage gives the bridge a captain's routine, in the spirit of a crew bringing a ship home rather than any film's ships, names or sounds: a start of watch that greets the captain with the day's real log, momentum you can watch build, and the captain's own turnaround on a pit wall. Every figure is an outcome (merges, issues closed, bounties paid, reviews cleared, units recovered), never lines, tokens or terminal time, nothing ranks people, and when a unit needs the captain all of it gives way.

- **Start of watch** (`src/client/features/launch/`): on the first visit of the day the lights come on aft to bow from near dark, the pods one at a time, and the day's captain's log crawls into the stars ahead of the bow, behind the bridge's frames; back after twenty minutes away, the debrief in VESPER's voice, who waits on you first. With a unit waiting at load it is over in 1.2 s and lists them; reduced motion makes it a card.
- **The drive core** (`src/client/features/drive/`): a reactor column rising out of the Deck lift's roof, a ring lit for each merge in the current run, today's best etched in white, its light running at the ship's cruise speed; the fleet's week on the ticker against its record, an eight-week tally over the Services panel, and one surge when the record falls.
- **The pit wall** (`src/client/features/turnaround/`): reply and review times today against seven days over the Review bay, a hairline to the drive core when a wait clears fast, the captain's bar in the top bar, and the bay's light a step up when the review queue is long.
- **Settings > Bridge > Rituals**: Start of watch (Full, Debrief only, Off), Momentum display and Turnaround clock.

The numbers are in `src/shared/pace.ts`, `src/shared/turnaround.ts` and `src/shared/launch.ts`, worked out on the server (`src/server/pace.ts`) and tested in `tests/drive.test.ts`, `tests/turnaround.test.ts` and `tests/launch.test.ts`; the words are checked by `tests/copy.test.ts`.

`node design/shoot-rituals.mjs life-rituals/after` takes the stills from a built office with the page's clock stepped a frame at a time, and the clip `shots/life-rituals/after/rituals-clip.mp4` (12 s, from the conn): the launch, the crawl and the debrief, then the drive core taking two merges. The pace the shots show is played into the page as the server sends it. `SHOOT_ROOT=<a build of the commit before> SHOOT_LOOK=1 ... life-rituals/before` takes the same vantages on the build before, `SHOOT_LIGHT=day ... life-rituals/day` the Day set.

| Before | After |
| --- | --- |
| ![](shots/life-rituals/before/conn.png) | ![](shots/life-rituals/after/launch-crawl.png) |
| ![](shots/life-rituals/before/conn.png) | ![](shots/life-rituals/after/launch-debrief.png) |
| ![](shots/life-rituals/before/core-close.png) | ![](shots/life-rituals/after/drive-lit-close.png) |
| ![](shots/life-rituals/before/core.png) | ![](shots/life-rituals/after/drive-lit.png) |
| ![](shots/life-rituals/before/conn.png) | ![](shots/life-rituals/after/drive-record.png) |
| ![](shots/life-rituals/before/bay.png) | ![](shots/life-rituals/after/pit-wall.png) |
| ![](shots/life-rituals/before/high.png) | ![](shots/life-rituals/after/hairline.png) |

| The lights coming up | The pods, one at a time | The crawl going away | Reduced motion: the card |
| --- | --- | --- | --- |
| ![](shots/life-rituals/after/launch-wake.png) | ![](shots/life-rituals/after/launch-pods.png) | ![](shots/life-rituals/after/launch-crawl-far.png) | ![](shots/life-rituals/after/launch-still.png) |

| A unit waiting at the start of watch | The log as one line on the band | The debrief alone | A broken run |
| --- | --- | --- | --- |
| ![](shots/life-rituals/after/launch-yield.png) | ![](shots/life-rituals/after/launch-yield-band.png) | ![](shots/life-rituals/after/debrief.png) | ![](shots/life-rituals/after/drive-broken.png) |

| The pit wall, close | The captain's log in Goals | Settings > Bridge > Rituals | Day: the crawl |
| --- | --- | --- | --- |
| ![](shots/life-rituals/after/pit-wall-close.png) | ![](shots/life-rituals/after/goals-log.png) | ![](shots/life-rituals/after/settings-rituals.png) | ![](shots/life-rituals/day/launch-crawl.png) |

| Day: the drive core | Day: the record | Day: the pit wall | Day: the debrief |
| --- | --- | --- | --- |
| ![](shots/life-rituals/day/drive-lit-close.png) | ![](shots/life-rituals/day/drive-record.png) | ![](shots/life-rituals/day/pit-wall-close.png) | ![](shots/life-rituals/day/launch-debrief.png) |

Frame time at 1440x900 by night on the GPU (Apple M3 Pro through ANGLE Metal), `node design/perf-probe.mjs metal` (twelve units at work, six sister decks, two open pull requests), the build before and this one run back to back: from the conn 11.2 ms before against 10.7 ms after for a forced render with `gl.finish` (this machine was busier than at the last stage's probe; the two runs are the comparison), 1057 draw calls against 1060 (the pit wall's two and the tally); out of a side port 0.9 to 1.0 ms both, 386 draw calls both; rAF p50 16.7 ms and p95 16.7 to 16.8 ms throughout, on vsync. The drive core adds five more draws where it is in view, aft; the crawl, the hairline and the bay's wash one each while they show. `FLICKER_RITUALS=1 node design/flicker-check.mjs metal 900` (new: it lights the core, plays the launch every 420 frames, runs the hairline and faces aft a third of the time) passes by Night and by Day: no black frame, no NaN pixel.

### Left for later

- The drive core stands aft, so from the conn facing the bow the run reads on the ticker and the tally rather than on the column; turning round shows it.
- The fleet's record reaches back only as far as each deck's timeline (2000 events a deck); a long-lived fleet may forget an old record week.
- Reply times start from this stage: the server notes each answer from now on, so the pit wall's seven-day reply median fills in over a week.
- `src/client/features/space/stars.ts` calls `smoothstep` with its edges reversed (undefined in GLSL; it happens to work on today's GPUs). The rituals' own shaders keep their edges in order.

## The bridge: life, round two

The captain still found the bridge short of life, and wanted the feeling of something big that pushes the crew on, with Guardians of the Galaxy or Star Wars as a loose inspiration. Three critics (mood, focus and performance) reviewed the life stages from `shots/life-review/`. Their main finding was that most of the new life was text. The crew sat still, the jump played like a screensaver, the destination was out of sight from the conn and the start of watch leaned on a famous film's opening crawl. This round fixed every item they marked must and most of the should and nice ones. Everything is still driven by real events, and when something needs the captain the spectacle yields.

- **The crew move** (`src/client/features/posture/`): every unit carries itself for its real state. It leans in at work and glances across at the next screen now and then. It stands and stretches once when it finishes. Stuck, it slumps and sighs over a slow red breath of light on its desk. Needing the captain, it turns to the conn with a hand up. It is laid over each unit's pose after the celebrations' gestures, so neither disturbs the other.
- **The jump in three beats** (`src/client/features/space/`): the spool-up lets the lights down through 3, 2, 1 while the view's edges breathe ship-cyan. The punch kicks the view about 8 degrees wider into a bright tunnel that lights the room from the glass. On the arrival the next world swings into the glass. With sound on, the drive spools up and releases (`src/client/sound/jump.ts`, synthesized, off by default).
- **The destination in sight** (`src/client/features/destination/`): it sits low in the left-hand pane from the conn and fills about a quarter of the view from the first waypoint. It turns slowly and grows to a third. Its band is two short lines under it that fit their pane. The nebula is brighter, teal with a magenta heart.
- **An original start of watch** (`src/client/features/launch/watchlog.ts`): the receding crawl is gone. A scanline wipes a flat panel onto the forward glass and the day's log is typed onto it a sentence a line. Merge toasts that land meanwhile are held, and merges that land together gather into one toast.
- **A band that never cries wolf** (`src/client/features/alert/`): the words follow the condition at that moment, and the latch only holds the light. The band says STANDING DOWN the moment nobody waits, and it names the quick answer beside a stuck unit. The strip's counts repaint with it in the same frame. Through the 20 s stuck clip, `shoot-life.mjs` found no frame naming a condition with nobody waiting.
- **Bolt, redrawn and on by default** (`src/client/features/droid/`): a lopsided tool-drone with one arm and one eye-light, about half as big again, so it belongs to no franchise. It carries the crate in its clamp with a trail behind it and hops as it hands the crate over.
- **The drive core** shows a pulse up the column for each merge, a darker unlit steel and a RUN and BEST plaque on its collar. **The top bar** no longer opens the day on a row of zeros: once there is something it says what the crew got through. **VESPER** gets a voice plate with a waveform.

`node design/shoot-life.mjs` (after `npm run build`) takes every still and clip below from a built office with the page's clock stepped a frame at a time. `SHOOT_LIGHT=day` takes the Day set, and `SHOOT_OUT` names the folder. The clips are `night-showcase.mp4` (20 s from the conn: a unit finishes, a merge, then a waypoint's jump), `night-busy-bridge.mp4`, `night-merge-milestone.mp4` and `night-stuck-needs-you.mp4`, with a frame a second tiled beside each in `*-frames.png`.

| Before | After |
| --- | --- |
| ![](shots/life-review/night-conn.png) | ![](shots/life-final/night-conn.png) |
| ![](shots/life-review/night-ahead.png) | ![](shots/life-final/night-ahead.png) |
| ![](shots/life-review/night-launch-crawl.png) | ![](shots/life-final/night-launch-log.png) |
| ![](shots/life-review/night-stuck-still.png) | ![](shots/life-final/night-stuck-still.png) |
| ![](shots/life-review/night-droid.png) | ![](shots/life-final/night-droid.png) |
| ![](shots/life-review/night-drive-core.png) | ![](shots/life-final/night-drive-core.png) |

| The spool-up | The punch | In the tunnel | The arrival |
| --- | --- | --- | --- |
| ![](shots/life-final/night-jump-spool.png) | ![](shots/life-final/night-jump-punch.png) | ![](shots/life-final/night-jump-tunnel.png) | ![](shots/life-final/night-jump-arrival.png) |

| Leaning in | Finished: the stretch | Stuck: slumped, the desk's red breath | Needs you: turned to the conn |
| --- | --- | --- | --- |
| ![](shots/life-final/night-crew-working.png) | ![](shots/life-final/night-crew-stretch.png) | ![](shots/life-final/night-crew-stuck.png) | ![](shots/life-final/night-crew-asks.png) |

| Day: the conn | Day: the punch | Day: the log on the glass | Day: condition red |
| --- | --- | --- | --- |
| ![](shots/life-final/day-conn.png) | ![](shots/life-final/day-jump-punch.png) | ![](shots/life-final/day-launch-log.png) | ![](shots/life-final/day-stuck-still.png) |

Frame time at 1440x900 by Night on the GPU (Apple M3 Pro through ANGLE Metal), `node design/perf-probe.mjs metal` with twelve units at work, six sister decks and two open pull requests, every row in `shots/life-final/perf.txt`. Three builds were timed back to back: `design/ugc-army` at 5d81b96 and the reviewed `design/life` at 2cacf93 (both built from `git archive` and timed through `PROBE_ROOT`), then this round. From the conn a forced render takes 2.5 to 2.8 ms, against 2.5 to 2.6 ms on `design/ugc-army` and 2.6 to 2.7 ms on the reviewed build. That is 1063 draw calls against 1045 and 1060, and 116k triangles against 106k and 110k (the larger world, Bolt and the core's plaque). Out of a side port it is 0.9 to 1.0 ms in all three, 388 draw calls against 375 and 386. rAF p50 is 16.7 ms and p95 16.7 to 16.8 ms throughout, on vsync. The new worst cases measure well under 8 ms. The jump with its tunnel open takes 3.2 ms (p95 3.6 ms, 1152 draw calls as the view kicks wider). The start of watch takes 3.2 ms (p95 3.7 ms) while its log is typed, and the log is a page panel that adds no draw. With the CPU throttled 4x the conn takes 11.5 to 12.1 ms, against 11.0 ms on `design/ugc-army` and 11.5 ms on the reviewed build, still under 16.7 ms. In every build some rows read 8 to 12 ms in one window of a run, at a different place each time and gone in a repeat. That is other work on this machine, not a feature. The 2048x1536 crawl texture (about 16 MB of GPU memory, resident all session) is gone, and the jump's name now uses a 1024-wide canvas. `FLICKER_JUMP=1 FLICKER_RITUALS=1 node design/flicker-check.mjs metal 600` passes, by Night (84 frames in the tunnel) and by Day (103): no black frame, no NaN pixel.

### Left for later

- Unit tags still cover the big title painted on the wall boards from the conn (the half-hidden "UESTS" of PULL REQUESTS). Stopping that needs the tags tested against the boards.
- The ticker over the strip is still small from the conn. One item at a time, at twice the size, is the next step.
- The alert condition keeps the documented rule that the room never turns orange or red, so the critics' amber-red rim lights and the hologram tinting toward the stuck unit are not done. The stuck unit's own desk light carries the red.
- The life features still install from `main.ts`, one line each, as `docs/code-layout.md` asks; no feature registry bundles them.
- The escorts' hulls in the hangar view are as before.
- The stuck and needs-you states in the clips are forced into the page's roster; no take drives them through a real server hook yet.

## The bridge: readability

The captain asked for the whole environment to be more impressive, and the first thing in the way was that the wall boards could not be read from the chair: the holo's stars drifted over the Attention board's rows, the units' callouts (PR AGENT, B-01 SPROCKET, A-01 PIXEL) sat in front of the boards, and the wall was 23 m off, its rows 6 px tall. This stage clears the boards and brings them closer, before any of the spectacle that follows. What it does is in [docs/design.md](../docs/design.md#the-bridge-from-the-captains-chair).

### Before and after

`node design/shoot.mjs env-readability/<before|after>-<night|day> office,bridge-conn,bridge-holo,deck-north,bridge-lean` (with `SHOOT_LIGHT`) takes the stills; `bridge-lean` sits in the captain's chair and rests the crosshair on the Attention board for 3 s. `SHOOT_CREW=busy SHOOT_NEED=desk-1` gives the busy crew with one unit asking (`after-busy/`, and `after-busy-gpu/` on Metal). `lean-clip` records `clip/lean.mp4` on the page's own clock: the lean coming in on the Attention board, a mouse move letting it go and turning the view to the PR board, and the lean coming in there, with stills of each beat in `clip/lean/`.

| | Before | After |
| --- | --- | --- |
| Holo over the Attention rows (`bridge-holo`, `bridge-conn`, `deck-north`) | the star map across Cosmo and Widget | none: stars and cone fade out over every board's face |
| Callouts over a board (`bridge-conn`, `office`) | PR AGENT on the Attention board's side column, NIBBLE and BYTE on the Queue board, SPROCKET on Pull requests | every one docked under a bezel with its hairline, none faded at the conn |
| Attention row names from the conn, no lean | 6 px | 9 px (Widget with its descender 11) |
| The same with the lean held 1 s | | 14 px (13 for Cosmo, which has no ascender) |
| Busy crew, Pixel needs you | | Pixel docked first in the first row under Queue, full strength |

The heights are the bright rows of each name, measured from the stills. The count band reads 2, 1, 4, 2 (needs you, stuck, running, done) over rows that list the same units.

### Frame time

`node design/perf-probe.mjs metal` at 1440x900 by Night on the M3 Pro (ANGLE Metal), the baseline (`git archive` of 5b8a3ff through `PROBE_ROOT`) and this stage back to back, twice, every row in `shots/env-readability/perf.txt`. From the conn a forced render takes 3.1 and 3.4 ms (p95 3.9 and 4.2) on the baseline and 2.7 to 3.4 ms (p95 3.4 to 4.6) here, 1057 draw calls against 1044: the wall's five slabs and their rules are one draw a material now, which more than pays for the hairlines of the docked callouts. Out of a side port it is 0.9 to 1.0 ms in both, 388 calls against 382. rAF p50 is 16.7 ms throughout. With the CPU throttled 4x both builds miss vsync on this machine today (rAF p50 33.3 ms, a forced render 12.9 to 16.0 ms here against 13.9 to 14.9 ms); that is the CPU budget later stages take on. Some windows of both builds read 8 to 9 ms on a forced render from the conn, in a different window each run, with another office running on the same GPU. `node design/flicker-check.mjs metal` passes, 600 frames by Night and 600 by Day, no black frame and no NaN pixel.

### Left for later

- The wall is 2 m nearer, not 4: a 4 m move puts the end panels and the board agents' lecterns into pods A and B, so the rest of the reach is the focus lean and the larger type.
- A docked callout eases to its slot at the callouts' own pace; a fast turn of the view can leave one a frame behind its board.

## The bridge: materials

The second stage of making the environment more impressive: the deck stops reading as a grey CAD model. It comes with the Quality tiers that gate every stage after it, and pays for itself by drawing the static deck in a few draws. What it does is in [docs/design.md](../docs/design.md#materials-and-the-quality-tiers) and [the deck](../docs/deck.md#light-and-materials).

### Before and after

The before stills are a `git archive` of 954c6dd built in a scratch folder; the after ones are `SHOOT_QUALITY=high SHOOT_LIGHT=<night|day> node design/shoot.mjs env-materials/after/<night|day> bridge-window,bridge-window-e,bridge-conn,bridge-station,deck-north,bridge-holo,units-c,deck-table,bridge-aft,settings-bridge` (software rendering picks Low by itself, so the stills ask for High). `SHOOT_QUALITY` is new in `shoot.mjs`. `clip/bridge.mp4` is the bridge clip on the GPU at High by Night, with frames at 1, 4, 6 and 9 s in `clip/frames/`.

| | Before | After |
| --- | --- | --- |
| West port by day (`bridge-window`) | flat grey walls, a black box in front of the escort | plating with seams, bolt rows and vents, conduits and a tray along the wall's foot, the droid's cradle on the sill under the glass |
| Consoles (`bridge-station`, `units-c`) | flat boxes | rounded edges, panel seams, a vent and bolts on the pedestal, glossier tops |
| The conn by night (`bridge-conn`) | the floor flat round the table | the holo's glow and the table's rim reflected soft in the polished walkway; the table's pedestal shows its plating |
| State marks (`hue-check.txt`) | | identical by day; by night the board's stuck mark is up to 3.5% of the channel range bluer from the glow round it, inside the 4% allowed |
| Settings > Bridge (`settings-bridge`) | | Quality: Auto, Low, Medium, High |

### Frame time

`node design/perf-probe.mjs metal` at 1440x900 by Night on the M3 Pro, before (`frames-before.jsonl`, Auto, 954c6dd) and after on High (`frames-after.jsonl`, `PROBE_SETTINGS='{"quality":"high"}'`; the probe now draws the shadow map on its forced renders when the tier does every frame).

| | Before | After (High) |
| --- | --- | --- |
| Conn draw calls | 1044 | 592 |
| Conn triangles | 116k | 133k |
| Conn forced render p50 / p95 | 3.0 / 3.7 to 4.0 ms (one window 9.6) | 2.1 to 2.4 / 2.6 to 3.1 ms |
| Side port | 382 calls, 1.0 / 1.1 ms | 201 calls, 0.9 / 1.3 to 1.8 ms |
| Conn, CPU 4x: forced render p50 / p95, rAF p50 | 20.0 / 23.6 ms, 50 ms | 10.3 / 12.1 ms, 16.7 ms |
| SwiftShader rAF p50 (Auto picks Low) | 267 ms | 267 to 283 ms |
| Worst frame on the first Night to Day switch | | 33 ms (216 ms before the beat's light was fixed) |
| Textures and render buffers (counted at the GL calls) | 213 MB | 239 MB |

The CPU 4x numbers move by 2 to 3 ms from run to run on this machine with other offices running; side by side in one sitting the baseline read 11 to 16 ms and this stage 10 to 12 ms p50. Where the time went before: half the CPU was the crosshair's ray testing every triangle of the hull's viewport frames each frame (now capped at the furthest reach, cut into runs, and not cast while the view is still). `node design/flicker-check.mjs metal` passes, 600 frames by Night and 600 by Day.

### Left for later

- The fleet's escorts and the destination world are ShaderMaterials with their own light: the sky probe lights the hull's plating and nacelles only.
- Hazard chevrons and stencilled deck numbers are not in the atlas: the deck's own floor paint has the numbers, and the chevrons want the step edges of a later stage.
- Low leaves out the room light and the trim: software rendering paid for every lookup (an Intel laptop at Low loses the most visible part of this stage).
- The floor's reflection is the probe's, box-projected; the planar emissive reflection is stage 3.

## The bridge: space outside

The fourth stage of making the environment more impressive: a look out of a port has depth, a body close by and a sun to squint at, where it showed grey haze before. What it does is in [docs/design.md](../docs/design.md#space-outside-the-glass) and [the deck](../docs/deck.md#the-bridge). The code is the sky's bake in `src/client/features/space/sky.ts` and a new module, `src/client/features/vista/` (the dust, the giant, the flare), installed with one line in `main.ts`.

### Before and after

Every still is on the GPU at High, 1440x900, in `shots/env-space/`. The before ones are a `git archive` of f5aa728 (`baseline-commit.txt`), the after ones `SHOOT_MISSION=0 SHOOT_CREW=busy SHOOT_GPU=1 SHOOT_QUALITY=high SHOOT_LIGHT=<night|day> node design/shoot.mjs env-space/after/<night|day> ...`: a healthy crew and no course set, so nothing needs the captain and no jump moves the ship to another region mid-set. `after-attention/night` is the default crew (two need you, one stuck), with space given way; `after/medium` and `after/low` are those tiers. `bridge-window-port` and `-starboard` are the same cameras as `bridge-window` and `bridge-window-e`, copied under the new names for the before set.

| | Before | After |
| --- | --- | --- |
| Port side (`bridge-window-port`) | grey band haze, a few stars | a ringed giant over a third of the port: terminator where the key light comes from, the ring's shadow across its face, a rim on its lit side; teal gas and dark dust in front of it |
| Starboard (`bridge-window-starboard`) | grey haze | the nebula's starboard lobe: teal filaments, indigo thin gas, dark lanes |
| Parallax (`space-parallax-1`, `-2`, `-diff`) | | two shots a second apart while the ship makes way: the dust moves across the whole port, the giant only by its turn. With Ship motion Off (`space-parallax-still-diff`) the difference is black |
| The sun (`bridge-sun`, `bridge-sun-rib`) | | from the conn, looking up: the glow, rays, streak and ghosts through a clear pane; a step to port, a rib cuts the glow and the ghosts go |
| The canopy (`bridge-up`) | the canopy and stars | the sun at the top edge of the view behind the halo ring, its glow cut by the ring and its streak past it |
| The conn (`bridge-conn`) | | no knot, flare or dust over a board; the sun is out of view |
| Day (`after/day`) | | the sky paler and brighter, the giant and the nebula still read; no black or NaN region |
| Given way (`after-attention/night`) | | knots, dust and ghosts at 35%, the giant's body as it was |

`deck-high` looks down from outside the hull, with the sun behind and over the camera, so it has no flare. The canopy shot and the two sun shots show it instead. `clip/bridge.mp4` (`SHOOT_CLIP=space`, 10 s at 30 fps on the GPU) runs along the port side past the giant with the dust sliding by, turns up into the canopy, and ends on the sun from the conn as a rib crosses it; stills at 1, 2, 3, 6, 8, 9 and 9.9 s are in `clip/sequence/`.

### Frame time

`node design/perf-probe.mjs metal` at 1440x900 by Night on the M3 Pro (ANGLE Metal) with `PROBE_SETTINGS='{"quality":"high"}'`, the baseline (`PROBE_ROOT` at the `git archive`) and this stage back to back, every row in `frames-before.jsonl` and `frames-after.jsonl`. The machine's load average was 15 to 20 during both runs, with other offices on the same GPU.

| | Before (High) | After (High) | Budget |
| --- | --- | --- | --- |
| Conn draw calls | 595 | 598 | 602 |
| Conn forced render p50 / p95 | 2.7 to 3.0 / 3.6 to 4.1 ms | 2.8 to 3.2 / 3.7 to 4.4 ms | p95 6.0 |
| Side port | 204 calls, 1.0 to 1.2 / 1.8 to 2.3 ms | 207 calls, 0.9 to 1.0 / 1.5 to 2.1 ms | p95 2.0 |
| Jump, tunnel open | 648 calls, 2.9 / 4.7 ms | 650 calls, 2.8 / 3.9 ms | |
| Conn, CPU 4x: forced render p50 / p95 | 10.8 / 21.1 ms | 13.3 / 15.9 ms | |
| Medium: conn, port | | 477 calls 2.4 / 3.0 ms; 86 calls 0.9 / 1.3 ms | p95 5.0 |
| Low: conn, port | | 459 calls 2.2 / 3.0 ms; 68 calls 0.9 / 1.2 ms | 650 calls |
| Sky cube bake (six 512 faces), cold / warm | | 8.2 / 6.7 ms (113 ms in SwiftShader) | 300 ms |
| SwiftShader (Auto picks Low): conn rAF p50 / p95, port | | 433 / 583 ms, 459 calls; 217 / 333 ms, 68 calls | 475 ms |

rAF p50 is 16.7 ms in every row. rAF p95 read 67 to 83 ms on both builds in the High runs, which is this machine's load that day (the Medium and Low runs, a little later, read 16.8 ms). One of three side-port windows reads 2.1 ms p95 against the 2.0 budget; the baseline's same window read 2.3. The bake is timed in the page with a pixel read to wait on the GPU (a fresh copy of the bake's program into a region never baked, then a warm one), and the sky's light probe takes 2 ms more over its next seven frames. The new textures are the giant's face (1024x512 half floats with mips, about 5.6 MB), the dust (512x256 bytes with mips, 0.7 MB) and the flare's atlas (512x256, 0.5 MB): about 7 MB over the last stage's 239 MB.

`FLICKER_QUALITY=high node design/flicker-check.mjs metal` (new: it holds the tier, since Auto stepped down on this busy machine and left the glow out of the check) passes by Night with the glow on and by Day, and again with `FLICKER_JUMP=1` (75 and 105 frames in the tunnel): no black frame and no NaN pixel (`flicker-metal.txt`). `tests/shader-pow.test.ts` reads the new shaders with the rest; every pow() base in them is clamped.

### Left for later

- The giant throws no light into the room. A passing planet's wash swings a rim light round (features/atmos); a body that is always there would hold one rim on it for good, so it waits for a light rig change of its own.
- The dust in front of the giant lightens its night side a little, as gas in front of it would, so the giant reads less solid there than a body would.
- The sun's flare is the key light's direction and does not turn with the sky; over an hour the sky turns 36 degrees under it.
- The band's diffuse light still reads grey on the right of the starboard port, where no lobe of the nebula sits.

## The bridge: cinema

The fifth stage of making the environment more impressive: how the bridge is shot. An arrival from outside on load, a hair of breathing at the conn, merges and the jump framed, the boards and the holo with a screen's character, a light chase round the trim and one grade over the frame. What it does is in [docs/design.md](../docs/design.md#the-cinema). The code is a new module, `src/client/features/cinema/`, installed with one line in `main.ts`; the post chain's AA choice and its slot for the grade are in `features/lights/bloom.ts`, the Overview's framed pose in `core/overview-frame.ts` and the escort coming alongside in `features/fleet`.

### Before and after

Every still is on the GPU at High, 1440x900, in `shots/env-cinema/`. The before ones are 001fbe6 (`baseline-commit.txt`): `before-night/` and `before-day/` with the default crew (two need you, one stuck), and `moments-before/` from a `git archive` of it through `SHOOT_ROOT`. The after ones: `after-night-busy/` (`SHOOT_CREW=busy`, nobody waiting, so the arrival, the breathing and the screens' roll play), `after-night/` and `after-day/` with the default crew, `after-medium/` and `after-low/` at those tiers, and `moments-after/` from `SHOOT_CREW=busy node design/shoot-moments.mjs`.

| | Before | After |
| --- | --- | --- |
| Arrival (`arrival-0s`, `-2.5s`, `-5s`) | the conn from the first frame | outside the bow, high off to starboard, the ship and its escorts; over the bow facing the destination world with its heading band; the conn |
| Arrival skipped (`arrival-skip`) | | a key at 1 s: the conn on the next frame (the camera on the player, 0.000 m off) |
| A unit waiting, less motion (`after-night/arrival-needs`, `after-night-busy/arrival-still`) | | no arrival: the first frame is the conn |
| The conn (`bridge-conn`) | | a vignette into the corners, teal in the darkest tones, scanlines and a faint phosphor on the boards' ground, a cyan hairline round each bezel; the rows' type as it was |
| Breathing (`breathe-1`, `-2`) | | in the captain's chair after 4 s idle, 1.8 s apart: pitch and roll within a tenth of a degree, lift within 2 mm |
| The Overview (`deck-overview`) | from the south-east corner, the Services and Pull requests boards at a slant | from aft: the four work boards, the Attention board and the holo table in the upper two thirds, no callout over a board |
| A merge (`moments-after/merge-frame`) | | the view eased toward the Pull requests board, an escort in the canopy's glass over it |
| The jump (`jump-countdown`, `-tunnel`, `-banner`) | the countdown, the tunnel and the name at 55 degrees (63 in the tunnel) | the countdown pulled back to 60 degrees, the tunnel 68 degrees and lifted 7 degrees into the canopy, the arrival settled back |
| Day (`after-day`) | | clean: a light vignette, no teal, nothing on the state marks |
| Medium, Low (`after-medium`, `after-low`) | | Medium: FXAA and the grade; Low: neither, no screen character |

`after-night-busy/arrival.mp4` is the arrival at 30 fps held a frame at a time (6 s with a second on the conn), and `after-night-busy/bridge.mp4` the bridge clip (a merge at 3.2 s and the jump at 7.6 s) with the merge frame and the jump's framing in it; stills of both moments are in `after-night-busy/sequence/`.

The boards' type with the screens' clock moved a second and the page's own held (`screens-1`, `-2`): of the type pixels (luma 0.3 and over) on the four boards from the conn, 0.1% to 3.4% move, all by one level but one pixel at the Queue board's edge, where the edge smoothing blends the band's ground into a glyph's edge; held at the same clock, two frames differ in 0 to 3 of about 1,700. So the type is not pixel-identical to the letter after SMAA, though the face's shader itself never touches a texel brighter than the ground and the roll band keeps clear of anything near type. With a unit waiting (`after-night/screens-1`, `-2`) the roll and the glitch are still, and 0 to 7 of about 4,500 type pixels move by one level.

### Frame time

`node design/perf-probe.mjs metal` at 1440x900 by Night on the M3 Pro (ANGLE Metal), Auto (High on this GPU) unless named, before (001fbe6) and after back to back in one sitting, every row in `frames-before.txt` and `frames-after.txt`.

| | Before | After | Budget |
| --- | --- | --- | --- |
| High, conn: draw calls | 598 | 601 | 800 |
| High, conn: forced render p50 / p95 | 2.5 / 2.9 to 3.3 ms | 2.3 to 3.1 / 2.9 to 4.2 ms | p95 6.5 |
| High, side port | 207 calls, 1.1 / 1.4 to 1.8 ms | 210 calls, 0.8 to 1.4 / 1.1 to 2.7 ms | |
| High, jump with the tunnel open | 650 calls, 2.7 / 3.3 ms | 702 calls, 2.8 to 3.8 / 4.5 to 5.5 ms | |
| High, conn, CPU 4x: forced render p50 / p95, rAF p50 / p95 | 9.8 / 12.8 ms, 16.7 / 16.8 | 10.2 to 11.2 / 11.9 to 14.1 ms, 16.7 / 16.7 to 33.3 | rAF 16.7 |
| Medium, conn | 477 calls, 2.2 / 2.5 to 3.1 ms | 478 calls, 2.3 to 3.2 / 3.3 to 5.6 ms | p95 5.0 |
| Low, conn | 459 calls, 1.9 / 2.4 ms | 459 calls, 1.8 to 2.0 / 2.5 to 4.0 ms | 650 calls |
| SwiftShader (Auto picks Low), conn rAF p50 / p95 | 450 / 583 ms | 450 / 633 ms | 475 |

rAF p50 is 16.7 ms in every Metal row. The High rows are two runs after the last change, the second one with the machine busier (every number in it a little higher, the side port's last window 2.7 ms p95). The jump draws 52 more calls than before because the framing lifts the view into the canopy, where more of the fleet and the hull show; it stays under 800. One of Medium's three conn windows read 5.6 ms p95 against the 5.0 budget (the first, the other two 3.3 and 3.4); Low's off window read 4.0. The first High run of the stage stepped Auto down to Medium under CPU 4x: the cinema searched the scene by name for the sky and the stars twice a frame, and finds them once now. New memory at High: SMAA's edge and weight targets at the frame's size, 8 bits a channel as SMAA has them (about 12 MB each at 2160x1350, where three.js makes them half floats at twice that), its two lookup textures (under 0.2 MB) and the lens dirt (512x256, 0.5 MB): about 24 MB over the last stage's 246 MB, so about 270 MB, 10 MB past the 260 MB plan.

`FLICKER_QUALITY=high node design/flicker-check.mjs metal` passes by Night and by Day, both through the composer now, and again with `FLICKER_JUMP=1` (90 and 93 frames in the tunnel): no black frame and no NaN pixel (`flicker-metal.txt`).

### Left for later

- SMAA's two full-size targets put High 10 MB past the 260 MB plan; sharing the edges target with the composer's spare buffer would bring it back under.
- The arrival flies through the hull's light as it stands: no light of its own picks out the bow from outside, so the first second reads dim.
- The merge's escort is the first starboard one, whichever deck it is; one that just merged on its own deck would make a better story.
- The jump's tunnel framing lifts the view whatever you look at; from the far side of the table it lifts into the canopy over the wall instead of the bow.
- `tests/mission-e2e.test.ts`'s debrief case timed out twice on this machine while the GPU probes ran, on the baseline build as well (the start of watch under SwiftShader nears its 60 s wait); it passed in the final full run.

## The interior: quality

The first stage of the interior round (the Dais, with grafts from Halo Conn and the Orrery). The previous round's critics scored the room 6/10, and the captain could not tell what had changed: on his M3 Pro, Auto had been drawing at Low ever since one slow minute, hiding every effect the round added. This stage fixes that first, so the stages after it are seen at the tier they were built for, and buys the frame budget they will spend.

What it does is in [docs/design.md](../docs/design.md#materials-and-the-quality-tiers) (Quality and Draw budgets).

### Root cause

- The first Auto saved its step down under `agent-office.quality-cap` with no expiry and read it back on every load, so a single 5 s window over 18 ms (the warm-up, a Night and Day switch, a jump's re-bake, a burst of terminal output) held a fast machine at Low for good.
- It judged every frame after 8 s, hitches included, and never stepped back up.

The cap moves to `agent-office.quality-cap.v2` with the graphics, the tier, the time, a version and the browser session; a new session or a day later starts from the top, and the old key is deleted on sight. Auto judges frames through a governor that throws away the warm-up and 4 s after each one-off hitch, steps down only for a p95 over 22 ms through 10 s, climbs back after 30 s with room to spare, and holds at Medium on Apple silicon and discrete GPUs unless frames are very slow.

### Before and after

Every still is on the GPU (ANGLE Metal, M3 Pro) at 1440x900 from the captain's seat at the conn, with a busy crew, desk-2's unit asking a question and the toasts closed, in `shots/interior-quality/`: `SHOOT_LIGHT=<night|day> SHOOT_QUALITY=<high|medium> node design/shoot-interior.mjs interior-quality/<before|after>`, and for the captain's own case `SHOOT_QUALITY=auto SHOOT_CAP=stale SHOOT_UI=1`. The before ones are a `git archive` of ea42a7f (`baseline-commit.txt`) built in a scratch folder.

| | Before | After |
| --- | --- | --- |
| Auto, with the old Low cap saved (`night-auto-cap-stale`, side by side in `before-after-auto.png`) | drawn at Low: no glow on the holo or the boards, no haze, no shafts, no grade | drawn at High: the holo's bloom, the haze and shafts, the grade and SMAA |
| Settings > Bridge (`night-auto-cap-stale-settings`) | "Drawing at Low now." in the note | a live chip: a three-bar meter and *Auto - running at High* |
| The menu (`night-auto-cap-stale-menu`, `night-auto-stepped-menu`) | no Quality row | *Quality* under Deck with *Auto - running at High* under it; after a step forced by a 20x CPU throttle, *Auto - Medium since 00:44, slow frames* and *Try High*, which drew at High again, cleared the cap and closed the menu |
| High and Medium, Night and Day (`night-high` and the rest) | | the same picture: the draw cuts change no pixel anyone can find side by side |
| Up close (`after-close/`) | | a unit's shell, arms and lights; the floor's bubbles and the ready line's numbers from the sheet, as they were |

### Frame time

`node design/perf-probe.mjs metal` at 1440x900 by Night on the M3 Pro, `PROBE_SETTINGS='{"quality":"<tier>"}'`, the baseline (`PROBE_ROOT` at the `git archive`) and this stage alternating, five runs each at High; every row in `frames-before.jsonl` and `frames-after.jsonl`. Medians of the runs, worst run in brackets.

| | Before | After | Budget |
| --- | --- | --- | --- |
| High, conn: draw calls | 601 | 378 | 400 |
| High, conn: forced render p50 / p95 | 2.3 / 2.7 (3.0) ms | 1.9 / 2.4 (2.8) ms | p95 12 |
| High, conn: rAF p50 / p95 | 16.7 / 16.8 ms | 16.7 / 16.7 ms | |
| High, side port | 210 calls, 1.4 / 1.6 ms | 127 calls, 1.2 / 1.4 ms | |
| High, jump with the tunnel open | 702 calls, 2.7 / 3.1 ms | 431 calls, 2.2 / 2.8 ms | |
| High, conn, CPU 4x: forced render p50 / p95 | 9.7 / 11.6 (12.7) ms | 7.3 / 8.7 (17.1) ms | p95 18 |
| Medium, conn | 478 calls, 2.1 / 2.7 ms | 291 calls, 1.7 / 2.0 ms | 330 calls |
| Low, conn | 459 calls, 1.8 / 2.3 ms | 269 calls, 1.5 / 1.7 ms | 280 calls |
| Motion layer (Ship motion on against off), High / Low | | 0.1 / 0.1 ms (`frames-motion.jsonl`) | 0.6 / 0.2 |

Headless Chrome paces rAF at 60 Hz, so its p95 can't fall under 16.7 ms here; the frame's own cost is the forced render (draw and `gl.finish`). The motion layer is timed by the frame's CPU, at the 0.1 ms the browser's clock gives: ANGLE on Metal answers GPU timer queries with wall time (8 to 22 ms for frames drawn in 2), which the probe now refuses. The CPU 4x worst run (17.1 ms) is one window of five with the machine busy; its median is 8.7 ms.

`node design/soak-quality.mjs 10` (`soak.txt`): ten minutes of Auto on the GPU with the old Low cap saved, twelve terminals attached printing 3,000 lines at once every half minute, Night to Day and back, two jumps. 598 s at High, none at Medium or Low, no step, the chip says *Auto - running at High*, and the old key is gone. `node design/flicker-check.mjs` passes by Night and by Day.

### Left for later

- Give-way still dims the spectacle to 30% in normal use, and the tuning sits under what a person notices (DESIGN.md enforces it): the next stage, look and give-way, is the visible win.
- The probe's rAF numbers are vsync-bound headless; on the captain's 120 Hz panel the governor's 12 ms rule is the one that applies, on a 60 Hz one the every-frame-on-its-refresh rule.
- A unit's stripe, chest mark and letters go at 13 m on Medium and 7 m on Low; from the conn on Low that is every unit. The band, ring, glyph and callout stay at every distance.
- The plinth under a laptop takes the bezel's paint (`#26303C` for `#2E3946`), 14 mm of it.

## The interior: layout

The second stage of the interior round: the Dais, the composition fix the jury scored highest. The room had no hierarchy from the chair: a low conn, the boards 21 m off in a ring standing on the deck, the holo over the Attention board and the armrest console filling a third of the frame. The deck is now a command amphitheatre (`src/shared/amphitheater.ts`, `src/client/features/amphitheater/`): the mission table in a pit, two tiers of consoles stepping up south of it to the captain's dais 1.8 m up, and the situation arc hung over the far side of the pit, concave toward the chair. What it is and how it reads is in [docs/deck.md](../docs/deck.md) and [docs/design.md](../docs/design.md#the-bridge-from-the-captains-chair).

### What moved, and what stayed

- The conn is a 3.2 m dais at z 10.7 (the plan said about 11.5; at 11.3 the dais's back closed the walkway out of the lift, so it sits 0.8 m further north), with an aisle of eight steps down to the pit, a gallery ramp either side at 1 in 6.2 from the back tier, a brass rail round its back and a gold lip. The captain's chair is the hero: a high back, gold piping, a gold underlight, the counts and the course on slim armrest strips. Seated, the eye is 2.98 m up and 17.5 m from the Attention board.
- The tiers: 0.45 m from 5 to 7.8 m out, 0.9 m from 7.8 to 10.5 m (the plan's 7.5 and 10 left no walkway behind a stool), their ends ramped to the deck. A and B on the back tier, C and D on the front, with the same desk ids; each pod's ready line round the pit on its side of the aisle.
- The arc: the Attention board 7.2 by 3.2 m from 3.0 to 6.2 m, the capacity strip from 2.35 m under it (inside the arc's foot, so the holo and the heads stay under it), the wings' boards 4.6 by 1.8 m (1.6 m held only one row), two to a wing. All of it 0.6 m under the ceiling. The overhead counts strip is gone: it said the Attention board's band again right over it, and took the bow's space; the ticker and the condition band hang over the arc.
- The seated framing is 50 degrees, not the plan's 60: at 60 the arc is 18% of the frame's height, under the 22% the acceptance asks. It is aimed 30% of the way up the arc so the crew on the tiers stay in frame.
- Unchanged: the mission table at the origin, the wing, the Standby bench, the Review bay, the lift, every seat id, N, I, G, the Units rail (expanded), the edge pointers and the modals. The arc and the floor are fixtures of their own plus one install line for the framing; nothing in `server.ts`, `protocol.ts` or the store.

### Before and after

On the GPU (ANGLE Metal, M3 Pro) at 1440x900, sat in the captain's chair the way E does (`SHOOT_POSE=sit`), a busy crew with desk-2 asking, the toasts and the waiting card closed, in `shots/interior-layout/`. The before set is the build of 3cc6cd0 from a scratch copy (`SHOOT_ROOT`).

| | Before | After |
| --- | --- | --- |
| The chair, Night and Day, High and Medium (`<light>-<quality>-sit.png`) | eye 1.3 m up over the armrest console; the boards a thin band 21 m off, the holo across the Attention board | bow and canopy over the arc (30% of the frame), the arc (25% of the height, two thirds of the width), the pit and the holo, the crew on the tiers; the captain asked for a change visible at a glance: `before-after-sit.png`, and against the interior baseline `before-after-conn.png` |
| The Overview (`*-overview.png`, `before-after-overview.png`) | from aft, a flat ring of pods | raised over the starboard quarter: the dais, both tiers, the pit, the holo and the arc in section, every callout in view |
| What covers the boards (`after/*-mask.png`, `after/mask.json`) | | boards painted magenta: nothing of the deck in front of any; the 0.2 to 3% left is the HUD over the canvas (the crosshair dot, an edge marker) |

### Checks

- `tests/sightline.test.ts`: every console's hood, a head on either tier, the holo at 2.3 m and the board agents at least 8 cm under the seated eye's line to the arc's foot; the arc under the ceiling; the framing's bands. `tests/amphitheater.test.ts`: the heights, the 1:6 galleries, the walks from the lift to the dais, into the pit and up each gallery with no ledge.
- `node design/walk-check.mjs` (`walk-check.txt`): down the aisle and back up it with no step over 0.14 m, up both risers (0.45 m each, the camera easing it) and held at the back tier's edge, up a gallery to the dais, held by the dais's back rail, never off the floor; the chair at 50 degrees from a 2.98 m eye; G, I, Esc and N work, no page errors.
- `npm run typecheck`, `npm test` (984 pass) and `npm run build` clean; `FLICKER_QUALITY=high node design/flicker-check.mjs metal` passes by Night and by Day.

### Frame time

`node design/perf-probe.mjs metal`, `PROBE_SETTINGS='{"quality":"high"}'`, five runs each; the before from the old conn's eye, the after from the chair (`PROBE_CONN='[[0,2.98,11],[0,3.5,-6.5]]'`). Every row in `frames-before.jsonl` and `frames-after.jsonl`; medians, worst run in brackets.

| | Before | After | Budget |
| --- | --- | --- | --- |
| High, conn: draw calls | 378 | 364 | 400 |
| High, conn: forced render p50 / p95 | 2.0 / 2.4 (3.0) ms | 1.9 / 2.5 (2.6) ms | |
| High, conn: rAF p95 | 16.8 ms | 16.8 ms | |
| High, side port | 127 calls, 0.9 / 1.3 ms | 129 calls, 1.0 / 1.3 ms | |
| High, jump with the tunnel open | 431 calls, 2.0 / 2.7 ms | 403 calls, 1.9 / 2.5 ms | |
| High, conn, CPU 4x: forced render p50 / p95 | 7.6 / 9.1 (12.9) ms | 7.1 / 8.6 (9.5) ms | |
| Motion layer (Ship motion on against off) | 0.1 ms | 0.1 ms | 0.6 |

The floor and the arc cost fewer draws than the standing wall and the overhead strip they replace.

### Left for later

- The left wing's outer edge sits under the expanded Units rail at 1440x900; centring the frame on the visible part of the canvas (a view offset) would bring it out, but changes every screen-space test the deck makes.
- The routes (`nav.ts`) don't use the galleries (a metre wide, with a ledge either side they leave no cell clear); people walk them, units and N's flights go by the aisle.
- N stands you 2.4 m behind a back-tier console, which is on a gallery: higher than the unit, still looking over its shoulder.
- `tests/mission-e2e.test.ts`'s debrief case failed once in this stage's runs on the baseline bundle too (SwiftShader nearing its 60 s wait); it passed in the final full run.

## The interior: diegetic UI

The third stage of the interior round: what the room says, and how it says it. The layout stage gave the room a composition; this one makes the information plane in it read from the captain's chair at a glance. The Attention board becomes the arc's hero, every board gets chrome in the colour of its most urgent state, each attention state gets its own shape in the room, a unit shows one label at a time, the holo becomes a route column with one caption, and the room counts in two places only. What it is and how it moves is in [docs/design.md](../docs/design.md#the-bridge-from-the-captains-chair) and [DESIGN.md](../DESIGN.md).

### What changed

- **The Attention board** (`features/tv/plan.ts`, `attention.ts`): a header with ATTENTION, the counts and a JUMP READY chip; then cards in the order a captain acts (stuck, needs you, to review, working, done), two columns of three with names in 0.5 m type. Waiting and stuck units always have a card (denser grids past six, never hidden); working units fold into one *WORKING 12* chip when they don't all fit; done has its own green check. The old count band (with a DONE tile that showed the review glyph) and the three-row list with "+8 more" are gone.
- **Lit glass and the wings' fold** (`features/boards/fold.ts`, `world.ts`, `screen.ts`): the arc's faces are `#E8ECEF` text on a smoked 88% ground with no slab behind; a wing's row is 0.3 m type; an empty Queue or Services folds to a 0.34 m pill and the board over it grows from two rows to four.
- **Chrome** (`features/arcchrome`): a 2 px bezel and four corner brackets round every face, one instanced draw replacing the graphite bezels, coloured by the board's most urgent state (the hero at full strength with a chase while someone needs you or is stuck, the wings at 55%). The pull: chevrons along the arc's foot and a brightened wing on the side of a waiting unit out of view.
- **Signals** (`features/signals`): diamond and beam, blinking triangle and station rim, turning review ring, working pip; one instanced draw a kind. The orange light columns are gone.
- **Labels** (`features/workers/labels.ts`, `declutter.ts`, `ui/compass.ts`): edge mark, else card, else callout; piles fold into a counted chip; no callout on a board's face; the compass points from the unit, not its seat, and keeps off the boards; the crosshair is a faint dot over a board (it was the orange dot that sat on the Attention board in every earlier shot).
- **The holo** (`features/bridge/holo.ts`, `holo-route.ts`, `holo-labels.ts`, `features/life/heading.ts`): the route column, waypoint plates, unit markers, one caption plate at the lip; the turning ring of lettering is gone; the uplight moved from 0.5 to 1.5 m over the top, which removes the white hot spot the critics called the holo's core.
- **Counts in two places**: the condition band names who and why, never how many; JUMP READY moved off the band; the rail's group heads don't count; a unit's call is a chip at the top centre, not a toast in the lower left.
- **Zoned hue**: conn gold and brass moved from hue 39 to about 48 (`#D9C46D`, `#9D8D53`), so orange in the room means needs you.

### Before and after

On the GPU (ANGLE Metal, M3 Pro) at 1440x900, sat in the captain's chair, toasts and the waiting card closed, with a course set (`SHOOT_MISSION=1`), in `shots/interior-diegetic-ui/`. The fixture is the desk-2 need fixture grown to three units asking, one crashed (stuck) and two done (to review) (`SHOOT_CREW=signals`); `twenty` adds units to 20 on the consoles and the Standby bench. The before set is the build of ff9199d from a `git archive` in a scratch folder (`SHOOT_ROOT`), shot with the same script.

| | Before | After |
| --- | --- | --- |
| The chair, Night and Day, High and Medium (`<light>-<quality>-signals-sit.png`, `before-after-signals-sit.png`, `before-after-day-high-signals-sit.png`) | the Attention board lists three of six waiting units ("+8 more"), the stuck one missing; names 11 px; red-brown columns over the units; callouts piled on the pit; a white blob on the table; JUMP READY on the band | six cards (stuck first) with names at 19 to 20 px, orange chrome and a chase; diamonds and beams; one caption plate; the band quiet |
| 20 units (`night-high-twenty-sit.png`, `before-after-twenty-sit.png`) | three rows and "+17 more" | every waiting and stuck unit a card, *WORKING 14* one chip |
| Mid, close on the board, close on a pod, the lean, the Overview (`after/night-high-signals-sit-*.png`) | | no label on another label or on board text; the compass's marks off the board's face |

`measure-after.jsonl` is each card's name measured on the shot (`SHOOT_MEASURE=1`): cap height 19 to 20 px in every shot, Night and Day, High and Medium; contrast of the name against its card 12.4:1 to 14.1:1. The before set's rows measure 11 px with the same method (by hand on the shot's boxes), contrast 12.6:1.

### Checks

- `tests/diegetic-ui.test.ts`: the card order, never hiding a waiting unit, the 20-unit chips, the denser grids, the header's counts, the fold's heights, the chrome's bars, the pull, one label a unit, the piles, the route column under the chair's line. `tests/boards-screen.test.ts`: the hero's header, cards, chips and text inside the board; the 17 px arithmetic. `tests/bridge-ship.test.ts`: the signals, the 1 Hz blink, the compass keeping off a board. `tests/alert.test.ts`: the band never says how many. `tests/life.test.ts`: the caption.
- `npm run typecheck`, `npm test` and `npm run build` clean; `tests/size.test.ts` green; `node design/flicker-check.mjs` passes by Night and by Day with the glow on.

### Frame times

`node design/perf-probe.mjs metal`, five runs of the stage's build on the M3 Pro at 1440x900 (taken at the start of the look stage, which builds on it): from the conn at High a forced render takes 1.8 ms (median of the runs' medians; p95 2.3 ms, the worst run's p95 2.6 ms) in 378 draw calls against a budget of 400, rAF p95 16.8 ms; with the CPU throttled 4x 7.6 ms (p95 9.1 ms, worst 12.9 ms); through the jump 2.0 ms in 431 calls. The motion layer costs 0.1 ms of CPU against its 0.6 ms budget.

### Left for later

- From down in the pit (the mid shot) the holo's rings and course stand in front of the capacity strip: only its stars, cone and plates keep off the boards.
- The hint bar ("Captain's chair - Get up") sits over the caption plate in the lean.
- Review keeps its amber at hue 44; the plan's cooler yellow for review would touch the DOM tokens and every surface, so it waits for a tokens pass.
- The Attention board's second line (why) is 0.2 m type, about 8 px from the chair: it reads in the lean, not at a glance.

## The interior: the look

The fourth stage of the interior round, and the one meant to show at a glance: the room's value, light and colour. The critics' root causes were that the spectacle was dimmed to 30% whenever anyone waited (most of the time), and that every effect was tuned to sit under notice. Both are gone: the spectacle gives way locally, and the room is built in three zones of value under a saturated sky. What it is and how it moves is in [docs/design.md](../docs/design.md#the-look-value-light-and-colour) and [DESIGN.md](../DESIGN.md) (rules 7 and 8).

### What changed

- **Give-way is local** (`features/giveway`, `features/atmos/logic.ts`, `features/space/logic.ts`): the shafts, dust, ribs and a planet's wash stand at 85% while anyone waits (were 30%), space's knots, dust, flare and the giant's rim at 80% (were 35%); a new call ducks them to 60% for 2.5 s first. The waiting unit is picked out by `features/spotlight`: the grade darkens a ring round it and a lighter one round the Attention board's rows.
- **The grade** (`features/cinema/grade.ts`, `logic.ts`): Night's teal lift into the darks is gone; a black point, a film toe under 0.3 luma and vibrance (never on a saturated mark or bright type) sink the hull and keep space's colour. The arrival and the breathing play in every state, the breathing a third of a degree.
- **The rig** (`features/lights/modes.ts`): Night is cool blue-indigo starlight with a low sky fill and warm white pods' lamps; Day is a hard warm sun over a mid-dark plate with a cool fill. Medium's half-size glow is held to half strength (`features/lights/index.ts`), where it had washed the arc.
- **The air** (`features/atmos`): a floor fog under about a metre, shafts at half the level in the sun's colour and none over a station, a mirror only in the pit and the aisle.
- **Space** (`features/space/sky.ts`): a bright galaxy band with magenta and teal gas lanes, a larger and vivid nebula, the sky saturated past the tone mapping and sunk to a quarter behind the boards; by Day a sunlit planet seen as a sphere from orbit, its limb across the canopy. The destination world moves to port and its sign to the course strip. The boards' smoked ground is 94% and darker.
- **Units and stations**: two-tone suits, dark glass visors with an eye stripe in the band's colour, state-coloured rims, no draw added (`world/character/unit-body.ts`); station screens never black, with a standby trace or a waveform (`features/life/panels.ts`); gold footwell practicals (`features/bridge/stations.ts`); four finishes (`world/office/materials.ts`); an instrument-black table top; lit indigo channels on the walls (`world/office/greebles.ts`).

### Before and after

On the GPU (ANGLE Metal, M3 Pro) at 1440x900, sat in the captain's chair (`SHOOT_POSE=sit`), a course set (`SHOOT_MISSION=1`), the desk-2 need fixture, toasts closed, Quality forced, in `shots/interior-look/`. The before set is the diegetic-ui stage's build (a3e30a3 with its uncommitted chip) from a `git archive` in a scratch folder (`SHOOT_ROOT`), shot with the same script. Side by side: `before-after-<light>-<quality>-sit.png`, and close-ups from the pit (`-units-a`, `-units-near`, `-table`, `-aft`, `-window`).

Measured with ffmpeg `signalstats` over the 3D area (x 264 to 1440, y 46 to 846), full range (black 0, white 255):

| Shot | 10th percentile luma | Mean luma | 90th percentile luma | Mean saturation |
| --- | --- | --- | --- | --- |
| Night High, before | 20 | 54 | 116 | 19.8 |
| Night High, after | 14 | 92 | 179 | 29.7 |
| Night Medium, after | 18 | 86 | 169 | 31.3 |
| Day High, before | 23 | 76 | 148 | 17.0 |
| Day High, after | 10 | 89 | 172 | 27.8 |
| Day Medium, after | 11 | 88 | 171 | 27.7 |

(The plan's baseline of 35 and 111 was the limited-range reading of the same shot; in limited range the night before set reads 33, 62 and 116, so the plan's 14 is read here on the full range.)

- The spectacle's level in the need fixture, read live (`SHOOT_EVAL`): 0.85 with someone waiting and the spotlight on (station 1, board 0.55); the clip `clip/night-high-calm-sit-call.mp4` (`SHOOT_CLIP=call`) shows a unit starting to ask: the duck and the spotlight settling round it.
- The calm crew (`SHOOT_CREW=calm`, `night-high-calm-sit.png`) isn't the same frame as the need fixture: with nobody waiting the held waypoint jump plays and the sky moves to its next region, so the 85% is read from the code rather than from that pair.

### Frame times

`node design/perf-probe.mjs metal`, five runs each, M3 Pro at 1440x900 (`frames-before.jsonl`, `frames-after.jsonl`; median of the runs' medians, p95 the median of the runs' p95s):

| | Before | After |
| --- | --- | --- |
| Conn, High: render | 1.8 ms (p95 2.3, worst 2.6) | 1.9 ms (p95 2.3, worst 2.3) |
| Conn, High, CPU 4x | 7.6 ms (p95 9.1, worst 12.9) | 7.6 ms (p95 9.3, worst 10.4) |
| Conn draw calls (budget 400) | 378 | 378 |
| Jump | 2.0 ms, 431 calls | 2.0 ms, 415 calls |
| rAF p95 | 16.8 ms | 16.8 ms |
| Motion layer (budget 0.6 ms) | 0.1 ms | 0.1 ms (worst 0.2) |

The sky's new work is in its bake (once per region); the spotlight is two uniforms and a loop of two in the grade's pass; the faces, rims and screens are in programs that were already drawn. The footwells and wall channels are static meshes the merge folds into their materials' draws.

### Checks

- `tests/atmos.test.ts`: the 85% give-way and the 2.5 s duck. `tests/vista.test.ts`: space at 80%. `tests/cinema.test.ts`: the grade sinks the darks with no tint, no state mark moves over 4%, vibrance, the local vignette's ring, the breathing's reach, the arrival in every state. `tests/lights.test.ts`: the rig's colours clear of the state hues, Day's consoles at 4.5:1 on its floor. `tests/unit-body.test.ts`: the eye stripe proud of the visor. `tests/destination.test.ts`: the world off to port.
- `npm run typecheck` and `npm run build` clean; `npm test` 1000 of 1001, the one failure `mission-e2e`'s debrief test, which fails the same way on the before build. `node design/flicker-check.mjs` with `FLICKER_QUALITY=high` passes by Night and by Day with the glow on.

### Left for later

- Day's mean luma is about 89, under the plan's 100 to 115: the dark-backed boards and the graphite consoles hold it down, and lifting the plate further made the pit floor read near-white.
- Night's 90th percentile is 179 and its saturation 29.7, a little under the plan's 185 and 32: brighter gas pushed the canopy to pastel and bloomed over the arc.
- Day's rib shadows across the tiers: the key's shadow map doesn't take the canopy's ribs as casters yet.
- Flybys with kitbashed silhouettes (freighter, corvette, fighter wing) were not built in this stage.
- The calm and need fixtures don't share a frame (the held jump plays when nobody waits): a pinned-region option for the shoot would let the give-way be measured on pixels.

## The interior: motion

The fifth stage of the interior round: a motion layer over the room, so a change is something the captain sees happen rather than finds changed, and the bridge feels alive without costing frames. Four features, each a module of its own: `features/holoui` (the arc's faces in motion), `features/takeconn` (taking the conn, the gold chase), `features/hail` (the attention beats) and `features/kinetic` (the set pieces over the bow). What it is and how it moves is in [docs/design.md](../docs/design.md#the-motion-layer) and DESIGN.md (rules 1 and 8).

### What changed

- **Taking the conn**: on sitting in the chair and as the session's arrival, about 3 s. The view rises from behind the chair's back, clear over its top, onto the seated eye; the tier lips light from the pit up to the dais a step every 120 ms; the arc builds in, the Attention board first, each face wiped on from the bottom with a scanline, its header typed behind a cursor and its counts rolling like an odometer; the armrest strips boot. Any key skips it on the next frame; Low and less motion get a 300 ms fade.
- **The arc's chrome**: an edge-light chase round every board every 6 s, a scan down the whole arc every 6 s at 15%, a sweep across a header when its data changes, new cards sliding in (250 ms, 120 ms apart), bezels crossfading to a new state's hue.
- **The hail**: the station flares, a shockwave spreads over the floor, the beam climbs to the card in 400 ms, the card slides into the top of the Attention board with orange chevrons, and the unit's ship marker flies from the holo to hover in front of the dais with its call sign for 1.6 s. Stuck: a red sweep, a 1 Hz rim blink and a scanline tear on its card only. Done: a green flash, a tick into the holo, the course filling to the ship.
- **Data flow**: dashes up every needs-you beam, a gold chase up the tier lips every 8 s (bright on a waypoint).
- **One kinetic type plane** under the canopy over the arc: WAYPOINT 2/4 CLEARED, the jump's 3-2-1 (now said only there: the band and the sky's banner no longer repeat it, which the critics flagged) and MISSION COMPLETE.
- **The warp**: the room down to 40% through the countdown (it was 65%), the arc folding flat through the stretch and the tunnel, opening on the new system. **The mission complete**: the galaxy 30% brighter for 6 s, the course gold, a V of markers over the pit. **Night and Day**: a 1.2 s iris over the glass.
- **Ambient, tuned to be seen**: the route turns 6 degrees a second (was 3), the conn breathes 0.6 of a degree over 7 s (was a third), the sky turns 3 degrees a minute (was 0.6) with the nebula's knots drifting, and a flyby every 40 to 90 s (was 6 to 10 minutes).

### Before and after

On the GPU (ANGLE Metal, M3 Pro) at 1440x900, sat in the captain's chair, a course set, the desk-2 need fixture, toasts closed, in `shots/interior-motion/`. The before set is 4644bcd (the look stage) from a `git archive` in a scratch folder (`SHOOT_ROOT`); static frames of the two builds are the same picture by design, so the comparison is of the beats.

| | Before | After |
| --- | --- | --- |
| A new call at desk-12, real time (`before-after-hail-400/800/1500.png`, `*/night-high-sit-hailclip.mp4`) | the card appears, the diamond and beam come on, nothing else | the station flares, a shockwave on the floor, the card slides in with chevrons, the marker C-04 hovers by the dais |
| The hail held at 0, 200, 400, 800 and 1500 ms (`after-hail-sequence.png`, the sixth frame Ship motion Off) | | flare and ring, the beam on its way, the card's empty slot outlined, the card sliding in with the sweep, the marker at the dais; at 1500 ms the steady diamond; with motion off a still outline and the marker crossfaded in, nothing travels |
| Sitting in the chair (`before-after-conn-1000.png`, `after/night-high-sit-conn-*.png`, `*/connclip.mp4`) | a cut to the seated view | over the chair's back at 0 to 250 ms, the arc wiping and typing on at 600 to 1000, whole at 2400 |
| The jump, calm crew (`after/night-high-calm-sit-jump-*.png`) | the countdown on the band and on the sky | the countdown once on the type plane with WAYPOINT 1/4 CLEARED, streaks with the arc folded flat, the arc open again on arrival |
| Medium and Day (`after/night-medium-sit-hail-800/1500.png`, `after/day-high-sit-hail-800/1500.png`, `after/day-medium-sit-connclip.mp4`) | | the same beats: Medium keeps every one of them, Day reads them on its lighter plate |
| Stuck, done, mission complete, iris (`after/*-stuck-*`, `*-done-*`, `*-complete-*`, `*-iris-*`) | | the red sweep on its card; the green flash and tick; MISSION COMPLETE in gold; the iris over the glass |
| 5 s of ambient from the chair (`*/night-high-calm-sit-ambient.mp4`, `-first-last.png`) | the holo turning, the scan rings | plus the scan down the arc, the edge chase, the beams' dashes, the gold chase, the breathing and the drifting gas |

Measured on the shots: the take of the conn skipped by a key mid-way is over on the next frame (`at` null, the camera moved 0.4 mm, the breathing); the countdown's places during a jump are the type plane only (`{"kinetic":"2","skyBanner":false,"band":null}`); a rail group folds and unfolds in 27 ms in the middle of the tunnel.

### Frame times

`node design/perf-probe.mjs metal` from the chair (`PROBE_CONN='[[0,2.98,11],[0,3.5,-6.5]]'`), `PROBE_SETTINGS='{"quality":"high"}'`, before and after alternating, five runs each (`frames-before.jsonl`, `frames-after.jsonl`), and one each at Low (`frames-low.jsonl`). Medians of the runs; p95 the median of the runs' p95s, the worst in brackets.

| | Before | After | Budget |
| --- | --- | --- | --- |
| Conn, High: forced render | 1.8 ms, p95 2.35 (2.6) | 1.85 ms, p95 2.35 (2.5) | |
| Conn, High, CPU 4x | 7.4 ms, p95 9.1 (9.5) | 7.4 ms, p95 9.2 (9.3) | |
| Conn draw calls | 364 | 364 | 400 |
| Jump with the tunnel open | 2.0 ms, p95 2.5, 396 calls | 2.0 ms, p95 2.5, 396 calls | |
| rAF p95 | 16.7 ms | 16.7 ms | |
| Motion layer at rest, High (Ship motion on against off, frame CPU) | 0.1 to 0.2 ms | 0.1 to 0.2 ms, p95 0 to 0.1 | 0.6 |
| Motion layer with a hail held mid-beat, High | | 0 to 0.1 ms, p95 0 to 0.1 | 0.6, 1 at p95 |
| Motion layer at Low, at rest / with a hail | 0.1 ms | 0.1 / 0.2 ms, p95 0 / 0.1 | 0.2 |

The A/B is CPU time at the browser's 0.1 ms resolution, and the before build's own reading (0.1 to 0.2 ms) is the floor of it: the layer adds nothing the probe can tell apart. At rest it adds no draw call; a beat's flares, rings and couriers are one instanced draw each while they play.

### Checks

- `tests/motion-layer.test.ts`: the take of the conn's order and length, the steps pit to dais, the rise clear over the chair's back, the gold chase, the scan, a card's uv, the warp's fold, the hail's beam, flare, ring and marker (in front of the dais, only a fade with less motion), the type plane's cards and crossfade, the countdown said once, the mission complete, the iris, and the ambient rates. `tests/cinema.test.ts` and `tests/space.test.ts` hold the new breathing and flyby gap.
- `npm run typecheck` and `npm run build` clean; `npm test` 1014 of 1015, the one failure `mission-e2e`'s debrief test under SwiftShader, whose debrief takes about 63 s on this build and on the before build alike against a 60 s wait. `FLICKER_QUALITY=high node design/flicker-check.mjs metal` passes by Night and by Day, and with `FLICKER_MOTION=off` (Ship motion Off) too.

### Left for later

- The second region of sky after a jump (region 2) has a bright cyan core behind the arc that washes the Attention board; the before build does the same (checked side by side), so it is the sky's tuning, not this layer.
- The wings' rows don't slide in yet: only the Attention board's cards do; a wing's header sweeps instead.
- The hail's marker leaves a ghost: the holo's own marker for that unit stays on the route while its copy flies to the dais.
- The beam's climb is easiest to see from a station in view; a unit out of view shows its card's slide and the marker.
