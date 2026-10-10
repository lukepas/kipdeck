# Business playbook

Working documents for turning this fork into a consultancy offering, a workshop and, later, a hosted product. Nothing here changes how the office runs. Everything is a draft: names in `[square brackets]` are placeholders to fill in before a document leaves your hands.

The fork is based on [AgentSystemLabs/agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, by webdevcody). Keep the MIT notice in every copy you ship, and do not market the fork under the upstream name or logo.

## Order of operations

1. Get written clearance from your employer before any paid work, public launch or grant application: [employer-clearance-request.md](employer-clearance-request.md). Until you have it, treat everything below as private drafts.
2. Talk to upstream before you talk to customers: [upstream-partnership.md](upstream-partnership.md). Offer the security fixes first, with nothing asked in return.
3. Pick a name and run the trademark checks: [naming.md](naming.md). The name is picked: Kipdeck (2026-10-08). The trademark checks are still open.
4. Put up the waitlist page: the product's landing with the team tier waitlist is [site/landing/](../site/landing/index.html) ([docs/landing.md](../docs/landing.md)); [landing/index.html](landing/index.html) is the consulting offer's page.
5. Sell the pilot: [agent-team-lab-offer.md](agent-team-lab-offer.md), priced from [pricing-and-metrics.md](pricing-and-metrics.md), contracted with [sow-template.md](sow-template.md).
6. Run the workshop as a lead-in or an add-on: [workshop/](workshop/README.md).
7. Apply for vendor credits to cover model and compute costs during pilots and hackathons: [vendor-credits.md](vendor-credits.md).

## Calendar (as of 2026-09-30)

Dates were checked on 2026-09-30 against the event pages listed under each row. Read the official rules again before submitting; organizers move deadlines.

| Date | What | Notes |
| --- | --- | --- |
| Oct 12 | Colosseum Crypto World's Fair submission | Build period Sep 14 - Oct 12. Needs employer clearance if the entry is public. https://colosseum.com/worldsfair |
| Oct 23, 12:00 PT | Amazon Build Ship Shape submission (Alexa+ is one of the tracks) | Submission period Aug 31 - Oct 23; one track per entry. Alexa+ entries need a working demo and a repository: a self-hosted MCP server or an Agent Skill, or a simulated experience in a web app; video of 3 minutes or less on YouTube or Vimeo. https://amazonappdev2026.devpost.com/ |
| Oct 30, 10:00 PT | Nebius x NVIDIA Global AI Hackathon submission | Must run on Nebius Token Factory or Nebius AI Cloud and use at least one NVIDIA open model; public repo and a demo video of 3 minutes or less. https://nebiusglobalaihackathon.devpost.com/ |
| Nov 3-8 | Vultr Agent Rush (online build), on-site showcase Nov 8 in Salt Lake City | Each participant gets USD 200 in Vultr credits. Agent LLM calls must go through Vultr Serverless Inference, sandboxes must run as containers or separate instances, and the demo video must show one "containment moment". No separate submission deadline is stated on the page. https://lablab.ai/ai-hackathons/vultr-hackathon |
| Nov 18, 12:00 PT | Meta VR Start Developer Competition submission | Opened Sep 24. Entrants must hold Meta VR Start program membership. https://start-developer-competition-26.devpost.com/ |

AWS Activate Founders credits take 5-10 business days to decide, so apply early if the Amazon entry needs them. NVIDIA Inception and Nebius startup credits exclude consulting firms; see vendor-credits.md.

## What the code branches contain

Checked with `git log main..<branch>` on 2026-09-30. Only committed work counts; several branches have uncommitted work in their worktrees that is not listed here. Re-check before quoting any of this in a submission, a grant form or a message to upstream.

| Branch | Committed so far |
| --- | --- |
| `launch/security-hardening` | One fix: saved meetings whose ids or paths leave the checkout are refused, plus shared safe-file helpers (`src/server/safefs.ts`). None of the five fixes drafted in upstream-partnership.md is committed yet. |
| `launch/voice-mcp` | An MCP server core over Streamable HTTP behind a bearer token, and schema checks on tool arguments. No Alexa skill is committed. |
| `launch/nebius-nemotron` | Nebius Token Factory as an OpenCode model source with Nemotron as the default, Nebius prices on worker cards and in Spend, end-to-end tests. |
| `launch/docker-sandbox`, `launch/webxr-mode`, `launch/vultr-deploy`, `launch/solana-escrow`, `launch/x402-base` | Nothing committed yet. |

## Grants

Each grant track works differently. Checked on 2026-09-30:

- Solana Foundation: open to individuals, teams and companies; milestone-based grants for open-source public goods, applied for through the form linked from https://solana.org/grants-funding. Review takes about a week, a decision about three weeks.
- Base Builder Grants: retroactive, usually 1-5 ETH (secondary sources). There is no application form; the Base team picks shipped projects on Base, often through nominations on X and Farcaster. Ship first.
- Filecoin Next Step Microgrants: USD 5,000 in FIL in two tranches, for independent developers and small teams with a working Filecoin or IPFS prototype, applied for as a GitHub issue in filecoin-project/devgrants. Unverified whether it is still open: the last wave named in its README closed in 2023.
- Innovation Agency Lithuania (Startup Lithuania): calls open and close through the year and are listed at https://www.startuplithuania.com/open-calls/. Their funding calls have targeted companies registered in Lithuania, so a Lithuanian legal entity is likely needed; check each call.

Employer clearance comes first for all of them. A legal entity is needed for the Lithuanian calls and most credit programs, but not for Solana Foundation, Base or Filecoin grants.

## Files

- [employer-clearance-request.md](employer-clearance-request.md): email to your employer about IP and side work, with an internal-offering alternative.
- [upstream-partnership.md](upstream-partnership.md): message to webdevcody, plus PR description drafts for each security fix.
- [agent-team-lab-offer.md](agent-team-lab-offer.md): the fixed-price 2-6 week pilot.
- [sow-template.md](sow-template.md): statement of work for the pilot.
- [pricing-and-metrics.md](pricing-and-metrics.md): price list, cost model and the metric definitions the pilot reports.
- [workshop/](workshop/README.md): 1-day and 3-day curricula and the exercise repositories.
- [landing/index.html](landing/index.html): a static waitlist page with no trackers.
- [naming.md](naming.md): ten candidate names and the checks to run on them.
- [vendor-credits.md](vendor-credits.md): AI and cloud startup credit programs, checked on 2026-09-30.

The checks in `tests/business.test.ts` keep these files plain ASCII and the landing page self-contained, and `tests/business-landing.test.ts` loads the page in a headless browser when one is installed.
