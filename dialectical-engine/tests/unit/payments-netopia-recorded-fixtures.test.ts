// tests/unit/payments-netopia-recorded-fixtures.test.ts
// N22 (spec 2026-10-05 §2.4.7, §2.20.3): the owner's scrubbed NETOPIA recordings, run through the package's REAL readers, pin
// every fact NETOPIA_FACTS assumes. Until the owner commits tests/fixtures/netopia/ this suite is SKIPPED BY NAME (the describe
// says so) — the one suite here allowed to be inert; the go-live checklist row for N-2/N-4/N-9/N-11/N-16/N-24 lists "every
// required NETOPIA kind present and this suite green", so the skip cannot be forgotten. Once any fixture exists, every
// required kind must: a missing one fails loudly. Signatures are never tested here (a scrubbed body no longer matches its
// signature); the verifier's own suite uses generated keys.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NETOPIA_FACTS, netopiaAmountToMicros, parseJsonKeepingNumberText, parseNetopiaNotice, parseOccurredAt
} from "@debateai/payments-netopia";
import { isNotFoundAnswer, readPaymentAnswer, readStartAnswer } from "../../packages/payments-netopia/src/answers.js";
import { valueAtPath } from "../../packages/payments-netopia/src/json.js";
import {
  NETOPIA_FIXTURE_FORMAT, NETOPIA_REQUIRED_FIXTURE_KINDS, SCRUBBED_POS_SIGNATURE, knownFixtureKind
} from "../../tools/billing/scrub-netopia-fixture.js";

const DIRECTORY = resolve(import.meta.dirname, "../fixtures/netopia");
type Fixture = { format: string; kind: string; environment: string; recordedOn: string; httpStatus: number | null; bodyText: string };
const fixtures: Fixture[] = existsSync(DIRECTORY)
  ? readdirSync(DIRECTORY).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(DIRECTORY, name), "utf8")) as Fixture)
  : [];
const fixture = (kind: string): Fixture => {
  const found = fixtures.find((candidate) => candidate.kind === kind);
  if (found === undefined) throw new Error(`NETOPIA fixture missing: ${kind}`);
  return found;
};
const optional = (kind: string): Fixture | undefined => fixtures.find((candidate) => candidate.kind === kind);
const json = (kind: string): Record<string, unknown> => parseJsonKeepingNumberText(fixture(kind).bodyText) as Record<string, unknown>;
const orderIdOf = (kind: string): string => String(valueAtPath(json(kind), "order.orderID"));
/** A time near the day of the recording: the zone and the unit are right only if this holds. */
const recordedNow = (kind: string): Date => new Date(Date.parse(`${fixture(kind).recordedOn}T00:00:00Z`) + 2 * 86_400_000);

describe.runIf(fixtures.length > 0)("N22 — recorded NETOPIA fixtures (OWNER-RUN; SKIPPED until tests/fixtures/netopia/ exists)", () => {
  it("hold every required kind, only known kinds, in the v1 format, with nothing that looks like a secret", () => {
    const present = new Set(fixtures.map((candidate) => candidate.kind));
    expect(NETOPIA_REQUIRED_FIXTURE_KINDS.filter((kind) => !present.has(kind)), "missing NETOPIA fixture kinds").toEqual([]);
    expect([...present].filter((kind) => !knownFixtureKind(kind)), "unknown NETOPIA fixture kinds").toEqual([]);
    for (const candidate of fixtures) {
      expect(candidate.format, candidate.kind).toBe(NETOPIA_FIXTURE_FORMAT);
      for (const pos of candidate.bodyText.match(/[A-Z0-9]{4}(?:-[A-Z0-9]{4}){4}/gu) ?? []) expect(pos, candidate.kind).toBe(SCRUBBED_POS_SIGNATURE);
      // Every member whose key holds "token", in any letter case (customerAction.authenticationToken, binding.cardToken, …).
      for (const [, key, value] of candidate.bodyText.matchAll(/"([^"]*token[^"]*)"\s*:\s*"([^"]*)"/giu)) expect(value, `${candidate.kind} ${key}`).toMatch(/^fake-token-[0-9]+$/u);
    }
  });

  it("read the hosted start's answer and the 0 check's as starts: 101, ntpID, a NETOPIA payment URL", () => {
    for (const kind of ["start-answer", "zero-answer"]) expect(readStartAnswer(json(kind), { sameOriginAllowed: null }).providerPaymentId, kind).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/u);
  });

  it("pin where the client id goes and the installments value (N-2, N-24): the request as sent got a saved card", () => {
    const request = json("start-request");
    const where = valueAtPath(request, "order.clientID") !== undefined ? "order" : "instrument";
    expect(where).toBe(NETOPIA_FACTS.clientIdLocation);
    expect(Number(valueAtPath(request, "payment.options.installments"))).toBe(NETOPIA_FACTS.installments);
    expect(parseNetopiaNotice(Buffer.from(fixture("notice-start").bodyText, "utf8"), recordedNow("notice-start")).savedCard).not.toBeNull();
  });

  it("pin the token's path (N-4): the first paid message carries it at a pinned path", () => {
    const body = json("notice-start");
    expect(NETOPIA_FACTS.tokenPaths.some((path) => typeof valueAtPath(body, path) === "string")).toBe(true);
  });

  it("pin the paid status, the amount's unit and the card's country (N-9, the unit, the country format)", () => {
    const parsed = parseNetopiaNotice(Buffer.from(fixture("notice-start").bodyText, "utf8"), recordedNow("notice-start"));
    expect(NETOPIA_FACTS.paidStatuses).toContain(parsed.providerStatus);
    expect(netopiaAmountToMicros(parsed.amountText!)).toBe(netopiaAmountToMicros(String(valueAtPath(json("start-request"), "order.amount"))));
    expect(parsed.cardCountry, "neither instrument.country nor ISSUER_COUNTRY parsed: the blocked-country refusal would never fire").not.toBeNull();
  });

  it("pin the currency (CF1, ops-4): the first paid message and the status answer name the currency the start asked", () => {
    // VERIFY_PAYMENT refuses a report whose currency is not the charge's (absent included), so NETOPIA must echo it.
    const asked = String(valueAtPath(json("start-request"), "order.currency"));
    expect(asked).toMatch(/^[A-Z]{3}$/u);
    expect(parseNetopiaNotice(Buffer.from(fixture("notice-start").bodyText, "utf8"), recordedNow("notice-start")).currency).toBe(asked);
    const status = readPaymentAnswer(json("status-answer"), { orderId: orderIdOf("status-answer"), now: recordedNow("status-answer"), purpose: "STATUS" });
    expect(status.kind === "REPORT" ? status.report.currency : status.kind).toBe(asked);
  });

  it("pin operationDate's format: a zoned time near the recording day, in messages and status answers", () => {
    expect(parseNetopiaNotice(Buffer.from(fixture("notice-start").bodyText, "utf8"), recordedNow("notice-start")).occurredAt).not.toBeNull();
    expect(parseOccurredAt(String(valueAtPath(json("status-answer"), "payment.operationDate")), recordedNow("status-answer"))).not.toBeNull();
  });

  it("pin the status read (N-16): with ntpID, without it, and how NETOPIA says no such order", () => {
    for (const kind of ["status-answer", "status-answer-without-ntp-id"]) {
      expect(readPaymentAnswer(json(kind), { orderId: orderIdOf(kind), now: recordedNow(kind), purpose: "STATUS" }).kind, kind).toBe("REPORT");
    }
    expect(isNotFoundAnswer(json("status-no-such-order")), `the answer's error.code is not in NETOPIA_FACTS.notFoundCodes`).toBe(true);
  });

  it("pin the 0 card check (N-11): it leaves a saved card and reads paid or authorized", () => {
    const parsed = parseNetopiaNotice(Buffer.from(fixture("notice-zero").bodyText, "utf8"), recordedNow("notice-zero"));
    expect(parsed.savedCard).not.toBeNull();
    expect([2, ...NETOPIA_FACTS.paidStatuses]).toContain(parsed.providerStatus);
  });

  it("pin the saved-card charge (N-4, N-12, N-15): a report, and a new card in its message", () => {
    const answer = readPaymentAnswer(json("charge-answer"), { orderId: orderIdOf("charge-answer"), now: recordedNow("charge-answer"), purpose: "CHARGE" });
    expect(answer.kind === "REPORT" && answer.report.state).toBe("PAID");
    expect(parseNetopiaNotice(Buffer.from(fixture("notice-charge").bodyText, "utf8"), recordedNow("notice-charge")).savedCard).not.toBeNull();
    const declined = optional("charge-answer-declined");
    if (declined !== undefined) {
      const report = readPaymentAnswer(json("charge-answer-declined"), { orderId: orderIdOf("charge-answer-declined"), now: recordedNow("charge-answer-declined"), purpose: "CHARGE" });
      expect(report.kind === "REPORT" && report.report.declineSide, "a card-side decline code").toBe("CARD");
    }
    if (optional("charge-answer-56") !== undefined) {
      const reused = readPaymentAnswer(json("charge-answer-56"), { orderId: orderIdOf("charge-answer-56"), now: recordedNow("charge-answer-56"), purpose: "CHARGE" });
      expect(reused.kind === "REPORT" ? reused.orderReused : reused.kind).not.toBe(false);
    }
  });
});
