import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Terms of Service 1.0, the launch text, effective 20 November 2026. 1.0 is still the only version, so the corrections
 * made to it before launch change the 1.0 text itself and add no change history: the archived 1.0 copies are rebuilt
 * from the corrected text. The corrections, so that the Terms say what the code and the payment provider's conditions
 * require:
 *   - section 1: we are the merchant, selling in our own name and on our own account and issuing the invoices; not a
 *     marketplace, intermediary or agent; the AI companies are suppliers and NETOPIA Payments processes card payments;
 *   - section 12: its title names payment, delivery, cancellation and refunds, and the paid plans "are" available;
 *   - section 13: how to withdraw, with the Settings button once signed in or by email, and that a withdrawal sent
 *     before the 14 days end is in time;
 *   - Annex A.6, South Korea: each consent is asked on its own, and we send no marketing messages;
 *   - sections 8, 9 and 11: the backups keep copies, some with the keys, so the licence does not end for those copies,
 *     a debate our check deletes is not kept in the live service but can come back with a whole-service restore, and
 *     closing an account makes the data unreadable only in the live service; the record of the consent given before
 *     the first debate is deleted with the account, while the other acceptance and consent records stay. Section 11
 *     said "permanently unreadable".
 *
 * Every language's corrected draft is its first 1.0 draft (whose sha256 the manifest held before the corrections) plus
 * the swaps in legalTerms10.json, generated from the two texts: each pair is [first text, corrected text], the
 * corrected text unique in the draft. English, Romanian and French carry every correction; the other languages carry
 * the day and the section 9 and 11 sentences as first translated, and lag the English until a release offers them.
 * `withoutTerms10Corrections` undoes them, so a check can prove that nothing else changed.
 */

/** The day of November 2026 on which the corrected 1.0 takes effect, as every language's eyebrow and version line write it. */
export const TERMS_10_DAY = "20";

type Swaps = Readonly<Record<string, Readonly<{ sha256: string; swaps: readonly (readonly [string, string])[] }>>>;

export const TERMS_10_SWAPS: Swaps = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/support/legalTerms10.json"), "utf8")
) as Swaps;

/** The sha256 of a language's first 1.0 Terms draft, as the manifest recorded it before the corrections. */
export const firstTerms10Sha256 = (code: string): string => {
  const entry = TERMS_10_SWAPS[code];
  if (entry === undefined) throw new Error(`no 1.0 swaps for ${code}`);
  return entry.sha256;
};

/** A language's Terms as the first 1.0 text wrote them: `text` (its corrected draft) with the swaps undone, last first. */
export const withoutTerms10Corrections = (code: string, text: string): string => {
  const entry = TERMS_10_SWAPS[code];
  if (entry === undefined) throw new Error(`no 1.0 swaps for ${code}`);
  return [...entry.swaps].reverse().reduce((current, [before, after]) => {
    if (current.split(after).length !== 2) throw new Error(`${code}: the corrected text is not there exactly once: ${after.slice(0, 60)}`);
    return current.replace(after, () => before);
  }, text);
};
