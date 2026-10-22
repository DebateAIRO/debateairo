/**
 * Side-by-side spec §13 (settings changes without an upload), Task S6: each debate runs on its own settings version
 * inside one runner (O1), with no database:
 *
 *  1. `mergeRunnerSettings` replaces exactly the debate members and keeps every process member;
 *  2. `assertRunnerSettingsGates` keeps today's claim-time refusals (codes, classes, the J24 message naming the version);
 *  3. `createRunSettingsVersions`: a run's version is never re-pointed (RUN_SETTINGS_VERSION_DRIFT);
 *  4. `runCostEnvelopeGuardOf`: a call is charged to its own run's version's guard (RUN_SETTINGS_VERSION_UNKNOWN);
 *  5. a source scan of `execute()`: no `this.settings.` read after the debate's `settings` binding;
 *  6. the version reads select `register_version` by id;
 *  and, through `executeWorkItem` over a scripted pool: the version is resolved before the claim, the gates run against
 *  the debate's settings, the run → version map is set, the lane opens with the version's limits, an UNSUPPORTED
 *  version never runs (the S7 hook), and an untyped resolver failure leaves the item unclaimed (ruling R37).
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import ts from "typescript-classic";
import { TypedDomainError } from "@debateai/kernel";
import { CostEnvelopeGuard } from "@debateai/budget";
import { effectiveCallConcurrency } from "@debateai/register";
import {
  assertRunnerSettingsGates,
  mergeRunnerSettings,
  WalkingSkeletonRunner,
  type RunnerGatedSettings,
  type WalkingSkeletonSettings
} from "../../apps/runner/src/index.js";
import {
  createRunSettingsVersions,
  runCostEnvelopeGuardOf,
  runnerSettingsOfVersion,
  type RunnerSettingsResolution,
  type RunnerVersionSettings
} from "../../apps/runner/src/run-settings.js";
import { createCallScheduler, type CallScheduler } from "../../apps/runner/src/call-scheduler.js";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

const bound = (deadlineMs = 1000) => Object.freeze({ maxAttempts: 1, tokenCeiling: 256, deadlineMs });
const PRIMARY = "provider:primary";
const SECONDARY = "provider:secondary";
const VERSION = 18;
const RELEASE_KEY = "r17-" + "0123456789ab";

/** Every gated family present and passing (tests/integration/database.test.ts's runnerSettings, as pure inputs). */
function gated(change: Partial<Record<keyof RunnerGatedSettings, unknown>> = {}): RunnerGatedSettings {
  return Object.freeze({
    claimMs: 10000,
    claimMarginMs: 1000,
    judgeBound: bound(),
    composerBound: bound(),
    conformanceBound: bound(),
    compositionRow: { sentinel: "compositionRow" },
    servePolicy: { sentinel: "servePolicy" },
    judgementPolicy: { sentinel: "judgementPolicy" },
    scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" },
    panelPolicy: { sentinel: "panelPolicy" },
    stoppingPolicy: { sentinel: "stoppingPolicy" },
    verdictLabelPolicy: { sentinel: "verdictLabelPolicy" },
    synthesisRolePolicy: {
      registerVersion: VERSION, synthesizerRoleRef: PRIMARY, evaluatorRoleRef: PRIMARY,
      synthesizerBound: bound(), evaluatorBound: bound()
    },
    ...change
  }) as unknown as RunnerGatedSettings;
}

const codeOf = (action: () => unknown): string => {
  try {
    action();
  } catch (error) {
    if (error instanceof TypedDomainError) return error.code;
    if (error instanceof Error) return `${error.constructor.name}:${error.message}`;
  }
  return "NO_REFUSAL";
};

/** A sealed version as the loader returns it (the members runnerSettingsOfVersion maps), each one distinct. */
function versionSettings(version = VERSION, change: Partial<Record<string, unknown>> = {}): RunnerVersionSettings {
  return Object.freeze({
    registerVersion: version,
    policy: {
      bounds: { JUDGE: bound(), COMPOSER: bound(), CONFORMANCE: bound() },
      hashes: { judge: "j", composer: "c", conformance: "f", propagation: "p", serve: "s" },
      compositionRow: { sentinel: `compositionRow:${version}` },
      compositionBudgets: { sentinel: "compositionBudgets" },
      candidateConfidenceBand: "band",
      bandCeiling: { sentinel: "bandCeiling" },
      judgementPolicy: { sentinel: `judgementPolicy:${version}` },
      scoringOperator: { deploymentRowValue: "accumulate", registerRef: `v${version}` },
      runDeathPolicy: undefined,
      hiddenNodeScoreThreshold: { value: 0.25, sourceRef: "fixture" },
      verdictLabelPolicy: { sentinel: "verdictLabelPolicy" },
      panelPolicy: { sentinel: "panelPolicy" },
      stoppingPolicy: { sentinel: "stoppingPolicy" },
      synthesisRolePolicy: {
        registerVersion: version, synthesizerRoleRef: PRIMARY, evaluatorRoleRef: PRIMARY,
        synthesizerBound: bound(), evaluatorBound: bound()
      },
      ...change
    },
    storyPolicy: null,
    previewConfig: undefined,
    debateShape: null,
    engine: null,
    callLaneLimits: Object.freeze({ perDebate: 3, perModelPerDebate: 2 }),
    costEnvelope: null
  }) as unknown as RunnerVersionSettings;
}

describe("mergeRunnerSettings: one debate's settings (side-by-side spec §13)", () => {
  it("replaces exactly the debate members and keeps every process member", () => {
    const debate = runnerSettingsOfVersion(versionSettings());
    const debateKeys = Object.keys(debate);
    expect(debateKeys.length).toBe(23);
    // A process settings object with a sentinel under EVERY key, the debate members included (main.ts spreads the
    // site version's), plus the process-only members.
    const processOnly = ["workerId", "claimMs", "claimMarginMs", "providerRef", "maker", "maxRecompose", "releaseKey",
      "retirement", "story", "callScheduler", "settingsForVersion", "runSettingsVersions", "renewals", "holdRecorder"];
    const process = Object.fromEntries([...processOnly, ...debateKeys].map((key) => [key, { process: key }])) as unknown as
      WalkingSkeletonSettings;
    const merged = mergeRunnerSettings(process, debate);
    expect(Object.isFrozen(merged)).toBe(true);
    const mergedRecord = merged as unknown as Readonly<Record<string, unknown>>;
    expect(Object.keys(mergedRecord).sort()).toEqual([...new Set([...processOnly, ...debateKeys])].sort());
    for (const key of debateKeys) {
      expect(mergedRecord[key], key).toBe((debate as unknown as Readonly<Record<string, unknown>>)[key]);
    }
    for (const key of processOnly) {
      expect(mergedRecord[key], key).toBe((process as unknown as Readonly<Record<string, unknown>>)[key]);
    }
    // The version is the debate's: its facts are stamped with it.
    expect(merged.factBundleVersion).toBe(VERSION);
  });

  it("a debate member the version leaves undefined replaces the process's value (never inherited from the boot)", () => {
    // A version without the row (the runtime shape a JavaScript caller or parsed data can hand in).
    const debate = { ...runnerSettingsOfVersion(versionSettings()), scoringOperator: undefined } as never;
    const process = { scoringOperator: { deploymentRowValue: "boot", registerRef: "boot" } } as unknown as WalkingSkeletonSettings;
    const merged = mergeRunnerSettings(process, debate);
    expect("scoringOperator" in merged).toBe(true);
    expect(merged.scoringOperator).toBeUndefined();
  });
});

describe("assertRunnerSettingsGates: today's claim-time refusals, against one debate's settings", () => {
  const single = [PRIMARY];
  const multi = [PRIMARY, SECONDARY];
  const gate = (settings: RunnerGatedSettings, refs: readonly string[] = multi) =>
    codeOf(() => assertRunnerSettingsGates({ settings, configuredMakerRefs: refs }));

  it("passes a complete version and returns the three settings execute() reads later", () => {
    const settings = gated();
    const result = assertRunnerSettingsGates({ settings, configuredMakerRefs: multi });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.compositionRow).toBe(settings.compositionRow);
    expect(result.judgementPolicy).toBe(settings.judgementPolicy);
    expect(result.servePolicy).toBe(settings.servePolicy);
  });

  it("refuses each missing family with its own code, in today's order", () => {
    expect(gate(gated({ compositionRow: undefined }))).toBe("CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED");
    expect(gate(gated({ judgementPolicy: undefined }))).toBe("JUDGEMENT_POLICY_UNRESOLVED");
    expect(gate(gated({ servePolicy: undefined }))).toBe("SERVE_POLICY_UNRESOLVED");
    expect(gate(gated({ scoringOperator: undefined }))).toBe("SCORING_OPERATOR_UNRESOLVED");
    expect(gate(gated({ panelPolicy: undefined }))).toBe("PANEL_WEIGHTING_UNRESOLVED");
    expect(gate(gated({ stoppingPolicy: undefined }))).toBe("ADAPTIVE_STOPPING_UNRESOLVED");
    expect(gate(gated({ verdictLabelPolicy: undefined }))).toBe("VERDICT_LABEL_CONTROLS_UNRESOLVED");
    expect(gate(gated({ synthesisRolePolicy: undefined }))).toBe("SYNTHESIS_ROLE_CONTROLS_UNRESOLVED");
    // The ninth: a synthesis policy present without its bound (refused inside the longest-deadline maximum).
    expect(gate(gated({ synthesisRolePolicy: { ...gated().synthesisRolePolicy, evaluatorBound: undefined } })))
      .toBe("SYNTHESIS_ROLE_CONTROLS_UNRESOLVED");
    // Order: with two families missing, the earlier gate is the one that fires.
    expect(gate(gated({ judgementPolicy: undefined, servePolicy: undefined }))).toBe("JUDGEMENT_POLICY_UNRESOLVED");
  });

  it("binds the three multi-maker families only when more than one maker is configured", () => {
    for (const family of ["scoringOperator", "panelPolicy", "stoppingPolicy"] as const) {
      expect(gate(gated({ [family]: undefined }), single), family).toBe("NO_REFUSAL");
    }
    expect(gate(gated({ verdictLabelPolicy: undefined }), single)).toBe("VERDICT_LABEL_CONTROLS_UNRESOLVED");
  });

  it("refuses a claim that cannot cover the longest call (CLAIM_BOUND_MISMATCH, a TypeError)", () => {
    const tooLong = gated({ synthesisRolePolicy: { ...gated().synthesisRolePolicy, synthesizerBound: bound(20000) } });
    expect(gate(tooLong)).toMatch(/^TypeError:CLAIM_BOUND_MISMATCH/u);
    // The margin counts: 9 001 ms of deadline plus 1 000 of margin is over a 10 000 ms claim.
    expect(gate(gated({ judgeBound: bound(9001) }))).toMatch(/^TypeError:CLAIM_BOUND_MISMATCH/u);
    expect(gate(gated({ judgeBound: bound(9000) }))).toBe("NO_REFUSAL");
  });

  it("refuses a sealed role ref no configured maker carries (J24), naming the role and the version", () => {
    const unconfigured = gated({
      synthesisRolePolicy: { ...gated().synthesisRolePolicy, evaluatorRoleRef: "provider:never-configured" }
    });
    let refusal: unknown;
    try {
      assertRunnerSettingsGates({ settings: unconfigured, configuredMakerRefs: multi });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(TypedDomainError);
    expect(refusal).toMatchObject({ code: "SYNTHESIS_ROLE_PROVIDER_UNRESOLVED" });
    expect((refusal as Error).message).toContain("EVALUATOR role ref provider:never-configured");
    expect((refusal as Error).message).toContain(`(register version ${String(VERSION)})`);
    // The same ref is fine once a maker carries it.
    expect(gate(unconfigured, [...multi, "provider:never-configured"])).toBe("NO_REFUSAL");
  });
});

describe("createRunSettingsVersions: a run's version is never re-pointed", () => {
  it("keeps each run's version; the same value twice is fine; a different value refuses", () => {
    const versions = createRunSettingsVersions();
    expect(versions.versionOf("run-a")).toBeUndefined();
    versions.set("run-a", 17);
    versions.set("run-b", 18);
    versions.set("run-a", 17);
    expect(versions.versionOf("run-a")).toBe(17);
    expect(versions.versionOf("run-b")).toBe(18);
    expect(codeOf(() => versions.set("run-a", 18))).toBe("RUN_SETTINGS_VERSION_DRIFT");
    expect(versions.versionOf("run-a")).toBe(17);
  });
});

describe("runCostEnvelopeGuardOf: each call charged to its own run's version", () => {
  const store = {} as never;
  const guard17 = new CostEnvelopeGuard({ store, policy: { perRunCeilingMicros: 1000, dailyCeilingMicros: 100000 } });
  const guard18 = new CostEnvelopeGuard({ store, policy: { perRunCeilingMicros: 2000, dailyCeilingMicros: 100000 } });
  const cache = {
    loaded: (version: number) => version === 17 ? { costEnvelope: { guard: guard17 } }
      : version === 18 ? { costEnvelope: { guard: guard18 } }
      : version === 19 ? { costEnvelope: null } : undefined
  } as never;

  it("picks the version's guard; an unmapped run, a version not loaded or one without a guard refuse", () => {
    const versions = createRunSettingsVersions();
    versions.set("run-a", 17);
    versions.set("run-b", 18);
    versions.set("run-c", 20);
    versions.set("run-d", 19);
    const guardOf = runCostEnvelopeGuardOf(cache, versions);
    expect(guardOf("run-a")).toBe(guard17);
    expect(guardOf("run-b")).toBe(guard18);
    expect(codeOf(() => guardOf("run-unmapped"))).toBe("RUN_SETTINGS_VERSION_UNKNOWN");
    expect(codeOf(() => guardOf("run-c"))).toBe("RUN_SETTINGS_VERSION_UNKNOWN");
    expect(codeOf(() => guardOf("run-d"))).toBe("RUN_SETTINGS_VERSION_UNKNOWN");
  });
});

describe("execute() reads one debate's settings only (O1): the source scan", () => {
  const RUNNER = "apps/runner/src/index.ts";
  const source = ts.createSourceFile(RUNNER, read(RUNNER), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const isThisSettingsRead = (node: ts.Node): node is ts.PropertyAccessExpression =>
    ts.isPropertyAccessExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.expression.kind === ts.SyntaxKind.ThisKeyword
    && node.expression.name.text === "settings";
  function method(name: string): ts.MethodDeclaration {
    let found: ts.MethodDeclaration | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name?.text === "WalkingSkeletonRunner") {
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member) && member.name.getText(source) === name) found = member;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (found?.body === undefined) throw new Error(`method not found: ${name}`);
    return found;
  }
  function readsIn(root: ts.Node): readonly Readonly<{ member: string; at: number }>[] {
    const reads: { member: string; at: number }[] = [];
    const visit = (node: ts.Node) => {
      if (isThisSettingsRead(node)) reads.push({ member: node.name.text, at: node.getStart(source) });
      ts.forEachChild(node, visit);
    };
    visit(root);
    return reads;
  }

  it("has no this.settings read after the settings binding; before it only the process reads", () => {
    const execute = method("execute");
    const binding = execute.body!.statements.find((statement) => ts.isVariableStatement(statement)
      && statement.declarationList.declarations.some((declaration) => declaration.name.getText(source) === "settings"));
    expect(binding).toBeDefined();
    const bindingText = binding!.getText(source);
    expect(bindingText).toBe(
      "const settings: WalkingSkeletonSettings = resolution?.kind === \"SETTINGS\" ? resolution.settings : this.settings;"
    );
    const reads = readsIn(execute.body!);
    const after = reads.filter((read) => read.at > binding!.getStart(source));
    expect(after).toEqual([]);
    // The process reads before it: Phase 1's retirement stop (ruling R6) and the version resolver.
    expect([...new Set(reads.map((read) => read.member))].sort()).toEqual(["retirement", "settingsForVersion"]);
    // Control: the scan sees reads (the whole file still has the process-member reads outside execute()).
    expect(readsIn(source).length).toBeGreaterThan(reads.length);
  });

  it("hands the operator snapshot the debate's own scoring row at both call sites, and the method reads no boot row", () => {
    const text = read(RUNNER);
    const calls = [...text.matchAll(/this\.#resolveOperatorResolvedSnapshot\(([^)]*)\)/gu)].map((match) => match[1]);
    expect(calls).toEqual(["run.runId, settings.scoringOperator", "run.runId, settings.scoringOperator"]);
    expect(readsIn(method("#resolveOperatorResolvedSnapshot").body!)).toEqual([]);
  });

  it("opens the lane with the version's limits, records the version after the claim, checks the stamp, and passes the story policy", () => {
    const text = read(RUNNER);
    const execute = text.slice(text.indexOf("  private async execute("), text.indexOf("export type RunnerExecutionResult ="));
    const claim = execute.indexOf("const claimed = workItemId === undefined");
    const map = execute.indexOf("if (resolution !== null) settings.runSettingsVersions?.set(claimedRunId, resolution.version);");
    const keepAlive = execute.indexOf("const keepAlive = startRunKeepAlive({");
    const lane = execute.indexOf("callScheduler.openLane(claimedRunId, settings.callLaneLimits)");
    expect(claim).toBeGreaterThan(-1);
    expect(map).toBeGreaterThan(claim);
    expect(keepAlive).toBeGreaterThan(map);
    expect(lane).toBeGreaterThan(keepAlive);
    const head = execute.indexOf("run = await this.#runs.readFrozenHead(claimedRunId);");
    const stamp = execute.indexOf("if (resolution !== null && run.registerVersion !== resolution.version) {");
    expect(stamp).toBeGreaterThan(head);
    expect(execute.slice(stamp, stamp + 200)).toContain("\"RUN_SETTINGS_VERSION_DRIFT\"");
    expect(execute).toContain(
      "await storyWriter.writeAfterSettle(settings.storyPolicy === undefined ? settled.input : Object.freeze({ ...settled.input, policy: settings.storyPolicy }));"
    );
  });
});

describe("the version reads select register_version by id (behaviour: S19)", () => {
  const between = (text: string, start: string, end: string) => {
    const from = text.indexOf(start);
    expect(from, start).toBeGreaterThan(-1);
    return text.slice(from, text.indexOf(end, from));
  };
  it("peekRunSettingsVersion, readRunRegisterVersion and readFrozenHead", () => {
    const battery = read("packages/battery/src/index.ts");
    const db = read("packages/db/src/index.ts");
    const peek = between(battery, "async peekRunSettingsVersion(", "\n  }\n");
    expect(peek).toContain("SELECT run.run_id, run.register_version::integer AS register_version, run.release_key");
    expect(peek).toContain("JOIN core.run AS run ON run.run_id = item.run_id");
    expect(peek).toContain("WHERE item.work_item_id = $1");
    const byRun = between(db, "async readRunRegisterVersion(", "\n  }\n");
    expect(byRun).toContain("SELECT register_version::integer AS register_version FROM core.run WHERE run_id = $1");
    const head = between(db, "async readFrozenHead(", "\n    });\n  }\n");
    expect(head).toContain("register_version::integer AS register_version");
    expect(head).toContain("FROM core.run WHERE run_id = $1");
    expect(head).toContain("registerVersion: row.register_version");
    for (const text of [peek, byRun, head]) {
      expect(text).not.toMatch(/max\(register_version\)|ORDER BY register_version DESC/iu);
    }
  });
});

/**
 * A scripted pool: the release read, the version peek and the claim are answered; anything else (the content lease
 * the debate opens next) is refused, so the debate stops right after its lane opens and no model call is made.
 */
function scriptedPool(options: Readonly<{ peekVersion: number | null; peekReleaseKey?: string }>) {
  const statements: string[] = [];
  let connects = 0;
  const answer = (sql: string) => {
    statements.push(sql.replace(/\s+/gu, " ").trim());
    if (sql.includes("SELECT run.release_key")) return { rows: [{ release_key: RELEASE_KEY }] };
    if (sql.includes("SELECT run.run_id, run.register_version::integer AS register_version, run.release_key")) {
      return { rows: options.peekVersion === null ? [] : [{
        run_id: "run-1", register_version: options.peekVersion, release_key: options.peekReleaseKey ?? RELEASE_KEY
      }] };
    }
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
    if (sql.includes("SET state = 'CLAIMED'")) {
      return { rows: [{
        work_item_id: "item-1", command_key: "command", battery_row_id: "row", node_set: [], claimed_by: "worker",
        claim_deadline: new Date(Date.now() + 60000), run_id: "run-1"
      }] };
    }
    throw new Error("SCRIPTED_POOL_UNSCRIPTED");
  };
  const client = { query: async (sql: string) => answer(sql), release: () => undefined };
  const pool = {
    query: async (sql: string) => answer(sql),
    connect: async () => { connects += 1; return client; }
  } as unknown as Pool;
  return { pool, statements, connects: () => connects };
}

/** The boot's settings: deliberately WITHOUT the composition row, so only the debate's own version passes the gates. */
function processSettings(change: Partial<Record<string, unknown>> = {}) {
  const opened: [string, unknown][] = [];
  const scheduler = createCallScheduler({ policy: effectiveCallConcurrency({ state: "ABSENT" }) });
  const recording: CallScheduler = { ...scheduler, openLane: (id, limits) => { opened.push([id, limits]); return scheduler.openLane(id, limits); } };
  const versions = createRunSettingsVersions();
  const settings = {
    ...gated({ compositionRow: undefined }),
    workerId: "worker", providerRef: PRIMARY, maker: "maker:primary", releaseKey: RELEASE_KEY,
    judgeContractHash: "j", composerContractHash: "c", conformanceContractHash: "f", propagationContractHash: "p",
    serveContractHash: "s", maxRecompose: 1, factBundleVersion: 17, judgementNumberKind: "k", judgementProducer: "p",
    propagationNumberKind: "k", propagationProducer: "p",
    callScheduler: recording,
    runSettingsVersions: versions,
    ...change
  } as unknown as WalkingSkeletonSettings;
  return { settings, opened, versions };
}

const provider = { complete: async () => { throw new Error("NO_MODEL_CALL_EXPECTED"); } } as never;

describe("executeWorkItem resolves the debate's own version (side-by-side spec §13, plan D2)", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("reads the version before the claim, gates it, maps the run, and opens the lane with the version's limits", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const asked: number[] = [];
    const settingsForVersion = async (version: number): Promise<RunnerSettingsResolution> => {
      asked.push(version);
      return { kind: "SETTINGS", version: versionSettings(version) };
    };
    const { settings, opened, versions } = processSettings({ settingsForVersion });
    const db = scriptedPool({ peekVersion: VERSION });
    const runner = new WalkingSkeletonRunner(db.pool, provider, settings);
    // The debate stops at its content lease (the scripted pool refuses it), after the lane opened.
    await expect(runner.executeWorkItem("item-1")).rejects.toBeInstanceOf(TypedDomainError);
    expect(asked).toEqual([VERSION]);
    // The peek came before the claim's transaction.
    const peekAt = db.statements.findIndex((sql) => sql.startsWith("SELECT run.run_id, run.register_version"));
    expect(peekAt).toBeGreaterThan(-1);
    expect(peekAt).toBeLessThan(db.statements.indexOf("BEGIN"));
    expect(versions.versionOf("run-1")).toBe(VERSION);
    expect(opened).toEqual([["run-1", { perDebate: 3, perModelPerDebate: 2 }]]);
    // The boot's settings alone would have refused at the gate (no composition row): the gates read the debate's.
    const boot = new WalkingSkeletonRunner(scriptedPool({ peekVersion: VERSION }).pool, provider, processSettings().settings);
    await expect(boot.executeWorkItem("item-1")).rejects.toMatchObject({ code: "CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED" });
  });

  it("merges each version once for the life of the runner", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const settingsForVersion = vi.fn(async (version: number): Promise<RunnerSettingsResolution> =>
      ({ kind: "SETTINGS", version: versionSettings(version) }));
    const { settings } = processSettings({ settingsForVersion });
    const runner = new WalkingSkeletonRunner(scriptedPool({ peekVersion: VERSION }).pool, provider, settings);
    await expect(runner.executeWorkItem("item-1")).rejects.toBeInstanceOf(TypedDomainError);
    await expect(runner.executeWorkItem("item-1")).rejects.toBeInstanceOf(TypedDomainError);
    expect(settingsForVersion).toHaveBeenCalledTimes(1);
  });

  it("refuses a version's own failing gate before the claim: the item stays unclaimed", async () => {
    const settingsForVersion = async (version: number): Promise<RunnerSettingsResolution> =>
      ({ kind: "SETTINGS", version: versionSettings(version, { judgementPolicy: undefined }) });
    const { settings, opened } = processSettings({ settingsForVersion });
    const db = scriptedPool({ peekVersion: VERSION });
    await expect(new WalkingSkeletonRunner(db.pool, provider, settings).executeWorkItem("item-1"))
      .rejects.toMatchObject({ code: "JUDGEMENT_POLICY_UNRESOLVED" });
    expect(db.connects()).toBe(0);
    expect(opened).toEqual([]);
  });

  it("resolves nothing for a run of another release or no run: the boot's settings meet the gates (the fenced claim refuses it)", async () => {
    const settingsForVersion = vi.fn(async (): Promise<RunnerSettingsResolution> => ({ kind: "UNSUPPORTED", code: "NEVER" }));
    for (const db of [scriptedPool({ peekVersion: null }), scriptedPool({ peekVersion: VERSION, peekReleaseKey: "r18-" + "0123456789ab" })]) {
      const { settings } = processSettings({ settingsForVersion });
      await expect(new WalkingSkeletonRunner(db.pool, provider, settings).executeWorkItem("item-1"))
        .rejects.toMatchObject({ code: "CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED" });
    }
    expect(settingsForVersion).not.toHaveBeenCalled();
  });

  it("never runs an UNSUPPORTED version: it takes the fenced claim, then refuses SETTINGS_VERSION_UNSUPPORTED (the S7 hook)", async () => {
    const settingsForVersion = async (): Promise<RunnerSettingsResolution> =>
      ({ kind: "UNSUPPORTED", code: "ENGINE_CONTRACT_HASH_MISMATCH" });
    const { settings, opened, versions } = processSettings({ settingsForVersion });
    const db = scriptedPool({ peekVersion: VERSION });
    await expect(new WalkingSkeletonRunner(db.pool, provider, settings).executeWorkItem("item-1")).rejects.toMatchObject({
      code: "SETTINGS_VERSION_UNSUPPORTED", message: "SETTINGS_VERSION_UNSUPPORTED:ENGINE_CONTRACT_HASH_MISMATCH"
    });
    expect(db.statements.some((sql) => sql.includes("SET state = 'CLAIMED'"))).toBe(true);
    expect(opened).toEqual([]);
    expect(versions.versionOf("run-1")).toBeUndefined();
  });

  it("ruling R37: an untyped resolver failure leaves the item unclaimed, prints one content-free line and propagates", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((line: unknown) => { lines.push(String(line)); });
    const blip = new Error("connection reset by the database");
    const settingsForVersion = async (): Promise<RunnerSettingsResolution> => { throw blip; };
    const { settings } = processSettings({ settingsForVersion });
    const db = scriptedPool({ peekVersion: VERSION });
    await expect(new WalkingSkeletonRunner(db.pool, provider, settings).executeWorkItem("item-1")).rejects.toBe(blip);
    expect(db.connects()).toBe(0);
    expect(lines.map((line) => JSON.parse(line) as Record<string, unknown>)).toEqual([{
      kind: "DEBATEAI_RUNNER_CLAIM", event: "RUN_SETTINGS_UNREADABLE", workItemId: "item-1",
      version: String(VERSION), code: "UNTYPED"
    }]);
    expect(lines.join("\n")).not.toContain("connection reset");
  });
});
