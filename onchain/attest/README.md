# onchain/attest: proof of merge on Base Sepolia

Part of the Proof of Merge fork of [agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, by webdevcody / AgentSystemLabs). Testnet only: Base Sepolia (chain id 84532), and a local anvil started with `--chain-id 84532` for tests. Every signing path asks the node for its chain id first and refuses anything else.

When a person with write access merges a pull request the office's own worker opened, the office writes one [EAS](https://attest.org) attestation about it. If a later revert of that PR merges, it writes another with outcome 2 whose `refUID` points at the first. An office PR closed without merging gets outcome 3. Revocation is kept for attestations that were wrong. Anyone can then rebuild "which coding agent's PRs actually get merged?" from chain data alone.

## The schema

Registered once on Base Sepolia's SchemaRegistry predeploy (`0x4200000000000000000000000000000000000020`), revocable, no resolver:

```
string repo, uint64 pr, bytes20 mergeSha, bytes32 mergedByHash, string harness, uint256 agentId, uint8 outcome, string solanaTx, uint64 mergedAt, uint64 openedAt
```

| Field | What it holds |
| --- | --- |
| `repo` | owner/name, lower case |
| `pr` | the pull request number |
| `mergeSha` | the merge commit (zero for outcome 3) |
| `mergedByHash` | HMAC-SHA256 of "github:<numeric user id>" under a secret the office keeps (`mergedByHashOf(id, secret)`), so the sequential id can't be found by trying them all. Zero when unknown. Earlier records, if any, used a plain hash |
| `harness` | the agent CLI the worker ran: claude, codex, cursor, pi, opencode ... |
| `agentId` | the worker's ERC-8004 agent id once it has one, 0 until then |
| `outcome` | 1 merged, 2 reverted, 3 closed unmerged |
| `solanaTx` | the devnet signature of the bounty payout, when one was paid before the attestation |
| `mergedAt` | seconds since the epoch: when it merged (or closed, for outcome 3) |
| `openedAt` | seconds since the epoch: when the pull request was opened, so time to merge comes from the chain alone; 0 when unknown |

Its UID (`schemaUid()` in `src/schema.ts`) is checked against the EAS SDK's own `SchemaRegistry.getSchemaUID`, and the encoded data against the SDK's `SchemaEncoder`, byte for byte.

## The fallback

`contracts/MergeAttestor.sol` is the plan B if EAS tooling ever fails: one `MergeAttested(uid, refUID, attester, data)` event per record, where `data` is exactly the bytes an EAS attestation would carry. Only the attester address given at deploy time may write; it refuses to deploy on Ethereum or Base mainnet. `createAttestor({ mode: 'event' })` and `readAttestations({ mode: 'event' })` use it behind the same interface.

## What is here

| Path | What it does |
| --- | --- |
| `src/schema.ts` | The schema, its UID, encoding and decoding, `mergedByHashOf` |
| `src/chain.ts` | Base Sepolia, the predeploys, the chain-id guard, explorer links, `deployments/*.json` |
| `src/attestor.ts` | `createAttestor`: attest and revoke, through EAS or the fallback, key from a key file |
| `src/read.ts` | `readAttestations` (only trusted attesters count) and `leaderboard` |
| `src/keyfile.ts` | The key file reader (the same as `onchain/x402`'s; each package stands alone) |
| `contracts/MergeAttestor.sol` | The fallback contract, with forge tests in `test/forge/` |
| `scripts/register-schema.ts` | Registers the schema (once) and records the UID in `deployments/base-sepolia.json` |
| `scripts/deploy-fallback.ts` | Deploys MergeAttestor to Base Sepolia |
| `scripts/deploy-local.ts` | EAS, the schema and MergeAttestor on a local anvil |
| `scripts/smoke.ts` | Attests a smoke-test merge and its revert, reads them back, revokes both |
| `scripts/leaderboard.ts` | Prints the leaderboard from chain data |
| `scripts/deploy-sepolia.sh` | All of the Sepolia side in one command once the wallets are funded |

The office loads the build (`dist/index.js`) at run time: see [docs/proof-of-merge.md](../../docs/proof-of-merge.md).

## Use it

```sh
cd onchain/attest
npm install
npm run build          # dist/ for the office, and forge build
npm run check          # typecheck, forge test, node tests (anvil must be on PATH)
```

The node tests start their own anvil nodes: one on chain id 84532 with EAS deployed from the `@ethereum-attestation-service/eas-contracts` artifacts, and one on 31337 to check the guard refuses it before anything is sent.

### Locally

```sh
anvil --chain-id 84532 &
npx tsx scripts/deploy-local.ts                   # writes deployments/localnet.json
npx tsx scripts/smoke.ts --name localnet --rpc http://127.0.0.1:8545
```

### On Base Sepolia

The wallets live in `~/.config/agent-office-chain` (mode 0700, files 0600): `base-deployer.json` registers the schema and deploys, `base-attester.json` is the office's attester. Both need a little test ETH from a browser faucet; nothing here calls a faucet. Then:

```sh
onchain/attest/scripts/deploy-sepolia.sh            # schema, smoke test, x402 checks
onchain/attest/scripts/deploy-sepolia.sh --fallback # also MergeAttestor
```

It stops before sending anything when the node isn't Base Sepolia or a wallet is short of gas, and prints the addresses to fund.

## Tests

- `forge test`: MergeAttestor (attester only, refUID must exist, revoke once, no mainnet deploy).
- `npm test`: the schema UID and encoding against the EAS SDK, the chain-id guard, and on anvil: merges, a revert, a closed PR, a stranger's attestation and a revoked one, read back into the leaderboard, through EAS and through the fallback.
