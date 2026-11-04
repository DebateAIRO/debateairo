import { createHash } from "node:crypto";
import {
  START_PATHS_INVALID, START_PATHS_NARROWED, START_PATHS_STALE, START_PATHS_TOO_MANY, START_STEP_LIMITS, pathIdOf, type AskRequest,
  type DigPick, type PurposeLines, type StartMenu, type StartPathAuthor, type StartPathChoice, type StartPathMember, type StartPaths
} from "@debateai/contract";
import type { StartPathsStore, StoredPathViewpoint, StoredStartMenu, StoredStartPath, StoredStartPathSet } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { isShapeReceiptV2, type DebateShapePlanKey, type DebateShapeWidths } from "@debateai/register";
import type { Pool } from "pg";
import { askStartShapeOf, type AskStartShape } from "./debate-shape-ask.js";
import type { DigPickAuthor } from "./dig-admission.js";
import { readPurposeLinesOf, recordPurposeLinesAtAsk, type PurposeLinesPort } from "./purpose-lines.js";
import type { QuestionLanguageLock } from "./question-language/decider.js";
import {
  startMembersHash, startRefQuestionOf, startRefVersionOf, verifyStartCheck, verifyStartCombine, verifyStartList, verifyStartMenu,
  type StartCombineContext, type StartRefBinding, type StartRefCheck, type StartStepKey
} from "./start-step/signing.js";

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
type DigAtStart = Readonly<{ parentRunId: string; picks: readonly DigPick[]; pickAuthors: readonly DigPickAuthor[] }>;
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
function digMemberOf(member: StartPathMember, dig: DigAtStart): StoredPathViewpoint {
  if ("own_text" in member) return ownMember(member.own_text);
  if (!("pick_no" in member)) throw invalid();
  return pickMemberOf(member.pick_no, dig);
}

function pickMemberOf(pickNo: number, dig: DigAtStart): StoredPathViewpoint {
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
 * Who wrote a path, first match: one own text is the person's own view; a verifying combine_ref is the AI's combined
 * question; on a menu, a menu path's viewpoints (any order) under its words, or one card or one viewpoint under its own
 * words, is the AI's suggestion; on a dig, one pick under its text is the pick's author; anything else is the person's edit.
 */
function authorOf(path: StartPathChoice, members: readonly StoredPathViewpoint[], combined: () => boolean,
  from: Readonly<{ menu: StartMenu } | { dig: DigAtStart }>): StartPathAuthor {
  const only = members.length === 1 ? members[0]! : null;
  if (only !== null && isOwn(only)) return "PERSON_OWN_VIEW";
  if (combined()) return "AI_COMBINED";
  if ("menu" in from) {
    const ids = new Set(members.map((member) => member.viewpointId));
    if (!ids.has(null) && from.menu.paths.some((one) => one.viewpoint_ids.length === ids.size
      && one.viewpoint_ids.every((id) => ids.has(id)) && sameWords(path, one.title, one.question))) return "AI_SUGGESTION";
    if (only !== null && only.viewpointId !== null && only.title !== null && sameWords(path, only.title, only.question)) return "AI_SUGGESTION";
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
function setOwnWordsOf(paths: readonly StoredStartPath[], dig: DigAtStart | null): readonly string[] {
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
function pathsOfPicks(widths: DebateShapeWidths, plan: DebateShapePlanKey, dig: DigAtStart | null): VerifiedStartPaths {
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
  settingsVersion: number; widths: DebateShapeWidths; dig: DigAtStart | null; now: Date }>): VerifiedStartPaths {
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
