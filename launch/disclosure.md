# Pre-existing code disclosure

Last checked: 2026-09-30

Every program in this folder asks, in some form, what existed before and what the entrant built. This page is the one source for that answer. Each kit pastes a version of it, trimmed to that form's length.

## The facts

- Upstream project: Agent Office, https://github.com/AgentSystemLabs/agent-office
- License: MIT. `LICENSE` reads "Copyright (c) 2026 AgentSystemLabs". The license and notice stay in the fork unchanged.
- Upstream author: webdevcody (Web Dev Cody), under the AgentSystemLabs organization, with pull requests from other contributors.
- Upstream first commit: 2026-09-25. Our baseline is upstream commit `665aeec` (2026-09-30). Everything up to and including it is upstream work.
- We are not the upstream author and are not affiliated with AgentSystemLabs. We have not been asked to represent them.

## Why the dates matter

The upstream project did not exist before 2026-09-25. That cuts both ways:

- Meta VR Start "Adapted / Significantly Updated" is for projects that existed before 2026-09-24. Agent Office did not, so the Adapted division probably does not fit. See [meta-vr-start.md](meta-vr-start.md).
- Amazon (period opened 2026-08-31), Nebius (2026-08-26) and Colosseum (2026-09-14) all ask for projects that are new or significantly updated during the period. The base was created inside those periods, but by someone else. The rules do not say whether a fork of a third-party open source project counts as the entrant's own new project. Ask each organizer in writing before submitting (task on 2026-10-01 in the [timeline](README.md)).

## Disclosure text, long form

Use this where the form has room (Colosseum "anything else judges should know", Devpost "About the project", grant applications).

```field name="Disclosure (long)" max-chars=1500
This project is a fork of Agent Office (github.com/AgentSystemLabs/agent-office), an MIT-licensed open source project created by webdevcody (AgentSystemLabs) with community contributors. Upstream built the 3D multiplayer office, the desks where Claude Code, Codex, OpenCode, Grok, Muse and DeepSeek Harness workers run, the shared live terminals, voice chat, the GitHub issue and PR boards, the stdio MCP server for managing workers, and the deploy scripts for AWS, Azure, Railway, Fly.io and Dokploy. Its first commit is dated 2026-09-25. Everything up to upstream commit 665aeec (2026-09-30) is their work, not ours; the MIT license and copyright notice are kept in LICENSE. We are not affiliated with AgentSystemLabs. What we built during this competition is listed below, commit by commit, with a link to the diff against the upstream baseline: {{DIFF_URL}}.
```

## Disclosure text, short form

Use this where every character counts (a 255-character summary, a Devpost elevator pitch).

```field name="Disclosure (short)" max-chars=255
Fork of MIT-licensed Agent Office by webdevcody/AgentSystemLabs (upstream, first commit 2026-09-25). Our work: {{NEW_WORK_ONE_LINE}}. Diff vs upstream: {{DIFF_URL}}
```

## Exactly what is new

Generate this list from git right before each submission, so it is the branch's real contents and not our plans:

```sh
npx tsx launch/tools/whats-new.ts > /tmp/whats-new.md
```

It prints the upstream credit, every commit since `665aeec` and every changed file, grouped into code, tests, docs, deploy and kits. Paste it under the kit's disclosure section and link `{{DIFF_URL}}`, which is `https://github.com/<you>/agent-office/compare/665aeec...main` on the fork.

As of 2026-09-30 the fork has these workstreams in progress, each on its own branch from `665aeec`. Only claim the ones merged and working on the day you submit. [planned: replace with the whats-new output at submission time]

| Branch | What it adds | Used by |
| --- | --- | --- |
| `launch/webxr-mode` | WebXR immersive mode with hand tracking, for the Quest browser | Meta VR Start |
| `launch/voice-mcp` | Remote MCP server over Streamable HTTP (upstream's is stdio only) and voice commands for the office | Amazon Alexa+ |
| `launch/nebius-nemotron` | NVIDIA Nemotron on Nebius Token Factory as a worker model | Nebius x NVIDIA |
| `launch/vultr-deploy` | Deploy to a Vultr VM, workers calling Vultr Serverless Inference | Vultr Agent Rush |
| `launch/docker-sandbox` | Each worker runs in a throwaway Docker container with limits and no host secrets | Vultr, Nebius, Meta public demo |
| `launch/solana-escrow` | Solana escrow for paying out task bounties to workers | Colosseum, Solana Foundation |
| `launch/x402-base` | x402 pay-per-task payments on Base | Colosseum Base track, Base Builder Grants |
| `launch/security-hardening` | Hardening for a publicly reachable office | all public demos |
| `launch/business-playbook` | Consultancy pilot offer and pricing | grants, Lithuania |
| `launch/submission-kits` | This folder | all |

## Courtesy to upstream

MIT does not require it, but tell the upstream author before the first submission: what the fork is, which competitions it enters, and that the disclosure credits them. It avoids surprises if a judge recognizes the project, and it may lead to contributing the general-purpose parts back. Draft:

```text
Hi Cody, I'm building on Agent Office (MIT) in a fork for a few hackathons this autumn
(Meta VR Start, Amazon Build Ship Shape, Nebius x NVIDIA, Vultr Agent Rush, Colosseum).
Every submission credits the upstream project and you by name and lists exactly what the
fork adds (WebXR mode, a remote MCP server, sandboxed workers, ...). If any of it is useful
upstream I'm happy to open PRs. Thanks for building it.
```
