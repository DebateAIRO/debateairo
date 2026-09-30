import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { requestFailureMessage } from "../../apps/ui/lib/v3/requestFailure.js";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";

const catalogue = (locale: string, namespace: string): Record<string, string> => JSON.parse(
  readFileSync(resolve(process.cwd(), "apps/ui/messages", locale, `${namespace}.json`), "utf8")
) as Record<string, string>;
const G4 = "New debates can't be started from your current location. Your debates stay available to read.";
const blocked = () => new ContractHttpError("FORBIDDEN", 403, "COUNTRY_ASK_BLOCKED", "COUNTRY_ASK_BLOCKED");

describe("the blocked-location sentence on the ask page (paid plans G3b, sentence G4)", () => {
  it("replaces the generic refusal for COUNTRY_ASK_BLOCKED, in English and in each locale", () => {
    expect(requestFailureMessage("DEBATE_CREATE", blocked())).toBe(G4);
    expect(requestFailureMessage("DEBATE_CREATE", blocked(), catalogue("en", "newDebate"))).toBe(G4);
    for (const { code } of LOCALES) {
      const value = catalogue(code, "newDebate")["newDebate.room.locationBlocked"];
      expect(value, code).toBeTypeOf("string");
      expect(requestFailureMessage("DEBATE_CREATE", blocked(), catalogue(code, "newDebate"))).toBe(value);
      if (code !== "en") expect(value, `${code} is translated`).not.toBe(G4);
      expect(value, code).not.toMatch(/\p{Nd}|COUNTRY|403|IP\b/u);
    }
  });

  it("leaves every other refusal, and other subjects, as they were", () => {
    const other = new ContractHttpError("FORBIDDEN", 403, "CSRF_VALIDATION_FAILED", "CSRF_VALIDATION_FAILED");
    expect(requestFailureMessage("DEBATE_CREATE", other)).toBe(
      "Starting this debate did not complete. The coordinator answered and refused it. Sign in again, then retry."
    );
    expect(requestFailureMessage("DEBATE_READ", blocked())).toBe(
      "Loading this debate did not complete. The coordinator answered and refused it. Sign in again, then retry."
    );
  });
});
