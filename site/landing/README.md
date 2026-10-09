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
node --import tsx --import=#tests/css --test tests/landing.test.ts tests/landing-scenes.test.ts tests/landing-a11y.test.ts tests/landing-kip.test.ts
```

## Change the name

The name, tagline, wordmark, npm package, source repository and contact address live in one file, `site/landing/brand.ts`. The page title, the share tags, the wordmark, every sentence that names the product, every Source and Docs link, the clone commands, the design-partner link, the structured data and the generated share card (`og.png`) all read from it. Edit the `kipdeck` entry in `BRANDS`, or add one and pick it at build time:

```bash
KIPDECK_BRAND=<id> npm run build:site
```

`tests/landing.test.ts` builds the page and fails if it says a product name other than Kipdeck. The repository is `github.com/zbagdzevicius/kipdeck`. The 30-second film is the one exception: its frames were rendered with the old UGC Army wordmark and show it until the film is rendered again.

## Build for a real address

```bash
KIPDECK_SITE_URL=https://kipdeck.com/ \
KIPDECK_REPO_URL=https://github.com/<org>/kipdeck \
npm run build:site
```

| Variable | What it does | When unset |
| --- | --- | --- |
| `KIPDECK_SITE_URL` | Canonical link, `og:url`, absolute share-card addresses, `sitemap.xml` | None of those (a relative one would be wrong wherever the page is copied) |
| `KIPDECK_REPO_URL` | Replaces the brand's repository everywhere, the clone command's folder and `cd` too | The repository in `brand.ts` |
| `KIPDECK_WAITLIST_URL` | Shows the Team waitlist form and lets it POST `{ email, source }` there (and nowhere else) | No form; the ask is the design-partner link, an email to the brand's contact address |
| `KIPDECK_DEMO_URL` | **Try the demo** opens a hosted read-only demo | **Try the demo** copies the hero's demo command |
| `KIPDECK_NPM_PUBLISHED=1` | `npx` replaces the from-source commands | The from-source commands and the "Not on npm yet" line stay |
| `KIPDECK_REPO_PUBLIC=1` | The repository is public: the clone command, the 06 terminal and the Source and Docs links are shown (`KIPDECK_REPO_URL` counts too) | Treated as private: none of them are shown, and the hero leads with the film and the design-partner email |
| `KIPDECK_BRAND` | Picks an entry in `brand.ts` | `kipdeck` |

Every address must be `https`, or the build stops. The build draws `og.png` with headless Chromium when one is installed (`playwright-core`'s, `CHROMIUM_PATH`, or Google Chrome). Without one it says so and the committed `site/landing/public/og.png` ships instead. When the brand or the headline changes, build where Chromium is available and copy `dist/site/og.png` over it.

## Deploy to Vercel (automatic)

The repository root has a `vercel.json` for the landing page: it installs with `npm ci --ignore-scripts`, builds with `npm run build:site`, serves `dist/site` and sends the same headers as `_headers`. In Vercel, connect the GitHub repository to the landing project (`kipdeck-landing`, https://kipdeck-landing.vercel.app) and leave the root directory at `./`. Set the production branch to the branch the page ships from and `KIPDECK_SITE_URL` (and any of the other addresses) under Environment Variables. Every push to that branch then goes live, and every other branch and pull request gets a preview address.

Vercel's builder has no Chromium, so the committed `public/og.png` is the share card there.

To deploy by hand instead: `KIPDECK_SITE_URL=https://<your domain>/ npm run build:site && npx vercel deploy dist/site --prod`.

The investor deck lives in `deck/` and is a second Vercel project (`kipdeck-deck`) with its root directory set to `deck` (see `deck/README.md`).

## Deploy to Cloudflare Pages

The simplest path is to build where Chromium is available (so `og.png` is drawn) and upload the folder:

```bash
KIPDECK_SITE_URL=https://<your domain>/ npm run build:site
npx wrangler pages deploy dist/site --project-name <your project>
```

The first run asks you to log in to Cloudflare and creates the project. Add your domain under the project's Custom domains.

To build on Cloudflare instead (Pages, connect the Git repository):

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm ci --ignore-scripts && npm run build:site` |
| Build output directory | `dist/site` |
| Environment variables | `NODE_VERSION=22`, `KIPDECK_SITE_URL=https://<your domain>/`, and any of the others above |

`--ignore-scripts` skips building the whole app, which the page does not need. Cloudflare's builder has no Chromium, so `og.png` is not drawn there: commit a drawn one to `site/landing/public/og.png`, or deploy with `wrangler` as above.

`site/landing/public/_headers` ships with the build: Cloudflare Pages reads it to cache the hashed `assets/` for a year and the film for a week, and to send `nosniff`, `no-referrer` and a closed `Permissions-Policy`. Vercel ignores it, so the root `vercel.json` repeats these headers (`tests/landing.test.ts` keeps the two the same). Other hosts ignore it. The page's Content-Security-Policy is in its own `<meta>` tag, so it holds on any host.

## What each section shows, and what moves

Everything is drawn in code from the app's own tokens and glyphs: DOM replicas of the inbox, inline SVG, Canvas2D, CSS 3D, one small WebGL pass and, in Labs only, a three.js bridge loaded on demand. Demo data, measured numbers and illustrations are each labelled where they appear.

| Section | What it says | What moves, and why |
| --- | --- | --- |
| 01 Hero | Your agents are waiting on you | Agent units fly out of the mark to their lanes and the headline breathes in, while Codex is already waiting at the top of the inbox and every clock on the page counts your own wait (the stopwatch on "waiting", the line along the top, the top bar, the favicon), all painted from one state. Answering the row clears them all (scrolling and copying never do); Codex asks again a little later. The finished change under it has a green Merge. The field never crosses the words. |
| 02 Every vendor | Five CLIs, one list, oldest wait first | The card is there from the first frame, its rows dashed slots labelled with vendor chips. Units stream from the five chips, spiral into the card and fill the slots, then the rows re-rank from vendor order to wait order. |
| 03 The problem | 23 minutes of nothing | A clock runs 10:02 to 10:25 while one wait bar heats to orange; then a workday of five agents draws its waits, and a bar under the day fills with all of them and docks into the page's own wait clock: that is the metric. |
| 04 The loop | Ask, answer, review, merge | The agent's raw terminal prompt reflows into a question card, the reply types, the diff assembles as real code, the tests run to 12/12, and Merge sends a small green ring and a green *Merged* beside the button. Pinned on wide screens; scroll back and it plays backwards. |
| 05 Why | The layer across the tools you have | Vendor inboxes and agent workbenches by name. Every answer is readable from the first frame; the table draws its lines, pops each answer's mark and frames our column last. |
| 06 Yours | One command, your machine, a signed record | A three-line security strip (localhost by default, sign-in off localhost, a signed record whose key stays on the machine); the terminal runs in about a second; the measured times (3.4 s, 10.7 s, 4 clicks, scripted demo) count up as soon as they are in view; packets pass through your machine's wall to the model APIs and stop at it on the way to servers of ours (there are none); the signed record prints like a receipt. |
| 07 Phone | Answer from anywhere | The phone turns in and rests flat, a push drops, and touch rings answer Codex and merge the README. |
| 08 Numbers | The metric a team lead asks for | A modelled week's columns grow while the median rolls from 23 to 7 minutes. |
| 09 Labs | What else is in the box | The `--labs` command line switches its flags on in turn and lights each tile; inbox rows lift into consoles on a bridge deck, and a three.js bridge takes over on capable devices. The flags are real toggles. Proof of Merge (testnet only) is a card here. |
| 10 Teams | Free for you, paid for the team | A zipper line runs between the plans; five empty seats; **Apply as a design partner** opens an email to the brand's contact address. The page ends here. |
| 11 End | Nothing waits on you | The footer tells the truth about the wait (it offers Answer if Codex asked again), the wordmark opens to the header's width, then the links and credits. |

With less motion (the system setting) none of it runs: every section shows its final state, and only the hero's clocks keep counting. Without script the page reads in full.

## Kip

Kip, the investor deck's mascot (same drawing, poses and green merge wand), lives on the page. Between sections he stands on the next section's label rule and runs along it as you scroll, with speed lines when you scroll fast and a skid when you stop, and in each section he plays along with the scene: he comes up over the hero's inbox when Codex asks and points his wand at Answer, watches the funnel's swarm, droops while the 23 minutes run, types and reads in the loop and zaps the green Merged label with his wand, hops down the numbers chart day by day, high-fives a teammate when the plans part, and for the finale dashes in along the footer's wordmark and runs along the tops of its letters, then plants his wand as a flag on the last E. Where nothing on screen has room for him, he peeks up beside the content column once the page is still (not on a phone). His eyes follow the cursor. Click him for a trick, press **K** while nothing has focus (or double-tap him on a phone) for a lap, and leave the page alone for 45 seconds and he naps.

He never stands over text, a link, a button or a field: every spot is checked against the page's text lines and controls, and a spot that is not clear is skipped. He is decorative (`aria-hidden`, never focusable), loads in his own chunk after the opening has painted, and is hidden in print. With less motion he is a still drawing in three places (hero, loop, footer). `?nokip` turns him off and loads none of his code. His code is in `src/kip/`, one module per section in `src/kip/moments/`.

## Honest limits

- No users and no revenue yet; the page says so and asks for five design partners.
- Proof of Merge runs on testnets only (Solana devnet, Base Sepolia) with test funds; every chain value says so.
- `npx kipdeck` is not on npm yet: the page shows the run-from-source command and says so.
- The repository named in `brand.ts` must be public for the Source and Docs links and the clone command to work for visitors. The design-partner ask is an email to `contact` in `brand.ts`, so it works while the repository is private.
