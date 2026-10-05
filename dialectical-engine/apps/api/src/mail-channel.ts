import { spawn } from "node:child_process";
import { normalizeMailDisplay, serializeAccountMail, singleRecipient, type MailDisplay, type AccountMailInput } from "./account-mail-template.mjs";

// With `sendmail -t` the MTA reads every recipient out of the header block on
// stdin, so no address reaches argv, which any local user can read with `ps`
// (L7-F7). That moves the trust boundary onto this guard: a `,` or `;` inside
// the address would make the MTA deliver a second copy to a mailbox nobody
// vetted. The shape below rejects whitespace through `\s` but not those
// separators, so each is checked explicitly and stays checked if the shape is
// ever widened.
export function isSingleDeliverableRecipient(recipient: string): boolean {
  return singleRecipient(recipient);
}

/** Composition-owned URL only; public display metadata never supplies an origin. */
function isPublicAppUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return !/[\u0000-\u0020\u007f]/.test(value) && url.protocol === "https:"
      && url.username === "" && url.password === "" && url.search === "" && url.hash === "";
  } catch { return false; }
}

/** Render validation errors stay opaque at the transport boundary. */
function renderMail(input: AccountMailInput, from: string): string {
  try { return serializeAccountMail(input, from); }
  catch { throw new MailDeliveryError("MAIL_INPUT_INVALID"); }
}

export interface VerificationMail {
  readonly attemptId: string;
  readonly recipient: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly display?: MailDisplay;
}

export interface MailSender {
  sendVerification(mail: VerificationMail): Promise<void>;
}

export interface SecurityNotificationMail {
  readonly messageId:string;
  readonly recipient:string;
  readonly eventKind:"SCHEDULED"|"CANCELLED"|"COMPLETION";
  readonly executeAt:Date;
}

export interface SecurityNotificationSender {
  sendSecurityNotification(mail:SecurityNotificationMail):Promise<void>;
}

export class MailDeliveryError extends Error {
  constructor(readonly operatorCode: string) {
    if (!/^[A-Z0-9_:-]{1,96}$/.test(operatorCode)) {
      throw new TypeError("MAIL_OPERATOR_CODE_INVALID");
    }
    super(operatorCode);
    this.name = "MailDeliveryError";
  }
}

export class MemoryMailSender implements MailSender {
  readonly messages: VerificationMail[] = [];

  async sendVerification(mail: VerificationMail): Promise<void> {
    this.messages.push(Object.freeze({ ...mail, display: normalizeMailDisplay(mail.display) }));
  }
}

export class SendmailMailSender implements MailSender {
  constructor(private readonly options: {
    readonly executable: string;
    readonly from: string;
    readonly publicAppUrl: string;
    readonly timeoutMs: number;
  }) {
    if (!/^noreply@[A-Za-z0-9.-]+$/.test(options.from)
      || options.executable.trim() === ""
      || !isPublicAppUrl(options.publicAppUrl)
      || !Number.isInteger(options.timeoutMs)
      || options.timeoutMs <= 0) {
      throw new TypeError("OWN_MAIL_CONFIGURATION_INVALID");
    }
  }

  async sendVerification(mail: VerificationMail): Promise<void> {
    if (!isSingleDeliverableRecipient(mail.recipient)
      || !/^[A-Za-z0-9_-]{43}$/.test(mail.token)) {
      throw new MailDeliveryError("MAIL_INPUT_INVALID");
    }
    // The bearer rides in the URL fragment: browsers never send it to the
    // server, so it cannot reach a proxy or access log (L3-F8). The token
    // grammar above is fragment-safe verbatim; nothing is percent-encoded.
    const verificationUrl = new URL("/verify-email", this.options.publicAppUrl);
    verificationUrl.hash = `token=${mail.token}`;
    const message = renderMail({ template: "verification-v1", recipient: mail.recipient, url: verificationUrl, expiresAt: mail.expiresAt, ...(mail.display === undefined ? {} : { display: mail.display }) }, this.options.from);
    await sendRenderedMail(message, this.options);
  }
}

export class SendmailSecurityNotificationSender implements SecurityNotificationSender {
  constructor(private readonly options: {
    readonly executable:string;
    readonly from:string;
    readonly timeoutMs:number;
  }) {
    if (!/^noreply@[A-Za-z0-9.-]+$/.test(options.from)
      || options.executable.trim()===""
      || !Number.isInteger(options.timeoutMs) || options.timeoutMs<=0) {
      throw new TypeError("OWN_MAIL_CONFIGURATION_INVALID");
    }
  }

  async sendSecurityNotification(mail:SecurityNotificationMail):Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(mail.messageId)
      || !isSingleDeliverableRecipient(mail.recipient)
      || !(mail.executeAt instanceof Date)
      || !Number.isFinite(mail.executeAt.getTime())) {
      throw new MailDeliveryError("MAIL_INPUT_INVALID");
    }
    const templates = { SCHEDULED: "security-scheduled-v1", CANCELLED: "security-cancelled-v1", COMPLETION: "security-completion-v1" } as const;
    const template = templates[mail.eventKind];
    if (template === undefined) throw new MailDeliveryError("MAIL_INPUT_INVALID");
    const message = renderMail({ template, recipient: mail.recipient, expiresAt: mail.executeAt, messageId: mail.messageId }, this.options.from);
    await sendRenderedMail(message, this.options);
  }
}

// Turn 14 — change email. Three purpose-specific alternatives through `sendmail -t`:
// the confirmation link to the NEW address, a notice with a cancel link to the
// CURRENT address, and, when the new address already belongs to an account, a
// note to that address instead of a link (the requester is never told). Both
// bearers ride the URL fragment of the Settings page, like the verify link.
export type EmailChangeMail =
  | Readonly<{ kind: "confirmation"; recipient: string; token: string; expiresAt: Date }>
  | Readonly<{ kind: "notice"; recipient: string; newEmail: string; cancelToken: string; expiresAt: Date }>
  | Readonly<{ kind: "address-unavailable"; recipient: string }>;

export interface EmailChangeMailSender {
  sendEmailChange(mail: EmailChangeMail): Promise<void>;
}

export class MemoryEmailChangeMailSender implements EmailChangeMailSender {
  readonly messages: EmailChangeMail[] = [];

  async sendEmailChange(mail: EmailChangeMail): Promise<void> {
    this.messages.push(Object.freeze({ ...mail }));
  }
}

const EMAIL_CHANGE_BEARER = /^[A-Za-z0-9_-]{43}$/;

export function emailChangeLink(publicAppUrl: string, action: "confirm" | "cancel", token: string): string {
  if (!EMAIL_CHANGE_BEARER.test(token)) throw new MailDeliveryError("MAIL_INPUT_INVALID");
  const url = new URL("/settings", publicAppUrl);
  url.hash = `email-change=${action}&token=${token}`;
  return url.toString();
}

type SendmailTransportOptions = Readonly<{
  executable: string;
  from: string;
  timeoutMs: number;
  /** Recovery retains its original fixed exit diagnostic; email change keeps detailed codes. */
  exitFailureCode?: "SENDMAIL_EXIT_FAILED";
}>;

/** Process lifecycle only: each sender validates and renders its own mail. */
async function sendRenderedMail(message: string, options: SendmailTransportOptions): Promise<void> {
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(options.executable, ["-i", "-t", "-f", options.from], {
      stdio: ["pipe", "ignore", "ignore"]
    });
  } catch {
    throw new MailDeliveryError("SENDMAIL_EXEC_FAILED");
  }
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (code: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new MailDeliveryError(code));
    };
    const timer = setTimeout(() => {
      // Claim timeout before kill can synchronously deliver another process event.
      fail("SENDMAIL_TIMEOUT");
      try { child.kill("SIGKILL"); } catch { /* Timeout remains the delivery outcome. */ }
    }, options.timeoutMs);
    child.once("error", () => fail("SENDMAIL_EXEC_FAILED"));
    child.once("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new MailDeliveryError(options.exitFailureCode
        ?? (signal === null ? `SENDMAIL_EXIT_${String(code ?? "UNKNOWN")}` : `SENDMAIL_SIGNAL_${signal}`)));
    });
    if (child.stdin === null) {
      fail("SENDMAIL_STDIN_FAILED");
      return;
    }
    child.stdin.once("error", () => fail("SENDMAIL_STDIN_FAILED"));
    try { child.stdin.end(message, "utf8"); } catch { fail("SENDMAIL_STDIN_FAILED"); }
  });
}

export class SendmailEmailChangeMailSender implements EmailChangeMailSender {
  constructor(private readonly options: {
    readonly executable: string;
    readonly from: string;
    readonly publicAppUrl: string;
    readonly timeoutMs: number;
  }) {
    if (!/^noreply@[A-Za-z0-9.-]+$/.test(options.from)
      || options.executable.trim() === ""
      || !isPublicAppUrl(options.publicAppUrl)
      || !Number.isInteger(options.timeoutMs)
      || options.timeoutMs <= 0) {
      throw new TypeError("OWN_MAIL_CONFIGURATION_INVALID");
    }
  }

  async sendEmailChange(mail: EmailChangeMail): Promise<void> {
    if (!isSingleDeliverableRecipient(mail.recipient)
      || (mail.kind === "notice" && !isSingleDeliverableRecipient(mail.newEmail))) {
      throw new MailDeliveryError("MAIL_INPUT_INVALID");
    }
    const input: AccountMailInput = mail.kind === "confirmation"
      ? { template: "email-change-confirm-v1", recipient: mail.recipient, expiresAt: mail.expiresAt, url: new URL(emailChangeLink(this.options.publicAppUrl, "confirm", mail.token)) }
      : mail.kind === "notice"
        ? { template: "email-change-notice-v1", recipient: mail.recipient, newEmail: mail.newEmail, expiresAt: mail.expiresAt, url: new URL(emailChangeLink(this.options.publicAppUrl, "cancel", mail.cancelToken)) }
        : { template: "email-change-unavailable-v1", recipient: mail.recipient };
    await sendRenderedMail(renderMail(input, this.options.from), this.options);
  }
}

export type RecoveryEmailMail = Readonly<{
  kind: "confirmation";
  recipient: string;
  token: string;
  expiresAt: Date;
}>;
export interface RecoveryEmailMailSender {
  sendRecoveryEmail(mail: RecoveryEmailMail): Promise<void>;
}
export class MemoryRecoveryEmailMailSender implements RecoveryEmailMailSender {
  readonly messages: RecoveryEmailMail[] = [];
  async sendRecoveryEmail(mail: RecoveryEmailMail): Promise<void> {
    this.messages.push(Object.freeze({
      ...mail
    }));
  }
}
export function recoveryEmailLink(publicAppUrl: string, token: string): string {
  if (!EMAIL_CHANGE_BEARER.test(token))
    throw new MailDeliveryError("MAIL_INPUT_INVALID");
  const url = new URL("/verify-recovery-email", publicAppUrl);
  url.hash = `token=${token}`;
  return url.toString();
}
/** Narrow adapter; delivery remains governed by the configured mail transport. */
export class SendmailRecoveryEmailMailSender implements RecoveryEmailMailSender {
  constructor(private readonly options: {
    readonly executable: string;
    readonly from: string;
    readonly publicAppUrl: string;
    readonly timeoutMs: number;
  }) {
    if (!/^noreply@[A-Za-z0-9.-]+$/.test(options.from) || !options.executable.trim() || !isPublicAppUrl(options.publicAppUrl) || !Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)
      throw new TypeError("OWN_MAIL_CONFIGURATION_INVALID");
  }
  async sendRecoveryEmail(mail: RecoveryEmailMail): Promise<void> {
    if (!isSingleDeliverableRecipient(mail.recipient) || !(mail.expiresAt instanceof Date) || !Number.isFinite(mail.expiresAt.getTime()))
      throw new MailDeliveryError("MAIL_INPUT_INVALID");
    const message = renderMail({ template: "recovery-v1", recipient: mail.recipient, url: new URL(recoveryEmailLink(this.options.publicAppUrl, mail.token)), expiresAt: mail.expiresAt }, this.options.from);
    await sendRenderedMail(message, {
      ...this.options, exitFailureCode: "SENDMAIL_EXIT_FAILED"
    });
  }
}

export type ConsumerSecurityNoticeKind='METHOD_CHANGED'|'CODES_REGENERATED'|'RECOVERY_PROVED'|'RECOVERY_COMPLETED';
export interface ConsumerSecurityNoticeSender {
  sendConsumerSecurityNotice(mail:Readonly<{recipient:string;messageId:string;eventKind:ConsumerSecurityNoticeKind;happenedAt:Date}>):Promise<void>;
}
/** Task9 purposes require their reviewed wrapper/template revision at deployment. */
export class SendmailConsumerAccountSender implements ConsumerSecurityNoticeSender {
  constructor(private readonly options:Readonly<{executable:string;from:string;timeoutMs:number;publicAppUrl:string}>){
    if(!/^noreply@[A-Za-z0-9.-]+$/.test(options.from)||!options.executable.trim()||!Number.isInteger(options.timeoutMs)||options.timeoutMs<1||!isPublicAppUrl(options.publicAppUrl))throw new TypeError('OWN_MAIL_CONFIGURATION_INVALID');
  }
  async sendRecovery(mail:Readonly<{recipient:string;token:string;expiresAt:Date}>):Promise<void>{
    if(!isSingleDeliverableRecipient(mail.recipient)||!/^[A-Za-z0-9_-]{43}$/.test(mail.token))throw new MailDeliveryError('MAIL_INPUT_INVALID');
    const url=new URL('/recover',this.options.publicAppUrl);url.hash='token='+mail.token;
    await sendRenderedMail(renderMail({template:'consumer-recovery-v1',recipient:mail.recipient,url,expiresAt:mail.expiresAt},this.options.from),this.options);
  }
  async sendConsumerSecurityNotice(mail:Readonly<{recipient:string;messageId:string;eventKind:ConsumerSecurityNoticeKind;happenedAt:Date}>):Promise<void>{
    const templates={METHOD_CHANGED:'security-method-changed-v1',CODES_REGENERATED:'security-codes-regenerated-v1',RECOVERY_PROVED:'security-recovery-proved-v1',RECOVERY_COMPLETED:'security-recovery-completed-v1'} as const;
    const template=templates[mail.eventKind];if(!template)throw new MailDeliveryError('MAIL_INPUT_INVALID');
    await sendRenderedMail(renderMail({template,recipient:mail.recipient,messageId:mail.messageId,expiresAt:mail.happenedAt},this.options.from),this.options);
  }
}
