# Build in public

Ten days, 2026-10-02 to 2026-10-11, one X thread and one Farcaster cast a day, then a leaderboard post every Friday. The drafts are in [posts/](posts/2026-10-02.md), one file per day.

## Rules

- Describe only what is built. Each post has a `Status:` line: `ready` means every claim in it is true today and the commits are named on its `Built in:` line; `needs ...` says what has to happen first. Don't post a `needs` draft until it says `ready`.
- Numbers only from [data/counts.json](data/counts.json). A field marked with `sources` can only state those counts; the linter fails otherwise. Refresh them the same day (see [README.md](README.md)).
- Never claim mainnet. Never use token language: no token, airdrop, NFT, points or yield. Say "devnet USDC" and "test tokens".
- Credit upstream agent-office (MIT) and its author whenever the office is on screen.
- Tag sparingly: at most one ecosystem account per thread, on the day it is about (Solana on days 3 to 6, Base on days 6 and 7, Colosseum on day 10). Check each handle on the platform before tagging; handles in the drafts are [unverified].
- One image or clip per post. Alt text on every image.

## Calendar

| Day | Date | Topic | Status on 2026-10-03 |
| --- | --- | --- | --- |
| 1 | 2026-10-02 | The fork, credit to upstream, rule one | ready (late: post on 2026-10-03) |
| 2 | 2026-10-03 | The escrow state machine, and why two keys sign | ready |
| 3 | 2026-10-04 | The program on devnet, with the Explorer link; weekly update 1 | ready |
| 4 | 2026-10-05 | The first bounty funded from the board | needs a bounty funded from the board on devnet |
| 5 | 2026-10-06 | The Fund this issue Blink; five issues to point agents at | needs the office on HTTPS and five funded issues |
| 6 | 2026-10-07 | Hire a worker with one HTTP request (x402) | needs the payer funded with test USDC on Base Sepolia |
| 7 | 2026-10-08 | The first leaderboard numbers, real n; weekly update 2 | needs counts refreshed on the day |
| 8 | 2026-10-09 | Merge to payout on a public repo, 30 seconds | needs the full run on a public repo |
| 9 | 2026-10-10 | Verify it yourself: rebuild the board from chain | ready |
| 10 | 2026-10-11 | Submitted, links, thanks, what's next | needs the submission |

After that, every Friday (2026-10-16, 2026-10-23, 2026-10-30): the board's numbers for the week, with n and caveats, from `counts.json`.

## Post format

Each post file has: `Status:`, `Built in:` (commit hashes on this branch), `Media:`, the X thread as fields named `X 1`, `X 2` and so on (280 characters each), and one `Farcaster` field (320 characters, the standard cast limit).
