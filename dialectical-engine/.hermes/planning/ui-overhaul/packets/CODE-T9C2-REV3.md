# CODE-T9C2-REV3 — re-verdict on addendum 3 (ticket t_00a05b8e, epoch=19)

Same reviewer session (8239f6c2) — you passed 6aa9f35, then re-verified the addenda at
ec7c857+f61d68bc as ADDENDA SOUND with four N-findings. Your N8/N9/N11 came back through
ARCH (AM11, commit 447aed44) and the worker implemented them in the same session. Judge
the addendum COMMIT: **3a637d35** (two files: `tests/render/t9-landing.test.tsx` T9-C2
block; `tests/unit/t9-return-path.test.ts`). Verdict: `ADDENDUM SOUND` or `REWORK — <list>`.

## Context you should weigh honestly (it touches your own remedies)
- AM11 ADOPTED your N8 intent unchanged, but DEPARTED from your N9 form with a
  measurement: `z.uuid().safeParse(fixture)` is constant under contract drift (it
  exercises zod, not the contract); the shipped row binds to
  `PublicDebateSummarySchema.shape.public_ref.safeParse`. The worker then measured BOTH
  forms under a fixture-rejecting drift (`z.literal("slug-ref")`): shipped row RED, your
  original form GREEN. Judge whether the departure is correct — refute it if you can.
- A packet defect of the orchestrator's (PD14, t_c4fcdc2c) mandated an impossible probe
  first (`z.string()` — a uuid remains a valid string); the worker blocked correctly and
  the repaired probe is the one above. The detection-class boundary is now stated in the
  handoff: the row catches NARROWING drift only; WIDENING is invisible to any fixture row
  and is ARCH's residual (t_d20dcdb4). Check the boundary claim itself: is the
  narrowing/widening statement accurate? Is anything else in the dangerous direction
  uncovered that this addendum should have caught?

## What to verify (worst run of 3 is the verdict)
1. N8 row: lives in the T9-C2 block; asserts href EXACTLY `/sign-up` (not a prefix/
   contains check that `/sign-up?next=` would satisfy). Rebuild M17 YOUR way → RED →
   restore. Confirm the present-case neighbor still passes under shipped code.
2. N9 row: imports the contract's own schema; same fixture as the accept-case. Rebuild
   the drift YOUR way (any fixture-rejecting schema) → RED → restore. Try to refute the
   departure: construct a drift the SHIPPED row misses that your original form would
   catch (if one exists, that is a REWORK finding).
3. N11: rename only — input byte-identical (`/public/debate/` + 129 a's), row still RED
   under a kind-broadening mutant or state which standing proof covers it.
4. Row-4 verify command 3x (expect 7 files / 108 tests). Render+unit sweep. Typecheck 0.
5. Tree: addendum = `git diff 3a637d35^..3a637d35`; byte-clean working tree at verdict
   except the standing manifest (V's page.tsx + two untracked).

## Bounds
Read-only git. Writes: `.hermes/reports/ui-overhaul/agent-reports/CODE-T9C2-REV-claude.md`
("REV3" append) + board comments on t_00a05b8e. cp+SHA mutant isolation; backups deleted;
`git status` clean over apps/ tests/ packages/ at verdict.

## Handoff
Final board comment on t_00a05b8e (LAST write — freeze law): VERDICT + per-item
CONFIRMED/REFUTED + your mutants + gates + CONFIDENCE + STRONGEST COUNTER +
`SKILLS LOADED:` + `comments read through:`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state needs
no message. Termination requires the spine's goal-specific FULLY DONE condition.
