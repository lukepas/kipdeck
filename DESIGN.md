# UGC Army design system

Back to the [README](README.md).

UGC Army is an operations deck for teams running many AI coding agents. The screen is calm by default and only an exception carries color, so the eye goes straight to what needs a person. This page is the contract for every surface: the 3D deck, the 2D view at `/lite`, the sign-in pages and the `/pom/` showcase.

The tokens live in `src/client/styles/tokens.css`. Every sheet uses them by name; a hex value in a module sheet is a bug.

## Rules

1. **Motion only marks a change of state.** Nothing idles for decoration: no bobbing, hopping, confetti, staggered list fades or press-down buttons. A ring pulse says "needs you", a 120 ms fade plus 4px rise says "this just opened". Under `prefers-reduced-motion` every pulse becomes a still outline and every glide a cut.
2. **Hue is for exceptions.** The floor is slate and steel. Signal orange means a person is needed, red means stuck, amber means waiting for review, violet means on-chain proof. Working units stay achromatic.
3. **Shape carries every state on its own.** Each state has a glyph (below), so the screen still reads in grayscale, for color-blind people and in compressed video.
4. **One ranking.** `src/shared/attention.ts` decides who needs someone. The top-bar counters, the alert row, Mission control, the 2D view, the tab title and the favicon all read it, so they never disagree.
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

Each hue also has a `-tint` (12% over the surface) for a row or chip background. Every state color passes WCAG AA for text on `--void` and `--surface-1`; `--stuck` on `--surface-3` is 4.47:1, so stuck text sits on the lower surfaces.

## Status language

| State | Glyph | Hue | Where it shows |
| --- | --- | --- | --- |
| Needs you | solid diamond | `--signal` | counters, alert row, Mission control, unit band and ring, edge chevrons, favicon |
| Stuck | hollow triangle with a bar | `--stuck` | counters, Mission control, unit band (blinks 0.5 Hz) |
| To review | hollow circle with a center dot | `--review` | counters, Review tab, status chips |
| Working | short steel bar | `--working` | counters, chips; no glyph on the 3D unit |
| Parked | dim dot | `--muted` | chips |
| Merged | check in a square | `--proof` | proof counter, proof toasts, PR state |

The glyphs are in `src/client/ui/icons.ts` (`LEVEL_ICON`), and as CSS masks in `styles/base.css` (`.g-needs-you` and friends) for markup that only has a class.

## Type

- **Archivo**, variable width and weight: UI text at 400 to 600, and display at 118% width for the wordmark, modal headers and section labels (uppercase, letter-spaced).
- **JetBrains Mono** 400 to 500: data only.
- Both are OFL, vendored as Latin and Latin Extended woff2 subsets in `src/client/styles/fonts/` with their licenses beside them. No font comes from a CDN.

## Icons

`src/client/ui/icons.ts` holds about 70 glyphs on a 24 grid: 1.75px strokes, square caps, mitred joins, `currentColor`, filled only when active. `icon(name)` returns an element; `iconSvg(name)` returns markup. Emoji are not used in the chrome.

## The mark

The Formation mark is three chevrons in an upward V: the lead one solid with a 2px alignment notch, the two trailing ones 2.5px outlines. The wordmark is "UGC ARMY" in Archivo at 118% width, 600, +6% tracking, with ARMY muted. The favicon is the mark in light on void; its lead chevron turns Signal orange while anything needs you (`setFaviconAlert` in `ui/brand.ts`). The `/pom/` variant has a violet lead chevron.

Upstream credit stays where it was and is added to the sign-in footer: "Built on agent-office by webdevcody - MIT".

## Components

- **Top bar** (44px): mark and wordmark, the deck name (click for decks), the counters (each a button into Mission control), the violet proof counter once bounties are on, then Mission control and the actions you pinned, and the menu.
- **Alert row**: under the bar while a unit needs you, one sentence, `N` to go there, a ✕ to put it away.
- **Modals**: a sharp card on `--surface-1` with a 1px line; a 2px Signal rule on top only when it blocks. A ✕ top right with a 28px hit area. Esc or ✕ returns straight to mouse-look.
- **Toasts**: bottom right, a 3px stripe in the state's color and its glyph, one sentence.
- **Buttons**: primary is filled Signal with void text, one per view; secondary is a 1px outline; hover is one tone step. Focus is a 2px Signal ring with a 2px offset.
- **Terminal**: xterm on `--void`, flat 32px tabs with a 2px underline, the status hues as ANSI colors, Signal only for the cursor.

## Voice

Calm ops voice: units, deploy, stand down, on deck, decks. Verb plus object on buttons ("Approve payout", "Enter deck"). No exclamation marks, no emoji, at most one military-adjacent word per screen, and never war, attack, kill or troops. Selection is a bracket, never a reticle.
