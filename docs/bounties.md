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
| Release | the attester and the approver together | an office admin pressed **Approve payout** in the review inbox, before the bounty's expiry; GitHub is asked once more. With an approver wallet the attester signs and the admin's browser wallet adds the approver's signature; with an approver key file, that key is loaded to sign only after the admin check |
| Refund | after the expiry, an admin from the office (the attester pays the fees), or anyone with the CLI | nothing is released; each funder's contribution goes back to them, one per transaction |
| Cancel | an empty bounty's creator or the approver; a funded, unclaimed one only the approver | the program refuses anyone else |

A payout has to be approved before the bounty expires: after that the program refuses the release and opens the refunds, whatever merged. The review inbox row shows the time left, and the office warns admins a day before.

The office only ever deals with its own bounties: ones opened with its attester and approver, in its mint. Both keys are part of a bounty's address (its seeds are the repository's hash, the issue, a nonce, the attester and the approver), so someone who opens a bounty for the same issue with keys of their own gets a different address, and the office neither shows it, funds it nor follows it. A bounty past its expiry takes no more money: funding then opens the next one (a new nonce), and the old one can still be refunded. While a merge waits for approval, or is blocked or being paid, the issue takes no new funding, from the office or the Blink.

Things that can go wrong on the way, and what the office does:

- A release that lands after the office stopped waiting for it (a confirm that timed out, a restart, an approver wallet that sent it) is read off the chain on the next look and recorded as paid, with its signature, on the timeline.
- A payout that never landed (the office stopped between *paying* and the release) goes back to *awaiting approval*, with a note.
- Two admins approving at once: only one release goes out.
- GitHub failing while the office checks who merged keeps the bounty claimed, to be checked again; it is never blocked for that. A blocked merge is looked at again every ten minutes while the chain still holds the bounty.
- If another office PR for the issue merges while the claimed one is still open, the claim moves to the merged one.
- A merged PR that has dropped off the board's list (it only holds the last 30) can still be approved.

With no payout wallet set, the bounty stays unclaimed and the review inbox shows *Set your payout wallet*. A merge that fails a check (a bot merged it, or someone without write access, or the PR doesn't close the issue) never reaches the inbox, approved or not.

Every step is a transaction, and its signature goes on the floor's timeline: *bounty-funded*, *bounty-claimed*, *bounty-paid*, *bounty-refunded*, each with a link to the devnet explorer. A payout is also a toast for everyone on the floor.

## In the office

- **Issue cards** on the board show a bounty's amount, phase and time left, and a **Fund** button. It opens a window where a Wallet Standard wallet (Phantom, Backpack, Solflare) signs the transaction the office built, or copies the Blink link (dial.to, devnet).
- **Desks**: a worker holding a claimed bounty shows its amount on its card.
- **On the deck** (the 3D office): the escrow vault on the Proof corner carries a stack of violet coins for each bounty still in escrow, as tall as its amount, its state as a shape round it, under a label with each one's issue, amount and state, the network (*devnet test USDC*) and what's held and paid; a funded issue's row on the Issues board shows its amount with a coin over it; and a payout's coins fly from the vault to the console of the unit that earned it, where a receipt shows the amount and the devnet transaction. All of it is drawn from the floor's real bounties ([the design](design.md#bounty-tokens)).
- **Review inbox** (Mission control, **3**): *Approve payout of N USDC to <worker> for PR #x*, with the time left before the bounty expires, for admins, and *Set your payout wallet* for whoever's worker claimed without one.
- **Settings > Bounties**: everyone sets their own payout wallet (an address, never a key). Admins turn bounties on, choose Solana devnet or the mock, and set the program id, the mint, the attester key path, the approver (a wallet address, recommended, or a key path), the repositories the public Action may fund, how many days a new bounty runs, and whether the public Action shows issue titles (off by default, for private repositories).

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
| Approver wallet (recommended) | an admin's browser wallet (Phantom, Backpack, Solflare), its address in Settings | the second signature on a release: **Approve payout** hands the admin's wallet a release the attester already signed, and the wallet signs, pays the fee and sends it |
| Approver key (instead) | `~/.config/agent-office-chain/solana-approver.json` | the same signature from a file; only its address is kept when bounties are turned on, and the key is read again to sign only after an admin approves |

Key files must be mode 0600 or the SDK refuses them, and no key bytes go in a log or an error. The program needs both signatures for a release.

Workers run as the same OS user as the office, so a worker could read key files in that folder: environment scrubbing (`workers/env.ts`) doesn't protect files on disk. With an approver key file, both release keys sit on that one machine, and an agent that is tricked into reading them could claim a bounty for its own wallet and release it, around the admin's approval. With an approver wallet, the approver's key never touches the office's machine, so a payout always needs an admin's wallet to sign. Use an approver wallet, and dedicated testnet keys with nothing of value on them.

Who merged goes into the Release event as a pseudonym: an HMAC of the GitHub user id under a secret the office keeps in its data folder (`merger-pseudonym.secret`, mode 0600), the same value its attestations on Base Sepolia use. GitHub ids are sequential, so a plain hash of one could be reversed by trying them all; this one can't without the secret.

## Without the office: the GitHub Action

A repository can use the escrow without running an office at all. [onchain/action](../onchain/action/README.md) is a JavaScript action a maintainer adds to a workflow on `pull_request` closed. When a pull request from the repository itself (never a fork) is merged by a person with write access, it finds the live bounty of each issue the pull request closes (`Closes #N`), opened with the repository's attester and approver, and signs the claim for the author's wallet, taken from a reviewed `.github/bounty-wallets.json` or a `Bounty-Wallet:` line in the pull request. The checks are the SDK's, the same the office runs.

The release still needs the approver, in one of three ways the action's README weighs against each other:

- **Manual** (recommended): the action prepares the release on the approver's durable nonce account and posts it on the pull request; the approver checks and co-signs it on their own machine with `ao-bounty cosign`. The approver key never enters GitHub.
- **Gated**: the approver key is an environment secret behind required reviewers, and a release job waits for one of them to approve.
- **Automatic**: the approver key is a repository secret and the same run pays, which leaves no second pair of eyes against anyone with write access.

The action can also write the Base Sepolia attestation for the merge. Keys reach it only as GitHub encrypted secrets.

## The same merge on Base Sepolia

With `--attest`, the merge that pays a bounty is also attested on Base Sepolia, and the attestation carries the payout's devnet signature when the payout went out first. Office PRs without a bounty are attested too. See [Proof of merge on Base Sepolia](proof-of-merge.md). With `--reputation`, the agent's ERC-8004 feedback for a merge whose bounty was paid carries the tag `paid`, and what each operator earned shows on the board (see [Agent reputation from merges](reputation.md)).

## Where the code is

| Piece | File |
| --- | --- |
| Program and SDK | `onchain/solana/` |
| The GitHub Action (no office needed) | `onchain/action/` |
| Office service (claims, merge checks, payouts) | `src/server/bounties.ts` |
| Funding and the Action's payloads | `src/server/chain/funding.ts` |
| The merger pseudonym and its secret | `src/server/chain/pseudonym.ts` |
| Loading the SDK, the guarded RPC fetch | `src/server/chain/sdk.ts` |
| Who merged, asked fresh from GitHub | `src/server/chain/merge-proof.ts` |
| Settings and per-floor state | `src/server/chain/settings.ts`, `src/server/chain/store.ts` |
| Public Action routes | `src/server/http/routes/actions.ts` |
| Messages (`bounty.list`, `bounty.fund.prepare`, `bounty.approve`, `bounty.release.sent`, `bounty.refund`, ...) | `src/shared/protocol/bounties.ts`, handled in `src/server/ws/handlers/bounties.ts` |
| Review inbox rows | `src/shared/review.ts` |
| Board chips, Fund window, wallet, settings pane | `src/client/ui/bounty.ts`, `wallet.ts`, `bounty-settings.ts` |
| Tests | `tests/bounties.test.ts`, plus the package's own in `onchain/solana` |

## Status

- The program, the SDK and the office side pass their tests: Rust host tests, SDK tests (some of them litesvm runs of the built program), and the office's bounty tests in `npm test`.
- One bounty ran end to end (open, fund, claim, release) on a local `solana-test-validator`, signatures in `onchain/solana/deployments/localnet.json`.
- Devnet: the program is deployed (`JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6`) and was upgraded in place on 2026-10-03 to put the attester and approver in a bounty's seeds. Demo bounties ran open, fund, claim and release there before and after the upgrade, one of them paid through the approver-wallet path, all with no GitHub merge behind them; signatures in `onchain/solana/deployments/devnet.json`.
- The GitHub Action passed its unit tests and an end-to-end run against `solana-test-validator`, and ran once live on devnet against a fake GitHub API: claim, a release prepared on the approver's durable nonce, and the approver's cosign. It has not run from a real repository's workflow yet (see [onchain/action](../onchain/action/README.md#status)).
- The devnet upgrade authority is a single key, so whoever holds it could replace the program: this deployment is not custody-free. A mainnet deployment would need a multisig upgrade authority first, then none.
- Not audited. Testnet only.
