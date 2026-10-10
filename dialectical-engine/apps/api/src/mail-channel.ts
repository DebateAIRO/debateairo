import { spawn } from "node:child_process";
import { normalizeMailDisplay, serializeAccountMail, singleRecipient, type MailDisplay, type AccountMailInput } from "./account-mail-template.mjs";
import { randomUUID } from "node:crypto";
import { MailTemplateError, mailAttachmentFactsOf, renderMail as renderTemplatedMail, type MailTemplateId } from "@debateai/mail-templates";
import { buildTemplatedMessage, type MailAttachment } from "./mail-mime.js";
import { isMailAddress } from "@debateai/kernel";
import { OutboundMailRefusal, type MailPurpose, type OutboundMailAuthorizer } from "./outbound-mail-gate.js";

// With `sendmail -t` the MTA reads every recipient out of the header block on
// stdin, so no address reaches argv, which any local user can read with `ps`
// (L7-F7). That moves the trust boundary onto this guard: a `,` or `;` inside
// the address would make the MTA deliver a second copy to a mailbox nobody
// vetted. The shape below rejects whitespace through `\s` but not those
// separators, so each is checked explicitly and stays checked if the shape is
// ever widened. Since 2026-10-09 (open sign-up mail, PR 2) the guard also asks the one shared address rule
// (@debateai/kernel canonicalMailAddress) that sign-up, the recovery address and email change ask, so an
// account can never hold an address this step would refuse. The template's own grammar stays as the floor:
// the shared rule is strictly narrower.
export function isSingleDeliverableRecipient(recipient: string): boolean {
  return singleRecipient(recipient) && isMailAddress(recipient);
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

/**
 * Open sign-up mail PR 3: the outbound mail gate's question, asked by every account-mail sender immediately before
 * it starts the mail program (apps/api/src/outbound-mail-gate.ts). A refusal leaves as the sender's ordinary
 * MailDeliveryError with the gate's content-free code; nothing is spawned.
 */
export async function authorizeOutboundMail(gate: OutboundMailAuthorizer, recipient: string, purpose: MailPurpose): Promise<void> {
  try {
    await gate.authorize({ recipient, purpose });
  } catch (error) {
    if (error instanceof OutboundMailRefusal) throw new MailDeliveryError(error.code);
    throw new MailDeliveryError("OUTBOUND_MAIL_GATE_UNAVAILABLE");
  }
}

/** Every Sendmail* sender must be built with the gate: no default, so a composition cannot forget it. */
export function isOutboundMailAuthorizer(value: unknown): value is OutboundMailAuthorizer {
  return typeof value === "object" && value !== null && typeof (value as { authorize?: unknown }).authorize === "function";
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
    readonly gate: OutboundMailAuthorizer;
  }) {
    if (!/^noreply@[A-Za-z0-9.-]+$/.test(options.from)
      || !isOutboundMailAuthorizer(options.gate)
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
    await sendRenderedMail(message, this.options, { recipient: mail.recipient, purpose: "verification" });
  }
}

export class SendmailSecurityNotificationSender implements SecurityNotificationSender {
  constructor(private readonly options: {
    readonly executable:string;
    readonly from:string;
    readonly timeoutMs:number;
    readonly gate:OutboundMailAuthorizer;
  }) {
    if (!/^noreply@[A-Za-z0-9.-]+$/.test(options.from)
      || !isOutboundMailAuthorizer(options.gate)
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
    await sendRenderedMail(message, this.options, { recipient: mail.recipient, purpose: "account-erasure-notice" });
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
  gate: OutboundMailAuthorizer;
  /** Recovery retains its original fixed exit diagnostic; email change keeps detailed codes. */
  exitFailureCode?: "SENDMAIL_EXIT_FAILED";
}>;

/** Process lifecycle only: each sender validates and renders its own mail; the gate is asked here, last, before the spawn. */
async function sendRenderedMail(
  message: string,
  options: SendmailTransportOptions,
  admission: Readonly<{ recipient: string; purpose: MailPurpose }>
): Promise<void> {
  await authorizeOutboundMail(options.gate, admission.recipient, admission.purpose);
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
    readonly gate: OutboundMailAuthorizer;
  }) {
    if (!/^noreply@[A-Za-z0-9.-]+$/.test(options.from)
      || !isOutboundMailAuthorizer(options.gate)
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
    // The notice goes to the CURRENT address about a change to the account: security mail, inside the reserve.
    const purpose: MailPurpose = mail.kind === "confirmation" ? "email-change-confirmation"
      : mail.kind === "notice" ? "email-change-notice" : "email-change-unavailable";
    await sendRenderedMail(renderMail(input, this.options.from), this.options, { recipient: mail.recipient, purpose });
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
    readonly gate: OutboundMailAuthorizer;
  }) {
    if (!/^noreply@[A-Za-z0-9.-]+$/.test(options.from) || !isOutboundMailAuthorizer(options.gate) || !options.executable.trim() || !isPublicAppUrl(options.publicAppUrl) || !Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)
      throw new TypeError("OWN_MAIL_CONFIGURATION_INVALID");
  }
  async sendRecoveryEmail(mail: RecoveryEmailMail): Promise<void> {
    if (!isSingleDeliverableRecipient(mail.recipient) || !(mail.expiresAt instanceof Date) || !Number.isFinite(mail.expiresAt.getTime()))
      throw new MailDeliveryError("MAIL_INPUT_INVALID");
    const message = renderMail({ template: "recovery-v1", recipient: mail.recipient, url: new URL(recoveryEmailLink(this.options.publicAppUrl, mail.token)), expiresAt: mail.expiresAt }, this.options.from);
    await sendRenderedMail(message, {
      ...this.options, exitFailureCode: "SENDMAIL_EXIT_FAILED"
    }, { recipient: mail.recipient, purpose: "recovery-email-confirmation" });
  }
}

export type ConsumerSecurityNoticeKind='METHOD_CHANGED'|'CODES_REGENERATED'|'RECOVERY_PROVED'|'RECOVERY_COMPLETED'|'RECOVERY_CODE_USED';
export interface ConsumerSecurityNoticeSender {
  sendConsumerSecurityNotice(mail:Readonly<{recipient:string;messageId:string;eventKind:ConsumerSecurityNoticeKind;happenedAt:Date}>):Promise<void>;
}
/** Task9 purposes require their reviewed wrapper/template revision at deployment. */
export class SendmailConsumerAccountSender implements ConsumerSecurityNoticeSender {
  constructor(private readonly options:Readonly<{executable:string;from:string;timeoutMs:number;publicAppUrl:string;gate:OutboundMailAuthorizer}>){
    if(!/^noreply@[A-Za-z0-9.-]+$/.test(options.from)||!isOutboundMailAuthorizer(options.gate)||!options.executable.trim()||!Number.isInteger(options.timeoutMs)||options.timeoutMs<1||!isPublicAppUrl(options.publicAppUrl))throw new TypeError('OWN_MAIL_CONFIGURATION_INVALID');
  }
  async sendRecovery(mail:Readonly<{recipient:string;token:string;expiresAt:Date}>):Promise<void>{
    if(!isSingleDeliverableRecipient(mail.recipient)||!/^[A-Za-z0-9_-]{43}$/.test(mail.token))throw new MailDeliveryError('MAIL_INPUT_INVALID');
    const url=new URL('/recover',this.options.publicAppUrl);url.hash='token='+mail.token;
    await sendRenderedMail(renderMail({template:'consumer-recovery-v1',recipient:mail.recipient,url,expiresAt:mail.expiresAt},this.options.from),this.options,{recipient:mail.recipient,purpose:'consumer-recovery'});
  }
  async sendConsumerSecurityNotice(mail:Readonly<{recipient:string;messageId:string;eventKind:ConsumerSecurityNoticeKind;happenedAt:Date}>):Promise<void>{
    const templates={METHOD_CHANGED:'security-method-changed-v1',CODES_REGENERATED:'security-codes-regenerated-v1',RECOVERY_PROVED:'security-recovery-proved-v1',RECOVERY_COMPLETED:'security-recovery-completed-v1',RECOVERY_CODE_USED:'security-recovery-code-used-v1'} as const;
    const template=templates[mail.eventKind];if(!template)throw new MailDeliveryError('MAIL_INPUT_INVALID');
    await sendRenderedMail(renderMail({template,recipient:mail.recipient,messageId:mail.messageId,expiresAt:mail.happenedAt},this.options.from),this.options,{recipient:mail.recipient,purpose:'consumer-security-notice'});
  }
}

/** Spec 2026-09-29 §2.5.10: one templated email over the same `sendmail -i -t -f` path as the mail above. */
export interface TemplatedMail {
  readonly to: string;
  readonly templateId: MailTemplateId;
  readonly locale: string;
  readonly params: Readonly<Record<string, string>>;
  readonly attachments?: ReadonlyArray<MailAttachment>;
  /** A uuid v4 the caller persists (its outbox job id), so a retried send carries the same Message-ID. */
  readonly messageId?: string;
}

export interface TemplatedMailChannel {
  sendTemplated(mail: TemplatedMail): Promise<void>;
}

const TEMPLATED_MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function composeTemplatedMessage(from: string, mail: TemplatedMail, boundary: string): string {
  if (!isSingleDeliverableRecipient(mail.to)
    || (mail.messageId !== undefined && !TEMPLATED_MESSAGE_ID.test(mail.messageId))) {
    throw new MailDeliveryError("MAIL_INPUT_INVALID");
  }
  const attachments = mail.attachments ?? [];
  const attachmentBytes = attachments.reduce((sum, attachment) => sum + attachment.content.byteLength, 0);
  if (attachments.length > 4 || attachmentBytes > 8 * 1024 * 1024) {
    throw new MailDeliveryError("MAIL_ATTACHMENTS_TOO_LARGE");
  }
  let rendered: ReturnType<typeof renderTemplatedMail>;
  try {
    // The wording follows what this message REALLY carries: P7's EMAIL job drops a resolver's null, so a Terms
    // version the archive does not hold, or a PDF SmartBill could not give, is simply absent here, and the sentence
    // says so.
    rendered = renderTemplatedMail(mail.templateId, mail.locale, mail.params, { attached: mailAttachmentFactsOf(attachments) });
  } catch (error) {
    if (error instanceof MailTemplateError) throw new MailDeliveryError(error.code);
    throw error;
  }
  try {
    return buildTemplatedMessage({
      from, to: mail.to, messageId: mail.messageId ?? null, ...rendered, attachments, boundary
    });
  } catch {
    throw new MailDeliveryError("MAIL_INPUT_INVALID");
  }
}

export class TemplatedMailSender implements TemplatedMailChannel {
  constructor(private readonly options: {
    readonly executable: string;
    readonly from: string;
    readonly timeoutMs: number;
    readonly gate: OutboundMailAuthorizer;
  }) {
    if (!/^noreply@[A-Za-z0-9.-]+$/.test(options.from)
      || !isOutboundMailAuthorizer(options.gate)
      || options.executable.trim() === ""
      || !Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
      throw new TypeError("OWN_MAIL_CONFIGURATION_INVALID");
    }
  }

  async sendTemplated(mail: TemplatedMail): Promise<void> {
    const message = composeTemplatedMessage(this.options.from, mail, randomUUID().replaceAll("-", ""));
    await authorizeOutboundMail(this.options.gate, mail.to, "templated");
    // The same spawn as the two senders above, argv literal for argv literal: the recipient rides in the header
    // block (-t), never on argv (L7-F7; pinned by tests/architecture/dev-mail-capture.test.ts).
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.options.executable, ["-i", "-t", "-f", this.options.from], {
        stdio: ["pipe", "ignore", "ignore"]
      });
      let settled = false;
      const fail = (code: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new MailDeliveryError(code));
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        fail("SENDMAIL_TIMEOUT");
      }, this.options.timeoutMs);
      child.once("error", () => fail("SENDMAIL_EXEC_FAILED"));
      child.once("exit", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new MailDeliveryError(
          signal === null ? `SENDMAIL_EXIT_${String(code ?? "UNKNOWN")}` : `SENDMAIL_SIGNAL_${signal}`
        ));
      });
      child.stdin.once("error", () => fail("SENDMAIL_STDIN_FAILED"));
      child.stdin.end(message, "utf8");
    });
  }
}

/** Tests and the development stack: renders exactly what sendmail would receive, and keeps it. */
export class MemoryTemplatedMailSender implements TemplatedMailChannel {
  readonly messages: Array<Readonly<{ mail: TemplatedMail; raw: string }>> = [];

  constructor(private readonly from: string = "noreply@debateai.test") {}

  async sendTemplated(mail: TemplatedMail): Promise<void> {
    const raw = composeTemplatedMessage(this.from, mail, "memory0000000000");
    this.messages.push(Object.freeze({ mail, raw }));
  }
}
