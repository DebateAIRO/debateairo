import { describe, expect, it } from "vitest";
import type { ChargeEventKind } from "@debateai/db";
import {
  countedSavedCardSends, NOT_SENT_CODES, OUR_SETUP_CODES, RESEND_STARTED, savedCardSendLeft
} from "../../apps/api/src/billing/renewal-markers.js";

const SINCE = new Date("2026-10-21T10:00:00.000Z");
const MINUTE = 60_000;
const at = (minutes: number) => new Date(SINCE.getTime() + minutes * MINUTE);

type Event = Readonly<{ kind: ChargeEventKind; errorCode: string | null; at: Date }>;
const event = (kind: ChargeEventKind, errorCode: string | null, when: Date): Event => Object.freeze({ kind, errorCode, at: when });
const renewal = (...events: Event[]) => Object.freeze({ kind: "RENEWAL", events });

// B1 (NETOPIA answers 2026-10-21, Q22): at most 3 saved-card tries a day; we send at most 2 per card in any 24 hours.
describe("B1 counting saved-card sends (NETOPIA Q22)", () => {
  it("keeps the markers' sets and names as renewal.ts had them", () => {
    expect(RESEND_STARTED).toBe("RESEND_STARTED");
    expect([...NOT_SENT_CODES].sort()).toEqual(["CHARGE_CONFIGURATION_REFUSED", "CHARGE_CREDENTIALS_REFUSED", "CHARGE_NOT_SENT"]);
    expect([...OUR_SETUP_CODES].sort()).toEqual(["CHARGE_CONFIGURATION_REFUSED", "CHARGE_CREDENTIALS_REFUSED"]);
  });

  it("leaves room for a send after 0 or 1 counted sends, and none after 2 (one spare of NETOPIA's 3)", () => {
    const sends = (count: number) => Array.from({ length: count }, (_unused, index) =>
      renewal(event("REQUESTED", null, at(index)), event("SUBMITTED", null, at(index))));
    expect(savedCardSendLeft(sends(0), SINCE)).toBe(true);
    expect(savedCardSendLeft(sends(1), SINCE)).toBe(true);
    expect(savedCardSendLeft(sends(2), SINCE)).toBe(false);
    expect(savedCardSendLeft(sends(3), SINCE)).toBe(false);
    // Two not-sent calls leave the room untouched.
    expect(savedCardSendLeft([renewal(
      event("REQUESTED", null, at(1)), event("REQUESTED", "CHARGE_NOT_SENT", at(1)),
      event("REQUESTED", RESEND_STARTED, at(2)), event("REQUESTED", "CHARGE_NOT_SENT", at(2))
    )], SINCE)).toBe(true);
  });

  it("counts a charge's first marker, answered", () => {
    expect(countedSavedCardSends([renewal(event("REQUESTED", null, at(1)), event("SUBMITTED", null, at(1)))], SINCE)).toBe(1);
  });

  it("counts a first marker with nothing after it yet (a call in flight)", () => {
    expect(countedSavedCardSends([renewal(event("REQUESTED", null, at(1)))], SINCE)).toBe(1);
  });

  it("counts each RESEND_STARTED marker", () => {
    expect(countedSavedCardSends([renewal(
      event("REQUESTED", null, at(1)), event("SUBMIT_UNKNOWN", "CHARGE_OUTCOME_UNKNOWN", at(1)),
      event("REQUESTED", RESEND_STARTED, at(31)), event("SUBMITTED", null, at(31))
    )], SINCE)).toBe(2);
  });

  it("does not count a marker followed by REQUESTED CHARGE_NOT_SENT (nothing reached NETOPIA)", () => {
    expect(countedSavedCardSends([renewal(
      event("REQUESTED", null, at(1)), event("REQUESTED", "CHARGE_NOT_SENT", at(1)),
      event("REQUESTED", RESEND_STARTED, at(2)), event("REQUESTED", "CHARGE_NOT_SENT", at(2))
    )], SINCE)).toBe(0);
  });

  it("does not count a marker followed by FAILED CARD_NOT_SAVED (no call was made)", () => {
    expect(countedSavedCardSends([renewal(event("REQUESTED", null, at(1)), event("FAILED", "CARD_NOT_SAVED", at(1)))], SINCE)).toBe(0);
  });

  it("counts a marker followed by REQUESTED CHARGE_CONFIGURATION_REFUSED (NETOPIA answered the call)", () => {
    expect(countedSavedCardSends([renewal(
      event("REQUESTED", null, at(1)), event("REQUESTED", "CHARGE_CONFIGURATION_REFUSED", at(1))
    )], SINCE)).toBe(1);
  });

  it("counts a marker followed by SUBMIT_UNKNOWN (the call may have reached NETOPIA)", () => {
    expect(countedSavedCardSends([renewal(
      event("REQUESTED", null, at(1)), event("SUBMIT_UNKNOWN", "SUBMIT_INTERRUPTED", at(11))
    )], SINCE)).toBe(1);
  });

  it("does not count the not-sent REQUESTED itself, nor any other REQUESTED code, as a marker", () => {
    expect(countedSavedCardSends([renewal(
      event("REQUESTED", "CHARGE_CREDENTIALS_REFUSED", at(1)), event("REQUESTED", "SOMETHING_ELSE", at(2))
    )], SINCE)).toBe(0);
  });

  it("does not count a marker 1 ms before `since`, and counts one exactly at it", () => {
    const before = new Date(SINCE.getTime() - 1);
    expect(countedSavedCardSends([renewal(event("REQUESTED", null, before), event("SUBMITTED", null, before))], SINCE)).toBe(0);
    expect(countedSavedCardSends([renewal(event("REQUESTED", null, SINCE), event("SUBMITTED", null, SINCE))], SINCE)).toBe(1);
  });

  it("ignores a charge that is not a RENEWAL", () => {
    expect(countedSavedCardSends([
      Object.freeze({ kind: "UPGRADE", events: [event("REQUESTED", null, at(1)), event("SUBMITTED", null, at(1))] })
    ], SINCE)).toBe(0);
  });

  it("sums the sends of several charges", () => {
    expect(countedSavedCardSends([
      renewal(event("REQUESTED", null, at(1)), event("SUBMITTED", null, at(1)), event("FAILED", "PAYMENT_DECLINED", at(1))),
      renewal(event("REQUESTED", null, at(60)), event("SUBMIT_UNKNOWN", "CHARGE_OUTCOME_UNKNOWN", at(60)),
        event("REQUESTED", RESEND_STARTED, at(90)))
    ], SINCE)).toBe(3);
  });
});
