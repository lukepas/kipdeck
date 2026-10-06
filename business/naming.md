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
