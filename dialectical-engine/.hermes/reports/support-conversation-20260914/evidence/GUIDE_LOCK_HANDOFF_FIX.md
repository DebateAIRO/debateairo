# GUIDE_LOCK_HANDOFF_FIX evidence

- Ticket: `t_532dbedf`; base `78988fc2e5e24595bd9cd6ec0a3965c6039dc718`; final `152eed4da1cd3e66b74d8301159ba76427552409`.
- Verdict: `IMPLEMENTED_REVIEW_REQUIRED`; no checkpoint/readiness/acceptance claim.
- Exact product scope: four files in `GUIDE_LOCK_HANDOFF_FIX-product-manifest.json`; clean commit.
- RED: direct `createCaseOnce` opened from physical `OPEN` plus immutable `LOCK`. The corrected route fixture then showed threshold 3→4 reopening: GET `OPEN`, rating/manual/message statuses `200/201/200`, rating +1 and case rows +2. The first combined RED also preserved a test-only configuration-name `ReferenceError`; it was corrected before producer edits.
- Finite lock-consumer sweep: `read` now consumes recorded `LOCK`; `admitMessage` consumes recorded `LOCK` independently of current threshold; `rateMessage` refuses both non-OPEN and recorded-lock sessions; `createCaseOnce` and `createCase` refuse recorded locks; rating and manual-escalation HTTP routes return the existing typed 429 before side effects. Status/IP cooldown already consumed immutable `LOCK` and were not changed.
- GREEN: focused 2/2; affected route/case/metrics/principal/architecture controls 225/225; exact final34 1,701 passed + 1 TODO.
- Typecheck: rc1 with 76 inherited diagnostics and byte-identical SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`; introduced diagnostics 0.
- Strict snapshot: 44 entries, KB `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`, immutable exact-version lookup PASS. The initial retained-eval justification was rejected because the evaluator imports both changed producer layers. The required fresh controlled structural evaluation then passed 60/60 in all three runs; rc1 remains solely the independent quality rubric `PENDING`.
- Limits: no runtime, preview, Support, model, status, capacity, lifecycle, private-record, or private-log access. Forgot-password destination remains unresolved/actionless; CP2 remains gated.

## Provenance correction

The pre-eval receipt/report claims are preserved under `GUIDE_LOCK_HANDOFF_FIX-*-before-eval-provenance.*`; they are superseded by this canonical seal rather than silently overwritten.
