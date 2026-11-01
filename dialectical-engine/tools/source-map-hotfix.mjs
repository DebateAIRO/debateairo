// The user's one-time approval of source-map-js 1.2.2 expires at its seven-day maturity.
// Each invocation decides afresh. A running child retains its launch environment; after
// maturity that exact version is ordinarily eligible anyway. Workspace policy stays intact.
// The same holds for the owner's one-time approval of 2026-11-01 (EARLY_USE): each version drops
// out at its own seven-day maturity, and none is granted before the day of the approval.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const EXPIRY = Date.parse("2026-10-07T14:08:09.382Z");
const PIN = "source-map-js@1.2.2";
const SRI = "sha512-KGj/8Y43x35aZVDtt+J4mK1hoLGHULMYfSkODJNQjNDC3oW1PqPoxMwo0pLUsWM/UEGzON/NxeHywEfNXNP3Vw==";
const EARLY_USE_FROM = Date.parse("2026-11-01T00:00:00.000Z");
const EARLY_USE = Object.freeze([
  { name: "follow-redirects", version: "1.16.2", expiry: Date.parse("2026-11-01T21:32:25.963Z"), floor: "follow-redirects@>=1.16.0 <1.16.2",
    sri: "sha512-/kVP2U8z596Ia0gwFrwyIeo74ta5aVmSeU1FfAUMAmcEP5EP7zydmag3SLiN64NaRKef3lxsq7i/g7ltJQDGow==" },
  { name: "@isaacs/nonrecursive-glob-match", version: "1.0.1", expiry: Date.parse("2026-11-03T04:24:52.559Z"),
    sri: "sha512-rNKPuTXBacPpn5+CP+S3/UI6uq/0jHZjPpaBLaRE3blpgX+E+ZUIrGfViPvUjUnQG6W1+3OTFUiVRCjTffs2+Q==" },
  { name: "path-scurry", version: "3.0.0", expiry: Date.parse("2026-11-03T21:14:48.842Z"),
    sri: "sha512-1pTbQqH1wIwMi/eleQ5leFTTCkzFsPcgXNjwOA8YGGW/W4/kHT3dssE7Z6NH+zuqNLOzOB0uaD61yl7cAcVhgg==" },
  { name: "glob", version: "14.0.2", expiry: Date.parse("2026-11-03T22:07:00.325Z"), floor: "glob@>=9.0.0 <14.0.2",
    sri: "sha512-vfMgTR2djMHPUchsJMLpZlYQvtjVL+mHpEr5wPpoCbQs2vr/FBNK+3Gnl9Ara1DSs4Aeg4eG9HiADb5/rkY/ZA==" },
  { name: "minimatch", version: "11.0.1", expiry: Date.parse("2026-11-03T22:26:03.755Z"), floor: "minimatch@<11.0.1",
    sri: "sha512-t+Vn6DX4wPCxS23y03C0uhF7S1jpi1GfqPrnlEipCJaA2ykiNbMkVlDutZtmvLfRcUN6R8AYVlzTsQrT4RZoLQ==" }
]);
const pinOf = ({ name, version }) => `${name}@${version}`;
const APPROVED = new Set([PIN, ...EARLY_USE.map(pinOf)]);
const COMMANDS = Object.freeze({
  install: ["install", "--frozen-lockfile"], generate: ["run", "generate:contract"],
  typecheck: ["run", "typecheck"], tests: ["run", "test:ci-gate"], integration: ["run", "test:ci-integration"], registration: ["run", "test:ci-integration-registration"],
  audit: ["audit", "--audit-level=moderate"],
  ui: ["--filter", "dialectical-engine-v2ui", "build"],
  floor: ["exec", "vitest", "run", "tests/architecture/dependency-floors.test.ts"]
});
const refuse = () => { throw new Error("SOURCE_MAP_HOTFIX_REFUSED"); };

// Early use is bound to the exact version and downloaded SRI, and to the floor that keeps it there.
function requireEarlyUseBound({ name, version, sri, floor }, workspace, lock) {
  const entry = new RegExp(`^  '?${name.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}@(\\d[^:\\s'(]*)(?:\\([^:\\s]*\\))?'?:(\\n    resolution: \\{integrity: ([^}]+)\\})?`, "gm");
  const found = [...lock.matchAll(entry)];
  if (found.length !== 2 || found.some((match) => match[1] !== version) || !found.some((match) => match[3] === sri)) refuse();
  if (floor && (!workspace.split("\n").includes(`  '${floor}': '${version}'`) || !lock.split("\n").includes(`  ${floor}: ${version}`))) refuse();
}

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
      if (!Array.isArray(entries) || entries.some((entry) => !APPROVED.has(entry))) refuse();
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
  } else if (now >= EARLY_USE_FROM) {
    const young = EARLY_USE.filter(({ expiry }) => now < expiry);
    for (const allowance of young) requireEarlyUseBound(allowance, workspace, lock);
    if (young.length > 0) child.PNPM_CONFIG_MINIMUM_RELEASE_AGE_EXCLUDE = JSON.stringify(young.map(pinOf));
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
