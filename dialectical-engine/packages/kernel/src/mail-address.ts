/**
 * THE ONE ADDRESS RULE (open sign-up mail, PR 2, 2026-10-09).
 *
 * Sign-up, resend, the optional recovery address, email change, the browser's own pre-check and every mail sender
 * (just before the sendmail hand-off) ask this one function, so the site never accepts an address it could not
 * mail: before this, sign-up took addresses the mail step refused, and that account could never be verified.
 *
 * The rule, all ASCII:
 * - at most 254 characters (the SMTP path limit), exactly one `@`;
 * - the local part is a dot-atom of the characters the mail step always allowed (letters, digits and
 *   ! # $ % & ' * + / = ? ^ _ ` { | } ~ -): no empty part, so no leading, trailing or doubled dot; at most 64
 *   characters (RFC 5321); it may not begin with `-`, which a mail program could read as an option. `+label`
 *   is allowed, so the SES mailbox simulator addresses (`success+x@simulator.amazonses.com`) pass;
 * - the domain has at least one dot; each label is letters, digits and inner hyphens, at most 63 characters;
 *   the last label (the top-level domain) is 2 to 24 letters;
 * - the domain is lower-cased in the canonical form. The local part keeps its case here; the account store
 *   lower-cases the whole address later (normalizeEmailForBlindIndex), which never makes a valid address invalid.
 * Separators (`,` `;`), spaces, quotes, angle brackets and control characters can never match, so one address can
 * never fan out to a second mailbox once the mail program parses `To:`.
 *
 * International addresses (IDN), decided 2026-10-09: a domain typed in Unicode (`user@bücher.de`) or a Unicode
 * local part is REFUSED, not converted. The account is found by a keyed digest of the address exactly as stored,
 * so silently storing the punycode form would make the Unicode spelling a different account at sign-in; and a
 * Unicode local part needs SMTPUTF8, which our relay path (Postfix -> SES SMTP) is not set up to promise. An
 * IDN domain written in its ASCII form (`user@xn--bcher-kva.de`) passes, because each label is plain ASCII. An
 * ASCII-form top-level domain (`xn--p1ai`) does not, because the owner's rule is "2 to 24 letters".
 */
const MAX_ADDRESS_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_DOMAIN_LABEL_LENGTH = 63;
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const TOP_LEVEL_LABEL = /^[A-Za-z]{2,24}$/;

/** The one refusal code every entry point answers with, for a malformed address and for a domain that takes no mail. */
export const MAIL_ADDRESS_REFUSAL_CODE = "EMAIL_INVALID" as const;

/** The address with its domain lower-cased, or null when the address breaks the rule above. */
export function canonicalMailAddress(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_ADDRESS_LENGTH) return null;
  const at = value.indexOf("@");
  if (at < 1 || at !== value.lastIndexOf("@")) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length > MAX_LOCAL_PART_LENGTH || local.startsWith("-") || !LOCAL_PART.test(local)) return null;
  const labels = domain.split(".");
  if (labels.length < 2) return null;
  if (labels.some((label) => label.length > MAX_DOMAIN_LABEL_LENGTH || !DOMAIN_LABEL.test(label))) return null;
  if (!TOP_LEVEL_LABEL.test(labels[labels.length - 1]!)) return null;
  return `${local}@${domain.toLowerCase()}`;
}

export function isMailAddress(value: unknown): value is string {
  return canonicalMailAddress(value) !== null;
}

/** The lower-cased domain of an address that passed the rule; the DNS check at the entry points asks about it. */
export function mailAddressDomain(address: string): string {
  const canonical = canonicalMailAddress(address);
  if (canonical === null) throw new TypeError(MAIL_ADDRESS_REFUSAL_CODE);
  return canonical.slice(canonical.indexOf("@") + 1);
}
