import { STORY_BODY_LIMITS, type StoryBody, type StoryParagraph, type StoryVerdictBasis } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import type { FramedMaterialField } from "@debateai/providers";
import type { StoryMaterialIndex } from "./validate.js";

/**
 * THE STORY MATERIAL (spec §5.2) — everything the storyteller and the checker
 * read, built from the finished run and the database enrichment, and shrunk to
 * the tier's byte budget by the spec's fixed ladder.
 *
 * The models never see a node id. Every node, before any shrinking, gets a
 * short reference `P1` to `Pn`: the positions first (strongest first), then
 * each position's tree depth-first, following the arrows in their recorded
 * order. These are the story's canonical point numbers: the report's appendix
 * and the site use the same ones (`pointNumbersFrom`), so a story that names
 * "P3" in its prose points at appendix entry P3. `refMap` maps each reference
 * back to its node id, and `restoreStoryRefs` turns the story's citations
 * into node ids before it is stored.
 *
 * Everything in the material that a model or the asker wrote is EVIDENCE: it
 * travels only inside the fence, one named field per piece, as JSON.
 */

export interface StorySnapshotNode {
  readonly nodeId: string;
  readonly claim: string;
  readonly isPosition: boolean;
  readonly wayOfKnowing: "LOOKED_UP" | "RAN" | "REASONING";
  readonly baseScore: number | null;
  readonly finalStrength: number | null;
  readonly excludedReason: string | null;
  readonly authorModel: string | null;
  readonly panelDispersion: number | null;
  readonly criticSummary: string | null;
}

/** An arrow onto an EDGE has `targetNodeId: null`; the story material drops it. */
export interface StorySnapshotArrow {
  readonly sourceNodeId: string;
  readonly targetNodeId: string | null;
  readonly polarity: "support" | "attack";
}

export interface StoryRunSnapshot {
  readonly runId: string;
  readonly workItemId: string;
  readonly answerId: string;
  readonly answerVersion: number;
  readonly questionLine: string;
  /**
   * The question's language as the run recorded it (dev's
   * `core.run.argument_language_tag` and `argument_language_name`, spec §14.3):
   * the name goes into the argument-language directive of both story prompts,
   * the tag is stored with the story. Null when the run holds none.
   */
  readonly argumentLanguage: { readonly tag: string; readonly name: string } | null;
  readonly compositionBudgetTier: "low" | "medium" | "high";
  readonly verdictBasis: StoryVerdictBasis;
  readonly servedStatement: readonly string[];
  readonly nodes: readonly StorySnapshotNode[];
  readonly arrows: readonly StorySnapshotArrow[];
  readonly sensitivity: readonly { readonly removedNodeId: string; readonly leverage: number }[];
  readonly setAside: readonly { readonly nodeId: string; readonly reason: string }[];
}

export interface StoryNodeEnrichment {
  readonly judgeBestCase: string | null;
  readonly judgeObjection: string | null;
  readonly reviewOutcome: "agree" | "dispute" | "cannot-assess" | null;
  readonly reviewReasons: readonly string[];
  readonly dispersion: number | null;
}

/**
 * The JSON the models read. The keys are the vocabulary `story-shapes/common.md`
 * explains to the storyteller; a key is left out when nothing was recorded, or
 * when the ladder dropped it to fit the budget.
 */
export interface StoryMaterialPosition {
  readonly id: string;
  readonly claim: string;
  readonly author?: string;
  readonly final?: number;
  readonly won: boolean;
}

export interface StoryMaterialPoint {
  readonly id: string;
  readonly position?: true;
  readonly supports?: readonly string[];
  readonly attacks?: readonly string[];
  readonly claim: string;
  readonly known_by: "LOOKED_UP" | "RAN" | "REASONING";
  readonly base?: number;
  readonly final?: number;
  readonly set_aside?: string;
  readonly best_case?: string;
  readonly objection?: string;
  readonly review?: "agree" | "dispute" | "cannot-assess";
  readonly review_reasons?: readonly string[];
  readonly author?: string;
  readonly judge_spread?: number;
  readonly leverage?: number;
}

/**
 * Points the last ladder step left out, counted per position by their net
 * stance toward it: the arrows on the chain that reached them, with each attack
 * flipping the sign. `position_ref` is null for points that reach no position
 * (for example a point that argues about a relation between two points rather
 * than about a point); those count by their own first arrow.
 */
export interface StoryMaterialOmitted {
  readonly position_ref: string | null;
  readonly supports: number;
  readonly attacks: number;
}

export interface StoryMaterialVerdict {
  readonly label: StoryVerdictBasis["label"];
  readonly rule_in_words: string;
  readonly rung: number;
  readonly trigger: string;
  readonly winner_id: string | null;
  readonly winner_final: number;
  readonly runner_up_id: string | null;
  readonly runner_up_final: number | null;
  readonly margin: number | null;
  readonly disagreement: number | null;
  readonly thresholds: {
    readonly tie_margin: number;
    readonly low_cut: number;
    readonly high_cut: number;
    readonly disagreement: number;
  };
  readonly confidence_band: string | null;
  readonly marks: readonly string[];
  readonly positions_argued: number;
}

export interface StoryMaterial {
  readonly question: string;
  readonly verdict: StoryMaterialVerdict;
  readonly servedStatement: readonly string[];
  readonly positions: readonly StoryMaterialPosition[];
  readonly points: readonly StoryMaterialPoint[];
  readonly hinges: readonly string[];
  readonly setAside: readonly { readonly id: string; readonly reason: string }[];
  readonly omitted: readonly StoryMaterialOmitted[];
  /** UTF-8 bytes of every field's content (question through omitted). */
  readonly bytes: number;
}

/**
 * Every key the material's JSON can carry, object by object, and every field
 * name the models read. Each list is typed against its interface, so a key
 * added there (or dropped) fails to compile until it is listed here, and a test
 * walks a real material to prove the lists cover what the models see. The
 * story checks refuse the underscore keys as words of a story
 * (validate.ts, STORY_TEXT_ENGINE_TOKEN).
 */
type StoryKeyList<T> = { readonly [K in keyof Required<T>]: true };
const STORY_POINT_KEYS: StoryKeyList<StoryMaterialPoint> = {
  id: true, position: true, supports: true, attacks: true, claim: true, known_by: true, base: true, final: true,
  set_aside: true, best_case: true, objection: true, review: true, review_reasons: true, author: true,
  judge_spread: true, leverage: true
};
const STORY_POSITION_KEYS: StoryKeyList<StoryMaterialPosition> = { id: true, claim: true, author: true, final: true, won: true };
const STORY_VERDICT_KEYS: StoryKeyList<StoryMaterialVerdict> = {
  label: true, rule_in_words: true, rung: true, trigger: true, winner_id: true, winner_final: true, runner_up_id: true,
  runner_up_final: true, margin: true, disagreement: true, thresholds: true, confidence_band: true, marks: true,
  positions_argued: true
};
const STORY_THRESHOLD_KEYS: StoryKeyList<StoryMaterialVerdict["thresholds"]> = {
  tie_margin: true, low_cut: true, high_cut: true, disagreement: true
};
const STORY_OMITTED_KEYS: StoryKeyList<StoryMaterialOmitted> = { position_ref: true, supports: true, attacks: true };
const STORY_SET_ASIDE_KEYS: StoryKeyList<StoryMaterial["setAside"][number]> = { id: true, reason: true };
/** The fenced field names (`storyCoreFields`, plus the second draft's `prior_objection`). */
const STORY_MATERIAL_FIELD_NAMES = Object.freeze([
  "question", "verdict", "served_statement", "positions", "points", "hinges", "set_aside", "omitted", "prior_objection"
]);

/** Every key and field name of the material, each once. */
export const STORY_MATERIAL_KEYS: readonly string[] = Object.freeze([...new Set([
  ...Object.keys(STORY_POINT_KEYS), ...Object.keys(STORY_POSITION_KEYS), ...Object.keys(STORY_VERDICT_KEYS),
  ...Object.keys(STORY_THRESHOLD_KEYS), ...Object.keys(STORY_OMITTED_KEYS), ...Object.keys(STORY_SET_ASIDE_KEYS),
  ...STORY_MATERIAL_FIELD_NAMES
])]);

export type StoryMaterialResult =
  | {
    readonly kind: "OK";
    readonly material: StoryMaterial;
    readonly index: StoryMaterialIndex;
    readonly refMap: ReadonlyMap<string, string>;
    readonly compressionStep: number;
  }
  | { readonly kind: "TOO_LARGE"; readonly bytes: number; readonly budgetBytes: number };

/** How many hinge references the material names (spec §5.2); positions are never hinges. */
const STORY_HINGE_COUNT = 5;
/** Ladder step 1 spares the judge texts of this many highest-leverage points (positions are not ranked; step 1 spares them apart). */
const STORY_TOP_LEVERAGE = 10;
/** Ladder steps 6 and 7 spare this many highest-leverage points (positions are not ranked). */
const STORY_KEPT_LEVERAGE = 20;

/**
 * The shrink ladder, verbatim from spec §5.2, one `compressionStep` per row.
 * Step 0 cuts nothing, and every later step keeps every earlier cut.
 *   1    spec 1: judge texts outside the top-10 leverage are cut to 240 characters (the
 *        positions keep theirs, as at step 6)
 *   2    spec 2: every judge text is cut to 240 characters, the positions' included
 *   3-5  spec 3: claims are cut to 480, then 240, then 120 characters
 *   6    spec 4: points outside the top-20 leverage lose their judge texts and review
 *        reasons (the positions keep theirs: the story's path chapters are built on them)
 *   7    spec 5: only the positions, their direct children, and the top-20 points with the
 *        chain up to a position keep an entry; the rest become `omitted` counts, by
 *        net stance toward their position
 * A judge text is a point's best case, its strongest objection, and each review reason.
 * The top-10 and top-20 rank points only: the positions are named apart (spec §5.2).
 */
interface StoryShrinkStep {
  readonly outsideTopJudgeChars: number | null;
  readonly judgeChars: number | null;
  readonly claimChars: number | null;
  readonly dropJudgeOutsideKept: boolean;
  readonly keepOnlySpine: boolean;
}
const STORY_SHRINK_LADDER: readonly StoryShrinkStep[] = Object.freeze([
  { outsideTopJudgeChars: null, judgeChars: null, claimChars: null, dropJudgeOutsideKept: false, keepOnlySpine: false },
  { outsideTopJudgeChars: 240, judgeChars: null, claimChars: null, dropJudgeOutsideKept: false, keepOnlySpine: false },
  { outsideTopJudgeChars: 240, judgeChars: 240, claimChars: null, dropJudgeOutsideKept: false, keepOnlySpine: false },
  { outsideTopJudgeChars: 240, judgeChars: 240, claimChars: 480, dropJudgeOutsideKept: false, keepOnlySpine: false },
  { outsideTopJudgeChars: 240, judgeChars: 240, claimChars: 240, dropJudgeOutsideKept: false, keepOnlySpine: false },
  { outsideTopJudgeChars: 240, judgeChars: 240, claimChars: 120, dropJudgeOutsideKept: false, keepOnlySpine: false },
  { outsideTopJudgeChars: 240, judgeChars: 240, claimChars: 120, dropJudgeOutsideKept: true, keepOnlySpine: false },
  { outsideTopJudgeChars: 240, judgeChars: 240, claimChars: 120, dropJudgeOutsideKept: true, keepOnlySpine: true }
]);

function storyCompareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Cut to `limit` characters (code points), the last one an ellipsis. */
function storyClip(text: string, limit: number | null): string {
  if (limit === null) return text;
  const characters = Array.from(text);
  return characters.length <= limit ? text : `${characters.slice(0, limit - 1).join("")}…`;
}

/** Scores travel at four decimals: exact enough to explain a rung, short enough for the budget. */
function storyNumber(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * A score as a story might print it (spec §14.1): two decimals, rounded half up
 * the way a person rounds (0.575 prints 0.58, though the float sits a hair
 * below), and the value exactly as the material prints it (0.6412, 0.7, 0.5),
 * each with a point and with a comma. A value the material prints without a
 * decimal separator (0, 1) has no form: a bare digit is never a score text.
 * Scores are at most four decimals here (`storyNumber`), so the small nudge
 * never crosses a real half.
 */
function storyScoreForms(value: number): readonly string[] {
  const magnitude = Math.abs(value);
  const printed = new Set([(Math.round(magnitude * 100 + 1e-7) / 100).toFixed(2), String(magnitude)]);
  return [...printed]
    .filter((form) => /^[0-9]+\.[0-9]+$/u.test(form))
    .flatMap((form) => [form, form.replace(".", ",")]);
}

/**
 * Every decimal a text states as a figure of its own: a digit run, one "." or
 * ",", a digit run, with no digit or further separator on either side and no
 * percent sign after it. Read with the comma as a point, so "0,70" and "0.70"
 * are the same figure. A percentage is never refused anyway, so it frees nothing.
 */
function storyStatedFigures(texts: readonly string[]): ReadonlySet<string> {
  const figures = new Set<string>();
  const decimal = /(?<![\p{Nd}.,])\p{Nd}+[.,]\p{Nd}+(?![\p{Nd}]|[.,]\p{Nd})(?![\p{Zs}]?%)/gu;
  for (const text of texts) {
    for (const match of text.matchAll(decimal)) figures.add(match[0].replace(",", "."));
  }
  return figures;
}

/**
 * Every score the fitted material shows (each point's base and final, each
 * position's final, the verdict's winner, runner-up, margin and disagreement)
 * and every threshold, as a story might print them. Only what the material
 * shows: a point the last ladder step left out adds nothing. Leverage and the
 * judges' spread are not scores and are not held.
 *
 * A form the person's side of the debate also states as a figure is left out
 * (fix round 1, I-1): the question, every claim, every best case, objection and
 * review reason. "0,70 lei/kWh" in a claim is the question's own price, and the
 * story must be free to repeat it even when a threshold is 0.7. The served
 * statement and the set-aside and exclusion reasons free nothing: the first is
 * written from a digest that carries the scores, the others are code's words,
 * which can quote a score ("Recorded strength 0.21 ...").
 */
function storyScoreTexts(material: StoryMaterial): ReadonlySet<string> {
  const stated = storyStatedFigures([
    material.question,
    ...material.positions.map((position) => position.claim),
    ...material.points.flatMap((point) => [
      point.claim, point.best_case ?? "", point.objection ?? "", ...(point.review_reasons ?? [])
    ])
  ]);
  const texts = new Set<string>();
  const add = (value: number | null | undefined): void => {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    for (const form of storyScoreForms(value)) {
      if (!stated.has(form.replace(",", "."))) texts.add(form);
    }
  };
  for (const point of material.points) {
    add(point.base);
    add(point.final);
  }
  for (const position of material.positions) add(position.final);
  const verdict = material.verdict;
  add(verdict.winner_final);
  add(verdict.runner_up_final);
  add(verdict.margin);
  add(verdict.disagreement);
  // The thresholds as the verdict field prints them, and as rule_in_words does (four decimals).
  for (const threshold of Object.values(verdict.thresholds)) {
    add(threshold);
    add(storyNumber(threshold));
  }
  return texts;
}

function storyNumberWords(value: number | null): string {
  return value === null ? "not measured" : String(storyNumber(value));
}

/** The rung and trigger `deriveVerdictLabel` recorded, in plain words. */
function storyRuleInWords(basis: StoryVerdictBasis, positionsArgued: number): string {
  const winner = storyNumberWords(basis.winner_strength);
  const low = storyNumberWords(basis.thresholds.low_cut);
  const high = storyNumberWords(basis.thresholds.high_cut);
  const sentences: string[] = [];
  if (positionsArgued <= 1 || basis.runner_up_node_id === null) {
    sentences.push("Only one position was argued, so there is no runner-up and no margin between positions.");
  }
  if (basis.trigger === "BASIS_INCOMPLETE") {
    const missing = [
      ...(basis.margin === null ? ["the margin over a runner-up"] : []),
      ...(basis.disagreement === null ? ["the judges' disagreement about the strongest position"] : [])
    ];
    sentences.push(
      "The label is CONTESTED because part of what the rule needs could not be measured "
        + `(${missing.length === 0 ? "part of its basis" : missing.join(" and ")}), `
        + "and without it the rule cannot call the answer supported or unsupported."
    );
  } else if (basis.trigger === "BELOW_LOW_CUT") {
    sentences.push(`The label is UNSUPPORTED because the strongest position finished at ${winner}, below the low cut of ${low}.`);
  } else if (basis.trigger === "MARGIN_WITHIN_GAMMA") {
    sentences.push(
      `The label is CONTESTED because the strongest position (${winner}) led the runner-up `
        + `(${storyNumberWords(basis.runner_up_strength)}) by only ${storyNumberWords(basis.margin)}, `
        + `within the tie margin of ${storyNumberWords(basis.thresholds.gamma)}.`
    );
  } else if (basis.trigger === "DISAGREEMENT_AT_THRESHOLD") {
    sentences.push(
      "The label is CONTESTED because the judges' disagreement about the strongest position "
        + `(${storyNumberWords(basis.disagreement)}) reached the disagreement threshold of `
        + `${storyNumberWords(basis.thresholds.disagreement)}.`
    );
  } else if (basis.trigger === "AT_OR_ABOVE_HIGH_CUT") {
    sentences.push(
      `The label is SUPPORTED because the strongest position finished at ${winner}, at or above the high cut of ${high}, `
        + "with a clear lead over any runner-up and judges who largely agreed."
    );
  } else if (basis.trigger === "MID_BAND") {
    sentences.push(
      `The label is CONTESTED because the strongest position finished at ${winner}, between the low cut of ${low} `
        + `and the high cut of ${high}: better than unsupported, not strong enough to be supported.`
    );
  } else {
    sentences.push(`The label is ${basis.label}; the rule that decided is recorded as ${basis.trigger}.`);
  }
  return sentences.join(" ");
}

function storyLeverageByNode(snapshot: StoryRunSnapshot, nodeIds: ReadonlySet<string>): ReadonlyMap<string, number> {
  const leverage = new Map<string, number>();
  for (const record of snapshot.sensitivity) {
    if (!nodeIds.has(record.removedNodeId) || !Number.isFinite(record.leverage)) continue;
    leverage.set(record.removedNodeId, Math.max(leverage.get(record.removedNodeId) ?? record.leverage, record.leverage));
  }
  return leverage;
}

interface StoryTreeEntry {
  readonly parent: string;
  readonly polarity: "support" | "attack";
  readonly root: string;
}

interface StoryTree {
  /** node id -> short reference, `P1` onwards. */
  readonly refOf: ReadonlyMap<string, string>;
  /** Every node a position reaches: the node it was reached through, the arrow's polarity, the position. */
  readonly tree: ReadonlyMap<string, StoryTreeEntry>;
  /** node id -> the node ids it supports and attacks (node-to-node arrows only, first recorded first). */
  readonly links: ReadonlyMap<string, { readonly supports: readonly string[]; readonly attacks: readonly string[] }>;
}

/**
 * Short references: the positions first, in the order the material lists them,
 * then each position's tree depth-first, children in the order their arrows
 * were recorded; nodes no position reaches come last, in snapshot order.
 */
function storyTreeOf(
  snapshot: StoryRunSnapshot,
  positionNodes: readonly StorySnapshotNode[],
  nodeIds: ReadonlySet<string>
): StoryTree {
  const children = new Map<string, { readonly source: string; readonly polarity: "support" | "attack" }[]>();
  const links = new Map<string, { readonly supports: string[]; readonly attacks: string[] }>();
  for (const arrow of snapshot.arrows) {
    // An arrow onto an edge, or onto a node outside this debate, links no two points of it.
    if (arrow.targetNodeId === null || !nodeIds.has(arrow.sourceNodeId) || !nodeIds.has(arrow.targetNodeId)) continue;
    const link = links.get(arrow.sourceNodeId) ?? { supports: [], attacks: [] };
    const list = arrow.polarity === "support" ? link.supports : link.attacks;
    if (list.includes(arrow.targetNodeId)) continue;
    list.push(arrow.targetNodeId);
    links.set(arrow.sourceNodeId, link);
    const below = children.get(arrow.targetNodeId) ?? [];
    below.push({ source: arrow.sourceNodeId, polarity: arrow.polarity });
    children.set(arrow.targetNodeId, below);
  }

  const refOf = new Map<string, string>();
  const tree = new Map<string, StoryTreeEntry>();
  const assign = (nodeId: string): void => {
    refOf.set(nodeId, `P${String(refOf.size + 1)}`);
  };
  for (const position of positionNodes) assign(position.nodeId);
  for (const position of positionNodes) {
    const stack = [...(children.get(position.nodeId) ?? [])].reverse()
      .map((child) => ({ ...child, parent: position.nodeId }));
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === undefined || refOf.has(next.source)) continue;
      assign(next.source);
      tree.set(next.source, { parent: next.parent, polarity: next.polarity, root: position.nodeId });
      const below = children.get(next.source) ?? [];
      for (let index = below.length - 1; index >= 0; index -= 1) {
        const child = below[index];
        if (child !== undefined) stack.push({ ...child, parent: next.source });
      }
    }
  }
  for (const node of snapshot.nodes) {
    if (!refOf.has(node.nodeId)) assign(node.nodeId);
  }
  return { refOf, tree, links };
}

/**
 * A point's net stance toward the position its tree reaches: walk up the chain
 * that reached it and flip at every attack. A support of a support supports the
 * position, a support of an attack attacks it, and an attack on an attack
 * supports it. The chain always ends at its position, which has no tree entry.
 */
function storyStanceTowardPosition(nodeId: string, tree: ReadonlyMap<string, StoryTreeEntry>): "support" | "attack" {
  let supports = true;
  for (let entry = tree.get(nodeId); entry !== undefined; entry = tree.get(entry.parent)) {
    if (entry.polarity === "attack") supports = !supports;
  }
  return supports ? "support" : "attack";
}

type StoryMaterialCore = Omit<StoryMaterial, "bytes">;

function storyCoreFields(core: StoryMaterialCore): FramedMaterialField[] {
  return [
    { name: "question", content: JSON.stringify(core.question) },
    { name: "verdict", content: JSON.stringify(core.verdict) },
    { name: "served_statement", content: JSON.stringify(core.servedStatement) },
    { name: "positions", content: JSON.stringify(core.positions) },
    { name: "points", content: JSON.stringify(core.points) },
    { name: "hinges", content: JSON.stringify(core.hinges) },
    { name: "set_aside", content: JSON.stringify(core.setAside) },
    { name: "omitted", content: JSON.stringify(core.omitted) }
  ];
}

function storyFieldBytes(fields: readonly FramedMaterialField[]): number {
  return fields.reduce((total, field) => total + Buffer.byteLength(field.content, "utf8"), 0);
}

/**
 * Build the material, shrinking it by the ladder until it fits `budgetBytes`.
 * `compressionStep` is the ladder step that fitted (0 = nothing was cut).
 * Throws only on an input no finished run can produce: no position at all, or
 * a budget that is not a positive integer.
 */
export function buildStoryMaterial(input: {
  readonly snapshot: StoryRunSnapshot;
  readonly enrichment: ReadonlyMap<string, StoryNodeEnrichment>;
  readonly budgetBytes: number;
  readonly shapeIds: ReadonlySet<string>;
}): StoryMaterialResult {
  const { snapshot, enrichment, budgetBytes } = input;
  if (!Number.isInteger(budgetBytes) || budgetBytes <= 0) {
    throw new TypedDomainError("STORY_MATERIAL_BUDGET_INVALID", `A material budget is a positive whole number of bytes, not ${String(budgetBytes)}`);
  }
  const nodeIds = new Set(snapshot.nodes.map((node) => node.nodeId));
  const positionNodes = snapshot.nodes
    .filter((node) => node.isPosition)
    .sort((left, right) => (right.finalStrength ?? -Infinity) - (left.finalStrength ?? -Infinity)
      || storyCompareIds(left.nodeId, right.nodeId));
  if (positionNodes.length === 0) {
    throw new TypedDomainError("STORY_MATERIAL_NO_POSITION", `Run ${snapshot.runId} has no opening position to tell`);
  }
  const positionIds = new Set(positionNodes.map((node) => node.nodeId));
  const { refOf, tree, links } = storyTreeOf(snapshot, positionNodes, nodeIds);
  // Every node of the snapshot has a reference; nothing else is ever passed here.
  const ref = (nodeId: string): string => refOf.get(nodeId) ?? "P0";
  const refMap: ReadonlyMap<string, string> = new Map([...refOf.entries()].map(([nodeId, short]) => [short, nodeId]));
  const nodesInRefOrder = [...snapshot.nodes]
    .sort((left, right) => Number(ref(left.nodeId).slice(1)) - Number(ref(right.nodeId).slice(1)));

  const leverage = storyLeverageByNode(snapshot, nodeIds);
  // Only points are ranked. The positions are protected at steps 6 and 7 and
  // covered by the paths, and a hinge is a point that would flip the verdict.
  const byLeverage = [...leverage.entries()]
    .filter(([nodeId]) => !positionIds.has(nodeId))
    .sort((left, right) => right[1] - left[1] || storyCompareIds(left[0], right[0]))
    .map(([nodeId]) => nodeId);
  const topLeverage = new Set(byLeverage.slice(0, STORY_TOP_LEVERAGE));
  const keptLeverage = new Set(byLeverage.slice(0, STORY_KEPT_LEVERAGE));
  const hinges = Object.freeze(byLeverage.slice(0, STORY_HINGE_COUNT).map(ref));

  // Ladder step 7 keeps the spine: the positions, every point that argues with a
  // position directly, and the top-20 points with the chain that carries each up
  // to its position. A point with no arrow at all has no position to be counted
  // under, so it keeps its entry too.
  const spine = new Set<string>(positionIds);
  for (const [source, link] of links) {
    if ([...link.supports, ...link.attacks].some((target) => positionIds.has(target))) spine.add(source);
  }
  for (const nodeId of keptLeverage) {
    let cursor: string | undefined = nodeId;
    while (cursor !== undefined && !spine.has(cursor)) {
      spine.add(cursor);
      cursor = tree.get(cursor)?.parent;
    }
  }
  const arrowSources = new Set(snapshot.arrows.map((arrow) => arrow.sourceNodeId));
  for (const node of snapshot.nodes) {
    if (!arrowSources.has(node.nodeId)) spine.add(node.nodeId);
  }

  const basis = snapshot.verdictBasis;
  const verdict: StoryMaterialVerdict = Object.freeze({
    label: basis.label,
    rule_in_words: storyRuleInWords(basis, positionNodes.length),
    rung: basis.rung,
    trigger: basis.trigger,
    winner_id: refOf.get(basis.winner_node_id) ?? null,
    winner_final: storyNumber(basis.winner_strength),
    runner_up_id: basis.runner_up_node_id === null ? null : refOf.get(basis.runner_up_node_id) ?? null,
    runner_up_final: basis.runner_up_strength === null ? null : storyNumber(basis.runner_up_strength),
    margin: basis.margin === null ? null : storyNumber(basis.margin),
    disagreement: basis.disagreement === null ? null : storyNumber(basis.disagreement),
    thresholds: Object.freeze({
      tie_margin: basis.thresholds.gamma,
      low_cut: basis.thresholds.low_cut,
      high_cut: basis.thresholds.high_cut,
      disagreement: basis.thresholds.disagreement
    }),
    confidence_band: basis.confidence_band,
    marks: Object.freeze([...basis.marks]),
    positions_argued: positionNodes.length
  });

  const materialAt = (step: StoryShrinkStep): { readonly material: StoryMaterial; readonly visible: ReadonlySet<string> } => {
    const visible = new Set(nodesInRefOrder
      .filter((node) => !step.keepOnlySpine || spine.has(node.nodeId))
      .map((node) => node.nodeId));
    const positions = positionNodes.map((node): StoryMaterialPosition => Object.freeze({
      id: ref(node.nodeId),
      claim: storyClip(node.claim, step.claimChars),
      ...(node.authorModel === null ? {} : { author: node.authorModel }),
      ...(node.finalStrength === null ? {} : { final: storyNumber(node.finalStrength) }),
      won: node.nodeId === basis.winner_node_id
    }));
    const points = nodesInRefOrder.filter((node) => visible.has(node.nodeId)).map((node): StoryMaterialPoint => {
      const judgeDropped = step.dropJudgeOutsideKept && !keptLeverage.has(node.nodeId) && !positionIds.has(node.nodeId);
      // Step 1 spares the top-10 points and the positions; step 2 cuts every judge text.
      const judgeChars = step.judgeChars
        ?? (topLeverage.has(node.nodeId) || positionIds.has(node.nodeId) ? null : step.outsideTopJudgeChars);
      const enriched = enrichment.get(node.nodeId);
      const bestCase = judgeDropped ? null : enriched?.judgeBestCase ?? null;
      const objection = judgeDropped ? null : enriched?.judgeObjection ?? node.criticSummary;
      const reviewOutcome = enriched?.reviewOutcome ?? null;
      const reviewReasons = judgeDropped ? [] : enriched?.reviewReasons ?? [];
      const spread = enriched?.dispersion ?? node.panelDispersion;
      const link = links.get(node.nodeId);
      const supports = (link?.supports ?? []).filter((target) => visible.has(target)).map(ref);
      const attacks = (link?.attacks ?? []).filter((target) => visible.has(target)).map(ref);
      const nodeLeverage = leverage.get(node.nodeId);
      return Object.freeze({
        id: ref(node.nodeId),
        ...(positionIds.has(node.nodeId) ? { position: true as const } : {}),
        ...(supports.length === 0 ? {} : { supports: Object.freeze(supports) }),
        ...(attacks.length === 0 ? {} : { attacks: Object.freeze(attacks) }),
        claim: storyClip(node.claim, step.claimChars),
        known_by: node.wayOfKnowing,
        ...(node.baseScore === null ? {} : { base: storyNumber(node.baseScore) }),
        ...(node.finalStrength === null ? {} : { final: storyNumber(node.finalStrength) }),
        ...(node.excludedReason === null ? {} : { set_aside: node.excludedReason }),
        ...(bestCase === null ? {} : { best_case: storyClip(bestCase, judgeChars) }),
        ...(objection === null ? {} : { objection: storyClip(objection, judgeChars) }),
        ...(reviewOutcome === null ? {} : { review: reviewOutcome }),
        ...(reviewReasons.length === 0 ? {} : { review_reasons: Object.freeze(reviewReasons.map((reason) => storyClip(reason, judgeChars))) }),
        ...(node.authorModel === null ? {} : { author: node.authorModel }),
        ...(spread === null ? {} : { judge_spread: storyNumber(spread) }),
        ...(nodeLeverage === undefined ? {} : { leverage: storyNumber(nodeLeverage) })
      });
    });

    const omittedCounts = new Map<string | null, { supports: number; attacks: number }>();
    for (const node of nodesInRefOrder) {
      if (visible.has(node.nodeId)) continue;
      const entry = tree.get(node.nodeId);
      // Under a position, a point counts by its net stance toward that position. A
      // point no position reaches has no position to take a stance on, so its own
      // first arrow counts. Only points with an arrow can be left out, so the last
      // fallback is never taken.
      const polarity = entry !== undefined
        ? storyStanceTowardPosition(node.nodeId, tree)
        : snapshot.arrows.find((arrow) => arrow.sourceNodeId === node.nodeId)?.polarity ?? "support";
      const key = entry === undefined ? null : ref(entry.root);
      const counts = omittedCounts.get(key) ?? { supports: 0, attacks: 0 };
      if (polarity === "support") counts.supports += 1;
      else counts.attacks += 1;
      omittedCounts.set(key, counts);
    }
    const omittedKeys: (string | null)[] = [
      ...positionNodes.map((node) => ref(node.nodeId)).filter((key) => omittedCounts.has(key)),
      ...(omittedCounts.has(null) ? [null] : [])
    ];
    const omitted = omittedKeys.map((key): StoryMaterialOmitted => {
      const counts = omittedCounts.get(key) ?? { supports: 0, attacks: 0 };
      return Object.freeze({ position_ref: key, supports: counts.supports, attacks: counts.attacks });
    });

    const core: StoryMaterialCore = {
      question: snapshot.questionLine,
      verdict,
      servedStatement: Object.freeze([...snapshot.servedStatement]),
      positions: Object.freeze(positions),
      points: Object.freeze(points),
      hinges,
      setAside: Object.freeze(snapshot.setAside
        .filter((entry) => visible.has(entry.nodeId))
        .map((entry) => Object.freeze({ id: ref(entry.nodeId), reason: entry.reason }))),
      omitted: Object.freeze(omitted)
    };
    return { material: Object.freeze({ ...core, bytes: storyFieldBytes(storyCoreFields(core)) }), visible };
  };

  // The positions' references, strongest first: the order they were numbered and
  // listed in, and the order the checks read "the strongest `pathCap`" from.
  const positionOrder: readonly string[] = Object.freeze(positionNodes.map((node) => ref(node.nodeId)));
  let lastBytes = 0;
  for (const [step, shrink] of STORY_SHRINK_LADDER.entries()) {
    const { material, visible } = materialAt(shrink);
    if (material.bytes <= budgetBytes) {
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
          scoreTexts: storyScoreTexts(material)
        }),
        refMap,
        compressionStep: step
      });
    }
    lastBytes = material.bytes;
  }
  return Object.freeze({ kind: "TOO_LARGE", bytes: lastBytes, budgetBytes });
}

/**
 * The canonical point numbers, node id -> `Pn`: what the report's appendix and
 * the site print, so a "P3" in a story's prose finds its point.
 */
export function pointNumbersFrom(refMap: ReadonlyMap<string, string>): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries([...refMap.entries()].map(([short, nodeId]) => [nodeId, short])));
}

/**
 * The story with every cited reference (`position_ref`, `node_refs`) turned
 * back into its node id, for storage. The prose is left exactly as written: a
 * "P3" in a sentence stays "P3", which `pointNumbersFrom` resolves. A reference the material never offered is a programming error (the
 * classifier refuses unknown references before a story gets here), so it
 * throws, and names no model text.
 */
export function restoreStoryRefs(body: StoryBody, refMap: ReadonlyMap<string, string>): StoryBody {
  const restore = (short: string): string => {
    const nodeId = refMap.get(short);
    if (nodeId === undefined) {
      throw new TypedDomainError("STORY_REF_UNMAPPED", "The story cites a reference the material never offered");
    }
    return nodeId;
  };
  const paragraph = (entry: StoryParagraph): StoryParagraph => ({
    text: entry.text,
    node_refs: entry.node_refs.map(restore)
  });
  return {
    shape_id: body.shape_id,
    short: {
      headline: body.short.headline,
      summary: body.short.summary,
      confidence: body.short.confidence,
      paths: body.short.paths.map((path) => ({
        position_ref: restore(path.position_ref),
        fate: path.fate,
        line: path.line,
        node_refs: path.node_refs.map(restore)
      })),
      change: paragraph(body.short.change)
    },
    why: {
      reasons: body.why.reasons.map(paragraph)
    },
    long: {
      sections: body.long.sections.map((section) => ({
        title: section.title,
        paragraphs: section.paragraphs.map(paragraph)
      }))
    },
    reviewer_note: body.reviewer_note === null ? null : paragraph(body.reviewer_note)
  };
}

/** The storyteller's fenced fields; `prior_objection` rides only on a second draft. */
export function toStoryPromptMaterial(material: StoryMaterial, priorObjection: string | null): readonly FramedMaterialField[] {
  const fields = storyCoreFields(material);
  if (priorObjection !== null) fields.push({ name: "prior_objection", content: JSON.stringify(priorObjection) });
  return Object.freeze(fields.map((field) => Object.freeze(field)));
}

/** The checker's fenced fields: the same material, plus the story it is checking. */
export function toCheckerPromptMaterial(material: StoryMaterial, candidate: StoryBody): readonly FramedMaterialField[] {
  const fields = [...storyCoreFields(material), { name: "candidate_story", content: JSON.stringify(candidate) }];
  return Object.freeze(fields.map((field) => Object.freeze(field)));
}
