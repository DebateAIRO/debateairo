// tests/unit/runner-lane-run-version.test.ts
// V4 start step, Task 57l (owner, 8 Nov: "Fix here, ship next upload"): in hosted mode every call is charged to its own run's settings version's
// guard (main.ts `runCostEnvelopeGuard`), and on the preview every call runs at its own run's thinking table (`runPreviewThinkingLevelsOf`); both
// read the run → version map, which only a claim fills. So after a runner restart (an empty map), a background lane charging a run this process
// never claimed was refused RUN_SETTINGS_VERSION_UNKNOWN:UNMAPPED: "Write my report" (its sweep and its poke), the path-rewrite sweep, the
// tree sweep, the public tree's sweep and "Add to researched". Each now maps the run to its OWN stamped version first. Task 57o (owner, 8 Nov:
// "Use today's settings"): a run whose own version is refused (a typed settings refusal) is mapped to the site's version instead, with one
// journal line, and the lane goes ahead; a database failure maps nothing, and the lane skips the run this pass and logs its own code, as
// 57l did. Task 57o-fix (owner, 8 Nov: "Your switched-on one"): today's settings are the owners' switched-on version (0124's pointer, which
// 0169 lets the runner read); if this runner refuses that too, the release's own. Made-up ids and versions only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MainAnswerUpdateRead, MainAnswerUpdateRecord, PublicDigUnsettled, UnwrittenPathRewrite, WebSealed } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { ProviderCallRequest, ProviderCallResult, ProviderGateway } from "@debateai/providers";
import { closeInvestigation, pokeInvestigationClosing, type InvestigationCloseSettings } from "../../apps/runner/src/investigation-close.js";
import { sweepTreeUpdates, type MainAnswerContent, type TreeUpdatePorts, type TreeUpdateSettings } from "../../apps/runner/src/path-climb.js";
import { runDigPathRewrite, type PathRewriteRunnerSettings, type PathRewriteStoredInput } from "../../apps/runner/src/path-rewrite.js";
import { sweepPathRewrites } from "../../apps/runner/src/path-rewrite-sweep.js";
import { sweepPublicTree } from "../../apps/runner/src/public-contribution.js";
import { createRunSettingsVersions, runCostEnvelopeGuardOf, runPreviewThinkingLevelsOf, runVersionMapper } from "../../apps/runner/src/run-settings.js";
import { sweepWebResearched } from "../../apps/runner/src/web-researched.js";
import { DIG_READY, ROOT, closingOf, investigationInput, memoryReports, settingsOver as closingSettingsOver, team as closingTeam } from "../support/investigation-close-world.js";
import {
  DIG_A, PARENT_RUN, POSITION, dig, digSnapshot, memoryStore, membersOf, settingsOver as rewriteSettingsOver, team as rewriteTeam, until,
  type Logged
} from "../support/path-rewrite-world.js";

/**
 * Made up: the site's version (loaded at boot), the version the lane's run was stamped with, one this runner refuses (a typed settings
 * refusal, kept for the life of the process: an upload changed one of its AIs' instructions), and one whose read the database failed.
 */
const SITE_VERSION = 3;
/** Task 57o-fix: the version the owners switched on (0124's pointer), which new debates and Continue use. */
const SWITCHED_ON = 5;
const STAMPED = 7;
const UNLOADABLE = 9;
const DATABASE_DOWN = 11;
/** A version this runner can run that is not the run's: what a lane would map if it read the run again after a claim. */
const LOADS_TOO = 13;
const MORE_DIG = "66666666-6666-4666-8666-666666666666";
const PUBLIC_DIG = "77777777-7777-4777-8777-777777777777";
const CLIMBING_DIG = "88888888-8888-4888-8888-888888888888";
const RESEARCHED_RUN = "99999999-9999-4999-8999-999999999999";
const AT = "2026-11-08T10:00:00.000Z";

type Mode = "hosted" | "preview";
const settingsOf = (version: number) => Object.freeze({ costEnvelope: { guard: { version } }, previewConfig: { thinking_levels: { version } } });

/**
 * A FRESH RUNNER: its site version loaded at boot, its run → version map empty (nothing claimed since the restart). Every call is charged as
 * main.ts's seams charge it: hosted, through its own run's version's guard; on the preview, at its own run's thinking table. `charged` holds
 * each call's run and the version it was charged under. The mapper is the runner's: `stamped` is each run's `core.run.register_version`
 * (UNLOADABLE when not given); `journal` holds its lines. `siteRefused` makes the site version refuse too (a case the boot never lets happen).
 * Task 57o-fix: `switchedOn` answers the pointer (SWITCHED_ON by default; a function may throw: the read failed); `switchedOnRefused` makes the
 * runner refuse the switched-on version.
 */
function freshRunner(mode: Mode, stamped: ReadonlyMap<string, number>, options: Readonly<{ siteRefused?: boolean; switchedOnRefused?: boolean;
  switchedOn?: () => Promise<number> }> = {}) {
  const loaded = new Map<number, unknown>([[SITE_VERSION, settingsOf(SITE_VERSION)]]);
  const cache = { loaded: (version: number) => loaded.get(version) as never };
  const versions = createRunSettingsVersions();
  const guardOf = runCostEnvelopeGuardOf(cache, versions);
  const thinkingOf = runPreviewThinkingLevelsOf(cache, versions, SITE_VERSION);
  const charged: Array<readonly [string, number]> = [];
  const journal: Array<Readonly<Record<string, unknown>>> = [];
  const charge = (runId: string | null): void => {
    // Every lane's call names a run; a call of no run would show here as one.
    if (runId === null) { charged.push(["no run", SITE_VERSION]); return; }
    const seen = mode === "hosted" ? guardOf(runId) as unknown as { version: number } : thinkingOf(runId) as unknown as { version: number };
    charged.push([runId, seen.version]);
  };
  const mapRun = runVersionMapper({
    readVersion: async (runId) => stamped.get(runId) ?? UNLOADABLE,
    requireSettings: async (version) => {
      if (version === UNLOADABLE || (version === SITE_VERSION && options.siteRefused === true)
        || (version === SWITCHED_ON && options.switchedOnRefused === true)) {
        throw new TypedDomainError("RUNNER_SETTINGS_VERSION_UNLOADABLE", "made-up: this runner cannot run that version");
      }
      if (version === DATABASE_DOWN) throw new TypedDomainError("DATABASE_POOL_FAILED", "made-up: the database did not answer");
      loaded.set(version, settingsOf(version));
    },
    versions,
    switchedOnVersion: options.switchedOn ?? (async () => SWITCHED_ON),
    siteVersion: SITE_VERSION,
    log: (line) => { journal.push(line); }
  });
  const charging = (gateway: ProviderGateway): ProviderGateway => ({ call: async (request) => { charge(request.runId); return gateway.call(request); } });
  return { versions, charged, charge, mapRun, charging, journal };
}

/** Task 57o: the one journal line a refused own version writes when its run is mapped to today's version (57o-fix: the switched-on one). */
const todayLine = (runId: string) => ({ kind: "DEBATEAI_RUNNER_RUN_SETTINGS_TODAY", runId, ownVersion: String(UNLOADABLE),
  usedVersion: String(SWITCHED_ON), switchedOnVersion: String(SWITCHED_ON), code: "RUNNER_SETTINGS_VERSION_UNLOADABLE" });

/** The closing world's vendors, each call charged by the fresh runner first. */
function chargedClosingTeam(runner: ReturnType<typeof freshRunner>) {
  const vendors = closingTeam();
  for (const vendor of [vendors.haiku, vendors.glm]) {
    const call = vendor.provider.call;
    vendor.provider.call = async (request: ProviderCallRequest): Promise<ProviderCallResult> => { runner.charge(request.runId); return call(request); };
  }
  return vendors;
}

describe.each<Mode>(["hosted", "preview"])("Task 57l, %s: a fresh runner's background lanes charge each run under its own stamped version", (mode) => {
  it("'Write my report', the sweep's closing: written, every call charged on the root under its own version, never the site's", async () => {
    const runner = freshRunner(mode, new Map([[ROOT, STAMPED]]));
    const store = memoryReports();
    const vendors = chargedClosingTeam(runner);
    const settings: InvestigationCloseSettings = { ...closingSettingsOver({ store, vendors }), mapRun: runner.mapRun };
    expect(await closeInvestigation(settings, closingOf())).toBe("RECORDED");
    expect(store.records[0]!.outcome).toBe("READY");
    expect(runner.charged).toHaveLength(4);
    expect(runner.charged.every(([runId, version]) => runId === ROOT && version === STAMPED)).toBe(true);
    expect(runner.versions.versionOf(ROOT)).toBe(STAMPED);
    expect(runner.journal).toEqual([]);
  });

  it("'Write my report', the poke when a dig settles (the claimed run is the dig): the root is mapped and the report written", async () => {
    const runner = freshRunner(mode, new Map([[ROOT, STAMPED]]));
    runner.versions.set(DIG_READY, STAMPED);
    const store = memoryReports();
    const vendors = chargedClosingTeam(runner);
    const base = closingSettingsOver({ store, vendors });
    const settings: InvestigationCloseSettings = { ...base, reports: { ...base.reports, readUnreported: async () => [closingOf()] }, mapRun: runner.mapRun };
    await pokeInvestigationClosing(settings, DIG_READY);
    expect(store.records.map((record) => record.outcome)).toEqual(["READY"]);
    expect(runner.charged.length).toBeGreaterThan(0);
    expect(runner.charged.every(([runId, version]) => runId === ROOT && version === STAMPED)).toBe(true);
  });

  it("the path-rewrite sweep (a dig whose runner stopped): rewritten, its calls charged on the dig under its own version", async () => {
    const stopped = await stoppedRewrite();
    const runner = freshRunner(mode, new Map([[DIG_A, STAMPED]]));
    const again = rewriteTeam();
    const pass = await sweepPathRewrites({ rewrite: stopped.settings, roles: rolesOf(again, runner.charging), now: NOW, list: async () => [open(DIG_A)],
      mapRun: runner.mapRun });
    expect(pass).toEqual({ listed: 1, rewritten: 1, skipped: 0 });
    expect(stopped.store.rewrites.map((row) => [row.digRunId, row.outcome])).toEqual([[DIG_A, "READY"]]);
    expect(runner.charged.length).toBeGreaterThan(0);
    expect(runner.charged.every(([runId, version]) => runId === DIG_A && version === STAMPED)).toBe(true);
  });

  it("the tree sweep's main-answer update: written, its calls charged on the dig under its own version", async () => {
    const runner = freshRunner(mode, new Map([[MORE_DIG, STAMPED]]));
    const tree = treeOf(runner);
    const pass = await sweepTreeUpdates({ tree: tree.settings, list: async () => [MORE_DIG], now: () => new Date(AT), mapRun: runner.mapRun });
    expect(pass).toEqual({ listed: 1, advanced: 1, skipped: 0 });
    expect(tree.recorded.map((record) => [record.triggerKind, record.triggerId, record.outcome])).toEqual([["PATH_ADDED", MORE_DIG, "READY"]]);
    expect(runner.charged.length).toBeGreaterThan(0);
    expect(runner.charged.every(([runId, version]) => runId === MORE_DIG && version === STAMPED)).toBe(true);
  });

  it("the public tree's sweep: a finished dig and an owed climb each go on under their own version", async () => {
    const runner = freshRunner(mode, new Map([[PUBLIC_DIG, STAMPED], [CLIMBING_DIG, STAMPED]]));
    const world = publicWorld(runner, [{ dig_run_id: PUBLIC_DIG, finished: true }], [CLIMBING_DIG]);
    await sweepPublicTree(world.settings);
    expect(world.logged.map((entry) => entry.event)).toEqual([]);
    expect(runner.charged).toEqual([[PUBLIC_DIG, STAMPED], [CLIMBING_DIG, STAMPED]]);
  });

  it("'Add to researched': the page's run goes on under its own version", async () => {
    const runner = freshRunner(mode, new Map([[RESEARCHED_RUN, STAMPED]]));
    const world = researchedWorld(runner);
    await sweepWebResearched(world.settings);
    expect(runner.charged.length).toBeGreaterThan(0);
    expect(runner.charged.every(([runId, version]) => runId === RESEARCHED_RUN && version === STAMPED)).toBe(true);
    // Its reading went on past the map (stopped by the made-up pool, not refused for its version).
    expect(world.logged.filter((entry) => entry.event === "WEB_RESEARCHED_NOT_SETTLED").map((entry) => entry.detail.code)).toEqual(["TEST_STOPPED_HERE"]);
  });

  it("a run already mapped by a claim is left as it is: nothing read, its claimed version kept", async () => {
    // Review finding 3: the run reads a version that loads, so without the early return the lane would map it again (and refuse drift).
    const runner = freshRunner(mode, new Map([[ROOT, LOADS_TOO]]));
    runner.versions.set(ROOT, STAMPED);
    const store = memoryReports();
    const settings: InvestigationCloseSettings = { ...closingSettingsOver({ store, vendors: chargedClosingTeam(runner) }), mapRun: runner.mapRun };
    expect(await closeInvestigation(settings, closingOf())).toBe("RECORDED");
    expect(runner.charged.every(([, version]) => version === STAMPED)).toBe(true);
  });
});

describe.each<Mode>(["hosted", "preview"])("Task 57o, %s: a run whose own version is refused goes ahead under today's settings (the owners' switched-on version), with one journal line", (mode) => {
  it("'Write my report', the sweep's closing: written, every call charged on the root under the switched-on version", async () => {
    const runner = freshRunner(mode, new Map([[ROOT, UNLOADABLE]]));
    const store = memoryReports();
    const vendors = chargedClosingTeam(runner);
    const settings: InvestigationCloseSettings = { ...closingSettingsOver({ store, vendors }), mapRun: runner.mapRun };
    expect(await closeInvestigation(settings, closingOf())).toBe("RECORDED");
    expect(store.records.map((record) => record.outcome)).toEqual(["READY"]);
    expect(runner.charged).toHaveLength(4);
    expect(runner.charged.every(([runId, version]) => runId === ROOT && version === SWITCHED_ON)).toBe(true);
    expect(runner.versions.versionOf(ROOT)).toBe(SWITCHED_ON);
    expect(runner.journal).toEqual([todayLine(ROOT)]);
  });

  it("'Write my report', the poke when a dig settles: the root is mapped to the switched-on version and the report written", async () => {
    const runner = freshRunner(mode, new Map([[ROOT, UNLOADABLE]]));
    runner.versions.set(DIG_READY, STAMPED);
    const store = memoryReports();
    const vendors = chargedClosingTeam(runner);
    const base = closingSettingsOver({ store, vendors });
    const settings: InvestigationCloseSettings = { ...base, reports: { ...base.reports, readUnreported: async () => [closingOf()] }, mapRun: runner.mapRun };
    await pokeInvestigationClosing(settings, DIG_READY);
    expect(store.records.map((record) => record.outcome)).toEqual(["READY"]);
    expect(runner.charged.length).toBeGreaterThan(0);
    expect(runner.charged.every(([runId, version]) => runId === ROOT && version === SWITCHED_ON)).toBe(true);
    expect(runner.journal).toEqual([todayLine(ROOT)]);
  });

  it("the path-rewrite sweep: rewritten, its calls charged on the dig under the switched-on version", async () => {
    const stopped = await stoppedRewrite();
    const runner = freshRunner(mode, new Map([[DIG_A, UNLOADABLE]]));
    const again = rewriteTeam();
    expect(await sweepPathRewrites({ rewrite: stopped.settings, roles: rolesOf(again, runner.charging), now: NOW, list: async () => [open(DIG_A)],
      mapRun: runner.mapRun })).toEqual({ listed: 1, rewritten: 1, skipped: 0 });
    expect(stopped.store.rewrites.map((row) => [row.digRunId, row.outcome])).toEqual([[DIG_A, "READY"]]);
    expect(runner.charged.length).toBeGreaterThan(0);
    expect(runner.charged.every(([runId, version]) => runId === DIG_A && version === SWITCHED_ON)).toBe(true);
    expect(runner.journal).toEqual([todayLine(DIG_A)]);
  });

  it("the tree sweep's main-answer update: written, its calls charged on the dig under the switched-on version", async () => {
    const runner = freshRunner(mode, new Map([[MORE_DIG, UNLOADABLE]]));
    const tree = treeOf(runner);
    const finished = new Set<string>();
    expect(await sweepTreeUpdates({ tree: tree.settings, list: async () => [MORE_DIG], now: () => new Date(AT), mapRun: runner.mapRun }, finished))
      .toEqual({ listed: 1, advanced: 1, skipped: 0 });
    expect(tree.recorded.map((record) => [record.triggerKind, record.triggerId, record.outcome])).toEqual([["PATH_ADDED", MORE_DIG, "READY"]]);
    expect(runner.charged.length).toBeGreaterThan(0);
    expect(runner.charged.every(([runId, version]) => runId === MORE_DIG && version === SWITCHED_ON)).toBe(true);
    expect(finished.has(MORE_DIG)).toBe(true);
    expect(runner.journal).toEqual([todayLine(MORE_DIG)]);
  });

  it("the public tree's sweep: a finished dig and an owed climb each go on under the switched-on version", async () => {
    const runner = freshRunner(mode, new Map([[PUBLIC_DIG, UNLOADABLE], [CLIMBING_DIG, UNLOADABLE]]));
    const world = publicWorld(runner, [{ dig_run_id: PUBLIC_DIG, finished: true }], [CLIMBING_DIG]);
    await sweepPublicTree(world.settings);
    expect(world.logged).toEqual([]);
    expect(runner.charged).toEqual([[PUBLIC_DIG, SWITCHED_ON], [CLIMBING_DIG, SWITCHED_ON]]);
    expect(runner.journal).toEqual([todayLine(PUBLIC_DIG), todayLine(CLIMBING_DIG)]);
  });

  it("'Add to researched': the page's run goes on under the switched-on version", async () => {
    const runner = freshRunner(mode, new Map([[RESEARCHED_RUN, UNLOADABLE]]));
    const world = researchedWorld(runner);
    await sweepWebResearched(world.settings);
    expect(runner.charged.length).toBeGreaterThan(0);
    expect(runner.charged.every(([runId, version]) => runId === RESEARCHED_RUN && version === SWITCHED_ON)).toBe(true);
    expect(world.logged.filter((entry) => entry.event === "WEB_RESEARCHED_NOT_SETTLED").map((entry) => entry.detail.code)).toEqual(["TEST_STOPPED_HERE"]);
    expect(runner.journal).toEqual([todayLine(RESEARCHED_RUN)]);
  });

  it("a loadable own version writes no journal line, and a second pass over a mapped run writes none either", async () => {
    const runner = freshRunner(mode, new Map([[ROOT, STAMPED], [DIG_A, UNLOADABLE]]));
    await runner.mapRun(ROOT);
    await runner.mapRun(DIG_A);
    await runner.mapRun(DIG_A);
    expect([runner.versions.versionOf(ROOT), runner.versions.versionOf(DIG_A)]).toEqual([STAMPED, SWITCHED_ON]);
    expect(runner.journal).toEqual([todayLine(DIG_A)]);
  });
});

describe("Task 57o: review finding 2: the no-call endings of a run whose own version is refused happen again", () => {
  it("the tree sweep: a dig whose own rewrite FAILED gets its 'settled' mark (0153), nothing sent", async () => {
    const runner = freshRunner("hosted", new Map([[MORE_DIG, UNLOADABLE]]));
    const tree = treeOf(runner);
    const marked: string[] = [];
    const ports: TreeUpdatePorts = { ...tree.settings.ports,
      ownRewriteOf: async () => ({ entry: { state: "FAILED" } as never, text: null }),
      tree: { ...tree.settings.ports.tree, markDigSettled: async (digRunId: string) => { marked.push(digRunId); } } };
    expect(await sweepTreeUpdates({ tree: { ...tree.settings, ports }, list: async () => [MORE_DIG], now: () => new Date(AT), mapRun: runner.mapRun }))
      .toEqual({ listed: 1, advanced: 1, skipped: 0 });
    expect(marked).toEqual([MORE_DIG]);
    expect(runner.charged).toEqual([]);
  });

  it("'Write my report': a closing whose input cannot be read ends FAILED, as before 57l, nothing sent", async () => {
    const runner = freshRunner("hosted", new Map([[ROOT, UNLOADABLE]]));
    const store = memoryReports();
    const vendors = chargedClosingTeam(runner);
    const base = closingSettingsOver({ store, vendors });
    const settings: InvestigationCloseSettings = { ...base, mapRun: runner.mapRun,
      sources: { ...base.sources, inputOf: async () => { throw new TypedDomainError("TEST_INPUT_UNREAD", "made-up: the input cannot be read"); } } };
    expect(await closeInvestigation(settings, closingOf())).toBe("RECORDED");
    expect(store.records.map((record) => [record.outcome, record.failureCode])).toEqual([["FAILED", "INVESTIGATION_REPORT_INPUT_UNREAD"]]);
    expect(runner.charged).toEqual([]);
  });
});

describe("Task 57o: a database failure on the run's own version maps nothing: the lane skips the run this pass and logs its own code (as 57l)", () => {
  it("'Write my report': UNMAPPED, no call, no row", async () => {
    const runner = freshRunner("hosted", new Map([[ROOT, DATABASE_DOWN]]));
    const store = memoryReports();
    const vendors = chargedClosingTeam(runner);
    const logged: Array<{ event: string; detail: Record<string, unknown> }> = [];
    const settings: InvestigationCloseSettings = { ...closingSettingsOver({ store, vendors, logged }), mapRun: runner.mapRun };
    expect(await closeInvestigation(settings, closingOf())).toBe("UNMAPPED");
    expect(logged.filter((entry) => entry.event === "INVESTIGATION_REPORT_UNMAPPED").map((entry) => entry.detail))
      .toEqual([{ investigationId: closingOf().investigationId, reportVersion: 1, runId: ROOT, code: "DATABASE_POOL_FAILED" }]);
    expect([...vendors.haiku.requests, ...vendors.glm.requests]).toEqual([]);
    expect(store.records).toEqual([]);
    expect(runner.charged).toEqual([]);
    expect(runner.versions.versionOf(ROOT)).toBeUndefined();
    expect(runner.journal).toEqual([]);
  });

  it("the path-rewrite sweep: skipped, PATH_REWRITE_SWEEP_UNMAPPED, nothing sent", async () => {
    const stopped = await stoppedRewrite();
    const runner = freshRunner("hosted", new Map([[DIG_A, DATABASE_DOWN]]));
    const again = rewriteTeam();
    expect(await sweepPathRewrites({ rewrite: stopped.settings, roles: rolesOf(again, runner.charging), now: NOW, list: async () => [open(DIG_A)],
      mapRun: runner.mapRun })).toEqual({ listed: 1, rewritten: 0, skipped: 1 });
    expect(stopped.logged.filter((entry) => entry.event === "PATH_REWRITE_SWEEP_UNMAPPED").map((entry) => entry.detail))
      .toEqual([{ runId: DIG_A, code: "DATABASE_POOL_FAILED" }]);
    expect(again.haiku.bodies).toHaveLength(0);
    expect(stopped.store.rewrites).toEqual([]);
    expect(runner.versions.versionOf(DIG_A)).toBeUndefined();
  });

  it("the tree sweep: skipped, TREE_SWEEP_UNMAPPED, nothing sent, the dig asked again later", async () => {
    const runner = freshRunner("hosted", new Map([[MORE_DIG, DATABASE_DOWN]]));
    const tree = treeOf(runner);
    const finished = new Set<string>();
    expect(await sweepTreeUpdates({ tree: tree.settings, list: async () => [MORE_DIG], now: () => new Date(AT), mapRun: runner.mapRun }, finished))
      .toEqual({ listed: 1, advanced: 0, skipped: 1 });
    expect(tree.logged).toContain("TREE_SWEEP_UNMAPPED");
    expect(tree.recorded).toEqual([]);
    expect(runner.charged).toEqual([]);
    expect(finished.has(MORE_DIG)).toBe(false);
  });

  it("the public tree's sweep: each dig skipped, PUBLIC_DIG_UNMAPPED, nothing of it read", async () => {
    const runner = freshRunner("hosted", new Map([[PUBLIC_DIG, DATABASE_DOWN], [CLIMBING_DIG, DATABASE_DOWN]]));
    const world = publicWorld(runner, [{ dig_run_id: PUBLIC_DIG, finished: true }], [CLIMBING_DIG]);
    await sweepPublicTree(world.settings);
    expect(world.logged).toEqual([
      { event: "PUBLIC_DIG_UNMAPPED", detail: { runId: PUBLIC_DIG, code: "DATABASE_POOL_FAILED" } },
      { event: "PUBLIC_DIG_UNMAPPED", detail: { runId: CLIMBING_DIG, code: "DATABASE_POOL_FAILED" } }]);
    expect(world.touched).toEqual([]);
    expect(runner.charged).toEqual([]);
  });

  it("'Add to researched': the run's pages skipped, WEB_RESEARCHED_UNMAPPED, nothing read, settled or wiped", async () => {
    const runner = freshRunner("hosted", new Map([[RESEARCHED_RUN, DATABASE_DOWN]]));
    const world = researchedWorld(runner);
    expect(await sweepWebResearched(world.settings)).toEqual({ listed: 1, settled: 0, skipped: 1 });
    expect(world.logged).toEqual([{ event: "WEB_RESEARCHED_UNMAPPED", detail: { runId: RESEARCHED_RUN, code: "DATABASE_POOL_FAILED" } }]);
    expect(world.touched).toEqual([]);
    expect(runner.charged).toEqual([]);
  });
});

describe("Task 57o-fix: the switched-on version refused by this runner: the release's own version, and the line says so", () => {
  it("'Write my report': written, every call charged on the root under the release's own version", async () => {
    const runner = freshRunner("hosted", new Map([[ROOT, UNLOADABLE]]), { switchedOnRefused: true });
    const store = memoryReports();
    const settings: InvestigationCloseSettings = { ...closingSettingsOver({ store, vendors: chargedClosingTeam(runner) }), mapRun: runner.mapRun };
    expect(await closeInvestigation(settings, closingOf())).toBe("RECORDED");
    expect(store.records.map((record) => record.outcome)).toEqual(["READY"]);
    expect(runner.charged.length).toBeGreaterThan(0);
    expect(runner.charged.every(([runId, version]) => runId === ROOT && version === SITE_VERSION)).toBe(true);
    expect(runner.journal).toEqual([{ ...todayLine(ROOT), usedVersion: String(SITE_VERSION), switchedOnCode: "RUNNER_SETTINGS_VERSION_UNLOADABLE" }]);
  });
});

describe("Task 57o-fix: the switched-on version could not be read (the database): nothing mapped, the lane tries again next pass", () => {
  it("'Write my report': UNMAPPED with the read's code, no call, no row, no line", async () => {
    const runner = freshRunner("hosted", new Map([[ROOT, UNLOADABLE]]), {
      switchedOn: async () => { throw new TypedDomainError("DATABASE_POOL_FAILED", "made-up: the database did not answer"); } });
    const store = memoryReports();
    const logged: Array<{ event: string; detail: Record<string, unknown> }> = [];
    const settings: InvestigationCloseSettings = { ...closingSettingsOver({ store, vendors: chargedClosingTeam(runner), logged }), mapRun: runner.mapRun };
    expect(await closeInvestigation(settings, closingOf())).toBe("UNMAPPED");
    expect(logged.filter((entry) => entry.event === "INVESTIGATION_REPORT_UNMAPPED").map((entry) => entry.detail.code)).toEqual(["DATABASE_POOL_FAILED"]);
    expect(store.records).toEqual([]);
    expect(runner.charged).toEqual([]);
    expect(runner.versions.versionOf(ROOT)).toBeUndefined();
    expect(runner.journal).toEqual([]);
  });
});

describe("Task 57o: the switched-on version and the site version both refused (the boot never allows the latter): rejects, nothing mapped", () => {
  it("'Write my report': UNMAPPED under the refusal's code, no line saying today's settings were used", async () => {
    const runner = freshRunner("hosted", new Map([[ROOT, UNLOADABLE]]), { siteRefused: true, switchedOnRefused: true });
    const store = memoryReports();
    const vendors = chargedClosingTeam(runner);
    const logged: Array<{ event: string; detail: Record<string, unknown> }> = [];
    const settings: InvestigationCloseSettings = { ...closingSettingsOver({ store, vendors, logged }), mapRun: runner.mapRun };
    expect(await closeInvestigation(settings, closingOf())).toBe("UNMAPPED");
    expect(logged.filter((entry) => entry.event === "INVESTIGATION_REPORT_UNMAPPED").map((entry) => entry.detail.code)).toEqual(["RUNNER_SETTINGS_VERSION_UNLOADABLE"]);
    expect(store.records).toEqual([]);
    expect(runner.charged).toEqual([]);
    expect(runner.versions.versionOf(ROOT)).toBeUndefined();
    expect(runner.journal).toEqual([]);
  });
});

describe("Task 57l: main.ts hands every background lane the one mapper, hosted and on the preview only", () => {
  const main = readFileSync(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8").replace(/\s+/gu, " ");
  it("local mode (no money seams, no preview gate) maps nothing: every lane as before", () => {
    // Task 57o-fix: the version the run owns now; if refused, the owners' switched-on version; if that is refused, the release's own.
    expect(main).toContain("const runVersionMap = runnerSite.money === null && previewGate === undefined ? undefined : runVersionMapper({ "
      + "readVersion: (runId) => readRunSettingsVersionNow(pool, runId), requireSettings: (version) => runnerSettings.requireSettings(version), versions: runSettingsVersions, "
      + "switchedOnVersion: createSwitchedOnSettingsReader({ pool, siteVersion: environment.REGISTER_VERSION }), "
      + "siteVersion: environment.REGISTER_VERSION, log: (line) => { console.warn(JSON.stringify(line)); } });");
    expect(main).toContain("const mapRunOf = runVersionMap === undefined ? {} : { mapRun: runVersionMap };");
  });
  it("the closing (its sweep and the poke), the four sweeps and a public report's carrier", () => {
    expect(main).toContain("const investigationClose = investigationCloseComposed === undefined ? undefined : Object.freeze({ ...investigationCloseComposed, ...mapRunOf });");
    expect(main).toContain("...(investigationClose === undefined ? {} : { investigationClose }),");
    expect(main).toContain("startInvestigationCloseSweep({ ...investigationClose, paused:");
    for (const lane of ["startPathRewriteSweep({ ...pathRewrite.sweep, ...mapRunOf,", "startTreeSweep({ ...pathRewrite.treeSweep, ...mapRunOf,",
      "startPublicTreeSweep({ ...pathRewrite.publicTree, reports: publicReports, ...mapRunOf,", "startWebResearchedSweep({ ...webResearched, ...mapRunOf,"]) {
      expect(main).toContain(lane);
    }
    expect(main).toContain("...(runVersionMap === undefined ? {} : { mapCarrier: runVersionMap }) });");
  });
});

/**
 * Task 57p (the owner's answer of 8 Nov, "On each piece's record"): each lane's record carries the version of the run its calls were charged
 * to, read from the same run → version map the calls were charged under: the run's own (STAMPED), or today's when its own is refused
 * (Task 57o-fix: the owners' switched-on version, SWITCHED_ON), so a piece "not its own" shows against the run's stamp.
 */
describe.each<Readonly<{ own: number; noted: number }>>([{ own: STAMPED, noted: STAMPED }, { own: UNLOADABLE, noted: SWITCHED_ON }])(
  "Task 57p: each piece's record says which settings wrote it (own version %o)", ({ own, noted }) => {
    it("'Write my report': the report notes the root's version, the one its calls were charged under", async () => {
      const runner = freshRunner("hosted", new Map([[ROOT, own]]));
      const store = memoryReports();
      const settings: InvestigationCloseSettings = { ...closingSettingsOver({ store, vendors: chargedClosingTeam(runner) }), mapRun: runner.mapRun,
        settingsVersionOf: (runId) => runner.versions.versionOf(runId) };
      expect(await closeInvestigation(settings, closingOf())).toBe("RECORDED");
      expect(runner.charged.every(([, version]) => version === noted)).toBe(true);
      expect(store.records).toHaveLength(1);
      expect(store.records[0]).toMatchObject({ outcome: "READY", settingsVersion: noted });
    });

    it("the path-rewrite sweep: the dig's rewrite notes the dig's version", async () => {
      const stopped = await stoppedRewrite();
      const runner = freshRunner("preview", new Map([[DIG_A, own]]));
      await sweepPathRewrites({ rewrite: { ...stopped.settings, settingsVersionOf: (runId) => runner.versions.versionOf(runId) },
        roles: rolesOf(rewriteTeam(), runner.charging), now: NOW, list: async () => [open(DIG_A)], mapRun: runner.mapRun });
      expect(runner.charged.every(([runId, version]) => runId === DIG_A && version === noted)).toBe(true);
      expect(stopped.store.rewrites).toHaveLength(1);
      expect(stopped.store.rewrites[0]).toMatchObject({ digRunId: DIG_A, outcome: "READY", settingsVersion: noted });
    });

    it("the path-rewrite sweep, a dig given up (its material unreadable, no call): it is mapped all the same and its FAILED row notes the version", async () => {
      const store = memoryStore();
      const runner = freshRunner("hosted", new Map([[DIG_A, own]]));
      const base = rewriteSettingsOver({ store, digs: new Map([[DIG_A, dig()]]) });
      const settings: PathRewriteRunnerSettings = { ...base, sources: { ...base.sources, digOf: async () => { throw new Error("made-up: store blip"); } },
        settingsVersionOf: (runId) => runner.versions.versionOf(runId) };
      await sweepPathRewrites({ rewrite: settings, roles: rolesOf(rewriteTeam(), runner.charging), now: () => new Date("2026-10-31T03:00:00.000Z"),
        giveUpMs: 2 * 60 * 60_000, list: async () => [open(DIG_A)], mapRun: runner.mapRun });
      expect(runner.charged).toEqual([]);
      expect(store.rewrites).toHaveLength(1);
      expect(store.rewrites[0]).toMatchObject({ digRunId: DIG_A, outcome: "FAILED", failureCode: "PATH_REWRITE_INPUT_UNREAD", settingsVersion: noted });
    });

    it("the tree sweep: the main-answer version notes the dig's version (its calls were charged on the dig, not the root)", async () => {
      const runner = freshRunner("preview", new Map([[MORE_DIG, own], [ROOT, LOADS_TOO]]));
      const tree = treeOf(runner);
      await sweepTreeUpdates({ tree: { ...tree.settings, settingsVersionOf: (runId) => runner.versions.versionOf(runId) }, list: async () => [MORE_DIG],
        now: () => new Date(AT), mapRun: runner.mapRun });
      expect(tree.recorded).toHaveLength(1);
      expect(tree.recorded[0]).toMatchObject({ triggerRunId: MORE_DIG, outcome: "READY", settingsVersion: noted });
    });
  });

describe("Task 57p: a runner that holds no version for the run (local mode: no map) notes none, as before 0169", () => {
  it("'Write my report' without a version reader: the report notes NULL", async () => {
    const store = memoryReports();
    const runner = freshRunner("hosted", new Map([[ROOT, STAMPED]]));
    expect(await closeInvestigation(closingSettingsOver({ store, vendors: chargedClosingTeam(runner) }), closingOf())).toBe("RECORDED");
    expect(store.records[0]).toMatchObject({ settingsVersion: null });
  });
});

/* ----------------------------------------------------------------- the worlds */

const NOW = () => new Date("2026-10-31T01:00:00.000Z");
const open = (runId: string): UnwrittenPathRewrite => Object.freeze({ runId, parentRunId: PARENT_RUN, positionRef: POSITION, pathSeq: 1, since: "2026-10-31T00:00:00.000Z" });
const rolesOf = (vendors: ReturnType<typeof rewriteTeam>, wrap: (gateway: ProviderGateway) => ProviderGateway) => {
  const members = membersOf(vendors, wrap);
  return { resolveProvider: members.resolve, backupCandidates: members.backups };
};

/** A dig whose runner stopped once its writer had answered: its material stored (0135), no row (the path-rewrite sweep's own test's way). */
async function stoppedRewrite() {
  const store = memoryStore();
  const logged: Logged = [];
  const stored = new Map<string, PathRewriteStoredInput>();
  const base = rewriteSettingsOver({ store, logged, digs: new Map([[DIG_A, dig()]]) });
  const settings: PathRewriteRunnerSettings = Object.freeze({ ...base, sources: Object.freeze({ ...base.sources,
    recordInput: async (runId: string, workItemId: string, digPaths: PathRewriteStoredInput["digPaths"]) => {
      if (stored.has(runId)) return "ALREADY" as const;
      stored.set(runId, JSON.parse(JSON.stringify({ workItemId, digPaths })) as PathRewriteStoredInput);
      return "RECORDED" as const;
    },
    storedInputOf: async (runId: string) => stored.get(runId) ?? null }) });
  const first = rewriteTeam();
  let writerAnswered = false;
  const marking = (gateway: ProviderGateway): ProviderGateway => ({ call: async (request) => {
    const result = await gateway.call(request);
    if (request.callSiteKey.startsWith("PATH_REWRITE:WRITER:")) writerAnswered = true;
    return result;
  } });
  void runDigPathRewrite(settings, digSnapshot(DIG_A, membersOf(first, marking), {
    stepLease: <T>(use: () => Promise<T>) => (writerAnswered ? new Promise<T>(() => undefined) : use())
  }));
  await until(() => writerAnswered);
  for (let at = 0; at < 20; at += 1) await new Promise<void>((resolve) => setImmediate(resolve));
  expect(store.rewrites).toHaveLength(0);
  expect(stored.has(DIG_A)).toBe(true);
  logged.length = 0;
  return { store, settings, logged };
}

/** A '+ N more' dig under the main question owed its main-answer version (the tree sweep's PATH_ADDED), on the closing world's vendors. */
function treeOf(runner: ReturnType<typeof freshRunner>) {
  const recorded: MainAnswerUpdateRecord[] = [];
  const logged: string[] = [];
  const vendors = chargedClosingTeam(runner);
  const readOf = (record: MainAnswerUpdateRecord, at: number): MainAnswerUpdateRead => ({ update_id: record.updateId, answer_seq: at + 1,
    based_on_update_id: record.basedOnUpdateId, trigger_kind: record.triggerKind, trigger_id: record.triggerId, trigger_run_id: record.triggerRunId,
    paid_by_owner_ref: record.paidByOwnerRef, outcome: record.outcome, failure_code: record.failureCode, recorded_at: AT,
    content: record.content?.envelope ?? null });
  const refused = (what: string) => async (): Promise<never> => { throw new Error(`test: ${what} is not read here`); };
  const ports: TreeUpdatePorts = {
    tree: {
      takeTurn: refused("takeTurn"), readTurn: refused("readTurn"), record: refused("record"), readLine: async () => [],
      readClimbNext: async () => null,
      recordMainAnswer: async (record: MainAnswerUpdateRecord) => {
        recorded.push(record);
        return Object.freeze({ outcome: "RECORDED" as const, answerSeq: recorded.length });
      },
      readMainAnswers: async () => recorded.map(readOf),
      markDigSettled: async () => undefined
    },
    digOf: async () => null,
    ownRewriteOf: async () => null,
    parentPathOf: refused("parentPathOf"),
    childOf: refused("childOf"),
    sealUpdate: refused("sealUpdate"),
    sealMainAnswer: async (_rootRunId: string, updateId: string, _content: MainAnswerContent): Promise<WebSealed> =>
      Object.freeze({ envelope: { sealed: updateId } as never, attestation: Buffer.from("made-up") }),
    openMainAnswer: async () => ["The answer before."],
    answerInputOf: async (_rootRunId, earlier) => Object.freeze({ input: investigationInput({ earlier }), free: false, questionLine: investigationInput().question.line }),
    payerOf: async () => "owner-ref",
    answerSpentMicros: async () => 0,
    addedPathOf: async (runId: string) => runId === MORE_DIG ? Object.freeze({ rootRunId: ROOT, positionRef: "more-kp07", free: false }) : null
  };
  const settings: TreeUpdateSettings = {
    ports, writerRoleRef: "ref-haiku", checkerRoleRef: "ref-glm",
    roles: Object.freeze({
      resolveProvider: (roleRef: string) => roleRef === "ref-haiku" ? { provider: vendors.haiku.provider, providerRef: "ref-haiku" }
        : roleRef === "ref-glm" ? { provider: vendors.glm.provider, providerRef: "ref-glm" } : null,
      backupCandidates: [], backupMakers: []
    }),
    log: (event) => { logged.push(event); }
  };
  return { settings, recorded, logged };
}

/**
 * The public tree's sweep over a made-up pool: the two lists, then each dig's first read of its own work (its contribution), where its calls
 * would follow. The fresh runner charges that dig there, as its first call would be charged; no contribution is found, so it ends.
 */
function publicWorld(runner: ReturnType<typeof freshRunner>, digs: readonly PublicDigUnsettled[], climbs: readonly string[]) {
  const logged: Array<{ event: string; detail: Record<string, unknown> }> = [];
  const touched: string[] = [];
  const pool = {
    query: async (sql: string, params: readonly unknown[]) => {
      if (sql.includes("read_public_digs_unsettled")) return { rows: [{ waiting: digs }] };
      if (sql.includes("read_public_climbs_owed")) return { rows: [{ owed: climbs }] };
      if (sql.includes("read_public_contribution_of_run")) {
        const runId = params[0] as string;
        touched.push(runId);
        runner.charge(runId);
        return { rows: [{ contribution: null }] };
      }
      throw new Error(`test: ${sql} is not read here`);
    }
  };
  const settings = { pool: pool as never, roles: { resolveProvider: () => null, backupCandidates: [], backupMakers: [] } as never,
    writerRoleRef: "ref-haiku", checkerRoleRef: "ref-glm", now: () => new Date(AT), mapRun: runner.mapRun,
    log: (event: string, detail: Record<string, unknown>) => { logged.push({ event, detail }); } };
  return { settings, logged, touched };
}

/**
 * "Add to researched" over a made-up pool: one page waiting on one run, whose reading starts by taking the run's content lease (a connection),
 * where its calls would follow. The fresh runner charges the run there, then the made-up pool stops the reading.
 */
function researchedWorld(runner: ReturnType<typeof freshRunner>) {
  const logged: Array<{ event: string; detail: Readonly<Record<string, unknown>> }> = [];
  const touched: string[] = [];
  const pool = {
    query: async (sql: string) => {
      if (sql.includes("read_unsettled_web_researched")) {
        return { rows: [{ waiting: [{ run_id: RESEARCHED_RUN, page_id: "page-1", path_ref: "b1", chosen_at: AT }] }] };
      }
      touched.push(sql);
      return { rows: [] };
    },
    connect: async () => {
      touched.push("connect");
      runner.charge(RESEARCHED_RUN);
      throw new TypedDomainError("TEST_STOPPED_HERE", "made-up: the reading stops here");
    }
  };
  const settings = { pool: pool as never, members: [], search: null, searchSeamOf: null, now: () => new Date(AT), mapRun: runner.mapRun,
    log: (event: string, detail: Readonly<Record<string, unknown>>) => { logged.push({ event, detail }); } };
  return { settings, logged, touched };
}
