# Naming

The fork and any service built on it need their own name. "Agent Office" is the upstream project's name, and anything with "Office", "Teams", "Copilot" or "Workspace" in it invites confusion with Microsoft or Google products and their trademarks. The name should work for the hosted product, the pilot ("[Name] lab") and the workshop.

What to look for in a name:
- Says "people and agents working in one place" without the word "agent" (crowded, and the word may age badly).
- Two syllables or so, easy to spell after hearing it once, works in English and does not mean something awkward in Lithuanian, Latvian, Estonian, Finnish, German or Polish.
- `.com` or `.io` and a matching GitHub organization obtainable.

## Candidates

Status is from a quick web search on 2026-09-30. It is not a trademark check.

| Name | Idea | Quick-search status |
| --- | --- | --- |
| Pairhouse | A house where people pair with agents | No software product found |
| Crewhall | The hall the crew works in | A UK company "Crewhall Limited" is registered (sector not checked); no software product found |
| Keelhouse | The keel keeps the crew on course; review as the keel | No software product found |
| Loftcrew | A crew in a loft workshop | No software product found |
| Yardhand | Hands working in the yard | No software product found |
| Relayhall | Work handed on, relay-style, in one hall | No product found; "Relay.app" is an existing workflow tool, so check for confusion |
| Benchline | People and agents along one workbench | Used by a healthcare operations company (Benchline Systems) and an insurance AI project; close to Benchling (biotech software) |
| Shiftdeck | A deck where the shift runs | A small scheduling app on GitHub uses it |
| Quillyard | Writing (code) in a yard | Not searched yet |
| Hearthdesk | A warm place to sit and work | Not searched yet |

Dropped after the quick search: Forgeyard (at least four agent-tooling projects on GitHub use it), Millrace (an AI workflow runtime at millrace.ai and a git-backed kanban tool use it), Deskwright (an AI desktop-automation MCP server), Loomwork (a writing app and an agent framework).

The landing page uses Pairhouse as a working name. Change it in one place, the `<title>` and the elements with `data-name` in `landing/index.html`, once a name clears.

## Before choosing: trademark and availability checks

Do these for the top three, in this order, and keep screenshots with dates:

1. EUIPO eSearch plus and TMview (covers EU and national offices, including the Lithuanian State Patent Bureau) for identical and similar marks in Nice classes 9 (software), 35 (business services), 41 (training) and 42 (SaaS, IT consulting).
2. WIPO Global Brand Database for international registrations.
3. USPTO search, if US customers or hackathon prizes in the US are likely.
4. Lithuanian company register (Registru centras) and UK Companies House for company names.
5. Domain availability (`.com`, `.io`, `.eu`, `.lt`), GitHub organization, npm package name, and the main social handles.
6. A plain web search for the name plus "AI", "software" and "agents".

If a candidate survives, consider filing an EU trade mark through EUIPO in classes 9, 41 and 42 before launch. Check the current fee on the EUIPO site before filing. An IP lawyer's clearance opinion is worth paying for before spending on branding.

Also check with the employer (see employer-clearance-request.md) whether registering a mark or company is allowed while employed.

## Mergeline and Agent Inbox (checked 2026-10-07)

The fundable direction renames the product to Mergeline, "the inbox for your AI coding agents", with Agent Inbox as the fallback. This is the Stage 0 check of both. It is a registry and web check, not a legal clearance.

| Check | Mergeline | Agent Inbox |
| --- | --- | --- |
| npm | `mergeline` and `@mergeline/cli` are free (404 on the registry) | `agent-inbox` is taken by an unrelated multi-agent messaging package (v0.2.5) |
| `.com` | Registered since 2025-06-27, no live site (404) | `agentinbox.com` resolves, taken |
| `.io` | Taken by a live product: "Mergeline - Build sites with your clients, not for them", a Git-backed CMS with AI chat for static sites (Concepcion Design, LLC, registered 2026-04-22) | not checked |
| `.ai` | Registered 2025-12-11, "Coming Soon" page | `agentinbox.ai` resolves, taken |
| `.dev`, `.app` | No DNS, registry whois gave no record: probably free, confirm at a registrar | `agentinbox.dev` resolves, taken |
| `.eu` | Free (EURid: AVAILABLE) | not checked |
| `.co`, `.sh` | Free (registry: not found) | not checked |
| `getmergeline.com` | Free | - |
| GitHub | No product named Mergeline; the hits are line-merging scripts (QGIS MergeLines and similar) | `langchain-ai/agent-inbox` (about 1.1k stars, "an inbox UX for interacting with human-in-the-loop agents") and `cloudflare/agentic-inbox` |
| Trademark (EUIPO, TMview, USPTO) | Not done: TMview's API reset the connection and USPTO's search has no public API. Do it by hand, see below | Not done; "agent inbox" is likely descriptive and weak as a mark anyway |

What this means:
- Agent Inbox is out as a product name. LangChain already ships an "Agent Inbox" for human-in-the-loop agents, which is the same idea in the same buyer's head, and the npm name and every main domain are gone. Keep "the inbox for your AI coding agents" as the descriptor only.
- Mergeline is usable but not clean. The npm name is free, which matters most for `npx mergeline`, and `.dev`, `.eu` and `getmergeline.com` look free. The risk is mergeline.io: a live developer product with Git and AI in its pitch, plus someone holding mergeline.com and a coming-soon mergeline.ai. Investors and users who search the name will land on them first.
- Do not rename the code, docs or pitch yet. Before Stage 1 puts the name on screens, the founder should (1) run EUIPO eSearch plus and TMview for "mergeline" in Nice classes 9 and 42, (2) run the USPTO search, (3) decide whether a name that shares a word with a Git-backed CMS is acceptable, and (4) register `mergeline.dev`, `mergeline.eu` and the npm name the same day if it is. If the trademark search finds a class 9 or 42 mark, pick a new candidate and repeat this table.
