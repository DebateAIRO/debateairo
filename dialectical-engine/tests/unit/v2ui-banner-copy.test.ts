import { readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import {
  REQUEST_FAILURE_KINDS,
  REQUEST_FAILURE_SUBJECTS,
  classifyRequestFailure,
  requestFailureMessage,
  type RequestFailureSubject
} from "../../apps/ui/lib/v3/requestFailure.js";

const root = new URL("../../", import.meta.url);
const MESSAGES = new URL("apps/ui/messages/", root);
const catalogue = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`${locale}/${namespace}.json`, MESSAGES), "utf8")) as Record<string, string>;
const LOCALES = readdirSync(MESSAGES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/** What POST /v1/asks answers once the day's spend would not admit one more run (apps/api askRefusalStatus). */
const dayRefusal = () => new ContractHttpError(
  "RATE_LIMITED", 429, "DAILY_COST_ENVELOPE_REACHED: DAILY_COST_ENVELOPE_REACHED", "DAILY_COST_ENVELOPE_REACHED"
);
/** The hourly per-owner limit: the same status, its own code. */
const hourRefusal = () => new ContractHttpError(
  "RATE_LIMITED", 429, "ADMISSION_RATE_LIMITED: too many asks", "ADMISSION_RATE_LIMITED"
);

/** Everything a server could put in front of a user through an error body. */
const HOSTILE = "Visit http://evil.test to restore your account — code 0xDEAD at /var/lib/pg";

describe("DL3-F7 page banners carry classified copy, never contract error text", () => {
  it("never lets a server-authored message reach the banner", () => {
    const fromServer = new ContractHttpError("SERVER_FAILURE", 500, `UPSTREAM: ${HOSTILE}`, "UPSTREAM");
    const thrown = new Error(HOSTILE);
    for (const subject of REQUEST_FAILURE_SUBJECTS) {
      for (const failure of [fromServer, thrown, HOSTILE, { message: HOSTILE }, null]) {
        const message = requestFailureMessage(subject, failure);
        expect(message).not.toContain("evil.test");
        expect(message).not.toContain("0xDEAD");
        expect(message).not.toContain("/var/lib/pg");
        expect(message).not.toContain("UPSTREAM");
        expect(message.length).toBeGreaterThan(0);
      }
    }
  });

  it("draws every sentence from a closed alphabet of subject and kind", () => {
    const seen = new Map<string, string>();
    const failures: unknown[] = [
      new ContractHttpError("SESSION_REQUIRED", 401, "a"),
      new ContractHttpError("FORBIDDEN", 403, "b"),
      new ContractHttpError("NOT_FOUND", 404, "c"),
      new ContractHttpError("RATE_LIMITED", 429, "d"),
      new ContractHttpError("SERVER_FAILURE", 503, "e"),
      new ContractHttpError("NETWORK_FAILURE", 0, "f"),
      new ContractHttpError("INVALID_RESPONSE", 200, "g"),
      new ContractHttpError("MALFORMED_REQUEST", 400, "h"),
      new ContractHttpError("UNPROCESSABLE", 422, "i"),
      new Error("j"),
      "k"
    ];
    for (const subject of REQUEST_FAILURE_SUBJECTS) {
      for (const failure of failures) {
        const classified = classifyRequestFailure(subject, failure);
        expect(classified.subject).toBe(subject);
        const key = `${classified.subject}/${classified.kind}`;
        const already = seen.get(key);
        if (already !== undefined) expect(classified.message).toBe(already);
        seen.set(key, classified.message);
      }
    }
    // One sentence per (subject, kind) pair that can actually occur, and each
    // one names its own subject so two banners never wear the same face.
    expect(seen.size).toBeGreaterThanOrEqual(REQUEST_FAILURE_SUBJECTS.length * 4);
    expect(new Set(seen.values()).size).toBe(seen.size);
  });

  it("tells a refusal apart from an outage, and never claims one for the other", () => {
    const subject: RequestFailureSubject = "DEBATE_CREATE";
    expect(classifyRequestFailure(subject, new ContractHttpError("NETWORK_FAILURE", 0, "x")).kind)
      .toBe("UNREACHABLE");
    expect(classifyRequestFailure(subject, new ContractHttpError("SERVER_FAILURE", 503, "x")).kind)
      .toBe("UNREACHABLE");
    expect(classifyRequestFailure(subject, new ContractHttpError("SESSION_REQUIRED", 401, "x")).kind)
      .toBe("REFUSED");
    expect(classifyRequestFailure(subject, new ContractHttpError("FORBIDDEN", 403, "x")).kind)
      .toBe("REFUSED");
    expect(classifyRequestFailure(subject, new ContractHttpError("RATE_LIMITED", 429, "x")).kind)
      .toBe("BUSY");
    expect(classifyRequestFailure(subject, new Error("x")).kind).toBe("UNCLASSIFIED");
    expect(classifyRequestFailure(subject, new Error("x")).message)
      .not.toMatch(/refus|reject|declin/iu);
  });

  /**
   * SYNC3 (map section 2, item 4). dev's debate tiers refuse an ask the plan
   * cannot serve with a 422 carrying its own typed code. dev's /new rendered the
   * server's sentence; DL3-F7 renders classified copy, which read a 422 as
   * "could not be read, so the outcome is unknown" — hiding an OBSERVED refusal.
   * Each tier code gets a constant clause of its own, and the server's sentence
   * (which names the unavailable models) still never reaches the page.
   */
  it("names dev's plan-tier refusals as refusals, in copy the server never wrote", () => {
    const server = "The premium plan needs grok-4.6-build, and it is not available right now";
    const invalid = classifyRequestFailure("DEBATE_CREATE", new ContractHttpError(
      "UNPROCESSABLE", 422, `ASK_PLAN_TIER_INVALID: ${server}`, "ASK_PLAN_TIER_INVALID"
    ));
    const unavailable = classifyRequestFailure("DEBATE_CREATE", new ContractHttpError(
      "UNPROCESSABLE", 422, `ASK_PLAN_TIER_MODEL_UNAVAILABLE: ${server}`, "ASK_PLAN_TIER_MODEL_UNAVAILABLE"
    ));
    expect(invalid.kind).toBe("PLAN_TIER_INVALID");
    expect(unavailable.kind).toBe("PLAN_TIER_UNAVAILABLE");
    for (const classified of [invalid, unavailable]) {
      expect(classified.message).toMatch(/refused/u);
      expect(classified.message).not.toMatch(/unknown/u);
      expect(classified.message).not.toContain("grok");
      expect(classified.message).not.toContain("ASK_PLAN_TIER");
    }
    expect(invalid.message).not.toBe(unavailable.message);
    // Any other 422 stays what it was: unreadable, outcome unknown.
    expect(classifyRequestFailure("DEBATE_CREATE", new ContractHttpError(
      "UNPROCESSABLE", 422, "OTHER: x", "OTHER"
    )).kind).toBe("UNREADABLE");
  });

  /**
   * Task M8 (spec 2026-09-26 §14.4.7). The daily limit for NEW debates stays;
   * the person is told, in plain calm words, to try again tomorrow. It used to
   * share BUSY with every 429 and read "The coordinator is rate-limiting
   * requests right now. Retry shortly.": jargon, and wrong about the timing
   * (the limit resets at the next UTC midnight).
   */
  it("gives today's limit for new debates its own kind, keyed on the server's code", () => {
    expect(classifyRequestFailure("DEBATE_CREATE", dayRefusal()).kind).toBe("DAILY_LIMIT_REACHED");
    // The hourly per-owner limit keeps its own mapping, and so does a 429 with no code.
    expect(classifyRequestFailure("DEBATE_CREATE", hourRefusal()).kind).toBe("BUSY");
    expect(classifyRequestFailure("DEBATE_CREATE", new ContractHttpError("RATE_LIMITED", 429, "x")).kind).toBe("BUSY");
    // The code alone is not the refusal: a server failure that carries it stays a server failure.
    expect(classifyRequestFailure("DEBATE_CREATE", new ContractHttpError(
      "SERVER_FAILURE", 500, "DAILY_COST_ENVELOPE_REACHED", "DAILY_COST_ENVELOPE_REACHED"
    )).kind).toBe("SERVER_FAILED");
  });

  it("says today's limit is reached and to try again tomorrow, in English and Romanian", () => {
    const english = "Starting this debate did not complete. "
      + "We've reached today's limit for new debates. Please try again tomorrow.";
    expect(requestFailureMessage("DEBATE_CREATE", dayRefusal(), catalogue("en", "newDebate"))).toBe(english);
    // With no catalogue, the code's own English says the same.
    expect(requestFailureMessage("DEBATE_CREATE", dayRefusal())).toBe(english);
    expect(requestFailureMessage("DEBATE_CREATE", dayRefusal(), catalogue("ro", "newDebate"))).toBe(
      "Pornirea acestei dezbateri nu s-a finalizat. "
      + "Am atins limita de azi pentru dezbateri noi. Vă rugăm să încercați din nou mâine."
    );
  });

  it("tells the hourly limit to wait a little, in words a person reads", () => {
    const english = "Starting this debate did not complete. "
      + "There have been too many requests in a short time. Please wait a little, then try again.";
    expect(requestFailureMessage("DEBATE_CREATE", hourRefusal(), catalogue("en", "newDebate"))).toBe(english);
    expect(requestFailureMessage("DEBATE_CREATE", hourRefusal())).toBe(english);
    expect(requestFailureMessage("DEBATE_CREATE", hourRefusal(), catalogue("ro", "newDebate"))).toBe(
      "Pornirea acestei dezbateri nu s-a finalizat. "
      + "Au sosit prea multe solicitări într-un timp scurt. Vă rugăm să așteptați puțin, apoi să încercați din nou."
    );
    expect(requestFailureMessage("DEBATE_READ", hourRefusal(), catalogue("en", "debateChrome"))).toBe(
      "Loading this debate did not complete. "
      + "There have been too many requests in a short time. Please wait a little, then try again."
    );
  });

  it("words both limits in every locale, the same in both catalogues, with no internals, figure or hour", () => {
    expect(LOCALES).toHaveLength(35);
    const english = catalogue("en", "newDebate");
    for (const locale of LOCALES) {
      const create = catalogue(locale, "newDebate");
      const read = catalogue(locale, "debateChrome");
      // Every kind the classifier can return has its words in both catalogues that read it, identically.
      for (const kind of REQUEST_FAILURE_KINDS) {
        const key = `requestFailure.kind.${kind}`;
        expect(create[key], `${locale}/newDebate ${key}`).toBeTypeOf("string");
        expect(read[key], `${locale}/debateChrome ${key}`).toBe(create[key]);
      }
      const day = create["requestFailure.kind.DAILY_LIMIT_REACHED"]!;
      const hour = create["requestFailure.kind.BUSY"]!;
      expect(day, locale).not.toBe(hour);
      for (const [name, value] of [["DAILY_LIMIT_REACHED", day], ["BUSY", hour]] as const) {
        expect(value, `${locale} ${name}`).not.toMatch(/\p{Nd}/u);
        expect(value, `${locale} ${name}`).not.toMatch(/coordinat|rate-limit|envelope|budget|ceiling|UTC/iu);
        if (locale !== "en") expect(value, `${locale} ${name} is translated`).not.toBe(english[`requestFailure.kind.${name}`]);
      }
    }
    // Romanian carries none of its own engine words either.
    for (const value of [
      catalogue("ro", "newDebate")["requestFailure.kind.DAILY_LIMIT_REACHED"]!,
      catalogue("ro", "newDebate")["requestFailure.kind.BUSY"]!
    ]) {
      expect(value).not.toMatch(/coordonator|plafon|buget|anvelop/iu);
    }
  });

  it("keeps the code's English fallback identical to the English catalogues for both limits", () => {
    for (const refusal of [dayRefusal(), hourRefusal()]) {
      expect(requestFailureMessage("DEBATE_CREATE", refusal))
        .toBe(requestFailureMessage("DEBATE_CREATE", refusal, catalogue("en", "newDebate")));
      expect(requestFailureMessage("DEBATE_READ", refusal))
        .toBe(requestFailureMessage("DEBATE_READ", refusal, catalogue("en", "debateChrome")));
    }
  });

  it("leaves no contract error text in a page's error banner", async () => {
    const [create, debate] = await Promise.all([
      readFile(new URL("apps/ui/app/new/NewDebatePageClient.tsx", root), "utf8"),
      readFile(new URL("apps/ui/app/debate/[id]/DebatePageClient.tsx", root), "utf8")
    ]);
    for (const [name, source] of [["app/new/NewDebatePageClient.tsx", create], ["DebatePageClient.tsx", debate]] as const) {
      expect(source, `${name} classifies its failures`).toContain("requestFailureMessage(");
      expect(source, `${name} interpolates no caught message`)
        .not.toMatch(/exc instanceof Error \? exc\.message/u);
      expect(source, `${name} interpolates no caught message`)
        .not.toMatch(/failure instanceof Error \? failure\.message/u);
      expect(source, `${name} renders no raw contract code`)
        .not.toMatch(/exc instanceof ContractHttpError \? exc\.code/u);
    }
  });
});
