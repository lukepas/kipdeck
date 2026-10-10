# Kipdeck: the fundraising build

What this branch is, what changed to make it fundable, what was cut or hidden and how to bring it back, the numbers, and the script for showing it to an investor. Kipdeck is built on [agent-office](https://github.com/AgentSystemLabs/agent-office) by webdevcody (MIT). LICENSE keeps upstream's copyright line and MIT text and adds ours; NOTICE (ours) credits upstream.

## The direction

The POC was a 3D starship bridge where AI coding agents sat at stations, with a 2D view, Mission control, boards, a task queue, meetings, voice, a showcase and Proof of Merge on testnets. It was impressive and hard to explain: many screens, many buttons, and no single number that said why anyone would pay.

The direction we took: **one inbox for every coding agent you run, built around human wait time.** An agent that asks a question at 10:02 and is answered at 10:25 did nothing for 23 minutes. Agent vendors are racing to make agents faster; nobody is measuring or shrinking the time agents spend blocked on a person, across vendors. That is the wedge:

- **Cross-vendor.** Claude Code, Codex and Cursor side by side (OpenCode, Pi and others in beta), each on a branch of its own. A vendor's own dashboard only sees its own agents.
- **Self-hosted.** It runs on the engineer's laptop or the team's dev box. Code, prompts and the review record never leave it, which is what European and regulated teams ask first.
- **The metric.** Every merge and send-back is a signed record: which agent and model, who reviewed it, how long it waited on a person. The top bar shows who is waiting now and the median wait today; Numbers shows the week.

Everything that is not that loop is a lab, on by default (an admin can switch any off), still compiled and tested.

### Business model (for the pitch, not the app)

- **Free and open source (MIT), single player.** The inbox, the demo, local merges, the signed log, Numbers. This is the distribution: `npx kipdeck` in any repository.
- **Paid team tier (waitlist on the landing page).** A shared inbox for a team, questions routed to whoever owns them, single sign-on, an audit trail of who merged what and team-level wait-time reporting. Accounts and invite links already work in the free version; routing, SSO and audit export are the paid build.
- **What the team built beyond the fork.** The fork gave a 3D office with terminals at desks. This team built: the attention ranking that every surface shares, the inbox, the question card, the signed shipped log and its metrics, merging without GitHub, one-command onboarding with no password on your own computer, `kipdeck attach`, the scripted demo and its read-only hosted mode, Labs, and the whole Proof of Merge track (devnet bounty escrow, Base Sepolia attestations, ERC-8004 reputation, x402 paid tasks), now parked as a lab.

## What changed in this round, and why

Three critics (an investor, a first user and an engineer) reviewed the build before this round (`design/shots/fundable/review/`). Every item they marked **must** is fixed; most **should** items and several **nice** ones are too. Commits on `product/fundable` after `ae964cad`.

### Musts

| Critique | What we did |
| --- | --- |
| The pane was 60% white space at the moment an investor looks | On a wide screen the oldest agent waiting on you opens in the pane by itself; Esc holds it empty until another one starts waiting. The "Start with the oldest" button only shows when you emptied it yourself. |
| Nothing said why this wins against vendor dashboards, task boards and GitHub | The landing page's subhead is the wedge (who is waiting and for how long, across agent CLIs); human wait time is the second section; a *Why not the tools you already have?* table. The app's top bar carries the pulse: waiting on you now, median wait today, merged today. |
| The demo diff read as a test harness, with "(demo)" in every title | All final stills, the video and the GIF come from `--demo`, whose agents commit real code (a rate limiter with tests, a selector fix, a quickstart). Titles carry no "(demo)"; one pill in the top bar and a corner tag on the video say it's the demo. |
| A DEMO card and a checklist pushed the queue 270 px down | The demo note is a pill in the top bar with the command to run it for real; the demo has no Get started checklist; in a real first run the checklist sits under the list. |
| The hosted demo's shoot timed out | Diagnosed: timing, not a regression. The shoot started the hosted office with the local one, so it was rounds in by the time its shots came, and a row is in To review 12 s of each 85 s round. `tests/demo.test.ts` now follows the hosted demo into its second round (three merges again, no director error); the shoot starts the hosted office just before its shots and fails on any director error. The landing page's **Watch 30 seconds** sits next to **Try the demo** as the fallback. |
| The question was a raw terminal line, with three ways to answer | A question card over the terminal: the question in plain words, one reply box, a button per numbered choice (read off the screen, so it works for every CLI). The header's second Answer and the terminal's reply bar step aside; the 1/2/3/Esc/^C strip folds behind **Keys**. |
| Toasts covered the reply box and Merge, toasted your own actions, said "hired" and Labs noise | Toasts stack at the bottom of the list's column (top on a phone). Nobody is toasted about what they just did. "Deployed", not "hired". Switching a lab toasts nobody. |
| Review had two competing action bars and showed `.agent-office/worktrees/...` | Send back and Merge only; the Changes footer shows in the pane only while something is uncommitted, without the worktree path. To review rows say *3 files, +70 -0* and *ready 2m*. |
| The avatar menu had four more places to manage work, and "Mission control" competed with home | The menu is Numbers, Settings, Help and keys, Sign out. Issues, Pull requests, the Task queue and Mission control are the **GitHub boards and queue** lab. Labs is at the foot of Settings > Account and in Ctrl+K. |
| `npx kipdeck` returns 404 on npm | The README and the landing page say it isn't on npm yet and how to run it from source; the landing build drops that line with `KIPDECK_NPM_PUBLISHED=1`. Publishing waits on the trademark search (`business/naming.md`). The cold-npx timing is labelled as measured from a local `npm pack` tarball. |

### Shoulds and nices done

- **Setup card**: one line when everything is found (*Claude Code in acme-web, merges on this computer, no GitHub needed*), one button, the rows under **Details**; the usage-numbers question moved to Settings; the top bar's Deploy hides until the first agent; the pane beside it is a looping preview of one row going Working, Needs you, To review, Shipped.
- **Shipped today** appears with the first merge, and the first merge is said once with how long the loop took.
- **Rows**: Working rows have no button (the row opens it); the branch moved to the pane's header; the project shows only with more than one; on a phone a row is one tap target with title, one status line and its age. A wait bar along a waiting row's foot grows toward 30 minutes (the signature element: the metric visible at a glance).
- **Branches named after the task**: `office/fix-the-flaky-checkout-test-3f2a`, not `office/byte-b610`.
- **The agent you watch finishing** turns the pane to its diff: one click fewer to a merge.
- **Merge safety**: an agent working in the person's own folder (every `kipdeck attach` session) is no longer "merged" by `git add -A` there, which could commit their own edits or a `.env.local`; it is refused with what to do. Merges into one folder are queued; only a half-done merge is aborted as a conflict, other git failures say git's words.
- **Labs are off over the socket too**: Proof of Merge's, meetings' and voice's messages go nowhere while their lab is off (`src/server/ws/labgate.ts`), not just their menus and HTTP routes.
- **Read-only demo**: presence and `limits.refresh` dropped quietly for visitors.
- **Settings > Agents**: no "Office" or `--agent-args` wording, one line for "everyone" instead of a tag per card, the agent limit saved as you leave the box, Save no longer muted text on Signal.
- **Deploy sheet**: agents this computer lacks are under More with their install line; the project picker hides with one project.
- **Landing**: the 3D section is gone (Labs and docs keep it), the waitlist is one email field, a facts row near the top.

### Left for later (and why)

- **npm publish and the hosted demo deploy** wait on the trademark search and an employer clearance (`launch/kipdeck/README.md`). The repository (github.com/zbagdzevicius/kipdeck) is public and kipdeck.com serves the landing page.
- **Traction row with real numbers.** There are no users yet; the page asks for five design partners instead of inventing a number.
- **Branch prefix.** Branches still start `office/` so existing branches, prune and pull request detection keep working; renaming it is a migration.
- **Merge all ready with passing tests** (the team headline feature) and a project filter chip are not built; the project picker covers several projects today.
- **Settings save per field.** The default agent still has a Save button; the agent limit saves as you leave it.
- **The demo's files** still carry a one-line `[demo]` header comment; the demo test requires everything the demo writes to say so.
- **The real-agent recording** needs real CLI sign-ins and spends tokens; the cut here is the scripted demo, and says so.

## The labs, and how to switch them

Nothing was deleted. Every lab is on as Kipdeck ships, the Deck first: it is the strongest thing we show, so the home page's top bar has **Enter the Deck**. An admin switches any lab off in **Settings > Account > Open Labs...** (or Ctrl+K, Labs), and the command line holds labs on so nobody can switch them off, with `--labs <ids>` or `AGENT_OFFICE_LABS` (`all` for every one).

| What it shows | Lab id | Hold it on |
| --- | --- | --- |
| Issues, Pull requests, Task queue, Mission control in the menu and Ctrl+K | `boards` | `--labs boards` |
| **Enter the Deck** in the top bar (and **D**) and the deck plan in the empty pane (`/deck` itself always opens) | `bridge` | `--labs bridge` |
| Goals, milestones, the timeline and crew tabs, the Services board | `ops` | `--labs ops` |
| The Review bay and the planning whiteboard | `meetings` | `--labs meetings` |
| Voice chat, screen sharing, dictation | `voice` | `--labs voice` |
| The Deck's mascot, ship's voice, hands, lounge, rituals, motion and soundscape | `ambience` | `--labs ambience` |
| Proof of Merge: bounties, payouts, attestations, ERC-8004 reputation, x402, `/pom/` | `proof` | `--labs proof`, or any chain flag (`--x402`, `--attest`, `--reputation`) |

Also moved, not removed: the Get started checklist (under the list; none in the demo), the usage-numbers switch (Settings > Account), the terminal's quick keys (behind **Keys**), the Changes footer's Commit and Discard (shown while something is uncommitted), the 3D Deck on the landing page (the docs and `docs/img/deck-wall.png`), and the 3D Deck in the video (`REC_DECK=1 node design/record-demo.mjs`).

## Time to value and click counts

Measured with `design/measure-final.mjs` on an M-series Mac, headless Chromium, a fresh home and demo repository per run, the test stand-in agent as Claude Code (no model), both builds the same way (the review build from a `git archive` of `ae964cad`). Results in `design/shots/fundable/final/measure.json` and `final/before-measure/measure.json`. The POC row is from the review round's audit (`design/shots/fundable/review/time-to-value.json`).

| | POC (f8c708f) | Review build (ae964cad) | This build |
| --- | --- | --- | --- |
| Install | git clone, npm install, npm install -g (3 commands) | `npx kipdeck` (1) | `npx kipdeck` (1; from source until it is on npm) |
| Terminal questions | 1 to 2 | 0 | 0 |
| Time to first agent at work | not reachable as documented; 55.6 s by the most favourable path | 3.4 s, 1 click, 1 key | 3.4 s, 1 click, 1 key |
| Time to first merged change (a second agent asks, answered, reviewed, merged) | not reachable in the app | 10.9 s, 5 clicks, 3 keys, 2 typed fields | 10.7 s, **4 clicks**, 3 keys, 2 typed fields |
| Primary screen, desktop (controls / inputs / words) | 3D: 18 / 0 / 62 plus wall screens; 2D: 28 / 1 / 219 | 16 / 1 / 164 | 18 / 2 / **114** |
| Primary screen, phone | 19 / 1 / 132 | 12 / 1 / 116 | **9 / 1 / 77** |

The desktop's control count went up by two because the pane is no longer empty: it shows the waiting agent's tabs, its reply box and Send. The words dropped by a third, and the first thing in the pane is now the question with a box to answer it. Cold `npx` from an empty npm cache was 4.0 s to running and 6.3 s to the first agent, measured from a local tarball (`review/timed-npx/timings.json`); a real registry download adds network time.

## The investor demo (about a minute)

The recording is `design/shots/fundable/final/kipdeck-demo.mp4` (67 s, silent, every frame tagged *Demo data: scripted agents, no model runs*; deck/site/media/kipdeck-demo-v2.mp4); the 27-second GIF is `docs/img/demo.gif`. Live, run `kipdeck --demo` from a linked clone (`npx kipdeck --demo` once it is on npm) before the meeting, and keep the recording open in a tab as the fallback.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Title card | "Engineers now run five or ten coding agents at once. The bottleneck isn't the agents: it's how long they sit waiting on you." |
| 0:05 | The terminal: `kipdeck --demo` | "One command, in your repository. No account, nothing leaves your machine." |
| 0:09 | Five agents start: Claude Code, Codex, Cursor | "Every vendor's agent in one list, each on its own branch." |
| 0:13 | Codex's question opens by itself in the pane | "Codex is blocked. It goes to the top and its question opens in plain words." |
| 0:15 | Typing the answer in one box | "One box. No hunting through terminals. And the top bar counts who's waiting on you." |
| 0:22 | Claude Code done, its diff beside the list | "Claude Code finished: three files, tests pass. The real diff, beside the list." |
| 0:28 | Merge, the undo countdown | "Merge, without GitHub if you want. A few seconds to undo." |
| 0:33 | It lands in Shipped today | "Every merge is a signed record: which agent and model, who reviewed it, how long it waited." |
| 0:36 | The phone: the README merged with one tap | "Same inbox on your phone." |
| 0:46 | Codex's fix merged | "And the fix Codex asked about is in too." |
| 0:51 | The calm inbox | "Nothing waits on you." |
| 0:54 | Numbers | "And here's the number we sell on: human wait time, per agent and model, week over week." |
| 1:01 | End card with github.com/zbagdzevicius/kipdeck | "Free and open source for one engineer. Teams pay for the shared inbox, routing, SSO and audit. We're raising a pre-seed to take this to the first fifty teams." |

Questions to expect, and the short answers:

- *Isn't this a feature the model vendors ship next quarter?* Each vendor will show its own agents. Teams run several, and the wait-time record has to live with the team, not the vendor.
- *What's proprietary when the base is MIT?* The ranking, the inbox, the question card, the signed log and its metrics, onboarding and the demo are this team's work; the paid tier (routing, SSO, audit, team reporting) is the business.
- *Traction?* None yet, honestly: we are signing five design partners who run five or more agents a day.

## Where everything is

- Stills: `design/shots/fundable/final/` (after), `final/before/` and `final/before-after/` (pairs: the POC against now, then the review build against now, first run, the question, review, merge, the menu, Settings, phone and the landing page). Shot with `node design/shoot-final.mjs final`.
- Video: `final/kipdeck-demo.mp4` and `final/demo-contact-sheet.png`; `node design/record-demo.mjs design/shots/fundable/final`.
- The demo's own shoot, the hosted demo included: `SHOOT_3D=0 node design/shoot-demo.mjs final/demo-shoot`.
- Measurements: `node design/measure-final.mjs <out>`, `SHOOT_ROOT=<checkout>` for another build.
- Docs: `README.md`, `docs/inbox.md`, `docs/labs.md`, `docs/landing.md`, `docs/demo.md`; the round's notes are in `design/README.md`.
