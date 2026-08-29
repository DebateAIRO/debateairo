# ARCH-01 — REWORK ROUND 1 of max 3

Your plan was reviewed by a Grok lens that did not write it. Verdict **REWORK**. One blocking
finding, six non-blocking that are yours (a seventh is the Router's, not yours — see the end).
**Non-blocking does not mean optional**: it sets WHEN, never WHETHER. All are ticketed.

**Your handoff must OPEN with `SKILLS LOADED: <list>`** — new law since you last ran (spine
v3.3.0 item 15). You are not charged for its absence last time; it did not exist yet.

## B1 — BLOCKING. Ticket `t_70805572`. Reproduce it before you patch it.

You redacted `abstention.ledger_unknown_ref` and stopped. A more universal handle on the SAME
wholesale-copy path survives. Verified independently by the Router:

- `LabeledNumberSchema.replay_handle` is a **required** string — `packages/contract/src/index.ts:330`
- reachable via `NodeSchema.base_score` (`:447`) and `final_strength` (`:448`), and on every
  PRESENT edge strength
- `apps/ui/components/NodeDetailDrawer.tsx:367,376` renders `replay {handle}` to any reader,
  and the public export would carry it
- `grep -rl replay_handle docs/missions/public-debate-access/slices/*/PLAN.md` → **0 files**,
  while `ledger_unknown_ref` → 2. The gap is in your plan, not in the code.

**Run those greps yourself first.** If the evidence does not hold, say so and change nothing.

Required: redact nested `replay_handle` VALUES at publish (keep the KEY so the envelope shape
stays schema-valid) · a **failing** test for residual handles, named as the acceptance test of
its step · the field listed on the S04 anonymous-exposure checklist.

**Then do the thing you did not do last time: enumerate the handle class exhaustively.** You
found one leak, patched it, and stopped at the second. Walk every field reachable from
`NodeSchema` and `EdgeSchema` and state, per field, whether it is copied, redacted, or absent —
and put that enumeration in the plan so a reviewer can check it mechanically rather than
re-deriving it. A third missed sibling is the failure mode here.

## Non-blocking, yours, all ticketed

- **N1 `t_575435c7`** — the parallel public component tree has no anti-drift step. Two trees
  that must stay in parity, and nothing that fails when they diverge.
- **N2 `t_bc19eccb`** — S02-C1's cluster table says steps 1..3; the bodies define 1..5. A
  cluster with ambiguous membership cannot be verified in one command.
- **N3 `t_19926850`** — S01-C2-2's "verbatim deep-equals" acceptance criterion cannot both pass
  and satisfy the B1 redaction. Resolve in the same pass as B1.
- **N4 `t_a7c376e5`** — DECISIONS prose still says "verbatim, no stripping". DECISIONS.md is
  APPEND-ONLY: append a superseding entry citing B1. Never edit the old line.
- **N5 `t_6f28d98d`** — S03 keyboard accessibility is left UNVERIFIED by design. V's Done
  criterion 1 says the buttons must be "present, **and accessible**". Make it a mechanical
  acceptance test, or say plainly it cannot be one and route it to QA.
- **N7 `t_8fc983bc`** — stale "Row 4, open" prose. **V CLOSED Row 4 on 2026-08-29: both
  `cost_envelope` and `tier_provenance_ref` stay EXCLUDED.** Stale open-row text invites a
  later seat to re-litigate a settled decision.

## V's four closed rulings — a plan step contradicting these is blocking

Row 1 reads yes, mutations no · Row 2 the one legacy publication serves disclosed answer-only
(silent 404 AND silent answer-only both banned) · Row 4 `cost_envelope` + `tier_provenance_ref`
EXCLUDED · Row 5 lane plan approved, programming follows this review.

## Not yours

N6 (`t_163102ba`) says your handoff lacked `SKILLS LOADED`. That is a Router timing artifact —
the gate became law after you launched. The Router verified you DID load your floor in the
correct order (brainstorming at transcript line 296, writing-plans 305, first plan write 346).
No action from you beyond carrying the line this time.

## Bounds and handoff

SPECs stay FROZEN — you edit `PLAN.md` and APPEND to `DECISIONS.md` only. No product code, no
tests, no `PROGRESS.md` (orchestrator is sole writer). Update the mission graph only if the
lane shape actually changes.

Handoff opens with `SKILLS LOADED: <list>`, then `REWORK READY FOR REVIEW` on ticket
`t_f864a84b`, naming each finding and how you closed it. Append a rework entry to your existing
self-report at `.hermes/reports/public-debate-access/agent-reports/ARCH-01-claude.md`: the CAUSE
of stopping at the first leak, and what would have caught the second at design time. Then stop.
