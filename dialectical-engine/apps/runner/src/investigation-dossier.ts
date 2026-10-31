import { createHash } from "node:crypto";
import { cutQuoteAtWordEdge, type StoryFate } from "@debateai/contract";
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
 * same investigation (so a resumed closing sends the same prompts and its answered calls replay free). It never needs a
 * web page's text, so the wipe at closing changes nothing a later version reads.
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
 *    the fates before and after, and the dig's own paths' lines and fates. A FAILED rewrite (or none) brings in the dig's
 *    own material instead: its answer text and its paths' points (Q-D13: a dig keeps both);
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
 * packet plus a fixed room for those. 1: everything whole. 2: the first debate keeps fewer whole points per path
 * (disputed first). 3: cards become short (the new line, what the dig changed, the verdict); cards on the winning path and
 * cards whose dig changed a fate stay whole longest. 4: the deepest cards become one line each ("also dug": its first
 * pick, changed or not), level by level from the deepest. 5: only for a very large investigation, the oldest one-line
 * entries are left out whole, and counted. Steps 2-5 are disclosed with the approved line (owner F13).
 */

export const INVESTIGATION_REPORT_INPUT_OVER_LIMIT = "INVESTIGATION_REPORT_INPUT_OVER_LIMIT" as const;
/** Room for the largest call beyond the answer writer's first packet: the checked answer, the story draft, the problem. */
export const INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES = 80 * 1024;
/** The ladder's step 2: the first debate's whole points kept per path, in turn. */
export const INVESTIGATION_REPORT_POINT_CAPS = Object.freeze([6, 3, 1, 0]);
/** The words the answer is asked for (R4's length target) and the checker's own reply. */
export const INVESTIGATION_REPORT_ANSWER_LENGTH = "about 300 words" as const;
export const INVESTIGATION_REPORT_CHECKER_LENGTH = "about 100 words" as const;

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
export type DossierSource = Readonly<{ pointId: string; site: string; title: string | null; quote: string; line: string | null }>;

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
  /** Its own answer text and paths, read when its rewrite FAILED or is missing; null otherwise or unread. */
  ownMaterial: Readonly<{ answer: readonly string[]; paths: readonly PathRewriteDigPath[]; sources: readonly DossierSource[] }> | null;
}>;

export type DossierPath = Readonly<{
  /** The map's id of the path (the story path's position_ref, `<ref>#2` for a position argued twice). */
  ref: string;
  storyLine: string;
  storyFate: StoryFate;
  points: readonly PathRewritePoint[];
  sources: readonly DossierSource[];
}>;

export type DossierInput = Readonly<{
  question: PathRewriteQuestion;
  first: Readonly<{
    runId: string;
    /** The first debate's story: its short answer and "what would change it"; null when it has none. */
    answer: Readonly<{ headline: string; summary: string; change: string }> | null;
    paths: readonly DossierPath[];
  }>;
  digs: readonly DossierDig[];
  earlier: Readonly<{ version: number; segments: readonly string[] }> | null;
}>;

/* ----------------------------------------------------------------- the output */

export type Dossier = Readonly<{
  kind: "BUILT";
  material: ReportCallMaterial;
  /** G-ref → the dig's run. */
  cardRuns: ReadonlyMap<string, string>;
  /** The sources as the stored version lists them (the order of their W-refs). */
  sources: readonly Readonly<{ site: string; title: string | null; quote: string; line: string | null }>[];
  ladderStep: number;
  /** Points and cards a shortened dossier left out (step 5 cards, step 2 points). */
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
  const pathsOf = (dig: DossierDig): readonly string[] =>
    dig.rewrite?.digPaths.map((path) => path.positionRef) ?? dig.ownMaterial?.paths.map((path) => path.positionRef) ?? [];
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

const sourceKey = (source: DossierSource): string => `${lower(source.pointId)}\u0000${source.site}\u0000${source.quote}`;

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
type Step = Readonly<{ pointCap: number; forms: ReadonlyMap<string, CardForm> }>;

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

function cardJson(dig: DossierDig, form: CardForm, input: DossierInput, refs: Refs,
  digPathRefOf: (parentRunId: string, positionRef: string) => string | null) {
  const ref = refs.cardRef.get(lower(dig.runId))!;
  const base = { ref, from: fromJson(dig, input, refs, digPathRefOf), level: dig.level };
  if (form === "ONE_LINE") {
    return { ...base, also_dug: { pick: dig.picks[0]?.text ?? "", changed: changedText(dig) } };
  }
  const picks = dig.picks.map((pick) => ({ text: pick.text, marked: pick.by }));
  const rewrite = dig.rewrite;
  if (rewrite === null || rewrite.state === "FAILED" || rewrite.after === null) {
    const own = dig.ownMaterial;
    return {
      ...base, picks, rewrite: { state: "FAILED" },
      ...(own === null || form === "SHORT" ? {} : { own_material: {
        answer: [...own.answer],
        paths: own.paths.map((path, at) => ({ ref: `${ref}.D${String(at + 1)}`, statement: path.statement,
          points: pointsJson(path.points, refs, `${ref}.D${String(at + 1)}`), sources: sourcesOf(own.sources, path.points, refs) }))
      } })
    };
  }
  const view = rewrite.view === null ? {} : { view: { outcome: rewrite.view.outcome, scope: rewrite.view.scope, reason: rewrite.view.reason } };
  if (form === "SHORT") {
    return { ...base, picks, rewrite: { state: rewrite.state, after: { line: rewrite.after.line, fate: rewrite.after.fate },
      what_changed: [...rewrite.whatChanged], ...view } };
  }
  return {
    ...base, picks,
    rewrite: {
      state: rewrite.state, before: textJson(rewrite.before), after: textJson(rewrite.after), what_changed: [...rewrite.whatChanged],
      ...view,
      dig_paths: rewrite.digPaths.map((path, at) => ({ ref: `${ref}.D${String(at + 1)}`, line: path.line, fate: path.fate }))
    }
  };
}

type Built = Readonly<{ fields: readonly FramedMaterialField[]; refs: ReadonlySet<string>; cardRefs: readonly string[]; leftOut: number }>;

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
    const current = latest.get(path.ref) ?? { line: path.storyLine, summary: null, fate: path.storyFate };
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
    const own = dig.rewrite?.digPaths.map((path) => path.positionRef) ?? dig.ownMaterial?.paths.map((path) => path.positionRef) ?? [];
    own.forEach((positionRef, at) => digPathRefs.set(`${lower(dig.runId)}\u0000${positionRef}`, `${ref}.D${String(at + 1)}`));
  }
  const digPathRefOf = (parentRunId: string, positionRef: string) => digPathRefs.get(`${lower(parentRunId)}\u0000${positionRef}`) ?? null;
  const followUps: unknown[] = [];
  const cardRefs: string[] = [];
  let cardsLeftOut = 0;
  for (const dig of cards) {
    const form = step.forms.get(lower(dig.runId)) ?? "WHOLE";
    if (form === "LEFT_OUT") { cardsLeftOut += 1; continue; }
    const ref = refs.cardRef.get(lower(dig.runId))!;
    cardRefs.push(ref);
    known.add(ref);
    if (form === "WHOLE") {
      const count = dig.rewrite?.digPaths.length ?? dig.ownMaterial?.paths.length ?? 0;
      for (let at = 1; at <= count; at += 1) known.add(`${ref}.D${String(at)}`);
      if (dig.rewrite === null || dig.rewrite.state === "FAILED") {
        for (const point of dig.ownMaterial?.paths.flatMap((path) => path.points) ?? []) known.add(refs.pointRef.get(lower(point.id))!);
      }
    }
    followUps.push(cardJson(dig, form, input, refs, digPathRefOf));
  }
  const views = cards.flatMap((dig) => {
    const words = dig.picks.filter((pick) => pick.by !== "AI_SUGGESTION").map((pick) => pick.text);
    const form = step.forms.get(lower(dig.runId)) ?? "WHOLE";
    if (words.length === 0 || form === "LEFT_OUT") return [];
    const view = dig.rewrite?.view ?? null;
    return [{ card: refs.cardRef.get(lower(dig.runId))!, words, marked: "PERSON",
      ...(view === null ? {} : { verdict: { outcome: view.outcome, scope: view.scope, reason: view.reason } }) }];
  });
  const cited = new Set<string>();
  for (const path of paths) for (const source of path.sources) cited.add(source);
  for (const card of followUps as { own_material?: { paths: { sources: string[] }[] } }[]) {
    for (const path of card.own_material?.paths ?? []) for (const source of path.sources) cited.add(source);
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
      would_change: input.first.answer.change } }),
    paths
  };
  const leftOut = pointsLeftOut + cardsLeftOut;
  return Object.freeze({
    refs: known, cardRefs: Object.freeze(cardRefs), leftOut,
    fields: Object.freeze([
      field("question", question.line),
      ...(question.place === null ? [] : [field("place", question.place)]),
      ...(question.time === null ? [] : [field("time", question.time)]),
      ...(question.purpose === null ? [] : [field("purpose", question.purpose)]),
      field("first_debate", JSON.stringify(first)),
      field("follow_ups", JSON.stringify(followUps)),
      ...(views.length === 0 ? [] : [field("views", JSON.stringify(views))]),
      ...(sources.length === 0 ? [] : [field("sources", JSON.stringify(sources))]),
      ...(input.earlier === null ? [] : [field("earlier_report", JSON.stringify({ version: input.earlier.version, answer: [...input.earlier.segments] }))]),
      ...(leftOut === 0 ? [] : [field("left_out", JSON.stringify({ points: pointsLeftOut, follow_ups: cardsLeftOut }))])
    ])
  });
}

/** The ladder's steps in order, each a pure description (built lazily: a large tree has many sub-steps). */
function* ladder(input: DossierInput, cards: readonly DossierDig[]): Generator<Readonly<{ number: number; step: Step }>> {
  const whole: ReadonlyMap<string, CardForm> = new Map();
  yield { number: 1, step: { pointCap: Number.POSITIVE_INFINITY, forms: whole } };
  for (const cap of INVESTIGATION_REPORT_POINT_CAPS) yield { number: 2, step: { pointCap: cap, forms: whole } };
  const cap = INVESTIGATION_REPORT_POINT_CAPS.at(-1)!;
  const winning = input.first.paths[0]?.ref ?? null;
  const onWinning = (dig: DossierDig): boolean => lower(dig.parentRunId) === lower(input.first.runId) && dig.positionRef === winning;
  // Step 3: the other cards short first, then the ones that stay whole longest.
  const forms = new Map<string, CardForm>();
  for (const dig of cards) if (!onWinning(dig) && !changedFate(dig)) forms.set(lower(dig.runId), "SHORT");
  yield { number: 3, step: { pointCap: cap, forms: new Map(forms) } };
  for (const dig of cards) forms.set(lower(dig.runId), "SHORT");
  yield { number: 3, step: { pointCap: cap, forms: new Map(forms) } };
  // Step 4: one line each, the deepest level first.
  const levels = [...new Set(cards.map((dig) => dig.level))].sort((a, b) => b - a);
  for (const level of levels) {
    for (const dig of cards) if (dig.level === level) forms.set(lower(dig.runId), "ONE_LINE");
    yield { number: 4, step: { pointCap: cap, forms: new Map(forms) } };
  }
  // Step 5: the oldest one-line entries left out, a few at a time.
  const oldest = [...cards].sort((a, b) => byTimeThenId({ at: a.finishedAt, id: lower(a.runId) }, { at: b.finishedAt, id: lower(b.runId) }));
  const chunk = Math.max(1, Math.ceil(oldest.length / 20));
  for (let at = 0; at < oldest.length; at += chunk) {
    for (const dig of oldest.slice(at, at + chunk)) forms.set(lower(dig.runId), "LEFT_OUT");
    yield { number: 5, step: { pointCap: cap, forms: new Map(forms) } };
  }
}

/** The reader and locked-language fields, last. */
function closingFields(input: DossierInput, fields: readonly FramedMaterialField[]): readonly FramedMaterialField[] {
  return Object.freeze(withQuestionLanguageField(withReaderField(fields, input.question.readingLevel), input.question.language));
}

const answerJson = (answer: ReportAnswerDraft): string => JSON.stringify(answer.segments.map((segment) => segment.text));

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

/**
 * The dossier, at the first ladder step whose largest call fits the guard (measured as the storyteller's first packet over
 * the dossier, plus the room for round 2's turn). Nothing fits: TOO_LARGE, the closing fails.
 */
export function buildInvestigationDossier(input: DossierInput): DossierBuilt {
  const cards = digsInTreeOrder(input);
  const refs = refsOf(input, cards);
  const placeholderAnswer: ReportAnswerDraft = Object.freeze({ segments: [Object.freeze({ text: "-", rests_on: [] })] });
  let bodyBytes = 0;
  for (const { number, step } of ladder(input, cards)) {
    const built = fieldsAt(input, cards, refs, step);
    const storyFirst = closingFields(input, [...built.fields, field("answer", answerJson(placeholderAnswer))]);
    bodyBytes = pathRewriteBodyBytes(buildFramedPrompt({ contract: REPORT_STORY_PROMPT_CONTRACT, material: storyFirst }).packet);
    if (!pathRewriteBodyFits(bodyBytes + INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES)) continue;
    const dossier = built.fields;
    const material: ReportCallMaterial = Object.freeze({
      answerWriter: closingFields(input, [...dossier, field("answer_length", INVESTIGATION_REPORT_ANSWER_LENGTH)]),
      answerCheckerOf: (candidate: ReportAnswerDraft) => closingFields(input, [...dossier,
        field("answer_length", INVESTIGATION_REPORT_ANSWER_LENGTH), field("candidate_answer", JSON.stringify(candidate)),
        field("length", INVESTIGATION_REPORT_CHECKER_LENGTH)]),
      storyWriterOf: (answer: ReportAnswerDraft) => closingFields(input, [...dossier, field("answer", answerJson(answer))]),
      storyCheckerOf: (answer: ReportAnswerDraft, candidate: ReportStoryDraft) => closingFields(input, [...dossier,
        field("answer", answerJson(answer)), field("story", JSON.stringify(candidate))]),
      index: Object.freeze({ refs: built.refs, cardRefs: built.cardRefs })
    });
    const cardRuns = new Map<string, string>();
    for (const dig of cards) cardRuns.set(refs.cardRef.get(lower(dig.runId))!, dig.runId);
    const fingerprint = createHash("sha256").update(JSON.stringify(dossier.map((entry) => [entry.name, entry.content])), "utf8").digest("hex");
    return Object.freeze({
      kind: "BUILT" as const, material, cardRuns,
      sources: Object.freeze(refs.sources.filter(({ key }) => built.refs.has(refs.sourceRef.get(key)!))
        .map(({ source }) => Object.freeze({ site: source.site, title: source.title, quote: source.quote, line: source.line }))),
      ladderStep: number, leftOut: built.leftOut, fingerprint, coveredRewrite: newestRewrite(input.digs), bodyBytes
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
