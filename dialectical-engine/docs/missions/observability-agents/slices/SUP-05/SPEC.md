# SPEC — SUP-05 Known-incident awareness from a V-published source

**Status:** FROZEN at creation (2026-09-01, REQ-SUP). No agent edits this file after
creation. Scope change = new SPEC version, ratified by V.

**Mission:** `observability-agents` · **Product:** SupportAgent (Bot A) · **Traces to:** V's
goal (`00-intake-H0.md:10`); packet upstream item 6 ("tell a user 'this is a known
incident' only from a truthful source — specify what that source is and what the bot says
when it has none"); H0 C1 (approval-first), C3 (standalone products share read-only
stores only). Requirements file: `requirements/supportagent.md` (Q2, Q7 row SUP-D10).
**Depends on:** SUP-01. **Tree state measured:** `dev` @ `4f764037`.

## Intent

When something is broken and V has said so, the assistant says so in V's words; when
nothing has been published, it says that it has no record — and never infers an incident
from raw signals.

## Ground truth this SPEC rests on (measured 2026-09-01 on `4f764037`)

- `obs.incident` (`migrations/0034_obs_foundation.sql:120`) and `obs.component_health`
  (`:240`) are internal observability tables; no HTTP route exposes them; no status page
  exists. They are the ObservationAgent product's raw material, not a public statement.
- Approval-first (C1): an agent may propose; only V publishes. The ObservationAgent's
  requirements are written in parallel (REQ-OBS); this SPEC states the interface the
  assistant needs so REQ-SYNTH can diff it against what the ObservationAgent publishes.

## Requirements

### SUP-05-R01 — The interface table
`support.public_incident` {`incident_id` text PK, `started_at`, `ended_at` nullable,
`severity` ∈ {`minor`,`major`}, `affected_surface` ∈ {`debates`,`publishing`,`sign-in`,
`whole-site`}, `summary_en`, `summary_ro`, `published_by` (= `V`), `published_at`,
`source_ref` nullable (e.g. an `obs.incident` id)}. It is the ONLY incident source the
assistant reads. The assistant never reads `obs.*`.

### SUP-05-R02 — Only V publishes
`pnpm support:incident publish --id <id> --severity <s> --surface <s> --en "<text>" --ro
"<text>"` inserts a row with `published_by = V`; `pnpm support:incident resolve --id <id>`
sets `ended_at`. Rows are never deleted. The ObservationAgent product may later write into
this table under its own V-approval rule; until then this command is the only writer.

### SUP-05-R03 — Incident questions are answered deterministically
Messages classified `INCIDENT` (fixed bilingual phrase list: "is something broken", "site
down", "not working", "e stricat", "nu merge", "e căzut", …) are answered without a model
call: INCIDENT_ACTIVE (§Copy) built from the row's own summary text (never paraphrased) when
a row has `ended_at IS NULL`; otherwise NO_INCIDENT.

### SUP-05-R04 — When there is none, say so
NO_INCIDENT is the fixed text (§Copy). It never asserts that nothing is wrong.

### SUP-05-R05 — Notice on related answers
While an incident with `ended_at IS NULL` exists, every `ANSWER_GROUNDED` or
`ANSWER_OWN_STATE` reply whose intent touches the affected surface is prefixed with
INCIDENT_NOTICE (deterministic prefix, outside the model).

### SUP-05-R06 — Eval class F becomes applicable
Three cases: active incident → INCIDENT_ACTIVE with the exact summary; none → NO_INCIDENT;
resolved → NO_INCIDENT with no mention of the past incident.

## Copy — verbatim, both languages

- INCIDENT_ACTIVE · en: "Known incident since {started_at}: {summary_en} (published by the
  team). If your problem matches, no need to report it; otherwise choose 'Talk to a
  human'." · ro: "Incident cunoscut din {started_at}: {summary_ro} (publicat de echipă).
  Dacă problema ta se potrivește, nu e nevoie să o raportezi; altfel alege „Vorbește cu o
  persoană”."
- NO_INCIDENT · en: "I have no record of a current known incident. That doesn't rule one
  out — if something looks broken, choose 'Talk to a human' and describe it." · ro: "Nu am
  nicio înregistrare a unui incident cunoscut în acest moment. Asta nu exclude unul — dacă
  ceva pare stricat, alege „Vorbește cu o persoană” și descrie problema."
- INCIDENT_NOTICE · en: "Note: there is a known incident affecting {surface} since
  {started_at}." · ro: "Notă: există un incident cunoscut care afectează {surface} din
  {started_at}."

## Acceptance — V runs these in the real dev stack

1. `pnpm dev:auth:up`; private window; `/help`; type `Is anything broken right now?`
   Expected: NO_INCIDENT text within 1 s.
2. Terminal: `pnpm support:incident publish --id inc-test-1 --severity major --surface
   debates --en "Debates are slow to generate." --ro "Dezbaterile se generează lent."`
   Expected: prints the inserted row with `published_by: V`.
3. Browser: type `Is anything broken right now?` Expected: INCIDENT_ACTIVE containing the
   exact text "Debates are slow to generate." Type `E stricat ceva acum?` Expected: the
   Romanian INCIDENT_ACTIVE containing "Dezbaterile se generează lent."
4. Type `How do I publish a debate?` Expected: the grounded answer prefixed by
   INCIDENT_NOTICE naming `debates`.
5. Terminal: `pnpm support:incident resolve --id inc-test-1`. Browser: type `Is anything
   broken right now?` Expected: NO_INCIDENT.
6. psql: `SELECT incident_id, ended_at IS NOT NULL FROM support.public_incident;` Expected:
   `inc-test-1 | t` (row kept).
7. `pnpm support:eval --runs 3`. Expected: class `F: 3/3` in every run.

## Out of scope (this slice)

- Detecting incidents (ObservationAgent). Reading `obs.*`. Any automatic publication.
- A public status page.

## Parallel-safety (single-writer rule)

- Creates: `apps/api/src/support/incidents.ts`, `apps/runner/src/support-incident-cli.ts`,
  `migrations/<n>_support_public_incident.sql`, `tests/architecture/sup-05-*.test.ts`.
- Appends lines to: `package.json` (`support:incident`). No route additions.
- Depends on SUP-01. Parallel-safe with SUP-02, SUP-03, SUP-04, SUP-06, SUP-07.
  Cross-product interface: REQ-SYNTH diffs `support.public_incident` against the
  ObservationAgent's publication surface; the disposition is the orchestrator's ticket.
