import { mostOneRunMaySpendMicros } from "@debateai/budget";
import { exhaustive } from "@debateai/kernel";
import { costEnvelopeCeilings } from "@debateai/register";
import {
  cappedAskStrength,
  pickRoleAssignment,
  strengthsUpTo,
  type PickerInput,
  type PickerMoneyLimits,
  type PickerOutcome
} from "@debateai/scorecard";
import { isUsablePerRunCeiling, type AskModelPickerSettings, type AskMoneyPolicy } from "./ask-model-picker.js";
import type { RoomPreview, RoomWindowUse } from "./ask-room.js";

/**
 * PAID PLANS PART 3 (S2, spec §2.6; amendment A5) — THE PICKER PLANS INSIDE THE
 * ASKING PERSON'S ROOM.
 *
 * The room (B6a/B6b) alone decides WAIT: only a FULL window waits. Its unlocked
 * first look (`AskRoom.precheck`) measures the person's windows; this module
 * turns that preview into the room at the instant the debate would start, cuts
 * the picker's money limits from min(site per-run ceiling, that room at 100%)
 * and, when nothing fits the person even at the cheapest strength, starts the
 * debate on the cheapest choice the site's own ceiling allows (CLOSE): every
 * strength from ECONOMY up to the ask's (capped) strength is planned against the
 * site, and the smallest estimate that fits is kept (Part 3's final review P3-I1:
 * ECONOMY is "the best model under a cost cap", not always the cheapest plan).
 * The site's refusal keeps its meaning for the site: it is given only when no
 * strength fits the site. Pure: every read is the room's.
 */

/** What admission hands the picker about the person: their windows as the room measured them, and the instant the debate would start. */
export type PersonRoomInput = Readonly<{
  uses: ReadonlyArray<RoomWindowUse>;
  at: Date;
  /**
   * Only for a WAIT preview: the preview's own instant. The locked decision may
   * START the question after all (the person's other run finished in between),
   * so admission also plans it for NOW, and `#submitWithRoom` pins that plan on a
   * locked START — never a plan sized for a window that has not reset yet.
   */
  ifStartsNowAt?: Date;
}>;

/**
 * B6a's preview as the picker's person: none when no window was measured; a
 * START is planned for the preview's own instant, a WAIT for the earliest
 * instant its wait can end by itself (`wakePlanInstant`) and, in case the
 * locked decision starts it, for NOW too.
 */
export function personRoomOf(preview: RoomPreview): PersonRoomInput | null {
  if (preview.personUses.length === 0) return null;
  if (preview.admission.kind !== "WAIT") return Object.freeze({ uses: preview.personUses, at: preview.now });
  return Object.freeze({ uses: preview.personUses, at: wakePlanInstant(preview), ifStartsNowAt: preview.now });
}

/**
 * The instant a waiting question's wake plan is made for — never the room's
 * `waitsUntil` (the latest reset among the FULL scopes), which a wait caused by
 * holds ends long before:
 *  · PERSON: B6a's `personRecheckAt` — the latest reset among the windows full
 *    on spend, or the next whole minute when only the person's own live holds
 *    fill them (B7b's waker starts the run once it has passed). A window filled
 *    only by holds is thus planned as measured, spend plus holds: the careful
 *    side, since the wait may end before or after that window resets;
 *  · SITE (the site's day full, or only the line ahead): the preview's own
 *    instant — no person window is full, and the wait can end whenever other
 *    debates finish. Both plans are then the same one, which is harmless.
 */
function wakePlanInstant(preview: RoomPreview): Date {
  const reason = preview.waitReason;
  switch (reason.waitsFor) {
    case "PERSON":
      if (!(reason.personRecheckAt instanceof Date) || Number.isNaN(reason.personRecheckAt.getTime())) {
        throw new TypeError("PERSON_ROOM_INPUT_INVALID");
      }
      return reason.personRecheckAt;
    case "SITE":
      return preview.now;
    default:
      return exhaustive(reason);
  }
}

export type PersonRoomPick =
  | Readonly<{
    state: "ASSIGNED";
    outcome: Extract<PickerOutcome, { state: "ASSIGNED" }>;
    /** A5: nothing fitted the person's room at any strength; the debate starts on the cheapest choice the site allows, as CLOSE. */
    personRoomTight: boolean;
    /** The figure the run's hold opens with (HOSTED); null in LOCAL mode. */
    holdMicros: number | null;
  }>
  | Readonly<{ state: "REFUSED"; outcome: Extract<PickerOutcome, { state: "REFUSED" }> }>;

function wholeMicros(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** The room at 100% at `at`: the smallest (limit − used) over the windows, a window reset by `at` counting whole. null = no person scope. */
export function personRoomMicrosAt(uses: ReadonlyArray<RoomWindowUse>, at: Date): number | null {
  if (uses.length === 0) return null;
  let room = Number.MAX_SAFE_INTEGER;
  for (const use of uses) {
    if (!wholeMicros(use.limitMicros) || !wholeMicros(use.usedMicros)
      || !(use.resetsAt instanceof Date) || Number.isNaN(use.resetsAt.getTime())) {
      throw new TypeError("PERSON_ROOM_INPUT_INVALID");
    }
    const left = use.resetsAt.getTime() <= at.getTime() ? use.limitMicros : Math.max(0, use.limitMicros - use.usedMicros);
    room = Math.min(room, left);
  }
  return room;
}

/**
 * The picker's limits: the site's body share cut from min(site per-run ceiling,
 * room); the whole run held to the site's serve share, and with a person scope
 * to the room itself — spec §2.6 item 2's "at 100%": the finish edge (110 %) is
 * for running debates, never for planning one.
 */
export function pickerMoneyLimits(input: Readonly<{
  moneyPolicy: AskMoneyPolicy;
  runMaximumMicros: number;
  personRoomMicros: number | null;
}>): PickerMoneyLimits {
  const site = input.moneyPolicy.perRunCeilingMicros;
  const ceiling = input.personRoomMicros === null ? site : Math.min(site, input.personRoomMicros);
  if (ceiling === 0) {
    return Object.freeze({ bodyMicros: 0, serveMicros: 0, personRoomMicros: input.personRoomMicros, unknownEstimateMicros: input.runMaximumMicros });
  }
  const ceilings = costEnvelopeCeilings({
    perRunCeilingMicros: ceiling,
    ...(input.moneyPolicy.serveReserveBasisPoints === undefined ? {} : { serveReserveBasisPoints: input.moneyPolicy.serveReserveBasisPoints }),
    ...(input.moneyPolicy.serveOverrunBasisPoints === undefined ? {} : { serveOverrunBasisPoints: input.moneyPolicy.serveOverrunBasisPoints })
  });
  return Object.freeze({
    bodyMicros: ceilings.bodyMicros,
    serveMicros: input.personRoomMicros === null ? ceilings.serveMicros : Math.min(ceilings.serveMicros, input.personRoomMicros),
    personRoomMicros: input.personRoomMicros,
    unknownEstimateMicros: input.runMaximumMicros
  });
}

/** HOSTED: the money terms the limits are cut from, and the run maximum; null in LOCAL or without a usable ceiling. */
export function hostedMoneyOf(picker: AskModelPickerSettings): Readonly<{ moneyPolicy: AskMoneyPolicy; runMaximumMicros: number }> | null {
  if (picker.mode !== "HOSTED" || !isUsablePerRunCeiling(picker.perRunCeilingMicros)) return null;
  const moneyPolicy = picker.moneyPolicy ?? Object.freeze({ perRunCeilingMicros: picker.perRunCeilingMicros });
  return Object.freeze({ moneyPolicy, runMaximumMicros: picker.runMaximumMicros ?? mostOneRunMaySpendMicros(moneyPolicy) });
}

export function pickWithinPersonRoom(input: Readonly<{
  picker: Omit<PickerInput, "moneyLimits">;
  moneyPolicy: AskMoneyPolicy | null;
  runMaximumMicros: number | null;
  personRoomMicros: number | null;
}>): PersonRoomPick {
  const moneyPolicy = input.moneyPolicy;
  const runMaximumMicros = input.runMaximumMicros;
  if (input.picker.mode !== "HOSTED" || moneyPolicy === null || runMaximumMicros === null) {
    const outcome = pickRoleAssignment({ ...input.picker, moneyLimits: null });
    return outcome.state === "ASSIGNED"
      ? Object.freeze({ state: "ASSIGNED" as const, outcome, personRoomTight: false, holdMicros: null })
      : Object.freeze({ state: "REFUSED" as const, outcome });
  }
  const limitsFor = (personRoomMicros: number | null) => pickerMoneyLimits({ moneyPolicy, runMaximumMicros, personRoomMicros });
  const holdOf = (outcome: Extract<PickerOutcome, { state: "ASSIGNED" }>): number =>
    Math.max(1, outcome.estimate.moneyMicros ?? runMaximumMicros);
  const first = pickRoleAssignment({ ...input.picker, moneyLimits: limitsFor(input.personRoomMicros) });
  if (first.state === "ASSIGNED") {
    return Object.freeze({ state: "ASSIGNED" as const, outcome: first, personRoomTight: false, holdMicros: holdOf(first) });
  }
  if (first.reason !== "BUDGET_TOO_SMALL" || input.personRoomMicros === null) {
    return Object.freeze({ state: "REFUSED" as const, outcome: first });
  }
  // A5 (spec §2.15: "the debate starts at the cheapest choice" as CLOSE; P3-I1):
  // too small for the PERSON at every strength. Each strength from ECONOMY up to
  // the ask's capped strength is planned against the SITE's limits, and the plan
  // with the smallest estimate that fits is kept — an unknown estimate counts as
  // the run maximum, and a tie keeps the lower strength. The running wall trims the
  // arguing and the answer is always written. A plan-capped ask (Free) is planned
  // only up to its cap, so its cheapest choice is its own plan's pick.
  const capped = cappedAskStrength(input.picker);
  const site = limitsFor(null);
  let cheapest: Extract<PickerOutcome, { state: "ASSIGNED" }> | null = null;
  let siteAnswer: PickerOutcome | null = null;
  for (const strength of strengthsUpTo(capped.strength)) {
    // A plan that had to step down below `strength` is a lower strength's own plan,
    // already weighed: the strict `<` keeps that lower one.
    siteAnswer = pickRoleAssignment({ ...input.picker, strength, moneyLimits: site });
    if (siteAnswer.state === "ASSIGNED" && (cheapest === null || holdOf(siteAnswer) < holdOf(cheapest))) cheapest = siteAnswer;
  }
  // Nothing fits the site: the last plan, the ask's capped strength stepped down
  // through every lower one against the site alone, is exactly the site's refusal.
  if (cheapest === null) {
    if (siteAnswer === null || siteAnswer.state !== "REFUSED") throw new TypeError("PERSON_ROOM_PICK_INVARIANT");
    return Object.freeze({ state: "REFUSED" as const, outcome: siteAnswer });
  }
  const outcome = Object.freeze({
    ...cheapest,
    steppedDown: true,
    notes: Object.freeze([...new Set([
      ...(capped.planCapNote === null ? [] : [capped.planCapNote]),
      ...cheapest.notes,
      "PERSON_ROOM_BELOW_ECONOMY"
    ])])
  });
  return Object.freeze({ state: "ASSIGNED" as const, outcome, personRoomTight: true, holdMicros: holdOf(outcome) });
}
