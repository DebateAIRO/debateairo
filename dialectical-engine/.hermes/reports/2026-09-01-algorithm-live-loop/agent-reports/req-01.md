READY FOR PEER REVIEW — REQ-01 r1 · comments read through: packet-req01-2026-09-01

# REQ-01 r1

Mission compass + 13 slice directories, transcribed zero-drift from goal-v4 under mission
law D7. Deliverables: `INSTRUCTIONS.md` (99 lines, cap 100) and
`slices/<code>/{SPEC,PLAN,PROGRESS,DECISIONS}.md` × 13 = 52 files.

Frozen-spec hash verified before any quoting:
`shasum -a 256 .hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md`
→ `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986` — matches the packet.
Repo baseline confirmed: `git rev-parse HEAD` → `1c9578a24d5aedd0302fbda5593f66277cd87b98`,
source tree clean (only `.hermes/**` modified), so working-tree line numbers equal
`dev@1c9578a` for every anchor below.

## VERDICT

**FINDINGS** — 5 findings: **2 BLOCKING**, 3 NON-BLOCKING.

Neither BLOCKING finding blocks *this* filing; both block a downstream lane's dispatch
(S05/T7 and S01/T16 respectively) and need a ruling before that seat writes its RED test.
Per D7 nothing was edited: every one of these is a finding, never a correction.

No contradiction was found between the goal and the rulings it implements. All 18 task
headers trace to a dated ruling (I-1…I-5, S1-1…S7-3) and every ruling is covered by ≥1
task. The two BLOCKING findings are goal-vs-repo-reality and goal-internal completeness.

## FINDINGS

### F1 · BLOCKING (blocks S05/T7 dispatch) — the leverage DEFINITION contradicts the code it cites

**WHAT.** T7 defines the freeze quantity two ways in one sentence, and the two disagree.
It instructs the seat to use *"the recorded `sensitivityRecords[].leverage`"* AND defines
that quantity as *"max absolute change in any **root's** strength when that node is
removed."* The recorded field is not root-scoped.

**WHERE.** Goal lines 174–177 (definition) vs `packages/propagation/src/index.ts` at
`dev@1c9578a`:
- `:554` `const strengths = snapshot.nodes.flatMap(…)` — every node with a computed value.
- `:609-610` `const fragility = strengths.filter((record) => record.nodeId !== removed.nodeId)`
  — all remaining nodes, no root predicate.
- `:622` `leverage: fragility.reduce((maximum, row) => Math.max(maximum, row.difference ?? 0), 0)`
- `grep -c "isRoot\|rootNode" packages/propagation/src/index.ts` → **0**. The propagation
  package has no notion of "root" at all, so the recorded field *cannot* be root-scoped.

The *"absolute"* half of the definition **is** satisfied — `:617` uses
`Math.abs(record.strength - after)`. Only the root-scoping clause fails.

**WHY it blocks.** T7's DoD (goal 181–183) demands *"synthetic-graph tests with EXACT
numeric examples"* for four cases, including **"(d) equality at ε continues (not frozen)"**.
An all-node max is ≥ a root-only max, so the two readings freeze different branches at the
same ε and produce different exact numbers at the equality boundary. The seat cannot author
those tests without knowing which quantity is normative, and silently choosing one is
exactly the drift D7 exists to prevent. This also propagates: ε's refit (goal 183–186) fits
whichever quantity the tests assert.

**SUGGESTED ROUTE.** V DECISIONS PACKET row (or judge ruling) recorded in the mission
`DECISIONS.md` *before* S05 is dispatched. Two lawful resolutions, both cheap:
- **(a) the recorded field is normative** → the root-scoping words are descriptive prose,
  corrected on the record, no code change. Note the consequence honestly: a branch whose
  removal moves only its own descendants — never a root — will *not* freeze.
- **(b) the root definition is normative** → T7 computes a root-restricted max over
  `sensitivityRecords[].fragility`, whose per-node rows are already recorded at `:613-618`.
  No new propagation work; the caller must supply the root ids, since propagation has none.

I cannot settle which the author intended: the rationale sentence at goal 176–177 (*"a
subtree's whole influence flows through its root node"*) reasons deliberately about roots,
which argues for (b); the instruction to use the *recorded* field argues for (a). Recorded
as unsettled rather than guessed (router §2.7).

### F2 · BLOCKING (blocks S01/T16 dispatch) — register rows T11 consumes have no seeded value and no refit clause

**WHAT.** T16 must seed every new policy row and its DoD requires *"missing row fails
loudly."* Its `Defaults seeded:` line fixes **δ=0.02, ε=0.01, γ=0.05, high=0.70, low=0.35**
and evaluator-loop max = 3. It does **not** fix a value for the **disagreement threshold** —
it says only *"disagreement threshold on the seeded dispersion scale"*, a units statement —
and the **dispersion scale** row itself has no default anywhere in the goal. Nor do
**repeated-family multiplier** or **downgrade bands** (all listed as rows at goal 88–89).

**WHERE.** Goal 86–92 (row list + `Defaults seeded:`); consumption at goal 205
(*"else margin ≤ γ OR disagreement ≥ threshold → CONTESTED"*) and goal 208–210 (the named
disagreement quantity *"compared on T16's seeded scale"*). Scale is constrained but not
valued by code: `packages/judgement/src/s04.ts:272`
`assertUnitInterval(row.scale, "dispersion scale")`.

**WHY it blocks.** T16 is *"the SOLE owner of every new row/schema/migration; consumer tasks
only read"* (goal 84–85), so no later seat may supply these. The T16 seat must therefore
invent numbers the goal never fixes — drift under D7 — or ship rows that fail loudly and
break T11 and T3. And unlike δ/ε there is **no refit clause**: `grep -n "RE-FITTED"` over
the goal returns exactly one hit, goal 183, naming δ/ε only. So T11's CONTESTED rung is
uncalibratable by construction — the very defect the goal names for δ/ε (*"statically
chosen defaults are uncalibratable"*, goal 185–186).

**SUGGESTED ROUTE.** V DECISIONS PACKET row before S01 dispatch. The cheapest fix that adds
no scope is to reuse two mechanisms the goal already contains: seed **dev-provisional**
values now, exactly as T15b does for role refs (*"Until then the roles run on T16's
dev-provisional defaults"*, goal 317), and **extend T7's existing refit clause** to cover
dispersion scale + disagreement threshold from the same first M≥2 acceptance run. That
keeps S01 unblocked today and makes the values evidence-based at closure. The provisional
values themselves are V's to set — I do not propose numbers.

### F3 · NON-BLOCKING — a known, still-unruled goal residue now enters an executable SPEC

**WHAT.** T9's crash-set sentence — *"COMPONENTS_ONLY survives ONLY for the enumerated set:
… and envelope exhaustion **after protected-core verification**"* — can be read as
preserving the `protectedCoreVerified` guard that the same task **knowingly retires** four
lines earlier.

**WHERE.** Goal 259–262 (the phrase at 260) vs the controlling text at goal 248–251 (*"is
KNOWINGLY RETIRED with it: the envelope terminal fires on HARD_STOP whenever no served
statement exists yet, independent of restatement status"*) and goal 263–266. The live guard
is real and verified: `apps/runner/src/index.ts:2255`
`protectedCoreVerified: servedRoot.restatementStatus === "PASS"`, `:2260`, and
`packages/serve/src/index.ts:380-382` which throws `PROTECTED_CORE_NOT_VERIFIED`.

Already on the record as codex r4 residue —
`../2026-08-31-algorithm-correctness/DECISIONS.md:162-165`: *"V may order the four-word
amendment at acceptance."*

**WHY.** The residue was logged while the goal was a draft awaiting V. It is now the frozen
input to S07, the largest slice (49 goal lines), and V has not ruled. A worker reading
`slices/S07-synthesis/SPEC.md` alone gets the ambiguous sentence quoted verbatim — correctly,
per D7 — with no pointer to the controlling text, and T9's DoD explicitly tests
*"the retired-guard behavior."* Getting this backwards means implementing a guard the goal
retires, caught only at judge review.

**SUGGESTED ROUTE.** No edit. (1) The S07 packet carries the disambiguation explicitly,
citing goal 248–251/263–266 as controlling over 260. (2) The four-word amendment joins the
confirm-item batch V rules on at acceptance. (3) Recorded in `slices/S07-synthesis/DECISIONS.md`
as a pointer once V rules.

### F4 · NON-BLOCKING — T4 makes a band bucket structurally dead inside the exact function T12 rewrites

**WHAT.** T4 removes `RAN` from the judge output schema. The serve band basis counts a
`RAN` bucket, and that count sits inside the span T12 rewrites — so the T12 seat will be
editing a line that, after T4, can only ever produce `0`.

**WHERE.** T4 at goal 113 (`packages/judgement/src/index.ts:26-29,130` — both verified:
`:28` `way_of_knowing: z.enum(["LOOKED_UP", "RAN", "REASONING"])`, `:130` the same enum in
the prompt block). The dead arm: `packages/serve/src/index.ts:562`
`RAN: loadBearing.filter((node) => node.wayOfKnowing === "RAN").length`, inside `:559-568`
— the count site T12 names at goal 273. The feed is judge-sourced:
`apps/runner/src/index.ts:1526` and `:1544` both set `wayOfKnowing: judged.wayOfKnowing`,
projected to serve nodes at `:978`.

**WHY.** The seat will be tempted to delete the dead arm while it is in there. The goal does
not authorize it; the Scope law forbids arithmetic changes (goal 25–26); and the goal
**explicitly parks** *"enum-reachability lint (`@unreachable(reason)`)"* in the out-of-scope
follow-ups at goal 329. Note the asymmetry that makes this worth filing: T6 carries exactly
this warning for a different vocabulary (*"do not rename or tidy the outcome vocabulary
while changing its consumption"*, goal 166–167) — **T12 has no equivalent guard.**

**SUGGESTED ROUTE.** No edit. Carry T6's do-not-tidy instruction into the S08 packet
verbatim in spirit. If a seat concludes the arm must go, it becomes a ticket (router §2.2),
never a silent cleanup inside another task's diff.

### F5 · NON-BLOCKING (clarity) — T6 names an "outcome filter" that does not exist yet

**WHAT.** T6 reads *"`cannot-assess` rows stop seeding judged-standing basis (outcome filter
at packages/judgement/src/index.ts:408-417)"*. The parenthetical reads as though a filter
lives there. It does not.

**WHERE.** Goal 161–162. At `dev@1c9578a`, `packages/judgement/src/index.ts:408-417` is
`readReviewedNodeIds` — a plain `SELECT node_id::text FROM ledger.node_review WHERE run_id=$1
ORDER BY at_seq` with **no outcome predicate**.

**WHY.** The anchor is *correct as the change site* — that absence **is** the defect T6
fixes, and the DoD's RED clause makes it plain. But a seat that greps for an existing filter,
finds none, and concludes the anchor is stale will go hunting through a 2500-line package.
Filed under router §2.2 (a finding is a finding) at low cost, not because the goal is wrong.

**SUGGESTED ROUTE.** No edit. One clarifying line in the S04 packet: *"there is no filter at
:408-417 today — its absence is the defect; add the predicate there."* Also worth pairing
with the verified second consumer at `packages/evaluator/src/index.ts:2476-2480`
(`numericProwessValue`, which already maps `cannot-assess` → `null`), the one T6 warns
against tidying.

## COVERAGE

### Verbatim transcription — 22/22 blocks byte-identical, verified fresh

Verification method: every `## … — VERBATIM, goal lines a–b` block was re-extracted from the
written SPECs and compared byte-for-byte against `"\n".join(goal_lines[a-1:b])` from the
hash-verified goal. Fresh run output: **`VERBATIM BLOCKS: 22/22 byte-identical`**,
**`TASK HEADERS COVERED: 18/18`**, zero DRIFT.

| slice | span quoted | goal lines |
|---|---|---|
| `S00-baseline` | T0 | 69–79 |
| `S01-register` | T16 | 80–96 |
| `S02-hygiene` | T1 · T2 · T4 · T8 | 97–106 · 107–111 · 112–118 · 119–128 |
| `S03-panel` | T3 | 129–143 |
| `S04-edges` | T5 · T6 | 144–159 · 160–168 |
| `S05-stopping` | T7 | 169–186 |
| `S06-selection-label` | T10 · T11 | 188–195 · 196–221 |
| `S07-synthesis` | T9 | 222–270 |
| `S08-band-form` | T12 · T13 | 271–279 · 280–283 |
| `S09-envelope` | T17 | 285–295 |
| `S10-production` | T14 | 296–308 |
| `S11-eval-harness` | T15 | 309–320 |
| `S12-closure` | Scope law · Global DoD · confirm-items · Non-goals | 22–26 · 28–41 · 42–66 · 321–331 |

Goal lines **187** and **284** are the only lines in the tasks block 69–320 not inside a
quote block: both are blank separators preceding a `### T` header, carrying no content.

**Placement judgement the reviewer should check.** The slice-map permits the four global
spans *"quoted once in INSTRUCTIONS.md **or** S12."* Quoting all four in the compass costs
55 lines against a 100-line hard cap and violates *"pointers, never content"* — so all four
went to `slices/S12-closure/SPEC.md` and the compass carries pointers. Line 332 cited by the
slice-map for Non-goals is the terminal empty element after the file's final newline; the
content ends at 331.

### Anchor spot-verification — 22 anchors checked, packet required ≥5, all EXACT

Every `file:line` below was read at `dev@1c9578a` and matches what the goal asserts.

| goal task | anchor | found |
|---|---|---|
| T1 | `apps/runner/src/index.ts:987-996` | `resolveExpansionDepth`, throws `RUN_DEPTH_PARAMS_INVALID` |
| T2 | `web/app/new/NewQuestionForm.tsx:50-51` | the two steering textareas, exactly two |
| T4 | `packages/judgement/src/index.ts:26-29`, `:130` | `RAN` in the zod enum and in the prompt block |
| T8 | `packages/propagation/src/index.ts:156-162` | `rivalOperator` |
| T8 | `…propagation:372-374`, `:538`, `:576-577` | rival evaluation; `rival: true`; the two receipt fields |
| T8 | `apps/runner/src/index.ts:2025-2039` | the strengths receipt persist block |
| T3 | `packages/judgement/src/s04.ts:224-336` | `runJudgePanel` (224) … `applyDeclaredDisagreement` (314) |
| T3/T11 | `…s04.ts:270-271` | dispersion `ABSENT` / `FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS` |
| T5 | `tests/unit/dr184-judged-standing.test.ts:85-105` | the all-UNKNOWN sentinel to be repealed |
| T5 | `apps/runner/src/index.ts:1679-1693` | edge creation; `:1691` `strengthSource: "EVIDENCE_VERIFIER"` |
| T6 | `packages/judgement/src/index.ts:408-417` | `readReviewedNodeIds` — **see F5** |
| T6 | `packages/evaluator/src/index.ts:2476-2480` | `numericProwessValue`, the second outcome consumer |
| T7 | `…propagation:605-626` | `sensitivityRecords` / `leverage` — **see F1** |
| T7 | `…propagation:637-644` | `resolveLeverage` stub returning `LEVERAGE_UNRESOLVED` |
| T10 | `apps/runner/src/index.ts:934-944` | `SERVED_ROOT_RULE = "first-configured-provider"` |
| T11 | `packages/serve/src/index.ts:662-668` | `deriveHonestVerdict` — binary (`SUPPORTED` \| `null`) |
| T11 | `apps/ui/lib/types.ts:613`; `VerdictBanner.tsx:35` | all three mapped strings; `suppressed_no_evidence` |
| T12 | `packages/serve/src/index.ts:559-568` | band basis count site — **see F4** |
| T12 | `apps/runner/src/index.ts:964-984` | `buildFixedSingleRootServeNodes` |
| T9 | serve `:452-455`, `:458-461`, `:474-477`, `:521-524`, `:529-532`, `:554-557` | all six legacy gates, exact |
| T9/T17 | runner `:2255`, `:2260`; serve `:380-382` | `protectedCoreVerified` guard — **see F3** |
| T17 | `packages/register/src/index.ts:158-200` | `StructuralCeilingInput` (158) + `computeStructuralCeilingBasis` (172) + `formula_version: "DR-184-v2"` (197) |
| T14 | `apps/runner/src/dev-runner-policy.ts:105-118` | throws `DEV_RUNNER_POLICY_PROVENANCE_INVALID` |
| CI-7 | `apps/runner/src/index.ts:1633` | `claimClassificationLine: run.questionLine` |

Two spans are supersets of what their prose names, both benign and recorded so no reviewer
re-derives them: `s04.ts:224-336` starts at `runJudgePanel` rather than `measureDispersion`
(T3 wires `runJudgePanel` too), and `register:158-200` starts at the input interface rather
than the function (T17 must extend both).

### Ruling trace — goal vs `2026-08-31-algorithm-correctness/DECISIONS.md`

All 18 tasks trace to a dated ruling; all rulings are covered. Checked and closed with no
finding: T1↔S1-1 and T2↔S1-2 both match the **Stop-1 correction** (contract schema, not the
live form; placebo in legacy `web/` only), not the superseded originals — S1-1's original
*"form becomes a 1–5 selector"* is superseded, so T1 raises no scope conflict with the Scope
law's *"Legacy `web/` is touched ONLY by T2."* T14↔I-2's double gate matches the intake
ruling. Confirm-items 3, 5 and 6 are internally consistent with T11's ladder and T3's
failure policy. Mission `DECISIONS.md` R7-3 already fixes the confirm-item disposition.

### Quality gates on this seat's own output

- `INSTRUCTIONS.md`: **99 lines** (`wc -l`), hard cap 100. **PASS.**
- 52 slice files written = 13 dirs × 4, matching the slice-map exactly; layout not reshaped.
- Every PLAN trace row is a machine-split **verbatim substring** of the goal's own `DoD:`
  blocks, so SPEC→PLAN coverage is complete by construction, and no acceptance criterion
  authored by this seat contains *improve*, *better*, *robust*, *handle* or *appropriate*.
  Read the grep honestly: `grep -rniE '(improve|better|robust|handle|appropriate)'
  slices/*/PLAN.md` returns **13 hits — all of them line 11 of each PLAN**, which is the
  quantifiability law itself naming the forbidden words. **0 hits in any table row.**
- Board files: **none written** (D1). Git: **no commit, no push.**
- Self-report filed at `agent-reports/req-01-self.md` **before** this marker was set.

### Scope note for the reviewer

`heartbeat-requirements` §2 says PLAN.md is *"FILLED by the architecture seat"*, and R7-1
elects **no** architecture loop. I scaffolded the lane stages and the verbatim DoD trace and
left the evidence column to the worker — structuring, not authoring, so it stays inside D7.
But **no seat currently owns writing plan steps beyond the goal's own DoD clauses.** Raised
in the self-report (C8.2) as a gap for the orchestrator, not filed as a finding against the
goal.
