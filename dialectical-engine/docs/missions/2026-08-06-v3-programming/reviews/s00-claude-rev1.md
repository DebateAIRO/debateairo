# S00 · CLAUDE REVIEW (rev 1) — CHANGES REQUESTED

Reviewer: Claude lane (Opus 5 subagent), 2026-08-08. Independent verification run:
typecheck exit 0 · lint exit 0 (27 edge rows, no violations) · build exit 0
(contract codegen + tsc + next build 7/7) · `pnpm test:s00` exit 1 (39/40;
embedded PostgreSQL 18.4 starts on this host). DR-121 classifications verified
correct (Testcontainers dormant in test layer; compose authored-dormant,
Postgres-only hatchet-lite, no RabbitMQ, digest-pinned vLLM). Environment-tail
item 1 stale in Codex's favour: 8 of its 9 TAIL fixtures actually execute and
pass outside the sandbox. Five pins real and matching register.bootstrap.json.

Genuinely good: claim law (claim commits via withWriteTransaction before any
gateway call, SKIP LOCKED + deadline reaping, first-settlement-wins via
settled_attempt_id IS NULL guard, assertNoOpenWriteTransaction fencing the
provider); sequence allocator holds a row lock to commit so at_seq order =
commit order; hand-SQL migration with named hash columns, append-only triggers
+ REVOKE, real CHECKs; exactly one ProviderGateway with raw-artifact-before-
parsing and per-attempt ledger rows; single process.env site; pure propagation
and battery/decision; web/ carried plain and unrewritten.

## BLOCKING findings (1–7)

1. **No composition root — nothing can run.** `.listen(` appears nowhere in
   apps/packages/tools. `buildApi`, `PostgresAskApplication`,
   `HatchetDispatcher`, `WalkingSkeletonRunner`, `createPostgresProviderGateway`,
   `declareHatchetWalkingSkeletonTask` are exported and never constructed
   outside tests/unit/api.test.ts. `loadProviderEnvironment()` /
   `loadHatchetEnvironment()` (packages/register/src/runtime-environment.ts:17,25)
   never called. ENVIRONMENT TAIL item 2 presumes a server that does not
   exist — that wiring needs no model and no container: buildable-now work
   misfiled into the tail.
2. **apps/runner/src/index.ts:281-283 — a legal terminal is thrown, not
   valued.** Runner throws `SERVE_BLOCKED_BEFORE_COMPOSITION` when the chain
   blocks at R9/Q53 (reachable — restatementStatus comes from the judge). No
   answer row, no TERMINAL progress event, work item stranded CLAIMED. Line
   312's `outcome: result.terminal === "BLOCKED" ? "BLOCKED" : "OK"` is dead
   code proving it. P9 violation; breaks DELIVERS "terminals as values".
3. **packages/battery/src/index.ts:46-51 — fabricated activation evidence on
   the runtime path (DR-115).** Every run writes: dangling
   `predicateRef = docs/architecture/10-row-contracts.md#<row>` (doc has no
   such anchors) for all 71 rows; uniform `predicateInputs = {runCreation:
   true}` where §6 specifies distinct per-row inputs; Q61 `skipEvidence`
   placeholder instead of the actual settlement-watch handle. These land in
   evidence-bearing columns. P18 requires typed absence, not placeholder
   defaults. (Row sets themselves verified correct: 71 rows, 13 MACHINE, Q27
   sole LLM, 3 ACTIVE, 3 POLICY_BLOCKED, Q61 INACTIVE.)
4. **packages/serve/src/index.ts:411-427 — served base_score carries invented
   provenance (DR-115 + DDD).** `kind`/`replay_handle` borrowed from the
   propagation-strength record, `producer: "judgement"` hardcoded;
   ledger.reduced_judgement (migration:175-183) has no such columns, so no
   source exists. The labeled number lies about itself (P12 / P-D4). Fix
   needs a schema decision, not a one-liner.
5. **tools/orphan-audit/src/index.ts:27 — the executable edge law misstates
   §3.1.** Row 19 grants battery→memory and battery→liveness; 03 §3.2 forbids
   both by name. Latent (battery/package.json doesn't declare them), but the
   law-carrier permits forbidden edges. Two-token fix. Other 26 rows exact.
6. **tests/integration/database.test.ts:23-24 — suite RED.** `show
   server_version` returns column `server_version`; `rows[0]?.version` is
   undefined. Fix the key AND the assertion: `/^18\./` is hardcoded while
   tests/support/testDatabase.ts:112 calls `loadBootstrapRegister()` and
   discards it — assert against the `postgresMajorVersion` register pin.
7. **apps/runner has zero tests.** Nothing imports @debateai/runner,
   @debateai/scheduler, or the acceptance bundle. The 388-line runner —
   claim→judge→graph→propagation→serve→settle, redelivery, exhausted-attempt —
   was not test-driven. TDD rejected on the ticket's headline artifact.

## NON-BLOCKING findings (8–21)

8. auditOrphans is a hand-written literal, not analysis; three of six "entry
   points" false (`GET /v1/asks/:id/events` doesn't exist — route is
   `/v1/runs/:id/events`; job:reaper / job:settlement-watch are throwing stubs
   unreachable from the CLI); never-called list omits battery/decision's
   `decide` and kernel's `exhaustive()`.
9. Row name "battery/decision" vs "battery-decision" mismatch → cycle walk
   traverses a phantom leaf; acyclicity proof has a hole.
10. Exhaustive-switch gate vacuous (one switch in repo, in an unscanned test);
    source-literal regex only matches `export const FOO = 1;`; advertised
    labeled-number gate unimplemented.
11. auditSourceRules never scans web/, yet scaffold row 4 claims whole-program
    coverage. web/app/api/[...path]/route.ts:4 is a live /api/* proxy with
    process.env reads and `|| "http://127.0.0.1:8000"` silent defaults — three
    named anti-patterns; carried unrewritten per ticket but recorded nowhere
    as an exception.
12. Drizzle carrier covers 6/19 migration tables and diverges (workItem/
    ledgerEntry missing columns); drizzle-kit generate would emit drops;
    `void [scorecard, memory, evidence, boolean];` smell.
13. assertNoOpenWriteTransaction blind to raw BEGIN paths
    (RunRepository.startRun:95, persistBootstrapRegister).
14. serve: `strangerSampleRate` required-but-never-read (ISP);
    `sampleRateConsumed: false` hardcoded → its test proves nothing.
15. Exported gate chain passes GATE3 vacuously on an empty segment list
    (runner guarded by .min(1); the package is not).
16. migration:296-306 — debateai_runtime grants insufficient: claiming/
    settling need UPDATE on core.work_item; ledger.allocate_sequence needs
    UPDATE on sequence_allocator (or SECURITY DEFINER). Role can't run the
    engine as granted.
17. providers:163,193 — modelVersion populated from completion `id` (not a
    model version) into raw_artifact.model_version.
18. scheduler:39-45 — replay self-test rebuilds snapshot with `arrowOrder: []`
    instead of consuming recorded propagation_run.arrow_order (P13: nobody
    re-derives).
19. Contract thinner than claimed: RunEventSchema.event_type open z.string()
    (P14/P12); openapi.json has no components.schemas; tsconfig excludes
    packages/contract/generated so client.ts never typechecked; nothing
    asserts registered routes against contractInventory.routes.
20. Law-transcription fixtures tautological (kernel.test.ts:11-21,58-66;
    claim-law.test.ts:7; test-database-policy.test.ts; scaffold.test.ts:11
    assert constants against re-typed copies). 02-data-model.md says FX-LG-04
    asserts against the §12.3 Home-3 table. Three of five TERMINAL_ROUTES
    spellings code-minted (docs say INERT, code says INERT_STOP), as are all
    ORGAN_STAGE_MAP stage tokens.
21. Handoff cites S00-progress.log receipts; reviewer did not find it in the
    tree (orchestrator note: the file exists at handoffs/S00-progress.log —
    treat as resolved).

## Verdict block

CLAUDE REVIEW: CHANGES REQUESTED
- SOLID: greenlight — narrow gateway, real repositories, injected function
  contracts, no DI container; ISP slip (#14) non-blocking; missing apex booked
  as finding 1.
- DDD: greenlight — contexts match the module map; single-writer aggregate
  boundary proper; closed vocabularies minted once; finding 4 is a real
  invariant break to fix.
- TDD: reject — headline artifact untested (7), suite red (6), tautological
  slice (20).
- Patterns: reject — P9 violated on runtime path (2); P1 law-carrier encodes
  two forbidden edges (5); P13/P14/P12/P8 partially unpracticed. P2/P3/P5/P7/
  P10/P11/P17/P18 well implemented — keep as-is.
- DR-115: reject — findings 3 and 4 put scaffolded evidence and invented
  provenance on unavoidable runtime paths. Sweep otherwise clean.
- BLOCKING: 1,2,3,4,5,6,7 · NON-BLOCKING: 8–21.
