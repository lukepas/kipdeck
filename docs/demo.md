# The demo

Kipdeck gives you full control and clarity over every AI coding agent you run, in one place. The demo shows that in a minute, with scripted agents.

Back to the [README](../README.md).

See the whole loop in a minute without an agent CLI, a sign-in or a model:

```bash
npx kipdeck --demo
```

![The demo: Codex's question answered, Claude Code's diff reviewed and merged into Shipped today (scripted agents, no model)](img/demo.gif)

It opens the inbox in your browser, signed in, on a throwaway repository called `acme-shop`, and five agents start on it: two on Claude Code, two on Codex and one on Cursor. They are scripted stand-ins, so nothing runs a model and nothing costs anything, but the office reads them exactly as it reads the real CLIs: each reports over that agent's own hooks, works on a branch of its own in a worktree, and commits real files, so the diffs are real diffs and Merge really merges. A **Demo** pill in the top bar says it's the demo, with the command to copy for the real thing (the full note is its tooltip; on a narrow phone it is the tag alone). Until Kipdeck is on npm that is `kipdeck`, not `npx kipdeck`, which would 404: build and link the clone once (`cd kipdeck && npm install && npm run build && npm link`), then run it from your own repository (`cd ~/code/your-project && kipdeck`), as the README's From source says; `ON_NPM` in `src/shared/demo.ts` switches it, and there is no Get started checklist. Codex's question opens in the pane by itself as a card with its two numbered choices and one reply box.

The repository lives in a fresh temporary folder, never in your code. Ctrl+C stops the agents and deletes the folder. The demo needs Node.js 20+ and git; on Windows, run it in WSL (the stand-ins are sh scripts). Anonymous usage numbers are always off in the demo.

## What happens

The script is the same every time (`src/server/demo/script.ts`):

| When | Agent | What you see |
| --- | --- | --- |
| 0:00 | all five | They arrive under **Working**, one by one, each with a line saying what it's doing (`Read: api/login.js`, `Bash: npm test`...). |
| about 0:20 | Codex, *Fix the flaky checkout test* | It ran the test, found `.total` drawn twice, and asks how to fix the test, with two choices: *1. Fix the selector* and *2. Update the snapshot*. The row moves to **Needs you**, and rises in. |
| about 0:35 | Claude Code, *Add rate limiting to /api/login* | Done: a rate limiter, its tests and the login route, three files. The row moves to **To review**. |
| about 0:50 | Cursor, *Write the README quickstart* | Done: the README and `docs/quickstart.md`. **To review**. |
| always | Claude Code, *Upgrade the payment SDK to v5*; Codex, *Port the settings page to the form kit* | They keep working, so the inbox never looks finished. |

Each first wait is dated back so the demo shows waits the way a real team's morning would: Codex's question reads 12 minutes old (aging: its clock in bold), the rate limit review 41 minutes (stale: heavier and underlined) and the README review 3 minutes. These ages are demo data, set in the script (`waited`); a second wait in the same round counts from when it starts.

Then it's yours:

1. **Answer.** Press **Answer** on Codex's row (or Enter): its question card opens in the pane. Press **1 Fix the selector** (the stand-in takes the one digit, as Claude Code does), or type an answer in the box. The row goes back to Working, a settled toast says it's back at work, and a little later Codex's fix is in To review.
2. **Review.** **Review changes** on Claude Code's row opens the diff beside the list, with *into main* over it.
3. **Merge.** **Merge** waits about seven seconds behind a toast that says *Merging into main on this computer*, with **Undo**. Then it merges its branch into `acme-shop`'s `main` on your computer, the toast turns to *Merged into main on this computer* with how long it waited on you, and the change lands in **Shipped today**, signed in the shipped log.
4. **Send back** with a note works too: the stand-in commits the note and finishes again.
5. **Deploy agent** works with any task: the stand-in writes a short note about it in `notes/`, commits it, and finishes.

To see it on your phone, start it with `--host 0.0.0.0` and sign in from the phone with the password the terminal prints.

## The hosted demo

`kipdeck --demo --read-only` is the demo for a public address: anyone who opens it is signed in to watch, with no password, and nothing they send changes anything.

- **Watching.** Visitors see the same inbox, the agents' live terminals, their diffs and Shipped today. Over the socket the office only takes the messages that look (a terminal's screen, a diff, the shipped log); over HTTP only GET and HEAD. Anything else (Deploy agent, typing into a terminal, Merge, Labs) is dropped, and a toast says *This demo is read only*. Until Kipdeck is on npm the repository is private, so the pill and the toast ask a visitor to get access from the team rather than show a command or a repository they couldn't use (the pill's ask links to the design-partner section of kipdeck.com); once `ON_NPM` is on they show `npx kipdeck --demo`. Like every demo office it has no Get started checklist. A visitor's presence and usage-limit lookups are dropped quietly.
- **A scripted reviewer.** Since nobody watching can act, the office plays the reviewer, *Demo Lead (scripted)*: it answers Codex's question about ten seconds after it's asked (choice 1), merges each finished change ten or twelve seconds after it's done, and 25 seconds after the last merge starts the round over from the repository's first commit with an empty shipped log. A round is about 80 seconds; one that gets stuck starts over after five minutes.
- **Deploying it.** [`deploy/demo/Dockerfile`](../deploy/demo/Dockerfile) is the image (Node, git and the build; no agent CLI, no volume), and [Fly.io's notes](fly.md#a-public-read-only-demo) deploy it with [`deploy/demo/fly.toml`](../deploy/demo/fly.toml). Any Docker host works: publish port 8080 and set `AGENT_OFFICE_ALLOWED_HOSTS` to the names it's reached at. What it exposes is in [Security](security.md#the-read-only-demo).

## Faster

`KIPDECK_DEMO_PACE=4 npx kipdeck --demo` plays the script four times faster (up to 20): the question comes at about 0:05. The tests run it at six.

## The video, the GIF and the deck's screenshots

All three are made from the demo by scripts, so they can be made again after a change:

```bash
npm run build
node design/record-demo.mjs design/shots/fundable/final   # the one-minute silent video and the GIF of the loop (under 30 s; needs ffmpeg)
node design/shoot-demo.mjs stage-6/after   # screenshots, with the deck's four in shots/fundable/stage-6/deck/
node design/shoot-final.mjs final          # the fundraising build's stills: first run, the loop, the surfaces, the landing page
```

- **`design/record-demo.mjs`** records the loop in a headless browser at 1440x900 and on a 390x844 phone, with captions on the page, a *Demo data* tag in the corner and a pointer where it clicks, cuts the waiting out with ffmpeg, and adds a title card, the terminal's real output for `kipdeck --demo` (`npx kipdeck --demo` once `ON_NPM` in `src/shared/demo.ts` is true), and an end card with the command, `github.com/zbagdzevicius/kipdeck` and, while Kipdeck is not on npm, the from-source steps. Each merge is cut from the click to the moment it lands in Shipped today, past the undo countdown, and the phone's captions sit beside the phone so they never cover it. It writes `kipdeck-demo.mp4` (silent, about a minute) and `kipdeck-demo.gif` to the folder it's given (`design/shots/fundable/stage-5/video/` by default; none of them in git) and copies the GIF to `docs/img/demo.gif` for the README and the landing page. The end card says it was recorded with the demo's scripted agents. `REC_DECK=1` adds the 3D Deck (`/deck`) as a wall display.
- **`design/shoot-demo.mjs`** takes the screenshots: the agents arriving, the inbox with a question and a change to review, the answer, the diff, the merge, the same on a phone, the Deck as a wall display, and the hosted demo with its read-only note. It starts the hosted office just before its shots and waits up to two rounds for its row, and fails if the demo's director logged a failed answer or merge. The deck's four (home, the pane with the diff, the phone and the Deck as a wall display) are copied to `deck/` without toasts. `home-desktop.png`, `home-phone.png` and `deck-wall-desktop.png` are the README's and `docs/inbox.md`'s `docs/img/inbox.png`, `inbox-phone.png` and `deck-wall.png`.

The pitch video with real agents follows the same story on a real repository, recorded by hand: `npx kipdeck` in the repository, three agents deployed from the sheet (Claude Code, Codex, Cursor), the question answered from its row, a diff reviewed and merged, one merged from a phone. If a step needs a retake, the demo is the fallback.

## For developers

The demo is `src/server/demo/`: `script.ts` (the repository's files, the fleet's steps and the reviewer's schedule, as data), `standin.ts` (the stand-in agent, written out as `standin.cjs` with an sh wrapper per command), `workspace.ts` (the repository and the stand-ins, first on the office's PATH), `index.ts` (`setUpDemo`, called by `cli.ts` before the office starts), `director.ts` (seats the fleet and, read only, plays the reviewer and the rounds; started with the office's clocks) and `readonly.ts` (what a visitor may send). The way in is `http/routes/demo.ts`, a route that only exists in the read-only demo. The page's note is `src/client/home/demo.ts`, from the welcome message's `demo`. Tests: `tests/demo.test.ts` (the script, the guard, the options and the hosted demo end to end, into its second round: three merges again and no error from the director) and `tests/demo-e2e.test.ts` (the demo in a browser).
