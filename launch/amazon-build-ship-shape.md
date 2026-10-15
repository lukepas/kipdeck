# Build, Ship, Shape: Amazon Developer Hackathon - Kipdeck for Alexa+

Last checked: 2026-10-14. Checked 2026-10-14 against the live Devpost overview, official rules and resources page (fetched with curl; plain WebFetch got HTTP 403). The submission form itself sits behind a Devpost login, so the field list below comes from the published "What to Submit" section and the rules, plus Devpost's standard project form. Anything not stated by the organizers is marked [unverified].

Replaces the old kit `launch/amazon-build-ship-shape.md` (drafted 2026-10-01 under the name Agent Office). Product name, tool names and vocabulary are updated to Kipdeck (agent, not worker; see `docs/voice.md`).

Kipdeck is built on agent-office (MIT, by webdevcody / AgentSystemLabs, https://github.com/AgentSystemLabs/agent-office). Upstream has not endorsed this fork.

## Deadline

- Submission closes Friday 2026-10-23, 12:00 PDT (UTC-7) = 19:00 UTC = 22:00 Vilnius (EEST, UTC+3).
- Submission period opened 2026-08-31 10:15 PT.
- Judging 2026-11-09 to 2026-11-20; winners on or around 2026-12-03 12:00 PT.
- Internal targets: build frozen Tue 2026-10-20 evening, video and friction log Wed 2026-10-21, submit Thu 2026-10-22 (one day of slack).
- Days left today: 9.

## Links

- Hackathon page (register, then "Enter a submission"): https://amazonappdev2026.devpost.com/
- Submission form: https://amazonappdev2026.devpost.com/ -> Join hackathon -> My projects -> Enter a submission (login needed)
- Official rules: https://amazonappdev2026.devpost.com/rules
- Resources: https://amazonappdev2026.devpost.com/resources
- MCP Streamable HTTP transport (spec linked from the resources page): https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http
- Agent Skills / MCP Apps (linked from resources): https://apps.extensions.modelcontextprotocol.io/api/#build-with-agent-skills
- Questions: "Email the hackathon manager" link on the overview page; Discussions tab on Devpost

## Fit

- Eligibility: open to all countries except Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea and OFAC-sanctioned territories. Lithuania is fine. Individuals, teams and incorporated organizations may enter.
- Prize pool: $138,000 cash (page says $190K value with AWS credits). 55,108 registered participants on 2026-10-14, so odds are long.
- Track fit: the Alexa+ track asks for "a working Agent Skill or a self-hosted MCP server, implementing MCP spec version (minimum acceptable version is 2025-11-25)" over Streamable HTTP, or a simulated Alexa+ experience in a web app with its source in the repo. A remote MCP server over the Kipdeck inbox is exactly that.
- The rules list "basic MCP wrapper around an existing API" and "single-turn Q&A bot" as obvious ideas, and "agentic workflow that orchestrates across services", "context-aware add-on that maintains state across sessions" and Agent Skills as creative ones. Our entry must show multi-turn state (Alexa remembers which agent you were just talking about) and real actions (approve, redirect), not just read-outs.
- Open Source mini challenge: "a branch, a fork, or a pull request ... PRs don't need to be merged; a forked, unmerged version is fine." Kipdeck is a public MIT fork of agent-office, so the contribution qualifies.
- AWS Builder mini challenge is open too ("Amazon Bedrock, AgentCore, Strands SDK, Kiro Crew..."). Only worth it if the simulated Alexa+ page calls Bedrock; see "Your call" below.
- Rule risks to handle in the text:
  - "New & Existing: ... significantly updated after the start of the Hackathon Submission Period. Entrants must explain how their Project was significantly updated." Kipdeck's own commits start 2026-09-30, after the 2026-08-31 start, and the MCP work is all new in October. Say this plainly.
  - "Submission ownership: Be the original work of the Entrant, be solely owned by the Entrant". The base is upstream agent-office (MIT, webdevcody / AgentSystemLabs). Disclose upstream and claim only our additions. Ask the hackathon manager by email before submitting whether an MIT fork with clearly separated additions is acceptable (draft below).
  - "For Alexa+ ... your repo needs to actually call your track's required technology in code, an import, an entry point, a loaded agent/flow/MCP config, not just a mention in the README." Today main has no Streamable HTTP MCP endpoint. Must be built.

## Ask

Hackathon, so no grant ask. Prize targets:

| Target | Cash | Extra | Realistic? |
| --- | --- | --- | --- |
| Alexa+ track, 3rd place | $4,000 | $1,000 AWS credits, featured on Amazon Developer channels | The realistic aim |
| Alexa+ track, 2nd / 1st | $15,000 / $25,000 | $5,000 / $15,000 AWS credits; 1st adds a meeting with the Amazon Developer team | Stretch |
| Open Source mini challenge winner | $5,000 | $5,000 AWS credits, meeting with the Amazon Developer team | Plausible: a real, tested, MIT contribution |

One project can win at most one track prize and one mini-challenge prize. Winners from Lithuania file a W-8BEN; fees and taxes are ours.

## Eligibility checklist and blockers

Every box here must be ticked before submitting. The first one is open in every kit.

- [ ] Sole ownership: confirm a fork of an MIT project counts as solely owned. The rules exclude parents, subsidiaries and affiliates of Amazon, Devpost or a judge's employer; none of those apply to us.
- [ ] Rules fit on ownership: rules require the entry be "solely owned by the Entrant". Send this to the hackathon manager now:
  > Hi, we plan to enter the Alexa+ track with Kipdeck, a public MIT-licensed fork of agent-office (webdevcody / AgentSystemLabs). Our MCP server and voice tools are new and ours, written in October 2026, and we disclose the upstream base and list our commits. Is an entry built on an MIT fork with clearly separated additions acceptable? Thanks, Zygimantas Bagdzevicius, hello@kipdeck.com
- [ ] Build: nothing of the Alexa+ path is on main today (see above). Needs about 6 days.
- [ ] Entrant type: enter as an individual unless a company exists. Organizations must "exist and have been organized or incorporated at the time of entry". [FOUNDERS: company registration status] Prize payment goes to the entrant chosen here; it cannot be switched later.
- [ ] Personal fields on Devpost profile and, if winning, the W-8BEN: legal name, address, date of birth, tax id. [FOUNDERS: fill personally; never by the agent]
- [ ] Alexa+ device access: unknown whether an outside developer can point a real Alexa+ at a self-hosted MCP server. Plan on the simulated path, which the rules accept.

## Pre-existing code disclosure

The form asks for this in "What you built or changed during the submission window" (under Project description). The same text, short, for the Open Source mini challenge and the first frame of the video:

```field name="Disclosure paragraph" max-chars=800
Kipdeck is a public MIT fork of agent-office by webdevcody / AgentSystemLabs (https://github.com/AgentSystemLabs/agent-office), which started on 2026-09-25 and already had a local stdio MCP server for agents. Our fork started on 2026-09-30, after the hackathon opened. Everything on the Alexa+ path is ours and new in October 2026: the Streamable HTTP transport, auth, the five voice tools, spoken summaries and the simulated Alexa+ page. Commits: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
```

## Project description: form answers

Field list. Rows marked "Devpost default" are standard Devpost project-form fields whose limits we could not see without logging in [unverified].

| Field | Required | Limit |
| --- | --- | --- |
| Project name | yes | 60 characters (Devpost default) |
| Elevator pitch / tagline | yes | 200 characters (Devpost default) |
| Thumbnail image | Devpost default | 3:2, JPG/PNG/GIF, up to 5 MB [unverified] |
| About the project (text description) | yes | no stated limit; Markdown |
| Built with | Devpost default | tags |
| "Try it out" links | Devpost default | URLs |
| Image gallery | optional | images |
| Video demo link | yes | YouTube or Vimeo, public, English, under 3 minutes |
| GitHub repository URL | yes | public with a license file detectable in the About section, or private and shared |
| Primary track | yes | Fire TV / Alexa+ / Bee / Ring |
| Mini challenge(s) | optional | AWS Builder, Open Source |
| What you built or changed during the window (project existed before) | yes for us | no stated limit |
| Product feedback (every tool, API or SDK) | yes | no stated limit |
| Open Source: contribution URL, repo URL, GitHub username, description | yes if entering | no stated limit |
| Feature requests | optional | each with priority Critical / Important / Nice-to-have |
| Friction log entries | optional, up to 10% bonus | task, steps, expected vs actual, severity, workaround, suggestion |
| Team members | Devpost default | invite by Devpost username |

### Project name (60)

```field name="Project name" max-chars=60
Kipdeck for Alexa+: what is waiting on me?
```
(42 characters)

### Elevator pitch (200)

```field name="Elevator pitch" max-chars=200
Ask Alexa+ which of your AI coding agents needs you, hear a short summary, then approve a command or redirect an agent by voice. A remote MCP server on Kipdeck, the open source inbox for AI agents.
```
(197 characters. Count again after any edit.)

### About the project (text description)

Paste as Markdown. Every sentence marked {IF BUILT} must be cut if that piece is not working on 2026-10-20.

```field name="About the project"
## Inspiration

Developers now run several AI coding agents at once (Claude Code, Codex, OpenCode and others), each on its own branch. The agents do not need you most of the time. When they do, it is for a few seconds: approve a command, answer a question, review a finished pull request. Kipdeck (https://kipdeck.com) is an open source inbox that sorts every agent into Needs you, Stuck, To review, Working and Idle. But it still needs a screen. When you step away from the desk the agent that wants permission to run `npm test` sits there for an hour.

## What it does

Kipdeck for Alexa+ lets you run that inbox by voice.

- "Alexa, what is waiting on me?" Alexa+ reads the waiting agents, most urgent first, each by its task name: "Two things. Fix the flaky checkout test wants to run npm test. Add CSV export has a pull request ready to review."
- "Approve it." The approval goes back to the exact request it was read from (each approval has an id, so a late answer can never land on a different prompt). Anything Kipdeck tags Destructive or Outside the repo is refused by voice and left for the screen.
- "Tell it to skip the e2e tests and push." The words are typed into that agent's terminal as its next prompt.
- "What did the docs agent do?" A two-sentence spoken summary of its last turn and its changed files.
- Follow-ups work across turns: "it" and "that one" refer to the last agent Alexa talked about.

## How we built it

Kipdeck already knows each agent's state, its pending approvals (held open from Claude Code's PermissionRequest hook) and its review brief. We added:

1. A self-hosted MCP server inside the Kipdeck server on the 2025-11-25 spec over Streamable HTTP (`POST /mcp`, JSON-RPC 2.0, stateless), behind a per-device bearer token from Kipdeck's existing "Pair a device" flow, with Origin checks and every tool's arguments checked against its JSON Schema before it runs.
2. Five voice-shaped tools: `whats_waiting`, `agent_summary`, `approve_request`, `deny_request` and `tell_agent`. Their output is written for speech: short sentences, task names instead of ids, no terminal dumps, no URLs.
3. {IF BUILT} A simulated Alexa+ experience (`/voice` page in the repo): browser speech recognition and speech synthesis, and an agent loop that calls the MCP server's tools over Streamable HTTP and keeps conversation state between turns.
4. Tests for the protocol (initialize, tools/list, tools/call, errors, auth, Origin) and for each tool, in the project's `npm test` suite.

## Challenges we ran into

Writing for the ear. A terminal line like `Bash(rm -rf dist)` has to become "wants to delete the dist folder", and three waiting agents have to fit in one breath. Deciding what voice may approve was the other one: a spoken "yes" is easy to give by accident, so destructive commands stay screen-only.

## Accomplishments that we're proud of

An approval answered by voice goes through the same code path, with the same id check and the same audit line ("Zygimantas allowed by voice: ...") as one clicked in the inbox.

## What we learned

{FILL FROM FRICTION LOG}

## What's next

Proactive notifications ("Alexa, your release agent needs you"), Alexa+ cards for diffs, and multi-project summaries for teams.

## Built on open source, and what is new

Kipdeck is a public MIT fork of agent-office by webdevcody / AgentSystemLabs (https://github.com/AgentSystemLabs/agent-office). Upstream already shipped a local, stdio-only MCP server for agents to manage each other (list, hire, send home, tell). Everything in this entry's Alexa+ path is new during the submission window and ours: the Streamable HTTP transport, auth, the five voice tools, the spoken summaries and the simulated Alexa+ page. Full list of our commits against the upstream baseline: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
```

### Built with (tags)

```
typescript, node.js, model-context-protocol, streamable-http, alexa+, web-speech-api, claude-code, vite, three.js
```
Add `amazon-bedrock` only if the "Your call" item below is taken.

### Try it out links

```
https://github.com/zbagdzevicius/kipdeck
https://kipdeck.com
https://kipdeck-demo.vercel.app
```

### Video demo link

```
{YOUTUBE_OR_VIMEO_URL - public, English, under 3:00}
```

### GitHub repository URL

```
https://github.com/zbagdzevicius/kipdeck
```
Public, MIT, `LICENSE` keeps "Copyright (c) 2026 AgentSystemLabs" and adds our line; `NOTICE` credits upstream. Check the repo's About section shows "MIT license" (the rules say the license must be detectable there).

### Primary track

```
Alexa+
```

### Mini challenges

```
Open Source
```
(Add AWS Builder only if Bedrock is used; see "Your call".)

### What you built or changed during the submission window

```field name="What you built or changed during the submission window"
The project existed before in two layers. Upstream agent-office (MIT, by webdevcody / AgentSystemLabs) started on 2026-09-25. Kipdeck, our fork, started on 2026-09-30, after this hackathon opened on 2026-08-31, and everything in it beyond the upstream imports is ours. For this hackathon specifically we built, in October 2026: the Streamable HTTP MCP server (spec 2025-11-25) inside the Kipdeck server with bearer-token auth and Origin checks; five voice tools (whats_waiting, agent_summary, approve_request, deny_request, tell_agent) with output written for speech; the voice safety rule that keeps destructive approvals off voice; {IF BUILT} the simulated Alexa+ web page with multi-turn state; and tests for all of it. Before this, upstream's only MCP server ran on stdio for local agents and had no voice tools. Commit-by-commit list: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main (paste the output of `npx tsx launch/tools/whats-new.ts` below this paragraph).
```

### Product feedback

Write from the friction log after the build. Skeleton, keep the headings the rules ask for:

```field name="Product feedback"
Tools used and for what:
- MCP specification 2025-11-25, Streamable HTTP transport: the remote server Alexa+ talks to.
- MCP Inspector: {IF USED} checking initialize, tools/list and tools/call by hand.
- {Alexa+ developer preview / Agent Skills, if access was granted} or the simulated Alexa+ path.
- Claude Code: the coding agents Kipdeck manages, and its PermissionRequest hook for approvals.

What worked well: {e.g. the stateless Streamable HTTP mode let us serve MCP from one POST route with no session store.}
What needs work: {e.g. no public way for an outside developer to point a real Alexa+ device at a self-hosted MCP server during the hackathon, so we used the simulated path.}
Onboarding: {honest, from the log}
Would we build with it again: {yes/no and why}
```

### Open Source mini challenge fields

```
Contribution URL: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main  (or the PR / branch URL of the Alexa+ work, e.g. https://github.com/zbagdzevicius/kipdeck/pull/{N})
Project repository URL: https://github.com/zbagdzevicius/kipdeck
GitHub username: zbagdzevicius
```

Description:

```
What we did: added a remote MCP server to Kipdeck, an MIT fork of agent-office (webdevcody / AgentSystemLabs) that gives developers one inbox for all their AI coding agents. It speaks MCP 2025-11-25 over Streamable HTTP, behind per-device bearer tokens, and exposes five tools for checking on agents, answering their permission requests and redirecting them.
How it works: one POST route in the Kipdeck server handles JSON-RPC (initialize, tools/list, tools/call), checks each tool's arguments against its schema, and calls the same approval and terminal code the web inbox uses, so a voice answer and a click are audited the same way. No new dependencies. Tests run in the project's npm test suite.
Why it matters: any MCP client, not only Alexa+, can now ask a developer's machine what its agents need. The general transport is offered upstream as a pull request: {UPSTREAM_PR_URL or "not yet offered"}.
```

### Feature requests (optional)

```
1. Let hackathon and preview developers connect a self-hosted MCP server to a real Alexa+ device or the Alexa app for testing. Why: we could only show the simulated path. Priority: Critical.
2. Proactive notifications from an MCP server to Alexa+ ("your agent needs you"). Why: waiting is the main cost; polling by voice does not fix it. Priority: Important.
3. A documented confirmation pattern for risky tool calls (a spoken PIN or second device). Why: approving code execution by voice needs it. Priority: Important.
```
Edit 1 if Alexa+ device access turns out to exist.

### Friction log (optional, up to 10% bonus)

Log while building; at least five entries. Template per entry:

```
Task: | Steps taken: | Expected: | Actual: | Severity (Blocker/Major/Minor): | Workaround: | Suggestion:
```

### Team

```
Founder-led. Zygimantas Bagdzevicius (CEO/CTO, Vilnius, Lithuania): product and code. [FOUNDERS: team - co-founders undecided, decision D9; add Devpost usernames only once decided]
Contact: hello@kipdeck.com
```

## Judging criteria

Stage one is pass/fail: the repo must call the track's required technology in code (an MCP server on spec 2025-11-25 over Streamable HTTP, or a simulated Alexa+ experience with its source in the repo). Stage two: four criteria at 25 percent each, plus up to a 10 percent bonus for a friction log (from the 2026-10-01 kit; re-check on the rules page).

| Criterion | Our answer |
| --- | --- |
| Tech implementation | Stateless Streamable HTTP MCP server, bearer token per paired device, Origin check, schema-checked tools, tests in `npm test` |
| Design | Answers written for the ear: task names, short sentences; destructive approvals refused by voice |
| Potential impact | Anyone running several coding agents can answer them away from the screen; any MCP client works, not only Alexa+ |
| Quality of the idea | Multi-turn state ("approve it") and real actions, not a read-out wrapper; the rules call a basic MCP wrapper the obvious idea |
| Friction log bonus (up to 10%) | Copy [templates/friction-log.md](templates/friction-log.md) and log at least five entries while building |

## Demo video script

Runtime target: 2:40 (limit: under 3:00)

Narrate in your own voice, English, subtitles on. No copyrighted music. Show demo data (no real client repos). Lead with the voice moment: judges need not watch past 3:00.

| Time | Shot | Voiceover / audio |
| --- | --- | --- |
| 0:00-0:12 | Kitchen, laptop closed; cut to the Kipdeck inbox with three agents, one row in Needs you | "I have three coding agents running. I'm not at my desk." |
| 0:12-0:40 | Voice page (or device): "What is waiting on me?" Spoken answer; inbox rows highlighted as named | Alexa voice, subtitled: "Two things. Fix the flaky checkout test wants to run npm test..." |
| 0:40-1:00 | "Approve it." Inbox card flips to Allowed; agent's terminal continues | "That approval went back to the exact request, with the same audit line as a click." |
| 1:00-1:20 | "What did the CSV export agent do?" Two-sentence summary | Spoken summary |
| 1:20-1:40 | "Tell it to add a test for empty files." Prompt appears in that agent's terminal | "Follow-ups know which agent 'it' is." |
| 1:40-1:55 | An agent asks for `rm -rf build`; "Approve it" is refused by voice | "Destructive commands stay on the screen." |
| 1:55-2:20 | Architecture card: voice -> MCP server (Streamable HTTP, 2025-11-25, bearer token) -> Kipdeck approvals and terminals -> agents. Then MCP Inspector listing the five tools | "A self-hosted MCP server; any MCP client can use it." |
| 2:20-2:40 | Repo, MIT license, NOTICE crediting agent-office by webdevcody | "Built on the open source agent-office. Our additions are listed in the repo." |

## To build before submitting

Verified 2026-10-14: `launch/voice-mcp` is not a branch any more (local or remote). Main has only the stdio MCP server `bin/office-workers.js` (tools list_workers, hire_worker, get_mission, send_home, tell_worker, link_pr). No `/mcp` route under `src/server/http/routes/`, no voice tools, no Alexa+ code. The old MCP core is still recoverable: commit `02f76600` (2026-09-30, "Add an MCP server core with a Streamable HTTP transport behind a bearer token", `src/server/mcp.ts` 245 lines + `tests/mcp.test.ts` 119 lines) exists in the object store, not on any branch. Cherry-pick it onto a fresh branch from `origin/main` and re-check it against today's code.

| # | Item | Estimate |
| --- | --- | --- |
| 1 | Recover `02f76600` onto a branch from fresh `origin/main` (worktree), fix drift, run its tests | 0.5 day |
| 2 | Mount `POST /mcp` as its own route module in `src/server/http/routes/` (registry, not `server.ts`); auth with paired-device tokens (`src/server/devices.ts`); Origin check; `MCP-Protocol-Version` header; keep `tests/size.test.ts` green | 0.5-1 day |
| 3 | Five tools in a module of their own: whats_waiting (from `waitsOnYou` / attention states), agent_summary (review brief), approve_request / deny_request (approvals desk, id-checked, Destructive and Outside-the-repo refused), tell_agent; speech-shaped output; tests | 1.5 days |
| 4 | Simulated Alexa+ page `/voice`: Web Speech API in and out, agent loop calling the MCP tools over HTTP, conversation state for "it" | 1.5 days |
| 5 | Reach from outside: document running it over the existing tunnel or a deployed office (`docs/aws.md`, `docs/self-hosting.md`) | 0.25 day |
| 6 | README + new `docs/alexa.md` (how to run and connect), per AGENTS.md | 0.25 day |
| 7 | `npm run typecheck`, `npm test`, `npm run build`, headless screenshot of `/voice`; PR merged to main | 0.25 day |
| 8 | Video (record, edit, subtitles, upload) | 0.5-1 day |
| 9 | Product feedback, friction log, `whats-new.ts` output, final paste | 0.5 day |
| | Total | about 6 working days of the 9 left |

Cut order if time runs out: drop agent_summary first, then multi-turn "it" (but this weakens "Quality of the idea"), never the MCP endpoint (Stage One pass/fail needs it in code).

Your call (default in brackets):
- Simulated page's language model: [Anthropic API with the existing key path]; alternative Amazon Bedrock Converse with tool use, which also enters the AWS Builder mini challenge (+0.5 day, needs AWS account and model access).
- Go / no-go: [enter only if GitLab work leaves at least 6 free days before 2026-10-22; decide by Thu 2026-10-15].

## Submission checklist

- [ ] Hackathon manager answer on the fork question saved.
- [ ] Go / no-go decided by 2026-10-15.
- [ ] Registered on Devpost (Join hackathon).
- [ ] MCP endpoint on main: initialize, tools/list, tools/call over stateless Streamable HTTP, protocol version 2025-11-25, auth and Origin checks, tests green.
- [ ] Simulated Alexa+ page source in the repo and working in the video.
- [ ] README and `docs/alexa.md` say how to run and connect it.
- [ ] Repo public; About section shows MIT; `NOTICE` credits upstream.
- [ ] Video under 3:00, public on YouTube or Vimeo, English, own voice, subtitles, no copyrighted music or third-party trademarks beyond naming the tools.
- [ ] Every {IF BUILT} sentence kept only if true; all `{...}` placeholders filled; elevator pitch at or under 200 characters.
- [ ] `npx tsx launch/tools/whats-new.ts` output pasted under "What you built or changed".
- [ ] Product feedback and at least five friction log entries.
- [ ] Track: Alexa+. Mini challenge: Open Source (contribution URL, repo URL, username, description).
- [ ] Submitted before Thu 2026-10-22 22:00 Vilnius (hard close Fri 2026-10-23 22:00 Vilnius); confirmation email and screenshot saved.
