# Nebius x NVIDIA Global AI Hackathon

Last checked: 2026-10-01. Sources: the Devpost overview, official rules and resources page, and the Token Factory pages (links below). Anything not stated there is marked [unverified].

Plan: enter the Coding and Agentic Engineering track. Agent Office workers run on NVIDIA Nemotron served by Nebius Token Factory (branch `launch/nebius-nemotron`), inside disposable sandboxes (branch `launch/docker-sandbox`), so a team can run a whole office of coding agents on open models.

Code status on 2026-10-01: `launch/nebius-nemotron` works. `NEBIUS_API_KEY` adds a Token Factory provider to OpenCode workers (the key is only referenced as `{env:NEBIUS_API_KEY}`), `--nebius default` makes model-less OpenCode hires run Nemotron 3 Super, worker cards show Nebius prices and the Spend panel a Nebius floor total, and `TAVILY_API_KEY` adds Tavily's web search MCP server. It has unit, integration and headless-browser tests and `docs/nebius.md`. The branch also carries its own draft kit, `docs/nebius-submission.md`; keep one of the two, not both. `launch/docker-sandbox` has no commits, so every sandbox claim below is planned, and there is no hosted demo yet.

## Deadline

- Submission closes: **Friday 2026-10-30, 10:00 PDT (UTC-7)**. That is 17:00 UTC and 19:00 in Vilnius (Lithuania is already back on EET by then; the US is still on PDT until 2026-11-01).
- Submission period opened 2026-08-26.
- Judging: 2026-12-01 to 2026-12-15. Winners announced 2027-01-11.
- Internal target: video and hosted demo checked 2026-10-27, submit 2026-10-29.

## Links

- Devpost (register and submit): https://nebiusglobalaihackathon.devpost.com/
- Official rules: https://nebiusglobalaihackathon.devpost.com/rules
- Resources: https://nebiusglobalaihackathon.devpost.com/resources
- Nemotron on Token Factory: https://nebius.com/services/token-factory/nemotron
- Token Factory docs (OpenAI-compatible API): https://docs.tokenfactory.nebius.com/

## Eligibility checklist

- [ ] Age of majority where you live.
- [ ] Not resident in Brazil, Quebec, Russia, Crimea, Cuba, Iran or North Korea. Lithuania is fine.
- [ ] Not an employee or family of the organizers, a judge, or a judge's employer; no conflict of interest.
- [ ] Individual, team or organization entry.
- [ ] Registered on the Devpost page.
- [ ] A Nebius account with Token Factory access. The resources page offers $25 of Token Factory credits through a form with an activation code, and $25 more through the free Nebius Builders Program (which also covers Tavily). Set a spending cap anyway.
- [ ] The project runs on Nebius Token Factory or Nebius AI Cloud.
- [ ] It uses at least one NVIDIA open model. The Token Factory Nemotron page lists Nemotron 3 Nano 30B, Nemotron 3 Nano Omni, Nemotron 3 Super 120B and Nemotron 3 Ultra 550B.
- [ ] Public repo on GitHub, GitLab or Bitbucket with an open source license (MIT is fine) and a README with setup steps.
- [ ] A working demo URL (only Physical AI is exempt).
- [ ] Employer: check the employer's policy on outside work, IP ownership and accepting prizes.
- [ ] **Newly created, or significantly updated after the period opened on 2026-08-26.** The base was created 2026-09-25 by a third party. Ask the organizers whether a fork counts and describe only our additions as ours. [unverified]
- [ ] Optional: attend a "Builders and Brews" city event for the $500 city prizes (select it on the form).

## Pre-existing code disclosure

```field name="What is new" max-chars=900
Built on Agent Office, an MIT open source project by webdevcody / AgentSystemLabs (upstream first commit 2026-09-25). Upstream provides the 3D office, the desks where agent CLIs run in terminals, shared terminals and the GitHub boards. For this hackathon we added: Nemotron on Nebius Token Factory as a model source for OpenCode workers, with Nemotron 3 Super as the default when switched on; Nebius prices on worker cards and a Nebius total in the Spend panel; and optional Tavily web search for workers. {{SANDBOX_AND_DEMO_IF_BUILT}} Our commits and files against the upstream baseline: {{DIFF_URL}}
```

Paste the `whats-new.ts` output after it (see [disclosure.md](disclosure.md)).

## Project description

What to submit: the working project, a text description, the demo URL, a public YouTube video of three minutes or less, a public repo with a license and README, feedback on the tools used, and the city event if any. Name and tagline limits are Devpost defaults [unverified].

```field name="Project name" max-chars=60
Agent Office on Nemotron
```

```field name="Elevator pitch" max-chars=200
A 3D office where a team's coding agents work at desks, now running on NVIDIA Nemotron via Nebius Token Factory, each in its own sandbox. Open models, open source, shared.
```

```field name="About the project" max-words=450
## Inspiration
Coding agents are becoming coworkers, but most teams run them on closed models, one terminal tab at a time. Agent Office, an MIT open source project by webdevcody, already gives a team a shared 3D office where each agent sits at a desk with its live terminal. We wanted that office to run on open models, on infrastructure a team controls.

## What it does
Every OpenCode worker in the office can now use NVIDIA Nemotron served by Nebius Token Factory. Hire a worker at a desk, give it a GitHub issue, and it writes code, runs the tests and opens a pull request, while the team watches its terminal on the laptop in front of it and can step in. [planned, launch/docker-sandbox: Each worker runs in its own throwaway container with CPU, memory and time limits, so a bad command or a runaway loop stops at the sandbox wall.]

## How we built it
The office adds a nebius provider to each OpenCode worker's inline config, pointed at Token Factory's OpenAI-compatible API, and prices usage from a configurable table. [planned: The office server starts each worker in a Docker container with the repo mounted, no host credentials and a scoped GitHub token, and destroys the container when the worker goes home.] Upstream's TypeScript server and three.js client do the rest.

## Challenges
Tool calling reliability on smaller models, keeping long agent sessions within context, and making sandboxes fast enough to start that hiring a worker still feels instant.

## What we learned
{{WHAT_WE_LEARNED}} (from real runs only; do not guess which model size suits which job)

## What's next
Routing each task to the cheapest model that can do it, and a Nebius AI Cloud deploy script for teams that want the whole office on their own GPUs.

## Credit
Built on Agent Office by webdevcody / AgentSystemLabs (MIT). Our additions: {{DIFF_URL}}
```

```field name="Feedback on the tools" max-words=250
{{TOOL_FEEDBACK}}
```

## Judging criteria

Stage one is pass/fail on the requirements (Token Factory or AI Cloud, an NVIDIA open model, repo, demo, video). Stage two weighs four criteria equally.

| Criterion (equal weight) | Our answer |
| --- | --- |
| Technological implementation | Real agents writing, running and testing code on Nemotron via Token Factory, with per-worker cost shown; tests in the repo; sandbox per worker [planned] |
| Design | A team watches and steers its agents in one shared space instead of scattered terminals |
| Potential impact | Teams can run coding agents on open models with visibility and containment, which matters for companies that cannot send code to closed APIs |
| Quality of the idea | Agents as visible coworkers, on open models, safe by default |

Other prizes in reach: track winner (NVIDIA Jetson Orin Nano), Best Tavily Use ($3,000; the branch already wires Tavily search in), Most Valuable Feedback ($100 and NVIDIA swag, 10 winners), city winner ($500, 20 winners) if attending an event.

## Demo video script

Rules: less than three minutes (the rules say "less than three (3) minutes"; aim under), public on YouTube. The rules do not mention AI voiceover [unverified]; narrate it yourself.

Runtime target: 2:50 (limit: under 3:00)

The 1:35-2:00 shot needs `launch/docker-sandbox`, and the 1:10-1:35 shot needs Token Factory's usage page to show the calls. If the sandbox is not built, replace that shot with the worker card's Nebius price and the Spend panel's floor total, which exist.

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:15 | The office with four agents typing at desks | "This is a team's office. The coworkers typing are coding agents, and all of them run on NVIDIA Nemotron." |
| 0:15-0:40 | Hire a worker, pick Nemotron on Token Factory in the hire dialog, give it an issue | "Hire a worker, pick the model, hand it a GitHub issue." |
| 0:40-1:10 | Its terminal: reads the code, edits, runs tests, a test fails, it fixes it | "It writes the change, runs the tests, and fixes what fails." |
| 1:10-1:35 | Token Factory dashboard showing the calls and the model | "Every call goes to Nemotron on Nebius Token Factory." |
| 1:35-2:00 | Sandbox: the worker tries a destructive command and the container stops it; host untouched | "Each worker lives in its own container. When it does something it should not, the damage stays inside." |
| 2:00-2:25 | Pull request opened; a teammate reviews it in the office | "The pull request lands on the board and a human reviews it." |
| 2:25-2:50 | Architecture card and title: built on Agent Office by webdevcody (MIT), repo, demo URL | "Built on the open source Agent Office. Our additions and the demo are linked below." |

## Submission checklist

- [ ] Organizer's answer on forks saved.
- [ ] Nemotron through Token Factory is the default model in the demo office; screenshot of the Token Factory usage page.
- [ ] Hosted demo at `{{DEMO_URL}}` works for a stranger, with spending caps and sandboxes on.
- [ ] Public repo, MIT `LICENSE` with upstream notice, README with setup steps.
- [ ] Video 3:00 or less, public on YouTube, own voice.
- [ ] Track: Coding and Agentic Engineering. Tool feedback filled in.
- [ ] All `{{...}}` placeholders filled; `npx tsx launch/tools/lint.ts` clean.
- [ ] Submitted on Devpost before 2026-10-30 10:00 PDT; confirmation saved.
