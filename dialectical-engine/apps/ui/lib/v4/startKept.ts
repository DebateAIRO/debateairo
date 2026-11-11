import {
  START_STEP_NONE_REASONS,
  type AskClarifyResponse,
  type SignedStartList,
  type SignedStartMenu,
  type StartCheck,
  type StartListsEvent,
  type StartStepNoneReason
} from "@debateai/contract";
import type { PathPlan } from "./pathPlan.js";
import type { QuestionBox } from "./questionBox.js";
import type { DigMode, ReadingLevel, V4Goal } from "./types.js";

/*
 * V4 start step, Task 76e (owner answer Q8; amended 4 Nov night by owner answer S1 A, saved-questions spec §3.5, §3.11): step 2
 * as the page keeps it, to open again exactly as it was with no AI call. Under S1 A the tab's history never holds it: the
 * account does (Task 76f saves it, and Pick up or a reload on step 2 hands it to the page's restore). Plain data only; nothing
 * here fetches, stores or keeps anything.
 */

/** How the reading had ended: the list landed, it is missing (with its reason), or the person left before either. */
export type V4StartEnd = "READY" | "NONE" | "LEFT_EARLY";

/**
 * Task 76m (saved-questions spec §3.2, "the combined questions already written"): the AI's words for one set of viewpoints put
 * together in this reading, by their members (combineMembersKey), with the combine's reference, character for character.
 */
export type V4StartWritten = Readonly<{ members: string; title: string; question: string; combineRef: string }>;

/**
 * Step 2 as kept. `readLine` is the line the check read at Next: the person's words, or after an accepted language rewrite the
 * rewrite, whose words before it are then `check.original_question_line` (as Start sends the check). `clarify`: step 2's
 * questions as shown, so they come back without a call (null: none had come). `lists`: only the signed lists the menu does not
 * hold; `lateLists`: the late lists not merged yet. `plan` holds its Undo steps; a reading with no list keeps an empty one.
 * Task 76m: `written`, the AI's combined words of the reading, oldest first, also those of a combine undone since (absent: none).
 */
export type V4StartKept = Readonly<{
  v: 1;
  readLine: string;
  box: QuestionBox;
  sentGoal: V4Goal;
  clarify: AskClarifyResponse | null;
  check: Readonly<{ ref: string; original_question_line?: string }>;
  menu: SignedStartMenu | null;
  lists: readonly SignedStartList[];
  lateLists: readonly SignedStartList[];
  end: V4StartEnd;
  noneReason?: StartStepNoneReason;
  plan: PathPlan;
  width: number;
  mode: DigMode;
  carryOn: boolean;
  written?: readonly V4StartWritten[];
}>;

/** The question's language as the lists stream's check event names it. */
export type V4StartLanguage = Extract<StartListsEvent, { event: "check" }>["data"]["language"];

/**
 * The reading the server signed, as useStartPaths holds it once the check passed (Task 76f saves it beside the page's own
 * state): the check, the menu, every signed list the menu does not hold, how it ended (with the missing list's reason), the
 * line the check read, the level the lists were read at, and the check event's language and seats (null when the reading came
 * back from a kept step 2, which holds neither).
 */
export type V4StartReading = Readonly<{
  check: StartCheck;
  menu: SignedStartMenu | null;
  lateLists: readonly SignedStartList[];
  end: V4StartEnd;
  noneReason?: StartStepNoneReason;
  checkedLine: string;
  readingLevel: ReadingLevel;
  language: V4StartLanguage | null;
  seats: number | null;
}>;

/** The person's words a kept step 2 was read for: its check's own words before an accepted rewrite, else the line read. */
export function keptLineOf(kept: V4StartKept): string {
  return kept.check.original_question_line ?? kept.readLine;
}

const ENDS: ReadonlySet<unknown> = new Set<V4StartEnd>(["READY", "NONE", "LEFT_EARLY"]);
const NONE_REASONS: ReadonlySet<unknown> = new Set<string>(START_STEP_NONE_REASONS);
const MODES: ReadonlySet<unknown> = new Set<DigMode>(["quick", "thorough"]);

function recordOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null;
}

function words(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function arrays(held: Readonly<Record<string, unknown>> | null, ...keys: readonly string[]): boolean {
  return held !== null && keys.every((key) => Array.isArray(held[key]));
}

/**
 * A kept step 2 the page can read, else null: another `v`, a missing member or a member of the wrong kind (the page then
 * behaves as Task 76c says: step 1 with the words). A list that is READY holds its menu. The members' insides (the menu, the
 * lists, the plan's paths) are the page's and the server's own shapes, checked again by the server at Start.
 */
export function startKeptOf(value: unknown): V4StartKept | null {
  const kept = recordOf(value);
  if (kept === null || kept.v !== 1 || !words(kept.readLine)) return null;
  const box = recordOf(kept.box);
  if (box === null || typeof box.text !== "string" || !Array.isArray(box.placed) || !arrays(recordOf(kept.sentGoal), "answers")) return null;
  const clarify = recordOf(kept.clarify);
  if (kept.clarify !== null && (clarify === null || (clarify.source !== "AI" && clarify.source !== "NONE"))) return null;
  const check = recordOf(kept.check);
  if (check === null || !words(check.ref) || (check.original_question_line !== undefined && !words(check.original_question_line))) return null;
  const menu = recordOf(kept.menu);
  if (kept.menu !== null && (menu === null || recordOf(menu.menu) === null)) return null;
  if (!Array.isArray(kept.lists) || !Array.isArray(kept.lateLists) || !ENDS.has(kept.end)) return null;
  if (kept.end === "READY" && kept.menu === null) return null;
  if (kept.noneReason !== undefined && !NONE_REASONS.has(kept.noneReason)) return null;
  const plan = recordOf(kept.plan);
  if (!arrays(plan, "paths", "more", "undo", "selected") || typeof plan?.width !== "number") return null;
  if (typeof kept.width !== "number" || !Number.isSafeInteger(kept.width) || kept.width < 1) return null;
  if (!MODES.has(kept.mode) || typeof kept.carryOn !== "boolean") return null;
  if (kept.written !== undefined && (!Array.isArray(kept.written) || !kept.written.every(writtenWords))) return null;
  return value as V4StartKept;
}

/** Task 76m: one entry of the AI's combined words, every member a text. */
function writtenWords(value: unknown): boolean {
  const written = recordOf(value);
  return written !== null && typeof written.members === "string" && typeof written.title === "string"
    && typeof written.question === "string" && typeof written.combineRef === "string";
}
