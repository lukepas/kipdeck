# Pricing and metrics

One place for the numbers the other documents quote. Prices are in EUR, excluding VAT, and assume one senior consultant (you) plus, for the larger tiers, a second engineer part-time. Revisit them after the first two pilots with real hours.

## Cost basis

| Item | Assumption | Notes |
| --- | --- | --- |
| Senior consultant day | EUR 1,000 | Baltic and Nordic senior contractor rates for AI and DevOps work cluster around EUR 700-1,200 a day. Check against your employer's rate card if this runs as an internal offering. |
| Second engineer day | EUR 700 | Only in the Standard and Extended tiers |
| Contingency | 15% | Onboarding delays, client access requests, review meetings |
| Hosting per pilot | EUR 50-250 a month | One VM (4-8 vCPU, 16-32 GB RAM) in an EU region runs the office and 6-10 workers. GPU is not needed; the models are called over APIs. |
| Model spend | Passed through, not marked up | Client's own API keys or subscriptions by default. See "Who pays for models". |

## Price list

### Agent team lab pilot

| Tier | Length | Repositories | Effort (days) | Price |
| --- | --- | --- | --- | --- |
| Starter | 2 weeks | 1 | about 10 | EUR 12,000 |
| Standard | 4 weeks | up to 2 | about 24 (18 + 6) | EUR 28,000 |
| Extended | 6 weeks | up to 3 | about 40 (28 + 12) | EUR 45,000 |

How the prices were set: effort days times day rate, plus contingency, rounded. Starter is 10 x 1,000 x 1.15 = 11,500, rounded to 12,000. Standard is (18 x 1,000 + 6 x 700) x 1.15 = 25,530, rounded up to 28,000 to cover the second repository's setup. Extended is (28 x 1,000 + 12 x 700) x 1.15 = 41,860, rounded to 45,000.

Payment: 50% on signing, 50% on the final readout. For Extended, 40 / 30 / 30 at signing, mid-point review and final readout.

### Add-ons

| Add-on | Price |
| --- | --- |
| Extra repository | EUR 6,000 (Standard and Extended only) |
| Hosted office after the pilot, EU region, business-hours support | EUR 900 a month for up to 15 seats, EUR 45 per extra seat |
| Security review of the client's agent setup (written report) | EUR 4,500 |
| On-site day (travel billed at cost) | EUR 1,200 |

### Workshop

| Format | Participants | Price |
| --- | --- | --- |
| 1 day, remote | up to 12 | EUR 4,500 |
| 1 day, on-site | up to 12 | EUR 5,500 plus travel |
| 3 days, remote or on-site | up to 12 | EUR 12,000 plus travel |
| Public cohort seat (1 day) | per person | EUR 450 |

Model spend during the workshop is included up to EUR 30 per participant per day; see the instructor notes for how it is capped.

### Discounts

- 10% off the pilot if the client agrees to a named, public case study with numbers.
- Workshop fee credited against a pilot signed within 60 days.
- No other discounts. A lower price means a smaller tier.

## Who pays for models

Default: the client uses its own Anthropic, OpenAI or other accounts, and each worker signs in with the client's credentials (the office supports per-person sign-ins; see "Their own Claude and GitHub" in the README and the Security notes in docs/how-it-works.md). The client sees the spend on its own invoice and the consultancy never holds its API keys.

Fallback: the consultancy provides API access and re-invoices at cost with a hard monthly cap written into the SOW. Use this only when the client cannot procure in time.

Budgeting guide for the client, to be replaced by measured numbers after the first pilot:

| Usage | Rough monthly model spend |
| --- | --- |
| 3 workers, business hours, mostly small issues | EUR 300-900 |
| 6 workers, business hours, mixed issues | EUR 900-2,500 |
| 10 workers, long-running tasks | EUR 2,500-6,000 |

These are ranges, not quotes. Flat-rate subscriptions (per-seat plans with usage limits) can cost less than API billing for steady use; compare both in week 1.

## Metrics the pilot reports

All metrics are computed from GitHub (PRs, reviews, CI runs), the office's task queue and spend readouts, and the model providers' usage exports. Record the baseline from the 4-8 weeks before the pilot for the same repositories, with the same definitions.

| Metric | Definition | Source |
| --- | --- | --- |
| Throughput | PRs merged per week, split into agent-authored and human-authored | GitHub |
| Agent share | Agent-authored merged PRs / all merged PRs | GitHub, branch naming or labels |
| Cost per merged PR | (model spend + hosting + reviewer time at a loaded hourly rate) / agent-authored merged PRs | Provider exports, invoices, review log |
| Model cost per merged PR | Model spend / agent-authored merged PRs | Provider exports |
| Reviewer minutes per PR | Median human minutes spent reviewing or fixing an agent PR before merge | Self-reported review log, sampled |
| Lead time | Median hours from task queued (or issue labeled) to PR merged | Office queue, GitHub |
| First-pass CI rate | Agent PRs whose first CI run passed / agent PRs opened | GitHub Actions or the client's CI |
| Acceptance rate | Agent PRs merged / agent PRs opened (closed-unmerged counts as rejected) | GitHub |
| Rework rate | Agent PRs merged and then reverted or followed by a fix PR for the same change within 14 days / agent PRs merged | GitHub, tagged manually |
| Waiting time | Share of worker hours spent in "needs input" | Office worker status |
| Escaped defects | Production incidents traced to an agent PR during the pilot | Client incident log |

Rules for reporting:
- Report medians and counts, not only averages; a pilot has too few PRs for averages to mean much.
- Report every metric even when it looks bad. A pilot that shows a 40% acceptance rate with a clear reason is more useful than one with a flattering subset.
- Reviewer time is the cost that decides whether this is worth it. Measure it, even roughly.
- Do not claim productivity multiples. Report the numbers and let the client draw the conclusion.

### Targets to discuss, not promise

What a pilot is aiming for on well-scoped issues in a repository with working CI. These go in the proposal as goals, never as guarantees.

- Acceptance rate above 60% by the last week.
- Median reviewer minutes per agent PR under 20.
- Model cost per merged PR under EUR 15 for small issues.
- Rework rate under 10%.

## Pricing for hackathon and grant budgets

When a grant or credit application asks for a budget, use the same numbers: day rate EUR 1,000, hosting EUR 50-250 a month per office, model spend from the table above. Keep one spreadsheet so every application quotes the same figures.
