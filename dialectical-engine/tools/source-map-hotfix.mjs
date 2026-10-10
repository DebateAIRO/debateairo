// The user's one-time approval of source-map-js 1.2.2 expires at its seven-day maturity.
// Each invocation decides afresh. A running child retains its launch environment; after
// maturity that exact version is ordinarily eligible anyway. Workspace policy stays intact.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const EXPIRY = Date.parse("2026-10-07T14:08:09.382Z");
const PIN = "source-map-js@1.2.2";
const SRI = "sha512-KGj/8Y43x35aZVDtt+J4mK1hoLGHULMYfSkODJNQjNDC3oW1PqPoxMwo0pLUsWM/UEGzON/NxeHywEfNXNP3Vw==";
const COMMANDS = Object.freeze({
  install: ["install", "--frozen-lockfile"], generate: ["run", "generate:contract"],
  typecheck: ["run", "typecheck"], tests: ["run", "test:ci-gate"], integration: ["run", "test:ci-integration"], registration: ["run", "test:ci-integration-registration"],
  audit: ["audit", "--audit-level=moderate"],
  ui: ["--filter", "dialectical-engine-v2ui", "build"],
  floor: ["exec", "vitest", "run", "tests/architecture/dependency-floors.test.ts"]
});
const refuse = () => { throw new Error("SOURCE_MAP_HOTFIX_REFUSED"); };

export function commandArguments(label) {
  if (!Object.hasOwn(COMMANDS, label)) refuse();
  return [...COMMANDS[label]];
}

export function childEnvironment({ environment, now, workspace, lock }) {
  if (!Number.isFinite(now)
    || [...workspace.matchAll(/^minimumReleaseAge:[ \t]*(\d+)[ \t]*$/gm)].map((m) => m[1]).join() !== "10080"
    || /^[ \t]*minimumReleaseAgeExclude[ \t]*:/m.test(workspace)) refuse();
  const child = { ...environment };
  for (const [key, value] of Object.entries(child)) {
    if (!/^(pnpm|npm)_config_/i.test(key)) continue;
    const setting = key.replace(/^(pnpm|npm)_config_/i, "").replace(/[_-]/g, "").toLowerCase();
    if (setting === "minimumreleaseage" && value !== "10080") refuse();
    if (setting === "minimumreleaseageexclude") {
      let entries;
      try { entries = JSON.parse(value); } catch { refuse(); }
      if (!Array.isArray(entries) || entries.length > 1 || (entries.length === 1 && entries[0] !== PIN)) refuse();
      delete child[key];
    } else if (setting.startsWith("minimumreleaseage") && setting !== "minimumreleaseage") refuse();
  }
  if (now < EXPIRY) {
    if (!/^  'source-map-js@>=1\.0\.0 <1\.2\.2': '1\.2\.2'$/m.test(workspace)
      || !/^  source-map-js@>=1\.0\.0 <1\.2\.2: 1\.2\.2$/m.test(lock)) refuse();
    const versions = [...lock.matchAll(/^  source-map-js@([^:\s]+):/gm)].map((m) => m[1]);
    const resolution = lock.match(/^  source-map-js@1\.2\.2:\n    resolution: \{integrity: ([^}]+)\}/m)?.[1];
    if (versions.length !== 2 || versions.some((version) => version !== "1.2.2") || resolution !== SRI) refuse();
    // pnpm11 requires an ARRAY here; a scalar string is not an install-proof substitute.
    child.PNPM_CONFIG_MINIMUM_RELEASE_AGE_EXCLUDE = JSON.stringify([PIN]);
  }
  return child;
}

function main() {
  try {
    if (process.argv.length !== 3) refuse();
    const argv = commandArguments(process.argv[2]);
    const env = childEnvironment({
      environment: process.env, now: Date.now(),
      workspace: readFileSync(resolve(ROOT, "pnpm-workspace.yaml"), "utf8"),
      lock: readFileSync(resolve(ROOT, "pnpm-lock.yaml"), "utf8")
    });
    const child = spawn("pnpm", argv, { cwd: ROOT, env, stdio: "inherit", shell: false });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    child.once("error", () => { console.error("SOURCE_MAP_HOTFIX_REFUSED"); process.exitCode = 1; });
    child.once("close", (code, signal) => {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", terminate);
      if (signal) process.kill(process.pid, signal);
      else process.exitCode = code ?? 1;
    });
  } catch { console.error("SOURCE_MAP_HOTFIX_REFUSED"); process.exitCode = 1; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
