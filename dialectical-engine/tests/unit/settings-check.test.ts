// Side-by-side spec §13 "Activation is refused unless" (S14): check-version, the dry boot of a release against one
// sealed settings version, in two halves (runner and API), each listing every refusal code in ONE report line. Injected
// readers: no database, no AI call.
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import {
  PREVIEW_REVIEWED_PROVIDER_REFS,
  parsePreviewEnvironmentConfig,
  parseProviderDiscoveryTargets,
  previewModelRow,
  previewTargetJsonRow,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import {
  SETTINGS_CHECKER,
  parseSettingsCheckArguments,
  runSettingsCheckCommand,
  runSettingsCheckSteps,
  settingsCheckLine,
  settingsCheckRefusalCode,
  settingsCheckReport,
  settingsCheckUnavailableReason,
  type SettingsCheckReport,
  type SettingsComparisonRow
} from "@debateai/register";
import { mapPromptContractHash } from "@debateai/map";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import {
  assertDeclaredContractHashes,
  declaredContractHashRefusals,
  type RunnerSiteContext
} from "../../apps/runner/src/run-settings.js";
import {
  checkRunnerSettingsVersion,
  type RunnerCheckEnvironment,
  type RunnerCheckReaders
} from "../../apps/runner/src/settings-check.js";
import {
  checkAdmissionSettingsVersion,
  checkQuestionLanguage,
  type AdmissionCheckReaders,
  type ApiCheckEnvironment
} from "../../apps/api/src/settings-check.js";
import { buildAdmissionSiteContext, type AdmissionSiteContext } from "../../apps/api/src/admission-settings.js";
import { registerFixtureRow } from "../support/registerFixtures.js";

const POOL = {} as Pool;
const SITE_VERSION = 17;
const VERSION = 18;
const RELEASE_KEY = "r17-" + "0123456789ab";
const SNAPSHOT = "a".repeat(64);
const SOCKETS = {
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", deployment: "v3-preview",
  requested_thinking_level: "high", scope_id: "settings-check-fixture",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock"
};
const PREVIEW_GATE = parsePreviewEnvironmentConfig(JSON.stringify(SOCKETS))!.gate;
const [REF_A, REF_B] = PREVIEW_REVIEWED_PROVIDER_REFS as readonly [string, string];

function reviewedTargets(refs: readonly string[] = PREVIEW_REVIEWED_PROVIDER_REFS): readonly ProviderDiscoveryTarget[] {
  return parseProviderDiscoveryTargets(JSON.stringify(refs.map((ref) => previewTargetJsonRow(ref))), refs.map((ref) => {
    const row = previewModelRow(previewTargetJsonRow(ref).model as string)!;
    return { providerRef: ref, maker: row.maker, adapterKind: row.adapterKind };
  }));
}

const runnerEnvironment = (change: Partial<RunnerCheckEnvironment> = {}): RunnerCheckEnvironment => Object.freeze({
  REGISTER_VERSION: SITE_VERSION, RELEASE_KEY, DEPLOYMENT_MODE: "local", NODE_ENV: "test",
  PROVIDER_DISCOVERY_TARGETS_JSON: "[]", PREVIEW_GATE_SETTINGS: undefined, PREVIEW_ENV_LINE_UP: undefined,
  CLAIM_MS: 7200000, CLAIM_MARGIN_MS: 1000, ...change
});

const runnerSite = (targets = reviewedTargets()): RunnerSiteContext => ({ declaredProviderTargets: targets } as unknown as RunnerSiteContext);

/** Every reader passing: the four roles on declared reviewed refs, both hashes sealed, a sealed snapshot. */
function runnerReaders(change: Partial<RunnerCheckReaders> = {}) {
  const calls: string[] = [];
  const readers: RunnerCheckReaders = {
    readSite: vi.fn(async () => { calls.push("readSite"); return runnerSite(); }),
    loadVersion: vi.fn(async (_pool: Pool, version: number) => { calls.push(`loadVersion:${version}`); return {} as never; }),
    readRoleRefs: vi.fn(async () => { calls.push("readRoleRefs"); return [REF_A, REF_B, REF_A, REF_B]; }),
    contractHashRefusals: vi.fn(async () => { calls.push("contractHashRefusals"); return []; }),
    readVersionFacts: vi.fn(async () => { calls.push("readVersionFacts"); return { sealed: true, publicationKind: "GENERAL", snapshotSha256: SNAPSHOT }; }),
    ...change
  };
  return { readers, calls };
}

const checkRunner = (readers: RunnerCheckReaders, environment = runnerEnvironment()) =>
  checkRunnerSettingsVersion({ pool: POOL, environment, version: VERSION, readers });

const apiEnvironment = (change: Partial<ApiCheckEnvironment> = {}): ApiCheckEnvironment => Object.freeze({
  REGISTER_VERSION: SITE_VERSION, RELEASE_KEY, DEPLOYMENT_MODE: "local", NODE_ENV: "test",
  PROVIDER_DISCOVERY_TARGETS_JSON: "[]", PREVIEW_GATE_SETTINGS: undefined, PREVIEW_ENV_LINE_UP: undefined, ...change
});

const SESSION = registerFixtureRow("sessionPolicy", { idle_minutes: 30 }, "fixture");
const ENVELOPE = (daily: number, perRun: number) =>
  registerFixtureRow("costEnvelopePolicy", { daily_ceiling_micros: daily, per_run_ceiling_micros: perRun }, "fixture");
const comparison = (...rows: ReturnType<typeof registerFixtureRow>[]): readonly SettingsComparisonRow[] =>
  rows.map(({ rowKey, valueJsonText }) => ({ rowKey, valueJsonText }));

function apiReaders(change: Partial<AdmissionCheckReaders> = {}, candidate = comparison(SESSION, ENVELOPE(2000000, 900000))) {
  const calls: string[] = [];
  const readers: AdmissionCheckReaders = {
    readSite: vi.fn(async () => { calls.push("readSite"); return {} as AdmissionSiteContext; }),
    loadVersion: vi.fn(async (_pool: Pool, version: number) => { calls.push(`loadVersion:${version}`); return {}; }),
    readVersionFacts: vi.fn(async () => ({ sealed: true, publicationKind: null, snapshotSha256: SNAPSHOT })),
    // The site version and a candidate that raises only a debate member (the per-run ceiling): no site difference.
    readComparisonRows: vi.fn(async (_pool: Pick<Pool, "query">, version: number) =>
      version === SITE_VERSION ? comparison(SESSION, ENVELOPE(2000000, 250000)) : candidate),
    ...change
  };
  return { readers, calls };
}

const checkApi = (readers: AdmissionCheckReaders, environment = apiEnvironment()) =>
  checkAdmissionSettingsVersion({ pool: POOL, environment, version: VERSION, readers });

const typed = (code: string, message = code) => new TypedDomainError(code, message);

describe("check-version, the runner half (side-by-side §13)", () => {
  it("PASS on a clean version: every step ran, against the version asked, and the report names the sealed snapshot", async () => {
    const { readers, calls } = runnerReaders();
    const report = await checkRunner(readers);
    expect(report).toEqual({
      half: "runner", releaseKey: RELEASE_KEY, version: VERSION, verdict: "PASS", codes: [], snapshotSha256: SNAPSHOT,
      checker: SETTINGS_CHECKER
    });
    expect(Object.isFrozen(report) && Object.isFrozen(report.codes)).toBe(true);
    expect(calls).toEqual(["readSite", `loadVersion:${VERSION}`, "readRoleRefs", "contractHashRefusals", "readVersionFacts"]);
  });

  // Every refusal the boot's per-version loader (strict) can raise reaches the report as its own code.
  it.each([
    ["the prompt fingerprints", "REGISTER_PROMPT_CONTRACT_HASH_MISMATCH"],
    ["condition 4: the day cannot hold one run plus its story", "STORY_DAILY_CEILING_INSUFFICIENT"],
    ["a per-run raise the day cannot hold (the row's own refusal)", "COST_ENVELOPE_POLICY_INVALID"],
    ["the run ceiling against one call", "RUN_CEILING_BELOW_ONE_CALL"],
    ["the line-up (sockets-only env, no row)", "PREVIEW_LINE_UP_REQUIRED"],
    ["the preview scorecard conflict", "PREVIEW_SCORECARD_CONFLICT"],
    ["the claim cover", "CLAIM_BOUND_MISMATCH"],
    ["the story rows, strict", "STORY_POLICY_INVALID"],
    ["the debate shape's map hash", "MAP_CONTRACT_HASH_MISMATCH"]
  ])("FAIL on the loader's refusal: %s", async (_name, code) => {
    const { readers } = runnerReaders({ loadVersion: async () => { throw typed(code); } });
    expect(await checkRunner(readers)).toMatchObject({ verdict: "FAIL", codes: [code] });
  });

  it("a code-shaped refusal message is its code (the register readers' house form)", async () => {
    const { readers } = runnerReaders({ loadVersion: async () => { throw new TypeError("CALL_CONCURRENCY_POLICY_INVALID"); } });
    expect((await checkRunner(readers)).codes).toEqual(["CALL_CONCURRENCY_POLICY_INVALID"]);
  });

  it("FAIL on the site reads: their code, and the version step (which needs them) is skipped without a code of its own", async () => {
    const { readers, calls } = runnerReaders({ readSite: async () => { throw new TypeError("PROVIDER_TARGET_LOOPBACK_REFUSED:x"); } });
    const report = await checkRunner(readers);
    expect(report.codes).toEqual(["PROVIDER_TARGET_LOOPBACK_REFUSED:x"]);
    expect(calls).not.toContain(`loadVersion:${VERSION}`);
    // The independent steps still ran.
    expect(calls).toEqual(expect.arrayContaining(["contractHashRefusals", "readVersionFacts"]));
  });

  it("condition 3: a role ref this release does not declare needs an env change (SETTINGS_NEEDS_ENV_CHANGE:ROLE_REF)", async () => {
    const { readers } = runnerReaders({
      readSite: async () => runnerSite(reviewedTargets([REF_A])),
      readRoleRefs: async () => [REF_A, "development:codex-cli", REF_A, REF_B]
    });
    expect((await checkRunner(readers)).codes).toEqual([
      "SETTINGS_NEEDS_ENV_CHANGE:ROLE_REF:development:codex-cli", `SETTINGS_NEEDS_ENV_CHANGE:ROLE_REF:${REF_B}`
    ]);
  });

  it("condition 5: the contract-hash refusals are listed", async () => {
    const { readers } = runnerReaders({
      contractHashRefusals: async () => ["SETTINGS_HASH_UNDECLARED:engineContractHash", "MAP_CONTRACT_HASH_MISMATCH"]
    });
    expect((await checkRunner(readers)).codes).toEqual(["MAP_CONTRACT_HASH_MISMATCH", "SETTINGS_HASH_UNDECLARED:engineContractHash"]);
  });

  it("condition 6 on the preview: a role whose model is not a reviewed row is SETTINGS_GATE_UNREVIEWED; off the preview it is not checked", async () => {
    const targets = reviewedTargets([REF_A, REF_B]);
    const declaredStranger = [...targets, { ...targets[0]!, providerRef: "preview:unreviewed" }];
    const change: Partial<RunnerCheckReaders> = {
      readSite: async () => runnerSite(declaredStranger),
      readRoleRefs: async () => [REF_A, "preview:unreviewed", REF_A, REF_B]
    };
    const preview = await checkRunner(runnerReaders(change).readers, runnerEnvironment({ PREVIEW_GATE_SETTINGS: PREVIEW_GATE }));
    expect(preview.codes).toEqual(["SETTINGS_GATE_UNREVIEWED:preview:unreviewed"]);
    expect((await checkRunner(runnerReaders(change).readers)).codes).toEqual([]);
  });

  it("several problems are listed together, sorted and unique, and the role refs are read once", async () => {
    const { readers } = runnerReaders({
      loadVersion: async () => { throw typed("STORY_DAILY_CEILING_INSUFFICIENT"); },
      readSite: async () => runnerSite(reviewedTargets([REF_A])),
      readRoleRefs: vi.fn(async () => [REF_A, "preview:unreviewed", REF_A, "preview:unreviewed"]),
      contractHashRefusals: async () => ["SETTINGS_HASH_UNDECLARED:mapContractHash", "SETTINGS_HASH_UNDECLARED:engineContractHash"]
    });
    const report = await checkRunner(readers, runnerEnvironment({ PREVIEW_GATE_SETTINGS: PREVIEW_GATE }));
    expect(report).toMatchObject({
      verdict: "FAIL",
      codes: [
        "SETTINGS_GATE_UNREVIEWED:preview:unreviewed", "SETTINGS_HASH_UNDECLARED:engineContractHash",
        "SETTINGS_HASH_UNDECLARED:mapContractHash", "SETTINGS_NEEDS_ENV_CHANGE:ROLE_REF:preview:unreviewed",
        "STORY_DAILY_CEILING_INSUFFICIENT"
      ]
    });
    expect(readers.readRoleRefs).toHaveBeenCalledTimes(1);
  });

  it("a database failure or an untyped error is not a finding: the half could not check (it rejects)", async () => {
    await expect(checkRunner(runnerReaders({
      loadVersion: async () => { throw new TypedDomainError("DATABASE_POOL_FAILED", "PostgreSQL pool operation failed: x"); }
    }).readers)).rejects.toMatchObject({ code: "DATABASE_POOL_FAILED" });
    await expect(checkRunner(runnerReaders({
      contractHashRefusals: async () => { throw new TypeError("Cannot read properties of undefined"); }
    }).readers)).rejects.toThrow("Cannot read properties of undefined");
  });

  it("an unknown version has no snapshot (null)", async () => {
    const { readers } = runnerReaders({ readVersionFacts: async () => null });
    expect((await checkRunner(readers)).snapshotSha256).toBeNull();
  });
});

describe("condition 5, the contract hashes (plan D5): both rows sealed and equal to the code's", () => {
  const poolWith = (rows: Readonly<Record<string, unknown>>) => ({
    query: vi.fn(async (_sql: string, params: readonly unknown[]) => {
      const key = params[1] as string;
      return { rows: Object.hasOwn(rows, key) ? [{ value_json: rows[key] }] : [] };
    })
  }) as unknown as Pick<Pool, "query">;
  const both = { mapContractHash: mapPromptContractHash(), engineContractHash: engineContractHash() };

  it("both present and equal: nothing to refuse", async () => {
    expect(await declaredContractHashRefusals(poolWith(both), VERSION)).toEqual([]);
    await expect(assertDeclaredContractHashes(poolWith(both), VERSION)).resolves.toBeUndefined();
  });

  it("each absence, staleness or malformed row is its own code, map row first; the assertion throws the first", async () => {
    expect(await declaredContractHashRefusals(poolWith({}), VERSION))
      .toEqual(["SETTINGS_HASH_UNDECLARED:mapContractHash", "SETTINGS_HASH_UNDECLARED:engineContractHash"]);
    expect(await declaredContractHashRefusals(poolWith({ ...both, mapContractHash: "0".repeat(64) }), VERSION))
      .toEqual(["MAP_CONTRACT_HASH_MISMATCH"]);
    expect(await declaredContractHashRefusals(poolWith({ mapContractHash: both.mapContractHash, engineContractHash: "f".repeat(64) }), VERSION))
      .toEqual(["ENGINE_CONTRACT_HASH_MISMATCH"]);
    expect(await declaredContractHashRefusals(poolWith({ ...both, mapContractHash: "not-a-hash" }), VERSION))
      .toEqual(["MAP_CONTRACT_HASH_INVALID"]);
    await expect(assertDeclaredContractHashes(poolWith({ mapContractHash: both.mapContractHash }), VERSION))
      .rejects.toMatchObject({ code: "SETTINGS_HASH_UNDECLARED:engineContractHash" });
  });

  it("reads the version asked, never another", async () => {
    const pool = poolWith(both);
    await declaredContractHashRefusals(pool, VERSION);
    for (const call of (pool.query as unknown as ReturnType<typeof vi.fn>).mock.calls) expect(call[1][0]).toBe(VERSION);
  });
});

describe("check-version, the API half (side-by-side §13)", () => {
  it("PASS on a clean version (a debate member raised): every step ran against the version asked", async () => {
    const { readers, calls } = apiReaders();
    expect(await checkApi(readers)).toEqual({
      half: "api", releaseKey: RELEASE_KEY, version: VERSION, verdict: "PASS", codes: [], snapshotSha256: SNAPSHOT,
      checker: SETTINGS_CHECKER
    });
    expect(calls).toEqual(["readSite", `loadVersion:${VERSION}`]);
    expect(readers.readComparisonRows).toHaveBeenCalledWith(POOL, SITE_VERSION);
    expect(readers.readComparisonRows).toHaveBeenCalledWith(POOL, VERSION);
  });

  it.each([
    ["the picker's scorecard against the targets (condition 3 for seated models)", "MODEL_SCORECARD_TARGET_UNCONFIGURED"],
    ["the question language's boot refusal", "QUESTION_LANGUAGE_FAST_CHECK_MODEL_NOT_ON_PREVIEW"],
    ["the API's own run ceiling", "RUN_CEILING_BELOW_ONE_CALL"],
    ["condition 4", "STORY_DAILY_CEILING_INSUFFICIENT"],
    ["the preview's roster against a valid scorecard", "PREVIEW_SCORECARD_CONFLICT"],
    ["the engine without its length row", "ENGINE_REQUIRES_LENGTH_POLICY"]
  ])("FAIL on the admission loader's refusal: %s", async (_name, code) => {
    const { readers } = apiReaders({ loadVersion: async () => { throw typed(code); } });
    expect(await checkApi(readers)).toMatchObject({ verdict: "FAIL", codes: [code] });
  });

  it.each([
    ["an unknown version", null],
    ["an unsealed version", { sealed: false, publicationKind: null, snapshotSha256: null }],
    ["a support publication", { sealed: true, publicationKind: "SUPPORT", snapshotSha256: SNAPSHOT }]
  ])("the version must be sealed and GENERAL: %s is SETTINGS_VERSION_KIND_INVALID", async (_name, facts) => {
    const { readers } = apiReaders({ readVersionFacts: async () => facts });
    expect((await checkApi(readers)).codes).toEqual(["SETTINGS_VERSION_KIND_INVALID"]);
  });

  it("condition 2: a SITE row, a MIXED row's site member and an unclassified row are each named", async () => {
    const candidate = comparison(
      registerFixtureRow("sessionPolicy", { idle_minutes: 45 }, "fixture"),
      ENVELOPE(3000000, 250000),
      registerFixtureRow("someRowNobodyClassified", { a: 1 }, "fixture")
    );
    const { readers } = apiReaders({}, candidate);
    expect((await checkApi(readers)).codes).toEqual([
      "SETTINGS_ROW_UNCLASSIFIED:someRowNobodyClassified",
      "SETTINGS_SITE_MEMBER_DIFFERS:costEnvelopePolicy.daily_ceiling_micros",
      "SETTINGS_SITE_MEMBER_DIFFERS:sessionPolicy"
    ]);
  });

  it("several problems together, sorted and unique (the kind refusal from two steps is one code)", async () => {
    const { readers } = apiReaders({
      loadVersion: async () => { throw typed("RUN_CEILING_BELOW_ONE_CALL"); },
      readVersionFacts: async () => null,
      readComparisonRows: async (_pool, version) => {
        if (version === VERSION) throw typed("SETTINGS_VERSION_KIND_INVALID", "The register version 18 is not a sealed version");
        return comparison(SESSION);
      }
    });
    expect((await checkApi(readers)).codes).toEqual(["RUN_CEILING_BELOW_ONE_CALL", "SETTINGS_VERSION_KIND_INVALID"]);
  });

  it("FAIL on the site reads skips the loader; a database failure rejects", async () => {
    const skipped = apiReaders({ readSite: async () => { throw typed("BILLING_PLANS_UNRESOLVED"); } });
    expect((await checkApi(skipped.readers)).codes).toEqual(["BILLING_PLANS_UNRESOLVED"]);
    expect(skipped.calls).not.toContain(`loadVersion:${VERSION}`);
    await expect(checkApi(apiReaders({
      readComparisonRows: async () => { throw new TypedDomainError("DATABASE_POOL_FAILED", "PostgreSQL pool operation failed"); }
    }).readers)).rejects.toMatchObject({ code: "DATABASE_POOL_FAILED" });
  });
});

describe("the check's question-language route can never call a model", () => {
  it("preview with the Anthropic gate socket: PREVIEW (the same boot refusals as main.ts), and its fetch refuses", async () => {
    const route = await checkQuestionLanguage({ DEPLOYMENT_MODE: "hosted", PREVIEW_GATE_SETTINGS: PREVIEW_GATE })
      .routeFor({ policy: null, dayCeilingMicros: 2000000 });
    expect(route.kind).toBe("PREVIEW");
    if (route.kind !== "PREVIEW") return;
    await expect(route.fetch("https://api.anthropic.com/v1/messages")).rejects.toMatchObject({ code: "SETTINGS_CHECK_NO_AI_CALL" });
  });

  it("hosted without the preview: the boot refusals run, then no spend record means no fast check (no key read)", async () => {
    const question = checkQuestionLanguage({ DEPLOYMENT_MODE: "hosted", PREVIEW_GATE_SETTINGS: undefined });
    const route = await question.routeFor({ policy: null, dayCeilingMicros: 2000000 });
    expect(route).toEqual({ kind: "NONE", reason: "HOSTED_BEFORE_SPEND_RECORD" });
    await expect(question.routeFor({ policy: null, dayCeilingMicros: null })).rejects.toMatchObject({ code: "QUESTION_LANGUAGE_DAY_POT_UNAVAILABLE" });
    expect(await checkQuestionLanguage({ DEPLOYMENT_MODE: "local", PREVIEW_GATE_SETTINGS: undefined })
      .routeFor({ policy: null, dayCeilingMicros: null })).toEqual({ kind: "NONE", reason: "LOCAL_MODE" });
  });
});

describe("buildAdmissionSiteContext: the one way main.ts, the practice and the check build the API's site", () => {
  const ENVELOPE_POLICY = { perRunCeilingMicros: 250000, dailyCeilingMicros: 2000000, closeBasisPoints: 9500,
    finishBasisPoints: 11500, waitingLinePerPerson: 1 } as never;
  const build = (change: Partial<Parameters<typeof buildAdmissionSiteContext>[0]>) => buildAdmissionSiteContext({
    pool: POOL, environment: { REGISTER_VERSION: SITE_VERSION, DEPLOYMENT_MODE: "hosted", PREVIEW_GATE_SETTINGS: undefined },
    declaredProviderTargets: reviewedTargets(), siteCostEnvelopePolicy: ENVELOPE_POLICY, askRoom: true, billingEnabled: false,
    questionLanguage: checkQuestionLanguage({ DEPLOYMENT_MODE: "hosted", PREVIEW_GATE_SETTINGS: undefined }), log: () => undefined,
    ...change
  });

  it("the room's recent runs or the daily guard's store, never both; local mode neither", () => {
    expect(build({})).toMatchObject({ spend: null, siteVersion: SITE_VERSION, deploymentMode: "hosted", preview: undefined });
    expect(build({}).recentRunUsage).not.toBeNull();
    expect(build({ askRoom: false }).spend).not.toBeNull();
    expect(build({ askRoom: false }).recentRunUsage).toBeNull();
    const local = build({ siteCostEnvelopePolicy: null, askRoom: false,
      environment: { REGISTER_VERSION: SITE_VERSION, DEPLOYMENT_MODE: "local", PREVIEW_GATE_SETTINGS: undefined } });
    expect([local.spend, local.recentRunUsage, local.siteCostEnvelope]).toEqual([null, null, null]);
  });

  it("the preview's gate part and the env's line-up (null for the sockets-only form); the practice's forwarded seam only when given", () => {
    const site = build({ environment: { REGISTER_VERSION: SITE_VERSION, DEPLOYMENT_MODE: "hosted", PREVIEW_GATE_SETTINGS: PREVIEW_GATE } });
    expect(site.preview).toEqual({ gate: PREVIEW_GATE, envLineUp: null });
    expect(Object.keys(site).sort()).toEqual(["billingEnabled", "declaredProviderTargets", "deploymentMode", "log", "preview",
      "prices", "questionLanguage", "recentRunUsage", "siteCostEnvelope", "siteVersion", "spend"]);
    const remaining = {} as never;
    expect(build({ previewRemaining: remaining }).previewRemaining).toBe(remaining);
    expect(Object.isFrozen(site)).toBe(true);
  });
});

describe("the report line and the step runner", () => {
  it("the line's exact shape: one line, keys in order, the version a JSON number, codes sorted and unique", () => {
    const report = settingsCheckReport({ half: "api", releaseKey: RELEASE_KEY, version: VERSION,
      codes: ["SETTINGS_SITE_MEMBER_DIFFERS:sessionPolicy", "RUN_CEILING_BELOW_ONE_CALL", "SETTINGS_SITE_MEMBER_DIFFERS:sessionPolicy"],
      snapshotSha256: null });
    const line = settingsCheckLine(report);
    expect(line).toBe(`DEBATEAI_SETTINGS_CHECK {"half":"api","releaseKey":"${RELEASE_KEY}","version":18,"verdict":"FAIL",`
      + `"codes":["RUN_CEILING_BELOW_ONE_CALL","SETTINGS_SITE_MEMBER_DIFFERS:sessionPolicy"],"snapshotSha256":null,"checker":"check-version-v1"}\n`);
    expect(line.split("\n")).toHaveLength(2);
    const parsed = JSON.parse(line.slice("DEBATEAI_SETTINGS_CHECK ".length)) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["half", "releaseKey", "version", "verdict", "codes", "snapshotSha256", "checker"]);
    expect(typeof parsed.version).toBe("number");
    expect(settingsCheckReport({ half: "runner", releaseKey: RELEASE_KEY, version: VERSION, codes: [], snapshotSha256: SNAPSHOT }).verdict)
      .toBe("PASS");
  });

  it("a refusal's code: typed (with its detail when the message is exactly code:detail), code-shaped; never a database failure or prose", () => {
    expect(settingsCheckRefusalCode(typed("SETTINGS_HASH_UNDECLARED:engineContractHash"))).toBe("SETTINGS_HASH_UNDECLARED:engineContractHash");
    expect(settingsCheckRefusalCode(typed("CLAIM_BOUND_MISMATCH", "CLAIM_BOUND_MISMATCH: the claim cannot cover one call"))).toBe("CLAIM_BOUND_MISMATCH");
    expect(settingsCheckRefusalCode(typed("RUN_SETTINGS_VERSION_DRIFT", "RUN_SETTINGS_VERSION_DRIFT:17:18"))).toBe("RUN_SETTINGS_VERSION_DRIFT:17:18");
    expect(settingsCheckRefusalCode(new TypeError("PROVIDER_TARGET_LOOPBACK_REFUSED:development:codex-cli"))).toBe("PROVIDER_TARGET_LOOPBACK_REFUSED:development:codex-cli");
    expect(settingsCheckRefusalCode(new TypeError("Cannot read properties of undefined"))).toBeNull();
    expect(settingsCheckRefusalCode(new TypedDomainError("DATABASE_POOL_FAILED", "x"))).toBeNull();
  });

  it("the steps run in order, each refusal recorded, the next step still run; an untyped error stops the run", async () => {
    const order: string[] = [];
    expect(await runSettingsCheckSteps([
      { name: "a", run: async () => { order.push("a"); throw typed("A_REFUSED"); } },
      { name: "b", run: async () => { order.push("b"); return ["B_FOUND:x"]; } },
      { name: "c", run: async () => { order.push("c"); return []; } }
    ])).toEqual(["A_REFUSED", "B_FOUND:x"]);
    expect(order).toEqual(["a", "b", "c"]);
    await expect(runSettingsCheckSteps([{ name: "x", run: async () => { throw new Error("socket hang up"); } }])).rejects.toThrow("socket hang up");
  });
});

describe("the command: one argument, one line, exit 0 / 1 / 2", () => {
  const output = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, sink: { stdout: (text: string) => { out.push(text); }, stderr: (text: string) => { err.push(text); } } };
  };
  const report = (codes: readonly string[]): SettingsCheckReport =>
    settingsCheckReport({ half: "runner", releaseKey: RELEASE_KEY, version: VERSION, codes, snapshotSha256: SNAPSHOT });

  it.each([[[]], [["0"]], [["018"]], [["-3"]], [["18", "19"]], [["--release-key", "r17-x"]], [["18.5"]], [["99999999999999999"]]])(
    "a bad argument %j exits 2 before anything is opened, with no report line", async (args) => {
      const { out, err, sink } = output();
      const check = vi.fn();
      expect(await runSettingsCheckCommand({ args, output: sink, check })).toBe(2);
      expect(check).not.toHaveBeenCalled();
      expect(out).toEqual([]);
      expect(err.join("")).toMatch(/^SETTINGS_CHECK_USAGE: /u);
    });

  it("PASS exits 0 and FAIL exits 1, each with exactly one stdout line", async () => {
    for (const [codes, exit] of [[[], 0], [["STORY_DAILY_CEILING_INSUFFICIENT"], 1]] as const) {
      const { out, err, sink } = output();
      expect(await runSettingsCheckCommand({ args: ["18"], output: sink, check: async (version) => {
        expect(version).toBe(18);
        return report(codes);
      } })).toBe(exit);
      expect(out).toEqual([settingsCheckLine(report(codes))]);
      expect(err).toEqual([]);
    }
  });

  it("could not check (an unreadable environment, an unreachable database) exits 2 with a content-free reason and no report line", async () => {
    for (const [error, reason] of [
      [new TypeError("RELEASE_KEY_REQUIRED"), "RELEASE_KEY_REQUIRED"],
      [Object.assign(new Error("connect ECONNREFUSED postgres://user:secret@db/x"), { code: "ECONNREFUSED" }), "ECONNREFUSED"],
      [new TypedDomainError("DATABASE_POOL_FAILED", "PostgreSQL pool operation failed: password authentication failed"), "DATABASE_POOL_FAILED"],
      [new TypeError("prose with a secret in it"), "TYPEERROR"]
    ] as const) {
      const { out, err, sink } = output();
      expect(await runSettingsCheckCommand({ args: ["18"], output: sink, check: async () => { throw error; } })).toBe(2);
      expect(out).toEqual([]);
      expect(err).toEqual([`SETTINGS_CHECK_UNAVAILABLE:${reason}\n`]);
      expect(settingsCheckUnavailableReason(error)).toBe(reason);
    }
  });

  it("the argument parser", () => {
    expect(parseSettingsCheckArguments(["18"])).toBe(18);
    expect(parseSettingsCheckArguments(["1"])).toBe(1);
    expect(parseSettingsCheckArguments(["18", "--x"])).toBeNull();
  });
});
