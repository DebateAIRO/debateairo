/**
 * Final review I5 — THE HOSTED BOOT GLUE, TESTED WITHOUT POSTGRES.
 *
 * The API's two model-picker boot stages ("model-scorecard" and "model-picker") are one exported
 * function, `composeAskModelPicker`, run under the boot ledger `apps/api/src/main.ts` hands it.
 * Here it runs against a fake pool, a temporary engine manifest and a temporary bundled
 * scorecard, under a real boot ledger that holds a real key:
 *  - HOSTED reads the sealed row at REGISTER_VERSION and never opens the bundled file;
 *  - LOCAL reads the bundled file and never queries the pool;
 *  - a missing engine manifest fails at stage "model-scorecard" through the ledger, which
 *    destroys the held key;
 *  - a hosted boot with no per-run ceiling fails at stage "model-picker", the same way.
 */
import { mkdtemp, open as openFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { generateDek, kekId, loadKek } from "../../packages/crypto/src/index.js";
import { installBootCustody } from "../../apps/api/src/boot-custody.js";
import { composeAskModelPicker } from "../../apps/api/src/ask-model-picker.js";
import { readExampleScorecardJson, TEST_ENGINE_VERSION } from "../support/scorecardFixtures.js";

/** Every `open` the scorecard reader makes, so "never opens the file" is observed, not inferred. */
const opened = vi.hoisted(() => [] as string[]);
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: (async (...args: Parameters<typeof actual.open>) => {
      opened.push(String(args[0]));
      return actual.open(...args);
    }) as typeof actual.open
  };
});

const REGISTER_VERSION = 42;
const HOSTED_SOURCE_REF = "hosted-register.json | modelScorecard v5 sha256:test";

function heldKek() {
  const material = generateDek();
  const handle = loadKek(material);
  material.fill(0);
  return handle;
}

/** The example scorecard, re-versioned, so which source a result came from is plain to see. */
function scorecardJson(scorecardVersion: number): Record<string, unknown> {
  return { ...(readExampleScorecardJson() as Record<string, unknown>), scorecardVersion };
}

type FakePool = { readonly query: ReturnType<typeof vi.fn> };
type BootLogger = { readonly error: Mock<(message: string) => unknown> };

function bootLogger(): BootLogger {
  return { error: vi.fn<(message: string) => unknown>() };
}

function poolWithRow(row: Readonly<{ value_json: unknown; source_ref: string }> | null): FakePool {
  return { query: vi.fn(async () => ({ rows: row === null ? [] : [row] })) };
}

function refusingPool(): FakePool {
  return { query: vi.fn(async () => { throw new Error("LOCAL mode must never query the pool"); }) };
}

describe("final review I5 · composeAskModelPicker, the API's model-scorecard and model-picker boot stages", () => {
  let directory: string;
  let engineManifest: URL;
  let bundledScorecard: URL;

  beforeEach(async () => {
    opened.length = 0;
    directory = await mkdtemp(join(tmpdir(), "model-picker-boot-"));
    engineManifest = pathToFileURL(join(directory, "package.json"));
    bundledScorecard = pathToFileURL(join(directory, "current.json"));
    await writeFile(engineManifest, JSON.stringify({ version: TEST_ENGINE_VERSION }));
    await writeFile(bundledScorecard, JSON.stringify(scorecardJson(3)));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function compose(input: Readonly<{
    pool: FakePool;
    deploymentMode: "hosted" | "local";
    perRunCeilingMicros: number | null;
    engineManifest?: URL;
    logger?: BootLogger;
  }>) {
    const logger = input.logger ?? bootLogger();
    const boot = installBootCustody({ logger });
    const key = boot.holdKek(heldKek());
    const lines: string[] = [];
    const settled = composeAskModelPicker({
      boot,
      pool: input.pool as unknown as Pool,
      deploymentMode: input.deploymentMode,
      registerVersion: REGISTER_VERSION,
      targets: [],
      perRunCeilingMicros: input.perRunCeilingMicros,
      log: (line) => lines.push(line),
      engineManifest: input.engineManifest ?? engineManifest,
      bundledScorecard
    });
    return { settled, key, lines, logger };
  }

  it("HOSTED reads the sealed row at REGISTER_VERSION and never opens the bundled file", async () => {
    const pool = poolWithRow({ value_json: scorecardJson(5), source_ref: HOSTED_SOURCE_REF });
    const { settled, key, lines } = compose({ pool, deploymentMode: "hosted", perRunCeilingMicros: 1_000_000 });
    const picker = await settled;
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0]?.[1]).toEqual([REGISTER_VERSION, "modelScorecard"]);
    expect(opened.filter((path) => path === String(bundledScorecard))).toEqual([]);
    expect(picker).toMatchObject({ mode: "HOSTED", perRunCeilingMicros: 1_000_000 });
    expect(picker.scorecard).toMatchObject({ state: "VALID", sourceRef: HOSTED_SOURCE_REF });
    if (picker.scorecard.state !== "VALID") throw new Error("expected the sealed row's scorecard");
    expect(picker.scorecard.scorecard.scorecardVersion).toBe(5);
    expect(lines).toEqual(["MODEL_SCORECARD state=VALID scorecard_version=5 source=register"]);
    // A stage that succeeds keeps the key held for the next one.
    expect(kekId(key)).toMatch(/^[0-9a-f]{16}$/u);
  });

  it("HOSTED with no sealed row is ABSENT — the plan rosters — and still never opens the file", async () => {
    const pool = poolWithRow(null);
    const { settled, lines } = compose({ pool, deploymentMode: "hosted", perRunCeilingMicros: 1_000_000 });
    expect((await settled).scorecard).toEqual({ state: "ABSENT" });
    expect(opened.filter((path) => path === String(bundledScorecard))).toEqual([]);
    expect(lines).toEqual(["MODEL_SCORECARD state=ABSENT source=register (asks keep the plan rosters)"]);
  });

  it("LOCAL reads the bundled file and never queries the pool", async () => {
    const pool = refusingPool();
    const { settled, lines } = compose({ pool, deploymentMode: "local", perRunCeilingMicros: null });
    const picker = await settled;
    expect(pool.query).not.toHaveBeenCalled();
    expect(opened).toContain(String(bundledScorecard));
    expect(picker).toMatchObject({ mode: "LOCAL", perRunCeilingMicros: null });
    if (picker.scorecard.state !== "VALID") throw new Error("expected the bundled file's scorecard");
    expect(picker.scorecard.scorecard.scorecardVersion).toBe(3);
    expect(lines).toEqual(["MODEL_SCORECARD state=VALID scorecard_version=3 source=bundled-file"]);
  });

  it("fails at stage \"model-scorecard\" through the ledger when the engine manifest is missing, destroying the held key", async () => {
    const logger = bootLogger();
    const pool = poolWithRow(null);
    const missing = pathToFileURL(join(directory, "absent", "package.json"));
    const { settled, key, lines } = compose({
      pool, deploymentMode: "hosted", perRunCeilingMicros: 1_000_000, engineManifest: missing, logger
    });
    await expect(settled).rejects.toThrowError("ENGINE_VERSION_UNRESOLVED");
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logger.error.mock.calls[0]?.[0]))).toEqual({
      event: "api.boot.failed", stage: "model-scorecard"
    });
    expect(() => kekId(key)).toThrowError(expect.objectContaining({ code: "KEK_DESTROYED" }));
    expect(pool.query).not.toHaveBeenCalled();
    expect(lines).toEqual([]);
  });

  it("fails at stage \"model-picker\" through the ledger when a hosted boot has no per-run ceiling, destroying the held key", async () => {
    const logger = bootLogger();
    const pool = poolWithRow({ value_json: scorecardJson(5), source_ref: HOSTED_SOURCE_REF });
    const { settled, key } = compose({ pool, deploymentMode: "hosted", perRunCeilingMicros: null, logger });
    await expect(settled).rejects.toThrowError("ASK_MODEL_PICKER_PER_RUN_CEILING_REQUIRED");
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logger.error.mock.calls[0]?.[0]))).toEqual({
      event: "api.boot.failed", stage: "model-picker"
    });
    expect(() => kekId(key)).toThrowError(expect.objectContaining({ code: "KEK_DESTROYED" }));
  });

  it("the temporary files are real files the reader can open (the fixture itself is sound)", async () => {
    const handle = await openFile(bundledScorecard);
    await handle.close();
  });
});
