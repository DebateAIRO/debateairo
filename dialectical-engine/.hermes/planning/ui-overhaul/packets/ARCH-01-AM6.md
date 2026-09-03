# ARCH-01-AM6 — TopBar premise, two-toggles adjudication, landing-query convention, gate directory (ticket t_a2312f3f)

Same ARCH seat (session bb69b040). The fresh T9-C1 blind review traced its blocking finding
to YOUR premise and found your published gate broken run-verbatim. Four charges. The T9-C1
rework runs in PARALLEL (its fix is skew-free); T3-C1's packet CANNOT be written until your
charge (2) lands.

## 0. Read order
1. This packet. 2. The verdict on t_4487f9b1 (00:26): B1 root cause, N1, N2, class sweep.
3. `apps/ui/app/layout.tsx:44` and `apps/ui/components/TopBar.tsx` (the null-return routes).
4. Your ADR-002 mount enumeration (AM5-corrected, line ~126) + T9/DECISIONS.md:45.
5. ADR-006 §"The 0-new command".

## 1. Charges
(1) FALSE PREMISE: "logged-out `/` does not render TopBar" (ADR-002 + T9/DECISIONS). Reality:
layout.tsx renders TopBar on every route; TopBar nulls only /debate/* and /public/debate/*.
Correct ADR-002; append a superseding row to T9/DECISIONS (never rewrite).
(2) TWO-TOGGLES ADJUDICATION (product design, yours): after T3-C1 mounts ☾ in TopBar, the
anonymous landing shows TWO mode controls (TopBar's + LandingChrome's). Decide and pin:
suppress TopBar on anonymous `/` (how? TopBar is signed-in chrome — does it even render
meaningfully for anonymous?), or suppress the landing's when TopBar is present, or accept
both (justify against the design doc's landing artboard). Write the decision into T3-C1's
dispatch row acceptance so its packet inherits it. THIS GATES T3-C1's DISPATCH.
(3) HARNESS CONVENTION: publish in dispatch-order (T9 rows) — landing acceptance queries
scope to `[data-landing-section]` subtrees; absence assertions stay document-wide. T9-C2 and
T9-C4 inherit.
(4) ADR-006 GATE DIRECTORY (N2): the published block opens with
`cd "$(git rev-parse --show-toplevel)"` which resolves to DebateAIRO/ — the PARENT of the
pnpm workspace — where pnpm exec fails and the pipeline still prints the required `0` having
compiled NOTHING (measured by the reviewer). Fix: cd to the pnpm workspace root
(/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine, or a robust equivalent) AND
add a fail-loud guard (`[ -f apps/ui/tsconfig.json ] || exit 2`). RUN the corrected block
from a WRONG directory to prove the guard fires, and from the right one to prove 0-new —
outputs pasted (your AM2 rule).

## 2. Bounds
Writes: architecture/ADR-002-mode-mechanism.md, ADR-006-ui-test-contract.md,
dispatch-order.md, slices/T9/DECISIONS.md (append only), "AM6" append to
agent-reports/ARCH-01-claude.md, board comments on t_a2312f3f. Nothing else. No product
code, no tests, no git. NOTE: a codex rework seat is live in tests/ and
apps/ui/components/landing/ — do not read those as stable, and touch nothing outside your
writes.

## 3. Handoff
Final board comment on t_a2312f3f (LAST write, freeze law): `AMENDMENT COMPLETE: AM6` + one
line per charge + the two-toggles decision with its rationale + pasted gate runs +
`SKILLS LOADED: <list>` + `comments read through: <ts>`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
