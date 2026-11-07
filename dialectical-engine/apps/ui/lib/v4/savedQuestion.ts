import { SAVED_QUESTION_LIMITS, savedQuestionPartBytes, type SavedQuestionDoc } from "@debateai/contract";
import { pathPlanChanged, type PathPlan, type PathPlanSnapshot } from "./pathPlan.js";
import { startKeptOf, type V4StartKept, type V4StartReading } from "./startKept.js";

/*
 * V4 start step, Task 76f (saved-questions spec 2026-11-04 §3.2, §3.3, §3.14; owner answers S1 A and S3 A): step 2 as the
 * account keeps it, in plain data. The reading half is what the server signed for this reading (Task 76e's V4StartReading),
 * and the server checks it at every save; the page half is the page's own state, stored as sent. Pick up and a reload read it
 * back into Task 76e's kept step 2, so there is one restore. Nothing here fetches, stores or keeps anything.
 */

/** A change is saved about this long after the last one (an answer, typing, a plan action, How wide, the mode, the carry-on tick). */
export const SAVE_PAUSE_MS = 1_000;

type SavedPage = SavedQuestionDoc["page"];

/**
 * The document the account keeps: the reading the server signed (the line the check read, its level, the check, the check
 * event's language and seats when known, the clarifying questions as shown, the menu, the lists the menu does not hold, how
 * the reading ended) and the page's own state (the box, the answers, the plan with its Undo steps, How wide, the mode and the
 * carry-on tick). The oldest Undo steps go first when the page's half would not fit (withUndoTrimmed); when it does not fit
 * even with none, every step goes and the save itself finds the document too large.
 */
export function savedDocOf(input: Readonly<{ kept: V4StartKept; reading: V4StartReading }>): SavedQuestionDoc {
  const { kept, reading } = input;
  const rest = {
    box: { text: kept.box.text, placed: kept.box.placed.map((placed) => ({ ...placed })) },
    sent_goal: { answers: kept.sentGoal.answers.map((answer) => ({ ...answer })), matters: kept.sentGoal.matters },
    width: kept.width,
    mode: kept.mode,
    carry_on: kept.carryOn
  };
  const plan = withUndoTrimmed(kept.plan, SAVED_QUESTION_LIMITS.pageMaxBytes, rest) ?? { ...kept.plan, undo: [] };
  return {
    v: 1,
    reading: {
      read_line: reading.checkedLine,
      reading_level: reading.readingLevel,
      check: { ...reading.check },
      ...(reading.language === null ? {} : { language: reading.language }),
      ...(reading.seats === null ? {} : { seats: reading.seats }),
      clarify: kept.clarify,
      menu: reading.menu,
      late_lists: [...reading.lateLists],
      end: reading.end,
      ...(reading.noneReason === undefined ? {} : { none_reason: reading.noneReason })
    },
    // The plan is the page's own data, kept whole (its keys, tags and Undo steps); the schema reads only the parts it names.
    page: { ...rest, plan: plan as unknown as SavedPage["plan"] }
  };
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null;
}

/**
 * The kept step 2 a saved document holds, for the page's restore (Task 76e's); null for a document the page cannot read
 * (another `v`, a missing half or member: the page then shows step 1 with its title). The lists the menu does not hold come
 * back as the late lists, which go with Start unmerged.
 */
export function keptOfSaved(doc: SavedQuestionDoc): V4StartKept | null {
  const held = recordOf(doc);
  if (held === null || held.v !== 1) return null;
  const reading = recordOf(held.reading);
  const page = recordOf(held.page);
  const goal = recordOf(page?.sent_goal);
  if (reading === null || page === null || goal === null) return null;
  return startKeptOf({
    v: 1,
    readLine: reading.read_line,
    box: page.box,
    sentGoal: { answers: goal.answers, matters: typeof goal.matters === "string" ? goal.matters : "" },
    clarify: reading.clarify,
    check: reading.check,
    menu: reading.menu,
    lists: [],
    lateLists: reading.late_lists,
    end: reading.end,
    ...(reading.none_reason === undefined ? {} : { noneReason: reading.none_reason }),
    plan: page.plan,
    width: page.width,
    mode: page.mode,
    carryOn: page.carry_on
  });
}

/**
 * The plan with as many of its newest Undo steps as let the page's half (`rest`, the page without the plan, with this plan) fit
 * in `pageMaxBytes`: the oldest go first. When that would take every CHANGE step, the newest CHANGE step stays alone (so the
 * plan still reads as changed: "Just answer it" stays hidden and the leave rule holds); when even that does not fit, every
 * Undo step goes. The same plan when it fits as it is; null when the page's half does not fit with no Undo step at all (that
 * change is not sent, and the next one tries again).
 */
export function withUndoTrimmed(plan: PathPlan, pageMaxBytes: number, rest: unknown): PathPlan | null {
  const base = recordOf(rest) ?? {};
  const fits = (undo: readonly PathPlanSnapshot[]): boolean =>
    savedQuestionPartBytes({ ...base, plan: { ...plan, undo } }) <= pageMaxBytes;
  if (fits(plan.undo)) return plan;
  const changed = pathPlanChanged(plan);
  for (let from = 1; from < plan.undo.length; from += 1) {
    const kept = plan.undo.slice(from);
    if (changed && !kept.some((step) => step.kind === "CHANGE")) break;
    if (fits(kept)) return { ...plan, undo: kept };
  }
  const newest = changed ? [...plan.undo].reverse().find((step) => step.kind === "CHANGE") : undefined;
  if (newest !== undefined && fits([newest])) return { ...plan, undo: [newest] };
  return fits([]) ? { ...plan, undo: [] } : null;
}
