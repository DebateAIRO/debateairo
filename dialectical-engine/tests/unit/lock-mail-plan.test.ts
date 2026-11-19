// The owner's mail plan (/etc/debateai-v3-preview/auth-dev-v1/mail-plan.json): today's schema v1 stays the default and
// is accepted exactly as before; schema v2 names who may receive mail ("allow-list" or "open") on either public origin.
// Every half-set or contradictory plan is refused by name, at API start and at every mail.
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS, authPolicyFromRegisterRows } from "../../packages/register/src/auth-policy.js";

const check = await import("../../deploy/" + "preview-auth-dev/v1/start-check-mail.mjs");
const refusals = await import("../../deploy/" + "preview-auth-dev/v1/startup-refusals.mjs");

const PREVIEW = "https://v3-preview.dezbatere.ro";
const MAIN = "https://dezbatere.ro";
const FROM = "noreply@dezbatere.ro";
const UID = 1001;
const allowList = { path: "/etc/debateai-v3-preview/auth-dev-v1/mail-recipient.json", root: "/etc/debateai-v3-preview/auth-dev-v1", clientGid: 1001 };
const v1 = (extra: Record<string, unknown> = {}) => ({
  schema: "preview-auth-dev-mail-v1", apiUid: UID, mailFrom: FROM, publicAppUrl: PREVIEW, transportTimeoutMs: 5000, recipientPolicy: allowList, ...extra
});
const v2 = (recipients: string, extra: Record<string, unknown> = {}) => {
  const plan: Record<string, unknown> = { ...v1(), schema: "preview-auth-dev-mail-v2", recipients, ...extra };
  if (recipients === "open" && !Object.hasOwn(extra, "recipientPolicy")) delete plan.recipientPolicy;
  return plan;
};
const without = (plan: Record<string, unknown>, key: string) => { const copy = { ...plan }; delete copy[key]; return copy; };
const caller = { apiUid: UID, mailFrom: FROM };

/** The named code a refusal carries, read the way the launcher reads it. */
function codeOf(run: () => unknown): string | undefined {
  try { run(); } catch (error) {
    expect((error as Error).message).toBe("PREVIEW_ENVIRONMENT_REFUSED");
    return refusals.namedRefusal(error);
  }
  throw new Error("expected a refusal");
}
async function asyncCodeOf(run: () => Promise<unknown>): Promise<string | undefined> {
  try { await run(); } catch (error) {
    expect((error as Error).message).toBe("PREVIEW_ENVIRONMENT_REFUSED");
    return refusals.namedRefusal(error);
  }
  throw new Error("expected a refusal");
}

describe("parsing the mail plan", () => {
  it("accepts today's v1 file as legacy, on the test name only", () => {
    expect(check.parseMailPlan(v1(), caller)).toEqual({ mode: "legacy", apiUid: UID, mailFrom: FROM, publicAppUrl: PREVIEW, transportTimeoutMs: 5000, recipientPolicy: allowList });
    expect(codeOf(() => check.parseMailPlan(v1({ publicAppUrl: MAIN }), caller))).toBe("PREVIEW_MAIL_LEGACY_NEEDS_PREVIEW_ORIGIN");
  });

  it("accepts v2 open and v2 allow-list on each public origin", () => {
    for (const origin of [PREVIEW, MAIN]) {
      expect(check.parseMailPlan(v2("open", { publicAppUrl: origin }), caller)).toEqual({ mode: "open", apiUid: UID, mailFrom: FROM, publicAppUrl: origin, transportTimeoutMs: 5000 });
      expect(check.parseMailPlan(v2("allow-list", { publicAppUrl: origin }), caller)).toEqual({ mode: "allow-list", apiUid: UID, mailFrom: FROM, publicAppUrl: origin, transportTimeoutMs: 5000, recipientPolicy: allowList });
    }
  });

  it.each([
    ["an unknown schema", () => v1({ schema: "preview-auth-dev-mail-v3" }), "PREVIEW_MAIL_PLAN_SCHEMA"],
    ["no schema", () => without(v1(), "schema"), "PREVIEW_MAIL_PLAN_SCHEMA"],
    ["an array", () => [v1()], "PREVIEW_MAIL_PLAN_SCHEMA"],
    ["null", () => null, "PREVIEW_MAIL_PLAN_SCHEMA"],
    ["an extra key in v1", () => v1({ recipients: "open" }), "PREVIEW_MAIL_PLAN_SCHEMA"],
    ["a missing key in v1", () => without(v1(), "transportTimeoutMs"), "PREVIEW_MAIL_PLAN_SCHEMA"],
    ["an extra key in v2", () => v2("open", { note: "x" }), "PREVIEW_MAIL_PLAN_SCHEMA"],
    ["a missing key in v2", () => without(v2("allow-list"), "mailFrom"), "PREVIEW_MAIL_PLAN_SCHEMA"],
    ["v2 without recipients", () => without(v2("open"), "recipients"), "PREVIEW_MAIL_PLAN_SCHEMA"],
    ["recipients 'all'", () => v2("all"), "PREVIEW_MAIL_MODE_UNKNOWN"],
    ["recipients 'Open'", () => v2("Open"), "PREVIEW_MAIL_MODE_UNKNOWN"],
    ["recipients true", () => ({ ...v2("open"), recipients: true }), "PREVIEW_MAIL_MODE_UNKNOWN"],
    ["open with a recipientPolicy", () => v2("open", { recipientPolicy: allowList }), "PREVIEW_MAIL_OPEN_WITH_ALLOW_LIST"],
    ["open with a null recipientPolicy", () => v2("open", { recipientPolicy: null }), "PREVIEW_MAIL_OPEN_WITH_ALLOW_LIST"],
    ["allow-list without a recipientPolicy", () => without(v2("allow-list"), "recipientPolicy"), "PREVIEW_MAIL_PLAN_SCHEMA"],
    ["a text timeout", () => v2("open", { transportTimeoutMs: "5000" }), "PREVIEW_MAIL_PLAN_SCHEMA"],
    ["a text uid", () => v2("open", { apiUid: "1001" }), "PREVIEW_MAIL_PLAN_SCHEMA"],
    ["an http origin", () => v2("open", { publicAppUrl: "http://dezbatere.ro" }), "PREVIEW_MAIL_ORIGIN_NOT_ALLOWED"],
    ["an origin with a trailing slash", () => v2("open", { publicAppUrl: "https://dezbatere.ro/" }), "PREVIEW_MAIL_ORIGIN_NOT_ALLOWED"],
    ["an origin with a path", () => v2("open", { publicAppUrl: "https://dezbatere.ro/app" }), "PREVIEW_MAIL_ORIGIN_NOT_ALLOWED"],
    ["a look-alike origin", () => v2("open", { publicAppUrl: "https://dezbatere.ro.evil.example" }), "PREVIEW_MAIL_ORIGIN_NOT_ALLOWED"],
    ["the www name", () => v2("open", { publicAppUrl: "https://www.dezbatere.ro" }), "PREVIEW_MAIL_ORIGIN_NOT_ALLOWED"],
    ["a v1 plan on an unlisted origin", () => v1({ publicAppUrl: "https://example.com" }), "PREVIEW_MAIL_ORIGIN_NOT_ALLOWED"],
    ["apiUid 0", () => v2("open", { apiUid: 0 }), "PREVIEW_MAIL_UID_MISMATCH"],
    ["another uid", () => v2("open", { apiUid: UID + 1 }), "PREVIEW_MAIL_UID_MISMATCH"],
    ["apiUid 0 in v1", () => v1({ apiUid: 0 }), "PREVIEW_MAIL_UID_MISMATCH"],
    ["another From", () => v2("open", { mailFrom: "billing@dezbatere.ro" }), "PREVIEW_MAIL_FROM_MISMATCH"],
    ["another From in v1", () => v1({ mailFrom: "noreply@example.com" }), "PREVIEW_MAIL_FROM_MISMATCH"]
  ])("refuses %s", (_name, make, code) => {
    expect(codeOf(() => check.parseMailPlan(make(), caller))).toBe(code);
  });

  it("refuses a plan when the caller is root, even if the plan says root", () => {
    expect(codeOf(() => check.parseMailPlan(v2("open", { apiUid: 0 }), { apiUid: 0, mailFrom: FROM }))).toBe("PREVIEW_MAIL_UID_MISMATCH");
  });

  it("every refusal code it can give is a named code the launcher prints", () => {
    for (const code of ["PREVIEW_MAIL_PLAN_UNREADABLE", "PREVIEW_MAIL_PLAN_SCHEMA", "PREVIEW_MAIL_MODE_UNKNOWN", "PREVIEW_MAIL_OPEN_WITH_ALLOW_LIST",
      "PREVIEW_MAIL_ALLOW_LIST_UNREADABLE", "PREVIEW_MAIL_ORIGIN_NOT_ALLOWED", "PREVIEW_MAIL_ORIGIN_MISMATCH", "PREVIEW_MAIL_LEGACY_NEEDS_PREVIEW_ORIGIN",
      "PREVIEW_MAIL_FROM_MISMATCH", "PREVIEW_MAIL_UID_MISMATCH", "PREVIEW_MAIL_TIMEOUT_MISMATCH"]) expect(refusals.isNamedRefusal(code), code).toBe(true);
  });

  it("reads the fixed root-owned file only, and names an unreadable one", async () => {
    expect(check.MAIL_PLAN_PATH).toBe("/etc/debateai-v3-preview/auth-dev-v1/mail-plan.json");
    // No such file on a development machine.
    expect(await asyncCodeOf(() => check.readMailPlan())).toBe("PREVIEW_MAIL_PLAN_UNREADABLE");
  });
});

describe("the mail check at API start", () => {
  const launch = (origin = PREVIEW, uid = UID, from = FROM) => ({ plan: { serviceUid: uid, serviceGid: 1001 }, configured: { PUBLIC_APP_URL: origin, MAIL_FROM: from }, selected: {} });
  async function start(file: unknown, at: ReturnType<typeof launch>, readAllowList: (policy: unknown) => Promise<unknown> = async () => () => "x") {
    const lines: string[] = [], reads: unknown[] = [];
    await check.checkMailAtStart(at, { readPlan: async () => file, readAllowList: async (policy: unknown) => { reads.push(policy); return readAllowList(policy); }, write: (line: string) => lines.push(line) });
    return { lines, reads };
  }
  const MODE_LINE = /^PREVIEW_MAIL_MODE \{"mode":"(?:legacy|allow-list|open)","origin":"https:\/\/(?:v3-preview\.)?dezbatere\.ro"\}\n$/;

  it("prints legacy for today's file on the test name, and reads no allow-list at start", async () => {
    const { lines, reads } = await start(v1(), launch());
    expect(lines).toEqual([`PREVIEW_MAIL_MODE {"mode":"legacy","origin":"${PREVIEW}"}\n`]);
    expect(reads).toEqual([]);
  });

  it("prints open or allow-list on either origin; allow-list reads the allow-list once", async () => {
    for (const origin of [PREVIEW, MAIN]) {
      const open = await start(v2("open", { publicAppUrl: origin }), launch(origin));
      expect(open.lines).toEqual([`PREVIEW_MAIL_MODE {"mode":"open","origin":"${origin}"}\n`]);
      expect(open.reads).toEqual([]);
      const listed = await start(v2("allow-list", { publicAppUrl: origin }), launch(origin));
      expect(listed.lines).toEqual([`PREVIEW_MAIL_MODE {"mode":"allow-list","origin":"${origin}"}\n`]);
      expect(listed.reads).toEqual([allowList]);
      for (const line of [...open.lines, ...listed.lines]) {
        expect(line).toMatch(MODE_LINE);
        expect(line).not.toMatch(/@|[0-9a-f]{64}|mail-recipient|1001/);
      }
    }
  });

  it.each([
    ["the plan names the main site while the API answers as the test name", () => v2("open", { publicAppUrl: MAIN }), PREVIEW, "PREVIEW_MAIL_ORIGIN_MISMATCH"],
    ["the plan names the test name while the API answers as the main site", () => v2("allow-list"), MAIN, "PREVIEW_MAIL_ORIGIN_MISMATCH"],
    ["today's file while the API answers as the main site", () => v1(), MAIN, "PREVIEW_MAIL_LEGACY_NEEDS_PREVIEW_ORIGIN"],
    ["a v1 file naming the main site", () => v1({ publicAppUrl: MAIN }), MAIN, "PREVIEW_MAIL_LEGACY_NEEDS_PREVIEW_ORIGIN"],
    ["recipients 'all'", () => v2("all"), PREVIEW, "PREVIEW_MAIL_MODE_UNKNOWN"],
    ["open with an allow-list", () => v2("open", { recipientPolicy: allowList }), PREVIEW, "PREVIEW_MAIL_OPEN_WITH_ALLOW_LIST"]
  ])("refuses when %s", async (_name, file, origin, code) => {
    expect(await asyncCodeOf(() => start(file(), launch(origin)))).toBe(code);
  });

  it("refuses a transport timeout other than the API's own, which the hand-off would refuse at every mail", async () => {
    // The value the hand-off compares the plan with at every mail (mail-handoff.mjs main).
    const source = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS).channel.transportTimeoutMs;
    for (const [file, origin, mode] of [[v1, PREVIEW, "legacy"], [(extra: Record<string, unknown>) => v2("open", { publicAppUrl: MAIN, ...extra }), MAIN, "open"],
      [(extra: Record<string, unknown>) => v2("allow-list", extra), PREVIEW, "allow-list"]] as const) {
      expect((await start(file({ transportTimeoutMs: source }), launch(origin))).lines).toEqual([`PREVIEW_MAIL_MODE {"mode":"${mode}","origin":"${origin}"}\n`]);
      for (const other of [source + 1, source - 1, 6000, 1]) {
        if (other === source) continue;
        const lines: string[] = [];
        expect(await asyncCodeOf(() => check.checkMailAtStart(launch(origin), { readPlan: async () => file({ transportTimeoutMs: other }), readAllowList: async () => () => "x", write: (line: string) => lines.push(line) })))
          .toBe("PREVIEW_MAIL_TIMEOUT_MISMATCH");
        expect(lines).toEqual([]);
      }
    }
  });

  it("compares the plan with the unit's user and the API's sender", async () => {
    expect(await asyncCodeOf(() => start(v2("open"), launch(PREVIEW, UID + 1)))).toBe("PREVIEW_MAIL_UID_MISMATCH");
    expect(await asyncCodeOf(() => start(v2("open"), launch(PREVIEW, UID, "noreply@example.com")))).toBe("PREVIEW_MAIL_FROM_MISMATCH");
  });

  it("refuses allow-list mode when the allow-list does not read, and prints no mode line", async () => {
    const lines: string[] = [];
    expect(await asyncCodeOf(() => check.checkMailAtStart(launch(), { readPlan: async () => v2("allow-list"), readAllowList: async () => { throw new TypeError("PREVIEW_MAIL_REFUSED"); }, write: (line: string) => lines.push(line) })))
      .toBe("PREVIEW_MAIL_ALLOW_LIST_UNREADABLE");
    // Through the hand-off's own reader: no such file on a development machine.
    expect(await asyncCodeOf(() => check.checkMailAtStart(launch(), { readPlan: async () => v2("allow-list"), write: (line: string) => lines.push(line) })))
      .toBe("PREVIEW_MAIL_ALLOW_LIST_UNREADABLE");
    expect(lines).toEqual([]);
  });

  it("refuses an unreadable plan file by name, and the launcher prints the name only", async () => {
    let thrown: unknown;
    try { await check.checkMailAtStart(launch(), { write: () => { throw new Error("no line expected"); } }); } catch (error) { thrown = error; }
    expect(refusals.startupRefusedLine("PREVIEW_API_STARTUP_REFUSED", thrown)).toBe("PREVIEW_API_STARTUP_REFUSED PREVIEW_MAIL_PLAN_UNREADABLE");
  });

  it("loads from the shared tools folder on its own: no tsx, no frozen transport, no package", async () => {
    // The upload checker loads every non-release tool from a copy of the deploy folders alone (tools/upload-check/tools-folder.mjs).
    const folder = await mkdtemp(join(tmpdir(), "lock-mail-tools-"));
    try {
      const operator = resolve("deploy/preview-auth-dev/v1");
      for (const name of (await readdir(operator)).filter((file) => file.endsWith(".mjs"))) await copyFile(join(operator, name), join(folder, name));
      const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", "const m=await import('./start-check-mail.mjs');process.stdout.write(typeof m.checkMailAtStart)"],
        { cwd: folder, env: { PATH: "/usr/bin:/bin" }, timeout: 30_000 });
      expect(stdout).toBe("function");
    } finally { await rm(folder, { recursive: true, force: true }); }
  }, 60_000);
});
