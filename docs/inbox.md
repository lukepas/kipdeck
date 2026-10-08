# The inbox

Back to the [README](../README.md).

The home page at `/` is the product: one inbox for every coding agent you run. It answers three questions in order: which agent needs you, what is ready to review, and what shipped today. Everything else the office can do is reachable from the avatar menu or Ctrl+K, and the parts beyond the inbox are [Labs](labs.md).

![The inbox: Needs you, To review and Working on the left, the selected agent on the right (demo data)](img/inbox.png)

## The first visit

`npx kipdeck` in the repository you work in opens this page in your browser, signed in (on your own computer there is no password; see [Security](security.md#signing-in-on-your-own-computer)), with that repository as the first project. Until the first agent, the list is the **setup card**. When everything is ready it is one line (the agent it found, the project, and whether merges go through GitHub or this computer), **Deploy your first agent**, and the rows below folded under **Details**:

- **Agents**: the agent CLIs on this computer, Claude Code, Codex and Cursor always and the beta ones when they're installed, each with whether it's signed in (read from its own files and keys, not by running it). One that isn't ready says the one line that fixes it (`claude auth login`, `npm install -g @openai/codex`...), with a copy button.
- **Project**: the folder Kipdeck was started in. Started somewhere else, **Use <folder>** or a box to clone a repository from GitHub (admins).
- **GitHub**: optional. Without `gh`, review reads the local diff and Merge merges on this computer; **Check again** asks `gh` afresh.
- **Deploy your first agent** opens the Deploy sheet on a safe starter task (a 5-line SUMMARY.md on how to run the repository) with the first ready agent picked. Enter, and the agent is under Working within seconds.
- [Anonymous usage numbers](security.md#anonymous-usage-numbers) are not asked about here: their switch is in Settings > Account.

While the card is up, the top bar's **Deploy agent** is hidden (the card has the one button), and the pane beside it is a short looping preview of one row going from Working to Needs you, To review and Shipped today, marked *Preview*.

No agent CLI yet? `npx kipdeck --demo` opens this page on a throwaway repository with five scripted agents, and a **Demo** pill in the top bar says so, with the command to run it for real ([the demo](demo.md)).

Already running Claude Code or Codex in a terminal? Quit it there and run `npx kipdeck attach` in the same folder: its session carries on as one of the inbox's agents ([Configuration](configuration.md#command-line)). The server side of the card is `src/server/firstrun.ts` and `ws/handlers/setup.ts`; the card is `src/client/home/setup.ts`.

## The loop

1. **Deploy.** **Deploy agent** in the top bar (or **N**) opens one sheet: the project, the agent (Claude Code, Codex and Cursor up front; the others, marked beta, under More) and the task. The model and effort are under More. Enter starts the agent on a branch of its own, so agents on the same project never step on each other. The new agent is selected as it arrives.
2. **Get pinged.** The ranking in `src/shared/attention.ts` puts every agent in one of four sections. An agent with a question, or one that is stuck (crashed, silent, failing), is in **Needs you**. Finished work, a pull request to see to, or commits with no pull request yet is in **To review**. Agents at work are in **Working**, one line each with what they are doing now. Ready, asleep, merged and snoozed agents fold into **Idle**. With notifications on (Settings > Notifications), a browser notification comes up only when an agent starts needing you or has something to review, and clicking it selects that agent.
3. **Act.** A row that needs a decision has one button: **Answer**, **Review changes**, **Fix checks**, **Merge**, **Send back** or **Resume**. A row at work has none: the row itself opens it. An agent with a question shows it as a card over its terminal, in plain words, with one reply box and a button for each numbered choice it offered (read off its screen, so it works for every agent CLI); Answer puts the cursor in that box. Review changes opens its diff. Fix checks asks the agent to look up its failing checks and fix them.
4. **Ship.** In the Changes tab, **Merge** merges the agent's pull request on GitHub when it has an open one, and otherwise merges its branch into the project's branch on this machine (see [Merging without GitHub](#merging-without-github)). The merge lands in **Shipped today** with the agent, the pull request or commit and how long the work waited on you, and the next agent that needs you is selected, so Enter keeps the loop going. **Send back** hands the work to the same agent with your note.

## The page

- **Top bar.** The product name, the **Demo** pill in a demo office, a project picker (All projects, or one; it shows once there are two), search (**/**), the **pulse**, **Deploy agent**, a **Bridge view** link with that lab on, and the avatar menu.
- **The pulse**: how many agents are waiting on you right now (red once one has waited five minutes), the median wait of today's reviews, and what merged today. It is the number the product is about, human wait time, where you see it all day; a click opens Numbers. On a phone it sits over the list.
- **The list**, on the left. Each row is the agent's mark (CC for Claude Code, Cx for Codex, Cu for Cursor), the task in plain words, one status line (what it asks, what it changed, such as *3 files, +70 -0*, or what it is doing), its project when there is more than one, how long it has waited (*waiting 4m*, *ready 2m*) and, where there's a decision, its one button. A row waiting on you has a thin bar along its foot that grows toward 30 minutes. Needs you and To review are always open: clicking their header never folds them. Idle opens with **Show**. Reminders that no listed agent stands for (a pull request approved an hour ago and still not merged, say) are rows of their own in Needs you.
- **The pane**, on the right: the selected agent. Its header has the task, the agent and model, how long it has worked, the project and branch, **Stop** (its session ends; its branch stays) and the row's button again (not Answer: the question card is right there). Three tabs: **Terminal** (live, with the question card over it while it asks, and the keys a phone lacks folded behind **Keys**), **Changes** (the diff, the files, its pull request and checks, **Send back**, **Open PR** where there is a GitHub repository, and **Merge**; the footer with Commit and Discard shows only while something is uncommitted) and **Log** (what happened to it, newest first). On a wide screen the pane is never empty while something waits: with nothing selected, the oldest that needs you (else the oldest to review) opens by itself. Esc empties it until another agent starts waiting.
- **Shipped today**, under the list from the first merge: what merged since midnight, the count and the agent-hours behind it, and the merge rate by agent and model over the last 30 days. The first merge in a browser is said once, with how long it took from the first agent.
- **Get started**, under the list from the first agent until done: Deploy an agent, Answer one question, Merge one change. Before the first agent, the setup card stands in for the list. A demo office has none.
- **Avatar menu**: **Numbers**, **Settings**, **Help and keys** and Sign out, with Bridge view while that lab is on, and Issues, Pull requests, the Task queue and Mission control while the GitHub boards and queue lab is on. Labs is at the foot of Settings > Account and in Ctrl+K; While you were away and light or dark are in Ctrl+K.
- **Numbers**: human wait time (the median minutes finished work waited on a person before its review), changes merged, the merge rate and agent-hours for the last 7 days against the 7 before, merges per day for two weeks, and the merge rate per agent and model with its N, for the project picked or all of them. **Copy as Markdown** puts the table on the clipboard. See [metrics](metrics.md).
- **Settings**: **Account** (who you're signed in as, your password, light or dark; for admins, teammates and anonymous usage numbers), **Agents** (the default agent and model, how many run at once, what happens after a merge, where new projects are cloned, the prompts) and **Notifications** (desktop notifications, and the team's Slack or Discord channel). It opens on the pane you left it on.
- **Help** (**?**): the loop in four verbs, the six keys and a link to the docs.

On a phone (under 900px wide) the list is the page, and a row is one tap target: it opens the agent over the list with **Inbox** to go back, with its question card or its diff ready. Send, Send back and Merge are large tap targets. Toasts come in at the top on a phone and at the bottom of the list's column on a wide screen, never over the reply box or Merge, and never for what you just did yourself.

## Keys

Six of them, never while you type in a box or a terminal, or while a window is open.

| Key | What it does |
| --- | --- |
| Ctrl+K (Cmd+K) | Find an agent by its task or name, or any command |
| N | Deploy an agent |
| Enter | The selected agent's next step (its row's button) |
| Esc | Back to the list: from the pane's terminal, out of the search box, or off the selection |
| / | Search agents |
| ? | Help: the loop, these keys and the docs |

Up and Down (or j and k) move the selection. Esc in the pane's terminal comes back to the list rather than reaching the agent; the keypad's **Esc** button, or Ctrl+[, sends the agent one.

## The shipped log

Every review the inbox ends, merged or sent back, is written to `shipped.jsonl` in the office's data folder: which agent and model did the work, the prompt it was given, who reviewed it, what they decided, the branch and commit or pull request, and how long it had waited and worked. Each record is signed with an Ed25519 key the office makes for itself the first time (`shipped-key.pem`, next to the log, readable by its owner only), so a record can be checked later against the public key. Nothing is sent anywhere. The inbox reads the last 30 days for Shipped today and the merge rate.

## Merging without GitHub

With no open pull request, Merge works on this machine: what the agent left uncommitted is committed on its branch first, then its branch is merged into the project's branch in the project folder with a merge commit. It is refused, with the reason, when the project folder is not on that branch or has uncommitted changes of its own (a merge never mixes with work in progress), when the branch has nothing new, or when the branch conflicts; a conflict is aborted, so the folder stays clean. A hook or a lock that stops git is reported in git's words, with nothing to undo. Merges into one project folder run one at a time.

An agent that works in the project folder itself (a session moved in with `kipdeck attach`, or a project that is not a git repository) has no branch to merge, and committing everything in that folder could sweep up your own edits, so Merge refuses it and says to commit the files it changed yourself.

Branches the office makes are named after the task: `office/fix-the-flaky-checkout-test-3f2a`, the task's first words and four characters of the agent's id (an agent with no task yet goes by its name).

## For developers

The page is `src/client/index.html` with `lite.ts`, which connects and signs in, and `src/client/home/`, the inbox: `list.ts` (sections and rows), `pane.ts` (with the question card, `question.ts`, whose reading of the screen is `src/shared/question.ts` and `tests/question.test.ts`, and the first-run preview, `preview.ts`), `pulse.ts` (its arithmetic `todayPulse` in `src/shared/metrics.ts`), `demo.ts` (the pill), `deploy.ts`, `actions.ts` (what every button does), `keys.ts` (and Help), `palette.ts`, `menu.ts`, `shipped.ts`, `numbers.ts` and `settings.ts`. Settings' frame and its three panes are shared with the Bridge view (`src/client/ui/settings-frame.ts`, `settings-core.ts`), and Numbers' arithmetic is `src/shared/metrics.ts` (`tests/metrics.test.ts`). The rules are pure and shared in `src/shared/inbox.ts` (sections, a row's action, Shipped today, the merge rate, the checklist; `tests/inbox.test.ts`). The server side is the `inbox` protocol domain, `src/server/ws/handlers/inbox.ts`, `src/server/shiplog.ts` and `src/server/localmerge.ts` (`tests/shiplog.test.ts`). `tests/inbox-e2e.test.ts` walks the loop in a browser with stand-in agents, and `tests/surface-e2e.test.ts` the menu, Settings, Numbers and Help. The terminal, the Changes window and the other windows load when first opened (`home/lazy.ts`), and the terminal and Changes sit in the pane through `openModal`'s `dock`. See [Code layout](code-layout.md#the-inbox).
