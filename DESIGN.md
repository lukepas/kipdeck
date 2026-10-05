# UGC Army design system

Back to the [README](README.md).

UGC Army is an operations deck for teams running many AI coding agents. The screen is calm by default and only an exception carries color, so the eye goes straight to what needs a person. This page is the contract for every surface: the 3D deck, the 2D view at `/lite`, the sign-in pages and the `/pom/` showcase.

The tokens live in `src/client/styles/tokens.css`. Every sheet uses them by name; a hex value in a module sheet is a bug. [docs/design.md](docs/design.md) shows the system on screen: each surface, the full motion table, the sound cues, demo mode and how to check a change.

## Rules

1. **Hue and the attention cadences belong to state.** Nothing idles for decoration in the chrome: no hopping, confetti, staggered list fades or press-down buttons. The bridge's ambient life (the holo course plot turning over the table with dashes running along it, its heading band, the stations' readouts, scan lines and blinkers, the data pulses to the table, the ticker over the strip, the holo's star map, and space outside the glass: stars streaming past, the sky turning, a meteor every 20 to 40 s, a planet, an asteroid field or a comet now and then, and the world outside that moves only with real work: the mission's destination ahead, the sister decks' escorts and a fighter per working unit; and the crew: the bridge droid's errands and rounds, the unit of the watch's hologram) is achromatic or ship-cyan (the one exception: a sister deck's needs-you diamond, which is the real state), slow (a period of 4 s or more, or a steady drift), never at a state's cadence, and stops under reduced motion or Ship motion at Off (Settings > Bridge). What moves with a unit's real work (its ship-cyan band, visor and floor halo, its hands at the console, its small bob, the motes off its screen, its station's bars) says it is alive and at work, and only a working unit has it; ship-cyan is the quiet working state's accent, never an attention state's. Settings > Bridge > Life sets how much of it there is: Full, Calm (no gestures) or Silent running (no ambient life, the stars at a crawl). Humour lives in words only (VESPER, the ship's mind, and the crew's epithets), never in colour or noise, and it stops the moment a unit needs you. Ambient life stays off to the side of what you read, and it gives way: for a few seconds when a unit starts needing you or gets stuck, in that unit's pod for as long as it lasts, and a little everywhere while anyone is waiting on you. The camera never moves for it, but for the cinema's few shots (docs/design.md, The cinema): the arrival on load, a tenth of a degree of breathing at the conn after 4 s idle, and the framing of a merge and of the jump, each gone on any input and never while a unit needs you. Its one tie to the deck is speed: the ship makes way faster with each merge in the last hour and holds station with no unit deployed. A ring pulse and a soft column of orange light say "needs you", the bridge's 1.2 s sweep says "a pull request merged", a 120 ms fade plus 4px rise says "this just opened", a violet pulse up the Proof corner's rail says "a merge was paid". Under `prefers-reduced-motion`, or Ship motion at Off, every pulse becomes a still outline, every glide and flight a cut, and every CSS animation is stopped by one rule at the end of `tokens.css`. The same goes for sound: four short cues, one per change worth hearing, off until you turn them on.
2. **Hue is for exceptions.** The floor is slate and steel. Signal orange means a person is needed, red means stuck, amber means waiting for review, violet means on-chain proof. Working units stay achromatic.
3. **Shape carries every state on its own.** Each state has a glyph (below), so the screen still reads in grayscale, for color-blind people and in compressed video.
4. **One ranking.** `src/shared/attention.ts` decides who needs someone. The top-bar counters, the Units rail, Mission control, the 2D view, the Attention board, the tab title and the favicon all read it, so they never disagree. Rows say it the same way everywhere (`src/shared/rowtext.ts`): one title with its [tag] as a chip, one status phrase with no time in it, and one relative time ('<1m', '4m', '2h').
5. **Lines, not boxes of shadow.** 1px hairlines, 4px corners (2px on chips), surfaces that step by tone. Only HUD pieces floating over the 3D canvas get the 85% fill and one soft shadow.
6. **Data is mono.** Counts, timers, call signs, hashes, amounts, branch names and keys are JetBrains Mono with tabular numerals. Words are Archivo.

## Color

| Token | Dark (default) | Print | Use |
| --- | --- | --- | --- |
| `--void` | `#0D131A` | `#F4F6F8` | page and scene background |
| `--surface-1` | `#141B23` | `#FFFFFF` | panels, modals |
| `--surface-2` | `#1A222C` | `#EEF1F4` | raised: buttons, cards |
| `--surface-3` | `#212A35` | `#E3E8ED` | hover and selected |
| `--line` / `--line-strong` | `#26313D` / `#3A4756` | `#D5DBE1` / `#B4BEC8` | hairlines |
| `--text` / `--muted` | `#E8ECEF` / `#8A97A5` | `#0D131A` / `#56616D` | text |
| `--signal` | `#FF6A1A` | `#C2410C` | needs you, and the one primary button per view |
| `--stuck` | `#FF4D5E` | `#C01F33` | stuck or failed, always with the triangle |
| `--review` | `#F5C542` | `#8A5A00` | to review |
| `--working` | `#C9D2DC` | `#56616D` | working, quiet |
| `--proof` | `#A68BFF` | `#5B3FD1` | escrow, EAS, ERC-8004, x402, `/pom/` only |
| `--settled` | `#3DDC97` | `#0F7A4F` | the small "settled on devnet" tick, never a fill |

The 3D deck uses the same ramp by Night (`DECK` in `src/client/world/office/materials.ts`): floor `#1C2430` with grid lines `#2C3744` every meter and `#3A4858` every five, walls `#1C2530`, consoles `#26303C` with tops `#2E3946`, units `#333D49`; the bridge's hull `#1C2530` with seams `#2A3644`, instrument black `#0B1219` under its screens, and ship-cyan `#6FC3DF` (`#2C5E70` where it lights an area) for its instruments and for units at work, never for an attention state. Command has two accents of its own, never a state's: brass `#9C8255` for the rails round the dais and the amphitheatre and the captain's chair's fittings, and conn gold `#D9B36C` for the dais's lip, the chair's piping and its underlight, nowhere else. The amphitheatre's tiers are laid with the floor, with risers in console graphite and a ship-cyan lip along each nosing. The red and green running lights on the hull are drawn only for the Overview's camera, never seen from the deck. Every surface is matte (roughness about 0.85, almost no metal), flat-shaded on consoles, with contact shadows under what stands on the floor and lit hairlines on the edges that carry a silhouette in a dark frame. The canvases on the boards use the same tokens (`PANEL` in `features/boards/world.ts`), with one lighter muted, `#A9B4C0`, for their second lines and counts so they hold up from across the deck (`INK` and the shared title bar and rows in `features/boards/screen.ts`). Where things are on the deck is [docs/deck.md](docs/deck.md).

**Bridge lights.** The 3D deck has a Night (low light) and a Day (high light) palette, and the page follows it: Night is the dark column above, Day the print column (Settings > Bridge, or Auto to follow the system). By day the floor is `#A9B4C0`, walls and hull `#C4CDD7`, consoles darker than by night (`#1E2630`, tops `#2A3440`) and units keep their graphite; lettering on walls and floor turns dark (`DAY_PALETTE` and `DAY_INK` in `src/client/features/lights/modes.ts`). Two rules hold in both: an attention mark never sits on a light or mid-tone surface, but on instrument black of its own (a `#101720` disc under every unit's ring, a 92% `#0D131A` chip under every callout), which keeps every state at 4.5:1 or better (`tests/lights.test.ts`); and the room never tints with a state. Brightness turns the lights, not the exposure, so what gives its own light (boards, callouts, marks) reads the same at every step.

Each hue also has a `-tint` (12% over the surface) for a row or chip background. Every state color passes WCAG AA for text on `--void` and `--surface-1`; `--stuck` on `--surface-3` is 4.47:1, so stuck text sits on the lower surfaces.

## Status language

| State | Glyph | Hue | Where it shows |
| --- | --- | --- | --- |
| Needs you | solid diamond | `--signal` | counters, toasts, Units rail, Mission control, unit band and ring, edge chevrons, favicon |
| Stuck | hollow triangle with a bar | `--stuck` | counters, Mission control, unit band (blinks 0.5 Hz), hatched ring, slumped unit |
| To review | hollow circle with a center dot | `--review` | counters, Review tab, status chips, unit band and ring |
| Working | short steel bar | `--working` | counters, chips; no glyph on the 3D unit |
| Parked | dim dot | `--muted` | chips |
| Merged | check in a square | `--proof` | proof counter, proof toasts, PR state, the unit for 6 s after its PR merges |

The glyphs are in `src/client/ui/icons.ts` (`LEVEL_ICON`), drawn on canvas for the 3D deck by `src/client/world/glyphs.ts` (the units' glyphs and callouts and the Attention board), and as CSS masks in `styles/base.css` (`.g-needs-you` and friends) for markup that only has a class.

## Type

- **Archivo**, variable width and weight: UI text at 400 to 600, and display at 118% width for the wordmark, modal headers and section labels (uppercase, letter-spaced).
- **JetBrains Mono** 400 to 500: data only.
- Both are OFL, vendored as Latin and Latin Extended woff2 subsets in `src/client/styles/fonts/` with their licenses beside them. No font comes from a CDN.

## Icons

`src/client/ui/icons.ts` holds about 70 glyphs on a 24 grid: 1.75px strokes, square caps, mitred joins, `currentColor`, filled only when active. `icon(name)` returns an element; `iconSvg(name)` returns markup. Emoji are not used in the chrome.

## The mark

The Formation mark is three chevrons in an upward V: the lead one solid with a 2px alignment notch, the two trailing ones 2.5px outlines. The wordmark is "UGC ARMY" in Archivo at 118% width, 600, +6% tracking, with ARMY muted. The favicon is the mark in light on void; its lead chevron turns Signal orange while anything needs you (`setFaviconAlert` in `ui/brand.ts`). The `/pom/` variant has a violet lead chevron.

Upstream credit stays where it was and is added to the sign-in footer: "Built on agent-office (AgentSystemLabs / webdevcody), MIT", the party the LICENSE names first.

## Components

- **Top bar** (44px): the one attention surface. Mark and wordmark, the deck name (click for decks), the counters in fixed widths (each a button into Mission control; the needs-you one pulses three times when a toast folds into it), the violet proof counter once bounties are on, then Mission control, the actions you pinned, the Units button and the menu.
- **Units rail**: full height down the left, the units grouped by state (needs you, stuck and to review open; working, ready and the board agents folded), each row a call sign, a name, one status phrase and one time, its state a 2px rule. It folds to a 56px strip of call signs and glyphs, and folds by itself for a merge beat. On a phone it is a bottom sheet.
- **Bottom bar**: the mission strip (a target and *Set the mission* while there is none, else the statement and the milestone's ten ticks), the keys worth knowing (*Click to look around* only while a click would take the view, N, G, Tab) and the chat folded to a *T Chat* chip.
- **Menu**: grouped by the deck's jobs: Command, Work, Proof and Deck, with Comms (voice, screen, the planning board, the Review bay) folded at the bottom and the HUD layers as chips. A row can carry a second line in muted text for what it is set to now (Quality: *Auto - running at High*) and one outlined Signal button for a one-click fix (*Try High*); clicking either closes the menu back to mouse-look.
- **Live status chip** (Settings > Bridge > Quality): a ruled `--surface-2` strip under a setting's choices with a three-bar meter in `--text` over `--line-strong`, filled to the tier drawn now, the state in words and the last change in muted text. A meter, never a hue: hues stay with what a unit is doing.
- **Modals**: a sharp card on `--surface-1` with a 1px line; a 2px Signal rule on top only when it blocks. A ✕ top right with a 28px hit area. Esc or ✕ returns straight to mouse-look.
- **Toasts**: one stack, top right under the bar, one card: a glyph column, a 3px stripe in the state's color, one sentence naming the unit by its address, and the time in mono from the shared clock. A unit that starts asking is a toast that folds into the needs-you counter after a few seconds. A proof toast adds the hash in a violet chip, a settled tick and an explorer link.
- **Units in lists**: named by their call sign in a mono chip (`ui/unitsign.ts`), never by a color.
- **Buttons**: primary is filled Signal with void text, one per view; secondary is a 1px outline; hover is one tone step. Focus is a 2px Signal ring with a 2px offset.
- **Terminal**: xterm on `--void`, flat 32px tabs with a 2px underline, the status hues as ANSI colors, Signal only for the cursor.

## Surfaces outside the deck

- **The 2D view** (`/lite`): the same top bar and counters, then the Plot (`src/client/shared/plot.ts`), the deck drawn as a plan in hairlines from `src/shared/layout.ts` so it never drifts from the 3D deck, beside the ranked list of units. Each row leads with its state glyph and its address in mono (*A-03 at C2*). Below 720px the plan folds away and the list is the page. The contrast button gives the light whiteprint; until someone picks, it follows the system.
- **Sign-in pages** (login, join, claim): the void, the Plot drawn once on the right with one unit lit Signal orange on the ready line, a 360px card with the mark, one field and *Enter deck*, and the credit in the footer.
- **Loading**: the chevrons fill from the bottom over 900 ms in a ruled card over the deck's grid.
- **`/pom/`, the Proof ledger**: violet is the only accent. Totals in Archivo at 125% width, each with a *verify* link; the *Last merge* panel with the proof rail and the four-step money path; a render of the real deck; dense ruled rows with violet proof chips (short hash, settled tick). The share card (`og.png`) is the same title block, drawn in a pixel font with no dependencies.

## Demo mode

`?demo=1` makes the chrome a fifth bigger (about 15px at the smallest), callouts and glyphs a quarter bigger, keeps the needs-you toast up, turns the Overview slowly round the table and adds a light bloom. See [docs/design.md](docs/design.md#demo-mode).

## Voice

Calm ops voice: units, deploy, stand down, on deck, decks. Verb plus object on buttons ("Approve payout", "Enter deck"). No exclamation marks, no emoji, at most one military-adjacent word per screen, and never war, attack, kill or troops. Selection is a bracket, never a reticle.
