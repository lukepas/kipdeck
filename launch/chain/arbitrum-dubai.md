# Arbitrum Open House Dubai buildathon (HackQuest)

Last checked: 2026-10-14. Prepared 2026-10-14 from the live HackQuest page data and the repository at `719234e1` (main, 2026-10-13). Supersedes the dates in `launch/chain/arbitrum-dubai.md` and `launch/chain/deadlines.json`, which were guessed from the countdown and are wrong (see Deadline).

Plan: a separate entry, not part of the Colosseum submission. Proof of Merge (the payout layer of Kipdeck, which is built on agent-office, MIT, by webdevcody / AgentSystemLabs) keeps its attestations chain-agnostic, so they can run on Arbitrum Sepolia next to Base Sepolia. Nothing of the Arbitrum work exists yet. Do not describe it as built until it is.

## Deadline

The "17 days left" on the page counts down to registration opening, not closing. The event status in the page data is `REGISTER_NOT_OPEN, SUBMIT_NOT_OPEN`. Times below are the exact ISO timestamps from the page data (`timeline` object, read 2026-10-14). Vilnius is on EET (UTC+2) for all of these dates.

| Step | UTC | Vilnius |
| --- | --- | --- |
| Registration opens | 2026-10-31 16:01 | 2026-10-31 18:01 |
| Submission opens | 2026-11-16 16:01 | 2026-11-16 18:01 |
| Registration closes | 2026-12-05 16:01 | 2026-12-05 18:01 |
| Submission closes (the deadline) | 2026-12-06 16:01 | 2026-12-06 18:01 |
| Reward announcement | 2026-12-13 17:01 | 2026-12-13 19:01 |

Plan to register on 2026-10-31 and submit by 2026-12-05 (one day of slack). These are in `launch/chain/deadlines.json` and `calendar.ics` since 2026-10-14.

## Links

- Landing page: https://arbitrum-dubai.hackquest.io/
- Event page on HackQuest (register and submit here, needs a HackQuest login): https://www.hackquest.io/hackathons/Arbitrum-Open-House-Dubai-Online-Buildathon
- Community: https://t.me/+BsYAyQmpC8E4NWE1 (the page also names a "#open-house" channel)
- Resources the page lists: https://docs.arbitrum.io/ (the page's own overview link returned 404 on 2026-10-14), https://docs.arbitrum.io/stylus/reference/testnet-information
- Precedent with published rules (same host, same format, ended 2026-10-04): https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon
- Our links: repo https://github.com/lukepas/kipdeck, site https://kipdeck.com, replay demo https://kipdeck-demo.vercel.app, showcase https://lukepas.github.io/kipdeck/, upstream credit https://github.com/AgentSystemLabs/agent-office

## Fit

- Host: Arbitrum Foundation. Online. Total prize 30,000 USD; the breakdown and judging criteria say "TBD / Coming soon". Tech stack "All". 83+ registrants so far.
- The page says: build with Stylus or Solidity, deploy on Arbitrum One or an Orbit chain, "Bring an existing product or start from scratch". So pre-existing work is allowed; we disclose it.
- Testnet: the Dubai page says "Arbitrum One or your own Orbit chain" and does not mention testnets. The Singapore edition's rules said "Your project must be deployed on an Arbitrum chain to qualify. For example: Arbitrum Sepolia, Arbitrum One, Robinhood Chain, or others." We go on Arbitrum Sepolia only. If the Dubai rules, once published, require Arbitrum One, we do not enter.
- Singapore's judging criteria (expect the same): smart contract quality, product-market fit, innovation and creativity, real problem solving. Its prizes were "subject to development-tied milestones" and the top three teams got a place at the in-person Founder House.
- Our entry: Proof of Merge (the payout layer of Kipdeck, built on agent-office) on Arbitrum Sepolia. The MergeAttestor contract and the merge-based ERC-8004 reputation flow, today pinned to Base Sepolia (chain id 84532), run on Arbitrum Sepolia (chain id 421614) too, and the indexer reads both chains into one leaderboard where each row says which chain holds its proof. Stretch: a Stylus (Rust) contract that computes merge rate, revert rate and time to merge on chain, so another contract can ask for an agent's record.
- Checked today with `eth_getCode` on https://sepolia-rollup.arbitrum.io/rpc (chain id 0x66eee = 421614): the ERC-8004 Identity Registry `0x8004A818BFB912233c491871b3d84c89A494BD9e` and Reputation Registry `0x8004B663056A597Dffe9eCcC1965A193B7388713` have code there (the same addresses we use on Base Sepolia), and so do `0x2521021fc8BF070473E1e1801D3c7B4aB701E1dE` and `0x45CB6Fa0870a8Af06796Ac15915619a0f22cd475`, which we believe are EAS and its SchemaRegistry on Arbitrum Sepolia [unverified: confirm with `version()` and the EAS docs before relying on them]. So the port needs only our own MergeAttestor deployed; the registries are already there.

## Ask

Hackathon, so no grant ask. Target, in order:

1. A top-three placing, which on the Singapore precedent carries a Founder House place. The Dubai split of the 30,000 USD is not published yet; on the Singapore pattern a single overall prize would be in the 3,000 to 10,000 USD range for this pool size [estimate, recheck once "Prizes & Judging" is published].
2. If the host again offers milestone-based grants to selected projects (Singapore: "Up to $30k USDC in milestone-based grants", case by case), ask for 5,000 USD in two milestones: (a) 2,500 USD when the Stylus merge-stats contract is on Arbitrum Sepolia with tests and the indexer reads it; (b) 2,500 USD when 3 outside repositories have at least 10 person-merged agent PRs attested on Arbitrum Sepolia between them. Justification: one sixth of Singapore's 30k grant pool, sized for a first, testnet-only grant.

## Eligibility checklist and blockers

Every box here must be ticked before submitting. The first one is open in every kit.

- [ ] Rules not published: the Dubai "Prizes & Judging" section says TBD. Confirm testnet (Arbitrum Sepolia) qualifies; if only Arbitrum One counts, do not enter.
- [ ] Prize terms: Singapore's prizes were tied to development milestones under separate Terms and Conditions; read Dubai's before accepting.
- [ ] Company registration: none needed to enter (individual HackQuest account). If a prize is won, the payee is a personal wallet unless a Kipdeck company exists [FOUNDERS: decide payee; company not registered per available facts].
- [ ] Personal fields only the founder can fill: Arbitrum One prize wallet, newsletter yes/no, Twitter, LinkedIn, fundraising status, team (D9).
- [ ] Honesty: no real counted merge has paid an agent yet (see `launch/video/README.md`). The submission must show at least one real person-merged agent PR attested on Arbitrum Sepolia, or label the demo as test data.

## Pre-existing code disclosure

The submission asks for it in "Progress during hackathon" (under Project description); the description and team intro credit upstream too.

```field name="Prior work" max-chars=1000
Proof of Merge is the payout layer of Kipdeck, which is built on agent-office (github.com/AgentSystemLabs/agent-office), MIT, by webdevcody / AgentSystemLabs; the office is their work. Before this buildathon we built, for the Colosseum Crypto World's Fair: the inbox and mission control, a Solana devnet escrow for bounties paid only on a person's merge, and proof-of-merge attestations and ERC-8004 reputation on Base Sepolia. Everything Arbitrum is new and listed in "Progress during hackathon". Our commits are listed in launch/chain/disclosure.md.
```

## Project description: form answers

HackQuest has two forms: the registration application (fields read from the event's own form config in the page data, with their limits) and the project submission (HackQuest's standard project fields plus two custom fields from the config). The standard project editor is behind a login, so its per-field limits are not visible; the limits marked [unverified] below are safe guesses. Recheck them in the editor.

### Registration application (opens 2026-10-31)

| Field | Required | Limit | Answer |
| --- | --- | --- | --- |
| First and Last Name | yes | - | Lukas Kveraga |
| Location | yes | - | Vilnius, Lithuania |
| Email | yes | - | `hello@kipdeck.com` |
| GitHub | yes | - | lukepas |
| Twitter | no | - | [FOUNDERS: X handle, or leave empty] |
| LinkedIn | no | - | https://www.linkedin.com/in/lukas-kveraga |
| Do you already have an idea for what to build during the Buildathon? | yes | 300 chars | see below |
| Do you already have a project you're working on? Please share the website URL. | yes | 300 chars | see below |
| Please share your Arbitrum One wallet address with us. | yes | 300 chars | [FOUNDERS: an Arbitrum One address you control for prizes. Not the attester or deployer test keys in ~/.config/agent-office-chain] |
| Would you like to sign up for the Arbitrum Builder Newsletter? | yes | Yes / No | [FOUNDERS: Yes or No] |

Idea (295 chars):

```field name="Do you already have an idea for what to build during the Buildathon?" max-chars=300
Proof of Merge on Arbitrum. Teams run many AI coding agents and their track records are self-reported. We attest each outcome a person causes on an agent's PR (merged, reverted, closed) on Arbitrum Sepolia, give agents ERC-8004 reputation only merges earn, and rebuild the board from chain data.
```

Project website (170 chars):

```field name="Do you already have a project you're working on? Please share the website URL." max-chars=300
https://kipdeck.com - Kipdeck, the inbox for your AI coding agents. Open source (MIT), built on agent-office by webdevcody. Code: https://github.com/lukepas/kipdeck
```

### Project submission (opens 2026-11-16, closes 2026-12-06 16:01 UTC)

Project name:

```field name="Project name"
Proof of Merge (Kipdeck)
```

Logo: the Kipdeck logo (PNG or SVG) from the repo's brand assets [FOUNDERS: pick the file; branch `brand/kip-logo` exists].

One line intro [unverified limit; this is 100 chars]:

```field name="One line intro"
Which coding agent's pull requests actually get merged? Proof of merge on Arbitrum, from chain data.
```

Sector: Tools (alternatives the page names: DeFi, Gaming, Social, Tools). Add AI if the sector list offers it.

Tech tags: Solidity, Rust, Stylus, TypeScript, EAS, ERC-8004.

Ecosystem: Arbitrum.

Submission type: Solo project.

Description [unverified limit; 247 words]:

```field name="Description"
Teams now run many AI coding agents (Claude Code, Codex, Cursor and others) on the same codebase. Nobody can say which of them produce work people actually keep, because every track record is self-reported.

Proof of Merge fixes the input. When a person with write access merges a pull request an agent opened, the office writes one attestation: repository, PR, merge commit, a keyed hash of who merged it, which agent CLI did the work, time to merge. A later revert gets its own attestation pointing back at the first; a PR closed unmerged gets one too. Each agent also has an ERC-8004 identity, and its reputation moves only on those outcomes. Self-merges by the agent's own operator are tagged and do not count. No points, no tokens.

On Arbitrum we deployed the MergeAttestor contract on Arbitrum Sepolia and use the ERC-8004 registries already live there. The indexer reads Arbitrum Sepolia and Base Sepolia into one leaderboard, each row naming the chain that holds its proof, so anyone can rebuild "merge rate per agent" with no office running and no keys. {{STYLUS_SENTENCE}}

Proof of Merge is the payout layer of Kipdeck, the inbox for your AI coding agents, which is built on agent-office (MIT, by webdevcody / AgentSystemLabs). The Solana devnet escrow that pays bounties only after a person merges, and the Base Sepolia side, existed before this buildathon; the Arbitrum work below is new. Testnet only.
```

Replace `{{STYLUS_SENTENCE}}` with one of:
- if the stretch ships: `A Stylus (Rust) contract, MergeStats, keeps each agent's merge rate, revert rate and median time to merge on chain, so another contract can ask for an agent's record before it pays or hires it.`
- if not: delete the placeholder.

Progress during hackathon [unverified limit]. Paste only the lines that are true at submission time:

```field name="Progress during hackathon"
Before 2026-11-16 (pre-existing, disclosed): Kipdeck inbox and mission control; Solana devnet escrow paying bounties only after a person merges; EAS schema, MergeAttestor and ERC-8004 reputation on Base Sepolia; the chain-only indexer and showcase.

During the buildathon (new):
- Chain config for Arbitrum Sepolia (421614) in onchain/attest and onchain/reputation; the chain-id guard now accepts a list of testnets and still refuses mainnets, and MergeAttestor also refuses Arbitrum One (42161).
- MergeAttestor deployed on Arbitrum Sepolia: {{ARB_SEPOLIA_MERGE_ATTESTOR}}; deployments/arbitrum-sepolia.json.
- Office agents registered in the ERC-8004 Identity Registry on Arbitrum Sepolia; feedback on merge, revert and close.
- Indexer reads both chains into one dataset; the leaderboard shows which chain holds each proof. Replay tests cover both.
- {{N}} real person-merged agent PRs attested on Arbitrum Sepolia: {{ARBISCAN_LINKS}}.
- Stretch: MergeStats in Stylus (Rust), deployed at {{ARB_SEPOLIA_MERGE_STATS}}, with cargo tests.
Commits: https://github.com/lukepas/kipdeck/compare/{{START_SHA}}...{{END_SHA}}
```

Fundraising status:

```
[FOUNDERS: confirm before pasting] No outside funding raised yet. Founder-led.
```

GitHub (open source):

```
https://github.com/lukepas/kipdeck
```

MVP/Project Website (custom field, required, 300 chars):

```field name="MVP/Project Website" max-chars=300
https://lukepas.github.io/kipdeck/ (public leaderboard rebuilt from chain data) - replay demo: https://kipdeck-demo.vercel.app - product: https://kipdeck.com
```

Contract Address (custom field):

```field name="Contract Address"
{{ARB_SEPOLIA_MERGE_ATTESTOR}}
```

(If the field takes several, add `{{ARB_SEPOLIA_MERGE_STATS}}` for the Stylus contract.)

Team intro:

```field name="Team intro"
Solo founder. Lukas Kveraga (Founder, CEO and CTO), Vilnius, Lithuania: product, contracts and the office. Kipdeck builds on agent-office by webdevcody / AgentSystemLabs (MIT); their office is their work.
```

Pitch video: 2 minutes, founder on camera, script below. Demo video: 3 minutes, screen capture, script below. Upload both unlisted (YouTube) [unverified: whether HackQuest takes a link or an upload; the placeholder text says "Please Upload"].

## Judging criteria

Dubai's criteria are "TBD" on 2026-10-14. | Criterion | Our answer |
| --- | --- |
| Smart contract quality | MergeAttestor is small: attester-only writes, refUID must exist, revoke only live records, refuses mainnet deploys; forge tests in `onchain/attest/test/forge/`. Stylus contract with cargo tests if the stretch ships. |
| Product-market fit | Teams running several coding agents need a record of whose work gets kept; the record comes from people's merges, not the agents. [FOUNDERS: add user or pilot numbers only if real] |
| Innovation and creativity | Agent reputation earned only by human merge outcomes, readable by contracts, on two chains with one board. |
| Real problem solving | Picking which agent to trust with a repo, and paying agents only for work a person merged. |

## Demo video script

### Pitch video

Pitch video, founder on camera. HackQuest states no length [unverified]; 3:00 is our own cap.

Runtime target: 2:00 (limit: 3:00)

| Time | On screen | Said |
| --- | --- | --- |
| 0:00-0:15 | Founder to camera | "Teams run five, ten AI coding agents now. Ask which one's pull requests actually get merged and nobody can tell you. Every number is self-reported." |
| 0:15-0:40 | Kipdeck inbox with several agents | "Kipdeck is the inbox for your AI coding agents, built on agent-office by webdevcody. Proof of Merge is its payout and reputation layer." |
| 0:40-1:10 | Diagram: PR merged by a person, attestation, ERC-8004 feedback | "When a person merges an agent's PR, we attest it. A revert or a close gets attested too. The agent's ERC-8004 reputation moves only on those. Its own operator's merges don't count." |
| 1:10-1:35 | Arbiscan page of MergeAttestor; leaderboard with chain column | "For this buildathon we brought it to Arbitrum Sepolia, and the board reads Arbitrum and Base into one leaderboard anyone can rebuild." |
| 1:35-1:50 | Stylus contract source (only if built) | "MergeStats, in Stylus, keeps each agent's merge rate on chain, so a contract can check an agent before paying it." |
| 1:50-2:00 | Founder, links | "Open source, testnet only. kipdeck.com." |

### Demo video

Label every shot as the Colosseum cut does: `REAL`, `TEST DATA` or `REPLAY`. Do not show a self-merge as counted.

Runtime target: 3:00 (limit: 3:00)

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:15 | Title card, credit line | "Proof of Merge on Arbitrum Sepolia. Kipdeck is built on agent-office by webdevcody, MIT." |
| 0:15-0:40 | Office: an agent opens a PR on a test repo | "An agent in the office opens a pull request." |
| 0:40-1:05 | GitHub: a person other than the operator merges it | "A maintainer merges it. That is the only event that counts." |
| 1:05-1:30 | Office log, then Arbiscan tx calling MergeAttestor.attest on 421614 | "The office writes the attestation to MergeAttestor on Arbitrum Sepolia. Here is the transaction." |
| 1:30-1:50 | Arbiscan: ERC-8004 giveFeedback tx | "The agent's ERC-8004 reputation gets feedback for the merge." |
| 1:50-2:15 | Terminal: `npm run index` with both networks, then the board | "The indexer reads Arbitrum Sepolia and Base Sepolia from public RPCs, no keys, and rebuilds the leaderboard. Each row says which chain holds its proof." |
| 2:15-2:40 | Stylus MergeStats read call (only if built) | "MergeStats, a Stylus contract, returns this agent's merge rate on chain." |
| 2:40-3:00 | Repo, contract addresses, disclosure line | "Everything before November 16 was built earlier and is disclosed. The code is MIT on GitHub." |

## To build before submitting

Nothing below exists today. In the repo, Arbitrum appears only as a link in `launch/chain/links.json`; `onchain/attest/src/chain.ts`, `onchain/reputation/src/chain.ts` and `onchain/indexer/src/indexer.ts` hard-code chain id 84532. Estimates are for one person.

| Item | Where | Estimate |
| --- | --- | --- |
| Chain table with 84532 and 421614; guard accepts only listed testnets; explorer links per chain | `onchain/attest/src/chain.ts`, `onchain/reputation/src/chain.ts` | 0.5 day |
| MergeAttestor also refuses 42161 (Arbitrum One); forge test for it | `onchain/attest/contracts/MergeAttestor.sol` | 1 hour |
| Deploy scripts for Arbitrum Sepolia; `deployments/arbitrum-sepolia.json` in both packages; fund deployer and attester from an Arbitrum Sepolia faucet | `onchain/attest/scripts`, `onchain/reputation/scripts` | 0.5 day |
| Confirm EAS on Arbitrum Sepolia (`version()`), or use MergeAttestor only | - | 1 hour |
| Office setting to pick the attestation chain | `src/server/chain/attest.ts`, `reputation.ts` | 0.5 day |
| Indexer: several sources, one dataset, a chain field per row; re-record fixtures; showcase shows the chain | `onchain/indexer` | 1.5 days |
| Real person-merged agent PRs on Arbitrum Sepolia (not self-merges) | test repo plus a second maintainer | 0.5 day plus waiting for merges |
| Pitch and demo videos | `launch/video` | 1 day |
| Stretch: MergeStats in Stylus (Rust), `cargo stylus check` and deploy, indexer read | new `onchain/stylus/` | 2 to 3 days |
| Docs: `docs/proof-of-merge.md`, package READMEs, keep `launch/chain/arbitrum-dubai.md` current (dates already in `deadlines.json` and `calendar.ics`) | - | 0.5 day |

Core: about 5 working days. With the stretch: about 8. All new work must land between 2026-11-16 and 2026-12-05 to count as buildathon work; prep that is not product code (reading docs, faucet funding) can happen earlier.

## Submission checklist

- [ ] Dubai rules and prize terms published and read; Arbitrum Sepolia accepted.
- [ ] HackQuest account; registered after 2026-10-31 18:01 Vilnius, before 2026-12-05 18:01.
- [x] Repo dates updated (`deadlines.json`, `calendar.ics`, kit) with the times above (2026-10-14).
- [ ] Start SHA recorded on 2026-11-16 for the "Progress during hackathon" compare link.
- [ ] Arbitrum Sepolia deployment done; addresses in `deployments/arbitrum-sepolia.json`; Arbiscan links checked.
- [ ] At least one real person-merged agent PR attested on Arbitrum Sepolia.
- [ ] Indexer and showcase show both chains; tests green.
- [ ] Every `{{...}}` and `[FOUNDERS: ...]` replaced; nothing claimed that was not built.
- [ ] Upstream credit (agent-office by webdevcody / AgentSystemLabs, MIT) in description, team intro and video.
- [ ] Pitch (2:00) and demo (3:00) videos uploaded.
- [ ] Submitted by 2026-12-05; confirmation screenshot saved under `launch/chain/`.
