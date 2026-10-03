/**
 * Paid plans S2 — the person's room at 100%, the limits cut from it, and the one
 * decision admission takes on the picker's answer: fits → that strength; too small
 * for the person even at ECONOMY → START at ECONOMY (amendment A5); too small for
 * the site → the site's refusal, unchanged.
 */
import { describe, expect, it } from "vitest";
import {
  personRoomMicrosAt,
  personRoomOf,
  pickWithinPersonRoom,
  pickerMoneyLimits
} from "@debateai/api";
import type { ModelStrength } from "@debateai/kernel";
import type { PickerInput } from "@debateai/scorecard";
import type { RoomPreview, RoomWindowUse } from "../../apps/api/src/ask-room.js";
import { roleNumbers, targetFor, testCandidate, testEntry, testPickerInput, testPrice, testScorecard } from "../support/scorecardFixtures.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const HOUR = 3_600_000;
const use = (limitMicros: number, usedMicros: number, resetsInMs: number, scope: RoomWindowUse["scope"] = "PERSON_DAY"): RoomWindowUse =>
  Object.freeze({ scope, limitMicros, usedMicros, resetsAt: new Date(NOW.getTime() + resetsInMs), closeBasisPoints: 9500 });

describe("personRoomOf (B6a's preview → the picker's person)", () => {
  /** B6a's wait reason when no person window is full (a START, or a wait for the site). */
  const SITE_REASON = Object.freeze({ waitsFor: "SITE" as const, personRecheckAt: null });
  const preview = (
    admission: RoomPreview["admission"],
    personUses: readonly RoomWindowUse[],
    waitReason: RoomPreview["waitReason"] = SITE_REASON
  ): RoomPreview => Object.freeze({ admission, estimateMicros: 1_000, now: NOW, personUses, waitReason });
  const START = Object.freeze({ kind: "START" as const, worst: "FITS" as const, worstScope: null });
  const waitDecision = (waitsUntil: Date, worstScope: "PERSON_DAY" | "SITE_DAY" = "PERSON_DAY") =>
    Object.freeze({ kind: "WAIT" as const, waitsUntil, worstScope });

  it("has no person scope when the preview measured no window (local, billing off, legacy asker)", () => {
    expect(personRoomOf(preview(START, []))).toBeNull();
  });

  it("plans a START for the room at the preview's instant", () => {
    const uses = [use(1000, 700, HOUR)];
    expect(personRoomOf(preview(START, uses))).toEqual({ uses, at: NOW });
  });

  it("plans a WAIT for the room it wakes to, and names the preview's own instant for a locked START", () => {
    // The day is full on SPEND: B6a looks again when it resets, which is also the room's `waitsUntil`.
    const resets = new Date(NOW.getTime() + HOUR);
    const uses = [use(1000, 1000, HOUR)];
    const room = personRoomOf(preview(waitDecision(resets), uses, { waitsFor: "PERSON", personRecheckAt: resets }));
    expect(room).toEqual({ uses, at: resets, ifStartsNowAt: NOW });
    expect(personRoomMicrosAt(room!.uses, room!.at)).toBe(1000);
    expect(personRoomMicrosAt(room!.uses, room!.ifStartsNowAt!)).toBe(0);
  });

  it("plans a wait that only the person's own live holds cause for the next minute, never for the reset", () => {
    // Full on holds, not on spend: B6a looks again at the next whole minute (the live debate may end any time),
    // although the day itself resets an hour from now.
    const nextMinute = new Date(NOW.getTime() + 60_000);
    const uses = [use(1000, 1000, HOUR)];
    const room = personRoomOf(preview(waitDecision(new Date(NOW.getTime() + HOUR)), uses, { waitsFor: "PERSON", personRecheckAt: nextMinute }));
    expect(room).toEqual({ uses, at: nextMinute, ifStartsNowAt: NOW });
    expect(personRoomMicrosAt(room!.uses, room!.at)).toBe(0);
  });

  it("plans a wait for the site for the preview's own instant", () => {
    const uses = [use(1000, 700, HOUR)];
    const room = personRoomOf(preview(waitDecision(new Date(NOW.getTime() + 12 * HOUR), "SITE_DAY"), uses));
    expect(room).toEqual({ uses, at: NOW, ifStartsNowAt: NOW });
    expect(personRoomMicrosAt(room!.uses, room!.at)).toBe(300);
  });

  it("refuses a PERSON wait whose recheck instant is missing", () => {
    const broken = { waitsFor: "PERSON", personRecheckAt: null } as unknown as RoomPreview["waitReason"];
    expect(() => personRoomOf(preview(waitDecision(new Date(NOW.getTime() + HOUR)), [use(1000, 1000, HOUR)], broken)))
      .toThrow("PERSON_ROOM_INPUT_INVALID");
  });
});

describe("personRoomMicrosAt", () => {
  it("is null when the ask has no person scope", () => {
    expect(personRoomMicrosAt([], NOW)).toBeNull();
  });

  it("is the smallest limit − used over the windows, never below zero", () => {
    expect(personRoomMicrosAt([use(1000, 300, HOUR), use(5000, 4800, 24 * HOUR, "PERSON_WEEK")], NOW)).toBe(200);
    expect(personRoomMicrosAt([use(1000, 1500, HOUR)], NOW)).toBe(0);
  });

  it("counts a window that has reset by `at` at its whole limit: the room a waiting question wakes to", () => {
    const uses = [use(1000, 1000, HOUR), use(5000, 4000, 24 * HOUR, "PERSON_WEEK")];
    expect(personRoomMicrosAt(uses, NOW)).toBe(0);
    expect(personRoomMicrosAt(uses, new Date(NOW.getTime() + HOUR))).toBe(1000);
  });

  it.each([-1, 1.5, Number.NaN, 2 ** 53])("refuses a limit or a used amount of %s", (bad) => {
    expect(() => personRoomMicrosAt([use(bad, 0, HOUR)], NOW)).toThrow("PERSON_ROOM_INPUT_INVALID");
    expect(() => personRoomMicrosAt([use(1000, bad, HOUR)], NOW)).toThrow("PERSON_ROOM_INPUT_INVALID");
  });
});

describe("pickerMoneyLimits", () => {
  const policy = Object.freeze({ perRunCeilingMicros: 250_000, serveReserveBasisPoints: 3000, serveOverrunBasisPoints: 2000 });
  it("is the site's own shares with no person scope", () => {
    expect(pickerMoneyLimits({ moneyPolicy: policy, runMaximumMicros: 300_000, personRoomMicros: null }))
      .toEqual({ bodyMicros: 175_000, serveMicros: 300_000, personRoomMicros: null, unknownEstimateMicros: 300_000 });
  });

  it("cuts the body share from a smaller room, and holds the whole run to the room itself (100 %, never the finish edge)", () => {
    // The site's overrun would allow 120 000; a person's plan never goes past what is left of the person's room.
    expect(pickerMoneyLimits({ moneyPolicy: policy, runMaximumMicros: 300_000, personRoomMicros: 100_000 }))
      .toEqual({ bodyMicros: 70_000, serveMicros: 100_000, personRoomMicros: 100_000, unknownEstimateMicros: 300_000 });
  });

  it("keeps the site's ceiling when the room is larger", () => {
    expect(pickerMoneyLimits({ moneyPolicy: policy, runMaximumMicros: 300_000, personRoomMicros: 9_000_000 }))
      .toMatchObject({ bodyMicros: 175_000, serveMicros: 300_000 });
  });

  it("leaves nothing to fit in an empty room", () => {
    expect(pickerMoneyLimits({ moneyPolicy: policy, runMaximumMicros: 300_000, personRoomMicros: 0 }))
      .toEqual({ bodyMicros: 0, serveMicros: 0, personRoomMicros: 0, unknownEstimateMicros: 300_000 });
  });
});

const best = testCandidate("best", "OpenAI");
const mid = testCandidate("mid", "Anthropic");
const cheap = testCandidate("cheap", "Google");
const entries = [testEntry("best", 95, 1), testEntry("mid", 92, 1), testEntry("cheap", 70, 1)];
const reachable = [best, mid, cheap].map((candidate) => targetFor(candidate));
const prices = new Map([["provider:best", testPrice(400)], ["provider:mid", testPrice(150)], ["provider:cheap", testPrice(30)]]);
// BEST 8000 (arguing 4000) · BALANCED 3000 (arguing 1500) · ECONOMY 600 (arguing 300).
function picker(overrides: Partial<PickerInput> = {}, strength: ModelStrength = "BEST"): Omit<PickerInput, "moneyLimits"> {
  return testPickerInput({
    scorecard: testScorecard([best, mid, cheap], { JUDGE: entries, ANSWER_WRITER: entries }, { diversityShare: 0 }),
    reachable, mode: "HOSTED", strength, prices,
    seatDemand: roleNumbers({ JUDGE: 1, ANSWER_WRITER: 1 }),
    expectedCallsByRole: roleNumbers({ JUDGE: 10, ANSWER_WRITER: 10 }),
    ...overrides
  });
}
const site = (perRunCeilingMicros: number, serveReserveBasisPoints = 0) =>
  Object.freeze({ perRunCeilingMicros, serveReserveBasisPoints, serveOverrunBasisPoints: 0 });

describe("pickWithinPersonRoom", () => {
  it("lets the site's ceiling alone decide when there is no person scope", () => {
    const picked = pickWithinPersonRoom({ picker: picker(), moneyPolicy: site(10_000), runMaximumMicros: 10_000, personRoomMicros: null });
    expect(picked).toMatchObject({ state: "ASSIGNED", personRoomTight: false, holdMicros: 8000 });
    if (picked.state === "ASSIGNED") expect(picked.outcome.appliedStrength).toBe("BEST");
  });

  it("steps the strength down to fit a smaller room", () => {
    const picked = pickWithinPersonRoom({ picker: picker(), moneyPolicy: site(10_000), runMaximumMicros: 10_000, personRoomMicros: 3000 });
    expect(picked).toMatchObject({ state: "ASSIGNED", personRoomTight: false, holdMicros: 3000 });
    if (picked.state === "ASSIGNED") {
      expect(picked.outcome.appliedStrength).toBe("BALANCED");
      expect(picked.outcome.steppedDown).toBe(true);
    }
  });

  it("STARTS at ECONOMY when even ECONOMY is over the person's room (A5) — never a refusal, never a wait", () => {
    const picked = pickWithinPersonRoom({ picker: picker(), moneyPolicy: site(10_000), runMaximumMicros: 10_000, personRoomMicros: 500 });
    expect(picked).toMatchObject({ state: "ASSIGNED", personRoomTight: true, holdMicros: 600 });
    if (picked.state === "ASSIGNED") {
      expect(picked.outcome.appliedStrength).toBe("ECONOMY");
      expect(picked.outcome.assignment.strength).toBe("ECONOMY");
      expect(picked.outcome.steppedDown).toBe(true);
      expect(picked.outcome.notes).toContain("PERSON_ROOM_BELOW_ECONOMY");
    }
  });

  it("keeps the site's refusal when the site's own ceiling cannot hold ECONOMY", () => {
    expect(pickWithinPersonRoom({ picker: picker(), moneyPolicy: site(500), runMaximumMicros: 500, personRoomMicros: null }))
      .toMatchObject({ state: "REFUSED", outcome: { reason: "BUDGET_TOO_SMALL" } });
    expect(pickWithinPersonRoom({ picker: picker(), moneyPolicy: site(500), runMaximumMicros: 500, personRoomMicros: 400 }))
      .toMatchObject({ state: "REFUSED", outcome: { reason: "BUDGET_TOO_SMALL" } });
  });

  it("holds the arguing part to the body share of the ceiling", () => {
    // 10 000 with 60 % held back for the answer: body 4000 fits BEST's arguing 4000 …
    const roomy = pickWithinPersonRoom({ picker: picker(), moneyPolicy: site(10_000, 6000), runMaximumMicros: 10_000, personRoomMicros: null });
    if (roomy.state === "ASSIGNED") expect(roomy.outcome.appliedStrength).toBe("BEST");
    // … a room of 5000 leaves a body of 2000: BALANCED.
    const tight = pickWithinPersonRoom({ picker: picker(), moneyPolicy: site(10_000, 6000), runMaximumMicros: 10_000, personRoomMicros: 5000 });
    if (tight.state === "ASSIGNED") expect(tight.outcome.appliedStrength).toBe("BALANCED");
    expect([roomy.state, tight.state]).toEqual(["ASSIGNED", "ASSIGNED"]);
  });

  it("holds the run maximum for an estimate it cannot make, and plans it as ECONOMY when the room is below that maximum", () => {
    const noJudgeEntry = picker({ scorecard: testScorecard([best, mid, cheap], { ANSWER_WRITER: entries }, { diversityShare: 0 }) });
    const open = pickWithinPersonRoom({ picker: noJudgeEntry, moneyPolicy: site(10_000), runMaximumMicros: 10_000, personRoomMicros: null });
    expect(open).toMatchObject({ state: "ASSIGNED", personRoomTight: false, holdMicros: 10_000 });
    const tight = pickWithinPersonRoom({ picker: noJudgeEntry, moneyPolicy: site(10_000), runMaximumMicros: 10_000, personRoomMicros: 5000 });
    expect(tight).toMatchObject({ state: "ASSIGNED", personRoomTight: true, holdMicros: 10_000 });
    if (tight.state === "ASSIGNED") expect(tight.outcome.appliedStrength).toBe("ECONOMY");
  });

  it("has no money and no hold in LOCAL mode", () => {
    const picked = pickWithinPersonRoom({ picker: picker({ mode: "LOCAL" }), moneyPolicy: null, runMaximumMicros: null, personRoomMicros: 1 });
    expect(picked).toMatchObject({ state: "ASSIGNED", personRoomTight: false, holdMicros: null });
  });
});
