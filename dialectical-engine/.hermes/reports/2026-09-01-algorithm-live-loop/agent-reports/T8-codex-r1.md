CODEX REVIEW T8 r1 — CHANGES · comments read through: t08-r1-2026-09-01
# CODEX REVIEW T8 r1

## VERDICT

**CHANGES — 2 blocking findings, 1 non-blocking finding.**

The live-code deletion is complete over the goal's enumerated surface: fresh scoped probes
found no strict-and vocabulary, rival receipt vocabulary, bare `rival` identifier in
propagation, or `product` in published-arithmetic/replay/orphan-audit. `agg`, `σ`, and the
clustering arithmetic are byte-untouched outside removal of the strict-only branch. The
WITHHELD slot's removal is a defensible consequence of deleting its only lawful reason and
its only live branch; no current or historical first-party serve writer emits that event.

Approval is blocked because the **forward persisted-state transition does not make that
interpretation true for an upgraded database**. The migration leaves formerly valid
WITHHELD rows unvalidated and leaves the free-form `operator_by_parent` receipt carrier
unchecked, while consumers now assume the narrowed types. A separate packet-mandated RED
evidence gap also violates the worker contract.

## FINDINGS

### B1 — BLOCKING · the WITHHELD/strict receipt state survives the migration and is misread

- **WHAT:** `0051` removes the live WITHHELD union arm but does not close the previously
  valid persisted state. Both replacement served-number constraints are added `NOT VALID`,
  and no `VALIDATE CONSTRAINT`, preflight, or data disposition follows. The migration also
  ignores `ledger.propagation_run.operator_by_parent`, the JSONB receipt that persists every
  operator resolution.
- **WHERE:** `migrations/0051_t8_remove_strict_and.sql:21-48`;
  `packages/serve/src/index.ts:1462-1524`;
  `packages/ledger/src/index.ts:333-350`;
  `packages/valuation/src/index.ts:442-505`.
- **WHY:** concrete old-valid input → wrong outcome:
  1. Before `0051`, a row with `status='WITHHELD'` and
     `reason='STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED'` satisfies the installed 0000/0006
     constraints.
  2. `0051` succeeds without checking that row because both narrowed constraints are
     `NOT VALID`.
  3. PostgreSQL returns the text value at runtime; the TypeScript annotation at :1470 does
     not validate it. `foldServedNumberEvents` returns `WITHHELD`, but :1513 checks only
     `EVICTED` and :1514-1523 projects every other value as `PRESENT`, exposing the stored
     number instead of rejecting/retiring it.
  4. Independently, an old strict-and resolution remains legal inside
     `propagation_run.operator_by_parent`. A strict-withheld parent has no corresponding
     `NodeStrengthRecord`, so the validated `operator_used` CHECK is not a complete proxy.
     `readFrozenPropagation` verifies only that the JSON is an array and casts it back into
     the removed runtime vocabulary.

  Source history supports the worker's narrower statement that first-party serve code never
  emitted WITHHELD; it does **not** prove the contents of every deployed database. The
  from-empty 14/14 integration run cannot exercise an upgrade row.
- **SUGGESTED FIX:** declare one upgrade disposition and prove it. If the intended policy is
  the worker's fail-loud policy, make `0051` preflight both legacy event rows and strict-and
  occurrences in `operator_by_parent`, then validate both replacement constraints. If data
  must instead be retired/quarantined, specify that transformation rather than silently
  reclassifying it. Add an upgrade-from-0050 database test that seeds (a) a formerly valid
  WITHHELD event and (b) a strict-withheld operator receipt, applies `0051`, and asserts the
  exact chosen outcome plus read behavior.

### B2 — BLOCKING · the worker packet's per-test RED contract has no filed evidence

- **WHAT:** the dispatch packet requires the grep invariant **and each migration/behavior
  test** to fail on the unmodified `71afca1` base, with failing runs in `logs/t08/`. The
  artifact set contains one RED log, `red-t8-invariant.log`, and it covers only the six-test
  architecture file. The changed contract, register, scoring, serve, and database assertions
  appear in green/mutant logs, not as base RED runs. The base cluster pin ran the old base
  tests and therefore cannot show the changed assertions discriminate.
- **WHERE:** worker packet `packets/t08-strict-and.md:49-51`; worker report `## RED`;
  `logs/t08/red-t8-invariant.log` and the absence of any other `*red*` artifact.
- **WHY:** packet input = every changed migration/behavior test must have base failure
  evidence → filed outcome = only P1-P5 RED. Post-fix mutants establish useful
  discrimination, but they are not evidence that the required tests were RED before GREEN.
  Router §2.5 makes this process finding blocking.
- **SUGGESTED FIX:** r2 must begin with a genuine RED for B1's upgrade fixture before its
  fix. Separately disclose the r1 chronology gap. A controlled run of the final r1 test
  content against `71afca1` can supply retrospective discrimination, but must be labelled
  honestly and cannot be represented as the original RED-first event.

### N1 — NON-BLOCKING · P4's “exact exports” oracle ignores non-function exports

- **WHAT:** P4 derives the export set only with `/export function .../`. A module containing
  `agg` and `σ` as functions plus `export const product = ...` passes P4 while still exporting
  the repealed symbol.
- **WHERE:** `tests/architecture/t8-strict-and-removed.test.ts:115-118`.
- **WHY:** the independent synthetic source probe returned
  `P4_regex_exports=["agg","σ"]`, `P4_would_pass=true`, and
  `candidate_contains_product=true`. The current deletion is still protected by
  `tests/unit/replay.test.ts`, which asserts `Object.keys(arithmetic)` exactly, so this is
  non-blocking rather than a current product residue. The worker's M4 proves only the
  `export function` syntax class and overstates P4's standalone strength.
- **SUGGESTED FIX:** make P4 inspect actual module keys or parse every export form, and add a
  `const`/aliased-re-export mutant so the assertion's title and discrimination match.

## PACKET REVIEW

The codex review packet is internally consistent: its board path resolves to
`waiting_review`, both mandatory deliverables are inside its two-file writable list, base
`71afca1a728f26713a8137ffcd463f1cf45228b7` resolves, and the cited goal lines contain the
T8 block verbatim. J11 and D16 are present at the DECISIONS tail.

The worker packet is also clear enough to execute; B2 is worker non-compliance, not packet
ambiguity. Its runner anchor is accurate, not defective: base lines 2025-2039 map strengths
into the ledger input, and line 2031's `...strength` spread is exactly how the rival fields
were persisted without a named token. The worker's F-T8-1 “anchor imprecision” should not be
promoted as a packet finding.

## EVIDENCE CHECKED

STATIC only, as ordered. I ran no tests or builds.

Repository identity and report integrity:

```text
$ git rev-parse HEAD
a438084fe7fb9c3bdcffd35518aa781821c3bbc8
$ git rev-parse 71afca1
71afca1a728f26713a8137ffcd463f1cf45228b7
$ git merge-base 71afca1 HEAD
71afca1a728f26713a8137ffcd463f1cf45228b7
$ git branch --show-current
lane/t8
$ tail -n +3 agent-reports/t08-strict-and.md | shasum -a 256
93eb4bf08b7ecd022c19d7089d0b30d83e73f3aa850ed127400d5a6d2a6b5b20  -
$ git diff --check 71afca1..HEAD
```

Fresh deletion probes over shipped source:

```text
shipped_strict_rival_exit=1
propagation_rival_exit=1
arithmetic_product_exit=1
```

The commands were `rg -n -i --glob '*.{ts,tsx,js,jsx,mjs,cjs}'` over
`packages apps web tools acceptance`, with the three scoped patterns
`strict[-_]and|rival[-_]?(operator|strength)`, `\brival\b` in propagation, and
`\bproduct\b` in published-arithmetic/replay/orphan-audit. Exit 1 means no matches.

Migration/receipt carrier probe:

```text
dialectical-engine/migrations/0051_t8_remove_strict_and.sql:40:  ) NOT VALID;
dialectical-engine/migrations/0051_t8_remove_strict_and.sql:48:  CHECK (status IN ('PRESENT', 'EVICTED')) NOT VALID;
dialectical-engine/packages/ledger/src/index.ts:334:          arrow_order, cluster_records, operator_by_parent, transmission_reductions,
dialectical-engine/packages/valuation/src/index.ts:446:      operator_by_parent: unknown;
dialectical-engine/packages/valuation/src/index.ts:449:      SELECT run_id, arrow_order, operator_by_parent, cluster_records
dialectical-engine/packages/valuation/src/index.ts:456:    if (!Array.isArray(row.arrow_order) || !Array.isArray(row.operator_by_parent) || !Array.isArray(row.cluster_records)) {
dialectical-engine/packages/valuation/src/index.ts:503:      operatorResolutions: Object.freeze(row.operator_by_parent),
dialectical-engine/migrations/0007_s05_rework.sql:39:  ) NOT VALID;
dialectical-engine/migrations/0007_s05_rework.sql:41:ALTER TABLE serve.answer VALIDATE CONSTRAINT answer_serve_state_check;
```

Static discriminators:

```text
legacy_status=WITHHELD
current_branch_projection={"status":"PRESENT","number":"<stored number>"}
P4_regex_exports=["agg","σ"]
P4_would_pass=true
candidate_contains_product=true
```

The WITHHELD projection output applies the exact :1513-1523 two-branch decision to the old
valid discriminant; the P4 output applies the shipped regex to a source containing function
exports `agg`/`σ` plus a const export `product`.

Worker evidence reconciled:

```text
Test Files  1 failed (1)
     Tests  5 failed | 1 passed (6)

apps/ui/app/layout.tsx(3,8): error TS2882: Cannot find module or type declarations for side-effect import of './globals.css'.
apps/ui/app/layout.tsx(3,8): error TS2882: Cannot find module or type declarations for side-effect import of './globals.css'.
web/app/layout.tsx(3,8): error TS2882: Cannot find module or type declarations for side-effect import of './globals.css'.
web/app/layout.tsx(3,8): error TS2882: Cannot find module or type declarations for side-effect import of './globals.css'.

Test Files  1 passed (1)
     Tests  14 passed (14)
```

The four D16 rows match base/after logs exactly. The DB run is a from-empty migration run;
its only new T8 assertion checks that the two rival columns are absent. J11 is exact: the
web diff removes only the compiler-forced final ternary arm, and apps/ui removes the same
WITHHELD rendering branch. `git diff -U0` shows no `agg`, `σ`, or cluster-arithmetic edit.

I did **not** verify the D15 full suite, any runtime/live database contents, or build/typecheck
execution; those are outside this STATIC packet. I did not read the forbidden spine.

## PREDICTIONS

I expect another lens may accept “no writer ever” as proof that no old row exists and miss
the `NOT VALID` + read-fallback combination. I also expect a lens reading the older design
record may reject deletion of the WITHHELD member itself; I would check the newer goal first,
because the live union removal is coherent and the actual defect is upgrade-state closure.
Finally, a lens may repeat F-T8-1 because the runner range has no `rival` token; the first
thing I would check is the `...strength` spread at base line 2031, which falsifies that packet
finding.
