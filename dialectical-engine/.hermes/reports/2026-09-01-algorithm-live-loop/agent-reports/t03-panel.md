# T3 PANEL r1

Seat T3 · PROGRAMMING loop · Opus 5 · session `opus-t03-w3`.
Base: integration tip **`5868a38`** (T2+TREL+T16+T4 merged). Branch `lane/t3`.
Worktree: `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t3/dialectical-engine`.
Provisioning verified before any suite: `node_modules` present, `packages/contract/generated/client.ts` present.
No live provider calls anywhere in this lane — every M≥2 panel voice comes from the repo's
HTTP provider doubles in `acceptance/`.

---

## ENUMERATION (packet stop-condition: the CLASS before the instances)

Enumerated **before** editing. Every site that produces a judgement today, and every
consumer of the reduced judgement:

**Producers of a reduced judgement (production, both wired):**

| # | Site | Path |
|---|---|---|
| 1 | `apps/runner/src/index.ts` root judgement (`reduceAssessment` → `selectReducedJudgement` → `recordReduced`) | root author |
| 2 | `apps/runner/src/index.ts` `authorPosition` (`childReduced` → `childSelection` → `recordReduced`) | secondary root, additional roots, and every child |

There is no third producer: `reduceAssessment` appears in production only at those two
sites; every other reference is a test or the architecture contract test.

**Consumers of the reduced judgement / its panel fields:**

| Consumer | What it reads |
|---|---|
| `packages/judgement/src/index.ts` `JudgementRepository.recordReduced` | the sink — writes `dispersion`, `panel_contract_hashes`, `disagreement` |
| `apps/runner/src/index.ts` propagation record | `selection.rule` + `selection.selectionScore` → `ledger.propagation_run.judgement_selection_rule_*` |
| `packages/db/src/schema.ts:358-359` | typed column mirrors |
| `tests/architecture/s04-contract.test.ts:16` | asserts the DDL column set |
| `tools/orphan-audit/src/index.ts` | declares the s04 surface attachment |
| `migrations/0004_s04.sql:39-59` | the two CHECK constraints that bind every write |

**Found during enumeration, before coding — the finding that would otherwise have
arrived late:** `tools/orphan-audit` DECLARES `runJudgePanel`, `measureDispersion`,
`applyCorrelatedErrorDiscount` and `applyDeclaredDisagreement` as never-called /
`UNATTACHED`, and `tests/architecture/scaffold.test.ts:103-126` asserts it. Wiring the
panel makes those declarations false. Handled as a forced consequence (see FINDINGS F1).

---

## RED

The DoD's RED, run on the **unmodified base** `5868a38` before any production edit.
It is the same test that serves as the ACCEPTANCE-path receipt (below).

Command (from the lane worktree):

```
npx vitest run acceptance/panel-multi-maker.test.ts
```

Failure — verbatim from `logs/t03/red-acceptance-panel.log`:

```
 FAIL  acceptance/panel-multi-maker.test.ts > T3 / S2-2 — the judge panel is live on the acceptance path (author != judge) > persists one reduced judgement per node carrying >= 2 panel members and a measured dispersion
AssertionError: expected 1 to be greater than or equal to 2
 ❯ acceptance/panel-multi-maker.test.ts:273:48
```

```
 Test Files  1 failed (1)
      Tests  1 failed (1)
```

`1` is `jsonb_array_length(panel_contract_hashes)` re-read from `ledger.reduced_judgement`:
on the base the walking-skeleton literal is live, so every node persists exactly one panel
member and `dispersion = NULL`. Exactly the DoD's stated RED.

**Disclosure — the first RED attempt failed for the WRONG reason and was not accepted.**
Attempt 1 failed with `PANEL_WORK_FAILED:ACCEPTANCE_EXECUTION_FAILED:JUDGE_SCHEMA_FAILURE`,
a fixture bug, not the feature (my provider double classified on a quoted prompt fragment,
which the wire body escapes — see TOOLING-TRAPS, T3 entry). Per TDD a RED that fails on a
fixture bug proves nothing; I fixed the classifier and re-ran to get the frame above. Both
runs are in `logs/t03/red-acceptance-panel.log` (the file holds the accepted second run).

---

## GREEN

Cluster A — zone (`tests/unit` + `tests/architecture`), **three runs, worst run wins**:

| Run | Result | Log |
|---|---|---|
| 1 | **1233/1246** passed · 13 failed | `logs/t03/clusterA-run1.log` |
| 2 | **1233/1246** passed · 13 failed | `logs/t03/clusterA-run2.log` |
| 3 | **1233/1246** passed · 13 failed | `logs/t03/clusterA-run3.log` |

**SET-EQUALITY across the three runs: IDENTICAL.** Verified by set-diff of the failing
test names, not by counting:

```
diff -q A1.txt A3.txt  →  IDENTICAL
diff -q A1.txt A2.txt  →  IDENTICAL
```

**Failure classification against my own D12 base run at `5868a38`
(`logs/t03/base-zone-run1.log`: 1222/1236, 14 failed):**

- **New failures caused by my diff: ZERO.** `comm -13 base-fails.txt A3.txt` is empty in
  all three runs.
- Failures that left: **one** — `tests/unit/registration.test.ts > S3c B4 keeps the
  isolated production RSS curve below the published measured bound`. Environmental
  (an RSS measurement under host load), red in my base run, green in all three after-runs.
  I claim no credit for it.
- Test total rose 1236 → 1246: exactly my +10 new unit tests.
- The 13 stable-red are a strict subset of my 14-failure base set. Full list in
  FAILURE CLASSIFICATION below.

I do **not** claim that nothing in this suite is caused by my diff on the strength of the
counts; the claim rests on the name-level set-difference against my own base run, plus the
byte-identical failure reason check below.

Cluster B — acceptance (`panel-multi-maker` + `ceremony` + `mono-panel`), three runs.
This is the M≥2 evidence cluster; it runs entirely on the repo's HTTP provider doubles:

| Run | Result | Log |
|---|---|---|
| 1 | **5/5** passed · 0 failed (3 files) | `logs/t03/clusterB-run1.log` |
| 2 | **5/5** passed · 0 failed (3 files) | `logs/t03/clusterB-run2.log` |
| 3 | **5/5** passed · 0 failed (3 files) | `logs/t03/clusterB-run3.log` |

**SET-EQUALITY across the three runs: IDENTICAL (the failing set is empty in all three).**
Worst run = 5/5. Run under host load 13.8–23.8, i.e. the three greens are not a quiet-host
artefact. The five are: my two panel tests (M≥2 receipt + confirm-item 5 degraded path),
ceremony's two, and `mono-panel`'s one — the last being the M=1 skeleton path, which must
keep passing for the "literal reachable only at M=1" clause to mean anything.

---

## RECEIPTS

### The ACCEPTANCE-path receipt (DoD: "not only unit calls")

`acceptance/panel-multi-maker.test.ts` drives a **real M=2 run** through the real API root
and the real `WalkingSkeletonRunner` over two HTTP provider doubles, waits for the work
item to reach `DONE`, then **re-reads `ledger.reduced_judgement` from the database** and
proves, per node:

1. one reduced judgement per node (`node_id` set size == row count — no row racing);
2. `jsonb_array_length(panel_contract_hashes) >= 2`;
3. `dispersion IS NOT NULL` — a measured spread, because the two doubles score
   differently on purpose (fidelity 0.72 vs 0.40) rather than being two copies;
4. the panel really ran: `assessCallCount(primary) + assessCallCount(second)` equals the
   node count — the non-author makers were called, node by node;
5. **the family discount is live**: every recorded member carries a `familyRef` that is a
   member of the sealed `providerFamilies` map and a `familyOrdinal >= 1`. `familyOrdinal`
   is produced by `applyCorrelatedErrorDiscount` and by nothing else, so a recorded
   ordinal is proof that stage executed on this path — see the honesty note below.
6. `effectiveWeight` equals `earnedWeight` at first appearance and
   `earnedWeight * <sealed multiplier>` otherwise, with the multiplier **read from the
   seeded T16 row** (`readPanelWeightingControls`), never restated in the test.

Degraded path (confirm-item 5), same file, second test: both makers refuse every panel leg
→ every node's receipt carries `PANEL-DEGRADED-SINGLE-VOICE`, `nonAuthorVoiceCount = 0`,
a `PARSE_FAILURE` note, `dispersion = NULL` with
`dispersionAbsentReason = FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS` (typed absence, never a
quiet zero), `panel_contract_hashes` length 1, and `certaintyEffect = DOWNGRADED` with
`certaintyBand` equal to **T16's own** `oneStepDown[FULL]` — asserted to differ from the
band the runtime started at, so an identity "step" cannot pass.

**HONESTY NOTE on the family discount — read this.** The repeated-family MULTIPLIER branch
is **unreachable on the acceptance path**: `acceptance/seed-register.ts` derives families
from `ACCEPTANCE_CONFIGURED_PROVIDERS`, which is one provider per maker (OpenAI /
Anthropic / xAI), so every acceptance provider is its own family and every ordinal is 1.
The acceptance receipt therefore proves the discount stage **ran and resolved families
from the sealed map**; the multiplier arithmetic itself is pinned at the s04 surface
(`tests/unit/judgement-s04.test.ts:171`). I did not manufacture a fake repeated family to
make the acceptance assertion look stronger than the deployment allows. Filed as F4.

### F23 CLAUSE — every receipt / JSONB column this wiring writes or extends

Enumerated **before** coding. **No migration is added and no column is created.**

Table `ledger.reduced_judgement` (via `JudgementRepository.recordReduced`):

| Column | Type / constraint | Before | After this wiring |
|---|---|---|---|
| `dispersion` | `double precision`, `CHECK dispersion IS NULL OR 0..1` (`0004_s04.sql:57`) | always `NULL` | measured panel dispersion at M≥2; `NULL` at M=1 or on typed absence |
| `panel_contract_hashes` | `jsonb`, `CHECK jsonb_typeof = 'array'` (`0004_s04.sql:53`) | always 1 element | one entry per surviving panel voice (≥2 on a healthy M≥2 panel) |
| `disagreement` | `jsonb`, `CHECK jsonb_typeof = 'object'` (`0004_s04.sql:54`) | the `createUnmeasuredDisagreement()` literal | at M≥2, the `applyDeclaredDisagreement` record **EXTENDED** with the keys below |
| `tau` | numeric | author's tau | the panel's selected tau (may be a member's) |
| `selected_judgement_ref` | `uuid REFERENCES ledger.raw_artifact` | author's artifact | the selected voice's artifact — panel-member artifacts are real raw artifacts, so the FK holds (proven by the acceptance run) |

**Keys ADDED inside the `disagreement` JSONB object** (an open object today; no schema
change, and the `jsonb_typeof = 'object'` CHECK still holds):

- `marks` — `string[]`: `PANEL-PARTIAL` and/or `PANEL-DEGRADED-SINGLE-VOICE`
- `dispersionAbsentReason` — `string | null`
- `panel` — object: `authorMaker`, `authorProviderRef`, `voiceCount`,
  `nonAuthorVoiceCount`, `members[]` (`memberRole`, `familyRef`, `familyOrdinal`,
  `earnedWeight`, `effectiveWeight`), `notes[]` (`memberRole`, `kind`, `failureKind`,
  `reason`)

Table `ledger.propagation_run` — `judgement_selection_rule_key` /
`_register_version` / `_source_ref`: **shape unchanged**, values now panel-derived.

Table `ledger.ledger_entry` — new `MODEL_CALL` rows whose `call_site_key` lives in a new
**`PANEL:`** namespace. No schema change (`call_site_key` is free text with a non-empty
CHECK). The namespace is deliberate: see F2.

---

## REFUTATION EVIDENCE (worker contract §2)

Five mutants. Each applied via a scratch copy (`cp`), never `git checkout <sha> -- path`
(that stages the restore — recorded trap). `git status --porcelain` printed after every
restore; the mutated file was absent from the status each time, i.e. byte-exact restore.

**PROPERTY 1 — the author never occupies a panel seat as judge of its own node.**

- Mutant 1: delete the producer bulkhead branch in `runJudgePanel` (s04.ts:232-235).
  → **RED**: `expected [ { memberRole: 'house-a', …(4) } ] to deeply equal [ ObjectContaining{…} ]`
  (the author's `judge()` throws `THE_AUTHOR_MUST_NOT_BE_CALLED`). Restored → 10/10 GREEN.
- **Neighbouring mutant N1** (must NOT be caught): change the bulkhead note's
  `reason: "FX-HR-H6"` to another string. → **10/10 GREEN, not caught.** Correct: the test
  pins the bulkhead's behaviour and typed kind, not its provenance string.

**PROPERTY 2 — a member's failure is recorded as the kind it actually was.**

- Mutant 2: collapse `lastOutcome === "TIMED_OUT" ? "TIMEOUT" : "PROVIDER_ERROR"` to always
  `"PROVIDER_ERROR"`. → **RED** on "raises a TIMEOUT member failure". Restored → GREEN.

**PROPERTY 3 — the panel resolves each member's family from the sealed map.**

- Mutant 3: make `familyOf()` always return `{ kind: "UNKNOWN" }`.
  → **RED**: `expected null not to be null` (`member.familyRef`). Restored.
- **This mutant is the reason the assertion was rewritten.** My first version of the
  family assertion compared `effectiveWeight` against a value derived from
  `familyOrdinal` — under an always-UNKNOWN mutant, `familyOrdinal` is `null`, the
  first branch is taken and **the assertion passed**. It pinned nothing. Recorded in the
  self-report as the lane's most expensive near-miss.

**PROPERTY 4 — a measured dispersion reaches the persisted receipt.**

- Mutant 4: discard the measurement (`dispersion: null`) at the persistence boundary.
  → **RED**: `expected null not to be null`. Restored.

**PROPERTY 5 — the walking-skeleton literal is reachable at M=1 ONLY.**

- Mutant 5: widen the skeleton guard from `effectiveMakerCount <= 1` to `<= 2`, leaking the
  literal into M=2. → **RED on both M≥2 panel tests** (`expected 1 to be greater than or
  equal to 2`; degraded marks absent) **while `acceptance/mono-panel.test.ts` (M=1) stayed
  GREEN**. That is the boundary pinned from both sides. Restored.

---

## SUITES

- **Root typecheck** — `pnpm run typecheck` (`tsc --noEmit`): **exit 0**, clean, after the
  final state. Base at `5868a38` was also exit 0 (`logs/t03/base-typecheck.log`).
- **Cluster A (zone: `tests/unit` + `tests/architecture`) ×3** — 1233/1246, 1233/1246,
  1233/1246; **set-identical across all three**; zero new failures vs my D12 base run.
- **Cluster B (acceptance: `panel-multi-maker`, `ceremony`, `mono-panel`) ×3** —
  see the GREEN section table.
- **Full suite** — `D15-DEFERRED / CANNOT-ASSESS — judge-run on integration post-merge`.
  The host is **not** quiet: load average was 9.5–23.8 throughout this lane (D13's
  measured contention condition), and two tests demonstrably flipped on load alone
  (see FAILURE CLASSIFICATION). Per D13 as amended by D15 the authoritative run is the
  judge-stage run on integration.
- **D16 gate — states explicitly: my diff does NOT touch `packages/contract` or
  `packages/kernel`, so D16 does not gate this lane.** Verified:
  `git diff --name-only 5868a38 HEAD | grep -E "packages/(contract|kernel)/"` → no match.
  Changed paths: `acceptance/ceremony.test.ts`, `acceptance/main.ts`,
  `acceptance/panel-multi-maker.test.ts`, `apps/runner/src/index.ts`,
  `packages/judgement/src/index.ts`, `tests/architecture/scaffold.test.ts`,
  `tests/unit/t03-judge-panel.test.ts`, `tools/orphan-audit/src/index.ts`,
  `.hermes/TOOLING-TRAPS.md`. No migration touched.

### FAILURE CLASSIFICATION

The 13 stable-red in cluster A, identical in all three runs, all present in my own D12
base run at `5868a38` — **none is mine**:

```
tests/architecture/s04-contract.test.ts       DR-128 ... wires a loud register read
tests/architecture/s10-carrier-erasure-red.test.ts  filters completed private tombstones
tests/architecture/s13-contract.test.ts       lands append-only memory carriers
tests/architecture/s7-authorization-contract.test.ts  hardens immutable memory scope carrier
tests/architecture/scaffold.test.ts           enforces purity ... labeled-number gates
tests/architecture/scaffold.test.ts           matches all 28 dependency-edge rows
tests/unit/load01-run-projection.test.ts      reads state only through the owning asker
tests/unit/obs-l2-s04-zone.test.ts            calls the resolver over the real mount-list
tests/unit/obs-l2-s04-zone.test.ts            passes all 15 required falsification mutants
tests/unit/pro01-runner-tree.test.ts          stops a defender call loudly on RUN_COST_ENVELOPE_EXHAUSTED
tests/unit/s6-content-encryption.test.ts      defaults content encryption off
tests/unit/v2ui-node-runner.test.ts           keeps every active .test.mjs in the manifest
tests/unit/xrev01-node-review.test.ts         stops a review loudly when the envelope is exhausted
```

`tests/architecture/s04-contract.test.ts` sits on my own surface, so I checked its failure
reason **byte-for-byte before and after** my diff — identical, and unrelated to the panel:

```
AssertionError: expected 'import "@debateai/obs-capture/install…' to contain 'readClaimTypeCompositionMap'
```

**Load-induced flakes observed and named, never absorbed** (same class as F13/F21/F22):

1. `tests/unit/registration.test.ts > S3c B4 ... RSS curve` — RED in my base run, GREEN in
   all three after-runs. Environmental RSS measurement.
2. `tests/architecture/obs-l2-s05-import-graph.test.ts > runner uses an unrefed zero-delay
   arm ...` — RED **once**, in an intermediate after-run, GREEN in all three cluster A
   runs. Root-caused rather than absorbed: the assertion is
   `expect(spawnSync(...).status).toBe(0)` and it got `null`, which means the child was
   **killed by a signal**; the case took 5166 ms against ~350 ms for its two sibling cases
   in the same `it.each`; my diff touches **zero** files under `packages/obs-capture`; and
   both this test and (1) pass together in isolation (67/67,
   `logs/t03/probe-obs-l2-isolated.log`) at load ~14.75. **New flake instance worth a
   family name** — filed as F5.

---

## CONSTANTS I CHOSE — disclosed

The runner carries **no** T16 policy value; every one arrives from a register reader and is
bound by identifier (verified against `tests/support/t16PolicyScanner.ts`'s consumer rules:
no sealed decimal, no policy identifier bound to a literal, no restated band vocabulary, no
restated family map). What I did choose:

1. `PANEL_PARTIAL_MARK = "PANEL-PARTIAL"` — the packet names
   `PANEL-DEGRADED-SINGLE-VOICE` for the all-failed case but only says "proceed + mark" for
   the partial case. **I chose this name.** See packet defect P1.
2. The **home** of both marks: the node's own `disagreement` JSONB receipt, not the
   answer's `condition_marks`. Forced by my contract (no serve/ui work). See F3.
3. `PANEL:` as the call-site namespace for panel legs. See F2.
4. `PANEL_WEIGHTING_UNCONFIGURED` — the recorded reason when an M≥2 deployment has no
   sealed T16 panel rows. See F6, which I would like a reviewer to overturn or ratify.
5. `ACCEPTANCE_CANDIDATE_BAND = "FULL"` in the acceptance test only — mirrors
   `createAcceptanceRuntime`'s `servePolicy.candidateConfidenceBand` so the test can ask
   T16's map what one step down from it is instead of restating the answer. Test file only,
   outside the scanner's consumer directories.

---

## PACKET DEFECTS

**P1 — confirm-item 5 names one mark of a two-mark vocabulary, and no surface for either.**
The packet gives `PANEL-DEGRADED-SINGLE-VOICE` for the all-failed case and "proceed with
parsed voices + visible mark" for the partial case — no name, and no statement of what
"visible" means. Since serve/ui is forbidden to this lane, a mark cannot join the answer's
`condition_marks` where every other visible mark lives. I named the partial mark and put
both on the node's receipt. A packet that names one member of a vocabulary should name the
whole vocabulary and the surface it is visible on.

**P2 — the packet's anchors were correct, and the drift warning paid off.** The packet said
the `1c9578a` anchors (`index.ts:1497-1556, 1641-1716`) would have drifted under T4's edits
and told me to re-locate. They had: the real sites on my tip were `1499-1558` and
`1649-1727`. No defect — recording it because the instruction worked and should be kept.

**P3 — not a defect, a gap the packet could close.** The packet lists the *consumers* to
enumerate but not the *fixtures that pin a call count*. Three of my four blast-radius
repairs were fixtures/pattern-matchers, not consumers (F1, F2). See the self-report.

---

## FINDINGS (worker contract §5 — every one named, none fixed outside contract)

**F1 · BLOCKING-ADJACENT, fixed here as a forced consequence.**
`tools/orphan-audit/src/index.ts` declared the four s04 panel surfaces as never-called /
`UNATTACHED`; wiring made those declarations false. I corrected the four `neverCalled`
entries and the four `s04Surface` evidence lines, and flipped
`tests/architecture/scaffold.test.ts:103-126` to `ATTACHED`. This is the J5/J11
"compiler-forced completion" class — the wiring, not a choice. Note the audit *derives*
`s04Surface` attachment from reachability (so it cannot lie), but **`neverCalled` is
hand-declared with no cross-check against `reachableCallables`** — it rots silently.
**Ticket-worthy in its own right: make `neverCalled` derived, or fail the audit when a
declared-never-called symbol is reachable.**

**F2 · Fixed at the source, not by editing assertions.** My first panel call-site key was
`JUDGE:panel:<parent>:<provider>`, which matches the expansion-leg enumerations
`JUDGE:%:root%:r1:p%` (`acceptance/ceremony.test.ts:511`) and `JUDGE:%:root%:r%`
(`tests/integration/database.test.ts:1824`) — panel legs would have been silently counted
as authoring legs. Root cause: reusing the `JUDGE:` prefix for a call class that is not an
authoring call. Fixed by giving panel legs their own `PANEL:` namespace. I verified no
recorded-fact SQL keys off `JUDGE:%` (`migrations/0049_terminal_recorded_facts.sql` counts
only `COMPOSER:%`, `CONFORMANCE:%`, `POST_COMPOSE_R9:%`).

**F3 · NON-BLOCKING, out of contract, needs a ticket.** Confirm-item 5's "one band step
down" is **recorded, not enforced**: I write the downgraded band into the node's receipt
(`disagreement.certaintyBand`, `certaintyEffect: "DOWNGRADED"`), because applying it to the
served answer is serve work and serve is forbidden to this lane. Whether the serve layer
must consume this is an open question for T5/serve's owner.

**F4 · NON-BLOCKING, needs a ticket.** The repeated-family discount MULTIPLIER branch is
**unreachable on the acceptance path**, because `acceptance/seed-register.ts` gives every
acceptance provider its own family (one provider per maker). Any future claim that the
acceptance ceremony exercises the correlated-error discount arithmetic is false as seeded.
Either seed a two-provider family for the ceremony or state the limit explicitly wherever
the DoD is signed off.

**F5 · NON-BLOCKING, flake family.**
`tests/architecture/obs-l2-s05-import-graph.test.ts > "<entry> uses an unrefed zero-delay
arm ..."` fails under host load: it asserts `spawnSync(...).status === 0` and receives
`null` (signal kill) when the host is saturated. Deserves a family name alongside
F13/F21/F22 so the fleet stops re-litigating it. Evidence in
`logs/t03/probe-obs-l2-isolated.log` (67/67 in isolation).

**F6 · The decision I most want reviewed.** An M≥2 run whose deployment never sealed the
T16 panel rows records `PANEL_WEIGHTING_UNCONFIGURED` on the receipt (with the
degraded mark, and **never** the M=1 skeleton literal) instead of stopping loudly. The loud
stop would match the `scoringOperator` precedent at `apps/runner/src/index.ts:1261`
("multi-maker run + missing ratified row ⇒ typed stop before any model call") and T16's
"a missing row fails loudly" DoD. I did not take it because it would break **8**
pre-existing M≥2 runner fixtures in `tests/integration/database.test.ts` (the sites
carrying `scoringOperator`) that are not mine to rewrite, which is a blast radius out of
proportion to this lane. The behaviour is visible and typed, never a silent self-grade —
but **a reviewer should ratify or overturn it.**

**F7 · NON-BLOCKING, observation.** `acceptance/ceremony.test.ts`'s provider double
classifies requests on a quoted prompt fragment (`'"statement": non-empty string'`) that
the JSON wire body escapes, so the check is dead; only its FIFO index-0 fallback keeps the
test working. A fixed queue masking a broken classifier is a trap for the next lane that
adds a call. Recorded in `.hermes/TOOLING-TRAPS.md`.

---

## WHAT WAS BUILT

- `packages/judgement/src/index.ts` — **`Judge.assess`**, the node-local panel leg.
  Deliberately not `Judge.review` (S4-1 boundary honoured: **the review call site is
  untouched**). A member returns the same scored assessment the author produced about
  itself, so `measureDispersion` compares like with like. Every failure raises a typed
  `PanelMemberFailure` (`TIMEOUT` / `PROVIDER_ERROR` / `PARSE_FAILURE` / `SCHEMA_FAILURE`).
- `apps/runner/src/index.ts` — **`runNodePanel`**, wired into **both** judgement sites.
  The author is passed to `runJudgePanel` as a member so the FX-HR-H6 producer bulkhead is
  exercised by the code that owns it and leaves a recorded note, rather than being
  pre-filtered away. Chain: `runJudgePanel` → per-member `reduceAssessment` (same ratified
  composition, so taus are commensurable) → `measureDispersion` →
  `applyCorrelatedErrorDiscount` → `selectReducedJudgement` → `applyDeclaredDisagreement`.
  M=1 keeps the skeleton path and literal.
- `acceptance/main.ts` — boot reads `readPanelWeightingControls` +
  `readVerdictLabelControls` and hands the runner a whole `panelPolicy`. (The disagreement
  threshold is sealed in the *verdict-label* family, not the panel-weighting family — the
  join is easy to get wrong; see the self-report's suggestion for a single reader.)
- `acceptance/ceremony.test.ts` — its double answers the new panel leg **from the
  contract**, leaving every scripted queue position byte-stable.

---

## COMMITS

Branch `lane/t3`, local only. **Not pushed, not merged.**

```
f2c76d0  T3: wire the judge panel into reduce/select — author != judge (S2-2)
7bf9193  T3: record three tooling traps from the panel lane (worker contract §6)
```

Diff vs base `5868a38` across both commits: **9 files, +1155 / −40**. No migration touched.
Working tree clean (`git status --porcelain` empty) after the final mutant restore.

---

## SELF-REPORT

Filed before this marker at
`.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t03-panel-self.md` (`## r1`).

---

> **r1 marker (SUPERSEDED by r2 below — kept as the round-1 record):**
> `READY FOR PEER REVIEW — T3 r1 · comments read through: packet-t03-2026-09-01`
> `report sha256: 78ec0f7551b84a52c73d436fd5b7bfddf0e2bcf3c7e31ae4470f630a566a67ae`
> That hash covered the file as frozen at r1; this file now carries the r2 round below,
> so the live hash is the r2 one at the very end.

---

# T3 PANEL r2

Rework round **1 of 3**, against codex r1 (`T3-codex-r1.md`) and ruling **J12**.
Base unchanged: **`5868a38`**. Branch `lane/t3`, local only — never pushed, never merged.
Comments read through: `t03-codex-r1-2026-09-01`.

**Verdict on the review: every finding verified and accepted.** I checked each against the
tree before implementing; none required pushback. B1-B3 are J12's content, B4 answers the
open question I filed as F4 in r1, B5 names an arm I genuinely had not tested.

## DISPOSITION

| # | Finding | Disposition |
|---|---|---|
| B1 | J12 loud stop not implemented | **FIXED** — RED first, then GREEN |
| B2 | 8 M≥2 fixtures not panel-seeded | **FIXED** — one shared-factory edit + double + 2 ceilings; **1 disclosed deviation** |
| B3 | paired base↔HEAD database payload absent | **FILED** — both sides below; signature unchanged |
| B4 | acceptance receipt never reaches the multiplier | **FIXED** — M=3 same-family fixture; RED via mutant |
| B5 | partial-panel mark untested | **FIXED** — same fixture; RED via mutant |
| N1 | packet mark/surface defect (orchestrator's) | acknowledged; `PANEL-PARTIAL` + receipt surface still awaiting ratification |
| N2 | packet path ellipsis (orchestrator's) | acknowledged; my paths were correctly inferred |
| N3 | obs-capture flake needs a family row | **boarded as F31** — referenced in FAILURE CLASSIFICATION |
| N4 | ceremony double's dead classifier | **FIXED** — in *both* doubles |
| N5 | registration RSS flip extends F22 | **boarded** — referenced in FAILURE CLASSIFICATION |

## B1 — the J12 loud stop

**RED** (`logs/t03/b1-RED-loud-stop.log`), before any production change:

```
npx vitest run tests/integration/database.test.ts -t "J12"
```

```
 × ... > J12 — refuses unsealed panel weighting on a multi-maker run before claiming or spending
   → expected ProviderCallFailedError: PROVIDER_CALL_FA… { …(4) } to match object { code: 'PANEL_WEIGHTING_UNRESOLVED' }
      Tests  1 failed | 1 passed | 61 skipped (63)
```

The RED frame is the finding itself: instead of a typed stop the run reached a **real
provider call** — the missing row had already become model spend. That is precisely the
silent-degradation shape J12 repeals.

**GREEN** (`logs/t03/b1-GREEN-loud-stop.log`): `2 passed | 61 skipped`.

The guard sits beside the `scoringOperator` precedent it follows
(`apps/runner/src/index.ts`, immediately after `SCORING_OPERATOR_UNRESOLVED`), keyed on
`#configuredMakers.length > 1` — the same predicate, evaluated **before the work item is
claimed and before any model call**. The test pins all three properties: the typed code,
`work_item` still `{ state: "READY", claimed_by: null }`, and `calls() === 0` on **both**
provider doubles.

The repealed `PANEL_WEIGHTING_UNCONFIGURED` recorded-and-proceed branch is **gone**. What
remains at the panel is an unreachable typed throw, so the condition cannot re-acquire a
proceeding shape by a later edit.

**A second test pins the other side of the boundary:** `J12 — leaves a single-maker run
free of any panel-weighting requirement` asserts a mono-maker run does **not** stop on
panel weighting. Without it the guard could be widened to all runs and no test would fail.

## B2 — the eight M≥2 fixtures, coherently seeded

All eight `scoringOperator`-bearing fixtures take their settings from **one shared
factory**, `runnerSettings()`, so the seeding is a **single edit** — J12's coherence
consequence at minimum cost. The band map is stated over *that fixture's own* band
vocabulary (`TEST_TOP_BAND` → `TEST_CAPPED_BAND`), not the deployment's.

Seeding alone was not sufficient — three further coherence effects, each disclosed:

1. **The shared provider double now answers PANEL legs from the contract**, never
   consuming `pending`. Every fixture's scripted queue keeps its exact positions. The
   default panel answer scores fidelity 0 (tau 0); selection is strictly greater-than, so
   a panel voice can never displace an author's and **no fixture's tau moves**.
2. **Two pinned envelopes move** (provisioning, not assertions): `hyg-01-depth-2-two-maker`
   32 → 48, because its envelope is deliberately "exactly filled" and each of its 16 nodes
   now also draws one panel leg (16+16+16); the three-maker rotation 30 → 60, where the
   envelope is not the subject.
3. **ONE DISCLOSED DEVIATION from "assertions unchanged" — the only one in the file.**
   `hyg-01-depth-2-two-maker` asserts per-provider **call counts** `16/16`; these become
   `24/24`. This is arithmetic, not a choice: across 16 nodes split 8/8, each maker serves
   its 16 original legs plus 8 panel assessments of the *other* maker's nodes. A new lawful
   call class necessarily moves a per-provider call count. **The fixture's subject is
   untouched** — still 16 nodes, still the real envelope-terminal path, still the
   single-root disclosure, all still asserted. The derivation is in a comment at the
   assertion. **This needs ratification.** The alternative — relaxing the pin to
   `toBeGreaterThanOrEqual` — would have destroyed a real assertion to avoid the
   conversation, and I did not take it.

## B3 — the paired base↔HEAD database payload

Same command both sides: `npx vitest run tests/integration/database.test.ts`.

| | BASE `5868a38` | HEAD (r2) |
|---|---|---|
| Result | **60/61** passed · 1 failed | **63/64** passed · 1 failed |
| Failing test | `claims, judges through the HTTP gateway, propagates, serves, and settles` | **same test** |
| Signature | `AssertionError: expected { …(36) } to match object { staleness_state: 'ARCHIVED_REVIVED' }` | **byte-identical** |
| Location | `database.test.ts:2804:23` | `database.test.ts:3101:23` |
| Log | `logs/t03/b3-database-BASE-5868a38.log` | `logs/t03/r2-clusterC-run1.log` |

**Failure-signature delta: NONE.** Same test, same assertion, same expected object. The
line moved +297 purely because my three new tests sit above it; the total moved 61 → 64 for
the same reason (2 × J12 + 1 × B4/B5). The pre-existing cause is **unchanged, not
absorbed** — this is the file's one member of the 23-row stable-red set, and it is still
failing for exactly the reason it failed before I touched it.

## B4 + B5 — one M=3 fixture, both arms

`tests/integration/database.test.ts` › `B4/B5 — discounts a repeated provider family and
marks a partial panel (M=3)`. Real database, real runner, real persisted receipt.

Topology: makers **A and B share one sealed provider family**; C stands alone. Two provider
refs in one family is a lawful deployment — the register's map groups by maker, and two
endpoints of one maker is ordinary — so this needed **no production change and no live
provider**, exactly as the reviewer said.

On the node A authors: B assesses successfully (second appearance of the shared family →
ordinal 2 → discounted), C answers in prose (typed `PARSE_FAILURE` → the panel proceeds on
the voices that parsed → `PANEL-PARTIAL`).

**The discount is decisive, not merely recorded.** B scores a *higher* tau than A (0.9 vs
0.5). Undiscounted, B wins selection outright. Discounted, B scores 0.9 × 0.5 = 0.45 and
A's 0.5 survives — so asserting the selected tau is an assertion about the multiplier
arithmetic itself.

**RED for both, by mutant** (the production code shipped in r1, so the honest RED is the
mutant these assertions exist to catch):

- **B4** (`logs/t03/b4-RED-multiplier-mutant.log`) — bypass the multiplier in
  `applyCorrelatedErrorDiscount` (`effectiveWeight: judgement.earnedWeight` always):
  `→ expected 1 to be 0.5`. Restored → GREEN.
- **B5** (`logs/t03/b5-RED-partial-mark-mutant.log`) — delete the runner's
  `PANEL_PARTIAL_MARK` line: `→ expected [] to include 'PANEL-PARTIAL'`. Restored → GREEN.

Both restores verified with `git status --porcelain`; the mutated file was absent each
time. The fixture also pins **author ≠ judge on this very node**: the panel's notes carry
A's own `PRODUCER_GRADING_FORBIDDEN` refusal alongside C's parse failure, and the note
count is pinned at exactly 2.

**F4 from r1 is now CLOSED, and my r1 framing was too generous to itself.** I filed "the
multiplier branch is unreachable on the acceptance path" as an honesty note; the reviewer
correctly asked whether the limit was real or merely the seeded map. It was the map. The
multiplier is now proven live on a real-database, real-runner receipt.

## N4 — the dead classifier, fixed in both doubles

The JUDGE discriminator `body.includes("\"statement\": non-empty string")` can never match:
the packet reaches the wire JSON-encoded, so the quotes arrive escaped. Both
`acceptance/ceremony.test.ts` and `tests/integration/database.test.ts` now key on the
escape-safe `restatement_text` (and `conforms,findings` / `served_number_refs`).

Ceremony additionally **stops guessing across classes**: a recognised request with no
scripted response of its own class now refuses by name
(`PROVIDER_DOUBLE_UNSCRIPTED_CLASS`) instead of serving whatever sits at the head of the
queue. I deliberately did **not** remove the FIFO fallback for `GENERAL` requests — health
probes legitimately use it, and the cross-class guess was the actual defect. Evidence the
fallback was masking rather than load-bearing: all 3 ceremony/mono/panel fixtures and all
64 database fixtures stay green with the guess removed.

## SUITES (r2)

- **Root typecheck** — `pnpm run typecheck` (`tsc --noEmit`): **exit 0**, clean.
- **Cluster A (zone: `tests/unit` + `tests/architecture`) ×3** — **1233/1246** all three
  runs · 13 failed · **SET-IDENTICAL across all three**, and the 13-name set is
  **identical to r1's**, so r2 introduced no zone regression.
  Logs `r2-clusterA-run{1,2,3}.log`.
- **Cluster B (acceptance: `panel-multi-maker`, `ceremony`, `mono-panel`) ×3** — **5/5**
  all three runs, empty failure set. Logs `r2-clusterB-run{1,2,3}.log`.
- **Cluster C (`tests/integration/database.test.ts`) ×3 — new in r2** — **63/64** all
  three runs · 1 failed · **SET-IDENTICAL across all three**, that one being the
  pre-existing `staleness_state` failure paired against base in B3.
  Logs `r2-clusterC-run{1,2,3}.log`.
- **Full suite** — `D15-DEFERRED / CANNOT-ASSESS — judge-run on integration post-merge`.
  Host load was 11.9–23.8 across r2; per D13 as amended by D15 the authoritative run is
  the judge-stage run on integration.
- **D16 gate — my diff still does NOT touch `packages/contract` or `packages/kernel`, so
  D16 does not gate this lane.** Re-verified at r2 HEAD:
  `git diff --name-only 5868a38 HEAD | grep -E "packages/(contract|kernel)/"` → no match.
  No migration touched. Ten files, **+1496 / −53**.

### FAILURE CLASSIFICATION (r2)

- Cluster A: the same **13** stable-red as r1, name-for-name — all present in my D12 base
  run at `5868a38`. **Zero new failures.**
- Cluster C: **1** stable-red, paired against base in B3 with an unchanged signature.
- **N3 → board F31** (new family row): the obs-capture signal-kill flake
  (`obs-l2-s05-import-graph.test.ts` › `runner uses an unrefed zero-delay arm …`,
  `spawnSync.status === null` under saturation). Did **not** recur in any of r2's nine
  cluster runs. Referenced, not absorbed.
- **N5 → F22 membership extended** to `tests/unit/registration.test.ts` › `S3c B4 … RSS
  curve …` (the S3c RSS instance, distinct from F22's existing S3b separation-ceiling
  member). Red in my base run, green in all six post-change zone runs across r1 and r2.
  Referenced, not absorbed.

## OPEN FOR RATIFICATION

1. **The `16/16` → `24/24` call-count deviation** in `hyg-01-depth-2-two-maker` (B2.3) —
   the one place J12's "assertions unchanged" could not hold, with the arithmetic shown.
2. **N1 is still open**: `PANEL-PARTIAL` as the vocabulary member and the node's
   `disagreement` receipt as the visibility surface remain **my choices**, now load-bearing
   in a shipped test. They need ratification or replacement by ruling.
3. **F30 (r1 F3) unchanged**: the band step-down is recorded, not enforced; serve-side
   consumption is T12's.

## COMMITS (r2)

```
4476fe8  T3 r2: J12 loud stop, panel-seeded fixtures, repeated-family + partial-panel proofs
7a573ef  T3 r2: two more tooling traps (fixture species, cross-class double guessing)
```

on top of r1's `f2c76d0`, `7bf9193`. Local only — not pushed, not merged.

## SELF-REPORT

`## r2` filed before this marker at `agent-reports/t03-panel-self.md`.

---

> **r2 marker (SUPERSEDED by r3 below — kept as the round-2 record):**
> `REWORK READY FOR REVIEW — T3 r2 · comments read through: t03-codex-r1-2026-09-01`
> `report sha256: 999308851d38c3f04e3f4ad523496a8ed8caac68d59a5bc7094986b095c5aabc`

---

# T3 PANEL r3

Rework round **2 of 3 — the last authorized round**, against codex r2 (`T3-codex-r2.md`)
and ruling **J13(b)**. One blocking finding: **B6**. Base unchanged: **`5868a38`**.
Branch `lane/t3`, local only — never pushed, never merged.
Comments read through: `t03-codex-r2-2026-09-01`.

**Verdict on the review: B6 verified and accepted in full.** It is the same defect class
T4 was corrected for, and the reviewer is right that my r2 shipped a *facsimile* of a
disclosure: `PANEL-PARTIAL` lived only as a runner-local constant written into untyped
ledger JSON, and my own test asserted against that same untyped JSON. The canonical parser
would have **rejected** the disclosure J13(b) ratified. No pushback on any point.

## B6 — the canonical mint

### RED (two frames, both before any fix)

**Frame 1 — the vocabulary rejects it** (`logs/t03/b6-RED-vocabulary.log`):

```
npx vitest run tests/unit/t03-judge-panel.test.ts
```

```
 × J13(b) — … > admits both panel disclosure marks through the kernel vocabulary and the contract schema
   → expected [ 'UNINSTRUMENTED', …(28) ] to include 'PANEL-PARTIAL'
      Tests  1 failed | 11 passed (12)
```

**Frame 2 — the canonical projection cannot carry it**
(`logs/t03/b6-RED-projection.log`), the production seam:

```
npx vitest run tests/integration/database.test.ts -t "B4/B5"
```

```
 × B4/B5 — discounts a repeated provider family and marks a partial panel (M=3)
   → expected [ 'UNSERVED-MAKER-POSITION' ] to deeply equal ArrayContaining ["PANEL-PARTIAL"]
```

The same run produced a **compile-level RED** that states the finding more sharply than
either assertion — the projection's mark type had *no overlap* with the value:

```
tests/integration/database.test.ts(2963,27): error TS2367: This comparison appears to be
unintentional because the types '"AMBIGUOUS_ATTRIBUTION" | … | "WAY-OF-KNOWING-DOWNGRADED"'
and '"PANEL-PARTIAL"' have no overlap.
```

### GREEN

- `logs/t03/b6-GREEN-vocabulary.log` — **12/12**.
- `logs/t03/b6-GREEN-projection.log` — the M=3 fixture **passes**, now consuming the mark
  through `ServeRepository.readAnswerProjection`.
- `logs/t03/b6-vocabulary-consumers.log` — **60/60** across the three vocabulary-size
  consumers plus my own suite.

### The five required steps, each with its evidence

| # | Step | Where | Evidence |
|---|---|---|---|
| 1 | kernel vocabulary, **mid-list** | `packages/kernel/src/index.ts`, after `CRITIQUE-UNAVAILABLE` | tail test below |
| 2 | contract schema admits it | `ConditionMarkSchema = z.enum(CONDITION_MARKS)` | `ConditionMarkSchema.parse("PANEL-PARTIAL")` asserted |
| 3 | serve condition-record union names it | `packages/serve/src/index.ts` `ConditionMarkRecord.mark` | compiles; projection emits it |
| 4 | runner projects it onto the node | `apps/runner/src/index.ts` | node-scope record, `affected_node_ids` asserted |
| 5 | the M=3 test consumes it through the canonical projection | `tests/integration/database.test.ts` | GREEN above |

**DR-176 positional tail — re-verified as instructed.** Both marks are inserted **mid-list**
beside the other panel/lineage degradations, never appended. The tail is read positionally
by `CONDITION_MARKS.slice(-4)` in three places — `tests/unit/t4-way-of-knowing.test.ts:165`,
`tests/unit/dr174-resilience.test.ts:231`, and the runner's required-record gate. A new
test in my own suite re-pins it:

```
expect(kernel.CONDITION_MARKS.slice(-4)).toEqual([
  "HIDDEN-UNJUDGEABLE", "DERIVED-STANDING-UNREVIEWED", "HIDDEN-LOW-SCORE", "UNAUTHORED-BRANCH-HALTED"
]);
```

**`generate:contract` re-run; generated output did NOT shift** — `packages/contract/generated/client.ts`
is a re-export shim, so a pure enum-member addition leaves it byte-identical
(`git diff --quiet packages/contract/generated/` clean). Re-running it was still the right
check; expecting a diff would have been wrong.

**The marks are returned TYPED from `runNodePanel`**, not re-read out of the receipt JSON.
Sourcing a projection from untyped JSON would repeat the very facsimile pattern this mint
exists to end. Both judgement producers (root and child) bind them to the node the graph
minted — the same discipline `bindWayOfKnowingDowngrade` follows — and each degraded panel
emits one node-scope `ConditionMarkRecord` whose `reason` names **which** members failed
and how (e.g. `Family maker C: PARSE_FAILURE`), with a `liftPath` that differs for the
partial and all-failed arms.

### One addition beyond the letter of B6, and why it is not gold-plating

B6 names `PANEL-PARTIAL`. I minted **`PANEL-DEGRADED-SINGLE-VOICE` with it**, because the
same projection carries both: minting only the ratified one would leave the all-failed arm
**rejected at the parser** — the identical defect, one branch over, waiting for whoever
next ran a fully degraded panel. The test for whether an unasked change belongs in a fix:
*does leaving it out re-create the reported defect in a neighbouring branch?* Here, yes.

### Forced completions this mint caused (J5/J11 class), all disclosed

1. **Two exhaustive UI switches** — `apps/ui/lib/v3/labels.ts` and
   `web/lib/v3Presentation.ts`. These fail typecheck **by design** when the vocabulary
   grows ("a new mark fails typecheck here, never silently renders unnamed"). One label
   line each; nothing else touched.
2. **Three hand-written vocabulary-size pins**, 29 → 31 — `tests/unit/s14-ui.test.ts:116`,
   `tests/unit/dr174-resilience.test.ts:200`,
   `tests/unit/obs-l2-s02-registry.test.ts:415`. Updating a count pin is the forced
   completion, **not** a weakening: the DR-176 tail is unchanged (asserted), the
   obs-capture severity map *derives* itself from `CONDITION_MARKS`, and the s14 test
   still asserts **both** renderers label every member non-empty — which is what proves my
   two label lines are real.

These three surfaced as **+3 zone failures on the first r3 cluster run** (16 failed), were
root-caused as vocabulary-size pins rather than behaviour, fixed, and the clusters re-run
from clean. The stale first-pass logs were discarded, not reported.

## SUITES (r3)

- **Root typecheck** — `pnpm run typecheck` (`tsc --noEmit`): **exit 0**
  (`logs/t03/r3-root-typecheck.log`).
- **Cluster A (zone: `tests/unit` + `tests/architecture`) ×3** — **1235/1248** all three
  runs · 13 failed · **SET-IDENTICAL across all three**, and the 13-name set is
  **identical to r2's and r1's**. Total rose 1246 → 1248: exactly my two new vocabulary
  tests. **Zero new failures.** Logs `r3-clusterA-run{1,2,3}.log`.
- **Cluster B (acceptance) ×3** — **5/5** all three runs, empty failure set.
  Logs `r3-clusterB-run{1,2,3}.log`.
- **Cluster C (`tests/integration/database.test.ts`) ×3** — **63/64** all three runs ·
  1 failed · **SET-IDENTICAL**, that one being the pre-existing `staleness_state` failure
  paired against base in r2's B3 (signature unchanged since).
  Logs `r3-clusterC-run{1,2,3}.log`.
- **Full suite** — `D15-DEFERRED / CANNOT-ASSESS — judge-run on integration post-merge`.
  Host load 10.6–27.2 across r3; per D13 as amended by D15 the authoritative run is the
  judge-stage run on integration.

### D16 / D14 GATE — **now REQUIRED, and the r2 scope statement is RETRACTED**

r2 said "my diff does not touch `packages/contract` or `packages/kernel`, so D16 does not
gate". **That is no longer true**: this round edits `packages/kernel/src/index.ts`, which
is a D16 type producer. Recomputed at r3 HEAD:

```
git diff --name-only 5868a38 HEAD | grep -E "packages/(contract|kernel)/"
  → dialectical-engine/packages/kernel/src/index.ts        TOUCHED — D16 GATES REQUIRED
```

Both surface gates run, with base classification:

| Gate | BASE `5868a38` | HEAD (r3) | Delta |
|---|---|---|---|
| `tsc --noEmit -p apps/ui/tsconfig.json` | 1 error · `TS2882` `globals.css` side-effect import in `apps/ui/app/layout.tsx` | **1 error · identical** | **0** |
| `tsc --noEmit -p web/tsconfig.json` | 1 error · `TS2882` `globals.css` side-effect import in `web/app/layout.tsx` | **1 error · identical** | **0** |

Logs: `d16-apps-ui-BASE.log`, `d16-apps-ui.log`, `d16-web-BASE.log`, `d16-web.log`.

**Classification: both TS2882s are PRE-EXISTING and unrelated to this diff** — measured at
base on this host, not assumed. They are the known Next `.next/types` shim absence already
recorded in `.hermes/TOOLING-TRAPS.md` (T2's entry names the `web/` instance; the
`apps/ui` instance is the same cause, now measured too). **My kernel/contract touch adds
zero errors to either Next surface** — the two exhaustive label switches were the only
consumers it forced, and both are fixed.

### FAILURE CLASSIFICATION (r3)

- Cluster A: the same **13** stable-red, name-for-name identical to r1 and r2, all present
  in my D12 base run at `5868a38`. **Zero new failures.**
- Cluster C: **1** stable-red, signature unchanged since the r2 B3 pairing.
- **F31** (N3, boarded): the obs-capture signal-kill flake did **not** recur in any of
  r3's nine cluster runs.
- **F22 membership** (N5, boarded): the S3c registration RSS instance did **not** recur.

## STILL OPEN (unchanged by r3)

- **F30 / r1 F3** — the band step-down is recorded, not enforced on the served answer;
  serve-side consumption remains T12's. Note that r3 *does* now carry the panel
  degradations onto the answer's canonical `condition_marks` and per-node records, so the
  disclosure is visible; the band arithmetic itself is still receipt-only.
- **r2's J13(a) call-count coherence** (16/16 → 24/24) stands as ratified.

## COMMITS (r3)

```
4b743cc  T3 r3: mint PANEL-PARTIAL canonically and project it (codex r2 B6 / J13(b))
eb90d68  T3 r3: complete the vocabulary-growth consumers (three count pins, J5/J11 class)
d8586db  T3 r3: record the closed-vocabulary chain and the expiring-scope-claim traps
```

on top of `f2c76d0`, `7bf9193` (r1) and `4476fe8`, `7a573ef` (r2).
Diff vs base across all rounds: **17 files, +1662 / −58**. No migration touched.
Working tree clean at the marker.

## SELF-REPORT

`## r3` filed before this marker at `agent-reports/t03-panel-self.md`.

---

REWORK READY FOR REVIEW — T3 r3 · comments read through: t03-codex-r2-2026-09-01
report sha256: 4f40925ffd9cb54a152fd2cc946927b1d9de9bd9d6909ea3f6136eee7b5126b3
