# Stellar Community Fund SCF #46, Build Award (Integration track)

Last checked: 2026-10-14. Sources: the awards page, the SCF Handbook (Build Award, Integration Track, Integration List, Budget and Deliverable Guidelines, Submission Criteria, Official Rules), one public awarded submission, and the Trustless Work docs. The interest form and the Build form both sit behind a login on the SCF Dashboard, so their exact fields and character limits are [unverified]; the field list below comes from the handbook's stated requirements and the section headings of a public awarded submission.

Kipdeck is built on agent-office (MIT, by webdevcody / AgentSystemLabs, https://github.com/AgentSystemLabs/agent-office). Upstream has not endorsed this fork.

## Deadline

- Build submission deadline: 2026-11-08 (the page's round data has `awardSubmission.close: 2026-11-08`; no time or zone is shown anywhere).
- Vilnius time: unknown. Earliest plausible reading is 2026-11-08 00:00 UTC = 2026-11-08 02:00 Vilnius (EET, UTC+2; DST ends 2026-10-25). If it means 23:59 UTC it is 2026-11-09 01:59 Vilnius; 23:59 PT is 2026-11-09 09:59 Vilnius. Our target: Build form in by 2026-11-07 18:00 Vilnius.
- The interest form comes first. It is "always open, and forms are reviewed on a rolling basis"; the page's timeline puts about 2 weeks between the interest form and the Build submission, and the invite email carries the round deadline. File the interest form by 2026-10-16.
- After the deadline: panel review 2026-11-11 to 2026-11-18 (from the page's round data). The community vote (2026-11-23 to 2026-12-03) is for the Open track only. If not invited in time for #46, the same proposal goes to the next round (rounds run every 6 weeks).

## Links

- Awards page (SCF #46 card, tracks, tranches): https://communityfund.stellar.org/awards
- Form (interest form, then the Build form after an invitation; login needed): https://communityfund.stellar.org/dashboard (the site's home is https://communityfund.stellar.org/)
- Build Award rules: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award
- Integration Track rules: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track
- Integration List (we pick Trustless Work and Stellar Wallets Kit from it): https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track/integration-list
- Budget and Deliverable Guidelines: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines
- Submission Criteria: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/submission-criteria
- Official Rules: https://stellar.gitbook.io/scf-handbook/scf-awards/official-rules-for-submissions
- KYC form (only if awarded): https://stellar.org/bd-kyc
- Trustless Work docs: https://docs.trustlesswork.com/ (testnet Swagger https://dev.api.trustlesswork.com/docs, mainnet Swagger https://api.trustlesswork.com/docs)
- Stellar Wallets Kit: https://stellarwalletskit.dev/
- Public example of the submission layout (Trustless Work, SCF #41, USD 80,000): https://communityfund.stellar.org/submissions/rectq5U666PxPloNn
- Our links: repo https://github.com/zbagdzevicius/kipdeck, site https://kipdeck.com, replay demo https://kipdeck-demo.vercel.app, showcase https://zbagdzevicius.github.io/kipdeck/, upstream https://github.com/AgentSystemLabs/agent-office

## Fit

Honest verdict: weak to medium. Enter only if you commit to about 4 months of Stellar work.

For it:
- The Integration track requires "at least one building block" from the Integration List. Trustless Work (escrow-as-a-service on Soroban, roles for service provider, approver, release signer, dispute resolver and platform, USDC on Stellar, testnet and mainnet APIs) is on the list and maps one to one onto Proof of Merge's two-signature payout. Stellar Wallets Kit (also on the list) covers the admin's browser signature.
- The office already talks to escrow through one interface (`Escrow` in `src/server/chain/sdk.ts`) with a Solana and an in-memory mock implementation, so a Stellar implementation plugs in behind it instead of a rewrite.
- The handbook says to reuse ecosystem tools rather than build from scratch. So this proposal does NOT port our Solana program to Soroban (that would be the Open track's "net new protocol"); it integrates Trustless Work. This replaces the "port to Soroban with shared test vectors" idea from the shortlist.
- USD 30,000 sits in the handbook's "Small" band for one simple integration (USD 25,000 to 50,000). Trustless Work itself won USD 80,000 (SCF #41); Boundless, a milestone-funding platform built on Trustless Work, was reported at USD 110,000 (SCF #40, search result, not opened).

Against it:
- "Who this track is not for: teams building net-new applications without existing traction" (sent to Instawards instead). Kipdeck's repo was created 2026-10-06 and has 0 stars and 0 forks today; there are no users to report. Upstream agent-office has 737 stars and 202 forks, but that is webdevcody's traction, not ours, and must be labelled as such.
- "Developers creating tools or libraries intended for other devs" are pointed at the RFP track. Kipdeck is a developer tool. Before filing, check the active RFPs; if one fits escrow or payouts, switch tracks.
- No Stellar code exists in the repo today (the only Stellar mention is a brand-policy note in `docs/design.md`).
- Tranche 3 releases only when a panel-ratified onchain metric is met on mainnet, measured over a window, and self-generated activity can be disregarded. That needs real maintainers funding bounties.
- Official Rules 1.2: a Team or Organization must appoint at least 2 eligible individuals for webinars and bootcamp. Founder-led with team undecided (D9) is a gap.

Fallback: if the interest form is declined for traction, ask the SCF team about Instawards through a local Stellar Ambassador Chapter.

## Ask

USD 30,000 in XLM (a fifth of the USD 150,000 cap), 4 months, 3 tranches.

SCF pays 4 fixed shares of the total: 10% on acceptance, 20% at Tranche 1, 30% at Tranche 2, 40% at Tranche 3 (Budget and Deliverable Guidelines). So the deliverable budgets are sized to the payouts:

| Payment | Share | Amount | Released when |
| --- | --- | --- | --- |
| #0 | 10% | USD 3,000 | Award accepted |
| #1 MVP | 20% | USD 6,000 | Tranche 1 deliverables verified |
| #2 Testnet | 30% | USD 9,000 | Tranche 2 deliverables verified |
| #3 Mainnet | 40% | USD 12,000 | Panel-ratified onchain metric met |

Deliverable budgets: Tranche 1 USD 9,000 (covers #0 and #1), Tranche 2 USD 9,000, Tranche 3 USD 12,000. Rate used: USD 60 an hour [FOUNDERS: confirm rate]: about 467 engineering hours (USD 28,000) plus a USD 2,000 user-testing line. No audit, legal, marketing or bounty money is in the budget (all excluded by the guidelines); Kipdeck's own features are not funded.

One-line justification: USD 30,000 is inside the handbook's "Small: one simple integration, USD 25,000 to 50,000" band for the Integration track, well under the USD 80,000 Trustless Work received in SCF #41, and every line is Stellar integration work with a check a reviewer can run.

## Eligibility checklist and blockers

Every box here must be ticked before submitting. The first one is open in every kit.

- [ ] Employer (Nortal): written permission for outside work, IP ownership of the code and receiving award money. Unticked in every kit; the Official Rules make the participant responsible for compliance, and KYC/tax forms follow an award.
- [ ] Team: Official Rules 1.1 and 1.2 open SCF programs to Teams and Organizations and ask for at least 2 eligible individuals for webinars and bootcamp. Decision D9 (co-founders) is open. [FOUNDERS: team]
- [ ] Company registration: not required to apply (Teams of individuals are eligible), and entity costs cannot be budgeted. Decide whether to apply as an individual team or a registered company; KYB applies to a company.
- [ ] Personal fields: KYC at stellar.org/bd-kyc after an award (identity, tax). Fill only from real documents; nothing invented here.
- [ ] Traction: 0 stars, no users. Without maintainers lined up, the interest form may be routed to Instawards.
- [ ] Commitment: about 467 hours over 4 months next to a day job, each tranche due within 90 days of the last payment or the rest is forfeited.

## Pre-existing code disclosure

The "Products and services" and "Traction evidence" answers (under Project description) both credit upstream and keep its traction apart from ours.

```field name="Disclosure paragraph" max-chars=600
Kipdeck is built on agent-office by webdevcody / AgentSystemLabs (MIT, https://github.com/AgentSystemLabs/agent-office). The Proof of Merge layer (Solana devnet escrow, SDK, GitHub Action, Base Sepolia attestations, indexer) is ours and exists today. No Stellar code exists yet; everything Stellar in this proposal is the funded work.
```

## Project description: form answers

Field names and limits are [unverified] until the dashboard is opened. Keep each answer self-contained: "No external materials are considered."

### Interest form (file this week)

```field name="Project name"
Kipdeck
```

```field name="Applicant / representative"
Zygimantas Bagdzevicius, CEO/CTO (founder-led) [FOUNDERS: team]
```

```field name="Email"
hello@kipdeck.com
```

```field name="Country"
Lithuania
```

```field name="Website"
https://kipdeck.com
```

```field name="GitHub"
https://github.com/zbagdzevicius/kipdeck
```

```field name="Build Award track"
Integration Track
```

```field name="Integrations (from the SCF Integration List)"
Trustless Work (escrow), Stellar Wallets Kit (wallet connection)
```

```field name="What are you building (short)"
Kipdeck is an open source inbox for AI coding agents (built on agent-office, MIT, by webdevcody / AgentSystemLabs). Its Proof of Merge layer pays for code contributions, by people or agents, only when a person with write access merges the pull request and an admin approves the payout. It runs today on Solana devnet with its own escrow. We want to add Stellar: USDC bounties on GitHub issues held in Trustless Work escrows, with the merge check as the approval step and the admin signing through Stellar Wallets Kit, live on mainnet.
```

```field name="SCF referrer code"
[FOUNDERS: referrer code if anyone in the Stellar community will refer us; otherwise leave empty]
```

### Build form: products and services

```field name="Project name"
Kipdeck: merge-gated USDC bounties on Stellar
```

```field name="Category"
Developer tools / payments [pick the closest option in the dropdown]
```

```field name="One-line description"
USDC bounties on GitHub issues, held in Trustless Work escrows on Stellar and paid to the contributor, a person or an AI agent, only after a person with write access merges the fix.
```

```field name="Products and services"
Kipdeck is an open source (MIT) inbox for AI coding agents: one place where a person sees what each agent is doing, answers its questions and approves its work. It is built on agent-office by webdevcody / AgentSystemLabs (MIT), credited everywhere.

Proof of Merge is Kipdeck's payout layer. A maintainer escrows money against a GitHub issue. Any contributor, including an AI agent run by an operator, can take it. Money moves only when GitHub reports that a person (not a bot) with write, maintain or admin permission merged a pull request from the repository itself (not a fork) that closes the issue, and an admin approves the payout in Kipdeck's review inbox. Today this runs on Solana devnet with our own program (JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6) and a GitHub Action, and every merge can also be attested on Base Sepolia.

This award adds Stellar as a production rail. Instead of porting our program, we use Trustless Work, the escrow building block on Stellar:
- Bounty = a Trustless Work single-release escrow in USDC, one per issue.
- Service provider (milestone marker) = the repository's attester key, which marks the milestone "merged" with the PR URL and merge commit as evidence, only after the merge checks pass.
- Approver = the admin's own wallet, signing in the browser through Stellar Wallets Kit when they press Approve payout.
- Release signer = the attester, which checks GitHub once more and releases.
- Receiver = the contributor's Stellar address, read from the repo's wallet file at the PR's base commit (a PR cannot add its own author).
- Dispute resolver = the maintainer who funded the bounty, so an expired or contested bounty goes back to them.
- Platform fee = 0. Kipdeck takes nothing from bounties; Trustless Work's 0.3% protocol fee applies.

The same flow ships as a GitHub Action, so a maintainer can use Stellar bounties without running Kipdeck.
```

```field name="Why Stellar / use of Stellar"
Agent work comes in small pieces: fix a flaky test, bump a dependency. A 5 to 20 USDC bounty only works if funding and paying it costs a fraction of a cent and settles in seconds, and if the contributor can turn USDC into local money. Stellar gives both: low fees and fast finality, plus anchors and ramps where contributors already are. Trustless Work gives us in-production escrow roles that match our model exactly, so we spend the award on integration, not on a new contract. Stellar is the money path here, not storage: every bounty is a Soroban escrow, every payout is a USDC transfer on Stellar.
```

```field name="Technical architecture"
Components (existing ones marked as such):

1. Kipdeck server (existing, TypeScript/Node). Reads GitHub, runs the merge checks (fork, merged with a merge commit, merged by a User not a Bot, merger has write+), keeps a persistent outbox with backoff for chain writes, and talks to escrow through one `Escrow` interface (src/server/chain/sdk.ts) that today has a Solana and an in-memory implementation.
2. New: `StellarEscrow`, a third implementation of that interface. It calls the Trustless Work REST API (deploy single-release escrow, fund, change milestone status, approve milestone, release, dispute), signs the returned unsigned transactions with the attester key or hands them to the browser for the approver, and submits them. A chain guard refuses any network passphrase except the configured one (testnet by default; mainnet only with an explicit flag).
3. New: approver signing in the review inbox through Stellar Wallets Kit (Freighter and the other kit wallets), so the admin's key never touches the server.
4. New: Stellar mode for the GitHub Action (existing for Solana), so a repository can attest merges and mark milestones without Kipdeck.
5. New: indexer support (the indexer exists for Base and Solana) that reads our registered escrows' events and rebuilds the public board: bounties funded, released, refunded, per repository and per contributor.
6. Monitoring: alerts on failed submissions, stuck escrows near expiry and balance of the attester's fee account.

Flow: maintainer funds an escrow from Kipdeck or the Action -> contributor or agent opens a PR that closes the issue -> person merges -> attester verifies on GitHub and marks the milestone with the PR URL and merge sha -> admin approves in Kipdeck, signing with Stellar Wallets Kit -> attester re-checks GitHub and releases USDC to the receiver. Expiry or a contested merge -> dispute resolver returns the funds.

Known difference from the Solana program: per-funder refunds. Version 1 on Stellar is one funder per bounty; multi-funder pooling stays a later item.
```

```field name="Open source plan"
Everything is MIT in the public repo github.com/zbagdzevicius/kipdeck from the first commit: the StellarEscrow adapter, the Action's Stellar mode, the indexer changes, test fixtures and docs. We write no new smart contract; the escrow contracts are Trustless Work's.
```

### Build form: requested budget

```field name="Requested budget (USD)"
30000
```

```field name="Budget justification"
About 467 engineering hours at USD 60 an hour (USD 28,000) over 4 months, solo builder [FOUNDERS: team]. The handbook's Integration track table puts one simple integration at USD 25,000 to 50,000; we sit near the bottom because the merge checks, outbox, review inbox, Action and indexer already exist and only the Stellar parts are funded. No audit (we write no contract), marketing, legal, bounties or past work is included. A user-testing line of USD 2,000 (6.7% of the total, under the 1/3 cap) covers onboarding sessions with maintainers, not rewards.
```

### Build form: traction evidence

```field name="Traction evidence"
Honest state on 2026-10-14:
- Public MIT repo github.com/zbagdzevicius/kipdeck, created 2026-10-06, 0 stars, 0 forks so far.
- Working Solana devnet escrow program JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6 with a recorded end-to-end bounty run (open, fund, claim, release) in onchain/solana/deployments/devnet.json.
- A GitHub Action that checks merges and claims bounties, a Base Sepolia attestation schema (UID 0x368e9023c13393aea075e78cae18e804725b0d1bb3e2b1a6c1117d759a01a900), an indexer that rebuilds the board from chain data, and a replay demo at kipdeck-demo.vercel.app.
- Built on agent-office (webdevcody / AgentSystemLabs), which has 737 stars and 202 forks on GitHub; that is the upstream project's traction, not Kipdeck's.
- Submitted to the Colosseum Crypto World's Fair (2026-10-12).
[FOUNDERS: add any real users, design partners or maintainers who agreed to fund a bounty; leave nothing invented]
```

### Build form: tranche 1, MVP (USD 9,000, about 6 weeks)

```field name="Tranche 1 deliverables"
1.1 StellarEscrow adapter: the office's Escrow interface on the Trustless Work testnet API (deploy, fund, mark milestone, approve, release, dispute), with the network passphrase guard. Check: Unit tests against recorded API responses plus a CLI script that runs one bounty end to end on testnet; the transaction hashes are listed in deployments/stellar-testnet.json. Budget: USD 4,800 (80 h).
1.2 Role mapping and merge evidence: the attester marks the milestone with the PR URL and merge sha only after the existing GitHub checks pass; bots, forks and non-writers are refused. Check: Tests for each refusal case; a testnet escrow whose milestone evidence names a real merged PR. Budget: USD 2,400 (40 h).
1.3 Approver signing with Stellar Wallets Kit in the review inbox (Freighter at minimum). Check: Screen recording of an admin approving on testnet; the approval transaction hash. Budget: USD 1,800 (30 h).
```

### Build form: tranche 2, testnet (USD 9,000, about 5 weeks)

```field name="Tranche 2 deliverables"
2.1 GitHub Action Stellar mode: a maintainer adds one workflow file and gets merge-gated testnet USDC bounties without running Kipdeck. Check: Example workflow in onchain/action/examples; a public run log on a demo repository. Budget: USD 3,000 (50 h).
2.2 Testnet payouts on 5 public repositories, at least 3 not owned by us, 10 or more bounties released. Check: List of repositories, PRs and transaction hashes in the repo; the indexer's board shows them. Budget: USD 2,400 (40 h).
2.3 Indexer: rebuilds funded, released and refunded bounties per repository and contributor from Stellar data alone. Check: Script output compared with the transaction list from 2.2. Budget: USD 1,800 (30 h).
2.4 Threat model (STRIDE) and onchain monitoring plan, as SCF requires at Tranche 2, plus alerts for failed submissions and escrows near expiry. Check: Both documents in docs/; an alert firing in a recorded test. Budget: USD 1,800 (30 h).
```

### Build form: tranche 3, mainnet (USD 12,000, about 6 weeks)

```field name="Tranche 3 deliverables"
3.1 Mainnet switch: Trustless Work mainnet API, mainnet USDC, an explicit --mainnet flag, the attester and release keys moved to a Stellar multisig account (2 of 3). Check: Account signers and thresholds visible on a Stellar explorer; docs for maintainers. Budget: USD 4,200 (70 h).
3.2 Kipdeck and Action released with Stellar mainnet support; public board live. Check: Release tag; board URL. Budget: USD 3,600 (60 h).
3.3 Maintainer onboarding and user testing: sessions with maintainers who fund their first bounty, findings written up and fixed. Check: Session notes and the issues they produced (separate user-testing line, logistics only, no rewards). Budget: USD 2,000.
3.4 Fixes from mainnet use and the threat model review. Check: Closed issues linked to the findings. Budget: USD 2,200 (about 37 h).
```

```field name="Final tranche onchain metric (Integration track)"
Metric type: cumulative USDC released to contributors through our registered Trustless Work escrows on Stellar mainnet.
Threshold: USD 500 released across at least 25 merged-PR payouts, funded by at least 5 distinct maintainers on at least 5 public repositories that we do not own.
Measurement window: 60 days from the mainnet release in 3.2.
Onchain footprint registered at award time: the attester and release-signer multisig account, the platform address of every escrow we deploy (fee 0), and the escrow contract IDs listed in deployments/stellar-mainnet.json as they are created. Bounties funded by our own accounts are excluded from the count.
```

### Build form: team

```field name="Team"
Zygimantas Bagdzevicius, CEO/CTO, Vilnius, Lithuania. Wrote Kipdeck's Proof of Merge layer: the native Rust Solana escrow program and its TypeScript SDK, the GitHub Action, the EAS attestation package on Base Sepolia, the ERC-8004-style reputation contracts, the indexer and the x402 paid tasks on Base Sepolia. GitHub: https://github.com/zbagdzevicius. No prior Soroban or Stellar production work; this award is built on Trustless Work's SDK and API so the contract risk stays with a building block already in production.
[FOUNDERS: team - second eligible person for webinars and bootcamp (Official Rules 1.2), LinkedIn URLs, relevant experience; do not invent employment history or education]
```

### Build form: project stats and links

```field name="Website"
https://kipdeck.com
```

```field name="GitHub"
https://github.com/zbagdzevicius/kipdeck
```

```field name="Demo / video"
https://kipdeck-demo.vercel.app (replay demo). [To build: a 2-minute Stellar testnet video after 1.1 to 1.3, if the form asks for one before the deadline]
```

```field name="Other links"
Showcase https://zbagdzevicius.github.io/kipdeck/ ; Solana devnet program https://explorer.solana.com/address/JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6?cluster=devnet ; upstream https://github.com/AgentSystemLabs/agent-office
```

### Build form: additional project information

```field name="Additional project information"
Revenue: bounties carry no Kipdeck fee. Kipdeck's planned paid Team tier (USD 20 a seat a month) is for the hosted office, not for payouts, and is not funded by this award.

Competition: Gitcoin and Algora pay bounties, but releasing the money is the payer's call. Our difference is the release rule: money moves only after GitHub reports a person with write access merged a non-fork PR that closes the issue, plus a second, human approval. That matters as AI agents open more PRs than maintainers can review.

Risks: (1) maintainers may not fund bounties: we start with maintainers we talk to directly and keep the metric modest; (2) Trustless Work API or contract changes: we pin versions and keep the adapter thin; (3) key compromise of the attester: release needs the human approver, and mainnet keys sit in a multisig.

Other funding: a Solana Foundation grant application covers the Solana program only; there is no overlap with this Stellar work, and no other SDF funding.

Disclaimer we will use on any "built on Stellar" mention: the SCF-required text, with Kipdeck as the product.
```

## Judging criteria

From the handbook pages the drafter read (Build Award, Integration Track, Budget and Deliverable Guidelines, Submission Criteria). The panel scores against the Submission Criteria page; read it again before filing.

| What the panel checks | Our answer |
| --- | --- |
| Uses at least one building block from the Integration List | Trustless Work (escrow) and Stellar Wallets Kit (approver signing) |
| Traction (the track is not for net-new apps without it) | Weak: 0 stars, no users. Upstream's traction is labelled as upstream's. Line up maintainers before filing |
| Budget in the right band, every line Stellar work with a check | USD 30,000, inside "Small: USD 25,000 to 50,000"; each deliverable has hours and a reviewer check |
| Architecture complete at application | Components, roles and flow in "Technical architecture"; one manual Trustless Work testnet escrow run before filing |
| Final tranche onchain metric | USD 500 across 25 or more merged-PR payouts on mainnet, 5 or more outside maintainers, 60-day window |

## Demo video script

The form may have a video field [unverified]. Before Tranche 1 the only honest video is the existing Solana flow, labelled as Solana; after deliverables 1.1 to 1.3, re-record it on Stellar testnet with the same shots.

Runtime target: 2:00 (limit: under 3:00)

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:20 | Kipdeck inbox, an agent's PR waiting in To review | "Kipdeck is an inbox for AI coding agents. Proof of Merge pays for their work only after a person merges it." |
| 0:20-0:45 | A bounty funded on a GitHub issue (today: Solana devnet, labelled) | "A maintainer escrows USDC against an issue." |
| 0:45-1:10 | The PR merged on GitHub by a person; the merge checks in the log | "A person with write access merges a non-fork PR that closes the issue. Bots and forks are refused." |
| 1:10-1:35 | The admin approves in the review inbox; the release transaction on an explorer | "An admin approves, and the escrow releases to the contributor." |
| 1:35-2:00 | Card: the Stellar plan, Trustless Work escrow and Stellar Wallets Kit; credit to agent-office | "With this award the same flow runs on Stellar, through Trustless Work. Open source, MIT." |

## To build before submitting

Nothing has to be coded before the Build form; the handbook says architecture must be complete at application and Tranche 1 must be real development. What has to be done:

| Item | Why | Estimate |
| --- | --- | --- |
| Read Trustless Work's API, request a testnet API key, run one single-release escrow by hand on testnet (no code merged) | "Ready to build" and the architecture claims above must hold | 4 to 6 h |
| Confirm Trustless Work allows anyone to fund an escrow, the evidence field size for the PR URL, and expiry or dispute behaviour | The role mapping depends on it | 1 to 2 h, plus a question in their Discord |
| Check the active SCF RFPs | Kipdeck is a dev tool; RFP may fit better | 30 min |
| Line up 3 to 5 maintainers who would fund a testnet bounty, ideally one with Stellar ties for a referrer code | Traction is the weakest criterion | ongoing, start now |
| Optional: 2-minute video of the existing Solana flow, labelled as Solana | The form may have a video field | 2 h |

Not in this repo and not to be claimed until built: any Stellar code, testnet runs, or mainnet deployment.

## Submission checklist

- [ ] Nortal permission in writing, saved.
- [ ] Decide D9 enough to name a second eligible person, or ask the SCF team whether a solo representative is accepted.
- [ ] Check active RFPs; confirm Integration track.
- [ ] Sign in at communityfund.stellar.org/dashboard; file the interest form by 2026-10-16 with the answers above; note every field name and limit it shows and fix this file.
- [ ] Ask for a referrer code from anyone in the Stellar community you have spoken to.
- [ ] Testnet API key from Trustless Work; one manual escrow run; confirm the role mapping.
- [ ] Wait for the invite email (about 2 weeks); it carries the exact deadline. Convert it to Vilnius time.
- [ ] Paste the Build answers; trim to the form's limits; keep every deliverable with a budget and a check.
- [ ] Confirm the rate and hours; totals must equal USD 30,000.
- [ ] Re-run the repo facts (stars, devnet ids, file paths) the day you submit.
- [ ] Submit by 2026-11-07 18:00 Vilnius; save the confirmation.
- [ ] Watch for prescreen edits during panel review (2026-11-11 to 2026-11-18) and answer within a day.
