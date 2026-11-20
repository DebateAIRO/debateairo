import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { TERMS_VERSIONS } from "../../apps/ui/lib/legal/pages.js";
import { sha256Of, TERMS_11_DAY, TERMS_11_ENTRY, TERMS_11_SWAPS, terms10Sha256, withoutTerms11 } from "../support/legalTerms11.js";

/**
 * Terms of Service 1.1 (tests/support/legalTerms11.ts): section 8 names Amazon Web Services, which serves one of the
 * debate models, made by OpenAI, through Amazon Bedrock, and names no model; section 14 gains the Terms' first history
 * entry.
 * Every language is its 1.0 draft plus the recorded swaps and nothing else; English is pinned word for word; Romanian
 * and French carry the same paragraph, sentences and entry; the other languages carry only the new number; and
 * /terms/versions lists 1.1 in force and 1.0 with a link to its archived text.
 */

const root = process.cwd();
const draft = (code: string): string => readFileSync(resolve(root, "apps/ui/legal", code, "terms-of-service.md"), "utf8");
const manifest = (): {
  reacceptance: Record<string, string | null>;
  documents: Record<string, Record<string, { version: string; sha256: string }>>;
  archive: Record<string, Record<string, Record<string, { version: string; path: string }>>>;
} => JSON.parse(readFileSync(resolve(root, "packages/legal-manifest/src/manifest.json"), "utf8"));

const section = (text: string, no: number): string => {
  const body = new RegExp(`^## ${no}\\.[^\\n]*\\n([\\s\\S]*?)^## `, "mu").exec(text)?.[1];
  if (body === undefined) throw new Error(`no section ${no}`);
  return body;
};
const paragraphs = (body: string): string[] => body.split("\n").filter((line) => line.trim() !== "");
const RELEASED = ["en", "ro", "fr"];

/** English, word for word: section 8's paragraph on Amazon, the Privacy Policy's shortened. */
const AMAZON =
  "**A debate model through Amazon.** One of the AI models that write and judge a debate, a model made by OpenAI, is served by **Amazon Web Services** (its service Amazon Bedrock), under our contract with Amazon Web Services EMEA SARL in Luxembourg. Amazon runs this model in the United States and is listed in the Provider Register. OpenAI, the company that made the model, does not receive your text, and Amazon's terms do not allow Amazon or OpenAI to train models on it. Amazon does not keep the text, with one exception: requests that its automatic abuse filter flags are kept for up to 30 days, in the United States, and Amazon may review them. Amazon never receives your email address, your account identifiers, your session records or your payment details.";
/** English, word for word: whose terms forbid training, in the summary and in section 8, each exactly once. */
const ENGLISH_SENTENCES = [
  "The terms of DeepInfra, Anthropic and Amazon do not allow them to train models on it; section 8 says for which company we have not confirmed this yet.",
  "**We do not train on your content.** The terms of DeepInfra, Anthropic and Amazon do not allow them to use your content to train or improve their models either. We have checked this"
];
/** The sentence 1.0 wrote, in each language the release offers, that 1.1 no longer writes. */
const GONE: Readonly<Record<string, string>> = {
  en: "DeepInfra and Anthropic do not allow",
  ro: "DeepInfra și Anthropic nu le permit",
  fr: "DeepInfra et d’Anthropic ne leur permettent"
};
const UNITED_STATES: Readonly<Record<string, string>> = { en: "United States", ro: "Statele Unite", fr: "États-Unis" };

describe("Terms of Service 1.1: Amazon Web Services serves one of the debate models", () => {
  it.each(LOCALES.map(({ code }) => [code]))("%s: the draft is its 1.0 text with only the recorded 1.1 changes", (code) => {
    const text = draft(code);
    const lines = text.split("\n");
    expect(lines[4], `${code}: the eyebrow`).toContain(" v1.1 · ");
    expect(lines[7], `${code}: the end marker`).toMatch(/ v1\.1$/u);
    expect(lines[23]!.startsWith("**Version 1.1 · Effective "), `${code}: the version line`).toBe(true);
    // The effective day stands once in every language's own date words, in the eyebrow and in the version line.
    for (const date of [lines[4]!.split(" · ").at(-1)!, lines[23]!.split(" · ")[1]!]) {
      expect(date.match(new RegExp(`(?<!\\d)${TERMS_11_DAY}(?!\\d)`, "gu")), `${code}: ${date}`).toHaveLength(1);
      expect(date, `${code}: the year`).toContain("2026");
    }
    expect(text, `${code}: no line names 1.0 as the current version`).not.toMatch(/ v1\.0( ·|$)|\*\*Version 1\.0 · /mu);
    expect(sha256Of(withoutTerms11(code, text)), `${code}: undoing 1.1 gives back the 1.0 draft byte for byte`).toBe(terms10Sha256(code));
    expect(manifest().documents.TERMS![code], `${code}: the manifest`).toEqual({ version: "1.1", sha256: sha256Of(text) });
    // The languages the release offers carry the wording; the others carry the number in its three places and nothing else.
    expect(TERMS_11_SWAPS[code]!.swaps.length, `${code}: the changes`).toBe(RELEASED.includes(code) ? 7 : 3);
    // Section 14 is its heading and three paragraphs on changes, then the history: one entry where the wording is carried.
    const section14 = text.split(/^## 14\./mu)[1]!.split(/^## 15\./mu)[0]!.trim().split("\n\n");
    expect(section14, `${code}: section 14`).toHaveLength(RELEASED.includes(code) ? 5 : 4);
    expect(section14[3], `${code}: the paragraph before the history still points to the versions page`).toContain("dezbatere.ro/terms/versions");
  });

  it("English says it in the words of 1.1, and section 14 ends with the 1.1 entry", () => {
    const text = draft("en");
    expect(text.split(AMAZON), "the paragraph on Amazon, once").toHaveLength(2);
    for (const sentence of ENGLISH_SENTENCES) expect(text.split(sentence), sentence.slice(0, 60)).toHaveLength(2);
    // The paragraph stands in section 8, after DeepInfra's and before Perplexity's.
    const leads = paragraphs(section(text, 8)).map((line) => /^\*\*([^*]+)\*\*/u.exec(line)?.[1]);
    const at = leads.indexOf("A debate model through Amazon.");
    expect(leads[at - 1]).toBe("Debate models through DeepInfra.");
    expect(leads[at + 1]).toBe("Web search through Perplexity.");
    expect(paragraphs(section(text, 14)).at(-1)).toBe(TERMS_11_ENTRY);
    expect(text.split("\n")[4]).toBe(`eyebrow: TERMS OF SERVICE · v1.1 · EFFECTIVE ${TERMS_11_DAY} NOVEMBER 2026`);
    expect(text.split("\n")[23]!.startsWith(`**Version 1.1 · Effective ${TERMS_11_DAY} November 2026 · `)).toBe(true);
    expect([...text.matchAll(/Version (\d+\.\d+) replaced version (\d+\.\d+)/gu)].map(([, newer, older]) => [newer, older])).toEqual([["1.1", "1.0"]]);
  });

  it.each(RELEASED.map((code) => [code]))("%s: the paragraph on Amazon stands where English has it and names what English names", (code) => {
    const text = draft(code);
    const before = withoutTerms11(code, text);
    const all = paragraphs(section(text, 8));
    const added = all.filter((line) => !before.includes(line) && line.includes("Amazon Bedrock"));
    expect(added, `${code}: one new paragraph names Amazon Bedrock`).toHaveLength(1);
    const paragraph = added[0]!;
    expect(all[all.indexOf(paragraph) - 1], `${code}: after DeepInfra's`).toContain("Deep Infra Inc.");
    expect(all[all.indexOf(paragraph) + 1], `${code}: before Perplexity's`).toContain("Perplexity AI, Inc.");
    for (const token of ["**Amazon Web Services** (", "Amazon Web Services EMEA SARL"]) {
      expect(paragraph.split(token), `${code}: ${token}, once`).toHaveLength(2);
    }
    expect(paragraph.match(/OpenAI/gu), `${code}: OpenAI as the maker, not receiving, and not training`).toHaveLength(3);
    expect(paragraph.match(new RegExp(UNITED_STATES[code]!, "gu")), `${code}: where the model runs and where flagged requests are kept`).toHaveLength(2);
    expect(paragraph.match(/(?<!\d)30(?!\d)/gu), `${code}: the 30 days`).toHaveLength(1);
    // No claim about Europe: the paragraph says only where the model runs.
    expect(paragraph, `${code}: nothing about Europe`).not.toMatch(/Europ|\bEU\b|\bUE\b/u);
    expect(text, `${code}: the old no-training sentence`).not.toContain(GONE[code]!);
    expect(text.match(/DeepInfra, (d’)?Anthropic (and|și|et) (d’)?Amazon/gu), `${code}: the three companies, in the summary and section 8`).toHaveLength(2);
    // The history entry is section 14's last paragraph, and names the two versions, the company, the model's maker and the section.
    const entry = paragraphs(section(text, 14)).at(-1)!;
    expect(entry, `${code}: the entry`).toMatch(/1\.1[^.]*1\.0[^.]*Amazon Web Services[^.]*OpenAI[^.]*8\)\.$/u);
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: the Terms name no model served through Amazon, and not OpenAI's own app", (code) => {
    expect(draft(code), code).not.toMatch(/GPT|Luna|ChatGPT/u);
  });

  it("the other languages carry no paragraph on Amazon Bedrock and no history entry yet", () => {
    for (const { code } of LOCALES.filter(({ code }) => !RELEASED.includes(code))) {
      expect(draft(code), code).not.toContain("Amazon Bedrock");
      expect(section(draft(code), 14), code).not.toMatch(/1\.0|1\.1/u);
    }
  });

  it("lists 1.1 in force and 1.0 with its archived text, the archive holds both in English, Romanian and French, and nobody is asked to accept again", () => {
    expect(TERMS_VERSIONS).toEqual([
      { version: "1.1", noteKey: "legal.versions.v2.note", current: true, href: "/terms" },
      { version: "1.0", noteKey: "legal.archive.meta", current: false, href: `/terms/versions/${terms10Sha256("en")}` }
    ]);
    const archive = manifest().archive.TERMS!;
    for (const code of RELEASED) {
      const current = Object.entries(archive[code]!).filter(([, entry]) => entry.version === "1.1");
      expect(current, code).toHaveLength(1);
      expect(readFileSync(resolve(root, current[0]![1].path), "utf8"), code).toBe(draft(code));
      const previous = archive[code]![terms10Sha256(code)];
      expect(previous?.version, `${code}: the 1.0 text the swaps undo to`).toBe("1.0");
      expect(readFileSync(resolve(root, previous!.path), "utf8"), `${code}: the archived 1.0 text is untouched`).toBe(withoutTerms11(code, draft(code)));
    }
    expect(Object.keys(TERMS_11_SWAPS).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    expect(manifest().reacceptance).toEqual({ PRIVACY: "3.2", TERMS: "1.0" });
  });
});
