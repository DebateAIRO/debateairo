# CODE-T9C3-REV2 — re-review of rework round 1 (frozen target: commit 94c3bcf)

You are the same Opus 5 review seat (session 8795a3eb) that issued the Wave-0 REWORK verdict.
The codex worker has returned rework round 1. Your ticket surface: **t_4ccac5c4**, board
`ui-overhaul`. Your verdict decides: PASS (Wave 0 merged-ready) or REWORK round 2 of 3.

## 0. Read order
1. This packet.
2. The worker's handoff comment on t_4ccac5c4 (21:41, `REWORK READY FOR HERMES REVIEW`).
3. The diff: `git diff 55b18ee..94c3bcf` (product changes only: ModeToggle.tsx + the T9 test).
4. Amended `ADR-002-mode-mechanism.md` and `ADR-001-token-surface.md` (AM2 changelogs) — the
   contracts this rework implements. Your B1/N2 ARCH-side fixes landed there; verify the code
   matches the AMENDED text, not the text you reviewed last round.
Open with `SKILLS LOADED: <list>`. Reviewer floor as last round.

## 1. What to verify (the four findings, closed or not)
- **F-B1**: `import type { JSX } from "react"` present; run the amended ADR-006 0-new gate —
  required 0 (baselines: DebatePageClient(1488,11) TS2322 and app/layout.tsx(3,8) TS2882 —
  a manifest, not a count).
- **F-N1/F-N2/F-N3**: re-apply YOUR OWN mutants M1, M2, M3 exactly as you built them last
  round. Each must now go RED under the worker's new assertions. Then revert each.
- Specificity: the worker also ran three "neighbor" controls (benign adjacent changes that
  must NOT trip the new assertions). Spot-check at least one yourself.
- Re-run: focused acceptance 3x (worst run is the verdict; expect 13/13), render suite
  (expect 18 files / 78 tests), syntax-bound wave-0 oracle (expect 0; boundary computed by
  syntax, and the test must contain NO fixed line number), root typecheck (expect 0).
- Escalation duty: devise at least ONE NEW structural/positional mutant you did not use last
  round. If it stays green against an assertion that claims to cover it, that is a finding.
- Confirm the worker's tree discipline: `git show --stat 94c3bcf` touches exactly
  ModeToggle.tsx and tests/unit/t9-mode-tokens.test.ts.

## 2. Isolation clause (your N6, fixed)
Mutant procedure is now EXPLICIT: file-level backup (`cp <f> <f>.rev2bak`), mutate, run,
restore by `cp`, delete backups, verify `git diff HEAD -- <f>` empty per touched path. This
replaces the worktree law for review-lane mutants in the shared tree — your round-0 workaround
is now the documented procedure. No git write commands; read-only git IS allowed.
**Pre-existing-dirt manifest** (not yours, do not touch, do not count against anyone):
`web/app/public/debate/[id]/page.tsx` (modified, PDA lane).
Everything else must be byte-clean at your verdict.

## 3. Bounds
Writes: `.hermes/reports/ui-overhaul/agent-reports/CODE-T9C3-REV-claude.md` (append an "REV2"
section) + board comments on t_4ccac5c4. Nothing else. Rework rounds context: this is round 1
of 3 consumed; a REWORK verdict from you opens round 2.

## 4. Verdict format (final board comment on t_4ccac5c4 — your LAST write, freeze law)
`VERDICT: PASS — WAVE 0 MERGED-READY` or `VERDICT: REWORK — <blocking list>`, with per-finding
CONFIRMED/REFUTED lines for F-B1/F-N1/F-N2/F-N3, your new mutant's result, the gate outputs
you ran, `SKILLS LOADED: <list>`, and `comments read through: <timestamp>`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
