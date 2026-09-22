# PACKET — T7 (adaptive stopping) · four elements per spine §4

## 1. Ticket-state block
Authoritative typed state in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T07-adaptive-stopping.md
(status ready · rework_round 0 · risk_tier high · writable surfaces exactly as its allowed
list states, every path literal).
Working directory: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t7/dialectical-engine
(provisioning in background — verify node_modules + packages/contract/generated/client.ts
before suites; BLOCKED if absent after a reasonable wait).
YOUR BASE IS 7433be7 (batches 1-7: panel, measured edges, atomic reviews all in-tree; T5's
runner drives review+measurement through recordReviewWithMeasurements — your round loop
builds ON that). Base evidence at 7433be7 (D12); baseline: 23 stable-red + flake families
(boarded). δ and ε LIVE IN T16's SEALED ROWS (register v5) — read them through the landed
policy readers, never re-declare.

## 2. Immediate upstream artifacts
- THE SPEC (frozen; quotes goal-v4 lines 169–186 byte-identically):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S05-stopping/SPEC.md
  Substance: after each round, propagate (PURE CODE — the DoD asserts ZERO model calls
  via the ledger). Global stop: no root moved > δ vs the previous round. Branch freeze:
  leverage < ε → no expansion beneath + mark BRANCH-FROZEN-LOW-LEVERAGE (mint it
  canonically — T4/T3's mid-list discipline; the DR-176 slice(-4) tail must survive).
  Depth = ceiling; round-1 floor. Cost note: sensitivity is O(N²) pure-code per round,
  bounded by freeze/stop keeping N small.
- RULING J3 (mission DECISIONS.md; board F2) — BINDING and it OVERRIDES the goal's prose
  ambiguity: leverage is ROOT-SCOPED, reading (b): the freeze quantity for a branch = the
  ROOT-RESTRICTED max |Δstrength| over the recorded per-node fragility rows
  (propagation/src/index.ts:613-618 at 1c9578a — re-locate) of the branch's subtree-root
  sensitivity record; the CALLER (runner) supplies root ids; the recorded all-nodes
  `leverage` field stays recorded, unconsumed by the freeze rule. `resolveLeverage`
  (:637-644 at 1c9578a) — implement it over sensitivityRecords per J3 or delete it in
  this task. Freeze iff strictly < ε; UNKNOWN edges contribute nothing and cannot
  unfreeze a branch.
- RULING J2 (refit duty): your DoD includes drafting the refit protocol note — δ/ε (and
  per J2, dispersion scale + disagreement threshold) get RE-FITTED from the first M≥2
  acceptance run at closure; you DRAFT the dated refit-recommendation format in your
  report (the judge executes it at closure; you never edit DECISIONS.md).
DoD (SPEC-quoted, binding): synthetic-graph tests with EXACT numeric examples for
(a) global δ stop before ceiling, (b) one branch frozen while a sibling continues,
(c) round-1 floor, (d) EQUALITY AT ε CONTINUES (not frozen); marks recorded; zero model
calls asserted from the ledger.
Deliverable: commits on lane/t7 (prefix `T7:`) + report at
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t07-stopping.md
with `# T7 STOPPING r1`, `## RED`, `## GREEN` (the four numeric cases shown with their
exact numbers, ×3 set-equal), `## LEDGER PROOF` (zero model calls in the propagation
rounds), `## REFIT DRAFT`, `## SUITES` (root typecheck; D16 gates ONLY if contract/kernel
touched — the mark mint touches kernel: gates REQUIRED then, with base pairs; zone ×3
incl. tests/integration/database.test.ts; full row D15-DEFERRED unless quiet),
`## COMMITS`.

## 3. Handoff marker
First line: `READY FOR PEER REVIEW — T7 r1 · comments read through: packet-t07-2026-09-01`
Line 2: `report sha256: <hash>` (+ reproducing command). Self-report (exact `## r1`)
BEFORE the marker; marker last; frozen after.

## 4. Stop conditions
- RED before GREEN; enumerate the class first (every expansion decision site, every
  round-loop consumer, every place depth is read).
- Superpowers floor: `superpowers:test-driven-development`,
  `superpowers:verification-before-completion`, `superpowers:systematic-debugging`.
- NO live provider calls. Verify the property, never your diff. Set-equality on repeats.
  One-way-door clause (F-T5-10): name any append-only+UNIQUE+filtered-reader shape you
  create or touch.
- Token hygiene: tee to logs/t07/; quote counts only.
- Blocked → `BLOCKED — T7 r1 · <waiting_*> · comments read through: packet-t07-2026-09-01`.
- ~2 hours; rework rounds: max 3.
- Final message = `FILED: <report path>` + marker + the four numeric-case numbers + `## SUITES` verbatim.
