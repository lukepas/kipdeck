# The landing page

Back to the [README](../README.md).

`site/landing/` is the product's one-page site, built with Vite into `dist/site/`. It acts out the product around one number: how long an agent waits on a person. The hero opens on a working inbox: the agent units fly out of the mark in the top bar to their lanes, the headline breathes in on Archivo's width axis and five rows stream into Working. About 2.4 s in, Codex stops and asks. Its steel bar turns into the needs-you diamond, the row climbs to the top and its question types in. From then on the visitor's own time counts: the word *waiting* widens with a live stopwatch, a Signal line along the top of the window grows in real seconds, the top bar and the favicon say someone is waiting, and one unit in the far field lights up with a line to the row. Answering the row (or copying the command) clears every clock at once and sends Codex back to work. The hero's command is the demo's (clone, install, `npm start -- --demo`), with the line that says what the demo is under it, and **Try the demo** copies that same command. Any key, click or scroll during the opening plays it to its end at once, and after six idle seconds a ghost cursor answers once to show the gesture.

The twelve sections, in order: the hero, every vendor in one list, the 23 minutes an unanswered question costs, the loop (ask, answer, review, merge), *Why not the tools you already have?*, running it yourself with the measured times, the phone, Numbers, Labs with the 30-second film, the team tier with its design-partner ask, Proof of Merge (a lab, testnet only), and the end with the demo command and the investor notes. The inbox story runs from the hero to the team tier before the testnet lab.

Everything on it is drawn in code from the app's own tokens and glyphs (`src/client/styles/tokens.css` is imported, not copied): DOM replicas of the inbox, the question card and the diff, inline SVG, Canvas2D, CSS 3D, one small WebGL pass for the merge's shockwave and, in Labs only, a lazily loaded three.js bridge. There are no stock pictures.

## The scenes

Every section moves, every motion says something about the product, and every pinned scene opens on a composed first frame (no section waits on a scroll to look finished):

| Section | What moves, and what it says |
| --- | --- |
| 02 Every vendor | The card is there from the first frame: the Codex row in place, every other row a dashed slot with its vendor's chip. Streams of agent units leave the five vendor chips, spiral into a vortex around the card and fill those slots (the units bound for a row that waits on you turn Signal). Each row's branch writes in, then the rows leave vendor order for the inbox's order: longest wait on top. The heading is whole from the start. |
| 03 The problem | The heading and the lede are there from the first frame. A clock runs from 10:02 to 10:25 while one wait bar heats from steel to Signal and *23 min* lands. A workday draws, every question pops its diamond, an odometer adds the waits up, then a bar under the day fills with every wait, end to end (each segment lights on its own lane as it is counted), and flies up to dock into the wait clock along the top of the page. Unpinned, the clock and the day stack. |
| 04 The loop | The first frame shows the agent asking in its terminal. Its raw prompt reflows letter by letter into the question card. Answering clears the visitor's own wait too. The diff assembles line by line as real, selectable code; the Changes tab and the footer count the files as they land, the tests run with a spinner and turn green only at 12/12, Merge charges, and merging (by pressing it, or scrolling on) sends a WebGL shockwave and lands the MERGED stamp. Send back takes the story back to Answer. A scrubber jumps between the four beats (1 / 4 to 4 / 4). |
| 05 Why | The table's hairlines draw, every answer decodes in a diagonal wave, and the column that says yes lights last. |
| 06 Yours | The terminal runs the commands that put the inbox on your own project in about a second (only the commands type). The measured numbers count up from zero at full contrast as soon as their list is in view, units right after them. Beside the signed record, your machine is a wall: agents' packets pass through it to their own model, the inbox's stop at it (there are no servers of ours), and the record prints like a receipt, a row every 140 ms. |
| 07 Phone | The phone turns in and rests flat (crisp text), a push drops, a touch ring opens from Answer and then from Merge as each button presses down; on a desktop it leans with the scroll's speed and settles back. |
| 08 Numbers | The week's columns grow and a cursor walks the days while the median rolls from 23 to 7 (a modelled week). |
| 09 Labs | One command line, `npm start -- --labs bridge,ops,boards,voice,meetings`: its flags switch on in turn and light their tiles, and each flag is a real toggle. Five inbox rows lift off the page into consoles on a bridge deck (CSS 3D); on a capable device a three.js bridge takes over. An off lab keeps its words at full contrast; only its switch and flag go quiet. |
| 10 Teams | The plans part like a zipper, the five seats wait empty, and the dot grid leans toward **Apply as a design partner** (or the Team waitlist's field, in a build that has one); a join that really went through forms the agents into the mark over the seats. |
| 11 Proof of Merge | Test USDC drops into escrow and locks. Half in view, the merge happens once on its own: *Merge, as the human* presses, the lock springs open, the test USDC counts out, the attestation line draws and the testnet receipt settles row by row. The button then replays it. |
| 12 End | The footer says so when an agent waits on you again, with Answer; under it, the demo command, Star on GitHub and Read the docs. The wordmark opens from condensed (width 62) to the header's own width (118). For investors: the wedge, the model and the ask. |

On a wide window (900 px and up, 600 px tall) 02, 03 and 04 pin: the section's stage sticks while the scroll drives it, and scrolling back plays it backwards. Elsewhere they play once, in time, as they come into view. 08, 09 and 11 follow how far they have risen into view. With less motion none of this runs: the HTML is every scene's final state.

Sound is off until the speaker button in the top bar turns it on; then an agent asking, an answer and a merge play the film's four hook notes (WebAudio, nothing downloaded). It loads nothing from other sites, sets no cookies and has no analytics; its Content-Security-Policy allows scripts, styles, fonts and media from its own folder only. The fonts are Archivo and JetBrains Mono (SIL Open Font License, the texts ship beside the build).

## What it promises, and the tests that hold it to that

- Every staged surface carries a *Demo data*, *measured* or *illustrative* tag. The measured numbers (3.4 s to the first agent, 10.7 s and 4 clicks to the first merge) come from `design/shots/fundable/final/measure.json`.
- Every chain value in Proof of Merge is a real testnet artifact and says so (Solana devnet, Base Sepolia, test USDC).
- Until `MERGELINE_NPM_PUBLISHED=1`, the page shows the from-source command and says *Not on npm yet*. It never shows a command that 404s.
- No traction is invented: the ask is five design partners, and it works without a server (a new GitHub issue). No claim says nobody else measures the wait; the page says what a vendor's dashboard does not show.
- One clock format, m:ss, everywhere on the page.
- With less motion (the system setting) every section shows its final state, nothing ticks and the stopwatch reads a still 23:00.

`tests/landing-scenes.test.ts` scrolls through every scene on a laptop and on a phone (nothing thrown, never wider than the window, no layout shift), answers and merges in the loop with the keyboard, checks that section 06 is finished within a second of coming into view and that its terminal reads whole to a screen reader before it runs, that Proof of Merge releases by itself in view and replays, answers from the footer, and checks that with less motion nothing stages or pins.

`tests/landing-a11y.test.ts` checks WCAG AA contrast for every piece of text in both themes on a laptop and a phone, that drawings are hidden from screen readers and every control has a name and a visible focus ring, that Copy, Try the demo, Watch, Merge, the Labs flags and the design-partner link work from the keyboard alone, the film's captions, the search and share tags, the page with WebGL taken away (the merge ring draws in 2D, the Labs deck stays CSS, nothing errors), no WebGL error or warning with it, and the performance budgets below.

`tests/landing.test.ts` builds the page once per brand, serves it on 127.0.0.1 and checks all of the above in headless Chromium. It also checks the opening (Codex asks, answering clears every clock, a key skips to the end), that each brand clones and links its own repository, the design-partner link and the Team waitlist (shown and sending only with an endpoint), the phone width, both themes, the film window (its x and Esc both close it, and focus goes back to its button) and that nothing shifts through the whole opening.

## Speed, access and search

The budgets, held by `site/perf.mjs` and the test above:

| Budget | Limit | Measured (this build) |
| --- | --- | --- |
| First-load JS, gzipped | 60 KB | 10.8 KB (engine, field, hero) |
| CSS, gzipped | 30 KB | 18.3 KB |
| First-load transfer, with both fonts | 350 KB | 191 KB |
| LCP, laptop | 1.0 s | 40 to 84 ms (the headline) |
| LCP, phone at 4x CPU on slow 4G | 1.8 s | 1.0 s (the subhead) |
| Layout shift, load and a full scroll | 0.01 | 0 |
| Long tasks while scrolling, phone at 4x CPU | none over 50 ms | none |
| Longest interaction (answer, Copy, theme, Merge) | 100 ms | 32 ms laptop, 32 ms phone at 4x |

Frames over a full scripted scroll hold 16.7 ms at the 50th, 95th and 99th percentile on both. The other scenes (about 20 KB gzipped together) and the three.js bridge (133 KB, Labs only) load later; the film loads only when someone opens it.

```bash
npm run perf:site                                  # build, measure, print, exit 1 on a broken budget
node site/perf.mjs --no-build --json report.json   # measure the current dist/site and keep the numbers
```

It serves the build gzipped (as any host does) on 127.0.0.1 and runs headless Chromium twice: a laptop at 1440x900, and a phone at 390x844 with 4x CPU throttling on a 150 ms, 1.6 Mbps link (Lighthouse's mobile settings). Each run loads the page, scrolls the whole of it in ten seconds, then answers the waiting agent, copies, switches the theme twice and opens the loop. It reports weight, LCP and its element, layout shift with the elements that moved, frame times, every long task with the section it happened in, the longest interaction and console errors. Lighthouse is not a dependency; where `lighthouse` is installed it runs too and its scores go in the report. Headless Chromium draws WebGL in software, so a budget that breaks once is measured again before the test fails.

What keeps it inside them:

- Every scene but the hero is its own chunk, fetched while the browser is idle after the opening (`scenes/index.ts`), so the first load is the engine, the field and the hero.
- The three.js bridge is parsed and drawn in a worker on an `OffscreenCanvas` (`fx/bridge.ts`, `fx/bridge-worker.ts`); where a browser cannot hand a canvas to a worker it never loads and the CSS deck stays.
- Sections far below the fold skip style, layout and paint until they come near (`content-visibility` with remembered sizes, `styles/perf.css`), so the first layout is about 500 boxes instead of 1,800.
- One quality governor (`engine/governor.ts`) for the canvases: slow frames halve the units, then the pixels; a fling draws at half resolution until the scroll calms. Save-Data or 4 GB of memory or less start the field and the funnel at 80 units, and the light tier drops the top bar's blur.
- The merge's ring is an annulus mesh that shades only its lit band, at 0.6x pixels, and falls back to Canvas2D if WebGL is missing or its program does not link. Its canvas, context and program are made in the first idle moment after the opening (with `KHR_parallel_shader_compile` where the driver has it) and kept hidden, so the merge only draws.
- Pins are `position: sticky` with native scroll; nothing intercepts the wheel. Layout reads happen in one pass per frame before any write, the loop stops when the tab is hidden, and every canvas stops when it is off screen.

Accessibility: the page is semantic HTML that reads in full without script (a scene's text is clipped while it plays, never hidden from a screen reader), canvases and drawings are `aria-hidden`, there is a skip link, every control has a name and a visible focus ring, Copy announces itself through a polite live region, the film has English captions (`public/media/film-captions.vtt`: its on-screen words and the sounds that carry meaning) and never plays by itself, and text meets AA in both themes. With less motion every scene shows its final state, the field is still, the wait clock is hidden, the stopwatch reads 23:00 and no scene chunk is fetched ahead of time; switching it while the page is open reloads the page in the new mode. Tabbing into the loop's actions first scrolls to where the scene shows them, and in-page jumps re-align once the sections above have rendered at their real size (`ui/anchors.ts`).

Search and sharing: the title says what it is (`Mergeline: the inbox for your AI coding agents`), with a description, Open Graph and Twitter tags with image alt text, and `SoftwareApplication` structured data (free, MIT, no ratings, since there are none). `robots.txt` ships with the build; once `MERGELINE_SITE_URL` says where the page lives, the build adds the canonical link, `og:url`, absolute share-card addresses, `sitemap.xml` and its line in `robots.txt`.

## The name

The name, tagline, wordmark, npm package, source repository and share-card text live in one file, `site/landing/brand.ts`. The page title, the Open Graph and Twitter tags, the wordmark, every sentence that names the product, every Source and Docs link, the clone commands, the design-partner link, the structured data and the generated `og.png` all read from it. Mergeline is the default; build the other name with:

```bash
MERGELINE_BRAND=ugc-army npm run build:site
```

The test builds both and checks that each build never mentions the other name or clones the other repository. One thing it cannot change: the 30-second film's frames are drawn with the UGC Army wordmark, so a Mergeline build's film still shows that name until the film is rendered again.

## Build, look at it, publish

```bash
npm run build:site            # dist/site/
npm run preview:site          # serves dist/site on http://127.0.0.1:4690/
```

The page's scripts are ES modules, which browsers will not run from `file://`, so open it through `preview:site` (or any static server), not from disk. `cd site/landing && npx vite` runs it with live reload on port 4691.

For a deploy, fill in the addresses:

```bash
MERGELINE_SITE_URL=https://<your domain>/ \
MERGELINE_WAITLIST_URL=https://<your endpoint> \
MERGELINE_DEMO_URL=https://demo.<your domain>/ \
MERGELINE_REPO_URL=https://github.com/<org>/mergeline \
MERGELINE_NPM_PUBLISHED=1 \
npm run build:site
```

Upload `dist/site/` to any static host (GitHub Pages, Cloudflare Pages, Netlify, or a bucket behind a CDN). Each address must be `https`, or the build stops.

| Variable | What it does | Unset |
| --- | --- | --- |
| `MERGELINE_SITE_URL` | Where the page lives: the canonical link, `og:url`, absolute share-card addresses, `sitemap.xml` and its line in `robots.txt` | No canonical link and no sitemap (a relative one would be wrong wherever the page is copied) |
| `MERGELINE_WAITLIST_URL` | The Team waitlist form appears under the design-partner link and POSTs JSON here; the page's CSP allows that origin and no other | No form: the ask is **Apply as a design partner**, a new GitHub issue |
| `MERGELINE_DEMO_URL` | **Try the demo** opens the hosted read-only demo ([the demo](demo.md#the-hosted-demo), [Fly](fly.md)) | **Try the demo** copies the hero's demo command and lights it |
| `MERGELINE_REPO_URL` | Replaces the brand's repository everywhere: links, the clone commands (their `cd` too), the design-partner link, the structured data | The brand's repository (`brand.ts`) |
| `MERGELINE_NPM_PUBLISHED` | `1` once `npx` works from the registry: `npx` replaces the from-source command and the *Not on npm yet* line goes | The from-source command and the line stay |
| `MERGELINE_BRAND` | `ugc-army` builds the page under the other name (`site/landing/brand.ts`) | Mergeline |

The build also draws `og.png` (1200 by 630, the share card) from the brand with headless Chromium when one is installed (`playwright-core`'s, `CHROMIUM_PATH` or Google Chrome). Without one it says so and skips the card.

## How it is put together

- `site/landing/index.html`: every section's final, readable state as semantic HTML. A reader without script sees the whole page.
- `site/landing/src/main.ts`: mounts the hero, boots the controls and mounts each section's scene as it comes within a screen of the viewport.
- `site/landing/src/scenes/`: one module per section, registered in `scenes/index.ts` by the section's `data-scene`, each its own lazy chunk (the hero ships in the first one). A new section plugs in there, never in `main.ts`.
- `site/landing/src/engine/`: one shared `requestAnimationFrame` loop that runs only while something moves and stops when the tab is hidden (`loop.ts`, with `wake.ts` to run a task only while its section is on screen), a spring, counters, an odometer whose text stays the plain value, path morphing between glyphs drawn with the same points, a typewriter, compositor slides by the `translate` property (so a list reorders on screen without its DOM moving or anything shifting), and what the device asks for (less motion, Save-Data, low memory).
- `site/landing/src/engine/drive.ts`: drives a scene with one progress number from 0 to 1, from a pinned track's scroll, how far an element has risen into view, or a play in time, smoothed, with marks that fire going forward and undo going back. `stack.ts` draws a list in another order by transform alone.
- `site/landing/src/fx/shockwave.ts` (the merge's ring, WebGL1 with a Canvas2D fallback, made once ahead of time and kept hidden between rings), `fx/march.ts` (the March to the Mark) and `fx/bridge.ts` with `fx/bridge-worker.ts` and `fx/bridge-scene.ts` (the three.js bridge, drawn in a worker, loaded only for the Labs tile on a device with memory to spare, no Save-Data and a canvas it can hand to a worker).
- `site/landing/src/ui/sound.ts`: the opt-in hook notes.
- `site/landing/src/fx/field.ts`: the hero's Canvas2D field (a dot grid that bends toward the cursor, agent units launched from the mark into five vendor lanes, the one that blocks on you). It lives in typed arrays and allocates nothing per frame: the grid is drawn once and copied, only the dots near the cursor are drawn live, and the units fade behind the copy by band instead of a full-canvas composite. `engine/governor.ts` trims it (and the funnel) when frames run slow or the page is flung.
- `site/landing/src/ui/ghost.ts`: the ghost cursor that answers the waiting agent once after six idle seconds.
- `site/landing/src/ui/wait.ts`: the page's one piece of state, whether a scripted agent is waiting on the visitor and since when.
- `site/landing/src/ui/anchors.ts`: in-page jumps that land where they aim once the sections above have rendered.
- `site/landing/public/media/`: the 30-second film re-encoded for the web (AV1 WebM, H.264 MP4 and the 9:16 cut for phones) and its posters. The film never plays by itself and loads only when someone opens it.

`site/perf.mjs` is the performance gate described above.

`node design/shoot-landing.mjs design/shots/landing/<stage> [--clip]` serves a build and shoots it at 1440x900, 1920x1080 and 390x844 in both themes and with less motion. It also measures largest contentful paint, layout shift, frame times over a full scroll and what the first load weighs, and with `--clip` records a scroll-through video.

`node design/shoot-scenes.mjs <out dir> [--only funnel,loop] [--phone] [--light]` shoots each scene at points through its progress (a pinned track at several depths, a played one at moments after it shows).

`node design/shoot-hero.mjs design/shots/landing/<stage> [--no-clip]` shoots the hero's opening along its timeline (launch, inhale, rows, Codex asking and climbing, the wait running, answered, back to work, the ghost cursor, the pointer and Copy) in both themes, on a big screen and a phone, records the first twelve seconds in real time, and reports LCP with its element, layout shift, long tasks and frame times, also on a phone at 4x CPU throttle.

## The ask: design partners, and the Team waitlist

**Apply as a design partner** opens a new issue on the brand's repository with three short questions (how many agents a day and with which CLIs, what you would want measured, how to reach you). It needs no server and never throws a lead away. The note under it says the issue is public.

The Team tier waitlist form appears only in a build with `MERGELINE_WAITLIST_URL`. It sends exactly this, nothing more:

```json
{ "email": "lead@example.com", "source": "landing" }
```

The form is one field and one button (**Join the Team waitlist**); the line under it says the address is only used for the Team tier and deleted on request. Team size and price interest are asked in the one email that follows, not on the page.

The endpoint is yours to run. Keep it in the EU, store the fields and the time, and nothing else: no IP addresses in the record, no tracking pixels in the follow-up email. Answer it with CORS for the site's origin (`Access-Control-Allow-Origin`, and `content-type` in `Access-Control-Allow-Headers` for the preflight). A form service in the EU that accepts JSON works too; check its data processing terms first. Delete a person's details when they ask; the page promises that.

The older consulting page in `business/landing/` (pilots and workshops) is a separate offer and stays as it was.
