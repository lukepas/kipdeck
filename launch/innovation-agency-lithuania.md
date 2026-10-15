# Innovation Agency Lithuania

**Drafted on 2026-10-01 under the old name.** The product is now Kipdeck, the inbox for your AI coding agents, built on agent-office (MIT, by webdevcody / AgentSystemLabs), with Proof of Merge as its payout layer. Refresh the product name, what is built and the disclosure from [chain/disclosure.md](chain/disclosure.md) before you use this kit.

Last checked: 2026-10-01. Sources: the Innovation Agency (Inovaciju agentura) funding list and call pages, and the 2021-2027 EU investment site (links below). Call documents are in Lithuanian; details taken from summaries of them are [unverified] until read in the original.

Two calls matter, and a third is listed so nobody wastes time on it:

1. **Startup participation in foreign events** (open now): refunds travel to an event abroad. It fits the on-site day of Vultr Agent Rush in Salt Lake City on 2026-11-08. The online-only hackathons do not qualify, because the cost it covers is travel.
2. **ICT prototype creation by startups** (no open call found): up to about EUR 41k for a prototype or EUR 62k for a product, 100 percent. The last round closed on 2025-06-30. Watch for a new one.
3. Innovation popularization events: closed on 2026-09-14 and only for associations of at least 25 businesses [unverified on 2026-10-01: the call no longer shows on the funding list]. Not for us.

All three need a **Lithuanian-registered company**, not a private person. If the fork is run as a side project, that means setting up a company (UAB, or checking whether an MB qualifies [unverified]) and getting startup status first.

## Deadline

- Foreign events call (events from 2026-07-16 to 2026-12-31): opened 2026-07-08 09:00, closes **Wednesday 2026-11-11, 17:00 Lithuanian time (EET, UTC+2)**, which is 15:00 UTC. The call page says it can be stopped early if the requested amounts exceed the EUR 87,500 budget (the funding list rounds it to EUR 88,000). A parallel call for events from 2026-01-01 to 2026-07-15 closes the same day and does not apply to a November trip.
- You may apply before or after the event. Apply **as soon as the on-site approval and flights exist** (target 2026-10-21) rather than after the trip, so the budget is not gone.
- ICT prototype call: none open on 2026-09-30. Check the funding list on 2026-11-30 (calendar reminder) and monthly after.

## Links

- Funding calls list: https://www.inovacijuagentura.lt/finansavimas/
- Foreign events call (second period, 2026-07-16 to 2026-12-31): https://www.inovacijuagentura.lt/finansavimo-kvietimas/skatinti-lietuvos-startuoliu-dalyvavima-uzsienio-renginiuose-kurie-vyksta-nuo-2026-m-liepos-16-d-iki-2026-m-gruodzio-31-d/
- Last ICT prototype call (closed 2025-06-30): https://www.inovacijuagentura.lt/finansavimo-kvietimas/skatinti-startuoliu-inovatyviu-produktu-ar-inovatyviu-produktu-prototipu-kurima-irt-srityje-2025-05-30/
- The same measure on the EU investment site: https://esinvesticijos.lt/kvietimai/skatinti-startuoliu-inovatyviu-produktu-ar-inovatyviu-produktu-prototipu-kurima-irt-srityje-02-113-j-0001-j08
- Startup status assessment: the call says the pitch deck and startup-status documents go through the Hopohopo.io platform (https://hopohopo.io)
- Application portal (KIP): https://kip.inovacijuagentura.lt/login
- General consultations: konsultacijos@inovacijuagentura.lt, +370 700 77 055

## Eligibility checklist

Foreign events call:

- [ ] A company registered in Lithuania with **startup status** under the Small and Medium Business Development Law, assessed through Hopohopo.io.
- [ ] Sales revenue of at least EUR 2,000 in the last financial year. A new company with no revenue does not qualify; consultancy pilot income booked through the company would count [unverified].
- [ ] The event is abroad and about high technology, startups or the applicant's sector, and meets section 21 of the call rules [unverified: read section 21]. The host country must not be on Lithuania's travel warning list.
- [ ] Eligible cost: travel to and from the event country. Up to EUR 3,500 per applicant, up to 100 percent of eligible costs.
- [ ] At most 3 events per startup (3 more if you show foreign partnerships from earlier funded trips).
- [ ] SME status declaration; pitch deck on Hopohopo.io; proof of attendance afterwards (ticket, badge, photos, a short report).
- [ ] Submitted electronically through the agency's KIP system (https://kip.inovacijuagentura.lt/login). Applying before or after the event is allowed; the documents differ.

ICT prototype call (when it reopens, based on the 2025 round):

- [ ] Micro or small enterprise registered no more than 5 years ago, with high innovation-driven growth potential.
- [ ] Eligible for de minimis aid.
- [ ] Prototype grant up to EUR 41,483.17 with VAT (EUR 39,701.34 without); product grant up to EUR 62,046.60 with VAT (EUR 59,296.65 without); fixed sum, 100 percent.
- [ ] Only the top few scoring applications are funded (five in 2025), others go on a reserve list.
- [ ] Applied through https://dms.investis.lt.

## Pre-existing code disclosure

The agency funds the applicant's own work. Say plainly what is not ours:

```field name="Background (English)" max-chars=700
Our product is built on Agent Office, an MIT-licensed open source project by webdevcody / AgentSystemLabs (github.com/AgentSystemLabs/agent-office). The license lets us use, modify and sell it with attribution. Our company develops a fork that adds open-model workers and paid tasks, with sandboxed agent execution and voice control in progress, and sells pilots to teams adopting AI coding agents. Only this work, not the upstream project, is presented as ours.
```

```field name="Background (Lithuanian)" max-chars=800 lang=lt
Mūsų produktas sukurtas remiantis Agent Office - atvirojo kodo MIT licencijos projektu, kurį sukūrė webdevcody / AgentSystemLabs (github.com/AgentSystemLabs/agent-office). Licencija leidžia jį naudoti, keisti ir parduoti nurodant autorius. Mūsų įmonė kuria šio projekto atšaką, kuri prideda atvirųjų modelių agentus ir mokamas užduotis, o izoliuotas agentų vykdymas ir valdymas balsu dar kuriami; komandoms, pradedančioms naudoti DI programavimo agentus, siūlome bandomuosius projektus. Kaip savą darbą pristatome tik šį indėlį, o ne pradinį projektą.
```

The Lithuanian text is machine-drafted: have a native speaker read it before it goes into a form.

## Project description

The foreign events application mostly asks for the event, the dates, the costs and the pitch deck; its free-text fields and limits were not read [unverified]. Draft for "purpose of participation":

```field name="Purpose of participation (English)" max-words=120
We will present our prototype at the on-site day of Vultr: Agent Rush in Salt Lake City, Utah, on 2026-11-08: a hackathon on safe execution of AI agents, run by lablab.ai with Vultr. Our product lets teams run AI coding agents in a shared 3D office, and we are building an isolated sandbox for each agent. At the event we demo it to Vultr and lablab.ai judges and meet cloud and AI companies as potential partners and pilot customers.
```

```field name="Purpose of participation (Lithuanian)" max-words=120 lang=lt
2026 m. lapkričio 8 d. pristatysime savo prototipą Vultr: Agent Rush hakatono gyvoje dalyje Solt Leik Sityje (Juta, JAV). Tai lablab.ai ir Vultr organizuojamas renginys apie saugų DI agentų vykdymą. Mūsų produktas leidžia komandoms naudoti DI programavimo agentus bendrame 3D biure, o kiekvienam agentui kuriame izoliuotą aplinką. Renginyje pristatysime sprendimą Vultr ir lablab.ai vertintojams ir susitiksime su debesijos bei DI įmonėmis kaip galimais partneriais ir bandomųjų projektų klientais.
```

For a future ICT prototype application, reuse the product text from [vultr-agent-rush.md](vultr-agent-rush.md) and the pilot offer from the business playbook branch.

## Judging criteria

Foreign events call: an eligibility and document check, not a competition; applications are handled in order until the budget runs out [unverified for this round].

| What is checked | Our answer |
| --- | --- |
| Startup status and EUR 2,000 revenue | Hopohopo.io assessment done; last year's accounts |
| Event abroad, high-tech or startup themed | Vultr Agent Rush on-site day, Salt Lake City |
| Eligible costs, within EUR 3,500 | Flight tickets and receipts only |
| Proof of attendance | Badge, photos, the lablab submission page, a short report |

ICT prototype call (2025 round): scored applications, top ones funded. Expect innovativeness, market potential, team capability and the plan's feasibility [unverified: the 2025 scoring criteria were not read].

## Demo video script

Not required by either call. The Hopohopo.io startup profile and the pitch deck carry the story; this 60-second clip goes on the profile if it accepts video [unverified], and doubles as the opener for the Salt Lake City demo.

Runtime target: 1:00 (limit: under 3:00)

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:15 | The office with agents at desks | "Teams are hiring AI coding agents. They need to see them and keep them contained." |
| 0:15-0:35 | A worker in its sandbox; a blocked command | "Each agent works in its own sandbox, in a shared office the whole team can watch." |
| 0:35-0:50 | Pilot offer card | "We run pilots for teams adopting coding agents." |
| 0:50-1:00 | Company name, built on Agent Office (MIT), contact | "Built on the open source Agent Office, made in Lithuania." |

## Submission checklist

- [ ] Company registered in Lithuania.
- [ ] Startup status confirmed through Hopohopo.io; last financial year revenue at least EUR 2,000.
- [ ] Section 21 of the call rules read in the original; the event qualifies.
- [ ] Vultr on-site approval email and flight booking saved.
- [ ] Application filed in KIP as soon as flights are booked; before 2026-11-11 17:00 EET at the latest.
- [ ] After the trip: badge, photos, report, receipts uploaded.
- [ ] All `{{...}}` placeholders filled; `npx tsx launch/tools/lint.ts` clean.
- [ ] Reminder set to check for a new ICT prototype call (2026-11-30).
