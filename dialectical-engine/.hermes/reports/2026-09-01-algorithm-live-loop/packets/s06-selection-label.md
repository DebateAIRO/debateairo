# PACKET — worker S06 (T10 winner selection + T11 three-state label) · four elements per spine §4

## 1. Ticket-state block
Ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T10-T11-selection-label.md
(rework rounds: max 3). You are heartbeat-worker; load that contract + the superpowers
floor (test-driven-development, verification-before-completion, systematic-debugging on
any bug). Writable surface: EXACTLY the ticket's allowed list — the lane worktree
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s06
(branch lane/s06 off 7433be7, PROVISIONED: pnpm install + generate:contract done), your
two report files, logs/s06/**. Never push; never merge; never edit board/DECISIONS files.

## 2. Immediate upstream artifacts
- SPEC (FROZEN, verbatim goal 187-221):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S06-selection-label/SPEC.md
- Goal source (Global DoD 28-41, scope law 22-26):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md
- Rulings that bind you (mission DECISIONS.md, path in the ticket): J1 (disagreementThreshold
  0.25 dev-provisional, READ from the register), J5 (canonical condition-mark discipline —
  the T4 template governs any mint), J6 (single-source surface), D13 (max ONE heavy
  suite/typecheck at a time — solo focused runs preferred), D14/D16 (if you touch
  apps/ui/** or web/**: run `npx tsc --noEmit -p apps/ui/tsconfig.json` AND
  `npx tsc --noEmit -p web/tsconfig.json` at BASE and HEAD, file the four logs, pairs must
  be byte-identical beyond your intended diff), D15 (the authoritative suite runs on
  integration, not your lane), D21 (report scheme: marker line 1, `report sha256: <hash>`
  line 2 where hash = `sed '2d' report.md | shasum -a 256`, report FROZEN after filing).
- ANCHORS re-verified at 7433be7 today (goal's dev-baseline line numbers have drifted):
  * T10 deletion target: apps/runner/src/index.ts:1100-1110 (`SERVED_ROOT_RULE =
    "first-configured-provider"`, `selectServedRoot`); consumers at :1233 (servedRootRule
    field) and :2475 (`selectServedRoot(servableMakerPositions)`); read-model rows carry
    served_root_rule (:843, :2590 vicinity). ENUMERATE THE CLASS FIRST: grep every
    SERVED_ROOT_RULE / servedRootRule / selectServedRoot / served_root_rule reference
    (product + tests + migrations) before designing; list them all in the report.
  * T11 replacement target: packages/serve/src/index.ts:662-668 (`deriveHonestVerdict`,
    binary usableBasis→SUPPORTED); its caller :1011.
  * Register rows (migration 0050_t16_algorithm_register_rows.sql, ALREADY SEEDED — read,
    never re-declare): verdictMarginGamma=0.05, verdictHighCut=0.70, verdictLowCut=0.35,
    disagreementThreshold=0.25, disagreementQuantity. Grep-proof in your report that no new
    code re-declares these constants.
  * UI mapping (confirm-item 4, accept-now default): apps/ui/lib/types.ts:613 verdictState
    union ("endorsed" | "endorsed_with_caveat" | "suppressed_no_evidence");
    apps/ui/components/VerdictBanner.tsx (~:35) renders it. Vocabulary WIRING only.
  * Mark mint LABEL-BASIS-INCOMPLETE: kernel CONDITION_MARKS mid-list (preserve the DR-176
    `slice(-4)` positional tail), contract z.enum, serve union, runner node-scope
    projection, production-seam test, one compiler-forced label line per exhaustive switch
    (apps/ui/lib/v3/labels.ts, web/lib/v3Presentation.ts). UNSERVED-MAKER-POSITION marks
    STAY (goal line 191).
- CONCURRENCY: lanes t6/t7/tint1 are in rework off the same base; if they mint marks the
  ORCHESTRATOR resolves mid-list merge conflicts at integration — do not coordinate, do
  not touch their surfaces (stopping, review-outcome disclosure, edge magnitudes).
- R7 defaults binding here (re-presented to V at acceptance; not yours to reopen):
  confirm-item 3 = NO (the round-3 objection stays a mark, never a label input);
  confirm-item 4 = accept-now (banner vocabulary wiring); confirm-item 6 = YES (a solo
  voice can never print SUPPORTED — ladder rung 0).

Order of work (RED before GREEN on every step, rework rounds included):
1. T10: RED = constructed run with REVERSED config order expecting the HIGHER-STRENGTH root
   served — must FAIL on baseline (file the red log). Then: served number = max-strength
   root's propagated strength; margin-to-runner-up in the receipt; deterministic documented
   tiebreak (lexicographic node id); delete selectServedRoot + SERVED_ROOT_RULE and migrate
   every enumerated consumer (the read-model served_root_rule column records the NEW rule
   string — design and document it; the old string must not remain writable).
2. T11: RED = constructed near-tie expecting CONTESTED — must FAIL on baseline. Then the
   ordered, total, disjoint ladder EXACTLY as SPEC rungs 0-4 (rung 0: margin ABSENT via
   single root OR dispersion with fewer than two parseable judgements per s04.ts:270-271 →
   CONTESTED + LABEL-BASIS-INCOMPLETE). Disagreement = T3's `dispersion` field of the
   winning root's reduced judgement on T16's seeded scale. Label computed BEFORE synthesis
   from propagated numbers only (acyclic — the objection is a mark, never an input).
3. PROPERTY test over the (winner, margin, disagreement) cube PLUS the absent-margin and
   absent-dispersion arms (ABSENT/null are runtime values, not NaN): exactly ONE label per
   point of the runtime domain. All three states reachable; each trigger tested.
4. Production seam: the mono-maker path asserts CONTESTED + LABEL-BASIS-INCOMPLETE. Live
   banner renders each mapped state (test; the D14/D16 gates then bind).
5. Commit granularly in the lane; file the report + self-report (murder-case: causes,
   prices, near-misses, dead ends, exact packet-unclear spots).

## 3. Handoff marker
Report line 1: `READY FOR PEER REVIEW — S06 r1 · comments read through: packet-s06-2026-09-01`
Line 2: `report sha256: <hash>` (scheme above). Self-report filed BEFORE the marker.

## 4. Stop conditions
- Rework rounds: max 3, then a V DECISIONS PACKET row. Codex static review follows filing.
- BLOCKED (waiting_human) if anything needs a credential VALUE, a push, a merge, or an edit
  outside your surface — say so and stop; a guess is the most expensive thing here.
- Suites: focused/solo runs in-lane (D13); never the full heavy suite concurrently with
  another lane's; the authoritative suite is D15's on integration.
- Findings against other lanes' code: file as F-notes in your report — never fix in-lane.
- Final message = `FILED: <report path>` + marker line + the RED and GREEN log paths for
  T10, T11, the property test, and the production seam.
