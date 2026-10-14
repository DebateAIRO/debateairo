export type MailDisplay = Readonly<{ locale: string; timeZone: string | null }>;
export type AccountMailTemplate = "verification-v1" | "recovery-v1" | "security-scheduled-v1" | "security-cancelled-v1" | "security-completion-v1" | "email-change-confirm-v1" | "email-change-notice-v1" | "email-change-unavailable-v1" | "consumer-recovery-v1" | "security-method-changed-v1" | "security-codes-regenerated-v1" | "security-recovery-proved-v1" | "security-recovery-completed-v1" | "security-recovery-code-used-v1";
/** The caller's copy: the catalogue value of one `auth.acc.*` key in the display locale (copyOf, C12.1). */
export type AccountMailCopy = (key: string) => string;
export type AccountMailInput = Readonly<{ template: AccountMailTemplate; recipient: string; display?: MailDisplay; expiresAt?: Date; url?: URL; newEmail?: string; messageId?: string; copy: AccountMailCopy }>;
export const ACCOUNT_MAIL_BOUNDARY: string;
export const ACCOUNT_MAIL_LOCALES: readonly string[];
export const ACCOUNT_MAIL_TEMPLATES: readonly AccountMailTemplate[];
export function singleRecipient(value: string): boolean;
export function normalizeMailDisplay(display?: MailDisplay): MailDisplay;
export function accountMailRuntime(): string;
export function renderAccountEmail(input: AccountMailInput): Readonly<{ subject: string; text: string; html: string }>;
export function serializeAccountMail(input: AccountMailInput, from: string): string;
