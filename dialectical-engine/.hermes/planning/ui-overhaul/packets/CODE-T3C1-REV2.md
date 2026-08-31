# CODE-T3C1-REV2 — re-review of rework round 1 (frozen target: commit af2d590)

Same Opus 5 review seat (session 6cf246a8). Ticket t_9d3f1f2d. The worker answered your B1
and B2 with the AM7-amended cells (T3-C1-4 trio adopted from your verified form; T3-C1-5
published for the authTopBar pin — commit fadb3d7) and your N2's code half (one-line honest
roleChip, pin marked pending Q-13/t_afb67c94). Your N3 is V's Q-14 (t_5e079d1d); N4 is a T4
routing ticket; N5/N6 are recorded in the ARCH docs. Verdict: `PASS — T3-C1 MERGED-READY`
(closes Wave 1) or `REWORK round 2 of 3`.

## 1. Verify
- Re-apply YOUR M1b (authTopBar mount deleted, topBarActions intact): RED under T3-C1-5's
  case. Re-apply YOUR M6 (TopBar wrapped in div.chromeSlot): RED via P3. Restore both,
  SHA-verify.
- Confirm the trio matches the AM7 cell character-for-character (dispatch-order T3-C1-4)
  and actually renders the REAL documents (no hand-built shells in P1/P2).
- N2 mechanics: the chip is no longer an inert `.btn`, carries the honest title, asserts no
  unknowable session state; the worker's three refutations spot-checked (pick one, run it
  your way).
- Gates: canonical 12-path command 3x (expect 96/96), render suite (20/93), fail-loud
  canonical gate 0-new, oracle 0 with suppression-rule occurrences exactly 1, root
  typecheck 0.
- Tree: `git show --stat af2d590` = exactly TopBar.tsx + t3-library.test.tsx; byte-clean at
  verdict except manifested dirt + .hermes.
- Escalation duty, round-2 bar: ONE probe you have not used, tier judged against
  round-2-of-3 stakes and the named residuals already routed (the {children}-hoist is V's
  closure line t_ec4d5b5f — do not re-file it as new).

## 2. Isolation & bounds
As round 1 (cp backup + SHA restore, read-only git). Writes: "REV2" append to
agent-reports/CODE-T3C1-REV-claude.md + board comments on t_9d3f1f2d.

## 3. Verdict format
Final board comment (LAST write, freeze law): VERDICT line + per-item CONFIRMED/REFUTED +
your probe's result + gate outputs + CONFIDENCE + STRONGEST COUNTER + SKILLS LOADED +
comments read through.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
