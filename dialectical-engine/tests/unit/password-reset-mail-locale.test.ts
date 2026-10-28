import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { renderPasswordResetMail } from "../../apps/api/src/password-reset-mail.js";
import { PostgresPasswordResetRepository } from "../../packages/db/src/password-reset.js";

// C16 (V-24): a non-ASCII Subject is RFC 2047 B-encoded and a non-ASCII body is base64. The helpers assert the encoded
// form is on the wire, then return the text the pins compare against.
const encodedSubject = (message: string): string => {
  expect(message).toMatch(/\r\nSubject: =\?UTF-8\?B\?/);
  const header = /\r\nSubject: ([^\r]*)\r\n/.exec(message)?.[1] ?? "";
  return Buffer.concat([...header.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)].map(word => Buffer.from(word[1]!, "base64"))).toString("utf8");
};
const decodedBody = (message: string): string => {
  const split = message.indexOf("\r\n\r\n");
  expect(message.slice(0, split).split("\r\n")).toContain("Content-Transfer-Encoding: base64");
  // The blank line that ends the header block stays in front, so the pins read the sentences as they sit on the wire.
  return "\r\n" + Buffer.from(message.slice(split + 4).replace(/\r\n/g, ""), "base64").toString("utf8");
};

// S01 C09 (R-13, R-21, R-31; D-88): the password-reset renderer takes the language the worker claimed,
// the claim maps the stored column, and the request's value reaches the repository as a Source field.
const options = { from: "noreply@dezbatere.ro", publicAppUrl: "https://preview.example.test" }, token = "A".repeat(43), cancelToken = "B".repeat(43);
const base = { messageId: randomUUID(), recipient: "owned@example.test", expiresAt: new Date("2026-10-06T12:00:00Z") };

describe("password-reset mail in the stored language (C09.5)", () => {
  it("renders the Romanian proof mail for ro: subject, greeting, sign-off, expiry line and Content-Language", () => {
    const message = renderPasswordResetMail({ ...base, event: "PROOF", token, cancelToken, mailLocale: "ro" }, options);
    expect(encodedSubject(message)).toBe("Resetați parola Dialectical Engine");
    expect(message).toContain("Content-Language: ro\r\n");
    expect(decodedBody(message)).toContain("\r\nBună ziua,\r\n");
    expect(decodedBody(message)).toContain("Deschideți linkul pentru a alege o parolă nouă:");
    expect(decodedBody(message)).toContain("Linkul expiră la 2026-10-06T12:00:00.000Z.");
    expect(decodedBody(message)).toContain("\r\nEchipa Dialectical Engine\r\n");
    expect(decodedBody(message)).toContain(`/reset-password#token=${token}`);
    expect(decodedBody(message)).toContain(`/reset-password#cancel=${cancelToken}`);
    expect(decodedBody(message)).not.toContain("Hello,");
    expect(decodedBody(message)).not.toContain("Reset your Dialectical Engine password");
  });

  it("renders the Arabic completion mail for ar with its own subject and greeting", () => {
    const message = renderPasswordResetMail({ ...base, event: "COMPLETED", mailLocale: "ar" }, options);
    expect(encodedSubject(message)).toBe("تم تغيير كلمة مرور Dialectical Engine الخاصة بك");
    expect(message).toContain("Content-Language: ar\r\n");
    expect(decodedBody(message)).toContain("\r\nمرحبًا،\r\n");
    expect(decodedBody(message)).not.toContain("Hello,");
  });

  it("renders en-GB as the English catalogue with Content-Language en and the English sentences unchanged", () => {
    const message = renderPasswordResetMail({ ...base, event: "COMPLETED", mailLocale: "en-GB" }, options);
    expect(message).toContain("Subject: Your Dialectical Engine password was changed\r\n");
    expect(message).toContain("Content-Language: en\r\n");
    expect(message).toContain("\r\nHello,\r\n");
    expect(message).toContain("Your existing authenticator and unused recovery codes are unchanged.");
  });

  it("refuses a mail-locale value outside the 37 accepted values", () => {
    expect(() => renderPasswordResetMail({ ...base, event: "COMPLETED", mailLocale: "xx" }, options)).toThrow("PASSWORD_RESET_MAIL_INPUT_INVALID");
  });
});

describe("the claim maps the stored mail_locale column (C09.7)", () => {
  const notice = {
    noticeId: randomUUID(), leaseId: randomUUID(), userId: randomUUID(), channelId: randomUUID(), event: "PROOF",
    payload: { v: 1 }, expiresAt: "2026-10-06T12:00:00.000Z"
  };
  const claimingPool = (result: unknown) => ({ query: async () => ({ rows: [{ result }] }) }) as never;

  it("returns mailLocale from the stored value and drops the column name", async () => {
    const repo = new PostgresPasswordResetRepository(claimingPool({ ...notice, mail_locale: "ro" }), {} as never, 1);
    const claimed = await repo.claimNotice(1000);
    expect(claimed).toEqual({ ...notice, mailLocale: "ro" });
    expect(claimed).not.toHaveProperty("mail_locale");
  });

  it("refuses a stored value outside the 37 values, so the row fails closed", async () => {
    const repo = new PostgresPasswordResetRepository(claimingPool({ ...notice, mail_locale: "xx" }), {} as never, 1);
    await expect(repo.claimNotice(1000)).rejects.toThrow("MAIL_LOCALE_INVALID");
  });

  it("returns null when no notice is claimable", async () => {
    const repo = new PostgresPasswordResetRepository(claimingPool(null), {} as never, 1);
    expect(await repo.claimNotice(1000)).toBeNull();
  });

  // NV-40: the new release claims through 0125's sweeping function; 0116's sealed claim stays for the release before.
  it("claims through the pending-notice function", async () => {
    const calls: Array<Readonly<{ text: string; args: unknown }>> = [];
    const pool = { query: async (text: string, args: unknown) => {
      calls.push({ text, args });
      return { rows: [{ result: { ...notice, mail_locale: "ro" } }] };
    } } as never;
    const repo = new PostgresPasswordResetRepository(pool, {} as never, 1);
    expect(await repo.claimNotice(1000)).toEqual({ ...notice, mailLocale: "ro" });
    expect(calls).toEqual([{ text: "SELECT identity.password_reset_claim_pending_notice($1) AS result", args: [1000] }]);
  });
});

describe("the request's mail language reaches the repository (C09.1 carrier)", () => {
  const audit = { hashSourceIp: async () => "a".repeat(64), hashUserAgent: async () => "b".repeat(64) } as never;
  const repo = new PostgresPasswordResetRepository({} as never, audit, 1);
  const context = { ip: "203.0.113.9", userAgent: "unit", requestId: "unit" };

  it("carries the request value when it is one of the 37", async () => {
    expect(await repo.prepareSource({ ...context, mailLocale: "ro" })).toEqual({ ipArgon2id: `argon2id-audit:v1:${"a".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"b".repeat(64)}`, mailLocale: "ro" });
  });

  it("resolves an absent or unknown value to en before the setting is written (R-08)", async () => {
    expect((await repo.prepareSource(context)).mailLocale).toBe("en");
    expect((await repo.prepareSource({ ...context, mailLocale: "xx" })).mailLocale).toBe("en");
  });
});
