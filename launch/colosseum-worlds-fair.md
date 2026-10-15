# Colosseum Crypto World's Fair

**Superseded: do not submit from this page.** Submit from [chain/SUBMIT.md](chain/SUBMIT.md). The entry is Kipdeck, with Proof of Merge as its payout layer, and its kit is [chain/colosseum-worlds-fair.md](chain/colosseum-worlds-fair.md), with the disclosure in [chain/disclosure.md](chain/disclosure.md). This page is the plan as it stood on 2026-10-01 and is kept as history: the product name below is an old working name, the escrow has since been built and deployed on devnet, and the program uses solana-program, not Anchor.

Last checked: 2026-10-01. Sources: the event page, the official rules PDF and the Colosseum hackathon FAQ (links below). Anything not stated there is marked [unverified].

Plan: enter the Solana track with bounty escrow for agent work (branch `launch/solana-escrow`): a maintainer funds an escrow for a GitHub issue, a worker in Agent Office solves it, and the escrow pays out when the pull request merges. The x402 pay-per-task work on Base (branch `launch/x402-base`) is the second chain story (the rules list a Base track: $25,000 across 5 projects; Solana: $100,000 across 10). Whether one project can be judged in two tracks is [unverified], so lead with Solana.

Code status on 2026-10-01: `launch/solana-escrow` has no commits, so nothing on Solana exists yet. `launch/x402-base` works: paid tasks over x402 with USDC on Base Sepolia by default and Base mainnet by flag, held for admin approval. With eleven days left, either build the escrow by 2026-10-09 or switch the lead to the Base track, where the code already runs. Every field below that describes the escrow describes the plan.

## Deadline

- Contest period: 2026-09-14 06:00 PT to **Monday 2026-10-12, 23:59 PT (PDT, UTC-7)**. That is 2026-10-13 06:59 UTC and 09:59 in Vilnius.
- Every team member must register on colosseum.com **before the same cut-off**; after it the registration form is disabled.
- The team leader uploads the submission before the cut-off.
- Winners announced by 2026-12-05.
- Internal target: build frozen and both videos recorded 2026-10-09, submitted 2026-10-11.

## Links

- Event page: https://colosseum.com/worldsfair
- Register: https://colosseum.com/arena/hackathon/register?entry=worldsfair
- Official rules (PDF): https://colosseum.com/legal/Crypto%20World's%20Fair%20Hackathon%20Rules.pdf
- Hackathon FAQ: https://colosseum.com/hackathon
- Submission advice: https://blog.colosseum.com/perfecting-your-hackathon-submission/

## Eligibility checklist

- [ ] 18 or older and of the age of majority, whichever is older, at the start of the contest.
- [ ] Not located or resident in Afghanistan, Belarus, Cuba, Iran, North Korea, Russia, Somalia, Syria, occupied regions of Ukraine, Venezuela or Yemen, and not sanctioned. Lithuania is fine.
- [ ] Not an employee, contractor or officer of Colosseum or a sponsor, or their immediate family.
- [x] **Employer policy.** The rules make you warrant that entering does not breach an employer's policies or contracts. Kipdeck is unrelated to any founder's job, so it does not.
- [ ] Every member registered on colosseum.com with profile information and consent, before 2026-10-12 23:59 PT.
- [ ] Each person is on one team only; one submission per team.
- [ ] Prizes need signed prize acceptance documents and passing Colosseum's and the sponsors' due diligence (expect KYC) [unverified: what the due diligence involves]; prizes are stated in Phantom CASH stablecoin and paid to the team leader, who may have to set up a wallet address.
- [ ] **Pre-existing code is allowed but all relevant past development must be disclosed** in the form (FAQ); misrepresenting it can mean disqualification, a ban from future Colosseum hackathons and revoked prizes. The FAQ says open-source code developed by others is not "pre-existing code", but an entire forked product is closer to it, so disclose in full. The rules PDF also asks entrants to tell Colosseum the status and ownership of any open-source or third-party code.
- [ ] The FAQ says the hackathons are "for new startups that haven't raised significant outside capital". The rules PDF does not say it.

## Pre-existing code disclosure

Paste into "anything else judges should know" (or the prior-work question if the form has one):

```field name="Prior work disclosure" max-chars=1500
This is a fork of Agent Office (github.com/AgentSystemLabs/agent-office), an MIT-licensed open source project by webdevcody / AgentSystemLabs with community contributors. Upstream started on 2026-09-25, inside the contest period, and we are not its authors or affiliated with it. Upstream built the 3D multiplayer office, the desks where coding agent CLIs run in terminals, shared terminals, voice chat, the GitHub issue and PR boards and the deploy scripts. Nothing onchain existed upstream. Everything crypto in this submission is ours and was built during the contest: (superseded: the current list is the prior work field in chain/SUBMIT.md) (on 2026-10-01: x402 paid tasks on Base, held for admin approval, and a dependency-free x402 package; add the Solana escrow only once it exists). Upstream baseline commit: 665aeec (2026-09-30). Our commits and files against it: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
```

Then the `whats-new.ts` output (see [disclosure.md](disclosure.md)).

## Project description

Form fields (from the FAQ): product name and description, blockchains and tools integrated, every teammate with background and experience, team location, logo, GitHub repo (open source encouraged; a private repo needs access granted to hackathon@colosseum.com), pitch video, technical demo video, go-to-market with demand validation, and "anything else judges should know". Character limits are not published [unverified]; the drafts below are kept short. The description, blockchains field and demo script describe the planned escrow; on 2026-10-01 none of it is built.

```field name="Product name" max-chars=60
Agent Office Bounties
```

```field name="One-line description" max-chars=200
Fund a GitHub issue with a Solana escrow; an AI coding agent in Agent Office solves it, and the bounty pays out onchain when the pull request merges.
```

```field name="Description" max-words=300
Open source maintainers have more issues than hands, and coding agents can now close many of them. What is missing is a way to pay for that work that nobody has to trust. Agent Office Bounties adds it to Agent Office, an MIT open source 3D office where a team's coding agents work at desks.

A maintainer picks an issue in the office and funds a bounty: the office creates a Solana escrow account holding the reward and records the issue and the payout rule. Any worker in the office (or any contributor running their own office) can take the issue. When the resulting pull request is merged on GitHub, a signed merge attestation releases the escrow to the wallet of whoever ran the worker. If nothing merges before the deadline, the maintainer gets the funds back.

Everything is visible: the bounty shows on the issue board, the escrow's balance on the desk, and the payout transaction links to the explorer.

Why Solana: fast, cheap transactions make small bounties ($5 to $50 per issue) practical, and programs can hold funds without a custodian.
```

```field name="Blockchains and tools" max-chars=300
Solana (Anchor program for escrow, @solana/web3.js client), Phantom wallet, GitHub webhooks for merge events [planned, not built]; Base with x402 and USDC for paid tasks on hosted workers [built on launch/x402-base]. Built on Agent Office (TypeScript, three.js, Node).
```

```field name="Go-to-market and demand validation" max-words=200
First users are open source maintainers who already run coding agents and teams paying contractors for small fixes. Channel: the Agent Office community (the upstream repo is public), GitHub issue labels ("bounty"), and a consultancy pilot where we run an office for a client team. Revenue: a small fee on each payout and a hosted office subscription. Validation so far: (superseded: the current answer, from chain data, is in chain/SUBMIT.md) (conversations, sign-ups, pilots; fill in with real numbers only).
```

## Judging criteria

Six criteria from the official rules, no published weights.

| Criterion | Our answer |
| --- | --- |
| Functionality | Escrow program deployed on devnet (mainnet if ready), end-to-end payout on a real merged PR in the demo; tests for the program |
| Potential impact | Every open source project with a backlog; bounties that settle without a middleman |
| Novelty | Agents as the workers, the office as the marketplace, merge as the payout trigger |
| UX | The maintainer never leaves the issue board; wallet at the desk; explorer links on every payout |
| Open source | MIT, public repo, the escrow program usable by any tool, not only Agent Office |
| Business plan | Payout fee plus hosted offices; consultancy pilot as the first paying customer |

## Demo video script

Two videos. The FAQ asks for a two-to-three-minute pitch video and a product demo video of no more than three minutes; one third-party summary says the pitch is up to two minutes [unverified, conflicting]. Keep the pitch at 2:00 to be safe. The rules do not mention AI voiceover [unverified]; the pitch is judged on the founders, so be on camera and use your own voice.

### Pitch video

Runtime target: 2:00 (limit: 3:00)

| Time | Shot | Script |
| --- | --- | --- |
| 0:00-0:20 | You on camera | Who you are, what you have built before, why you care about agents doing open source work. |
| 0:20-0:45 | You, then screenshots of an issue backlog | The problem: maintainers drown in issues, agents can fix many, nobody has a trustless way to pay for it. |
| 0:45-1:15 | Screen: fund a bounty, a worker solves it, payout lands | The product in thirty seconds. |
| 1:15-1:35 | You on camera | Who it is for and how it makes money. |
| 1:35-1:50 | You on camera | Traction and validation so far, real numbers only. |
| 1:50-2:00 | Card: built on Agent Office by webdevcody (MIT), links | Credit upstream in one sentence; the ask. |

### Technical demo video

Runtime target: 2:50 (limit: 3:00)

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:20 | Architecture card: office server, Solana program, GitHub webhook, wallets | "Three parts: the office, an escrow program on Solana, and GitHub's merge event." |
| 0:20-0:55 | Maintainer funds a bounty on issue 42 with Phantom; explorer shows the escrow account | "Funding a bounty creates an escrow account that holds the reward." |
| 0:55-1:30 | A worker takes the issue, codes, opens a PR | "An agent at a desk takes the issue and opens a pull request." |
| 1:30-2:05 | Merge the PR; the webhook triggers the release; explorer shows the payout | "The merge releases the escrow to the worker's owner. No one holds the funds in between." |
| 2:05-2:30 | Refund path: an expired bounty returns to the maintainer; program tests pass | "No merge before the deadline, and the maintainer gets it back." |
| 2:30-2:50 | Repo, license, what is upstream and what is ours | "The office is upstream Agent Office. The escrow and everything onchain is ours." |

## Submission checklist

- [ ] Every team member registered on colosseum.com before 2026-10-12 23:59 PT.
- [ ] Escrow program deployed (devnet at least), program ID in the README; tests pass.
- [ ] Repo public (preferred) with MIT `LICENSE`, upstream notice kept.
- [ ] Logo, team backgrounds and location filled in.
- [ ] Pitch video (you on camera, 2:00) and technical demo (under 3:00) on YouTube, Loom or Vimeo.
- [ ] Prior work disclosure pasted; `whats-new.ts` output attached.
- [ ] Demand validation has real numbers or says "none yet".
- [ ] Wallet ready for a Phantom CASH payout; KYC documents at hand.
- [ ] All `{{...}}` placeholders filled; `npx tsx launch/tools/lint.ts` clean.
- [ ] Submitted by the team leader before 2026-10-12 23:59 PT; confirmation saved.
