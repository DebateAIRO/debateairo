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
 *  - a hosted boot with no per-run ceiling fails at stage "model-picker", the same way;
 *  - paid plans S4c (final review P3-M4): the money terms and the billing switch main.ts hands
 *    the function reach the picker — the reserve and overrun reach the run maximum, and with
 *    billing on a scorecard that caps Free above ECONOMY fails at stage "model-picker";
 *  - paid plans P4-E (Part 3b re-review M-4): with billing on, a scorecard under which no declared
 *    Free-plan model can take the answer writer's or the answer checker's job fails at stage
 *    "model-picker" (SCORECARD_FREE_ANSWER_UNSCORED); billing off and local mode boot as before.
 */
import { mkdtemp, open as openFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import type { ProviderDiscoveryTarget } from "@debateai/providers";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { generateDek, kekId, loadKek } from "../../packages/crypto/src/index.js";
import { installBootCustody } from "../../apps/api/src/boot-custody.js";
import { composeAskModelPicker, type AskMoneyPolicy } from "../../apps/api/src/ask-model-picker.js";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import { SCORECARD_PLAN_CAPS_INVALID } from "@debateai/scorecard";
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
/** Final review I3: the sealed answer bounds the boot read in its own stage, handed through. */
const CALL_TOKEN_CEILINGS = Object.freeze({ judge: 2048, synthesizer: 4096, evaluator: 1024 });
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
    /** Paid plans S4c: the two members main.ts passes; omitted, exactly as before. */
    moneyPolicy?: AskMoneyPolicy | null;
    billingEnabled?: boolean;
    /** Paid plans P4-E: the declared targets; omitted, none, exactly as before. */
    targets?: readonly ProviderDiscoveryTarget[];
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
      targets: input.targets ?? [],
      callTokenCeilings: CALL_TOKEN_CEILINGS,
      perRunCeilingMicros: input.perRunCeilingMicros,
      ...(input.moneyPolicy === undefined ? {} : { moneyPolicy: input.moneyPolicy }),
      ...(input.billingEnabled === undefined ? {} : { billingEnabled: input.billingEnabled }),
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
    expect(picker.answerTokenCeilings).toMatchObject({ JUDGE: 2048, ANSWER_WRITER: 4096, ANSWER_CHECKER: 1024 });
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

  // Paid plans S4c (final review P3-M4): main.ts hands the stage B6b's guard policy. Dropped on the
  // way, the picker would fall back to the bare per-run ceiling — no reserve, no overrun — silently.
  it("HOSTED hands the picker the sealed money terms: the reserve and overrun reach the run maximum", async () => {
    const pool = poolWithRow({ value_json: scorecardJson(5), source_ref: HOSTED_SOURCE_REF });
    const moneyPolicy = Object.freeze({
      perRunCeilingMicros: 1_000_000, serveReserveBasisPoints: 1_500, serveOverrunBasisPoints: 2_000
    });
    const { settled } = compose({ pool, deploymentMode: "hosted", perRunCeilingMicros: 1_000_000, moneyPolicy });
    const picker = await settled;
    expect(picker.moneyPolicy).toEqual(moneyPolicy);
    // The overrun on top of the ceiling: what an estimate the picker cannot make counts as.
    expect(picker.runMaximumMicros).toBe(1_200_000);
    // Billing was not switched on, so the example's { free: BALANCED } boots and nothing is sold.
    expect(picker.plansSold).toBe(false);
  });

  // Paid plans S4c (final review P3-M4): main.ts hands the stage the billing switch. Dropped on the way,
  // a scorecard that caps Free at BALANCED would boot with billing on; the stage refuses it instead.
  it("fails at stage \"model-picker\" with billing on when the scorecard caps Free above ECONOMY, destroying the held key", async () => {
    const logger = bootLogger();
    // The example scorecard's own caps: { free: "BALANCED" }.
    const json = scorecardJson(5);
    expect((json.pickerSettings as { planStrengthCaps: unknown }).planStrengthCaps).toEqual({ free: "BALANCED" });
    const pool = poolWithRow({ value_json: json, source_ref: HOSTED_SOURCE_REF });
    const { settled, key } = compose({
      pool, deploymentMode: "hosted", perRunCeilingMicros: 1_000_000,
      moneyPolicy: { perRunCeilingMicros: 1_000_000, serveOverrunBasisPoints: 2_000 }, billingEnabled: true, logger
    });
    await expect(settled).rejects.toThrowError(SCORECARD_PLAN_CAPS_INVALID);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logger.error.mock.calls[0]?.[0]))).toEqual({
      event: "api.boot.failed", stage: "model-picker"
    });
    expect(() => kekId(key)).toThrowError(expect.objectContaining({ code: "KEK_DESTROYED" }));
  });

  // Paid plans P4-E (Part 3b re-review M-4; the controller's ruling C4 of 3 October 2026): with billing
  // on, a Free ask's answer writer and answer checker take only a scored Free-plan model, so a scorecard
  // under which no declared Free-plan model can take one of them would refuse every Free question. The
  // stage refuses it, as publishing does; the test is the picker's own eligibility.
  describe("paid plans P4-E · with billing on, a scorecard must seat Free's answer jobs", () => {
    const sellingPlans = { moneyPolicy: { perRunCeilingMicros: 1_000_000 }, billingEnabled: true } as const;

    it("fails at stage \"model-picker\" when no declared Free-plan model is scored for them, destroying the held key", async () => {
      const logger = bootLogger();
      const pool = poolWithRow({ value_json: followingTheCapRules(scorecardJson(5)), source_ref: HOSTED_SOURCE_REF });
      const { settled, key } = compose({
        pool, deploymentMode: "hosted", perRunCeilingMicros: 1_000_000, ...sellingPlans, targets: FREE_ROSTER_TARGETS, logger
      });
      await expect(settled).rejects.toThrowError("SCORECARD_FREE_ANSWER_UNSCORED");
      expect(JSON.parse(String(logger.error.mock.calls[0]?.[0]))).toEqual({
        event: "api.boot.failed", stage: "model-picker"
      });
      expect(() => kekId(key)).toThrowError(expect.objectContaining({ code: "KEK_DESTROYED" }));
    });

    it("fails the same way when the scored Free-plan models are not among the declared targets", async () => {
      const pool = poolWithRow({ value_json: followingTheCapRules(freeRosterScored(scorecardJson(5))), source_ref: HOSTED_SOURCE_REF });
      const { settled } = compose({
        pool, deploymentMode: "hosted", perRunCeilingMicros: 1_000_000, ...sellingPlans,
        targets: FREE_ROSTER_TARGETS.map((target) => ({ ...target, model: `${target.model}-other` }))
      });
      await expect(settled).rejects.toThrowError("SCORECARD_FREE_ANSWER_UNSCORED");
    });

    it("fails the same way when the Free-plan models are scored for the answer writer only", async () => {
      const json = freeRosterScored(scorecardJson(5));
      const roles = json.roles as Record<string, Array<Record<string, unknown>>>;
      roles.ANSWER_CHECKER = roles.ANSWER_CHECKER!.map((entry) =>
        ((FREE_SCORED as readonly string[]).includes(entry.candidateId as string) ? { ...entry, tier: "AVOID" } : entry));
      const pool = poolWithRow({ value_json: followingTheCapRules(json), source_ref: HOSTED_SOURCE_REF });
      const { settled } = compose({
        pool, deploymentMode: "hosted", perRunCeilingMicros: 1_000_000, ...sellingPlans, targets: FREE_ROSTER_TARGETS
      });
      await expect(settled).rejects.toThrowError("SCORECARD_FREE_ANSWER_UNSCORED");
    });

    it("boots when a declared Free-plan model can take both answer jobs, and tells the picker the site sells plans", async () => {
      const pool = poolWithRow({ value_json: followingTheCapRules(freeRosterScored(scorecardJson(5))), source_ref: HOSTED_SOURCE_REF });
      const { settled } = compose({
        pool, deploymentMode: "hosted", perRunCeilingMicros: 1_000_000, ...sellingPlans, targets: FREE_ROSTER_TARGETS
      });
      expect((await settled).plansSold).toBe(true);
    });

    it("keeps booting a scorecard that scores no Free-plan model with billing off, and in local mode", async () => {
      const pool = poolWithRow({ value_json: followingTheCapRules(scorecardJson(5)), source_ref: HOSTED_SOURCE_REF });
      const off = compose({
        pool, deploymentMode: "hosted", perRunCeilingMicros: 1_000_000, moneyPolicy: { perRunCeilingMicros: 1_000_000 },
        billingEnabled: false, targets: FREE_ROSTER_TARGETS
      });
      expect((await off.settled).plansSold).toBe(false);
      const local = compose({
        pool: refusingPool(), deploymentMode: "local", perRunCeilingMicros: null, billingEnabled: true, targets: FREE_ROSTER_TARGETS
      });
      expect((await local.settled).plansSold).toBe(false);
    });
  });

  it("the temporary files are real files the reader can open (the fixture itself is sound)", async () => {
    const handle = await openFile(bundledScorecard);
    await handle.close();
  });
});

/** P4-E: two declared vendors (fixture names) serving the Free plan's two models. */
const FREE_ROSTER_TARGETS: readonly ProviderDiscoveryTarget[] = Object.freeze(["Alpha", "Beta"].map((maker, index) => Object.freeze({
  providerRef: `vendor:${maker.toLowerCase()}`,
  maker,
  baseUrl: `https://api.${maker.toLowerCase()}-vendor-fixture.com/v1`,
  model: PLAN_TIER_ROSTERS.free[index]!,
  inputPriceMicrosPerMillionTokens: 1_000_000,
  outputPriceMicrosPerMillionTokens: 4_000_000
})));

/** P4-E: the example's two candidates (GOOD_VALUE for both answer jobs) re-pointed at those targets. */
const FREE_SCORED = ["openai-alpha-low", "anthropic-gamma-low"] as const;

function freeRosterScored(json: Record<string, unknown>): Record<string, unknown> {
  return {
    ...json,
    candidates: (json.candidates as Array<Record<string, unknown>>).map((candidate) => {
      const index = (FREE_SCORED as readonly string[]).indexOf(candidate.candidateId as string);
      const target = FREE_ROSTER_TARGETS[index];
      return target === undefined ? candidate
        : { ...candidate, vendor: target.maker, maker: target.maker, modelId: target.model, thinkingLevel: "DEFAULT_ONLY" };
    }),
    roles: structuredClone(json.roles)
  };
}

/** The owners' plan-cap rule (Free → ECONOMY) and Free rule (EXAMPLE Free caps: half of each Economy cap). */
function followingTheCapRules(json: Record<string, unknown>): Record<string, unknown> {
  const pickerSettings = json.pickerSettings as Record<string, unknown>;
  const economyCap = pickerSettings.economyCap as Record<string, { moneyMicrosPerCall: number }>;
  return {
    ...json,
    pickerSettings: {
      ...pickerSettings,
      planStrengthCaps: { free: "ECONOMY" },
      freeCap: Object.fromEntries(Object.entries(economyCap).map(([role, cap]) => [
        role, { moneyMicrosPerCall: Math.floor(cap.moneyMicrosPerCall / 2) }
      ]))
    }
  };
}
