# PROOF OF MERGE - UGC Army, 30 s

The launch film, drawn frame by frame in code. One page (`src/index.html`) renders any frame from a time value. `render.mjs` steps through the frames in headless Chromium and encodes them with the soundtrack. The film has no stock footage, no bitmaps and no AI imagery. The fonts are OFL and the music is synthesized in `audio/`.

## Quick start

All commands run from `video/`. Node 22, `ffmpeg`/`ffprobe` (Homebrew's are picked up from `/opt/homebrew/bin`) and a Chromium for `playwright-core` are needed. The repo's root `node_modules` provides `three` and `playwright-core`, so nothing needs installing here.

```sh
npm run preview            # whole film, 640x360 @ 30 fps, ~35 s -> out/ugc-army-16x9-preview.mp4
npm run preview:vertical   # same in 9:16 (360x640)
npm run render             # final 1920x1080 @ 60 fps, ~10 min -> out/ugc-army-16x9.mp4
npm run render:vertical    # final 1080x1920 @ 60 fps
npm run poster             # the end card's last frame as a PNG poster -> out/stills/16x9-29.500.png
npm test                   # engine unit tests (easing, PRNG, decode, timeline, grid, word space)
npm run audio              # re-synthesize the soundtrack and beatmap (see audio/)
```

If no browser is found, run `npx playwright-core install chromium` once.

## render.mjs

| Flag | Default | Meaning |
|------|---------|---------|
| `--format 16x9\|9x16` | `16x9` | Picks the grid (12x8 or 4x14) and the default size |
| `--w N`, `--h N` | 1920x1080 or 1080x1920 | Frame size in px (must be even for yuv420p) |
| `--fps N` | 60 (30 with `--preview`) | Frame rate. Every frame is `t = from + i / fps` |
| `--from S`, `--to S` | `0`, `30` | Render a slice. The audio is cut to the same window |
| `--preview` | off | 1/3 size, 30 fps, JPEG frames, at most 2 motion-blur samples, x264 `veryfast` |
| `--still S` | | Render one PNG to `out/stills/` and skip the encode |
| `--stills S,S,...` | | Several PNGs in one browser session, for checking a list of hit frames |
| `--typesync DIR` | | The display-type layer alone (transparent) at every text hit and 5-8 frames after it, plus a `manifest.json`. `verify.py` runs it |
| `--guides` | off | Overlay the grid and the safe areas |
| `--no-grain` | grain on | Skip the film-grain overlay (for colour checks) |
| `--blur N` | 8 | Cap on motion-blur samples per frame |
| `--out file.mp4` | `out/ugc-army-<format>[-preview][-from-to].mp4` | Output path |
| `--keep-frames` | off | Stop after writing `out/frames/`, no encode |

The encode settings are H.264 High, yuv420p tagged BT.709 limited range, CRF 16 with `+faststart`, and AAC at 320 kb/s and 48 kHz. Encoding stops at exactly `frames / fps` seconds, and the script prints an `ffprobe` summary of both streams. A render fails if the page logs any error or warning. The one exception is SwiftShader's "GPU stall due to ReadPixels" note, which every screenshot triggers.

`out/` is git-ignored.

## Reviewing a render

Three Python tools (Pillow plus Homebrew's `ffmpeg`) check a finished film. Run `hits.py` straight after a full render, because the next render clears `out/frames/`.

```sh
python3 tools/hits.py out/review-r1/hits                        # the PNG frame at every beatmap hit
python3 tools/sheet.py out/ugc-army-r1.mp4 out/review-r1/sheet-16x9.png   # one frame every 0.5 s, timestamped
python3 tools/sheet.py out/ugc-army-9x16-preview.mp4 out/review-r1/sheet-9x16.png --cols 12 --width 240
python3 tools/verify.py out/ugc-army-r1.mp4                     # streams, sync and loudness
```

`hits.py` writes one still per hit frame, named `<t>s-f<frame>-<hit names>.png`. Hits that share a frame share a file. `sheet.py` pulls frames by index (every 30th at 60 fps), so each cell is exactly `t = k * 0.5`.

`verify.py` exits non-zero when a check fails. It checks:

- the streams: codecs, size, colour tags, frame count and both durations against the beatmap's 30 s
- picture sync: the mean colour of the frames around each `flash` hit. `flash.ink` (the Merge click) has to be ink on frame `round(t * fps)` and not before, and `invert` has to change the frame on its own frame
- audio sync: the sharpest attack within 50 ms of each impact, drop, flash and stamp hit in the mp4's own audio. Hits whose attack is under 10 dB (masked by a riser) are listed but not scored. It also cross-correlates the mp4's audio with `soundtrack.wav`, so an AAC priming offset shows up as a non-zero lag
- loudness: EBU R128 integrated loudness against the master, and true peak at or below -1 dBTP after the AAC encode (the master is limited to -2.0 dBTP, so the encode lands near -2.1)
- type sync: display type is never late. For every text hit, `render.mjs --typesync` renders the type layer alone, and the ink on the hit frame has to be at least 85% of its settled ink (frames +5 to +8). Hits whose type is canvas text (the `402` flaps, the escrow unit label) are listed but not scored. `--no-type` skips this step

## How a frame is made

The rendering contract is that `await window.__ready` resolves once fonts, beatmap and GPU are ready. After that, `await window.__render(t)` draws exactly the frame at `t` seconds. The page has no `requestAnimationFrame` clock, no wall-clock time and no `Math.random`. Rendering the same `t` twice gives byte-identical PNGs, in any order. The page also takes URL params (`w`, `h`, `fps`, `format`, `guides`, `grain`, `blur`, `t`), so `src/index.html?t=14` opened through any static server shows one frame.

The layers, bottom to top:

1. **Canvas 2D** (`#scene2d`, hidden) holds the grid, tiles, ledger, counters and labels. Scenes draw here.
2. **Three.js orthographic pass** (`#gl`, `engine/post.js`) uploads that canvas as a texture and runs one fragment shader. The shader does the monochrome pixel-sort smear and its un-sort (`fx.sort`, `fx.threshold`, `fx.sortPolarity`), the merge ripple (radial displacement plus a colour remap at the wavefront), the hard invert and the paper-white flash. When a scene asks for motion blur, the canvas is drawn at several sub-frame times and accumulated in a half-float target before the shader runs. The shutter is a trailing 180-degree one.
3. **SVG** (`#svg`) holds vector diagrams. The escrow state machine is drawn here.
4. **Display type** (`#type`, `engine/typeLayer.js`) is absolutely positioned DOM text using `font-variation-settings`. Canvas 2D can only reach Archivo's width axis in seven keyword steps, and the film drives `wdth` continuously from the sidechain envelope, so display type lives in this layer. It also supports a mask wipe, `mix-blend-mode`, and `fit`, which compresses `wdth` before it ever shrinks the size.
   Display type is pre-rolled: every entrance starts 3 frames before its beatmap hit (`typeIn` and `typeFrom` in `common.js`), so the type is about 93% formed on the hit frame and settles after it. Word spaces are fixed at 0.25em at every width-axis value (`wordSpacingFor` in `typeLayer.js`), because Archivo's own space narrows from 0.29em at wdth 125 to 0.11em at 62 and the sidechain drives that axis.
5. **Grain** (`#grain`, `engine/overlays.js`) is seeded noise tiles in overlay blend. Each frame picks its tile and offset from a hash of the frame number. Its strength follows the track's energy curve.
6. **Guides** (`#guides`) show the grid in cyan, action-safe in magenta and title-safe in green. They only appear with `--guides`.

## Source map

```
video/
  render.mjs              headless render + encode
  src/index.html          layer stack, import map for three
  src/main.js             boot, __ready / __render, sub-frame sampling
  src/beatmap.json        the clock (generated by audio/compose.mjs; do not hand-edit)
  src/engine/
    design.js             palette, type scale, grids, safe areas, place()
    timeline.js           sequencer over the beatmap: hits, kicks, envelopes, sections, acts
    ease.js               cubic-bezier solver, house curves, analytic spring, bounce
    prng.js               mulberry32 streams, stateless hashes, value noise
    kinetic.js            scramble-decode, split-flap, first6...last4
    fonts.js              FontFace loading with a ready promise
    typeLayer.js          display type (DOM) and SVG layers
    post.js               the Three.js pass
    overlays.js           grain and guides
  src/scenes/
    director.js           section -> scene, motion-blur and grain policy
    common.js             shared drawing helpers (grid, labels, tags, headline, terminal)
    act1.js               0-10 s: one agent, 64 agents, overload, the un-sort into mission control
    act2.js               10-19 s: timeline, build, the merge drop, Solana devnet escrow
    act3.js               19-30 s: EAS ledger, reputation and leaderboard, x402, recap, end card
  assets/fonts/           Archivo, Inter Tight, JetBrains Mono (variable, OFL; licences beside them)
  assets/audio/           soundtrack.wav (48 kHz, 24-bit, 30.000 s)
  audio/                  the synth that writes soundtrack.wav and beatmap.json
  test/                   node:test unit tests for the pure engine modules
  tools/contact.py        contact sheet of stills, for quick visual review
```

## Writing a scene

Each beatmap section has one scene object, `{ id, draw(S), blur?(t) }`, registered through `ACT1`/`ACT2`/`ACT3`. If a section has no scene, the director fails at boot. `draw` gets `S = { t, frame, ctx, design, tl, type, svg, fx, primary }` and has to paint the whole frame from `S.t` alone:

- Take time from the beatmap, not from hard-coded seconds. Use `tl.at('merge.click')`, `tl.prefixed('milestone.')`, `tl.sinceLast(tl.kind('blink'), t)`, `tl.sidechain(t)` and `tl.tileLandings`.
- Take layout from the grid. `design.place({ h: [col, row, cols, rows], v: [...] })` gives one rect per format, which is how a single timeline renders both 16:9 and 9:16. Sizes come from `design.size('l' | 'm' | 'data' | 'label' | 'tag' ...)`, authored at 1080p and scaled by the short side.
- Set display type with `headline(S, 'text.<id>', {...})` (the text, timing and mask wipe come from the beatmap hit) or with `S.type.text({...})`.
- Ask for post effects by setting fields on `S.fx`: `sort`, `threshold`, `sortPolarity`, `ripple: { x, y, r, width, amp, remap }`, `invert`, `flash`, `flashColor` (a palette hex, paper by default), `seed`.
- Start display type with `typeIn(t, hitT)` and draw it from `typeFrom(hitT)`, never from the hit itself, so it is formed on the hit frame. `tools/verify.py` fails a late hit.
- A scene can shorten its motion-blur shutter with `shutter(t)` (a share of the 180-degree default). Mission control uses 90 degrees while the tiles fly, so trails stay about half a tile long.
- Under motion blur, `draw` runs once per sub-sample. Only the last sample (`primary`) writes type, SVG and `fx`, so keep side effects behind those objects.
- Any randomness comes from `rng(...)` or `rand01(...)` with a stable seed, never from `Math.random`.

## Design system

| Token | Hex | Use |
|-------|-----|-----|
| paper | `#F2F0EB` | light scenes background |
| ink | `#0B0B0C` | type, dark scenes background |
| signal | `#FF3B1F` | human action only: Merge, NEEDS YOU, "human", centre cell of the mark |
| grey | `#8C8A85` | hairlines, secondary labels, demo-data tags |
| amber | `#FFB000` | STUCK and the x402 `402` state only |
| solana | `#14F195` | devnet escrow scene only |
| base | `#0052FF` | Base Sepolia attestation scene only |
| shade | `#E6E3DC` | cell fills, ledger zebra rows |

The colours reach the frame unchanged. The Three.js pass works on display values (canvas texture `NoColorSpace`, linear output, no conversion). The Merge click flashes one frame of ink and one of signal red, because that scene is already paper.

Type uses Archivo for display (wght 100-900, wdth 62-125, -0.04em tracking), Inter Tight 500/700 for UI labels (caps, +0.08em), and JetBrains Mono 400/700 for data. At 1080p the type scale is `xxl 300, xl 220, l 160, m 120, data 64, label 28, tag 20`. In 9:16, display sizes start at 196 px so they stay above 18% of the frame width. Hashes are never set below 64 px at 1080p.

The grid is 12x8 in 16:9 with 5% / 7.4% margins, and 4x14 in 9:16. 16:9 uses broadcast action-safe (93%) and title-safe (90%). 9:16 keeps titles out of the top 14%, the bottom 20% and the right 12%, which is where feed UI sits.

## Status

The engine and pipeline are complete. Act 1 (`act1.js`, 0-10 s) is final: the opening agent is the whole 8x8 tile region, the quadtree cuts it into the 64 cells, the overload smears them (`fx.sortCover` sets the share of streaking columns), and mission control sorts the same 64 tiles into columns built on those cells. Each tile waits on a cell that empties before a sorted tile lands there. Act 1 ends with a whip-pan left that is one camera move with act 2's pan-in (`whipCamera` in `common.js`), cut mid-move on 10.0. Act 2 (`act2.js`, 10-19 s) is final: PR #1 carries it. It drops onto the review inbox pile as the timeline's red playhead stamps the milestones, comes forward while the timeline recedes to grey, takes the cursor as the grid's hairlines converge into its Merge button, and the click sends the shockwave that flips the tiles to merged. The ink flood out of the same button hands over to the escrow, and the escrow ends with a paper sheet rolling down over the last beat so act 3 opens on paper. Display type in act 2 is set by baseline on grid rows, and `S.type.text` takes a `clip` (any CSS clip-path) for reveals that follow the shockwave. Act 3 (`act3.js`, 19-30 s) is final. The attest and reputation sections share one draw because they are one move: the receipt ledger prints on the paper act 2 rolled down, a blue ATTESTED - EAS stamp hits its top row, and the real EAS schema UID decodes where act 2 decoded the release tx. The ledger then filters to agent-07: its other rows fold away, the agent's ERC-8004 card takes their place, its three merged rows shrink into blocks that land in the reputation bar on the accept hits, and an unmerged block bounces off on the bounce hits. The camera pulls back until the card is one cell of the 8x8 army, those 64 tiles fly into the leaderboard bars (23.0) and re-rank onto 23.5. x402 flips a split-flap 402 to 202 (held for approval), the recap rolls its four words through one slot beside four micro-frames, and the recap collapses into the point the end-card mark grows from. Every act 3 headline sits on act 2's escrow baseline (in 9:16, on one last baseline above the feed's caption band), so the type lands in one slot across the act. Display type helpers shared by acts 2 and 3 (`display`, `baseOf`, `rightEdge`, `mix`) live in `common.js`. The real on-chain values the film shows are in `CHAIN` in `act2.js`: program `JAH6Zi...yVQs6`, release tx `2rPSWQ...ZtUc` and EAS schema `0x368e90...a900`.

### Polish round 1

After the first critique pass:

- Type leads its hits everywhere (see above), and word spaces no longer collapse. `Who gets paid?` breathes as one block, and the thesis reads `Paid only when / a human merges.` in full on the first frame after the click.
- Act 1: frame 0 is a poster (`1` set, first hairline drawn). `64 agents.` lands with the counter lock on 3.5, and the counter holds 64 through the overload. `Who needs you?` lands on the 5.5 cut itself and carries over into mission control beside the lit NEEDS YOU column. `UGC Army.` slams as the act's largest type with the kicker `Mission control for your AI coding agents.`, and the app header waits until 7.0. The 64 tiles land by 9.0 (the score moved with them), and the sorted 32/08/06/18 board holds for two beats. The whip-pan into act 2 is one camera move cut mid-move, so 10.0 already shows the timeline. One demo-data tag per frame, under the module.
- Act 2: the timeline clears for `Who gets paid?`, and the cursor rests on Merge from 13.5. The click flashes ink then red, the shockwave is a crisp hairline ring, and the card says MERGED once, with a check. The escrow is a lump sum: 0.00 at OPEN, 25.00 locks behind a padlock on FUNDED and only turns green on RELEASED. The release tx decodes in base58 over 17.0-17.5, with cycling glyphs dimmed so a paused frame never shows a wrong hash, and settles with box 04 and its headline on 17.5.
- Act 3: the ledger opens with row 1 printed and the schema slot in place. The schema decodes in hex and settles on 21.0. The leaderboard re-ranks onto the 23.5 backbeat and holds, and its bar cells are half a grid column. x402 now shows the real flow: `POST /api/x402/task`, 402, a retry with `X-PAYMENT: 0.10 test USDC`, then `202 Accepted`, held until an admin approves. Earlier cuts said 200 OK, which the office does not answer. All four recap panels are on screen from 25.5, and panel 04 turns from 0.00 to green 25.00 on `Get paid.`. The end card builds a mark a third of the frame high on 27.0. The wordmark slams on 27.5 and stays inside the grid, and the red centre is lit on the last frame. The small print names Solana devnet and Base Sepolia and gives the release tx and schema ids to look up.
- Audio: the master is limited to -2.0 dBTP. Short pre-impact gaps (`PRE_GAPS` in `score.mjs`) give the 5.5 cut, the 6.0 lock, the PR cards, the 24.0 buzz and the end-card hits a transient of their own, and the reverse cymbal stops just before 27.0.

## Fonts and licences

The fonts are in `assets/fonts/`. Each one is under the SIL Open Font License 1.1, and its licence text sits beside it.

- Archivo (variable): `OFL-Archivo.txt`, copyright The Archivo Project Authors
- Inter Tight (variable): `OFL-InterTight.txt`, copyright The Inter Project Authors
- JetBrains Mono (variable): `OFL-JetBrainsMono.txt`, copyright The JetBrains Mono Project Authors
