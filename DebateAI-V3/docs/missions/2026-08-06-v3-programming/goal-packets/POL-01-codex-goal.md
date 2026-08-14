# /goal packet — POL-01 (Codex seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_a8ad8b2f` · **Assignee:** codex
**Roster (DR-153):** Fable/Opus 5 orchestrates · **Codex implements** · dual
diamond (Opus 5 + Grok). Day mode: questions route UP to the orchestrator.

Standing law: `CODING-LOOP-PROTOCOL.md`. Ledger overrides on conflict — read
DR-148..DR-158. **Read the ticket's accumulated comments in full**
(`hermes kanban --board debateai-v3 show t_a8ad8b2f`): this ticket has been
collecting findings from four completed diamonds and they are the spec.

## The core defect — V hit it personally, twice

`apps/api/src/index.ts:71-77`:

```ts
const statusCode = knownError.name === "ZodError" || knownError instanceof SyntaxError
  ? 400
  : knownError instanceof TypedDomainError && knownError.code === "MAKER_INVENTORY_UNSATISFIED" ? 403 : 500;
```

**Every** `TypedDomainError` except one collapses into `500 INTERNAL_ERROR`,
discarding the code. `Fastify({logger: false})` means nothing is logged
server-side either. So a lawful, deliberate refusal is indistinguishable from a
crash.

What that cost V, in real observed incidents:
- V clicked "start debate" and got a bare 500. The truth was
  `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED` — the form's depth default was refused
  by a register rule. V could not have known.
- The `message` field DOES survive in the body; only the `error` code lies.
  That near-miss is exactly why this is a mapping problem, not a logging one.

## DELIVERS

1. **Typed refusals reach the browser as the right status with their real
   code.** A refusal the user can act on (bad depth, bad tier, unsatisfied
   register rule) is a 4xx naming its code; a genuine internal fault stays 5xx.
   You choose the mapping and JUSTIFY it in the handoff — do not invent a
   status per error by taste, define the rule.
2. **A refusal and an outage must not wear the same face.** This is the
   ticket's real theme. Two live instances, both already fixed but both proving
   the class:
   - the proxy returns a bare 500 on ECONNREFUSED
     (`apps/v2-ui/app/api/[...path]/route.ts` — `fetch` with no try/catch),
     which is indistinguishable from an API-side 500;
   - V pasted a CORRECT token against a down coordinator and was told
     *"Token was rejected by the coordinator"* — a verdict no server ever
     issued (fixed at two sites by the orchestrator via
     `apps/v2-ui/lib/v3/tokenUnlock.ts`; **audit the remaining action paths for
     the same bare-catch pattern**).
3. **The accumulated advisories on the ticket** — work them or record why not:
   - **A3 (from EXEC-01 rev4):** the deployment floor has TWO SOURCES. The
     acceptance root reads the `riskTier` REGISTER ROW; `apps/api/src/main.ts:37`
     reads env `DEPLOYMENT_RISK_TIER`, and no `riskTier` row is seeded outside
     acceptance. Against that entrypoint EXEC-01's rev3 defect reproduces
     verbatim — the form escalates by the row, the engine by the env var, and a
     lawful ask is refused. Advisory only because the gated stack is
     acceptance; it goes live the moment anything runs `apps/api/src/main.ts`.
   - **A4:** a present-but-NULL `riskTier` row reads as ABSENT in the UI and
     INVALID in the engine — two components disagreeing about what null means.
   - the `independence: undefined` field in the FAIR-01 gate report (cosmetic;
     the substantive evidence is the lineage rows).

## Laws that bite here

- **DR-115:** never state an outcome the system did not observe. A status code
  is a statement. Do not label something a client error when the server never
  evaluated it.
- **AC-76/DR-039:** no invented values. If a mapping needs a policy value, it
  is a register row or a loud failure, not a literal you chose.
- **Git is V-gated:** no commit/push/branch/reset.

## The defect class that has cost this mission the most

Four revisions on EXEC-01, two on UI-02a, one on DEPTH-01 — all the same:
**a check that cannot fail for the reason its author believed.** Source-text
assertions that survive a behaviour change; a test pinning today's values
instead of the rule; a green suite mistaken for a green typecheck (**vitest
does NOT typecheck** — run `npx tsc --noEmit` separately and paste it).

Your tests here must fail if the mapping regresses. A test asserting "500 is
returned" cannot catch a refusal wrongly typed as internal.

## Environment

Stack is UP and must stay up: PG 55432, shim 8791, API 8790, UI :3000
(`NEXT_DIST_DIR=.next-dev`), token `v-dev`. Four real debates exist — **you can
reproduce a real refusal live**: `POST /v1/asks` with
`depth_params: {depth: 3}` currently returns 500 with message
`"No runCostEnvelope member matches the declared depth and effective risk
tier"`. That is your RED. Never run a production `next build` into the dev
server's dist dir.

## DONE WHEN

A real refusal reaches the browser as a 4xx naming its code, proven with REAL
pasted output; an outage remains distinguishable from a refusal; the
accumulated advisories are worked or recorded; every gate green with REAL
pasted output EACH (`npx tsc --noEmit`, v2-ui typecheck, both vitest suites,
architecture + source audits — the orchestrator re-runs all of them and has
already caught one claimed-green gate this mission); TDD RED→GREEN evidence;
handoff at `handoffs/POL-01-codex-handoff.md`; progress line per step in
`handoffs/POL-01-progress.log`; ticket to `review` with comment
`READY FOR PEER REVIEW — POL-01`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable. Silence is normal.
