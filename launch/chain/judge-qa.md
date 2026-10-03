# Judge questions and answers

Short answers for a live Q and A or the "anything else" field. Every claim here is about what is built and on testnets today; where something is a plan, it says so.

## Why not just use GitHub Sponsors or Stripe?

They pay a person or an organization, on trust, for nothing in particular. A bounty here is per issue and held by a program, not by us and not by the maintainer: the funder can't take it back while it is open, and nobody can pay it out without both the attester's and the approver's signatures. It pays the operator of whichever agent did the work, across borders, in devnet USDC, from a link. The reputation that comes with it is an attestation anyone can check, not a profile someone wrote about themselves. Sponsors and Stripe are fine for funding a person; they don't tie money to a merged change.

## What stops gaming?

- Only pull requests the office itself opened on the repository count (`Floor.officePull`). A fork's pull request never does, whatever its branch is called.
- Money moves only after a person with write, maintain or admin permission merged it (asked fresh from GitHub, not taken from a list) and an office admin approved the payout in the review inbox. The program needs both signatures.
- A merge by a bot or an app earns nothing. A merge by the agent's own operator is labelled `self` and shown apart on the board (the board can hide self-merges).
- The board counts distinct maintainers, so one friendly merger stands out.
- A revert within 14 days counts against the agent; a close by a maintainer counts too.
- A bounty nobody releases goes back to each funder after expiry; anyone can crank the refund.
- Only attestations by attesters you trust count when the board is rebuilt, since anyone can write to a public schema.

## Why testnet?

The rules don't ask for mainnet. Mainnet waits on an independent audit of the program and the contracts, and on moving the approver key off the office's machine. Every address is public: the escrow program on Solana devnet (`JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6`), the proof-of-merge schema on Base Sepolia (`0x368e9023c13393aea075e78cae18e804725b0d1bb3e2b1a6c1117d759a01a900`), and the rest in [colosseum-worlds-fair.md](colosseum-worlds-fair.md). There is no token, no NFT and no points, so there is nothing to launch.

## Is the office yours?

No. The 3D office, desks, terminals, voice, boards and deploy scripts are agent-office by webdevcody / AgentSystemLabs (MIT), credited on every page. Ours is mission control, the security layer and everything on-chain, from 2026-10-01. The exact commits are in [disclosure.md](disclosure.md), generated from git, with the upstream pull requests our branch carries listed apart.

## Isn't the attester an oracle you have to trust?

Yes, in v1. The office's attester key vouches that GitHub reported a merge by a person with write access, and the approver signs only after an admin approves, so one stolen key can't pay anyone. The trust point is the office. v2 (the Solana Foundation grant's first milestone) adds a GitHub App attester any repository can run, and m-of-n attesters, so no single office is trusted. The board already only counts attesters a reader chooses to trust.

## What is the business?

Open core. The escrow program, SDK and board stay MIT, and the outcome data is CC0. Revenue: a hosted mission control seat for teams running agent fleets, and later a 1 to 2 percent fee on released bounties, once the program is audited and on mainnet. The market is every team running several coding agents; mission control is useful to them on day one with the chain off.

## Can one project be judged in several tracks?

The FAQ says one product per team. Whether that product can be considered in both the Solana and the Base track is not written down. We asked in the Colosseum Discord.

```field name="Discord answer on multiple tracks" max-chars=600
{{DISCORD_MULTITRACK_ANSWER}}
```

If the answer is one track, we lead with Solana and describe Base as how the reputation is kept.

## What happens to a worker's keys?

Workers never see the office's key files' paths through their environment (`CHAIN_*`, `X402_*` and `AGENT_OFFICE_*` variables are stripped), but they run as the same OS user and could read the files. That is why every key is a dedicated testnet key with nothing of value on it, and why mainnet waits on moving the approver key elsewhere. It is written in the README's security notes.
