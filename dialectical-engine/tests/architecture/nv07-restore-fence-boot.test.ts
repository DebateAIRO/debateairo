// NV-07: the API settles the restore fence before it serves anything, advances it on a gated timer and each time it
// becomes current, and holds public reads on the fence's word; the backups never capture the fence's host half.
// Source pins (read as text). The real seal and numeric-export checks stay the orphan audit's (scaffold.test.ts).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ENVIRONMENT_KEYS } from "../../packages/register/src/runtime-environment.js";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string): string => readFileSync(resolve(root, path), "utf8");
const main = read("apps/api/src/main.ts");

/** The text of the first `{ … }` body that opens after `from` (braces counted; main.ts has none in strings there). */
function bodyAfter(source: string, from: number): string {
  const open = source.indexOf("{", from);
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    if (source[at] === "{") depth += 1;
    else if (source[at] === "}" && --depth === 0) return source.slice(open, at + 1);
  }
  throw new Error("unclosed body");
}

/** The argument list of the first call of `callee` (parentheses counted). */
function callAt(source: string, callee: string): string {
  const start = source.indexOf(callee);
  expect(start, callee).toBeGreaterThan(-1);
  let depth = 0;
  for (let at = start + callee.length - 1; at < source.length; at += 1) {
    if (source[at] === "(") depth += 1;
    else if (source[at] === ")" && --depth === 0) return source.slice(start, at + 1);
  }
  throw new Error(`unclosed call ${callee}`);
}

describe("NV-07 the restore fence at the API's composition root", () => {
  it("settles the fence after the database roles and before any service, background pass or listen", () => {
    const fence = main.indexOf('boot.run("restore-fence"');
    expect(fence).toBeGreaterThan(-1);
    expect(main.indexOf('boot.run("restore-fence"', fence + 1)).toBe(-1);
    expect(fence).toBeGreaterThan(main.indexOf('boot.run("database-roles"'));
    for (const later of ['boot.run("auth-policy"', 'boot.run("session-service"', 'boot.run("publication-key-cleanup"', 'startup.run("listen"']) {
      expect(main.indexOf(later), later).toBeGreaterThan(fence);
    }
    expect(main).toContain("resolveRestoreFencePath(environment, billingCustodyPaths(environment))");
    expect(main).toContain("new PostgresRestoreFenceRepository(authorizationPool)");
    expect(main).toContain('import { PostgresRestoreFenceRepository } from "../../../packages/db/src/restore-fence.js";');
  });

  it("advances on a gated 60-second timer, stops it at close, and advances first each time the release becomes current", () => {
    const flat = main.replace(/\s+/gu, "");
    expect(flat).toContain("gatedInterval(releaseWatcher,triggerRestoreFenceAdvance,60_000)");
    expect(flat).toContain("clearInterval(restoreFenceTimer)");
    const oneShots = bodyAfter(main, main.indexOf("releaseWatcher.onBecameCurrent(() => {"));
    const advance = oneShots.indexOf("triggerRestoreFenceAdvance();");
    expect(advance).toBeGreaterThan(-1);
    expect(advance).toBeLessThan(oneShots.indexOf("triggerErasureReconciliation();"));
  });

  it("hands the publication application the fence's public read hold", () => {
    expect(callAt(main, "new PostgresPublicationApplication(")).toContain("restoreFence?.publicReadsHeld()");
  });

  it("names RESTORE_FENCE_PATH as an optional key of the API's shape (hosted mode requires it at boot)", () => {
    expect(API_ENVIRONMENT_KEYS.optional).toContain("RESTORE_FENCE_PATH");
    expect(API_ENVIRONMENT_KEYS.required).not.toContain("RESTORE_FENCE_PATH");
  });

  it("keeps the fence out of every backup: backup.sh names it excluded and captures it nowhere", async () => {
    const script = read("deploy/vps/backup.sh");
    const commands = script.split("\n").filter((line) => !line.trimStart().startsWith("#"));
    for (const line of commands.filter((line) => /\b(tar|age)\b/u.test(line))) {
      expect(line, line).not.toMatch(/restore-fence|RESTORE_FENCE/u);
    }
    expect(commands.join("\n")).not.toMatch(/restore-fence|RESTORE_FENCE/u);
    const header = script.split("\n").filter((line) => line.startsWith("#")).join("\n");
    expect(header).toContain("RESTORE_FENCE_PATH");
    expect(header).toMatch(/deliberately NOT captured/u);
    // The preview's online backup copies only the key stores its env keys name: the fence is never one of them.
    const { KEY_STORE_KEYS } = await import("../../deploy/" + "preview-lifecycle/v1/backup.mjs") as { KEY_STORE_KEYS: readonly string[] };
    expect(KEY_STORE_KEYS.length).toBeGreaterThan(0);
    expect(KEY_STORE_KEYS).not.toContain("RESTORE_FENCE_PATH");
  });

  it("keeps the source laws: the sealed migrate() module never names it, and the module exports no number", () => {
    expect(read("packages/db/src/index.ts")).not.toContain("restore-fence");
    expect(read("apps/api/src/restore-fence.ts")).not.toMatch(/^export const \w+ = [0-9]/mu);
  });
});
