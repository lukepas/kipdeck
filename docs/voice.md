# Voice: the crew

Back to the [README](../README.md). The look that goes with it (palette, type, shape, motion, sound) is in [docs/design.md](design.md#warmth-the-crew-look); the hard rules are code in `src/shared/voice.ts` and `src/shared/tones.ts`, held by `tests/voice.test.ts` and `tests/tones.test.ts`.

Kipdeck should feel like a small, scrappy crew that is very good at its job, with a worn tape deck playing in the cockpit. You run the ship, your agents do the jobs you hand out, and Kip keeps watch. The work stays the loudest thing on screen. Warmth lives in the quiet moments: when nothing is waiting, when something ships, when you come back. It goes silent the moment a person is needed.

## Who is who

- **You** are the person at the helm. Talk to one person, as "you".
- **An agent** is named by its task: "Fix the flaky checkout test". Never a persona, call sign, invented name, "worker", "desk", "unit" or "crewmate".
- **The crew** is the group as a whole: you, your team, your agents and Kip. Use it only in greetings, empty states and celebrations, never for one agent.
- **Kip** is the crew's mascot and lookout. He is "he". He never speaks in a dialog, never asks you for anything and never blocks input.

## Words we use

One vocabulary everywhere the inbox reaches: its rows and panes, every window it opens (Settings, the palette, sign-ins, Accounts, Team, Labs, Usage, Pair a phone, the meeting room, the GitHub windows), its notifications, the sign-in, join and claim pages, the CLI and the errors the server sends back to a page.

| Say | Not | What it is |
| --- | --- | --- |
| agent | worker, unit, persona, crewmate | One coding agent working on a task, on a branch of its own. Named by its task, with its CLI as a badge |
| project | floor | A git checkout Kipdeck works on |
| Kipdeck, this Kipdeck | the office, this office | The app, and one running copy of it (*This Kipdeck takes no paid tasks*) |
| the shared password | the office password | The one password a Kipdeck can be signed in with when it has no accounts |
| branch, worktree, next to an agent | desk, console, seat | Where an agent's work lives |
| the project list | elevator | Where you pick a project |
| task | | What an agent was asked to do, and its name |
| Needs you, To review, Working, Idle | Ready, busy | The inbox's sections, word for word (rule 10 below) |
| Shipped | | What merged today, under the list |
| Deck | the office, the building | The 3D starship bridge, a lab that is off by default (`/deck`) |
| the crew | a crew, the crew (for one agent) | The whole group: you, your team, your agents and Kip. Only in greetings, empty states and celebrations |

Identifiers are not copy and keep their names: the `.agent-office` data folder, the `AGENT_OFFICE_*` variables, `office/*` branches, the `office-queue` and `office-workers` commands, flags such as `--max-workers`, settings scope ids (`floor`, `office`), protocol fields and CSS classes.

The 3D Deck keeps its own words, because they name things you see on the ship. These are Deck-only and are not checked:

- `src/client/features/`, `src/client/world/`, `src/client/core/`, `src/client/player/` and `src/client/showcase/`
- `src/client/ui/help.ts` (the Deck's help), `src/client/ui/elevator.ts` (its project switcher) and `src/client/ui/floormenu.ts`
- `src/shared/shipvoice.ts` (VESPER's phrasebook) and `src/shared/commendations.ts` (the plinth's plaque)
- the counters in `src/client/bridge.html`
- `src/server/ws/handlers/plan.ts` (the signs over the Deck's desks and its back office)

`tests/one-name.test.ts` holds this table. It follows the import graph from `src/client/lite.ts`, `src/client/home/index.ts` and the scripts of the sign-in, join and claim pages, through every static and dynamic `import()` in `src/client` and `src/shared` and so every window `src/client/home/lazy.ts` opens, leaves out the Deck-only files above, adds the server's CLI, setup, HTTP route errors, the toasts and warnings its WebSocket handlers send and the sign-in, clone and GitHub errors they pass on, and fails when a string (including the strings inside a template's `${...}`), an HTML page or a `title`, `alt`, `aria-label` or `placeholder` says worker, floor, desk, unit, office or elevator. A new file the inbox imports is checked from the day it lands.

## The rules

1. **Fact first.** The first clause says what happened and makes sense alone. Personality, if any, is one short clause after it. Screen readers get the fact first; put the flourish in its own span.
2. **Fun only when nothing waits.** Warm lines go in empty states, all-clear, greetings, the setup card, and toasts after an action is done. Never on a row, card or prompt that needs you.
3. **Kind, never smug.** Joke about the situation, never about the user or an agent. Dry, not zany.
4. **Short words, one joke per screen.** If a line makes a decision slower to read, cut it.
5. **No exclamation marks**, with one exception in the whole product: the first-merge toast (`EXCLAMATION_BUDGET` in `src/shared/voice.ts`). No emoji. No pop-culture quotes, lyrics, film references or character names, ever.
6. **Celebrate outcomes, not activity.** Merged and all clear earn a beat. Started and working do not.
7. **Thank once, after you act.** "Thanks." may follow an answer you gave, at most once a minute. Never before, never in a block of text.
8. **Every empty or error line ends with the next step.**
9. **Crew words are allowed**: aboard, watch, shift, tape, track, side A, B-sides, quiet deck. **Military and jargon words are not**: unit, troops, conn, captain's log, stand down, war, attack, kill. VESPER on the Deck keeps its own phrasebook (`src/shared/shipvoice.ts`), which already passes the calm-voice test.
10. **Status words never change**: Needs you, To review, Working, Stuck, Done. Buttons stay verb plus object: Merge, Send back, Stop agent.

## Before and after

Real strings from `origin/ux/integration`. "Keep" rows are as important as the rewrites.

| Where | Before | After |
| --- | --- | --- |
| `src/server/startup.ts` addressLines | Opened in your browser, signed in. | Opened in your browser, signed in. Kip's on watch. (Only at a terminal and while nobody is in Needs you; piped or logged output stays plain.) |
| `src/server/startup.ts:28` | Lost the tab? Run `x` for a new link. | Keep. It already has the voice. |
| `src/server/cli.ts:144` | Ctrl+C stops it. | Keep. One warm line per run is spent on startup and exit. |
| exit on a restart (SIGTERM, `src/server/startup.ts` goodbye) | closing Kipdeck - agents keep running for the next start... | Kipdeck stopped. 3 shipped this session; your agents keep working. |
| exit on Ctrl+C (`src/server/startup.ts` goodbye) | closing Kipdeck... | Kipdeck stopped, and its agents with it. 3 shipped this session. (Ctrl+C stops the agents, so the line says so. The tally is left out when nothing merged.) |
| `src/client/home/setup.ts:165` | Looking for your agents and projects... | Checking who's aboard: agents and projects... |
| `src/client/home/setup.ts:180` | Deploy your first agent | Give your first agent a job |
| `src/client/home/setup.ts:181` | It works on a branch of its own. When it needs an answer or has something to review, it shows up here. | It works on its own branch and comes back here when it needs you or has something to review. ("Something to show" was cut: "review" names the To review section it lands in.) |
| `src/client/home/deploy.ts:90` | What should it do? For example: add rate limiting to /api/login | What's the job? For example: add rate limiting to /api/login |
| `src/client/home/empty.ts:60` | All clear | All clear. Nobody's waiting on you. |
| `src/client/home/list.ts:187` | Nothing needs you. | Keep. It is a section line people scan. |
| `src/client/home/list.ts:189` | No agent is working right now. | Nobody's working right now. Give an agent a job when you're ready. |
| `src/client/home/list.ts:202` | Nobody waiting. Every agent has what it needs from you. | Nobody waiting. The crew has what it needs from you. |
| `src/client/home/shipped.ts:35` | Merged work shows up here, with the agent and how long it waited on you. | Nothing on today's tape yet. Merged work lands here, with how long it waited on you. |
| `src/client/home/index.ts:243` | Answered Fix the flaky checkout test. Back at work. | Fix the flaky checkout test is back at work. Thanks. |
| `src/client/home/actions.ts:221` | Your first merge, 4m after your first agent started. It's in Shipped today. | First merge! 4m after you started. Track one, in Shipped today. |
| `src/client/home/spend-control.ts:82` | Nothing to pause: no agent was at work. | Nothing to pause: nobody was at work. |
| `src/client/home/palette.ts:53` | Nothing matches | Nothing matches. Try fewer words. |
| `src/client/login.html:18` | Sign in (heading) | Welcome back (first claim: Welcome aboard). The button stays Sign in. |
| `src/client/login.html:19` | The inbox for your AI coding agents. | Keep. The tagline is the same on every surface (`TAGLINE` in `src/shared/copy.ts`). |
| `src/shared/democoach.ts` coachSteps | Run it on your repo | Keep while a step is open. Once the question is answered and the change merged: That's the loop. Now run it on your repo. (Said earlier, it is untrue and sits over an item that needs you.) |
| `site/landing/index.html:456` | What else is in the box. | B-sides: off by default. |
| `site/landing/index.html:406` | The couch counts. | Keep. This is the humour level to aim for. |
| `src/client/home/approval-card.ts:83` | Sent. Waiting for the agent... | Keep. It is an approval. |
| `src/client/home/merge-hold.ts:104` | Merge undone. Nothing was merged. | Keep. It is an undo. |
| `src/client/home/actions.ts:164` | Stop {task}? / Stop agent | Keep. It is a destructive confirm. |
| `src/client/ui/devices.ts:18` | Server unreachable | Can't reach Kipdeck. Is it still running in your terminal? (plain: it is an error, the change adds the next step) |
| `src/server/accounts.ts:382` | none yet: `kipdeck accounts invite <name> --admin` makes you one | Keep. Account output stays plain. |

Rejected on purpose: "Bring on your first crewmate" (an agent is not a crewmate), "Carry on, Captain" outside VESPER, "Rounding up your crew" (the loading line must say what it is checking), "Nobody aboard yet" in account output (CLI admin output stays plain).

## Kip

Kip is the lookout, not a narrator, and there is one of him. Every flat surface (the inbox, the sign-in card, the setup card and the landing page) draws the same Kip as the investor deck and the Deck's 3D one: cream fur, tall leaf ears, the slate vest, the knitted scarf and his wand. The drawing is `src/shared/kip-art.ts` and his colours `src/client/styles/kip.css`; the landing page moves him, the app holds him still in one pose (`kipStill`), always `aria-hidden`. In the inbox he loads with `src/client/home/kip-moments.ts`, through `lazy.ts`, so the up-front budget is untouched. On the Deck he is the existing 3D Kip.

| State | Inbox and top bar | Deck |
| --- | --- | --- |
| Watching: agents at work, nothing waits | Sitting-up pose in the empty pane | As today |
| Napping: all clear, nobody working | Curled-up sleeping pose | Napping in his nest (exists) |
| Someone needs you | Tuft light in Signal on the mark (exists). No art, no motion anywhere | Sits quietly facing the pod (exists) |
| Merge | Tuft bounces once, 600ms; Cheer pose in the toast's icon slot | Pinwheel hop (exists) |
| Stuck | Nothing in the inbox | Tucks in and goes still (exists) |
| Late night, 22:00 to 05:00 local | Sleepy sitting pose, his wand lit low as a nightlight | Nightlight Sprig (exists) |
| First run and the demo coach | Wave pose on the sign-in card and setup card | Bow (exists) |
| First merge ever | The same Cheer pose in the toast's icon slot, nothing more | Bow (exists) |

Kip gives way: while anything is in Needs you, nothing about him moves on any surface, and his line disappears from the empty pane. He never sits above or beside the first item that needs you.

## Signature moments

Each plays once, never loops, never while Needs you is above zero (a queued beat is dropped if a question arrives), and becomes a still pose plus text under reduced motion or Ship motion Off.

1. **First agent given a job.** Toast: "Fix the flaky checkout test is aboard. It'll come back here when it needs you." Kip waves on the setup card. Once per install.
2. **Merge.** Toast: "Merged: Fix the flaky checkout test. Waited on you 32s. 3 on today's tape." The tuft bounces once; the merge chime plays if Crew sounds is on. The 7s undo stays in plain words.
3. **First merge ever.** One short sentence: "First merge: Fix the flaky checkout test!" with the one Kip cheering in the icon slot. No wait, no clock and no tape count in it: a celebration never adds up how long anyone waited. The only exclamation mark in the product.
4. **All clear.** Four things and no more: Kip, the heading "All clear. Nobody's waiting on you." in the celebrate type (it settles in once), one rotating warm line ("Go stretch. Kip has the watch." or "Good time for a coffee.") and the facts on one compact line: "0 working · 4 merged today · median wait 41s". What shipped is in Shipped today under the list, not repeated here.
5. **The night shift** (22:00 to 05:00 local, never next to a waiting item): the warm line becomes "Still up? Nothing needs you. Kip's keeping watch." and Kip sits with his wand lit low.
6. **Back after 8 hours.** "Welcome back. While you were out: 4 merged, 1 waiting 2h." Facts first, and the waiting item is a link.
7. **Zero-wait day.** One line in Shipped today: "Nobody waited over 5 minutes today. Tight crew." No badge, never a ranking of people.
8. **Demo end.** Once the first two steps are done, the coach strip's last step turns from "Run it on your repo" into "That's the loop. Now run it on your repo." with Kip waving and the copy command.

## Where fun is forbidden

No jokes, greetings, Kip, crew words, sound or new hue in any of these. They stay verb plus object and plain facts:

- Errors of any kind, including the CLI's (`port N is already in use (try another --port)` stays word for word).
- Approval and permission cards (`approval-card.ts`, `approval.ts`), risk tags, Always allow, deny reasons.
- Security and sign-in: failures, invites, secrets, the password line, `src/server/http/routes/auth.ts`.
- Cost, spend and budgets (`spend.ts`, `spend-control.ts`), Pause all, Stop all.
- Destructive confirms: Stop, Archive, Stop all, Delete, anything forced.
- Undo copy and the "Merging in" countdown.
- Notifications and push messages that ask for a decision.
- `--json` output, help text and account output in the CLI.
- Rows, section heads, counts and status phrases (`src/shared/rowtext.ts`).

`tests/voice.test.ts` fails if a whole plain module (approvals, spend, sign-in routes, accounts) gains an exclamation mark, Kip's name, a crew word, a cheer or an emoji; if the undo, approval-sent or Stop and Archive confirm lines change; or if more than one string in `src/` ends a sentence on an exclamation mark. Builders adding a new plain module add it to `PLAIN_MODULES` there.

## How this was chosen

Three directions were weighed against clarity, warmth felt within 10 seconds, consistency, accessibility and effort. "Mixtape on a starship" gave the idea, the tape vocabulary, the sunset behind Kip on the sign-in page and landing, the tape stripe, the wide hero type and the field-edge contrast fix. "Found family" gave the collective "crew", the thank-you after acting, greetings by time of day, outcomes over activity and the CLI's session tally. "Calm cockpit" gave the warm graphite and paper neutrals, softer corners by component, Kip's pose registry kept out of the up-front bundle, and the copy test. Left out: a plum-tinted dark set (too close to proof's violet), a saturated tape accent (it sat in Signal's hue band), grain inside the inbox, pill chips for states, and changing the Deck's sound default.
