# PACKET — codex review S06 r1 (T10 winner selection + T11 three-state label) · spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T10-T11-selection-label.md
(rework_round 0, status waiting_review). Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S06-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S06-codex-self.md
No tests, builds, git changes, no live provider calls. Fresh codex session.

## 2. Immediate upstream artifacts
RULINGS FIRST (mission DECISIONS.md, path below): J1 (disagreementThreshold dev-provisional
0.25, read from the register), J5/J11 (canonical mark discipline; forced UI label lines),
J6 (single-source surface), J16 (LABEL-BASIS-INCOMPLETE is ANSWER-scoped — verify
consistency, not scope; mode-change count filing law; the acceptance typecheck gap),
D14/D16, D21, D24, D25 (migration registry: 0053 t6, 0054 tint1 landed, 0055 s06),
R7-3 confirm-item defaults 3 = NO, 4 = accept-mapping-now, 6 = YES:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md
THE STANDARD (frozen, verbatim goal 187-221):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S06-selection-label/SPEC.md
THE WORK:
- Diff: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s06 diff 7433be7..HEAD`
  (tip 3665302a = 2 product commits + 1 mode-only commit; 20 files +1549/−51; mode changes 0).
- Report (marker line 1; line 2 `report sha256:` = `sed '2d' … | shasum -a 256`, verified 44afa91d…):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s06-selection-label.md
  + self-report s06-selection-label-self.md beside it.
- Logs: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s06/
  (t10-RED-*.log, t11-RED-unit.log, seam-RED-on-base.log, *-GREEN.log, property-GREEN.log,
  cluster-three-runs-tip.log, d14-*.log, root-typecheck-tip.log, zone-*, register-grep-proof.log,
  mutant transcripts).
- The dispatching packet (review it): /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/s06-selection-label.md
Verify, priority order:
(1) T10 RED on baseline is REAL: `seam-RED-on-base.log` must show the weaker first-configured
    root served under the retired rule at 7433be7 (not a compile failure); `selectServedRoot` +
    `SERVED_ROOT_RULE` DELETED with every consumer migrated (the class sweep in report §2 —
    grep the tip yourself for `first-configured-provider`, `selectServedRoot`, `servedRootRule`,
    `served_root_rule`: product, tests, migrations, acceptance). Tiebreak by code units (not
    localeCompare) — verify the comparator; margin = gap to the runner-up under the same
    order; single servable root → margin ABSENT/SINGLE_SERVABLE_ROOT; loud stops
    SERVED_ROOT_UNRESOLVED / SERVED_ROOT_STRENGTH_UNRESOLVED; receipt =
    ledger.propagation_run.served_root_selection jsonb (rule, served, runner-up, margin,
    tiebreak, candidate count, label) — NULL on the DR-184 catch-up path: is that honest?
(2) T11 ladder EXACTLY the SPEC's rungs 0-4, total and disjoint over the RUNTIME domain
    (null = ABSENT, NaN = INVALID → VERDICT_LABEL_INPUT_INVALID; unordered cuts →
    VERDICT_LABEL_CONTROLS_INVALID); disagreement = the WINNING root's panel dispersion
    (T3's field, carried as `panelDispersion` on the authored node — verify it is the winning
    root's, not the first's); computed BEFORE synthesis from propagated numbers only; the
    property test's oracle is written from the SPEC not the code (3,150 points; check the
    oracle text against the SPEC rung by rung); rung-2 precedence (margin named first) pinned.
(3) NO CODE CONSTANT: γ/high/low/threshold via the new `verdictLabelPolicy` runner setting
    from T16's sealed rows; unsealed family → VERDICT_LABEL_CONTROLS_UNRESOLVED before any
    answer is written; `register-grep-proof.log` — re-run the grep yourself over the diff.
(4) The mark + label are ONE decision: runner attaches LABEL-BASIS-INCOMPLETE (+ typed
    record naming the absent limb) iff the derivation says basis incomplete; persist re-derives
    and refuses LABEL_BASIS_DISCLOSURE_MISMATCH — verify both directions (mark without
    incomplete basis, incomplete basis without mark).
(5) Mint discipline: CONDITION_MARKS mid-list after MISSING-NUMBER, DR-176 `slice(-4)` tail
    asserted; contract enum; serve union + REQUIRED_CONDITION_MARK_RECORDS; exactly one forced
    line in apps/ui/lib/v3/labels.ts and one in web/lib/v3Presentation.ts; three hand-written
    length pins 31→32 (F-S06-3). UNSERVED-MAKER-POSITION untouched.
(6) Migration 0055: replaces 0018's one-member CHECK on serve.condition_mark.served_root_rule
    with a NOT VALID constraint admitting only the new rule string
    `max-propagated-strength-lexicographic-tiebreak` (minted once in packages/kernel, J6) —
    legacy rows keep the retired string (history not rewritten), new writes refused; does any
    READER still assume the old string (serve projections, UI copy, acceptance)? T8's lesson:
    is a preflight needed, or is NOT VALID the honest treatment here? `ledger.propagation_run`
    gains `served_root_selection jsonb` + drizzle mirror in packages/db/src/schema.ts (+3).
    One-way-door clause (append-only + UNIQUE + filtered reader): any new instance?
(7) UI wiring (confirm-item 4): `liveVerdictState` exhaustive; render test
    tests/render/t11-verdict-banner.test.tsx covers all three mapped states; D14/D16 pairs
    byte-identical (BASE captured pre-header-convention — the seat says BASE-full vs
    TIP-minus-header; verify the comparison is sound).
(8) F-S06-2: acceptance/ceremony.test.ts rewritten to derive expectations from recorded
    strengths (+2 assertions) but NOT EXECUTED (needs real CLI providers) and — J16(c) — the
    root tsconfig at 7433be7 EXCLUDES acceptance/**: determine by inspection whether these
    acceptance edits were typechecked by ANY means; if not, say so as a finding (the D15
    suite on integration, whose tsconfig includes acceptance/**, is the binding check).
(9) Mutants (D24 shape): 11 catching RED, 3 neighbours GREEN, 2 non-discriminating RECORDED
    — spot-check three transcripts line by line; assess the two non-discriminating ones (are
    the tests weak or the mutants broken, as claimed?). Cluster ×3 worst-run law; zone base/tip
    13-name sets identical (F-S06-4 load-coupled, not the lane's). (10) Packet review.

## 3. Handoff marker
First line: `CODEX REVIEW S06 r1 — APPROVE|CHANGES · comments read through: s06-r1-2026-09-02`

## 4. Stop conditions
- STATIC only; verbatim re-runs of recorded output only; CANNOT-ASSESS over guesses.
- ~45 minutes; round r1 of max 3. Self-report `## r1` BEFORE the marker. End with PREDICTIONS.
- Final message = `FILED: <path>` + VERDICT line + finding count.
