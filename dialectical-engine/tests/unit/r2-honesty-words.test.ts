import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LOCALES = readdirSync("apps/ui/messages", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const misc = (locale: string) =>
  JSON.parse(readFileSync(`apps/ui/messages/${locale}/misc.json`, "utf8")) as Record<string, string>;
// Ruling W1 (R2b whole-branch review I1): sameAnswer added; notCounted names the group case.
const KEYS = ["title", "intro", "counted", "notCounted", "noneCounted", "sameAnswer", "chosen", "strength"]
  .map((key) => `misc.answerHonesty.comparison.${key}`);
const placeholders = (text: string) => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
/** Codes of the engine that no reader text may carry, in any language. */
const CODES = /\b(?:SPLIT|CONTESTED|SUPPORTED|UNSUPPORTED|JUDGES_[A-Z_]+|VERDICT-[A-Z-]+)\b/u;

describe("R2 honesty panel words (OWNER WORDING, option 1)", () => {
  it("covers all 35 languages", () => { expect(LOCALES).toHaveLength(35); });

  it("says it in English with no engine word and no number", () => {
    const en = misc("en");
    for (const key of KEYS) {
      const text = en[key]!;
      expect(text, key).toBeTruthy();
      expect(text.toLowerCase(), key).not.toMatch(/judge|score|vote|median|honest|engine|rung|threshold|panel|verdict|split/u);
      expect(text.replace(/\{[A-Za-z]+\}/gu, ""), key).not.toMatch(/\d/u);
    }
    expect(placeholders(en["misc.answerHonesty.comparison.counted"]!)).toEqual(["counted", "seated"]);
    expect(placeholders(en["misc.answerHonesty.comparison.chosen"]!)).toEqual(["chose", "counted"]);
  });

  it.each(LOCALES)("%s: every sentence is present, keeps the English placeholders and carries no engine code", (locale) => {
    const en = misc("en");
    const local = misc(locale);
    for (const key of KEYS) {
      const text = local[key];
      expect(typeof text === "string" && text.trim().length > 0, `${locale} ${key}`).toBe(true);
      expect(placeholders(text!), `${locale} ${key}`).toEqual(placeholders(en[key]!));
      expect(text, `${locale} ${key}`).not.toMatch(CODES);
      if (locale !== "en") expect(text, `${locale} ${key} is translated`).not.toBe(en[key]);
    }
  });
});
