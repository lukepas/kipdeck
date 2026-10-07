# The landing page

Back to the [README](../README.md).

`site/landing/` is the product's one-page site, built with Vite into `dist/site/`. It acts out the product around one number: how long an agent waits on a person. An agent in the hero's inbox is waiting on the visitor from the first frame. The word *waiting* widens with a live stopwatch, a Signal line along the top of the window grows in real seconds, and the top bar counts it. Answering the row (or copying the command) clears every clock at once.

The twelve sections, in order: the hero, every vendor in one list, the 23 minutes an unanswered question costs, the loop (ask, answer, review, merge), *Why not the tools you already have?*, running it yourself with the measured times, the phone, Numbers, Labs with the 30-second film, Proof of Merge (testnet only), the team tier with its waitlist, and the end.

Everything on it is drawn in code from the app's own tokens and glyphs (`src/client/styles/tokens.css` is imported, not copied): DOM replicas of the inbox, the question card and the diff, inline SVG and one Canvas2D field. There are no stock pictures. It loads nothing from other sites, sets no cookies and has no analytics; its Content-Security-Policy allows scripts, styles, fonts and media from its own folder only. The fonts are Archivo and JetBrains Mono (SIL Open Font License, the texts ship beside the build).

## What it promises, and the tests that hold it to that

- Every staged surface carries a *Demo data*, *measured* or *illustrative* tag. The measured numbers (3.4 s to the first agent, 10.7 s and 4 clicks to the first merge) come from `design/shots/fundable/final/measure.json`.
- Every chain value in Proof of Merge is a real testnet artifact and says so (Solana devnet, Base Sepolia, test USDC).
- Until `MERGELINE_NPM_PUBLISHED=1`, the page shows the from-source command and says *Not on npm yet*. It never shows a command that 404s.
- No traction is invented: the ask is five design partners.
- With less motion (the system setting) every section shows its final state, nothing ticks and the stopwatch reads a still 23:00.

`tests/landing.test.ts` builds the page once per brand, serves it on 127.0.0.1 and checks all of the above in headless Chromium. It also checks the waitlist, the phone width, both themes, the film window (its x and Esc both close it) and layout shift.

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
- `site/landing/src/engine/`: one shared `requestAnimationFrame` loop that runs only while something moves and stops when the tab is hidden, a spring, counters, and what the device asks for (less motion, Save-Data, low memory).
- `site/landing/src/fx/field.ts`: the hero's Canvas2D field (a dot grid that bends toward the cursor, agent units drifting in five vendor lanes, the one that blocks on you). It lives in typed arrays, allocates nothing per frame, and halves its units if frames run slow.
- `site/landing/src/ui/wait.ts`: the page's one piece of state, whether a scripted agent is waiting on the visitor and since when.
- `site/landing/public/media/`: the 30-second film re-encoded for the web (AV1 WebM, H.264 MP4 and the 9:16 cut for phones) and its posters. The film never plays by itself and loads only when someone opens it.

`node design/shoot-landing.mjs design/shots/landing/<stage> [--clip]` serves a build and shoots it at 1440x900, 1920x1080 and 390x844 in both themes and with less motion. It also measures largest contentful paint, layout shift, frame times over a full scroll and what the first load weighs, and with `--clip` records a scroll-through video.

## The waitlist

The form sends exactly this, nothing more:

```json
{ "email": "lead@example.com", "source": "landing" }
```

The form is one field and one button; the line under it says the address is only used for the team tier and deleted on request. Team size and price interest are asked in the one email that follows, not on the page.

The endpoint is yours to run. Keep it in the EU, store the fields and the time, and nothing else: no IP addresses in the record, no tracking pixels in the follow-up email. Answer it with CORS for the site's origin (`Access-Control-Allow-Origin`, and `content-type` in `Access-Control-Allow-Headers` for the preflight). A form service in the EU that accepts JSON works too; check its data processing terms first. Delete a person's details when they ask; the page promises that.

The older consulting page in `business/landing/` (pilots and workshops) is a separate offer and stays as it was.
