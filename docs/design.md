# Design system

Back to the [README](../README.md).

UGC Army looks and behaves the same on every surface: the 3D deck, the 2D view at `/lite`, the sign-in pages and the `/pom/` showcase. This page walks through it as it is on screen: what each surface shows, how things move and sound, demo mode, and how to check a change. The rules and tokens themselves (colors, type, the status table, voice) are the short contract in [DESIGN.md](../DESIGN.md); where the deck's places are is [The deck](deck.md).

## The idea in one paragraph

The deck is calm by default. Floors, consoles and units are slate and steel, and only an exception carries hue: Signal orange when a unit needs a person, red when it is stuck, amber when its work waits for review, violet for proof on chain. Every state also has its own shape (a solid diamond, a hollow triangle with a bar, a hollow circle with a dot), so the screen still reads in grayscale, for color-blind people and in compressed video. One ranking, `src/shared/attention.ts`, decides who needs someone, and everything that counts or orders units reads it: the top bar, the toasts, the Attention board, the Units rail, the 2D plan, the favicon and the lights over the units.

## The surfaces

![The whole deck from the Overview: pods round the mission table, two units on the ready line with orange light over them](img/deck-overview.png)

The Overview (G) is the demo shot: the whole deck from above with no perspective. Units that need you stand on their pod's ready line with a shaft of orange light over them; a stuck unit has a red triangle and a hatched ring; units at work have no glyph at all. Callouts that would cover each other stack clear, the units that need someone placed first.

![Close on pod A in Walk: two units that need you, each with its callout, ring and band](img/units-a.png)

In Walk (first person, the default) callouts show more as you get closer: from across the deck the call sign and name, near a unit its task and how long it has been in its state.

![Mission control's Attention tab: needs you, stuck, to review and working, each row with its call sign chip and one next step](img/mission.png)

Mission control (I) lists units by the same ranking, each row with its call sign in a mono chip, why it is there in plain words and one primary verb. Units are never told apart by color: hue is for state.

![The 2D view: the deck plan drawn from the layout beside the ranked list](img/lite.png)

The 2D view at `/lite` draws the deck as a plan from the same layout file as the 3D deck, beside the ranked list. Below 720px wide the plan folds away and the list is the page.

![Toasts: a violet proof toast with its transaction hash and a settled tick, then stuck, review and plain ones](img/toasts.png)

Toasts stack top right under the bar, all one card: a glyph column and a stripe in the state's color, one sentence that names the unit by its address (`Widget (B-02 at F2)`), and the time in mono from the deck's one clock. A unit that starts asking is a toast too, which folds into the top bar's needs-you counter after a few seconds. A proof toast adds the transaction or attestation id in a violet chip, a green settled tick and a link to the testnet explorer, and stays up longer so there is time to click it.

## Motion

Motion only marks a change of state. Nothing bobs, idles or celebrates for decoration, and every motion has a reduced-motion form. The UI uses one curve, `--ease` (`cubic-bezier(.2, 0, 0, 1)`), and three lengths in `tokens.css`: `--t-ui` 120 ms, `--t-pulse` 1.2 s and `--t-flight` 700 ms.

| Moment | What moves | How long | Under reduced motion |
| --- | --- | --- | --- |
| A window or toast opens | fades in and rises 4px | 120 ms | appears |
| A count on the top bar changes | the number rolls in from the way it moved | 120 ms, once | changes |
| A unit starts to need you | its ring pulses (scale 1 to 1.35, fading out), it glides to its tick on the ready line, the edge of the screen flashes | pulse every 1.2 s, glide 0.6 to 1.5 s | a still ring, a cut |
| A unit is stuck | its band blinks, its hatch fades in | 0.5 Hz, 200 ms | a steady band |
| A unit works | its visor brightens as its terminal prints | follows the output | the same: it is a reading, not a decoration |
| A unit is deployed | a light runs from the mission table out to its console | 400 ms | nothing runs; the unit appears |
| A pull request merges (the merge beat) | a violet pulse from the unit's console to the table, whose rim lights | 300 ms, rim 800 ms | nothing runs |
| A bounty is released on devnet | the pulse runs on to the Proof corner and up the rail, parks as the new lit segment, the vault lid lifts, then the proof toast | 600 ms, lid 2.4 s | the segment and lid change at once, then the toast |
| A unit gets an ERC-8004 record | the plinth glows violet as its step lights | 1.2 s | the step lights |
| You go to a unit (N, a toast, search) | in Walk the view flies there in an arc; in the Overview it pans and zooms | 700 ms; 300 ms | a cut |
| The Overview turns (Q / E) | a quarter turn | 280 ms | a cut |

![The merge beat on its way: the violet pulse at the foot of the Proof corner's rail](img/beat-climb.png)

The merge beat is the one celebration, and the moment to record for a video: the pulse leaves the table, crosses to the west wall and climbs the rail.

![The merge beat landed: a new lit segment on the rail, the vault lid up and the proof toast](img/beat-landed.png)

Once it parks, the rail has one more lit segment (the rail is a tally that grows), the vault's lid is up with a violet glow, the top bar's violet counter has rolled, and the proof toast shows the devnet transaction. The camera never moves for a beat.

The beats live in `src/client/features/beats/` (paths and timings in `logic.ts`, tested in `tests/motion.test.ts`), the flight in `src/client/core/flight.ts`, the callout stacking in `src/client/features/workers/declutter.ts`, and the CSS reduced-motion rule at the end of `src/client/styles/tokens.css`.

## Sound

The deck makes no sound of its own: no room tone, typing or footsteps. There are four short cues, synthesized in `src/client/sound/alerts.ts`, and all of them are off until you turn them on in Settings (Sound cues).

| Cue | When | What you hear |
| --- | --- | --- |
| Needs you | a unit on your deck stops to ask something or wants a permission | 880 then 1320 Hz, 60 ms each; the reminder is the same, softer |
| Stuck | a unit on your deck gets stuck | two low 330 Hz ticks |
| Review ready | a unit finishes and its work waits for you | one soft 660 Hz tone |
| Merged and proven | a proof-of-merge attestation lands | a low thunk and a high tick |

## Demo mode

Open the deck with `?demo=1` for a screen share, a projector or a recording. It holds for the tab until `?demo=0`.

![Demo mode: bigger chrome and callouts, the Overview turning round the table](img/demo.png)

- The chrome is a fifth bigger, so the smallest type is about 15px, and unit callouts and glyphs are a quarter bigger.
- The needs-you toast stays up while anyone needs you.
- Once you're in, the Overview turns slowly round the mission table. Any key, drag or wheel takes over.
- Lit edges, screens and state lights bloom a little (0.4), so they survive video compression. The bloom is loaded only in demo mode.

## Focus and keyboard

Every control can be reached by keyboard, and focus is always a 2px Signal ring with a 2px offset (inset on rows and tabs that fill their container). Every window has a close button top right with a 28px target; Esc or the close button puts you straight back into mouse-look in Walk, or back in the Overview if you opened it from there, with no extra click.

## Checking a change

- `npm run typecheck`, `npm test` and `npm run build` must all pass with clean output.
- `node design/shoot.mjs <folder> [shot,shot]` (after `npm run build`) starts the office on a spare port with a throwaway home, password and project, deploys a few stand-in units that report fake states, and saves screenshots under `design/shots/<folder>/`: the deck from fixed vantages, the Overview, the merge beat, demo mode, Mission control, the palette, settings, toasts, the 2D view at three widths and in print, and a terminal. It always stops the office afterwards. The before and after shots of each design stage are kept there.
- Status colors are checked for contrast on `--void` and `--surface-1` (see the table in DESIGN.md), and every state has a shape, so a grayscale or color-blind view still reads.
- `prefers-reduced-motion` in the browser's dev tools should leave nothing moving except a spinner.
