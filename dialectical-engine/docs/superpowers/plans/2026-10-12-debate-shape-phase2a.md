# Debate Shape Phase 2a (settings and money) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the owners' switch for the new debate shape, the optional register row `debateShapePolicy`, together with the three ask settings (`depthMode`, `scrutiny`, `answerLength`) and the money rules that go with them:

- the plan-by-plan normalisation of the settings;
- their storage in `core.run.depth_params`;
- the start-of-debate ceiling and estimate for the new shape;
- the per-role call shares;
- the preview pricing;
- the history estimate class and the waiting line;
- the strict receipt parser;
- the two publishers.

Two things must hold throughout. With the row absent, everything stays byte-identical to today. With the row present, the ceiling never counts fewer calls than the new shape can make.

**Architecture:** Most of the logic is pure functions in `@debateai/register`:

- `packages/register/src/debate-shape-policy.ts` holds the row (parse, read, row builder, start values), the plan key, normalisation and size resolution (capped by the makers present).
- `packages/register/src/debate-shape-ceiling.ts` holds the shape's site counts, the receipt member and the backup test.

`computeStructuralCeilingBasis` gains one optional input, `shape`. With it, the function mints a new formula, `DR-185-shape-v1`, whose receipt carries a strict `shape` member. Without it, the receipt is DR-184-v4/v5 byte for byte. Every money place reads that one receipt:

- the strict parser (`@debateai/budget`);
- the per-role shares (`ask-model-picker.ts`);
- the preview's writer pricing (`preview-budget-estimate.ts`);
- the history estimate's class, through `depth_params` plus `envelope_basis->'shape'->>'plan'`.

The API reads the row once at boot. It normalises every ask for the asker's plan key (plan id with billing on, otherwise the tier) and passes the resolved sizes to the composition.

The runner reads the row at boot and refuses a malformed one. During Phase 2a it also refuses a valid one, because the runner cannot run the shape until P2b. The receipt's `shape` member is the run's frozen sizes, which P2b's runner reads instead of resolving the plan again.

No migration, no sealed value changed, no dev/local row.

**Tech Stack:** TypeScript (ESM, NodeNext, strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), zod 4.4.3, vitest, pnpm 11.20.0 workspace, Node >= 26.8.2, PostgreSQL 18 (embedded for integration tests).

**Spec:** docs/superpowers/specs/2026-10-12-debate-shape-design.md (rulings S5–S9, §3.1, §3.2, §3.6, §5). Binding names: docs/superpowers/plans/2026-10-12-debate-shape-phase2-INTERFACE.md §1, §2. Money law: docs/superpowers/specs/2026-09-28-budget-never-stops-a-debate-design.md (the estimate is a ceiling and never under-counts).

All paths below are relative to the engine folder `dialectical-engine/` of the worktree `.claude/worktrees/debate-shape-p2` (branch `feat/2026-10-13-debate-shape-phase2`; Phase 1 + origin/dev + Project 1 already merged). Every command runs from that folder.

## Global Constraints

**The register row**

- Row key `debateShapePolicy`, kind `"DEBATE_SHAPE_POLICY"`, `version: 1`.
- It is optional. It is never in `register.required_row`, the bootstrap file, the dev deployment rows or the preview's required source keys. Absent means today's shape. Malformed means boot refuses with `TypeError("DEBATE_SHAPE_POLICY_INVALID:<path>")`, where `<path>` is the dotted zod path and `$` is the root.
- Row bounds, exactly as INTERFACE §1:
  - `mapAIs` 2..9, `answers` 2..5, `graders` 1..5, `pointsPerAnswer` 1..6, `deeperTopPoints` 1..6, `gapRoundsMax` 0..3, `closeCallExtraGraders` 0..4;
  - `fixedDepthAllowed` is a boolean;
  - `scrutiny.deep` is `null` or `{ roundsPerPoint 1..5, pointsPerDebate 1..30 }`;
  - `scrutiny.exhaustive` is `null` or `{ roundsPerPoint 1..8, pointsPerDebate 1..60 }`;
  - `scrutinyLeverageMin` and `scrutinyWeakBelow` are 0..1, with at most 6 decimals;
  - `opening` is one of `ANGLE_MAP`, `BLIND_LISTS`, `SNOWBALL`.
- Answer lengths (added by this plan):
  - `words` 50..5000 and `writerBound` 1024..65536;
  - `words` strictly rises from short to standard to detailed;
  - `writerBound` never falls in that order.
- Start values (`debateShapePolicyStartValues()`), rulings S5–S8:
  - free {3,3,2,3,1,1,2,false, deep null, exhaustive null, 0.05, 0.5, ANGLE_MAP};
  - plus {4,3,3,4,2,2,2,true, deep {2,6}, exhaustive {3,15}, 0.05, 0.5, ANGLE_MAP};
  - pro {5,4,3,4,2,2,2,true, same scrutiny};
  - max {7,4,3,4,2,2,2,true, same scrutiny};
  - premium equals pro;
  - answerLength short {300, 8192}, standard {700, 12288}, detailed {1500, 16384}.

**Plans and normalisation**

- Plan key: `debateShapePlanKeyOf(planId, planTier)`. With billing on: FREE→free, PLUS→plus, PRO→pro, MAX→max. With no plan id, the tier decides: free→free, premium→premium.
- Sizes are capped by distinct makers M:
  - `answers` = min(plan, M);
  - `mapAIs` = min(plan, M);
  - `graders` = min(plan, M−1);
  - `closeCallExtraGraders` = min(plan, M−1−graders);
  - M < 2 means no shape (today's single-position path).
- Ask fields live inside `depth_params` only:
  - `depthMode` is `"fixed" | "adaptive"` (default adaptive);
  - `scrutiny` is `"standard" | "deep" | "exhaustive"` (default standard);
  - `answerLength` is `"short" | "standard" | "detailed"` (default standard).
- Normalisation with the row present:
  - fixed becomes adaptive when `fixedDepthAllowed` is false;
  - deep or exhaustive becomes standard when that budget is `null`;
  - the stored `depth_params` is exactly `{ depth, depthMode, scrutiny, answerLength }`, in that key order.
- Normalisation with the row absent: the stored `depth_params` is exactly `{ depth }`. A depth-only ask is returned as the same object.
- Depth is never changed by shape normalisation. With billing on, Free's depth 2 stays the billing plan's sealed fixed gauge.

**The ceiling**

- Formula name `DR-185-shape-v1` (`DEBATE_SHAPE_FORMULA_VERSION`). A = mapAIs, P = answers, J = graders, E = closeCallExtraGraders, K = pointsPerAnswer, X = deeperTopPoints, G = gapRounds, d = depth, R/Q = scrutiny roundsPerPoint/pointsPerDebate (0/0 for standard), r = sealed `reviewerCallsPerNode`.
- Sites:
  - map sites = 2A + G + 3 (every list may be asked twice);
  - nodes = P + P·K + P + (d−1)·2·P·X (adaptive) or (d−1)·2·P·K (fixed), + 2·R·Q;
  - author sites = map sites + nodes, of which P are cross-exchange sites (no backup);
  - panel sites = (J+E)·nodes;
  - reviewer sites = r·nodes;
  - serve sites as today.
- Per-site attempts and `serve_reserve_attempts` follow the DR-184-v4/v5 rules unchanged.
- The receipt keeps `panel_size` as the number of debaters, never P.

**Hosted and runner codes**

- Hosted file member: `debateShapePolicy`, the policy without its `kind`. A refusal is `HOSTED_REGISTER_DEBATE_SHAPE_INVALID`.
- Phase-2a runner guard: a valid row refuses the runner's boot with `DEBATE_SHAPE_POLICY_RUNNER_PENDING`. P2b replaces this guard.

**Source rules** (tools/orphan-audit `auditSourceRules`, pinned by tests/architecture/scaffold.test.ts) apply to every shipped `.ts`:

- no `process` + `.env` text, even in a comment;
- a file containing `switch (` must contain `default:` and `exhaustive(`;
- no exported ALL_CAPS constant equal to a bare number (numbers live inside functions or frozen objects; never write `as const` after a number in an export);
- no import specifier containing `test`/`fixture` in shipped code;
- no `/Users/<name>/` path.

**The depth-literal oracle** (tests/support/depthOracle.ts, run by tests/unit/s1-1-depth-contract.test.ts) flags any shipped line, comments included, that mentions "depth" in any case (for example `fixedDepthAllowed` or `DepthMode`) and contains a bare `5`. It also flags a `6` after `<`, `>`, `<=` or `>=` on such a line. Keep every 5 off those lines.

**Shipped corpus.** Every new non-test `.ts` under packages/ or apps/ is added to tests/support/shipped-corpus.manifest.txt. Regenerate it with `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`.

**Untouched sealed values.** `register.bootstrap.json`, every `migrations/*.sql`, `packages/db/src/index.ts` (its `NATIVE_MIGRATE_MODULE_SHA256` pin) and every sealed register row stay as they are. This plan adds no migration.

**Running tests**

- One heavy test run at a time on the owner's 16 GB Mac.
- Before any `vitest run`, `pgrep -fl 'vitest[ ]run'` must show at most one other run (count runs, not processes), and `memory_pressure | tail -1` must show free memory of at least 40%.
- Integration suites, `pnpm run typecheck` and unit runs never run together.
- Commands:
  - unit: `pnpm exec vitest run tests/unit/<file>.test.ts`;
  - integration: `pnpm exec vitest run tests/integration/<file>.test.ts` (embedded Postgres).

**Commits.** Each commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push and do not open a PR inside this plan.

## Review Focus

These are the five failure modes most likely to slip through untested. Each has a test in the task that owns it.

1. **Row absent, but a byte changes anyway.**
   - Risks: a new key on the receipt, `null` instead of a missing key on a parsed object, or a depth-only ask rebuilt as a new object or with new keys. Any of these would move every stored receipt, the room tables and the history estimate.
   - Tests:
     - Task 3 pins the exact JSON bytes of today's M=2, d=1 receipt and checks "no `shape` key" over M 1..4 × d 1..5 × backup 0/1;
     - Task 4 checks "no `shape` member on a parsed v4/v5 receipt";
     - Task 2 and Task 8 check that a depth-only ask is returned as the same object, with the JSON `{"depth":2}`;
     - Task 7 checks the class key `free|low|2|1` and an unchanged waiting-run object.
2. **The ceiling under-counts some plan × makers × depth × mode × scrutiny.**
   - Risks: for example, extras counted only on scrutiny-eligible nodes, the map's handed-on lists, fixed mode, or two makers where E must be 0.
   - Tests: Task 3 "EQUALS an independent call-by-call enumeration over the whole grid". That is 5 plans × makers 2..9 × depth 1..5 × both modes × three scrutiny levels × backup 0/1, and the enumeration counts the close-call extras on every node.
3. **Free billing normalisation silently drops `answerLength`.**
   - Risk: `normaliseAskForPlan` and `decideSettingsForPlan` rebuild `depth_params` as `{ depth }`.
   - Test: Task 8 "Free keeps the asked answer length; a depth-only ask stays `{"depth":2}`".
4. **The strict receipt parser accepts a shape receipt whose legs its own sizes do not give.**
   - Risks: author ≠ map sites + nodes, a wrong node count, a panel leg ≠ (J+E)·nodes, P > debaters, an extra key, a backup flag without its per-site member, a shape member under a v4 name, or a v4 receipt carrying a shape member.
   - Test: Task 4 "refuses %s", 8 cases.
5. **One odd waiting row stops the whole waiting line.**
   - Risk: a waiting run with an unreadable stored shape value makes the waker throw for every run. This is the reason migration 0085's trigger exists.
   - Test: Task 7 "`waitingShapeClassOf` never throws and reads an unknown value as the dearest one".

## Contract deviations

The names fixed by INTERFACE §1 and §2 are kept. The deviations and additions are:

1. **The reader's form.** It is `readDebateShapePolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<DebateShapePolicy | null>`; INTERFACE writes `(register, version)`. The TypeScript name for INTERFACE's `PlanShape` is `DebateShapePlan`.
2. **`readFrozenHead` is not changed.** It already returns `depth_params` whole, unknown keys included (packages/db/src/index.ts ~2557). Editing that file would force a re-pin of the sealed `NATIVE_MIGRATE_MODULE_SHA256`. The defaults for old runs come from the new contract helper `debateShapeSettingsOf(depthParams)`, which the runner (P2b) calls on `run.depthParams`.
3. **The receipt carries the run's sizes.**
   - New, and binding on P2b: the sizes a run uses live on its receipt as `envelope_basis.shape`. The API resolves them and caps them by the admitted makers.
   - P2b reads them with `parseCostEnvelopeBasis(run.envelopeBasis).shape` and never resolves the plan again (the run row carries no plan id).
   - A run admitted without the row has no `shape` and runs today's shape, even on a runner that later boots with the row.
   - Sit-outs at run time may only lower a size.
4. **The ceiling formula differs from the spec in two places, both to stay a ceiling.**
   - Map sites are 2A + G + 3, not A + 3 + G. A failed list is handed to another seat under the same `MAP:list:<i>` key (packages/map/src/orchestrator.ts `mapReassignLists`), and on the preview each seat gets its own per-key allowance.
   - Close-call extras are counted on every node, not "2 per scrutiny-eligible node".
5. **Binding on P2b: the runner must stay inside `debateShapeSiteCounts`.**
   - Fixed mode is one exchange (a reply plus a defence) per chosen point per deeper round. This is a linear chain, not "every node of the previous round".
   - `MAP_UNAVAILABLE_TODAYS_OPENING` opens at most P positions (the first P seats) with at most K round-1 children each.
   - Map repairs (patch, full re-ask) are attempts inside the site's own allowance.
   - P2b adds an enumerator test of its plan builder against `debateShapeSiteCounts`.
6. **The preview kit takes the row as an optional source key.** It goes on Project 1's `PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2` list, not on `PREVIEW_SOURCE_ROW_KEYS_V2`. Putting it in the required closure would switch the shape on at the preview's next publish, before the runner can run it. The release tool's `native-plan` flag is left out, because deploying the row is out of scope (spec §6).
7. **The Phase-2a runner guard.** A valid row refuses the runner's boot (`DEBATE_SHAPE_POLICY_RUNNER_PENDING`), so admission can never mint shape receipts that today's runner would run as the old shape. P2b deletes `assertDebateShapeRunnerReady` and its call.
8. **The waiting-line SQL needs no migration.** The waiting reader takes the run's shape settings with a scalar subquery on `core.run` in packages/db/src/run-wait.ts. The billing SQL (migration 0085's `core.refuse_unreadable_waiting_run` trigger) is unchanged. It exists only for the view's `::integer` cast of `depth`, and the new fields are read as text, never cast. The careful reading lives in `waitingShapeClassOf` (Task 7).
9. **The room query gains `depth_mode`, `scrutiny` and `answer_length`** as optional query fields, so the /new page (P2c) can read the room for the settings it will send.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/contract/src/index.ts` | modify | `DepthModeSchema`, `ScrutinySchema`, `AnswerLengthSchema`, widened `DepthParamsSchema`, `debateShapeSettingsOf`, room query fields |
| `packages/register/src/debate-shape-policy.ts` | create | Row schema, parse, read, row builder, start values, plan key, normalisation, size resolution, Phase-2a runner guard |
| `packages/register/src/debate-shape-ceiling.ts` | create | Site counts, input check, receipt member and schema, receipt→sizes, backup test, formula name |
| `packages/register/src/index.ts` | modify | `computeStructuralCeilingBasis` `shape` input; exports |
| `packages/budget/src/index.ts` | modify | Strict receipt parser: optional `shape`, cross checks, `CostEnvelopeBasis.shape` |
| `packages/budget/src/estimate.ts` | modify | `RunShapeClass`, class key, estimate SQL, `waitingShapeClassOf` |
| `packages/db/src/run-wait.ts` | modify | Waiting reader returns `shapeSettings` (scalar subquery) |
| `apps/api/src/debate-shape-ask.ts` | create | `runShapeClassOf`, `normaliseAskForDebateShape`, `debateShapeForPanel`, `roomDepthParams` |
| `apps/api/src/ask-model-picker.ts` | modify | Shape-aware `expectedCallsByRoleFromBasis`; `answerTokenCeilingsForBasis` |
| `apps/api/src/preview-budget-estimate.ts` | modify | `ANSWER_WRITER` call type priced at the run's writer bound |
| `apps/api/src/ask-room.ts` | modify | Shape in `runSettingsClassOfAsk` / `settingsClassOfWaitingRun` |
| `apps/api/src/ask-billing.ts` | modify | Free normalisation keeps the shape keys; coarse fit's class carries the shape |
| `apps/api/src/index.ts` | modify | Settings/options fields, admission and submit wiring, room route |
| `apps/api/src/main.ts` | modify | Boot read; settings, options and composition |
| `tools/preview-practice/practice-ask-composition.ts` | modify | Same composition as main.ts |
| `apps/runner/src/main.ts` | modify | Boot read and Phase-2a guard |
| `apps/runner/src/hosted-register-publish.ts` | modify | Optional `debateShapePolicy` member, boot readiness read |
| `deploy/preview-auth-dev/v1/publish-register-v2.ts` | modify | Optional source row (builder argument, composer carry) |
| `deploy/vps/register/README.md`, `deploy/vps/README.md` | modify | One row each for the member and its refusal |
| `tests/support/shipped-corpus.manifest.txt` | modify | Three new shipped files |
| `tests/integration/obs-l3-s06-runner-binding.test.ts` | modify | Runner register stand-in gains the two new names |
| `tests/unit/debate-shape-*.test.ts` | create | One file per task (named in each task) |
| `tests/integration/b2-recent-runs-estimator.test.ts`, `tests/integration/b3-holds-waiting-line.test.ts`, `tests/integration/hosted-register-publish.test.ts`, `tests/unit/preview-register-publish-v2.test.ts` | modify | Added cases |

---

### Task 0: Precondition: Project 1 (parallel calls) is in this branch

P2a's preview publisher uses Project 1's optional-key list (`PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2`), and P2b needs Project 1's scheduler. Merging first means the publisher, hosted file and register export conflicts are resolved once.

**Files:** none edited by hand (a merge commit).

- [ ] **Step 1: Check whether Project 1 is already here**

Run: `git merge-base --is-ancestor feat/2026-10-12-parallel-calls HEAD && echo IN || echo OUT`

If it prints `IN`, skip to Step 4.

- [ ] **Step 2: Choose the source**

Run: `git fetch origin dev && git merge-base --is-ancestor feat/2026-10-12-parallel-calls origin/dev && echo DEV || echo BRANCH`

- [ ] **Step 3: Merge**

If Step 2 printed `DEV`, run `git merge --no-ff origin/dev`. Otherwise run `git merge --no-ff feat/2026-10-12-parallel-calls`. The message is `Merge Project 1 (parallel calls) before debate shape Phase 2a`, followed by a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

If any conflict is not a plain "keep both" (register export blocks, kit key lists), STOP and report to the controller. Do not resolve by dropping either side.

- [ ] **Step 4: Confirm what later tasks rely on**

Run: `grep -n "PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2" deploy/preview-auth-dev/v1/publish-register-v2.ts && ls packages/register/src/call-concurrency-policy.ts`

Expected: one or more matching lines, and the file path printed.

- [ ] **Step 5: Run Project 1's row test once**

Run: `pnpm exec vitest run tests/unit/call-concurrency-policy.test.ts`. Expected: PASS.

---

### Task 1: Ask contract: the three optional settings

**Files:**
- Modify: `packages/contract/src/index.ts` (~line 173, `DepthParamsSchema`; ~line 286, `AskRoomQuerySchema`)
- Test: `tests/unit/debate-shape-contract.test.ts` (create)

**Interfaces:**
- Consumes: `ExpansionDepthSchema`, `PlanTierSchema`, `CompositionBudgetTierSchema` (same file).
- Produces:
```ts
export const DepthModeSchema: z.ZodEnum<{ fixed: "fixed"; adaptive: "adaptive" }>;
export type DepthMode = "fixed" | "adaptive";
export const ScrutinySchema: z.ZodEnum<{ standard: "standard"; deep: "deep"; exhaustive: "exhaustive" }>;
export type Scrutiny = "standard" | "deep" | "exhaustive";
export const AnswerLengthSchema: z.ZodEnum<{ short: "short"; standard: "standard"; detailed: "detailed" }>;
export type AnswerLength = "short" | "standard" | "detailed";
export const DepthParamsSchema; // { depth; depthMode?; scrutiny?; answerLength? }, strict
export type DebateShapeSettings = Readonly<{ depthMode: DepthMode; scrutiny: Scrutiny; answerLength: AnswerLength }>;
export function debateShapeSettingsOf(depthParams: Readonly<Record<string, unknown>>): DebateShapeSettings;
// AskRoomQuerySchema gains depth_mode?, scrutiny?, answer_length?
```

- [ ] **Step 1: Write the failing test** `tests/unit/debate-shape-contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AskRequestSchema, AskRoomQuerySchema, DepthParamsSchema, debateShapeSettingsOf } from "@debateai/contract";

describe("debate shape ask settings (spec 2026-10-12 §3.2)", () => {
  it("accepts the three optional settings and keeps a depth-only ask byte for byte", () => {
    expect(JSON.stringify(DepthParamsSchema.parse({ depth: 2 }))).toBe('{"depth":2}');
    expect(DepthParamsSchema.parse({ depth: 2, depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" }))
      .toEqual({ depth: 2, depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" });
  });
  it.each([
    ["an unknown depth mode", { depth: 2, depthMode: "manual" }],
    ["an unknown scrutiny", { depth: 2, scrutiny: "max" }],
    ["an unknown answer length", { depth: 2, answerLength: "long" }],
    ["an unknown key", { depth: 2, concurrency: 3 }],
    ["a capitalised value", { depth: 2, depthMode: "Adaptive" }]
  ])("refuses %s", (_name, value) => {
    expect(DepthParamsSchema.safeParse(value).success).toBe(false);
  });
  it("reads missing keys as the defaults (old runs) and refuses a stored value outside the enums", () => {
    expect(debateShapeSettingsOf({ depth: 1 })).toEqual({ depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" });
    expect(debateShapeSettingsOf({ depth: 3, depthMode: "fixed", scrutiny: "exhaustive", answerLength: "short" }))
      .toEqual({ depthMode: "fixed", scrutiny: "exhaustive", answerLength: "short" });
    expect(() => debateShapeSettingsOf({ depth: 1, scrutiny: "max" })).toThrow("DEPTH_PARAMS_SHAPE_INVALID:scrutiny");
  });
  it("the room query carries the same three settings, optional", () => {
    const base = { plan_tier: "premium", composition_budget_tier: "low", depth: "2" };
    expect(AskRoomQuerySchema.parse(base)).toEqual({ plan_tier: "premium", composition_budget_tier: "low", depth: 2 });
    expect(AskRoomQuerySchema.parse({ ...base, depth_mode: "fixed", scrutiny: "deep", answer_length: "short" }))
      .toMatchObject({ depth_mode: "fixed", scrutiny: "deep", answer_length: "short" });
    expect(AskRoomQuerySchema.safeParse({ ...base, scrutiny: "max" }).success).toBe(false);
  });
  it("the ask accepts them inside depth_params only", () => {
    const ask = { question_line: "q", risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:test",
      composition_budget_tier: "low", depth_params: { depth: 1, answerLength: "short" }, decision_scope: "s",
      as_of: "2026-10-12T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [] };
    expect(AskRequestSchema.safeParse(ask).success).toBe(true);
    expect(AskRequestSchema.safeParse({ ...ask, answerLength: "short" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/debate-shape-contract.test.ts`

Expected: FAIL. `debateShapeSettingsOf` is not exported, and the widened objects are refused.

- [ ] **Step 3: Implement.** In `packages/contract/src/index.ts`, replace the two lines

```ts
/** Closed at the contract door: exactly one key, an integer inside the range. */
export const DepthParamsSchema = z.object({ depth: ExpansionDepthSchema }).strict();
```

with:

```ts
/** Debate shape (spec 2026-10-12 §3.2): how the deeper rounds are chosen. Missing reads as "adaptive". */
export const DepthModeSchema = z.enum(["fixed", "adaptive"]);
export type DepthMode = z.infer<typeof DepthModeSchema>;
/** Debate shape (spec §3.2, ruling S7): the scrutiny budget asked for. Missing reads as "standard". */
export const ScrutinySchema = z.enum(["standard", "deep", "exhaustive"]);
export type Scrutiny = z.infer<typeof ScrutinySchema>;
/** Debate shape (spec §3.2, ruling S8): the answer's target length. Missing reads as "standard". */
export const AnswerLengthSchema = z.enum(["short", "standard", "detailed"]);
export type AnswerLength = z.infer<typeof AnswerLengthSchema>;

/** Closed at the contract door: the depth, plus the three optional shape settings (spec 2026-10-12 §3.2). */
export const DepthParamsSchema = z.object({
  depth: ExpansionDepthSchema,
  depthMode: DepthModeSchema.optional(),
  scrutiny: ScrutinySchema.optional(),
  answerLength: AnswerLengthSchema.optional()
}).strict();

/** The three shape settings of an asked or stored depth_params. */
export type DebateShapeSettings = Readonly<{ depthMode: DepthMode; scrutiny: Scrutiny; answerLength: AnswerLength }>;

function shapeSettingOf<T extends string>(
  depthParams: Readonly<Record<string, unknown>>, key: string, schema: z.ZodType<T>, fallback: T
): T {
  if (!Object.hasOwn(depthParams, key)) return fallback;
  const parsed = schema.safeParse(depthParams[key]);
  if (!parsed.success) throw new TypeError(`DEPTH_PARAMS_SHAPE_INVALID:${key}`);
  return parsed.data;
}

/** A missing key reads as its default (every run stored before the shape); a present value outside its enum is refused. */
export function debateShapeSettingsOf(depthParams: Readonly<Record<string, unknown>>): DebateShapeSettings {
  return Object.freeze({
    depthMode: shapeSettingOf(depthParams, "depthMode", DepthModeSchema, "adaptive"),
    scrutiny: shapeSettingOf(depthParams, "scrutiny", ScrutinySchema, "standard"),
    answerLength: shapeSettingOf(depthParams, "answerLength", AnswerLengthSchema, "standard")
  });
}
```

Keep the existing `export type DepthParams = z.infer<typeof DepthParamsSchema>;` line. Then replace `AskRoomQuerySchema` with:

```ts
export const AskRoomQuerySchema = z.object({
  plan_tier: PlanTierSchema,
  composition_budget_tier: CompositionBudgetTierSchema,
  depth: z.string().regex(/^[0-9]{1,2}$/u).transform(Number).pipe(ExpansionDepthSchema),
  // Debate shape (spec 2026-10-12 §3.2): the /new page reads the room for the settings it will send.
  depth_mode: DepthModeSchema.optional(),
  scrutiny: ScrutinySchema.optional(),
  answer_length: AnswerLengthSchema.optional()
}).strict();
```

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/debate-shape-contract.test.ts`

- [ ] **Step 5: Regenerate the contract artefacts and run the depth contract test**

Run: `pnpm run generate:contract` (it writes the gitignored `packages/contract/generated/`; nothing to commit).

Then run: `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`

Expected: PASS. No new shipped line mentions "depth" next to a bare 5.

- [ ] **Step 6: Commit**

```bash
git add packages/contract/src/index.ts tests/unit/debate-shape-contract.test.ts
git commit -m "Contract: depthMode, scrutiny and answerLength inside depth_params, defaults for old runs, room query fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The optional register row `debateShapePolicy`, plan key, normalisation and sizes

**Files:**
- Create: `packages/register/src/debate-shape-policy.ts`
- Modify: `packages/register/src/index.ts` (export block next to the `answer-role-rotation-policy.js` / `call-concurrency-policy.js` exports)
- Modify: `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/debate-shape-policy.test.ts` (create)

**Interfaces:**
- Consumes:
  - `DepthMode`, `Scrutiny`, `AnswerLength`, `DebateShapeSettings`, `DepthParams`, `PlanTier` and `debateShapeSettingsOf` (Task 1, `@debateai/contract`);
  - `PlanId` (`./billing-plans.js`);
  - `canonicalDecimal`, `canonicalRegisterJson`, `CanonicalJsonAst` and `CanonicalRegisterJson` (`./register-publication.js`);
  - `exhaustive` and `TypedDomainError` (`@debateai/kernel`).
- Produces:
```ts
export const DEBATE_SHAPE_POLICY_ROW_KEY: "debateShapePolicy";
export const DEBATE_SHAPE_PLAN_KEYS: readonly ["free", "plus", "pro", "max", "premium"];
export type DebateShapePlanKey = "free" | "plus" | "pro" | "max" | "premium";
export const DEBATE_SHAPE_OPENINGS: readonly ["ANGLE_MAP", "BLIND_LISTS", "SNOWBALL"];
export type DebateShapeOpening = "ANGLE_MAP" | "BLIND_LISTS" | "SNOWBALL";
export type DebateShapeScrutinyBudget = Readonly<{ roundsPerPoint: number; pointsPerDebate: number }>;
export type DebateShapePlan = Readonly<{ mapAIs: number; answers: number; graders: number; pointsPerAnswer: number;
  deeperTopPoints: number; gapRoundsMax: number; closeCallExtraGraders: number; fixedDepthAllowed: boolean;
  scrutiny: Readonly<{ deep: DebateShapeScrutinyBudget | null; exhaustive: DebateShapeScrutinyBudget | null;
    scrutinyLeverageMin: number; scrutinyWeakBelow: number }>; opening: DebateShapeOpening }>;
export type DebateShapeLength = Readonly<{ words: number; writerBound: number }>;
export type DebateShapePolicy = Readonly<{ kind: "DEBATE_SHAPE_POLICY"; version: 1;
  plans: Readonly<Record<DebateShapePlanKey, DebateShapePlan>>; answerLength: Readonly<Record<AnswerLength, DebateShapeLength>> }>;
export type DebateShapeCeilingInput = Readonly<{ plan: DebateShapePlanKey; depthMode: DepthMode; scrutiny: Scrutiny;
  answerLength: AnswerLength; mapAIs: number; answers: number; graders: number; pointsPerAnswer: number; deeperTopPoints: number;
  gapRounds: number; closeCallExtraGraders: number; scrutinyRoundsPerPoint: number; scrutinyPointsPerDebate: number;
  scrutinyLeverageMin: number; scrutinyWeakBelow: number; opening: DebateShapeOpening; answerWords: number; writerBound: number }>;
export function parseDebateShapePolicy(value: unknown): DebateShapePolicy;
export function readDebateShapePolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<DebateShapePolicy | null>;
export function debateShapePolicyRow(policy: DebateShapePolicy, sourceRef: string): Readonly<{ rowKey: "debateShapePolicy"; valueJsonText: CanonicalRegisterJson; sourceRef: string }>;
export function debateShapePolicyStartValues(opening?: DebateShapeOpening): DebateShapePolicy;
export function debateShapePlanKeyOf(planId: PlanId | null, planTier: PlanTier): DebateShapePlanKey;
export function normaliseDepthParamsForShape(depthParams: DepthParams, policy: DebateShapePolicy | null, plan: DebateShapePlanKey): DepthParams;
export function resolveDebateShape(input: Readonly<{ policy: DebateShapePolicy; plan: DebateShapePlanKey; makers: number; settings: DebateShapeSettings }>): DebateShapeCeilingInput | null;
export function assertDebateShapeRunnerReady(policy: DebateShapePolicy | null): void;
```

- [ ] **Step 1: Write the failing test** `tests/unit/debate-shape-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEBATE_SHAPE_OPENINGS, DEBATE_SHAPE_PLAN_KEYS, DEBATE_SHAPE_POLICY_ROW_KEY, assertDebateShapeRunnerReady,
  debateShapePlanKeyOf, debateShapePolicyRow, debateShapePolicyStartValues, normaliseDepthParamsForShape,
  parseDebateShapePolicy, readDebateShapePolicy, resolveDebateShape
} from "@debateai/register";

const START = debateShapePolicyStartValues();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plain = (): any => JSON.parse(JSON.stringify(START));
const poolReturning = (rows: unknown[]) => {
  const calls: unknown[][] = [];
  return { calls, pool: { query: async (_sql: string, params: unknown[]) => { calls.push(params); return { rows }; } } as never };
};
const SETTINGS = Object.freeze({ depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const);

describe("debateShapePolicy: one optional row, absent means today's shape (spec 2026-10-12 §3.1)", () => {
  it("holds the owner's start values (rulings S5-S8), frozen", () => {
    expect(START.plans.free).toEqual({ mapAIs: 3, answers: 3, graders: 2, pointsPerAnswer: 3, deeperTopPoints: 1, gapRoundsMax: 1,
      closeCallExtraGraders: 2, fixedDepthAllowed: false,
      scrutiny: { deep: null, exhaustive: null, scrutinyLeverageMin: 0.05, scrutinyWeakBelow: 0.5 }, opening: "ANGLE_MAP" });
    const scrutiny = { deep: { roundsPerPoint: 2, pointsPerDebate: 6 }, exhaustive: { roundsPerPoint: 3, pointsPerDebate: 15 },
      scrutinyLeverageMin: 0.05, scrutinyWeakBelow: 0.5 };
    const premium = (mapAIs: number, answers: number) => ({ mapAIs, answers, graders: 3, pointsPerAnswer: 4, deeperTopPoints: 2,
      gapRoundsMax: 2, closeCallExtraGraders: 2, fixedDepthAllowed: true, scrutiny, opening: "ANGLE_MAP" });
    expect(START.plans.plus).toEqual(premium(4, 3));
    expect(START.plans.pro).toEqual(premium(5, 4));
    expect(START.plans.max).toEqual(premium(7, 4));
    expect(START.plans.premium).toEqual(START.plans.pro);
    expect(START.answerLength).toEqual({ short: { words: 300, writerBound: 8192 }, standard: { words: 700, writerBound: 12288 },
      detailed: { words: 1500, writerBound: 16384 } });
    expect(Object.isFrozen(START.plans.max.scrutiny.exhaustive)).toBe(true);
    expect(DEBATE_SHAPE_PLAN_KEYS).toEqual(["free", "plus", "pro", "max", "premium"]);
    expect(DEBATE_SHAPE_OPENINGS).toEqual(["ANGLE_MAP", "BLIND_LISTS", "SNOWBALL"]);
    expect(debateShapePolicyStartValues("SNOWBALL").plans.pro.opening).toBe("SNOWBALL");
  });

  it.each([
    ["a map size above its bound", (v: any) => { v.plans.free.mapAIs = 10; }, "plans.free.mapAIs"],
    ["one answer", (v: any) => { v.plans.pro.answers = 1; }, "plans.pro.answers"],
    ["no grader", (v: any) => { v.plans.max.graders = 0; }, "plans.max.graders"],
    ["an unknown opening", (v: any) => { v.plans.plus.opening = "DEBATE"; }, "plans.plus.opening"],
    ["deep rounds above their bound", (v: any) => { v.plans.pro.scrutiny.deep.roundsPerPoint = 6; }, "plans.pro.scrutiny.deep.roundsPerPoint"],
    ["a leverage share above one", (v: any) => { v.plans.pro.scrutiny.scrutinyLeverageMin = 1.5; }, "plans.pro.scrutiny.scrutinyLeverageMin"],
    ["a share with seven decimals", (v: any) => { v.plans.free.scrutiny.scrutinyWeakBelow = 0.1234567; }, "plans.free.scrutiny.scrutinyWeakBelow"],
    ["a missing premium fallback", (v: any) => { delete v.plans.premium; }, "plans.premium"],
    ["an unknown plan field", (v: any) => { v.plans.free.concurrency = 3; }, "plans.free"],
    ["the wrong kind", (v: any) => { v.kind = "CALL_CONCURRENCY_POLICY"; }, "kind"],
    ["another version", (v: any) => { v.version = 2; }, "version"],
    ["lengths that do not rise", (v: any) => { v.answerLength.short.words = 800; }, "answerLength.words"]
  ])("refuses %s, naming the path", (_name, mutate, path) => {
    const value = plain();
    mutate(value);
    expect(() => parseDebateShapePolicy(value)).toThrow(`DEBATE_SHAPE_POLICY_INVALID:${path}`);
  });
  it("refuses a value that is not an object, and a __proto__ key a JSON text carries", () => {
    expect(() => parseDebateShapePolicy("ON")).toThrow("DEBATE_SHAPE_POLICY_INVALID:$");
    const text = JSON.stringify(plain()).replace('"plans":{', '"plans":{"__proto__":{},');
    expect(() => parseDebateShapePolicy(JSON.parse(text))).toThrow("DEBATE_SHAPE_POLICY_INVALID:plans.__proto__");
  });

  it("reads ABSENT as null, a valid row as the policy, and refuses a malformed row loudly", async () => {
    const absent = poolReturning([]);
    await expect(readDebateShapePolicy(absent.pool, 9)).resolves.toBeNull();
    expect(absent.calls).toEqual([[9, DEBATE_SHAPE_POLICY_ROW_KEY]]);
    await expect(readDebateShapePolicy(poolReturning([{ value_json: plain() }]).pool, 10)).resolves.toEqual(START);
    await expect(readDebateShapePolicy(poolReturning([{ value_json: { ...plain(), kind: "X" } }]).pool, 10))
      .rejects.toThrow("DEBATE_SHAPE_POLICY_INVALID:kind");
  });

  it("the publishers' row is the canonical JSON of the value and parses back to it", () => {
    const row = debateShapePolicyRow(START, "docs/superpowers/specs/2026-10-12-debate-shape-design.md; owner 2026-10-12");
    expect(row.rowKey).toBe("debateShapePolicy");
    expect(JSON.parse(row.valueJsonText)).toEqual(plain());
    const again = debateShapePolicyRow(parseDebateShapePolicy(JSON.parse(row.valueJsonText)), row.sourceRef);
    expect(again.valueJsonText).toBe(row.valueJsonText);
    expect(() => debateShapePolicyRow(START, " ")).toThrow("DEBATE_SHAPE_POLICY_INVALID:sourceRef");
  });

  it("the plan key: the plan id with billing on, else the tier", () => {
    expect(["FREE", "PLUS", "PRO", "MAX"].map((id) => debateShapePlanKeyOf(id as never, "premium"))).toEqual(["free", "plus", "pro", "max"]);
    expect(debateShapePlanKeyOf(null, "free")).toBe("free");
    expect(debateShapePlanKeyOf(null, "premium")).toBe("premium");
  });

  it("normalises per plan; without the row a depth-only ask is the same object and anything else is stripped", () => {
    const depthOnly = Object.freeze({ depth: 2 });
    expect(normaliseDepthParamsForShape(depthOnly, null, "free")).toBe(depthOnly);
    expect(normaliseDepthParamsForShape({ depth: 2, depthMode: "fixed", answerLength: "short" }, null, "pro")).toEqual({ depth: 2 });
    const free = normaliseDepthParamsForShape({ depth: 2, depthMode: "fixed", scrutiny: "exhaustive", answerLength: "detailed" }, START, "free");
    expect(JSON.stringify(free)).toBe('{"depth":2,"depthMode":"adaptive","scrutiny":"standard","answerLength":"detailed"}');
    expect(normaliseDepthParamsForShape({ depth: 3 }, START, "pro"))
      .toEqual({ depth: 3, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" });
    expect(normaliseDepthParamsForShape({ depth: 3, depthMode: "fixed", scrutiny: "deep" }, START, "max"))
      .toEqual({ depth: 3, depthMode: "fixed", scrutiny: "deep", answerLength: "standard" });
  });

  it("resolves the sizes, capped by the makers present; one maker keeps today's shape", () => {
    expect(resolveDebateShape({ policy: START, plan: "pro", makers: 1, settings: SETTINGS })).toBeNull();
    expect(resolveDebateShape({ policy: START, plan: "free", makers: 2, settings: SETTINGS }))
      .toMatchObject({ mapAIs: 2, answers: 2, graders: 1, closeCallExtraGraders: 0, pointsPerAnswer: 3, deeperTopPoints: 1, gapRounds: 1 });
    expect(resolveDebateShape({ policy: START, plan: "pro", makers: 5, settings: SETTINGS }))
      .toMatchObject({ mapAIs: 5, answers: 4, graders: 3, closeCallExtraGraders: 1 });
    expect(resolveDebateShape({ policy: START, plan: "max", makers: 7,
      settings: { depthMode: "fixed", scrutiny: "exhaustive", answerLength: "detailed" } })).toEqual({
      plan: "max", depthMode: "fixed", scrutiny: "exhaustive", answerLength: "detailed", mapAIs: 7, answers: 4, graders: 3,
      pointsPerAnswer: 4, deeperTopPoints: 2, gapRounds: 2, closeCallExtraGraders: 2, scrutinyRoundsPerPoint: 3,
      scrutinyPointsPerDebate: 15, scrutinyLeverageMin: 0.05, scrutinyWeakBelow: 0.5, opening: "ANGLE_MAP",
      answerWords: 1500, writerBound: 16384 });
    expect(() => resolveDebateShape({ policy: START, plan: "free", makers: 3, settings: { ...SETTINGS, depthMode: "fixed" } }))
      .toThrow("DEBATE_SHAPE_SETTINGS_NOT_NORMALISED:depthMode");
    expect(() => resolveDebateShape({ policy: START, plan: "free", makers: 3, settings: { ...SETTINGS, scrutiny: "deep" } }))
      .toThrow("DEBATE_SHAPE_SETTINGS_NOT_NORMALISED:scrutiny");
    expect(() => resolveDebateShape({ policy: START, plan: "free", makers: 0, settings: SETTINGS })).toThrow("DEBATE_SHAPE_MAKERS_INVALID");
  });

  it("Phase 2a: a valid row refuses the runner's boot until the runner can run the shape", () => {
    expect(() => assertDebateShapeRunnerReady(null)).not.toThrow();
    const refused = (() => { try { assertDebateShapeRunnerReady(START); return null; } catch (error) { return error; } })();
    expect(refused).toMatchObject({ code: "DEBATE_SHAPE_POLICY_RUNNER_PENDING" });
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/debate-shape-policy.test.ts`

Expected: FAIL. `debateShapePolicyStartValues` is not exported.

- [ ] **Step 3: Implement** `packages/register/src/debate-shape-policy.ts`:

```ts
import type { Pool } from "pg";
import { z } from "zod";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import {
  debateShapeSettingsOf, type AnswerLength, type DebateShapeSettings, type DepthMode, type DepthParams, type PlanTier, type Scrutiny
} from "@debateai/contract";
import type { PlanId } from "./billing-plans.js";
import { canonicalDecimal, canonicalRegisterJson, type CanonicalJsonAst, type CanonicalRegisterJson } from "./register-publication.js";

/**
 * Debate shape (spec docs/superpowers/specs/2026-10-12-debate-shape-design.md §3.1): ONE optional row in its own family,
 * like answerRoleRotationPolicy and callConcurrencyPolicy. It is NOT a register.required_row, not in the bootstrap and
 * not in the development rows, so every sealed version without it keeps parsing and reads ABSENT: today's shape, byte
 * for byte (the owners' rollback). A row that does not parse is loud: the API's and the runner's boots refuse.
 * A new value is a new register version, never an edit.
 */
export const DEBATE_SHAPE_POLICY_ROW_KEY = "debateShapePolicy" as const;
/** The plan keys a row sizes: the four sold plans, and `premium` for a premium ask with no plan id (billing off). */
export const DEBATE_SHAPE_PLAN_KEYS = Object.freeze(["free", "plus", "pro", "max", "premium"] as const);
export type DebateShapePlanKey = typeof DEBATE_SHAPE_PLAN_KEYS[number];
/** The openings Phase 1 compared; the owners' default is the angle map (ruling S1). */
export const DEBATE_SHAPE_OPENINGS = Object.freeze(["ANGLE_MAP", "BLIND_LISTS", "SNOWBALL"] as const);
export type DebateShapeOpening = typeof DEBATE_SHAPE_OPENINGS[number];

export type DebateShapeScrutinyBudget = Readonly<{ roundsPerPoint: number; pointsPerDebate: number }>;
export type DebateShapePlan = Readonly<{
  mapAIs: number;
  answers: number;
  graders: number;
  pointsPerAnswer: number;
  deeperTopPoints: number;
  gapRoundsMax: number;
  closeCallExtraGraders: number;
  fixedDepthAllowed: boolean;
  scrutiny: Readonly<{
    deep: DebateShapeScrutinyBudget | null;
    exhaustive: DebateShapeScrutinyBudget | null;
    scrutinyLeverageMin: number;
    scrutinyWeakBelow: number;
  }>;
  opening: DebateShapeOpening;
}>;
export type DebateShapeLength = Readonly<{ words: number; writerBound: number }>;
export type DebateShapePolicy = Readonly<{
  kind: "DEBATE_SHAPE_POLICY";
  version: 1;
  plans: Readonly<Record<DebateShapePlanKey, DebateShapePlan>>;
  answerLength: Readonly<Record<AnswerLength, DebateShapeLength>>;
}>;

/**
 * The sizes ONE admitted debate runs (spec §3.1, §3.6): the plan's row capped by the makers present, the asked
 * settings (already normalised for the plan) and their budgets. Minted by the API at admission and frozen on the run's
 * receipt (`envelope_basis.shape`); the runner reads them back from there and never resolves the plan again.
 */
export type DebateShapeCeilingInput = Readonly<{
  plan: DebateShapePlanKey;
  depthMode: DepthMode;
  scrutiny: Scrutiny;
  answerLength: AnswerLength;
  mapAIs: number;
  answers: number;
  graders: number;
  pointsPerAnswer: number;
  deeperTopPoints: number;
  gapRounds: number;
  closeCallExtraGraders: number;
  scrutinyRoundsPerPoint: number;
  scrutinyPointsPerDebate: number;
  scrutinyLeverageMin: number;
  scrutinyWeakBelow: number;
  opening: DebateShapeOpening;
  answerWords: number;
  writerBound: number;
}>;

const whole = (min: number, max: number) => z.number().int().min(min).max(max);
/** A share 0..1 with at most six decimals: the register's canonical decimal limit. */
const share = z.number().min(0).max(1).refine((value) => Number(value.toFixed(6)) === value);
const scrutinyBudget = (roundsMax: number, pointsMax: number) =>
  z.object({ roundsPerPoint: whole(1, roundsMax), pointsPerDebate: whole(1, pointsMax) }).strict();
const planSchema = z.object({
  mapAIs: whole(2, 9),
  answers: whole(2, 5),
  graders: whole(1, 5),
  pointsPerAnswer: whole(1, 6),
  deeperTopPoints: whole(1, 6),
  gapRoundsMax: whole(0, 3),
  closeCallExtraGraders: whole(0, 4),
  fixedDepthAllowed: z.boolean(),
  scrutiny: z.object({
    deep: scrutinyBudget(5, 30).nullable(),
    exhaustive: scrutinyBudget(8, 60).nullable(),
    scrutinyLeverageMin: share,
    scrutinyWeakBelow: share
  }).strict(),
  opening: z.enum(DEBATE_SHAPE_OPENINGS)
}).strict();
const lengthSchema = z.object({ words: whole(50, 5000), writerBound: whole(1024, 65536) }).strict();
const policySchema = z.object({
  kind: z.literal("DEBATE_SHAPE_POLICY"),
  version: z.literal(1),
  plans: z.object({ free: planSchema, plus: planSchema, pro: planSchema, max: planSchema, premium: planSchema }).strict(),
  answerLength: z.object({ short: lengthSchema, standard: lengthSchema, detailed: lengthSchema }).strict()
}).strict().superRefine((policy, ctx) => {
  const { short, standard, detailed } = policy.answerLength;
  if (!(short.words < standard.words && standard.words < detailed.words)) {
    ctx.addIssue({ code: "custom", path: ["answerLength", "words"], message: "the words rise short < standard < detailed" });
  }
  if (!(short.writerBound <= standard.writerBound && standard.writerBound <= detailed.writerBound)) {
    ctx.addIssue({ code: "custom", path: ["answerLength", "writerBound"], message: "the writer bound never falls with length" });
  }
});

const invalid = (path: string): never => { throw new TypeError(`DEBATE_SHAPE_POLICY_INVALID:${path}`); };

/** An own `__proto__` key (as JSON.parse makes one) is refused by name, never dropped by a parse. */
function protoKeyPath(value: unknown, path: readonly string[]): string | null {
  if (value === null || typeof value !== "object") return null;
  for (const key of Object.keys(value)) {
    if (key === "__proto__") return [...path, key].join(".");
    const inner = protoKeyPath((value as Record<string, unknown>)[key], [...path, key]);
    if (inner !== null) return inner;
  }
  return null;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/** Strict: any defect throws `DEBATE_SHAPE_POLICY_INVALID:<path>` (`$` for the root). */
export function parseDebateShapePolicy(value: unknown): DebateShapePolicy {
  const proto = protoKeyPath(value, []);
  if (proto !== null) return invalid(proto);
  const parsed = policySchema.safeParse(value);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path ?? [];
    return invalid(path.length === 0 ? "$" : path.map(String).join("."));
  }
  return deepFreeze(parsed.data) as DebateShapePolicy;
}

/** ABSENT reads as null (today's shape); a malformed row throws, so the caller's boot refuses. */
export async function readDebateShapePolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<DebateShapePolicy | null> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, DEBATE_SHAPE_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : parseDebateShapePolicy(row.value_json);
}

/** The canonical AST: every number a DECIMAL node (integers and the six-decimal shares alike). */
function shapeAst(value: unknown): CanonicalJsonAst {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return canonicalDecimal(String(value));
  return Object.freeze(Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, shapeAst(inner)])
  ));
}

/** The row a publisher seals (the preview's v2 kit; the hosted file's optional member), re-checked by the parser. */
export function debateShapePolicyRow(policy: DebateShapePolicy, sourceRef: string): Readonly<{
  rowKey: typeof DEBATE_SHAPE_POLICY_ROW_KEY; valueJsonText: CanonicalRegisterJson; sourceRef: string;
}> {
  if (typeof sourceRef !== "string" || sourceRef.trim() === "") return invalid("sourceRef");
  const checked = parseDebateShapePolicy(policy);
  return Object.freeze({ rowKey: DEBATE_SHAPE_POLICY_ROW_KEY, valueJsonText: canonicalRegisterJson(shapeAst(checked)), sourceRef });
}

/** The owners' start values (rulings S5-S8); `opening` is the Phase 1 pick (ruling S1: the angle map). */
export function debateShapePolicyStartValues(opening: DebateShapeOpening = "ANGLE_MAP"): DebateShapePolicy {
  const premiumScrutiny = {
    deep: { roundsPerPoint: 2, pointsPerDebate: 6 },
    exhaustive: { roundsPerPoint: 3, pointsPerDebate: 15 },
    scrutinyLeverageMin: 0.05,
    scrutinyWeakBelow: 0.5
  };
  const premium = (mapAIs: number, answers: number) => ({
    mapAIs, answers, graders: 3, pointsPerAnswer: 4, deeperTopPoints: 2, gapRoundsMax: 2, closeCallExtraGraders: 2,
    fixedDepthAllowed: true, scrutiny: premiumScrutiny, opening
  });
  return parseDebateShapePolicy({
    kind: "DEBATE_SHAPE_POLICY",
    version: 1,
    plans: {
      free: {
        mapAIs: 3, answers: 3, graders: 2, pointsPerAnswer: 3, deeperTopPoints: 1, gapRoundsMax: 1, closeCallExtraGraders: 2,
        fixedDepthAllowed: false,
        scrutiny: { deep: null, exhaustive: null, scrutinyLeverageMin: 0.05, scrutinyWeakBelow: 0.5 },
        opening
      },
      plus: premium(4, 3),
      pro: premium(5, 4),
      max: premium(7, 4),
      premium: premium(5, 4)
    },
    answerLength: {
      short: { words: 300, writerBound: 8192 },
      standard: { words: 700, writerBound: 12288 },
      detailed: { words: 1500, writerBound: 16384 }
    }
  });
}

/** INTERFACE §1: the run's plan id when billing is on, else the tier (free -> free, premium -> premium). */
export function debateShapePlanKeyOf(planId: PlanId | null, planTier: PlanTier): DebateShapePlanKey {
  if (planId !== null) {
    switch (planId) {
      case "FREE": return "free";
      case "PLUS": return "plus";
      case "PRO": return "pro";
      case "MAX": return "max";
      default: return exhaustive(planId);
    }
  }
  switch (planTier) {
    case "free": return "free";
    case "premium": return "premium";
    default: return exhaustive(planTier);
  }
}

function scrutinyBudgetOf(plan: DebateShapePlan, scrutiny: Scrutiny): DebateShapeScrutinyBudget | null {
  switch (scrutiny) {
    case "standard": return Object.freeze({ roundsPerPoint: 0, pointsPerDebate: 0 });
    case "deep": return plan.scrutiny.deep;
    case "exhaustive": return plan.scrutiny.exhaustive;
    default: return exhaustive(scrutiny);
  }
}

/**
 * The plan's normalisation (spec §3.2). With the row: fixed -> adaptive where the plan does not allow it, a scrutiny
 * the plan has no budget for -> standard, and every key written in one order. Without it: `{ depth }` exactly (the same
 * object for a depth-only ask), so nothing a client sends can change today's stored bytes. Depth is never changed here.
 */
export function normaliseDepthParamsForShape(depthParams: DepthParams, policy: DebateShapePolicy | null, plan: DebateShapePlanKey): DepthParams {
  if (policy === null) return Object.keys(depthParams).length === 1 ? depthParams : Object.freeze({ depth: depthParams.depth });
  const rules = policy.plans[plan];
  const asked = debateShapeSettingsOf(depthParams);
  const depthMode: DepthMode = asked.depthMode === "fixed" && !rules.fixedDepthAllowed ? "adaptive" : asked.depthMode;
  const scrutiny: Scrutiny = scrutinyBudgetOf(rules, asked.scrutiny) === null ? "standard" : asked.scrutiny;
  return Object.freeze({ depth: depthParams.depth, depthMode, scrutiny, answerLength: asked.answerLength });
}

const notNormalised = (key: string): never => { throw new TypeError(`DEBATE_SHAPE_SETTINGS_NOT_NORMALISED:${key}`); };

/**
 * The sizes for `makers` distinct makers (INTERFACE §1): answers <= makers, map AIs <= makers, graders <= makers - 1 and
 * the close-call extras only from makers not already grading. Fewer than two makers: null (today's single position).
 * The settings must already be normalised for `plan`; an un-normalised one is an engine fault, never a silent fix.
 */
export function resolveDebateShape(input: Readonly<{
  policy: DebateShapePolicy; plan: DebateShapePlanKey; makers: number; settings: DebateShapeSettings;
}>): DebateShapeCeilingInput | null {
  if (!Number.isSafeInteger(input.makers) || input.makers < 1) throw new TypeError("DEBATE_SHAPE_MAKERS_INVALID");
  if (input.makers < 2) return null;
  const rules = input.policy.plans[input.plan];
  const { depthMode, scrutiny, answerLength } = input.settings;
  if (depthMode === "fixed" && !rules.fixedDepthAllowed) return notNormalised("depthMode");
  const budget = scrutinyBudgetOf(rules, scrutiny) ?? notNormalised("scrutiny");
  const graders = Math.min(rules.graders, input.makers - 1);
  const length = input.policy.answerLength[answerLength];
  return Object.freeze({
    plan: input.plan,
    depthMode,
    scrutiny,
    answerLength,
    mapAIs: Math.min(rules.mapAIs, input.makers),
    answers: Math.min(rules.answers, input.makers),
    graders,
    pointsPerAnswer: rules.pointsPerAnswer,
    deeperTopPoints: rules.deeperTopPoints,
    gapRounds: rules.gapRoundsMax,
    closeCallExtraGraders: Math.min(rules.closeCallExtraGraders, input.makers - 1 - graders),
    scrutinyRoundsPerPoint: budget.roundsPerPoint,
    scrutinyPointsPerDebate: budget.pointsPerDebate,
    scrutinyLeverageMin: rules.scrutiny.scrutinyLeverageMin,
    scrutinyWeakBelow: rules.scrutiny.scrutinyWeakBelow,
    opening: rules.opening,
    answerWords: length.words,
    writerBound: length.writerBound
  });
}

/**
 * Phase 2a ONLY (contract deviation 7): the runner cannot yet run the shape, so a valid row refuses its boot rather
 * than let it run receipts minted for the shape as today's shape. Phase 2b deletes this function and its one call.
 */
export function assertDebateShapeRunnerReady(policy: DebateShapePolicy | null): void {
  if (policy !== null) {
    throw new TypedDomainError(
      "DEBATE_SHAPE_POLICY_RUNNER_PENDING",
      "The register seals a debateShapePolicy row, and this runner cannot run the debate shape yet"
    );
  }
}
```

In `packages/register/src/index.ts`, add after the role-rotation export block (and after Project 1's call-concurrency block):

```ts
export {
  DEBATE_SHAPE_OPENINGS,
  DEBATE_SHAPE_PLAN_KEYS,
  DEBATE_SHAPE_POLICY_ROW_KEY,
  assertDebateShapeRunnerReady,
  debateShapePlanKeyOf,
  debateShapePolicyRow,
  debateShapePolicyStartValues,
  normaliseDepthParamsForShape,
  parseDebateShapePolicy,
  readDebateShapePolicy,
  resolveDebateShape,
  type DebateShapeCeilingInput,
  type DebateShapeLength,
  type DebateShapeOpening,
  type DebateShapePlan,
  type DebateShapePlanKey,
  type DebateShapePolicy,
  type DebateShapeScrutinyBudget
} from "./debate-shape-policy.js";
```

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/debate-shape-policy.test.ts`

If the `__proto__` case reports a different path, check `protoKeyPath` runs before the zod parse. Do not loosen the test.

- [ ] **Step 5: Add the new file to the shipped corpus and check the depth oracle**

Run: `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`

Then run: `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`

Expected: PASS. `git diff tests/support/shipped-corpus.manifest.txt` shows exactly one added line, `packages/register/src/debate-shape-policy.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/register/src/debate-shape-policy.ts packages/register/src/index.ts tests/support/shipped-corpus.manifest.txt tests/unit/debate-shape-policy.test.ts
git commit -m "Register: optional debateShapePolicy row (parse, read, row, start values), plan key, normalisation and sizes capped by makers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The ceiling learns the shape: `DR-185-shape-v1`

**Files:**
- Create: `packages/register/src/debate-shape-ceiling.ts`
- Modify: `packages/register/src/index.ts` (`StructuralCeilingInput` ~150–204, `STRUCTURAL_CEILING_MEMBERS` ~212, `computeStructuralCeilingBasis` ~374–517, exports)
- Modify: `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/debate-shape-ceiling.test.ts` (create)

**Interfaces:**
- Consumes: `DebateShapeCeilingInput`, `DEBATE_SHAPE_PLAN_KEYS`, `DEBATE_SHAPE_OPENINGS` (Task 2); `DepthModeSchema`, `ScrutinySchema`, `AnswerLengthSchema` (Task 1); `TypedDomainError`.
- Produces:
```ts
export const DEBATE_SHAPE_FORMULA_VERSION: "DR-185-shape-v1";
export type DebateShapeSiteCounts = Readonly<{ mapSites: number; positionNodes: number; pointNodes: number; crossNodes: number;
  deeperNodes: number; scrutinyNodes: number; nodes: number }>;
export function debateShapeSiteCounts(shape: DebateShapeCeilingInput, depth: number): DebateShapeSiteCounts;
export function assertDebateShapeCeilingInput(shape: DebateShapeCeilingInput, panelSize: number): void;
export const debateShapeReceiptSchema: z.ZodObject<...>; // strict
export type DebateShapeReceipt = z.infer<typeof debateShapeReceiptSchema>;
export function debateShapeReceipt(shape: DebateShapeCeilingInput, counts: DebateShapeSiteCounts, backupSequences: 0 | 1): DebateShapeReceipt;
export function debateShapeOfReceipt(receipt: DebateShapeReceipt): DebateShapeCeilingInput;
export function structuralBasisProvisionsBackup(basis: Readonly<Record<string, unknown>>): boolean;
// StructuralCeilingInput gains: readonly shape?: DebateShapeCeilingInput;
```

- [ ] **Step 1: Write the failing test** `tests/unit/debate-shape-ceiling.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { debateShapeSettingsOf, type AnswerLength, type DepthMode, type Scrutiny } from "@debateai/contract";
import {
  DEBATE_SHAPE_FORMULA_VERSION, DEBATE_SHAPE_PLAN_KEYS, computeStructuralCeilingBasis, debateShapePolicyStartValues,
  debateShapeSiteCounts, normaliseDepthParamsForShape, resolveDebateShape, structuralBasisProvisionsBackup,
  type DebateShapeCeilingInput, type DebateShapePlanKey
} from "@debateai/register";

const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const POLICY = debateShapePolicyStartValues();
type Asked = Readonly<{ depthMode: DepthMode; scrutiny: Scrutiny; answerLength: AnswerLength }>;
const STANDARD: Asked = Object.freeze({ depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" });

function shapeFor(plan: DebateShapePlanKey, makers: number, asked: Asked, depth: number): DebateShapeCeilingInput {
  const depthParams = normaliseDepthParamsForShape({ depth, ...asked }, POLICY, plan);
  const shape = resolveDebateShape({ policy: POLICY, plan, makers, settings: debateShapeSettingsOf(depthParams) });
  if (shape === null) throw new Error("a one-maker panel has no shape");
  return shape;
}
const basisOf = (shape: DebateShapeCeilingInput | undefined, panelSize: number, depth: number, backup: 0 | 1 = 0) =>
  computeStructuralCeilingBasis({ ...TERMS, panelSize, depth, backupSequencesProvisioned: backup, ...(shape === undefined ? {} : { shape }) });

/**
 * An INDEPENDENT count: every call the shape can make, listed one by one, each at the attempts its site may spend
 * (the t17 rule: cooldown-wrapped sites judge + final (+ judge with a backup), cross-exchange authors judge + final,
 * panel members judge (+ judge), serve organ (+ organ)). Close-call extras are counted on EVERY node.
 */
function enumerateAttempts(shape: DebateShapeCeilingInput, depth: number, backup: 0 | 1): number {
  const cooldown = TERMS.judgeMaxAttempts + TERMS.finalRetryAttempts + backup * TERMS.judgeMaxAttempts;
  const crossSite = TERMS.judgeMaxAttempts + TERMS.finalRetryAttempts;
  const member = TERMS.judgeMaxAttempts + backup * TERMS.judgeMaxAttempts;
  const serve = TERMS.organMaxAttempts + backup * TERMS.organMaxAttempts;
  const calls: number[] = [];
  calls.push(cooldown); // MAP:angles
  for (let list = 0; list < shape.mapAIs; list += 1) calls.push(cooldown, cooldown); // MAP:list:<i>, and again when handed on
  calls.push(cooldown); // MAP:merge
  for (let gap = 0; gap < shape.gapRounds; gap += 1) calls.push(cooldown); // MAP:gap:<k>
  calls.push(cooldown); // MAP:choose
  const node = (author: number): void => {
    calls.push(author);
    for (let grader = 0; grader < shape.graders + shape.closeCallExtraGraders; grader += 1) calls.push(member);
    for (let review = 0; review < TERMS.reviewerCallsPerNode; review += 1) calls.push(cooldown);
  };
  for (let position = 0; position < shape.answers; position += 1) {
    node(cooldown);
    for (let point = 0; point < shape.pointsPerAnswer; point += 1) node(cooldown);
    node(crossSite);
  }
  const deeper = shape.depthMode === "fixed" ? shape.pointsPerAnswer : shape.deeperTopPoints;
  for (let round = 2; round <= depth; round += 1) {
    for (let position = 0; position < shape.answers; position += 1) {
      for (let point = 0; point < deeper; point += 1) { node(cooldown); node(cooldown); }
    }
  }
  for (let point = 0; point < shape.scrutinyPointsPerDebate; point += 1) {
    for (let round = 0; round < shape.scrutinyRoundsPerPoint; round += 1) { node(cooldown); node(cooldown); }
  }
  for (let round = 0; round < TERMS.synthesizerMaxRounds + TERMS.evaluatorMaxRounds; round += 1) calls.push(serve);
  return calls.reduce((sum, attempts) => sum + attempts, 0);
}

describe("the structural ceiling learns the debate shape (spec 2026-10-12 §3.6)", () => {
  it("row absent: today's receipt, byte for byte, and never a shape key", () => {
    expect(JSON.stringify(basisOf(undefined, 2, 1))).toBe(
      '{"kind":"COMPUTED_STRUCTURAL_CEILING","max_model_attempts":106,"panel_size":2,"depth":1,'
      + '"per_site_attempts":{"judge":3,"organ":3,"panel_member":3,"cooldown_site":4},'
      + '"call_sites":{"author":8,"panel":8,"reviewer":8,"serve":6},'
      + '"serve_leg":{"synthesis_loop_sites":6,"selected":"SYNTHESIS_LOOP"},"serve_reserve_attempts":18,"hold_cap":2,'
      + '"final_retry_attempts":1,"formula_version":"DR-184-v4","bounds_source_ref":"engine-exports+register"}');
    for (const panelSize of [1, 2, 3, 4]) for (const depth of [1, 2, 3, 4, 5]) for (const backup of [0, 1] as const) {
      const basis = basisOf(undefined, panelSize, depth, backup);
      expect("shape" in basis).toBe(false);
      expect(basis.formula_version).toBe(backup === 1 ? "DR-184-v5" : "DR-184-v4");
    }
  });

  it("pins Free with 3 makers at depth 2 (adaptive, standard): 352 attempts", () => {
    const basis = basisOf(shapeFor("free", 3, STANDARD, 2), 3, 2);
    expect(basis.max_model_attempts).toBe(352);
    expect(basis.call_sites).toEqual({ author: 31, panel: 42, reviewer: 21, serve: 6 });
    expect(basis.serve_reserve_attempts).toBe(18);
    expect(basis.formula_version).toBe(DEBATE_SHAPE_FORMULA_VERSION);
    expect(basis.shape).toMatchObject({ plan: "free", map_sites: 10, nodes: 21, cross_nodes: 3, backup_sequences: 0, writer_bound: 12288 });
  });
  it("pins Max with 7 makers at depth 2, exhaustive scrutiny: 3,084 attempts", () => {
    const basis = basisOf(shapeFor("max", 7, { ...STANDARD, scrutiny: "exhaustive" }, 2), 7, 2);
    expect(basis.max_model_attempts).toBe(3084);
    expect(basis.call_sites).toEqual({ author: 149, panel: 650, reviewer: 130, serve: 6 });
  });
  it("pins Pro with 5 makers at depth 3, fixed, deep, with a backup sequence: 4,385 attempts", () => {
    const basis = basisOf(shapeFor("pro", 5, { depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" }, 3), 5, 3, 1);
    expect(basis.max_model_attempts).toBe(4385);
    expect(basis.per_site_attempts).toEqual({ judge: 3, organ: 6, panel_member: 6, cooldown_site: 7, cross_exchange_site: 4 });
    expect(basis.serve_reserve_attempts).toBe(36);
    expect(structuralBasisProvisionsBackup(basis)).toBe(true);
  });
  it("two makers: one grader and no close-call extra, 160 attempts at depth 1", () => {
    const shape = shapeFor("free", 2, STANDARD, 1);
    expect(shape).toMatchObject({ answers: 2, graders: 1, closeCallExtraGraders: 0, mapAIs: 2 });
    expect(basisOf(shape, 2, 1).max_model_attempts).toBe(160);
    expect(debateShapeSiteCounts(shape, 1)).toEqual({ mapSites: 8, positionNodes: 2, pointNodes: 6, crossNodes: 2,
      deeperNodes: 0, scrutinyNodes: 0, nodes: 10 });
  });

  it("EQUALS an independent call-by-call enumeration over the whole grid (never under-counts)", () => {
    const modes: readonly DepthMode[] = ["adaptive", "fixed"];
    const scrutinies: readonly Scrutiny[] = ["standard", "deep", "exhaustive"];
    let checked = 0;
    for (const plan of DEBATE_SHAPE_PLAN_KEYS) for (let makers = 2; makers <= 9; makers += 1) {
      for (let depth = 1; depth <= TERMS.maxDepth; depth += 1) for (const depthMode of modes) for (const scrutiny of scrutinies) {
        for (const backup of [0, 1] as const) {
          const shape = shapeFor(plan, makers, { depthMode, scrutiny, answerLength: "standard" }, depth);
          const basis = basisOf(shape, makers, depth, backup);
          expect(basis.max_model_attempts, `${plan} M${makers} d${depth} ${depthMode} ${scrutiny} b${backup}`)
            .toBe(enumerateAttempts(shape, depth, backup));
          expect(basis.max_model_attempts).toBeGreaterThan(basis.serve_reserve_attempts);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(5 * 8 * 5 * 2 * 3 * 2);
  });

  it("refuses a shape the panel cannot run", () => {
    const shape = shapeFor("pro", 5, STANDARD, 1);
    const code = (run: () => unknown): unknown => { try { run(); return null; } catch (error) { return (error as { code?: unknown }).code; } };
    expect(code(() => basisOf(shape, 1, 1))).toBe("STRUCTURAL_CEILING_SHAPE_INVALID");
    expect(code(() => basisOf(shape, 3, 1))).toBe("STRUCTURAL_CEILING_SHAPE_INVALID");
    expect(code(() => basisOf({ ...shape, closeCallExtraGraders: 2 }, 5, 1))).toBe("STRUCTURAL_CEILING_SHAPE_INVALID");
    expect(code(() => basisOf({ ...shape, scrutinyRoundsPerPoint: 2 }, 5, 1))).toBe("STRUCTURAL_CEILING_SHAPE_INVALID");
  });

  it("the backup test reads v5 and a shape receipt's own flag, nothing else", () => {
    expect(structuralBasisProvisionsBackup(basisOf(undefined, 3, 1, 1))).toBe(true);
    expect(structuralBasisProvisionsBackup(basisOf(undefined, 3, 1, 0))).toBe(false);
    expect(structuralBasisProvisionsBackup(basisOf(shapeFor("free", 3, STANDARD, 1), 3, 1, 0))).toBe(false);
    expect(structuralBasisProvisionsBackup({ formula_version: DEBATE_SHAPE_FORMULA_VERSION })).toBe(false);
  });
});
```

The four pinned figures are worked out in the Global Constraints formula with the terms above (cooldown 4, cross 4, panel member 3, serve 3; with a backup: 7, 4, 6, 6):

- Free M3 d2: map 10, nodes 3+9+3+6 = 21, so (31−3+21)·4 + 3·4 + 42·3 + 6·3 = 352.
- Max M7 d2 exhaustive: map 19, nodes 4+16+4+16+90 = 130, so 275·4 + 16 + 650·3 + 18 = 3,084.
- Pro M5 d3 fixed deep with a backup: map 15, nodes 4+16+4+64+24 = 112, so 235·7 + 16 + 448·6 + 36 = 4,385.
- Free M2 d1: (18−2+10)·4 + 8 + 30 + 18 = 160.

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/debate-shape-ceiling.test.ts`

Expected: FAIL. `DEBATE_SHAPE_FORMULA_VERSION` is not exported.

- [ ] **Step 3: Implement** `packages/register/src/debate-shape-ceiling.ts`:

```ts
import { z } from "zod";
import { AnswerLengthSchema, DepthModeSchema, ScrutinySchema } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { DEBATE_SHAPE_OPENINGS, DEBATE_SHAPE_PLAN_KEYS, type DebateShapeCeilingInput } from "./debate-shape-policy.js";

/** The receipt name of a ceiling minted for the debate shape (spec 2026-10-12 §3.6). */
export const DEBATE_SHAPE_FORMULA_VERSION = "DR-185-shape-v1" as const;

export type DebateShapeSiteCounts = Readonly<{
  mapSites: number;
  positionNodes: number;
  pointNodes: number;
  crossNodes: number;
  deeperNodes: number;
  scrutinyNodes: number;
  nodes: number;
}>;

/**
 * The shape's call sites (spec §3.6, contract deviations 4-5). Map: the angle planner, every list TWICE (a failed list
 * is handed to another seat under its own key), the merge, each gap round and the choose. Nodes: the P positions, K
 * points under each, one cross-reply each, then per deeper round a reply and a defence under X top points per position
 * (adaptive) or under every one of the K chosen points (fixed), and the scrutiny budget's exchanges.
 */
export function debateShapeSiteCounts(shape: DebateShapeCeilingInput, depth: number): DebateShapeSiteCounts {
  if (!Number.isSafeInteger(depth) || depth < 1) throw new TypeError("DEBATE_SHAPE_ROUNDS_INVALID");
  const mapSites = 3 + 2 * shape.mapAIs + shape.gapRounds;
  const positionNodes = shape.answers;
  const pointNodes = shape.answers * shape.pointsPerAnswer;
  const crossNodes = shape.answers;
  const pointsPerDeeperRound = shape.depthMode === "fixed" ? shape.pointsPerAnswer : shape.deeperTopPoints;
  const deeperNodes = (depth - 1) * 2 * shape.answers * pointsPerDeeperRound;
  const scrutinyNodes = 2 * shape.scrutinyRoundsPerPoint * shape.scrutinyPointsPerDebate;
  return Object.freeze({
    mapSites, positionNodes, pointNodes, crossNodes, deeperNodes, scrutinyNodes,
    nodes: positionNodes + pointNodes + crossNodes + deeperNodes + scrutinyNodes
  });
}

/** Admission's shape must fit the panel it was resolved for; anything else is refused before a ceiling is minted. */
export function assertDebateShapeCeilingInput(shape: DebateShapeCeilingInput, panelSize: number): void {
  const refuse = (what: string): never => {
    throw new TypedDomainError("STRUCTURAL_CEILING_SHAPE_INVALID", `The debate shape's ${what} does not fit the admitted panel`);
  };
  const whole = (value: number, min: number): boolean => Number.isSafeInteger(value) && value >= min;
  if (!whole(panelSize, 2)) refuse("panel");
  if (!whole(shape.mapAIs, 2) || shape.mapAIs > panelSize) refuse("map size");
  if (!whole(shape.answers, 2) || shape.answers > panelSize) refuse("answers");
  if (!whole(shape.graders, 1) || !whole(shape.closeCallExtraGraders, 0)
    || shape.graders + shape.closeCallExtraGraders > panelSize - 1) refuse("graders");
  if (!whole(shape.pointsPerAnswer, 1) || !whole(shape.deeperTopPoints, 1) || !whole(shape.gapRounds, 0)) refuse("points");
  const noScrutiny = shape.scrutinyRoundsPerPoint === 0;
  if (!whole(shape.scrutinyRoundsPerPoint, 0) || !whole(shape.scrutinyPointsPerDebate, 0)
    || noScrutiny !== (shape.scrutinyPointsPerDebate === 0) || noScrutiny !== (shape.scrutiny === "standard")) refuse("scrutiny budget");
  if (!whole(shape.answerWords, 1) || !whole(shape.writerBound, 1)) refuse("answer length");
  if (!DepthModeSchema.safeParse(shape.depthMode).success || !ScrutinySchema.safeParse(shape.scrutiny).success
    || !AnswerLengthSchema.safeParse(shape.answerLength).success
    || !(DEBATE_SHAPE_PLAN_KEYS as readonly string[]).includes(shape.plan)
    || !(DEBATE_SHAPE_OPENINGS as readonly string[]).includes(shape.opening)) refuse("settings");
}

const count = z.number().int().min(0);
/** The receipt's `shape` member: the run's frozen sizes (contract deviation 3) and the site counts it was billed for. */
export const debateShapeReceiptSchema = z.object({
  version: z.literal(1),
  plan: z.enum(DEBATE_SHAPE_PLAN_KEYS),
  depth_mode: DepthModeSchema,
  scrutiny: ScrutinySchema,
  answer_length: AnswerLengthSchema,
  map_ais: z.number().int().min(2),
  answers: z.number().int().min(2),
  graders: z.number().int().min(1),
  points_per_answer: z.number().int().min(1),
  deeper_top_points: z.number().int().min(1),
  gap_rounds: count,
  close_call_extra_graders: count,
  scrutiny_rounds_per_point: count,
  scrutiny_points_per_debate: count,
  scrutiny_leverage_min: z.number().min(0).max(1),
  scrutiny_weak_below: z.number().min(0).max(1),
  opening: z.enum(DEBATE_SHAPE_OPENINGS),
  answer_words: z.number().int().positive(),
  writer_bound: z.number().int().positive(),
  map_sites: z.number().int().positive(),
  nodes: z.number().int().positive(),
  cross_nodes: z.number().int().positive(),
  backup_sequences: z.union([z.literal(0), z.literal(1)])
}).strict();
export type DebateShapeReceipt = z.infer<typeof debateShapeReceiptSchema>;

export function debateShapeReceipt(shape: DebateShapeCeilingInput, counts: DebateShapeSiteCounts, backupSequences: 0 | 1): DebateShapeReceipt {
  return Object.freeze({
    version: 1 as const,
    plan: shape.plan,
    depth_mode: shape.depthMode,
    scrutiny: shape.scrutiny,
    answer_length: shape.answerLength,
    map_ais: shape.mapAIs,
    answers: shape.answers,
    graders: shape.graders,
    points_per_answer: shape.pointsPerAnswer,
    deeper_top_points: shape.deeperTopPoints,
    gap_rounds: shape.gapRounds,
    close_call_extra_graders: shape.closeCallExtraGraders,
    scrutiny_rounds_per_point: shape.scrutinyRoundsPerPoint,
    scrutiny_points_per_debate: shape.scrutinyPointsPerDebate,
    scrutiny_leverage_min: shape.scrutinyLeverageMin,
    scrutiny_weak_below: shape.scrutinyWeakBelow,
    opening: shape.opening,
    answer_words: shape.answerWords,
    writer_bound: shape.writerBound,
    map_sites: counts.mapSites,
    nodes: counts.nodes,
    cross_nodes: counts.crossNodes,
    backup_sequences: backupSequences
  });
}

/** The sizes a run was admitted with, read back from its receipt (the runner's source of truth, P2b). */
export function debateShapeOfReceipt(receipt: DebateShapeReceipt): DebateShapeCeilingInput {
  return Object.freeze({
    plan: receipt.plan,
    depthMode: receipt.depth_mode,
    scrutiny: receipt.scrutiny,
    answerLength: receipt.answer_length,
    mapAIs: receipt.map_ais,
    answers: receipt.answers,
    graders: receipt.graders,
    pointsPerAnswer: receipt.points_per_answer,
    deeperTopPoints: receipt.deeper_top_points,
    gapRounds: receipt.gap_rounds,
    closeCallExtraGraders: receipt.close_call_extra_graders,
    scrutinyRoundsPerPoint: receipt.scrutiny_rounds_per_point,
    scrutinyPointsPerDebate: receipt.scrutiny_points_per_debate,
    scrutinyLeverageMin: receipt.scrutiny_leverage_min,
    scrutinyWeakBelow: receipt.scrutiny_weak_below,
    opening: receipt.opening,
    answerWords: receipt.answer_words,
    writerBound: receipt.writer_bound
  });
}

/** Whether a receipt provisions the runner-up's backup sequence: DR-184-v5, or a shape receipt that says so. */
export function structuralBasisProvisionsBackup(basis: Readonly<Record<string, unknown>>): boolean {
  if (basis.formula_version === "DR-184-v5") return true;
  if (basis.formula_version !== DEBATE_SHAPE_FORMULA_VERSION) return false;
  const shape = basis.shape;
  return typeof shape === "object" && shape !== null && (shape as { backup_sequences?: unknown }).backup_sequences === 1;
}
```

In `packages/register/src/index.ts`, make the following five edits.

**(a) Imports and exports.** Add near the other local imports:

```ts
import {
  DEBATE_SHAPE_FORMULA_VERSION, assertDebateShapeCeilingInput, debateShapeReceipt, debateShapeSiteCounts
} from "./debate-shape-ceiling.js";
import type { DebateShapeCeilingInput } from "./debate-shape-policy.js";
```

Next to the Task 2 export block, add:

```ts
export {
  DEBATE_SHAPE_FORMULA_VERSION,
  assertDebateShapeCeilingInput,
  debateShapeOfReceipt,
  debateShapeReceipt,
  debateShapeReceiptSchema,
  debateShapeSiteCounts,
  structuralBasisProvisionsBackup,
  type DebateShapeReceipt,
  type DebateShapeSiteCounts
} from "./debate-shape-ceiling.js";
```

**(b) The input.** In `StructuralCeilingInput`, after `readonly backupSequencesProvisioned?: 0 | 1;`, add:

```ts
  /**
   * Debate shape (spec 2026-10-12 §3.6) — the sizes the admitted panel runs under the register's optional
   * `debateShapePolicy` row (`resolveDebateShape`), passed only when the row is in force and the panel has two or more
   * makers. Absent: the receipt is DR-184-v4/v5 byte for byte.
   */
  readonly shape?: DebateShapeCeilingInput;
```

and change the members' type to `Exclude<keyof StructuralCeilingInput, "backupSequencesProvisioned" | "shape">[]`.

**(c) The check.** Right after the `STRUCTURAL_CEILING_DEPTH_ABOVE_SEALED_MAXIMUM` block, add:

```ts
  // Debate shape (spec 2026-10-12 §3.6): checked before any leg is counted, so an incoherent shape never mints a ceiling.
  if (input.shape !== undefined) assertDebateShapeCeilingInput(input.shape, input.panelSize);
  const shaped = input.shape === undefined ? null
    : Object.freeze({ shape: input.shape, counts: debateShapeSiteCounts(input.shape, input.depth) });
```

**(d) The legs.** Replace these four lines:

```ts
  const authorSites = materializedNodes;
  const crossExchangeAuthorSites = crossExchangeNodes;
  const panelSites = input.panelSize === 1 ? 0 : (input.panelSize - 1) * materializedNodes;
  const reviewerSites = input.panelSize === 1 ? 0 : input.reviewerCallsPerNode * materializedNodes;
```

with:

```ts
  // Debate shape (spec 2026-10-12 §3.6): the map's sites are author sites at the cooldown allowance; every node has its
  // graders, its close-call extras (counted on EVERY node, so the ceiling never under-counts) and its reviews; the P
  // cross-replies are the cross-exchange author sites (no runner-up), as today's M(M-1).
  const authorSites = shaped === null ? materializedNodes : shaped.counts.mapSites + shaped.counts.nodes;
  const crossExchangeAuthorSites = shaped === null ? crossExchangeNodes : shaped.counts.crossNodes;
  const panelSites = shaped !== null
    ? (shaped.shape.graders + shaped.shape.closeCallExtraGraders) * shaped.counts.nodes
    : input.panelSize === 1 ? 0 : (input.panelSize - 1) * materializedNodes;
  const reviewerSites = shaped !== null
    ? input.reviewerCallsPerNode * shaped.counts.nodes
    : input.panelSize === 1 ? 0 : input.reviewerCallsPerNode * materializedNodes;
```

**(e) The return.** In the returned object, replace the last two members

```ts
    formula_version: backupSequences === 1 ? "DR-184-v5" : "DR-184-v4",
    bounds_source_ref: "engine-exports+register"
```

with:

```ts
    formula_version: shaped !== null ? DEBATE_SHAPE_FORMULA_VERSION : backupSequences === 1 ? "DR-184-v5" : "DR-184-v4",
    bounds_source_ref: "engine-exports+register",
    // Debate shape: the run's frozen sizes, LAST and only when shaped, so a receipt minted without them keeps its bytes.
    ...(shaped === null ? {} : { shape: debateShapeReceipt(shaped.shape, shaped.counts, backupSequences) })
```

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/debate-shape-ceiling.test.ts`

If an enumerated figure differs, fix the implementation to match the enumeration. Never fix the enumeration to match the implementation.

- [ ] **Step 5: Today's ceiling tests stay green**

Run each separately, one at a time:

- `pnpm exec vitest run tests/unit/t17-envelope.test.ts`
- `pnpm exec vitest run tests/unit/s1-scorecard-merge-money.test.ts`
- `pnpm exec vitest run tests/unit/register-s09.test.ts`
- `pnpm exec vitest run tests/unit/dr181-ceiling.test.ts`
- `pnpm exec vitest run tests/unit/money-serve-reserve.test.ts`

Expected: PASS, unchanged.

- [ ] **Step 6: Shipped corpus and depth oracle**

Run: `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`

Then run: `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`

Expected: PASS. The manifest diff is the one line `packages/register/src/debate-shape-ceiling.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/register/src/debate-shape-ceiling.ts packages/register/src/index.ts tests/support/shipped-corpus.manifest.txt tests/unit/debate-shape-ceiling.test.ts
git commit -m "Register: the structural ceiling learns the debate shape (DR-185-shape-v1), a strict shape receipt, today's receipt byte for byte

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The strict receipt parser reads the shape

**Files:**
- Modify: `packages/budget/src/index.ts` (`costEnvelopeBasisSchema` ~149–260, `CostEnvelopeBasis` ~262–278, `parseCostEnvelopeBasis` ~289–330)
- Test: `tests/unit/debate-shape-receipt.test.ts` (create)

**Interfaces:**
- Consumes:
  - `DEBATE_SHAPE_FORMULA_VERSION`, `debateShapeReceiptSchema`, `debateShapeOfReceipt` and `debateShapeSiteCounts` (Task 3);
  - `DebateShapeCeilingInput` (Task 2).
- Produces: `CostEnvelopeBasis` gains `readonly shape?: DebateShapeCeilingInput`. It is present only for a shape receipt, and it is the sizes P2b's runner uses.

- [ ] **Step 1: Write the failing test** `tests/unit/debate-shape-receipt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { debateShapeSettingsOf } from "@debateai/contract";
import {
  DEBATE_SHAPE_PLAN_KEYS, computeStructuralCeilingBasis, debateShapePolicyStartValues, normaliseDepthParamsForShape,
  resolveDebateShape
} from "@debateai/register";

const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const POLICY = debateShapePolicyStartValues();
const SHAPE = resolveDebateShape({ policy: POLICY, plan: "pro", makers: 5,
  settings: { depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" } })!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wire = (value: unknown): any => JSON.parse(JSON.stringify(value));
const shaped = (backup: 0 | 1 = 0) => wire(computeStructuralCeilingBasis({ ...TERMS, panelSize: 5, depth: 3, backupSequencesProvisioned: backup, shape: SHAPE }));
const legacy = (backup: 0 | 1 = 0) => wire(computeStructuralCeilingBasis({ ...TERMS, panelSize: 5, depth: 3, backupSequencesProvisioned: backup }));
const refusalCode = (value: unknown): unknown => {
  try { parseCostEnvelopeBasis(value); return null; } catch (error) { return (error as { code?: unknown }).code; }
};

describe("the strict receipt parser reads a debate shape receipt (spec 2026-10-12 §3.6)", () => {
  it("parses a shape receipt and hands back the sizes the run was admitted with", () => {
    const parsed = parseCostEnvelopeBasis(shaped());
    expect(parsed.shape).toEqual(SHAPE);
    expect(parsed.maxModelAttempts).toBe(shaped().max_model_attempts);
    expect(parsed.serveReserveAttempts).toBe(18);
    expect(parseCostEnvelopeBasis(shaped(1)).shape).toEqual(SHAPE);
  });
  it("reads a v4 or v5 receipt exactly as before: no shape member on the result", () => {
    for (const backup of [0, 1] as const) {
      const parsed = parseCostEnvelopeBasis(legacy(backup));
      expect("shape" in parsed).toBe(false);
      expect(parsed.wire).toEqual(legacy(backup));
    }
  });
  it("parses every shape receipt admission can mint", () => {
    for (const plan of DEBATE_SHAPE_PLAN_KEYS) for (let makers = 2; makers <= 7; makers += 1) for (let depth = 1; depth <= 3; depth += 1) {
      for (const depthMode of ["adaptive", "fixed"] as const) {
        const depthParams = normaliseDepthParamsForShape({ depth, depthMode, scrutiny: "exhaustive" }, POLICY, plan);
        const shape = resolveDebateShape({ policy: POLICY, plan, makers, settings: debateShapeSettingsOf(depthParams) })!;
        const basis = wire(computeStructuralCeilingBasis({ ...TERMS, panelSize: makers, depth, shape }));
        expect(parseCostEnvelopeBasis(basis).shape).toEqual(shape);
      }
    }
  });
  it.each([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["a shape receipt under the v4 name", (b: any) => { b.formula_version = "DR-184-v4"; }],
    ["a v4 receipt carrying a shape member", (b: any) => { b.formula_version = "DR-184-v4"; b.call_sites = legacy().call_sites; b.max_model_attempts = legacy().max_model_attempts; }],
    ["an author leg that is not map sites plus nodes", (b: any) => { b.call_sites.author += 1; }],
    ["a node count the sizes do not give", (b: any) => { b.shape.nodes += 2; b.call_sites.author += 2; b.call_sites.panel += 8; b.call_sites.reviewer += 2; }],
    ["a panel leg that is not graders plus extras per node", (b: any) => { b.call_sites.panel -= 1; }],
    ["more answers than debaters", (b: any) => { b.panel_size = 3; }],
    ["an unknown key in the shape", (b: any) => { b.shape.extra = 1; }],
    ["a backup flag the per-site attempts do not show", (b: any) => { b.shape.backup_sequences = 1; }]
  ])("refuses %s", (_name, mutate) => {
    const basis = shaped();
    mutate(basis);
    expect(refusalCode(basis)).toBe("RUN_COST_ENVELOPE_UNRESOLVED");
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/debate-shape-receipt.test.ts`

Expected: FAIL. The strict schema refuses the unknown `shape` key, so a shape receipt does not parse.

- [ ] **Step 3: Implement** in `packages/budget/src/index.ts`.

**(a) Imports.** Extend the existing `@debateai/register` import (the one that brings `SERVE_LEG`) with `DEBATE_SHAPE_FORMULA_VERSION, debateShapeOfReceipt, debateShapeReceiptSchema, debateShapeSiteCounts, type DebateShapeCeilingInput`.

**(b) The schema.** In `costEnvelopeBasisSchema`, after `bounds_source_ref: z.string().trim().min(1)`, add:

```ts
  ,
  /** Debate shape (spec 2026-10-12 §3.6): the run's frozen sizes; present exactly on a DR-185-shape-v1 receipt. */
  shape: debateShapeReceiptSchema.optional()
```

The comma goes after the `bounds_source_ref` line; write it as part of that line.

**(c) The superRefine.** At the end of the existing `.superRefine((basis, ctx) => { … })` body, after the reserve block, add:

```ts
  /**
   * Debate shape (spec 2026-10-12 §3.6): a shape receipt and its formula name go together, and its legs are the ones
   * its own sizes give (`debateShapeSiteCounts`, the constructor's rule, READ here, never restated), so a receipt can
   * never bill a shape its own numbers do not support, nor carry sizes the debaters cannot fill.
   */
  const shape = basis.shape;
  if ((basis.formula_version === DEBATE_SHAPE_FORMULA_VERSION) !== (shape !== undefined)) {
    ctx.addIssue({ code: "custom", path: ["shape"], message: `formula ${basis.formula_version} and its shape member disagree` });
  }
  if (shape !== undefined) {
    const counts = debateShapeSiteCounts(debateShapeOfReceipt(shape), basis.depth);
    if (counts.mapSites !== shape.map_sites || counts.nodes !== shape.nodes || counts.crossNodes !== shape.cross_nodes) {
      ctx.addIssue({ code: "custom", path: ["shape", "nodes"],
        message: `shape sites ${shape.map_sites}/${shape.nodes}/${shape.cross_nodes} disagree with its sizes` });
    }
    if (basis.call_sites.author !== shape.map_sites + shape.nodes) {
      ctx.addIssue({ code: "custom", path: ["call_sites", "author"], message: `author sites ${basis.call_sites.author} are not map plus nodes` });
    }
    if (basis.call_sites.panel !== (shape.graders + shape.close_call_extra_graders) * shape.nodes) {
      ctx.addIssue({ code: "custom", path: ["call_sites", "panel"], message: `panel sites ${basis.call_sites.panel} are not graders per node` });
    }
    if (shape.answers > basis.panel_size || shape.map_ais > basis.panel_size
      || shape.graders + shape.close_call_extra_graders > basis.panel_size - 1) {
      ctx.addIssue({ code: "custom", path: ["shape", "answers"], message: `the shape's sizes exceed ${basis.panel_size} debaters` });
    }
    if ((basis.per_site_attempts.cross_exchange_site !== undefined) !== (shape.backup_sequences === 1)) {
      ctx.addIssue({ code: "custom", path: ["shape", "backup_sequences"], message: "the backup flag and the per-site attempts disagree" });
    }
  }
```

**(d) The result.** In `CostEnvelopeBasis`, after `readonly serveReserveAttempts: number;`, add:

```ts
  /** Debate shape: the sizes the run was admitted with (DR-185-shape-v1 only); absent on every other receipt. */
  readonly shape?: DebateShapeCeilingInput;
```

In `parseCostEnvelopeBasis`'s returned object, after `serveReserveAttempts: …,`, add:

```ts
    ...(parsed.data.shape === undefined ? {} : { shape: debateShapeOfReceipt(parsed.data.shape) }),
```

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/debate-shape-receipt.test.ts`

- [ ] **Step 5: Today's parser tests stay green**

Run each separately:

- `pnpm exec vitest run tests/unit/budget-s09.test.ts`
- `pnpm exec vitest run tests/unit/dr184-review-resilience.test.ts`
- `pnpm exec vitest run tests/unit/money-serve-reserve.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/budget/src/index.ts tests/unit/debate-shape-receipt.test.ts
git commit -m "Budget: the strict receipt parser reads the debate shape member and checks its legs against its own sizes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Per-role call shares and the answer writer's bound

**Files:**
- Modify: `apps/api/src/ask-model-picker.ts` (~395–460 `expectedCallsByRoleFromBasis`; new `answerTokenCeilingsForBasis` after `answerTokenCeilingsByRole` ~112)
- Test: `tests/unit/debate-shape-role-shares.test.ts` (create)

**Interfaces:**
- Consumes: a basis minted by Task 3.
- Produces:
```ts
export function expectedCallsByRoleFromBasis(basis: Readonly<Record<string, unknown>>): Readonly<Record<DebateRole, number>>; // shape-aware
export function answerTokenCeilingsForBasis(ceilings: Readonly<Record<DebateRole, number>>, basis: Readonly<Record<string, unknown>>): Readonly<Record<DebateRole, number>>;
```

- [ ] **Step 1: Write the failing test** `tests/unit/debate-shape-role-shares.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeStructuralCeilingBasis, debateShapePolicyStartValues, resolveDebateShape } from "@debateai/register";
import { answerTokenCeilingsForBasis, expectedCallsByRoleFromBasis } from "../../apps/api/src/ask-model-picker.js";

const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const POLICY = debateShapePolicyStartValues();
const FREE3 = resolveDebateShape({ policy: POLICY, plan: "free", makers: 3,
  settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "detailed" } })!;
const shaped = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, shape: FREE3 });
const legacy = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2 });

describe("per-role call shares under the debate shape (spec 2026-10-12 §3.6)", () => {
  it("map calls go to the debaters, P cross-replies, the rest are points; the split sums to every site", () => {
    const byRole = expectedCallsByRoleFromBasis(shaped);
    expect(byRole).toEqual({ POSITION: 13, SUPPORT_ATTACK: 15, CROSS_EXCHANGE: 3, JUDGE: 42, REVIEWER: 21, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 });
    expect(Object.values(byRole).reduce((sum, calls) => sum + calls, 0)).toBe(31 + 42 + 21 + 6);
  });
  it("today's basis splits exactly as before", () => {
    expect(expectedCallsByRoleFromBasis(legacy))
      .toEqual({ POSITION: 3, SUPPORT_ATTACK: 18, CROSS_EXCHANGE: 6, JUDGE: 54, REVIEWER: 27, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 });
  });
  it("a malformed shape member is an engine fault, never read as today's", () => {
    expect(() => expectedCallsByRoleFromBasis({ ...shaped, shape: { answers: "four" } })).toThrow("malformed debate shape");
  });
  it("the answer writer's bound is the larger of the sealed one and the run's answer length", () => {
    const ceilings = Object.freeze({ POSITION: 2048, SUPPORT_ATTACK: 2048, CROSS_EXCHANGE: 2048, JUDGE: 2048, REVIEWER: 2048,
      ANSWER_WRITER: 4096, ANSWER_CHECKER: 2048 });
    expect(answerTokenCeilingsForBasis(ceilings, legacy)).toBe(ceilings);
    expect(answerTokenCeilingsForBasis(ceilings, shaped)).toEqual({ ...ceilings, ANSWER_WRITER: 16384 });
    expect(answerTokenCeilingsForBasis({ ...ceilings, ANSWER_WRITER: 20_000 }, shaped).ANSWER_WRITER).toBe(20_000);
  });
});
```

The legacy figures for M3, d2 are: nodesPerRoot 7, author 21 + 6 = 27, POSITION 3, CROSS 6, SUPPORT 18, panel 2·27 = 54, reviewer 27.

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/debate-shape-role-shares.test.ts`

Expected: FAIL. `answerTokenCeilingsForBasis` is not exported, and the shaped split comes out wrong.

- [ ] **Step 3: Implement** in `apps/api/src/ask-model-picker.ts`.

**(a) The shared schema.** Add next to `admittedStructureSchema`:

```ts
/** Debate shape (spec 2026-10-12 §3.6): the receipt's own counts, when it has them. */
const admittedShapeSchema = z.object({
  answers: z.number().int().positive(),
  map_sites: z.number().int().positive(),
  cross_nodes: z.number().int().positive(),
  writer_bound: z.number().int().positive()
});

function admittedShapeOf(basis: Readonly<Record<string, unknown>>): z.infer<typeof admittedShapeSchema> | null {
  if (basis.shape === undefined) return null;
  const parsed = admittedShapeSchema.safeParse(basis.shape);
  if (!parsed.success) {
    throw new TypedDomainError(ASK_MODEL_ASSIGNMENT_INVALID, "The admitted structural basis carries a malformed debate shape");
  }
  return parsed.data;
}
```

**(b) The split.** In `expectedCallsByRoleFromBasis`, replace

```ts
  const crossExchange = panelSize >= 2 ? panelSize * (panelSize - 1) : 0;
  const supportAttack = sites.author - panelSize - crossExchange;
```

with:

```ts
  // Debate shape: the debaters also write the map (POSITION), and each of the P answers replies once to its rival.
  const shape = admittedShapeOf(basis);
  const positions = shape === null ? panelSize : shape.answers + shape.map_sites;
  const crossExchange = shape !== null ? shape.cross_nodes : panelSize >= 2 ? panelSize * (panelSize - 1) : 0;
  const supportAttack = sites.author - positions - crossExchange;
```

In the returned object, change `POSITION: panelSize,` to `POSITION: positions,`. Update the doc comment's mapping lines to say: "with a shape receipt: POSITION = answers + map sites, CROSS_EXCHANGE = cross_nodes".

**(c) The writer's bound.** Add after `answerTokenCeilingsByRole`:

```ts
/**
 * Debate shape (spec 2026-10-12 §3.3 step 8): the answer writer's call bound becomes max(sealed bound, the run's
 * answer length's writer bound), so the picker seats only writers whose window holds the longer answer. A receipt
 * without a shape keeps the sealed table (the same object).
 */
export function answerTokenCeilingsForBasis(
  ceilings: Readonly<Record<DebateRole, number>>,
  basis: Readonly<Record<string, unknown>>
): Readonly<Record<DebateRole, number>> {
  const shape = admittedShapeOf(basis);
  return shape === null ? ceilings : Object.freeze({ ...ceilings, ANSWER_WRITER: Math.max(ceilings.ANSWER_WRITER, shape.writer_bound) });
}
```

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/debate-shape-role-shares.test.ts`

Then run: `pnpm exec vitest run tests/unit/ask-model-picker.test.ts`

Expected: PASS. The A20 split table is unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ask-model-picker.ts tests/unit/debate-shape-role-shares.test.ts
git commit -m "API picker: per-role calls read the debate shape receipt; the answer writer's bound follows the run's answer length

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The preview estimate prices the answer writer at the run's answer length

**Files:**
- Modify: `apps/api/src/preview-budget-estimate.ts` (`PreviewCallOutputTokens` ~222, `PreviewCallType` ~239, `previewCallAverage` ~303, `sentOutputPricer` / `everyCallAt` / `realisticWorstCasePricer` ~327–368, `previewCallShares` ~547–650, `assertPreviewBudgetAdmits` ~904–960)
- Test: `tests/unit/debate-shape-preview-estimate.test.ts` (create)

**Interfaces:**
- Consumes: a basis minted by Task 3; `expectedCallsByRoleFromBasis` (Task 5).
- Produces:
```ts
export type PreviewCallOutputTokens = Readonly<{ debate: number; storyteller: number; storytellerRetry: number; storyChecker: number; answerWriter?: number }>;
export type PreviewCallType = "DEBATE" | "ANSWER_WRITER" | "STORYTELLER" | "STORYTELLER_RETRY" | "STORY_CHECKER" | "STORY_CHECKER_RETRY" | "PROBE" | "UNBILLED_RETRY";
export function previewShapeWriterBound(basis: Readonly<Record<string, unknown>>): number | null;
export function previewOutputTokensForBasis(output: PreviewCallOutputTokens, basis: Readonly<Record<string, unknown>>): PreviewCallOutputTokens;
```

- [ ] **Step 1: Write the failing test** `tests/unit/debate-shape-preview-estimate.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { previewModelRow } from "@debateai/providers";
import { computeStructuralCeilingBasis, debateShapePolicyStartValues, resolveDebateShape } from "@debateai/register";
import {
  PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, previewCallNanoUsd, previewCallShares, previewOutputTokensForBasis,
  previewShapeWriterBound, realisticWorstCasePricer, type PreviewCallOutputTokens
} from "../../apps/api/src/preview-budget-estimate.js";

const GLM = "zai-org/GLM-5.3-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const OUTPUT: PreviewCallOutputTokens = Object.freeze({ debate: 8192, storyteller: 32_768, storytellerRetry: 65_536, storyChecker: 8192 });
const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const SHAPE = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "free", makers: 2,
  settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "detailed" } })!;
const shaped = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1, shape: SHAPE });
const legacy = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1 });
const PANEL = Object.freeze([{ provider_ref: "preview:fixture-a", model_id: GLM }, { provider_ref: "preview:mimo", model_id: MIMO }]);
const ROLES = Object.freeze({ answerWriter: GLM, answerChecker: GLM, storyteller: GLM, storyChecker: GLM });
const sharesOf = (basis: Readonly<Record<string, unknown>>) => previewCallShares({ basis, panel: PANEL, roleModels: ROLES,
  roleProviderRefs: [], storyRounds: 0, maxCooldownHoldsPerRun: 2 });

describe("the preview prices the answer writer at the run's answer length (spec 2026-10-12 §3.3 step 8)", () => {
  it("an ANSWER_WRITER call is a debate call unless the run's writer bound is larger", () => {
    const row = previewModelRow(MIMO)!;
    expect(realisticWorstCasePricer(OUTPUT)(row, "ANSWER_WRITER")).toBe(realisticWorstCasePricer(OUTPUT)(row, "DEBATE"));
    expect(realisticWorstCasePricer({ ...OUTPUT, answerWriter: 16_384 })(row, "ANSWER_WRITER"))
      .toBe(previewCallNanoUsd(row, PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, 16_384));
  });
  it("reads the writer bound from a shape receipt only", () => {
    expect(previewShapeWriterBound(legacy)).toBeNull();
    expect(previewShapeWriterBound(shaped)).toBe(16_384);
    expect(previewOutputTokensForBasis(OUTPUT, legacy)).toBe(OUTPUT);
    expect(previewOutputTokensForBasis(OUTPUT, shaped)).toEqual({ ...OUTPUT, answerWriter: 16_384 });
  });
  it("today's debate keeps today's shares; a shaped one puts the writer's sites on ANSWER_WRITER", () => {
    expect(sharesOf(legacy).shares.some((share) => share.type === "ANSWER_WRITER")).toBe(false);
    const writer = sharesOf(shaped).shares.filter((share) => share.type === "ANSWER_WRITER");
    // 3 writer sites x 44 debate calls (one per site: author 18 + panel 10 + reviewer 10 + serve 6) x 2 members.
    expect(writer).toEqual([{ model: GLM, type: "ANSWER_WRITER", numerator: 264n }]);
    expect(sharesOf(shaped).denominator).toBe(88n);
  });
  it("admission prices a new and an unfinished debate with that run's own writer bound", async () => {
    const source = await readFile("apps/api/src/preview-budget-estimate.ts", "utf8");
    expect(source).toContain("previewOutputTokensForBasis(gate!.callOutputTokens, basis)");
    expect(source).toContain("pricerFor(input.storyTier, input.basis)");
    expect(source).toContain("pricerFor(run.storyTier, run.basis)");
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/debate-shape-preview-estimate.test.ts`

Expected: FAIL. `previewOutputTokensForBasis` is not exported.

- [ ] **Step 3: Implement** in `apps/api/src/preview-budget-estimate.ts`.

**(a) The output tokens.** Change the type to:

```ts
export type PreviewCallOutputTokens = Readonly<{
  debate: number; storyteller: number; storytellerRetry: number; storyChecker: number;
  /** Debate shape (spec 2026-10-12 §3.3 step 8): the answer writer's max_tokens when its run's answer length raises it. */
  answerWriter?: number;
}>;
```

**(b) The call type.** Change it to `"DEBATE" | "ANSWER_WRITER" | "STORYTELLER" | "STORYTELLER_RETRY" | "STORY_CHECKER" | "STORY_CHECKER_RETRY" | "PROBE" | "UNBILLED_RETRY"`.

**(c) The measured average.** In `previewCallAverage`, change the bucket line to:

```ts
  const bucket: PreviewMeasuredBucket | null = type === "DEBATE" || type === "ANSWER_WRITER" ? "DEBATE" : type === "PROBE" ? null : "STORY";
```

**(d) The pricers.** In `sentOutputPricer`'s `sent` record, add `ANSWER_WRITER: output.answerWriter ?? output.debate,`. In `everyCallAt`, add `ANSWER_WRITER: tokens,`. In `realisticWorstCasePricer`'s input record, add `ANSWER_WRITER: PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL,`. The record types are `Record<Exclude<PreviewBilledCallType, "PROBE">, …>`, so the compiler now requires these keys.

**(e) The two new helpers.** Add them next to `previewCallOutputTokens`:

```ts
/** Debate shape: the run's answer-writer bound from its receipt (`shape.writer_bound`), or null for today's receipt. */
export function previewShapeWriterBound(basis: Readonly<Record<string, unknown>>): number | null {
  const shape = basis.shape;
  if (shape === undefined) return null;
  const bound = (shape as { writer_bound?: unknown } | null)?.writer_bound;
  if (!positiveInteger(bound)) throw new TypeError("PREVIEW_SHAPE_WRITER_BOUND_INVALID");
  return bound;
}

/** The output tokens one debate is priced at: the gate's, with the answer writer raised to the run's own bound. */
export function previewOutputTokensForBasis(output: PreviewCallOutputTokens, basis: Readonly<Record<string, unknown>>): PreviewCallOutputTokens {
  const writer = previewShapeWriterBound(basis);
  return writer === null ? output : Object.freeze({ ...output, answerWriter: Math.max(output.debate, writer) });
}
```

**(f) The shares.** In `previewCallShares`:

- Replace `addDebate` with:

  ```ts
    const addDebate = (model: string, numerator: bigint, type: PreviewCallType = "DEBATE"): void => {
      add(model, type, numerator);
      add(model, "UNBILLED_RETRY", numerator);
    };
    // Debate shape: the writer's sites are priced at the run's writer bound; today's receipt keeps them as DEBATE.
    const writerType: PreviewCallType = previewShapeWriterBound(input.basis) === null ? "DEBATE" : "ANSWER_WRITER";
  ```

- In the rotated branch, write `addDebate(model, BigInt(sites.answerWriter) * debate * members, writerType);`.
- In the else branch, write `addDebate(input.roleModels.answerWriter, BigInt(sites.answerWriter) * debate * members, writerType);`.
- Leave the checker's lines as they are.

**(g) Admission.** In `assertPreviewBudgetAdmits`, replace the `pricerFor` lambda and its two uses:

```ts
    const pricerFor = (storyTier: PreviewStoryTier | undefined, basis: Readonly<Record<string, unknown>>) =>
      previewEstimatePricer({ measured, callOutputTokens: previewOutputTokensForBasis(gate!.callOutputTokens, basis),
        storyTier: storyTier ?? PREVIEW_STORY_TIER_FALLBACK });
```

The two uses become `pricer: pricerFor(input.storyTier, input.basis)` and `estimateUnfinishedRunHolds(run, gate!, pricerFor(run.storyTier, run.basis), debateCallCount)`.

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/debate-shape-preview-estimate.test.ts`

Then run: `pnpm exec vitest run tests/unit/preview-budget-estimate.test.ts`

Expected: PASS, with every room table unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/preview-budget-estimate.ts tests/unit/debate-shape-preview-estimate.test.ts
git commit -m "Preview estimate: the answer writer's calls priced at the run's answer-length bound, today's debates unchanged

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The history estimate class, the estimate SQL and the waiting-line read

**Files:**
- Modify: `packages/budget/src/estimate.ts` (`RunSettingsClass`, `settingsClassKey`, `PostgresRecentRunUsageSource` SQL, new `waitingShapeClassOf`)
- Modify: `packages/db/src/run-wait.ts` (`WaitingRun`, `WaitingRow`, `WAITING_COLUMNS`, `waitingRun`, `oldestWaiting`, `readWaiting`)
- Create: `apps/api/src/debate-shape-ask.ts` (the `runShapeClassOf` part)
- Modify: `apps/api/src/ask-room.ts` (`runSettingsClassOfAsk`, `settingsClassOfWaitingRun`), `apps/api/src/ask-billing.ts` (`coarseFitFor`)
- Modify: `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/debate-shape-estimate-class.test.ts` (create); add cases to `tests/integration/b2-recent-runs-estimator.test.ts` and `tests/integration/b3-holds-waiting-line.test.ts`

**Interfaces:**
- Consumes: `DebateShapePlanKey`, `DEBATE_SHAPE_PLAN_KEYS` and `debateShapePlanKeyOf` (Task 2); the contract enums and `debateShapeSettingsOf` (Task 1).
- Produces:
```ts
// @debateai/budget
export type RunShapeClass = Readonly<{ plan: DebateShapePlanKey; depthMode: DepthMode; scrutiny: Scrutiny; answerLength: AnswerLength }>;
export type RunSettingsClass = Readonly<{ planTier; compositionBudgetTier; makerCount; depth; shape?: RunShapeClass }>;
export function waitingShapeClassOf(raw: unknown, fallbackPlan: DebateShapePlanKey): RunShapeClass | null;
// @debateai/db
export type WaitingRun = Readonly<{ /* … today's fields … */ shapeSettings?: Readonly<Record<string, unknown>> }>;
// apps/api/src/debate-shape-ask.ts
export function runShapeClassOf(depthParams: DepthParams, plan: DebateShapePlanKey): RunShapeClass | null;
// apps/api/src/ask-room.ts
export function runSettingsClassOfAsk(ask, previewConfig?: PreviewProviderTestConfig, shapePlan?: DebateShapePlanKey): RunSettingsClass;
// apps/api/src/ask-billing.ts
export async function coarseFitFor(ask, ownerRef, billing, now, previewConfig?, shapePlan?: DebateShapePlanKey): Promise<CoarseFit>;
```

- [ ] **Step 1: Write the failing unit test** `tests/unit/debate-shape-estimate-class.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RecentRunsCostEstimator, settingsClassKey, waitingShapeClassOf, type RunSettingsClass } from "@debateai/budget";
import type { AskRequest } from "@debateai/contract";
import type { WaitingRun } from "@debateai/db";
import { runSettingsClassOfAsk, settingsClassOfWaitingRun } from "../../apps/api/src/ask-room.js";

const BASE: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "low", makerCount: 2, depth: 1 });
const PRO = Object.freeze({ plan: "pro", depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" } as const);
const waiting = (extra: Partial<WaitingRun> = {}): WaitingRun => Object.freeze({
  runId: "00000000-0000-4000-8000-000000000001", waitingSince: new Date(0), ownerRef: null, legacyAskerId: "legacy:a",
  planTier: "premium", compositionBudgetTier: "low", depth: 2, makerCount: 5, waitsFor: null, personRecheckAt: null, reasonAt: null, ...extra });
const ask = (depthParams: AskRequest["depth_params"]): Pick<AskRequest, "plan_tier" | "composition_budget_tier" | "depth_params"> =>
  Object.freeze({ plan_tier: "premium", composition_budget_tier: "low", depth_params: depthParams });

describe("the history estimate's class learns the debate shape (spec 2026-10-12 §3.6)", () => {
  it("today's class key is unchanged; a shaped class keys its plan and settings", () => {
    expect(settingsClassKey(BASE)).toBe("free|low|2|1");
    expect(settingsClassKey({ ...BASE, planTier: "premium", makerCount: 5, depth: 2, shape: PRO })).toBe("premium|low|5|2|pro|fixed|deep|detailed");
    expect(() => settingsClassKey({ ...BASE, shape: { ...PRO, scrutiny: "max" as never } })).toThrow("COST_ESTIMATE_SETTINGS_INVALID");
  });
  it("estimates two shapes of one depth apart (separate samples, separate cache entries)", async () => {
    const asked: RunSettingsClass[] = [];
    const estimator = new RecentRunsCostEstimator({
      source: { readRecentRunUsage: async ({ settings }) => { asked.push(settings); return []; } },
      prices: new Map([["p", { inputMicrosPerMillionTokens: 1, outputMicrosPerMillionTokens: 1 }]]),
      maximumMicros: 500, clock: () => new Date(0)
    });
    await estimator.estimateMicros(BASE);
    await estimator.estimateMicros({ ...BASE, shape: { ...PRO, plan: "free", depthMode: "adaptive", scrutiny: "standard" } });
    expect(asked).toHaveLength(2);
    expect("shape" in asked[0]!).toBe(false);
  });
  it("a waiting run's stored shape is read the careful way and never throws", () => {
    expect(waitingShapeClassOf(null, "premium")).toBeNull();
    expect(waitingShapeClassOf(undefined, "premium")).toBeNull();
    expect(waitingShapeClassOf({ depthMode: "fixed", scrutiny: "deep", answerLength: "detailed", plan: "pro" }, "premium")).toEqual(PRO);
    expect(waitingShapeClassOf({ depthMode: "adaptive", scrutiny: "standard", answerLength: "short", plan: null }, "free"))
      .toEqual({ plan: "free", depthMode: "adaptive", scrutiny: "standard", answerLength: "short" });
    expect(waitingShapeClassOf({ depthMode: "sideways", scrutiny: 7, answerLength: null, plan: "gold" }, "free"))
      .toEqual({ plan: "max", depthMode: "fixed", scrutiny: "exhaustive", answerLength: "detailed" });
    for (const odd of ["text", 3, [], true]) expect(() => waitingShapeClassOf(odd, "free")).not.toThrow();
  });
  it("the ask's class carries the shape only for a shaped ask; a waiting run's only when it has one", () => {
    expect(runSettingsClassOfAsk(ask({ depth: 2 }))).not.toHaveProperty("shape");
    expect(runSettingsClassOfAsk(ask({ depth: 2, depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" }), undefined, "pro").shape).toEqual(PRO);
    expect(runSettingsClassOfAsk(ask({ depth: 2, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" })).shape?.plan).toBe("premium");
    expect(settingsClassOfWaitingRun(waiting())).toEqual({ planTier: "premium", compositionBudgetTier: "low", makerCount: 5, depth: 2 });
    expect(settingsClassOfWaitingRun(waiting({ shapeSettings: { depthMode: "fixed", scrutiny: "deep", answerLength: "detailed", plan: "pro" } })).shape).toEqual(PRO);
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/debate-shape-estimate-class.test.ts`

Expected: FAIL. `waitingShapeClassOf` is not exported.

- [ ] **Step 3: Implement the class and the estimate SQL** in `packages/budget/src/estimate.ts`.

**(a) The class.** Add the imports:

```ts
import { AnswerLengthSchema, DepthModeSchema, ScrutinySchema, type AnswerLength, type DepthMode, type Scrutiny } from "@debateai/contract";
import { DEBATE_SHAPE_PLAN_KEYS, type DebateShapePlanKey } from "@debateai/register";
```

Add the type:

```ts
/**
 * Debate shape (spec 2026-10-12 §3.6): what a shaped run's cost depends on beyond today's class — its plan's sizes and
 * its three settings. A run asked without the register's row has none, and is sampled only among runs that had none.
 */
export type RunShapeClass = Readonly<{ plan: DebateShapePlanKey; depthMode: DepthMode; scrutiny: Scrutiny; answerLength: AnswerLength }>;
```

In `RunSettingsClass`, after `depth: number;`, add `/** Debate shape: present only for a shaped run (see RunShapeClass). */ shape?: RunShapeClass;`.

**(b) The class key.** Replace the body of `settingsClassKey` after its first `if (…) throw` block with:

```ts
  const base = `${settings.planTier}|${settings.compositionBudgetTier}|${settings.makerCount}|${settings.depth}`;
  const shape = settings.shape;
  if (shape === undefined) return base;
  if (!(DEBATE_SHAPE_PLAN_KEYS as readonly string[]).includes(shape?.plan) || !DepthModeSchema.safeParse(shape.depthMode).success
    || !ScrutinySchema.safeParse(shape.scrutiny).success || !AnswerLengthSchema.safeParse(shape.answerLength).success) {
    throw new TypeError("COST_ESTIMATE_SETTINGS_INVALID");
  }
  return `${base}|${shape.plan}|${shape.depthMode}|${shape.scrutiny}|${shape.answerLength}`;
```

**(c) The careful reader.** Add after `settingsClassKey`:

```ts
/**
 * A waiting run's stored shape settings, read the CAREFUL way (contract deviation 8): a value this code does not know
 * reads as the dearest one, so one odd row can never stop the whole waiting line (the reason migration 0085's trigger
 * exists for the depth cast); the dearest class has few samples, so it is estimated at the run's maximum. No settings
 * (a run asked without the row) is null. A shaped run with no plan on its receipt (one maker) takes `fallbackPlan`.
 */
export function waitingShapeClassOf(raw: unknown, fallbackPlan: DebateShapePlanKey): RunShapeClass | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const known = <T extends string>(options: readonly T[], found: unknown, dearest: T): T =>
    (options as readonly unknown[]).includes(found) ? found as T : dearest;
  return Object.freeze({
    plan: value.plan === null || value.plan === undefined ? fallbackPlan : known(DEBATE_SHAPE_PLAN_KEYS, value.plan, "max"),
    depthMode: known(DepthModeSchema.options, value.depthMode, "fixed"),
    scrutiny: known(ScrutinySchema.options, value.scrutiny, "exhaustive"),
    answerLength: known(AnswerLengthSchema.options, value.answerLength, "detailed")
  });
}
```

**(d) The estimate SQL.** In `PostgresRecentRunUsageSource.readRecentRunUsage`, after the line `AND jsonb_array_length(run.discovered_panel) = $4` in the SQL, add:

```sql
           AND COALESCE(run.depth_params->>'depthMode', '') = $7
           AND COALESCE(run.depth_params->>'scrutiny', '') = $8
           AND COALESCE(run.depth_params->>'answerLength', '') = $9
           AND (run.envelope_basis->'shape' IS NULL OR run.envelope_basis->'shape'->>'plan' = $10)
```

Append to the parameter array, after `input.limit`:

```ts
        input.settings.shape?.depthMode ?? "",
        input.settings.shape?.scrutiny ?? "",
        input.settings.shape?.answerLength ?? "",
        input.settings.shape?.plan ?? ""
```

A class without a shape matches only runs stored without the keys, which is every run today, so its sample is today's. A shaped class matches only runs with the same settings and the same plan (or a shaped one-maker run, which has no receipt plan).

**(e) Exports.** Export `RunShapeClass` and `waitingShapeClassOf` from `packages/budget/src/index.ts` next to the existing `estimate.js` exports (same `export { … } from "./estimate.js"` block).

- [ ] **Step 4: Implement the waiting-line read** in `packages/db/src/run-wait.ts`:

- In `WaitingRun`, after `reasonAt: Date | null;`, add:

  ```ts
    /**
     * Debate shape (spec 2026-10-12 §3.6): the run's stored shape settings and receipt plan, raw — present only for a
     * run asked under the register's debateShapePolicy row. Read carefully by the estimate (`waitingShapeClassOf`).
     */
    shapeSettings?: Readonly<Record<string, unknown>>;
  ```

- In `WaitingRow`, add `shape_settings: Record<string, unknown> | null;`.
- Replace `WAITING_COLUMNS` with:

  ```ts
  const WAITING_COLUMNS = `run_id, waiting_since, owner_ref::text AS owner_ref, legacy_asker_id,
    plan_tier, composition_budget_tier, depth, maker_count, waits_for, person_recheck_at, reason_at,
    (SELECT CASE WHEN shape_run.depth_params ? 'depthMode' THEN jsonb_build_object(
        'depthMode', shape_run.depth_params->'depthMode', 'scrutiny', shape_run.depth_params->'scrutiny',
        'answerLength', shape_run.depth_params->'answerLength', 'plan', shape_run.envelope_basis->'shape'->'plan') END
     FROM core.run AS shape_run WHERE shape_run.run_id = line.run_id) AS shape_settings`;
  ```

- In `waitingRun(row)`, add as the last member: `...(row.shape_settings === null ? {} : { shapeSettings: Object.freeze({ ...row.shape_settings }) })`.
- In `oldestWaiting` and `readWaiting`, change `FROM core.run_waiting_v` to `FROM core.run_waiting_v AS line`. `wakeCandidates` already aliases it `line`.

- [ ] **Step 5: Implement the API class functions.**

Create `apps/api/src/debate-shape-ask.ts`:

```ts
import { debateShapeSettingsOf, type DepthParams } from "@debateai/contract";
import type { RunShapeClass } from "@debateai/budget";
import type { DebateShapePlanKey } from "@debateai/register";

/**
 * Debate shape (spec 2026-10-12 §3.6): an ask's or run's shape class for the history estimate. Present exactly when
 * its depth_params carries the settings, which the API writes only while the register's row is in force (Task 8).
 */
export function runShapeClassOf(depthParams: DepthParams, plan: DebateShapePlanKey): RunShapeClass | null {
  if (depthParams.depthMode === undefined) return null;
  return Object.freeze({ plan, ...debateShapeSettingsOf(depthParams) });
}
```

In `apps/api/src/ask-room.ts`:

- Add the imports `import { debateShapePlanKeyOf, type DebateShapePlanKey } from "@debateai/register";` (merge into the existing register import), `import { waitingShapeClassOf } from "@debateai/budget";` (merge into the existing budget import) and `import { runShapeClassOf } from "./debate-shape-ask.js";`.
- Change the two functions to:

  ```ts
  export function runSettingsClassOfAsk(
    ask: Pick<AskRequest, "plan_tier" | "composition_budget_tier" | "depth_params">,
    previewConfig?: PreviewProviderTestConfig,
    shapePlan?: DebateShapePlanKey
  ): RunSettingsClass {
    const shape = runShapeClassOf(ask.depth_params, shapePlan ?? debateShapePlanKeyOf(null, ask.plan_tier));
    return Object.freeze({
      planTier: ask.plan_tier,
      compositionBudgetTier: ask.composition_budget_tier,
      makerCount: previewPlanTierRosters(validatePreviewProviderTestConfig(previewConfig),PLAN_TIER_ROSTERS)[ask.plan_tier].length,
      depth: ask.depth_params.depth,
      ...(shape === null ? {} : { shape })
    });
  }

  /** A waiting run's class, from the columns it was asked with; a run with no plan tier is estimated as premium, the careful side. */
  export function settingsClassOfWaitingRun(run: WaitingRun): RunSettingsClass {
    const planTier = run.planTier ?? "premium";
    const shape = waitingShapeClassOf(run.shapeSettings ?? null, debateShapePlanKeyOf(null, planTier));
    return Object.freeze({
      planTier,
      compositionBudgetTier: run.compositionBudgetTier,
      makerCount: run.makerCount,
      depth: run.depth,
      ...(shape === null ? {} : { shape })
    });
  }
  ```

In `apps/api/src/ask-billing.ts`'s `coarseFitFor`:

- Add the parameter `shapePlan?: DebateShapePlanKey` after `previewConfig?` (import the type from `@debateai/register` and `runShapeClassOf` from `./debate-shape-ask.js`).
- In the `estimateMicros({...})` argument, after `depth: ask.depth_params.depth`, add:

  ```ts
        ...((shape) => shape === null ? {} : { shape })(runShapeClassOf(ask.depth_params, shapePlan ?? "premium"))
  ```

- [ ] **Step 6: Run the unit test and expect PASS**

Run: `pnpm exec vitest run tests/unit/debate-shape-estimate-class.test.ts`

Then run, one at a time: `pnpm exec vitest run tests/unit/b2-cost-estimator.test.ts`

Expected: PASS.

- [ ] **Step 7: Add the integration cases.**

In `tests/integration/b2-recent-runs-estimator.test.ts`:

- Extend `RunShape` with `depthParams?: Readonly<Record<string, unknown>>; envelopeBasis?: Readonly<Record<string, unknown>>;`.
- In `run()`, use `depthParams: shape.depthParams ?? { depth: shape.depth ?? 1 }` and `envelopeBasis: shape.envelopeBasis ?? fixtureStructuralCeiling(4)`.
- Add to the describe block:

```ts
  it("debate shape: shaped runs and today's runs of one depth are sampled apart, and a shaped class by its plan", async () => {
    const now = new Date();
    const shapedParams = { depth: 1, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" };
    const receipt = (plan: string) => ({ ...fixtureStructuralCeiling(4), shape: { plan } });
    const today = await run({ compositionBudgetTier: "medium", makers: 3 });
    const pro = await run({ compositionBudgetTier: "medium", makers: 3, depthParams: shapedParams, envelopeBasis: receipt("pro") });
    const max = await run({ compositionBudgetTier: "medium", makers: 3, depthParams: shapedParams, envelopeBasis: receipt("max") });
    for (const runId of [today, pro, max]) {
      await job(runId, "DONE");
      await spend({ runId, recordedAt: new Date(now.getTime() - HOUR) });
    }
    const read = (settings: RunSettingsClass) => new PostgresRecentRunUsageSource(database.pool).readRecentRunUsage({
      settings, since: new Date(now.getTime() - 24 * HOUR), limit: 20
    }).then((samples) => samples.map((sample) => sample.runId));
    const base: RunSettingsClass = { planTier: "free", compositionBudgetTier: "medium", makerCount: 3, depth: 1 };
    await expect(read(base)).resolves.toEqual([today]);
    await expect(read({ ...base, shape: { plan: "pro", depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } }))
      .resolves.toEqual([pro]);
    await expect(read({ ...base, shape: { plan: "pro", depthMode: "fixed", scrutiny: "standard", answerLength: "standard" } }))
      .resolves.toEqual([]);
  });
```

In `tests/integration/b3-holds-waiting-line.test.ts`, add to the `"B3 the waiting line"` describe:

```ts
  it("debate shape: a waiting run's stored settings and receipt plan come with it; today's run has none", async () => {
    const waits = new RunWaitRepository(database.pool);
    const shaped = await new RunRepository(database.pool).startRun({
      questionLine: "Does a waiting run keep its shape settings?",
      principal: { kind: "legacy", legacyAskerId: `shape:${randomUUID()}` },
      sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(), askerRiskTier: "casual", effectiveRiskTier: "casual",
      tierSource: "ASKER", tierProvenanceRef: "asker:test", compositionBudgetTier: "low", planTier: "premium",
      depthParams: { depth: 2, depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" },
      discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
      envelopeBasis: { ...fixtureStructuralCeiling(4), shape: { plan: "pro" } },
      registerVersion: 1, batteryVersion: "test", askContract: {}, batteryRows: []
    });
    const today = await legacyRun();
    await inTransaction(async (client) => {
      await waits.enterWait(client, shaped, new Date("2031-02-01T10:00:00.000Z"));
      await waits.enterWait(client, today, new Date("2031-02-01T10:00:01.000Z"));
    });
    expect((await waits.readWaiting(shaped))?.shapeSettings)
      .toEqual({ depthMode: "fixed", scrutiny: "deep", answerLength: "detailed", plan: "pro" });
    expect(await waits.readWaiting(today)).not.toHaveProperty("shapeSettings");
    const line = await waits.oldestWaiting(1_000);
    expect(line.find((run) => run.runId === shaped)?.shapeSettings).toMatchObject({ plan: "pro" });
  });
```

- [ ] **Step 8: Run the two integration files, one at a time**

Run: `pnpm exec vitest run tests/integration/b2-recent-runs-estimator.test.ts`. When it finishes, run `pnpm exec vitest run tests/integration/b3-holds-waiting-line.test.ts`.

Expected: PASS, and the existing exact `readWaiting` `toEqual` case is unchanged.

- [ ] **Step 9: Shipped corpus and depth oracle** (new file `apps/api/src/debate-shape-ask.ts`)

Run: `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`

Then run: `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/budget/src/estimate.ts packages/budget/src/index.ts packages/db/src/run-wait.ts apps/api/src/debate-shape-ask.ts apps/api/src/ask-room.ts apps/api/src/ask-billing.ts tests/support/shipped-corpus.manifest.txt tests/unit/debate-shape-estimate-class.test.ts tests/integration/b2-recent-runs-estimator.test.ts tests/integration/b3-holds-waiting-line.test.ts
git commit -m "Money: the history estimate's class, its SQL and the waiting-line read learn the debate shape; odd waiting rows read as the dearest class

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The API: plan normalisation, admission with the shape, the room read, the boot

**Files:**
- Modify: `apps/api/src/debate-shape-ask.ts` (add `normaliseAskForDebateShape`, `debateShapeForPanel`, `roomDepthParams`)
- Modify: `apps/api/src/ask-billing.ts` (`decideSettingsForPlan` ~74–89, `normaliseAskForPlan` ~97–122)
- Modify: `apps/api/src/index.ts`:
  - `ApiOptions` ~1622, `RunCreationSettings` ~3940–3985;
  - the room route ~3429–3460;
  - `admitWithScorecard` ~4063–4230, `evaluateAskAdmission` ~4299–4410, `evaluationOrRefusal` ~4471;
  - `submit` ~4573–4650, `#submitWithRoom` ~4855–4910.
- Modify: `apps/api/src/main.ts` (~945, ~962–985, ~1452), `tools/preview-practice/practice-ask-composition.ts` (~131–157)
- Test: `tests/unit/debate-shape-admission.test.ts` (create)

**Interfaces:**
- Consumes:
  - from Tasks 2 and 3: `normaliseDepthParamsForShape`, `resolveDebateShape`, `debateShapePlanKeyOf`, `structuralBasisProvisionsBackup`, `readDebateShapePolicy`, `DebateShapePolicy`, `DebateShapePlanKey` and `DebateShapeCeilingInput`;
  - from Task 5: `answerTokenCeilingsForBasis`;
  - from Task 7: `runSettingsClassOfAsk(…, shapePlan)` and `coarseFitFor(…, shapePlan)`.
- Produces:
```ts
// apps/api/src/debate-shape-ask.ts
export function normaliseAskForDebateShape<T extends Pick<AskRequest, "depth_params">>(ask: T, policy: DebateShapePolicy | null, plan: DebateShapePlanKey): T;
export function debateShapeForPanel(policy: DebateShapePolicy | undefined, depthParams: DepthParams, plan: DebateShapePlanKey, makers: number): DebateShapeCeilingInput | null;
export function roomDepthParams(query: Readonly<{ depth: number; depth_mode?: DepthMode; scrutiny?: Scrutiny; answer_length?: AnswerLength }>): DepthParams;
// apps/api/src/index.ts
RunCreationSettings.debateShapePolicy?: DebateShapePolicy;
RunCreationSettings.resolveEnvelopeBasis(input: { …today's…; readonly shape: DebateShapeCeilingInput | null }): Promise<Readonly<Record<string, unknown>>>;
ApiOptions.debateShapePolicy?: DebateShapePolicy;
export async function evaluateAskAdmission(settings, ask, personRoom?, previewAdmissionLock?, shapePlanKey?: DebateShapePlanKey | null): Promise<AskAdmission>;
```

- [ ] **Step 1: Write the failing test** `tests/unit/debate-shape-admission.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluateAskAdmission, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import type { DiscoveredPanelMember } from "@debateai/db";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, computeStructuralCeilingBasis, debateShapePolicyStartValues, planById
} from "@debateai/register";
import { decideSettingsForPlan, normaliseAskForPlan } from "../../apps/api/src/ask-billing.js";
import { normaliseAskForDebateShape, roomDepthParams } from "../../apps/api/src/debate-shape-ask.js";

const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
const member = (providerRef: string, maker: string, modelId: string): DiscoveredPanelMember => Object.freeze({
  provider_ref: providerRef, maker, model_id: modelId, probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-10-12T00:00:00.000Z" });
/** The free plan's two local roster models (PLAN_TIER_ROSTERS.free), two makers. */
const PANEL = Object.freeze([member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:claude-cli", "Anthropic", "claude-sonnet-5")]);
const POLICY = debateShapePolicyStartValues();
const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
const ASK: AskRequest = { question_line: "Should cities price congestion?", risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "shape admission test",
  as_of: "2026-10-12T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [] };

function settings(input: Readonly<{ policy?: boolean; panel?: readonly DiscoveredPanelMember[]; seen?: unknown[] }>): RunCreationSettings {
  return {
    strangerSampleRate: 0, registerVersion: 1, batteryVersion: "battery:shape", settlementWatchHandle: "watch:shape",
    resolveDiscoveredPanel: async () => input.panel ?? PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, shape }) => {
      input.seen?.push(shape);
      return computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned,
        ...(shape === null ? {} : { shape }) });
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef }),
    ...(input.policy === true ? { debateShapePolicy: POLICY } : {})
  };
}

describe("admission with the debate shape (spec 2026-10-12 §3.1, §3.6)", () => {
  it("no row: today's basis, no shape asked of the composition", async () => {
    const seen: unknown[] = [];
    const admitted = await evaluateAskAdmission(settings({ seen }), ASK);
    expect(seen).toEqual([null]);
    expect(admitted.envelopeBasis.formula_version).toBe("DR-184-v4");
    expect("shape" in admitted.envelopeBasis).toBe(false);
  });
  it("with the row: the sizes capped by the two makers, under the plan key it was handed", async () => {
    const shaped = normaliseAskForDebateShape(ASK, POLICY, "free");
    const admitted = await evaluateAskAdmission(settings({ policy: true }), shaped);
    expect(admitted.envelopeBasis.formula_version).toBe("DR-185-shape-v1");
    expect(admitted.envelopeBasis.max_model_attempts).toBe(160);
    expect(admitted.envelopeBasis.shape).toMatchObject({ plan: "free", answers: 2, graders: 1, close_call_extra_graders: 0, map_ais: 2 });
    const plus = await evaluateAskAdmission(settings({ policy: true }), normaliseAskForDebateShape(ASK, POLICY, "plus"), null, undefined, "plus");
    expect(plus.envelopeBasis.shape).toMatchObject({ plan: "plus" });
  });
  it("a one-maker panel keeps today's shape even with the row", async () => {
    const oneMaker = [member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:claude-cli", "OpenAI", "claude-sonnet-5")];
    const admitted = await evaluateAskAdmission(settings({ policy: true, panel: oneMaker }), normaliseAskForDebateShape(ASK, POLICY, "free"));
    expect(admitted.envelopeBasis.formula_version).toBe("DR-184-v4");
  });
  it("an ask that was never normalised for its plan is an engine fault, never admitted", async () => {
    const unnormalised = { ...ASK, depth_params: { depth: 1, depthMode: "fixed" as const, scrutiny: "standard" as const, answerLength: "standard" as const } };
    await expect(evaluateAskAdmission(settings({ policy: true }), unnormalised)).rejects.toThrow("DEBATE_SHAPE_SETTINGS_NOT_NORMALISED:depthMode");
  });
});

describe("plan normalisation keeps the shape settings (spec §3.2)", () => {
  it("Free keeps the asked answer length; a depth-only ask stays {\"depth\":2}", () => {
    const free = planById(plans, "FREE");
    const asked = { ...ASK, plan_tier: "premium" as const, depth_params: { depth: 3, depthMode: "fixed" as const, answerLength: "detailed" as const } };
    const decided = normaliseAskForPlan(asked, free).ask;
    expect(decided.depth_params).toEqual({ depth: 2, depthMode: "fixed", answerLength: "detailed" });
    expect(normaliseAskForDebateShape(decided, POLICY, "free").depth_params)
      .toEqual({ depth: 2, depthMode: "adaptive", scrutiny: "standard", answerLength: "detailed" });
    expect(JSON.stringify(normaliseAskForPlan({ ...ASK, depth_params: { depth: 3 } }, free).ask.depth_params)).toBe('{"depth":2}');
    expect(decideSettingsForPlan({ plan_tier: "premium" as const, composition_budget_tier: "high" as const,
      depth_params: { depth: 3, answerLength: "short" as const } }, free).depth_params).toEqual({ depth: 2, answerLength: "short" });
  });
  it("without the row a depth-only ask is the same object, and the shape settings are dropped", () => {
    expect(normaliseAskForDebateShape(ASK, null, "free")).toBe(ASK);
    expect(normaliseAskForDebateShape({ ...ASK, depth_params: { depth: 1, scrutiny: "deep" as const } }, null, "pro").depth_params).toEqual({ depth: 1 });
  });
  it("the room query becomes depth_params with only the settings it carries", () => {
    expect(roomDepthParams({ depth: 2 })).toEqual({ depth: 2 });
    expect(roomDepthParams({ depth: 2, depth_mode: "fixed", scrutiny: "deep", answer_length: "short" }))
      .toEqual({ depth: 2, depthMode: "fixed", scrutiny: "deep", answerLength: "short" });
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/debate-shape-admission.test.ts`

Expected: FAIL. `normaliseAskForDebateShape` is not exported, and `resolveEnvelopeBasis` receives no `shape`.

- [ ] **Step 3: Implement `apps/api/src/debate-shape-ask.ts` additions.** Extend its imports to:

```ts
import { debateShapeSettingsOf, type AnswerLength, type AskRequest, type DepthMode, type DepthParams, type Scrutiny } from "@debateai/contract";
import type { RunShapeClass } from "@debateai/budget";
import {
  normaliseDepthParamsForShape, resolveDebateShape,
  type DebateShapeCeilingInput, type DebateShapePlanKey, type DebateShapePolicy
} from "@debateai/register";
```

Then append:

```ts
/** The plan's normalisation applied to an ask (spec §3.2): the same object when nothing changes. */
export function normaliseAskForDebateShape<T extends Pick<AskRequest, "depth_params">>(
  ask: T, policy: DebateShapePolicy | null, plan: DebateShapePlanKey
): T {
  const depthParams = normaliseDepthParamsForShape(ask.depth_params, policy, plan);
  return depthParams === ask.depth_params ? ask : Object.freeze({ ...ask, depth_params: depthParams }) as T;
}

/** The sizes `makers` distinct makers run under the row (null: no row, or one maker). Admission calls this per panel. */
export function debateShapeForPanel(
  policy: DebateShapePolicy | undefined, depthParams: DepthParams, plan: DebateShapePlanKey, makers: number
): DebateShapeCeilingInput | null {
  return policy === undefined ? null : resolveDebateShape({ policy, plan, makers, settings: debateShapeSettingsOf(depthParams) });
}

/** GET /v1/asks/room: the query's settings as the depth_params an ask would carry (only the ones it carries). */
export function roomDepthParams(query: Readonly<{
  depth: number; depth_mode?: DepthMode; scrutiny?: Scrutiny; answer_length?: AnswerLength;
}>): DepthParams {
  return Object.freeze({
    depth: query.depth,
    ...(query.depth_mode === undefined ? {} : { depthMode: query.depth_mode }),
    ...(query.scrutiny === undefined ? {} : { scrutiny: query.scrutiny }),
    ...(query.answer_length === undefined ? {} : { answerLength: query.answer_length })
  });
}
```

- [ ] **Step 4: Free normalisation keeps the shape keys** (`apps/api/src/ask-billing.ts`).

In `decideSettingsForPlan`, replace `depth_params: Object.freeze({ depth: gauges.depth })` with `depth_params: Object.freeze({ ...settings.depth_params, depth: gauges.depth })`. In `normaliseAskForPlan`, replace the same expression with `depth_params: Object.freeze({ ...ask.depth_params, depth: gauges.depth })`.

Add one comment line above each: `// Debate shape (spec 2026-10-12 §3.2): only the depth is Free's gauge; the shape settings pass on to the shape's own normalisation.`

- [ ] **Step 5: Admission and submit** (`apps/api/src/index.ts`).

**(a) Imports:**

```ts
import { debateShapePlanKeyOf, structuralBasisProvisionsBackup, type DebateShapeCeilingInput, type DebateShapePlanKey, type DebateShapePolicy } from "@debateai/register";
import { debateShapeForPanel, normaliseAskForDebateShape, roomDepthParams } from "./debate-shape-ask.js";
```

Add `answerTokenCeilingsForBasis` to the existing `./ask-model-picker.js` import.

**(b) `ApiOptions`.** Add, next to `askBilling`:

```ts
  /** Debate shape (spec 2026-10-12 §3.1): the register's optional row, for the room read's normalisation. Absent: today's. */
  readonly debateShapePolicy?: DebateShapePolicy;
```

**(c) `RunCreationSettings`.** Add, after `roleRotation?`:

```ts
  /**
   * Debate shape (spec 2026-10-12 §3.1): present only when the register's optional debateShapePolicy row is in force.
   * Absent: every ask's depth_params is today's `{ depth }` and every basis today's, byte for byte.
   */
  readonly debateShapePolicy?: DebateShapePolicy;
```

In `resolveEnvelopeBasis`'s input type, after `backupSequencesProvisioned`, add:

```ts
    /** Debate shape (spec 2026-10-12 §3.6): the sizes this panel runs (`resolveDebateShape`), or null for today's shape. */
    readonly shape: DebateShapeCeilingInput | null;
```

**(d) `admitWithScorecard`.** Add `shapePlan: DebateShapePlanKey;` to its input type. Replace `resolveBasis` and its two calls with:

```ts
  const resolveBasis = async (
    panelSize: number,
    backupSequencesProvisioned: 0 | 1,
    makers: number
  ): Promise<Readonly<Record<string, unknown>>> => {
    try {
      return await settings.resolveEnvelopeBasis({
        depthParams: ask.depth_params,
        riskTier: risk.effectiveRiskTier,
        panelSize,
        backupSequencesProvisioned,
        // Debate shape (spec 2026-10-12 §3.6): on this path each debater is a distinct maker (debaterSeatCount).
        shape: debateShapeForPanel(settings.debateShapePolicy, ask.depth_params, input.shapePlan, makers)
      });
    } catch (error) {
      return markAskRefusal(error);
    }
  };
  // The planned basis sizes the picker's expected calls only. Its call-site
  // counts do not depend on the backup provision, so it is asked without one.
  const plannedBasis = await resolveBasis(plannedDebaters, 0, plannedDebaters);
```

In `pickerInput`, change `answerTokenCeilingByRole: picker.answerTokenCeilings` to `answerTokenCeilingByRole: answerTokenCeilingsForBasis(picker.answerTokenCeilings, plannedBasis)`.

Replace the final basis and its check with:

```ts
    const backupSequencesProvisioned = backupSequencesFor(outcome.assignment);
    // Debate shape: the seated debaters' own makers size the shape, so a shaped basis is always minted for them.
    const envelopeBasis = debaters.length === plannedDebaters && backupSequencesProvisioned === 0 && settings.debateShapePolicy === undefined
      ? plannedBasis
      : await resolveBasis(debaters.length, backupSequencesProvisioned, new Set(debaters.map((seat) => seat.maker)).size);
    // Carry 15 (A20.2 review m3) … (keep the existing comment)
    if (backupSequencesProvisioned === 1 && !structuralBasisProvisionsBackup(envelopeBasis)) {
```

The body of that `if` is unchanged.

**(e) `evaluateAskAdmission`.** Add a fifth parameter, `shapePlanKey: DebateShapePlanKey | null = null`. Right after the `ASK_PLAN_TIER_INVALID` check, add:

```ts
  // Debate shape (spec 2026-10-12 §3.1): the plan id submit resolved with billing on, else the tier's key.
  const shapePlan = shapePlanKey ?? debateShapePlanKeyOf(null, ask.plan_tier);
```

Pass `shapePlan` into the `admitWithScorecard({ … })` call. In the legacy path's `resolveEnvelopeBasis({ … })`, add after `backupSequencesProvisioned: 0`:

```ts
      ,
      shape: debateShapeForPanel(settings.debateShapePolicy, ask.depth_params, shapePlan,
        new Set(filteredPanel.map((entry) => entry.maker)).size)
```

Write the comma as part of the `backupSequencesProvisioned: 0` line.

**(f) `evaluationOrRefusal`.** Add `shapePlan: DebateShapePlanKey | null = null` and call `evaluateAskAdmission(settings, ask, personRoom, undefined, shapePlan)`.

**(g) `submit`.** Replace the three declarations

```ts
    let ask: AskRequest = requestedAsk;
    let plannedAsk: AskRequest = requestedAsk;
```

with:

```ts
    // Debate shape (spec 2026-10-12 §3.2): every ask is normalised for its plan key before anything reads it.
    const shapePolicy = this.settings.debateShapePolicy ?? null;
    let shapePlan: DebateShapePlanKey = debateShapePlanKeyOf(null, requestedAsk.plan_tier);
    let ask: AskRequest = normaliseAskForDebateShape(requestedAsk, shapePolicy, shapePlan);
    let plannedAsk: AskRequest = ask;
```

Inside the billing block, replace

```ts
      fundingBasis = resolved.fundingBasis;
      ask = resolved.ask;
      plannedAsk = resolved.ask;
      applied = appliedAskOf(resolved.ask);
```

with:

```ts
      fundingBasis = resolved.fundingBasis;
      shapePlan = debateShapePlanKeyOf(resolved.planId, resolved.ask.plan_tier);
      ask = normaliseAskForDebateShape(resolved.ask, shapePolicy, shapePlan);
      plannedAsk = ask;
      applied = appliedAskOf(ask);
```

Then make three call changes:

- the coarse fit call becomes `coarseFitFor(ask, principal.ownerRef, billing, now, this.settings.previewProviderTestConfig, shapePlan)`;
- the room call becomes `this.#submitWithRoom(ask, plannedAsk, session, principal, ownership, this.settings.room, substitutedAt, shapePlan, fundingBasis)`;
- the direct admission becomes `evaluateAskAdmission(this.settings, ask, null, previewAdmissionLock, shapePlan)`.

**(h) `#submitWithRoom`.** Add the parameter `shapePlan: DebateShapePlanKey` after `substitutedAt: Date | null`. Pass `shapePlan` as the third argument of both `runSettingsClassOfAsk(…)` calls and as the fourth argument of both `evaluationOrRefusal(…)` calls (`evaluationOrRefusal(this.settings, plannedAsk, null, shapePlan)` for the plan's own).

**(i) The room route.** Replace the `settingsClass: runSettingsClassOfAsk(await decideRoomSettings({ … }, access.ownerRef, options.askBilling),previewConfig)` argument with:

```ts
          settingsClass: await (async () => {
            // B8 (R-28): with billing on, the room is read for the ask the server would run; debate shape: and normalised
            // for that ask's tier as submit would (the plan id is the submit's; the room is an advisory word).
            const decided = await decideRoomSettings({
              plan_tier: query.data.plan_tier,
              composition_budget_tier: query.data.composition_budget_tier,
              depth_params: roomDepthParams(query.data)
            }, access.ownerRef, options.askBilling);
            const roomPlan = debateShapePlanKeyOf(null, decided.plan_tier);
            return runSettingsClassOfAsk(normaliseAskForDebateShape(decided, options.debateShapePolicy ?? null, roomPlan), previewConfig, roomPlan);
          })()
```

- [ ] **Step 6: The boot and the two compositions.**

In `apps/api/src/main.ts`:

- Add `readDebateShapePolicy,` to the `@debateai/register` import.
- After the `answerRoleRotation` line (~945), add:

  ```ts
  // Debate shape (spec 2026-10-12 §3.1): the optional row; absent = today's shape byte for byte, a malformed row refuses the boot.
  const debateShapePolicy = await boot.run("debate-shape-policy", () => readDebateShapePolicy(pool, environment.REGISTER_VERSION));
  ```

- In the `PostgresAskApplication` settings, after the `roleRotation` spread, add `...(debateShapePolicy === null ? {} : { debateShapePolicy }),`.
- In `resolveEnvelopeBasis`, after `backupSequencesProvisioned: input.backupSequencesProvisioned`, add `,\n    ...(input.shape === null ? {} : { shape: input.shape })`.
- In the `buildApi` options next to `...(askBilling === undefined ? {} : { askBilling }),` (~1452), add `...(debateShapePolicy === null ? {} : { debateShapePolicy }),`.

In `tools/preview-practice/practice-ask-composition.ts`:

- Add `readDebateShapePolicy` to its `@debateai/register` import.
- After `const answerRoleRotation = await readAnswerRoleRotationPolicy(pool, version);`, add `const debateShapePolicy = await readDebateShapePolicy(pool, version);`.
- In `runSettings`, add `...(debateShapePolicy === null ? {} : { debateShapePolicy }),` after the `roleRotation` spread.
- In its `resolveEnvelopeBasis`, add `...(basis.shape === null ? {} : { shape: basis.shape })` after `backupSequencesProvisioned: basis.backupSequencesProvisioned`.

- [ ] **Step 7: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/debate-shape-admission.test.ts`

- [ ] **Step 8: Today's admission, billing and room tests stay green**

Run each separately, one at a time:

- `tests/unit/role-rotation-admission.test.ts`
- `tests/unit/model-picker-admission.test.ts`
- `tests/unit/b8-server-plan-tier.test.ts`
- `tests/unit/s4b-free-cost-cap.test.ts`
- `tests/unit/preview-team-only-asks.test.ts`
- `tests/unit/api.test.ts`
- `tests/unit/s1-1-depth-contract.test.ts`

Expected: PASS. If a test builds `RunCreationSettings.resolveEnvelopeBasis` and destructures the input, it only reads the fields it names, so it needs no change.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/debate-shape-ask.ts apps/api/src/ask-billing.ts apps/api/src/index.ts apps/api/src/main.ts tools/preview-practice/practice-ask-composition.ts tests/unit/debate-shape-admission.test.ts
git commit -m "API: the debate shape row at boot, plan normalisation in submit, the shape sizes at admission, the room read normalised

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The runner reads the row at boot (Phase-2a guard)

**Files:**
- Modify: `apps/runner/src/main.ts` (the `@debateai/register` import ~16–28; one statement after `const storyCeilingMicros = …` ~116)
- Modify: `tests/integration/obs-l3-s06-runner-binding.test.ts` (~538, the `@debateai/register` stand-in string)
- Test: `tests/unit/debate-shape-runner-boot.test.ts` (create)

**Interfaces:**
- Consumes: `readDebateShapePolicy` and `assertDebateShapeRunnerReady` (Task 2).
- Produces: the runner's boot refuses a malformed row (`DEBATE_SHAPE_POLICY_INVALID:<path>`) and, in Phase 2a, a valid one (`DEBATE_SHAPE_POLICY_RUNNER_PENDING`). An absent row leaves the boot as it is today.

- [ ] **Step 1: Write the failing test** `tests/unit/debate-shape-runner-boot.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("the runner reads the debate shape row at its register version (spec 2026-10-12 §3.1)", () => {
  it("reads it once, at boot, and refuses a present row until Phase 2b", async () => {
    const main = await readFile("apps/runner/src/main.ts", "utf8");
    const call = "assertDebateShapeRunnerReady(await readDebateShapePolicy(pool, environment.REGISTER_VERSION));";
    expect(main.split(call)).toHaveLength(2);
    // Before the runner is built, so a refused boot claims no debate.
    expect(main.indexOf(call)).toBeLessThan(main.indexOf("new WalkingSkeletonRunner("));
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/debate-shape-runner-boot.test.ts`

Expected: FAIL. The call is not in main.ts yet.

- [ ] **Step 3: Implement.** In `apps/runner/src/main.ts`, add `assertDebateShapeRunnerReady,` and `readDebateShapePolicy,` to the `@debateai/register` import list. Right after the line `const storyCeilingMicros = storyPolicy?.perStoryCeilingMicros ?? null;`, insert:

```ts
/**
 * Debate shape (spec 2026-10-12 §3.1): the optional register row. Absent = today's shape, byte for byte; a malformed
 * row refuses this boot (DEBATE_SHAPE_POLICY_INVALID). Phase 2a: a valid row refuses it too
 * (DEBATE_SHAPE_POLICY_RUNNER_PENDING), until Phase 2b teaches this runner the shape and replaces this line.
 */
assertDebateShapeRunnerReady(await readDebateShapePolicy(pool, environment.REGISTER_VERSION));
```

In `tests/integration/obs-l3-s06-runner-binding.test.ts`, append ` export function readDebateShapePolicy() {} export function assertDebateShapeRunnerReady() {}` inside the `"@debateai/register": "…"` stand-in string, before its closing quote.

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/debate-shape-runner-boot.test.ts`

Then run, one at a time:

- `pnpm exec vitest run tests/unit/preview-auth-dev-composition.test.ts`
- `pnpm exec vitest run tests/unit/dl7-f7-boot-custody.test.ts`

Expected: PASS. The guard sits outside the slices those tests run.

- [ ] **Step 5: Run the runner binding integration test** (alone)

Run: `pnpm exec vitest run tests/integration/obs-l3-s06-runner-binding.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/runner/src/main.ts tests/integration/obs-l3-s06-runner-binding.test.ts tests/unit/debate-shape-runner-boot.test.ts
git commit -m "Runner: read the debate shape row at boot; a malformed row refuses, and in Phase 2a a valid one too

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The publishers: the preview kit's optional row and the hosted file's optional member

**Files:**
- Modify: `deploy/preview-auth-dev/v1/publish-register-v2.ts` (`PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2`, `buildPreviewSourceRowsV2`, `composePreviewSnapshotV2`'s carried-row check)
- Modify: `apps/runner/src/hosted-register-publish.ts`:
  - `TOP_LEVEL_KEYS`, `HostedRegisterFile`, `parseHostedRegisterFile`;
  - a new `debateShapeRowOf`;
  - `planHostedRegisterPublication`, `verifyHostedRegisterBootReadiness`.
- Modify: `deploy/vps/register/README.md` (the optional-member table), `deploy/vps/README.md` (the refusal-code table)
- Test: `tests/unit/preview-register-publish-v2.test.ts` (add a describe), `tests/integration/hosted-register-publish.test.ts` (add two cases)

**Interfaces:**
- Consumes: `DEBATE_SHAPE_POLICY_ROW_KEY`, `debateShapePolicyRow`, `parseDebateShapePolicy`, `readDebateShapePolicy`, `debateShapePolicyStartValues` and `DebateShapePolicy` (Task 2).
- Produces:
```ts
export const PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2: readonly ["callConcurrencyPolicy", "debateShapePolicy"];
export async function buildPreviewSourceRowsV2(bootstrap, runtime, checker?, roleRotation?, callConcurrency?: CallConcurrencyPolicy | null, debateShape?: DebateShapePolicy | null): Promise<readonly RegisterPublicationRow[]>;
// hosted file: optional top-level member `debateShapePolicy` (the policy without `kind`); refusal HOSTED_REGISTER_DEBATE_SHAPE_INVALID
```

- [ ] **Step 1: Write the failing kit test.** Append to `tests/unit/preview-register-publish-v2.test.ts`. It uses that file's existing helpers `runtime`, `fixture`, `compose`, `Row`, `ROTATION_KEY` and `CALL_CONCURRENCY_POLICY_ROW_KEY`. Add `DEBATE_SHAPE_POLICY_ROW_KEY` and `debateShapePolicyStartValues` to its `@debateai/register` import.

```ts
describe('publish kit v2: the optional debateShapePolicy row (absent by default, spec 2026-10-12 §3.1)', () => {
  const policy = debateShapePolicyStartValues();
  const build = async (debateShape?: unknown) =>
    [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, undefined, undefined, null, debateShape as any)] as Row[];

  it('adds exactly one row when supplied and nothing by default; it is optional, never in the reviewed closure', async () => {
    const absent = await build(), given = await build(policy);
    expect(absent.map(row => row.rowKey)).not.toContain(DEBATE_SHAPE_POLICY_ROW_KEY);
    expect(await build(null)).toEqual(absent);
    expect(PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2).toEqual([CALL_CONCURRENCY_POLICY_ROW_KEY, DEBATE_SHAPE_POLICY_ROW_KEY]);
    expect(PREVIEW_SOURCE_ROW_KEYS_V2).not.toContain(DEBATE_SHAPE_POLICY_ROW_KEY);
    expect(given.filter(row => row.rowKey !== DEBATE_SHAPE_POLICY_ROW_KEY)).toEqual(absent);
    expect(JSON.parse(given.find(row => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY)!.valueJsonText)).toEqual(JSON.parse(JSON.stringify(policy)));
  });
  it('refuses a policy the register parser refuses, before building any row', async () => {
    const bad = JSON.parse(JSON.stringify(policy));
    bad.plans.free.mapAIs = 10;
    await expect(build(bad)).rejects.toThrow('DEBATE_SHAPE_POLICY_INVALID:plans.free.mapAIs');
  });
  it('R19: a plan without a value keeps the base version\'s row unchanged; a broken base row is refused, never carried', async () => {
    const f = await fixture();
    const published = compose(await build(policy), f.v9);
    expect(published.addedKeys).toEqual([ROTATION_KEY, DEBATE_SHAPE_POLICY_ROW_KEY].sort((a, b) => a.localeCompare(b, 'en')));
    const base = [...published.rows] as Row[];
    const kept = compose(f.source, base, '10');
    expect(kept.rows.find(row => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY)).toEqual(base.find(row => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY));
    expect(kept.delta).toEqual([]);
    const broken = base.map(row => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY ? { ...row, valueJsonText: row.valueJsonText.replace('"DEBATE_SHAPE_POLICY"', '"X"') } : row);
    expect(() => compose(f.source, broken, '10')).toThrow('DEBATE_SHAPE_POLICY_INVALID:kind');
  });
});
```

Also update Project 1's assertion `expect(PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2).toEqual([CALL_CONCURRENCY_POLICY_ROW_KEY]);` to `toEqual([CALL_CONCURRENCY_POLICY_ROW_KEY, DEBATE_SHAPE_POLICY_ROW_KEY])`.

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/preview-register-publish-v2.test.ts`

Expected: FAIL. The sixth argument is ignored, so no shape row is built.

- [ ] **Step 3: Implement the kit** (`deploy/preview-auth-dev/v1/publish-register-v2.ts`).

**(a) Imports.** Add `DEBATE_SHAPE_POLICY_ROW_KEY, debateShapePolicyRow, parseDebateShapePolicy, type DebateShapePolicy` to the `@debateai/register` import.

**(b) The optional list.** Change it to `Object.freeze([CALL_CONCURRENCY_POLICY_ROW_KEY, DEBATE_SHAPE_POLICY_ROW_KEY] as const)`.

**(c) The header.** Extend the header comment with one line: `// Debate shape (spec 2026-10-12 §3.1): likewise optional; the source carries a debateShapePolicy row only when the operator hands one.`

**(d) The builder.** In `buildPreviewSourceRowsV2`:

- add the sixth parameter `debateShape:DebateShapePolicy|null=null`;
- next to `concurrencyRows`, add `const shapeRows=debateShape===null?[]:[debateShapePolicyRow(debateShape,'docs/superpowers/specs/2026-10-12-debate-shape-design.md; owner 2026-10-12')];`;
- append `...shapeRows` after `...concurrencyRows` in `rows`.

**(e) The composer.** In `composePreviewSnapshotV2`, replace the one-line carried check with:

```ts
  for(const row of carried){
    if(row.rowKey===CALL_CONCURRENCY_POLICY_ROW_KEY)callConcurrencyPolicyFromValue(JSON.parse(row.valueJsonText));
    if(row.rowKey===DEBATE_SHAPE_POLICY_ROW_KEY)parseDebateShapePolicy(JSON.parse(row.valueJsonText));
  }
```

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/preview-register-publish-v2.test.ts`

- [ ] **Step 5: Write the failing hosted cases.** Append to the last describe of `tests/integration/hosted-register-publish.test.ts`, next to Project 1's call-concurrency cases. Add `debateShapePolicyRow`, `debateShapePolicyStartValues` and `readDebateShapePolicy` to its `@debateai/register` import.

```ts
  // Debate shape (spec 2026-10-12 §3.1): the optional debateShapePolicy member becomes one additive row.
  it("seals debateShapePolicy as the row the publishers build, and a file without the member seals none", async () => {
    const operations = createPostgresHostedRegisterOperations(database.pool);
    const absent = await publishHostedRegister({ plan: await planOf(hostedFile()), operations });
    await expect(readDebateShapePolicy(database.pool, registerVersionToSafeLegacyNumber(absent.registerVersion))).resolves.toBeNull();
    const { kind: _kind, ...member } = JSON.parse(JSON.stringify(debateShapePolicyStartValues()));
    const given = await publishHostedRegister({ plan: await planOf({ ...hostedFile(), debateShapePolicy: member }), operations });
    expect(given.outcome).toBe("CREATED");
    const expected = debateShapePolicyRow(debateShapePolicyStartValues(), "task-14b integration: first hosted register");
    const sealed = await database.pool.query<{ value_json: unknown; source_ref: string }>(
      "SELECT value_json,source_ref FROM register.register_row WHERE register_version=$1 AND row_key='debateShapePolicy'",
      [given.registerVersion]
    );
    expect(sealed.rows).toEqual([{ value_json: JSON.parse(expected.valueJsonText), source_ref: expected.sourceRef }]);
    await expect(readDebateShapePolicy(database.pool, registerVersionToSafeLegacyNumber(given.registerVersion)))
      .resolves.toEqual(debateShapePolicyStartValues());
  }, 120_000);

  it.each([
    ["a size above its bound", (m: any) => { m.plans.free.mapAIs = 10; }],
    ["a member carrying the row's kind", (m: any) => { m.kind = "DEBATE_SHAPE_POLICY"; }],
    ["a member present as JSON null", () => null]
  ])("refuses a debateShapePolicy member with %s before anything is sealed", async (_name, change) => {
    const { kind: _kind, ...member } = JSON.parse(JSON.stringify(debateShapePolicyStartValues()));
    const changed = change(member);
    const before = await versionCount();
    const code = await planOf({ ...hostedFile(), debateShapePolicy: changed === null ? null : member })
      .then(() => "NO_REFUSAL", hostedRegisterRefusalCode);
    expect(code).toBe("HOSTED_REGISTER_DEBATE_SHAPE_INVALID");
    expect(await versionCount()).toBe(before);
  }, 120_000);
```

- [ ] **Step 6: Implement the hosted member** (`apps/runner/src/hosted-register-publish.ts`), mirroring Project 1's `callConcurrencyPolicy`.

**(a) Imports.** Add `DEBATE_SHAPE_POLICY_ROW_KEY`, `debateShapePolicyRow`, `parseDebateShapePolicy` and `readDebateShapePolicy` to the `@debateai/register` import.

**(b) The header.** Extend the header list after the call-concurrency sentence: `Likewise optional, the debateShapePolicy (spec 2026-10-12, debate shape): the policy without its kind, sealed as the ADDITIVE debateShapePolicy row under the file's sourceRef; left out, no such row is sealed and the engine keeps today's shape.`

**(c) `TOP_LEVEL_KEYS`.** Append:

```ts
  ,
  // Debate shape (spec 2026-10-12): OPTIONAL. Left out, no row is sealed and the engine keeps today's shape.
  "debateShapePolicy"
```

**(d) `HostedRegisterFile`.** Add `/** Optional (spec 2026-10-12): the debate shape policy without its kind; absent = no debateShapePolicy row. */ debateShapePolicy?: unknown;`.

**(e) `parseHostedRegisterFile`.** Add `...(Object.hasOwn(record, "debateShapePolicy") ? { debateShapePolicy: record.debateShapePolicy } : {})`.

**(f) The row builder.** Add after `callConcurrencyRowOf`:

```ts
/**
 * The debateShapePolicy row for the file's optional member (spec 2026-10-12 §3.1). The member is the policy without
 * its `kind` (the row adds it); a member that is not an object, carries `kind`, or that the register's own parser
 * refuses is refused with the file's own code, so a malformed member can never seal a malformed row.
 */
function debateShapeRowOf(member: unknown, sourceRef: string): ReturnType<typeof debateShapePolicyRow> {
  if (typeof member !== "object" || member === null || Array.isArray(member) || Object.hasOwn(member, "kind")) {
    return refuse("HOSTED_REGISTER_DEBATE_SHAPE_INVALID");
  }
  try {
    return debateShapePolicyRow(parseDebateShapePolicy({ kind: "DEBATE_SHAPE_POLICY", ...member }), sourceRef);
  } catch {
    return refuse("HOSTED_REGISTER_DEBATE_SHAPE_INVALID");
  }
}
```

**(g) `planHostedRegisterPublication`.** After the `callConcurrencyRow` line, add:

```ts
  // Debate shape (spec 2026-10-12): the same, for the optional debateShapePolicy member. Absent = no row (today's shape).
  const debateShapeRow = file.debateShapePolicy === undefined ? null : debateShapeRowOf(file.debateShapePolicy, file.sourceRef);
```

After the `callConcurrencyRows` block, add:

```ts
  if (debateShapeRow !== null && codeOwnedRows.some((row) => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY)) {
    refuse("HOSTED_REGISTER_COMPOSITION_INVALID");
  }
  const debateShapeRows: readonly RegisterPublicationRow[] = debateShapeRow === null ? [] : [Object.freeze({
    rowKey: debateShapeRow.rowKey,
    valueJsonText: debateShapeRow.valueJsonText,
    sourceRef: debateShapeRow.sourceRef
  })];
```

Then append `...debateShapeRows` after `...callConcurrencyRows` in `rows`.

**(h) `verifyHostedRegisterBootReadiness`.** After the `readCallConcurrencyPolicy` line, add:

```ts
  // Debate shape (spec 2026-10-12): optional (ABSENT = today's shape), but a malformed row would refuse both boots.
  await readDebateShapePolicy(pool, version);
```

**(i) The docs.**

- In `deploy/vps/register/README.md`'s optional-member table, add the row: `| debateShapePolicy | optional, and NOT in the example: the debate shape's per-plan sizes and answer lengths (spec 2026-10-12 §3.1), the policy without its "kind". Absent: today's debate shape. Do not publish it before the runner that runs the shape is deployed: until then the runner refuses to start (DEBATE_SHAPE_POLICY_RUNNER_PENDING). |`
- In `deploy/vps/README.md`'s refusal-code table, add: `| HOSTED_REGISTER_DEBATE_SHAPE_INVALID | the file's optional debateShapePolicy is not an object, carries "kind", or the register's own parser refuses it (a size outside its bounds, a missing plan, an unknown field). Nothing was sealed. |`

- [ ] **Step 7: Run the hosted integration file** (alone)

Run: `pnpm exec vitest run tests/integration/hosted-register-publish.test.ts`. Expected: PASS, the two new cases included.

- [ ] **Step 8: Run the kit's integration file** (alone, after Step 7 finished)

Run: `pnpm exec vitest run tests/integration/preview-register-publish-v2.test.ts`

Expected: PASS. The default source still seals no optional row.

- [ ] **Step 9: Commit**

```bash
git add deploy/preview-auth-dev/v1/publish-register-v2.ts apps/runner/src/hosted-register-publish.ts deploy/vps/register/README.md deploy/vps/README.md tests/unit/preview-register-publish-v2.test.ts tests/integration/hosted-register-publish.test.ts
git commit -m "Publishers: the debateShapePolicy row as the preview kit's optional source row and the hosted file's optional member

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Whole-branch verification

**Files:** none (verification only; fix in the owning task's files if anything is red, then commit there).

- [ ] **Step 1: Typecheck** (alone): `pnpm run typecheck`. Expected: exit 0.
- [ ] **Step 2: Source and architecture audits** (alone): `pnpm run lint`. Expected: exit 0.

  Then run: `pnpm exec vitest run tests/architecture/scaffold.test.ts`. Expected: PASS. The blocking list is unchanged, and `computeStructuralCeilingBasis` is still ATTACHED.
- [ ] **Step 3: The depth contract and shipped corpus**: `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`. Expected: PASS.
- [ ] **Step 4: Every new unit test file and every money test, one file per command, in this order:**
  1. debate-shape-contract
  2. debate-shape-policy
  3. debate-shape-ceiling
  4. debate-shape-receipt
  5. debate-shape-role-shares
  6. debate-shape-preview-estimate
  7. debate-shape-estimate-class
  8. debate-shape-admission
  9. debate-shape-runner-boot
  10. t17-envelope
  11. s1-scorecard-merge-money
  12. register-s09
  13. dr181-ceiling
  14. dr184-review-resilience
  15. money-serve-reserve
  16. budget-s09
  17. ask-model-picker
  18. preview-budget-estimate
  19. b2-cost-estimator
  20. b8-server-plan-tier
  21. role-rotation-admission
  22. model-picker-admission
  23. preview-register-publish-v2
  24. answer-role-rotation-policy
  25. call-concurrency-policy

  Expected: all PASS.
- [ ] **Step 5: The real-ledger maximum path** (alone): `pnpm exec vitest run tests/integration/t17-envelope-ledger.test.ts`. Expected: PASS. A row-absent run spends no more attempts than its unchanged ceiling.
- [ ] **Step 6: Report.** Do not push or open a PR. Report to the controller:
  - the commit list;
  - the counts of passing test files;
  - any test whose expectation had to change, with the reason it changed. Only Project 1's optional-key list assertion is expected to change.

---

## Self-review against the spec (P2a only)

| Spec item | Where |
|---|---|
| S5 per-plan sizes (map AIs / answers / graders), never more than the makers present | Task 2 (start values, `resolveDebateShape` caps); Task 3 (ceiling refuses an over-size shape); Task 4 (parser refuses one) |
| S6 depth mode: adaptive default, fixed on Premium, Free adaptive with ceiling 2 | Task 1 (enum, default); Task 2 (`normaliseDepthParamsForShape` fixed→adaptive on Free); Task 8 (Free billing keeps depth 2 as its gauge and passes the settings on) |
| S7 scrutiny budgets, Premium only (Deep 2/6, Exhaustive 3/15) | Task 2 (start values, normalisation to standard on Free); Task 3 (2·R·Q nodes in the ceiling) |
| S8 answer length 300/700/1,500 words, writer bound max(sealed, 8192/12288/16384), every plan | Task 1 (enum); Task 2 (row, start values); Task 3 (receipt `writer_bound`, `answer_words`); Task 5 (picker writer bound); Task 6 (preview writer pricing); Task 8 (Free keeps it) |
| §3.1 optional row, absent = today byte for byte, invalid refuses, new value = new version | Task 2 (parse/read); Task 3 and Task 4 (byte pins); Task 8 (API boot); Task 9 (runner boot); Task 10 (publishers seal a new version, the kit carries a base row unchanged) |
| §3.1 publishers: preview v2 kit and hosted optional member; dev/local off | Task 10 (dev rows untouched; Global Constraints) |
| §3.2 contract → POST /v1/asks → plan normalisation → estimate → depth_params → readFrozenHead → runner | Task 1 (contract); Task 8 (submit normalisation, admission, storage through `startRun`'s existing `depthParams`); contract deviation 2 (`readFrozenHead` unchanged; `debateShapeSettingsOf` defaults); Task 9 (runner boot) |
| §3.2 the four money places carry the three fields | Estimate SQL: Task 7. Waiting-line SQL: Task 7 (run-wait.ts). Billing SQL: contract deviation 8 (0085 trigger unchanged, why; the careful read in Task 7). Strict receipt parser: Task 4 |
| §3.6 estimate formula (map A+3+G, nodes, calls per node, close-call extras), ceiling never under-counts | Task 3 (formula and grid enumeration); contract deviation 4 (2A+G+3, extras on every node); Task 5 (per-role shares); Task 6 (preview pricing) |
| §5 unit tests: contract normalisation per plan; estimate formulas for both shapes; register row parsing (absent/valid/invalid) | Tasks 2, 3, 4, 7 and 8 |
| Budget-never-stops law: the estimate is a ceiling and never under-counts | Task 3 (enumeration equality over the grid); Task 7 (careful waiting class; new classes start at the run maximum); Review Focus 2 and 5 |
| Sealed values never edited | No migration, no bootstrap or sealed row change (Global Constraints); the new row is optional and additive (Task 10) |

**Left to the later sub-plans, as INTERFACE assigns:**

- **P2b:** the runner shape, reading `envelopeBasis.shape` and `debateShapeSettingsOf(run.depthParams)`; removing `assertDebateShapeRunnerReady`; the enumerator test of its plan builder against `debateShapeSiteCounts`.
- **P2c:** the /new controls, sending the three fields and the room query fields. It must also reconcile `apps/ui/lib/phoneCompletionDraft.ts`, whose `depthMode` check lists four values (fixed, manual, recommended, adaptive) where the contract now has two.
- **P2d:** the practice override, using `debateShapePolicyStartValues`, `debateShapePolicyRow` and the throwaway register.
