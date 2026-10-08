# Pitch video script

For the Colosseum Crypto World's Fair (closes 2026-10-12 23:59 PT). Founder on camera, own voice. Target 2:25, hard stop 2:30. Colosseum's limit is three minutes; going over it is the first thing their guidance tells you not to do.

Last checked: 2026-10-07, against Colosseum's hackathon FAQ (https://colosseum.com/hackathon) and their submission guide (https://blog.colosseum.com/perfecting-your-hackathon-submission/).

## What Colosseum asks for

- Two to three minutes. Judges watch it first, and it often decides whether a project goes further.
- Who the team is, what problem it solves, who it is for, any user feedback or validation (informal counts), and the bigger vision.
- Judges are also asking: can these founders explain the product clearly, and can they grow its user base?
- Things they mark down: going over time, flashy visuals with little behind them, buzzwords, descriptions that are vague or too technical, leaving out the team, and not making the core idea and its impact clear.

So: your face for most of it, short cutaways to the real product, no hype words, and say plainly what is testnet and what has no users yet.

## Ground rules for every line

- Say "devnet" or "testnet" whenever money is on screen. Never say mainnet except to say there is none.
- Numbers come only from `launch/chain/data/counts.json`, refreshed the day you record. If the numbers changed, change the lines in the traction beat to match before you read them.
- Credit agent-office by webdevcody (MIT) once, out loud.
- Don't name your employer, its clients or any client work, on camera or on screen.
- The product is Kipdeck (https://kipdeck.com); Proof of Merge is its on-chain layer, not the product name. The Colosseum kit (`launch/chain/colosseum-worlds-fair.md`) still uses "Proof of Merge" as the product name; say "Kipdeck" for the product in the form and the videos, and "Proof of Merge" only for the on-chain layer.

## Timed script

About 360 spoken words at roughly 150 words a minute. Times are cumulative. Square brackets are things you fill in or choose between before recording; never read them out.

| Time | Beat | On screen | Words |
| --- | --- | --- | --- |
| 0:00-0:15 | Hook | You, head and shoulders | ~35 |
| 0:15-0:35 | Problem | You; cut to the Attention board with several units waiting | ~50 |
| 0:35-0:47 | Insight | You; title card "A person's merge is the only thing that pays an agent." | ~30 |
| 0:47-1:12 | Product | Cutaways: the bridge from the captain's chair, Mission control's Review tab, the payout toast | ~60 |
| 1:12-1:32 | Why crypto | You; cut to Solana Explorer (devnet) and easscan (Base Sepolia) side by side | ~50 |
| 1:32-1:52 | Traction | You; a plain card with the counts | ~50 |
| 1:52-2:07 | Go-to-market | You | ~40 |
| 2:07-2:17 | Team | You | ~25 |
| 2:17-2:27 | Ask | You; end card with the repo link and "Built on agent-office by webdevcody (MIT)" | ~25 |

### 0:00 Hook

[Use a true moment of your own. If you have one, it beats anything written here. Shape: when, how many agents, what went wrong.]

> Hi, I'm Zygimantas.
> [True version: "Last week I had N coding agents running at once, and one of them sat waiting on me for an hour before I noticed."]
> [Fallback: "If you run more than two coding agents at once, you know this:"]
> they write code faster than you can read it,
> and you lose track of which one is waiting on you.

### 0:15 Problem

> That's the new bottleneck.
> Agent output is cheap. A person's attention isn't.
> Teams that run many agents have no single place that says who needs me right now.
> And there's no honest record of which agents' work actually gets merged.
> Every vendor shows you its own agent.
> Nobody shows you the whole fleet.

### 0:35 Insight

> So I took one rule seriously.
> The only signal that counts is a person merging the work.
> Not a benchmark. Not a pull request opened. A merge.

### 0:47 Product

> Kipdeck is mission control for that.
> Every agent your team runs, Claude Code, Codex, Cursor, Pi, sits at a console on one shared bridge,
> ranked by who needs a human right now.
> Finished work lands in one review inbox.
> And when a person merges an agent's pull request, the merge is proven.
> A bounty is paid, and the agent's record grows.

### 1:12 Why crypto

> That proof is why this is on chain.
> A five-dollar bounty only works if paying it costs a fraction of a cent and can be funded from a link.
> So the escrow is a Solana program, and a release needs two signatures:
> the merge check, and an admin's approval.
> And reputation should be public and portable,
> so every merge becomes an attestation on Base that any tool can read.

### 1:32 Traction

Read the version that is true on the day. Refresh `counts.json` first.

[Version A, no real merge yet:]

> Where we are, honestly.
> Everything runs on testnets.
> The escrow program is live on Solana devnet and has paid five bounties, seventy-seven test USDC, in scripted runs.
> One paid task over x402 settled on Base Sepolia.
> A public demo repo has three funded issues and an agent's pull request waiting for review.
> We have no users yet. That's this month's job.

[Version B, after the first real merge on ugc-army-demo:]

> Where we are, honestly.
> Everything runs on testnets.
> On [date] an agent's pull request on our public demo repo was merged by a person, and the bounty paid out on Solana devnet, with the attestation on Base Sepolia.
> Before that, five scripted devnet payouts, and one paid task over x402.
> We have no users yet. That's this month's job.

[If you held calls this week (see `gtm.md`), add one line, true numbers only: "This week I talked to N teams running agents. X of them said Y."]

### 1:52 Go-to-market

> We start with small teams and open source maintainers who already run several agents.
> They come for mission control, which works with the chain switched off.
> Bounties are the switch they flip when they want to pay for merged work.
> Revenue is a hosted seat for teams, and later a small fee on released bounties, after an audit.

### 2:07 Team

> I'm a software engineer in Vilnius.
> [One true line: years building software, the kind of systems, one thing you shipped. No employer name.]
> I built this on top of agent-office, an MIT project by webdevcody.
> Mission control and everything on chain are mine, built in the last two weeks.

[If someone joins you before recording, add their name and one line, and add them on colosseum.com before the deadline.]

### 2:17 Ask

> I'm looking for five teams who run agents every day to use this weekly and tell me what's broken,
> and maintainers willing to fund a few issues.
> The links are below. Thanks.

## Clean teleprompter text

Paste this block alone into the teleprompter. Fill the bracketed lines first, then delete the brackets. Each blank line is a breath.

```text
Hi, I'm Zygimantas.
[your true hook line]
they write code faster than you can read it,
and you lose track of which one is waiting on you.

That's the new bottleneck.
Agent output is cheap. A person's attention isn't.
Teams that run many agents have no single place
that says who needs me right now.
And there's no honest record
of which agents' work actually gets merged.
Every vendor shows you its own agent.
Nobody shows you the whole fleet.

So I took one rule seriously.
The only signal that counts is a person merging the work.
Not a benchmark. Not a pull request opened. A merge.

Kipdeck is mission control for that.
Every agent your team runs, Claude Code, Codex, Cursor, Pi,
sits at a console on one shared bridge,
ranked by who needs a human right now.
Finished work lands in one review inbox.
And when a person merges an agent's pull request,
the merge is proven.
A bounty is paid, and the agent's record grows.

That proof is why this is on chain.
A five-dollar bounty only works
if paying it costs a fraction of a cent
and can be funded from a link.
So the escrow is a Solana program,
and a release needs two signatures:
the merge check, and an admin's approval.
And reputation should be public and portable,
so every merge becomes an attestation on Base
that any tool can read.

Where we are, honestly.
Everything runs on testnets.
[traction lines, version A or B]
We have no users yet. That's this month's job.

We start with small teams and open source maintainers
who already run several agents.
They come for mission control,
which works with the chain switched off.
Bounties are the switch they flip
when they want to pay for merged work.
Revenue is a hosted seat for teams,
and later a small fee on released bounties, after an audit.

I'm a software engineer in Vilnius.
[your background line]
I built this on top of agent-office,
an MIT project by webdevcody.
Mission control and everything on chain are mine,
built in the last two weeks.

I'm looking for five teams who run agents every day
to use this weekly and tell me what's broken,
and maintainers willing to fund a few issues.
The links are below. Thanks.
```

## Cutaway footage to pull

All from the technical demo recording (see `demo-script.md`), so there is one shoot for both videos:

- Captain's chair view of the bridge with two or three units on the Attention board (2-3 s).
- Mission control (I), Review tab (3), with an "Approve payout" row (2 s).
- The payout toast with its devnet transaction (2 s).
- Solana Explorer on the release transaction and easscan on the attestation, side by side (3 s).

Keep each cutaway under four seconds and go back to your face. The 30 s teaser in `.claude/worktrees/video/video/out/final/` is not for this video: it is a trailer, and the guidance marks down flashy visuals.

## Before you hit record

- [ ] `counts.json` refreshed today; traction lines match it.
- [ ] Hook and team lines filled with true statements.
- [ ] Read it aloud once with a stopwatch. Over 2:30: cut from Product and Why crypto, never from Traction or Team.
- [ ] Name in the form matches the name you say.
