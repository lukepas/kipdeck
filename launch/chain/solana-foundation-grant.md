# Solana Foundation grant

Last checked: 2026-10-14. Source: the Solana Foundation grants page and the application form (links below). The form was opened and filled on 2026-10-14; its fields are listed under "Form answers".

Ask: a milestone-based grant (or a convertible grant, if the Foundation prefers it for a project with a hosted product) to turn the Proof of Merge escrow (the payout layer of Kipdeck) into a public good: an audited, tool-agnostic Solana program and SDK that pays for code contributions, by people or AI agents, only when a person merges them. Kipdeck, our inbox for AI coding agents built on agent-office (MIT, by webdevcody / AgentSystemLabs), is the first integration; the grant does not fund Kipdeck.

## Deadline

- **Rolling**, no deadline. Our target: apply on 2026-10-14, two days after the Colosseum cut-off (2026-10-12 23:59 PT, UTC-7), reusing its material and any feedback.
- The page says about one week for review and about three weeks until acceptance or rejection; approved projects then sign a grant agreement.

## Links

- Grants and funding: https://solana.org/grants-funding
- Application form: https://share.hsforms.com/1GE1hYdApQGaDiCgaiWMXHA5lohw
- Program on devnet: https://explorer.solana.com/address/JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6?cluster=devnet
- Code: https://github.com/lukepas/kipdeck (`onchain/solana/`)
- Upstream credit: https://github.com/AgentSystemLabs/agent-office

## Form answers

The form has nine fields, a reCAPTCHA and a Submit button. It has no project description field, and the note at the top asks for no links outside fields that ask for them, so the description goes into "Why You?". The form also links an application guidance document (a Google Doc, not read yet).

| Field | Answer |
| --- | --- |
| Company name | Kipdeck |
| Website URL | https://kipdeck.com |
| Country | Lithuania |
| First name, last name | Lukas Kveraga |
| Email address | hello@kipdeck.com |
| Funding category | Developer Tooling (options: AI, Consumer, DeFi, Developer Education & Ecosystem, Developer Tooling; DeFi is only for perps products) |

```field name="Solana On-Chain Accounts"
JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6 (escrow program, devnet), 3VFTNzfonYmnqXxuw4aADLc5GCHqNEa1wHzok4yvZFHk (merge attester, devnet), 55vgpiASBFv3r31ePiPSEGzMomdiRBtjPM1ay7Bx5ypN (approver, devnet)
```

```field name="Funding Amount"
USD 15,000, milestone-based: M1 USD 5,000 (m-of-n merge attesters, GitHub App attester, SDK and CLI 1.0, docs); M2 USD 7,500 (independent security review of the program, fixes, mainnet deploy with upgrade authority in a multisig); M3 USD 2,500 (GitHub Action 1.0 and two integrations, 50 bounties paid on mainnet across 10 repositories)
```

```field name="Why You?"
We are building Proof of Merge: an open source (MIT) Solana program and TypeScript SDK that pays for code contributions, by people or AI agents, only when a person merges them. A maintainer escrows USDC against a GitHub issue; release needs two signatures, an attester that checked a person with write access merged the pull request, and an approver that signs only after a human approves. Every funder can be refunded after expiry, and every step is an on-chain event, so anyone can count which contributors and which agents actually get merged.

Why us: we already shipped it. The program is native Rust on solana-program (no Anchor), deployed on devnet, with the rules in a dependency-free module that the Rust program and the SDK test against one shared table of cases. A first GitHub Action that attests merges and claims bounties has run end to end on devnet. We built all of it in under two weeks during the Colosseum Crypto World's Fair.

Our edge: we also build Kipdeck, an inbox where developers answer, review and merge the work of their AI coding agents. That is exactly where the merge-and-approve signal is created, so the payout layer sits on a real workflow instead of a standalone bounty board. Agent work comes in small pieces (fix a flaky test, bump a dependency), and only Solana's fees and finality make 5 USDC bounties practical. The grant funds the public program, SDK, security review and integrations, not Kipdeck itself.
```

By clicking Submit the applicant confirms they may act for the project and apply on their own initiative.

## Eligibility checklist

- [ ] A public good: "projects that generate public goods for the community". The program, SDK and CLI are MIT and work without the office.
- [ ] Built in the spirit of open-sourcing what we learn: public repo, docs, test vectors shared between Rust and TypeScript.
- [ ] A clear answer to "why Solana" (below).
- [ ] A budget with measurable milestones.
- [ ] Grant type chosen: milestone grant for the program and SDK; say plainly that a hosted office exists and is not funded by this grant.
- [ ] KYC and tax forms before payout [unverified].

## Pre-existing code disclosure

```field name="Prior work" max-chars=900
The escrow program, its SDK and CLI are ours, started on 2026-10-02 (commit ab7396f5) during the Colosseum Crypto World's Fair, and deployed on Solana devnet. The first product that uses them is Kipdeck, built on agent-office, an MIT-licensed open source office for coding agents created by webdevcody / AgentSystemLabs (github.com/AgentSystemLabs/agent-office, first commit 2026-09-25); the office is their work, and this grant does not fund it. The grant funds the program, the SDK, an audit, the GitHub Action (a first version that attests merges and claims bounties is built and ran once on devnet) and docs, none of which depend on agent-office. Our commits are listed in launch/chain/disclosure.md. Diff: https://github.com/lukepas/kipdeck/compare/226452e4...main
```

## Project description

```field name="Project summary" max-words=150
An open source Solana program and TypeScript SDK that pays for code contributions, by people or AI agents, only when a person merges them. A maintainer escrows USDC against a GitHub issue, from any front end or a Blink. Every funder has their own contribution record, so each can be refunded after expiry by anyone. A release needs two signatures: an attester that has checked a person with write access merged the pull request, and an approver that signs only after a human approves. Every step is an on-chain event, so anyone can count which contributors, and which agents, actually get merged. Native Rust on solana-program, no Anchor, with the rules in a dependency-free module that the program and the SDK test against one shared table of cases. Running on devnet today; the first integration is Kipdeck, our inbox for AI coding agents.
```

```field name="Only possible on Solana" max-words=120
Agent work comes in small pieces: fix a flaky test, bump a dependency. A 5 USDC bounty only works if funding it, refunding it and paying it out each cost a fraction of a cent and settle in seconds; elsewhere the fee is a real share of it. Solana Actions let a funder escrow from a link in an issue or a post, with nothing to install. Funds sit in program-owned vaults (the devnet upgrade authority is one key; M2 moves it to a multisig, then removes it), and devnet USDC behaves like mainnet USDC, so the path to production is an audit, not a rewrite. And the payout is where the contributor already is: a Solana wallet.
```

Budget (USD 15,000 in total, as entered on the form). It is a deliberately small ask for a first grant; M2 buys an independent review, not a full audit from a top firm, so get a quote before the agreement is signed:

| Milestone | Deliverable | Measurable outcome | Budget |
| --- | --- | --- | --- |
| M1, month 1 | Multiple attesters (m of n) and a GitHub App attester, so no single office key is the trust point; SDK and CLI 1.0; docs site | Program and SDK released with the shared test vectors; any repository can run the GitHub App attester; devnet bounties paid on 5 public repositories we don't own | USD 5,000 |
| M2, month 2 | Independent security review of the program and fixes; mainnet deployment with the upgrade authority in a multisig | Audit report published; program verified on mainnet; a bug bounty open | USD 7,500 |
| M3, month 3 | Integrations: the GitHub Action at 1.0, funding as well as claiming, Kipdeck, and one other agent framework or bounty board | 3 integrations shipped; 50 bounties released on mainnet across 10 repositories; the public board rebuilt from chain data | USD 2,500 |

## Judging criteria

The page names what reviewers look for; there is no scoring rubric.

| What reviewers check | Our answer |
| --- | --- |
| Public good | MIT program and SDK, usable without our product; the outcome data is CC0 |
| Open source spirit | Public repo, docs, Rust and TypeScript tested against one table of cases |
| Why Solana | Fees and finality make small bounties work; Actions make funding a link |
| Budget and milestones | Three milestones, each with a count anyone can check on chain |

## Demo video script

The form may not ask for a video [unverified]. Reuse the technical demo from [launch/video/](../video/README.md), cut to the Solana part (fund, merge, approve, payout, refund).

## Submission checklist

- [ ] Colosseum submitted; the demo and program id ready.
- [x] Budgets filled in (USD 15,000 total); get a quote for the M2 review before signing.
- [ ] Grant type chosen and explained.
- [ ] Form submitted; confirmation saved; follow up if no reply in three weeks.
