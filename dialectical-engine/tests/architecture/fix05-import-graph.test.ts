import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

interface ImportTrace {
  readonly status: number | null;
  readonly stderr: string;
  readonly resolved: readonly string[];
}

function traceProviderImport(): ImportTrace {
  const script = `
    import { registerHooks } from "node:module";
    const resolved = [];
    registerHooks({ resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      resolved.push(String(result.url));
      return result;
    }});
    await import("@debateai/providers");
    process.stdout.write(JSON.stringify(resolved));
  `;
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  let resolved: readonly string[] = [];
  try {
    resolved = JSON.parse(child.stdout) as readonly string[];
  } catch {
    resolved = [];
  }
  return Object.freeze({ status: child.status, stderr: child.stderr, resolved });
}

function contains(trace: ImportTrace, pattern: RegExp): boolean {
  return trace.resolved.some((value) => pattern.test(value));
}

describe("FIX-05 provider import graph", () => {
  it("loads only the capture core and never pg or the product database package", () => {
    const trace = traceProviderImport();
    console.info("FIX-05 provider resolve trace", JSON.stringify(
      trace.resolved.filter((value) => /providers|obs-capture|\/pg(?:@|\/)|@debateai\/db|\/packages\/db\//u.test(value)),
    ));

    expect(trace.status, trace.stderr).toBe(0);
    expect(contains(trace, /\/packages\/obs-capture\/src\/index\.ts$/u)).toBe(true);
    expect(contains(trace, /\/pg(?:@|\/)/u)).toBe(false);
    expect(contains(trace, /@debateai\/db|\/packages\/db\//u)).toBe(false);
  });
});
