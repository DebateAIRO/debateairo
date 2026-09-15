REWORK READY FOR REVIEW — T4 r3 · comments read through: t04-codex-r2-2026-09-01
report sha256: 47dd134848b5d6d4b8db62ed6126fd4a96b24636b5ce196eb2712b48dabdbd2f — of this file from line 4 onward (the report body below this block); reproduce with `tail -n +4 t04-wok.md | shasum -a 256`

# T4 WOK r3

Seat: Opus 5, session `opus-t04-w1`. Rework round **2 of max 3 — the last lawful round**;
rework returns to this session. Worktree
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t4/dialectical-engine`,
branch `lane/t4`, base `1c9578a24d5aedd0302fbda5593f66277cd87b98`. Never pushed, never
merged, no board file written.

Answers codex review r2 (`agent-reports/T4-codex-r2.md`, verdict CHANGES: B1, B2 blocking,
N1 non-blocking; **r1's B1 and B2 confirmed CLOSED**). **No product-code change this
round — evidence and report only.** `HEAD` is unchanged at `7d179c6`.

| codex r2 finding | disposition |
|---|---|
| B1 — both D14 surface-local typecheck gates absent | **FIXED** — four runs, `## SUITES` rows 4–7 |
| B2 — full-suite attribution incomplete; unhandled error unmentioned | **FIXED** — every one of the 26 failures **and** the 1 error classified below, each against a paired base run or a named flake ticket |
| N1 — diff surface understated as eleven files | **FIXED** — regenerated from `git diff --name-only 1c9578a..HEAD`; it is **twelve** |

Earlier rounds, for the record: r1's B1/B2 were closed in r2 (codex r2 §R1 CONVERGENCE
CHECK); B3 is closed by this round's classification; r1's B4 and N1 were packet defects
settled above this seat by **J5** and **D12**.

**Diff surface — TWELVE files.** Regenerated from the packet-prescribed command,
`git diff --numstat 1c9578a..HEAD` (r2's table was pasted from `git diff --stat` of the
uncommitted working tree and so omitted `tests/unit/judgement.test.ts`, which r1 had already
committed — codex N1, and it was mine):

```
34	2	dialectical-engine/apps/runner/src/index.ts
1	0	dialectical-engine/apps/ui/lib/v3/labels.ts
86	4	dialectical-engine/packages/judgement/src/index.ts
6	0	dialectical-engine/packages/kernel/src/index.ts
1	1	dialectical-engine/packages/serve/src/index.ts
59	0	dialectical-engine/tests/integration/database.test.ts
1	1	dialectical-engine/tests/unit/dr174-resilience.test.ts
2	1	dialectical-engine/tests/unit/judgement.test.ts
1	1	dialectical-engine/tests/unit/obs-l2-s02-registry.test.ts
1	1	dialectical-engine/tests/unit/s14-ui.test.ts
213	0	dialectical-engine/tests/unit/t4-way-of-knowing.test.ts
1	0	dialectical-engine/web/lib/v3Presentation.ts
```

**Scope, checked line by line against J5.** `packages/serve/src/index.ts` and
`web/lib/v3Presentation.ts` are **one line each** and both are compiler-forced: the
`ConditionMarkRecord["mark"]` union is closed, and both label switches are exhaustive over
`ConditionMark` with **no `default:` clause**, so a missing case is a `TS2366`. Nothing else
in `web/` or `apps/ui/` is touched. **F5 guard intact**: `packages/serve/src/index.ts:562`
`RAN: loadBearing.filter((node) => node.wayOfKnowing === "RAN").length` is unchanged and
still on line 562. `packages/contract/src/index.ts` needed **no** edit —
`ConditionMarkSchema = z.enum(CONDITION_MARKS)` and `condition_mark_records[].mark`
(`:505`) both derive from the kernel vocabulary. `pnpm run generate:contract` was re-run
(exit 0); `packages/contract/generated/client.ts` is a 3-line re-export that embeds no
vocabulary, so its bytes are unchanged.

---

## RED

Two RED frames this round: r1's (retained, still the schema-removal evidence) and r2's new
production-seam frame. Both were captured on a tree that did **not** contain the fix.

### r2 RED — the mark is not visible on the node (codex B1/B2)

Position pin, first two lines of the log: `73fb096121578341fe32504ee0565639ecc9dab6` and a
`git status --porcelain` showing the only change was the new test in
`tests/integration/database.test.ts`.

**Command:**

```
./node_modules/.bin/vitest run tests/integration/database.test.ts -t "S2-3 T4 projects WAY-OF-KNOWING-DOWNGRADED"
```

**Verdict: `Tests  1 failed | 60 skipped (61)` · `Test Files  1 failed (1)` · `RED_R2_EXIT=1`.**
Log: `logs/t04/red-r2-seam.log`.

Failure line, verbatim, with its `❯` marker:

```
 FAIL  tests/integration/database.test.ts > apps/runner — legal command lifecycle > S2-3 T4 projects WAY-OF-KNOWING-DOWNGRADED on the real node when a judge claims a lookup it cannot pin
AssertionError: expected [ 'UNSERVED-MAKER-POSITION', …(1) ] to include 'WAY-OF-KNOWING-DOWNGRADED'
 ❯ tests/integration/database.test.ts:2591:43
```

Line 2591 is `expect(producedNode?.condition_marks).toContain("WAY-OF-KNOWING-DOWNGRADED")`.
The assertions **above** it all passed on the unfixed tree — the node was found in the
served answer by its claim text, its `way_of_knowing` was already `REASONING` and its
`locator` already `null`. So the RED isolates exactly the missing property: r1 normalized
correctly and disclosed nothing anyone could see.

**Disclosed: this test failed once for the wrong reason first.** The first attempt asserted
`scenario.snapshot.nodes.find((node) => node.statementText === …)` and died on
`expected undefined to be defined` — `MaterialisedGraphSnapshot.nodes` has no
`statementText` field. I had inferred the field name from `graph`'s other node type instead
of measuring it. Both logs are kept; the corrected frame is the one above.

### r1 RED — the schema rejects RAN (retained, unchanged)

Command `./node_modules/.bin/vitest run tests/unit/t4-way-of-knowing.test.ts` on
`1c9578a`: **`Tests  8 failed | 1 passed (9)` · `RED_EXIT=1`** — `logs/t04/red-t4-r2.log`
(the earlier `red-t4.log` is retained as the record of a vacuous assertion caught and
fixed: `Object.isFrozen(undefined)` is `true`).

| `❯` marker | AssertionError (verbatim) |
|---|---|
| `t4-way-of-knowing.test.ts:80:60` | `promise resolved "{ …(11) }" instead of rejecting` |
| `t4-way-of-knowing.test.ts:91:74` | `expected 'PARSED' to be 'SCHEMA_FAILED' // Object.is equality` |
| `t4-way-of-knowing.test.ts:99:35` | `expected 'Return only one JSON object with exac…' to contain '"way_of_knowing": "LOOKED_UP" \| "REAS…'` |
| `t4-way-of-knowing.test.ts:106:45` | `expected undefined to deeply equal [ 'LOOKED_UP', 'REASONING' ]` |
| `t4-way-of-knowing.test.ts:119:42` | `expected undefined to deeply equal { …(6) }` |
| `t4-way-of-knowing.test.ts:139:42` | `expected undefined to be null` |
| `t4-way-of-knowing.test.ts:148:42` | `expected undefined to be null` |
| `t4-way-of-knowing.test.ts:160:49` | `expected 'undefined' to be 'object' // Object.is equality` |

The single pass is the Q51 invariant, which must pass before **and** after by design
(PLAN.md standing hazard 1) and is declared as an invariant pin, never as RED evidence.

---

## GREEN

### B1 — the mark is canonical, persisted, and projected on the node

| what | where |
|---|---|
| minted once, in the sole vocabulary | `packages/kernel/src/index.ts:93` — inserted beside `OFF-SUBJECT-DOWNGRADE` |
| accepted on a served answer | `packages/contract/src/index.ts:11,505` — derived, no edit needed |
| typed record survives to persistence | `packages/serve/src/index.ts:807` — one union member (type-forced) |
| carried out of judgement | `apps/runner/src/index.ts` — accumulated at both node-creation sites, emitted into `factBundle.conditionMarks` and `conditionMarkRecords` |
| projected onto the affected node | the record's `affectedNodeIds` → `serve.condition_mark_node` rows → `projectConditionMarksByNode` → `NodeSchema.condition_marks` |
| rendered | one `case` each in `apps/ui/lib/v3/labels.ts` and `web/lib/v3Presentation.ts` |

**Deliberate, and load-bearing: the mark is inserted MID-LIST, not appended.**
`tests/unit/dr174-resilience.test.ts:231` reads the DR-176 tail **positionally** via
`CONDITION_MARKS.slice(-4)`. Appending re-aims that slice and surfaces as a
`CONDITION_MARK_RECORD_WITHOUT_MARK` far from the edit. Mutant **M7** pins this; a new test
asserts the tail explicitly.

**Not added to `REQUIRED_CONDITION_MARK_RECORDS`** (`packages/serve/src/index.ts:825`), and
that is a choice, disclosed: the orphan half of `assertRequiredConditionMarkRecords` already
forces mark↔record coherence in the direction my change creates (mutant **M6** proves it),
while adding to `REQUIRED` would also bind the review-catch-up path at
`apps/runner/src/index.ts:680-733`, which reconstructs preserved records generically. Naming
it so a reviewer can overrule it cheaply.

### B2 — the record names the node the graph minted, not the work item

The identity defect is closed **at the type level**, not by an assertion:

- `WayOfKnowingDowngrade` (what `Judge.judge` returns) carries `claimedWayOfKnowing` and
  `resolvedWayOfKnowing` and **no subject field of any kind**. The judge is called with
  `subjectItemId: claimed.workItemId` (`apps/runner/src/index.ts:1482`, `:1630`) and can no
  longer launder it into a node reference.
- `WayOfKnowingDowngradeRecord` — the persistable shape, with `subjectRef` — can only be
  produced by `bindWayOfKnowingDowngrade(downgrade, nodeId)`, which throws
  `WAY_OF_KNOWING_DOWNGRADE_NODE_UNRESOLVED` on a blank id.
- Both call sites bind **after** `writer.addNode()` has returned: root at
  `apps/runner/src/index.ts:1584-1590` (id from `:1514`), child at `:1706-1708` (id from
  `:1660`).

The seam test reads the node id back **from the served answer**
(`scenario.answer.nodes.find(node => node.claim === downgraded).node_id`) and asserts the
record's `subject_ref` equals it. No node-shaped literal appears anywhere in the assertion
path. The r1 unit test that supplied `"node:downgrade-subject"` is gone; its replacement
feeds the judge `"work:42"` — what the runner really passes — and asserts the downgrade
object does **not** contain it.

### Cluster verification — three runs each, worst run wins

**S02-C3a — judgement + vocabulary zone.** ONE command:

```
./node_modules/.bin/vitest run tests/unit/t4-way-of-knowing.test.ts tests/unit/judgement.test.ts \
  tests/unit/serve.test.ts tests/unit/serve-s05.test.ts tests/unit/s14-ui.test.ts \
  tests/unit/dr174-resilience.test.ts tests/unit/obs-l2-s02-registry.test.ts tests/unit/v2ui-data-layer.test.ts
```

| run | exit | Test Files | Tests | log |
|---|---|---|---|---|
| 1 | 0 | 8 passed (8) | **152 passed (152)** | `logs/t04/green-r2-c3a-run1.log` |
| 2 | 0 | 8 passed (8) | **152 passed (152)** | `logs/t04/green-r2-c3a-run2.log` |
| 3 | 0 | 8 passed (8) | **152 passed (152)** | `logs/t04/green-r2-c3a-run3.log` |

**S02-C3b — production seam (real PostgreSQL, real runner, real serve).** ONE command:

```
./node_modules/.bin/vitest run tests/integration/database.test.ts -t "S2-3 T4 projects WAY-OF-KNOWING-DOWNGRADED"
```

| run | exit | Test Files | Tests | log |
|---|---|---|---|---|
| 1 | 0 | 1 passed (1) | **1 passed \| 60 skipped (61)** | `logs/t04/green-r2-seam-run1.log` |
| 2 | 0 | 1 passed (1) | **1 passed \| 60 skipped (61)** | `logs/t04/green-r2-seam-run2.log` |
| 3 | 0 | 1 passed (1) | **1 passed \| 60 skipped (61)** | `logs/t04/green-r2-seam-run3.log` |

**Worst run of both clusters = GREEN.** No run was repeated to obtain a colour.

### Q51 semantics unchanged

1. **Structural.** `packages/serve/src/index.ts` appears in the diff for exactly one line —
   a member added to a type union. Q51's gate (`:528-550`) and the band basis (`:562`) are
   byte-identical.
2. **Executable.** `tests/unit/serve.test.ts` + `tests/unit/serve-s05.test.ts` exercise all
   three Q51 limbs (`GATE4_Q51_LOCATOR_BLOCK`, `GATE4_Q51_DOWNGRADE`, `GATE4_Q51_PASS`) and
   pass inside C3a, 3/3. On the unmodified base those two files plus `judgement.test.ts`
   were `38 passed (38)`, exit 0 (`logs/t04/base-neighbours.log`).
3. The in-cluster invariant test still asserts the judge cannot emit the
   `LOOKED_UP`-with-null-locator pair Q51's locator block keys on.

### Refutation — r2 mutants (worker contract §2)

Each applied to the clean committed tree, cluster re-run, restored with
`git checkout HEAD -- packages apps web tests`, `git status --porcelain` printed after every
restore (all empty). Log: `logs/t04/mutants-r2.log`.

| # | mutant | predicted | observed | what caught it |
|---|---|---|---|---|
| M5 | bind the downgrade to `claimed.workItemId` again (**the exact B2 defect**) | RED | **`1 failed \| 60 skipped (61)`** — `AssertionError: expected TypedDomainError: ANSWER_PERSIST_FAILED { code: '…' } to be null` | **PostgreSQL.** `serve.condition_mark_node.node_id` has a foreign key to `core.node(node_id)`; a work-item id cannot be persisted as a node reference. The schema refutes the bug before any assertion of mine does. |
| M6 | emit the record but not the answer-level mark | RED | **`1 failed \| 60 skipped (61)`** — `"code": "CONDITION_MARK_RECORD_WITHOUT_MARK"` | the engine's own two-way mark↔record contract |
| M7 | append the mark at the END of `CONDITION_MARKS` | RED | **`2 failed \| 150 passed (152)`** | the new positional test + `dr174-resilience.test.ts`'s `slice(-4)` |
| M8 | **NEIGHBOUR** — reword the UI label text | GREEN | **`152 passed (152)`** | correctly **not** caught: the label's existence and uniqueness are pinned, its wording is not |

r1's four mutants (`logs/t04/mutants.log`) still stand: M1 restore-`RAN`
(`5 failed \| 42 passed`), M2 always-emit (`2 failed \| 45 passed`), M3
record-resolved-as-claimed (`1 failed \| 46 passed`), M4 neighbour prose reword
(`47 passed`). *Disclosed for both harnesses:* the `MUTANT_EXIT=0` lines are the exit code
of the harness's trailing `grep`, not vitest's — every verdict above is read from its
`Tests` line.

---

## SUITES

| # | command | exit | counts | log |
|---|---|---|---|---|
| 1 | `pnpm run generate:contract` | **0** | generated client byte-identical (3-line re-export) | `logs/t04/typecheck-r2.log` |
| 2 | `pnpm run typecheck` (root, HEAD `7d179c6`) | **0** | **0 errors** (`grep -c 'error TS'` = 0) | `logs/t04/typecheck-r2.log` |
| 3 | `pnpm run typecheck` (root, r1 tree, 3 runs) | **0** | 0 errors, 3/3 identical | `logs/t04/typecheck.log`, `typecheck-run2.log`, `typecheck-run3.log` |
| **4** | **`./node_modules/.bin/tsc --noEmit -p apps/ui/tsconfig.json` @ HEAD `7d179c6`** | **1** | **1 error** — `apps/ui/app/layout.tsx(3,8): error TS2882` | `logs/t04/d14-head.log` |
| **5** | **`./node_modules/.bin/tsc --noEmit -p web/tsconfig.json` @ HEAD `7d179c6`** | **1** | **1 error** — `web/app/layout.tsx(3,8): error TS2882` | `logs/t04/d14-head.log` |
| **6** | **`./node_modules/.bin/tsc --noEmit -p apps/ui/tsconfig.json` @ base `1c9578a`** | **1** | **1 error** — `apps/ui/app/layout.tsx(3,8): error TS2882` | `logs/t04/d14-base.log` |
| **7** | **`./node_modules/.bin/tsc --noEmit -p web/tsconfig.json` @ base `1c9578a`** | **1** | **1 error** — `web/app/layout.tsx(3,8): error TS2882` | `logs/t04/d14-base.log` |
| 8 | `pnpm test` (r1 tree `73fb096`, terminal) | **1** | **24 failed / 1761 passed (1785 tests)**; **19 failed / 199 passed (218 files)**; 0 collection failures; 2922.06s | `logs/t04/test.log` |
| 9 | `pnpm test` (HEAD `7d179c6`, attempt 1) | **143** (SIGTERM) | killed ~10 min in, no summary; host load 21.7 | `logs/t04/test-r2.log` |
| 10 | `pnpm test` (HEAD `7d179c6`, attempt 2, **terminal**) | **1** | **26 failed / 1762 passed (1788 tests)**; **20 failed / 198 passed (218 files)**; **`Errors  1 error`**; 0 collection failures; 3036.07s | `logs/t04/test-r2b.log` |
| 11 | `pnpm run lint` | **1** | 3 architecture-audit violations | `logs/t04/lint.log` |

### D14 gates (rows 4–7) — the only evidence that covers my two ui/web lines

Root typecheck's `0 errors` is **vacuous for these two files**: root `tsconfig.json:20`
excludes `web/` and `apps/ui/` (D14, from T2's finding F-T2-2). Verbatim, both trees:

```
apps/ui/app/layout.tsx(3,8): error TS2882: Cannot find module or type declarations for side-effect import of './globals.css'.
web/app/layout.tsx(3,8): error TS2882: Cannot find module or type declarations for side-effect import of './globals.css'.
```

**Verified, not assumed** (the packet's instruction): each surface carries **exactly one**
error, it is the same `TS2882` on `layout.tsx:3` on both, and the HEAD and base outputs are
**identical**. D14's text names web's as the known pre-existing one; **apps/ui carries its own
one of the same shape**, which this pairing establishes rather than inherits. My two added
`case` lines introduce **zero** errors on either surface. Both gates were absent from r2 —
codex r2 B1, mine: D14 was appended to `DECISIONS.md` before my r2 handoff and I did not
re-read the rulings file between rounds.

Row 10 is the handed-off tree's full-suite evidence. Row 9's `143` is SIGTERM under host
pressure (load 21.7; T16's attempt died the same way in the same window) — reported because
it happened, not as a verdict on the tree. Row 8 covers the r1 tree and is retained so the
two rounds can be compared. 1788 − 1785 = the three tests r2 adds.

Root typecheck being 0/0 rather than T0's 157 is the D9 provisioning effect, not a claim
about my diff: `packages/contract/generated/client.ts` exists in this worktree.

### Failure classification — ALL 26 failures + the 1 error (codex r2 B2)

**Tally: 23 PRE-EXISTING · 3 FLAKE · 0 OWNED = 26, plus 1 unhandled error (PRE-EXISTING).**

r2's section said "every one of the 26 is accounted for" while also declining attribution
for eight of them. **Both sentences were in it, and codex was right to refuse the assess.**
Three of my r2 justifications were "not in my blast radius", which is not evidence — and
codex falsified it: `memory-database` imports serve, `s7-authorization-database` imports
judgement/serve/contract, and the four S06 tests import runner/kernel. Every one of those is
inside the radius r2 widened from 3 files to 12. **This round replaces reasoning with paired
runs.** Every row below cites a HEAD log and a base log, or a named flake ticket.

**Method, identical for every pair:** tree clean → `git checkout --detach 1c9578a` → same
vitest invocation → `git checkout lane/t4` → `git status --porcelain` printed (empty) at
every step. Compared on the **failure SET**, never on totals.

#### PRE-EXISTING — 23, each by a paired base↔HEAD run that is identical

| # | failing test | pair | HEAD | base |
|---|---|---|---|---|
| 1 | `tests/architecture/s04-contract.test.ts > DR-128 mints only the claim-type composition structure and wires a loud register read` | A | `11 failed \| 65 passed (76)` | `11 failed \| 65 passed (76)` |
| 2 | `tests/architecture/s10-carrier-erasure-red.test.ts > filters completed private tombstones before any external key load` | A | ″ | ″ |
| 3 | `tests/architecture/s7-authorization-contract.test.ts > hardens every immutable memory scope carrier and derives it from run ownership` | A | ″ | ″ |
| 4 | `tests/architecture/s13-contract.test.ts > lands append-only memory carriers without a closure job or embedding dependency` | A | ″ | ″ |
| 5 | `tests/unit/pro01-runner-tree.test.ts > stops a defender call loudly on the pinned RUN_COST_ENVELOPE_EXHAUSTED path` | A | ″ | ″ |
| 6 | `tests/unit/xrev01-node-review.test.ts > stops a review loudly when the ratified model-call envelope is exhausted` | A | ″ | ″ |
| 7 | `tests/unit/load01-run-projection.test.ts > reads the state only through the owning asker and prioritizes terminal failure` | A | ″ | ″ |
| 8 | `tests/unit/obs-l2-s04-zone.test.ts > calls the resolver over the real mount-list source and runs ZI-1..ZI-4` | A | ″ | ″ |
| 9 | `tests/unit/obs-l2-s04-zone.test.ts > passes all 15 required falsification mutants` | A | ″ | ″ |
| 10 | `tests/unit/s6-content-encryption.test.ts > defaults content encryption off, retires the v1 blind-index path, and requires wrapping-key paths` | A | ″ | ″ |
| 11 | `tests/unit/v2ui-node-runner.test.ts > keeps every active .test.mjs file in the explicit runner manifest` | A | ″ | ″ |
| 12 | `tests/architecture/scaffold.test.ts > enforces purity, one provider gateway, source-constant, exhaustive-switch and labeled-number gates` | B | `2 failed \| 6 passed (8)` | `2 failed \| 6 passed (8)` |
| 13 | `tests/architecture/scaffold.test.ts > matches all 28 dependency-edge rows and structural rules 1–5` | B | ″ | ″ |
| 14 | `tests/integration/database.test.ts > claims, judges through the HTTP gateway, propagates, serves, and settles` | C | `1 failed \| 60 skipped (61)` | `1 failed \| 59 skipped (60)` |
| 15 | `acceptance/dual-maker-proof.test.ts > FAIR-02 dual-maker proof > round-trips one live call through BOTH makers and persists honest, never-blended lineage rows` | D | `7 failed \| 15 passed (22)` + `1 error` | `7 failed \| 15 passed (22)` + `1 error` |
| 16 | `tests/integration/memory-database.test.ts > does not link a legacy candidate after an ownership claim changes its effective scope` | D | ″ | ″ |
| 17 | `tests/integration/s7-authorization-database.test.ts > locks every matching run before allocation while a rejected transfer is queued` | D | ″ | ″ |
| 18 | `tests/integration/obs-l3-s06-runner-binding.test.ts > S06 deployment linkage > evaluates the runner installer before the DB dependency in the real production entrypoint` | D | ″ | ″ |
| 19 | `tests/integration/obs-l3-s06-runner-binding.test.ts > S06 provider gateway binding > captures one provider occurrence after the real gateway exhausts all attempts` | D | ″ | ″ |
| 20 | `tests/integration/obs-l3-s06-runner-binding.test.ts > S06 runner task binding > captures the real task failure before terminal recording with declared context and Hatchet attempt index` | D | ″ | ″ |
| 21 | `tests/integration/obs-l3-s06-runner-binding.test.ts > S06 runner task binding > preserves the original task failure when terminal recording fails and captures the recording alarm` | D | ″ | ″ |
| 22 | `tests/integration/registration-database.test.ts > S3d post-hash main-process secondary RSS tripwire stays flat and counts every refusal` | E | `1 failed \| 68 skipped (69)` | `1 failed \| 68 skipped (69)` |
| 23 | `acceptance/adversarial-corpus.test.ts > P4-13 approved adversarial relay corpus > executes DB-01 with no database locator or capability call` | F | `1 failed \| 13 passed (14)` | `1 failed \| 13 passed (14)` |

| pair | ONE command (identical on both trees) | HEAD log | base log |
|---|---|---|---|
| A | 10 files: `s04-contract` `s10-carrier-erasure-red` `s7-authorization-contract` `s13-contract` `pro01-runner-tree` `xrev01-node-review` `load01-run-projection` `obs-l2-s04-zone` `s6-content-encryption` `v2ui-node-runner` | `head-blastradius.log` | `base-blastradius.log` |
| B | `tests/architecture/scaffold.test.ts` | `head-scaffold.log` | `base-scaffold.log` |
| C | `tests/integration/database.test.ts -t "claims, judges through the HTTP gateway"` | `head-dbseam.log` | `base-dbseam.log` |
| D | `acceptance/dual-maker-proof.test.ts` `memory-database.test.ts` `s7-authorization-database.test.ts` `obs-l3-s06-runner-binding.test.ts` | `head-residual.log` | `base-residual.log` |
| E | `tests/integration/registration-database.test.ts -t "S3d post-hash main-process secondary RSS tripwire"` | `head-s3d.log` | `base-s3d.log` |
| F | `acceptance/adversarial-corpus.test.ts` + `pol03-pool-resilience.test.ts` | `head-last2.log` | `base-last2.log` |

Row 14's `61` vs `60` skipped is **my own new test joining that file at HEAD**, not a
difference in outcome; the failure set is identical. Row 14 is the one that mattered most —
a full runner→serve→settle path, in the file my new test lives in, on a diff that touches
both runner and serve. It is where a defect of mine would surface, and it does not.

#### FLAKE — 3, each red inside the saturated full run and GREEN in isolation on the SAME tree

| # | failing test | ticket | isolation evidence |
|---|---|---|---|
| 24 | `tests/integration/evaluator-consumer-database.test.ts > returns typed in-flight skips without holding a pool client across the call` | **board F21** (named member) | `1 passed \| 5 skipped (6)`, exit 0 @ HEAD — `head-r2-deltas.log` |
| 25 | `tests/integration/registration-database.test.ts > S3b keeps live-mail N=1/N=4/N=8 PostgreSQL arms below the separation ceiling` | **F13's class, NOT F13's ticket** — filed as F-T4-8 | `1 passed \| 68 skipped (69)`, exit 0 @ HEAD — `head-r2-deltas.log` |
| 26 | `tests/integration/pol03-pool-resilience.test.ts > POL-03 real PostgreSQL backend reset > survives an idle backend termination and reports in-flight and subsequent failures typed` | T0 finding 4 (named FLAKY: green R1,R2 / red R3) | **passes on BOTH trees** inside pair F — `head-last2.log`, `base-last2.log` |

**The F21 question, answered precisely: NO — my +2 versus the r1-tree run are NOT the F21
pair.** F21 names `evaluator-addon-database` **and** `evaluator-consumer-database`. My delta
was `evaluator-consumer-database` (an F21 member) and `registration-database > S3b` (not an
F21 member); `evaluator-addon-database` did not fail in either of my runs. So F21 covers one
of the two and the second is a **new instance of the same environmental class** — a
wall-clock separation-ceiling assertion, which is F13's *class* but not F13's *ticket*
(F13 is scoped to `acceptance/relay-core.test.ts`). Filed as **F-T4-8** rather than absorbed
into a ticket that does not name it.

#### The 1 unhandled error — PRE-EXISTING

`test-r2b.log` carries `Errors  1 error`, a line my r2 report never mentioned:

```
⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯
error: ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP
 ❯ node_modules/.pnpm/pg@8.22.0/node_modules/pg/lib/client.js:652:17
Serialized Error: { … severity: 'ERROR', code: '23514', where: 'PL/pgSQL function core.append_run_ownership_event(uuid,uuid) line 36 at RAISE' … }
This error originated in "tests/integration/s7-authorization-database.test.ts" test file.
```

It is a PL/pgSQL `RAISE` (`ERRCODE 23514`) escaping as an unhandled rejection, attributed by
vitest to the same S7 test as failure #17. **Pair D reproduces it identically on BOTH trees**
— `Errors  1 error` at HEAD and at base, with the same
`ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP` text present in each log. PRE-EXISTING.

#### The falsifying question (T1's self-report): would my probe have shown me?

**Yes, and the discriminating power is demonstrated on this very tree.** The same paired
technique produces a clear asymmetry when a diff *is* the cause: my own C3a zone and the
production seam are RED at `1c9578a` and GREEN at `7d179c6`. A failure I caused would show
base-green / HEAD-red. **Twenty-three of twenty-six produced no asymmetry whatsoever**, and
the remaining three are green in isolation on the tree that failed them — a signature no code
change explains. **OWNED: 0**, and that count is the output of the probes, not a claim made
ahead of them.

`pnpm run lint` (not in the packet's SUITES list, reported anyway) exits **1** with three
`… -> obs-capture is not a declared edge` violations (`logs/t04/lint.log`). **PRE-EXISTING,
attributed by pickaxe:** `git log -S'obs-capture' -- apps/api/src apps/runner/src
apps/scheduler/src` names `e8d99d3` and `git merge-base --is-ancestor e8d99d3 1c9578a`
succeeds. This is the same defect `scaffold.test.ts`'s dependency-edge arm reports.

---

## FINDINGS (worker contract §5)

**F-T4-1 — CLOSED this round.** r1 filed the invisible-mark gap as a follow-up ticket; J5
ruled it in scope and it is implemented above. Recorded as closed rather than deleted, so the
r1 record stays honest.

**F-T4-1b — the dead RAN band bucket** at `packages/serve/src/index.ts:562` remains
structurally unreachable from the judge path and untouched (board F5 / DECISIONS J4, T12's
span). Still owed a ticket; still not mine.

**F-T4-2 — a locator supplied with a `REASONING` claim is silently discarded.**
`packages/judgement/src/index.ts:234`, `locator: pinnedLookup ? parsed.value.locator : null`.
Pre-existing, unchanged by this diff, and *not* a way-of-knowing downgrade, so the new mark
correctly does not fire — but it is the same class of silent absorption S2-3 exists to end.
Non-blocking.

**F-T4-3 — CLOSED by D12.** The stale-baseline packet defect (also codex N1).

**F-T4-4 — the agent scratchpad is SHARED between concurrent lane sessions.** In r1 my
harness `scratchpad/mutants.sh` was overwritten in place by lane T1's file of the same name;
blast radius zero **by timing alone**. A lane that writes a scratch script and runs it two
calls later executes another lane's script, under `set -u`, with a hardcoded `cd` into a
different worktree. r2's harness is `t04-mutants-r2.sh`. **Still not appendable to
`.hermes/TOOLING-TRAPS.md` from this seat** (not in `allowed`, and concurrently modified) —
this is the third paid-for trap this mission that cannot reach the file meant to collect
them (T0 finding 7 was the first).

**F-T4-5 — `RAN` survives elsewhere by design**, so nobody reads this diff as an engine-wide
removal: `packages/kernel/src/index.ts:19` (`WAY_OF_KNOWING`, still 3-valued, quoted by
`graph`, `propagation`, `ledger`, `valuation`) · `packages/serve/src/index.ts:218,562` ·
`apps/runner/src/dev-runner-policy.ts:51` · `acceptance/runtime-policy.ts:32` ·
`apps/ui/lib/v3/adapter.ts:42` and `apps/ui/components/AnswerHonestyDrawer.tsx:117-118` ·
`tests/integration/database.test.ts:3139` (a direct graph insert that never passes through
`Judge.judge`). The goal's T4 sentence scopes to the **judge output schema** only.

**F-T4-6 — `PLAN.md`'s cluster table ships its "ONE verification command" column as
"(worker fills)"**, so every worker invents one and no reviewer can compare lanes. Mine are
recorded under `## GREEN`. Non-blocking, process.

**F-T4-7 — NEW: `tests/architecture/scaffold.test.ts` is RED on `dev@1c9578a` itself**, both
arms (exhaustive-switch/purity gate and the 28-dependency-edge gate), matching `pnpm run
lint`'s three undeclared `obs-capture` edges from `e8d99d3`. A red architecture gate on the
integration base means **every lane will re-derive this independently**. It belongs in T0's
re-pin as a named line, not in eight separate lane reports. Non-blocking for T4; blocking for
anyone who reads a green `lint` as a merge precondition.

**F-T4-8 — NEW: `registration-database > S3b keeps live-mail N=1/N=4/N=8 PostgreSQL arms
below the separation ceiling` is a wall-clock flake, and no existing ticket names it.** Red
inside the saturated full run (load 22–31), `1 passed | 68 skipped (69)` exit 0 in isolation
on the same tree (`logs/t04/head-r2-deltas.log`). It is **F13's class but not F13's ticket**
(F13 is scoped to `acceptance/relay-core.test.ts`) and **not an F21 member** (F21 names
`evaluator-addon-database` + `evaluator-consumer-database`). Filed separately rather than
absorbed into a ticket that does not name it — a flake-class ticket is only useful if
membership is checked. Same disposition class as F13/F21: V DECISIONS PACKET row at closure.

**F-T4-9 — NEW, process, and it cost this lane a blocking finding: a lane can be bound by a
ruling appended after its dispatch and never learn of it.** D14 (surface-local typecheck
gates) landed in `DECISIONS.md` before my r2 handoff; my r2 packet did not carry it and I did
not re-read the rulings file between rounds, so both gates were missing — codex r2 B1. Between
my r1 and r2 handoffs `DECISIONS.md` gained D14, D15, J5, J6 and J9 plus board findings
F13–F21. **Cure: every rework/dispatch message states the ruling high-water mark** (*"rulings
through JXX / DXX apply"*), and a worker re-reads `DECISIONS.md` as step one of every round.
Mine to absorb as a habit; the packet line is the orchestrator's.

---

## COMMITS

| sha | subject |
|---|---|
| `73fb096` | `T4: drop RAN from the judge output schema and disclose way-of-knowing downgrades` |
| `7d179c6` | `T4 r2: make WAY-OF-KNOWING-DOWNGRADED a canonical, visible mark on the real node` |

Two commits on `lane/t4`, parent `1c9578a`. `git status --porcelain` at close: clean.
Not done, by contract: no push, no merge, no board write, no ticket split, no migration.

---

## HANDOFF

- **Rework round:** 1 of 3. Returns to session `opus-t04-w1`.
- **Self-report:** `agent-reports/t04-wok-self.md`, `## r2` section appended **before** this
  report's marker was written — the r1 failure codex named as B3 was setting a marker over
  `PENDING_*` placeholders, and it is named plainly there as a discipline failure, not a
  tooling one.
- **Logs — `ls logs/t04/*.log | wc -l` = 39**, of which 38 are cited above. The uncited one is
  `green-r2-zone-run1.log`, the first r2 zone run (it included `scaffold.test.ts`, which is
  RED at base — see F-T4-7 — so the cluster was re-scoped and re-run three times as C3a and
  scaffold was paired separately). Retained rather than deleted so the re-scoping is on the
  record:
  `logs/t04/{red-t4,red-t4-r2,red-r2-seam,base-neighbours,base-scaffold,head-scaffold,base-blastradius,head-blastradius,base-dbseam,head-dbseam,head-r2-deltas,base-residual,head-residual,base-s3d,head-s3d,base-last2,head-last2,d14-base,d14-head,green-c3-run1..3,green-r2-zone-run1,green-r2-c3a-run1..3,green-r2-seam-run1..3,mutants,mutants-r2,typecheck,typecheck-run2,typecheck-run3,typecheck-r2,test,test-r2,test-r2b,lint}.log`
- **Rounds spent:** 3 of 3. **There is no authorized round 4** — any further finding is a V
  DECISIONS PACKET row, not a rework.
- **Constants chosen, disclosed:** the vocabulary INSERTION POINT (after
  `OFF-SUBJECT-DOWNGRADE`, never appended — `slice(-4)` is read positionally) · the label
  string `"Claimed lookup had no locator"` (identical in both renderers; wording deliberately
  unpinned, mutant M8) · `liftPath: "Re-ask with a source the judge can pin, or read the node
  as reasoning"` · `scope: "node"` · `affectedNodeIds: [subjectRef]` (the whole node-projection
  mechanism) · the typed error code `WAY_OF_KNOWING_DOWNGRADE_NODE_UNRESOLVED` · the decision
  NOT to extend `REQUIRED_CONDITION_MARK_RECORDS`, argued under B1 above.
