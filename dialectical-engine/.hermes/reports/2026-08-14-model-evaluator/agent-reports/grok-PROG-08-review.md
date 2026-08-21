# Grok PROG-08 peer-review self-report

## Round 1
- **Role:** read-only peer reviewer for Codex lane `codex/eval-08-metering` (model-evaluator PROGRAMMING row 1B).
- **Branch/commit:** `codex/eval-08-metering` @ `ae14b46` (`feat(evaluator): capture and normalize observed usage`).
- **Worktree:** `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-08-metering/DebateAI-V3`.
- **Diff:** `git diff dev...codex/eval-08-metering` — 13 files, +309/−13 (acceptance relays/shim/relay-core; providers; evaluator; focused tests). No registry/domain/migration/skeleton mass edits.
- **Binding docs (main checkout):** Architecture §§3.6, 5, 7 row 1B, 8; Requirements §6 FR-6.1–6.2 + FR-0.x; findings `01-relay-token-cost-exposure-findings.md`.
- **Method:** full patch read; axis checks with file/line citations; hygiene for BOUND / estimate helpers / API-key material; re-run focused vitest.
- **Findings summary:**
  - Single choke-point: `CliCompletion.usage` + shared HTTP emission in `relay-core`; Claude/Grok fill observed envelope fields; Codex `usage: null` without inventing session-file meters.
  - Additive only: request/choices/content/model paths unchanged; existing relay suites green (18/18 re-run).
  - Provider: optional standard usage parse; exact block or null in `metadata_json`; no estimate path.
  - Evaluator: `EvaluatorMeteringRepository.recordCall` enforces METERED/UNMETERED; `deriveRelativeCostCellsV1` implements `relative-external-spend/v1`; paid-vs-local cross-unit unit test is genuine (drives shipped function; local 50k tokens → relativeCost 0, paid Grok positive).
  - Hygiene: no BOUND, no API keys, no estimate helpers.
  - Tests re-run: provider+foundation 17/17; evaluator-database integration 5/5 (real embedded Postgres projection).
- **Output:** `programming/reviews/PROG-08-grok-review-1.md`. No product-code edits, no commits from this seat.
- **Verdict:** **REVIEW VERDICT: PASS**
- **Token basis:** Grok peer-review session PROG-08 R1; model seat Grok 4.6; no Codex coding tokens on this seat.

REVIEW VERDICT: PASS
