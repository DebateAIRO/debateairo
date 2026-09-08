import type { ObsAcceptanceCase, ObsCaseContext } from "../index.js";

const DB_THROW_SUBJECT = "acceptance/obs/subjects/installer-db-throw.ts";

export function evaluateBootImportFixture(observation: {
  readonly exitCode: number;
  readonly spooled: number;
}): Readonly<{ passed: boolean; code?: string }> {
  if (observation.exitCode === 0) {
    return Object.freeze({ passed: false, code: "FIXTURE_DID_NOT_THROW" });
  }
  if (observation.spooled < 1) {
    return Object.freeze({ passed: false, code: "BOOT_THROW_NOT_SPOOLED" });
  }
  return Object.freeze({ passed: true });
}

export function evaluateInstallerTrace(
  resolved: readonly string[],
): Readonly<{ passed: boolean; forbidden: readonly string[] }> {
  const forbidden = new Set<string>();
  for (const value of resolved) {
    if (value.startsWith("node:") || value.includes("/packages/obs-capture/")) continue;
    const packageMatch = /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/u.exec(value);
    if (packageMatch?.[1] !== undefined) forbidden.add(packageMatch[1]);
  }
  const list = Object.freeze([...forbidden].sort());
  return Object.freeze({ passed: list.length === 0, forbidden: list });
}

export const installerGraphCase: ObsAcceptanceCase = Object.freeze({
  name: "installer-graph",
  subjectPaths: Object.freeze([
    "packages/obs-capture/install/api.ts",
    "packages/obs-capture/install/runner.ts",
    "packages/obs-capture/install/scheduler.ts",
    DB_THROW_SUBJECT,
  ]),
  async run(context: ObsCaseContext) {
    const script = `
      import { registerHooks } from "node:module";
      const resolved = [];
      let active = true;
      registerHooks({ resolve(specifier, context, nextResolve) {
        const result = nextResolve(specifier, context);
        if (active) resolved.push(String(result.url));
        return result;
      }});
      await import("@debateai/obs-capture/install/api");
      await import("@debateai/obs-capture/install/runner");
      await import("@debateai/obs-capture/install/scheduler");
      active = false;
      process.stdout.write("FIX08_TRACE " + JSON.stringify(resolved) + "\\n");
    `;
    const receipt = await context.spawn({
      command: process.execPath,
      arguments: ["--import", "tsx", "--input-type=module", "-e", script],
      environment: { OBS_SPOOL_DIR: "" },
      timeoutMs: 5_000,
    });
    const line = receipt.stdout.trim().split("\n").find((entry: string) => entry.startsWith("FIX08_TRACE "));
    if (receipt.exitCode !== 0 || receipt.stderr !== "" || line === undefined) {
      return context.fail("INSTALLER_TRACE_FAILED", { failures: 1 });
    }
    let resolved: readonly string[];
    try {
      const parsed = JSON.parse(line.slice("FIX08_TRACE ".length));
      resolved = Array.isArray(parsed) && parsed.every((value: unknown) => typeof value === "string") ? parsed : [];
    } catch {
      resolved = [];
    }
    const evaluation = evaluateInstallerTrace(resolved);
    if (!evaluation.passed) {
      return context.fail("INSTALLER_GRAPH_FORBIDDEN_IMPORT", { forbidden: evaluation.forbidden.length });
    }
    const fixture = await context.spawn({
      command: process.execPath,
      arguments: ["--import", "tsx", DB_THROW_SUBJECT],
      timeoutMs: 5_000,
    });
    const fixtureLine = fixture.stdout.trim().split("\n")
      .find((entry: string) => entry.startsWith("FIX08_DB_FIXTURE "));
    let spooled = 0;
    try {
      const parsed = JSON.parse(fixtureLine?.slice("FIX08_DB_FIXTURE ".length) ?? "null") as unknown;
      if (typeof parsed === "object" && parsed !== null && "spooled" in parsed) {
        const value = (parsed as { readonly spooled?: unknown }).spooled;
        if (Number.isSafeInteger(value)) spooled = value as number;
      }
    } catch {
      spooled = 0;
    }
    const fixtureEvaluation = evaluateBootImportFixture({
      exitCode: fixture.exitCode ?? 255,
      spooled,
    });
    if (!fixtureEvaluation.passed) {
      return context.fail(fixtureEvaluation.code ?? "BOOT_FIXTURE_FAILED", { failures: 1 });
    }
    return context.passProcess(fixture, { resolved: resolved.length, spooled });
  },
});
