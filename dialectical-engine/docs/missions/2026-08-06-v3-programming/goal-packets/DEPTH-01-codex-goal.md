# /goal packet — DEPTH-01 (Codex seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_d5d1a650` · **Assignee:** codex
**Roster (DR-153):** Fable/Opus 5 orchestrates · **Codex implements** · dual
diamond (Opus 5 + Grok). Day mode: questions route UP to the orchestrator.

Standing law: `CODING-LOOP-PROTOCOL.md`. Ledger overrides on conflict — read
**DR-154** (V's ruling that created this ticket), DR-149, DR-150, DR-151.
Read the full ticket body: `hermes kanban --board debateai-v3 show t_d5d1a650`.

## V's ruling that created this

> *"a debate should go as deep as I select it."* — V, DR-154(1)

V was asked to pick a depth and **declined to pick one**, ruling instead that
depth is an ASK-TIME CHOICE. So the register must carry a member PER SELECTABLE
DEPTH, not the single `{standard, depth 1, max_model_attempts 9}` it holds
today.

`/new` already renders its depth control FROM THE REGISTER (EXEC-01 did that),
so the form will offer exactly what V ratifies and nothing else. **No UI work
is expected in this ticket.**

## THIS TICKET DOES NOT SEED ANYTHING

**You produce a PROPOSAL. V rules the numbers. You do not pick them**
(AC-76/DR-039 — unruled values are register rows or typed loud failures, never
literals chosen by a worker).

Deliver `docs/missions/2026-08-06-v3-programming/ratification/DEPTH-01-envelope-proposal.md`,
then STOP and hand up. Only after V ratifies does anyone seed rows.

## What the proposal must contain

1. **A per-depth cost derivation, counted from REAL CALL SITES — not estimated.**
   For each depth, count what actually fires: JUDGE per node, COMPOSER
   including the ruled `max_recompose`, CONFORMANCE per segment per composition
   attempt, plus FAIR-01's critic leg. Cite the call sites
   (`apps/runner/src/index.ts` has them at `:347`, `:456`, `:748`, `:812`,
   `:831`). Show the arithmetic so V can audit it, not just the totals.
   Ground truth to calibrate against: the settled two-maker run spent **8**
   attempts at depth 1, and a later run spent **6**.
2. **What N should be and WHY it stops there** — cost, latency, or a real
   engine limit. Say which. If nothing in the engine forbids depth 5, say that
   too; V may want to know the ceiling is economic rather than technical.
3. **The same table costed WITH the two blocked tickets**, because V will rule
   this envelope once and both unblock against it:
   - **PRO-01** (`t_19834503`): every node gets its own PRO and CON child —
     the tree multiplies.
   - **PANEL-01** (`t_eeea2f6e`): DR-154(2) — **each maker AUTHORS its own
     position on the question**, i.e. N independent root cards, one per maker.
     Note this is NOT the shipped `runJudgePanel` shape (N models grading one
     artifact); V ruled authorship, not grading.
   Give V both tables: without them, and with them.
4. **Every risk tier the form offers needs members, not just `standard`.**
   EXEC-01's rev3 blocking finding was exactly a form/engine disagreement about
   tiers. The engine ESCALATES the asker tier to the deployment floor
   (`packages/register/src/index.ts:356-365`), so SUB-FLOOR members are
   unreachable — state whether they should exist at all.
5. **The boot hazard, in your plan.** `acceptance/runtime-policy.ts` pins the
   envelope row to a ONE-MEMBER tuple and will REFUSE TO BOOT the moment a
   second member is ratified. Whoever seeds must change that in the same pass
   or the acceptance runtime dies on startup. Say so explicitly.
6. **The reseed cost.** A register content change forces a FRESH
   `acceptance/.pgdata` (seed-freshness guard). Back the data dir up first —
   V ruled that pattern in DR-151. Note that the previous backup was
   accidentally committed to git and is now ignored
   (`DebateAI-V3/acceptance/.pgdata-backup-*/`), so back up **outside the repo
   or under the ignored pattern**.

## Cost honesty

Every model call spends V's own CLI subscriptions. If your table implies a
debate costing 30+ calls, say so plainly rather than burying it in a total.

## DONE WHEN

The proposal exists with auditable arithmetic and cited call sites; the ticket
is moved to `review` with comment `READY FOR PEER REVIEW — DEPTH-01`; a
progress line per step is appended to
`docs/missions/2026-08-06-v3-programming/handoffs/DEPTH-01-progress.log`.
No register row is seeded. No `.pgdata` is deleted. No git operation is run.

Gates: this is a documentation deliverable, so the suites should be UNCHANGED —
run them anyway and paste real output to prove you changed nothing
(`npx tsc --noEmit`, both vitest suites, architecture + source audits). The
orchestrator re-runs them independently.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable. Silence is normal.
