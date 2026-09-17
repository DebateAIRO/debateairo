# CODEX REVIEWER PACKET — lane/t17t9 r2 (rework round 1 of 3) · ON gpt-6-astra (D65)

```
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9
base tip      : d08ee9283244dcfb76d68820360810c7749940d6
r1 tip        : b763ffb7
r2 tip        : 9818b56c
base..r2      : 9 files changed, 619 insertions(+), 49 deletions(-)
r1..r2        : 9 files changed, 367 insertions(+), 134 deletions(-)
```

**You are the first reviewer of this lane on gpt-6-astra; r1 was gpt-5.6-sol.** Its verdict file is
`agent-reports/t17t9-codex-r1.md`. D65: where you disagree with r1 on a point of fact, that is a
finding, not noise — say so explicitly.

Orchestrator committed the seat's work under a precommit manifest (`logs/t17t9/precommit-manifest-r2.txt`,
9/9 MATCH). `apps/runner/src/index.ts` changed by exactly one character (verified: `?` removed
from `synthesisRolePolicy`).

## r1's findings and what came back

**BLOCKING (r1) — the maximum path was never taken.** The T17 double returned `satisfied: true`
every round; the loop exited after round 1; "94 observed" was a one-round run. Now: the double reads
the round from the packet the runner sent and THROWS rather than defaulting; the test asserts six
role sites and a 106 ledger total BEFORE reaching the stale expectation. Seat derived
88 + 6×3 = 106 before measuring, then measured:
`INITIAL:1=3, RETRY:2=3, RETRY:3=3, EVALUATOR:1=3, EVALUATOR:2=3, EVALUATOR:3=3 | role attempts 18 | ledger total 106`,
identical in three runs. The stale seven-site / tightness assertions stay RED (F-T17T9-3, V's).
**Verify the 106 from the retained ledger output, not the prose; verify the double cannot
default.**

**FOLLOW-UP 3 (r1) — class closure.** `synthesisRolePolicy` is REQUIRED; the four TS2741 sites
repaired; mutant M3 (omit the field on the acceptance path) → `tsc` EXIT 1 with
`acceptance/main.ts(448,66): error TS2741`. **The defect that produced this ticket is a build
failure.** The derived text guard stays as interim, its "makes omission impossible" claim removed;
seat notes four of the five gated fields remain optional (`verdictLabelPolicy` most sharply).

**FOLLOW-UP 2 (r1) — provenance 5 of 5.** All five T16 families resolved and checked in one place;
RED showed four families accepting a foreign-provenance row; GREEN 12/12 ×3. **The seat's own
strongest counter, stated by it:** it consolidated three register reads OUT of `acceptance/main.ts`
INTO the policy so every check is reachable by a test in its contract — "arguably more than
FOLLOW-UP 2 asked"; behaviour unchanged (8/8, 1+1, three runs). **Judge scope.**

**FOLLOW-UP 4 (r1) — counts.** Nine committed files; three downstream causes. Disclosed: the two
traps went to the MAIN checkout's shared `TOOLING-TRAPS.md`, not the lane branch (the contract
gave a relative path and two copies exist).

## Suites (seat; verify)

runtime-policy 12/12 · class guard 2/2 · dev-deployment-register 8/8 · database omission test 1/1 ·
t17 1/2 (F-T17T9-3) · ceremony 1/2, mono-panel 0/1, panel-multi-maker 0/2 (F-T17T9-1, F-SEALEDROWS-B
— separately ticketed, the next lane) · tsc 0 · lint EXIT 1 = the three pre-existing obs-capture
edges (D15 ADDENDUM: judge the architecture audit by the ABSENCE of a new violation). 29 r2 gate
records, all CLEAN-STATE unchanged.

## Questions

1. Is 106 the true maximum under the sealed bounds, or is there a path (a repair attempt inside a
   round, a panel member) the fixture still does not produce?
2. Does making the field required break anything the four repaired sites do not cover — a caller
   outside the test tree, a scheduler, a CLI?
3. The consolidation of three reads into the policy: in scope, and safe?
4. Provenance: is "all five" actually all the families the acceptance path reads, or is there a
   sixth?
5. **A collision check the orchestrator will act on:** lane/w3b (W3 + T1's catch-up, pending its own
   review) also touches `apps/runner/src/index.ts` (conflict resolution from T1's base) and
   `tests/integration/database.test.ts` is touched here. Name any file where this lane and a T1
   merge would fight.
6. **Packet audit.** `packets/t17t9-worker.md`, `dispatches/t17t9-2.txt`. Defect #10 admitted.
7. **MERGEABLE?** Say what, if anything, should wait.

## Method

Static; no mutating git; verify by artifact; scoped runs only; absolute paths — mission dir `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`.

## Output — ONLY these two files

```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-codex-r2.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-codex-r2-self.md
```

Line 1 exactly:
`CODEX REVIEW T17T9 r2 — <APPROVE|CHANGES> · comments read through: t17t9-rework1-2026-09-05`

Finding counts BLOCKING / FOLLOW-UP; per-finding **File/line · Input → wrong outcome · Required
fix**; `## Disagreements with r1` (or "none"); `## Packet audit`; `## Not verified`; `## PREDICTIONS`;
final line `MERGEABLE: yes|no — <one sentence>`.

---
> **Orchestrator corrections 2026-09-05 (codex r2 F3), appended:** the dispatch is at
> `packets/dispatches/t17t9-2.txt` (this packet cited it relative to the mission root);
> `apps/runner/src/index.ts` changed in **r2**, not r1 (r1 left it byte-identical); `acceptance/main.ts`
> numstat is +13/−37 (net −24) base..r2 and +12/−44 (net −32) r1..r2 — "−50" was the changed-line
> total, not the net. Line counts are stated with their range from here on.
