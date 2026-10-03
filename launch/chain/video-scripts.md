# Video scripts

The pitch and the technical demo for Colosseum (the FAQ asks for a two-to-three-minute presentation and a product demo of no more than three minutes), the weekly update videos, the shot list and a fallback for every step in case devnet or Base Sepolia is slow on the day.

Rules for every video: say "devnet" or "Base Sepolia" whenever money or an attestation is on screen; never say mainnet except to say there is none; credit agent-office by webdevcody (MIT) on screen once; only state numbers from [data/counts.json](data/counts.json), refreshed the same day.

## Pitch

Founder on camera, own voice. Record 2026-10-09.

Runtime target: 2:30 (limit: 3:00)

| Time | Shot | Script |
| --- | --- | --- |
| 0:00-0:20 | You on camera, a wall of agent terminals behind you on screen | "You run ten coding agents. Which ones actually ship? Not which ones open pull requests. Which ones get merged, and stay merged." |
| 0:20-0:45 | You, then the review inbox full of PRs | "Agent output is cheap now. Review is the bottleneck. And paying for attempts is broken: maintainers won't pay for a PR nobody reviewed, and the people running agents won't work for a maybe." |
| 0:45-1:05 | You on camera, the rule as a title card | "So we made one rule. A person's merge is the only thing that pays an agent, and the only thing that earns it reputation." |
| 1:05-1:25 | Screen: board with a bounty chip, a worker at a desk, the payout toast, the leaderboard | "A maintainer escrows USDC on an issue. Any agent in the office takes it. A human merges, an admin approves, and the Solana program pays. The same merge is attested on Base." |
| 1:25-1:45 | You, then the two explorers side by side | "Solana because a five-dollar bounty has to cost nothing to pay and be fundable from a link. Base because reputation should be a public record any tool can read, not a profile." |
| 1:45-2:05 | You, then the counts card from data/counts.json | "Where we are, from chain data, today: (read the counts card). All on testnets, all checkable." |
| 2:05-2:20 | You on camera | "The business is open core: a hosted mission control seat for teams running agent fleets, and later a one to two percent fee on released bounties, after an audit." |
| 2:20-2:30 | Card: Proof of Merge, the fork link, built on agent-office by webdevcody (MIT) | "We want feedback from teams running agents, and repos willing to fund five issues. Built on agent-office by webdevcody, MIT. Thank you." |

## Technical demo

Screen with voice. Record 2026-10-09, after a dry run on 2026-10-08.

Runtime target: 2:50 (limit: 3:00)

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:20 | dial.to with the Fund this issue Blink for issue #N; Phantom on devnet signs 5 USDC | "A maintainer funds an issue from a link. The office built the transaction; only the funder's wallet signs it, on devnet." |
| 0:20-0:40 | The office: the issue card now shows the bounty chip; a Claude Code worker at a desk takes the issue | "The bounty shows on the board. Any worker can take it: Claude Code, Codex, Cursor or Pi." |
| 0:40-1:00 | The worker's terminal; the PR opens; the desk shows the PR | "The worker opens a pull request on the repository itself. A fork's PR never counts." |
| 1:00-1:15 | GitHub: a maintainer reviews and merges | "A person with write access merges it on GitHub. A bot's merge would earn nothing." |
| 1:15-1:30 | Review inbox: Approve payout of 5 USDC; the admin presses it | "Nothing moves until an office admin approves the payout in the review inbox." |
| 1:30-1:45 | Payout toast; click through to the release on Solana Explorer (devnet) | "Two signatures, the attester's and the approver's, and the program releases the escrow to the operator's wallet." |
| 1:45-2:00 | base-sepolia.easscan.org: the attestation; Basescan: the ERC-8004 feedback transaction | "The same merge is attested on Base Sepolia with EAS, and the agent gets ERC-8004 feedback that points back at it." |
| 2:00-2:10 | /pom/ leaderboard: the row updates, its explorer link | "The public board picks it up. Every row links to its proof." |
| 2:10-2:30 | Terminal: curl to /api/x402/task gets 402; the payer signs; 202 held; the admin approves on the queue board | "Outsiders can hire a worker for one task over x402. One request, a 402, a signed payment, and the task waits, held, until an admin approves." |
| 2:30-2:50 | Code tour: the program's release instruction and the dual-signature check, `Floor.officePull`'s fork guard | "The code: the release needs both signers, and the office refuses forks before any of this starts. MIT, on top of agent-office by webdevcody." |

## Shot list and fallbacks

Record each step on its own first, the day before, so a slow RPC on recording day costs a cut instead of a retake. Each fallback is a real recording of the same step, never a mock-up.

| Step | What must exist first | Fallback if it is slow or down |
| --- | --- | --- |
| Blink on dial.to | The office reachable over HTTPS (a tunnel); the repository opted in for the public Action; a funder wallet with devnet SOL and devnet USDC or the test mint | The board's Fund window signing the same transaction in Phantom |
| Worker takes the issue | A public demo repository with the issue open; a worker with its sign-in | The 2026-10-08 dry-run recording |
| PR and merge | A second GitHub account with write access to merge (the operator's own merge would show as `self`) | Dry-run recording |
| Approve payout | Bounties on in Settings, devnet chosen, attester and approver key paths set, the operator's payout wallet set | Dry-run recording |
| Payout on Explorer | Devnet SOL on the attester for fees | The released demo bounty: https://explorer.solana.com/tx/2rPSWQv7YSWkEwJWNJtGtpeN8WYQzHXvbPz8xb9dCbEz8LnpatSZaoYHyyyq7dgUCkmWHrU4ywFc29HPYa73ZtUc?cluster=devnet (say it is the demo bounty) |
| EAS and ERC-8004 | `--attest --reputation`; the registrar funded with Base Sepolia ETH (a manual faucet step) | The schema page: https://base-sepolia.easscan.org/schema/view/0x368e9023c13393aea075e78cae18e804725b0d1bb3e2b1a6c1117d759a01a900 |
| Leaderboard | The showcase turned on in Settings, or the static export | The indexer on the command line (`npm run index` in onchain/indexer) |
| x402 | `--x402` with a payer key file holding Circle test USDC on Base Sepolia | The same flow against local anvil and the mock facilitator (`onchain/x402`, `test/office.test.ts`), labelled "local" on screen |

## Weekly update videos

One to two minutes, phone camera is fine, posted with the day's thread.

- Update 1 (2026-10-04): what the fork is and who built the office it stands on; the escrow state machine; the program on devnet with its Explorer link; what's next (the first bounty from the board).
- Update 2 (2026-10-08): the Blink and x402 working; the first leaderboard numbers from data/counts.json with their n and the caveat that small samples show no rate; what we learned; the invite to point agents at the funded issues.
