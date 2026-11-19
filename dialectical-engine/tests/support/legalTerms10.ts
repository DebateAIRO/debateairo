import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Terms of Service 1.0, the launch text. 1.0 is still the only version, so the corrections made to it before launch
 * change the 1.0 text itself and add no change history: the archived 1.0 copies are rebuilt from the corrected text.
 * The corrections, so that the Terms say what the code does:
 *   - section 11: closing an account makes the data unreadable only where its keys are destroyed, not in the copies the
 *     backups keep, so the account and private debates can be restored from those copies until they are gone; and the
 *     record of the consent given before the first debate is deleted with the account, while the other acceptance and
 *     consent records stay. It said "permanently unreadable".
 *   - section 9: a debate our check deletes cannot be restored unless the whole service is restored from a backup that
 *     still holds it.
 *
 * Every language's corrected draft is its first 1.0 draft (whose sha256 the manifest held before the corrections) plus
 * the swaps in legalTerms10.json, generated from the two texts: each pair is [first text, corrected text], the
 * corrected text unique in the draft. `withoutTerms10Corrections` undoes them, so a check can prove that nothing else
 * changed.
 */

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
