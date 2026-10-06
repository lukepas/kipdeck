# Technical demo script

For the Colosseum Crypto World's Fair. Screen recording with the founder's voiceover. Target 2:55, hard limit 3:00 (Colosseum: "no more than three minutes").

A silent 2:58 cut of these beats, with the voiceover as captions and a 60 s 9:16 highlight, is made from the real office by the scripts in [capture/](capture/README.md). Inside the office it shows a seeded demo crew and replays the merge and the payout, and each shot is tagged as real or demo data. Use it to rehearse the voiceover, or as the fallback if the day's take fails.

Last checked: 2026-10-07, against Colosseum's hackathon FAQ (https://colosseum.com/hackathon) and their submission guide (https://blog.colosseum.com/perfecting-your-hackathon-submission/).

## What Colosseum asks for

The demo is about how it works, not why. Their guide asks for something "technical, direct, and specific to implementation": the core features you built, the tech stack, why you chose each part, and how the Solana integration, on-chain logic and architecture fit together. Interface walkthroughs and architecture visuals are welcome. Don't turn it into a second pitch.

So: the bridge gets ten seconds, then every beat shows one real action and names the mechanism behind it.

## Ground rules

- Say "devnet" or "Base Sepolia" whenever money or an attestation is on screen.
- Every transaction shown is real. If a step is slow on the day, use the fallback recording of the same step (see the shot list) and say which run it is, never a mock-up.
- Show agent-office's credit on screen once (the closing card).
- Nothing secret on screen: no key files, no office password or sign-in link from the terminal, no `.env`, no email addresses. Recording setup for this is in `recording-guide.md`.

## Before recording day

The dry run is 2026-10-08, the recording 2026-10-09.

- [ ] Office running over HTTPS (the tunnel) with the demo deck `zbagdzevicius/ugc-army-demo` open, started with `--attest --attest-repos zbagdzevicius/ugc-army-demo --reputation --x402 --x402-pay-to <office Base Sepolia address> --x402-repos zbagdzevicius/ugc-army-demo`. Check in the dry run that the flags combine as expected; `docs/configuration.md` has every flag.
- [ ] Settings > Bounties: bounties on, Solana devnet, approver set to your Phantom address (with a little devnet SOL), your payout wallet set.
- [ ] Settings > Bounties > Public showcase on (admins only), so `/pom/` is served.
- [ ] Issues #1, #2 and #3 on ugc-army-demo funded on devnet (they are; check they have not expired).
- [ ] PR #4 (closes #1, opened by an office unit) still open. It must be merged on camera by a second GitHub account with write access. Your own account merging it is recorded as `self` and shown apart on the board.
- [ ] The GitHub Action workflow (`onchain/action/examples/bounty.yml`) added to ugc-army-demo, pinned to a commit SHA, if you want beat 10 to show a real run. Until then it has only run against a fake GitHub API, and the voiceover says so.
- [ ] x402 payer key file with Base Sepolia test USDC (it held 19.90 after 2026-10-04).
- [ ] Browser: a clean profile, bookmarks bar hidden, zoom so text reads at 1080p. Add `?demo=1` to the office's address for bigger type and callouts.

## Timed script

About 400 spoken words. Each row: what you do, what the viewer sees, and the line you record. Record the voiceover after the screen capture, to picture (see `recording-guide.md`).

### 1. The bridge and attention at a glance (0:00-0:15)

Action: open `https://<office>/?demo=1`. Let the arrival play for two seconds, press any key to land. Walk to the captain's chair, press E to sit. Hold on the Attention board.

On screen: the arc with the Attention board in the middle; one unit carded as needs-you, the WORKING chip, the top bar counters.

> This is UGC Army, a fork of agent-office. Every coding agent on the team is a unit at a console.
> One function, attention.ts, ranks them: needs you, stuck, to review, working.
> The board, the top bar, the tab title and the 2D view all read that one ranking.

Lower third for 3 s: "TypeScript, three.js, Node. Solana devnet: native Rust program. Base Sepolia: EAS, ERC-8004, x402."

### 2. Hire an agent for a funded issue (0:15-0:35)

Action: stand up, walk to the arc's Issues board (or open it from the Tab menu). Point at issue #2 with its violet coin and amount. Open its card: show the bounty phase, time left and the Fund button (open the Fund window for a second to show the wallet signing and the Blink link, then close it). Walk to a free console, press E, deploy Claude Code, then P and give it issue #2 in ugc-army-demo.

On screen: the issue row with its devnet amount, the escrow vault on the Proof corner with its coin stacks, the new unit sitting down.

> Issue two on our public demo repo carries a devnet USDC bounty.
> It sits in a program-owned vault, one per bounty, that the office opened with its attester and approver keys.
> Anyone can fund it from the board, or from a Blink, where only the funder's wallet signs.
> I'll put a Claude Code unit on it. It works in its own git worktree.

### 3. The agent's pull request (0:35-0:52)

Action: open the new unit's terminal for two seconds to show it working, close it. Then cut to PR #4 on GitHub, which an office unit opened earlier for issue #1. Show the head branch is on the repo itself and the body says "Closes #1". Back in the office, show the unit holding the claim with its amount on its card.

On screen caption: "PR #4 was opened by an office unit earlier, for issue #1."

> While that runs, here's one an office unit finished earlier, for issue one.
> The office opened it on the repository itself. A pull request from a fork never counts, whatever its branch is called.

### 4. The human merge (0:52-1:05)

Action: in a second browser profile signed in as the reviewer account (write access), approve and merge PR #4.

> A person merges it. The office then asks GitHub fresh: was it merged, by a user, not a bot,
> and does that user have write access? A merge by the agent's own operator is labelled self.

### 5. Admin approval in the review inbox (1:05-1:20)

Action: back in the office, press I, then 3 for Review. Show the row "Approve payout of N USDC to <unit> for PR #4" with the time left. Press approve. Phantom pops up on devnet: sign.

> Nothing moves yet. The payout waits in the review inbox until an admin approves it,
> and the approval is a signature from the admin's own browser wallet,
> so no key on the office's machine can pay anyone alone.

### 6. The devnet payout and its explorer link (1:20-1:42)

Action: the payout toast appears with the devnet transaction; the coins fly from the vault to the unit's console. Click the toast's link: Solana Explorer, cluster devnet, the release transaction with the program id `JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6`. Then 3 s on the README's "How it fits together" diagram.

> The release lands on Solana devnet. The program is native Rust, no Anchor.
> Release checks two signers, the attester who vouched for the merge and the approver,
> then moves the escrow to the operator's wallet.
> If nobody releases it before expiry, anyone can crank the refund back to each funder.

### 7. The Base Sepolia attestation (1:42-1:57)

Action: open base-sepolia.easscan.org on the new attestation (the office's timeline links to it), then Basescan on the ERC-8004 feedback transaction.

> The same merge is attested on Base Sepolia with EAS: the outcome, the merge commit, the harness, the time to merge.
> Reverts and closes get attested too. And the agent gets ERC-8004 feedback that points back at it.

### 8. The reputation leaderboard (1:57-2:10)

Action: open `https://<office>/pom/`. Show the row for the unit's harness with merge rate, time to merge and its explorer link; click one link.

> The public board at slash pom is rebuilt from chain data alone. Every row links to its proof,
> and it only counts attesters you choose to trust, since anyone can write to a public schema.

### 9. An x402 paid task (2:10-2:27)

Action: terminal (font large, prompt short). Run `curl -i -X POST https://<office>/api/x402/task -H 'content-type: application/json' -d '{"repo":"zbagdzevicius/ugc-army-demo","issue":3}'` and hold on the `402` line. Then `npx tsx src/cli.ts pay https://<office> --repo zbagdzevicius/ugc-army-demo --issue 3 --max 0.10` in `onchain/x402`: `202`, status held. Back in the office, the queue board shows the paid task; approve it as admin.

> An outsider, a person or another agent, can hire a worker for one task over x402.
> The first request gets a 402. The payer signs a USDC authorization, x402.org settles it on Base Sepolia,
> and the task waits, held, until an admin approves.

### 10. The GitHub Action (2:27-2:42)

Action: show `onchain/action/examples/bounty.yml` with `uses: ...@<sha>`, then a run's job summary on ugc-army-demo if one exists.

[If the Action has run on ugc-army-demo:]

> A repository can skip the office entirely. This GitHub Action runs the same merge checks on merge,
> signs the claim, and keeps the approver's key out of GitHub. It's pinned to a commit, because it holds a key.

[If it has not:]

> A repository can skip the office entirely. This GitHub Action runs the same merge checks and signs the claim.
> So far it has run once on devnet, against a test GitHub API. It's pinned to a commit, because it holds a key.

### 11. Security and open source (2:42-2:55)

Action: quick cuts: `docs/security.md` headings, the worker environment allowlist in `src/server/workers/env.ts`, then the closing card.

Closing card: "UGC Army. Testnets only: Solana devnet and Base Sepolia. Built on agent-office by webdevcody (MIT). github.com/<fork>"

> Keys are dedicated testnet keys in owner-only files, and workers never get them in their environment.
> The clients check the chain before they sign. Nothing is audited yet, so it stays on testnet.
> It's all MIT, built on agent-office by webdevcody. Thanks for watching.

## Shot list

Record each step on its own during the 2026-10-08 dry run, so a slow RPC on the day costs a cut, not a retake.

| # | Shot | Concrete action in the app | Length | Fallback |
| --- | --- | --- | --- | --- |
| 1 | Arrival and captain's chair | `?demo=1`, any key to land, E at the chair | 15 s | Dry-run take |
| 2a | Issues board with the bounty | Walk to the arc, or Tab menu > Issues; issue #2 row with coin and amount | 6 s | Dry-run take |
| 2b | Fund window | Fund on issue #2's card, show Phantom and the Blink link, close with Esc | 4 s | Skip; the voiceover still covers the Blink |
| 2c | Hire a unit | E at a free console, deploy Claude Code; P, task issue #2 | 8 s | Dry-run take |
| 3a | Unit's terminal | Click the unit, its terminal for 2 s, Esc | 3 s | Dry-run take |
| 3b | PR #4 on GitHub | Conversation tab, head branch, "Closes #1" | 6 s | None needed |
| 3c | Claim on the unit's card | Hover or walk up to the unit with the amount on its card | 4 s | Dry-run take |
| 4 | Merge | Reviewer profile: approve, merge PR #4 | 10 s | Cannot be redone: merge only once, on the real take |
| 5 | Review inbox | I, then 3; Approve payout; Phantom signs on devnet | 12 s | Dry-run take of another bounty |
| 6a | Toast and coins | Wait for the toast; coins fly to the console | 6 s | Released demo bounty, say so: https://explorer.solana.com/tx/2rPSWQv7YSWkEwJWNJtGtpeN8WYQzHXvbPz8xb9dCbEz8LnpatSZaoYHyyyq7dgUCkmWHrU4ywFc29HPYa73ZtUc?cluster=devnet |
| 6b | Explorer | Click the toast's link | 8 s | Same link as 6a |
| 6c | Architecture | README "How it fits together" diagram | 3 s | None needed |
| 7a | easscan | The attestation from the timeline link | 8 s | Schema page: https://base-sepolia.easscan.org/schema/view/0x368e9023c13393aea075e78cae18e804725b0d1bb3e2b1a6c1117d759a01a900 |
| 7b | ERC-8004 | Basescan on the feedback transaction | 5 s | Reputation registry: https://sepolia.basescan.org/address/0x8004B663056A597Dffe9eCcC1965A193B7388713 |
| 8 | Leaderboard | `/pom/`, the row, click its explorer link | 12 s | `npm run index` in `onchain/indexer` on the command line |
| 9a | 402 | curl in a terminal | 5 s | Dry-run take |
| 9b | Pay | `onchain/x402` CLI pay; 202 held | 6 s | The 2026-10-04 payment: https://sepolia.basescan.org/tx/0x490896509be59e45e7d14afbaa3ec24c18db5292f4ea1c71cf79533670d126dc |
| 9c | Admin approves | Queue board, Approve on the held task | 5 s | Dry-run take |
| 10 | GitHub Action | `bounty.yml`, then a job summary | 15 s | `onchain/action/README.md` "What a run does" table |
| 11 | Security, open source, end card | `docs/security.md`, `env.ts`, end card | 13 s | None needed |

## If you are over three minutes

Cut in this order: 2b, 3a, 6c, 7b, 9c. Never cut 4, 5 or 6b; the merge, the approval and the explorer link are the proof.
