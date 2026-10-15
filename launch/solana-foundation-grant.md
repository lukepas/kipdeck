# Solana Foundation grant

**Superseded: do not apply from this page.** The current Kipdeck version of this kit is [chain/solana-foundation-grant.md](chain/solana-foundation-grant.md); the escrow program and SDK this page calls unbuilt have since been built and deployed on devnet. This page is the plan as it stood on 2026-10-01 and is kept as history.

Last checked: 2026-10-01. Source: the Solana Foundation grants page (link below). The application form itself was not opened, so its exact fields and limits are [unverified].

Plan: apply for a milestone-based grant (or a convertible grant, since there is a commercial side) to turn the bounty escrow from the Colosseum entry into a public good: an open source, tool-agnostic escrow program and SDK for paying AI agents and contributors per merged pull request.

Code status on 2026-10-01: `launch/solana-escrow` has no commits. There is no escrow program, SDK or devnet deployment yet, and the grant page asks for a clear plan, so do not apply before the Colosseum build exists. Move the 2026-10-14 target if it slips.

## Deadline

- **Rolling**: no deadline. Internal target: submit on **2026-10-14**, two days after the Colosseum submission, reusing its material and whatever feedback arrives.
- The page says review takes about one week and a final decision and contact come within three weeks. A grant agreement after that is expected [unverified].

## Links

- Grants and funding: https://solana.org/grants-funding
- Application form: https://share.hsforms.com/1GE1hYdApQGaDiCgaiWMXHA5lohw
- Smaller asks: the same page mentions Superteam's "quick microgrants ($10k) to early-stage Solana builders in emerging markets like India, Southeast Asia, Eastern Europe, and Africa" [unverified: whether a Superteam chapter covers Lithuania].

## Eligibility checklist

- [ ] Open to individuals, teams, companies, nonprofits, universities and governments.
- [ ] A public good: "a significant open-source contribution to the Solana ecosystem" or "a meaningful free community offering". The escrow program and SDK are MIT and usable without Agent Office.
- [ ] A clear answer to "why Solana and not elsewhere".
- [ ] A well-structured budget with clear, measurable milestones, and an amount that matches the impact on the community.
- [ ] Grant type: a milestone-based **grant** for a public good; a **convertible grant** for a public good with a commercial component (the hosted office and payout fee). The Foundation also issues RFPs for its own priorities. Pick convertible and say so plainly if the business plan stays in the pitch.
- [ ] KYC and tax forms are expected before payout [unverified].
- [ ] Something working to show: the Colosseum demo, deployed on devnet (not built on 2026-10-01).

## Pre-existing code disclosure

```field name="Prior work" max-chars=900
The escrow program and SDK are new work by us, started during the Colosseum Crypto World's Fair (October 2026). The first product that uses them is our fork of Agent Office, an MIT-licensed open source 3D office for coding agents created by webdevcody / AgentSystemLabs; the office itself is their work, and the grant does not fund it. The grant funds only the escrow program, its SDK, audits and documentation, which do not depend on Agent Office. Upstream: github.com/AgentSystemLabs/agent-office. Our work so far: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
```

## Project description

The form's fields are not published [unverified]. These drafts cover what the page says reviewers want: public good, open source, why Solana, budget and milestones.

```field name="Project summary" max-words=150
An open source Solana program and TypeScript SDK for paying for code contributions, by humans or AI agents, when a pull request is merged. A maintainer escrows a bounty against a GitHub issue; a merge attestation releases it to the contributor's wallet; an expiry returns it. Any tool can use it: GitHub Actions, agent frameworks, bounty boards. Our first integration is a fork of Agent Office, an open source 3D office where coding agents work at desks.
```

```field name="Why Solana" max-words=120
Small bounties only work if paying them costs almost nothing and settles in seconds. Solana's fees and finality make a $5 bounty practical, programs can hold funds without a custodian, and stablecoins on Solana (USDC, CASH) let maintainers price bounties in dollars. The Solana developer community is also the first audience: its open source repos are where we will pilot it.
```

| Milestone | Deliverable | Measurable outcome | Budget |
| --- | --- | --- | --- |
| M1 (month 1) | Escrow program with fund, release, refund; SDK; devnet | 100% instruction test coverage, public docs | {{BUDGET_M1}} |
| M2 (month 2) | Security review and fixes; mainnet deploy; GitHub Action | Audit report published; program on mainnet | {{BUDGET_M2}} |
| M3 (month 3) | Integrations: Agent Office fork, one more agent framework, a bounty board | 3 integrations, 20 bounties paid on mainnet across 5 repos | {{BUDGET_M3}} |

## Judging criteria

The Foundation reviews against four things; there is no scoring rubric published.

| What reviewers check | Our answer |
| --- | --- |
| Public good | MIT program and SDK, useful without our product |
| Open source spirit | Public repo from day one, docs, examples, the program ID published |
| Solana-specific | Fees and finality make micro-bounties work; stablecoin payouts |
| Clear budget and milestones | Three milestones with measurable outcomes and a published audit |

## Demo video script

The form may not ask for a video [unverified]. Record one anyway and link it in the application: reviewers skim.

Runtime target: 1:30 (limit: under 3:00)

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:15 | An issue with a bounty label | "This issue has a bounty held by a Solana program." |
| 0:15-0:45 | Fund, then merge a PR, then the payout on the explorer | "Fund it, merge the fix, and the program pays the contributor. No custodian." |
| 0:45-1:10 | The SDK in a ten-line script; the GitHub Action | "Any tool can use it. Here it is in ten lines, and as a GitHub Action." |
| 1:10-1:30 | Milestones card | "The grant takes it to an audited mainnet program with three integrations." |

## Submission checklist

- [ ] Colosseum demo working on devnet; program ID and repo link ready.
- [ ] Grant type chosen (grant or convertible) and explained.
- [ ] Milestone budgets filled in with real numbers.
- [ ] All `{{...}}` placeholders filled; `npx tsx launch/tools/lint.ts` clean.
- [ ] Form submitted; confirmation saved; follow up if no reply in two weeks.
