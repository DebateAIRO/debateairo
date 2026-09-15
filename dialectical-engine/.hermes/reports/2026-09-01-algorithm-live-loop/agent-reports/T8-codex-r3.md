CODEX REVIEW T8 r3 — CHANGES · comments read through: t08-r3-2026-09-01
# CODEX REVIEW T8 r3

## VERDICT

**CHANGES — 0 blocking findings, 2 non-blocking findings. V DECISIONS PACKET; no r4.**

All three r2 findings are closed in the work under review. The hardened operator-door test
uses a real `core.node`, only real `node_strength_record` columns, a named constraint, and
an accepted same-row control. M14 is a real single-property mutant: the hardened assertion
fails `1/8` because the prohibited insert resolves, while the old loose assertion stays
green `8/8` on the nonexistent `at_seq` column. The two fixture defects are accurately
root-caused in the schema and fixed in the seed. N2's false universal remains visible with
the narrower correction, and N3 now records D16, J11, and board F23. The r2-to-r3 commit
changes exactly one integration test; no product or migration file drifted.

The remaining findings concern final report evidence and routing, not product correctness.
Round 3 is the last lawful rework round, so both are ready as V decisions-packet rows rather
than grounds for a fourth worker round.

## FINDINGS

### N1 — NON-BLOCKING · the r3 stray-error audit reports false raw counts and attribution

- **WHAT:** the report says each r3 C4b log “contains 4 database errors,” all four from
  `graph-database.test.ts`, and that the standalone T8 upgrade log contributes zero. Those
  are not the contents of the filed logs.
- **WHERE:** worker report `t08-strict-and.md:152-158`;
  `logs/t08/r3-cluster-c4b-run{1,2,3}.log`;
  `logs/t08/green-t8-upgrade-hardened.log`.
- **WHY:** direct `ERROR:` enumeration returns sixteen lines in each C4b log. Four originate
  in `t8-upgrade-migration.test.ts`: the two legacy preflight refusals plus the two hardened
  door constraints. Twelve originate in `graph-database.test.ts`, not four. The standalone
  hardened T8 log contains its same four expected rejection errors, not zero. The technical
  conclusion can still be correct—those four T8 errors name exactly the rejectors asserted,
  and no malformed-schema error is present—but the filed paragraph conflates “unexpected
  after an unstated allowlist” with raw log contents. Router §2.6 requires verbatim evidence.
- **V-READY DISPOSITION:** correct the record to `16 total = 4 expected T8 + 12 expected
  graph-database`, or define and show the allowlist/filter that yields zero **unexpected**
  errors. No code rework is required.

### N2 — NON-BLOCKING · final residue accounting is internally inconsistent and incompletely routed

- **WHAT:** the V-ready section declares three open non-blocking items but enumerates four.
  Its table leaves F-T8-4 and F-T8-5 “open” without board/V mappings, and labels F-T8-7
  `NEW` although the live board now routes it as F24.
- **WHERE:** worker report `t08-strict-and.md:116-124,201-214`; board
  `F23-jsonb-receipt-enumeration.md` and `F24-argless-rejects-oracle.md`; r3 packet §2,
  whose N3 check names D16/J11/F23 but does not demand complete residue reconciliation.
- **WHY:** a mechanical count of the residue bullets is four: F-T8-4, F-T8-5, F-T8-6, and
  F-T8-7. Board search maps only F-T8-6→F23 and F-T8-7→F24; no route exists for F-T8-4 or
  F-T8-5. Heartbeat §2.2 requires every item called a finding to receive a ticket/fix, while
  §2.3 requires unresolved round-3 residue to go to V rather than r4. The packet's narrowed
  N3 checklist is therefore also a packet defect: it could not establish complete routing.
- **V-READY DISPOSITION:** record four, map F-T8-7 to F24, and either create V/board rows for
  F-T8-4/F-T8-5 or explicitly close/withdraw them with rationale if they are disclosures
  rather than actionable findings.

## R2 CONVERGENCE

- **N1 CLOSED:** `seedRootNode` explicitly supplies the later-defaultless fields
  `depth=0`, `sibling_ordinal=0`, and `materialized_path='0'`, satisfying the root trigger;
  the strength row uses that real node and no `at_seq`. The rejection names
  `node_strength_record_operator_used_check`, and the accumulate control succeeds. The
  served event names `served_number_event_reason_matches_status`; every status outside the
  two-member domain necessarily fails that pairing, while `convalidated=true` separately
  pins the status constraint. The report's scoping explanation is technically correct.
- **M14 CLOSED:** both logs contain the same mutated CHECK admitting
  `('accumulate', 'strict-and')`. Hardened: the strict-and insert succeeds and the expected
  rejection fails (`1 failed | 7 passed`). Old form: the insert still fails first on
  nonexistent `at_seq` and the suite stays green (`8 passed`). This is a valid
  discrimination pair even though the old assertion form is transplanted into the
  eight-test r3 file.
- **N2 CLOSED:** the original false “exactly” sentence remains in worker self-report `## r2`
  and is visibly marked corrected; `## r3` and the final report state the required
  existential proxy-incompleteness claim.
- **N3 CLOSED as scoped:** F-T8-2 is resolved/adopted by D16, F-T8-3 resolved by J11, and
  F-T8-6 maps to board F23. N2 above concerns the broader final residue ledger.

## PACKET REVIEW

The packet's base, HEAD, commit count, report marker/hash, board round, paths, and writable
deliverables all resolve. Its technical verification checklist is accurate. Its only defect
is the under-scoped residue check recorded in N2: by naming D16/J11/F23 rather than requiring
a complete open-finding-to-board map, it omitted current F24 and the unrouted F-T8-4/F-T8-5
rows.

## STATIC EVIDENCE

No test, build, typecheck, or live database command was run.

```text
$ git rev-parse HEAD
c309f80904eb6aca22275335df7a2895ce4bbf0c
$ git log --oneline 71afca1..HEAD
c309f80 T8: harden the post-upgrade door assertions (r3, codex r2 N1)
d2a521d T8: close the upgrade transition and strengthen the exports oracle (r2)
a438084 T8: remove strict-and, full surface (S5-2, goal 119-128)
$ git diff --name-status d2a521d..c309f80
M	dialectical-engine/tests/integration/t8-upgrade-migration.test.ts
$ git diff --stat d2a521d..c309f80
 .../tests/integration/t8-upgrade-migration.test.ts | 75 +++++++++++++++++++---
1 file changed, 66 insertions(+), 9 deletions(-)
```

`git diff --check d2a521d..c309f80` and `git status --short` both exited 0 with
no stdout. The report-hash command returned:

```text
c256385664678e764120389f8b5ad752b6e412072e5058bb5b663d9b7839ede9  -
```

The exact aggregate rows are:

- `red-t8-n1-hardened-vs-m14.log`

  ```text
   Test Files  1 failed (1)
        Tests  1 failed | 7 passed (8)
  ```

- `red-t8-n1-oldform-vs-m14.log` and `green-t8-upgrade-hardened.log`

  ```text
   Test Files  1 passed (1)
        Tests  8 passed (8)
  ```

- each `r3-cluster-c4b-run{1,2,3}.log`

  ```text
   Test Files  2 passed (2)
        Tests  22 passed (22)
  ```

The schema independently confirms `0002_s02.sql:12-14` drops the three root-node defaults
and `:56-58` enforces root depth/ordinal/path. The served reason constraint admits only
`PRESENT/NULL` or `EVICTED/MISSING-NUMBER`, so no invalid status can satisfy it; the worker's
constraint-scoping argument holds.

## PREDICTIONS

Another lens may approve from the correct M14 pair and overlook that the post-fix “stray
error” audit repeats the same aggregate-green mistake in prose; count raw `ERROR:` lines
before evaluating its allowlist conclusion. Another may dismiss the residue count as a typo;
check the live board mappings first, because two entries are routed and two are not. I expect
no independent lens to refute the r3 test implementation itself.
