// Who receives a mail under schema v2, and how one mail is dispatched by its plan: v1 keeps today's calls in today's
// order; v2 never reads the recovery helper, reads the allow-list only in allow-list mode, and hands every family to
// `/usr/sbin/sendmail -i -f noreply@dezbatere.ro -- <one recipient>`.
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { renderPasswordResetMail } from "../../apps/api/src/password-reset-mail.js";
import { renderEmailRecoveryMail } from "../../apps/api/src/email-mfa-mail.js";
import { buildTemplatedMessage } from "../../apps/api/src/mail-mime.js";
import { MemoryTemplatedMailSender, isSingleDeliverableRecipient, renderAccountMailMessage } from "../../apps/api/src/mail-channel.js";

const mail = await import("../../deploy/" + "preview-auth-dev/v1/mail-handoff.mjs");
const check = await import("../../deploy/" + "preview-auth-dev/v1/start-check-mail.mjs");
const fixture = await import("../../deploy/" + "preview-mail/v4-20261005/synthetic-recipient-fixture.mjs");

const PREVIEW = "https://v3-preview.dezbatere.ro";
const MAIN = "https://dezbatere.ro";
const FROM = "noreply@dezbatere.ro";
const ARGV = ["-i", "-t", "-f", FROM];
const ID = "11111111-1111-4111-8111-111111111111";
const EXPIRES = new Date("2026-10-06T22:00:00Z");
const STRANGER = "stranger@example.com";
const HELPER = "/opt/debateai-v3-preview/operator/recovery106-v1/sendmail-two-owned-preview-recovery106.mjs";
const aliases = fixture.aliases as Record<string, string>;
const PROOF = aliases["verification-direct-and-recovery-proof"]!, NOTICE = aliases["recovery-notice-secondary"]!;
const PRIMARY = aliases["verification-forward-primary"]!, TARGET = aliases["verification-forward-secondary"]!;

const api = { renderPasswordResetMail, renderEmailRecoveryMail, buildTemplatedMessage, isSingleDeliverableRecipient, renderAccountMailMessage };
const siteOptions = (origin: string, recipientOf: unknown) => ({ from: FROM, origin, renderPasswordResetMail, renderEmailRecoveryMail, buildTemplatedMessage, renderAccountMail: renderAccountMailMessage, recipientOf });
const refused = (run: () => unknown) => expect(run).toThrow(/^PREVIEW_MAIL_REFUSED$/);

/** One mail of each family, as the API writes it, to `to` on `origin`. */
async function familyMail(family: "templated" | "account" | "external", to: string, origin = PREVIEW): Promise<Buffer> {
  if (family === "templated") {
    const sender = new MemoryTemplatedMailSender(FROM);
    await sender.sendTemplated({ to, templateId: "O3", locale: "en", messageId: "22222222-2222-4222-8222-222222222222",
      params: { jobKind: "SMARTBILL_INVOICE", reference: "charge 1", reasonCode: "OUTBOX_HANDLER_FAILED", nextSteps: "Run the listed step." } });
    return Buffer.from(sender.messages[0]!.raw, "utf8");
  }
  if (family === "account") {
    const url = new URL("/verify-email", origin); url.hash = `token=${"T".repeat(43)}`;
    return Buffer.from(renderAccountMailMessage({ template: "verification-v1", recipient: to, url, expiresAt: EXPIRES, display: { locale: "ro", timeZone: null } } as never, FROM), "utf8");
  }
  return Buffer.from(renderPasswordResetMail({ messageId: ID, recipient: to, expiresAt: EXPIRES, mailLocale: "en", event: "PROOF", token: "T".repeat(43), cancelToken: "C".repeat(43) } as never, { from: FROM, publicAppUrl: origin }), "utf8");
}
const FAMILIES = ["templated", "account", "external"] as const;

describe("open mode: one bare deliverable address, by the API's own rule", () => {
  const open = mail.openRecipient(isSingleDeliverableRecipient);
  it("takes an ordinary address as it is", () => {
    for (const to of [STRANGER, "first.last+tag@mail.example.ro", "x@sub.example.co.uk"]) expect(open(to)).toBe(to);
  });

  it.each([
    ["a leading dash (a sendmail option)", "-oQ/tmp@x.ro"],
    ["a space", "a b@x.ro"],
    ["a comma (a second recipient)", "a,b@x.ro"],
    ["a semicolon", "a;b@x.ro"],
    ["a quoted local part", "\"q\"@x.ro"],
    ["255 characters", `${"a".repeat(64)}@${"b".repeat(185)}.ro`],
    ["a domain without a dot", "x@localhost"],
    ["a display name", "Name <x@x.ro>"],
    ["two addresses", "a@x.ro, b@x.ro"],
    ["a line break", "a@x.ro\r\nBcc: b@x.ro"],
    ["nothing", ""]
  ])("refuses %s before any process starts", async (_name, to) => {
    expect(() => open(to)).toThrow(/^PREVIEW_MAIL_REFUSED$/);
    // Composed past the API's own sender (which would refuse it first), the selector refuses it in open mode.
    const message = Buffer.from(buildTemplatedMessage({ from: FROM, to, messageId: null, subject: "S", text: "t", html: "<p>h</p>", attachments: [], boundary: "abcdefghijklmnop" }), "utf8");
    refused(() => mail.selectSiteMail(message, siteOptions(PREVIEW, open)));
    await expect(mail.submitTemplatedMail({ message, recipient: to, deadline: Date.now() + 1000, spawnImpl: () => { throw new Error("unexpected spawn"); } })).rejects.toThrow(/^PREVIEW_MAIL_REFUSED$/);
  });

  it("takes exactly what the API's own rule takes, so every address sign-up accepts can be mailed", () => {
    // ' ` and $ are plain characters of a local part to the API's rule and to the MTA; no shell sees the argument.
    for (const to of ["o'neil@example.com", "a$b@example.com", "a`b@example.com", "x!#%&*+/=?^_{|}~y@example.ie"]) {
      expect(isSingleDeliverableRecipient(to), to).toBe(true);
      expect(open(to)).toBe(to);
    }
    // Every printable ASCII character, inside and at the start of a local part: open mode agrees with the API's rule.
    for (let code = 0x20; code <= 0x7e; code++) {
      const c = String.fromCharCode(code);
      for (const to of [`a${c}b@example.com`, `${c}b@example.com`]) {
        let taken: string | undefined;
        try { taken = open(to); } catch { taken = undefined; }
        expect(taken, JSON.stringify(to)).toBe(isSingleDeliverableRecipient(to) ? to : undefined);
      }
    }
  });

  it("delivers only one argument after '--', whose form refuses an option, a second recipient, quotes and brackets", async () => {
    const message = Buffer.from("x");
    const spawned: string[][] = [];
    const recording = (_command: string, args: string[]) => { spawned.push(args); throw new Error("unexpected spawn"); };
    for (const recipient of ["-oQ/tmp@x.ro", "a b@x.ro", "a,b@x.ro", "a;b@x.ro", "\"q\"@x.ro", "Name <x@x.ro>", "<x@x.ro>", "a@x.ro, b@x.ro", "a@x.ro\r\nBcc: b@x.ro",
      "a\\b@x.ro", "two@at@x.ro", "nobody", "", "a\tb@x.ro"]) {
      await expect(mail.submitSiteMail({ message, recipient, deadline: Date.now() + 1000, spawnImpl: recording }), JSON.stringify(recipient)).rejects.toThrow(/^PREVIEW_MAIL_REFUSED$/);
    }
    expect(spawned).toEqual([]);
    const spy = spawnSpy();
    for (const recipient of ["o'neil@example.com", "a$b@example.com", "a`b@example.com"]) {
      await mail.submitSiteMail({ message, recipient, deadline: Date.now() + 1000, spawnImpl: spy.spawnImpl, killGroup: () => undefined });
      // Schema v1's delivery keeps today's narrower form.
      await expect(mail.submitTemplatedMail({ message, recipient, deadline: Date.now() + 1000, spawnImpl: recording })).rejects.toThrow(/^PREVIEW_MAIL_REFUSED$/);
    }
    expect(spawned).toEqual([]);
    expect(spy.starts.map(({ command, args }) => [command, args])).toEqual(["o'neil@example.com", "a$b@example.com", "a`b@example.com"]
      .map((recipient) => ["/usr/sbin/sendmail", ["-i", "-f", FROM, "--", recipient]]));
  });

  it("needs the API's own rule; without it every mail is refused", () => {
    expect(() => mail.openRecipient(undefined)).toThrow(/^PREVIEW_MAIL_REFUSED$/);
    expect(() => mail.allowListRecipient(undefined)).toThrow(/^PREVIEW_MAIL_REFUSED$/);
    expect(() => mail.openRecipient(() => "yes")(STRANGER)).toThrow(/^PREVIEW_MAIL_REFUSED$/);
  });
});

describe("allow-list mode in schema v2, with the synthetic allow-list", () => {
  const listed = mail.allowListRecipient(fixture.recipientPolicy);
  for (const family of FAMILIES) {
    it(`${family} mail: the proof and notice addresses get their own mail, the forward aliases go to the target, a stranger is refused`, async () => {
      for (const to of [PROOF, NOTICE]) {
        const message = await familyMail(family, to);
        const selected = mail.selectSiteMail(message, siteOptions(PREVIEW, listed));
        expect(selected).toMatchObject({ family, recipient: to });
        expect(selected.message.equals(message)).toBe(true);
      }
      for (const to of [PRIMARY, TARGET]) {
        const message = await familyMail(family, to);
        const selected = mail.selectSiteMail(message, siteOptions(PREVIEW, listed));
        expect(selected.recipient).toBe(TARGET);
        // Only To changes.
        expect(selected.message.toString("utf8")).toBe(message.toString("utf8").replace(`\r\nTo: ${to}\r\n`, `\r\nTo: ${TARGET}\r\n`));
      }
      refused(() => mail.selectSiteMail(Buffer.alloc(0), siteOptions(PREVIEW, listed)));
      const stranger = await familyMail(family, STRANGER);
      refused(() => mail.selectSiteMail(stranger, siteOptions(PREVIEW, listed)));
      expect(mail.selectSiteMail(stranger, siteOptions(PREVIEW, mail.openRecipient(isSingleDeliverableRecipient))).recipient).toBe(STRANGER);
    });
  }

  it("refuses options it does not know: another origin, another sender, no recipient rule", async () => {
    const message = await familyMail("templated", PROOF);
    for (const options of [siteOptions("https://example.com", listed), siteOptions(`${MAIN}/`, listed), { ...siteOptions(PREVIEW, listed), from: "noreply@example.com" }, siteOptions(PREVIEW, undefined)])
      refused(() => mail.selectSiteMail(message, options));
  });
});

/** A spawn spy: records each start and completes the child with exit 0 after stdin ends. */
function spawnSpy() {
  const starts: Array<{ command: string; args: string[]; opts: Record<string, unknown>; stdin: Buffer }> = [];
  const spawnImpl = (command: string, args: string[], opts: Record<string, unknown>) => {
    const child = new EventEmitter() as EventEmitter & { pid: number; stdin: PassThrough };
    const start = { command, args, opts, stdin: Buffer.alloc(0) };
    starts.push(start);
    child.pid = 44444; child.stdin = new PassThrough();
    child.stdin.on("data", (bytes: Buffer) => { start.stdin = Buffer.concat([start.stdin, bytes]); });
    child.stdin.on("finish", () => queueMicrotask(() => child.emit("close", 0, null)));
    return child;
  };
  return { starts, spawnImpl };
}
/** The calls a mail makes, in order; delivery goes through the real submitters with a spawn spy. */
function recordedIo(spy: ReturnType<typeof spawnSpy>) {
  const calls: string[] = [];
  const io = {
    readRecipientPolicy: async () => { calls.push("readRecipientPolicy"); return fixture.recipientPolicy; },
    assertExternalHelperHashes: async () => { calls.push("assertExternalHelperHashes"); },
    readMailInput: async (stream: unknown, options: unknown) => { calls.push("readMailInput"); return mail.readMailInput(stream, options); },
    submitOpaqueExternal: async (input: Record<string, unknown>) => { calls.push("submitOpaqueExternal"); return mail.submitOpaqueExternal({ ...input, spawnImpl: spy.spawnImpl, killGroup: () => undefined }); },
    submitVerification: async () => { calls.push("submitVerification"); },
    submitTemplatedMail: async (input: Record<string, unknown>) => { calls.push("submitTemplatedMail"); return mail.submitTemplatedMail({ ...input, spawnImpl: spy.spawnImpl, killGroup: () => undefined }); },
    submitSiteMail: async (input: Record<string, unknown>) => { calls.push("submitSiteMail"); return mail.submitSiteMail({ ...input, spawnImpl: spy.spawnImpl, killGroup: () => undefined }); }
  };
  return { calls, io };
}
const stdinOf = (message: Buffer) => { const stream = new PassThrough(); stream.end(Buffer.from(message)); return stream; };
const planOf = (file: Record<string, unknown>) => check.parseMailPlan(file, { apiUid: 1001, mailFrom: FROM });
const allowListPolicy = { path: "/etc/debateai-v3-preview/auth-dev-v1/mail-recipient.json", root: "/etc/debateai-v3-preview/auth-dev-v1", clientGid: 1001 };
const v1File = { schema: "preview-auth-dev-mail-v1", apiUid: 1001, mailFrom: FROM, publicAppUrl: PREVIEW, transportTimeoutMs: 5000, recipientPolicy: allowListPolicy };
const openFile = (origin = PREVIEW) => ({ schema: "preview-auth-dev-mail-v2", apiUid: 1001, mailFrom: FROM, publicAppUrl: origin, transportTimeoutMs: 5000, recipients: "open" });
const listFile = (origin = PREVIEW) => ({ ...openFile(origin), recipients: "allow-list", recipientPolicy: allowListPolicy });
async function deliver(file: Record<string, unknown>, message: Buffer) {
  const spy = spawnSpy(), { calls, io } = recordedIo(spy);
  const outcome = mail.deliverMail({ plan: planOf(file), argv: ARGV, api, deadline: Date.now() + 5000, stdin: stdinOf(message), io });
  return { outcome, calls, starts: spy.starts };
}

describe("one mail, dispatched by its plan", () => {
  it("v1 runs today's calls in today's order", async () => {
    const templated = await deliver(v1File, await familyMail("templated", PRIMARY));
    await templated.outcome;
    expect(templated.calls).toEqual(["readRecipientPolicy", "assertExternalHelperHashes", "readMailInput", "submitTemplatedMail"]);
    expect(templated.starts.map(({ command, args }) => [command, args])).toEqual([["/usr/sbin/sendmail", ["-i", "-f", FROM, "--", TARGET]]]);

    const external = await deliver(v1File, await familyMail("external", PROOF));
    await external.outcome;
    expect(external.calls).toEqual(["readRecipientPolicy", "assertExternalHelperHashes", "readMailInput", "submitOpaqueExternal"]);
    expect(external.starts.map(({ command, args }) => [command, args])).toEqual([[HELPER, ARGV]]);
  });

  it("v1 still refuses the API's current account mail, before any process starts", async () => {
    const account = await deliver(v1File, await familyMail("account", PROOF));
    await expect(account.outcome).rejects.toThrow(/^PREVIEW_MAIL_REFUSED$/);
    expect(account.calls).toEqual(["readRecipientPolicy", "assertExternalHelperHashes", "readMailInput"]);
    expect(account.starts).toEqual([]);
  });

  for (const origin of [PREVIEW, MAIN]) {
    it(`v2 open on ${origin} reads neither the allow-list nor the helper, and sends each family to its own To`, async () => {
      for (const family of FAMILIES) {
        const message = await familyMail(family, STRANGER, origin);
        const run = await deliver(openFile(origin), message);
        await run.outcome;
        expect(run.calls, family).toEqual(["readMailInput", "submitSiteMail"]);
        expect(run.starts).toHaveLength(1);
        expect(run.starts[0]).toMatchObject({ command: "/usr/sbin/sendmail", args: ["-i", "-f", FROM, "--", STRANGER],
          opts: { shell: false, detached: true, stdio: ["pipe", "ignore", "ignore"], env: { PATH: "/usr/sbin:/usr/bin:/bin" } } });
        expect(run.starts[0]!.stdin.equals(message)).toBe(true);
        expect(run.starts[0]!.args).not.toContain("-t");
      }
    });

    it(`v2 allow-list on ${origin} reads the allow-list once and never the helper`, async () => {
      for (const family of FAMILIES) {
        const run = await deliver(listFile(origin), await familyMail(family, PRIMARY, origin));
        await run.outcome;
        expect(run.calls, family).toEqual(["readRecipientPolicy", "readMailInput", "submitSiteMail"]);
        expect(run.starts.map(({ command, args }) => [command, args])).toEqual([["/usr/sbin/sendmail", ["-i", "-f", FROM, "--", TARGET]]]);
        const stranger = await deliver(listFile(origin), await familyMail(family, STRANGER, origin));
        await expect(stranger.outcome).rejects.toThrow(/^PREVIEW_MAIL_REFUSED$/);
        expect(stranger.starts).toEqual([]);
      }
    });
  }

  it("an address with ' ` or $ that sign-up accepts is delivered in open mode, and refused by the allow-list and by v1", async () => {
    for (const to of ["o'neil@example.com", "a$b@example.com", "a`b@example.com"]) {
      for (const family of FAMILIES) {
        const message = await familyMail(family, to);
        const opened = await deliver(openFile(), message);
        await opened.outcome;
        expect(opened.starts.map(({ command, args }) => [command, args]), `${family} ${to}`).toEqual([["/usr/sbin/sendmail", ["-i", "-f", FROM, "--", to]]]);
        expect(opened.starts[0]!.stdin.equals(message)).toBe(true);
        const listed = await deliver(listFile(), message);
        await expect(listed.outcome).rejects.toThrow(/^PREVIEW_MAIL_REFUSED$/);
        expect(listed.starts).toEqual([]);
        // v1 hands reset mail to the recovery helper, which keeps its own recipients; the hand-off itself never mails this address.
        const legacy = await deliver(v1File, message);
        await legacy.outcome.catch(() => undefined);
        expect(legacy.starts.filter(({ command }) => command !== HELPER)).toEqual([]);
      }
    }
  });

  it("a mail for the other origin is refused before any process starts", async () => {
    for (const family of ["account", "external"] as const) {
      const run = await deliver(openFile(MAIN), await familyMail(family, STRANGER, PREVIEW));
      await expect(run.outcome).rejects.toThrow(/^PREVIEW_MAIL_REFUSED$/);
      expect(run.starts).toEqual([]);
    }
  });

  it("closing works from the next mail: after the plan goes back to v1, a mail to a stranger is refused", async () => {
    const message = await familyMail("templated", STRANGER);
    const opened = await deliver(openFile(), message);
    await opened.outcome;
    expect(opened.starts.map(({ args }) => args.at(-1))).toEqual([STRANGER]);
    for (const file of [v1File, listFile()]) {
      const closed = await deliver(file, message);
      await expect(closed.outcome).rejects.toThrow(/^PREVIEW_MAIL_REFUSED$/);
      expect(closed.starts).toEqual([]);
    }
  });

  it("refuses a plan of no known mode, and wrong arguments, before reading stdin", async () => {
    const spy = spawnSpy(), { calls, io } = recordedIo(spy);
    await expect(mail.deliverMail({ plan: { ...planOf(openFile()), mode: "all" }, argv: ARGV, api, deadline: Date.now() + 5000, stdin: stdinOf(Buffer.from("x")), io })).rejects.toThrow();
    await expect(mail.deliverMail({ plan: planOf(openFile()), argv: ["-i", "-f", FROM], api, deadline: Date.now() + 5000, stdin: stdinOf(Buffer.from("x")), io })).rejects.toThrow();
    expect(calls).toEqual([]);
    expect(spy.starts).toEqual([]);
  });
});

describe("the mail program run as the API runs it", () => {
  it.each([["the API's arguments", ARGV], ["other arguments", ["-t", "-i"]]])("with %s and no plan file here, prints only PREVIEW_MAIL_REFUSED and exits 1", async (_name, args) => {
    const { spawn } = await import("node:child_process");
    const program = new URL("../../deploy/preview-auth-dev/v1/mail-handoff.mjs", import.meta.url).pathname;
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveRun) => {
      const child = spawn(process.execPath, [program, ...args], { env: { PATH: "/usr/bin:/bin" }, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      child.stdout.on("data", (bytes: Buffer) => { stdout += bytes.toString("utf8"); });
      child.stderr.on("data", (bytes: Buffer) => { stderr += bytes.toString("utf8"); });
      child.on("close", (code) => resolveRun({ code, stdout, stderr }));
      child.stdin.end("From: noreply@dezbatere.ro\r\nTo: stranger@example.com\r\n\r\nx\r\n");
    });
    expect(result).toEqual({ code: 1, stdout: "", stderr: "PREVIEW_MAIL_REFUSED\n" });
  }, 30_000);
});

describe("the hand-off's source keeps today's custody", () => {
  it("v2 never names the recovery helper or its pins; v1 still checks them", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../../deploy/preview-auth-dev/v1/mail-handoff.mjs", import.meta.url), "utf8");
    const v2Branch = source.slice(source.indexOf("export async function deliverMail"), source.indexOf("async function main"));
    const afterLegacy = v2Branch.slice(v2Branch.indexOf("if(plan.mode!=='open'&&plan.mode!=='allow-list')"));
    expect(afterLegacy.length).toBeGreaterThan(0);
    expect(afterLegacy).not.toMatch(/assertExternalHelperHashes|submitOpaqueExternal|submitVerification|submitTemplatedMail|EXTERNAL|PINS/);
    expect(afterLegacy).toContain("submitSiteMail");
    // The recovery helper's four pins are unchanged.
    for (const digest of ["67df14bcc4a05e92bd7aad74f82a498ba6c1f3290cbae54dc62cb72ddab5eb89", "0f6a89f6e9710c529e61b4b2635f09ce8ce58e4a69c556b2e936e5739da1bc9f",
      "0e284291323cec7ed8a8ba12015a5cbad7889af03779b85b6529af140cc07be6", "b6ce9c849b3baceead6938db5b97c53bbff46f4bbd3e1fe8856d8c75f129772b"]) expect(source).toContain(digest);
    // Any refusal still prints one line only.
    expect(source.split("process.stderr.write(").length - 1).toBe(1);
    expect(source).toContain("process.stderr.write('PREVIEW_MAIL_REFUSED\\n');process.exitCode=1;");
  });
});
