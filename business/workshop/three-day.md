# Three-day curriculum: running a team of coding agents

Duration: three days, 09:00-16:30 each. Group: 6-12 participants, pairs on days 1-2, teams of 3-4 on day 3. Exercise repositories: all five in [exercise-repos.md](exercise-repos.md), plus optionally one of the client's own repositories on day 3.

Day 1 is the [one-day curriculum](one-day.md) with two changes: block 7 (first-week plan) moves to the end of day 3, and the freed 50 minutes go to a longer block 3 (parallel agents), with a third round in which each pair runs five agents.

## Learning goals

Everything in the one-day course, plus by the end of day 3 each participant can:

1. Turn a vague request into a sequence of agent-ready issues, with dependencies and an order that avoids conflicts.
2. Use tests as the contract: write test-first tasks, characterization tests before refactoring, and spot an agent weakening a test.
3. Set a worker limit, a budget and alerts for a team, and read spend per merged PR.
4. Choose which work goes to agents and which stays with people, with reasons.
5. Set up an agent workspace with per-person credentials, scoped tokens and branch protection, and review a PR for prompt injection and data leaks.
6. Run a small team of agents on a real repository for half a day and report the numbers.

## Day 1: the core loop

As in [one-day.md](one-day.md), blocks 1-6, with the extended parallel block.

## Day 2: tasks, tests and review at scale

| Time | Block | Format |
| --- | --- | --- |
| 09:00 | Recap of day 1 numbers: acceptance rate, review minutes, cost per PR | Plenary, 20 min |
| 09:20 | 8. Tests as the contract | Talk 15 min, exercise 60 min |
| 10:35 | Break | 15 min |
| 10:50 | 9. Flaky, slow and timezone-shaped problems | Exercise, 60 min |
| 11:50 | 10. UI work with screenshots as acceptance | Exercise, 40 min |
| 12:30 | Lunch | 45 min |
| 13:15 | 11. Review rotation at scale | Exercise, 60 min |
| 14:15 | Break | 15 min |
| 14:30 | 12. Second opinions: a different agent reviews the PR | Exercise, 40 min |
| 15:10 | 13. Cost control | Talk and exercise, 50 min |
| 16:00 | Day 2 debrief | 30 min |

### 8. Tests as the contract

Repository: `sensor-ingest`.

Talk: tests-only tasks, "do not modify tests" limits, and why agents weaken assertions when they cannot make code pass.

Exercise: pairs run S3 (write tests for `aggregate.py`, no production changes), review what the agent wrote against the code's actual behavior, then run S1 with "the tests from S3 must still pass unchanged" in the acceptance criteria.

### 9. Flaky, slow and timezone-shaped problems

Repository: `sensor-ingest`.

- S2: pairs give the flaky test to an agent with the plain issue text first. Most agents add a retry or a sleep. Then rewrite the task to ask for the root cause and a test that fails deterministically before the fix.
- S4: pairs write the acceptance as a benchmark command with a target time before giving it to the agent.
- S6: pairs check whether the agent handled both DST transitions; the lesson is to list edge cases explicitly.

### 10. UI work with screenshots as acceptance

Repository: `inkwell-web`.

Pairs run W1, W2 and W4. Acceptance is a Playwright check plus a screenshot the agent attaches to its PR. Then W5, which shows an agent updating screenshot baselines it should not touch.

### 11. Review rotation at scale

The whole group runs all remaining open issues across `sensor-ingest` and `inkwell-web` through the shared queue, worker limit 8. Two participants at a time are on review rotation for 15 minutes each; everyone else writes and fixes issues.

Measure: review queue length over time, review minutes per PR, PRs closed instead of fixed. The debrief question: at what worker limit did review become the bottleneck?

### 12. Second opinions

A PR from block 11 goes to a second, different agent (for example Codex reviewing Claude Code's PR, or the reverse) with the review checklist as its prompt. Compare its comments with a human review of the same PR. Typical finding: the second agent catches missing tests and error handling, and misses business-rule problems. Use it as a first filter, not a replacement.

### 13. Cost control

Talk: per-person plans against pooled API keys, worker limits, spend alerts, and the cost of a waiting worker (idle is cheap; a worker looping on a failing test is not).

Exercise: each pair takes the spend data from days 1-2 and writes a one-page cost policy for a 10-engineer team: worker limit, budget per person per month, alert threshold, and what happens when it is reached.

## Day 3: decomposition, security and a capstone

| Time | Block | Format |
| --- | --- | --- |
| 09:00 | 14. Decomposing a large change | Exercise, 75 min |
| 10:15 | Break | 15 min |
| 10:30 | 15. Security for agent workspaces | Talk 20 min, exercise 40 min |
| 11:30 | 16. What stays with people | Discussion, 30 min |
| 12:00 | Lunch | 45 min |
| 12:45 | 17. Capstone: a team of agents for an afternoon | Teams, 150 min (with a break) |
| 15:15 | Capstone readouts | 5 min per team |
| 15:45 | 18. Your team's first month | Individual, then plenary, 30 min |
| 16:15 | Wrap-up and survey | 15 min |

### 14. Decomposing a large change

Repository: `legacy-billing`.

Teams take B3 ("modernize the billing service"). They must produce 5-8 agent-ready issues with the template, a dependency order, and a rule for which can run in parallel. B1 (characterization tests) must come first. They run the first three through the queue and compare how far each team got.

### 15. Security for agent workspaces

Talk:
- Threat model: anyone who can sign in to an agent workspace can run commands as its OS user. Agents read untrusted text (issues, dependencies, web pages) that can carry instructions.
- Controls: per-person sign-ins, fine-grained tokens scoped to the repositories, branch protection with required review, workers in containers without host network or cloud metadata access, secrets outside repositories and agent environments, logs of who ran what. Be clear about which of these the office does today: per-person sign-ins and token stripping yes; per-worker containers and a built-in audit log no (as of 2026-09-30), so those come from the VM, the firewall and the reverse proxy.

Exercise:
- Review B5's agent PR for personal data written to logs.
- Review T12 from day 1 again, and write the repository instruction that would have told the agent to ignore instructions found in data files, then test whether it helps. (It helps somewhat; review still has to catch it.)
- Walk through a checklist for the workspace itself: TLS, account roles, invite links, who can change notifications and settings.

### 16. What stays with people

Discussion with examples from the three days: product decisions, ambiguous business rules (B4), UI design (W6), anything where the acceptance criterion cannot be written down. Outcome: a short list per team of work they will not give to agents.

### 17. Capstone

Teams of 3-4 pick a repository: one of the exercise repositories with fresh issues from the instructor's reserve list, or (with the client's approval and access prepared in advance) one of the client's own repositories.

Each team:
1. Writes 6-10 issues with the template (30 min).
2. Runs them through the queue with a worker limit of 4-6, reviewing as they arrive (90 min).
3. Prepares a readout: merged, rejected and closed counts, median review minutes, model cost per merged PR, and one thing they would change (30 min).

### 18. Your team's first month

Each participant writes a one-page plan: repository, first 20 issues, reviewers, worker limit, budget, the metrics to track weekly, and the date of the first review. Three volunteers present.

## Instructor notes

Staffing: one instructor for up to 8 participants; add a second facilitator for 9-12, mainly for review rotation on day 2 and the capstone.

Budget: EUR 30 of model spend per participant per day, EUR 90 for the three days. Days 2 and 3 run more parallel agents, so expect EUR 15-25 per participant per day. Per-participant keys with spending limits, or plan limits checked in advance.

Preparation:
- Everything in [setup-checklist.md](setup-checklist.md).
- Rerun every seeded issue with the current model the week before. Replace issues whose lesson no longer shows.
- Keep a reserve of 20 extra agent-ready issues across the five repositories for the capstone.
- If a client repository is used on day 3: access, a sandbox fork, branch protection and the client's approval of which model providers may see the code, all in writing a week before.

Things that go wrong:
- CI queue saturation on day 2 block 11. Use self-hosted runners or raise the organization's concurrency limit.
- One participant's agent loops on a failing test and burns budget. Show it to the group; it is the best cost-control example of the course.
- A strong participant finishes early. Give them the second-opinion setup or a B3 sub-issue.
- Somebody wants to discuss whether agents will replace developers. Park it for block 16.

Assessment: no exam. The capstone readout and the first-month plan are the evidence. Participants who want a certificate of attendance get one; do not call it a certification.
