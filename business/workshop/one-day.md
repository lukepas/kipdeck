# One-day curriculum: running a team of coding agents

Duration: 7 hours including breaks (09:00-16:30). Group: 6-12 participants, working in pairs. Exercise repositories: `ledger-lite` and `trail-api` from [exercise-repos.md](exercise-repos.md).

## Learning goals

By the end of the day each participant can:

1. Write an issue an agent can finish without asking, and recognize one it cannot.
2. Run three or more agents in parallel on one repository without them stepping on each other.
3. Review an agent PR in under 15 minutes with a checklist, and decide between merge, request changes and close.
4. Read the cost of a piece of agent work and compare it with the time it saved.
5. Name the two security rules that matter most on day one: agents run as you, and everything they read can steer them.

## Agenda

| Time | Block | Format |
| --- | --- | --- |
| 09:00 | Welcome, setup check, how the day works | Plenary, 20 min |
| 09:20 | 1. One agent, one issue: the baseline | Exercise, 40 min |
| 10:00 | Debrief: where the agent went wrong | Plenary, 20 min |
| 10:20 | Break | 15 min |
| 10:35 | 2. Writing tasks agents can finish | Short talk 15 min, exercise 45 min |
| 11:35 | 3. Parallel agents and the queue | Exercise, 55 min |
| 12:30 | Lunch | 45 min |
| 13:15 | 4. Reviewing at speed | Exercise, 50 min |
| 14:05 | 5. What it cost | Exercise, 30 min |
| 14:35 | Break | 15 min |
| 14:50 | 6. Security on day one | Talk and demo, 30 min |
| 15:20 | 7. Your team's first week | Pairs, then plenary, 50 min |
| 16:10 | Wrap-up and survey | 20 min |

## Blocks and exercises

### 1. One agent, one issue: the baseline

Each pair picks one seeded issue in `ledger-lite` (issues L1-L6) and gives it to one agent with only the issue text as the prompt. They watch without intervening and note: what it asked, what it assumed, whether tests pass, and how long it took.

Expected result: about half the PRs are mergeable. The others show typical failures: a wrong assumption about rounding, a changed test instead of fixed code, a missed edge case.

### 2. Writing tasks agents can finish

Talk (15 min): the task template.

- Goal in one sentence, from the user's point of view.
- Where to look: files, functions, related tests.
- Acceptance: the exact checks that must pass, and one example input and output.
- Limits: what must not change (public API, test files, migrations).
- When to stop and ask.

Exercise: each pair rewrites a failed issue from block 1 with the template and runs it again with a fresh agent. Then rewrites one of the deliberately vague issues (L7 or L8) and decides whether it should go to an agent at all.

Pass mark: the rerun PR passes CI and needs no more than one review comment.

### 3. Parallel agents and the queue

Setup: `trail-api` with 12 seeded issues (T1-T12), some of which touch the same file.

Round 1 (20 min): each pair starts three agents at once on three issues of their choice, each in its own worktree.

Round 2 (25 min): the group puts all remaining issues in the shared task queue with a worker limit of 6 and lets the queue hand them out.

Debrief (10 min): merge conflicts from T3 and T4 (same router file), duplicate work, waiting agents. Rules that come out of it: one issue per agent, one branch per issue, split issues that touch shared files, keep the worker limit below what the reviewers can review.

### 4. Reviewing at speed

Each participant gets four agent PRs from round 2 that are not their own. They review with the checklist below, timing each review. Two of the PRs have seeded problems (see instructor notes).

Review checklist:
1. Does the diff do what the issue asked, and only that?
2. Did it change or delete tests to make them pass?
3. New dependencies, network calls, file or shell access?
4. Error handling on the new paths?
5. Would you understand this code in six months?
6. Merge, request one round of changes, or close and rewrite the issue?

Rule of thumb taught here: if a PR needs more than one round of changes, close it and fix the issue text instead.

### 5. What it cost

Pairs read the spend for their workers from the office (or the provider's usage page), then fill in a table per merged PR: model cost, their review minutes, their estimate of how long it would have taken them by hand. Then compute cost per merged PR with review time valued at a loaded rate of EUR 60 an hour.

Discussion: the review minutes dominate the cost for small issues. That is the number to push down.

### 6. Security on day one

Talk and demo, no exercise:
- An agent runs with your permissions: your shell, your tokens, your GitHub account. Use per-person sign-ins and scoped tokens, never a shared admin token.
- Prompt injection is real: the demo issue T12 contains an instruction hidden in a code comment of a fixture file, telling the agent to add a new dependency. Show the agent following it, then show the review catching it.
- Branch protection on, agents never push to the default branch, required review stays.
- Keep secrets out of the repository and out of agent environments.

### 7. Your team's first week

Pairs draft a one-page plan for their own team: which repository, 10 candidate issues, who reviews, worker limit, budget, and the three metrics they will track (acceptance rate, review minutes per PR, cost per merged PR). Two pairs present.

## Instructor notes

Before the day:
- Follow [setup-checklist.md](setup-checklist.md). Run every seeded issue once with the current model version the week before; agents improve and a seeded failure may stop failing. Replace any issue that no longer shows its lesson.
- Reset the exercise repositories from their tagged `workshop-start` state for each group.
- Budget cap: EUR 30 of model spend per participant for the day. With API billing, create one key per participant with a spending limit; with subscriptions, check the plan limits in advance. Typical spend is EUR 8-15 per participant.

Seeded review problems for block 4 (prepare these PRs in advance in case the live run does not produce them):
- A PR for T6 that passes by weakening an assertion in the test file.
- A PR for T9 that adds an unneeded HTTP client dependency.

Timing risks:
- Block 3 overruns when CI is slow. Keep the exercise repositories' CI under 2 minutes.
- If model access fails, switch to the prepared PRs and run blocks 4 and 5 on those; blocks 1-3 become a demo from the instructor's screen.

Facilitation:
- Ask pairs to narrate what the agent is doing rather than typing over it. The value of block 1 is watching failures happen.
- Collect every rejected PR in a shared list during the day; it becomes the material for the debriefs.
- Do not argue about which model is best. Keep the discussion on task writing, review and cost.

Survey questions (end of day): confidence writing an agent task (1-5), expected first-week plan, what to cut, what was missing.
