# Arbitrum Open House Dubai buildathon

Last checked: 2026-10-03. Source: the buildathon page on HackQuest (link below), which on that day showed an online three-week buildathon, a $30,000 prize pool with tracks "announcing soon", and a countdown of 27 days. Dates, rules and judging are not published yet, so almost everything here is [unverified].

Plan: a later, separate entry, not part of the Colosseum submission. Proof of Merge (the payout layer of Kipdeck, which is built on agent-office, MIT, by webdevcody / AgentSystemLabs) keeps its attestations chain-agnostic: the office's fallback contracts in `onchain/attest/contracts` and `onchain/reputation/contracts` are plain Solidity, so they can run on Arbitrum Sepolia next to Base Sepolia. The new work for this buildathon would be:

- the MergeAttestor and the ERC-8004 fallback registries deployed on Arbitrum Sepolia, with the same chain-id guard the Base side has (Arbitrum Sepolia is chain id 421614);
- the indexer reading both chains into one board, so a row says where its proof lives;
- optionally, the leaderboard's metrics (merge rate, revert rate, median time to merge) computed on chain in a Stylus (Rust) contract, so another contract can ask for an agent's record.

Nothing of this exists yet. Do not describe it as built until it is.

## Deadline

- Registration countdown: ends around 2026-10-30 (27 days from 2026-10-03) [unverified: what the countdown counts down to].
- Buildathon: online, three weeks, starting 2026-10-31 [unverified], so ending around 2026-11-21 [unverified]. No submission time or time zone is published; when it is, add it to deadlines.json with its UTC offset.

## Links

- Buildathon page: https://arbitrum-dubai.hackquest.io/
- Upstream credit: https://github.com/AgentSystemLabs/agent-office
- Our repository: https://github.com/zbagdzevicius/kipdeck

## Eligibility checklist

- [ ] Search results quote the page as allowing existing products "as long as meaningful new work happens during the buildathon" [unverified: not on the page on 2026-10-03]. Confirm, then disclose the Colosseum work as pre-existing.
- [ ] The page talks about deploying on Arbitrum One or an Orbit chain [unverified]. We deploy on Arbitrum Sepolia only. If a mainnet deployment is required, we don't enter.
- [ ] Employer permission covers this entry too.
- [ ] Registered on HackQuest before the countdown ends.

## Pre-existing code disclosure

```field name="Prior work" max-chars=1000
Proof of Merge is the payout layer of Kipdeck, which is built on agent-office (github.com/AgentSystemLabs/agent-office), MIT, by webdevcody / AgentSystemLabs; the office is their work. Before this buildathon we built, for the Colosseum Crypto World's Fair: the inbox and mission control, a Solana devnet escrow for bounties paid only on a person's merge, and proof-of-merge attestations and ERC-8004 reputation on Base Sepolia. New for this buildathon: {{ARBITRUM_NEW_WORK}}. Our commits are listed in launch/chain/disclosure.md.
```

## Project description

```field name="One-liner" max-chars=140
Which coding agent's pull requests actually get merged? Proof of merge on Arbitrum, rebuilt from chain data alone.
```

```field name="Description" max-words=150
Teams run many AI coding agents, and reputation for them is self-reported. Proof of Merge writes one attestation per outcome a person caused on an agent's pull request (merged, reverted, closed) and gives each agent an ERC-8004 identity and feedback that only those outcomes can earn. For this buildathon we bring it to Arbitrum: {{ARBITRUM_NEW_WORK}}. Testnet only.
```

## Judging criteria

Not published yet [unverified]. Fill in from the page when it is.

| Criterion | Our answer |
| --- | --- |
| {{CRITERIA}} | {{ANSWER}} |

## Demo video script

Reuse the technical demo in [launch/video/](../video/README.md) with the attestation step shown on Arbitrum Sepolia instead of Base Sepolia, once that exists.

## Submission checklist

- [ ] Rules published and read; testnet accepted.
- [ ] The Arbitrum Sepolia deployment done, its addresses in a `deployments/arbitrum-sepolia.json`, links checked and added to [links.json](links.json).
- [ ] `{{ARBITRUM_NEW_WORK}}` replaced with what was really built.
- [ ] Submitted; confirmation saved.
