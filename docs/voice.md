# Voice: the crew

Back to the [README](../README.md). The look that goes with it (palette, type, shape, motion, sound) is in [docs/design.md](design.md#warmth-the-crew-look); the hard rules are code in `src/shared/voice.ts` and `src/shared/tones.ts`, held by `tests/voice.test.ts` and `tests/tones.test.ts`.

Kipdeck should feel like a small, scrappy crew that is very good at its job, with a worn tape deck playing in the cockpit. You run the ship, your agents do the jobs you hand out, and Kip keeps watch. The work stays the loudest thing on screen. Warmth lives in the quiet moments: when nothing is waiting, when something ships, when you come back. It goes silent the moment a person is needed.

## Who is who

- **You** are the person at the helm. Talk to one person, as "you".
- **An agent** is named by its task: "Fix the flaky checkout test". Never a persona, call sign, invented name, "worker", "desk", "unit" or "crewmate".
- **The crew** is the group as a whole: you, your team, your agents and Kip. Use it only in greetings, empty states and celebrations, never for one agent.
- **Kip** is the crew's mascot and lookout. He is "he". He never speaks in a dialog, never asks you for anything and never blocks input.

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
| `src/server/startup.ts:27` | Opened in your browser, signed in. | Opened in your browser, signed in. Kip's on watch. |
| `src/server/startup.ts:28` | Lost the tab? Run `x` for a new link. | Keep. It already has the voice. |
| `src/server/cli.ts:144` | Ctrl+C stops it. | Keep. One warm line per run is spent on startup and exit. |
| exit (new, `src/server/cli.ts`) | closing Kipdeck - agents keep running for the next start... | Kipdeck stopped. 3 shipped this session; your agents keep working. |
| `src/client/home/setup.ts:165` | Looking for your agents and projects... | Checking who's aboard: agents and projects... |
| `src/client/home/setup.ts:180` | Deploy your first agent | Give your first agent a job |
| `src/client/home/setup.ts:181` | It works on a branch of its own. When it needs an answer or has something to review, it shows up here. | It works on its own branch and comes back here when it needs you or has something to show. |
| `src/client/home/deploy.ts:90` | What should it do? For example: add rate limiting to /api/login | What's the job? For example: add rate limiting to /api/login |
| `src/client/home/empty.ts:60` | All clear | All clear. Nobody's waiting on you. |
| `src/client/home/list.ts:187` | Nothing needs you. | Keep. It is a section line people scan. |
| `src/client/home/list.ts:189` | No agent is working right now. | Nobody's working right now. Give one a job when you're ready. |
| `src/client/home/list.ts:202` | Nobody waiting. Every agent has what it needs from you. | Nobody waiting. The crew has what it needs from you. |
| `src/client/home/shipped.ts:35` | Merged work shows up here, with the agent and how long it waited on you. | Nothing on today's tape yet. Merged work lands here, with how long it waited on you. |
| `src/client/home/index.ts:243` | Answered Fix the flaky checkout test. Back at work. | Fix the flaky checkout test is back at work. Thanks. |
| `src/client/home/actions.ts:221` | Your first merge, 4m after your first agent started. It's in Shipped today. | First merge! 4m after you started. Track one, in Shipped today. |
| `src/client/home/spend-control.ts:82` | Nothing to pause: no agent was at work. | Nothing to pause: nobody was at work. |
| `src/client/home/palette.ts:53` | Nothing matches | Nothing matches. Try fewer words. |
| `src/client/login.html:18` | Sign in (heading) | Welcome back (first claim: Welcome aboard). The button stays Sign in. |
| `src/client/login.html:19` | The inbox for your AI coding agents. | Keep. The tagline is the same on every surface (`TAGLINE` in `src/shared/copy.ts`). |
| `src/shared/democoach.ts:26` | Run it on your repo | That's the loop. Now run it on your repo. |
| `site/landing/index.html:456` | What else is in the box. | B-sides: off by default. |
| `site/landing/index.html:406` | The couch counts. | Keep. This is the humour level to aim for. |
| `src/client/home/approval-card.ts:83` | Sent. Waiting for the agent... | Keep. It is an approval. |
| `src/client/home/merge-hold.ts:104` | Merge undone. Nothing was merged. | Keep. It is an undo. |
| `src/client/home/actions.ts:164` | Stop {task}? / Stop agent | Keep. It is a destructive confirm. |
| `src/client/ui/devices.ts:18` | Server unreachable | Can't reach Kipdeck. Is it still running in your terminal? (plain: it is an error, the change adds the next step) |
| `src/server/accounts.ts:382` | none yet: `kipdeck accounts invite <name> --admin` makes you one | Keep. Account output stays plain. |

Rejected on purpose: "Bring on your first crewmate" (an agent is not a crewmate), "Carry on, Captain" outside VESPER, "Rounding up your crew" (the loading line must say what it is checking), "Nobody aboard yet" in account output (CLI admin output stays plain).

## Kip

Kip is the lookout, not a narrator. In the inbox he is line art in `currentColor` (1.5 to 1.75px strokes on a 96 grid, under 1.5 kB of inline SVG per pose, `aria-hidden`, loaded lazily from a pose registry in `src/client/home/kip/` so the up-front budget is untouched). On the Deck he is the existing 3D Kip.

| State | Inbox and top bar | Deck |
| --- | --- | --- |
| Watching: agents at work, nothing waits | Sitting-up pose in the empty pane | As today |
| Napping: all clear, nobody working | Leaning-back pose, tuft light dim | Napping in his nest (exists) |
| Someone needs you | Tuft light in Signal on the mark (exists). No art, no motion anywhere | Sits quietly facing the pod (exists) |
| Merge | Tuft bounces once, 600ms; Cheer pose in the toast's icon slot | Pinwheel hop (exists) |
| Stuck | Nothing in the inbox | Tucks in and goes still (exists) |
| Late night, 22:00 to 05:00 local | Lantern pose (a small mug beside him) | Nightlight Sprig (exists) |
| First run and the demo coach | Wave pose on the sign-in card and setup card | Bow (exists) |
| First merge ever | A one-time Kip sticker in the toast | Bow (exists) |

Kip gives way: while anything is in Needs you, nothing about him moves on any surface, and his line disappears from the empty pane. He never sits above or beside the first item that needs you.

## Signature moments

Each plays once, never loops, never while Needs you is above zero (a queued beat is dropped if a question arrives), and becomes a still pose plus text under reduced motion or Ship motion Off.

1. **First agent given a job.** Toast: "Fix the flaky checkout test is aboard. It'll come back here when it needs you." Kip waves on the setup card. Once per install.
2. **Merge.** Toast: "Merged: Fix the flaky checkout test. Waited on you 32s. 3 on today's tape." The tuft bounces once; the merge chime plays if Crew sounds is on. The 7s undo stays in plain words.
3. **First merge ever.** "First merge! 4m after you started. Track one, in Shipped today." plus the Kip sticker. The only exclamation mark in the product.
4. **All clear.** Heading "All clear. Nobody's waiting on you." in the celebrate type, then the facts: "4 shipped today, median wait 41s." One rotating second line: "Go stretch. Kip has the watch." or "Good time for a coffee." The check draws once.
5. **Greeting by time of day** (empty pane eyebrow, tape label, never next to a waiting item): MORNING (05 to 12), AFTERNOON (12 to 18), EVENING (18 to 22), NIGHT SHIFT (22 to 05) with "Still up? Nothing needs you. Kip's keeping watch."
6. **Back after 8 hours.** "Welcome back. While you were out: 4 merged, 1 waiting 2h." Facts first, and the waiting item is a link.
7. **Zero-wait day.** One line in Shipped today: "Nobody waited over 5 minutes today. Tight crew." No badge, never a ranking of people.
8. **Demo end.** The coach strip's last step: "That's the loop. Now run it on your repo." with Kip waving and the copy command.

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
