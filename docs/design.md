# Design system

Back to the [README](../README.md).

UGC Army looks and behaves the same on every surface: the 3D deck, the 2D view at `/lite`, the sign-in pages and the `/pom/` showcase. This page walks through it as it is on screen: what each surface shows, how things move and sound, demo mode, and how to check a change. The rules and tokens themselves (colors, type, the status table, voice) are the short contract in [DESIGN.md](../DESIGN.md); where the deck's places are is [The deck](deck.md).

## The idea in one paragraph

The deck is calm by default. Floors, consoles and units are slate and steel, and only an exception carries hue: Signal orange when a unit needs a person, red when it is stuck, amber when its work waits for review, violet for proof on chain. Every state also has its own shape (a solid diamond, a hollow triangle with a bar, a hollow circle with a dot), so the screen still reads in grayscale, for color-blind people and in compressed video. One ranking, `src/shared/attention.ts`, decides who needs someone, and everything that counts or orders units reads it: the top bar, the toasts, the Attention board, the Units rail, the 2D plan, the favicon and the lights over the units.

## The surfaces

![The whole deck from the Overview: pods round the mission table, two units on the ready line with orange light over them](img/deck-overview.png)

The Overview (G) is the demo shot: the whole deck from above with no perspective. Units that need you stand on their pod's ready line with a soft column of orange light over them and a wave spreading across the floor from them; a stuck unit has a red triangle and a hatched ring; units at work wear ship-cyan (band, visor and a halo on the floor) and have no glyph. From the Overview, the callouts of units that need you or are stuck are drawn half again as big. Callouts that would cover each other stack clear, the units that need someone placed first, with a hairline back to the unit when one is lifted, and a callout that would run off the side of the view or under the Units rail slides back in. Arrows at the edge of the screen point to units out of view that need you, are stuck or are to review, in that order; a crowded edge drops the ones to review first.

![Close on pod A in Walk: two units that need you, each with its callout, ring and band](img/units-a.png)

In Walk (first person, the default) callouts show more as you get closer: from across the deck the call sign and name, near a unit its task and how long it has been in its state.

![Mission control's Attention tab: needs you, stuck, to review and working, each row with its call sign chip and one next step](img/mission.png)

Mission control (I) lists units by the same ranking, each row with its call sign in a mono chip, why it is there in plain words and one primary verb. Units are never told apart by color: hue is for state.

![The 2D view: the deck plan drawn from the layout beside the ranked list](img/lite.png)

The 2D view at `/lite` draws the deck as a plan from the same layout file as the 3D deck, beside the ranked list. Below 720px wide the plan folds away and the list is the page.

Settings > Bridge > Bridge lights sets Night (low light, for watching in a dark room) or Day (high light, a cool mid-grey ship rather than a white room) for the 3D deck, or Auto to follow the system. The same setting paints the HUD (the dark set by night, the print set by day), the 2D view, whose contrast button flips it, and the sign-in pages, so every surface of the office agrees. Brightness steps the 3D deck's lights two steps either way. See [the deck](deck.md#light-and-materials).

![Toasts: a violet proof toast with its transaction hash and a settled tick, then stuck, review and plain ones](img/toasts.png)

Toasts stack top right under the bar, all one card: a glyph column and a stripe in the state's color, one sentence that names the unit by its address (`Widget (B-02 at F2)`), and the time in mono from the deck's one clock. A unit that starts asking is a toast too, which folds into the top bar's needs-you counter after a few seconds. A proof toast adds the transaction or attestation id in a violet chip, a green settled tick and a link to the testnet explorer, and stays up longer so there is time to click it.

## Motion

Motion marks a change of state, and hue and the attention cadences belong to state alone. The bridge's ambient life (the units' work, the stations, the holo, space outside) is achromatic or ship-cyan, slow, keeps off to the side of what you read, gives way when a unit needs you or is stuck, and stops under reduced motion or Ship motion at Off (DESIGN.md, rule 1). Every motion has a reduced-motion form, and Settings > Bridge > Ship motion (Full, Calm, Off) is the in-app switch: Calm halves space and drops its streaks, flybys and meteors, Off stills everything as the system's reduce-motion setting does. Nothing in space plays while the tab is hidden, so coming back is never met by a flourish out of nowhere. Settings > Bridge > Life sets how much the bridge lives: Full; Calm, which drops the gestures (salutes, hail lines, patrols); or Silent running, which stops all ambient life, slows the stars to a crawl and pauses the ticker, while every attention state keeps its full strength. Each part of the world outside (the destination, the fleet, the squadron) has its own switch there too. The UI uses one curve, `--ease` (`cubic-bezier(.2, 0, 0, 1)`), and three lengths in `tokens.css`: `--t-ui` 120 ms, `--t-pulse` 1.2 s and `--t-flight` 700 ms.

| Moment | What moves | How long | Under reduced motion |
| --- | --- | --- | --- |
| A window or toast opens | fades in and rises 4px | 120 ms | appears |
| A count on the top bar changes | the number rolls in from the way it moved | 120 ms, once | changes |
| A unit starts to need you | its ring pulses (scale 1 to 1.35, fading out), it glides to its tick on the ready line, the edge of the screen flashes | pulse every 1.2 s, glide 0.6 to 1.5 s | a still ring, a cut |
| A unit is stuck | its band blinks, its hatch fades in | 0.5 Hz, 200 ms | a steady band |
| A unit works | its visor brightens as its terminal prints | follows the output | the same: it is a reading, not a decoration |
| A unit is deployed | a light runs from the mission table out to its console | 400 ms | nothing runs; the unit appears |
| A pull request merges (the merge beat) | a violet pulse from the unit's console to the table, whose rim lights; then a ring of violet light sweeps out across the floor, the Pull requests board flashes green, a ring rises off the unit's console and every lit line on the bridge swells | 300 ms, rim 800 ms, the sweep 1.2 s | the board and the lines hold a colour for 1.2 s |
| A bounty is released on devnet | the pulse runs on to the Proof corner and up the rail, parks as the new lit segment, the vault lid lifts, then the proof toast | 600 ms, lid 2.4 s | the segment and lid change at once, then the toast |
| A unit gets an ERC-8004 record | the plinth glows violet as its step lights | 1.2 s | the step lights |
| You go to a unit (N, a toast, search) | in Walk the view flies there in an arc; in the Overview it pans and zooms | 700 ms; 300 ms | a cut |
| The Overview turns (Q / E) | a quarter turn | 280 ms | a cut |
| The bridge, always | the holo course plot turns over the mission table, in ship-cyan, with a small star map turning over it in a cone of scanlined light, dashes run along its course to the ship, and its heading band turns the other way; the ticker over the strip runs the deck's log and its clock ticks | half a turn a minute; a dash's run 5 s; the band a turn in 150 s; the log its width in 70 s; the clock each second | still (the clock still tells the time) |
| A unit works, at its station | its hands stay at the console and work it harder while its terminal prints, its head bobs a little, its ship-cyan halo breathes faster as it gets busier, motes of cyan rise off its screen; its station's bars scroll and grow with the output, a scan line passes, three blinkers twinkle | follows the output; the scan every 6 s; blinkers every 4.3, 6.1 and 8.9 s | the hands rest; the bars hold still at their height |
| A busy station | a data pulse in a low ship-cyan arc from its hood to the holo table | 1.6 s, every 1.8 to 6 s by how busy | none |
| A unit needs you | a soft column of orange light over it with scanlines climbing it, a wave spreading on the floor; a third as strong with the camera close | scanlines 0.9 Hz, a wave every 1.6 s | a still column and one still ring |
| A unit starts needing you or gets stuck | the bridge's ambient life dims to 40%; that pod's stations stay hushed while it lasts; a quarter quieter everywhere while anyone waits on you | 3 s, then for as long as it lasts | (already still) |
| Space, always | three layers of stars stream past the glass, the sky turns, the drive glow breathes | the ship's speed (0.4x to 1.6x by merges in the last hour, 0.15x holding station), the sky 0.6 degrees a minute, the glow every 8 s | still |
| Now and then | a planet or moon (clouds, a lit limb, a ring round a gas giant) across a side port, an asteroid field tumbling past, or a comet across the forward glass; never during a beat, waiting while a unit has just started needing you | every 6 to 10 minutes; 90 to 180 s, 40 s, 25 s | none (Calm has none either) |
| Often | a meteor streaks across the sky | every 20 to 40 s, 0.7 s each | none (Calm has none either) |
| A pull request merges | the surge: the stars speed up to 12x and streak (half that while you walk), the glass glints ship-cyan | 1.4 s, at most one in 20 s | nothing; Calm keeps only the glint |
| A milestone is done (a waypoint) | the jump: the stars stretch toward the bow, the view widens 4 degrees, the room's light leans cool, a white-cyan glint comes up over the glass (a third by Night, half by Day, added to the sky so its stars still show), the ship comes out in new space and the light leans warm before settling | 2.4 s; the glint up in 90 ms and off over 210 ms | the new space crossfades in over 400 ms, Calm too |
| The hull, from outside | red and green running lights breathe, white strobes double-flash at the bow and the nacelles | 2.4 s; every 1.8 s | steady |
| The destination ahead, on real progress (a waypoint passed, an issue closed on the open one) | the mission's world dead ahead in the canopy grows toward a third of the view; still otherwise | eased over 4 s | a cut to the new size |
| Every waypoint passed (the arrival, waiting behind anyone who needs you) | the ship drops into orbit: the world fills the canopy, the band says MISSION COMPLETE | 30 s, once | a 400 ms crossfade and a card |
| The fleet, always | each sister deck's escort bobs in its slot off the side ports, its drives pushing by the share of its units at work | a period of 6 to 12 s | still |
| A sister deck merges | its escort eases a ship-length ahead, then drifts back to its slot | 1.4 s ahead, back by 20 s | none |
| A sister deck reaches a waypoint | its running lights blink twice (a salute), a hail line in the canopy's corner | 0.84 s; the line 6 s | the line only |
| A sister deck's clone finishes | its escort, built plate by plate in a slip while it cloned, drops out of hyperspace into its slot | 1.2 s | it is in its slot |
| A unit works | its fighter patrols past its pod's side port, its engine ship-cyan, quicker and brighter the busier it is | a loop every 8 to 14 s | still |
| A unit's pull request opens, or closes unmerged | its fighter peels to the picket ahead of the bow, or back to patrol | 3 s | a cut |
| A unit's pull request merges | its fighter runs home over the canopy trailing ship-cyan and lands as the merge beat fires | 300 ms, the trail 1.2 s | it is home |
| A unit needs you or is stuck | its fighter cuts its engine and drifts dark outside the glass; the escorts hold still, salutes and hails are dropped | for as long as it lasts | (already still) |

![The merge beat on its way: the violet pulse at the foot of the Proof corner's rail](img/beat-climb.png)

The merge beat is the one celebration, and the moment to record for a video: the bridge marks the merge across the deck, then the pulse leaves the table, crosses to the west wall and climbs the rail.

![The merge beat landed: a new lit segment on the rail, the vault lid up and the proof toast](img/beat-landed.png)

Once it parks, the rail has one more lit segment (the rail is a tally that grows), the vault's lid is up with a violet glow, the top bar's violet counter has rolled, and the proof toast shows the devnet transaction. The camera never moves for a beat.

### The world outside

The bridge sits in a world that moves with the work, and only with the work: nothing out there runs on a timer of its own or celebrates at random.

- **The destination ahead** (`src/client/features/destination/`): the mission as a world dead ahead in the canopy, a rocky world, a ringed giant or a station, the same one for the same mission. It is a bright point until there is progress, and grows only with real progress (waypoints passed, plus the open waypoint's issues closed of those linked) to a third of the forward view, eased over 4 s. A mono band under it says "MAKING FOR AUTH REWRITE - WAYPOINT 2 OF 4 - 35%", with "BEHIND SCHEDULE: 4 DAYS" in plain words, no hue, while the waypoint is overdue, when it stops growing. Waypoints passed are small markers astern. With every waypoint passed, the ship drops into orbit and holds there until a new mission is set. With no mission, a dim unnamed star, and the strip's own *Set the mission*.
- **The fleet in formation** (`src/client/features/fleet/`): every other deck as an escort in a V off the side ports (one rank at a seated eye's height, the next high over the walls, so it shows through the canopy). A corvette for up to three units, a frigate to eight, a cruiser past that; one port lit per unit at work, drives by the share at work, its repository's name on its flank. A deck being cloned is built plate by plate in a slip. A deck with a unit that needs you carries the deck's own needs-you diamond over its bridge, on instrument black like every unit's ring, and clicking its ship opens the Decks lift. With one deck, one escort holds station captioned "ADD A DECK TO GROW THE FLEET". Eight at most; the hail strip counts the rest.
- **Squadron sorties** (`src/client/features/sorties/`): a fighter for each unit at work, achromatic with a ship-cyan engine. Open pull requests hold on the picket ahead of the bow, left and right of the destination, so the review queue is out there to see, with a mono count under it.

All of it is neutrals, blues, teals and ship-cyan; the only other hue out there is the needs-you diamond, and only where a deck really needs you. It gives way the way the bridge's life does (`src/client/features/giveway/`): for 3 s after a unit starts needing you or gets stuck, the patrols slow; in that unit's pod they slow to stillness while it lasts; the escorts hold still and their salutes and hails are dropped, not queued. A set piece (the arrival) waits behind attention and, held more than ten minutes, comes out as a card. The camera never moves for any of it. Ship motion at Off and reduced motion hold it all still and turn the arrival into a crossfade and a card; nothing plays in a hidden tab. It adds 12 draw calls in all (the world, its halo, ring and band, the markers; three hull classes, the drives, the names, the beacons; the fighters, their engines, the picket's count).

The beats live in `src/client/features/beats/` (paths and timings in `logic.ts`, tested in `tests/motion.test.ts`), the bridge's life in `src/client/features/life/` (its numbers in `logic.ts`, tested in `tests/life.test.ts`), space outside in `src/client/features/space/` (the surge's and the jump's curves, the cruise speed and the flybys' schedule in `logic.ts`, tested in `tests/motion.test.ts` and `tests/space.test.ts`), the flight in `src/client/core/flight.ts`, the callout stacking in `src/client/features/workers/declutter.ts`, the bridge's world in `src/client/features/destination/`, `fleet/` and `sorties/` (their numbers in each `logic.ts`, tested in `tests/destination.test.ts`, `tests/fleet.test.ts` and `tests/sorties.test.ts`) with Life's rules in `features/giveway/` (`tests/giveway.test.ts`) and their words in `src/shared/shiplog.ts`, and the CSS reduced-motion rule at the end of `src/client/styles/tokens.css`.

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
- Lit edges, screens and state lights bloom a little more than the Night glow (0.4 against 0.32, in Day too), so they survive video compression (`src/client/features/lights/`).

## Focus and keyboard

Every control can be reached by keyboard, and focus is always a 2px Signal ring with a 2px offset (inset on rows and tabs that fill their container). Every window has a close button top right with a 28px target; Esc or the close button puts you straight back into mouse-look in Walk, or back in the Overview if you opened it from there, with no extra click.

## Checking a change

- `npm run typecheck`, `npm test` and `npm run build` must all pass with clean output.
- `node design/shoot.mjs <folder> [shot,shot]` (after `npm run build`) starts the office on a spare port with a throwaway home, password and project, deploys a few stand-in units that report fake states, and saves screenshots under `design/shots/<folder>/`: the deck from fixed vantages, the Overview, the merge beat, demo mode, Mission control, the palette, settings, toasts, the 2D view at three widths and in print, and a terminal. It always stops the office afterwards. The before and after shots of each design stage are kept there.
- `SHOOT_LIGHT=night` or `SHOOT_LIGHT=day` before `node design/shoot.mjs` takes the shots under those bridge lights (the 3D deck, its HUD, the 2D view and the sign-in page alike).
- Status colors are checked for contrast on `--void` and `--surface-1` (see the table in DESIGN.md), and on the instrument black they sit on in the 3D deck by night and by day (`tests/lights.test.ts`). Every state has a shape, so a grayscale or color-blind view still reads.
- `prefers-reduced-motion` in the browser's dev tools, or Settings > Bridge > Ship motion at Off, should leave nothing moving except a spinner.
