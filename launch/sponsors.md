# GitHub Sponsors and Open Collective

Last checked: 2026-10-01. Sources: GitHub's Sponsors setup docs and Open Source Collective's docs (links below). Anything not stated there is marked [unverified].

Plan: set up GitHub Sponsors on your personal account (bank payout), and hold off on Open Collective until the fork lives under a GitHub organization, has real activity and usage, and a group needs a shared budget. Be explicit everywhere that the office itself is upstream work by webdevcody, and that sponsorship funds the fork's additions.

## Deadline

- No external deadline. Internal target: **2026-10-02**, so the profile is live before the first hackathon submission links to the repo.
- GitHub reviews a Sponsors application in "a few days".

## Links

- Set up GitHub Sponsors: https://docs.github.com/en/sponsors/receiving-sponsorships-through-github-sponsors/setting-up-github-sponsors-for-your-personal-account
- FUNDING.yml (the Sponsor button): https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository
- Open Source Collective (fiscal host): https://docs.oscollective.org/
- Open Collective fiscal hosts: https://docs.opencollective.com/help/fiscal-hosts/fiscal-hosts
- Upstream author on GitHub: https://github.com/webdevcody

## Eligibility checklist

GitHub Sponsors:

- [ ] You contribute to open source (code, docs, bug reports, design, mentoring and project management all count) and live in a supported region. Lithuania is on GitHub's supported regions list (checked 2026-10-01).
- [ ] Two-factor authentication on the GitHub account.
- [ ] Payout: a bank account in the same region you live in, or a fiscal host.
- [ ] Tax form: W-8BEN for non-US residents.
- [ ] Fees: sponsorships from personal accounts reach you in full; from organizations GitHub takes up to 6 percent.
- [ ] Employer: the employer's policy on paid side work and on donations tied to work done with company equipment or time.

Open Collective:

- [ ] Open Source Collective's criteria: original or "a substantial fork of an existing project", recent activity or significant usage, applicants who are maintainers, an OSI-style open source license, and the repo "hosted under an organizational repository, not a personal account", ideally with two or more admins. Host fee 10 percent. No star count is stated. A fork under a personal account does not qualify.
- [ ] Alternative hosts for an EU-based project exist (for example Open Collective Europe) with their own criteria and fees [unverified].
- [ ] A collective needs a clear, shared purpose; a one-person fork is usually better served by GitHub Sponsors alone.

## Pre-existing code disclosure

Put this at the top of the Sponsors profile and in the fork's README "Sponsor" section, so no sponsor thinks they are paying the upstream author or that we wrote the office:

```field name="Sponsors profile intro" max-chars=600
I maintain a fork of Agent Office, the MIT open source 3D office for coding agents created by webdevcody (github.com/AgentSystemLabs/agent-office). The office is his work, and if you want to support it, sponsor him too. Sponsoring me funds what the fork adds: so far NVIDIA Nemotron workers on Nebius and x402 paid tasks on Base, with a remote MCP server, sandboxed workers and a WebXR mode in progress. Everything stays MIT.
```

## Project description

Profile fields: bio and introduction, up to six featured repositories, and up to 10 monthly and 10 one-time tiers (prices cannot be edited after publishing; make a new tier instead).

```field name="Short bio" max-chars=160
Building a fork of Agent Office: coding agents at desks in a shared 3D office, on open models and paid per task.
```

| Tier | Price | Reward |
| --- | --- | --- |
| Coffee | $5 / month | Name in the fork's README |
| Desk | $25 / month | Vote on the next feature; early builds |
| Team | $250 / month | Logo in the README; a monthly call about running agents in your team |
| One-time thanks | $20 once | Name in the release notes |

Draft `.github/FUNDING.yml` for the fork (add it on the fork's main branch, not here). Listing upstream too is a courtesy; check first whether webdevcody has a Sponsors profile [unverified]:

```yaml
github: [{{YOUR_GITHUB_USERNAME}}]
# custom: ["https://opencollective.com/{{COLLECTIVE_SLUG}}"]
```

## Judging criteria

No judging here. What GitHub checks on review, and what sponsors look at before paying:

| Who | What they look at | Our answer |
| --- | --- | --- |
| GitHub review | Eligibility, 2FA, bank and tax details complete | Checklist above |
| Open Source Collective | Open source license, a substantial fork with activity or usage, an organization repo | MIT; apply later, once the fork is under an organization and in use |
| Sponsors | Is it alive, is it honest, what does my money do | Weekly commits, clear credit to upstream, tiers tied to concrete features |

## Demo video script

Optional: GitHub profiles do not host video, but a short clip linked from the profile and the README helps.

Runtime target: 0:50 (limit: under 3:00)

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:15 | The office, agents typing | "This is Agent Office, webdevcody's open source office for coding agents." |
| 0:15-0:35 | Quick cuts of what exists on the day (on 2026-10-01: a Nemotron worker's Nebius cost, an x402 paid task waiting for approval) | "My fork adds open models and paid tasks, with more on the way." |
| 0:35-0:50 | Sponsors page, the tiers | "Sponsoring keeps those going, and it all stays MIT." |

## Submission checklist

- [ ] 2FA on; W-8BEN and bank details ready.
- [ ] Profile intro with the upstream credit; bio; featured repo (the fork).
- [ ] Tiers created; prices double-checked (they cannot be edited later).
- [ ] Sponsors application submitted on 2026-10-02; approval email saved.
- [ ] `FUNDING.yml` added on the fork once approved.
- [ ] Open Collective revisited once the fork is under a GitHub organization and has users.
- [ ] All `{{...}}` placeholders filled; `npx tsx launch/tools/lint.ts` clean.
