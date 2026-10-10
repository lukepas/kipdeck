# Pre-existing code disclosure

Last checked: 2026-10-09

Every program in this folder asks what existed before and what we built. This page is the one answer. The Colosseum kit pastes the form text below as is; the other kits trim it.

## The facts

- Product: Kipdeck, https://github.com/zbagdzevicius/kipdeck. Proof of Merge is its payout layer, the on-chain part of this entry.
- Upstream: agent-office, https://github.com/AgentSystemLabs/agent-office
- License: MIT. `LICENSE` keeps upstream's line "Copyright (c) 2026 AgentSystemLabs" and the MIT text, and adds a line for our changes; `NOTICE` credits upstream.
- Upstream author: webdevcody (Web Dev Cody), under AgentSystemLabs, with pull requests from community contributors.
- Upstream's first commit: 2026-09-25, inside the Colosseum contest period (which started 2026-09-14).
- Our history does not grow out of upstream's commits. It starts from two snapshot imports of upstream's tree, both on 2026-09-30, joined later by a merge:

| Our commit | What it holds |
| --- | --- |
| `01d85bbb` "Import agent-office at 665aeec" | upstream at `665aeec` (2026-09-30 06:03 UTC) |
| `226452e4` "Import agent-office at 1bc3028" | upstream at `1bc3028` (2026-09-30 23:26 UTC), the baseline `whats-new.ts` counts from |

- Everything in those two imports is upstream work.
- 11 upstream pull requests were later re-committed in our history under our name. They are upstream work too, by their upstream authors:

| Our commit | Upstream PR | Upstream author |
| --- | --- | --- |
| ff1b76bd | #262 | webdevcody |
| 4ed900bb | #263 | webdevcody |
| f4869653 | #264 | webdevcody |
| 4d44abae | #265 | webdevcody |
| 3acfd45b | #266 | webdevcody |
| 8e12ea84 | #268 | webdevcody |
| 0f5c49f4 | #272 | webdevcody |
| e825d794 | #271 | webdevcody |
| 0622282c | #274 | webdevcody |
| 9e954b18 | #273 | webdevcody |
| 5db9e681 | #244 | Lohrey |

- Two commits are Dependabot's dependency bumps: neither ours nor upstream's.
- Ours is every other commit, from `bab333ed` on 2026-09-30: our first commit is 2026-09-30. That covers the inbox and mission control, the security layer and everything on-chain. Nothing on-chain existed upstream.
- We are not affiliated with AgentSystemLabs and don't speak for them.

## Form text

The Colosseum form's prior work answer, at most 1,500 characters:

```field name="Disclosure (Colosseum)" max-chars=1500
Kipdeck is built on agent-office (github.com/AgentSystemLabs/agent-office), MIT, by webdevcody / AgentSystemLabs and community contributors. Upstream started on 2026-09-25, inside the contest period. We are not its authors and not affiliated. Upstream built the 3D office, desks where coding agent CLIs run in live terminals, voice, the GitHub boards and the deploy scripts. Our history starts from two snapshot imports of upstream (commits 01d85bbb = upstream 665aeec, and 226452e4 = upstream 1bc3028, both 2026-09-30); all of that is theirs, and so are 11 upstream pull requests we re-committed under our name (listed with their authors in launch/chain/disclosure.md). Ours, all written during the contest (our first commit is 2026-09-30): the inbox and mission control (attention ranking, review inbox, goals, timeline), a security layer (state files, network and host guards, CSP, worker environment allowlist, untrusted PR handling), and Proof of Merge, the payout layer: the Solana escrow program and SDK, bounties in the office with a Fund this issue Blink, a GitHub Action attester, x402 paid tasks, EAS attestations and ERC-8004 reputation on Base Sepolia, a chain-only indexer and the public showcase. Nothing on-chain existed upstream. Our commits are every commit in 226452e4..{{HEAD_SHA}} except those 11, the import 01d85bbb and 2 Dependabot bumps. Testnets only. Diff: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
```

A short form, where a field is tiny:

```field name="Disclosure (short)" max-chars=255
Built on agent-office (MIT) by webdevcody / AgentSystemLabs. Ours, from 2026-09-30: the inbox and Proof of Merge (Solana escrow, Base attestations, x402). 11 re-committed upstream PRs listed in launch/chain/disclosure.md.
```

## Exactly what is new

Generate the list from git right before submitting, so it is what the branch contains and not what we meant to build:

```sh
npx tsx launch/chain/tools/whats-new.ts > /tmp/whats-new.md
```

It prints the upstream credit and the two snapshot imports, our commits since `226452e4`, the 11 re-committed upstream pull requests (each with its upstream number and author), the Dependabot bumps apart, and every file that differs from upstream's snapshot, grouped into code, on-chain packages, tests, docs, deploy and kits. Commits are told apart by the lists in `deadlines.json`: `upstream.imports` and `upstream.carried` are upstream's, the rest by `fork.authors` are ours, anyone else's (a bot's) is neither. Paste the output at the end of this page on submission day, and put the submitted commit (the first 8 characters of `origin/main`'s SHA) in place of `{{HEAD_SHA}}` above.

Where each part lives:

| Part | Ours or upstream | Where |
| --- | --- | --- |
| The office, desks, terminals, voice, boards, deploy scripts | upstream | most of `src/`, `deploy/`, `bin/` |
| The 11 re-committed upstream pull requests | upstream | the commits in the table above |
| The inbox and mission control | ours | `src/server/mission.ts`, `src/shared/attention.ts`, `src/shared/review.ts`, `docs/mission-control.md` |
| Security layer | ours | `src/server/safefs.ts`, `netguard.ts`, `hosts.ts`, `csp.ts`, the environment allowlist in `src/server/workers/env.ts` (a file upstream's refactor created), `src/shared/pulltrust.ts`, `docs/security.md` |
| Bounties in the office, Blink routes | ours | `src/server/bounties.ts`, `src/server/chain/`, `src/server/http/routes/actions.ts`, `docs/bounties.md` |
| Solana escrow program and SDK | ours | `onchain/solana/` |
| GitHub Action attester | ours | `onchain/action/` |
| x402 paid tasks | ours | `src/server/x402/`, `onchain/x402/`, `docs/x402.md` |
| Proof of merge, reputation | ours | `src/server/chain/attest.ts`, `onchain/attest/`, `onchain/reputation/`, `docs/proof-of-merge.md`, `docs/reputation.md` |
| Indexer and public showcase | ours | `onchain/indexer/`, `src/client/showcase/`, `src/shared/showcase.ts`, `docs/showcase.md` |
| These kits | ours | `launch/chain/` |

## Third-party code and licenses

The rules ask for the status and ownership of open-source and third-party code (Colosseum rules, section 9). Direct dependencies, with the versions installed on 2026-10-03:

| Package | Version | License | Used by |
| --- | --- | --- | --- |
| agent-office (the upstream itself) | snapshots 665aeec and 1bc3028, and 11 upstream PRs | MIT | the whole product |
| @lydell/node-pty | 1.2.0-beta.15 | MIT | office (upstream's dependency) |
| @xterm/headless, @xterm/addon-serialize | 6.0.0, 0.14.0 | MIT | office (upstream's) |
| selfsigned | 5.5.0 | MIT | office (upstream's) |
| ws | 8.21.3 | MIT | office (upstream's) |
| three, @xterm/xterm, @xterm/addon-fit, @xterm/addon-web-links | 0.186.1, 6.0.0, 0.11.0, 0.12.0 | MIT | office client (upstream's) |
| react, react-dom, @excalidraw/excalidraw | 18.3.1, 18.3.1, 0.18.1 | MIT | office client (upstream's) |
| marked | 18.0.14 | MIT | office client, kit tests |
| dompurify | 3.4.16 | MPL-2.0 OR Apache-2.0 | office client |
| vite, tsx, concurrently | 8.3.1, 4.23.15, 10.0.5 | MIT | build and dev |
| typescript | 7.0.2 | Apache-2.0 | build |
| playwright-core | 1.63.0 | Apache-2.0 | tests |
| solana-program (Rust crate) | 2.x | Apache-2.0 | `onchain/solana` program |
| serde_json (Rust crate) | 1.x | MIT OR Apache-2.0 | `onchain/solana` tests |
| @solana/web3.js, @solana/kit | 1.99.0, 8.4.0 | MIT | `onchain/solana` SDK tests |
| litesvm | 1.5.0 | MIT | `onchain/solana` tests |
| viem | 2.57.2 | MIT | `onchain/x402`, `attest`, `reputation`, `indexer`, `action` |
| esbuild | 0.28.2 | MIT | `onchain/action` build (bundles `dist/`) |
| @x402/core, @x402/evm, @x402/svm | 2.28.0 | Apache-2.0 | `onchain/x402` |
| @ethereum-attestation-service/eas-sdk | 2.10.0 | MIT | `onchain/attest` |
| @ethereum-attestation-service/eas-contracts | 1.7.1 | MIT | `onchain/attest` tests |

On chain we use contracts we didn't write: EAS's predeploys on Base Sepolia, and the ERC-8004 Identity and Reputation registries (erc-8004-contracts, version 2.0.0) at the addresses in `onchain/reputation/deployments/base-sepolia.json`. Our own contracts are MergeAttestor, TestUSDC (local tests only) and the fallback registries used on local chains.

No root dependency was added for the on-chain work: each `onchain/<name>` package has its own `package.json` (or `Cargo.toml`, `foundry.toml`). Re-check the table with each package's `npm ls --depth=0` before submitting.

## Courtesy to upstream

MIT doesn't require it, but tell the upstream author before submitting: what Kipdeck is, what it enters, and that every page credits them. Draft:

```text
Hi Cody, I'm building on agent-office (MIT) in a product called Kipdeck, entering the
Colosseum Crypto World's Fair: the inbox for many coding agents, plus testnet-only
bounties and proof-of-merge attestations. Every page credits agent-office and you by
name; the disclosure lists exactly which commits are ours, and credits the 11 upstream
PRs we re-committed (#244 by Lohrey, the rest yours). If any of it is useful
upstream I'm happy to open PRs. Thanks for building it.
```
