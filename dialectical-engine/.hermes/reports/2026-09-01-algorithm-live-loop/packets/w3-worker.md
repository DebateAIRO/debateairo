# WORKER PACKET — lane/w3 · W3 · one literal depth ceiling, derived not restated

You are a WORKER seat. Load `heartbeat-protocol`, `heartbeat-worker`, `superpowers:using-superpowers`;
floor `test-driven-development`, `verification-before-completion`, `systematic-debugging`,
`receiving-code-review`. **rework rounds: max 3.**

**Working directory (absolute; provisioned at the integration tip; do NOT re-provision):**
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-w3/dialectical-engine`
— branch `lane/w3`, base `d08ee9283244dcfb76d68820360810c7749940d6`. FIRST ACTION: `git rev-parse HEAD`
must be that tip; if not, STOP.

**Mission directory (absolute — D41(b)):**
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`

Read `board/W3-single-depth-source.md`, then the V ruling it implements — `V-T1B3-1`, option (a),
in `V-DECISIONS-PACKET.md` and `DECISIONS.md`.

## The defect — two literal depth ceilings in shipped code

**The contract owner:** `packages/contract/src/index.ts:112` — `export const EXPANSION_DEPTH_MAX = 5;`
**The restatement:** `packages/register/src/algorithm-policy.ts:257` — `maxDepth: 5` inside the sealed
`envelopeFormulaInputs` row, added by T17 so ADMISSION can refuse an over-bound ask early instead of
minting a ceiling the runner rejects later. T17's line is deliberate and its comment says why; the
BEHAVIOUR is wanted. The LITERAL is the defect.

**The oracle that forbids it is not in your tree.** Lane/t1 is unmerged; its single-source test is
`tests/unit/s1-1-depth-contract.test.ts` in
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1/dialectical-engine`
(READ-ONLY to you). Its J10 rule: *"exempts exactly the two ruled depth exports, in exactly one
file"* — the contract owner — and scans `packages` for any other literal. Your change is what lets
that lane catch up to integration without carrying a violation in. **So your acceptance check is
T1's oracle run against YOUR tree**: copy that test file into a scratch location (not into your
tree), point it at your worktree, and show it goes from RED (today: the restatement at :257) to
GREEN. That is the RED-first for this ticket.

## OUTCOME REQUIRED (D58 — mechanism is yours)

1. The register derives the sealed `maxDepth` from the contract owner. One literal survives, in
   the owner. Admission behaviour is UNCHANGED — the sealed row still carries the value, refuses
   above it, and every existing T17 admission test stays green.
2. T1's oracle, run against your tree, is GREEN — and you show it was RED before.
3. Reconcile anything that assumed the restated form: the row's provenance comment, any test
   that pinned `5` as a literal in the register rather than as the owner's value, and any audit
   (the `packages/register` → `packages/contract` dependency edge must be one the 28-row edge
   table admits; check `auditArchitecture` and say whether it needed a row).

**Do not** touch the contract owner's value or its exports. **Do not** narrow T1's oracle — V
chose derivation over narrowing the rule.

## Contract

```yaml
allowed:
  - dialectical-engine/packages/register/src/algorithm-policy.ts
  - dialectical-engine/packages/register/src/**             # if the derivation needs a sibling
  - dialectical-engine/tests/unit/**
  - dialectical-engine/tests/integration/t16-algorithm-register.test.ts
  - dialectical-engine/tests/integration/t17-envelope-ledger.test.ts
  - dialectical-engine/tools/orphan-audit/**                  # ONLY if the edge table needs a row; say so
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w3/**
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w3.md
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w3-self.md
  - dialectical-engine/.hermes/TOOLING-TRAPS.md      # D61: APPEND ONLY — other lanes also append; append, never rewrite
readonly: everything else, including lane/t1's worktree
forbidden: all_others
```

`apps/runner/src/index.ts` is NOT in your contract and another lane holds it. If derivation needs
it, STOP and name the line.

No board or DECISIONS edits; no push, merge, or self-Done. Never mint, read, or pass a credential
value; BLOCKED `waiting_human` if only a credential can unblock you.

## Stall guard

Scoped runs only; logs under `logs/w3/`; nothing over a few minutes in one call; never two
gate-runs in one worktree writing one log. `gate-run.sh` usage is
`gate-run.sh <worktree> <out.log> <label> <cmd...>`. macOS has no `timeout`.

## Output skeleton

```
# W3 — <round>
## What changed
## VERDICT / CONFIDENCE / STRONGEST COUNTER
## T1's oracle against this tree: RED before, GREEN after
## Admission behaviour unchanged — evidence
## What assumed the restated form, and what I reconciled
## Suites
## Not verified
## PREDICTIONS
```

Self-report at `agent-reports/w3-self.md` before FULLY DONE.

---

# AMENDMENT 1 — 2026-09-05 · ORCHESTRATOR PACKET DEFECT #11 admitted · re-based ruling

Your BLOCKED verdict is accepted in full. **The contract owner I cited does not exist at your base.**
I found `EXPANSION_DEPTH_MAX` by grepping lane/t1's worktree, then wrote it into your packet as
`packages/contract/src/index.ts:112` without checking the integration tree. Verified now: absent at
d08ee928, a6948439 and b763ffb7; present only at d4a3eae9 (lane/t1). Line 112 of integration's
contract is `composition_budget_tier: CompositionBudgetTierSchema,`. Eleventh packet defect in
this mission, second face (relayed without verifying against the artifact). Your four checks,
ending with the compiler, were the right answer to it.

Your other findings are also confirmed by the orchestrator: lane/t1's own tree has NO `maxDepth`
in the register (T17 landed after T1 branched), so T1's oracle is green there and goes RED only
when integration merges in — exactly V-T1B3-1's premise; and a t1 ⇄ integration catch-up merge
CONFLICTS in `apps/runner/src/index.ts` and `packages/budget/src/index.ts` (t1 is 58 behind, 11
ahead).

## The ruling — your option (B), re-stated so it costs T1 no round

W3's work happens **on T1's base**, where the owner, the oracle, and T1's seven site fixes already
exist, and its deliverable is the **T1 catch-up merge with the register derived**:

1. Branch `lane/w3` anew from **lane/t1's tip `d4a3eae9`** (the current `lane/w3` at d08ee928 is
   abandoned; its five gate records and reports stay filed).
2. Merge the **final integration tip** in — the orchestrator names it in the dispatch message,
   after two pending merges (h-fix, t17t9) land, so this catch-up is done once. Resolve the two
   conflicts (`apps/runner/src/index.ts`, `packages/budget/src/index.ts`) **preserving T1's site
   fixes and integration's behaviour both** — say per hunk which side won and why.
3. T1's oracle is now RED on your tree, on exactly the register's sites — that is your RED-first,
   and it is V-T1B3-1's exact scenario.
4. Apply the derivation (`packages/register/src/algorithm-policy.ts` imports the owner; row 17 of
   the audit's edge table amended so `register → contract` is declared — you have already measured
   this at ~6 lines, and on this base the audit's numeric-literal-export rule is satisfied by T1's
   own `GOAL_RULED_LAW_CARRIERS`, which you predicted; confirm).
5. T1's oracle GREEN on your tree. Admission behaviour unchanged (you already showed admission reads
   the sealed row, never a literal).

**This is not a T1 rework round.** It is W3's round 2 on a different base; T1's cap stays spent and
untouched. It is also F-T1B-6's owed merge-in, done by the lane that owns the register change.
Recorded on the board as such.

## Contract — WIDENED to the files the outcome needs (D61, checked this time)

```yaml
allowed_additional:
  - dialectical-engine/apps/runner/src/index.ts             # CONFLICT RESOLUTION ONLY on the catch-up merge; no other edit
  - dialectical-engine/packages/budget/src/index.ts         # same
  - dialectical-engine/packages/contract/src/index.ts       # READ the owner; you do not change its value or exports
  - dialectical-engine/tools/orphan-audit/**                 # row 17 of the 28-row table, and only that
  - dialectical-engine/apps/runner/src/dev-deployment-register.ts   # the seeder's caller you named at :177, if the derivation reaches it
```

`apps/runner/src/index.ts` is granted for conflict resolution on the merge and for NOTHING else; a
non-merge edit there is out of contract. If the derivation genuinely needs a line in it, STOP and
name the line.

## HOLD until the dispatch message names the tip

Both pending merges are in review. Do nothing until the orchestrator's message says: *"integration
is at <tip>; branch from d4a3eae9, merge <tip> in."* Your three traps are recorded; your two
mechanism probes were the right refutation shape.
