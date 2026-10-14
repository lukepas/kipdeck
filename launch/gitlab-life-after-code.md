# GitLab Life After Code hackathon (GitLab Transcend)

Last checked: 2026-10-14. Drafted 2026-10-14 from the Devpost overview, the Official Rules and the Resources/FAQ tab (all fetched today), the GitLab Duo Agent Platform docs (custom flows, triggers) and the Kipdeck repo at `main` 719234e1. There is no earlier kit for this program.

What we enter: Path B (Bring Your Own), Supervised level. Kipdeck is imported to GitLab and a set of GitLab Duo Agent Platform flows runs the post-code lifecycle around it. The one thing a person approves is the outcome: the merge. After the merge the pipeline packages, deploys to Google Cloud Run, checks the live candidate, promotes it, and writes a Proof of Merge receipt that says a person with write access merged it.

Kipdeck is built on agent-office (MIT, by webdevcody / AgentSystemLabs, https://github.com/AgentSystemLabs/agent-office). Upstream has not endorsed this fork.

## Deadline

- Submission deadline: **2026-10-27 13:00 UTC** (Devpost shows "Oct 27, 2026 @ 1:00pm UTC" and "October 27 at 9:00am EDT").
- In Vilnius: **2026-10-27 15:00 EET**. Lithuania leaves summer time on Sunday 2026-10-25, so on the 27th Vilnius is UTC+2 and 13:00 UTC is 15:00, not 16:00. The figure "16:00 Vilnius" in the brief is one hour late; use 15:00.
- Internal deadline: submit by 2026-10-26 20:00 Vilnius, then only edit until 2026-10-27 12:00 Vilnius.
- Registration period: 2026-09-29 10:00 UTC to 2026-10-27 13:00 UTC. Submission period opened 2026-10-05 10:00 UTC.
- Judging: 2026-10-28 10:00 UTC to 2026-11-14 17:00 UTC. Winners on or around 2026-11-16 14:00 UTC.
- Freeze: the FAQ says nothing linked from the submission (form, GitLab repo, video, deployed URL) may change after the deadline until winners are announced. Keep working on GitHub, not on the submitted GitLab project.
- The deployed URL should stay live until about 2026-11-16.
- Do today (2026-10-14): register on Devpost and start contributor onboarding; approval takes about 24 business hours.

## Links

- Hackathon page: https://gitlab-transcend.devpost.com/
- Submission form: https://gitlab-transcend.devpost.com/ ("Join hackathon", then "Enter a submission" once signed in to Devpost; the form itself is behind the Devpost login, see Form answers)
- Official Rules: https://gitlab-transcend.devpost.com/rules
- Resources and FAQ: https://gitlab-transcend.devpost.com/resources
- Contributor onboarding: linked from the overview as "Start GitLab Transcend Hackathon contributor onboarding" (5 minutes, then about 24 business hours for approval; GitLab then provisions a group, a subgroup, a project in it and an onboarding issue)
- Discord: https://discord.com/invite/HP4BhW3hnp (channel #transcend-hackathon)
- GitLab Duo Agent Platform: https://docs.gitlab.com/user/duo_agent_platform/
- Custom flows: https://docs.gitlab.com/user/duo_agent_platform/flows/custom/
- Flow triggers: https://docs.gitlab.com/user/duo_agent_platform/triggers/
- Foundational flows we reuse: https://docs.gitlab.com/user/duo_agent_platform/flows/foundational_flows/code_review/ , https://docs.gitlab.com/user/duo_agent_platform/flows/foundational_flows/fix_pipeline/ , https://docs.gitlab.com/user/duo_agent_platform/flows/foundational_flows/developer/
- MCP clients: https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_clients/
- DevSecOps stages (the "Most Stages Covered" yardstick): https://about.gitlab.com/topics/devops/#the-dev-ops-lifecycle-and-how-dev-ops-works
- Google Cloud free credit: https://cloud.google.com/free
- GitLab credits dashboard: https://gitlab.com/-/profile/gitlab_credits_dashboard
- Our project: https://github.com/zbagdzevicius/kipdeck , https://kipdeck.com , replay demo https://kipdeck-demo.vercel.app , showcase https://zbagdzevicius.github.io/kipdeck/
- Upstream (always credited): https://github.com/AgentSystemLabs/agent-office (MIT, by webdevcody / AgentSystemLabs)
- Our changes against upstream: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main

## Fit

Strong. Checked against the Official Rules and the FAQ today:

- Path B takes "an existing open-source project (yours or forked, MIT license)". Kipdeck is an MIT fork of agent-office (MIT); `LICENSE` carries both copyright lines and `NOTICE` lists what the fork changed.
- Path B needs the automation and the deployment to be new work done on or after 2026-10-05. Nothing GitLab-related exists in the repo today (no `.gitlab-ci.yml`, no Duo flow files, no Google Cloud deploy), so all of it is new by construction. The only GitLab mentions in the code are detection rules: `src/shared/brief/risk.ts` flags a changed `.gitlab-ci.yml` as CI risk, and `src/server/rundown/project.ts` lists it as a CI system.
- The Supervised level is our thesis word for word: "You approve the outcome, not the individual steps." In Kipdeck, agents work on their own branches and the inbox puts what waits on a person first; Proof of Merge releases a payout only when a person with write access merges (attester and approver signatures). In this entry the human gate is the merge, and everything before and after it is agents and pipeline.
- Most Stages Covered rewards touching many of the nine stages (plan, create, verify, package, secure, release, configure, monitor, govern). The design below touches all nine.
- Judges include Anthropic staff, and GitLab's custom flows run on Anthropic Claude (the custom flows doc names "Anthropic Claude Sonnet 4" as the model). Kipdeck already runs Claude Code as a first-class agent.
- Eligibility: individuals above the age of majority, not resident in Brazil, China, Quebec, Russia, Cuba, Iran, North Korea, Syria, Crimea, Donetsk or Luhansk. Lithuania is eligible. No company is needed: an individual can enter and receive the prize.
- Weak spots, said plainly: Kipdeck's own app talks to GitHub only today (`gh` CLI, `src/server/github.ts`), so the GitLab side of this entry is the Duo flows and CI around the project, not a GitLab mode inside the inbox. The Base Sepolia attestation is testnet only, like everything in Proof of Merge.

## Ask

Prizes targeted (each project can win one Path prize plus one Special prize; Official Rules section 8):

| Prize | Amount | Why we fit |
| --- | --- | --- |
| Path B: Best Supervised Agent | USD 4,000 | Primary target. One human gate (the merge), agents everywhere else |
| Most Stages Covered (Path B winner) | USD 5,000 | Secondary target. All nine stages touched |
| Most Creative (either path) | USD 4,000 | Alternative special prize, scored on Innovation/Idea: payment and reputation only on a human merge |

Realistic best case: USD 9,000 (Path B Supervised plus Most Stages Covered). Not entered: Most Environmentally Impactful (opt-in). It needs a quantified SCI (Software Carbon Intensity) figure measured with current public methods; we have no measurement and will not invent one.

Optional Google Cloud bonus: up to 0.2 points (final score out of 5.2), for a public Cloud Run URL plus the deploy code in the GitLab repo. We take it: the hosted read-only demo (`deploy/demo/Dockerfile`, stateless, port 8080, no model, no sign-in) is a natural fit for Cloud Run.

## Eligibility checklist and blockers

Every box here must be ticked before submitting. The first one is open in every kit.

- [ ] **Employer permission (open, blocks registering and submitting).** Written permission from Nortal for outside work, ownership of the IP in this entry, and accepting a cash prize. The rules make the entrant warrant the submission is theirs to license (section 7) and that nothing breaches another party's rights. The Rules also give GitLab a perpetual licence to use the submission and say GitLab "may use the Submission to develop, market, and commercialize products and services"; Nortal should see that line.
- [ ] Company registration: not needed. An individual can enter and is paid personally. If a Kipdeck company exists by then and should enter instead, it must "exist and have been organized or incorporated at the time of entry" and appoint a Representative. [FOUNDERS: individual or company entry]
- [ ] Personal fields: Devpost account and profile, confirmation of age of majority and residence (Lithuania). For a prize: a winner affidavit within 10 business days, a W-8BEN (non-US resident), bank details or postal address, identity and role verification. Winners pay their own taxes and fees. [FOUNDERS: fill personally; do not let an agent enter them]
- [ ] Team: founder-led; team status is undecided (decision D9). [FOUNDERS: team] Prize goes to the Representative, who splits it.
- [ ] Licence question: the FAQ says everything used must be MIT, the Rules allow OSI-approved third-party licences and say the Rules prevail. Get the organizers' answer in writing (task 1 above).
- [ ] Visibility of the provisioned project: unknown until onboarding is approved [verify]. If it cannot be public, ask before using a personal public GitLab project.
- [ ] Freeze after the deadline: stop any GitHub-to-GitLab mirroring at the deadline and do not redeploy Cloud Run until 2026-11-16.
- [ ] Costs: Cloud Run with min instances 0 should stay inside Google's free tier or the USD 300 new-customer credit [verify billing alerts]; GitLab credits are 500 a month per participant.

## Pre-existing code disclosure

Path B asks for it in "What did you add or change during the submission period?" (under Project description). The about text repeats it under "What we added during the submission period" and "Credits".

```field name="Disclosure paragraph" max-chars=800
Kipdeck existed before 2026-10-05 as an MIT fork of agent-office by webdevcody / AgentSystemLabs (https://github.com/AgentSystemLabs/agent-office). All GitLab work is new since 2026-10-05: the import, .gitlab-ci.yml, the Duo flows and triggers, the service account, the Cloud Run deploy with rollback and the GitLab Proof of Merge check. Our changes to upstream: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
```

## Project description: form answers

The Devpost submission form is only visible after signing in and joining, so the fields below come from Devpost's standard project form plus every item the Official Rules ("Submission Requirements") and the FAQ say the form asks for. Limits marked [verify] are Devpost's usual ones; check them in the form. Paste the blocks as they are.

Standard Devpost fields: project name, elevator pitch, thumbnail, about the project (Markdown), built with, try it out links, image gallery, video demo link, team members. Hackathon-specific items from the rules: path, autonomy level, public GitLab repo URL, original MIT project URL (Path B), deployed project URL (Path B), Google Cloud URL (optional bonus), what was added or changed during the submission period (Path B), opt-in and explanation for Most Environmentally Impactful, and the confirmations of eligibility and the rules.

```field name="Project name" max-chars=60 [verify]
Kipdeck Merge Desk
```

```field name="Elevator pitch" max-chars=200 [verify]
GitLab Duo agents triage, build, review, fix, secure, ship and watch Kipdeck. A person approves one thing, the merge, and only a human merge deploys and writes a Proof of Merge receipt.
```

Thumbnail: 3:2 image, JPG/PNG/GIF up to 5 MB [verify]. Use the Kip mark on the inbox screenshot (`docs/img/inbox-phone.png` style) with the words "One gate: the merge". Make it after the build so it shows the GitLab MR with the review brief note.

```field name="Path"
Path B: Bring Your Own
```

```field name="Level of autonomy"
Supervised
```

```field name="About the project" format=markdown
## Inspiration

Coding agents now write most of the diff. What is left for people is the part after the code: is it safe, does it pass, can it ship, and who is answerable for it. We build Kipdeck, an open source inbox for AI coding agents (built on agent-office by webdevcody / AgentSystemLabs, MIT). Its idea is that a person should approve outcomes, not keystrokes: agents work on their own branches, the inbox ranks what is waiting on a human, and Proof of Merge pays for a contribution only when a person with write access merges it. Life After Code asked for exactly that at the Supervised level, so we moved Kipdeck to GitLab and let Duo agents run everything around the one human decision.

## What it does

Kipdeck Merge Desk is a set of GitLab Duo Agent Platform flows and a GitLab CI/CD pipeline around the Kipdeck repository. A person writes an issue and later approves one thing: the merge. Everything between and after is automated.

1. Plan. When an issue is created, the Triage flow sizes it, writes acceptance criteria and a test plan into the issue, labels it, and hands it to the Developer flow when it is small enough for an agent.
2. Create. The foundational Developer flow opens a merge request on its own branch.
3. Verify. The pipeline runs Kipdeck's typecheck, test suite and build. When a pipeline fails, the Fix pipeline flow reads the job log and pushes a fix to the same MR.
4. Secure. GitLab SAST and secret detection run on every MR. The Review brief flow reads the diff, the test results and the security findings and posts one note: what was asked, what the agent says it did, what the tests show, and what in the diff is risky. Risk follows the same rules as Kipdeck's in-app review brief (`src/shared/brief/risk.ts`): large diffs, secrets, CI config, lockfiles, migrations, sign-in code, deploy config, deleted tests and new dependencies. It fixes what it can (a leaked test key, a missing test) and labels the MR `ready-for-human` or `needs-human-eyes`.
5. The human gate. A maintainer reads one note and merges, or sends it back with a comment the agents pick up.
6. Package. The merge pipeline builds the container image and pushes it to the GitLab container registry and Google Artifact Registry.
7. Configure. The Cloud Run service, its environment and its allowed hosts are defined in the repository and applied by the pipeline through GitLab OIDC (no long-lived Google key).
8. Release. The new revision is deployed to Cloud Run with no traffic under a candidate tag, smoke-tested at its own URL, then promoted. A GitLab release is cut with notes the Release flow writes from the merged MRs.
9. Monitor. A post-deploy job probes the live service; if it fails, traffic goes back to the previous revision and the Incident flow opens an issue with the failing check and the last good revision.
10. Govern. A Proof of Merge job checks, through the GitLab API, that the merge came from a person (not a bot or service account) with Developer access or more, and writes the receipt: a note on the MR and an attestation on Base Sepolia (testnet) under Kipdeck's Proof of Merge EAS schema. The Desk flow, mentioned in any issue, answers "what needs me?" with the open MRs ranked by how long they have waited on a person.

## How we built it

- GitLab Duo Agent Platform: custom flows in `.gitlab/duo/flows/` (Triage, Review brief, Release notes, Incident, Desk), the foundational Developer, Code review and Fix pipeline flows, and flow triggers on work item created, merge request created and marked ready, pipeline failed, and mention. A dedicated service account is the flows' composite identity, so every agent action is attributed and can never count as the human merge.
- GitLab CI/CD: `.gitlab-ci.yml` with verify, secure, package, release and govern stages, protected `main`, and a visible pipeline history for every step above.
- Google Cloud: Cloud Run (the read-only Kipdeck demo, scripted agents, no model, no sign-in) and Artifact Registry, deployed with Workload Identity Federation from GitLab's ID tokens. The deploy code is in `deploy/gcp/`.
- Anthropic Claude runs the custom flows on GitLab's side, and Claude Code is one of the agents Kipdeck itself manages.
- Kipdeck (TypeScript, Node.js): the risk rules and the Proof of Merge EAS schema and attester come from the existing codebase, so the GitLab pipeline and the app judge a diff the same way.

## Before and after (Path B)

Before, on GitHub: one Actions workflow built, tested and published a release; review, fixes, security checks and deploys were done by hand, and Proof of Merge ran as a GitHub Action.
After, on GitLab: an issue becomes a reviewed, tested, scanned MR without a person; one merge then packages, deploys, checks, promotes, monitors and records who approved it.

## What we added during the submission period

All GitLab work is new since 2026-10-05: the import to GitLab, `.gitlab-ci.yml`, the Duo flow definitions and triggers, the service account setup, the Google Cloud deploy (`deploy/gcp/`), the post-deploy check and rollback, and the GitLab version of the Proof of Merge check. Kipdeck itself existed before, as a fork of agent-office by webdevcody / AgentSystemLabs (MIT): https://github.com/AgentSystemLabs/agent-office . Our changes to upstream are listed at https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main .

## Challenges

[FOUNDERS: fill in after the build, two or three real ones. Candidates: keeping agent identities apart from the human merger, getting a stateful app's demo onto a stateless Cloud Run service, staying inside 500 GitLab credits a month.]

## What's next

Bring GitLab into Kipdeck's inbox itself (merge requests next to GitHub pull requests in one ranked list), and move the Proof of Merge payout from testnet to a production chain once it has been audited.

## Credits

Kipdeck is built on agent-office by webdevcody / AgentSystemLabs (MIT). This fork is not theirs and they have not endorsed it.
```

```field name="Built with" format=tags
gitlab, gitlab-duo-agent-platform, gitlab-ci, anthropic-claude, google-cloud-run, google-artifact-registry, typescript, node.js, docker, eas, base-sepolia
```

```field name="Public GitLab repository URL"
https://gitlab.com/[FOUNDERS: hackathon group]/[FOUNDERS: subgroup]/kipdeck
```

```field name="Original MIT-licensed open-source project URL (Path B)"
https://github.com/zbagdzevicius/kipdeck (our MIT project, itself a fork of https://github.com/AgentSystemLabs/agent-office by webdevcody / AgentSystemLabs, MIT)
```

```field name="Deployed project URL (Path B)"
https://[FOUNDERS: Cloud Run service URL, e.g. kipdeck-demo-xxxxxxxxxx-lz.a.run.app]
```

```field name="Google Cloud project URL (optional bonus)"
https://[FOUNDERS: same Cloud Run URL as above]. Deployment code: deploy/gcp/ and the deploy jobs in .gitlab-ci.yml in the GitLab repository.
```

```field name="What did you add or change during the submission period? (Path B)" max-chars=[verify]
Kipdeck existed before 2026-10-05 as an MIT fork of agent-office by webdevcody / AgentSystemLabs. Everything in this entry is new since 2026-10-05: the import to GitLab; .gitlab-ci.yml with verify, secure (SAST, secret detection), package, release and govern stages; GitLab Duo custom flows (Triage, Review brief, Release notes, Incident, Desk) and triggers wired to the foundational Developer, Code review and Fix pipeline flows; a service account as the agents' identity; the Google Cloud Run deployment with Workload Identity Federation (deploy/gcp/); the candidate-tag smoke test, promotion and rollback; and the GitLab version of the Proof of Merge check and receipt. The commit history and the pipeline list in the GitLab project show the dates.
```

```field name="Most Environmentally Impactful: opt in?"
No
```

```field name="Try it out links"
https://[FOUNDERS: Cloud Run URL]
https://gitlab.com/[FOUNDERS: group path]/kipdeck
https://kipdeck.com
```

```field name="Video demo link"
https://www.youtube.com/watch?v=[FOUNDERS: video id]  (Public or Unlisted, never Private)
```

Image gallery (3:2, up to 5 MB each [verify]): (1) an issue with the Triage flow's note, (2) the MR with the Review brief note and the `ready-for-human` label, (3) the pipeline graph from the merge with all stages green, (4) Cloud Run revisions with the candidate tag promoted, (5) the Proof of Merge note on the MR with the Base Sepolia attestation link.

```field name="Team members"
Zygimantas Bagdzevicius (founder-led; CEO/CTO of Kipdeck) [FOUNDERS: team - invite any co-founder by Devpost username, or submit solo]
```

Confirmations to tick in the form: eligibility (age of majority, not in an excluded region), agreement to the Official Rules and Devpost terms, and that the work is yours or used under licence [verify the exact wording].

## Judging criteria

The Official Rules score each entry out of 5 (5.2 with the Google Cloud bonus). The drafter read these prize rules; check the full criteria list and weights in the rules before submitting [verify].

| What is judged | Our answer |
| --- | --- |
| Path B: Best Supervised Agent ("You approve the outcome, not the individual steps") | One human gate, the merge; Duo flows and the pipeline do triage, code, fixes, review brief, packaging, deploy, rollback and the receipt |
| Most Stages Covered (plan, create, verify, package, secure, release, configure, monitor, govern) | All nine stages touched, each with a job or flow the pipeline history shows |
| Most Creative (Innovation/Idea) | Payment and reputation only on a human merge, checked through the GitLab members API so a bot can never count as the merger |
| Google Cloud bonus (up to 0.2) | Public Cloud Run URL plus the deploy code (`deploy/gcp/`) in the GitLab repo |

## Demo video script

Limit: under 3:00, on YouTube, Public or Unlisted. No third-party trademarks or copyrighted music: no music, or self-made. Narrate it yourself in English.

Runtime target: 2:45 (limit: under 3:00)

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:12 | Kipdeck inbox (replay demo), then cut to the GitLab project page with the MIT licence in About | "Agents write the code now. The work left is everything after it. This is Kipdeck on GitLab, where a person approves one thing: the merge." |
| 0:12-0:30 | Create an issue "Show the median wait on the Numbers page"; the Triage flow's note appears with acceptance criteria and a label | "I write an issue. The Triage flow sizes it, writes the acceptance criteria and a test plan, and hands it to the Developer flow." |
| 0:30-0:50 | MR opened by the service account; pipeline running | "The Developer flow opens a merge request on its own branch. Typecheck, tests, build, SAST and secret detection start." |
| 0:50-1:10 | Pipeline fails on a test; the Fix pipeline flow pushes a commit; pipeline goes green | "A test fails. The Fix pipeline flow reads the log and pushes the fix. I did not touch it." |
| 1:10-1:35 | Review brief note on the MR: asked, done, tests, risk flags; label `ready-for-human` | "The Review brief flow writes one note: what was asked, what changed, what the tests say, and what is risky. Same rules as the Kipdeck inbox." |
| 1:35-1:45 | The maintainer clicks Merge | "This is my whole job here. I read one note and merge." |
| 1:45-2:10 | Merge pipeline: package, deploy candidate to Cloud Run with no traffic, smoke test, promote; Cloud Run console shows the revision | "One merge packages the image, deploys a candidate to Cloud Run with no traffic, checks it, then promotes it." |
| 2:10-2:25 | Proof of Merge note on the MR; Base Sepolia attestation on the explorer | "Proof of Merge checks that a person with write access merged it, not a bot, and records it. In Kipdeck, that is what releases a contributor's payout." |
| 2:25-2:37 | Mention `@kipdeck-desk what needs me?` in an issue; ranked list reply | "And when I come back, the Desk tells me what is waiting on me, oldest first." |
| 2:37-2:45 | Title card: nine stages ticked, repo URL, live URL, "Built on agent-office by webdevcody / AgentSystemLabs (MIT)" | "Nine stages, one human decision. Kipdeck, built on agent-office." |

Record on real runs only. If a step is slow, cut the wait, but never fake a result.

## To build before submitting

Nothing below exists yet; verified today: no `.gitlab-ci.yml`, no `.gitlab/duo/`, no `deploy/gcp/` in the repo or on any branch (`git branch -a` has no gitlab, gcp or cloud branch). Estimates are for one person.

| # | Work | Estimate | By (Vilnius) |
| --- | --- | --- | --- |
| 1 | Register on Devpost, start contributor onboarding, join Discord; ask in #transcend-hackathon (a) whether the provisioned project can be public, or a personal public project is expected, and (b) whether OSI-licensed third-party dependencies and the OFL fonts in `src/client/styles/fonts/` are fine, since the FAQ says "everything that you use or make must be MIT-licensed" while Rules section 4 allows OSI-approved third-party licences | 0.5 h, plus 24 business hours wait | 2026-10-14 |
| 2 | Import the GitHub repo to the GitLab project, public, MIT shown in About (LICENSE has two copyright lines; check GitLab detects it), protected `main` | 1-2 h | 2026-10-16 |
| 3 | `.gitlab-ci.yml`: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`; SAST and secret detection templates; image build to the GitLab registry. The suite has known flaky tests; budget time to keep it green | 1.5 days | 2026-10-18 |
| 4 | Google Cloud: project, Artifact Registry, Cloud Run service from `deploy/demo/Dockerfile` (port 8080, `--demo --read-only`, set `AGENT_OFFICE_ALLOWED_HOSTS` to the run.app host), Workload Identity Federation for GitLab ID tokens; `deploy/gcp/cloudrun.sh`, `docs/gcp.md`, README entry; candidate tag, smoke test, promote, rollback jobs | 1 day | 2026-10-19 |
| 5 | Duo flows: Triage, Review brief (port the rules from `src/shared/brief/risk.ts` into its instructions, or have it call a small CI job that runs the module), Release notes, Incident, Desk; triggers; service account; enable foundational Developer, Code review and Fix pipeline flows; tune prompts within 500 credits a month | 2 days | 2026-10-22 |
| 6 | Proof of Merge on GitLab: a `govern` job on the merge commit that finds the MR, checks the merger is a human with Developer access or more via the members API, posts the receipt note, and attests on Base Sepolia with `onchain/attest` (today it reads GitHub fields; add a GitLab source). Tests for the check. Bounty escrow release on GitLab is out of scope | 1 day | 2026-10-23 |
| 7 | Run the whole loop on a real issue at least three times so the pipeline history shows it; fix what breaks | 0.5 day | 2026-10-24 |
| 8 | Record and edit the video, upload to YouTube; screenshots and thumbnail | 1 day | 2026-10-25 |
| 9 | Fill the form, final read, submit | 0.5 day | 2026-10-26 |

Total: about 8 working days in 12 calendar days, alongside a day job. Tight but doable. If time runs short, drop in this order: Desk flow, Release notes flow, Base Sepolia attestation (keep the human-merger check and the MR note). Do not drop the Cloud Run deploy: Path B requires a deployed URL.

Repo rules (AGENTS.md): every change lands on GitHub `main` as a PR from fresh `origin/main` in a worktree, with `npm run typecheck`, `npm test`, `npm run build` green, `tests/size.test.ts` green, and README plus a `docs/*.md` page (for example `docs/gitlab.md`, `docs/gcp.md`) updated in the same PR. Then push to GitLab.

## Submission checklist

- [ ] Nortal permission in writing (outside work, IP, prizes).
- [ ] Devpost account, joined the hackathon, contributor onboarding approved, "Developer + AI" role visible.
- [ ] Organizer answers on project visibility and third-party licences saved.
- [ ] GitLab project public, MIT licence shown in About, `NOTICE` and the upstream credit present.
- [ ] `.gitlab-ci.yml` merged; pipeline history visible with verify, secure, package, release, monitor and govern jobs from at least three real runs.
- [ ] Duo flows and triggers live; every flow has run at least once on a real issue or MR.
- [ ] Cloud Run URL public and working; `deploy/gcp/` in the repo; billing alert set; stays up until 2026-11-16.
- [ ] Proof of Merge receipt on a merged MR; attestation visible on Base Sepolia (testnet, said as such).
- [ ] GitHub PRs for all of it merged, with README and `docs/gitlab.md` / `docs/gcp.md` updated; typecheck, test, build and size test green.
- [ ] Video under 3:00 on YouTube (Public or Unlisted), no third-party music or marks, credit to agent-office on the end card.
- [ ] Every form field filled from this file; all [FOUNDERS: ...] and [verify] items resolved; Path B and Supervised selected; environmental prize not opted in.
- [ ] Submitted by 2026-10-26 20:00 Vilnius; hard deadline 2026-10-27 15:00 Vilnius (13:00 UTC).
- [ ] After the deadline: no edits to the form, GitLab repo, video or deployment until winners are announced.
- [ ] Add the deadline to `launch/deadlines.json` and regenerate the calendar (`npx tsx launch/tools/calendar.ts`) in a PR.
