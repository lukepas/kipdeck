# Base Builder Grants (after a mainnet decision)

Last checked: 2026-10-03. Sources: the Base grants team's post "Calling Based Builders" and its nomination form (links below).

**Do not submit testnet work.** Base Builder Grants are retroactive: the team looks for builders whose contribution is "live and making an impact" and "bringing more users onchain". Everything in Proof of Merge (the payout layer of Kipdeck, which is built on agent-office, MIT, by webdevcody / AgentSystemLabs) runs on Base Sepolia and Solana devnet, and stays there until an audit and a deliberate mainnet decision. This kit is ready for that day, and not before.

## Deadline

- **Rolling.** Grants are given in cohorts, mostly found by the team on X and Farcaster; the form is for nominations, and replies aren't guaranteed.
- Our date: revisit on 2026-11-02, after the Colosseum results are known. Nominate only once proof-of-merge attestations and ERC-8004 feedback run on Base mainnet with real users.

## Links

- Program post: https://paragraph.com/@grants.base.eth/calling-based-builders
- Nomination form: https://docs.google.com/forms/d/e/1FAIpQLSfXuEzmiAzRhie_z9raFCF1BXweXgVt18o-DvBuRRgyTygL2A/viewform
- What runs on Base Sepolia today: https://base-sepolia.easscan.org/schema/view/0x368e9023c13393aea075e78cae18e804725b0d1bb3e2b1a6c1117d759a01a900

## Eligibility checklist

- [ ] A mainnet decision made, in writing, after an audit of the contracts we deploy (MergeAttestor) and a review of the office's attester key handling.
- [ ] Real use on Base mainnet by people who aren't us; the counts from the board, not estimates.
- [ ] Grants are 1 to 5 ETH per the post; a wallet ready.
- [ ] Employer permission covers it.

## Pre-existing code disclosure

```field name="Prior work" max-chars=600
Kipdeck, with Proof of Merge as its payout layer, is built on agent-office (github.com/AgentSystemLabs/agent-office), MIT, by webdevcody / AgentSystemLabs; the office is their work. Ours: the inbox and mission control, proof-of-merge attestations (EAS) and ERC-8004 reputation for AI coding agents, a Solana escrow for bounties, x402 paid tasks and a public board. Commits: launch/chain/disclosure.md.
```

## Project description

```field name="What it is" max-words=80
Proof of Merge writes an EAS attestation on Base for every outcome a person causes on an AI coding agent's pull request (merged, reverted, closed), and ERC-8004 feedback that only those outcomes can earn. A public board rebuilt from Base alone answers which coding agents' pull requests actually get merged. {{BASE_MAINNET_USAGE}}
```

## Judging criteria

The post's three questions.

| Question | Our answer |
| --- | --- |
| Unique and fun? | A public, verifiable board of which coding agents actually ship |
| Bringing users onchain? | Every team running agents gets an onchain record per merged PR, without touching a wallet |
| Live and making an impact? | {{BASE_MAINNET_USAGE}} |

## Demo video script

Use the technical demo in [launch/video/](../video/README.md), recorded again on mainnet.

## Submission checklist

- [ ] Mainnet decision recorded.
- [ ] Mainnet usage counted from the board, with links.
- [ ] Nomination sent; the build-in-public thread linked.
