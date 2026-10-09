import { describe, expect, it, vi } from "vitest";
import { canonicalMailAddress, isMailAddress, mailAddressDomain } from "@debateai/kernel";
import { RegisterRequestFieldsSchema, ResendVerificationRequestSchema } from "@debateai/contract";
import { isSingleDeliverableRecipient, SendmailMailSender } from "../../apps/api/src/mail-channel.js";
import { AuthFlowError, RegistrationService } from "../../apps/api/src/registration.js";
import { EmailChangeError, EmailChangeService, normalizedAddress } from "../../apps/api/src/email-change.js";
import { RecoveryEmailService } from "../../apps/api/src/recovery-email.js";
import { createMailDomainCheck, limitMailDomainCheck, mailDomainRefused, type MailDomainResolver } from "../../apps/api/src/mail-domain-check.js";
import { emailShape, signInEmailShape } from "../../apps/ui/lib/authFormValidation.js";
import { normalizeEmailForBlindIndex } from "@debateai/crypto";
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows } from "../../packages/register/src/auth-policy.js";
import { testOutboundMailGate } from "../support/outboundMailGate.js";

// Open sign-up mail, PR 2 (2026-10-09): ONE address rule, asked at sign-up, resend, the recovery address,
// email change, the browser's pre-check and the mail step. The table is the contract.

const local64 = "l".repeat(64);
const label63 = "d".repeat(63);
/** 64 + 1 + 63 + 1 + 63 + 1 + 57 + 1 + 3 = 254 characters. */
const length254 = `${local64}@${label63}.${label63}.${"e".repeat(57)}.com`;
const length255 = `${local64}@${label63}.${label63}.${"e".repeat(58)}.com`;

const GOOD: ReadonlyArray<readonly [string, string]> = [
  ["plain", "person@example.com"],
  ["+label", "person+news@example.com"],
  ["dot-atom local part", "first.last@example.co.uk"],
  ["all permitted local characters", "a!#$%&'*+/=?^_`{|}~-z@example.org"],
  ["upper-case domain is lower-cased", "Person@EXAMPLE.COM"],
  ["hyphenated label", "person@mail-host.example.ro"],
  ["digit labels below the top level", "person@123.example.io"],
  ["24-letter top-level domain", `person@example.${"a".repeat(24)}`],
  ["two-letter top-level domain", "person@example.ro"],
  ["IDN in its ASCII form below the top level", "person@xn--bcher-kva.de"],
  ["SES simulator: success", "success@simulator.amazonses.com"],
  ["SES simulator: bounce", "bounce@simulator.amazonses.com"],
  ["SES simulator: ooto", "ooto@simulator.amazonses.com"],
  ["SES simulator: complaint", "complaint@simulator.amazonses.com"],
  ["SES simulator: suppression list", "suppressionlist@simulator.amazonses.com"],
  ["SES simulator with +label", "success+signup-1@simulator.amazonses.com"],
  ["exactly 254 characters", length254],
  ["64-character local part", `${local64}@example.com`],
  ["63-character label", `person@${label63}.com`]
];

const BAD: ReadonlyArray<readonly [string, unknown]> = [
  ["no dot in the domain", "person@localhost"],
  ["no dot, single label", "person@example"],
  ["numeric top-level domain", "person@example.123"],
  ["one-letter top-level domain", "person@example.c"],
  ["25-letter top-level domain", `person@example.${"a".repeat(25)}`],
  ["IDN top-level domain in ASCII form", "person@example.xn--p1ai"],
  ["IDN domain in Unicode", "person@bücher.de"],
  ["Unicode local part", "pérson@example.com"],
  ["full-width characters", "ｐerson@example.com"],
  ["255 characters", length255],
  ["65-character local part", `${"l".repeat(65)}@example.com`],
  ["64-character label", `person@${"d".repeat(64)}.com`],
  ["empty label", "person@example..com"],
  ["leading dot in the domain", "person@.example.com"],
  ["trailing dot in the domain", "person@example.com."],
  ["label starting with a hyphen", "person@-example.com"],
  ["label ending with a hyphen", "person@example-.com"],
  ["underscore in the domain", "person@exa_mple.com"],
  ["leading dot in the local part", ".person@example.com"],
  ["trailing dot in the local part", "person.@example.com"],
  ["doubled dot in the local part", "per..son@example.com"],
  ["local part starting with a hyphen", "-oops@example.com"],
  ["no local part", "@example.com"],
  ["no @", "person.example.com"],
  ["two @", "per@son@example.com"],
  ["comma (a second recipient)", "a@example.com,b@example.com"],
  ["semicolon (a second recipient)", "a@example.com;b@example.com"],
  ["space", "per son@example.com"],
  ["surrounding space", " person@example.com"],
  ["angle brackets", "a@example.com> <x@example.org"],
  ["quoted local part", "\"a\"@example.com"],
  ["colon", "a:b@example.com"],
  ["backslash", "a\\b@example.com"],
  ["CR LF header injection", "a@example.com\r\nBcc: x@example.org"],
  ["NUL", "a@example.com\u0000"],
  ["empty string", ""],
  ["not a string", 42],
  ["null", null]
];

describe("the one address rule (packages/kernel/src/mail-address.ts)", () => {
  it.each(GOOD)("accepts %s", (_name, address) => {
    expect(isMailAddress(address)).toBe(true);
    const canonical = canonicalMailAddress(address)!;
    expect(canonical.slice(0, canonical.indexOf("@"))).toBe(address.slice(0, address.indexOf("@")));
    expect(canonical.slice(canonical.indexOf("@") + 1)).toBe(address.slice(address.indexOf("@") + 1).toLowerCase());
  });
  it.each(BAD)("refuses %s", (_name, address) => {
    expect(isMailAddress(address)).toBe(false);
    expect(canonicalMailAddress(address)).toBeNull();
  });
  it("measures the length boundary it claims", () => {
    expect(length254).toHaveLength(254);
    expect(length255).toHaveLength(255);
  });
  it("lower-cases the domain only", () => {
    expect(canonicalMailAddress("Mixed.Case+Tag@Sub.EXAMPLE.Com")).toBe("Mixed.Case+Tag@sub.example.com");
    expect(mailAddressDomain("Mixed@Sub.EXAMPLE.Com")).toBe("sub.example.com");
    expect(() => mailAddressDomain("person@localhost")).toThrow("EMAIL_INVALID");
  });
});

describe("registration refuses exactly what mail refuses", () => {
  // The resend admission asks the rule before touching the repository, limiter or mail; only the enumeration
  // floor (policy + sleep) runs on the way out.
  const service = new RegistrationService({ policy: authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), sleep: async () => undefined } as never);
  const resendAdmission = async (email: unknown) => service.admitSource({
    route: "resend", source: { ip: "198.51.100.7", userAgent: "vitest", requestId: "mail-address" },
    input: { email } as never
  } as never).then(() => "ADMITTED", (error: unknown) => error instanceof AuthFlowError ? error.code : "OTHER");
  const strings = [...GOOD.map(([, address]) => address), ...BAD.map(([, address]) => address).filter((value): value is string => typeof value === "string")];

  const registerAdmission = async (email: unknown) => service.admitSource({
    route: "register", source: { ip: "198.51.100.8", userAgent: "vitest", requestId: "mail-address-register" },
    // No password and no phone: an address the rule accepts falls through to AUTH_INPUT_INVALID.
    input: { email, recoveryEmail: null, adultAffirmed: true } as never
  } as never).then(() => "ADMITTED", (error: unknown) => error instanceof AuthFlowError ? error.code : "OTHER");
  /** What each entry point would STORE for x, or null when it refuses x. */
  const entryPoints: Record<string, (address: string) => Promise<string | null>> = {
    "sign-up schema": async (x) => RegisterRequestFieldsSchema.shape.email.safeParse(x).success ? normalizeEmailForBlindIndex(x) : null,
    "resend schema": async (x) => ResendVerificationRequestSchema.shape.email.safeParse(x).success ? normalizeEmailForBlindIndex(x) : null,
    "sign-up service": async (x) => await registerAdmission(x) === "EMAIL_INVALID" ? null : normalizeEmailForBlindIndex(x),
    "resend service": async (x) => await resendAdmission(x) === "EMAIL_INVALID" ? null : normalizeEmailForBlindIndex(x),
    "email change and recovery address": async (x) => { try { return normalizedAddress(x); } catch (error) { expect((error as EmailChangeError).code).toBe("EMAIL_INVALID"); return null; } },
    "browser pre-check": async (x) => emailShape(x) ? normalizeEmailForBlindIndex(x) : null
  };

  it.each(strings)("%j: whatever an entry point accepts, the mail step can send to as stored", async (address) => {
    for (const [name, entry] of Object.entries(entryPoints)) {
      const stored = await entry(address);
      if (stored !== null) expect(isSingleDeliverableRecipient(stored), `${name} accepted what mail refuses`).toBe(true);
    }
  });

  it.each(GOOD.map(([, address]) => address))("%j: every entry point accepts a good address (control)", async (address) => {
    for (const [name, entry] of Object.entries(entryPoints)) expect(await entry(address), name).not.toBeNull();
    expect(await registerAdmission(address)).toBe("AUTH_INPUT_INVALID");
    expect(isSingleDeliverableRecipient(address)).toBe(true);
  });

  it.each(BAD.map(([, address]) => address).filter((value): value is string => typeof value === "string" && value.trim() === value))(
    "%j: every entry point refuses what mail refuses", async (address) => {
      expect(isSingleDeliverableRecipient(address)).toBe(false);
      for (const [name, entry] of Object.entries(entryPoints)) expect(await entry(address), name).toBeNull();
    });

  it.each(BAD.filter(([, address]) => typeof address === "string"))("the verification sender refuses %s before any spawn", async (_name, recipient) => {
    const sender = new SendmailMailSender({ gate: testOutboundMailGate(), executable: "/definitely/no/spawn", from: "noreply@dezbatere.ro", publicAppUrl: "https://dezbatere.ro", timeoutMs: 1000 });
    await expect(sender.sendVerification({ attemptId: "opaque", recipient: recipient as string, token: "Z".repeat(43), expiresAt: new Date("2026-10-09T00:00:00Z") }))
      .rejects.toMatchObject({ operatorCode: "MAIL_INPUT_INVALID" });
  });

  it("a good address does reach the transport (control: the refusals above are the rule's)", async () => {
    const sender = new SendmailMailSender({ gate: testOutboundMailGate(), executable: "/definitely/no/spawn", from: "noreply@dezbatere.ro", publicAppUrl: "https://dezbatere.ro", timeoutMs: 1000 });
    await expect(sender.sendVerification({ attemptId: "opaque", recipient: "success+x@simulator.amazonses.com", token: "Z".repeat(43), expiresAt: new Date("2026-10-09T00:00:00Z") }))
      .rejects.toMatchObject({ operatorCode: "SENDMAIL_EXEC_FAILED" });
  });

  it("sign-in and recovery keep the wider look-up shape, so older accounts can still sign in", () => {
    expect(signInEmailShape("person@example.c")).toBe(true);
    expect(signInEmailShape("per..son@example.com")).toBe(true);
    expect(emailShape("person@example.c")).toBe(false);
    expect(signInEmailShape("person@localhost")).toBe(false);
    expect(signInEmailShape("a@example.com,b@example.com")).toBe(false);
  });

  it("EMAIL_INVALID is a 422 with its own code", () => {
    const error = new AuthFlowError("EMAIL_INVALID");
    expect(error.statusCode).toBe(422);
    expect(error.message).toBe("EMAIL_INVALID");
  });
});

describe("the DNS question at the entry points (fails open)", () => {
  const absent = (code: string) => Object.assign(new Error(code), { code });
  const resolver = (overrides: Partial<MailDomainResolver>): MailDomainResolver => ({
    resolveMx: async () => { throw absent("ENODATA"); },
    resolve4: async () => { throw absent("ENODATA"); },
    resolve6: async () => { throw absent("ENODATA"); },
    ...overrides
  });

  it("DELIVERABLE when an MX record exists", async () => {
    const check = createMailDomainCheck(resolver({ resolveMx: async () => [{ exchange: "mx.example.com", priority: 10 }] }));
    expect(await check("example.com")).toBe("DELIVERABLE");
  });
  it("UNDELIVERABLE on NXDOMAIN", async () => {
    const check = createMailDomainCheck(resolver({ resolveMx: async () => { throw absent("ENOTFOUND"); } }));
    expect(await check("no-such-domain.com")).toBe("UNDELIVERABLE");
  });
  it("UNDELIVERABLE on a null MX (RFC 7505)", async () => {
    for (const exchange of ["", "."]) {
      const check = createMailDomainCheck(resolver({ resolveMx: async () => [{ exchange, priority: 0 }] }));
      expect(await check("example.com")).toBe("UNDELIVERABLE");
    }
  });
  it("falls back to A or AAAA when there is no MX (RFC 5321 §5.1)", async () => {
    expect(await createMailDomainCheck(resolver({ resolve4: async () => ["192.0.2.1"] }))("example.com")).toBe("DELIVERABLE");
    expect(await createMailDomainCheck(resolver({ resolve6: async () => ["2001:db8::1"] }))("example.com")).toBe("DELIVERABLE");
  });
  it("UNDELIVERABLE when there is neither MX nor A/AAAA", async () => {
    expect(await createMailDomainCheck(resolver({}))("example.com")).toBe("UNDELIVERABLE");
  });
  it("UNKNOWN on any other resolver failure", async () => {
    expect(await createMailDomainCheck(resolver({ resolveMx: async () => { throw absent("ESERVFAIL"); } }))("example.com")).toBe("UNKNOWN");
    expect(await createMailDomainCheck(resolver({ resolve4: async () => { throw absent("ETIMEOUT"); } }))("example.com")).toBe("UNKNOWN");
    expect(await createMailDomainCheck(resolver({ resolveMx: async () => { throw new Error("no code"); } }))("example.com")).toBe("UNKNOWN");
  });
  it("UNKNOWN at the deadline, and abandons the queries in flight", async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn();
      const check = createMailDomainCheck(resolver({ resolveMx: () => new Promise(() => { /* never answers */ }), cancel }));
      const verdict = check("slow.com");
      await vi.advanceTimersByTimeAsync(1_999);
      expect(cancel).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(await verdict).toBe("UNKNOWN");
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("the entry points refuse only a positive UNDELIVERABLE", async () => {
    expect(await mailDomainRefused(async () => "UNDELIVERABLE", "person@example.com")).toBe(true);
    expect(await mailDomainRefused(async () => "UNKNOWN", "person@example.com")).toBe(false);
    expect(await mailDomainRefused(async () => "DELIVERABLE", "person@example.com")).toBe(false);
    expect(await mailDomainRefused(async () => { throw new Error("boom"); }, "person@example.com")).toBe(false);
    expect(await mailDomainRefused(undefined, "person@example.com")).toBe(false);
  });
  it("never asks about special-use names (.test, .example, .invalid, .localhost)", async () => {
    let asked = 0;
    const check = createMailDomainCheck(resolver({ resolveMx: async () => { asked += 1; throw absent("ENOTFOUND"); } }));
    for (const domain of ["example.test", "mail.example", "x.invalid", "Host.LOCALHOST"]) expect(await check(domain)).toBe("UNKNOWN");
    expect(asked).toBe(0);
    expect(await check("example.com")).toBe("UNDELIVERABLE");
    expect(asked).toBe(1);
  });
  it("sends no A/AAAA queries once the deadline has passed", async () => {
    vi.useFakeTimers();
    try {
      let late!: (value: never[]) => void;
      const resolve4 = vi.fn(async () => ["192.0.2.1"]);
      const check = createMailDomainCheck(resolver({
        resolveMx: () => new Promise((resolve) => { late = () => resolve([]); }), resolve4
      }));
      const verdict = check("late.com");
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await verdict).toBe("UNKNOWN");
      late([]);
      await vi.advanceTimersByTimeAsync(10);
      expect(resolve4).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("the process-wide brakes answer UNKNOWN without asking, over the in-flight or per-minute limit", async () => {
    let clock = 0, asked = 0;
    const gates: Array<() => void> = [];
    const slow = limitMailDomainCheck(async () => { asked += 1; await new Promise<void>((done) => { gates.push(done); }); return "UNDELIVERABLE"; },
      { maxInFlight: 2, maxPerMinute: 3, now: () => clock });
    const first = slow("a.com"), second = slow("b.com");
    expect(await slow("c.com")).toBe("UNKNOWN");
    expect(asked).toBe(2);
    for (const done of gates.splice(0)) done();
    expect(await first).toBe("UNDELIVERABLE");
    expect(await second).toBe("UNDELIVERABLE");
    const third = slow("d.com");
    for (const done of gates.splice(0)) done();
    expect(await third).toBe("UNDELIVERABLE");
    expect(await slow("e.com")).toBe("UNKNOWN");
    expect(asked).toBe(3);
    clock = 60_001;
    const fresh = slow("f.com");
    for (const done of gates.splice(0)) done();
    expect(await fresh).toBe("UNDELIVERABLE");
    expect(asked).toBe(4);
  });
  it("is asked about the lower-cased domain, never the address", async () => {
    const asked: string[] = [];
    await mailDomainRefused(async (domain) => { asked.push(domain); return "DELIVERABLE"; }, "Secret.Person@Example.COM");
    expect(asked).toEqual(["example.com"]);
  });
});

describe("the DNS question in the two settings flows", () => {
  const grantToken = "G".repeat(43);
  const session = { userId: "22222222-2222-4222-8222-222222222222", sessionId: "s", tokenHash: "t" } as never;
  const source = { ip: "198.51.100.9", userAgent: "vitest", requestId: "settings-dns" } as never;
  const refusing = async () => "UNDELIVERABLE" as const;

  it("email change refuses an undeliverable domain with EMAIL_INVALID before any key or database work", async () => {
    const request = vi.fn(), load = vi.fn();
    const service = new EmailChangeService({ repository: { request } as never, users: { load } as never, blindIndexKey: Buffer.alloc(32, 1), mail: {} as never, mailDomainCheck: refusing });
    await expect(service.request(session, { newEmail: "person@gone.com", grantToken }, source)).rejects.toMatchObject({ code: "EMAIL_INVALID" });
    expect(request).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
  it("the recovery address refuses an undeliverable domain with EMAIL_INVALID before any key or database work", async () => {
    const request = vi.fn(), load = vi.fn();
    const service = new RecoveryEmailService({ repository: { request } as never, users: { load } as never, blindIndexKey: Buffer.alloc(32, 1), mail: {} as never, mailDomainCheck: refusing });
    await expect(service.requestRecoveryEmail(session, { email: "backup@gone.com", grantToken }, source)).rejects.toMatchObject({ code: "EMAIL_INVALID" });
    expect(request).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
  it("both fail open: an UNKNOWN answer goes on to the key store (control)", async () => {
    const load = vi.fn(async () => { throw new Error("REACHED_KEY_STORE"); });
    const change = new EmailChangeService({ repository: {} as never, users: { load } as never, blindIndexKey: Buffer.alloc(32, 1), mail: {} as never, mailDomainCheck: async () => "UNKNOWN" });
    await expect(change.request(session, { newEmail: "person@example.com", grantToken }, source)).rejects.toThrow("REACHED_KEY_STORE");
    const recovery = new RecoveryEmailService({ repository: {} as never, users: { load } as never, blindIndexKey: Buffer.alloc(32, 1), mail: {} as never, mailDomainCheck: async () => "UNKNOWN" });
    await expect(recovery.requestRecoveryEmail(session, { email: "backup@example.com", grantToken }, source)).rejects.toThrow("REACHED_KEY_STORE");
  });
});
