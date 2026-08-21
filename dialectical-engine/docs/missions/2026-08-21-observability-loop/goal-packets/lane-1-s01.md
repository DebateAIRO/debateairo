# GOAL PACKET — Lane L1 / slice S01 (obs store foundation) — Codex coding seat

Spine §4 launch-packet bounds: this packet carries ONLY the ticket-state block,
the upstream artifact paths, the single handoff marker, and the stop
conditions. Route topology lives on the board and in Claude-Router; you do not
receive, and do not need, the shape of the graph beyond your own ticket.

```yaml
state:
  ticket: t_1fde033d          # board `observability-loop`, port 9119
  slice: S01
  lane: L1
  mission: 2026-08-21-observability-loop
  risk_tier: high             # persistence/migrations + security/auth — never tierable down
  status: ready
  owner: { agent: codex@gpt-5.6-sol, session: <record yours at WORKER CLAIM> }
  authority_epoch: 1
  worktree: { path: .worktrees/obs-lane-1, branch: obs-lane-1-store, merge_status: none }
  rework_round: 0
```

## Your contract is the ticket body — read it first, in full

```
hermes kanban --board observability-loop show t_1fde033d
```

(Always put `--board observability-loop` BEFORE the verb. Never run
`boards switch` — the global pointer belongs to another live mission.)

That ticket body is authoritative and complete: `contract.allowed`,
`contract.readonly`, `contract.forbidden`, your `tests:` glob, the RED→GREEN
obligation with its falsifiable acceptance criteria (G1-acc-6, G1-acc-7), the
GLOBAL-FORBID list, and the GUARD-RAILS. Do not widen it. Do not infer scope
from anything else you read.

## Upstream artifacts (read-only)

- `docs/missions/2026-08-21-observability-loop/planning/FinalPlan.md` §A (store
  design: schema, tables, sequence, roles/grants, triggers, chain columns,
  indexes, views) — definitive above the slice.
- `docs/missions/2026-08-21-observability-loop/planning/VerticalSlices.md` §0
  (GLOBAL-FORBID + GLOBAL-TEST-SURFACE), §1 S01, §7 (guard-rails).
- `migrations/0000_s00.sql` lines 9-29, 289-298, 314-332 — the allocator, the
  NOLOGIN idiom and the `reject_mutation` idiom, **as PATTERN ONLY**. Your obs
  sequence must NEVER be the global allocator (OBS-R031), and obs roles are
  **LOGIN** roles with real connection strings (RT-28), not the NOLOGIN idiom.

## Preflight (do these before any edit)

1. `git status` in the repo root; confirm `HEAD` and that your lane's worktree
   does not already exist.
2. `git worktree add .worktrees/obs-lane-1 -b obs-lane-1-store` — lawful ONLY
   because the LANE PLAN row is approved at `authority_epoch: 1`. Work only
   inside that worktree.
3. Post `WORKER CLAIM` as a comment on t_1fde033d with your Codex session id,
   the branch, `assignment type: first_pass`, and your next action.

## TDD is mandatory (spine TDD LAW)

RED first: the grant/schema/trigger tests fail because no `obs` schema exists.
Then the smallest change that turns them GREEN via `migrate()` applying
`0034_obs_foundation.sql`. Attach the failing-then-passing evidence with exact
command output to your handoff. Tests-after without RED evidence is an evidence
violation. If TDD is genuinely impractical for part of the slice, post a
blocker for a waiver — never self-waive.

## Handoff marker (first-pass work ends HERE — not at Hermes review)

```
READY FOR PEER REVIEW:
- worker: codex@gpt-5.6-sol
- worker CLI session id:
- ticket: t_1fde033d (S01, lane L1)
- branch/worktree: obs-lane-1-store / .worktrees/obs-lane-1
- commit SHA if committed:
- files/artifact changed:
- RED/GREEN evidence: <exact command + output, failing then passing>
- tests/checks with exact output:
- allowed-scope evidence: <proof every changed path is in contract.allowed>
- risks/open questions:
- comments read through:
```

Post it as a comment on t_1fde033d. An independent Claude Opus reviewer in a
distinct session reviews next; the reviewer — never you — advances the work.

## Stop conditions (post a blocker on the ticket and stop)

- Any change would touch `contract.forbidden` or the GLOBAL-FORBID list —
  especially `apps/api/src/index.ts:193-235`, the identity block
  `packages/db/src/index.ts:587-603`, migrations ≤ 0033, or `vitest.config.ts`.
- You need a file outside `contract.allowed`.
- A push, merge, or Done would be required — you are authorized for NONE of
  these. V performs every merge (OBS-R129).
- Verification is impossible in this environment.
- Architecture/product direction is needed.

Return control at the handoff marker, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal/session alive and resumable. Silence is normal;
unchanged state needs no message. Termination requires the handoff above.
