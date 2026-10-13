# Debate Shape Phase 2d (practice and proof) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the practice tool run a whole practice debate in the new debate shape, on the live register's exact settings plus the owners' switch, in the throwaway database only. Make its report and transcript show what the shape did. Prove a whole new-shape debate end to end against the scripted gates. Document the operator procedure for the whole-debate comparison of today's shape and the new shape.

**Architecture:**

- **The switch, in the throwaway database only.** `practice.ts debate` gains four debate-only flags:
  - `--shape-policy FILE` is read and checked by P2a's own parser (`parseDebateShapePolicy`). After the live register is imported as today, the practice publishes ONE more register version in the throwaway database, through the register's own general publication. It is the last exported version's rows with the `debateShapePolicy` row added, or replaced if the export already holds one.
  - The practice then hands this version number to both of its compositions (the ask path and the runner), so both read the row exactly as the live services would.
  - The export file is only read. The live register is never reachable: the practice has no live database connection.
  - `--depth-mode`, `--scrutiny` and `--answer-length` become the practice ask's `depth_params` fields.
- **The report.** A new module, `tools/preview-practice/practice-shape.ts`, reads after the run, before the throwaway database is deleted:
  - the run's stored `depth_params` and the sizes frozen on its receipt (`envelope_basis.shape`, P2a);
  - the answer's condition marks;
  - the `MAP:*` ledger calls;
  - P2b's map choice.

  It builds an optional `shape` block for `report.json`, a "Debate shape" paragraph for `report.md`, and `structure.map` for `transcript.json`. A shape run whose map fell back to today's opening is NOT_PROVEN, never PASS.
- **Map calls.** They join the practice's own accounting as the call family `MAP`: format re-check, slip rule, per-site rows and transcript family.
- **The proof.** The scripted gate doubles answer map steps with the openings dry script's own replies, plus a two-answer choose. New integration cases in `tests/integration/preview-practice-run.test.ts` run:
  - a whole new-shape debate (PASS, served answer, READY story handed `also_raised`);
  - a row-absent debate with nothing new in it;
  - the two refusals.
- **The comparison procedure.** README step S-8 runs today's shape and the new shape on four fixed questions at depth 1 with all five AIs: two `--out` folders per question, within the daily test budget, after the pass bar. The results are judged by the owners' private method, outside this repository.

**Tech Stack:** TypeScript (ESM, NodeNext, strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), zod 4.4.3 (through `@debateai/contract` and `@debateai/map`), vitest, pnpm 11.20.0, Node >= 26.8.2, embedded PostgreSQL 18 (integration).

**Spec:** docs/superpowers/specs/2026-10-12-debate-shape-design.md: §5 Tests ("Practice"), §3.3 run flow (what the report counts) and ruling S9. Binding names: docs/superpowers/plans/2026-10-12-debate-shape-phase2-INTERFACE.md, §6 and §1–§5 as consumed. Siblings: docs/superpowers/plans/2026-10-12-debate-shape-phase2a.md, docs/superpowers/plans/2026-10-12-debate-shape-phase2c.md and P2b (docs/superpowers/plans/2026-10-12-debate-shape-phase2b.md, still being drafted when this plan was written; see Task 0 and "Contract deviations").

All paths are relative to the engine folder `dialectical-engine/` of the worktree `.claude/worktrees/debate-shape` (branch `design/2026-10-12-debate-shape`). Every command runs from that folder: `cd "$(git rev-parse --show-toplevel)/dialectical-engine"`.

## Global Constraints

**Where and what**

- Work only in this worktree's engine folder. Never touch the main checkout.
- Never read `settings.env`, a register export from a server, or any key file. The tests write their own fixture settings.
- Owner sessions share worktrees: commit only the files the task names, never an edit you did not make.

**Order**

- Run this plan after P2a, P2b and P2c are merged into this branch, in that order (INTERFACE). Task 0 checks this and stops on any gap.

**The throwaway register only**

- `--shape-policy` never writes the export file and never connects to anything but the throwaway database.
- The practice's own version is published with `deployment: "local"` and the source ref `PRACTICE_SHAPE_SOURCE_REF`. Every other row keeps its exported bytes and its exported source ref.

**Row absent means today**

- Without `--shape-policy`, on a register without the row, the debate command, the ask, `report.json`'s keys, `report.md` and `transcript.json`'s keys stay as today.
- There is no `shape` key, no `structure.map` key and no MAP site.

**Flags**

- The four new flags are debate-only. Every other mode refuses them with `PRACTICE_FLAG_VALUE_INVALID: <flag> (debate mode only)`.
- An unknown flag stays `PRACTICE_FLAG_UNKNOWN`, refused before anything starts. A refused value is never repeated in output.
- A policy refusal names only the place in the file (the zod path), never the file's content.

**Source rules** (tools/orphan-audit `auditSourceRules`, pinned by tests/architecture/scaffold.test.ts). Keep them in every new or edited `.ts` under `tools/`:

- no `process` + `.env` text, even in a comment (the practice reads its three environment keys only through `readOperatorCommandEnvironment`);
- no `switch (` in new code (use lookups or `if` chains);
- no exported ALL_CAPS constant equal to a bare number;
- no import specifier containing `test` or `fixture` in `tools/` code.

**Depth-literal oracle.** Keep any bare `5` off a line that mentions "depth" in any case.

**What people see.** `report.md` shows counts and codes only, never reply text. The README says what the procedure does, never how results are judged: "results are judged by the owners' private method, outside this repository".

**Running tests** (one heavy test run at a time on the owner's 16 GB Mac):

- Before any `vitest run` or typecheck, `pgrep -fl 'vitest[ ]run'` shows at most one other run (count runs, not processes), and `memory_pressure | tail -1` shows free memory of at least 40%.
- Integration suites run ONE AT A TIME, never beside a unit run or the typecheck.
- Commands:
  - unit: `pnpm exec vitest run tests/unit/<file>.test.ts`;
  - integration: `pnpm exec vitest run tests/integration/<file>.test.ts` (embedded PostgreSQL), optionally with `-t "<name part>"`;
  - typecheck: `pnpm run typecheck`.

**Commits.** Each commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push and do not open a PR inside this plan.

**Subagents.** Haiku runs with effort `xhigh` for mechanical jobs; Opus runs with effort `high` for hard ones. Every Opus subagent prompt says it may spawn its own haiku/opus subagents and should when useful. Subagents run in the foreground.

## Review Focus

Five failure modes that ordinary tests would miss. Each one has a named test in the task that owns it.

1. **The override leaks out of the throwaway database, or quietly changes other settings.**
   - Ways it could happen:
     - the export file is rewritten;
     - a copied row gets the practice's source ref or a new byte;
     - the debate runs on the export's own version number while the report claims the practice version.
   - Tests:
     - Task 2, `adds the row to the export's LAST version's rows, keeps every other row byte for byte, in key order`;
     - Task 6, `--shape-policy … PASS` (the export file's SHA-256 is unchanged; `shape.registerVersion` and the transcript's `run.registerVersion` are both `"6"`).
2. **The ask path and the runner read different register versions.**
   - The ask stores `{ depth }` while the runner argues the new shape, or the other way round. The money estimate then no longer matches the run.
   - Test: Task 6, `--shape-policy … PASS`. It checks that `storedDepthParams` holds all four keys (the ask path saw the row), `sizes` is not null (admission froze a shape), and MAP calls happened (the runner ran it).
3. **A "new shape" practice that never ran the new shape reads as PASS.**
   - Example: the map fell back to today's opening, or admission froze no shape.
   - Tests: Task 4, `says when the new shape was not exercised` and `a shape run that did not exercise the shape is NOT_PROVEN, never PASS`.
4. **Map calls fall outside the practice's own accounting.**
   - Today `callFamilyOf("MAP:list:0")` is `UNMAPPED` and its re-check says `UNMAPPED`, so a map slip would be diagnosed wrongly and rows would sort as unknown.
   - Tests:
     - Task 3, `names the map family and step from the call-site key` and `re-checks a map reply by its step's own schema`;
     - Task 6 (a `MAP` row in `byModelAndSite`, MAP attempts in the transcript).
5. **The row-absent practice drifts from today.**
   - Ways it could drift: a `shape: null` key, a changed `ask` block, an `also_raised` field sent to the storyteller, or the stubs' new MAP classification catching a request it used to answer.
   - Tests:
     - Task 6, `no --shape-policy and a register without the row: today's shape, nothing new in the report, no map call`;
     - Task 8, which re-runs the whole practice integration file and `tests/integration/preview-busy-model-run.test.ts`, the other user of the gate doubles.

## Contract deviations

From INTERFACE §6 and Project 1's pattern. Each is deliberate.

1. **A register version, not a value handed to the runner.**
   - Project 1's `--call-concurrency` hands its policy straight to the practice runner and writes no register.
   - The debate-shape row is read by BOTH the ask path (P2a: normalisation, sizes, the estimate) and the runner (P2b). So the practice publishes one more version (export's last + 1) in the throwaway database and runs both compositions on it, as INTERFACE §6 says ("adds a `debateShapePolicy` row to the THROWAWAY database's register only").
   - The settings file's `REGISTER_VERSION` must still equal the export's last version; only the practice's in-memory copy of the settings moves to the new number.
2. **More in the report block than INTERFACE §6 lists.** INTERFACE names map marks, chosen answers count, also-raised count, panel extensions and scrutiny extensions. The task also needs the opening used and per-step map call counts. The block also carries `source`, `registerVersion`, `row`, `asked`, `storedDepthParams`, `sizes` and `notExercised`, so each comparison run says exactly what it ran on.
3. **A new verdict reason.** `SHAPE_NOT_EXERCISED:<why>` makes a run NOT_PROVEN (exit 30). `<why>` is `MAP_UNAVAILABLE_TODAYS_OPENING`, `NO_SHAPE_ON_RECEIPT` or `FACTS_UNREADABLE:<code>`. Map fallbacks other than the whole map failing (`MAP_MERGE_FALLBACK` and the rest) do not change the verdict: a failed call is already FAIL by the format and call rules, and a busy seat follows the busy rules.
4. **`--question` gains the comparison's four fixed ids:** `ro-euro`, `ro-strainatate`, `en-nuclear`, `en-social-media-age`.
   - They are word for word the openings questions of the same id, so the Phase 1 data lines up.
   - The question is now checked before anything starts. A wrong id was a late `TypeError:PRACTICE_QUESTION_UNKNOWN`; it is now `PRACTICE_FLAG_VALUE_INVALID: --question (…)`.
5. **The three ask flags need a row.** Without a debate-shape row, P2a's normalisation would drop them silently. So the practice refuses them (`PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW`) after the import and before any model call.
6. **P2b names this plan assumes.** INTERFACE §4 names only `readMapChoiceForRun(runId)`. This plan assumes the following; Task 0 checks each one:
   - `@debateai/db` exports `readMapChoiceForRun(pool, runId)`, returning P2c's `MapChoiceRecord` shape (`answers[]`, `alsoRaised[]`) or `null`;
   - `@debateai/db` exports `readMapItemsForRun(pool, runId)`, returning the decrypted items;
   - the extension and map marks land in `serve.condition_mark` under their INTERFACE codes;
   - `tools/preview-practice/practice-runner-composition.ts` reads `readDebateShapePolicy(pool, environment.REGISTER_VERSION)` as `apps/runner/src/main.ts` does.

   If P2b's readers have another form, only the adapter `practiceMapReaders` in `practice-shape.ts` changes; report that change. If a reader is missing, STOP: this plan never adds code to P2b's encrypted map carriers.
7. **No supersession of the policy-hash rows.** The practice version copies `policy.hashes.*` unchanged. Task 0 checks that the runner reads no map hash from the register. If P2b's runner needs a `map` hash the live register lacks, STOP and report: whether the practice version may carry candidate hashes is a ruling for the controller.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `tools/preview-practice/practice-shape.ts` | create | The four flags (`practiceShapeOverrideFromArgs`); the shape facts reader, the report block and its plain lines; the map readers adapter |
| `tools/preview-practice/shape-policy-start.json` | create | The owners' start values (S5–S8) as a policy file for `--shape-policy` |
| `tools/preview-practice/practice-questions.ts` | modify | `PRACTICE_COMPARISON_QUESTION_IDS`, `practiceDebateQuestion` |
| `tools/preview-practice/practice.ts` | modify | Flags known, checked before anything starts, handed to the debate |
| `tools/preview-practice/practice-register-import.ts` | modify | `practiceShapeVersionRows`, `publishPracticeShapeVersion`, `PRACTICE_SHAPE_SOURCE_REF` |
| `tools/preview-practice/practice-debate.ts` | modify | Publish the practice version, run both compositions on it, ask fields, shape block, transcript map, `MAP` roster order |
| `tools/preview-practice/practice-lanes.ts` | modify | `MAP` call family, `practiceMapStepOf`, map re-check |
| `tools/preview-practice/practice-verdict.ts` | modify | `shapeNotExercised` → NOT_PROVEN |
| `tools/preview-practice/practice-report.ts` | modify | `shape` in report.json, "Debate shape" lines in report.md |
| `tools/preview-practice/practice-transcript.ts` | modify | Optional `structure.map` |
| `tools/preview-practice/README.md` | modify | "The new debate shape" section, flags, files, S-8 comparison procedure, money and time |
| `tests/support/preview-gate-stubs.ts` | modify | `MAP` request kind, `stubMapContent` |
| `tests/unit/preview-practice-shape.test.ts` | create | Tasks 1–4 and 7 unit tests |
| `tests/unit/preview-practice-transcript.test.ts` | modify | `structure.map` present only with a map |
| `tests/integration/preview-practice-run.test.ts` | modify | New describe: the new debate shape |

---

### Task 0: Preconditions: P2a, P2b and P2c are in this branch

**Files:** none edited.

- [ ] **Step 1: Project 1 and P2a**

Run: `git merge-base --is-ancestor feat/2026-10-12-parallel-calls HEAD && echo P1-IN`
Expected: `P1-IN`.

Run: `grep -n "export function parseDebateShapePolicy\|export function debateShapePolicyStartValues\|export function debateShapePolicyRow\|export async function readDebateShapePolicy" packages/register/src/debate-shape-policy.ts`
Expected: four lines.

Run: `grep -n "readDebateShapePolicy" tools/preview-practice/practice-ask-composition.ts`
Expected: at least one line (P2a Task 8 step 6).

Run: `grep -n "shape?: DebateShapeCeilingInput\|readonly shape?" packages/budget/src/index.ts`
Expected: at least one line (P2a: `CostEnvelopeBasis.shape`).

- [ ] **Step 2: P2b**

Run: `grep -rn "export async function readMapChoiceForRun\|export async function readMapItemsForRun\|export function readMapChoiceForRun\|export function readMapItemsForRun" packages/db/src`
Expected: both names, each as a free function taking `(pool, runId)`.

- If either is a method of a repository class, note its exact form. Task 4 then adapts only `practiceMapReaders`.
- If either is missing, STOP and report BLOCKED with the output.

Run: `grep -n "readDebateShapePolicy" tools/preview-practice/practice-runner-composition.ts apps/runner/src/main.ts`
Expected: a line in each file. If the practice runner composition has none, STOP: P2b must mirror main.ts there (the wiring-drift rule).

Run: `grep -n "assertDebateShapeRunnerReady" apps/runner/src/main.ts packages/register/src/debate-shape-policy.ts`
Expected: no output. P2b removed the Phase-2a guard.

Run: `grep -n "\"PANEL-CLOSE-CALL-EXTENDED\"\|\"SCRUTINY-EXTENDED\"\|\"MAP_UNAVAILABLE_TODAYS_OPENING\"\|\"ANSWERS_FILLED\"" packages/kernel/src/index.ts`
Expected: four lines (the codes in `CONDITION_MARKS`).

Run: `grep -n "hashes.map\|hashes\[\"map\"\]" apps/runner/src/main.ts tools/preview-practice/practice-runner-composition.ts apps/runner/src/dev-runner-policy.ts`
Expected: no output. If any line prints, STOP and report (Contract deviation 7).

- [ ] **Step 3: P2c**

Run: `grep -n "also_raised" packages/story/src/material.ts | head -3`
Expected: at least one line (the storyteller's `also_raised` field).

- [ ] **Step 4: The practice tests are green before any edit**

Check memory and runs as the Global Constraints say, then run: `pnpm exec vitest run tests/unit/preview-practice.test.ts`
Expected: PASS. If it is red before any edit, STOP and report: this plan does not repair others' reds.

---

### Task 1: The four debate flags, the start-values file and the comparison questions

**Files:**
- Create: `tools/preview-practice/practice-shape.ts` (flags part)
- Create: `tools/preview-practice/shape-policy-start.json`
- Modify: `tools/preview-practice/practice-questions.ts`
- Modify: `tools/preview-practice/practice.ts` (`VALUE_FLAGS`, the checks after `--dry`, the `runPracticeDebate` call)
- Test: `tests/unit/preview-practice-shape.test.ts` (create)

**Interfaces:**
- Consumes: `parseDebateShapePolicy`, `DebateShapePolicy` (P2a, `@debateai/register`); `DepthModeSchema`, `ScrutinySchema`, `AnswerLengthSchema`, `DepthMode`, `Scrutiny`, `AnswerLength` (P2a, `@debateai/contract`); `OPENINGS_QUESTIONS` (practice-openings-questions.ts); `PracticeRefusal` (practice-settings.ts).
- Produces:
```ts
// tools/preview-practice/practice-shape.ts
export const PRACTICE_SHAPE_FLAGS: readonly ["--shape-policy", "--depth-mode", "--scrutiny", "--answer-length"];
export type PracticeShapeAsk = Readonly<{ depthMode?: DepthMode; scrutiny?: Scrutiny; answerLength?: AnswerLength }>;
export type PracticeShapeOverride = Readonly<{ policy: DebateShapePolicy | null; ask: PracticeShapeAsk }>;
export function parsePracticeShapePolicyText(text: string): DebateShapePolicy;
export function practiceShapeOverrideFromArgs(mode: string, flags: ReadonlyMap<string, string>, read?: (path: string) => string): PracticeShapeOverride | null;
// tools/preview-practice/practice-questions.ts
export const PRACTICE_COMPARISON_QUESTION_IDS: readonly ["ro-euro", "ro-strainatate", "en-nuclear", "en-social-media-age"];
export type PracticeDebateQuestion = Readonly<{ id: string; questionLine: string }>;
export function practiceDebateQuestion(id: string): PracticeDebateQuestion;
```

- [ ] **Step 1: Write the failing test** `tests/unit/preview-practice-shape.test.ts`

```ts
// The preview practice's debate-shape support (spec 2026-10-12 §5 "Practice"; plan 2026-10-12-debate-shape-phase2d):
// the four debate-only flags, the start-values file, the comparison's fixed questions, the throwaway register version,
// the map calls in the practice's accounting, the report's shape block and the README's commands.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { debateShapePolicyStartValues, parseDebateShapePolicy } from "@debateai/register";
import { parsePracticeArgs } from "../../tools/preview-practice/practice.js";
import { OPENINGS_QUESTIONS } from "../../tools/preview-practice/practice-openings-questions.js";
import { PRACTICE_COMPARISON_QUESTION_IDS, practiceDebateQuestion } from "../../tools/preview-practice/practice-questions.js";
import { practiceShapeOverrideFromArgs } from "../../tools/preview-practice/practice-shape.js";

const START_TEXT = readFileSync(new URL("../../tools/preview-practice/shape-policy-start.json", import.meta.url), "utf8");
const flags = (entries: Readonly<Record<string, string>>): ReadonlyMap<string, string> => new Map(Object.entries(entries));
const readStart = (): string => START_TEXT;

describe("practice debate shape: the flags", () => {
  it("the start-values file is exactly the owners' start values (rulings S5-S8)", () => {
    expect(parseDebateShapePolicy(JSON.parse(START_TEXT))).toEqual(debateShapePolicyStartValues());
  });

  it("no shape flag: nothing (today's debate command is unchanged)", () => {
    expect(practiceShapeOverrideFromArgs("debate", flags({ "--depth": "1", "--question": "ro" }), readStart)).toBeNull();
  });

  it("reads --shape-policy and the three ask settings", () => {
    const override = practiceShapeOverrideFromArgs("debate", flags({ "--shape-policy": "x.json", "--depth-mode": "fixed",
      "--scrutiny": "deep", "--answer-length": "short" }), readStart);
    expect(override).toEqual({ policy: debateShapePolicyStartValues(), ask: { depthMode: "fixed", scrutiny: "deep", answerLength: "short" } });
  });

  it("the ask settings alone (for a register that holds its own row): no policy of its own", () => {
    expect(practiceShapeOverrideFromArgs("debate", flags({ "--answer-length": "detailed" }), readStart))
      .toEqual({ policy: null, ask: { answerLength: "detailed" } });
  });

  it.each(["formats", "openings", "report"])("refuses every shape flag outside debate mode (%s)", (mode) => {
    for (const flag of ["--shape-policy", "--depth-mode", "--scrutiny", "--answer-length"]) {
      expect(() => practiceShapeOverrideFromArgs(mode, flags({ [flag]: "x" }), readStart))
        .toThrow(`PRACTICE_FLAG_VALUE_INVALID: ${flag} (debate mode only)`);
    }
  });

  it("refuses a value outside each setting's list, naming only the flag", () => {
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--depth-mode": "manual" }), readStart))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --depth-mode \(fixed or adaptive\)$/u);
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--scrutiny": "max" }), readStart))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --scrutiny \(standard, deep or exhaustive\)$/u);
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--answer-length": "long" }), readStart))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --answer-length \(short, standard or detailed\)$/u);
  });

  it("refuses a policy file that does not pass the register's own check, naming only where in the file", () => {
    const shape = (edit: (value: { version: number; plans: { pro: { answers: number } } }) => void): string => {
      const value = JSON.parse(START_TEXT) as { version: number; plans: { pro: { answers: number } } };
      edit(value);
      return JSON.stringify(value);
    };
    const policyOf = (text: string) => () => practiceShapeOverrideFromArgs("debate", flags({ "--shape-policy": "x.json" }), () => text);
    expect(policyOf(shape((value) => { value.version = 2; }))).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: version$/u);
    expect(policyOf(shape((value) => { value.plans.pro.answers = 9; }))).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: plans\.pro\.answers$/u);
    expect(policyOf("{ not json")).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: \$$/u);
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--shape-policy": "x.json" }), () => { throw new Error("ENOENT"); }))
      .toThrow(/^PRACTICE_SHAPE_POLICY_UNREADABLE$/u);
  });

  it("the command line refuses a mistyped flag and a missing value before anything starts", () => {
    expect(() => parsePracticeArgs(["debate", "--shape-polcy", "x.json"])).toThrow("PRACTICE_FLAG_UNKNOWN");
    expect(() => parsePracticeArgs(["debate", "--shape-policy"])).toThrow("PRACTICE_FLAG_VALUE_MISSING");
    expect(parsePracticeArgs(["debate", "--shape-policy", "x.json", "--depth-mode", "adaptive", "--scrutiny", "standard",
      "--answer-length", "standard"]).flags.size).toBe(4);
  });
});

describe("practice debate questions: the comparison's four fixed questions", () => {
  it("ro and en as before; the four comparison ids word for word from the openings set", () => {
    expect(practiceDebateQuestion("ro").id).toBe("ro");
    expect(practiceDebateQuestion("en").id).toBe("en");
    expect(PRACTICE_COMPARISON_QUESTION_IDS).toEqual(["ro-euro", "ro-strainatate", "en-nuclear", "en-social-media-age"]);
    for (const id of PRACTICE_COMPARISON_QUESTION_IDS) {
      expect(practiceDebateQuestion(id)).toEqual({ id, questionLine: OPENINGS_QUESTIONS.find((question) => question.id === id)!.questionLine });
    }
  });

  it("refuses any other id without repeating it", () => {
    expect(() => practiceDebateQuestion("ro-ciuperci")).toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --question \(/u);
    expect(() => practiceDebateQuestion("my own question?")).toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --question \(ro, en/u);
    try { practiceDebateQuestion("my own question?"); } catch (error) { expect(String(error)).not.toContain("my own question"); }
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: FAIL: `practice-shape.js` and `shape-policy-start.json` do not exist.

- [ ] **Step 3: Create** `tools/preview-practice/shape-policy-start.json`

```json
{
  "kind": "DEBATE_SHAPE_POLICY",
  "version": 1,
  "plans": {
    "free": {
      "mapAIs": 3, "answers": 3, "graders": 2, "pointsPerAnswer": 3, "deeperTopPoints": 1, "gapRoundsMax": 1,
      "closeCallExtraGraders": 2, "fixedDepthAllowed": false,
      "scrutiny": { "deep": null, "exhaustive": null, "scrutinyLeverageMin": 0.05, "scrutinyWeakBelow": 0.5 },
      "opening": "ANGLE_MAP"
    },
    "plus": {
      "mapAIs": 4, "answers": 3, "graders": 3, "pointsPerAnswer": 4, "deeperTopPoints": 2, "gapRoundsMax": 2,
      "closeCallExtraGraders": 2, "fixedDepthAllowed": true,
      "scrutiny": { "deep": { "roundsPerPoint": 2, "pointsPerDebate": 6 }, "exhaustive": { "roundsPerPoint": 3, "pointsPerDebate": 15 },
        "scrutinyLeverageMin": 0.05, "scrutinyWeakBelow": 0.5 },
      "opening": "ANGLE_MAP"
    },
    "pro": {
      "mapAIs": 5, "answers": 4, "graders": 3, "pointsPerAnswer": 4, "deeperTopPoints": 2, "gapRoundsMax": 2,
      "closeCallExtraGraders": 2, "fixedDepthAllowed": true,
      "scrutiny": { "deep": { "roundsPerPoint": 2, "pointsPerDebate": 6 }, "exhaustive": { "roundsPerPoint": 3, "pointsPerDebate": 15 },
        "scrutinyLeverageMin": 0.05, "scrutinyWeakBelow": 0.5 },
      "opening": "ANGLE_MAP"
    },
    "max": {
      "mapAIs": 7, "answers": 4, "graders": 3, "pointsPerAnswer": 4, "deeperTopPoints": 2, "gapRoundsMax": 2,
      "closeCallExtraGraders": 2, "fixedDepthAllowed": true,
      "scrutiny": { "deep": { "roundsPerPoint": 2, "pointsPerDebate": 6 }, "exhaustive": { "roundsPerPoint": 3, "pointsPerDebate": 15 },
        "scrutinyLeverageMin": 0.05, "scrutinyWeakBelow": 0.5 },
      "opening": "ANGLE_MAP"
    },
    "premium": {
      "mapAIs": 5, "answers": 4, "graders": 3, "pointsPerAnswer": 4, "deeperTopPoints": 2, "gapRoundsMax": 2,
      "closeCallExtraGraders": 2, "fixedDepthAllowed": true,
      "scrutiny": { "deep": { "roundsPerPoint": 2, "pointsPerDebate": 6 }, "exhaustive": { "roundsPerPoint": 3, "pointsPerDebate": 15 },
        "scrutinyLeverageMin": 0.05, "scrutinyWeakBelow": 0.5 },
      "opening": "ANGLE_MAP"
    }
  },
  "answerLength": {
    "short": { "words": 300, "writerBound": 8192 },
    "standard": { "words": 700, "writerBound": 12288 },
    "detailed": { "words": 1500, "writerBound": 16384 }
  }
}
```

- [ ] **Step 4: Create** `tools/preview-practice/practice-shape.ts` (flags part; Task 4 appends the report part)

```ts
/**
 * Preview practice, mode "debate": the new debate shape (spec docs/superpowers/specs/2026-10-12-debate-shape-design.md
 * §5 "Practice"; plan 2026-10-12-debate-shape-phase2d).
 *
 * Plain words: the shape is switched on by one register row, debateShapePolicy, and the live preview has none. So a
 * practice debate runs today's shape unless it is asked for the new one:
 *  - `--shape-policy FILE`: the row from FILE, checked by the register's own parser, is put into the practice's
 *    THROWAWAY register only (practice-register-import.ts publishPracticeShapeVersion); the export file is only read
 *    and the live register is never reached;
 *  - `--depth-mode`, `--scrutiny`, `--answer-length`: the practice ask's settings, as the /new page sends them.
 * The four flags are debate-only; a refused value is never repeated, a refused file is named only by where it is wrong.
 */
import { readFileSync } from "node:fs";
import {
  AnswerLengthSchema,
  DepthModeSchema,
  ScrutinySchema,
  type AnswerLength,
  type DepthMode,
  type Scrutiny
} from "@debateai/contract";
import { parseDebateShapePolicy, type DebateShapePolicy } from "@debateai/register";
import { PracticeRefusal } from "./practice-settings.js";

export const PRACTICE_SHAPE_FLAGS = Object.freeze(["--shape-policy", "--depth-mode", "--scrutiny", "--answer-length"] as const);

/** The practice ask's settings, as given on the command line (a missing one is the site's default). */
export type PracticeShapeAsk = Readonly<{ depthMode?: DepthMode; scrutiny?: Scrutiny; answerLength?: AnswerLength }>;
/** `policy`: the row --shape-policy puts into the throwaway register (null: none given). */
export type PracticeShapeOverride = Readonly<{ policy: DebateShapePolicy | null; ask: PracticeShapeAsk }>;

const POLICY_INVALID_PREFIX = "DEBATE_SHAPE_POLICY_INVALID:";

/** The file's text, read and checked by the register's own parser. A refusal names only the place that is wrong. */
export function parsePracticeShapePolicyText(text: string): DebateShapePolicy {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new PracticeRefusal("PRACTICE_SHAPE_POLICY_INVALID", "$"); }
  try {
    return parseDebateShapePolicy(value);
  } catch (error) {
    const path = error instanceof TypeError && error.message.startsWith(POLICY_INVALID_PREFIX)
      ? error.message.slice(POLICY_INVALID_PREFIX.length) : "$";
    throw new PracticeRefusal("PRACTICE_SHAPE_POLICY_INVALID", path);
  }
}

/** One of a setting's fixed values; anything else is refused with the flag and its list, never the value typed. */
function oneOf<T extends string>(options: readonly T[], text: string, flag: string, list: string): T {
  if (!(options as readonly string[]).includes(text)) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (${list})`);
  return text as T;
}

/**
 * The debate-shape flags of a command line: null when none is given (today's debate command, unchanged). Any of them
 * outside debate mode is refused. Read before anything starts, so a bad file or value can never start a paid run.
 */
export function practiceShapeOverrideFromArgs(mode: string, flags: ReadonlyMap<string, string>,
  read: (path: string) => string = (path) => readFileSync(path, "utf8")): PracticeShapeOverride | null {
  const given = PRACTICE_SHAPE_FLAGS.filter((flag) => flags.has(flag));
  if (given.length === 0) return null;
  if (mode !== "debate") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${given[0]!} (debate mode only)`);
  const path = flags.get("--shape-policy");
  let policy: DebateShapePolicy | null = null;
  if (path !== undefined) {
    let text: string;
    try { text = read(path); } catch { throw new PracticeRefusal("PRACTICE_SHAPE_POLICY_UNREADABLE"); }
    policy = parsePracticeShapePolicyText(text);
  }
  const ask: { depthMode?: DepthMode; scrutiny?: Scrutiny; answerLength?: AnswerLength } = {};
  const depthMode = flags.get("--depth-mode");
  if (depthMode !== undefined) ask.depthMode = oneOf(DepthModeSchema.options, depthMode, "--depth-mode", "fixed or adaptive");
  const scrutiny = flags.get("--scrutiny");
  if (scrutiny !== undefined) ask.scrutiny = oneOf(ScrutinySchema.options, scrutiny, "--scrutiny", "standard, deep or exhaustive");
  const answerLength = flags.get("--answer-length");
  if (answerLength !== undefined) {
    ask.answerLength = oneOf(AnswerLengthSchema.options, answerLength, "--answer-length", "short, standard or detailed");
  }
  return Object.freeze({ policy, ask: Object.freeze(ask) });
}
```

- [ ] **Step 5: The comparison questions** in `tools/preview-practice/practice-questions.ts`

At the top, after the file comment, add:

```ts
import { OPENINGS_QUESTIONS } from "./practice-openings-questions.js";
import { PracticeRefusal } from "./practice-settings.js";
```

At the end of the file, add:

```ts
/**
 * The whole-debate comparison's four fixed questions (README step S-8): two Romanian, two English, a public policy, a
 * personal decision, a contested fact and an ethics question. Each is word for word the openings question of the same
 * id, so the Phase 1 data lines up question by question.
 */
export const PRACTICE_COMPARISON_QUESTION_IDS = Object.freeze(["ro-euro", "ro-strainatate", "en-nuclear", "en-social-media-age"] as const);

/** What a practice DEBATE asks: the id and the question exactly as a person would type it. */
export type PracticeDebateQuestion = Readonly<{ id: string; questionLine: string }>;

/**
 * The question a practice debate asks: `ro` (the default), `en`, or one of the comparison's ids. Anything else is
 * refused before anything starts, and the refusal never repeats what was typed.
 */
export function practiceDebateQuestion(id: string): PracticeDebateQuestion {
  const practice = PRACTICE_QUESTIONS.find((question) => question.id === id);
  if (practice !== undefined) return Object.freeze({ id: practice.id, questionLine: practice.questionLine });
  if ((PRACTICE_COMPARISON_QUESTION_IDS as readonly string[]).includes(id)) {
    const comparison = OPENINGS_QUESTIONS.find((question) => question.id === id);
    if (comparison !== undefined) return Object.freeze({ id: comparison.id, questionLine: comparison.questionLine });
  }
  throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID",
    `--question (ro, en, or a comparison id: ${PRACTICE_COMPARISON_QUESTION_IDS.join(", ")})`);
}
```

- [ ] **Step 6: The command** `tools/preview-practice/practice.ts`

(a) In `VALUE_FLAGS`, add the four flags to the set as it stands (Project 1 added its own; keep them): `"--shape-policy", "--depth-mode", "--scrutiny", "--answer-length"`.

(b) Add the imports:

```ts
import { practiceDebateQuestion } from "./practice-questions.js";
import { practiceShapeOverrideFromArgs } from "./practice-shape.js";
```

(c) Right after the line `if (args.switches.has("--dry") && args.mode !== "openings") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--dry (openings mode only)");`, add:

```ts
    // Debate shape (spec 2026-10-12 §5): the four debate-only flags, read and checked here, before any socket, settings
    // file or gate is touched; a policy file that does not pass the register's own check never starts a paid run.
    const shapeOverride = practiceShapeOverrideFromArgs(args.mode, args.flags);
    // The debate's question, a fixed id only, checked here too (it used to fail only once the database had started).
    const debateQuestionId = args.mode === "debate" ? practiceDebateQuestion(args.flags.get("--question") ?? "ro").id : "ro";
```

(d) In the `runPracticeDebate({ … })` call, replace `questionId: args.flags.get("--question") ?? "ro",` with:

```ts
      questionId: debateQuestionId,
      ...(shapeOverride === null ? {} : { shape: shapeOverride }),
```

`runPracticeDebate` does not accept `shape` until Task 2. The typecheck runs in Task 4, after Task 2 adds it.

(e) In the file's top comment, under ` *  - debate:`, add the line: ` *             --shape-policy FILE runs it in the new debate shape, in the throwaway register only (practice-shape.ts).`

- [ ] **Step 7: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 8: Commit**

```bash
git add tools/preview-practice/practice-shape.ts tools/preview-practice/shape-policy-start.json tools/preview-practice/practice-questions.ts tools/preview-practice/practice.ts tests/unit/preview-practice-shape.test.ts
git commit -m "Practice: debate-only --shape-policy, --depth-mode, --scrutiny, --answer-length and the comparison's four questions, checked before anything starts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The throwaway register version and the ask's settings

**Files:**
- Modify: `tools/preview-practice/practice-register-import.ts` (append)
- Modify: `tools/preview-practice/practice-debate.ts` (input, import block, settings, request, question)
- Test: `tests/unit/preview-practice-shape.test.ts` (append a describe)

**Interfaces:**
- Consumes:
  - `debateShapePolicyRow`, `DEBATE_SHAPE_POLICY_ROW_KEY`, `readDebateShapePolicy`, `DebateShapePolicy` (P2a);
  - `practiceVersionRows`, `databaseVersionSnapshotSha256`, `createPostgresRegisterPublicationPort`, `computeRegisterSnapshotSha256`, `parseRegisterVersionText` (existing);
  - `PracticeShapeOverride` (Task 1); `practiceDebateQuestion` (Task 1).
- Produces:
```ts
// tools/preview-practice/practice-register-import.ts
export const PRACTICE_SHAPE_SOURCE_REF: "preview practice: --shape-policy, this throwaway register only";
export type PracticeShapeVersion = Readonly<{ baseRegisterVersion: string; registerVersion: string; row: "ADDED" | "REPLACED"; snapshotSha256: string }>;
export function practiceShapeVersionRows(document: PracticeRegisterExport, policy: DebateShapePolicy): Readonly<{ rows: readonly RegisterPublicationRow[]; row: "ADDED" | "REPLACED" }>;
export async function publishPracticeShapeVersion(pool: Pool, document: PracticeRegisterExport, receipt: PracticeRegisterImportReceipt, policy: DebateShapePolicy): Promise<PracticeShapeVersion>;
// tools/preview-practice/practice-debate.ts
runPracticeDebate input gains `shape?: PracticeShapeOverride`.
```

- [ ] **Step 1: Write the failing test.** Append to `tests/unit/preview-practice-shape.test.ts`:

Add to its imports:

```ts
import { DEBATE_SHAPE_POLICY_ROW_KEY, debateShapePolicyRow } from "@debateai/register";
import {
  parsePracticeRegisterExport,
  PRACTICE_SHAPE_SOURCE_REF,
  practiceShapeVersionRows,
  practiceVersionRows
} from "../../tools/preview-practice/practice-register-import.js";
```

(Merge `DEBATE_SHAPE_POLICY_ROW_KEY` and `debateShapePolicyRow` into the existing `@debateai/register` import line.)

Append:

```ts
/** An export of two versions; the last one's rows are `rows` (live source refs). */
function exportWith(rows: readonly Readonly<{ row_key: string; value_json: string }>[]) {
  const version = (registerVersion: string, rowCount: number, base: string | null, kind: string | null) => ({
    register_version: registerVersion, row_count: rowCount, base_register_version: base, publication_id: null, request_sha256: null,
    snapshot_sha256: null, publication_kind: kind, recorded_at: null });
  return parsePracticeRegisterExport(JSON.stringify({
    schema: "preview-practice-register-export-v1",
    versions: [version("4", 1, null, null), version("5", rows.length, "4", "GENERAL")],
    rows: [{ register_version: "4", row_key: "alpha", value_json: "\"old\"", source_ref: "live" },
      ...rows.map((row) => ({ register_version: "5", row_key: row.row_key, value_json: row.value_json, source_ref: "live" }))]
  }));
}

describe("practice debate shape: the throwaway register version", () => {
  it("adds the row to the export's LAST version's rows, keeps every other row byte for byte, in key order", () => {
    const document = exportWith([{ row_key: "zeta", value_json: "\"z\"" }, { row_key: "alpha", value_json: "{\"a\": \"b\"}" }]);
    const { rows, row } = practiceShapeVersionRows(document, debateShapePolicyStartValues());
    expect(row).toBe("ADDED");
    expect(rows.map((entry) => entry.rowKey)).toEqual(["alpha", DEBATE_SHAPE_POLICY_ROW_KEY, "zeta"]);
    expect(rows.filter((entry) => entry.rowKey !== DEBATE_SHAPE_POLICY_ROW_KEY)).toEqual(practiceVersionRows(document, "5"));
    expect(rows.find((entry) => entry.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY))
      .toEqual({ ...debateShapePolicyRow(debateShapePolicyStartValues(), PRACTICE_SHAPE_SOURCE_REF) });
  });

  it("replaces an exported row of the same key (REPLACED), never keeping two", () => {
    const live = debateShapePolicyRow(debateShapePolicyStartValues("SNOWBALL"), "live");
    const document = exportWith([{ row_key: DEBATE_SHAPE_POLICY_ROW_KEY, value_json: live.valueJsonText }, { row_key: "alpha", value_json: "1" }]);
    const { rows, row } = practiceShapeVersionRows(document, debateShapePolicyStartValues());
    expect(row).toBe("REPLACED");
    const shapeRows = rows.filter((entry) => entry.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY);
    expect(shapeRows).toHaveLength(1);
    expect(shapeRows[0]).toEqual({ ...debateShapePolicyRow(debateShapePolicyStartValues(), PRACTICE_SHAPE_SOURCE_REF) });
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: FAIL: `practiceShapeVersionRows` is not exported.

- [ ] **Step 3: Implement** in `tools/preview-practice/practice-register-import.ts`

Extend the `@debateai/register` import with `debateShapePolicyRow`, `DEBATE_SHAPE_POLICY_ROW_KEY` and `type DebateShapePolicy`. Append:

```ts
/**
 * Debate shape (plan 2026-10-12-debate-shape-phase2d, `--shape-policy`): the source ref of the one row the practice adds.
 * It says where the row came from, so no reader can mistake the practice's version for a live one.
 */
export const PRACTICE_SHAPE_SOURCE_REF = "preview practice: --shape-policy, this throwaway register only" as const;

export type PracticeShapeVersion = Readonly<{
  baseRegisterVersion: string;
  registerVersion: string;
  /** ADDED: the export had no debate-shape row. REPLACED: its own row was superseded in this throwaway copy. */
  row: "ADDED" | "REPLACED";
  snapshotSha256: string;
}>;

/**
 * The practice version's rows: the export's LAST version's rows exactly as imported, with the debate-shape row added
 * (or the export's own replaced), in key order. Pure.
 */
export function practiceShapeVersionRows(document: PracticeRegisterExport, policy: DebateShapePolicy): Readonly<{
  rows: readonly RegisterPublicationRow[]; row: "ADDED" | "REPLACED";
}> {
  const last = document.versions[document.versions.length - 1]!;
  const base = practiceVersionRows(document, last.register_version);
  const shaped = debateShapePolicyRow(policy, PRACTICE_SHAPE_SOURCE_REF);
  const replaced = base.some((row) => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY);
  const rows = [...base.filter((row) => row.rowKey !== DEBATE_SHAPE_POLICY_ROW_KEY),
    Object.freeze({ rowKey: shaped.rowKey, valueJsonText: shaped.valueJsonText, sourceRef: shaped.sourceRef })]
    .sort((a, b) => (a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : 0));
  return Object.freeze({ rows: Object.freeze(rows), row: replaced ? "REPLACED" : "ADDED" });
}

/**
 * Publishes the practice version in the THROWAWAY database only, through the register's own general publication on
 * the export's last version, and proves it: the number allocated is exactly one above, and its rows hash as built.
 * The export document is only read.
 */
export async function publishPracticeShapeVersion(pool: Pool, document: PracticeRegisterExport, receipt: PracticeRegisterImportReceipt,
  policy: DebateShapePolicy): Promise<PracticeShapeVersion> {
  const { rows, row } = practiceShapeVersionRows(document, policy);
  const expected = String(BigInt(receipt.registerVersion) + 1n);
  const published = await createPostgresRegisterPublicationPort(pool).publishGeneral({
    publicationId: randomUUID(),
    baseRegisterVersion: parseRegisterVersionText(receipt.registerVersion),
    rows,
    sourceRef: PRACTICE_SHAPE_SOURCE_REF,
    deployment: "local"
  });
  if (published.registerVersion !== expected) {
    throw new PracticeRegisterError("PRACTICE_REGISTER_VERSION_DRIFT", `expected ${expected}, the publication allocated ${published.registerVersion}`);
  }
  const snapshotSha256 = computeRegisterSnapshotSha256(rows);
  if (await databaseVersionSnapshotSha256(pool, expected) !== snapshotSha256) {
    throw new PracticeRegisterError("PRACTICE_REGISTER_HASH_MISMATCH", `version ${expected} (the practice's debate-shape version)`);
  }
  return Object.freeze({ baseRegisterVersion: receipt.registerVersion, registerVersion: expected, row, snapshotSha256 });
}
```

- [ ] **Step 4: Run the unit test and expect PASS**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Wire it into** `tools/preview-practice/practice-debate.ts`

(a) Imports:
- add `readDebateShapePolicy` to a `@debateai/register` import (create the line if the file has none);
- replace `import { practiceQuestion } from "./practice-questions.js";` with `import { practiceDebateQuestion } from "./practice-questions.js";`;
- extend the `./practice-register-import.js` import with `publishPracticeShapeVersion` and `type PracticeShapeVersion`;
- change `import type { PracticeSettings, PracticeSockets } from "./practice-settings.js";` to `import { PracticeRefusal, type PracticeSettings, type PracticeSockets } from "./practice-settings.js";`;
- add `import type { PracticeShapeOverride } from "./practice-shape.js";`.

(b) In the `runPracticeDebate` input type, after `transcriptDirectory?: string | null;`, add:

```ts
  /** Debate shape (`--shape-policy`, the three ask settings): absent: today's debate command. */
  shape?: PracticeShapeOverride;
```

(c) Replace exactly this block:

```ts
    if (String(input.settings.runner.REGISTER_VERSION) !== receipt.registerVersion) {
      throw Object.assign(new Error("PRACTICE_REGISTER_VERSION_MISMATCH"), { code: "PRACTICE_REGISTER_VERSION_MISMATCH" });
    }
    progress(`register imported up to version ${receipt.registerVersion}`);
```

with:

```ts
    if (String(input.settings.runner.REGISTER_VERSION) !== receipt.registerVersion) {
      throw Object.assign(new Error("PRACTICE_REGISTER_VERSION_MISMATCH"), { code: "PRACTICE_REGISTER_VERSION_MISMATCH" });
    }
    // Debate shape (--shape-policy): ONE more version, in this throwaway database only: the export's last version with
    // the debate-shape row added (or its own replaced). Both compositions below run on it, so the ask path and the runner
    // read the row exactly as the live services would. The export file is only read; the live register is never reached.
    const shapeVersion: PracticeShapeVersion | null = input.shape === undefined || input.shape.policy === null ? null
      : await publishPracticeShapeVersion(pool, input.register, receipt, input.shape.policy);
    const registerVersion = shapeVersion?.registerVersion ?? receipt.registerVersion;
    progress(shapeVersion === null ? `register imported up to version ${receipt.registerVersion}`
      : `register imported up to version ${receipt.registerVersion}; the debate-shape row ${shapeVersion.row === "ADDED" ? "added" : "replaced"} `
        + `in this throwaway copy as version ${registerVersion}`);
    let settings: PracticeSettings = input.settings;
    if (shapeVersion !== null) {
      const runnerVersion = Number(registerVersion);
      if (!Number.isSafeInteger(runnerVersion)) throw new PracticeRefusal("PRACTICE_REGISTER_VERSION_UNSAFE");
      settings = Object.freeze({ ...input.settings, runner: Object.freeze({ ...input.settings.runner, REGISTER_VERSION: runnerVersion }) });
    }
    // The row the debate runs on, read as the ask path and the runner read it (absent: today's shape, byte for byte).
    const shapeRow = await readDebateShapePolicy(pool, settings.runner.REGISTER_VERSION);
    const asked = input.shape?.ask ?? {};
    if (shapeRow === null && Object.keys(asked).length > 0) {
      // Without the row the ask path would drop them silently: refused before any AI is asked.
      throw new PracticeRefusal("PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW",
        "--depth-mode, --scrutiny and --answer-length need a debate-shape row (--shape-policy)");
    }
    const shapeSource = shapeVersion !== null ? "FLAG" as const : shapeRow !== null ? "REGISTER" as const : null;
```

`shapeSource` and `registerVersion` are read in Tasks 4 and 5. Until then the typecheck may report `shapeSource` as unused. The typecheck runs after Task 4.

(d) In the `composePracticeAsk({ … })` call, replace `settings: input.settings,` with `settings,`.

(e) In the `composePracticeRunner({ … })` call, replace `environment: input.settings.runner,` with `environment: settings.runner,`.

(f) Replace `const question = practiceQuestion(input.questionId);` with `const question = practiceDebateQuestion(input.questionId);`.

(g) In the request object, replace `depth_params: { depth: input.depth },` with `depth_params: { depth: input.depth, ...asked },`.

(h) In the transcript's `run` facts, replace `registerVersion: receipt.registerVersion,` with `registerVersion,`.

- [ ] **Step 6: Today's practice unit tests stay green**

Run each separately:
- `pnpm exec vitest run tests/unit/preview-practice.test.ts`
- `pnpm exec vitest run tests/unit/preview-practice-wiring-drift.test.ts`

Expected: PASS. The drift test compares the compositions with main.ts. This task changes only which settings object `practice-debate.ts` hands them, never the compositions.

- [ ] **Step 7: Commit**

```bash
git add tools/preview-practice/practice-register-import.ts tools/preview-practice/practice-debate.ts tests/unit/preview-practice-shape.test.ts
git commit -m "Practice: --shape-policy publishes one debate-shape version in the throwaway register only; both compositions run on it; the ask carries the three settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Map calls in the practice's own accounting

**Files:**
- Modify: `tools/preview-practice/practice-lanes.ts` (`PracticeCallFamily`, `callFamilyOf`, `recheckReply`, new `PRACTICE_MAP_STEPS` and `practiceMapStepOf`)
- Modify: `tools/preview-practice/practice-debate.ts` (`ROSTER_ORDER`)
- Test: `tests/unit/preview-practice-shape.test.ts` (append a describe)

**Interfaces:**
- Consumes: `mapAnglesReplySchema`, `mapListReplySchema`, `mapSnowballReplySchema`, `mapMergeReplySchema`, `mapGapReplySchema`, `mapChooseReplySchema` and `mapClassifyReply` (`@debateai/map`, Phase 1).
- Produces:
```ts
export type PracticeCallFamily = "MAP" | "JUDGE" | "PANEL" | "REVIEW" | "SYNTHESIZER" | "EVALUATOR" | "STORYTELLER" | "STORY_CHECKER" | "UNMAPPED";
export const PRACTICE_MAP_STEPS: readonly ["angles", "list", "merge", "gap", "choose"];
export type PracticeMapStep = "angles" | "list" | "merge" | "gap" | "choose";
export function practiceMapStepOf(callSiteKey: string): PracticeMapStep | null;
```

- [ ] **Step 1: Write the failing test.** Append to `tests/unit/preview-practice-shape.test.ts`:

```ts
import { callFamilyOf, practiceMapStepOf, recheckReply } from "../../tools/preview-practice/practice-lanes.js";

describe("practice: map calls in the practice's own accounting", () => {
  it("names the map family and step from the call-site key (spec §3.4: MAP:angles, MAP:list:<i>, MAP:merge, MAP:gap:<k>, MAP:choose)", () => {
    for (const key of ["MAP:angles", "MAP:list:0", "MAP:list:3", "MAP:merge", "MAP:gap:1", "MAP:choose"]) expect(callFamilyOf(key)).toBe("MAP");
    expect(["MAP:angles", "MAP:list:3", "MAP:merge", "MAP:gap:2", "MAP:choose"].map(practiceMapStepOf))
      .toEqual(["angles", "list", "merge", "gap", "choose"]);
    expect(practiceMapStepOf("MAP:other")).toBeNull();
    expect(practiceMapStepOf("JUDGE:attack:root0")).toBeNull();
    expect(callFamilyOf("JUDGE:review:abc")).toBe("REVIEW");
  });

  it("re-checks a map reply by its step's own schema", () => {
    const point = (n: number) => ({ claim: `Point ${String(n)}`, why_it_matters: "It can change the answer.", leans: "context" });
    expect(recheckReply("MAP:list:0", JSON.stringify({ points: [1, 2, 3].map(point), candidate_answers: ["Yes."] })))
      .toEqual({ family: "MAP", issues: [] });
    // A snowball reply (no minimum) under the same list key is accepted too.
    expect(recheckReply("MAP:list:1", JSON.stringify({ points: [], candidate_answers: [] })).issues).toEqual([]);
    expect(recheckReply("MAP:angles", JSON.stringify({ angles: [] })).issues.length).toBeGreaterThan(0);
    expect(recheckReply("MAP:choose", JSON.stringify({ answers: [] })).issues.length).toBeGreaterThan(0);
    expect(recheckReply("MAP:merge", "not json").issues.length).toBeGreaterThan(0);
    expect(recheckReply("MAP:other", "{}")).toEqual({ family: "MAP", issues: ["UNMAPPED"] });
    expect(recheckReply("SOMETHING:ELSE", "{}")).toEqual({ family: "UNMAPPED", issues: ["UNMAPPED"] });
  });
});
```

(Move the new import line up to the file's other imports.)

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: FAIL: `practiceMapStepOf` is not exported, and `callFamilyOf("MAP:angles")` is `UNMAPPED`.

- [ ] **Step 3: Implement** in `tools/preview-practice/practice-lanes.ts`

(a) Add an import:

```ts
import {
  mapAnglesReplySchema,
  mapChooseReplySchema,
  mapClassifyReply,
  mapGapReplySchema,
  mapListReplySchema,
  mapMergeReplySchema,
  mapSnowballReplySchema
} from "@debateai/map";
```

(b) Replace the `PracticeCallFamily` line and the first line of `callFamilyOf`'s body:

```ts
export type PracticeCallFamily = "MAP" | "JUDGE" | "PANEL" | "REVIEW" | "SYNTHESIZER" | "EVALUATOR" | "STORYTELLER" | "STORY_CHECKER" | "UNMAPPED";
```

and add as the FIRST line of `callFamilyOf`:

```ts
  if (callSiteKey.startsWith("MAP:")) return "MAP";
```

(c) After `callFamilyOf`, add:

```ts
/** The map's steps as their call-site keys name them (spec 2026-10-12 §3.4). */
export const PRACTICE_MAP_STEPS = Object.freeze(["angles", "list", "merge", "gap", "choose"] as const);
export type PracticeMapStep = typeof PRACTICE_MAP_STEPS[number];

/** `MAP:angles` → angles, `MAP:list:<i>` → list, `MAP:gap:<k>` → gap, …; null for any other key. */
export function practiceMapStepOf(callSiteKey: string): PracticeMapStep | null {
  const [family, step] = callSiteKey.split(":");
  if (family !== "MAP" || step === undefined) return null;
  return (PRACTICE_MAP_STEPS as readonly string[]).includes(step) ? step as PracticeMapStep : null;
}

/**
 * The schemas a map step's reply may have. The list key carries both the list and (in a snowball opening) the
 * snowball reply, so either is accepted. The steps' own content checks need the run's ids and are not re-run here:
 * the schema re-check is the diagnosis, the call-time check is the verdict.
 */
const MAP_RECHECK_SCHEMAS: Readonly<Record<PracticeMapStep, readonly Parameters<typeof mapClassifyReply>[2][]>> = Object.freeze({
  angles: [mapAnglesReplySchema],
  list: [mapListReplySchema, mapSnowballReplySchema],
  merge: [mapMergeReplySchema],
  gap: [mapGapReplySchema],
  choose: [mapChooseReplySchema]
});

function recheckMapReply(callSiteKey: string, content: string): readonly string[] {
  const step = practiceMapStepOf(callSiteKey);
  if (step === null) return Object.freeze(["UNMAPPED"]);
  let first: readonly string[] | null = null;
  for (const schema of MAP_RECHECK_SCHEMAS[step]) {
    const issues = fromClassification(mapClassifyReply(content, undefined, schema, () => []).classification);
    if (issues.length === 0) return issues;
    first ??= issues;
  }
  return first ?? Object.freeze(["UNMAPPED"]);
}
```

`fromClassification` is declared below `callFamilyOf` in the file. Function declarations are hoisted, so this is fine.

(d) In `recheckReply`'s `switch (family)`, add before the `default:` case:

```ts
    case "MAP": return { family, issues: recheckMapReply(callSiteKey, content) };
```

(e) In `tools/preview-practice/practice-debate.ts`, replace the `ROSTER_ORDER` line with:

```ts
const ROSTER_ORDER = Object.freeze(["MAP", "JUDGE", "PANEL", "REVIEW", "SYNTHESIZER", "EVALUATOR", "STORYTELLER", "STORY_CHECKER", "UNMAPPED"]);
```

- [ ] **Step 4: Run and expect PASS**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: PASS (15 tests).

Then run: `pnpm exec vitest run tests/unit/preview-practice.test.ts`
Expected: PASS (its `recheckReply("SOMETHING:ELSE", "{}")` case is unchanged).

- [ ] **Step 5: Commit**

```bash
git add tools/preview-practice/practice-lanes.ts tools/preview-practice/practice-debate.ts tests/unit/preview-practice-shape.test.ts
git commit -m "Practice: map calls are the MAP family, re-checked by their step's own schema, first in the per-site rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: What the shape did: the facts, the report block and the verdict

**Files:**
- Modify: `tools/preview-practice/practice-shape.ts` (append)
- Modify: `tools/preview-practice/practice-verdict.ts` (`PracticeVerdictInput.shapeNotExercised`, `practiceVerdict`)
- Modify: `tools/preview-practice/practice-report.ts` (`debateReport`, `reportMarkdown`)
- Modify: `tools/preview-practice/practice-debate.ts` (result `shape`, the facts read)
- Test: `tests/unit/preview-practice-shape.test.ts` (append a describe)

**Interfaces:**
- Consumes:
  - `parseCostEnvelopeBasis` (`@debateai/budget`, P2a: `.shape?: DebateShapeCeilingInput`);
  - `DebateShapeCeilingInput` (P2a);
  - `MAP_MARKS` (`@debateai/map`);
  - `readMapChoiceForRun` and `readMapItemsForRun` (P2b, `@debateai/db`; see Task 0);
  - `practiceMapStepOf` and `PRACTICE_MAP_STEPS` (Task 3).
- Produces:
```ts
export type PracticeShapeSource = "FLAG" | "REGISTER";
export type PracticeShapeSizes = Readonly<{ plan: string; depthMode: string; scrutiny: string; answerLength: string; mapAIs: number;
  answers: number; graders: number; pointsPerAnswer: number; deeperTopPoints: number; gapRounds: number; closeCallExtraGraders: number; opening: string }>;
export type PracticeShapeFacts = Readonly<{ storedDepthParams: Readonly<Record<string, unknown>> | null; sizes: PracticeShapeSizes | null;
  marks: Readonly<Record<string, number>>; choice: Readonly<{ answers: number; alsoRaised: number }> | null; mapCallSiteKeys: readonly string[] }>;
export type PracticeShapeBlock = Readonly<{ source: PracticeShapeSource; registerVersion: string; row: "ADDED" | "REPLACED" | null;
  asked: Readonly<{ depthMode: string | null; scrutiny: string | null; answerLength: string | null }>;
  storedDepthParams: Readonly<Record<string, unknown>> | null; sizes: PracticeShapeSizes | null; opening: string | null;
  mapMarks: Readonly<Record<string, number>>; chosenAnswers: number | null; alsoRaised: number | null;
  panelCloseCallExtensions: number; scrutinyExtensions: number; mapCallsByStep: Readonly<Record<PracticeMapStep, number>>;
  notExercised: string | null }>;
export type PracticeMapChoice = Readonly<{ answers: readonly unknown[]; alsoRaised: readonly unknown[] }>;
export type PracticeMapReaders = Readonly<{ choice(runId: string): Promise<PracticeMapChoice | null>; items(runId: string): Promise<readonly unknown[]> }>;
export function practiceMapReaders(pool: Pool): PracticeMapReaders;
export async function readPracticeShapeFacts(pool: Pick<Pool, "query">, runId: string, answerId: string | null, readers: PracticeMapReaders): Promise<PracticeShapeFacts>;
export function practiceShapeBlock(input: Readonly<{ source: PracticeShapeSource; registerVersion: string; row: "ADDED" | "REPLACED" | null;
  asked: PracticeShapeAsk; facts: PracticeShapeFacts | null; unreadable?: string }>): PracticeShapeBlock;
export function practiceShapeLines(block: PracticeShapeBlock): readonly string[];
// practice-verdict.ts: PracticeVerdictInput.shapeNotExercised?: readonly string[]  →  NOT_PROVEN "SHAPE_NOT_EXERCISED:<why>"
// practice-debate.ts: PracticeDebateResult.shape?: PracticeShapeBlock
```

- [ ] **Step 1: Write the failing test.** Append to `tests/unit/preview-practice-shape.test.ts`:

```ts
import { practiceShapeBlock, practiceShapeLines, type PracticeShapeFacts } from "../../tools/preview-practice/practice-shape.js";
import { practiceVerdict, type PracticeVerdictInput } from "../../tools/preview-practice/practice-verdict.js";
import { reportMarkdown, type PracticeReport } from "../../tools/preview-practice/practice-report.js";

const SIZES = Object.freeze({ plan: "premium", depthMode: "adaptive", scrutiny: "standard", answerLength: "standard", mapAIs: 5, answers: 4,
  graders: 3, pointsPerAnswer: 4, deeperTopPoints: 2, gapRounds: 2, closeCallExtraGraders: 1, opening: "ANGLE_MAP" });
const FACTS: PracticeShapeFacts = Object.freeze({
  storedDepthParams: { depth: 1, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" },
  sizes: SIZES,
  marks: { "CHOOSE_QUOTA_FILLED": 1, "PANEL-CLOSE-CALL-EXTENDED": 3, "SCRUTINY-EXTENDED": 2, "PANEL-PARTIAL": 1 },
  choice: { answers: 2, alsoRaised: 7 },
  mapCallSiteKeys: ["MAP:angles", "MAP:list:0", "MAP:list:1", "MAP:list:1", "MAP:merge", "MAP:gap:1", "MAP:choose"]
});
const blockOf = (facts: PracticeShapeFacts | null, unreadable?: string) => practiceShapeBlock({ source: "FLAG", registerVersion: "6", row: "ADDED",
  asked: { scrutiny: "deep" }, facts, ...(unreadable === undefined ? {} : { unreadable }) });

describe("practice debate shape: what the run did", () => {
  it("counts what the debate-shape run did", () => {
    expect(blockOf(FACTS)).toEqual({
      source: "FLAG", registerVersion: "6", row: "ADDED", asked: { depthMode: null, scrutiny: "deep", answerLength: null },
      storedDepthParams: FACTS.storedDepthParams, sizes: SIZES, opening: "ANGLE_MAP", mapMarks: { CHOOSE_QUOTA_FILLED: 1 },
      chosenAnswers: 2, alsoRaised: 7, panelCloseCallExtensions: 3, scrutinyExtensions: 2,
      mapCallsByStep: { angles: 1, list: 3, merge: 1, gap: 1, choose: 1 }, notExercised: null
    });
  });

  it("says when the new shape was not exercised", () => {
    const fellBack = blockOf({ ...FACTS, marks: { MAP_UNAVAILABLE_TODAYS_OPENING: 1 }, choice: null, mapCallSiteKeys: ["MAP:angles", "MAP:list:0"] });
    expect(fellBack).toMatchObject({ opening: "TODAYS_OPENING", notExercised: "MAP_UNAVAILABLE_TODAYS_OPENING", chosenAnswers: null,
      alsoRaised: null, mapMarks: { MAP_UNAVAILABLE_TODAYS_OPENING: 1 } });
    expect(blockOf({ ...FACTS, sizes: null })).toMatchObject({ opening: null, notExercised: "NO_SHAPE_ON_RECEIPT" });
    expect(blockOf(null, "CONTENT_CIPHER_UNAVAILABLE")).toMatchObject({ notExercised: "FACTS_UNREADABLE:CONTENT_CIPHER_UNAVAILABLE" });
    // Refused at the ask: the verdict already fails the run; the block only says nothing ran.
    expect(blockOf(null)).toEqual({ source: "FLAG", registerVersion: "6", row: "ADDED", asked: { depthMode: null, scrutiny: "deep", answerLength: null },
      storedDepthParams: null, sizes: null, opening: null, mapMarks: {}, chosenAnswers: null, alsoRaised: null, panelCloseCallExtensions: 0,
      scrutinyExtensions: 0, mapCallsByStep: { angles: 0, list: 0, merge: 0, gap: 0, choose: 0 }, notExercised: null });
  });

  it("a shape run that did not exercise the shape is NOT_PROVEN, never PASS", () => {
    const base: PracticeVerdictInput = { harnessError: null, completed: true, servedAnswer: true, storyOutcome: "READY", formatFailures: 0,
      failedCalls: 0, gateHalted: false, gateStopped: false, notExercisedModels: [], unbilledRefusals: 0, p90ByModel: {} };
    expect(practiceVerdict(base)).toMatchObject({ verdict: "PASS", exitCode: 0, reasons: [] });
    expect(practiceVerdict({ ...base, shapeNotExercised: [] })).toMatchObject({ verdict: "PASS", reasons: [] });
    expect(practiceVerdict({ ...base, shapeNotExercised: ["MAP_UNAVAILABLE_TODAYS_OPENING"] }))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["SHAPE_NOT_EXERCISED:MAP_UNAVAILABLE_TODAYS_OPENING"] });
    expect(practiceVerdict({ ...base, completed: false, shapeNotExercised: ["NO_SHAPE_ON_RECEIPT"] }).verdict).toBe("FAIL");
  });

  it("report.md says it in plain words, counts and codes only", () => {
    const report = { schema: "preview-practice-report-v1", mode: "debate", verdict: "PASS", exitCode: 0, reasons: [],
      startedAt: "2026-10-12T10:00:00.000Z", finishedAt: "2026-10-12T11:00:00.000Z", shape: blockOf(FACTS) } as unknown as PracticeReport;
    const markdown = reportMarkdown(report);
    expect(markdown).toContain("Debate shape (from --shape-policy, in this throwaway register only: version 6, row added):");
    expect(markdown).toContain("- asked: depth mode default, scrutiny deep, answer length default; stored: "
      + "{\"depth\":1,\"depthMode\":\"adaptive\",\"scrutiny\":\"standard\",\"answerLength\":\"standard\"}");
    expect(markdown).toContain("- opening used: ANGLE_MAP");
    expect(markdown).toContain("- map calls (every try, as the ledger recorded them): angles 1, list 3, merge 1, gap 1, choose 1");
    expect(markdown).toContain("- chosen answers: 2; also raised, not debated: 7");
    expect(markdown).toContain("- map marks: CHOOSE_QUOTA_FILLED x1");
    expect(markdown).toContain("- panel close-call extensions: 3; scrutiny extensions: 2");
    expect(practiceShapeLines(blockOf({ ...FACTS, sizes: null })).join("\n")).toContain("- the new shape was not exercised: NO_SHAPE_ON_RECEIPT");
  });

  it("a report without the block reads as today", () => {
    const report = { schema: "preview-practice-report-v1", mode: "debate", verdict: "PASS", exitCode: 0, reasons: [],
      startedAt: "2026-10-12T10:00:00.000Z", finishedAt: "2026-10-12T11:00:00.000Z" } as unknown as PracticeReport;
    expect(reportMarkdown(report)).not.toContain("Debate shape");
  });
});
```

(Move the new import lines up to the file's other imports.)

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: FAIL: `practiceShapeBlock` is not exported.

- [ ] **Step 3: Append the report part** to `tools/preview-practice/practice-shape.ts`

Add to its imports:

```ts
import type { Pool } from "pg";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { readMapChoiceForRun, readMapItemsForRun } from "@debateai/db";
import { MAP_MARKS } from "@debateai/map";
import type { DebateShapeCeilingInput } from "@debateai/register";
import { PRACTICE_MAP_STEPS, practiceMapStepOf, type PracticeMapStep } from "./practice-lanes.js";
```

(Merge `type DebateShapeCeilingInput` into the existing `@debateai/register` import.) Append:

```ts
/* ------------------------------------------------------------------ what the run did (report.json `shape`) */

/** FLAG: the row came from --shape-policy. REGISTER: the imported register held its own row. */
export type PracticeShapeSource = "FLAG" | "REGISTER";

/** The sizes the run was admitted with, frozen on its money receipt (envelope_basis.shape, P2a). */
export type PracticeShapeSizes = Readonly<{
  plan: string; depthMode: string; scrutiny: string; answerLength: string;
  mapAIs: number; answers: number; graders: number; pointsPerAnswer: number; deeperTopPoints: number; gapRounds: number;
  closeCallExtraGraders: number; opening: string;
}>;

/** What the practice read from the throwaway database after the debate (no model text). */
export type PracticeShapeFacts = Readonly<{
  /** core.run.depth_params as the ask path stored it. */
  storedDepthParams: Readonly<Record<string, unknown>> | null;
  sizes: PracticeShapeSizes | null;
  /** Every condition mark on the served answer, by code (serve.condition_mark). */
  marks: Readonly<Record<string, number>>;
  /** The map's choice (P2b): how many answers were argued and how many points were raised but not debated. */
  choice: Readonly<{ answers: number; alsoRaised: number }> | null;
  /** The run's map calls in ledger order, every try. */
  mapCallSiteKeys: readonly string[];
}>;

export type PracticeShapeBlock = Readonly<{
  source: PracticeShapeSource;
  /** The throwaway register version the debate ran on. */
  registerVersion: string;
  /** FLAG only: ADDED or REPLACED; null for REGISTER. */
  row: "ADDED" | "REPLACED" | null;
  /** The three settings as given on the command line (null: the site's default). */
  asked: Readonly<{ depthMode: string | null; scrutiny: string | null; answerLength: string | null }>;
  storedDepthParams: Readonly<Record<string, unknown>> | null;
  sizes: PracticeShapeSizes | null;
  /** The opening used: the receipt's, or TODAYS_OPENING when the map was unavailable; null when nothing ran. */
  opening: string | null;
  /** The map's marks (spec §1.2) found on the answer, with how often. */
  mapMarks: Readonly<Record<string, number>>;
  chosenAnswers: number | null;
  alsoRaised: number | null;
  /** PANEL-CLOSE-CALL-EXTENDED marks: a close call brought extra graders. */
  panelCloseCallExtensions: number;
  /** SCRUTINY-EXTENDED marks: scrutiny added an exchange. */
  scrutinyExtensions: number;
  mapCallsByStep: Readonly<Record<PracticeMapStep, number>>;
  /** Why the new shape did not run (the verdict's SHAPE_NOT_EXERCISED reason); null when it ran or nothing was admitted. */
  notExercised: string | null;
}>;

/** P2b's map choice as the practice counts it (structurally P2c's MapChoiceRecord). */
export type PracticeMapChoice = Readonly<{ answers: readonly unknown[]; alsoRaised: readonly unknown[] }>;
export type PracticeMapReaders = Readonly<{
  choice(runId: string): Promise<PracticeMapChoice | null>;
  items(runId: string): Promise<readonly unknown[]>;
}>;

/** The ONE place the practice calls P2b's map readers (decrypted with the run's key, which lives only in this process). */
export function practiceMapReaders(pool: Pool): PracticeMapReaders {
  return Object.freeze({
    choice: (runId: string) => readMapChoiceForRun(pool, runId),
    items: (runId: string) => readMapItemsForRun(pool, runId)
  });
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null;
}

function sizesOf(shape: DebateShapeCeilingInput): PracticeShapeSizes {
  return Object.freeze({
    plan: shape.plan, depthMode: shape.depthMode, scrutiny: shape.scrutiny, answerLength: shape.answerLength,
    mapAIs: shape.mapAIs, answers: shape.answers, graders: shape.graders, pointsPerAnswer: shape.pointsPerAnswer,
    deeperTopPoints: shape.deeperTopPoints, gapRounds: shape.gapRounds, closeCallExtraGraders: shape.closeCallExtraGraders,
    opening: shape.opening
  });
}

/** Reads what the run did, from the throwaway database, before it is deleted. Codes and counts only. */
export async function readPracticeShapeFacts(pool: Pick<Pool, "query">, runId: string, answerId: string | null,
  readers: PracticeMapReaders): Promise<PracticeShapeFacts> {
  const run = (await pool.query<{ depth_params: unknown; envelope_basis: unknown }>(
    "SELECT depth_params, envelope_basis FROM core.run WHERE run_id=$1", [runId])).rows[0];
  const shape = run === undefined ? undefined : parseCostEnvelopeBasis(run.envelope_basis).shape;
  const marks = answerId === null ? [] : (await pool.query<{ mark: string; n: number }>(
    "SELECT mark, count(*)::int AS n FROM serve.condition_mark WHERE answer_id=$1 GROUP BY mark ORDER BY mark", [answerId])).rows;
  const keys = (await pool.query<{ call_site_key: string }>(
    `SELECT call_site_key FROM ledger.ledger_entry
      WHERE run_id=$1 AND action_kind='MODEL_CALL' AND call_site_key LIKE 'MAP:%' ORDER BY sequence`, [runId])).rows;
  const choice = await readers.choice(runId);
  return Object.freeze({
    storedDepthParams: recordOf(run?.depth_params),
    sizes: shape === undefined ? null : sizesOf(shape),
    marks: Object.freeze(Object.fromEntries(marks.map((row) => [row.mark, row.n]))),
    choice: choice === null ? null : Object.freeze({ answers: choice.answers.length, alsoRaised: choice.alsoRaised.length }),
    mapCallSiteKeys: Object.freeze(keys.map((row) => row.call_site_key))
  });
}

const MAP_UNAVAILABLE = "MAP_UNAVAILABLE_TODAYS_OPENING";

/** The report's block. `facts` null: nothing was admitted (or, with `unreadable`, the facts could not be read). Pure. */
export function practiceShapeBlock(input: Readonly<{
  source: PracticeShapeSource; registerVersion: string; row: "ADDED" | "REPLACED" | null; asked: PracticeShapeAsk;
  facts: PracticeShapeFacts | null; unreadable?: string;
}>): PracticeShapeBlock {
  const facts = input.facts;
  const marks = facts?.marks ?? {};
  const byStep: Record<PracticeMapStep, number> = { angles: 0, list: 0, merge: 0, gap: 0, choose: 0 };
  for (const key of facts?.mapCallSiteKeys ?? []) {
    const step = practiceMapStepOf(key);
    if (step !== null) byStep[step] += 1;
  }
  const mapUnavailable = (marks[MAP_UNAVAILABLE] ?? 0) > 0;
  const notExercised = input.unreadable !== undefined ? `FACTS_UNREADABLE:${input.unreadable}`
    : facts === null ? null
      : facts.sizes === null ? "NO_SHAPE_ON_RECEIPT"
        : mapUnavailable ? MAP_UNAVAILABLE : null;
  return Object.freeze({
    source: input.source,
    registerVersion: input.registerVersion,
    row: input.row,
    asked: Object.freeze({ depthMode: input.asked.depthMode ?? null, scrutiny: input.asked.scrutiny ?? null,
      answerLength: input.asked.answerLength ?? null }),
    storedDepthParams: facts?.storedDepthParams ?? null,
    sizes: facts?.sizes ?? null,
    opening: facts === null ? null : mapUnavailable ? "TODAYS_OPENING" : facts.sizes?.opening ?? null,
    mapMarks: Object.freeze(Object.fromEntries(Object.entries(marks).filter(([code]) => (MAP_MARKS as readonly string[]).includes(code)))),
    chosenAnswers: facts?.choice?.answers ?? null,
    alsoRaised: facts?.choice?.alsoRaised ?? null,
    panelCloseCallExtensions: marks["PANEL-CLOSE-CALL-EXTENDED"] ?? 0,
    scrutinyExtensions: marks["SCRUTINY-EXTENDED"] ?? 0,
    mapCallsByStep: Object.freeze(byStep),
    notExercised
  });
}

/** The report.md paragraph: counts and codes, never model text. */
export function practiceShapeLines(block: PracticeShapeBlock): readonly string[] {
  const where = block.source === "FLAG"
    ? `from --shape-policy, in this throwaway register only: version ${block.registerVersion}, row ${block.row === "REPLACED" ? "replaced" : "added"}`
    : `from the imported register's own row, version ${block.registerVersion}`;
  const asked = `depth mode ${block.asked.depthMode ?? "default"}, scrutiny ${block.asked.scrutiny ?? "default"}, `
    + `answer length ${block.asked.answerLength ?? "default"}`;
  const sizes = block.sizes === null ? "none (the run was not admitted with the shape)"
    : `plan ${block.sizes.plan}, ${String(block.sizes.mapAIs)} map AIs, up to ${String(block.sizes.answers)} answers, `
      + `${String(block.sizes.graders)} graders (+${String(block.sizes.closeCallExtraGraders)} on a close call), `
      + `${String(block.sizes.pointsPerAnswer)} points per answer, ${block.sizes.depthMode}, scrutiny ${block.sizes.scrutiny}, `
      + `answer length ${block.sizes.answerLength}`;
  const steps = PRACTICE_MAP_STEPS.map((step) => `${step} ${String(block.mapCallsByStep[step])}`).join(", ");
  const marks = Object.entries(block.mapMarks);
  const counted = (value: number | null) => (value === null ? "none stored" : String(value));
  return [`Debate shape (${where}):`, "",
    `- asked: ${asked}; stored: ${block.storedDepthParams === null ? "nothing" : JSON.stringify(block.storedDepthParams)}`,
    `- sizes on the run's receipt: ${sizes}`,
    `- opening used: ${block.opening ?? "none"}`,
    `- map calls (every try, as the ledger recorded them): ${steps}`,
    `- chosen answers: ${counted(block.chosenAnswers)}; also raised, not debated: ${counted(block.alsoRaised)}`,
    `- map marks: ${marks.length === 0 ? "none" : marks.map(([mark, n]) => `${mark} x${String(n)}`).join(", ")}`,
    `- panel close-call extensions: ${String(block.panelCloseCallExtensions)}; scrutiny extensions: ${String(block.scrutinyExtensions)}`,
    ...(block.notExercised === null ? [] : [`- the new shape was not exercised: ${block.notExercised}`]),
    ""];
}
```

- [ ] **Step 4: The verdict** in `tools/preview-practice/practice-verdict.ts`

In `PracticeVerdictInput`, after `busyModels?: readonly string[];`, add:

```ts
  /**
   * Debate shape (plan 2026-10-12-debate-shape-phase2d): why a debate asked for the new shape did not run it (the map
   * was unavailable and the opening fell back to today's; the run was admitted without the shape; its facts could not be
   * read). Not a failure: NOT_PROVEN, as the shape was not shown to work. Optional: none when absent.
   */
  shapeNotExercised?: readonly string[];
```

In `practiceVerdict`, inside the `notProven` array, after the `GATE_PAUSED` line, add:

```ts
    ...[...(input.shapeNotExercised ?? [])].sort().map((why) => `SHAPE_NOT_EXERCISED:${why}`),
```

- [ ] **Step 5: The report** in `tools/preview-practice/practice-report.ts`

(a) Add the import: `import { practiceShapeLines, type PracticeShapeBlock } from "./practice-shape.js";`

(b) In `debateReport`, in the `practiceVerdict({ … })` input, after `busyModels: busyDuringRun,`, add:

```ts
    shapeNotExercised: r.shape === undefined || r.shape.notExercised === null ? [] : [r.shape.notExercised],
```

(c) In the returned object, right after `ask: Object.freeze({ questionId: r.questionId, depth: r.depth, planTier: "premium" }),`, add:

```ts
    // Debate shape: only when the debate ran with a debate-shape row; absent otherwise, so today's report keeps its keys.
    ...(r.shape === undefined ? {} : { shape: r.shape }),
```

(d) In `reportMarkdown`, right after the line that pushes the `Totals:` block, add:

```ts
  const shape = typeof report.shape === "object" && report.shape !== null ? report.shape as PracticeShapeBlock : undefined;
  if (shape !== undefined) lines.push(...practiceShapeLines(shape));
```

- [ ] **Step 6: Read the facts** in `tools/preview-practice/practice-debate.ts`

(a) Extend the `./practice-shape.js` import: `practiceMapReaders`, `practiceShapeBlock`, `readPracticeShapeFacts`, `type PracticeShapeBlock`, `type PracticeShapeFacts`, `type PracticeShapeOverride`, `type PracticeShapeSource`.

(b) In `PracticeDebateResult`, after the `transcript?:` member, add:

```ts
  /** Debate shape: what the shape run did (practice-shape.ts); absent when the debate ran without a debate-shape row. */
  shape?: PracticeShapeBlock;
```

(c) Right after the `const shapeSource = …` line (Task 2), add:

```ts
    const shapeBlockOf = (source: PracticeShapeSource, facts: PracticeShapeFacts | null, unreadable?: string): PracticeShapeBlock =>
      practiceShapeBlock({ source, registerVersion, row: shapeVersion?.row ?? null, asked, facts, ...(unreadable === undefined ? {} : { unreadable }) });
```

(d) In the "ask was refused" early `return Object.freeze({ … })`, after `remaining, seconds: { admission: admissionSeconds, debate: 0 }`, add (with the comma the object needs):

```ts
        ...(shapeSource === null ? {} : { shape: shapeBlockOf(shapeSource, null) })
```

(e) Replace `const collected = await collect(pool, job.runId);` with:

```ts
    const collected = await collect(pool, job.runId);
    // Debate shape: what the shape run did, read before the database goes. A reading that breaks costs only this block
    // (NOT_PROVEN: the shape was not shown to run), never the report.
    let shape: PracticeShapeBlock | undefined;
    if (shapeSource !== null) {
      try {
        shape = shapeBlockOf(shapeSource, await readPracticeShapeFacts(pool, job.runId, answerId, practiceMapReaders(pool)));
      } catch (error) {
        shape = shapeBlockOf(shapeSource, null, codeOf(error));
        progress(`debate shape: what the run did could not be read (${codeOf(error)})`);
      }
    }
```

(f) In the final `return Object.freeze({ … })`, after `...(transcript === undefined ? {} : { transcript })`, add `,\n      ...(shape === undefined ? {} : { shape })`.

- [ ] **Step 7: Run and expect PASS**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: PASS (20 tests).

Then, one at a time:
- `pnpm exec vitest run tests/unit/preview-practice.test.ts`
- `pnpm exec vitest run tests/unit/preview-practice-slips.test.ts`

Expected: PASS.

- [ ] **Step 8: Typecheck (alone)**

Run: `pnpm run typecheck`
Expected: no error. If `readMapChoiceForRun`'s or `readMapItemsForRun`'s form differs from `(pool, runId)` (Task 0 step 2), adapt only `practiceMapReaders` and say so in the commit message body. If `@debateai/budget` is not resolvable from `tools/`, import `parseCostEnvelopeBasis` the way the practice's other money code does (`../../apps/api/src/…`). STOP and report if neither works.

- [ ] **Step 9: Commit**

```bash
git add tools/preview-practice/practice-shape.ts tools/preview-practice/practice-verdict.ts tools/preview-practice/practice-report.ts tools/preview-practice/practice-debate.ts tests/unit/preview-practice-shape.test.ts
git commit -m "Practice: the report's debate-shape block (opening, map calls by step, chosen and also-raised counts, map marks, panel and scrutiny extensions); a shape run that did not run the shape is NOT_PROVEN

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The transcript holds the map

**Files:**
- Modify: `tools/preview-practice/practice-transcript.ts` (`PracticeTranscript.structure`, `buildPracticeTranscript`, `recordPracticeTranscript`)
- Modify: `tools/preview-practice/practice-debate.ts` (the `recordPracticeTranscript` call)
- Modify: `tests/unit/preview-practice-transcript.test.ts` (one case in "the file")

**Interfaces:**
- Consumes: `practiceMapReaders` (Task 4).
- Produces:
```ts
export function readPracticeMap(readers: PracticeMapReaders, runId: string): Promise<Readonly<{ choice: PracticeMapChoice | null; items: readonly unknown[] }>>; // practice-shape.ts
// buildPracticeTranscript input gains `map?: unknown`; structure gains `map` only when given.
// recordPracticeTranscript input gains `map?: () => Promise<unknown>`.
```

- [ ] **Step 1: Write the failing test.** In `tests/unit/preview-practice-transcript.test.ts`, inside `describe("preview practice transcript: the file", …)`, add:

```ts
  it("holds structure.map only for a debate-shape run (today's file keeps its keys)", () => {
    expect(Object.keys(transcript().structure)).toEqual(["answer", "inspection", "story"]);
    const map = { choice: { answers: [{ statement: "Da." }], alsoRaised: [{ claim: "Costul.", makers: ["Anthropic"] }] },
      items: [{ itemId: "i-1", step: "LIST", claim: "Costul." }] };
    const shaped = buildPracticeTranscript({ run: RUN, attempts: attempts(), answer: null, inspection: null, story: null, unavailable: [], map,
      now: new Date("2026-10-12T10:06:00.000Z") });
    expect(Object.keys(shaped.structure)).toEqual(["answer", "inspection", "story", "map"]);
    expect(shaped.structure.map).toEqual(map);
  });
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/preview-practice-transcript.test.ts`
Expected: FAIL: `structure.map` is missing (and `map` is not an accepted input).

- [ ] **Step 3: Implement**

In `tools/preview-practice/practice-shape.ts`, append:

```ts
/** The map as transcript.json holds it (`structure.map`): P2b's choice and every map item, decrypted. */
export async function readPracticeMap(readers: PracticeMapReaders, runId: string): Promise<Readonly<{
  choice: PracticeMapChoice | null; items: readonly unknown[];
}>> {
  return Object.freeze({ choice: await readers.choice(runId), items: await readers.items(runId) });
}
```

In `tools/preview-practice/practice-transcript.ts`:

(a) In `PracticeTranscript.structure`, after the `story: unknown;` member, add:

```ts
    /**
     * Debate shape only (absent otherwise): the map's choice (the answers argued, the points also raised) and every map
     * item (each point and candidate answer with the AI that wrote it), as P2b's readers return them, decrypted.
     */
    map?: unknown;
```

(b) In `buildPracticeTranscript`'s input, after `unavailable: readonly string[];`, add `map?: unknown;`. Replace its `structure:` line with:

```ts
    structure: Object.freeze({ answer: input.answer, inspection: input.inspection, story: input.story,
      ...(input.map === undefined ? {} : { map: input.map }) }),
```

(c) In `recordPracticeTranscript`'s input, after `story: unknown;`, add:

```ts
  /** Debate shape only: reads the map (practice-shape.ts readPracticeMap). Absent: no structure.map, as today. */
  map?: () => Promise<unknown>;
```

Replace its `const transcript = buildPracticeTranscript({ … });` line with:

```ts
  let map: unknown;
  if (input.map !== undefined) {
    try {
      map = await input.map();
      if ((map as { choice?: unknown }).choice === null) {
        unavailable.push("structure.map.choice: no map choice was stored (the opening fell back to today's, or the run settled none)");
      }
    } catch (error) {
      map = null;
      unavailable.push(`structure.map: ${error instanceof Error ? error.name : "UNKNOWN"}`);
    }
  }
  const transcript = buildPracticeTranscript({ run: input.run, attempts, answer: input.answer, inspection, story: input.story, unavailable,
    ...(input.map === undefined ? {} : { map }) });
```

In `tools/preview-practice/practice-debate.ts`:
- extend the `./practice-shape.js` import with `readPracticeMap`;
- in the `recordPracticeTranscript({ … })` call, after `pool, directory: input.transcriptDirectory, ownerRef, answer: projection, story: storedStory,`, add:

```ts
          ...(shapeSource === null ? {} : { map: () => readPracticeMap(practiceMapReaders(pool), job.runId) }),
```

- [ ] **Step 4: Run and expect PASS**

Run: `pnpm exec vitest run tests/unit/preview-practice-transcript.test.ts`
Expected: PASS (the existing key-order case `["schema", "writtenAt", "run", "totals", "attempts", "structure", "unavailable"]` is unchanged).

- [ ] **Step 5: Commit**

```bash
git add tools/preview-practice/practice-shape.ts tools/preview-practice/practice-transcript.ts tools/preview-practice/practice-debate.ts tests/unit/preview-practice-transcript.test.ts
git commit -m "Practice transcript: structure.map (the map's choice and items) for a debate-shape run only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The proof: a whole new-shape practice debate against the scripted gates

**Files:**
- Modify: `tests/support/preview-gate-stubs.ts` (`GateRequestKind`, `classifyGateRequest`, `answerFor`, new `stubMapContent`)
- Modify: `tests/integration/preview-practice-run.test.ts` (imports, one new describe)

**Interfaces:**
- Consumes: `MAP_CONTRACT_IDS` (`@debateai/map`), `openingsDryContent` (`tools/preview-practice/practice-openings-dry.ts`), `readFramedMaterial` / `wirePacket` (tests/support/framed-packet.ts), and Tasks 1–5.
- Produces: `GateRequestKind` gains `"MAP"`; `stubMapContent(chat: string, serial: number): string`.

- [ ] **Step 1: The doubles answer the map.** In `tests/support/preview-gate-stubs.ts`:

(a) Add imports:

```ts
import { MAP_CONTRACT_IDS } from "@debateai/map";
import { openingsDryContent } from "../../tools/preview-practice/practice-openings-dry.js";
```

(b) Replace the `GateRequestKind` line:

```ts
export type GateRequestKind = "PROBE" | "STORYTELLER" | "STORY_CHECKER" | "MAP" | "PANEL" | "REVIEW" | "JUDGE" | "EVALUATOR" | "COMPOSE";
```

(c) In the "the doubles' answers" section, after `stubStoryFor`, add:

```ts
/**
 * A valid map reply (debate shape, spec 2026-10-12 §1) for the step the request is: the openings dry script's own
 * answer (tools/preview-practice/practice-openings-dry.ts), in the question's language. The exception is choose: it names
 * TWO distinct answers, the first two merged answers. They get an OPPOSITE_CASE point against the first, a PRACTICAL
 * point for it, an ASKER_WORRY point for the second, and one more point against it (any point not yet used). So a clean
 * debate needs no filling, meets the choose quotas, and leaves points also raised.
 */
export function stubMapContent(chat: string, serial: number): string {
  const frame = readFramedMaterial(wirePacket(chat));
  if (frame.contractId === MAP_CONTRACT_IDS.choose) {
    const field = (name: string): string => frame.fields.find((entry) => entry.name === name)?.content ?? "[]";
    const keyPoints = JSON.parse(field("key_points")) as { key_point_id: string; angle_kind: string | null }[];
    const merged = JSON.parse(field("answers")) as { answer_id: string; answer: string }[];
    if (merged.length >= 2 && keyPoints.length >= 4) {
      const used = new Set<string>();
      const take = (kind: string | null): string[] => {
        const found = keyPoints.find((point) => point.angle_kind === kind && !used.has(point.key_point_id))
          ?? keyPoints.find((point) => !used.has(point.key_point_id));
        if (found === undefined) return [];
        used.add(found.key_point_id);
        return [found.key_point_id];
      };
      const againstFirst = take("OPPOSITE_CASE");
      const forFirst = take("PRACTICAL");
      const forSecond = take("ASKER_WORRY");
      const againstSecond = take(null);
      return JSON.stringify({ answers: [
        { answer_id: "a-1", statement: merged[0]!.answer, for: forFirst, against: againstFirst, strongest_rival: "a-2" },
        { answer_id: "a-2", statement: merged[1]!.answer, for: forSecond, against: againstSecond, strongest_rival: "a-1" }
      ] });
    }
  }
  return openingsDryContent({ contractId: frame.contractId, fields: frame.fields, serial, slip: false });
}
```

(d) In `classifyGateRequest`, after the `STORY_CHECKER` line, add:

```ts
  if ((Object.values(MAP_CONTRACT_IDS) as readonly string[]).includes(contractId)) return "MAP";
```

(e) In `answerFor`'s `switch (kind)`, add before `default:`:

```ts
      case "MAP": return stubMapContent(chat, served);
```

(f) In the file's top comment, after "every other request is answered by its contract (a valid reply)", add ", a debate-shape map step included (stubMapContent)".

- [ ] **Step 2: Write the integration cases.** In `tests/integration/preview-practice-run.test.ts`:

(a) Change `import { randomUUID } from "node:crypto";` to `import { createHash, randomUUID } from "node:crypto";`.

(b) Append at the end of the file:

```ts
describe("preview practice: debate mode, the new debate shape (spec 2026-10-12 §5)", () => {
  const SHAPE_POLICY_START = fileURLToPath(new URL("../../tools/preview-practice/shape-policy-start.json", import.meta.url));
  type ShapeReport = {
    verdict: string; reasons: string[]; ask: unknown; register: { steps: { path: string }[] };
    run: { runId: string; workItemOutcome: string; answer: { served: boolean }; story: { outcome: string } };
    byModelAndSite: { model: string; site: string }[];
    shape?: { source: string; registerVersion: string; row: string | null; storedDepthParams: unknown; sizes: Record<string, unknown> | null;
      opening: string | null; mapMarks: Record<string, number>; chosenAnswers: number | null; alsoRaised: number | null;
      panelCloseCallExtensions: number; scrutinyExtensions: number; mapCallsByStep: Record<string, number>; notExercised: string | null };
  };
  const exportDigest = () => createHash("sha256").update(readFileSync(registerExportPath)).digest("hex");
  /** How many also-raised points the storyteller was handed (its `also_raised` field, P2c), over all its answered calls. */
  const storytellerAlsoRaised = (requests: readonly GateRecord[]): number => requests
    .filter((request) => request.kind === "STORYTELLER" && request.answer === "OK")
    .map((request) => readFramedMaterial(wirePacket(stubChatBody(request.provider, request.body))).fields
      .find((field) => field.name === "also_raised")?.content)
    .reduce((sum, content) => sum + (content === undefined ? 0 : (JSON.parse(content) as unknown[]).length), 0);

  it("--shape-policy (the owners' start values): the map, the chosen answers argued, a served answer and a READY story handed what was also raised: PASS (exit 0)", async () => {
    const before = exportDigest();
    const { stubs, env, common, quiet, out } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1",
      "--shape-policy", SHAPE_POLICY_START, "--transcript"], env, quiet);
    const report = outcome.report as unknown as ShapeReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    // The export is only read; the import itself is today's; the practice's own version is one above it.
    expect(exportDigest()).toBe(before);
    expect(report.register.steps.map((step) => step.path)).toEqual(["HISTORICAL_IMPORT", "GENERAL_PUBLICATION"]);
    expect(report.run).toMatchObject({ workItemOutcome: "COMPLETED", answer: { served: true }, story: { outcome: "READY" } });
    // Both compositions read the row: the ask path stored the four settings, admission froze the sizes, the runner ran the map.
    expect(report.shape).toMatchObject({
      source: "FLAG", registerVersion: "6", row: "ADDED", opening: "ANGLE_MAP", chosenAnswers: 2, notExercised: null,
      storedDepthParams: { depth: 1, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" },
      sizes: { plan: "premium", depthMode: "adaptive", scrutiny: "standard", answerLength: "standard", mapAIs: 5, graders: 3, opening: "ANGLE_MAP" }
    });
    expect(report.shape!.alsoRaised).toBeGreaterThan(0);
    expect(report.shape!.mapCallsByStep).toMatchObject({ angles: 1, merge: 1, choose: 1 });
    expect(report.shape!.mapCallsByStep.list).toBeGreaterThanOrEqual(2);
    expect(report.shape!.mapCallsByStep.gap).toBeGreaterThanOrEqual(1);
    expect(report.byModelAndSite.some((row) => row.site === "MAP")).toBe(true);
    expect(stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);
    expect(stubs.requests.filter((request) => request.kind === "MAP" && request.answer === "OK").length).toBeGreaterThanOrEqual(5);
    expect(storytellerAlsoRaised(stubs.requests)).toBeGreaterThan(0);
    // The transcript holds the map and ran on the practice's version.
    const transcript = JSON.parse(readFileSync(join(out, "transcript.json"), "utf8")) as {
      run: { registerVersion: string }; attempts: { family: string }[];
      structure: { map?: { choice: { alsoRaised: unknown[] } | null; items: unknown[] } };
    };
    expect(transcript.run.registerVersion).toBe("6");
    expect(transcript.attempts.some((attempt) => attempt.family === "MAP")).toBe(true);
    expect(transcript.structure.map?.choice?.alsoRaised.length ?? 0).toBeGreaterThan(0);
    expect(transcript.structure.map?.items.length ?? 0).toBeGreaterThan(0);
  }, 900_000);

  it("no --shape-policy and a register without the row: today's shape, nothing new in the report, no map call", async () => {
    const { stubs, env, common, quiet, out } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1", "--transcript"], env, quiet);
    const report = outcome.report as unknown as ShapeReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect("shape" in report).toBe(false);
    expect(report.ask).toEqual({ questionId: "ro", depth: 1, planTier: "premium" });
    expect(report.byModelAndSite.some((row) => row.site === "MAP")).toBe(false);
    expect(stubs.requests.some((request) => request.kind === "MAP")).toBe(false);
    expect(storytellerAlsoRaised(stubs.requests)).toBe(0);
    const transcript = JSON.parse(readFileSync(join(out, "transcript.json"), "utf8")) as { run: { registerVersion: string }; structure: object };
    expect(transcript.run.registerVersion).toBe("5");
    expect(Object.keys(transcript.structure)).toEqual(["answer", "inspection", "story"]);
  }, 600_000);

  it("refuses a malformed --shape-policy before anything starts: HARNESS_ERROR (exit 40), no gate touched", async () => {
    const bad = join(folder, `shape-bad-${randomUUID()}.json`);
    await writeFile(bad, JSON.stringify({ ...(JSON.parse(readFileSync(SHAPE_POLICY_START, "utf8")) as object), version: 2 }));
    const { stubs, env, common, quiet } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--shape-policy", bad], env, quiet);
    expect(outcome.exitCode).toBe(40);
    expect(outcome.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_SHAPE_POLICY_INVALID"]);
    expect(stubs.requests).toEqual([]);
    expect(stubs.remainingReads).toEqual([]);
  }, 60_000);

  it("--depth-mode without a debate-shape row: refused before any model call (HARNESS_ERROR, exit 40)", async () => {
    const { stubs, env, common, quiet } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth-mode", "fixed"], env, quiet);
    expect(outcome.exitCode).toBe(40);
    expect(outcome.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW"]);
    expect(stubs.requests).toEqual([]);
  }, 300_000);
});
```

(c) Extend the stubs import: `import { startPreviewGateStubs, stubChatBody, type GateOverride, type GateRecord, type GateRequest } from "../support/preview-gate-stubs.js";`

- [ ] **Step 3: Run the new cases (alone, nothing else running)**

Check memory and runs as the Global Constraints say. Then run:
`pnpm exec vitest run tests/integration/preview-practice-run.test.ts -t "the new debate shape"`
Expected: 4 passed, the rest of the file skipped.

If the shape case fails, read `report.reasons` and `report.shape` in the failure output first:
- `SHAPE_NOT_EXERCISED:NO_SHAPE_ON_RECEIPT`: the ask composition did not read the row at the practice version. Check Task 2 (d).
- `MAP_UNAVAILABLE_TODAYS_OPENING`: the stubs did not answer the map. Look for `UNEXPECTED` requests in `stubs.requests`.
- a `STORY_NOT_READY`: check P2c's story pack version against the doubles' storyteller answer.

Fix the root cause. Never weaken an assertion to pass.

- [ ] **Step 4: Commit**

```bash
git add tests/support/preview-gate-stubs.ts tests/integration/preview-practice-run.test.ts
git commit -m "Practice integration: a whole new-shape debate (PASS, served answer, READY story handed also_raised, the map in the transcript), a row-absent debate with nothing new, and the two refusals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The README: the new shape, the flags and the whole-debate comparison (S-8)

**Files:**
- Modify: `tools/preview-practice/README.md`
- Test: `tests/unit/preview-practice-shape.test.ts` (append a describe)

**Interfaces:**
- Consumes: `parsePracticeArgs`, `practiceDebateQuestion`, `PRACTICE_COMPARISON_QUESTION_IDS`, `practiceShapeOverrideFromArgs`.
- Produces: README sections "The new debate shape (debate mode, `--shape-policy`)" and "S-8, Mac: the whole-debate comparison (today's shape and the new shape)".

- [ ] **Step 1: Write the failing test.** Append to `tests/unit/preview-practice-shape.test.ts`:

```ts
describe("README: the debate commands are real commands of this tool", () => {
  const readme = readFileSync(new URL("../../tools/preview-practice/README.md", import.meta.url), "utf8");
  const commands = readme.split("\n").filter((line) => line.includes("tools/preview-practice/practice.ts debate "));
  const argvOf = (line: string): string[] => line.slice(line.indexOf("practice.ts ") + "practice.ts ".length).trim().split(/\s+/u)
    .map((word) => word.replace(/^"(.*)"$/u, "$1"));
  const readFromEngine = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

  it("names the pass bar, the new shape and the comparison", () => {
    expect(commands.length).toBeGreaterThanOrEqual(4);
    expect(commands.filter((line) => line.includes("--shape-policy tools/preview-practice/shape-policy-start.json")).length).toBeGreaterThanOrEqual(2);
    expect(commands.filter((line) => line.includes("--question \"$Q\""))).toHaveLength(2);
  });

  it("every one parses with flags the tool reads, fixed questions and a valid policy file", () => {
    for (const line of commands) {
      const args = parsePracticeArgs(argvOf(line));
      expect(args.mode).toBe("debate");
      const asked = args.flags.get("--question") ?? "ro";
      for (const id of asked === "$Q" ? [...PRACTICE_COMPARISON_QUESTION_IDS] : [asked]) expect(practiceDebateQuestion(id).id).toBe(id);
      expect(() => practiceShapeOverrideFromArgs(args.mode, args.flags, readFromEngine)).not.toThrow();
      if (asked === "$Q") {
        expect(args.flags.get("--depth")).toBe("1");
        expect(args.switches.has("--transcript")).toBe(true);
        expect(args.flags.get("--out")).toMatch(/^\$P\/compare\/\$Q\/(today|shape)$/u);
      }
    }
  });

  it("leaves the judging to the owners, outside the repository", () => {
    expect(readme).toContain("results are judged by the owners' private method, outside this repository");
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: FAIL: "names the pass bar, the new shape and the comparison" (only S-6's debate command exists).

- [ ] **Step 3: Edit the README.** In `tools/preview-practice/README.md`:

(a) In "## What this is, in plain words", at the end of the **debate** bullet, add: ` With \`--shape-policy\` it runs the new debate shape instead (see "The new debate shape").`

(b) Insert this section right before `## Safety rules built in`:

````markdown
### The new debate shape (debate mode, `--shape-policy`)

The new debate shape (spec 2026-10-12, Phase 2) is switched on by one register row, `debateShapePolicy`. The live
preview has no such row, so a practice debate runs today's shape unless you ask for the new one.

- `--shape-policy FILE` puts the row from FILE into the practice's own throwaway database, and only there:
  - The register is copied as always: every exported version, each proved by its hash.
  - Then ONE more version is published in the throwaway database. It holds the last exported version's rows with the
    debate-shape row added. If the export already holds a debate-shape row, the copy's row is replaced instead.
  - The practice asks and argues on that version: both the ask path and the runner read the row from it.
  - The export file is only read. The live register is never reached; the practice has no connection to the live
    database at all.
- `tools/preview-practice/shape-policy-start.json` holds the owners' start values: rulings S5 to S8, with the angle map
  as the opening. A unit test keeps it equal to the start values in the code.
  - A file that does not pass the register's own check is refused before anything starts, with
    `PRACTICE_SHAPE_POLICY_INVALID`.
  - The refusal names only the place in the file that is wrong.
- `--depth-mode fixed|adaptive`, `--scrutiny standard|deep|exhaustive` and `--answer-length short|standard|detailed`
  ask the practice debate with these settings, as the /new page sends them.
  - The ask path adjusts them for the plan exactly as the site does. The practice asks as a premium person with no plan
    id, so the `premium` sizes apply.
  - Each one left out is the site's default: adaptive, standard, standard.
  - Without a debate-shape row they would be ignored, so they are refused before any AI is asked, with
    `PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW`.
- Only debate reads these four flags. Every other mode refuses them, and a mistyped flag is refused before anything
  starts (`PRACTICE_FLAG_UNKNOWN`).

With the row, `report.json` gains a `shape` block, and `report.md` a "Debate shape" paragraph with no reply text. The
block holds:

- `source`: FLAG for `--shape-policy`, REGISTER for a register that already holds the row;
- `registerVersion`: the throwaway version the debate ran on;
- `row`: ADDED or REPLACED;
- `asked`: the three settings as given;
- `storedDepthParams`: what the ask path stored for the run;
- `sizes`: the sizes frozen on the run's money receipt (plan, map AIs, answers, graders, close-call extra graders,
  points per answer, deeper points, gap rounds, the three settings, the opening);
- `opening`: the opening the debate used. It is `TODAYS_OPENING` when the map was unavailable and each AI wrote its own
  position, as today;
- `mapCallsByStep`: the map's calls by step (angles, list, merge, gap, choose), every try as the ledger recorded it;
- `chosenAnswers` and `alsoRaised`: how many different answers were argued, and how many points came up but were not
  debated;
- `mapMarks`: the map's fallback marks, with how often each came up (for example `ANSWERS_FILLED`);
- `panelCloseCallExtensions` and `scrutinyExtensions`: how often a close call brought extra graders, and how many extra
  exchanges scrutiny added;
- `notExercised`: why the new shape did not run, else null.

Map calls also count everywhere else, like any other call:

- in `byModelAndSite`, as the site `MAP`;
- for the format rule.

With `--transcript`, `transcript.json` gains `structure.map`:

- the map's items: every point and candidate answer, with the AI that wrote it;
- the choice: the answers argued and the points also raised.

A debate asked for the new shape that did not run it is NOT_PROVEN (exit 30), with the reason
`SHAPE_NOT_EXERCISED:<why>`:

- `MAP_UNAVAILABLE_TODAYS_OPENING`: fewer than two map lists came back, so the opening fell back to today's;
- `NO_SHAPE_ON_RECEIPT`: the run was admitted without the shape;
- `FACTS_UNREADABLE:<code>`: what the run did could not be read.

Without `--shape-policy`, on a register without the row, nothing changes: today's shape, and no `shape` block.

To run the new shape, add the start values to S-6's debate command (S-3 first, as always):

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question ro --shape-policy tools/preview-practice/shape-policy-start.json --out "$P/debate-shape-report"
echo "exit: $?"
```
````

(c) Insert this section right before `### S-7, stop and clean up`:

````markdown
### S-8, Mac: the whole-debate comparison (today's shape and the new shape)

What it is, in plain words:

- The same four fixed questions are argued twice each, at depth 1 with all five AIs: once in today's shape and once in
  the new shape (the owners' start values).
- Each run gets its own `--out` folder: `$P/compare/<question>/today` and `$P/compare/<question>/shape`.
- Each folder holds `report.json`, `report.md` and `transcript.json`.
- The tool only runs and records the debates. The results are judged by the owners' private method, outside this
  repository. Nothing in this README or in the tool is part of that method.

The four questions are fixed in the code (`practice-questions.ts`). Each one is word for word the openings question of
the same id, so the Phase 1 data lines up:

| Id | Language | Kind |
|---|---|---|
| `ro-euro` | Romanian | public policy |
| `ro-strainatate` | Romanian | personal decision |
| `en-nuclear` | English | contested fact |
| `en-social-media-age` | English | ethics |

**The pass bar comes first** (the owner's rule: before any upload, a practice with all real AIs must pass):

1. Day 1: run S-3, then S-6's formats. It must PASS. For exit 10 the owner decides, as in the table above.
2. Then run the first pair on `ro-euro`, today's shape first. Both debates must PASS:
   - today's shape is the release's practice debate, because the upload ships with the row absent, so the site keeps
     today's shape;
   - the new shape proves the shape.

   If either is FAIL, stop: nothing is uploaded and the comparison waits for a fix. These two runs are also the
   comparison's first pair.

**One pair a day after that:**

| Day | Pair | Order |
|---|---|---|
| 2 | `ro-strainatate` | new shape first |
| 3 | `en-nuclear` | today's shape first |
| 4 | `en-social-media-age` | new shape first |

Money and time, within the owner's test budget of $5 DeepInfra and $1 Haiku a day:

- **Cost per debate.** A depth-1 debate costs roughly $0.15 to $0.70 in today's shape and about $0.30 in the new shape.
  Formats costs $0.10 to $0.30. The whole comparison is roughly $2.5 to $6, spread over at least four days.
- **Room the estimate needs.** The start-of-debate estimate needs more room left than a debate spends: about $4
  DeepInfra and $0.90 Anthropic for depth 1. So the second debate of a day may be refused at the ask. Then the report's
  first reason starts with `ADMISSION_REFUSED:`, and nothing but the AIs' health checks was spent.
  - Run that debate first thing the next Bucharest day, into the same folder.
  - Note in your own log that the pair was split over two days.
- **Daily stop.** After every run, read the "spent by the gate's count" on each gate's line in `report.md`. Stop for
  the day once the day's runs add up to $4.50 DeepInfra or $0.90 Anthropic. Haiku is the only AI on the Anthropic gate,
  so its line is Haiku's share.
- **Time.** A debate takes about 1 to 2 hours, so a pair fits in one relay lifetime (S-4: 8 hours). If the relay has
  ended, restart it as described under S-6.

Each run: set the question, repeat S-3 and copy the status files down, then run the two commands in the day's order.
Repeat S-3 and the `scp` line before the second command too.

```sh
Q=ro-euro
```

Today's shape:

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question "$Q" --transcript --out "$P/compare/$Q/today"
echo "exit: $?"
```

The new shape:

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question "$Q" --shape-policy tools/preview-practice/shape-policy-start.json --transcript --out "$P/compare/$Q/shape"
echo "exit: $?"
```

What to check after each run:

- **The verdict.** A FAIL or HARNESS_ERROR stops the comparison until it is understood. NOT_PROVEN means some AI sat
  out, or, for the new shape, the shape did not run (`SHAPE_NOT_EXERCISED`). Run that question's pair again on another
  day.
- **The new shape's report.md.** Its "Debate shape" paragraph must say the opening used was `ANGLE_MAP` and must list
  the chosen answers.

Keep `$P/compare` with the other reports (S-7 never deletes `$P`). It holds only our own practice questions and the
AIs' text about them.
````

(d) In "Optional flags", replace the **debate** bullet with:

```markdown
- debate: `--depth 1|2`; `--question ro|en`, or one of the comparison's ids (`ro-euro`, `ro-strainatate`, `en-nuclear`,
  `en-social-media-age`, see S-8); `--transcript` (also write `transcript.json`: every prompt and every answer, see "The
  whole debate, word for word" above); `--shape-policy FILE`, `--depth-mode fixed|adaptive`,
  `--scrutiny standard|deep|exhaustive`, `--answer-length short|standard|detailed` (see "The new debate shape"; debate
  only).
  - The register is copied only through the register's own publication paths.
  - An export holding a support-configuration version is refused (`PRACTICE_REGISTER_PATH_UNSUPPORTED`).
```

Keep any debate-only flags Project 1 added to that bullet, such as `--call-concurrency`.

(e) In "## Money and time (rough)", after the **debate** bullet, add:

```markdown
- debate in the new shape (`--shape-policy`), depth 1: about $0.30 (spec 2026-10-12), with fewer calls than today's
  shape. The same room in the pots is needed at the start.
- the whole-debate comparison (S-8): eight depth-1 debates over at least four days, roughly $2.5 to $6 in all.
```

(f) In "## Files", add these two bullets after the `practice-debate.ts` bullet:

```markdown
- `practice-shape.ts`: the debate-shape flags (`--shape-policy`, `--depth-mode`, `--scrutiny`, `--answer-length`), what
  the shape run did (the report's `shape` block, the transcript's `structure.map`).
- `shape-policy-start.json`: the owners' start values for `--shape-policy`.
```

In the tests bullet, add `tests/unit/preview-practice-shape.test.ts`.

- [ ] **Step 4: Run and expect PASS**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: PASS (23 tests).

- [ ] **Step 5: The README's export SQL is still read by the integration test.** Section (b) and section (c) contain no `-c "SELECT json_build_object(` line, so S-1's single statement stays the only match. Confirm with:

`grep -c "SELECT json_build_object('schema','preview-practice-register-export-v1'" tools/preview-practice/README.md`
Expected: `1`.

- [ ] **Step 6: Commit**

```bash
git add tools/preview-practice/README.md tests/unit/preview-practice-shape.test.ts
git commit -m "Practice README: the new debate shape, its flags and report, and S-8 the whole-debate comparison (pass bar first, four fixed questions, two folders each, within the daily test budget; judged outside the repository)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Final verification

**Files:** none new. Only fix a root cause a run exposes; commit any such fix separately, saying why.

- [ ] **Step 1: Unit files, one at a time** (check memory and runs before each):
  1. `tests/unit/preview-practice-shape.test.ts`
  2. `tests/unit/preview-practice.test.ts`
  3. `tests/unit/preview-practice-transcript.test.ts`
  4. `tests/unit/preview-practice-slips.test.ts`
  5. `tests/unit/preview-practice-wiring-drift.test.ts`
  6. every `tests/unit/practice-openings*.test.ts` file, each alone (`ls tests/unit/practice-openings*.test.ts` lists them). They share `practice-openings-dry.ts` with the doubles.
  7. `tests/architecture/scaffold.test.ts` (the source rules)

Expected: all PASS.

- [ ] **Step 2: Typecheck (alone)**

Run: `pnpm run typecheck`
Expected: no error.

- [ ] **Step 3: The whole practice integration file (alone)**

Run: `pnpm exec vitest run tests/integration/preview-practice-run.test.ts`
Expected: PASS, every case. Today's formats and debate cases are unchanged, so the MAP classification touched nothing they send.

- [ ] **Step 4: The other user of the gate doubles (alone, after Step 3 has finished)**

Run: `pnpm exec vitest run tests/integration/preview-busy-model-run.test.ts`
Expected: PASS.

- [ ] **Step 5: Report to the controller.** Do not push or open a PR. Report:
  - the commit list;
  - the passing test files with their counts;
  - any adaptation Task 0 or Task 4 Step 8 required (P2b reader forms, the `@debateai/budget` import);
  - a reminder that S-8's real runs are the operator's, spend real money and are not part of this plan's build.

---

## Self-review against the spec and the task

| Requirement | Where |
|---|---|
| `--shape-policy <file>` adds `debateShapePolicy` to the THROWAWAY register only, validated by the P2a parser | Task 1 (P2a `parseDebateShapePolicy`, refusals); Task 2 (`publishPracticeShapeVersion` in the throwaway database; rows byte for byte); Task 6 (export digest unchanged; version 6) |
| `--depth-mode`, `--scrutiny`, `--answer-length` ask fields | Task 1 (contract enums); Task 2 (`depth_params`; refused without a row); Task 6 (stored as normalised) |
| Refuses unknown flags | Task 1 (`PRACTICE_FLAG_UNKNOWN` for a typo; debate-only refusal in every other mode); Task 7 (every README debate command parses) |
| README section, plain words, real safe commands only | Task 7 (the sections; every command parsed by a test; only real commands in fenced blocks) |
| Report: map marks, opening used, chosen answers, also-raised count, panel close-call extensions, scrutiny extensions, per-step map call counts | Task 4 (`shape` block and report.md lines) |
| transcript.json includes the map items and choice | Task 5 (`structure.map`); Task 6 (asserted end to end) |
| Integration: whole new-shape practice debate: PASS, served answer, READY story with also-raised | Task 6 (case 1, including the storyteller's `also_raised` field) |
| Integration: a row-absent run identical to today | Task 6 (case 2: no shape key, ask as today, no MAP call, no `also_raised`, transcript keys as today); Task 8 (today's cases re-run). The runner's own byte identity is P2b's test |
| Whole-debate comparison: today's shape vs new shape, same 4 fixed questions, depth 1, all five AIs, two `--out` folders per question, within $5 DeepInfra + $1 Haiku a day, pass bar first | Task 1 (the four fixed ids); Task 7 (S-8 with the procedure, the money rules and the pass bar) |
| The owners' scoring method never in the repository | Task 7 (the README only says "results are judged by the owners' private method, outside this repository"; a test pins that sentence; no scoring code anywhere) |
| Spec §5 "a real practice debate with all AIs on the new shape before any preview upload" | Task 7 (S-8's pass bar, and the shape command in "The new debate shape") |
| One heavy test run at a time | Global Constraints; every run step names one file; integration runs alone |

**Placeholder scan:** none. Every code step holds the full code.

**Assumptions with a Task 0 gate:** P2b's readers' form, the marks' codes, the practice runner reading the row, and no map hash read from the register (Contract deviations 6 and 7).

**Type consistency:**
- `PracticeShapeOverride`, `PracticeShapeAsk`, `PracticeShapeBlock`, `PracticeShapeFacts`, `PracticeShapeSource` and `PracticeMapReaders` are defined in Task 1 or Task 4 and used with the same names in Tasks 2–6.
- `practiceMapStepOf` and `PRACTICE_MAP_STEPS` are defined in Task 3 and used in Task 4.
- `PRACTICE_SHAPE_SOURCE_REF` and `practiceShapeVersionRows` are defined and tested in Task 2.
- `stubMapContent` and the `GateRequestKind` `"MAP"` are defined in Task 6 and used only there.
