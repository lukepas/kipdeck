# Colosseum Tempo track (stretch)

Last checked: 2026-10-03. Sources: the Colosseum rules PDF (section 14: "Tempo track: $100,000 will be awarded across 10 of the best products that integrate with the Tempo blockchain") and Tempo's connection details page. Whether one submission can be judged in several tracks is [unverified]; see [judge-qa.md](judge-qa.md).

This is not a separate entry. Colosseum allows one product per team, so the Tempo work would be part of the same Proof of Merge submission (a fork of agent-office, MIT, by webdevcody / AgentSystemLabs), which leads with Solana. It is a stretch: do it only if the Solana and Base parts are recorded and stable by 2026-10-06.

Candidate integration, smallest first:

1. Point the proof-of-merge attestor at Tempo's testnet, Moderato (chain id 42431, `https://rpc.moderato.tempo.xyz`), using the MergeAttestor fallback contract (Tempo has no EAS predeploy that we know of [unverified]). The office's chain-id guard would take a second allowed id.
2. Take x402 paid tasks in a Tempo stablecoin, if a facilitator supports Moderato [unverified: the x402.org facilitator's supported list on 2026-10-03 named Base Sepolia and Solana devnet, not Tempo].

Fees on Tempo are paid in stablecoins; there is no native gas token. Nothing here is built.

## Deadline

- Same as the main entry: **2026-10-12, 23:59 PT (PDT, UTC-7)**, 2026-10-13 09:59 in Vilnius. See [colosseum-worlds-fair.md](colosseum-worlds-fair.md).
- Go or no-go: 2026-10-06. After that, only polish.

## Links

- Rules (PDF): https://colosseum.com/legal/Crypto%20World%27s%20Fair%20Hackathon%20Rules.pdf
- Tempo connection details: https://tempo.xyz/developers/docs/quickstart/connection-details
- x402 facilitator's supported networks: https://www.x402.org/facilitator/supported

## Eligibility checklist

- [ ] Discord answer on multiple tracks pasted into [judge-qa.md](judge-qa.md). If one track only, drop this.
- [ ] Moderato only; no Tempo mainnet.
- [ ] A Moderato wallet funded from Tempo's faucet (manual step if it needs a browser) [unverified: where the faucet is].

## Pre-existing code disclosure

Covered by the main entry's disclosure ([disclosure.md](disclosure.md)). If the Tempo integration ships, add one line to the commit list; nothing else changes.

## Project description

```field name="Tempo integration" max-words=60
{{TEMPO_WORK}}: proof-of-merge attestations for AI coding agents' merged pull requests, written on Tempo's Moderato testnet with the same contract and chain-id guard as on Base Sepolia, so the public leaderboard reads both.
```

## Judging criteria

The same six criteria as the main entry (rules, section 8). The track adds one question: does the product integrate with Tempo? Answer with the Moderato contract address and one attestation link, or don't claim the track.

## Demo video script

No separate video. If it ships, add a 10-second insert to the technical demo in [video-scripts.md](video-scripts.md): the same merge attested on Moderato, shown in Tempo's explorer.

## Submission checklist

- [ ] Go or no-go decided on 2026-10-06 and written here.
- [ ] If go: contract deployed on Moderato, address in `onchain/attest/deployments/tempo-moderato.json`, link checked and added to [links.json](links.json).
- [ ] Track named in the form only if the Discord answer allows it.
