# /goal packet — BUG-01 (Codex seat, PROG-V3-R1) — authorized by DR-171 chain

**Board:** `debateai-v3` · **Assignee:** codex · **Roster (DR-153):** Codex
implements · dual diamond (Opus 5 + Grok).
**Lane (DR-168):** prev = PROV-01 (t_779f40b3, done) · next = none (last).

Standing law: `CODING-LOOP-PROTOCOL.md` (incl. the v2 amendments) + ledger
through DR-171. This ticket's scope was produced by the DR-171 architecture
consult and is BOUND by two documents you MUST read in full before coding:

1. `reviews/bug01-architecture-plan.md` — the Opus architect's plan.
2. `reviews/bug01-plan-grok-verdict.md` — Grok's authorization, WHOSE
   BINDING CONDITIONS 1–5 AND FINDINGS LIST 1–11 ARE THE CONTRACT.

## The defect (ledger-proven, run 50802f65, 2026-08-13)

One schema-failed judge reply (unrecognized key `notes_absent` in
`evidence`, HTTP 200, attempt 1) terminal-failed the whole run and tore the
stack down, while the DR-159 retry-tolerant envelope sat nearly unconsumed.
Content rejection retries are DESIGNED (03-module-design.md §7.1:896-899:
"Every attempt, including schema-failure retries, is a ledger row") but
unimplemented. This is conformance repair, not architecture amendment.

## DELIVERS (the authorized seam ONLY)

1. In `packages/providers/src/index.ts` (the gateway attempt loop): when a
   caller-declared `classifyContent` returns `PARSE_FAILED`/`SCHEMA_FAILED`,
   ledger that attempt `outcome: "FAILED"` (with its `raw_artifact_ref`) and
   `continue` within the existing `CallBound.maxAttempts` (register-sourced,
   3 — NO new literal). Per-attempt `input_hash`. Optional caller-supplied
   `buildRepairPacket`: interpolates ONLY the machine `parseError`, never a
   suggested value; no builder ⇒ identical re-send; `contract_hash`
   IDENTICAL across attempts.
2. **Absent predicate ⇒ byte-identical one-shot behaviour** (Grok binding
   condition 1; plan T4 — the single most important guard).
3. Typed exhaustion carrier (`PROVIDER_CONTENT_UNACCEPTED`, structured,
   carrying the LAST parse error); `Judge.judge`/`Judge.review` translate to
   the SAME organ codes (`JUDGE_SCHEMA_FAILURE`/`NODE_REVIEW_SCHEMA_FAILURE`)
   with that last error. Terminal strings unchanged (DR-115 loud).
4. Declare `classifyContent` predicates at composer / conformance /
   post-compose-R9 (`apps/runner/src/index.ts:1135/:1191/:1210`) so their
   artifacts record honest `SCHEMA_FAILED` (bonus finding B) — FIVE
   production call sites total (Grok corrected the plan's "six").
5. `claim_type` tightened to `z.enum(CLAIM_TYPES).optional()` (plan §3.4).
6. Downstream of OK→FAILED: `battery/terminal.ts` executed-check counts get
   stricter — add the test proving it; do NOT count `FAILED` as executed.

## FORBIDDEN (Grok binding conditions 4 + findings 9)

No schema widening (VROW-2 is V's), no strip of unknown keys, no repair
sub-bound literal (VROW-3), no DDL/kernel-vocabulary change, no new
dependency edge, no fix of DR-159 A-2 env bounds here, no special-casing the
incident call site, NO touching the standing stack (PG 55432 / API 8790 /
UI 3000 — it stays up; the orchestrator handles any restart).

## DONE WHEN

Tests T1–T15 per the plan under the ENFORCED suite; mutation ledger in the
handoff (P1: each load-bearing assertion names the mutation it kills);
`vitest list` collection proof (P2); every gate green with REAL pasted
output EACH (typecheck, architecture suite, integration on embedded PG,
full vitest, lint, generate:contract zero-drift if contract touched);
handoff `handoffs/BUG-01-codex-handoff.md`; progress log
`handoffs/BUG-01-progress.log`; status `review` + comment
`READY FOR PEER REVIEW — BUG-01`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.
