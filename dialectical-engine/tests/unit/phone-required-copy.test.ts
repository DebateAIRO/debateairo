// Owner ruling 2026-10-09: a free question no longer needs a phone. An API deployed before that
// change still refuses POST /v1/asks with 422 ACCOUNT_PHONE_REQUIRED; until it is replaced, the ask
// page says what to do in its own plain sentence, in every locale — never "the reply could not be
// read", and never the code.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { requestFailureMessage } from "../../apps/ui/lib/v3/requestFailure.js";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";

const catalogue = (locale: string, namespace: string): Record<string, string> => JSON.parse(
  readFileSync(resolve(process.cwd(), "apps/ui/messages", locale, `${namespace}.json`), "utf8")
) as Record<string, string>;
const ENGLISH = "Please add a phone number in Settings, or try again in a few minutes.";
const KEY = "newDebate.room.phoneRequired";
const phoneRequired = () => new ContractHttpError(
  "UNPROCESSABLE", 422, "ACCOUNT_PHONE_REQUIRED: Complete your phone profile before asking a free question", "ACCOUNT_PHONE_REQUIRED"
);

describe("the older API's phone refusal on the ask page", () => {
  it("replaces the unreadable-reply line for ACCOUNT_PHONE_REQUIRED, with and without the English catalogue", () => {
    expect(requestFailureMessage("DEBATE_CREATE", phoneRequired())).toBe(ENGLISH);
    expect(requestFailureMessage("DEBATE_CREATE", phoneRequired(), catalogue("en", "newDebate"))).toBe(ENGLISH);
  });

  it("is worded in every locale's own catalogue, translated, with no code, status or figure", () => {
    for (const { code } of LOCALES) {
      const value = catalogue(code, "newDebate")[KEY];
      expect(value, code).toBeTypeOf("string");
      expect(requestFailureMessage("DEBATE_CREATE", phoneRequired(), catalogue(code, "newDebate"))).toBe(value);
      if (code !== "en") expect(value, `${code} is translated`).not.toBe(ENGLISH);
      expect(value, code).not.toMatch(/\p{Nd}|ACCOUNT|PHONE_REQUIRED|422/u);
    }
  });

  it("uses Romanian diacritics, not their cedilla look-alikes", () => {
    expect(catalogue("ro", "newDebate")[KEY]).not.toMatch(/[şţŞŢ]/u);
  });

  it("leaves other refusals and other subjects as they were", () => {
    expect(requestFailureMessage("DEBATE_READ", phoneRequired())).toBe(
      "Loading this debate did not complete. The coordinator's reply could not be read, so the outcome is unknown."
    );
    const other = new ContractHttpError("UNPROCESSABLE", 422, "i", "SOMETHING_ELSE");
    expect(requestFailureMessage("DEBATE_CREATE", other)).toBe(
      "Starting this debate did not complete. The coordinator's reply could not be read, so the outcome is unknown."
    );
  });
});
