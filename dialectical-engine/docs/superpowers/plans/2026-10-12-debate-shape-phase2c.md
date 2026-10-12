# Debate Shape Phase 2c (what people see) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show people the new debate shape: the story mentions what was raised but not debated, the debate page lists it and titles every position "The case for …, argued by …", and the /new page's Depth mode, Depth of scrutiny and Answer length become real choices sent with the ask.

**Architecture:** Three independent strands that share one contract piece.
- **Story.** The story material gains an optional `also_raised` field. It is filled from the runner's in-memory map result, and it only ever uses the bytes the debate's own material leaves free under the story budget. The owner-editable pack (`story-shapes/common.md`, `checker.md`, `pack.json`) explains it, and the pack gets a new version.
- **Debate page.** A new contract shape, `DebateMapView` (`{ positions[{node_id, answer}], also_raised[] }`), comes from P2b's `readMapChoiceForRun`.
  - The owner reads it through a new route, `GET /v1/answers/{id}/map`.
  - Published snapshots carry a copy in `map_view`. That copy is checked by the publication content check.
  - The UI reads it beside the answer, the way it reads the floor. It renders an "Also raised, not debated" section, and it titles each opening position through a React context, in the question's language.
- **/new page.** After Project 1 and P2a land, the three controls are wired through `buildNewDebateAskConfig` and `createDebate` into `depth_params`. The legacy notice, the Max tokens slider and `lib/scrutinyDepth.ts` go away.
- **Locales.** All 35 locales get every new string through grouped Haiku translators and one Opus spot-check.

**Tech Stack:** TypeScript (strict), zod 4, Fastify (apps/api), Next.js/React 19 (apps/ui), vitest (jsdom render tests), node:test (apps/ui i18n catalog tests), pnpm.

**Spec:** `docs/superpowers/specs/2026-10-12-debate-shape-design.md`. The plan covers:
- rulings S2, S6, S7 and S8;
- §3.2, the three user controls and the /new page;
- §3.3 step 8: answer length, "also raised" and the debate page;
- §3.4 read model;
- §5 render tests.

Binding names come from `docs/superpowers/plans/2026-10-12-debate-shape-phase2-INTERFACE.md`, §2 and §5.

---

## Global Constraints

- **Where to work.** Work only in this worktree's engine folder. Every command below starts with `cd "$(git rev-parse --show-toplevel)/dialectical-engine"`. The git toplevel is the worktree; the engine is its `dialectical-engine/` folder. Never touch the main checkout. Never read `settings.env` or key files.
- **Order and gates.** Run the tasks in order. Each gate is a check command that must pass before the task's first edit. When a gate fails, stop and report BLOCKED with the command output; do not work around it.
  - **Project 1 gate** (Tasks 8–9): `grep -c 'id="concurrency"' apps/ui/app/new/NewDebatePageClient.tsx` prints `0`, and `grep -c "RETIRED_FORM_KEYS" apps/ui/lib/phoneCompletionDraft.ts` prints `1`. This means Project 1, branch `feat/2026-10-12-parallel-calls`, has been merged into this branch.
  - **P2a gate** (Tasks 8–9): `pnpm exec tsx -e 'import("@debateai/contract").then((m) => console.log(Object.keys(m.DepthParamsSchema.shape).join(",")))'` prints `depth,depthMode,scrutiny,answerLength`.
  - **P2b gate** (Task 3, and Task 5 step "wire main.ts"): `grep -rn "readMapChoiceForRun" packages apps --include='*.ts' | grep -v node_modules` shows P2b's reader definition.
- **Heavy commands.** Run one at a time on the owner's Mac (16 GB):
  - Before any `vitest run` or `tsc`, check `memory_pressure | tail -1`. Free memory must be at least 40%.
  - At most one other `vitest run` may be going (count runs, not processes): `ps -A -o command | grep -c 'vitest[ ]run'` prints `0` or `1`.
  - No two heavy commands in parallel. Never run the whole suite.
- **Running tests.** Unit and render tests run one file at a time: `pnpm exec vitest run <file>`. The apps/ui i18n tests run one file at a time: `cd apps/ui && node --import tsx --test lib/i18n/<file>.test.mjs`.
- **What people see.** User-facing text never shows scores, thresholds, P-numbers, citation markers, judge, checker or reviewer mechanics, internal ids, or how many AIs raised a point. Debate-page labels use the question's language (`storyCatalog` / `storyLocale`).
- **Wording.** Every new user-facing sentence ships with option 1 from "Wording picks"; the owner may swap in option 2 or 3 later.
- **Owner-editable prompt text.** `story-shapes/common.md` and `story-shapes/checker.md` are fingerprinted owner text. Any change bumps `story-shapes/pack.json` `version`, which makes it a new sealed version (Task 2).
- **Locales.** Every new string goes to all 35 locales in Task 10.
  - Between Task 7 (first new English key) and Task 10, the i18n parity tests (`public.test.mjs`, `catalog.test.mjs`) are expected to be red. Do not push before Task 10 is green.
- **Commits.** Commit messages end with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only the files the task names. Never commit an edit you did not make: owner sessions share worktrees.
- **Subagents.** Haiku runs with effort `xhigh` for mechanical jobs; Opus runs with effort `high` for hard ones. Every Opus subagent prompt says it may spawn its own haiku/opus subagents. Subagents run in the foreground.

## Review Focus

Five failure modes that could slip past ordinary tests. Each one has a named test in the task that owns it.

1. **Today's story prompt changes when there is no map.** An empty `also_raised` field, or a reordered field list, would change the bytes and the contract hash of every story on a run without the new shape. Test: Task 1, `keeps the material byte for byte when nothing was also raised`.
2. **The also-raised points push the debate's own material down the shrink ladder.** That would cut judge texts and claims to make room for points nobody argued. Test: Task 1, `never moves the ladder: also-raised points only use the bytes the debate leaves free`.
3. **New public text bypasses the publication content check.** `map_view.positions[].answer` and `map_view.also_raised[]` would be published without the hate-speech judge seeing them. Test: Task 4, the updated `hs-s02-check` R2 property ("28 checked paths, 33 excluded") and `checks the map view's public text with the arguments`.
4. **The three choices are dropped between the page and the wire.** `buildNewDebateAskConfig` could set them while `createDebate`, which builds `AskRequest` field by field, drops them, so the server never sees them. Test: Task 8, `puts depth mode, scrutiny and answer length into depth_params on the wire`.
5. **Position titles are wrong, leak, or vanish.** Possible ways:
   - a title in the interface's language instead of the question's;
   - a title for a node the published answer does not hold;
   - a title lost on the page's own refresh, when the map read fails.

   Tests: Task 5, `drops positions whose root node is not in the answer`; Task 7, `titles each position in the question's language` and `keeps the titles when a refresh cannot read the map`.

## Contract deviations

From `2026-10-12-debate-shape-phase2-INTERFACE.md`:

1. **Message keys namespace (§5).** The keys are `public.alsoRaised.title`, `public.alsoRaised.empty` and `public.positionTitle`, not `debate.*`.
   - No `debate` namespace exists. Adding one means a new namespace type, 35 loader entries, 35 files and a new parity test.
   - The `public` catalogue is already loaded in the question's language on both the owner and the public debate page (`storyCatalog`). That makes it the right home for labels that must use the question's language.
2. **Story material item keys (§5).** The interface names `alsoRaised: { claim, raisedBy }[]`. That name is kept for the TypeScript snapshot input (`StorySnapshotAlsoRaised`).
   - The model-facing JSON is `also_raised: [{ claim, raised_by }]`, snake case like every key the storyteller reads (`known_by`, `judge_spread`).
   - Because they hold underscores, `also_raised` and `raised_by` join `STORY_ENGINE_TOKENS` automatically, so the deterministic check refuses them in a story.
3. **"Bounded by the story budget" is defined as lowest priority.** The also-raised list never changes `compressionStep`.
   - The list fills only the bytes left after the debate's material fits at its ladder step: most-raised first, at most 12 items, each claim cut to `min(240, that step's claim cut)`.
   - With no room left, the field is not sent.
4. **What `readMapChoiceForRun` must return (P2b, §4).** The interface leaves the `core.map_choice` jsonb shape open. P2c needs, per run:
   - `answers[]` with `statement` and `rootNodeId`, the opening position (root node) that argued it, or null;
   - `alsoRaised[]` with `claim` and `makers`.

   P2c consumes this through one structural port, `MapChoiceReader` (`apps/api/src/map-views.ts`). If P2b's row differs, only that module and the one `main.ts` line change. Without `rootNodeId`, no position title can be shown.
5. **The read model is a new owner route plus a snapshot field.** These are `GET /v1/answers/{id}/map` → `DebateMapViewSchema` and an optional `PublicDebateSchema.map_view`. §3.3 says only "read model + adapter field".
   - The route mirrors `GET /v1/answers/{id}/disclosure`: the answer read is the ownership check, and "not yours", "no map" and "malformed" all return one closed 404.
6. **Position titles go through a React context** (`PositionTitlesContext`), not a field on `DebateNode`. Built with the question's catalogue, they reach the canvas and thread views without threading a catalogue through four views.
7. **Fixed is derived from the tier on the UI** (`fixedDepthAllowedFor(planTier)`: Free → no). With today's start values, only Free disallows it. The API's normalisation (P2a) remains the authority, and no server capability field is added.
8. **The UI config uses snake-case keys.** `buildNewDebateAskConfig` emits `depth_mode`, `scrutiny` and `answer_length`, matching its other keys. `createDebate` maps them into `depth_params.{depthMode, scrutiny, answerLength}` (§2).
9. **The waiting-room query (`AskRoomQuerySchema`) is not changed.** If P2a adds the fields to the room query, that is P2a's change.
10. **The phone hand-off draft stays `version: 1`.** It reads the two older shapes and upgrades them (Max tokens → Answer length `standard`; depth mode `manual`/`recommended` → `adaptive`), following Project 1's `RETIRED_FORM_KEYS` precedent.

## Wording picks

Option 1 of each item ships in code. The owner may pick 2 or 3; changing a pick means editing the English catalogue and re-running Task 10's merge for that key only.

**Debate page (`public` catalogue, the question's language)**

| Key | Option 1 (in code) | Option 2 | Option 3 |
|---|---|---|---|
| `public.alsoRaised.title` | Also raised, not debated | Also came up, not argued here | Other points raised, not debated |
| `public.alsoRaised.empty` | Every point that came up was debated. | Nothing that was raised was left out of the debate. | All the points raised were argued in the debate. |
| `public.positionTitle` | The case for {answer}, argued by {ai} | {ai} argues: {answer} | Arguing for {answer}: {ai} |

**/new page (`newDebate` catalogue, the interface's language)**

| Key | Option 1 (in code) | Option 2 | Option 3 |
|---|---|---|---|
| `newDebate.depthModeAdaptiveHelp` | Goes deeper only where a point could change the answer. | Digs further only into the points that matter for the answer. | Spends extra rounds only where the answer could still move. |
| `newDebate.depthModeFixedHelp` | Goes deeper under every point, whether or not it could change the answer. | Digs into every point to the same depth. | Gives every point the same number of rounds. |
| `newDebate.scrutinyStandardHelp` | The usual checks on every point. | Normal scrutiny for every point. | Every point gets the standard checks. |
| `newDebate.scrutinyDeepHelp` | Extra rounds on the points most in doubt. | A second look at the weakest and most disputed points. | More follow-up on points that are shaky or contested. |
| `newDebate.scrutinyExhaustiveHelp` | The most extra rounds, on more of the points in doubt. | Keeps testing doubtful points for longer, and more of them. | The deepest checks on the points still in doubt. |
| `newDebate.answerLength` | Answer length | Length of the answer | How long the answer is |
| `newDebate.answerLengthHint` | About 300, 700 or 1,500 words: a target, not a hard limit. | Roughly 300, 700 or 1,500 words; the answer may run a little shorter or longer. | How long the written answer should be: about 300, 700 or 1,500 words. |

Fixed by ruling S8, so there is no pick: `newDebate.answerLengthShort` "Short", `newDebate.answerLengthStandard` "Standard", `newDebate.answerLengthDetailed` "Detailed". The labels Fixed, Adaptive, Standard, Deep and Exhaustive already exist and are kept.

**Owner-editable story text (model-facing; the owner picks as for user text)**

`story-shapes/common.md`, new section "## Also raised, not debated":

1. *(in the pack)* When also_raised is present, end the section about the paths with one short paragraph on what else came up: name in plain words the points that matter most to the person, most-raised first, and say that the debate did not argue them, so it neither supports nor rejects them. You need not name them all. They are not findings: never present one as shown or refuted, never say who raised it or how many did, and leave node_refs empty for what rests only on them, because they have no reference. Keep them out of the headline, the summary, the confidence sentence and the path lines.
2. Points in also_raised came up but were not debated. Mention the ones that matter to the person in one short paragraph near the end of the long story, as questions still open rather than findings. They have no reference, so do not cite them in node_refs, and never say who raised them or how many did.
3. Close the section about the paths with what else came up: the points in also_raised that matter most to the person, said plainly as points the debate did not argue, with a word on how the person could weigh them. They are not findings, they carry no reference in node_refs, and the story never says who raised them or how many did.

`story-shapes/checker.md`, a sentence appended to the material description:

1. *(in the pack)* also_raised, when present, lists points that came up but were never debated, each with raised_by, how many models raised it; the story may mention them in plain words without citing a point, but never as findings, and never says who raised them or how many did.
2. also_raised holds points raised but not debated; a mention of one needs no citation, as long as the story does not treat it as tested or say who raised it.
3. Points in also_raised were never argued: the story may name them without node_refs, but presenting one as a finding, or saying who or how many raised it, is a fault.

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `packages/story/src/material.ts` | 1 | `also_raised` material field: types, ranking, budget fill, engine tokens and figures |
| `packages/story/src/index.ts` | 1 | exports `STORY_ALSO_RAISED_MAX`, `StoryMaterialAlsoRaised`, `StorySnapshotAlsoRaised` |
| `tests/unit/debate-shape-story-also-raised.test.ts` (new) | 1 | material and validate tests |
| `story-shapes/common.md`, `story-shapes/checker.md`, `story-shapes/pack.json` | 2 | owner text for the field; pack version bump |
| `tests/unit/story-pack.test.ts` | 2 | the pack explains `also_raised` / `raised_by` |
| `apps/runner/src/story-snapshot.ts` | 3 | `storyAlsoRaisedFrom(map)`; `alsoRaised` in `StorySnapshotSource` |
| `apps/runner/src/index.ts` | 3 | passes the map result's also-raised points to the snapshot |
| `tests/unit/debate-shape-story-snapshot.test.ts` (new) | 3 | snapshot wiring tests |
| `packages/contract/src/map-view.ts` (new) | 4 | `DebateMapViewSchema`, `DEBATE_MAP_VIEW_LIMITS` |
| `packages/contract/src/index.ts` | 4 | re-export; `PublicDebateSchema.map_view`; route + resource inventory |
| `packages/contract/src/client.ts` | 4 | `readAnswerMapView` |
| `apps/api/src/publication-check/material.ts` | 4 | checks `map_view` text as ARGUMENTS |
| `tests/unit/hs-s02-check.test.ts` | 4 | path table and counts |
| `tests/unit/debate-shape-map-view-contract.test.ts` (new) | 4 | contract tests |
| `apps/api/src/map-views.ts` (new) | 5 | `MapChoiceReader` port, `debateMapViewFrom`, `RepositoryAnswerMapViewApplication` |
| `apps/api/src/index.ts` | 5 | route `GET /v1/answers/{id}/map`, policy row, `mapViews` option |
| `apps/api/src/publications.ts` | 5 | `readPublishableMapView`, snapshot `map_view` |
| `apps/api/src/main.ts` | 5 | wiring with P2b's reader |
| `tests/unit/s7-authorization.test.ts` | 5 | policy row |
| `tests/unit/debate-shape-map-view-api.test.ts` (new) | 5 | API tests |
| `apps/ui/lib/v3/mapView.ts` (new) | 6 | `readAnswerMapView`, `positionTitlesFrom`, `PositionTitlesContext` |
| `apps/ui/lib/api.ts`, `apps/ui/lib/serverApi.ts` | 6 | read the map view beside the answer |
| `tests/unit/debate-shape-map-view-ui.test.ts` (new) | 6 | UI data tests |
| `apps/ui/components/AlsoRaisedList.tsx`, `apps/ui/components/PositionTitle.tsx` (new) | 7 | the section and the title |
| `apps/ui/components/DebateCanvas.tsx`, `apps/ui/components/DebateThread.tsx` | 7 | render `<PositionTitle>` |
| `apps/ui/app/debate/[id]/DebatePageClient.tsx`, `DebatePageGate.tsx`, `page.tsx` | 7 | map view state, provider, owner section |
| `apps/ui/components/PublicDebateOverview.tsx`, `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx` | 7 | public section and titles |
| `apps/ui/messages/en/public.json`, `apps/ui/lib/i18n/public.test.mjs`, `apps/ui/app/globals.css` | 7 | English keys, source list, styles |
| `tests/render/debate-shape-also-raised.test.tsx` (new) | 7 | render tests |
| `apps/ui/app/new/NewDebatePageClient.tsx`, `apps/ui/app/new/defaults.tsx`, `apps/ui/lib/api.ts` | 8 | real controls, ask config, wire |
| `apps/ui/lib/scrutinyDepth.ts` (deleted), `apps/ui/lib/i18n/compose.test.mjs`, `apps/ui/lib/i18n/catalog.test.mjs` | 8 | dead code and its guards |
| `apps/ui/messages/en/newDebate.json`, `apps/ui/messages/en/compose.json`, `apps/ui/app/globals.css` | 8 | English keys; retired keys; notice style |
| `tests/render/tier01-new-plan-tier.test.tsx`, `tests/render/debate-shape-new-controls.test.tsx` (new), `tests/unit/debate-shape-new-ask-wire.test.ts` (new) | 8 | tests |
| `apps/ui/lib/phoneCompletionDraft.ts`, `tests/unit/phone-completion-draft-legacy.test.ts` | 9 | draft shape and legacy upgrade |
| `apps/ui/messages/<34 locales>/{newDebate,public,compose}.json` | 10 | translations and removals |

---

## Task 1: Story material carries "also raised, not debated"

**Files:**
- Modify: `packages/story/src/material.ts`
- Modify: `packages/story/src/index.ts`
- Test: `tests/unit/debate-shape-story-also-raised.test.ts` (new)

**Interfaces:**
- `StoryRunSnapshot.alsoRaised?: readonly StorySnapshotAlsoRaised[]`, where `StorySnapshotAlsoRaised = { claim: string; raisedBy: number }`. This is the INTERFACE §5 name.
- `StoryMaterial.alsoRaised?: readonly StoryMaterialAlsoRaised[]`, where `StoryMaterialAlsoRaised = { claim: string; raised_by: number }`.
- Fenced field `also_raised`, sent only when non-empty.
- `STORY_ALSO_RAISED_MAX = 12`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/debate-shape-story-also-raised.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { StoryBody, StoryVerdictBasis } from "@debateai/contract";
import {
  STORY_ALSO_RAISED_MAX,
  STORY_ENGINE_TOKENS,
  buildStoryMaterial,
  classifyStoryContent,
  toCheckerPromptMaterial,
  toStoryPromptMaterial,
  type StoryMaterialAlsoRaised,
  type StoryMaterialResult,
  type StoryRunSnapshot,
  type StorySnapshotAlsoRaised,
  type StorySnapshotNode
} from "@debateai/story";

/**
 * Debate shape P2c (spec 2026-10-12 §3.3 step 8): the map's points that were raised but not debated
 * reach the storyteller as `also_raised`, in whatever the story budget leaves once the debate fits.
 */

const SHAPES: ReadonlySet<string> = new Set(["general"]);
const LOW_BUDGET = 40_000;
const CORE_FIELDS = ["question", "verdict", "served_statement", "positions", "points", "hinges", "set_aside", "omitted"];
/** The claim cut of each ladder step (material.ts STORY_SHRINK_LADDER); null cuts nothing. */
const STEP_CLAIM_CHARS: readonly (number | null)[] = [null, null, null, 480, 240, 120, 120, 120];

const BASIS: StoryVerdictBasis = {
  label: "CONTESTED",
  rung: 4,
  trigger: "MID_BAND",
  winner_node_id: "position:a",
  winner_strength: 0.612345,
  runner_up_node_id: "position:b",
  runner_up_strength: 0.4,
  margin: 0.212345,
  disagreement: 0.08,
  thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 },
  confidence_band: "MEDIUM",
  marks: []
};

function node(overrides: Partial<StorySnapshotNode> & { readonly nodeId: string }): StorySnapshotNode {
  return {
    claim: `The claim of ${overrides.nodeId}.`,
    isPosition: false,
    wayOfKnowing: "REASONING",
    baseScore: 0.5,
    finalStrength: 0.45,
    excludedReason: null,
    authorModel: "model:alpha",
    panelDispersion: 0.1,
    criticSummary: null,
    ...overrides
  };
}

function snapshot(overrides: Partial<StoryRunSnapshot> = {}): StoryRunSnapshot {
  return {
    runId: "run:shape",
    workItemId: "work:shape",
    answerId: "answer:shape",
    answerVersion: 1,
    questionLine: "Should the city fund the tram extension?",
    argumentLanguage: { tag: "en", name: "English" },
    compositionBudgetTier: "low",
    verdictBasis: BASIS,
    servedStatement: ["The debate leans towards funding the extension."],
    nodes: [
      node({ nodeId: "position:a", isPosition: true, claim: "The city should fund it.", finalStrength: 0.612345 }),
      node({ nodeId: "position:b", isPosition: true, claim: "The city should not fund it.", finalStrength: 0.4, authorModel: "model:beta" }),
      node({ nodeId: "point:c", claim: "Fares cover running costs by year nine." }),
      node({ nodeId: "point:d", claim: "Construction overruns are common." })
    ],
    arrows: [
      { sourceNodeId: "point:c", targetNodeId: "position:a", polarity: "support" },
      { sourceNodeId: "point:d", targetNodeId: "position:a", polarity: "attack" }
    ],
    sensitivity: [{ removedNodeId: "point:c", leverage: 0.3 }, { removedNodeId: "point:d", leverage: 0.2 }],
    setAside: [],
    ...overrides
  };
}

const ALSO_RAISED: readonly StorySnapshotAlsoRaised[] = [
  { claim: "The tram would change property prices along the line.", raisedBy: 1 },
  { claim: "Bus routes could be cut once the tram runs.", raisedBy: 3 },
  { claim: "Construction would close the main bridge for a year.", raisedBy: 3 },
  { claim: "Cycle lanes are a cheaper alternative.", raisedBy: 2 }
];

type Built = Extract<StoryMaterialResult, { kind: "OK" }>;

function built(result: StoryMaterialResult): Built {
  if (result.kind !== "OK") throw new Error(`expected the material to fit, got ${result.kind}`);
  return result;
}

function build(overrides: Partial<StoryRunSnapshot>, budgetBytes = LOW_BUDGET): StoryMaterialResult {
  return buildStoryMaterial({ snapshot: snapshot(overrides), enrichment: new Map(), budgetBytes, shapeIds: SHAPES });
}

function fieldOf(result: Built, name: string): unknown {
  const found = toStoryPromptMaterial(result.material, null).find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`no ${name} field`);
  return JSON.parse(found.content) as unknown;
}

function text(seed: string, length: number): string {
  const base = `${seed} argues that the proposal changes the outcome for the people it affects most, because `;
  return base.repeat(Math.ceil(length / base.length)).slice(0, length);
}

/** A well-formed story covering both positions; its long paragraphs cite nothing. */
function story(): StoryBody {
  return {
    shape_id: "general",
    short: {
      headline: "The debate leans one way.",
      summary: "Our reading of your question.",
      confidence: "Fairly sure, if the count holds.",
      paths: ["P1", "P2"].map((ref) => ({ position_ref: ref, fate: "PARTLY_HELD" as const, line: "This position partly held.", node_refs: [ref] })),
      change: { text: "A count would change it.", node_refs: [] }
    },
    why: { reasons: [{ text: "One reason decided it.", node_refs: [] }] },
    long: {
      sections: [1, 2, 3].map((index) => ({ title: `Section ${String(index)}`, paragraphs: [{ text: "A paragraph.", node_refs: [] }] }))
    },
    reviewer_note: null
  };
}

describe("debate shape P2c — also raised, not debated, in the story material", () => {
  it("keeps the material byte for byte when nothing was also raised", () => {
    const plain = built(build({}));
    const empty = built(build({ alsoRaised: [] }));
    expect(empty).toEqual(plain);
    expect("alsoRaised" in empty.material).toBe(false);
    expect(toStoryPromptMaterial(empty.material, null).map((entry) => entry.name)).toEqual(CORE_FIELDS);
    expect(JSON.stringify(toStoryPromptMaterial(empty.material, null)))
      .toBe(JSON.stringify(toStoryPromptMaterial(plain.material, null)));
  });

  it("sends also_raised after omitted, most-raised first, with only a claim and how many raised it", () => {
    const result = built(build({ alsoRaised: ALSO_RAISED }));
    expect(toStoryPromptMaterial(result.material, null).map((entry) => entry.name)).toEqual([...CORE_FIELDS, "also_raised"]);
    expect(fieldOf(result, "also_raised") as StoryMaterialAlsoRaised[]).toEqual([
      { claim: "Bus routes could be cut once the tram runs.", raised_by: 3 },
      { claim: "Construction would close the main bridge for a year.", raised_by: 3 },
      { claim: "Cycle lanes are a cheaper alternative.", raised_by: 2 },
      { claim: "The tram would change property prices along the line.", raised_by: 1 }
    ]);
    // The checker reads the same material.
    const checker = toCheckerPromptMaterial(result.material, story()).map((entry) => entry.name);
    expect(checker).toContain("also_raised");
    expect(checker.indexOf("also_raised")).toBeLessThan(checker.indexOf("candidate_story"));
  });

  it(`keeps at most ${String(STORY_ALSO_RAISED_MAX)} points, drops blank claims and counts a bad count as one`, () => {
    expect(STORY_ALSO_RAISED_MAX).toBe(12);
    const many = Array.from({ length: 20 }, (_, index) => ({ claim: `Point number ${String(index)}.`, raisedBy: 1 }));
    const result = built(build({ alsoRaised: [{ claim: "   ", raisedBy: 5 }, { claim: "Odd count.", raisedBy: Number.NaN }, ...many] }));
    const items = fieldOf(result, "also_raised") as StoryMaterialAlsoRaised[];
    expect(items).toHaveLength(12);
    expect(items.every((item) => item.claim.trim() !== "" && item.raised_by >= 1)).toBe(true);
    expect(items[0]).toEqual({ claim: "Odd count.", raised_by: 1 });
  });

  it("never moves the ladder: also-raised points only use the bytes the debate leaves free", () => {
    const plain = built(build({}, 10_000_000));
    expect(plain.compressionStep).toBe(0);
    // Exactly the debate's own size: no room, so no field, and still step 0.
    const tight = built(build({ alsoRaised: ALSO_RAISED }, plain.material.bytes));
    expect(tight.compressionStep).toBe(0);
    expect("alsoRaised" in tight.material).toBe(false);
    expect(tight.material.bytes).toBe(plain.material.bytes);
    // 100 spare bytes: room for the most-raised point only (71 bytes of JSON), never for the second.
    const roomy = built(build({ alsoRaised: ALSO_RAISED }, plain.material.bytes + 100));
    expect(roomy.compressionStep).toBe(0);
    expect(roomy.material.alsoRaised).toEqual([{ claim: "Bus routes could be cut once the tram runs.", raised_by: 3 }]);
    expect(roomy.material.bytes).toBeLessThanOrEqual(plain.material.bytes + 100);
  });

  it("cuts each also-raised claim to 240 characters, or to the ladder step's shorter claim cut", () => {
    const longNodes = snapshot().nodes.map((entry) => ({ ...entry, claim: text(entry.nodeId, 600) }));
    const longRaised = Array.from({ length: 12 }, (_, index) => ({ claim: text(`raised ${String(index)}`, 300), raisedBy: 1 }));
    const seenSteps = new Set<number>();
    let budget = 10_000_000;
    for (let guard = 0; guard < 400; guard += 1) {
      const result = build({ nodes: longNodes, alsoRaised: longRaised }, budget);
      if (result.kind !== "OK") break;
      seenSteps.add(result.compressionStep);
      const limit = Math.min(240, STEP_CLAIM_CHARS[result.compressionStep] ?? 240);
      for (const item of result.material.alsoRaised ?? []) {
        expect(Array.from(item.claim).length).toBeLessThanOrEqual(limit);
      }
      expect(result.material.bytes).toBeLessThanOrEqual(budget);
      budget = result.material.bytes - 1;
    }
    expect(seenSteps.has(0)).toBe(true);
    expect(seenSteps.has(5)).toBe(true);
  });

  it("refuses the field's own keys in a story, as every underscore key of the material", () => {
    expect(STORY_ENGINE_TOKENS).toContain("also_raised");
    expect(STORY_ENGINE_TOKENS).toContain("raised_by");
    const result = built(build({ alsoRaised: ALSO_RAISED }));
    const body = story();
    body.long.sections[2]!.paragraphs[0]!.text = "Two models gave it a raised_by of three.";
    const refused = classifyStoryContent(JSON.stringify(body), result.index);
    expect(refused.parseStatus).toBe("SCHEMA_FAILED");
    expect(refused.parseError).toContain("STORY_TEXT_ENGINE_TOKEN");
  });

  it("lets a story name an also-raised point in plain words, citing nothing", () => {
    const result = built(build({ alsoRaised: ALSO_RAISED }));
    const body = story();
    body.long.sections[2]!.paragraphs.push({
      text: "Other points came up but were not debated, such as whether bus routes could be cut once the tram runs.",
      node_refs: []
    });
    expect(classifyStoryContent(JSON.stringify(body), result.index)).toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("treats an also-raised claim's figures and words as the person's side, like any claim", () => {
    // The high cut is 0.7, so 0,70 is a score text, until a raised point itself states 0,70 lei.
    const body = story();
    body.short.summary = "Night power costs 0,70 lei per kWh, which matters here.";
    const without = built(build({}));
    expect(classifyStoryContent(JSON.stringify(body), without.index).parseError).toContain("STORY_TEXT_SCORE_VALUE");
    const priced = built(build({ alsoRaised: [{ claim: "Night power costs 0,70 lei per kWh at the depot.", raisedBy: 1 }] }));
    expect(classifyStoryContent(JSON.stringify(body), priced.index)).toEqual({ parseStatus: "PARSED", parseError: null });
    // A raised point that says "Open RAN" frees RAN for the story, as a claim would.
    const ran = built(build({ alsoRaised: [{ claim: "The depot could move to Open RAN radios.", raisedBy: 2 }] }));
    expect(ran.index.engineTokens.has("RAN")).toBe(false);
    expect(without.index.engineTokens.has("RAN")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-story-also-raised.test.ts`
Expected: FAIL. `STORY_ALSO_RAISED_MAX` is not exported (undefined), and the also_raised field is missing.

- [ ] **Step 3: Implement in `packages/story/src/material.ts`**

3a. After the `StorySnapshotArrow` interface, add:

```ts
/**
 * Debate shape P2c (spec 2026-10-12 §3.3 step 8): one map point that was raised but not
 * debated. `raisedBy` is how many different makers raised it. The claim is model text:
 * evidence, like every claim.
 */
export interface StorySnapshotAlsoRaised {
  readonly claim: string;
  readonly raisedBy: number;
}
```

3b. In `StoryRunSnapshot`, after `readonly setAside: …;`, add:

```ts
  /**
   * Debate shape P2c: the map's points that were raised but not debated, most-raised
   * first. Absent on every run without the new shape, whose material stays byte for byte
   * what it was.
   */
  readonly alsoRaised?: readonly StorySnapshotAlsoRaised[];
```

3c. After the `StoryMaterialOmitted` interface, add:

```ts
/** Debate shape P2c: a raised-but-not-debated point as the models read it. It has no reference. */
export interface StoryMaterialAlsoRaised {
  readonly claim: string;
  readonly raised_by: number;
}
```

3d. In `StoryMaterial`, after `readonly omitted: readonly StoryMaterialOmitted[];`, add:

```ts
  /** Debate shape P2c: present only when at least one also-raised point fitted the budget. */
  readonly alsoRaised?: readonly StoryMaterialAlsoRaised[];
```

3e. Replace the block from `const STORY_SET_ASIDE_KEYS` through the end of `STORY_MATERIAL_KEYS` with:

```ts
const STORY_SET_ASIDE_KEYS: StoryKeyList<StoryMaterial["setAside"][number]> = { id: true, reason: true };
const STORY_ALSO_RAISED_KEYS: StoryKeyList<StoryMaterialAlsoRaised> = { claim: true, raised_by: true };
/** The fenced field names (`storyCoreFields`, plus the second draft's `prior_objection`). */
const STORY_MATERIAL_FIELD_NAMES = Object.freeze([
  "question", "verdict", "served_statement", "positions", "points", "hinges", "set_aside", "omitted", "also_raised",
  "prior_objection"
]);

/** Every key and field name of the material, each once. */
export const STORY_MATERIAL_KEYS: readonly string[] = Object.freeze([...new Set([
  ...Object.keys(STORY_POINT_KEYS), ...Object.keys(STORY_POSITION_KEYS), ...Object.keys(STORY_VERDICT_KEYS),
  ...Object.keys(STORY_THRESHOLD_KEYS), ...Object.keys(STORY_OMITTED_KEYS), ...Object.keys(STORY_SET_ASIDE_KEYS),
  ...Object.keys(STORY_ALSO_RAISED_KEYS), ...STORY_MATERIAL_FIELD_NAMES
])]);
```

3f. After `const STORY_KEPT_LEVERAGE = 20;`, add:

```ts
/** Debate shape P2c: at most this many also-raised points reach the material, most-raised first. */
export const STORY_ALSO_RAISED_MAX = 12;
/** An also-raised claim is cut to this many characters, or to the ladder step's claim cut when that is shorter. */
const STORY_ALSO_RAISED_CLAIM_CHARS = 240;
```

3g. In `storyEngineTokens`, replace the `own` array with:

```ts
  const own = [
    material.question,
    ...material.positions.map((position) => position.claim),
    ...material.points.map((point) => point.claim),
    // Debate shape P2c: a raised point is the person's side of the debate, as a claim is.
    ...(material.alsoRaised ?? []).map((item) => item.claim)
  ].join("\n");
```

3h. In `storyScoreTexts`, replace the `storyStatedFigures([...])` argument with:

```ts
  const stated = storyStatedFigures([
    material.question,
    ...material.positions.map((position) => position.claim),
    ...material.points.flatMap((point) => [
      point.claim, point.best_case ?? "", point.objection ?? "", ...(point.review_reasons ?? [])
    ]),
    ...(material.alsoRaised ?? []).map((item) => item.claim)
  ]);
```

3i. Replace `storyCoreFields` with:

```ts
function storyCoreFields(core: StoryMaterialCore): FramedMaterialField[] {
  return [
    { name: "question", content: JSON.stringify(core.question) },
    { name: "verdict", content: JSON.stringify(core.verdict) },
    { name: "served_statement", content: JSON.stringify(core.servedStatement) },
    { name: "positions", content: JSON.stringify(core.positions) },
    { name: "points", content: JSON.stringify(core.points) },
    { name: "hinges", content: JSON.stringify(core.hinges) },
    { name: "set_aside", content: JSON.stringify(core.setAside) },
    { name: "omitted", content: JSON.stringify(core.omitted) },
    // Debate shape P2c: only when there is something to send, so a run without the new
    // shape keeps today's fields byte for byte.
    ...(core.alsoRaised === undefined || core.alsoRaised.length === 0
      ? []
      : [{ name: "also_raised", content: JSON.stringify(core.alsoRaised) }])
  ];
}
```

3j. After `storyFieldBytes`, add:

```ts
/** Debate shape P2c: non-blank points, most-raised first (ties keep the map's order), at most STORY_ALSO_RAISED_MAX. */
function storyAlsoRaisedRanked(items: readonly StorySnapshotAlsoRaised[]): readonly StorySnapshotAlsoRaised[] {
  return items
    .map((item, order) => ({
      item: { claim: item.claim.trim(), raisedBy: Number.isFinite(item.raisedBy) ? Math.max(1, Math.trunc(item.raisedBy)) : 1 },
      order
    }))
    .filter(({ item }) => item.claim !== "")
    .sort((left, right) => right.item.raisedBy - left.item.raisedBy || left.order - right.order)
    .slice(0, STORY_ALSO_RAISED_MAX)
    .map(({ item }) => item);
}

/**
 * Debate shape P2c: the also-raised points ride in whatever the budget leaves once the
 * debate's own material fits. They never push the debate down the ladder. The most-raised
 * points that still fit are kept and the rest are left out; with no room at all, the field
 * is not sent.
 */
function storyWithAlsoRaised(
  material: StoryMaterial,
  ranked: readonly StorySnapshotAlsoRaised[],
  claimChars: number | null,
  budgetBytes: number
): StoryMaterial {
  if (ranked.length === 0) return material;
  const limit = claimChars === null ? STORY_ALSO_RAISED_CLAIM_CHARS : Math.min(claimChars, STORY_ALSO_RAISED_CLAIM_CHARS);
  const items = ranked.map((item): StoryMaterialAlsoRaised => Object.freeze({
    claim: storyClip(item.claim, limit),
    raised_by: item.raisedBy
  }));
  for (let count = items.length; count > 0; count -= 1) {
    const kept = Object.freeze(items.slice(0, count));
    const bytes = material.bytes + Buffer.byteLength(JSON.stringify(kept), "utf8");
    if (bytes <= budgetBytes) return Object.freeze({ ...material, alsoRaised: kept, bytes });
  }
  return material;
}
```

3k. In `buildStoryMaterial`, replace the final ladder loop (from `let lastBytes = 0;` to the closing `return Object.freeze({ kind: "TOO_LARGE", … });`) with:

```ts
  const alsoRaised = storyAlsoRaisedRanked(snapshot.alsoRaised ?? []);
  let lastBytes = 0;
  for (const [step, shrink] of STORY_SHRINK_LADDER.entries()) {
    const fitted = materialAt(shrink);
    if (fitted.material.bytes <= budgetBytes) {
      const material = storyWithAlsoRaised(fitted.material, alsoRaised, shrink.claimChars, budgetBytes);
      const visible = fitted.visible;
      return Object.freeze({
        kind: "OK",
        material,
        index: Object.freeze({
          nodeIds: new Set([...visible].map(ref)),
          positionIds: new Set(positionOrder),
          positionOrder,
          shapeIds: input.shapeIds,
          // The site shows at most this many path lines (spec §5.3); one cap, shared with the schema.
          pathCap: STORY_BODY_LIMITS.maxPaths,
          scoreTexts: storyScoreTexts(material),
          engineTokens: storyEngineTokens(material)
        }),
        refMap,
        compressionStep: step
      });
    }
    lastBytes = fitted.material.bytes;
  }
  return Object.freeze({ kind: "TOO_LARGE", bytes: lastBytes, budgetBytes });
```

- [ ] **Step 4: Export the new names from `packages/story/src/index.ts`**

In the `./material.js` export block, add `STORY_ALSO_RAISED_MAX,` after `STORY_ENGINE_TOKENS,`. Add `type StoryMaterialAlsoRaised,` after `type StoryMaterial,`, and `type StorySnapshotAlsoRaised,` after `type StorySnapshotArrow,`.

- [ ] **Step 5: Run the new test and the existing material tests**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-story-also-raised.test.ts`
Expected: PASS (8 tests).
Then run: `pnpm exec vitest run tests/unit/story-material.test.ts`
Expected: PASS, unchanged. A run without `alsoRaised` is identical.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add packages/story/src/material.ts packages/story/src/index.ts tests/unit/debate-shape-story-also-raised.test.ts
git commit -m "$(cat <<'EOF'
Story material: also raised, not debated (debate shape P2c)

The map's unchosen points reach the storyteller as also_raised, most-raised
first, in the bytes the debate leaves free under the story budget; they never
move the shrink ladder, and a run without them is byte for byte unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: The story pack explains `also_raised` (owner text, new pack version)

**Files:**
- Modify: `story-shapes/common.md`
- Modify: `story-shapes/checker.md`
- Modify: `story-shapes/pack.json`
- Test: `tests/unit/story-pack.test.ts`

**Interfaces:** None in code. The pack fingerprint changes, and every story row records it. Bumping the `version` makes the change a new sealed pack version.

- [ ] **Step 1: Make the pack test require the new field**

In `tests/unit/story-pack.test.ts`, in the test `explains to the storyteller every material field it reads and every story field it writes`, make two changes.

Add `alsoRaised` to the snapshot. Replace `arrows: [], sensitivity: [], setAside: []` with:

```ts
        arrows: [], sensitivity: [], setAside: [],
        alsoRaised: [{ claim: "Ask the school about a mid-year move.", raisedBy: 2 }]
```

Add `"raised_by"` to the list of names. Replace `...StoryFateSchema.options, "high_cut", "low_cut", "confidence_band"` with:

```ts
      ...StoryFateSchema.options, "high_cut", "low_cut", "confidence_band", "raised_by"
```

Then add one more test after `tells the checker every criterion its verdict carries`:

```ts
  it("tells the checker about the points raised but not debated (debate shape P2c)", () => {
    expect(pack.checker).toContain("also_raised");
    expect(pack.checker).toContain("raised_by");
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/story-pack.test.ts`
Expected: FAIL on `["also_raised", false]` and `["raised_by", false]`, and on the checker test.

- [ ] **Step 3: Edit `story-shapes/common.md`**

3a. In "## What the material holds", after the line that begins `- omitted: in a very large debate,`, insert:

```markdown
- also_raised: present only when points came up that the debate did not argue: each with its claim and raised_by, how many of the AI models raised it, most-raised first. They have no reference and were never weighed or checked; see "Also raised, not debated".
```

3b. After the whole "## The paths" section, before "## The short version", insert the owner's option 1:

```markdown
## Also raised, not debated

When also_raised is present, end the section about the paths with one short paragraph on what else came up: name in plain words the points that matter most to the person, most-raised first, and say that the debate did not argue them, so it neither supports nor rejects them. You need not name them all. They are not findings: never present one as shown or refuted, never say who raised it or how many did, and leave node_refs empty for what rests only on them, because they have no reference. Keep them out of the headline, the summary, the confidence sentence and the path lines.
```

- [ ] **Step 4: Edit `story-shapes/checker.md`**

In the second paragraph, the one that begins `The material is described to the storyteller like this.`, append this sentence after `…which the story may mention but must not describe.`:

```markdown
 also_raised, when present, lists points that came up but were never debated, each with raised_by, how many models raised it; the story may mention them in plain words without citing a point, but never as findings, and never says who raised them or how many did.
```

Keep it on the same line, with one space before `also_raised`.

- [ ] **Step 5: Bump the pack version**

In `story-shapes/pack.json`, change `"version": "2026-09-27.1"` to `"version": "2026-10-12.1"`.

- [ ] **Step 6: Run the pack tests**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/story-pack.test.ts`
Expected: PASS. This includes the owners' rules and the size limits (the instruction limit is 48 KB; common.md grows by about 1 KB from 17 KB).
Then run: `pnpm exec vitest run tests/unit/prompt-text-pins.test.ts`
Expected: PASS. The pack is fingerprinted, not pinned.

- [ ] **Step 7: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add story-shapes/common.md story-shapes/checker.md story-shapes/pack.json tests/unit/story-pack.test.ts
git commit -m "$(cat <<'EOF'
Story pack 2026-10-12.1: also raised, not debated (debate shape P2c)

The storyteller is told what also_raised holds and how to mention it (plain
words, no reference, never a finding, never who or how many raised it); the
checker is told such a mention needs no citation. Owner wording option 1.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: The runner hands the map's also-raised points to the story

**Gate:** the P2b gate in Global Constraints. P2b's map stage must exist in `apps/runner/src/index.ts`. Find the variable that holds its `MapResult` from `@debateai/map` in the scope of the story hook (`input: buildStoryRunSnapshot({`, about line 8545):

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
grep -n "MapResult\|runMapStage\|mapResult\|debateShapeMap" apps/runner/src/index.ts | head -20
```

The code below calls that variable `debateShapeMap` (type `MapResult | null`, null when the shape row is absent or the map was unavailable). If P2b named it differently, use P2b's name in Step 4; nothing else changes.

**Files:**
- Modify: `apps/runner/src/story-snapshot.ts`
- Modify: `apps/runner/src/index.ts`
- Test: `tests/unit/debate-shape-story-snapshot.test.ts` (new)

**Interfaces:**
- `storyAlsoRaisedFrom(map: StoryMapSource | null): readonly { claim: string; raisedBy: number }[] | undefined`. It returns `undefined` when there is no map choice, so the snapshot has no `alsoRaised` key and today's material is unchanged.
- `StorySnapshotSource.alsoRaised?` is optional.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/debate-shape-story-snapshot.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ProviderGateway } from "@debateai/providers";
import type { StoryCostFallback, StoryStepLease } from "@debateai/story";
import {
  buildStoryRunSnapshot, storyAlsoRaisedFrom, type StorySnapshotSource
} from "../../apps/runner/src/story-snapshot.js";

/** Debate shape P2c: the map's unchosen points reach the story snapshot; no map, no key. */

const ROOT = "11111111-1111-4111-8111-111111111111";
const provider: ProviderGateway = { call: async () => { throw new Error("unused"); } };
const stepLease: StoryStepLease = (use) => use();
const costFallback: StoryCostFallback = async ({ planned, request, call }) => ({
  result: await call(planned, request), servedBy: planned
});
const UUID_SHAPED = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

function source(overrides: Partial<StorySnapshotSource> = {}): StorySnapshotSource {
  return {
    runId: "run-1", workItemId: "work-1", answerId: "answer-1", answerVersion: 1, questionLine: "Should we?",
    argumentLanguage: { tag: "en", name: "English" }, compositionBudgetTier: "low",
    verdict: { label: "SUPPORTED", rung: 3, trigger: "AT_OR_ABOVE_HIGH_CUT" },
    servedRootNodeId: ROOT, servedStrength: 0.8, runnerUp: null,
    margin: { kind: "ABSENT", reason: "ONE_POSITION" }, disagreement: { kind: "MEASURED", value: 0.05 },
    thresholds: { gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 },
    confidenceBand: "FULL", answerMarks: [], servedSegments: [{ text: "Yes." }],
    authored: [{
      nodeId: ROOT, statement: "Yes.", provenanceRef: "artifact-root", wayOfKnowing: "REASONING",
      reversalPoint: "Unless not.", maker: "maker-a", panelDispersion: 0.05
    }],
    positionNodeIds: new Set([ROOT]),
    baseStrengths: [{ nodeId: ROOT, baseStrength: 0.8 }],
    finalStrengths: [{ nodeId: ROOT, strength: 0.8 }],
    arrows: [], arrowOrder: [], sensitivity: [], conditionMarkRecords: [],
    resolveProvider: () => ({ provider, providerRef: "provider:a" }),
    stepLease,
    costFallback,
    ...overrides
  };
}

const MAP = {
  keyPoints: [
    { keyPointId: "kp01", claim: "Chosen point.", makers: ["A", "B"] },
    { keyPointId: "kp02", claim: "Raised by three makers.", makers: ["A", "B", "C"] },
    { keyPointId: "kp03", claim: `A point quoting ${ROOT} by id.`, makers: ["C", "C"] }
  ],
  choice: { alsoRaised: ["kp02", "kp03", "kp99"] }
} as const;

describe("debate shape P2c — the story snapshot's also-raised points", () => {
  it("reads the choice's also-raised ids in order, with distinct makers, skipping unknown ids", () => {
    const items = storyAlsoRaisedFrom(MAP);
    expect(items?.map((item) => item.raisedBy)).toEqual([3, 1]);
    expect(items?.[0]?.claim).toBe("Raised by three makers.");
    // Node ids never reach the material (the snapshot's own rule for free text).
    expect(items?.[1]?.claim).not.toMatch(UUID_SHAPED);
  });

  it("has nothing to say without a map or without a choice", () => {
    expect(storyAlsoRaisedFrom(null)).toBeUndefined();
    expect(storyAlsoRaisedFrom({ keyPoints: MAP.keyPoints, choice: null })).toBeUndefined();
  });

  it("passes the points to the snapshot, and leaves the key out when there are none", () => {
    expect(buildStoryRunSnapshot(source({ alsoRaised: storyAlsoRaisedFrom(MAP) })).alsoRaised)
      .toEqual([{ claim: "Raised by three makers.", raisedBy: 3 }, { claim: "A point quoting (a point) by id.", raisedBy: 1 }]);
    expect("alsoRaised" in buildStoryRunSnapshot(source())).toBe(false);
    expect("alsoRaised" in buildStoryRunSnapshot(source({ alsoRaised: undefined }))).toBe(false);
  });

  it("is wired at the runner's one story snapshot", () => {
    const runner = readFileSync("apps/runner/src/index.ts", "utf8");
    const start = runner.indexOf("input: buildStoryRunSnapshot({");
    expect(start).toBeGreaterThan(0);
    // The call's own arguments: up to the next statement the hook makes after building the snapshot.
    const call = runner.slice(start, start + 8_000);
    expect(call).toContain("positionNodeIds: makerPositionNodeIds,");
    expect(call).toContain("alsoRaised: storyAlsoRaisedFrom(");
    expect(call.indexOf("alsoRaised: storyAlsoRaisedFrom(")).toBeGreaterThan(call.indexOf("positionNodeIds: makerPositionNodeIds,"));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-story-snapshot.test.ts`
Expected: FAIL. `storyAlsoRaisedFrom` is not a function.

- [ ] **Step 3: Implement in `apps/runner/src/story-snapshot.ts`**

3a. In `StorySnapshotSource`, after `readonly roleMakers?: StoryRunRoleMakers | undefined;`, add:

```ts
  /**
   * Debate shape P2c (spec 2026-10-12 §3.3 step 8): the map's points that were raised but
   * not debated (`storyAlsoRaisedFrom`). Undefined when the run had no map choice, so the
   * story's material stays exactly today's.
   */
  readonly alsoRaised?: readonly { readonly claim: string; readonly raisedBy: number }[] | undefined;
```

3b. Before `export function buildStoryRunSnapshot`, add:

```ts
/** The members of P2b's `MapResult` (@debateai/map) this module reads; structural, so the runner keeps one import. */
export type StoryMapSource = Readonly<{
  keyPoints: readonly Readonly<{ keyPointId: string; claim: string; makers: readonly string[] }>[];
  choice: Readonly<{ alsoRaised: readonly string[] }> | null;
}>;

/**
 * Debate shape P2c: the map choice's "also raised, not debated" points, in the choice's
 * order (most-raised first), each with how many different makers raised it. A claim is
 * cleared of node ids like every free text here. No map, or a map that chose nothing:
 * undefined.
 */
export function storyAlsoRaisedFrom(
  map: StoryMapSource | null
): readonly { readonly claim: string; readonly raisedBy: number }[] | undefined {
  if (map === null || map.choice === null) return undefined;
  const byId = new Map(map.keyPoints.map((point) => [point.keyPointId, point] as const));
  return Object.freeze(map.choice.alsoRaised.flatMap((keyPointId) => {
    const point = byId.get(keyPointId);
    if (point === undefined) return [];
    return [Object.freeze({ claim: withoutNodeIds(point.claim), raisedBy: Math.max(1, new Set(point.makers).size) })];
  }));
}
```

3c. In `buildStoryRunSnapshot`'s returned object, replace the last line

```ts
    ...(source.roleMakers === undefined ? {} : { roleMakers: source.roleMakers })
```

with

```ts
    ...(source.roleMakers === undefined ? {} : { roleMakers: source.roleMakers }),
    ...(source.alsoRaised === undefined
      ? {}
      : { alsoRaised: Object.freeze(source.alsoRaised.map((item) => Object.freeze({ claim: item.claim, raisedBy: item.raisedBy }))) })
```

- [ ] **Step 4: Wire it in `apps/runner/src/index.ts`**

4a. Change the import on line ~201 to:

```ts
import { buildStoryRunSnapshot, storyAlsoRaisedFrom, storyRotationRoleMakers, storySeatRoleMaker } from "./story-snapshot.js";
```

4b. Inside `input: buildStoryRunSnapshot({ … })`, directly after `positionNodeIds: makerPositionNodeIds,`, add:

```ts
              // Debate shape P2c (spec 2026-10-12 §3.3 step 8): the map's unchosen points, for the
              // story's "also raised, not debated" paragraph; undefined without a map choice.
              alsoRaised: storyAlsoRaisedFrom(debateShapeMap),
```

Here `debateShapeMap` is P2b's in-scope `MapResult | null` (see the gate).

- [ ] **Step 5: Run the tests**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-story-snapshot.test.ts`
Expected: PASS (4 tests).
Then run: `pnpm exec vitest run tests/unit/story-run-snapshot.test.ts`
Expected: PASS.
Then run: `pnpm exec vitest run tests/architecture/story-runner-wiring.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add apps/runner/src/story-snapshot.ts apps/runner/src/index.ts tests/unit/debate-shape-story-snapshot.test.ts
git commit -m "$(cat <<'EOF'
Runner: hand the map's also-raised points to the story (debate shape P2c)

storyAlsoRaisedFrom reads the map choice's unchosen key points with how many
makers raised each; without a map choice the snapshot has no alsoRaised key.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Contract — the debate map view, its public copy, and its content check

**Files:**
- Create: `packages/contract/src/map-view.ts`
- Modify: `packages/contract/src/index.ts`
- Modify: `packages/contract/src/client.ts`
- Modify: `apps/api/src/publication-check/material.ts`
- Modify: `tests/unit/hs-s02-check.test.ts`
- Test: `tests/unit/debate-shape-map-view-contract.test.ts` (new)

**Interfaces:**
- `DebateMapViewSchema` with `{ positions: { node_id, answer }[] ≤ 5, also_raised: string[] ≤ 20 }`, strict.
- `DEBATE_MAP_VIEW_LIMITS = { maxPositions: 5, maxAnswerChars: 600, maxAlsoRaised: 20, maxClaimChars: 240 }`.
- `PublicDebateSchema.map_view?: DebateMapView`.
- Route `GET /v1/answers/{id}/map`.
- `ContractClient.readAnswerMapView(answerId): Promise<DebateMapView>`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/debate-shape-map-view-contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEBATE_MAP_VIEW_LIMITS, DebateMapViewSchema, PublicDebateSchema, contractInventory, type PublicDebate
} from "@debateai/contract";
import { CHECKED_TEXT_PATHS, extractCheckedText } from "../../apps/api/src/publication-check/material.js";

/** Debate shape P2c (spec 2026-10-12 §3.3 step 8, §3.4): what the debate page reads from the map. */

const VIEW = {
  positions: [{ node_id: "n-hybrid", answer: "Move gradually, with hybrid work." }],
  also_raised: ["Ask the school about a mid-year move."]
};

const BASE = {
  public_ref: "22222222-2222-4222-8222-222222222222",
  author_pseudonym: "Stable Public Author",
  question: "Should we move to Cluj?",
  published_at: "2026-10-12T10:00:00.000Z",
  answer: {
    terminal: "SERVED", verdict: "CONTESTED", verdict_available: true, confidence_band: "CAPPED",
    summary_segments: [{ text: "Move gradually." }], badges: [], residual_objections: [],
    reversal_point: "A cheaper flat in Cluj.", as_of: "2026-10-12T09:00:00.000Z"
  }
} as const;

describe("debate shape P2c — the debate map view contract", () => {
  it("accepts the page's view and nothing more: no maker, no count, no extra key", () => {
    expect(DebateMapViewSchema.parse(VIEW)).toEqual(VIEW);
    expect(DebateMapViewSchema.safeParse({ ...VIEW, raised_by: [3] }).success).toBe(false);
    expect(DebateMapViewSchema.safeParse({
      positions: [{ node_id: "n", answer: "Yes.", maker: "OpenAI" }], also_raised: []
    }).success).toBe(false);
    expect(DebateMapViewSchema.safeParse({
      positions: [], also_raised: ["x".repeat(DEBATE_MAP_VIEW_LIMITS.maxClaimChars + 1)]
    }).success).toBe(false);
    expect(DebateMapViewSchema.safeParse({
      positions: [], also_raised: Array.from({ length: DEBATE_MAP_VIEW_LIMITS.maxAlsoRaised + 1 }, () => "x")
    }).success).toBe(false);
    expect(DebateMapViewSchema.safeParse({
      positions: Array.from({ length: DEBATE_MAP_VIEW_LIMITS.maxPositions + 1 }, (_, index) => ({ node_id: `n${String(index)}`, answer: "A." })),
      also_raised: []
    }).success).toBe(false);
  });

  it("rides a public snapshot only when present, so every older snapshot still parses", () => {
    expect(PublicDebateSchema.parse(BASE)).not.toHaveProperty("map_view");
    expect(PublicDebateSchema.parse({ ...BASE, map_view: VIEW }).map_view).toEqual(VIEW);
  });

  it("checks the map view's public text with the arguments, and never the node id", () => {
    expect(CHECKED_TEXT_PATHS).toContainEqual({ path: "map_view.positions[].answer", kind: "ARGUMENTS" });
    expect(CHECKED_TEXT_PATHS).toContainEqual({ path: "map_view.also_raised[]", kind: "ARGUMENTS" });
    const leaves = extractCheckedText(PublicDebateSchema.parse({ ...BASE, map_view: VIEW }) as PublicDebate);
    expect(leaves).toContainEqual({ kind: "ARGUMENTS", text: "Move gradually, with hybrid work." });
    expect(leaves).toContainEqual({ kind: "ARGUMENTS", text: "Ask the school about a mid-year move." });
    expect(leaves.some((leaf) => leaf.text === "n-hybrid")).toBe(false);
  });

  it("is a declared route and resource of the contract inventory", () => {
    expect(contractInventory.routes).toContain("GET /v1/answers/{id}/map");
    expect(contractInventory.resources.DebateMapViewSchema).toBe(DebateMapViewSchema);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-map-view-contract.test.ts`
Expected: FAIL. `DebateMapViewSchema` is undefined.

- [ ] **Step 3: Create `packages/contract/src/map-view.ts`**

```ts
import { z } from "zod";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8, §3.4) — what the debate page shows from the
 * map. It holds each argued answer's statement, keyed by the opening position (root node) that
 * argued it, and the points that were raised but not debated. It carries only text the page
 * shows and node ids the answer already carries: never a maker, a count, a mark or a map id.
 * It imports only zod (never ./index.js), for the same module-cycle reason disclosure.ts does.
 * The same shape rides a public snapshot (`PublicDebateSchema.map_view`).
 */
export const DEBATE_MAP_VIEW_LIMITS = Object.freeze({
  maxPositions: 5,
  maxAnswerChars: 600,
  maxAlsoRaised: 20,
  maxClaimChars: 240
});

export const DebateMapViewSchema = z.object({
  positions: z.array(z.object({
    node_id: z.string().trim().min(1),
    answer: z.string().trim().min(1).max(DEBATE_MAP_VIEW_LIMITS.maxAnswerChars)
  }).strict()).max(DEBATE_MAP_VIEW_LIMITS.maxPositions),
  also_raised: z.array(z.string().trim().min(1).max(DEBATE_MAP_VIEW_LIMITS.maxClaimChars))
    .max(DEBATE_MAP_VIEW_LIMITS.maxAlsoRaised)
}).strict();
export type DebateMapView = z.infer<typeof DebateMapViewSchema>;
```

- [ ] **Step 4: Wire it into `packages/contract/src/index.ts`**

4a. After line 18 (`import { AnswerDisclosureSchema, AnswerFloorSchema } from "./disclosure.js"; export * from "./disclosure.js";`), add:

```ts
import { DebateMapViewSchema } from "./map-view.js"; export * from "./map-view.js";
```

4b. In `PublicDebateSchema`, replace

```ts
  floor: AnswerFloorSchema.optional()
}).strict();
export type PublicDebate = z.infer<typeof PublicDebateSchema>;
```

with

```ts
  floor: AnswerFloorSchema.optional(),
  // Debate shape P2c (spec 2026-10-12 §3.3 step 8): the map view copied at publish time,
  // so the public page can list what was raised but not debated and title each position.
  // Optional: every snapshot published before it still parses.
  map_view: DebateMapViewSchema.optional()
}).strict();
export type PublicDebate = z.infer<typeof PublicDebateSchema>;
```

4c. In `contractInventory.routes`, after `"GET /v1/answers/{id}/disclosure",`, add `"GET /v1/answers/{id}/map",`.

4d. In `contractInventory.resources`, change `AnswerStorySchema, AnswerDisclosureSchema, BillingPlansResponseSchema,` to `AnswerStorySchema, AnswerDisclosureSchema, DebateMapViewSchema, BillingPlansResponseSchema,`.

- [ ] **Step 5: Add the client method in `packages/contract/src/client.ts`**

5a. In the big `from "./index.js"` import block (lines 12–132), add `DebateMapViewSchema,` after `AnswerDisclosureSchema,` (line ~52), and `type DebateMapView,` after `type AnswerDisclosure,` (line ~98).

5b. In the `ContractClient` interface, after `readAnswerDisclosure(answerId: string): Promise<AnswerDisclosure>;`, add:

```ts
  /** Debate shape P2c: the owner's map view of an answer (404 when the run had no map choice). */
  readAnswerMapView(answerId: string): Promise<DebateMapView>;
```

5c. In the client object, after the `readAnswerDisclosure: …` line, add:

```ts
    readAnswerMapView: (answerId: string) => request(`/v1/answers/${encodeURIComponent(answerId)}/map`, DebateMapViewSchema),
```

- [ ] **Step 6: Check the new public text in `apps/api/src/publication-check/material.ts`**

Replace

```ts
    .map(path => ({ path: `answer.nodes[].${path}`, kind: "ARGUMENTS" as const })),
  { path: "answer.nodes[].review.reasons[]", kind: "REVIEWS" },
```

with

```ts
    .map(path => ({ path: `answer.nodes[].${path}`, kind: "ARGUMENTS" as const })),
  // Debate shape P2c: the map view's answers and also-raised claims are model text the
  // public page shows, judged with the arguments (kept beside them, so one call per kind holds).
  { path: "map_view.positions[].answer", kind: "ARGUMENTS" },
  { path: "map_view.also_raised[]", kind: "ARGUMENTS" },
  { path: "answer.nodes[].review.reasons[]", kind: "REVIEWS" },
```

`map_view.positions[].node_id` is excluded by the existing `_id` suffix rule.

- [ ] **Step 7: Update the pinned table in `tests/unit/hs-s02-check.test.ts`**

7a. In `const paths = [...]`, replace

```ts
    .map(p => [`answer.nodes[].${p}`, "ARGUMENTS"]),
  ["answer.nodes[].review.reasons[]", "REVIEWS"],
```

with

```ts
    .map(p => [`answer.nodes[].${p}`, "ARGUMENTS"]),
  // Debate shape P2c: the map view's public text, judged with the arguments.
  ["map_view.positions[].answer", "ARGUMENTS"], ["map_view.also_raised[]", "ARGUMENTS"],
  ["answer.nodes[].review.reasons[]", "REVIEWS"],
```

7b. In `snapshot()`, add `"map_view.positions[].node_id"` to the list of `EXCLUDED-` paths, after `"story_short.paths[].position_ref"`.

7c. In the R2 test, replace

```ts
  it("covers the schema with 26 checked paths and 32 excluded strings", async () => {
```

with

```ts
  // Debate shape P2c: map_view adds 3 string leaves — positions[].answer and also_raised[] checked,
  // positions[].node_id excluded: 58 → 61, 32 → 33, 26 → 28 checked paths.
  it("covers the schema with 28 checked paths and 33 excluded strings", async () => {
```

In the same test, change `expect(leaves).toHaveLength(58);` to `expect(leaves).toHaveLength(61);` and `.toHaveLength(32);` to `.toHaveLength(33);`.

7d. In `copies every marked leaf in path order…`, replace

```ts
    // 26 paths: 8 without an array, 17 with one array (2 members each), 1 with two nested arrays (4 members).
    expect(expected).toHaveLength(8 + 17 * 2 + 1 * 4);
```

with

```ts
    // 28 paths: 8 without an array, 19 with one array (2 members each), 1 with two nested arrays (4 members).
    expect(expected).toHaveLength(8 + 19 * 2 + 1 * 4);
```

- [ ] **Step 8: Regenerate the contract and run the tests**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm run generate:contract`
Expected: it exits 0 and rewrites the git-ignored `packages/contract/generated/*`.
Then run, one at a time:
- `pnpm exec vitest run tests/unit/debate-shape-map-view-contract.test.ts` → PASS (4).
- `pnpm exec vitest run tests/unit/hs-s02-check.test.ts` → PASS.

- [ ] **Step 9: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add packages/contract/src/map-view.ts packages/contract/src/index.ts packages/contract/src/client.ts \
  apps/api/src/publication-check/material.ts tests/unit/hs-s02-check.test.ts tests/unit/debate-shape-map-view-contract.test.ts
git commit -m "$(cat <<'EOF'
Contract: the debate map view and its public copy (debate shape P2c)

DebateMapViewSchema (answers keyed by their opening position, and the points
raised but not debated; no maker, no count), the owner route
GET /v1/answers/{id}/map, readAnswerMapView, and an optional map_view on the
public snapshot whose text the publication check judges with the arguments.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: API — the owner's map view route and the published copy

**Files:**
- Create: `apps/api/src/map-views.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/publications.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `tests/unit/s7-authorization.test.ts`
- Test: `tests/unit/debate-shape-map-view-api.test.ts` (new)

**Interfaces:**
- `MapChoiceReader { readMapChoiceForRun(runId): Promise<MapChoiceRecord | null> }`, where `MapChoiceRecord = { answers: { statement, rootNodeId | null }[]; alsoRaised: { claim, makers[] }[] }`. P2b's repository satisfies this structurally; see Contract deviation 4.
- `debateMapViewFrom(record, nodeIds): DebateMapView`.
- `AnswerMapViewApplication.readMapView({ runId, nodeIds }): Promise<DebateMapView | null>`.
- `RepositoryAnswerMapViewApplication`, `NO_MAP_VIEWS`.
- `buildApi({ mapViews })`.
- `readPublishableMapView(mapViews, { runId, answer, source })`.
- `PostgresPublicationApplication` gets a 6th constructor argument, `mapViews`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/debate-shape-map-view-api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { DEBATE_MAP_VIEW_LIMITS, DebateMapViewSchema, type Answer, type DebateMapView } from "@debateai/contract";
import {
  NO_MAP_VIEWS, RepositoryAnswerMapViewApplication, debateMapViewFrom,
  type AnswerMapViewApplication, type MapChoiceRecord
} from "../../apps/api/src/map-views.js";
import { readPublishableMapView } from "../../apps/api/src/publications.js";
import {
  TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders
} from "../support/httpSession.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import { STORY_TEST_ANSWER_ID, STORY_TEST_RUN_ID } from "../support/storyApiFixtures.js";

/**
 * Debate shape P2c (spec 2026-10-12 §3.3 step 8, §3.4): the owner's read of the map view,
 * GET /v1/answers/{id}/map, and the copy a publication takes. As with the disclosure route,
 * the answer read is the ownership check, and "not yours", "no map" and "malformed" are one
 * closed 404.
 */

const OWNER = testHttpIdentity("map-view-owner");
const HEADERS = testSessionHeaders(OWNER);
const URL_OF = `/v1/answers/${STORY_TEST_ANSWER_ID}/map`;

function answerOf(): Answer {
  return buildFairShapedAnswer({ answer_id: STORY_TEST_ANSWER_ID, run_ref: STORY_TEST_RUN_ID, relevant_as_of: "2026-10-12T10:00:00.000Z" });
}

function application(answer: Answer | null, reads: unknown[] = []): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
    readAnswer: async (answerId, _session, version, ownership) => {
      reads.push({ answerId, version, ownership });
      return answer;
    },
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

function views(view: DebateMapView | null, calls: unknown[] = []): AnswerMapViewApplication {
  return {
    readMapView: async (input) => {
      calls.push(input);
      return view;
    }
  };
}

function api(input: { answer: Answer | null; mapViews?: AnswerMapViewApplication; reads?: unknown[] }) {
  return buildApi({
    application: application(input.answer, input.reads),
    sessions: testSessionApplication([OWNER]),
    allowedOrigin: TEST_APP_ORIGIN,
    ...(input.mapViews === undefined ? {} : { mapViews: input.mapViews })
  });
}

afterEach(() => vi.restoreAllMocks());

describe("debate shape P2c — the map view from P2b's map choice", () => {
  const answer = answerOf();
  const nodeIds = new Set(answer.nodes.map((node) => node.node_id));
  const [first, second] = answer.nodes.map((node) => node.node_id);

  it("drops positions whose root node is not in the answer, has none, or repeats one", () => {
    const record: MapChoiceRecord = {
      answers: [
        { statement: "  Move gradually.  ", rootNodeId: first! },
        { statement: "Stay where you are.", rootNodeId: "node:not-published" },
        { statement: "A second answer on the same node.", rootNodeId: first! },
        { statement: "No position argued this.", rootNodeId: null },
        { statement: "Move now.", rootNodeId: second! }
      ],
      alsoRaised: []
    };
    expect(debateMapViewFrom(record, nodeIds).positions).toEqual([
      { node_id: first, answer: "Move gradually." },
      { node_id: second, answer: "Move now." }
    ]);
  });

  it("lists the also-raised claims most-raised first, without who or how many", () => {
    const view = debateMapViewFrom({
      answers: [{ statement: "Move gradually.", rootNodeId: first! }],
      alsoRaised: [
        { claim: "Raised once.", makers: ["OpenAI"] },
        { claim: "Raised by three.", makers: ["OpenAI", "Anthropic", "xAI", "xAI"] },
        { claim: "   ", makers: ["OpenAI"] }
      ]
    }, nodeIds);
    expect(view.also_raised).toEqual(["Raised by three.", "Raised once."]);
    const text = JSON.stringify(view);
    for (const forbidden of ["OpenAI", "Anthropic", "makers", "raised_by"]) expect(text).not.toContain(forbidden);
  });

  it("cuts long text to the contract's limits, never splitting a character", () => {
    const view = debateMapViewFrom({
      answers: [{ statement: "a".repeat(700), rootNodeId: first! }],
      alsoRaised: [{ claim: "b".repeat(300), makers: ["A"] }, { claim: "😀".repeat(200), makers: ["A"] }]
    }, nodeIds);
    expect(DebateMapViewSchema.parse(view)).toEqual(view);
    expect(view.positions[0]!.answer.length).toBeLessThanOrEqual(DEBATE_MAP_VIEW_LIMITS.maxAnswerChars);
    expect(view.positions[0]!.answer.endsWith("…")).toBe(true);
    for (const claim of view.also_raised) {
      expect(claim.length).toBeLessThanOrEqual(DEBATE_MAP_VIEW_LIMITS.maxClaimChars);
      expect(claim).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
    }
  });

  it("reads no view when the run has no map choice, or the choice named no answer", async () => {
    const reader = (record: MapChoiceRecord | null) => new RepositoryAnswerMapViewApplication({ readMapChoiceForRun: async () => record });
    expect(await reader(null).readMapView({ runId: STORY_TEST_RUN_ID, nodeIds })).toBeNull();
    expect(await reader({ answers: [], alsoRaised: [{ claim: "Orphan.", makers: ["A"] }] })
      .readMapView({ runId: STORY_TEST_RUN_ID, nodeIds })).toBeNull();
    expect(await NO_MAP_VIEWS.readMapView({ runId: STORY_TEST_RUN_ID, nodeIds })).toBeNull();
  });
});

describe("debate shape P2c — GET /v1/answers/{id}/map", () => {
  const view: DebateMapView = { positions: [], also_raised: ["Ask the school."] };

  it("needs a session", async () => {
    const reads: unknown[] = [];
    const server = api({ answer: answerOf(), mapViews: views(view), reads });
    const response = await server.inject({ method: "GET", url: URL_OF });
    expect(response.statusCode).toBe(401);
    expect(reads).toEqual([]);
    await server.close();
  });

  it("answers the closed 404 without the reader, for a malformed id, for an answer that is not the caller's, and with no map", async () => {
    for (const [input, url] of [
      [{ answer: answerOf() }, URL_OF],
      [{ answer: answerOf(), mapViews: views(view) }, "/v1/answers/not-a-uuid/map"],
      [{ answer: null, mapViews: views(view) }, URL_OF],
      [{ answer: answerOf(), mapViews: views(null) }, URL_OF]
    ] as const) {
      const server = api(input);
      const response = await server.inject({ method: "GET", url, headers: HEADERS });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "MAP_VIEW_NOT_FOUND" });
      await server.close();
    }
  });

  it("reads the view of the answer's own run, against the answer's own nodes", async () => {
    const calls: { runId: string; nodeIds: ReadonlySet<string> }[] = [];
    const answer = answerOf();
    const server = api({ answer, mapViews: views(view, calls) });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(view);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.runId).toBe(STORY_TEST_RUN_ID);
    expect([...calls[0]!.nodeIds].sort()).toEqual(answer.nodes.map((node) => node.node_id).sort());
    await server.close();
  });
});

describe("debate shape P2c — the published copy", () => {
  const input = { runId: STORY_TEST_RUN_ID, answer: answerOf(), source: { requestId: "req-map" } as never };

  it("copies the owner's view, and never blocks publishing when the read fails", async () => {
    const view: DebateMapView = { positions: [], also_raised: ["Ask the school."] };
    expect(await readPublishableMapView(views(view), input)).toEqual(view);
    expect(await readPublishableMapView(NO_MAP_VIEWS, input)).toBeNull();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing: AnswerMapViewApplication = { readMapView: async () => { throw new Error("database unreachable"); } };
    expect(await readPublishableMapView(failing, input)).toBeNull();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]![0])).toContain("api.publication.map_view_not_published");
    expect(String(logged.mock.calls[0]![0])).not.toContain("database unreachable");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-map-view-api.test.ts`
Expected: FAIL. `../../apps/api/src/map-views.js` cannot be resolved.

- [ ] **Step 3: Create `apps/api/src/map-views.ts`**

```ts
import { DEBATE_MAP_VIEW_LIMITS, DebateMapViewSchema, type DebateMapView } from "@debateai/contract";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8, §3.4) — the debate page's view of the map:
 * - each argued answer's statement, keyed by the opening position that argued it;
 * - the points that were raised but not debated.
 *
 * The row is P2b's (`core.map_choice`, read by `readMapChoiceForRun`, decrypted like other
 * debate text). This module only turns it into the contract's words. Nothing that names a
 * maker, a count, a mark or a map id leaves here.
 */

/** The members of P2b's map choice row this module reads (Contract deviation 4). */
export interface MapChoiceRecord {
  readonly answers: readonly Readonly<{ statement: string; rootNodeId: string | null }>[];
  readonly alsoRaised: readonly Readonly<{ claim: string; makers: readonly string[] }>[];
}

export interface MapChoiceReader {
  readMapChoiceForRun(runId: string): Promise<MapChoiceRecord | null>;
}

/** Trimmed, and cut to `limit` UTF-16 units with an ellipsis, never splitting a character. */
function clip(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  let kept = "";
  for (const character of trimmed) {
    if (kept.length + character.length > limit - 1) break;
    kept += character;
  }
  return `${kept}…`;
}

/**
 * The view, against the answer's own nodes. A position whose opening node the answer does not
 * hold is dropped, so a title never points at a node the page cannot show. So is one with no
 * node, or a second answer on the same node. Also-raised claims come most-raised first, ties
 * in the map's order, and only the claims travel.
 */
export function debateMapViewFrom(record: MapChoiceRecord, nodeIds: ReadonlySet<string>): DebateMapView {
  const seen = new Set<string>();
  const positions = record.answers.flatMap((answer) => {
    const nodeId = answer.rootNodeId;
    if (nodeId === null || !nodeIds.has(nodeId) || seen.has(nodeId) || answer.statement.trim() === "") return [];
    seen.add(nodeId);
    return [{ node_id: nodeId, answer: clip(answer.statement, DEBATE_MAP_VIEW_LIMITS.maxAnswerChars) }];
  }).slice(0, DEBATE_MAP_VIEW_LIMITS.maxPositions);
  const alsoRaised = record.alsoRaised
    .map((item, order) => ({ claim: item.claim.trim(), raisedBy: new Set(item.makers).size, order }))
    .filter((item) => item.claim !== "")
    .sort((left, right) => right.raisedBy - left.raisedBy || left.order - right.order)
    .slice(0, DEBATE_MAP_VIEW_LIMITS.maxAlsoRaised)
    .map((item) => clip(item.claim, DEBATE_MAP_VIEW_LIMITS.maxClaimChars));
  return DebateMapViewSchema.parse({ positions, also_raised: alsoRaised });
}

export interface AnswerMapViewApplication {
  readMapView(input: Readonly<{ runId: string; nodeIds: ReadonlySet<string> }>): Promise<DebateMapView | null>;
}

/**
 * A run with no map choice has no view. That covers a run without the new shape, and a map that
 * fell back to today's opening and chose no answer. The page then shows exactly what it shows today.
 */
export class RepositoryAnswerMapViewApplication implements AnswerMapViewApplication {
  constructor(private readonly reader: MapChoiceReader) {}

  async readMapView(input: Readonly<{ runId: string; nodeIds: ReadonlySet<string> }>): Promise<DebateMapView | null> {
    const record = await this.reader.readMapChoiceForRun(input.runId);
    if (record === null || record.answers.length === 0) return null;
    return debateMapViewFrom(record, input.nodeIds);
  }
}

/** No reader composed (local tools, older deployments): never a view. */
export const NO_MAP_VIEWS: AnswerMapViewApplication = Object.freeze({
  readMapView: async () => null
});
```

- [ ] **Step 4: Add the route in `apps/api/src/index.ts`**

4a. In the `@debateai/contract` import block, add `DebateMapViewSchema,` after `AnswerDisclosureSchema,` (line ~37).

4b. After `import type { AnswerDisclosureApplication } from "./disclosures.js";` (line ~242), add:

```ts
import type { AnswerMapViewApplication } from "./map-views.js";
```

4c. In the route policy table, after the `GET /v1/answers/{id}/disclosure` row (line ~1386), add:

```ts
  { route: "GET /v1/answers/{id}/map", auth: "user", resource: "run-owner", action: "read-map-view" },
```

4d. In the `buildApi` options interface, after `readonly disclosures?: AnswerDisclosureApplication;`, add:

```ts
  /**
   * Debate shape P2c (spec 2026-10-12 §3.3 step 8): the owner's read of the debate's map
   * view. Optional like `disclosures`; without it the route answers its closed 404.
   */
  readonly mapViews?: AnswerMapViewApplication;
```

4e. Directly after the whole `api.get<…>("/v1/answers/:id/disclosure", …)` handler, add:

```ts
  // Debate shape P2c (spec 2026-10-12 §3.3 step 8, §3.4): the debate page's map view.
  // The answer read is the ownership check, as for the disclosure. "Not yours", "malformed",
  // "no reader" and "no map choice" are one closed 404. The view is read against the
  // answer's own nodes, so it never names a node the page cannot show.
  api.get<{ Params: { id: string } }>("/v1/answers/:id/map", routePolicy("GET /v1/answers/{id}/map"), async (request, reply) => {
    const answerId = ResourceIdSchema.safeParse(request.params.id);
    const mapViews = options.mapViews;
    if (!answerId.success || mapViews === undefined) return reply.status(404).send({ error: "MAP_VIEW_NOT_FOUND" });
    const ownership = ownershipFor(request);
    const answer = await options.application.readAnswer(answerId.data, request.session, undefined, ownership);
    if (answer === null) return reply.status(404).send({ error: "MAP_VIEW_NOT_FOUND" });
    const view = await mapViews.readMapView({
      runId: answer.run_ref,
      nodeIds: new Set(answer.nodes.map((node) => node.node_id))
    });
    return view === null
      ? reply.status(404).send({ error: "MAP_VIEW_NOT_FOUND" })
      : reply.send(DebateMapViewSchema.parse(view));
  });
```

- [ ] **Step 5: Copy the view into a publication in `apps/api/src/publications.ts`**

5a. Add `type DebateMapView,` to the `@debateai/contract` import (after `type AnswerFloor,`). After the `@debateai/db` import block, add:

```ts
import { NO_MAP_VIEWS, type AnswerMapViewApplication } from "./map-views.js";
```

5b. After `logFloorNotPublished`, add:

```ts
/**
 * Debate shape P2c (spec 2026-10-12 §3.3 step 8): the map view copied into the snapshot, so
 * the public page can list what was raised but not debated and title each position. Like the
 * story and the floor, it never blocks publishing. A failed read publishes no view, and the
 * log records only a bounded diagnostic, never the error's text.
 */
export async function readPublishableMapView(
  mapViews: AnswerMapViewApplication,
  input: Readonly<{ runId: string; answer: Answer; source: AuthSourceContext }>
): Promise<DebateMapView | null> {
  try {
    return await mapViews.readMapView({
      runId: input.runId,
      nodeIds: new Set(input.answer.nodes.map((node) => node.node_id))
    });
  } catch (error) {
    console.error(JSON.stringify(Object.freeze({
      event: "api.publication.map_view_not_published",
      requestId: input.source.requestId,
      diagnostic: storyReadDiagnostic(error)
    })));
    return null;
  }
}
```

5c. In the `PostgresPublicationApplication` constructor, replace

```ts
    private readonly stories: PublicationStoryReader = NO_PUBLICATION_STORIES
  ) {}
```

with

```ts
    private readonly stories: PublicationStoryReader = NO_PUBLICATION_STORIES,
    private readonly mapViews: AnswerMapViewApplication = NO_MAP_VIEWS
  ) {}
```

5d. In `stagePublication`, after `const floor = await readPublishableFloor(this.repository, input);`, add:

```ts
    const mapView = await readPublishableMapView(this.mapViews, input);
```

Then replace `      ...(floor === null ? {} : { floor })` with:

```ts
      ...(floor === null ? {} : { floor }),
      ...(mapView === null ? {} : { map_view: mapView })
```

`storyReadDiagnostic` (publications.ts line ~134) returns only a typed code or an error class name, never a message, so the log stays bounded.

- [ ] **Step 6: Wire main.ts with P2b's reader** (P2b gate)

Find P2b's reader class: `grep -rn "readMapChoiceForRun" packages/db/src | head`. The lines below assume it is `MapChoiceRepository` from `@debateai/db`, constructed with the runtime pool. If P2b's name or constructor differ, change only these lines. Its row must expose the `MapChoiceRecord` members (Contract deviation 4), or `tsc` refuses the assignment.

6a. Add `MapChoiceRepository` to the big `@debateai/db` import in `apps/api/src/main.ts` (line ~47). After `import { RepositoryAnswerDisclosureApplication } from "./disclosures.js";`, add:

```ts
import { RepositoryAnswerMapViewApplication } from "./map-views.js";
```

6b. Before `const publications = publicationCipher === undefined`, add:

```ts
// Debate shape P2c (spec 2026-10-12 §3.3 step 8): the debate page's map view, for the
// owner's route and for the snapshot a publication takes, on the same runtime pool.
const mapViews = new RepositoryAnswerMapViewApplication(new MapChoiceRepository(pool));
```

6c. In `new PostgresPublicationApplication(…)`, after `new RepositoryPublicationStoryReader(storyRepository)`, add `,\n      mapViews`.

6d. In `buildApi({ … })`, after the `disclosures: new RepositoryAnswerDisclosureApplication(…),` line, add:

```ts
  mapViews,
```

- [ ] **Step 7: Add the policy row to `tests/unit/s7-authorization.test.ts`**

After the line `  { route: "GET /v1/answers/{id}/disclosure", auth: "user", resource: "run-owner", action: "read-disclosure" },` (line ~124), add:

```ts
  { route: "GET /v1/answers/{id}/map", auth: "user", resource: "run-owner", action: "read-map-view" },
```

- [ ] **Step 8: Run the tests**

Run each, one at a time:
- `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-map-view-api.test.ts` → PASS (8).
- `pnpm exec vitest run tests/unit/s7-authorization.test.ts` → PASS.
- `pnpm exec vitest run tests/unit/m5-answer-disclosure.test.ts` → PASS.
- `pnpm exec vitest run tests/unit/s8-publication.test.ts` → PASS. Publication without a reader stages no `map_view`.

- [ ] **Step 9: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add apps/api/src/map-views.ts apps/api/src/index.ts apps/api/src/publications.ts apps/api/src/main.ts \
  tests/unit/s7-authorization.test.ts tests/unit/debate-shape-map-view-api.test.ts
git commit -m "$(cat <<'EOF'
API: the owner's map view route and the published copy (debate shape P2c)

GET /v1/answers/{id}/map reads P2b's map choice for the answer's own run,
against the answer's own nodes (closed 404 otherwise); a publication copies
the view into its snapshot and never fails for it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: UI data — read the map view beside the answer

**Files:**
- Create: `apps/ui/lib/v3/mapView.ts`
- Modify: `apps/ui/lib/api.ts`
- Modify: `apps/ui/lib/serverApi.ts`
- Test: `tests/unit/debate-shape-map-view-ui.test.ts` (new)

**Interfaces:**
- `readAnswerMapView(client, answer): Promise<AnswerMapViewRead>`, where `AnswerMapViewRead = { mapView: DebateMapView | null; failed: boolean }`.
- `positionTitlesFrom(view, nodes, storyCatalog, composeCatalog): ReadonlyMap<nodeId, title>`.
- The served `DebateBundle` gets an optional `mapViewRead`.
- `GetDebateServerResult` (ok) gets `mapView`.

`mapView.ts` is pure and has no React import. `serverApi.ts`, which is server-side, imports it, so the React context lives in the client component of Task 7.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/debate-shape-map-view-ui.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ContractHttpError, type Answer, type DebateMapView } from "@debateai/contract";
import { positionTitlesFrom, readAnswerMapView } from "../../apps/ui/lib/v3/mapView.js";
import { getDebateBundle } from "../../apps/ui/lib/api.js";
import { modelMeta } from "../../apps/ui/lib/models.js";
import { STORY_FIXTURE_ANSWER } from "../../apps/ui/lib/v3/storyFixture.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };
import composeEnglish from "../../apps/ui/messages/en/compose.json" with { type: "json" };

/** Debate shape P2c: the owner page reads the map view beside the answer, and titles each position with it. */

const VIEW: DebateMapView = {
  positions: [
    { node_id: "n-hybrid", answer: "Move gradually, with hybrid work" },
    { node_id: "n-yes", answer: "Move now" },
    { node_id: "node:not-in-answer", answer: "Stay" }
  ],
  also_raised: ["Ask the school about a mid-year move."]
};

describe("debate shape P2c — readAnswerMapView", () => {
  const answer = { answer_id: STORY_FIXTURE_ANSWER.answer_id };

  it("reads the view, says 'none' for a 404, and 'could not read' for anything else", async () => {
    expect(await readAnswerMapView({ readAnswerMapView: async () => VIEW }, answer)).toEqual({ mapView: VIEW, failed: false });
    expect(await readAnswerMapView({
      readAnswerMapView: async () => { throw new ContractHttpError("NOT_FOUND", 404, "MAP_VIEW_NOT_FOUND"); }
    }, answer)).toEqual({ mapView: null, failed: false });
    expect(await readAnswerMapView({
      readAnswerMapView: async () => { throw new ContractHttpError("SERVER_FAILURE", 500, "boom"); }
    }, answer)).toEqual({ mapView: null, failed: true });
    // A client without the method (an older test double) is a failed read, never a thrown page.
    expect(await readAnswerMapView({} as never, answer)).toEqual({ mapView: null, failed: true });
  });

  it("rides the served bundle beside the floor", async () => {
    const client = {
      readRun: async () => ({ run_ref: STORY_FIXTURE_ANSWER.run_ref, question_line: "q", state: "SETTLED", terminal_reason: null, hold_until: null, argument_language: null }),
      readRunAnswer: async () => STORY_FIXTURE_ANSWER as Answer,
      readAnswerDisclosure: async () => { throw new ContractHttpError("NOT_FOUND", 404, "DISCLOSURE_NOT_FOUND"); },
      readAnswerMapView: async () => VIEW
    };
    const bundle = await getDebateBundle(STORY_FIXTURE_ANSWER.run_ref, "cookie-session", client as never);
    expect(bundle.kind).toBe("served");
    expect(bundle.kind === "served" ? bundle.mapViewRead : null).toEqual({ mapView: VIEW, failed: false });
  });
});

describe("debate shape P2c — positionTitlesFrom", () => {
  const nodes = STORY_FIXTURE_ANSWER.nodes;
  const nameOf = (nodeId: string): string => {
    const lineage = nodes.find((node) => node.node_id === nodeId)?.maker_lineage;
    return modelMeta(lineage!.model_id, composeEnglish).name;
  };

  it("titles each position the answer holds, in the catalogue it is given", () => {
    const titles = positionTitlesFrom(VIEW, nodes, publicEnglish, composeEnglish);
    expect([...titles.keys()]).toEqual(["n-hybrid", "n-yes"]);
    expect(titles.get("n-hybrid")).toBe(`The case for Move gradually, with hybrid work, argued by ${nameOf("n-hybrid")}`);
    const romanian = { "public.positionTitle": "Argumentele pentru {answer}, susținute de {ai}" };
    expect(positionTitlesFrom(VIEW, nodes, romanian, composeEnglish).get("n-yes"))
      .toBe(`Argumentele pentru Move now, susținute de ${nameOf("n-yes")}`);
  });

  it("gives no title without a view, or for a position whose AI is not known", () => {
    expect(positionTitlesFrom(null, nodes, publicEnglish, composeEnglish).size).toBe(0);
    const anonymous = nodes.map((node) => ({ ...node, maker_lineage: null }));
    expect(positionTitlesFrom(VIEW, anonymous, publicEnglish, composeEnglish).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-map-view-ui.test.ts`
Expected: FAIL. `../../apps/ui/lib/v3/mapView.js` cannot be resolved.

- [ ] **Step 3: Create `apps/ui/lib/v3/mapView.ts`**

```ts
import { ContractHttpError, type Answer, type ContractClient, type DebateMapView } from "@debateai/contract";
import { modelMeta } from "../models.js";
import { t, type MessageCatalog } from "../i18n/translate.js";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8): the debate page's map view, read where the
 * page reads the answer, as the floor is. A 404 (a run without the new shape, or a map that
 * chose nothing) is no view. Any other failure is also no view, but `failed` says it could not
 * be read, so a refresh keeps the view the page already shows for the same answer.
 * Pure: the server-side page imports it. The React context lives in components/PositionTitle.
 */
export type AnswerMapViewRead = Readonly<{ mapView: DebateMapView | null; failed: boolean }>;

export async function readAnswerMapView(
  client: Pick<ContractClient, "readAnswerMapView">,
  answer: Pick<Answer, "answer_id">
): Promise<AnswerMapViewRead> {
  try {
    return { mapView: await client.readAnswerMapView(answer.answer_id), failed: false };
  } catch (failure) {
    return { mapView: null, failed: !(failure instanceof ContractHttpError && failure.code === "NOT_FOUND") };
  }
}

/** The two members of an answer's (owner) or a snapshot's (public) node a title needs. */
export type PositionTitleNode = Readonly<{ node_id: string; maker_lineage: Readonly<{ model_id: string }> | null }>;

/**
 * "The case for {answer}, argued by {ai}" for each opening position the view names. It uses
 * `storyCatalog`, the QUESTION's `public` catalogue, because the answer is written in the
 * question's language and the label must match it. The AI is the model family name the page
 * already shows. A position whose node the page does not hold, or whose AI is not known, gets
 * no title and keeps today's heading.
 */
export function positionTitlesFrom(
  view: DebateMapView | null,
  nodes: Iterable<PositionTitleNode>,
  storyCatalog: MessageCatalog,
  composeCatalog: MessageCatalog
): ReadonlyMap<string, string> {
  const titles = new Map<string, string>();
  if (view === null) return titles;
  const byId = new Map<string, PositionTitleNode>();
  for (const node of nodes) byId.set(node.node_id, node);
  for (const position of view.positions) {
    const lineage = byId.get(position.node_id)?.maker_lineage ?? null;
    if (lineage === null) continue;
    titles.set(position.node_id, t(storyCatalog, "public.positionTitle", {
      answer: position.answer,
      ai: modelMeta(lineage.model_id, composeCatalog).name
    }));
  }
  return titles;
}
```

- [ ] **Step 4: Read it in the served bundle (`apps/ui/lib/api.ts`)**

4a. After `import { readAnswerFloor, type AnswerFloorRead } from "./v3/floorAnswer.js";`, add:

```ts
import { readAnswerMapView, type AnswerMapViewRead } from "./v3/mapView.js";
```

4b. In `DebateBundle`, change the served member to:

```ts
  | { kind: "served"; answer: Answer; detail: DebateDetail; run: null; questionLanguage: ArgumentLanguage | null; floorRead: AnswerFloorRead; mapViewRead?: AnswerMapViewRead }
```

The field is optional so that test doubles building served bundles by hand keep their meaning. The page treats an absent one as a failed read.

4c. Replace `servedDebateBundle` with:

```ts
async function servedDebateBundle(
  answer: Answer,
  catalog: MessageCatalog,
  run: RunProjection | null,
  client: Pick<ContractClient, "readAnswerDisclosure" | "readAnswerMapView">
): Promise<DebateBundle> {
  // The floor and the map view (debate shape P2c) both need only the answer: one round trip.
  const [floorRead, mapViewRead] = await Promise.all([readAnswerFloor(client, answer), readAnswerMapView(client, answer)]);
  return {
    kind: "served",
    answer,
    detail: debateDetailFromAnswer(answer, catalog),
    run: null,
    questionLanguage: run?.argument_language ?? null,
    floorRead,
    mapViewRead
  };
}
```

- [ ] **Step 5: Read it on the server page's first render (`apps/ui/lib/serverApi.ts`)**

5a. Add `type DebateMapView,` to the `@debateai/contract` import (after `type ContractClient,`). After `import { readAnswerFloor } from "./v3/floorAnswer.js";`, add:

```ts
import { readAnswerMapView } from "./v3/mapView.js";
```

5b. Change the ok member of `GetDebateServerResult` to:

```ts
  | { ok: true; debate: DebateDetail; answer: Answer; questionLanguage: ArgumentLanguage | null; floor: AnswerFloor | null; mapView: DebateMapView | null }
```

5c. Replace the final `Promise.all` and return of `getDebateServer` with:

```ts
  // The question's language, a components-only answer's floor (spec 2026-09-26 §14.4.4) and
  // the map view (debate shape P2c) are read side by side: all need only the answer. None of
  // them can fail the page.
  const [questionLanguage, floorRead, mapViewRead] = await Promise.all([
    readQuestionLanguage(resolvedClient, answer.run_ref),
    readAnswerFloor(resolvedClient, answer),
    readAnswerMapView(resolvedClient, answer)
  ]);
  return {
    ok: true,
    debate: debateDetailFromAnswer(answer, catalog),
    answer,
    questionLanguage,
    floor: floorRead.floor,
    mapView: mapViewRead.mapView
  };
```

- [ ] **Step 6: Run the tests**

Run each, one at a time:
- `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-map-view-ui.test.ts` → PASS (5).
- `pnpm exec vitest run tests/unit/m6-floor-answer.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add apps/ui/lib/v3/mapView.ts apps/ui/lib/api.ts apps/ui/lib/serverApi.ts tests/unit/debate-shape-map-view-ui.test.ts
git commit -m "$(cat <<'EOF'
Debate page data: read the map view beside the answer (debate shape P2c)

readAnswerMapView (404 = none, other failures = could not read) rides the
served bundle and the first render; positionTitlesFrom words "The case for
{answer}, argued by {ai}" in the question's catalogue.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Debate page — "Also raised, not debated" and position titles

**Files:**
- Create: `apps/ui/components/PositionTitle.tsx`
- Create: `apps/ui/components/AlsoRaisedList.tsx`
- Modify: `apps/ui/components/DebateCanvas.tsx`
- Modify: `apps/ui/components/DebateThread.tsx`
- Modify: `apps/ui/app/debate/[id]/DebatePageClient.tsx`
- Modify: `apps/ui/app/debate/[id]/DebatePageGate.tsx`
- Modify: `apps/ui/app/debate/[id]/page.tsx`
- Modify: `apps/ui/components/PublicDebateOverview.tsx`
- Modify: `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`
- Modify: `apps/ui/messages/en/public.json`
- Modify: `apps/ui/lib/i18n/public.test.mjs`
- Modify: `apps/ui/app/globals.css`
- Test: `tests/render/debate-shape-also-raised.test.tsx` (new)

**Interfaces:**
- `<AlsoRaisedList view catalog locale />` renders nothing when `view` is null or undefined.
- `PositionTitlesContext` carries `{ locale, byNodeId }`.
- `<PositionTitle nodeId />` renders nothing when the node has no title.
- `DebatePageClient` gets `initialMapView?` and `publicMapView?`, and `DebatePageGate` gets `initialMapView?`.
- New English keys: `public.alsoRaised.title`, `public.alsoRaised.empty`, `public.positionTitle` (option 1 from Wording picks).

- [ ] **Step 1: Write the failing render test**

Create `tests/render/debate-shape-also-raised.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema, type DebateMapView, type RunEvent } from "@debateai/contract";

/**
 * Debate shape P2c (spec 2026-10-12 §3.3 step 8, ruling S2): the debate page lists what was raised
 * but not debated, and titles each opening position "The case for …, argued by …". Both are in the
 * question's language (the `public` catalogue of the story locale), and never say who raised a
 * point or how many did.
 */

const mocks = vi.hoisted(() => ({
  readAnswerStory: vi.fn(),
  readRun: vi.fn(),
  readRunAnswer: vi.fn(),
  readAnswer: vi.fn(),
  emit: null as null | ((event: RunEvent) => void),
  streamEvents: vi.fn(),
  readEvents: vi.fn(),
  readLedgerDigest: vi.fn(),
  readRunVisibility: vi.fn()
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/api.js")>();
  // The refresh's read client has no readAnswerMapView: every refresh is a FAILED map read.
  const readClient = { readRun: mocks.readRun, readRunAnswer: mocks.readRunAnswer, readAnswer: mocks.readAnswer };
  return {
    ...actual,
    COOKIE_SESSION_MARKER: "cookie-session",
    validateSession: vi.fn().mockResolvedValue(undefined),
    contractClient: {
      readSession: vi.fn(async () => ({
        asker_id: "owner:33333333-3333-4333-8333-333333333333", session_id: "22222222-2222-4222-8222-222222222222",
        caller_scope: "ASKER", ownership_provenance: "server_session", provisional_identity_model: false
      })),
      readAnswerStory: mocks.readAnswerStory,
      streamEvents: mocks.streamEvents,
      readEvents: mocks.readEvents,
      readLedgerDigest: mocks.readLedgerDigest,
      readRunVisibility: mocks.readRunVisibility
    },
    getDebateBundle: (id: string, token: string, _client?: unknown, options?: unknown) =>
      actual.getDebateBundle(id, token, readClient as never, options as never)
  };
});
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => ReactNode }) => children("t".repeat(43))
}));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>
}));

import DebatePageClient from "../../apps/ui/app/debate/[id]/DebatePageClient.js";
import { PublicDebateOverview } from "../../apps/ui/components/PublicDebateOverview.js";
import { debateDetailFromAnswer } from "../../apps/ui/lib/v3/adapter.js";
import { STORY_FIXTURE_ANSWER, STORY_FIXTURE_DEBATE_ID, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import { modelMeta } from "../../apps/ui/lib/models.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };
import composeEnglish from "../../apps/ui/messages/en/compose.json" with { type: "json" };

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const RUN_REF = STORY_FIXTURE_ANSWER.run_ref;
const VIEW: DebateMapView = {
  positions: [{ node_id: "n-hybrid", answer: "Mutați-vă treptat" }, { node_id: "n-yes", answer: "Da, acum" }],
  also_raised: ["Merită întrebată școala despre mutarea la mijlocul anului.", "Chiria poate crește după un an."]
};
/** A stand-in for the question's catalogue: the English one with recognisable words for the three new keys. */
const QUESTION_WORDS: Record<string, string> = {
  ...publicEnglish,
  "public.alsoRaised.title": "RO Also raised",
  "public.alsoRaised.empty": "RO Every point was debated.",
  "public.positionTitle": "RO Pentru {answer}, susținut de {ai}"
};
const PUBLIC_BASE = {
  public_ref: "22222222-2222-4222-8222-222222222222",
  author_pseudonym: "Stable Public Author",
  question: "Ar trebui să ne mutăm cu familia la Cluj?",
  published_at: "2026-10-12T10:00:00.000Z",
  answer: {
    terminal: "SERVED", verdict: "CONTESTED", verdict_available: true, confidence_band: "CAPPED",
    summary_segments: [{ text: "Mutați-vă treptat." }], badges: [], residual_objections: [],
    reversal_point: "O locuință mai ieftină în Cluj.", as_of: "2026-10-12T09:00:00.000Z"
  }
} as const;

function nameOf(nodeId: string): string {
  const lineage = STORY_FIXTURE_ANSWER.nodes.find((node) => node.node_id === nodeId)?.maker_lineage;
  return modelMeta(lineage!.model_id, composeEnglish).name;
}

let root: Root | null = null;

async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
  });
}

async function mount(element: ReactElement): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  await flush();
  return container;
}

function overview(mapView: DebateMapView | undefined): ReactElement {
  const debate = PublicDebateSchema.parse(mapView === undefined ? PUBLIC_BASE : { ...PUBLIC_BASE, map_view: mapView });
  return (
    <PublicDebateOverview debate={debate} catalog={publicEnglish} storyCatalog={QUESTION_WORDS} storyLocale="ro"
      onDetails={() => undefined} onRead={() => undefined} />
  );
}

function owner(initialMapView: DebateMapView | null): ReactElement {
  return (
    <DebatePageClient
      id={STORY_FIXTURE_DEBATE_ID}
      initialDebate={debateDetailFromAnswer(STORY_FIXTURE_ANSWER)}
      initialAnswer={STORY_FIXTURE_ANSWER}
      timeCatalog={{}}
      questionLocale="ro"
      storyLocale="ro"
      storyCatalog={QUESTION_WORDS}
      initialMapView={initialMapView}
    />
  );
}

function titlesIn(container: HTMLElement): string[] {
  return [...new Set([...container.querySelectorAll(".positionTitle")].map((title) => title.textContent ?? ""))];
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  mocks.emit = null;
  mocks.readAnswerStory.mockReset().mockResolvedValue(storyFixture("READY"));
  mocks.readRun.mockReset().mockResolvedValue({
    run_ref: RUN_REF, question_line: STORY_FIXTURE_ANSWER.question_line, state: "SETTLED",
    terminal_reason: null, hold_until: null, argument_language: null
  });
  mocks.readRunAnswer.mockReset().mockResolvedValue(STORY_FIXTURE_ANSWER);
  mocks.readAnswer.mockReset();
  mocks.readEvents.mockReset().mockResolvedValue([]);
  mocks.readLedgerDigest.mockReset().mockRejectedValue(new Error("not needed by this render test"));
  mocks.readRunVisibility.mockReset().mockResolvedValue({ state: "PRIVATE", public_ref: null });
  mocks.streamEvents.mockReset().mockImplementation(async (_runRef: string, emit: (event: RunEvent) => void) => {
    mocks.emit = emit;
    await new Promise<void>(() => {});
  });
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("debate shape P2c — the public overview's also-raised list", () => {
  it("lists what was raised but not debated, in the question's language, with only the claims", async () => {
    const container = await mount(overview(VIEW));
    const section = container.querySelector<HTMLElement>("section.alsoRaised");
    expect(section?.getAttribute("lang")).toBe("ro");
    expect(section?.querySelector(".alsoRaisedTitle")?.textContent).toBe("RO Also raised");
    expect([...section!.querySelectorAll(".alsoRaisedItem")].map((item) => item.textContent)).toEqual(VIEW.also_raised);
    for (const forbidden of ["OpenAI", "Anthropic", "xAI", "raised by", "raised_by", "P1"]) {
      expect(section!.textContent).not.toContain(forbidden);
    }
  });

  it("says every point was debated when nothing was left over", async () => {
    const container = await mount(overview({ positions: [], also_raised: [] }));
    expect(container.querySelector(".alsoRaisedEmpty")?.textContent).toBe("RO Every point was debated.");
    expect(container.querySelector(".alsoRaisedItem")).toBeNull();
  });

  it("shows nothing for a snapshot without a map", async () => {
    const container = await mount(overview(undefined));
    expect(container.querySelector(".alsoRaised")).toBeNull();
  });
});

describe("debate shape P2c — the owner's debate page", () => {
  it("titles each position in the question's language, and only the positions the view names", async () => {
    const container = await mount(owner(VIEW));
    expect(titlesIn(container).sort()).toEqual([
      `RO Pentru Da, acum, susținut de ${nameOf("n-yes")}`,
      `RO Pentru Mutați-vă treptat, susținut de ${nameOf("n-hybrid")}`
    ].sort());
    for (const title of container.querySelectorAll(".positionTitle")) expect(title.getAttribute("lang")).toBe("ro");
  });

  it("keeps the titles when a refresh cannot read the map", async () => {
    const container = await mount(owner(VIEW));
    expect(mocks.emit).not.toBeNull();
    await act(async () => mocks.emit!({
      event_id: "event:terminal", event_type: "run.terminal", run_ref: RUN_REF, at_sequence: 1, payload: { state: "SERVED" }
    }));
    await flush();
    await flush();
    expect(mocks.readRunAnswer).toHaveBeenCalled();
    expect(titlesIn(container)).toHaveLength(2);
    expect(container.querySelectorAll("section.alsoRaised .alsoRaisedItem")).toHaveLength(2);
  });

  it("lists the also-raised points on the owner's page too, and nothing without a map", async () => {
    const withMap = await mount(owner(VIEW));
    expect([...withMap.querySelectorAll(".alsoRaisedItem")].map((item) => item.textContent)).toEqual(VIEW.also_raised);
    await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    const without = await mount(owner(null));
    expect(without.querySelector(".alsoRaised")).toBeNull();
    expect(without.querySelector(".positionTitle")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/render/debate-shape-also-raised.test.tsx`
Expected: FAIL. There is no `section.alsoRaised` and no `.positionTitle`.

- [ ] **Step 3: Create `apps/ui/components/PositionTitle.tsx`**

```tsx
"use client";

import { createContext, useContext } from "react";
import { localeDirection } from "@/lib/i18n/questionLocale";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8, ruling S2): each opening position is titled
 * "The case for {answer}, argued by {ai}" in the question's language. The page builds the
 * titles once (`positionTitlesFrom`, lib/v3/mapView.ts) and hands them down by context, so
 * every view titles a position the same way without carrying a catalogue of its own. A node
 * without a title keeps today's heading.
 */
export type PositionTitles = Readonly<{ locale: string; byNodeId: ReadonlyMap<string, string> }>;

export const NO_POSITION_TITLES: PositionTitles = Object.freeze({ locale: "en", byNodeId: new Map<string, string>() });

export const PositionTitlesContext = createContext<PositionTitles>(NO_POSITION_TITLES);

export function PositionTitle({ nodeId }: { nodeId: string }) {
  const titles = useContext(PositionTitlesContext);
  const title = titles.byNodeId.get(nodeId);
  if (title === undefined) return null;
  return (
    <p className="positionTitle" lang={titles.locale} dir={localeDirection(titles.locale)} data-ai-generated="true">
      {title}
    </p>
  );
}
```

- [ ] **Step 4: Create `apps/ui/components/AlsoRaisedList.tsx`**

```tsx
import type { DebateMapView } from "@debateai/contract";
import { localeDirection } from "@/lib/i18n/questionLocale";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8): "Also raised, not debated" lists the map's
 * points that no answer argued.
 * - The words are in the question's language: `catalog` is the `public` catalogue of `locale`,
 *   the story's.
 * - Only the claims are shown, never who raised them, how many did, or any mark.
 * - With no map (a run without the new shape, or a map that chose nothing), nothing is shown.
 */
export function AlsoRaisedList({
  view,
  catalog,
  locale
}: {
  view: DebateMapView | null | undefined;
  catalog: MessageCatalog;
  locale: string;
}) {
  if (view === null || view === undefined) return null;
  return (
    <section className="alsoRaised" aria-labelledby="also-raised-title" lang={locale} dir={localeDirection(locale)} data-ai-generated="true">
      <h2 id="also-raised-title" className="alsoRaisedTitle">{t(catalog, "public.alsoRaised.title")}</h2>
      {view.also_raised.length === 0 ? (
        <p className="alsoRaisedEmpty">{t(catalog, "public.alsoRaised.empty")}</p>
      ) : (
        <ul className="alsoRaisedList">
          {view.also_raised.map((claim, index) => (
            <li key={`${String(index)}:${claim}`} className="alsoRaisedItem">{claim}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Render the title in the two node views**

5a. `apps/ui/components/DebateCanvas.tsx`: after `import { ModelMetaLine } from "@/components/ModelPresentation";`, add `import { PositionTitle } from "@/components/PositionTitle";`. Then replace

```tsx
              ) : null}
            </div>
            <div className="nodeScoreRow">
```

with

```tsx
              ) : null}
            </div>
            <PositionTitle nodeId={node.id} />
            <div className="nodeScoreRow">
```

The canvas packs cards by their measured heights (`heights[node.id]`), so the extra line moves its neighbours down.

5b. `apps/ui/components/DebateThread.tsx`: after `import { ReferenceAuthorPill, ReferenceReviewLine, ReferenceScoreBadges } from "@/components/ReferenceNodeMeta";`, add `import { PositionTitle } from "@/components/PositionTitle";`. Then replace

```tsx
            <ReferenceAuthorPill node={node} miscCatalog={miscCatalog} composeCatalog={composeCatalog} />
          </div>
          <ReferenceReviewLine review={v3Node?.review} miscCatalog={miscCatalog} composeCatalog={composeCatalog} />
```

with

```tsx
            <ReferenceAuthorPill node={node} miscCatalog={miscCatalog} composeCatalog={composeCatalog} />
          </div>
          <PositionTitle nodeId={node.id} />
          <ReferenceReviewLine review={v3Node?.review} miscCatalog={miscCatalog} composeCatalog={composeCatalog} />
```

- [ ] **Step 6: Wire `apps/ui/app/debate/[id]/DebatePageClient.tsx`**

6a. In the `@debateai/contract` import (lines 25–33), add `type DebateMapView,` after `type AnswerFloor,`. After `import { Toast } from "@/components/Toast";`, add:

```ts
import { AlsoRaisedList } from "@/components/AlsoRaisedList";
import { PositionTitlesContext, type PositionTitles } from "@/components/PositionTitle";
import { positionTitlesFrom } from "@/lib/v3/mapView";
```

6b. In the props destructuring, replace

```ts
  initialFloor = null,
  publicFloor = null
}: {
```

with

```ts
  initialFloor = null,
  publicFloor = null,
  initialMapView = null,
  publicMapView = null
}: {
```

6c. In the props type, replace

```ts
  publicFloor?: ResolvedFloor | null;
}) {
```

with

```ts
  publicFloor?: ResolvedFloor | null;
  /**
   * Debate shape P2c (spec 2026-10-12 §3.3 step 8): the owner's map view, from the server's
   * read beside the answer. The page's own refreshes read it again with the answer.
   */
  initialMapView?: DebateMapView | null;
  /** Public mode: the snapshot's map view. The public page reads nothing else. */
  publicMapView?: DebateMapView | null;
}) {
```

6d. After `const [floor, setFloor] = useState<AnswerFloor | null>(initialFloor);`, add:

```ts
  const [mapView, setMapView] = useState<DebateMapView | null>(initialMapView);
```

6e. In `refresh`, after `setFloor((current) => (floorRead.failed && sameAnswer ? current : floorRead.floor));`, add:

```ts
        // Debate shape P2c: the map view is read with the answer too. A failed read, or a bundle
        // without one, keeps the view the page shows for this same answer version.
        const mapViewRead = bundle.mapViewRead;
        setMapView((current) => (mapViewRead === undefined || mapViewRead.failed
          ? (sameAnswer ? current : null)
          : mapViewRead.mapView));
```

6f. After the `storyView` `useMemo` (it ends with `[publicMode, answer, story, storyLocaleReady, id, storyLocale, resolvedFloor]\n  );`), add:

```ts
  // Debate shape P2c (ruling S2): "The case for {answer}, argued by {ai}" for each opening
  // position, in the question's language (`storyCatalog`), as the story strip speaks it.
  const shownMapView = publicMode ? publicMapView : mapView;
  const positionTitles = useMemo<PositionTitles>(() => ({
    locale: storyLocale,
    byNodeId: positionTitlesFrom(
      shownMapView,
      publicMode ? [...(publicNodesById?.values() ?? [])] : answer?.nodes ?? [],
      storyCatalog,
      composeCatalog
    )
  }), [shownMapView, publicMode, publicNodesById, answer, storyCatalog, storyLocale, composeCatalog]);
```

6g. Replace

```tsx
      {storyView === null ? null : <StoryPanel view={storyView} catalog={storyCatalog} locale={storyLocale} />}
```

with

```tsx
      {storyView === null ? null : <StoryPanel view={storyView} catalog={storyCatalog} locale={storyLocale} />}

      {/* ---- also raised, not debated (owner; the public page shows it in its overview) ---- */}
      {publicMode ? null : <AlsoRaisedList view={mapView} catalog={storyCatalog} locale={storyLocale} />}
```

6h. Wrap the component's main return in the provider. Replace the start

```tsx
  return (
    <div
      className="debateView"
```

with

```tsx
  return (
    <PositionTitlesContext.Provider value={positionTitles}>
    <div
      className="debateView"
```

Then replace its end, the only place this text occurs:

```tsx
          </span>
        </div>
      )}
    </div>
  );
}

function formatDebugValue(
```

with

```tsx
          </span>
        </div>
      )}
    </div>
    </PositionTitlesContext.Provider>
  );
}

function formatDebugValue(
```

- [ ] **Step 7: Pass the view in from the server page and the gate**

7a. `apps/ui/app/debate/[id]/DebatePageGate.tsx`:
- Change line 3 to `import type { Answer, AnswerFloor, DebateMapView } from "@debateai/contract";`.
- Add `initialMapView = null` after `initialFloor` in the destructuring.
- Add `/** Debate shape P2c: the map view, from the server's read beside the answer; null when none was read. */\n  initialMapView?: DebateMapView | null;` after `initialFloor: AnswerFloor | null;` in the type.
- Add `initialMapView={initialMapView}` after `initialFloor={initialFloor}` in the JSX.

7b. `apps/ui/app/debate/[id]/page.tsx`:
- Change line 3 to `import type { Answer, AnswerFloor, DebateMapView } from "@debateai/contract";`.
- After `let initialFloor: AnswerFloor | null = null;`, add `let initialMapView: DebateMapView | null = null;`.
- In the `if (result.ok) {` branch, after `initialFloor = result.floor;`, add `initialMapView = result.mapView ?? null;`.
- In the second (final) `<DebatePageGate … />`, after `initialFloor={initialFloor}`, add `initialMapView={initialMapView}`.
- In the `starting` branch's gate, after `initialFloor={null}`, add `initialMapView={null}`.

- [ ] **Step 8: The public page**

8a. `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`: after `publicFloor={publicFloor}`, add `publicMapView={debate.map_view ?? null}`.

8b. `apps/ui/components/PublicDebateOverview.tsx`: after `import { FloorAnswer } from "@/components/FloorAnswer";`, add `import { AlsoRaisedList } from "@/components/AlsoRaisedList";`. Then replace

```tsx
          <ArgumentCard argument={presentation.strongestCon} catalog={catalog} composeCatalog={composeCatalog} side="con" onRead={onRead} />
        </section>
```

with

```tsx
          <ArgumentCard argument={presentation.strongestCon} catalog={catalog} composeCatalog={composeCatalog} side="con" onRead={onRead} />
        </section>

        {/* Debate shape P2c: what came up but was not debated, in the question's language. */}
        <AlsoRaisedList view={debate.map_view} catalog={storyCatalog} locale={storyLocale} />
```

- [ ] **Step 9: English words, the public catalogue's source list, styles**

9a. `apps/ui/messages/en/public.json`: after `  "public.story.pathsListName": "Positions the debate explored",`, insert:

```json
  "public.alsoRaised.title": "Also raised, not debated",
  "public.alsoRaised.empty": "Every point that came up was debated.",
  "public.positionTitle": "The case for {answer}, argued by {ai}",
```

9b. `apps/ui/lib/i18n/public.test.mjs`: in `sourcePaths`, replace

```js
  "lib/v3/floorAnswer.ts"
];
```

with

```js
  "lib/v3/floorAnswer.ts",
  // Debate shape P2c: "Also raised, not debated" and the position titles, `public.alsoRaised.*` and
  // `public.positionTitle`, in the QUESTION's `public` catalogue.
  "components/AlsoRaisedList.tsx",
  "lib/v3/mapView.ts"
];
```

9c. `apps/ui/app/globals.css`: append at the end of the file:

```css
/* Debate shape P2c (spec 2026-10-12 §3.3 step 8): "Also raised, not debated" and the position titles. */
.alsoRaised {
  margin: 16px 0 0;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
  font-family: var(--font-sans);
}
.alsoRaisedTitle {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.alsoRaisedList {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-inline-start: 18px;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text);
}
.alsoRaisedEmpty {
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
}
.positionTitle {
  margin: 6px 0 2px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text);
}
```

- [ ] **Step 10: Run the tests**

Run each, one at a time:
- `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/render/debate-shape-also-raised.test.tsx` → PASS (6).
- `pnpm exec vitest run tests/render/story-debate-page.test.tsx` → PASS.
- `pnpm exec vitest run tests/render/story-public-overview.test.tsx` → PASS.
- `pnpm exec vitest run tests/render/pda-s02-public-page.test.tsx` → PASS.
- `pnpm exec vitest run tests/render/ui02e-debate-canvas.test.tsx` → PASS.
- `cd apps/ui && node --import tsx --test lib/i18n/catalogNamespaces.test.mjs` → PASS.
- `cd apps/ui && node --import tsx --test lib/i18n/public.test.mjs` → expected: "covers every public translation call" and "no hard-coded English" PASS. "all 35 locales carry the exact public contract" FAILS on the three new keys until Task 10 (expected; see Global Constraints).

- [ ] **Step 11: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add apps/ui/components/PositionTitle.tsx apps/ui/components/AlsoRaisedList.tsx apps/ui/components/DebateCanvas.tsx \
  apps/ui/components/DebateThread.tsx "apps/ui/app/debate/[id]/DebatePageClient.tsx" "apps/ui/app/debate/[id]/DebatePageGate.tsx" \
  "apps/ui/app/debate/[id]/page.tsx" apps/ui/components/PublicDebateOverview.tsx "apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx" \
  apps/ui/messages/en/public.json apps/ui/lib/i18n/public.test.mjs apps/ui/app/globals.css tests/render/debate-shape-also-raised.test.tsx
git commit -m "$(cat <<'EOF'
Debate page: also raised, not debated, and position titles (debate shape P2c)

The owner and public pages list the map's points no answer argued, and title
each opening position "The case for {answer}, argued by {ai}", both in the
question's language; a refresh that cannot read the map keeps what is shown.
English words only; the other 34 locales follow in the translation task.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: /new — Depth mode, Depth of scrutiny and Answer length become real

**Gates:** the Project 1 gate and the P2a gate in Global Constraints.
- **Project 1** removes the Concurrency and Branching width controls and rewrites `newDebate.legacyNotice`. This task assumes its version of `NewDebatePageClient.tsx`, `newDebate.json` and `tier01-new-plan-tier.test.tsx`. It touches only the three controls, the notice and Max tokens.
- **Merge with Project 1:** if Project 1 is not yet merged into this branch, stop. Do not cherry-pick or recreate its edits here.
- **P2a** adds `depthMode`, `scrutiny` and `answerLength` to `DepthParamsSchema`.

**Files:**
- Modify: `apps/ui/app/new/NewDebatePageClient.tsx`
- Modify: `apps/ui/app/new/defaults.tsx`
- Modify: `apps/ui/lib/api.ts`
- Delete: `apps/ui/lib/scrutinyDepth.ts`
- Modify: `apps/ui/lib/i18n/compose.test.mjs`
- Modify: `apps/ui/lib/i18n/catalog.test.mjs`
- Modify: `apps/ui/messages/en/newDebate.json`
- Modify: `apps/ui/messages/en/compose.json`
- Modify: `apps/ui/app/globals.css`
- Modify: `tests/render/tier01-new-plan-tier.test.tsx`
- Test: `tests/render/debate-shape-new-controls.test.tsx` (new)
- Test: `tests/unit/debate-shape-new-ask-wire.test.ts` (new)

**Interfaces:**
- `defaults.tsx` exports:
  - the types `DepthMode`, `Scrutiny` and `AnswerLength`, derived from P2a's `DepthParams`;
  - the constants `DEPTH_MODES`, `SCRUTINY_LEVELS` and `ANSWER_LENGTHS`;
  - `fixedDepthAllowedFor(planTier)`.
- `NewDebateAskDefaults` gets the optional fields `depthMode`, `scrutiny` and `answerLength`. The config keys are `depth_mode`, `scrutiny` and `answer_length`.
- `createDebate` puts these into `depth_params.depthMode`, `depth_params.scrutiny` and `depth_params.answerLength`.

- [ ] **Step 1: Write the failing wire test**

Create `tests/unit/debate-shape-new-ask-wire.test.ts`:

```ts
import type { AskRequest, ContractClient } from "@debateai/contract";
import { describe, expect, it } from "vitest";

// @ts-expect-error -- the root test compiler has no JSX mode; Vitest transpiles this TSX module.
import { buildNewDebateAskConfig, fixedDepthAllowedFor } from "../../apps/ui/app/new/defaults.js";
import { createDebate } from "../../apps/ui/lib/api.js";

/**
 * Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8): the page's three choices travel in the
 * ask, inside depth_params, as INTERFACE §2 names them. A config without them sends today's ask.
 */

const SUBMIT_TIME = new Date("2026-10-12T10:00:00.000Z");
const BASE = {
  riskTier: "standard", budgetTier: "low", decisionScope: "shape wire", asOf: "2026-10-12T09:00:00.000Z",
  depth: 2, asOfWasEdited: false, planTier: "premium"
} as const;

function capturingClient(): { client: ContractClient; asks: AskRequest[] } {
  const asks: AskRequest[] = [];
  const client = { submitAsk: async (ask: AskRequest) => { asks.push(ask); return { run_ref: "run:shape", status: "QUEUED" }; } };
  return { client: client as unknown as ContractClient, asks };
}

describe("debate shape P2c — the ask carries depth mode, scrutiny and answer length", () => {
  it("puts the chosen values in the config under snake-case keys, and nothing when none was chosen", () => {
    expect(buildNewDebateAskConfig({ ...BASE, depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" }, SUBMIT_TIME))
      .toMatchObject({ depth: 2, depth_mode: "fixed", scrutiny: "deep", answer_length: "detailed" });
    const plain = buildNewDebateAskConfig(BASE, SUBMIT_TIME);
    for (const key of ["depth_mode", "scrutiny", "answer_length"]) expect(plain).not.toHaveProperty(key);
  });

  it("puts depth mode, scrutiny and answer length into depth_params on the wire", async () => {
    const { client, asks } = capturingClient();
    const config = buildNewDebateAskConfig({ ...BASE, depthMode: "fixed", scrutiny: "exhaustive", answerLength: "short" }, SUBMIT_TIME);
    await createDebate("Should the city fund the tram?", config, "test-token", client);
    expect(asks[0]?.depth_params).toEqual({ depth: 2, depthMode: "fixed", scrutiny: "exhaustive", answerLength: "short" });
  });

  it("sends today's depth_params when the config carries none of them (older callers)", async () => {
    const { client, asks } = capturingClient();
    await createDebate("Should the city fund the tram?", buildNewDebateAskConfig(BASE, SUBMIT_TIME), "test-token", client);
    expect(asks[0]?.depth_params).toEqual({ depth: 2 });
  });

  it("refuses a value the contract does not offer, before any network call", async () => {
    const { client, asks } = capturingClient();
    const config = { ...buildNewDebateAskConfig(BASE, SUBMIT_TIME), scrutiny: "infinite" };
    await expect(createDebate("Should we?", config, "test-token", client)).rejects.toThrow("ASK_FIELD_REQUIRED: scrutiny");
    const retired = { ...buildNewDebateAskConfig(BASE, SUBMIT_TIME), depth_mode: "recommended" };
    await expect(createDebate("Should we?", retired, "test-token", client)).rejects.toThrow("ASK_FIELD_REQUIRED: depth_mode");
    expect(asks).toEqual([]);
  });

  it("offers Fixed only where the plan allows it (S6)", () => {
    expect(fixedDepthAllowedFor("free")).toBe(false);
    expect(fixedDepthAllowedFor("premium")).toBe(true);
  });
});
```

- [ ] **Step 2: Write the failing render test**

Create `tests/render/debate-shape-new-controls.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8): /new's Depth mode, Depth of scrutiny and
 * Answer length are real choices sent with the ask. Fixed and the scrutiny levels are Premium's;
 * Answer length is every plan's. Nothing on the page still says "not sent", and Max tokens is gone.
 */

const mocks = vi.hoisted(() => ({ createDebate: vi.fn(), push: vi.fn(), readSession: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => unknown }) => children("test-token")
}));
vi.mock("@/lib/api", () => ({
  createDebate: mocks.createDebate,
  contractClient: { readSession: mocks.readSession, readSensitiveDataConsent: async () => ({ status: "given" as const }) }
}));

import NewDebatePage from "../../apps/ui/app/new/NewDebatePageClient.js";
import homeCatalog from "../../apps/ui/messages/en/home.json" with { type: "json" };
import chromeCatalog from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import newDebateCatalog from "../../apps/ui/messages/en/newDebate.json" with { type: "json" };

const words = newDebateCatalog as Record<string, string>;

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("debate shape P2c — the /new controls", () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.createDebate.mockReset().mockResolvedValue({ id: "run-shape" });
    mocks.push.mockReset();
    mocks.readSession.mockReset().mockRejectedValue(new Error("session unavailable in render test"));
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  async function renderPage(): Promise<void> {
    await act(async () => root!.render(
      <NewDebatePage catalog={newDebateCatalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog} />
    ));
    await settle();
  }

  async function click(selector: string): Promise<void> {
    await act(async () => document.querySelector<HTMLElement>(selector)!.click());
    await settle();
  }

  async function inputValue(selector: string, value: string): Promise<void> {
    const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
    await act(async () => {
      setter!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
  }

  async function selectValue(selector: string, value: string): Promise<void> {
    const field = document.querySelector<HTMLSelectElement>(selector)!;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    await act(async () => {
      setter!.call(field, value);
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
  }

  async function submitForm(): Promise<void> {
    await act(async () => {
      document.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();
  }

  it("opens on Adaptive, Standard scrutiny and a Standard answer, with no notice and no Max tokens", async () => {
    await renderPage();
    await click(".ndOptionsToggle");
    expect(document.querySelector<HTMLSelectElement>("#depthMode")?.value).toBe("adaptive");
    expect(document.querySelector<HTMLSelectElement>("#scrutinyDepth")?.value).toBe("standard");
    expect(document.querySelector("#answerLength-standard")?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector(".ndLegacyNotice")).toBeNull();
    expect(document.querySelector("#maxTokens")).toBeNull();
    const panel = document.querySelector<HTMLElement>("#additionalRunOptions")!.textContent ?? "";
    expect(panel).not.toMatch(/not sent|Max tokens|Selection strategy|Manual|Recommended/);
  });

  it("offers Fixed only on Premium, and keeps Answer length open on Free (S6, S8)", async () => {
    await renderPage();
    await click(".ndOptionsToggle");
    const fixed = () => document.querySelector<HTMLOptionElement>('#depthMode option[value="fixed"]')!;
    expect([...document.querySelectorAll<HTMLOptionElement>("#depthMode option")].map((option) => option.value))
      .toEqual(["adaptive", "fixed"]);
    expect(fixed().disabled).toBe(true);
    expect(document.querySelector<HTMLSelectElement>("#depthMode")?.disabled).toBe(true);
    expect(document.querySelector<HTMLSelectElement>("#scrutinyDepth")?.disabled).toBe(true);
    expect([...document.querySelectorAll<HTMLButtonElement>('[data-field="answerLength"]')].map((pill) => pill.disabled))
      .toEqual([false, false, false]);
    await click("#planTier-premium");
    expect(fixed().disabled).toBe(false);
    expect(document.querySelector<HTMLSelectElement>("#depthMode")?.disabled).toBe(false);
  });

  it("explains the chosen value under each control", async () => {
    await renderPage();
    await click("#planTier-premium");
    await click(".ndOptionsToggle");
    expect(document.querySelector("#depthMode-hint")?.textContent).toBe(words["newDebate.depthModeAdaptiveHelp"]);
    await selectValue("#depthMode", "fixed");
    expect(document.querySelector("#depthMode-hint")?.textContent).toBe(words["newDebate.depthModeFixedHelp"]);
    await selectValue("#scrutinyDepth", "exhaustive");
    expect(document.querySelector("#scrutinyDepth-hint")?.textContent).toBe(words["newDebate.scrutinyExhaustiveHelp"]);
    expect(document.querySelector("#answerLength-hint")?.textContent).toBe(words["newDebate.answerLengthHint"]);
  });

  it("sends Premium's choices with the ask", async () => {
    await renderPage();
    await inputValue("#topic", "Should the city fund the tram extension?");
    await click("#planTier-premium");
    await click(".ndOptionsToggle");
    await selectValue("#depthMode", "fixed");
    await selectValue("#scrutinyDepth", "deep");
    await click("#answerLength-detailed");
    await submitForm();
    expect(mocks.createDebate).toHaveBeenCalledTimes(1);
    expect(mocks.createDebate.mock.calls[0]?.[1]).toMatchObject({
      plan_tier: "premium", depth_mode: "fixed", scrutiny: "deep", answer_length: "detailed"
    });
  });

  it("sends Free's fixed gauges and the answer length Free chose, even after Premium choices", async () => {
    await renderPage();
    await inputValue("#topic", "Should the city fund the tram extension?");
    await click("#planTier-premium");
    await click(".ndOptionsToggle");
    await selectValue("#depthMode", "fixed");
    await selectValue("#scrutinyDepth", "exhaustive");
    await click("#answerLength-short");
    await click("#planTier-free");
    await submitForm();
    expect(mocks.createDebate.mock.calls[0]?.[1]).toMatchObject({
      plan_tier: "free", depth_mode: "adaptive", scrutiny: "standard", answer_length: "short"
    });
  });
});
```

- [ ] **Step 3: Run both to see them fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-new-ask-wire.test.ts`
Expected: FAIL. `fixedDepthAllowedFor` is not a function, and `depth_mode` is missing.
Then run: `pnpm exec vitest run tests/render/debate-shape-new-controls.test.tsx`
Expected: FAIL. The depth mode is `fixed`, and `#answerLength-standard` does not exist.

- [ ] **Step 4: `apps/ui/app/new/defaults.tsx`**

4a. Change line 1 to `import type { DepthParams, Deployment, PlanTier, Session } from "@debateai/contract";`.

4b. After `export const PROVISIONAL_COMPOSITION_BUDGET_DEFAULT = "low" as const;`, add:

```ts
/*
 * Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8): the three choices the ask carries in
 * depth_params, typed by the contract (P2a) so the page never restates them. The API normalises
 * each one per plan again; the page only keeps itself honest.
 */
export type DepthMode = NonNullable<DepthParams["depthMode"]>;
export type Scrutiny = NonNullable<DepthParams["scrutiny"]>;
export type AnswerLength = NonNullable<DepthParams["answerLength"]>;
export const DEPTH_MODES: readonly DepthMode[] = ["adaptive", "fixed"];
export const SCRUTINY_LEVELS: readonly Scrutiny[] = ["standard", "deep", "exhaustive"];
export const ANSWER_LENGTHS: readonly AnswerLength[] = ["short", "standard", "detailed"];

/** S6: Fixed is offered on Premium; Free is adaptive (its depth ceiling 2). */
export function fixedDepthAllowedFor(planTier: PlanTier): boolean {
  return planTier !== "free";
}
```

4c. In `NewDebateAskDefaults`, after `readonly modelStrength?: ModelStrength | null;`, add:

```ts
  /** Debate shape P2c: absent sends nothing, so the API's default applies and older callers keep working. */
  readonly depthMode?: DepthMode;
  readonly scrutiny?: Scrutiny;
  readonly answerLength?: AnswerLength;
```

4d. In `buildNewDebateAskConfig`'s returned object, replace

```ts
      ...(defaults.modelStrength === undefined || defaults.modelStrength === null
        ? {}
        : { model_strength: defaults.modelStrength })
    };
```

with

```ts
      ...(defaults.modelStrength === undefined || defaults.modelStrength === null
        ? {}
        : { model_strength: defaults.modelStrength }),
      ...(defaults.depthMode === undefined ? {} : { depth_mode: defaults.depthMode }),
      ...(defaults.scrutiny === undefined ? {} : { scrutiny: defaults.scrutiny }),
      ...(defaults.answerLength === undefined ? {} : { answer_length: defaults.answerLength })
    };
```

- [ ] **Step 5: `apps/ui/lib/api.ts` puts them on the wire**

5a. In the `@debateai/contract` import (lines 1–10), add `DepthParamsSchema,` after `createContractClient,` and `type DepthParams,` after `type ContractClient,`.

5b. After `optionalModelStrength`, add:

```ts
/**
 * Debate shape P2c (spec 2026-10-12 §3.2): depth mode, scrutiny and answer length ride beside
 * the depth in `depth_params`, each only when the page chose it. A missing one means the API's
 * default, so older callers keep working. The contract's own field schema decides what is
 * valid, so the page never restates the choices.
 */
function optionalDepthChoice<K extends "depthMode" | "scrutiny" | "answerLength">(
  config: AskConfig,
  configKey: "depth_mode" | "scrutiny" | "answer_length",
  key: K
): Partial<Pick<DepthParams, K>> {
  const value = config[configKey];
  if (value === undefined || value === null) return {};
  const parsed = DepthParamsSchema.shape[key].safeParse(value);
  if (!parsed.success || parsed.data === undefined) {
    throw new Error(`ASK_FIELD_REQUIRED: ${configKey} must be one of the offered choices when supplied.`);
  }
  return { [key]: parsed.data } as Partial<Pick<DepthParams, K>>;
}
```

5c. In `createDebate`, replace `    depth_params: { depth: requiredInteger(config, "depth", 0) },` with:

```ts
    depth_params: {
      depth: requiredInteger(config, "depth", 0),
      ...optionalDepthChoice(config, "depth_mode", "depthMode"),
      ...optionalDepthChoice(config, "scrutiny", "scrutiny"),
      ...optionalDepthChoice(config, "answer_length", "answerLength")
    },
```

- [ ] **Step 6: `apps/ui/app/new/NewDebatePageClient.tsx` (Project 1's version)**

6a. Delete the line `import { SCRUTINY_DEPTHS, ScrutinyDepth } from "@/lib/scrutinyDepth";`. In the `./defaults` import, add `ANSWER_LENGTHS,` `DEPTH_MODES,` `SCRUTINY_LEVELS,` `fixedDepthAllowedFor,` `type AnswerLength,` `type DepthMode,` `type Scrutiny,` beside the existing names.

6b. Replace

```ts
type AdaptiveDepthMode = "fixed" | "manual" | "recommended" | "adaptive";

const DEPTH_MODE_OPTIONS: Array<{ value: AdaptiveDepthMode; labelKey: string }> = [
  { value: "fixed", labelKey: "newDebate.fixed" },
  { value: "manual", labelKey: "newDebate.manual" },
  { value: "recommended", labelKey: "newDebate.recommended" },
  { value: "adaptive", labelKey: "newDebate.adaptive" }
];
```

with

```ts
/*
 * Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8): Depth mode, Depth of scrutiny and
 * Answer length are real choices sent with the ask. These tables hold each value's words.
 */
const DEPTH_MODE_WORDS: Readonly<Record<DepthMode, { label: string; help: string }>> = {
  adaptive: { label: "newDebate.adaptive", help: "newDebate.depthModeAdaptiveHelp" },
  fixed: { label: "newDebate.fixed", help: "newDebate.depthModeFixedHelp" }
};
const SCRUTINY_WORDS: Readonly<Record<Scrutiny, { label: string; help: string }>> = {
  standard: { label: "newDebate.scrutinyStandard", help: "newDebate.scrutinyStandardHelp" },
  deep: { label: "newDebate.scrutinyDeep", help: "newDebate.scrutinyDeepHelp" },
  exhaustive: { label: "newDebate.scrutinyExhaustive", help: "newDebate.scrutinyExhaustiveHelp" }
};
const ANSWER_LENGTH_WORDS: Readonly<Record<AnswerLength, string>> = {
  short: "newDebate.answerLengthShort",
  standard: "newDebate.answerLengthStandard",
  detailed: "newDebate.answerLengthDetailed"
};
```

6c. Replace the two state lines

```ts
  const [depthMode, setDepthMode] = useState<AdaptiveDepthMode>("fixed");
  const [scrutiny, setScrutiny] = useState<ScrutinyDepth>("standard");
```

with

```ts
  // S6: Adaptive by default; S7: Standard scrutiny by default.
  const [depthMode, setDepthMode] = useState<DepthMode>("adaptive");
  const [scrutiny, setScrutiny] = useState<Scrutiny>("standard");
```

Replace `  const [maxTokens, setMaxTokens] = useState(800);` with:

```ts
  // S8: Answer length is every plan's choice, so choosing Free never resets it.
  const [answerLength, setAnswerLength] = useState<AnswerLength>("standard");
```

6d. In `choosePlanTier`, replace `    setDepthMode("fixed");` with `    setDepthMode("adaptive");`, and delete the line `    setMaxTokens(800);`.

6e. In the `buildNewDebateAskConfig({ … })` call in `submit`, replace

```ts
        depth,
        asOfWasEdited: false,
```

with

```ts
        depth,
        depthMode,
        scrutiny,
        answerLength,
        asOfWasEdited: false,
```

6f. In the OPTIONS panel, replace everything between the line `            <div id="additionalRunOptions" className="ndCard ndLegacy">` and the line `              <p className="ndProvenance">`. That span is the DR-115 comment, the `ndLegacyNotice` paragraph, both `SelectRow`s, Project 1's comment and the `maxTokens` `SliderRow`. Replace it with:

```tsx
              <SelectRow
                id="depthMode"
                label={t(catalog, "newDebate.depthMode")}
                hint={t(catalog, DEPTH_MODE_WORDS[depthMode].help)}
                value={depthMode}
                disabled={planTier === "free"}
                onChange={(value) => setDepthMode(value as DepthMode)}
                options={DEPTH_MODES.map((mode) => ({
                  value: mode,
                  label: t(catalog, DEPTH_MODE_WORDS[mode].label),
                  // S6: Fixed is offered only where the plan allows it; the API normalises again.
                  disabled: mode === "fixed" && !fixedDepthAllowedFor(planTier)
                }))}
              />
              <SelectRow
                id="scrutinyDepth"
                label={t(catalog, "newDebate.scrutinyDepth")}
                hint={t(catalog, SCRUTINY_WORDS[scrutiny].help)}
                value={scrutiny}
                disabled={planTier === "free"}
                onChange={(value) => setScrutiny(value as Scrutiny)}
                options={SCRUTINY_LEVELS.map((level) => ({ value: level, label: t(catalog, SCRUTINY_WORDS[level].label) }))}
              />
              {/* Parallel calls (owner ruling 2026-10-12): no Branching width and no
                  Concurrency control here. How many calls run at once is an owner-only
                  register setting; how wide a claim branches is the algorithm's choice
                  (one support and one attack reply). */}
              {/* S8: Answer length replaces Max tokens and is every plan's choice, Free's included. */}
              <SegmentedRow
                field="answerLength"
                label={t(catalog, "newDebate.answerLength")}
                hint={t(catalog, "newDebate.answerLengthHint")}
                options={ANSWER_LENGTHS.map((length) => ({ value: length, label: t(catalog, ANSWER_LENGTH_WORDS[length]) }))}
                value={answerLength}
                onChange={(value) => setAnswerLength(value as AnswerLength)}
              />
```

6g. In `SelectRow`, change the `options` prop type (in its props type) to `options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;`. Change its `<option …>` line to:

```tsx
            <option key={option.value} value={option.value} disabled={option.disabled === true}>{option.label}</option>
```

- [ ] **Step 7: Delete the dead scrutiny presets and their guards**

7a. `git rm apps/ui/lib/scrutinyDepth.ts`. Its last importer was the /new page; `adaptiveExpansionBudgetsFor`, `scrutinyDepthOptions` and the `compose.scrutinyDepth.*` keys have had no users since V3.

7b. `apps/ui/messages/en/compose.json`: delete the six lines `"compose.scrutinyDepth.deep.hint"`, `"compose.scrutinyDepth.deep.label"`, `"compose.scrutinyDepth.exhaustive.hint"`, `"compose.scrutinyDepth.exhaustive.label"`, `"compose.scrutinyDepth.standard.hint"` and `"compose.scrutinyDepth.standard.label"`. The other 34 locales follow in Task 10.

7c. `apps/ui/lib/i18n/compose.test.mjs`:
- Remove `  "lib/scrutinyDepth.ts",` from `ownedFiles`.
- In `compose migration preserves budget and recommendation behavior guards`, delete these seven lines, from `  const depth = sources.get("lib/scrutinyDepth.ts");` through `  assert.match(depth, /return \{ max_rounds: \d+, max_per_node: \d+, max_per_debate: \d+ \};\s*\}/);` (the comment lines in between included).
- Rename the test to `compose migration preserves recommendation and adapter behavior guards`.

7d. `apps/ui/lib/i18n/catalog.test.mjs`: replace the whole `test("the Finnish model budget names LLM tokens rather than identifiers", …)` block with:

```js
test("no locale keeps the /new keys retired by debate shape P2c", () => {
  const retired = [
    "newDebate.legacyNotice", "newDebate.selectionStrategy", "newDebate.manual", "newDebate.recommended",
    "newDebate.maxTokens", "newDebate.maxTokensHint", "newDebate.scrutinyStandardHint",
    "newDebate.scrutinyDeepHint", "newDebate.scrutinyExhaustiveHint"
  ];
  for (const { code } of LOCALES) {
    const catalog = readCatalog(code, "newDebate");
    for (const key of retired) assert.equal(Object.hasOwn(catalog, key), false, `${code}/newDebate still has ${key}`);
  }
});
```

7e. `apps/ui/app/globals.css`: delete the `.ndLegacyNotice { … }` rule (8 lines, at about line 6837).

- [ ] **Step 8: English words in `apps/ui/messages/en/newDebate.json`**

Replace every line from `  "newDebate.legacyNotice": …` through `  "newDebate.maxTokensHint": "Per generated argument",`, whatever the notice text now says, with:

```json
  "newDebate.depthMode": "Depth mode",
  "newDebate.depthModeAdaptiveHelp": "Goes deeper only where a point could change the answer.",
  "newDebate.depthModeFixedHelp": "Goes deeper under every point, whether or not it could change the answer.",
  "newDebate.fixed": "Fixed",
  "newDebate.adaptive": "Adaptive",
  "newDebate.scrutinyDepth": "Depth of scrutiny",
  "newDebate.scrutinyStandard": "Standard",
  "newDebate.scrutinyStandardHelp": "The usual checks on every point.",
  "newDebate.scrutinyDeep": "Deep",
  "newDebate.scrutinyDeepHelp": "Extra rounds on the points most in doubt.",
  "newDebate.scrutinyExhaustive": "Exhaustive",
  "newDebate.scrutinyExhaustiveHelp": "The most extra rounds, on more of the points in doubt.",
  "newDebate.answerLength": "Answer length",
  "newDebate.answerLengthHint": "About 300, 700 or 1,500 words: a target, not a hard limit.",
  "newDebate.answerLengthShort": "Short",
  "newDebate.answerLengthStandard": "Standard",
  "newDebate.answerLengthDetailed": "Detailed",
```

That span has nine keys removed (`legacyNotice`, `selectionStrategy`, `manual`, `recommended`, the three `scrutiny*Hint` and the two `maxTokens*`). Ten keys are new. `depthMode`, `fixed`, `adaptive`, `scrutinyDepth`, `scrutinyStandard`, `scrutinyDeep` and `scrutinyExhaustive` keep their values.

- [ ] **Step 9: Update `tests/render/tier01-new-plan-tier.test.tsx` (Project 1's version)**

9a. S01-27: change the title to `"S01-27 R4 locks all twelve controls while Free is chosen, when %s"`. Delete `      "maxTokens"` from `lockedIds`, and remove the trailing comma it leaves after `"scrutinyDepth"`. Change `.toHaveLength(13)` to `.toHaveLength(12)` and `Array.from({ length: 13 }, …)` to `Array.from({ length: 12 }, …)`. Before `expect(document.querySelector('#modelStrength-hint')…`, add:

```ts
    // Debate shape P2c, S8: Answer length is every plan's choice, so Free leaves it open.
    expect([...document.querySelectorAll<HTMLButtonElement>('[data-field="answerLength"]')].every((pill) => !pill.disabled)).toBe(true);
```

9b. S01-28: replace `    ]).toEqual([9, 2, 0, 2]);` with

```ts
    // Debate shape P2c: Max tokens is gone (sliders 2 -> 1); Answer length's pills are open on Free.
    ]).toEqual([9, 1, 0, 2]);
```

9c. S01-29: in its `lockedIds`, change `"depthMode", "scrutinyDepth", "maxTokens"` to `"depthMode", "scrutinyDepth"`.

9d. S01-30: change the title to `"S01-30 R5 / M12 keeps the OPTIONS toggle operable in Free, with no 'not sent' notice"`. Replace

```ts
    expect(document.querySelector('.ndLegacyNotice')?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Depth mode, depth of scrutiny and max tokens are not sent yet: the new engine does not use them."
    );
```

(whatever the notice text) with

```ts
    // Debate shape P2c: the three controls are sent, so the "not sent" notice is gone.
    expect(document.querySelector('.ndLegacyNotice')).toBeNull();
    expect(document.querySelector('#additionalRunOptions')?.textContent).not.toMatch(/not sent/i);
```

9e. In Project 1's `offers no Concurrency or Branching width control in %s`, replace

```ts
    expect([...panel.querySelectorAll('.ndSlider')].map((slider) => slider.id)).toEqual(["maxTokens"]);
```

with

```ts
    // Debate shape P2c: Max tokens became the Answer length pills.
    expect([...panel.querySelectorAll('.ndSlider')].map((slider) => slider.id)).toEqual([]);
    expect(document.querySelector('#answerLength-standard')).not.toBeNull();
```

9f. S01-34:
- Replace `    await selectValue('#depthMode', "adaptive");` with `    await selectValue('#depthMode', "fixed");`.
- Replace `    await inputValue('#maxTokens', "4000");` with `    await click('#answerLength-detailed');`.
- Replace `    expect(document.querySelector<HTMLSelectElement>('#depthMode')?.value).toBe("fixed");` with `    expect(document.querySelector<HTMLSelectElement>('#depthMode')?.value).toBe("adaptive");`.
- Replace the slider grid

```ts
    const sliderGrid = ["treeDepth", "maxTokens"].map((id) => {
```

with `    const sliderGrid = ["treeDepth"].map((id) => {`, and its expected array

```ts
    expect(sliderGrid).toEqual([
      { id: "treeDepth", min: "1", max: "5", step: "1", value: "2" },
      { id: "maxTokens", min: "128", max: "4000", step: "32", value: "800" }
    ]);
```

with

```ts
    expect(sliderGrid).toEqual([
      { id: "treeDepth", min: "1", max: "5", step: "1", value: "2" }
    ]);
    // S8: the answer length the asker chose survives the switch to Free.
    expect(document.querySelector('#answerLength-detailed')?.getAttribute("aria-checked")).toBe("true");
```

- Change the final `.toHaveLength(13);` to `.toHaveLength(12);`.

9g. S01-36: in `gaugeIds`, replace `      "maxTokens"` with `      "answerLength-short",\n      "answerLength-standard",\n      "answerLength-detailed"`.

- [ ] **Step 10: Run the tests (one at a time)**

- `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-new-ask-wire.test.ts` → PASS (5).
- `pnpm exec vitest run tests/render/debate-shape-new-controls.test.tsx` → PASS (5).
- `pnpm exec vitest run tests/render/tier01-new-plan-tier.test.tsx` → PASS.
- `pnpm exec vitest run tests/unit/tier01-ask-wire.test.ts` → PASS.
- `pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx` → PASS.
- `pnpm exec vitest run tests/unit/v2ui-pages.test.ts` → PASS.
- `pnpm exec vitest run tests/unit/tier01-style-contract.test.ts` → PASS.
- `cd apps/ui && node --import tsx --test lib/i18n/compose.test.mjs` → expected: "every compose key used … exists in English" and the guards PASS; the 35-locale compose test FAILS until Task 10.
- `cd apps/ui && node --import tsx --test lib/i18n/catalog.test.mjs` → FAILS on the 34 locales until Task 10 (expected).
- Sweep for leftovers: `grep -rn "scrutinyDepth\.ts\|SCRUTINY_DEPTHS\|adaptiveExpansionBudgetsFor\|AdaptiveDepthMode\|setMaxTokens\|newDebate.legacyNotice\|newDebate.maxTokens\|newDebate.selectionStrategy" apps/ui tests --include='*.ts' --include='*.tsx' --include='*.mjs' | grep -v node_modules`. The only hits allowed are the retired-key list in `catalog.test.mjs` and the "not sent" / retired-id assertions in tests.

- [ ] **Step 11: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add apps/ui/app/new/NewDebatePageClient.tsx apps/ui/app/new/defaults.tsx apps/ui/lib/api.ts apps/ui/lib/i18n/compose.test.mjs \
  apps/ui/lib/i18n/catalog.test.mjs apps/ui/messages/en/newDebate.json apps/ui/messages/en/compose.json apps/ui/app/globals.css \
  tests/render/tier01-new-plan-tier.test.tsx tests/render/debate-shape-new-controls.test.tsx tests/unit/debate-shape-new-ask-wire.test.ts
git commit -m "$(cat <<'EOF'
New debate: depth mode, scrutiny and answer length are real (debate shape P2c)

The three /new controls are sent in depth_params (Adaptive and Standard by
default; Fixed and the scrutiny levels on Premium; Answer length Short /
Standard / Detailed for every plan, replacing Max tokens). The "not sent"
notice and the dead scrutiny presets are gone. English words only; the other
34 locales follow in the translation task.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

The `git rm` of Step 7a is already staged and goes into this commit.

---

## Task 9: The phone hand-off draft learns the new controls

**Gates:** the Project 1 gate and the P2a gate. This task rewrites Project 1's version of the module and of its test.

**Files:**
- Modify: `apps/ui/lib/phoneCompletionDraft.ts`
- Modify: `tests/unit/phone-completion-draft-legacy.test.ts` (Project 1's file; rewritten here)

**Interfaces:**
- `PhoneDraftForm` uses `depthMode: 'fixed' | 'adaptive'` and `answerLength: 'short' | 'standard' | 'detailed'`. `maxTokens` is gone.
- The draft stays `version: 1`. It reads two older shapes and never writes them:
  - Project 1's shape (with `maxTokens`);
  - the shape from before parallel calls (with `maxTokens`, `branching` and `concurrency`).
- A submitted config may carry `depth_mode`, `scrutiny` and `answer_length`. An older one without them stays valid.

- [ ] **Step 1: Rewrite the test**

Replace the whole of `tests/unit/phone-completion-draft-legacy.test.ts` with:

```ts
// @vitest-environment jsdom
/**
 * The phone-completion draft across the /new page's changes:
 * - Parallel calls (owner ruling 2026-10-12) removed Concurrency and Branching width.
 * - Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8) replaced Max tokens with Answer length
 *   and kept two of Depth mode's four values.
 * A draft saved in either older shape keeps parsing in today's shape: the retired values are
 * dropped, Answer length reads as Standard, and a retired depth mode reads as Adaptive. It is
 * never written again in an old shape.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PHONE_COMPLETION_DRAFT_KEY,
  PHONE_COMPLETION_DRAFT_MS,
  acknowledgePhoneDraftUpdate,
  clearPhoneCompletionDraft,
  phoneCompletionDraftForOwner,
  savePhoneCompletionDraft,
  type PhoneDraftForm,
  type SubmittedPhoneDraft
} from "../../apps/ui/lib/phoneCompletionDraft.js";

const OWNER = "asker:draft-owner";
const client = { readSession: async () => ({ asker_id: OWNER }) } as never;

const form: PhoneDraftForm = {
  topic: "Should cities replace private cars with shared transit?",
  planTier: "premium",
  optionsOpen: true,
  depthMode: "fixed",
  scrutiny: "deep",
  depth: 2,
  answerLength: "detailed",
  riskTier: "standard",
  riskTierWasEdited: false,
  budgetTier: "low",
  decisionScope: "City transport policy",
  asOf: "2026-10-12T09:30:00.000Z"
};

/** The form as Project 1 (parallel calls) saved it: Max tokens, no Answer length. */
const { answerLength: _dropped, ...withoutAnswerLength } = form;
const parallelCallsForm = { ...withoutAnswerLength, maxTokens: 800 };
/** ... and as the page saved it before parallel calls: Branching width and Concurrency too. */
const oldestForm = { ...parallelCallsForm, branching: 2, concurrency: 3 };

const legacyConfig = {
  plan_tier: "premium",
  risk_tier: "standard",
  tier_source: "MACHINE_DEFAULT",
  tier_provenance_ref: "machine:plan-tier-free",
  composition_budget_tier: "low",
  depth: 2,
  decision_scope: "City transport policy",
  as_of: "2026-10-12T09:30:00.000Z",
  steering_presets: [],
  steering_annotations: []
};

const submitted: SubmittedPhoneDraft = {
  topic: form.topic,
  config: { ...legacyConfig, depth_mode: "fixed", scrutiny: "deep", answer_length: "detailed" },
  query: { plan_tier: "premium", composition_budget_tier: "low", depth: 2 }
};

function storeRecord(recordForm: Record<string, unknown>, recordSubmitted: SubmittedPhoneDraft = submitted): string {
  const now = Date.now();
  const id = "0b7a6c1e-2f3d-4a5b-8c9d-0e1f2a3b4c5d";
  window.sessionStorage.setItem(PHONE_COMPLETION_DRAFT_KEY, JSON.stringify({
    version: 1, id, owner: OWNER, created_at: now, expires_at: now + PHONE_COMPLETION_DRAFT_MS,
    phase: "phone-required", form: recordForm, submitted: recordSubmitted
  }));
  return id;
}

function storedForm(): Record<string, unknown> {
  const text = window.sessionStorage.getItem(PHONE_COMPLETION_DRAFT_KEY);
  expect(text, "no draft was stored").not.toBeNull();
  return (JSON.parse(text!) as { form: Record<string, unknown> }).form;
}

describe("phone-completion draft with Answer length and the two depth modes", () => {
  beforeEach(() => clearPhoneCompletionDraft());
  afterEach(() => clearPhoneCompletionDraft());

  it("parses a draft in today's shape", () => {
    const id = storeRecord({ ...form });
    expect(phoneCompletionDraftForOwner(OWNER)?.id).toBe(id);
    expect(phoneCompletionDraftForOwner(OWNER)?.form).toEqual(form);
  });

  it("reads Project 1's shape: Max tokens dropped, Answer length Standard", () => {
    storeRecord(parallelCallsForm);
    expect(phoneCompletionDraftForOwner(OWNER)?.form).toEqual({ ...form, answerLength: "standard" });
  });

  it("reads the oldest shape, and a retired depth mode as Adaptive", () => {
    storeRecord({ ...oldestForm, depthMode: "recommended" });
    const draft = phoneCompletionDraftForOwner(OWNER);
    expect(draft?.form).toEqual({ ...form, depthMode: "adaptive", answerLength: "standard" });
    for (const retired of ["maxTokens", "branching", "concurrency"]) expect(draft?.form).not.toHaveProperty(retired);
  });

  it("rewrites an old draft in today's shape when it moves on", () => {
    const id = storeRecord({ ...oldestForm, depthMode: "manual" });
    expect(acknowledgePhoneDraftUpdate(id, OWNER)).toBe(true);
    expect(storedForm()).toEqual({ ...form, depthMode: "adaptive", answerLength: "standard" });
  });

  it("still refuses a shape that is none of the three", () => {
    storeRecord({ ...parallelCallsForm, branching: 2 });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
    storeRecord({ ...form, depthMode: "manual" });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
    storeRecord({ ...form, answerLength: "epic" });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
  });

  it("accepts a submitted ask with or without the three choices, and refuses an unknown one", () => {
    storeRecord({ ...form }, { ...submitted, config: legacyConfig });
    expect(phoneCompletionDraftForOwner(OWNER)).not.toBeNull();
    storeRecord({ ...form }, { ...submitted, config: { ...submitted.config, scrutiny: "infinite" } });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
  });

  it("saves a new draft in today's shape, and refuses to save an old one", async () => {
    expect(await savePhoneCompletionDraft(client, () => form, submitted, () => true)).toBe(true);
    expect(storedForm()).toEqual(form);
    const legacy = parallelCallsForm as unknown as PhoneDraftForm;
    await expect(savePhoneCompletionDraft(client, () => legacy, submitted, () => true)).rejects.toThrow("PHONE_DRAFT_INVALID");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/phone-completion-draft-legacy.test.ts`
Expected: FAIL. Today's shape is refused because `answerLength` is an unknown key.

- [ ] **Step 3: Edit `apps/ui/lib/phoneCompletionDraft.ts`**

3a. Replace the `PhoneDraftForm` type with:

```ts
export type PhoneDraftForm = {
    topic: string; planTier: 'free' | 'premium'; optionsOpen: boolean;
    depthMode: 'fixed' | 'adaptive'; scrutiny: 'standard' | 'deep' | 'exhaustive';
    depth: number; answerLength: 'short' | 'standard' | 'detailed';
    riskTier: string; riskTierWasEdited: boolean; budgetTier: 'low' | 'medium' | 'high';
    decisionScope: string; asOf: string;
};
```

3b. Delete the now-unused `const finiteInt = …;` line.

3c. Replace `function validSubmitted(…) { … }` with:

```ts
const ASK_CONFIG_KEYS = ['plan_tier', 'risk_tier', 'tier_source', 'tier_provenance_ref', 'composition_budget_tier', 'depth', 'decision_scope', 'as_of', 'steering_presets', 'steering_annotations'];
/** Debate shape P2c: the ask now also carries the three depth choices; an ask saved before carries none. */
const DEPTH_CHOICE_CONFIG_KEYS = ['depth_mode', 'scrutiny', 'answer_length'];
function validSubmitted(value: unknown): value is SubmittedPhoneDraft {
    if (!keys(value, ['topic', 'config', 'query']) || typeof value.topic !== 'string') return false;
    const withChoices = keys(value.config, [...ASK_CONFIG_KEYS, ...DEPTH_CHOICE_CONFIG_KEYS]);
    if (!withChoices && !keys(value.config, ASK_CONFIG_KEYS)) return false;
    const c = value.config as Record<string, unknown>;
    if (!Array.isArray(c.steering_presets) || c.steering_presets.length || !Array.isArray(c.steering_annotations) || c.steering_annotations.length) return false;
    if (c.tier_provenance_ref !== (c.tier_source === 'ASKER' ? 'asker:ui-selection' : c.tier_source === 'MACHINE_DEFAULT' ? 'machine:plan-tier-free' : null)) return false;
    const depthParams = withChoices ? {depth:c.depth, depthMode:c.depth_mode, scrutiny:c.scrutiny, answerLength:c.answer_length} : {depth:c.depth};
    const ask = AskRequestSchema.safeParse({question_line:value.topic, risk_tier:c.risk_tier,tier_source:c.tier_source,tier_provenance_ref:c.tier_provenance_ref,composition_budget_tier:c.composition_budget_tier,depth_params:depthParams,decision_scope:c.decision_scope,as_of:c.as_of,steering_presets:c.steering_presets,plan_tier:c.plan_tier,steering_annotations:c.steering_annotations});
    if (!keys(value.query, ['plan_tier','composition_budget_tier','depth']) || typeof value.query.depth !== 'number') return false;
    const room = AskRoomQuerySchema.safeParse({...value.query, depth: String(value.query.depth)});
    return ask.success && room.success && room.data.plan_tier === c.plan_tier && room.data.composition_budget_tier === c.composition_budget_tier && room.data.depth === c.depth;
}
```

3d. Replace Project 1's block, from `const FORM_KEYS = …` through the end of `function withoutRetiredKeys(…) { … }`, with:

```ts
const FORM_KEYS = ['topic','planTier','optionsOpen','depthMode','scrutiny','depth','answerLength','riskTier','riskTierWasEdited','budgetTier','decisionScope','asOf'];
/** The form as the page saved it before debate shape P2c: Max tokens instead of Answer length. */
const PARALLEL_CALLS_FORM_KEYS = [...FORM_KEYS.filter((name) => name !== 'answerLength'), 'maxTokens'];
/** ... and before parallel calls (owner ruling 2026-10-12): Branching width and Concurrency too. */
const OLDEST_FORM_KEYS = [...PARALLEL_CALLS_FORM_KEYS, 'branching', 'concurrency'];
/** A draft saved in an older shape is READ in today's. The retired values are dropped, Answer
 *  length takes its default (Standard), and a retired depth mode (manual, recommended) reads as
 *  Adaptive. It is never WRITTEN again in an old shape. Any other shape is left as it is, for
 *  validForm to refuse. */
function upgradedForm(value: unknown): unknown {
    if (!plain(value) || (!keys(value, PARALLEL_CALLS_FORM_KEYS) && !keys(value, OLDEST_FORM_KEYS))) return value;
    const form: Record<string, unknown> = { ...value };
    for (const name of ['maxTokens', 'branching', 'concurrency']) delete form[name];
    if (oneOf(form.depthMode, ['manual', 'recommended'])) form.depthMode = 'adaptive';
    form.answerLength = 'standard';
    return form;
}
```

3e. Replace `function validForm(…) { … }` with:

```ts
function validForm(value: unknown): value is PhoneDraftForm {
    if (!keys(value, FORM_KEYS)) return false;
    return typeof value.topic === 'string' && oneOf(value.planTier,['free','premium']) && typeof value.optionsOpen === 'boolean' && oneOf(value.depthMode,['fixed','adaptive']) && oneOf(value.scrutiny,['standard','deep','exhaustive']) && DepthParamsSchema.safeParse({depth:value.depth}).success && oneOf(value.answerLength,['short','standard','detailed']) && oneOf(value.riskTier,['casual','standard','high-stakes']) && typeof value.riskTierWasEdited === 'boolean' && oneOf(value.budgetTier,['low','medium','high']) && typeof value.decisionScope === 'string' && value.decisionScope.length > 0 && typeof value.asOf === 'string' && Number.isFinite(new Date(value.asOf).valueOf());
}
```

3f. In `readRecord`, replace `form: withoutRetiredKeys(parsed.form)` with `form: upgradedForm(parsed.form)`.

- [ ] **Step 4: Run the tests**

Run each, one at a time:
- `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/phone-completion-draft-legacy.test.ts` → PASS (7).
- `pnpm exec vitest run tests/render/phone-completion.test.tsx` → PASS. /new still does not use the module.

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add apps/ui/lib/phoneCompletionDraft.ts tests/unit/phone-completion-draft-legacy.test.ts
git commit -m "$(cat <<'EOF'
Phone draft: Answer length and the two depth modes (debate shape P2c)

Today's draft carries answerLength instead of maxTokens and only fixed or
adaptive; a draft saved in either older shape is read in today's (Standard
answer, retired modes as Adaptive) and never written back in an old shape.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: All 35 locales

**Files:**
- Modify: `apps/ui/messages/<locale>/newDebate.json`, `apps/ui/messages/<locale>/public.json` and `apps/ui/messages/<locale>/compose.json` for the 34 non-English locales.

**What changes:**
- **Removed** (scripted, no translator):
  - `newDebate.json`: `newDebate.legacyNotice`, `newDebate.selectionStrategy`, `newDebate.manual`, `newDebate.recommended`, `newDebate.maxTokens`, `newDebate.maxTokensHint`, `newDebate.scrutinyStandardHint`, `newDebate.scrutinyDeepHint`, `newDebate.scrutinyExhaustiveHint`.
  - `compose.json`: the six `compose.scrutinyDepth.*` keys.
- **Added** (translated):
  - `newDebate.json`: the 10 keys of Task 8 Step 8.
  - `public.json`: `public.alsoRaised.title`, `public.alsoRaised.empty`, `public.positionTitle`.

**Language groups** (one Haiku worker each, effort `xhigh`, in the foreground, all six in ONE message so they run in parallel):

| Worker | Locales |
|---|---|
| H1 Romance | fr, es, it, pt, ro |
| H2 Germanic, Celtic, Maltese | de, nl, da, sv, ga, mt |
| H3 Slavic | bg, hr, cs, pl, ru, sk, sl, uk |
| H4 Baltic, Finno-Ugric, Greek, Turkish | et, fi, hu, lv, lt, el, tr |
| H5 Semitic and South Asian | ar, he, hi |
| H6 East and Southeast Asian | zh, ja, ko, vi, id |

Together these are 34 locales; with `en`, that makes 35.

- [ ] **Step 1: Prepare the packet folder (inside .git, never committed)**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
PACKETS="$(git rev-parse --absolute-git-dir)/p2c-translations"
mkdir -p "$PACKETS" && echo "$PACKETS"
```

- [ ] **Step 2: Dispatch the six Haiku translators**

Send one prompt per worker. The prompt is the same for all six, with `<LOCALES>`, `<GROUP>` and `<PACKETS>` filled in:

> You are translating 13 short UI strings for a debate website, for these locales only: `<LOCALES>`. Work ONLY in `<engine folder>` (absolute path given). Read but do not edit any catalogue. Write exactly one file, `<PACKETS>/<GROUP>.json`, shaped `{ "<locale>": { "<key>": "<text>", … 13 keys }, … }`. Never read settings.env or key files. You may spawn your own haiku subagents (effort "xhigh") in the foreground if useful; pass these same rules on.
>
> The English source is `apps/ui/messages/en/newDebate.json`, keys `newDebate.depthModeAdaptiveHelp`, `newDebate.depthModeFixedHelp`, `newDebate.scrutinyStandardHelp`, `newDebate.scrutinyDeepHelp`, `newDebate.scrutinyExhaustiveHelp`, `newDebate.answerLength`, `newDebate.answerLengthHint`, `newDebate.answerLengthShort`, `newDebate.answerLengthStandard`, `newDebate.answerLengthDetailed`, plus `apps/ui/messages/en/public.json` keys `public.alsoRaised.title`, `public.alsoRaised.empty`, `public.positionTitle`.
>
> Rules:
> 1. Keep `{answer}` and `{ai}` exactly as written, untranslated. Place them where the language's word order needs them. Add no quotation marks around `{answer}` unless the language requires them.
> 2. For consistency, reuse the words each locale's OWN catalogue already uses for "Depth mode", "Fixed", "Adaptive", "Depth of scrutiny", "Standard", "Deep" and "Exhaustive". Read `apps/ui/messages/<locale>/newDebate.json` first. "Standard" in `answerLengthStandard` is the same word as `scrutinyStandard` unless grammar needs agreement with "answer length".
> 3. Write numbers the locale's way, for example 1.500 (de), 1 500 (fr), 1,500 (en-style locales).
> 4. Use the polite, formal register the locale's catalogue already uses. For Romanian, use the polite plural and correct diacritics (ă, â, î, ș, ț with comma below).
> 5. The text is for ordinary readers. Never introduce words such as score, threshold, judge, model ranking, engine or token.
> 6. "Also raised, not debated" means: points that came up while the question was being explored but that the debate did not argue. "The case for {answer}, argued by {ai}" titles the argument for one answer, written by the named AI.
> 7. Reply with only the path you wrote and the count of keys per locale (13 each).

- [ ] **Step 3: One Opus spot-check of the risky locales**

Dispatch one Opus subagent (effort `high`, foreground) with this prompt:

> Review and, where wrong, correct in place the translation packets in `<PACKETS>/*.json` for these locales only: mt, ga, et, lv, lt, ar, he, hi, ja, zh, ko, plus ro (check its formal register and diacritics). Check meaning against the English in `apps/ui/messages/en/{newDebate,public}.json`. Check placeholders `{answer}` and `{ai}`, the register, natural word order, right-to-left safety for ar and he (no stray direction marks), and agreement with each locale's existing words for Fixed, Adaptive, Standard, Deep and Exhaustive. Edit only the packet files. Never read settings.env or key files. You may spawn your own haiku or opus subagents in the foreground when useful; pass these rules on. Report per locale "ok" or what you changed and why.

- [ ] **Step 4: Merge the packets, removing the retired keys**

Run (Node, no files left behind):

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
PACKETS="$(git rev-parse --absolute-git-dir)/p2c-translations"
node --input-type=module - "$PACKETS" <<'NODE'
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = join(process.cwd(), "apps/ui/messages");
const dropped = {
  newDebate: ["newDebate.legacyNotice", "newDebate.selectionStrategy", "newDebate.manual", "newDebate.recommended",
    "newDebate.maxTokens", "newDebate.maxTokensHint", "newDebate.scrutinyStandardHint", "newDebate.scrutinyDeepHint",
    "newDebate.scrutinyExhaustiveHint"],
  compose: ["compose.scrutinyDepth.deep.hint", "compose.scrutinyDepth.deep.label", "compose.scrutinyDepth.exhaustive.hint",
    "compose.scrutinyDepth.exhaustive.label", "compose.scrutinyDepth.standard.hint", "compose.scrutinyDepth.standard.label"]
};
const added = {
  newDebate: ["newDebate.depthModeAdaptiveHelp", "newDebate.depthModeFixedHelp", "newDebate.scrutinyStandardHelp",
    "newDebate.scrutinyDeepHelp", "newDebate.scrutinyExhaustiveHelp", "newDebate.answerLength", "newDebate.answerLengthHint",
    "newDebate.answerLengthShort", "newDebate.answerLengthStandard", "newDebate.answerLengthDetailed"],
  public: ["public.alsoRaised.title", "public.alsoRaised.empty", "public.positionTitle"]
};
const packetsDir = process.argv[2];
const translations = Object.assign({}, ...readdirSync(packetsDir).filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(packetsDir, name), "utf8"))));
const locales = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== "en").map((entry) => entry.name);
if (locales.length !== 34) throw new Error(`expected 34 non-English locales, found ${locales.length}`);
for (const locale of locales) {
  for (const namespace of new Set([...Object.keys(dropped), ...Object.keys(added)])) {
    const path = join(root, locale, `${namespace}.json`);
    const englishKeys = Object.keys(JSON.parse(readFileSync(join(root, "en", `${namespace}.json`), "utf8")));
    const entries = Object.entries(JSON.parse(readFileSync(path, "utf8"))).filter(([key]) => !(dropped[namespace] ?? []).includes(key));
    for (const key of added[namespace] ?? []) {
      if (entries.some(([existing]) => existing === key)) continue;
      const text = translations[locale]?.[key];
      if (typeof text !== "string" || text.trim() === "") throw new Error(`MISSING ${locale} ${key}`);
      // Insert after the nearest earlier English key the locale already has, so each file keeps English's order.
      const before = englishKeys.slice(0, englishKeys.indexOf(key)).reverse().find((candidate) => entries.some(([existing]) => existing === candidate));
      const at = before === undefined ? 0 : entries.findIndex(([existing]) => existing === before) + 1;
      entries.splice(at, 0, [key, text]);
    }
    writeFileSync(path, `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`);
  }
}
console.log(`merged ${locales.length} locales`);
NODE
```

Expected: `merged 34 locales`. A `MISSING <locale> <key>` error means a packet is incomplete: re-run that group's worker, then run this step again. It is idempotent.

- [ ] **Step 5: Run every catalogue test that covers the three namespaces**

Run each, one at a time, from `apps/ui`:
- `node --import tsx --test lib/i18n/catalog.test.mjs` → PASS. This covers newDebate's 35 locales, placeholders and the retired keys.
- `node --import tsx --test lib/i18n/public.test.mjs` → PASS. This covers 35 locales, unused keys, the sample check (ar, de, es, fr, ja differ from English) and no hard-coded English.
- `node --import tsx --test lib/i18n/compose.test.mjs` → PASS.
- `node --import tsx --test lib/i18n/catalogNamespaces.test.mjs` → PASS.

Then check the diff: `git diff --stat -- apps/ui/messages | tail -1`. It shows 102 files changed (34 locales × 3 namespaces); `en` was committed earlier.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add apps/ui/messages
git commit -m "$(cat <<'EOF'
Locales: debate shape P2c words in all 35 languages

The /new controls' new help lines and Answer length, the debate page's
"Also raised, not debated" and position title, translated by language group
with one spot-check of the risky locales; the retired /new and compose keys
removed everywhere.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Leave `$PACKETS` in place, since it is inside `.git` and never committed. The owner may delete it later.

---

## Task 11: Final verification

**Files:** none modified. If a check fails, the fix goes in the task that owns the file, as a new commit.

- [ ] **Step 1: Regenerate and typecheck** (heavy; run alone, after the memory check)

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
memory_pressure | tail -1
pnpm run generate:contract && pnpm run typecheck
```

Expected: exit 0. Typical first-run catches:
- a test double typed as `ContractClient` now missing `readAnswerMapView`; add `readAnswerMapView: async () => { throw new ContractHttpError("NOT_FOUND", 404, "MAP_VIEW_NOT_FOUND"); }` to it;
- P2b's `MapChoiceRepository` row not satisfying `MapChoiceRecord` (Task 5 Step 6).

- [ ] **Step 2: Re-run this plan's tests, one file at a time**

`tests/unit/debate-shape-story-also-raised.test.ts`, `tests/unit/story-pack.test.ts`, `tests/unit/debate-shape-story-snapshot.test.ts`, `tests/unit/debate-shape-map-view-contract.test.ts`, `tests/unit/hs-s02-check.test.ts`, `tests/unit/debate-shape-map-view-api.test.ts`, `tests/unit/s7-authorization.test.ts`, `tests/unit/debate-shape-map-view-ui.test.ts`, `tests/render/debate-shape-also-raised.test.tsx`, `tests/unit/debate-shape-new-ask-wire.test.ts`, `tests/render/debate-shape-new-controls.test.tsx`, `tests/render/tier01-new-plan-tier.test.tsx`, `tests/unit/phone-completion-draft-legacy.test.ts`. Each run is `pnpm exec vitest run <file>` and must PASS.

- [ ] **Step 3: The CI gate's three folders** (heavy; alone)

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
memory_pressure | tail -1
pnpm test:ci-gate
```

Expected: no new reds against the known-red list. A red outside this plan's files: report it with its name, and do not bend code to it. Trace where the expectation came from first.

- [ ] **Step 4: The apps/ui node tests**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine/apps/ui" && pnpm test
```

Expected: PASS.

- [ ] **Step 5: Owner-text sanity**

- `git diff <base>..HEAD -- story-shapes/` shows only the "also_raised" line, the new section, the checker sentence and the version bump.
- `grep -n "also_raised\|raised_by" story-shapes/common.md story-shapes/checker.md` shows the expected lines.

---

## Self-review: spec → tasks

| Spec item | Task |
|---|---|
| S2: positions shown as "the case for …, argued by X" | 6 (`positionTitlesFrom`), 7 (render), 10 (locales) |
| S6: Depth mode, Adaptive default, Fixed on Premium only, Free adaptive | 8 (`fixedDepthAllowedFor`, default `adaptive`, Free reset), 9 (draft) |
| S7: Depth of scrutiny Standard/Deep/Exhaustive, Premium only | 8 (select disabled on Free, sent in `depth_params`) |
| S8: Max tokens → Answer length Short/Standard/Detailed, every plan | 8 (SegmentedRow open on Free, sent), 9 (draft), 10 |
| §3.2: three real controls; disable what the plan does not allow; remove the "not sent" notice; all 35 locales via grouped Haiku plus an Opus spot-check | 8, 10 |
| §3.2: a missing field means the default (old clients) | 8 (`createDebate` sends only chosen fields), 9 (old draft shapes) |
| §3.3 step 8: "also raised" material to the story, bounded by the story budget | 1 (lowest priority, never moves the ladder), 3 (runner wiring) |
| §3.3 step 8: new story-shapes paragraph | 2 (common.md section, checker sentence, pack version) |
| §3.3 step 8: debate page "Also raised, not debated" (read model + adapter field) | 4 (contract), 5 (route, publication copy), 6 (read beside the answer), 7 (render) |
| §3.3 step 8: no internals in any of these texts | 1 (engine tokens and figures), 4 (schema carries no maker or count), 5 (view drops makers), 7 (render test forbids makers, counts, refs) |
| §3.4: `core.map_choice` read through `readMapChoiceForRun` | 5 (`MapChoiceReader` port; Contract deviation 4) |
| §5: render tests for the /new controls and the debate page's also-raised list | 7, 8 |
| §3.3 step 8 answer length in the synthesizer (target sentence, writer bound) | P2b (runner); P2c only sends the choice (8) |
| Invariant "the story covers ≤ 8 positions" | unchanged: `also_raised` adds no paths and no references (1) |
| Owner rule: story text passes the deterministic checks | 1 (also-raised claims free their own figures and words; `also_raised`/`raised_by` refused) |
| Owner rule: owner-editable pack text is a new sealed version | 2 (`pack.json` 2026-10-12.1; the fingerprint changes) |
| Owner rule: 3 phrasings per new sentence, option 1 in code | Wording picks; 2, 7, 8 ship option 1 |
| Project 1 coordination | Gates on Tasks 8–9; only the three controls, the notice and Max tokens are touched; Project 1's comment and its test case are kept and updated |

Placeholders: none. Each cross-plan name that may differ is resolved by a gate command plus a single named edit point:
- P2b's `MapResult` variable: Task 3, gate and Step 4b.
- P2b's reader class: Task 5, Step 6.
