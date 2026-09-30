# Workshop: running a team of coding agents

Two formats of the same course for software engineers and tech leads who already use one coding assistant and want to run several agents in parallel, with people reviewing the work.

- [one-day.md](one-day.md): the core loop in one day. Good as a pilot kick-off or a standalone team session.
- [three-day.md](three-day.md): the core loop plus task design, review at scale, cost control, security and a capstone on the team's own repository.
- [exercise-repos.md](exercise-repos.md): specs for the five small practice repositories with seeded issues.
- [setup-checklist.md](setup-checklist.md): what the instructor and participants prepare beforehand.

## Who it is for

- 6-12 engineers per group, with git, GitHub pull requests and one test runner as daily tools.
- Tech leads and engineering managers are welcome on day 1; the hands-on parts assume someone at the keyboard.
- No machine learning background needed.

## What participants leave with

- A working mental model: agents are fast, cheap junior contributors who never get tired and never ask enough questions. Human time goes to task writing and review.
- A task-writing template, a review checklist and a cost policy they have used on real code.
- Their own measured numbers from the exercises: acceptance rate, review minutes per PR, model cost per merged PR.

## Tooling

The exercises run in a shared office (the open-source Agent Office on a VM the instructor provides), so the whole group sees each other's workers, the queue and the PR boards. Each participant signs in with their own account. The material does not depend on that tool: every exercise can run with agents in separate terminals and a shared GitHub organization, just with less visibility.

Agents used: Claude Code by default; Codex or OpenCode for the "second opinion" exercises. Model access comes from the instructor's pooled budget, capped per participant (see instructor notes in each curriculum).

## Pricing

See [../pricing-and-metrics.md](../pricing-and-metrics.md).
