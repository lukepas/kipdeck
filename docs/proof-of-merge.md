# Proof of merge on Base Sepolia

Kipdeck's Proof of Merge lab, testnet only. The lab is on as Kipdeck ships, but attestations stay off unless the office is started with `--attest`.

Back to the [README](../README.md).

Part of Proof of Merge, the payout layer of Kipdeck (a lab). Kipdeck is built on [agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, by webdevcody / AgentSystemLabs). Testnet only: Base Sepolia (chain id 84532). Off unless the office is started with `--attest`, which also holds the Proof of Merge lab on (see [Labs](labs.md)).

A person's merge is the only thing that moves reputation for an agent's work. When someone with write access merges a pull request the office's own worker opened, the office writes an [EAS](https://attest.org) attestation about it on Base Sepolia, whether or not it carried a [bounty](bounties.md). From those attestations alone, anyone can rebuild which coding agents' pull requests actually get merged, and which get reverted.

## What gets attested

An attestation is public and permanent, and names the repository. So only repositories named in `--attest-repos` are attested, and only while GitHub reports them public: a private repository is never attested, whatever the list says, and one that turns private before its attestation goes out is skipped. The office says once in its log which repository it is not attesting, and why.

| Outcome | When |
| --- | --- |
| 1 merged | An office-made, non-fork PR merged by a person with admin, maintain or write permission |
| 2 reverted | A later PR that reverts one of those merged (GitHub's "Reverts owner/name#N"); its `refUID` is the original attestation |
| 3 closed | An office PR closed without merging by a person with admin, maintain or write permission (GitHub's `closed_by`) |

A merge or a close by a bot or an app, or by someone without write access, earns nothing; the office records why and moves on. `mergedByHash` is the pseudonym of whoever merged it, closed it, or merged the revert: an HMAC of their GitHub user id under a secret the office keeps (`merger-pseudonym.secret` in its data folder, mode 0600). GitHub ids are sequential, so a plain hash of one could be reversed by trying them all; this one can't without the secret. The repository, the PR number and the merge commit are public in every attestation, and the commit leads to the merger on GitHub anyway. A fork's pull request is never the office's, whatever its branch is called (see `Floor.officePull`). Who merged and the merge commit are asked of GitHub fresh, not taken from the board's list. Revocation is kept for attestations that were wrong.

When the PR claimed a [bounty](bounties.md), the attestation waits up to three days for the payout an admin approves, so it carries the devnet signature; after that it goes without it. With [`--reputation`](reputation.md), each attestation also carries the worker's ERC-8004 agent id, and the office follows it with one ERC-8004 feedback that points back at it.

The schema, its fields and the fallback contract are in [onchain/attest](../onchain/attest/README.md). Its UID, the same on any chain since it depends only on the schema, the resolver and revocability, is `0x368e9023c13393aea075e78cae18e804725b0d1bb3e2b1a6c1117d759a01a900`.

## Turning it on

```sh
cd onchain/attest && npm install && npm run build   # the office loads dist/ at run time
onchain/attest/scripts/deploy-sepolia.sh            # once the wallets hold test ETH
agent-office --attest --attest-repos owner/name[,owner/other] [--attest-key-file ~/.config/agent-office-chain/base-attester.json]
```

| Switch | What it does |
| --- | --- |
| `--attest` | Attest merged office PRs (env `AGENT_OFFICE_ATTEST=1`) |
| `--attest-repos` | The public repositories (`owner/name`, comma separated) whose merges go on chain; required (env `AGENT_OFFICE_ATTEST_REPOS`) |
| `--attest-key-file` | The attester's key file, mode 0600 (default `~/.config/agent-office-chain/base-attester.json`) |
| `--attest-rpc` | `https://sepolia.base.org` (default) or `https://base-sepolia-rpc.publicnode.com`; a node on `http://127.0.0.1:<port>` for local runs |
| `--attest-schema` | The schema UID (default: `onchain/attest/deployments/base-sepolia.json`) |
| `--attest-mode event`, `--attest-contract` | The MergeAttestor fallback instead of EAS |
| `--attest-eas` | Where EAS is on a local node (Base has it as a predeploy) |

## How it is kept safe

- **The outbox.** Every attestation the office owes goes into `attestations.json` in its data folder first (through `safefs.ts`), and is retried with a pause that doubles from 30 seconds up to an hour. An RPC that is down or an office that restarts loses nothing. The transaction hash is saved the moment it is sent: if its receipt never comes (a timeout, a restart), the next try looks that transaction up and keeps its attestation instead of sending another, and only sends again once the transaction failed or the node has not heard of it for ten minutes. ERC-8004 registrations (with `--reputation`) are kept the same way, so an agent is not registered twice.
- **The chain-id guard.** Before every signature the office asks the node for `eth_chainId` and refuses anything but `0x14a34`. The attester in `onchain/attest` checks again. A local test node runs with `--chain-id 84532`, so the guard is never switched off.
- **The network guard.** RPC goes through `guardedFetch` to the two public Base Sepolia endpoints only (loopback only for a local node named on the command line), with no redirects and a capped answer.
- **The key.** The attester's key file is read by `onchain/attest`, whose errors name the file and never its bytes. Workers never get `CHAIN_*`, `X402_*` or `AGENT_OFFICE_*` variables, but they run as the same OS user and could read the file, so it must be a dedicated testnet key.

Each attestation goes on the floor's timeline as `merge-attested`, with a link to it on [base-sepolia.easscan.org](https://base-sepolia.easscan.org).

## The leaderboard

`onchain/attest/scripts/leaderboard.ts` reads every attestation of the schema made by the office's attester (anyone can attest with a public schema, so only trusted attesters count) and prints, per harness, merged, closed and reverted PRs, merge rate and revert rate, each row with a link to its latest attestation. The same `readAttestations` and `leaderboard` functions are what the [public showcase](showcase.md) builds on.

The full board (per agent and per harness, with time to merge, maintainers, self-merges and bounty earnings) is rebuilt by [onchain/indexer](../onchain/indexer/README.md), from the chain alone.

## Funding

Nothing here calls a faucet. The deployer (registers the schema) and the attester (signs attestations) need a little Base Sepolia ETH from a browser faucet. `deploy-sepolia.sh` checks their balances first and prints the addresses to fund when they're short. With `--reputation`, the registrar (`base-registrar.json`, which registers the agents) needs a little too; its public address is in `onchain/reputation/deployments/base-sepolia.json`.

## Code

| Path | What it does |
| --- | --- |
| `src/server/chain/attest.ts` | `MergeProofs`: what is owed on a merge, a revert or a close, the facts from GitHub, the chain-id guard, sending |
| `src/server/chain/outbox.ts` | The persistent outbox and its backoff |
| `src/server/chain/flags.ts` | `--attest`, `--reputation` and `--x402` |
| `src/server/office/chain.ts` | Making the services, and a floor as they see it |
| `onchain/attest/` | The schema, the attestor, the reader, the fallback contract, scripts |

Tests: `tests/proof-of-merge.test.ts` (attested once, the outbox retrying after an RPC failure and across a restart, the chain-id guard, bots and forks earning nothing, reverts and closes), and `onchain/attest/test/office.test.ts` (this service against a real EAS on anvil, read back into the leaderboard).

## Not done yet

- `agentId` is 0 unless the office runs with `--reputation` (see [Agent reputation from merges](reputation.md)).
- The schema is registered on Base Sepolia and MergeAttestor is deployed there (`onchain/attest/deployments/base-sepolia.json`); the attester signs from a small amount of test ETH that a browser faucet has to top up.
