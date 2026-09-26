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
  readonly cover: Readonly<{
    eyebrow: string;
    question: string;
    labelWords: string;
    labelSentence: string;
    confidenceWords: string | null;
    generatedLine: string;
    models: readonly string[];
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
    rules: readonly ReportRule[];
    numbers: readonly ReportRow[];
    decision: string;
    explanation: string;
    marks: readonly string[];
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

const COMPUTATION_INTRO =
  "The label is not written by the AI. Code computes it from the final scores of the positions, which run from 0 to 1. The winner is the position with the highest final score, the margin is how far it is ahead of the runner-up, and the judges' disagreement is how much the AI judges differed when they scored the winner. The rules below are checked in order, and the first one that matches decides.";

function withPoint(point: string | undefined, value: string): string {
  return point === undefined ? value : `${value} (${point})`;
}

/** "judges' disagreement 0.12 < 0.25", or the limit alone when the disagreement was not measured. */
function disagreementBelowLimit(basis: VerdictBasis): string {
  const limit = score(basis.thresholds.disagreement);
  return basis.disagreement === null
    ? `judges' disagreement below ${limit}`
    : `judges' disagreement ${score(basis.disagreement)} < ${limit}`;
}

function decisionLine(basis: VerdictBasis): string {
  const t = basis.thresholds;
  const label = storyLabelWords(basis.label);
  const winner = score(basis.winner_strength);
  const margin = basis.margin === null ? "not measured" : score(basis.margin);
  const runner = basis.runner_up_strength === null ? "not scored" : score(basis.runner_up_strength);
  if (basis.trigger === "BASIS_INCOMPLETE") {
    if (basis.runner_up_node_id === null) return `Only one position was argued, so there is no margin to measure → ${label}`;
    if (basis.margin === null) return `The margin over the runner-up could not be measured → ${label}`;
    return `The judges' disagreement could not be measured → ${label}`;
  }
  if (basis.trigger === "BELOW_LOW_CUT") return `winner ${winner} < ${score(t.low_cut)} → ${label}`;
  if (basis.trigger === "MARGIN_WITHIN_GAMMA") {
    return `winner ${winner}, runner-up ${runner}, margin ${margin} ≤ ${score(t.gamma)} → ${label}`;
  }
  if (basis.trigger === "DISAGREEMENT_AT_THRESHOLD") {
    const disagreed = basis.disagreement === null
      ? `the judges' disagreement reached the limit of ${score(t.disagreement)}`
      : `the judges disagreed by ${score(basis.disagreement)} ≥ ${score(t.disagreement)}`;
    return `margin ${margin} > ${score(t.gamma)}, but ${disagreed} → ${label}`;
  }
  if (basis.trigger === "AT_OR_ABOVE_HIGH_CUT") {
    return `winner ${winner} ≥ ${score(t.high_cut)}, margin ${margin} > ${score(t.gamma)}, ${disagreementBelowLimit(basis)} → ${label}`;
  }
  if (basis.trigger === "MID_BAND") {
    return `winner ${winner} is between ${score(t.low_cut)} and ${score(t.high_cut)}, margin ${margin} > ${score(t.gamma)}, ${disagreementBelowLimit(basis)} → ${label}`;
  }
  return `Rule ${basis.rung + 1} decided (${basis.trigger}) → ${label}`;
}

/** The decision in plain words, for the rule that actually decided; every number comes from the basis. */
function explanation(basis: VerdictBasis): string {
  const t = basis.thresholds;
  const label = storyLabelWords(basis.label);
  const rule = `rule ${basis.rung + 1}`;
  const winner = score(basis.winner_strength);
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
      return `Even the leading position scored ${winner}, below ${score(t.low_cut)}, so ${rule} applies and the label is ${label}: a weak case, not a disproved one.`;
    case "MARGIN_WITHIN_GAMMA":
      return `The leading position was ahead by only ${basis.margin === null ? "an unmeasured margin" : score(basis.margin)}, which is ${score(t.gamma)} or less: too close to pick a winner. So ${rule} applies and the label is ${label}.`;
    case "DISAGREEMENT_AT_THRESHOLD":
      return `The leading position was clearly ahead, but the judges disagreed about it ${basis.disagreement === null ? "at least as much as" : `by ${score(basis.disagreement)}, reaching`} the limit of ${score(t.disagreement)}. When the judges disagree that much the engine does not call the question settled, so ${rule} applies and the label is ${label}.`;
    case "AT_OR_ABOVE_HIGH_CUT":
      return `The leading position scored ${winner}, at or above ${score(t.high_cut)}. It was clearly ahead of the runner-up, and the judges broadly agreed, so ${rule} applies and the label is ${label}.`;
    case "MID_BAND":
      return `The leading position was clearly ahead and the judges broadly agreed, but its score of ${winner} did not reach ${score(t.high_cut)}, the score needed for ${storyLabelWords("SUPPORTED")}. So ${rule} applies and the label is ${label}.`;
    default:
      return storyLabelSentence(basis.label);
  }
}

function computation(basis: VerdictBasis | null, numbers: ReadonlyMap<string, string>): ReportModel["computation"] {
  if (basis === null) {
    return {
      title: REPORT_TITLES.computation,
      intro: COMPUTATION_INTRO,
      rules: [],
      numbers: [],
      decision: "The numbers behind this verdict were not stored with the story.",
      explanation: "",
      marks: []
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
  return {
    title: REPORT_TITLES.computation,
    intro: COMPUTATION_INTRO,
    rules: conditions.map((rule, rung) => ({
      number: String(rung + 1),
      condition: rule.condition,
      result: storyLabelWords(rule.result),
      applied: basis.rung === rung
    })),
    numbers: [
      { label: "Winner (the leading position)", value: withPoint(numbers.get(basis.winner_node_id), score(basis.winner_strength)) },
      {
        label: "Runner-up",
        value: basis.runner_up_node_id === null
          ? "None. Only one position was put forward."
          : withPoint(runnerPoint, basis.runner_up_strength === null ? "not scored" : score(basis.runner_up_strength))
      },
      {
        label: "Margin (how far the winner is ahead)",
        value: basis.margin !== null
          ? score(basis.margin)
          : basis.runner_up_node_id === null ? "Not measured. There was no runner-up." : "Not measured."
      },
      {
        label: "Judges' disagreement",
        value: basis.disagreement === null
          ? `Not measured. The limit is ${score(t.disagreement)}.`
          : `${score(basis.disagreement)} (the limit is ${score(t.disagreement)})`
      },
      { label: "Label", value: storyLabelWords(basis.label) }
    ],
    decision: decisionLine(basis),
    explanation: explanation(basis),
    marks: basis.marks.map(markWords)
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
    setAside: point.node.stopping_reason_human ?? (frozen ? conditionMarkLabel("BRANCH-FROZEN-LOW-LEVERAGE") : null),
    marks: node.condition_marks.filter((mark) => mark !== "BRANCH-FROZEN-LOW-LEVERAGE").map(conditionMarkLabel)
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
  return {
    documentTitle: `Debate report: ${answer.question_line}`,
    cover: {
      eyebrow: "DebateAI · Debate report",
      question: answer.question_line,
      labelWords: storyLabelWords(answer.verdict_state),
      labelSentence: storyLabelSentence(answer.verdict_state),
      confidenceWords: storyConfidenceWords(answer.confidence_band),
      generatedLine: `Generated ${formatUtc(generatedAt)}`,
      models,
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
    computation: computation(basis, numbers),
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
        { label: "Label rule", value: basis === null ? "Not recorded" : `Rule ${basis.rung + 1} (${basis.trigger})` }
      ]
    }
  };
}
