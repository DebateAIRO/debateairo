import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const script = join(root, "tools/source-map-hotfix.mjs");
const expiry = Date.parse("2026-10-07T14:08:09.382Z");
const workspace = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
const lock = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
type Hotfix = {
  childEnvironment: (input: { environment: NodeJS.ProcessEnv; now: number; workspace: string; lock: string }) => NodeJS.ProcessEnv;
  commandArguments: (label: string) => string[];
};
let hotfix: Hotfix;
beforeAll(async () => {
  // A missing implementation fails the owning assertions rather than test collection.
  hotfix = await import(pathToFileURL(script).href).catch(() => ({})) as Hotfix;
});
const environmentAt = (now: number, environment: NodeJS.ProcessEnv = {}, text = workspace, locked = lock) =>
  hotfix.childEnvironment({ environment, now, workspace: text, lock: locked });

describe("the exact expiring 2026-11-01 process allowance", () => {
  const approved = Date.parse("2026-11-01T00:00:00.000Z");
  const pins = {
    "follow-redirects@1.16.2": Date.parse("2026-11-01T21:32:25.963Z"),
    "@isaacs/nonrecursive-glob-match@1.0.1": Date.parse("2026-11-03T04:24:52.559Z"),
    "path-scurry@3.0.0": Date.parse("2026-11-03T21:14:48.842Z"),
    "glob@14.0.2": Date.parse("2026-11-03T22:07:00.325Z"),
    "minimatch@11.0.1": Date.parse("2026-11-03T22:26:03.755Z")
  };
  const granted = (now: number, text = workspace, locked = lock) =>
    JSON.parse(environmentAt(now, {}, text, locked).PNPM_CONFIG_MINIMUM_RELEASE_AGE_EXCLUDE ?? "[]") as string[];

  it("grants nothing before the owner's approval day", () => {
    expect(environmentAt(approved - 1)).toEqual({});
  });
  it("grants all five exact versions from the approval day", () => {
    expect(granted(approved).sort()).toEqual(Object.keys(pins).sort());
  });
  it.each(Object.entries(pins))("drops %s the moment it turns seven days old", (pin, maturity) => {
    expect(granted(maturity - 1)).toContain(pin);
    expect(granted(maturity)).not.toContain(pin);
  });
  it("is empty once the last version is seven days old", () => {
    expect(environmentAt(pins["minimatch@11.0.1"])).toEqual({});
  });
  it("keeps refusing a committed exclusion or any wider ambient list while granting", () => {
    expect(() => environmentAt(approved, {}, `${workspace}\nminimumReleaseAgeExclude: []\n`)).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
    expect(() => environmentAt(approved, { PNPM_CONFIG_MINIMUM_RELEASE_AGE_EXCLUDE: '["glob@14.0.2","other-package@1.0.0"]' })).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
    expect(() => environmentAt(approved, { PNPM_CONFIG_MINIMUM_RELEASE_AGE_EXCLUDE: '["glob@*"]' })).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
    expect(() => environmentAt(approved, { PNPM_CONFIG_MINIMUM_RELEASE_AGE: "0" })).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
  });
  it("replaces an inherited list of the approved versions with its own", () => {
    expect(JSON.parse(environmentAt(pins["glob@14.0.2"] - 1, { pnpm_config_minimum_release_age_exclude: '["minimatch@11.0.1","glob@14.0.2"]' }).PNPM_CONFIG_MINIMUM_RELEASE_AGE_EXCLUDE ?? "[]").sort())
      .toEqual(["glob@14.0.2", "minimatch@11.0.1"]);
  });
  it.each([
    ["follow-redirects", "1.16.2", "1.16.3"],
    ["glob", "14.0.2", "14.0.3"],
    ["minimatch", "11.0.1", "11.0.2"],
    ["path-scurry", "3.0.0", "3.0.1"],
    ["@isaacs/nonrecursive-glob-match", "1.0.1", "1.0.2"]
  ])("refuses while granting if the lockfile moves %s off the approved version", (name, version, other) => {
    expect(() => environmentAt(approved, {}, workspace, lock.replaceAll(`${name}@${version}`, `${name}@${other}`))).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
  });
  it.each(["sha512-/kVP2U8z", "sha512-vfMgTR2d", "sha512-t+Vn6DX4", "sha512-1pTbQqH1", "sha512-rNKPuTXB"])("refuses while granting if the download fingerprint %s changes", (start) => {
    expect(lock).toContain(start);
    expect(() => environmentAt(approved, {}, workspace, lock.replace(start, "sha512-other"))).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
    expect(environmentAt(pins["minimatch@11.0.1"], {}, workspace, lock.replace(start, "sha512-other"))).toEqual({});
  });
  it.each(["follow-redirects", "glob", "minimatch"])("refuses while granting if the %s floor is gone", (name) => {
    const entry = new RegExp(`^  '?${name}@[^\\n]*(?:1\\.16\\.2|14\\.0\\.2|11\\.0\\.1)'?\\n`, "m");
    expect(workspace).toMatch(entry);
    expect(() => environmentAt(approved, {}, workspace.replace(entry, ""))).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
    expect(lock).toMatch(entry);
    expect(() => environmentAt(approved, {}, workspace, lock.replace(entry, ""))).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
  });
});

describe("the exact expiring SourceMap process allowance", () => {
  it("grants one JSON-array package before the actual maturity boundary", () => {
    expect(environmentAt(expiry - 1, { PATH: "kept", OTHER_SETTING: "unchanged" })).toEqual({
      PATH: "kept", OTHER_SETTING: "unchanged",
      PNPM_CONFIG_MINIMUM_RELEASE_AGE_EXCLUDE: '["source-map-js@1.2.2"]'
    });
  });
  it.each([expiry, expiry + 1])("removes both inherited exception spellings at or after %s", (now) => {
    expect(environmentAt(now, {
      PNPM_CONFIG_MINIMUM_RELEASE_AGE_EXCLUDE: '["source-map-js@1.2.2"]',
      pnpm_config_minimum_release_age_exclude: '["source-map-js@1.2.2"]',
      OTHER_SETTING: "unchanged"
    })).toEqual({ OTHER_SETTING: "unchanged" });
  });
  it.each([
    { PNPM_CONFIG_MINIMUM_RELEASE_AGE: "0" },
    { npm_config_minimum_release_age: "1" },
    { PNPM_CONFIG_MINIMUM_RELEASE_AGE_STRICT: "false" },
    { pnpm_config_minimum_release_age_ignore_missing_time: "true" },
    { PNPM_CONFIG_MINIMUM_RELEASE_AGE_EXCLUDE: '["other-package@1.2.2"]' },
    { pnpm_config_minimum_release_age_exclude: '["source-map-js@*"]' },
    { PNPM_CONFIG_MINIMUM_RELEASE_AGE_EXCLUDE: "source-map-js@1.2.2" },
    { pnpm_config_minimumReleaseAgeExclude: '["source-map-js@1.2.2","other-package@1.0.0"]' }
  ])("refuses conflicting ambient policy %j", (environment) => {
    for (const now of [expiry - 1, expiry]) expect(() => environmentAt(now, environment)).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
  });
  it("preserves an ambient ordinary 10080 age", () => {
    expect(environmentAt(expiry, { PNPM_CONFIG_MINIMUM_RELEASE_AGE: "10080" })).toEqual({ PNPM_CONFIG_MINIMUM_RELEASE_AGE: "10080" });
  });
  it("refuses a changed workspace age or committed exclusion", () => {
    for (const text of [workspace.replace("minimumReleaseAge: 10080", "minimumReleaseAge: 0"), `${workspace}\nminimumReleaseAgeExclude: []\n`]) {
      expect(() => environmentAt(expiry - 1, {}, text)).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
    }
  });
  it("refuses a missing early-use override instead of letting autodeps silently remove it", () => {
    expect(() => environmentAt(expiry - 1, {}, workspace.replace(/^  'source-map-js@[^\n]+\n/m, ""))).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
    expect(() => environmentAt(expiry - 1, {}, workspace, lock.replace(/^  source-map-js@>=1\.0\.0[^\n]+\n/m, ""))).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
  });
  it("binds the exact version and downloaded SRI only while granting early use", () => {
    for (const text of [lock.replaceAll("source-map-js@1.2.2", "source-map-js@1.2.3"), lock.replace("sha512-KGj/8Y43", "sha512-other")]) {
      expect(() => environmentAt(expiry - 1, {}, workspace, text)).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
      expect(environmentAt(expiry, {}, workspace, text)).toEqual({});
    }
    expect(() => environmentAt(Number.NaN)).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
  });
  it("maps only the fixed named commands, including the unchanged audit threshold", () => {
    const commands = {
      install: ["install", "--frozen-lockfile"], generate: ["run", "generate:contract"],
      typecheck: ["run", "typecheck"], tests: ["run", "test:ci-gate"], integration: ["run", "test:ci-integration"], registration: ["run", "test:ci-integration-registration"],
      audit: ["audit", "--audit-level=moderate"], ui: ["--filter", "dialectical-engine-v2ui", "build"],
      floor: ["exec", "vitest", "run", "tests/architecture/dependency-floors.test.ts"]
    };
    for (const [name, argv] of Object.entries(commands)) expect(hotfix.commandArguments(name)).toEqual(argv);
    for (const name of ["install --ignore-scripts", "__proto__", "toString", "exec", ""]) expect(() => hotfix.commandArguments(name)).toThrow("SOURCE_MAP_HOTFIX_REFUSED");
    const workflow = readFileSync(resolve(root, "../.github/workflows/security.yml"), "utf8");
    for (const name of ["install", "generate", "typecheck", "tests", "audit", "integration"]) expect(workflow).toContain(`- run: node tools/source-map-hotfix.mjs ${name}`);
    expect(workflow).not.toContain("MINIMUM_RELEASE_AGE_EXCLUDE:");
    // The ~34-minute registration suite has its own path-filtered/nightly workflow (2026-10-09).
    const registrationWorkflow = readFileSync(resolve(root, "../.github/workflows/registration-integration.yml"), "utf8");
    for (const name of ["install", "generate", "registration"]) expect(registrationWorkflow).toContain(`- run: node tools/source-map-hotfix.mjs ${name}`);
    expect(registrationWorkflow).not.toContain("MINIMUM_RELEASE_AGE_EXCLUDE:");
  });
  it("passes the exact real child environment and preserves its nonzero exit", () => {
    const scratch = mkdtempSync(join(tmpdir(), "source-map-child-"));
    try {
      writeFileSync(join(scratch, "pnpm"), '#!/usr/bin/env node\nconsole.log(JSON.stringify({argv:process.argv.slice(2),exclude:process.env.PNPM_CONFIG_MINIMUM_RELEASE_AGE_EXCLUDE??null,other:process.env.HOTFIX_TEST_SETTING}));process.exit(37);\n', { mode: 0o700 });
      const result = spawnSync(process.execPath, [script, "floor"], { cwd: root, env: { ...process.env, PATH: `${scratch}${delimiter}${process.env.PATH}`, HOTFIX_TEST_SETTING: "kept" }, encoding: "utf8" });
      expect(result.status).toBe(37);
      const live = environmentAt(Date.now()).PNPM_CONFIG_MINIMUM_RELEASE_AGE_EXCLUDE ?? null;
      expect(JSON.parse(result.stdout)).toEqual({ argv: ["exec", "vitest", "run", "tests/architecture/dependency-floors.test.ts"], exclude: live, other: "kept" });
      const refused = spawnSync(process.execPath, [script, "floor", "extra"], { cwd: root, env: { ...process.env, PATH: `${scratch}${delimiter}${process.env.PATH}` }, encoding: "utf8" });
      expect(refused.status).toBe(1);
      expect(refused.stdout).toBe("");
      expect(refused.stderr.trim()).toBe("SOURCE_MAP_HOTFIX_REFUSED");
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  });
  it("forwards SIGTERM to its owned child and preserves the resulting exit", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "source-map-signal-"));
    try {
      writeFileSync(join(scratch, "pnpm"), '#!/usr/bin/env node\nprocess.on("SIGTERM",()=>process.exit(29));console.log("ready");setInterval(()=>{},1000);\n', { mode: 0o700 });
      const child = spawn(process.execPath, [script, "floor"], { cwd: root, env: { ...process.env, PATH: `${scratch}${delimiter}${process.env.PATH}` }, stdio: ["ignore", "pipe", "pipe"] });
      const result = await new Promise<number | null>((done, reject) => {
        const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("owned child deadline")); }, 5000);
        child.stdout.once("data", () => child.kill("SIGTERM"));
        child.once("error", (error) => { clearTimeout(timeout); reject(error); });
        child.once("close", (status) => { clearTimeout(timeout); done(status); });
      });
      expect(result).toBe(29);
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  });
});
