import { CONDITION_MARKS } from "@debateai/kernel";
import type { Answer, AnswerStory, ConditionMark, Edge, MakerLineage } from "@debateai/contract";
import { AI_NOTICE } from "../aiDisclosure.js";
import { contractNodesById, v3ScorePercentage, wayOfKnowingLabel } from "../v3/adapter.js";
import { conditionMarkLabel } from "../v3/labels.js";
import { storyConfidenceWords, storyLabelSentence, storyLabelWords } from "../v3/storyView.js";
import {
  STORY_CHANGE_LEAD,
  STORY_FATE_WORDS,
  STORY_RESERVATION_TITLE,
  STORY_REVIEWER_NOTE_CAVEAT,
  STORY_REVIEWER_NOTE_TITLE,
  countStoryPositions,
  morePathsWords,
  type StoryFateValue
} from "../v3/storyWords.js";
import { orderedPoints, type NumberedPoint } from "./pointNumbers.js";

/**
 * Every string the PDF prints (spec 2026-09-26 §10), built by a pure function
 * so it can be tested without rendering a PDF. The label and every number come
 * from the arithmetic; the story's text is copied as plain text. The only links
 * are built here: a [Pn] citation from a paragraph's node refs, and a point
 * number the story's own text names ("P7") when the appendix has that point.
 * Both point at the appendix entry; nothing a model wrote becomes a link.
 * Fixed headings are English; the story is in the question's language.
 */

export const REPORT_TITLES = Object.freeze({
  inShort: "In short",
  story: "The full story",
  reviewerNote: STORY_REVIEWER_NOTE_TITLE,
  reservation: STORY_RESERVATION_TITLE,
  computation: "How this verdict was computed",
  appendix: "Appendix: every point",
  about: "About this report"
});

/**
 * A run of plain text; a citation the code adds after a paragraph (printed
 * " [P7]"); or a point number the text itself names (printed as written). The
 * two link kinds point at the appendix entry's anchor.
 */
export type ReportSpan =
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{ kind: "cite"; label: string; anchor: string }>
  | Readonly<{ kind: "mention"; label: string; anchor: string }>;

export interface ReportParagraph {
  readonly spans: readonly ReportSpan[];
}

export interface ReportPathLine {
  readonly fate: StoryFateValue;
  readonly fateWords: string;
  readonly line: ReportParagraph;
}

export interface ReportAppendixEntry {
  readonly number: string;
  readonly anchor: string;
  readonly stance: string;
  readonly claim: string;
  readonly scores: string;
  readonly wayOfKnowing: string;
  readonly author: string;
  readonly review: string;
  readonly setAside: string | null;
  readonly marks: readonly string[];
  /** The printed lines for the two optional facts, "Set aside: …" and "Marks: …", or null. */
  readonly setAsideLine: string | null;
  readonly marksLine: string | null;
}

export interface ReportRule {
  /** "1" to "5": the order the rules are checked in (the engine's rung plus one). */
  readonly number: string;
  readonly condition: string;
  readonly result: string;
  readonly applied: boolean;
}

export interface ReportRow {
  readonly label: string;
  readonly value: string;
}

export interface ReportModel {
  readonly documentTitle: string;
  /** Every page's footer; `pageWords` holds {page} and {pages}, filled in as each page is laid out. */
  readonly footer: Readonly<{ text: string; pageWords: string }>;
  readonly cover: Readonly<{
    eyebrow: string;
    question: string;
    labelWords: string;
    labelSentence: string;
    confidenceWords: string | null;
    generatedLine: string;
    models: readonly string[];
    modelsLine: string;
    disclosure: readonly string[];
  }>;
  readonly inShort: Readonly<{
    title: string;
    headline: string;
    summary: string;
    paths: readonly ReportPathLine[];
    morePaths: string | null;
    changeLead: string;
    change: ReportParagraph;
  }>;
  readonly storyTitle: string;
  readonly storyIntro: string;
  readonly sections: readonly Readonly<{ title: string; paragraphs: readonly ReportParagraph[] }>[];
  readonly reviewerNote: Readonly<{ title: string; caveat: string; paragraph: ReportParagraph }> | null;
  readonly reservation: Readonly<{ title: string; paragraph: ReportParagraph }> | null;
  readonly computation: Readonly<{
    title: string;
    intro: string;
    tableHead: Readonly<{ rule: string; when: string; label: string }>;
    rules: readonly ReportRule[];
    /** The words that mark the rule that decided this debate. */
    appliedWords: string;
    numbersTitle: string | null;
    numbers: readonly ReportRow[];
    decision: string;
    explanation: string;
    marks: readonly string[];
    marksLine: string | null;
  }>;
  readonly appendix: Readonly<{ title: string; intro: string; entries: readonly ReportAppendixEntry[] }>;
  readonly about: Readonly<{ title: string; rows: readonly ReportRow[] }>;
}

type VerdictBasis = NonNullable<AnswerStory["verdict_basis"]>;

export function pointAnchor(number: string): string {
  return `point-${number}`;
}

/** A point number as the story checks read one (packages/story, apps/ui storyView): "P" and a number from 1, standing alone. */
const POINT_MENTION = /\bP[1-9][0-9]*\b/gu;

/** The text as plain runs, with each point number it names that the appendix has turned into a link. */
function textSpans(text: string, known: ReadonlySet<string>): ReportSpan[] {
  const spans: ReportSpan[] = [];
  let last = 0;
  for (const match of text.matchAll(POINT_MENTION)) {
    const label = match[0];
    if (!known.has(label)) continue;
    if (match.index > last) spans.push({ kind: "text", text: text.slice(last, match.index) });
    spans.push({ kind: "mention", label, anchor: pointAnchor(label) });
    last = match.index + label.length;
  }
  if (last < text.length) spans.push({ kind: "text", text: text.slice(last) });
  return spans;
}

function paragraph(text: string, nodeRefs: readonly string[], numbers: ReadonlyMap<string, string>): ReportParagraph {
  const spans = textSpans(text, new Set(numbers.values()));
  const seen = new Set<string>();
  for (const ref of nodeRefs) {
    const number = numbers.get(ref);
    if (number === undefined || seen.has(number)) continue;
    seen.add(number);
    spans.push({ kind: "cite", label: number, anchor: pointAnchor(number) });
  }
  return { spans };
}

/**
 * Words with no space to break at, such as a web address a model copied into its text. The PDF never
 * splits an ordinary word (the story is in the question's language, so no hyphenation), but a word
 * longer than `longerThan` characters would run off the page. It may break after / ? & = - _ . and at
 * least every `pieceLength` characters (spec 2026-09-26 §10). The text itself is never changed.
 */
export const REPORT_WORD_BREAK = Object.freeze({ longerThan: 30, pieceLength: 20 });
const BREAK_AFTER = new Set(["/", "?", "&", "=", "-", "_", "."]);
const GRAPHEMES = new Intl.Segmenter("und", { granularity: "grapheme" });

/** The pieces a word may break between, in order (joined, they are the word). One piece when it is short enough. */
export function reportWordPieces(word: string): string[] {
  const characters = Array.from(GRAPHEMES.segment(word), (part) => part.segment);
  if (characters.length <= REPORT_WORD_BREAK.longerThan) return [word];
  const pieces: string[] = [];
  let piece = "";
  let length = 0;
  for (const character of characters) {
    piece += character;
    length += 1;
    if (BREAK_AFTER.has(character) || length === REPORT_WORD_BREAK.pieceLength) {
      pieces.push(piece);
      piece = "";
      length = 0;
    }
  }
  if (piece.length > 0) pieces.push(piece);
  return pieces;
}

function formatUtc(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function lineageWords(lineage: MakerLineage | null): string | null {
  return lineage === null ? null : `${lineage.maker} · ${lineage.model_id}`;
}

function score(value: number): string {
  return value.toFixed(2);
}

/** A long hex fingerprint in groups of eight, so it wraps at a space; anything else as it is. */
function fingerprintWords(fingerprint: string): string {
  return /^[0-9a-f]{17,}$/iu.test(fingerprint) ? (fingerprint.match(/.{1,8}/gu) ?? [fingerprint]).join(" ") : fingerprint;
}

function markWords(mark: string): string {
  return (CONDITION_MARKS as readonly string[]).includes(mark) ? conditionMarkLabel(mark as ConditionMark) : mark;
}

function uniqueModels(answer: Answer): string[] {
  const models: string[] = [];
  const add = (lineage: MakerLineage | null) => {
    const words = lineageWords(lineage);
    if (words !== null && !models.includes(words)) models.push(words);
  };
  for (const node of answer.nodes) {
    add(node.maker_lineage);
    add(node.review === null ? null : node.review.reviewer_lineage);
  }
  return models;
}

const COMPUTATION_WORDS = Object.freeze({
  tableHead: Object.freeze({ rule: "Rule", when: "When", label: "Label" }),
  appliedWords: "This debate",
  numbersTitle: "This debate's numbers"
});

function marksLine(marks: readonly string[]): string | null {
  return marks.length === 0 ? null : `Marks: ${marks.join("; ")}`;
}

const COMPUTATION_INTRO =
  "The label is not written by the AI. Code computes it from the final scores of the positions, which run from 0 to 1. The winner is the position with the highest final score, the margin is how far it is ahead of the runner-up, and the judges' disagreement is how much the AI judges differed when they scored the winner. The rules below are checked in order, and the first one that matches decides.";

function withPoint(point: string | undefined, value: string): string {
  return point === undefined ? value : `${value} (${point})`;
}

/**
 * score() rounds to two decimals, so an engine-legal margin of 0.052 against a tie margin of 0.05 would
 * read "0.05 > 0.05", and a winner of 0.698 "did not reach 0.70" while printed as 0.70. Rounding must
 * never contradict a comparison: each value and the threshold it is compared with are printed with the
 * same number of decimals, the fewest from `fewest` to `most` that keep a real difference visible.
 * Equal values stay at `fewest`; a difference past the last decimal is not chased further.
 */
const COMPARE_DECIMALS = Object.freeze({ fewest: 2, most: 4 });

function comparedDecimals(value: number, threshold: number): number {
  for (let decimals = COMPARE_DECIMALS.fewest; decimals < COMPARE_DECIMALS.most; decimals += 1) {
    if (value === threshold || value.toFixed(decimals) !== threshold.toFixed(decimals)) return decimals;
  }
  return COMPARE_DECIMALS.most;
}

/** The basis's compared numbers as the verdict page prints them (the decision line, the explanation, the numbers). */
interface ComparedTexts {
  readonly winner: string;
  readonly lowCut: string;
  readonly highCut: string;
  readonly margin: string | null;
  readonly gamma: string;
  readonly disagreement: string | null;
  readonly limit: string;
}

function comparedTexts(basis: VerdictBasis): ComparedTexts {
  const t = basis.thresholds;
  // The winner is compared with both cuts (between them, in the middle band), so all three share one precision.
  const winner = Math.max(comparedDecimals(basis.winner_strength, t.low_cut), comparedDecimals(basis.winner_strength, t.high_cut));
  const margin = basis.margin === null ? COMPARE_DECIMALS.fewest : comparedDecimals(basis.margin, t.gamma);
  const disagreement = basis.disagreement === null
    ? COMPARE_DECIMALS.fewest
    : comparedDecimals(basis.disagreement, t.disagreement);
  return {
    winner: basis.winner_strength.toFixed(winner),
    lowCut: t.low_cut.toFixed(winner),
    highCut: t.high_cut.toFixed(winner),
    margin: basis.margin === null ? null : basis.margin.toFixed(margin),
    gamma: t.gamma.toFixed(margin),
    disagreement: basis.disagreement === null ? null : basis.disagreement.toFixed(disagreement),
    limit: t.disagreement.toFixed(disagreement)
  };
}

/** "judges' disagreement 0.12 < 0.25", or the limit alone when the disagreement was not measured. */
function disagreementBelowLimit(shown: ComparedTexts): string {
  return shown.disagreement === null
    ? `judges' disagreement below ${shown.limit}`
    : `judges' disagreement ${shown.disagreement} < ${shown.limit}`;
}

/** A no-break space on both sides of < > ≤ ≥ →, so a comparison is never split across two lines. */
function keepComparisonsTogether(line: string): string {
  return line.replace(/ ([<>≤≥→]) /gu, "\u00A0$1\u00A0");
}

function decisionLine(basis: VerdictBasis): string {
  return keepComparisonsTogether(decisionWords(basis));
}

function decisionWords(basis: VerdictBasis): string {
  const shown = comparedTexts(basis);
  const label = storyLabelWords(basis.label);
  const winner = shown.winner;
  const margin = shown.margin ?? "not measured";
  const runner = basis.runner_up_strength === null ? "not scored" : score(basis.runner_up_strength);
  if (basis.trigger === "BASIS_INCOMPLETE") {
    if (basis.runner_up_node_id === null) return `Only one position was argued, so there is no margin to measure → ${label}`;
    if (basis.margin === null) return `The margin over the runner-up could not be measured → ${label}`;
    return `The judges' disagreement could not be measured → ${label}`;
  }
  if (basis.trigger === "BELOW_LOW_CUT") return `winner ${winner} < ${shown.lowCut} → ${label}`;
  if (basis.trigger === "MARGIN_WITHIN_GAMMA") {
    return `winner ${score(basis.winner_strength)}, runner-up ${runner}, margin ${margin} ≤ ${shown.gamma} → ${label}`;
  }
  if (basis.trigger === "DISAGREEMENT_AT_THRESHOLD") {
    const disagreed = shown.disagreement === null
      ? `the judges' disagreement reached the limit of ${shown.limit}`
      : `the judges disagreed by ${shown.disagreement} ≥ ${shown.limit}`;
    return `margin ${margin} > ${shown.gamma}, but ${disagreed} → ${label}`;
  }
  if (basis.trigger === "AT_OR_ABOVE_HIGH_CUT") {
    return `winner ${winner} ≥ ${shown.highCut}, margin ${margin} > ${shown.gamma}, ${disagreementBelowLimit(shown)} → ${label}`;
  }
  if (basis.trigger === "MID_BAND") {
    return `winner ${winner} is between ${shown.lowCut} and ${shown.highCut}, margin ${margin} > ${shown.gamma}, ${disagreementBelowLimit(shown)} → ${label}`;
  }
  return `Rule ${basis.rung + 1} decided (${basis.trigger}) → ${label}`;
}

/**
 * "ahead of the runner-up by 0.06, more than the tie margin of 0.05 (…)": exactly what the rule checks.
 * A margin just above the tie margin is not "clearly" ahead, so the words never say so.
 */
function aheadWords(shown: ComparedTexts): string {
  const margin = shown.margin ?? "a margin that was not measured";
  return `ahead of the runner-up by ${margin}, more than the tie margin of ${shown.gamma} (a lead of ${shown.gamma} or less counts as a tie)`;
}

/** "the judges' disagreement, 0.12, stayed below the limit of 0.25", or the limit alone when it was not measured. */
function agreementWords(shown: ComparedTexts): string {
  return shown.disagreement === null
    ? `the judges' disagreement stayed below the limit of ${shown.limit}`
    : `the judges' disagreement, ${shown.disagreement}, stayed below the limit of ${shown.limit}`;
}

/** The decision in plain words, for the rule that actually decided; every number comes from the basis. */
function explanation(basis: VerdictBasis): string {
  const shown = comparedTexts(basis);
  const label = storyLabelWords(basis.label);
  const rule = `rule ${basis.rung + 1}`;
  const winner = shown.winner;
  switch (basis.trigger) {
    case "BASIS_INCOMPLETE":
      if (basis.runner_up_node_id === null) {
        return `Only one position was argued in this debate, so there was nothing to compare it with, and the engine cannot call it settled. Without a runner-up there is no margin, so ${rule} applies and the label is ${label}. The position's own score is shown above.`;
      }
      if (basis.margin === null) {
        return `The runner-up's score could not be compared with the winner's, so the margin could not be measured. Without it the engine cannot call the question settled, so ${rule} applies and the label is ${label}.`;
      }
      return `The judges' disagreement about the leading position could not be measured, for example because only one judge's score survived. Without it the engine cannot call the question settled, so ${rule} applies and the label is ${label}.`;
    case "BELOW_LOW_CUT":
      return `Even the leading position scored ${winner}, below ${shown.lowCut}, so ${rule} applies and the label is ${label}: a weak case, not a disproved one.`;
    case "MARGIN_WITHIN_GAMMA":
      return `The leading position was ahead by only ${shown.margin ?? "an unmeasured margin"}, which is ${shown.gamma} or less: too close to pick a winner. So ${rule} applies and the label is ${label}.`;
    case "DISAGREEMENT_AT_THRESHOLD":
      return `The leading position was ${aheadWords(shown)}, but the judges disagreed about it ${shown.disagreement === null ? "at least as much as" : `by ${shown.disagreement}, reaching`} the limit of ${shown.limit}. When the judges disagree that much the engine does not call the question settled, so ${rule} applies and the label is ${label}.`;
    case "AT_OR_ABOVE_HIGH_CUT":
      return `The leading position scored ${winner}, at or above ${shown.highCut}. It was ${aheadWords(shown)}, and ${agreementWords(shown)}. So ${rule} applies and the label is ${label}.`;
    case "MID_BAND":
      return `The leading position was ${aheadWords(shown)}, and ${agreementWords(shown)}. But its score of ${winner} did not reach ${shown.highCut}, the score needed for ${storyLabelWords("SUPPORTED")}. So ${rule} applies and the label is ${label}.`;
    default:
      return storyLabelSentence(basis.label);
  }
}

function computation(basis: VerdictBasis | null, numbers: ReadonlyMap<string, string>): ReportModel["computation"] {
  if (basis === null) {
    return {
      title: REPORT_TITLES.computation,
      intro: COMPUTATION_INTRO,
      tableHead: COMPUTATION_WORDS.tableHead,
      rules: [],
      appliedWords: COMPUTATION_WORDS.appliedWords,
      numbersTitle: null,
      numbers: [],
      decision: "The numbers behind this verdict were not stored with the story.",
      explanation: "",
      marks: [],
      marksLine: null
    };
  }
  const t = basis.thresholds;
  const runnerPoint = basis.runner_up_node_id === null ? undefined : numbers.get(basis.runner_up_node_id);
  const conditions = [
    { condition: "Part of the comparison is missing: the margin or the judges' disagreement could not be measured, for example because only one position was argued", result: "CONTESTED" },
    { condition: `The winner scores below ${score(t.low_cut)}`, result: "UNSUPPORTED" },
    { condition: `The margin is ${score(t.gamma)} or less, or the judges' disagreement is ${score(t.disagreement)} or more`, result: "CONTESTED" },
    { condition: `The winner scores ${score(t.high_cut)} or more`, result: "SUPPORTED" },
    { condition: `Anything else: the winner scores at least ${score(t.low_cut)} but less than ${score(t.high_cut)}`, result: "CONTESTED" }
  ] as const;
  const marks = basis.marks.map(markWords);
  // The numbers beside the rule table use the same precision as the decision line, so they never disagree.
  const shown = comparedTexts(basis);
  return {
    title: REPORT_TITLES.computation,
    intro: COMPUTATION_INTRO,
    tableHead: COMPUTATION_WORDS.tableHead,
    appliedWords: COMPUTATION_WORDS.appliedWords,
    numbersTitle: COMPUTATION_WORDS.numbersTitle,
    rules: conditions.map((rule, rung) => ({
      number: String(rung + 1),
      condition: rule.condition,
      result: storyLabelWords(rule.result),
      applied: basis.rung === rung
    })),
    numbers: [
      { label: "Winner (the leading position)", value: withPoint(numbers.get(basis.winner_node_id), shown.winner) },
      {
        label: "Runner-up",
        value: basis.runner_up_node_id === null
          ? "None. Only one position was put forward."
          : withPoint(runnerPoint, basis.runner_up_strength === null ? "not scored" : score(basis.runner_up_strength))
      },
      {
        label: "Margin (how far the winner is ahead)",
        value: shown.margin !== null
          ? shown.margin
          : basis.runner_up_node_id === null ? "Not measured. There was no runner-up." : "Not measured."
      },
      {
        label: "Judges' disagreement",
        value: shown.disagreement === null
          ? `Not measured. The limit is ${shown.limit}.`
          : `${shown.disagreement} (the limit is ${shown.limit})`
      },
      { label: "Label", value: storyLabelWords(basis.label) }
    ],
    decision: decisionLine(basis),
    explanation: explanation(basis),
    marks,
    marksLine: marksLine(marks)
  };
}

const REVIEW_WORDS = Object.freeze({
  agree: "agreed with it",
  dispute: "disputed it",
  "cannot-assess": "could not assess it"
});

const RELATION_WORDS: Readonly<Record<Edge["relation"], string>> = Object.freeze({
  support: "Supports",
  attack: "Challenges",
  defeat: "Challenges",
  "shared-crux": "Shared crux with"
});

/**
 * The top of the site's tree holds the positions, but also any point whose
 * argument the tree cannot draw: one that argues about a link between two
 * points, or one caught in a loop. The story's rule (countStoryPositions) says
 * only a point that argues about nothing else is a position, so the others say
 * what they argue about.
 */
function topStance(nodeId: string, answer: Answer, numbers: ReadonlyMap<string, string>): string {
  const edge = answer.edges.find((item) =>
    item.from_node_ref === nodeId && !(item.target_kind === "NODE" && item.target_ref === nodeId));
  if (edge === undefined) return "Position";
  const verb = RELATION_WORDS[edge.relation];
  if (edge.target_kind === "EDGE") {
    const link = answer.edges.find((item) => item.edge_id === edge.target_ref);
    const from = link === undefined ? undefined : numbers.get(link.from_node_ref);
    const to = link === undefined || link.target_kind !== "NODE" ? undefined : numbers.get(link.target_ref);
    return from === undefined || to === undefined ? `${verb} a link between two points` : `${verb} the link from ${from} to ${to}`;
  }
  const target = numbers.get(edge.target_ref);
  return target === undefined ? `${verb} a point that is not in this report` : `${verb} ${target}`;
}

function stanceWords(point: NumberedPoint, answer: Answer, numbers: ReadonlyMap<string, string>): string {
  if (point.parentNumber === null) return topStance(point.node.id, answer, numbers);
  if (point.node.node_type === "PRO") return `Supports ${point.parentNumber}`;
  if (point.node.node_type === "CON") return `Challenges ${point.parentNumber}`;
  if (point.node.node_type === "SHARED-CRUX") return `Shared crux with ${point.parentNumber}`;
  return `Linked to ${point.parentNumber}`;
}

function appendixEntry(point: NumberedPoint, node: Answer["nodes"][number], stance: string): ReportAppendixEntry {
  const base = v3ScorePercentage(node.base_score.value).text;
  const final = node.final_strength === null ? null : v3ScorePercentage(node.final_strength.value).text;
  const frozen = node.condition_marks.includes("BRANCH-FROZEN-LOW-LEVERAGE");
  const author = lineageWords(node.maker_lineage);
  const setAside = point.node.stopping_reason_human ?? (frozen ? conditionMarkLabel("BRANCH-FROZEN-LOW-LEVERAGE") : null);
  const marks = node.condition_marks.filter((mark) => mark !== "BRANCH-FROZEN-LOW-LEVERAGE").map(conditionMarkLabel);
  return {
    number: point.number,
    anchor: pointAnchor(point.number),
    stance,
    claim: node.claim,
    scores: final === null ? `${base} alone · final score withheld` : `${base} alone → ${final} after weighing`,
    wayOfKnowing: `How it is known: ${wayOfKnowingLabel(node.way_of_knowing)}`,
    author: author === null ? "Author model not recorded" : `Written by ${author}`,
    review: node.review === null
      ? "No cross-model review recorded."
      : [
          `Reviewer (${lineageWords(node.review.reviewer_lineage) ?? "model not recorded"}) ${REVIEW_WORDS[node.review.outcome]}.`,
          ...node.review.reasons
        ].join(" "),
    setAside,
    marks,
    setAsideLine: setAside === null ? null : `Set aside: ${setAside}`,
    marksLine: marksLine(marks)
  };
}

export function buildReportModel(answer: Answer, story: AnswerStory, generatedAt: Date): ReportModel {
  const body = story.story;
  if (body === null || (story.status !== "READY" && story.status !== "READY_WITH_RESERVATION")) {
    throw new TypeError("REPORT_STORY_NOT_READY");
  }
  const points = orderedPoints(answer, story);
  const numbers = new Map(points.map((point) => [point.node.id, point.number]));
  const contractNodes = contractNodesById(answer);
  const models = uniqueModels(answer);
  const basis = story.verdict_basis;
  const computed = computation(basis, numbers);
  return {
    documentTitle: `Debate report: ${answer.question_line}`,
    footer: { text: "DebateAI · AI-generated report", pageWords: "Page {page} of {pages}" },
    cover: {
      eyebrow: "DebateAI · Debate report",
      question: answer.question_line,
      labelWords: storyLabelWords(answer.verdict_state),
      labelSentence: storyLabelSentence(answer.verdict_state),
      confidenceWords: storyConfidenceWords(answer.confidence_band),
      generatedLine: `Generated ${formatUtc(generatedAt)}`,
      models,
      modelsLine: models.length === 0 ? "Models that took part: not recorded" : `Models that took part: ${models.join(", ")}`,
      disclosure: [
        AI_NOTICE.debate,
        "The story in this report was written by an AI storyteller and checked by a second AI model. The label comes from the scores, not from the story."
      ]
    },
    inShort: {
      title: REPORT_TITLES.inShort,
      headline: body.short.headline,
      summary: body.short.summary,
      paths: body.short.paths.map((path) => ({
        fate: path.fate,
        fateWords: STORY_FATE_WORDS[path.fate],
        line: paragraph(path.line, path.node_refs, numbers)
      })),
      morePaths: morePathsWords(countStoryPositions(answer.nodes, answer.edges) - body.short.paths.length),
      changeLead: STORY_CHANGE_LEAD,
      change: paragraph(body.short.change.text, body.short.change.node_refs, numbers)
    },
    storyTitle: REPORT_TITLES.story,
    storyIntro: "Written by an AI storyteller from the debate's own record and checked by a second AI model. A number such as [P3] points to that point in the appendix at the end of this report.",
    sections: body.long.sections.map((section) => ({
      title: section.title,
      paragraphs: section.paragraphs.map((item) => paragraph(item.text, item.node_refs, numbers))
    })),
    reviewerNote: body.reviewer_note === null ? null : {
      title: REPORT_TITLES.reviewerNote,
      caveat: STORY_REVIEWER_NOTE_CAVEAT,
      paragraph: paragraph(body.reviewer_note.text, body.reviewer_note.node_refs, numbers)
    },
    // The box's title, then the checker's own words (no second lead, as on the owner's panel).
    reservation: story.status === "READY_WITH_RESERVATION" && story.reservation !== null
      ? { title: REPORT_TITLES.reservation, paragraph: paragraph(story.reservation, [], numbers) }
      : null,
    computation: computed,
    appendix: {
      title: REPORT_TITLES.appendix,
      intro: "Every point the debate produced, under the numbers the story uses: the positions first, then the points under them. Each entry's first line says which point it supports or challenges. Each point has two scores: the judges' score for the point alone, and its score after the arguments for and against it were weighed.",
      entries: points.flatMap((point) => {
        const node = contractNodes.get(point.node.id);
        return node === undefined ? [] : [appendixEntry(point, node, stanceWords(point, answer, numbers))];
      })
    },
    about: {
      title: REPORT_TITLES.about,
      rows: [
        { label: "Question", value: answer.question_line },
        { label: "Answer", value: `${answer.answer_id}, version ${answer.answer_version}` },
        { label: "Report generated", value: formatUtc(generatedAt) },
        { label: "Story written", value: story.written_at === null ? "Not recorded" : formatUtc(new Date(story.written_at)) },
        { label: "Storyteller model", value: lineageWords(story.storyteller) ?? "Not recorded" },
        { label: "Checker model", value: lineageWords(story.checker) ?? "Not recorded" },
        { label: "Write-and-check rounds", value: story.rounds === null ? "Not recorded" : String(story.rounds) },
        { label: "Story shape", value: story.shape === null ? "Not recorded" : `${story.shape.title} (${story.shape.id})` },
        { label: "Shape pack version", value: story.pack === null ? "Not recorded" : story.pack.version },
        { label: "Shape pack fingerprint", value: story.pack === null ? "Not recorded" : fingerprintWords(story.pack.fingerprint) },
        // The rule's number on the computation page and the label it gives, never the engine's trigger name.
        {
          label: "Label rule",
          value: basis === null
            ? "Not recorded"
            : `Rule ${basis.rung + 1} of ${computed.rules.length}, which gives ${storyLabelWords(basis.label)}`
        }
      ]
    }
  };
}
