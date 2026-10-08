import { renderAccountEmail, type MailDisplay } from "./account-mail-template.mjs";
/** Display only: callers supply the authoritative stored expiry; no validity is computed here. */
export function renderVerificationEmail(input: Readonly<{
  recipient: string;
  verificationUrl: URL;
  expiresAt: Date;
  display: MailDisplay;
}>): { subject: string; text: string; html: string } {
  return renderAccountEmail({ template: "verification-v1", recipient: input.recipient, url: input.verificationUrl, expiresAt: input.expiresAt, display: input.display });
}
