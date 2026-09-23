import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import {
  REQUEST_FAILURE_SUBJECTS,
  classifyRequestFailure,
  requestFailureMessage,
  type RequestFailureSubject
} from "../../apps/ui/lib/v3/requestFailure.js";

const root = new URL("../../", import.meta.url);

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

  it("leaves no contract error text in a page's error banner", async () => {
    const [create, debate] = await Promise.all([
      readFile(new URL("apps/ui/app/new/page.tsx", root), "utf8"),
      readFile(new URL("apps/ui/app/debate/[id]/DebatePageClient.tsx", root), "utf8")
    ]);
    for (const [name, source] of [["app/new/page.tsx", create], ["DebatePageClient.tsx", debate]] as const) {
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
