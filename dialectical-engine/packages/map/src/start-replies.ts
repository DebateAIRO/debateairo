import { z } from "zod";
import {
  READER_SENTENCE_WRITING, START_CARD_KINDS, START_STEP_LIMITS, TypedDomainError, withQuestionLanguageField, withReaderField, type ReadingLevel,
  type ReplyLanguageExpectation
} from "@debateai/kernel";
import type { StartListViewpoint, StartMenu } from "@debateai/contract";
import type { FramedMaterialField, MapReplySalvageRepair, ModelReplyFacts } from "@debateai/providers";
import { mapNamesInternalWord } from "./internal-words.js";
import { mapContractInLanguage } from "./prompts.js";
import { mapClassifyReply, type MapReplyCheck, type MapReplyIssue } from "./replies.js";
import type { MapReplySalvage, MapSalvaged } from "./salvage.js";
import { mapLockedLanguage, type MapSpecContext, type MapStepSpec } from "./specs.js";
import { START_INTERNAL_FIELD_NAMES, START_STEP_DRAFT_CONTRACTS, type StartContractName } from "./start-prompts.js";
import { mapWrongLanguage } from "./text.js";
import type { MapAngle, MapStep } from "./types.js";

/**
 * The step before Start's reply readers (V4 start step, spec 2026-11-03 §2, §4) and the specs of its list, merge, late-merge, combine and
 * fit calls (Task 25: the combine and the fit, at the end). Every reply is read as the engine reads its map (`mapClassifyReply`, exact
 * limits). A well-formed reply is salvaged in code first (the owners' slip recovery order): what breaks a rule is left out whole, never
 * edited, and what is left must still pass the strict schema and the check, or the reply is refused as written. A reply that is not
 * well formed is not salvaged before the schema; when the reply fixer repairs its form, the same salvage runs on the repaired value, so no
 * rule is skipped.
 *
 * Left out: a path from an angle the writer was not given; a text over its limit, one that names an engine field or an item's id
 * (START_INTERNAL_FIELD_NAMES) or one of the step's own ids (an angle, a menu path, a card, a suggestion, a chosen path), or one that copies
 * a form's `<…>` placeholder; a repeated title; an id that is not one the call was given or
 * that is used a second time; a repeat of itself, of an unknown id, or in a cycle (a chain is followed to its end); a group's words that break
 * a rule (the first viewpoint's words stand); a card or suggestion that breaks one, or names a path that was left out (a card only loses it);
 * a suggestion the reply already made (the same pair, or a fit the other way). A late repeat of a listed repeat names the viewpoint shown for it.
 */
const L = START_STEP_LIMITS;
const START_CLASSIFY = Object.freeze({ exactLimits: true });

export type StartSpecContext = MapSpecContext & Readonly<{
  /** null: no reader field and no reader sentence (withReaderField's rule): today's prompts for a page that sent no level. */
  readingLevel: ReadingLevel | null;
}>;

const text = (max: number) => z.string().trim().min(1).max(max);
const PathNumberSchema = z.number().int().min(1);
const RepeatSchema = z.object({ id: z.string(), same_as: z.string() }).strict();
const GroupSchema = z.object({ ids: z.array(z.string()).min(1).max(L.viewpointsPerPathMax), title: text(L.titleMaxChars).nullable(),
  question: text(L.questionMaxChars).nullable() }).strict();

export const startListReplySchema = z.object({
  paths: z.array(z.object({ angle_id: z.string(), title: text(L.titleMaxChars), question: text(L.questionMaxChars), why: text(L.whyMaxChars) }).strict())
    .max(L.viewpointsPerListMax)
}).strict();
export const startMergeReplySchema = z.object({
  repeats: z.array(RepeatSchema).max(L.viewpointsMax),
  paths: z.array(GroupSchema).max(L.menuPathsMax),
  cards: z.array(z.object({ kind: z.enum(START_CARD_KINDS), sentence: text(L.cardSentenceMaxChars), title: text(L.titleMaxChars),
    question: text(L.questionMaxChars), fits_path: PathNumberSchema.nullable(), as_question: text(L.questionMaxChars).nullable() }).strict()).max(L.cardsMax),
  suggestions: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("COMBINE"), paths: z.tuple([PathNumberSchema, PathNumberSchema]), reason: text(L.suggestionReasonMaxChars) }).strict(),
    z.object({ kind: z.literal("FITS"), path: PathNumberSchema, into: PathNumberSchema }).strict()
  ])).max(L.suggestionsMax)
}).strict();
export const startMergeLateReplySchema = z.object({
  repeats: z.array(RepeatSchema).max(L.viewpointsMax),
  paths: z.array(GroupSchema).max(L.menuPathsMax),
  fits: z.array(z.object({ path: PathNumberSchema, into: z.string() }).strict()).max(L.menuPathsMax)
}).strict();
export const startCombineReplySchema = z.object({ title: text(L.pathTitleMaxChars), question: text(L.pathQuestionMaxChars) }).strict();
export const startFitReplySchema = z.object({ fits: z.string().min(1).nullable() }).strict();

type StartGroup = Readonly<{ ids: readonly string[]; title: string | null; question: string | null }>;
type StartRepeat = Readonly<{ id: string; same_as: string }>;
export type StartListReply = Readonly<{ paths: readonly Readonly<{ angle_id: string; title: string; question: string; why: string }>[] }>;
export type StartMergeReply = Readonly<{
  repeats: readonly StartRepeat[];
  paths: readonly StartGroup[];
  cards: readonly Readonly<{ kind: typeof START_CARD_KINDS[number]; sentence: string; title: string; question: string; fits_path: number | null;
    as_question: string | null }>[];
  suggestions: readonly (Readonly<{ kind: "COMBINE"; paths: readonly [number, number]; reason: string }> | Readonly<{ kind: "FITS"; path: number; into: number }>)[];
}>;
export type StartMergeLateReply = Readonly<{ repeats: readonly StartRepeat[]; paths: readonly StartGroup[]; fits: readonly Readonly<{ path: number; into: string }>[] }>;
export type StartCombineReply = Readonly<{ title: string; question: string }>;
export type StartFitReply = Readonly<{ fits: string | null }>;

// The replies' shape alone, without a limit: only a reply of this shape is salvaged.
const ListShape = z.object({ paths: z.array(z.object({ angle_id: z.string(), title: z.string(), question: z.string(), why: z.string() }).strict()) }).strict();
const GroupShape = z.object({ ids: z.array(z.string()), title: z.string().nullable(), question: z.string().nullable() }).strict();
const RepeatShape = RepeatSchema;
const MergeShape = z.object({
  repeats: z.array(RepeatShape), paths: z.array(GroupShape),
  cards: z.array(z.object({ kind: z.string(), sentence: z.string(), title: z.string(), question: z.string(), fits_path: z.number().nullable(),
    as_question: z.string().nullable() }).strict()),
  suggestions: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("COMBINE"), paths: z.tuple([z.number(), z.number()]), reason: z.string() }).strict(),
    z.object({ kind: z.literal("FITS"), path: z.number(), into: z.number() }).strict()
  ]))
}).strict();
const MergeLateShape = z.object({ repeats: z.array(RepeatShape), paths: z.array(GroupShape),
  fits: z.array(z.object({ path: z.number(), into: z.string() }).strict()) }).strict();

/** The step's own opaque ids as words (kernel start-step-limits.ts): an angle, a menu path, a card, a suggestion, a chosen path. */
const START_ID_WORD = /(?<![\p{L}\p{N}_])(?:g[1-7]|kp[0-5][0-9]|cd[1-3]|sg[1-9]|b[1-8])(?![\p{L}\p{N}_])/u;

/** A text a person may read: within its limit, naming no engine field, item id or step id, copying no form placeholder. */
function clean(value: string | null, max: number): value is string {
  if (value === null) return false;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= max && !/<[^<>]*>/u.test(trimmed) && !START_ID_WORD.test(trimmed.normalize("NFKC"))
    && !mapNamesInternalWord(trimmed, START_INTERNAL_FIELD_NAMES);
}

/** One salvage, run before the schema on a well-formed reply and again after it (on what the reply fixer repaired): idempotent. */
function bothWays<T>(run: (value: unknown) => MapSalvaged<unknown>): MapReplySalvage<T> {
  return { decoded: run, parsed: (value: T) => run(value) as MapSalvaged<T> };
}

/** What a salvage did: nothing, ids or entries left out, or only numbers and chains made whole. */
class Repairs {
  dropped = false;
  normalised = false;
  of<V>(value: V, original: unknown): MapSalvaged<unknown> {
    const repairs: MapReplySalvageRepair[] = [];
    if (this.dropped) repairs.push("MAP_IDS_DROPPED");
    if (this.normalised) repairs.push("MAP_IDS_NORMALISED");
    return repairs.length === 0 ? { value: original, repairs: [] } : { value, repairs };
  }
}

/**
 * The repeats, kept and made whole: an id the call was given, marked once, a repeat of another given id (or a listed one); a chain is followed
 * to its end; a cycle drops every repeat in it or leading into it.
 */
function repeatsOf(repeats: readonly StartRepeat[], ids: ReadonlySet<string>, targets: ReadonlySet<string>, done: Repairs,
  shownFor: ReadonlyMap<string, string> = new Map()): StartRepeat[] {
  const first = new Map<string, string>();
  for (const repeat of repeats) {
    if (!ids.has(repeat.id) || !targets.has(repeat.same_as) || repeat.id === repeat.same_as || first.has(repeat.id)) { done.dropped = true; continue; }
    first.set(repeat.id, repeat.same_as);
  }
  const kept: StartRepeat[] = [];
  for (const [id, sameAs] of first) {
    const seen = new Set([id]);
    let end = sameAs;
    let cycle = false;
    while (first.has(end)) {
      if (seen.has(end)) { cycle = true; break; }
      seen.add(end);
      end = first.get(end)!;
    }
    if (cycle || end === id) { done.dropped = true; continue; }
    const shown = shownFor.get(end) ?? end;
    if (shown !== sameAs) done.normalised = true;
    kept.push(Object.freeze({ id, same_as: shown }));
  }
  return kept;
}

/**
 * The paths, kept: each id one the call was given, not a repeat, used once; a path left with no id is left out; past four ids the rest become
 * paths of one; a group's words that break a rule are null (the first viewpoint's words stand); a path of one has none. `numbers` maps a path's
 * number in the reply (from 1) to its number in the result.
 */
function groupsOf(groups: readonly z.infer<typeof GroupShape>[], ids: ReadonlySet<string>, repeated: ReadonlySet<string>, done: Repairs):
  Readonly<{ paths: StartGroup[]; numbers: ReadonlyMap<number, number> }> {
  const used = new Set<string>();
  const paths: StartGroup[] = [];
  const numbers = new Map<number, number>();
  groups.forEach((group, at) => {
    const kept = group.ids.filter((id) => {
      if (!ids.has(id) || repeated.has(id) || used.has(id)) return false;
      used.add(id);
      return true;
    });
    if (kept.length !== group.ids.length || kept.length === 0) done.dropped = true;
    if (kept.length === 0) return;
    const head = kept.slice(0, L.viewpointsPerPathMax);
    const words = head.length > 1 && clean(group.title, L.titleMaxChars) && clean(group.question, L.questionMaxChars);
    if (!words && (group.title !== null || group.question !== null)) done.dropped = true;
    paths.push(Object.freeze({ ids: Object.freeze(head), title: words ? group.title!.trim() : null, question: words ? group.question!.trim() : null }));
    numbers.set(at + 1, paths.length);
    for (const id of kept.slice(L.viewpointsPerPathMax)) {
      done.dropped = true;
      paths.push(Object.freeze({ ids: Object.freeze([id]), title: null, question: null }));
    }
    if (numbers.get(at + 1) !== at + 1) done.normalised = true;
  });
  return { paths, numbers };
}

const issue = (path: readonly (string | number)[], code: string): MapReplyIssue => Object.freeze({ path, code });
const languageIssues = (texts: readonly string[], expected: ReplyLanguageExpectation, path: readonly (string | number)[]): readonly MapReplyIssue[] =>
  texts.length > 0 && mapWrongLanguage(texts.join(" "), expected) ? [issue(path, "MAP_WRONG_LANGUAGE")] : [];

function listSalvage(angleIds: ReadonlySet<string>): MapReplySalvage<StartListReply> {
  return bothWays((value) => {
    const shape = ListShape.safeParse(value);
    if (!shape.success) return { value, repairs: [] };
    const done = new Repairs();
    const titles = new Set<string>();
    const kept = shape.data.paths.filter((path) => {
      const title = path.title.trim().toLocaleLowerCase();
      const good = angleIds.has(path.angle_id) && clean(path.title, L.titleMaxChars) && clean(path.question, L.questionMaxChars)
        && clean(path.why, L.whyMaxChars) && !titles.has(title);
      if (good) titles.add(title);
      return good;
    });
    if (kept.length !== shape.data.paths.length || kept.length > L.viewpointsPerListMax) done.dropped = true;
    return done.of({ paths: kept.slice(0, L.viewpointsPerListMax) }, value);
  });
}

const listCheck = (expected: ReplyLanguageExpectation): MapReplyCheck<StartListReply> => (reply) => reply.paths.length === 0
  ? [issue(["paths"], "START_LIST_EMPTY")]
  : languageIssues(reply.paths.flatMap((path) => [path.title, path.question, path.why]), expected, ["paths"]);

function mergeSalvage(ids: ReadonlySet<string>): MapReplySalvage<StartMergeReply> {
  return bothWays((value) => {
    const shape = MergeShape.safeParse(value);
    if (!shape.success) return { value, repairs: [] };
    const done = new Repairs();
    const repeats = repeatsOf(shape.data.repeats, ids, ids, done);
    const { paths, numbers } = groupsOf(shape.data.paths, ids, new Set(repeats.map((repeat) => repeat.id)), done);
    const cards = shape.data.cards.flatMap((card) => {
      if (!(START_CARD_KINDS as readonly string[]).includes(card.kind) || !clean(card.sentence, L.cardSentenceMaxChars)
        || !clean(card.title, L.titleMaxChars) || !clean(card.question, L.questionMaxChars)) { done.dropped = true; return []; }
      const fits = card.fits_path === null ? null : numbers.get(card.fits_path) ?? null;
      if (fits === null && card.fits_path !== null) done.dropped = true;
      else if (fits !== card.fits_path) done.normalised = true;
      const asQuestion = card.as_question !== null && clean(card.as_question, L.questionMaxChars) ? card.as_question.trim() : null;
      if (asQuestion === null && card.as_question !== null) done.dropped = true;
      return [{ kind: card.kind, sentence: card.sentence.trim(), title: card.title.trim(), question: card.question.trim(), fits_path: fits, as_question: asQuestion }];
    });
    const made = new Set<string>();
    const suggestions = shape.data.suggestions.flatMap((suggestion) => {
      const [a, b] = suggestion.kind === "COMBINE" ? suggestion.paths : [suggestion.path, suggestion.into];
      const from = numbers.get(a);
      const to = numbers.get(b);
      if (from === undefined || to === undefined || from === to
        || (suggestion.kind === "COMBINE" && !clean(suggestion.reason, L.suggestionReasonMaxChars))) { done.dropped = true; return []; }
      // The same pair once: a combine either way round, a fit once and never also the other way.
      const keys = suggestion.kind === "COMBINE" ? [`c:${String(Math.min(from, to))}:${String(Math.max(from, to))}`]
        : [`f:${String(from)}:${String(to)}`, `f:${String(to)}:${String(from)}`];
      if (keys.some((key) => made.has(key))) { done.dropped = true; return []; }
      made.add(keys[0]!);
      if (from !== a || to !== b) done.normalised = true;
      return [suggestion.kind === "COMBINE" ? { kind: "COMBINE" as const, paths: [from, to] as const, reason: suggestion.reason.trim() }
        : { kind: "FITS" as const, path: from, into: to }];
    });
    if (cards.length > L.cardsMax || suggestions.length > L.suggestionsMax) done.dropped = true;
    return done.of({ repeats, paths, cards: cards.slice(0, L.cardsMax), suggestions: suggestions.slice(0, L.suggestionsMax) }, value);
  });
}

const groupTexts = (paths: readonly StartGroup[]): string[] => paths.flatMap((path) => [path.title, path.question].filter((one): one is string => one !== null));
/** Each part's texts are judged together and apart from the other parts' (ruling R-3), and refused at that part's place. */
const mergeCheck = (expected: ReplyLanguageExpectation): MapReplyCheck<StartMergeReply> => (reply) => reply.paths.length === 0
  ? [issue(["paths"], "START_MERGE_EMPTY")]
  : [...languageIssues(groupTexts(reply.paths), expected, ["paths"]),
    ...languageIssues(reply.cards.flatMap((card) => [card.sentence, card.title, card.question, ...(card.as_question === null ? [] : [card.as_question])]),
      expected, ["cards"]),
    ...languageIssues(reply.suggestions.flatMap((suggestion) => suggestion.kind === "COMBINE" ? [suggestion.reason] : []), expected, ["suggestions"])];

function mergeLateSalvage(ids: ReadonlySet<string>, listed: ReadonlySet<string>, refs: ReadonlySet<string>,
  shownFor: ReadonlyMap<string, string>): MapReplySalvage<StartMergeLateReply> {
  return bothWays((value) => {
    const shape = MergeLateShape.safeParse(value);
    if (!shape.success) return { value, repairs: [] };
    const done = new Repairs();
    const repeats = repeatsOf(shape.data.repeats, ids, new Set([...ids, ...listed]), done, shownFor);
    const { paths, numbers } = groupsOf(shape.data.paths, ids, new Set(repeats.map((repeat) => repeat.id)), done);
    const placed = new Set<number>();
    const fits = shape.data.fits.flatMap((fit) => {
      const path = numbers.get(fit.path);
      if (path === undefined || !refs.has(fit.into) || placed.has(path)) { done.dropped = true; return []; }
      if (path !== fit.path) done.normalised = true;
      placed.add(path);
      return [{ path, into: fit.into }];
    });
    return done.of({ repeats, paths, fits }, value);
  });
}

/** A late merge may place every new suggestion as a repeat; one that places nothing at all is refused. */
const mergeLateCheck = (expected: ReplyLanguageExpectation): MapReplyCheck<StartMergeLateReply> => (reply) =>
  reply.paths.length === 0 && reply.repeats.length === 0 ? [issue(["paths"], "START_MERGE_EMPTY")] : languageIssues(groupTexts(reply.paths), expected, ["paths"]);

/** One start-step call: its draft (with the reader sentence after a blank line when a level is set) in the question's language, its material. */
function startSpecOf<T>(step: MapStep, ctx: StartSpecContext, name: StartContractName, material: readonly FramedMaterialField[],
  schema: z.ZodType<T>, check: MapReplyCheck<T>, salvage: MapReplySalvage<T>): MapStepSpec<T> {
  const lock = mapLockedLanguage(ctx);
  const draft = START_STEP_DRAFT_CONTRACTS[name];
  const told = ctx.readingLevel === null ? draft : Object.freeze({ ...draft, instruction: `${draft.instruction}\n\n${READER_SENTENCE_WRITING}` });
  const fields = withQuestionLanguageField(withReaderField(material, ctx.readingLevel), lock);
  return Object.freeze({
    step,
    contract: mapContractInLanguage(told, lock, ctx.languageName),
    material: Object.freeze(fields.map((entry) => Object.freeze({ ...entry }))),
    guidedWords: null,
    replyWordsCeiling: null,
    classify: (content: string, reply?: ModelReplyFacts) => mapClassifyReply(content, reply, schema, check, salvage, START_CLASSIFY).classification,
    read: (content: string, reply?: ModelReplyFacts) => {
      const out = mapClassifyReply(content, reply, schema, check, salvage, START_CLASSIFY);
      if (out.value === null) throw new TypedDomainError("MAP_REPLY_UNREADABLE", `MAP_REPLY_UNREADABLE: the ${step} reply did not pass its check`);
      return out.value;
    }
  });
}

const field = (name: string, content: unknown): FramedMaterialField => ({ name, content: typeof content === "string" ? content : JSON.stringify(content) });
const suggestionsOf = (viewpoints: readonly Pick<StartListViewpoint, "viewpoint_id" | "title" | "question" | "why">[]) =>
  viewpoints.map((viewpoint) => ({ id: viewpoint.viewpoint_id, title: viewpoint.title, question: viewpoint.question, why: viewpoint.why }));
const refused = (code: string, detail: string): TypedDomainError => new TypedDomainError(code, `${code}: ${detail}`);

/** One list writer's call (list `listNo`, 1..9), from one to four angles. */
export function startListSpec(ctx: StartSpecContext, angles: readonly MapAngle[], listNo: number): MapStepSpec<StartListReply> {
  if (!Number.isInteger(listNo) || listNo < 1 || listNo > L.listsMax) throw refused("START_LIST_INVALID", "a list is numbered 1 to 9");
  if (angles.length < 1 || angles.length > L.anglesPerListMax) throw refused("START_LIST_INVALID", "a list is given one to four angles");
  return startSpecOf("START_LIST", ctx, "list", [field("question_line", ctx.questionLine),
    field("angles", angles.map((angle) => ({ angle_id: angle.angleId, label: angle.label, focus: angle.focus })))],
  startListReplySchema as z.ZodType<StartListReply>, listCheck(ctx.replyLanguage), listSalvage(new Set(angles.map((angle) => angle.angleId))));
}

/** The merge of the first lists: what the asker said, and every suggestion with its id, never its writer. */
export function startMergeSpec(ctx: StartSpecContext, input: Readonly<{ said: readonly string[]; viewpoints: readonly StartListViewpoint[] }>):
  MapStepSpec<StartMergeReply> {
  if (input.viewpoints.length < 1 || input.viewpoints.length > L.viewpointsMax) throw refused("START_MERGE_INVALID", "a merge is given 1 to 54 suggestions");
  return startSpecOf("START_MERGE", ctx, "merge", [field("question_line", ctx.questionLine), field("said", input.said),
    field("suggestions", suggestionsOf(input.viewpoints))],
  startMergeReplySchema as z.ZodType<StartMergeReply>, mergeCheck(ctx.replyLanguage), mergeSalvage(new Set(input.viewpoints.map((one) => one.viewpoint_id))));
}

/** A late list's merge: the menu's paths so far, every suggestion already listed, and the new ones. */
export function startMergeLateSpec(ctx: StartSpecContext, input: Readonly<{ said: readonly string[]; prior: StartMenu;
  viewpoints: readonly StartListViewpoint[] }>): MapStepSpec<StartMergeLateReply> {
  const listed = [...input.prior.viewpoints, ...input.prior.repeats];
  // Every late list held since the menu was made may come at once; the menu never holds more than 54 suggestions in all.
  if (input.viewpoints.length < 1 || listed.length + input.viewpoints.length > L.viewpointsMax) {
    throw refused("START_MERGE_INVALID", "a late merge is given 1 or more new suggestions, at most 54 with those listed");
  }
  // A listed repeat stands for the viewpoint shown for it.
  const shownFor = new Map(input.prior.viewpoints.flatMap((shown) => shown.repeat_ids.map((id) => [id, shown.viewpoint_id] as const)));
  return startSpecOf("START_MERGE", ctx, "mergeLate", [field("question_line", ctx.questionLine), field("said", input.said),
    field("paths_so_far", input.prior.paths.map((path) => ({ path_ref: path.path_ref, title: path.title, question: path.question }))),
    field("listed", suggestionsOf(listed)), field("new_suggestions", suggestionsOf(input.viewpoints))],
  startMergeLateReplySchema as z.ZodType<StartMergeLateReply>, mergeLateCheck(ctx.replyLanguage),
  mergeLateSalvage(new Set(input.viewpoints.map((one) => one.viewpoint_id)), new Set(listed.map((one) => one.viewpoint_id)),
    new Set(input.prior.paths.map((path) => path.path_ref)), shownFor));
}

// V4 start step, Task 25: the combine and the fit. The word-edge cut lives here, beside the combine's reader that cuts with it; the lists
// run (start-step.ts) imports it from here, so the two files never import each other's values.
const START_WORD_SEGMENTER = new Intl.Segmenter("und", { granularity: "word" });

/**
 * `text` in at most `max` UTF-16 code units, cut after its last whole word (Intl.Segmenter's word edges, so scripts written without
 * spaces cut too); with no word edge inside the limit, a hard cut that never splits a surrogate pair.
 */
export function startCutAtWordEdge(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 0) return "";
  let edge = 0;
  for (const segment of START_WORD_SEGMENTER.segment(text)) {
    const end = segment.index + segment.segment.length;
    if (end > max) break;
    if (segment.isWordLike === true) edge = end;
  }
  if (edge > 0) return text.slice(0, edge);
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

/**
 * The combined question never restates the main question (spec §6 item 3, the known fault; code checks it too). A word is a word-like
 * segment of three characters or more, lower-cased in the question's language; a main question of fewer than three such words is never
 * restated; a question restates it when it holds 60% or more of the main question's distinct words.
 */
export const START_COMBINE_OVERLAP = Object.freeze({ share: 0.6, minWordChars: 3, minWords: 3 });

/** A segmenter in the question's language; a tag Intl does not take falls back to the root locale. */
function segmenterFor(languageTag: string, granularity: "word" | "sentence"): Intl.Segmenter {
  try { return new Intl.Segmenter(languageTag, { granularity }); } catch { return new Intl.Segmenter("und", { granularity }); }
}
function lowerIn(text: string, languageTag: string): string {
  try { return text.toLocaleLowerCase(languageTag); } catch { return text.toLowerCase(); }
}
function distinctWords(text: string, languageTag: string): ReadonlySet<string> {
  const words = new Set<string>();
  for (const segment of segmenterFor(languageTag, "word").segment(text.normalize("NFKC"))) {
    if (segment.isWordLike !== true) continue;
    const word = lowerIn(segment.segment, languageTag);
    if ([...word].length >= START_COMBINE_OVERLAP.minWordChars) words.add(word);
  }
  return words;
}

export function startRestatesMainQuestion(question: string, mainQuestion: string, languageTag: string): boolean {
  const main = distinctWords(mainQuestion, languageTag);
  if (main.size < START_COMBINE_OVERLAP.minWords) return false;
  const asked = distinctWords(question, languageTag);
  return [...main].filter((word) => asked.has(word)).length / main.size >= START_COMBINE_OVERLAP.share;
}

const CombineShape = z.object({ title: z.string(), question: z.string() }).strict();

/** Before the schema: the sentences that restate the main question left out (when one does not), and an over-long text cut at a word edge. */
function combineSalvage(mainQuestion: string, languageTag: string): MapReplySalvage<StartCombineReply> {
  return bothWays((value) => {
    const shape = CombineShape.safeParse(value);
    if (!shape.success) return { value, repairs: [] };
    const title = shape.data.title.trim();
    let question = shape.data.question.trim();
    if (startRestatesMainQuestion(question, mainQuestion, languageTag)) {
      const kept = [...segmenterFor(languageTag, "sentence").segment(question)].filter((sentence) => sentence.segment.trim() !== ""
        && !startRestatesMainQuestion(sentence.segment, mainQuestion, languageTag));
      if (kept.length > 0) question = kept.map((sentence) => sentence.segment).join("").trim();
    }
    const salvaged = { title: startCutAtWordEdge(title, L.pathTitleMaxChars), question: startCutAtWordEdge(question, L.pathQuestionMaxChars) };
    return salvaged.title === title && salvaged.question === shape.data.question.trim() ? { value, repairs: [] }
      : { value: salvaged, repairs: ["MAP_TEXT_TRIMMED"] };
  });
}

const combineCheck = (mainQuestion: string, languageTag: string, expected: ReplyLanguageExpectation): MapReplyCheck<StartCombineReply> => (reply) => [
  ...(startRestatesMainQuestion(reply.question, mainQuestion, languageTag) ? [issue(["question"], "START_COMBINE_RESTATES_MAIN_QUESTION")] : []),
  ...languageIssues([reply.title, reply.question], expected, ["question"])
];

const fitCheck = (keys: ReadonlySet<string>): MapReplyCheck<StartFitReply> => (reply) =>
  reply.fits !== null && !keys.has(reply.fits) ? [issue(["fits"], "START_FIT_UNKNOWN_KEY")] : [];

/** The combine: the main question (only so the writer knows what the path is for), the points the person put together. */
export function startCombineSpec(ctx: StartSpecContext, members: readonly Readonly<{ title: string | null; question: string }>[]):
  MapStepSpec<StartCombineReply> {
  if (members.length < 2 || members.length > L.viewpointsPerPathMax) throw refused("START_COMBINE_INVALID", "a combine is given 2 to 4 points");
  return startSpecOf("START_COMBINE", ctx, "combine", [field("main_question", ctx.questionLine),
    field("points", members.map((member) => ({ title: member.title, question: member.question })))],
  startCombineReplySchema as z.ZodType<StartCombineReply>, combineCheck(ctx.questionLine, ctx.languageTag, ctx.replyLanguage),
  combineSalvage(ctx.questionLine, ctx.languageTag));
}

/** The own-path fit: the question, the person's own point of view, the chosen paths with their keys; never a reader (it writes no prose). */
export function startFitSpec(ctx: MapSpecContext, input: Readonly<{ ownText: string; paths: readonly Readonly<{ key: string; title: string; question: string }>[] }>):
  MapStepSpec<StartFitReply> {
  if (input.paths.length < 1 || input.paths.length > L.pathsMax) throw refused("START_FIT_INVALID", "a fit is given 1 to 7 paths");
  return startSpecOf("START_FIT", { ...ctx, readingLevel: null }, "fit", [field("question_line", ctx.questionLine), field("own_view", input.ownText),
    field("paths", input.paths.map((path) => ({ key: path.key, title: path.title, question: path.question })))],
  startFitReplySchema as z.ZodType<StartFitReply>, fitCheck(new Set(input.paths.map((path) => path.key))), {});
}
