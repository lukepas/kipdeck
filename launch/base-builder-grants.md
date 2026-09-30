# Base Builder Grants

Last checked: 2026-09-30. Sources: the Base grants team's post "Calling Based Builders" and the Base "Get funded" docs (links below). The nomination form was not opened, so its fields are [unverified].

Plan: once x402 pay-per-task payments (branch `launch/x402-base`) are live on Base mainnet and someone other than us has paid for a task, nominate the project. Base Builder Grants are retroactive: they reward something already shipped, not a plan.

## Deadline

- **No deadline**: nominations are reviewed continuously and grants go out in cohorts.
- Internal target: nominate on **2026-10-28**, after the Colosseum entry and once real payments exist on mainnet. Nominating earlier, with nothing live, wastes the one shot at a first impression.

## Links

- Grants team post (criteria, form link): https://paragraph.com/@grants.base.eth/calling-based-builders
- Nomination form: https://docs.google.com/forms/d/e/1FAIpQLSfXuEzmiAzRhie_z9raFCF1BXweXgVt18o-DvBuRRgyTygL2A/viewform
- Other Base funding (Base Batches, Ecosystem Fund): https://docs.base.org/get-started/get-funded

## Eligibility checklist

- [ ] Shipped and live on Base mainnet, usable by the public.
- [ ] Real onchain activity from users who are not us.
- [ ] Posted about on X or Farcaster: the team finds most grantees there, and only contacts the ones it picks.
- [ ] W-8BEN (non-US) or W-9 ready: grantees must provide one for KYC, tax and legal reasons.
- [ ] A Base wallet to receive ETH (grants have ranged 1 to 5 ETH).
- [ ] Employer: the employer's permission for outside work and for receiving the grant.

## Pre-existing code disclosure

```field name="Prior work" max-chars=700
We build on Agent Office, an MIT open source 3D office for coding agents by webdevcody / AgentSystemLabs (github.com/AgentSystemLabs/agent-office); the office is their work. What is ours and on Base: x402 pay-per-task access, so anyone can pay a few cents in USDC on Base to have a hosted coding agent take a GitHub issue, with the payment verified onchain before the worker starts. Our changes against upstream: {{DIFF_URL}}
```

## Project description

Fields are not published [unverified]. The three questions the team asks are below; answer each directly.

```field name="What it is" max-chars=280
Pay a hosted AI coding agent per task with x402 on Base: send a few cents of USDC, the agent takes your GitHub issue in a shared 3D office, and you watch it work. No account, no subscription.
```

```field name="Is it unique and fun?" max-words=80
Coding agents sit at desks in a cartoon 3D office you can walk around, and you pay one per task by HTTP 402 instead of signing up for anything. Watching your paid agent type at its desk is the fun part.
```

```field name="Is it bringing more users onchain?" max-words=80
Developers who have never held crypto meet x402 through a tool they already want: an agent that fixes an issue. First payment, first wallet, first USDC on Base. Current numbers: {{ONCHAIN_USERS}} unique payers, {{ONCHAIN_TXS}} payments (real figures only).
```

```field name="Is it live and making an impact?" max-words=80
Live at {{DEMO_URL}} on Base mainnet since {{LIVE_DATE}}. Payments on the explorer: {{EXPLORER_URL}}. Pull requests opened by paid workers: {{PR_COUNT}}.
```

## Judging criteria

| The team's question | Our answer |
| --- | --- |
| Is the builder creating something unique and fun? | Paid agents at desks in a walkable office |
| Is the builder bringing more users onchain? | x402 as a first crypto payment for developers |
| Is the builder's contribution live and making an impact? | Mainnet, real payers, merged PRs; numbers in the form |

The team tests what it is sent before deciding, so the demo link must work for a stranger with a fresh wallet.

## Demo video script

The form may not ask for one [unverified]; a short clip for X and Farcaster is how the team finds grantees anyway.

Runtime target: 0:45 (limit: under 2:20)

The limit above is X's standard upload length [unverified]. Post the clip natively on X and Farcaster, tagging Base.

| Time | Shot | Caption or voiceover |
| --- | --- | --- |
| 0:00-0:10 | A GitHub issue, then a "Pay 0.25 USDC" button | "Fix this issue for a quarter." |
| 0:10-0:25 | Wallet confirms on Base; the x402 receipt; a worker sits down at a desk | "x402 payment on Base, and an agent takes the job." |
| 0:25-0:40 | Terminal typing, then the PR opens | "It opens a pull request." |
| 0:40-0:45 | Card: built on Agent Office (MIT), link | "Built on the open source Agent Office." |

## Submission checklist

- [ ] Live on Base mainnet with payments from people other than us.
- [ ] Demo link tested from a fresh browser and wallet.
- [ ] Clip posted on X and Farcaster, tagging Base.
- [ ] W-8BEN filled in and ready to send.
- [ ] All `{{...}}` placeholders filled with real numbers; `npx tsx launch/tools/lint.ts` clean.
- [ ] Nomination form sent; note the date and do not resend for a month.
