# Solana Foundation grant

Last checked: 2026-10-03. Source: the Solana Foundation grants page (link below). The application form was not opened, so its fields and limits are [unverified].

Ask: a milestone-based grant (or a convertible grant, if the Foundation prefers it for a project with a hosted product) to turn the Proof of Merge escrow into a public good: an audited, tool-agnostic Solana program and SDK that pays for code contributions, by people or AI agents, only when a person merges them. The office (a fork of agent-office, MIT, by webdevcody / AgentSystemLabs) is the first integration; the grant does not fund the office.

## Deadline

- **Rolling**, no deadline. Our target: apply on 2026-10-14, two days after the Colosseum cut-off (2026-10-12 23:59 PT, UTC-7), reusing its material and any feedback.
- The page says about one week for review and about three weeks until acceptance or rejection; approved projects then sign a grant agreement.

## Links

- Grants and funding: https://solana.org/grants-funding
- Application form: https://share.hsforms.com/1GE1hYdApQGaDiCgaiWMXHA5lohw
- Program on devnet: https://explorer.solana.com/address/JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6?cluster=devnet
- Code: {{FORK_URL}} (`onchain/solana/`)
- Upstream credit: https://github.com/AgentSystemLabs/agent-office

## Eligibility checklist

- [ ] A public good: "projects that generate public goods for the community". The program, SDK and CLI are MIT and work without the office.
- [ ] Built in the spirit of open-sourcing what we learn: public repo, docs, test vectors shared between Rust and TypeScript.
- [ ] A clear answer to "why Solana" (below).
- [ ] A budget with measurable milestones.
- [ ] Grant type chosen: milestone grant for the program and SDK; say plainly that a hosted office exists and is not funded by this grant.
- [ ] Employer permission for outside work and for receiving grant money, in writing.
- [ ] KYC and tax forms before payout [unverified].

## Pre-existing code disclosure

```field name="Prior work" max-chars=900
The escrow program, its SDK and CLI are ours, written from 2026-10-01 during the Colosseum Crypto World's Fair, and deployed on Solana devnet. The first product that uses them is our fork of agent-office, an MIT-licensed open source office for coding agents created by webdevcody / AgentSystemLabs (github.com/AgentSystemLabs/agent-office, first commit 2026-09-25); the office is their work, and this grant does not fund it. The grant funds the program, the SDK, an audit, a GitHub Action and docs, none of which depend on agent-office. Our commits are listed in launch/chain/disclosure.md. Diff: {{DIFF_URL}}
```

## Project description

```field name="Project summary" max-words=150
An open source Solana program and TypeScript SDK that pays for code contributions, by people or AI agents, only when a person merges them. A maintainer escrows USDC against a GitHub issue, from any front end or a Blink. Every funder has their own contribution record, so each can be refunded after expiry by anyone. A release needs two signatures: an attester that has checked a person with write access merged the pull request, and an approver that signs only after a human approves. Every step is an on-chain event, so anyone can count which contributors, and which agents, actually get merged. Native Rust on solana-program, no Anchor, with the rules in a dependency-free module that the program and the SDK test against one shared table of cases. Running on devnet today; the first integration is our mission-control fork of agent-office.
```

```field name="Only possible on Solana" max-words=120
Agent work comes in small pieces: fix a flaky test, bump a dependency. A 5 USDC bounty only works if funding it, refunding it and paying it out each cost a fraction of a cent and settle in seconds; elsewhere the fee is a real share of it. Solana Actions let a funder escrow from a link in an issue or a post, with nothing to install. Funds sit in program-owned vaults (the devnet upgrade authority is one key; M2 moves it to a multisig, then removes it), and devnet USDC behaves like mainnet USDC, so the path to production is an audit, not a rewrite. And the payout is where the contributor already is: a Solana wallet.
```

Budget (proposal, adjust before applying; amounts in USD):

| Milestone | Deliverable | Measurable outcome | Budget |
| --- | --- | --- | --- |
| M1, month 1 | Multiple attesters (m of n) and a GitHub App attester, so no single office key is the trust point; SDK and CLI 1.0; docs site | Program and SDK released with the shared test vectors; any repository can run the GitHub App attester; devnet bounties paid on 5 public repositories we don't own | {{BUDGET_M1}} |
| M2, month 2 | Independent security review of the program and fixes; mainnet deployment with the upgrade authority in a multisig | Audit report published; program verified on mainnet; a bug bounty open | {{BUDGET_M2}} |
| M3, month 3 | Integrations: a GitHub Action that funds and releases, the agent-office fork, and one other agent framework or bounty board | 3 integrations shipped; 50 bounties released on mainnet across 10 repositories; the public board rebuilt from chain data | {{BUDGET_M3}} |

## Judging criteria

The page names what reviewers look for; there is no scoring rubric.

| What reviewers check | Our answer |
| --- | --- |
| Public good | MIT program and SDK, usable without our product; the outcome data is CC0 |
| Open source spirit | Public repo, docs, Rust and TypeScript tested against one table of cases |
| Why Solana | Fees and finality make small bounties work; Actions make funding a link |
| Budget and milestones | Three milestones, each with a count anyone can check on chain |

## Demo video script

The form may not ask for a video [unverified]. Reuse the technical demo from [video-scripts.md](video-scripts.md), cut to the Solana part (fund, merge, approve, payout, refund).

## Submission checklist

- [ ] Colosseum submitted; the demo and program id ready.
- [ ] Budgets filled in with real numbers and a quote for the audit.
- [ ] Grant type chosen and explained.
- [ ] Employer permission saved.
- [ ] Form submitted; confirmation saved; follow up if no reply in three weeks.
