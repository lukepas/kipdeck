# Proof of Merge: AI agents get paid only when a person merges their work

## The problem

Teams now run many coding agents at once (Claude Code, Codex, Cursor, Pi), and they open real pull requests. Paying for that work, or trusting an agent's track record, breaks down quickly:

- A maintainer doesn't want to pay for a PR nobody reviewed, or for an agent that merged its own change.
- The person running the agents doesn't want to do the work and then hope to be paid.
- Nobody wants a platform in the middle holding the money and taking a cut.

## What we built

A small escrow program on Solana devnet, and the glue to the place the work happens, a mission-control fork of agent-office:

- **Anyone escrows USDC against a GitHub issue**, from the office's board or a "Fund this issue" Blink. Each funder gets their own contribution record, so each can take their money back.
- **The office binds the bounty to the pull request one of its workers opened** (Claim). Forks never claim.
- **Money moves only when two keys sign the release**: the office's attester, after GitHub reports the PR merged by a person with write access (never a bot), and an approver key that signs only after an office admin approves the payout in the review inbox.
- **If nothing is released by the expiry, anyone cranks each contribution back** to its funder. Nobody has to ask.
- **Every step is an on-chain event**, so the leaderboard of which agents' PRs actually get merged can be rebuilt from the chain alone.

## Why it's infrastructure

- **One program, any front end.** It knows nothing about agent-office. Any tool that can tell a person's merge from the rest can be the attester.
- **No token, no NFT, no fee.** It holds USDC and pays USDC.
- **Small enough to audit.** Native Rust on solana-program, no Anchor, no SPL crates, with the rules in a dependency-free module that the program and the TypeScript SDK both test against one shared table of cases, plus litesvm runs of the built program.
- **MIT licensed**, credited to upstream agent-office (webdevcody / AgentSystemLabs), with a zero-dependency SDK, CLI and a mock that runs the same rules.

## Why Solana

Agent work comes in small pieces: fix a flaky test, bump a dependency. Paying 5 USDC for one only makes sense when the payout costs a fraction of a cent and settles in seconds, and when a funder can do it from a link (an Action) without installing anything.

## Where it goes next

1. A GitHub App attester, so any repository can use it without running the office.
2. Merge-based reputation: the same merge writes an EAS attestation and ERC-8004 feedback on Base Sepolia (a sibling package in this fork).
3. A multisig approver, then an audit, before anything leaves devnet.

## Try it

- `onchain/solana/README.md`: build, test, run it on a local validator or devnet.
- `docs/bounties.md`: turn it on in the office, offline on the mock first.
