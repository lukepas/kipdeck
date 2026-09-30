# Statement of work template

For the agent team lab pilot described in [agent-team-lab-offer.md](agent-team-lab-offer.md). This is a starting draft, not legal advice. Have a lawyer check it once, then reuse it. It assumes a master services agreement (MSA) or general terms already exist between the parties; if not, the clauses marked "MSA" need to be written out in full or replaced by a short-form contract.

Fill every `[bracket]`. Delete the notes in italics before sending.

## Statement of work no. [SOW-YYYY-NN]

Between [Supplier legal name], [registered address], company code [code], VAT [VAT no.] ("Supplier")

and [Client legal name], [registered address], company code [code], VAT [VAT no.] ("Client").

Under the [MSA name and date]. Where this SOW and the MSA conflict on the pilot, this SOW applies.

### 1. Purpose

Supplier will set up and run a [Starter / Standard / Extended] agent team lab pilot: Client's engineers and a team of AI coding agents work on Client's repositories in a shared workspace, and the results are measured against Client's own baseline.

### 2. Term

Start date: [date]. End date: [date], [2 / 4 / 6] weeks after the start date. The end date moves by the same number of business days as any delay caused by Client under section 7.

### 3. Scope

In scope:
- Repositories: [owner/repo], [owner/repo].
- Participating Client engineers: up to [N], named in Annex A.
- Concurrent agent workers: up to [N].
- Hosting of the pilot workspace in [Client's cloud account, region X / Supplier's hosting, EU region X].
- Team workshop: [half day / 1 day / 1 day plus half-day follow-up].
- Security activities: [checklist / checklist and threat model / written security review].

Out of scope unless added by a change request:
- Deployments to production, and changes to production infrastructure.
- Repositories not listed above.
- Model provider costs (see section 6).
- Support after the end date.
- Work outside [CET/EET] business hours.

### 4. Deliverables and acceptance

| No. | Deliverable | Due | Acceptance criterion |
| --- | --- | --- | --- |
| D1 | Working pilot workspace connected to the repositories, with named accounts and roles | End of week 1 | Each named engineer can sign in and start an agent worker on each repository |
| D2 | Agent instruction files and task templates, committed to the repositories by PR | End of week 2 | PRs opened; Client merges or requests changes |
| D3 | Review policy and cost policy (documents) | End of week 1, updated at the end | Delivered and reviewed in a meeting |
| D4 | Weekly metrics note | Each Friday | Delivered |
| D5 | Final metrics report with raw data (CSV) | Last week | Delivered; metric definitions as in Annex B |
| D6 | Final readout (60-90 minutes) | Last 3 business days | Held |
| D7 | Runbook and handover of the workspace, or a clean installation in Client's account | Last day | Client's lead engineer confirms they can start, stop, upgrade and add or revoke a person using the runbook |

Client has 5 business days after a deliverable is delivered to accept it or list specific non-conformities against its acceptance criterion. Supplier fixes listed non-conformities within 5 business days. A deliverable not rejected within 5 business days is accepted. Metrics outcomes (for example acceptance rate or cost per PR) are reported, not guaranteed, and are not acceptance criteria.

### 5. Fees and payment

Fixed fee: EUR [12,000 / 28,000 / 45,000], excluding VAT.

Invoicing:
- [Starter and Standard] 50% on signing this SOW, 50% on delivery of D6.
- [Extended] 40% on signing, 30% on the mid-point review, 30% on delivery of D6.

Payment within [14 / 30] days of invoice. Travel for agreed on-site days at cost, with Client's prior approval. Add-ons as in Annex C.

### 6. Model provider and hosting costs

*Pick one option and delete the other.*

Option 1: Client's accounts. Client provides and pays for its own model provider accounts or subscriptions for each participating engineer. Supplier does not hold Client's API keys outside the pilot workspace.

Option 2: Supplier-provided access. Supplier provides model access and invoices it at cost, without mark-up, monthly in arrears, with usage reports. Total model spend is capped at EUR [cap] a month; Supplier stops or asks before exceeding it.

Hosting: [Included in the fee when hosted by Supplier / Paid by Client in its own cloud account].

### 7. Client responsibilities

- Name a lead engineer who spends about 30% of their time on the pilot, and reviewers available each business day.
- Grant repository, CI and (if applicable) cloud access within 3 business days of the start date.
- Have working CI on the repositories that runs on pull requests.
- Provide model provider accounts by day 3 (Option 1).
- Provide baseline data for the 4-8 weeks before the start, or allow Supplier read access to collect it.
- Review every agent-authored pull request before merge. Client decides what is merged.

### 8. Security and data protection

- Supplier follows the security posture in the offer document (Annex D).
- The pilot workspace is used for Client only and not shared with other customers.
- If Supplier hosts the workspace or otherwise processes personal data on Client's behalf, the parties sign the data processing agreement in Annex E before the start date. Hosting is in the EU/EEA only.
- Client chooses which model providers may receive its code. Supplier configures the provider settings Client selects (for example data retention and training use) where the provider offers them. Client's agreements with those providers govern their processing.
- At the end date Supplier revokes its own access, and deletes Client data it holds within 30 days, confirming this in writing, unless the parties agree hosted support.
- Each party tells the other without undue delay, and within 48 hours at most, about any security incident affecting the pilot.

### 9. Intellectual property

- Client owns the code, configuration and documents produced for Client under this SOW (D2, D3, D5, D7 and any code in Client's repositories), on payment of the fees.
- The workspace software is open-source (Agent Office, MIT license, and Supplier's published modifications under the same license). Nothing in this SOW transfers ownership of it; Client may use, copy and modify it under that license.
- Supplier keeps its general know-how, templates and tools that are not specific to Client, and may reuse them without Client confidential information.
- AI-generated output: Client accepts that agents produce code that Client reviews and merges; Supplier makes no warranty beyond section 10 about the originality of agent output. *Check how the chosen model providers handle output ownership and indemnities, and mention it here if relevant.*

### 10. Warranties and liability

- Supplier performs the services with reasonable skill and care by suitably experienced people.
- Supplier does not warrant particular metrics outcomes, the output quality of third-party models, or the availability of model providers.
- Liability as in the MSA. *If no MSA: cap total liability at the fees paid under this SOW, exclude indirect and consequential loss, except for breach of confidentiality, data protection and cases where the law does not allow a cap.*

### 11. Confidentiality

As in the MSA. *If no MSA: mutual, for 3 years after the end date, covering the repositories, metrics and anything marked confidential.*

Case study: Supplier may publish an anonymous summary of the metrics. A named case study needs Client's written approval of the text. [If the 10% case-study discount applies: Client agrees to a named case study, text approved by Client.]

### 12. Changes

Either party may request a change in writing. Supplier replies within 3 business days with the effect on scope, price and dates. Nothing changes until both sign the change request.

### 13. Termination

Either party may end this SOW with 5 business days' written notice. Client pays for work done up to the end, pro rata to the fixed fee, and Supplier hands over what exists at that point.

### 14. Contacts

| | Supplier | Client |
| --- | --- | --- |
| Commercial | [name, email] | [name, email] |
| Delivery lead | [name, email] | [lead engineer, email] |
| Security contact | [name, email] | [name, email] |

Signed:

| For Supplier | For Client |
| --- | --- |
| Name: | Name: |
| Title: | Title: |
| Date: | Date: |

## Annexes

- Annex A: participating engineers and roles.
- Annex B: metric definitions (copy from pricing-and-metrics.md).
- Annex C: add-on price list (copy from pricing-and-metrics.md).
- Annex D: security posture (copy from agent-team-lab-offer.md).
- Annex E: data processing agreement (use the client's template or a standard GDPR Article 28 DPA; list model providers and hosting providers as sub-processors where applicable).
