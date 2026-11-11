// tests/unit/runner-today-settings.test.ts
// V4 start step, Task 57o-fix (the owner's answers of 8 Nov: "Use today's settings", then "Your switched-on one (Recommended)": "The report uses
// 25, exactly as Continue and new debates do. Needs one small permission: the runner may read which settings are switched on (a number,
// nothing private) ... (0169)"). A background piece of an older debate is written with: the debate's own version NOW (after a Continue moved
// it, the one it was moved to); if this runner refuses that, the owners' switched-on version (0124's pointer, which 0169 lets the runner's
// role read; an empty pointer is this release's own); if this runner refuses that too, the release's own (its boot version). The runner reads
// the pointer at most once a second, with a query timeout; a failed read waits for the lane's next pass. A lane's fallback mapping gives way to
// a later claim's version (one line), so it never stops a debate; Task 57o-fix2: so does a lane's own-version mapping (a claim wins over any
// lane's mapping; two claims that disagree refuse). Made-up ids and versions only.
import { readFileSync } from "node:fs";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  RUNNER_SWITCHED_ON_SETTINGS, createRunSettingsVersions, createSwitchedOnSettingsReader, readRunSettingsVersionNow, runVersionMapper
} from "../../apps/runner/src/run-settings.js";

/** Made up: the release's own (boot) version, the version the owners switched on, a later switch, a debate's own refused version. */
const SITE = 3;
const SWITCHED_ON = 25;
const SWITCHED_LATER = 26;
const OWN_REFUSED = 9;
const OWN_LOADS = 7;
const RUN = "11111111-1111-4111-8111-111111111111";

const refusal = (version: number) => new TypedDomainError("RUNNER_SETTINGS_VERSION_UNLOADABLE", `made-up: this runner cannot run ${String(version)}`);

/** A fake pool whose answers are queued; each config goes through pg's own Query first, as pg-pool hands it on. */
function fakePool(...answers: ReadonlyArray<unknown>) {
  const queue = [...answers];
  const sent: Array<Readonly<{ text: string; values: unknown; timeout: unknown }>> = [];
  const query = vi.fn(async (config: string | Readonly<{ text: string; values?: unknown; query_timeout?: number }>, values?: unknown) => {
    new pg.Query(config as never, undefined, () => undefined);
    sent.push(typeof config === "string" ? { text: config, values, timeout: undefined }
      : { text: config.text, values: config.values ?? values, timeout: config.query_timeout });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return { rows: next === undefined ? [] : [next] };
  });
  return { pool: { query } as never, sent };
}

/** The mapper over made-up ports: `loads` are the versions this runner can run; `switchedOn` answers the pointer (or throws). */
function mapperOf(input: Readonly<{ own: number; loads: readonly number[]; switchedOn: () => Promise<number>; requireFails?: (version: number) => unknown }>) {
  const versions = createRunSettingsVersions();
  const asked: number[] = [];
  const lines: Array<Readonly<Record<string, unknown>>> = [];
  const map = runVersionMapper({
    readVersion: async () => input.own,
    requireSettings: async (version) => {
      asked.push(version);
      const failure = input.requireFails?.(version);
      if (failure !== undefined) throw failure;
      if (!input.loads.includes(version)) throw refusal(version);
    },
    versions, switchedOnVersion: input.switchedOn, siteVersion: SITE, log: (line) => { lines.push(line); }
  });
  return { map, versions, asked, lines };
}

describe("Task 57o-fix: a refused own version uses the owners' switched-on version; if refused, the release's own", () => {
  it("own version refused, switched-on loads: mapped to the switched-on version, one line naming the run, both versions and the code", async () => {
    const world = mapperOf({ own: OWN_REFUSED, loads: [SITE, SWITCHED_ON], switchedOn: async () => SWITCHED_ON });
    await world.map(RUN);
    expect(world.versions.versionOf(RUN)).toBe(SWITCHED_ON);
    expect(world.asked).toEqual([OWN_REFUSED, SWITCHED_ON]);
    expect(world.lines).toEqual([{ kind: "DEBATEAI_RUNNER_RUN_SETTINGS_TODAY", runId: RUN, ownVersion: String(OWN_REFUSED),
      usedVersion: String(SWITCHED_ON), switchedOnVersion: String(SWITCHED_ON), code: "RUNNER_SETTINGS_VERSION_UNLOADABLE" }]);
  });

  it("an empty pointer is the release's own version: mapped to it, one line", async () => {
    const world = mapperOf({ own: OWN_REFUSED, loads: [SITE], switchedOn: async () => SITE });
    await world.map(RUN);
    expect(world.versions.versionOf(RUN)).toBe(SITE);
    expect(world.lines.map((line) => [line.usedVersion, line.switchedOnVersion])).toEqual([[String(SITE), String(SITE)]]);
  });

  it("the switched-on version refused too: the release's own, and the line says the switched-on one was refused", async () => {
    const world = mapperOf({ own: OWN_REFUSED, loads: [SITE], switchedOn: async () => SWITCHED_ON });
    await world.map(RUN);
    expect(world.versions.versionOf(RUN)).toBe(SITE);
    expect(world.asked).toEqual([OWN_REFUSED, SWITCHED_ON, SITE]);
    expect(world.lines).toEqual([{ kind: "DEBATEAI_RUNNER_RUN_SETTINGS_TODAY", runId: RUN, ownVersion: String(OWN_REFUSED),
      usedVersion: String(SITE), switchedOnVersion: String(SWITCHED_ON), code: "RUNNER_SETTINGS_VERSION_UNLOADABLE",
      switchedOnCode: "RUNNER_SETTINGS_VERSION_UNLOADABLE" }]);
  });

  it("a loadable own version keeps it and never reads the pointer", async () => {
    const switchedOn = vi.fn(async () => SWITCHED_ON);
    const world = mapperOf({ own: OWN_LOADS, loads: [SITE, OWN_LOADS, SWITCHED_ON], switchedOn });
    await world.map(RUN);
    expect(world.versions.versionOf(RUN)).toBe(OWN_LOADS);
    expect(switchedOn).not.toHaveBeenCalled();
    expect(world.lines).toEqual([]);
  });

  it("the pointer's read fails (the database): nothing mapped, rejects, no line; the lane tries again next pass", async () => {
    const down = new TypedDomainError("DATABASE_POOL_FAILED", "made-up: the database did not answer");
    const world = mapperOf({ own: OWN_REFUSED, loads: [SITE, SWITCHED_ON], switchedOn: async () => { throw down; } });
    await expect(world.map(RUN)).rejects.toBe(down);
    expect(world.versions.versionOf(RUN)).toBeUndefined();
    expect(world.lines).toEqual([]);
  });

  it("the switched-on version's load fails on the database: rejects, nothing mapped (never the release's own on a hiccup)", async () => {
    const down = new TypedDomainError("DATABASE_POOL_FAILED", "made-up: the database did not answer");
    const world = mapperOf({ own: OWN_REFUSED, loads: [SITE], switchedOn: async () => SWITCHED_ON,
      requireFails: (version) => version === SWITCHED_ON ? down : undefined });
    await expect(world.map(RUN)).rejects.toBe(down);
    expect(world.asked).toEqual([OWN_REFUSED, SWITCHED_ON]);
    expect(world.versions.versionOf(RUN)).toBeUndefined();
  });

  it("review finding 3: an untyped error on the own version (a driver's prose, e.g. a statement timeout) rejects, no fallback, no pointer read", async () => {
    const timeout = new Error("canceling statement due to statement timeout");
    const switchedOn = vi.fn(async () => SWITCHED_ON);
    const world = mapperOf({ own: OWN_REFUSED, loads: [SITE, SWITCHED_ON], switchedOn, requireFails: (version) => version === OWN_REFUSED ? timeout : undefined });
    await expect(world.map(RUN)).rejects.toBe(timeout);
    expect(switchedOn).not.toHaveBeenCalled();
    expect(world.versions.versionOf(RUN)).toBeUndefined();
    expect(world.lines).toEqual([]);
  });

  it("the release's own version refused as well (the boot never allows it): rejects with its refusal, nothing mapped, no line", async () => {
    const world = mapperOf({ own: OWN_REFUSED, loads: [], switchedOn: async () => SWITCHED_ON });
    await expect(world.map(RUN)).rejects.toMatchObject({ code: "RUNNER_SETTINGS_VERSION_UNLOADABLE", message: expect.stringContaining(String(SITE)) });
    expect(world.versions.versionOf(RUN)).toBeUndefined();
    expect(world.lines).toEqual([]);
  });

  it("own version = the switched-on one, refused: the release's own, asked once each", async () => {
    const world = mapperOf({ own: SWITCHED_ON, loads: [SITE], switchedOn: async () => SWITCHED_ON });
    await world.map(RUN);
    expect(world.versions.versionOf(RUN)).toBe(SITE);
    expect(world.asked).toEqual([SWITCHED_ON, SITE]);
    expect(world.lines.map((line) => line.switchedOnCode)).toEqual(["RUNNER_SETTINGS_VERSION_UNLOADABLE"]);
  });
});

describe("Task 57o-fix2 (review finding 1): a claim's version wins over any lane's mapping; two claims that disagree refuse", () => {
  /** Made up: debate D's own version, which loads; the version a Continue moved D to. */
  const OWN_22 = 22;
  const MOVED_26 = 26;

  it("'Add to researched' maps D to its own 22 (it loads); Continue moves D to 26: the claim maps D to 26, one line, and the debate runs", async () => {
    const lines: Array<Readonly<Record<string, unknown>>> = [];
    const versions = createRunSettingsVersions({ log: (line) => { lines.push(line); } });
    let own = OWN_22;
    const readVersion = vi.fn(async () => own);
    const map = runVersionMapper({ readVersion, versions, siteVersion: SITE, switchedOnVersion: async () => SWITCHED_ON,
      requireSettings: async () => undefined, log: () => undefined });
    await map(RUN);
    expect(versions.versionOf(RUN)).toBe(OWN_22);
    own = MOVED_26;
    expect(() => versions.set(RUN, MOVED_26)).not.toThrow();
    expect(versions.versionOf(RUN)).toBe(MOVED_26);
    expect(lines).toEqual([{ kind: "DEBATEAI_RUNNER_RUN_SETTINGS_CLAIMED", runId: RUN, laneVersion: String(OWN_22), version: String(MOVED_26) }]);
    // A lane that later maps D finds it mapped and leaves it: nothing read, nothing changed.
    await map(RUN);
    expect(readVersion).toHaveBeenCalledTimes(1);
    expect(versions.versionOf(RUN)).toBe(MOVED_26);
  });

  it("the owners switch 25 → 26 between a lane's fallback mapping of dig D (25) and D's Continue (26): the claim maps D to 26, one line", () => {
    const lines: Array<Readonly<Record<string, unknown>>> = [];
    const versions = createRunSettingsVersions({ log: (line) => { lines.push(line); } });
    versions.setByLane(RUN, SWITCHED_ON);
    expect(() => versions.set(RUN, SWITCHED_LATER)).not.toThrow();
    expect(versions.versionOf(RUN)).toBe(SWITCHED_LATER);
    expect(lines).toEqual([{ kind: "DEBATEAI_RUNNER_RUN_SETTINGS_CLAIMED", runId: RUN, laneVersion: String(SWITCHED_ON), version: String(SWITCHED_LATER) }]);
    // From then on it is a claim's mapping: another claim that disagrees refuses.
    expect(() => versions.set(RUN, SWITCHED_ON)).toThrow("RUN_SETTINGS_VERSION_DRIFT:26:25");
  });

  it("the claim's version equal to the lane's: no line; then it is the claim's, and a claim that disagrees refuses", () => {
    const lines: Array<Readonly<Record<string, unknown>>> = [];
    const versions = createRunSettingsVersions({ log: (line) => { lines.push(line); } });
    versions.setByLane(RUN, SWITCHED_ON);
    versions.set(RUN, SWITCHED_ON);
    expect(lines).toEqual([]);
    expect(() => versions.set(RUN, SWITCHED_LATER)).toThrow("RUN_SETTINGS_VERSION_DRIFT:25:26");
  });

  it("two claims that disagree refuse drift (the same value again is fine); a lane never replaces any mapping", () => {
    const lines: Array<Readonly<Record<string, unknown>>> = [];
    const versions = createRunSettingsVersions({ log: (line) => { lines.push(line); } });
    versions.set(RUN, OWN_LOADS);
    versions.set(RUN, OWN_LOADS);
    expect(() => versions.set(RUN, SWITCHED_ON)).toThrow("RUN_SETTINGS_VERSION_DRIFT:7:25");
    versions.setByLane(RUN, SWITCHED_ON);
    expect(versions.versionOf(RUN)).toBe(OWN_LOADS);
    const other = "22222222-2222-4222-8222-222222222222";
    versions.setByLane(other, SWITCHED_ON);
    versions.setByLane(other, SITE);
    expect(versions.versionOf(other)).toBe(SWITCHED_ON);
    expect(lines).toEqual([]);
  });

  it("the mapper's fallback is a lane's mapping: a later claim at another version replaces it", async () => {
    const lines: Array<Readonly<Record<string, unknown>>> = [];
    const versions = createRunSettingsVersions({ log: (line) => { lines.push(line); } });
    const map = runVersionMapper({ readVersion: async () => OWN_REFUSED, versions, siteVersion: SITE, switchedOnVersion: async () => SWITCHED_ON,
      requireSettings: async (version) => { if (version === OWN_REFUSED) throw refusal(version); }, log: () => undefined });
    await map(RUN);
    expect(versions.versionOf(RUN)).toBe(SWITCHED_ON);
    versions.set(RUN, SWITCHED_LATER);
    expect(versions.versionOf(RUN)).toBe(SWITCHED_LATER);
    expect(lines.map((line) => line.kind)).toEqual(["DEBATEAI_RUNNER_RUN_SETTINGS_CLAIMED"]);
  });
});

describe("Task 57o-fix: the runner's reader of the switched-on version (0124's pointer; 0169 grants the runner's role)", () => {
  const SQL = "SELECT register.read_active_settings_version() AS version";
  it("an empty pointer is the release's own version; a number (or bigint text) is that version; sent with a query timeout", async () => {
    let now = 1000;
    const { pool, sent } = fakePool({ version: null }, { version: "25" }, { version: 26 });
    const switchedOn = createSwitchedOnSettingsReader({ pool, siteVersion: SITE, clock: () => now });
    expect(await switchedOn()).toBe(SITE);
    now += RUNNER_SWITCHED_ON_SETTINGS.maxAgeMs;
    expect(await switchedOn()).toBe(25);
    now += RUNNER_SWITCHED_ON_SETTINGS.maxAgeMs;
    expect(await switchedOn()).toBe(26);
    expect(sent).toEqual([0, 1, 2].map(() => ({ text: SQL, values: undefined, timeout: RUNNER_SWITCHED_ON_SETTINGS.queryTimeoutMs })));
    expect(RUNNER_SWITCHED_ON_SETTINGS).toEqual({ maxAgeMs: 1000, queryTimeoutMs: 5000 });
  });

  it("at most once a second: a fresh value is served without a read; concurrent callers share one read", async () => {
    let now = 1000;
    const { pool, sent } = fakePool({ version: "25" }, { version: "26" });
    const switchedOn = createSwitchedOnSettingsReader({ pool, siteVersion: SITE, clock: () => now });
    expect(await Promise.all([switchedOn(), switchedOn(), switchedOn()])).toEqual([25, 25, 25]);
    now += RUNNER_SWITCHED_ON_SETTINGS.maxAgeMs - 1;
    expect(await switchedOn()).toBe(25);
    expect(sent).toHaveLength(1);
    now += 1;
    expect(await switchedOn()).toBe(26);
    expect(sent).toHaveLength(2);
    // A clock that goes backwards makes the value stale (read again), never fresh.
    now -= 5000;
    await expect(switchedOn()).resolves.toBe(SITE);
    expect(sent).toHaveLength(3);
  });

  it("a failed read rejects (never a guessed version) and is not asked again within the second; then read again", async () => {
    let now = 1000;
    const down = new TypedDomainError("DATABASE_POOL_FAILED", "made-up: the database did not answer");
    const { pool, sent } = fakePool(down, { version: "25" });
    const switchedOn = createSwitchedOnSettingsReader({ pool, siteVersion: SITE, clock: () => now });
    await expect(switchedOn()).rejects.toBe(down);
    now += 10;
    await expect(switchedOn()).rejects.toBe(down);
    expect(sent).toHaveLength(1);
    now += RUNNER_SWITCHED_ON_SETTINGS.maxAgeMs;
    expect(await switchedOn()).toBe(25);
    expect(sent).toHaveLength(2);
  });

  it("an answer that is no version refuses RUNNER_SWITCHED_ON_SETTINGS_INVALID; the release's own version must be a version", async () => {
    for (const bad of ["0", "-3", "x", 1.5]) {
      const { pool } = fakePool({ version: bad });
      await expect(createSwitchedOnSettingsReader({ pool, siteVersion: SITE })()).rejects.toMatchObject({ code: "RUNNER_SWITCHED_ON_SETTINGS_INVALID" });
    }
    expect(() => createSwitchedOnSettingsReader({ pool: fakePool().pool, siteVersion: 0 })).toThrow("RUNNER_SWITCHED_ON_SETTINGS_INVALID");
  });

  it("the SQL text is written once in run-settings.ts, and main.ts never spells it", () => {
    const source = readFileSync(new URL("../../apps/runner/src/run-settings.ts", import.meta.url), "utf8");
    expect(source.split(`"${SQL}"`)).toHaveLength(2);
    expect(readFileSync(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8")).not.toContain("read_active_settings_version");
  });
});

describe("Task 57o-fix, review finding 1: the mapper reads the version the debate owns NOW (identity.run_settings_version_now, 0143)", () => {
  it("one read of the version now, by run id; no such run refuses RUN_NOT_FOUND", async () => {
    const { pool, sent } = fakePool({ register_version: 23 }, { register_version: null });
    expect(await readRunSettingsVersionNow(pool, RUN)).toBe(23);
    await expect(readRunSettingsVersionNow(pool, RUN)).rejects.toMatchObject({ code: "RUN_NOT_FOUND" });
    expect(sent.map((query) => [query.text, query.values])).toEqual([0, 1].map(() =>
      ["SELECT identity.run_settings_version_now($1::uuid)::integer AS register_version", [RUN]]));
  });

  it("main.ts maps with it, the switched-on reader and the release's own version (hosted and on the preview only)", () => {
    const main = readFileSync(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8").replace(/\s+/gu, " ");
    // The map prints its one line itself (a claim replacing a lane's fallback), as main.ts and the practice composition build it alike.
    expect(main).toContain("const runSettingsVersions = createRunSettingsVersions();");
    const settings = readFileSync(new URL("../../apps/runner/src/run-settings.ts", import.meta.url), "utf8");
    expect(settings).toContain("const log = input.log ?? ((line: Readonly<Record<string, unknown>>) => { console.warn(JSON.stringify(line)); });");
    expect(main).toContain("const runVersionMap = runnerSite.money === null && previewGate === undefined ? undefined : runVersionMapper({ "
      + "readVersion: (runId) => readRunSettingsVersionNow(pool, runId), requireSettings: (version) => runnerSettings.requireSettings(version), versions: runSettingsVersions, "
      + "switchedOnVersion: createSwitchedOnSettingsReader({ pool, siteVersion: environment.REGISTER_VERSION }), "
      + "siteVersion: environment.REGISTER_VERSION, log: (line) => { console.warn(JSON.stringify(line)); } });");
    expect(main).not.toContain("readVersion: (runId) => runRepository.readRunRegisterVersion(runId)");
  });
});
