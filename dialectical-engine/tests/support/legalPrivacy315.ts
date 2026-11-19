import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Privacy Policy 3.15, effective 19 November 2026 (3.14's day too). Four corrections, so that the policy says what the
 * code does:
 *   - section 5 names who runs NETOPIA Payments and what we send it with each payment
 *     (packages/payments-netopia/src/requests.ts: billingOf, buildHostedStartBody, buildSavedCardChargeBody; the payer's
 *     IP at a renewal is the profile's paymentIp, else the checkout quote's, apps/api/src/billing/renewal.ts);
 *   - the sensitive-data consent record goes with the account (0078: ON DELETE CASCADE), while legal.acceptance keeps
 *     the other acceptance and consent records for six years after it (0080), so sections 2, 3 and 7 say so and
 *     section 7's one row becomes two;
 *   - the off-host backup copies are never deleted by deploy/vps/backup.sh (`rclone copy` / `scp` only add files), and
 *     each holds the database with the key stores, so the summary and section 7 no longer say "up to 8 weeks" for every
 *     backup, nor that destroyed keys make content unreadable without saying "on our server";
 *   - section 7 gains a row: an account whose sign-up is not finished is deleted 24 hours after it began, or once the
 *     last link sent to it expires if that is later (0183, PR #303: a resend keeps the account while its new link lives);
 *   - section 5 says the Register also lists the payment provider (pages.ts NETOPIA_PROVIDER), and section 6 that a
 *     debate our check deletes comes back only if the whole service is restored from a backup that holds it
 *     (deploy/vps/README.md: a restore brings erased accounts and unpublished debates back).
 * 3.15 was amended in place before it was published (same branch); the archive holds only the amended text.
 * English, Romanian and French, the languages the release offers, gain the 3.15 history entry. Nobody has to accept
 * again: the floors stay 3.2 / 2.1.
 *
 * Every language's 3.15 draft is its 3.14 draft (whose sha256 the manifest held at 3.14) plus the swaps in
 * legalPrivacy315.json, generated from the two texts: each pair is [3.14 text, 3.15 text], the 3.15 text unique in
 * the draft. `withoutPrivacy315` undoes them, so the checks written for 3.14 and earlier still read a 3.14 text.
 */

export const PRIVACY_315_ENTRY =
  "Version 3.15 replaced version 3.14: it says which company runs our payment provider, NETOPIA Payments, what we send it with each payment, and that the Register lists it too (section 5); that the record of your sensitive-data consent is deleted with your account, while the other acceptance and consent records are kept for 6 years after the account ends (sections 2, 3 and 7); that the encrypted copies on our separate backup storage are not deleted automatically, so a deleted debate or a closed account can be restored from them until they are removed, where it said that backups are kept for up to 8 weeks (sections 6 and 7); and that an account whose sign-up is not finished is deleted 24 hours after the sign-up began, or once the last link we sent expires if that is later (section 7).";

type Swaps = Readonly<Record<string, Readonly<{ sha256: string; swaps: readonly (readonly [string, string])[] }>>>;

export const PRIVACY_315_SWAPS: Swaps = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/support/legalPrivacy315.json"), "utf8")
) as Swaps;

/** The sha256 of a language's 3.14 draft, as the manifest recorded it at 3.14. */
export const privacy314Sha256 = (code: string): string => {
  const entry = PRIVACY_315_SWAPS[code];
  if (entry === undefined) throw new Error(`no 3.15 swaps for ${code}`);
  return entry.sha256;
};

/** A language's Privacy Policy as 3.14 wrote it: `text` (its 3.15 draft) with 3.15's swaps undone, last first. */
export const withoutPrivacy315 = (code: string, text: string): string => {
  const entry = PRIVACY_315_SWAPS[code];
  if (entry === undefined) throw new Error(`no 3.15 swaps for ${code}`);
  return [...entry.swaps].reverse().reduce((current, [before, after]) => {
    if (current.split(after).length !== 2) throw new Error(`${code}: the 3.15 text is not there exactly once: ${after.slice(0, 60)}`);
    return current.replace(after, () => before);
  }, text);
};

export const sha256Of = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
