# Agent reputation from merges

Back to the [README](../README.md).

Part of the Proof of Merge fork of [agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, by webdevcody / AgentSystemLabs). Testnet only: Base Sepolia (chain id 84532), and Solana devnet for bounty payouts. Off unless the office is started with `--reputation`, which needs `--attest`.

Which coding agent's pull requests actually get merged? The office answers from one signal only: what a person did with an agent's work. A merge, a revert or a close by someone with write access moves an agent's reputation. Nothing the agent says about itself does, and there are no points, tokens or badges.

## How it works

1. **Identity.** Each worker identity is a (harness, operator, agent label) tuple, written `claude/ana/backend-1`: the agent CLI, the account that hired the worker (or `office`), and the worker's name. The first time one of its pull requests is attested, the office registers it in the [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) Identity Registry on Base Sepolia and points it at its agent card here (`/agents/<agentId>.json`). The mapping (identity, agent id, registration, the operator's account for their payout wallet) is kept in `agents.json` in the data folder.
2. **Attestation.** Every [proof-of-merge attestation](proof-of-merge.md) carries the worker's agent id.
3. **Feedback.** Once an attestation is on chain, the office gives the agent one feedback in the ERC-8004 Reputation Registry, from the attester's key:

| Outcome | value | tag1 | tag2 |
| --- | --- | --- | --- |
| Merged by a person | 100 | `merge` | the harness |
| Merged, with a bounty paid on Solana devnet | 100 | `paid` | the harness |
| Reverted within 14 days | 0 | `merge` | the harness |
| Closed unmerged by a person | 30 | `merge` | the harness |
| Any of these by the agent's own operator | as above | `self` | the harness |

`feedbackURI` is the attestation on base-sepolia.easscan.org and `feedbackHash` its UID, so every feedback points at the attestation it rests on. Only the existing ERC-8004 fields are used.

### Only what a person did

- Who merged or closed a pull request is asked of GitHub fresh (`src/server/chain/merge-proof.ts`): `merged_by` for a merge, `closed_by` for a close. It must be a GitHub `User`, not a `Bot` or an app, with admin, maintain or write permission. Anything else earns no attestation, no identity and no feedback.
- A **self-merge** is one where the person who merged (or closed) it is the agent's operator, by their own GitHub sign-in, or the one who opened the PR. Self-merges are written with tag `self` and shown apart; the board never ranks on them.
- A revert counts against an agent only when it lands within 14 days of the merge.
- When an office PR claimed a [bounty](bounties.md), its attestation waits up to three days for the admin-approved payout, so the attestation carries the Solana signature and the feedback says `paid`. After that it is attested without it.

### The figures

`src/shared/reputation.ts` works them out, per agent and per harness, and is the only place they are defined: the office, the public API, the MCP tool and the [indexer](../onchain/indexer/README.md) all use it.

| Figure | How |
| --- | --- |
| Merged, self-merged, reverted, closed unmerged | Counted from the outcomes; self ones apart |
| Merge rate | merged / (merged + closed unmerged), others' outcomes only |
| Revert rate | reverted / merged |
| Score | The ERC-8004 average of the feedback values above, others' outcomes only |
| Median time to merge | From the PR's `openedAt` to `mergedAt`, both in the attestation |
| Distinct maintainers | How many different people (by the attestation's pseudonym) merged its work |
| USDC earned, bounties paid | From the Solana payouts |

Under five outcomes, a rate says *not enough data* instead of a number. The board ranks agents with enough data first, then by merges by others, then by distinct maintainers, then by merge rate.

## In Mission control

- **Attention and Review rows**: a worker's row shows its agent's record (*rep 86 · merges 80% · 25.00 USDC*, or *2 merged, not enough data*). The chip links to its latest attestation on chain, and its tooltip has the whole record. When an agent's merges get reverted often (20% or more, with enough data) the row says so as a hint. The hint never moves a worker in the ranking and never holds anything up.
- **Goals tab, Agents**: every agent identity with its ERC-8004 id, score, merge rate, merges (self-merges apart), maintainers, earnings, and links to its card, its latest attestation and its registration. It also says how many attestations and feedback are still to be written on chain.

Payout approval stays where it was: an office admin approves each bounty payout in the review inbox, and nothing about reputation moves money.

## The public API

Read only and open to anyone (no sign-in), after the host check. JSON with an `ETag` (a matching `If-None-Match` gets `304`), `Cache-Control: public, max-age=60` and `Access-Control-Allow-Origin: *`, so a showcase page elsewhere can read it. The office's own [public showcase](showcase.md) at `/pom/` shows the same board. No cookies are read or set. Off (`404`) without `--reputation`.

| Route | What it answers |
| --- | --- |
| `GET /api/public/reputation/<agentId>?window=30d` | One agent's record, and its outcomes with their links (attestation, feedback, Solana payout) |
| `GET /api/public/leaderboard?by=harness\|agent&window=30d` | The board. `window` is `7d`, `30d`, `90d` or `all`. `source=chain` gives what onchain/indexer rebuilt from the chain alone (windows `30d` and `all`) |
| `GET /api/public/dataset.json` | Every outcome, CC0, in the same format the indexer writes |
| `GET /agents/<agentId>.json` | The agent's ERC-8004 registration file |

The agent card names the agent and its harness and operator, the office's endpoints (its record, the dataset, and the x402 task URL when paid tasks are on), the registrar's address on Base Sepolia (it holds the identity for the operator), the operator's Solana devnet payout wallet when they set one, and its registration. It holds no secrets and no repository names. It credits upstream agent-office.

The attestations themselves are public on Base Sepolia and name the repository and PR number, so only run `--attest` for repositories whose names may be public.

## The MCP tool

`agent_reputation` is a small read-only MCP server (stdio) in [onchain/indexer](../onchain/indexer/README.md), with `get_agent_reputation` (an agent id or a harness), `list_leaderboard` (a window, by agent or harness) and `verify_merge` (a repository and PR: the attestation UID and the Solana payout). It holds no keys. Point it at this office:

```sh
cd onchain/indexer && npm install
REPUTATION_OFFICE_URL=https://office.example npm run mcp
```

or at a `dataset.json`, or at the chain itself.

## Rebuilding the board without the office

`onchain/indexer` reads the attestations, the feedback, the identities and the Solana payouts, and writes `leaderboard.json` and `dataset.json` (CC0), every row with its links. It needs no office and no keys. With `--reputation-index <minutes>` the office runs it in the background as a separate process, with the public addresses of its attester and registrar and an environment holding only `PATH` and `HOME`, and serves the result at `/api/public/leaderboard?source=chain`.

## Turning it on

```sh
cd onchain/attest && npm install && npm run build
cd onchain/reputation && npm install && npm run build
(cd onchain/reputation && npm run new-key -- ~/.config/agent-office-chain/base-registrar.json)   # prints the address only
agent-office --attest --reputation --reputation-card-base https://office.example
```

| Switch | What it does |
| --- | --- |
| `--reputation` | ERC-8004 identities and merge feedback (env `AGENT_OFFICE_REPUTATION=1`); needs `--attest` |
| `--reputation-registrar-key-file` | The key that registers and owns the identities (default `~/.config/agent-office-chain/base-registrar.json`). It must not be the attester's key |
| `--reputation-card-base` | This office's https address; each identity's agentURI becomes `<base>/agents/<id>.json` |
| `--reputation-identity`, `--reputation-registry` | Registries on a local node (default: the live ones on Base Sepolia) |
| `--reputation-index <minutes>` | Rebuild the public board from the chain every so often (default never) |

The live registries are `0x8004A818BFB912233c491871b3d84c89A494BD9e` (Identity) and `0x8004B663056A597Dffe9eCcC1965A193B7388713` (Reputation), version 2.0.0, checked read only and exercised on a local fork; see [onchain/reputation](../onchain/reputation/README.md).

## How it is kept safe

- **Two keys.** The registrar owns the identities and the attester gives the feedback. The registry refuses feedback from an agent's owner, and the office refuses to start if both switches name the same file. Key files are mode 0600, named by path only, and read by the onchain packages, whose errors never include key bytes. Workers run as the same OS user and could read them, so they must be dedicated testnet keys.
- **The chain.** Before every registration and feedback the node must answer `eth_chainId` with `0x14a34`, and RPC goes through the network guard to Base Sepolia's public endpoints only (loopback only for a local node named on the command line).
- **Outboxes.** Owed attestations wait in `attestations.json` and owed feedback in `feedback.json` (both through `safefs.ts`), retried with a pause that doubles up to an hour, so an RPC that is down or a restart loses nothing. An identity is registered by one registration at a time and recorded as soon as it is on chain.
- **Read only in public.** The public routes and the MCP tool read; nothing there takes a key or writes. Mission control only links to https addresses and the office's own cards.

## Code

| Path | What it does |
| --- | --- |
| `src/shared/reputation.ts` | The figures, the scores and tags, the board, `verify_merge` |
| `src/server/chain/reputation.ts` | `Reputation`: registering identities, owed feedback, the records, agent cards |
| `src/server/chain/identities.ts` | `agents.json` |
| `src/server/chain/attest.ts` | Agent ids, self-merges, closers and payouts in each attestation |
| `src/server/chain/rep-index.ts` | The background indexer |
| `src/server/http/routes/reputation.ts` | The public routes |
| `src/client/ui/mission/rep.ts` | The row chip and the Agents table |
| `onchain/reputation/` | The ERC-8004 client, the fallback registries, the Sepolia checks |
| `onchain/indexer/` | The chain-only board, the dataset and the MCP tool |

Tests: `tests/reputation.test.ts` (the figures on fixtures, small samples, self-merges, the revert window, the feedback for each outcome), `tests/reputation-office.test.ts` (registration once, the agent id in each attestation, bot merges earn nothing, self-merge tagging, waiting for a payout, the public routes and their ETags, the background indexer), `onchain/reputation/test/` (the registries on anvil, and on a fork of Base Sepolia), and `onchain/indexer/test/` (a replay of recorded logs gives the same `leaderboard.json` every time; the office end to end on a local chain gives the board the indexer rebuilds).

## Not done yet

- No agent is registered on Base Sepolia yet: the registrar (`0x7c2C45a17A432CF890E514f1AaB67D941ec58314`) holds no test ETH. Funding it from a browser faucet is a manual step; then the office registers its agents by itself. The attester, which gives the feedback, is funded and already attests on Base Sepolia (see [proof of merge](proof-of-merge.md)).
- The operator's own EVM wallet isn't asked for: the registrar holds every identity. Handing an identity to its operator (an ERC-721 transfer) is possible on chain but has no button.
- An identity is registered as soon as its first PR is attested. If the office stops between the registration and recording it, the identity is registered again later.
