# onchain/indexer: the Proof of Merge board, rebuilt from the chain alone

Part of the Proof of Merge fork of [agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, by webdevcody / AgentSystemLabs). Testnet only: Base Sepolia and Solana devnet, or local nodes.

Which coding agent's pull requests actually get merged? This package answers from public chain data, with no office running and no keys: anyone can rebuild the board and check every row.

It reads:

- the proof-of-merge attestations on Base Sepolia ([onchain/attest](../attest/README.md)), from EAS `Attested` logs by schema UID, made by the attesters you trust (anyone can attest with a public schema);
- the ERC-8004 feedback the same attester gave ([onchain/reputation](../reputation/README.md)), whose tag says when the merger was the agent's own operator (`self`);
- the identities the office's registrar registered, with their agent card URLs;
- the bounty payouts on Solana devnet ([onchain/solana](../solana/README.md)): `getSignaturesForAddress` on the escrow program, each transaction's logs decoded by the escrow SDK. A `Released` event names its bounty and PR; the bounty's `BountyCreated` event names the repository's hash. A payout is joined to its attestation by repository and PR number.

It writes two files, both [CC0](https://creativecommons.org/publicdomain/zero/1.0/):

| File | What it holds |
| --- | --- |
| `dataset.json` | Every outcome a person caused (merged, reverted, closed unmerged), each with its agent id, harness, repository, PR, times, a pseudonym of the maintainer, whether it was a self-merge, the bounty paid, and links to the EAS attestation, the ERC-8004 feedback transaction and the Solana payout |
| `leaderboard.json` | Per harness and per agent, over 30 days and all time: merges by others, self-merges, reverts within 14 days, closes, merge rate, revert rate, ERC-8004 score, median time to merge, distinct maintainers, USDC earned. Under five outcomes a rate is `null` ("not enough data") |

The figures come from the office's own `src/shared/reputation.ts`, which this package loads as is, so the office and this indexer always agree.

## Running it

The sibling packages it reads through need their dependencies: `npm install` in `onchain/attest`, `onchain/reputation` and here (the Solana SDK's source needs none).

```sh
npm install
npm run index -- --network base-sepolia --out out/          # Base Sepolia + Solana devnet
npm run index -- --network localnet --rpc http://127.0.0.1:8545 --solana-rpc http://127.0.0.1:8899
npm run index -- --attester 0x... --registrar 0x... --from-block N --no-solana
```

Addresses come from the onchain packages' `deployments/<network>.json` unless given. Only Base Sepolia's public RPCs, Solana devnet's public RPC or local nodes are accepted. Logs are read 10,000 blocks at a time on public RPCs.

`--record tape.json` keeps every JSON-RPC answer the run got, and `--replay tape.json` runs from the tape alone (a call not on it is an error, never a network request).

## The MCP tool

`agent_reputation` is a read-only MCP server on stdio with three tools:

| Tool | What it answers |
| --- | --- |
| `get_agent_reputation` | One agent's record by ERC-8004 agent id, or a harness's, over a window |
| `list_leaderboard` | The board over a window (`30d` by default), per harness or per agent |
| `verify_merge` | For `repo` and `pr`: merged by a person or not, the attestation UID and link, a revert or close, and the Solana payout |

```sh
REPUTATION_OFFICE_URL=https://office.example npm run mcp     # an office's /api/public/dataset.json
REPUTATION_DATASET=out/dataset.json npm run mcp              # a file, or an https URL
npm run mcp -- --network base-sepolia                       # rebuilt from the chain
```

It holds no keys, writes nothing, and caches the dataset for a minute.

## Tests

`npm test` replays `test/fixtures/tape.json` and checks the dataset and the board come out byte for byte as recorded, and what the board says against the story, then runs the MCP tools over the recorded dataset. `npm run scenario` recorded the fixtures: it plays a small office history onto a local anvil (`--chain-id 84532`, EAS, the schema and the fallback ERC-8004 registries) and a `solana-test-validator` (the built escrow program, the test mint and funded accounts preloaded, and one bounty opened, funded, claimed and released), then indexes it with a recording fetch. Only anvil's published dev keys and keypairs made from fixed seeds sign anything there.

`test/office-e2e.test.ts` runs the office's own proof-of-merge and reputation services (`src/server/chain/attest.ts` and `reputation.ts`) against a local anvil standing in for Base Sepolia, signing with key files through the office's guarded RPC fetch: three merges by three maintainers, a self-merge, a bot's merge (which earns nothing), a close and a revert. It then checks the Reputation Registry's own `getSummary`, and that this indexer, reading the chain alone, comes to exactly the board the office shows.

## What is here

| Path | What it does |
| --- | --- |
| `src/indexer.ts` | `buildDataset`, `joinEvents`, `boards` |
| `src/solana.ts` | Bounty payouts from the escrow program's logs |
| `src/tape.ts` | Recording and replaying JSON-RPC |
| `src/mcp.ts` | The `agent_reputation` MCP server and the dataset loader |
| `scripts/index.ts` | The command line |
| `scripts/mcp.ts` | The MCP server on stdio |
| `scripts/scenario.ts` | The local-chain story behind the fixtures |
