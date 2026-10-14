# Base Builder Grants (retroactive, by nomination)

Last checked: 2026-10-14. The program post and the nomination form were both fetched today. The form is a public Google Form with no sign-in, and its full field list is below. This kit replaces the 2026-10-03 version and supersedes `launch/base-builder-grants.md` (drafted 2026-10-01 under the old name; its code status line about `--x402-network base` is no longer true, see "To build").

Status: gated. Do not nominate yet. Everything Kipdeck has on Base runs on Base Sepolia, and the code on `main` refuses Base mainnet on purpose.

## Deadline

- Official: none. Rolling program. The post says the team finds grantees "through Twitter, Farcaster, and nominations submitted from the community" and only contacts the ones it selects. Third-party summaries say grants go out in cohorts announced on X and Farcaster [unverified, not on the post].
- Vilnius time: not applicable (no closing date).
- Our date: revisit on Monday 2026-11-02, 10:00 Vilnius (EET, UTC+2), after Colosseum results, as `launch/chain/base-builder.md` says. Nominate only once every gate under "To build" is green. One nomination, then do not resend for at least a month.

## Links

- Program post ("Calling Based Builders", grants.base.eth, dated 2023-10-30, still live on 2026-10-14): https://paragraph.com/@grants.base.eth/calling-based-builders
- Nomination form ("Base Grant Nominations", no login): https://docs.google.com/forms/d/e/1FAIpQLSfXuEzmiAzRhie_z9raFCF1BXweXgVt18o-DvBuRRgyTygL2A/viewform
- What runs on Base Sepolia today (EAS schema): https://base-sepolia.easscan.org/schema/view/0x368e9023c13393aea075e78cae18e804725b0d1bb3e2b1a6c1117d759a01a900
- Repo: https://github.com/zbagdzevicius/kipdeck
- Site: https://kipdeck.com
- Replay demo: https://kipdeck-demo.vercel.app

## Fit

What is built and on `main` today (verified in the repo):

- x402 paid tasks: `src/server/x402/` (gateway, facilitator, protocol), x402 v2, exact scheme, USDC by EIP-3009, price set per office, task held on the queue until an admin approves. Payer CLI and MCP server in `onchain/x402/`.
- EAS proof-of-merge attestations: `onchain/attest/` (MergeAttestor `0x278f441b635ebf4aca971184c0cab60b893f34fc` on Base Sepolia, schema UID above).
- ERC-8004-style reputation: `onchain/reputation/` (feedback only from merge outcomes; self-feedback refused).
- Indexer that rebuilds the public board from Base Sepolia logs and Solana devnet: `onchain/indexer/`.
- GitHub Action: `onchain/action/`.

Fit verdict: strong on "unique" and on Base primitives (x402, EAS, USDC, ERC-8004). Weak on "live and making an impact" until mainnet and outside users exist, and that question is the one a retroactive program weighs most.

## Ask

- There is no amount field. The form is a nomination; Base decides the amount.
- Range from the post: "Grants currently range from 1-5 ETH" (the post calls it an experiment and says this may change).
- Target: 1 ETH, the low end. Justification: the post's stated range starts at 1 ETH, it is a first grant from Base, and a project with a handful of outside users sits at the bottom of a range meant for "early ideas or initial prototypes". Third-party summaries put typical grants at 1 to 5 ETH across 20+ cohorts since March 2024 [unverified: not on the post; no public list of recipient amounts was found to cite].
- Use of 1 ETH, if it comes, as milestones we can report back publicly (not asked for by the form; keep it for the follow-up conversation and the build-in-public thread):

| Milestone | Spend | Measurable outcome | By |
| --- | --- | --- | --- |
| M1 Mainnet hardening | about 0.4 ETH: outside review of MergeAttestor and the attester key handling | Review report linked in the repo; all findings fixed or answered | 6 weeks after the grant |
| M2 Gas and USDC for real use | about 0.2 ETH: attestation gas on Base mainnet and refunds of rejected paid tasks | 100 proof-of-merge attestations on Base mainnet, every one rebuildable by the indexer | 8 weeks |
| M3 Outside users | about 0.4 ETH: hosted office on HTTPS for 6 months | 25 unique outside x402 payers on Base mainnet; board shows merges by people other than us | 12 weeks |

## Eligibility checklist and blockers

Every box here must be ticked before submitting. The first one is open in every kit.

- [ ] Employer: Nortal permission for outside work, for the IP in Kipdeck and the Coinbase licence in field 11, and for receiving a grant or prize personally. [ ] Not ticked. This blocks submission regardless of everything else.
- [ ] Mainnet gate: no written mainnet decision, no contract review, no outside paid task on Base mainnet. The kit says "Do not submit testnet work."
- [ ] Company registration: not needed for the form. Base pays to a wallet and collects a W-8BEN (individual, non-US) or W-8BEN-E (entity) from recipients for KYC and tax. [FOUNDERS: individual or company recipient; if a company, Lithuanian registration details.] Taxes on a 1 ETH grant in Lithuania: [FOUNDERS: check with an accountant].
- [ ] Personal fields: X and Farcaster handles for the project and the builder are not in the repo. W-8BEN needs legal name, address and tax ID: [FOUNDERS: fill when Base asks; do not put them in the form].
- [ ] Team: founder-led; co-founders undecided (D9). [FOUNDERS: team] if Base asks later.
- [ ] A Base wallet to receive ETH: [FOUNDERS: address, ideally with a Basename].

## Pre-existing code disclosure

The form has no field for it; field 9 (under Project description) credits upstream in its first sentence.

```field name="Prior work" max-chars=600
Kipdeck, with Proof of Merge as its payout layer, is built on agent-office (github.com/AgentSystemLabs/agent-office), MIT, by webdevcody / AgentSystemLabs; the office is their work. Ours: the inbox and mission control, proof-of-merge attestations (EAS) and ERC-8004 reputation for AI coding agents, a Solana escrow for bounties, x402 paid tasks and a public board. Commits: launch/chain/disclosure.md.
```

## Project description: form answers

Form title: "Base Grant Nominations". 12 fields, all required. Google Forms short-answer fields have no stated character limit; the only stated limit is 150 words on the "why" question. Self-nomination is allowed ("nominate yourself or others").

### 1. Nominator name (short text, required)

```field name="Nominator Name"
Zygimantas Bagdzevicius
```

### 2. Project name (short text, required)

```field name="Project Name"
Kipdeck (Proof of Merge)
```

### 3. Project URL (short text, required)

```field name="Project URL"
https://kipdeck.com
```

Alternative if the board is hosted by then: `{{BOARD_URL}}` (the public board read from Base mainnet). The team tests what it is sent, so whichever link goes here must work for a stranger with a fresh wallet.

### 4. Project twitter (short text, required)

```field name="Project Twitter"
[FOUNDERS: Kipdeck X handle - none found in the repo; create and post the Base thread before nominating]
```

### 5. Project Farcaster/Channel (short text, required)

```field name="Project Farcaster/Channel"
[FOUNDERS: Kipdeck Farcaster account or channel - none found in the repo]
```

### 6. Builder twitter (short text, required)

```field name="Builder Twitter"
[FOUNDERS: Zygimantas's X handle]
```

### 7. Builder farcaster (short text, required)

```field name="Builder Farcaster"
[FOUNDERS: Zygimantas's Farcaster handle]
```

### 8. Is the project currently live on Base? (multiple choice, required)

Three options: the first is "Yes" plus the mainnet wording, the second is "No" plus the testnet wording, the third is "No - but planning to build on Base". The first option's exact label is not written here, because the repo's docs must never read as a mainnet claim.

Answer at nomination:

```field name="Is the project currently live on Base?"
The first option (Yes, Base mainnet)
```

Pick this only when it is true. Today the honest answer is "No - live on Base testnet", and that is the reason not to nominate today.

### 9. Why does this project deserve a Base grant? (paragraph, required, limit 150 words)

126 words with placeholders; stays under 150 when filled with short values. Fill every `{{...}}` from `launch/chain/data/counts.json` and the explorer on the day; delete a clause rather than guess a number.

```field name="Why does this project deserve a Base grant?" max-words=150
Kipdeck is an open source inbox for AI coding agents, built on agent-office (MIT, by webdevcody / AgentSystemLabs). Its payout layer, Proof of Merge, puts one moment onchain on Base: when a person merges, reverts or closes an agent's pull request, we write an EAS attestation, and ERC-8004 feedback that only those outcomes can earn. A public board, rebuilt from Base logs alone, shows which coding agents actually get merged.

Anyone can also hire an agent for one task with x402: pay {{PRICE}} USDC on Base, an admin approves, the agent opens a pull request. For many developers that is their first wallet and first USDC.

On Base mainnet since {{LIVE_DATE}}: {{PAYERS}} outside payers, {{PAYMENTS}} x402 payments, {{ATTESTATIONS}} merge attestations. Board: {{BOARD_URL}}. MIT code: github.com/zbagdzevicius/kipdeck
```

### 10. Please link a 1 minute demo of the project (short text, required)

```field name="1 minute demo link"
{{DEMO_60S_URL}}
```

Script under Demo video script below.

### 11. Coinbase licence to multimedia assets (checkbox "I confirm", required)

```
[x] I confirm
```

Check first: we must hold the IP in what we submit. The office visuals are agent-office's (MIT, which allows this use with the licence notice); the demo audio and any music must be ours or cleared. This licence to Coinbase is irrevocable, so it also falls under the Nortal IP question below.

### 12. Privacy notice and marketing opt-in (checkbox, required)

The only option is the marketing-communications opt-in, and the form marks the question required, so it cannot be sent without ticking it.

```
[x] (required by the form to submit; this opts in to Coinbase marketing email)
```

[FOUNDERS: confirm you accept Coinbase marketing mail; unsubscribe afterwards if not wanted.] Send nothing sensitive in any field, as the form asks.

## Judging criteria

The post's three questions, answered with what is true today and what has to be true at nomination.

| The team's question | Today (2026-10-14) | At nomination |
| --- | --- | --- |
| Is the builder creating something unique and fun? | Yes: AI coding agents at desks in a walkable 3D office (agent-office, MIT, by webdevcody / AgentSystemLabs), and an onchain record of which agents' pull requests a person actually merged | Same |
| Is the builder bringing more users onchain? | No outside users. counts.json (2026-10-12): 0 merges by others on the board; one x402 payment settled on Base Sepolia on 2026-10-04, by us | At least one outside payer on Base mainnet, real counts from the board |
| Is the builder's contribution live and making an impact? | Testnet only: MergeAttestor and the EAS schema on Base Sepolia (chain id 84532), ERC-8004 feedback against the live 2.0.0 testnet registries, x402 on Base Sepolia | On Base mainnet, with explorer links |

## Demo video script

Needs a new public upload (YouTube unlisted or a native X post). The existing `launch/video` 60 s cut (`out/demo-60s-9x16.mp4`, rendered 2026-10-10) shows the Solana devnet payout, not Base, so record this one on Base mainnet:

Runtime target: 1:00 (limit: 1:00)

| Time | Shot | Caption or voiceover |
| --- | --- | --- |
| 0:00-0:08 | The office, agents at desks; card "Built on agent-office (MIT) by webdevcody / AgentSystemLabs" | "Kipdeck: the inbox for your AI coding agents." |
| 0:08-0:20 | Terminal: `x402-office price`, the 402 answer with the price in USDC on Base | "Hire an agent for one task. The office names its price over HTTP 402." |
| 0:20-0:30 | `x402-office pay`, settlement link on basescan.org, the task held on the queue, admin approves | "Pay USDC on Base, a person approves, an agent sits down." |
| 0:30-0:42 | The agent opens a pull request; a person merges it on GitHub | "It opens a pull request. A person merges it." |
| 0:42-0:54 | The EAS attestation on base.easscan.org, then the board row updating | "The merge is attested on Base. The board is rebuilt from chain alone." |
| 0:54-1:00 | Links: kipdeck.com, the repo | "Open source. Try it on Base." |

## To build before submitting

| Item | Where | Estimate |
| --- | --- | --- |
| Written mainnet decision (a new D-number) that reverses "testnets only" for Base, with the risk accepted | `launch/` decisions, `docs/x402.md` | 1 hour to write; the decision itself is yours |
| Outside review of MergeAttestor and of the office's attester key handling | `onchain/attest/contracts/`, `src/server/chain/` | 1 to 3 weeks of calendar time; cost unknown [FOUNDERS: reviewer and budget] |
| Add Base mainnet (`eip155:8453`, Circle USDC) to the x402 network table behind an explicit opt-in flag, and lift it out of the `MAINNET` refusal set only for that flag; mirror in the payer copy; tests for both paths. Today `src/server/x402/protocol.ts:53` refuses `eip155:8453` and `gateway.ts:203` filters mainnet offers out | `src/server/x402/protocol.ts`, `onchain/x402/src/networks.ts`, tests | 1 to 2 days, as a PR from `origin/main` |
| Same mainnet opt-in for attestations and reputation: deploy MergeAttestor and register the EAS schema on Base mainnet; point ERC-8004 feedback at mainnet registries [unverified: whether the 2.0.0 registries exist at Base mainnet addresses] | `onchain/attest/`, `onchain/reputation/`, deployments JSON | 1 to 2 days plus gas |
| Indexer and board reading Base mainnet | `onchain/indexer/`, `launch/chain/tools/counts.ts` | 0.5 to 1 day |
| Hosted office on HTTPS with x402 on, and a public board URL | `deploy/` | 1 day |
| At least one outside paid task on Base mainnet, settled, approved, PR opened; ideally merges by people other than us on the board | real users | 1 to 3 weeks of outreach after the above |
| X and Farcaster accounts for the project and a Base thread posted (how the team actually finds grantees) | `launch/chain/build-in-public.md`, `posts/` | 1 day |
| 60 s Base demo recorded on mainnet and uploaded publicly | `launch/video/` | 0.5 day |
| `README.md` and `docs/x402.md` updated in the same PR as the mainnet code (repo rule) | docs | included above |

Honest total: about 1 week of build plus 2 to 4 weeks for the review and the first outside users. 2026-11-02 is reachable only if the review starts this week.

## Submission checklist

- [ ] Nortal permission in writing (outside work, IP, grants and prizes).
- [ ] Mainnet decision recorded; outside review done and findings closed.
- [ ] Base mainnet x402, attestations and indexer merged to `main` via PR; `npm run typecheck`, `npm test`, `npm run build` green.
- [ ] At least one outside payer on Base mainnet; counts refreshed with `launch/chain/tools/counts.ts`, links on basescan.org and base.easscan.org.
- [ ] Project and builder X and Farcaster accounts live; Base thread posted (tag Base once).
- [ ] 60 s Base demo uploaded; link opens logged out.
- [ ] Project URL tested from a fresh browser and a fresh wallet.
- [ ] Field 9 under 150 words, every `{{...}}` replaced with real numbers, no testnet number presented as mainnet; `npx tsx launch/tools/lint.ts` clean.
- [ ] Field 8 answered with the first option (Yes, Base mainnet) only if true.
- [ ] Fields 11 and 12 read and accepted.
- [ ] Wallet and W-8BEN ready.
- [ ] Sent; date noted in `launch/deadlines.json`; no resend for a month.
