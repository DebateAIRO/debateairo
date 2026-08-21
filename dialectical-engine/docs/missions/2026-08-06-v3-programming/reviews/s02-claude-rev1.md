# S02 · CLAUDE REVIEW (rev 1) — APPROVED

Reviewer: Claude lane (Opus 5 subagent), 2026-08-08. Independent verification
in-sandbox: typecheck PASS · lint PASS (27 rows clean, source audit empty) ·
build PASS (7/7) · `pnpm test:s00` 18 files / 82 tests PASS vs real embedded
PostgreSQL · integration rerun verbose with server-side error text captured.

## Verified

- **Round-1 DDL gap genuinely closed, proven from the server log**: `new row
  for relation "edge" violates check constraint "edge_check4"` on the exact
  `{...base, strength: null}` row (migrations/0002_s02.sql:115-116),
  boolean-total. Sibling audit: every FX-DB-08 and FX-DB-06 limb rejects at
  the DATABASE (edge_check / _check1 / _check2 / _check5 / _check6, three FK
  violations, not-null + node_claim_text_check for FX-DB-03a).
- **Cycle law is transactional truth**: withGraphWrite → BEGIN →
  `pg_advisory_xact_lock(hashtextextended(runId,0))` first statement → same
  client runs duplicate SELECT + recursive-CTE reachability + INSERT before
  COMMIT. Xact-scoped lock, no isolation override in repo; a blocked second
  writer re-snapshots after grant and sees the committed edge. Layers 1 and 3
  exist and are tested (CIRCULAR_DEPENDENCY_FOUND + shared-crux redirect;
  GRAPH_CYCLE_DETECTED before the S03 arithmetic boundary).
- **ADR-0005 clause-by-clause**; ruled arrow order verbatim (`target_kind,
  polarity, kind NULLS FIRST, source.materialized_path,
  source.sibling_ordinal, created_at_seq`), recorded on
  propagation_run.arrow_order, no opaque-id sort.
- **S01 carry-forwards**: finding 5 FIXED and proven (applied-migrations
  ledger; 0000/0001 idempotent); finding 10 FIXED (six Drizzle ledgerEntry
  columns vs 0000 DDL); finding 3 partially, correctly.

## Verdict

CLAUDE REVIEW: APPROVED — SOLID / DDD / TDD / Patterns / DR-115 all
greenlight (see per-line rationale in the review transcript; DR-115: evaluate
refuses multi-node scoring with PROPAGATION_SCORING_NOT_IMPLEMENTED rather
than inventing strengths).

## Findings — none blocking

1. **S03 ENTRY CONDITION** graph/src/index.ts:301-314 — snapshot node filter
   (INNER JOIN LATERAL on reduced_judgement) vs arrow filter (generation
   status only) disagree: a judgement-less live node (DR-075/076 pending
   placeholder) would vanish from nodes while its arrow survives — the
   02 §5.5(5) forbidden state. Latent today; observable (snapshots with 2
   arrows / 0 nodes pass FX-PT-ORD and DR-071). LEFT JOIN semantics needed
   at S03.
2. **S03 ENTRY CONDITION** graph/src/index.ts:301,315 — materialiseSnapshot's
   two pool.query calls have no enclosing transaction → nodes and arrows from
   different MVCC snapshots. Wrap in one read transaction before concurrent
   writers exist.
3. s02-contract.test.ts:20 — dead `continue` neutralizes a required-string in
   the test's own list (covered elsewhere; drop the entry).
4. orphan-audit — no honesty rows for graph.constructEdge / GraphWriter.addEdge
   (production exports whose only S02 callers are tests).
5. FX-C52-10 layer-2 un-raceability correct by construction but not
   observable by any fixture (two interleaved withGraphWrite calls would
   prove it).
6. 0001_s01.sql ADD COLUMN … NOT NULL without default fails on a non-empty
   pre-ledger table — the "baseline a pre-ledger DB" claim holds only for
   empty tables (pre-existing S01 shape).
7. kernel vocabularies vs DDL CHECK lists are hand-duplicated with no parity
   test — drift possible.
8. No raw-SQL limb asserts out-of-vocabulary kind/target_kind rejection (the
   CHECKs exist; only placement limbs exercised).
