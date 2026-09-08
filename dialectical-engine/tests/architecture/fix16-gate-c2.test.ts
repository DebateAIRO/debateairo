import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_INVENTORY_GATE_MS,
  evaluateInventoryGate,
  parseInventoryGateMs,
  runInventoryGate,
  serializeBaseline,
} from "../../tools/obs-inventory/src/gate.js";
import { scan, scanSource } from "../../tools/obs-inventory/src/scan.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = join(projectRoot, "tests/fixtures/fix16/gate");

describe("FIX-16 C2 inventory gate", () => {
  it("passes when every scanned finding is present in the checked-in baseline fixture", async () => {
    const rootDirectory = join(fixtureRoot, "baseline-pass/root");
    const baselinePath = join(fixtureRoot, "baseline-pass/baseline.json");
    const findings = await scan(rootDirectory);
    const baselineText = await readFile(baselinePath, "utf8");

    expect(evaluateInventoryGate(findings, baselineText)).toEqual({
      baselineCount: 1,
      newFindings: [],
    });
  });

  it("reports a new entry with its explicit relative path, line, and class", async () => {
    const rootDirectory = join(fixtureRoot, "new-entry/root");
    const baselinePath = join(fixtureRoot, "new-entry/baseline.json");
    const findings = await scan(rootDirectory);
    const baselineText = await readFile(baselinePath, "utf8");

    expect(evaluateInventoryGate(findings, baselineText)).toEqual({
      baselineCount: 0,
      newFindings: [
        { path: "apps/example.ts", line: 3, class: "bare_catch" },
      ],
    });
  });

  it("serializes snapshots deterministically in scanner order", async () => {
    const rootDirectory = join(fixtureRoot, "snapshot/root");
    const expectedPath = join(fixtureRoot, "snapshot/expected-baseline.json");
    const findings = await scan(rootDirectory);
    const expected = await readFile(expectedPath, "utf8");

    expect(serializeBaseline(findings)).toBe(expected);
  });

  it("rejects malformed or duplicate baseline entries instead of weakening the gate", async () => {
    const malformedPath = join(fixtureRoot, "malformed/baseline.json");
    const malformed = await readFile(malformedPath, "utf8");

    expect(() => evaluateInventoryGate([], malformed))
      .toThrow("OBS_INVENTORY_BASELINE_INVALID");
    expect(() => evaluateInventoryGate([], '{"version":1,"entries":[{"path":"apps/a.ts","line":1,"class":"bare_catch"},{"path":"apps/a.ts","line":1,"class":"bare_catch"}]}\n'))
      .toThrow("OBS_INVENTORY_BASELINE_INVALID");
  });

  it("uses the labelled 30000 ms seed and accepts only positive integer overrides", () => {
    expect(DEFAULT_INVENTORY_GATE_MS).toBe(30_000);
    expect(parseInventoryGateMs(undefined)).toBe(30_000);
    expect(parseInventoryGateMs("1")).toBe(1);
    expect(() => parseInventoryGateMs("0")).toThrow("OBS_INVENTORY_GATE_MS_INVALID");
    expect(() => parseInventoryGateMs("1.5")).toThrow("OBS_INVENTORY_GATE_MS_INVALID");
  });

  it("prints the baseline PASS and exact new-entry FAIL contracts", async () => {
    const passingOutput: string[] = [];
    const failingOutput: string[] = [];

    const passingExit = await runInventoryGate({
      rootDirectory: join(fixtureRoot, "baseline-pass/root"),
      baselinePath: join(fixtureRoot, "baseline-pass/baseline.json"),
      gateMs: 30_000,
      now: () => 12,
      writeOutput: (line) => passingOutput.push(line),
    });
    const failingExit = await runInventoryGate({
      rootDirectory: join(fixtureRoot, "new-entry/root"),
      baselinePath: join(fixtureRoot, "new-entry/baseline.json"),
      gateMs: 30_000,
      now: () => 12,
      writeOutput: (line) => failingOutput.push(line),
    });

    expect(passingExit).toBe(0);
    expect(passingOutput).toEqual(["PASS baseline=1 new=0 elapsed_ms=0"]);
    expect(failingExit).toBe(1);
    expect(failingOutput).toEqual([
      "FAIL apps/example.ts:3 bare_catch",
      "FAIL baseline=0 new=1 elapsed_ms=0",
    ]);
  });

  it("writes a deterministic snapshot for an explicit fixture root", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "fix16-c2-snapshot-"));
    const baselinePath = join(temporaryDirectory, "baseline.json");
    const output: string[] = [];
    try {
      const exit = await runInventoryGate({
        rootDirectory: join(fixtureRoot, "snapshot/root"),
        baselinePath,
        snapshot: true,
        gateMs: 30_000,
        now: () => 44,
        writeOutput: (line) => output.push(line),
      });

      expect(exit).toBe(0);
      expect(await readFile(baselinePath, "utf8")).toBe(
        await readFile(join(fixtureRoot, "snapshot/expected-baseline.json"), "utf8"),
      );
      expect(output).toEqual(["SNAPSHOT baseline=2 elapsed_ms=0"]);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("fails when elapsed time reaches the configured ceiling", async () => {
    const output: string[] = [];
    const readings = [100, 130];

    const exit = await runInventoryGate({
      rootDirectory: join(fixtureRoot, "baseline-pass/root"),
      baselinePath: join(fixtureRoot, "baseline-pass/baseline.json"),
      gateMs: 30,
      now: () => readings.shift() ?? 130,
      writeOutput: (line) => output.push(line),
    });

    expect(exit).toBe(1);
    expect(output).toEqual(["FAIL inventory_gate_timeout elapsed_ms=30 limit_ms=30"]);
  });

  it("passes when fractional elapsed time remains below the configured ceiling", async () => {
    const output: string[] = [];
    const readings = [100, 129.5];

    const exit = await runInventoryGate({
      rootDirectory: join(fixtureRoot, "baseline-pass/root"),
      baselinePath: join(fixtureRoot, "baseline-pass/baseline.json"),
      gateMs: 30,
      now: () => readings.shift() ?? 129.5,
      writeOutput: (line) => output.push(line),
    });

    expect(exit).toBe(0);
    expect(output).toEqual(["PASS baseline=1 new=0 elapsed_ms=29"]);
  });

  it("exposes an independent CLI with the PASS and path-line FAIL exit contracts", () => {
    const entrypoint = join(projectRoot, "tools/obs-inventory/src/index.ts");
    const run = (fixture: string) => spawnSync(
      process.execPath,
      ["--import", "tsx", entrypoint],
      {
        cwd: join(fixtureRoot, fixture),
        encoding: "utf8",
        env: { ...process.env, OBS_INVENTORY_GATE_MS: "30000" },
      },
    );

    const passing = run("cli-pass");
    const failing = run("cli-fail");

    expect(passing.status).toBe(0);
    expect(passing.stderr).toBe("");
    expect(passing.stdout).toMatch(/^PASS baseline=1 new=0 elapsed_ms=\d+\n$/);
    expect(failing.status).toBe(1);
    expect(failing.stderr).toBe("");
    expect(failing.stdout).toMatch(
      /^FAIL apps\/example\.ts:3 bare_catch\nFAIL baseline=0 new=1 elapsed_ms=\d+\n$/,
    );
  });

  it("adds no inventory entry from the C2 gate implementation itself", async () => {
    const gatePath = join(projectRoot, "tools/obs-inventory/src/gate.ts");
    const source = await readFile(gatePath, "utf8");

    expect(scanSource(source, "tools/obs-inventory/src/gate.ts")).toEqual([]);
  });
});
