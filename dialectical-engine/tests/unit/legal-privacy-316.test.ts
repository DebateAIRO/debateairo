import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { PRIVACY_315_ENTRY } from "../support/legalPrivacy315.js";
import {
  PRIVACY_316_DAY,
  PRIVACY_316_ENTRY,
  PRIVACY_316_SWAPS,
  privacy315Sha256,
  sha256Of,
  withoutPrivacy316
} from "../support/legalPrivacy316.js";

/**
 * Privacy Policy 3.16 (tests/support/legalPrivacy316.ts): the policy names Amazon Web Services, which serves OpenAI's
 * GPT-6 Luna, one of the debate models, through Amazon Bedrock. Every language is its 3.15 draft plus the recorded
 * swaps and nothing else; English is pinned word for word; Romanian and French carry the same paragraph, sentences and
 * history entry; the other languages carry only the new number; and the policy says of Amazon what the Register's
 * entry says.
 */

const root = process.cwd();
const draft = (code: string): string => readFileSync(resolve(root, "apps/ui/legal", code, "privacy-policy.md"), "utf8");
const messages = (code: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(root, "apps/ui/messages", code, "legal.json"), "utf8")) as Record<string, string>;
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

/** English, word for word: section 5's paragraph on Amazon. */
const AMAZON =
  "**A debate model through Amazon.** One of the AI models that write and judge a debate, OpenAI's GPT-6 Luna, is served by Amazon Web Services (its service Amazon Bedrock), under our contract with Amazon Web Services EMEA SARL in Luxembourg. Amazon runs this model in the United States. OpenAI, the company that made the model, does not receive your text. Amazon's terms do not allow Amazon or OpenAI to train models on it. Amazon does not keep the text, with one exception: requests that its automatic abuse filter flags are kept for up to 30 days, in the United States, and Amazon may review them. Like every AI provider, Amazon never receives your email address, your account or session identifiers, your IP address or your payment details. It is listed in the Register, and the transfer rules below apply to it.";
/** English, word for word: what else 3.16 says, each exactly once. */
const ENGLISH_SENTENCES = [
  // The summary, section 4 and section 5: whose terms forbid training.
  "The terms of DeepInfra, Anthropic and Amazon do not allow them to train models on what you write; section 5 says for which company we have not confirmed this yet.",
  "We do not use your content to train models, and the terms of DeepInfra, Anthropic and Amazon do not allow them to; section 5 says",
  "**Training and retention are different things.** The terms of DeepInfra, Anthropic and Amazon do not allow them to use your content to train or improve their models. We have checked this",
  // Section 5: the transfers paragraph.
  "today DeepInfra, Anthropic and Perplexity each rely on the standard contractual clauses, which are part of their terms. Amazon relies on the EU–US Data Privacy Framework, with the standard contractual clauses in its terms for any transfer the Framework does not cover. Where we have not confirmed a provider's mechanism, the Register says so."
];
/** The sentence 3.15 wrote, in each language the release offers, that 3.16 no longer writes. */
const GONE: Readonly<Record<string, string>> = {
  en: "DeepInfra and Anthropic do not allow",
  ro: "DeepInfra și Anthropic nu le permit",
  fr: "DeepInfra et d'Anthropic ne leur permettent"
};
/** What each released language calls the two things the paragraph must name beside the company: the country and the days. */
const UNITED_STATES: Readonly<Record<string, string>> = { en: "United States", ro: "Statele Unite", fr: "États-Unis" };

describe("Privacy Policy 3.16: Amazon Web Services serves one of the debate models", () => {
  it.each(LOCALES.map(({ code }) => [code]))("%s: the draft is its 3.15 text with only the recorded 3.16 changes", (code) => {
    const text = draft(code);
    const lines = text.split("\n");
    expect(lines[4], `${code}: the eyebrow`).toContain(" v3.16 · ");
    expect(lines[7], `${code}: the end marker`).toMatch(/ v3\.16$/u);
    expect(lines[21]!.startsWith("**Version 3.16 · Effective "), `${code}: the version line`).toBe(true);
    // The effective day stands once in every language's own date words, in the eyebrow and in the version line.
    for (const date of [lines[4]!.split(" · ").at(-1)!, lines[21]!.split(" · ")[1]!]) {
      expect(date.match(new RegExp(`(?<!\\d)${PRIVACY_316_DAY}(?!\\d)`, "gu")), `${code}: ${date}`).toHaveLength(1);
      expect(date, `${code}: the year`).toContain("2026");
    }
    expect(text, `${code}: no line names 3.15 as the current version`).not.toMatch(/ v3\.15( ·|$)|\*\*Version 3\.15 · /mu);
    expect(sha256Of(withoutPrivacy316(code, text)), `${code}: undoing 3.16 gives back the 3.15 draft byte for byte`).toBe(privacy315Sha256(code));
    expect(manifest().documents.PRIVACY![code], `${code}: the manifest`).toEqual({ version: "3.16", sha256: sha256Of(text) });
    // The languages the release offers carry the wording; the others carry the number in its three places and nothing else.
    expect(PRIVACY_316_SWAPS[code]!.swaps.length, `${code}: the changes`).toBe(RELEASED.includes(code) ? 9 : 3);
    // One paragraph and its blank line more than 3.15, in the languages that carry the wording.
    expect(lines.length - withoutPrivacy316(code, text).split("\n").length, `${code}: the lines added`).toBe(RELEASED.includes(code) ? 2 : 0);
  });

  it("English says it in the words of 3.16, and the history opens with the 3.16 entry", () => {
    const text = draft("en");
    expect(text.split(AMAZON), "the paragraph on Amazon, once").toHaveLength(2);
    for (const sentence of ENGLISH_SENTENCES) expect(text.split(sentence), sentence.slice(0, 60)).toHaveLength(2);
    // The paragraph stands in section 5, after DeepInfra's and before Perplexity's.
    const leads = paragraphs(section(text, 5)).map((line) => /^\*\*([^*]+)\*\*/u.exec(line)?.[1]);
    const at = leads.indexOf("A debate model through Amazon.");
    expect(leads[at - 1]).toBe("Debate models through DeepInfra.");
    expect(leads[at + 1]).toBe("Web search through Perplexity.");
    expect(text).toContain(`\nThis policy was last updated on ${PRIVACY_316_DAY} November 2026. ${PRIVACY_316_ENTRY} ${PRIVACY_315_ENTRY} Version 3.14 replaced`);
    expect(text).not.toMatch(/Version 3\.1[7-9]\b/u);
  });

  it.each(RELEASED.map((code) => [code]))("%s: the paragraph on Amazon stands where English has it and names what English names", (code) => {
    const text = draft(code);
    const before = withoutPrivacy316(code, text);
    const added = paragraphs(section(text, 5)).filter((line) => !before.includes(line) && line.includes("Amazon Bedrock"));
    expect(added, `${code}: one new paragraph names Amazon Bedrock`).toHaveLength(1);
    const paragraph = added[0]!;
    const all = paragraphs(section(text, 5));
    expect(all[all.indexOf(paragraph) - 1], `${code}: after DeepInfra's`).toContain("Deep Infra Inc.");
    expect(all[all.indexOf(paragraph) + 1], `${code}: before Perplexity's`).toContain("Perplexity AI, Inc.");
    expect(paragraph.startsWith("**"), `${code}: a bold lead-in`).toBe(true);
    for (const token of ["Amazon Web Services (", "Amazon Web Services EMEA SARL", "GPT-6 Luna"]) {
      expect(paragraph.split(token), `${code}: ${token}, once`).toHaveLength(2);
    }
    expect(paragraph.match(/OpenAI/gu), `${code}: OpenAI as the maker, not receiving, and not training`).toHaveLength(3);
    expect(paragraph.match(new RegExp(UNITED_STATES[code]!, "gu")), `${code}: where the model runs and where flagged requests are kept`).toHaveLength(2);
    expect(paragraph.match(/(?<!\d)30(?!\d)/gu), `${code}: the 30 days`).toHaveLength(1);
    // No claim about Europe: the paragraph says only where the model runs.
    expect(paragraph, `${code}: nothing about Europe`).not.toMatch(/Europ|\bEU\b|\bUE\b/u);
    expect(text, `${code}: the old no-training sentence`).not.toContain(GONE[code]!);
    expect(text.match(/DeepInfra, (d')?Anthropic (and|și|et) (d')?Amazon/gu), `${code}: the three companies, in the summary and sections 4 and 5`).toHaveLength(3);
    // The transfers paragraph names the Framework for Amazon, in the words the same paragraph already uses for it.
    const transfers = all.find((line) => line.includes("privacy@dezbatere.ro") && line.includes("Perplexity"))!;
    expect(transfers.match(/Amazon/gu), `${code}: Amazon, once in the transfers paragraph`).toHaveLength(1);
    const framework = { en: "EU–US Data Privacy Framework", ro: "Cadrul UE–SUA privind confidențialitatea datelor", fr: "cadre de protection des données UE–États-Unis" }[code]!;
    expect(transfers.split(framework), `${code}: the Framework, for the rule and for Amazon`).toHaveLength(3);
  });

  it.each(RELEASED.map((code) => [code]))("%s: the policy says of Amazon what the Register's entry says", (code) => {
    const text = draft(code);
    const register = messages(code);
    const paragraph = paragraphs(section(text, 5)).find((line) => line.includes("Amazon Bedrock"))!;
    // The Register: not stored but for flagged requests, up to 30 days; the Framework first, then the clauses.
    expect(register["legal.providers.retentionAmazon"], `${code}: the Register's 30 days`).toMatch(/(?<!\d)30(?!\d)/u);
    expect(register["legal.providers.retentionAmazon"], `${code}: the Register's OpenAI sentence`).toContain("OpenAI");
    expect(paragraph, `${code}: the country of the contract, as the Register names it`).toContain(register["legal.providers.luxembourg"]!);
    expect(register["legal.providers.basisAmazon"], `${code}: the Register names the certified company`).toContain("Amazon Web Services, Inc.");
  });

  it("Romanian and French carry the 3.16 history entry, newest first; the other languages carry none", () => {
    for (const code of ["ro", "fr"]) {
      const log = section(draft(code), 14);
      expect(log.indexOf("3.16"), code).toBeGreaterThan(-1);
      expect(log.indexOf("3.16"), `${code}: newest first`).toBeLessThan(log.indexOf("3.14"));
      expect(log, `${code}: names Amazon Web Services and the model`).toMatch(/3\.16[^.]*3\.15[^.]*Amazon Web Services[^.]*GPT-6 Luna/u);
      expect(log, `${code}: the day`).toMatch(new RegExp(`(?<!\\d)${PRIVACY_316_DAY} (noiembrie|novembre) 2026`, "u"));
    }
    for (const { code } of LOCALES.filter(({ code }) => !RELEASED.includes(code))) {
      expect(section(draft(code), 14), code).not.toMatch(/3\.16/u);
      expect(draft(code), `${code}: no paragraph on Amazon Bedrock yet`).not.toContain("Amazon Bedrock");
    }
  });

  it("the archive holds the English, Romanian and French 3.16 texts and their 3.15 texts, and asks nobody to accept again", () => {
    const archive = manifest().archive.PRIVACY!;
    for (const code of RELEASED) {
      const current = Object.entries(archive[code]!).filter(([, entry]) => entry.version === "3.16");
      expect(current, code).toHaveLength(1);
      expect(readFileSync(resolve(root, current[0]![1].path), "utf8"), code).toBe(draft(code));
      expect(archive[code]![privacy315Sha256(code)]?.version, `${code}: the 3.15 text the swaps undo to`).toBe("3.15");
    }
    expect(Object.keys(PRIVACY_316_SWAPS).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    expect(manifest().reacceptance).toEqual({ PRIVACY: "3.2", TERMS: "1.0" });
  });
});
