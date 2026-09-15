READY FOR PEER REVIEW — S06 r4b (merge repairs; rework 2/3) · comments read through: s06-codex-merge-2026-09-02
report sha256: 0b995b7f24469ac5e4e7b7ca98ded6432dece2d8a310b79df93a75e3684568d0
# S06 — T10 winner selection + T11 three-state label

`SKILLS LOADED: heartbeat, heartbeat-worker, superpowers:using-superpowers, superpowers:test-driven-development, superpowers:verification-before-completion`

Lane `lane/s06` @ `3665302a` off `7433be7`. Three commits, never pushed, never merged.
`git diff --summary 7433be7..HEAD | grep -c "mode change"` → **0**.

---

## 1. What the lane does

### T10 — propagation picks the served root (goal 188-195; S6-1, S6-3)

`SERVED_ROOT_RULE` and `selectServedRoot` are **deleted**. In their place
`selectServedRootByStrength(servableRoots, propagation.strengths)`
(`apps/runner/src/index.ts:1155-1200`) serves the **maximum propagated strength**
among the servable maker roots. Reordering the configured providers cannot change
the answer.

* **Tiebreak**: lexicographic node id on **code units** (`<` / `>`), never
  `localeCompare` — locale collation is host-dependent, and a tiebreak that
  changes with the host is not the deterministic tiebreak the goal asks for. The
  reason is a comment at the comparator.
* **Margin**: the gap to the **runner-up** — the second-highest root under the same
  total order, never the next configured one. A single servable root has **no**
  runner-up, so its margin is `{ kind: "ABSENT", reason: "SINGLE_SERVABLE_ROOT" }`.
  T11 rung 0 reads exactly that.
* **Loud stops**: no servable root → `SERVED_ROOT_UNRESOLVED`; a servable root with
  no propagated strength → `SERVED_ROOT_STRENGTH_UNRESOLVED`. Never a default.
* **The receipt**: `ledger.propagation_run.served_root_selection` (new nullable
  jsonb) carries rule, served node + strength, runner-up, margin (or its ABSENT
  reason), tiebreak, candidate count, and the label those same numbers produced.
  This is the row that already records the judgement selection rule and the
  operator supplying level — the codebase's own "receipt" (`runner:2426`).
  NULL on the DR-184 catch-up path, which re-propagates without re-selecting.

**The new rule string** (my design decision, unreviewed — packet said "design and
document it"): `max-propagated-strength-lexicographic-tiebreak`. It states the
whole rule, including the tiebreak, in the string it records. Minted **once**, in
`packages/kernel` beside the other closed vocabularies, because the same string is
a typed record field (serve), a wire literal (contract) and a DDL CHECK member
(migration) — one declaration, every representation imports it.

### T11 — the three-state label from code (goal 196-221; S7-1, S6-1, confirm-items 3/4/6)

`deriveHonestVerdict`'s binary `usableBasis → SUPPORTED` is replaced. The label is
`deriveVerdictLabel` (`packages/serve/src/index.ts:735-800`), the ordered, total,
disjoint ladder over the **runtime** domain:

| rung | guard | label | trigger |
|---|---|---|---|
| 0 | margin ABSENT **or** disagreement ABSENT | CONTESTED + `LABEL-BASIS-INCOMPLETE` | `BASIS_INCOMPLETE` |
| 1 | winner < low cut | UNSUPPORTED | `BELOW_LOW_CUT` |
| 2 | margin ≤ γ **or** disagreement ≥ threshold | CONTESTED | `MARGIN_WITHIN_GAMMA` / `DISAGREEMENT_AT_THRESHOLD` |
| 3 | winner ≥ high cut | SUPPORTED | `AT_OR_ABOVE_HIGH_CUT` |
| 4 | otherwise (mid band) | CONTESTED | `MID_BAND` |

* **Disagreement is the NAMED quantity**: the recorded panel dispersion of the
  **winning root's** reduced judgement (T3's `dispersion`), carried on the authored
  node (`panelDispersion`) so it is read from the node that earned it. `null` is
  s04's ABSENT case (`FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS`), a runtime value the
  ladder reads — never a zero it can compare.
* **Computed BEFORE synthesis**, immediately after selection and before
  composition, from the propagated numbers only. Nothing consults the round-3
  objection (confirm-item 3 default NO; the derivation stays acyclic).
* **NaN is invalid, not absent**: `VERDICT_LABEL_INPUT_INVALID`. Unordered cuts:
  `VERDICT_LABEL_CONTROLS_INVALID`.
* **No code constant**: γ, both cuts and the threshold are read from T16's sealed
  rows via the new `verdictLabelPolicy` runner setting; a deployment that never
  sealed the family stops with `VERDICT_LABEL_CONTROLS_UNRESOLVED` **before any
  answer is written**. Grep-proof: `logs/s06/register-grep-proof.log` — no product
  file this lane touched carries 0.05 / 0.7 / 0.35 / 0.25, and the lane does not
  touch `packages/register` at all (0 files).
* **The mark and the label are ONE decision.** The runner attaches
  `LABEL-BASIS-INCOMPLETE` (+ a typed record naming which limb was absent) exactly
  when the derivation says the basis was incomplete AND the answer carries a
  label; `ServeRepository.persist` re-derives from the same pure function and
  refuses the write with `LABEL_BASIS_DISCLOSURE_MISMATCH` if the two disagree.
* **UI (confirm-item 4, vocabulary wiring only)**: `liveVerdictState` in
  `apps/ui/lib/v3/labels.ts` — SUPPORTED→endorsed, CONTESTED→endorsed_with_caveat,
  UNSUPPORTED→suppressed_no_evidence. Exhaustive switch; a fourth state fails
  typecheck rather than rendering unnamed. No banner, band or copy changed.

### The mark mint (J5/J11 class)

`LABEL-BASIS-INCOMPLETE` joins `CONDITION_MARKS` **mid-list** (after
`MISSING-NUMBER`), so the DR-176 positional tail `slice(-4)` is unchanged —
asserted directly. Contract enum follows automatically; serve's record union and
`REQUIRED_CONDITION_MARK_RECORDS` gain the member; one compiler-forced label line
each in `apps/ui/lib/v3/labels.ts` and `web/lib/v3Presentation.ts` (J5/J11
authorise exactly that one line in `web/`, and the diff is exactly one line).

### Migration 0055

1. Replaces 0018's one-member CHECK on `serve.condition_mark.served_root_rule`
   with a **`NOT VALID`** constraint admitting only the live rule. `NOT VALID` is
   the whole mechanism: rows already sealed under the retired rule keep saying so
   (history is never rewritten), while every new INSERT/UPDATE is refused. The
   migration's own comment forbids a future `VALIDATE CONSTRAINT`.
2. Adds `ledger.propagation_run.served_root_selection jsonb`.

Numbered **0055** deliberately: 0053 is claimed by lane t6 and 0054 by lane tint1,
both in flight and invisible from integration.

---

## 2. The class sweep (packet: "ENUMERATE THE CLASS FIRST")

Every reference to `SERVED_ROOT_RULE` / `servedRootRule` / `selectServedRoot` /
`served_root_rule` at `7433be7`, and its disposition:

| # | site | disposition |
|---|---|---|
| 1 | `apps/runner/src/index.ts:1100` `SERVED_ROOT_RULE` | **deleted** |
| 2 | `apps/runner/src/index.ts:1103-1110` `selectServedRoot` | **deleted**, replaced by `selectServedRootByStrength` |
| 3 | `apps/runner/src/index.ts:1233` record field | now `SERVED_ROOT_SELECTION_RULE` |
| 4 | `apps/runner/src/index.ts:1229` reason prose ("The first post-exclusion configured maker root…") | rewritten to "The strongest post-exclusion maker root…" |
| 5 | `apps/runner/src/index.ts:2475` call site | now strength-based |
| 6 | `apps/runner/src/index.ts:843` catch-up read-back | unchanged (reads whatever was sealed) |
| 7 | `apps/runner/src/index.ts` ×16 `servedRootRule: null` records | unchanged (honestly null) |
| 8 | `packages/serve/src/index.ts:815` `ConditionMarkRecord.servedRootRule` | now `ServedRootRule` |
| 9 | `packages/serve/src/index.ts:1544` read-projection literal | now `ServedRootRule` |
| 10 | `packages/serve/src/index.ts:1166,1555,1620` column name / SELECT / projection | unchanged (column name is stable) |
| 11 | `packages/contract/src/index.ts:509` `z.literal(...)` | now `z.literal(SERVED_ROOT_SELECTION_RULE)` |
| 12 | `migrations/0018_panel01_rework.sql:5-6` CHECK | superseded by 0055 (0018 untouched — append-only history) |
| 13 | `acceptance/ceremony.test.ts:479,485` | rewritten: the served root is derived from the run's own strengths, both rule tokens excluded from human prose |
| 14 | `tests/unit/serve-s05.test.ts:289,302,318,324,326` | migrated to the live rule |
| 15 | `tests/integration/database.test.ts:2030,2284` | 2030 migrated; 2284 is a column read, unchanged |
| 16 | `tests/unit/dr174-resilience.test.ts`, `ui-census`, `v2uiFixtures`, `dr184-judged-standing` | `null` values, unchanged |
| 17 | `docs/missions/2026-08-06-v3-programming/**` (14 files) | historical review records — **not shipped source, deliberately untouched** |

The repo-wide invariant is now a test: `tests/architecture/t10-first-configured-provider-removed.test.ts`
scans all shipped source (packages, apps, tools, acceptance, web) for the retired
token, the retired constant and the retired selector, and pins the migration set
that may still name the retired rule to exactly {0018, 0055}.

---

## 3. RED before GREEN — three levels, every one filed

RED-before-GREEN was satisfied at three levels for T10 and two for T11. The
run-level RED was produced by reverting **product code only** to `7433be7` while
keeping the new tests (TOOLING-TRAPS recipe), running, then restoring; restoration
was proven byte-identical with `diff -q work.patch <(git diff)`.

| item | RED (verbatim headline) | RED log | GREEN log |
|---|---|---|---|
| T10 pure seam | `TypeError: selectServedRootByStrength is not a function` — 10 failed / 10 | `logs/s06/t10-RED-unit.log` | `logs/s06/t10-GREEN.log` |
| T10 repo-wide | `expected [] to deeply equal [ "first-configured-provider @ packages/contract/src/index.ts", … ]` — 4 failed / 4 | `logs/s06/t10-RED-architecture.log` | `logs/s06/t10-GREEN.log` |
| T10 run level | served `b9e0687a…` (first-configured, weaker) under `served_root_rule: "first-configured-provider"`; test expected `73c86538…` (strongest) under the live rule | `logs/s06/seam-RED-on-base.log` | `logs/s06/seam-GREEN.log` |
| T11 near-tie (the DoD's own RED) | `AssertionError: expected 'SUPPORTED' to be 'CONTESTED'` — 18 failed / 18 | `logs/s06/t11-RED-unit.log` | `logs/s06/t11-GREEN.log` |
| T11 property (cube + absent arms) | `deriveVerdictLabel is not a function` inside the property sweep | `logs/s06/t11-RED-unit.log` | `logs/s06/property-GREEN.log` |
| production seam (mono-maker) | `AssertionError: expected 'SUPPORTED' to be 'CONTESTED'` on the served answer's `verdict_state` | `logs/s06/seam-RED-on-base.log` | `logs/s06/seam-GREEN.log` |

No assertion was ever flipped: every test above asserts the desired behaviour from
the first line it was written.

**The property test** (`tests/unit/t11-verdict-label.test.ts`) sweeps
14 winners × 15 margins × 15 disagreements = **3 150 points**, where the margin and
disagreement axes each carry the ABSENT arm plus a 14-point grid straddling every
cut. At every point it asserts (a) the label is one of the three states, (b) the
rung the implementation reports equals the first true guard under an **oracle
written from the SPEC text, not from the code**, (c) every earlier rung's guard is
false — disjointness, not merely order, and (d) the mark rides rung 0 and only
rung 0. The sweep is proven non-vacuous: all five rungs and all three labels are
reached.

---

## 4. Refutation (worker contract §2, D24 shape)

Full transcripts — applied diff, token grep, discriminating result, restore
command, post-restore grep 0, file sha256 on **both** sides, porcelain — in
`logs/s06/refutation-d24.log`. Tree clean between every block.

| id | mutation | expect | result |
|---|---|---|---|
| M1 | winner reverts to the first-configured root | CAUGHT | 5 failed / 10 |
| M2′ | lexicographic tiebreak → marked constant 0 | CAUGHT | 1 failed / 10 |
| M3 | single-root margin → `MEASURED 0` instead of ABSENT | CAUGHT | 1 failed / 10 |
| M4 | rung 1 hoisted above rung 0 | CAUGHT | 2 failed / 19 |
| M4b | rung 3 hoisted above rung 2 (a near tie could print SUPPORTED) | CAUGHT | 5 failed / 19 |
| M5 | margin boundary `≤ γ` weakened to `< γ` | CAUGHT | 2 failed / 19 |
| M5b | disagreement boundary `≥ t` weakened to `> t` | CAUGHT | 2 failed / 19 |
| M5c | rung-2 disclosed trigger precedence inverted | CAUGHT | 1 failed / 19 |
| M6 | runner drops the LABEL-BASIS-INCOMPLETE disclosure | CAUGHT | 1 failed / 3 (seam) |
| M7 | retired rule token re-enters shipped source (a comment) | CAUGHT | 2 failed / 4 |
| M8′ | sealed register family bypassed entirely (loud stop removed **and** code defaults substituted) | CAUGHT | 1 failed / 3 (seam) |
| N1 | rung 3 rewritten `!(winner < highCut)` — equivalent | NOT CAUGHT | 19 passed ✔ |
| N2 | input guard made STRICTER (also rejects outside [0,1]) | NOT CAUGHT | 19 passed ✔ |
| N3 | strengths input reversed before indexing | NOT CAUGHT | 10 passed ✔ |

**Two mutants were NON-DISCRIMINATING and are recorded rather than deleted**, because
a campaign that shows only kills is a campaign whose failures were edited out:

* the first ladder-order mutant guarded the hoisted rung on the very condition
  that made the hoist unreachable — semantically equivalent, so the green suite
  was **my mutant's** defect, not the property test's;
* the first `M8` mutated the controls object but left the loud stop in place, so
  the run still refused. `M8′` removes both halves and is caught.

---

## 5. Suites — `passed/total`, every failure named

All runs are **focused or zone** runs (D13); the authoritative full suite is D15's
on integration. The host is shared with a peer typecheck session; load is stamped
in every log header (26-38 during the cluster runs).

### Three-run cluster law — WORST run is the verdict (`logs/s06/cluster-three-runs-tip.log`)

| cluster | rows | command | run 1 | run 2 | run 3 | **verdict** |
|---|---|---|---|---|---|---|
| S06-C1 | T10 rows 1-3 | `vitest run tests/unit/t10-served-root-selection.test.ts tests/architecture/t10-first-configured-provider-removed.test.ts` | 14/14 | 14/14 | 14/14 | **GREEN** |
| S06-C2 | T11 rows 4,5,7,8 | `vitest run tests/unit/t11-verdict-label.test.ts tests/render/t11-verdict-banner.test.tsx` | 23/23 | 23/23 | 23/23 | **GREEN** |
| S06-C3 | T11 row 6 + T10 production seam | `vitest run tests/integration/database.test.ts -t "through the production runner"` | 3/3 | 3/3 | 3/3 | **GREEN** |

### Typechecks

* Root `tsc --noEmit -p tsconfig.json` at tip: **exit 0** (`logs/s06/root-typecheck-tip.log`).
* **D14/D16** (this lane touches `apps/ui/**`, `web/**`, `packages/contract` and
  `packages/kernel`, so both triggers fire):

| gate | BASE `7433be7` | TIP `3665302a` | pair |
|---|---|---|---|
| `tsc --noEmit -p apps/ui/tsconfig.json` | 1 error, exit 1 | 1 error, exit 1 | **byte-identical** |
| `tsc --noEmit -p web/tsconfig.json` | 1 error, exit 1 | 1 error, exit 1 | **byte-identical** |

The single error on each surface is the known pre-existing
`layout.tsx(3,8): error TS2882` (`globals.css` side-effect import), proven
pre-existing by T2 and unchanged by this lane. Logs:
`d14-baseui.log`, `d14-headui.log`, `d14-baseweb.log`, `d14-headweb.log`
(the BASE pair was captured before this lane adopted the stamped-header
convention, so the pair comparison is BASE-full vs TIP-minus-header).

### Zone run — `tests/unit` + `tests/architecture` + `tests/render`

The zone (`tests/unit` + `tests/architecture` + `tests/render` — **not** the full
suite; `tests/integration` and `acceptance/` are excluded per D13) was run at BASE
`7433be7` and at TIP `3665302a` in this worktree, which is this lane's baseline of
record under D12.

| | Test Files | Tests |
|---|---|---|
| BASE `7433be7` | 11 failed / 167 | **13 failed / 1337** |
| TIP `3665302a` | 11 failed / 171 | **13 failed / 1374** |

**The two failure SETS are identical** — `comm` in both directions is empty
(`zone-failure-set-BASE.txt`, `zone-failure-set-TIP.txt`). Zero failures are
attributable to this lane; the 37-test delta is this lane's own new tests, all
passing. The 13 stable-red names, each pre-existing and named individually:

1. `architecture/s04-contract.test.ts > DR-128 mints only the claim-type composition structure and wires a loud register read`
2. `architecture/s10-carrier-erasure-red.test.ts > filters completed private tombstones before any external key load`
3. `architecture/s13-contract.test.ts > lands append-only memory carriers without a closure job or embedding dependency`
4. `architecture/s7-authorization-contract.test.ts > hardens every immutable memory scope carrier and derives it from run ownership`
5. `architecture/scaffold.test.ts > enforces purity, one provider gateway, source-constant, exhaustive-switch and labeled-number gates`
6. `architecture/scaffold.test.ts > matches all 28 dependency-edge rows and structural rules 1-5`
7. `unit/load01-run-projection.test.ts > reads the state only through the owning asker and prioritizes terminal failure`
8. `unit/obs-l2-s04-zone.test.ts > calls the resolver over the real mount-list source and runs ZI-1..ZI-4`
9. `unit/obs-l2-s04-zone.test.ts > passes all 15 required falsification mutants`
10. `unit/pro01-runner-tree.test.ts > stops a defender call loudly on the pinned RUN_COST_ENVELOPE_EXHAUSTED path`
11. `unit/s6-content-encryption.test.ts > defaults content encryption off, retires the v1 blind-index path, and requires wrapping-key paths`
12. `unit/v2ui-node-runner.test.ts > keeps every active .test.mjs file in the explicit runner manifest`
13. `unit/xrev01-node-review.test.ts > stops a review loudly when the ratified model-call envelope is exhausted`

I make **no** blanket claim that none of these could be mine: the set-equality
against my own base run in my own worktree is the evidence, name by name. Note
that #5 and #6 (`scaffold.test.ts`) sit on surfaces my diff does touch — new
exports and an exhaustive-switch gate — and they fail on BASE with the SAME three
`obs-capture` violations at TIP, so the lane adds none.

An earlier TIP zone run (before this lane's last two assertions were added) showed
one EXTRA failure, `unit/registration.test.ts > S3c B4 keeps the isolated
production RSS curve below the published measured bound`. It is a process-RSS
measurement taken while ~170 other test files share the process. Replayed SOLO at
TIP three times: **1/1 passed, three times** (`logs/s06/registration-rss-classification.log`),
and it did not recur in the final TIP zone run. **Classification: load-coupled,
not attributable to this lane** — the same class D13 exists to describe.

---

## 6. Constants and design choices, disclosed

| choice | value | why it is mine to make |
|---|---|---|
| rule string | `max-propagated-strength-lexicographic-tiebreak` | packet: "design and document it". It is a DDL CHECK member and a wire literal — changing it later is a migration. |
| rule's home | `packages/kernel` | one declaration for a string that is simultaneously a typed field, a wire literal and a DDL member (J6). The runner owns the SELECTOR and re-exports the rule. |
| receipt = | `ledger.propagation_run.served_root_selection` | the goal never defines "receipt"; this is the row the codebase already calls one (`runner:2426`). |
| mark scope | `answer`, subjectRef = served root | see finding F-S06-1 below. |
| margin on a tie | `MEASURED 0`, never ABSENT | so rung 2 sees it; the goal says a tie is CONTESTED by the ladder. |
| tiebreak comparison | code units, not `localeCompare` | locale collation is host-dependent; a tiebreak that moves with the host is not deterministic. |
| migration number | 0055 | 0053 (t6) and 0054 (tint1) are claimed in sibling worktrees. |
| rung-2 trigger precedence | margin named first when both fire | documented and now pinned (M5c). |
| test fixture controls | γ=0.05, high=0.7, low=0.35, t=0.25 stated in the TEST | deliberately the caller's values, not read from the register, so a test cannot pass by restating what the reader was supposed to fetch. Production reads them; `M8′` proves it. |

---

## 7. Findings

**F-S06-1 · packet wording vs shipped scope (non-blocking, disclosed deviation).**
The packet says "runner **node-scope** projection" for the new mark. I shipped
**answer-scope** with `subjectRef` = the served root node id and
`affectedNodeIds` = [served root], matching every sibling answer-level disclosure
(`SINGLE-LINEAGE`, `CRITIQUE-UNAVAILABLE`, `UNSERVED-MAKER-POSITION`). The mark is
about the ANSWER's label, not about a node. If the reviewer rules node-scope, it is
a one-line change plus one seam assertion. **Flagged, not absorbed.**

**F-S06-2 · the acceptance ceremony pinned the retired rule structurally
(blocking, fixed in-lane, unrunnable here).** `acceptance/ceremony.test.ts` asserted
`subject_ref: positionNode.node_id` where `positionNode = graphPayload.nodes[0]` —
the first-authored root. Under T10 that re-asserts the retired rule under a new
name and would pass or fail depending on which maker happened to win. Rewritten to
derive the expectation from the run's own recorded strengths, plus two new
assertions (the served number is the served root's strength and ≥ the runner-up's;
a two-root two-voice run must NOT carry `LABEL-BASIS-INCOMPLETE`). **This file needs
real CLI providers and was NOT executed by this seat** — it is typechecked only.
The D20-class ceremony run is the verification that closes it.

**F-S06-3 · three hand-written vocabulary count pins (non-blocking, fixed
in-lane).** `s14-ui.test.ts:118`, `dr174-resilience.test.ts:202` and
`obs-l2-s02-registry.test.ts:417` pin `CONDITION_MARKS` length by hand
(31 → 32). Nothing in the repo announces these pins; a mark mint discovers them
by breaking. Suggest the mark-mint checklist carry
`grep -rn "CONDITION_MARKS).toHaveLength"`.

**F-S06-4 · `zone` failures are load-coupled (non-blocking, not mine, evidence
filed).** See §5's zone paragraph.

**F-S06-5 · OneDrive mode flip rode into two commits (fixed in-lane).**
`apps/runner/src/index.ts` and `apps/ui/lib/v3/labels.ts` were committed 100755.
`core.fileMode=false` on the worktree HIDES this from porcelain while leaving it in
history; the only check that sees it is
`git diff --summary <base>..HEAD | grep -c "mode change"`. Cured by a mode-only
commit (`3665302a`, `0 insertions(+), 0 deletions(-)`), now **0**. Appended to
TOOLING-TRAPS. Recommend that grep become a standing pre-filing check for every
seat, since it is invisible to the seat that causes it.

---

## 8. Bounds respected

Never pushed, never merged, no board or DECISIONS file touched, no register
constant re-declared (`logs/s06/register-grep-proof.log`), `packages/register`
untouched. T7's stopping surface, T6's review-outcome disclosure and T9's synthesis
were not touched. Sibling lanes' marks were not coordinated with — the mid-list
mint leaves the DR-176 tail intact, which is the only cross-lane invariant the
packet names.

Self-report filed at `agent-reports/s06-selection-label-self.md` **before** this
marker. Four entries appended to `.hermes/TOOLING-TRAPS.md`.

---

## r2 — rework round 1 of 3, against codex r1 CHANGES

`SKILLS LOADED: heartbeat, heartbeat-worker, superpowers:using-superpowers, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:receiving-code-review`

Lane `lane/s06` @ `a10c2254` off `7433be7`. Seven commits (three from r1, four this round), never pushed, never merged.
`git diff --summary 7433be7..HEAD | grep -c "mode change"` → **0**.

All six findings are addressed. Every one was verified against the codebase
before implementing; none was disputed. **J16(a) is read and accepted**: the
answer-scope mark stands and F-S06-1 is withdrawn as a finding.

## B1 — the shipped runner never loaded or supplied `verdictLabelPolicy` · FIXED

Verified: `apps/runner/src/main.ts:72-100` constructed the runner without it, and
`dev-runner-policy.ts` — its only policy reader — never read the four T16 rows.
The dev deployment DOES seal them (`dev-deployment-register.ts:176` seeds through
`buildAlgorithmRegisterRows`), so a correct deployment spent judgement and
propagation and only then refused. The focused seam evidence masked it because
every factory I exercised supplied the policy.

Three changes:
1. `readDevelopmentRunnerPolicy` reads the family through **T16's own reader**
   (`readVerdictLabelControls`) — no restated value, no restated schema (J6) — and
   pins each row's provenance to the dev algorithm deployment so a foreign row
   cannot drift in under the same register version.
2. `main.ts` passes `verdictLabelPolicy: policy.verdictLabelPolicy`, and the
   repo's existing mandatory-entry-point-settings list gains that row, so a future
   entry point that drops it fails at the list rather than in production.
3. **The loud stop moves to claim time**, beside J12's panel stop and before any
   model call. J12 gates on M≥2 because panel weighting only binds there; the
   label binds at every maker count, so this gate is unconditional. The
   selection-time guard stays as the typed defence for any other caller.

| evidence | log |
|---|---|
| RED — entry point missing the mandatory setting | `logs/s06/r2/b1-RED-entrypoint.log` (1 failed / 5) |
| RED — the stop lands after 1 model call, expected 0 | `logs/s06/r2/b1-RED-claimtime.log` (`expected 1 to be +0`) |
| GREEN — entry point | `logs/s06/r2/b1-GREEN-entrypoint.log` (5/5) |
| GREEN — claim-time stop, 0 model calls, 0 answers | `logs/s06/r2/b1-GREEN-claimtime.log` (3/3) |
| mutant — the policy stops carrying the family | `refutation-d24.log` block `B1-M1prime` (CAUGHT, 1 failed / 5) |

## B2 — an integration consumer still required the retired rule · FIXED

Verified and reproduced: `database.test.ts` asserted the HYG depth-2 two-maker
answer's record carried `first-configured-provider`; the RED is verbatim
`- "served_root_rule": "first-configured-provider"` /
`+ "served_root_rule": "max-propagated-strength-lexicographic-tiebreak"`.

**r1's class-sweep row for this site said "2030 migrated". That was false.** The
site was correctly enumerated and never edited; the disposition was written from
intention, not from the file. Correction on the record — see the self-report.

The assertion now requires the live rule **and** an oracle that migrating the
literal alone cannot satisfy: the served subject is read against the run's own
`node_strength_record` rows, and no root may carry a strictly greater recorded
strength. A selector that still served the first configured provider fails it.

RED `logs/s06/r2/b2-RED.log` (1 failed / 68) · GREEN `logs/s06/r2/b2-GREEN.log` (1/1).

## B3 — preserved legacy rows were neither wire-readable nor catch-up-writable · FIXED

Verified in full, including that **no consumer anywhere switches or compares on
`served_root_rule`** (the grep is in the r2 log set) — which is what made the fix
safe.

**The design.** Read and write vocabularies are now distinct, and each is enforced
where it can be:

| concern | mechanism |
|---|---|
| what a sealed record MAY carry (read) | `SERVED_ROOT_RULE_HISTORY` = live rule + `RETIRED_SERVED_ROOT_RULES`, declared once in the kernel |
| what the public wire returns | contract `served_root_rule: z.enum(SERVED_ROOT_RULE_HISTORY).nullable()` |
| what a FRESH selection may record | `ConditionMarkRecord.servedRootRule` stays live-only — a retired rule is inexpressible |
| what CATCH-UP may carry forward | `PreservedConditionMarkRecord`, the only shape admitting a retired rule |
| the boundary between them | `persist` refuses a retired rule on any non-superseding answer: `RETIRED_SERVED_ROOT_RULE_NOT_WRITABLE` |
| what the database will store | 0055's CHECK admits the DECLARED HISTORY, **VALIDATED** |

**Why catch-up may carry the retired value.** DR-184 catch-up appends a new
version of an existing answer and does **not re-select a root** — it inherits the
one already served. The preserved record is therefore TRUE of the new version:
that root really was chosen under the old rule. Relabelling it would falsify the
record; refusing the write would break a lawful operation for every pre-0055
answer. SQL cannot distinguish a fresh selection from a preserved one, so that
distinction moved to the types and to `persist`'s guard, and the CHECK admits the
history it is meant to preserve.

**Change to r1's migration, disclosed.** 0055's CHECK was `NOT VALID` and
live-rule-only. It is now VALIDATED over the declared history. This is stronger,
not weaker: `NOT VALID` left every historical row permanently unchecked, so a row
holding arbitrary text would have survived forever. The new constraint proves
every existing row is inside the declared history and refuses anything outside it
— `B3-a` asserts exactly that, including the negative arm.

**PUBLIC WIRE SHAPE CHANGE — declared, and RULED LAWFUL by J17.** `served_root_rule`
widens from one literal to a nullable two-member enum (live rule + retired rule).
I did not BLOCK, on the reasoning that the field is nullable, carried, and never
switched or compared on anywhere in the repo (`logs/s06/r2/b3-blast-radius.log`),
so the widening has no consumer blast radius and simply makes the contract
describe bytes the database has always held — the pre-change contract was wrong
about every pre-0055 answer. **J17 rules the shape lawful** — history must be
readable while the live WRITE vocabulary stays one value, carried by
`PreservedConditionMarkRecord` alone, with `persist` refusing a retired rule on a
non-superseding answer — so no block was owed. The widening is stated in the
constants table below.

Codex's three failure cases, each its own RED:

| # | failure case | RED | GREEN |
|---|---|---|---|
| compile | the read type denies the preserved value exists | `b3-RED-typecheck.log` (`TS2367 … have no overlap`, exit 1) | `root-typecheck-r2.log` (exit 0) |
| 1+2 | projection + `AnswerSchema.parse` + both answer routes | `b3-RED-runtime.log` B3-b (`invalid_value`) | `b3-GREEN.log` B3-b |
| 3 | DR-184 catch-up re-persists the historical value | `b3-RED-runtime.log` B3-c (`violates check constraint "condition_mark_served_root_rule_rule_check"`) | `b3-GREEN.log` B3-c |
| DDL | the CHECK refuses the history it preserves | `b3-RED-runtime.log` B3-a | `b3-GREEN.log` B3-a |
| guard | a fresh answer claiming a retired rule | `b3-RED-runtime.log` B3-d (refused by the DB, not by a typed law) | `b3-GREEN.log` B3-d |

Mutants (D24, `refutation-d24.log`), each with diff, token grep 0→1→0, identical
hashes both sides and clean porcelain: `B3-M1` contract narrowed back to the live
rule → CAUGHT (1 failed / 4); `B3-M2` fresh-write guard removed → CAUGHT
(1 failed / 4); `B3-M3` migration CHECK reverted to live-only → CAUGHT
(4 failed / 4).

The retirement scan is updated rather than weakened: the retired STRING is now
permitted in **exactly one** shipped module (the kernel's read vocabulary) and
pinned there, while the retired CONSTANT and SELECTOR must appear nowhere — and
those two are matched on word boundaries, so the live `SERVED_ROOT_RULE_HISTORY`
and `RETIRED_SERVED_ROOT_RULES` names cannot satisfy the scan by accident.

## N1 — acceptance typecheck evidence · FILED

`acceptance/tsconfig.json` covers both edited files; `--listFiles` confirms
`acceptance/main.ts` and `acceptance/ceremony.test.ts` are compiled.

```
$ npx tsc --noEmit -p acceptance/tsconfig.json
acceptance/adversarial-corpus.test.ts(238,24): error TS2741: Property 'edges' is missing … 'NodeReviewInput'.
acceptance typecheck exit=1
```

**The single error is PRE-EXISTING and not mine**: the identical line and exit
status come out of the same config at base `7433be7`
(`logs/s06/r2/n1-acceptance-typecheck-BASE.log`). It is a T5 `NodeReviewInput.edges`
consequence in a file this lane does not touch — filed as F-S06-6. **My two edited
acceptance files compile clean.** r1's claim that the ceremony "is typechecked
only" was unsupported at the time; it is now supported by evidence at both ends.

## N2 — acceptance/README.md · UPDATED

The operator guidance now describes maximum-propagated-strength selection, the
code-unit node-id tiebreak, the live recorded rule and the receipt, and adds an
explicit *"do NOT expect the first configured provider to win"* diagnosis note
plus the historical-value caveat.

## N3 — the omitted non-discriminating mutant · TRANSCRIPT FILED

`refutation-d24.log` block `M4-omitted` records it in full D24 shape (diff, token
grep 1, result 19/19 passed, restore, post-restore grep 0, identical hashes both
sides). It hoists rung 1 above rung 0 but guards the hoisted branch on
`margin MEASURED && disagreement MEASURED` — the case in which rung 0 cannot fire
— so it is semantically equivalent and the suite is right to stay green. `M4`
directly above it is the same hoist UNGUARDED and is caught 2/19, which is what
distinguishes "my mutant was defective" from "the test is weak". The r1 claim of
two recorded non-discriminating mutants is now true rather than asserted.

## Suites at r2 tip — `passed/total`, focused and zone runs only (D13)

Host shared with a peer typecheck session; load stamped in every log header
(12-24 during these runs).

### Three-run cluster law — WORST run is the verdict (`logs/s06/r2/cluster-three-runs-r2.log`)

| cluster | command | run 1 | run 2 | run 3 | verdict |
|---|---|---|---|---|---|
| S06-C1 T10 selection + retirement scan | `vitest run tests/unit/t10-served-root-selection.test.ts tests/architecture/t10-first-configured-provider-removed.test.ts` | 15/15 | 15/15 | 15/15 | **GREEN** |
| S06-C2 T11 ladder + banner + rule history | `vitest run tests/unit/t11-verdict-label.test.ts tests/render/t11-verdict-banner.test.tsx` | 24/24 | 24/24 | 24/24 | **GREEN** |
| S06-C3 production seam + B2 + B3 (DB) | `vitest run tests/integration/database.test.ts -t "production runner\|pre-0055 answer stays readable\|depth-2 two-maker tree"` | 9/9 | 9/9 | 9/9 | **GREEN** |
| S06-C4 B1 production entry point | `vitest run tests/architecture/dev-runner-provider-set.test.ts` | 5/5 | 5/5 | 5/5 | **GREEN** |

### Typechecks

| gate | BASE `7433be7` | TIP | pair |
|---|---|---|---|
| root `tsconfig.json` | exit 0 | **exit 0** | — |
| `apps/ui/tsconfig.json` (D14/D16) | 1 error, exit 1 | 1 error, exit 1 | **byte-identical** |
| `web/tsconfig.json` (D14/D16) | 1 error, exit 1 | 1 error, exit 1 | **byte-identical** |
| `acceptance/tsconfig.json` (N1) | 1 error, exit 1 | 1 error, exit 1 | **identical, pre-existing** |

Both D14 errors are the known pre-existing `layout.tsx(3,8) TS2882`. `packages/contract`
and `packages/kernel` changed again this round, so D16's trigger fired and both
gates were re-run at the r2 tip.

### Zone run — `tests/unit` + `tests/architecture` + `tests/render`

The zone (`tests/unit` + `tests/architecture` + `tests/render` — **not** the full
suite; `tests/integration` and `acceptance/` are excluded per D13) was re-run at the
r2 tip on a clean, committed tree.

| | Test Files | Tests |
|---|---|---|
| BASE `7433be7` (r1 evidence, unchanged) | 11 failed / 167 | **13 failed / 1337** |
| r2 TIP | 11 failed / 171 | **13 failed / 1376** |

**The two failure SETS are identical** — `comm` empty in both directions
(`zone-failure-set-BASE.txt`, `r2/zone-failure-set-TIP-r2.txt`). Zero failures are
attributable to this lane; the 39-test delta is this lane's own new tests, all
passing. The 13 stable-red names are the same list r1 filed and classified, each
pre-existing at base:

1. `architecture/s04-contract.test.ts > DR-128 mints only the claim-type composition structure and wires a loud register read`
2. `architecture/s10-carrier-erasure-red.test.ts > filters completed private tombstones before any external key load`
3. `architecture/s13-contract.test.ts > lands append-only memory carriers without a closure job or embedding dependency`
4. `architecture/s7-authorization-contract.test.ts > hardens every immutable memory scope carrier and derives it from run ownership`
5. `architecture/scaffold.test.ts > enforces purity, one provider gateway, source-constant, exhaustive-switch and labeled-number gates`
6. `architecture/scaffold.test.ts > matches all 28 dependency-edge rows and structural rules 1-5`
7. `unit/load01-run-projection.test.ts > reads the state only through the owning asker and prioritizes terminal failure`
8. `unit/obs-l2-s04-zone.test.ts > calls the resolver over the real mount-list source and runs ZI-1..ZI-4`
9. `unit/obs-l2-s04-zone.test.ts > passes all 15 required falsification mutants`
10. `unit/pro01-runner-tree.test.ts > stops a defender call loudly on the pinned RUN_COST_ENVELOPE_EXHAUSTED path`
11. `unit/s6-content-encryption.test.ts > defaults content encryption off, retires the v1 blind-index path, and requires wrapping-key paths`
12. `unit/v2ui-node-runner.test.ts > keeps every active .test.mjs file in the explicit runner manifest`
13. `unit/xrev01-node-review.test.ts > stops a review loudly when the ratified model-call envelope is exhausted`

I make **no** blanket claim that none could be mine: the set equality against my own
base run in my own worktree is the evidence, name by name. #5 and #6
(`scaffold.test.ts`) sit on surfaces this lane touches again in r2 — new kernel
exports and a new serve type — and they fail at BASE with the same three
`obs-capture` violations, so r2 adds none.

**Process note on this run.** A first r2 zone attempt was KILLED and re-run because
two commits landed while it was collecting; a zone result that straddles commits is
not evidence. The filed log's header records the kill, the reason, and
`porcelain: 0 modified files` at start.

## Constants and design choices this round, disclosed

| choice | value / shape | status |
|---|---|---|
| **public wire shape** | `served_root_rule: z.enum([live, retired]).nullable()` — widened from a single literal | **RULED LAWFUL by J17.** History must be readable; the live WRITE vocabulary stays one value |
| live WRITE vocabulary | `SERVED_ROOT_SELECTION_RULE` alone, on `ConditionMarkRecord.servedRootRule` | a fresh selection cannot express a retired rule |
| history carrier | `PreservedConditionMarkRecord` — the ONLY shape admitting a retired rule | J17 names it explicitly |
| the boundary | `persist` throws `RETIRED_SERVED_ROOT_RULE_NOT_WRITABLE` on a non-superseding answer | J17 names it explicitly |
| 0055's CHECK | declared history, **VALIDATED** (was live-only + `NOT VALID`) | stronger: `NOT VALID` left historical rows permanently unchecked |
| claim-time label gate | unconditional at every maker count | J12 gates on M≥2 because panel weighting binds there; the label binds always |
| dev policy provenance | each T16 row's `sourceRef` must start with `DEVELOPMENT_ALGORITHM_SOURCE_REF` | stops a foreign row drifting in under the same register version |
| retired-literal declaration site | exactly one shipped module (`packages/kernel`), pinned by the scan | the value only ever arrives by reading a row |

## Findings

**F-S06-1 · WITHDRAWN.** J16(a) rules the answer-scope mark correct. Not a finding.

**F-S06-5 · CLOSED.** Mode-change count is 0 and now quoted per J16(b).

**F-S06-6 · NEW, non-blocking, not mine.** `acceptance/adversarial-corpus.test.ts:238`
fails the acceptance-config typecheck at BASE and at TIP: `NodeReviewInput` gained
a required `edges` member (T5 / S3-1) and this call site was not updated. Invisible
to the root config at the mission base, which is why it survived. Needs a ticket in
T5's lineage or the closure lane; **not fixed here — out of contract.**

**F-S06-7 · NEW, non-blocking, same class as B1.** `panelPolicy` is also absent
from `apps/runner/src/main.ts` and from `dev-runner-policy.ts`, so a multi-maker
production run stops `PANEL_WEIGHTING_UNRESOLVED` at claim time (J12's gate, so it
is cheap — but the sealed rows are never supplied). Same defect class codex found
in B1, in T3's lane. **Not fixed here — out of contract**; named so it gets a
ticket rather than being discovered by a deployment.

**F-S06-8 · ADOPTED AS FLEET LAW (D24 ADDENDUM-2).** The mutant harness restores
with `git checkout HEAD -- <file>`, which destroys uncommitted work — it deleted
the B1 fix mid-round (recorded and superseded in the D24 log, not hidden). A
harness that can destroy the work it validates must refuse to run on a dirty
tree. Also appended to TOOLING-TRAPS.

## Bounds

Never pushed, never merged. No board or DECISIONS file touched. No register value
re-declared and `packages/register` still untouched by this lane. T7's stopping
surface, T6's review-outcome disclosure and T9's synthesis untouched. Migration
number stays 0055 per D25's registry. Self-report `## r2` filed BEFORE this
marker; four r1 entries plus one r2 entry in `.hermes/TOOLING-TRAPS.md`.

---

## r3 — rework round 2 of 3, against codex r2 CHANGES

`SKILLS LOADED: heartbeat, heartbeat-worker, superpowers:using-superpowers, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:receiving-code-review`

Lane `lane/s06` @ `6624c3fa37d90f24fa84b1580f64f0259a9e9c95` (`6624c3fa`) off `7433be7`. Eight commits, never pushed,
never merged. **`git diff --summary 7433be7..HEAD | grep -c "mode change"` → 0.**

All four findings are addressed; none is disputed. Codex r2's B1 was verified by
measurement before anything was changed.

## B1 — the HYG "strengths-not-order" oracle was non-discriminating · FIXED

Codex's argument was static. I turned it into a measurement first, then fixed it,
then measured again. Both blocks ran from a clean committed tip under the
ADDENDUM-2 guard, and **the mutated-file hash is identical in both** (`22d965b1…`),
so they are demonstrably the same mutation:

| block | fixture | mutation | result |
|---|---|---|---|
| `R3-B1-BEFORE` | r2, as shipped (`a10c2254`) | selection reverts to provider order | **`Tests 1 passed`** — the mutant SURVIVED |
| `R3-B1-AFTER` | r3, fixed (`6624c3fa`) | *identical* | **`Tests 1 failed`** — CAUGHT |

That difference is the finding, and codex was exactly right about the cause: every
authored node took the default `judgementDouble` fidelity, panel assessments score
0, edge bearings stay UNKNOWN and propagation ignores UNKNOWN arrows — so the two
symmetric roots carried **equal** strength, and my oracle compared them with `<=`.
A tied first root satisfied it. Worse, the surviving `Secondary test maker` reason
assertion depended on which random UUID sorted first under the lawful tiebreak, so
the three r2 C3 greens were compatible with luck.

The fix, in the order the assertions now run:

1. the fixture makes the roots **strictly** unequal with the **first-configured
   root weaker** (`0.3` vs `0.9`), stated as two named constants;
2. `expect(rootStrengthRows.rowCount).toBe(2)` — exactly two roots, so a
   third-root fixture change cannot slip past;
3. **the strict inequality is asserted BEFORE the winner assertion**, so a future
   fixture drift that re-ties the roots fails at the pin instead of silently
   disarming everything below it — which is precisely the failure being repaired;
4. the served subject **is** the strict winner and **is not** the first configured
   root;
5. the disclosure names both roots **by the ids the strength table returned**, and
   `affected_node_ids` is checked against the same two ids — no hard-coded maker
   name survives anywhere in this consumer.

Roots are ordered by `core.node.created_at_seq`, so row 0 is the first-configured
maker's root by construction rather than by assumption.

GREEN: `logs/s06/r3/b1-n3-GREEN.log` (5/5, includes the whole B3 block).

## N1 — the typecheck and C3 record predated the final tip · RE-RUN

Both re-run at the committed rework tip **after** B1, with the full SHA, the short
SHA and the porcelain count in each header.

```
# tip (full):  6624c3fa37d90f24fa84b1580f64f0259a9e9c95
# porcelain:   0 modified files (0 = clean committed tree)
$ npx tsc --noEmit -p tsconfig.json
root typecheck exit=0
```

| cluster | run 1 | run 2 | run 3 | verdict |
|---|---|---|---|---|
| **C3** production seam + HYG consumer + B3 history (`n1-cluster-c3-final-tip.log`) | 9/9 | 9/9 | 9/9 | **GREEN** |
| **C1** selector + retirement scan (`n1-cluster-c1-final-tip.log`) | 15/15 | 15/15 | 15/15 | **GREEN** |

C1 is included because the other file this round changes — the rewritten
retirement-scan architecture test — lives in it.

**D14/D16 are NOT repeated, on codex r2 N1's own condition.** The r3 diff is
`git diff --stat a10c2254..HEAD` = two files, both tests:

```
 .../t10-first-configured-provider-removed.test.ts  | 34 +++++---
 .../tests/integration/database.test.ts             | 90 +++++++++++++++++-----
```

`git diff --name-only a10c2254..HEAD | grep -E "apps/ui|web/|packages/contract|packages/kernel"`
returns nothing, so no triggering type producer changed.

**Zone NOT re-run this round — a deliberate scope call, stated rather than
implied.** The r3 diff touches exactly one zone-resident file
(`tests/architecture/t10-first-configured-provider-removed.test.ts`), and C1 covers
it three times at the final tip. A D15 suite was running on the integration
worktree during this round, and D13 confines me to focused runs. The r2 zone record
(13 failed / 1376, failure set byte-identical to BASE) therefore stands as the
zone evidence, and I am **not** claiming a fresh zone number I did not produce.

## N2 — `M4-omitted` was run on a dirty tree · RE-RUN, ADMISSIBLE

The r2 block's own `porcelain (must be empty)` field listed two modified files, so
under D24 ADDENDUM-2 it was inadmissible regardless of its result, and the later
`GUARD-DEMO` could not retroactively legalise it. Re-run from the committed tip
through the harness that now aborts with exit 3 on a dirty tree:

- pre-mutation hash `f816ca36…` · applied token count **1** · post-restore count **0**
- result `Tests 20 passed (20)` — NOT CAUGHT, as designed
- post-restore hash `f816ca36…` — **identical to pre**
- `porcelain (must be empty)` — **empty** (the `END MUTANT` line follows directly)

The r2 block stays in the log as the record of what went wrong, not as evidence.

## N3 — the migration test contradicted J17 and its validation pin was blind · FIXED

The header said DELETED meant the database would no longer accept the retired
value — the opposite of J17. Rewritten to state the actual law: **DELETED means no
new SELECTION under the retired rule** (the constant and the selector are gone from
shipped source; only the kernel may name the string), while **the database ADMITS
the declared history** and the *application's* write path stays live-only —
`ConditionMarkRecord` cannot express a retired rule, `PreservedConditionMarkRecord`
is the only shape that can, and `persist` refuses one on a non-superseding answer.

The layout-sensitive `not.toContain("NOT VALID")` text check is **removed rather
than hardened**: it could not see `NOT\nVALID`. The discriminating assertion now
reads the live catalogue in the B3-a arm —

```sql
SELECT c.convalidated, pg_get_constraintdef(c.oid) ... WHERE c.conname='condition_mark_served_root_rule_rule_check'
```

— asserting `convalidated = true` and both history members in the constraint
definition. Proved discriminating by mutant `R3-N3-M1`, which restores `NOT VALID`
**in exactly the newline-split form codex described**: CAUGHT, `Tests 1 failed`.

## Mutants this round (D24 + ADDENDUM-2, all from clean committed tips)

| id | mutation | expect | result |
|---|---|---|---|
| `R3-B1-BEFORE` | provider-order selection, r2 fixture | (probe) | **NOT caught** — 1 passed |
| `R3-B1-AFTER` | provider-order selection, fixed fixture | CAUGHT | 1 failed |
| `R3-N3-M1` | `NOT VALID` restored across a newline | CAUGHT | 1 failed |
| `M4-omitted` (re-run) | rung 1 hoisted but guarded unreachable | NOT CAUGHT | 20 passed |

Every block records pre-hash, applied token count, result, restore command,
post-restore token count 0, post-restore hash equal to pre, and empty porcelain.

## Residue — drafted as a V row, not absorbed

**V-ROW DRAFT · V-S06-1 — the acceptance ceremony this lane edits has never been
executed by this seat.**
`acceptance/ceremony.test.ts` needs real CLI provider binaries (TOOLING-TRAPS
records the hardcoded relay paths), so no S06 round has run it. What IS established:
it typechecks at BASE and at TIP through a config that includes it (the sole error
is the pre-existing T5 `TS2741`, F-S06-6), and its T10 assertions were rewritten to
derive the served root from the run's own recorded strengths instead of from
`graphPayload.nodes[0]`, which under T10 would have re-asserted the retired rule
under a new name. What is NOT established: that it passes on a live multi-provider
ceremony. **Ask:** route the ceremony run to whoever owns the D20-class ceremony
(the judge stage or the closure lane) and treat any failure there as an S06 fix
under J16(c), or rule explicitly that the D15 integration suite is sufficient
closure for this file. I am not guessing which.

## Findings carried, unchanged

- **F-S06-6** — `acceptance/adversarial-corpus.test.ts:238` fails the
  acceptance-config typecheck at BASE and TIP (T5 `NodeReviewInput.edges`); routed,
  out of contract, not fixed here.
- **F-S06-7 / F33** — `panelPolicy` absent from `main.ts` and `dev-runner-policy.ts`;
  codex confirms it is ticketed to T3C and not double-counted.
- **F-S06-8 → D24 ADDENDUM-2** — adopted as fleet law; this lane's harness enforces
  it (exit 3, demonstrated in the D24 log).

## Bounds

Never pushed, never merged. No board or DECISIONS file touched. No register value
re-declared; `packages/register` still untouched by this lane. Migration number
still 0055 per D25. Self-report `## r3` filed BEFORE this marker.

---

## r4 (evidence repair + integration merge) — filing r4 = rework 2/3 (J19)

`SKILLS LOADED: heartbeat, heartbeat-worker, superpowers:using-superpowers, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:receiving-code-review`

**Merged tip `e040b1ee5322b3343987632659509e963d0ccd05`** (lane/s06, merge of integration `362299d1` = base
`7433be7` + TINT1 + T6). Never pushed; integration was merged INTO the lane, never
the reverse. **`git diff --summary 7433be7..HEAD | grep -c "mode change"` → 0**;
against the merge base `362299d1` → **0**.

No product finding was open (judge: PASS WITH RECORDED RESIDUE). This filing is
codex r3's N1/N2 evidence-and-record repair plus the integration merge.

## 1 · N1 — the four mutant transcripts, refiled under D24 ADDENDUM

The r3 blocks printed a generic `occurrences of mutant token` without saying what
was counted, and recorded no pre-apply gate. The ADDENDUM exists because a
hand-passed grep target is a free parameter — and mine was literally a separate
argument. The r4 harness **derives the token from the mutation**: it counts
occurrences of `NEW` itself, prints it verbatim between `<<<TOKEN` and `TOKEN>>>`,
and treats `pre=0 → applied>0 → restored=0` as aborting gates (exit 4/5/6), on top
of ADDENDUM-2's dirty-tree refusal (exit 3).

Index: `logs/s06/r4/r4-mut-INDEX.md`.

| block | log | tip | pre | applied | restored | result |
|---|---|---|---|---|---|---|
| `R3-B1-BEFORE` provider-order vs the **r2** fixture | `r4-mut-R3-B1-BEFORE.log` | `a10c22546987b549b11c2cfdb3c275d07a56858d` | 0 | 1 | 0 | **1 passed** — the mutant SURVIVES |
| `R3-B1-AFTER` provider-order vs the **fixed** fixture | `r4-mut-R3-B1-AFTER.log` | `6624c3fa37d90f24fa84b1580f64f0259a9e9c95` | 0 | 1 | 0 | **1 failed** — CAUGHT |
| `R3-N3-M1` `NOT VALID` split across a newline | `r4-mut-R3-N3-M1.log` | `6624c3fa…` | 0 | 1 | 0 | **1 failed** — CAUGHT |
| `M4-omitted` guarded hoist (unreachable) | `r4-mut-M4-omitted.log` | `6624c3fa…` | 0 | 1 | 0 | **20 passed** — NOT CAUGHT, by construction |

Each block also carries both-side sha256 (equal), the mutation diff, the restore
command, and an empty porcelain field before apply and after restore.
`R3-B1-BEFORE` ran from a detached checkout of the r2 tip and the log records the
lane branch id before and after, so the excursion is auditable.

The r3 blocks remain in `logs/s06/refutation-d24.log` as SUPERSEDED, the same
disposition T7's r4 logs received.

## 2 · N2 — the ceremony residue, corrected to J18's route

**This supersedes the r3 section's `V-ROW DRAFT · V-S06-1`, which asked V for a
route J18 had already ruled.** The draft's *question* was wrong; its *fact* was not,
and the fact is preserved:

> **Fact, unchanged:** the S06 seat has never EXECUTED `acceptance/ceremony.test.ts`.
> It needs real CLI provider binaries, and no S06 round ran it.

**Route, per J18 (2026-09-02 10:10 EEST) — a ruling, not an ask:**
1. **W12's flagship ceremony executes every acceptance assertion once.** That is
   where this file runs.
2. **This lane closes on the D15 suite plus a typecheck whose config includes
   `acceptance/**`.** Both are satisfied — and see §5: after this merge the **root**
   typecheck includes `acceptance/**` and exits 0, so the closure condition is met by
   the root gate rather than by a side config.
3. **A W12 failure attributable to this lane's assertions is an S06 micro-fix by
   this seat**, never a pre-W12 lane blocker.

No V decision is requested. `V-S06-1` is withdrawn as answered by ruling.

## 3 · The merge — every conflict hunk and its resolution

`git merge --no-ff 362299d1`, merge base `7433be7`. Five files overlapped; git
raised **two** content conflicts and auto-merged three.

### CONFLICT 1 — `packages/contract/src/index.ts`, the `condition_mark_records` member

* **Ours (S06):** the inline record object with `served_root_rule` widened to
  `z.enum(SERVED_ROOT_RULE_HISTORY)` (J17's read vocabulary).
* **Theirs (T6):** the whole object EXTRACTED into a named
  `ConditionMarkRecordSchema`, gaining `review_outcome: z.enum(["cannot-assess"])`
  and the XOR refinement `namesOneUnjudgedReason` — *exactly one* unjudged reason,
  transport **or** review outcome, never both and never neither.
* **RESOLUTION — theirs for the structure, ours for the member.** The array line
  becomes `z.array(ConditionMarkRecordSchema)`, and the J17 widening is applied at
  the single definition site T6 created. **Why:** T6's extraction is the stronger
  shape (one definition, one refinement) and its XOR law is the whole point of its
  verdict; S06's widening is a property of one member and is orthogonal to it.
  Nothing from either side is dropped — verified by landmark below.

### CONFLICT 2 — `packages/serve/src/index.ts`, the kernel/pg import block

* **Ours:** `ServedRootRule`, `ServedRootRuleHistory`, `isRetiredServedRootRule`.
* **Theirs:** `PoolClient` from `pg` (T6's writer-resolved FK path runs inside the
  write transaction).
* **RESOLUTION — union.** Disjoint additions to the same two lines; both retained.

### POST-MERGE TYPE SEAM — no conflict marker, found only by the compiler

`resolveTrueUnjudgedReasons` (T6) took `readonly ConditionMarkRecord[]`; after the
merge `persist` (S06) passes `PersistableConditionMarkRecord[]`, which includes the
preserved shape whose rule may be a retired value. Git auto-merged both regions —
they are hundreds of lines apart — and `tsc` rejected the call.

**RESOLUTION — widen T6's parameter to the union.** *(Rationale CORRECTED in r4b
per codex merge N1 — the original text here understated what the resolver reads.)*
The resolver reads FOUR fields — `mark`, `subjectRef`, `reviewOutcome` and
`terminalTransportOutcome` — and the last two select and validate T6's
review-versus-transport truth arm. The widening is nonetheless safe, for a stronger
reason than a short read-set: `PreservedConditionMarkRecord` is
`Omit<ConditionMarkRecord, "servedRootRule"> & { servedRootRule:
ServedRootRuleHistory | null }`, so every field has the same type and meaning in
both arms and the ONLY difference is `servedRootRule`, which this function never
reads. The body is otherwise unchanged from integration `362299d1`. The alternative
(narrowing S06's union at the call site) would have made the DR-184 catch-up path
unrepresentable — deleting J17's purpose to satisfy a signature. **No landed lane's
semantics change.** Called out separately because it is the kind of merge defect a
marker-only review misses.

### AUTO-MERGED, audited rather than trusted — `logs/s06/r4/merge-landmarks.log`

`apps/runner/src/index.ts`, `tests/integration/database.test.ts`,
`acceptance/ceremony.test.ts`. Auto-merge is a statement about text adjacency, not
meaning, so each landed lane's semantic markers were grepped for:

| lane | landmarks | present |
|---|---|---|
| **T6** | `review_outcome`, `cannot-assess`, `namesOneUnjudgedReason`, `PoolClient` | ✔ all, across runner/serve/contract |
| **TINT1** | root tsconfig includes `acceptance/**`; migration `0054` | ✔ |
| **S06** | `selectServedRootByStrength`, `SERVED_ROOT_SELECTION_RULE`, `deriveVerdictLabel`, `LABEL_BASIS_INCOMPLETE_MARK`, `RETIRED_SERVED_ROOT_RULE_NOT_WRITABLE`, `verdictLabelPolicy`, `servedRootSelection`, migration `0055`, kernel rule history | ✔ |

**Mark vocabulary** *(recounted in r4b per codex merge N2 — the r4 landmark log's
"86" was a source-line span, not the array's cardinality)*: structural element
counts are **31** at base `7433be7`, **31** at integration `362299d1`, **32** at
lane parent `6624c3fa` and **32** at the merged tip — so T6 has no kernel diff at
all and there is exactly ONE mint, S06's `LABEL-BASIS-INCOMPLETE`, placed mid-list.
The **DR-176 four-member tail is byte-unchanged**
(`HIDDEN-UNJUDGEABLE`, `DERIVED-STANDING-UNREVIEWED`, `HIDDEN-LOW-SCORE`,
`UNAUTHORED-BRANCH-HALTED`). `.hermes/TOOLING-TRAPS.md` did not conflict: this lane
appends to the main checkout's copy, not the worktree's.

Nothing was resolved in a way that changes a landed lane's semantics, so no BLOCK
was owed.

## 4 · Verification at the merged tip

`pnpm run generate:contract` → exit 0.

### Clusters ×3 — worst run wins (`logs/s06/r4/merge-clusters.log`, tip in header)

| cluster | run 1 | run 2 | run 3 | verdict |
|---|---|---|---|---|
| C1 selector + retirement scan | 15/15 | 15/15 | 15/15 | **GREEN** |
| C2 ladder + banner + rule history | 24/24 | 24/24 | 24/24 | **GREEN** |
| C3 production seam + HYG consumer + B3 history | 9/9 | 9/9 | 9/9 | **GREEN** |
| C4 production entry point | 5/5 | 5/5 | 5/5 | **GREEN** |

### The merged lanes' own clusters (`merge-t06-tint1-clusters.log`)

Run because a merge that keeps my tests green while breaking the lane I merged is
not a merge: `tests/unit/t06-review-teeth.test.ts` **10/10**,
`tests/integration/t06-review-teeth-database.test.ts` **9/9**,
`tests/integration/tint1-upgrade-migration.test.ts` **3/3**.

### Typechecks

| gate | base `362299d1` | merged tip | pair |
|---|---|---|---|
| root `tsconfig.json` (now includes `acceptance/**`) | — | **exit 0** | — |
| `apps/ui/tsconfig.json` (D14/D16) | 1 error, exit 1 | 1 error, exit 1 | **byte-identical** |
| `web/tsconfig.json` (D14/D16) | 1 error, exit 1 | 1 error, exit 1 | **byte-identical** |

Both D14 errors are the known pre-existing `layout.tsx(3,8) TS2882`.

### Zone — set-equality by name against the merge base

| | Test Files | Tests |
|---|---|---|
| base `362299d1` | 12 failed / 168 | **14 failed / 1347** |
| merged tip | 12 failed / 172 | **14 failed / 1386** |

`comm` is **empty in both directions** (`zone-failure-set-base362299d1.txt`,
`zone-failure-set-merged.txt`): **SET-EQUAL BY NAME — zero failures attributable to
this merge.** The 39-test delta is this lane's own tests, all passing. The 14 names
include `registration.test.ts` S3c B4 (the load-coupled RSS curve) at **both** ends,
so it is the integration base's, not this merge's.

## 5 · Findings — one CLOSES at this tip

**F-S06-6 · CLOSED by the merge.** The `acceptance/adversarial-corpus.test.ts:238`
`TS2741` that failed the acceptance-config typecheck at BASE and TIP in r2/r3 is
**gone**: TINT1's tsconfig repair brought `acceptance/**` into the ROOT config and
the root typecheck now exits 0 covering it. The finding I routed out of contract was
fixed by a lane I merged — verified at this tip, not carried forward on faith.

**F-S06-7 / F33 · unchanged**, ticketed to T3C (`panelPolicy` absent from `main.ts`
and `dev-runner-policy.ts`); codex r2 confirmed it is not double-counted.

**F-S06-8 → D24 ADDENDUM-2 · adopted**; the r4 harness enforces both the ADDENDUM
(token = mutation) and ADDENDUM-2 (dirty-tree refusal) by construction.

**V-S06-1 · WITHDRAWN** — answered by J18 (§2).

## 6 · Bounds

Never pushed. Integration was merged INTO the lane; the orchestrator owns the
reverse merge and D15 batch b9. No board or DECISIONS file touched. No register
value re-declared; `packages/register` still untouched by this lane. Migrations
0055 (S06) sits above 0053 (T6) and 0054 (TINT1) per D25's registry, unchanged.
Self-report `## r4` filed BEFORE this marker.

---

## r4b (merge-review repairs) — filing r4b = rework 2/3 (J19)

`SKILLS LOADED: heartbeat, heartbeat-worker, superpowers:using-superpowers, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:receiving-code-review`

Merged tip unchanged: **`e040b1ee5322b3343987632659509e963d0ccd05`**, tree
`2131932e0ce3bd12a40ea045b2bdd3910b8e9050`. **No product change in this filing** —
one code comment, three evidence/record repairs.
`git diff --summary 7433be7..HEAD | grep -c "mode change"` → **0**.

Codex's merge review found **no product defect in the resolution**. All four items
are mine to repair except N2's packet half; each was verified before acceptance, not
transcribed.

### B1 — the root typecheck is now bound to the committed tip · REPAIRED

The r4 record was stamped `12:42:11`; merge commit `e040b1ee` is stamped `12:42:55`.
Nothing in that log named a commit, a tree or a porcelain state, so "the tree I
compiled is the tree I committed" rested on my word. Re-run **after** the commit, on
a clean tree, with all three stamped (`logs/s06/r4/b1-root-typecheck-committed-tip.log`):

```
# commit (full) : e040b1ee5322b3343987632659509e963d0ccd05
# tree   (full) : 2131932e0ce3bd12a40ea045b2bdd3910b8e9050
# porcelain     : 0 modified files (0 = clean committed tree)
$ npx tsc --noEmit -p tsconfig.json
root typecheck exit=0
# porcelain AFTER the run: 0
```

The tree id matches the one codex's own metadata read names, so the record and the
review are talking about the same object.

**And the same gap, one commit later — closed rather than argued.** Committing N1's
comment repair moved the lane tip to `9413114c`, so the record above names a
commit that is no longer the tip. All 22 changed lines are comments and none is
code (`logs/s06/r4/b1-tip-provenance.log`) — but "a comment cannot change what tsc
decides" is an argument, and this filing exists because I twice filed a true
conclusion on an argument. A second typecheck is therefore bound to the **filed
tip**:

```
# commit (full) : 9413114cc26088b44e7bd97d1489fa12c905b8de
# tree   (full) : d888dcf21f2d61ca5f7d77202b0ab1ceeed0f9db
# porcelain     : 0
$ npx tsc --noEmit -p tsconfig.json
root typecheck exit=0
```

Log: `logs/s06/r4/b1-root-typecheck-filed-tip.log`.

### N1 — the resolver reads FOUR fields, not two · CORRECTED

I claimed `resolveTrueUnjudgedReasons` reads only `mark` and `subjectRef`. Verified
against the function before accepting the finding:

```
$ awk '/^export async function resolveTrueUnjudgedReasons/,/^}/' packages/serve/src/index.ts \
    | grep -oE "record\.[a-zA-Z]+" | sort -u
record.mark
record.reviewOutcome
record.subjectRef
record.terminalTransportOutcome
```

`reviewOutcome` and `terminalTransportOutcome` are the fields that select and
validate T6's review-versus-transport truth arm. Calling them irrelevant is exactly
the note that would let a later change to either one pass review unexamined.

**The widening is safe on a stronger argument, which I had and did not use:**
`PreservedConditionMarkRecord` is
`Omit<ConditionMarkRecord, "servedRootRule"> & { servedRootRule: ServedRootRuleHistory | null }`
— every field has the same type and meaning in both union arms, the **only**
difference is `servedRootRule`, and the resolver never reads it. The body is
otherwise unchanged from integration `362299d1`, so no T6 truth-binding decision is
weakened.

**The bound on that argument, stated rather than overclaimed** (merge re-review):
it is robust to the resolver reading any OTHER `ConditionMarkRecord` field, because
every other field is preserved identically across the two union arms. It is NOT
unconditional. It holds *because* the resolver does not read `servedRootRule` — the
single field whose admitted type differs. If `resolveTrueUnjudgedReasons` ever
branches on `servedRootRule`, a preserved row carrying a retired history value and a
fresh row could drive different decisions, and this proof must be redone. My r4b
text said the argument "cannot go stale"; that was false in exactly that way.

Corrected in three places: the code comment at the resolver, the r4 section's
resolution rationale (marked as corrected in place), and the r4 self-report.

### N2 — the vocabulary count was a line span; there is ONE mint, not two · RECOUNTED

`CONDITION_MARKS length: 86` was `grep -c` over source lines matching a
quoted-string pattern. Structural recount — array body extracted between its
declaration and terminator, quoted members counted — at all four relevant trees
(`logs/s06/r4/merge-landmarks-recount.log`):

| tree | members | DR-176 tail (last four) |
|---|---|---|
| base `7433be7` | **31** | HIDDEN-UNJUDGEABLE · DERIVED-STANDING-UNREVIEWED · HIDDEN-LOW-SCORE · UNAUTHORED-BRANCH-HALTED |
| integration `362299d1` | **31** | *(identical)* |
| lane parent `6624c3fa` | **32** | *(identical)* |
| merged tip `e040b1ee` | **32** | *(identical)* |

`git diff --stat 7433be7 362299d1 -- packages/kernel` is **empty**: T6 minted no
condition mark, so the r4 report's "both lanes' mid-list mints" was wrong and is
corrected in place. There is exactly **one** mint — S06's `LABEL-BASIS-INCOMPLETE`,
at position 27 of 32, five members before the end and therefore outside the DR-176
tail, which is byte-identical at every tree above.

The r4 landmark log stays on disk as the superseded record; the recount supersedes it.

### N3 — both `# ## r4` headings are real `## r4` headings · REPAIRED

Both artifacts carried `# ## rN` — an H1 whose *text* began with literal hashes, so
a parser anchored on `^## r4` found nothing and a human reading the render saw a
heading that looked fine. Repaired in **all three** appended sections of both files
(r2, r3, r4), not just r4:

```
report: ## r2 (357) · ## r3 (637) · ## r4 (808)
self:   ## r2 (201) · ## r3 (343) · ## r4 (452)
```

`grep -nE "^# ## "` over both files returns nothing. Line 2's SHA is recomputed
below over the corrected text.

### Unchanged and re-affirmed

Everything codex's static record confirmed stands: the two content conflicts and the
type seam resolved without weakening either landed lane, migrations uniquely ordered
`0053 → 0054 → 0055`, D14/D16 payloads byte-identical, zone failure-name sets
identical at 14 names, the four r4 mutant transcripts admissible under D24 + both
addenda, and the ceremony record routed to W12 by J18.

Findings carried: **F-S06-6** closed by the merge; **F-S06-7 / F33** now being fixed
in lane T3C (with **F34**, a third member of the same class that the T3C sweep
found: `claimTimeProbe` is never passed either, and unlike F33 its absence is
*silent*); **F-S06-8** adopted as D24 ADDENDUM-2.
