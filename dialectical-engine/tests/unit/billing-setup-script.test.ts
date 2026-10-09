// tests/unit/billing-setup-script.test.ts
// N21 (spec 2026-10-05 §2.17.2): the guided setup, run in a temporary root with its answers on standard input (the
// script's test-only switch, refused anywhere else). The files, their modes and owners, the one block of api.env, the
// commented duplicates, the backup, the refusals, and that no answer is ever printed. F1 (final review protocol-1): the
// API's folder belongs to debateai-api, so a planted link is refused before anything is asked, every write there runs
// as that user, and root's one act there is a checked rename of the public-key file by its bare name.
import { execFileSync, spawn } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
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
// The test root's owner rule: the owner of etc/debateai/api is recorded the way the script records the owners it gives.
const API_FOLDER_OWNER = "debateai-api:debateai-api etc/debateai/api";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function stage(env: string = ORIGINAL_ENV): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "billing-setup-"));
  roots.push(root);
  await writeFile(join(root, ".billing-setup-test-root"), "");
  await mkdir(join(root, "etc/debateai/api"), { recursive: true });
  await writeFile(join(root, ".billing-setup-owners"), `${API_FOLDER_OWNER}\n`);
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
      API_FOLDER_OWNER,
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

  // F1 (a) and (b): a link the API's user planted, at the billing folder or at the API's folder itself, is refused
  // before the first question, and the folder it points to keeps its mode and its contents.
  for (const [planted, label] of [
    ["etc/debateai/api/billing", "the billing folder"], ["etc/debateai/api", "the API's folder"]
  ] as const) {
    it(`refuses ${label} as a link before asking anything, and leaves the link's target as it was`, async () => {
      const root = await stage();
      const target = await mkdtemp(join(tmpdir(), "billing-setup-target-"));
      roots.push(target);
      await writeFile(join(target, "kept.txt"), "the target's own file\n");
      await chmod(join(target, "kept.txt"), 0o644);
      await chmod(target, 0o755);
      if (planted === "etc/debateai/api") await rm(join(root, planted), { recursive: true });
      await symlink(target, join(root, planted));
      const refused = await run(["--test-root", root], ALL_ANSWERS);
      expect(refused.code, refused.output).toBe(1);
      expect(refused.output).toContain("BILLING_SETUP_UNSAFE_FOLDER");
      expect(refused.output).not.toContain("== NETOPIA Payments ==");
      expect(await mode(target)).toBe(0o755);
      expect((await readdir(target)).sort()).toEqual(["kept.txt"]);
      expect(await readFile(join(target, "kept.txt"), "utf8")).toBe("the target's own file\n");
      expect(await mode(join(target, "kept.txt"))).toBe(0o644);
      expect(await readFile(join(root, "etc/debateai/api.env"), "utf8")).toBe(ORIGINAL_ENV);
      expect(await backupsOf(root)).toEqual([]);
      expect((await readdir(join(root, "etc/debateai"))).filter((name) => name.startsWith("."))).toEqual([]);
    });
  }

  it("refuses an API folder or a billing folder that is not the API user's", async () => {
    const strange = await stage();
    await writeFile(join(strange, ".billing-setup-owners"), "");
    const notTheApis = await run(["--test-root", strange], ALL_ANSWERS);
    expect(notTheApis.code, notTheApis.output).toBe(1);
    expect(notTheApis.output).toContain("BILLING_SETUP_UNSAFE_FOLDER");
    const root = await stage();
    await mkdir(join(root, "etc/debateai/api/billing"), { mode: 0o755 });
    const billingNotTheApis = await run(["--test-root", root], ALL_ANSWERS);
    expect(billingNotTheApis.code, billingNotTheApis.output).toBe(1);
    expect(billingNotTheApis.output).toContain("BILLING_SETUP_UNSAFE_FOLDER");
    expect(await mode(join(root, "etc/debateai/api/billing"))).toBe(0o755);
    expect(await readdir(join(root, "etc/debateai/api/billing"))).toEqual([]);
  });

  // F1 (c): the textual pin. Outside as_api (which runs as debateai-api on the server) and commit_trusted_keys (root's
  // one checked rename), no command that writes, moves, removes or sets a mode names a path in the API's folder: every
  // variable such a line uses is one of root's own places, and none takes a positional argument.
  it("never writes, moves or sets a mode as root in the API's folder, apart from one checked rename by a bare name", async () => {
    const lines = (await readFile(SCRIPT, "utf8")).split("\n");
    const body = (name: string): { start: number; end: number } => {
      const start = lines.findIndex((line) => line.startsWith(`${name}() {`));
      const end = lines.findIndex((line, index) => index > start && line === "}");
      expect([start >= 0, end > start], name).toEqual([true, true]);
      return { start, end };
    };
    const api = body("as_api");
    const keys = body("commit_trusted_keys");
    const rewrite = body("rewrite_api_env");
    const within = (index: number, range: { start: number; end: number }): boolean => index > range.start && index < range.end;
    const writer = /\b(chmod|chown|mkdir|mktemp|mv|cp|rm|ln|install|touch|tee|truncate|dd)\b|\bcat\s*>/u;
    // KEYS_STAGED is only a number in the name of a file in $WORK.
    const rootPlaces = new Set(["WORK", "KEYS_STAGED", "API_ENV", "PUBLISHED_KEY", "PENDING", "backup"]);
    const checked: string[] = [];
    lines.forEach((line, index) => {
      if (within(index, api) || within(index, keys) || /^\s*#/u.test(line)) return;
      // Each command of the line on its own (split at ; && || |), so a test beside a write is not read as its operand.
      for (const command of line.split(/;|&&|\|\||\|/u).filter((part) => writer.test(part))) {
        checked.push(command.trim());
        expect(command, `line ${index + 1}`).not.toMatch(/BILLING_DIR|KEYS_FILE|billing\/|\$\{?[0-9@*]/u);
        for (const [, name] of command.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/gu)) {
          const allowed = rootPlaces.has(name!) || (name === "tmp" && within(index, rewrite));
          expect(allowed, `line ${index + 1} uses $${name}: ${line}`).toBe(true);
        }
      }
    });
    // The pin reads real lines: root's own writes are among them.
    expect(checked).toContain('mv -f "$tmp" "$API_ENV"');
    expect(checked).toContain('then rm -rf "$WORK"');
    expect(checked).toContain('chmod 0644 "$WORK/netopia-ipn-keys.$KEYS_STAGED"');

    // The one function that changes directory into the API's folder, and the only line that does.
    const cds = lines.flatMap((line, index) => (/(^|[\s;(&|])cd\s/u.test(line) && !/^\s*#/u.test(line) ? [index] : []));
    const intoBilling = cds.filter((index) => /BILLING_DIR|KEYS_FILE|billing/u.test(lines[index]!));
    expect(intoBilling).toHaveLength(1);
    expect(within(intoBilling[0]!, keys)).toBe(true);
    expect(lines[intoBilling[0]!]).toMatch(/^\s*cd -P -- "\$BILLING_DIR" \|\| refuse /u);
    expect(cds.filter((index) => within(index, keys))).toEqual(intoBilling);

    // Inside it: the owner of '.', then its device against the work folder's, then one rename by the bare name.
    const keyLines = lines.slice(keys.start + 1, keys.end);
    const at = (pattern: RegExp): number[] => keyLines.flatMap((line, index) => (pattern.test(line) ? [index] : []));
    const owner = at(/\[ "\$\(stat -c %U \.\)" = debateai-api \] \|\| refuse /u);
    const device = at(/\[ "\$\(stat -c %d \.\)" = "\$\(stat -c %d -- "\$WORK"\)" \] \|\| refuse /u);
    const renameT = at(/\bmv -fT -- /u);
    expect([owner.length, device.length, renameT.length]).toEqual([1, 1, 1]);
    expect(owner[0]!).toBeLessThan(device[0]!);
    expect(device[0]!).toBeLessThan(renameT[0]!);
    expect(keyLines[renameT[0]!]).toMatch(/\bmv -fT -- "\$WORK\/[^"\s]+" netopia-ipn-keys\.pem( |$)/u);
    for (const index of at(/\bmv\b/u)) {
      expect(keyLines[index], "every rename in it names the bare file").toMatch(/\bmv -fT? -- "\$WORK\/[^"\s]+" netopia-ipn-keys\.pem( |$)/u);
      expect(index, "after both checks").toBeGreaterThan(device[0]!);
    }
    expect(keyLines.filter((line) => /\b(chmod|chown|mkdir|mktemp|cp|pwd)\b|\bcat\s*>/u.test(line))).toEqual([]);

    // The API user's function: a fixed body run through runuser, the paths as arguments.
    const apiLines = lines.slice(api.start + 1, api.end).join("\n");
    expect(apiLines).toContain('runuser -u debateai-api -- sh -c "$body" sh "$@"');
    expect(apiLines).toContain("umask 077");
    // The public-key file goes to that function only for its capped read, never to its stage or rename.
    const keyCalls = lines.filter((line) => /\bas_api\b|\bstage_secret\b|\bsave_secret\b/u.test(line) && /KEYS_FILE|netopia-ipn-keys/u.test(line));
    expect(keyCalls.length).toBeGreaterThan(0);
    for (const line of keyCalls) expect(line).toMatch(/\bas_api read "\$KEYS_FILE"/u);
    expect(apiLines).toContain("head -c 65536 --");
    // Elsewhere root only names a path in the API's folder to look at it (a link test, an existence test, its owner),
    // to hand it to as_api or to print it: every such mention is one of these shapes, so a read, copy or write by root
    // (print_fingerprints "$KEYS_FILE", cat, awk) of a path there is caught.
    const looks = [
      /^(BILLING_DIR|KEYS_FILE)="\$(API_DIR|BILLING_DIR)\/[a-z.-]+"$/u,
      /\[ -[Le] "\$BILLING_DIR" \]/gu,
      /api_folder_safe "\$BILLING_DIR"/gu,
      /kept "\$(BILLING_DIR\/[a-z-]+|KEYS_FILE)"/gu,
      /as_api (dir|stage|read) "\$(BILLING_DIR|KEYS_FILE)"/gu,
      /record_owner [a-z:-]+ "\$(BILLING_DIR|KEYS_FILE)"/gu,
      /save_secret "\$BILLING_DIR\/[a-z-]+"/gu,
      /server_path "\$(BILLING_DIR\/[a-z-]+|KEYS_FILE)"/gu,
      /"\$\{tmp#"\$BILLING_DIR\/\.billing-setup\."\}"/gu
    ];
    lines.forEach((line, index) => {
      if (within(index, api) || within(index, keys) || /^\s*#/u.test(line)) return;
      const rest = looks.reduce((left, shape) => left.replace(shape, ""), line);
      expect(rest, `line ${index + 1}: ${line}`).not.toMatch(/BILLING_DIR|KEYS_FILE/u);
    });
  });
});
