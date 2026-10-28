// tests/unit/vps-hatchet-check-env.test.ts
// NV-51 (audit L7-F3): debateai-hatchet.service runs deploy/vps/hatchet-check-env.mjs (installed as
// /etc/debateai/hatchet/check-env.mjs) before every `docker compose up`, so no Hatchet container is created from a
// hatchet.env without its own admin pair. The checks on the text, the file and the command line, the script form (its
// entry guard fires, through a symlink too), and README §4's generator line run on a scratch file. Every fixture value
// is built at run time (gitleaks scans tests/), and no captured output may hold one.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const engineRoot = resolve(import.meta.dirname, "../..");
const SCRIPT = resolve(engineRoot, "deploy/vps/hatchet-check-env.mjs");
const check = (await import("../../deploy/" + "vps/hatchet-check-env.mjs")) as {
  assessHatchetEnv(text: string): string | null;
  main(argv: readonly string[], io: { uid?: number; stdout: { write(s: string): unknown }; stderr: { write(s: string): unknown } }): number;
};
const uid = process.getuid!();
const scratch = mkdtempSync(join(tmpdir(), "hatchet-env-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const PASSWORD = randomBytes(24).toString("base64url");
const EMAIL = `debateai-hatchet-${randomBytes(6).toString("hex")}@localhost.invalid`;
const DB = "DATABASE_URL=postgresql://debateai_prod_hatchet:" + randomBytes(32).toString("hex") + "@localhost/hatchet?host=/var/run/postgresql";
const SEED_EMAIL = ["admin", "example.com"].join("@");
const SEED_PASSWORD = ["Admin", "123!!"].join("");
const GOOD_PAIR = [`ADMIN_EMAIL=${EMAIL}`, `ADMIN_PASSWORD=${PASSWORD}`] as const;
/** README §4 bring-up step 1, verbatim: the admin pair, appended only while the file names neither key. */
const GENERATOR_LINE =
  "test -e /etc/debateai/hatchet.env && ! grep -Eq '^[[:space:]]*(export[[:space:]]+)?ADMIN_(EMAIL|PASSWORD)[[:space:]]*=' /etc/debateai/hatchet.env && printf 'ADMIN_EMAIL=debateai-hatchet-%s@localhost.invalid\\nADMIN_PASSWORD=%s\\n' \"$(openssl rand -hex 6)\" \"$(openssl rand -base64 24 | tr '+/' '-_')\" >> /etc/debateai/hatchet.env";

/** The lines, each ended by `\n`. */
const text = (...lines: readonly string[]): string => lines.map((line) => `${line}\n`).join("");
/** The DB line, then the row's own line, then the good pair. */
const beside = (line: string): string => text(DB, line, ...GOOD_PAIR);

function capture(): { io: { uid: number; stdout: { write(s: string): unknown }; stderr: { write(s: string): unknown } }; out: () => string; err: () => string } {
  let out = "";
  let err = "";
  return {
    io: { uid, stdout: { write: (s: string) => { out += s; return true; } }, stderr: { write: (s: string) => { err += s; return true; } } },
    out: () => out,
    err: () => err
  };
}

let fileCount = 0;
function envFile(content: string, mode = 0o600): string {
  fileCount += 1;
  const path = join(scratch, `env-${fileCount}`);
  writeFileSync(path, content, { mode });
  chmodSync(path, mode);
  return path;
}

describe("NV-51 deploy/vps/hatchet-check-env.mjs: the text", () => {
  it.each([
    ["the README step-1 shape (DB only)", text(DB), "HATCHET_ENV_ADMIN_EMAIL_MISSING"],
    ["DB + e-mail only", text(DB, GOOD_PAIR[0]), "HATCHET_ENV_ADMIN_PASSWORD_MISSING"],
    ["a good file", text(DB, ...GOOD_PAIR), null],
    ["the seed e-mail", text(DB, `ADMIN_EMAIL=${SEED_EMAIL}`, GOOD_PAIR[1]), "HATCHET_ENV_ADMIN_EMAIL_DEFAULT"],
    ["the seed e-mail in other letter cases", text(DB, `ADMIN_EMAIL=${["Admin", "Example.COM"].join("@")}`, GOOD_PAIR[1]), "HATCHET_ENV_ADMIN_EMAIL_DEFAULT"],
    ["the seed password", text(DB, GOOD_PAIR[0], `ADMIN_PASSWORD=${SEED_PASSWORD}`), "HATCHET_ENV_ADMIN_PASSWORD_DEFAULT"],
    ["a 19-character password", text(DB, GOOD_PAIR[0], `ADMIN_PASSWORD=${PASSWORD.slice(0, 19)}`), "HATCHET_ENV_ADMIN_PASSWORD_SHORT"],
    ["two ADMIN_PASSWORD= lines", text(DB, ...GOOD_PAIR, `ADMIN_PASSWORD=${PASSWORD}x`), "HATCHET_ENV_ADMIN_PASSWORD_DUPLICATE"],
    ["export ADMIN_PASSWORD=", text(DB, GOOD_PAIR[0], `export ADMIN_PASSWORD=${PASSWORD}`), "HATCHET_ENV_ADMIN_LINE_UNSAFE"],
    ["a space before ADMIN_EMAIL=", text(DB, ` ADMIN_EMAIL=${EMAIL}`, GOOD_PAIR[1]), "HATCHET_ENV_ADMIN_LINE_UNSAFE"],
    ["ADMIN_EMAIL = with spaces", text(DB, `ADMIN_EMAIL = ${EMAIL}`, GOOD_PAIR[1]), "HATCHET_ENV_ADMIN_LINE_UNSAFE"],
    ["a closed quote around the password", text(DB, GOOD_PAIR[0], `ADMIN_PASSWORD="${PASSWORD}"`), "HATCHET_ENV_ADMIN_LINE_UNSAFE"],
    ["a password holding $", text(DB, GOOD_PAIR[0], `ADMIN_PASSWORD=${PASSWORD}$x`), "HATCHET_ENV_ADMIN_LINE_UNSAFE"],
    ["a password followed by ' #x'", text(DB, GOOD_PAIR[0], `ADMIN_PASSWORD=${PASSWORD} #x`), "HATCHET_ENV_ADMIN_LINE_UNSAFE"],
    ["the good pair, then a YAML-style ADMIN_PASSWORD: x", text(DB, ...GOOD_PAIR, "ADMIN_PASSWORD: x"), "HATCHET_ENV_ADMIN_LINE_UNSAFE"],
    ["# ADMIN_PASSWORD=x beside a good pair", beside("# ADMIN_PASSWORD=x"), null],
    ["a CR in the text", text(DB, ...GOOD_PAIR).replace("\n", "\r\n"), "HATCHET_ENV_TEXT_INVALID"],
    ["a quote opened on one line and closed below the pair", text(DB, 'X="', ...GOOD_PAIR, '"'), "HATCHET_ENV_TEXT_INVALID"],
    ["a quote opened after a : key end", text(DB, 'X: "', ...GOOD_PAIR, '"'), "HATCHET_ENV_TEXT_INVALID"],
    ["a quote opened under a digit-led key", text(DB, '1X="', ...GOOD_PAIR, '"'), "HATCHET_ENV_TEXT_INVALID"],
    ["an escaped quote that leaves the quote open", text(DB, 'X="abc\\"', ...GOOD_PAIR, '"'), "HATCHET_ENV_TEXT_INVALID"],
    ["X='abc beside a good pair", beside("X='abc"), "HATCHET_ENV_TEXT_INVALID"],
    ["a quote inside an unquoted value", beside('X=a"b'), "HATCHET_ENV_TEXT_INVALID"],
    ["text after the closing quote", beside('X="a" # note'), "HATCHET_ENV_TEXT_INVALID"],
    ["one space after the closing quote", beside('X="a" '), "HATCHET_ENV_TEXT_INVALID"],
    ["a closed double-quoted value", beside('X="a b"'), null],
    ["a closed single-quoted value after export", beside("export X='a b'"), null]
  ] as const)("%s", (_name, input, expected) => {
    expect(check.assessHatchetEnv(input)).toBe(expected);
  });
});

describe("NV-51 deploy/vps/hatchet-check-env.mjs: the file and the command line", () => {
  const good = envFile(text(DB, ...GOOD_PAIR));
  const link = join(scratch, "link-to-good");
  symlinkSync(good, link);

  it.each([
    ["a good file", [good], {}, 0, "HATCHET_ENV_OK\n", ""],
    ["a file the group can read", [envFile(text(DB, ...GOOD_PAIR), 0o640)], {}, 1, "", "HATCHET_ENV_REFUSED HATCHET_ENV_UNSAFE_FILE\n"],
    ["a symlink to the good file", [link], {}, 1, "", "HATCHET_ENV_REFUSED HATCHET_ENV_UNSAFE_FILE\n"],
    ["a file another uid owns", [good], { uid: uid + 1 }, 1, "", "HATCHET_ENV_REFUSED HATCHET_ENV_UNSAFE_FILE\n"],
    ["a relative path", ["hatchet.env"], {}, 2, "", "HATCHET_ENV_REFUSED HATCHET_ENV_USAGE\n"],
    ["a missing file", [join(scratch, "missing")], {}, 1, "", "HATCHET_ENV_REFUSED HATCHET_ENV_UNREADABLE\n"]
  ] as const)("%s", (_name, argv, override, exit, stdout, stderr) => {
    const { io, out, err } = capture();
    expect(check.main(argv, { ...io, ...override })).toBe(exit);
    expect([out(), err()]).toEqual([stdout, stderr]);
    for (const value of [PASSWORD, EMAIL]) expect(out() + err()).not.toContain(value);
  });

  it("runs as a script: its entry guard fires, through a symlinked install too, and prints no value", () => {
    const dbOnly = envFile(text(DB));
    const accepted = spawnSync(process.execPath, [SCRIPT, good], { encoding: "utf8" });
    expect([accepted.status, accepted.stdout, accepted.stderr]).toEqual([0, "HATCHET_ENV_OK\n", ""]);
    const refused = spawnSync(process.execPath, [SCRIPT, dbOnly], { encoding: "utf8" });
    expect([refused.status, refused.stdout, refused.stderr]).toEqual([1, "", "HATCHET_ENV_REFUSED HATCHET_ENV_ADMIN_EMAIL_MISSING\n"]);
    const installed = join(scratch, "check-env.mjs");
    symlinkSync(SCRIPT, installed);
    const throughLink = spawnSync(process.execPath, [installed, dbOnly], { encoding: "utf8" });
    expect([throughLink.status, throughLink.stdout, throughLink.stderr]).toEqual([1, "", "HATCHET_ENV_REFUSED HATCHET_ENV_ADMIN_EMAIL_MISSING\n"]);
    for (const run of [accepted, refused, throughLink]) {
      for (const value of [PASSWORD, EMAIL]) expect(run.stdout + run.stderr).not.toContain(value);
    }
  });
});

describe("NV-51 README §4's generator line and the module's text", () => {
  it("appends a pair the check accepts, prints nothing, and on a second run exits 1 and changes nothing", () => {
    expect(readFileSync(resolve(engineRoot, "deploy/vps/README.md"), "utf8")).toContain(GENERATOR_LINE);
    const scratchEnv = join(scratch, "hatchet.env");
    expect(scratchEnv).not.toContain("'");
    const line = GENERATOR_LINE.split("/etc/debateai/hatchet.env").join(`'${scratchEnv}'`);
    writeFileSync(scratchEnv, `${DB}\n`, { mode: 0o600 });
    expect(execFileSync("bash", ["-c", line], { encoding: "utf8" })).toBe("");
    const first = readFileSync(scratchEnv);
    expect(check.assessHatchetEnv(first.toString("utf8"))).toBeNull();
    const parts = first.toString("utf8").split("\n");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe(DB);
    expect(parts[1]?.startsWith("ADMIN_EMAIL=")).toBe(true);
    expect(parts[2]?.startsWith("ADMIN_PASSWORD=")).toBe(true);
    expect(parts[3]).toBe("");
    // A skip exits 1 by design: `! grep -Eq` returns 1 once the file names either key, and the && list stops there.
    const again = spawnSync("bash", ["-c", line], { encoding: "utf8" });
    expect([again.status, again.stdout, again.stderr]).toEqual([1, "", ""]);
    expect(readFileSync(scratchEnv).equals(first)).toBe(true);
  });

  it("imports only node: built-ins, statically", () => {
    const source = readFileSync(SCRIPT, "utf8");
    const specifiers = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1] ?? "");
    expect(specifiers.length).toBeGreaterThanOrEqual(1);
    expect(specifiers.filter((specifier) => !specifier.startsWith("node:"))).toEqual([]);
    expect(source).not.toContain("import(");
    expect(source).not.toContain("require(");
  });
});
