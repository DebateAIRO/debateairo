# Debate Shape Phase 1 (map module + practice openings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Stage 1 of the new debate shape (the "map": angle planner, angle lists, merge, gap rounds, choose, with every fallback) as a pure, reusable module, and a new practice-tool mode `openings` that runs today's opening (T) and the three map openings (A snowball, B blind lists, C angle map) on 12 fixed questions and writes every reply to `openings.jsonl` plus `report.json` / `report.md`.

**Architecture:** A new workspace package `@debateai/map` (`packages/map`) holds the map's vocabulary, prompt contracts, strict reply schemas, pure rule functions (item ids, who-raised-what, merge/gap/choose rules, fallbacks, role rotation) and three orchestrators that talk to models only through an injected `MapCaller`. The practice tool adapts `MapCaller` onto the exact preview gateway the formats mode uses (gates, relay, busy waits, redaction, outside-repo folder, write-as-you-go log), and `--dry` swaps only the two gate ports for a scripted port, so the whole real call path (frame, door, patch follow-up, full re-ask, observer, tokens, cost) runs and nothing is spent. Phase 2's runner reuses the package unchanged by giving it a `MapCaller` built on its scheduler lane.

**Tech Stack:** TypeScript (ESM, NodeNext, strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), zod 4.4.3, vitest, pnpm 11.20.0 workspace, Node >= 26.8.2.

**Spec:** docs/superpowers/specs/2026-10-12-debate-shape-design.md

All paths below are relative to the engine folder `dialectical-engine/` of the worktree `.claude/worktrees/debate-shape` (branch `design/2026-10-12-debate-shape`). Every command runs from that folder.

## Global Constraints

- Point claim: at most 240 characters; "why it matters": at most 240 characters (spec §1.1). Candidate answer: at most 160 characters; chosen answer statement: at most 240 characters.
- Angle planner returns 4–7 angles: exactly one each of `OPPOSITE_CASE`, `ASKER_WORRY`, `PRACTICAL`, plus 1–4 `SPECIFIC`. `GENERAL` exists only in the code's angles fallback.
- Angle list: 3–8 points `{claim, why_it_matters, leans}` with `leans` in `for_some_answer | against_some_answer | context`, plus 1–3 `candidate_answers`.
- Merge never sees authors; it gets opaque item ids (`pt01`, `ca01`: at most 8 characters, because practice redaction blanks any run of 32+ id characters).
- Who-raised-what is computed by code from item ids. Blind items and gap items are kept apart. The "raised by N" count shown to the chooser counts only distinct makers that raised the point blind.
- Choose quotas are applied to the whole chosen set (the union over all answers). Each quota is met by any point of its kind; when one is missing, the code adds the top-ranked such point (most distinct blind makers first) and records `CHOOSE_QUOTA_FILLED`. The three quotas are:
  - a point raised by exactly one AI (blind and gap makers counted together);
  - an `OPPOSITE_CASE` point;
  - an `ASKER_WORRY` point, when the map has one.
- Distinct answers: at least 2. When fewer are named, the code fills them in this order and records `ANSWERS_FILLED`:
  - the best-supported different merged answer;
  - then a candidate answer from an `OPPOSITE_CASE` list;
  - then a code-owned en/ro template.
- Gap rounds: B uses 1 round, C uses up to 2. A round that adds fewer than 2 new key points ends the gap rounds. A failed gap round is skipped and is not checked by the stop rule.
- Lists = min(angles, available map AIs). The three fixed angles come first. AIs without a list are the preferred gap AIs.
- A failed list's angle is reassigned deterministically after the first wave, in plan order. Otherwise it is dropped.
- Merger ≠ chooser's maker. A gap AI ≠ the merger's maker.
- Fallback marks are exactly `MAP_ANGLES_FALLBACK`, `MAP_MERGE_FALLBACK`, `MAP_CHOOSE_FALLBACK`, `MAP_UNAVAILABLE_TODAYS_OPENING` (fewer than 2 lists), `ANSWERS_FILLED`, `CHOOSE_QUOTA_FILLED`. Everything else is a note: `LIST_REASSIGNED`, `LIST_DROPPED`, `MERGE_ITEMS_KEPT`, `GAP_SKIPPED`, `GAP_STOPPED`.
- Arm A (snowball) ends with a choose call, like B and C. Arm T reuses the judge's `primary-root` / `independent-root` contract unchanged.
- Practice questions are fixed in code (12: 6 Romanian, 6 English). `--questions` and `--arms` only select among fixed ids; their text is never sent or echoed.
- `--out` must be outside the repository (`assertOutsideRepository`); the default is a fresh temp folder.
- No quality scoring in code: no coverage, score or ranking-of-arms field anywhere. The report holds counts, cost, time, slips, fallbacks and notes only.
- One heavy test run at a time on the owner's 16 GB Mac. Before any run, `pgrep -f "vitest[ ]run"` must print nothing. Never run the integration suites, typecheck and unit runs together.
- Source rules (tools/orphan-audit `auditSourceRules`, pinned by tests/architecture/scaffold.test.ts) apply to every `.ts` under packages/, apps/ and tools/:
  - no `process` + `.env` text, even in a comment;
  - every `switch` needs `default:` with `exhaustive(` (this plan uses no `switch`);
  - no exported ALL_CAPS constant equal to a bare number (limits live in the frozen `MAP_LIMITS` object);
  - no import specifier containing `test`/`fixture` in shipped code.
- No `/Users/<name>/` path in any shipped file. No file under tools/ whose path contains the word "support".
- Every function exported from `packages/map` starts with `map` or `Map` (the orphan audit keys callables by bare name).
- In README text for the owner, fenced code blocks hold only real commands.
- Commits end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push and do not open a PR inside this plan.

## Review Focus

The five most likely failure modes a real run would hit, and the test that now covers each:

1. **An AI writes its points in the wrong language.**
   - The list, snowball, gap and choose checks refuse text that `detectArgumentLanguage` reads with high confidence as another language. They refuse at the patchable path `points` / `new_points` / `answers`, so the patch follow-up asks for those members again.
   - Tests: Task 4 "refuses English points for a Romanian question at a patchable path" and Task 2 "wrong-language detector".
2. **A merge reply names unknown or duplicate item ids, or leaves items out.**
   - Unknown or reused ids are refused at their exact path (`key_points.N.member_item_ids.M`), so a patch can fix them. Left-out items are kept as their own key points and noted `MERGE_ITEMS_KEPT`.
   - Tests: Task 4 "merge check: unknown, reused and wrong-kind ids", Task 6 "apply merge keeps left-out items", Task 9 "merge leaving items out is noted".
3. **A choose reply names one answer, unknown point ids or a bad rival.**
   - Unknown ids and a self/unknown rival are refused at their path. One answer is filled to two (`ANSWERS_FILLED`) in the ordered sources.
   - Tests: Task 4 "choose check", Task 7 "fills a second answer: map candidate, then OPPOSITE_CASE list, then template".
4. **An AI is busy in the middle of an arm.**
   - Its list is reassigned, a busy merger leads to the code merge, and the busy seat is left out of every later role in that arm. In the practice tool the model sits out the rest of the run, as in formats (`MODEL_BUSY_PARTLY` warning).
   - Tests: Task 9 "a busy list is reassigned and the busy seat takes no later role", Task 11 "a model busy at merge sits out the rest", Task 12 "--dry gives PASS_WITH_WARNINGS".
5. **Romanian quotation marks and diacritics in JSON.**
   - „…” inside text parses. An unescaped straight quote after „ is read by the tolerant decode (INNER_QUOTE). Diacritics never split a merge group (`ș`/`ş`, `ț`/`ţ` and plain letters normalise alike).
   - Tests: Task 4 "Romanian quotes" and Task 2 "normalisation".

## File Structure

| File | Create/Modify | One responsibility |
|---|---|---|
| `packages/map/package.json` | Create | Declares `@debateai/map` (deps: kernel, providers, zod). |
| `packages/map/src/index.ts` | Create | The package's one export list. |
| `packages/map/src/types.ts` | Create | Vocabulary: angle kinds, leans, limits, marks, notes, steps, data shapes. |
| `packages/map/src/text.ts` | Create | Text normalisation for grouping; wrong-language test. |
| `packages/map/src/items.ts` | Create | Opaque item ids; who-raised-what; key point / merged answer records; ranking. |
| `packages/map/src/prompts.ts` | Create | Owner-editable instruction texts, code-owned answer forms, contracts, fingerprint. |
| `packages/map/src/replies.ts` | Create | Strict zod reply schemas, content checks, classification in the gateway's format. |
| `packages/map/src/specs.ts` | Create | Per-step material + contract + check (`MapStepSpec`), and the provider pieces. |
| `packages/map/src/keypoints.ts` | Create | Merge applied, code merge fallback, snowball singletons, gap additions. |
| `packages/map/src/choose.ts` | Create | Choice finishing: answers fill, quotas, choose fallback, rivals, also-raised. |
| `packages/map/src/roles.ts` | Create | Seat rotation, role picks, list assignment, reassignment, angle order and fallback. |
| `packages/map/src/orchestrator.ts` | Create | `MapCaller` contract and the arm A / B / C orchestrators. |
| `package.json` | Modify | Root devDependency `@debateai/map`. |
| `pnpm-lock.yaml` | Modify | Importer entry for the new package (by `pnpm install`). |
| `tools/orphan-audit/src/index.ts` | Modify | Edge row `["map", "packages/map", ["kernel", "providers"]]`. |
| `tests/architecture/scaffold.test.ts` | Modify | Edge-row count 36 → 37 with its history line. |
| `tools/preview-practice/practice-openings-questions.ts` | Create | The 12 fixed questions, arm names, flag readers. |
| `tools/preview-practice/practice-openings-log.ts` | Create | `openings.jsonl` writer/reader and the report built from it. |
| `tools/preview-practice/practice-openings.ts` | Create | The openings run: arms per question, the gateway-backed `MapCaller`, arm T. |
| `tools/preview-practice/practice-openings-dry.ts` | Create | `--dry`: fixed config/targets and the scripted gate ports. |
| `tools/preview-practice/practice-formats.ts` | Modify | Export `recordingGateway` (one word). |
| `tools/preview-practice/practice-report.ts` | Modify | Export three gate helpers; render the per-arm table in `report.md`. |
| `tools/preview-practice/practice.ts` | Modify | Mode `openings`, `--dry`, `--questions`, `--arms`, its log on every way out. |
| `tools/preview-practice/README.md` | Modify | Openings section and file list. |
| `tests/unit/map-package.test.ts` … `tests/unit/practice-openings-cli.test.ts` | Create | One test file per task (listed in each task). |

Why a new package rather than `packages/judgement/src/map/`:

- `tests/unit/prompt-surface-guard.test.ts` counts every `buildFramedPrompt({` under packages/judgement/src recursively and renders each one through `new Judge(...)`. A map builder there would turn it red, or force a Judge-shaped entry for a non-judge step.
- The map is its own organ (spec DR-062: material, not graded claims).
- The cost is small and mechanical: one package.json, one root devDependency, a lockfile importer entry, one orphan-audit edge row and the scaffold count. No tsconfig or vitest change is needed; the root tsconfig already includes `packages/**`.

---

### Task 1: Worktree toolchain and the `@debateai/map` package skeleton

**Files:**
- Create: `packages/map/package.json`, `packages/map/src/index.ts`, `packages/map/src/types.ts`
- Modify: `package.json` (root devDependencies), `pnpm-lock.yaml` (by pnpm), `tools/orphan-audit/src/index.ts:27`, `tests/architecture/scaffold.test.ts:97-100`
- Test: `tests/unit/map-package.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `@debateai/map`, used by every later task):
  - `MAP_FIXED_ANGLE_KINDS: readonly ["OPPOSITE_CASE","ASKER_WORRY","PRACTICAL"]`, `type MapFixedAngleKind`, `type MapAngleKind = MapFixedAngleKind | "SPECIFIC" | "GENERAL"`
  - `MAP_LEANS`, `type MapLean`
  - `MAP_LIMITS` (frozen object)
  - `MAP_MARKS`, `type MapMark`, `MAP_NOTES`, `type MapNote`, `MAP_STEPS`, `type MapStep`, `type MapArm = "A" | "B" | "C"`
  - `type MapSeat = { aiRef; maker }`, `type MapAngle`, `type MapItemOrigin = "BLIND" | "SHOWN" | "GAP"`, `type MapPointItem`, `type MapAnswerItem`, `type MapItem`
  - `type MapKeyPoint`, `type MapMergedAnswer`, `type MapChosenAnswer`, `type MapChoice`, `type MapMarkRecord`, `type MapNoteRecord`, `type MapCallRecord`, `type MapResult`

- [ ] **Step 1: Set up the worktree toolchain (README S-0, once per worktree)**

The worktree has no `node_modules` yet, so no test can run until this is done.

```sh
pnpm install --frozen-lockfile --offline
pnpm run generate:contract
```

Expected: the install finishes without network access, and `packages/contract/generated/` exists. The embedded-postgres hydrate step from README S-0 is only for database tests; this plan has none. If `--offline` fails because the store lacks a package, run the same command without `--offline` (the lockfile is frozen, so nothing changes).

Check that nothing else is running a test, then confirm the single-file test command on an existing suite:

```sh
pgrep -f "vitest[ ]run" || echo "no test run in progress"
pnpm exec vitest run tests/unit/preview-practice-slips.test.ts
```

Expected: `no test run in progress`, then the suite PASSES.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/map-package.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAP_FIXED_ANGLE_KINDS, MAP_LEANS, MAP_LIMITS, MAP_MARKS, MAP_NOTES, MAP_STEPS } from "@debateai/map";
import { auditArchitecture } from "../../tools/orphan-audit/src/index.js";

describe("map package: the shared vocabulary (spec 2026-10-12 §1)", () => {
  it("names the three fixed angle kinds and the three leans", () => {
    expect([...MAP_FIXED_ANGLE_KINDS]).toEqual(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL"]);
    expect([...MAP_LEANS]).toEqual(["for_some_answer", "against_some_answer", "context"]);
  });

  it("keeps the spec's lengths and counts", () => {
    expect(MAP_LIMITS.claimMaxChars).toBe(240);
    expect(MAP_LIMITS.whyMaxChars).toBe(240);
    expect([MAP_LIMITS.anglesMin, MAP_LIMITS.anglesMax]).toEqual([4, 7]);
    expect([MAP_LIMITS.specificAnglesMin, MAP_LIMITS.specificAnglesMax]).toEqual([1, 4]);
    expect([MAP_LIMITS.listPointsMin, MAP_LIMITS.listPointsMax]).toEqual([3, 8]);
    expect([MAP_LIMITS.listAnswersMin, MAP_LIMITS.listAnswersMax]).toEqual([1, 3]);
    expect(MAP_LIMITS.framingChallengesMax).toBe(3);
    expect([MAP_LIMITS.chooseDistinctAnswersMin, MAP_LIMITS.chooseAnswersMax]).toEqual([2, 4]);
    expect(MAP_LIMITS.gapRoundNewPointsToContinue).toBe(2);
    expect(Object.isFrozen(MAP_LIMITS)).toBe(true);
  });

  it("lists exactly the spec's marks, the notes and the steps", () => {
    expect([...MAP_MARKS]).toEqual(["MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK",
      "MAP_UNAVAILABLE_TODAYS_OPENING", "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED"]);
    expect([...MAP_NOTES]).toEqual(["LIST_REASSIGNED", "LIST_DROPPED", "MERGE_ITEMS_KEPT", "GAP_SKIPPED", "GAP_STOPPED"]);
    expect([...MAP_STEPS]).toEqual(["ANGLES", "LIST", "SNOWBALL", "MERGE", "GAP", "CHOOSE"]);
  });

  it("is a declared dependency-edge row that depends on kernel and providers only", async () => {
    const report = await auditArchitecture();
    expect(report.violations.filter((violation) => violation.startsWith("map "))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm exec vitest run tests/unit/map-package.test.ts`
Expected: FAIL. The import `@debateai/map` cannot be resolved.

- [ ] **Step 4: Create the package and register it**

Create `packages/map/package.json` (one line, like the other packages):

```json
{"name":"@debateai/map","version":"0.1.0","private":true,"type":"module","exports":"./src/index.ts","dependencies":{"@debateai/kernel":"workspace:*","@debateai/providers":"workspace:*","zod":"4.4.3"}}
```

Create `packages/map/src/types.ts`:

```ts
/**
 * The map (spec 2026-10-12 "a better debate shape", §1): Stage 1's shared vocabulary.
 *
 * Plain words: before a debate is argued, several AIs look at the question from a few angles and list short points;
 * one AI merges the lists, one or two "what is still missing?" rounds follow, and one AI chooses 2-4 genuinely
 * different answers with the points for and against each. This file names the pieces. It is pure data: no clock, no
 * randomness, no I/O. Phase 1 drives it from the practice tool; Phase 2 from the runner.
 */

export const MAP_FIXED_ANGLE_KINDS = Object.freeze(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL"] as const);
export type MapFixedAngleKind = typeof MAP_FIXED_ANGLE_KINDS[number];
/** SPECIFIC: an angle the planner wrote for this question. GENERAL: the code's own, only in the angles fallback. */
export type MapAngleKind = MapFixedAngleKind | "SPECIFIC" | "GENERAL";

export const MAP_LEANS = Object.freeze(["for_some_answer", "against_some_answer", "context"] as const);
export type MapLean = typeof MAP_LEANS[number];

/** The spec's lengths and counts (§1.1, §1.2), in one frozen object: a policy number is never a bare exported constant. */
export const MAP_LIMITS = Object.freeze({
  claimMaxChars: 240,
  whyMaxChars: 240,
  candidateAnswerMaxChars: 160,
  angleLabelMaxChars: 80,
  angleFocusMaxChars: 240,
  idMaxChars: 24,
  anglesMin: 4,
  anglesMax: 7,
  specificAnglesMin: 1,
  specificAnglesMax: 4,
  listPointsMin: 3,
  listPointsMax: 8,
  listAnswersMin: 1,
  listAnswersMax: 3,
  snowballPointsMax: 8,
  snowballAnswersMax: 3,
  gapPointsMax: 8,
  framingChallengesMax: 3,
  chooseAnswersMin: 1,
  chooseAnswersMax: 4,
  chooseDistinctAnswersMin: 2,
  choosePointsPerSideMax: 6,
  gapRoundNewPointsToContinue: 2
});

/** The marks the spec names (§1.1, §1.2). Phase 2 adds them to the kernel's CONDITION_MARKS with typed records. */
export const MAP_MARKS = Object.freeze(["MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK",
  "MAP_UNAVAILABLE_TODAYS_OPENING", "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED"] as const);
export type MapMark = typeof MAP_MARKS[number];

/** What happened along the way that is not a mark: kept for the practice record and the owners' reading. */
export const MAP_NOTES = Object.freeze(["LIST_REASSIGNED", "LIST_DROPPED", "MERGE_ITEMS_KEPT", "GAP_SKIPPED", "GAP_STOPPED"] as const);
export type MapNote = typeof MAP_NOTES[number];

export const MAP_STEPS = Object.freeze(["ANGLES", "LIST", "SNOWBALL", "MERGE", "GAP", "CHOOSE"] as const);
export type MapStep = typeof MAP_STEPS[number];

/** A: snowball from the first AI. B: blind lists with no angle. C: the angle map (the spec's opening, ruling S1). */
export type MapArm = "A" | "B" | "C";

/** One AI taking part: its reference (a provider ref) and its maker. */
export type MapSeat = Readonly<{ aiRef: string; maker: string }>;

export type MapAngle = Readonly<{ angleId: string; kind: MapAngleKind; label: string; focus: string }>;

/** BLIND: written without seeing anyone's points. SHOWN: written after seeing earlier points (snowball). GAP: a gap round. */
export type MapItemOrigin = "BLIND" | "SHOWN" | "GAP";

type MapItemBase = Readonly<{
  /** Opaque, short (`pt01`, `ca01`): never says who wrote it or in which list. */
  itemId: string;
  seat: MapSeat;
  origin: MapItemOrigin;
  angleId: string | null;
  angleKind: MapAngleKind | null;
  listIndex: number;
}>;
export type MapPointItem = MapItemBase & Readonly<{ kind: "POINT"; claim: string; whyItMatters: string; leans: MapLean }>;
export type MapAnswerItem = MapItemBase & Readonly<{ kind: "ANSWER"; answer: string }>;
export type MapItem = MapPointItem | MapAnswerItem;

export type MapKeyPoint = Readonly<{
  keyPointId: string;
  claim: string;
  memberItemIds: readonly string[];
  /** Distinct makers that raised it blind: the spec's "raised independently by N makers". */
  blindMakers: readonly string[];
  /** Distinct makers that raised it in a gap round. */
  gapMakers: readonly string[];
  /** Distinct makers that raised it at all (blind, shown or gap). */
  makers: readonly string[];
  /** The fixed angle kinds its members came from, in the fixed order. */
  fixedAngleKinds: readonly MapFixedAngleKind[];
  /** More of its members lean against some answer than for one. */
  leansAgainst: boolean;
}>;

export type MapMergedAnswer = Readonly<{
  answerId: string;
  answer: string;
  memberItemIds: readonly string[];
  blindMakers: readonly string[];
  makers: readonly string[];
  fromOppositeCase: boolean;
}>;

export type MapChosenAnswer = Readonly<{
  answerId: string;
  statement: string;
  forKeyPointIds: readonly string[];
  againstKeyPointIds: readonly string[];
  strongestRival: string;
  /** Added by the code (ANSWERS_FILLED), not named by the choose AI. */
  filled: boolean;
}>;

/** The chosen answers, and every key point not chosen ("also raised, not debated"), most-raised first. */
export type MapChoice = Readonly<{ answers: readonly MapChosenAnswer[]; alsoRaised: readonly string[] }>;

export type MapMarkRecord = Readonly<{ mark: MapMark; step: MapStep | "MAP"; detail: string }>;
export type MapNoteRecord = Readonly<{ note: MapNote; step: MapStep; detail: string }>;

/** One model call the map made, in plan order (`order`), whatever order the calls finished in. */
export type MapCallRecord = Readonly<{
  step: MapStep;
  callSiteKey: string;
  aiRef: string;
  maker: string;
  order: number;
  /** BLIND, or the ids of what the AI was shown. */
  shown: "BLIND" | readonly string[];
  outcome: "OK" | "FAILED" | "BUSY";
  code: string | null;
}>;

export type MapResult = Readonly<{
  arm: MapArm;
  /** UNAVAILABLE: fewer than two lists arrived; the caller falls back to today's opening (MAP_UNAVAILABLE_TODAYS_OPENING). */
  kind: "MAP" | "UNAVAILABLE";
  angles: readonly MapAngle[];
  items: readonly MapItem[];
  keyPoints: readonly MapKeyPoint[];
  mergedAnswers: readonly MapMergedAnswer[];
  framingChallenges: readonly string[];
  choice: MapChoice | null;
  marks: readonly MapMarkRecord[];
  notes: readonly MapNoteRecord[];
  calls: readonly MapCallRecord[];
}>;
```

Create `packages/map/src/index.ts`:

```ts
export * from "./types.js";
```

In the root `package.json` devDependencies, insert `"@debateai/map": "workspace:*",` right after the `"@debateai/mail-templates": "workspace:*",` line.

In `tools/orphan-audit/src/index.ts`, insert this row right after the `["judgement", "packages/judgement", ...]` row (line 27):

```ts
  ["map", "packages/map", ["kernel", "providers"]],
```

In `tests/architecture/scaffold.test.ts`, add this history line under `// 37 -> 36: the first card processor's package row, removed with it (NETOPIA spec §2.19).`:

```ts
  // 36 -> 37: the map package row (debate shape spec 2026-10-12, Phase 1). @debateai/map depends on kernel and
  // providers; no app names it yet (Phase 2 adds "map" to apps/runner's row when the runner calls it).
```

In the same file, change `it("matches all 36 dependency-edge rows` to `it("matches all 37 dependency-edge rows` and `expect(report.edgeRowsChecked).toBe(36);` to `expect(report.edgeRowsChecked).toBe(37);`.

Link the new workspace package and record it in the lockfile:

```sh
pnpm install --offline
```

Expected: `pnpm-lock.yaml` gains an importer entry for `packages/map`, and the root gains a `@debateai/map` link. If `--offline` cannot resolve, run `pnpm install` (the only new dependency is zod 4.4.3, which is already in the lockfile).

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm exec vitest run tests/unit/map-package.test.ts`
Expected: PASS (4 tests).

Run: `pnpm exec vitest run tests/architecture/scaffold.test.ts`
Expected: PASS (the edge-row count is now 37; the blocking source-rule list is unchanged).

- [ ] **Step 6: Commit**

```sh
git add packages/map/package.json packages/map/src/index.ts packages/map/src/types.ts package.json pnpm-lock.yaml tools/orphan-audit/src/index.ts tests/architecture/scaffold.test.ts tests/unit/map-package.test.ts
git commit -F - <<'MSG'
Map: the @debateai/map package and its vocabulary (debate shape Phase 1)

- Angle kinds, leans, the spec's lengths and counts, marks, notes and steps (spec 2026-10-12 §1).
- A new workspace package with one edge row (kernel, providers); scaffold edge count 36 -> 37.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 2: Text normalisation, opaque item ids and who-raised-what

**Files:**
- Create: `packages/map/src/text.ts`, `packages/map/src/items.ts`
- Modify: `packages/map/src/index.ts`
- Test: `tests/unit/map-items.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `mapNormaliseText(text: string): string`
  - `mapWrongLanguage(text: string, languageTag: string): boolean`
  - `type MapItemDraft`
  - `mapAssignItemIds(drafts: readonly MapItemDraft[], seed: string, after?: Readonly<{ points: number; answers: number }>): readonly MapItem[]`
  - `mapNextItemNumbers(items: readonly MapItem[]): Readonly<{ points: number; answers: number }>`
  - `mapItemsById(items: readonly MapItem[]): ReadonlyMap<string, MapItem>`
  - `mapRaisedBy(memberItemIds: readonly string[], itemsById: ReadonlyMap<string, MapItem>): Readonly<{ blindMakers: readonly string[]; gapMakers: readonly string[]; makers: readonly string[] }>`
  - `mapKeyPoint(keyPointId: string, claim: string, memberItemIds: readonly string[], itemsById: ReadonlyMap<string, MapItem>): MapKeyPoint`
  - `mapMergedAnswer(answerId: string, answer: string, memberItemIds: readonly string[], itemsById: ReadonlyMap<string, MapItem>): MapMergedAnswer`
  - `mapRankKeyPoints(keyPoints: readonly MapKeyPoint[]): readonly MapKeyPoint[]`
  - `mapRankMergedAnswers(answers: readonly MapMergedAnswer[]): readonly MapMergedAnswer[]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/map-items.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  mapAssignItemIds,
  mapItemsById,
  mapKeyPoint,
  mapMergedAnswer,
  mapNextItemNumbers,
  mapNormaliseText,
  mapRaisedBy,
  mapRankKeyPoints,
  mapWrongLanguage,
  type MapItemDraft,
  type MapSeat
} from "@debateai/map";

const A: MapSeat = { aiRef: "ai-a", maker: "maker-a" };
const B: MapSeat = { aiRef: "ai-b", maker: "maker-b" };
const C: MapSeat = { aiRef: "ai-c", maker: "maker-c" };
const A2: MapSeat = { aiRef: "ai-a2", maker: "maker-a" };

function point(seat: MapSeat, listIndex: number, position: number, claim: string,
  origin: "BLIND" | "SHOWN" | "GAP" = "BLIND", angleKind: "OPPOSITE_CASE" | "ASKER_WORRY" | null = null,
  leans: "for_some_answer" | "against_some_answer" | "context" = "context"): MapItemDraft {
  return { kind: "POINT", seat, origin, angleId: angleKind === null ? null : angleKind.toLowerCase(), angleKind, listIndex, position,
    claim, whyItMatters: "It could change the answer.", leans };
}

describe("map text: normalisation for grouping", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(mapNormaliseText("  The COST — is high!  ")).toBe(mapNormaliseText("the cost is high"));
  });

  it("reads Romanian letters with or without diacritics, comma or cedilla, alike", () => {
    expect(mapNormaliseText("Țara și școala")).toBe("tara si scoala");
    expect(mapNormaliseText("Ţara şi şcoala")).toBe("tara si scoala");
    expect(mapNormaliseText("„Costul” e mare")).toBe(mapNormaliseText("\"Costul\" e mare"));
  });
});

describe("map text: the wrong-language detector", () => {
  it("flags confident English for a Romanian question", () => {
    expect(mapWrongLanguage("The cost of the change is high and it should be paid by the state because the people want it.", "ro")).toBe(true);
  });

  it("accepts Romanian for a Romanian question, and never refuses when the question's language is unknown", () => {
    expect(mapWrongLanguage("Costul schimbării este mare și ar trebui plătit de stat pentru că oamenii vor asta.", "ro")).toBe(false);
    expect(mapWrongLanguage("The cost of the change is high and it should be paid by the state because the people want it.", "und")).toBe(false);
    expect(mapWrongLanguage("", "ro")).toBe(false);
  });
});

describe("map items: opaque ids", () => {
  const drafts: MapItemDraft[] = [0, 1, 2].flatMap((listIndex) => [0, 1, 2].map((position) =>
    point([A, B, C][listIndex]!, listIndex, position, `Point ${String(listIndex)}-${String(position)}`)));

  it("numbers points pt01.. and answers ca01.., short enough to survive the practice redaction", () => {
    const items = mapAssignItemIds([...drafts, { kind: "ANSWER", seat: A, origin: "BLIND", angleId: null, angleKind: null,
      listIndex: 0, position: 0, answer: "Yes." }], "seed-1");
    expect(items.filter((item) => item.kind === "POINT").map((item) => item.itemId).sort())
      .toEqual(["pt01", "pt02", "pt03", "pt04", "pt05", "pt06", "pt07", "pt08", "pt09"]);
    expect(items.filter((item) => item.kind === "ANSWER").map((item) => item.itemId)).toEqual(["ca01"]);
    expect(items.every((item) => item.itemId.length <= 8)).toBe(true);
  });

  it("is the same for the same seed, and the numbering does not follow the lists for every seed", () => {
    const once = mapAssignItemIds(drafts, "seed-1").map((item) => `${item.itemId}:${item.seat.aiRef}`);
    expect(mapAssignItemIds(drafts, "seed-1").map((item) => `${item.itemId}:${item.seat.aiRef}`)).toEqual(once);
    const grouped = ["seed-1", "seed-2", "seed-3", "seed-4", "seed-5"].every((seed) => {
      const byId = [...mapAssignItemIds(drafts, seed)].sort((a, b) => a.itemId.localeCompare(b.itemId));
      return byId.map((item) => item.listIndex).join("") === "000111222";
    });
    expect(grouped).toBe(false);
  });

  it("continues the numbering after earlier items", () => {
    const first = mapAssignItemIds(drafts, "seed-1");
    expect(mapNextItemNumbers(first)).toEqual({ points: 9, answers: 0 });
    const gap = mapAssignItemIds([point(B, 101, 0, "A new point", "GAP")], "seed-gap", mapNextItemNumbers(first));
    expect(gap.map((item) => item.itemId)).toEqual(["pt10"]);
  });
});

describe("map items: who raised what (computed by code, blind and gap kept apart)", () => {
  const items = mapAssignItemIds([
    point(A, 0, 0, "Shared", "BLIND", "OPPOSITE_CASE", "against_some_answer"),
    point(A2, 1, 0, "Shared", "BLIND", null, "against_some_answer"),
    point(B, 2, 0, "Shared", "BLIND", null, "for_some_answer"),
    point(C, 101, 0, "Shared", "GAP"),
    point(C, 3, 0, "Seen", "SHOWN")
  ], "seed-raise");
  const byId = mapItemsById(items);
  const ids = (claim: string) => items.filter((item) => item.kind === "POINT" && item.claim === claim).map((item) => item.itemId);

  it("counts distinct makers, blind apart from gap; a shown item counts only among all makers", () => {
    expect(mapRaisedBy(ids("Shared"), byId)).toEqual({ blindMakers: ["maker-a", "maker-b"], gapMakers: ["maker-c"],
      makers: ["maker-a", "maker-b", "maker-c"] });
    expect(mapRaisedBy(ids("Seen"), byId)).toEqual({ blindMakers: [], gapMakers: [], makers: ["maker-c"] });
  });

  it("builds a key point with its fixed angle kinds and its lean", () => {
    const keyPoint = mapKeyPoint("kp01", "Shared", ids("Shared"), byId);
    expect(keyPoint.fixedAngleKinds).toEqual(["OPPOSITE_CASE"]);
    expect(keyPoint.leansAgainst).toBe(true);
    expect(keyPoint.blindMakers).toHaveLength(2);
  });

  it("ranks by blind makers, then all makers, then members, then id", () => {
    const one = mapKeyPoint("kp02", "Seen", ids("Seen"), byId);
    const shared = mapKeyPoint("kp01", "Shared", ids("Shared"), byId);
    expect(mapRankKeyPoints([one, shared]).map((keyPoint) => keyPoint.keyPointId)).toEqual(["kp01", "kp02"]);
  });

  it("builds a merged answer that knows when it came from an OPPOSITE_CASE list", () => {
    const answers = mapAssignItemIds([{ kind: "ANSWER", seat: A, origin: "BLIND", angleId: "opp", angleKind: "OPPOSITE_CASE",
      listIndex: 0, position: 0, answer: "No." }], "seed-answer");
    const merged = mapMergedAnswer("an01", "No.", answers.map((item) => item.itemId), mapItemsById(answers));
    expect(merged.fromOppositeCase).toBe(true);
    expect(merged.blindMakers).toEqual(["maker-a"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run tests/unit/map-items.test.ts`
Expected: FAIL. The new names are not exported from `@debateai/map` yet, so they resolve to `undefined` and the first call throws `TypeError: ... is not a function`.

- [ ] **Step 3: Implement**

Create `packages/map/src/text.ts`:

```ts
import { detectArgumentLanguage } from "@debateai/kernel";

/**
 * The text a merge-by-rule compares: letters and digits only, lower case, diacritics dropped (Romanian ș/ş and ț/ţ and
 * their plain letters read alike), single spaces. Used only to group identical claims; never shown to anyone.
 */
export function mapNormaliseText(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * True when the text is confidently in another language than the question's (`languageTag`). The detector is the
 * engine's own (no model); a low-confidence reading, an empty text or an unknown question language never refuses.
 */
export function mapWrongLanguage(text: string, languageTag: string): boolean {
  if (languageTag === "und" || text.trim() === "") return false;
  const detected = detectArgumentLanguage(text);
  return detected.confidence === "high" && detected.tag !== "und" && detected.tag !== languageTag;
}
```

Create `packages/map/src/items.ts`:

```ts
import { createHash } from "node:crypto";
import {
  MAP_FIXED_ANGLE_KINDS,
  type MapAngleKind,
  type MapItem,
  type MapItemOrigin,
  type MapKeyPoint,
  type MapLean,
  type MapMergedAnswer,
  type MapPointItem,
  type MapSeat
} from "./types.js";

type MapDraftBase = Readonly<{
  seat: MapSeat;
  origin: MapItemOrigin;
  angleId: string | null;
  angleKind: MapAngleKind | null;
  listIndex: number;
  /** Its place in its own list. */
  position: number;
}>;

/** An item before it has an id: what one list (or gap round) said, with who said it. */
export type MapItemDraft =
  | (MapDraftBase & Readonly<{ kind: "POINT"; claim: string; whyItMatters: string; leans: MapLean }>)
  | (MapDraftBase & Readonly<{ kind: "ANSWER"; answer: string }>);

function mapItemLabel(prefix: "pt" | "ca", n: number): string {
  return `${prefix}${String(n).padStart(2, "0")}`;
}

/** How many points and answers are numbered so far (the next ids continue from here). */
export function mapNextItemNumbers(items: readonly MapItem[]): Readonly<{ points: number; answers: number }> {
  return Object.freeze({
    points: items.filter((item) => item.kind === "POINT").length,
    answers: items.filter((item) => item.kind === "ANSWER").length
  });
}

/**
 * Opaque ids (spec §1.1, "every item with an opaque item id; never who wrote it"). The drafts are put in a fixed
 * pseudo-random order by a digest of the seed and each draft's place, then numbered: points pt01.., answers ca01...
 * The same seed always gives the same ids; the numbering does not follow the lists, so an id says nothing about its
 * author. Short on purpose: the practice report blanks any 32+ character id-like run.
 */
export function mapAssignItemIds(drafts: readonly MapItemDraft[], seed: string,
  after: Readonly<{ points: number; answers: number }> = { points: 0, answers: 0 }): readonly MapItem[] {
  const keyed = drafts.map((draft) => ({
    draft,
    key: createHash("sha256").update(`${seed}|${String(draft.listIndex)}|${draft.kind}|${String(draft.position)}|${draft.seat.aiRef}`).digest("hex")
  }));
  keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  let points = after.points;
  let answers = after.answers;
  const out: MapItem[] = [];
  for (const { draft } of keyed) {
    const base = { seat: draft.seat, origin: draft.origin, angleId: draft.angleId, angleKind: draft.angleKind, listIndex: draft.listIndex };
    if (draft.kind === "POINT") {
      points += 1;
      out.push(Object.freeze({ ...base, itemId: mapItemLabel("pt", points), kind: "POINT" as const, claim: draft.claim,
        whyItMatters: draft.whyItMatters, leans: draft.leans }));
    } else {
      answers += 1;
      out.push(Object.freeze({ ...base, itemId: mapItemLabel("ca", answers), kind: "ANSWER" as const, answer: draft.answer }));
    }
  }
  return Object.freeze(out);
}

export function mapItemsById(items: readonly MapItem[]): ReadonlyMap<string, MapItem> {
  return new Map(items.map((item) => [item.itemId, item] as const));
}

/**
 * Who raised a group of items, by maker, computed by code from the items alone (spec §1.1, "the merge AI never
 * counts"). Blind items and gap items are kept apart; a shown (snowball) item counts only among all makers.
 */
export function mapRaisedBy(memberItemIds: readonly string[], itemsById: ReadonlyMap<string, MapItem>):
  Readonly<{ blindMakers: readonly string[]; gapMakers: readonly string[]; makers: readonly string[] }> {
  const blind = new Set<string>();
  const gap = new Set<string>();
  const all = new Set<string>();
  for (const id of memberItemIds) {
    const item = itemsById.get(id);
    if (item === undefined) continue;
    all.add(item.seat.maker);
    if (item.origin === "BLIND") blind.add(item.seat.maker);
    if (item.origin === "GAP") gap.add(item.seat.maker);
  }
  return Object.freeze({
    blindMakers: Object.freeze([...blind].sort()),
    gapMakers: Object.freeze([...gap].sort()),
    makers: Object.freeze([...all].sort())
  });
}

export function mapKeyPoint(keyPointId: string, claim: string, memberItemIds: readonly string[],
  itemsById: ReadonlyMap<string, MapItem>): MapKeyPoint {
  const members = memberItemIds.map((id) => itemsById.get(id)).filter((item): item is MapItem => item !== undefined);
  const points = members.filter((item): item is MapPointItem => item.kind === "POINT");
  const against = points.filter((item) => item.leans === "against_some_answer").length;
  const support = points.filter((item) => item.leans === "for_some_answer").length;
  return Object.freeze({
    keyPointId,
    claim,
    memberItemIds: Object.freeze([...memberItemIds]),
    ...mapRaisedBy(memberItemIds, itemsById),
    fixedAngleKinds: Object.freeze(MAP_FIXED_ANGLE_KINDS.filter((kind) => members.some((item) => item.angleKind === kind))),
    leansAgainst: against > support
  });
}

export function mapMergedAnswer(answerId: string, answer: string, memberItemIds: readonly string[],
  itemsById: ReadonlyMap<string, MapItem>): MapMergedAnswer {
  const raised = mapRaisedBy(memberItemIds, itemsById);
  return Object.freeze({
    answerId,
    answer,
    memberItemIds: Object.freeze([...memberItemIds]),
    blindMakers: raised.blindMakers,
    makers: raised.makers,
    fromOppositeCase: memberItemIds.some((id) => itemsById.get(id)?.angleKind === "OPPOSITE_CASE")
  });
}

/** Most raised first: distinct blind makers, then all makers, then members, then id (a fixed order). */
export function mapRankKeyPoints(keyPoints: readonly MapKeyPoint[]): readonly MapKeyPoint[] {
  return Object.freeze([...keyPoints].sort((a, b) => b.blindMakers.length - a.blindMakers.length
    || b.makers.length - a.makers.length || b.memberItemIds.length - a.memberItemIds.length
    || a.keyPointId.localeCompare(b.keyPointId)));
}

export function mapRankMergedAnswers(answers: readonly MapMergedAnswer[]): readonly MapMergedAnswer[] {
  return Object.freeze([...answers].sort((a, b) => b.blindMakers.length - a.blindMakers.length
    || b.makers.length - a.makers.length || b.memberItemIds.length - a.memberItemIds.length
    || a.answerId.localeCompare(b.answerId)));
}
```

Replace `packages/map/src/index.ts` with:

```ts
export * from "./types.js";
export * from "./text.js";
export * from "./items.js";
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm exec vitest run tests/unit/map-items.test.ts`
Expected: PASS (11 tests).

If the two wrong-language cases disagree with the detector, change the test SENTENCES so they carry more function words of their language (for example add "și", "pentru", "că" or "the", "and", "because"). Never loosen `mapWrongLanguage`.

- [ ] **Step 5: Commit**

```sh
git add packages/map/src/text.ts packages/map/src/items.ts packages/map/src/index.ts tests/unit/map-items.test.ts
git commit -F - <<'MSG'
Map: opaque item ids and who-raised-what, computed by code

- Item ids pt01/ca01 in a seed-fixed order that never follows the lists (spec §1.1).
- Blind and gap makers kept apart; key points know their fixed angle kinds and lean; a fixed ranking.
- Normalisation for grouping (Romanian diacritics alike) and the wrong-language detector.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 3: Prompt contracts (owner-editable instructions, code-owned answer forms, fingerprint)

**Files:**
- Create: `packages/map/src/prompts.ts`
- Modify: `packages/map/src/index.ts`
- Test: `tests/unit/map-prompts.test.ts`

**Interfaces:**
- Consumes: `MAP_LIMITS` (Task 1); `PromptContract`, `promptContractFingerprintText`, `buildFramedPrompt`, `readPromptFrame` (`@debateai/providers`); `argumentLanguageDirective` (`@debateai/kernel`).
- Produces:
  - `MAP_CONTRACT_NAMES` (`"angles" | "listAngle" | "listOpen" | "listSnowball" | "merge" | "gap" | "choose"`), `type MapContractName`
  - `MAP_CONTRACT_IDS: Readonly<Record<MapContractName, string>>`
  - `type MapInstructionTexts`, `type MapPromptContractSet = Readonly<Record<MapContractName, PromptContract>>`
  - `MAP_DEFAULT_INSTRUCTIONS: MapInstructionTexts`, `MAP_ANSWER_FORMS: Readonly<Record<MapContractName, string>>`
  - `mapPromptContracts(texts?: MapInstructionTexts): MapPromptContractSet`
  - `mapPromptFingerprintText(contracts?: MapPromptContractSet): string`, `mapPromptContractHash(contracts?: MapPromptContractSet): string`
  - `mapContractInLanguage(contract: PromptContract, languageName: string): PromptContract`

The instruction texts below are the owners' editable text (spec §4). The safety frame already tells every model that the question is evidence and never orders, so the texts do not repeat it. Phase 2 seals `mapPromptContractHash()` in the register; Phase 1 only computes it. It is a separate fingerprint, so the sealed judge hash (`tests/unit/hs-s01-seal.test.ts`) does not move.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/map-prompts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { argumentLanguageDirective } from "@debateai/kernel";
import { buildFramedPrompt, promptContractFingerprintText, readPromptFrame } from "@debateai/providers";
import {
  MAP_ANSWER_FORMS,
  MAP_CONTRACT_IDS,
  MAP_CONTRACT_NAMES,
  MAP_DEFAULT_INSTRUCTIONS,
  mapContractInLanguage,
  mapPromptContractHash,
  mapPromptContracts,
  mapPromptFingerprintText
} from "@debateai/map";

describe("map prompts: seven contracts, owner text and code forms", () => {
  it("names the seven steps with stable contract ids", () => {
    expect([...MAP_CONTRACT_NAMES]).toEqual(["angles", "listAngle", "listOpen", "listSnowball", "merge", "gap", "choose"]);
    expect(Object.values(MAP_CONTRACT_IDS)).toEqual(["map.angles.v1", "map.list.angle.v1", "map.list.open.v1",
      "map.list.snowball.v1", "map.merge.v1", "map.gap.v1", "map.choose.v1"]);
  });

  it("builds every contract through the one frame builder, and the door reads it back", () => {
    const contracts = mapPromptContracts();
    for (const name of MAP_CONTRACT_NAMES) {
      const framed = buildFramedPrompt({ contract: contracts[name], material: [{ name: "question_line", content: "Should X?" }] });
      expect(readPromptFrame(framed.packet).contractId).toBe(MAP_CONTRACT_IDS[name]);
      expect(contracts[name].instruction).toBe(MAP_DEFAULT_INSTRUCTIONS[name]);
      expect(contracts[name].answerForm).toBe(MAP_ANSWER_FORMS[name]);
    }
  });

  it("states the spec's limits in the answer forms", () => {
    expect(MAP_ANSWER_FORMS.angles).toContain("OPPOSITE_CASE");
    expect(MAP_ANSWER_FORMS.angles).toContain("4 to 7 entries");
    expect(MAP_ANSWER_FORMS.listAngle).toContain("at most 240 characters");
    expect(MAP_ANSWER_FORMS.listAngle).toContain("3 to 8 entries");
    expect(MAP_ANSWER_FORMS.gap).toContain("0 to 3 entries");
    expect(MAP_ANSWER_FORMS.choose).toContain("strongest_rival");
  });

  it("appends the argument-language directive to the instruction, never to the material", () => {
    const contract = mapContractInLanguage(mapPromptContracts().listOpen, "Romanian");
    expect(contract.instruction.endsWith(argumentLanguageDirective("Romanian"))).toBe(true);
    expect(contract.answerForm).toBe(MAP_ANSWER_FORMS.listOpen);
  });

  it("fingerprints all seven, and an owner's edit is a new fingerprint", () => {
    const text = mapPromptFingerprintText();
    for (const name of MAP_CONTRACT_NAMES) expect(text).toContain(promptContractFingerprintText(mapPromptContracts()[name]));
    expect(mapPromptContractHash()).toMatch(/^[0-9a-f]{64}$/u);
    expect(mapPromptContractHash()).toBe(mapPromptContractHash());
    const edited = mapPromptContracts({ ...MAP_DEFAULT_INSTRUCTIONS, gap: `${MAP_DEFAULT_INSTRUCTIONS.gap} Be brief.` });
    expect(mapPromptContractHash(edited)).not.toBe(mapPromptContractHash());
  });

  it("never asks a merging or gap AI about authors or counts", () => {
    for (const name of ["merge", "gap"] as const) {
      expect(MAP_DEFAULT_INSTRUCTIONS[name]).not.toMatch(/raised_by|maker|author/iu);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run tests/unit/map-prompts.test.ts`
Expected: FAIL (`MAP_CONTRACT_NAMES` is undefined).

- [ ] **Step 3: Implement**

Create `packages/map/src/prompts.ts`:

```ts
import { createHash } from "node:crypto";
import { argumentLanguageDirective } from "@debateai/kernel";
import { promptContractFingerprintText, type PromptContract } from "@debateai/providers";
import { MAP_LIMITS } from "./types.js";

/**
 * The map's prompt contracts (spec 2026-10-12 §4). Each step's INSTRUCTION is the owners' editable text; its ANSWER
 * FORM and the safety frame around it are code's. An edit of the text is a new fingerprint, so in Phase 2 it can only
 * ship as a new register version. The safety frame already says the material is evidence, never orders.
 */
export const MAP_CONTRACT_NAMES = Object.freeze(["angles", "listAngle", "listOpen", "listSnowball", "merge", "gap", "choose"] as const);
export type MapContractName = typeof MAP_CONTRACT_NAMES[number];
export type MapInstructionTexts = Readonly<Record<MapContractName, string>>;
export type MapPromptContractSet = Readonly<Record<MapContractName, PromptContract>>;

export const MAP_CONTRACT_IDS: Readonly<Record<MapContractName, string>> = Object.freeze({
  angles: "map.angles.v1",
  listAngle: "map.list.angle.v1",
  listOpen: "map.list.open.v1",
  listSnowball: "map.list.snowball.v1",
  merge: "map.merge.v1",
  gap: "map.gap.v1",
  choose: "map.choose.v1"
});

const LEANS_SENTENCE = "Mark how each point leans: for_some_answer when it supports some answer to the question, "
  + "against_some_answer when it counts against some answer, context when it is background that any answer has to take into account.";
const POINT_SENTENCE = "A point is one short claim and one short line on why it matters for the answer.";

export const MAP_DEFAULT_INSTRUCTIONS: MapInstructionTexts = Object.freeze({
  angles: [
    "Plan the angles from which the question will be examined before it is debated.",
    "An angle is one way of looking at the question that is likely to bring up points the other angles miss.",
    "Always include exactly one angle of each of three fixed kinds: OPPOSITE_CASE, the strongest case for an answer different",
    "from the one most people would give first; ASKER_WORRY, what the person asking is probably worried about or trying to decide;",
    "PRACTICAL, what the person should actually do and what it would take.",
    "Then add one to four angles of kind SPECIFIC that fit this particular question, for example a group of people affected,",
    "a time horizon, a cost, a risk or a body of evidence.",
    "Give each angle a short label and one sentence saying what to look at. Do not answer the question."
  ].join(" "),
  listAngle: [
    "List the points that matter for answering the question, looking at it from the angle given in angle_label and angle_focus.",
    POINT_SENTENCE,
    "Prefer points that someone looking from another angle would probably miss.",
    LEANS_SENTENCE,
    "Then name one to three short answers to the question that you think are still open, without arguing for them.",
    "Write points, not an essay, and do not repeat one point in other words."
  ].join(" "),
  listOpen: [
    "List the points that matter most for answering the question, from every side.",
    POINT_SENTENCE,
    LEANS_SENTENCE,
    "Then name one to three short answers to the question that you think are still open, without arguing for them.",
    "Write points, not an essay, and do not repeat one point in other words."
  ].join(" "),
  listSnowball: [
    "Other participants have already listed the points in points_so_far.",
    "Add only points that are genuinely new and matter for answering the question: a point that says the same as one already",
    "listed, in other words, is not new.",
    POINT_SENTENCE,
    LEANS_SENTENCE,
    "Then name up to three short answers to the question that you think are still open, or none.",
    "If nothing new is left, return empty lists."
  ].join(" "),
  merge: [
    "Group the items that make the same point. Each entry in points and in candidate_answers has an item_id.",
    "Put points that say the same thing, even in different words, into one key point, and write one short claim that states it fairly.",
    "Keep points that say different things apart, even when they are related; when in doubt, keep them apart.",
    "In the same way, group the candidate answers that mean the same answer and write one short answer for each group.",
    "Use every item_id exactly once: point ids only in key_points, answer ids only in answers.",
    "Do not add points or answers, and do not judge which are right."
  ].join(" "),
  gap: [
    "Look for what is still missing before the question is debated. key_points and answers list what has been raised so far.",
    "Add only points that are genuinely new and matter for the answer, such as a consideration, a group of people, a risk,",
    "a cost or a piece of evidence nobody has mentioned. A point that restates one already listed is not new.",
    POINT_SENTENCE,
    LEANS_SENTENCE,
    "You may also note up to three framing challenges: ways the question itself may be framed too narrowly or rest on a doubtful assumption.",
    "If nothing important is missing, return empty lists."
  ].join(" "),
  choose: [
    "Choose what the debate will be about.",
    "From answers and key_points, name two to four answers to the question that are genuinely different from each other,",
    "so that each can be argued in full by a different participant; prefer answers that people actually hold, and never",
    "two wordings of the same answer.",
    "For each answer, list by key_point_id the key points that speak for it and those that speak against it, most important",
    "first, judging importance by one test: could this point change the answer?",
    "Each key point shows raised_by, how many participants raised it independently, and angle_kind when it came from a fixed",
    "angle; a point raised by only one participant can still be the most important.",
    "For each answer, name in strongest_rival the answer_id of the other answer that competes with it most.",
    "Do not argue the answers here."
  ].join(" ")
});

const L = MAP_LIMITS;
const STRICT = "Return only one JSON object with exactly this schema and no additional keys:";
const ID_FORM = `short id of lowercase letters, digits and hyphens, at most ${String(L.idMaxChars)} characters`;
const POINT_FORM = `{ "claim": non-empty string of at most ${String(L.claimMaxChars)} characters, "why_it_matters": non-empty string of at most ${String(L.whyMaxChars)} characters, "leans": "for_some_answer" | "against_some_answer" | "context" }`;
const LIST_FORM = `${STRICT}\n{ "points": [${POINT_FORM}, ...], "candidate_answers": [non-empty string of at most ${String(L.candidateAnswerMaxChars)} characters, ...] }\npoints has ${String(L.listPointsMin)} to ${String(L.listPointsMax)} entries; candidate_answers has ${String(L.listAnswersMin)} to ${String(L.listAnswersMax)} entries.`;

export const MAP_ANSWER_FORMS: Readonly<Record<MapContractName, string>> = Object.freeze({
  angles: `${STRICT}\n{ "angles": [{ "angle_id": ${ID_FORM}, "kind": "OPPOSITE_CASE" | "ASKER_WORRY" | "PRACTICAL" | "SPECIFIC", "label": non-empty string of at most ${String(L.angleLabelMaxChars)} characters, "focus": non-empty string of at most ${String(L.angleFocusMaxChars)} characters }, ...] }\nangles has ${String(L.anglesMin)} to ${String(L.anglesMax)} entries: exactly one each of OPPOSITE_CASE, ASKER_WORRY and PRACTICAL, and ${String(L.specificAnglesMin)} to ${String(L.specificAnglesMax)} of SPECIFIC; every angle_id is different.`,
  listAngle: LIST_FORM,
  listOpen: LIST_FORM,
  listSnowball: `${STRICT}\n{ "points": [${POINT_FORM}, ...], "candidate_answers": [non-empty string of at most ${String(L.candidateAnswerMaxChars)} characters, ...] }\npoints has 0 to ${String(L.snowballPointsMax)} entries; candidate_answers has 0 to ${String(L.snowballAnswersMax)} entries.`,
  merge: `${STRICT}\n{ "key_points": [{ "key_point_id": ${ID_FORM}, "claim": non-empty string of at most ${String(L.claimMaxChars)} characters, "member_item_ids": [item_id, ...] }, ...], "answers": [{ "answer_id": ${ID_FORM}, "answer": non-empty string of at most ${String(L.candidateAnswerMaxChars)} characters, "member_item_ids": [item_id, ...] }, ...] }\nEvery member_item_ids list has at least one item_id; every item_id appears in exactly one list; every key_point_id and answer_id is different.`,
  gap: `${STRICT}\n{ "new_points": [${POINT_FORM}, ...], "framing_challenges": [non-empty string of at most ${String(L.claimMaxChars)} characters, ...] }\nnew_points has 0 to ${String(L.gapPointsMax)} entries; framing_challenges has 0 to ${String(L.framingChallengesMax)} entries.`,
  choose: `${STRICT}\n{ "answers": [{ "answer_id": ${ID_FORM}, "statement": non-empty string of at most ${String(L.claimMaxChars)} characters, "for": [key_point_id, ...], "against": [key_point_id, ...], "strongest_rival": answer_id of another answer, or null }, ...] }\nanswers has ${String(L.chooseAnswersMin)} to ${String(L.chooseAnswersMax)} entries (at least ${String(L.chooseDistinctAnswersMin)} when the question allows it); for and against each have at most ${String(L.choosePointsPerSideMax)} entries and use only key_point_id values given in key_points; every answer_id is different.`
});

/** The seven contracts from the given instruction texts (default: the shipped text). */
export function mapPromptContracts(texts: MapInstructionTexts = MAP_DEFAULT_INSTRUCTIONS): MapPromptContractSet {
  const entries = MAP_CONTRACT_NAMES.map((name) => [name, Object.freeze({
    contractId: MAP_CONTRACT_IDS[name],
    instruction: texts[name],
    answerForm: MAP_ANSWER_FORMS[name]
  })] as const);
  return Object.freeze(Object.fromEntries(entries) as Record<MapContractName, PromptContract>);
}

/** The one fingerprint text over all seven (frame version included, via promptContractFingerprintText). */
export function mapPromptFingerprintText(contracts: MapPromptContractSet = mapPromptContracts()): string {
  return MAP_CONTRACT_NAMES.map((name) => promptContractFingerprintText(contracts[name])).join("\n---\n");
}

/** The map's contract hash: what Phase 2 seals in the register, and what each map call carries as `contractHash`. */
export function mapPromptContractHash(contracts: MapPromptContractSet = mapPromptContracts()): string {
  return createHash("sha256").update(mapPromptFingerprintText(contracts)).digest("hex");
}

/** The contract a call sends: the instruction followed by the argument-language directive (as the story's contracts do). */
export function mapContractInLanguage(contract: PromptContract, languageName: string): PromptContract {
  return Object.freeze({ ...contract, instruction: `${contract.instruction}\n\n${argumentLanguageDirective(languageName)}` });
}
```

Add to `packages/map/src/index.ts`:

```ts
export * from "./prompts.js";
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm exec vitest run tests/unit/map-prompts.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```sh
git add packages/map/src/prompts.ts packages/map/src/index.ts tests/unit/map-prompts.test.ts
git commit -F - <<'MSG'
Map: seven prompt contracts with owner-editable text and their own fingerprint

Angle planner, list with an angle, list without one, snowball list, merge, gap and choose (spec §4). The answer forms
are code's and state the spec's limits; the language directive rides in the instruction. A separate fingerprint, so
the sealed judge hash does not move.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 4: Strict reply schemas and checks, in the gateway's repair format

**Files:**
- Create: `packages/map/src/replies.ts`
- Modify: `packages/map/src/index.ts`
- Test: `tests/unit/map-replies.test.ts`

**Interfaces:**
- Consumes: `MAP_LIMITS`, `MAP_LEANS`, `MAP_FIXED_ANGLE_KINDS` (Task 1); `mapWrongLanguage` (Task 2); `decodeModelJson`, `ContentClassification`, `ModelReplyFacts` (`@debateai/providers`).
- Produces:
  - schemas `mapAnglesReplySchema`, `mapListReplySchema`, `mapSnowballReplySchema`, `mapMergeReplySchema`, `mapGapReplySchema`, `mapChooseReplySchema`
  - types `MapAnglesReply`, `MapListReply`, `MapSnowballReply`, `MapMergeReply`, `MapGapReply`, `MapChooseReply`
  - `type MapReplyIssue = Readonly<{ path: readonly (string | number)[]; code: string }>`, `type MapReplyCheck<T> = (value: T) => readonly MapReplyIssue[]`
  - `mapClassifyReply<T>(content: string, reply: ModelReplyFacts | undefined, schema: z.ZodType<T>, check: MapReplyCheck<T>): Readonly<{ classification: ContentClassification; value: T | null }>`
  - `mapLanguageIssues(texts: readonly string[], languageTag: string, path: readonly (string | number)[]): readonly MapReplyIssue[]`
  - `mapAnglesCheck: MapReplyCheck<MapAnglesReply>`
  - `mapListCheck(languageTag: string): MapReplyCheck<MapListReply | MapSnowballReply>`
  - `mapMergeCheck(pointIds: ReadonlySet<string>, answerIds: ReadonlySet<string>): MapReplyCheck<MapMergeReply>`
  - `mapGapCheck(languageTag: string): MapReplyCheck<MapGapReply>`
  - `mapChooseCheck(keyPointIds: ReadonlySet<string>, languageTag: string): MapReplyCheck<MapChooseReply>`

The refusal text is a JSON list of `{code, path, message}`, with `message` set to a code and never to model text. That is the form the gateway's patch follow-up reads (`planPatchFollowUp` → `schemaFailurePaths`). So a reply that decodes to an object but fails at named members is patched first, and fully re-asked only when that does not work.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/map-replies.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planPatchFollowUp } from "@debateai/providers";
import {
  mapAnglesCheck,
  mapAnglesReplySchema,
  mapChooseCheck,
  mapChooseReplySchema,
  mapClassifyReply,
  mapGapCheck,
  mapGapReplySchema,
  mapListCheck,
  mapListReplySchema,
  mapMergeCheck,
  mapMergeReplySchema,
  mapSnowballReplySchema
} from "@debateai/map";

const STOP = { finishReason: "stop" };
const RO_WHY = "Ar putea schimba răspunsul la întrebare.";
const point = (claim: string, why = "It could change the answer.") => ({ claim, why_it_matters: why, leans: "context" });
const ANGLES = { angles: [
  { angle_id: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The strongest case for another answer." },
  { angle_id: "worry", kind: "ASKER_WORRY", label: "The worry", focus: "What the person asking fears." },
  { angle_id: "do", kind: "PRACTICAL", label: "What to do", focus: "What to do next." },
  { angle_id: "cost", kind: "SPECIFIC", label: "Cost", focus: "Who pays for it." }
] };
const EN_POINTS = ["The cost of the change is high and the state should pay it.", "The people who use it most are poor.",
  "The change can be undone later if it fails."].map((claim) => point(claim));
const RO_POINTS = ["Costul schimbării este mare și statul ar trebui să îl plătească.", "Cei care îl folosesc cel mai mult sunt săraci.",
  "Schimbarea poate fi anulată mai târziu dacă nu merge."].map((claim) => point(claim, RO_WHY));
const issuesOf = (parseError: string | null) => JSON.parse(parseError ?? "[]") as { code: string; path: (string | number)[]; message: string }[];

describe("map replies: angles", () => {
  it("accepts the three fixed kinds plus one SPECIFIC", () => {
    const out = mapClassifyReply(JSON.stringify(ANGLES), STOP, mapAnglesReplySchema, mapAnglesCheck);
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(out.value?.angles).toHaveLength(4);
  });

  it("refuses a missing fixed kind, and a reused angle_id at its own path", () => {
    const noWorry = { angles: [ANGLES.angles[0], ANGLES.angles[2], ANGLES.angles[3], { ...ANGLES.angles[3], angle_id: "cost" }] };
    const out = mapClassifyReply(JSON.stringify(noWorry), STOP, mapAnglesReplySchema, mapAnglesCheck);
    expect(out.classification.parseStatus).toBe("SCHEMA_FAILED");
    const issues = issuesOf(out.classification.parseError);
    expect(issues.map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual([
      "MAP_ANGLE_ID_REUSED@angles.3.angle_id", "MAP_ANGLE_KINDS_WRONG@angles"]);
  });

  it("refuses an angle kind the planner may not use (GENERAL is the code's own)", () => {
    const general = { angles: [...ANGLES.angles.slice(0, 3), { ...ANGLES.angles[3], kind: "GENERAL" }] };
    expect(mapClassifyReply(JSON.stringify(general), STOP, mapAnglesReplySchema, mapAnglesCheck).classification.parseStatus).toBe("SCHEMA_FAILED");
  });
});

describe("map replies: lists", () => {
  it("accepts 3 points and one candidate answer, and reads a code fence (recording the repair)", () => {
    const body = JSON.stringify({ points: EN_POINTS, candidate_answers: ["Yes, with conditions."] });
    expect(mapClassifyReply(body, STOP, mapListReplySchema, mapListCheck("en")).classification.parseStatus).toBe("PARSED");
    expect(mapClassifyReply(`\`\`\`json\n${body}\n\`\`\``, STOP, mapListReplySchema, mapListCheck("en")).classification)
      .toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "CODE_FENCE" });
  });

  it("refuses a 241-character claim at points.0.claim, and the gateway would patch exactly that member", () => {
    const content = JSON.stringify({ points: [point("x".repeat(241)), ...EN_POINTS.slice(1), EN_POINTS[0]], candidate_answers: ["Yes."] });
    const out = mapClassifyReply(content, STOP, mapListReplySchema, mapListCheck("en"));
    expect(out.classification.parseStatus).toBe("SCHEMA_FAILED");
    if (out.classification.parseStatus !== "SCHEMA_FAILED") throw new Error("unreachable");
    const plan = planPatchFollowUp({ content, reply: STOP, parseStatus: out.classification.parseStatus, parseError: out.classification.parseError });
    expect(plan?.locator.paths).toEqual(["points.0.claim"]);
  });

  it("refuses English points for a Romanian question at a patchable path", () => {
    const content = JSON.stringify({ points: EN_POINTS, candidate_answers: ["Yes, with conditions."] });
    const out = mapClassifyReply(content, STOP, mapListReplySchema, mapListCheck("ro"));
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual(["MAP_WRONG_LANGUAGE@points"]);
    const ro = JSON.stringify({ points: RO_POINTS, candidate_answers: ["Da, cu condiții."] });
    expect(mapClassifyReply(ro, STOP, mapListReplySchema, mapListCheck("ro")).classification.parseStatus).toBe("PARSED");
  });

  it("reads Romanian quotes: „…” inside text, and „…\" closed with a straight quote (the tolerant decode)", () => {
    const quoted = JSON.stringify({ points: [point("Mulți spun „da” și pleacă.", RO_WHY), ...RO_POINTS.slice(1)], candidate_answers: ["Da."] });
    expect(mapClassifyReply(quoted, STOP, mapListReplySchema, mapListCheck("ro")).value?.points[0]?.claim).toBe("Mulți spun „da” și pleacă.");
    const straight = quoted.replace("„da”", "„da\"");
    const out = mapClassifyReply(straight, STOP, mapListReplySchema, mapListCheck("ro"));
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_QUOTE" });
    expect(out.value?.points[0]?.claim).toContain("„da\"");
  });

  it("refuses prose with no JSON as a parse failure that names no model text", () => {
    expect(mapClassifyReply("Here are my points: costs.", STOP, mapListReplySchema, mapListCheck("en")).classification)
      .toEqual({ parseStatus: "PARSE_FAILED", parseError: "MAP_REPLY_NOT_JSON" });
  });

  it("lets a snowball list be empty when nothing new is left", () => {
    const empty = JSON.stringify({ points: [], candidate_answers: [] });
    expect(mapClassifyReply(empty, STOP, mapSnowballReplySchema, mapListCheck("en")).classification.parseStatus).toBe("PARSED");
    expect(mapClassifyReply(empty, STOP, mapListReplySchema, mapListCheck("en")).classification.parseStatus).toBe("SCHEMA_FAILED");
  });
});

describe("map replies: merge check: unknown, reused and wrong-kind ids", () => {
  const check = mapMergeCheck(new Set(["pt01", "pt02", "pt03"]), new Set(["ca01"]));
  const merge = (keyPoints: unknown[], answers: unknown[]) => JSON.stringify({ key_points: keyPoints, answers });

  it("accepts groups that use known ids once", () => {
    const content = merge([{ key_point_id: "k1", claim: "Cost", member_item_ids: ["pt01", "pt02"] }],
      [{ answer_id: "a1", answer: "Yes", member_item_ids: ["ca01"] }]);
    expect(mapClassifyReply(content, STOP, mapMergeReplySchema, check).classification.parseStatus).toBe("PARSED");
  });

  it("refuses an unknown id, a reused id, a point id among answers and a reused group id, each at its path", () => {
    const content = merge([
      { key_point_id: "k1", claim: "Cost", member_item_ids: ["pt01", "pt09"] },
      { key_point_id: "k1", claim: "Again", member_item_ids: ["pt01"] }
    ], [{ answer_id: "a1", answer: "Yes", member_item_ids: ["pt02"] }]);
    const out = mapClassifyReply(content, STOP, mapMergeReplySchema, check);
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual([
      "MAP_UNKNOWN_ITEM_ID@key_points.0.member_item_ids.1",
      "MAP_GROUP_ID_REUSED@key_points.1.key_point_id",
      "MAP_ITEM_ID_REUSED@key_points.1.member_item_ids.0",
      "MAP_UNKNOWN_ITEM_ID@answers.0.member_item_ids.0"
    ]);
  });
});

describe("map replies: gap", () => {
  it("accepts empty lists, and up to three framing challenges", () => {
    expect(mapClassifyReply(JSON.stringify({ new_points: [], framing_challenges: [] }), STOP, mapGapReplySchema, mapGapCheck("en"))
      .classification.parseStatus).toBe("PARSED");
    const four = JSON.stringify({ new_points: [], framing_challenges: ["a", "b", "c", "d"] });
    expect(mapClassifyReply(four, STOP, mapGapReplySchema, mapGapCheck("en")).classification.parseStatus).toBe("SCHEMA_FAILED");
  });
});

describe("map replies: choose check", () => {
  const check = mapChooseCheck(new Set(["kp01", "kp02", "kp03"]), "en");
  const answer = (answerId: string, rival: string | null, forIds: string[], against: string[] = []) => ({
    answer_id: answerId, statement: `Yes, because of the plan ${answerId}.`, for: forIds, against, strongest_rival: rival });

  it("accepts one answer (the code fills the second later) and two answers that name each other", () => {
    expect(mapClassifyReply(JSON.stringify({ answers: [answer("a1", null, ["kp01"])] }), STOP, mapChooseReplySchema, check)
      .classification.parseStatus).toBe("PARSED");
    expect(mapClassifyReply(JSON.stringify({ answers: [answer("a1", "a2", ["kp01"]), answer("a2", "a1", [], ["kp01"])] }), STOP,
      mapChooseReplySchema, check).classification.parseStatus).toBe("PARSED");
  });

  it("refuses an unknown point id, a point twice in one answer, a self rival and an unknown rival", () => {
    const content = JSON.stringify({ answers: [answer("a1", "a1", ["kp01", "kp09"], ["kp01"]), answer("a2", "a7", ["kp02"])] });
    const out = mapClassifyReply(content, STOP, mapChooseReplySchema, check);
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual([
      "MAP_UNKNOWN_KEY_POINT_ID@answers.0.for.1",
      "MAP_KEY_POINT_REPEATED@answers.0.against.0",
      "MAP_UNKNOWN_RIVAL@answers.0.strongest_rival",
      "MAP_UNKNOWN_RIVAL@answers.1.strongest_rival"
    ]);
  });

  it("refuses five answers", () => {
    const five = { answers: ["a1", "a2", "a3", "a4", "a5"].map((id) => answer(id, null, [])) };
    expect(mapClassifyReply(JSON.stringify(five), STOP, mapChooseReplySchema, check).classification.parseStatus).toBe("SCHEMA_FAILED");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run tests/unit/map-replies.test.ts`
Expected: FAIL (`mapClassifyReply` is not a function).

- [ ] **Step 3: Implement**

Create `packages/map/src/replies.ts`:

```ts
import { z } from "zod";
import { decodeModelJson, type ContentClassification, type ModelReplyFacts } from "@debateai/providers";
import { mapWrongLanguage } from "./text.js";
import { MAP_FIXED_ANGLE_KINDS, MAP_LEANS, MAP_LIMITS } from "./types.js";

/**
 * The map's strict reply schemas and checks. A refusal is the gateway's own repair format: a JSON list of issues, each
 * `{ code, path, message }` where `message` is a CODE (never model text). The gateway then sends the smallest repair
 * first: the patch follow-up, which asks only for the members at those paths (packages/providers/src/patch-follow-up.ts),
 * and the full re-ask only when that does not work.
 */
const L = MAP_LIMITS;
const mapId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,23}$/u);
const mapText = (max: number) => z.string().trim().min(1).max(max);
const mapPoint = z.object({
  claim: mapText(L.claimMaxChars),
  why_it_matters: mapText(L.whyMaxChars),
  leans: z.enum(MAP_LEANS)
}).strict();

export const mapAnglesReplySchema = z.object({
  angles: z.array(z.object({
    angle_id: mapId,
    kind: z.enum(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "SPECIFIC"]),
    label: mapText(L.angleLabelMaxChars),
    focus: mapText(L.angleFocusMaxChars)
  }).strict()).min(L.anglesMin).max(L.anglesMax)
}).strict();

export const mapListReplySchema = z.object({
  points: z.array(mapPoint).min(L.listPointsMin).max(L.listPointsMax),
  candidate_answers: z.array(mapText(L.candidateAnswerMaxChars)).min(L.listAnswersMin).max(L.listAnswersMax)
}).strict();

export const mapSnowballReplySchema = z.object({
  points: z.array(mapPoint).max(L.snowballPointsMax),
  candidate_answers: z.array(mapText(L.candidateAnswerMaxChars)).max(L.snowballAnswersMax)
}).strict();

export const mapMergeReplySchema = z.object({
  key_points: z.array(z.object({
    key_point_id: mapId,
    claim: mapText(L.claimMaxChars),
    member_item_ids: z.array(mapId).min(1)
  }).strict()),
  answers: z.array(z.object({
    answer_id: mapId,
    answer: mapText(L.candidateAnswerMaxChars),
    member_item_ids: z.array(mapId).min(1)
  }).strict())
}).strict();

export const mapGapReplySchema = z.object({
  new_points: z.array(mapPoint).max(L.gapPointsMax),
  framing_challenges: z.array(mapText(L.claimMaxChars)).max(L.framingChallengesMax)
}).strict();

export const mapChooseReplySchema = z.object({
  answers: z.array(z.object({
    answer_id: mapId,
    statement: mapText(L.claimMaxChars),
    for: z.array(mapId).max(L.choosePointsPerSideMax),
    against: z.array(mapId).max(L.choosePointsPerSideMax),
    strongest_rival: mapId.nullable()
  }).strict()).min(L.chooseAnswersMin).max(L.chooseAnswersMax)
}).strict();

export type MapAnglesReply = z.infer<typeof mapAnglesReplySchema>;
export type MapListReply = z.infer<typeof mapListReplySchema>;
export type MapSnowballReply = z.infer<typeof mapSnowballReplySchema>;
export type MapMergeReply = z.infer<typeof mapMergeReplySchema>;
export type MapGapReply = z.infer<typeof mapGapReplySchema>;
export type MapChooseReply = z.infer<typeof mapChooseReplySchema>;

export type MapReplyIssue = Readonly<{ path: readonly (string | number)[]; code: string }>;
export type MapReplyCheck<T> = (value: T) => readonly MapReplyIssue[];

/**
 * Reads one reply: the shared tolerant decode (code fence, outermost object, inner straight quote, closing brackets on
 * a normally finished reply), the strict schema, then the step's own content check.
 */
export function mapClassifyReply<T>(content: string, reply: ModelReplyFacts | undefined, schema: z.ZodType<T>,
  check: MapReplyCheck<T>): Readonly<{ classification: ContentClassification; value: T | null }> {
  const decoded = decodeModelJson(content, reply);
  if (!decoded.ok) {
    return Object.freeze({ classification: { parseStatus: "PARSE_FAILED", parseError: "MAP_REPLY_NOT_JSON" }, value: null });
  }
  const parsed = schema.safeParse(decoded.value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({ code: issue.code,
      path: issue.path.map((segment) => (typeof segment === "number" ? segment : String(segment))), message: "SCHEMA_FAILED" }));
    return Object.freeze({ classification: { parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify(issues) }, value: null });
  }
  const problems = check(parsed.data);
  if (problems.length > 0) {
    const issues = problems.map((problem) => ({ code: "custom", path: [...problem.path], message: problem.code }));
    return Object.freeze({ classification: { parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify(issues) }, value: null });
  }
  const classification: ContentClassification = decoded.repair === null
    ? { parseStatus: "PARSED", parseError: null }
    : { parseStatus: "PARSED", parseError: null, jsonRepair: decoded.repair };
  return Object.freeze({ classification, value: parsed.data });
}

/** One issue at `path` when the texts together are confidently in another language than the question's. */
export function mapLanguageIssues(texts: readonly string[], languageTag: string, path: readonly (string | number)[]): readonly MapReplyIssue[] {
  return mapWrongLanguage(texts.join(" "), languageTag) ? [Object.freeze({ path, code: "MAP_WRONG_LANGUAGE" })] : [];
}

export const mapAnglesCheck: MapReplyCheck<MapAnglesReply> = (value) => {
  const issues: MapReplyIssue[] = [];
  const seen = new Set<string>();
  value.angles.forEach((angle, index) => {
    if (seen.has(angle.angle_id)) issues.push({ path: ["angles", index, "angle_id"], code: "MAP_ANGLE_ID_REUSED" });
    seen.add(angle.angle_id);
  });
  const count = (kind: string) => value.angles.filter((angle) => angle.kind === kind).length;
  const specific = count("SPECIFIC");
  if (MAP_FIXED_ANGLE_KINDS.some((kind) => count(kind) !== 1) || specific < L.specificAnglesMin || specific > L.specificAnglesMax) {
    issues.push({ path: ["angles"], code: "MAP_ANGLE_KINDS_WRONG" });
  }
  return issues;
};

export function mapListCheck(languageTag: string): MapReplyCheck<MapListReply | MapSnowballReply> {
  return (value) => mapLanguageIssues([...value.points.flatMap((point) => [point.claim, point.why_it_matters]),
    ...value.candidate_answers], languageTag, ["points"]);
}

export function mapMergeCheck(pointIds: ReadonlySet<string>, answerIds: ReadonlySet<string>): MapReplyCheck<MapMergeReply> {
  return (value) => {
    const issues: MapReplyIssue[] = [];
    const usedItems = new Set<string>();
    const usedGroups = new Set<string>();
    const visit = (list: "key_points" | "answers", index: number, groupId: string, groupKey: string, members: readonly string[],
      allowed: ReadonlySet<string>) => {
      if (usedGroups.has(groupId)) issues.push({ path: [list, index, groupKey], code: "MAP_GROUP_ID_REUSED" });
      usedGroups.add(groupId);
      members.forEach((id, at) => {
        if (!allowed.has(id)) issues.push({ path: [list, index, "member_item_ids", at], code: "MAP_UNKNOWN_ITEM_ID" });
        else if (usedItems.has(id)) issues.push({ path: [list, index, "member_item_ids", at], code: "MAP_ITEM_ID_REUSED" });
        usedItems.add(id);
      });
    };
    value.key_points.forEach((group, index) => visit("key_points", index, group.key_point_id, "key_point_id", group.member_item_ids, pointIds));
    value.answers.forEach((group, index) => visit("answers", index, group.answer_id, "answer_id", group.member_item_ids, answerIds));
    return issues;
  };
}

export function mapGapCheck(languageTag: string): MapReplyCheck<MapGapReply> {
  return (value) => mapLanguageIssues(value.new_points.flatMap((point) => [point.claim, point.why_it_matters]), languageTag, ["new_points"]);
}

export function mapChooseCheck(keyPointIds: ReadonlySet<string>, languageTag: string): MapReplyCheck<MapChooseReply> {
  return (value) => {
    const issues: MapReplyIssue[] = [];
    const ids = value.answers.map((answer) => answer.answer_id);
    value.answers.forEach((answer, index) => {
      if (ids.indexOf(answer.answer_id) !== index) issues.push({ path: ["answers", index, "answer_id"], code: "MAP_ANSWER_ID_REUSED" });
      const seen = new Set<string>();
      for (const side of ["for", "against"] as const) {
        answer[side].forEach((id, at) => {
          if (!keyPointIds.has(id)) issues.push({ path: ["answers", index, side, at], code: "MAP_UNKNOWN_KEY_POINT_ID" });
          else if (seen.has(id)) issues.push({ path: ["answers", index, side, at], code: "MAP_KEY_POINT_REPEATED" });
          seen.add(id);
        });
      }
      const rival = answer.strongest_rival;
      if (rival !== null && (rival === answer.answer_id || !ids.includes(rival))) {
        issues.push({ path: ["answers", index, "strongest_rival"], code: "MAP_UNKNOWN_RIVAL" });
      }
    });
    return [...issues, ...mapLanguageIssues(value.answers.map((answer) => answer.statement), languageTag, ["answers"])];
  };
}
```

Add to `packages/map/src/index.ts`:

```ts
export * from "./replies.js";
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm exec vitest run tests/unit/map-replies.test.ts`
Expected: PASS (15 tests).

Two notes for this step:
- If the unknown-rival case in "refuses an unknown point id..." also reports the language issue, the sentences are being read as non-English. Keep the statements English ("Yes, because of the plan a1.").
- `planPatchFollowUp` is exported by `@debateai/providers` (index.ts re-exports the three patch functions). If the import fails, import it from `../../packages/providers/src/patch-follow-up.js` instead.

- [ ] **Step 5: Commit**

```sh
git add packages/map/src/replies.ts packages/map/src/index.ts tests/unit/map-replies.test.ts
git commit -F - <<'MSG'
Map: strict reply schemas and checks in the gateway's repair format

Every map reply passes the shared tolerant decode, a strict schema and its step's check. Refusals name code and
machine path only, so the patch follow-up asks for just the failing members. Covers the angle kinds, the 240-character
limits, unknown/reused ids in merge and choose, bad rivals, and points written in the wrong language.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 5: Step specs: material, contract and check per call, and the provider pieces

**Files:**
- Create: `packages/map/src/specs.ts`
- Modify: `packages/map/src/index.ts`
- Test: `tests/unit/map-specs.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4. From `@debateai/providers`: `buildFramedPrompt`, `buildFramedRepairPrompt`, `schemaFailureLocator`, `rememberingAcceptedReply`, and the types `ContentClassification`, `FramedMaterialField`, `FramedPrompt`, `ModelReplyFacts`, `PromptContract`, `PromptPacket`. From `@debateai/kernel`: `TypedDomainError`.
- Produces:
  - `type MapStepSpec<T> = Readonly<{ step: MapStep; contract: PromptContract; material: readonly FramedMaterialField[]; classify(content: string, reply?: ModelReplyFacts): ContentClassification; read(content: string, reply?: ModelReplyFacts): T }>`
  - `type MapSpecContext = Readonly<{ questionLine: string; languageName: string; languageTag: string; contracts?: MapPromptContractSet }>`
  - `mapAnglesSpec(ctx): MapStepSpec<MapAnglesReply>`
  - `mapListSpec(ctx, angle: MapAngle | null): MapStepSpec<MapListReply>`
  - `mapSnowballSpec(ctx, pointsSoFar: readonly MapPointItem[]): MapStepSpec<MapSnowballReply>`
  - `mapMergeSpec(ctx, items: readonly MapItem[]): MapStepSpec<MapMergeReply>`
  - `mapGapSpec(ctx, keyPoints: readonly MapKeyPoint[], mergedAnswers: readonly MapMergedAnswer[]): MapStepSpec<MapGapReply>`
  - `mapChooseSpec(ctx, keyPoints, mergedAnswers): MapStepSpec<MapChooseReply>`
  - `mapProviderPieces<T>(spec: MapStepSpec<T>): Readonly<{ framed: FramedPrompt; classifyContent(content: string, reply?: ModelReplyFacts): ContentClassification; buildRepairPacket(rejected: Readonly<{ parseStatus: string; parseError: string }>): PromptPacket; readAccepted(content: string): T }>`

What each AI sees (spec §1.1):
- The merge AI sees item ids, claims and reasons, never who wrote them.
- The gap AI sees plain labels, never counts or authors.
- The choose AI sees each key point tagged by code with its blind-maker count and its fixed angle kind.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/map-specs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { argumentLanguageDirective } from "@debateai/kernel";
import { readPromptFrame } from "@debateai/providers";
import {
  MAP_CONTRACT_IDS,
  mapAnglesSpec,
  mapAssignItemIds,
  mapChooseSpec,
  mapGapSpec,
  mapItemsById,
  mapKeyPoint,
  mapListSpec,
  mapMergeSpec,
  mapMergedAnswer,
  mapProviderPieces,
  mapSnowballSpec,
  type MapItemDraft,
  type MapPointItem,
  type MapSeat,
  type MapSpecContext,
  type MapStepSpec
} from "@debateai/map";

const CTX: MapSpecContext = { questionLine: "Should a city make its central buses free to ride?", languageName: "English", languageTag: "en" };
const S1: MapSeat = { aiRef: "AIREF-SENTINEL-1", maker: "MAKER-SENTINEL-1" };
const S2: MapSeat = { aiRef: "AIREF-SENTINEL-2", maker: "MAKER-SENTINEL-2" };
const drafts: MapItemDraft[] = [
  { kind: "POINT", seat: S1, origin: "BLIND", angleId: "opp", angleKind: "OPPOSITE_CASE", listIndex: 0, position: 0,
    claim: "Fares pay for repairs.", whyItMatters: "Without them the buses get worse.", leans: "against_some_answer" },
  { kind: "POINT", seat: S2, origin: "BLIND", angleId: null, angleKind: null, listIndex: 1, position: 0,
    claim: "Fares pay for repairs.", whyItMatters: "The budget has no other source.", leans: "against_some_answer" },
  { kind: "POINT", seat: S2, origin: "BLIND", angleId: null, angleKind: null, listIndex: 1, position: 1,
    claim: "Free rides cut car traffic.", whyItMatters: "Less traffic helps everyone.", leans: "for_some_answer" },
  { kind: "ANSWER", seat: S1, origin: "BLIND", angleId: "opp", angleKind: "OPPOSITE_CASE", listIndex: 0, position: 0, answer: "No, keep the fares." },
  { kind: "ANSWER", seat: S2, origin: "BLIND", angleId: null, angleKind: null, listIndex: 1, position: 0, answer: "Yes, make them free." }
];
const items = mapAssignItemIds(drafts, "seed-specs");
const byId = mapItemsById(items);
const idsOf = (text: string) => items.filter((item) => (item.kind === "POINT" ? item.claim : item.answer) === text).map((item) => item.itemId);
const keyPoints = [
  mapKeyPoint("kp01", "Fares pay for repairs.", idsOf("Fares pay for repairs."), byId),
  mapKeyPoint("kp02", "Free rides cut car traffic.", idsOf("Free rides cut car traffic."), byId)
];
const answers = [
  mapMergedAnswer("an01", "No, keep the fares.", idsOf("No, keep the fares."), byId),
  mapMergedAnswer("an02", "Yes, make them free.", idsOf("Yes, make them free."), byId)
];
const points = items.filter((item): item is MapPointItem => item.kind === "POINT");
const ANGLE = { angleId: "opp", kind: "OPPOSITE_CASE" as const, label: "The other side", focus: "The strongest case for keeping fares." };
const ALL: readonly MapStepSpec<unknown>[] = [mapAnglesSpec(CTX), mapListSpec(CTX, ANGLE), mapListSpec(CTX, null), mapSnowballSpec(CTX, points),
  mapMergeSpec(CTX, items), mapGapSpec(CTX, keyPoints, answers), mapChooseSpec(CTX, keyPoints, answers)];
const field = (spec: MapStepSpec<unknown>, name: string) => spec.material.find((entry) => entry.name === name)?.content ?? "";

describe("map specs: what each step sends", () => {
  it("uses the right contract and material fields for each step", () => {
    expect(ALL.map((spec) => readPromptFrame(mapProviderPieces(spec).framed.packet).contractId)).toEqual([
      MAP_CONTRACT_IDS.angles, MAP_CONTRACT_IDS.listAngle, MAP_CONTRACT_IDS.listOpen, MAP_CONTRACT_IDS.listSnowball,
      MAP_CONTRACT_IDS.merge, MAP_CONTRACT_IDS.gap, MAP_CONTRACT_IDS.choose]);
    expect(ALL.map((spec) => spec.material.map((entry) => entry.name).join(","))).toEqual([
      "question_line", "question_line,angle_label,angle_focus", "question_line", "question_line,points_so_far",
      "question_line,points,candidate_answers", "question_line,key_points,answers", "question_line,key_points,answers"]);
    expect(ALL.map((spec) => spec.step)).toEqual(["ANGLES", "LIST", "LIST", "SNOWBALL", "MERGE", "GAP", "CHOOSE"]);
  });

  it("asks every step in the question's language", () => {
    for (const spec of ALL) {
      expect(mapProviderPieces(spec).framed.packet.messages[0]!.content).toContain(argumentLanguageDirective("English"));
    }
  });

  it("never sends an AI reference or a maker, in any step", () => {
    for (const spec of ALL) {
      for (const message of mapProviderPieces(spec).framed.packet.messages) expect(message.content).not.toContain("SENTINEL");
    }
  });

  it("merge sees each item's id, claim and reason, in id order, and nothing about its origin", () => {
    const sent = JSON.parse(field(mapMergeSpec(CTX, items), "points")) as Record<string, string>[];
    expect(sent.map((entry) => Object.keys(entry).join(","))).toEqual(["item_id,claim,why_it_matters", "item_id,claim,why_it_matters",
      "item_id,claim,why_it_matters"]);
    expect(sent.map((entry) => entry.item_id)).toEqual([...sent.map((entry) => entry.item_id!)].sort());
    expect(JSON.parse(field(mapMergeSpec(CTX, items), "candidate_answers"))).toHaveLength(2);
  });

  it("gap sees plain labels only: no ids, no counts", () => {
    const spec = mapGapSpec(CTX, keyPoints, answers);
    expect(JSON.parse(field(spec, "key_points"))).toEqual(["Fares pay for repairs.", "Free rides cut car traffic."]);
    expect(JSON.parse(field(spec, "answers"))).toEqual(["No, keep the fares.", "Yes, make them free."]);
  });

  it("choose sees each key point tagged by code: blind makers and fixed angle kind", () => {
    expect(JSON.parse(field(mapChooseSpec(CTX, keyPoints, answers), "key_points"))).toEqual([
      { key_point_id: "kp01", claim: "Fares pay for repairs.", raised_by: 2, angle_kind: "OPPOSITE_CASE" },
      { key_point_id: "kp02", claim: "Free rides cut car traffic.", raised_by: 1, angle_kind: null }
    ]);
  });

  it("gives the gateway its classifier, its repair packet and the accepted value", () => {
    const pieces = mapProviderPieces(mapChooseSpec(CTX, keyPoints, answers));
    const reply = JSON.stringify({ answers: [{ answer_id: "a1", statement: "No, keep the fares.", for: ["kp01"], against: ["kp02"], strongest_rival: null }] });
    expect(pieces.classifyContent(reply, { finishReason: "stop" }).parseStatus).toBe("PARSED");
    expect(pieces.readAccepted(reply).answers[0]?.for).toEqual(["kp01"]);
    const repair = pieces.buildRepairPacket({ parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify([{ code: "custom", path: ["answers"], message: "SCHEMA_FAILED" }]) });
    expect(readPromptFrame(repair).fields.map((entry) => entry.name)).toContain("machine_rejection_code");
  });

  it("merge's check knows this map's ids", () => {
    const spec = mapMergeSpec(CTX, items);
    const unknown = JSON.stringify({ key_points: [{ key_point_id: "k1", claim: "Fares", member_item_ids: ["pt77"] }], answers: [] });
    expect(spec.classify(unknown, { finishReason: "stop" }).parseStatus).toBe("SCHEMA_FAILED");
    expect(() => spec.read(unknown)).toThrow("MAP_REPLY_UNREADABLE");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run tests/unit/map-specs.test.ts`
Expected: FAIL (`mapAnglesSpec` is not a function).

- [ ] **Step 3: Implement**

Create `packages/map/src/specs.ts`:

```ts
import type { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import {
  buildFramedPrompt,
  buildFramedRepairPrompt,
  rememberingAcceptedReply,
  schemaFailureLocator,
  type ContentClassification,
  type FramedMaterialField,
  type FramedPrompt,
  type ModelReplyFacts,
  type PromptContract,
  type PromptPacket
} from "@debateai/providers";
import { mapContractInLanguage, mapPromptContracts, type MapContractName, type MapPromptContractSet } from "./prompts.js";
import {
  mapAnglesCheck,
  mapAnglesReplySchema,
  mapChooseCheck,
  mapChooseReplySchema,
  mapClassifyReply,
  mapGapCheck,
  mapGapReplySchema,
  mapListCheck,
  mapListReplySchema,
  mapMergeCheck,
  mapMergeReplySchema,
  mapSnowballReplySchema,
  type MapAnglesReply,
  type MapChooseReply,
  type MapGapReply,
  type MapListReply,
  type MapMergeReply,
  type MapReplyCheck,
  type MapSnowballReply
} from "./replies.js";
import type { MapAngle, MapAnswerItem, MapItem, MapKeyPoint, MapMergedAnswer, MapPointItem, MapStep } from "./types.js";

/** One map call, fully described: the contract (in the question's language), its material, its check. */
export type MapStepSpec<T> = Readonly<{
  step: MapStep;
  contract: PromptContract;
  material: readonly FramedMaterialField[];
  classify: (content: string, reply?: ModelReplyFacts) => ContentClassification;
  /** The accepted reply's value; throws MAP_REPLY_UNREADABLE for a reply `classify` would refuse. */
  read: (content: string, reply?: ModelReplyFacts) => T;
}>;

export type MapSpecContext = Readonly<{
  questionLine: string;
  /** detectArgumentLanguage's English name, e.g. "Romanian". */
  languageName: string;
  /** Its tag, e.g. "ro" ("und" when unknown: the language check then never refuses). */
  languageTag: string;
  /** The owners' contracts; default the shipped text. */
  contracts?: MapPromptContractSet;
}>;

function mapSpecOf<T>(step: MapStep, ctx: MapSpecContext, name: MapContractName, material: readonly FramedMaterialField[],
  schema: z.ZodType<T>, check: MapReplyCheck<T>): MapStepSpec<T> {
  const contract = mapContractInLanguage((ctx.contracts ?? mapPromptContracts())[name], ctx.languageName);
  return Object.freeze({
    step,
    contract,
    material: Object.freeze(material.map((entry) => Object.freeze({ ...entry }))),
    classify: (content: string, reply?: ModelReplyFacts) => mapClassifyReply(content, reply, schema, check).classification,
    read: (content: string, reply?: ModelReplyFacts) => {
      const out = mapClassifyReply(content, reply, schema, check);
      if (out.value === null) throw new TypedDomainError("MAP_REPLY_UNREADABLE", `MAP_REPLY_UNREADABLE: the ${step} reply did not pass its check`);
      return out.value;
    }
  });
}

const mapQuestionField = (ctx: MapSpecContext): FramedMaterialField => ({ name: "question_line", content: ctx.questionLine });
const mapByItemId = <T extends MapItem>(list: readonly T[]): T[] => [...list].sort((a, b) => a.itemId.localeCompare(b.itemId));

export function mapAnglesSpec(ctx: MapSpecContext): MapStepSpec<MapAnglesReply> {
  return mapSpecOf("ANGLES", ctx, "angles", [mapQuestionField(ctx)], mapAnglesReplySchema, mapAnglesCheck);
}

export function mapListSpec(ctx: MapSpecContext, angle: MapAngle | null): MapStepSpec<MapListReply> {
  return angle === null
    ? mapSpecOf("LIST", ctx, "listOpen", [mapQuestionField(ctx)], mapListReplySchema, mapListCheck(ctx.languageTag))
    : mapSpecOf("LIST", ctx, "listAngle", [mapQuestionField(ctx), { name: "angle_label", content: angle.label },
      { name: "angle_focus", content: angle.focus }], mapListReplySchema, mapListCheck(ctx.languageTag));
}

/** Snowball (arm A): the claims so far as a short plain list, never who wrote them. */
export function mapSnowballSpec(ctx: MapSpecContext, pointsSoFar: readonly MapPointItem[]): MapStepSpec<MapSnowballReply> {
  return mapSpecOf("SNOWBALL", ctx, "listSnowball", [mapQuestionField(ctx),
    { name: "points_so_far", content: JSON.stringify(mapByItemId(pointsSoFar).map((point) => point.claim)) }],
  mapSnowballReplySchema, mapListCheck(ctx.languageTag));
}

/** Merge: every item with its opaque id, in id order; never its author, list or angle. */
export function mapMergeSpec(ctx: MapSpecContext, items: readonly MapItem[]): MapStepSpec<MapMergeReply> {
  const points = mapByItemId(items.filter((item): item is MapPointItem => item.kind === "POINT"));
  const answers = mapByItemId(items.filter((item): item is MapAnswerItem => item.kind === "ANSWER"));
  return mapSpecOf("MERGE", ctx, "merge", [mapQuestionField(ctx),
    { name: "points", content: JSON.stringify(points.map((point) => ({ item_id: point.itemId, claim: point.claim, why_it_matters: point.whyItMatters }))) },
    { name: "candidate_answers", content: JSON.stringify(answers.map((answer) => ({ item_id: answer.itemId, answer: answer.answer }))) }],
  mapMergeReplySchema, mapMergeCheck(new Set(points.map((point) => point.itemId)), new Set(answers.map((answer) => answer.itemId))));
}

/** Gap: plain labels only, never counts or authors. */
export function mapGapSpec(ctx: MapSpecContext, keyPoints: readonly MapKeyPoint[], mergedAnswers: readonly MapMergedAnswer[]): MapStepSpec<MapGapReply> {
  return mapSpecOf("GAP", ctx, "gap", [mapQuestionField(ctx),
    { name: "key_points", content: JSON.stringify(keyPoints.map((keyPoint) => keyPoint.claim)) },
    { name: "answers", content: JSON.stringify(mergedAnswers.map((answer) => answer.answer)) }],
  mapGapReplySchema, mapGapCheck(ctx.languageTag));
}

/** Choose: each key point tagged by code with its distinct blind makers and its first fixed angle kind. */
export function mapChooseSpec(ctx: MapSpecContext, keyPoints: readonly MapKeyPoint[], mergedAnswers: readonly MapMergedAnswer[]): MapStepSpec<MapChooseReply> {
  return mapSpecOf("CHOOSE", ctx, "choose", [mapQuestionField(ctx),
    { name: "key_points", content: JSON.stringify(keyPoints.map((keyPoint) => ({ key_point_id: keyPoint.keyPointId, claim: keyPoint.claim,
      raised_by: keyPoint.blindMakers.length, angle_kind: keyPoint.fixedAngleKinds[0] ?? null }))) },
    { name: "answers", content: JSON.stringify(mergedAnswers.map((answer) => ({ answer_id: answer.answerId, answer: answer.answer }))) }],
  mapChooseReplySchema, mapChooseCheck(new Set(keyPoints.map((keyPoint) => keyPoint.keyPointId)), ctx.languageTag));
}

/**
 * What a gateway call needs, built once per call: the framed packet (the one frame builder), the classifier that
 * remembers how the accepted reply ended, the full re-ask packet (code and machine path only), and the accepted value.
 * The patch follow-up needs nothing more: the gateway builds it from the classifier's refusal.
 */
export function mapProviderPieces<T>(spec: MapStepSpec<T>): Readonly<{
  framed: FramedPrompt;
  classifyContent: (content: string, reply?: ModelReplyFacts) => ContentClassification;
  buildRepairPacket: (rejected: Readonly<{ parseStatus: string; parseError: string }>) => PromptPacket;
  readAccepted: (content: string) => T;
}> {
  const framed = buildFramedPrompt({ contract: spec.contract, material: spec.material });
  const reading = rememberingAcceptedReply((content, reply) => spec.classify(content, reply));
  return Object.freeze({
    framed,
    classifyContent: reading.classifyContent,
    buildRepairPacket: (rejected: Readonly<{ parseStatus: string; parseError: string }>) =>
      buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)),
    readAccepted: (content: string) => spec.read(content, reading.acceptedAs(content).reply)
  });
}
```

Add to `packages/map/src/index.ts`:

```ts
export * from "./specs.js";
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm exec vitest run tests/unit/map-specs.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```sh
git add packages/map/src/specs.ts packages/map/src/index.ts tests/unit/map-specs.test.ts
git commit -F - <<'MSG'
Map: step specs (material, contract, check) and the gateway pieces

Merge sees opaque ids and claims, never authors; gap sees plain labels, never counts; choose sees each point's blind
makers and fixed angle, tagged by code (spec §1.1). The pieces give a gateway its classifier, the full re-ask packet
and the accepted value; the patch follow-up comes from the classifier's refusal.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 6: Key points: merge applied, code merge fallback, snowball singletons, gap additions

**Files:**
- Create: `packages/map/src/keypoints.ts`
- Modify: `packages/map/src/index.ts`
- Test: `tests/unit/map-keypoints.test.ts`

**Interfaces:**
- Consumes: `mapNormaliseText` and `mapItemsById` / `mapKeyPoint` / `mapMergedAnswer` (Task 2); `MapMergeReply` (Task 4).
- Produces:
  - `type MapMergedMap = Readonly<{ keyPoints: readonly MapKeyPoint[]; mergedAnswers: readonly MapMergedAnswer[] }>`
  - `mapCodeMerge(items: readonly MapItem[]): MapMergedMap`. This is the `MAP_MERGE_FALLBACK` rule: claims identical after normalisation group together; everything else stays its own point.
  - `mapApplyMerge(reply: MapMergeReply, items: readonly MapItem[]): MapMergedMap & Readonly<{ omittedItemIds: readonly string[] }>`
  - `mapSingletonMap(items: readonly MapItem[]): MapMergedMap` (arm A: every point is its own key point; answers group by text)
  - `mapAddGapPoints(current: MapMergedMap, items: readonly MapItem[], gapItems: readonly MapPointItem[]): Readonly<{ map: MapMergedMap; newKeyPoints: number }>`

Key point ids are `kp01..` and merged answer ids are `an01..`, assigned by code in a fixed order. The merge AI's own group ids are only checked for uniqueness and then replaced.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/map-keypoints.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  mapAddGapPoints,
  mapApplyMerge,
  mapAssignItemIds,
  mapCodeMerge,
  mapNextItemNumbers,
  mapSingletonMap,
  type MapItem,
  type MapItemDraft,
  type MapPointItem,
  type MapSeat
} from "@debateai/map";

const A: MapSeat = { aiRef: "ai-a", maker: "maker-a" };
const B: MapSeat = { aiRef: "ai-b", maker: "maker-b" };
const C: MapSeat = { aiRef: "ai-c", maker: "maker-c" };
const p = (seat: MapSeat, listIndex: number, position: number, claim: string, origin: "BLIND" | "GAP" = "BLIND"): MapItemDraft =>
  ({ kind: "POINT", seat, origin, angleId: null, angleKind: null, listIndex, position, claim, whyItMatters: "Why.", leans: "context" });
const a = (seat: MapSeat, listIndex: number, answer: string): MapItemDraft =>
  ({ kind: "ANSWER", seat, origin: "BLIND", angleId: null, angleKind: null, listIndex, position: 0, answer });
const items: readonly MapItem[] = mapAssignItemIds([
  p(A, 0, 0, "Fares pay for repairs."), p(B, 1, 0, "fares pay for REPAIRS"), p(B, 1, 1, "Free rides cut traffic."),
  a(A, 0, "No."), a(B, 1, "no")
], "seed-kp");
const idOf = (text: string) => items.find((item) => (item.kind === "POINT" ? item.claim : item.answer) === text)!.itemId;

describe("map key points: the code merge (MAP_MERGE_FALLBACK)", () => {
  it("groups claims identical after normalisation; everything else stays its own point", () => {
    const merged = mapCodeMerge(items);
    expect(merged.keyPoints.map((keyPoint) => keyPoint.memberItemIds.length).sort()).toEqual([1, 2]);
    expect(merged.keyPoints.map((keyPoint) => keyPoint.keyPointId)).toEqual(["kp01", "kp02"]);
    const fares = merged.keyPoints.find((keyPoint) => keyPoint.memberItemIds.length === 2)!;
    expect(fares.blindMakers).toEqual(["maker-a", "maker-b"]);
    expect(merged.mergedAnswers).toHaveLength(1);
    expect(merged.mergedAnswers[0]!.answerId).toBe("an01");
  });
});

describe("map key points: apply the merge AI's groups", () => {
  it("numbers its groups in its order, uses its claims, and keeps left-out items as their own points", () => {
    const applied = mapApplyMerge({
      key_points: [{ key_point_id: "x", claim: "Fares fund repairs.", member_item_ids: [idOf("Fares pay for repairs."), idOf("fares pay for REPAIRS")] }],
      answers: [{ answer_id: "y", answer: "No.", member_item_ids: [idOf("No.")] }]
    }, items);
    expect(applied.keyPoints.map((keyPoint) => `${keyPoint.keyPointId}:${keyPoint.claim}`)).toEqual(["kp01:Fares fund repairs.", "kp02:Free rides cut traffic."]);
    expect(applied.mergedAnswers.map((answer) => `${answer.answerId}:${answer.answer}`)).toEqual(["an01:No.", "an02:no"]);
    expect([...applied.omittedItemIds].sort()).toEqual([idOf("Free rides cut traffic."), idOf("no")].sort());
  });
});

describe("map key points: snowball singletons (arm A)", () => {
  it("makes every point its own key point and groups answers by text", () => {
    const single = mapSingletonMap(items);
    expect(single.keyPoints).toHaveLength(3);
    expect(single.mergedAnswers).toHaveLength(1);
  });
});

describe("map key points: gap additions", () => {
  it("joins a gap point that restates a key point (as a gap maker) and counts only new ones", () => {
    const start = mapCodeMerge(items);
    const gapItems = mapAssignItemIds([p(C, 101, 0, "Fares pay for repairs!", "GAP"), p(C, 101, 1, "Night buses matter.", "GAP")],
      "seed-gap", mapNextItemNumbers(items)) as readonly MapPointItem[];
    const added = mapAddGapPoints(start, [...items, ...gapItems], gapItems);
    expect(added.newKeyPoints).toBe(1);
    const fares = added.map.keyPoints.find((keyPoint) => keyPoint.memberItemIds.includes(idOf("Fares pay for repairs.")))!;
    expect(fares.gapMakers).toEqual(["maker-c"]);
    expect(fares.blindMakers).toEqual(["maker-a", "maker-b"]);
    expect(added.map.keyPoints.at(-1)!.keyPointId).toBe("kp03");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run tests/unit/map-keypoints.test.ts`
Expected: FAIL (`mapCodeMerge` is not a function).

- [ ] **Step 3: Implement**

Create `packages/map/src/keypoints.ts`:

```ts
import { mapItemsById, mapKeyPoint, mapMergedAnswer } from "./items.js";
import type { MapMergeReply } from "./replies.js";
import { mapNormaliseText } from "./text.js";
import type { MapAnswerItem, MapItem, MapKeyPoint, MapMergedAnswer, MapPointItem } from "./types.js";

/** The merged map: key points and merged candidate answers, each with its member items and who raised it. */
export type MapMergedMap = Readonly<{ keyPoints: readonly MapKeyPoint[]; mergedAnswers: readonly MapMergedAnswer[] }>;

const mapKeyPointId = (n: number): string => `kp${String(n).padStart(2, "0")}`;
const mapAnswerGroupId = (n: number): string => `an${String(n).padStart(2, "0")}`;

function mapGroupByText<T extends MapItem>(items: readonly T[], text: (item: T) => string): readonly (readonly T[])[] {
  const groups = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => a.itemId.localeCompare(b.itemId))) {
    const key = mapNormaliseText(text(item));
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [item]);
    else group.push(item);
  }
  return [...groups.values()];
}

const mapPoints = (items: readonly MapItem[]) => items.filter((item): item is MapPointItem => item.kind === "POINT");
const mapAnswers = (items: readonly MapItem[]) => items.filter((item): item is MapAnswerItem => item.kind === "ANSWER");

function mapAnswerGroups(items: readonly MapItem[]): MapMergedAnswer[] {
  const byId = mapItemsById(items);
  return mapGroupByText(mapAnswers(items), (item) => item.answer).map((group, index) =>
    mapMergedAnswer(mapAnswerGroupId(index + 1), group[0]!.answer, group.map((item) => item.itemId), byId));
}

/** MAP_MERGE_FALLBACK (spec §1.2): identical claims after normalisation group; everything else stays its own point. */
export function mapCodeMerge(items: readonly MapItem[]): MapMergedMap {
  const byId = mapItemsById(items);
  const keyPoints = mapGroupByText(mapPoints(items), (item) => item.claim).map((group, index) =>
    mapKeyPoint(mapKeyPointId(index + 1), group[0]!.claim, group.map((item) => item.itemId), byId));
  return Object.freeze({ keyPoints: Object.freeze(keyPoints), mergedAnswers: Object.freeze(mapAnswerGroups(items)) });
}

/**
 * The merge AI's groups (already checked: known ids, each once). Its group ids are replaced by kp01.. / an01.. in its
 * order; an item it left out is kept as its own key point or answer (nothing is lost), listed in `omittedItemIds`.
 */
export function mapApplyMerge(reply: MapMergeReply, items: readonly MapItem[]): MapMergedMap & Readonly<{ omittedItemIds: readonly string[] }> {
  const byId = mapItemsById(items);
  const used = new Set<string>();
  const keyPoints: MapKeyPoint[] = reply.key_points.map((group, index) => {
    for (const id of group.member_item_ids) used.add(id);
    return mapKeyPoint(mapKeyPointId(index + 1), group.claim, group.member_item_ids, byId);
  });
  const mergedAnswers: MapMergedAnswer[] = reply.answers.map((group, index) => {
    for (const id of group.member_item_ids) used.add(id);
    return mapMergedAnswer(mapAnswerGroupId(index + 1), group.answer, group.member_item_ids, byId);
  });
  const omitted = [...items].sort((a, b) => a.itemId.localeCompare(b.itemId)).filter((item) => !used.has(item.itemId));
  for (const item of omitted) {
    if (item.kind === "POINT") keyPoints.push(mapKeyPoint(mapKeyPointId(keyPoints.length + 1), item.claim, [item.itemId], byId));
    else mergedAnswers.push(mapMergedAnswer(mapAnswerGroupId(mergedAnswers.length + 1), item.answer, [item.itemId], byId));
  }
  return Object.freeze({ keyPoints: Object.freeze(keyPoints), mergedAnswers: Object.freeze(mergedAnswers),
    omittedItemIds: Object.freeze(omitted.map((item) => item.itemId)) });
}

/** Arm A (snowball): each AI added only new points, so every point is its own key point; answers group by text. */
export function mapSingletonMap(items: readonly MapItem[]): MapMergedMap {
  const byId = mapItemsById(items);
  const keyPoints = [...mapPoints(items)].sort((a, b) => a.itemId.localeCompare(b.itemId))
    .map((item, index) => mapKeyPoint(mapKeyPointId(index + 1), item.claim, [item.itemId], byId));
  return Object.freeze({ keyPoints: Object.freeze(keyPoints), mergedAnswers: Object.freeze(mapAnswerGroups(items)) });
}

/**
 * A gap round's points (origin GAP): one that restates a key point (normalised claim equal to the key point's or to
 * one of its members') joins it as a gap member; any other becomes a new key point. `newKeyPoints` is what the stop
 * rule reads (spec §1.1: a round that adds fewer than 2 new points ends the gap rounds).
 */
export function mapAddGapPoints(current: MapMergedMap, items: readonly MapItem[], gapItems: readonly MapPointItem[]):
  Readonly<{ map: MapMergedMap; newKeyPoints: number }> {
  const byId = mapItemsById(items);
  const keyPoints = [...current.keyPoints];
  let created = 0;
  for (const item of gapItems) {
    const key = mapNormaliseText(item.claim);
    const at = keyPoints.findIndex((keyPoint) => mapNormaliseText(keyPoint.claim) === key
      || keyPoint.memberItemIds.some((id) => {
        const member = byId.get(id);
        return member?.kind === "POINT" && mapNormaliseText(member.claim) === key;
      }));
    if (at >= 0) {
      const keyPoint = keyPoints[at]!;
      keyPoints[at] = mapKeyPoint(keyPoint.keyPointId, keyPoint.claim, [...keyPoint.memberItemIds, item.itemId], byId);
    } else {
      created += 1;
      keyPoints.push(mapKeyPoint(mapKeyPointId(keyPoints.length + 1), item.claim, [item.itemId], byId));
    }
  }
  return Object.freeze({ map: Object.freeze({ keyPoints: Object.freeze(keyPoints), mergedAnswers: current.mergedAnswers }), newKeyPoints: created });
}
```

Add to `packages/map/src/index.ts`:

```ts
export * from "./keypoints.js";
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm exec vitest run tests/unit/map-keypoints.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```sh
git add packages/map/src/keypoints.ts packages/map/src/index.ts tests/unit/map-keypoints.test.ts
git commit -F - <<'MSG'
Map: key points from the merge, the code merge fallback, snowball singletons and gap additions

The merge AI's groups are numbered by code and nothing it leaves out is lost; the fallback groups only claims that
are identical after normalisation (spec §1.2); a gap point that restates a key point joins it as a gap member, and
only new key points count toward the stop rule.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 7: Finishing the choice: distinct answers, quotas, the choose fallback, rivals, also-raised

**Files:**
- Create: `packages/map/src/choose.ts`
- Modify: `packages/map/src/index.ts`
- Test: `tests/unit/map-choose.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4.
- Produces:
  - `mapOppositeTemplate(statement: string, languageTag: string): string`. A code-owned last resort, in en and ro only for Phase 1.
  - `type MapFinishChoiceInput = Readonly<{ reply: MapChooseReply | null; keyPoints: readonly MapKeyPoint[]; mergedAnswers: readonly MapMergedAnswer[]; items: readonly MapItem[]; languageTag: string; maxAnswers: number; pointsPerAnswer: number }>`
  - `mapFinishChoice(input: MapFinishChoiceInput): Readonly<{ choice: MapChoice; marks: readonly MapMarkRecord[] }>`

Rules (spec §1.1, §1.2, as ruled):
- A null reply means the choose step failed: `MAP_CHOOSE_FALLBACK`.
  - Answers are the merged answers raised by the most makers, at most `maxAnswers`.
  - Points are dealt most-raised first, round-robin, up to `pointsPerAnswer` per answer.
- Answers that normalise alike count once. Fewer than 2 are filled in this order, with `ANSWERS_FILLED` and its source as the detail:
  - the best-supported different merged answer (`MAP_CANDIDATE`);
  - then a candidate answer from an `OPPOSITE_CASE` list (`OPPOSITE_CASE_LIST`);
  - then the template (`TEMPLATE`).
- Quotas apply over the union of all chosen points (single AI; `OPPOSITE_CASE`; `ASKER_WORRY` when present).
  - A missing quota is met by adding the top-ranked point of that kind to the answer with the fewest points (the first on a tie).
  - It goes into `against` when it is an `OPPOSITE_CASE` point or leans against; otherwise into `for`.
  - Each addition records `CHOOSE_QUOTA_FILLED` with detail `QUOTA:kpNN`.
- Every answer gets a valid `strongestRival`: its own when that names another chosen answer, else the next answer in order.
- `alsoRaised` is every unchosen key point, most-raised first.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/map-choose.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  mapAssignItemIds,
  mapFinishChoice,
  mapItemsById,
  mapKeyPoint,
  mapMergedAnswer,
  mapOppositeTemplate,
  type MapAngleKind,
  type MapChooseReply,
  type MapItemDraft,
  type MapLean,
  type MapSeat
} from "@debateai/map";

const A: MapSeat = { aiRef: "ai-a", maker: "maker-a" };
const B: MapSeat = { aiRef: "ai-b", maker: "maker-b" };
const C: MapSeat = { aiRef: "ai-c", maker: "maker-c" };
const point = (seat: MapSeat, listIndex: number, position: number, claim: string, angleKind: MapAngleKind | null, leans: MapLean): MapItemDraft =>
  ({ kind: "POINT", seat, origin: "BLIND", angleId: angleKind === null ? null : angleKind.toLowerCase(), angleKind, listIndex, position,
    claim, whyItMatters: "Why.", leans });
const answer = (seat: MapSeat, listIndex: number, text: string, angleKind: MapAngleKind | null = null): MapItemDraft =>
  ({ kind: "ANSWER", seat, origin: "BLIND", angleId: null, angleKind, listIndex, position: 0, answer: text });
const items = mapAssignItemIds([
  point(A, 0, 0, "Shared opposite", "OPPOSITE_CASE", "against_some_answer"),
  point(B, 1, 0, "Shared opposite", null, "against_some_answer"),
  point(C, 2, 0, "Worry", "ASKER_WORRY", "for_some_answer"),
  point(A, 0, 1, "Solo", null, "context"),
  point(B, 1, 1, "Practical", "PRACTICAL", "for_some_answer"),
  point(C, 2, 1, "Practical", null, "for_some_answer"),
  answer(A, 0, "Yes, with conditions."), answer(B, 1, "Yes, with conditions."), answer(C, 2, "No, keep it as it is.", "OPPOSITE_CASE")
], "seed-choose");
const byId = mapItemsById(items);
const ids = (text: string) => items.filter((item) => (item.kind === "POINT" ? item.claim : item.answer) === text).map((item) => item.itemId);
const keyPoints = [
  mapKeyPoint("kp01", "Shared opposite", ids("Shared opposite"), byId),
  mapKeyPoint("kp02", "Worry", ids("Worry"), byId),
  mapKeyPoint("kp03", "Solo", ids("Solo"), byId),
  mapKeyPoint("kp04", "Practical", ids("Practical"), byId)
];
const mergedAnswers = [
  mapMergedAnswer("an01", "Yes, with conditions.", ids("Yes, with conditions."), byId),
  mapMergedAnswer("an02", "No, keep it as it is.", ids("No, keep it as it is."), byId)
];
const BASE = { keyPoints, mergedAnswers, items, languageTag: "en", maxAnswers: 4, pointsPerAnswer: 3 };
type Answer = MapChooseReply["answers"][number];
const chosen = (answerId: string, statement: string, forIds: string[], against: string[], rival: string | null): Answer =>
  ({ answer_id: answerId, statement, for: forIds, against, strongest_rival: rival });
const marksOf = (marks: readonly { mark: string; detail: string }[]) => marks.map((mark) => `${mark.mark}:${mark.detail}`);

describe("map choose: a reply that meets every quota", () => {
  it("is kept as it is; the unchosen points are also raised, most-raised first", () => {
    const out = mapFinishChoice({ ...BASE, reply: { answers: [
      chosen("a1", "Yes, with conditions.", ["kp04"], ["kp01"], "a2"), chosen("a2", "No, keep it as it is.", ["kp02"], [], "a1")] } });
    expect(out.marks).toEqual([]);
    expect(out.choice.answers.map((entry) => `${entry.answerId}>${entry.strongestRival}`)).toEqual(["a1>a2", "a2>a1"]);
    expect(out.choice.alsoRaised).toEqual(["kp03"]);
  });
});

describe("map choose: quotas over the whole chosen set", () => {
  it("adds the top single-AI point, then the OPPOSITE_CASE point, each to the answer with the fewest points", () => {
    const out = mapFinishChoice({ ...BASE, reply: { answers: [
      chosen("a1", "Yes, with conditions.", ["kp04"], [], "a2"), chosen("a2", "No, keep it as it is.", [], [], "a1")] } });
    expect(marksOf(out.marks)).toEqual(["CHOOSE_QUOTA_FILLED:SINGLE_AI:kp02", "CHOOSE_QUOTA_FILLED:OPPOSITE_CASE:kp01"]);
    expect(out.choice.answers[0]!.againstKeyPointIds).toEqual(["kp01"]);
    expect(out.choice.answers[1]!.forKeyPointIds).toEqual(["kp02"]);
  });
});

describe("map choose: at least two distinct answers (ANSWERS_FILLED)", () => {
  it("fills from the map's best-supported different answer first", () => {
    const out = mapFinishChoice({ ...BASE, reply: { answers: [chosen("a1", "Yes, with conditions.", [], ["kp01"], null)] } });
    expect(out.choice.answers.map((entry) => `${entry.answerId}:${entry.statement}:${String(entry.filled)}>${entry.strongestRival}`))
      .toEqual(["a1:Yes, with conditions.:false>filled-2", "filled-2:No, keep it as it is.:true>a1"]);
    expect(marksOf(out.marks)).toEqual(["ANSWERS_FILLED:MAP_CANDIDATE", "CHOOSE_QUOTA_FILLED:SINGLE_AI:kp02"]);
  });

  it("then from an OPPOSITE_CASE list's own candidate answer", () => {
    const lumped = [mapMergedAnswer("an01", "Yes, with conditions.", [...ids("Yes, with conditions."), ...ids("No, keep it as it is.")], byId)];
    const out = mapFinishChoice({ ...BASE, mergedAnswers: lumped, reply: { answers: [chosen("a1", "Yes, with conditions.", [], [], null)] } });
    expect(out.choice.answers[1]!.statement).toBe("No, keep it as it is.");
    expect(marksOf(out.marks)[0]).toBe("ANSWERS_FILLED:OPPOSITE_CASE_LIST");
  });

  it("then from the code's template, in the question's language", () => {
    const pointsOnly = items.filter((item) => item.kind === "POINT");
    const en = mapFinishChoice({ ...BASE, items: pointsOnly, mergedAnswers: [], reply: { answers: [chosen("a1", "Yes, with conditions.", [], [], null)] } });
    expect(en.choice.answers[1]!.statement).toBe("The opposite of this answer: Yes, with conditions.");
    expect(marksOf(en.marks)[0]).toBe("ANSWERS_FILLED:TEMPLATE");
    expect(mapOppositeTemplate("Da, cu condiții.", "ro")).toBe("Opusul acestui răspuns: Da, cu condiții.");
  });

  it("counts two wordings of one answer once", () => {
    const out = mapFinishChoice({ ...BASE, reply: { answers: [chosen("a1", "Yes, with conditions.", [], [], "a2"),
      chosen("a2", "yes  with conditions", [], [], "a1")] } });
    expect(out.choice.answers.map((entry) => entry.answerId)).toEqual(["a1", "filled-2"]);
  });

  it("keeps at most maxAnswers", () => {
    const four = ["Yes.", "No.", "Only in the centre.", "Only for students."].map((text, index) => chosen(`a${String(index + 1)}`, text, [], [], null));
    expect(mapFinishChoice({ ...BASE, maxAnswers: 3, reply: { answers: four } }).choice.answers).toHaveLength(3);
  });
});

describe("map choose: the fallback when the choose step failed (MAP_CHOOSE_FALLBACK)", () => {
  it("takes the most-raised merged answers and deals the points most-raised first", () => {
    const out = mapFinishChoice({ ...BASE, maxAnswers: 2, pointsPerAnswer: 2, reply: null });
    expect(marksOf(out.marks)).toEqual(["MAP_CHOOSE_FALLBACK:choose reply missing"]);
    expect(out.choice.answers.map((entry) => `${entry.answerId}:${entry.statement}>${entry.strongestRival}`))
      .toEqual(["a1:Yes, with conditions.>a2", "a2:No, keep it as it is.>a1"]);
    expect(out.choice.answers[0]!.againstKeyPointIds).toEqual(["kp01"]);
    expect(out.choice.answers[0]!.forKeyPointIds).toEqual(["kp02"]);
    expect(out.choice.answers[1]!.forKeyPointIds).toEqual(["kp04", "kp03"]);
    expect(out.choice.alsoRaised).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run tests/unit/map-choose.test.ts`
Expected: FAIL (`mapFinishChoice` is not a function).

- [ ] **Step 3: Implement**

Create `packages/map/src/choose.ts`:

```ts
import { mapRankKeyPoints, mapRankMergedAnswers } from "./items.js";
import type { MapChooseReply } from "./replies.js";
import { mapNormaliseText } from "./text.js";
import {
  MAP_LIMITS,
  type MapAnswerItem,
  type MapChoice,
  type MapItem,
  type MapKeyPoint,
  type MapMarkRecord,
  type MapMergedAnswer
} from "./types.js";

/**
 * The last way to name a second answer when the map offers no different one (ANSWERS_FILLED, source TEMPLATE).
 * Code-owned text; Phase 1 needs Romanian and English only. Phase 2 needs it in every locale the site serves.
 */
export function mapOppositeTemplate(statement: string, languageTag: string): string {
  const lead = languageTag === "ro" ? "Opusul acestui răspuns" : "The opposite of this answer";
  const empty = languageTag === "ro" ? "Un răspuns diferit de cel de mai sus" : "An answer different from the one above";
  return (statement.trim() === "" ? empty : `${lead}: ${statement.trim()}`).slice(0, MAP_LIMITS.claimMaxChars);
}

export type MapFinishChoiceInput = Readonly<{
  /** The choose AI's checked reply, or null when the step failed (MAP_CHOOSE_FALLBACK). */
  reply: MapChooseReply | null;
  keyPoints: readonly MapKeyPoint[];
  mergedAnswers: readonly MapMergedAnswer[];
  items: readonly MapItem[];
  languageTag: string;
  /** P: the most answers the debate argues. */
  maxAnswers: number;
  /** K: points per answer, used when the code chooses (the fallback). */
  pointsPerAnswer: number;
}>;

type MapAnswerDraft = { answerId: string; statement: string; forIds: string[]; againstIds: string[]; rival: string | null; filled: boolean };

const mapSideOf = (keyPoint: MapKeyPoint): "for" | "against" =>
  keyPoint.leansAgainst || keyPoint.fixedAngleKinds.includes("OPPOSITE_CASE") ? "against" : "for";

export function mapFinishChoice(input: MapFinishChoiceInput): Readonly<{ choice: MapChoice; marks: readonly MapMarkRecord[] }> {
  const marks: MapMarkRecord[] = [];
  const ranked = mapRankKeyPoints(input.keyPoints);
  const byId = new Map(input.keyPoints.map((keyPoint) => [keyPoint.keyPointId, keyPoint] as const));
  const place = (draft: MapAnswerDraft, keyPoint: MapKeyPoint) =>
    (mapSideOf(keyPoint) === "against" ? draft.againstIds : draft.forIds).push(keyPoint.keyPointId);
  const drafts: MapAnswerDraft[] = [];

  if (input.reply === null) {
    marks.push(Object.freeze({ mark: "MAP_CHOOSE_FALLBACK", step: "CHOOSE", detail: "choose reply missing" }));
    mapRankMergedAnswers(input.mergedAnswers).slice(0, Math.max(1, input.maxAnswers)).forEach((answer, index) => {
      drafts.push({ answerId: `a${String(index + 1)}`, statement: answer.answer, forIds: [], againstIds: [], rival: null, filled: false });
    });
    if (drafts.length > 0) {
      ranked.forEach((keyPoint, index) => {
        const draft = drafts[index % drafts.length]!;
        if (draft.forIds.length + draft.againstIds.length < input.pointsPerAnswer) place(draft, keyPoint);
      });
    }
  } else {
    for (const answer of input.reply.answers.slice(0, input.maxAnswers)) {
      if (drafts.some((draft) => mapNormaliseText(draft.statement) === mapNormaliseText(answer.statement))) continue;
      drafts.push({ answerId: answer.answer_id, statement: answer.statement, forIds: [...answer.for], againstIds: [...answer.against],
        rival: answer.strongest_rival, filled: false });
    }
  }

  // Distinct answers (spec §1.1): at least two.
  while (drafts.length < MAP_LIMITS.chooseDistinctAnswersMin) {
    const taken = new Set(drafts.map((draft) => mapNormaliseText(draft.statement)));
    const fromMap = mapRankMergedAnswers(input.mergedAnswers).find((answer) => !taken.has(mapNormaliseText(answer.answer)));
    const fromOpposite = input.items.find((item): item is MapAnswerItem => item.kind === "ANSWER"
      && item.angleKind === "OPPOSITE_CASE" && !taken.has(mapNormaliseText(item.answer)));
    const first = drafts[0];
    const [statement, source]: readonly [string, string] = fromMap !== undefined ? [fromMap.answer, "MAP_CANDIDATE"]
      : fromOpposite !== undefined ? [fromOpposite.answer, "OPPOSITE_CASE_LIST"]
        : [mapOppositeTemplate(first?.statement ?? "", input.languageTag), "TEMPLATE"];
    drafts.push({ answerId: `filled-${String(drafts.length + 1)}`, statement, forIds: [], againstIds: [], rival: first?.answerId ?? null, filled: true });
    marks.push(Object.freeze({ mark: "ANSWERS_FILLED", step: "CHOOSE", detail: source }));
  }

  // Quotas over the whole chosen set (spec §1.1, as ruled 2026-10-12).
  const chosenIds = () => new Set(drafts.flatMap((draft) => [...draft.forIds, ...draft.againstIds]));
  const quota = (name: string, eligible: (keyPoint: MapKeyPoint) => boolean) => {
    const chosen = chosenIds();
    if ([...chosen].some((id) => { const keyPoint = byId.get(id); return keyPoint !== undefined && eligible(keyPoint); })) return;
    const pick = ranked.find((keyPoint) => eligible(keyPoint) && !chosen.has(keyPoint.keyPointId));
    if (pick === undefined) return;
    const target = [...drafts].sort((a, b) => (a.forIds.length + a.againstIds.length) - (b.forIds.length + b.againstIds.length))[0]!;
    place(target, pick);
    marks.push(Object.freeze({ mark: "CHOOSE_QUOTA_FILLED", step: "CHOOSE", detail: `${name}:${pick.keyPointId}` }));
  };
  quota("SINGLE_AI", (keyPoint) => keyPoint.makers.length === 1);
  quota("OPPOSITE_CASE", (keyPoint) => keyPoint.fixedAngleKinds.includes("OPPOSITE_CASE"));
  quota("ASKER_WORRY", (keyPoint) => keyPoint.fixedAngleKinds.includes("ASKER_WORRY"));

  const answerIds = drafts.map((draft) => draft.answerId);
  const answers = drafts.map((draft, index) => Object.freeze({
    answerId: draft.answerId,
    statement: draft.statement,
    forKeyPointIds: Object.freeze([...draft.forIds]),
    againstKeyPointIds: Object.freeze([...draft.againstIds]),
    strongestRival: draft.rival !== null && draft.rival !== draft.answerId && answerIds.includes(draft.rival)
      ? draft.rival : answerIds[(index + 1) % answerIds.length]!,
    filled: draft.filled
  }));
  const finalChosen = chosenIds();
  return Object.freeze({
    choice: Object.freeze({
      answers: Object.freeze(answers),
      alsoRaised: Object.freeze(ranked.filter((keyPoint) => !finalChosen.has(keyPoint.keyPointId)).map((keyPoint) => keyPoint.keyPointId))
    }),
    marks: Object.freeze(marks)
  });
}
```

Add to `packages/map/src/index.ts`:

```ts
export * from "./choose.js";
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm exec vitest run tests/unit/map-choose.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```sh
git add packages/map/src/choose.ts packages/map/src/index.ts tests/unit/map-choose.test.ts
git commit -F - <<'MSG'
Map: finishing the choice (distinct answers, quotas, choose fallback, rivals, also raised)

Two distinct answers at least, filled from the map, then an OPPOSITE_CASE list, then a code template (en/ro);
quotas over the whole chosen set (a single-AI point, an OPPOSITE_CASE point, an ASKER_WORRY point when present),
each fill recorded; the fallback deals points most-raised first; every unchosen point is kept as also raised.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 8: Roles: rotation, who plans, merges, fills gaps and chooses; list assignment and reassignment

**Files:**
- Create: `packages/map/src/roles.ts`
- Modify: `packages/map/src/index.ts`
- Test: `tests/unit/map-roles.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 4 (`MapAnglesReply`).
- Produces:
  - `MAP_FALLBACK_ANGLES: readonly MapAngle[]`. These are the three fixed angles plus `GENERAL`, in English: they are prompt material, and the language directive makes the AI answer in the question's language.
  - `mapOrderAngles(reply: MapAnglesReply): readonly MapAngle[]`
  - `mapRotateSeats<T>(seats: readonly T[], rotation: number): readonly T[]`
  - `mapDistinctMakers(seats: readonly MapSeat[]): number`
  - `mapPickPlanner(order: readonly MapSeat[], out: ReadonlySet<string>): MapSeat | null`
  - `mapPickMerger(order, out): MapSeat | null`
  - `mapPickChooser(order, out, merger: MapSeat | null): MapSeat | null`
  - `mapPickGapSeat(order, out, merger: MapSeat | null, listWriters: ReadonlySet<string>, round: number): MapSeat | null`
  - `type MapListAssignment = Readonly<{ listIndex: number; seat: MapSeat; angle: MapAngle | null }>`
  - `mapListAssignments(angles: readonly MapAngle[], order, out): readonly MapListAssignment[]`
  - `mapReassignLists(failed: readonly MapListAssignment[], finished: readonly MapSeat[], out): readonly MapListAssignment[]`

`order` is the seats in this question's rotation; `out` is the aiRefs sitting out (busy). The rules:

- Planner: the first seat.
- Merger: the next seat after the planner.
- Chooser: the first seat after the merger whose maker differs from the merger's maker. If the merge failed, there is no merger to avoid, and the chooser is taken from the third seat on.
- Gap AI for round k:
  - candidates are the seats whose maker differs from the merger's, starting after the merger;
  - seats that wrote no list come first;
  - round k takes the k-th candidate, cyclically.
- Lists: min(angles, available seats), angle i to available seat i. A failed list goes to the finished seats in plan order, one each; the rest are dropped.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/map-roles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAP_FALLBACK_ANGLES,
  mapDistinctMakers,
  mapListAssignments,
  mapOrderAngles,
  mapPickChooser,
  mapPickGapSeat,
  mapPickMerger,
  mapPickPlanner,
  mapReassignLists,
  mapRotateSeats,
  type MapAngle,
  type MapSeat
} from "@debateai/map";

const S = [0, 1, 2, 3, 4].map((index): MapSeat => ({ aiRef: `ai-${String(index)}`, maker: `m${String(index)}` }));
const S1b: MapSeat = { aiRef: "ai-1b", maker: "m1" };
const NONE = new Set<string>();
const refs = (seats: readonly (MapSeat | null)[]) => seats.map((seat) => seat?.aiRef ?? null);
const angle = (angleId: string): MapAngle => ({ angleId, kind: "SPECIFIC", label: angleId, focus: angleId });

describe("map roles: rotation", () => {
  it("rotates by question, wrapping, and leaves an empty list empty", () => {
    expect(refs(mapRotateSeats(S, 2))).toEqual(["ai-2", "ai-3", "ai-4", "ai-0", "ai-1"]);
    expect(refs(mapRotateSeats(S, 7))).toEqual(refs(mapRotateSeats(S, 2)));
    expect(mapRotateSeats([], 3)).toEqual([]);
    expect(mapDistinctMakers([S[0]!, S[1]!, S1b])).toBe(2);
  });
});

describe("map roles: who does what", () => {
  it("planner is the first seat that is not sitting out", () => {
    expect(mapPickPlanner(S, NONE)?.aiRef).toBe("ai-0");
    expect(mapPickPlanner(S, new Set(["ai-0"]))?.aiRef).toBe("ai-1");
  });

  it("merger is the next seat after the planner", () => {
    expect(mapPickMerger(S, NONE)?.aiRef).toBe("ai-1");
    expect(mapPickMerger(S, new Set(["ai-1"]))?.aiRef).toBe("ai-2");
    expect(mapPickMerger([S[0]!], NONE)?.aiRef).toBe("ai-0");
  });

  it("chooser comes after the merger and is never of the merger's maker", () => {
    const order = [S[0]!, S[1]!, S1b, S[2]!];
    expect(mapPickChooser(order, NONE, S[1]!)?.aiRef).toBe("ai-2");
    expect(mapPickChooser(order, NONE, null)?.aiRef).toBe("ai-1b");
    expect(mapPickChooser([S[0]!, S1b], NONE, S1b)?.aiRef).toBe("ai-0");
    expect(mapPickChooser([S[1]!, S1b], NONE, S[1]!)).toBeNull();
  });

  it("gap AI: not the merger's maker; a seat with no list first; round by round", () => {
    const writers = new Set(["ai-0", "ai-1", "ai-2", "ai-3"]);
    expect(mapPickGapSeat(S, NONE, S[1]!, writers, 1)?.aiRef).toBe("ai-4");
    expect(mapPickGapSeat(S, NONE, S[1]!, writers, 2)?.aiRef).toBe("ai-2");
    expect(mapPickGapSeat(S, new Set(["ai-4"]), S[1]!, writers, 1)?.aiRef).toBe("ai-2");
    expect(mapPickGapSeat([S[1]!, S1b], NONE, S[1]!, writers, 1)).toBeNull();
  });
});

describe("map roles: lists", () => {
  it("gives min(angles, available seats) lists, angle i to available seat i", () => {
    const four = ["a", "b", "c", "d"].map(angle);
    expect(mapListAssignments(four, S, new Set(["ai-1"])).map((entry) => `${String(entry.listIndex)}:${entry.seat.aiRef}:${entry.angle?.angleId ?? "-"}`))
      .toEqual(["0:ai-0:a", "1:ai-2:b", "2:ai-3:c", "3:ai-4:d"]);
    expect(mapListAssignments(["a", "b", "c", "d", "e", "f", "g"].map(angle), S, NONE)).toHaveLength(5);
  });

  it("reassigns failed lists to finished seats in plan order, one each; the rest are dropped", () => {
    const failed = [{ listIndex: 1, seat: S[2]!, angle: angle("b") }, { listIndex: 3, seat: S[4]!, angle: angle("d") }];
    expect(mapReassignLists(failed, [S[0]!, S[3]!], NONE).map((entry) => `${String(entry.listIndex)}:${entry.seat.aiRef}`))
      .toEqual(["1:ai-0", "3:ai-3"]);
    expect(mapReassignLists(failed, [S[0]!], NONE)).toHaveLength(1);
    expect(mapReassignLists(failed, [S[0]!], new Set(["ai-0"]))).toHaveLength(0);
  });
});

describe("map roles: angles", () => {
  it("puts the fixed kinds first, in their order, then the specific ones as written", () => {
    const ordered = mapOrderAngles({ angles: [
      { angle_id: "cost", kind: "SPECIFIC", label: "Cost", focus: "Who pays." },
      { angle_id: "do", kind: "PRACTICAL", label: "Do", focus: "What to do." },
      { angle_id: "opp", kind: "OPPOSITE_CASE", label: "Opp", focus: "Other side." },
      { angle_id: "worry", kind: "ASKER_WORRY", label: "Worry", focus: "Fear." }
    ] });
    expect(ordered.map((entry) => entry.angleId)).toEqual(["opp", "worry", "do", "cost"]);
  });

  it("falls back to the three fixed angles and GENERAL", () => {
    expect(MAP_FALLBACK_ANGLES.map((entry) => entry.kind)).toEqual(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "GENERAL"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run tests/unit/map-roles.test.ts`
Expected: FAIL (`mapRotateSeats` is not a function).

- [ ] **Step 3: Implement**

Create `packages/map/src/roles.ts`:

```ts
import type { MapAnglesReply } from "./replies.js";
import { MAP_FIXED_ANGLE_KINDS, type MapAngle, type MapSeat } from "./types.js";

/**
 * MAP_ANGLES_FALLBACK (spec §1.2): the three fixed angles and GENERAL. Prompt material, written in English; the
 * argument-language directive makes the list AI answer in the question's language.
 */
export const MAP_FALLBACK_ANGLES: readonly MapAngle[] = Object.freeze([
  { angleId: "opposite", kind: "OPPOSITE_CASE" as const, label: "Strongest case for a different answer",
    focus: "The strongest case for an answer different from the one most people would give first." },
  { angleId: "worry", kind: "ASKER_WORRY" as const, label: "What the person asking is worried about",
    focus: "What the person asking is probably worried about or trying to decide." },
  { angleId: "practical", kind: "PRACTICAL" as const, label: "What to do in practice",
    focus: "What the person should actually do, and what it would take." },
  { angleId: "general", kind: "GENERAL" as const, label: "The question as a whole",
    focus: "The points that matter most for answering the question, from every side." }
].map((angle) => Object.freeze(angle)));

/** The planner's angles: the three fixed kinds first, in their fixed order, then its specific angles as written. */
export function mapOrderAngles(reply: MapAnglesReply): readonly MapAngle[] {
  const toAngle = (angle: MapAnglesReply["angles"][number]): MapAngle =>
    Object.freeze({ angleId: angle.angle_id, kind: angle.kind, label: angle.label, focus: angle.focus });
  const fixed = MAP_FIXED_ANGLE_KINDS.flatMap((kind) => reply.angles.filter((angle) => angle.kind === kind).map(toAngle));
  const specific = reply.angles.filter((angle) => angle.kind === "SPECIFIC").map(toAngle);
  return Object.freeze([...fixed, ...specific]);
}

/** The seats in this question's order: the list started `rotation` places on (the first AI rotates per question). */
export function mapRotateSeats<T>(seats: readonly T[], rotation: number): readonly T[] {
  if (seats.length === 0) return Object.freeze([]);
  const start = ((rotation % seats.length) + seats.length) % seats.length;
  return Object.freeze([...seats.slice(start), ...seats.slice(0, start)]);
}

export function mapDistinctMakers(seats: readonly MapSeat[]): number {
  return new Set(seats.map((seat) => seat.maker)).size;
}

function mapCyclicFrom(order: readonly MapSeat[], start: number): readonly MapSeat[] {
  if (order.length === 0) return [];
  const at = ((start % order.length) + order.length) % order.length;
  return [...order.slice(at), ...order.slice(0, at)];
}

const mapIndexOf = (order: readonly MapSeat[], seat: MapSeat): number => order.findIndex((entry) => entry.aiRef === seat.aiRef);

export function mapPickPlanner(order: readonly MapSeat[], out: ReadonlySet<string>): MapSeat | null {
  return order.find((seat) => !out.has(seat.aiRef)) ?? null;
}

/** The next seat after the planner (spec §1.1: "1 AI, rotates"). */
export function mapPickMerger(order: readonly MapSeat[], out: ReadonlySet<string>): MapSeat | null {
  return mapCyclicFrom(order, 1).find((seat) => !out.has(seat.aiRef)) ?? null;
}

/** After the merger, never of the merger's maker (spec §1.1). With no merger (merge failed), from the third seat on. */
export function mapPickChooser(order: readonly MapSeat[], out: ReadonlySet<string>, merger: MapSeat | null): MapSeat | null {
  const start = merger === null ? 2 : mapIndexOf(order, merger) + 1;
  return mapCyclicFrom(order, start).find((seat) => !out.has(seat.aiRef) && (merger === null || seat.maker !== merger.maker)) ?? null;
}

/**
 * Round `round` (1-based) of the gap AI (spec §1.1): a maker that did not merge, rotating; a maker that wrote no list is
 * preferred when one exists.
 */
export function mapPickGapSeat(order: readonly MapSeat[], out: ReadonlySet<string>, merger: MapSeat | null,
  listWriters: ReadonlySet<string>, round: number): MapSeat | null {
  const start = merger === null ? 0 : mapIndexOf(order, merger) + 1;
  const eligible = mapCyclicFrom(order, start).filter((seat) => !out.has(seat.aiRef) && (merger === null || seat.maker !== merger.maker));
  const preferred = [...eligible.filter((seat) => !listWriters.has(seat.aiRef)), ...eligible.filter((seat) => listWriters.has(seat.aiRef))];
  return preferred.length === 0 ? null : preferred[(Math.max(1, round) - 1) % preferred.length]!;
}

export type MapListAssignment = Readonly<{ listIndex: number; seat: MapSeat; angle: MapAngle | null }>;

/** Lists = min(angles, available seats): angle i to available seat i, in plan order. */
export function mapListAssignments(angles: readonly MapAngle[], order: readonly MapSeat[], out: ReadonlySet<string>): readonly MapListAssignment[] {
  const seats = order.filter((seat) => !out.has(seat.aiRef));
  return Object.freeze(Array.from({ length: Math.min(angles.length, seats.length) }, (_unused, index) =>
    Object.freeze({ listIndex: index, seat: seats[index]!, angle: angles[index]! })));
}

/**
 * Spec §1.2: a failed list's angle goes to the next map AI that has finished. Deterministic (as ruled): after the
 * first wave, failed lists in plan order go to the finished seats in plan order, one each; the rest are dropped.
 */
export function mapReassignLists(failed: readonly MapListAssignment[], finished: readonly MapSeat[], out: ReadonlySet<string>): readonly MapListAssignment[] {
  const free = finished.filter((seat) => !out.has(seat.aiRef));
  return Object.freeze(failed.slice(0, free.length).map((assignment, index) =>
    Object.freeze({ listIndex: assignment.listIndex, seat: free[index]!, angle: assignment.angle })));
}
```

Add to `packages/map/src/index.ts`:

```ts
export * from "./roles.js";
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm exec vitest run tests/unit/map-roles.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```sh
git add packages/map/src/roles.ts packages/map/src/index.ts tests/unit/map-roles.test.ts
git commit -F - <<'MSG'
Map: role rotation, list assignment and the angles fallback

Planner first, merger next, chooser after the merger and never of its maker, gap AI never of the merger's maker
with seats that wrote no list first (spec §1.1). Lists = min(angles, available seats); a failed list goes to a
finished seat in plan order, else it is dropped (spec §1.2); the angles fallback is the fixed three plus GENERAL.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 9: The orchestrators (arms A, B, C) over an injected caller

**Files:**
- Create: `packages/map/src/orchestrator.ts`
- Modify: `packages/map/src/index.ts`
- Test: `tests/unit/map-orchestrator.test.ts`

**Interfaces:**
- Consumes: Tasks 1–8.
- Produces (used by Task 11; Phase 2's runner uses them unchanged with a caller built on its scheduler lane):
  - `type MapCallRequest<T> = Readonly<{ step: MapStep; callSiteKey: string; seat: MapSeat; order: number; shown: "BLIND" | readonly string[]; spec: MapStepSpec<T> }>`
  - `type MapCallOutcome<T> = Readonly<{ kind: "OK"; value: T }> | Readonly<{ kind: "FAILED"; code: string }> | Readonly<{ kind: "BUSY"; code: string }>`
  - `interface MapCaller { call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> }`
  - `type MapRunInput = Readonly<{ questionLine; languageName; languageTag; seats: readonly MapSeat[]; caller: MapCaller; seed: string; gapRoundsMax: number; maxAnswers: number; pointsPerAnswer: number; contracts?: MapPromptContractSet }>`
  - `mapRunAngleMap(input: MapRunInput): Promise<MapResult>` (arm C), `mapRunBlindLists(input): Promise<MapResult>` (arm B), `mapRunSnowball(input): Promise<MapResult>` (arm A)

The call sites are the spec's keys (§3.4): `MAP:angles`, `MAP:list:<i>`, `MAP:merge`, `MAP:gap:<k>`, `MAP:choose`.
- Each call gets its plan position (`order`) before it is sent. Calls running at the same time cannot reorder the record, so the same replies always give the same map (spec §3.5).
- A `BUSY` outcome puts the seat out for the rest of the map.
- A caller that throws counts as `FAILED` (`MAP_CALLER_THREW`).
- The caller owns repairs, busy waits and recording. The orchestrator owns only the plan and the fallbacks.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/map-orchestrator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  mapRunAngleMap,
  mapRunBlindLists,
  mapRunSnowball,
  type MapCallOutcome,
  type MapCallRequest,
  type MapCaller,
  type MapResult,
  type MapRunInput,
  type MapSeat
} from "@debateai/map";

type Reply = string | "BUSY" | "FAIL";
type Script = (request: MapCallRequest<unknown>) => Reply;
const STOP = { finishReason: "stop" };

/** A scripted caller: replies are TEXT, read through the step's own classifier, as a real gateway would. */
function scripted(script: Script, delayOf: (request: MapCallRequest<unknown>) => number = () => 0): { caller: MapCaller; requests: MapCallRequest<unknown>[] } {
  const requests: MapCallRequest<unknown>[] = [];
  const caller: MapCaller = {
    async call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> {
      const seen = request as MapCallRequest<unknown>;
      requests.push(seen);
      const delay = delayOf(seen);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      const reply = script(seen);
      if (reply === "BUSY") return { kind: "BUSY", code: "TEST_BUSY" };
      if (reply === "FAIL") return { kind: "FAILED", code: "TEST_FAILED" };
      if (request.spec.classify(reply, STOP).parseStatus !== "PARSED") return { kind: "FAILED", code: "TEST_UNPARSED" };
      return { kind: "OK", value: request.spec.read(reply, STOP) };
    }
  };
  return { caller, requests };
}

const field = (request: MapCallRequest<unknown>, name: string) => request.spec.material.find((entry) => entry.name === name)?.content ?? "";
const why = "It could change the answer for the people who ride the bus.";
const ANGLES = JSON.stringify({ angles: [
  { angle_id: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The strongest case for keeping the fares." },
  { angle_id: "worry", kind: "ASKER_WORRY", label: "The worry", focus: "What the person asking is afraid of." },
  { angle_id: "do", kind: "PRACTICAL", label: "What to do", focus: "What the city should do first." },
  { angle_id: "cost", kind: "SPECIFIC", label: "The cost", focus: "Who pays for the free rides." }
] });
const list = (request: MapCallRequest<unknown>) => {
  const label = field(request, "angle_label") || "open";
  return JSON.stringify({ points: [
    { claim: "The shared point is that the cost of the change is high.", why_it_matters: why, leans: "against_some_answer" },
    { claim: `A point from the ${label} angle, number ${String(request.order)}.`, why_it_matters: why, leans: "for_some_answer" },
    { claim: `Another point from the ${label} angle, number ${String(request.order)}.`, why_it_matters: why, leans: "context" }
  ], candidate_answers: [label === "The other side" ? "No, keep the fares as they are." : "Yes, with clear conditions."] });
};
const snowball = (request: MapCallRequest<unknown>) => JSON.stringify({ points: [
  { claim: `A new point after seeing the others, number ${String(request.order)}.`, why_it_matters: why, leans: "context" }], candidate_answers: [] });
const merge = (request: MapCallRequest<unknown>) => {
  const points = JSON.parse(field(request, "points")) as { item_id: string; claim: string }[];
  const answers = JSON.parse(field(request, "candidate_answers")) as { item_id: string; answer: string }[];
  const group = <T,>(rows: T[], key: (row: T) => string) => [...new Set(rows.map(key))].map((text) => [text, rows.filter((row) => key(row) === text)] as const);
  return JSON.stringify({
    key_points: group(points, (row) => row.claim).map(([claim, rows], index) => ({ key_point_id: `k${String(index + 1)}`, claim, member_item_ids: rows.map((row) => row.item_id) })),
    answers: group(answers, (row) => row.answer).map(([answer, rows], index) => ({ answer_id: `a${String(index + 1)}`, answer, member_item_ids: rows.map((row) => row.item_id) }))
  });
};
const gap = (count: number) => JSON.stringify({ new_points: Array.from({ length: count }, (_unused, index) =>
  ({ claim: `A missing point about night buses, number ${String(index + 1)}.`, why_it_matters: why, leans: "context" })), framing_challenges: [] });
const choose = (request: MapCallRequest<unknown>) => {
  const ids = (JSON.parse(field(request, "key_points")) as { key_point_id: string }[]).map((row) => row.key_point_id);
  return JSON.stringify({ answers: [
    { answer_id: "a1", statement: "Yes, with clear conditions.", for: [ids[0]], against: [ids[1]], strongest_rival: "a2" },
    { answer_id: "a2", statement: "No, keep the fares as they are.", for: [ids[1]], against: [], strongest_rival: "a1" }] });
};
const normal: Script = (request) => {
  if (request.step === "ANGLES") return ANGLES;
  if (request.step === "LIST") return list(request);
  if (request.step === "SNOWBALL") return snowball(request);
  if (request.step === "MERGE") return merge(request);
  if (request.step === "GAP") return gap(1);
  return choose(request);
};
const SEATS = [0, 1, 2, 3, 4].map((index): MapSeat => ({ aiRef: `ai-${String(index)}`, maker: `m${String(index)}` }));
const input = (caller: MapCaller, overrides: Partial<MapRunInput> = {}): MapRunInput => ({
  questionLine: "Should a city make its central buses free to ride?", languageName: "English", languageTag: "en",
  seats: SEATS, caller, seed: "q1|C", gapRoundsMax: 2, maxAnswers: 4, pointsPerAnswer: 4, ...overrides });
const steps = (result: MapResult) => result.calls.map((call) => `${call.step}:${call.aiRef}`);
const marks = (result: MapResult) => result.marks.map((mark) => mark.mark);
const notes = (result: MapResult) => result.notes.map((note) => note.note);

describe("map arm C: the angle map", () => {
  it("plans, lists in parallel, merges, fills one gap round and chooses, in plan order", async () => {
    const result = await mapRunAngleMap(input(scripted(normal).caller));
    expect(result.kind).toBe("MAP");
    expect(steps(result)).toEqual(["ANGLES:ai-0", "LIST:ai-0", "LIST:ai-1", "LIST:ai-2", "LIST:ai-3", "MERGE:ai-1", "GAP:ai-4", "CHOOSE:ai-2"]);
    expect(result.calls.map((call) => call.callSiteKey)).toEqual(["MAP:angles", "MAP:list:0", "MAP:list:1", "MAP:list:2", "MAP:list:3",
      "MAP:merge", "MAP:gap:1", "MAP:choose"]);
    expect(result.calls.map((call) => call.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(result.angles.map((angle) => angle.kind)).toEqual(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "SPECIFIC"]);
    expect(notes(result)).toEqual(["GAP_STOPPED"]);
    const shared = result.keyPoints.find((keyPoint) => keyPoint.claim.startsWith("The shared point"))!;
    expect(shared.blindMakers).toEqual(["m0", "m1", "m2", "m3"]);
    expect(result.choice?.answers.length).toBeGreaterThanOrEqual(2);
    expect(result.calls.find((call) => call.step === "MERGE")!.shown).toEqual(result.items
      .filter((item) => item.origin === "BLIND").map((item) => item.itemId).sort());
    expect(result.calls.filter((call) => call.step === "LIST").every((call) => call.shown === "BLIND")).toBe(true);
  });

  it("falls back to the fixed angles and GENERAL when the planner fails (MAP_ANGLES_FALLBACK)", async () => {
    const result = await mapRunAngleMap(input(scripted((request) => request.step === "ANGLES" ? "FAIL" : normal(request)).caller));
    expect(marks(result)).toContain("MAP_ANGLES_FALLBACK");
    expect(result.angles.map((angle) => angle.kind)).toEqual(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "GENERAL"]);
  });

  it("a busy list is reassigned to the first finished seat, and the busy seat takes no later role", async () => {
    const result = await mapRunAngleMap(input(scripted((request) =>
      request.step === "LIST" && request.seat.aiRef === "ai-2" ? "BUSY" : normal(request)).caller));
    expect(notes(result)).toContain("LIST_REASSIGNED");
    expect(result.calls.filter((call) => call.callSiteKey === "MAP:list:2").map((call) => `${call.aiRef}:${call.outcome}`))
      .toEqual(["ai-2:BUSY", "ai-0:OK"]);
    expect(steps(result).slice(-3)).toEqual(["MERGE:ai-1", "GAP:ai-4", "CHOOSE:ai-3"]);
  });

  it("merges by rule when the merge fails (MAP_MERGE_FALLBACK); with no merger the chooser starts at the third seat", async () => {
    const result = await mapRunAngleMap(input(scripted((request) => request.step === "MERGE" ? "FAIL" : normal(request)).caller));
    expect(marks(result)).toContain("MAP_MERGE_FALLBACK");
    expect(result.keyPoints.find((keyPoint) => keyPoint.claim.startsWith("The shared point"))!.memberItemIds).toHaveLength(4);
    expect(steps(result).slice(-2)).toEqual(["GAP:ai-4", "CHOOSE:ai-2"]);
  });

  it("keeps the items a merge reply left out, as their own points (MERGE_ITEMS_KEPT)", async () => {
    const onlyShared: Script = (request) => {
      if (request.step !== "MERGE") return normal(request);
      const full = JSON.parse(merge(request)) as { key_points: unknown[]; answers: unknown[] };
      return JSON.stringify({ key_points: full.key_points.slice(0, 1), answers: full.answers });
    };
    const result = await mapRunAngleMap(input(scripted(onlyShared).caller));
    expect(notes(result)).toContain("MERGE_ITEMS_KEPT");
    expect(result.keyPoints.length).toBeGreaterThan(1);
  });

  it("chooses by rule when the choose fails (MAP_CHOOSE_FALLBACK)", async () => {
    const result = await mapRunAngleMap(input(scripted((request) => request.step === "CHOOSE" ? "FAIL" : normal(request)).caller));
    expect(marks(result)).toContain("MAP_CHOOSE_FALLBACK");
    expect(result.choice?.answers.length).toBeGreaterThanOrEqual(2);
  });

  it("gives today's opening when fewer than two lists arrive (MAP_UNAVAILABLE_TODAYS_OPENING), and asks no merge", async () => {
    const result = await mapRunAngleMap(input(scripted((request) =>
      request.step === "LIST" && request.callSiteKey !== "MAP:list:0" ? "FAIL" : normal(request)).caller));
    expect(result.kind).toBe("UNAVAILABLE");
    expect(marks(result)).toEqual(["MAP_UNAVAILABLE_TODAYS_OPENING"]);
    expect(result.calls.some((call) => call.step === "MERGE")).toBe(false);
  });

  it("goes on to a second gap round only after a round with at least 2 new points", async () => {
    const twoThenNone: Script = (request) => request.step !== "GAP" ? normal(request) : request.callSiteKey === "MAP:gap:1" ? gap(2) : gap(0);
    const result = await mapRunAngleMap(input(scripted(twoThenNone).caller));
    expect(steps(result).filter((step) => step.startsWith("GAP"))).toEqual(["GAP:ai-4", "GAP:ai-2"]);
    expect(notes(result)).toEqual(["GAP_STOPPED"]);
    expect(result.items.filter((item) => item.origin === "GAP")).toHaveLength(2);
  });

  it("skips a failed gap round without the stop rule, and tries the next round", async () => {
    const failFirst: Script = (request) => request.step === "GAP" && request.callSiteKey === "MAP:gap:1" ? "FAIL" : normal(request);
    const result = await mapRunAngleMap(input(scripted(failFirst).caller));
    expect(result.calls.filter((call) => call.step === "GAP").map((call) => call.outcome)).toEqual(["FAILED", "OK"]);
    expect(notes(result)).toEqual(["GAP_SKIPPED", "GAP_STOPPED"]);
  });

  it("needs two makers: one maker gives today's opening with no call", async () => {
    const { caller, requests } = scripted(normal);
    const result = await mapRunAngleMap(input(caller, { seats: SEATS.map((seat) => ({ ...seat, maker: "same" })) }));
    expect(result.kind).toBe("UNAVAILABLE");
    expect(requests).toHaveLength(0);
  });

  it("records the same map whatever order the parallel lists finish in", async () => {
    const plain = await mapRunAngleMap(input(scripted(normal).caller));
    const reversed = await mapRunAngleMap(input(scripted(normal, (request) => request.step === "LIST" ? 40 - 10 * request.order : 0).caller));
    expect(steps(reversed)).toEqual(steps(plain));
    expect(reversed.items.map((item) => item.itemId)).toEqual(plain.items.map((item) => item.itemId));
  });

  it("never shows an AI reference or a maker in any material", async () => {
    const seats = SEATS.map((seat) => ({ aiRef: `AIREF-SENTINEL-${seat.aiRef}`, maker: `MAKER-SENTINEL-${seat.maker}` }));
    const { caller, requests } = scripted(normal);
    await mapRunAngleMap(input(caller, { seats }));
    for (const request of requests) for (const entry of request.spec.material) expect(entry.content).not.toContain("SENTINEL");
  });
});

describe("map arm B: blind lists with no angle", () => {
  it("lists from every seat without an angle, then merge, one gap round and choose", async () => {
    const { caller, requests } = scripted(normal);
    const result = await mapRunBlindLists(input(caller, { gapRoundsMax: 1, seed: "q1|B" }));
    expect(steps(result)).toEqual(["LIST:ai-0", "LIST:ai-1", "LIST:ai-2", "LIST:ai-3", "LIST:ai-4", "MERGE:ai-1", "GAP:ai-2", "CHOOSE:ai-2"]);
    expect(requests.filter((request) => request.step === "LIST").every((request) => request.spec.contract.contractId === "map.list.open.v1")).toBe(true);
    expect(result.angles).toEqual([]);
  });
});

describe("map arm A: snowball from the first AI", () => {
  it("the first AI lists blind; each next sees the points so far and adds only new ones; then choose, no merge", async () => {
    const result = await mapRunSnowball(input(scripted(normal).caller, { seed: "q1|A" }));
    expect(steps(result)).toEqual(["LIST:ai-0", "SNOWBALL:ai-1", "SNOWBALL:ai-2", "SNOWBALL:ai-3", "SNOWBALL:ai-4", "CHOOSE:ai-2"]);
    expect(result.calls.filter((call) => call.step === "SNOWBALL").map((call) => call.shown.length)).toEqual([3, 4, 5, 6]);
    expect(result.items.filter((item) => item.origin === "SHOWN")).toHaveLength(4);
    expect(result.keyPoints).toHaveLength(7);
  });
});
```

Notes on the test:
- In arm B the gap round goes to `ai-2`. The merger is `ai-1`; every seat wrote a list; the candidates start after the merger (`ai-2`, `ai-3`, `ai-4`, `ai-0`), so round 1 takes `ai-2`.
- The chooser is `ai-2` too: the first seat after the merger whose maker differs. The spec does not forbid the gap AI and the chooser being the same seat.
- In arm A, the `shown` lengths are the point ids seen so far: 3 from the first list, then one more per AI.

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run tests/unit/map-orchestrator.test.ts`
Expected: FAIL (`mapRunAngleMap` is not a function).

- [ ] **Step 3: Implement**

Create `packages/map/src/orchestrator.ts`:

```ts
import { mapFinishChoice } from "./choose.js";
import { mapAssignItemIds, mapNextItemNumbers, type MapItemDraft } from "./items.js";
import { mapAddGapPoints, mapApplyMerge, mapCodeMerge, mapSingletonMap, type MapMergedMap } from "./keypoints.js";
import type { MapPromptContractSet } from "./prompts.js";
import type { MapListReply } from "./replies.js";
import {
  MAP_FALLBACK_ANGLES,
  mapDistinctMakers,
  mapListAssignments,
  mapOrderAngles,
  mapPickChooser,
  mapPickGapSeat,
  mapPickMerger,
  mapPickPlanner,
  mapReassignLists,
  type MapListAssignment
} from "./roles.js";
import {
  mapAnglesSpec,
  mapChooseSpec,
  mapGapSpec,
  mapListSpec,
  mapMergeSpec,
  mapSnowballSpec,
  type MapSpecContext,
  type MapStepSpec
} from "./specs.js";
import {
  MAP_LIMITS,
  type MapAngle,
  type MapArm,
  type MapCallRecord,
  type MapChoice,
  type MapItem,
  type MapItemOrigin,
  type MapKeyPoint,
  type MapLean,
  type MapMarkRecord,
  type MapMergedAnswer,
  type MapNote,
  type MapNoteRecord,
  type MapPointItem,
  type MapResult,
  type MapSeat,
  type MapStep
} from "./types.js";

/** One model call the map asks for. `order` is its plan position, given before it is sent. */
export type MapCallRequest<T> = Readonly<{
  step: MapStep;
  callSiteKey: string;
  seat: MapSeat;
  order: number;
  shown: "BLIND" | readonly string[];
  spec: MapStepSpec<T>;
}>;

/** OK with the checked value; FAILED (after the caller's own repairs); BUSY (the AI sits out the rest of the map). */
export type MapCallOutcome<T> =
  | Readonly<{ kind: "OK"; value: T }>
  | Readonly<{ kind: "FAILED"; code: string }>
  | Readonly<{ kind: "BUSY"; code: string }>;

/**
 * The only way the map reaches a model. Phase 1: the practice tool's preview gateway. Phase 2: the runner's gateway
 * through its scheduler lane. The caller owns the frame, the repairs, the busy waits and the record of the call.
 */
export interface MapCaller {
  call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>>;
}

export type MapRunInput = Readonly<{
  questionLine: string;
  languageName: string;
  languageTag: string;
  /** The map AIs in this question's rotation order (the first seat plans; arm A: the first seat lists first). */
  seats: readonly MapSeat[];
  caller: MapCaller;
  /** Fixes the opaque item ids (e.g. question id and arm). */
  seed: string;
  /** G: 1 (Free; arm B) or up to 2 (Premium; arm C). Arm A has none. */
  gapRoundsMax: number;
  /** P: the most answers chosen. */
  maxAnswers: number;
  /** K: points per answer when the code chooses. */
  pointsPerAnswer: number;
  contracts?: MapPromptContractSet;
}>;

type MapListLike = Readonly<{
  points: readonly Readonly<{ claim: string; why_it_matters: string; leans: MapLean }>[];
  candidate_answers: readonly string[];
}>;

class MapRun {
  readonly out = new Set<string>();
  readonly calls: MapCallRecord[] = [];
  readonly marks: MapMarkRecord[] = [];
  readonly notes: MapNoteRecord[] = [];
  #next = 0;

  constructor(readonly input: MapRunInput, readonly arm: MapArm) {}

  get ctx(): MapSpecContext {
    return Object.freeze({ questionLine: this.input.questionLine, languageName: this.input.languageName, languageTag: this.input.languageTag,
      ...(this.input.contracts === undefined ? {} : { contracts: this.input.contracts }) });
  }

  async mapAsk<T>(step: MapStep, callSiteKey: string, seat: MapSeat, shown: "BLIND" | readonly string[], spec: MapStepSpec<T>): Promise<T | null> {
    const order = this.#next;
    this.#next += 1;
    let outcome: MapCallOutcome<T>;
    try {
      outcome = await this.input.caller.call({ step, callSiteKey, seat, order, shown, spec });
    } catch {
      outcome = { kind: "FAILED", code: "MAP_CALLER_THREW" };
    }
    this.calls.push(Object.freeze({ step, callSiteKey, aiRef: seat.aiRef, maker: seat.maker, order,
      shown: shown === "BLIND" ? "BLIND" : Object.freeze([...shown]), outcome: outcome.kind, code: outcome.kind === "OK" ? null : outcome.code }));
    if (outcome.kind === "BUSY") this.out.add(seat.aiRef);
    return outcome.kind === "OK" ? outcome.value : null;
  }

  mapNote(note: MapNote, step: MapStep, detail: string): void {
    this.notes.push(Object.freeze({ note, step, detail }));
  }

  mapResult(parts: Readonly<{ kind: "MAP" | "UNAVAILABLE"; angles: readonly MapAngle[]; items: readonly MapItem[];
    keyPoints: readonly MapKeyPoint[]; mergedAnswers: readonly MapMergedAnswer[]; framingChallenges: readonly string[]; choice: MapChoice | null }>): MapResult {
    return Object.freeze({
      arm: this.arm,
      ...parts,
      marks: Object.freeze([...this.marks]),
      notes: Object.freeze([...this.notes]),
      calls: Object.freeze([...this.calls].sort((a, b) => a.order - b.order))
    });
  }

  mapUnavailable(angles: readonly MapAngle[], items: readonly MapItem[], detail: string): MapResult {
    this.marks.push(Object.freeze({ mark: "MAP_UNAVAILABLE_TODAYS_OPENING", step: "MAP", detail }));
    return this.mapResult({ kind: "UNAVAILABLE", angles, items, keyPoints: [], mergedAnswers: [], framingChallenges: [], choice: null });
  }
}

function mapDraftsOfList(assignment: MapListAssignment, reply: MapListLike, origin: MapItemOrigin): readonly MapItemDraft[] {
  const base = { seat: assignment.seat, origin, angleId: assignment.angle?.angleId ?? null,
    angleKind: assignment.angle?.kind ?? null, listIndex: assignment.listIndex };
  return [
    ...reply.points.map((point, position): MapItemDraft => Object.freeze({ ...base, position, kind: "POINT" as const,
      claim: point.claim, whyItMatters: point.why_it_matters, leans: point.leans })),
    ...reply.candidate_answers.map((answer, position): MapItemDraft => Object.freeze({ ...base, position, kind: "ANSWER" as const, answer }))
  ];
}

async function mapRunLists(run: MapRun, assignments: readonly MapListAssignment[]):
  Promise<readonly Readonly<{ assignment: MapListAssignment; reply: MapListReply | null }>[]> {
  return Promise.all(assignments.map(async (assignment) => ({
    assignment,
    reply: await run.mapAsk("LIST", `MAP:list:${String(assignment.listIndex)}`, assignment.seat, "BLIND", mapListSpec(run.ctx, assignment.angle))
  })));
}

const mapListLabel = (assignment: MapListAssignment): string => `${String(assignment.listIndex)}:${assignment.angle?.angleId ?? "open"}`;

async function mapMergeGapChoose(run: MapRun, order: readonly MapSeat[], angles: readonly MapAngle[], items: readonly MapItem[],
  listWriters: ReadonlySet<string>, premerged: MapMergedMap | null): Promise<MapResult> {
  let mergedBy: MapSeat | null = null;
  let merged: MapMergedMap;
  if (premerged !== null) {
    merged = premerged;
  } else {
    const merger = mapPickMerger(order, run.out);
    const reply = merger === null ? null
      : await run.mapAsk("MERGE", "MAP:merge", merger, items.map((item) => item.itemId).sort(), mapMergeSpec(run.ctx, items));
    if (reply === null) {
      merged = mapCodeMerge(items);
      run.marks.push(Object.freeze({ mark: "MAP_MERGE_FALLBACK", step: "MERGE", detail: merger === null ? "no seat to merge" : "merge reply missing" }));
    } else {
      mergedBy = merger;
      const applied = mapApplyMerge(reply, items);
      merged = Object.freeze({ keyPoints: applied.keyPoints, mergedAnswers: applied.mergedAnswers });
      if (applied.omittedItemIds.length > 0) run.mapNote("MERGE_ITEMS_KEPT", "MERGE", applied.omittedItemIds.join(","));
    }
  }

  let allItems: readonly MapItem[] = items;
  const challenges: string[] = [];
  const rounds = run.arm === "A" ? 0 : run.input.gapRoundsMax;
  for (let round = 1; round <= rounds; round += 1) {
    const seat = mapPickGapSeat(order, run.out, mergedBy, listWriters, round);
    if (seat === null) {
      run.mapNote("GAP_SKIPPED", "GAP", `round ${String(round)}: no seat`);
      break;
    }
    const shown = [...merged.keyPoints.map((keyPoint) => keyPoint.keyPointId), ...merged.mergedAnswers.map((answer) => answer.answerId)];
    const reply = await run.mapAsk("GAP", `MAP:gap:${String(round)}`, seat, shown, mapGapSpec(run.ctx, merged.keyPoints, merged.mergedAnswers));
    if (reply === null) {
      // A failed round is skipped and is not read by the stop rule (as ruled 2026-10-12).
      run.mapNote("GAP_SKIPPED", "GAP", `round ${String(round)}`);
      continue;
    }
    const drafts = reply.new_points.map((point, position): MapItemDraft => Object.freeze({ kind: "POINT" as const, seat, origin: "GAP" as const,
      angleId: null, angleKind: null, listIndex: 100 + round, position, claim: point.claim, whyItMatters: point.why_it_matters, leans: point.leans }));
    const gapItems = mapAssignItemIds(drafts, `${run.input.seed}|gap|${String(round)}`, mapNextItemNumbers(allItems))
      .filter((item): item is MapPointItem => item.kind === "POINT");
    allItems = Object.freeze([...allItems, ...gapItems]);
    const added = mapAddGapPoints(merged, allItems, gapItems);
    merged = added.map;
    challenges.push(...reply.framing_challenges);
    if (added.newKeyPoints < MAP_LIMITS.gapRoundNewPointsToContinue) {
      run.mapNote("GAP_STOPPED", "GAP", `round ${String(round)}: ${String(added.newKeyPoints)} new`);
      break;
    }
  }

  const chooser = mapPickChooser(order, run.out, mergedBy);
  const shown = [...merged.keyPoints.map((keyPoint) => keyPoint.keyPointId), ...merged.mergedAnswers.map((answer) => answer.answerId)];
  const reply = chooser === null ? null
    : await run.mapAsk("CHOOSE", "MAP:choose", chooser, shown, mapChooseSpec(run.ctx, merged.keyPoints, merged.mergedAnswers));
  const finished = mapFinishChoice({ reply, keyPoints: merged.keyPoints, mergedAnswers: merged.mergedAnswers, items: allItems,
    languageTag: run.input.languageTag, maxAnswers: run.input.maxAnswers, pointsPerAnswer: run.input.pointsPerAnswer });
  run.marks.push(...finished.marks);
  return run.mapResult({ kind: "MAP", angles, items: allItems, keyPoints: merged.keyPoints, mergedAnswers: merged.mergedAnswers,
    framingChallenges: Object.freeze(challenges), choice: finished.choice });
}

async function mapAfterLists(run: MapRun, order: readonly MapSeat[], angles: readonly MapAngle[],
  lists: readonly Readonly<{ assignment: MapListAssignment; reply: MapListLike }>[]): Promise<MapResult> {
  const items = mapAssignItemIds(lists.flatMap((entry) => mapDraftsOfList(entry.assignment, entry.reply, "BLIND")), run.input.seed);
  if (lists.length < 2) return run.mapUnavailable(angles, items, `${String(lists.length)} list(s) arrived`);
  return mapMergeGapChoose(run, order, angles, items, new Set(lists.map((entry) => entry.assignment.seat.aiRef)), null);
}

const mapArrived = (entries: readonly Readonly<{ assignment: MapListAssignment; reply: MapListReply | null }>[]) =>
  entries.flatMap((entry) => (entry.reply === null ? [] : [Object.freeze({ assignment: entry.assignment, reply: entry.reply })]));

/** Arm C, the angle map (spec §1, ruling S1): angle planner, blind angle lists in parallel, merge, gap rounds, choose. */
export async function mapRunAngleMap(input: MapRunInput): Promise<MapResult> {
  const run = new MapRun(input, "C");
  const order = input.seats;
  if (mapDistinctMakers(order) < 2) return run.mapUnavailable([], [], "fewer than two makers");
  const planner = mapPickPlanner(order, run.out);
  const planned = planner === null ? null : await run.mapAsk("ANGLES", "MAP:angles", planner, "BLIND", mapAnglesSpec(run.ctx));
  let angles: readonly MapAngle[];
  if (planned === null) {
    angles = MAP_FALLBACK_ANGLES;
    run.marks.push(Object.freeze({ mark: "MAP_ANGLES_FALLBACK", step: "ANGLES", detail: planner === null ? "no seat to plan" : "angles reply missing" }));
  } else {
    angles = mapOrderAngles(planned);
  }
  const first = await mapRunLists(run, mapListAssignments(angles, order, run.out));
  const failed = first.filter((entry) => entry.reply === null).map((entry) => entry.assignment);
  const finished = first.filter((entry) => entry.reply !== null).map((entry) => entry.assignment.seat);
  const reassigned = mapReassignLists(failed, finished, run.out);
  for (const assignment of reassigned) run.mapNote("LIST_REASSIGNED", "LIST", mapListLabel(assignment));
  for (const assignment of failed.slice(reassigned.length)) run.mapNote("LIST_DROPPED", "LIST", mapListLabel(assignment));
  const second = await mapRunLists(run, reassigned);
  for (const entry of second) if (entry.reply === null) run.mapNote("LIST_DROPPED", "LIST", mapListLabel(entry.assignment));
  return mapAfterLists(run, order, angles, [...mapArrived(first), ...mapArrived(second)]);
}

/** Arm B (Phase 1 comparison only): every AI lists with no angle, blind; then merge, one gap round, choose. */
export async function mapRunBlindLists(input: MapRunInput): Promise<MapResult> {
  const run = new MapRun(input, "B");
  if (mapDistinctMakers(input.seats) < 2) return run.mapUnavailable([], [], "fewer than two makers");
  const assignments = input.seats.filter((seat) => !run.out.has(seat.aiRef))
    .map((seat, index): MapListAssignment => Object.freeze({ listIndex: index, seat, angle: null }));
  const done = await mapRunLists(run, assignments);
  for (const entry of done) if (entry.reply === null) run.mapNote("LIST_DROPPED", "LIST", mapListLabel(entry.assignment));
  return mapAfterLists(run, input.seats, [], mapArrived(done));
}

/**
 * Arm A (Phase 1 comparison only): AI 1 lists points blind; each next AI sees the points so far and adds only new
 * ones; then the same choose step (as ruled 2026-10-12, so every map arm ends in chosen answers). No merge, no gap.
 */
export async function mapRunSnowball(input: MapRunInput): Promise<MapResult> {
  const run = new MapRun(input, "A");
  if (mapDistinctMakers(input.seats) < 2) return run.mapUnavailable([], [], "fewer than two makers");
  let items: readonly MapItem[] = [];
  const writers = new Set<string>();
  for (const [index, seat] of input.seats.entries()) {
    if (run.out.has(seat.aiRef)) continue;
    const assignment: MapListAssignment = Object.freeze({ listIndex: index, seat, angle: null });
    const pointsSoFar = items.filter((item): item is MapPointItem => item.kind === "POINT");
    const firstList = writers.size === 0;
    const reply: MapListLike | null = firstList
      ? await run.mapAsk("LIST", `MAP:list:${String(index)}`, seat, "BLIND", mapListSpec(run.ctx, null))
      : await run.mapAsk("SNOWBALL", `MAP:list:${String(index)}`, seat, pointsSoFar.map((point) => point.itemId).sort(),
        mapSnowballSpec(run.ctx, pointsSoFar));
    if (reply === null) {
      run.mapNote("LIST_DROPPED", "LIST", mapListLabel(assignment));
      continue;
    }
    writers.add(seat.aiRef);
    items = Object.freeze([...items, ...mapAssignItemIds(mapDraftsOfList(assignment, reply, firstList ? "BLIND" : "SHOWN"),
      `${input.seed}|snowball|${String(index)}`, mapNextItemNumbers(items))]);
  }
  if (writers.size < 2) return run.mapUnavailable([], items, `${String(writers.size)} list(s) arrived`);
  return mapMergeGapChoose(run, input.seats, [], items, writers, mapSingletonMap(items));
}
```

Add to `packages/map/src/index.ts`:

```ts
export * from "./orchestrator.js";
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm exec vitest run tests/unit/map-orchestrator.test.ts`
Expected: PASS (14 tests).

Then run the whole map suite once, as the package's own regression:

```sh
pnpm exec vitest run tests/unit/map-package.test.ts tests/unit/map-items.test.ts tests/unit/map-prompts.test.ts tests/unit/map-replies.test.ts tests/unit/map-specs.test.ts tests/unit/map-keypoints.test.ts tests/unit/map-choose.test.ts tests/unit/map-roles.test.ts tests/unit/map-orchestrator.test.ts
```

Expected: all 9 files PASS.

- [ ] **Step 5: Commit**

```sh
git add packages/map/src/orchestrator.ts packages/map/src/index.ts tests/unit/map-orchestrator.test.ts
git commit -F - <<'MSG'
Map: the three opening orchestrators over an injected caller

Arm C (angle map: planner, parallel angle lists, merge, gap rounds, choose), arm B (blind lists, merge, one gap round,
choose) and arm A (snowball, then choose). Calls carry the spec's call-site keys and their plan position, so the
record never depends on finish order; a busy AI sits out the rest of the map; every fallback of spec §1.2 is applied
and recorded. The model is reached only through MapCaller, which Phase 2's runner provides on its scheduler lane.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 10: Practice openings: the 12 fixed questions, `openings.jsonl`, and the report

**Files:**
- Create: `tools/preview-practice/practice-openings-questions.ts`, `tools/preview-practice/practice-openings-log.ts`
- Modify: `tools/preview-practice/practice-report.ts`:
  - add `export` to `usd` (line 60), `gateHalted` (92), `gateStopped` (102) and `gatePauses` (110);
  - add the per-arm block to `reportMarkdown`, before the `const cache = report.cacheByModel` line (404).
- Test: `tests/unit/practice-openings-log.test.ts`

**Interfaces:**
- Consumes: `MapMarkRecord`, `MapNoteRecord`, `MapResult`, `MapStep` (`@debateai/map`). From the practice tool:
  - `PracticeAttempt` (practice-formats.ts);
  - `PracticeGateObserver` and its types;
  - `practiceVerdict`, `practiceModelCalls`, `practiceRepairKindsByModel`, `latencySummary`, `PracticeReplyForm` (practice-verdict.ts);
  - `PRACTICE_LOG_HAS_NO_END`, `PracticeRemainingLine` (practice-samples-log.ts);
  - `PracticeRefusal` (practice-settings.ts).
- Produces:
  - `OPENINGS_QUESTIONS: readonly OpeningsQuestion[]`, `type OpeningsQuestion = Readonly<{ id: string; questionLine: string; languageName: "Romanian" | "English"; languageTag: "ro" | "en"; category: OpeningsCategory }>`
  - `OPENINGS_ARMS = ["T","A","B","C"]`, `type OpeningsArm`
  - `openingsQuestionsFromFlag(value: string | undefined): readonly OpeningsQuestion[]`, `openingsArmsFromFlag(value: string | undefined): readonly OpeningsArm[]`
  - `OPENINGS_SCHEMA`, `OPENINGS_FILE = "openings.jsonl"`, `type OpeningsStep = MapStep | "POSITION"`, `type OpeningsCallStatus`, `type OpeningsCall`, `type OpeningsArmLine`, `type OpeningsBusyWait`, `type OpeningsLogLine`
  - `class OpeningsLog { static create(directory: string): OpeningsLog; readonly path: string; append(line: OpeningsLogLine): void; close(): void }`
  - `parseOpeningsLog(text: string): readonly OpeningsLogLine[]`, `readOpeningsLog(directory: string): readonly OpeningsLogLine[]`
  - `openingsReportFromLog(lines: readonly OpeningsLogLine[], abort?: Readonly<{ code: string; at: Date }> | null): PracticeReport`

The report uses the tool's verdict table unchanged (exit codes 0/10/20/30/40/50). An openings call that ends without an accepted reply because of its format is `FORMAT_FAILED` (FAIL), as a format failure is in formats mode. A fallback that the map applied after such a failure is information only: it is counted per arm, never a verdict reason. The report holds counts, cost, time, slips, fallbacks and notes. It holds no quality figure.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/practice-openings-log.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectArgumentLanguage } from "@debateai/kernel";
import {
  OPENINGS_ARMS,
  OPENINGS_QUESTIONS,
  openingsArmsFromFlag,
  openingsQuestionsFromFlag
} from "../../tools/preview-practice/practice-openings-questions.js";
import {
  OPENINGS_FILE,
  OPENINGS_SCHEMA,
  OpeningsLog,
  openingsReportFromLog,
  parseOpeningsLog,
  readOpeningsLog,
  type OpeningsArmLine,
  type OpeningsCall,
  type OpeningsLogLine
} from "../../tools/preview-practice/practice-openings-log.js";
import { reportMarkdown } from "../../tools/preview-practice/practice-report.js";
import { reportableReplyText } from "../../tools/preview-practice/practice-redaction.js";

const T0 = "2026-10-12T10:00:00.000Z";
const T1 = "2026-10-12T10:00:02.000Z";
const call = (overrides: Partial<OpeningsCall> = {}): OpeningsCall => ({
  arm: "C", questionId: "ro-euro", step: "LIST", callSiteKey: "MAP:list:0", aiRef: "ref-1", model: "m-1", maker: "maker-1",
  gate: "deepinfra", shown: "BLIND", order: 1, startedAt: T0, finishedAt: T1, latencyMs: 1_000, inputTokens: 100, outputTokens: 50,
  reasoningTokens: null, cachedInputTokens: null, costNanoUsd: "1000", status: "ACCEPTED", errorCode: null,
  attempts: [{ callSiteKey: "MAP:list:0", outcome: "OK", parseStatus: "PARSED", latencyMs: 1_000, jsonRepair: null, replyForm: "ORIGINAL" }],
  replyForm: "ORIGINAL", replyText: "REPLY-TEXT-NEVER-IN-MARKDOWN", ...overrides });
const armLine: OpeningsArmLine = { arm: "C", questionId: "ro-euro", startedAt: T0, finishedAt: T1, outcome: "MAP", positions: 0,
  marks: [{ mark: "ANSWERS_FILLED", step: "CHOOSE", detail: "TEMPLATE" }], notes: [{ note: "GAP_STOPPED", step: "GAP", detail: "round 1: 1 new" }], map: null };
const start: OpeningsLogLine = { kind: "start", schema: OPENINGS_SCHEMA, mode: "openings", dry: true, startedAt: T0, models: ["m-1", "m-2"],
  questions: ["ro-euro"], arms: ["C"], busyWaitMs: 0, unsentStreakAtStart: { deepinfra: 0, anthropic: 0 },
  remainingBefore: { deepinfra: null, anthropic: null } };
const end: OpeningsLogLine = { kind: "end", finishedAt: T1, interrupted: false, remainingAfter: { deepinfra: null, anthropic: null } };
const twoCalls: OpeningsLogLine[] = [start, { kind: "call", call: call() }, { kind: "call", call: call({ model: "m-2", aiRef: "ref-2", order: 2 }) },
  { kind: "arm", arm: armLine }, end];

describe("practice openings: the fixed questions", () => {
  it("has 12 questions: 6 Romanian, 6 English, every kind of question, unique ids", () => {
    expect(OPENINGS_QUESTIONS).toHaveLength(12);
    expect(OPENINGS_QUESTIONS.filter((question) => question.languageTag === "ro")).toHaveLength(6);
    expect(OPENINGS_QUESTIONS.filter((question) => question.languageTag === "en")).toHaveLength(6);
    expect(new Set(OPENINGS_QUESTIONS.map((question) => question.id)).size).toBe(12);
    expect([...new Set(OPENINGS_QUESTIONS.map((question) => question.category))].sort())
      .toEqual(["CONTESTED_FACT", "ETHICS", "HEALTH_PRACTICAL", "PERSONAL_DECISION", "PUBLIC_POLICY"]);
  });

  it("each question is read by the engine's detector as the language it claims", () => {
    for (const question of OPENINGS_QUESTIONS) {
      expect(`${question.id}:${detectArgumentLanguage(question.questionLine).tag}`).toBe(`${question.id}:${question.languageTag}`);
      expect(question.languageName).toBe(question.languageTag === "ro" ? "Romanian" : "English");
    }
  });
});

describe("practice openings: --questions and --arms select, never carry text", () => {
  it("selects fixed questions in their fixed order", () => {
    expect(openingsQuestionsFromFlag(undefined)).toHaveLength(12);
    expect(openingsQuestionsFromFlag("en-rent-caps,ro-euro").map((question) => question.id)).toEqual(["ro-euro", "en-rent-caps"]);
  });

  it("refuses anything that is not a fixed id, without repeating it", () => {
    for (const value of ["Should I lie to my boss?", "ro-euro,ro-euro", "", " , "]) {
      let caught: unknown = null;
      try { openingsQuestionsFromFlag(value); } catch (error) { caught = error; }
      expect((caught as { code?: string }).code).toBe("PRACTICE_FLAG_VALUE_INVALID");
      expect(String((caught as Error).message)).not.toContain("lie to my boss");
    }
  });

  it("selects arms in the order T, A, B, C, and refuses an unknown arm", () => {
    expect(openingsArmsFromFlag(undefined)).toEqual([...OPENINGS_ARMS]);
    expect(openingsArmsFromFlag("C,T")).toEqual(["T", "C"]);
    expect(() => openingsArmsFromFlag("X")).toThrow("PRACTICE_FLAG_VALUE_INVALID");
  });
});

describe("practice openings: openings.jsonl", () => {
  const folders: string[] = [];
  afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
  const fresh = () => { const folder = mkdtempSync(join(tmpdir(), "pp-openings-log-")); folders.push(folder); return folder; };

  it("writes one line per entry, and refuses a folder that already holds a log", () => {
    const folder = fresh();
    const log = OpeningsLog.create(folder);
    for (const line of twoCalls) log.append(line);
    log.close();
    expect(readOpeningsLog(folder).map((line) => line.kind)).toEqual(["start", "call", "call", "arm", "end"]);
    expect(() => OpeningsLog.create(folder)).toThrow("PRACTICE_OUT_ALREADY_HOLDS_OPENINGS");
  });

  it("leaves out a last line cut short, and refuses any other bad line", () => {
    const text = `${twoCalls.map((line) => JSON.stringify(line)).join("\n")}\n{"kind":"ca`;
    expect(parseOpeningsLog(text)).toHaveLength(5);
    expect(() => parseOpeningsLog(`${JSON.stringify(start)}\nnot json\n${JSON.stringify(end)}\n`)).toThrow("PRACTICE_OPENINGS_LOG_INVALID");
    const folder = fresh();
    writeFileSync(join(folder, OPENINGS_FILE), `${JSON.stringify({ kind: "start", schema: "other" })}\n`);
    expect(() => readOpeningsLog(folder)).toThrow("PRACTICE_OPENINGS_LOG_INVALID");
  });
});

describe("practice openings: the report", () => {
  it("passes when every call was accepted; counts per arm; no reply text in report.md", () => {
    const report = openingsReportFromLog(twoCalls);
    expect([report.verdict, report.exitCode]).toEqual(["PASS", 0]);
    const byArm = report.byArm as readonly Record<string, unknown>[];
    expect(Object.keys(byArm[0]!)).toEqual(["arm", "questions", "calls", "statuses", "byStep", "inputTokens", "outputTokens",
      "reasoningTokens", "costUsd", "wallSeconds", "unavailable", "marks", "notes"]);
    expect(byArm[0]).toMatchObject({ arm: "C", questions: 1, calls: 2, costUsd: "0.000002000", wallSeconds: 2,
      marks: { ANSWERS_FILLED: 1 }, notes: { GAP_STOPPED: 1 } });
    const markdown = reportMarkdown(report);
    expect(markdown).toContain("Openings per arm");
    expect(markdown).not.toContain("REPLY-TEXT-NEVER-IN-MARKDOWN");
  });

  it("fails on a call that never got a reply in the right format (FORMAT_FAILED)", () => {
    const bad = call({ status: "FORMAT_FAILED", errorCode: "PROVIDER_CONTENT_UNACCEPTED", replyForm: null, attempts: [
      { callSiteKey: "MAP:merge", outcome: "FAILED", parseStatus: "SCHEMA_FAILED", latencyMs: 900, jsonRepair: null, replyForm: "ORIGINAL" },
      { callSiteKey: "MAP:merge", outcome: "FAILED", parseStatus: "SCHEMA_FAILED", latencyMs: 900, jsonRepair: null, replyForm: "PATCH" }] });
    const report = openingsReportFromLog([start, { kind: "call", call: call() }, { kind: "call", call: { ...bad, model: "m-2" } }, end]);
    expect([report.verdict, report.exitCode]).toEqual(["FAIL", 20]);
    expect(report.reasons).toContain("FORMAT_FAILED:1");
  });

  it("is ABORTED when the run did not reach its end", () => {
    expect(openingsReportFromLog([start, { kind: "call", call: call() }]).reasons[0]).toBe("ABORTED:PRACTICE_LOG_HAS_NO_END");
    expect(openingsReportFromLog([start], { code: "OPERATOR_SECOND_INTERRUPT", at: new Date(T1) }).exitCode).toBe(50);
  });

  it("keeps the map's short ids through the reply redaction", () => {
    const reply = "{\"key_points\":[{\"key_point_id\":\"k1\",\"claim\":\"Cost\",\"member_item_ids\":[\"pt01\",\"pt12\"]}],\"answers\":[]}";
    expect(reportableReplyText(reply)).toBe(reply);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run tests/unit/practice-openings-log.test.ts`
Expected: FAIL (cannot resolve `../../tools/preview-practice/practice-openings-questions.js`).

- [ ] **Step 3: Implement**

Create `tools/preview-practice/practice-openings-questions.ts`:

```ts
/**
 * Preview practice, mode "openings": the fixed questions and the arms.
 *
 * Plain words: the openings comparison (spec 2026-10-12 §2) asks the same 12 questions of the same AIs four ways. The
 * questions are our own, fixed here, plain and neutral; never read from the command line. --questions and --arms only
 * choose among these fixed ids and arm letters: anything else is refused, and the refusal never repeats what was typed.
 */
import { PracticeRefusal } from "./practice-settings.js";

export type OpeningsCategory = "PUBLIC_POLICY" | "ETHICS" | "HEALTH_PRACTICAL" | "PERSONAL_DECISION" | "CONTESTED_FACT";

export type OpeningsQuestion = Readonly<{
  id: string;
  questionLine: string;
  /** detectArgumentLanguage's English name. */
  languageName: "Romanian" | "English";
  languageTag: "ro" | "en";
  category: OpeningsCategory;
}>;

const ro = (id: string, category: OpeningsCategory, questionLine: string): OpeningsQuestion =>
  Object.freeze({ id, questionLine, languageName: "Romanian", languageTag: "ro", category });
const en = (id: string, category: OpeningsCategory, questionLine: string): OpeningsQuestion =>
  Object.freeze({ id, questionLine, languageName: "English", languageTag: "en", category });

export const OPENINGS_QUESTIONS: readonly OpeningsQuestion[] = Object.freeze([
  ro("ro-euro", "PUBLIC_POLICY", "Ar trebui România să adopte moneda euro în următorii cinci ani?"),
  ro("ro-autobuze", "PUBLIC_POLICY", "Ar trebui un oraș de mărime medie să facă gratuite liniile centrale de autobuz?"),
  ro("ro-final-viata", "ETHICS", "Ar trebui să fie legal ca un adult cu o boală incurabilă să ceară ajutor medical pentru a-și încheia viața?"),
  ro("ro-ciuperci", "HEALTH_PRACTICAL", "Copilul meu de doi ani a mâncat o bucată dintr-o ciupercă găsită în parc și pare bine. Ce ar trebui să fac acum?"),
  ro("ro-strainatate", "PERSONAL_DECISION", "Merită să mă mut în străinătate pentru un salariu de două ori mai mare, dacă familia mea rămâne în România?"),
  ro("ro-hpv", "CONTESTED_FACT", "Este adevărat că vaccinul HPV reduce riscul de cancer de col uterin pentru femeile vaccinate în adolescență?"),
  en("en-nuclear", "CONTESTED_FACT", "Is new nuclear power cheaper than wind and solar with storage for cutting a country's emissions?"),
  en("en-four-day-week", "PUBLIC_POLICY", "Should companies move to a four-day work week with the same pay?"),
  en("en-phones-school", "PUBLIC_POLICY", "Should schools ban students' phones for the whole school day?"),
  en("en-retirement-age", "PUBLIC_POLICY", "Should the state retirement age rise to 67 as people live longer?"),
  en("en-social-media-age", "ETHICS", "Should children under 16 be banned from having social media accounts?"),
  en("en-rent-caps", "CONTESTED_FACT", "Do rent caps help tenants more than they harm the supply of housing?")
]);

export const OPENINGS_ARMS = Object.freeze(["T", "A", "B", "C"] as const);
/** T: today's opening. A: snowball. B: blind lists. C: the angle map. */
export type OpeningsArm = typeof OPENINGS_ARMS[number];

function openingsIds(value: string): readonly string[] | null {
  const ids = value.split(",").map((id) => id.trim()).filter((id) => id !== "");
  return ids.length === 0 || new Set(ids).size !== ids.length ? null : ids;
}

/** The questions a run asks: all twelve, or the fixed ids named (in the fixed order). */
export function openingsQuestionsFromFlag(value: string | undefined): readonly OpeningsQuestion[] {
  if (value === undefined) return OPENINGS_QUESTIONS;
  const ids = openingsIds(value);
  if (ids === null || ids.some((id) => !OPENINGS_QUESTIONS.some((question) => question.id === id))) {
    throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--questions (only the fixed question ids, comma-separated, each once)");
  }
  return Object.freeze(OPENINGS_QUESTIONS.filter((question) => ids.includes(question.id)));
}

/** The arms a run uses: all four, or the letters named (in the order T, A, B, C). */
export function openingsArmsFromFlag(value: string | undefined): readonly OpeningsArm[] {
  if (value === undefined) return OPENINGS_ARMS;
  const ids = openingsIds(value);
  if (ids === null || ids.some((id) => !(OPENINGS_ARMS as readonly string[]).includes(id))) {
    throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--arms (only T, A, B, C, comma-separated, each once)");
  }
  return Object.freeze(OPENINGS_ARMS.filter((arm) => ids.includes(arm)));
}
```

Create `tools/preview-practice/practice-openings-log.ts`:

```ts
/**
 * Preview practice, mode "openings": openings.jsonl, so no finished reply is ever lost, and the report built from it.
 *
 * Plain words: the moment a call finishes, one line about it goes to openings.jsonl and is pushed to the disk: which
 * arm and question, which step, which AI and maker, exactly what it could see (BLIND, or the ids it was shown), its
 * place in the plan, its times, tokens, cost, format check and how it was fixed, and its reply (key-shaped strings
 * blanked, at most 64 KiB). After each arm of each question one line holds the map that came out (or the positions
 * count for today's opening). The gates' watch adds one line per gate call. report.json and report.md are built from
 * these lines at the end and on every other way out. They hold counts, cost, time, slips, fallbacks and notes only:
 * the comparison of the openings is the owners' own method, outside this repository.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import type { MapMarkRecord, MapNoteRecord, MapResult, MapStep } from "@debateai/map";
import type { PracticeAttempt } from "./practice-formats.js";
import { PracticeGateObserver, type PracticeGateName, type PracticeGateStop, type PracticeWireEvent } from "./practice-gate-observer.js";
import type { OpeningsArm } from "./practice-openings-questions.js";
import { gateHalted, gatePauses, gateStopped, PRACTICE_REPORT_SCHEMA, usd, type PracticeReport } from "./practice-report.js";
import { PRACTICE_LOG_HAS_NO_END, type PracticeRemainingLine } from "./practice-samples-log.js";
import { latencySummary, practiceModelCalls, practiceRepairKindsByModel, practiceVerdict, type PracticeReplyForm } from "./practice-verdict.js";

export const OPENINGS_SCHEMA = "preview-practice-openings-v1" as const;
export const OPENINGS_FILE = "openings.jsonl" as const;
const OPENINGS_GATES: readonly PracticeGateName[] = ["deepinfra", "anthropic"];

/** A map step, or POSITION: today's opening (arm T), one full position per AI. */
export type OpeningsStep = MapStep | "POSITION";

/**
 * ACCEPTED: the first reply passed. REPAIRED: a later try of the same call fixed a slip (a warning). FORMAT_FAILED: no
 * accepted reply after the tries, because of its format (FAIL). CALL_FAILED: any other failure. BUSY: the call ended in
 * the vendor's unbilled refusal and the model's wait budget is spent. SKIPPED_*: nothing was sent.
 */
export type OpeningsCallStatus = "ACCEPTED" | "REPAIRED" | "FORMAT_FAILED" | "CALL_FAILED" | "BUSY" | "SKIPPED_MODEL_BUSY" | "SKIPPED_STOPPED";

export type OpeningsCall = Readonly<{
  arm: OpeningsArm;
  questionId: string;
  step: OpeningsStep;
  callSiteKey: string;
  aiRef: string;
  model: string;
  maker: string;
  gate: PracticeGateName;
  /** BLIND, or the ids of exactly what it was shown. */
  shown: "BLIND" | readonly string[];
  /** Its plan position within the arm. */
  order: number;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
  costNanoUsd: string | null;
  status: OpeningsCallStatus;
  errorCode: string | null;
  attempts: readonly PracticeAttempt[];
  /** The accepted try's form: ORIGINAL, PATCH (the short follow-up) or FULL (the full re-ask); null without one. */
  replyForm: PracticeReplyForm | null;
  /** The last reply's text (accepted or refused), key-shaped strings blanked, at most 64 KiB; null when none came. */
  replyText: string | null;
}>;

export type OpeningsArmLine = Readonly<{
  arm: OpeningsArm;
  questionId: string;
  startedAt: string;
  finishedAt: string;
  /** MAP or UNAVAILABLE (arms A, B, C); POSITIONS (arm T). */
  outcome: "MAP" | "UNAVAILABLE" | "POSITIONS";
  /** Arm T: positions written. */
  positions: number;
  marks: readonly MapMarkRecord[];
  notes: readonly MapNoteRecord[];
  /** The map without its call records (each call has its own line). */
  map: Omit<MapResult, "calls"> | null;
}>;

export type OpeningsBusyWait = Readonly<{
  model: string; arm: OpeningsArm; questionId: string; callSiteKey: string;
  /** This model's waits so far, this one included. */
  wait: number;
  waitMs: number;
  reason: "VENDOR_REFUSED" | "MODEL_COOLING";
  retryAfterSeconds: number | null;
}>;

export type OpeningsLogLine =
  | Readonly<{ kind: "start"; schema: typeof OPENINGS_SCHEMA; mode: "openings"; dry: boolean; startedAt: string;
    models: readonly string[]; questions: readonly string[]; arms: readonly OpeningsArm[]; busyWaitMs: number;
    unsentStreakAtStart: Readonly<Record<PracticeGateName, number>>;
    remainingBefore: Readonly<Record<PracticeGateName, PracticeRemainingLine | null>> }>
  | Readonly<{ kind: "wire"; event: PracticeWireEvent }>
  | Readonly<{ kind: "stop"; stop: PracticeGateStop }>
  | Readonly<{ kind: "call"; call: OpeningsCall }>
  | Readonly<{ kind: "arm"; arm: OpeningsArmLine }>
  | Readonly<{ kind: "busy"; model: string }>
  | (Readonly<{ kind: "busy-wait" }> & OpeningsBusyWait)
  | Readonly<{ kind: "end"; finishedAt: string; interrupted: boolean;
    remainingAfter: Readonly<Record<PracticeGateName, PracticeRemainingLine | null>> }>
  | Readonly<{ kind: "abort"; at: string; code: string }>;

const OPENINGS_LINE_KINDS: readonly string[] = ["start", "wire", "stop", "call", "arm", "busy", "busy-wait", "end", "abort"];

/** Appends one line at a time and pushes each to the disk before returning. One writer per log. */
export class OpeningsLog {
  readonly path: string;
  #fd: number | null;

  private constructor(path: string, fd: number) {
    this.path = path;
    this.#fd = fd;
  }

  /** Opens a NEW log in the folder (made private if missing); a folder that already holds one is refused. */
  static create(directory: string): OpeningsLog {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, OPENINGS_FILE);
    let fd: number;
    try { fd = openSync(path, "ax", 0o600); } catch (error) {
      if ((error as { code?: unknown }).code === "EEXIST") throw new Error("PRACTICE_OUT_ALREADY_HOLDS_OPENINGS");
      throw error;
    }
    return new OpeningsLog(path, fd);
  }

  append(line: OpeningsLogLine): void {
    if (this.#fd === null) return;
    writeSync(this.#fd, `${JSON.stringify(line)}\n`);
    fsyncSync(this.#fd);
  }

  close(): void {
    if (this.#fd === null) return;
    const fd = this.#fd;
    this.#fd = null;
    closeSync(fd);
  }
}

/** The log's lines. A last line cut short is left out; any other unreadable line refuses the whole log. */
export function parseOpeningsLog(text: string): readonly OpeningsLogLine[] {
  const raw = text.split("\n");
  if (raw.at(-1) === "") raw.pop();
  const lines: OpeningsLogLine[] = [];
  for (const [index, entry] of raw.entries()) {
    let parsed: unknown;
    try { parsed = JSON.parse(entry); } catch {
      if (index === raw.length - 1) break;
      throw new Error("PRACTICE_OPENINGS_LOG_INVALID");
    }
    const kind = typeof parsed === "object" && parsed !== null ? (parsed as { kind?: unknown }).kind : undefined;
    if (!OPENINGS_LINE_KINDS.includes(String(kind))) throw new Error("PRACTICE_OPENINGS_LOG_INVALID");
    lines.push(parsed as OpeningsLogLine);
  }
  const start = lines.find((line) => line.kind === "start");
  if (start === undefined || start.kind !== "start" || start.schema !== OPENINGS_SCHEMA) throw new Error("PRACTICE_OPENINGS_LOG_INVALID");
  return Object.freeze(lines);
}

export function readOpeningsLog(directory: string): readonly OpeningsLogLine[] {
  const path = join(directory, OPENINGS_FILE);
  if (!existsSync(path)) throw new Error("PRACTICE_OPENINGS_LOG_MISSING");
  return parseOpeningsLog(readFileSync(path, "utf8"));
}

function openingsCount(values: readonly string[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return Object.freeze(out);
}

const openingsAnswered = (call: OpeningsCall): boolean => call.status === "ACCEPTED" || call.status === "REPAIRED";

/**
 * The report from the log alone, with the tool's own verdict (practice-verdict.ts): a log with an end line gives the
 * run's own verdict; one with an abort line, or neither, gives ABORTED with every other rule listed after it.
 */
export function openingsReportFromLog(lines: readonly OpeningsLogLine[], abort: Readonly<{ code: string; at: Date }> | null = null): PracticeReport {
  const start = lines.find((line) => line.kind === "start");
  if (start === undefined || start.kind !== "start") throw new Error("PRACTICE_OPENINGS_LOG_INVALID");
  const end = lines.find((line) => line.kind === "end");
  const abortLine = lines.find((line) => line.kind === "abort");
  const played = lines.flatMap((line): ({ event: PracticeWireEvent } | { stop: PracticeGateStop })[] =>
    line.kind === "wire" ? [{ event: line.event }] : line.kind === "stop" ? [{ stop: line.stop }] : []);
  const observer = PracticeGateObserver.replay(played, { unsentStreakAtStart: start.unsentStreakAtStart });
  const calls = lines.flatMap((line) => (line.kind === "call" ? [line.call] : []));
  const armLines = lines.flatMap((line) => (line.kind === "arm" ? [line.arm] : []));
  const busy = [...new Set(lines.flatMap((line) => (line.kind === "busy" ? [line.model] : [])))];
  const tries = calls.filter((call) => call.attempts.length > 0).map((call) => Object.freeze({ model: call.model, tries: call.attempts }));
  const callsByModel = practiceModelCalls(tries);
  const busyRuns = Object.fromEntries(busy.map((model) => {
    const mine = calls.filter((call) => call.model === model);
    const answered = mine.filter(openingsAnswered).length;
    return [model, Object.freeze({ answered, skipped: mine.length - answered })];
  }));
  const answeredModels = new Set(calls.filter(openingsAnswered).map((call) => call.model));
  const abortCode = abort?.code ?? (abortLine?.kind === "abort" ? abortLine.code : end === undefined ? PRACTICE_LOG_HAS_NO_END : null);
  const finishedAt = end?.kind === "end" ? new Date(end.finishedAt)
    : abort !== null ? abort.at : abortLine?.kind === "abort" ? new Date(abortLine.at) : new Date();
  const after = end?.kind === "end" ? end.remainingAfter : null;
  const p90ByModel: Record<string, number> = {};
  for (const model of new Set(calls.map((call) => call.model))) {
    const p90 = latencySummary(calls.filter((call) => call.model === model).flatMap((call) => call.attempts.map((attempt) => attempt.latencyMs))).p90;
    if (p90 !== null) p90ByModel[model] = p90;
  }
  const formatFailures = calls.filter((call) => call.status === "FORMAT_FAILED").length;
  const failedCalls = calls.filter((call) => call.status === "CALL_FAILED").length;
  const verdict = practiceVerdict({
    harnessError: null,
    completed: true,
    interrupted: end?.kind === "end" ? end.interrupted : false,
    aborted: abortCode,
    servedAnswer: null,
    storyOutcome: null,
    formatFailures,
    callsByModel,
    busyRuns,
    failedCalls,
    gateHalted: gateHalted(observer, after === null ? null : { deepinfra: after.deepinfra, anthropic: after.anthropic }),
    gateStopped: gateStopped(observer),
    gatePauses: gatePauses(observer),
    notExercisedModels: start.models.filter((model) => !answeredModels.has(model) && !busy.includes(model)),
    busyModels: busy,
    unbilledRefusals: OPENINGS_GATES.reduce((sum, gate) => sum + observer.summary(gate).unbilled, 0),
    p90ByModel
  });
  const nano = (rows: readonly OpeningsCall[]) => rows.reduce((sum, call) => sum + BigInt(call.costNanoUsd ?? "0"), 0n);
  const tokens = (rows: readonly OpeningsCall[], pick: (call: OpeningsCall) => number | null) => rows.reduce((sum, call) => sum + (pick(call) ?? 0), 0);
  const byArm = start.arms.map((arm) => {
    const mine = calls.filter((call) => call.arm === arm);
    const lines_ = armLines.filter((line) => line.arm === arm);
    return Object.freeze({
      arm,
      questions: lines_.length,
      calls: mine.length,
      statuses: openingsCount(mine.map((call) => call.status)),
      byStep: openingsCount(mine.map((call) => call.step)),
      inputTokens: tokens(mine, (call) => call.inputTokens),
      outputTokens: tokens(mine, (call) => call.outputTokens),
      reasoningTokens: tokens(mine, (call) => call.reasoningTokens),
      costUsd: usd(nano(mine)),
      wallSeconds: Math.round(lines_.reduce((sum, line) => sum + (Date.parse(line.finishedAt) - Date.parse(line.startedAt)), 0) / 1_000),
      unavailable: lines_.filter((line) => line.outcome === "UNAVAILABLE").length,
      marks: openingsCount(lines_.flatMap((line) => line.marks.map((mark) => mark.mark))),
      notes: openingsCount(lines_.flatMap((line) => line.notes.map((note) => note.note)))
    });
  });
  return Object.freeze({
    schema: PRACTICE_REPORT_SCHEMA, mode: "openings", dry: start.dry, ...verdict,
    startedAt: start.startedAt, finishedAt: finishedAt.toISOString(),
    wallSeconds: Math.round((finishedAt.getTime() - Date.parse(start.startedAt)) / 1_000),
    models: start.models, questions: start.questions, arms: start.arms, busyModels: busy,
    callsByModel, repairKindsByModel: practiceRepairKindsByModel(tries),
    byArm,
    gates: Object.fromEntries(OPENINGS_GATES.map((gate) => [gate, Object.freeze({ observed: observer.summary(gate),
      remainingBefore: start.remainingBefore[gate], remainingAfter: after?.[gate] ?? null })])),
    totals: Object.freeze({
      calls: calls.length,
      costUsd: usd(nano(calls)),
      formatFailures,
      failedCalls,
      formatRepaired: Object.values(callsByModel).reduce((sum, mine) => sum + mine.repaired, 0),
      marks: armLines.reduce((sum, line) => sum + line.marks.length, 0),
      notes: armLines.reduce((sum, line) => sum + line.notes.length, 0)
    }),
    failures: calls.filter((call) => call.status === "FORMAT_FAILED" || call.status === "CALL_FAILED")
  });
}
```

In `tools/preview-practice/practice-report.ts`:
- Change `function usd(` to `export function usd(`.
- Change `function gateHalted(` to `export function gateHalted(`.
- Change `function gateStopped(` to `export function gateStopped(`.
- Change `function gatePauses(` to `export function gatePauses(`.
- In `reportMarkdown`, insert right before `const cache = report.cacheByModel ...`:

```ts
  const byArm = report.byArm as readonly Readonly<{ arm: string; questions: number; calls: number; costUsd: string; wallSeconds: number;
    unavailable: number; statuses: Record<string, number>; marks: Record<string, number>; notes: Record<string, number> }>[] | undefined;
  if (byArm !== undefined && byArm.length > 0) {
    lines.push("Openings per arm (counts, cost and time only; T today's opening, A snowball, B blind lists, C angle map):", "",
      "| arm | questions | calls | statuses | cost $ | time s | map unavailable | marks | notes |", "|---|---|---|---|---|---|---|---|---|");
    for (const row of byArm) {
      lines.push(`| ${row.arm} | ${String(row.questions)} | ${String(row.calls)} | ${JSON.stringify(row.statuses)} | ${row.costUsd} | `
        + `${String(row.wallSeconds)} | ${String(row.unavailable)} | ${JSON.stringify(row.marks)} | ${JSON.stringify(row.notes)} |`);
    }
    lines.push("");
  }
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm exec vitest run tests/unit/practice-openings-log.test.ts`
Expected: PASS (11 tests).

If the detector test names a question (for example `ro-hpv:und`), reword THAT question line so it carries more common words of its language. Keep it plain and neutral. Never change the test.

Then confirm the existing practice tests still pass with the exported helpers and the new markdown block:

Run: `pnpm exec vitest run tests/unit/preview-practice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add tools/preview-practice/practice-openings-questions.ts tools/preview-practice/practice-openings-log.ts tools/preview-practice/practice-report.ts tests/unit/practice-openings-log.test.ts
git commit -F - <<'MSG'
Preview practice openings: 12 fixed questions, openings.jsonl and its report

Six Romanian and six English questions fixed in code (policy, ethics, health, a personal decision, contested facts);
--questions and --arms only choose among fixed ids. Every finished call is one fsynced line; the report uses the
tool's own verdict table and holds counts, cost, time, slips, fallbacks and notes per arm, and no quality figure.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 11: The openings run (the gateway-backed MapCaller, arm T) and `--dry`'s scripted gates

**Files:**
- Create: `tools/preview-practice/practice-openings.ts`, `tools/preview-practice/practice-openings-dry.ts`
- Modify: `tools/preview-practice/practice-formats.ts:121`: change `function recordingGateway(` to `export function recordingGateway(`.
- Test: `tests/unit/practice-openings.test.ts`

**Interfaces:**
- Consumes:
  - from `@debateai/map`: `mapRunAngleMap`, `mapRunBlindLists`, `mapRunSnowball`, `mapProviderPieces`, `mapRotateSeats`, `MAP_CONTRACT_IDS`, `MAP_LIMITS`, `MapCaller`, `MapCallRequest`, `MapCallOutcome`, `MapRunInput`, `MapResult`;
  - from `@debateai/judgement`: `Judge`, `JudgeLeg`;
  - from practice-formats.ts: `recordingGateway`, `practiceTurnOrder`, `practiceBusyWaitMs`, `PRACTICE_FORMATS_DEFAULTS`, `PRACTICE_MODEL_BUSY`, `onePerModel`, `PracticeAttempt`;
  - from practice-concurrency.ts: `limitPort`, `PracticeSemaphore`;
  - from practice-lanes.ts: `replyContentOf`, `practiceJsonRepairOf`, `practiceFinishReasonOf`;
  - from Task 10: the log types and questions;
  - from practice-redaction.ts: `reportableReplyText`.
- Produces:
  - `OPENINGS_MAP_SIZES = { gapRoundsC: 2, gapRoundsB: 1, maxAnswers: 4, pointsPerAnswer: 4 }`
  - `type OpeningsRunInput`, `type OpeningsRunResult = Readonly<{ calls: readonly OpeningsCall[]; arms: readonly OpeningsArmLine[]; busyModels: readonly string[] }>`
  - `runPracticeOpenings(input: OpeningsRunInput): Promise<OpeningsRunResult>`
  - `OPENINGS_DRY_MODELS`, `openingsDryConfig(): PreviewProviderTestConfig`, `openingsDryTargets(config): readonly ProviderDiscoveryTarget[]`
  - `openingsDryPacket(requestBody: string): Readonly<{ model: string; packet: PromptPacket }>`
  - `type OpeningsDryScript = { busyModel: string | null; slipped: boolean; requests: number }`
  - `openingsDryPorts(): Readonly<{ ports: Readonly<{ deepinfra: PreviewBudgetPort; anthropic: PreviewBudgetPort }>; script: OpeningsDryScript }>`
  - `openingsDryContent(input: Readonly<{ contractId: string; fields: readonly FramedMaterialField[]; serial: number; slip: boolean }>): string`

How a map call is made, the same way as a formats job:
- It uses the recording preview gateway (guarded fetch, the gate's protocol, the preview call policy with its one repair try and its one 60-second resend after an unbilled refusal), with `role: "JUDGE"` and `lane: "served"`. That is what lets the preview's format repair apply (`previewFormatRepairAllowed`); see the self-review note for Phase 2.
- It uses the judge organ's bound; the policy raises it to the 8,192-token floor.
- Its contract hash is `mapPromptContractHash()`.
- Each finished call becomes one `OpeningsCall`:
  - tokens come from the gate observer's wire events for that model since the call began (one call per model in flight at a time: lists run one per seat, the other steps one at a time);
  - cost comes from `previewCallNanoUsd`;
  - the reply form comes from each try's recorded prompt.
- Busy handling is formats': a model whose call ends in the vendor's unbilled refusal waits within its `busyWaitMs` budget and the same call is tried again. When the budget is spent, the model sits out the rest of the run and its calls come back `BUSY`, so the map applies its fallbacks.

`--dry` replaces only the two gate ports with a scripted port. The whole real path runs: frame, door, preview policy, patch follow-up, observer, tokens, cost. Nothing is sent anywhere. The script is deterministic:
- every step gets a valid reply in the question's language;
- the Anthropic model's first open list carries one over-long claim, which the patch follow-up fixes (a PATCH repair);
- the first model asked to merge is refused busy from then on (a busy model, and `MAP_MERGE_FALLBACK`);
- choose names one answer, so the code fills a second (`ANSWERS_FILLED`);
- each gap round adds one point (`GAP_STOPPED`).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/practice-openings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapPromptContractHash } from "@debateai/map";
import { previewRunnerPolicy, readPromptFrame, type PreviewBudgetPort } from "@debateai/providers";
import { DEVELOPMENT_ORGAN_COST_BOUNDS } from "../../apps/runner/src/dev-deployment-register.js";
import { PracticeGateObserver } from "../../tools/preview-practice/practice-gate-observer.js";
import { PRACTICE_CONTRACT_HASHES } from "../../tools/preview-practice/practice-lanes.js";
import {
  OPENINGS_DRY_MODELS,
  openingsDryConfig,
  openingsDryPacket,
  openingsDryPorts,
  openingsDryTargets
} from "../../tools/preview-practice/practice-openings-dry.js";
import { openingsArmsFromFlag, openingsQuestionsFromFlag } from "../../tools/preview-practice/practice-openings-questions.js";
import { runPracticeOpenings } from "../../tools/preview-practice/practice-openings.js";

const HAIKU = "claude-haiku-5-5";
const config = openingsDryConfig();
const targets = openingsDryTargets(config);
const policy = previewRunnerPolicy({ bounds: DEVELOPMENT_ORGAN_COST_BOUNDS.organs, synthesisRolePolicy: {
  synthesizerBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.COMPOSER, evaluatorBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.CONFORMANCE } }, config);

function run(questions: string, arms: string, wrap: (port: PreviewBudgetPort) => PreviewBudgetPort = (port) => port) {
  const observer = new PracticeGateObserver({ now: () => 0 });
  const dry = openingsDryPorts();
  const ports = { deepinfra: observer.wrap("deepinfra", wrap(dry.ports.deepinfra)), anthropic: observer.wrap("anthropic", wrap(dry.ports.anthropic)) };
  return runPracticeOpenings({ config, targets, ports, observer, questions: openingsQuestionsFromFlag(questions), arms: openingsArmsFromFlag(arms),
    bound: policy.bounds.JUDGE, contractHashes: { judge: PRACTICE_CONTRACT_HASHES.judge, map: mapPromptContractHash() },
    sleep: async () => undefined, busyWaitMs: 0 });
}

describe("practice openings --dry: the scripted gates", () => {
  it("uses the five preview AIs", () => {
    expect(targets.map((target) => target.model).sort()).toEqual([...OPENINGS_DRY_MODELS].sort());
  });
});

describe("practice openings: arm T, today's opening", () => {
  it("asks every AI for a full position, blind, with today's judge contract and call sites", async () => {
    const result = await run("ro-euro", "T");
    const calls = [...result.calls].sort((a, b) => a.order - b.order);
    expect(calls.map((call) => call.callSiteKey)).toEqual(["JUDGE", "JUDGE:root:secondary", "JUDGE:root:2", "JUDGE:root:3", "JUDGE:root:4"]);
    expect(calls.every((call) => call.step === "POSITION" && call.shown === "BLIND" && call.status === "ACCEPTED")).toBe(true);
    expect(calls.every((call) => call.inputTokens === 100 && call.outputTokens === 50 && call.costNanoUsd !== null)).toBe(true);
    expect(calls.every((call) => typeof call.replyText === "string" && call.replyText.includes("statement"))).toBe(true);
    expect(result.arms).toEqual([expect.objectContaining({ arm: "T", questionId: "ro-euro", outcome: "POSITIONS", positions: 5 })]);
  });
});

describe("practice openings: arm C through the real gateway path", () => {
  it("plans, lists, merges (the merger busy: code merge), fills one gap and chooses; the busy AI sits out", async () => {
    const result = await run("ro-euro", "C");
    const calls = [...result.calls].sort((a, b) => a.order - b.order);
    expect(calls.map((call) => call.step)).toEqual(["ANGLES", "LIST", "LIST", "LIST", "LIST", "MERGE", "GAP", "CHOOSE"]);
    expect(calls.find((call) => call.step === "MERGE")).toMatchObject({ model: HAIKU, status: "BUSY" });
    expect(result.busyModels).toEqual([HAIKU]);
    const arm = result.arms[0]!;
    expect(arm.outcome).toBe("MAP");
    expect(arm.marks.map((mark) => mark.mark)).toEqual(expect.arrayContaining(["MAP_MERGE_FALLBACK", "ANSWERS_FILLED"]));
    expect(arm.notes.map((note) => note.note)).toContain("GAP_STOPPED");
    expect(calls.filter((call) => call.step !== "MERGE").every((call) => call.status === "ACCEPTED")).toBe(true);
    expect(calls.find((call) => call.step === "GAP")!.shown).not.toBe("BLIND");
  });

  it("never sends a model id or a maker to the merge, gap or choose AI", async () => {
    const bodies: string[] = [];
    const spy = (port: PreviewBudgetPort): PreviewBudgetPort => ({ execute: async (input, signal) => { bodies.push(input.requestBody); return port.execute(input, signal); } });
    await run("en-rent-caps", "B,C", spy);
    const names = [...targets.map((target) => target.model), ...targets.map((target) => target.maker)];
    const later = bodies.map((body) => readPromptFrame(openingsDryPacket(body).packet))
      .filter((frame) => ["map.merge.v1", "map.gap.v1", "map.choose.v1"].includes(frame.contractId));
    expect(later.length).toBeGreaterThan(0);
    for (const frame of later) for (const entry of frame.fields) for (const name of names) expect(entry.content).not.toContain(name);
  });
});

describe("practice openings: repairs and busy AIs", () => {
  it("a slip fixed by the patch follow-up is REPAIRED, its accepted form PATCH", async () => {
    const result = await run("en-four-day-week", "B");
    const repaired = result.calls.find((call) => call.model === HAIKU && call.step === "LIST")!;
    expect(repaired.status).toBe("REPAIRED");
    expect(repaired.replyForm).toBe("PATCH");
    expect(repaired.attempts.map((attempt) => attempt.replyForm)).toEqual(["ORIGINAL", "PATCH"]);
  });

  it("a model busy at merge sits out every later arm and question", async () => {
    const result = await run("ro-euro,en-rent-caps", "B,C");
    const firstMerge = result.calls.find((call) => call.step === "MERGE")!;
    expect(firstMerge.status).toBe("BUSY");
    const after = result.calls.filter((call) => call.startedAt > firstMerge.finishedAt || call.questionId === "en-rent-caps");
    expect(after.filter((call) => call.model === firstMerge.model)).toEqual([]);
    expect(result.arms.map((arm) => `${arm.questionId}:${arm.arm}:${arm.outcome}`))
      .toEqual(["ro-euro:B:MAP", "ro-euro:C:MAP", "en-rent-caps:B:MAP", "en-rent-caps:C:MAP"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run tests/unit/practice-openings.test.ts`
Expected: FAIL (cannot resolve `../../tools/preview-practice/practice-openings-dry.js`).

- [ ] **Step 3: Implement**

In `tools/preview-practice/practice-formats.ts` line 121, change `function recordingGateway(` to `export function recordingGateway(`.

Create `tools/preview-practice/practice-openings-dry.ts`:

```ts
/**
 * Preview practice, mode "openings", --dry: scripted answers; nothing is spent and no socket is opened.
 *
 * Plain words: --dry runs the openings comparison exactly as the real run does: the same prompts, the same frame
 * and door, the same preview call policy with its repair and its busy resend, the same gate watch, tokens and cost.
 * Only the two spending gates are replaced by a script that answers on the spot, in the question's language. The script
 * is fixed so every arm and the main fallbacks are exercised:
 *  - the Anthropic model's first list without an angle carries one over-long claim; the patch follow-up fixes it;
 *  - the first model asked to merge is refused as busy (not billed), every time from then on, so it sits out the
 *    rest and the code merges instead (MAP_MERGE_FALLBACK);
 *  - choose names one answer, so the code fills a second (ANSWERS_FILLED);
 *  - each gap round adds one point, so the gap rounds stop after one (GAP_STOPPED).
 * The expected verdict is PASS_WITH_WARNINGS (exit 10): a busy model that answered before, a repaired slip and the
 * unbilled refusals.
 */
import { detectArgumentLanguage } from "@debateai/kernel";
import { MAP_CONTRACT_IDS, MAP_LIMITS } from "@debateai/map";
import {
  parsePreviewProviderTestConfig,
  parseProviderDiscoveryTargets,
  previewModelRow,
  previewTargetJsonRow,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  PreviewVendorRefusedUnbilled,
  readPromptFrame,
  type FramedMaterialField,
  type PreviewBudgetPort,
  type PreviewProviderTestConfig,
  type PromptPacket,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import { onePerModel } from "./practice-formats.js";

/** The five preview AIs, as the preview's roster names them (the same five the practice unit tests use). */
export const OPENINGS_DRY_MODELS: readonly string[] = Object.freeze(["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash",
  "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash", "claude-haiku-5-5"]);

/** A preview configuration for the dry run. Its socket paths are never opened. */
export function openingsDryConfig(): PreviewProviderTestConfig {
  const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", free_model_ids: OPENINGS_DRY_MODELS.slice(0, 2),
    premium_model_ids: OPENINGS_DRY_MODELS, requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
    anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "preview-practice-openings-dry" }));
  if (config === undefined) throw new Error("PRACTICE_OPENINGS_DRY_CONFIG_INVALID");
  return config;
}

/** One target per preview AI, from the reviewed provider list, as the real command builds them. */
export function openingsDryTargets(config: PreviewProviderTestConfig): readonly ProviderDiscoveryTarget[] {
  const configured = PREVIEW_REVIEWED_PROVIDER_REFS.map((providerRef) => {
    const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
    return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
  });
  return onePerModel(parseProviderDiscoveryTargets(JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)), configured),
    config.premium_model_ids);
}

/**
 * The prompt a gate body carries, for the frame reader: a DeepInfra body's own messages; an Anthropic body's system
 * text put back in front of its turns (a system sent as cache blocks is their texts joined, byte for byte).
 */
export function openingsDryPacket(requestBody: string): Readonly<{ model: string; packet: PromptPacket }> {
  const body = JSON.parse(requestBody) as { model?: unknown; messages?: unknown; system?: unknown };
  const turns = (Array.isArray(body.messages) ? body.messages : []) as PromptPacket["messages"][number][];
  const system = typeof body.system === "string" ? body.system
    : Array.isArray(body.system) ? (body.system as { text?: unknown }[]).map((block) => (typeof block.text === "string" ? block.text : "")).join("")
      : null;
  return Object.freeze({ model: String(body.model), packet: Object.freeze({
    messages: Object.freeze(system === null ? turns : [{ role: "system" as const, content: system }, ...turns]) }) });
}

type OpeningsDryText = Readonly<{ point: string; why: string; yes: string; no: string; position: string; gap: string; snowball: string;
  angles: readonly [string, string, string, string] }>;

const OPENINGS_DRY_TEXT: Readonly<Record<"ro" | "en", OpeningsDryText>> = Object.freeze({
  ro: Object.freeze({
    point: "Este un punct important pentru că poate schimba răspunsul la întrebare",
    why: "Dacă este adevărat, răspunsul trebuie să țină cont de el.",
    yes: "Da, dar cu condiții clare.",
    no: "Nu, costurile sunt prea mari.",
    position: "Răspunsul meu este da, pentru că beneficiile sunt mai mari decât costurile, dacă sunt respectate condițiile.",
    gap: "Un punct care lipsește: efectul asupra celor care nu au fost întrebați",
    snowball: "Un punct nou, după ce am văzut lista",
    angles: ["Cel mai puternic argument pentru alt răspuns", "Ce îl îngrijorează pe cel care întreabă", "Ce trebuie făcut în practică",
      "Costurile și cine le plătește"] as const
  }),
  en: Object.freeze({
    point: "This is an important point because it can change the answer to the question",
    why: "If it is true, the answer has to take it into account.",
    yes: "Yes, but with clear conditions.",
    no: "No, the costs are too high.",
    position: "My answer is yes, because the benefits are larger than the costs when the conditions are kept.",
    gap: "A missing point: the effect on the people nobody asked",
    snowball: "A new point after seeing the list",
    angles: ["The strongest case for a different answer", "What the person asking is worried about", "What to do in practice",
      "The costs and who pays them"] as const
  })
});

const openingsDryField = (fields: readonly FramedMaterialField[], name: string): string =>
  fields.find((entry) => entry.name === name)?.content ?? "";
const openingsDryTextOf = (fields: readonly FramedMaterialField[]): OpeningsDryText =>
  OPENINGS_DRY_TEXT[detectArgumentLanguage(openingsDryField(fields, "question_line")).tag === "ro" ? "ro" : "en"];

/**
 * A valid reply for the step, in the question's language (read from the material, as a model reads it). `serial` keeps
 * the snowball and gap points distinct; no model id or maker ever enters a reply, so the blindness test can look for them.
 */
export function openingsDryContent(input: Readonly<{ contractId: string; fields: readonly FramedMaterialField[]; serial: number; slip: boolean }>): string {
  const text = openingsDryTextOf(input.fields);
  const short = String(input.serial);
  const point = (claim: string) => ({ claim, why_it_matters: text.why, leans: "context" });
  if (input.contractId.startsWith("judge.")) {
    return JSON.stringify({ statement: text.position, way_of_knowing: "REASONING", locator: null, restatement_text: text.position,
      restatement_status: "PASS", value_laden: false, claim_type: "unknown", steelman: { summary: text.position, fidelity: 0.72 },
      critic: { summary: text.no, counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" }, evidence: { quality: 0.72, relevance: 0.72 },
      context: { fit: 0.72, ambiguityFlags: [] }, fallacy: { severity: 0.28, fatalFlags: [] } });
  }
  if (input.contractId === MAP_CONTRACT_IDS.angles) {
    const [opposite, worry, practical, cost] = text.angles;
    return JSON.stringify({ angles: [
      { angle_id: "opposite", kind: "OPPOSITE_CASE", label: opposite, focus: opposite },
      { angle_id: "worry", kind: "ASKER_WORRY", label: worry, focus: worry },
      { angle_id: "practical", kind: "PRACTICAL", label: practical, focus: practical },
      { angle_id: "cost", kind: "SPECIFIC", label: cost, focus: cost }] });
  }
  if (input.contractId === MAP_CONTRACT_IDS.listAngle || input.contractId === MAP_CONTRACT_IDS.listOpen) {
    const label = openingsDryField(input.fields, "angle_label");
    const claims = [1, 2, 3].map((n) => `${text.point}${label === "" ? "" : ` (${label})`} ${String(n)}`);
    if (input.slip) claims[0] = `${claims[0]!} ${"x".repeat(MAP_LIMITS.claimMaxChars)}`;
    return JSON.stringify({ points: claims.map(point), candidate_answers: [label === text.angles[0] ? text.no : text.yes] });
  }
  if (input.contractId === MAP_CONTRACT_IDS.listSnowball) {
    return JSON.stringify({ points: [point(`${text.snowball} (${short})`)], candidate_answers: [] });
  }
  if (input.contractId === MAP_CONTRACT_IDS.merge) {
    const points = JSON.parse(openingsDryField(input.fields, "points")) as { item_id: string; claim: string }[];
    const answers = JSON.parse(openingsDryField(input.fields, "candidate_answers")) as { item_id: string; answer: string }[];
    const claims = [...new Set(points.map((row) => row.claim))];
    const texts = [...new Set(answers.map((row) => row.answer))];
    return JSON.stringify({
      key_points: claims.map((claim, index) => ({ key_point_id: `k${String(index + 1)}`, claim,
        member_item_ids: points.filter((row) => row.claim === claim).map((row) => row.item_id) })),
      answers: texts.map((answer, index) => ({ answer_id: `a${String(index + 1)}`, answer,
        member_item_ids: answers.filter((row) => row.answer === answer).map((row) => row.item_id) }))
    });
  }
  if (input.contractId === MAP_CONTRACT_IDS.gap) {
    return JSON.stringify({ new_points: [point(`${text.gap} (${short})`)], framing_challenges: [] });
  }
  if (input.contractId === MAP_CONTRACT_IDS.choose) {
    const first = (JSON.parse(openingsDryField(input.fields, "key_points")) as { key_point_id: string }[])[0]?.key_point_id;
    return JSON.stringify({ answers: [{ answer_id: "a-1", statement: text.yes, for: first === undefined ? [] : [first], against: [], strongest_rival: null }] });
  }
  return "{}";
}

/** The patch follow-up's answer: only the members asked for (here: the over-long claim, shortened). */
function openingsDryPatch(paths: readonly string[], fields: readonly FramedMaterialField[]): string {
  const text = openingsDryTextOf(fields);
  return JSON.stringify(Object.fromEntries(paths.map((path) => [path, `${text.point} 1`])));
}

/** What the dry script has done so far. */
export type OpeningsDryScript = { busyModel: string | null; slipped: boolean; requests: number };

function openingsDryVendorReply(provider: "deepinfra" | "anthropic", model: string, content: string, id: number): string {
  return provider === "anthropic"
    ? JSON.stringify({ id: `msg_dry_${String(id)}`, type: "message", role: "assistant", model, content: [{ type: "text", text: content }],
      stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } })
    : JSON.stringify({ id: `dry-${String(id)}`, model, choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50 } });
}

/** The two scripted gate ports. Each reads the prompt with the frame reader the gateway's door runs. */
export function openingsDryPorts(): Readonly<{ ports: Readonly<{ deepinfra: PreviewBudgetPort; anthropic: PreviewBudgetPort }>; script: OpeningsDryScript }> {
  const script: OpeningsDryScript = { busyModel: null, slipped: false, requests: 0 };
  const port = (provider: "deepinfra" | "anthropic"): PreviewBudgetPort => Object.freeze({
    async execute(input: Parameters<PreviewBudgetPort["execute"]>[0]) {
      script.requests += 1;
      const { model, packet } = openingsDryPacket(input.requestBody);
      const frame = readPromptFrame(packet);
      if (model === script.busyModel) throw new PreviewVendorRefusedUnbilled();
      if (frame.contractId === MAP_CONTRACT_IDS.merge && script.busyModel === null) {
        script.busyModel = model;
        throw new PreviewVendorRefusedUnbilled();
      }
      const patchPaths = frame.fields.find((entry) => entry.name === "machine_rejection_paths")?.content;
      const isPatch = patchPaths !== undefined && frame.fields.some((entry) => entry.name === "machine_reply_form" && entry.content === "PATCH");
      const slip = provider === "anthropic" && !script.slipped && frame.contractId === MAP_CONTRACT_IDS.listOpen && !isPatch;
      if (slip) script.slipped = true;
      const content = isPatch ? openingsDryPatch(patchPaths.split(","), frame.fields)
        : openingsDryContent({ contractId: frame.contractId, fields: frame.fields, serial: script.requests, slip });
      return { status: 200, body: openingsDryVendorReply(provider, model, content, script.requests) };
    }
  });
  return Object.freeze({ ports: Object.freeze({ deepinfra: port("deepinfra"), anthropic: port("anthropic") }), script });
}
```

Create `tools/preview-practice/practice-openings.ts`:

```ts
/**
 * Preview practice, mode "openings" (spec 2026-10-12 §2): today's opening (T) and the three map openings (A snowball,
 * B blind lists, C the angle map) on the fixed questions, with the same AIs.
 *
 * Plain words: for each question, each arm is run in turn. T asks every AI for a full position with today's judge
 * contract, blind. A, B and C run the map (packages/map) through a caller that sends each step through exactly the
 * gateway a formats job uses: the gates, the relay, the preview call policy (its one repair try, its one resend after
 * an unbilled refusal), the gates' watch. Every finished call is handed to `onCall` at once (openings.jsonl), every
 * finished arm to `onArm`. The first AI rotates per question. A busy model waits within its budget, as in formats; once
 * its budget is spent it sits out the rest of the run, and the map applies its fallbacks.
 */
import { randomUUID } from "node:crypto";
import { Judge, type JudgeLeg } from "@debateai/judgement";
import {
  mapProviderPieces,
  mapRotateSeats,
  mapRunAngleMap,
  mapRunBlindLists,
  mapRunSnowball,
  type MapCallOutcome,
  type MapCallRequest,
  type MapCaller,
  type MapResult,
  type MapRunInput
} from "@debateai/map";
import {
  createPreviewGuardedFetch,
  previewModelRow,
  providerCallEndedVendorRefusedUnbilled,
  ProviderContentUnacceptedError,
  type CallBound,
  type PreviewBudgetPorts,
  type PreviewProviderTestConfig,
  type ProviderDiscoveryTarget,
  type ProviderGateway,
  type ProviderLedgerInput,
  type RawArtifactInput
} from "@debateai/providers";
import { previewCallNanoUsd } from "../../apps/api/src/preview-budget-estimate.js";
import { limitPort, PracticeSemaphore } from "./practice-concurrency.js";
import {
  PRACTICE_FORMATS_DEFAULTS,
  PRACTICE_MODEL_BUSY,
  practiceBusyWaitMs,
  practiceTurnOrder,
  recordingGateway,
  type PracticeAttempt
} from "./practice-formats.js";
import type { PracticeGateName, PracticeGateObserver, PracticeWireEvent } from "./practice-gate-observer.js";
import { practiceFinishReasonOf, practiceJsonRepairOf, replyContentOf } from "./practice-lanes.js";
import type { OpeningsArmLine, OpeningsBusyWait, OpeningsCall, OpeningsCallStatus, OpeningsStep } from "./practice-openings-log.js";
import type { OpeningsArm, OpeningsQuestion } from "./practice-openings-questions.js";
import { reportableReplyText } from "./practice-redaction.js";
import type { PracticeReplyForm } from "./practice-verdict.js";

/** The map's sizes for five AIs, as a Premium plan (spec S5, Pro: 5 map AIs, 4 answers; up to 2 gap rounds, 1 for arm B). */
export const OPENINGS_MAP_SIZES = Object.freeze({ gapRoundsC: 2, gapRoundsB: 1, maxAnswers: 4, pointsPerAnswer: 4 });

export type OpeningsRunInput = Readonly<{
  config: PreviewProviderTestConfig;
  targets: readonly ProviderDiscoveryTarget[];
  ports: PreviewBudgetPorts;
  observer: PracticeGateObserver;
  questions: readonly OpeningsQuestion[];
  arms: readonly OpeningsArm[];
  /** The judge organ's bound (the preview policy raises it to its 8,192-token floor). */
  bound: CallBound;
  contractHashes: Readonly<{ judge: string; map: string }>;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  progress?: (line: string) => void;
  shouldStop?: () => boolean;
  stopSignal?: AbortSignal;
  /** Each model's budget of busy waits, in ms (0: a busy model sits out at once). */
  busyWaitMs?: number;
  gateLimits?: Readonly<Partial<Record<PracticeGateName, number>>>;
  maxInFlight?: number;
  onCall?: (call: OpeningsCall) => void;
  onArm?: (arm: OpeningsArmLine) => void;
  onBusy?: (model: string) => void;
  onBusyWait?: (wait: OpeningsBusyWait) => void;
}>;

export type OpeningsRunResult = Readonly<{ calls: readonly OpeningsCall[]; arms: readonly OpeningsArmLine[]; busyModels: readonly string[] }>;

function openingsErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
    if (error instanceof Error) return error.name;
  }
  return "UNKNOWN";
}

async function openingsAbortableWait(sleep: (milliseconds: number) => Promise<void>, milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal === undefined) { await sleep(milliseconds); return; }
  if (signal.aborted) return;
  let onAbort = () => undefined as void;
  const aborted = new Promise<void>((resolve) => { onAbort = () => resolve(); signal.addEventListener("abort", onAbort, { once: true }); });
  try { await Promise.race([sleep(milliseconds), aborted]); } finally { signal.removeEventListener("abort", onAbort); }
}

const OPENINGS_FORMAT_ERRORS: ReadonlySet<string> = new Set(["JUDGE_SCHEMA_FAILURE", "JUDGE_PARSE_FAILURE", "MAP_REPLY_UNREADABLE"]);

type OpeningsCallContext = Readonly<{
  arm: OpeningsArm; question: OpeningsQuestion; step: OpeningsStep; callSiteKey: string;
  target: ProviderDiscoveryTarget; shown: "BLIND" | readonly string[]; order: number;
}>;

export async function runPracticeOpenings(input: OpeningsRunInput): Promise<OpeningsRunResult> {
  const budgetMs = input.busyWaitMs ?? 0;
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  // As formats: each call takes a place at its gate, then one overall, before the brake looks at it.
  const overall = new PracticeSemaphore(input.maxInFlight ?? PRACTICE_FORMATS_DEFAULTS.maxInFlight);
  const limited = Object.fromEntries(Object.entries(input.ports).map(([provider, port]) => {
    const gate: PracticeGateName = provider === "anthropic" ? "anthropic" : "deepinfra";
    const perGate = new PracticeSemaphore(input.gateLimits?.[gate] ?? PRACTICE_FORMATS_DEFAULTS.gateLimits[gate]);
    return [provider, port === undefined ? port : limitPort(port, [perGate, overall])];
  })) as PreviewBudgetPorts;
  const guardedFetch = createPreviewGuardedFetch(limited);
  const runId = randomUUID();
  const calls: OpeningsCall[] = [];
  const armLines: OpeningsArmLine[] = [];
  const busy: string[] = [];
  const waits = new Map<string, { usedMs: number; waits: number; inARow: number }>();
  const gateOf = (model: string): PracticeGateName => (previewModelRow(model)?.provider === "anthropic" ? "anthropic" : "deepinfra");
  const record = (call: OpeningsCall) => { const frozen = Object.freeze(call); calls.push(frozen); input.onCall?.(frozen); };

  const oneCall = async <T>(context: OpeningsCallContext, send: (gateway: ProviderGateway) => Promise<T>): Promise<MapCallOutcome<T>> => {
    const { target } = context;
    const model = target.model;
    const gate = gateOf(model);
    const state = waits.get(model) ?? { usedMs: 0, waits: 0, inARow: 0 };
    waits.set(model, state);
    const base = { arm: context.arm, questionId: context.question.id, step: context.step, callSiteKey: context.callSiteKey,
      aiRef: target.providerRef, model, maker: target.maker, gate, shown: context.shown, order: context.order };
    const skipped = (status: "SKIPPED_MODEL_BUSY" | "SKIPPED_STOPPED", errorCode: string) => {
      const at = new Date().toISOString();
      record({ ...base, startedAt: at, finishedAt: at, latencyMs: 0, inputTokens: null, outputTokens: null, reasoningTokens: null,
        cachedInputTokens: null, costNanoUsd: null, status, errorCode, attempts: [], replyForm: null, replyText: null });
    };
    for (;;) {
      if (busy.includes(model)) {
        skipped("SKIPPED_MODEL_BUSY", PRACTICE_MODEL_BUSY);
        return { kind: "BUSY", code: PRACTICE_MODEL_BUSY };
      }
      const stop = input.observer.stopped(gate);
      if (stop !== null || input.shouldStop?.() === true) {
        const code = stop?.reason ?? "PRACTICE_INTERRUPTED";
        skipped("SKIPPED_STOPPED", code);
        return { kind: "FAILED", code };
      }
      const sink = { artifacts: [] as RawArtifactInput[], ledger: [] as ProviderLedgerInput[], forms: new Map<string, PracticeReplyForm | null>() };
      const recording = recordingGateway({ target, config: input.config, guardedFetch, sink, ...(input.sleep === undefined ? {} : { sleep: input.sleep }) });
      let endedBusy = false;
      const gateway: ProviderGateway = Object.freeze({
        call: async (request: Parameters<ProviderGateway["call"]>[0]) => {
          try {
            return await recording.call(request);
          } catch (error) {
            if (providerCallEndedVendorRefusedUnbilled(error)) endedBusy = true;
            throw error;
          }
        }
      });
      const eventsBefore = input.observer.events.length;
      const startedAt = new Date();
      const started = performance.now();
      let value: T | undefined;
      let ok = false;
      let errorCode: string | null = null;
      let formatError = false;
      try {
        value = await send(gateway);
        ok = true;
      } catch (error) {
        errorCode = openingsErrorCode(error);
        formatError = error instanceof ProviderContentUnacceptedError || OPENINGS_FORMAT_ERRORS.has(errorCode);
      }
      const latencyMs = Math.round(performance.now() - started);
      // This model's own gate calls only (one call per model is in flight at a time).
      const wire = input.observer.events.slice(eventsBefore).filter((event) => event.model === model);
      if (endedBusy && state.usedMs < budgetMs) {
        const busyEvent = [...wire].reverse().find((event) => event.unbilledKind === "VENDOR_REFUSED" || event.unbilledKind === "MODEL_COOLING");
        const reason = busyEvent?.unbilledKind === "MODEL_COOLING" ? "MODEL_COOLING" : "VENDOR_REFUSED";
        const retryAfterSeconds = reason === "MODEL_COOLING" ? busyEvent?.retryAfterSeconds ?? null : null;
        const waitMs = Math.min(budgetMs - state.usedMs, practiceBusyWaitMs({ retryAfterSeconds, waitsInARow: state.inARow,
          ...(input.random === undefined ? {} : { random: input.random }) }));
        state.usedMs += waitMs;
        state.waits += 1;
        state.inARow += 1;
        input.onBusyWait?.(Object.freeze({ model, arm: context.arm, questionId: context.question.id, callSiteKey: context.callSiteKey,
          wait: state.waits, waitMs, reason, retryAfterSeconds }));
        input.progress?.(`${model} is busy (refused, not billed): waiting ${String(Math.round(waitMs / 1_000))}s, then ${context.callSiteKey} again`);
        await openingsAbortableWait(sleep, waitMs, input.stopSignal);
        continue;
      }
      if (!endedBusy) state.inARow = 0;
      const total = (pick: (event: PracticeWireEvent) => number | null | undefined) => wire.reduce<number | null>((sum, event) => {
        const value_ = pick(event);
        return value_ === null || value_ === undefined ? sum : (sum ?? 0) + value_;
      }, null);
      const inputTokens = total((event) => event.inputTokens);
      const outputTokens = total((event) => event.outputTokens);
      const row = previewModelRow(model);
      const attempts = sink.ledger.map((entry): PracticeAttempt => {
        const artifact = sink.artifacts.find((candidate) => candidate.attemptId === entry.attemptId) ?? null;
        return Object.freeze({ callSiteKey: entry.callSiteKey, outcome: entry.outcome, parseStatus: artifact?.parseStatus ?? null,
          latencyMs: entry.finishedAt.getTime() - entry.startedAt.getTime(),
          jsonRepair: artifact === null || entry.outcome !== "OK" ? null
            : practiceJsonRepairOf(replyContentOf(artifact.rawText), practiceFinishReasonOf(artifact.metadata)),
          replyForm: sink.forms.get(entry.attemptId) ?? null });
      });
      const refused = sink.artifacts.some((artifact) => artifact.parseStatus !== "PARSED");
      const status: OpeningsCallStatus = ok ? (refused ? "REPAIRED" : "ACCEPTED") : endedBusy ? "BUSY" : formatError ? "FORMAT_FAILED" : "CALL_FAILED";
      const last = sink.artifacts.at(-1) ?? null;
      record({ ...base, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), latencyMs,
        inputTokens, outputTokens, reasoningTokens: total((event) => event.reasoningTokens),
        cachedInputTokens: total((event) => event.cachedInputTokens),
        costNanoUsd: row === undefined || inputTokens === null || outputTokens === null ? null
          : String(previewCallNanoUsd(row, BigInt(inputTokens), outputTokens)),
        status, errorCode, attempts: Object.freeze(attempts),
        replyForm: ok ? ([...attempts].reverse().find((attempt) => attempt.outcome === "OK")?.replyForm ?? null) : null,
        replyText: last === null ? null : reportableReplyText(replyContentOf(last.rawText)) });
      input.progress?.(`${context.question.id} ${context.arm} ${context.callSiteKey} ${model}: ${status} ${String(latencyMs)}ms`);
      if (endedBusy) {
        if (!busy.includes(model)) {
          busy.push(model);
          input.onBusy?.(model);
          input.progress?.(`${model} is busy (refused, not billed): it sits out the rest`);
        }
        return { kind: "BUSY", code: errorCode ?? "PROVIDER_CALL_FAILED" };
      }
      return ok ? { kind: "OK", value: value as T } : { kind: "FAILED", code: errorCode ?? "UNKNOWN" };
    }
  };

  const targetByRef = new Map(input.targets.map((target) => [target.providerRef, target] as const));
  const mapCaller = (arm: OpeningsArm, question: OpeningsQuestion): MapCaller => Object.freeze({
    call: <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => {
      const target = targetByRef.get(request.seat.aiRef);
      if (target === undefined) return Promise.resolve({ kind: "FAILED", code: "PRACTICE_OPENINGS_UNKNOWN_SEAT" });
      return oneCall<T>({ arm, question, step: request.step, callSiteKey: request.callSiteKey, target, shown: request.shown, order: request.order },
        async (gateway) => {
          const pieces = mapProviderPieces(request.spec);
          const response = await gateway.call({ runId, subjectItemId: randomUUID(), callSiteKey: request.callSiteKey, role: "JUDGE", lane: "served",
            bound: input.bound, contractHash: input.contractHashes.map, providerRef: target.providerRef, packet: pieces.framed.packet,
            classifyContent: pieces.classifyContent, buildRepairPacket: pieces.buildRepairPacket });
          return pieces.readAccepted(response.content);
        });
    }
  });

  /** Arm T: today's opening, every AI a full position, blind; root 0 primary, the rest independent (runner call sites). */
  const positions = async (question: OpeningsQuestion, seats: readonly ProviderDiscoveryTarget[]): Promise<number> => {
    const ends = await Promise.all(seats.map((target, index) => {
      const leg: JudgeLeg = index === 0 ? { kind: "primary-root" } : { kind: "independent-root" };
      const callSiteKey = index === 0 ? "JUDGE" : index === 1 ? "JUDGE:root:secondary" : `JUDGE:root:${String(index)}`;
      return oneCall({ arm: "T", question, step: "POSITION", callSiteKey, target, shown: "BLIND", order: index }, async (gateway) => {
        await new Judge(gateway).judge({ runId, subjectItemId: randomUUID(), callSiteKey, questionLine: question.questionLine,
          argumentLanguageName: question.languageName, leg, providerRef: target.providerRef, contractHash: input.contractHashes.judge,
          bound: input.bound });
        return true;
      });
    }));
    return ends.filter((end) => end.kind === "OK").length;
  };

  const emit = (line: OpeningsArmLine) => { const frozen = Object.freeze(line); armLines.push(frozen); input.onArm?.(frozen); };
  const order = practiceTurnOrder(input.targets);
  for (const [questionIndex, question] of input.questions.entries()) {
    for (const arm of input.arms) {
      if (input.shouldStop?.() === true) break;
      const seats = mapRotateSeats(order, questionIndex).filter((target) => !busy.includes(target.model));
      const startedAt = new Date().toISOString();
      if (arm === "T") {
        const written = await positions(question, seats);
        emit({ arm, questionId: question.id, startedAt, finishedAt: new Date().toISOString(), outcome: "POSITIONS", positions: written,
          marks: [], notes: [], map: null });
        continue;
      }
      const mapInput: MapRunInput = {
        questionLine: question.questionLine, languageName: question.languageName, languageTag: question.languageTag,
        seats: seats.map((target) => Object.freeze({ aiRef: target.providerRef, maker: target.maker })),
        caller: mapCaller(arm, question), seed: `${question.id}|${arm}`,
        gapRoundsMax: arm === "C" ? OPENINGS_MAP_SIZES.gapRoundsC : OPENINGS_MAP_SIZES.gapRoundsB,
        maxAnswers: OPENINGS_MAP_SIZES.maxAnswers, pointsPerAnswer: OPENINGS_MAP_SIZES.pointsPerAnswer
      };
      const result: MapResult = arm === "A" ? await mapRunSnowball(mapInput)
        : arm === "B" ? await mapRunBlindLists(mapInput) : await mapRunAngleMap(mapInput);
      const { calls: _calls, ...map } = result;
      emit({ arm, questionId: question.id, startedAt, finishedAt: new Date().toISOString(), outcome: result.kind, positions: 0,
        marks: result.marks, notes: result.notes, map });
      input.progress?.(`${question.id} ${arm}: ${result.kind}, marks ${result.marks.map((mark) => mark.mark).join(",") || "none"}`);
    }
    if (input.shouldStop?.() === true) break;
  }
  return Object.freeze({ calls: Object.freeze([...calls]), arms: Object.freeze([...armLines]), busyModels: Object.freeze([...busy]) });
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm exec vitest run tests/unit/practice-openings.test.ts`
Expected: PASS (6 tests).

What a failure most likely means:
- If "uses the five preview AIs" fails, the preview roster changed. Update `OPENINGS_DRY_MODELS` to the five ids in `PREVIEW_REVIEWED_PROVIDER_REFS` (the unit test in tests/unit/preview-practice.test.ts carries the same list).
- If the arm C test shows `FORMAT_FAILED` on LIST calls, the dry Romanian text was read as another language. Check `mapWrongLanguage` on `OPENINGS_DRY_TEXT.ro.point` and add common Romanian words to the dry text. Never loosen the check.

Then re-run the existing practice suite, because `practice-formats.ts` changed:

Run: `pnpm exec vitest run tests/unit/preview-practice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add tools/preview-practice/practice-openings.ts tools/preview-practice/practice-openings-dry.ts tools/preview-practice/practice-formats.ts tests/unit/practice-openings.test.ts
git commit -F - <<'MSG'
Preview practice openings: the run (arms T, A, B, C) and --dry's scripted gates

Every map step goes through the formats mode's own preview gateway (gates, policy, patch follow-up, full re-ask,
busy waits, the gates' watch), one fsynced record per call with what the AI was shown, its order, times, tokens,
cost, format check and reply. Arm T asks for today's positions with the judge contract unchanged. --dry swaps only
the gate ports for a script that exercises every arm, a PATCH repair, a busy merger and the answers fill.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 12: The `openings` command (`--dry`, `--questions`, `--arms`), its log on every way out, and the README

**Files:**
- Modify: `tools/preview-practice/practice.ts`, `tools/preview-practice/README.md`
- Test: `tests/unit/practice-openings-cli.test.ts`

**Interfaces:**
- Consumes: Tasks 9–11. From practice.ts's existing imports: `assertOutsideRepository`, `defaultReportDirectory`, `PracticeGateObserver`, `remainingLine`, `practiceRemainingPorts`, `PracticeRefusal`, `wholeNumber`, `onePerModel`, `PRACTICE_FORMATS_DEFAULTS`, `previewRunnerPolicy`, `DEVELOPMENT_ORGAN_COST_BOUNDS`.
- Produces:
  - `parsePracticeArgs` accepts mode `openings`, the switch `--dry` and the value flags `--questions` and `--arms`.
  - `runPractice(["openings", ...])` runs the mode. Real runs pass the same start checks as formats (acknowledgement, sockets, settings, fresh gate status, both gates open, every model enabled at its gate). `--dry` skips them: no socket, no settings and nothing spent.
  - On every way out (end, first Ctrl-C, second Ctrl-C, SIGTERM/SIGHUP, a crash midway), `report.json` and `report.md` are built from `openings.jsonl`, as formats builds them from `samples.jsonl`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/practice-openings-cli.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parsePracticeArgs, repositoryRoot, runPractice } from "../../tools/preview-practice/practice.js";

const quiet = { log: () => undefined, sleep: async () => undefined, wait: async () => undefined };
const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
const freshOut = () => { const folder = mkdtempSync(join(tmpdir(), "pp-openings-cli-")); folders.push(folder); return join(folder, "out"); };
const jsonl = (out: string) => readFileSync(join(out, "openings.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, any>);

describe("practice openings: the command line", () => {
  it("parses openings with --dry, --questions and --arms", () => {
    const args = parsePracticeArgs(["openings", "--dry", "--questions", "ro-euro,en-rent-caps", "--arms", "A,C", "--out", "/tmp/openings"]);
    expect(args.mode).toBe("openings");
    expect(args.switches.has("--dry")).toBe(true);
    expect(args.flags.get("--questions")).toBe("ro-euro,en-rent-caps");
    expect(args.flags.get("--arms")).toBe("A,C");
  });

  it("--dry runs every arm, writes openings.jsonl and both reports outside the repository, and spends nothing", async () => {
    const out = freshOut();
    const result = await runPractice(["openings", "--dry", "--questions", "ro-euro,en-four-day-week", "--out", out], {}, quiet);
    expect([result.report.verdict, result.exitCode]).toEqual(["PASS_WITH_WARNINGS", 10]);
    expect(result.report.reasons.some((reason) => reason.startsWith("MODEL_BUSY_PARTLY:"))).toBe(true);
    expect(result.report.reasons).toContain("FORMAT_REPAIRED:claude-haiku-5-5:1");
    const lines = jsonl(out);
    expect(lines[0]).toMatchObject({ kind: "start", mode: "openings", dry: true, questions: ["ro-euro", "en-four-day-week"], arms: ["T", "A", "B", "C"] });
    expect(lines.filter((line) => line.kind === "arm").map((line) => `${String(line.arm.questionId)}:${String(line.arm.arm)}`)).toEqual([
      "ro-euro:T", "ro-euro:A", "ro-euro:B", "ro-euro:C", "en-four-day-week:T", "en-four-day-week:A", "en-four-day-week:B", "en-four-day-week:C"]);
    const marks = lines.filter((line) => line.kind === "arm").flatMap((line) => (line.arm.marks as { mark: string }[]).map((mark) => mark.mark));
    expect(marks).toEqual(expect.arrayContaining(["MAP_MERGE_FALLBACK", "ANSWERS_FILLED"]));
    const calls = lines.filter((line) => line.kind === "call").map((line) => line.call as Record<string, any>);
    expect(calls.some((call) => call.status === "REPAIRED" && call.replyForm === "PATCH")).toBe(true);
    for (const call of calls.filter((entry) => entry.status === "ACCEPTED" || entry.status === "REPAIRED")) {
      expect(typeof call.replyText).toBe("string");
      expect(call.inputTokens).toBeGreaterThanOrEqual(100);
      expect(call.shown === "BLIND" || Array.isArray(call.shown)).toBe(true);
    }
    expect(lines.at(-1)).toMatchObject({ kind: "end", interrupted: false });
    expect(existsSync(join(out, "report.json"))).toBe(true);
    expect(readFileSync(join(out, "report.md"), "utf8")).toContain("Openings per arm");
  });

  it("refuses an --out folder inside the repository, and writes nothing there", async () => {
    const inside = join(repositoryRoot(), "openings-report-must-not-exist");
    const result = await runPractice(["openings", "--dry", "--out", inside], {}, quiet);
    expect([result.report.verdict, result.exitCode]).toEqual(["HARNESS_ERROR", 40]);
    expect(result.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_REPORT_INSIDE_REPOSITORY"]);
    expect(existsSync(inside)).toBe(false);
  });

  it("--questions cannot carry a question: free text is refused, never sent, never repeated", async () => {
    const out = freshOut();
    const result = await runPractice(["openings", "--dry", "--questions", "Should I lie to my boss?", "--out", out], {}, quiet);
    expect(result.exitCode).toBe(40);
    expect(result.report.reasons[0]).toMatch(/^HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID/u);
    expect(JSON.stringify(result.report)).not.toContain("lie to my boss");
    expect(existsSync(join(out, "openings.jsonl"))).toBe(false);
  });

  it("keeps the openings flags to the openings mode", async () => {
    for (const argv of [["formats", "--dry"], ["formats", "--arms", "T"], ["debate", "--questions", "ro-euro"]]) {
      const result = await runPractice([...argv, "--out", freshOut()], {}, quiet);
      expect(result.report.reasons[0]).toMatch(/^HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID/u);
    }
    const unknownArm = await runPractice(["openings", "--dry", "--arms", "X", "--out", freshOut()], {}, quiet);
    expect(unknownArm.report.reasons[0]).toMatch(/^HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID/u);
  });

  it("a real openings run passes the same start checks as formats (here: the acknowledgement)", async () => {
    const result = await runPractice(["openings", "--settings", join(tmpdir(), "no-such-settings.env"), "--out", freshOut()], {}, quiet);
    expect(result.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_ACK_REQUIRED"]);
  });

  it("refuses a folder that already holds another run's openings.jsonl, and leaves that run's report as it is", async () => {
    const out = freshOut();
    await runPractice(["openings", "--dry", "--questions", "en-rent-caps", "--arms", "T", "--out", out], {}, quiet);
    const before = readFileSync(join(out, "report.json"), "utf8");
    const again = await runPractice(["openings", "--dry", "--questions", "en-rent-caps", "--arms", "T", "--out", out], {}, quiet);
    expect(again.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_OUT_ALREADY_HOLDS_OPENINGS"]);
    expect(readFileSync(join(out, "report.json"), "utf8")).toBe(before);
  });

  it("a second interrupt midway still writes the report from the finished calls (ABORTED)", async () => {
    const out = freshOut();
    let abort: ((code: string) => number) | null = null;
    let seen = 0;
    const result = await runPractice(["openings", "--dry", "--questions", "ro-euro", "--arms", "T,C", "--out", out], {}, { ...quiet,
      onControl: (control) => { abort = control.abort; },
      log: (line) => { if (line.includes("JUDGE:root:secondary")) { seen += 1; if (seen === 1) abort?.("OPERATOR_SECOND_INTERRUPT"); } } });
    expect([result.report.verdict, result.exitCode]).toEqual(["ABORTED", 50]);
    expect(result.report.reasons[0]).toBe("ABORTED:OPERATOR_SECOND_INTERRUPT");
    expect(jsonl(out).some((line) => line.kind === "abort")).toBe(true);
    expect(JSON.parse(readFileSync(join(out, "report.json"), "utf8")).verdict).toBe("ABORTED");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run tests/unit/practice-openings-cli.test.ts`
Expected: FAIL. `parsePracticeArgs(["openings", ...])` throws `PRACTICE_MODE_REQUIRED`.

- [ ] **Step 3: Implement**

Edit `tools/preview-practice/practice.ts`.

(a) In the header comment, after the `debate:` bullet, add:

```ts
 *  - openings: the debate-shape comparison (spec 2026-10-12 §2): today's opening (T) and three map openings (A snowball,
 *             B blind lists, C the angle map) on 12 fixed questions; every finished call goes to <out>/openings.jsonl at
 *             once (practice-openings-log.ts) and the report is built from it. --dry answers from a script: no socket,
 *             nothing spent (practice-openings-dry.ts).
```

(b) Add these imports, keeping alphabetical order with the existing ones:

```ts
import { mapPromptContractHash } from "@debateai/map";
import { openingsDryConfig, openingsDryPorts, openingsDryTargets } from "./practice-openings-dry.js";
import { OPENINGS_SCHEMA, OpeningsLog, openingsReportFromLog, readOpeningsLog } from "./practice-openings-log.js";
import { openingsArmsFromFlag, openingsQuestionsFromFlag, type OpeningsArm, type OpeningsQuestion } from "./practice-openings-questions.js";
import { runPracticeOpenings } from "./practice-openings.js";
```

Then extend three existing imports:
- In the `@debateai/providers` import list, add `type PreviewBudgetPorts`, `type PreviewProviderTestConfig` and `type ProviderDiscoveryTarget`.
- Change `import { PRACTICE_LANES, type PracticeLane } from "./practice-lanes.js";` to `import { PRACTICE_CONTRACT_HASHES, PRACTICE_LANES, type PracticeLane } from "./practice-lanes.js";`.
- `PracticeGateName` is already imported from practice-gate-observer.js.

(c) Replace the `Args`, `VALUE_FLAGS`, `SWITCHES` declarations and the first line of `parsePracticeArgs`' body:

```ts
type Args = Readonly<{ mode: "formats" | "debate" | "openings" | "report"; flags: ReadonlyMap<string, string>; switches: ReadonlySet<string> }>;

const VALUE_FLAGS = new Set(["--settings", "--register-export", "--gate-status-deepinfra", "--gate-status-anthropic", "--out",
  "--samples", "--gap-ms", "--models", "--lanes", "--depth", "--question", "--max-in-flight", "--busy-wait-minutes", "--questions", "--arms"]);
const SWITCHES = new Set<string>(["--sequential", "--transcript", "--dry"]);

export function parsePracticeArgs(argv: readonly string[]): Args {
  const [mode, ...rest] = argv;
  if (mode !== "formats" && mode !== "debate" && mode !== "openings" && mode !== "report") {
    throw new PracticeRefusal("PRACTICE_MODE_REQUIRED", "formats, debate, openings or report");
  }
```

The rest of `parsePracticeArgs` stays as it is.

(d) In `runPractice`, replace the `let mode = ...` line with:

```ts
  let mode = argv[0] === "debate" ? "debate" : argv[0] === "report" ? "report" : argv[0] === "openings" ? "openings" : "formats";
```

Add right after `let samplesLog: PracticeSampleLog | null = null;`:

```ts
  // Openings: openings.jsonl, open from just before the first call to the end line.
  let openingsLog: OpeningsLog | null = null;
```

(e) In `abort`, insert this block right after `stop();` and before `if (samplesLog !== null && directory !== null) {`:

```ts
    if (openingsLog !== null && directory !== null) {
      const at = new Date();
      try { openingsLog.append({ kind: "abort", at: at.toISOString(), code }); } catch { /* the report below still names the abort */ }
      openingsLog.close();
      try {
        settled = write(openingsReportFromLog(readOpeningsLog(directory), { code, at }));
        return settled;
      } catch (error) {
        log(`openings log unreadable: ${error instanceof Error ? error.message : "UNKNOWN"}`);
      }
    }
```

(f) Insert this closure right after the line `options.onControl?.(Object.freeze({ stop, abort: (code: string) => abort(code).exitCode }));`:

```ts
  /** Mode openings: the log opened before the first call, the run, the end line, the report from the log (as formats). */
  const runOpeningsMode = async (setup: Readonly<{
    watched: PracticeGateObserver;
    config: PreviewProviderTestConfig;
    targets: readonly ProviderDiscoveryTarget[];
    ports: PreviewBudgetPorts;
    dry: boolean;
    folder: string;
    unsentStreakAtStart: Readonly<Record<PracticeGateName, number>>;
    gateLimits: Readonly<Record<PracticeGateName, number>>;
    before: Readonly<Record<PracticeGateName, PreviewGateRemaining | null>>;
    remainingPorts: ReturnType<typeof practiceRemainingPorts> | null;
    questions: readonly OpeningsQuestion[];
    arms: readonly OpeningsArm[];
    busyWaitMs: number;
    maxInFlight: number;
    sleep?: (milliseconds: number) => Promise<void>;
  }>): Promise<PracticeRunResult> => {
    let opened: OpeningsLog;
    try { opened = OpeningsLog.create(setup.folder); } catch (error) {
      if (error instanceof Error && error.message === "PRACTICE_OUT_ALREADY_HOLDS_OPENINGS") {
        // Another run's folder: its report is left as it is.
        directory = null;
        throw new PracticeRefusal("PRACTICE_OUT_ALREADY_HOLDS_OPENINGS", "use a new --out folder");
      }
      throw error;
    }
    openingsLog = opened;
    opened.append({ kind: "start", schema: OPENINGS_SCHEMA, mode: "openings", dry: setup.dry, startedAt: startedAt.toISOString(),
      models: setup.targets.map((target) => target.model), questions: setup.questions.map((question) => question.id), arms: setup.arms,
      busyWaitMs: setup.busyWaitMs, unsentStreakAtStart: setup.unsentStreakAtStart,
      remainingBefore: { deepinfra: remainingLine(setup.before.deepinfra), anthropic: remainingLine(setup.before.anthropic) } });
    setup.watched.listen({ event: (event) => opened.append({ kind: "wire", event }), stop: (gateStop) => opened.append({ kind: "stop", stop: gateStop }) });
    log(`openings: ${opened.path}`);
    log(`openings: ${String(setup.questions.length)} question(s), arms ${setup.arms.join(",")}${setup.dry ? ", dry (scripted answers, nothing spent)" : ""}`);
    const policy = previewRunnerPolicy({ bounds: DEVELOPMENT_ORGAN_COST_BOUNDS.organs, synthesisRolePolicy: {
      synthesizerBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.COMPOSER, evaluatorBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.CONFORMANCE } }, setup.config);
    const sleep = setup.sleep ?? options.sleep;
    await runPracticeOpenings({
      config: setup.config, targets: setup.targets, ports: setup.ports, observer: setup.watched,
      questions: setup.questions, arms: setup.arms, bound: policy.bounds.JUDGE,
      contractHashes: { judge: PRACTICE_CONTRACT_HASHES.judge, map: mapPromptContractHash() },
      ...(sleep === undefined ? {} : { sleep }),
      ...(options.random === undefined ? {} : { random: options.random }),
      progress: log, shouldStop: () => stopRequested, stopSignal: interrupted.signal, busyWaitMs: setup.busyWaitMs,
      gateLimits: setup.gateLimits, maxInFlight: setup.maxInFlight,
      onCall: (call) => opened.append({ kind: "call", call }),
      onArm: (arm) => opened.append({ kind: "arm", arm }),
      onBusy: (model) => opened.append({ kind: "busy", model }),
      onBusyWait: (wait) => opened.append({ kind: "busy-wait", ...wait })
    });
    if (settled !== null) return settled;
    const after = setup.remainingPorts === null ? { deepinfra: null, anthropic: null } : {
      deepinfra: await setup.remainingPorts.deepinfra().catch(() => null),
      anthropic: await setup.remainingPorts.anthropic().catch(() => null)
    };
    if (settled !== null) return settled;
    opened.append({ kind: "end", finishedAt: new Date().toISOString(), interrupted: stopRequested,
      remainingAfter: { deepinfra: remainingLine(after.deepinfra), anthropic: remainingLine(after.anthropic) } });
    opened.close();
    // The report is built from the log on the disk, as formats builds its own.
    return finish(openingsReportFromLog(readOpeningsLog(setup.folder)));
  };
```

(g) In the `try`, right after the `--transcript` check, insert:

```ts
    if (args.switches.has("--dry") && args.mode !== "openings") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--dry (openings mode only)");
    for (const flag of ["--questions", "--arms"]) {
      if (args.flags.has(flag) && args.mode !== "openings") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (openings mode only)`);
    }
    // Only fixed ids are accepted; the text of a refused value is never repeated (practice-openings-questions.ts).
    const openingsQuestions = args.mode === "openings" ? openingsQuestionsFromFlag(args.flags.get("--questions")) : [];
    const openingsArms = args.mode === "openings" ? openingsArmsFromFlag(args.flags.get("--arms")) : [];
```

(h) Right after the `if (args.mode === "report") { ... }` block, and before `directory = assertOutsideRepository(...)`, insert:

```ts
    if (args.mode === "openings" && args.switches.has("--dry")) {
      // --dry: the two gate ports are a script (practice-openings-dry.ts); no socket, settings or acknowledgement; nothing spent.
      const folder = assertOutsideRepository(args.flags.get("--out") ?? defaultReportDirectory(mode, startedAt), repositoryRoot());
      directory = folder;
      const watched = new PracticeGateObserver({});
      observer = watched;
      options.onObserver?.(watched, stop);
      const config = openingsDryConfig();
      const dry = openingsDryPorts();
      return await runOpeningsMode({ watched, config, targets: openingsDryTargets(config),
        ports: { deepinfra: watched.wrap("deepinfra", dry.ports.deepinfra), anthropic: watched.wrap("anthropic", dry.ports.anthropic) },
        dry: true, folder, unsentStreakAtStart: { deepinfra: 0, anthropic: 0 }, gateLimits: PRACTICE_FORMATS_DEFAULTS.gateLimits,
        before: { deepinfra: null, anthropic: null }, remainingPorts: null, questions: openingsQuestions, arms: openingsArms,
        busyWaitMs: 0, maxInFlight: PRACTICE_FORMATS_DEFAULTS.maxInFlight, sleep: async () => undefined });
    }
```

(i) Right after the `for (const gate of ["deepinfra", "anthropic"] as const) { ... before[gate] = answer; }` loop, and before `if (mode === "formats") {`, insert:

```ts
    if (args.mode === "openings") {
      // All the preview's AIs (spec §2: "all five preview AIs"); each must be enabled at its gate.
      const models = [...settings.previewConfig.premium_model_ids];
      for (const model of models) {
        const gate = previewModelRow(model)?.provider === "anthropic" ? "anthropic" : "deepinfra";
        if (!before[gate]!.enabledModels.includes(model)) throw new PracticeRefusal("PRACTICE_MODEL_NOT_ENABLED_AT_GATE", model);
      }
      const configured = PREVIEW_REVIEWED_PROVIDER_REFS.map((providerRef) => {
        const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
        return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
      });
      const declared = parseProviderDiscoveryTargets(settings.runner.PROVIDER_DISCOVERY_TARGETS_JSON, configured);
      return await runOpeningsMode({ watched: observer, config: settings.previewConfig, targets: onePerModel(declared, models),
        ports: budgetPorts, dry: false, folder: directory, unsentStreakAtStart, gateLimits, before, remainingPorts,
        questions: openingsQuestions, arms: openingsArms,
        busyWaitMs: wholeNumber(args, "--busy-wait-minutes", 30, 0, 240) * 60_000,
        maxInFlight: wholeNumber(args, "--max-in-flight", PRACTICE_FORMATS_DEFAULTS.maxInFlight, 1, 20) });
    }
```

(j) In the `catch` at the end of `runPractice`, change `if (samplesLog !== null) {` to `if (samplesLog !== null || openingsLog !== null) {`.

Edit `tools/preview-practice/README.md`.

1. Change the line `Two modes:` to `Three modes:`.
2. After the **debate** bullet, add this bullet:

```markdown
- **openings** (the debate-shape comparison, spec 2026-10-12 §2): on 12 fixed questions (6 Romanian, 6 English), the
  same AIs open each question four ways: **T** today's opening (every AI writes a full position, blind), **A** a
  snowball (the first AI lists points, each next AI sees them and adds only new ones), **B** blind lists (every AI
  lists points with no angle, then merge, one "what is missing?" round and choose) and **C** the angle map (one AI
  picks the angles, each AI lists points from its own angle, then merge, up to two "what is missing?" rounds and
  choose). The first AI changes from question to question. It is not a pass/fail test of the release: it collects the
  data the owners compare with their own method.
```

3. After the paragraph that ends with `... from a folder's samples.jsonl (nothing is sent; no socket or acknowledgement needed):` and its command block, add:

````markdown
### The openings record (openings mode)

Every call is written to `openings.jsonl` in the `--out` folder the moment it finishes. Each line holds:

- the arm, the question and the step;
- the AI and its maker;
- exactly what the AI could see (blind, or the ids of the points it was shown) and its place in the plan;
- its times, its tokens (in, out, reasoning) and its cost;
- its format check, and how a slip was fixed (by the short patch follow-up or by a full re-ask);
- the reply itself, with anything key-shaped blanked, at most 64 KiB.

After each arm of each question, one line holds what came out: the angles, the points with who raised them, the
merged answers, the chosen answers with their points for and against and their strongest rival, the points raised but
not chosen, and every fallback that was used.

`report.json` and `report.md` hold counts, cost, time, slips and fallbacks per arm. They never hold a quality score:
the comparison is the owners' own method, outside this repository.

Before the real run, run it dry. `--dry` answers from a script: no socket, no settings, no acknowledgement, and
nothing is spent. It goes through every arm, one repaired slip, one busy AI and the fallbacks, and ends
PASS_WITH_WARNINGS (exit 10). `P` is any folder outside the repository (S-5 makes one):

```sh
node_modules/.bin/tsx tools/preview-practice/practice.ts openings --dry --out "$P/openings-dry"
echo "exit: $?"
```
````

4. In S-6, after the debate command block, add:

````markdown
The openings comparison: one run, all five AIs, after a fresh S-3 gate status (about 350 calls; expected about $0.5
to $1 within the owners' test budget; several hours, because the slow models take 30 to 170
seconds a call):

```sh
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts openings --settings "$P/settings.env" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --out "$P/openings-report"
echo "exit: $?"
```
````

5. In "Optional flags", add:

```markdown
- openings: `--dry` (scripted answers, nothing spent), `--questions ro-euro,en-rent-caps,...` (only the fixed ids:
  ro-euro, ro-autobuze, ro-final-viata, ro-ciuperci, ro-strainatate, ro-hpv, en-nuclear, en-four-day-week,
  en-phones-school, en-retirement-age, en-social-media-age, en-rent-caps; default all twelve), `--arms T,A,B,C`
  (default all four), `--busy-wait-minutes N` and `--max-in-flight N` as in formats. A refused value is never
  repeated in the output.
```

6. In "## Files", add:

```markdown
- `practice-openings.ts` (the openings run), `practice-openings-questions.ts` (the 12 fixed questions),
  `practice-openings-log.ts` (openings.jsonl and its report), `practice-openings-dry.ts` (`--dry`'s scripted gates).
  The map itself is the package `packages/map`. Tests: `tests/unit/map-*.test.ts`, `tests/unit/practice-openings*.test.ts`.
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm exec vitest run tests/unit/practice-openings-cli.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Final verification (one heavy command at a time, never together)**

```sh
pgrep -f "vitest[ ]run" || echo "no test run in progress"
pnpm run typecheck
```

Expected: no errors. Typecheck is heavy, so run it alone.

```sh
pnpm exec vitest run tests/unit/map-package.test.ts tests/unit/map-items.test.ts tests/unit/map-prompts.test.ts tests/unit/map-replies.test.ts tests/unit/map-specs.test.ts tests/unit/map-keypoints.test.ts tests/unit/map-choose.test.ts tests/unit/map-roles.test.ts tests/unit/map-orchestrator.test.ts tests/unit/practice-openings-log.test.ts tests/unit/practice-openings.test.ts tests/unit/practice-openings-cli.test.ts
```

Expected: all 12 files PASS.

```sh
pnpm exec vitest run tests/architecture/scaffold.test.ts tests/architecture/no-machine-paths.test.ts tests/unit/preview-practice.test.ts tests/unit/preview-practice-slips.test.ts tests/unit/preview-practice-wiring-drift.test.ts tests/unit/prompt-surface-guard.test.ts tests/unit/hs-s01-seal.test.ts tests/unit/text-control-bytes.test.ts
```

Expected: all PASS. These check the following:
- the new edge row and the source rules over the new tools/ and packages/ files (no `process` + `.env` text, no switch without exhaustive, no bare numeric ALL_CAPS export);
- no machine paths;
- that the formats/debate practice is unchanged;
- the judgement prompt surface, untouched;
- the sealed judge hash, untouched;
- no control bytes.

The integration test `tests/integration/preview-practice-run.test.ts` is not run here; it is local-only and heavy. It exercises the formats and debate modes, which this plan only touches through two `export` keywords and the closure above. Run it alone, by hand, before the branch is merged.

- [ ] **Step 6: Commit**

```sh
git add tools/preview-practice/practice.ts tools/preview-practice/README.md tests/unit/practice-openings-cli.test.ts
git commit -F - <<'MSG'
Preview practice: the openings command (--dry, --questions, --arms) and its README

Mode openings runs the debate-shape comparison through the same start checks, gates and refusals as formats, with
openings.jsonl written as it goes and the report built from it on every way out (end, Ctrl-C, a second Ctrl-C, a
crash). --dry swaps the gates for a script and spends nothing; --questions and --arms choose only among fixed ids.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

## Self-review against the spec (Phase 1 only)

| Spec item (docs/superpowers/specs/2026-10-12-debate-shape-design.md) | Task |
|---|---|
| §1.1 angle planner: 4–7 angles, three fixed kinds + 1–4 specific | 3 (form), 4 (schema + check), 8 (order), 9 (step) |
| §1.1 angle list: 3–8 points `{claim ≤240, why ≤240, leans}` + 1–3 candidate answers, blind, in parallel | 3, 4, 5, 9 |
| §1.1 merge: opaque item ids, never authors; groups for points and answers | 2 (ids), 5 (material), 6 (apply), 9 |
| §1.1 gap rounds: plain labels, never counts or authors; ≤3 framing challenges; stop below 2 new points; maker that did not merge, no-list maker preferred | 3, 4, 5, 6, 8, 9 |
| §1.1 choose: 2–4 answers with ranked for/against and strongest rival; points tagged by code with blind-maker count and fixed angle | 3, 4, 5, 7, 9 |
| §1.1 who raised what, computed by code; blind and gap kept apart | 2, 6 |
| §1.1 choose quotas → CHOOSE_QUOTA_FILLED | 7 |
| §1.1 distinct answers → ANSWERS_FILLED | 7 |
| §1.1 everything not chosen is kept ("also raised") | 7 (`alsoRaised`), 10 (arm line keeps the map) |
| §1.1 strict schemas with the repair path (patch follow-up, then full re-ask) | 4 (repair-format refusals, patch plan test), 5 (repair packet), 11 (PATCH through the real gateway) |
| §1.1 question's language (argument-language directive) | 3 (directive), 4 (wrong-language check), 11 (dry text per language) |
| §1.2 MAP_ANGLES_FALLBACK, list reassign/drop, MAP_MERGE_FALLBACK, gap skip, MAP_CHOOSE_FALLBACK, MAP_UNAVAILABLE_TODAYS_OPENING | 6, 7, 8, 9 |
| §1.1 roles: merger never the chooser's maker; rotation | 8, 9 |
| §2 mode `openings`: same gates, relay, refusals, busy handling, redaction, outside-repo folder as formats | 11, 12 |
| §2 12 fixed questions, 6 ro / 6 en, five kinds, never from the command line | 10, 12 |
| §2 arms T (today's contract unchanged), A (snowball, first AI rotates), B, C | 9, 11 |
| §2 openings.jsonl per finished reply: arm, question, step, AI, maker, what it saw, order, timing, tokens, cost, format check, reply text | 10, 11, 12 |
| §2 report.json / report.md: counts, cost, time, slips, fallbacks per arm; no quality score | 10, 12 |
| §2 `--dry` scripted, spends nothing | 11, 12 |
| §4 prompts owner-editable, fingerprinted | 3 |
| §5 practice tests: `openings --dry` | 11, 12 |
| §3.4 call-site keys `MAP:angles`, `MAP:list:<i>`, `MAP:merge`, `MAP:gap:<k>`, `MAP:choose` | 9 |
| §3.5 saved order is the plan order | 9 ("records the same map whatever order the parallel lists finish in") |

Placeholder scan: every step has full code or exact edits. Names used across tasks:
- `MapStepSpec`, `MapCaller`, `MapCallRequest`, `MapCallOutcome`, `MapRunInput`, `MapResult`
- `mapProviderPieces`, `mapRunAngleMap`, `mapRunBlindLists`, `mapRunSnowball`, `mapRotateSeats`
- `OpeningsCall`, `OpeningsArmLine`, `OpeningsLog`, `openingsReportFromLog`, `runPracticeOpenings`, `openingsDryPorts`

Each is defined in the task listed in its Interfaces.

Choices made by ruling (2026-10-12, coordinator):
- quotas over the whole chosen set;
- a quota is met by any point of its kind;
- "exactly one AI" counts blind and gap makers;
- lists = min(angles, AIs);
- reassignment is deterministic, in plan order;
- a failed gap round is skipped without the stop rule;
- arm A ends in choose;
- `--dry` ends PASS_WITH_WARNINGS;
- item ids are at most 8 characters;
- the fallback angle texts are English prompt material;
- the "negation" fill tries an OPPOSITE_CASE list's candidate before the template.

Left for Phase 2 (not in this plan; noted so nothing is lost):
- **The template in every locale.** The code template for the last-resort second answer (`mapOppositeTemplate`) exists in en and ro only. Phase 2 serves this text to users, so it needs all 35 locales (the same translator flow as the /new strings), or a rule that never shows a template-filled answer.
- **A debate role for map calls.** Map calls use the gateway role `JUDGE` and lane `served`, because the preview's format repair is allowed only for JUDGE / SYNTHESIZER / EVALUATOR on the served lane (`previewFormatRepairAllowed`). Their `modelRole` is left empty. The scorecard's job vocabulary (kernel `DEBATE_ROLES`, migration 0090's CHECK) has no map job yet. Phase 2 should decide whether to add one (for example `MAP`) and record it on every map call.
- **The register seal.** `mapPromptContractHash()` must be sealed in a new register version (the owner-editable prompts rule), and the marks added to the kernel's `CONDITION_MARKS` with typed records.
- **Attaching from the runner.** `packages/map` has no production caller until apps/runner calls it. Its edge row then gains the runner (`"map"` added to apps/runner's allowed list in tools/orphan-audit), and the orphan audit's reachability sees it from the runner's entry point.
