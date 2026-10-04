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
