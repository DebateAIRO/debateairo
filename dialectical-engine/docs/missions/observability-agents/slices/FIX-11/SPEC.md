# FIX-11 — Root traced, ticket filed: a real error gets a deterministic root verdict and ONE ticket a human can act on, with no raw text

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G2 listener** · Depends-on for dispatch: none (own subtrees) · Depends-on for acceptance: **FIX-09 merged** (incidents exist), FIX-02/03 merged for a cause chain to walk.
Absorbs predecessor tickets: **S19 `t_f4439c53`** (mechanical, LLM-free tracer) · the **board-write** mechanics of **S28 `t_28c5c2e2`** (fixed template, board-id read-back before and after) — RE-OWNED under C1/V-1: in phase 1 the FixAgent files the ticket itself at trace time (D9, V-1 row text: "the agent files a ticket naming the root"), which CHANGES OBS-R127's "the listener SHALL NOT create tickets" to "the listener writes ONE board, through one templated module, never `.hermes/**`" — contested row F-2 in `requirements/fixagent.md` holds the board's name; default `fixagent`.
D-criteria evidenced: **D9** (fully), **D2** (the verdict names the root, not the wrapper).
Seam obligations: none. RT-20 (board-id read-back), RT-21 (board inside the injection wall), OBS-R102/R103 bind.

## 1. Intent
"Each error must be traceable to the root" and "it files a ticket for a real error, carrying the root it traced." FIX-11 is the deterministic tracer — eight steps, closed verdict vocabulary, bounded — plus the one board write the FixAgent is allowed: a ticket per incident rendered from a fixed template over server-minted ids and codes.

## 2. Requirements
- **FIX-11-R01** The tracer runs inside the daemon for every incident entering `NEW`, is LLM-free, and terminates in exactly one member of the closed vocabulary `{CODE_ROOT, EXTERNAL_ROOT, ZONE_BOUNDARY, INSUFFICIENT_EVIDENCE, CAUSE_CYCLE, CAUSE_GAP, CAUSE_DEPTH_EXCEEDED, CORRUPT_LINEAGE, REPLAY_UNSUPPORTED, CAPABILITY_GAP}` within `obs.causeDepthMax` hops (seed 64) and a bounded query count.
- **FIX-11-R02** The cause walk follows `parent_occurrence_ref`/`cause_relation` and the chain codes with a visited set; a zone-classified frame anywhere in the chain yields terminal `ZONE_BOUNDARY` (the ruled carve-out — contested row F-12 asks V to confirm the narrowing).
- **FIX-11-R03** `CODE_ROOT` names a repo-relative file and symbol from the normalized frames of the deepest first-party occurrence — never a message, never an absolute path; `EXTERNAL_ROOT` names a boundary (`provider_http`, `postgres_host`, `hatchet_engine`, `cli_subprocess`) with evidence ids and is never a fix target.
- **FIX-11-R04** Every trace persists to `obs.trace` (verdict, evidence ids, visited path, query count, manifest versions) BEFORE the incident leaves `RESEARCHING`.
- **FIX-11-R05** Lineage joins are indexed and bounded; cross-run, future-sequence or build-mismatch joins yield `CORRUPT_LINEAGE`; `apps/replay` is never invoked.
- **FIX-11-R06** ONE ticket per incident: when an incident first reaches a verdict, the daemon creates exactly one Kanban ticket on board `<fixagent board>` (F-2) via `hermes kanban --board <slug> create`, with board-id read-back before and after, refusing on mismatch; a later occurrence of the same incident adds ONE comment with the new count, never a second ticket.
- **FIX-11-R07** Ticket title and body are rendered exclusively from the fixed template over: incident id, fingerprint prefix (8 chars), severity, size label, verdict code, root (`<repo-relative path>:<symbol>` or boundary name), distinct work-unit count, first/last seen, evidence occurrence ids, and the V query to see the rows. No field from any occurrence's free text exists to copy; the renderer's input type has no string field that is not an enumeration or an id.
- **FIX-11-R08** The daemon never writes `.hermes/**`, never any other board, never changes ticket status (the orchestrator/V do); ESCALATE verdicts additionally produce a structured mission-intake candidate file under `tools/obs-listener/escalations/` (OBS-R127's intake shape).
- **FIX-11-R09** `ui_client` incidents are ticketed as report-and-count only, labelled `FIX_INELIGIBLE` (§K row 12).
- **FIX-11-R10** A green suite is a milestone; Done is V's veto after §5.

## 3. States
Incident: `NEW → RESEARCHING → (trace persisted) → TICKETED` (or `ESCALATED` for non-root verdicts); ticket: `created(1)` → `commented(n)`.

## 4. Copy and vocabulary
"verdict" (one closed-vocabulary member) · "root" vs "proximate" · "ticket" (one per incident) · "evidence ids". The ticket template's field names are the vocabulary; nothing else appears.

## 5. Acceptance — V runs this personally (FIX-09 merged; FIX-02 merged)
1. Run FIX-01 step 4's failing job → within 10 s `hermes kanban --board fixagent list` (board name per F-2) shows one NEW ticket.
2. `hermes kanban --board fixagent show <ticket> --json | jq -r '.task.body'` → contains `verdict:`, `root:` with a repo-relative `path:symbol` or an `EXTERNAL_ROOT` boundary (for a bad database URL: `EXTERNAL_ROOT postgres_host` is the expected verdict), `incident:`, `fingerprint:`, the paste-able V query; contains NO `no_such_database`, NO `PLANTED-`, NO absolute path (`grep -c '/Users/'` → 0).
3. Run the failing job again → the same ticket has ONE new comment with `count: 2`; `hermes kanban --board fixagent list` shows no second ticket for that fingerprint.
4. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT verdict, evidence->>'query_count' FROM obs.trace ORDER BY recorded_at DESC LIMIT 1"` → `EXTERNAL_ROOT|<n ≤ bound>`.
5. Code root: cause FIX-03's real failed run (unreachable provider) → its ticket's `root:` is `packages/providers/src/index.ts:<symbol>` or an `EXTERNAL_ROOT provider_http` — whichever the deterministic procedure yields; V reads the evidence ids and confirms they resolve: `SELECT code FROM obs.occurrence WHERE occurrence_id IN (<ids>)`.
6. `ls .hermes/ | wc -l` unchanged before/after; `hermes kanban --board observability-agents list` shows no ticket authored by the daemon.
V vetoes Done only after steps 1–6 match.

## 6. Out of scope
LLM diagnosis, proposals, notifications (FIX-12) · any fix (FIX-13) · detectors (ObservationAgent) · closing or moving tickets (orchestrator/V).

## 7. File surface (single-writer) and parallel safety
Allowed: `tools/obs-listener/src/trace/**` (new) · `tools/obs-listener/src/board/**` (new: template renderer + read-back writer) · `tools/obs-listener/escalations/README.md` · tests `tests/unit/fix11-*.test.ts`, `tests/integration/fix11-*.test.ts`.
Read-only: `obs.occurrence`, `obs.incident`, `obs.trace` surfaces · `tools/obs-listener/src/daemon/**` (FIX-09; the daemon calls the tracer through an interface FIX-09 declares — ARCH names it).
Forbidden: daemon internals · `obsctl` · `apps/replay` · any product source · `.hermes/**` · any board other than the F-2 board.
Parallel-safe with: FIX-01..08, FIX-09 (FIX-09 declares the hook; FIX-11 implements behind it — ARCH sequences the interface freeze), FIX-10, FIX-16.
