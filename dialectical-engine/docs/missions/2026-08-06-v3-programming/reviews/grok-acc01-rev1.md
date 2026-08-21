# GROK REVIEW: ACC-01 · DR-126 acceptance harness

**Verdict: APPROVED**

Independent seat review of ticket `t_0dc09131` against the ACC-01 review packet.
Sources read: all `acceptance/**` sources and tests; `handoffs/ACC-01-codex-handoff.md`;
gate logs 1–3; ledger DR-133..136; `acceptance/ACCEPTANCE-REGISTER-DRAFT.md`;
`design-patterns.md` (P3/P8/P13/P17); orphan-audit entry roots. Commands: `git status
--porcelain`; product import greps under `packages/`, `apps/`, `web/`; non-DB vitest
re-run (11/11); `NODE_ENV=production` rejection probe for both test-only seams.
Evidence log: private reviewer scratch `acc01-grok-review-evidence.log`. Claude seat
review was not opened.

## Dimension checklist (all eight blocking)

| # | Dimension | Judgment | Evidence |
|---|---|---|---|
| 1 | DR-115 real CLI only; test doubles rejected outside `NODE_ENV=test` | **PASS** | `model-shim.ts` spawns fixed codex binary, maker `OpenAI` (`ACCEPTANCE_MAKER`), CLI fail→502 / timeout→504, no `choices` fabrication (`model-shim.ts:141-155`, `:71-111`). `resolveCommand` throws `TEST_ONLY_CODEX_COMMAND_FORBIDDEN` when `testOnlyCommand` is set and `NODE_ENV!=="test"` (`model-shim.ts:114-121`). Live `run-acceptance.ts:112-115` never supplies a fake command. Runtime probe under `NODE_ENV=production`: `SHIM_REJECT: TEST_ONLY_CODEX_COMMAND_FORBIDDEN`. |
| 2 | DR-135 live refusing evaluator | **PASS** | Default wiring: `resolveTerminalActivations: input.testOnlyTerminalEvaluator ?? resolveAcceptanceTerminalActivations` (`main.ts:164`). Live function: empty WAIT → `[]`; any WAIT → `TypedDomainError` `ACCEPTANCE_TERMINAL_WAIT_ROWS_UNRESOLVED` (`main.ts:59-70`). Not behind `NODE_ENV=test`. Blanket-INACTIVE only via `testOnlyTerminalEvaluator`, rejected outside test (`main.ts:96-98`; production probe: `EVAL_REJECT: TEST_ONLY_TERMINAL_EVALUATOR_FORBIDDEN`). Unit: `refusing-evaluator.test.ts`. Ceremony dry-run uses test-only blanket only inside vitest (`ceremony.test.ts:117-122`). |
| 3 | AC-76/DR-039 + DR-136 byte-faithful seed; computed hashes; no invented ports/rates | **PASS** | `buildAcceptanceRegisterRows()` matches V-approved draft + DR-136 (`seed-register.ts:55-143`): `maxRounds: 3`, `stopWhenDeltaBelowEpsilon: true`, `sourceRef` `acceptance:DR-136:V-approved` (`:107-114`). Other rows `acceptance:DR-133:V-approved`. Five contract hashes = `sha256` of shipped texts at seed (`:24-52`), asserted independently in `seed-register.test.ts`. Ports/rates/host/battery/handle required via strict ceremony env (`main.ts:22-30`; `run-acceptance.ts:104-123`). Ask defaults are documented caller args (`run-acceptance.ts:64-79`, README). WOK partial shares not padded (`runtime-policy.ts:17-20`; Gate 1 correction). `maxRecompose: 2` is DR-049 ruled constant (`packages/serve/src/index.ts:431-432`), not a register invention. |
| 4 | Scope boundary: zero production churn; no reverse imports | **PASS** | `git status --porcelain`: modified only `.claude/launch.json` (pre-existing) and mission `decisions-ledger.md`; untracked `DebateAI-V3/acceptance/`, mission acceptance draft, ACC-01 handoff. **No** paths under `packages/`, `apps/`, `web/`, `tests/`, `migrations/`. `git diff --stat` on those trees empty. Grep for product imports of `acceptance/` under `packages|apps|web`: none. |
| 5 | SOLID/DDD + P3/P8/P13/P17 | **PASS** | P3: `main.ts` composition root wires env, `NoopDispatcher`, API, provider, runner (`main.ts:88-167`). P8: dispatcher substitution is interface implementation only (`NoopDispatcher`, `main.ts:49-52`); product `apps/api/src/main.ts` still uses `HatchetDispatcher` — no acceptance-mode branch in product. P13: ceremony drives shipped `WalkingSkeletonRunner.executeWorkItem`; no re-derivation of recorded order. P17: no new migrations/DDL; seed uses existing `register.register_row` insert + `ON CONFLICT DO NOTHING` (`seed-register.ts:171-177`). |
| 6 | TDD RED→GREEN real; meaningful tests | **PASS** | Handoff pastes RED module-missing, DR-135/136 RED, Gate 1 ZodError, Gate 2 `run_check`/500; Gate logs 1–3 on disk corroborate. Final non-DB suite re-run this review: **5 files / 11 tests GREEN**. Gate 3: **1/1 GREEN** real embedded PG (`ACC-01-gate3.log`). Coverage includes shim map/lineage/error, seed byte-faithfulness + independent hashes, refusing evaluator, risk provenance, CLI args, ceremony ownership. |
| 7 | Honest orphan reachability for `acceptance/` | **PASS** | Production entry roots unchanged: `apps/api/src/main.ts`, `apps/runner/src/main.ts`, `apps/scheduler/src/cli.ts` (`tools/orphan-audit/src/index.ts:149-153`). `acceptance/` is not a declared production entry and is not falsely marked ATTACHED. `acceptance/README.md:3-8` states OUTSIDE the production orphan walk explicitly. |
| 8 | S05 ownership: owner 200 / foreign 404 | **PASS** | `ceremony.test.ts:157-169` asserts owner answer 200 and foreign-token 404. Gate 3 dry-run on real embedded PG completed that path (orchestrator log + handoff). |

## Findings

1. **ADVISORY** — Test-only seam rejection is implemented and verified by this seat under `NODE_ENV=production` (`TEST_ONLY_CODEX_COMMAND_FORBIDDEN`, `TEST_ONLY_TERMINAL_EVALUATOR_FORBIDDEN`), but there is no committed unit test that flips `NODE_ENV` and asserts those throws. Recommend a tiny focused test so the fence does not regress silently. (`model-shim.ts:114-121`, `main.ts:96-98`)

2. **ADVISORY** — Gate/progress/live ceremony logs match `*.log` and are gitignored (`.gitignore:9`), so durable peer evidence is filesystem-only unless force-added or renamed. Handoff markdown remains trackable. Not a harness defect.

3. **ADVISORY** — Orchestrator live-ceremony log (`ACC-01-live-ceremony1.log`) shows real codex-CLI path reaching the judge parser and failing loud with `JUDGE_SCHEMA_FAILURE` (strict schema; no fabrication). Handoff already treats full live settle + same-token UI as orchestrator-owned DONE gate and notes 64 initial WAIT rows under DR-135. That residual is outside this peer-review surface for the mechanism; it is correct DR-115/strict-parser behavior, not a blocking ACC-01 code defect.

4. **ADVISORY** — `createAcceptanceRuntime` hardcodes single-judge policy labels (`earnedWeight: 1`, `judgementProducer: "judgement:acceptance"`, etc. at `main.ts:153-163`). Acceptable for an acceptance-only composition root; not register-smuggled ports/rates. If a later register row owns these, migrate them rather than leave composition literals.

## Residual honesty (non-blocking)

- Live end-to-end DONE WHEN (settle + UI render under same token) remains orchestrator/TERM-01 adjacent per handoff and ticket comments; peer review approves the **harness delivery** and Gate-3 dry-run evidence, not a claim that the live CLI already settled.
- DR-136 is provisional pending the full DR-023 sitting; seeded exactly as ruled.

GROK REVIEW: APPROVED — ACC-01
