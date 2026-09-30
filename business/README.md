# Business playbook

Working documents for turning this fork into a consultancy offering, a workshop and, later, a hosted product. Nothing here changes how the office runs. Everything is a draft: names in `[square brackets]` are placeholders to fill in before a document leaves your hands.

The fork is based on [AgentSystemLabs/agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, by webdevcody). Keep the MIT notice in every copy you ship, and do not market the fork under the upstream name or logo.

## Order of operations

1. Get written clearance from your employer before any paid work, public launch or grant application: [employer-clearance-request.md](employer-clearance-request.md). Until you have it, treat everything below as private drafts.
2. Talk to upstream before you talk to customers: [upstream-partnership.md](upstream-partnership.md). Offer the security fixes first, with nothing asked in return.
3. Pick a name and run the trademark checks: [naming.md](naming.md).
4. Put up the waitlist page: [landing/index.html](landing/index.html).
5. Sell the pilot: [agent-team-lab-offer.md](agent-team-lab-offer.md), priced from [pricing-and-metrics.md](pricing-and-metrics.md), contracted with [sow-template.md](sow-template.md).
6. Run the workshop as a lead-in or an add-on: [workshop/](workshop/README.md).
7. Apply for vendor credits to cover model and compute costs during pilots and hackathons: [vendor-credits.md](vendor-credits.md).

## Calendar (as of 2026-09-30)

| Date | What | Notes |
| --- | --- | --- |
| Oct 12 | Colosseum Crypto World's Fair submission | Needs employer clearance if the entry is public |
| Oct 23 | Amazon Build Ship Shape (Alexa+) submission | AWS Activate Founders credits take 5-10 business days, apply now |
| Oct 30 | Nebius x NVIDIA submission | NVIDIA Inception excludes consulting firms, see vendor-credits.md |
| Nov 3-8 | Vultr Agent Rush | New Vultr accounts get trial credit; check the event's own credit codes |
| Nov 18 | Meta VR Start submission | |

Grant tracks (Solana Foundation, Base Builder Grants, Filecoin microgrant, Innovation Agency Lithuania) have their own forms; the employer clearance and a named legal entity come first for all of them.

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
