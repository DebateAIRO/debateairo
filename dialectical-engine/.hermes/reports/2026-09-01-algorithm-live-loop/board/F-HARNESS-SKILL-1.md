# [claude@fable-5] F-HARNESS-SKILL-1 · the Skill tool cannot load `heartbeat-worker` inside an Agent-tool seat

```yaml
state:
  ticket: F-HARNESS-SKILL-1
  risk_tier: low
  status: queued
  owner: { agent: claude, session: orchestrator }
  contract: { allowed: [packets/*.md (launch prompts), DECISIONS.md], readonly: [—], forbidden: all_others, verification: [the next worker launch prompt names the role contract's markdown path; the seat's SKILLS LOADED line says how it was read], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t17t9-3-r1-2026-09-05
```

Filed by the F-T17T9-3 seat (P7): in a seat launched by the Agent tool, `Skill(heartbeat-worker)` returns "Unknown skill"; the seat read the contract as markdown from the repo instead and said so. The W5 r3 seat declared the same skill loaded without saying how. **Fix (orchestrator):** every worker launch prompt gives the role contract's absolute markdown path as the fallback (`<DE>/.claude/skills/heartbeat-worker/SKILL.md`) and asks the seat to state in SKILLS LOADED whether each was loaded by tool or read as markdown. No protocol change: the router already says non-Claude seats read them as markdown; Agent-tool seats are in the same position.
