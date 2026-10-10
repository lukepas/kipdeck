# Vultr Agent Rush (lablab.ai)

**Drafted on 2026-10-01 under the old name.** The product is now Kipdeck, the inbox for your AI coding agents, built on agent-office (MIT, by webdevcody / AgentSystemLabs), with Proof of Merge as its payout layer. Refresh the product name, what is built and the disclosure from [chain/disclosure.md](chain/disclosure.md) before you use this kit.

Last checked: 2026-10-01. Sources: the lablab.ai event page and lablab's general submission guidelines (links below). The event schedule is "to be announced", so every time below is [unverified] until lablab publishes it.

Plan: the challenge "Blast Radius Zero: Safe Agent Execution on Vultr" asks for a web-based agent doing real work with every action inside a sandbox on Vultr. That is Agent Office with the Vultr deploy (branch `launch/vultr-deploy`) and per-worker Docker sandboxes (branch `launch/docker-sandbox`): coding agents at desks, each in its own container, every model call through Vultr Serverless Inference.

Code status on 2026-10-01: `launch/vultr-deploy` and `launch/docker-sandbox` have no commits, so none of the Vultr deploy, Serverless Inference routing or sandboxing exists yet. Everything in the description and video below is the plan for the build week. The nearest working piece is `launch/nebius-nemotron`, which shows how to point OpenCode workers at an OpenAI-compatible endpoint through their inline config; the same approach should work for Vultr [unverified until built].

## Deadline

- Online build phase: **2026-11-03 to 2026-11-08** [unverified: start and end times, time zone].
- On-site day: **2026-11-08, Salt Lake City, Utah** (Mountain Time, MST, UTC-7 after 2026-11-01), for approved participants only. Travel and accommodation are not covered.
- Submission cut-off: expected on 2026-11-08 [unverified]. Re-check the event page on 2026-10-15 and on 2026-11-02 and update `deadlines.json` with the real time.
- Sign up by 2026-10-15 (internal) so the on-site request has time to be approved.

## Links

- Event page (sign up, submit): https://lablab.ai/ai-hackathons/vultr-hackathon
- Submission guidelines (field limits): https://lablab.ai/ai-articles/hackathon-guidelines
- lablab Discord: https://discord.gg/lablabai
- Terms: https://lablab.ai/terms-of-use
- Vultr: https://www.vultr.com/ (Serverless Inference is OpenAI-compatible)

## Eligibility checklist

- [ ] lablab.ai account, signed up to the event, and joined the Discord.
- [ ] Team of 1 to 6 (solo is allowed).
- [ ] For the on-site day: approval from lablab, a US travel authorization (ESTA for Lithuanian citizens), flights and a hotel at your own cost. The Innovation Agency Lithuania call may refund the travel: see [innovation-agency-lithuania.md](innovation-agency-lithuania.md).
- [ ] Vultr account; each participant gets $200 of Vultr credits, by a coupon code the page says will be published before kickoff.
- [ ] Backend deployed on a Vultr VM as the control and orchestration layer.
- [ ] **All agent LLM calls through Vultr Serverless Inference.** Agent CLIs that only talk to their own vendor's API (Claude Code, Codex) do not satisfy this: the demo workers must use a harness pointed at Vultr's OpenAI-compatible endpoint. OpenCode takes a custom provider in its inline config (the Nebius branch does this for Token Factory); whether DeepSeek Harness takes a custom base URL is [unverified].
- [ ] Sandboxes run as containers or throwaway instances on Vultr, never inside the app process; Docker is recommended, and OpenSandbox, gVisor or E2B are also accepted.
- [ ] Safety requirements: process isolation with no host or runtime access, no API keys or credentials in the sandbox, time and memory caps on every run, reset or destroy after each task.
- [ ] Required in the submission: GitHub repo with docs, the backend on a Vultr VM, a public demo URL, and a demo video with one safety moment (a blocked `rm -rf` or infinite loop, for example).
- [ ] Employer: check the employer's policy on outside work, IP ownership and accepting prizes.
- [ ] Pre-existing code: the pages read do not address it [unverified]. This is a five-day build event, so ask in the Discord before the start whether building on an existing open source project is fine, and disclose everything.

## Pre-existing code disclosure

Put this in the long description and say it on the first slide.

```field name="Disclosure paragraph" max-chars=800
Built on Agent Office, an MIT open source project by webdevcody / AgentSystemLabs (github.com/AgentSystemLabs/agent-office): the 3D office, agent desks, shared terminals and GitHub boards are upstream work. During Agent Rush we built the Vultr deployment (backend on a Vultr VM), routed every agent model call through Vultr Serverless Inference, and moved each worker into a throwaway Docker sandbox with CPU, memory and time limits, no host credentials, and a reset after every task. Our commits against the upstream baseline: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
```

## Project description

lablab's form (from its general guidelines): title (max 50 characters), short description (max 255 characters), long description (at least 100 words; no maximum stated), tracks and technology tags, cover image (16:9 recommended), video presentation (under 300 MB and within 5 minutes), public GitHub repo, demo application platform and a live demo URL. A slide presentation is expected by habit at lablab events but the guidelines page read did not list it [unverified].

```field name="Title" max-chars=50
Agent Office: Blast Radius Zero
```

```field name="Short description" max-chars=255
A shared 3D office where coding agents work at desks. Every worker runs in its own throwaway Docker sandbox on Vultr, every model call goes through Vultr Serverless Inference, and a bad command never leaves the box.
```

```field name="Long description" min-words=100
Coding agents are useful because they run real commands, and dangerous for the same reason. Agent Office (an MIT open source project by webdevcody) gives a team a 3D office where each coding agent sits at a desk and its live terminal is on the laptop in front of it, so people can watch and step in. For Agent Rush we made that office safe to run in public.

The backend runs on a Vultr VM and orchestrates everything. When you hire a worker and hand it a task, the VM starts a fresh Docker container for it: the repo is mounted, there are no host credentials inside, CPU, memory and wall-clock time are capped, and outbound network is limited to the model endpoint and GitHub. The agent writes code, runs it and runs the tests inside the container, and the office streams its terminal to everyone. Every model call the agent makes goes through Vultr Serverless Inference over the OpenAI-compatible API. When the task ends, the container is destroyed and the next task starts clean.

The containment moment: in the demo, a worker is given a task that tempts it into `rm -rf /` and a runaway loop. The container's limits stop both; the host, the other workers and the office keep running, and the office shows the blocked action on the worker's desk.

Why it matters: teams want coding agents but cannot let them loose on a laptop full of credentials. A shared, visible office with a sandbox per worker is how a team can trust them.

Built on Agent Office by webdevcody / AgentSystemLabs (MIT). Our additions are listed commit by commit: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
```

Tags: Vultr, Vultr Serverless Inference, Docker, TypeScript, three.js, AI agents, sandboxing.

## Judging criteria

The page lists four criteria without weights [unverified: weights].

| Criterion | Our answer |
| --- | --- |
| Application of technology | Vultr VM backend, Vultr Serverless Inference for every model call, Docker sandbox per worker; Pattern A (code execution) end to end |
| Presentation | One clear containment moment in the video; slides with the architecture on one page |
| Business value | Teams adopting coding agents need isolation and visibility; ties into the consultancy pilot offer (branch `launch/business-playbook`) |
| Originality | A shared visual office where people watch sandboxed agents work, not another chat box |

## Demo video script

lablab's limit is five minutes and 300 MB. Keep it short; the judges watch many. The page does not mention AI voiceover [unverified]; narrate it yourself.

Runtime target: 2:30 (limit: 5:00)

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:15 | The office, three workers typing | "These coding agents run real commands. Here is how we keep the blast radius at zero." |
| 0:15-0:40 | Architecture slide: browser, Vultr VM backend, Docker sandbox per worker, Vultr Serverless Inference | "The backend is a Vultr VM. Each worker gets its own container, and every model call goes to Vultr Serverless Inference." |
| 0:40-1:10 | Hire a worker, give it a task; its terminal writes and runs code inside the container | "It writes the code and runs it, but only inside its sandbox." |
| 1:10-1:45 | Containment moment: the worker runs `rm -rf /` and a fork bomb; the container limits kick in; host `docker stats` stays calm; the desk shows the block | "Here it tries to wipe the disk and fork itself to death. The container takes the hit. The host and the other workers do not notice." |
| 1:45-2:05 | Task done: the container is destroyed, `docker ps` shows it gone, next task starts clean | "When the task ends, the sandbox is destroyed. Nothing carries over." |
| 2:05-2:30 | Title card: built on Agent Office by webdevcody (MIT), repo, live demo URL | "Built on the open source Agent Office. Repo and live demo below." |

## Submission checklist

- [ ] Real deadline time copied into `deadlines.json` and the calendar regenerated (`npx tsx launch/tools/calendar.ts`).
- [ ] Discord answer on pre-existing code saved.
- [ ] Backend live on a Vultr VM at `{{DEMO_URL}}`; model calls visible in the Vultr Serverless Inference usage page.
- [ ] Sandbox: no secrets inside (check `env` in a container), limits set, containers destroyed after each task.
- [ ] Video with the containment moment, under 5:00 and 300 MB.
- [ ] Slides (architecture, containment, business value), 16:9 cover image.
- [ ] Public repo with MIT `LICENSE` (upstream notice kept) and setup docs.
- [ ] All `{{...}}` placeholders filled; `npx tsx launch/tools/lint.ts` clean.
- [ ] Submitted on lablab before the cut-off; on-site slot confirmed if travelling.
