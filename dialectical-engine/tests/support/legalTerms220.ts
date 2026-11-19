import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Terms of Service 2.20, effective 19 November 2026 (2.19's day too), beside Privacy Policy 3.15
 * (tests/support/legalPrivacy315.ts). Two corrections, so that the Terms say what the code does:
 *   - section 11: closing an account destroys the keys on our server, which makes the data unreadable there; the
 *     encrypted copies on separate backup storage are not deleted automatically (deploy/vps/backup.sh: `rclone copy` /
 *     `scp` only add files), so the account and private debates can be restored from them until the copies are
 *     removed; and the record of the consent given before the first debate is deleted with the account (0078), while
 *     the other acceptance and consent records stay (0080). It said "permanently unreadable".
 *   - section 9: a debate our check deletes cannot be restored unless the whole service is restored from a backup that
 *     still holds it (deploy/vps/README.md: a restore brings erased accounts and unpublished debates back).
 * English, Romanian and French, the languages the release offers, gain the 2.20 history entry. Nobody has to accept
 * again: the change reduces no right (section 14), so the floors stay 3.2 / 2.1.
 *
 * Every language's 2.20 draft is its 2.19 draft (whose sha256 the manifest held at 2.19) plus the swaps in
 * legalTerms220.json, generated from the two texts; `withoutTerms220` undoes them for the checks written for 2.19.
 */

export const TERMS_220_ENTRY =
  "Version 2.20 replaced version 2.19: section 11 says that closing an account makes your account data and your private debates unreadable on our server, that the encrypted copies on our separate backup storage are not deleted automatically, so they can be restored from those copies until the copies are removed, and that the record of the consent you give before your first debate is deleted with your account; and section 9 says that a debate our check deletes cannot be restored unless we restore the whole service from a backup that still holds it.";

type Swaps = Readonly<Record<string, Readonly<{ sha256: string; swaps: readonly (readonly [string, string])[] }>>>;

export const TERMS_220_SWAPS: Swaps = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/support/legalTerms220.json"), "utf8")
) as Swaps;

/** The sha256 of a language's 2.19 Terms draft, as the manifest recorded it at 2.19. */
export const terms219Sha256 = (code: string): string => {
  const entry = TERMS_220_SWAPS[code];
  if (entry === undefined) throw new Error(`no 2.20 swaps for ${code}`);
  return entry.sha256;
};

/** A language's Terms as 2.19 wrote them: `text` (its 2.20 draft) with 2.20's swaps undone, last first. */
export const withoutTerms220 = (code: string, text: string): string => {
  const entry = TERMS_220_SWAPS[code];
  if (entry === undefined) throw new Error(`no 2.20 swaps for ${code}`);
  return [...entry.swaps].reverse().reduce((current, [before, after]) => {
    if (current.split(after).length !== 2) throw new Error(`${code}: the 2.20 text is not there exactly once: ${after.slice(0, 60)}`);
    return current.replace(after, () => before);
  }, text);
};
