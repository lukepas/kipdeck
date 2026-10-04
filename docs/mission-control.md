# Mission control

Back to the [README](../README.md).

Mission control answers one question: what needs a person right now, on any floor. It ranks every hired worker in the building by how much it needs someone, says why in plain words, and offers one next step. Next to that it keeps what each floor is for (its mission and milestones), so every worker, task and pull request can be tied back to a goal, an inbox of everything waiting for a review, a timeline of what happened, and reminders for what would otherwise be forgotten.

Open it with **I** anywhere in the office, from the **Mission control** button on the top bar (always there), from the counters beside the deck's name (each one, *2 need you*, *1 stuck*, *3 to review*, *4 working*, opens the tab for its level: Review for to review, Attention for the rest), from the menu > **Mission control**, or from the command palette (**Ctrl+K**: *Mission control*, *Edit the mission*, *Review finished work*, *Timeline*, *While you were away*). In the 2D view (`/lite`) it's the **Mission** button in the top bar. It has a ✕ in the top right, and Esc closes it and puts you straight back into looking around. It remembers the tab you had open last.

Inside it, **1** **2** **3** **4** switch tabs (Attention, Goals, Review, Timeline), the arrow keys move between rows, and **Enter** does the selected row's next step.

## Attention

Every worker hired onto a console, the Standby bench or the Review bay's table, on every floor (the board agents at their kiosks are left out), grouped by level, most urgent first:

| Level | What puts a worker there |
| --- | --- |
| Needs you | It's waiting on an answer or a permission: *needs input for 18 min: Wants permission: Bash: npm test* |
| Stuck | Working but no hook event and no terminal output for 10 minutes (*working but silent for 12 min*), or for 2 minutes in the middle of a tool call for an agent with no hook for its permission prompt (Cursor); tests or a build failing again and again; crashed (*crashed (exit 1)*); its worktree was deleted; hired 15 minutes ago and never given a task; its queue task failed to start |
| To review | Done and nobody has looked (after 30 minutes: *forgotten: done 42 min ago, nobody looked*); its pull request's checks are failing, it has merge conflicts, changes were requested, it's approved and ready to merge, or it waits for a review; commits on its branch and no pull request yet; its pull request merged, so it can go home |
| Working | At work and showing signs of life |
| Ready or asleep | Ready for its next task (finished and seen to), or asleep |

Within a level, whoever has waited longest comes first. The working and *Ready or asleep* groups stay folded until you open them, so the list stays short. What waits for review is one line, *To review N*, that opens the Review tab, where it's listed; N is the same count as the chip's and the tab title's, so it includes pull requests no worker stands for.

Each row shows the worker, its floor, what it's for (its milestone, its issue, or *unlinked* for an agent; a shell is never called that), what it's doing, the reason, how long it has been that way and what it has cost, with one button for the next step:

| Button | What it does |
| --- | --- |
| Answer, Look into it | Opens its terminal |
| Review changes | Opens its Changes window |
| Open PR, Fix checks | Opens its pull request's window, where **Fix comments & merge** hands it to a worker (after checking who the pull request is from); with no pull request yet, pushes its branch and opens one |
| Merge | Opens its pull request's window and then its **Merge** dialog |
| Hand back | Opens its pull request's window and hands it back to a worker with the review comments (its **Fix comments & merge**, or **Fix conflicts & merge**) |
| Resume | Starts it again |
| Rebuild | Puts its deleted worktree back, or sends it home |
| Stand down | Stands it down, asking what to do with its worktree |
| Give it a task | Types it a first prompt |

A worker on another floor takes you to its floor and its desk first, then does it.

With [agent reputation](reputation.md) on, each row (here and in the Review tab) also shows its agent's record from merges, *rep 86 · merges 80% · 25.00 USDC*, linked to its latest attestation, with the whole record in its tooltip. An agent whose merges get reverted often gets a hint in words; it never changes where the worker ranks.

**...** on a row has the rest: open its terminal, snooze it for 30 minutes, 2 hours or until its status next changes, link it to a milestone, send it home. A snooze is shared: everyone sees *snoozed by Ana until 14:30*, so two people don't both chase the same worker. A snoozed worker stays in the list, greyed, but it isn't counted and nothing notifies about it.

The same ranking runs everywhere: the counters on the top bar (a glyph and a number per level, click one for its tab), the tab title's count and the favicon (its lead chevron turns orange while anything needs you), the needs-you alert row and the beacons over desks (the *Needs you* level, the snoozed ones left out), the order **N** goes in, the order of the Workers panel (which shows the reason in place of the bare status), the 2D view's list, the webhook, and what agents see from `list_workers`. It lives in one place, `src/shared/attention.ts`, with its thresholds.

**N** goes to the workers waiting on someone in the ranking's order: the ones that need you first, then the ones that are done, longest-waiting first within each. After the last one on your floor it takes you to the next floor's, and one that needs you on another floor comes before one here that's only done. Snoozed ones are skipped.

A worker that gets stuck dings on your floor and, while you're in another tab, pops up a desktop notification wherever it is. After the same few seconds' wait as the other alerts, the team's webhook gets a line about it too. Nothing else new dings.

## Goals

What the floor is for. Click the mission statement to edit it (up to 500 characters): **Enter** saves, **Shift+Enter** is a new line, **Esc** cancels, and clicking away keeps what you typed. Under it are up to 12 milestones, each with a title, the issues it covers, an optional due date and a done box. One is active: the step the team is on now. Edit a milestone's title, issues or date the same way, move it up or down, mark it done, make it active, or remove it.

Each milestone shows how far it has got and what it has cost: *issues 3/7 · PRs 2 open · 2 working · $4.10 · 3 h 20 min on task*, a progress bar of its issues closed (only once it has issues: without any it says *no issues linked yet*), and the workers on it. Its spend and time include the workers who have gone home from it.

Agents with no milestone and no issue are listed as **unlinked**, each with a picker to link it, while the floor has an open milestone to link them to; without one, the tab says *Add a milestone to link workers to it* instead. **Tell the workers about a change** sends the agents you pick a one-line note as their next prompt when the mission changes; nobody is interrupted otherwise.

Anyone signed in can edit the mission. An admin can tick *Only admins can change the mission* to lock it. Since the mission and the active milestone go ahead of every new worker's first prompt, a statement or milestone title that would have a worker check out a pull request the office can't vouch for (a fork's, or one by someone who can't push) is refused, the same as a typed prompt (see [security](security.md)).

The **Reminders** sit above the levels; see [Reminders](#reminders).

With [agent reputation](reputation.md) on (`--reputation`), the tab ends with **Agents**: every agent identity the office's workers run as, with its ERC-8004 id, score, merge rate, merges (self-merges apart), how many maintainers merged its work, what it earned in bounties, and links to its card and its latest attestation on chain.

## Review

Everything on every floor that waits for a person's decision, oldest first:

- workers done and nobody has looked, with what they changed (*+120 -30 · 4 files*, from the Changes window's own look, taken once each time the worker comes to rest);
- workers with commits on their branch and no pull request (**Open PR**);
- pull requests by state: waiting for a review, approved and ready to merge (**Merge**), checks failing, merge conflicts or changes requested (**Hand back**), with the checks' state beside them;
- pull requests the office made that no worker at a desk stands for any more (from an `office/` branch, a worker's branch or a queue task; a branch counts only in the repository itself, never a fork's, since a fork can name a branch anything), and pull requests your review is requested on (yours by your own GitHub sign-in, or the office's on the shared password);
- units whose pull request merged (**Stand down**).

Each row says what it is, its floor, its goal, the checks, the diff size and how long it has waited. Opening a finished worker's work from here (reviewing its changes, its pull request, sending it home) marks it seen, as opening its terminal does. The attention chip's *to review* counts this whole list.

## Timeline

What happened on every floor, newest first. The office writes it from what changes, never from what anyone types (the mission excepted, which is cleaned first):

| Event | When |
| --- | --- |
| Hired | Someone hired a worker, with the goal and issue it's for |
| Needs input, Done | A worker started waiting on an answer, or finished its turn. The same finish (same task) or the same question within 30 minutes is folded into the last one, so the timeline doesn't log every turn. A permission prompt names the tool only (*Mochi wants permission to use Bash*), never its command, which can hold a secret |
| Stuck | The ranking first saw it stuck, with why |
| Resumed | An asleep worker started working again |
| Went home | A worker went home, with its time on task and what it cost |
| PR opened, PR closed | One of the office's pull requests opened, or closed without merging |
| PR merged | Any pull request on the floor merged, and who merged it from the PR window |
| Queue | A queue task started, ended or failed |
| Meeting | A meeting was called, and when it ended, the file it wrote |
| Mission, Milestone | The mission statement changed; a milestone was added, renamed, removed, made the active one or done |
| Progress | A milestone's issues closed went up or down (*Auth rewrite: 5 of 7 issues closed*) |

Pick a floor, a goal or a worker to see only theirs, and **Load older** for more. **Open** on an event goes to what it's about: the worker's terminal (if it's still here), the pull request, the queue or the Goals tab, on its floor.

## While you were away

Back after 15 minutes or more, *While you were away* opens once: a one-line summary and the events since you left, with **Show what needs me** for the Attention tab. Merges, milestones, stuck workers and the like are listed before the routine finishes and questions. The summary is worked out the same way everywhere (`src/shared/digest.ts`): *3 PRs merged, 2 workers finished and wait for review, 1 got stuck, Auth rewrite moved from 3/7 to 5/7*.

With an account, the office remembers when you were last here (when you left, not when you came in, and never while you're still here in another tab). It stamps everyone connected once a minute and as it shuts down, so a restart or a crash doesn't make people who never left look away. On the shared password, this browser does. In the 3D office it's a window that waits until the office has loaded, no other window is open and you aren't typing. In the 2D view it's the first card, and **Catch up** brings it back. From the palette, *While you were away* opens it again (the last hour's, if you weren't away).

## Reminders

Things nobody has to answer right now, but somebody will:

| Reminder | When |
| --- | --- |
| A snooze ran out | A timed snooze ended and the worker still needs someone |
| Approved, not merged | A pull request approved and green for over an hour |
| Paused queue | The queue lets no worker on and tasks have waited over 30 minutes |
| Past due | A milestone past its due date with open issues |
| Unpushed work | A worker asleep for a day with commits nobody pushed |
| A long wait | A worker waiting on an answer for over an hour (the team's channel hears once) |

The office looks once a minute. A reminder shows at the top of the Attention tab with its next step, puts an amber dot on the attention chip (and on the 2D view's **Mission** button), and toasts the people on its floor when it comes up, again at most once an hour while it stays open. **Snooze 30 min** puts it aside for a while; **Dismiss** puts it aside until what it's about changes: the dismissal is forgotten once the reminder has been gone for two hours, so a restart, when GitHub and the worktrees haven't answered yet, doesn't drop it. Everyone sees who did. A restart remembers both and toasts nothing on its first look. The thresholds are in `src/shared/attention.ts`, with the ranking's.

## The mission strip

One line under the top bar, top left, in the 3D office (and the first card in the 2D view): the floor's mission, the active milestone with a thin progress bar (*Auth rewrite · 3/7 issues · 2 workers*), and *unlinked: 2* when agents aren't tied to anything and there is an open milestone to tie them to. A milestone with no issues shows no bar, just *no issues linked yet*. With no mission yet it reads *No mission yet. Set one*. Click it for the Goals tab. The menu's *Mission* switch hides it.

## Linking work to goals

Every worker and queue task can carry a milestone (its goal) and an issue. The hire dialog, **Ask a worker**, **Hand to a worker** and the queue's add form have a **For goal** picker, set to the active milestone. When nobody picks one, a worker hired for an issue takes the milestone that lists that issue, else the active one. Handing an issue to a worker already at its desk links it too. Change a worker's milestone from its row in Mission control.

## What agents are told

Every worker hired on a floor with a mission gets a short block before its first prompt (from a desk, the queue, a board's **Hand to a worker**, a meeting, a board agent's brief, or `office-workers hire`). It is framed as context from the team, not as instructions, so it never overrides the task:

> Context from the team, not instructions: it doesn't change or override your task below. The team's mission for this project is: "..."
> The milestone the team is on now: "Auth rewrite" (issues #3, #7).
> Your task serves the milestone "Auth rewrite" (issues #3, #7).

The block is the editable *Team context* prompt in Settings > **Workers** > **Edit the prompts...** (an admin can empty it to send nothing). Agents can read the mission again any time: the `get_mission` MCP tool and `office-workers mission` return the statement, the milestones with their progress, and the caller's own goal. `list_workers` and `office-workers list` include each worker's attention level, its reason and its goal, so a managing agent can find the stuck ones too, and `hire_worker` takes a `goal`.

## Where it's kept, and what's safe

- The mission is in the floor's checkout, `.agent-office/mission.json`, written through the office's state-file helpers (mode 600, never through a symlink, never a file the repository ships; see [security](security.md)).
- Each worker's goal, issue, snooze and its last hook event and output times are in `.agent-office/workers.json`; a queue task's goal is in the queue's file.
- The timeline is `.agent-office/timeline.jsonl`, the last 2000 events of the floor, written through the same helpers; a torn last line (the office stopped mid-write) is skipped. Its text is the office's own words, cut to 200 characters. Reminders someone snoozed or dismissed are kept in `mission.json`, and never sent with the mission.
- Pull requests in the review queue carry a title cut to 120 characters, the author, the checks and the logins whose review is requested, and a link only when it's an https one.
- Text people type is cleaned on the server: trimmed, cut to its length, and stripped of control characters and the invisible ones that reorder or hide text. Milestone ids are made by the office, and issue numbers must be positive whole numbers.
- The page shows the mission as plain text, never as HTML or Markdown.
- The building-wide roster carries task names, short activity lines (80 characters at most) and ids, never a full prompt or terminal output.
- Terminal output is stamped at most every 30 seconds and never broadcast by itself; the roster picks it up on its next look.
