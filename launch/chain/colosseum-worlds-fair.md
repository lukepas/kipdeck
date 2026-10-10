# Colosseum Crypto World's Fair

Last checked: 2026-10-10 (rules, FAQ and event page re-read; the form answers to paste are in [SUBMIT.md](SUBMIT.md)). Sources: the event page, the official rules PDF and the hackathon FAQ (links below). Anything they don't state is marked [unverified].

Entry: Kipdeck, the inbox for your AI coding agents, with Proof of Merge, the payout layer of Kipdeck: a person's merge is the only thing that moves money or reputation for an agent's work. Kipdeck is built on agent-office (MIT, by webdevcody / AgentSystemLabs). Lead track: Solana (escrowed bounties on devnet). Second chain: Base (proof-of-merge attestations and ERC-8004 reputation on Base Sepolia). Also eligible for the Public Goods Award as MIT open source [unverified: how that award is judged].

## Deadline

- Contest period: 2026-09-14 06:00 PT to **Monday 2026-10-12, 23:59 PT (PDT, UTC-7)**. That is 2026-10-13 06:59 UTC and 2026-10-13 09:59 in Vilnius.
- Every team member registers on colosseum.com before the same cut-off; after it the registration form is disabled (rules, section 6).
- The team leader uploads the submission before the cut-off. One product per team (FAQ).
- Winners announced by 2026-12-05 (rules, section 5).
- Our targets: videos recorded 2026-10-09, submitted 2026-10-11, a day early.

## Links

- Event page: https://colosseum.com/worldsfair
- Official rules (PDF): https://colosseum.com/legal/Crypto%20World%27s%20Fair%20Hackathon%20Rules.pdf
- Hackathon FAQ (form fields, videos, prior work): https://colosseum.com/hackathon
- Arena (registration and the form; arena.colosseum.org now redirects here): https://colosseum.com/arena
- Upstream: https://github.com/AgentSystemLabs/agent-office (our history starts from snapshot imports of https://github.com/AgentSystemLabs/agent-office/commit/665aeec571bc03f76cbd16de8d628dd169a48874 and https://github.com/AgentSystemLabs/agent-office/commit/1bc3028472d38b161e85117bf621bb6bc12700e5, see [disclosure.md](disclosure.md))
- Our repository: https://github.com/zbagdzevicius/kipdeck
- What we added since our import of upstream 1bc3028 (226452e4), the 11 re-committed upstream pull requests included and named in [disclosure.md](disclosure.md): https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
- Public showcase: https://zbagdzevicius.github.io/kipdeck/ (not published yet on 2026-10-10: it returns 404 until the Pages workflow runs, see [SUBMIT.md](SUBMIT.md))

What is deployed on testnets (every link below was checked on 2026-10-03, the x402 payment and the fifth bounty on 2026-10-04; the explorers block scripted requests, so the transactions were checked over RPC, see [links.json](links.json)):

| What | Where |
| --- | --- |
| Escrow program, Solana devnet | https://explorer.solana.com/address/JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6?cluster=devnet |
| A demo bounty released on devnet (no GitHub merge behind it); three more after the 2026-10-03 upgrade, one paid through the approver-wallet path (release `2CNXXdgQU9Teyem2Zfd39TtUXiB1mLhyjy6PfbLA2ZzE7kADbReYc8ppRC6FkLVpPQ98Gwpdy6j22bp4LSELWD8r`), one after the review fixes on 2026-10-04 (release `2sWD8aUJ6Wd5xEQcTxGK2tRarfr6TuzjYLgppmTrTtxBxwo6T3XP42EoYCypq9oXFQQ3Zj6TthXEMxoUNuVZCgNF`), all in `onchain/solana/deployments/devnet.json` | https://explorer.solana.com/tx/2rPSWQv7YSWkEwJWNJtGtpeN8WYQzHXvbPz8xb9dCbEz8LnpatSZaoYHyyyq7dgUCkmWHrU4ywFc29HPYa73ZtUc?cluster=devnet |
| A fifth demo bounty on 2026-10-04, claimed by the GitHub Action (`onchain/action`) against a fake GitHub API, so no real merge, and released by the approver's `ao-bounty cosign` on a durable nonce; the Base Sepolia attestation that run wrote was revoked | https://explorer.solana.com/tx/4PYnNQZAi23BGUQ84EqDJfgSZABjqqKxPeyan6frLG25H6jWY8F6qrLGyRituXNXeHujZd29uWPXhoDN7MSdYsUe?cluster=devnet |
| Proof-of-merge schema, EAS on Base Sepolia | https://base-sepolia.easscan.org/schema/view/0x368e9023c13393aea075e78cae18e804725b0d1bb3e2b1a6c1117d759a01a900 |
| Its registration transaction | https://sepolia.basescan.org/tx/0x57045f814359c8e0c0f6d4b5543198ed1609570c4875e0cd84bf3f13336a83a8 |
| MergeAttestor fallback contract | https://sepolia.basescan.org/address/0x278f441b635ebf4aca971184c0cab60b893f34fc |
| ERC-8004 Identity and Reputation registries we write to (not ours) | https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e and https://sepolia.basescan.org/address/0x8004B663056A597Dffe9eCcC1965A193B7388713 |
| One x402 paid task, 0.10 test USDC settled by x402.org on 2026-10-04 and held for an admin, in `onchain/x402/deployments/base-sepolia.json` | https://sepolia.basescan.org/tx/0x490896509be59e45e7d14afbaa3ec24c18db5292f4ea1c71cf79533670d126dc |

## Eligibility checklist

- [ ] 18 or older and of the age of majority at the start of the contest; not in a sanctioned country or region (rules, section 3). Lithuania is fine.
- [ ] Employer: written permission for outside work, IP ownership and prizes. The rules make the entrant warrant that entering breaches no employer policy.
- [ ] Every member registered on colosseum.com before 2026-10-12 23:59 PT, profile complete, consent given.
- [ ] Prior work disclosed in the form: the FAQ allows pre-existing code but requires disclosing all relevant past development; misrepresenting it can mean disqualification. The rules (section 9) also ask entrants to tell Colosseum the status and ownership of open-source and third-party code. Both are covered by [disclosure.md](disclosure.md).
- [x] Repository public (https://github.com/zbagdzevicius/kipdeck), with the MIT `LICENSE` keeping the upstream copyright notice, and `NOTICE` crediting upstream.
- [ ] Testnet only. The rules and FAQ say nothing about mainnet [unverified: whether judges weigh it]; we say so plainly in [judge-qa.md](judge-qa.md).
- [ ] Prizes are paid in Phantom CASH to the team leader after prize documents and due diligence (rules, section 14). Expect KYC [unverified: what it involves].

## Pre-existing code disclosure

Paste into the prior work question, or "anything else judges should know". It is the same text as [disclosure.md](disclosure.md), where the commit list and the third-party license table are.

```field name="Prior work disclosure" max-chars=1500
Kipdeck is built on agent-office (github.com/AgentSystemLabs/agent-office), MIT, by webdevcody / AgentSystemLabs and community contributors. Upstream started on 2026-09-25, inside the contest period. We are not its authors and not affiliated. Upstream built the 3D office, desks where coding agent CLIs run in live terminals, voice, the GitHub boards and the deploy scripts. Our history starts from two snapshot imports of upstream (commits 01d85bbb = upstream 665aeec, and 226452e4 = upstream 1bc3028, both 2026-09-30); all of that is theirs, and so are 11 upstream pull requests we re-committed under our name (listed with their authors in launch/chain/disclosure.md). Ours, all written during the contest (our first commit is 2026-09-30): the inbox and mission control (attention ranking, review inbox, goals, timeline), a security layer (state files, network and host guards, CSP, worker environment allowlist, untrusted PR handling), and Proof of Merge, the payout layer: the Solana escrow program and SDK, bounties in the office with a Fund this issue Blink, a GitHub Action attester, x402 paid tasks, EAS attestations and ERC-8004 reputation on Base Sepolia, a chain-only indexer and the public showcase. Nothing on-chain existed upstream. Our commits are every commit in 226452e4..7b0f7538 except those 11, the import 01d85bbb and 2 Dependabot bumps. Testnets only. Diff: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
```

## Project description

The FAQ lists the fields: product name and description, blockchains and tools, team backgrounds and location, logo, GitHub repository, a pitch video, a product demo, and go-to-market. Character limits are not published [unverified]; the limits below are ours, to keep answers short enough to read.

```field name="Product name" max-chars=60
Kipdeck
```

```field name="One-liner" max-chars=140
Proof of Merge, the payout layer of Kipdeck: AI coding agents get paid, and earn reputation, only when a human merges.
```

```field name="Problem" max-words=120
Teams now run many coding agents at once: Claude Code, Codex, Cursor, Pi. Their output is cheap; a person's review is the bottleneck. Paying for attempts is broken: a maintainer doesn't want to pay for a pull request nobody reviewed, or one an agent merged itself, and the person running the agents doesn't want to do the work and then hope to be paid. Agent reputation today is self-reported: a harness's marketing page, or a benchmark that isn't your repository. Nobody can answer "which of my agents' pull requests actually get merged?" from data they can check.
```

```field name="Solution" max-words=200
Kipdeck is the inbox for your AI coding agents. Proof of Merge, its payout layer, adds one rule: a person's merge is the only thing that moves money or reputation for an agent's work.

A maintainer escrows devnet test tokens (standing in for USDC) against a GitHub issue, from the office's board or a Fund this issue Blink. Any office worker can take it. When someone with write access merges the worker's pull request, made by the office on the repository itself and never from a fork, and an office admin approves the payout in the review inbox, the Solana program releases the escrow to the operator's wallet. It needs two signatures: the attester's and the approver's, which the admin gives from a browser wallet. Repositories can also run the attester as a GitHub Action.

The same merge writes an EAS proof-of-merge attestation and ERC-8004 feedback on Base Sepolia. Reverts and closes are attested too. A public page shows the leaderboard (merge rate, time to merge, revert rate per agent and harness), rebuilt from chain data. Outsiders can hire a worker for one task over x402, held until an admin approves it.

No token, no NFT, no points. Testnets only.
```

```field name="Why Solana" max-words=90
Agent work comes in small pieces: fix a flaky test, bump a dependency. A 5 USDC bounty only makes sense when the payout costs a fraction of a cent, settles in seconds, and can be funded from a link (a Blink) with nothing to install. Program-owned vaults hold the money (the devnet upgrade key is one key; mainnet gets a multisig): anyone can crank each funder's refund after expiry, and a release needs both signatures. Every step is an event anyone can count.
```

```field name="Why Base" max-words=80
Reputation should outlive one office and be readable by any tool. EAS on Base Sepolia gives a public, cheap attestation per outcome (merged, reverted, closed) with the merge commit, the harness and the time to merge, and ERC-8004 gives each agent an identity and feedback other agents and registries already read. Base's EAS predeploys mean no contract of ours has to be trusted for the record.
```

```field name="Blockchains and tools" max-chars=400
Solana devnet: native Rust program on solana-program (no Anchor), TypeScript SDK, Solana Actions (Blink on dial.to), Wallet Standard. Base Sepolia: EAS (schema plus a fallback contract), ERC-8004 Identity and Reputation registries, x402 (USDC, EIP-3009, settled by x402.org), viem. Built on agent-office (TypeScript, three.js, Node).
```

```field name="Go-to-market" max-words=150
First users: small teams and open source maintainers who already run several coding agents and drown in their pull requests. They come for the inbox (what needs me now), which works with the chain off. Bounties and proof of merge are the switch they turn on when they want to pay for merged work or show an agent's record.

Channels: build in public on X and Farcaster, the weekly "which coding agent's PRs actually get merged?" board, the agent-office community upstream, and maintainers we invite to point their agents at funded issues.

Business: Kipdeck is self-hosted and open source, free for one engineer. Teams pay per seat for the team tier (USD 30 a month, our assumption; not built yet), later a 1 to 2 percent fee on released bounties once the program is audited and on mainnet. The escrow program and SDK stay MIT.
```

```field name="Demand validation" max-words=80 sources="merged_by_others,agents_ranked,devnet_bounties_released,devnet_test_usdc_released"
Counted from chain data on the submission day, not estimated. Merged agent PRs attested on Base Sepolia: 0. Agents on the board: 0. Bounties released on Solana devnet: 5, scripted demos of 77 test tokens in all, with no GitHub merge behind them. We will refresh these numbers before submitting.
```

```field name="Team" max-words=80
Three founders in Vilnius, building Kipdeck since 30 September. Zygimantas Bagdzevicius, CEO/CTO: ex-Amazon engineer, founded and exited a Lithuanian business that scaled to 400k monthly active users. Lukas Kveraga, founding engineer: ex-Vinted, scaling a high-traffic marketplace. Ernestas Rimkevicius, software engineer: backend, importers and pipelines.
```

```field name="Location" max-chars=60
Vilnius, Lithuania
```

## Judging criteria

The six criteria from the rules (section 8), no published weights.

| Criterion | Our answer |
| --- | --- |
| Functionality | Program deployed on devnet; demo bounties run open to release there without a real merge, one claimed by the GitHub Action; one x402 paid task settled on Base Sepolia; no standing attestations on Base Sepolia yet (schema registered, test attestations revoked); Rust host tests, SDK tests with litesvm runs of the built program, the office's tests, local validator and anvil end to end runs |
| Potential impact | Every team running agent fleets; the board answers a question the whole field argues about, from data anyone can check |
| Novelty | Which agents' pull requests get merged, as a public, checkable dataset per agent and harness; money and reputation move only on a person's merge, with two signatures and an admin in the loop |
| UX | Fund from the board or a Blink; approve in the review inbox you already use; a payout toast with an explorer link |
| Open source | MIT; the escrow program and SDK know nothing about the office; the board is CC0 data rebuilt by one command |
| Business plan | Self-hosted and open source, free for one engineer; a paid team tier per seat (USD 30 a month, our assumption); a small bounty fee after an audit and mainnet |

## Demo video script

Both videos are made from [launch/video/](../video/README.md): the pitch from [pitch-script.md](../video/pitch-script.md) (target 2:25, hard stop 2:30, founder on camera), and the technical demo, a 2:56 cut built from recordings and voiced from `launch/video/capture/voiceover.txt`, with `launch/video/description.txt` for its upload. [demo-script.md](../video/demo-script.md) (target 2:55) is the live take for after a merge that counts. The older [video-scripts.md](video-scripts.md) (a worker at a desk, a Phantom-signed bounty and a real merge on camera) is superseded for Colosseum: the cut says PR #4 was a self-merge and labels its replays. The FAQ asks for a two-to-three-minute presentation and a product demo of no more than three minutes.

## Submission checklist

- [ ] Employer permission saved.
- [ ] Every member registered before 2026-10-12 23:59 PT.
- [ ] Multi-track answer from Discord pasted into [judge-qa.md](judge-qa.md).
- [ ] Repository public (it is: https://github.com/zbagdzevicius/kipdeck); the commit after `226452e4..` in the disclosure re-stamped with the submitted commit (stamped `7b0f7538` on 2026-10-10; see [SUBMIT.md](SUBMIT.md)).
- [ ] Counts refreshed from chain (`launch/chain/tools/counts.ts --refresh`), demand validation re-read.
- [ ] Showcase published (GitHub Pages export from onchain/indexer) and https://zbagdzevicius.github.io/kipdeck/ opened in a private window.
- [ ] Pitch and demo uploaded; links in the form.
- [ ] Disclosure pasted; `whats-new.ts` output in [disclosure.md](disclosure.md).
- [ ] `npm run launch:check` clean.
- [ ] Submitted by the team leader before 2026-10-12 23:59 PT; confirmation saved.
