# Metrics for the deck

Back to the [README](../README.md).

What a pre-seed deck should show for Mergeline, where each number comes from, and what not to show. The product has no users yet, so every number here starts at zero; the point of this page is that each one is defined before it is quoted, and measured the same way every week.

## In the product: Numbers

**Numbers** (the avatar menu, or Ctrl+K) shows one Mergeline's last 7 days against the 7 before, for the project picked in the top bar or all of them:

- **Human wait time**: the median minutes finished work sat waiting on a person before it was merged or sent back. This is the headline: the product exists to bring it down.
- **Changes merged**, **merge rate** (merged over every review) and **agent-hours merged** (the time agents worked on what merged).
- **Merged per day** for the last 14 days.
- **Merge rate by agent and model** over 30 days, always with its N, so a 100% from one review reads as one review.

**Copy as Markdown** puts the same table on the clipboard for an investor update. Every figure comes from the signed shipped log on that machine (`shipped.jsonl`, see [the inbox](inbox.md#the-shipped-log)); nothing is sent anywhere. In the demo the window says the agents are scripted: don't put demo numbers in a deck. The arithmetic is `src/shared/metrics.ts`.

A design partner can send you their Numbers table each week (Copy as Markdown); that is the before and after for human wait time.

## Across installs: anonymous usage numbers

Off unless someone turns them on ([Security](security.md#anonymous-usage-numbers)). On, an install records its minutes to the first agent, the first answer and the first merge, and how long each agent waited in Needs you. That gives:

- **Time to first value**: median minutes from the first start to the first agent (target under 2) and to the first merge (target under 10).
- **Activation**: the share of installs with a first agent, a first answer and a first merge on day 1.
- **Human wait time across installs**, from the wait events.

They are only as good as the share of people who opt in; say that N next to every number from them.

## Outside the product

| Metric | Where it comes from |
| --- | --- |
| Weekly active inboxes, week-over-week growth, week-4 retention | Opt-in usage numbers (an install that sent an event that week) |
| Agents per active user per day, changes shipped per user per week | Design partners' Numbers tables |
| Merge rate by agent and model across installs | Design partners' tables, with N; the cross-vendor data no single vendor has |
| GitHub stars per week, contributors | The repository's insights page |
| npm weekly downloads | `https://api.npmjs.org/downloads/point/last-week/mergeline` |
| Hosted demo visits to installs | The demo host's request log against npm downloads; show the slope, not a ratio |
| Team tier waitlist size, and how many asked for the price | The waitlist endpoint (`price: true`, see [the landing page](landing.md#the-waitlist)) |
| Design partners | 3 to 5 named teams using it weekly, a quote from each and a letter of intent for the team tier. Name a team only with its written permission |
| Dogfood: share of this repository's commits made by agents | `git log`, below |

Dogfood share, from this repository's history (commits an agent co-authored, over all commits since the fork's first own commit):

```bash
total=$(git log --since=2026-09-30 --oneline | wc -l)
agent=$(git log --since=2026-09-30 --format=%B | grep -ci '^Co-Authored-By: Claude')
echo "$agent of $total commits"
```

## Don't show

- Chain transactions, testnet amounts or anything from Proof of Merge: it's a lab, off by default, and not part of the pitch.
- Feature counts, deploy-target counts or line counts.
- Demo numbers, or a percentage without its N.
- A competitor's funding figure without a primary source. The Monid USD 7.7M figure is dropped: monid.ai (checked 2026-10-07) says nothing about funding, and Monid sells agents paid access to tools and APIs, which isn't this category anyway ([launch/mergeline](../launch/mergeline/README.md#monid)).
