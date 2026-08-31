# ARCH-01-AM4 — micro-amendment 4 (ticket t_40a227bb): T9-C1 write surface omission

Same ARCH seat (session bb69b040). Board `ui-overhaul`. One charge, found by orchestrator
pre-dispatch validation of Wave 1 — an AF-1-class write-surface contradiction caught BEFORE
the seat could preflight-block on it.

## The defect
T9 PLAN HOW (T9-C1 section) rules: LandingPage.tsx composes LandingChrome, LandingHero,
LandingSample, LandingMethod, LandingPricing "in that order. C1 ships it with the five
children as empty stubs; C2 and C4 fill them." Rows 112/113 of your dispatch-order.md agree:
C2's writes include LandingChrome.tsx, C4's writes include the other four files.
But ROW 2 (T9-C1) lists only `page.tsx · LandingPage.tsx · LandingChrome.tsx (mount) ·
t9-landing.test.tsx`. A contract-obedient C1 cannot create files outside its surface, so
LandingPage's imports of the four stubs cannot resolve — module-not-found, the ADR-006 gate
goes red, and the seat correctly refuses. The files C4 "fills" must exist before C4.

## The amendment
In `docs/missions/ui-overhaul/architecture/dispatch-order.md` row 2 (T9-C1), add to Writes:
`apps/ui/components/landing/LandingHero.tsx · LandingSample.tsx · LandingMethod.tsx ·
LandingPricing.tsx` annotated **"empty stubs only — content is T9-C4's"** (exception: the
hero stub must render the exact T9-C1-1 headline, which its own acceptance forces — say so).
Per your own AM2 rule, VERIFY the corrected row against PLAN HOW and rows 112/113 in the same
edit and paste the cross-check. While in row 2, re-check the rest of the row (verify command,
serialization note) against PLAN — your TS2882 catch came from exactly such a trivial charge.
Dated changelog entry naming t_40a227bb.

## Bounds
Writes: dispatch-order.md + "AM4" append to agent-reports/ARCH-01-claude.md + board comments
on t_40a227bb. Nothing else. No product code, no tests, no git.

## Handoff
Final board comment on t_40a227bb (LAST write, freeze law): `AMENDMENT COMPLETE: AM4` + the
corrected Writes cell verbatim + cross-check + `SKILLS LOADED: <list>` +
`comments read through: <timestamp>`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
