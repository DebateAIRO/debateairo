# REV-06 — blind CODE review of S02 · ticket `t_a95a01b2`

**Seat:** blind CODE REVIEW lens · **Mission:** public-debate-access · **Board:** public-debate-access  
**Round:** 1 of max 3 · **Default posture:** REFUTE  
**Verdict:** **REWORK**

## SKILLS LOADED

`heartbeat-protocol`, `heartbeat-reviewer`, `verification-before-completion`

Also read in full before probing: goal packet `packets/REV-06.md`, `.hermes/TOOLING-TRAPS.md`.

Did **not** load `receiving-code-review` (no author contest in this turn). Naming a skill not loaded is a fabrication finding; this list is exact.

## Packet review (orchestrator artifact)

- Packet path resolves from this worktree; instructions match the four attack axes (export wholesale, C5 prop/re-export gaps, render-test discrimination including C3-2 repair re-attack, C6 pin fire).
- Packet correctly forbids live `:3000` / `apps/runner` work and forbids condemning legitimately green REGRESSION-BASELINE / VERIFICATION-ONLY steps.
- Author self-reports are absent from `.hermes/reports/public-debate-access/agent-reports/` (directory empty at start). **Could not check the author's `SKILLS LOADED` line** against the role floor — independence is real; that check is unavailable, not waived.

## What was verified (own probes)

Evidence log: `.hermes/reports/public-debate-access/probes/rev06-discrimination.log`  
Export chain probe: `.hermes/reports/public-debate-access/probes/rev06-export-leak-probe.mts`

### 1. Owner-only value through this page / export (highest-value question)

**Attempted defeat of redaction, not a review of the redaction prose.**

- Traced publish construction in `apps/api/src/publications.ts`: top-level `PublicDebate.answer` is an **explicit field list** (not an `Answer` spread); nodes/edges pass through `redactNodeForPublic` / `redactEdgeForPublic`.
- `buildPublicAnswerExport` (`apps/ui/lib/v3/publicAnswerExport.ts`) serialises `answer: debate.answer` **wholesale** into a `data:` URI. `PublicHonestyDrawer` renders named fields one at a time.
- Own publish→read→`buildPublicAnswerExport` probe with production-shaped aliased secrets (`raw_artifact`, judgement/propagation/edge/review/ledger refs): **`secret_hits_in_export: []`**, `base_source` / `provenance_ref` = `REDACTED_OWNER_ONLY`, `disagreement: null`, stranger restatement projected to `check_status` only.
- Could **not** add a new member to the converged redacted set under the recursive value-provenance rule with producer-traced aliases in this pass. Fixed-point against the known secret set still holds for the export path.

**Conclusion on safety:** everything currently under `debate.answer` that was in the S01 secret class is safe **by S01 publish-time construction**, not by anything the export function does. Export itself is a pure dump. The day `PublicDebateSchema.answer` gains a field and publish adds it without redaction, the drawer (whitelist) can stay quiet while Export ships it. That is **structural residual risk**, not a reproduced current leak — filed as N1, not B.

S02's export test (`exports only the projected public envelope…`) uses a fixture **without nodes/edges** and only asserts absence of Answer-level owner key **names** already impossible under `PublicDebateSchema.answer.strict()`. It is sensitive to injecting `cost_envelope` into the export payload (MUT_D RED) and to dropping `reversal_point` (MUT_E RED), but it does **not** pin node-level secret absence.

### 2. Mutation affordances C5 cannot see

S02-C5 command (re-run):  
`test -d "apps/ui/app/public/debate/[id]" && { grep -rn "PublicationControl|regenerateNode|unlinkMemory|recordInvestigation|ChallengePopover|InvestigationDrawer" apps/ui/app/public/debate/; [ "$?" -eq 1 ]; }` → exit 0.

**Reproduced gap:**

1. Injected `onChallengeNode={() => undefined}` into the **`DebateCanvas`** mount only (default view is `"tree"` → canvas).
2. Own probe: initial render `PROBE_TEXT_HAS_CHALLENGE=true` with `.canvasViewport` present — Challenge is offered to the anonymous reader. PLAN/SPEC treat a present-but-inert Challenge trigger as an R7 fail.
3. C5 grep still exit 0 (no forbidden import strings).
4. Official `pda-s02-public-tree.test.tsx` `"renders every reading mode…"` stayed **GREEN** (`Tests 1 passed | 3 skipped`) because it asserts `not.toContain("⚐ Challenge")` only **after** switching to Thread, never on the default Tree/Canvas surface.

Current product code **does not** pass `onChallengeNode` / `onChallenge`. This is a **verification hole that would bless a one-line regression**, not a live product leak today. Filed as **B2** because R7's stated proof (C5 ∧ C2 render coverage) does not cover the default view.

`NodeDetailDrawer` (outside the C5 scan root) still renders a hard-disabled `↻ Regenerate` and disabled feedback controls for public readers. SPEC R7's named list does not include Regenerate; PLAN C2-5 already documents this as a known miss. Filed N2, not B.

### 3. Four render tests — discrimination

Baseline before mutants: **12/12** across the four render files + C6. Final restore baseline: **12/12**.

| Mutant | Target | Result |
|---|---|---|
| A — remove honesty drawer mount; base-page `reversal_point` intact | C3-2 repair | **RED_OK** |
| B — wrong drawer `aria-label` | C3-2 | **RED_OK** |
| C — cosmetic `<h2>` title change | honesty suite | **GREEN_OK** |
| F — drawer always mounted | C3-2 repair | **FALSE GREEN** |
| **F2 — drawer always mounted AND Honesty `onClick` no-op** | **C3-2 repair re-attack** | **FALSE GREEN** |
| G — drop `debate.question` | C1 | **RED_OK** |
| H — cosmetic `h1` className | C1 | **GREEN_OK** |
| I — `onChallengeNode` on DebateThread | C2 integration | **RED_OK** |
| J — scoring aria-label rename | C4 | **RED_OK** |
| Canvas-only challenge (above) | C2 integration | **FALSE GREEN** |

**B1:** The C3-2 repair fixed document-wide vs dialog-scoped exclusivity for `reversal_point`, but the oracle still does not prove the trigger **causes** the drawer to open. MUT_F2: Honesty button is a no-op and the drawer is unconditionally mounted → test still passes. That falsifies PLAN's claim that the repaired oracle catches “the trigger existing but not actually opening the drawer.”

### 4. S02-C6 anti-drift pins

- MUT_K: inserted an extra top-bar `<button aria-label="NewOwnerOnly">` inside the owner top-bar region → count/`interactiveElementCount` assertion **failed** (RED_OK).
- MUT_L: inserted `<section className="wsSection" aria-label="Brand new owner section">` into `AnswerHonestyDrawer` → sections equality / length **failed** (RED_OK).

Both pins fire when an affordance is added. Restored from pre-mutant backups; C6 green on final baseline.

## Findings

### B1 — S02-C3-2 acceptance oracle still non-discriminating after the ratified repair

- **Files:** `tests/render/pda-s02-honesty-export.test.tsx` (it `"opens honesty from the public page…"`); product wiring in `PublicDebatePageClient.tsx` (`honestyOpen` gate at mount).
- **Scenario:** Mount drawer unconditionally and replace Honesty `onClick={() => setHonestyOpen(true)}` with `onClick={() => undefined}`. Base-page `reversal_point` unchanged.
- **Wrong outcome:** Test stays GREEN (`Tests 1 passed | 3 skipped`, guard pass) while the trigger does not control opening.
- **Evidence:** MUT_F and MUT_F2 in `rev06-discrimination.log`. MUT_A (drawer absent) correctly RED — sensitive but not specific to causation.
- **Why blocking:** Same exclusivity family as the defect the repair claimed to close; PLAN still advertises a catch this oracle does not deliver.

### B2 — R7 Challenge can be offered on the default Tree view without tripping C5 or the official tree integration assertion

- **Files:** `PublicDebatePageClient.tsx` (optional `onChallengeNode` into `DebateCanvas`); C5 grep root `apps/ui/app/public/debate/`; `tests/render/pda-s02-public-tree.test.tsx`.
- **Scenario:** Add `onChallengeNode={() => undefined}` only on `DebateCanvas` (default `view === "tree"`).
- **Wrong outcome:** Anonymous reader sees `⚐ Challenge` on first paint; C5 exit 0; official `"renders every reading mode"` stays GREEN.
- **Evidence:** `PROBE_TEXT_HAS_CHALLENGE=true`, `official_tree_with_canvas_challenge: vt=0`, C5_with_challenge_prop_exit=0.
- **Why blocking:** The mission's stated R7 proof does not observe the default surface. Current product omits the prop (no live leak); the acceptances would not catch the regression.

### N1 — Export safety is delegated entirely to S01; S02 export test does not pin tree/node secrets

- Wholesale `answer: debate.answer` has no second projection.
- Export test fixture has no nodes; forbidden-key list is Answer-level names excluded by schema.
- Own leak probe is clean today; residual is “day the envelope gains a field.”

### N2 — Disabled Regenerate / feedback controls render from `NodeDetailDrawer` outside C5's scan root

- Visible to anonymous readers; hard-disabled. SPEC R7 list / PLAN C2-5 already carve this. Not an R7 violation as written; still invisible to C5 by construction.

### N3 — Author `SKILLS LOADED` line unverifiable

- Agent reports deleted from this worktree by mission design. Could not perform the reviewer duty to check the author's floor skills.

## What was NOT verified

- Live HTTP / browser against `:3000` (V Row 8 deferred to QA — closed, not a defect).
- `apps/runner` producers beyond read-only grep of serve/judgement/graph (packet forbids touching runner).
- Live DB frequency of any alias.
- Sibling tickets / other lenses (blindness).
- Author self-report / SKILLS LOADED (absent).

## Predictions (blindness check)

- Another lens that only reads the C3-2 repair prose and re-runs the green suite will call C3-2 fixed; MUT_F2 is the cheap counterexample.
- A lens focused only on export key names will miss that export is a dump and call the export path “projected.”
- A lens that greps C5 and sees green, without injecting a canvas callback, will under-rate the R7 proof gap on the default tree view.
- If a sibling reviews redaction fixed-point only, they may PASS on secrets while still owing B1/B2 on S02 verification.

## Where the packet fought this seat

- Highest-value redaction defeat correctly pulled effort into S01 producers; the blocking defects that reproduced in *this* slice were acceptance non-discrimination (again) and a scan-root/prop gap — same families TOOLING-TRAPS already names.
- “Do not edit product code” + “reproduce mutants” required backup/restore discipline; git root is one level above `dialectical-engine/` (TOOLING-TRAPS). Restored; final baseline 12/12; no mutant left in product files.

## Verdict

**REWORK** — close B1 and B2 before another CODE pass is claimable. N1–N3 on the same-day ticket routing.
