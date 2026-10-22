# Vultr: Agent Rush Hackathon (lablab.ai) - Blast Radius Zero

Last checked: 2026-10-14. Drafted 2026-10-14 from the event page, lablab's submission guidelines, `launch/vultr-agent-rush.md` (drafted 2026-10-01 under the old name, now out of date) and the repo at `main` 719234e1.

Kipdeck is built on agent-office (MIT, by webdevcody / AgentSystemLabs, https://github.com/AgentSystemLabs/agent-office). Upstream has not endorsed this fork.

## Deadline

- Online build phase: 2026-11-03 to 2026-11-08. The page says "Event Schedule: To be announced"; no start or cut-off time is published as of 2026-10-14.
- On-site day: 2026-11-08, Salt Lake City (MST, UTC-7). We go online only: travel is at our own cost, and the Innovation Agency Lithuania refund needs a registered company.
- Submission cut-off: expected 2026-11-08, time not published. Conversions to plan with (Vilnius is EET, UTC+2, in November):
  - If 12:00 MST on 2026-11-08: 21:00 Vilnius, 2026-11-08.
  - If 23:59 MST on 2026-11-08: 08:59 Vilnius, 2026-11-09.
- Internal deadline: submitted by **2026-11-08 18:00 Vilnius (09:00 MST)**, which is safe under either case.
- Re-check the page on 2026-11-02 and put the real time in `launch/deadlines.json` (ids `vultr-build`, `vultr-final`).
- Sign up and join the Discord by 2026-10-15 (internal date in `launch/deadlines.json`).

## Links

- Event page, sign-up and submission: https://lablab.ai/ai-hackathons/vultr-hackathon
- Submission form: lives in the lablab.ai dashboard after you join the event and create a team (login required, so it was not opened). The fields below come from lablab's published guidelines: https://lablab.ai/ai-articles/hackathon-guidelines
- Discord (ask the pre-existing code question here): https://discord.gg/lablabai
- Terms: https://lablab.ai/terms-of-use
- Vultr Serverless Inference endpoint (from the event page): https://api.vultrinference.com/v1 (OpenAI-compatible)
- Repo: https://github.com/lukepas/kipdeck
- Site: https://kipdeck.com
- Replay demo: https://kipdeck-demo.vercel.app
- Showcase: https://lukepas.github.io/kipdeck/

## Fit

The challenge asks for "a web-based agent that performs real work - writing and running code, or operating a real browser - with every action contained inside a sandbox running on Vultr". Required: the backend on a Vultr VM, every LLM call through Vultr Serverless Inference, Docker (or throwaway instances) as the sandbox boundary, a public demo URL and a video with "one containment moment".

Kipdeck is the inbox for AI coding agents: it runs each agent on its own branch, shows who is waiting on whom, and lands code only when a person merges. That is Pattern A (sandboxed code). The merge gate is already the human checkpoint on the blast radius; Agent Rush adds the missing half, a container per task.

What exists today (checked on `main` 719234e1):

- Web inbox with Needs you / To review / Working, review brief with risky diff lines, Merge with Undo (`README.md`, `docs/inbox.md`).
- Worker environment allowlist: workers get a clean allowlist by default, and a `sandbox` policy that passes only terminal variables (`src/server/worker-env.ts:10`, `SANDBOX_ENV` at line 24).
- Budget caps and pause per agent (`docs/spend.md`), max concurrent workers (`--max-workers`).
- OpenCode as a beta agent, configured through inline `OPENCODE_CONFIG_CONTENT` (`src/server/providers/opencode.ts:131`), which is how a custom OpenAI-compatible provider can be passed in.
- `deploy/provision.sh`: one-line install on an Ubuntu or Debian server with Caddy HTTPS (`--domain`) and a non-root `agentoffice` user. `deploy/container/Dockerfile` runs the whole office in one container.
- Agent gate: an agent asking the office to act on other agents waits for a person (`docs/agent-gate.md`).

What does not exist: `docs/security.md:125` says it plainly, "No sandbox. Every worker runs as the office's OS user". The branches `launch/vultr-deploy`, `launch/docker-sandbox` and `launch/nebius-nemotron` named in the old kit are not in the repo (local or remote). Nothing routes to Vultr yet. All of that is the build week.

## Ask

Prize targeted: 1st place, USD 5,000 cash + USD 3,000 Vultr credits. Realistic floor: a top 3 place (3rd is USD 1,000 + USD 1,000 credits). Every participant gets USD 200 of Vultr credits, which covers the VM and inference for the week.

## Eligibility checklist and blockers

Every box here must be ticked before submitting. The first one is open in every kit.

- [ ] Company registration: not needed to enter or win (individuals can take part). Needed only for the Lithuanian travel refund, which is why we go online only. Prize payout to an individual outside the US likely needs a tax form such as W-8BEN [unverified; lablab says payout can take up to 90 days].
- [ ] Personal fields: lablab profile details and the team list are [FOUNDERS: ...]; never fill them from guesses.
- [ ] Pre-existing code: the page does not address it. Get a written answer in the Discord before 2026-11-03 and keep a screenshot.
- [ ] Demo domain: DNS for a kipdeck.com subdomain is a production change; needs a per-action OK.

## Pre-existing code disclosure

The form has no field of its own for this; the full text goes in Additional information (under Project description). Say it on the first slide too.

```field name="Disclosure paragraph" max-chars=800
Kipdeck existed before Agent Rush. It is MIT and built on agent-office by webdevcody / AgentSystemLabs (MIT): https://github.com/AgentSystemLabs/agent-office. Before 2026-11-03 it had the inbox, review and merge, the worker environment allowlist and budget caps, and no sandbox. Built during the event: the Docker sandbox per task, the inference proxy that sends every model call to Vultr Serverless Inference, the OpenCode provider for Vultr, the "Blocked by sandbox" inbox state and the Vultr VM deployment.
```

## Project description: form answers

Fields per lablab's guidelines. The form itself is behind the lablab login.

### Team (dashboard, before the form)

- Team name: Kipdeck
- Members: Lukas Kveraga (sole founder, CEO and CTO).
- Profile fields lablab asks for (country: Lithuania; anything else such as date of birth or phone): [FOUNDERS: personal profile fields, fill yourself]

### Submission title (max 50 characters)

```field name="Title" max-chars=50
Kipdeck: Blast Radius Zero for coding agents
```
(44 characters)

### Short description (max 255 characters)

```field name="Short description" max-chars=255
Coding agents run in a throwaway Docker sandbox on a Vultr VM, every model call goes through Vultr Serverless Inference, and nothing they write reaches your repo until a person merges it in the Kipdeck inbox.
```
(208 characters)

### Long description (min 100 words)

```field name="Long description" min-words=100
Coding agents are useful because they run real commands, and risky for the same reason. A team that lets an agent loose on a laptop full of credentials is one bad command away from a wiped disk or a leaked key. Kipdeck is the open source inbox for AI coding agents: it shows which agent needs you, what it changed and what in the diff is risky, and code lands only when a person presses Merge. For Agent Rush we gave every agent a sandbox on Vultr, so the blast radius of a task is one container.

How it works. The Kipdeck backend runs on a Vultr VM and orchestrates everything. When you give an agent a task, the VM starts a fresh Docker container for it: the task's git worktree is the only thing mounted, it runs as a non-root user with all Linux capabilities dropped, no-new-privileges, a read-only root filesystem, and caps on CPU, memory, process count and wall-clock time. The container's network reaches one place: an inference proxy on the VM. The agent (OpenCode) talks to that proxy as if it were an OpenAI-compatible API; the proxy adds the Vultr key and forwards the call to Vultr Serverless Inference. So every model call goes through Vultr, and no API key, GitHub token or cloud credential is ever inside the sandbox. The agent writes code, runs it and runs the tests inside the container; failures feed back into its next try. When the task ends, the container is destroyed.

The containment moment. In the demo, an agent is handed a task that leads it to run rm -rf on the filesystem and then a fork bomb. The read-only root and the process cap stop both, the container is killed, and the Kipdeck inbox moves the agent to Needs you with "Blocked by sandbox" and the reason. The VM, the other agents and the inbox keep running.

The human checkpoint. Even a well-behaved agent never pushes: the office, outside the sandbox, takes the diff from the worktree and shows it in review with its test runs. Nothing reaches the repository until a person merges it, with Undo.

Why it matters. Teams want coding agents but cannot hand them a developer's machine. One container per task, one key-holding proxy and one person at the merge is a setup a security team can sign off on.

Kipdeck is MIT licensed and built on agent-office by webdevcody / AgentSystemLabs (MIT). What existed before the event and what we built during it is listed in the README and in the Additional information field.
```

### Main track

```
Blast Radius Zero: Safe Agent Execution on Vultr (Pattern A: sandboxed code)
```

### Technologies (tags)

```
Vultr, Vultr Serverless Inference, Vultr Cloud Compute, Docker, OpenCode, TypeScript, Node.js, GitHub
```

### Cover image (16:9)

1920x1080. Left: the Kipdeck inbox with one agent row in Needs you reading "Blocked by sandbox: process limit". Right: a three-box diagram, Browser -> Vultr VM (Kipdeck + inference proxy) -> Docker sandbox per task, with an arrow from the proxy to Vultr Serverless Inference. Title "Kipdeck: Blast Radius Zero". Use the existing logo in `design/logo/`.

### Slides (the event page lists slides under presentation materials)

PDF, 16:9, 6 slides: (1) problem: agents run real commands on machines full of credentials; (2) architecture, one page; (3) sandbox settings table (flag, what it stops); (4) the containment moment, two screenshots; (5) business value: teams adopting coding agents, security sign-off, Team tier USD 20 per seat per month; (6) what existed before vs what we built this week, upstream credit.

### GitHub repository

```
https://github.com/lukepas/kipdeck
```
README must have a "Vultr sandbox" section linking `docs/sandbox.md` (setup on a Vultr VM, the settings, how to reproduce the containment moment).

### Demo application platform

```
Vultr Cloud Compute (Ubuntu VM), Docker
```

### Demo application URL

```
{{DEMO_URL}}
```
Planned: a subdomain such as `rush.kipdeck.com` pointed at the VM, via `deploy/provision.sh --domain`. DNS on kipdeck.com is a production change: ask before doing it. Fallback: the VM's IP with Caddy on a nip.io-style name. The public demo must not let strangers start agents on our key: run it with a password and the replay demo, or a read-only demo mode with a scripted task (decide in build week, see To build item 7).

### Additional information

```field name="Additional information"
Pre-existing code: Kipdeck existed before the event. It is MIT licensed and built on agent-office by webdevcody / AgentSystemLabs (https://github.com/AgentSystemLabs/agent-office, MIT); LICENSE and NOTICE credit upstream. Before 2026-11-03 Kipdeck already had the inbox, review and merge, the worker environment allowlist and budget caps, and ran every agent as the office's OS user with no sandbox (docs/security.md said so). Built during Agent Rush (2026-11-03 to 2026-11-08): the Docker sandbox per task, the inference proxy that holds the key and routes every model call to Vultr Serverless Inference, the OpenCode provider for Vultr, the "Blocked by sandbox" state in the inbox, and the Vultr VM deployment. Every commit from the event: https://github.com/lukepas/kipdeck/compare/agent-rush-start...agent-rush-submit
Model used: {{VULTR_MODEL}} on Vultr Serverless Inference. Demo login for judges: {{JUDGE_ACCESS}}.
```

## Judging criteria

| Criterion | Our answer |
| --- | --- |
| Application of technology | Vultr VM backend, all model calls through Vultr Serverless Inference via a key-holding proxy, Docker sandbox per task with no credentials inside |
| Presentation | One clear containment moment, architecture on one slide, under 3 minutes |
| Business value | Teams adopting coding agents need isolation plus a human gate before code lands; Kipdeck already has the gate and a paid Team tier |
| Originality | The sandbox is paired with a merge gate and an inbox that names what was blocked, not a chat box |

## Demo video script

Upload to YouTube (unlisted) and paste the link: `{{VIDEO_URL}}`. Narrate it yourself. 

Runtime target: 2:45 (limit: 5:00)

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:15 | Kipdeck inbox, three agents under Working | "These coding agents run real commands. Here is how we keep the blast radius at zero." |
| 0:15-0:40 | Architecture slide: browser, Vultr VM with Kipdeck and the inference proxy, one Docker container per task, Vultr Serverless Inference | "The backend is a Vultr VM. Each task gets its own container. The only door out of it is a proxy that holds the Vultr key and sends every model call to Vultr Serverless Inference." |
| 0:40-1:05 | Terminal on the VM: `docker inspect` of a sandbox (cap drop, read-only, limits), `env` inside it showing no keys | "Inside the box: no keys, no capabilities, a read-only root, and caps on CPU, memory, processes and time." |
| 1:05-1:35 | Give an agent a real task; its terminal writes code, runs the tests, a test fails, it fixes it | "It writes the code and runs it, and the failures feed its next try, all inside its sandbox." |
| 1:35-2:05 | Containment moment: a second agent runs `rm -rf` then a fork bomb; the container is killed; `uptime` on the VM is calm; the inbox shows "Blocked by sandbox" under Needs you | "This one tries to wipe the disk and fork itself to death. The container takes the hit. The VM and the other agents do not notice, and the inbox tells a person what happened." |
| 2:05-2:25 | Review the first agent's diff in the inbox, Merge; `docker ps` shows its container gone | "Nothing reaches the repo until a person merges it. Then the sandbox is destroyed." |
| 2:25-2:35 | Vultr Serverless Inference usage page showing the week's calls | "Every model call went through Vultr." |
| 2:35-2:45 | Title card: repo, demo URL, "Built on agent-office by webdevcody (MIT)" | "Kipdeck is open source. Repo and live demo below." |

## To build before submitting

Rule: build items 1 to 7 during the build week (2026-11-03 to 2026-11-08), not before, and tag `agent-rush-start` on `main` on 2026-11-03 so the compare link above is honest. Before 2026-11-03 only non-code checks (item 0). Each item ships as a PR from `origin/main`, as its own module (`docs/code-layout.md`), with `npm run typecheck`, `npm test`, `npm run build` green and `tests/size.test.ts` untouched.

| # | Item | Estimate |
| --- | --- | --- |
| 0 | Before kickoff: Vultr account, check `GET /v1/models` on Vultr Serverless Inference for a tool-calling model, try OpenCode against it by hand with a custom provider in `OPENCODE_CONFIG_CONTENT`. Ask in Discord whether building on an existing MIT project is allowed. | 2 h |
| 1 | Vultr VM: `deploy/provision.sh --domain` on an Ubuntu Vultr instance, install Docker, Kipdeck runs as `agentoffice`. Write `docs/vultr.md`. | 0.5 day |
| 2 | Inference proxy module on the VM: listens only on the sandbox network, adds the Vultr key, forwards to `https://api.vultrinference.com/v1`, logs each call and counts tokens into the existing spend caps. | 1 day |
| 3 | Docker sandbox runner module: per task `docker run --rm` with the worktree mounted, non-root user, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--read-only` plus tmpfs, `--cpus`, `--memory`, `--pids-limit`, wall-clock timeout, internal network that reaches only the proxy, `SANDBOX_ENV` only. Sandbox image with git, Node, Python and OpenCode. Destroy on task end. | 2 days |
| 4 | OpenCode provider for Vultr: inline provider config pointing at the proxy, model from `--agent-args` or Settings. | 0.5 day |
| 5 | "Blocked by sandbox" in the inbox: map OOM kill, pids limit, timeout and non-zero exit to a Needs you row with the reason. | 0.5 day |
| 6 | Tests (unit for the runner args and proxy, integration that a container has no keys and dies at the pids cap, e2e for the inbox row), `docs/sandbox.md`, update `docs/security.md:125` and README. | 0.5 day |
| 7 | Public demo safety: password-protected office for judges, or a demo mode with a fixed task; budget cap on the Vultr key. | 0.5 day |
| 8 | Video, slides, cover image, submit. | 0.5 day |

Total: about 6 working days for 6 calendar days, so there is no slack. Cut list if late: item 5 shrinks to the container's exit reason in the terminal; item 7 falls back to a password given in Additional information.

## Submission checklist

- [ ] Signed up on lablab, team "Kipdeck" created, Discord joined, pre-existing code answer saved.
- [ ] Real cut-off time copied into `launch/deadlines.json`, calendar regenerated (`npx tsx launch/tools/calendar.ts`).
- [ ] Vultr credit coupon applied; spend cap set on the inference key.
- [ ] `agent-rush-start` tag on `main` on 2026-11-03; `agent-rush-submit` tag at submit time.
- [ ] Backend live on a Vultr VM at `{{DEMO_URL}}`; calls visible on the Vultr Serverless Inference usage page.
- [ ] Inside a sandbox: `env` shows no keys, `docker inspect` shows the limits, container gone after the task.
- [ ] Containment moment recorded and reproducible from `docs/sandbox.md`.
- [ ] `npm run typecheck`, `npm test`, `npm run build` green; headless screenshot of the "Blocked by sandbox" row.
- [ ] README, `docs/sandbox.md`, `docs/vultr.md`, `docs/security.md` updated in the same PRs.
- [ ] Video under 5:00 and 300 MB, slides PDF, 16:9 cover.
- [ ] Every `{{...}}` and `[FOUNDERS: ...]` filled; `npx tsx launch/tools/lint.ts` clean.
- [ ] Submitted by 2026-11-08 18:00 Vilnius.
