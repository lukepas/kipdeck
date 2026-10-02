# Mission control

Back to the [README](../README.md).

Mission control answers one question: what needs a person right now, on any floor. It ranks every hired worker in the building by how much it needs someone, says why in plain words, and offers one next step. Next to that it keeps what each floor is for (its mission and milestones), so every worker, task and pull request can be tied back to a goal.

Open it with **I** anywhere in the office, from the attention chip on the top bar, from **☰** > **Mission control**, or from the command palette (**Ctrl+K**: *Mission control*, *Edit the mission*, *Review finished work*). In the 2D view (`/lite`) it's the **Mission** button in the top bar. It has a ✕ in the top right, and Esc closes it and puts you straight back into looking around. It remembers the tab you had open last.

Inside it, **1** **2** **3** switch tabs, the arrow keys move between rows, and **Enter** does the selected row's next step.

## Attention

Every worker hired onto a desk, a bean bag or the meeting table, on every floor (the board agents at their kiosks are left out), grouped by level, most urgent first:

| Level | What puts a worker there |
| --- | --- |
| Needs you | It's waiting on an answer or a permission: *needs input for 18 min: Wants permission: Bash: npm test* |
| Stuck | Working but no hook event and no terminal output for 10 minutes (*working but silent for 12 min*); tests or a build failing again and again; crashed (*crashed (exit 1)*); its worktree was deleted; hired 15 minutes ago and never given a task; its queue task failed to start |
| To review | Done and nobody has looked (after 30 minutes: *forgotten: done 42 min ago, nobody looked*); its pull request's checks are failing; its pull request merged, so it can go home |
| Working | At work and showing signs of life |
| Parked | Done and seen to, or asleep |

Within a level, whoever has waited longest comes first. The working and parked groups stay folded until you open them, so the list stays short.

Each row shows the worker, its floor, what it's for (its milestone, its issue, or *unlinked*), what it's doing, the reason, how long it has been that way and what it has cost, with one button for the next step:

| Button | What it does |
| --- | --- |
| Answer, Look into it | Opens its terminal |
| Review changes | Opens its Changes window |
| Open PR, Fix checks | Opens its pull request's window, where **Fix comments & merge** hands it to a worker (after checking who the pull request is from) |
| Resume | Starts it again |
| Rebuild | Puts its deleted worktree back, or sends it home |
| Send home | Sends it home, asking what to do with its worktree |
| Give it a task | Types it a first prompt |

A worker on another floor takes you to its floor and its desk first, then does it.

**...** on a row has the rest: open its terminal, snooze it for 30 minutes, 2 hours or until its status next changes, link it to a milestone, send it home. A snooze is shared: everyone sees *snoozed by Ana until 14:30*, so two people don't both chase the same worker. A snoozed worker stays in the list, greyed, but it isn't counted and nothing notifies about it.

The same ranking runs everywhere: the attention chip on the top bar (*2 need you · 1 stuck · 3 to review*, click it for this tab), the tab title's count, the order of the Workers panel (which shows the reason in place of the bare status), the 2D view's list, the webhook, and what agents see from `list_workers`. It lives in one place, `src/shared/attention.ts`, with its thresholds.

**N** goes to the worker on your floor that has waited longest on someone, then the next; after the last one on your floor it takes you to the next floor's.

A worker that gets stuck dings on your floor and, while you're in another tab, pops up a desktop notification wherever it is. After the same few seconds' wait as the other alerts, the team's webhook gets a line about it too. Nothing else new dings.

## Goals

What the floor is for. Click the mission statement to edit it (up to 500 characters): **Enter** saves, **Shift+Enter** is a new line, **Esc** cancels, and clicking away keeps what you typed. Under it are up to 12 milestones, each with a title, the issues it covers, an optional due date and a done box. One is active: the step the team is on now. Edit a milestone's title, issues or date the same way, move it up or down, mark it done, make it active, or remove it.

Each milestone shows how far it has got and what it has cost: *issues 3/7 · PRs 2 open · 2 working · $4.10 · 3 h 20 min on task*, a progress bar of its issues closed, and the workers on it. Its spend and time include the workers who have gone home from it.

Workers with no milestone and no issue are listed as **unlinked**, each with a picker to link it. **Tell the workers about a change** sends the agents you pick a one-line note as their next prompt when the mission changes; nobody is interrupted otherwise.

Anyone signed in can edit the mission. An admin can tick *Only admins can change the mission* to lock it.

## Review

The workers whose work is done and waits for a person, across every floor, oldest first: finished turns nobody looked at, pull requests with failing checks, and merged ones whose workers can go home.

## The mission strip

One line under the floor's name, top left, in the 3D office (and the first card in the 2D view): the floor's mission, the active milestone with a thin progress bar (*Auth rewrite · 3/7 issues · 2 workers*), and *unlinked: 2* when workers aren't tied to anything. With no mission yet it reads *No mission yet. Set one*. Click it for the Goals tab. The **☰** menu's *Mission* switch hides it.

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
- Text people type is cleaned on the server: trimmed, cut to its length, and stripped of control characters and the invisible ones that reorder or hide text. Milestone ids are made by the office, and issue numbers must be positive whole numbers.
- The page shows the mission as plain text, never as HTML or Markdown.
- The building-wide roster carries task names, short activity lines (80 characters at most) and ids, never a full prompt or terminal output.
- Terminal output is stamped at most every 30 seconds and never broadcast by itself; the roster picks it up on its next look.

## Not yet

The timeline of what happened, the digest of what changed while you were away and the review inbox's own pull-request list come next.
