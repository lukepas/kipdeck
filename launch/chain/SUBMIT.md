# Colosseum submit day

Last checked: 2026-10-10. The one page to submit from. Every answer below is copied word for word from [colosseum-worlds-fair.md](colosseum-worlds-fair.md) and [disclosure.md](disclosure.md) (a test fails if they drift), in the order of the fields Colosseum's FAQ lists. Fill in the Arena form from top to bottom, then tick the list at the end.

Deadline: Monday 2026-10-12, 23:59 PT, which is Tuesday 2026-10-13 09:59 in Vilnius. Our target is Sunday 2026-10-11. Every team member registers on colosseum.com before the same cut-off; the team leader submits. One product per team.

## Status, said once and the same everywhere

- Testnets only: Solana devnet and Base Sepolia. Nothing on mainnet, nothing audited, no token.
- Bounties hold a devnet test token, called test tokens everywhere. The x402 payment is Circle's test USDC on Base Sepolia.
- No real merge has paid an agent yet. 5 bounties were released on Solana devnet, 77 test tokens in all, all scripted demos with no GitHub merge behind them. The board has 0 merges by others and 0 agents ranked (launch/chain/data/counts.json).
- PR #4 on the demo repository (github.com/zbagdzevicius/ugc-army-demo) was merged on 2026-10-07 by the operator's own account. Under Kipdeck's rule that is self: not counted, nothing paid. In the demo video the merge and payout after it are replays on the office's mock chain, tagged REPLAY.
- The demo repository keeps its old name until after Colosseum, because its devnet bounty accounts are derived from it.
- Prior work: Kipdeck is built on agent-office (MIT) by webdevcody / AgentSystemLabs. Our history starts from two snapshot imports of upstream on 2026-09-30; 11 upstream pull requests were re-committed under our name and are credited to their authors. Ours is everything else, from 2026-09-30, inside the contest. The full answer is the prior work field below.
- The devnet program's upgrade authority is one key; it is not custody-free.

## 1. Before the form

- Every founder: an account on https://colosseum.com/arena (arena.colosseum.org redirects there), profile complete, consent given, before the cut-off.
- Employer permission in writing for all three (outside work, IP, prizes): the request is drafted in `business/employer-clearance-request.md`. The rules make each entrant warrant that entering breaches no employer policy.
- Ask in the Colosseum Discord whether one project can be judged in the Solana and the Base track; paste the answer into [judge-qa.md](judge-qa.md). Until then, lead with Solana.

## 2. Commands on submit day

From a fresh worktree on `origin/main` (never the shared checkout), after the last pull request is merged:

```sh
git fetch origin && git switch -c launch/submit-stamp origin/main
npm ci --ignore-scripts

# 1. Stamp the submitted commit into the disclosure (it reads 226452e4..7b0f7538 today)
sha=$(git rev-parse --short=8 origin/main)
sed -i '' -E "s/226452e4\.\.[0-9a-f]{8}/226452e4..$sha/g" \
  launch/chain/colosseum-worlds-fair.md launch/chain/disclosure.md launch/chain/SUBMIT.md

# 2. Regenerate the commit list and paste it at the end of disclosure.md
npx tsx launch/chain/tools/whats-new.ts > /tmp/whats-new.md

# 3. Refresh the counts from chain (read only; a few minutes on the public RPCs)
(cd onchain/attest && npm ci --ignore-scripts) && (cd onchain/reputation && npm ci --ignore-scripts)
(cd onchain/indexer && npm ci --ignore-scripts && npm run index -- --network base-sepolia --rpc https://base-sepolia-rpc.publicnode.com --out /tmp/pom-index/)
npx tsx launch/chain/tools/counts.ts --refresh /tmp/pom-index

# 4. Check everything, then open a pull request with the stamp (never push to main)
npm run launch:check
node --import tsx --import=#tests/css --test tests/launch*.test.ts
```

If `counts.ts --refresh` changes a number, the linter fails on the demand validation field until its text matches; change the text in the kit and here together, then paste the new text.

Publish the public showcase. GitHub Pages is not switched on for the repository yet (the API answers 404), so turn it on with Actions as the source, then run the workflow by hand. It reads only public chain data and holds no keys:

```sh
gh api -X POST repos/zbagdzevicius/kipdeck/pages -f build_type=workflow
gh workflow run showcase-pages.yml -R zbagdzevicius/kipdeck -f public=zbagdzevicius/ugc-army-demo
gh run watch -R zbagdzevicius/kipdeck "$(gh run list -R zbagdzevicius/kipdeck --workflow showcase-pages.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

It publishes https://zbagdzevicius.github.io/kipdeck/ (404 on 2026-10-10, before the first run). Open it in a private window before you paste it. The board will be empty, which is the truth: no merge by anyone else is attested yet.

## 3. Files to upload

| What | File | Where it goes | Status on 2026-10-10 |
| --- | --- | --- | --- |
| Logo | `design/logo/app-icon-512.png` (512x512 PNG, Kip's mark) | The form's logo field | In git |
| Pitch video, 2:00 to 3:00, founder on camera | Recorded from [../video/pitch-script.md](../video/pitch-script.md) (target 2:25), exported 1920x1080 H.264, AAC 48 kHz | YouTube, unlisted; its link in the form | Not recorded yet |
| Product demo, at most 3:00 | `launch/video/out/demo-3min.mp4`, made from `demo-3min-silent.mp4` (2:56) plus the recorded voiceover, by the ffmpeg command in [../video/README.md](../video/README.md) | YouTube, unlisted; its link in the form | The silent cut is rendered; the voiceover is not recorded |
| Demo captions | `launch/video/out/demo-3min-captions.srt` | YouTube, as the English subtitle track of the demo | Rendered |

`launch/video/out/` is ignored by git. On 2026-10-10 the rendered files sit in the worktree `.claude/worktrees/wf_7e8d47ef-320-3/launch/video/out/` of the main checkout; if that worktree is gone, render them again with the commands in [../video/capture/README.md](../video/capture/README.md). Never upload `demo-3min-silent.mp4` itself.

Video titles and descriptions (the rules want all content in English):

- Demo title: `Kipdeck: technical demo (Colosseum Crypto World's Fair)`. Description: all of `launch/video/description.txt`, pasted as is.
- Pitch title: `Kipdeck: pitch (Colosseum Crypto World's Fair)`. Description:

```text
Kipdeck: the inbox for your AI coding agents. Agents get paid only when a human reviewer merges.

Pitch for the Colosseum Crypto World's Fair. Testnets only (Solana devnet, Base Sepolia), test tokens, no real funds, nothing audited.

Source code: https://github.com/zbagdzevicius/kipdeck
Built on agent-office by webdevcody / AgentSystemLabs (MIT): https://github.com/AgentSystemLabs/agent-office
```

Before uploading, watch each video once looking only for secrets: no key files, passwords, sign-in links, `.env` or email addresses on screen.

## 4. The form, field by field

### Product name

```field name="Product name" max-chars=60
Kipdeck
```

### Brief description

The tagline is "The inbox for your AI coding agents"; the entry's story is its payout layer.

```field name="One-liner" max-chars=140
Proof of Merge, the payout layer of Kipdeck: AI coding agents get paid, and earn reputation, only when a human merges.
```

### Problem

```field name="Problem" max-words=120
Teams now run many coding agents at once: Claude Code, Codex, Cursor, Pi. Their output is cheap; a person's review is the bottleneck. Paying for attempts is broken: a maintainer doesn't want to pay for a pull request nobody reviewed, or one an agent merged itself, and the person running the agents doesn't want to do the work and then hope to be paid. Agent reputation today is self-reported: a harness's marketing page, or a benchmark that isn't your repository. Nobody can answer "which of my agents' pull requests actually get merged?" from data they can check.
```

### Solution

```field name="Solution" max-words=200
Kipdeck is the inbox for your AI coding agents. Proof of Merge, its payout layer, adds one rule: a person's merge is the only thing that moves money or reputation for an agent's work.

A maintainer escrows devnet test tokens (standing in for USDC) against a GitHub issue, from the office's board or a Fund this issue Blink. Any office worker can take it. When someone with write access merges the worker's pull request, made by the office on the repository itself and never from a fork, and an office admin approves the payout in the review inbox, the Solana program releases the escrow to the operator's wallet. It needs two signatures: the attester's and the approver's, which the admin gives from a browser wallet. Repositories can also run the attester as a GitHub Action.

The same merge writes an EAS proof-of-merge attestation and ERC-8004 feedback on Base Sepolia. Reverts and closes are attested too. A public page shows the leaderboard (merge rate, time to merge, revert rate per agent and harness), rebuilt from chain data. Outsiders can hire a worker for one task over x402, held until an admin approves it.

No token, no NFT, no points. Testnets only.
```

### Blockchains and tools

```field name="Blockchains and tools" max-chars=400
Solana devnet: native Rust program on solana-program (no Anchor), TypeScript SDK, Solana Actions (Blink on dial.to), Wallet Standard. Base Sepolia: EAS (schema plus a fallback contract), ERC-8004 Identity and Reputation registries, x402 (USDC, EIP-3009, settled by x402.org), viem. Built on agent-office (TypeScript, three.js, Node).
```

### Why Solana, why Base

For a "why this chain" question or the long description. Lead track: Solana. Base is where the reputation record lives.

```field name="Why Solana" max-words=90
Agent work comes in small pieces: fix a flaky test, bump a dependency. A 5 USDC bounty only makes sense when the payout costs a fraction of a cent, settles in seconds, and can be funded from a link (a Blink) with nothing to install. Program-owned vaults hold the money (the devnet upgrade key is one key; mainnet gets a multisig): anyone can crank each funder's refund after expiry, and a release needs both signatures. Every step is an event anyone can count.
```

```field name="Why Base" max-words=80
Reputation should outlive one office and be readable by any tool. EAS on Base Sepolia gives a public, cheap attestation per outcome (merged, reverted, closed) with the merge commit, the harness and the time to merge, and ERC-8004 gives each agent an identity and feedback other agents and registries already read. Base's EAS predeploys mean no contract of ours has to be trusted for the record.
```

### Team and backgrounds

The same three founders and roles as the deck's team slide (https://kipdeck-deck.vercel.app).

```field name="Team" max-words=80
Three founders in Vilnius, building Kipdeck since 30 September. Zygimantas Bagdzevicius, CEO/CTO: ex-Amazon engineer, founded and exited a Lithuanian business that scaled to 400k monthly active users. Lukas Kveraga, founding engineer: ex-Vinted, scaling a high-traffic marketplace. Ernestas Rimkevicius, software engineer: backend, importers and pipelines.
```

### Location

```field name="Location" max-chars=60
Vilnius, Lithuania
```

### Logo

Upload `design/logo/app-icon-512.png`.



### GitHub repository

Public, MIT, with `LICENSE` keeping upstream's notice and `NOTICE` crediting it.

```field name="GitHub repository" max-chars=100
https://github.com/zbagdzevicius/kipdeck
```

### Presentation video

The unlisted YouTube link of the pitch, once uploaded.

```field name="Presentation video" max-chars=100
{{PITCH_VIDEO_URL}}
```

### Product demo video

The unlisted YouTube link of `demo-3min.mp4`, once uploaded.

```field name="Product demo video" max-chars=100
{{DEMO_VIDEO_URL}}
```

### Go-to-market and distribution

```field name="Go-to-market" max-words=150
First users: small teams and open source maintainers who already run several coding agents and drown in their pull requests. They come for the inbox (what needs me now), which works with the chain off. Bounties and proof of merge are the switch they turn on when they want to pay for merged work or show an agent's record.

Channels: build in public on X and Farcaster, the weekly "which coding agent's PRs actually get merged?" board, the agent-office community upstream, and maintainers we invite to point their agents at funded issues.

Business: Kipdeck is self-hosted and open source, free for one engineer. Teams pay per seat for the team tier (USD 30 a month, our assumption; not built yet), later a 1 to 2 percent fee on released bounties once the program is audited and on mainnet. The escrow program and SDK stay MIT.
```

### Demand validation

Numbers from `data/counts.json` only; refresh them first (section 2).

```field name="Demand validation" max-words=80 sources="merged_by_others,agents_ranked,devnet_bounties_released,devnet_test_usdc_released"
Counted from chain data on the submission day, not estimated. Merged agent PRs attested on Base Sepolia: 0. Agents on the board: 0. Bounties released on Solana devnet: 5, scripted demos of 77 test tokens in all, with no GitHub merge behind them. We will refresh these numbers before submitting.
```

### Prior work disclosure

The full answer, at most 1,500 characters. The commit after `226452e4..` is the stamp: re-stamp it on submit day.

```field name="Prior work disclosure" max-chars=1500
Kipdeck is built on agent-office (github.com/AgentSystemLabs/agent-office), MIT, by webdevcody / AgentSystemLabs and community contributors. Upstream started on 2026-09-25, inside the contest period. We are not its authors and not affiliated. Upstream built the 3D office, desks where coding agent CLIs run in live terminals, voice, the GitHub boards and the deploy scripts. Our history starts from two snapshot imports of upstream (commits 01d85bbb = upstream 665aeec, and 226452e4 = upstream 1bc3028, both 2026-09-30); all of that is theirs, and so are 11 upstream pull requests we re-committed under our name (listed with their authors in launch/chain/disclosure.md). Ours, all written during the contest (our first commit is 2026-09-30): the inbox and mission control (attention ranking, review inbox, goals, timeline), a security layer (state files, network and host guards, CSP, worker environment allowlist, untrusted PR handling), and Proof of Merge, the payout layer: the Solana escrow program and SDK, bounties in the office with a Fund this issue Blink, a GitHub Action attester, x402 paid tasks, EAS attestations and ERC-8004 reputation on Base Sepolia, a chain-only indexer and the public showcase. Nothing on-chain existed upstream. Our commits are every commit in 226452e4..7b0f7538 except those 11, the import 01d85bbb and 2 Dependabot bumps. Testnets only. Diff: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
```

### Prior work, short

Only where a field is tiny.

```field name="Disclosure (short)" max-chars=255
Built on agent-office (MIT) by webdevcody / AgentSystemLabs. Ours, from 2026-09-30: the inbox and Proof of Merge (Solana escrow, Base attestations, x402). 11 re-committed upstream PRs listed in launch/chain/disclosure.md.
```

### Other links

For "anything else" or a links field. The showcase only after it opens (section 2).

```field name="Other links" max-chars=800
Landing: https://kipdeck.com
Pitch deck: https://kipdeck-deck.vercel.app
What we added since our import of upstream: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
Public showcase (Proof of Merge board, rebuilt from chain data): https://zbagdzevicius.github.io/kipdeck/
Escrow program on Solana devnet: https://explorer.solana.com/address/JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6?cluster=devnet
Proof-of-merge schema on EAS, Base Sepolia: https://base-sepolia.easscan.org/schema/view/0x368e9023c13393aea075e78cae18e804725b0d1bb3e2b1a6c1117d759a01a900
Upstream, agent-office (MIT): https://github.com/AgentSystemLabs/agent-office
```

## 5. Last checks, then submit

- [ ] Every founder registered on colosseum.com; employer permission saved for all three.
- [ ] The stamp is the submitted commit: `git rev-parse --short=8 origin/main` matches the commit after `226452e4..` in the prior work field.
- [ ] `npm run launch:check` clean and the launch tests pass.
- [ ] Counts refreshed; the demand validation field matches `data/counts.json`.
- [ ] Showcase opens at https://zbagdzevicius.github.io/kipdeck/ in a private window.
- [ ] Both videos uploaded unlisted, opened in a private window, under 3:00, with sound.
- [ ] Every link in the form opened once: https://github.com/zbagdzevicius/kipdeck, https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main, https://kipdeck.com, https://kipdeck-deck.vercel.app.
- [ ] The team leader clicks submit before 2026-10-12 23:59 PT; save the confirmation (a screenshot and the email).
- [ ] After submitting: post day 10 ([posts/2026-10-11.md](posts/2026-10-11.md)) and send upstream the courtesy note in [disclosure.md](disclosure.md).
