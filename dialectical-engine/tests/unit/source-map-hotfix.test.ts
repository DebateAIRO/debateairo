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
      expect(JSON.parse(result.stdout)).toEqual({ argv: ["exec", "vitest", "run", "tests/architecture/dependency-floors.test.ts"], exclude: Date.now() < expiry ? '["source-map-js@1.2.2"]' : null, other: "kept" });
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
