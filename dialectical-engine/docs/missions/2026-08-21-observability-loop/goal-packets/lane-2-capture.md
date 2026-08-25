# GOAL PACKET — Lane L2 (capture package) — Codex coding seat

Spine §4 bounds: ticket-state block, upstream artifact paths, the single handoff
marker, stop conditions. Nothing else. Route topology lives on the board.

```yaml
state:
  lane: L2
  mission: 2026-08-21-observability-loop
  risk_tier: high
  status: ready            # only after L1/S01 is merged by V
  owner: { agent: codex@gpt-5.6-sol, session: <record yours at WORKER CLAIM> }
  authority_epoch: 1
  worktree: { path: .worktrees/obs-lane-2, branch: obs-lane-2-capture, merge_status: none }
  rework_round: 0
```

## Your tickets — read each in full before touching it

L2 carries FIVE slices in ONE lane, deliberately: they all live under
`packages/obs-capture/` and share one `package.json`, so co-laning guarantees a
single writer on the package scaffold. Work them in this exact in-lane order:

```
S03a  t_489ecbcc   package scaffold          (must land first)
S02   t_8e040ec2   code registry + templates
S03b  t_9b5ca941   capture core              (emit/queue/flusher/redactor/spool/health/gap)
S04   t_d1e18a14   zone classifier + manifest   ┐ these two are independent
S05   t_6e99d607   installers (import-light)    ┘ of each other
```

Read each with:
```
hermes kanban --board observability-loop show <ticket-id>
```
(`--board observability-loop` ALWAYS before the verb; never `boards switch` —
the global pointer belongs to another live mission.)

Each ticket body is authoritative and complete: `contract.allowed`,
`contract.readonly`, `contract.forbidden`, its `tests:` glob, its RED→GREEN
obligation and falsifiable acceptance criteria, GLOBAL-FORBID, GUARD-RAILS.
Do not widen any of them. Claim each slice separately with `WORKER CLAIM`.

## Upstream artifacts (read-only)

- `planning/FinalPlan.md` §B (capture design), §E (zone boundary) — definitive.
- `planning/VerticalSlices.md` §0 (GLOBAL-FORBID, GLOBAL-TEST-SURFACE), §1, §7.
- The merged L1 store foundation is your dependency: `migrations/0034`,
  `packages/db/src/obs-schema.ts`. Read it; do not modify it — it belongs to L1.

## Preflight

1. `git status`; confirm HEAD carries the merged L1 work.
2. `git worktree add .worktrees/obs-lane-2 -b obs-lane-2-capture` — lawful under
   the LANE PLAN approved at `authority_epoch: 1`.
3. `WORKER CLAIM` on S03a with your session id.

## Lessons carried forward from L1 — these cost three review rounds

Read these before you write a test. Every one of them was a real finding:

1. **Exercise the REAL role, never the superuser pool.** L1's blocker hid for a
   whole round because every write assertion ran as owner. If a claim is
   role-scoped, prove it over that role's own LOGIN connection.
2. **Never weaken an assertion to reach green.** L1 retargeted a TRUNCATE
   assertion to a table where it would pass; that is an evidence violation, not
   a fix. If the product cannot satisfy an acceptance claim, report it.
3. **Never strengthen a test by weakening the system.** L1 granted the listener
   USAGE on the excluded `identity` schema purely to sharpen a denial message —
   creating an existence oracle over the security zone. Do not touch the zone.
4. **Test the deployment path, not just the fixture path.** L1's migration was
   undeployable (a missing extension, settings supplied only by the test) and
   the suite could not see it because it always started a fresh, pre-configured
   cluster. Exercise the bare path explicitly.
5. **Read ground truth, not a masked view.** L1's credential guard read a
   catalog view that masks the value it tested, so it could never fire.
6. **Capture RED/GREEN with `file:line` frames intact** — filtered output that
   strips frames is not reproducible evidence.

## Handoff marker (per slice)

```
READY FOR PEER REVIEW:
- worker / session id / ticket / branch+worktree / commit SHA if committed
- files changed · RED/GREEN evidence with exact command output (frames intact)
- allowed-scope evidence · risks · comments read through
```
Post it as a comment on that slice's ticket. Independent Claude Opus reviewers
in distinct sessions review; the reviewer — never you — advances the work.

## Stop conditions

- Any change would touch `contract.forbidden` or GLOBAL-FORBID (the excluded
  zone, `apps/api/src/index.ts:193-235`, the identity block
  `packages/db/src/index.ts:587-603`, migrations ≤0033, `vitest.config.ts`).
- You need a file outside `contract.allowed` — that is a BLOCKER, not a decision.
- A push, merge, or Done would be required — you are authorized for none.
- Two plan properties appear to conflict — STOP and post a blocker; the Router
  routes it to ARCHITECTURE. You never choose between plan requirements.

Return control at a handoff, a genuine blocker, or an IMPORTANT OPERATION, but
keep the session alive and resumable. Silence is normal.
