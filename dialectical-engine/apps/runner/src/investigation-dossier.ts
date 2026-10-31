import { createHash } from "node:crypto";
import { INVESTIGATION_REPORT_LIMITS, TRUST_WORDS, cutQuoteAtWordEdge, type StoryFate, type TrustWord } from "@debateai/contract";
import { TypedDomainError, withQuestionLanguageField, withReaderField } from "@debateai/kernel";
import { buildFramedPrompt, type FramedMaterialField, type PromptPacket } from "@debateai/providers";
import {
  REPORT_STORY_PROMPT_CONTRACT, type ReportAnswerDraft, type ReportCallMaterial, type ReportStoryDraft
} from "@debateai/story";
import {
  pathRewriteBodyBytes, pathRewriteBodyFits, type PathRewriteDigPath, type PathRewritePick, type PathRewritePoint,
  type PathRewriteQuestion
} from "./path-rewrite-material.js";

/**
 * THE FINAL REPORT'S DOSSIER (plan 2026-10-30 task W5-1; W0-1 §1.3-§1.4 as changed by the dig-model revision's §4.1 and
 * §4.3). One dossier per closing, built by code from what is already stored and checked, the same bytes every time for the
 * same investigation (so a resumed closing sends the same prompts and its answered calls replay free). DECISION 6 of 31 Oct:
 * it reads AI text only: the points, the verdicts, reader 1's page notes and the 120-character shown quote. No page text and
 * no passage ever reaches it (investigation-close-sources.ts reads the shown quotes, never an extract or a pack), so the wipe
 * changes nothing a later version reads, byte for byte. The automatic main-answer updates read this same material.
 *
 * What it holds, in this order (the dossier first and the step's own fields after it, so the step's later rounds read the
 * same opening bytes; the reader and locked-language fields last, as every final writer's material ends):
 *  - the main question with its place, time and purpose lines;
 *  - the first debate: its story's short answer and "what would change it", then each path in map order, its text the
 *    LATEST rewrite with the story's own line kept beside it, its whole points, and the follow-up debates that rewrote it,
 *    in the order they happened;
 *  - one REWRITE CARD per dig, in tree order, by map order (a path's digs by finish time, then the digs of each of those
 *    digs' own paths, down to level 10; digs under the main question after a debate's paths): where it came from (the
 *    debate and the path, its level), its picks word for word each marked AI_SUGGESTION, PERSON_EDITED or
 *    PERSON_OWN_VIEW, the path's text before and after, what the dig changed, the verdict on the person's point of view,
 *    the fates before and after, and the dig's own paths with their lines, fates and every point argued on them (decision
 *    4: "every path of the debate and every point argued on it"). A FAILED rewrite (or none) brings in the dig's own
 *    material instead: its answer text and its paths' points (Q-D13: a dig keeps both);
 *  - the person's own views, each word for word beside its verdict;
 *  - the sources: each checked extract a point cites, as the quote people see (at most 120 characters, owner F9) and
 *    reader 1's line;
 *  - from version 2 on, the earlier report's answer (owner F8 A);
 *  - how much a shortened dossier left out.
 * Refs: A1… for the first debate's paths, P1… for points, G1… for the cards (Gk.D1… for a card's own paths), W1… for
 * sources. Ids never reach a model; the maps here turn refs back.
 *
 * THE LADDER (the dig-model revision's §4.3; R4's and LG-E's whole-statement rule, never a cut inside a text): the first
 * step whose largest call passes the 100K guard is used. The largest call is the storyteller's second round (the dossier,
 * the checked answer, its own draft and the checker's problem), so the dossier is fitted to the answer writer's first
 * packet plus a fixed room for those. 1: everything whole. 2: the digs' paths, then the first debate's, keep fewer whole
 * points per path (disputed first). 3: cards become short (the new line, what the dig changed, the verdict, its paths' lines
 * and fates); cards on the winning path and cards whose dig changed a fate stay whole longest. 4: the deepest cards become
 * one line each ("also dug": its first pick, changed or not, and its paths' lines and fates), level by level from the deepest.
 * 5: only for a very large investigation, the oldest one-line entries are left out whole, and counted.
 * Steps 2-5 are disclosed with the approved line (owner F13).
 *
 * DECISION 26, THE OWNER'S DESIGN FOR BIG DEBATES: the paths are rewritten every time something below changes them, so the best
 * arguments are already at the top. The material holds the first debate and the digs of levels 1 to 3 whole (`follow_ups`, as above),
 * and `deeper_paths`: each path of a deeper dig with only its line, its outcome, its name and where it hangs. The person's own views
 * stay in `views` from every level. The writer may ask once for up to 10 of them by name (`material.deeper.askFor`): the material
 * then holds `asked_paths` right after the shared fields, so the shared fields stay the same bytes under the same fence and are read
 * from the cache, and everyone after the writer reads that material. A path with nothing beyond its line and outcome adds nothing.
 * A list that does not fit leaves first (the deepest, the oldest, the ones that changed nothing go first; counted, and it counts as
 * shortened): a line of a deep path gives way before any point at levels 1 to 3. Only then the ladder's steps 2-5, on levels 1 to 3.
 *
 * "IT MUST REFLECT EVERY PATH" (the checker, decision 4) ON THE LADDER: a path's line and fate outlast its points. The first
 * debate's paths stand on every step, and a dig's paths through step 4. Only step 5 takes a path out of the material, and
 * then the writer and checker cannot see it: `left_out` counts the digs gone and the page says the report was shortened.
 */

export const INVESTIGATION_REPORT_INPUT_OVER_LIMIT = "INVESTIGATION_REPORT_INPUT_OVER_LIMIT" as const;
/**
 * Room for the largest call beyond the answer writer's first packet: the checked answer, the story draft, the problem. Measured
 * (tests/unit/investigation-report-sizes.test.ts): the fullest second round asked for, at 600 words and in the widest scripts, stays
 * under it. A story beyond it does not fail: the guard refuses the second round and the step keeps its checked draft.
 */
export const INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES = 72 * 1024;
/** Room kept for what an ask brings (decision 26); when it brings more, its paths keep fewer whole points, and say so. */
export const INVESTIGATION_REPORT_ASK_ROOM_BYTES = 24 * 1024;
/** The dig levels the material holds whole (decision 26); the first debate is level 0. */
export const INVESTIGATION_REPORT_WHOLE_LEVELS = 3 as const;
/** The ladder's step 2: the first debate's whole points kept per path, in turn. */
export const INVESTIGATION_REPORT_POINT_CAPS = Object.freeze([6, 3, 1, 0]);
/**
 * The words the answer is asked for (the writer's length target; decision 27): about 300 for a debate of up to 8 paths (a first
 * debate alone), 50 more for every 8 paths beyond them, at most 600 (reached at 56 paths) however big the debate.
 */
export const INVESTIGATION_REPORT_ANSWER_WORDS = Object.freeze({ base: 300, step: 50, pathsPerStep: 8, most: 600 });
export function investigationReportAnswerLength(paths: number): string {
  const { base, step, pathsPerStep, most } = INVESTIGATION_REPORT_ANSWER_WORDS;
  const steps = Math.floor(Math.max(0, paths - 1) / pathsPerStep);
  return `about ${String(Math.min(most, base + step * steps))} words`;
}

/** Every packet a report call sends passes here before it goes: one over the 100K line is refused, nothing sent. */
export function investigationReportGuard(packet: PromptPacket): PromptPacket {
  if (!pathRewriteBodyFits(pathRewriteBodyBytes(packet))) {
    throw new TypedDomainError(INVESTIGATION_REPORT_INPUT_OVER_LIMIT, "A report call stays under 100,000 tokens");
  }
  return packet;
}

/* ----------------------------------------------------------------- the input */

export type DossierText = Readonly<{ line: string; summary: string | null; fate: StoryFate }>;

/** A checked extract a point cites; `line` is reader 1's line about its page, when stored. */
export type DossierSource = Readonly<{ pointId: string; site: string; link: string | null; title: string | null; quote: string; line: string | null }>;

export type DossierRewrite = Readonly<{
  rewriteId: string;
  recordedAt: string;
  state: "READY" | "READY_WITH_RESERVATION" | "FAILED";
  /** The text the rewrite was written on. */
  before: DossierText;
  /** Null on a FAILED rewrite (the path keeps its text). */
  after: DossierText | null;
  whatChanged: readonly string[];
  view: Readonly<{ outcome: "HELPED" | "DID_NOT_HELP" | "NOT_SETTLED"; scope: "PATH" | "MAIN_QUESTION"; reason: string }> | null;
  digPaths: readonly Readonly<{ positionRef: string; line: string; fate: StoryFate }>[];
}>;

export type DossierDig = Readonly<{
  runId: string;
  parentRunId: string;
  /** The path of the parent its picks are on; null: under the parent's question (no path rewritten). */
  positionRef: string | null;
  level: number;
  /** When it settled (its turn's time): the order of a path's digs. */
  finishedAt: string;
  picks: readonly PathRewritePick[];
  rewrite: DossierRewrite | null;
  /** Its own paths and every point on them (decision 4); its answer text too when its rewrite FAILED; null when unread. */
  ownMaterial: Readonly<{ answer: readonly string[]; paths: readonly PathRewriteDigPath[]; sources: readonly DossierSource[] }> | null;
}>;

export type DossierPath = Readonly<{
  /** The map's id of the path (the story path's position_ref, `<ref>#2` for a position argued twice). */
  ref: string;
  storyLine: string;
  storyFate: StoryFate;
  points: readonly PathRewritePoint[];
  sources: readonly DossierSource[];
  /** The path's newest text when a later update wrote it (a climb, a public dig; 0138); absent: its newest rewrite's, else the story's. */
  current?: DossierText | null;
}>;

export type DossierInput = Readonly<{
  question: PathRewriteQuestion;
  first: Readonly<{
    runId: string;
    /** The first debate's story: its short answer and "what would change it"; null when it has none. */
    answer: Readonly<{ headline: string; summary: string; change: string; confidence?: string | null }> | null;
    paths: readonly DossierPath[];
  }>;
  digs: readonly DossierDig[];
  earlier: Readonly<{ version: number; segments: readonly string[] }> | null;
  /**
   * Each point's trust word, by its id in lower case, for the stored version's PDF only (decision 27). Never in the fields: a word can
   * change with time (a point grows dated), and a closing run again must send the same bytes.
   */
  trustWords?: ReadonlyMap<string, TrustWord>;
}>;

/* ----------------------------------------------------------------- the output */

/** A point as the stored version keeps it for the PDF (decision 27): its words, its trust word, its side, which of the sources it cites. */
export type DossierReportPoint = Readonly<{ text: string; trust: TrustWord | null; side: "for" | "against" | null; sources: readonly number[] }>;
/** The dig a path's row opens (its first path): what was dug, the person's own words and their verdict, what it changed. */
export type DossierReportDig = Readonly<{
  picks: readonly string[];
  own_words: readonly string[];
  view: Readonly<{ outcome: "HELPED" | "DID_NOT_HELP" | "NOT_SETTLED"; reason: string }> | null;
  changed: readonly string[];
}>;
/** One path in the stored version: level 0 is the first debate's, level k the paths of a dig at level k. */
export type DossierReportPath = Readonly<{ line: string; summary: string | null; fate: StoryFate | null; level: number;
  points?: readonly DossierReportPoint[]; dig?: DossierReportDig }>;

export type Dossier = Readonly<{
  kind: "BUILT";
  material: ReportCallMaterial;
  /** G-ref → the dig's run. */
  cardRuns: ReadonlyMap<string, string>;
  /** The sources as the stored version lists them (the order of their W-refs): all of them, whatever the ladder kept. */
  sources: readonly Readonly<{ site: string; link: string | null; title: string | null; quote: string; line: string | null }>[];
  /** Every path as the stored version lists them, in tree order: a first-debate path, then the paths of the digs under it. */
  paths: readonly DossierReportPath[];
  ladderStep: number;
  /** Which ladder place this is, for a caller that must start lower (the real token count, decision 28). */
  ladderAt: number;
  /** Points, cards and deeper paths a shortened dossier left out (step 5 cards, step 2 points, the list's lines). */
  leftOut: number;
  /** sha256 of the dossier's fields. */
  fingerprint: string;
  /** The newest rewrite the dossier read (by recorded time, then id), or null when none. */
  coveredRewrite: Readonly<{ rewriteId: string; recordedAt: string }> | null;
  bodyBytes: number;
}>;
export type DossierBuilt = Dossier | Readonly<{ kind: "TOO_LARGE"; bodyBytes: number }>;

/* ----------------------------------------------------------------- the build */

const field = (name: string, content: string): FramedMaterialField => Object.freeze({ name, content });
const lower = (id: string): string => id.toLowerCase();
const byTimeThenId = (left: Readonly<{ at: string; id: string }>, right: Readonly<{ at: string; id: string }>): number =>
  Date.parse(left.at) - Date.parse(right.at) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

/** The digs in tree order, by map order: each debate's paths in order, a path's digs by finish time, then their own paths. */
export function digsInTreeOrder(input: Pick<DossierInput, "first" | "digs">): readonly DossierDig[] {
  const ordered: DossierDig[] = [];
  const placed = new Set<string>();
  const sorted = [...input.digs].sort((a, b) => byTimeThenId({ at: a.finishedAt, id: lower(a.runId) }, { at: b.finishedAt, id: lower(b.runId) }));
  const pathsOf = (dig: DossierDig): readonly string[] => cardPathsOf(dig).map((path) => path.positionRef);
  const visit = (parentRunId: string, pathRefs: readonly string[]): void => {
    const here = sorted.filter((dig) => lower(dig.parentRunId) === lower(parentRunId) && !placed.has(lower(dig.runId)));
    const known = new Set(pathRefs);
    const groups = [...pathRefs.map((ref) => here.filter((dig) => dig.positionRef === ref)),
      here.filter((dig) => dig.positionRef === null || !known.has(dig.positionRef))];
    for (const group of groups) {
      for (const dig of group) {
        if (placed.has(lower(dig.runId))) continue;
        placed.add(lower(dig.runId));
        ordered.push(dig);
        visit(dig.runId, pathsOf(dig));
      }
    }
  };
  visit(input.first.runId, input.first.paths.map((path) => path.ref));
  // A dig whose parent the tree does not reach (a parent erased) still counts: after the tree, by level then time.
  for (const dig of [...sorted].sort((a, b) => a.level - b.level)) {
    if (placed.has(lower(dig.runId))) continue;
    placed.add(lower(dig.runId));
    ordered.push(dig);
    visit(dig.runId, pathsOf(dig));
  }
  return Object.freeze(ordered);
}

type Refs = Readonly<{
  pathRef: ReadonlyMap<string, string>;
  pointRef: ReadonlyMap<string, string>;
  cardRef: ReadonlyMap<string, string>;
  sourceRef: ReadonlyMap<string, string>;
  /** Each source once, in the order of its W-ref, with the quote people see, and the key it was first named by. */
  sources: readonly Readonly<{ key: string; source: DossierSource }>[];
}>;

/** A page's quote is one source, however many points cite it. */
const sourceKey = (source: DossierSource): string => `${source.site}\u0000${source.link ?? ""}\u0000${source.quote}`;

/** Refs over the WHOLE input, before any step: a point, card or source keeps its ref on every step of the ladder. */
function refsOf(input: DossierInput, cards: readonly DossierDig[]): Refs {
  const pathRef = new Map<string, string>();
  for (const path of input.first.paths) {
    if (pathRef.has(path.ref)) throw new TypedDomainError("INVESTIGATION_REPORT_PATHS_INVALID", "A path is given once");
    pathRef.set(path.ref, `A${String(pathRef.size + 1)}`);
  }
  const pointRef = new Map<string, string>();
  const allPoints = [...input.first.paths.flatMap((path) => path.points), ...cards.flatMap((dig) => dig.ownMaterial?.paths.flatMap((path) => path.points) ?? [])];
  for (const point of allPoints) if (!pointRef.has(lower(point.id))) pointRef.set(lower(point.id), `P${String(pointRef.size + 1)}`);
  const cardRef = new Map<string, string>();
  for (const dig of cards) cardRef.set(lower(dig.runId), `G${String(cardRef.size + 1)}`);
  const sourceRef = new Map<string, string>();
  const sources: Array<Readonly<{ key: string; source: DossierSource }>> = [];
  for (const source of [...input.first.paths.flatMap((path) => path.sources), ...cards.flatMap((dig) => dig.ownMaterial?.sources ?? [])]) {
    const key = sourceKey(source);
    if (sourceRef.has(key)) continue;
    sourceRef.set(key, `W${String(sourceRef.size + 1)}`);
    sources.push(Object.freeze({ key, source: Object.freeze({ ...source, quote: cutQuoteAtWordEdge(source.quote) }) }));
  }
  return Object.freeze({ pathRef, pointRef, cardRef, sourceRef, sources: Object.freeze(sources) });
}

/** The points a step keeps: disputed first, then in order, up to the cap; written in their own order. */
function keptPoints(points: readonly PathRewritePoint[], cap: number): readonly PathRewritePoint[] {
  if (points.length <= cap) return points;
  const chosen = new Set([...points.filter((point) => point.disputed), ...points.filter((point) => !point.disputed)]
    .slice(0, cap).map((point) => lower(point.id)));
  return points.filter((point) => chosen.has(lower(point.id)));
}

function pointsJson(points: readonly PathRewritePoint[], refs: Refs, ownRef: string) {
  const here = new Set(points.map((point) => lower(point.id)));
  return points.map((point) => ({
    ref: refs.pointRef.get(lower(point.id))!,
    text: point.text,
    on: point.onId !== null && here.has(lower(point.onId)) ? refs.pointRef.get(lower(point.onId))! : ownRef,
    ...(point.side === null ? {} : { side: point.side }),
    ...(point.trust === null ? {} : { trust: point.trust }),
    ...(point.disputed ? { disputed: true } : {})
  }));
}

function sourcesOf(sources: readonly DossierSource[], kept: readonly PathRewritePoint[], refs: Refs): string[] {
  const keptIds = new Set(kept.map((point) => lower(point.id)));
  return [...new Set(sources.filter((source) => keptIds.has(lower(source.pointId))).map((source) => refs.sourceRef.get(sourceKey(source))!))];
}

const textJson = (text: DossierText) => ({ line: text.line, ...(text.summary === null ? {} : { summary: text.summary }), fate: text.fate });

/** How each card is written on a step: whole, short, one line, or left out. */
type CardForm = "WHOLE" | "SHORT" | "ONE_LINE" | "LEFT_OUT";
type Step = Readonly<{ pointCap: number; digPointCap: number; forms: ReadonlyMap<string, CardForm>; offTheList: ReadonlySet<string> }>;

/** A dig the material holds only as lines on the list of deeper paths (decision 26). */
const isDeep = (dig: DossierDig): boolean => dig.level > INVESTIGATION_REPORT_WHOLE_LEVELS;

/** A dig's own path on its card: the rewrite's line and fate when it has them (a later update's when one came), else its statement. */
type CardPath = Readonly<{ positionRef: string; line: string; fate: StoryFate | null; points: readonly PathRewritePoint[] }>;

/** Every path of a dig: those its rewrite names, in its order, then any other its own material holds (none is ever dropped). */
function cardPathsOf(dig: DossierDig): readonly CardPath[] {
  const own = dig.ownMaterial?.paths ?? [];
  const pointsOf = (ref: string) => own.find((path) => path.positionRef === ref)?.points ?? [];
  const named = (dig.rewrite?.digPaths ?? []).map((path) => ({ positionRef: path.positionRef, line: path.line, fate: path.fate, points: pointsOf(path.positionRef) }));
  const known = new Set(named.map((path) => path.positionRef));
  return Object.freeze([...named, ...own.filter((path) => !known.has(path.positionRef))
    .map((path) => ({ positionRef: path.positionRef, line: path.statement, fate: null, points: path.points }))]);
}

const changedFate = (dig: DossierDig): boolean =>
  dig.rewrite !== null && dig.rewrite.after !== null && dig.rewrite.after.fate !== dig.rewrite.before.fate;
const changedText = (dig: DossierDig): boolean => dig.rewrite !== null && dig.rewrite.after !== null
  && (changedFate(dig) || dig.rewrite.after.line.trim() !== dig.rewrite.before.line.trim());

/** Where a card came from: the debate (`first` or the parent's card) and the path (an A-ref, a card's D-ref, or null). */
function fromJson(dig: DossierDig, input: DossierInput, refs: Refs, digPathRefOf: (parentRunId: string, positionRef: string) => string | null) {
  const fromFirst = lower(dig.parentRunId) === lower(input.first.runId);
  const debate = fromFirst ? "first" : refs.cardRef.get(lower(dig.parentRunId)) ?? "erased";
  const path = dig.positionRef === null ? null
    : fromFirst ? refs.pathRef.get(dig.positionRef) ?? null : digPathRefOf(dig.parentRunId, dig.positionRef);
  return { debate, path };
}

function cardJson(dig: DossierDig, form: CardForm, step: Step, input: DossierInput, refs: Refs,
  digPathRefOf: (parentRunId: string, positionRef: string) => string | null) {
  const ref = refs.cardRef.get(lower(dig.runId))!;
  const base = { ref, from: fromJson(dig, input, refs, digPathRefOf), level: dig.level };
  const paths = cardPathsOf(dig);
  const pathRef = (at: number) => `${ref}.D${String(at + 1)}`;
  const fate = (path: CardPath) => (path.fate === null ? {} : { fate: path.fate });
  // A path's line and fate alone: what a short or a one-line card keeps of it.
  const lines = paths.map((path, at) => ({ ref: pathRef(at), line: path.line, ...fate(path) }));
  if (form === "ONE_LINE") {
    return { ...base, also_dug: { pick: dig.picks[0]?.text ?? "", changed: changedText(dig), ...(lines.length === 0 ? {} : { paths: lines }) } };
  }
  const picks = dig.picks.map((pick) => ({ text: pick.text, marked: pick.by }));
  const own = dig.ownMaterial;
  const rewrite = dig.rewrite;
  if (rewrite === null || rewrite.state === "FAILED" || rewrite.after === null) {
    return {
      ...base, picks, rewrite: { state: "FAILED" },
      ...(own === null ? {} : form === "SHORT" ? { own_material: { paths: lines } } : { own_material: {
        answer: [...own.answer],
        paths: paths.map((path, at) => {
          const kept = keptPoints(path.points, step.digPointCap);
          return { ref: pathRef(at), statement: path.line, ...fate(path), points: pointsJson(kept, refs, pathRef(at)), sources: sourcesOf(own.sources, kept, refs) };
        })
      } })
    };
  }
  const view = rewrite.view === null ? {} : { view: { outcome: rewrite.view.outcome, scope: rewrite.view.scope, reason: rewrite.view.reason } };
  if (form === "SHORT") {
    return { ...base, picks, rewrite: { state: rewrite.state, after: { line: rewrite.after.line, fate: rewrite.after.fate },
      what_changed: [...rewrite.whatChanged], ...view, ...(lines.length === 0 ? {} : { dig_paths: lines }) } };
  }
  return {
    ...base, picks,
    rewrite: {
      state: rewrite.state, before: textJson(rewrite.before), after: textJson(rewrite.after), what_changed: [...rewrite.whatChanged],
      ...view,
      dig_paths: paths.map((path, at) => {
        const kept = keptPoints(path.points, step.digPointCap);
        const cited = own === null ? [] : sourcesOf(own.sources, kept, refs);
        return { ref: pathRef(at), line: path.line, ...fate(path),
          ...(kept.length === 0 ? {} : { points: pointsJson(kept, refs, pathRef(at)) }),
          ...(cited.length === 0 ? {} : { sources: cited }) };
      })
    }
  };
}

type Built = Readonly<{ fields: readonly FramedMaterialField[]; refs: ReadonlySet<string>; cardRefs: readonly string[]; leftOut: number; deeperNames: readonly string[] }>;

function fieldsAt(input: DossierInput, cards: readonly DossierDig[], refs: Refs, step: Step): Built {
  const known = new Set<string>();
  const question = input.question;
  const latest = new Map<string, DossierText>();
  const rewrittenBy = new Map<string, string[]>();
  for (const dig of cards) {
    if (lower(dig.parentRunId) !== lower(input.first.runId) || dig.positionRef === null) continue;
    rewrittenBy.set(dig.positionRef, [...(rewrittenBy.get(dig.positionRef) ?? []), refs.cardRef.get(lower(dig.runId))!]);
    if (dig.rewrite?.after !== null && dig.rewrite?.after !== undefined) latest.set(dig.positionRef, dig.rewrite.after);
  }
  let pointsLeftOut = 0;
  const paths = input.first.paths.map((path) => {
    const ref = refs.pathRef.get(path.ref)!;
    known.add(ref);
    const kept = keptPoints(path.points, step.pointCap);
    pointsLeftOut += path.points.length - kept.length;
    for (const point of kept) known.add(refs.pointRef.get(lower(point.id))!);
    const current = path.current ?? latest.get(path.ref) ?? { line: path.storyLine, summary: null, fate: path.storyFate };
    return {
      ref, ...textJson(current),
      ...(current.line === path.storyLine ? {} : { story_line: path.storyLine }),
      points: pointsJson(kept, refs, ref),
      sources: sourcesOf(path.sources, kept, refs),
      ...(rewrittenBy.has(path.ref) ? { rewritten_by: rewrittenBy.get(path.ref)! } : {})
    };
  });
  // A card's own paths by (dig, position ref), for the cards dug from them.
  const digPathRefs = new Map<string, string>();
  for (const dig of cards) {
    const ref = refs.cardRef.get(lower(dig.runId))!;
    cardPathsOf(dig).forEach((path, at) => digPathRefs.set(`${lower(dig.runId)}\u0000${path.positionRef}`, `${ref}.D${String(at + 1)}`));
  }
  const digPathRefOf = (parentRunId: string, positionRef: string) => digPathRefs.get(`${lower(parentRunId)}\u0000${positionRef}`) ?? null;
  const followUps: unknown[] = [];
  const cardRefs: string[] = [];
  let cardsLeftOut = 0;
  let linesLeftOut = 0;
  const deeperPaths: unknown[] = [];
  for (const dig of cards) {
    if (isDeep(dig)) {
      const ref = refs.cardRef.get(lower(dig.runId))!;
      if (step.offTheList.has(lower(dig.runId))) { linesLeftOut += cardPathsOf(dig).length; continue; }
      known.add(ref);
      const { debate, path } = fromJson(dig, input, refs, digPathRefOf);
      cardPathsOf(dig).forEach((entry, at) => {
        known.add(`${ref}.D${String(at + 1)}`);
        deeperPaths.push({ ref: `${ref}.D${String(at + 1)}`, under: path ?? debate, level: dig.level, line: entry.line,
          ...(entry.fate === null ? {} : { fate: entry.fate }) });
      });
      continue;
    }
    const form = step.forms.get(lower(dig.runId)) ?? "WHOLE";
    if (form === "LEFT_OUT") { cardsLeftOut += 1; pointsLeftOut += cardPathsOf(dig).reduce((sum, path) => sum + path.points.length, 0); continue; }
    const ref = refs.cardRef.get(lower(dig.runId))!;
    cardRefs.push(ref);
    known.add(ref);
    const paths = cardPathsOf(dig);
    paths.forEach((_, at) => known.add(`${ref}.D${String(at + 1)}`));
    for (const path of paths) {
      const kept = form === "WHOLE" ? keptPoints(path.points, step.digPointCap) : [];
      pointsLeftOut += path.points.length - kept.length;
      for (const point of kept) known.add(refs.pointRef.get(lower(point.id))!);
    }
    followUps.push(cardJson(dig, form, step, input, refs, digPathRefOf));
  }
  const views = cards.flatMap((dig) => {
    const words = dig.picks.filter((pick) => pick.by !== "AI_SUGGESTION").map((pick) => pick.text);
    const form = step.forms.get(lower(dig.runId)) ?? "WHOLE";
    if (words.length === 0 || form === "LEFT_OUT" || step.offTheList.has(lower(dig.runId))) return [];
    const view = dig.rewrite?.view ?? null;
    return [{ card: refs.cardRef.get(lower(dig.runId))!, words, marked: "PERSON",
      ...(view === null ? {} : { verdict: { outcome: view.outcome, scope: view.scope, reason: view.reason } }) }];
  });
  const cited = new Set<string>();
  for (const path of paths) for (const source of path.sources) cited.add(source);
  for (const card of followUps as { own_material?: { paths: { sources?: string[] }[] }; rewrite?: { dig_paths?: { sources?: string[] }[] } }[]) {
    for (const path of [...(card.own_material?.paths ?? []), ...(card.rewrite?.dig_paths ?? [])]) {
      for (const source of path.sources ?? []) cited.add(source);
    }
  }
  const sources = refs.sources.flatMap(({ key, source }) => {
    const ref = refs.sourceRef.get(key)!;
    if (!cited.has(ref)) return [];
    known.add(ref);
    return [{ ref, site: source.site, ...(source.title === null ? {} : { title: source.title }), quote: source.quote,
      ...(source.line === null ? {} : { line: source.line }) }];
  });
  const first = {
    ...(input.first.answer === null ? {} : { answer: { short: input.first.answer.headline, summary: input.first.answer.summary,
      ...((input.first.answer.confidence ?? null) === null ? {} : { label: input.first.answer.confidence }),
      would_change: input.first.answer.change } }),
    paths
  };
  const leftOut = pointsLeftOut + cardsLeftOut + linesLeftOut;
  return Object.freeze({
    refs: known, cardRefs: Object.freeze(cardRefs), leftOut,
    deeperNames: Object.freeze(deeperPaths.map((entry) => (entry as { ref: string }).ref)),
    fields: Object.freeze([
      field("question", question.line),
      ...(question.place === null ? [] : [field("place", question.place)]),
      ...(question.time === null ? [] : [field("time", question.time)]),
      ...(question.purpose === null ? [] : [field("purpose", question.purpose)]),
      field("first_debate", JSON.stringify(first)),
      field("follow_ups", JSON.stringify(followUps)),
      ...(views.length === 0 ? [] : [field("views", JSON.stringify(views))]),
      ...(sources.length === 0 ? [] : [field("sources", JSON.stringify(sources))]),
      ...(deeperPaths.length === 0 ? [] : [field("deeper_paths", JSON.stringify(deeperPaths))]),
      ...(input.earlier === null ? [] : [field("earlier_report", JSON.stringify({ version: input.earlier.version, answer: [...input.earlier.segments] }))]),
      ...(leftOut === 0 ? [] : [field("left_out", JSON.stringify({ points: pointsLeftOut, follow_ups: cardsLeftOut,
        ...(linesLeftOut === 0 ? {} : { deeper_paths: linesLeftOut }) }))])
    ])
  });
}

/** The ladder's steps in order, each a pure description (built lazily: a large tree has many sub-steps). */
function* ladder(input: DossierInput, cards: readonly DossierDig[]): Generator<Readonly<{ number: number; step: Step }>> {
  const whole: ReadonlyMap<string, CardForm> = new Map();
  const everything: ReadonlySet<string> = new Set();
  yield { number: 1, step: { pointCap: Number.POSITIVE_INFINITY, digPointCap: Number.POSITIVE_INFINITY, forms: whole, offTheList: everything } };
  // Decision 26: the list of deeper paths gives way first: the deepest, then those that changed nothing, then the oldest.
  const listed = [...cards].filter(isDeep).sort((a, b) => b.level - a.level || Number(changedText(a)) - Number(changedText(b))
    || byTimeThenId({ at: a.finishedAt, id: lower(a.runId) }, { at: b.finishedAt, id: lower(b.runId) }));
  const off = new Set<string>();
  const listChunk = Math.max(1, Math.ceil(listed.length / 20));
  for (let at = 0; at < listed.length; at += listChunk) {
    for (const dig of listed.slice(at, at + listChunk)) off.add(lower(dig.runId));
    yield { number: 2, step: { pointCap: Number.POSITIVE_INFINITY, digPointCap: Number.POSITIVE_INFINITY, forms: whole, offTheList: new Set(off) } };
  }
  const offTheList: ReadonlySet<string> = new Set(off);
  const shallow = cards.filter((dig) => !isDeep(dig));
  for (const digPointCap of INVESTIGATION_REPORT_POINT_CAPS) yield { number: 2, step: { pointCap: Number.POSITIVE_INFINITY, digPointCap, forms: whole, offTheList } };
  const cap = INVESTIGATION_REPORT_POINT_CAPS.at(-1)!;
  for (const pointCap of INVESTIGATION_REPORT_POINT_CAPS) yield { number: 2, step: { pointCap, digPointCap: cap, forms: whole, offTheList } };
  const winning = input.first.paths[0]?.ref ?? null;
  const onWinning = (dig: DossierDig): boolean => lower(dig.parentRunId) === lower(input.first.runId) && dig.positionRef === winning;
  // Step 3: the other cards short first, then the ones that stay whole longest.
  const forms = new Map<string, CardForm>();
  for (const dig of shallow) if (!onWinning(dig) && !changedFate(dig)) forms.set(lower(dig.runId), "SHORT");
  yield { number: 3, step: { pointCap: cap, digPointCap: cap, forms: new Map(forms), offTheList } };
  for (const dig of shallow) forms.set(lower(dig.runId), "SHORT");
  yield { number: 3, step: { pointCap: cap, digPointCap: cap, forms: new Map(forms), offTheList } };
  // Step 4: one line each, the deepest level first.
  const levels = [...new Set(shallow.map((dig) => dig.level))].sort((a, b) => b - a);
  for (const level of levels) {
    for (const dig of shallow) if (dig.level === level) forms.set(lower(dig.runId), "ONE_LINE");
    yield { number: 4, step: { pointCap: cap, digPointCap: cap, forms: new Map(forms), offTheList } };
  }
  // Step 5: the oldest one-line entries left out, a few at a time.
  const oldest = [...shallow].sort((a, b) => byTimeThenId({ at: a.finishedAt, id: lower(a.runId) }, { at: b.finishedAt, id: lower(b.runId) }));
  const chunk = Math.max(1, Math.ceil(oldest.length / 20));
  for (let at = 0; at < oldest.length; at += chunk) {
    for (const dig of oldest.slice(at, at + chunk)) forms.set(lower(dig.runId), "LEFT_OUT");
    yield { number: 5, step: { pointCap: cap, digPointCap: cap, forms: new Map(forms), offTheList } };
  }
}

/* ----------------------------------------------------------------- the deeper paths in full (decision 26) */

/** The whole-point caps an ask's paths step down through, after "all of them". */
const ASK_POINT_CAPS = Object.freeze([Number.POSITIVE_INFINITY, ...INVESTIGATION_REPORT_POINT_CAPS]);

/**
 * The asked paths in full, in tree order: AI text only (decision 6): the points with their verdicts, reader 1's notes, the short
 * quotes, and what the dig changed. A path holding nothing more than the list showed is its line alone.
 */
function askedJson(names: ReadonlySet<string>, cards: readonly DossierDig[], refs: Refs, pointCap: number): Readonly<{ json: string; refs: readonly string[] }> {
  const known: string[] = [];
  const entries = cards.flatMap((dig) => {
    const ref = refs.cardRef.get(lower(dig.runId))!;
    const own = dig.ownMaterial;
    let cardGiven = false;
    return cardPathsOf(dig).flatMap((path, at) => {
      const name = `${ref}.D${String(at + 1)}`;
      if (!names.has(name)) return [];
      const kept = keptPoints(path.points, pointCap);
      known.push(...kept.map((point) => refs.pointRef.get(lower(point.id))!));
      const keptIds = new Set(kept.map((point) => lower(point.id)));
      const sources = [...new Map((own?.sources ?? []).filter((source) => keptIds.has(lower(source.pointId))).map((source) => {
        const sourceRef = refs.sourceRef.get(sourceKey(source))!;
        return [sourceRef, { ref: sourceRef, site: source.site, ...(source.title === null ? {} : { title: source.title }),
          quote: cutQuoteAtWordEdge(source.quote), ...(source.line === null ? {} : { line: source.line }) }] as const;
      })).values()];
      known.push(...sources.map((source) => source.ref));
      const rewrite = dig.rewrite;
      const about = cardGiven ? {} : {
        ...(rewrite === null || rewrite.whatChanged.length === 0 ? {} : { what_changed: [...rewrite.whatChanged] }),
        ...(rewrite?.view === null || rewrite?.view === undefined ? {} : { view: { outcome: rewrite.view.outcome, scope: rewrite.view.scope, reason: rewrite.view.reason } })
      };
      cardGiven = true;
      return [{ ref: name, line: path.line, ...(path.fate === null ? {} : { fate: path.fate }), ...about,
        ...(kept.length === 0 ? {} : { points: pointsJson(kept, refs, name) }),
        ...(sources.length === 0 ? {} : { sources }),
        ...(kept.length === path.points.length ? {} : { points_left_out: path.points.length - kept.length }) }];
    });
  });
  return Object.freeze({ json: JSON.stringify(entries), refs: Object.freeze(known) });
}

/** The reader and locked-language fields, last. */
function closingFields(input: DossierInput, fields: readonly FramedMaterialField[]): readonly FramedMaterialField[] {
  return Object.freeze(withQuestionLanguageField(withReaderField(fields, input.question.readingLevel), input.question.language));
}

const answerJson = (answer: ReportAnswerDraft): string => JSON.stringify(answer.segments.map((segment) => segment.text));

/** A point as the stored version keeps it: the numbers are its sources' places in the version's list. */
function reportPointsOf(points: readonly PathRewritePoint[], sources: readonly DossierSource[], refs: Refs,
  trustWords: ReadonlyMap<string, TrustWord> | undefined): readonly DossierReportPoint[] {
  const order = new Map(refs.sources.map(({ key }, at) => [key, at] as const));
  return Object.freeze(points.map((point) => Object.freeze({
    text: point.text,
    trust: trustWords?.get(lower(point.id)) ?? (TRUST_WORDS.includes(point.trust as TrustWord) ? point.trust as TrustWord : null),
    side: point.side,
    sources: Object.freeze([...new Set(sources.filter((source) => lower(source.pointId) === lower(point.id)).flatMap((source) => {
      const place = order.get(sourceKey(source));
      return place === undefined || place >= INVESTIGATION_REPORT_LIMITS.sourcesMax ? [] : [place];
    }))])
  })));
}

/** What a dig's row carries (decision 27): what was dug, the person's words beside their verdict, what it changed. */
function reportDigOf(dig: DossierDig): DossierReportDig {
  const view = dig.rewrite?.view ?? null;
  return Object.freeze({
    picks: Object.freeze(dig.picks.filter((pick) => pick.by === "AI_SUGGESTION").map((pick) => pick.text)),
    own_words: Object.freeze(dig.picks.filter((pick) => pick.by !== "AI_SUGGESTION").map((pick) => pick.text)),
    view: view === null ? null : Object.freeze({ outcome: view.outcome, reason: view.reason }),
    changed: Object.freeze([...(dig.rewrite?.whatChanged ?? [])])
  });
}

/** The paths as the stored version lists them, each under the debate it was dug from: the page and the PDF show this tree. */
function reportPathsOf(input: DossierInput, cards: readonly DossierDig[], refs: Refs): readonly DossierReportPath[] {
  const paths: DossierReportPath[] = [];
  const placed = new Set<string>();
  const newestOf = new Map<string, DossierText>();
  for (const dig of cards) {
    if (lower(dig.parentRunId) === lower(input.first.runId) && dig.positionRef !== null && dig.rewrite?.after !== null && dig.rewrite?.after !== undefined) {
      newestOf.set(dig.positionRef, dig.rewrite.after);
    }
  }
  const under = (parentRunId: string, positionRef: string | null): void => {
    for (const dig of cards) {
      if (placed.has(lower(dig.runId)) || lower(dig.parentRunId) !== lower(parentRunId) || dig.positionRef !== positionRef) continue;
      placed.add(lower(dig.runId));
      visit(dig);
    }
  };
  const visit = (dig: DossierDig): void => {
    const about = reportDigOf(dig);
    const own = cardPathsOf(dig);
    // A dig with no path of its own still has its row: what was dug and what it changed.
    if (own.length === 0) paths.push(Object.freeze({ line: dig.picks[0]?.text ?? "-", summary: null, fate: null, level: dig.level, dig: about }));
    own.forEach((path, at) => {
      paths.push(Object.freeze({ line: path.line, summary: null, fate: path.fate, level: dig.level,
        points: reportPointsOf(path.points, dig.ownMaterial?.sources ?? [], refs, input.trustWords), ...(at === 0 ? { dig: about } : {}) }));
      under(dig.runId, path.positionRef);
    });
    under(dig.runId, null);
  };
  for (const path of input.first.paths) {
    const current = path.current ?? newestOf.get(path.ref) ?? { line: path.storyLine, summary: null, fate: path.storyFate };
    paths.push(Object.freeze({ line: current.line, summary: current.summary, fate: current.fate, level: 0, points: reportPointsOf(path.points, path.sources, refs, input.trustWords) }));
    under(input.first.runId, path.ref);
  }
  under(input.first.runId, null);
  // A dig the walk did not reach (its parent erased, or on a path no longer named) still counts.
  for (const dig of cards) {
    if (placed.has(lower(dig.runId))) continue;
    placed.add(lower(dig.runId));
    visit(dig);
  }
  return Object.freeze(paths.slice(0, INVESTIGATION_REPORT_LIMITS.pathsMax));
}

/** The newest rewrite the dossier read, by its recorded time then its id. */
function newestRewrite(digs: readonly DossierDig[]): Readonly<{ rewriteId: string; recordedAt: string }> | null {
  let newest: Readonly<{ rewriteId: string; recordedAt: string }> | null = null;
  for (const dig of digs) {
    const rewrite = dig.rewrite;
    if (rewrite === null) continue;
    if (newest === null || byTimeThenId({ at: rewrite.recordedAt, id: lower(rewrite.rewriteId) }, { at: newest.recordedAt, id: lower(newest.rewriteId) }) > 0) {
      newest = Object.freeze({ rewriteId: rewrite.rewriteId, recordedAt: rewrite.recordedAt });
    }
  }
  return newest;
}

/** The room the fit keeps beyond the storyteller's first packet: round 2's turn and, when there is a list to ask from, an ask. */
const roomOf = (deeper: boolean): number => INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES + (deeper ? INVESTIGATION_REPORT_ASK_ROOM_BYTES : 0);
const placeholderAnswer: ReportAnswerDraft = Object.freeze({ segments: [Object.freeze({ text: "-", rests_on: [] })] });

/** How many paths the material holds: the first debate's, the digs' at levels 1 to 3, and the list's (the answer's length, decision 27). */
function pathsInMaterial(input: DossierInput, cards: readonly DossierDig[]): number {
  return input.first.paths.length + cards.reduce((sum, dig) => sum + cardPathsOf(dig).length, 0);
}

/** The storyteller's first packet over `fields`, as the guard measures it (the largest first packet of a step). */
function storyFirstBytes(input: DossierInput, fields: readonly FramedMaterialField[]): number {
  const storyFirst = closingFields(input, [...fields, field("answer", answerJson(placeholderAnswer))]);
  return pathRewriteBodyBytes(buildFramedPrompt({ contract: REPORT_STORY_PROMPT_CONTRACT, material: storyFirst }).packet);
}

/** The material over the dossier's shared fields, with `asked` right after them when the writer asked. */
function materialOf(input: DossierInput, dossier: readonly FramedMaterialField[], index: ReportCallMaterial["index"], answerLength: string,
  asked: FramedMaterialField | null, deeper: ReportCallMaterial["deeper"] | undefined): ReportCallMaterial {
  const after = asked === null ? [] : [asked];
  return Object.freeze({
    answerWriter: closingFields(input, [...dossier, ...after, field("answer_length", answerLength)]),
    // The approved checker (decision 4) has no length sentence, so it is given no length to read.
    answerCheckerOf: (candidate: ReportAnswerDraft) => closingFields(input, [...dossier, ...after, field("candidate_answer", JSON.stringify(candidate))]),
    storyWriterOf: (answer: ReportAnswerDraft) => closingFields(input, [...dossier, ...after, field("answer", answerJson(answer))]),
    storyCheckerOf: (answer: ReportAnswerDraft, candidate: ReportStoryDraft) => closingFields(input, [...dossier, ...after,
      field("answer", answerJson(answer)), field("story", JSON.stringify(candidate))]),
    index,
    // F5: the dossier's fields lead every step's material; they go first on the Anthropic wire.
    sharedFieldCount: dossier.length,
    ...(deeper === undefined ? {} : { deeper })
  });
}

export type DossierBuildOptions = Readonly<{
  /** Start the ladder here (the real count said an earlier place is over the line, decision 28). */
  fromLadderAt?: number;
  /** Whether a material with an ask in it may go; absent: the byte guard alone. The first that passes is used. */
  askedFits?: (material: ReportCallMaterial) => boolean | Promise<boolean>;
}>;

/**
 * The dossier, at the first ladder step whose largest call fits the guard (measured as the storyteller's first packet over
 * the dossier, plus the room for round 2's turn and an ask). Nothing fits: TOO_LARGE, the closing fails.
 */
export function buildInvestigationDossier(input: DossierInput, options: DossierBuildOptions = {}): DossierBuilt {
  const cards = digsInTreeOrder(input);
  const refs = refsOf(input, cards);
  const answerLength = investigationReportAnswerLength(pathsInMaterial(input, cards));
  let bodyBytes = 0;
  let at = -1;
  for (const { number, step } of ladder(input, cards)) {
    at += 1;
    if (at < (options.fromLadderAt ?? 0)) continue;
    const built = fieldsAt(input, cards, refs, step);
    bodyBytes = storyFirstBytes(input, built.fields);
    if (!pathRewriteBodyFits(bodyBytes + roomOf(built.deeperNames.length > 0))) continue;
    const dossier = built.fields;
    const index = Object.freeze({ refs: built.refs, cardRefs: built.cardRefs });
    const names: ReadonlySet<string> = new Set(built.deeperNames);
    const askedAt = (asked: readonly string[], capAt: number) => {
      const given = new Set(asked);
      const made = askedJson(given, cards, refs, ASK_POINT_CAPS[capAt]!);
      return materialOf(input, dossier, Object.freeze({ refs: new Set([...built.refs, ...made.refs]), cardRefs: built.cardRefs }), answerLength,
        field("asked_paths", made.json), undefined);
    };
    const askFor = async (asked: readonly string[]): Promise<ReportCallMaterial> => {
      for (let capAt = 0; capAt < ASK_POINT_CAPS.length; capAt += 1) {
        const material = askedAt(asked, capAt);
        const bytes = pathRewriteBodyBytes(buildFramedPrompt({ contract: REPORT_STORY_PROMPT_CONTRACT,
          material: material.storyWriterOf(placeholderAnswer) }).packet);
        if (!pathRewriteBodyFits(bytes + INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES)) continue;
        if (options.askedFits === undefined || await options.askedFits(material)) return material;
      }
      return askedAt(asked, ASK_POINT_CAPS.length - 1);
    };
    const material = materialOf(input, dossier, index, answerLength, null, names.size === 0 ? undefined : Object.freeze({ names, askFor }));
    const cardRuns = new Map<string, string>();
    for (const dig of cards) cardRuns.set(refs.cardRef.get(lower(dig.runId))!, dig.runId);
    const fingerprint = createHash("sha256").update(JSON.stringify(dossier.map((entry) => [entry.name, entry.content])), "utf8").digest("hex");
    return Object.freeze({
      kind: "BUILT" as const, material, cardRuns,
      sources: Object.freeze(refs.sources.slice(0, INVESTIGATION_REPORT_LIMITS.sourcesMax)
        .map(({ source }) => Object.freeze({ site: source.site, link: source.link, title: source.title, quote: source.quote, line: source.line }))),
      paths: reportPathsOf(input, cards, refs),
      ladderStep: number, ladderAt: at, leftOut: built.leftOut, fingerprint, coveredRewrite: newestRewrite(input.digs), bodyBytes
    });
  }
  return Object.freeze({ kind: "TOO_LARGE" as const, bodyBytes });
}

/** The dossier's opening fields alone (what every step's first packet starts with), for the tests' byte checks. */
export function dossierFieldsOf(dossier: Dossier): readonly FramedMaterialField[] {
  const writer = dossier.material.answerWriter;
  const at = writer.findIndex((entry) => entry.name === "answer_length");
  return Object.freeze(writer.slice(0, at < 0 ? writer.length : at));
}
