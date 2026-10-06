# Pre-existing code disclosure

Last checked: 2026-10-03

Every program in this folder asks what existed before and what we built. This page is the one answer. The Colosseum kit pastes the form text below as is; the other kits trim it.

## The facts

- Upstream: agent-office, https://github.com/AgentSystemLabs/agent-office
- License: MIT. `LICENSE` reads "Copyright (c) 2026 AgentSystemLabs" and stays unchanged in the fork.
- Upstream author: webdevcody (Web Dev Cody), under AgentSystemLabs, with pull requests from community contributors.
- Upstream's first commit: 2026-09-25, inside the Colosseum contest period (which started 2026-09-14).
- Baseline: upstream commit `665aeec` (2026-09-30). Everything up to and including it is upstream work.
- After the baseline, our branch was rebased onto upstream, so it also carries 16 upstream pull requests (by webdevcody and other contributors). They are upstream work too. `whats-new.ts` lists them separately.
- Our own commits start on 2026-10-01. They are mission control, the security layer and everything on-chain. Nothing on-chain existed upstream.
- We are not affiliated with AgentSystemLabs and don't speak for them.

## Form text

The Colosseum form's prior work answer, at most 1,500 characters:

```field name="Disclosure (Colosseum)" max-chars=1500
Proof of Merge is a fork of agent-office (github.com/AgentSystemLabs/agent-office), MIT, created by webdevcody / AgentSystemLabs with community contributors. Upstream started on 2026-09-25, inside the contest period. We are not its authors and not affiliated. Upstream built the 3D multiplayer office, desks where coding agent CLIs run in shared live terminals, voice, the GitHub issue and PR boards and the deploy scripts. Everything up to upstream commit 665aeec (2026-09-30) is theirs, and so are 16 later upstream pull requests that our branch carries because it is rebased on upstream. Ours, all written during the contest (our first commit is 2026-09-30): mission control (attention ranking, goals and milestones, review inbox, timeline, reminders), a security layer (state files, network and host guards, CSP, worker environment allowlist, untrusted PR handling), and everything on-chain: the Solana escrow program and SDK, bounties in the office with a Fund this issue Blink, a GitHub Action attester, x402 paid tasks, EAS proof-of-merge attestations and ERC-8004 reputation on Base Sepolia, a chain-only indexer and the public showcase. Nothing on-chain existed upstream. Our commits are exactly the ones by our authors in 665aeec..{{HEAD_SHA}}; the list is generated from git in launch/chain/disclosure.md. Testnets only. Diff: {{DIFF_URL}}
```

A short form, where a field is tiny:

```field name="Disclosure (short)" max-chars=255
Fork of agent-office (MIT) by webdevcody / AgentSystemLabs, upstream since 2026-09-25. Ours, from 2026-10-01: mission control and everything on-chain (Solana escrow, Base proof of merge, x402). Diff: {{DIFF_URL}}
```

## Exactly what is new

Generate the list from git right before submitting, so it is what the branch contains and not what we meant to build:

```sh
npx tsx launch/chain/tools/whats-new.ts > /tmp/whats-new.md
```

It prints the upstream credit, our commits since `665aeec`, the upstream pull requests in the same range (credited to upstream), and every changed file grouped into code, on-chain packages, tests, docs, deploy and kits. Commits are told apart by author: the names in `deadlines.json` (`fork.authors`) are ours, every other author is upstream's. Paste the output at the end of this page on submission day.

Where each part lives:

| Part | Ours or upstream | Where |
| --- | --- | --- |
| The office, desks, terminals, voice, boards, deploy scripts | upstream | most of `src/`, `deploy/`, `bin/` |
| Mission control | ours | `src/server/mission.ts`, `src/shared/attention.ts`, `src/shared/review.ts`, `docs/mission-control.md` |
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
| agent-office (the upstream itself) | 665aeec and later upstream PRs | MIT | the whole fork |
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

MIT doesn't require it, but tell the upstream author before submitting: what the fork is, what it enters, and that every page credits them. Draft:

```text
Hi Cody, I'm building on agent-office (MIT) in a fork called Proof of Merge for the
Colosseum Crypto World's Fair: mission control for many agents, plus testnet-only
bounties and proof-of-merge attestations. Every page credits agent-office and you by
name, and the disclosure lists exactly which commits are ours. If any of it is useful
upstream I'm happy to open PRs. Thanks for building it.
```
