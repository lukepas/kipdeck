# The landing page

How Kipdeck's one-page site is built and checked.

Back to the [README](../README.md).

`site/landing/` is the product's one-page site, built with Vite into `dist/site/`. It acts out the product around one number: how long an agent waits on a person. The hero opens the way the headline reads: Codex is already waiting on the visitor (0:07 in), its question at the top of the inbox, while the agent units fly out of the mark in the top bar to their lanes and the headline breathes in on Archivo's width axis. The visitor's own time counts from the first frame: the word *waiting* widens with a live stopwatch, a Signal line along the top of the window grows in real seconds, the top bar and the favicon say someone is waiting, and one unit in the far field lights up with a line to the row. Answering the row clears every clock at once and sends Codex back to work; 18 seconds later it asks again, its next question typing in at the top with one Signal ring. Only the visitor clears the wait (the hero's row, the footer's Answer, or pressing Merge in the loop): scrolling and copying never do. Once nobody waits, nothing on the hero is orange: *waiting* turns ink, the stopwatch fades and the pill drops its clock. The finished change under To review has a green **Merge**; pressing it settles the row into a check and ticks *merged today*. The row's name carries its wait for a screen reader (the drawn clock is hidden from it), and the mini pill shows the *longest wait*. One state object in `scenes/hero.ts` paints every number in the mock and the top bar (the pulse, the mini pill, the section counts, the row and the stopwatch), so they never disagree. The subhead says what it is for: every coding agent you run, in one place, and answering, reviewing and merging without leaving it; the line under it names `kipdeck attach`. The hero's command is the demo's (clone, install, `npm start -- --demo`), with the line that says what the demo is under it, and **Copy the demo command** copies that same command (with `KIPDECK_DEMO_URL` it becomes **Try the demo** and opens the hosted demo). A command wraps only between its `&&` steps and an address only after a slash. While the repository is private the command is not shown at all (see the build settings below): the film is the first button and **Become a design partner** the second. Any key, click or scroll during the opening plays it to its end at once, and after six idle seconds a ghost cursor answers once to show the gesture.

The ten sections and the footer, in order: the hero, every vendor in one list, the 23 minutes an unanswered question costs, the loop (ask, answer, review, merge), *Why not the tools you already have?* (vendor inboxes and agent workbenches by name), running it yourself with the measured times and the three-line security strip, the phone, Numbers, Labs (with Proof of Merge as a testnet card), and the team tier with its design-partner ask. The page ends there: the footer holds the live wait line, the wordmark and the credits. The investor notes live in the deck, not on the page.

Below 1080 px the section links sit in a row of their own under the top bar, in the page's order, and scroll sideways when they do not fit. Orange (Signal) means one thing on this page: someone needs you. Buttons, the comparison's own column, the plans' zipper and the security strip use the ink color, and a merge is the settled green everywhere (the Merge buttons, merged rows, Shipped today, the merge ring).

Everything on it is drawn in code from the app's own tokens and glyphs (`src/client/styles/tokens.css` is imported, not copied): DOM replicas of the inbox, the question card and the diff, inline SVG, Canvas2D, CSS 3D, one small WebGL pass for the merge's ring and, in Labs only, a lazily loaded three.js bridge. There are no stock pictures.

## The scenes

Every section moves, every motion says something about the product, and every pinned scene opens on a composed first frame (no section waits on a scroll to look finished):

| Section | What moves, and what it says |
| --- | --- |
| 02 Every vendor | The card is there from the first frame: the Codex row in place, every other row a dashed slot with its vendor's chip. Streams of agent units leave the five vendor chips, spiral into a vortex around the card and fill those slots (the units bound for a row that waits on you turn Signal). Each row's branch writes in, then the rows leave vendor order for the inbox's order: longest wait on top. The heading is whole from the start. |
| 03 The problem | The heading and the lede are there from the first frame. A clock runs from 10:02 to 10:25 while one wait bar heats from steel to Signal and *23 min* lands. A workday draws, every question pops its diamond, an odometer adds the waits up, then a bar under the day fills with every wait, end to end (each segment lights on its own lane as it is counted), and flies up to dock into the wait clock along the top of the page. Unpinned, the clock and the day stack. |
| 04 The loop | The first frame shows the agent asking in its terminal. Its raw prompt reflows letter by letter into the question card, a line breaking only between words. The scripted answer is the agent's, not the visitor's, so the top bar keeps counting the hero's Codex. The diff assembles line by line as real, selectable code; the Changes tab and the footer count the files as they land, the tests run with a spinner and turn green only at 12/12, Merge charges, and merging (by pressing it, or scrolling on) sends a small green ring round the button, shows a green *Merged* beside it and moves the row under Shipped today; pressing it also answers the visitor's own wait. Send back takes the story back to Answer. Neither can be pressed before its step (they are `aria-disabled`, so the keyboard still reaches them and scrolls the story there). A scrubber jumps between the four beats (1 / 4 to 4 / 4). |
| 05 Why | Every answer is readable from the first frame. As the table arrives its hairlines draw, each answer's mark pops in a diagonal wave and the frame around our column draws last. Nothing is hidden waiting on a reveal, so a short landscape window reads it in full. |
| 06 Yours | Three plain security facts first: localhost by default, everyone off localhost signs in (HTTPS with `--self-signed` or a reverse proxy), and the record is signed with an Ed25519 key that stays on the machine. The terminal runs the commands that put the inbox on your own project in about a second (only the commands type). The measured numbers count up from zero at full contrast as soon as their list is in view, units right after them. Beside the signed record, your machine is a wall: agents' packets pass through it to their own model, the inbox's stop at it (there are no servers of ours), and the record prints like a receipt, a row every 140 ms. |
| 07 Phone | The phone turns in and rests flat (crisp text), a push drops, a touch ring opens from Answer and then from Merge as each button presses down; on a desktop it leans with the scroll's speed and settles back. |
| 08 Numbers | The week's columns grow and a cursor walks the days while the median rolls from 23 to 7 (a modelled week). |
| 09 Labs | One command line, `npm start -- --labs bridge,ops,boards,voice,meetings` from a clone (`npx kipdeck --labs ...` once `KIPDECK_NPM_PUBLISHED=1`). Every lab is on by default, as in the office, so the tiles start on and a scanline powers each in turn as the section arrives; each flag is a real toggle that holds its lab off (it reads `-voice`, as the real `--labs` does) or on again. Each tile says it is on by default. Five inbox rows lift off the page into consoles on a bridge deck (CSS 3D); on a capable device a three.js bridge takes over. An off lab keeps its words at full contrast; only its switch and flag go quiet. Proof of Merge is a card here (testnet only, with a real devnet release link and on by default), not a section of the main scroll. |
| 10 Teams | Both plans are readable the whole time: a line runs down the middle like a zipper and each plan's top rule draws; the five seats wait empty, and the dot grid leans toward **Apply as a design partner** (or the Team waitlist's field, in a build that has one); a join that really went through forms the agents into the mark over the seats. |
| 11 End | The footer says so when an agent waits on you again, with Answer. The wordmark opens from condensed (width 62) to the header's own width (118). Then the links (with the contact address) and the credits. |

On a wide window (900 px and up, 600 px tall) 02, 03 and 04 pin: the section's stage sticks while the scroll drives it, and scrolling back plays it backwards. Elsewhere they play once, in time, as soon as their top is in the reader's view (`engine/arrive.ts`, which works for a track taller than the window), quickly enough to keep up with a reader (3 s for 02 and 03, 8 s for the loop); unpinned, 03 shows its 2h 41m total from the start. 08, 09 and 11 follow how far they have risen into view. With less motion none of this runs: the HTML is every scene's final state.

Sound is off until the speaker button in the top bar turns it on; then an agent asking, an answer and a merge play the film's four hook notes (WebAudio, nothing downloaded). It loads nothing from other sites, sets no cookies and has no analytics; its Content-Security-Policy allows scripts, styles, fonts and media from its own folder only. The fonts are Archivo and JetBrains Mono (SIL Open Font License, the texts ship beside the build).

## What it promises, and the tests that hold it to that

- Every staged surface carries a *Demo data*, *measured* or *illustrative* tag. The measured numbers (3.4 s to the first agent, 10.7 s and 4 clicks to the first merge) come from the measuring script and its results in the repository (`design/`); the page says so without naming internal paths.
- Every chain value in Proof of Merge is a real testnet artifact and says so (Solana devnet, Base Sepolia, test USDC).
- Until `KIPDECK_NPM_PUBLISHED=1`, the page shows the from-source command and says *Not on npm yet*. It never shows a command that 404s.
- No traction is invented: the ask is five design partners, and it works without a server or a public repository (an email to the brand's `contact` address). No claim says nobody else measures the wait; the page says what a vendor's dashboard does not show.
- One clock format, m:ss, everywhere on the page.
- With less motion (the system setting) every section shows its final state: the hero shows Codex asking, and every clock in it reads the same value and still counts once a second (a changing digit is not motion), so the page never looks frozen.

`tests/landing-scenes.test.ts` scrolls through every scene on a laptop and on a phone (nothing thrown, never wider than the window, no layout shift), answers and merges in the loop with the keyboard, checks that section 06 is finished within a second of coming into view and that its terminal reads whole to a screen reader before it runs, that on a phone the problem plays as the reader arrives with its 2h 41m shown, answers from the footer, and checks that with less motion nothing stages or pins.

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

Accessibility: the page is semantic HTML that reads in full without script (a scene's text is clipped while it plays, never hidden from a screen reader), canvases and drawings are `aria-hidden`, there is a skip link, every control has a name and a visible focus ring, Copy announces itself through a polite live region, the film has English captions (`public/media/film-captions-v2.vtt`: its on-screen words and the sounds that carry meaning) and never plays by itself, and text meets AA in both themes. With less motion every scene shows its final state, the field is still, the wait clock is hidden, every clock in the hero reads the same value, counting without rolling and no scene chunk is fetched ahead of time; switching it while the page is open reloads the page in the new mode. Tabbing into the loop's actions first scrolls to where the scene shows them, and in-page jumps re-align once the sections above have rendered at their real size (`ui/anchors.ts`).

Search and sharing: the title says what it is (`Kipdeck: the inbox for your AI coding agents`), with a description, Open Graph and Twitter tags with image alt text, and `SoftwareApplication` structured data (free, MIT, no ratings, since there are none). `robots.txt` ships with the build; once `KIPDECK_SITE_URL` says where the page lives (on Vercel it falls back to the project's production domain, `VERCEL_PROJECT_PRODUCTION_URL`), the build adds the canonical link, `og:url`, absolute share-card addresses, `sitemap.xml` and its line in `robots.txt`.

## The name

The name, tagline, wordmark, npm package, source repository and share-card text live in one file, `site/landing/brand.ts`. The page title, the Open Graph and Twitter tags, the wordmark, every sentence that names the product, every Source and Docs link, the clone commands, the design-partner link, the structured data and the generated `og.png` all read from it. The logo is not in `brand.ts`: Kip's mark in the header, the mini inbox and the footer, the favicons (`favicon-alert.svg` lights his light while someone waits), `apple-touch-icon.png` and the share card's mark are written from `src/shared/logo.ts` by `npm run logo` ([the logo](design.md#the-logo)). Kipdeck is the only entry. To try another name, add an entry to `BRANDS` and build it with:

```bash
KIPDECK_BRAND=<id> npm run build:site
```

The test builds the page and checks that it never says a product name other than Kipdeck. The source repository is `github.com/zbagdzevicius/kipdeck`.

## Build, look at it, publish

```bash
npm run build:site            # dist/site/
npm run preview:site          # serves dist/site on http://127.0.0.1:4690/
```

The page's scripts are ES modules, which browsers will not run from `file://`, so open it through `preview:site` (or any static server), not from disk. `cd site/landing && npx vite` runs it with live reload on port 4691.

For a deploy, fill in the addresses:

```bash
KIPDECK_SITE_URL=https://<your domain>/ \
KIPDECK_WAITLIST_URL=https://<your endpoint> \
KIPDECK_DEMO_URL=https://demo.<your domain>/ \
KIPDECK_NPM_PUBLISHED=1 \
npm run build:site
```

Upload `dist/site/` to any static host (GitHub Pages, Cloudflare Pages, Netlify, or a bucket behind a CDN), or let Vercel build it from Git: the root `vercel.json` holds the install and build commands, the output folder and the headers, so connecting the repository to a Vercel project is enough (see `site/landing/README.md`). Each address must be `https`, or the build stops.

| Variable | What it does | Unset |
| --- | --- | --- |
| `KIPDECK_SITE_URL` | Where the page lives: the canonical link, `og:url`, absolute share-card addresses, `sitemap.xml` and its line in `robots.txt` | On Vercel, `https://$VERCEL_PROJECT_PRODUCTION_URL/`; elsewhere no canonical link and no sitemap (a relative one would be wrong wherever the page is copied) |
| `KIPDECK_WAITLIST_URL` | The Team waitlist form appears under the design-partner link and POSTs JSON here; the page's CSP allows that origin and no other | No form: the ask is **Apply as a design partner**, an email to the brand's `contact` address |
| `KIPDECK_DEMO_URL` | **Try the demo** opens the hosted read-only demo ([the demo](demo.md#the-hosted-demo), [Fly](fly.md)) | **Copy the demo command** copies the hero's demo command and lights it |
| `KIPDECK_REPO_URL` | Replaces the brand's repository everywhere: links, the clone commands (their folder and `cd` too), the design-partner link, the structured data. It also counts as public | The brand's repository (`brand.ts`) |
| `KIPDECK_REPO_PUBLIC` | `0` for a brand whose repository is private: the clone command, section 06's terminal, the footer's Source and Docs links and the structured data's repository are left out (the `npx` command stays with `KIPDECK_NPM_PUBLISHED=1`), the film is the hero's first button and **Become a design partner** its second | The repository is public (github.com/zbagdzevicius/kipdeck is): all of those are on the page |
| `KIPDECK_NPM_PUBLISHED` | `1` once `npx` works from the registry: `npx` replaces the from-source command and the *Not on npm yet* line goes | The from-source command and the line stay |
| `KIPDECK_BRAND` | Picks an entry in `site/landing/brand.ts` | `kipdeck` |

The build also draws `og.png` (1200 by 630, the share card) from the brand with headless Chromium when one is installed (`playwright-core`'s, `CHROMIUM_PATH` or Google Chrome). Without one it says so, and the committed `site/landing/public/og.png` ships instead (that is the case on Vercel and Cloudflare's builders).

## How it is put together

- `site/landing/index.html`: every section's final, readable state as semantic HTML. A reader without script sees the whole page.
- `site/landing/src/main.ts`: mounts the hero, boots the controls and mounts each section's scene as it comes within a screen of the viewport.
- `site/landing/src/scenes/`: one module per section, registered in `scenes/index.ts` by the section's `data-scene`, each its own lazy chunk (the hero ships in the first one). A new section plugs in there, never in `main.ts`.
- `site/landing/src/engine/`: one shared `requestAnimationFrame` loop that runs only while something moves and stops when the tab is hidden (`loop.ts`, with `wake.ts` to run a task only while its section is on screen), a spring, counters, an odometer whose text stays the plain value, path morphing between glyphs drawn with the same points, a typewriter, compositor slides by the `translate` property (so a list reorders on screen without its DOM moving or anything shifting), and what the device asks for (less motion, Save-Data, low memory).
- `site/landing/src/engine/drive.ts`: drives a scene with one progress number from 0 to 1, from a pinned track's scroll, how far an element has risen into view, or a play in time, smoothed, with marks that fire going forward and undo going back. `stack.ts` draws a list in another order by transform alone.
- `site/landing/src/fx/shockwave.ts` (the merge's ring in the settled green, WebGL1 with a Canvas2D fallback, made once ahead of time and kept hidden between rings; a caller can keep it short, as the loop does), `fx/march.ts` (the March to the Mark) and `fx/bridge.ts` with `fx/bridge-worker.ts` and `fx/bridge-scene.ts` (the three.js bridge, drawn in a worker, loaded only for the Labs tile on a device with memory to spare, no Save-Data and a canvas it can hand to a worker).
- `site/landing/src/ui/sound.ts`: the opt-in hook notes.
- `site/landing/src/fx/field.ts`: the hero's Canvas2D field (a dot grid that bends toward the cursor, agent units launched from the mark into five vendor lanes, the one that blocks on you). It lives in typed arrays and allocates nothing per frame: the grid is drawn once and copied, only the dots near the cursor are drawn live, and the units fade behind the copy by band instead of a full-canvas composite. `engine/governor.ts` trims it (and the funnel) when frames run slow or the page is flung.
- `site/landing/src/ui/ghost.ts`: the ghost cursor that answers the waiting agent once after six idle seconds.
- `site/landing/src/ui/wait.ts`: the page's one piece of state, whether a scripted agent is waiting on the visitor and since when.
- `site/landing/src/ui/anchors.ts`: in-page jumps that land where they aim once the sections above have rendered.
- `site/landing/public/media/`: the 30-second film re-encoded for the web (AV1 WebM, H.264 MP4 and the 9:16 cut for phones), its captions and its posters. The film never plays by itself and loads only when someone opens it. After a new render in `video/`, `python3 video/tools/deliver.py --web` writes the web files; a changed film gets a new file name (`-v2`, `-v3`...) because the landing caches media for a week, and the `<video>` sources, the captions file and `tests/landing-a11y.test.ts` move to the new name with it.

`site/perf.mjs` is the performance gate described above.

`node design/shoot-landing.mjs design/shots/landing/<stage> [--clip]` serves a build and shoots it at 1440x900, 1920x1080 and 390x844 in both themes and with less motion. It also measures largest contentful paint, layout shift, frame times over a full scroll and what the first load weighs, and with `--clip` records a scroll-through video.

`node design/shoot-scenes.mjs <out dir> [--only funnel,loop] [--phone] [--light]` shoots each scene at points through its progress (a pinned track at several depths, a played one at moments after it shows).

`node design/shoot-hero.mjs design/shots/landing/<stage> [--no-clip]` shoots the hero's opening along its timeline (launch, inhale, rows, Codex asking and climbing, the wait running, answered, back to work, the ghost cursor, the pointer and Copy) in both themes, on a big screen and a phone, records the first twelve seconds in real time, and reports LCP with its element, layout shift, long tasks and frame times, also on a phone at 4x CPU throttle.

## Kip, the mascot

Kip is the investor deck's character, ported as a TypeScript module in `site/landing/src/kip/`: the same SVG drawing, poses, pivots and wand colours, with the deck's gestures (run with speed lines, skid, hop, wave, twirl, cheer, stamp, flag, point, peek, zip, poof, sleep). The deck's GSAP timelines run on a small tween engine of our own (`kip/tween.ts`) inside the page's shared animation loop, so he adds no dependency and stops ticking when nothing moves or the tab is hidden.

Where he lives:

- `#kip-doc`, a zero-height layer at the page's top-left in page coordinates: the browser's own scroll carries him, with no script per frame. This holds the section-boundary companion (feet on the coming section's label rule, the line after "03 THE PROBLEM", or the hairline between two sections where the rule has no room) and the moments of the unpinned sections, including the phone versions of the pinned ones.
- A layer inside the sticky stage of 02, 03 and 04, only while they pin, so he holds still with the stage.
- `#kip-fixed`, only for the corner peek (`kip/corner.ts`): when nothing on screen has room for him and the page has been still for about a second, he comes up from the bottom of the window at the right edge of the content column, only if nothing at all is drawn there (no text, card, chart, image or border), and ducks as soon as the page scrolls. Never below 720 px wide, where the gutter cannot hold him. The K key uses it too when no floor is on screen.

He moves from one place to another only by zipping out and zipping in, and only along something he stands on: a spot can name the edge or line under it, and where a moment has moved him off any floor he leaves in a puff. `kip/director.ts` decides who owns him (a section's moment, or the boundary companion), measuring only the sections near the window and at most ten times a second, follows the scroll's speed and direction, and drives the pinned moments by the same progress formula as `engine/drive.ts`; scrolling back sets each beat's state at once instead of playing it backwards. Each section's moment is one module in `kip/moments/`, registered by `data-scene` in `kip/moments/index.ts`. Moments only watch what the scenes already leave behind (the page's wait, classes such as `is-merged`, `go`, `released`, `waiting` and `settled`, the `landing:joined` event); no scene was changed for him.

| Section | What Kip does |
| --- | --- |
| Between sections | Stands on the coming section's label rule just past its words, facing its number (or, where that is not clear, alternates between the ends of the hairline); skipped when the coming section's moment will want him within 200 px of scroll; and arrives three ways in turn (a zip and a hop, a zip and a long skid, or up over the line); runs along the line while you scroll (dash and speed lines on a fling), skids when you stop. |
| 01 Hero | Rises over the inbox's top edge when Codex asks (smaller on a phone), points the wand at Answer (a bang too, from the second ask on); his eyes go between the stopwatch and the row; answering gets a cheer and a ring. |
| 02 Every vendor | Up on the ranked card's edge; his eyes ride the swarm in from the chips and trace the vortex, a little dizzy; a hop and a point as each row fills; a bang and a point at the top row as it re-ranks, then a ring and a happy face. |
| 03 The problem | Sits on the digits of 10:25, ears drooping minute by minute; when 10:25 lights up he hops off it onto the wait bar's right end and slumps at *23 min*; gone while the day is drawn, then up at the right end of the total line once its fill has reached it, and points up at the wait clock as the bar docks. On a phone (no pin): small, on the baseline of the orange "23" once it lands, ears down. |
| 04 The loop | Inside the app window, at full size on the list column's floor: watches the question card, types along, hops on the answer, reads the diff, eyes on Merge as the wand charges with it; on the merge the wand points at the green *Merged* label and a zap of green motes flies from the wand along one arc and lands with a ring and sparks on it, then a cheer and a flag (a real Merge click too). On a phone (no pin) the same zap and flag from the window's edge, where a spot is clear. |
| 05 Why | Nods at each answer in the product's column, then a ring (small, at the right end of the table's top rule on a phone). |
| 06 Yours | Follows the packets, shakes his head when the inbox's packet stops at the wall, wide eyes at "waited 23:04". |
| 07 Phone | Once the phone has come in and settled, lies beside it on the line of its bottom edge, taps with each touch ring, rolls happy with a heart on the merge; gives way once the numbers are 30% up the window. |
| 08 Numbers | Comes up on the chart's top gridline over Thursday; follows the chart's own cursor, one hop per day it steps (from Thursday on one bar to the right), quicker when catching up, and cheers on Sunday's 7. |
| 09 Labs | Points at each flag as it lights, twirls when all five are on; reacts to real toggles; waves at the Deck tile. |
| 10 Teams | Once the plans have parted and settled, stands at the right end of their top line, out of the headline; as the plans part (or as he first arrives, if they already have) a teammate (amber scarf) runs in beside him and they high-five; taps each seat and looks at **Apply as a design partner**. |
| 11 End | Dashes in along the wordmark's baseline, arms up and one green ring as it opens, then leaps onto the letters, runs their tops out to the M and back to the last E, skids, waves up at the inbox and plants the wand as a flag on the last E, with an ear flick now and then; points at Answer if an agent waits again; naps after 25 idle seconds unless focus is in the section. |

What the visitor can do: hover him (ears perk, the wand glows), click or tap him (wave, hop with a burst, twirl, heart, in turn; a click cuts an idle glance short, while a scripted beat only gets an ear flick), press **K** while nothing has focus (WCAG 2.1.4: a K typed on a link, a button or a field is theirs; a lap of his floor, off its end into the gutter and back with a peek where it reaches the edge; a second K within 2 s is faster) or double-tap him on a phone, and his eyes follow the cursor. After 45 seconds with no input and nothing waiting, he sits and naps; any input wakes him, and an agent asking wakes him with a bang.

What holds him in place:

- `kip/perch.ts` tests his box at every candidate spot against each line of text (`Range.getClientRects`, from the top of its glyphs, measured with the canvas, since the empty ascent above them is free), with a 40 px margin round headings, and every link, button, field and `.btn`; the largest clear spot wins (the moment's order breaks ties), and when none is, the moment rests for a moment and is asked again. He is placed only once the page's height has held still for a frame (sections rendering for the first time after a jump settle their heights). Once a second while he stands idle a guard checks him: if anything now overlaps him or his spot has moved, he goes to a clear spot or out, and if he was left invisible while owned, he is put back.
- He only changes transform and opacity. His idle bob breathes for a few cycles after each arrival and then rests, so a Kip standing still costs no style work, and a hidden one none at all. A height-only resize of under 160 px on a touch screen (a phone's URL bar) leaves him where he is; elsewhere his spot is measured again. The scroll position and window size are cached by passive listeners, so the frame task never forces a layout to read them. His chunk loads in an idle callback after the opening paints, so first-load JS does not change. This build: 30.1 KB gzipped for his JS and 0.8 KB for his CSS.
- Less motion: three still poses (a wave on the hero's inbox, the flag in the loop, a happy face on the footer's baseline), placed once and again when the page's size changes (one observer for all three); no frame is drawn, and they take no clicks. On Save-Data or low memory he runs without motes or the teammate. He is hidden in print.
- Everything he adds is `aria-hidden` and outside the tab order. `?nokip` loads none of his code. The test hook `window.__kip` gives his box and owner; his state and the spot probe are there only in development or with `?kiptest`.

`tests/landing-kip.test.ts` scrolls the built page at 1440x900, 1280x800, 1920x1080 and 390x844 (holding through each pinned section's beats) and fails if his box ever covers a visible text line (from the top of its glyphs) or control, or the page scrolls sideways. It also holds him to never being invisible while a moment owns him (on every hold, after the End key from Teams, and across fifteen jumps), to the numbers staircase ending over Sunday's bar, and, with the CPU slowed four times and the wheel in 250 px steps at 390, 1440 and 2560, to covering nothing and never peeking over content. It also checks `?nokip`, the still poses with less motion (no frames drawn), that K does nothing while a field has focus, that a phone's URL bar resizing the window leaves him in place, that everything he adds is hidden from screen readers, and that nothing logs an error. `tests/kip-tween.test.ts` covers the tween engine's easing, yoyo and repeat timing, relative values, the composed SVG transform, and that the wand never crosses his face at any arm angle.

## The ask: design partners, and the Team waitlist

**Apply as a design partner** opens an email to the brand's `contact` address (`site/landing/brand.ts`, `hello@kipdeck.com` until the founder confirms a mailbox) with three short questions (how many agents a day and with which CLIs, what you would want measured, how big the team is). It needs no server and works while the repository is private.

The Team tier waitlist form appears only in a build with `KIPDECK_WAITLIST_URL`. It sends exactly this, nothing more:

```json
{ "email": "lead@example.com", "source": "landing" }
```

The form is one field and one button (**Join the Team waitlist**); the line under it says the address is only used for the Team tier and deleted on request. Team size and price interest are asked in the one email that follows, not on the page.

The endpoint is yours to run. Keep it in the EU, store the fields and the time, and nothing else: no IP addresses in the record, no tracking pixels in the follow-up email. Answer it with CORS for the site's origin (`Access-Control-Allow-Origin`, and `content-type` in `Access-Control-Allow-Headers` for the preflight). A form service in the EU that accepts JSON works too; check its data processing terms first. Delete a person's details when they ask; the page promises that.

The older consulting page in `business/landing/` (pilots and workshops) is a separate offer and stays as it was.
