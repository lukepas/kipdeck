# Base Builder Grants

Last checked: 2026-10-01. Sources: the Base grants team's post "Calling Based Builders" (dated 2023-10-30) and the Base "Get funded" docs (links below). The "Get funded" page lists Base Batches and the Base Ecosystem Fund but not Builder Grants, and the post is three years old, so whether Builder Grants still run in this form in 2026 is [unverified]. The nomination form was not opened, so its fields are [unverified].

Plan: once x402 pay-per-task payments (branch `launch/x402-base`) are live on Base mainnet and someone other than us has paid for a task, nominate the project. The post describes "small grants for builders with early ideas or initial prototypes", but one of its three questions is whether the work is live and making an impact, and third-party summaries call the program retroactive. Nominate something that is live, not a plan.

Code status on 2026-10-01: `launch/x402-base` works. With `--x402` (off by default) the office takes paid tasks at `/api/x402/tasks`: x402 v2, exact USDC by EIP-3009, on Base Sepolia by default or Base mainnet with `--x402-network base`, priced by `--x402-price` (0.10 USDC by default). The facilitator verifies and settles the payment; the task then waits on the queue until an admin approves it (unless `--x402-auto`). Nothing runs on mainnet yet and nobody else has paid.

## Deadline

- **No deadline**: the post describes a rolling program with ongoing discovery [unverified: third-party summaries say grants go out in cohorts announced on X and Farcaster].
- Internal target: nominate on **2026-10-28**, after the Colosseum entry and once real payments exist on mainnet. Nominating earlier, with nothing live, wastes the one shot at a first impression.

## Links

- Grants team post (criteria, form link): https://paragraph.com/@grants.base.eth/calling-based-builders
- Nomination form: https://docs.google.com/forms/d/e/1FAIpQLSfXuEzmiAzRhie_z9raFCF1BXweXgVt18o-DvBuRRgyTygL2A/viewform
- Other Base funding (Base Batches, Ecosystem Fund): https://docs.base.org/get-started/get-funded

## Eligibility checklist

- [ ] Shipped and live on Base mainnet, usable by the public.
- [ ] Real onchain activity from users who are not us.
- [ ] Posted about on X or Farcaster: the team finds grantees "through Twitter, Farcaster, and nominations submitted from the community", and only reaches out to the ones it selects.
- [ ] W-8BEN (non-US) or W-9 ready: the team collects W-8/W-9 forms from all recipients for KYC, tax, compliance and legal reasons.
- [ ] A Base wallet to receive ETH (the 2023 post says grants range from 1 to 5 ETH).
- [ ] Employer: the employer's permission for outside work and for receiving the grant.

## Pre-existing code disclosure

```field name="Prior work" max-chars=700
We build on Agent Office, an MIT open source 3D office for coding agents by webdevcody / AgentSystemLabs (github.com/AgentSystemLabs/agent-office); the office is their work. What is ours and on Base: x402 paid tasks, so anyone can pay a set price in USDC on Base to put a task on a hosted office's queue. A facilitator verifies and settles the payment, and an admin approves the task before a coding agent starts on it. Our changes against upstream: {{DIFF_URL}}
```

## Project description

Fields are not published [unverified]. The three questions the team asks are below; answer each directly.

```field name="What it is" max-chars=280
Pay a hosted AI coding agent per task with x402 on Base: pay a set price in USDC, an admin approves the task, and an agent works on it at a desk in a shared 3D office. No account, no subscription.
```

```field name="Is it unique and fun?" max-words=80
Coding agents sit at desks in a cartoon 3D office you can walk around, and you pay one per task by HTTP 402 instead of signing up for anything. Payers and agents show by their Basenames.
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
| 0:00-0:10 | A task prompt and the 402 answer with the price (set with `--x402-price`) | "Ask an agent for a fix, and the office names its price." |
| 0:10-0:25 | The payment settles on Base; the admin approves it on the queue; a worker sits down at a desk | "x402 payment on Base, an approval, and an agent takes the job." |
| 0:25-0:40 | Terminal typing, then the PR opens | "It opens a pull request." |
| 0:40-0:45 | Card: built on Agent Office (MIT), link | "Built on the open source Agent Office." |

## Submission checklist

- [ ] Live on Base mainnet with payments from people other than us.
- [ ] Demo link tested from a fresh browser and wallet.
- [ ] Clip posted on X and Farcaster, tagging Base.
- [ ] W-8BEN filled in and ready to send.
- [ ] All `{{...}}` placeholders filled with real numbers; `npx tsx launch/tools/lint.ts` clean.
- [ ] Nomination form sent; note the date and do not resend for a month.
