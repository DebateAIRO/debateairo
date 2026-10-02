import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { archivedDocument } from "@debateai/legal-manifest";
import {
  MAIL_LOCALES,
  TERMS_ATTACHMENT_FILENAME,
  WITHDRAWAL_FORM_ATTACHMENT_FILENAME,
  renderWithdrawalForm
} from "@debateai/mail-templates";
import type { BillingAudit } from "./billing/audit.js";
import type { AttachmentResolver, BillingAttachmentKind } from "./billing/email-job.js";
import type { MailAttachment } from "./mail-mime.js";

/**
 * The legal drafts and their archive, found from this module (apps/api/src → apps/ui/legal) and never through a
 * machine path. The API runs from the repository tree (deploy/vps/systemd/debateai-api.service WorkingDirectory).
 */
export function defaultLegalRoot(): URL {
  return new URL("../../ui/legal/", import.meta.url);
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Ruling Q-3: L2 archives every published Terms version as `archive/<locale>/<sha256>.md` under the legal root, the
 * file name being the sha256 of its exact bytes. Callers pass a checked locale and hash.
 */
export function termsArchivePath(locale: string, sha256: string): string {
  return `archive/${locale}/${sha256}.md`;
}

/** The Terms attachment: its content is the archived file's own Buffer, read once and checked against its hash. */
export type TermsAttachment = MailAttachment & Readonly<{ content: Buffer }>;

/**
 * M1's attachment (AMENDMENTS-R1 A26(b), spec §2.5.10, ruling Q-3): the Terms text the person ACCEPTED, in the locale
 * they accepted it in, read from the archive by the acceptance row's `document_sha256`. It is returned only when the
 * archived bytes hash to that name, so a later Terms version never stands in for the accepted one. With no such file
 * it returns null: the email then says only where the current Terms are (`mail.M1.termsCurrent`), and
 * `billingMailAttachmentResolvers` logs the content-free code MAIL_TERMS_NOT_ARCHIVED.
 */
export async function acceptedTermsAttachment(input: Readonly<{
  locale: string;
  expectedSha256: string;
  legalRoot?: URL;
}>): Promise<TermsAttachment | null> {
  if (!(MAIL_LOCALES as readonly string[]).includes(input.locale) || !SHA256_HEX.test(input.expectedSha256)) {
    return null;
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(new URL(termsArchivePath(input.locale, input.expectedSha256), input.legalRoot ?? defaultLegalRoot()));
  } catch {
    return null;
  }
  if (createHash("sha256").update(bytes).digest("hex") !== input.expectedSha256) return null;
  return Object.freeze({ filename: TERMS_ATTACHMENT_FILENAME, contentType: "text/plain; charset=UTF-8", content: bytes });
}

export function withdrawalFormAttachment(locale: string): MailAttachment {
  return Object.freeze({
    filename: WITHDRAWAL_FORM_ATTACHMENT_FILENAME,
    contentType: "text/plain; charset=UTF-8",
    content: Buffer.from(renderWithdrawalForm(locale), "utf8")
  });
}

/**
 * The two attachments this task owns, keyed as P7's EMAIL job names them (P10b adds SMARTBILL_INVOICE_PDF to the same
 * map inside the runtime). ACCEPTED_TERMS reads the fields P9b copied from the owner's latest TERMS acceptance row
 * (`sha256`, `locale`; `{}` when there is no row), asks the manifest's archive for that text (ruling Q-3: the
 * manifest maps each sha256 to its archive path; L2's `archivedDocument`), and attaches that version from the
 * archive, checked against its hash. It never reads the current draft, the current manifest entry or the email's
 * locale: L4 asks for re-acceptance only below a floor, so the current Terms are NOT necessarily the version accepted.
 */
export function billingMailAttachmentResolvers(options: Readonly<{
  legalRoot?: URL;
  audit?: BillingAudit;
}> = {}): ReadonlyMap<BillingAttachmentKind, AttachmentResolver> {
  const missing = (code: "MAIL_TERMS_NOT_RECORDED" | "MAIL_TERMS_NOT_ARCHIVED"): null => {
    options.audit?.("billing.mail.attachment_missing", { kind: "ACCEPTED_TERMS", code });
    return null;
  };
  return new Map<BillingAttachmentKind, AttachmentResolver>([
    ["ACCEPTED_TERMS", async (fields) => {
      const { sha256, locale } = fields;
      if (sha256 === undefined || locale === undefined || !SHA256_HEX.test(sha256)
        || !(MAIL_LOCALES as readonly string[]).includes(locale)) {
        return missing("MAIL_TERMS_NOT_RECORDED");
      }
      // The manifest's archive is the list of published texts; a file it does not list is never attached.
      if (archivedDocument("TERMS", locale, sha256) === null) return missing("MAIL_TERMS_NOT_ARCHIVED");
      const attachment = await acceptedTermsAttachment({
        locale, expectedSha256: sha256, ...(options.legalRoot === undefined ? {} : { legalRoot: options.legalRoot })
      });
      return attachment ?? missing("MAIL_TERMS_NOT_ARCHIVED");
    }],
    ["WITHDRAWAL_FORM", async (_fields, locale) => withdrawalFormAttachment(locale)]
  ]);
}
