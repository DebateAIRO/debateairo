# Grok review packet — BUG-01 rev1 (dual diamond, DR-153)

You are the GROK lens of the dual diamond on ticket t_fcd509b0 (BUG-01).
Codex claims done; you verify with production-path causality. The Opus lens
runs in parallel; do not coordinate — independent verdicts.

Repo root: /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3
(git root is the PARENT: /Users/vladmihaimiron/Documents/DebateAIRO)

## Ground truth to read first
1. `docs/missions/2026-08-06-v3-programming/handoffs/BUG-01-codex-handoff.md`
2. `docs/missions/2026-08-06-v3-programming/reviews/bug01-architecture-plan.md`
3. `docs/missions/2026-08-06-v3-programming/reviews/bug01-plan-grok-verdict.md`
   — YOUR OWN authorization; its binding conditions 1–5 and findings 1–11
   are the contract this implementation must satisfy.
4. The BUG-01 delta is exactly `git diff 2c61198` (the P5 floor commit) run
   at the PARENT git root — everything uncommitted is this ticket.

## ISOLATION LAW (DR-163, ABSOLUTE)
The real tree is READ-ONLY to you (running suites there read-only is
allowed; NO file edits, NO git commands that mutate, NO stack process
control — PG 55432 / API 8790 / UI 3000 stay untouched). If you mutate
files to test assertions, first clone the PARENT git root:
`cp -Rc /Users/vladmihaimiron/Documents/DebateAIRO /private/tmp/bug01-grok-clone`
and mutate ONLY inside the clone; delete it when done.

## Verify against the binding conditions (each by evidence, not reading)
1. **Absent predicate ⇒ byte-identical one-shot** (condition 1): inspect
   the gateway diff; confirm the no-predicate path cannot retry; run T4 and
   check it actually fails when the fallback is allowed to trigger retries
   (mutation in clone).
2. **Typed loudness** (condition 2): exhaustion → PROVIDER_CONTENT_UNACCEPTED
   → same organ codes (JUDGE_SCHEMA_FAILURE / NODE_REVIEW_SCHEMA_FAILURE)
   with the LAST parse error. Trace the production path end to end
   (providers → judgement → runner → acceptance wrap).
3. **Bound is CallBound.maxAttempts only** (condition 3): no new literal
   anywhere in the diff; register seed unchanged.
4. **No schema widening / DDL / kernel vocab / new edges / stack control**
   (condition 4): audit the diff for violations; T7 must prove the incident
   shape (nested unrecognized key `notes_absent`) STILL rejects.
5. **Findings carried** (condition 5): five call sites (not six); composer/
   conformance/R9 now declare predicates (bonus finding B); ledger FAILED
   honesty (bonus finding A) with `battery/terminal.ts` counts stricter and
   tested (T13); claim_type tightened (T10).

## Production-path causality checks (your strength)
- The gateway loop: does a FAILED-ledgered attempt with raw_artifact_ref
  actually write BOTH rows on the REAL database path (integration T11/T12
  on embedded PG — run them)?
- Does anything downstream consume MODEL_CALL outcome='OK' in a way the
  OK→FAILED relabel breaks? (Your authorization pre-cleared
  findSuccessfulCommandArtifact as SERVE-only — now verify on the
  implemented code.)
- The repair packet: could any code path interpolate model content or a
  suggested value? (T6/T8 claims — try to falsify.)
- F1 class sweep: any BUG-01 test that cannot fail for its believed reason
  (source-text pins, import-satisfiable assertions, predicate-only checks)?

## Verdict
Write EXACTLY ONE file:
`docs/missions/2026-08-06-v3-programming/reviews/bug01-grok-rev1.md`
with file:line evidence, any blocking findings, advisories, and final line
"VERDICT: APPROVED" or "VERDICT: BLOCKING" with reasons. Post nothing to
the board; the orchestrator consumes the verdict file.
