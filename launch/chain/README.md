# Proof of Merge launch kit

Submission drafts, the disclosure, video scripts, landing copy, ten days of build-in-public posts and the calendar for the chain side of this fork. Proof of Merge is a fork of [agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, by webdevcody / AgentSystemLabs); every kit credits it. Testnets only: Solana devnet and Base Sepolia.

Last checked: 2026-10-03

## What is in here

| File | What it is |
| --- | --- |
| [colosseum-worlds-fair.md](colosseum-worlds-fair.md) | The main entry: every form field drafted, closes 2026-10-12 23:59 PT |
| [solana-foundation-grant.md](solana-foundation-grant.md) | Rolling grant: summary, "only possible on Solana", three milestones |
| [arbitrum-dubai.md](arbitrum-dubai.md) | Arbitrum Open House Dubai, a later entry; nothing built for it yet. Frozen until after 2026-10-12 |
| [tempo-track.md](tempo-track.md) | Colosseum's Tempo track, a stretch with a go or no-go date. Frozen until after 2026-10-12 |
| [base-builder.md](base-builder.md) | Base Builder Grants, only after a mainnet decision; do not submit testnet |
| [disclosure.md](disclosure.md) | What is upstream's and what is ours, the form text, and every third-party license |
| [judge-qa.md](judge-qa.md) | Answers for judges |
| [video-scripts.md](video-scripts.md) | The pitch, the technical demo, the shot list with fallbacks, weekly updates |
| [landing.md](landing.md) | The landing copy; the hero is the one on `/pom/` |
| [build-in-public.md](build-in-public.md) | The ten-day plan and its rules; drafts in [posts/](posts/2026-10-02.md) |
| [deadlines.json](deadlines.json) | Every date; [calendar.ics](calendar.ics) and the timeline below are made from it |
| [links.json](links.json) | Every outside link the kits cite, with when and how it was checked |
| [data/counts.json](data/counts.json) | The only traction numbers the kits may state, from [data/leaderboard.json](data/leaderboard.json) |

## What is live on testnets

As of 2026-10-03, checked over RPC that day (the explorers block scripted requests). None of the demo bounties has a GitHub merge behind it, and the devnet upgrade authority is a single key (`TyQidKVXFC52NRtsais3yaFbBkJksBeU5Y68TSwb1zE`), so the deployment is not custody-free:

| What | Network | Address or transaction |
| --- | --- | --- |
| Bounty escrow program (executable, upgradeable) | Solana devnet | `JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6` |
| One demo bounty, open, fund, claim, release (all finalized) | Solana devnet | release `2rPSWQv7YSWkEwJWNJtGtpeN8WYQzHXvbPz8xb9dCbEz8LnpatSZaoYHyyyq7dgUCkmWHrU4ywFc29HPYa73ZtUc`, the rest in `onchain/solana/deployments/devnet.json` |
| The program upgraded in place: attester and approver in the bounty seeds, Cancel signed by the creator or the approver | Solana devnet | upgrade `5y64MPvVR8cKgtrwwatH3XRd4pPmtpbKgUZkRCd7NYGAphXN6Ynz8qYz4zzuMFwDhZtBeHAoysm9Tjhdr69BE8f8` (slot 507133664) |
| Two more demo bounties on the upgraded program, one paid through the approver-wallet path | Solana devnet | releases `2BXByMAyR1QqzHE1A4brif8TFhmqyypaqVJKBs2totcoZGma6EHRCD9iXxZfpPrrtfhGV4jHNBe2zQedARM314Bu` and `2CNXXdgQU9Teyem2Zfd39TtUXiB1mLhyjy6PfbLA2ZzE7kADbReYc8ppRC6FkLVpPQ98Gwpdy6j22bp4LSELWD8r` |
| A fourth demo bounty after the review fixes (2026-10-04), same program | Solana devnet | release `2sWD8aUJ6Wd5xEQcTxGK2tRarfr6TuzjYLgppmTrTtxBxwo6T3XP42EoYCypq9oXFQQ3Zj6TthXEMxoUNuVZCgNF` |
| Proof-of-merge schema on EAS | Base Sepolia | `0x368e9023c13393aea075e78cae18e804725b0d1bb3e2b1a6c1117d759a01a900`, registered in `0x57045f814359c8e0c0f6d4b5543198ed1609570c4875e0cd84bf3f13336a83a8` (status 1) |
| MergeAttestor fallback contract | Base Sepolia | `0x278f441b635ebf4aca971184c0cab60b893f34fc` |
| ERC-8004 registries we write to (not ours, version 2.0.0) | Base Sepolia | Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

Explorer links for each are in [colosseum-worlds-fair.md](colosseum-worlds-fair.md#links). The board itself is empty so far: no office PR has been merged and attested on Base Sepolia yet (see [data/counts.json](data/counts.json)).

## Manual steps

These need a browser, a person or a decision, and no script does them. Until 2026-10-12 every hour goes to the first two, not to another chain: the Colosseum entry is Solana-led, and Base is where the reputation record lives.

- **One real merge to payout on a public demo repository**: fund about five issues from the board, let two or three harnesses take them, have a second GitHub account with write access merge, approve from the admin's approver wallet, and let `--attest --attest-repos <demo repo> --reputation` write the EAS attestation and the ERC-8004 feedback. Then refresh `data/counts.json` and re-record the pitch's counts beat with the real numbers.
- **Outside users**: invite three to five maintainers or agent operators to fund or claim an issue, so `merged_by_others` counts distinct maintainers who are not us.
- **A reachable demo**: one always-on office over HTTPS for the demo repository, so the Blink works on `dial.to?cluster=devnet` for judges, and the Pages export run once real outcomes exist; pin the first real run's Explorer, easscan and PR links at the top of the README.
- **The approver wallet**: in Settings, Bounties, set the admin's Phantom address as the approver wallet and send it a little devnet SOL (the approver `55vgpiASBFv3r31ePiPSEGzMomdiRBtjPM1ay7Bx5ypN` key file stays only for the scripted demos).
- **One live x402 payment**: once the payer holds Circle test USDC, settle one 0.10 USDC Base Sepolia payment through x402.org and record its transaction; until then the forms say x402 was tested on a local chain.

- Fund the Base Sepolia registrar `0x7c2C45a17A432CF890E514f1AaB67D941ec58314` with a little test ETH from a browser faucet, so the office can register its agents on ERC-8004. The attester `0x83dAa5252b68D98F25CbB089CCeE4edc7C083403` already holds some.
- Get Circle test USDC for the x402 payer from https://faucet.circle.com (Base Sepolia), for day 6's post and the demo.
- Devnet SOL from https://faucet.solana.com if `solana airdrop` is rate limited, for the funder wallet used on recording day.
- Publish the fork and the showcase (GitHub Pages export), then fill in `{{FORK_URL}}`, `{{SHOWCASE_URL}}`, `{{DIFF_URL}}` and `{{HEAD_SHA}}`.
- Ask the multi-track question in the Colosseum Discord and paste the answer into [judge-qa.md](judge-qa.md).
- Employer permission, registration on colosseum.com, recording the videos, posting.

## Tools

```sh
npm run launch:check                                  # all of the below in check mode, plus the linter
npx tsx launch/chain/tools/calendar.ts                # rewrite calendar.ics and the timeline below
npx tsx launch/chain/tools/counts.ts --refresh <dir>  # take leaderboard.json from an indexer run, rewrite counts.json
npx tsx launch/chain/tools/lint.ts                    # limits, sections, ASCII, sources, links, post rules
npx tsx launch/chain/tools/whats-new.ts               # the disclosure's commit list, ours and upstream's apart
```

How they work is in [docs/launch.md](../../docs/launch.md).

## Timeline

Times are shown in PT and in Vilnius. All-day entries are the same date in both.

<!-- timeline:start (generated by launch/chain/tools/calendar.ts from deadlines.json) -->
| Date | What | PT | Vilnius | Kit | Status |
| --- | --- | --- | --- | --- | --- |
| 2026-10-02 | Build in public, day 1: the fork, credit to upstream, rule one | all day | all day | [build-in-public.md](build-in-public.md) | our target |
| 2026-10-02 | Ask in the Colosseum Discord whether one project can be judged in the Solana and Base tracks; paste the answer into judge-qa.md | all day | all day | [judge-qa.md](judge-qa.md) | our target [unverified] |
| 2026-10-03 | Build in public, day 2: the escrow state machine and why two keys sign | all day | all day | [build-in-public.md](build-in-public.md) | our target |
| 2026-10-04 | Build in public, day 3: the escrow program on devnet, with the Explorer link | all day | all day | [build-in-public.md](build-in-public.md) | our target |
| 2026-10-04 | Fund the Base Sepolia registrar (browser faucet) and the x402 payer (Circle test USDC) | all day | all day | this page | our target |
| 2026-10-04 | Weekly update video 1 | all day | all day | [video-scripts.md](video-scripts.md) | our target |
| 2026-10-05 | Build in public, day 4: the first bounty funded from the board | all day | all day | [build-in-public.md](build-in-public.md) | our target |
| 2026-10-06 | Build in public, day 5: the Fund this issue Blink, and five issues to point agents at | all day | all day | [build-in-public.md](build-in-public.md) | our target |
| 2026-10-06 | Tempo track (stretch): go or no-go on a Moderato port | all day | all day | [tempo-track.md](tempo-track.md) | our target |
| 2026-10-07 | Build in public, day 6: hire a worker with one HTTP request (x402) | all day | all day | [build-in-public.md](build-in-public.md) | our target |
| 2026-10-08 | Build in public, day 7: the first leaderboard numbers, real n | all day | all day | [build-in-public.md](build-in-public.md) | our target |
| 2026-10-08 | Weekly update video 2 | all day | all day | [video-scripts.md](video-scripts.md) | our target |
| 2026-10-09 | Build in public, day 8: merge to payout on a public repo in 30 seconds | all day | all day | [build-in-public.md](build-in-public.md) | our target |
| 2026-10-09 | Colosseum: freeze the build, record the pitch and the technical demo | all day | all day | [colosseum-worlds-fair.md](colosseum-worlds-fair.md) | our target |
| 2026-10-10 | Build in public, day 9: verify it yourself, rebuild the board from chain | all day | all day | [build-in-public.md](build-in-public.md) | our target |
| 2026-10-11 | Build in public, day 10: submitted, links, thanks, what comes next | all day | all day | [build-in-public.md](build-in-public.md) | our target |
| 2026-10-11 | Colosseum: submit a day early | all day | all day | [colosseum-worlds-fair.md](colosseum-worlds-fair.md) | our target |
| 2026-10-11 | Regenerate the disclosure from git (whats-new.ts) and paste it | all day | all day | [disclosure.md](disclosure.md) | our target |
| 2026-10-12 | **Colosseum Crypto World's Fair: registration and submission close** | 2026-10-12 23:59 | 2026-10-13 09:59 | [colosseum-worlds-fair.md](colosseum-worlds-fair.md) | confirmed 2026-10-03 |
| 2026-10-14 | Solana Foundation grant: apply (rolling) | all day | all day | [solana-foundation-grant.md](solana-foundation-grant.md) | our target |
| 2026-10-16 | Weekly leaderboard post | all day | all day | [build-in-public.md](build-in-public.md) | our target |
| 2026-10-23 | Weekly leaderboard post | all day | all day | [build-in-public.md](build-in-public.md) | our target |
| 2026-10-30 | **Arbitrum Open House Dubai: registration countdown ends (page showed 27 days left on 2026-10-03)** | time not published | time not published | [arbitrum-dubai.md](arbitrum-dubai.md) | [unverified] |
| 2026-10-30 | Weekly leaderboard post | all day | all day | [build-in-public.md](build-in-public.md) | our target |
| 2026-10-31 to 2026-11-21 | Arbitrum Open House Dubai: online buildathon (three weeks) | all day | all day | [arbitrum-dubai.md](arbitrum-dubai.md) | [unverified] |
| 2026-11-02 | Base Builder Grants: revisit only after a mainnet decision; do not nominate testnet work | all day | all day | [base-builder.md](base-builder.md) | our target |
| 2026-12-05 | Colosseum Crypto World's Fair winners announced (by this date) | all day | all day | [colosseum-worlds-fair.md](colosseum-worlds-fair.md) | confirmed 2026-10-03 |
<!-- timeline:end -->
