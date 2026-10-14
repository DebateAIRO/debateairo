import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * S01 C01.8 (SPEC-v3 R-28, Appendix B A-2): the key-level walk over the 115 auth.* copy keys of
 * packages/mail-templates/messages/en/mail.json, for each of the 35 catalogue codes. Each locale's own file is read
 * directly, so the en fallback of packages/mail-templates/src/render.ts is never taken. Three checks per locale: a
 * non-empty string for every key; the same placeholders as English; and no English value shipped under the D-75
 * identity rule (R-29 tokens stripped, then equal; or equal after case and punctuation folding, D-91 N12).
 * The render-level check is V.2 (D-79). Non-English rows are RED until L01..L34 land: that is the V01 gate.
 */

const MESSAGES = resolve("packages/mail-templates/messages");

const catalogueOf = (code: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(MESSAGES, code, "mail.json"), "utf8")) as Record<string, unknown>;

const CODES = readdirSync(MESSAGES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const EN = catalogueOf("en");
const AUTH_KEYS = Object.keys(EN).filter((key) => key.startsWith("auth.")).sort();
const englishOf = (key: string): string => String(EN[key]);

const R29 = ["Dialectical Engine", "DebateAI", "dezbatere.ro", "PLUS", "PRO", "MAX"] as const;
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The D-75 strip: placeholders, URLs, e-mail addresses, tokens with digits and the R-29 tokens. */
function stripped(value: string): string {
  let out = value
    .replace(/\{[^}]+\}/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\S+@\S+/g, " ")
    .replace(/\S*\d\S*/g, " ");
  for (const token of R29) out = out.replace(new RegExp(`(?<![A-Za-z])${escapeRegExp(token)}(?![A-Za-z])`, "g"), " ");
  return out.replace(/\s+/g, " ").trim();
}

/** The D-91 N12 fold: case and punctuation folded, nothing stripped. */
const folded = (value: string): string =>
  value.toLowerCase().replace(/[^\p{L}\p{N}_\s]/gu, " ").replace(/\s+/g, " ").trim();

/** True when the translation ships the English value under the D-75 identity rule, with the N12 clause. */
function shipsEnglish(english: string, translation: string): boolean {
  const kept = stripped(translation);
  if (kept !== "" && kept === stripped(english)) return true;
  const plain = folded(translation);
  return plain !== "" && plain === folded(english);
}

const placeholdersOf = (value: string): string[] => (value.match(/\{[A-Za-z][A-Za-z0-9_]*\}/g) ?? []).sort();

/** The locale's own value for a key, with no fallback: null when the key is absent or empty. */
function ownText(catalogue: Record<string, unknown>, key: string): string | null {
  const value = catalogue[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

describe("S01 mail-locale key walk", () => {
  it("the catalogue holds the 35 codes", () => {
    expect(CODES).toHaveLength(35);
  });

  it("en holds the 115 auth keys", () => {
    expect(AUTH_KEYS).toHaveLength(115);
  });

  for (const code of CODES) {
    const catalogue = catalogueOf(code);

    it(`every auth key holds a non-empty string in its own catalogue (${code})`, () => {
      expect(AUTH_KEYS).toHaveLength(115);
      const missing = AUTH_KEYS.filter((key) => ownText(catalogue, key) === null);
      expect(missing).toEqual([]);
    });

    it(`placeholders equal the English placeholders (${code})`, () => {
      expect(AUTH_KEYS).toHaveLength(115);
      const differ = AUTH_KEYS.filter((key) => {
        const value = ownText(catalogue, key);
        return value !== null && JSON.stringify(placeholdersOf(value)) !== JSON.stringify(placeholdersOf(englishOf(key)));
      });
      expect(differ).toEqual([]);
    });

    if (code !== "en") {
      it(`no English value is shipped after the R-29 strip (${code})`, () => {
        expect(AUTH_KEYS).toHaveLength(115);
        const shipped = AUTH_KEYS.filter((key) => {
          const value = ownText(catalogue, key);
          return value !== null && shipsEnglish(englishOf(key), value);
        });
        expect(shipped).toEqual([]);
      });
    }
  }
});

describe("S01 mail-locale key walk checker self-test", () => {
  it("the identity rule flags a greeting left in English", () => {
    expect(shipsEnglish("Hello,", "Hello,")).toBe(true);
  });

  it("the identity rule flags a sign-off left in English", () => {
    expect(shipsEnglish("The DebateAI team", "The DebateAI team")).toBe(true);
  });

  it("the N12 fold flags a value that differs from English by one comma", () => {
    expect(shipsEnglish("Hello,", "Hello")).toBe(true);
  });

  it("the identity rule passes a translated greeting", () => {
    expect(shipsEnglish("Hello,", "Bună,")).toBe(false);
  });

  it("the identity rule passes a subject that keeps only the brand", () => {
    expect(
      shipsEnglish("Verify your email for Dialectical Engine", "Verifică adresa de email pentru Dialectical Engine")
    ).toBe(false);
  });

  it("the placeholder rule flags a dropped placeholder", () => {
    expect(placeholdersOf("This link expires at {expiry}.")).not.toEqual(placeholdersOf("Acest link expiră."));
  });

  it("the own-catalogue read returns null for an absent or empty key, with no fallback", () => {
    expect(ownText({ "auth.x": "" }, "auth.x")).toBeNull();
    expect(ownText({}, "auth.x")).toBeNull();
  });
});
