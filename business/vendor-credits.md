# Vendor credits

AI and cloud startup credit programs that could cover model and compute costs for hackathons, pilots and the hosted product. Checked on 2026-09-30 by web search and, where noted, by reading the vendor's own page. Programs change often: read the vendor's page again before applying, and treat anything marked "secondary source" as unconfirmed.

## Read this first

- Almost every program wants an incorporated company, a company website and an email on that domain. A personal Gmail or an employer address will not do. Sort out the legal entity first, and check with your employer that you may have one (see employer-clearance-request.md).
- Several programs exclude consulting and outsourced development firms, and some exclude crypto companies. Apply as the product company (the hosted workspace), not as a consultancy. Do not describe the pilot service as the main business in those applications, and do not misrepresent what the company does either: if the honest description is "consultancy", skip those programs.
- The larger tiers almost always need a VC, accelerator or partner referral. Without one, expect the entry tier.
- Credits usually expire after 6-12 months. Apply close to when you will spend them, not months ahead.
- Credits for a model API often do not work through a cloud marketplace for the same model, and the reverse. For example Anthropic's credits cover the Claude API only, not Claude on Bedrock or Vertex AI.

## Model providers

### Anthropic (Claude for Startups)

- What: Claude API credits and higher rate limits. The program page gives no amounts. Secondary sources describe direct applications starting around USD 5,000 and VC-nominated ones up to about USD 100,000, valid for 12 months.
- Eligibility (from the program page): early-stage startup building with Claude, founded within the last four years, not a previous recipient of Anthropic startup credits. The page says credits are for VC-backed startups; other founders can join the wider program.
- Restrictions (from the program page): credits apply to the first-party Claude API via the Claude Console, not AWS Bedrock, Google Vertex AI or other platforms.
- How: form at https://claude.com/programs/startups, about two minutes; needs a Claude Console account and a company email.
- Fit: high. Claude Code is the office's default agent.

### OpenAI

- Status: unclear. Secondary sources disagree on whether OpenAI still runs a startup credit program; where it exists it is described as up to about USD 2,500-5,000 for startups backed by partner VCs. Check https://openai.com/startups before planning on it.
- Alternative: OpenAI models through Azure, paid with Microsoft for Startups credits.

### Mistral AI

- What (secondary source): up to about EUR 30,000 in La Plateforme credits through the Mistralship cohort program.
- Status (secondary source): no public self-serve application form as of May 2026; applications go through open cohort windows or Mistral's sales team.
- Fit: medium. EU-based provider, useful for clients who want an EU model option.

## Clouds

### AWS Activate

- Founders tier: up to USD 5,000 in credits, most applicants get USD 1,000 first. For self-funded startups, no referral needed. (Vendor page.)
- Portfolio tier: up to USD 200,000, needs an Organization ID from an Activate Provider (accelerator, VC). (Vendor page.)
- Eligibility (vendor page): pre-Series B, founded within the last 10 years, an AWS account on a paid plan, a company website.
- How: create an AWS Builder ID, pick the tier, describe the startup, link the AWS account (root or admin access needed), submit. Decision in 5-10 business days. https://aws.amazon.com/startups/credits
- Fit: high for the Amazon Build Ship Shape (Alexa+) hackathon, due Oct 23. Apply this week so the credits arrive in time. Credits can pay for Amazon Bedrock model usage, which is separate from Anthropic's own credits.

### Google Cloud

- What (secondary sources; the vendor page did not load in the check): the Google for Startups Cloud Program has a Start tier of around USD 2,000 for unfunded startups; Scale tiers up to USD 200,000, and up to USD 350,000 for AI-first startups, for VC-backed companies. Covers Google Cloud including Vertex AI and Gemini.
- Eligibility (secondary sources): younger than 5 years for the AI tier, funded, with real AI workloads.
- How: https://cloud.google.com/startup (Google account sign-in needed to apply).
- Fit: low to medium. Only if a client or hackathon needs Google Cloud.

### Microsoft for Startups

- What (vendor page): "up to USD 150,000 in credits" for Azure, plus AI services and developer tools. The page gives no tiers. Secondary sources describe USD 1,000 for most direct applicants, up to USD 5,000 after business verification, and the larger amounts only with investor or accelerator affiliation. The old "Founders Hub" name has been retired.
- How: "Get started" on https://www.microsoft.com/en-us/startups.
- Fit: medium. Azure credits can pay for OpenAI models through Azure, and the repository already has an Azure deployment guide (docs/azure.md).

### Nebius

- What: introductory credits and compute discounts; the AI Lift program with NVIDIA Inception offered up to USD 150,000 to eligible Inception members (Nebius announcement, April 2025).
- Eligibility (vendor page, checked now): credits are "currently available exclusively through our venture capital partners"; applicants must be VC or accelerator-backed with at least USD 5M raised from an approved Nebius VC partner, building an AI product, incorporated less than 5 years ago. Consulting firms, resellers, cloud providers and crypto-only businesses are excluded.
- How: through a partner VC's platform team. https://nebius.com/startups/apply
- Fit: low for credits now. For the Nebius x NVIDIA hackathon (due Oct 30), use whatever credits the hackathon itself provides.

### Vultr

- What (secondary sources; the vendor page returned 403 in the check): the Vultr Digital Start-up Program offers up to USD 100,000 in credits plus long-term discounts, for startups with recent Series A-E funding and six months of cloud invoices to share. Some partner programs (for example T-Hub in India) give USD 2,500 for six months. New accounts get a trial credit, reported as USD 300 for 30 days.
- How: https://www.vultr.com/startup-program/
- Fit: low for the program; use the trial credit and any Vultr Agent Rush (Nov 3-8) event codes. The repository's Vultr deployment work is on the `launch/vultr-deploy` branch.

### OVHcloud Startup Program

- What (vendor page): Start level EUR 10,000 in credits plus 6 hours of engineering support for 12 months; Scale level up to EUR 100,000 plus up to 20 hours; an Enablers level for accelerators and VCs.
- How: apply at https://startup.ovhcloud.com/en/
- Fit: high for the hosted product. EU-headquartered provider with EU regions, which matches the EU hosting story.

### Scaleway Startup Program

- What (vendor page): Founders EUR 1,000 over one year; Early Stage EUR 1,500 a month for 6 months (EUR 9,000); Growth Stage EUR 3,000 a month for 12 months (EUR 36,000).
- Eligibility (vendor page): less than 5 years old, fewer than 50 employees, not yet a Scaleway customer. Rolling admission, weekly committee.
- How: via https://www.scaleway.com/en/startup-program/ or startup-program@scaleway.com
- Fit: high for the hosted product, for the same EU reasons as OVHcloud. Apply before opening a Scaleway account, since existing customers are not eligible.

## Programs

### NVIDIA Inception

- What (vendor page): free membership with training, SDKs, preferred pricing, partner cloud credits and investor introductions. No fees, no equity, rolling applications.
- Eligibility (vendor FAQ): at least one developer, a working website, incorporated, less than 10 years old. Excluded: "consulting and outsourced development firms", companies associated with cryptocurrency, cloud service providers, resellers and distributors, public companies.
- How: https://programs.nvidia.com/phoenix/application
- Fit: only as the product company, and only if the company is not described as crypto-related. The Solana and Base grant work may count against this; keep that in a separate project or entity if Inception matters.

## Suggested order

1. AWS Activate Founders, now, for the Oct 23 hackathon.
2. Anthropic Claude for Startups, once the company and domain exist.
3. OVHcloud or Scaleway (pick one as the hosting home) before the first hosted pilot.
4. Microsoft for Startups, if a client wants Azure or OpenAI models.
5. NVIDIA Inception, only if the company profile fits the exclusions above.

Keep a table of what was applied for, when, with which description, and when the credits expire. Several programs ask whether you have received credits before, and the answers need to be consistent.

## Sources

- Anthropic: https://claude.com/programs/startups (vendor); amounts from secondary guides such as https://securityboulevard.com/2026/08/anthropic-claude-for-startups-the-complete-guide-to-credits-tiers-and-eligibility-2026/
- AWS: https://aws.amazon.com/startups/credits (vendor)
- Google: https://cloud.google.com/startup (vendor, not readable without sign-in); https://cloudkompas.com/blog/google-cloud-for-startups-2026-credits-guide (secondary)
- Microsoft: https://www.microsoft.com/en-us/startups (vendor); https://creditforstartups.com/resources/microsoft-azure-startup-credits (secondary)
- NVIDIA: https://www.nvidia.com/en-us/startups/ and https://www.nvidia.com/en-us/startups/faq/ (vendor)
- Nebius: https://nebius.com/startups/apply (vendor); https://nebius.com/blog/posts/ai-lift-startups-innovation-with-nvidia (vendor, April 2025)
- Vultr: https://www.vultr.com/startup-program/ (vendor, not readable in the check); https://sourcey.com/c/vultr/offers/vultr-digital-start-up-program (secondary)
- OVHcloud: https://startup.ovhcloud.com/en/ (vendor)
- Scaleway: https://www.scaleway.com/en/startup-program/ (vendor)
- Mistral: https://guptadeepak.com/startup-offers/programs/mistral-startups (secondary)
- OpenAI: https://guptadeepak.com/startup-offers/programs/openai-for-startups and https://creditforstartups.com/companies/openai (secondary, conflicting)
