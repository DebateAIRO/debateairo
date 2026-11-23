import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { legalText } from "../support/legalText.js";

/**
 * The Terms of Service name Amazon Web Services in section 8, which serves one of the debate models, made by OpenAI,
 * through Amazon Bedrock, and name no model. English is pinned word for word; Romanian and French, the other languages
 * the release offers, carry the same paragraph and sentences; the languages not offered yet carry no such paragraph.
 */

const draft = (code: string): string => legalText("TERMS", code);

const section = (text: string, no: number): string => {
  const body = new RegExp(`^## ${no}\\.[^\\n]*\\n([\\s\\S]*?)^## `, "mu").exec(text)?.[1];
  if (body === undefined) throw new Error(`no section ${no}`);
  return body;
};
const paragraphs = (body: string): string[] => body.split("\n").filter((line) => line.trim() !== "");
const RELEASED = ["en", "ro", "fr"];
/**
 * Not offered yet, but recorded in translated-from.json as translated from the current English, or from an English text
 * released since launch (the archive keeps each one): every such English text has the paragraph, so they carry it too.
 */
const englishNow = createHash("sha256").update(draft("en"), "utf8").digest("hex");
const translatedFrom = (JSON.parse(readFileSync(resolve(process.cwd(), "apps/ui/legal/translated-from.json"), "utf8")) as {
  TERMS: Record<string, { sha256: string }>;
}).TERMS;
const releasedEnglish = new Set(Object.keys((JSON.parse(readFileSync(resolve(process.cwd(), "packages/legal-manifest/src/manifest.json"), "utf8")) as {
  archive: Record<string, Record<string, Record<string, unknown>>>;
}).archive.TERMS?.en ?? {}));
const CURRENT_NOT_OFFERED = LOCALES.map(({ code }) => code)
  .filter((code) => !RELEASED.includes(code)
    && (translatedFrom[code]?.sha256 === englishNow || releasedEnglish.has(translatedFrom[code]?.sha256 ?? "")));

/** English, word for word: section 8's paragraph on Amazon, the Privacy Policy's shortened. */
const AMAZON =
  "**A debate model through Amazon.** One of the AI models that write and judge a debate, a model made by OpenAI, is served by **Amazon Web Services** (its service Amazon Bedrock), under our contract with Amazon Web Services EMEA SARL in Luxembourg. Amazon runs this model in the United States and is listed in the Provider Register. OpenAI, the company that made the model, does not receive your text, and Amazon's terms do not allow Amazon or OpenAI to train models on it. Amazon does not keep the text, with one exception: requests that its automatic abuse filter flags are kept for up to 30 days, in the United States, and Amazon may review them. Amazon never receives your email address, your account identifiers, your session records or your payment details.";
/** English, word for word: whose terms forbid training, in the summary and in section 8, each exactly once. */
const ENGLISH_SENTENCES = [
  "The terms of DeepInfra, Anthropic and Amazon do not allow them to train models on it.",
  "**We do not train on your content.** The terms of DeepInfra, Anthropic and Amazon do not allow them to use your content to train or improve their models either. We have checked this"
];
/** The sentence that named two companies only, in each language the release offers: it must not come back. */
const GONE: Readonly<Record<string, string>> = {
  en: "DeepInfra and Anthropic do not allow",
  ro: "DeepInfra și Anthropic nu le permit",
  fr: "DeepInfra et d’Anthropic ne leur permettent"
};
const UNITED_STATES: Readonly<Record<string, string>> = { en: "United States", ro: "Statele Unite", fr: "États-Unis" };

describe("Terms of Service: Amazon Web Services serves one of the debate models", () => {
  it("English says it in the approved words", () => {
    const text = draft("en");
    expect(text.split(AMAZON), "the paragraph on Amazon, once").toHaveLength(2);
    for (const sentence of ENGLISH_SENTENCES) expect(text.split(sentence), sentence.slice(0, 60)).toHaveLength(2);
    // The paragraph stands in section 8, after DeepInfra's and before Perplexity's.
    const leads = paragraphs(section(text, 8)).map((line) => /^\*\*([^*]+)\*\*/u.exec(line)?.[1]);
    const at = leads.indexOf("A debate model through Amazon.");
    expect(leads[at - 1]).toBe("Debate models through DeepInfra.");
    expect(leads[at + 1]).toBe("Web search through Perplexity.");
  });

  it.each(RELEASED.map((code) => [code]))("%s: the paragraph on Amazon stands where English has it and names what English names", (code) => {
    const text = draft(code);
    const all = paragraphs(section(text, 8));
    const added = all.filter((line) => line.includes("Amazon Bedrock"));
    expect(added, `${code}: one paragraph names Amazon Bedrock`).toHaveLength(1);
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
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: the Terms name no model served through Amazon, and not OpenAI's own app", (code) => {
    expect(draft(code), code).not.toMatch(/GPT|Luna|ChatGPT/u);
  });

  it("the not-offered translations brought up to date are ja and ko", () => {
    expect(CURRENT_NOT_OFFERED).toEqual(["ja", "ko"]);
  });

  it.each(CURRENT_NOT_OFFERED.map((code) => [code]))("%s: one paragraph names Amazon Bedrock, between DeepInfra's and Perplexity's", (code) => {
    const all = paragraphs(section(draft(code), 8));
    const added = all.filter((line) => line.includes("Amazon Bedrock"));
    expect(added, `${code}: one paragraph names Amazon Bedrock`).toHaveLength(1);
    const at = all.indexOf(added[0]!);
    expect(all[at - 1], `${code}: after DeepInfra's`).toContain("Deep Infra Inc.");
    expect(all[at + 1], `${code}: before Perplexity's`).toContain("Perplexity AI, Inc.");
    expect(added[0]!.split("Amazon Web Services EMEA SARL"), `${code}: the contracting company, once`).toHaveLength(2);
  });

  it("the languages that follow an older English text carry no paragraph on Amazon Bedrock", () => {
    for (const { code } of LOCALES.filter(({ code }) => !RELEASED.includes(code) && !CURRENT_NOT_OFFERED.includes(code))) {
      expect(draft(code), code).not.toContain("Amazon Bedrock");
    }
  });
});
