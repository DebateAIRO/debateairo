import { spawn } from "node:child_process";

// With `sendmail -t` the MTA reads every recipient out of the header block on
// stdin, so no address reaches argv, which any local user can read with `ps`
// (L7-F7). That moves the trust boundary onto this guard: a `,` or `;` inside
// the address would make the MTA deliver a second copy to a mailbox nobody
// vetted. The shape below rejects whitespace through `\s` but not those
// separators, so each is checked explicitly and stays checked if the shape is
// ever widened.
const RECIPIENT_SHAPE = /^[^\s@]+@[^\s@]+$/;

export function isSingleDeliverableRecipient(recipient: string): boolean {
  return RECIPIENT_SHAPE.test(recipient)
    && !/[\r\n]/.test(recipient)
    && !/\s/.test(recipient)
    && !/[,;]/.test(recipient);
}

export interface VerificationMail {
  readonly attemptId: string;
  readonly recipient: string;
  readonly token: string;
  readonly expiresAt: Date;
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
    this.messages.push(Object.freeze({ ...mail }));
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
      || !/^https:\/\//.test(options.publicAppUrl)
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
    const message = [
      `From: ${this.options.from}`,
      `To: ${mail.recipient}`,
      "Subject: Verify your DebateAI email",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      "Verify your email by opening this link:",
      verificationUrl.toString(),
      "",
      `This link expires at ${mail.expiresAt.toISOString()}.`,
      "If you cannot find this message, check your spam folder.",
      ""
    ].join("\r\n");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.options.executable, ["-i", "-t", "-f", this.options.from], {
        stdio: ["pipe", "ignore", "ignore"]
      });
      let settled = false;
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        fail("SENDMAIL_TIMEOUT");
      }, this.options.timeoutMs);
      const fail = (code: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new MailDeliveryError(code));
      };
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
    const subject=mail.eventKind==="SCHEDULED"
      ? "DebateAI account deletion scheduled"
      : mail.eventKind==="CANCELLED"
        ? "DebateAI account deletion cancelled"
        : "DebateAI account deletion is completing";
    const detail=mail.eventKind==="SCHEDULED"
      ? `Deletion is scheduled for ${mail.executeAt.toISOString()}.`
      : mail.eventKind==="CANCELLED"
        ? "The scheduled account deletion was cancelled."
        : "Your account deletion has entered its irreversible completion step.";
    const message=[
      `From: ${this.options.from}`,
      `To: ${mail.recipient}`,
      `Message-ID: <${mail.messageId}@debateai.local>`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      detail,
      "If you did not request this action, contact the site operator immediately.",
      ""
    ].join("\r\n");
    await new Promise<void>((resolve,reject)=>{
      const child=spawn(
        this.options.executable,["-i","-t","-f",this.options.from],
        { stdio:["pipe","ignore","ignore"] }
      );
      let settled=false;
      const fail=(code:string):void=>{
        if (settled) return;
        settled=true;
        clearTimeout(timer);
        reject(new MailDeliveryError(code));
      };
      const timer=setTimeout(()=>{
        child.kill("SIGKILL");
        fail("SENDMAIL_TIMEOUT");
      },this.options.timeoutMs);
      child.once("error",()=>fail("SENDMAIL_EXEC_FAILED"));
      child.once("exit",(code,signal)=>{
        if (settled) return;
        settled=true;
        clearTimeout(timer);
        if (code===0) resolve();
        else reject(new MailDeliveryError(
          signal===null ? `SENDMAIL_EXIT_${String(code??"UNKNOWN")}`
            : `SENDMAIL_SIGNAL_${signal}`
        ));
      });
      child.stdin.once("error",()=>fail("SENDMAIL_STDIN_FAILED"));
      child.stdin.end(message,"utf8");
    });
  }
}

// Turn 14 — change email. Three messages, all plain text through `sendmail -t`:
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

export class SendmailEmailChangeMailSender implements EmailChangeMailSender {
  constructor(private readonly options: {
    readonly executable: string;
    readonly from: string;
    readonly publicAppUrl: string;
    readonly timeoutMs: number;
  }) {
    if (!/^noreply@[A-Za-z0-9.-]+$/.test(options.from)
      || options.executable.trim() === ""
      || !/^https:\/\//.test(options.publicAppUrl)
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
    const [subject, body] = this.render(mail);
    const message = [
      `From: ${this.options.from}`,
      `To: ${mail.recipient}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      ...body,
      ""
    ].join("\r\n");
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

  private render(mail: EmailChangeMail): readonly [string, readonly string[]] {
    if (mail.kind === "confirmation") {
      return ["Confirm your new DebateAI email", [
        "Confirm this address for your DebateAI account by opening this link:",
        emailChangeLink(this.options.publicAppUrl, "confirm", mail.token),
        "",
        `This link expires at ${mail.expiresAt.toISOString()}.`,
        "If you did not ask for this, ignore this message. Nothing changes until the link is opened."
      ]];
    }
    if (mail.kind === "notice") {
      return ["Your DebateAI email is being changed", [
        `Someone signed in to your DebateAI account asked to change its email to ${mail.newEmail}.`,
        "Your current address keeps working until the new one is confirmed.",
        "",
        "If this wasn't you, cancel the change by opening this link:",
        emailChangeLink(this.options.publicAppUrl, "cancel", mail.cancelToken),
        "",
        "Then sign in and review your active sessions in Settings."
      ]];
    }
    return ["DebateAI email change", [
      "Someone asked to use this address for a DebateAI account, but it already belongs to one.",
      "Nothing was changed. If this was you, sign in with this address instead."
    ]];
  }
}
