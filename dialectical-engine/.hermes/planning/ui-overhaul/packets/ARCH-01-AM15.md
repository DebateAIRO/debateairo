# ARCH-01-AM15 — fidelity cells for the first PARALLEL SLICE WAVE (T1-C3 · T5-C1 · T3-C2)

Same ARCH session (bb69b040). V ruled tonight (now §6 of the orchestrator skill, quoted
for you): vertical slices are the unit of Done (Done = V's veto after personally
testing), each slice runs in ITS OWN WORKTREE, fleets run IN PARALLEL across slices, and
merge conflicts are managed at merge time — shared files no longer serialize slices.
Worktrees `slice/t5` and `slice/t3` exist (cut from dev at af0db9af); T1 finishes in the
main tree (transition rule).

Your FIDELITY LAW (AM14) gates this wave at pre-dispatch. The three next clusters were
planned in the string-assertion era; write their fidelity cells now.

## Charges — for EACH of the three clusters, per the law's two halves
1. **T1-C3** (row 9: set-aside, synthesis, publicMode — DebateCanvas + SynthesisPanel):
   the visual truths from the binding original's debate-view screens (set-aside
   affordance, the synthesis/verdict strip with `--gold-text` treatment per your own
   ADR-005 note, publicMode locks). Real-browser half via the DOM-DUMP KIT; V-QA half
   as recorded questions.
2. **T5-C1** (row 11: drawer open + core sections — NodeDetailDrawer): the drawer's
   design values from the original's drawer screens (surface, elevation/shadow, section
   anatomy, the full review line that Q-11 reserved for THIS surface). Same two halves.
3. **T3-C2** (row 14: library lists — `Your debates` / `Public debates` recase +
   `4 TOTAL` count chrome): design values for the list rows/cards; note its verify
   already carries the pda-s03 label-recase migration (AM5 row 14) and the routed
   one-liner t_1867dac0 (dangling comment fix) folds into its packet. Same two halves.

## Also
- Quote exact values from the BINDING ORIGINAL (`ui_designs/DebateAI Design Document.html`
  — V's hierarchy ruling; the derived design-source.html is convenience only).
- State per cluster which existing PLAN cells stay as-is (content/behavior cells are
  fine — the law adds the visual halves, it does not rewrite working cells).
- Worktree note in each cell's verify context: T5-C1 runs in
  `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/slice-t5/dialectical-engine`,
  T3-C2 in `.../slice-t3/dialectical-engine`, T1-C3 in the main tree — commands are
  cwd-relative and identical; only the tree differs.
- AM5 invariant if any Writes/verify column moves. R-2 (role oracle, row 10) and the
  minted state-surface token stay where AM12b/AM13 put them — do not fold here.

## Bounds
Writes: `docs/missions/ui-overhaul/architecture/dispatch-order.md` (three cell blocks +
changelog "AM15"), `.hermes/reports/ui-overhaul/agent-reports/ARCH-01-claude.md` ("AM15"
append). NO product/test files; no git. Live lanes: two re-verdict reviewers
(read-only + transient in MAIN tree) — none of your files.

## Handoff
Final board comment on t_6aad46ab (the T1 slice ticket — LAST write, freeze law):
`AMENDMENT COMPLETE: AM15 — <per cluster>` + the cells verbatim + invariant +
`SKILLS LOADED:` + `comments read through:`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE condition.
