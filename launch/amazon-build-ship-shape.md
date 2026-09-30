# Amazon Build Ship Shape, Alexa+ track

Last checked: 2026-09-30. Sources: the Devpost overview and official rules (links below). Anything not stated there is marked [unverified].

Plan: enter the Alexa+ track with a self-hosted remote MCP server for Agent Office (branch `launch/voice-mcp`), so Alexa+ can hire, check on and steer the office's coding agents by voice. Also enter the Open Source mini challenge, which explicitly accepts a fork.

## Deadline

- Submission closes: **Friday 2026-10-23, 12:00 PDT (UTC-7)**. That is 19:00 UTC and 22:00 in Vilnius.
- Submission period opened 2026-08-31.
- Judging: 2026-11-09 12:00 PT to 2026-11-20 12:00 PT.
- Winners announced on or around 2026-12-03, 12:00 PT.
- Internal target: video and friction log done 2026-10-20, submit 2026-10-22.

## Links

- Devpost (register and submit): https://amazonappdev2026.devpost.com/
- Official rules: https://amazonappdev2026.devpost.com/rules
- Resources (Alexa+ MCP guidance): https://amazonappdev2026.devpost.com/resources
- MCP specification 2025-11-25: https://modelcontextprotocol.io/specification/2025-11-25

## Eligibility checklist

- [ ] Age of majority where you live.
- [ ] Not resident in Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea or an OFAC-sanctioned territory. Lithuania is fine.
- [ ] Not hackathon staff, a judge, their household, or an Amazon employee involved in the event.
- [ ] Registered on the Devpost page (free, no purchase needed).
- [ ] An Amazon developer account for the Alexa+ tools. The rules do not require one to register, but the platform tools do [unverified: which console the Alexa+ MCP path needs].
- [ ] Individual, team or organization entry. Pick one and keep it for prize payment.
- [ ] Employer: check the employer's policy on outside work, IP ownership and accepting prizes.
- [ ] **New or significantly updated after 2026-08-31, and the update clearly described and demoed.** The base was created 2026-09-25 by a third party. Ask the organizers (Devpost discussion or the contact on the rules page) whether a fork counts, and describe only our additions as ours. [unverified]
- [ ] Alexa+ track build is one of: a working Agent Skill, a self-hosted MCP server on spec 2025-11-25 or later over Streamable HTTP, or a simulated Alexa+ experience whose source is in the repo. The code must actually run, not just reference docs.
- [ ] Open Source mini challenge: a new open source repo, a fork, a branch or a PR made during the window, with a license file. Must go with a track entry.

## Pre-existing code disclosure

Upstream already ships an MCP server for managing workers, but it speaks stdio to local agents only (upstream PR #192, 2026-09-29). Say so, because a judge reading the repo will find it.

```field name="What is new (for the description)" max-chars=1000
Agent Office is an MIT open source project by webdevcody / AgentSystemLabs: a 3D office where coding agents work at desks. Upstream already has a local stdio MCP server that lets agents manage workers. For this hackathon we added a self-hosted remote MCP server over Streamable HTTP (MCP spec 2025-11-25) with authentication, tools and prompts shaped for voice (hire a worker for an issue, what is everyone doing, pause, approve a pull request), short spoken summaries of long terminal output, and the Alexa+ connection. Full list of our commits and files against the upstream baseline: {{DIFF_URL}}
```

Paste the `whats-new.ts` output after it (see [disclosure.md](disclosure.md)).

## Project description

Required fields: project description, GitHub repository link (public with an open source license, or private and shared with testing@devpost.com and the Amazon team), demo video, product feedback on the tools and APIs used, primary track, and mini challenge if any. Open Source mini challenge adds: contribution URL, repository URL, GitHub username and an impact description. The rules set no character limits; the name and tagline limits are Devpost defaults [unverified].

```field name="Project name" max-chars=60
Agent Office for Alexa+
```

```field name="Elevator pitch" max-chars=200
Ask Alexa what your coding agents are doing. A remote MCP server lets Alexa+ hire, check on and steer the AI workers in Agent Office, a shared 3D office for dev teams.
```

```field name="Project description" max-words=400
Agent Office (an MIT open source project by webdevcody) puts a team's coding agents at desks in a shared 3D office, each with its live terminal on the laptop in front of it. It works well when you are at the keyboard. It does not help when you are making coffee and want to know whether the migration agent is stuck.

We built a self-hosted MCP server for Agent Office on the 2025-11-25 spec over Streamable HTTP, so Alexa+ can talk to the office. Ask "what is everyone working on?" and Alexa reads a two-sentence summary per worker instead of a terminal dump. Say "hire a Claude worker for issue 42" and a new agent sits down at a desk and starts. "Pause the one that is failing tests", "approve the pull request from the docs worker" and "what did I miss?" all map to MCP tools with confirmations for anything destructive.

How it works: the office server already tracks every worker, its terminal and its GitHub state. The MCP server exposes that as tools (list_workers, hire_worker, worker_summary, pause_worker, review_pr), resources (a worker's recent output) and prompts. Summaries come from the terminal history, trimmed for speech. Every call is authenticated with a per-office token, and anything that changes code or merges needs a spoken confirmation.

What is next: notifications pushed from the office ("the release agent needs you"), and multi-office support for teams.

Built on Agent Office by webdevcody / AgentSystemLabs (MIT). Our additions are listed commit by commit: {{DIFF_URL}}
```

```field name="Product feedback" max-words=250
{{PRODUCT_FEEDBACK}}
```

Write the product feedback from the friction log (below): what you tried, what you expected, what happened, how bad it was. A friction log can earn up to a 10 percent judging bonus.

```field name="Open Source mini challenge: impact" max-words=150
We forked Agent Office (MIT) and added a remote MCP transport and voice-shaped tools that any MCP client can use, not only Alexa+. The fork keeps the MIT license; the general parts are offered upstream as pull requests: {{UPSTREAM_PR_URL}}
```

## Judging criteria

Stage two: four criteria at 25 percent each, plus up to a 10 percent bonus for a friction log.

| Criterion (25% each) | Our answer |
| --- | --- |
| Tech implementation | Real MCP server on 2025-11-25 Streamable HTTP, auth, tools, resources and prompts; tests in the repo; show a live call in the video |
| Design | Voice-first answers: short summaries, confirmations before destructive actions, graceful "I did not catch which worker" |
| Potential impact | Every team running several coding agents needs to check on them away from the screen; the server works with any MCP client |
| Quality of the idea | Alexa+ as the manager's voice for a team of AI coworkers, not another timer or shopping list |
| Friction log bonus (up to 10%) | Copy [templates/friction-log.md](templates/friction-log.md) and log while building: task, expected, actual, severity |

## Demo video script

Rules: under three minutes, shows the project working on the target device (or the simulated Alexa+ experience), public on YouTube or Vimeo, English, no unlicensed trademarks or copyrighted music. The rules do not mention AI voiceover [unverified]; narrate it yourself anyway, since the demo is about voice and a synthetic narrator next to Alexa's voice confuses the viewer.

Runtime target: 2:40 (limit: under 3:00)

Screen-record the office in a browser at 1080p and film the Echo device (or the simulator) with a phone. Mix the Alexa audio in cleanly; subtitles on for every spoken line.

| Time | Shot | Voiceover and audio |
| --- | --- | --- |
| 0:00-0:15 | Kitchen, phone in hand, laptop closed; cut to the office with four busy agents | "I have four coding agents working. I am not at my desk." |
| 0:15-0:40 | Echo: "Alexa, what is everyone working on?"; office view as each worker is read out | Alexa's summary, subtitled |
| 0:40-1:05 | "Hire a Claude worker for issue 42"; a new worker walks to a desk and starts | Alexa confirms; "It picked up the issue and started." |
| 1:05-1:30 | "Pause the one that is failing tests"; Alexa asks to confirm; the worker pauses | "Anything destructive needs a spoken yes." |
| 1:30-1:55 | Architecture card: Alexa+ to MCP server (Streamable HTTP, 2025-11-25) to office server to workers | "A self-hosted MCP server exposes the office as tools, resources and prompts." |
| 1:55-2:20 | Terminal: MCP inspector listing the tools and a live call; the repo and license | "It is open source, it works with any MCP client, and it is a fork of Agent Office." |
| 2:20-2:40 | Title card: built on Agent Office by webdevcody (MIT), our additions, repo URL | "Built on the open source Agent Office. Link below." |

## Submission checklist

- [ ] Organizer's answer on forks saved.
- [ ] MCP server passes the spec 2025-11-25 conformance you can check (initialize, tools/list, Streamable HTTP session) and runs against a real Alexa+ path or the simulated experience with source in the repo.
- [ ] Repo public with `LICENSE` (MIT, upstream notice kept), or private and shared with testing@devpost.com and the Amazon team.
- [ ] README says how to run the MCP server and connect it.
- [ ] Video under 3:00, own voice, English, public; no copyrighted music.
- [ ] Product feedback written; friction log attached for the bonus.
- [ ] Track: Alexa+. Mini challenge: Open Source (contribution URL, repo URL, GitHub username, impact).
- [ ] All `{{...}}` placeholders filled; `npx tsx launch/tools/lint.ts` clean.
- [ ] Submitted on Devpost before 2026-10-23 12:00 PDT; confirmation saved.
