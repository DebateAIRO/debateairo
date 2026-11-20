import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Launch starts both legal texts at version 1.0 (owner's decision of 20 November 2026). The pre-launch drafts, Privacy
 * Policy 3.0–3.16 and Terms of Service 1.1 (after the 2.x Terms were already folded into 1.0 on 19 November), were
 * never offered to the public, so the count starts again and the archive keeps none of them:
 *   - every language's eyebrow, end marker and version line say 1.0; the effective dates are unchanged;
 *   - the Terms' section 14 loses its one history entry (1.1); the Privacy Policy's section 14 keeps only its
 *     "last updated" sentence, without the 3.x history after it;
 *   - both re-acceptance floors are 1.0, so an account that accepted any pre-launch version needs nothing more;
 *   - the archive holds only the 1.0 texts of the languages the release offers (en, fr, ro).
 * The wording is otherwise the 3.16 / 1.1 text, byte for byte.
 *
 * Every language's 1.0 draft is its 3.16 / 1.1 draft (whose sha256 the manifest held before the reset) plus the swaps
 * in legalReset10.json, generated from the two texts: each pair is [pre-reset text, 1.0 text], the 1.0 text unique in
 * the draft. `withoutReset10` undoes them, so the checks written for 3.16 / 1.1 and earlier still read the text they
 * were written against.
 */

export type ResetKind = "PRIVACY" | "TERMS";

type Swaps = Readonly<Record<ResetKind, Readonly<Record<string, Readonly<{ sha256: string; swaps: readonly (readonly [string, string])[] }>>>>>;

export const RESET_10_SWAPS: Swaps = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/support/legalReset10.json"), "utf8")
) as Swaps;

const entryOf = (kind: ResetKind, code: string) => {
  const entry = RESET_10_SWAPS[kind][code];
  if (entry === undefined) throw new Error(`no 1.0 reset swaps for ${kind} ${code}`);
  return entry;
};

/** The sha256 of a language's pre-reset draft (Privacy 3.16, Terms 1.1), as the manifest recorded it then. */
export const preReset10Sha256 = (kind: ResetKind, code: string): string => entryOf(kind, code).sha256;

/** A language's draft as it stood before the reset: `text` (its 1.0 draft) with the reset's swaps undone, last first. */
export const withoutReset10 = (kind: ResetKind, code: string, text: string): string =>
  [...entryOf(kind, code).swaps].reverse().reduce((current, [before, after]) => {
    if (current.split(after).length !== 2) throw new Error(`${kind} ${code}: the 1.0 text is not there exactly once: ${after.slice(0, 60)}`);
    return current.replace(after, () => before);
  }, text);

/** `withoutReset10` for a draft file name, as the tests that read `apps/ui/legal/<code>/<file>` name them. */
export const withoutReset10ForFile = (file: string, code: string, text: string): string => {
  if (file === "privacy-policy.md") return withoutReset10("PRIVACY", code, text);
  if (file === "terms-of-service.md") return withoutReset10("TERMS", code, text);
  return text;
};
