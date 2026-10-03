# Bounty escrow on Solana (devnet)

Bounties for GitHub issues, paid to the agent operator only when a person merges the office's pull request for the issue and an office admin approves the payout. Anyone opens and funds a bounty; each funder can take their own money back if nothing is released by the expiry. Every change of state is logged as an event, so the record can be rebuilt from the chain alone.

This is part of the Proof of Merge fork of [agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, by webdevcody / AgentSystemLabs). Upstream doesn't ship this escrow. The folder is self-contained: its own Cargo workspace and its own `package.json`. The office uses it through the chain settings (see [docs/bounties.md](../../docs/bounties.md)); [PITCH.md](PITCH.md) is the case for it.

Testnets only. The SDK has no mainnet cluster option, checks the RPC's genesis hash is devnet's before it signs anything, and the program only accepts devnet USDC (plus a test mint in test builds).

## What's here

| Path | What it is |
| --- | --- |
| `programs/bounty-escrow-core` | Accounts, instructions, events and errors as bytes, and every rule about when a bounty may move (`machine.rs`). No Solana dependencies: plain `cargo test` |
| `programs/bounty-escrow` | The native program (solana-program 2.3, no Anchor): checks accounts, moves SPL tokens with hand-encoded Token and Associated Token instructions, logs events |
| `programs/bounty-escrow/tests` | The processor end to end on a host harness that stands in for the System, Token and Associated Token programs |
| `fixtures/transitions.json` | The table of cases both the Rust and the TypeScript state machines must agree on |
| `fixtures/vectors.json` | One of each account, instruction and event as bytes, plus PDAs for a fixed program id: both sides are tested against it |
| `sdk/src` | TypeScript SDK with no runtime dependencies: `SolanaEscrow`, `MockEscrow` (same rules, in memory), builders, `decodeEvents`, the `Attester` checks, the Action (Blink) payloads, the `ao-bounty` CLI |
| `sdk/tests` | SDK tests, including litesvm runs of the built `.so` |
| `scripts/e2e.sh` | Deploy, make the test mint and run one bounty end to end on localnet or devnet, recording the signatures |
| `deployments/` | Program ids and recorded end-to-end runs per cluster |

## Build and test

```bash
cargo test --workspace          # state machine table, layouts, the processor on the host harness
npm install                     # dev dependencies only (TypeScript, tsx, litesvm, web3.js for cross-checks)
npm run build:program           # cargo build-sbf --features test-mint -> target/deploy/bounty_escrow.so
npm run typecheck
npm test                        # SDK tests, some of them litesvm runs of the .so
npm run build                   # sdk/dist, which the office loads
```

`cargo build-sbf` comes with the Solana CLI (Agave). This was built with Agave 4.3 and platform-tools v1.57; host tests run on Rust 1.81. `Cargo.lock` pins a few crates to releases that still build on 1.81. The SDK's litesvm tests skip (and say so) until the `.so` is built.

## How it works

### Accounts

| Account | Seeds | Holds |
| --- | --- | --- |
| Bounty | `"bounty"`, sha256 of `owner/name` lowercased, issue number (u64 LE), nonce (u8), attester, approver | state, mint, vault, repo hash, issue, attester, approver, creator, created and expiry times, total, funder count, refunded count, claimant wallet and PR number (`Option`s), merge commit, merged-by hash, amount paid, when settled: 351 bytes |
| Vault | the bounty's associated token account for the mint | the funds; owned by the bounty PDA |
| Contribution | `"contrib"`, bounty, funder | amount, refunded flag: 76 bytes. This is what gives each funder their own refund |

The nonce lets an issue get a fresh bounty after one settled. The attester and approver are in the seeds so that nobody can open a bounty at the address an office's bounty for that issue would have, with keys the office doesn't hold; a bounty opened with other keys sits at its own address, and `activeBounty` (given the office's keys and mint) never picks it. Bounties opened on devnet before the 2026-10-03 upgrade used the first four seeds only. Opening uses CreateIdempotent for the vault, so creating the vault address first can't block a bounty.

### Instructions

A tag byte, then the fields little-endian. Account order is documented on `EscrowInstruction` in `programs/bounty-escrow-core/src/instruction.rs`.

| Tag | Instruction | Who signs | Rules |
| --- | --- | --- | --- |
| 0 | `InitBounty { repo_hash, issue, nonce, expiry_ts, attester, approver }` | any payer | mint on the allowlist, classic Token program, expiry in the next 366 days, attester and approver two different non-zero keys |
| 1 | `Fund { amount }` | any funder | open or claimed, not expired, amount above zero; `transfer_checked` into the vault; creates or adds to the funder's contribution with `checked_add` |
| 2 | `Claim { pr_number, claimant_wallet }` | the attester | open or claimed, not expired; binds the office PR and the wallet to pay; may bind again (a re-opened PR) until released |
| 3 | `Release { merge_sha, merged_by_hash, pr_number }` | the attester and the approver, and a payer | claimed, not expired, `pr_number` equal to the claimed one; pays the whole vault to the claimant's associated token account, creating it with the payer covering rent |
| 4 | `Refund` | anyone | after the expiry (or once cancelled), not released; pays one contribution back to its funder's token account and marks it refunded; the last one makes the bounty `Refunded` |
| 5 | `Cancel` | the creator or the approver if empty, else the approver | empty: closes the bounty and its vault, rent back to the creator. Funded and not yet claimed: the approver calls it off and the refund crank opens at once |

What the two signatures mean is decided off chain. The attester (the office's server key) signs a claim only for a PR an office worker opened on the repository itself (never a fork) that closes the issue, and signs a release only after GitHub reports it merged by a `User` account (not a `Bot`) with write access or more. The approver (a separate key) signs only after an office admin approved the payout in the review inbox. `sdk/src/attester.ts` holds those checks.

`merged_by_hash` is sha256 of the merging user's numeric GitHub id, so who merged can be matched without putting a name on chain.

### Events

`sol_log_data` with a one-byte discriminator and the fields little-endian: `BountyCreated` (0), `Funded` (1), `Claimed` (2), `Released` (3), `Refunded` (4), `Cancelled` (5). `decodeEvents(logs, programId)` reads only `Program data:` lines logged inside the escrow's own invocation, so another program can't forge them.

### Errors

Custom codes 6000 (`InvalidInstruction`) to 6018 (`WrongTokenProgram`), the same names on both sides (`ERROR_CODES` in `sdk/src/layout.ts`).

### Checks on every account

Signers signed; bounty and contribution accounts are owned by the program and sit at the address their recorded seeds and bump give; the vault is the recorded one, of the bounty's mint and owned by the bounty; destination token accounts are of the bounty's mint and owned by the claimant or the funder; the System, Token and Associated Token program ids are the expected ones; totals use `checked_add`; the clock sysvar decides expiry.

### Mints

Compiled in: devnet USDC (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) always, and the test mint `9CL3xM1UNUQk7XqKz8JHbYhPNH9iwZF4mU67sjSEzbMz` only with the `test-mint` feature. There is no mainnet mint in any build.

## Keys

Generate testnet keys only, into `~/.config/agent-office-chain` (directory mode 0700, files 0600), and refer to them by path:

```bash
mkdir -m 700 -p ~/.config/agent-office-chain && cd ~/.config/agent-office-chain && umask 077
for k in deployer program attester approver test-mint funder operator; do
  solana-keygen new --no-bip39-passphrase --silent -o solana-$k.json
done
```

`--silent` keeps the seed phrase off the terminal. `readKeypair` refuses a key file others can read, and never puts key bytes in an error. The office loads the attester key at start. The approver is best an admin's browser wallet: `Attester.prepareRelease` (or `SolanaEscrow.prepareRelease`) builds a release the attester signs and the wallet co-signs, pays for and sends. With an approver key file instead, the office reads it only when an admin approves a payout.

Workers run as the same OS user as the office, so a worker could read these files: environment scrubbing doesn't protect files. Use dedicated testnet keys with nothing of value on them, never a key that holds real funds.

## Deploy to devnet

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"   # Agave CLI, about 77 MB
npm install && npm run build:program
solana airdrop 2 $(solana-keygen pubkey ~/.config/agent-office-chain/solana-deployer.json) --url devnet
scripts/e2e.sh devnet
```

`scripts/e2e.sh devnet` checks the genesis hash, deploys with the program key, funds the attester and the funder from the deployer, creates the test mint, mints 100 test tokens to the funder, and runs one bounty through open, fund, claim and release, then writes the program id and the four signatures to `deployments/devnet.json`. `scripts/e2e.sh localnet` does the same against `solana-test-validator`.

The deployer keeps the upgrade authority, so devnet redeploys stay possible. The program itself has no admin and no config account: no instruction reads the upgrade authority. A mainnet deploy, if there ever is one, would follow an audit and `solana program set-upgrade-authority --final`.

### Status

- `cargo test`, the SDK tests and the litesvm runs of the built `.so` pass.
- `scripts/e2e.sh localnet` ran on `solana-test-validator` (Agave 4.3) three times, the last on 2026-10-03 at the current commit: see `deployments/localnet.json` for the signatures (those ledgers were local and are gone). The office's guarded RPC fetch read the released bounty back from that validator (loopback allowed explicitly), and refused it with the default guard.
- Devnet: not deployed yet. The devnet faucet refused CLI airdrops for the day (rate limit), and faucet.solana.com needs a browser sign-in. Fund the deployer `TyQidKVXFC52NRtsais3yaFbBkJksBeU5Y68TSwb1zE` with 2 devnet SOL, then run `scripts/e2e.sh devnet`. The program id will be `JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6`.
- The program is not audited.

## The CLI

```
ao-bounty show     --repo <owner/name> [--issue <n>]
ao-bounty open     --repo --issue [--days <n>] --attester <a> --approver <a>
ao-bounty fund     --repo --issue --amount <usdc>
ao-bounty claim    --repo --issue --pr <n> --wallet <a>
ao-bounty release  --repo --issue --pr <n> --approver-key <file> [--merge-sha <sha>] [--merged-by-hash <hex>]
ao-bounty refund   --repo --issue [--funder <a>]
ao-bounty cancel   --repo --issue [--approver-key <file>]
ao-bounty address  --repo --issue --attester <a> --approver <a>
# --attester/--approver on any command name the keys a bounty was opened with, when another
# bounty on the issue has the same nonce under other keys. --merged-by-hash is mergedByHash(id, secret).

  --backend solana-devnet|solana-localnet|mock   --program <id>   --rpc <url>   --keypair <file>
  --mint <address>|test   --nonce <n>   --mock-file <file>
```

`npm run cli -- <command>` runs it from the sources. Every step is checked against the program's rules on the cluster's clock before it is sent, so a refusal costs no fee.

## Using the SDK

```ts
import { SolanaEscrow, Attester, readKeypair, parseAmount, TEST_MINT } from './sdk/src/index.js';

const escrow = new SolanaEscrow({ programId, mint: TEST_MINT });            // devnet, genesis-checked
const attester = new Attester(escrow, readKeypair(`${keys}/solana-attester.json`));
await attester.claim(ref, pullFacts, operatorWallet);                       // refuses forks
await attester.release(ref, pullFacts, readKeypair(`${keys}/solana-approver.json`)); // refuses bot merges
```

`MockEscrow` takes the same calls in memory for tests. `fundActionGet` and `buildFundTransaction` build the "Fund this issue" Action payloads; the office serves them under `/api/actions/`.
