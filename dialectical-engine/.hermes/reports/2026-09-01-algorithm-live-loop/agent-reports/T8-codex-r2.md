CODEX REVIEW T8 r2 — CHANGES · comments read through: t08-r2-2026-09-01
# CODEX REVIEW T8 r2

## VERDICT

**CHANGES — 0 blocking findings, 3 non-blocking findings.**

The r2 implementation closes r1 B1: `0051` now refuses both formerly valid legacy
populations before mutation, gives disposition guidance, reclassifies no append-only data,
and validates all three narrowed constraints. The direct `operator_by_parent` JSONB scan
does catch the receipt-only population that has no `node_strength_record`. The r2 record
also closes B2 honestly and closes N1 with a runtime export-key oracle plus independent
source-form coverage. F-T8-1 is explicitly withdrawn, and the r1-to-r2 delta has no scope
creep.

Approval is nevertheless not lawful yet: one new green assertion passes on an unrelated
schema error, one challenged report inference is false as stated, and two findings remain
marked open after their recorded decisions. **Round 3 is the last rework round; any residue
after r3 must be packaged V-ready rather than opening r4.**

## FINDINGS

### N1 — NON-BLOCKING · the post-upgrade operator rejection assertion is a false positive

- **WHAT:** the test titled “both repealed shapes are REJECTED at the door” does not prove
  the `operator_used` CHECK rejects `strict-and`. Its second arm accepts any thrown error,
  and PostgreSQL actually throws because the insert names nonexistent column `at_seq`.
- **WHERE:** `tests/integration/t8-upgrade-migration.test.ts:258-275`;
  `migrations/0000_s00.sql:201-210`; `logs/t08/green-t8-upgrade.log:691-696`.
- **WHY:** the green log says `column "at_seq" of relation "node_strength_record" does not
  exist`, then reports the test passed. The same error recurs in every r2 C4b run. Removing
  that column alone is insufficient: `gen_random_uuid()` supplies a practically nonexistent
  `core.node` reference, so the foreign key can fail before the operator CHECK. This also
  falsifies the report's claim that all three RED passes were “fixture-validity arms”: only
  two are; the third is this already-green false positive. The migration is still supported
  by its exact SQL and the independent `convalidated=true` assertion, so this is
  non-blocking product-wise, but the named oracle and evidence narrative are not true.
- **SUGGESTED FIX:** seed a real `core.node`, insert only actual table columns, and require
  the rejection to name `node_strength_record_operator_used_check` (or the precise CHECK
  violation). Prefer separate tests for the served-event and strength-record doors, then
  correct the RED-pass characterization.

### N2 — NON-BLOCKING · “strict-and rows are exactly rows with no strength record” is false

- **WHAT:** the report generalizes a true property of the strict-withholding branch into a
  false equivalence for every repealed-operator receipt.
- **WHERE:** worker report `t08-strict-and.md:23-31`; base
  `tests/unit/scoring.test.ts:235-253` at `71afca1`.
- **WHY:** the base `FX-HR-H4` case evaluates an all-judged parent under strict-and and
  expects a returned root strength with `operatorUsed: "strict-and"`, `operatorLevel:
  "parent"`, and its rival reading. Such returned strengths flow to persisted
  `node_strength_record` rows. The correct claim is narrower: a **strict-withheld** parent
  can leave the frozen receipt with no strength row, so `operator_used` cannot be a complete
  proxy. The migration does not inherit the error: its direct JSONB query scans every
  `operator_by_parent` array and catches non-`accumulate` values with or without a strength
  row.
- **SUGGESTED FIX:** replace “exactly” with the existential strict-withheld formulation and
  describe the fixture as proving the proxy's incompleteness, not a global row equivalence.

### N3 — NON-BLOCKING · the r2 findings table is stale against D16 and J11

- **WHAT:** F-T8-2 is still labeled open/blocking and F-T8-3 open/non-blocking even though
  the shared decisions record already disposes of both.
- **WHERE:** worker report `t08-strict-and.md:219-225`; `DECISIONS.md:381-396`.
- **WHY:** D16 extends D14 to the type producers identified by F-T8-2, and J11 expressly
  rules J5 symmetric for vocabulary growth and shrinkage, resolving F-T8-3's question. “V
  may veto” preserves validator authority; it does not make the current mission decision
  absent.
- **SUGGESTED FIX:** mark F-T8-2 resolved/adopted by D16 and F-T8-3 resolved by J11, with
  the existing V-veto caveat if desired.

## R1 CONVERGENCE

- **B1 CLOSED:** the upgrade fixture applies through `0050`, proves both legacy shapes are
  old-valid, and the filed RED records the two missing refusals plus non-destructive and
  validation failures (`4 failed | 3 passed`). The green refusal logs carry
  `T8_LEGACY_WITHHELD_EVENT` and `T8_LEGACY_OPERATOR_RECEIPT`, each with a disposition
  `HINT`. `0051` contains no `UPDATE` or `DELETE`, and all three narrowed constraints are
  explicitly validated. N1 above affects only the separate future-write assertion.
- **B2 CLOSED:** the r2 report calls the six-file base comparison retrospective, explicitly
  disclaims it as original RED-first evidence, reports `10 failed | 49 passed`, and
  accurately identifies `serve-s05.test.ts` and `register.test.ts` as zero-discrimination
  changes of different kinds.
- **N1 CLOSED:** P4 asserts the dynamic module's keys exactly and separately extracts
  declarations plus named/aliased re-exports. M10 (`export const`) and M11 (aliased
  re-export) each kill P4 alone.
- **F-T8-1 CLOSED:** withdrawn on the record; the base runner's `...strength` spread is
  acknowledged as the rival-field persistence site.

## STATIC EVIDENCE

No test, build, typecheck, or live database command was run.

```text
$ git rev-parse HEAD
d2a521dc7d25b0722aeda9a5884d05f82cb08227
$ git diff --name-status a438084fe7..HEAD
M  dialectical-engine/migrations/0051_t8_remove_strict_and.sql
M  dialectical-engine/tests/architecture/t8-strict-and-removed.test.ts
A  dialectical-engine/tests/integration/t8-upgrade-migration.test.ts
$ git diff --check a438084fe7..HEAD
[no output]
$ git status --short
[no output]
$ tail -n +3 agent-reports/t08-strict-and.md | shasum -a 256
25077085cbb5232c497784a5a1ed943132f83c41b7b0998ddebb972cc7f4217e  -
```

Migration-content checks found both `T8_LEGACY_*` exceptions, both `USING HINT` clauses,
`jsonb_array_elements(operator_by_parent)` with `operator IS DISTINCT FROM 'accumulate'`,
three `VALIDATE CONSTRAINT` statements, and no data-changing `UPDATE`/`DELETE`. Filed logs
reconcile to `4 failed | 3 passed` before the fix, `7 passed` after it, M10/M11 each
`1 failed | 5 passed`, M12/M13 each `1 failed | 6 passed`, and three C4b runs of
`21 passed`; the latter four green DB logs also preserve the N1 wrong-column error.

The r1-to-r2 diff is exactly the three packet-relevant files above (+388/-12): migration
closure, upgrade evidence, and P4 strengthening. No shipped source or unrelated test moved.

## PREDICTIONS

Another lens may report APPROVE from the aggregate 7/7 and miss the database error printed
inside the passing test; inspect the exact rejected statement first. Another may accept the
worker's “exactly” because the receipt-only fixture proves one no-strength example; check
the complementary all-judged strict-and case at the base pin. A final lens may carry
F-T8-2/F-T8-3 as current blockers by reading only the worker table; reconcile D16/J11 before
doing so.
