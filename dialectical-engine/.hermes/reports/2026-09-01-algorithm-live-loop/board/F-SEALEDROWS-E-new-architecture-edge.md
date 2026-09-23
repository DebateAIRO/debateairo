# [claude@opus-5] F-SEALEDROWS-E · a new dependency edge landed into an already-red architecture gate

```yaml
state:
  ticket: F-SEALEDROWS-E
  risk_tier: medium          # the gate that would judge this edge was already failing, so it cannot say whether the edge is admissible
  status: done # PREMISE CORRECTED AND CLOSED 2026-09-04 by codex r3. MY framing was false: auditArchitecture reads workspace dependencies from 28 package.json files (tools/orphan-audit/src/index.ts:9-63) and NEVER scans acceptance/ source imports, so the gate could not have adjudicated this edge green or red — it was not a known-red gate failing to judge, it was never the judge. The edge is SOUND: acceptance already imports @debateai/runner in main.ts and dual-maker-proof.ts, no package edge or cycle is added, and the evaluator prompt is runner-owned behaviour that packages/register would invert ownership to hide. Non-blocking tidiness only: prefer the package export over the relative path
  owner: { agent: claude, session: tbd }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [codex static review]
    human_review: no
  worktree: { path: tbd, branch: tbd, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sealedrows-rework2-2026-09-04
```

Filed by the lane/sealedrows seat and disclosed rather than left to a reviewer. Closing codex
r2's B1a created a new import edge, `acceptance/seed-register.ts → apps/runner/src/index.ts`, so
the seeder can digest the exported constant instead of searching for it.

The seat considered routing through `packages/register` to avoid the edge, and did not: the
register barrel was outside its contract, and the runner index had been granted for exactly this
purpose. There is no import cycle.

**The part worth carrying, which the seat could not check itself.** `auditArchitecture` governs 28
dependency-edge rows, and its test —
`tests/architecture/scaffold.test.ts > matches all 28 dependency-edge rows and structural rules 1–5`
— is entry 5 in the mission's 13 known-red failures. **It was already failing before this edge
existed.** So the gate that decides whether this edge is admissible cannot answer: a new edge
landed into a test that could not have detected it either way.

That is a general hazard, not a fact about this edge: **a known-red gate stops being a gate.** The
D15 set-equality method proves no NEW failure name appeared, which is exactly right and exactly
insufficient here — the failure name was already on the list.

Resolve the edge against the 28-row table on its merits, and record whether the table admits it,
needs a row, or should be reached through `packages/register` after all.

## CORRECTION 2026-09-04 — the hazard was real, the instance was wrong

I wrote that a known-red gate stops being a gate, and attached it to this edge. The general
hazard stands and is worth keeping. **It does not apply here**, because `auditArchitecture` never
inspected this class of import at all — red or green, it was never going to see it. Attaching a
true general warning to an instance it does not govern is its own kind of false finding, and the
reviewer was right to say so.
