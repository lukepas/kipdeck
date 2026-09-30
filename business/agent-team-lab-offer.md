# Agent team lab: fixed-price pilot

A 2 to 6 week pilot in which a client's engineering team runs a team of coding agents on its own repositories, with measured results at the end. The client keeps everything: the setup, the runbooks, the numbers and the code.

Prices and metric definitions come from [pricing-and-metrics.md](pricing-and-metrics.md). The contract is [sow-template.md](sow-template.md).

## Who it is for

- Engineering teams of 5-50 people with a real backlog of small and medium issues, working CI, and code review already in place.
- Teams that have tried one developer with one coding assistant and want to know what happens with several agents working in parallel, reviewed by people.
- Not a fit: teams without CI or tests, repositories where no one can review agent PRs, or regulated code where agents may not see the source. For those, start with the workshop or a readiness review.

## What the client gets

A shared office (a self-hosted web app, based on the open-source Agent Office) where the team and its agents work together:

- Each agent worker sits at a desk with a live terminal anyone on the team can watch or join.
- A task queue feeds GitHub issues to agents, up to a worker limit the team sets.
- Issue and PR boards per repository, and notifications to Slack or Discord when a worker needs input or finishes.
- Per-person sign-ins: each engineer's workers run on their own model plan and act on GitHub as them.
- Spend and plan-limit readouts, so cost is visible while the work happens.

The pilot is about the working method, not the tool. The tool is replaceable; the review rules, task sizing and cost limits are what the team keeps.

## Scope by tier

| | Starter | Standard | Extended |
| --- | --- | --- | --- |
| Length | 2 weeks | 4 weeks | 6 weeks |
| Repositories | 1 | up to 2 | up to 3 |
| Client engineers taking part | up to 4 | up to 8 | up to 12 |
| Concurrent agent workers | up to 4 | up to 8 | up to 12 |
| Workshop day for the team | half day | 1 day | 1 day plus a half-day follow-up |
| Hosting | pilot office in an EU region, or on the client's own VM | same | same, plus a staging office for the handover |
| Security review | checklist | checklist plus threat model | written review of the client setup |
| Price (EUR, excl. VAT) | 12,000 | 28,000 | 45,000 |

## Week by week

The Standard tier, 4 weeks. Starter compresses weeks 1-2 into one and skips week 3; Extended adds two weeks of the week 3 loop and a second repository.

Week 0, before start (client side, 1-2 hours): nominate a lead engineer, pick the repositories, grant access, provide model accounts (see "Who pays for models" in the pricing document), export baseline data for the last 4-8 weeks.

Week 1, set up and baseline:
- Install the office on a VM in the client's cloud account, or on an EU-region VM we set up for the pilot; connect GitHub; set up sign-ins per engineer.
- Agree review rules: which directories agents may change, required checks, who approves, branch protection.
- Label 30-60 existing issues as agent-suitable with a short rubric (clear acceptance, small blast radius, testable).
- Record the baseline metrics.

Week 2, first runs:
- Agents take the first 10-20 labeled issues through the queue; engineers review every PR.
- Daily 15-minute check: what was rejected and why, what the agent asked for, what it cost.
- Adjust prompts, task templates and repository instructions (CLAUDE.md or equivalent) based on the rejects.

Week 3, scale up:
- Raise the worker limit; mix in medium issues and test-writing tasks.
- Try two operating patterns side by side, for example "agents open PRs, one reviewer on rotation" against "each engineer runs two agents and reviews their own".
- Mid-point readout with the metrics so far.

Week 4, measure and hand over:
- Freeze the setup, run the last week as the measured week.
- Final readout: metrics against baseline, what worked, what did not, cost per merged PR, recommended operating model.
- Handover of the runbook, configuration, and either the hosted office or a clean install in the client's account.

## Deliverables

1. A working office connected to the client's repositories, installed where the client chooses, with per-person sign-ins and admin roles set.
2. Repository instruction files for agents, and task templates for the issue types that worked.
3. A review policy: what agents may touch, required checks, who approves, when to close an agent PR instead of fixing it.
4. A cost policy: worker limit, per-person plan or API budget, alert thresholds.
5. The metrics report (definitions in pricing-and-metrics.md), with raw data as CSV.
6. A 60-90 minute final readout, recorded if the client wants.
7. A runbook: start, stop, upgrade, add a person, revoke a person, rotate credentials, restore from backup.

## Metrics

Reported weekly and in the final readout, against the client's own baseline:

- Throughput: merged PRs per week, agent-authored and human-authored.
- Cost per merged PR: model spend plus hosting plus reviewer time, divided by agent PRs merged. Model cost per merged PR shown separately.
- Reviewer minutes per agent PR (sampled).
- Lead time from queued to merged.
- Acceptance rate, first-pass CI rate, rework rate within 14 days.
- Share of worker time spent waiting on a person.

No productivity multiple is promised. Goals for the last week (acceptance above 60%, median review under 20 minutes, rework under 10%) are discussed at the start and reported honestly at the end, whether met or not.

## Security posture

Assume that anyone who can sign in to the office can run commands as the office's OS user, because agent workers and shell desks do exactly that. The design follows from that assumption.

Hosting and access:
- One office per client, never shared between clients. One VM or container host per office.
- Default region: an EU region of the client's choice, in the client's own cloud account when possible. If we host the office, we use EU regions only. (No hosted offering exists yet; the first hosted pilot sets it up.)
- The office listens on localhost behind a reverse proxy with TLS, or on a private network (VPN or tailnet). No office is exposed without TLS.
- Sign-in with named accounts and admin roles; the shared password is switched off once accounts exist. Invite links are single-use.
- Security group or firewall allows only the proxy and SSH from named addresses.

Credentials and data:
- Each engineer signs in to their own model and GitHub accounts; the office keeps those sign-ins per account and deletes them when the account is revoked. Machine-level API tokens are stripped from workers' environments.
- The consultancy does not hold client API keys or GitHub tokens outside the office VM. If we provide model access, keys are scoped to the pilot and revoked on the last day.
- GitHub access uses fine-grained tokens or a GitHub App limited to the pilot repositories. Branch protection stays on; agents never push to the default branch.
- Agents run in the client's repositories only. No client code or data leaves the office VM except to the model providers the client has approved, under the client's agreements with them.
- Workers run as an unprivileged OS user. For stricter setups, put the whole office in its own VM with no route to other client systems and block the cloud metadata address at the firewall. Running each worker in its own container and limiting the office's own outbound fetches to public addresses are planned (`launch/docker-sandbox` and PR 5 in upstream-partnership.md) but not built as of 2026-09-30; do not offer them until they are.

Model providers:
- The client chooses the providers. We document which ones see code, their data-retention terms and training-use settings, and set the account options (for example zero-retention or no-training) where the provider offers them.

During and after:
- Every agent PR is reviewed by a client engineer before merge.
- A record of who had an account and when, from the office's account list and the reverse proxy's access logs, is part of the handover. The office has no built-in audit log, so keep the proxy logs for the length of the pilot.
- On the last day: revoke our accounts, rotate any shared secrets, delete our copy of hosted data within 30 days unless the client continues on hosted support. Written confirmation of deletion.
- A data processing agreement is signed before any hosted pilot handles client code.

## Assumptions

The price holds when these are true. If one is not, we agree a change in writing before extra work starts.

- The client provides repository and cloud access within 3 business days of the start date.
- The repositories have CI that runs on PRs and finishes in under 30 minutes.
- At least one client engineer spends about 30% of their time on the pilot, and reviewers are available daily.
- Model accounts are in place by day 3, with budgets at least at the ranges in pricing-and-metrics.md.
- The work happens in English, remotely, in CET/EET business hours. On-site days are billed as add-ons.
- The office is used as open-source software under the MIT license. The client can keep running it after the pilot without licensing fees.
- We are not responsible for code merged by client reviewers, for model provider outages, or for model output quality beyond the review process agreed in week 1.
- No production deployments by agents during the pilot.

## After the pilot

Three options, none required:
- The client runs the office itself using the runbook.
- Hosted office with business-hours support (see pricing-and-metrics.md).
- A follow-up engagement to roll the method out to more teams.
