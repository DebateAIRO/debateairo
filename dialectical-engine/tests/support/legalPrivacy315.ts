import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Privacy Policy 3.15, effective 20 November 2026. Nothing between 3.14 and this text was shown to anyone, so 3.15 is
 * one version holding every correction made since 3.14, so that the policy says what the code and the contracts do:
 *   - section 5 names who runs NETOPIA Payments, what we send it with each payment and with the check of a new card,
 *     what it sees on its own page and tells us back, where its own notice for payers is, and that its logo is loaded
 *     from its server; the Register lists it too (pages.ts NETOPIA_PROVIDER), and the Article 28 sentences no longer
 *     count NETOPIA among the companies that act only on our instructions;
 *   - Cloudflare only runs the bot check, and is responsible in its own right for what that check collects;
 *   - we issue the invoices ourselves, as the seller, through SmartBill or Quaderno; section 4 gives the legal basis
 *     for taking payment; paid plans are no longer "to start"; every page is served over HTTPS (section 9); we use no
 *     advertising or analytics trackers (section 13); the other recipients are "companies", not "processors";
 *   - the sensitive-data consent record goes with the account (0078: ON DELETE CASCADE), while legal.acceptance keeps
 *     the other acceptance and consent records for six years after it (0080), so section 7's one row becomes two;
 *   - an account whose sign-up is not finished is deleted 24 hours after it began, or once the last link sent to it
 *     expires if that is later (0183), a new row in section 7;
 *   - the backups: there is no separate encrypted backup storage. The server keeps its nightly database copies and the
 *     copies each upload makes, some with the key stores, and OVHcloud keeps its own backup of the whole disk, keys
 *     included; we encrypt none of them, nothing logs access to them, and closing an account or deleting a debate
 *     makes data unreadable only in the live service (summary, sections 3, 5, 6, 7, 8 and 9).
 * English, Romanian and French, the languages the release offers, gain the one 3.15 history entry. Nobody has to accept
 * again: the floors stay 3.2 / 1.0.
 *
 * Every language's 3.15 draft is its 3.14 draft (whose sha256 the manifest held at 3.14) plus the swaps in
 * legalPrivacy315.json, generated from the two texts: each pair is [3.14 text, 3.15 text], the 3.15 text unique in
 * the draft. `withoutPrivacy315` undoes them, so the checks written for 3.14 and earlier still read a 3.14 text.
 */

/** The day of November 2026 on which 3.15 takes effect, as every language's eyebrow and version line write it. */
export const PRIVACY_315_DAY = "20";

export const PRIVACY_315_ENTRY =
  "Version 3.15 replaced version 3.14: it says which company runs our payment provider, NETOPIA Payments, what we send it with each payment, and that the Register lists it too (section 5); that the record of your sensitive-data consent is deleted with your account, while the other acceptance and consent records are kept for 6 years after the account ends (sections 2, 3 and 7); which copies our backups keep, on our server and at OVHcloud, that we do not encrypt them ourselves and keep no log of access to them, and that some of them hold the keys together with the data, so that closing your account or deleting a debate makes the data unreadable only in the live service, and a closed account or a deleted debate can come back if we restore the whole service from a copy that still holds it, where it said that our backups are encrypted before they leave our server, that OVHcloud cannot read them and that they are kept for up to 8 weeks and then overwritten (sections 3, 5, 6, 7, 8 and 9); and that an account whose sign-up is not finished is deleted 24 hours after the sign-up began, or once the last link we sent expires if that is later (section 7). Section 4 also gives the legal basis for taking payment for your plan. Section 5 also says that we issue your invoices and credit notes ourselves, as the seller, through our invoicing services; that your full card number and security code never reach us; that NETOPIA Payments also sees your IP address and browser details on its payment page, receives from us the same details when you check a new card as with a payment, and tells us whether a payment or a card check went through; that NETOPIA's own notice for payers, not this policy, says how and in what role NETOPIA uses your data, so section 5 no longer counts NETOPIA among the companies that act only on our instructions; and that when a page shows NETOPIA's logo, your browser loads it from NETOPIA's server. Section 5 also says that Cloudflare runs the bot check and is responsible in its own right for what that check collects, which it uses to improve its bot detection, and no longer says that it delivers our pages or carries traffic between you and the service, or that we do not send your data to a company that would use it for its own purposes. Section 9 says that every page of the site is served over HTTPS. Section 13 says that we use no advertising or analytics trackers, and which other companies receive requests from your browser through our pages. The policy no longer speaks of paid plans as something still to start (sections 2, 4, 5 and 7), and section 5 and Annex B.4 call the other recipients companies, not processors.";

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
