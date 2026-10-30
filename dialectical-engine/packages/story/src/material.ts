import {
  STORY_BODY_LIMITS,
  StoryFateSchema,
  StoryVerdictBasisSchema,
  WayOfKnowingSchema,
  type StoryBody,
  type StoryParagraph,
  type StoryVerdictBasis
} from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import {
  buildFramedPrompt,
  buildFramedRevisionPrompt,
  schemaFailureLocator,
  type FramedMaterialField,
  type FramedPrompt,
  type PromptContract,
  type PromptPacket,
  type RejectedProviderContent
} from "@debateai/providers";
import type { StoryMaterialIndex } from "./validate.js";
import type { StoryV4Options } from "./pack.js";

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

/**
 * Debate shape P2c (spec 2026-10-12 §3.3 step 8): one map point that was raised but not
 * debated. `raisedBy` is how many different makers raised it: it only ranks the points
 * (most-raised first) and never reaches the models (controller ruling C-ORDER: no count
 * the storyteller could repeat). The claim is model text: evidence, like every claim.
 */
export interface StorySnapshotAlsoRaised {
  readonly claim: string;
  readonly raisedBy: number;
}

/**
 * Debate shape P2c, owner ruling C-STORY: why not every answer argued was picked the usual
 * way. MAP_UNAVAILABLE: the map could not list the possible answers, so each AI argued its
 * own (today's opening). ANSWERS_FILLED: code added an answer or a point so that enough
 * options were tested. The runner reads it from the map's marks (story-snapshot.ts).
 */
export type StoryAnswersNoteKind = "MAP_UNAVAILABLE" | "ANSWERS_FILLED";
/**
 * The owner's option 1 of three phrasings for each kind (plan "Wording picks"), in plain
 * English; the storyteller says its meaning once, in the question's language.
 */
export const STORY_ANSWERS_NOTE_MAP_UNAVAILABLE =
  "We could not first gather every possible answer, so each AI argued the answer it found best.";
export const STORY_ANSWERS_NOTE_ANSWERS_FILLED =
  "Some of the answers or points argued here were added to make sure enough options were tested.";
const STORY_ANSWERS_NOTE_TEXT: Readonly<Record<StoryAnswersNoteKind, string>> = Object.freeze({
  MAP_UNAVAILABLE: STORY_ANSWERS_NOTE_MAP_UNAVAILABLE,
  ANSWERS_FILLED: STORY_ANSWERS_NOTE_ANSWERS_FILLED
});

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
  /**
   * Debate shape P2c: the map's points that were raised but not debated, most-raised
   * first. Absent on every run without the new shape, whose material stays byte for byte
   * what it was.
   */
  readonly alsoRaised?: readonly StorySnapshotAlsoRaised[];
  /**
   * Debate shape P2c, owner ruling C-STORY: present only when the answers argued came
   * from a map fallback. Absent on every other run, whose material stays byte for byte.
   */
  readonly answersNote?: StoryAnswersNoteKind;
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
  /**
   * Where it finished, 1 for the winner (practice debate 2, 2026-10-12): the
   * storyteller named the third-placed option as the "close rival" of a close
   * call. The order of the list said it, but no field did.
   */
  readonly place: number;
  readonly claim: string;
  readonly author?: string;
  readonly final?: number;
  readonly won: boolean;
  /**
   * Present, and true, on a losing position that finished within the tie margin
   * of the winner (the label rule's own comparison, at or below `gamma`), so
   * "which option made it close" is a field, never an inference.
   */
  readonly within_tie_margin?: true;
  /**
   * Story v4 (R1d, spec §7.2 item 1): a position appears once, here. Its way of knowing and its judge texts (best case,
   * strongest objection and what it argues against, which is the position itself, its review, and the review's reasons
   * only on a dispute) ride on this entry instead of a point entry. Absent in v3, whose `points` list the position too.
   */
  readonly known_by?: "LOOKED_UP" | "RAN" | "REASONING";
  readonly best_case?: string;
  readonly objection?: string;
  readonly objection_to?: string;
  readonly review?: "agree" | "dispute" | "cannot-assess";
  readonly review_reasons?: readonly string[];
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
  /**
   * The point or position `objection` argues AGAINST (practice debate 2,
   * 2026-10-12). The objection is the critic summary the point's OWN author
   * wrote while writing it, about the point or position it was asked to argue
   * with: a position's is about itself; a point's is about the point it attacks,
   * or, when it attacks none, the one it supports. Read as "the case against
   * this point", it made a story call the counter raised against a position
   * "its own admission", and cite the wrong point for it.
   */
  readonly objection_to?: string;
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

/**
 * Debate shape P2c: a raised-but-not-debated point as the models read it. It has no
 * reference, and no count (controller ruling C-ORDER): the list's order alone says which
 * came up most, so user text has no number of AIs to repeat.
 */
export interface StoryMaterialAlsoRaised {
  readonly claim: string;
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
  /**
   * Debate shape P2c: present only when at least one also-raised point fitted the budget.
   * Most-raised first, ties in the map's order; the order is all the models learn of how often.
   */
  readonly alsoRaised?: readonly StoryMaterialAlsoRaised[];
  /**
   * Debate shape P2c, owner ruling C-STORY: the sentence of the snapshot's `answersNote`.
   * Part of the debate's own material at every ladder step: never dropped, and counted
   * in `bytes` like every core field.
   */
  readonly answersNote?: string;
  /** UTF-8 bytes of every field's content (question through answers_note). */
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
  set_aside: true, best_case: true, objection: true, objection_to: true, review: true, review_reasons: true, author: true,
  judge_spread: true, leverage: true
};
const STORY_POSITION_KEYS: StoryKeyList<StoryMaterialPosition> = {
  id: true, place: true, claim: true, author: true, final: true, won: true, within_tie_margin: true,
  // Story v4 (R1d): the position's own judge texts. Each is a point key already, so STORY_MATERIAL_KEYS and
  // STORY_ENGINE_TOKENS keep their exact values (pinned in tests/unit/story-material.test.ts).
  known_by: true, best_case: true, objection: true, objection_to: true, review: true, review_reasons: true
};
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
const STORY_ALSO_RAISED_KEYS: StoryKeyList<StoryMaterialAlsoRaised> = { claim: true };
/** The fenced field names (`storyCoreFields`, plus the second draft's `prior_objection`). */
const STORY_MATERIAL_FIELD_NAMES = Object.freeze([
  "question", "verdict", "served_statement", "positions", "points", "hinges", "set_aside", "omitted", "also_raised",
  "answers_note", "prior_objection"
]);

/** Every key and field name of the material, each once. */
export const STORY_MATERIAL_KEYS: readonly string[] = Object.freeze([...new Set([
  ...Object.keys(STORY_POINT_KEYS), ...Object.keys(STORY_POSITION_KEYS), ...Object.keys(STORY_VERDICT_KEYS),
  ...Object.keys(STORY_THRESHOLD_KEYS), ...Object.keys(STORY_OMITTED_KEYS), ...Object.keys(STORY_SET_ASIDE_KEYS),
  ...Object.keys(STORY_ALSO_RAISED_KEYS), ...STORY_MATERIAL_FIELD_NAMES
])]);

/**
 * The material's code tokens (fix round 2 ruling): the verdict labels, the
 * fates, the ways of knowing, and every material key or field name with an
 * underscore (known_by, rule_in_words, confidence_band, tie_margin ...), which
 * no language uses as a word. Derived from the contract's enums and the key
 * lists above, never typed out again. Each material's index refuses these,
 * less any its question or a claim uses itself (`storyEngineTokens`).
 */
export const STORY_ENGINE_TOKENS: readonly string[] = Object.freeze([...new Set([
  ...StoryVerdictBasisSchema.shape.label.options,
  ...StoryFateSchema.options,
  ...WayOfKnowingSchema.options,
  ...STORY_MATERIAL_KEYS.filter((key) => key.includes("_"))
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
/** Debate shape P2c: at most this many also-raised points reach the material, most-raised first. */
const STORY_ALSO_RAISED_MAX = 12;
/** An also-raised claim is cut to this many characters, or to the ladder step's claim cut when that is shorter. */
const STORY_ALSO_RAISED_CLAIM_CHARS = 240;

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
 * The engine tokens this material's story may not use: every one, less those
 * the question or a claim itself uses as a whole, case-sensitive token (fix
 * round 3 ruling, mirroring the person's own figures). "Open RAN" in the
 * question, or a claim quoting a driver's "UNSUPPORTED", is the person's word,
 * and the story may repeat it. Only the question and the claims count: the
 * judges' and reviewers' texts are models' words about the arguments.
 */
function storyEngineTokens(material: StoryMaterial): ReadonlySet<string> {
  const own = [
    material.question,
    ...material.positions.map((position) => position.claim),
    ...material.points.map((point) => point.claim),
    // Debate shape P2c: a raised point is the person's side of the debate, as a claim is. So, like a debated claim,
    // an also-raised claim that uses an engine word as its own ("Open RAN") frees that word for the story (accepted).
    ...(material.alsoRaised ?? []).map((item) => item.claim)
  ].join("\n");
  return new Set(STORY_ENGINE_TOKENS.filter((token) =>
    !new RegExp(`(?<![\\p{L}\\p{N}_])${token}(?![\\p{L}\\p{N}_])`, "u").test(own)));
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
    ...material.positions.flatMap((position) => [
      position.claim,
      // Story v4 (R1d): a position's own judge texts ride on its positions entry; like a point's, they are the person's
      // side of the debate, so a figure they state is freed. In v3 these members are absent: nothing changes.
      position.best_case ?? "", position.objection ?? "", ...(position.review_reasons ?? [])
    ]),
    ...material.points.flatMap((point) => [
      point.claim, point.best_case ?? "", point.objection ?? "", ...(point.review_reasons ?? [])
    ]),
    // Debate shape P2c: like a debated claim, an also-raised claim that states a figure frees that figure for the
    // story even when it equals a score or threshold ("0,70 lei" against a 0.7 cut). Accepted: it is the person's side.
    ...(material.alsoRaised ?? []).map((item) => item.claim)
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

/**
 * The references the rule's sentence names (practice debate 2, 2026-10-12): the
 * winner, the runner-up, and any other losing position that also finished
 * within the tie margin. A score alone ("the runner-up (0.9301)") left the
 * storyteller to work out which option made a close call close, and it named
 * the wrong one.
 */
interface StoryRuleRefs {
  readonly winner: string | null;
  readonly runnerUp: string | null;
  readonly alsoWithinTieMargin: readonly string[];
}

/** " P2" when the reference is known, else nothing: the sentence reads the same either way. */
function storyNamed(ref: string | null): string {
  return ref === null ? "" : ` ${ref}`;
}

/**
 * OWNER WORDING — approve before switch-on
 *
 * R2 (spec §4.4, INTERFACE §9.4): the comparing judges' six triggers, one plain sentence each, for the storyteller and
 * the checker (AI-facing material, never shown to a reader). No number: the judges decided, and the counts stay out.
 * Keyed by text because story may not import serve (tools/orphan-audit/src/index.ts row "story"); a unit test proves
 * the keys are exactly serve's `ENGINE_VERDICT_TRIGGERS` (tests/unit/r2-story-engine.test.ts).
 * Each sentence is true in every case `deriveJudgesVerdict` gives its trigger for a debate with two or more answers
 * (controller ruling R2b-B9.1; pre-flight PF-R2b5.5):
 * - "chose this answer" always includes a choice of an answer the judges counted as the same (ruling R2b-B2.1);
 * - a choice does not count when the judge's own maker argued the answer chosen or one counted as the same as it
 *   (R2b-B2.1), so JUDGES_NO_MAJORITY speaks of the counted choices (the answer most judges chose can lose) and
 *   JUDGES_MAJORITY and JUDGES_VOTES_IGNORED name that case;
 * - JUDGES_MAJORITY also covers every seated judge choosing this answer when fewer were seated than a clear answer needs;
 * - JUDGES_NO_MAJORITY stays true with one seated judge: a lone counted choice settles nothing when the row asks more
 *   than one agreeing judge for a close call (with a row asking one, it settles it: JUDGES_UNANIMOUS when the row's
 *   clear-answer number is also one, else JUDGES_MAJORITY);
 * - JUDGES_NO_MAJORITY's tie clause follows the count's tie-break (ruling R2b-B9.2): an even count goes to the answer
 *   whose strongest case, among it and the answers counted as the same, held up best, and an exact tie of that to the
 *   first in a fixed order (the node id), never to a claim that this answer's own case was the best.
 * Not covered: a resumed one-answer debate handing in recorded votes (B2 gives JUDGES_UNAVAILABLE; a new debate with fewer
 * than two answers asks no judge, so it is not reachable). tests/unit/r2-story-engine.test.ts checks each sentence's
 * claims against every verdict B2 gives for one to five seated judges, own makers' judges included.
 */
export const STORY_ENGINE_TRIGGER_RULES: Readonly<Record<string, string>> = Object.freeze({
  JUDGES_UNANIMOUS: "The label is SUPPORTED because every judge who compared the answers side by side chose this answer or one the judges counted as the same, and none of them found that it holds only in some cases.",
  JUDGES_CONDITIONAL: "The label is CONTESTED because every judge who compared the answers side by side chose this answer or one the judges counted as the same, but at least one found that it holds in some cases and not in others.",
  JUDGES_MAJORITY: "The label is CONTESTED because enough of the judges who compared the answers side by side chose this answer, or one the judges counted as the same, to settle it, but not clearly: too few judges could take part for the answer to be called clear, or at least one judge chose another answer, gave no usable choice, or chose an answer that its own maker had argued or that the judges counted as the same as one its maker had argued, which does not count.",
  JUDGES_NO_MAJORITY: "The label is SPLIT because, among the choices of the judges who compared the answers side by side, no single answer got enough of those that counted to settle it (a choice does not count when the judge's own maker argued that answer or one counted as the same), and this answer, together with any answer the judges counted as the same, is the one the counted choices named most often or, where that was even, the one whose strongest case (with the answers counted as the same) held up best against the objections, or, where even that was even, the first in a fixed order.",
  JUDGES_UNAVAILABLE: "The label is CONTESTED because no judge could compare the answers side by side, so this answer was chosen as the one whose case held up best against the objections, and without that comparison it cannot be called clear.",
  JUDGES_VOTES_IGNORED: "The label is SPLIT because every judge who gave a usable choice chose an answer that a model of its own maker had argued, or one the judges counted as the same as such an answer, so no choice counted, and this answer was chosen as the one whose case held up best against the objections."
});

/** The rung and trigger `deriveVerdictLabel` recorded, in plain words. */
function storyRuleInWords(basis: StoryVerdictBasis, positionsArgued: number, refs: StoryRuleRefs): string {
  const winner = storyNumberWords(basis.winner_strength);
  const low = storyNumberWords(basis.thresholds.low_cut);
  const high = storyNumberWords(basis.thresholds.high_cut);
  const sentences: string[] = [];
  if (positionsArgued <= 1 || basis.runner_up_node_id === null) {
    sentences.push("Only one position was argued, so there is no runner-up and no margin between positions.");
  }
  const judgesRule = Object.hasOwn(STORY_ENGINE_TRIGGER_RULES, basis.trigger) ? STORY_ENGINE_TRIGGER_RULES[basis.trigger] : undefined;
  if (judgesRule !== undefined) {
    // R2: an engine-2 label (rung 5) was decided by the comparing judges; the numbers' sentences do not apply.
    sentences.push(judgesRule);
  } else if (basis.trigger === "BASIS_INCOMPLETE") {
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
      `The label is CONTESTED because the strongest position${storyNamed(refs.winner)} (${winner}) led the runner-up`
        + `${storyNamed(refs.runnerUp)} (${storyNumberWords(basis.runner_up_strength)}) by only ${storyNumberWords(basis.margin)}, `
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
  // Under the judges' rule no tie-margin sentence follows: the judges decided, not the margin (the judges' winner can
  // finish below another answer, so "within the tie margin" would tell the storyteller that numbers decided).
  if (judgesRule === undefined && refs.alsoWithinTieMargin.length > 0) {
    const others = refs.alsoWithinTieMargin.join(", ");
    sentences.push(
      `${others} also finished within the tie margin of the strongest position, behind the runner-up`
        + `${storyNamed(refs.runnerUp)}, which finished closest.`
    );
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

/** A node's judge texts, as a point entry has always listed them (best_case through review_reasons). */
type StoryJudgeTexts = Pick<StoryMaterialPoint, "best_case" | "objection" | "objection_to" | "review" | "review_reasons">;

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
    { name: "omitted", content: JSON.stringify(core.omitted) },
    // Debate shape P2c: only when there is something to send, so a run without the new
    // shape keeps today's fields byte for byte.
    ...(core.alsoRaised === undefined || core.alsoRaised.length === 0
      ? []
      : [{ name: "also_raised", content: JSON.stringify(core.alsoRaised) }]),
    // Owner ruling C-STORY: only on a run whose answers came from a map fallback.
    ...(core.answersNote === undefined ? [] : [{ name: "answers_note", content: JSON.stringify(core.answersNote) }])
  ];
}

/**
 * Debate shape (ruling W-STORY): whether the material sends one of the two map fields, by the same rule
 * `storyCoreFields` sends them. Only then do the story contracts carry the pack's map passages.
 */
export function storyMaterialHasMapFields(material: Pick<StoryMaterial, "alsoRaised" | "answersNote">): boolean {
  return (material.alsoRaised !== undefined && material.alsoRaised.length > 0) || material.answersNote !== undefined;
}

function storyFieldBytes(fields: readonly FramedMaterialField[]): number {
  return fields.reduce((total, field) => total + Buffer.byteLength(field.content, "utf8"), 0);
}

/**
 * Debate shape P2c: non-blank points, most-raised first (ties keep the map's order), at most STORY_ALSO_RAISED_MAX.
 * A count is ranking input only. It is read as a whole number from 1 up to `panelSize` (the distinct authors of the
 * debate's points): a missing or bad count is one, and a count above the panel, which no real map can produce, ranks
 * as the panel and cannot jump the points the whole panel raised.
 */
function storyAlsoRaisedRanked(items: readonly StorySnapshotAlsoRaised[], panelSize: number): readonly string[] {
  return items
    .map((item, order) => ({
      claim: item.claim.trim(),
      raisedBy: Number.isFinite(item.raisedBy) ? Math.min(panelSize, Math.max(1, Math.trunc(item.raisedBy))) : 1,
      order
    }))
    .filter((item) => item.claim !== "")
    .sort((left, right) => right.raisedBy - left.raisedBy || left.order - right.order)
    .slice(0, STORY_ALSO_RAISED_MAX)
    .map((item) => item.claim);
}

/**
 * Debate shape P2c: the also-raised points ride in whatever the budget leaves once the
 * debate's own material fits. They never push the debate down the ladder. The most-raised
 * points that still fit are kept and the rest are left out; with no room at all, the field
 * is not sent.
 */
function storyWithAlsoRaised(
  material: StoryMaterial,
  ranked: readonly string[],
  claimChars: number | null,
  budgetBytes: number,
  whole = false
): StoryMaterial {
  if (ranked.length === 0) return material;
  // Length guidance (spec 2026-10-15 §3.9, ruling L19): with the length row the 240-character clip goes; the ladder
  // step's own claim cut (`claimChars`) stays until LG-E removes the ladder's cuts (controller ruling Q6).
  const limit = whole ? claimChars
    : claimChars === null ? STORY_ALSO_RAISED_CLAIM_CHARS : Math.min(claimChars, STORY_ALSO_RAISED_CLAIM_CHARS);
  const items = ranked.map((claim): StoryMaterialAlsoRaised => Object.freeze({ claim: limit === null ? claim : storyClip(claim, limit) }));
  for (let count = items.length; count > 0; count -= 1) {
    const kept = Object.freeze(items.slice(0, count));
    const bytes = material.bytes + Buffer.byteLength(JSON.stringify(kept), "utf8");
    if (bytes <= budgetBytes) return Object.freeze({ ...material, alsoRaised: kept, bytes });
  }
  return material;
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
  /** Length guidance (L19): the also-raised claims are not clipped to 240 characters. Absent: today's material. */
  readonly alsoRaisedWhole?: boolean;
  /**
   * Story v4 (R1d; Task 17 passes it under engine 2 only): each position once, reasons only for disputed points, and the
   * index carries the one shape code chose (`fixedShapeId`). Absent or undefined: today's material, byte for byte.
   */
  readonly v4?: StoryV4Options | undefined;
}): StoryMaterialResult {
  const { snapshot, enrichment, budgetBytes } = input;
  if (!Number.isInteger(budgetBytes) || budgetBytes <= 0) {
    throw new TypedDomainError("STORY_MATERIAL_BUDGET_INVALID", `A material budget is a positive whole number of bytes, not ${String(budgetBytes)}`);
  }
  const v4 = input.v4 !== undefined;
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
  // A losing position within the tie margin of the winner, by the label rule's own comparison (margin <= gamma).
  const withinTieMargin = new Set(positionNodes
    .filter((node) => node.nodeId !== basis.winner_node_id && node.finalStrength !== null
      && Number.isFinite(node.finalStrength) && basis.winner_strength - node.finalStrength <= basis.thresholds.gamma)
    .map((node) => node.nodeId));
  const runnerUpRef = basis.runner_up_node_id === null ? null : refOf.get(basis.runner_up_node_id) ?? null;
  const verdict: StoryMaterialVerdict = Object.freeze({
    label: basis.label,
    rule_in_words: storyRuleInWords(basis, positionNodes.length, {
      winner: refOf.get(basis.winner_node_id) ?? null,
      runnerUp: runnerUpRef,
      alsoWithinTieMargin: positionNodes
        .filter((node) => withinTieMargin.has(node.nodeId) && node.nodeId !== basis.runner_up_node_id)
        .map((node) => ref(node.nodeId))
    }),
    rung: basis.rung,
    trigger: basis.trigger,
    winner_id: refOf.get(basis.winner_node_id) ?? null,
    winner_final: storyNumber(basis.winner_strength),
    runner_up_id: runnerUpRef,
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
    /**
     * A node's judge texts at this step, in the order a point entry has always listed them: its best case, its strongest
     * objection and what that objection argues against, its review and the review's reasons. Step 1 cuts them outside the
     * top-10 points, step 2 cuts every one, step 6 drops them outside the kept points; a position's are never dropped and
     * are cut only from step 2 on. Story v4 (R1d, spec §7.2 item 1): a review's reasons ride only with a dispute; an
     * agreeing or cannot-assess review keeps its outcome alone.
     */
    const judgeTextsOf = (node: StorySnapshotNode, objectionTo: string | null): StoryJudgeTexts => {
      const judgeDropped = step.dropJudgeOutsideKept && !keptLeverage.has(node.nodeId) && !positionIds.has(node.nodeId);
      // Step 1 spares the top-10 points and the positions; step 2 cuts every judge text.
      const judgeChars = step.judgeChars
        ?? (topLeverage.has(node.nodeId) || positionIds.has(node.nodeId) ? null : step.outsideTopJudgeChars);
      const enriched = enrichment.get(node.nodeId);
      const bestCase = judgeDropped ? null : enriched?.judgeBestCase ?? null;
      const objection = judgeDropped ? null : enriched?.judgeObjection ?? node.criticSummary;
      const reviewOutcome = enriched?.reviewOutcome ?? null;
      const reviewReasons = judgeDropped || (v4 && reviewOutcome !== "dispute") ? [] : enriched?.reviewReasons ?? [];
      return {
        ...(bestCase === null ? {} : { best_case: storyClip(bestCase, judgeChars) }),
        ...(objection === null ? {} : { objection: storyClip(objection, judgeChars) }),
        ...(objection === null || objectionTo === null ? {} : { objection_to: objectionTo }),
        ...(reviewOutcome === null ? {} : { review: reviewOutcome }),
        ...(reviewReasons.length === 0 ? {} : { review_reasons: Object.freeze(reviewReasons.map((reason) => storyClip(reason, judgeChars))) })
      };
    };
    const positions = positionNodes.map((node, index): StoryMaterialPosition => Object.freeze({
      id: ref(node.nodeId),
      place: index + 1,
      claim: storyClip(node.claim, step.claimChars),
      ...(v4 ? { known_by: node.wayOfKnowing } : {}),
      ...(node.authorModel === null ? {} : { author: node.authorModel }),
      ...(node.finalStrength === null ? {} : { final: storyNumber(node.finalStrength) }),
      won: node.nodeId === basis.winner_node_id,
      ...(withinTieMargin.has(node.nodeId) ? { within_tie_margin: true as const } : {}),
      // Story v4: the position's own judge texts, here once (its objection is about itself); its point entry leaves `points`.
      ...(v4 ? judgeTextsOf(node, ref(node.nodeId)) : {})
    }));
    // Story v4: each position appears once, in `positions`. v3 lists it in `points` too, as it always has.
    const points = nodesInRefOrder
      .filter((node) => visible.has(node.nodeId) && !(v4 && positionIds.has(node.nodeId)))
      .map((node): StoryMaterialPoint => {
        const enriched = enrichment.get(node.nodeId);
        const spread = enriched?.dispersion ?? node.panelDispersion;
        const link = links.get(node.nodeId);
        const supports = (link?.supports ?? []).filter((target) => visible.has(target)).map(ref);
        const attacks = (link?.attacks ?? []).filter((target) => visible.has(target)).map(ref);
        // What the author's objection argues against: the position itself, else the point it attacks, else the one it
        // supports (the leg it was written for: an attack or a cross-root reply attacks; a support leg only supports).
        const objectionTo = positionIds.has(node.nodeId) ? ref(node.nodeId) : attacks[0] ?? supports[0] ?? null;
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
          ...judgeTextsOf(node, objectionTo),
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
      omitted: Object.freeze(omitted),
      // Owner ruling C-STORY: the answers note is the debate's own material at every ladder step, so it is never
      // dropped and its bytes count like any core field's. Absent on every other run: today's bytes. Accepted cost:
      // at the very edge of its budget a fallback run can fit one ladder step later than it would without the note,
      // or, at step 7, not fit at all (STORY_MATERIAL_TOO_LARGE). Only fallback runs ever carry it.
      ...(snapshot.answersNote === undefined ? {} : { answersNote: STORY_ANSWERS_NOTE_TEXT[snapshot.answersNote] })
    };
    return { material: Object.freeze({ ...core, bytes: storyFieldBytes(storyCoreFields(core)) }), visible };
  };

  // The positions' references, strongest first: the order they were numbered and
  // listed in, and the order the checks read "the strongest `pathCap`" from.
  const positionOrder: readonly string[] = Object.freeze(positionNodes.map((node) => ref(node.nodeId)));
  // The panel, as the snapshot knows it: the distinct authors of its points (at least one).
  const authors = new Set(snapshot.nodes.flatMap((node) => node.authorModel === null ? [] : [node.authorModel]));
  const panelSize = Math.max(1, authors.size);
  const alsoRaised = storyAlsoRaisedRanked(snapshot.alsoRaised ?? [], panelSize);
  let lastBytes = 0;
  for (const [step, shrink] of STORY_SHRINK_LADDER.entries()) {
    const fitted = materialAt(shrink);
    if (fitted.material.bytes <= budgetBytes) {
      const material = storyWithAlsoRaised(fitted.material, alsoRaised, shrink.claimChars, budgetBytes, input.alsoRaisedWhole === true);
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
          engineTokens: storyEngineTokens(material),
          // Story v4 (R1d, design decision 2): the one shape code chose; the reader sets it on the decoded story.
          ...(input.v4 === undefined ? {} : { fixedShapeId: input.v4.shapeId })
        }),
        refMap,
        compressionStep: step
      });
    }
    lastBytes = fitted.material.bytes;
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

/**
 * Charts (design 2026-10-28): the chart call's fenced fields: the same material, then the report's text it may put a
 * chart under (the reasons and the long version, with the short references the model reads).
 */
export function toChartsPromptMaterial(
  material: StoryMaterial,
  story: StoryBody,
  /** Data blocks (2026-10-30): each claim's figures as code read them (blocks.ts `storyFiguresField`). */
  figures: readonly Readonly<{ id: string; figures: readonly string[] }>[] = []
): readonly FramedMaterialField[] {
  const fields = [
    ...storyCoreFields(material),
    { name: "report_text", content: JSON.stringify({ why: story.why, long: story.long }) },
    { name: "figures", content: JSON.stringify(figures) }
  ];
  return Object.freeze(fields.map((field) => Object.freeze(field)));
}

/** Charts (design 2026-10-28): every position's and point's claim, by the short reference the models read. */
export function storyMaterialClaims(material: Pick<StoryMaterial, "positions" | "points">): ReadonlyMap<string, string> {
  return new Map([...material.positions, ...material.points].map((entry) => [entry.id, entry.claim] as const));
}

/**
 * Story v4 round 2 (R1d, spec §7.2 item 8): the accepted round-1 draft as the storyteller's own answer, in the v4 form's
 * order (short, why, reviewer_note, long last) and without `shape_id`, which the v4 form never asks for (code sets it).
 * Its references are the material's short ones, as the model wrote them.
 */
export function storyDraftText(body: StoryBody): string {
  return JSON.stringify({ short: body.short, why: body.why, reviewer_note: body.reviewer_note, long: body.long });
}

/** A v4 round-2 request: its fresh frame, the packet to send, and its full re-ask under the same fence. */
export interface FramedRevision {
  readonly framed: FramedPrompt;
  readonly packet: PromptPacket;
  readonly buildRepairPacket: (rejected: RejectedProviderContent) => PromptPacket;
}

/**
 * Story v4 round 2 (R1d, design decision 3): a FRESH call (a new fence, owner answer Q3) whose material is round 1's,
 * unchanged (no `prior_objection`, so the material block is round 1's bytes apart from the fence; the system message's
 * stable prefix caches, the material does not, because of the fresh fence, owner answer Q3),
 * then the draft as the model's own turn and the checker's problems in one revision block (`buildFramedRevisionPrompt`).
 * A content refusal of this call is re-asked by `buildRepairPacket`, which keeps this call's fence.
 */
export function buildStoryRevisionPrompt(input: Readonly<{
  contract: PromptContract;
  material: readonly FramedMaterialField[];
  ownDraft: string;
  problems: string;
}>): FramedRevision {
  const framed = buildFramedPrompt({ contract: input.contract, material: input.material });
  const packet = buildFramedRevisionPrompt(framed.packet, input.ownDraft, input.problems);
  return Object.freeze({
    framed,
    packet,
    buildRepairPacket: (rejected: RejectedProviderContent): PromptPacket =>
      buildFramedRevisionPrompt(framed.packet, input.ownDraft, input.problems, schemaFailureLocator(rejected))
  });
}
