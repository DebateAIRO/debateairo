// Step 1 (owner, 2026-10-08): POST /v1/asks on the private preview answers a person outside
// the team 403 PREVIEW_TEAM_ONLY. The ask page says so in its own plain sentence, in every
// locale — never the coordinator clause and never the code.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { requestFailureMessage } from "../../apps/ui/lib/v3/requestFailure.js";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";

const catalogue = (locale: string, namespace: string): Record<string, string> => JSON.parse(
  readFileSync(resolve(process.cwd(), "apps/ui/messages", locale, `${namespace}.json`), "utf8")
) as Record<string, string>;
const ENGLISH = "Debates on this preview are open only to the team.";
const KEY = "newDebate.room.previewTeamOnly";
const teamOnly = () => new ContractHttpError("FORBIDDEN", 403, "PREVIEW_TEAM_ONLY", "PREVIEW_TEAM_ONLY");

describe("the preview's team-only sentence on the ask page", () => {
  it("replaces the generic refusal for PREVIEW_TEAM_ONLY, with and without the English catalogue", () => {
    expect(requestFailureMessage("DEBATE_CREATE", teamOnly())).toBe(ENGLISH);
    expect(requestFailureMessage("DEBATE_CREATE", teamOnly(), catalogue("en", "newDebate"))).toBe(ENGLISH);
  });

  it("is worded in every locale's own catalogue, translated, with no code, status or figure", () => {
    for (const { code } of LOCALES) {
      const value = catalogue(code, "newDebate")[KEY];
      expect(value, code).toBeTypeOf("string");
      expect(requestFailureMessage("DEBATE_CREATE", teamOnly(), catalogue(code, "newDebate"))).toBe(value);
      if (code !== "en") expect(value, `${code} is translated`).not.toBe(ENGLISH);
      expect(value, code).not.toMatch(/\p{Nd}|PREVIEW|TEAM_ONLY|403/u);
    }
  });

  it("uses Romanian diacritics, not their cedilla look-alikes", () => {
    expect(catalogue("ro", "newDebate")[KEY]).not.toMatch(/[şţŞŢ]/u);
  });

  it("leaves other refusals, other subjects and the location sentence as they were", () => {
    const other = new ContractHttpError("FORBIDDEN", 403, "CSRF_VALIDATION_FAILED", "CSRF_VALIDATION_FAILED");
    expect(requestFailureMessage("DEBATE_CREATE", other)).toBe(
      "Starting this debate did not complete. The coordinator answered and refused it. Sign in again, then retry."
    );
    expect(requestFailureMessage("DEBATE_READ", teamOnly())).toBe(
      "Loading this debate did not complete. The coordinator answered and refused it. Sign in again, then retry."
    );
    const located = new ContractHttpError("FORBIDDEN", 403, "COUNTRY_ASK_BLOCKED", "COUNTRY_ASK_BLOCKED");
    expect(requestFailureMessage("DEBATE_CREATE", located)).toBe(
      "New debates can't be started from your current location. Your debates stay available to read."
    );
    // Only the 403 the route answers is this sentence.
    const wrongStatus = new ContractHttpError("UNPROCESSABLE", 422, "PREVIEW_TEAM_ONLY", "PREVIEW_TEAM_ONLY");
    expect(requestFailureMessage("DEBATE_CREATE", wrongStatus)).not.toBe(ENGLISH);
  });
});
