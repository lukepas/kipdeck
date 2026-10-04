# The review round: before and after

Back to the [README](../README.md) and the [design system](../DESIGN.md).

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
