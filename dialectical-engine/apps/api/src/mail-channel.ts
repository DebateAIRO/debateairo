import { spawn } from "node:child_process";

export interface VerificationMail {
  readonly attemptId: string;
  readonly recipient: string;
  readonly token: string;
  readonly expiresAt: Date;
}

export interface MailSender {
  sendVerification(mail: VerificationMail): Promise<void>;
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
    // The shape regex currently rejects CR/LF through `\s`; keep the explicit
    // guard as defence in depth if that broader recipient grammar is widened.
    if (!/^[^\s@]+@[^\s@]+$/.test(mail.recipient)
      || /[\r\n]/.test(mail.recipient)
      || !/^[A-Za-z0-9_-]{43}$/.test(mail.token)) {
      throw new MailDeliveryError("MAIL_INPUT_INVALID");
    }
    const verificationUrl = new URL("/verify-email", this.options.publicAppUrl);
    verificationUrl.searchParams.set("token", mail.token);
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
      const child = spawn(this.options.executable, ["-i", "-f", this.options.from, "--", mail.recipient], {
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
