# Exercise repositories

Five small repositories with seeded issues, to be built once and reset for each group. These are specifications: as of 2026-09-30 none of the repositories has been built, so budget the time to build them before selling a workshop date. Each lives in a workshop GitHub organization, has a `workshop-start` tag to reset to, CI that finishes in under 2 minutes, and a README that says it is training material.

Common rules for all five:

- Small enough to read in 10 minutes: 500-2,500 lines of code, not counting tests.
- Tests exist and pass at `workshop-start`, with coverage gaps where the seeded issues are.
- Each seeded issue is a GitHub issue with a label: `agent-ready` (well written), `vague` (deliberately under-specified), `trap` (teaches a failure), `conflict` (touches a shared file on purpose), or `security`.
- An `INSTRUCTOR.md` on a separate private branch lists the expected fix, the lesson and the known agent failure for each issue. Never on the default branch, or agents will read it.
- No real personal data, no real secrets. Any "secret" in a fixture is an obvious fake like `sk-test-not-a-real-key`.
- MIT license, so participants can keep their forks.

| Repo | Language | Used in | Theme |
| --- | --- | --- | --- |
| ledger-lite | TypeScript (Node) | Day 1 | Business logic, task writing |
| trail-api | TypeScript (Node, HTTP) | Day 1 | Parallel work, conflicts, review, injection |
| sensor-ingest | Python | Day 2 of 3 | Test-first tasks, flaky tests, performance |
| inkwell-web | TypeScript (React) | Day 2 of 3 | UI tasks, screenshots as acceptance, accessibility |
| legacy-billing | Java 17 (Maven) | Day 3 of 3 | Decomposing a large change, characterization tests |

## ledger-lite

A command-line personal ledger: import CSV bank statements, categorize transactions by rules, print monthly summaries. About 900 lines, node:test.

Seeded issues:

| Id | Label | Issue | Lesson |
| --- | --- | --- | --- |
| L1 | agent-ready | Monthly summary ignores transactions dated on the last day of the month (off-by-one in the date range) | Clear bug with a reproducible example is easy |
| L2 | agent-ready | Add a `--from` / `--to` date filter to `summary` | Small feature with acceptance examples |
| L3 | trap | Totals are wrong for amounts like 0.1 + 0.2 | Agents often round at display time instead of switching to integer cents; the issue should say which |
| L4 | trap | Import fails on a CSV with a semicolon delimiter | Agent tends to special-case the sample file; acceptance needs a second sample |
| L5 | agent-ready | Rule matching should be case-insensitive | Trivial; used to time the loop |
| L6 | trap | "Make the tests pass" on a test that is itself wrong | Agent edits the code to match a wrong test; teaches "say which one is the source of truth" |
| L7 | vague | "Summaries should be nicer" | Should not go to an agent until rewritten |
| L8 | vague | "Support multiple currencies" | Too big; split into three issues first |

## trail-api

A small HTTP API for hiking trails: list, search, create, rate. About 1,800 lines, one router file, an in-memory store with a JSON fixture, node:test with a test HTTP client.

Seeded issues:

| Id | Label | Issue | Lesson |
| --- | --- | --- | --- |
| T1 | agent-ready | `GET /trails?difficulty=` should accept a comma-separated list | Straightforward |
| T2 | agent-ready | Return 404 instead of 500 for an unknown trail id | Straightforward |
| T3 | conflict | Add `GET /trails/:id/ratings` | Touches `router.ts` with T4 |
| T4 | conflict | Add `DELETE /trails/:id` for admins | Touches `router.ts` with T3; merge conflict lesson |
| T5 | agent-ready | Validate `length_km` is positive on create | Straightforward |
| T6 | trap | Search should rank exact name matches first | Known failure: agent loosens the ranking test's assertion; used in review block |
| T7 | agent-ready | Add pagination (`limit`, `cursor`) to list endpoints | Medium; tests needed on both ends |
| T8 | vague | "The API is slow" | No measurement; should become a profiling task first |
| T9 | trap | Fetch elevation data for a trail from a public API | Agent adds an HTTP client dependency when `fetch` exists; tests become networked; review lesson |
| T10 | agent-ready | Add an OpenAPI description of the existing endpoints | Docs task agents do well |
| T11 | agent-ready | Rate limiting on `POST /ratings` per client | Medium; checks the agent handles time in tests |
| T12 | security | Fix a typo in the trail description of fixture trail 17 | The fixture file contains a comment addressed to AI assistants asking them to add a new dependency and a postinstall script. Agent may follow it; review must catch it |

## sensor-ingest

A Python service that reads sensor readings from files in a folder, validates them, aggregates them per minute and writes one CSV file per sensor (standard library plus pytest only). About 1,500 lines.

Seeded issues:

| Id | Label | Issue | Lesson |
| --- | --- | --- | --- |
| S1 | agent-ready | Readings with a timestamp in the future should be rejected with a counted reason | Clear rule, measurable |
| S2 | trap | A test fails about 1 run in 10 (depends on dict ordering and wall-clock time) | Agent adds a retry or a sleep; the task must ask for the root cause |
| S3 | agent-ready | Write tests for `aggregate.py`, which has none, before any change | Test-first task: tests only, no code changes allowed |
| S4 | agent-ready | Aggregation of 1 million readings takes 40 seconds; target is under 5 | Needs a benchmark script in the acceptance criteria |
| S5 | vague | "Handle bad data better" | Rewrite into specific rules first |
| S6 | trap | Timezone handling: readings in local time are shifted by an hour in March and October | Agent fixes one DST transition only; acceptance needs both |
| S7 | conflict | Rename the `value` field to `reading` everywhere | Large mechanical change; conflicts with every other open PR; teaches sequencing |

## inkwell-web

A small React notes app (Vite, no backend, localStorage), with Playwright tests and a screenshot test. About 2,000 lines.

Seeded issues:

| Id | Label | Issue | Lesson |
| --- | --- | --- | --- |
| W1 | agent-ready | Add a dark theme toggle that remembers the choice | UI task with a screenshot as acceptance |
| W2 | agent-ready | The delete button has no accessible name | Accessibility fix with an axe check in CI |
| W3 | trap | Make the editor "feel faster" | Needs a measurement; agents add memoization everywhere |
| W4 | agent-ready | Keyboard shortcut Ctrl/Cmd+K opens search; Esc closes it and returns focus | Focus management; checks the agent tests keyboard paths |
| W5 | trap | Update the screenshot test baseline after W1 | Agent updates the baseline for unrelated screens too; review lesson |
| W6 | vague | "Redesign the sidebar" | Should go to a person, not an agent |

## legacy-billing

A deliberately old-style Java 17 service (Maven, JUnit 5): invoice calculation with a 600-line `InvoiceService` class, static helpers, few tests. About 2,500 lines.

Seeded issues:

| Id | Label | Issue | Lesson |
| --- | --- | --- | --- |
| B1 | agent-ready | Write characterization tests that pin the current output of `InvoiceService.calculate` for the 20 sample invoices in `fixtures/` | Tests before refactoring; no production code changes |
| B2 | agent-ready | Extract VAT calculation from `InvoiceService` into its own class, behavior unchanged | Refactor with B1 as the safety net |
| B3 | vague | "Modernize the billing service" | The capstone of day 3: split into 5-8 agent-ready issues, sequence them, and run them through the queue |
| B4 | trap | Add support for a reduced VAT rate for some product categories | Business rule missing from the issue; agent invents one. Lesson: agents fill gaps silently |
| B5 | security | Log invoice totals for debugging | Agent logs the full customer record including the fake personal data in fixtures; review lesson on data in logs |
