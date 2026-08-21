# PROG-09 peer review — Opus reviewer A

REVIEWER CLAIM:
- agent: Claude Opus 5 (1M) — Opus reviewer A seat
- ticket: PROG-09 / 09-consumer-reader
- lane reviewed: `codex/eval-09-consumer`
- worktree read: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-09-consumer`
- rounds: round 1 on `4f0356a` (REWORK), round 2 on `9650a00` (PASS)
- board mutation: prohibited and not performed
- writes: only this file and
  `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-09-opus-review-{1,2}.md`
- other reviewers' files: not read

## Current verdict — round 2

**PASS.** All four round-1 blockers genuinely resolved; two resolved beyond what I
asked for. Review filed at
`DebateAI-V3/docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-09-opus-review-2.md`.

## Blocker resolution

| # | Round-1 blocker | Round-2 status |
|---|---|---|
| B1 | Shared blinding helper bypassed (Architecture §5.3, FR-3.3) | **RESOLVED** — helper extracted to `packages/evaluator/src/blind-sample.ts`, re-exported, and now the sole construction path for both add-on and consumer samples; gained a UTF-8-safe 4096-byte excerpt ceiling |
| B2 | Real blinded-sample path had zero coverage | **RESOLVED, exceeded** — fixture now drives the production `EvaluatorHarvestRepository.harvestTerminalRun` over real run/node/judgement rows, and the prompt is captured off the wire from a real `OpenAICompatibleProviderGateway` against a local HTTP server; 3-of-4 sample cap, opaque ids, 4096-byte truncation and non-empty `blinded_sample_refs` all asserted |
| B3 | Self-routing refusal untyped and unnamed (Architecture §2.3) | **RESOLVED** — `TypedDomainError("SELF_ROUTING_FORBIDDEN")` raised ahead of schema validation, propagated via `lastParseError`, stored as its own receipt reason, with split unit tests (injection vs malformed JSON) and an integration receipt-table assertion |
| B4 | Mandatory constraint 4: no above-pool-max regression | **RESOLVED, exceeded** — 24 concurrent refreshes (pool max 10) → 1 provider call, 23 typed in-flight skips, pool usable after; lane-06 precedent is 12 |

My two cheap non-blocking items were also folded in (family threaded into
`persistOutput` instead of SQL literals; `CONSUMER_AUTHORIZATION_FAILED` no longer
collapses into `CONSUMER_EXECUTION_FAILED`). Codex additionally found and fixed
three latent defects I had not caught: null-domain jobs were being dropped,
samples were not `as_of`-bounded, and batch state was over-optimistic on mixed
outcomes.

## Verification I ran myself (round 2)

```text
pnpm run typecheck                       PASS (tsc --noEmit, no output)
npx vitest run                           98 files / 711 tests PASS (was 706)
tests/integration/evaluator-consumer-database.test.ts    6 PASS
tests/unit/evaluator-consumer.test.ts                   10 PASS
tests/unit/evaluator-foundation.test.ts                  PASS (+excerpt ceiling)
tests/integration/evaluator-addon-database.test.ts       8 PASS (lane-06 differential
                                                         unaffected by the shared-helper change)
tests/integration/evaluator-database.test.ts (FR-0.6 AC5)  PASS
pnpm run lint     audit:architecture violations: []; audit:source blocking: []
git status --porcelain                   clean (no push, no board mutation)
scope / DR-179 / BOUND scans over the rework diff        no hits
```

Self-report numbers reproduce exactly. No dishonest reporting in either round.

## Constraint scorecard

| # | Constraint | Result |
|---|---|---|
| 1 | Null-run scope; lane-04/05/06 + FR-0.6 AC5 green | PASS |
| 2 | Own bounded retries; validate-before-strike; typed receipts everywhere | PASS |
| 3 | Isolation assert before every call; no gateway over lock-held pool | PASS (now also proven at runtime via the real gateway's `assertNoOpenWriteTransaction`) |
| 4 | try-lock + typed in-flight skip; above-pool-max regression | PASS |
| 5 | Adversarial output cannot corrupt consumer tables | PASS |

All tier-6A deliverables PASS.

## Carry-forward for Hermes / orchestrator (none blocking)

1. **Cross-lane behavior change worth an explicit decision:** the shared helper's
   new 4096-byte cap now also truncates **add-on** grading material (lane 06,
   already merged and Hermes-approved), silently and without a marker. All lane-06
   tests pass and the cap is a real safety improvement, but a grader may now judge
   a truncated claim without knowing it was cut. Recommend an explicit truncation
   marker.
2. Two sentinel assertions in the consumer integration test cannot currently fail
   (those columns are not in the samples `SELECT` list) — tripwires, not proof.
3. Self-routing key matcher is snake_case-only; `numericRank` falls through to
   zod-strict and is filed as `CONSUMER_CONTENT_REFUSED`. Safety intact, taxonomy
   under-counts.
4. Still no stale-claim recovery (declared intentional, README-documented) — carry
   as a mission-level operational risk.
5. On-demand refresh mints a new output version whenever new judgements land, since
   the snapshot hash covers the sample section. Correct, but a storage-growth
   property to know before ticket 11.
6. Per-refresh provider fan-out and `listJobs` scans remain uncapped.
7. Concurrency case uses the mock gateway, so `assertNoOpenWriteTransaction` is
   exercised only in the single-threaded real-gateway test.
8. Unchanged minors: undocumented `"bias."` metric-prefix heuristic; order-dependent
   shared-DB integration tests (repo style); relative-cost status absent from the
   §2.3 prompt input list, now documented in the README as deliberate.
