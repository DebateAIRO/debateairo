# CODE-T9C4-REV2 — re-verdict on the pairing addendum (ticket t_131b2e6e, epoch=18)

Same reviewer session (9d7b66ea). Your M3 became AM10 (T9-C4-4 amended to positional
[number, title, body] tuples, dispatch-order changelog "AM10"); the worker implemented it
in the same T9-C4 session. Judge the addendum COMMIT: **dd2ba147** (one file,
`tests/render/t9-landing.test.tsx`, T9-C4 block). Verdict: `ADDENDUM SOUND` or
`REWORK — <list>`.

## What to verify (worst run of 3 is the verdict)
1. The implemented assertions match the AM10 cell character-for-character (read the cell
   from dispatch-order first — it is committed at d22fb2bc).
2. Rebuild M3 YOUR way: swap a DIFFERENT body pair than the worker's 01↔02 → RED; also
   try the worker's own pair → RED. Revert byte-exactly (cp+SHA isolation as before).
3. Over-conversion check: the non-per-step copy (hero body, close lines) must STILL be
   containment, not tuple-paired — AM10 says pairing only where the design pairs. If the
   worker converted more than the method steps, that is a finding.
4. The same-loop requirement: number, title, body asserted against the SAME
   `steps[index]` — not three separate loops that could pass on permuted lists.
5. Row-5 verify command (from dispatch-order row 5) 3x.
6. Tree state: HEAD has moved past the target (a later T9-C2 addendum commit 3a637d35
   touches the SAME FILE's T9-C2 block — that is declared, committed work, not dirt).
   The addendum you judge is `git diff dd2ba147^..dd2ba147` exactly. Byte-clean working
   tree at verdict except the standing manifest: `web/app/public/debate/[id]/page.tsx`
   (V's), untracked GPT-ORCH-HANDOFF.md + ui_designs HTML.

## Bounds
Read-only git. Writes: `.hermes/reports/ui-overhaul/agent-reports/CODE-T9C4-REV-claude.md`
("REV2" append) + board comments on t_131b2e6e. Mutant isolation: cp backup + SHA-256
restore; delete backups; `git status` clean over apps/ tests/ at verdict.

## Handoff
Final board comment on t_131b2e6e (LAST write — freeze law): VERDICT line + per-item
CONFIRMED/REFUTED + your mutants + gate outputs + CONFIDENCE + STRONGEST COUNTER +
`SKILLS LOADED:` + `comments read through:`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state needs
no message. Termination requires the spine's goal-specific FULLY DONE condition.
