import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

interface ImportTrace {
  readonly status: number | null;
  readonly stderr: string;
  readonly resolved: readonly string[];
}

function traceImport(specifier: string): ImportTrace {
  const script = `
    import { registerHooks } from "node:module";
    const resolved = [];
    registerHooks({ resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      resolved.push(String(result.url));
      return result;
    }});
    await import(${JSON.stringify(specifier)});
    process.stdout.write(JSON.stringify(resolved));
  `;
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, OBS_SPOOL_DIR: "" } },
  );
  let resolved: readonly string[] = [];
  try {
    resolved = JSON.parse(child.stdout) as readonly string[];
  } catch {
    resolved = [];
  }
  return { status: child.status, stderr: child.stderr, resolved };
}

function contains(trace: ImportTrace, pattern: RegExp): boolean {
  return trace.resolved.some((value) => pattern.test(value));
}

describe("FIX-01 runtime import graph", () => {
  it("loads pg without product DB, apps, or zone modules", () => {
    const trace = traceImport("@debateai/obs-capture/runtime");
    console.info("FIX-01 runtime resolve trace", JSON.stringify(trace.resolved));

    expect(trace.status, trace.stderr).toBe(0);
    expect(contains(trace, /\/pg(?:@|\/)/)).toBe(true);
    expect(contains(trace, /@debateai\/db|\/packages\/db\//)).toBe(false);
    expect(contains(trace, /\/apps\//)).toBe(false);
    expect(contains(trace, /\/src\/zone\//)).toBe(false);
  });

  it("keeps the root barrel free of pg", () => {
    const trace = traceImport("@debateai/obs-capture");
    console.info("FIX-01 root resolve trace", JSON.stringify(trace.resolved));

    expect(trace.status, trace.stderr).toBe(0);
    expect(contains(trace, /\/pg(?:@|\/)/)).toBe(false);
  });
});
