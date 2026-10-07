# The landing page

Back to the [README](../README.md).

`site/landing/` is the product's one-page site, built with Vite into `dist/site/`. It acts out the product around one number: how long an agent waits on a person. The hero opens on a working inbox: the agent units fly out of the mark in the top bar to their lanes, the headline breathes in on Archivo's width axis and five rows stream into Working. About 2.4 s in, Codex stops and asks. Its steel bar turns into the needs-you diamond, the row climbs to the top and its question types in. From then on the visitor's own time counts: the word *waiting* widens with a live stopwatch, a Signal line along the top of the window grows in real seconds, the top bar and the favicon say someone is waiting, and one unit in the far field lights up with a line to the row. Answering the row (or copying the command) clears every clock at once and sends Codex back to work. Any key, click or scroll during the opening plays it to its end at once, and after six idle seconds a ghost cursor answers once to show the gesture.

The twelve sections, in order: the hero, every vendor in one list, the 23 minutes an unanswered question costs, the loop (ask, answer, review, merge), *Why not the tools you already have?*, running it yourself with the measured times, the phone, Numbers, Labs with the 30-second film, Proof of Merge (testnet only), the team tier with its waitlist, and the end.

Everything on it is drawn in code from the app's own tokens and glyphs (`src/client/styles/tokens.css` is imported, not copied): DOM replicas of the inbox, the question card and the diff, inline SVG, Canvas2D, CSS 3D, one small WebGL pass for the merge's shockwave and, in Labs only, a lazily loaded three.js bridge. There are no stock pictures.

## The scenes

Every section moves, and every motion says something about the product:

| Section | What moves, and what it says |
| --- | --- |
| 02 Every vendor | Streams of agent units leave the five vendor chips, spiral into a vortex around the inbox card and collapse into its rows (the ones bound for a row that waits on you turn Signal). Each row's branch writes in, then the rows leave vendor order for the inbox's order: longest wait on top. |
| 03 The problem | A clock runs from 10:02 to 10:25 while one wait bar heats from steel to Signal and *23 min* lands. A workday draws, every question pops its diamond, an odometer adds the waits up, then every wait slides into one bar that flies up and docks into the wait clock along the top of the page. |
| 04 The loop | The agent's raw terminal prompt reflows letter by letter into the question card. Answering clears the visitor's own wait too. The diff assembles line by line as real, selectable code, the tests tick to 12/12, Merge charges, and merging (by pressing it, or scrolling on) sends a WebGL shockwave and lands the MERGED stamp. A scrubber jumps between the four beats. |
| 05 Why | The table's hairlines draw, every answer decodes in a diagonal wave, and the column that says yes lights last. |
| 06 Yours | The terminal types the from-source commands; each measured number lands as its log line prints. Packets bounce off the laptop's edge, and merges print into the signed record like a receipt. |
| 07 Phone | The phone turns in from the laptop's angle, a push drops, a thumb answers Codex and merges the README; on a desktop it leans with the scroll's speed. |
| 08 Numbers | The week's columns grow, a cursor walks the days while the median rolls from 23 to 7 (a modelled week), and a sparkline docks under the top bar's pulse. |
| 09 Labs | Five inbox rows lift off the page into consoles on a bridge deck (CSS 3D); on a capable device a three.js bridge takes over. The other labs switch on like switches. |
| 10 Proof of Merge | Test USDC drops into escrow and locks; *Merge, as the human* (or scrolling on) opens it, draws the attestation line and settles the testnet receipt. |
| 11 Teams | The plans part like a zipper, the five seats wait empty, the dot grid leans toward the email field, and a join that really went through forms the agents into the mark over the seats. |
| 12 End | The footer says so when an agent waits on you again, with Answer; the wordmark compresses from width 125 to 62. |

On a wide window (900 px and up, 600 px tall) 02, 03 and 04 pin: the section's stage sticks while the scroll drives it, and scrolling back plays it backwards. Elsewhere they play once, in time, as they come into view. 08, 09 and 10 follow how far they have risen into view. With less motion none of this runs: the HTML is every scene's final state.

Sound is off until the speaker button in the top bar turns it on; then an agent asking, an answer and a merge play the film's four hook notes (WebAudio, nothing downloaded). It loads nothing from other sites, sets no cookies and has no analytics; its Content-Security-Policy allows scripts, styles, fonts and media from its own folder only. The fonts are Archivo and JetBrains Mono (SIL Open Font License, the texts ship beside the build).

## What it promises, and the tests that hold it to that

- Every staged surface carries a *Demo data*, *measured* or *illustrative* tag. The measured numbers (3.4 s to the first agent, 10.7 s and 4 clicks to the first merge) come from `design/shots/fundable/final/measure.json`.
- Every chain value in Proof of Merge is a real testnet artifact and says so (Solana devnet, Base Sepolia, test USDC).
- Until `MERGELINE_NPM_PUBLISHED=1`, the page shows the from-source command and says *Not on npm yet*. It never shows a command that 404s.
- No traction is invented: the ask is five design partners.
- With less motion (the system setting) every section shows its final state, nothing ticks and the stopwatch reads a still 23:00.

`tests/landing-scenes.test.ts` scrolls through every scene on a laptop and on a phone (nothing thrown, never wider than the window, no layout shift), answers and merges in the loop with the keyboard, releases Proof of Merge, answers from the footer, and checks that with less motion nothing stages or pins.

`tests/landing.test.ts` builds the page once per brand, serves it on 127.0.0.1 and checks all of the above in headless Chromium. It also checks the opening (Codex asks, answering clears every clock, a key skips to the end), the waitlist, the phone width, both themes, the film window (its x and Esc both close it, and focus goes back to its button) and that nothing shifts through the whole opening.

## The name

The name, tagline, wordmark, npm package and share-card text live in one file, `site/landing/brand.ts`. The page title, the Open Graph and Twitter tags, the wordmark, every sentence that names the product and the generated `og.png` all read from it. Mergeline is the default; build the other name with:

```bash
MERGELINE_BRAND=ugc-army npm run build:site
```

The test builds both and checks that each build never mentions the other name.

## Build, look at it, publish

```bash
npm run build:site            # dist/site/
npm run preview:site          # serves dist/site on http://127.0.0.1:4690/
```

The page's scripts are ES modules, which browsers will not run from `file://`, so open it through `preview:site` (or any static server), not from disk. `cd site/landing && npx vite` runs it with live reload on port 4691.

For a deploy, fill in the addresses:

```bash
MERGELINE_WAITLIST_URL=https://<your endpoint> \
MERGELINE_DEMO_URL=https://demo.<your domain>/ \
MERGELINE_REPO_URL=https://github.com/<org>/mergeline \
MERGELINE_NPM_PUBLISHED=1 \
npm run build:site
```

Upload `dist/site/` to any static host (GitHub Pages, Cloudflare Pages, Netlify, or a bucket behind a CDN). Each address must be `https`, or the build stops.

| Variable | What it does | Unset |
| --- | --- | --- |
| `MERGELINE_WAITLIST_URL` | The form POSTs JSON here, and the page's CSP allows that origin and no other | The form checks its input and says nothing was sent |
| `MERGELINE_DEMO_URL` | **Try the demo** opens the hosted read-only demo ([the demo](demo.md#the-hosted-demo), [Fly](fly.md)) | **Try the demo** shows the demo command with a copy button |
| `MERGELINE_REPO_URL` | Every link to the source, and the clone command | This repository |
| `MERGELINE_NPM_PUBLISHED` | `1` once `npx` works from the registry: `npx` replaces the from-source command and the *Not on npm yet* line goes | The from-source command and the line stay |
| `MERGELINE_BRAND` | `ugc-army` builds the page under the other name (`site/landing/brand.ts`) | Mergeline |

The build also draws `og.png` (1200 by 630, the share card) from the brand with headless Chromium when one is installed (`playwright-core`'s, `CHROMIUM_PATH` or Google Chrome). Without one it says so and skips the card.

## How it is put together

- `site/landing/index.html`: every section's final, readable state as semantic HTML. A reader without script sees the whole page.
- `site/landing/src/main.ts`: boots the controls and mounts each section's scene as it comes near the viewport.
- `site/landing/src/scenes/`: one module per section, registered in `scenes/index.ts` by the section's `data-scene`. A new section plugs in there, never in `main.ts`.
- `site/landing/src/engine/`: one shared `requestAnimationFrame` loop that runs only while something moves and stops when the tab is hidden (`loop.ts`, with `wake.ts` to run a task only while its section is on screen), a spring, counters, an odometer whose text stays the plain value, path morphing between glyphs drawn with the same points, a typewriter, compositor slides by the `translate` property (so a list reorders on screen without its DOM moving or anything shifting), and what the device asks for (less motion, Save-Data, low memory).
- `site/landing/src/engine/drive.ts`: drives a scene with one progress number from 0 to 1, from a pinned track's scroll, how far an element has risen into view, or a play in time, smoothed, with marks that fire going forward and undo going back. `stack.ts` draws a list in another order by transform alone.
- `site/landing/src/fx/shockwave.ts` (the merge's ring, WebGL1 with a Canvas2D fallback, alive only while it is out), `fx/march.ts` (the March to the Mark) and `fx/bridge.ts` (the three.js bridge, its own lazy chunk, loaded only for the Labs tile on a device with memory to spare and no Save-Data).
- `site/landing/src/ui/sound.ts`: the opt-in hook notes.
- `site/landing/src/fx/field.ts`: the hero's Canvas2D field (a dot grid that bends toward the cursor, agent units launched from the mark into five vendor lanes, the one that blocks on you). It lives in typed arrays and allocates nothing per frame: the grid is drawn once and copied, only the dots near the cursor are drawn live, and the units fade behind the copy by band instead of a full-canvas composite. It halves its units if frames run slow.
- `site/landing/src/ui/ghost.ts`: the ghost cursor that answers the waiting agent once after six idle seconds.
- `site/landing/src/ui/wait.ts`: the page's one piece of state, whether a scripted agent is waiting on the visitor and since when.
- `site/landing/public/media/`: the 30-second film re-encoded for the web (AV1 WebM, H.264 MP4 and the 9:16 cut for phones) and its posters. The film never plays by itself and loads only when someone opens it.

`node design/shoot-landing.mjs design/shots/landing/<stage> [--clip]` serves a build and shoots it at 1440x900, 1920x1080 and 390x844 in both themes and with less motion. It also measures largest contentful paint, layout shift, frame times over a full scroll and what the first load weighs, and with `--clip` records a scroll-through video.

`node design/shoot-scenes.mjs <out dir> [--only funnel,loop] [--phone] [--light]` shoots each scene at points through its progress (a pinned track at several depths, a played one at moments after it shows).

`node design/shoot-hero.mjs design/shots/landing/<stage> [--no-clip]` shoots the hero's opening along its timeline (launch, inhale, rows, Codex asking and climbing, the wait running, answered, back to work, the ghost cursor, the pointer and Copy) in both themes, on a big screen and a phone, records the first twelve seconds in real time, and reports LCP with its element, layout shift, long tasks and frame times, also on a phone at 4x CPU throttle.

## The waitlist

The form sends exactly this, nothing more:

```json
{ "email": "lead@example.com", "source": "landing" }
```

The form is one field and one button; the line under it says the address is only used for the team tier and deleted on request. Team size and price interest are asked in the one email that follows, not on the page.

The endpoint is yours to run. Keep it in the EU, store the fields and the time, and nothing else: no IP addresses in the record, no tracking pixels in the follow-up email. Answer it with CORS for the site's origin (`Access-Control-Allow-Origin`, and `content-type` in `Access-Control-Allow-Headers` for the preflight). A form service in the EU that accepts JSON works too; check its data processing terms first. Delete a person's details when they ask; the page promises that.

The older consulting page in `business/landing/` (pilots and workshops) is a separate offer and stays as it was.
