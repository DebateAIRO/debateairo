# PACKET — T2 (steering placebo removed from legacy form) · four elements per spine §4

## 1. Ticket-state block
Authoritative typed state in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T02-steering-placebo.md
(status ready · rework_round 0 · risk_tier low · writable: lane worktree
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t2
on branch lane/t2 — local commits yes, push never — plus report, self-report, logs/t02/**).
Working directory:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t2/dialectical-engine

## 2. Immediate upstream artifacts
- THE SPEC (frozen; your task is the T2 block quoting goal-v4 lines 107–111):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S02-hygiene/SPEC.md
  Substance: remove the two steering textareas from web/app/new/NewQuestionForm.tsx:50-51;
  the form submits empty arrays; contract fields unchanged. DoD: legacy form renders no
  steering inputs; submission still validates; NO OTHER web/ change.
- Mission baseline: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t00-baseline.md
Deliverable: the change committed on lane/t2 + agent-reports/t02-steering.md under
headings `# T2 STEERING r1`, `## RED` (a test asserting the form renders no steering
inputs, shown FAILING on the unmodified base — if web/ has a test harness; if web/ has NO
runnable test harness, say so explicitly with the probe evidence and pin the DoD with a
static assertion test at the repo level instead — the honest path, stated, never skipped
silently), `## GREEN`, `## DIFF SCOPE` (git diff --stat proving web/app/new/NewQuestionForm.tsx
is the only web/ file touched beyond any test file you added), `## SUITES` (typecheck +
pnpm test: exit codes, passed/total, failures named PRE-EXISTING or yours), `## COMMITS`.

## 3. Handoff marker
First line of agent-reports/t02-steering.md:
`READY FOR PEER REVIEW — T2 r1 · comments read through: packet-t02-2026-09-01`

## 4. Stop conditions
- RED before GREEN; the probe-then-declare rule above is the ONLY lawful fallback if the
  legacy app has no test harness — read-only probes documenting old behavior are not RED
  evidence (goal 31-32), so the static assertion must still assert the DESIRED state and
  fail on the base.
- Superpowers floor: `superpowers:test-driven-development`,
  `superpowers:verification-before-completion`; `superpowers:systematic-debugging` on any bug.
- Scope law verbatim: "Legacy web/ is touched ONLY by T2" — and by you, only as this task
  prescribes. Contract fields stay; stored data stays valid.
- Token hygiene: tee to logs/t02/; quote counts only. Commits prefixed `T2:`.
- Blocked → `BLOCKED — T2 r1 · <waiting_*> · comments read through: packet-t02-2026-09-01`.
- ~45 minutes; rework rounds: max 3.
- Self-report at agent-reports/t02-steering-self.md BEFORE the marker.
- Final message = `FILED: <report path>` + marker line + `## DIFF SCOPE` line.
