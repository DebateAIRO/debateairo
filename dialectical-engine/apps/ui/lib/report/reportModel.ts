import type { Answer, AnswerStory, ConditionMark, Edge, MakerLineage } from "@debateai/contract";
import { formatDate, formatNumber, t, type MessageCatalog } from "../i18n/translate.js";
import { contractNodesById, wayOfKnowingLabel } from "../v3/adapter.js";
import { countStoryPositions, morePathsWords, storyFateWords, storyLabelWords, type StoryFateValue } from "../v3/storyWords.js";
import { orderedPoints, type NumberedPoint } from "./pointNumbers.js";
import type { ReportCatalogs } from "./reportLanguage.js";

/**
 * Every string the PDF prints (spec 2026-09-26 §10, amended by §14), built by a
 * pure function so it can be tested without rendering a PDF. Every fixed word
 * comes from the catalogues of the report's one language, the question's
 * (lib/report/reportLanguage.ts); dates and numbers are formatted for it. The
 * label is the arithmetic label in human words; the story's text is copied as
 * plain text. The only links are built here: a [Pn] citation from a
 * paragraph's node refs, and a point number the story's own text names ("P7")
 * when the list of points has that point. Both point at that point's entry;
 * nothing a model wrote becomes a link.
 */

/**
 * A run of plain text; a citation the code adds after a paragraph (printed
 * " [P7]"); or a point number the text itself names (printed as written). The
 * two link kinds point at the point's entry in the list of points.
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
  /** How strong the point was on its own, and after the arguments for and against it were weighed. */
  readonly strength: string;
  readonly wayOfKnowing: string;
  readonly author: string;
  readonly review: string;
  /**
   * In plain words, why the point was left out of the conclusion, or why it
   * carried little weight in it (the debate did not follow it further); null
   * when neither.
   */
  readonly setAsideLine: string | null;
  /** The few notes a reader can use about the point (its source, its age, how many models weighed it), or null. */
  readonly notesLine: string | null;
}

export interface ReportRow {
  readonly label: string;
  readonly value: string;
}

export interface ReportModel {
  /** The report's one language: the question's locale. The PDF's /Lang, and the locale its page numbers are written in. */
  readonly language: string;
  readonly documentTitle: string;
  /** The PDF's Subject: the ENGLISH disclosure line, so a machine can read that the file is AI-generated. */
  readonly metadataSubject: string;
  /** Every page's footer; `pageWords` holds {page} and {total}, filled in by reportPageWords as each page is laid out. */
  readonly footer: Readonly<{ text: string; pageWords: string }>;
  readonly cover: Readonly<{
    eyebrow: string;
    question: string;
    /** The arithmetic label in human words; null for an answer without a verdict (no pill then). */
    labelWords: string | null;
    /** The storyteller's own sentence on how sure we are. */
    confidence: string;
    generatedLine: string;
    models: readonly string[];
    modelsLine: string;
    disclosure: string;
  }>;
  readonly inShort: Readonly<{
    title: string;
    headline: string;
    summary: string;
    paths: readonly ReportPathLine[];
    morePaths: string | null;
  }>;
  readonly storyTitle: string;
  readonly storyIntro: string;
  readonly sections: readonly Readonly<{ title: string; paragraphs: readonly ReportParagraph[] }>[];
  readonly reviewerNote: Readonly<{ title: string; paragraph: ReportParagraph }> | null;
  /** The gentle line for a story the checker kept a reservation about; never the checker's own words (spec §14.2). */
  readonly reservation: string | null;
  /** "Why this answer" (spec §14.2): the reasons that decided it, then what would change it. */
  readonly why: Readonly<{
    title: string;
    reasons: readonly ReportParagraph[];
    changeLead: string;
    change: ReportParagraph;
  }>;
  readonly appendix: Readonly<{ title: string; intro: string; entries: readonly ReportAppendixEntry[] }>;
  readonly about: Readonly<{ title: string; rows: readonly ReportRow[] }>;
}

export function pointAnchor(number: string): string {
  return `point-${number}`;
}

/** A point number as the story checks read one (packages/story, apps/ui storyView): "P" and a number from 1, standing alone. */
const POINT_MENTION = /\bP[1-9][0-9]*\b/gu;

/** The text as plain runs, with each point number it names that the list of points has turned into a link. */
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

/** A moment as the report prints it: the date and the minute, in UTC, the way the report's language writes them. */
const REPORT_MOMENT: Readonly<Intl.DateTimeFormatOptions> = Object.freeze({
  year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short"
});

function moment(locale: string, value: string | Date): string {
  return formatDate(locale, value, REPORT_MOMENT);
}

/**
 * A point's strength as a percentage in the report's language ("66%", "66 %",
 * "58,5 %"), to two decimals at most; a value that needs more is marked "≈"
 * rather than shown as exact.
 */
function percent(locale: string, value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  const text = formatNumber(locale, rounded, { style: "percent", maximumFractionDigits: 2 });
  return rounded === value ? text : `≈${text}`;
}

/** The page number line for one page, from the footer's template, with both numbers in the report's language. */
export function reportPageWords(model: Pick<ReportModel, "footer" | "language">, page: number, total: number): string {
  return model.footer.pageWords
    .replace("{page}", formatNumber(model.language, page))
    .replace("{total}", formatNumber(model.language, total));
}

function lineageWords(lineage: MakerLineage | null): string | null {
  return lineage === null ? null : `${lineage.maker} · ${lineage.model_id}`;
}

/**
 * The models, listed the way the report's language lists things. The short
 * unit list is the approved look, but CLDR puts no mark between its items in
 * some languages: none at all in zh, a bare space in ja, ko, ru, lt and tr
 * (measured with Node 26's ICU), so model names ran together on the cover.
 * A list whose every gap holds a visible character is kept as it is;
 * otherwise the language's own "and" list, which marks each gap; a comma
 * when neither does (or the locale is unknown).
 */
const LIST_TYPES: readonly Intl.ListFormatType[] = Object.freeze(["unit", "conjunction"]);

/** Every two items have a visible character between them (zh's list has no part at all there). */
function namesApart(parts: ReturnType<Intl.ListFormat["formatToParts"]>): boolean {
  const between = parts.map((part) => (part.type === "element" ? "|" : /\S/u.test(part.value) ? "v" : "")).join("");
  return !between.includes("||");
}

function listWords(locale: string, items: readonly string[]): string {
  for (const type of LIST_TYPES) {
    try {
      const parts = new Intl.ListFormat(locale, { style: "short", type }).formatToParts(items);
      if (namesApart(parts)) return parts.map((part) => part.value).join("");
    } catch {
      // A locale Intl does not know: try the next list, then the comma.
    }
  }
  return items.join(", ");
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

type Relation = "supports" | "challenges" | "sharedCrux";

function relationOf(relation: Edge["relation"]): Relation {
  switch (relation) {
    case "support": return "supports";
    case "attack":
    case "defeat": return "challenges";
    case "shared-crux": return "sharedCrux";
  }
}

/** "Supports P1", "Challenges P1", "Shared crux with P1". */
function relatedTo(relation: Relation, point: string, catalog: MessageCatalog): string {
  switch (relation) {
    case "supports": return t(catalog, "public.report.point.supports", { point });
    case "challenges": return t(catalog, "public.report.point.challenges", { point });
    case "sharedCrux": return t(catalog, "public.report.point.sharedCrux", { point });
  }
}

/** "Challenges the link from P5 to P1". */
function relatedToLink(relation: Relation, from: string, to: string, catalog: MessageCatalog): string {
  switch (relation) {
    case "supports": return t(catalog, "public.report.point.supportsLink", { from, to });
    case "challenges": return t(catalog, "public.report.point.challengesLink", { from, to });
    case "sharedCrux": return t(catalog, "public.report.point.sharedCruxLink", { from, to });
  }
}

/** "Challenges a link between two points": the link's ends are not in the report. */
function relatedToSomeLink(relation: Relation, catalog: MessageCatalog): string {
  switch (relation) {
    case "supports": return t(catalog, "public.report.point.supportsSomeLink");
    case "challenges": return t(catalog, "public.report.point.challengesSomeLink");
    case "sharedCrux": return t(catalog, "public.report.point.sharedCruxSomeLink");
  }
}

/** "Challenges a point that is not in this report". */
function relatedToMissing(relation: Relation, catalog: MessageCatalog): string {
  switch (relation) {
    case "supports": return t(catalog, "public.report.point.supportsMissing");
    case "challenges": return t(catalog, "public.report.point.challengesMissing");
    case "sharedCrux": return t(catalog, "public.report.point.sharedCruxMissing");
  }
}

/**
 * The top of the site's tree holds the positions, but also any point whose
 * argument the tree cannot draw: one that argues about a link between two
 * points, or one caught in a loop. The story's rule (countStoryPositions) says
 * only a point that argues about nothing else is a position, so the others say
 * what they argue about.
 */
function topStance(nodeId: string, answer: Answer, numbers: ReadonlyMap<string, string>, catalog: MessageCatalog): string {
  const edge = answer.edges.find((item) =>
    item.from_node_ref === nodeId && !(item.target_kind === "NODE" && item.target_ref === nodeId));
  if (edge === undefined) return t(catalog, "public.report.point.position");
  const relation = relationOf(edge.relation);
  if (edge.target_kind === "EDGE") {
    const link = answer.edges.find((item) => item.edge_id === edge.target_ref);
    const from = link === undefined ? undefined : numbers.get(link.from_node_ref);
    const to = link === undefined || link.target_kind !== "NODE" ? undefined : numbers.get(link.target_ref);
    return from === undefined || to === undefined
      ? relatedToSomeLink(relation, catalog)
      : relatedToLink(relation, from, to, catalog);
  }
  const target = numbers.get(edge.target_ref);
  return target === undefined ? relatedToMissing(relation, catalog) : relatedTo(relation, target, catalog);
}

function stanceWords(point: NumberedPoint, answer: Answer, numbers: ReadonlyMap<string, string>, catalog: MessageCatalog): string {
  if (point.parentNumber === null) return topStance(point.node.id, answer, numbers, catalog);
  if (point.node.node_type === "PRO") return relatedTo("supports", point.parentNumber, catalog);
  if (point.node.node_type === "CON") return relatedTo("challenges", point.parentNumber, catalog);
  if (point.node.node_type === "SHARED-CRUX") return relatedTo("sharedCrux", point.parentNumber, catalog);
  return t(catalog, "public.report.point.linked", { point: point.parentNumber });
}

type SetAsideReason = "unweighed" | "weak" | "littleWeight";

/**
 * What became of a point in the conclusion (fix rounds 1 and 2). The two
 * hidden-node records really leave a point out, and the site's tree reads them
 * too. The low-leverage freeze is a mark on the node itself, and it leaves
 * nothing out: the debate only did not follow the point further, because it
 * could not move the answer, so it still counts, with little weight. Only the
 * KIND is read: a record's own `reason` is the engine's text ("Recorded
 * strength 0.21 is at or below the ruled hidden-node threshold"), with scores
 * and engine words, and is never printed. When several apply, the strongest is
 * the one given.
 */
function setAsideReason(node: Answer["nodes"][number], answer: Answer): SetAsideReason | null {
  const hidden = new Set(answer.condition_mark_records
    .filter((record) => record.affected_node_ids.includes(node.node_id))
    .map((record) => record.mark));
  if (hidden.has("HIDDEN-UNJUDGEABLE")) return "unweighed";
  if (hidden.has("HIDDEN-LOW-SCORE")) return "weak";
  if (node.condition_marks.includes("BRANCH-FROZEN-LOW-LEVERAGE")) return "littleWeight";
  return null;
}

function setAsideWords(reason: SetAsideReason, catalog: MessageCatalog): string {
  switch (reason) {
    case "unweighed": return t(catalog, "public.report.point.setAsideUnweighed");
    case "weak": return t(catalog, "public.report.point.setAsideWeak");
    case "littleWeight": return t(catalog, "public.report.point.littleWeight");
  }
}

type PointNote = "oneModel" | "fewerModels" | "sourceUnconfirmed" | "outdated" | "figureRemoved";
const POINT_NOTE_ORDER: readonly PointNote[] = Object.freeze(["oneModel", "fewerModels", "sourceUnconfirmed", "outdated", "figureRemoved"]);

/**
 * The note a condition mark gives a reader about ONE point, or null for a mark
 * that only describes the machinery (budgets, envelopes, digests, leverage,
 * sampling, the run's own checks) and is left out (fix round 1). Exhaustive
 * over the kernel's vocabulary, so a new mark must be placed here on purpose.
 */
function pointNote(mark: ConditionMark): PointNote | null {
  switch (mark) {
    // Every other model's assessment failed: only the author's own survived (round 2).
    case "PANEL-DEGRADED-SINGLE-VOICE":
      return "oneModel";
    case "PANEL-PARTIAL":
    case "SINGLE-LINEAGE":
    case "DEGRADED-DIVERSITY":
    case "CRITIQUE-UNAVAILABLE":
      return "fewerModels";
    case "WAY-OF-KNOWING-DOWNGRADED":
    case "OFF-SUBJECT-DOWNGRADE":
      return "sourceUnconfirmed";
    case "STALE":
      return "outdated";
    case "MISSING-NUMBER":
      return "figureRemoved";
    case "UNINSTRUMENTED":
    case "UNFALSIFIED-AFTER-ROTATION":
    case "SKIPPED-BY-BUDGET":
    case "ENVELOPE_EXHAUSTED":
    case "LEVERAGE_UNRESOLVED":
    case "BRANCH-FROZEN-LOW-LEVERAGE":
    case "AMBIGUOUS_ATTRIBUTION":
    case "UNDER-REVIEW":
    case "UNDER-EXPLORED":
    case "UNRESOLVED-TYPE-FALLBACK":
    case "DEFECT":
    case "UNPRICED":
    case "UNADJUDICATED":
    case "UNCOVERED-SCOPE":
    case "UNSERVED-MAKER-POSITION":
    case "NON-COMPARABLE":
    case "NOT_SAMPLED":
    case "AMENDED-SEARCH":
    case "LABEL-BASIS-INCOMPLETE":
    case "OWED-CHECK-UNEXECUTED":
    case "SYNTHESIS-OBJECTION-STANDING":
    case "DIGEST-COMPRESSED":
    case "DIGEST-CANNOT-EXIST":
    case "PROTECTED-CORE-GUARD-RETIRED":
    case "HIDDEN-UNJUDGEABLE":
    case "DERIVED-STANDING-UNREVIEWED":
    case "HIDDEN-LOW-SCORE":
    case "UNAUTHORED-BRANCH-HALTED":
      return null;
  }
}

function pointNoteWords(note: PointNote, catalog: MessageCatalog): string {
  switch (note) {
    case "oneModel": return t(catalog, "public.report.point.noteOneModel");
    case "fewerModels": return t(catalog, "public.report.point.noteFewerModels");
    case "sourceUnconfirmed": return t(catalog, "public.report.point.noteSourceUnconfirmed");
    case "outdated": return t(catalog, "public.report.point.noteOutdated");
    case "figureRemoved": return t(catalog, "public.report.point.noteFigureRemoved");
  }
}

/**
 * Each note once, in a fixed order, as sentences; null when the point has none.
 * "Only one AI model" already says what "fewer AI models than usual" would, so
 * the second is left out beside it.
 */
function notesLine(node: Answer["nodes"][number], catalog: MessageCatalog): string | null {
  const notes = new Set(node.condition_marks.map(pointNote).filter((note): note is PointNote => note !== null));
  if (notes.has("oneModel")) notes.delete("fewerModels");
  const words = POINT_NOTE_ORDER.filter((note) => notes.has(note)).map((note) => pointNoteWords(note, catalog));
  return words.length === 0 ? null : words.join(" ");
}

/** What the second model that checked the point made of it, then its own reasons. */
function reviewWords(review: Answer["nodes"][number]["review"], catalog: MessageCatalog): string {
  if (review === null) return t(catalog, "public.report.point.notChecked");
  const model = lineageWords(review.reviewer_lineage) ?? t(catalog, "public.report.point.checkModelNotRecorded");
  const outcome = review.outcome === "agree"
    ? t(catalog, "public.report.point.checkAgreed", { model })
    : review.outcome === "dispute"
      ? t(catalog, "public.report.point.checkDisagreed", { model })
      : t(catalog, "public.report.point.checkUnsure", { model });
  return [outcome, ...review.reasons].join(" ");
}

function appendixEntry(
  point: NumberedPoint,
  node: Answer["nodes"][number],
  answer: Answer,
  stance: string,
  catalogs: ReportCatalogs
): ReportAppendixEntry {
  const { locale, publicCatalog } = catalogs;
  const base = percent(locale, node.base_score.value);
  const author = lineageWords(node.maker_lineage);
  const setAside = setAsideReason(node, answer);
  return {
    number: point.number,
    anchor: pointAnchor(point.number),
    stance,
    claim: node.claim,
    strength: node.final_strength === null
      ? t(publicCatalog, "public.report.point.strengthNotShown", { base })
      : t(publicCatalog, "public.report.point.strength", { base, final: percent(locale, node.final_strength.value) }),
    wayOfKnowing: t(publicCatalog, "public.report.point.known", { way: wayOfKnowingLabel(node.way_of_knowing, catalogs.composeCatalog) }),
    author: author === null ? t(publicCatalog, "public.report.point.authorNotRecorded") : t(publicCatalog, "public.report.point.author", { model: author }),
    review: reviewWords(node.review, publicCatalog),
    setAsideLine: setAside === null ? null : setAsideWords(setAside, publicCatalog),
    notesLine: notesLine(node, publicCatalog)
  };
}

export function buildReportModel(answer: Answer, story: AnswerStory, generatedAt: Date, catalogs: ReportCatalogs): ReportModel {
  const body = story.story;
  if (body === null || (story.status !== "READY" && story.status !== "READY_WITH_RESERVATION")) {
    throw new TypeError("REPORT_STORY_NOT_READY");
  }
  const { locale, publicCatalog } = catalogs;
  const points = orderedPoints(answer, story, catalogs.composeCatalog);
  const numbers = new Map(points.map((point) => [point.node.id, point.number]));
  const contractNodes = contractNodesById(answer);
  const models = uniqueModels(answer);
  const notRecorded = t(publicCatalog, "public.report.about.notRecorded");
  return {
    language: locale,
    documentTitle: t(publicCatalog, "public.report.documentTitle", { question: answer.question_line }),
    metadataSubject: t(catalogs.metadataCatalog, "public.report.disclosure"),
    // No values: the placeholders stay for reportPageWords to fill on each page.
    footer: { text: t(publicCatalog, "public.report.footer"), pageWords: t(publicCatalog, "public.report.pageOf") },
    cover: {
      eyebrow: t(publicCatalog, "public.report.eyebrow"),
      question: answer.question_line,
      labelWords: answer.verdict_state === null ? null : storyLabelWords(answer.verdict_state, publicCatalog),
      confidence: body.short.confidence,
      generatedLine: t(publicCatalog, "public.report.generated", { date: moment(locale, generatedAt) }),
      models,
      modelsLine: models.length === 0
        ? t(publicCatalog, "public.report.modelsNotRecorded")
        : t(publicCatalog, "public.report.models", { models: listWords(locale, models) }),
      disclosure: t(publicCatalog, "public.report.disclosure")
    },
    inShort: {
      title: t(publicCatalog, "public.report.title.inShort"),
      headline: body.short.headline,
      summary: body.short.summary,
      paths: body.short.paths.map((path) => ({
        fate: path.fate,
        fateWords: storyFateWords(path.fate, publicCatalog),
        line: paragraph(path.line, path.node_refs, numbers)
      })),
      morePaths: morePathsWords(countStoryPositions(answer.nodes, answer.edges) - body.short.paths.length, publicCatalog, locale)
    },
    storyTitle: t(publicCatalog, "public.report.title.story"),
    storyIntro: t(publicCatalog, "public.report.storyIntro"),
    sections: body.long.sections.map((section) => ({
      title: section.title,
      paragraphs: section.paragraphs.map((item) => paragraph(item.text, item.node_refs, numbers))
    })),
    reviewerNote: body.reviewer_note === null ? null : {
      title: t(publicCatalog, "public.story.noteTitle"),
      paragraph: paragraph(body.reviewer_note.text, body.reviewer_note.node_refs, numbers)
    },
    reservation: story.status === "READY_WITH_RESERVATION" ? t(publicCatalog, "public.story.reservation") : null,
    why: {
      title: t(publicCatalog, "public.report.title.why"),
      reasons: body.why.reasons.map((reason) => paragraph(reason.text, reason.node_refs, numbers)),
      changeLead: t(publicCatalog, "public.story.changeLead"),
      change: paragraph(body.short.change.text, body.short.change.node_refs, numbers)
    },
    appendix: {
      title: t(publicCatalog, "public.report.title.points"),
      intro: t(publicCatalog, "public.report.pointsIntro"),
      entries: points.flatMap((point) => {
        const node = contractNodes.get(point.node.id);
        return node === undefined ? [] : [appendixEntry(point, node, answer, stanceWords(point, answer, numbers, publicCatalog), catalogs)];
      })
    },
    about: {
      title: t(publicCatalog, "public.report.title.about"),
      rows: [
        { label: t(publicCatalog, "public.report.about.question"), value: answer.question_line },
        { label: t(publicCatalog, "public.report.about.generated"), value: moment(locale, generatedAt) },
        { label: t(publicCatalog, "public.report.about.written"), value: story.written_at === null ? notRecorded : moment(locale, story.written_at) },
        { label: t(publicCatalog, "public.report.about.writtenBy"), value: lineageWords(story.storyteller) ?? notRecorded },
        { label: t(publicCatalog, "public.report.about.checkedBy"), value: lineageWords(story.checker) ?? notRecorded }
      ]
    }
  };
}
