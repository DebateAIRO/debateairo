import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Privacy Policy 3.16, effective 20 November 2026. One of the models that write and judge a debate, a model made by
 * OpenAI, is served by Amazon Web Services through Amazon Bedrock, so the policy names Amazon before that model reaches
 * anyone. It names the two companies and not the model, as the Register's heading does ("Amazon (OpenAI models)"), so
 * the text stays true when the model served there changes:
 *   - section 5 gains the paragraph "A debate model through Amazon": the contract is with Amazon Web Services EMEA
 *     SARL in Luxembourg, the model runs in the United States, OpenAI does not receive the text, neither Amazon nor
 *     OpenAI may train on it, and Amazon keeps nothing except requests its automatic abuse filter flags, for up to 30
 *     days;
 *   - the sentence that says whose terms forbid training names Amazon beside DeepInfra and Anthropic, in the summary
 *     and in sections 4 and 5;
 *   - the transfers paragraph says that Amazon relies on the EU–US Data Privacy Framework, with the standard
 *     contractual clauses in its terms for any transfer the Framework does not cover.
 * The Register's entry for Amazon (pages.ts AMAZON_BEDROCK_PROVIDER) carries the same facts. English, Romanian and
 * French, the languages the release offers, carry the wording and the 3.16 history entry; every other language carries
 * only the new number. Nobody has to accept again: the floors stay 3.2 / 1.0.
 *
 * Every language's 3.16 draft is its 3.15 draft (whose sha256 the manifest held at 3.15) plus the swaps in
 * legalPrivacy316.json, generated from the two texts: each pair is [3.15 text, 3.16 text], the 3.16 text unique in
 * the draft. `withoutPrivacy316` undoes them, so the checks written for 3.15 and earlier still read a 3.15 text.
 */

/** The day of November 2026 on which 3.16 takes effect, as every language's eyebrow and version line write it. */
export const PRIVACY_316_DAY = "20";

export const PRIVACY_316_ENTRY =
  "Version 3.16 replaced version 3.15: it names Amazon Web Services, which serves one of the debate models, made by OpenAI, in the United States, and says what Amazon keeps and on what basis the data is transferred (sections 4 and 5).";

type Swaps = Readonly<Record<string, Readonly<{ sha256: string; swaps: readonly (readonly [string, string])[] }>>>;

export const PRIVACY_316_SWAPS: Swaps = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/support/legalPrivacy316.json"), "utf8")
) as Swaps;

/** The sha256 of a language's 3.15 draft, as the manifest recorded it at 3.15. */
export const privacy315Sha256 = (code: string): string => {
  const entry = PRIVACY_316_SWAPS[code];
  if (entry === undefined) throw new Error(`no 3.16 swaps for ${code}`);
  return entry.sha256;
};

/** A language's Privacy Policy as 3.15 wrote it: `text` (its 3.16 draft) with 3.16's swaps undone, last first. */
export const withoutPrivacy316 = (code: string, text: string): string => {
  const entry = PRIVACY_316_SWAPS[code];
  if (entry === undefined) throw new Error(`no 3.16 swaps for ${code}`);
  return [...entry.swaps].reverse().reduce((current, [before, after]) => {
    if (current.split(after).length !== 2) throw new Error(`${code}: the 3.16 text is not there exactly once: ${after.slice(0, 60)}`);
    return current.replace(after, () => before);
  }, text);
};

export const sha256Of = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
