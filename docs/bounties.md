# Proof of Merge bounties

Back to the [README](../README.md).

A maintainer escrows devnet USDC against a GitHub issue. Any worker in the office can take the issue. The money moves only when a person with write access merges the worker's pull request and an office admin approves the payout in the review inbox. Then the Solana program pays the escrow to the wallet of the person who hired the worker.

Testnets only: Solana devnet, or an in-memory mock. There is no mainnet setting anywhere, the SDK checks the RPC's genesis hash is devnet's before it signs anything, and the program only accepts devnet USDC (and a test mint in test builds). Bounties are off until an admin turns them on.

This is part of the Proof of Merge fork of [agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, by webdevcody / AgentSystemLabs). The program and its SDK live in [onchain/solana](../onchain/solana/README.md), which has its own build and tests.

## How a bounty moves

| Step | Who | What the office checks first |
| --- | --- | --- |
| Open and fund | anyone, from the board's **Fund** button or the public "Fund this issue" Action | the repository is a floor (or, for the Action, one an admin opted in); the amount is at most 100,000 |
| Claim | the office's attester key | the PR is the office's own (`Floor.officePull`: made by an office worker on the repository itself, never a fork) and it closes the issue; the worker's owner has a payout wallet |
| Waiting for approval | the office, on every look at the floor's PRs | GitHub is asked again who merged it: a `User` (not a `Bot` or an app) with `write`, `maintain` or `admin` permission; the PR still closes the issue and still isn't from a fork |
| Release | the attester and the approver key together | an office admin pressed **Approve payout** in the review inbox; the approver key is loaded to sign only after that admin check |
| Refund | anyone, after the expiry | nothing is released; each funder's contribution goes back to them, one per transaction |

With no payout wallet set, the bounty stays unclaimed and the review inbox shows *Set your payout wallet*. A merge that fails a check (a bot merged it, or someone without write access, or the PR doesn't close the issue) never reaches the inbox, approved or not.

Every step is a transaction, and its signature goes on the floor's timeline: *bounty-funded*, *bounty-claimed*, *bounty-paid*, *bounty-refunded*, each with a link to the devnet explorer. A payout is also a toast for everyone on the floor.

## In the office

- **Issue cards** on the board show a bounty's amount, phase and time left, and a **Fund** button. It opens a window where a Wallet Standard wallet (Phantom, Backpack, Solflare) signs the transaction the office built, or copies the Blink link (dial.to, devnet).
- **Desks**: a worker holding a claimed bounty shows its amount on its card.
- **Review inbox** (Mission control, **3**): *Approve payout of N USDC to <worker> for PR #x* for admins, and *Set your payout wallet* for whoever's worker claimed without one.
- **Settings > Bounties**: everyone sets their own payout wallet (an address, never a key). Admins turn bounties on, choose Solana devnet or the mock, and set the program id, the mint, the attester and approver key paths, the repositories the public Action may fund, how many days a new bounty runs, and whether the public Action shows issue titles (off by default, for private repositories).

Settings are kept in `chain.json` and each floor's bounties in `bounties.json` in the office's data folder, both written through the office's state-file helpers (`safefs.ts`).

## The "Fund this issue" Action

A Solana Action (a Blink) for repositories an admin opted into:

| Route | What it does |
| --- | --- |
| `GET /actions.json` | the Actions rules file; 404 while bounties are off |
| `GET /api/actions/fund?repo=owner/name&issue=N` | title, icon, the issue (or just `owner/name#N`), the current total, and buttons for 5, 20 and 50 USDC plus a custom amount |
| `POST /api/actions/fund?repo=...&issue=...&amount=...` | an unsigned transaction for the `account` in the body: open the bounty if there isn't one, then fund it |

The routes are public, since a wallet or dial.to asks without a session, but the host check still runs first, they answer with the CORS headers the Actions spec asks for, and each client address gets 30 requests a minute. The transaction only moves the funder's own tokens, and only their wallet signs it.

To try it on dial.to, the office has to be reachable over HTTPS (for example through a tunnel or a deployed office): open `https://dial.to/?action=solana-action:<office>/api/actions/fund?repo=owner/name%26issue=N&cluster=devnet`. The Fund window's **Copy the Blink** gives that link. Nothing depends on an X (Twitter) unfurl.

## Setting it up on devnet

1. Build the SDK the office loads: `cd onchain/solana && npm install && npm run build`.
2. Make the testnet keys and deploy (see [onchain/solana/README.md](../onchain/solana/README.md#keys)). `scripts/e2e.sh devnet` deploys the program, creates the test mint and runs one bounty end to end. The program id is in `onchain/solana/deployments/devnet.json`.
3. In **Settings > Bounties**, turn bounties on, pick Solana devnet, paste the program id, and set the mint (empty for devnet USDC, or the test mint if the program was built with `test-mint`).
4. Each person sets their payout wallet. Admins add the repositories the public Action may fund.

The office talks to `api.devnet.solana.com` and nowhere else for bounties. RPC calls go through the network guard (`guardedFetch`: public addresses only, no redirects) and read at most 8 MB. Tests against a local `solana-test-validator` let loopback through explicitly; the default never does.

## Keys and what they can do

| Key | Where (default) | Used for |
| --- | --- | --- |
| Attester | `~/.config/agent-office-chain/solana-attester.json` | signs claims and vouches for merges; read when bounties are turned on |
| Approver | `~/.config/agent-office-chain/solana-approver.json` | the second signature on a release; only its address is kept when bounties are turned on, and the key is read again to sign only after an admin approves |

Both files must be mode 0600 or the SDK refuses them, and no key bytes go in a log or an error. The program needs both signatures for a release, so a stolen attester key alone can't pay anyone.

Workers run as the same OS user as the office, so a worker could read these files: environment scrubbing (`workers/env.ts`) doesn't protect files on disk. Use dedicated testnet keys with nothing of value on them. Moving the approver key to a separate machine or a hardware wallet would close that gap and is not done yet.

## The same merge on Base Sepolia

With `--attest`, the merge that pays a bounty is also attested on Base Sepolia, and the attestation carries the payout's devnet signature when the payout went out first. Office PRs without a bounty are attested too. See [Proof of merge on Base Sepolia](proof-of-merge.md). With `--reputation`, the agent's ERC-8004 feedback for a merge whose bounty was paid carries the tag `paid`, and what each operator earned shows on the board (see [Agent reputation from merges](reputation.md)).

## Where the code is

| Piece | File |
| --- | --- |
| Program and SDK | `onchain/solana/` |
| Office service (claims, merge checks, payouts, the Action's payloads) | `src/server/bounties.ts` |
| Loading the SDK, the guarded RPC fetch | `src/server/chain/sdk.ts` |
| Who merged, asked fresh from GitHub | `src/server/chain/merge-proof.ts` |
| Settings and per-floor state | `src/server/chain/settings.ts`, `src/server/chain/store.ts` |
| Public Action routes | `src/server/http/routes/actions.ts` |
| Messages (`bounty.list`, `bounty.fund.prepare`, `bounty.approve`, `bounty.refund`, ...) | `src/shared/protocol/bounties.ts`, handled in `src/server/ws/handlers/bounties.ts` |
| Review inbox rows | `src/shared/review.ts` |
| Board chips, Fund window, wallet, settings pane | `src/client/ui/bounty.ts`, `wallet.ts`, `bounty-settings.ts` |
| Tests | `tests/bounties.test.ts`, plus the package's own in `onchain/solana` |

## Status

- The program, the SDK and the office side pass their tests: 27 Rust host tests, 48 SDK tests (7 of them litesvm runs of the built program), and the office's bounty tests in `npm test`.
- One bounty ran end to end (open, fund, claim, release) on a local `solana-test-validator`, signatures in `onchain/solana/deployments/localnet.json`.
- Devnet: see `onchain/solana/deployments/devnet.json`. The deploy waits on devnet SOL for the deployer when the CLI faucet is rate limited.
- Not audited. Testnet only.
