# Debate Shape Phase 2b (the runner shape) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a run's receipt carries a debate shape (P2a's `envelope_basis.shape`), the runner argues the new shape: the
angle map (Stage 1), P assigned positions, round-1 chosen points, J graders plus the close-call extension, one cross-reply
per position, breadth-first deeper rounds (adaptive or fixed) with δ/ε at every round boundary, scrutiny, and the answer
length. Every fallback ends with an answer. A run without a shape is today's run, byte for byte.

**Architecture:** The map runs inside `execute()` before root 0, through a `MapCaller` adapter
(`apps/runner/src/map-stage.ts`) over the same per-maker gateway stack the debate uses (lane, sit-out book, keep-alive,
counting gateway). The rest of the shape is expressed in the runner's EXISTING plan vocabulary: P roots and one
breadth-first leg list (`apps/runner/src/shape-plan.ts`) whose legs carry their own kind, ordinal, consideration and
key, so the ordered recorders, review batches, `closeGlobalRound`, `subtreeIndices` and `selectPreventableBranches` keep
working unchanged. Pure helpers decide seats (`shape-seats.ts`), adaptive chains and scrutiny needs (`shape-select.ts`).
The map is stored in three new append-only tables (`core.map_item`, `core.map_choice`, `core.map_position`, migration
0116) through `MapChoiceRepository` in `@debateai/map` (never in `@debateai/db`, whose `index.ts` is hash-pinned).

**Tech Stack:** TypeScript (strict, ESM), zod, vitest, embedded PostgreSQL (integration), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-10-12-debate-shape-design.md` §1.2, §3.3–§3.5 and the invariants list; binding
names `docs/superpowers/plans/2026-10-12-debate-shape-phase2-INTERFACE.md` §3–§4; Project 1
`docs/superpowers/specs/2026-10-12-parallel-calls-design.md`; sibling plans P2a/P2c/P2d (same folder).

All paths are relative to `dialectical-engine/` on branch `feat/2026-10-13-debate-shape-phase2` (worktree
`.claude/worktrees/debate-shape-p2/dialectical-engine`). P2a is built first (its names are used below as written in
`2026-10-12-debate-shape-phase2a.md`, including the Cross-plan changes this plan asks of it).

## Global Constraints

- **Row absent = today, byte for byte.** A run whose `parseCostEnvelopeBasis(run.envelopeBasis).shape` is `undefined`
  takes today's code path in every function this plan touches. Every new branch is guarded by `shapeRun !== null`.
  Today's prompts (contract ids, instruction text, material fields) are unchanged; only the sealed fingerprints grow.
- **The receipt is the source of truth.** The runner reads sizes only from `envelopeBasis.shape`
  (`DebateShapeCeilingInput`, P2a) and settings from `debateShapeSettingsOf(run.depthParams)` (P2a). It never resolves
  the plan again. Sit-outs may only LOWER a size. The runner never makes more calls than `debateShapeSiteCounts`
  (P2a) priced: Task 9 has an enumerator test.
- **P2a money rules kept (binding).** Fixed mode = one exchange (reply + defence) per chosen point per deeper round, a
  linear chain. Adaptive = `deeperTopPoints` chains per position. Map-unavailable fallback opens at most P positions
  (the first P seats) with at most K round-1 children each. Map repairs (patch, full re-ask) are attempts inside each
  call's own allowance. A reassigned list has its own key `MAP:list:<i>:2` (P2a's `2A + G + 3` map sites already count it).
- **Stops (Project 1, O6).** A money/attempt/usage/daily/allowance refusal (`expansionPhaseStop(error) !== null`) or a
  lane stop during the map ends the map cleanly: nothing new starts, answers already paid for are kept, the map
  finishes with the code fallbacks (no call), and the run goes on to root 0 and its answer with `runBodyBudgetStop`
  set. A keep-alive refusal (claim lost, time limit) abandons the run exactly as today (`keepAliveStop`).
- **One key, one task.** Every call-site key is asked by one task at a time and its retries run inside it. Shape keys:
  `MAP:angles`, `MAP:list:<i>`, `MAP:list:<i>:2`, `MAP:merge`, `MAP:gap:<k>`, `MAP:choose`; roots keep
  `JUDGE` / `JUDGE:root:secondary` / `JUDGE:root:<i>`; every other shape leg is
  `JUDGE:<defender|critic>:root<r>:r<k>:p<n>` where **`n` is the leg's own plan position** (unique), and cross-replies
  keep `JUDGE:cross-root:<i>-><j>`. All of these pass migration 0069's progress-value regex; map calls never go through
  `cooldownAttempt` (no hold records for `MAP:` keys).
- **Sealed values are superseded, never edited.** `register.bootstrap.json`, every existing `migrations/*.sql`,
  `packages/db/src/index.ts` (its `NATIVE_MIGRATE_MODULE_SHA256` pin) and `tests/support/fixtures/register-development-v4.json`
  are not touched. The judge and composer contract hashes CHANGE (new contracts are appended to their fingerprints);
  dev registers re-seal automatically; preview and hosted need a republish (owner step, listed at the end).
- **Marks.** New marks are inserted into `CONDITION_MARKS` right after `"PANEL-DEGRADED-SINGLE-VOICE"`, never at the
  tail (the DR-176 tail is read by `slice(-4)`). Every new mark is in `REQUIRED_CONDITION_MARK_RECORDS` and always has
  a typed record. Map marks are answer-scope with `affectedNodeIds: []` and `call_site_key` NULL; the two extension
  marks are node-scope on the node they extended.
- **No internals in user text.** Mark labels, the opposite-answer template and the length sentence say nothing about
  scores, thresholds, graders or ids.
- **Source rules** (`tests/architecture/scaffold.test.ts`): no `process` + `.env` text; every `switch (` has `default:`
  and `exhaustive(`; no exported ALL_CAPS constant equal to a bare number; no `test`/`fixture` import in shipped code;
  no `/Users/<name>/` path. Depth-literal oracle (`tests/support/depthOracle.ts`): a shipped line mentioning "depth"
  must not contain a bare `5`, nor a `6` after `<`, `>`, `<=`, `>=`. Every new shipped `.ts` goes into
  `tests/support/shipped-corpus.manifest.txt` (regenerate with
  `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`).
- **Test runs (owner's Mac, 16 GB).** Before any `vitest run`: `pgrep -fl 'vitest[ ]run'` shows at most one other run
  and `memory_pressure | tail -1` shows at least 40% free. Integration suites (embedded Postgres) run ONE AT A TIME,
  never beside a typecheck or another integration file. Never the full suite; CI is the judge for the gate.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or the implementing model's own line,
  per the Phase 1 ruling). No push, no PR inside this plan.

## Review Focus

Five failure modes most likely to ship untested, and where they are caught:

1. **A stop during the map leaves the run with no answer** (map throws, orchestrator swallows, or the runner treats the
   stop as a map failure and keeps calling). Caught by Task 1 (`STOPPED` outcome stops every later step, no call made)
   and Task 15 "a money stop mid-map ends with an answer" + "a lost claim during the map abandons".
2. **Two shape legs share one call-site key** (round-1 points under one root with one polarity), silently sharing an
   attempt allowance and a panel rotation. Caught by Task 9 "every leg key is unique and matches the 0069 regex".
3. **Breadth-first order breaks the recorders** (a child planned before its parent, or a cross-reply recorded after a
   deeper round so boundary 1 never sees it). Caught by Task 9 "parents precede children; round 1 holds points and
   cross-replies; `deriveGlobalRoundCompletions` gives one boundary per round" and Task 15 finish-order independence.
4. **The close-call extension lowers a grade** (re-reduction drops the author or re-weights an earlier voice). Caught by
   Task 11 "extension only raises the selected score or widens the dispersion" over every member order.
5. **A row-absent run changes** (a guard reads `shapeRun` wrongly, a prompt byte moves, the panel cap changes). Caught
   by Task 4 "today's five legs frame byte-identically", Task 5 "today's writer prompt is unchanged", Task 16's
   same-saved-debate test across a runner booted with and without the shape rows, and the existing suites run one at a time.

## Contract deviations

1. **Map contract hash is its own OPTIONAL register row `mapContractHash`** (a 64-hex string), not a member of a
   "policy hashes row": there is no such row — each hash is its own row folded into `policy.hashes` by the strict
   `readDevelopmentRunnerPolicy`. Making it required there would break every older register version
   (`DEV_RUNNER_POLICY_UNRESOLVED`). The runner reads it with `readMapContractHash(pool, version)`; a register with a
   `debateShapePolicy` row and no (or a stale) `mapContractHash` refuses the runner's boot
   (`DEBATE_SHAPE_MAP_HASH_UNSEALED` / `MAP_CONTRACT_HASH_MISMATCH`). The dev builder always emits it; the preview kit
   lists it in `PREVIEW_SOURCE_ROW_KEYS_V2`.
2. **Consideration is a contract variant, not an optional field.** The closed material table demands exact fields, and
   today's prompts must stay byte-identical, so support/attack with a consideration use new contract ids
   `judge.<support|attack>.consideration.<claim>.v1` and a second closed table
   `JUDGE_LEG_CONSIDERATION_MATERIAL_FIELDS`. `assigned-root` is a new leg kind (`judge.assigned-root.<claim>.v1`).
   `JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT` = the frozen V1 text (today's five legs, review, panel) +
   `"\n---\n"` + the six new contracts.
3. **The length sentence is a synthesizer contract variant** `serve.synthesizer.length.v1` (V2 instruction + one
   sentence) with one extra material field `answer_length` ("about N words"). It is sealed by `composerContractHash`,
   whose fingerprint becomes V2 + `"\n---\n"` + the length variant. The request object and
   `assertFreshContextRequest` are unchanged (the field is added at framing time).
4. **Storage columns.** `core.map_item` keeps INTERFACE's columns except `claim`/`why`, which live in the encrypted
   `content` (`{claim, why}` or `{answer}`) beside `content_ciphertext`/`content_attestation`; `step` also allows `SNOWBALL`.
   `core.map_choice` is `(run_id, opening, marks, content, content_ciphertext, content_attestation)`: `content` holds the
   whole map result except items (answers, also-raised with claims and makers, key points, angles, notes); `marks` is a
   plain array of mark codes. A third table **`core.map_position(run_id, answer_id, root_index, root_node_id, maker)`**
   records which root argued which answer, appended when the root is saved (map_choice is append-only and is written
   before the roots exist). P2c's `rootNodeId` comes from it.
5. **Reader home and forms.** `MapChoiceRepository` and the free functions `readMapChoiceForRun(pool, runId)` /
   `readMapItemsForRun(pool, runId)` live in `@debateai/map` (`packages/map/src/repository.ts`), not `@debateai/db`:
   a new `@debateai/db` export edits `packages/db/src/index.ts` and re-pins `NATIVE_MIGRATE_MODULE_SHA256`.
6. **Adaptive selection is made once, at the round-1 boundary.** The `deeperTopPoints` chains per position with the
   highest root leverage of their round-1 point are chosen there; every later round extends the same chains (a linear
   chain each, so P2a's `(d−1)·2·P·X` holds), and later boundaries apply ε/δ to them. Re-choosing chains later would
   need a node whose parent is decided at run time, which the plan-ordered recorders cannot hold.
7. **Map calls carry no `modelRole`** (the scorecard grades the seven jobs; map calls are none of them), contract hash
   = the sealed `mapContractHash`, role `JUDGE`, lane `served`, BODY spend phase, priority `OTHER` (unchanged
   `callPriorityOf`). Thinking step stays `"opening"` (already mapped by `previewThinkingStepOf` for `MAP:`): the map IS
   the opening (ruling S1), and a new step would change the thinking-table shape the owners just sealed. A separate
   `map` step can be added later without touching the runner.
8. **Scrutiny runs every planned round of its budget** (`roundsPerPoint` exchanges on each of at most `pointsPerDebate`
   nodes chosen once after the planned rounds); "up to" is honoured by stops, freezes and the node count, not by a
   per-round re-check. One `SCRUTINY-EXTENDED` record per scrutinised node (its exchange nodes in `affectedNodeIds`).

## Cross-plan changes

**P2a (settings and money) must absorb, in the same build:**

1. `DebateShapePolicy` gains a top-level member `mapStepBounds: { merge: int 2048..65536, choose: int 2048..65536 }`
   (start values `{ merge: 32768, choose: 32768 }`, ruling R-2), parsed strictly in `parseDebateShapePolicy`
   (`DEBATE_SHAPE_POLICY_INVALID:$.mapStepBounds.<k>`). `DebateShapeCeilingInput` gains `mapMergeBound: number` and
   `mapChooseBound: number` (copied by `resolveDebateShape`); `debateShapeReceiptSchema` gains `map_merge_bound` and
   `map_choose_bound` (ints ≥ 1); `debateShapeReceipt` / `debateShapeOfReceipt` carry them.
2. The preview estimate (`apps/api/src/preview-budget-estimate.ts`) prices the two sites `MAP:merge` and `MAP:choose`
   at `max(output.debate, map_merge_bound | map_choose_bound)` output tokens (a new `PreviewCallType` `"MAP_LONG"`; the
   other map sites stay `DEBATE`). The attempt ceiling and the per-role shares are unchanged.
3. Deviation 4's text: a failed list is handed to another seat under **its own key `MAP:list:<i>:2`** (P2b Task 1);
   the `2A + G + 3` formula is unchanged and now exact.
4. P2a's `PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2` is unchanged; P2b adds `mapContractHash` to the REQUIRED preview list
   `PREVIEW_SOURCE_ROW_KEYS_V2` (P2b Task 6 updates the pins).
5. P2b deletes `assertDebateShapeRunnerReady`, its call in `apps/runner/src/main.ts`, its test case in
   `tests/unit/debate-shape-policy.test.ts`, the stand-in export in `tests/integration/obs-l3-s06-runner-binding.test.ts`,
   and rewrites `tests/unit/debate-shape-runner-boot.test.ts` and the `deploy/vps/register/README.md` sentence (Task 6).

**P2c (what people see) must change:**

1. Task 5 Step 6 / L1667, L1681: `MapChoiceRepository` is imported from **`@debateai/map`**, not `@debateai/db`;
   `apps/api/package.json` gains `"@debateai/map": "workspace:*"`; `tools/orphan-audit/src/index.ts` apps/api row gains
   `"map"`. The gate grep (L35) finds `readMapChoiceForRun` in `packages/map/src/repository.ts`.
2. `readMapChoiceForRun(runId)` returns `MapChoiceRecord` (Task 8): `answers[]` has `statement` and
   `rootNodeId: string | null` (plus `answerId`, `rootIndex`, `maker`, `filled`); `alsoRaised[]` has `claim` and
   `makers` (plus `keyPointId`), most-raised first. P2c's `MapChoiceRecord` port is satisfied structurally.
3. Task 3 (L758–L941): the variable is **`debateShapeMap: MapResult | null`**, in scope at the story hook
   (`buildStoryRunSnapshot({`), null when the run has no shape or the map was unavailable. P2b changes the
   `@debateai/map` import line of `apps/runner/src/index.ts`; P2c adds `storyAlsoRaisedFrom` to it (textual merge).
4. Labels for the eight new marks (`apps/ui/lib/v3/labels.ts`, `debateChrome.condition.*` in every locale) and the
   `reportModel` `pointNote` cases are P2b's (Task 3); P2c adds none. The opposite-answer template in every site
   language and the synthesizer length sentence are P2b's (Tasks 2, 5).

**P2d (practice and proof) must change:**

1. Deviation 6 and Task 0 (L129–L134, L178–L196, L1076, L1141–L1148): the readers are exported from
   **`@debateai/map`** (`packages/map/src/repository.ts`), both as free functions `(pool, runId)` and as
   `MapChoiceRepository` methods; the gate grep path is `packages/map/src`.
2. Deviation 7 and the Task 0 gate "no `hashes.map` read" (L136, L195) are reversed by P2b: the runner (and
   `tools/preview-practice/practice-runner-composition.ts`, which P2b mirrors) reads the optional row `mapContractHash`
   and refuses to boot when a `debateShapePolicy` row is present without it. The practice throwaway register version
   must therefore ALSO supersede `judgeContractHash` and `composerContractHash` with the code's values and add
   `mapContractHash = mapPromptContractHash()` (throwaway database only; the copies come from
   `buildDevelopmentRunnerRegisterRows()`). This is a ruling for the P2d controller; P2b recommends yes.
3. The report counts: `SCRUTINY-EXTENDED` is one row per scrutinised node (L1216, L1786: "scrutinised points", not
   "extra exchanges"); `PANEL-CLOSE-CALL-EXTENDED` one row per extended node.
4. Task 6 (L1547, L1601): P2b's Task 15 already teaches `classifyGateRequest` a `"MAP"` kind (by `MAP_CONTRACT_IDS`)
   and the new judge contracts still classify as `"JUDGE"`; P2d reuses it instead of adding its own.
5. Reassigned lists use `MAP:list:<i>:2`; `practiceMapStepOf` reads the second segment, so it still counts as `list`.
6. The migration is `0116_debate_shape_map.sql` (renumbered at merge if the preview applied another 0116).

## File Structure

New files:

| File | Responsibility |
|---|---|
| `packages/map/src/opposite-templates.ts` | The code-owned opposite-answer template in every site language (Task 2) |
| `packages/map/src/repository.ts` | `MapChoiceRepository` + free readers: write/read `core.map_item`, `core.map_choice`, `core.map_position` (Task 8) |
| `migrations/0116_debate_shape_map.sql` | The three append-only map tables with encryption, attestation, erasure, TRUNCATE and mutation guards (Task 7) |
| `migrations/lineage/debate-shape-map-forward0116.json` | The forward-chain manifest (Task 7) |
| `packages/db/src/migration-forward0116.ts` | The forward-chain loader with its postcondition evidence (Task 7) |
| `packages/register/src/map-contract-hash.ts` | Optional row `mapContractHash`: reader and row builder (Task 6) |
| `apps/runner/src/debate-shape-boot.ts` | Boot resolution of the runner's shape settings (map hash check) (Task 6) |
| `apps/runner/src/map-stage.ts` | The runner's `MapCaller` adapter, per-step bounds, stop mapping, map mark records (Task 12) |
| `apps/runner/src/shape-plan.ts` | Pure: positions from the map (or today's opening), round-1 points, rivals, the breadth-first leg list, scrutiny slots (Task 9) |
| `apps/runner/src/shape-seats.ts` | Pure: distinct-maker seat order, root hand-over, writer choice (Task 9) |
| `apps/runner/src/shape-select.ts` | Pure: adaptive chain choice by root leverage, scrutiny need ranking, close-call extra seats (Tasks 10, 11) |
| `tests/support/debate-shape-harness.ts` | Shaped admission + scripted map answers for integration suites (Task 15) |
| `tests/unit/map-orchestrator-stops.test.ts`, `tests/unit/map-multilingual.test.ts`, `tests/unit/debate-shape-marks.test.ts`, `tests/unit/judge-shape-legs.test.ts`, `tests/unit/synthesizer-length.test.ts`, `tests/unit/debate-shape-boot.test.ts`, `tests/unit/shape-plan.test.ts`, `tests/unit/shape-select.test.ts`, `tests/unit/shape-close-call.test.ts`, `tests/unit/map-stage.test.ts`, `tests/architecture/debate-shape-map-0116-contract.test.ts` | Unit / architecture tests |
| `tests/integration/map-choice-repository.test.ts`, `tests/integration/debate-shape-run.test.ts`, `tests/integration/debate-shape-row-absent.test.ts` | Integration tests (embedded Postgres, one at a time) |

Modified files (main ones): `packages/map/src/{orchestrator,types,text,replies,keypoints,choose,index}.ts`,
`packages/map/package.json`, `packages/kernel/src/index.ts`, `packages/serve/src/{index,synthesis}.ts`,
`packages/judgement/src/{prompts,index}.ts`, `packages/crypto/src/index.ts` (`CONTENT_CARRIERS`),
`packages/db/src/{schema,migration-forward-chain}.ts`, `packages/register/src/index.ts`, `packages/register/src/debate-shape-policy.ts`
(delete the P2a guard), `apps/runner/src/{index,main,dev-deployment-register}.ts`, `apps/runner/package.json`,
`apps/ui/lib/v3/labels.ts`, `apps/ui/lib/report/reportModel.ts`, `apps/ui/messages/*/debateChrome.json`,
`acceptance/moment-tools.ts`, `deploy/preview-auth-dev/v1/publish-register-v2.ts`,
`tools/preview-practice/practice-runner-composition.ts`, `tools/orphan-audit/src/index.ts`,
`tests/support/{preview-gate-stubs,preview-debate-harness,shipped-corpus.manifest}.ts|txt`, and the pinned tests named in each task.

---

### Task 1: The map package answers the runner: STOPPED, abandon, codes kept, reassigned keys

**Files:**
- Modify: `packages/map/src/types.ts`, `packages/map/src/orchestrator.ts`
- Modify: `tests/unit/map-orchestrator.test.ts` (two reassigned-key expectations)
- Modify: `tools/preview-practice/practice-openings-log.ts` only if `tsc` shows a non-exhaustive use of `MapCallRecord["outcome"]`
- Create: `tests/unit/map-orchestrator-stops.test.ts`

**Interfaces:**

```ts
// types.ts
export const MAP_NOTES = Object.freeze(["LIST_REASSIGNED", "LIST_DROPPED", "MERGE_ITEMS_KEPT", "GAP_SKIPPED", "GAP_STOPPED", "MAP_STOPPED"] as const);
export type MapCallRecord = Readonly<{ /* as today */ outcome: "OK" | "FAILED" | "BUSY" | "STOPPED"; code: string | null }>;
export type MapResult = Readonly<{ /* as today */ stoppedBy: string | null }>;
// orchestrator.ts
export type MapCallOutcome<T> =
  | Readonly<{ kind: "OK"; value: T }> | Readonly<{ kind: "FAILED"; code: string }>
  | Readonly<{ kind: "BUSY"; code: string }> | Readonly<{ kind: "STOPPED"; code: string }>;
export type MapRunInput = Readonly<{ /* as today */ abandon?: (error: unknown) => boolean }>;
export function mapListCallSiteKey(listIndex: number, wave: 1 | 2): string;
export function mapErrorCodeOf(error: unknown): string;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/map-orchestrator-stops.test.ts
import { describe, expect, it } from "vitest";
import {
  mapErrorCodeOf, mapListCallSiteKey, mapRunAngleMap,
  type MapCallOutcome, type MapCallRequest, type MapCaller, type MapRunInput, type MapSeat
} from "@debateai/map";
import { TypedDomainError } from "@debateai/kernel";

const STOP = { finishReason: "stop" };
const why = "It matters for the riders.";
const SEATS = [0, 1, 2, 3].map((index): MapSeat => ({ aiRef: `ai-${String(index)}`, maker: `m${String(index)}` }));
const ANGLES = JSON.stringify({ angles: [
  { angle_id: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The case against." },
  { angle_id: "worry", kind: "ASKER_WORRY", label: "The worry", focus: "What the asker fears." },
  { angle_id: "do", kind: "PRACTICAL", label: "What to do", focus: "What to do first." },
  { angle_id: "cost", kind: "SPECIFIC", label: "The cost", focus: "Who pays." }] });
const LIST = (order: number) => JSON.stringify({ points: [
  { claim: `Point one, ${String(order)}.`, why_it_matters: why, leans: "against_some_answer" },
  { claim: `Point two, ${String(order)}.`, why_it_matters: why, leans: "for_some_answer" },
  { claim: `Point three, ${String(order)}.`, why_it_matters: why, leans: "context" }],
  candidate_answers: [order % 2 === 0 ? "Yes, with conditions." : "No, keep it as it is."] });

type Reply = string | MapCallOutcome<never> | Error;
function caller(script: (request: MapCallRequest<unknown>) => Reply): { caller: MapCaller; asked: string[] } {
  const asked: string[] = [];
  return { asked, caller: { async call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> {
    asked.push(request.callSiteKey);
    const reply = script(request as MapCallRequest<unknown>);
    if (reply instanceof Error) throw reply;
    if (typeof reply !== "string") return reply;
    return { kind: "OK", value: request.spec.read(reply, STOP) };
  } } };
}
const input = (c: MapCaller, extra: Partial<MapRunInput> = {}): MapRunInput => ({
  questionLine: "Should a city make its buses free?", languageName: "English", languageTag: "en", seats: SEATS,
  caller: c, seed: "s|C", gapRoundsMax: 2, maxAnswers: 3, pointsPerAnswer: 3, ...extra });

describe("map stops (Phase 2 runner contract)", () => {
  it("a STOPPED call stops the map: no later call is made, the code fallbacks finish it, the stop is recorded", async () => {
    const run = caller((request) => request.step === "ANGLES" ? ANGLES
      : request.step === "LIST" ? LIST(request.order)
      : request.step === "MERGE" ? { kind: "STOPPED", code: "RUN_COST_ENVELOPE_MONEY_REACHED" } : new Error("never asked"));
    const result = await mapRunAngleMap(input(run.caller));
    expect(run.asked).toEqual(["MAP:angles", "MAP:list:0", "MAP:list:1", "MAP:list:2", "MAP:list:3", "MAP:merge"]);
    expect(result.kind).toBe("MAP");
    expect(result.stoppedBy).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(result.marks.map((mark) => mark.mark)).toEqual(expect.arrayContaining(["MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK"]));
    expect(result.notes.map((note) => note.note)).toContain("MAP_STOPPED");
    expect(result.calls.at(-1)).toMatchObject({ callSiteKey: "MAP:merge", outcome: "STOPPED", code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
    expect(result.choice!.answers.length).toBeGreaterThanOrEqual(2);
  });

  it("a stop while lists run keeps the lists already paid for and reassigns nothing", async () => {
    const run = caller((request) => request.step === "ANGLES" ? ANGLES
      : request.callSiteKey === "MAP:list:1" ? { kind: "STOPPED", code: "CALL_LANE_STOPPED" }
      : request.step === "LIST" ? LIST(request.order) : new Error("never asked"));
    const result = await mapRunAngleMap(input(run.caller));
    expect(run.asked.filter((key) => key.endsWith(":2") && key.startsWith("MAP:list:"))).toEqual(["MAP:list:2"]);
    expect(run.asked).not.toContain("MAP:merge");
    expect(result.items.filter((item) => item.kind === "POINT")).toHaveLength(9);
    expect(result.stoppedBy).toBe("CALL_LANE_STOPPED");
  });

  it("a stop before two lists arrived ends in today's opening", async () => {
    const run = caller((request) => request.step === "ANGLES" ? { kind: "STOPPED", code: "PERSON_ALLOWANCE_REACHED" } : new Error("never"));
    const result = await mapRunAngleMap(input(run.caller));
    expect(run.asked).toEqual(["MAP:angles"]);
    expect(result.kind).toBe("UNAVAILABLE");
    expect(result.marks.map((mark) => mark.mark)).toEqual(["MAP_ANGLES_FALLBACK", "MAP_UNAVAILABLE_TODAYS_OPENING"]);
  });

  it("an error the caller marks as abandon is rethrown, never turned into a fallback", async () => {
    const lost = new TypedDomainError("RUNNER_CLAIM_LOST", "claim lost");
    const run = caller((request) => request.step === "ANGLES" ? ANGLES : lost);
    await expect(mapRunAngleMap(input(run.caller, { abandon: (error) => error === lost }))).rejects.toBe(lost);
  });

  it("a thrown typed error keeps its code; an untyped one is MAP_CALLER_THREW", async () => {
    expect(mapErrorCodeOf(new TypedDomainError("CALL_BUDGET_EXHAUSTED", "x"))).toBe("CALL_BUDGET_EXHAUSTED");
    expect(mapErrorCodeOf(new Error("boom"))).toBe("MAP_CALLER_THREW");
    expect(mapErrorCodeOf({ code: "lower case" })).toBe("MAP_CALLER_THREW");
  });

  it("a reassigned list is asked under its own key, after the first wave", async () => {
    expect(mapListCallSiteKey(2, 1)).toBe("MAP:list:2");
    expect(mapListCallSiteKey(2, 2)).toBe("MAP:list:2:2");
    const run = caller((request) => request.step === "ANGLES" ? ANGLES
      : request.callSiteKey === "MAP:list:2" ? { kind: "FAILED", code: "TEST_FAILED" }
      : request.step === "LIST" ? LIST(request.order) : { kind: "FAILED", code: "TEST_FAILED" });
    const result = await mapRunAngleMap(input(run.caller, { gapRoundsMax: 0 }));
    const lists = result.calls.filter((call) => call.step === "LIST").map((call) => `${call.callSiteKey}@${call.aiRef}`);
    expect(lists).toEqual(["MAP:list:0@ai-0", "MAP:list:1@ai-1", "MAP:list:2@ai-2", "MAP:list:3@ai-3", "MAP:list:2:2@ai-0"]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/map-orchestrator-stops.test.ts`
Expected: FAIL (`mapErrorCodeOf`/`mapListCallSiteKey` are not exported; `stoppedBy` undefined).

- [ ] **Step 3: Implement**

In `packages/map/src/types.ts`: add `"MAP_STOPPED"` at the end of `MAP_NOTES`; widen `MapCallRecord.outcome` to
`"OK" | "FAILED" | "BUSY" | "STOPPED"`; add `stoppedBy: string | null;` as the last member of `MapResult` with the doc
comment `/** The code of the stop (money, attempts, lane) that ended the map early; null when it ran to its end. */`.

In `packages/map/src/orchestrator.ts`:

```ts
/** The spec's list key; a list handed to another seat (spec §1.2) is asked under its own key, so each key is one task. */
export function mapListCallSiteKey(listIndex: number, wave: 1 | 2): string {
  return wave === 1 ? `MAP:list:${String(listIndex)}` : `MAP:list:${String(listIndex)}:2`;
}

/** The code a thrown caller error carries (a typed domain code), else MAP_CALLER_THREW. Never the error's message. */
export function mapErrorCodeOf(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,95}$/u.test(code) ? code : "MAP_CALLER_THREW";
}
```

Extend `MapCallOutcome<T>` with `| Readonly<{ kind: "STOPPED"; code: string }>` and `MapRunInput` with
`/** True for an error that ends the run (claim lost, time limit): rethrown, never a fallback. */ abandon?: (error: unknown) => boolean;`.

In `class MapRun` add `stoppedBy: string | null = null;` and replace `mapAsk` with:

```ts
  async mapAsk<T>(step: MapStep, callSiteKey: string, seat: MapSeat, shown: "BLIND" | readonly string[], spec: MapStepSpec<T>): Promise<T | null> {
    // A stop ends the map: nothing new is asked; what already arrived is kept, and the code's fallbacks finish it.
    if (this.stoppedBy !== null) return null;
    const order = this.#next;
    this.#next += 1;
    let outcome: MapCallOutcome<T>;
    try {
      outcome = await this.input.caller.call({ step, callSiteKey, seat, order, shown, spec });
    } catch (error) {
      if (this.input.abandon?.(error) === true) throw error;
      outcome = { kind: "FAILED", code: mapErrorCodeOf(error) };
    }
    this.calls.push(Object.freeze({ step, callSiteKey, aiRef: seat.aiRef, maker: seat.maker, order,
      shown: shown === "BLIND" ? "BLIND" : Object.freeze([...shown]), outcome: outcome.kind, code: outcome.kind === "OK" ? null : outcome.code }));
    if (outcome.kind === "BUSY") this.out.add(seat.aiRef);
    if (outcome.kind === "STOPPED" && this.stoppedBy === null) {
      this.stoppedBy = outcome.code;
      this.mapNote("MAP_STOPPED", step, outcome.code);
    }
    return outcome.kind === "OK" ? outcome.value : null;
  }
```

In `mapResult(parts)` add `stoppedBy: this.stoppedBy,` after `...parts,`. In `mapRunLists` take a wave:

```ts
function mapRunLists(run: MapRun, assignments: readonly MapListAssignment[], wave: 1 | 2): Promise<readonly MapListOutcome[]> {
  return Promise.all(assignments.map(async (assignment): Promise<MapListOutcome> => Object.freeze({
    assignment,
    reply: await run.mapAsk("LIST", mapListCallSiteKey(assignment.listIndex, wave), assignment.seat, "BLIND", mapListSpec(run.ctx, assignment.angle))
  })));
}
```

Call sites: `mapRunAngleMap` → `mapRunLists(run, mapListAssignments(...), 1)` and `mapRunLists(run, reassigned, 2)`;
`mapRunBlindLists` → `mapRunLists(run, assignments, 1)`. In `mapRunAngleMap`, skip the reassignment notes when the
map stopped: `const reassigned = run.stoppedBy === null ? mapReassignLists(failed, finished, run.out) : [];`.
The snowball keeps `MAP:list:<index>` (one wave). In `tests/unit/map-orchestrator.test.ts` change the two
expectations that filter `call.callSiteKey === "MAP:list:2"` to `call.callSiteKey.startsWith("MAP:list:2")` (lines
~141 and ~239: the reassigned call is now `MAP:list:2:2`). The "caller that throws" test (~179) stays green: a plain
`Error` still reads `MAP_CALLER_THREW`.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run tests/unit/map-orchestrator-stops.test.ts tests/unit/map-orchestrator.test.ts tests/unit/practice-openings.test.ts`
Expected: PASS. Then the light scoped typecheck: `pnpm exec tsc -p packages/map --noEmit` and
`pnpm exec tsc -p tools/preview-practice --noEmit` (if a `switch` over `outcome` is non-exhaustive, add the
`"STOPPED"` case counting it with `"FAILED"` in `practice-openings-log.ts` and re-run).

- [ ] **Step 5: Commit**

```bash
git add packages/map/src/types.ts packages/map/src/orchestrator.ts tests/unit/map-orchestrator-stops.test.ts tests/unit/map-orchestrator.test.ts tools/preview-practice
git commit -m "map: STOPPED outcome, abandon rethrow, typed codes kept, reassigned lists under MAP:list:<i>:2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The map in every language: primary subtags, non-Latin text, the gap guard, the opposite template

**Files:**
- Modify: `packages/map/src/text.ts`, `packages/map/src/replies.ts`, `packages/map/src/keypoints.ts`, `packages/map/src/choose.ts`, `packages/map/src/index.ts`
- Create: `packages/map/src/opposite-templates.ts`, `tests/unit/map-multilingual.test.ts`

**Interfaces:**

```ts
export function mapPrimarySubtag(tag: string): string;                       // "ro-RO" → "ro", "und" → "und"
export function mapNormaliseText(text: string): string;                       // marks stripped only after Latin letters
export const MAP_OPPOSITE_TEMPLATES: Readonly<Record<string, Readonly<{ lead: string; empty: string }>>>;
export function mapOppositeTemplate(statement: string, languageTag: string): string; // unknown language → English
// keypoints.ts: mapAddGapPoints throws TypedDomainError("MAP_GAP_ITEM_UNKNOWN") for a gap item not in `items` or not GAP
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/map-multilingual.test.ts
import { describe, expect, it } from "vitest";
import {
  MAP_OPPOSITE_TEMPLATES, mapAddGapPoints, mapNormaliseText, mapOppositeTemplate, mapPrimarySubtag, mapWrongLanguage,
  type MapPointItem
} from "@debateai/map";
import { readdirSync } from "node:fs";

const SITE_LOCALES = readdirSync(new URL("../../apps/ui/messages/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

describe("the map in every language", () => {
  it("compares primary subtags: a ro-RO question accepts Romanian text", () => {
    expect(mapPrimarySubtag("ro-RO")).toBe("ro");
    expect(mapPrimarySubtag("und")).toBe("und");
    expect(mapWrongLanguage("Autobuzele gratuite ar costa orașul foarte mult în fiecare an.", "ro-RO")).toBe(false);
  });

  it("keeps the vowel signs of non-Latin scripts and still folds Romanian diacritics", () => {
    expect(mapNormaliseText("Ș ș Ţ ţ")).toBe(mapNormaliseText("S s T t"));
    expect(mapNormaliseText("कि")).not.toBe(mapNormaliseText("क"));
    expect(mapNormaliseText("が")).not.toBe(mapNormaliseText("か"));
  });

  it("refuses a gap item that is not a GAP item of the map", () => {
    const item: MapPointItem = { itemId: "pt09", seat: { aiRef: "a", maker: "m" }, origin: "BLIND", angleId: null, angleKind: null,
      listIndex: 0, kind: "POINT", claim: "x", whyItMatters: "y", leans: "context" };
    expect(() => mapAddGapPoints({ keyPoints: [], mergedAnswers: [] }, [], [item])).toThrow(/MAP_GAP_ITEM_UNKNOWN/u);
    expect(() => mapAddGapPoints({ keyPoints: [], mergedAnswers: [] }, [item], [item])).toThrow(/MAP_GAP_ITEM_UNKNOWN/u);
  });

  it("has the opposite template in every site language, and English for anything else", () => {
    expect(Object.keys(MAP_OPPOSITE_TEMPLATES).sort()).toEqual(SITE_LOCALES);
    for (const [tag, { lead, empty }] of Object.entries(MAP_OPPOSITE_TEMPLATES)) {
      expect(lead.trim(), tag).not.toBe("");
      expect(empty.trim(), tag).not.toBe("");
      expect(`${lead} ${empty}`, tag).not.toMatch(/\d|score|grader|threshold|node/iu);
    }
    expect(mapOppositeTemplate("Da", "ro-RO")).toBe(`${MAP_OPPOSITE_TEMPLATES.ro!.lead}: Da`);
    expect(mapOppositeTemplate("", "xx")).toBe(MAP_OPPOSITE_TEMPLATES.en!.empty);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/map-multilingual.test.ts` — Expected: FAIL (`mapPrimarySubtag`, `MAP_OPPOSITE_TEMPLATES` missing).

- [ ] **Step 3: Implement**

`packages/map/src/text.ts`:

```ts
/** The primary language subtag ("ro-RO" → "ro"), lower case; "und" stays "und". */
export function mapPrimarySubtag(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/u)[0] ?? "und";
}

/**
 * The text a merge-by-rule compares: letters and digits only, lower case, single spaces. Combining marks are dropped
 * only after a LATIN letter (Romanian ș/ş and ț/ţ read alike); in other scripts a mark is part of the letter (Hindi
 * vowel signs, Japanese dakuten) and is kept. Used only to group identical claims; never shown to anyone.
 */
export function mapNormaliseText(text: string): string {
  return text.normalize("NFKD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").normalize("NFC")
    .toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

export function mapWrongLanguage(text: string, languageTag: string): boolean {
  const expected = mapPrimarySubtag(languageTag);
  if (expected === "und" || text.trim() === "") return false;
  const detected = detectArgumentLanguage(text);
  return detected.confidence === "high" && detected.tag !== "und" && mapPrimarySubtag(detected.tag) !== expected;
}
```

`packages/map/src/replies.ts` and `keypoints.ts`: wherever two texts are compared by `mapNormaliseText` (the
`MAP_ANSWER_DUPLICATE` check in `mapChooseCheck`, `mapCodeMerge`'s grouping, `mapAddGapPoints`' match), treat an EMPTY
normalised text as matching nothing (`const key = mapNormaliseText(x); if (key === "") /* its own group / no duplicate */`).

`mapAddGapPoints` (keypoints.ts) first line:

```ts
  const byId = mapItemsById(items);
  for (const item of gapItems) {
    const known = byId.get(item.itemId);
    if (known === undefined || known.kind !== "POINT" || known.origin !== "GAP") {
      throw new TypedDomainError("MAP_GAP_ITEM_UNKNOWN", `MAP_GAP_ITEM_UNKNOWN: ${item.itemId}`);
    }
  }
```

(import `TypedDomainError` from `@debateai/kernel`; the orchestrator already passes `allItems` holding the gap items).

`packages/map/src/opposite-templates.ts` — one entry per directory in `apps/ui/messages/` (the site locales; list them
with `ls apps/ui/messages`). The `en` and `ro` texts are Phase 1's, unchanged:

```ts
/**
 * The last way to name a second answer when the map offers no different one (ANSWERS_FILLED, source TEMPLATE): code-owned
 * user-facing text, one entry per site locale (apps/ui/messages/<locale>). `lead` precedes the first answer's statement;
 * `empty` stands alone when that statement is empty. No numbers, no engine words. Owner wording: option 1 of 3 (plan
 * "Owner steps").
 */
export const MAP_OPPOSITE_TEMPLATES: Readonly<Record<string, Readonly<{ lead: string; empty: string }>>> = Object.freeze({
  en: Object.freeze({ lead: "The opposite of this answer", empty: "An answer different from the one above" }),
  ro: Object.freeze({ lead: "Opusul acestui răspuns", empty: "Un răspuns diferit de cel de mai sus" })
  // …one entry for EVERY other directory in apps/ui/messages, translated in Step 3b.
});
```

**Step 3b (translations):** dispatch parallel Haiku translators (model `haiku`, effort `xhigh`) by language group, as
spec §3.2 does for UI strings: each gets the two English phrases, the meaning ("the opposite of the answer just named";
"an answer different from the one above"), the rule "plain words, no numbers", and returns `{ locale: { lead, empty } }`
for its group. Then one Opus (effort `high`) spot-check of the risky locales (ar, he, hi, ja, ko, zh*, th, vi, mt):
meaning, script, right-to-left text untouched. Paste the results into the table (keys sorted).

`packages/map/src/choose.ts`:

```ts
import { MAP_OPPOSITE_TEMPLATES } from "./opposite-templates.js";
import { mapPrimarySubtag } from "./text.js";

export function mapOppositeTemplate(statement: string, languageTag: string): string {
  const template = MAP_OPPOSITE_TEMPLATES[mapPrimarySubtag(languageTag)] ?? MAP_OPPOSITE_TEMPLATES.en!;
  return (statement.trim() === "" ? template.empty : `${template.lead}: ${statement.trim()}`).slice(0, MAP_LIMITS.claimMaxChars);
}
```

`packages/map/src/index.ts`: add `export * from "./opposite-templates.js";`. Add the new file to
`tests/support/shipped-corpus.manifest.txt`.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run tests/unit/map-multilingual.test.ts tests/unit/map-choose.test.ts tests/unit/map-keypoints.test.ts tests/unit/map-replies.test.ts tests/unit/map-orchestrator.test.ts`
Expected: PASS (existing `en`/`ro` template expectations are unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/map tests/unit/map-multilingual.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "map: primary-subtag language check, non-Latin normalisation, gap guard, opposite template in every site language

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Eight new condition marks with typed records, labels in every locale

**Files:**
- Modify: `packages/kernel/src/index.ts` (`CONDITION_MARKS`), `packages/serve/src/index.ts` (`ConditionMarkRecord["mark"]`, `REQUIRED_CONDITION_MARK_RECORDS`)
- Modify: `apps/ui/lib/v3/labels.ts`, `apps/ui/lib/report/reportModel.ts` (`pointNote`), `apps/ui/messages/*/debateChrome.json`
- Modify pins: `tests/unit/a16-backup-model-used-mark.test.ts:31`, `tests/unit/s14-live-projections.test.ts:43`, `tests/unit/dr174-resilience.test.ts:402`, `tests/unit/obs-l2-s02-registry.test.ts` (length 46), `acceptance/grok-relay.ts:126` (comment "46 members")
- Create: `tests/unit/debate-shape-marks.test.ts`

**Interfaces:**

```ts
export const DEBATE_SHAPE_MARKS = Object.freeze(["MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK",
  "MAP_UNAVAILABLE_TODAYS_OPENING", "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED", "PANEL-CLOSE-CALL-EXTENDED", "SCRUTINY-EXTENDED"] as const);
// packages/kernel/src/index.ts — the same eight strings inserted in CONDITION_MARKS right after "PANEL-DEGRADED-SINGLE-VOICE"
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/debate-shape-marks.test.ts
import { describe, expect, it } from "vitest";
import { CONDITION_MARKS, DEBATE_SHAPE_MARKS } from "@debateai/kernel";
import { MAP_MARKS } from "@debateai/map";
import { assertRequiredConditionMarkRecords, type ConditionMarkRecord } from "@debateai/serve";
import { conditionMarkLabel } from "../../apps/ui/lib/v3/labels.js";

const record = (mark: ConditionMarkRecord["mark"], scope: "answer" | "node"): ConditionMarkRecord => Object.freeze({
  mark, scope, subjectRef: "run-1", reason: `${mark}:TEST`, liftPath: null, servedRootRule: null, affectedNodeIds: [] });

describe("the debate shape's condition marks", () => {
  it("sit in the kernel list right after the panel marks, never in the DR-176 tail", () => {
    const at = CONDITION_MARKS.indexOf("PANEL-DEGRADED-SINGLE-VOICE");
    expect(CONDITION_MARKS.slice(at + 1, at + 1 + DEBATE_SHAPE_MARKS.length)).toEqual([...DEBATE_SHAPE_MARKS]);
    expect(CONDITION_MARKS.slice(-4)).toEqual(["HIDDEN-UNJUDGEABLE", "DERIVED-STANDING-UNREVIEWED", "HIDDEN-LOW-SCORE", "UNAUTHORED-BRANCH-HALTED"]);
    expect(CONDITION_MARKS).toHaveLength(46);
  });

  it("names every map mark the map package mints", () => {
    for (const mark of MAP_MARKS) expect(DEBATE_SHAPE_MARKS).toContain(mark);
  });

  it("each requires its typed record, both ways", () => {
    for (const mark of DEBATE_SHAPE_MARKS) {
      expect(() => assertRequiredConditionMarkRecords([mark], [])).toThrow(/CONDITION_MARK_RECORD_REQUIRED/u);
      expect(() => assertRequiredConditionMarkRecords([], [record(mark, "answer")])).toThrow(/CONDITION_MARK_RECORD_WITHOUT_MARK/u);
      expect(() => assertRequiredConditionMarkRecords([mark], [record(mark, mark.includes("EXTENDED") ? "node" : "answer")])).not.toThrow();
    }
  });

  it("has a distinct plain label with no internals", () => {
    const labels = DEBATE_SHAPE_MARKS.map((mark) => conditionMarkLabel(mark));
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label).not.toMatch(/\d|grader|threshold|dispersion|leverage|node|MAP_/iu);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/debate-shape-marks.test.ts` — Expected: FAIL (`DEBATE_SHAPE_MARKS` not exported).

- [ ] **Step 3: Implement**

`packages/kernel/src/index.ts`, after the line `"PANEL-DEGRADED-SINGLE-VOICE",`:

```ts
  // Debate shape (spec 2026-10-12 §3.3): the map's fallbacks and fills (answer scope) and the two extensions (node
  // scope: a close call that gained graders, a point that got scrutiny). Placed HERE, mid-list, never at the DR-176 tail.
  "MAP_ANGLES_FALLBACK",
  "MAP_MERGE_FALLBACK",
  "MAP_CHOOSE_FALLBACK",
  "MAP_UNAVAILABLE_TODAYS_OPENING",
  "ANSWERS_FILLED",
  "CHOOSE_QUOTA_FILLED",
  "PANEL-CLOSE-CALL-EXTENDED",
  "SCRUTINY-EXTENDED",
```

and after the `ConditionMark` type:

```ts
/** The debate shape's marks, in their CONDITION_MARKS order. */
export const DEBATE_SHAPE_MARKS = Object.freeze(["MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK",
  "MAP_UNAVAILABLE_TODAYS_OPENING", "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED", "PANEL-CLOSE-CALL-EXTENDED", "SCRUTINY-EXTENDED"] as const satisfies readonly ConditionMark[]);
export type DebateShapeMark = typeof DEBATE_SHAPE_MARKS[number];
```

`packages/serve/src/index.ts`: append `| DebateShapeMark` to `ConditionMarkRecord["mark"]` (import the type from
`@debateai/kernel`), and append the eight strings to `REQUIRED_CONDITION_MARK_RECORDS` with the comment
`// Debate shape: every map fallback/fill and every extension carries its typed record (answer scope for the map, node scope for the extensions).`

`apps/ui/lib/v3/labels.ts`, in `conditionMarkLabel`, after the `"PANEL-DEGRADED-SINGLE-VOICE"` case:

```ts
    case "MAP_ANGLES_FALLBACK": return t(catalog, "debateChrome.condition.mapAnglesFallback");
    case "MAP_MERGE_FALLBACK": return t(catalog, "debateChrome.condition.mapMergeFallback");
    case "MAP_CHOOSE_FALLBACK": return t(catalog, "debateChrome.condition.mapChooseFallback");
    case "MAP_UNAVAILABLE_TODAYS_OPENING": return t(catalog, "debateChrome.condition.mapUnavailable");
    case "ANSWERS_FILLED": return t(catalog, "debateChrome.condition.answersFilled");
    case "CHOOSE_QUOTA_FILLED": return t(catalog, "debateChrome.condition.chooseQuotaFilled");
    case "PANEL-CLOSE-CALL-EXTENDED": return t(catalog, "debateChrome.condition.closeCallExtended");
    case "SCRUTINY-EXTENDED": return t(catalog, "debateChrome.condition.scrutinyExtended");
```

`apps/ui/messages/en/debateChrome.json` under `condition` (owner wording: option 1; options 2 and 3 are in the
"Owner steps" list at the end of this plan):

```json
"mapAnglesFallback": "The angles to look from were set by a fixed rule",
"mapMergeFallback": "Similar points were grouped by a fixed rule",
"mapChooseFallback": "The answers to argue were picked by a fixed rule",
"mapUnavailable": "Each AI opened with its own answer",
"answersFilled": "A second answer was added so two answers were argued",
"chooseQuotaFilled": "A point was added so every side was heard",
"closeCallExtended": "More AIs graded this close call",
"scrutinyExtended": "This point was argued further"
```

Every other `apps/ui/messages/<locale>/debateChrome.json`: the same eight keys, translated by parallel Haiku
translators by language group + one Opus spot-check of the risky locales (as in Task 2 Step 3b).

`apps/ui/lib/report/reportModel.ts`, in the exhaustive `pointNote` switch: the eight new marks return `null` (the
map marks are answer-level and carry no node; the two extensions are engine detail the page shows through the label
only), added beside the other `return null` answer-level cases.

Pins: bump the CONDITION_MARKS length pins from 38 to 46 in the four tests named above and the comment in
`acceptance/grok-relay.ts`. Do not touch any `slice(-4)` expectation.

- [ ] **Step 4: Run — expect PASS**

Run (one after another): `pnpm exec vitest run tests/unit/debate-shape-marks.test.ts tests/unit/a16-backup-model-used-mark.test.ts tests/unit/s14-live-projections.test.ts tests/unit/dr174-resilience.test.ts tests/unit/obs-l2-s02-registry.test.ts tests/unit/v2ui-data-layer.test.ts tests/unit/story-i18n.test.ts`
Expected: PASS. Then the i18n parity unit test the repo has for message files (`pnpm exec vitest run tests/unit -t "debateChrome"` limited to the files it lists).

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/index.ts packages/serve/src/index.ts apps/ui acceptance/grok-relay.ts tests/unit
git commit -m "kernel: eight debate-shape condition marks mid-list, required typed records, labels in every locale

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The judge learns `assigned-root` and the `consideration` variant; the judge hash grows

**Files:**
- Modify: `packages/judgement/src/prompts.ts`, `packages/judgement/src/index.ts`
- Modify: `acceptance/moment-tools.ts` (~234: contract-id parse), `tests/unit/prompt-text-pins.test.ts`, `tests/unit/a13-model-role.test.ts`
- Modify hash pins: `tests/unit/hs-s01-seal.test.ts:45`, `tests/unit/f-sealedrows-a-conformance-extractor.test.ts:95-96`, `acceptance/seed-register.test.ts:45`
- Create: `tests/unit/judge-shape-legs.test.ts`

**Interfaces:**

```ts
export const JUDGE_LEG_KINDS = ["primary-root", "independent-root", "support", "attack", "cross-root", "assigned-root"] as const;
export const JUDGE_LEG_KINDS_V1 = ["primary-root", "independent-root", "support", "attack", "cross-root"] as const;
export const JUDGE_CONSIDERATION_SENTENCE = "Build your reply on the consideration named in consideration.";
export const JUDGE_LEG_CONSIDERATION_MATERIAL_FIELDS: Readonly<Record<"support" | "attack", readonly string[]>>;
export function judgeConsiderationPromptContract(leg: "support" | "attack", claimType: keyof typeof JUDGE_CLAIM_TYPE_INSTRUCTIONS): PromptContract;
export const JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1: string;   // today's text, frozen
export const JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT: string;      // V1 + "\n---\n" + the six new contracts
export type JudgeLeg =
  | { readonly kind: "primary-root" } | { readonly kind: "independent-root" }
  | { readonly kind: "assigned-root"; readonly assignedAnswer: string; readonly mapPoints: string }
  | { readonly kind: "support" | "attack"; readonly positionUnderDebate: string; readonly consideration?: string }
  | { readonly kind: "cross-root"; readonly ownPosition: string; readonly otherMakersPosition: string };
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/judge-shape-legs.test.ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readPromptFrame, promptContractFingerprintText } from "@debateai/providers";
import {
  JUDGE_CONSIDERATION_SENTENCE, JUDGE_LEG_KINDS, JUDGE_LEG_MATERIAL_FIELDS, JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT,
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1, judgeConsiderationPromptContract, judgeLegModelRole, judgePromptContract,
  framedJudgePromptForTest, type JudgeLeg
} from "@debateai/judgement";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
/** Today's sealed judge hash (register v11+): the V1 text must still produce it, byte for byte. */
const TODAY_JUDGE_HASH = "e7f7e4b0e7066fb2b873c4435b2bd593a0a399f8de506604c35b92222fdb1365";

describe("judge legs for the debate shape", () => {
  it("today's five legs, review and panel are byte-identical: the V1 fingerprint is today's sealed hash", () => {
    expect(sha(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1)).toBe(TODAY_JUDGE_HASH);
    expect(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT.startsWith(`${JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1}\n---\n`)).toBe(true);
  });

  it("appends exactly the six new contracts to the fingerprint", () => {
    const tail = JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT.slice(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1.length + 5);
    expect(tail).toBe([
      promptContractFingerprintText(judgePromptContract("assigned-root", "unknown")),
      promptContractFingerprintText(judgePromptContract("assigned-root", "resolved")),
      promptContractFingerprintText(judgeConsiderationPromptContract("support", "unknown")),
      promptContractFingerprintText(judgeConsiderationPromptContract("support", "resolved")),
      promptContractFingerprintText(judgeConsiderationPromptContract("attack", "unknown")),
      promptContractFingerprintText(judgeConsiderationPromptContract("attack", "resolved"))
    ].join("\n---\n"));
  });

  it("assigned-root sends question_line, assigned_answer, map_points, and is a POSITION job", () => {
    expect(JUDGE_LEG_KINDS).toContain("assigned-root");
    expect(JUDGE_LEG_MATERIAL_FIELDS["assigned-root"]).toEqual(["question_line", "assigned_answer", "map_points"]);
    const leg: JudgeLeg = { kind: "assigned-root", assignedAnswer: "Yes, with conditions.", mapPoints: "{\"for\":[],\"against\":[]}" };
    const frame = readPromptFrame(framedJudgePromptForTest(leg, "Q?", "English", "unknown").packet);
    expect(frame.contractId).toBe("judge.assigned-root.unknown.v1");
    expect(frame.fields.map((field) => field.name)).toEqual(["question_line", "assigned_answer", "map_points"]);
    expect(judgeLegModelRole(leg)).toBe("POSITION");
  });

  it("a support leg WITHOUT a consideration frames exactly as today; WITH one it uses the variant", () => {
    const plain = readPromptFrame(framedJudgePromptForTest({ kind: "support", positionUnderDebate: "P" }, "Q?", "English", "unknown").packet);
    expect(plain.contractId).toBe("judge.support.unknown.v1");
    expect(plain.fields.map((field) => field.name)).toEqual(["question_line", "position_under_debate"]);
    const withPoint = readPromptFrame(framedJudgePromptForTest({ kind: "attack", positionUnderDebate: "P", consideration: "Cost" }, "Q?", "English", "unknown").packet);
    expect(withPoint.contractId).toBe("judge.attack.consideration.unknown.v1");
    expect(withPoint.fields.map((field) => [field.name, field.content])).toEqual([["question_line", "Q?"], ["position_under_debate", "P"], ["consideration", "Cost"]]);
    expect(judgeConsiderationPromptContract("attack", "unknown").instruction).toContain(JUDGE_CONSIDERATION_SENTENCE);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/judge-shape-legs.test.ts` — Expected: FAIL (new exports missing).

- [ ] **Step 3: Implement**

`packages/judgement/src/prompts.ts` (replace lines ~96–123 and ~192–199):

```ts
/** Today's five legs, frozen: the V1 fingerprint is built from them only, so today's sealed hash is reproducible. */
export const JUDGE_LEG_KINDS_V1 = ["primary-root", "independent-root", "support", "attack", "cross-root"] as const;
export const JUDGE_LEG_KINDS = [...JUDGE_LEG_KINDS_V1, "assigned-root"] as const;
export type JudgeLegKind = typeof JUDGE_LEG_KINDS[number];

export const JUDGE_LEG_DIRECTIVES: Readonly<Record<JudgeLegKind, string>> = Object.freeze({
  /* the five existing entries, byte for byte */
  "assigned-root": "Author the strongest case for the answer named in assigned_answer."
});

export const JUDGE_LEG_MATERIAL_FIELDS: Readonly<Record<JudgeLegKind, readonly string[]>> = Object.freeze({
  /* the five existing entries, byte for byte */
  "assigned-root": Object.freeze(["question_line", "assigned_answer", "map_points"])
});

/** Debate shape (spec §3.3 step 3): a reply built on one chosen map point. A variant contract, so today's legs keep their bytes. */
export const JUDGE_CONSIDERATION_SENTENCE = "Build your reply on the consideration named in consideration.";
export const JUDGE_LEG_CONSIDERATION_MATERIAL_FIELDS: Readonly<Record<"support" | "attack", readonly string[]>> = Object.freeze({
  support: Object.freeze(["question_line", "position_under_debate", "consideration"]),
  attack: Object.freeze(["question_line", "position_under_debate", "consideration"])
});

export function judgeConsiderationPromptContract(
  leg: "support" | "attack",
  claimType: keyof typeof JUDGE_CLAIM_TYPE_INSTRUCTIONS
): PromptContract {
  return Object.freeze({
    contractId: `judge.${leg}.consideration.${claimType}.v1`,
    instruction: [`${JUDGE_LEG_DIRECTIVES[leg]} ${JUDGE_CONSIDERATION_SENTENCE}`, JUDGE_INSTRUCTIONS, JUDGE_CLAIM_TYPE_INSTRUCTIONS[claimType]].join(" "),
    answerForm: JUDGE_ANSWER_FORM
  });
}

/** Today's sealed text (register judgeContractHash e7f7e4b0…), frozen: never edited. */
export const JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1: string = [
  ...JUDGE_LEG_KINDS_V1.flatMap((leg) => ([
    promptContractFingerprintText(judgePromptContract(leg, "unknown")),
    promptContractFingerprintText(judgePromptContract(leg, "resolved"))
  ])),
  promptContractFingerprintText(reviewPromptContract(0)),
  promptContractFingerprintText(PANEL_PROMPT_CONTRACT)
].join("\n---\n");

/** What the register seals now: V1, then the debate shape's six contracts. A change is a new register version. */
export const JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT: string = [
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1,
  ...(["unknown", "resolved"] as const).map((claim) => promptContractFingerprintText(judgePromptContract("assigned-root", claim))),
  ...(["support", "attack"] as const).flatMap((leg) => (["unknown", "resolved"] as const)
    .map((claim) => promptContractFingerprintText(judgeConsiderationPromptContract(leg, claim))))
].join("\n---\n");
```

`packages/judgement/src/index.ts`: widen `JudgeLeg` as in Interfaces; in `judgeLegMaterial` add the two branches and
pick the declared table:

```ts
  const fields = leg.kind === "cross-root"
    ? [ /* unchanged */ ]
    : leg.kind === "assigned-root"
      ? [
          { name: "question_line", content: questionLine },
          { name: "assigned_answer", content: leg.assignedAnswer },
          { name: "map_points", content: leg.mapPoints }
        ]
      : leg.kind === "support" || leg.kind === "attack"
        ? [
            { name: "question_line", content: questionLine },
            { name: "position_under_debate", content: leg.positionUnderDebate },
            ...(leg.consideration === undefined ? [] : [{ name: "consideration", content: leg.consideration }])
          ]
        : [{ name: "question_line", content: questionLine }];
  const declared = (leg.kind === "support" || leg.kind === "attack") && leg.consideration !== undefined
    ? JUDGE_LEG_CONSIDERATION_MATERIAL_FIELDS[leg.kind]
    : JUDGE_LEG_MATERIAL_FIELDS[leg.kind as JudgeLegKind];
```

In `framedJudgePrompt` choose the contract:

```ts
  const contract = (leg.kind === "support" || leg.kind === "attack") && leg.consideration !== undefined
    ? judgeConsiderationPromptContract(leg.kind, claim)
    : judgePromptContract(leg.kind, claim);
  return buildFramedPrompt({
    contract: promptContractInArgumentLanguage(contract, argumentLanguageName),
    material: judgeLegMaterial(leg, questionLine)
  });
```

and export a test seam `export const framedJudgePromptForTest = framedJudgePrompt;` (the name says what it is for; it is
the same function the gateway call frames). `judgeLegModelRole`: add `case "assigned-root":` under the
`"independent-root"` case (POSITION). `firstPositionCallProjections` is unchanged: in a shaped run the first billed
call is `MAP:angles`, whose request is smaller than a primary-root request at the same question size, and root 0's own
call stays the one `firstCallCeilingFailure` guards.

`acceptance/moment-tools.ts` ~234: parse `/^judge\.([a-z-]+)(\.consideration)?\.(?:unknown|resolved)\.v1$/u`; rebuild
`assigned-root` from `assigned_answer`/`map_points` and a consideration variant from `consideration` (same pattern as
the existing cross-root rebuild). `tests/unit/prompt-text-pins.test.ts`: add the `assigned-root` directive pin and the
consideration sentence pin. `tests/unit/a13-model-role.test.ts`: add `["assigned-root", "POSITION"]`.

Hash pins: print the new hash with
`pnpm exec tsx -e 'import {createHash} from "node:crypto"; import {JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT as t} from "@debateai/judgement"; console.log(createHash("sha256").update(t).digest("hex"))'`
and use it: in `tests/unit/hs-s01-seal.test.ts` the R7-a row keeps `before = "3c9c32a6…"`/`after = "e7f7e4b0…"` but
computes `now` from `JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1`; add an R7-b row `["judgeContractHash (debate shape)",
() => sha256(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT), "e7f7e4b0…", "<printed hash>"]`. Replace `e7f7e4b0…` by the
printed hash in `f-sealedrows-a-conformance-extractor.test.ts` and `acceptance/seed-register.test.ts` (both read the
CURRENT sealed value of a freshly built register).

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run tests/unit/judge-shape-legs.test.ts tests/unit/prompt-text-pins.test.ts tests/unit/a13-model-role.test.ts tests/unit/hs-s01-seal.test.ts tests/unit/f-sealedrows-a-conformance-extractor.test.ts tests/unit/prompt-injection-corpus.test.ts tests/unit/a18-moment-tools.test.ts`
then `pnpm exec vitest run acceptance/seed-register.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/judgement acceptance tests/unit
git commit -m "judgement: assigned-root leg and consideration variant; judge fingerprint = frozen V1 + six shape contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The answer length: the synthesizer's length variant and the writer bound

**Files:**
- Modify: `packages/serve/src/synthesis.ts` (new contract + fingerprint text), `apps/runner/src/index.ts` (`buildSynthesisRolePrompt`), `apps/runner/src/dev-deployment-register.ts` (`composerContractHash` digest)
- Modify hash pins: every test that compares `composerContractHash` to `digest(promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT))` or to its hex (find with `grep -rn "SYNTHESIZER_PROMPT_CONTRACT\b" tests acceptance` and `grep -rn "composerContractHash" tests/unit acceptance | grep -E "[0-9a-f]{64}"`)
- Create: `tests/unit/synthesizer-length.test.ts`

**Interfaces:**

```ts
// packages/serve/src/synthesis.ts
export const SYNTHESIZER_LENGTH_CONTRACT_ID = "serve.synthesizer.length.v1" as const;
export const SYNTHESIZER_LENGTH_SENTENCE: string;
export const SYNTHESIZER_LENGTH_PROMPT_CONTRACT: PromptContract;
export const SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT: string;      // fp(v2) + "\n---\n" + fp(length.v1)
export function synthesizerAnswerLengthField(words: number): Readonly<{ name: "answer_length"; content: string }>;
// apps/runner/src/index.ts
export function buildSynthesisRolePrompt(request: SynthesizerRequest | EvaluatorRequest, argumentLanguageName: string,
  randomBytes?: (size: number) => Buffer, answerWords?: number | null): FramedPrompt;
export function shapeWriterBound(bound: CallBound, writerBound: number | null): CallBound;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/synthesizer-length.test.ts
import { describe, expect, it } from "vitest";
import { promptContractFingerprintText, readPromptFrame } from "@debateai/providers";
import {
  SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT, SYNTHESIZER_LENGTH_PROMPT_CONTRACT, SYNTHESIZER_LENGTH_SENTENCE, SYNTHESIZER_PROMPT_CONTRACT,
  buildSynthesizerRequest
} from "@debateai/serve";
import { buildSynthesisRolePrompt, shapeWriterBound } from "../../apps/runner/src/index.js";
import { synthesisRequestFixture } from "../support/synthesisRequestFixture.js";

describe("the answer length (spec §3.3 step 8)", () => {
  it("without a length the writer's prompt is today's, byte for byte", () => {
    const request = synthesisRequestFixture();
    const fixed = () => Buffer.alloc(16, 7);
    const today = buildSynthesisRolePrompt(request, "English", fixed);
    expect(buildSynthesisRolePrompt(request, "English", fixed, null).packet).toEqual(today.packet);
    expect(readPromptFrame(today.packet).contractId).toBe("serve.synthesizer.v2");
  });

  it("with a length it uses the length variant and adds answer_length last", () => {
    const frame = readPromptFrame(buildSynthesisRolePrompt(synthesisRequestFixture(), "English", undefined, 700).packet);
    expect(frame.contractId).toBe("serve.synthesizer.length.v1");
    expect(frame.fields.at(-1)).toEqual({ name: "answer_length", content: "about 700 words" });
    expect(SYNTHESIZER_LENGTH_PROMPT_CONTRACT.instruction).toBe(`${SYNTHESIZER_PROMPT_CONTRACT.instruction} ${SYNTHESIZER_LENGTH_SENTENCE}`);
    expect(SYNTHESIZER_LENGTH_SENTENCE).not.toMatch(/\d/u);
  });

  it("the composer fingerprint is v2 then the length variant", () => {
    expect(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT).toBe([
      promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT),
      promptContractFingerprintText(SYNTHESIZER_LENGTH_PROMPT_CONTRACT)].join("\n---\n"));
  });

  it("the writer bound is the larger of the sealed bound and the length's bound", () => {
    const sealed = { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 };
    expect(shapeWriterBound(sealed, null)).toBe(sealed);
    expect(shapeWriterBound(sealed, 12_288)).toEqual({ ...sealed, tokenCeiling: 12_288 });
    expect(shapeWriterBound({ ...sealed, tokenCeiling: 20_000 }, 8_192).tokenCeiling).toBe(20_000);
  });
});
```

Create `tests/support/synthesisRequestFixture.ts` only if no existing helper builds a `SynthesizerRequest` (search
`grep -rln "buildSynthesizerRequest(" tests/unit | head -3` first and reuse that file's builder by exporting it). The
fixture calls `buildSynthesizerRequest({ controls, round: 1, digest, codeLabel, prior: null })` with the smallest
digest those tests already use.

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/synthesizer-length.test.ts` — Expected: FAIL (exports missing).

- [ ] **Step 3: Implement**

`packages/serve/src/synthesis.ts`, after `SYNTHESIZER_PROMPT_CONTRACT`:

```ts
/**
 * Debate shape (spec §3.3 step 8): the answer length. A VARIANT of v2 — v2's instruction, then one sentence; the
 * target arrives as the material field `answer_length` ("about N words"). A run without a shape never sends it, so
 * its writer prompt is v2's to the byte. Sealed with v2 by `composerContractHash` (SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT).
 */
export const SYNTHESIZER_LENGTH_CONTRACT_ID = "serve.synthesizer.length.v1" as const;
export const SYNTHESIZER_LENGTH_SENTENCE = "Write the answer in about the number of words named in answer_length; "
  + "it is a target, never a reason to leave out a point the answer needs.";
export const SYNTHESIZER_LENGTH_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: SYNTHESIZER_LENGTH_CONTRACT_ID,
  instruction: `${SYNTHESIZER_INSTRUCTIONS} ${SYNTHESIZER_LENGTH_SENTENCE}`,
  answerForm: SYNTHESIZER_ANSWER_FORM
});
export const SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT: string = [
  promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT),
  promptContractFingerprintText(SYNTHESIZER_LENGTH_PROMPT_CONTRACT)
].join("\n---\n");
export function synthesizerAnswerLengthField(words: number): Readonly<{ name: "answer_length"; content: string }> {
  if (!Number.isSafeInteger(words) || words < 1) throw new TypeError("SYNTHESIZER_ANSWER_LENGTH_INVALID");
  return Object.freeze({ name: "answer_length", content: `about ${String(words)} words` });
}
```

(import `promptContractFingerprintText` from `@debateai/providers` if the file does not already.)

`apps/runner/src/index.ts`:

```ts
export function buildSynthesisRolePrompt(
  request: SynthesizerRequest | EvaluatorRequest,
  argumentLanguageName: string,
  randomBytes?: (size: number) => Buffer,
  answerWords: number | null = null
): FramedPrompt {
  const lengthed = request.role === "SYNTHESIZER" && answerWords !== null;
  return buildFramedPrompt({
    contract: promptContractInArgumentLanguage(
      request.role === "SYNTHESIZER" ? (lengthed ? SYNTHESIZER_LENGTH_PROMPT_CONTRACT : SYNTHESIZER_PROMPT_CONTRACT) : EVALUATOR_PROMPT_CONTRACT,
      argumentLanguageName
    ),
    material: lengthed ? [...toSynthesisPromptMaterial(request), synthesizerAnswerLengthField(answerWords)] : toSynthesisPromptMaterial(request),
    ...(randomBytes === undefined ? {} : { randomBytes })
  });
}

/** Spec §3.3 step 8: the writer's call bound is max(sealed bound, the answer length's writerBound). Null: the sealed bound itself. */
export function shapeWriterBound(bound: CallBound, writerBound: number | null): CallBound {
  if (writerBound === null || writerBound <= bound.tokenCeiling) return bound;
  return Object.freeze({ ...bound, tokenCeiling: writerBound });
}
```

`apps/runner/src/dev-deployment-register.ts`: `composerContractHash: digest(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT),`
(import it beside `SYNTHESIZER_PROMPT_CONTRACT`). Wiring into the writer call is Task 14. Print the new composer hash
(`pnpm exec tsx -e '…digest of SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT…'`) and replace the old value in the pins found above;
in `tests/unit/hs-s01-seal.test.ts` add a row for `composerContractHash (answer length)` with before = today's value,
after = the printed one, computed from `SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT` (today's row keeps computing from
`promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT)`).

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run tests/unit/synthesizer-length.test.ts tests/unit/hs-s01-seal.test.ts` and every test file the grep in "Files" named. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/serve/src/synthesis.ts apps/runner/src/index.ts apps/runner/src/dev-deployment-register.ts tests
git commit -m "serve: answer-length variant of the writer contract, sealed with v2; shapeWriterBound

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The register and the boot: `mapContractHash`, the shape settings, the P2a guard removed

**Files:**
- Create: `packages/register/src/map-contract-hash.ts`, `apps/runner/src/debate-shape-boot.ts`, `tests/unit/debate-shape-boot.test.ts`
- Modify: `packages/register/src/index.ts` (export), `packages/register/src/debate-shape-policy.ts` (delete `assertDebateShapeRunnerReady`)
- Modify: `apps/runner/src/dev-deployment-register.ts` (`computeDevelopmentContractRows` emits `mapContractHash`), `apps/runner/package.json` (`"@debateai/map": "workspace:*"`), `tools/orphan-audit/src/index.ts` (apps/runner row gains `"map"`)
- Modify: `apps/runner/src/main.ts`, `tools/preview-practice/practice-runner-composition.ts`, `apps/runner/src/index.ts` (`WalkingSkeletonSettings.debateShape`)
- Modify: `deploy/preview-auth-dev/v1/publish-register-v2.ts` (`PREVIEW_SOURCE_ROW_KEYS_V2` += `"mapContractHash"`), `deploy/preview-auth-dev/v1/README.md` ("68 keys")
- Modify pins: `tests/unit/preview-register-publish-v2.test.ts:63-64,113,147` (67→68 keys, 69→70 rows), `tests/integration/dev-deployment-register.test.ts:749,881` (key lists), `tests/unit/debate-shape-runner-boot.test.ts` (rewritten), `tests/unit/debate-shape-policy.test.ts` (delete the P2a guard case), `tests/integration/obs-l3-s06-runner-binding.test.ts` (~538: stand-in `export function readDebateShapePolicy() {} export function readMapContractHash() {}`), `deploy/vps/register/README.md` (the optional-member sentence)

**Interfaces:**

```ts
// packages/register/src/map-contract-hash.ts
export const MAP_CONTRACT_HASH_ROW_KEY = "mapContractHash" as const;
export function parseMapContractHash(value: unknown): string;                      // TypeError("MAP_CONTRACT_HASH_INVALID")
export async function readMapContractHash(pool: Pick<Pool, "query">, registerVersion: number): Promise<string | null>;
// apps/runner/src/debate-shape-boot.ts
export type DebateShapeRunnerSettings = Readonly<{ mapContractHash: string }>;
export function resolveDebateShapeRunnerSettings(input: Readonly<{
  policy: DebateShapePolicy | null; mapContractHash: string | null; codeMapContractHash: string;
}>): DebateShapeRunnerSettings | null;
// apps/runner/src/index.ts, WalkingSkeletonSettings
readonly debateShape?: DebateShapeRunnerSettings | null;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/debate-shape-boot.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapPromptContractHash } from "@debateai/map";
import { debateShapePolicyStartValues, parseMapContractHash } from "@debateai/register";
import { resolveDebateShapeRunnerSettings } from "../../apps/runner/src/debate-shape-boot.js";
import { buildDevelopmentRunnerRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";

const code = mapPromptContractHash();
const policy = debateShapePolicyStartValues();

describe("the runner's boot with the debate shape", () => {
  it("no row: today's runner, whatever the map hash row says", () => {
    expect(resolveDebateShapeRunnerSettings({ policy: null, mapContractHash: null, codeMapContractHash: code })).toBeNull();
    expect(resolveDebateShapeRunnerSettings({ policy: null, mapContractHash: "0".repeat(64), codeMapContractHash: code })).toBeNull();
  });

  it("a row needs the sealed map hash, equal to the code's", () => {
    expect(resolveDebateShapeRunnerSettings({ policy, mapContractHash: code, codeMapContractHash: code })).toEqual({ mapContractHash: code });
    expect(() => resolveDebateShapeRunnerSettings({ policy, mapContractHash: null, codeMapContractHash: code })).toThrow(/DEBATE_SHAPE_MAP_HASH_UNSEALED/u);
    expect(() => resolveDebateShapeRunnerSettings({ policy, mapContractHash: "f".repeat(64), codeMapContractHash: code })).toThrow(/MAP_CONTRACT_HASH_MISMATCH/u);
  });

  it("the row value is a 64-hex string", () => {
    expect(parseMapContractHash(code)).toBe(code);
    expect(() => parseMapContractHash("not-a-hash")).toThrow(/MAP_CONTRACT_HASH_INVALID/u);
  });

  it("the dev register seals the code's map hash", async () => {
    const rows = await buildDevelopmentRunnerRegisterRows();
    expect(rows.find((row) => row.rowKey === "mapContractHash")?.value).toBe(code);
  });

  it("main.ts and the practice runner read both rows and no longer carry the Phase 2a guard", () => {
    for (const file of ["apps/runner/src/main.ts", "tools/preview-practice/practice-runner-composition.ts"]) {
      const text = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      expect(text, file).toContain("readDebateShapePolicy(pool, environment.REGISTER_VERSION)");
      expect(text, file).toContain("readMapContractHash(pool, environment.REGISTER_VERSION)");
      expect(text, file).not.toContain("assertDebateShapeRunnerReady");
    }
  });
});
```

(If `practice-runner-composition.ts` names its pool or environment differently, the assertion uses its own names — read
the file's existing `readCallConcurrencyPolicy(` line and mirror its argument names.)

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/debate-shape-boot.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`packages/register/src/map-contract-hash.ts`:

```ts
import type { Pool } from "pg";

/**
 * Debate shape (spec §4): the map's prompt contracts, sealed. ONE optional row in its own family: never a
 * register.required_row, so every older version keeps parsing and reads ABSENT. The runner requires it only when the
 * register also seals a debateShapePolicy row, and refuses to boot when it differs from the code's fingerprint.
 */
export const MAP_CONTRACT_HASH_ROW_KEY = "mapContractHash" as const;

export function parseMapContractHash(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) throw new TypeError("MAP_CONTRACT_HASH_INVALID");
  return value;
}

export async function readMapContractHash(pool: Pick<Pool, "query">, registerVersion: number): Promise<string | null> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, MAP_CONTRACT_HASH_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : parseMapContractHash(row.value_json);
}
```

Export it from `packages/register/src/index.ts`. Delete `assertDebateShapeRunnerReady` from
`packages/register/src/debate-shape-policy.ts` and its export line.

`apps/runner/src/debate-shape-boot.ts`:

```ts
import { TypedDomainError } from "@debateai/kernel";
import type { DebateShapePolicy } from "@debateai/register";

/** What a runner needs to argue the debate shape, resolved once at boot. */
export type DebateShapeRunnerSettings = Readonly<{ mapContractHash: string }>;

/**
 * Spec §3.1 / §4: no debateShapePolicy row — today's runner (null). A row — the sealed mapContractHash must be present
 * and equal the code's fingerprint, or the boot refuses: a map call must never be stamped with a hash that does not
 * describe what it sends.
 */
export function resolveDebateShapeRunnerSettings(input: Readonly<{
  policy: DebateShapePolicy | null; mapContractHash: string | null; codeMapContractHash: string;
}>): DebateShapeRunnerSettings | null {
  if (input.policy === null) return null;
  if (input.mapContractHash === null) {
    throw new TypedDomainError("DEBATE_SHAPE_MAP_HASH_UNSEALED", "The register seals a debateShapePolicy row without its mapContractHash row");
  }
  if (input.mapContractHash !== input.codeMapContractHash) {
    throw new TypedDomainError("MAP_CONTRACT_HASH_MISMATCH", "The register's mapContractHash is not this runner's map contracts");
  }
  return Object.freeze({ mapContractHash: input.mapContractHash });
}
```

`apps/runner/src/dev-deployment-register.ts`, in `computeDevelopmentContractRows`'s `values`:
`mapContractHash: mapPromptContractHash(),` (import from `@debateai/map`).

`apps/runner/src/main.ts`: replace P2a's line `assertDebateShapeRunnerReady(await readDebateShapePolicy(pool, environment.REGISTER_VERSION));` with

```ts
/**
 * Debate shape (spec 2026-10-12 §3.1, §4): the optional row (absent = today's shape, byte for byte; malformed = boot
 * refused, DEBATE_SHAPE_POLICY_INVALID) and, with it, the sealed map contracts (DEBATE_SHAPE_MAP_HASH_UNSEALED /
 * MAP_CONTRACT_HASH_MISMATCH). A run's sizes are read from its own receipt, never from this row.
 */
const debateShape = resolveDebateShapeRunnerSettings({
  policy: await readDebateShapePolicy(pool, environment.REGISTER_VERSION),
  mapContractHash: await readMapContractHash(pool, environment.REGISTER_VERSION),
  codeMapContractHash: mapPromptContractHash()
});
```

and pass `debateShape,` in the `WalkingSkeletonRunner` settings object (beside `callScheduler`). Mirror the same
three reads and the setting in `tools/preview-practice/practice-runner-composition.ts` (the wiring-drift rule).
`WalkingSkeletonSettings` gains:

```ts
  /**
   * Debate shape (spec 2026-10-12 §3): set at boot when the register seals debateShapePolicy (with its map hash).
   * A run whose receipt carries a shape needs it (DEBATE_SHAPE_RUNNER_UNCONFIGURED otherwise); a run without one
   * never reads it. Absent: today's runner.
   */
  readonly debateShape?: DebateShapeRunnerSettings | null;
```

Rewrite `tests/unit/debate-shape-runner-boot.test.ts` to assert the `resolveDebateShapeRunnerSettings({` block occurs
once in main.ts before `new WalkingSkeletonRunner(` (same reading technique the P2a test used).

- [ ] **Step 4: Run — expect PASS**

Run (one at a time): `pnpm exec vitest run tests/unit/debate-shape-boot.test.ts tests/unit/debate-shape-runner-boot.test.ts tests/unit/debate-shape-policy.test.ts tests/unit/preview-register-publish-v2.test.ts tests/unit/map-package.test.ts tests/architecture/scaffold.test.ts`
then `pnpm exec vitest run tests/integration/dev-deployment-register.test.ts` (heavy: alone)
then `pnpm exec vitest run tests/integration/obs-l3-s06-runner-binding.test.ts` (alone). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/register apps/runner tools deploy tests
git commit -m "register/runner: optional mapContractHash row, boot resolves the shape settings, Phase 2a guard removed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Migration 0116: `core.map_item`, `core.map_choice`, `core.map_position`

**Files:**
- Create: `migrations/0116_debate_shape_map.sql`, `migrations/lineage/debate-shape-map-forward0116.json`, `packages/db/src/migration-forward0116.ts`, `tests/architecture/debate-shape-map-0116-contract.test.ts`
- Modify: `packages/db/src/migration-forward-chain.ts` (append `loadForward0116`), `packages/db/src/schema.ts` (Drizzle mirrors), `packages/crypto/src/index.ts` (`CONTENT_CARRIERS` += `"core.map_item"`, `"core.map_choice"`), `migrations/lineage/README.md` (section "## The debate shape map (0116)" + the "fifth" sentence becomes "sixth")
- Modify pins (each names the chain's last step): `tests/architecture/migration-forward-chain.test.ts` (61, 107, 147 + a new "chains 0116 after 0115" test, README test, refusal case), `tests/architecture/migration-forward-auth-db-batch.test.ts:55`, `tests/architecture/security-migration-0065.test.ts:624-630`, `tests/integration/billing-netopia-migration.test.ts:25-26,671,680`, `tests/integration/billing-price-currencies-migration.test.ts:141`, `tests/integration/forward-chain-replay-verifiers.test.ts:60`, `tests/integration/preview-auth-dev-fallback.test.ts:163-170`, `tests/integration/preview-auth-preservation.test.ts:259`, `tests/integration/role-rotation-0114.test.ts:215`, `tests/integration/dx-forward115.test.ts:30`, `tests/unit/preview-auth-dev-pending-forward.test.ts:20,57-98`, `tests/support/shipped-corpus.manifest.txt` (the loader)

**Interfaces:** SQL tables (below); `export const loadForward0116: StepLoader` in `migration-forward0116.ts` (same shape as `migration-forward115.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/architecture/debate-shape-map-0116-contract.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_CARRIERS } from "@debateai/crypto";

const sql = readFileSync(new URL("../../migrations/0116_debate_shape_map.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../packages/db/src/schema.ts", import.meta.url), "utf8");

describe("0116: the debate shape's map tables", () => {
  it.each(["core.map_item", "core.map_choice", "core.map_position"])("%s is append-only, TRUNCATE-guarded and granted like a carrier", (table) => {
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
    expect(sql).toContain(`SELECT core.install_truncate_guard('${table}');`);
    expect(sql).toMatch(new RegExp(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table.replace(".", "\\.")}`, "u"));
    expect(sql).toContain(`GRANT SELECT, INSERT ON ${table} TO debateai_runtime;`);
    expect(sql).toContain(`GRANT SELECT ON ${table} TO debateai_replay;`);
    expect(sql).not.toMatch(new RegExp(`GRANT[^;]*(UPDATE|DELETE|TRUNCATE)[^;]*ON ${table.replace(".", "\\.")}`, "u"));
  });

  it.each(["core.map_item", "core.map_choice"])("%s carries encrypted content with its own guards and the erasure barrier", (table) => {
    const suffix = table.split(".")[1];
    expect(sql).toContain(`CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_${suffix}()`);
    expect(sql).toContain(`CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_${suffix}()`);
    expect(sql).toContain(`CREATE TRIGGER enforce_erasure_barrier\nBEFORE INSERT ON ${table}`);
    expect(CONTENT_CARRIERS).toContain(table);
  });

  it("never redefines a function an earlier migration owns", () => {
    for (const owned of ["core.progress_value_is_code_shaped", "core.enforce_erasure_barrier()", "core.reject_mutation()", "core.install_truncate_guard"]) {
      expect(sql).not.toContain(`FUNCTION ${owned}`);
    }
  });

  it("mirrors the tables in the Drizzle schema", () => {
    for (const name of ["mapItem", "mapChoice", "mapPosition"]) expect(schema).toContain(`export const ${name} = core.table(`);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/architecture/debate-shape-map-0116-contract.test.ts` — Expected: FAIL (file missing).

- [ ] **Step 3: Implement**

`migrations/0116_debate_shape_map.sql`:

```sql
-- 0116 · The debate shape's map (spec docs/superpowers/specs/2026-10-12-debate-shape-design.md §3.4).
--
-- The map is MATERIAL, not graded claims (ruling DR-062): it never enters core.node. Three append-only tables:
--   * core.map_item      one row per point or candidate answer an AI wrote (blind, shown or in a gap round);
--   * core.map_choice    one row per run: the opening used, the map's marks, and (encrypted) the chosen answers,
--                        the also-raised points with their makers, the key points, angles and notes;
--   * core.map_position  one row per chosen answer once its root is saved: which root argued it.
-- Debate text (claims, answers) is encrypted like every other carrier on an encrypted run (0063/0074/0090 pattern);
-- codes (steps, makers, refs, ids, marks) stay readable under code-shape CHECKs. Erasure is inherited: shredding the
-- run key leaves ciphertext, and 0040's barrier refuses new rows once private content is gone.

-- 1. core.map_item -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.map_item (
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  item_id text NOT NULL,
  step text NOT NULL,
  ai_ref text NOT NULL,
  maker text NOT NULL,
  origin text NOT NULL,
  angle_id text,
  angle_kind text,
  kind text NOT NULL,
  leans text,
  list_index integer,
  position integer NOT NULL,
  content jsonb NOT NULL,
  content_ciphertext jsonb,
  content_attestation bytea,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, item_id),
  CONSTRAINT map_item_id_shape CHECK (item_id ~ '^[a-z]{2}[0-9]{2,4}$'),
  CONSTRAINT map_item_step_closed CHECK (step IN ('LIST', 'SNOWBALL', 'GAP')),
  CONSTRAINT map_item_origin_closed CHECK (origin IN ('BLIND', 'GAP', 'SHOWN')),
  CONSTRAINT map_item_kind_closed CHECK (kind IN ('POINT', 'ANSWER')),
  CONSTRAINT map_item_leans_closed CHECK (leans IS NULL OR leans IN ('for_some_answer', 'against_some_answer', 'context')),
  CONSTRAINT map_item_angle_kind_closed CHECK (angle_kind IS NULL OR angle_kind IN ('OPPOSITE_CASE', 'ASKER_WORRY', 'PRACTICAL', 'SPECIFIC', 'GENERAL')),
  CONSTRAINT map_item_codes_shape CHECK (core.jsonb_is_code_token(to_jsonb(ai_ref)) AND core.jsonb_is_code_token(to_jsonb(maker))
    AND (angle_id IS NULL OR angle_id ~ '^[a-z0-9][a-z0-9-]{0,23}$')),
  CONSTRAINT map_item_numbers CHECK (position >= 0 AND (list_index IS NULL OR list_index >= 0))
);

-- 2. core.map_choice -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.map_choice (
  run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  opening text NOT NULL,
  marks jsonb NOT NULL,
  content jsonb NOT NULL,
  content_ciphertext jsonb,
  content_attestation bytea,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT map_choice_opening_closed CHECK (opening IN ('MAP', 'TODAYS_OPENING')),
  CONSTRAINT map_choice_marks_codes CHECK (jsonb_typeof(marks) = 'array'
    AND NOT jsonb_path_exists(marks, '$[*] ? (!(@.type() == "string" && @ like_regex "^[A-Z][A-Z0-9_-]{0,63}$"))'))
);

-- 3. core.map_position ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.map_position (
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  answer_id text NOT NULL,
  root_index integer NOT NULL,
  root_node_id uuid NOT NULL REFERENCES core.node(node_id),
  maker text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, answer_id),
  CONSTRAINT map_position_root_unique UNIQUE (run_id, root_index),
  CONSTRAINT map_position_answer_shape CHECK (answer_id ~ '^[a-z0-9][a-z0-9-]{0,23}$'),
  CONSTRAINT map_position_codes CHECK (root_index >= 0 AND core.jsonb_is_code_token(to_jsonb(maker)))
);
```

Then, for `map_item` and `map_choice` each, the two guard functions copied from 0090's `ledger.call_prompt` block
(`migrations/0090_model_scorecard.sql` lines ~126–203) with these exact substitutions:

| 0090 | `core.map_item` | `core.map_choice` |
|---|---|---|
| function suffix `_call_prompt` | `_map_item` | `_map_choice` |
| message `ledger.call_prompt` | `core.map_item` | `core.map_choice` |
| plaintext test `NEW.prompt_text = sentinel` / `<> sentinel` | `NEW.content = '{"ciphertext":true,"v":1}'::jsonb` / `<>` | same |
| `OR NEW.prompt_fingerprint IS NULL` (legacy) and `OR NEW.prompt_fingerprint IS NOT NULL` (encrypted) | removed | removed |
| scope check `NEW.attempt_id IS NULL` | `NEW.item_id IS NULL` | (run_id only) |
| attested key `NEW.attempt_id::text` | `NEW.item_id` | `NEW.run_id::text` |

then the five statements per table exactly as 0090 orders them (`aaa_enforce_content_attestation_v2`,
`enforce_content_ciphertext`, `enforce_erasure_barrier`, `core.install_truncate_guard(...)`, `reject_mutation`), the
grants `GRANT SELECT, INSERT ON <table> TO debateai_runtime; GRANT SELECT ON <table> TO debateai_replay;`, and the
function ACLs (`REVOKE ALL … FROM PUBLIC; GRANT EXECUTE ON FUNCTION core.enforce_content_ciphertext_<suffix>() TO debateai_runtime;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_<suffix>() FROM PUBLIC;`). `core.map_position` gets only
`install_truncate_guard`, `reject_mutation` and the two grants (it holds ids and codes, no debate text). End with 0074's
self-check pattern:

```sql
DO $map_guard_contract$
BEGIN
  IF (SELECT count(*) FROM pg_trigger AS trigger_row JOIN pg_class AS class_row ON class_row.oid = trigger_row.tgrelid
      JOIN pg_namespace AS ns ON ns.oid = class_row.relnamespace
      WHERE ns.nspname = 'core' AND class_row.relname IN ('map_item', 'map_choice') AND NOT trigger_row.tgisinternal
        AND trigger_row.tgname IN ('aaa_enforce_content_attestation_v2', 'enforce_content_ciphertext', 'enforce_erasure_barrier', 'reject_mutation')) <> 8 THEN
    RAISE EXCEPTION 'MAP_GUARD_CONTRACT_INCOMPLETE';
  END IF;
END
$map_guard_contract$;
```

Manifest `migrations/lineage/debate-shape-map-forward0116.json` (copy `data-export-forward115.json`'s shape):

```json
{"version":"debate-shape-map-forward0116-v1","baseRecipeSha256":"<copy from data-export-forward115.json>",
 "previous":{"name":"0115_data_export.sql","manifestSha256":"<sha256 of data-export-forward115.json>","verifierSha256":"aba0e0b3f47f3b351ac1b683804bce6ef4ad9f8b7e19c2191996408d7964f52a"},
 "migration":{"name":"0116_debate_shape_map.sql","sha256":"<sha256 of 0116_debate_shape_map.sql>"},
 "verifier":{"path":"lineage/verify-effective-capabilities-111.sql","sha256":"aba0e0b3f47f3b351ac1b683804bce6ef4ad9f8b7e19c2191996408d7964f52a"}}
```

Each `<…>` is computed, not invented: `node -e 'console.log(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' <file>`
(and `baseRecipeSha256` is copied verbatim from the 0115 manifest).

`packages/db/src/migration-forward0116.ts`: copy `migration-forward115.ts` (78 lines) with `NAME = "0116_debate_shape_map.sql"`,
`VERSION = "debate-shape-map-forward0116-v1"`, `MANIFEST_PATH = "lineage/debate-shape-map-forward0116.json"`,
`PREVIOUS = "0115_data_export.sql"`, refusal prefix `MIGRATION_FORWARD0116_`, export `loadForward0116`, and a
`postconditionEvidence(client)` digesting the three tables (columns, constraints, indexes, triggers, ACL, as 0115's
`table` query) and the four new functions (definition sha256 and ACL, as 0115's `FUNCTIONS`). Append `loadForward0116`
last in `STEPS` of `migration-forward-chain.ts`.

`packages/db/src/schema.ts`, after `runRoleRotation`: `mapItem`, `mapChoice`, `mapPosition` mirrors (`core.table("map_item", {...})`
with `contentCiphertext: jsonb("content_ciphertext"), contentAttestation: bytea("content_attestation"),` — the same
column helpers `runRoleRotation`/the story mirror use). `packages/crypto/src/index.ts`: append `"core.map_item"`,
`"core.map_choice"` to `CONTENT_CARRIERS`.

Update every pin listed in **Files** the way commit 4cbdfd716 did for 0114 (the chain gains one step; "last step" pins
name 0116).

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run tests/architecture/debate-shape-map-0116-contract.test.ts tests/architecture/migration-forward-chain.test.ts tests/architecture/migration-forward-auth-db-batch.test.ts tests/architecture/security-migration-0065.test.ts tests/unit/preview-auth-dev-pending-forward.test.ts`
then, ONE AT A TIME: `pnpm exec vitest run tests/integration/dx-forward115.test.ts`, `pnpm exec vitest run tests/integration/forward-chain-replay-verifiers.test.ts`, `pnpm exec vitest run tests/integration/role-rotation-0114.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add migrations packages/db packages/crypto tests
git commit -m "db: migration 0116 — core.map_item, core.map_choice, core.map_position (append-only, encrypted, erasure-barred)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `MapChoiceRepository` and the readers

**Files:**
- Create: `packages/map/src/repository.ts`, `tests/integration/map-choice-repository.test.ts`
- Modify: `packages/map/src/index.ts`, `packages/map/package.json` (`"@debateai/db": "workspace:*"`, `"pg"` types as story has), `tools/orphan-audit/src/index.ts:28` (map row `["kernel","providers","db"]`), `tests/unit/map-package.test.ts:36` (dependency pin), `tests/architecture/s10-carrier-erasure-red.test.ts:186-219` (add `packages/map/src/repository.ts` to the sorted list), `tests/support/shipped-corpus.manifest.txt`

**Interfaces:**

```ts
export type MapChoiceAnswerRecord = Readonly<{ answerId: string; statement: string; rootIndex: number;
  rootNodeId: string | null; maker: string | null; filled: boolean }>;
export type MapAlsoRaisedRecord = Readonly<{ keyPointId: string; claim: string; makers: readonly string[] }>;
export type MapChoiceRecord = Readonly<{ opening: "MAP" | "TODAYS_OPENING"; answers: readonly MapChoiceAnswerRecord[];
  alsoRaised: readonly MapAlsoRaisedRecord[]; marks: readonly MapMark[] }>;
export type MapWriteOutcome = "INSERTED" | "ALREADY_PRESENT" | "RUN_ERASED";
export class MapChoiceRepository {
  constructor(pool: Pool);
  writeMapRun(input: Readonly<{ runId: string; result: MapResult; answerCount: number }>): Promise<MapWriteOutcome>;
  writeMapPosition(input: Readonly<{ runId: string; answerId: string; rootIndex: number; rootNodeId: string; maker: string }>): Promise<MapWriteOutcome>;
  readMapChoiceForRun(runId: string): Promise<MapChoiceRecord | null>;
  readMapItemsForRun(runId: string): Promise<readonly MapItem[]>;
  readMapResultForRun(runId: string): Promise<MapResult | null>;
}
export function readMapChoiceForRun(pool: Pool, runId: string): Promise<MapChoiceRecord | null>;
export function readMapItemsForRun(pool: Pool, runId: string): Promise<readonly MapItem[]>;
```

`answerCount` is P (the answers the run will argue: `min(choice.answers.length, shape.answers)`): only those are stored
as answers; any extra chosen answer is not argued and is not shown.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/map-choice-repository.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MapChoiceRepository, readMapChoiceForRun, readMapItemsForRun, type MapResult } from "@debateai/map";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { provisionStoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { persistTerminalRun } from "../support/settledRun.js";

const seat = (n: number) => ({ aiRef: `preview:ref-${String(n)}`, maker: `maker-${String(n)}` });
const RESULT: MapResult = Object.freeze({
  arm: "C", kind: "MAP", stoppedBy: null,
  angles: [{ angleId: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The case against." }],
  items: [
    { itemId: "pt01", seat: seat(0), origin: "BLIND", angleId: "opp", angleKind: "OPPOSITE_CASE", listIndex: 0, kind: "POINT", claim: "It costs a lot.", whyItMatters: "Money.", leans: "against_some_answer" },
    { itemId: "pt02", seat: seat(1), origin: "BLIND", angleId: null, angleKind: null, listIndex: 1, kind: "POINT", claim: "It helps riders.", whyItMatters: "People.", leans: "for_some_answer" },
    { itemId: "pt03", seat: seat(1), origin: "GAP", angleId: null, angleKind: null, listIndex: 101, kind: "POINT", claim: "Night buses.", whyItMatters: "Shifts.", leans: "context" },
    { itemId: "ca01", seat: seat(0), origin: "BLIND", angleId: "opp", angleKind: "OPPOSITE_CASE", listIndex: 0, kind: "ANSWER", answer: "No." }
  ],
  keyPoints: [
    { keyPointId: "k1", claim: "It costs a lot.", memberItemIds: ["pt01"], blindMakers: ["maker-0"], gapMakers: [], makers: ["maker-0"], fixedAngleKinds: ["OPPOSITE_CASE"], leansAgainst: true },
    { keyPointId: "k2", claim: "It helps riders.", memberItemIds: ["pt02"], blindMakers: ["maker-1"], gapMakers: [], makers: ["maker-1"], fixedAngleKinds: [], leansAgainst: false },
    { keyPointId: "k3", claim: "Night buses.", memberItemIds: ["pt03"], blindMakers: [], gapMakers: ["maker-1"], makers: ["maker-1"], fixedAngleKinds: [], leansAgainst: false }
  ],
  mergedAnswers: [{ answerId: "a1", answer: "No.", memberItemIds: ["ca01"], blindMakers: ["maker-0"], makers: ["maker-0"], fromOppositeCase: true }],
  framingChallenges: [],
  choice: { answers: [
    { answerId: "a1", statement: "Yes, with conditions.", forKeyPointIds: ["k2"], againstKeyPointIds: ["k1"], strongestRival: "a2", filled: false },
    { answerId: "a2", statement: "No.", forKeyPointIds: ["k1"], againstKeyPointIds: [], strongestRival: "a1", filled: true }
  ], alsoRaised: ["k3"] },
  marks: [{ mark: "ANSWERS_FILLED", step: "CHOOSE", detail: "map" }],
  notes: [], calls: []
}) as MapResult;

let db: TestDatabase;
beforeAll(async () => { db = await startTestDatabase(); }, 120_000);
afterAll(async () => { await db?.stop(); });

describe("MapChoiceRepository (0116)", () => {
  it.each(["legacy", "encrypted"] as const)("writes and reads back a %s run's map", async (mode) => {
    const { pool, runId } = mode === "encrypted"
      ? await provisionStoryEncryptedOwner(db) : await persistTerminalRun(db.pool);
    const repository = new MapChoiceRepository(pool);
    expect(await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 })).toBe("INSERTED");
    expect(await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 })).toBe("ALREADY_PRESENT");
    const items = await readMapItemsForRun(pool, runId);
    expect(items.map((item) => item.itemId)).toEqual(["ca01", "pt01", "pt02", "pt03"]);
    expect(items.find((item) => item.itemId === "pt01")).toEqual(RESULT.items[0]);
    const choice = await readMapChoiceForRun(pool, runId);
    expect(choice).toEqual({ opening: "MAP", marks: ["ANSWERS_FILLED"],
      answers: [
        { answerId: "a1", statement: "Yes, with conditions.", rootIndex: 0, rootNodeId: null, maker: null, filled: false },
        { answerId: "a2", statement: "No.", rootIndex: 1, rootNodeId: null, maker: null, filled: true }],
      alsoRaised: [{ keyPointId: "k3", claim: "Night buses.", makers: ["maker-1"] }] });
    const restored = await repository.readMapResultForRun(runId);
    expect(restored).toEqual({ ...RESULT, calls: [] });
    if (mode === "encrypted") {
      const raw = await db.pool.query(`SELECT content FROM core.map_item WHERE run_id = $1 AND item_id = 'pt01'`, [runId]);
      expect(raw.rows[0].content).toEqual({ ciphertext: true, v: 1 });
    }
  });

  it("joins the root that argued each answer once it is saved", async () => {
    const { pool, runId, rootNodeId } = await persistTerminalRun(db.pool);
    const repository = new MapChoiceRepository(pool);
    await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 });
    expect(await repository.writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId, maker: "maker-0" })).toBe("INSERTED");
    const choice = await readMapChoiceForRun(pool, runId);
    expect(choice!.answers[0]).toMatchObject({ rootNodeId, maker: "maker-0" });
  });

  it("refuses a plaintext write on an encrypted run and any update", async () => {
    const { runId } = await provisionStoryEncryptedOwner(db);
    await expect(db.pool.query(`INSERT INTO core.map_choice (run_id, opening, marks, content) VALUES ($1, 'MAP', '[]', '{"answers":[]}')`, [runId]))
      .rejects.toThrow(/CONTENT_PLAINTEXT_WRITE_FORBIDDEN/u);
    await expect(db.pool.query(`UPDATE core.map_item SET maker = 'x'`)).rejects.toThrow();
    await expect(db.pool.query(`TRUNCATE core.map_position`)).rejects.toThrow();
  });

  it("an erased run's map reads as absent and refuses new rows", async () => {
    const { pool, runId, erase } = await provisionStoryEncryptedOwner(db);
    const repository = new MapChoiceRepository(pool);
    await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 });
    await erase();
    expect(await readMapChoiceForRun(pool, runId)).toBeNull();
    expect(await repository.writeMapPosition({ runId, answerId: "a2", rootIndex: 1, rootNodeId: "00000000-0000-4000-8000-000000000001", maker: "m" })).toBe("RUN_ERASED");
  });
});
```

The fixtures `provisionStoryEncryptedOwner` / `persistTerminalRun` are the ones `tests/integration/story-repository.test.ts`
uses; read their return types first and adapt the destructuring names (`pool`, `runId`, a root node id, an `erase`
helper) to what they actually return — if one of them returns no root node id, read it with
`SELECT node_id FROM core.node WHERE run_id=$1 AND parent_node_id IS NULL ORDER BY created_at_seq LIMIT 1`, and if no
erase helper exists, call the erasure path `story-repository.test.ts` uses for its erased-run case.

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/integration/map-choice-repository.test.ts` (alone) — Expected: FAIL (`MapChoiceRepository` missing).

- [ ] **Step 3: Implement**

`packages/map/src/repository.ts`:

```ts
import { z } from "zod";
import {
  CONTENT_JSON_SENTINEL, decryptContentForRun, encryptAttestedContentForRun, withRunContentLease,
  type CryptoEnvelope, type Pool
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { mapRankKeyPoints } from "./items.js";
import { MAP_MARKS, type MapItem, type MapKeyPoint, type MapMark, type MapResult } from "./types.js";

/**
 * Debate shape (spec §3.4): the map's storage. Items, the run's choice and the roots that argued each answer, in the
 * three append-only tables of migration 0116. Debate text is sealed per row (carriers core.map_item / core.map_choice)
 * on an encrypted run and kept in the clear on a legacy run, exactly as the story's repository does.
 */
export type MapChoiceAnswerRecord = Readonly<{ answerId: string; statement: string; rootIndex: number;
  rootNodeId: string | null; maker: string | null; filled: boolean }>;
export type MapAlsoRaisedRecord = Readonly<{ keyPointId: string; claim: string; makers: readonly string[] }>;
export type MapChoiceRecord = Readonly<{ opening: "MAP" | "TODAYS_OPENING"; answers: readonly MapChoiceAnswerRecord[];
  alsoRaised: readonly MapAlsoRaisedRecord[]; marks: readonly MapMark[] }>;
export type MapWriteOutcome = "INSERTED" | "ALREADY_PRESENT" | "RUN_ERASED";

const SENTINEL = JSON.stringify(CONTENT_JSON_SENTINEL);
const itemContent = z.union([z.object({ claim: z.string(), why: z.string() }).strict(), z.object({ answer: z.string() }).strict()]);
/** The run's map without its items (they are rows of core.map_item) and without its call records (they are ledger rows). */
const choiceContent = z.object({
  answers: z.array(z.object({ answerId: z.string(), statement: z.string(), rootIndex: z.number().int().min(0), filled: z.boolean() }).strict()),
  alsoRaised: z.array(z.object({ keyPointId: z.string(), claim: z.string(), makers: z.array(z.string()) }).strict()),
  result: z.unknown()
}).strict();

function isErased(error: unknown): boolean {
  if (error instanceof TypedDomainError) return error.code === "PRIVATE_CONTENT_ERASED";
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "55000"
    && (error as { message?: unknown }).message === "PRIVATE_CONTENT_ERASED";
}
const invalid = (detail: string): TypedDomainError => new TypedDomainError("MAP_ROW_INVALID", `MAP_ROW_INVALID: ${detail}`);

export class MapChoiceRepository {
  constructor(private readonly pool: Pool) {}

  /** The map's items and its choice, once per run (a re-run of the same run finds them: ALREADY_PRESENT). */
  async writeMapRun(input: Readonly<{ runId: string; result: MapResult; answerCount: number }>): Promise<MapWriteOutcome> {
    const { runId, result } = input;
    const answers = (result.choice?.answers ?? []).slice(0, Math.max(0, input.answerCount))
      .map((answer, rootIndex) => Object.freeze({ answerId: answer.answerId, statement: answer.statement, rootIndex, filled: answer.filled }));
    const byId = new Map(result.keyPoints.map((keyPoint) => [keyPoint.keyPointId, keyPoint] as const));
    const alsoRaised = mapRankKeyPoints((result.choice?.alsoRaised ?? []).flatMap((id) => byId.get(id) ?? []))
      .map((keyPoint) => Object.freeze({ keyPointId: keyPoint.keyPointId, claim: keyPoint.claim, makers: [...keyPoint.makers] }));
    const { items: _items, calls: _calls, ...rest } = result;
    const content = choiceContent.parse({ answers, alsoRaised, result: rest });
    const opening = result.kind === "MAP" ? "MAP" : "TODAYS_OPENING";
    const marks = result.marks.map((record) => record.mark);
    try {
      return await withRunContentLease(this.pool, [runId], async () => {
        const present = await this.pool.query(`SELECT 1 FROM core.map_choice WHERE run_id = $1`, [runId]);
        if (present.rowCount === 1) return "ALREADY_PRESENT" as const;
        for (const item of [...result.items].sort((a, b) => a.itemId.localeCompare(b.itemId))) {
          const value = item.kind === "POINT" ? { claim: item.claim, why: item.whyItMatters } : { answer: item.answer };
          const sealed = await encryptAttestedContentForRun(this.pool, runId, "core.map_item", item.itemId, value);
          await this.pool.query(
            `INSERT INTO core.map_item (run_id, item_id, step, ai_ref, maker, origin, angle_id, angle_kind, kind, leans, list_index, position,
               content, content_ciphertext, content_attestation)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (run_id, item_id) DO NOTHING`,
            [runId, item.itemId, item.origin === "GAP" ? "GAP" : item.origin === "SHOWN" ? "SNOWBALL" : "LIST", item.seat.aiRef, item.seat.maker,
              item.origin, item.angleId, item.angleKind, item.kind, item.kind === "POINT" ? item.leans : null, item.listIndex,
              Number(item.itemId.slice(2)),
              sealed === null ? JSON.stringify(value) : SENTINEL, sealed === null ? null : JSON.stringify(sealed.envelope), sealed?.attestation ?? null]
          );
        }
        const sealed = await encryptAttestedContentForRun(this.pool, runId, "core.map_choice", runId, content);
        const inserted = await this.pool.query(
          `INSERT INTO core.map_choice (run_id, opening, marks, content, content_ciphertext, content_attestation)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (run_id) DO NOTHING`,
          [runId, opening, JSON.stringify(marks), sealed === null ? JSON.stringify(content) : SENTINEL,
            sealed === null ? null : JSON.stringify(sealed.envelope), sealed?.attestation ?? null]
        );
        return inserted.rowCount === 1 ? "INSERTED" as const : "ALREADY_PRESENT" as const;
      });
    } catch (error) {
      if (isErased(error)) return "RUN_ERASED";
      throw error;
    }
  }

  async writeMapPosition(input: Readonly<{ runId: string; answerId: string; rootIndex: number; rootNodeId: string; maker: string }>): Promise<MapWriteOutcome> {
    try {
      const inserted = await this.pool.query(
        `INSERT INTO core.map_position (run_id, answer_id, root_index, root_node_id, maker) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (run_id, answer_id) DO NOTHING`,
        [input.runId, input.answerId, input.rootIndex, input.rootNodeId, input.maker]
      );
      return inserted.rowCount === 1 ? "INSERTED" : "ALREADY_PRESENT";
    } catch (error) {
      if (isErased(error)) return "RUN_ERASED";
      throw error;
    }
  }

  async readMapChoiceForRun(runId: string): Promise<MapChoiceRecord | null> {
    const read = await this.#readChoice(runId);
    if (read === null) return null;
    const positions = await this.pool.query<{ answer_id: string; root_node_id: string; maker: string }>(
      `SELECT answer_id, root_node_id::text AS root_node_id, maker FROM core.map_position WHERE run_id = $1`, [runId]);
    const byAnswer = new Map(positions.rows.map((row) => [row.answer_id, row] as const));
    return Object.freeze({
      opening: read.opening,
      marks: Object.freeze(read.marks),
      answers: Object.freeze(read.content.answers.map((answer) => Object.freeze({ ...answer,
        rootNodeId: byAnswer.get(answer.answerId)?.root_node_id ?? null, maker: byAnswer.get(answer.answerId)?.maker ?? null }))),
      alsoRaised: Object.freeze(read.content.alsoRaised.map((entry) => Object.freeze({ ...entry, makers: Object.freeze([...entry.makers]) })))
    });
  }

  async readMapItemsForRun(runId: string): Promise<readonly MapItem[]> {
    try {
      return await withRunContentLease(this.pool, [runId], async () => {
        const rows = await this.pool.query<{ item_id: string; ai_ref: string; maker: string; origin: MapItem["origin"]; angle_id: string | null;
          angle_kind: MapItem["angleKind"]; kind: "POINT" | "ANSWER"; leans: string | null; list_index: number; content: unknown;
          content_ciphertext: CryptoEnvelope | null }>(
          `SELECT item_id, ai_ref, maker, origin, angle_id, angle_kind, kind, leans, list_index, content, content_ciphertext
             FROM core.map_item WHERE run_id = $1 ORDER BY item_id`, [runId]);
        const items: MapItem[] = [];
        for (const row of rows.rows) {
          const value = itemContent.parse(await decryptContentForRun<unknown>(this.pool, runId, "core.map_item", row.item_id, row.content_ciphertext, row.content));
          const base = { itemId: row.item_id, seat: Object.freeze({ aiRef: row.ai_ref, maker: row.maker }), origin: row.origin,
            angleId: row.angle_id, angleKind: row.angle_kind, listIndex: row.list_index };
          if (row.kind === "POINT" && "claim" in value) {
            items.push(Object.freeze({ ...base, kind: "POINT" as const, claim: value.claim, whyItMatters: value.why, leans: row.leans as never }));
          } else if (row.kind === "ANSWER" && "answer" in value) {
            items.push(Object.freeze({ ...base, kind: "ANSWER" as const, answer: value.answer }));
          } else {
            throw invalid(`core.map_item ${row.item_id}`);
          }
        }
        return Object.freeze(items);
      });
    } catch (error) {
      if (isErased(error)) return Object.freeze([]);
      throw error;
    }
  }

  /** The whole map, as the orchestrator returned it (minus its call records): a re-claimed run reuses it, calling nothing. */
  async readMapResultForRun(runId: string): Promise<MapResult | null> {
    const read = await this.#readChoice(runId);
    if (read === null) return null;
    const items = await this.readMapItemsForRun(runId);
    return Object.freeze({ ...(read.content.result as Omit<MapResult, "items" | "calls">), items, calls: Object.freeze([]) }) as MapResult;
  }

  async #readChoice(runId: string): Promise<{ opening: "MAP" | "TODAYS_OPENING"; marks: MapMark[]; content: z.infer<typeof choiceContent> } | null> {
    try {
      return await withRunContentLease(this.pool, [runId], async () => {
        const row = (await this.pool.query<{ opening: "MAP" | "TODAYS_OPENING"; marks: unknown; content: unknown; content_ciphertext: CryptoEnvelope | null }>(
          `SELECT opening, marks, content, content_ciphertext FROM core.map_choice WHERE run_id = $1`, [runId])).rows[0];
        if (row === undefined) return null;
        const marks = z.array(z.enum(MAP_MARKS)).parse(row.marks);
        const content = choiceContent.parse(await decryptContentForRun<unknown>(this.pool, runId, "core.map_choice", runId, row.content_ciphertext, row.content));
        return { opening: row.opening, marks, content };
      });
    } catch (error) {
      if (isErased(error)) return null;
      throw error;
    }
  }
}

export function readMapChoiceForRun(pool: Pool, runId: string): Promise<MapChoiceRecord | null> {
  return new MapChoiceRepository(pool).readMapChoiceForRun(runId);
}
export function readMapItemsForRun(pool: Pool, runId: string): Promise<readonly MapItem[]> {
  return new MapChoiceRepository(pool).readMapItemsForRun(runId);
}
```

(`position` is the item's number in its id, which `mapAssignItemIds` derives from plan order; `MapKeyPoint` is imported
for the ranking's types.) Export from `packages/map/src/index.ts`: `export * from "./repository.js";`. Update the
dependency pins listed in **Files**.

- [ ] **Step 4: Run — expect PASS**

Run (alone): `pnpm exec vitest run tests/integration/map-choice-repository.test.ts`; then
`pnpm exec vitest run tests/unit/map-package.test.ts tests/architecture/s10-carrier-erasure-red.test.ts tests/architecture/scaffold.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/map tools/orphan-audit tests
git commit -m "map: MapChoiceRepository — items, choice and positions over 0116, encrypted per run, erasure-safe readers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The shape plan and its seats (pure)

**Files:**
- Create: `apps/runner/src/shape-plan.ts`, `apps/runner/src/shape-seats.ts`, `tests/unit/shape-plan.test.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt`

**Interfaces:**

```ts
// apps/runner/src/shape-plan.ts
export type ShapeLegKind = "POINT" | "CROSS" | "REPLY" | "DEFENCE";
export interface ShapeLeg {
  readonly kind: ShapeLegKind;
  readonly round: number;                 // 1: points and cross-replies; k ≥ 2: deeper exchanges; depth + s: scrutiny round s
  readonly rootIndex: number;
  readonly parentIndex: number;
  readonly childIndex: number;            // its plan position
  readonly polarity: "support" | "attack";
  readonly authorIndex: number;           // = rootIndex in the plan; the writer is chosen at call time (shape-seats.ts)
  readonly siblingOrdinal: number;
  readonly chain: number | null;          // the round-1 point (plan position) this leg extends; null for a cross-reply
  readonly consideration: string | null;
  readonly keyPointId: string | null;
  readonly targetRootIndex: number | null;
  readonly callSiteKey: string;
}
export type ShapePointSpec = Readonly<{ polarity: "support" | "attack"; consideration: string | null; keyPointId: string | null }>;
export type ShapePositionPlan = Readonly<{ answerId: string | null; statement: string | null; mapPoints: string | null;
  points: readonly ShapePointSpec[]; rivalIndex: number }>;
export type ShapeScrutinySlots = Readonly<{ start: number; nodesPerDebate: number; roundsPerNode: number; count: number }>;
export type ShapePlan = Readonly<{ rootCount: number; legs: readonly ShapeLeg[]; scrutiny: ShapeScrutinySlots; totalPlannedNodes: number }>;
export function shapeRoundOnePoints(forIds: readonly string[], againstIds: readonly string[], k: number): readonly Readonly<{ polarity: "support" | "attack"; keyPointId: string }>[];
export function shapePositionsFromMap(input: Readonly<{ choice: MapChoice; keyPoints: readonly MapKeyPoint[]; answers: number; pointsPerAnswer: number }>): readonly ShapePositionPlan[];
export function shapePositionsForTodaysOpening(input: Readonly<{ answers: number; pointsPerAnswer: number }>): readonly ShapePositionPlan[];
export function buildShapePlan(input: Readonly<{ positions: readonly ShapePositionPlan[]; depth: number;
  scrutiny: Readonly<{ roundsPerPoint: number; pointsPerDebate: number }> }>): ShapePlan;
export function buildScrutinyLegs(input: Readonly<{ plan: ShapePlan; depth: number; selected: readonly Readonly<{ position: number; rootIndex: number }>[] }>): readonly ShapeLeg[];
export function shapeRunnableNodeCount(plan: ShapePlan, depth: number, depthMode: "fixed" | "adaptive", deeperTopPoints: number): number;
// apps/runner/src/shape-seats.ts
export function shapeSeatOrder<T extends Readonly<{ main: Readonly<{ maker: string }> }>>(seats: readonly T[]): readonly T[];
export type ShapeHandOver = Readonly<{ kind: "SWAP" | "SHARE"; withIndex: number }> | Readonly<{ kind: "NONE" }>;
export function shapeHandOverRoot(input: Readonly<{ makers: readonly string[]; rootCount: number; rootIndex: number; sitsOut: (index: number) => boolean }>): ShapeHandOver;
export function shapeWriterSeat(input: Readonly<{ seatMakers: readonly string[]; avoidMakers: readonly string[];
  preferMaker: string | null; offset: number; sitsOut: (index: number) => boolean }>): number | null;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shape-plan.test.ts
import { describe, expect, it } from "vitest";
import { debateShapeSiteCounts, type DebateShapeCeilingInput } from "@debateai/register";
import { deriveGlobalRoundCompletions, selectPreventableBranches } from "../../apps/runner/src/index.js";
import {
  buildScrutinyLegs, buildShapePlan, shapePositionsForTodaysOpening, shapePositionsFromMap, shapeRoundOnePoints,
  shapeRunnableNodeCount
} from "../../apps/runner/src/shape-plan.js";
import { shapeHandOverRoot, shapeSeatOrder, shapeWriterSeat } from "../../apps/runner/src/shape-seats.js";

const KEY_0069 = /^JUDGE(:root:(secondary|[0-9]{1,4})|:(defender|critic):root[0-9]{1,4}:r[0-9]{1,4}:p[0-9]{1,4}|:cross-root:[0-9]{1,4}->[0-9]{1,4})?$/u;
const kp = (id: string) => ({ keyPointId: id, claim: `Claim ${id}.`, memberItemIds: [], blindMakers: [], gapMakers: [], makers: [], fixedAngleKinds: [], leansAgainst: false });
const CHOICE = { alsoRaised: [], answers: [
  { answerId: "a1", statement: "Yes.", forKeyPointIds: ["k1", "k2"], againstKeyPointIds: ["k3", "k4"], strongestRival: "a2", filled: false },
  { answerId: "a2", statement: "No.", forKeyPointIds: ["k3"], againstKeyPointIds: ["k1"], strongestRival: null, filled: false },
  { answerId: "a3", statement: "Only at night.", forKeyPointIds: [], againstKeyPointIds: ["k2"], strongestRival: "a1", filled: true }] };
const KEY_POINTS = ["k1", "k2", "k3", "k4"].map(kp);

describe("round-1 points (spec §3.3 step 3)", () => {
  it("takes against first, then for, at least one of each when both exist", () => {
    expect(shapeRoundOnePoints(["f1", "f2"], ["a1", "a2", "a3"], 3)).toEqual([
      { polarity: "attack", keyPointId: "a1" }, { polarity: "attack", keyPointId: "a2" }, { polarity: "support", keyPointId: "f1" }]);
    expect(shapeRoundOnePoints(["f1"], ["a1"], 1)).toEqual([{ polarity: "attack", keyPointId: "a1" }]);
    expect(shapeRoundOnePoints(["f1", "f2"], [], 4)).toEqual([{ polarity: "support", keyPointId: "f1" }, { polarity: "support", keyPointId: "f2" }]);
  });
});

describe("positions", () => {
  it("from the map: P answers, considerations as claims, the rival by id or the next position", () => {
    const positions = shapePositionsFromMap({ choice: CHOICE, keyPoints: KEY_POINTS, answers: 3, pointsPerAnswer: 3 });
    expect(positions.map((position) => [position.answerId, position.rivalIndex])).toEqual([["a1", 1], ["a2", 2], ["a3", 0]]);
    expect(positions[0]!.points.map((point) => point.consideration)).toEqual(["Claim k3.", "Claim k4.", "Claim k1."]);
    expect(JSON.parse(positions[0]!.mapPoints!)).toEqual({ for: ["Claim k1.", "Claim k2."], against: ["Claim k3.", "Claim k4."] });
    expect(shapePositionsFromMap({ choice: CHOICE, keyPoints: KEY_POINTS, answers: 2, pointsPerAnswer: 3 })).toHaveLength(2);
  });

  it("today's opening fallback: at most P positions, at most K points each, no consideration", () => {
    const positions = shapePositionsForTodaysOpening({ answers: 3, pointsPerAnswer: 2 });
    expect(positions).toHaveLength(3);
    expect(positions[0]!.points).toEqual([{ polarity: "attack", consideration: null, keyPointId: null }, { polarity: "support", consideration: null, keyPointId: null }]);
    expect(positions.map((position) => position.rivalIndex)).toEqual([1, 2, 0]);
  });
});

describe("the breadth-first plan (spec §3.3 steps 3–5, INTERFACE §3 round order)", () => {
  const positions = shapePositionsFromMap({ choice: CHOICE, keyPoints: KEY_POINTS, answers: 3, pointsPerAnswer: 3 });
  const plan = buildShapePlan({ positions, depth: 3, scrutiny: { roundsPerPoint: 2, pointsPerDebate: 6 } });

  it("round 1 holds every point then every cross-reply; parents always precede children", () => {
    const roundOne = plan.legs.filter((leg) => leg.round === 1);
    expect(roundOne.map((leg) => leg.kind)).toEqual([...positions.flatMap((position) => position.points.map(() => "POINT")), "CROSS", "CROSS", "CROSS"]);
    for (const leg of plan.legs) expect(leg.parentIndex).toBeLessThan(leg.childIndex);
    expect(plan.legs.map((leg) => leg.childIndex)).toEqual(plan.legs.map((_leg, index) => plan.rootCount + index));
  });

  it("one boundary per round, after the last leg of that round across all positions", () => {
    const completions = deriveGlobalRoundCompletions(plan.legs);
    expect([...completions.values()]).toEqual([1, 2, 3]);
    for (const [legIndex, round] of completions) {
      expect(plan.legs.slice(0, legIndex + 1).every((leg) => leg.round <= round)).toBe(true);
      expect(plan.legs.slice(legIndex + 1).every((leg) => leg.round > round)).toBe(true);
    }
    const boundaryOne = [...completions.keys()][0]!;
    const points = plan.legs.filter((leg) => leg.kind === "POINT").map((leg) => leg.childIndex);
    expect(selectPreventableBranches({ plan: plan.legs, boundaryLegIndex: boundaryOne, carryingChildIndices: points })).toEqual(points);
  });

  it("a deeper round is one reply and one defence per chain, a linear chain", () => {
    for (const leg of plan.legs.filter((entry) => entry.kind === "REPLY")) {
      const defence = plan.legs.find((entry) => entry.parentIndex === leg.childIndex)!;
      expect(defence).toMatchObject({ kind: "DEFENCE", round: leg.round, chain: leg.chain, polarity: "attack", siblingOrdinal: 1 });
      expect(plan.legs.filter((entry) => entry.parentIndex === leg.parentIndex && entry.round === leg.round)).toHaveLength(1);
    }
  });

  it("every key is unique, no sibling ordinal repeats under one parent, every key passes 0069's code-shape rule", () => {
    expect(new Set(plan.legs.map((leg) => leg.callSiteKey)).size).toBe(plan.legs.length);
    const slots = plan.legs.map((leg) => `${String(leg.parentIndex)}/${String(leg.siblingOrdinal)}`);
    expect(new Set(slots).size).toBe(slots.length);
    for (const leg of plan.legs) expect(leg.callSiteKey).toMatch(KEY_0069);
  });

  it("reserves 2·R·Q scrutiny slots after the plan and builds their legs on demand", () => {
    expect(plan.scrutiny).toEqual({ start: plan.rootCount + plan.legs.length, nodesPerDebate: 6, roundsPerNode: 2, count: 24 });
    expect(plan.totalPlannedNodes).toBe(plan.scrutiny.start + 24);
    const legs = buildScrutinyLegs({ plan, depth: 3, selected: [{ position: 0, rootIndex: 0 }, { position: plan.rootCount, rootIndex: 0 }] });
    expect(legs.map((leg) => [leg.kind, leg.round, leg.childIndex - plan.scrutiny.start])).toEqual([
      ["REPLY", 4, 0], ["DEFENCE", 4, 1], ["REPLY", 4, 2], ["DEFENCE", 4, 3],
      ["REPLY", 5, 12], ["DEFENCE", 5, 13], ["REPLY", 5, 14], ["DEFENCE", 5, 15]]);
    expect(legs[0]!.siblingOrdinal).toBe(plan.legs.filter((leg) => leg.parentIndex === 0).length + 1);
    for (const leg of legs) expect(leg.callSiteKey).toMatch(KEY_0069);
  });

  it("never runs more nodes than P2a priced (enumerator against debateShapeSiteCounts): equal when every answer has K points", () => {
    const fullPoints = shapePositionsForTodaysOpening({ answers: 3, pointsPerAnswer: 3 });
    for (const depthMode of ["fixed", "adaptive"] as const) {
      for (const depth of [1, 2, 3]) {
        const shape = { answers: 3, pointsPerAnswer: 3, deeperTopPoints: 2, depthMode, scrutinyRoundsPerPoint: 2, scrutinyPointsPerDebate: 6,
          mapAIs: 4, gapRounds: 2, graders: 3, closeCallExtraGraders: 1 } as unknown as DebateShapeCeilingInput;
        const priced = debateShapeSiteCounts(shape, depth).nodes;
        const full = buildShapePlan({ positions: fullPoints, depth, scrutiny: { roundsPerPoint: 2, pointsPerDebate: 6 } });
        expect(shapeRunnableNodeCount(full, depth, depthMode, 2), `${depthMode} d${String(depth)}`).toBe(priced);
        const fewer = buildShapePlan({ positions, depth, scrutiny: { roundsPerPoint: 2, pointsPerDebate: 6 } });
        expect(shapeRunnableNodeCount(fewer, depth, depthMode, 2)).toBeLessThanOrEqual(priced);
      }
    }
  });
});

describe("seats", () => {
  const seat = (maker: string) => ({ main: { maker } });
  it("puts distinct makers first, keeping the opener first", () => {
    expect(shapeSeatOrder([seat("glm"), seat("glm"), seat("ds"), seat("qw")]).map((entry) => entry.main.maker)).toEqual(["glm", "ds", "qw", "glm"]);
  });
  it("hands a sitting-out position to a maker without one, else shares", () => {
    expect(shapeHandOverRoot({ makers: ["a", "b", "c", "d"], rootCount: 2, rootIndex: 1, sitsOut: (index) => index === 1 })).toEqual({ kind: "SWAP", withIndex: 2 });
    expect(shapeHandOverRoot({ makers: ["a", "b", "c"], rootCount: 3, rootIndex: 1, sitsOut: (index) => index === 1 })).toEqual({ kind: "SHARE", withIndex: 2 });
    expect(shapeHandOverRoot({ makers: ["a", "b"], rootCount: 2, rootIndex: 1, sitsOut: () => true })).toEqual({ kind: "NONE" });
  });
  it("writes with a different maker, rotating, preferring one when asked", () => {
    const makers = ["a", "b", "c", "d"];
    expect(shapeWriterSeat({ seatMakers: makers, avoidMakers: ["a"], preferMaker: null, offset: 0, sitsOut: () => false })).toBe(1);
    expect(shapeWriterSeat({ seatMakers: makers, avoidMakers: ["a"], preferMaker: null, offset: 3, sitsOut: () => false })).toBe(3);
    expect(shapeWriterSeat({ seatMakers: makers, avoidMakers: ["b"], preferMaker: "c", offset: 0, sitsOut: () => false })).toBe(2);
    expect(shapeWriterSeat({ seatMakers: makers, avoidMakers: ["a", "b", "c", "d"], preferMaker: null, offset: 0, sitsOut: () => false })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/shape-plan.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

```ts
// apps/runner/src/shape-plan.ts
import type { MapChoice, MapKeyPoint } from "@debateai/map";

/**
 * Debate shape (spec 2026-10-12 §3.3) — THE PLAN, in the runner's own vocabulary: P roots (plan positions 0..P−1) and
 * one breadth-first leg list whose plan positions follow the roots. Round 1 holds every position's chosen points, then
 * one cross-reply per position; each deeper round holds one reply and one defence per chosen point, extending that
 * point's linear chain (fixed: every chain; adaptive: the chains `shape-select.ts` keeps at the round-1 boundary).
 * Parents always precede children, so the ordered recorders, review batches and round boundaries work unchanged; the
 * scrutiny slots are reserved after the plan and filled once scrutiny has chosen its nodes.
 */
export type ShapeLegKind = "POINT" | "CROSS" | "REPLY" | "DEFENCE";
export interface ShapeLeg {
  readonly kind: ShapeLegKind;
  readonly round: number;
  readonly rootIndex: number;
  readonly parentIndex: number;
  readonly childIndex: number;
  readonly polarity: "support" | "attack";
  readonly authorIndex: number;
  readonly siblingOrdinal: number;
  readonly chain: number | null;
  readonly consideration: string | null;
  readonly keyPointId: string | null;
  readonly targetRootIndex: number | null;
  readonly callSiteKey: string;
}
export type ShapePointSpec = Readonly<{ polarity: "support" | "attack"; consideration: string | null; keyPointId: string | null }>;
export type ShapePositionPlan = Readonly<{ answerId: string | null; statement: string | null; mapPoints: string | null;
  points: readonly ShapePointSpec[]; rivalIndex: number }>;
export type ShapeScrutinySlots = Readonly<{ start: number; nodesPerDebate: number; roundsPerNode: number; count: number }>;
export type ShapePlan = Readonly<{ rootCount: number; legs: readonly ShapeLeg[]; scrutiny: ShapeScrutinySlots; totalPlannedNodes: number }>;

const role = (polarity: "support" | "attack"): string => (polarity === "support" ? "defender" : "critic");
/** Every shape leg's key names its OWN plan position (`p<n>`): unique per node, and inside 0069's code shape. */
const legKey = (polarity: "support" | "attack", rootIndex: number, round: number, position: number): string =>
  `JUDGE:${role(polarity)}:root${String(rootIndex)}:r${String(round)}:p${String(position)}`;

/** Spec §3.3 step 3: against first, then for; at least one of each when both exist and K allows two. */
export function shapeRoundOnePoints(forIds: readonly string[], againstIds: readonly string[], k: number):
  readonly Readonly<{ polarity: "support" | "attack"; keyPointId: string }>[] {
  const keepOneFor = forIds.length > 0 && againstIds.length > 0 && k >= 2 ? 1 : 0;
  const against = againstIds.slice(0, Math.max(0, k - keepOneFor));
  const supporting = forIds.slice(0, Math.max(0, k - against.length));
  return Object.freeze([
    ...against.map((keyPointId) => Object.freeze({ polarity: "attack" as const, keyPointId })),
    ...supporting.map((keyPointId) => Object.freeze({ polarity: "support" as const, keyPointId }))
  ]);
}

const nextRival = (index: number, count: number): number => (index + 1) % count;

export function shapePositionsFromMap(input: Readonly<{ choice: MapChoice; keyPoints: readonly MapKeyPoint[]; answers: number; pointsPerAnswer: number }>): readonly ShapePositionPlan[] {
  const claimOf = new Map(input.keyPoints.map((keyPoint) => [keyPoint.keyPointId, keyPoint.claim] as const));
  const answers = input.choice.answers.slice(0, input.answers);
  return Object.freeze(answers.map((answer, index): ShapePositionPlan => {
    const rival = answer.strongestRival === null ? -1 : answers.findIndex((other) => other.answerId === answer.strongestRival);
    const claims = (ids: readonly string[]) => ids.flatMap((id) => claimOf.get(id) ?? []);
    return Object.freeze({
      answerId: answer.answerId,
      statement: answer.statement,
      mapPoints: JSON.stringify({ for: claims(answer.forKeyPointIds), against: claims(answer.againstKeyPointIds) }),
      points: Object.freeze(shapeRoundOnePoints(answer.forKeyPointIds, answer.againstKeyPointIds, input.pointsPerAnswer)
        .flatMap((point) => { const claim = claimOf.get(point.keyPointId); return claim === undefined ? [] : [Object.freeze({ ...point, consideration: claim })]; })),
      rivalIndex: rival < 0 || rival === index ? nextRival(index, answers.length) : rival
    });
  }));
}

/** Spec §1.2 + P2a deviation 5: the map was unavailable — today's opening for the first P seats, at most K points each. */
export function shapePositionsForTodaysOpening(input: Readonly<{ answers: number; pointsPerAnswer: number }>): readonly ShapePositionPlan[] {
  return Object.freeze(Array.from({ length: input.answers }, (_unused, index): ShapePositionPlan => Object.freeze({
    answerId: null, statement: null, mapPoints: null,
    points: Object.freeze(Array.from({ length: input.pointsPerAnswer }, (_point, at): ShapePointSpec =>
      Object.freeze({ polarity: at % 2 === 0 ? "attack" : "support", consideration: null, keyPointId: null }))),
    rivalIndex: nextRival(index, input.answers)
  })));
}

export function buildShapePlan(input: Readonly<{ positions: readonly ShapePositionPlan[]; depth: number;
  scrutiny: Readonly<{ roundsPerPoint: number; pointsPerDebate: number }> }>): ShapePlan {
  const rootCount = input.positions.length;
  if (rootCount < 2 || !Number.isSafeInteger(input.depth) || input.depth < 1) throw new TypeError("SHAPE_PLAN_INPUT_INVALID");
  const legs: ShapeLeg[] = [];
  const children = new Map<number, number>();
  const ordinal = (parent: number): number => { const next = (children.get(parent) ?? 0) + 1; children.set(parent, next); return next; };
  let next = rootCount;
  const push = (leg: Omit<ShapeLeg, "childIndex" | "siblingOrdinal" | "authorIndex" | "callSiteKey">, key: (position: number) => string): ShapeLeg => {
    const childIndex = next;
    next += 1;
    const made: ShapeLeg = Object.freeze({ ...leg, childIndex, authorIndex: leg.rootIndex, siblingOrdinal: ordinal(leg.parentIndex), callSiteKey: key(childIndex) });
    legs.push(made);
    return made;
  };
  input.positions.forEach((position, rootIndex) => {
    for (const point of position.points) {
      push({ kind: "POINT", round: 1, rootIndex, parentIndex: rootIndex, polarity: point.polarity, chain: null,
        consideration: point.consideration, keyPointId: point.keyPointId, targetRootIndex: null },
      (childIndex) => legKey(point.polarity, rootIndex, 1, childIndex));
    }
  });
  // A POINT's chain is itself: set after the push (its position is only known then).
  for (const [index, leg] of legs.entries()) legs[index] = Object.freeze({ ...leg, chain: leg.childIndex });
  input.positions.forEach((position, rootIndex) => {
    push({ kind: "CROSS", round: 1, rootIndex, parentIndex: rootIndex, polarity: "attack", chain: null, consideration: null,
      keyPointId: null, targetRootIndex: position.rivalIndex },
    () => `JUDGE:cross-root:${String(rootIndex)}->${String(position.rivalIndex)}`);
  });
  const chains = legs.filter((leg) => leg.kind === "POINT");
  const tips = new Map(chains.map((leg) => [leg.childIndex, leg.childIndex] as const));
  for (let round = 2; round <= input.depth; round += 1) {
    for (const chain of chains) {
      const reply = push({ kind: "REPLY", round, rootIndex: chain.rootIndex, parentIndex: tips.get(chain.childIndex)!, polarity: "attack",
        chain: chain.childIndex, consideration: null, keyPointId: chain.keyPointId, targetRootIndex: null },
      (childIndex) => legKey("attack", chain.rootIndex, round, childIndex));
      const defence = push({ kind: "DEFENCE", round, rootIndex: chain.rootIndex, parentIndex: reply.childIndex, polarity: "attack",
        chain: chain.childIndex, consideration: null, keyPointId: chain.keyPointId, targetRootIndex: null },
      (childIndex) => legKey("attack", chain.rootIndex, round, childIndex));
      tips.set(chain.childIndex, defence.childIndex);
    }
  }
  const start = rootCount + legs.length;
  const count = 2 * input.scrutiny.roundsPerPoint * input.scrutiny.pointsPerDebate;
  return Object.freeze({
    rootCount, legs: Object.freeze(legs),
    scrutiny: Object.freeze({ start, nodesPerDebate: input.scrutiny.pointsPerDebate, roundsPerNode: input.scrutiny.roundsPerPoint, count }),
    totalPlannedNodes: start + count
  });
}

/**
 * Spec §3.3 step 7: the scrutiny legs for the nodes scrutiny chose (in its rank order). Slot of rank q in scrutiny
 * round s: reply at start + ((s−1)·Qmax + q)·2, its defence right after; a node's first reply takes the next sibling
 * ordinal under it (after every leg the plan put there), each later one extends the node's own scrutiny chain.
 */
export function buildScrutinyLegs(input: Readonly<{ plan: ShapePlan; depth: number; selected: readonly Readonly<{ position: number; rootIndex: number }>[] }>): readonly ShapeLeg[] {
  const { plan } = input;
  const selected = input.selected.slice(0, plan.scrutiny.nodesPerDebate);
  const legs: ShapeLeg[] = [];
  const tips = new Map(selected.map((node) => [node.position, node.position] as const));
  for (let round = 1; round <= plan.scrutiny.roundsPerNode; round += 1) {
    selected.forEach((node, rank) => {
      const replyAt = plan.scrutiny.start + ((round - 1) * plan.scrutiny.nodesPerDebate + rank) * 2;
      const parent = tips.get(node.position)!;
      const firstOrdinal = plan.legs.filter((leg) => leg.parentIndex === parent).length + 1;
      const common = { rootIndex: node.rootIndex, authorIndex: node.rootIndex, polarity: "attack" as const, chain: node.position,
        consideration: null, keyPointId: null, targetRootIndex: null, round: input.depth + round };
      legs.push(Object.freeze({ ...common, kind: "REPLY" as const, parentIndex: parent, childIndex: replyAt,
        siblingOrdinal: parent === node.position ? firstOrdinal : 1, callSiteKey: legKey("attack", node.rootIndex, input.depth + round, replyAt) }));
      legs.push(Object.freeze({ ...common, kind: "DEFENCE" as const, parentIndex: replyAt, childIndex: replyAt + 1,
        siblingOrdinal: 1, callSiteKey: legKey("attack", node.rootIndex, input.depth + round, replyAt + 1) }));
      tips.set(node.position, replyAt + 1);
    });
  }
  return Object.freeze(legs);
}

/** How many nodes the plan can make at most: what P2a's `debateShapeSiteCounts(shape, depth).nodes` priced. */
export function shapeRunnableNodeCount(plan: ShapePlan, depth: number, depthMode: "fixed" | "adaptive", deeperTopPoints: number): number {
  const roundOne = plan.legs.filter((leg) => leg.round === 1).length;
  const chainsPerRoot = Array.from({ length: plan.rootCount }, (_unused, rootIndex) =>
    plan.legs.filter((leg) => leg.kind === "POINT" && leg.rootIndex === rootIndex).length);
  const deeperChains = chainsPerRoot.reduce((sum, chains) => sum + (depthMode === "fixed" ? chains : Math.min(chains, deeperTopPoints)), 0);
  return plan.rootCount + roundOne + (depth - 1) * 2 * deeperChains + plan.scrutiny.count;
}
```

```ts
// apps/runner/src/shape-seats.ts
/**
 * Debate shape (spec §3.3 steps 2–3) — who writes what. Positions go to DIFFERENT makers, the opener-rotation seat
 * first; a position whose maker sits out goes to a maker without one, else to one that already argues one. A point,
 * reply or defence is written by a maker other than the one it answers, rotating.
 */
export function shapeSeatOrder<T extends Readonly<{ main: Readonly<{ maker: string }> }>>(seats: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  const first: T[] = [];
  const rest: T[] = [];
  for (const seat of seats) {
    if (seen.has(seat.main.maker)) rest.push(seat); else { seen.add(seat.main.maker); first.push(seat); }
  }
  return Object.freeze([...first, ...rest]);
}

export type ShapeHandOver = Readonly<{ kind: "SWAP" | "SHARE"; withIndex: number }> | Readonly<{ kind: "NONE" }>;

export function shapeHandOverRoot(input: Readonly<{ makers: readonly string[]; rootCount: number; rootIndex: number; sitsOut: (index: number) => boolean }>): ShapeHandOver {
  const arguing = new Set(input.makers.slice(0, input.rootCount).filter((_maker, index) => index !== input.rootIndex && !input.sitsOut(index)));
  for (let index = input.rootCount; index < input.makers.length; index += 1) {
    if (!input.sitsOut(index) && !arguing.has(input.makers[index]!)) return Object.freeze({ kind: "SWAP", withIndex: index });
  }
  for (let step = 1; step < input.rootCount; step += 1) {
    const index = (input.rootIndex + step) % input.rootCount;
    if (!input.sitsOut(index)) return Object.freeze({ kind: "SHARE", withIndex: index });
  }
  return Object.freeze({ kind: "NONE" });
}

export function shapeWriterSeat(input: Readonly<{ seatMakers: readonly string[]; avoidMakers: readonly string[];
  preferMaker: string | null; offset: number; sitsOut: (index: number) => boolean }>): number | null {
  const count = input.seatMakers.length;
  const open = (index: number): boolean => !input.sitsOut(index) && !input.avoidMakers.includes(input.seatMakers[index]!);
  if (input.preferMaker !== null) {
    for (let step = 0; step < count; step += 1) {
      const index = (input.offset + step) % count;
      if (open(index) && input.seatMakers[index] === input.preferMaker) return index;
    }
  }
  for (let step = 0; step < count; step += 1) {
    const index = (((input.offset + step) % count) + count) % count;
    if (open(index)) return index;
  }
  return null;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run tests/unit/shape-plan.test.ts` — Expected: PASS. Add both files to the shipped-corpus manifest.

- [ ] **Step 5: Commit**

```bash
git add apps/runner/src/shape-plan.ts apps/runner/src/shape-seats.ts tests/unit/shape-plan.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "runner: the debate shape's breadth-first plan, scrutiny slots and seat rules (pure), checked against P2a's count

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Adaptive chains and scrutiny needs (pure)

**Files:**
- Create: `apps/runner/src/shape-select.ts`, `tests/unit/shape-select.test.ts`

**Interfaces:**

```ts
export function shapeSelectChains(input: Readonly<{ chainsByRoot: ReadonlyMap<number, readonly number[]>;
  leverageOf: (position: number) => number | null; frozen: ReadonlySet<number>; perRoot: number }>): ReadonlySet<number>;
export type ScrutinyCandidate = Readonly<{ position: number; rootIndex: number; dispersion: number | null; disputed: boolean;
  rootLeverage: number | null; baseTau: number }>;
export function shapeRankScrutiny(input: Readonly<{ candidates: readonly ScrutinyCandidate[]; disagreementThreshold: number;
  leverageMin: number; weakBelow: number; pointsPerDebate: number }>): readonly ScrutinyCandidate[];
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shape-select.test.ts
import { describe, expect, it } from "vitest";
import { shapeRankScrutiny, shapeSelectChains, type ScrutinyCandidate } from "../../apps/runner/src/shape-select.js";

describe("adaptive chains (spec §3.3 step 5)", () => {
  it("keeps the X chains per position with the highest root leverage; frozen and unscored chains never", () => {
    const leverage = new Map([[10, 0.2], [11, 0.4], [12, 0.1], [13, null], [20, 0.05], [21, 0.3]]);
    const selected = shapeSelectChains({ chainsByRoot: new Map([[0, [10, 11, 12, 13]], [1, [20, 21]]]),
      leverageOf: (position) => leverage.get(position) ?? null, frozen: new Set([11]), perRoot: 2 });
    expect([...selected].sort()).toEqual([10, 12, 20, 21]);
  });
  it("breaks leverage ties by plan order", () => {
    const selected = shapeSelectChains({ chainsByRoot: new Map([[0, [12, 10, 11]]]), leverageOf: () => 0.3, frozen: new Set(), perRoot: 1 });
    expect([...selected]).toEqual([10]);
  });
});

describe("scrutiny needs (spec §3.3 step 7)", () => {
  const node = (position: number, extra: Partial<ScrutinyCandidate>): ScrutinyCandidate =>
    ({ position, rootIndex: 0, dispersion: 0.1, disputed: false, rootLeverage: 0.01, baseTau: 0.8, ...extra });
  it("ranks by number of needs, then leverage, then plan order; drops the needless; caps at the budget", () => {
    const ranked = shapeRankScrutiny({ disagreementThreshold: 0.25, leverageMin: 0.05, weakBelow: 0.5, pointsPerDebate: 3, candidates: [
      node(5, {}),                                                         // no need
      node(6, { dispersion: 0.3 }),                                         // 1 need
      node(7, { disputed: true, dispersion: 0.4 }),                         // 2 needs
      node(8, { rootLeverage: 0.2, baseTau: 0.3 }),                         // 1 need (weak and carrying), leverage 0.2
      node(9, { disputed: true }),                                          // 1 need, leverage 0.01
      node(10, { dispersion: 0.25, disputed: true, rootLeverage: 0.06, baseTau: 0.1 }) // 3 needs
    ] });
    expect(ranked.map((entry) => entry.position)).toEqual([10, 7, 8]);
  });
  it("a node without leverage can still be needy by spread or dispute", () => {
    const ranked = shapeRankScrutiny({ disagreementThreshold: 0.25, leverageMin: 0.05, weakBelow: 0.5, pointsPerDebate: 6,
      candidates: [node(3, { rootLeverage: null, dispersion: 0.5 }), node(4, { rootLeverage: null, baseTau: 0.1 })] });
    expect(ranked.map((entry) => entry.position)).toEqual([3]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/shape-select.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// apps/runner/src/shape-select.ts
/**
 * Debate shape — the two choices the propagated numbers make (pure code; no model is asked):
 *  · adaptive deeper rounds (spec §3.3 step 5): at the round-1 boundary, per position, the `deeperTopPoints` chosen
 *    points with the highest ROOT leverage (resolveLeverage: the largest change in any root when the point is
 *    removed) keep their chains; a frozen (ε) or unscored point never does. Later rounds extend the same chains.
 *  · scrutiny (step 7): after the planned rounds, nodes ranked by need — a spread at or above the disagreement
 *    threshold, a reviewer dispute, or root leverage ≥ leverageMin with base strength < weakBelow — then leverage,
 *    then plan order; at most `pointsPerDebate`.
 */
export function shapeSelectChains(input: Readonly<{ chainsByRoot: ReadonlyMap<number, readonly number[]>;
  leverageOf: (position: number) => number | null; frozen: ReadonlySet<number>; perRoot: number }>): ReadonlySet<number> {
  const selected = new Set<number>();
  for (const chains of input.chainsByRoot.values()) {
    const scored = chains.flatMap((position) => {
      if (input.frozen.has(position)) return [];
      const leverage = input.leverageOf(position);
      return leverage === null ? [] : [{ position, leverage }];
    });
    scored.sort((left, right) => right.leverage - left.leverage || left.position - right.position);
    for (const entry of scored.slice(0, input.perRoot)) selected.add(entry.position);
  }
  return selected;
}

export type ScrutinyCandidate = Readonly<{ position: number; rootIndex: number; dispersion: number | null; disputed: boolean;
  rootLeverage: number | null; baseTau: number }>;

export function shapeRankScrutiny(input: Readonly<{ candidates: readonly ScrutinyCandidate[]; disagreementThreshold: number;
  leverageMin: number; weakBelow: number; pointsPerDebate: number }>): readonly ScrutinyCandidate[] {
  const needs = (node: ScrutinyCandidate): number =>
    (node.dispersion !== null && node.dispersion >= input.disagreementThreshold ? 1 : 0)
    + (node.disputed ? 1 : 0)
    + (node.rootLeverage !== null && node.rootLeverage >= input.leverageMin && node.baseTau < input.weakBelow ? 1 : 0);
  return Object.freeze(input.candidates
    .map((node) => ({ node, needs: needs(node) }))
    .filter((entry) => entry.needs > 0)
    .sort((left, right) => right.needs - left.needs
      || (right.node.rootLeverage ?? -1) - (left.node.rootLeverage ?? -1)
      || left.node.position - right.node.position)
    .slice(0, input.pointsPerDebate)
    .map((entry) => entry.node));
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run tests/unit/shape-select.test.ts` — Expected: PASS. Add the file to the shipped-corpus manifest.

- [ ] **Step 5: Commit**

```bash
git add apps/runner/src/shape-select.ts tests/unit/shape-select.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "runner: adaptive chain choice by root leverage and scrutiny need ranking (pure)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Panels of J graders and the close-call extension

**Files:**
- Modify: `apps/runner/src/shape-select.ts` (add `shapeCloseCallExtraSeats`), `apps/runner/src/index.ts` (`runNodePanel`, `saveAuthored`)
- Create: `tests/unit/shape-close-call.test.ts`

**Interfaces:**

```ts
export function shapeCloseCallFires(dispersion: number | null, threshold: number, extra: number): boolean;
export function shapeCloseCallExtraSeats(input: Readonly<{ seatMakers: readonly (string | null)[]; called: readonly boolean[];
  authorMaker: string; onPanelMakers: readonly string[]; extra: number; offset: number }>): readonly number[];
// runNodePanel's result gains:
readonly closeCallAdded: number;   // members the close-call extension called (0: none)
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shape-close-call.test.ts
import { describe, expect, it } from "vitest";
import { applyCorrelatedErrorDiscount, measureDispersion, selectReducedJudgement, type JudgementSelectionRule } from "@debateai/judgement";
import { shapeCloseCallExtraSeats, shapeCloseCallFires } from "../../apps/runner/src/shape-select.js";

const ROW = { rowKey: "test", registerVersion: 1, sourceRef: "test" };
const RULE = { kind: "MAXIMIZE_WEIGHTED_TAU", ...ROW } as JudgementSelectionRule;
type Voice = { ref: string; tau: number; family: string | null };
const reduce = (voices: readonly Voice[]) => {
  const weighted = applyCorrelatedErrorDiscount(voices.map((voice) => ({ memberRole: voice.ref, earnedWeight: 1,
    family: voice.family === null ? { kind: "UNKNOWN" as const, reason: "test" } : { kind: "KNOWN" as const, familyRef: voice.family } })),
  { repeatedFamilyMultiplier: 0.5, ...ROW });
  const selected = selectReducedJudgement(voices.map((voice, index) => ({ judgementRef: voice.ref, tau: voice.tau, effectiveWeight: weighted[index]!.effectiveWeight })), RULE);
  const spread = measureDispersion(voices.map((voice) => ({ judgementRef: voice.ref, tau: voice.tau })), { scale: 1, ...ROW });
  if (selected.kind !== "SELECTED") throw new Error("test");
  return { score: selected.selectionScore, spread: spread.kind === "MEASURED" ? spread.value : 0 };
};

describe("the close-call extension (spec §3.3 step 6; §6: the highest-voice rule is unchanged)", () => {
  it("fires only on a measured spread at or above the threshold, with extras allowed", () => {
    expect(shapeCloseCallFires(0.25, 0.25, 2)).toBe(true);
    expect(shapeCloseCallFires(0.24, 0.25, 2)).toBe(false);
    expect(shapeCloseCallFires(null, 0.25, 2)).toBe(false);
    expect(shapeCloseCallFires(0.9, 0.25, 0)).toBe(false);
  });

  it("calls up to E seats not yet called, of makers not on the panel and not the author's, rotating", () => {
    expect(shapeCloseCallExtraSeats({ seatMakers: ["a", "b", "c", "d", "e", "c"], called: [false, true, true, false, false, false],
      authorMaker: "a", onPanelMakers: ["b", "c"], extra: 2, offset: 4 })).toEqual([4, 3]);
    expect(shapeCloseCallExtraSeats({ seatMakers: ["a", "b"], called: [false, true], authorMaker: "a", onPanelMakers: ["b"], extra: 2, offset: 0 })).toEqual([]);
  });

  it("extra voices only RAISE the selected score or WIDEN the spread, never lower either (every order, every family mix)", () => {
    const taus = [0.1, 0.35, 0.6, 0.9];
    const families = [null, "f1", "f2"];
    for (let seed = 0; seed < 500; seed += 1) {
      const pick = <T,>(list: readonly T[], at: number): T => list[(seed * 7 + at * 13) % list.length]!;
      const base: Voice[] = [0, 1, 2].map((at) => ({ ref: `j${String(at)}`, tau: pick(taus, at), family: pick(families, at + seed) }));
      const extras: Voice[] = [3, 4].map((at) => ({ ref: `j${String(at)}`, tau: pick(taus, at + seed), family: pick(families, at) }));
      const before = reduce(base);
      const after = reduce([...base, ...extras]);
      expect(after.score, `seed ${String(seed)}`).toBeGreaterThanOrEqual(before.score);
      expect(after.spread, `seed ${String(seed)}`).toBeGreaterThanOrEqual(before.spread);
    }
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/shape-close-call.test.ts` — Expected: FAIL (helpers missing).

- [ ] **Step 3: Implement**

`apps/runner/src/shape-select.ts`:

```ts
/** Spec §3.3 step 6: a close call (measured spread ≥ the disagreement threshold) gains up to E graders. */
export function shapeCloseCallFires(dispersion: number | null, threshold: number, extra: number): boolean {
  return extra > 0 && dispersion !== null && dispersion >= threshold;
}

/**
 * The extra seats: not called yet, with a maker that is neither the author's nor already on the panel, at most one
 * per maker, in rotation from `offset`. Appended AFTER the panel's members, so the repeated-family discount never
 * re-weights a voice already heard: under the unchanged highest-voice rule an extra can only raise the selected score
 * or widen the spread (spec §6).
 */
export function shapeCloseCallExtraSeats(input: Readonly<{ seatMakers: readonly (string | null)[]; called: readonly boolean[];
  authorMaker: string; onPanelMakers: readonly string[]; extra: number; offset: number }>): readonly number[] {
  const count = input.seatMakers.length;
  const taken = new Set([input.authorMaker, ...input.onPanelMakers]);
  const chosen: number[] = [];
  for (let step = 0; step < count && chosen.length < input.extra; step += 1) {
    const index = (input.offset + step) % count;
    const maker = input.seatMakers[index];
    if (maker === null || maker === undefined || input.called[index] === true || taken.has(maker)) continue;
    taken.add(maker);
    chosen.push(index);
  }
  return Object.freeze(chosen);
}
```

`apps/runner/src/index.ts`, in `runNodePanel` (all changes guarded by `shapeRun !== null`; `shapeRun` is the
execute-scope constant Task 12 introduces — declare it in this task, right after `envelopeBasis` is parsed (~4952), as
`const shapeShape = envelopeBasis.shape ?? null;` and let Task 12 wrap it):

1. The cap: `const panelCallCap = shapeShape === null ? Math.max(effectiveMakerCount, envelopeBasis.panelSize) - 1 : Math.min(shapeShape.graders, effectiveMakerCount - 1);`
2. Build each member through one function `memberFor(seat, panelOptions, planned)` (the body of today's
   `panelMembers.flatMap` callback for a called seat), so the extension reuses it.
3. Move today's reduction (from `const reducedMembers =` to the `selection` check, ~lines 6014–6074) into a local
   `const reduceHeard = (heard: typeof panel.judgements) => { … return { reducedMembers, dispersion, weighted, selection }; }`
   without changing a statement in it, and call it once as today: `let reduced = reduceHeard(panel.judgements);`.
4. Then the extension:

```ts
      let heard = panel.judgements;
      let notes = panel.notes;
      let closeCallAdded = 0;
      const firstDispersion = reduced.dispersion.kind === "MEASURED" ? reduced.dispersion.value : null;
      if (shapeShape !== null && spendStop === null
        && shapeCloseCallFires(firstDispersion, panelPolicy.disagreementThreshold, shapeShape.closeCallExtraGraders)) {
        const extraSeats = shapeCloseCallExtraSeats({
          seatMakers: plannedSeats.map((entry) => entry.planned?.maker ?? null),
          called: calledSeats,
          authorMaker: input.authorMaker,
          onPanelMakers: heard.map((entry) => entry.memberRole),
          extra: shapeShape.closeCallExtraGraders,
          offset: seatRotationOffset({ runId: run.runId, role: "JUDGE", callSiteKey: `${input.callSiteKey}:close-call` })
        });
        if (extraSeats.length > 0) {
          const extension = await runJudgePanel({
            artifactProducerRef: input.authorProviderRef,
            primary: { judgementRef: input.authorJudgementRef, assessment: input.authorAssessment, memberRole: input.authorMaker },
            members: extraSeats.map((index) => memberFor(plannedSeats[index]!.seat, plannedSeats[index]!.panelOptions, plannedSeats[index]!.planned!)),
            askTogether: callsRunTogether,
            onRunLevelSpendStop: "RETHROW",
            leaveOutMoneyRefusedSeats: this.settings.bodyCostFallback === true
          });
          // The author is judgements[0] of both runs: kept once. The extras come AFTER every voice already heard.
          heard = [...heard, ...extension.judgements.slice(1)];
          notes = [...notes, ...extension.notes];
          closeCallAdded = extension.judgements.length - 1;
          if (closeCallAdded > 0) reduced = reduceHeard(heard);
        }
      }
```

and use `reduced.*`, `heard`, `notes` where today's code reads `reducedMembers`, `dispersion`, `weighted`, `selection`,
`panel.notes` after that point (degradation marks, declared disagreement, the receipt), returning
`closeCallAdded` as a new member of the result object. An extra member's spend refusal travels as every non-root panel's
does (`RETHROW` → the caller's `expansionPhaseStop`). Root 0's panel (`onSpendStop: "AUTHOR_ONLY"`) extends too: its
extension is a separate run that rethrows, so a stop there is caught by `rootZeroChain` exactly as a stop on any other
panel member; root 0 itself is already authored and is kept.

5. In `saveAuthored`, after the `panelDegradations.push(...)` block, record the extension on the node it extended:

```ts
        if (childSelection.closeCallAdded > 0) {
          closeCallExtensions.push(Object.freeze({ nodeId: created, added: childSelection.closeCallAdded }));
        }
```

with `const closeCallExtensions: { readonly nodeId: string; readonly added: number }[] = [];` declared beside
`panelDegradations` (~5766). Task 14 turns them into `PANEL-CLOSE-CALL-EXTENDED` records.

With `shapeShape === null` every line above is today's (cap, one `runJudgePanel`, one reduction, `closeCallAdded: 0`).

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run tests/unit/shape-close-call.test.ts tests/unit/t03-judge-panel.test.ts` then the light typecheck
`pnpm exec tsc -p apps/runner --noEmit`. Expected: PASS. (The runner path is proved end to end in Task 15.)

- [ ] **Step 5: Commit**

```bash
git add apps/runner/src/shape-select.ts apps/runner/src/index.ts tests/unit/shape-close-call.test.ts
git commit -m "runner: J graders per node and the close-call extension (re-reduced, highest-voice rule unchanged)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The map stage in the runner

**Files:**
- Create: `apps/runner/src/map-stage.ts`, `tests/unit/map-stage.test.ts`
- Modify: `apps/runner/src/index.ts` (execute: shape gate, the map before root 0, map storage, `debateShapeMap`; constructor: `#mapChoices`; `KNOWN_DOMAIN_CODES` += `DEBATE_SHAPE_RUNNER_UNCONFIGURED`, `MAP_ROW_INVALID`, `MAP_GAP_ITEM_UNKNOWN`), `WalkingSkeletonSettings` (`mapChoices?: { store: Pick<MapChoiceRepository, "writeMapRun" | "writeMapPosition" | "readMapResultForRun"> }`)

**Interfaces:**

```ts
// apps/runner/src/map-stage.ts
export type MapStageMember = Readonly<{ provider: ProviderGateway; providerRef: string }>;
export type MapStageDeps = Readonly<{
  runId: string; subjectItemId: string; mapContractHash: string; judgeBound: CallBound;
  longBounds: Readonly<{ merge: number; choose: number }>;
  memberOf: (aiRef: string) => MapStageMember | null;
  sitsOut: (aiRef: string) => boolean;
  satOutBy: (error: unknown) => boolean;
  spendStopOf: (error: unknown) => EnvelopeStopKind | null;
  laneStopped: (error: unknown) => boolean;
  abandon: (error: unknown) => boolean;
  serial: boolean;
}>;
export type RunnerMapCaller = MapCaller & Readonly<{ spendStop: () => EnvelopeStopKind | null; stopped: () => boolean }>;
export function mapStageBound(bound: CallBound, step: MapStep, longBounds: Readonly<{ merge: number; choose: number }>): CallBound;
export function createRunnerMapCaller(deps: MapStageDeps): RunnerMapCaller;
export function mapStageSeats(seats: readonly Readonly<{ main: Readonly<{ providerRef: string; maker: string }> }>[], mapAIs: number): readonly MapSeat[];
export function runMapStage(input: Readonly<{ opening: DebateShapeOpening; map: MapRunInput }>): Promise<MapResult>;
export function mapConditionRecords(result: MapResult, runId: string): readonly ConditionMarkRecord[];
```

`EnvelopeStopKind` is imported as a type from `./index.js` (type-only import: no cycle at run time).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/map-stage.test.ts
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { mapAnglesSpec, mapPromptContractHash, type MapCallRequest } from "@debateai/map";
import type { ProviderCallRequest, ProviderGateway } from "@debateai/providers";
import { createRunnerMapCaller, mapConditionRecords, mapStageBound, mapStageSeats, type MapStageDeps } from "../../apps/runner/src/map-stage.js";

const BOUND = { maxAttempts: 3, tokenCeiling: 8_192, deadlineMs: 1_260_000 };
const ANGLES = JSON.stringify({ angles: [
  { angle_id: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The case against." },
  { angle_id: "worry", kind: "ASKER_WORRY", label: "The worry", focus: "What the asker fears." },
  { angle_id: "do", kind: "PRACTICAL", label: "What to do", focus: "What to do first." },
  { angle_id: "cost", kind: "SPECIFIC", label: "The cost", focus: "Who pays." }] });
const request = (callSiteKey = "MAP:angles"): MapCallRequest<unknown> => ({ step: "ANGLES", callSiteKey, seat: { aiRef: "ref-a", maker: "a" }, order: 0, shown: "BLIND",
  spec: mapAnglesSpec({ questionLine: "Should buses be free?", languageName: "English", languageTag: "en" }) as never });
const deps = (provider: ProviderGateway, extra: Partial<MapStageDeps> = {}): MapStageDeps => ({
  runId: "run-1", subjectItemId: "wi-1", mapContractHash: mapPromptContractHash(), judgeBound: BOUND, longBounds: { merge: 32_768, choose: 32_768 },
  memberOf: () => ({ provider, providerRef: "ref-a" }), sitsOut: () => false, satOutBy: () => false,
  spendStopOf: (error) => error instanceof TypedDomainError && error.code === "RUN_COST_ENVELOPE_MONEY_REACHED" ? "MONEY" : null,
  laneStopped: (error) => error instanceof TypedDomainError && (error.code === "CALL_LANE_STOPPED" || error.code === "CALL_LANE_HELD_BACK"),
  abandon: (error) => error instanceof TypedDomainError && error.code === "RUNNER_CLAIM_LOST", serial: false, ...extra });
const answering = (content: string, seen: ProviderCallRequest[] = []): ProviderGateway => ({
  call: async (call: ProviderCallRequest) => { seen.push(call); return { content } as never; } } as ProviderGateway);
const throwing = (error: unknown): ProviderGateway => ({ call: async () => { throw error; } } as unknown as ProviderGateway);

describe("the runner's map caller", () => {
  it("sends a JUDGE/served call under the map hash, no model role, the step's bound", async () => {
    const seen: ProviderCallRequest[] = [];
    const outcome = await createRunnerMapCaller(deps(answering(ANGLES, seen))).call(request());
    expect(outcome.kind).toBe("OK");
    expect(seen[0]).toMatchObject({ callSiteKey: "MAP:angles", role: "JUDGE", lane: "served", contractHash: mapPromptContractHash(),
      providerRef: "ref-a", subjectItemId: "wi-1", bound: BOUND });
    expect(seen[0]).not.toHaveProperty("modelRole");
    expect(mapStageBound(BOUND, "MERGE", { merge: 32_768, choose: 16_384 }).tokenCeiling).toBe(32_768);
    expect(mapStageBound(BOUND, "CHOOSE", { merge: 32_768, choose: 16_384 }).tokenCeiling).toBe(16_384);
    expect(mapStageBound(BOUND, "LIST", { merge: 32_768, choose: 16_384 })).toBe(BOUND);
  });

  it("a money refusal is STOPPED and remembered; a lane stop is STOPPED; a busy member is BUSY; a format failure is FAILED", async () => {
    const money = createRunnerMapCaller(deps(throwing(new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "x"))));
    expect(await money.call(request())).toEqual({ kind: "STOPPED", code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
    expect(money.spendStop()).toBe("MONEY");
    expect(money.stopped()).toBe(true);
    expect(await createRunnerMapCaller(deps(throwing(new TypedDomainError("CALL_LANE_HELD_BACK", "x")))).call(request()))
      .toEqual({ kind: "STOPPED", code: "CALL_LANE_HELD_BACK" });
    const busy = new Error("busy");
    expect(await createRunnerMapCaller(deps(throwing(busy), { satOutBy: (error) => error === busy })).call(request()))
      .toEqual({ kind: "BUSY", code: "MAKER_SAT_OUT" });
    expect(await createRunnerMapCaller(deps(answering("not json"))).call(request())).toMatchObject({ kind: "FAILED" });
    expect(await createRunnerMapCaller(deps(answering(ANGLES), { sitsOut: () => true })).call(request()))
      .toEqual({ kind: "BUSY", code: "MAKER_SAT_OUT" });
  });

  it("a lost claim is rethrown (the orchestrator then rethrows it: the run is abandoned)", async () => {
    const lost = new TypedDomainError("RUNNER_CLAIM_LOST", "x");
    await expect(createRunnerMapCaller(deps(throwing(lost))).call(request())).rejects.toBe(lost);
  });

  it("serial mode sends one call at a time, in the order asked", async () => {
    let inFlight = 0;
    let most = 0;
    const order: string[] = [];
    const slow: ProviderGateway = { call: async (call: ProviderCallRequest) => {
      inFlight += 1; most = Math.max(most, inFlight); order.push(call.callSiteKey);
      await new Promise((resolve) => setTimeout(resolve, 5)); inFlight -= 1; return { content: ANGLES } as never; } } as ProviderGateway;
    const caller = createRunnerMapCaller(deps(slow, { serial: true }));
    await Promise.all(["MAP:angles", "MAP:list:0", "MAP:list:1"].map((key) => caller.call(request(key))));
    expect(most).toBe(1);
    expect(order).toEqual(["MAP:angles", "MAP:list:0", "MAP:list:1"]);
  });

  it("map seats: the first A seats of the distinct-maker order", () => {
    const seat = (providerRef: string, maker: string) => ({ main: { providerRef, maker } });
    expect(mapStageSeats([seat("g1", "glm"), seat("g2", "glm"), seat("d", "ds"), seat("q", "qw")], 3))
      .toEqual([{ aiRef: "g1", maker: "glm" }, { aiRef: "d", maker: "ds" }, { aiRef: "q", maker: "qw" }]);
  });

  it("each map mark becomes an answer-scope record with no node and no detail text", () => {
    const records = mapConditionRecords({ marks: [{ mark: "MAP_MERGE_FALLBACK", step: "MERGE", detail: "merge reply missing" },
      { mark: "CHOOSE_QUOTA_FILLED", step: "CHOOSE", detail: "pt07" }] } as never, "run-1");
    expect(records).toEqual([
      { mark: "MAP_MERGE_FALLBACK", scope: "answer", subjectRef: "run-1", reason: "MAP_MERGE_FALLBACK:MERGE", liftPath: null, servedRootRule: null, affectedNodeIds: [] },
      { mark: "CHOOSE_QUOTA_FILLED", scope: "answer", subjectRef: "run-1", reason: "CHOOSE_QUOTA_FILLED:CHOOSE", liftPath: null, servedRootRule: null, affectedNodeIds: [] }]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/map-stage.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// apps/runner/src/map-stage.ts
import { TypedDomainError } from "@debateai/kernel";
import {
  mapErrorCodeOf, mapProviderPieces, mapRunAngleMap, mapRunBlindLists, mapRunSnowball,
  type MapCallOutcome, type MapCallRequest, type MapCaller, type MapResult, type MapRunInput, type MapSeat, type MapStep
} from "@debateai/map";
import type { CallBound, ProviderGateway } from "@debateai/providers";
import type { DebateShapeOpening } from "@debateai/register";
import type { ConditionMarkRecord } from "@debateai/serve";
import type { EnvelopeStopKind } from "./index.js";
import { shapeSeatOrder } from "./shape-seats.js";

/**
 * Debate shape (spec 2026-10-12 §3.3 step 1, §3.5) — THE MAP IN THE RUNNER. Each map call goes through the member's
 * own gateway stack (lane, sit-out book, keep-alive, counting gateway), so it waits for a slot, writes its MODEL_CALL
 * and spend rows under its MAP: key, and its repairs (patch, full re-ask) are attempts inside that key's allowance.
 * It never goes through the cooldown hold (no progress records for MAP: keys). A stop (money, attempts, lane) is
 * STOPPED: the orchestrator asks nothing more and finishes with its code fallbacks; a keep-alive refusal is rethrown.
 */
export type MapStageMember = Readonly<{ provider: ProviderGateway; providerRef: string }>;
export type MapStageDeps = Readonly<{
  runId: string; subjectItemId: string; mapContractHash: string; judgeBound: CallBound;
  longBounds: Readonly<{ merge: number; choose: number }>;
  memberOf: (aiRef: string) => MapStageMember | null;
  sitsOut: (aiRef: string) => boolean;
  satOutBy: (error: unknown) => boolean;
  spendStopOf: (error: unknown) => EnvelopeStopKind | null;
  laneStopped: (error: unknown) => boolean;
  abandon: (error: unknown) => boolean;
  serial: boolean;
}>;
export type RunnerMapCaller = MapCaller & Readonly<{ spendStop: () => EnvelopeStopKind | null; stopped: () => boolean }>;

/** Ruling R-2: merge and choose are long structured lists with thinking inside the room — the sealed map bounds; the rest the judge bound. */
export function mapStageBound(bound: CallBound, step: MapStep, longBounds: Readonly<{ merge: number; choose: number }>): CallBound {
  const ceiling = step === "MERGE" ? longBounds.merge : step === "CHOOSE" ? longBounds.choose : null;
  return ceiling === null || ceiling <= bound.tokenCeiling ? bound : Object.freeze({ ...bound, tokenCeiling: ceiling });
}

const MAKER_SAT_OUT = "MAKER_SAT_OUT";

export function createRunnerMapCaller(deps: MapStageDeps): RunnerMapCaller {
  let spendStop: EnvelopeStopKind | null = null;
  let stopped = false;
  let tail: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(send: () => Promise<T>): Promise<T> => {
    if (!deps.serial) return send();
    const turn = tail.then(send, send);
    tail = turn.then(() => undefined, () => undefined);
    return turn;
  };
  const call = async <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => {
    const member = deps.memberOf(request.seat.aiRef);
    if (member === null || deps.sitsOut(request.seat.aiRef)) return { kind: "BUSY", code: MAKER_SAT_OUT };
    try {
      const pieces = mapProviderPieces(request.spec);
      const response = await inTurn(() => member.provider.call({
        runId: deps.runId, subjectItemId: deps.subjectItemId, callSiteKey: request.callSiteKey, role: "JUDGE", lane: "served",
        bound: mapStageBound(deps.judgeBound, request.step, deps.longBounds), contractHash: deps.mapContractHash,
        providerRef: member.providerRef, packet: pieces.framed.packet,
        classifyContent: pieces.classifyContent, buildRepairPacket: pieces.buildRepairPacket
      }));
      return { kind: "OK", value: pieces.readAccepted(response.content) };
    } catch (error) {
      if (deps.abandon(error)) throw error;
      if (deps.laneStopped(error)) { stopped = true; return { kind: "STOPPED", code: mapErrorCodeOf(error) }; }
      const stop = deps.spendStopOf(error);
      if (stop !== null) { spendStop ??= stop; stopped = true; return { kind: "STOPPED", code: mapErrorCodeOf(error) }; }
      if (deps.satOutBy(error)) return { kind: "BUSY", code: MAKER_SAT_OUT };
      return { kind: "FAILED", code: mapErrorCodeOf(error) };
    }
  };
  return Object.freeze({ call, spendStop: () => spendStop, stopped: () => stopped });
}

/** The map AIs: the first `mapAIs` seats of the distinct-maker order (the opener-rotation seat plans). */
export function mapStageSeats(seats: readonly Readonly<{ main: Readonly<{ providerRef: string; maker: string }> }>[], mapAIs: number): readonly MapSeat[] {
  return Object.freeze(shapeSeatOrder(seats).slice(0, mapAIs).map((seat) => Object.freeze({ aiRef: seat.main.providerRef, maker: seat.main.maker })));
}

/** The opening the receipt names (ANGLE_MAP by ruling S1; the two comparison arms stay runnable). */
export function runMapStage(input: Readonly<{ opening: DebateShapeOpening; map: MapRunInput }>): Promise<MapResult> {
  switch (input.opening) {
    case "ANGLE_MAP": return mapRunAngleMap(input.map);
    case "BLIND_LISTS": return mapRunBlindLists(input.map);
    case "SNOWBALL": return mapRunSnowball(input.map);
    default: return exhaustiveOpening(input.opening);
  }
}
const exhaustiveOpening = (opening: never): never => { throw new TypedDomainError("DEBATE_SHAPE_OPENING_UNKNOWN", String(opening)); };

/** Spec §3.3: every map mark rides the answer with its typed record — the step as a code, never the detail text. */
export function mapConditionRecords(result: MapResult, runId: string): readonly ConditionMarkRecord[] {
  return Object.freeze(result.marks.map((record): ConditionMarkRecord => Object.freeze({
    mark: record.mark, scope: "answer" as const, subjectRef: runId, reason: `${record.mark}:${record.step}`,
    liftPath: null, servedRootRule: null, affectedNodeIds: Object.freeze([])
  } satisfies ConditionMarkRecord)));
}
```

(The repo's `exhaustive(` helper from `@debateai/kernel` replaces `exhaustiveOpening` if the scaffold rule requires that
exact name: use `default: return exhaustive(input.opening);`.)

`apps/runner/src/index.ts` — constructor: `readonly #mapChoices: Pick<MapChoiceRepository, "writeMapRun" | "writeMapPosition" | "readMapResultForRun">;`
and `this.#mapChoices = settings.mapChoices?.store ?? new MapChoiceRepository(pool);`.

`execute`, right after `envelopeBasis` is parsed (replace Task 11's `shapeShape` line):

```ts
    /**
     * Debate shape (spec 2026-10-12 §3): the sizes this run was admitted with (P2a: its receipt's `shape`), or null —
     * today's run, byte for byte. A shaped run needs the runner's shape settings (the sealed map hash) and a call
     * scheduler (its chains run through the lane; with no concurrency row the lane holds one call at a time).
     */
    const shapeShape = envelopeBasis.shape ?? null;
    if (shapeShape !== null && (this.settings.debateShape == null || callScheduler === undefined)) {
      throw new TypedDomainError("DEBATE_SHAPE_RUNNER_UNCONFIGURED",
        "This run was admitted with the debate shape, and this runner has no sealed map contracts or no call scheduler");
    }
    const shapeSettings = shapeShape === null ? null : debateShapeSettingsOf(run.depthParams);
```

After `effectiveMakerCount` is known (~5498): `const shapeRun = shapeShape !== null && effectiveMakerCount >= 2 ? Object.freeze({ shape: shapeShape, settings: shapeSettings!, mapContractHash: this.settings.debateShape!.mapContractHash }) : null;`
(a run left with one maker at claim keeps today's single-position path, spec §3.3 step 1), and every Task 11 use of
`shapeShape` inside `runNodePanel` reads `shapeRun?.shape ?? null` instead.

The map, inserted right after `let runBodyBudgetStop: EnvelopeStopKind | null = null;` (~6374) and the
JUDGEMENT_SCHEDULED append, BEFORE the plan is built (the plan needs the map's answers):

```ts
    /**
     * Debate shape, Stage 1 (spec §1, §3.3 step 1, §3.5): the map, before root 0. A re-claimed run finds its stored map
     * and asks nothing again. A stop during the map (money, attempts, lane) ends it with the code's fallbacks; the
     * arguing then stops after root 0 and the answer is written (O6). A keep-alive refusal abandons the run, as today.
     */
    let debateShapeMap: MapResult | null = null;
    let shapeMapResult: MapResult | null = null;
    let mapSpendStop: EnvelopeStopKind | null = null;
    if (shapeRun !== null) {
      shapeMapResult = await this.#mapChoices.readMapResultForRun(run.runId);
      if (shapeMapResult === null) {
        const mapCaller = createRunnerMapCaller({
          runId: run.runId, subjectItemId: claimed.workItemId, mapContractHash: shapeRun.mapContractHash,
          judgeBound: this.settings.judgeBound,
          longBounds: { merge: shapeRun.shape.mapMergeBound, choose: shapeRun.shape.mapChooseBound },
          memberOf: (aiRef) => configuredMakers.find((maker) => maker.providerRef === aiRef) ?? null,
          sitsOut: (aiRef) => sitOut !== null && sitOut.sitsOut(aiRef),
          satOutBy: (error) => sitOut !== null && sitOut.haltsAtOnce(error),
          spendStopOf: expansionPhaseStop,
          laneStopped: (error) => callHeldBack(error) || (error instanceof TypedDomainError && error.code === CALL_LANE_STOPPED),
          abandon: keepAliveStop,
          serial: !callsRunTogether
        });
        // Spec §2.3 (O6), the map's own guard: once the map has stopped, no queued map call starts.
        callLane?.guardStarts(() => !mapCaller.stopped());
        try {
          shapeMapResult = await runMapStage({ opening: shapeRun.shape.opening, map: {
            questionLine: run.questionLine, languageName: run.argumentLanguageName, languageTag: run.argumentLanguageTag,
            seats: mapStageSeats(rootSeats, shapeRun.shape.mapAIs), caller: mapCaller, abandon: keepAliveStop, seed: run.runId,
            gapRoundsMax: shapeRun.shape.gapRounds, maxAnswers: shapeRun.shape.answers, pointsPerAnswer: shapeRun.shape.pointsPerAnswer
          } });
        } catch (error) {
          callLane?.stop();
          throw error;
        } finally {
          callLane?.guardStarts(null);
        }
        mapSpendStop = mapCaller.spendStop();
        await this.#mapChoices.writeMapRun({ runId: run.runId, result: shapeMapResult,
          answerCount: Math.min(shapeRun.shape.answers, shapeDistinctMakers(rootSeats, seatSitsOut)) });
      }
      if (shapeMapResult.kind === "MAP" && shapeMapResult.choice !== null) debateShapeMap = shapeMapResult;
    }
```

`rootSeats` must exist before this block: move the map block to just AFTER `const rootSeats: RunSeat[] = [...seatBook.position];`
(~6395) and, in a shaped run, reorder it there first:
`if (shapeRun !== null) rootSeats.splice(0, rootSeats.length, ...shapeSeatOrder(rootSeats));` (the opener stays first).
`shapeDistinctMakers(seats, sitsOut)` is a three-line helper in `shape-seats.ts` (distinct makers among seats not sitting
out); add it there with a unit case in `tests/unit/shape-plan.test.ts` (`[glm, glm, ds] → 2`).

Right after `const noteSpendStop = …` is declared (~6497):

```ts
    // Spec §3.3 / O6: a stop during the map is a stop before everything in today's order.
    if (mapSpendStop !== null) { runBodyBudgetStop ??= mapSpendStop; noteSpendStop([]); }
```

Imports to add in `index.ts`: `MapChoiceRepository, type MapResult` from `@debateai/map`; `debateShapeSettingsOf` from
`@debateai/contract`; `createRunnerMapCaller, mapStageSeats, runMapStage, mapConditionRecords` from `./map-stage.js`;
`shapeSeatOrder, shapeDistinctMakers` from `./shape-seats.js`.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run tests/unit/map-stage.test.ts tests/unit/shape-plan.test.ts` then `pnpm exec tsc -p apps/runner --noEmit`.
Expected: PASS (the map in a real run is proved in Task 15).

- [ ] **Step 5: Commit**

```bash
git add apps/runner/src/map-stage.ts apps/runner/src/shape-seats.ts apps/runner/src/index.ts tests/unit/map-stage.test.ts tests/unit/shape-plan.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "runner: the map stage before root 0 — MapCaller over the member gateways, stops, storage, re-claim reuse

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Arguing the shape: assigned roots, round-1 points, sparse cross-replies, breadth-first rounds

**Files:**
- Modify: `apps/runner/src/index.ts` (execute: the plan, roots, `legChain`, review batches, `closeGlobalRound`, map positions)

**Interfaces (execute-local; no export changes):**

```ts
const shapePositions: readonly ShapePositionPlan[] | null;
const shapePlan: ShapePlan | null;
const rootCount: number;                         // shapePlan?.rootCount ?? effectiveMakerCount
const chainsRun: boolean;                        // callsRunTogether || shapePlan !== null
const deselectedIndices: Set<number>;            // adaptive: legs of chains not kept at the round-1 boundary
const shapeLegAt: (position: number) => ShapeLeg | null;
```

- [ ] **Step 1: Write the failing test**

The behaviour is a whole debate; its failing test is Task 15's `tests/integration/debate-shape-run.test.ts` first case
("a shaped debate at depth 2 argues P assigned positions, K points each, one cross-reply each, adaptive exchanges, and
serves an answer"). Write Task 15 Step 1's harness and that first case NOW, run it, and see it fail with
`DEBATE_SHAPE_RUNNER_UNCONFIGURED` absent and the run arguing today's shape (it saves M roots and M(M−1) cross-replies):

Run (alone): `pnpm exec vitest run tests/integration/debate-shape-run.test.ts -t "argues P assigned positions"`
Expected: FAIL (root and cross counts are today's).

- [ ] **Step 2: Implement the plan and the roots**

Replace the plan block (~6435–6439):

```ts
    const shapePositions = shapeRun === null ? null
      : debateShapeMap !== null
        ? shapePositionsFromMap({ choice: debateShapeMap.choice!, keyPoints: debateShapeMap.keyPoints,
          answers: Math.min(shapeRun.shape.answers, shapeDistinctMakers(rootSeats, seatSitsOut)), pointsPerAnswer: shapeRun.shape.pointsPerAnswer })
        : shapePositionsForTodaysOpening({ answers: Math.min(shapeRun.shape.answers, shapeDistinctMakers(rootSeats, seatSitsOut)),
          pointsPerAnswer: shapeRun.shape.pointsPerAnswer });
    const shapePlan = shapePositions === null ? null : buildShapePlan({ positions: shapePositions, depth: expansionDepth,
      scrutiny: { roundsPerPoint: shapeRun!.shape.scrutinyRoundsPerPoint, pointsPerDebate: shapeRun!.shape.scrutinyPointsPerDebate } });
    const rootCount = shapePlan?.rootCount ?? effectiveMakerCount;
    const expansionPlan: readonly MultiMakerExpansionLeg[] = shapePlan !== null ? shapePlan.legs
      : effectiveMakerCount > 1 ? buildMultiMakerExpansionPlan(expansionDepth, effectiveMakerCount) : [];
    const crossExchangePlan = shapePlan !== null ? [] : buildCrossRootExchangePlan(effectiveMakerCount);
    const totalPlannedNodes = shapePlan?.totalPlannedNodes ?? effectiveMakerCount + expansionPlan.length + crossExchangePlan.length;
    const shapeLegAt = (position: number): ShapeLeg | null => shapePlan === null ? null
      : (shapePlan.legs[position - shapePlan.rootCount] ?? scrutinyLegs.get(position) ?? null);
    const scrutinyLegs = new Map<number, ShapeLeg>();
    const deselectedIndices = new Set<number>();
    const chainsRun = callsRunTogether || shapePlan !== null;
```

`rootCount` replaces `effectiveMakerCount` as THE NUMBER OF ROOTS at exactly these sites (keep every other use, which
counts makers): the review batch ends (~7169–7178), the serial root loop (~7392), `selectAuthoritativeRootScope`'s
input and the root map in `closeGlobalRound` (~7433–7435), the boundary end (~7565), the chain loop over roots
(~7723), the digest's `authoredMakerPositions` (~7926) and `decideMakerPositionServe`'s `effectiveMakerCount` input
(~7983: it counts the servable roots; a shaped run always has P ≥ 2, so the footing is never MONO_MAKER). The two
cross-exchange position formulas (~7660, ~7730, ~7905) are unchanged (the shape's `crossExchangePlan` is empty). The
review batch ends gain the scrutiny rounds:
`if (shapePlan !== null) for (let round = 1; round <= shapePlan.scrutiny.roundsPerNode; round += 1) ends.push(shapePlan.scrutiny.start + round * 2 * shapePlan.scrutiny.nodesPerDebate);`
before the final `ends.push(…, totalPlannedNodes)`.

Root legs. `openFirstPosition` takes the leg: `const openFirstPosition = async (primarySeat: RunSeat, leg: JudgeLeg = { kind: "primary-root" }) => …`
and passes `leg` to `member.judge.judge({ … leg, … })`. Add:

```ts
    /** Spec §3.3 step 2: root i argues answer i (assigned-root); without a map, today's legs. */
    const rootLegOf = (rootIndex: number): JudgeLeg => {
      const position = shapePositions?.[rootIndex];
      if (position === undefined || position.statement === null || position.mapPoints === null) {
        return rootIndex === 0 ? { kind: "primary-root" } : { kind: "independent-root" };
      }
      return { kind: "assigned-root", assignedAnswer: position.statement, mapPoints: position.mapPoints };
    };
```

`openFirstPosition(rootSeats[0]!, rootLegOf(0))` at both call sites (the swap loop too), and in `rootChain`
`leg: rootLegOf(rootIndex)`. Root 0 keeps today's rule (it must exist; MAKER_POSITION_UNAVAILABLE otherwise).

Hand-over (spec §3.3 step 2). Replace `dropSatOutRoot`:

```ts
    const dropSatOutRoot = (rootIndex: number): boolean => {
      if (!rootSitsOut(rootIndex)) return false;
      if (shapePlan !== null) {
        const handOver = shapeHandOverRoot({ makers: rootSeats.map((seat) => seat.main.maker), rootCount, rootIndex, sitsOut: rootSitsOut });
        if (handOver.kind === "SWAP") { [rootSeats[rootIndex], rootSeats[handOver.withIndex]] = [rootSeats[handOver.withIndex]!, rootSeats[rootIndex]!]; return false; }
        if (handOver.kind === "SHARE") { rootSeats[rootIndex] = rootSeats[handOver.withIndex]!; return false; }
      }
      satOutDuringRun.add(rootIndex);
      return true;
    };
```

(`rootSitsOut` reads `rootSeats`, so after a swap the root's seat is a working one; with `SHARE` two roots share a seat
and its maker argues two answers.)

Map positions: in `rootZeroChain` and `rootChain`, inside the `nodeRecorder.commit(...)` closure right after
`saveAuthored(...)` returns the node, when `shapePositions?.[i]?.answerId` is a string:
`await this.#mapChoices.writeMapPosition({ runId: run.runId, answerId, rootIndex: i, rootNodeId: saved.nodeId, maker: saved.maker });`.

`chainsRun` replaces `callsRunTogether` at the four arguing switches only: the two `if (saved === null || !callsRunTogether) return;`
lines (rootZeroChain, rootChain), `if (!callsRunTogether) { …serial root loop… }` and
`if (callsRunTogether) { …argueTogether… } else { …serial legs… }`. A shaped run therefore always argues through the
chains; with no concurrency row its lane holds one call at a time (one debate call after another, as today's serial
engine, but recorded through the same ordered recorders). `askTogether` and the guard comment keep `callsRunTogether`.

- [ ] **Step 3: Implement the legs**

Refactor `legChain(legIndex, stage)` into `legChain(legIndex, stage)` → `argueLeg(leg, decision, stage)`, where the
body after `const leg = expansionPlan[legIndex]!; const decision = decisionBefore(legIndex);` moves unchanged into
`argueLeg` and `legChain` becomes `(legIndex, stage) => argueLeg(expansionPlan[legIndex]!, decisionBefore(legIndex), stage)`.
Inside `argueLeg`, after the existing early returns, add the shape's own rules (row absent: `shapeLegAt` is null and every
line below is skipped):

```ts
        const shapeLeg = shapeLegAt(leg.childIndex);
        if (deselectedIndices.has(leg.childIndex)) return;
        if (shapeLeg?.kind === "CROSS") return argueShapeCross(shapeLeg, stage);
        const writerIndex = shapeLeg === null ? null : shapeWriterSeat({
          seatMakers: seatBook.supportAttack.map((seat) => seat.main.maker),
          // A point answers its position; a reply answers the node it attacks; a defence prefers the point's own maker.
          avoidMakers: [plannedMakers[leg.parentIndex] ?? ""],
          preferMaker: shapeLeg.kind === "DEFENCE" && shapeLeg.chain !== null ? plannedMakers[shapeLeg.chain] ?? null : null,
          offset: leg.rootIndex + leg.round + shapeLeg.siblingOrdinal,
          sitsOut: (index) => seatSitsOut(seatBook.supportAttack[index]!)
        });
        if (shapeLeg !== null && writerIndex === null) return;
        const seat = shapeLeg === null
          ? seatBook.supportAttack[(leg.rootIndex + leg.round) % seatBook.supportAttack.length]!
          : seatBook.supportAttack[writerIndex!]!;
        plannedMakers[leg.childIndex] = seat.main.maker;
```

and in the `call` object use:

```ts
          authorIndex: shapeLeg === null ? leg.authorIndex : seat.seatIndex,
          seat,
          leg: shapeLeg?.consideration != null
            ? { kind: leg.polarity === "support" ? "support" as const : "attack" as const, positionUnderDebate: parentStatement, consideration: shapeLeg.consideration }
            : { kind: leg.polarity === "support" ? "support" as const : "attack" as const, positionUnderDebate: parentStatement },
          callSiteKey: shapeLeg?.callSiteKey ?? `JUDGE:${role}:root${leg.rootIndex}:r${leg.round}:p${leg.parentIndex}`,
          siblingOrdinal: shapeLeg?.siblingOrdinal ?? (leg.polarity === "support" ? 1 : 2),
```

`plannedMakers` is `const plannedMakers: (string | undefined)[] = [];`, filled for roots with
`plannedMakers[i] = rootSeats[i]!.main.maker` when each root chain starts its author call (and for root 0 after the swap
loop). The cross-reply for the shape:

```ts
      /** Spec §3.3 step 4: ONE cross-reply per position, to its strongest rival, by the member that wrote the position. */
      const argueShapeCross = async (shapeLeg: ShapeLeg, stage: { rank: ChainRank }): Promise<void> => {
        const position = shapeLeg.childIndex;
        const target = shapeLeg.targetRootIndex!;
        const [ownPosition, otherMakersPosition] = await Promise.all([statements[shapeLeg.rootIndex]!.promise, statements[target]!.promise]);
        if (ownPosition === null || otherMakersPosition === null || arguingStopped()) return;
        const writer = positionAnswerers.get(shapeLeg.rootIndex);
        if (writer === undefined) return;
        const call = {
          authorIndex: shapeLeg.rootIndex,
          seat: Object.freeze({ role: "CROSS_EXCHANGE" as const, seatIndex: shapeLeg.rootIndex, pinnedSeatIndex: rootSeats[shapeLeg.rootIndex]!.pinnedSeatIndex,
            main: writer, runnerUp: null, diversityShare: 0, pinned: null }),
          leg: { kind: "cross-root" as const, ownPosition, otherMakersPosition },
          callSiteKey: shapeLeg.callSiteKey,
          role: "cross-root response",
          childKind: "support" as const,
          siblingOrdinal: shapeLeg.siblingOrdinal,
          plannedLegCount: 1,
          explorationDecision: "challenge" as const
        };
        let authored: Awaited<ReturnType<typeof authorAndPanel>>;
        try {
          authored = await authorAndPanel({ ...call, parentNodeId: laterParentAt(shapeLeg.rootIndex), edges: [] },
            (statement) => statements[position]!.resolve(statement));
        } catch (error) {
          const stop = expansionPhaseStop(error);
          if (stop === null) throw error;
          runBodyBudgetStop = stop;
          noteSpendStop(stage.rank);
          return;
        }
        if (authored.kind === "HALTED") {
          const halted = authored.record;
          await nodeRecorder.commit(position, async () => { if (!bodyFailed) haltedExpansionRecords.push(halted); });
          return;
        }
        const authoredValue = authored.value;
        const saved = await nodeRecorder.commit(position, async () => {
          const authorRoot = authoredNodes.get(shapeLeg.rootIndex);
          const targetRoot = authoredNodes.get(target);
          if (bodyFailed || authorRoot === undefined || targetRoot === undefined) return null;
          return saveAuthored(position, { ...call, parentNodeId: authorRoot.nodeId, edges: [
            { targetNodeId: authorRoot.nodeId, targetStatement: authorRoot.statement, polarity: "support" },
            { targetNodeId: targetRoot.nodeId, targetStatement: targetRoot.statement, polarity: "attack" }] }, authoredValue);
        });
        savedNodes[position]!.resolve(saved);
        if (saved === null) return;
        stage.rank = reviewRank(position);
        await reviewInChain(reviewSlot(position), saved);
      };
```

(The shape's cross-reply sits in round 1, before the round-1 boundary, so it does NOT await `everyBoundaryDecided` as
today's cross-exchanges do; it is a child of its own root, so `subtreeIndices` and the recorders treat it as any leg.)

- [ ] **Step 4: Implement the adaptive choice at the round-1 boundary**

In `closeGlobalRound`, keep a copy of the propagation for scrutiny and choose the chains:

```ts
      lastBoundary = { propagation: boundary.propagation, rootNodeIds: rootScope.rootNodeIds, scoredNodeIds };
      if (shapePlan !== null && shapeRun!.settings.depthMode === "adaptive" && completedRounds === 1 && expansionDepth > 1) {
        keepAdaptiveChains((position) => {
          const node = authoredNodes.get(position);
          if (node === undefined || !scoredNodeIds.has(node.nodeId)) return null;
          return resolveLeverage({ completedRounds, carryingNodeId: node.nodeId, sensitivityRecords: boundary.propagation.sensitivityRecords,
            rootNodeIds: rootScope.rootNodeIds }).leverage;
        });
      }
```

placed right before `return boundary.continuation.kind === "STOP";`, with, declared before `closeGlobalRound`:

```ts
    let lastBoundary: { propagation: PropagationOutcome; rootNodeIds: readonly string[]; scoredNodeIds: ReadonlySet<string> } | null = null;
    let adaptiveChosen = false;
    /** Spec §3.3 step 5 (adaptive; contract deviation 6): the X chains per position kept at the round-1 boundary. */
    const keepAdaptiveChains = (leverageOf: (position: number) => number | null): void => {
      if (adaptiveChosen || shapePlan === null) return;
      adaptiveChosen = true;
      const chainsByRoot = new Map<number, number[]>();
      for (const leg of shapePlan.legs) if (leg.kind === "POINT") chainsByRoot.set(leg.rootIndex, [...(chainsByRoot.get(leg.rootIndex) ?? []), leg.childIndex]);
      const kept = shapeSelectChains({ chainsByRoot, leverageOf, frozen: frozenIndices, perRoot: shapeRun!.shape.deeperTopPoints });
      for (const leg of shapePlan.legs) {
        if (leg.kind !== "REPLY" && leg.kind !== "DEFENCE") continue;
        if (leg.chain !== null && !kept.has(leg.chain)) deselectedIndices.add(leg.childIndex);
      }
    };
```

`closeGlobalRound` returns `false` early when there is no stopping policy or no root scope; in both cases, for an
adaptive shaped run at round 1, call `keepAdaptiveChains(() => null)` first — with no leverage no chain is kept, and the
deeper rounds are skipped rather than run in full (never more than P2a priced). Import `resolveLeverage` and the
`PropagationOutcome` type from `@debateai/propagation`.

- [ ] **Step 5: Run — expect PASS**

Run: `pnpm exec tsc -p apps/runner --noEmit`, then (alone)
`pnpm exec vitest run tests/integration/debate-shape-run.test.ts -t "argues P assigned positions"`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/runner/src/index.ts tests/integration/debate-shape-run.test.ts tests/support
git commit -m "runner: argue the shape — assigned roots with hand-over, round-1 points, one cross-reply each, breadth-first adaptive/fixed rounds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Scrutiny, the answer length, and the shape's records on the answer

**Files:**
- Modify: `apps/runner/src/index.ts` (scrutiny chains inside `argueTogether`; the writer's prompt and bound; condition marks and records; `AuthoredDebateNode.baseTau`)

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/debate-shape-run.test.ts` (Task 15 file) the cases "Premium deep scrutiny adds exchanges to the
needy nodes and marks each one SCRUTINY-EXTENDED", "the answer writer is asked for about N words under max(sealed,
writerBound)" and "every map mark and extension rides the answer with its record" (code in Task 15 Step 1). Run them
(alone): `pnpm exec vitest run tests/integration/debate-shape-run.test.ts -t "scrutiny|about N words|rides the answer"` —
Expected: FAIL (no scrutiny nodes; writer prompt is v2; no shape marks).

- [ ] **Step 2: Implement scrutiny**

`AuthoredDebateNode` gains `readonly baseTau: number;` set in `saveAuthored` from `authored.selection.tau` (the node's
panel-selected base score).

Inside `argueTogether`, after `const everyBoundaryDecided = earlierDecisions;`:

```ts
      /**
       * Spec §3.3 step 7 — SCRUTINY (Premium only: a zero budget plans no slot). Once every planned round is decided and
       * reviewed, the needy nodes are chosen once (shape-select.ts) and get `roundsPerPoint` exchanges each, in the
       * reserved slots, breadth-first; an unused slot is given up. Never after a stop.
       */
      const scrutinyChains: Promise<void>[] = [];
      if (shapePlan !== null && shapePlan.scrutiny.count > 0) {
        const plannedEnd = shapePlan.scrutiny.start;
        scrutinyChains.push(runChain(async () => {
          await everyBoundaryDecided;
          await reviewRecorder.through(plannedEnd);
          await Promise.all(reviewBatches.filter((_batch, index) => reviewBatchEnds[index]! <= plannedEnd).map((batch) => batch.done));
          if (arguingStopped()) { scrutinyChosen.resolve([]); return; }
          const disputed = new Set(await this.#judgements.readDisputedNodeIds(run.runId));
          const candidates = [...authoredNodes.entries()].flatMap(([position, node]) => {
            if (position >= plannedEnd || shapeLegAt(position)?.kind === "CROSS") return [];
            const leverage = lastBoundary === null || !lastBoundary.scoredNodeIds.has(node.nodeId) ? null
              : resolveLeverage({ completedRounds: expansionDepth, carryingNodeId: node.nodeId,
                sensitivityRecords: lastBoundary.propagation.sensitivityRecords, rootNodeIds: lastBoundary.rootNodeIds }).leverage;
            return [{ position, rootIndex: position < rootCount ? position : shapeLegAt(position)!.rootIndex,
              dispersion: node.panelDispersion, disputed: disputed.has(node.nodeId), rootLeverage: leverage, baseTau: node.baseTau }];
          });
          const chosen = shapeRankScrutiny({ candidates, disagreementThreshold: panelPolicy!.disagreementThreshold,
            leverageMin: shapeRun!.shape.scrutinyLeverageMin, weakBelow: shapeRun!.shape.scrutinyWeakBelow,
            pointsPerDebate: shapePlan.scrutiny.nodesPerDebate });
          for (const leg of buildScrutinyLegs({ plan: shapePlan, depth: expansionDepth, selected: chosen })) scrutinyLegs.set(leg.childIndex, leg);
          scrutinyChosen.resolve(chosen.map((entry) => ({ position: entry.position, nodeId: authoredNodes.get(entry.position)!.nodeId })));
        }, [reviewBatchOf(plannedEnd - 1), 3, 1], () => scrutinyChosen.resolve([])));
        for (let slot = shapePlan.scrutiny.start; slot < totalPlannedNodes; slot += 1) {
          scrutinyChains.push(runChain(async (stage) => {
            await scrutinyChosen.promise;
            const leg = scrutinyLegs.get(slot);
            if (leg === undefined) return;
            await argueLeg(leg, undefined, stage);
          }, authorRank(slot), releaseAt(slot)));
        }
      }
```

Declare, at execute scope before `argueTogether` (so the answer can read it after the arguing):
`const scrutinyChosen = settable<readonly { readonly position: number; readonly nodeId: string }[]>();` and resolve it
with `[]` whenever no scrutiny chain is planned (`shapePlan === null || shapePlan.scrutiny.count === 0`, right after the
plan is built). A δ stop does not skip scrutiny (it judges the planned rounds converged, not the needy nodes); a spend
stop, too few members or a failure does. Add `...scrutinyChains`
to the `chains` awaited by `allSettled`. Scrutiny legs are `REPLY`/`DEFENCE` legs, so `argueLeg` treats them as deeper
exchanges (a reply's writer is a maker other than the attacked node's, a defence prefers the node's own maker).

After the arguing, the records:

```ts
    /** Spec §3.3 step 7: one SCRUTINY-EXTENDED record per scrutinised node, naming the exchanges it got. */
    const scrutinyRecords: ConditionMarkRecord[] = [];
    for (const { position, nodeId } of await scrutinyChosen.promise) {
      const added = [...scrutinyLegs.values()].filter((leg) => leg.chain === position).flatMap((leg) => authoredNodes.get(leg.childIndex)?.nodeId ?? []);
      if (added.length === 0) continue;
      scrutinyRecords.push(Object.freeze({ mark: "SCRUTINY-EXTENDED" as const, scope: "node" as const, subjectRef: nodeId,
        reason: `SCRUTINY_EXTENDED:${String(added.length)}`, liftPath: null, servedRootRule: null, affectedNodeIds: Object.freeze([nodeId, ...added]) }));
    }
    const closeCallRecords: ConditionMarkRecord[] = closeCallExtensions.map((entry) => Object.freeze({
      mark: "PANEL-CLOSE-CALL-EXTENDED" as const, scope: "node" as const, subjectRef: entry.nodeId,
      reason: `PANEL_CLOSE_CALL_EXTENDED:${String(entry.added)}`, liftPath: null, servedRootRule: null, affectedNodeIds: Object.freeze([entry.nodeId]) }));
    const mapRecords = shapeMapResult === null ? [] : mapConditionRecords(shapeMapResult, run.runId);
    const shapeRecords = [...mapRecords, ...closeCallRecords, ...scrutinyRecords];
```

Then:
- in `hiddenConditionMarks` (~8198) add, after the panel degradations: `...new Set(shapeRecords.map((record) => record.mark))`;
- in `conditionMarkRecords` (~8287) add `...shapeRecords,` after `...branchFrozenRecords,`.
A row-absent run has `shapeRecords = []`: both lists are today's.

- [ ] **Step 3: Implement the answer length**

In the `synthesize` closure (~8758–8892): the framed prompt is
`buildSynthesisRolePrompt(request, run.argumentLanguageName, undefined, shapeRun === null ? null : shapeRun.shape.answerWords)`
(only the WRITER's site, ~8777; the checker's, ~8949, is unchanged) and the call's `bound` is
`shapeWriterBound(synthesizerBound, shapeRun === null ? null : shapeRun.shape.writerBound)`. The cheaper-maker fallback
reuses the same request, so it inherits both.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec tsc -p apps/runner --noEmit`, then (alone)
`pnpm exec vitest run tests/integration/debate-shape-run.test.ts -t "scrutiny|about N words|rides the answer"`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/runner/src/index.ts tests/integration/debate-shape-run.test.ts
git commit -m "runner: scrutiny in reserved slots, answer length for the writer, shape marks with records on the answer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: The whole shape, end to end (embedded Postgres, scripted gates)

**Files:**
- Create: `tests/support/debate-shape-harness.ts`, `tests/support/saved-debate.ts`, `tests/integration/debate-shape-run.test.ts`
- Modify: `tests/support/preview-gate-stubs.ts` (`GateRequestKind` += `"MAP"`; `classifyGateRequest` reads `MAP_CONTRACT_IDS`), `tests/support/preview-debate-harness.ts` (`admittedRun` option `shape`; `previewRunner` option `debateShape`), `tests/integration/parallel-calls-debate.test.ts` (imports `scriptedAnswers`, `savedDebate`, `copyDatabase` from the two new support files instead of defining them: a move, no behaviour change)

**Interfaces:**

```ts
// tests/support/debate-shape-harness.ts
export function shapeForTest(input: Readonly<{ plan: DebateShapePlanKey; makers: number; settings: DebateShapeSettings }>): DebateShapeCeilingInput;
export function scriptedShapeAnswers(question: string, options?: Readonly<{
  fail?: ReadonlySet<"ANGLES" | "MERGE" | "CHOOSE" | "LISTS_BUT_ONE" | "CHOOSE_ONE_ANSWER">;
  stopAt?: "MERGE"; reviews?: "agree" | "dispute"; panelSpread?: boolean }>): (request: GateRequest, chat: string) => GateOverride | null;
// tests/support/saved-debate.ts — moved verbatim from parallel-calls-debate.test.ts, plus the map rows
export type SavedDebate; export function savedDebate(pool: Pool, runId: string, answerId: string): Promise<SavedDebate>;
export function copyDatabase(admin: Pool, from: string, to: string): Promise<void>;
```

- [ ] **Step 1: Write the failing test**

`tests/support/preview-gate-stubs.ts`, in `classifyGateRequest`, after the story checks:
`if ((Object.values(MAP_CONTRACT_IDS) as string[]).includes(contractId)) return "MAP";` (import `MAP_CONTRACT_IDS` from
`@debateai/map`; add `"MAP"` to `GateRequestKind`). The new judge contracts keep classifying as `"JUDGE"` (their
instruction still names `restatement_text`).

`tests/support/preview-debate-harness.ts`: `admittedRun(label, admission)` accepts `shape?: DebateShapeCeilingInput` and
`settings?: DebateShapeSettings`; with them `depthParams` is `{ depth, ...settings }` and `envelopeBasis` is
`computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize: panel.length, depth, shape })`. `previewRunner(gates, claim, options)`
accepts `debateShape?: DebateShapeRunnerSettings` and passes it into the runner settings (as main.ts does).

`tests/support/debate-shape-harness.ts`:

```ts
import { createHash } from "node:crypto";
import { MAP_CONTRACT_IDS } from "@debateai/map";
import { readFramedMaterial } from "@debateai/providers";
import { debateShapePolicyStartValues, resolveDebateShape, type DebateShapeCeilingInput, type DebateShapePlanKey } from "@debateai/register";
import type { DebateShapeSettings } from "@debateai/contract";
import { scriptedAnswers } from "./scripted-answers.js";
import { wirePacket, type GateOverride, type GateRequest } from "./preview-gate-stubs.js";

/** P2a's own resolution, at the start values: the sizes a real admission would freeze on the receipt. */
export function shapeForTest(input: Readonly<{ plan: DebateShapePlanKey; makers: number; settings: DebateShapeSettings }>): DebateShapeCeilingInput {
  const shape = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: input.plan, makers: input.makers, settings: input.settings });
  if (shape === null) throw new Error("test: the shape needs two makers");
  return shape;
}

const field = (chat: string, name: string): string =>
  readFramedMaterial(wirePacket(chat)).fields.find((entry) => entry.name === name)?.content ?? "";
const digestOf = (text: string) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);
const why = "It could change the answer for the people affected.";

/**
 * Map replies that depend only on what was asked (the material), never on arrival order — so a debate argued twice
 * from one admitted run gets the same map. Every other request goes to `scriptedAnswers` (the parallel-calls suite's).
 */
export function scriptedShapeAnswers(question: string, options: Readonly<{
  fail?: ReadonlySet<"ANGLES" | "MERGE" | "CHOOSE" | "LISTS_BUT_ONE" | "CHOOSE_ONE_ANSWER">;
  stopAt?: "MERGE"; reviews?: "agree" | "dispute"; panelSpread?: boolean }> = {}) {
  const others = scriptedAnswers(question);
  const fail = options.fail ?? new Set();
  return (request: GateRequest, chat: string): GateOverride | null => {
    if (request.kind === "MAP") {
      const contractId = readFramedMaterial(wirePacket(chat)).contractId;
      if (contractId === MAP_CONTRACT_IDS.angles) {
        return fail.has("ANGLES") ? { content: "not json" } : { content: JSON.stringify({ angles: [
          { angle_id: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The strongest case against." },
          { angle_id: "worry", kind: "ASKER_WORRY", label: "The worry", focus: "What the asker fears." },
          { angle_id: "do", kind: "PRACTICAL", label: "What to do", focus: "What to do first." },
          { angle_id: "cost", kind: "SPECIFIC", label: "The cost", focus: "Who pays." }] }) };
      }
      if (contractId === MAP_CONTRACT_IDS.listAngle || contractId === MAP_CONTRACT_IDS.listOpen) {
        const label = field(chat, "angle_label") || "open";
        if (fail.has("LISTS_BUT_ONE") && label !== "The other side") return { content: "not json" };
        const tag = digestOf(label);
        return { content: JSON.stringify({ points: [
          { claim: `A point against, from ${label} ${tag}.`, why_it_matters: why, leans: "against_some_answer" },
          { claim: `A point for, from ${label} ${tag}.`, why_it_matters: why, leans: "for_some_answer" },
          { claim: `A shared point about cost.`, why_it_matters: why, leans: "context" }],
          candidate_answers: [label === "The other side" ? "No, keep it as it is." : `Yes, ${label.toLowerCase()} first.`] }) };
      }
      if (contractId === MAP_CONTRACT_IDS.merge) {
        if (options.stopAt === "MERGE") return { gateRefuses: "PREVIEW_TEST_AUTHORITY_STOPPED" } as GateOverride;
        if (fail.has("MERGE")) return { content: "not json" };
        const points = JSON.parse(field(chat, "points")) as { item_id: string; claim: string }[];
        const answers = JSON.parse(field(chat, "candidate_answers")) as { item_id: string; answer: string }[];
        const group = <T,>(rows: T[], key: (row: T) => string) => [...new Set(rows.map(key))].map((text) => [text, rows.filter((row) => key(row) === text)] as const);
        return { content: JSON.stringify({
          key_points: group(points, (row) => row.claim).map(([claim, rows], index) => ({ key_point_id: `k${String(index + 1)}`, claim, member_item_ids: rows.map((row) => row.item_id) })),
          answers: group(answers, (row) => row.answer).map(([answer, rows], index) => ({ answer_id: `a${String(index + 1)}`, answer, member_item_ids: rows.map((row) => row.item_id) })) }) };
      }
      if (contractId === MAP_CONTRACT_IDS.gap) {
        return { content: JSON.stringify({ new_points: [{ claim: `A missing point ${digestOf(field(chat, "key_points"))}.`, why_it_matters: why, leans: "context" }], framing_challenges: [] }) };
      }
      if (contractId === MAP_CONTRACT_IDS.choose) {
        if (fail.has("CHOOSE")) return { content: "not json" };
        const keyPoints = (JSON.parse(field(chat, "key_points")) as { key_point_id: string }[]).map((row) => row.key_point_id);
        const answers = JSON.parse(field(chat, "answers")) as { answer_id: string; answer: string }[];
        const named = (fail.has("CHOOSE_ONE_ANSWER") ? answers.slice(0, 1) : answers.slice(0, 3)).map((answer, index, all) => ({
          answer_id: answer.answer_id, statement: answer.answer,
          for: keyPoints.filter((_id, at) => at % all.length === index).slice(0, 2),
          against: keyPoints.filter((_id, at) => at % all.length === (index + 1) % all.length).slice(0, 2),
          strongest_rival: all.length > 1 ? all[(index + 1) % all.length]!.answer_id : null }));
        return { content: JSON.stringify({ answers: named }) };
      }
      return null;
    }
    const answer = others(request, chat);
    if (answer === null || !("content" in answer)) return answer;
    if (request.kind === "REVIEW" && options.reviews !== undefined) {
      const parsed = JSON.parse(answer.content) as { outcome: string };
      return { content: JSON.stringify({ ...parsed, outcome: options.reviews }) };
    }
    if (request.kind === "PANEL" && options.panelSpread === true) {
      const parsed = JSON.parse(answer.content) as { steelman: { fidelity: number } };
      return { content: JSON.stringify({ ...parsed, steelman: { ...parsed.steelman, fidelity: request.model.includes("Qwen") ? 0.05 : 0.95 } }) };
    }
    return answer;
  };
}
```

`tests/support/scripted-answers.ts` and `tests/support/saved-debate.ts`: move `scriptedAnswers` (with `framedTokensOf`,
`share`, `digestOf`, `withRequestDerivedBearings` as it needs), `SavedDebate`, `savedDebate`, `copyDatabase`/`untilUnused`
(taking the `admin` pool as a first argument) out of `parallel-calls-debate.test.ts` unchanged; `savedDebate` also
captures `core.map_item` (minus `recorded_at`, content as stored), `core.map_choice` (minus `recorded_at`) and
`core.map_position` (minus `recorded_at`, `root_node_id` renamed through the same `node#k` map) for the run.

`tests/integration/debate-shape-run.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "@debateai/db";
import { mapPromptContractHash } from "@debateai/map";
import { readFramedMaterial } from "@debateai/providers";
import { OWNER_CALL_CONCURRENCY, PANEL_REFS, previewDebateHarness } from "../support/preview-debate-harness.js";
import { wirePacket } from "../support/preview-gate-stubs.js";
import { scriptedShapeAnswers, shapeForTest } from "../support/debate-shape-harness.js";
import { copyDatabase, savedDebate } from "../support/saved-debate.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let admin: Pool;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });
const SHAPE_SETTINGS = { debateShape: { mapContractHash: mapPromptContractHash() } } as const;
const STANDARD = { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  admin = createPool(database.connectionString.replace(/\/[^/?]+(?=\?|$)/u, "/postgres"), { max: 1 });
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => { await admin?.end(); await database?.stop(); });

const q = (pool: Pool, sql: string, runId: string) => pool.query(sql, [runId]).then((result) => result.rows);
async function argue(label: string, plan: "free" | "pro", settings: typeof STANDARD | Readonly<Record<string, string>>, depth: number,
  options: Parameters<typeof scriptedShapeAnswers>[1] = {}, concurrency: boolean = true) {
  const shape = shapeForTest({ plan, makers: PANEL_REFS.length, settings: settings as never });
  const debate = await harness.admittedRun(label, { panelRefs: PANEL_REFS, depth, shape, settings: settings as never });
  const gates = await harness.startGates({}, undefined, scriptedShapeAnswers(debate.question, options));
  const composed = await harness.previewRunner(gates, "resend", { ...(concurrency ? { callConcurrency: OWNER_CALL_CONCURRENCY } : {}), ...SHAPE_SETTINGS });
  const result = await harness.completedRun(composed, debate, gates);
  return { debate, gates, shape, result, calls: await harness.modelCalls(debate.runId) };
}

describe("the debate shape in the runner (spec §3.3)", () => {
  it("argues P assigned positions, K points each, one cross-reply each, adaptive exchanges, and serves an answer", async () => {
    const { debate, gates, shape, result, calls } = await argue("assigned", "free", STANDARD, 2);
    const okKeys = calls.filter((call) => call.outcome === "OK").map((call) => call.call_site_key);
    expect(okKeys.filter((key) => key.startsWith("MAP:"))).toEqual(expect.arrayContaining(["MAP:angles", "MAP:merge", "MAP:choose"]));
    const assigned = gates.requests.filter((request) => request.kind === "JUDGE"
      && readFramedMaterial(wirePacket(JSON.stringify(request.body))).contractId.startsWith("judge.assigned-root."));
    expect(assigned).toHaveLength(shape.answers);
    expect(okKeys.filter((key) => key.startsWith("JUDGE:cross-root:"))).toHaveLength(shape.answers);
    const pointKeys = okKeys.filter((key) => /^JUDGE:(defender|critic):root[0-9]+:r1:/u.test(key));
    expect(pointKeys.length).toBeLessThanOrEqual(shape.answers * shape.pointsPerAnswer);
    expect(pointKeys.length).toBeGreaterThanOrEqual(shape.answers);
    const deeper = okKeys.filter((key) => /^JUDGE:critic:root[0-9]+:r2:/u.test(key));
    expect(deeper.length).toBeLessThanOrEqual(2 * shape.answers * shape.deeperTopPoints);
    const { answer } = await harness.servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    const positions = await q(database.pool, `SELECT answer_id, root_index FROM core.map_position WHERE run_id=$1 ORDER BY root_index`, debate.runId);
    expect(positions.map((row) => row.root_index)).toEqual(Array.from({ length: shape.answers }, (_unused, index) => index));
  }, 600_000);

  it("keeps every invariant: roots alone servable, every counting node judged, reviewed by another maker and restated, an acyclic graph", async () => {
    const { debate, result } = await argue("invariants", "free", STANDARD, 2);
    const pool = database.pool;
    const roots = await q(pool, `SELECT node_id::text AS id FROM core.node WHERE run_id=$1 AND parent_node_id IS NULL`, debate.runId);
    const served = await q(pool, `SELECT served_node_id::text AS id FROM serve.answer WHERE answer_id=$1`, result.answerId as never);
    expect(roots.map((row) => row.id)).toContain(served[0]!.id);
    const unjudged = await q(pool, `SELECT node.node_id FROM core.node AS node WHERE node.run_id=$1
      AND (NOT EXISTS (SELECT 1 FROM ledger.reduced_judgement AS judgement WHERE judgement.node_id = node.node_id)
        OR NOT EXISTS (SELECT 1 FROM core.stranger_restatement AS restatement WHERE restatement.subject_kind='node' AND restatement.subject_id = node.node_id))`, debate.runId);
    expect(unjudged).toEqual([]);
    const sameMakerReviews = await q(pool, `SELECT review.node_id FROM ledger.node_review AS review JOIN core.node AS node ON node.node_id = review.node_id
      WHERE node.run_id=$1 AND review.reviewer_maker = node.author_maker`, debate.runId);
    expect(sameMakerReviews).toEqual([]);
    const edges = await q(pool, `SELECT source_node_id::text AS source, target_node_id::text AS target FROM core.edge WHERE run_id=$1`, debate.runId);
    const next = new Map<string, string[]>();
    for (const edge of edges) next.set(edge.source, [...(next.get(edge.source) ?? []), edge.target]);
    const visiting = new Set<string>(); const done = new Set<string>();
    const cyclic = (node: string): boolean => {
      if (done.has(node)) return false; if (visiting.has(node)) return true;
      visiting.add(node); const found = (next.get(node) ?? []).some(cyclic); visiting.delete(node); done.add(node); return found;
    };
    expect([...next.keys()].some(cyclic)).toBe(false);
  }, 600_000);

  it.each([
    ["the angle planner fails", new Set(["ANGLES"] as const), "MAP_ANGLES_FALLBACK"],
    ["the merge fails", new Set(["MERGE"] as const), "MAP_MERGE_FALLBACK"],
    ["the choose fails", new Set(["CHOOSE"] as const), "MAP_CHOOSE_FALLBACK"],
    ["the choose names one answer", new Set(["CHOOSE_ONE_ANSWER"] as const), "ANSWERS_FILLED"],
    ["only one list arrives", new Set(["LISTS_BUT_ONE"] as const), "MAP_UNAVAILABLE_TODAYS_OPENING"]
  ])("%s: the run still ends with an answer, and the mark rides it with its record", async (_label, fail, mark) => {
    const { debate, result } = await argue(`fallback-${mark}`, "free", STANDARD, 1, { fail });
    expect(result.kind).toBe("COMPLETED");
    const rows = await q(database.pool, `SELECT mark, scope, call_site_key FROM serve.condition_mark WHERE answer_id=$1`, result.answerId as never);
    expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ mark, scope: "answer", call_site_key: null })]));
    if (mark === "MAP_UNAVAILABLE_TODAYS_OPENING") {
      const roots = await q(database.pool, `SELECT count(*)::int AS n FROM core.node WHERE run_id=$1 AND parent_node_id IS NULL`, debate.runId);
      expect(roots[0]!.n).toBeLessThanOrEqual(shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD }).answers);
    }
  }, 600_000);

  it("a money stop mid-map ends with an answer: root 0 is argued, the stop is disclosed, nothing else is asked", async () => {
    const { result, calls } = await argue("money-stop", "free", STANDARD, 2, { stopAt: "MERGE" });
    expect(result.kind).toBe("COMPLETED");
    expect(calls.some((call) => call.call_site_key === "MAP:choose")).toBe(false);
    expect(calls.filter((call) => call.call_site_key.startsWith("JUDGE:root:"))).toEqual([]);
    const rows = await q(database.pool, `SELECT mark FROM serve.condition_mark WHERE answer_id=$1`, result.answerId as never);
    expect(rows.map((row) => row.mark)).toEqual(expect.arrayContaining(["ENVELOPE_EXHAUSTED", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK"]));
  }, 600_000);

  it("a close call gains graders: PANEL-CLOSE-CALL-EXTENDED on the node, with more voices than J", async () => {
    const { debate, result } = await argue("close-call", "free", STANDARD, 1, { panelSpread: true });
    const records = await q(database.pool, `SELECT subject_ref FROM serve.condition_mark WHERE answer_id=$1 AND mark='PANEL-CLOSE-CALL-EXTENDED'`, result.answerId as never);
    expect(records.length).toBeGreaterThan(0);
    const shape = shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD });
    const voices = await q(database.pool, `SELECT (disagreement->'panel'->>'voiceCount')::int AS n FROM ledger.reduced_judgement WHERE node_id = $1::uuid`, records[0]!.subject_ref);
    expect(voices[0]!.n).toBeGreaterThan(1 + shape.graders);
    expect(debate.runId).toBeTruthy();
  }, 600_000);

  it("Premium deep scrutiny adds exchanges to the needy nodes and marks each one SCRUTINY-EXTENDED", async () => {
    const deep = { depthMode: "adaptive", scrutiny: "deep", answerLength: "standard" } as const;
    const { result, shape, calls } = await argue("scrutiny", "pro", deep, 1, { reviews: "dispute" });
    const records = await q(database.pool, `SELECT subject_ref FROM serve.condition_mark WHERE answer_id=$1 AND mark='SCRUTINY-EXTENDED'`, result.answerId as never);
    expect(records.length).toBeGreaterThan(0);
    expect(records.length).toBeLessThanOrEqual(shape.scrutinyPointsPerDebate);
    const scrutinyKeys = calls.filter((call) => call.outcome === "OK" && /^JUDGE:critic:root[0-9]+:r(2|3):/u.test(call.call_site_key));
    expect(scrutinyKeys.length).toBeLessThanOrEqual(2 * shape.scrutinyRoundsPerPoint * shape.scrutinyPointsPerDebate);
  }, 600_000);

  it("the answer writer is asked for about N words under max(sealed, writerBound)", async () => {
    const detailed = { depthMode: "adaptive", scrutiny: "standard", answerLength: "detailed" } as const;
    const { gates, shape } = await argue("length", "free", detailed, 1);
    const writer = gates.requests.find((request) => request.kind === "COMPOSE")!;
    const frame = readFramedMaterial(wirePacket(JSON.stringify(writer.body)));
    expect(frame.contractId).toBe("serve.synthesizer.length.v1");
    expect(frame.fields.at(-1)).toEqual({ name: "answer_length", content: `about ${String(shape.answerWords)} words` });
    expect(Number(writer.body.max_tokens)).toBeGreaterThanOrEqual(shape.writerBound);
  }, 600_000);

  it("same answers, any finish order, and the one-call-at-a-time lane: the same debate and the same map", async () => {
    const shape = shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD });
    const seed = await harness.admittedRun("finish-order", { panelRefs: PANEL_REFS, depth: 2, shape, settings: STANDARD });
    await copyDatabase(admin, "debateai_s00", "shape_finish_seed");
    const saved = [];
    for (const [name, concurrency, holdSeed] of [["p1", true, 11], ["p2", true, 22], ["serial", false, 33]] as const) {
      await copyDatabase(admin, "shape_finish_seed", `shape_finish_${name}`);
      const pool = createPool(database.connectionString.replace(/\/[^/?]+(?=\?|$)/u, `/shape_finish_${name}`));
      try {
        const variant = previewDebateHarness({ pool: () => pool, stubClosers });
        let state = holdSeed;
        const random = () => { state = (state * 48271) % 2147483647; return state / 2147483647; };
        const gates = await variant.startGates({}, undefined, scriptedShapeAnswers(seed.question), (request) => request.kind === "PROBE" ? 0 : 5 + Math.floor(random() * 195));
        const composed = await variant.previewRunner(gates, "resend", { ...(concurrency ? { callConcurrency: OWNER_CALL_CONCURRENCY } : {}), ...SHAPE_SETTINGS });
        const result = await variant.completedRun(composed, seed, gates);
        saved.push(await savedDebate(pool, seed.runId, result.answerId));
      } finally {
        await pool.end();
      }
    }
    expect(saved[1]).toEqual(saved[0]);
    expect(saved[2]).toEqual(saved[0]);
  }, 900_000);
});
```

(The finish-order case copies the admitted run the way `parallel-calls-debate.test.ts`'s `savedAcrossVariants` does —
admit once into a seed database, then copy it per variant; follow that helper's exact sequence, including waiting for the
seed database to have no sessions, when moving it into `tests/support/saved-debate.ts`. The column names
`reviewer_maker`/`author_maker`/`served_node_id` in the invariant queries are the ones `savedDebate` and
`tests/integration/database.test.ts` read; check them against `migrations/0002_s02.sql` and the node-review migration
before running, and use the real names.)

- [ ] **Step 2: Run it — expect FAIL before Tasks 12–14, PASS after**

Task 13 Step 1 and Task 14 Step 1 run the named cases first and see them fail. After Task 14:
Run (ALONE, nothing else running): `pnpm exec vitest run tests/integration/debate-shape-run.test.ts`
Expected: PASS (about 10–20 minutes; one heavy run).

- [ ] **Step 3: Commit**

```bash
git add tests/support tests/integration/debate-shape-run.test.ts tests/integration/parallel-calls-debate.test.ts
git commit -m "test: the debate shape end to end — positions, invariants, every fallback, money stop, close call, scrutiny, length, finish order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Row absent = today, byte for byte

**Files:**
- Create: `tests/integration/debate-shape-row-absent.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/integration/debate-shape-row-absent.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "@debateai/db";
import { mapPromptContractHash } from "@debateai/map";
import { OWNER_CALL_CONCURRENCY, PANEL_REFS, previewDebateHarness } from "../support/preview-debate-harness.js";
import { scriptedAnswers } from "../support/scripted-answers.js";
import { copyDatabase, savedDebate } from "../support/saved-debate.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let admin: Pool;
const stubClosers: (() => Promise<void>)[] = [];

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  admin = createPool(database.connectionString.replace(/\/[^/?]+(?=\?|$)/u, "/postgres"), { max: 1 });
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => { await admin?.end(); await database?.stop(); });

describe("a run admitted without a shape is today's run (spec §3.1)", () => {
  it.each([["parallel", true], ["serial", false]] as const)("%s: a runner booted WITH the shape saves the same debate, asks no MAP: call, writes no map row", async (_name, concurrency) => {
    const seedHarness = previewDebateHarness({ pool: () => database.pool, stubClosers });
    const debate = await seedHarness.admittedRun(`absent-${_name}`, { panelRefs: PANEL_REFS, depth: 2 });
    await copyDatabase(admin, "debateai_s00", `absent_seed_${_name}`);
    const saved = [];
    for (const variant of ["without", "with"] as const) {
      await copyDatabase(admin, `absent_seed_${_name}`, `absent_${_name}_${variant}`);
      const pool = createPool(database.connectionString.replace(/\/[^/?]+(?=\?|$)/u, `/absent_${_name}_${variant}`));
      try {
        const harness = previewDebateHarness({ pool: () => pool, stubClosers });
        const gates = await harness.startGates({}, undefined, scriptedAnswers(debate.question));
        const composed = await harness.previewRunner(gates, "resend", {
          ...(concurrency ? { callConcurrency: OWNER_CALL_CONCURRENCY } : {}),
          ...(variant === "with" ? { debateShape: { mapContractHash: mapPromptContractHash() } } : {})
        });
        const result = await harness.completedRun(composed, debate, gates);
        const calls = await harness.modelCalls(debate.runId);
        expect(calls.filter((call) => call.call_site_key.startsWith("MAP:"))).toEqual([]);
        expect(gates.requests.filter((request) => request.kind === "MAP" || request.kind === "UNKNOWN")).toEqual([]);
        const mapRows = await pool.query(`SELECT (SELECT count(*) FROM core.map_item WHERE run_id=$1) + (SELECT count(*) FROM core.map_choice WHERE run_id=$1)
          + (SELECT count(*) FROM core.map_position WHERE run_id=$1) AS n`, [debate.runId]);
        expect(Number(mapRows.rows[0]!.n)).toBe(0);
        saved.push({ debate: await savedDebate(pool, debate.runId, result.answerId), keys: calls.map((call) => call.call_site_key) });
      } finally {
        await pool.end();
      }
    }
    expect(saved[1]).toEqual(saved[0]);
  }, 900_000);
});
```

This proves the runner's own switch (a runner that CAN argue the shape does not, for a run without one). The proof
that nothing moved against TODAY'S code is the existing suites, unchanged and green (Step 2), plus the unit proofs that
today's judge and writer prompts are byte-identical (Tasks 4, 5).

- [ ] **Step 2: Run, ONE AT A TIME, nothing else running (each 5–25 minutes)**

1. `pnpm exec vitest run tests/integration/debate-shape-row-absent.test.ts` — Expected: PASS
2. `pnpm exec vitest run tests/integration/parallel-calls-debate.test.ts` — Expected: PASS (today's parallel and serial engines, finish-order proof)
3. `pnpm exec vitest run tests/integration/preview-busy-model-run.test.ts` — Expected: PASS (sit-outs, resilience, byte-for-byte reasons)
4. `pnpm exec vitest run tests/integration/story-end-to-end.test.ts` — Expected: PASS
5. `pnpm exec vitest run tests/integration/t17-envelope-ledger.test.ts` — Expected: PASS (ledger and envelope rows)
6. `pnpm exec vitest run tests/integration/database.test.ts` — Expected: PASS (largest; run last, alone)

Any red: stop, read it with superpowers:systematic-debugging; a row-absent difference is a defect in a guard of this
plan, never an expectation to bend.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/debate-shape-row-absent.test.ts
git commit -m "test: a run without a shape is today's run on a runner that can argue the shape

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Whole-branch verification and the owner's documents

**Files:**
- Modify: `deploy/vps/register/README.md` (the debateShapePolicy sentence: the runner now argues the shape; the register must also seal `mapContractHash`, `judgeContractHash` and `composerContractHash` from the same code), `deploy/preview-auth-dev/v1/README.md` (key count, the new required key)

- [ ] **Step 1: Light checks (one at a time)**

1. `pnpm exec tsc -p apps/runner --noEmit`, `pnpm exec tsc -p packages/map --noEmit`, `pnpm exec tsc -p packages/judgement --noEmit`, `pnpm exec tsc -p packages/serve --noEmit`, `pnpm exec tsc -p apps/ui --noEmit`, `pnpm exec tsc -p tools/preview-practice --noEmit`
2. `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` then the same without the variable — Expected: PASS
3. `pnpm exec vitest run tests/architecture` — Expected: PASS (scaffold source rules, orphan audit edges, carrier lists, forward chain)
4. The unit files this plan created or touched, in one run — Expected: PASS

- [ ] **Step 2: The gate the CI runs**

`pnpm run test:ci-gate` (unit + architecture + render; heavy — alone). Expected: PASS, or only the repo's recorded known
reds (`node tools/ci-known-red.mjs` lists them); a new red is fixed, never added to the known list.

- [ ] **Step 3: Commit**

```bash
git add deploy tests/support/shipped-corpus.manifest.txt
git commit -m "docs: the runner argues the debate shape; registers seal the map, judge and composer hashes together

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Owner steps (things that are "off" until the owner acts)

1. **Sealed hashes change.** `judgeContractHash` (six new judge contracts) and `composerContractHash` (the length
   variant) get new values, and the optional row `mapContractHash` is new. Dev registers re-seal on their own; the
   preview and hosted registers need a republish (a new register version) before a runner built from this branch is
   deployed — the same republish that would carry `debateShapePolicy`. Runs in flight should drain first (resume reads
   ledger rows by contract hash).
2. **Wording, option 1 shipped, 3 phrasings offered** (no internals in any):
   - Opposite-answer template (all site languages): (1) "The opposite of this answer: …" / "An answer different from the one above";
     (2) "The other side of this answer: …" / "Another answer to the same question"; (3) "Not this answer: …" / "A different answer".
   - Writer length sentence: (1) "Write the answer in about the number of words named in answer_length; it is a target, never a reason to leave out a point the answer needs.";
     (2) "Aim for about the number of words in answer_length, but never drop a point the answer needs."; (3) "Keep the answer near the length in answer_length; completeness comes first."
   - The eight mark labels (Task 3), e.g. "More AIs graded this close call" / "Extra graders were asked because the graders disagreed" / "A close call got a second look".
3. **Thinking for the map** stays the "opening" step; a separate "map" step in the thinking table is an owner choice for later.
4. **Migration 0116** must be renumbered at merge if the preview has applied another 0116 (lineage README rule).

## Self-review: spec items → tasks

| Spec item | Task(s) |
|---|---|
| §1 map steps in the runner over the scheduler lane, ledger rows, keys, bounds (R-2) | 1, 12 (P2a cross-plan 1–2 for `mapStepBounds`) |
| §1.1 who-raised-what kept, quotas/fills, also-raised stored | 8 (stored from Phase 1's result), 15 |
| §1.2 every fallback ends with an answer | 1 (STOPPED), 9 (today's-opening positions), 12, 15 (five fallbacks + money stop) |
| §3.1 row absent = today; invalid row refuses boot; P2a guard removed | 6, 16 |
| §3.3 step 1 one-maker run keeps today's path | 12 (`effectiveMakerCount >= 2`) |
| §3.3 step 2 assigned roots, round-robin different makers, opener first, hand-over, root 0 mandatory | 4, 9, 13 |
| §3.3 step 3 round-1 points, against first, consideration, writer ≠ position's maker | 4, 9, 13 |
| §3.3 step 4 one cross-reply per position to its strongest rival | 9, 13 |
| §3.3 step 5 breadth-first rounds, δ/ε at each boundary, adaptive vs fixed | 9 (boundaries), 10, 13 |
| §3.3 step 6 J graders, close-call extension, highest-voice rule unchanged | 11, 15 |
| §3.3 step 7 scrutiny ranking, budgets, SCRUTINY-EXTENDED | 9 (slots), 10, 14, 15 |
| §3.3 step 8 answer length (target sentence, writer bound) | 5, 14, 15 |
| §3.3 marks in CONDITION_MARKS mid-list with typed records | 3, 12, 14 |
| §3.3 invariants: roots only servable; root 0 mandatory; every node panelled/reviewed/restated; label before synthesis; acyclic; marks with records; story ≤ 8 positions; money stop writes the answer | 15 (servable, judged/reviewed/restated, acyclic, marks), 13 (root 0 rule kept), 3 (records two-way), P2a caps P ≤ 5 (story ≤ 8), 15 (money stop); label-before-synthesis unchanged code path, covered by the existing suites in 16 |
| §3.4 storage, encryption, erasure, TRUNCATE guard, grants, reader | 7, 8 |
| §3.5 scheduling: lists parallel, merge/gap/choose sequential, positions parallel, points start when their position is written, plan-order saves, serial path | 1, 12, 13, 15 (finish order + one-call lane) |
| §3.6 money: never more than priced | 9 (enumerator), cross-plan P2a 1–3 |
| §4 prompts sealed (map hash, judge legs, length sentence) | 4, 5, 6 |
| §5 unit tests listed (schemas, counting, quotas, fallbacks, caps, panels, rounds, scrutiny, length) | 1, 2, 9, 10, 11, 5 (Phase 1 tests keep the schema/counting cases) |
| §5 integration: full debate, row-absent byte identity, each fallback, money stop mid-map, finish order | 15, 16 |
| Phase-2 notes: STOPPED/abandon/codes; reassigned keys; primary subtags; non-Latin normalisation; gap guard; choose "reuse answer_id" (already in) | 1, 2 |
