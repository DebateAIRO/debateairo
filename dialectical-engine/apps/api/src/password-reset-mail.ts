import type { RecoveryMailWork } from "./registration.js";
import { spawn } from "node:child_process";
import { decrypt, type ReadableUserDekStore } from "@debateai/crypto";
import type { AuthPolicy } from "@debateai/register";
import type { PasswordResetPolicy } from "../../../packages/register/src/password-reset-policy.js";
import { PostgresPasswordResetRepository } from "../../../packages/db/src/password-reset.js";
import { authorizeOutboundMail, isOutboundMailAuthorizer, isSingleDeliverableRecipient, MailDeliveryError } from "./mail-channel.js";
import type { OutboundMailAuthorizer } from "./outbound-mail-gate.js";
import { passwordResetNoticeAad } from "./password-reset.js";
export type PasswordResetMail = Readonly<{
  messageId: string;
  event: "PROOF" | "COMPLETED" | "CANCELLED" | "REFUSED";
  recipient: string;
  expiresAt: Date;
  token?: string;
  cancelToken?: string;
}>;
export interface PasswordResetMailSender {
  send(mail: PasswordResetMail): Promise<void>;
}
const bearer = /^[A-Za-z0-9_-]{43}$/;
export function renderPasswordResetMail(mail: PasswordResetMail, options: Readonly<{
  from: string;
  publicAppUrl: string;
}>): string {
  const origin = new URL(options.publicAppUrl), allowed = ["messageId", "event", "recipient", "expiresAt", ...(mail.event === "PROOF" ? ["token", "cancelToken"] : [])];
  if (Object.keys(mail).some(k => !allowed.includes(k)) || origin.protocol !== "https:" || origin.username || origin.password || !/^noreply@[^@\s,;<>]+$/u.test(options.from) || !isSingleDeliverableRecipient(mail.recipient) || !/^[0-9a-f-]{36}$/i.test(mail.messageId) || !(mail.expiresAt instanceof Date) || !Number.isFinite(mail.expiresAt.getTime()))
    throw new MailDeliveryError("PASSWORD_RESET_MAIL_INPUT_INVALID");
  const link = (kind: "token" | "cancel", value: string) => {
    if (!bearer.test(value))
      throw new MailDeliveryError("PASSWORD_RESET_MAIL_INPUT_INVALID");
    const url = new URL("/reset-password", origin.origin);
    url.hash = `${kind}=${value}`;
    return url.toString();
  };
  let subject: string, body: string[];
  if (mail.event === "PROOF") {
    if (!mail.token || !mail.cancelToken)
      throw new MailDeliveryError("PASSWORD_RESET_MAIL_INPUT_INVALID");
    subject = "Reset your DebateAI password";
    body = ["A password reset was requested for your DebateAI account.", "Open this link to choose a new password:", link("token", mail.token), "", `This link expires at ${mail.expiresAt.toISOString()}.`, "You must also enter a code from your current authenticator. The email link alone cannot reset your password.", "Your existing authenticator and unused recovery codes will be retained.", "", "If this was not you, open this link and confirm cancellation:", link("cancel", mail.cancelToken), "Cancelling does not change your password."];
  }
  else {
    const subjects = { COMPLETED: "Your DebateAI password was changed", CANCELLED: "DebateAI password reset cancelled", REFUSED: "DebateAI password reset stopped" };
    const statements = { COMPLETED: "Your password was changed. All previous sessions were revoked. Your existing authenticator and unused recovery codes are unchanged. Sign in with your new password and the next code from your authenticator.", CANCELLED: "The password reset request was cancelled. Your password was not changed.", REFUSED: "The password reset request was stopped. Your password was not changed." };
      if (!Object.hasOwn(subjects, mail.event))
      throw new MailDeliveryError("PASSWORD_RESET_MAIL_INPUT_INVALID");
    subject = subjects[mail.event];
    body = [statements[mail.event]];
  }
  return [`From: ${options.from}`, `To: ${mail.recipient}`, `Subject: ${subject}`, `Message-ID: <password-reset-${mail.messageId}@${origin.hostname}>`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", "Hello,", "", ...body, "", "The DebateAI team", ""].join("\r\n");
}
export class SendmailPasswordResetSender implements PasswordResetMailSender {
  constructor(private readonly options: Readonly<{
    executable: string;
    from: string;
    publicAppUrl: string;
    timeoutMs: number;
    gate: OutboundMailAuthorizer;
  }>) {
    if (!options.executable || !Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || !isOutboundMailAuthorizer(options.gate))
      throw new MailDeliveryError("PASSWORD_RESET_MAIL_CONFIGURATION_INVALID");
  }
  async send(mail: PasswordResetMail) {
    const message = renderPasswordResetMail(mail, this.options);
    // Open sign-up mail PR 3: the outbound mail gate, last, before the spawn (security class: inside the reserve).
    await authorizeOutboundMail(this.options.gate, mail.recipient, "password-reset");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.options.executable, ["-i", "-t", "-f", this.options.from], { stdio: ["pipe", "ignore", "ignore"] });
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled)
          return;
        settled = true;
        clearTimeout(timer);
        if (ok)
          resolve();
        else
          reject(new MailDeliveryError("PASSWORD_RESET_MAIL_UNAVAILABLE"));
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(false);
      }, this.options.timeoutMs);
      child.once("error", () => finish(false));
      child.once("exit", code => finish(code === 0));
      child.stdin.once("error", () => finish(false));
      child.stdin.end(message);
    });
  }
}
export class PasswordResetNotificationWorker {
  private active: Promise<void> | null = null;
  private closed = false;
  private readonly pending = new Set<Promise<void>>();
  constructor(private readonly dependencies: Readonly<{
    repository: PostgresPasswordResetRepository;
    users: ReadableUserDekStore;
    sender: PasswordResetMailSender;
    authPolicy: AuthPolicy;
    passwordResetPolicy: PasswordResetPolicy;
    reportDiagnostic: (code: string) => void;
    dispatch: (prepare: () => Promise<RecoveryMailWork | null>) => Promise<void>;
  }>) {
    if (typeof dependencies.dispatch !== "function") throw new TypeError("PASSWORD_RESET_DISPATCH_REQUIRED");
  }
  private reportDiagnostic(code:string):void { try { this.dependencies.reportDiagnostic(code); } catch { /* Diagnostics cannot orphan an owned notice. */ } }
  reconcile(batch: number): Promise<void> {
    if (this.closed)
      return Promise.resolve();
    if (this.active)
      return this.active;
    this.active = this.run(batch).finally(() => {
      this.active = null;
    });
    return this.active;
  }
  private async run(batch: number) {
    const d = this.dependencies;
    if (!Number.isInteger(batch) || batch < 1 || batch > d.passwordResetPolicy.cleanupBatchMax)
      throw new TypeError("PASSWORD_RESET_BATCH_INVALID");
    await d.repository.expire(batch);
  try {
    for (let i = 0; i < batch && !this.closed; i++) {
      let found = false;
      await d.dispatch(async () => {
        const notice = await d.repository.claimNotice(Math.min(60000, Math.max(1000, d.authPolicy.channel.transportTimeoutMs + d.authPolicy.channel.mailDispatchPreTransportWorkBudgetMs)));
        if (!notice) return null;
        found = true;
        let key: Buffer | undefined, plain: Buffer | undefined, mail: PasswordResetMail | null = null;
        try {
          key = await d.users.load(notice.userId);
          plain = decrypt(key, notice.payload, passwordResetNoticeAad(notice.userId, notice.channelId));
          const payload: unknown = JSON.parse(plain.toString("utf8"));
          if (typeof payload !== "object" || payload === null) throw new MailDeliveryError("PASSWORD_RESET_MAIL_INPUT_INVALID");
          const p = payload as { recipient: string; token?: string; cancelToken?: string };
          const expected = notice.event === "PROOF" ? ["cancelToken", "recipient", "token"] : ["recipient"];
          if (Object.keys(p).sort().join(",") !== expected.join(",") || !isSingleDeliverableRecipient(p.recipient) || notice.event === "PROOF" && (!bearer.test(p.token ?? "") || !bearer.test(p.cancelToken ?? "")))
            throw new MailDeliveryError("PASSWORD_RESET_MAIL_INPUT_INVALID");
          mail = { messageId: notice.noticeId, event: notice.event, recipient: p.recipient, expiresAt: new Date(notice.expiresAt), ...(notice.event === "PROOF" ? { token: p.token!, cancelToken: p.cancelToken! } : {}) };
        } catch { this.reportDiagnostic("PASSWORD_RESET_NOTICE_PENDING"); }
        finally { plain?.fill(0); key?.fill(0); }
        // Preparation owns the lease; the returned work owns transport and acknowledgement.
        let resolve!: () => void;
        const pending = new Promise<void>(done => { resolve = done; });
        this.pending.add(pending);
        let started = false;
        return async () => {
          if (started) return pending;
          started = true;
          let sent = false;
          try {
            if (mail !== null) { await d.sender.send(mail); sent = true; }
          } catch { this.reportDiagnostic("PASSWORD_RESET_NOTICE_PENDING"); }
          finally {
            mail = null;
            try {
              if (!(await d.repository.finishNotice(notice.noticeId, notice.leaseId, sent, d.passwordResetPolicy.sourceWindowMs, d.authPolicy.verification.outboundSendMax)))
                this.reportDiagnostic("PASSWORD_RESET_NOTICE_ACK_PENDING");
            } catch { this.reportDiagnostic("PASSWORD_RESET_NOTICE_ACK_PENDING"); }
            finally { this.pending.delete(pending); resolve(); }
          }
        };
      });
      if (!found)
        break;
    }
    } finally { while (this.pending.size) await Promise.allSettled([...this.pending]); }
  }
  async close() {
    this.closed = true;
    await Promise.allSettled(this.active===null?[]:[this.active]);
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
}
