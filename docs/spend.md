# Spend and control

How Kipdeck shows what each agent may do without asking and what it costs, and how to pause or stop all of them at once.

Back to the [README](../README.md).

## Permission mode

Every agent row and the pane's header show the agent's permission mode as a small badge:

| Badge | Means |
| --- | --- |
| `bypass` | Runs any command and edits any file without asking. In the signal colour, because it never asks. |
| `auto` | Decides for itself which tool calls are safe, and asks for the rest. |
| `edits` | Edits files without asking, and asks before running commands. |
| `ask` | Asks before every edit and command. |
| `plan` | Reads and plans only. |

The badge is read off the command line the agent was started with, so it is what the agent actually runs in, not what someone meant:

- Claude Code: `--permission-mode bypassPermissions`, `auto`, `acceptEdits`, `default` or `plan`, and `--dangerously-skip-permissions`.
- Codex: `--dangerously-bypass-approvals-and-sandbox` (or `--yolo`), `--full-auto`, `-a` / `--ask-for-approval`, and `--sandbox read-only`.
- Cursor: `--force`.

These come from `--agent-args` (or `AGENT_OFFICE_AGENT_ARGS`) when the agent runs Kipdeck's own `--agent`, and from the project's default mode below. When the command line names no mode, the row shows no badge and the pane says **own settings**: the CLI's own settings (for Claude Code, `defaultMode` in its settings files) decide, and Kipdeck can't see them.

### A project's default mode

**Settings > Agents > Permission mode** has one line per project. An admin picks a mode, or *Agent's own settings*. New Claude Code agents on that project start with `--permission-mode` set to it; agents already running keep theirs until they start again. A mode on Kipdeck's own command line (`--agent-args`) wins over the project's, so whoever started Kipdeck keeps the last word. Other CLIs show what their own command line says; the project default isn't passed to them yet.

## Spend

- **On each row**: what the agent spent this session, such as `$1.20`. An agent whose CLI reports tokens but no price (Codex) shows `48k tok`. One whose CLI reports nothing to Kipdeck (Grok, Muse, Pi, Cursor) shows `cost ?`. A metered agent that hasn't reported yet shows nothing. Unknown is never shown as `$0`.
- **In the pane**: the same, against the agent's budget when there is one (`$4.10 of $5.00`, amber from 80 percent, orange at the cap).
- **In the pulse**: *spent today* across every project, with the daily budget beside it when one is set (`$12.40 / $20.00`), and how many agents it can't count (*2 unmetered*).

Today's figure adds up every rise in an agent's reported cost seen since midnight on Kipdeck's machine, whichever CLI reported it: Claude Code (read from its session transcripts) and OpenCode today. Codex reports tokens only, so its spend is not in the dollar figure.

## Budgets

**Settings > Agents > Budget** takes two caps, in dollars, set by an admin:

- **Per agent**: what one agent may spend in its session.
- **Per day**: what every agent together may spend today.

At 80 percent of either cap, everyone gets a warning toast once. At 100 percent:

- An agent over its own cap is paused: Kipdeck interrupts it (Esc in its terminal) and holds it in **Needs you** as *Paused: reached its $5.00 budget*. **Continue** lets it carry on with room for another cap's worth; **Stop** ends it. Its spend on the row turns amber from 80 percent and orange at the cap.
- Over the daily cap, every agent at work is paused the same way (*Paused: today's $20.00 budget is spent*). **Continue** lets that agent carry on for the rest of the day.

Only an admin can **Continue** an agent a budget paused, since admins set the caps; anyone else is told so. Typing into its terminal doesn't lift a budget pause either: the agent is interrupted again until an admin decides.

`--budget <usd>` on the command line is the daily cap until an admin sets one in Settings. `--budget-pause` still refuses new hires for the rest of the day once the Claude Code ledger passes `--budget`.

## Pause all, Resume all and Stop all

The **Pause all** button in the top bar (beside Deploy agent, while any agent runs) opens a short menu, and the same commands are in Ctrl+K. Each one acts on the project picked in the top bar, or every project under *All projects*.

- **Pause all working**: interrupts every agent at work and holds it in Needs you as *Paused by <you>*. A toast offers **Undo** for a few seconds, which lets them all carry on.
- **Resume all paused**: lets every paused agent carry on. One that was at work is told to pick up where it left off.
- **Stop all agents**: asks first, then waits 7 seconds with **Undo** before anything is sent. Each session ends and leaves the inbox, as each agent's own **Stop** does. Every branch stays.

The pane has **Pause** beside **Stop** for one agent at work. Typing into the terminal of an agent someone paused lets it go too: the pause comes off as if you had pressed Continue (a budget pause doesn't, see above). A message from another agent never does: `tell_worker` to a paused agent is refused until a person lets it carry on. An agent that keeps working after a pause (its CLI ignored the Esc) is interrupted again every 30 seconds until someone decides. Pausing sends Esc, which interrupts Claude Code, Codex and OpenCode; a CLI that ignores it needs **Stop**.

## Where it is kept

`spend.json` in Kipdeck's data folder: the caps, each project's default mode, today's total, the pauses (so a restart keeps them), and each agent's last seen cost. Each agent's mode is kept with it in its project's `workers.json`.

## For developers

The rules are pure and shared: `src/shared/autonomy.ts` (reading a mode off a command line, and putting a project's default on it) and `src/shared/spend.ts` (the chips, the totals, the 80 and 100 percent levels, and what a pause says). The server side is `src/server/spend/`: `service.ts` (the `Spend` service, `ctx.spend`, swept every 5 seconds from `office/timers.ts`), `launch.ts` (every launch plan goes through `withMode`) and the `spend` protocol domain with `ws/handlers/spend.ts`. A pause is `WorkerInfo.hold`, which the attention ranking turns into Needs you with the `unpause` action (*Continue*). The inbox's side is `src/client/home/spend.ts`, loaded just after the page first draws through `spend-slot.ts` so the first load stays under its budget (`tests/home-budget.test.ts`), with Pause all, Resume all and Stop all in `spend-control.ts`, loaded on first use; Settings' rows are `src/client/ui/settings-spend.ts`. Tests: `tests/autonomy.test.ts`, `tests/spend.test.ts` and `tests/spend-e2e.test.ts`.
