import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

interface ImportTrace {
  readonly status: number | null;
  readonly stderr: string;
  readonly resolved: readonly string[];
}

interface CommandResult {
  readonly status: number | null;
  readonly stderr: string;
}

const root = fileURLToPath(new URL("../..", import.meta.url));
const tsxLoader = fileURLToPath(import.meta.resolve("tsx"));

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
    { cwd: root, encoding: "utf8" },
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

function deployProvider(label: string): { readonly directory: string; readonly result: CommandResult } {
  const directory = mkdtempSync(join(tmpdir(), `fix05-provider-${label}-`));
  const child = spawnSync(
    "pnpm",
    ["--filter", "@debateai/providers", "deploy", "--legacy", "--prod", directory],
    { cwd: root, encoding: "utf8" },
  );
  return Object.freeze({
    directory,
    result: Object.freeze({ status: child.status, stderr: child.stderr }),
  });
}

function importDeployedProvider(directory: string): CommandResult {
  const entry = pathToFileURL(join(directory, "src/index.ts")).href;
  const child = spawnSync(
    process.execPath,
    ["--import", tsxLoader, "--input-type=module", "-e", `await import(${JSON.stringify(entry)})`],
    { cwd: directory, encoding: "utf8" },
  );
  return Object.freeze({ status: child.status, stderr: child.stderr });
}

function providerLockImporter(lockfile: string): string {
  return lockfile.match(/\n  packages\/providers:\n([\s\S]*?)(?=\n  \S)/u)?.[1] ?? "";
}

describe("FIX-05 provider import graph", () => {
  it("declares the exact provider dependency contract", () => {
    const manifest = JSON.parse(readFileSync(join(root, "packages/providers/package.json"), "utf8")) as {
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    expect(manifest.dependencies?.["@debateai/obs-capture"]).toBe("workspace:*");

    const importer = providerLockImporter(readFileSync(join(root, "pnpm-lock.yaml"), "utf8"));
    expect(importer.match(/'@debateai\/obs-capture':/gu)).toHaveLength(1);
    expect(importer).toContain(`      '@debateai/obs-capture':
        specifier: workspace:*
        version: link:../obs-capture`);

    const auditSource = readFileSync(join(root, "tools/orphan-audit/src/index.ts"), "utf8");
    expect(auditSource.match(/^\s*\["providers".*$/mu)?.[0]).toBe(
      `  ["providers", "packages/providers", ["kernel", "register", "ledger", "obs-capture"]],`,
    );
  });

  it("imports an isolated provider production deployment", () => {
    const deployment = deployProvider("green");
    try {
      expect(deployment.result.status, deployment.result.stderr).toBe(0);
      const imported = importDeployedProvider(deployment.directory);
      expect(imported.status, imported.stderr).toBe(0);
      expect(existsSync(join(
        deployment.directory,
        "node_modules/@debateai/obs-capture/package.json",
      ))).toBe(true);
    } finally {
      rmSync(deployment.directory, { recursive: true, force: true });
    }
  });

  it("rejects a deployed provider whose capture edge is removed", () => {
    const deployment = deployProvider("missing-edge");
    try {
      expect(deployment.result.status, deployment.result.stderr).toBe(0);
      rmSync(join(deployment.directory, "node_modules/@debateai/obs-capture"), {
        recursive: true,
        force: true,
      });
      const imported = importDeployedProvider(deployment.directory);
      expect(imported.status).not.toBe(0);
      expect(imported.stderr).toContain("ERR_MODULE_NOT_FOUND");
      expect(imported.stderr).toContain("@debateai/obs-capture");
    } finally {
      rmSync(deployment.directory, { recursive: true, force: true });
    }
  });

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
