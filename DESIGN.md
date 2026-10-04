# UGC Army design system

Back to the [README](README.md).

UGC Army is an operations deck for teams running many AI coding agents. The screen is calm by default and only an exception carries color, so the eye goes straight to what needs a person. This page is the contract for every surface: the 3D deck, the 2D view at `/lite`, the sign-in pages and the `/pom/` showcase.

The tokens live in `src/client/styles/tokens.css`. Every sheet uses them by name; a hex value in a module sheet is a bug. [docs/design.md](docs/design.md) shows the system on screen: each surface, the full motion table, the sound cues, demo mode and how to check a change.

## Rules

1. **Motion only marks a change of state.** Nothing idles for decoration: no bobbing, hopping, confetti, staggered list fades or press-down buttons. A ring pulse says "needs you", a 120 ms fade plus 4px rise says "this just opened", a violet pulse up the Proof corner's rail says "a merge was paid". Under `prefers-reduced-motion` every pulse becomes a still outline, every glide and flight a cut, and every CSS animation is stopped by one rule at the end of `tokens.css`. The same goes for sound: four short cues, one per change worth hearing, off until you turn them on.
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

The 3D deck uses the same ramp (`DECK` in `src/client/world/office/materials.ts`): floor `#18202A` with grid lines `#222B36` every meter and `#2E3B4A` every five, walls `#151D26`, consoles `#1A222C` with tops `#212A35`, units `#2A323C`. Every surface is matte (roughness about 0.85, almost no metal), flat-shaded on consoles, with contact shadows under what stands on the floor and lit hairlines on the edges that carry a silhouette in a dark frame. The canvases on the boards use the same tokens (`PANEL` in `features/boards/world.ts`). Where things are on the deck is [docs/deck.md](docs/deck.md).

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
- **Menu**: grouped by the deck's jobs: Command, Work, Proof and Deck, with Comms (voice, screen, the planning board, the Review bay) folded at the bottom and the HUD layers as chips.
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
