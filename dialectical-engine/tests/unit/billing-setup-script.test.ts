// tests/unit/billing-setup-script.test.ts
// N21 (spec 2026-10-05 §2.17.2): the guided setup, run in a temporary root with its answers on standard input (the
// script's test-only switch, refused anywhere else). The files, their modes and owners, the one block of api.env, the
// commented duplicates, the backup, the refusals, and that no answer is ever printed.
import { execFileSync, spawn } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(process.cwd(), "deploy/vps/billing-setup.sh");
const PUBLISHED = resolve(process.cwd(), "deploy/vps/netopia/published-ipn-key.pem");
const POS = ["QW12", "ER34", "TY56", "UI78", "OP90"].join("-");
const API_KEY = ["netopia", "setup", "key", "6b1f"].join("-");
const NEW_API_KEY = ["netopia", "setup", "key", "live", "77c0"].join("-");
const QUADERNO_KEY = ["quaderno", "setup", "key", "93ad"].join("-");
const NEW_QUADERNO_KEY = ["quaderno", "setup", "key", "second", "c41e"].join("-");
const SMARTBILL_TOKEN = ["smartbill", "setup", "token", "4e7c"].join("-");
const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
const FINGERPRINT = createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex");
const ORIGINAL_ENV = [
  "# The API's settings.",
  "PUBLIC_APP_URL=https://dezbatere.test",
  "NETOPIA_POS_SIGNATURE=OLD1-OLD2-OLD3-OLD4-OLD5",
  "export QUADERNO_API_BASE_URL=https://old.quadernoapp.com/api",
  "DATABASE_URL=postgres://api@localhost/debateai",
  ""
].join("\n");
const ALL_ANSWERS = [
  "sandbox", "not-a-pos", POS, API_KEY, "2", ...PEM.trimEnd().split("\n"), "",
  "https://debateai.sandbox-quadernoapp.com/api", QUADERNO_KEY,
  "https://smartbill.invalid/SBORO/api", "DBAI", "api@dezbatere.test", SMARTBILL_TOKEN,
  "owner@example.test"
];

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function stage(env: string = ORIGINAL_ENV): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "billing-setup-"));
  roots.push(root);
  await writeFile(join(root, ".billing-setup-test-root"), "");
  await mkdir(join(root, "etc/debateai/api"), { recursive: true });
  await writeFile(join(root, "etc/debateai/api.env"), env);
  await chmod(join(root, "etc/debateai/api.env"), 0o640);
  return root;
}

function run(args: readonly string[], answers: readonly string[]): Promise<{ code: number; output: string }> {
  return new Promise((done, fail) => {
    const child = spawn("bash", [SCRIPT, ...args], {
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", TMPDIR: tmpdir() }, stdio: ["pipe", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.on("error", fail);
    child.on("close", (code) => done({ code: code ?? -1, output }));
    child.stdin.on("error", () => undefined);
    child.stdin.end(answers.map((answer) => `${answer}\n`).join(""));
  });
}

const mode = async (path: string): Promise<number> => (await stat(path)).mode & 0o777;
const backupsOf = async (root: string): Promise<string[]> =>
  (await readdir(join(root, "etc/debateai"))).filter((name) => name.startsWith("api.env.bak-")).sort();

describe("N21 deploy/vps/billing-setup.sh", () => {
  it("is strict bash that never traces its commands", async () => {
    const script = await readFile(SCRIPT, "utf8");
    expect(script.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(script).toContain("set -euo pipefail");
    expect(script).not.toMatch(/set -[a-z]*x|set -o xtrace|<<</u);
    expect(script).toContain("systemd-ask-password");
    // The hidden prompt waits while the owner fetches the key from NETOPIA's, Quaderno's or SmartBill's admin
    // (systemd-ask-password gives up after 90 s by default).
    expect(script).toContain("systemd-ask-password --timeout=0");
    // Committed executable, as vps-deployment-baseline.test.ts pins geoip-refresh.sh.
    expect(execFileSync("git", ["ls-files", "-s", "--", "deploy/vps/billing-setup.sh"], { cwd: process.cwd(), encoding: "utf8" }))
      .toMatch(/^100755 /u);
  });

  it("writes every key file with its mode and owner, one block in api.env, the backup, and prints no answer", async () => {
    const root = await stage();
    const { code, output } = await run(["--test-root", root], ALL_ANSWERS);
    expect(code, output).toBe(0);
    const billing = join(root, "etc/debateai/api/billing");
    expect(await mode(billing)).toBe(0o700);
    const files = [
      ["netopia-api-key", API_KEY], ["quaderno-api-key", QUADERNO_KEY],
      ["smartbill-credentials", `api@dezbatere.test:${SMARTBILL_TOKEN}`], ["owner-report-email", "owner@example.test"]
    ] as const;
    for (const [name, content] of files) {
      expect(await readFile(join(billing, name), "utf8"), name).toBe(`${content}\n`);
      expect(await mode(join(billing, name)), name).toBe(0o600);
    }
    expect(await readFile(join(billing, "netopia-ipn-keys.pem"), "utf8")).toBe(PEM.endsWith("\n") ? PEM : `${PEM}\n`);
    expect(await mode(join(billing, "netopia-ipn-keys.pem"))).toBe(0o644);
    expect((await readdir(billing)).filter((name) => name.startsWith("."))).toEqual([]);
    const owners = new Set((await readFile(join(root, ".billing-setup-owners"), "utf8")).trim().split("\n"));
    expect(owners).toEqual(new Set([
      "debateai-api:debateai-api etc/debateai/api/billing",
      "debateai-api:debateai-api etc/debateai/api/billing/netopia-api-key",
      "root:root etc/debateai/api/billing/netopia-ipn-keys.pem",
      "debateai-api:debateai-api etc/debateai/api/billing/quaderno-api-key",
      "debateai-api:debateai-api etc/debateai/api/billing/smartbill-credentials",
      "debateai-api:debateai-api etc/debateai/api/billing/owner-report-email"
    ]));
    const env = await readFile(join(root, "etc/debateai/api.env"), "utf8");
    expect(env).toContain([
      "# >>> billing settings (billing-setup.sh) >>>",
      "NETOPIA_API_BASE_URL=https://secure-sandbox.netopia-payments.com",
      `NETOPIA_POS_SIGNATURE=${POS}`,
      "NETOPIA_API_KEY_PATH=/etc/debateai/api/billing/netopia-api-key",
      "NETOPIA_IPN_KEYS_PATH=/etc/debateai/api/billing/netopia-ipn-keys.pem",
      "QUADERNO_API_BASE_URL=https://debateai.sandbox-quadernoapp.com/api",
      "QUADERNO_API_KEY_PATH=/etc/debateai/api/billing/quaderno-api-key",
      "SMARTBILL_API_BASE_URL=https://smartbill.invalid/SBORO/api",
      "SMARTBILL_SERIES=DBAI",
      "SMARTBILL_CREDENTIALS_PATH=/etc/debateai/api/billing/smartbill-credentials",
      "OWNER_REPORT_EMAIL_PATH=/etc/debateai/api/billing/owner-report-email",
      "# <<< billing settings <<<"
    ].join("\n"));
    expect(env.startsWith("# The API's settings.\nPUBLIC_APP_URL=https://dezbatere.test\n")).toBe(true);
    expect(env).toContain("\nDATABASE_URL=postgres://api@localhost/debateai\n");
    expect(env).toMatch(/^# billing-setup\.sh \d{8}T\d{6}Z: now set in the billing settings block: NETOPIA_POS_SIGNATURE=OLD1-OLD2-OLD3-OLD4-OLD5$/mu);
    expect(env).toMatch(/^# billing-setup\.sh \d{8}T\d{6}Z: now set in the billing settings block: export QUADERNO_API_BASE_URL=https:\/\/old\.quadernoapp\.com\/api$/mu);
    expect(env).not.toMatch(/^(export\s+)?NETOPIA_POS_SIGNATURE=OLD/mu);
    expect(await mode(join(root, "etc/debateai/api.env"))).toBe(0o640);
    const backups = await backupsOf(root);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^api\.env\.bak-\d{8}T\d{6}Z$/u);
    expect(await readFile(join(root, "etc/debateai", backups[0]!), "utf8")).toBe(ORIGINAL_ENV);
    expect(await mode(join(root, "etc/debateai", backups[0]!))).toBe(0o640);
    for (const answer of [API_KEY, QUADERNO_KEY, SMARTBILL_TOKEN, POS, "owner@example.test"]) expect(output).not.toContain(answer);
    expect(output).toContain("That does not look right; please type it again.");
    expect(output).toContain(`SHA-256 ${FINGERPRINT}, not NETOPIA's published plugin key: confirm this fingerprint with NETOPIA.`);
    expect(output).toContain("Test root: the check command is not run.");
  });

  it("keeps existing key files and values on a second run, replaces only what --replace names, and keeps one block", async () => {
    const root = await stage();
    expect((await run(["--test-root", root], ALL_ANSWERS)).code).toBe(0);
    const again = await run(["--test-root", root, "netopia"], ["", ""]);
    expect(again.code, again.output).toBe(0);
    expect(again.output).toContain("Kept the existing netopia-api-key (run with --replace netopia to change it).");
    expect(again.output).toContain("Kept the existing netopia-ipn-keys.pem (run with --replace netopia to change it).");
    const billing = join(root, "etc/debateai/api/billing");
    expect(await readFile(join(billing, "netopia-api-key"), "utf8")).toBe(`${API_KEY}\n`);
    const replaced = await run(["--test-root", root, "--replace", "netopia"], ["live", "", NEW_API_KEY, "1"]);
    expect(replaced.code, replaced.output).toBe(0);
    expect(await readFile(join(billing, "netopia-api-key"), "utf8")).toBe(`${NEW_API_KEY}\n`);
    expect(await mode(join(billing, "netopia-api-key"))).toBe(0o600);
    expect(await readFile(join(billing, "netopia-ipn-keys.pem"), "utf8")).toBe(await readFile(PUBLISHED, "utf8"));
    expect(replaced.output).toContain("NETOPIA's published plugin key.");
    expect(await readFile(join(billing, "quaderno-api-key"), "utf8")).toBe(`${QUADERNO_KEY}\n`);
    const env = await readFile(join(root, "etc/debateai/api.env"), "utf8");
    expect(env.match(/^# >>> billing settings \(billing-setup\.sh\) >>>$/gmu)).toHaveLength(1);
    expect(env.match(/^# <<< billing settings <<<$/gmu)).toHaveLength(1);
    expect(env).toContain("\nNETOPIA_API_BASE_URL=https://secure.netopia-payments.com/api\n");
    expect(env).toContain(`\nNETOPIA_POS_SIGNATURE=${POS}\n`);
    expect(env).toContain("\nQUADERNO_API_BASE_URL=https://debateai.sandbox-quadernoapp.com/api\n");
    expect(await backupsOf(root)).toHaveLength(3);
    for (const output of [again.output, replaced.output]) {
      for (const answer of [API_KEY, NEW_API_KEY, POS]) expect(output).not.toContain(answer);
    }
  });

  it("gives up after three wrong answers and writes nothing", async () => {
    const root = await stage();
    const refused = await run(["--test-root", root, "netopia"], ["sandbox", "x", "y", "z"]);
    expect(refused.code).toBe(1);
    expect(refused.output).toContain("BILLING_SETUP_ANSWER_INVALID:NETOPIA_POS_SIGNATURE");
    expect(await readFile(join(root, "etc/debateai/api.env"), "utf8")).toBe(ORIGINAL_ENV);
    expect(await backupsOf(root)).toEqual([]);
    expect((await readdir(join(root, "etc/debateai"))).filter((name) => name.startsWith("."))).toEqual([]);
  });

  it("leaves every key file, api.env and the backups as they were when a run stops before its end", async () => {
    const root = await stage();
    expect((await run(["--test-root", root], ALL_ANSWERS)).code).toBe(0);
    const billing = join(root, "etc/debateai/api/billing");
    const keysBefore = await readFile(join(billing, "netopia-ipn-keys.pem"));
    const envBefore = await readFile(join(root, "etc/debateai/api.env"));
    const leftovers = async () => [
      ...(await readdir(billing)).filter((name) => name.startsWith(".")),
      ...(await readdir(join(root, "etc/debateai"))).filter((name) => name.startsWith("."))
    ];

    const netopia = await run(["--test-root", root, "--replace", "netopia"], ["live", "", NEW_API_KEY, "3", "3", "3"]);
    expect(netopia.code, netopia.output).toBe(1);
    expect(netopia.output).toContain("BILLING_SETUP_ANSWER_INVALID:NETOPIA_IPN_KEYS");
    expect(await readFile(join(billing, "netopia-api-key"), "utf8")).toBe(`${API_KEY}\n`);
    expect((await readFile(join(billing, "netopia-ipn-keys.pem"))).equals(keysBefore)).toBe(true);
    expect((await readFile(join(root, "etc/debateai/api.env"))).equals(envBefore)).toBe(true);
    expect(await backupsOf(root)).toHaveLength(1);
    expect(await leftovers()).toEqual([]);
    expect(netopia.output).not.toContain(NEW_API_KEY);
    expect(netopia.output).not.toContain("Saved ");

    const invoicers = await run(["--test-root", root, "--replace", "quaderno", "--replace", "smartbill"],
      ["", NEW_QUADERNO_KEY, "http://x", "http://x", "http://x"]);
    expect(invoicers.code, invoicers.output).toBe(1);
    expect(invoicers.output).toContain("BILLING_SETUP_ANSWER_INVALID:SMARTBILL_API_BASE_URL");
    expect(await readFile(join(billing, "quaderno-api-key"), "utf8")).toBe(`${QUADERNO_KEY}\n`);
    expect((await readFile(join(root, "etc/debateai/api.env"))).equals(envBefore)).toBe(true);
    expect(await backupsOf(root)).toHaveLength(1);
    expect(await leftovers()).toEqual([]);
    expect(invoicers.output).not.toContain(NEW_QUADERNO_KEY);
  });

  it("refuses a damaged block before asking anything", async () => {
    const root = await stage(`${ORIGINAL_ENV}# >>> billing settings (billing-setup.sh) >>>\nSMARTBILL_SERIES=X\n`);
    const refused = await run(["--test-root", root, "quaderno"], ["https://a.sandbox-quadernoapp.com/api", QUADERNO_KEY]);
    expect(refused.code).toBe(1);
    expect(refused.output).toContain("BILLING_SETUP_BLOCK_DAMAGED");
    expect(await backupsOf(root)).toEqual([]);
    await expect(stat(join(root, "etc/debateai/api/billing/quaderno-api-key"))).rejects.toThrow();
  });

  it("refuses its test switch outside a marked temporary root, and refuses to run for real without root", async () => {
    const unmarked = await mkdtemp(join(tmpdir(), "billing-setup-unmarked-"));
    roots.push(unmarked);
    for (const args of [["--test-root", unmarked], ["--test-root", "/"], ["--test-root", "relative/root"]]) {
      const refused = await run(args, []);
      expect([refused.code, refused.output.trim()], args.join(" ")).toEqual([2, "BILLING_SETUP_TEST_ROOT_REFUSED"]);
    }
    for (const args of [["--test-root"], ["everything"], ["--replace", "nothing"]]) {
      const usage = await run(args, []);
      expect([usage.code, usage.output.trim()], args.join(" ")).toEqual([2, "BILLING_SETUP_USAGE"]);
    }
    if (process.getuid?.() !== 0) {
      const real = await run(["netopia"], []);
      expect(real.code).toBe(2);
      expect(real.output).toContain("BILLING_SETUP_NOT_ROOT");
    }
  });
});
