# /goal packet — ENV-01 (Codex seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_40b756e7` · **Assignee:** codex
**Roster (DR-153):** Codex implements · dual diamond (Opus 5 + Grok) reviews.
Day mode: questions route UP to the orchestrator, never to V.

Standing law: `CODING-LOOP-PROTOCOL.md`. **Read `DR-159` in
`decisions-ledger.md` first — it is V's ratification and this ticket exists to
execute it.** Then read the full ticket body
(`hermes kanban --board debateai-v3 show t_40b756e7`) and
`ratification/DEPTH-01-envelope-proposal.md` for the derivation behind the
numbers.

## What V ratified

After a dual-greenlit proposal, V chose one column out of four conventions ×
two retry regimes:

- **B3-B** — depth counts EXPANSION ROUNDS: `2^(d+1)−1` authored nodes, so
  depth 1 = a root position PLUS its PRO and its CON child.
- **B2-A** — fixed two-segment serve, `serve = 7` at every depth.
- **B1-B** — retry-tolerant ceilings, 3× headroom, because failed and
  timed-out calls are charged to the envelope.

**SEED EXACTLY THESE MEMBERS:**

| depth | max_model_attempts |
|---:|---:|
| 1 | 42 |
| 2 | 66 |
| 3 | 114 |
| 4 | 210 |
| 5 | 402 |

For BOTH reachable tiers — `standard` AND `high-stakes`. **Do NOT seed
`casual`:** the engine escalates any asker below the deployment floor
(`packages/register/src/index.ts:356-365`), so casual members are unreachable.
That is stated in the proposal's risk-tier section and ratified by DR-159.

These are V's numbers. Do not adjust, round, or "improve" them (AC-76/DR-039).

## Must happen in the SAME pass or the runtime dies on startup

1. `acceptance/runtime-policy.ts` pins `runCostEnvelope` to a ONE-MEMBER tuple
   and will REFUSE TO BOOT the moment a second member exists. Unpin it.
2. `acceptance/seed-register.test.ts` holds a byte-faithful expectation of the
   register. Update it, and ADD A CLOSURE ASSERTION that every depth 1..5
   exists for both reachable tiers — so a partial seed fails loudly at test
   time rather than at run time. Precedent: DR-151's `CLAIM_TYPES` closure
   guard, added for exactly this reason.
3. A third hardcoded pin of the old `9` exists at
   `tests/support/v2uiFixtures.ts:119`.

## The reseed, and a trap that already bit once

A register content change forces a FRESH `acceptance/.pgdata`
(seed-freshness guard). **Back the data dir up FIRST.**

The previous backup was accidentally committed to git — 1615 files, ~34 MB,
inside a 152 MB push that failed. `.gitignore` now covers
`DebateAI-V3/acceptance/.pgdata-backup-*/`, so **name any new backup to match
that pattern** or it becomes committable again.

## Two risks V ratified with eyes open — close or make loud, and say which

- **A-1 — the two-segment cap DOES NOT EXIST IN CODE.**
  `apps/runner/src/index.ts:67-74` has `.min(1)` and no ceiling. V's numbers
  ASSUME at most 2 composed segments; a composer emitting 4 breaks even today's
  ratified 9. Either enforce the cap where the ratified number depends on it,
  or make the violation a typed loud failure that names the assumption. Do not
  leave a ratified number silently dependent on an unenforced assumption.
- **A-2 — the 3× attempt bound comes from env vars**
  (`apps/runner/src/main.ts:26-28`) that the envelope MATCH KEY cannot see. A
  deployment changing those silently invalidates V's ceiling. Record it at
  minimum; propose the fix.

## Verify LIVE — do not merely seed

After the reseed, `POST /v1/asks` at **depth 3, tier standard** and show it is
ACCEPTED (not refused for an unresolved envelope member), and show the resolved
envelope basis carries `max_model_attempts: 114`.

**Depth is INERT today** (DR-157 — `apps/runner/src/index.ts` contains zero
occurrences of "depth"; it only selects the envelope member). So the run will
NOT expand into a deeper tree. That is expected, it is PRO-01's job, and you
must not claim otherwise in the handoff.

## DONE WHEN

Members seeded byte-faithfully for both reachable tiers; runtime-policy unpinned;
all three pins of the old 9 updated; closure assertion present; backup taken
under the ignored pattern; A-1 and A-2 closed or explicitly recorded; the live
depth-3 acceptance proven with REAL pasted output; every gate green with REAL
pasted output EACH (`npx tsc --noEmit`, v2-ui typecheck, both vitest suites,
architecture + source audits — the orchestrator re-runs all of them and has
already caught one claimed-green gate this mission); handoff at
`handoffs/ENV-01-codex-handoff.md`; progress line per step in
`handoffs/ENV-01-progress.log`; ticket to `review` with
`READY FOR PEER REVIEW — ENV-01`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable. Silence is normal.
