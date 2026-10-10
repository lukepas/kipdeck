# Kipdeck investor deck

A static pitch deck: 14 slides plus an appendix, 1920x1080, scaled to any screen, read top to bottom on a phone. No build step, no trackers. Fonts (SIL OFL) and GSAP are served from `site/`.

## Run it

```
node scripts/serve.mjs        # http://127.0.0.1:4321 (PORT=5340 node scripts/serve.mjs for another port)
```

The scripts below also honour `PORT`, so they can run inside a fixed port range on a shared machine.

## Present

- Arrows, Space or a click on the right two thirds move forward; Left or a click on the left third goes back. Swipe on touch screens.
- Going back shows the slide's final frame. R replays the current slide's motion.
- F full screen, P opens a presenter window (notes, next slide, timer, kept in sync), B blacks the screen, S hides source captions, ? shows the keys.
- URL options: `#5` opens slide 5, `?hold=final` or `?hold=1.2` freezes motion (for screenshots), `?static` shows final frames, `?theme=light`, `?print`, `?nokip` hides the mascot.
- `prefers-reduced-motion` shows final frames with no transitions.

## Kip, the mascot

Kip is Kipdeck's own mascot (the same character the app draws), drawn as inline SVG and moved with GSAP. He appears only where a moment earns him, and is off stage everywhere else so nothing competes with a slide's one point: he rises over the queue and waves on slide 1, pops onto the player for the merge in the demo on slide 6 (cued by the video, then he leaves), lands on the cleared queue on the ask (slide 14) and naps in the corner of the appendix (slide 15). He never covers text.

- Hover him and he looks at you; click for a wave, hop, twirl or heart. K (or five quick clicks) sends him on a lap of the stage. Left alone for a minute, he dozes off.
- Going back shows him at the slide's resting spot; R replays his moment with the slide.
- `prefers-reduced-motion`, `?static` and `?hold` keep him in still poses. Phones and the PDF get two still stickers (slides 1 and 14) instead.
- Turn him off with `kip: false` in `site/config.js`, or for one viewing with `?nokip`.
- `npm run check:kip` checks that he is on slides 1, 14 and 15 only (plus the slide 6 merge), never over text, and the print, phone, reduced-motion and keyboard modes. It writes its test PDF to the temp folder, so it never changes `out/`.
- Stepping forward, he runs out to the right and in from the left, so the slides play as one film. Going back cuts straight to his spot.

Files: `site/kip.js` (the character and his gestures), `site/kip.css`, `site/wow.js` (his moments, plus small extras such as the tilting queue on slide 1).

## Check it

```
npm run check                   # both checks below
npm run check:deck              # type at least 14 px (13 px on a phone), the cover and close queues, phone footer, banned copy,
                                # plus one live playback of slides 1 and 14 on desktop and phone
npm run check:kip               # Kip's moments and modes
```

## Motion

- The cover queue ends mixed: three agents need you, five keep working. Waits read as ages (34m 12s, not a time of day) and are tinted by age: fresh, over 5 minutes, over 30 minutes. At rest the clocks keep ticking once a second.
- The ask clears that same queue: each wait ticks in real seconds until its row snaps green with "waited 34m" and a check pulse, the count drops to 0 and the header diamond turns into a check. Then "Nobody waiting." and one closing line. On a phone the merges start as the slide scrolls in.
- Never put a CSS `opacity` transition on an element GSAP fades (the queue rows): the two fight and the row ends invisible. `check:deck` plays slides 1 and 14 live to catch this.
- Slide 6 plays the recording only in live playback. Still frames (`?static`, `?hold`, print, reduced motion) keep the poster; a click still plays it.
- `prefers-reduced-motion`, `?static`, `?hold` and print show still final frames: no ticking, no pulses.

## Export the PDF

```
node scripts/pdf.mjs            # out/deck.pdf, dark, one slide per page
node scripts/pdf.mjs --light    # out/deck-light.pdf, light theme for paper
node scripts/pdf.mjs --out=x.pdf  # write to another file instead
node scripts/shots.mjs --phone  # shots/NN-final.png, NN-mid.png, phone-NN.png
```

The scripts use playwright-core from the repository root (`npm install` there first) (override with `PLAYWRIGHT_CORE`). Ctrl/Cmd+P in the browser also prints one slide per page.

## Deploy

The deck lives in `deck/` of the Kipdeck repository and is its own Vercel project (`kipdeck-deck`, https://kipdeck-deck.vercel.app), separate from the landing page. In Vercel, connect the GitHub repository to that project and set its root directory to `deck`. `deck/vercel.json` serves `site/` as-is with `noindex` and `no-referrer` headers; there is no build step. Every push to the production branch then goes live, and other branches get preview addresses.

By hand, from `deck/`:

```
vercel deploy --yes             # preview URL, not production
vercel deploy --yes --prod      # production
```

## Change the product name and details

Everything lives in `site/config.js`:

- `name`: every `{{name}}` in the deck and the `npx` command follow it.
- `npmPublished`: flip to `true` once `npx kipdeck` is on npm; the install claims and the demo CTA change with it.
- `team`: the names, spelled once (diacritics included).
- `contactEmail`, `demoUrl`, `repoUrl`: shown on the ask slide when set; empty values are left out.
- `commitment`: the disclosure line on the team slide.

## Layout

- `site/index.html` - slide content and speaker notes (`<aside class="notes">`)
- `site/deck.css` - tokens, type scale, per-slide layout, transitions, phone and print modes
- `site/slides.js` - one GSAP timeline per slide
- `site/deck.js` - navigation, scaling, presenter window, print
- `site/kip.js`, `site/kip.css`, `site/wow.js` - Kip the mascot and the per-slide extras
- `site/media/` - product stills, the one-minute demo (kipdeck-demo-v2.mp4, 67 s) and the 27 s GIF
- The logo (Kip's face with his tuft as the signal light) on the cover, the ask and every slide's footer, plus `site/favicon.svg` and `site/apple-touch-icon.png`: all written from `src/shared/logo.ts` by `npm run logo` at the repository root, so do not edit those copies by hand. The cover lights Kip's light in the needs-you colour; the ask leaves it calm.

## Before sending

- The team slide discloses that all three founders work at Motored today. Replace `commitment` in `site/config.js` with the signed full-time dates, equity split and IP assignment before the deck goes out.
- Confirm titles (Ernestas is "Software Engineer" per the Motored data room) and add Lukas's LinkedIn.
- Fill `contactEmail` (and `demoUrl`, `repoUrl` once public).
- Confirm post-money SAFE with counsel and incorporate the company.
- Replace the scripted demo with a recording of live agent sessions, and the illustration on slide 2 with a measured wait from your own use.

## Licences

Space Grotesk, Inter and JetBrains Mono: SIL OFL 1.1 (`site/fonts/LICENSE-*.txt`). GSAP 3: GreenSock standard no-charge licence, commercial use allowed. Team photos come from the founders' own data room.
