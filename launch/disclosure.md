# Pre-existing code disclosure

Last checked: 2026-10-01

Every program in this folder asks, in some form, what existed before and what the entrant built. This page is the one source for that answer. Each kit pastes a version of it, trimmed to that form's length.

## The facts

- Upstream project: Agent Office, https://github.com/AgentSystemLabs/agent-office
- License: MIT. `LICENSE` keeps upstream's line "Copyright (c) 2026 AgentSystemLabs" and the MIT text, and adds a line for our changes; `NOTICE` credits upstream.
- Upstream author: webdevcody (Web Dev Cody), under the AgentSystemLabs organization, with pull requests from other contributors.
- Upstream first commit: 2026-09-25. Our history starts from two snapshot imports of upstream, not from upstream's own commits: `01d85bbb` holds upstream `665aeec` and `226452e4` holds upstream `1bc3028` (both 2026-09-30). Everything in them is upstream work, and so are 11 upstream pull requests later re-committed in our history under our name. The commits and their upstream authors are in [chain/disclosure.md](chain/disclosure.md), the disclosure that is kept current; this page is the older kits' version.
- We are not the upstream author and are not affiliated with AgentSystemLabs. We have not been asked to represent them.

## Why the dates matter

The upstream project did not exist before 2026-09-25. That cuts both ways:

- Meta VR Start "Adapted / Significantly Updated" is for projects that existed before 2026-09-24. Agent Office did not, so the Adapted division probably does not fit. The "New" division says "no pre-existing codebases", which a fork of someone else's code may break too. Neither fits cleanly; ask Meta. See [meta-vr-start.md](meta-vr-start.md).
- Amazon (period opened 2026-08-31), Nebius (2026-08-26) and Colosseum (2026-09-14) all ask for projects that are new or significantly updated during the period. The base was created inside those periods, but by someone else. The rules do not say whether a fork of a third-party open source project counts as the entrant's own new project. Ask each organizer in writing before submitting (task on 2026-10-01 in the [timeline](README.md)).

## Disclosure text, long form

Use this where the form has room (Colosseum "anything else judges should know", Devpost "About the project", grant applications).

```field name="Disclosure (long)" max-chars=1500
This project is a fork of Agent Office (github.com/AgentSystemLabs/agent-office), an MIT-licensed open source project created by webdevcody (AgentSystemLabs) with community contributors. Upstream built the 3D multiplayer office, the desks where Claude Code, Codex, OpenCode, Grok, Muse and DeepSeek Harness workers run, the shared live terminals, voice chat, the GitHub issue and PR boards, the stdio MCP server for managing workers, and the deploy scripts for AWS, Azure, Railway, Fly.io and Dokploy. Its first commit is dated 2026-09-25. Our history starts from two snapshot imports of upstream, 01d85bbb (upstream 665aeec) and 226452e4 (upstream 1bc3028), both 2026-09-30. Everything in them is their work, and so are 11 upstream pull requests we re-committed under our name (listed with their authors in launch/chain/disclosure.md). The MIT license and copyright notice are kept in LICENSE. We are not affiliated with AgentSystemLabs. What we built during this competition is listed below, commit by commit, with a link to the diff against the upstream baseline: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main (the 11 upstream PRs are inside it).
```

## Disclosure text, short form

Use this where every character counts (a 255-character summary, a Devpost elevator pitch).

```field name="Disclosure (short)" max-chars=255
Fork of MIT-licensed Agent Office by webdevcody/AgentSystemLabs (upstream, first commit 2026-09-25). Our work: the inbox and Proof of Merge (Solana escrow, Base attestations, x402). Diff: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
```

## Exactly what is new

Generate this list from git right before each submission, so it is the branch's real contents and not our plans:

```sh
npx tsx launch/tools/whats-new.ts > /tmp/whats-new.md
```

It runs the same code as `launch/chain/tools/whats-new.ts`: the upstream credit and the two snapshot imports, our commits since `226452e4`, the 11 re-committed upstream pull requests with their upstream authors, the Dependabot bumps apart, and every changed file, grouped into code, tests, docs, deploy and kits. Paste it under the kit's disclosure section and link the diff, https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main.

As of 2026-10-01 the fork had these workstreams, each on its own branch from the 665aeec import (history: the branches were later merged or dropped, and the repository is now Kipdeck). The status column is what the branch held on 2026-10-01, not the plan. Only claim what is merged and working on the day you submit, and replace this table with the `whats-new.ts` output then.

| Branch | Planned | In the branch on 2026-10-01 | Used by |
| --- | --- | --- | --- |
| `launch/webxr-mode` | WebXR immersive mode with hand tracking, for the Quest browser | Nothing yet (no commits) | Meta VR Start |
| `launch/voice-mcp` | Remote MCP server over Streamable HTTP (upstream's is stdio only) and voice-shaped tools | `src/server/mcp.ts`: MCP handshake, `tools/list` and `tools/call` over stateless Streamable HTTP with a bearer token, rate-limited wrong guesses, Origin checks and argument checks against each tool's schema; schema checks and length limits on the stdio server's four tools. Not yet mounted on the office server; no voice tools, resources, prompts or Alexa+ connection | Amazon Alexa+ |
| `launch/nebius-nemotron` | NVIDIA Nemotron on Nebius Token Factory as a worker model | Working: `NEBIUS_API_KEY` adds a Token Factory provider to OpenCode workers, `--nebius default` makes model-less OpenCode hires run Nemotron 3 Super, Nebius prices on worker cards and a floor total in Spend, optional Tavily web search MCP, unit, integration and headless-browser tests, `docs/nebius.md` | Nebius x NVIDIA |
| `launch/vultr-deploy` | Deploy to a Vultr VM, workers calling Vultr Serverless Inference | Nothing yet (no commits) | Vultr Agent Rush |
| `launch/docker-sandbox` | Each worker runs in a throwaway Docker container with limits and no host secrets | Nothing yet (no commits) | Vultr, Nebius, Meta public demo |
| `launch/solana-escrow` | Solana escrow for paying out task bounties to workers | Nothing yet (no commits) | Colosseum, Solana Foundation |
| `launch/x402-base` | x402 pay-per-task payments on Base | Working: `--x402` (off by default) takes paid tasks at `/api/x402/tasks` (x402 v2, exact USDC by EIP-3009, Base Sepolia by default, Base mainnet with `--x402-network base`, 0.10 USDC by default), facilitator verify and settle, paid tasks held for admin approval unless `--x402-auto`, Basename display; a dependency-free `onchain/x402` package with payer, mock facilitator, MCP server and CLI; tests | Colosseum Base track, Base Builder Grants |
| `launch/security-hardening` | Hardening for a publicly reachable office | State files under `.agent-office` are no longer trusted when git-tracked or symlinked (`safefs.ts`), and saved meetings whose ids or paths leave the checkout are refused; tests. No judge login, spending caps or network limits | all public demos |
| `launch/business-playbook` | Consultancy pilot offer and pricing | Docs: pilot offer, pricing, statement of work, workshop, waitlist page | grants, Lithuania |
| `launch/submission-kits` | This folder | This folder and its tools | all |

## Courtesy to upstream

MIT does not require it, but tell the upstream author before the first submission: what the fork is, which competitions it enters, and that the disclosure credits them. It avoids surprises if a judge recognizes the project, and it may lead to contributing the general-purpose parts back. Draft:

```text
Hi Cody, I'm building on Agent Office (MIT) in a fork for a few hackathons this autumn
(Meta VR Start, Amazon Build Ship Shape, Nebius x NVIDIA, Vultr Agent Rush, Colosseum).
Every submission credits the upstream project and you by name and lists exactly what the
fork adds (so far Nebius models, x402 paid tasks and a remote MCP transport; more planned). If any of it is useful
upstream I'm happy to open PRs. Thanks for building it.
```
