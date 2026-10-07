# The landing page

The product's one-page site: a static build in `dist/site/` that any static host can serve. It acts out the product around one number, how long your coding agents wait on you. Every motion on it explains something the product does; nothing is there to decorate. [docs/landing.md](../../docs/landing.md) has the full write-up (budgets, tests, accessibility, search tags); this page is the short version for running, changing and shipping it.

## Run it

There is nothing extra to install. The page builds with the repository's own Vite, so after `npm install` at the repository root:

```bash
npm run build:site        # builds site/landing/ into dist/site/
npm run preview:site      # serves dist/site/ on http://127.0.0.1:4690/
```

Open it through the preview server (or any static server), not from disk: its scripts are ES modules, which browsers will not run from `file://`. For live reload while you edit:

```bash
cd site/landing && npx vite     # http://127.0.0.1:4691/
```

To check it:

```bash
npm run typecheck         # includes site/landing/tsconfig.json
npm run perf:site         # builds, measures the budgets in headless Chromium, exits 1 if one breaks
node --import tsx --import=#tests/css --test tests/landing.test.ts tests/landing-scenes.test.ts tests/landing-a11y.test.ts
```

## Change the name

The name, tagline, wordmark, npm package and source repository live in one file, `site/landing/brand.ts`. The page title, the share tags, the wordmark, every sentence that names the product, every Source and Docs link, the clone commands, the design-partner link, the structured data and the generated share card (`og.png`) all read from it. Edit an entry in `BRANDS`, or pick one at build time:

```bash
MERGELINE_BRAND=ugc-army npm run build:site
```

`tests/landing.test.ts` builds both brands and fails if either build says the other name or clones the other repository. The 30-second film is the one exception: its frames are drawn with the UGC Army wordmark, so a Mergeline build's film shows that name until the film is rendered again.

## Build for a real address

```bash
MERGELINE_SITE_URL=https://mergeline.dev/ \
MERGELINE_REPO_URL=https://github.com/<org>/mergeline \
npm run build:site
```

| Variable | What it does | When unset |
| --- | --- | --- |
| `MERGELINE_SITE_URL` | Canonical link, `og:url`, absolute share-card addresses, `sitemap.xml` | None of those (a relative one would be wrong wherever the page is copied) |
| `MERGELINE_REPO_URL` | Replaces the brand's repository everywhere, the clone command's `cd` too | The repository in `brand.ts` |
| `MERGELINE_WAITLIST_URL` | Shows the Team waitlist form and lets it POST `{ email, source }` there (and nowhere else) | No form; the ask is the design-partner link, a new GitHub issue |
| `MERGELINE_DEMO_URL` | **Try the demo** opens a hosted read-only demo | **Try the demo** copies the hero's demo command |
| `MERGELINE_NPM_PUBLISHED=1` | `npx` replaces the from-source commands | The from-source commands and the "Not on npm yet" line stay |
| `MERGELINE_BRAND` | `ugc-army` builds the other name | Mergeline |

Every address must be `https`, or the build stops. The build draws `og.png` with headless Chromium when one is installed (`playwright-core`'s, `CHROMIUM_PATH`, or Google Chrome); without one it says so and skips the card.

## Deploy to Cloudflare Pages

The simplest path is to build where Chromium is available (so `og.png` is drawn) and upload the folder:

```bash
MERGELINE_SITE_URL=https://<your domain>/ npm run build:site
npx wrangler pages deploy dist/site --project-name <your project>
```

The first run asks you to log in to Cloudflare and creates the project. Add your domain under the project's Custom domains.

To build on Cloudflare instead (Pages, connect the Git repository):

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm ci --ignore-scripts && npm run build:site` |
| Build output directory | `dist/site` |
| Environment variables | `NODE_VERSION=22`, `MERGELINE_SITE_URL=https://<your domain>/`, and any of the others above |

`--ignore-scripts` skips building the whole app, which the page does not need. Cloudflare's builder has no Chromium, so `og.png` is not drawn there: commit a drawn one to `site/landing/public/og.png`, or deploy with `wrangler` as above.

`site/landing/public/_headers` ships with the build: Cloudflare Pages reads it to cache the hashed `assets/` for a year and the film for a week, and to send `nosniff`, `no-referrer` and a closed `Permissions-Policy`. Other hosts ignore it. The page's Content-Security-Policy is in its own `<meta>` tag, so it holds on any host.

## What each section shows, and what moves

Everything is drawn in code from the app's own tokens and glyphs: DOM replicas of the inbox, inline SVG, Canvas2D, CSS 3D, one small WebGL pass and, in Labs only, a three.js bridge loaded on demand. Demo data, measured numbers and illustrations are each labelled where they appear.

| Section | What it says | What moves, and why |
| --- | --- | --- |
| 01 Hero | Your agents are waiting on you | Agent units fly out of the mark to their lanes and the headline breathes in. 2.4 s in, Codex stops and asks: its row climbs to the top and every clock on the page starts counting your own wait (the stopwatch on "waiting", the line along the top, the top bar, the favicon). Answering the row, or copying the command, clears them all. The field never crosses the words. |
| 02 Every vendor | Five CLIs, one list, oldest wait first | The card is there from the first frame, its rows dashed slots labelled with vendor chips. Units stream from the five chips, spiral into the card and fill the slots, then the rows re-rank from vendor order to wait order. |
| 03 The problem | 23 minutes of nothing | A clock runs 10:02 to 10:25 while one wait bar heats to orange; then a workday of five agents draws its waits, and a bar under the day fills with all of them and docks into the page's own wait clock: that is the metric. |
| 04 The loop | Ask, answer, review, merge | The agent's raw terminal prompt reflows into a question card, the reply types, the diff assembles as real code, the tests run to 12/12, and Merge sends a shockwave and stamps MERGED. Pinned on wide screens; scroll back and it plays backwards. |
| 05 Why | The layer across the tools you have | The comparison table draws its lines and decodes its answers; the column that says yes lights last. |
| 06 Yours | One command, your machine, a signed record | The terminal runs in about a second; the measured times (3.4 s, 10.7 s, 4 clicks, scripted demo) count up as soon as they are in view; packets pass through your machine's wall to the model APIs and stop at it on the way to servers of ours (there are none); the signed record prints like a receipt. |
| 07 Phone | Answer from anywhere | The phone turns in and rests flat, a push drops, and touch rings answer Codex and merge the README. |
| 08 Numbers | The metric a team lead asks for | A modelled week's columns grow while the median rolls from 23 to 7 minutes. |
| 09 Labs | What else is in the box | The `--labs` command line switches its flags on in turn and lights each tile; inbox rows lift into consoles on a bridge deck, and a three.js bridge takes over on capable devices. The flags are real toggles. |
| 10 Teams | Free for you, paid for the team | The plans part like a zipper; five empty seats; **Apply as a design partner** opens a GitHub issue. |
| 11 Proof of Merge | Paid only when a human merges (testnet only) | Test USDC drops into escrow and locks; half in view, the merge happens once on its own, the lock opens, the amount counts out and the testnet receipt settles. The button replays it. |
| 12 End | Nothing waits on you | The footer tells the truth about the wait (it offers Answer if Codex asked again), gives the demo command and the links, and the wordmark opens to the header's width. |

With less motion (the system setting) none of it runs: every section shows its final state and nothing ticks. Without script the page reads in full.

## Honest limits

- No users and no revenue yet; the page says so and asks for five design partners.
- Proof of Merge runs on testnets only (Solana devnet, Base Sepolia) with test funds; every chain value says so.
- `npx mergeline` is not on npm yet: the page shows the run-from-source command and says so.
- The repository named in `brand.ts` must be public for the Source, Docs and design-partner links to work for visitors.
