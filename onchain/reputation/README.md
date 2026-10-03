# onchain/reputation: ERC-8004 identity and merge-based reputation on Base Sepolia

Part of the Proof of Merge fork of [agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, by webdevcody / AgentSystemLabs). Testnet only: Base Sepolia (chain id 84532), and a local anvil started with `--chain-id 84532` for tests. Every signing path asks the node for its chain id first and refuses anything else.

Each office worker identity, a (harness, operator, agent label) tuple such as `claude/zygimantas/backend-1`, is registered once in the [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) Identity Registry. When a person merges, reverts or closes one of its pull requests, the office gives it feedback in the Reputation Registry. Nothing else moves its reputation: no self-reported scores, no points, no tokens.

## The registries

Checked on 2026-10-03 with `cast code` and `scripts/check-sepolia.ts` (read only), against [erc-8004/erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts) at `b9e466c`:

| Registry | Base Sepolia address | Version |
| --- | --- | --- |
| Identity | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | 2.0.0 (UUPS proxy) |
| Reputation | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | 2.0.0, `getIdentityRegistry()` is the Identity Registry above |

`0x8004A169...` and `0x8004BAa1...` are the mainnet addresses; they have no code on Base Sepolia. `deployments/base-sepolia.json` records the check, the block it ran at (readers start there) and the public addresses of the office's two keys.

`scripts/fork-check.ts` then exercises the live contracts without sending anything to Base Sepolia: a local anvil forks it, and anvil's dev accounts register an agent, set its URI, give it feedback and try to review their own agent (refused), and the readers get it all back. It passed; `forkCheck` in the deployment file says when.

## The fallback

`contracts/AgentRegistry.sol` and `contracts/ReputationLog.sol` keep the live registries' signatures and events for everything the office calls (`register` in its three forms, `setAgentURI`, `tokenURI`, `ownerOf`, `isAuthorizedOrOwner`, `getAgentWallet`, `giveFeedback`, `revokeFeedback`, `readFeedback`, `getLastIndex`, `getClients`, `getSummary`, and the `Registered`, `URIUpdated`, `NewFeedback` and `FeedbackRevoked` events). They are what the tests and a local office run against, and what to deploy if the live registries ever go missing or change incompatibly. Two differences: agent ids start at 1 (the live registry starts at 0, which on Base Sepolia belongs to someone else), so 0 always means "no agent"; and responses (`appendResponse`) are left out. Both refuse to deploy on Ethereum or Base mainnet.

## Two keys

The Reputation Registry refuses feedback from an agent's own owner or operator, so the office uses two keys:

| Key file | Role |
| --- | --- |
| `~/.config/agent-office-chain/base-registrar.json` | Registers the office's agents and owns their identities (`scripts/new-key.ts` made it) |
| `~/.config/agent-office-chain/base-attester.json` | Gives the feedback. It is the attester of [onchain/attest](../attest/README.md), so one address signs both the EAS attestation and the feedback that points at it |

Key files are mode 0600 in a 0700 folder and are only ever named by path. `scripts/new-key.ts` prints the new public address and nothing else, and refuses to overwrite a file.

## The feedback

One per outcome a person caused (the office checks that whoever merged or closed it is a GitHub User, not a Bot, with write access):

| Outcome | value (valueDecimals 0) | tag1 | tag2 |
| --- | --- | --- | --- |
| Merged | 100 | `merge` | the harness |
| Merged, with a bounty paid on Solana devnet | 100 | `paid` | the harness |
| Reverted within 14 days | 0 | `merge` | the harness |
| Closed unmerged by a person | 30 | `merge` | the harness |
| Any of these by the agent's own operator | as above | `self` | the harness |

`feedbackURI` is the EAS attestation on base-sepolia.easscan.org and `feedbackHash` is its UID, so every feedback names the attestation it rests on. Only the existing ERC-8004 fields are used. The scores and tags live in the office's `src/shared/reputation.ts`, which the indexer uses too.

## What is here

| Path | What it does |
| --- | --- |
| `src/chain.ts` | Base Sepolia, the registry addresses, the chain-id guard, `deployments/*.json` |
| `src/registry.ts` | `createRegistry`: register, setAgentURI, giveFeedback (refuses self-feedback before the registry would) |
| `src/read.ts` | `readAgents` (by registrar), `readFeedback` (by trusted reviewer, with revocations), `describe`; logs read in block ranges |
| `src/keyfile.ts` | Key files, mode 0600, nothing of the key in an error |
| `contracts/` | The fallback registries |
| `scripts/check-sepolia.ts` | Read-only check of the live registries, writes `deployments/base-sepolia.json` |
| `scripts/fork-check.ts` | The live registries exercised on a local fork |
| `scripts/deploy-local.ts` | The fallback on a local anvil, writes `deployments/localnet.json` |
| `scripts/new-key.ts` | A new testnet key file |

## Running it

```sh
npm install
npm run build          # dist/ (the office loads it at run time) and the forge build
npm run check          # typecheck, forge test, node tests on anvil
REPUTATION_FORK_TEST=1 npm test   # also the live registries on a local fork (reads sepolia.base.org)
npm run check:sepolia  # read only
```

Nothing has been written to Base Sepolia yet. The registrar and the attester each need a little Base Sepolia ETH from a browser faucet first; after that the office registers its agents itself (see [docs/reputation.md](../../docs/reputation.md)).
