import { z } from "zod";
import {
  ANGLE_ID_PATTERN, CARD_ID_PATTERN, MENU_ID_PATTERN, MENU_PATH_REF_PATTERN, PATH_ID_PATTERN, START_CARD_KINDS, START_PATH_AUTHORS,
  START_PATHS_SOURCES, START_REF_PATTERN, START_STEP_LIMITS, SUGGESTION_ID_PATTERN, VIEWPOINT_ID_PATTERN
} from "@debateai/kernel";
import { AccountReadingLevelSchema } from "./account-memory.js";
import { NamedLanguageSchema, QuestionLanguageChoiceSchema, QuestionLanguageOfferSchema, SiteLanguageSchema } from "./question-language.js";
import { PurposeAnswerSchema, WEB_CONTRACT_LIMITS } from "./web.js";

/**
 * V4 start step, Task 9 (spec 2026-11-03 §2, §4): THE STEP BEFORE START, on the wire. Before Start, several AIs write
 * lists of paths from planned angles (never named on a list: no maker, no model), one merge turns them into a menu the
 * person shapes, and the ask carries the chosen paths. Every shape is strict. The plain values (limits, id patterns,
 * sources, authors, card kinds) live in @debateai/kernel (packages/map needs them and imports this package only as
 * types) and are re-exported here unchanged.
 */
export {
  ANGLE_ID_PATTERN, CARD_ID_PATTERN, MENU_ID_PATTERN, MENU_PATH_REF_PATTERN, PATH_ID_PATTERN, START_CARD_KINDS, START_PATH_AUTHORS,
  START_PATHS_SOURCES, START_REF_PATTERN, START_STEP_LIMITS, SUGGESTION_ID_PATTERN, VIEWPOINT_ID_PATTERN, pathIdOf, type PathId
} from "@debateai/kernel";

export type StartPathsSource = typeof START_PATHS_SOURCES[number];
export type StartPathAuthor = typeof START_PATH_AUTHORS[number];
export type StartCardKind = typeof START_CARD_KINDS[number];

/** Why the step before Start answered nothing (the page then starts without paths, or shows what it has). */
export const START_STEP_NONE_REASONS = Object.freeze(["OFF", "NOT_ASKED", "POOL_EMPTY", "RECORD_DOWN", "CHECK_UNAVAILABLE",
  "NO_LISTS", "DEADLINE", "TRANSPORT", "DRAINING", "UNREADABLE"] as const);
export type StartStepNoneReason = typeof START_STEP_NONE_REASONS[number];
/** Why a lists stream ended. */
export const START_LISTS_END_REASONS = Object.freeze(["DONE", "LANGUAGE_CHOICE", "REFUSED", "NONE", "DRAINING"] as const);
export type StartListsEndReason = typeof START_LISTS_END_REASONS[number];

/** 400: the chosen paths do not parse or do not match their signed menu. */
export const START_PATHS_INVALID = "START_PATHS_INVALID" as const;
/** 400: more paths than How wide (or than the plan) allows. */
export const START_PATHS_TOO_MANY = "START_PATHS_TOO_MANY" as const;
/** 409: a signed list, menu or check has run out of time; the page offers "Read it again". */
export const START_PATHS_EXPIRED = "START_PATHS_EXPIRED" as const;
/** 409: the question, the plan or the settings version changed since the lists were written. */
export const START_PATHS_STALE = "START_PATHS_STALE" as const;
/** 409: the active settings version allows fewer paths than were chosen (the site was updated since Next); the page asks to combine or remove down to the room's widest. */
export const START_PATHS_NARROWED = "START_PATHS_NARROWED" as const;

const L = START_STEP_LIMITS;
const words = (max: number) => z.string().trim().min(1).max(max);
const ViewpointIdSchema = z.string().regex(VIEWPOINT_ID_PATTERN);
const ListViewpointIdSchema = z.string().regex(/^pt[1-9][1-6]$/u);
const MenuPathRefSchema = z.string().regex(MENU_PATH_REF_PATTERN);
const OriginalQuestionLineSchema = z.string().trim().min(1).max(8192);

/** A chosen path's id, b1..b8 (a string, not an enum: the page and the store compare it by pattern). */
export const PathIdSchema = z.string().regex(PATH_ID_PATTERN);
/** A reference the server signed (a list, a menu, a check, a combined question). */
export const StartRefSchema = z.string().min(3).max(L.refMaxChars).regex(START_REF_PATTERN);

export const StartAngleSchema = z.object({
  angle_id: z.string().regex(ANGLE_ID_PATTERN),
  kind: z.enum(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "SPECIFIC", "GENERAL"]),
  label: words(L.angleLabelMaxChars)
}).strict();
export type StartAngle = z.infer<typeof StartAngleSchema>;

export const StartListViewpointSchema = z.object({
  viewpoint_id: ViewpointIdSchema,
  title: words(L.titleMaxChars),
  question: words(L.questionMaxChars),
  why: words(L.whyMaxChars),
  angle_id: z.string().regex(ANGLE_ID_PATTERN)
}).strict();
export type StartListViewpoint = z.infer<typeof StartListViewpointSchema>;

/** One AI's list: its number and the angles it looked from; never who wrote it. Viewpoint ids are pt<list_no><item>. */
export const StartListSchema = z.object({
  list_no: z.number().int().min(1).max(L.listsMax),
  angles: z.array(StartAngleSchema).min(1).max(L.anglesPerListMax),
  viewpoints: z.array(StartListViewpointSchema).min(1).max(L.viewpointsPerListMax)
}).strict().superRefine((list, ctx) => {
  const angles = new Set(list.angles.map((angle) => angle.angle_id));
  if (angles.size !== list.angles.length) ctx.addIssue({ code: "custom", path: ["angles"], message: "angle ids are unique" });
  const ids = list.viewpoints.map((one) => one.viewpoint_id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["viewpoints"], message: "viewpoint ids are unique" });
  list.viewpoints.forEach((one, index) => {
    if (!new RegExp(`^pt${list.list_no}[1-6]$`, "u").test(one.viewpoint_id)) {
      ctx.addIssue({ code: "custom", path: ["viewpoints", index, "viewpoint_id"], message: "a list's viewpoint ids are pt<list_no><item>" });
    }
    if (!angles.has(one.angle_id)) ctx.addIssue({ code: "custom", path: ["viewpoints", index, "angle_id"], message: "the angle is one of the list's" });
  });
});
export type StartList = z.infer<typeof StartListSchema>;
export const SignedStartListSchema = z.object({ list: StartListSchema, ref: StartRefSchema }).strict();
export type SignedStartList = z.infer<typeof SignedStartListSchema>;

/** A shown viewpoint, with the ids of the viewpoints the merge marked as repeats of it. */
export const StartMenuViewpointSchema = StartListViewpointSchema.extend({
  repeat_ids: z.array(ListViewpointIdSchema).max(8)
}).strict();
export type StartMenuViewpoint = z.infer<typeof StartMenuViewpointSchema>;

export const StartMenuPathSchema = z.object({
  path_ref: MenuPathRefSchema,
  title: words(L.titleMaxChars),
  question: words(L.questionMaxChars),
  /** The merge's group whole, whatever its size (Task 92a: the owner's merge words set none), up to every viewpoint of the menu. */
  viewpoint_ids: z.array(ViewpointIdSchema).min(1).max(L.pathMembersMax),
  /** "put together by us · Split": the merge pre-combined these viewpoints. */
  put_together: z.boolean(),
  /** Merged in after the first menu ("new"). */
  is_new: z.boolean()
}).strict();
export type StartMenuPath = z.infer<typeof StartMenuPathSchema>;

/** "Another way to see it": a sentence saying what kind of surprise it is, and a path that would look into it. */
export const StartCardSchema = z.object({
  card_id: z.string().regex(CARD_ID_PATTERN),
  kind: z.enum(START_CARD_KINDS),
  sentence: words(L.cardSentenceMaxChars),
  new_path: z.object({ title: words(L.titleMaxChars), question: words(L.questionMaxChars) }).strict(),
  fits_path_ref: MenuPathRefSchema.nullable(),
  as_question: words(L.questionMaxChars).nullable()
}).strict();
export type StartCard = z.infer<typeof StartCardSchema>;

export const StartSuggestionSchema = z.discriminatedUnion("kind", [
  z.object({ suggestion_id: z.string().regex(SUGGESTION_ID_PATTERN), kind: z.literal("COMBINE"),
    path_refs: z.tuple([MenuPathRefSchema, MenuPathRefSchema]), reason: words(L.suggestionReasonMaxChars) }).strict(),
  z.object({ suggestion_id: z.string().regex(SUGGESTION_ID_PATTERN), kind: z.literal("FITS"),
    path_ref: MenuPathRefSchema, into_path_ref: MenuPathRefSchema }).strict()
]);
export type StartSuggestion = z.infer<typeof StartSuggestionSchema>;

/**
 * The menu: every viewpoint of every merged list exactly once, shown in exactly one path or kept (its words) as a
 * repeat of a shown one, so every list is sealed whole; at most 54 in all.
 */
export const StartMenuSchema = z.object({
  menu_id: z.string().regex(MENU_ID_PATTERN),
  revision: z.number().int().min(1).max(L.menuRevisionsMax),
  language: NamedLanguageSchema,
  angles: z.array(StartAngleSchema).min(1).max(L.anglesMax),
  viewpoints: z.array(StartMenuViewpointSchema).min(1).max(L.viewpointsMax),
  repeats: z.array(StartListViewpointSchema).max(L.viewpointsMax - 1),
  paths: z.array(StartMenuPathSchema).min(1).max(L.menuPathsMax),
  cards: z.array(StartCardSchema).max(L.cardsMax),
  suggestions: z.array(StartSuggestionSchema).max(L.suggestionsMax)
}).strict().superRefine((menu, ctx) => {
  const issue = (path: (string | number)[], message: string) => { ctx.addIssue({ code: "custom", path, message }); };
  const shown = menu.viewpoints.map((one) => one.viewpoint_id);
  const shownSet = new Set(shown);
  if (shownSet.size !== shown.length) issue(["viewpoints"], "viewpoint ids are unique");
  const repeats = menu.repeats.map((one) => one.viewpoint_id);
  const repeatSet = new Set(repeats);
  if (repeatSet.size !== repeats.length) issue(["repeats"], "repeat ids are unique");
  if (repeats.some((id) => shownSet.has(id))) issue(["repeats"], "a repeat is never shown");
  if (shown.length + repeats.length > L.viewpointsMax) issue(["repeats"], `at most ${L.viewpointsMax} viewpoints in all`);
  const named = menu.viewpoints.flatMap((one) => one.repeat_ids);
  if (new Set(named).size !== named.length) issue(["viewpoints"], "each repeat is named by one viewpoint");
  if (named.some((id) => !repeatSet.has(id))) issue(["viewpoints"], "every repeat id names a repeats entry");
  if (repeats.some((id) => !named.includes(id))) issue(["repeats"], "every repeats entry is named by a viewpoint");
  const angles = new Set(menu.angles.map((angle) => angle.angle_id));
  if (angles.size !== menu.angles.length) issue(["angles"], "angle ids are unique");
  [...menu.viewpoints, ...menu.repeats].forEach((one) => {
    if (!angles.has(one.angle_id)) issue(["viewpoints"], `${one.viewpoint_id}'s angle is one of the menu's`);
  });
  const placed = menu.paths.flatMap((path) => path.viewpoint_ids);
  if (new Set(placed).size !== placed.length) issue(["paths"], "each viewpoint is in exactly one path");
  if (placed.some((id) => !shownSet.has(id))) issue(["paths"], "a path holds shown viewpoints only");
  if (shown.some((id) => !placed.includes(id))) issue(["paths"], "every shown viewpoint is in a path");
  menu.paths.forEach((path, index) => {
    if (path.put_together !== path.viewpoint_ids.length > 1) issue(["paths", index, "put_together"], "put together means more than one viewpoint");
  });
  const refs = new Set(menu.paths.map((path) => path.path_ref));
  if (refs.size !== menu.paths.length) issue(["paths"], "path refs are unique");
  const cards = menu.cards.map((card) => card.card_id);
  if (new Set(cards).size !== cards.length) issue(["cards"], "card ids are unique");
  menu.cards.forEach((card, index) => {
    if (card.fits_path_ref !== null && !refs.has(card.fits_path_ref)) issue(["cards", index, "fits_path_ref"], "a card fits a menu path");
  });
  const suggestions = menu.suggestions.map((one) => one.suggestion_id);
  if (new Set(suggestions).size !== suggestions.length) issue(["suggestions"], "suggestion ids are unique");
  menu.suggestions.forEach((one, index) => {
    const pair = one.kind === "COMBINE" ? one.path_refs : [one.path_ref, one.into_path_ref] as const;
    if (!pair.every((path) => refs.has(path))) issue(["suggestions", index], "a suggestion names menu paths");
    if (pair[0] === pair[1]) issue(["suggestions", index], "a suggestion names two different paths");
  });
});
export type StartMenu = z.infer<typeof StartMenuSchema>;
export const SignedStartMenuSchema = z.object({ menu: StartMenuSchema, ref: StartRefSchema }).strict();
export type SignedStartMenu = z.infer<typeof SignedStartMenuSchema>;

/** The list numbers a menu already holds (shown viewpoints and repeats; a card's own path is no list's). */
export function startListNosOfMenu(menu: StartMenu): readonly number[] {
  const numbers = new Set<number>();
  for (const one of [...menu.viewpoints, ...menu.repeats]) {
    if (one.viewpoint_id.startsWith("pt")) numbers.add(Number(one.viewpoint_id[2]));
  }
  return Object.freeze([...numbers].sort((a, b) => a - b));
}

/** POST of the lists stream: the three ask members the language step reads, plus the person's reading level. */
export const StartListsRequestSchema = z.object({
  question_line: z.string().trim().min(1),
  site_language: SiteLanguageSchema.optional(),
  reading_level: AccountReadingLevelSchema,
  question_language_choice: QuestionLanguageChoiceSchema.optional()
}).strict();
export type StartListsRequest = z.infer<typeof StartListsRequestSchema>;

const NoneReasonSchema = z.enum(START_STEP_NONE_REASONS);
const event = <Name extends string, Data extends z.ZodTypeAny>(name: Name, data: Data) =>
  z.object({ event: z.literal(name), data }).strict();
/** The lists stream's events, each as its SSE name and its data. */
export const StartListsEventSchema = z.discriminatedUnion("event", [
  event("check", z.object({ check_ref: StartRefSchema, language: NamedLanguageSchema, seats: z.number().int().min(1).max(L.listsMax) }).strict()),
  event("language_offer", z.object({ offer: QuestionLanguageOfferSchema }).strict()),
  event("refused", z.object({ status: z.literal(422), body: z.record(z.string(), z.unknown()) }).strict()),
  event("progress", z.object({ answered: z.number().int().min(0).max(L.listsMax), of: z.number().int().min(1).max(L.listsMax) }).strict()),
  event("list", z.object({ list: SignedStartListSchema }).strict()),
  event("cut", z.object({ lists_in: z.number().int().min(0).max(L.listsMax) }).strict()),
  event("late_list", z.object({ list: SignedStartListSchema }).strict()),
  event("none", z.object({ reason: NoneReasonSchema }).strict()),
  event("end", z.object({ reason: z.enum(START_LISTS_END_REASONS) }).strict())
]);
export type StartListsEvent = z.infer<typeof StartListsEventSchema>;

/** POST of the merge: the signed lists, what the person has answered so far, and (a late merge) the menu so far. */
export const StartMergeRequestSchema = z.object({
  question_line: z.string().trim().min(1),
  check_ref: StartRefSchema,
  reading_level: AccountReadingLevelSchema,
  lists: z.array(SignedStartListSchema).min(1).max(L.listsMax),
  clarify: z.object({
    // Task 76d (owner answer Q4): the same room as PurposeLinesSchema.answers, the care question's answer included (a widening only).
    answers: z.array(PurposeAnswerSchema).max(WEB_CONTRACT_LIMITS.clarifyQuestionsMax + 2).optional(),
    matters: z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.purposeLineMaxChars).optional()
  }).strict().optional(),
  prior_menu: SignedStartMenuSchema.optional()
}).strict();
export type StartMergeRequest = z.infer<typeof StartMergeRequestSchema>;
export const StartMergeEventSchema = z.discriminatedUnion("event", [
  event("menu", z.object({ source: z.enum(["AI", "CODE"]), menu: SignedStartMenuSchema }).strict()),
  event("none", z.object({ reason: NoneReasonSchema }).strict()),
  event("end", z.object({ reason: z.enum(START_LISTS_END_REASONS) }).strict())
]);
export type StartMergeEvent = z.infer<typeof StartMergeEventSchema>;
export const StartMergeResponseSchema = z.union([
  z.object({ source: z.enum(["AI", "CODE"]), menu: SignedStartMenuSchema }).strict(),
  z.object({ source: z.literal("NONE"), reason: NoneReasonSchema }).strict()
]);
export type StartMergeResponse = z.infer<typeof StartMergeResponseSchema>;

/** One point to combine: a menu viewpoint, a dig's pick, or the person's own words. */
export const StartCombineMemberSchema = z.object({
  viewpoint_id: ViewpointIdSchema.nullable(),
  pick_no: z.number().int().min(1).max(16).nullable(),
  title: words(L.pathTitleMaxChars).nullable(),
  question: words(L.pathQuestionMaxChars)
}).strict();
export type StartCombineMember = z.infer<typeof StartCombineMemberSchema>;

/**
 * V4 start step, Task 92a (owner, 4 Nov: "of at most four" is gone from the merges): a path's members may be every viewpoint
 * one merge is given (`pathMembersMax`), but the person's own words and a dig's picks in it stay at most 4, counted together, as
 * every member counted against 4 before (`ownWordsAndPicksPerPathMax`). Own words: an own_text, or a combine member with no
 * viewpoint and no pick; picks: a pick_no.
 */
const isOwnWordsOrPick = (member: StartPathMember | StartCombineMember): boolean =>
  "own_text" in member || ("pick_no" in member && member.pick_no !== null) || ("viewpoint_id" in member && member.viewpoint_id === null);
function atMostOwnWordsAndPicks(path: Readonly<{ members: readonly (StartPathMember | StartCombineMember)[] }>, ctx: z.RefinementCtx): void {
  if (path.members.filter(isOwnWordsOrPick).length > L.ownWordsAndPicksPerPathMax) {
    ctx.addIssue({ code: "custom", path: ["members"], message: `a path holds at most ${String(L.ownWordsAndPicksPerPathMax)} own words and picks` });
  }
}

export const StartCombineRequestSchema = z.object({
  context: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("MENU"), question_line: z.string().trim().min(1), check_ref: StartRefSchema,
      menu_id: z.string().regex(MENU_ID_PATTERN) }).strict(),
    z.object({ kind: z.literal("DIG"), parent_run_id: z.uuid() }).strict()
  ]),
  reading_level: AccountReadingLevelSchema,
  members: z.array(StartCombineMemberSchema).min(2).max(L.pathMembersMax)
}).strict().superRefine(atMostOwnWordsAndPicks);
export type StartCombineRequest = z.infer<typeof StartCombineRequestSchema>;
export const StartCombineResponseSchema = z.union([
  z.object({ source: z.literal("AI"), title: words(L.pathTitleMaxChars), question: words(L.pathQuestionMaxChars), combine_ref: StartRefSchema }).strict(),
  z.object({ source: z.literal("NONE"), reason: NoneReasonSchema }).strict()
]);
export type StartCombineResponse = z.infer<typeof StartCombineResponseSchema>;

/** POST of the own-path fit: which chosen path the person's own point of view fits inside, if any. */
export const StartFitRequestSchema = z.object({
  question_line: z.string().trim().min(1),
  check_ref: StartRefSchema,
  reading_level: AccountReadingLevelSchema,
  own_text: words(L.ownTextMaxChars),
  paths: z.array(z.object({ key: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/u), title: words(L.pathTitleMaxChars),
    question: words(L.pathQuestionMaxChars) }).strict()).min(1).max(L.pathsMax)
}).strict();
export type StartFitRequest = z.infer<typeof StartFitRequestSchema>;
export const StartFitResponseSchema = z.union([
  z.object({ source: z.literal("AI"), fits_key: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/u).nullable() }).strict(),
  z.object({ source: z.literal("NONE"), reason: NoneReasonSchema }).strict()
]);
export type StartFitResponse = z.infer<typeof StartFitResponseSchema>;

/** The ask's proof that its question line is the one checked at Next. */
export const StartCheckSchema = z.object({ ref: StartRefSchema, original_question_line: OriginalQuestionLineSchema.optional() }).strict();
export type StartCheck = z.infer<typeof StartCheckSchema>;

/** One member of a chosen path: a menu viewpoint, the person's own words, or a dig's pick. */
export const StartPathMemberSchema = z.union([
  z.object({ viewpoint_id: ViewpointIdSchema }).strict(),
  z.object({ own_text: words(L.ownTextMaxChars) }).strict(),
  z.object({ pick_no: z.number().int().min(1).max(16) }).strict()
]);
export type StartPathMember = z.infer<typeof StartPathMemberSchema>;
/** A chosen path: a merged group taken whole (up to `pathMembersMax` members), at most 4 of them own words and picks (Task 92a). */
export const StartPathChoiceSchema = z.object({
  title: words(L.pathTitleMaxChars),
  question: words(L.pathQuestionMaxChars),
  members: z.array(StartPathMemberSchema).min(1).max(L.pathMembersMax),
  combine_ref: StartRefSchema.optional()
}).strict().superRefine(atMostOwnWordsAndPicks);
export type StartPathChoice = z.infer<typeof StartPathChoiceSchema>;

/** The ask's chosen paths: from the signed menu (and any late lists) or from a dig's picks; at most How wide. */
export const StartPathsSchema = z.object({
  source: z.enum(["MENU", "DIG_PICKS"]),
  menu: SignedStartMenuSchema.optional(),
  late_lists: z.array(SignedStartListSchema).max(L.lateListsMax).optional(),
  paths: z.array(StartPathChoiceSchema).min(1).max(L.pathsMax),
  width: z.number().int().min(1).max(L.pathsMax),
  chosen_by: z.enum(["PERSON", "AIS"]),
  question_swap: z.object({ card_id: z.string().regex(CARD_ID_PATTERN), original_question_line: OriginalQuestionLineSchema }).strict().optional()
}).strict().superRefine((choice, ctx) => {
  const issue = (path: (string | number)[], message: string) => { ctx.addIssue({ code: "custom", path, message }); };
  const menu = choice.source === "MENU";
  if (menu !== (choice.menu !== undefined)) issue(["menu"], "a menu source carries its menu, and only it");
  if (!menu && choice.late_lists !== undefined) issue(["late_lists"], "late lists come with a menu");
  if (!menu && choice.question_swap !== undefined) issue(["question_swap"], "a question swap comes with a menu");
  if (choice.paths.length > choice.width) issue(["paths"], "at most How wide's paths");
  const members = choice.paths.flatMap((path) => path.members);
  if (members.some((member) => "pick_no" in member) && menu) issue(["paths"], "a pick belongs to a dig's paths");
  if (members.some((member) => "viewpoint_id" in member) && !menu) issue(["paths"], "a viewpoint belongs to a menu's paths");
  if (choice.menu !== undefined && choice.question_swap !== undefined
    && !choice.menu.menu.cards.some((card) => card.card_id === choice.question_swap!.card_id)) {
    issue(["question_swap", "card_id"], "the swapped question is one of the menu's cards");
  }
  if (choice.menu !== undefined && choice.late_lists !== undefined) {
    const inMenu = new Set(startListNosOfMenu(choice.menu.menu));
    const late = choice.late_lists.map((one) => one.list.list_no);
    if (new Set(late).size !== late.length) issue(["late_lists"], "late lists are distinct");
    if (late.some((no) => inMenu.has(no))) issue(["late_lists"], "a late list is not already in the menu");
    if (inMenu.size + late.length > L.listsMax) issue(["late_lists"], `at most ${L.listsMax} lists in all`);
  }
});
export type StartPaths = z.infer<typeof StartPathsSchema>;
