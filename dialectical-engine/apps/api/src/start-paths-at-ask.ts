import { createHash } from "node:crypto";
import {
  START_PATHS_INVALID, START_PATHS_NARROWED, START_PATHS_STALE, START_PATHS_TOO_MANY, START_STEP_LIMITS, pathIdOf, purposeLinesUnsaid,
  type AskRequest, type DigPick, type PurposeLines, type StartMenu, type StartPathAuthor, type StartPathChoice, type StartPathMember,
  type StartPaths
} from "@debateai/contract";
import type { StartPathsStore, StoredPathViewpoint, StoredStartMenu, StoredStartPath, StoredStartPathSet } from "@debateai/db";
import { TypedDomainError, joinedPathWords } from "@debateai/kernel";
import {
  isShapeReceiptV2, type DebateShapePlanKey, type DebateShapePolicy, type DebateShapeWidths, type EngineVersionPolicy, type PlanId
} from "@debateai/register";
import type { Pool } from "pg";
import { askStartShapeOf, startStepWidthsFor, type AskStartShape } from "./debate-shape-ask.js";
import type { DigPickAuthor } from "./dig-admission.js";
import { questionWithPurposeLines, readPurposeLinesOf, recordPurposeLinesAtAsk, type PurposeLinesPort } from "./purpose-lines.js";
import type { QuestionLanguageLock } from "./question-language/decider.js";
import {
  startMembersHash, startRefQuestionOf, startRefVersionOf, verifyStartCheck, verifyStartCombine, verifyStartList, verifyStartMenu,
  type StartCombineContext, type StartRefBinding, type StartRefCheck, type StartStepKey
} from "./start-step/signing.js";
import type { StartStepBinding } from "./start-step/step.js";

/**
 * V4 start step, Tasks 33 and 35 (spec 2026-11-03 §4.2) — THE CHOSEN PATHS AT START. `POST /v1/asks` checks the paths
 * signed at Next (Task 33's verifier) and hands them to `submit` (Task 36's route) bound to the plan and the settings
 * version they were signed for. `submit` decides the ask's start (`startOfAsk`), admits it with shape receipt v2 when the
 * panel allows (Task 34), and, as a setup step before the debate's first job (START_PATHS), seals the chosen set under
 * the run's own key and records the purpose lines (`sealStartPathsAtSetup`). A debate admitted without receipt v2 keeps
 * today's ask, byte for byte.
 */

/**
 * The paths a person chose, as the verifier read them from the signed menu or a dig's picks (Task 33). `questionEdited`:
 * the line sent is not the line the AIs read at Next (read-d2), so the whole line is checked once at Start (Task 36).
 */
export type VerifiedStartPaths = Readonly<{ source: "MENU" | "DIG_PICKS"; width: number; chosenBy: "PERSON" | "AIS"; carryOnToReport: boolean;
  questionSwap: Readonly<{ originalQuestionLine: string }> | null; paths: readonly StoredStartPath[]; menu: StoredStartMenu | null; ownWords: readonly string[];
  questionEdited: boolean }>;

/** The set a run seals, from verified paths: one to one. */
export function storedSetOf(runId: string, verified: VerifiedStartPaths): StoredStartPathSet {
  return Object.freeze({ runId, source: verified.source, width: verified.width, chosenBy: verified.chosenBy,
    carryOnToReport: verified.carryOnToReport, paths: verified.paths, menu: verified.menu });
}

/**
 * What the route hands `submit` (Task 36): the plan key and settings version the step's references were signed for, the
 * verified paths (null when the ask carried none: a lone checked question), and the question-language lock the checked
 * line carried (null: the language decider is asked, as today).
 */
export type AskStartHandOver = Readonly<{ binding: Readonly<{ planKey: DebateShapePlanKey; settingsVersion: number }>;
  verified: VerifiedStartPaths | null; lock: QuestionLanguageLock | null }>;

/**
 * An ask's start: the shape admission prices (Task 34), the verified paths (null: the run builds its own list), the
 * purpose lines the run keeps (the ask's own; null: none, or a dig's first debate's, read at the seal), whether the AIs
 * carry on to the report (never on a dig), and the dig's first debate (the person's own, null otherwise).
 */
export type AskStart = Readonly<{ shape: AskStartShape; verified: VerifiedStartPaths | null; purposeLines: PurposeLines | null;
  carryOnToReport: boolean; parentRunId: string | null }>;

const stale = (): TypedDomainError => new TypedDomainError(START_PATHS_STALE, START_PATHS_STALE);
const narrowed = (): TypedDomainError => new TypedDomainError(START_PATHS_NARROWED, START_PATHS_NARROWED);

/**
 * V4 start step, Task 35b (owner answer Q8, 4 Nov): whether `paths` chosen paths fit a version's widths for the plan: at
 * most its widest option, and on Free at most 3 (the cap in code, whatever the row says). The width the person chose
 * need not be among the options.
 */
export function startPathsFit(widths: DebateShapeWidths, plan: DebateShapePlanKey, paths: number): boolean {
  return paths <= Math.max(...widths.options) && (plan !== "free" || paths <= START_STEP_LIMITS.freePathsMax);
}

/*
 * V4 start step, Task 33 (spec 2026-11-03 §4.2; read-d2, choose-d2; owner answer Q8 of 4 Nov) — THE PATHS SIGNED AT NEXT,
 * READ BACK AT START. The reading is the check's (or, without a check, the menu's): the question hash and the settings
 * version its reference carries (startRefQuestionOf, startRefVersionOf). Every reference (the check, the menu, each late
 * list) verifies its owner, plan and signature through StartRefCheck; the question is compared only while the line sent is
 * the one read (under a swap: the swap's original), and the version never (no expiry, no version compare: answer Q8). Each
 * menu and late list must still be of the reading (its question and version are the check's), else STALE. A question
 * changed on step 2 is never STALE, nor is a site update. No reference string is ever a key: two strings that differ only
 * in a signature's ignored last bits verify alike, so a reference is only ever opened and checked.
 */

/** The dig an ask digs, with its picks and who wrote each (`digPickAuthorOf`), as the route read them. */
export type StartDig = Readonly<{ parentRunId: string; picks: readonly DigPick[]; pickAuthors: readonly DigPickAuthor[] }>;
/** The reading the references belong to, and the line each is compared with (null: the line changed, not compared). */
type Reading = Readonly<{ question: string; version: number; compareLine: string | null }>;

const invalid = (): TypedDomainError => new TypedDomainError(START_PATHS_INVALID, START_PATHS_INVALID);
const tooMany = (): TypedDomainError => new TypedDomainError(START_PATHS_TOO_MANY, START_PATHS_TOO_MANY);
/** The question hash a check, list or menu reference carries (its `q`): sha256 of the trimmed line, as signing.ts writes it. */
const questionHashOf = (line: string): string => createHash("sha256").update(line.trim(), "utf8").digest("hex");
const once = (words: readonly string[]): readonly string[] => Object.freeze([...new Set(words)]);
const isOwn = (member: StoredPathViewpoint): boolean => member.viewpointId === null && member.pickNo === null;

/**
 * The reading of `readRef` (a reference this key signed; anything else is INVALID). Under a swap the swap's original
 * must be the line read, else STALE; the references are then compared with it. Otherwise they are compared with the
 * line sent while it is the line read, and not compared once it changed.
 */
function readingOf(key: StartStepKey, readRef: string, sentLine: string,
  swap: Readonly<{ original_question_line: string }> | undefined): Reading {
  const question = startRefQuestionOf(key, readRef);
  const version = startRefVersionOf(key, readRef);
  if (question === null || version === null) throw invalid();
  if (swap !== undefined && questionHashOf(swap.original_question_line) !== question) throw stale();
  const compareLine = swap !== undefined ? swap.original_question_line : questionHashOf(sentLine) === question ? sentLine : null;
  return Object.freeze({ question, version, compareLine });
}

/** A menu or list of another reading (its question or version is not the check's) is STALE. */
function assertOfReading(key: StartStepKey, ref: string, reading: Reading): void {
  if (startRefQuestionOf(key, ref) !== reading.question || startRefVersionOf(key, ref) !== reading.version) throw stale();
}

/** The question of the card whose question the person made theirs; INVALID when the menu has no such card. */
function swapQuestionOf(menu: StartMenu, cardId: string): string {
  const card = menu.cards.find((one) => one.card_id === cardId);
  if (card === undefined || card.as_question === null) throw invalid();
  return card.as_question;
}

/** read-d2: the line sent is not the line read at Next and, under a swap, not the card's question as written. */
function editedOf(sentLine: string, reading: Reading, swapQuestion: string | null): boolean {
  return questionHashOf(sentLine) !== reading.question && (swapQuestion === null || sentLine.trim() !== swapQuestion.trim());
}

const checkOf = (ownerScope: string, planKey: DebateShapePlanKey, reading: Reading): StartRefCheck =>
  Object.freeze({ ownerScope, planKey, questionLine: reading.compareLine, settingsVersion: null });

/**
 * The check at Next, read at Start: its language lock and whether the line was edited on step 2; null without a check,
 * or when the check (or, under a swap, its menu) is refused for any START_PATHS_* reason, so a refused check is ignored
 * and the whole line is checked as today. `now` is not read: nothing expires (answer Q8).
 */
export function verifyStartCheckAtAsk(input: Readonly<{ key: StartStepKey; binding: Omit<StartRefBinding, "questionLine">; ask: AskRequest;
  now: Date }>): Readonly<{ lock: QuestionLanguageLock; questionEdited: boolean }> | null {
  const { key, binding, ask } = input;
  const check = ask.start_check;
  if (check === undefined) return null;
  try {
    const swap = ask.start_paths?.question_swap;
    const reading = readingOf(key, check.ref, ask.question_line, swap);
    const compared = checkOf(binding.ownerScope, binding.planKey, reading);
    const lock = verifyStartCheck(key, { ...compared, ref: check.ref, originalQuestionLine: check.original_question_line ?? null });
    let swapQuestion: string | null = null;
    if (swap !== undefined) {
      const signed = ask.start_paths?.menu;
      if (signed === undefined) throw invalid();
      const menu = verifyStartMenu(key, { ...compared, signed });
      assertOfReading(key, signed.ref, reading);
      swapQuestion = swapQuestionOf(menu, swap.card_id);
    }
    return Object.freeze({ lock, questionEdited: editedOf(ask.question_line, reading, swapQuestion) });
  } catch (error) {
    if (error instanceof TypedDomainError && error.code.startsWith("START_PATHS_")) return null;
    throw error;
  }
}

/**
 * A dig pick's path title: its first line, trimmed; over 120 characters (UTF-16 code units), cut at the last space at or
 * before the 119th, else hard at 119 (never inside a surrogate pair), then "…".
 */
export function digPathTitleOf(text: string): string {
  const max = START_STEP_LIMITS.pathTitleMaxChars;
  const line = (text.trim().split(/\r\n|\r|\n/u)[0] ?? "").trim();
  if (line.length <= max) return line;
  const space = line.lastIndexOf(" ", max - 1);
  let kept = space > 0 ? line.slice(0, space).trimEnd() : line.slice(0, max - 1);
  const last = kept.charCodeAt(kept.length - 1);
  if (space <= 0 && last >= 0xd800 && last <= 0xdbff) kept = kept.slice(0, -1);
  return `${kept}…`;
}

const ownMember = (text: string): StoredPathViewpoint =>
  Object.freeze({ viewpointId: null, pickNo: null, title: null, question: text.trim(), own: true });

/** A menu path's member: a shown viewpoint (its words), a card (its new path's words) or the person's own words. */
function menuMemberOf(member: StartPathMember, menu: StartMenu): StoredPathViewpoint {
  if ("own_text" in member) return ownMember(member.own_text);
  if (!("viewpoint_id" in member)) throw invalid();
  const shown = menu.viewpoints.find((one) => one.viewpoint_id === member.viewpoint_id);
  if (shown !== undefined) {
    return Object.freeze({ viewpointId: shown.viewpoint_id, pickNo: null, title: shown.title, question: shown.question, own: false });
  }
  const card = menu.cards.find((one) => one.card_id === member.viewpoint_id);
  if (card === undefined) throw invalid();
  return Object.freeze({ viewpointId: card.card_id, pickNo: null, title: card.new_path.title, question: card.new_path.question, own: false });
}

/** A dig path's member: pick 1..n (its text, the person's unless an AI suggestion as written) or the person's own words. */
function digMemberOf(member: StartPathMember, dig: StartDig): StoredPathViewpoint {
  if ("own_text" in member) return ownMember(member.own_text);
  if (!("pick_no" in member)) throw invalid();
  return pickMemberOf(member.pick_no, dig);
}

function pickMemberOf(pickNo: number, dig: StartDig): StoredPathViewpoint {
  const pick = Number.isSafeInteger(pickNo) && pickNo >= 1 ? dig.picks[pickNo - 1] : undefined;
  if (pick === undefined) throw invalid();
  return Object.freeze({ viewpointId: null, pickNo, title: null, question: pick.text, own: dig.pickAuthors[pickNo - 1] !== "AI_SUGGESTION" });
}

/** What makes two members the same member: the viewpoint or card, the pick, or the own words. Never a reference string. */
const memberKeyOf = (member: StoredPathViewpoint): string =>
  member.viewpointId !== null ? `v:${member.viewpointId}` : member.pickNo !== null ? `p:${member.pickNo}` : `o:${member.question}`;

/** The combine_ref of a path verifies over its context, its resolved members' hash and its own words; a failing one is no refusal. */
function combinedByAi(key: StartStepKey, ownerScope: string, context: StartCombineContext, path: StartPathChoice,
  members: readonly StoredPathViewpoint[]): boolean {
  if (path.combine_ref === undefined) return false;
  const membersHash = startMembersHash(members.map((member) =>
    ({ viewpoint_id: member.viewpointId, pick_no: member.pickNo, title: member.title, question: member.question })));
  try {
    verifyStartCombine(key, { ownerScope, context, membersHash, title: path.title, question: path.question, ref: path.combine_ref });
    return true;
  } catch (error) {
    if (error instanceof TypedDomainError) return false;
    throw error;
  }
}

const sameWords = (path: StartPathChoice, title: string, question: string): boolean =>
  path.title.trim() === title.trim() && path.question.trim() === question.trim();

/**
 * Task 33b (spec §7; the coordinator's ruling of 5 Nov on Task 63's review): two or more of the menu's viewpoints or cards
 * under the words the page joins for them when no AI wrote one question (`joinedPathWords`: the combine failed, or Start
 * came while it was being written). The join is of the signed menu's own texts, in the members' order, never of words the
 * client sent, so a client's join of other texts, or with the person's own words in it, stays the person's.
 */
function codeJoined(path: StartPathChoice, members: readonly StoredPathViewpoint[]): boolean {
  const texts = members.flatMap((member) =>
    member.viewpointId !== null && member.title !== null ? [{ title: member.title, question: member.question }] : []);
  if (members.length < 2 || texts.length !== members.length) return false;
  const joined = joinedPathWords(texts);
  return sameWords(path, joined.title, joined.question);
}

/**
 * Who wrote a path, first match: one own text is the person's own view; a verifying combine_ref is the AI's combined
 * question; on a menu, a menu path's viewpoints (any order) under its words, or one card or one viewpoint under its own
 * words, is the AI's suggestion, and the menu's viewpoints and cards under their code-joined words are the AI's combined
 * question (Task 33b); on a dig, one pick under its text is the pick's author; anything else is the person's edit.
 */
function authorOf(path: StartPathChoice, members: readonly StoredPathViewpoint[], combined: () => boolean,
  from: Readonly<{ menu: StartMenu } | { dig: StartDig }>): StartPathAuthor {
  const only = members.length === 1 ? members[0]! : null;
  if (only !== null && isOwn(only)) return "PERSON_OWN_VIEW";
  if (combined()) return "AI_COMBINED";
  if ("menu" in from) {
    const ids = new Set(members.map((member) => member.viewpointId));
    if (!ids.has(null) && from.menu.paths.some((one) => one.viewpoint_ids.length === ids.size
      && one.viewpoint_ids.every((id) => ids.has(id)) && sameWords(path, one.title, one.question))) return "AI_SUGGESTION";
    if (only !== null && only.viewpointId !== null && only.title !== null && sameWords(path, only.title, only.question)) return "AI_SUGGESTION";
    if (codeJoined(path, members)) return "AI_COMBINED";
    return "PERSON_EDITED";
  }
  if (only !== null && only.pickNo !== null && path.question.trim() === only.question.trim()) return from.dig.pickAuthors[only.pickNo - 1]!;
  return "PERSON_EDITED";
}

/** A stored path: the person's paths give their title, question and own texts as their words; the AIs' only the own texts. */
function storedPathOf(index: number, author: StartPathAuthor, title: string, question: string,
  viewpoints: readonly StoredPathViewpoint[]): StoredStartPath {
  const ownTexts = viewpoints.filter(isOwn).map((member) => member.question);
  const ownWords = author === "PERSON_EDITED" || author === "PERSON_OWN_VIEW" ? [title, question, ...ownTexts] : ownTexts;
  return Object.freeze({ pathId: pathIdOf(index + 1), pathNo: index + 1, author, title, question, viewpoints: Object.freeze([...viewpoints]),
    ownWords: once(ownWords) });
}

/** The set's own words: every path's, then the dig's picks the person wrote, each once. */
function setOwnWordsOf(paths: readonly StoredStartPath[], dig: StartDig | null): readonly string[] {
  const picks = dig === null ? [] : dig.picks.filter((_pick, index) => dig.pickAuthors[index] !== "AI_SUGGESTION").map((pick) => pick.text);
  return once([...paths.flatMap((path) => path.ownWords), ...picks]);
}

/**
 * How wide, in order. DIG_PICKS: the width is the number of paths, which fits the active version (at most its widest,
 * Free 3). MENU, the same version: the width is one the plan offers, the paths at most the width, Free at most 3. MENU,
 * the version moved since Next (answer Q8): the width need not be offered any more, but the paths must fit the active
 * version (START_PATHS_NARROWED: the page asks to combine or remove) and still be at most the width the person chose.
 */
function checkWidth(chosen: StartPaths, widths: DebateShapeWidths, plan: DebateShapePlanKey, versionMoved: boolean): void {
  const count = chosen.paths.length;
  if (chosen.source === "DIG_PICKS") {
    if (chosen.width !== count || !startPathsFit(widths, plan, count)) throw tooMany();
    return;
  }
  if (versionMoved) {
    if (!startPathsFit(widths, plan, count)) throw narrowed();
    if (count > chosen.width) throw tooMany();
    return;
  }
  if (!widths.options.includes(chosen.width) || count > chosen.width || (plan === "free" && count > START_STEP_LIMITS.freePathsMax)) {
    throw tooMany();
  }
}

/** A dig with picks and no start_paths (an old page): one path per pick, in pick order, How wide = the picks. */
function pathsOfPicks(widths: DebateShapeWidths, plan: DebateShapePlanKey, dig: StartDig | null): VerifiedStartPaths {
  if (dig === null || dig.picks.length === 0) throw new TypeError("START_PATHS_NOT_GIVEN");
  if (!startPathsFit(widths, plan, dig.picks.length)) throw tooMany();
  const paths = Object.freeze(dig.picks.map((pick, index) =>
    storedPathOf(index, dig.pickAuthors[index]!, digPathTitleOf(pick.text), pick.text, [pickMemberOf(index + 1, dig)])));
  return Object.freeze({ source: "DIG_PICKS" as const, width: paths.length, chosenBy: "PERSON" as const, carryOnToReport: false,
    questionSwap: null, paths, menu: null, ownWords: setOwnWordsOf(paths, dig), questionEdited: false });
}

/**
 * The paths an ask carries, verified (Task 33): from the signed menu (and its late lists), from a dig's picks, or one
 * path per pick for a dig that sends none. Refusals, each a TypedDomainError whose message is its code, in order:
 * source and dig that do not go together, INVALID; How wide (`checkWidth`), TOO_MANY or NARROWED; the check, the menu
 * and each late list, INVALID or STALE; a swap card not in the menu, a member that does not resolve or is given twice,
 * and a set chosen by the AIs with a path that is not their suggestion, INVALID. The width sealed is the person's.
 * `now` is not read: nothing expires (answer Q8). A dig never carries on to the report (Task 56).
 */
export function verifyStartPathsAtAsk(input: Readonly<{ key: StartStepKey; ownerScope: string; ask: AskRequest; planKey: DebateShapePlanKey;
  settingsVersion: number; widths: DebateShapeWidths; dig: StartDig | null; now: Date }>): VerifiedStartPaths {
  const { key, ownerScope, ask, planKey, dig } = input;
  if (dig !== null && dig.pickAuthors.length !== dig.picks.length) throw new TypeError("START_DIG_PICK_AUTHORS_INVALID");
  const chosen = ask.start_paths;
  if (chosen === undefined) return pathsOfPicks(input.widths, planKey, dig);
  const signedMenu = chosen.menu;
  const swap = chosen.question_swap;
  const fromMenu = chosen.source === "MENU";
  if (fromMenu ? signedMenu === undefined || dig !== null
    : dig === null || signedMenu !== undefined || chosen.late_lists !== undefined || swap !== undefined) throw invalid();

  const check = ask.start_check;
  const readRef = check?.ref ?? signedMenu?.ref;
  const reading = readRef === undefined ? null : readingOf(key, readRef, ask.question_line, swap);
  if (check !== undefined && reading !== null) {
    verifyStartCheck(key, { ...checkOf(ownerScope, planKey, reading), ref: check.ref, originalQuestionLine: check.original_question_line ?? null });
  }
  checkWidth(chosen, input.widths, planKey, fromMenu && reading !== null && reading.version !== input.settingsVersion);

  let menu: StoredStartMenu | null = null;
  let swapQuestion: string | null = null;
  if (signedMenu !== undefined && reading !== null) {
    const compared = checkOf(ownerScope, planKey, reading);
    const shown = verifyStartMenu(key, { ...compared, signed: signedMenu });
    assertOfReading(key, signedMenu.ref, reading);
    const lateLists = (chosen.late_lists ?? []).map((signed) => {
      const list = verifyStartList(key, { ...compared, signed });
      assertOfReading(key, signed.ref, reading);
      return list;
    });
    menu = Object.freeze({ menu: shown, lateLists: Object.freeze(lateLists) });
    if (swap !== undefined) swapQuestion = swapQuestionOf(shown, swap.card_id);
  }

  const from = menu !== null ? { menu: menu.menu } : { dig: dig! };
  const resolved = chosen.paths.map((path) => path.members.map((member) =>
    "menu" in from ? menuMemberOf(member, from.menu) : digMemberOf(member, from.dig)));
  const keys = resolved.flat().map(memberKeyOf);
  if (new Set(keys).size !== keys.length) throw invalid();
  const context: StartCombineContext = "menu" in from ? { kind: "MENU", menuId: from.menu.menu_id } : { kind: "DIG", parentRunId: from.dig.parentRunId };
  const paths = Object.freeze(chosen.paths.map((path, index) => {
    const members = resolved[index]!;
    const author = authorOf(path, members, () => combinedByAi(key, ownerScope, context, path, members), from);
    return storedPathOf(index, author, path.title, path.question, members);
  }));
  if (chosen.chosen_by === "AIS" && paths.some((path) => path.author !== "AI_SUGGESTION")) throw invalid();

  return Object.freeze({ source: chosen.source, width: chosen.width, chosenBy: chosen.chosen_by,
    carryOnToReport: ask.carry_on_to_report === true && dig === null,
    questionSwap: swap === undefined ? null : Object.freeze({ originalQuestionLine: swap.original_question_line.trim() }),
    paths, menu, ownWords: setOwnWordsOf(paths, dig),
    questionEdited: reading !== null && editedOf(ask.question_line, reading, swapQuestion) });
}

/*
 * V4 start step, Task 36 (spec 2026-11-03 §4.2; read-d2, choose-d2, read-d3, ask-f2; owner answers Q8 and Q14 of 4 Nov) — POST
 * /v1/asks AT START. The route screens every word the person wrote on step 2 for a crisis first (`startTextsOfBody`), holds a Free
 * question sent without the notice (`freeNoticeMissing`), verifies the paths with the one binding Next used and hands them to `submit`
 * (`startHandOverOf`), and checks the question once, as `startQuestionCheckText` says.
 */

/** What the route reads of the active settings version (its admission view): the version's number and its rows in force. */
export type StartStepView = Readonly<{ registerVersion?: number; debateShapePolicy?: DebateShapePolicy; engineVersionPolicy?: EngineVersionPolicy;
  modelScorecardInForce: boolean }>;

/** A signed-in person's widths for `plan` on the view's version (`startStepWidthsFor`, the one v2 predicate), else null. */
export function startWidthsOfView(view: StartStepView, plan: DebateShapePlanKey): DebateShapeWidths | null {
  return startStepWidthsFor({ policy: view.debateShapePolicy ?? null, engineInForce: view.engineVersionPolicy !== undefined,
    scorecardInForce: view.modelScorecardInForce, serverPrincipal: true }, plan);
}

/**
 * Whether the start step runs on the view's version for a signed-in person. The switch is the version's: its row gives every plan
 * widths (they differ, never whether they exist), so it is on for every plan or for none, and where it is off no plan need be read.
 */
export function startStepOnInView(view: StartStepView): boolean {
  return startWidthsOfView(view, "free") !== null;
}

/** What `startHandOverOf` answers: the hand-over `submit` takes, and whether the line sent is not the one the AIs read at Next. */
export type StartHandOverAtAsk = AskStartHandOver & Readonly<{ questionEdited: boolean }>;

/**
 * The hand-over of an ask that carries start members (`start_check`, `start_paths`) or a dig's picks, else null (today's ask). In
 * order: chosen paths with no key composed are INVALID; where the step does not run (no settings version, or the switch off for the
 * plan: `widths` null) a menu is STALE (the page offers "Read it again") and anything else is ignored, so a dig is today's dig and a
 * lone check is today's whole-line check; then the paths (Task 33's verifier, refs of another settings version kept unless fewer
 * paths are allowed: answer Q8), or one path per pick for a dig that sends none, and the check's language lock (a refused lone check
 * is ignored). The binding is the one Next derives (`startStepBindingOf`), under the active version. Every refusal is a
 * TypedDomainError whose message is its code; `now` is not read (nothing expires).
 */
export function startHandOverOf(input: Readonly<{ key: StartStepKey | undefined; ownerRef: string; ask: AskRequest; binding: StartStepBinding | null;
  view: StartStepView; dig: StartDig | null; now: Date }>): StartHandOverAtAsk | null {
  const { key, ask, binding, dig, now } = input;
  const chosen = ask.start_paths;
  const digPicks = chosen === undefined && dig !== null && dig.picks.length > 0;
  if (chosen === undefined && ask.start_check === undefined && !digPicks) return null;
  if (chosen !== undefined && key === undefined) throw invalid();
  const widths = binding === null ? null : startWidthsOfView(input.view, binding.planKey);
  if (binding === null || widths === null) {
    if (chosen?.source === "MENU") throw stale();
    return null;
  }
  const { ownerScope, planKey, settingsVersion } = binding;
  let verified: VerifiedStartPaths | null = null;
  if (chosen !== undefined && key !== undefined) {
    verified = verifyStartPathsAtAsk({ key, ownerScope, ask, planKey, settingsVersion, widths, dig, now });
  } else if (digPicks && dig !== null) {
    if (dig.pickAuthors.length !== dig.picks.length) throw new TypeError("START_DIG_PICK_AUTHORS_INVALID");
    verified = pathsOfPicks(widths, planKey, dig);
  }
  const checked = key === undefined ? null : verifyStartCheckAtAsk({ key, binding, ask, now });
  if (verified === null && checked === null) return null;
  // Review (wave 5): edited when either reading says so. One path per pick has no reading of its own (its questionEdited is
  // always false), so a check sent with a dig's picks must still say whether the dig's line is the line it vouches for; else a
  // check signed for one question would let any other line past Start's question check.
  return Object.freeze({ binding: Object.freeze({ planKey, settingsVersion }), verified, lock: checked?.lock ?? null,
    questionEdited: (verified?.questionEdited ?? false) || (checked?.questionEdited ?? false) });
}

/**
 * The one text Start's question check reads (read-d2, read-d3), or null: nothing new to check. With a verified check the answers
 * count as said (the v2 page writes each into the line, `answersSaid`): on the line as checked at Next, only the lines it does not
 * say and the person's own words, one per line; on a line changed on step 2, the whole line with what it does not say, then a blank
 * line and the own words. Without one (an old or broken page, a dig), today's whole-line text, then the own words.
 */
export function startQuestionCheckText(input: Readonly<{ questionLine: string; purposeLines: PurposeLines | undefined; ownWords: readonly string[];
  startCheckVerified: boolean; questionEdited: boolean }>): string | null {
  const { questionLine, purposeLines, ownWords } = input;
  if (input.startCheckVerified && !input.questionEdited) {
    const unsaid = [...purposeLinesUnsaid(questionLine, purposeLines, { answersSaid: true }), ...ownWords];
    return unsaid.length === 0 ? null : unsaid.join("\n");
  }
  const line = input.startCheckVerified ? questionWithPurposeLines(questionLine, purposeLines, { answersSaid: true })
    : questionWithPurposeLines(questionLine, purposeLines);
  return ownWords.length === 0 ? line : `${line}\n\n${ownWords.join("\n")}`;
}

const recordOf = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null;

/**
 * What the person wrote on step 2, read from the body before it is parsed, for the crisis check that comes first: each chosen
 * path's title and question and each own text, at most How wide's 7 paths and 4 members each. A value that is not text, or longer
 * (trimmed) than the contract allows there, is not read: the parse refuses it as malformed, and a long text never holds the loop.
 */
export function startTextsOfBody(body: unknown): readonly string[] {
  const texts: string[] = [];
  const take = (value: unknown, max: number): void => {
    if (typeof value !== "string") return;
    const text = value.trim();
    if (text.length > 0 && text.length <= max) texts.push(text);
  };
  const paths = recordOf(recordOf(body)?.start_paths)?.paths;
  if (!Array.isArray(paths)) return Object.freeze(texts);
  for (const path of paths.slice(0, START_STEP_LIMITS.pathsMax)) {
    const choice = recordOf(path);
    if (choice === null) continue;
    take(choice.title, START_STEP_LIMITS.pathTitleMaxChars);
    take(choice.question, START_STEP_LIMITS.pathQuestionMaxChars);
    if (!Array.isArray(choice.members)) continue;
    // Every member the contract allows (Task 92a: a merged path may hold more than four), so no word of the person's goes unread.
    for (const member of choice.members.slice(0, START_STEP_LIMITS.pathMembersMax)) {
      take(recordOf(member)?.own_text, START_STEP_LIMITS.ownTextMaxChars);
    }
  }
  return Object.freeze(texts);
}

/**
 * The Free notice lock (ask-f2; owner answer Q14): a new question (no parent, no public parent) from a signed-in person whose decided
 * plan is Free (a plan id: a site with no plans has none; an internal grant decides premium), where the start step runs, that came
 * without the notice flag. Digs and public digs are contributions and are never held.
 */
export function freeNoticeMissing(input: Readonly<{ ask: AskRequest; signedIn: boolean; decided: Readonly<{ planTier: string; planId: PlanId | null }>;
  switchOn: boolean }>): boolean {
  const { ask, decided } = input;
  return ask.parent === undefined && ask.public_parent === undefined && input.signedIn && decided.planId !== null
    && decided.planTier === "free" && input.switchOn && ask.free_public_notice !== true;
}

/**
 * The ask's start, or null when the step does not run for it (`widths` null: `startStepWidthsFor`) and it carried no
 * paths. Paths signed for another plan, or carried to a version where the step is off, are STALE: the page offers "Read
 * it again", never a debate without the paths the person chose. Task 35b (owner answer Q8, 4 Nov): paths signed under
 * another settings version (older or, after a way back, newer) are not stale; the debate argues them as chosen, the set
 * sealed as handed over (its width kept), unless the active version allows fewer than were chosen (`startPathsFit`):
 * NARROWED, and the page asks to combine or remove down to its widest. Under the same version nothing changes. A dig
 * never carries on to the report (Task 56), whatever a client sends, so the verified set's flag follows the ask's own rule.
 */
export function startOfAsk(input: Readonly<{ widths: DebateShapeWidths | null; plan: DebateShapePlanKey; registerVersion: number;
  ask: AskRequest; handOver: AskStartHandOver | null }>): AskStart | null {
  const { widths, plan, ask, handOver } = input;
  if (handOver !== null && handOver.binding.planKey !== plan) throw stale();
  const given = handOver?.verified ?? null;
  if (widths === null) {
    if (given !== null) throw stale();
    return null;
  }
  const versionMoved = handOver !== null && handOver.binding.settingsVersion !== input.registerVersion;
  if (versionMoved && given !== null && !startPathsFit(widths, plan, given.paths.length)) throw narrowed();
  const carryOnToReport = ask.carry_on_to_report === true && ask.parent === undefined && ask.public_parent === undefined;
  const verified = given === null || given.carryOnToReport === carryOnToReport ? given : Object.freeze({ ...given, carryOnToReport });
  const shape = askStartShapeOf(widths, plan, verified);
  if (shape === null) throw new TypeError("START_SHAPE_MISSING");
  return Object.freeze({ shape, verified, purposeLines: ask.purpose_lines ?? null, carryOnToReport,
    parentRunId: ask.parent?.parent_run_id ?? null });
}

/**
 * THE START_PATHS SETUP STEP (submit, both paths, after the rotation pin and before the memory question; only on receipt
 * v2): the verified set, sealed under the run's key (a throw fails the step: RUN_SETUP_FAILED:START_PATHS; no store
 * composed: START_PATHS_STORE_UNAVAILABLE), then the purpose lines: the ask's own, or a dig's first debate's when it has
 * none, so place and time reach the dig. The lines are logged by code and never fail the run (`recordPurposeLinesAtAsk`).
 * A run that builds its own list has no set yet: its runner writes it.
 */
export async function sealStartPathsAtSetup(input: Readonly<{ runId: string; ownerRef: string; start: AskStart;
  store: StartPathsStore | undefined; purposeLines: PurposeLinesPort | undefined; pool: Pool }>): Promise<void> {
  const { runId, ownerRef, start } = input;
  if (start.verified !== null) {
    if (input.store === undefined) {
      throw new TypedDomainError("START_PATHS_STORE_UNAVAILABLE", "A debate with chosen paths needs the start paths store");
    }
    await input.store.recordStartPaths(storedSetOf(runId, start.verified));
  }
  if (input.purposeLines === undefined) return;
  const lines = start.purposeLines
    ?? (start.parentRunId === null ? null : await readPurposeLinesOf(input.pool, ownerRef, start.parentRunId));
  if (lines !== null) await recordPurposeLinesAtAsk({ ownerRef, runId, lines }, input.purposeLines);
}

/** The run's ask-contract member for the carry-on box: `{ carry_on_to_report: true }` only on receipt v2, only when asked. */
export function startAskContractMember(start: AskStart | null, envelopeBasis: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return start !== null && start.carryOnToReport && isShapeReceiptV2(envelopeBasis)
    ? Object.freeze({ carry_on_to_report: true }) : Object.freeze({});
}
