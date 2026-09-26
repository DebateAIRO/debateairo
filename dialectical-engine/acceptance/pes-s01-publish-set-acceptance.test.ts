import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { connect } from "node:net";
import { resolve } from "node:path";
import { ALGORITHM_REGISTER_ROW_KEYS } from "@debateai/register";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildPesS01RoleSeedRows,
  runPesS01PublishSetAcceptance,
  type PesS01AcceptanceDependencies,
  type PesS01CommandResult
} from "./pes-s01-publish-set-acceptance.js";

const productRoot = process.cwd();
const tsxLoader = createRequire(import.meta.url).resolve("tsx");
const runnerLine = 'PES_HOSTED_TARGETS_RUNNER_V1=[{"provider_ref":"vendor:a","base_url":"https://api.acme.example/v1","model":"acme-large","authorization_file":"/etc/debateai/runner/providers/acme.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}]';
const apiLine = 'PES_HOSTED_TARGETS_API_V1=[{"provider_ref":"vendor:a","base_url":"https://api.acme.example/v1","model":"acme-large","authorization_file":"/etc/debateai/api/providers/acme.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}]';
const refusalLines = [
  "PES_PUBLISH_SET_NOT_HOSTED:local",
  "PES_PUBLISH_ROSTER_INVALID:vendor:a",
  "PES_PUBLISH_BASE_ROW_ABSENT:999",
  "PROVIDER_VENDOR_NOT_VETTED:vendor:a",
  "PES_PUBLISH_SET_TARGETS_REJECTED:PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID"
];
const publishedResult: PesS01CommandResult = {
  exitCode: 0, stderr: "",
  stdout: `${runnerLine}\n${apiLine}\nPES_HOSTED_PROVIDER_SET_RECEIPT_V1=${JSON.stringify({
    registerVersion: (4n + 1n).toString(), rowCount: 32, snapshotSha256: "a".repeat(64)
  })}\n`
};

function runEntry(extraEnvironment: Record<string, string> = {}): Promise<PesS01CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ["--import", tsxLoader, "acceptance/pes-accept-publish-set.ts"], {
      cwd: productRoot,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...extraEnvironment },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (exitCode) => resolveResult({ exitCode, stdout, stderr }));
  });
}

function fakes() {
  const lines: string[] = [];
  const stop = vi.fn(async () => undefined);
  const pool = {};
  const startDatabase = vi.fn(async () => ({ connectionString: "postgresql://u:p@127.0.0.1:60001/x", pool, stop }));
  const seedVersion4 = vi.fn(async () => 32);
  const seedRoleRows = vi.fn(async () => (4n + 2n).toString());
  const writeRoster = vi.fn(async (_caseName: string, _text: string) => "/r.json");
  const results: PesS01CommandResult[] = [
    ...refusalLines.map((line) => ({ exitCode: 1, stdout: "", stderr: `${line}\n` })),
    publishedResult,
    { exitCode: 1, stdout: "", stderr: "PES_PUBLISH_ROLE_PROVIDER_DROPPED:evaluatorRoleRef\n" }
  ];
  let call = 0;
  const runPublishCommand = vi.fn(async (_environment: Readonly<Record<string, string>>) => results[call++]!);
  const dependencies: PesS01AcceptanceDependencies = {
    startDatabase, seedVersion4, seedRoleRows, writeRoster, runPublishCommand,
    baseEnvironment: {}, print: (line) => { lines.push(line); }
  };
  return { dependencies, lines, pool, stop, startDatabase, seedVersion4, seedRoleRows, writeRoster, runPublishCommand };
}

describe("S01 operator publish-set acceptance", () => {
  describe("real command", () => {
    let entry: PesS01CommandResult;
    let lines: string[];
    beforeAll(async () => {
      entry = await runEntry();
      lines = entry.stdout.trimEnd().split("\n");
    }, 120_000);

    // Property: the real entry exercises all seven commands and reports exactly the operator contract.
    // Mutant: drop/reorder a case or alter the fixture so an earlier guard steals its refusal.
    it("the operator command prints §5's lines in order and ends PES-S01-ACCEPT: PASS", () => {
      expect(entry.exitCode).toBe(0);
      expect(entry.stderr).toBe("");
      expect(lines).toHaveLength(14);
      expect(lines[0]).toMatch(/^PES-S01 SCRATCH-DB port=(\d+) seeded-version=4 rows=32$/u);
      expect(lines.slice(1, 9)).toStrictEqual([
        "PES-S01 CASE not-hosted PES_PUBLISH_SET_NOT_HOSTED:local",
        "PES-S01 CASE roster-invalid PES_PUBLISH_ROSTER_INVALID:vendor:a",
        "PES-S01 CASE base-row-absent PES_PUBLISH_BASE_ROW_ABSENT:999",
        "PES-S01 CASE unvetted PROVIDER_VENDOR_NOT_VETTED:vendor:a",
        "PES-S01 CASE targets-rejected PES_PUBLISH_SET_TARGETS_REJECTED:PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID",
        "PES-S01 CASE published", runnerLine, apiLine
      ]);
      const receipt = /^PES_HOSTED_PROVIDER_SET_RECEIPT_V1=\{"registerVersion":"([1-9][0-9]*)","rowCount":32,"snapshotSha256":"[0-9a-f]{64}"\}$/u.exec(lines[9]!);
      expect(receipt).not.toBeNull();
      expect(BigInt(receipt![1]!)).toBeGreaterThan(4n);
      const roleSeed = /^PES-S01 ROLE-SEED version=([1-9][0-9]*)$/u.exec(lines[10]!);
      expect(roleSeed).not.toBeNull();
      expect(BigInt(roleSeed![1]!)).toBeGreaterThan(BigInt(receipt![1]!));
      expect(lines.slice(11)).toStrictEqual([
        "PES-S01 CASE role-provider-dropped PES_PUBLISH_ROLE_PROVIDER_DROPPED:evaluatorRoleRef",
        "PES-S01 SCRATCH-DB STOPPED", "PES-S01-ACCEPT: PASS"
      ]);
      expect(entry.stdout).toBe(`${lines.join("\n")}\n`);
      expect(entry.stdout).not.toContain("Bearer");
      expect(entry.stderr).not.toContain("Bearer");
    });

    // Property: the scratch listener is isolated and absent when the command returns.
    // Mutant: report a forbidden port or omit database.stop().
    it("the scratch server was never a NO-TOUCH port and is gone after the run", async () => {
      const portMatch = /^PES-S01 SCRATCH-DB port=(\d+) /u.exec(lines[0]!);
      expect(portMatch).not.toBeNull();
      const port = Number(portMatch![1]);
      expect(port).toBeGreaterThan(4400);
      expect([3000, 3001, 4310, 8790, 8791, 8792, 8793, 8795, 8796, 55432]).not.toContain(port);
      const errorCode = await new Promise<string>((resolveCode) => {
        const socket = connect({ host: "127.0.0.1", port });
        socket.once("connect", () => { socket.destroy(); resolveCode("CONNECTED"); });
        socket.once("error", (error: NodeJS.ErrnoException) => { socket.destroy(); resolveCode(error.code ?? "UNKNOWN"); });
        socket.setTimeout(2000, () => { socket.destroy(); resolveCode("TIMEOUT"); });
      });
      expect(errorCode).toBe("ECONNREFUSED");
    });

  });

  // Property: wrong child output records the first failed case and always stops once.
  // Mutant: accept arbitrary refusals, overwrite failed with the last case, or skip stop.
  it("a case that does not hold still stops the database, names that case and resolves 1", async () => {
    const fake = fakes();
    let call = 0;
    const original = fake.dependencies.runPublishCommand;
    const dependencies = { ...fake.dependencies, runPublishCommand: async (env: Readonly<Record<string, string>>) => {
      call += 1;
      return call >= 3 ? { exitCode: 1, stdout: "", stderr: "SOMETHING_ELSE\n" } : original(env);
    } };
    expect(await runPesS01PublishSetAcceptance(dependencies)).toBe(1);
    expect(fake.lines).toContain("PES-S01 SCRATCH-DB STOPPED");
    expect(fake.lines.at(-1)).toBe("PES-S01-ACCEPT: FAIL base-row-absent");
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  // Property: both a child throw and a seed rejection retain their own failure and clean up.
  // Mutant: let either exception escape, mark it PASS, or lose the finally cleanup.
  it("a throw mid-run and a seed failure still stop the database and resolve 1", async () => {
    const child = fakes();
    child.runPublishCommand.mockImplementationOnce(async () => ({ exitCode: 1, stdout: "", stderr: `${refusalLines[0]}\n` }))
      .mockRejectedValueOnce(new Error("CHILD_FAILED"));
    expect(await runPesS01PublishSetAcceptance(child.dependencies)).toBe(1);
    expect(child.lines.at(-1)).toBe("PES-S01-ACCEPT: FAIL roster-invalid");
    expect(child.stop).toHaveBeenCalledTimes(1);
    const seed = fakes();
    seed.seedVersion4.mockRejectedValueOnce(new Error("SEED_FAILED"));
    expect(await runPesS01PublishSetAcceptance(seed.dependencies)).toBe(1);
    expect(seed.lines.at(-1)).toBe("PES-S01-ACCEPT: FAIL scratch-db");
    expect(seed.stop).toHaveBeenCalledTimes(1);
  });

  // Property: the documented package command launches the acceptance entry.
  // Mutant: remove or misroute its script (the exact script is PLAN K5's explicit oracle).
  it("the operator runs the acceptance as pnpm pes:accept-publish-set", async () => {
    const manifest = JSON.parse(await readFile(resolve(productRoot, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(manifest.scripts["pes:accept-publish-set"]).toBe("tsx acceptance/pes-accept-publish-set.ts");
  });

  // Property: startup failure yields one diagnostic line and a nonzero real process status.
  // Mutant: process.exitCode instead of process.exit, or eager roster mkdtemp.
  it("a scratch database that cannot start ends UNVERIFIED and the process exits 1", async () => {
    const result = await runEntry({ TMPDIR: "/nonexistent/pes-s01-k6", TSX_DISABLE_CACHE: "1" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatch(/^PES-S01-ACCEPT: UNVERIFIED ENOENT: no such file or directory, mkdtemp '\/nonexistent\/pes-s01-k6\/debateai-s00-postgres-[A-Za-z0-9]{6}'\n$/u);
  }, 120_000);

  // Property: the seed satisfies the required manifest while preserving both ruled role rows exactly.
  // Mutant: omit the other 15 rows or keep the builder's role provenance/provider.
  it("the role seed rows are R1.12's two rows plus the other 15 required rows", () => {
    const rows = buildPesS01RoleSeedRows();
    expect(rows).toHaveLength(17);
    expect(new Set(rows.map((row) => row.rowKey))).toStrictEqual(new Set(ALGORITHM_REGISTER_ROW_KEYS));
    expect(rows.find((row) => row.rowKey === "synthesizerRoleRef")).toStrictEqual({
      rowKey: "synthesizerRoleRef",
      valueJsonText: '{"kind":"SYNTHESIZER_ROLE_REF","providerRef":"vendor:a","provisional":true}',
      sourceRef: "provider-env-selection/S01#acceptance-role-rows"
    });
    expect(rows.find((row) => row.rowKey === "evaluatorRoleRef")).toStrictEqual({
      rowKey: "evaluatorRoleRef",
      valueJsonText: '{"kind":"EVALUATOR_ROLE_REF","providerRef":"vendor:z","provisional":true}',
      sourceRef: "provider-env-selection/S01#acceptance-role-rows"
    });
  });

  // Property: the role seed gates the seventh child and consumes the published receipt's version.
  // Mutant: run the seventh child after a rejected seed, or use the original base version.
  it("a role seed that fails is a FAIL of role-provider-dropped, and the database still stops", async () => {
    const bad = fakes();
    bad.seedRoleRows.mockRejectedValueOnce(new Error("REGISTER_REQUIRED_ROW_MISSING:envelope:envelopeFormulaInputs"));
    expect(await runPesS01PublishSetAcceptance(bad.dependencies)).toBe(1);
    expect(bad.lines).toContain("PES-S01 CASE role-provider-dropped PES-S01-CASE-ERROR");
    expect(bad.lines).toContain("PES-S01 SCRATCH-DB STOPPED");
    expect(bad.lines.at(-1)).toBe("PES-S01-ACCEPT: FAIL role-provider-dropped");
    expect(bad.stop).toHaveBeenCalledTimes(1);
    expect(bad.runPublishCommand).toHaveBeenCalledTimes(6);
    const good = fakes();
    expect(await runPesS01PublishSetAcceptance(good.dependencies)).toBe(0);
    expect(good.lines.slice(-4)).toStrictEqual([
      "PES-S01 ROLE-SEED version=6",
      "PES-S01 CASE role-provider-dropped PES_PUBLISH_ROLE_PROVIDER_DROPPED:evaluatorRoleRef",
      "PES-S01 SCRATCH-DB STOPPED", "PES-S01-ACCEPT: PASS"
    ]);
    expect(good.seedRoleRows).toHaveBeenCalledWith(good.pool, (4n + 1n).toString());
    expect(good.runPublishCommand).toHaveBeenCalledTimes(7);
    expect(good.runPublishCommand.mock.calls[6]![0].REGISTER_VERSION).toBe((4n + 2n).toString());
  });

  // Property: startup rejection preserves its complete one-line reason without any seed or child call.
  // Mutant: generic/first-line-only error, wrong verdict or continuing after start fails.
  it("a database that cannot start is UNVERIFIED with its own error on one line, and nothing is stopped", async () => {
    const fake = fakes();
    fake.startDatabase.mockRejectedValueOnce(new Error("EMBEDDED_POSTGRES_PROVISIONING_FAILED\nsecond line"));
    expect(await runPesS01PublishSetAcceptance(fake.dependencies)).toBe(1);
    expect(fake.lines).toStrictEqual(["PES-S01-ACCEPT: UNVERIFIED EMBEDDED_POSTGRES_PROVISIONING_FAILED second line"]);
    expect(fake.seedVersion4).not.toHaveBeenCalled();
    expect(fake.runPublishCommand).not.toHaveBeenCalled();
    expect(fake.stop).not.toHaveBeenCalled();
  });
});
