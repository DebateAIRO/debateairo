import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Terms of Service 1.1, effective 20 November 2026, the first change to the launch text. One of the models that write
 * and judge a debate, OpenAI's GPT-6 Luna, is served by Amazon Web Services through Amazon Bedrock, so section 8 names
 * Amazon before that model reaches anyone:
 *   - a paragraph "A debate model through Amazon", the Privacy Policy's (section 5 there) shortened: the contract is
 *     with Amazon Web Services EMEA SARL in Luxembourg, the model runs in the United States, OpenAI does not receive
 *     the text, neither Amazon nor OpenAI may train on it, and Amazon keeps nothing except requests its automatic
 *     abuse filter flags, for up to 30 days;
 *   - the sentence that says whose terms forbid training names Amazon beside DeepInfra and Anthropic, in the summary
 *     and in section 8;
 *   - section 14 gains the Terms' first history entry, and /terms/versions lists 1.0 with a link to its archived text.
 * English, Romanian and French, the languages the release offers, carry the wording and the entry; every other
 * language carries only the new number. Nobody has to accept again: the floor stays 1.0.
 *
 * Every language's 1.1 draft is its 1.0 draft (whose sha256 the manifest held at 1.0) plus the swaps in
 * legalTerms11.json, generated from the two texts: each pair is [1.0 text, 1.1 text], the 1.1 text unique in the
 * draft. `withoutTerms11` undoes them, so the checks written for 1.0 still read a 1.0 text.
 */

/** The day of November 2026 on which 1.1 takes effect, as every language's eyebrow and version line write it. */
export const TERMS_11_DAY = "20";

export const TERMS_11_ENTRY =
  "Version 1.1 replaced version 1.0: it names Amazon Web Services, which serves one of the debate models (OpenAI's GPT-6 Luna) in the United States, and says what Amazon keeps (section 8).";

type Swaps = Readonly<Record<string, Readonly<{ sha256: string; swaps: readonly (readonly [string, string])[] }>>>;

export const TERMS_11_SWAPS: Swaps = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/support/legalTerms11.json"), "utf8")
) as Swaps;

/** The sha256 of a language's 1.0 draft, as the manifest recorded it at 1.0. */
export const terms10Sha256 = (code: string): string => {
  const entry = TERMS_11_SWAPS[code];
  if (entry === undefined) throw new Error(`no 1.1 swaps for ${code}`);
  return entry.sha256;
};

/** A language's Terms as 1.0 wrote them: `text` (its 1.1 draft) with 1.1's swaps undone, last first. */
export const withoutTerms11 = (code: string, text: string): string => {
  const entry = TERMS_11_SWAPS[code];
  if (entry === undefined) throw new Error(`no 1.1 swaps for ${code}`);
  return [...entry.swaps].reverse().reduce((current, [before, after]) => {
    if (current.split(after).length !== 2) throw new Error(`${code}: the 1.1 text is not there exactly once: ${after.slice(0, 60)}`);
    return current.replace(after, () => before);
  }, text);
};

export const sha256Of = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
