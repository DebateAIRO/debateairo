# /goal packet — EXEC-01 (Codex coding seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_6fae713b` · **Assignee:** codex
**Lane roster (DR-153, V-ruled 2026-08-11):** Fable/Opus 5 orchestrates ·
**Codex implements** · reviews are the DUAL DIAMOND: an Opus 5 lens AND a Grok
reviewer, BOTH must greenlight. Programming loop only.
**Day mode is in force (DR-134):** questions may route UP to the orchestrator.
Do not contact V directly.

## Standing law

Read and obey `docs/missions/2026-08-06-v3-programming/CODING-LOOP-PROTOCOL.md`
in full — it is the standing worker protocol (TDD, DDD, SOLID, pattern
register P1–P18, the 27-row dependency-edge table, DR-115, AC-76/DR-039,
DR-121, git is V-gated). The ledger `decisions-ledger.md` overrides it where
they conflict; newest DR wins. Read DR-149 through DR-152 — they are today's.

## Why this ticket exists (V's words)

> "When i click start debate i get contract request failed with 500."

V cannot start a debate from the UI. The orchestrator traced it live against
the running stack on 2026-08-11 and found TWO defects. Both are reproduced
below with real output. **Defect 2 is the real blocker and was not previously
ticketed.**

### Defect 1 — the visible 500

`POST /v1/asks` with the `/new` form's DEFAULT Tree depth of 3:

```
HTTP 500 {"error":"INTERNAL_ERROR",
          "message":"No runCostEnvelope member matches the declared depth and effective risk tier"}
```

The register rules exactly one envelope: `{standard, depth 1, max_model_attempts 9}`
(`acceptance/seed-register.ts`). A LAWFUL REFUSAL is wearing a crash's face,
because `apps/api/src/index.ts:71-77` maps every `TypedDomainError` except
`MAKER_INVENTORY_UNSATISFIED` to a bare 500 `INTERNAL_ERROR`, discarding the
code. `Fastify({logger:false})` means there is no server-side log either.

### Defect 2 — the real blocker: nothing ever executes

`POST /v1/asks` at depth 1 is ACCEPTED:

```
HTTP 202 {"run_ref":"75383998-9332-494a-be28-2f1e3d8d699c","status":"QUEUED"}
```

…and then NOTHING RUNS, forever. `acceptance/main.ts:51` wires
`NoopDispatcher`, whose `dispatch()` is deliberately empty:

```ts
export class NoopDispatcher implements Dispatcher {
  async dispatch(_input: { readonly runId: string; readonly workItemId: string }): Promise<void> {
    // P8: acceptance owns this substitution at its composition root; product code has no mode branch.
  }
}
```

Production wires `HatchetDispatcher` (`apps/api/src/main.ts:20`). The
acceptance harness has NO worker at all. The only debates that exist were
produced by `acceptance/run-acceptance.ts` driving `WalkingSkeletonRunner`
DIRECTLY, in-process.

**Verification of the claim:** probe ask `75383998-9332-494a-be28-2f1e3d8d699c`
returned 202 QUEUED; the answer index still totals 1 (the ceremony's own run)
with no second answer. That stray queued run is in the live DB — clean it up
or leave it as evidence, your call, but SAY WHICH in the handoff.

**Therefore: fixing the depth default alone would be WORSE THAN USELESS** — it
converts a visible 500 into a run that sits QUEUED forever with no error at
all. Both defects must close together.

## DELIVERS

1. **Queued work executes in the acceptance harness.** A dispatcher at the
   ACCEPTANCE composition root that drives the SAME shipped
   `WalkingSkeletonRunner` the ceremony uses — including the FAIR-01 critic
   leg, so a UI-started debate is as fair (>1 node, >1 maker, real attack
   edge) as the ceremony's. P8 stands: **product code keeps NO mode branch**;
   the substitution lives where `NoopDispatcher` lives today.
2. **The API stays responsive.** Dispatch must not block the 202. An ask
   returns immediately and the run proceeds.
3. **No silent stalls.** A run that fails must surface as TYPED run state the
   UI can read. A dead run must never sit in `QUEUED` forever — that failure
   mode is exactly what this ticket exists to kill, so do not reintroduce it
   in the error path. DR-115: typed loud failure over any default.
4. **The depth trap closes.** The `/new` form defaults Tree depth to 3
   (`apps/v2-ui/app/new/page.tsx:33`), which is guaranteed refused. Default it
   to the only ruled value, or refuse in the form with the REAL reason. Do not
   invent a new depth value or a new envelope number — AC-76/DR-039: unruled
   values are register rows or typed loud failures. If you conclude a new
   number is needed, STOP and put it to the orchestrator; V rules it.

## Out of scope (do not do these here)

- POL-01's full typed-refusal-to-4xx work. You may make the ONE refusal on
  this path readable if it falls out naturally; do not refactor the whole
  error handler.
- PRO-01 / PANEL-01 / XREV-01 / UI-02b — all blocked or separately ticketed.
- Any register value change. Any git operation.

## Environment (read carefully)

- **The full stack is UP right now and must stay up**: PG 55432, model shim
  8791, API 8790, UI :3000 (`NEXT_DIST_DIR=.next-dev`). Token `v-dev`.
  Live debate: `/debate/558c6e87-5896-4d32-bc9b-1e5448d8cb2a`.
- **NEVER run a production `next build` into the dev server's dist dir.** Use
  a different `NEXT_DIST_DIR`. This has broken the app three times.
- **Embedded PostgreSQL cannot start inside your sandbox** (SysV shmget
  denied). Author DB-touching tests behind `tests/support/testDatabase.ts` and
  say in your handoff when a run outside the sandbox is needed — the
  orchestrator executes those and returns results.
- Every UI-started debate spends the ruled 9 model attempts against V's own
  CLI subscriptions. Note that cost where a user or reader will see it.

## DONE WHEN

- A debate started from the UI at the ruled depth actually produces a settled
  answer, demonstrated with REAL pasted output (run id + answer id + node and
  edge counts + makers), not claimed.
- A failing run surfaces typed state rather than stalling.
- Root typecheck · v2-ui typecheck · `vitest` · orphan-audit architecture and
  source audits all green, with REAL output pasted.
- TDD evidence: the RED test that reproduced the forever-QUEUED behaviour
  BEFORE the fix, then GREEN.
- Handoff written to
  `docs/missions/2026-08-06-v3-programming/handoffs/EXEC-01-codex-handoff.md`
  (inventory · fixture-by-fixture REAL output · AC evidence · RED→GREEN ·
  acknowledged deferrals · ENVIRONMENT TAIL · QUESTIONS FOR V).
- Progress line per major step appended to
  `docs/missions/2026-08-06-v3-programming/handoffs/EXEC-01-progress.log`
  as `$(date -u +%FT%TZ) <event>`. 45 silent minutes = presumed wedge and the
  orchestrator kills and resumes the session.
- Ticket moved to `review` and commented `READY FOR PEER REVIEW — EXEC-01`.

## Return rule

Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
[STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged
state needs no message. Termination requires the spine's goal-specific FULLY
DONE condition.
