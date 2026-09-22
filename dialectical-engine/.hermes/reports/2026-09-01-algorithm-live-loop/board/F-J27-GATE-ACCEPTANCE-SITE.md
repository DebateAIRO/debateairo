# [unassigned] F-J27-GATE-ACCEPTANCE-SITE · the settings guard reads one of the two start-up files

```yaml
state:
  ticket: F-J27-GATE-ACCEPTANCE-SITE
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-18 by the orchestrator, from the J20 closure sweep
(`agent-reports/j20-entry-point-sweep-2026-09-18.md`, verdict CLEAN, observations O1 and O2).

**O1.** The class gate that keeps the runner's settings wired —
`tests/architecture/dev-runner-provider-set.test.ts:124` — reads only `apps/runner/src/main.ts`. The
second production construction site, `acceptance/main.ts:450`, has no mechanised equivalent: tonight it
is clean (all 14 optional members passed, all 20 required ones compiler-enforced) because a manual sweep
says so.
**O2.** The gate's key scanner requires a colon (`:199`), so an ES6 shorthand member such as
`acceptance/main.ts:554` is invisible to it. The direction is fail-safe (a false alarm, never a false
pass), but it blocks the one-line fix for O1.
STRENGTH: entailed (the sweep quotes each line).

**Charge.** Teach the scanner shorthand members, then point the gate at both sites. The standing
recommendation `V-ENTRY-1` (make every `WalkingSkeletonSettings` member required at the constructor)
would retire the gate altogether.
