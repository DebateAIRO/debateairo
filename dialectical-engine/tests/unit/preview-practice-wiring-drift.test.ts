// The preview practice tool mirrors two process entry points it cannot call: the runner's preview wiring
// (apps/runner/src/main.ts) and the API's preview ask settings (apps/api/src/main.ts). This test reads both sides and
// fails when the settings main.ts hands WalkingSkeletonRunner / PostgresAskApplication and the settings the practice
// hands them stop matching, so the practice can never silently test a different composition than the one shipped.
// A control proves the reader sees a missing key.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDigestFollowingServeNodes, classifyComposedContent } from "@debateai/runner";
import { buildSynthesisDigest, idShapedTokensIn } from "@debateai/serve";
import { buildStoryMaterial, classifyStoryContent, loadStoryPack, resolveStoryPackDir } from "@debateai/story";
import { buildDevelopmentRunnerRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";
import {
  practiceCandidateStatement,
  practiceCannedStory,
  practiceComposedPostCheck,
  practiceDebateGraph,
  practiceDigestBudgetBound,
  practiceDigestNodes,
  practiceReviewEdges,
  practiceServedNodes,
  practiceStoryPolicy,
  practiceStorySnapshot
} from "../../tools/preview-practice/practice-lanes.js";
import { PRACTICE_QUESTIONS } from "../../tools/preview-practice/practice-questions.js";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

/** Removes comments (line comments only where `//` starts a comment, not inside a string). */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").split("\n").map((line) => {
    let quote: string | null = null;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]!;
      if (quote !== null) { if (char === "\\") index += 1; else if (char === quote) quote = null; continue; }
      if (char === "\"" || char === "'" || char === "`") { quote = char; continue; }
      if (char === "/" && line[index + 1] === "/") return line.slice(0, index);
    }
    return line;
  }).join("\n");
}

/** The text of the balanced group that opens at `open` (inclusive), skipping strings. */
function group(source: string, open: number): string {
  const pairs: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  const stack: string[] = [];
  let quote: string | null = null;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote !== null) { if (char === "\\") index += 1; else if (char === quote) quote = null; continue; }
    if (char === "\"" || char === "'" || char === "`") { quote = char; continue; }
    if (pairs[char] !== undefined) stack.push(pairs[char]!);
    else if (char === "}" || char === ")" || char === "]") {
      if (stack.pop() !== char) throw new Error("unbalanced source");
      if (stack.length === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error("unterminated group");
}

/**
 * The keys an object literal sets: its own top-level keys, plus the keys of every object a top-level conditional
 * spread `...(cond ? { a } : { b })` may add.
 */
export function objectKeys(objectText: string): Set<string> {
  const keys = new Set<string>();
  const body = objectText.slice(1, -1);
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (quote !== null) { if (char === "\\") index += 1; else if (char === quote) quote = null; continue; }
    if (char === "\"" || char === "'" || char === "`") { quote = char; continue; }
    if (depth === 0 && body.startsWith("...(", index)) {
      const spread = group(body, index + 3);
      const inner = spread.slice(1, -1);
      let innerDepth = 0;
      for (let at = 0; at < inner.length; at += 1) {
        const c = inner[at]!;
        if (c === "{" && innerDepth === 0) { const object = group(inner, at); for (const key of objectKeys(object)) keys.add(key); at += object.length - 1; continue; }
        if (c === "(" || c === "[" || c === "{") innerDepth += 1;
        if (c === ")" || c === "]" || c === "}") innerDepth -= 1;
      }
      index += 3 + spread.length - 1;
      continue;
    }
    if (char === "{" || char === "(" || char === "[") { depth += 1; continue; }
    if (char === "}" || char === ")" || char === "]") { depth -= 1; continue; }
    if (depth === 0) {
      // A key (`name:`), a shorthand property (`name,` or the last `name`) or a method (`name(...) {`).
      const match = /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?::|,|$|\()/u.exec(body.slice(index));
      const before = index === 0 ? "," : body.slice(0, index).trimEnd().at(-1);
      if (match !== null && (before === "," || before === "{" || before === undefined)) {
        keys.add(match[1]!);
        index += match[0].length - (match[0].endsWith("(") ? 2 : 1);
      }
    }
  }
  return keys;
}

function objectAfter(source: string, anchor: string): Set<string> {
  const clean = withoutComments(source);
  const at = clean.indexOf(anchor);
  if (at < 0) throw new Error(`anchor not found: ${anchor}`);
  return objectKeys(group(clean, clean.indexOf("{", at + anchor.length - 1)));
}

const RUNNER_MAIN = read("apps/runner/src/main.ts");
const PRACTICE_RUNNER = read("tools/preview-practice/practice-runner-composition.ts");
const API_MAIN = read("apps/api/src/main.ts");
const PRACTICE_ASK = read("tools/preview-practice/practice-ask-composition.ts");
/** Side-by-side spec §13: the one per-version settings loader both runner compositions boot through. */
const RUN_SETTINGS = read("apps/runner/src/run-settings.ts");
/** S6: the debate members' one mapping, its own module (re-exported by run-settings.ts). */
const DEBATE_MEMBERS_MODULE = read("apps/runner/src/run-debate-members.ts");
/** The keys `runnerSettingsOfVersion` returns: the debate members both literals spread. */
const DEBATE_MEMBERS_ANCHOR = "const { policy } = version;\n  return Object.freeze({";
const DEBATE_MEMBERS_SPREAD = "...runnerSettingsOfVersion(siteVersionSettings),";
/** Side-by-side spec §13 (S9): the API's one per-version admission loader both ask compositions boot through. */
const ADMISSION = read("apps/api/src/admission-settings.ts");
/** The keys `admissionSettingsOfVersion` returns: the version's members both ask literals spread. */
const ADMISSION_MEMBERS_ANCHOR = "engineVersionPolicy, questionLanguage } = version;\n  return Object.freeze({";

/**
 * The one setting the practice never passes: `billing` (hosted with billing on). The practice composes the hosted ask
 * too since 2026-10-14 (the room, its waiting line, or the daily guard), but keeps billing off: its throwaway person
 * has bought no plan (practice-ask-composition.ts says why).
 */
const HOSTED_ONLY_ASK_KEYS = new Set(["billing"]);

/** Without comments, every run of white space one space: a statement reads the same however it is wrapped. */
const flat = (source: string) => withoutComments(source).replace(/\s+/gu, " ");

describe("the practice runs the shipped composition (drift guard)", () => {
  it("hands WalkingSkeletonRunner exactly the settings apps/runner/src/main.ts hands it", () => {
    const shipped = objectAfter(RUNNER_MAIN, "new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {");
    const practice = objectAfter(PRACTICE_RUNNER, "new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {");
    // Side-by-side spec §13: both literals take the version's debate members from the one mapping, by the same spread,
    // so the settings each hands the runner are its own keys plus the mapping's.
    for (const source of [RUNNER_MAIN, PRACTICE_RUNNER]) expect(source.split(DEBATE_MEMBERS_SPREAD)).toHaveLength(2);
    const debateMembers = objectAfter(DEBATE_MEMBERS_MODULE, DEBATE_MEMBERS_ANCHOR);
    expect(debateMembers.has("factBundleVersion")).toBe(true);
    expect([...debateMembers].filter((key) => shipped.has(key))).toEqual([]);
    expect(shipped.size + debateMembers.size).toBeGreaterThan(30);
    expect([...practice].sort()).toEqual([...shipped].sort());
  });

  it("hands PostgresAskApplication every preview setting apps/api/src/main.ts hands it", () => {
    const shipped = objectAfter(API_MAIN, "new PostgresAskApplication(pool, dispatcher, {");
    const practice = objectAfter(PRACTICE_ASK, "const runSettings: RunCreationSettings = {");
    // Side-by-side spec §13 (S9): both literals take the site version's members from the one mapping, by the same
    // spread (the practice's pins steer only the rotation's counts), so each hands the application its own keys plus
    // the mapping's; and both hand S10's per-ask read the same mapping of each version.
    expect(API_MAIN.split("...admissionSettingsOfVersion(siteAdmission),")).toHaveLength(2);
    expect(PRACTICE_ASK.split("...practiceMembersOf(admissionSettingsOfVersion(siteAdmission)),")).toHaveLength(2);
    expect(flat(API_MAIN)).toContain("admissionSettingsFor: async (version) => admissionSettingsOfVersion(await admissionCache.admissionSettingsFor(version))");
    expect(flat(PRACTICE_ASK)).toContain("admissionSettingsFor: async (version: number) => practiceMembersOf(admissionSettingsOfVersion(await admissionCache.admissionSettingsFor(version)))");
    const members = objectAfter(ADMISSION, ADMISSION_MEMBERS_ANCHOR);
    expect([...members].sort()).toEqual(["assertDailyCostEnvelope", "debateShapePolicy", "engineVersionPolicy",
      "lengthGuidancePolicy", "modelPicker", "previewBudgetGate", "previewProviderTestConfig", "questionLanguage",
      "registerVersion", "resolveEnvelopeBasis", "resolveRisk", "roleRotation"]);
    expect([...members].filter((key) => shipped.has(key))).toEqual([]);
    expect(shipped.has("admissionSettings")).toBe(true);
    expect([...practice].sort()).toEqual([...shipped].filter((key) => !HOSTED_ONLY_ASK_KEYS.has(key)).sort());
  });

  it("the gateway is wrapped by the preview call policy on both sides, over the guarded fetch", () => {
    for (const source of [RUNNER_MAIN, PRACTICE_RUNNER]) {
      // Addition D16-D18 (SA5): the call policy takes the site version's composed config (its gate part) and reads each
      // call's thinking table from the call's own run's version, with the same option text on both sides.
      expect(source).toContain("withPreviewProviderCallPolicy(gateway, siteVersionSettings.previewConfig!, target");
      expect(source).toContain("thinkingLevelsOf: runPreviewThinkingLevelsOf(runnerSettings, runSettingsVersions, environment.REGISTER_VERSION)");
      expect(source).toContain("...previewTargetGatewayControls(previewGate, target)");
      expect(source).toContain("...providerTargetGatewayControls(target)");
      expect(source).toContain("createPreviewGuardedFetch(");
      // Run resilience (spec 2026-10-12): the runner's sit-out book is the preview's own, on both sides.
      expect(source).toContain("runResilience: previewRunResilience(previewGate)!");
    }
    for (const source of [API_MAIN, PRACTICE_ASK]) {
      expect(source).toMatch(/probeControlsFor: previewProbeControls, fetchImplementation: previewFetch!?, previewRound: true/u);
      // Side-by-side spec §13 (S9): the gate terms are each version's, read by the one admission loader.
      expect(source).not.toContain("readPreviewBudgetGateSettings(");
      expect(source).toContain("loadAdmissionSettings(pool, environment.REGISTER_VERSION, admissionSite");
    }
    expect(ADMISSION).toContain("readers.readPreviewBudgetGateSettings(pool, version, previewConfig,");
  });

  it("W3-6: both hand the runner the same web settings, and neither holds a stand-in for the web plan's store", () => {
    // The step keeps the planner's decision in 0134's store itself (web-step.ts runRunnerWebStep), on the runner's pool.
    const call = (source: string) => withoutComments(source).match(/webSearch: runnerWebSearchSettings\(\{[^}]*\}\)/gu)
      ?.map((text) => text.replace(/\s+/gu, " "));
    // W4-2: both hand in the process's month pause, so searches pause at the month wall as the AI calls do.
    expect(call(RUNNER_MAIN)).toEqual(["webSearch: runnerWebSearchSettings({ pool, previewGate, fetch: previewFetch, "
      + "guardOf: runnerSite.money === null ? null : runCostEnvelopeGuard, pause: monthPause })"]);
    expect(call(PRACTICE_RUNNER)).toEqual(call(RUNNER_MAIN));
    for (const source of [RUNNER_MAIN, PRACTICE_RUNNER]) expect(source).not.toContain("recordPlanPathStatuses");
  });

  it("W3-7: both compose the path rewrite with the one function, the same members, and hand it to the runner the same way", () => {
    const composed = (source: string) => flat(source).match(/const pathRewrite = composePathRewrite\(\{.*?\}\);/gu);
    expect(composed(RUNNER_MAIN)).toEqual(["const pathRewrite = composePathRewrite({ pool, targets: providerTargets, members: "
      + "[providerTopology.primary, ...(providerTopology.critique === undefined ? [] : [providerTopology.critique]), "
      + "...providerTopology.additionalMakers], log: storyLog });"]);
    expect(composed(PRACTICE_RUNNER)).toEqual(composed(RUNNER_MAIN));
    for (const source of [RUNNER_MAIN, PRACTICE_RUNNER]) {
      expect(flat(source)).toContain("...(pathRewrite === undefined ? {} : { pathRewrite: pathRewrite.settings }),");
    }
    // The sweep is a process's: main.ts starts it after its worker; the practice runs one debate and starts none.
    expect(flat(RUNNER_MAIN)).toContain("startPathRewriteSweep({ ...pathRewrite.sweep, paused: () => retirementSignal.claimsStopped() })");
    expect(PRACTICE_RUNNER).not.toContain("startPathRewriteSweep");
  });

  it("parallel AI calls: both build the call scheduler, the busy coordinator, the call subjects, the attempt counter and the keep-alive renewals", () => {
    // Spec 2026-10-12-parallel-calls-design.md §3.2-§3.6: the practice measures the runner the preview runs.
    for (const source of [RUNNER_MAIN, PRACTICE_RUNNER]) {
      const code = withoutComments(source);
      expect(code).toContain("effectiveCallConcurrency(await readCallConcurrencyPolicy(");
      expect(code.match(/createCallScheduler\(/gu) ?? []).toHaveLength(1);
      expect(code.match(/createPreviewBusyCoordinator\(\)/gu) ?? []).toHaveLength(1);
      expect(code).toContain("withPreviewProviderCallPolicy(gateway, siteVersionSettings.previewConfig!, target");
      expect(code).toMatch(/busy: previewBusy/u);
      expect(code).toContain("inFlight: gatewayInFlight");
      expect(code).toContain("previewCallSubjects(previewGate)");
      expect(code).toContain("await applyPreviewGateCapacities({");
      expect(code).toMatch(/renewals: new WorkItemRepository\(/u);
      // Ruling R31 and spec §3.4 (final review): the busy wait before the slot, and the gate marked on its first
      // unsent refusal, on both sides.
      expect(code).toContain("callBeforeSlot: (subject: CallSubject) => previewBusy.admit(subject.model)");
      expect(code).toContain("onGateUnsent: (gate) => { runnerCallScheduler.markGateUnhealthy(gate); }");
      expect(code).toMatch(/gateRemaining: (previewGateRemaining|input\.remaining)/u);
      // Task 4 review fix 1: both sides tell the operator when a final writer is sent as STANDARD.
      expect(code).toMatch(/onFinalWriterTierUnread: (previewFinalWriterTierUnread|finalWriterTierUnread)/u);
    }
    for (const key of ["callScheduler", "callSubjects", "renewals"]) {
      expect(objectAfter(RUNNER_MAIN, "new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {").has(key), key).toBe(true);
    }
  });

  it("run resilience is the preview's alone: main.ts sets runResilience only when the preview config is present", () => {
    // Review 2026-10-12, test gap (f) (ruling R-c: hosted and local unchanged). The one place main.ts sets the
    // runner's runResilience is a spread guarded by the preview config, which only the preview's environment carries.
    const code = withoutComments(RUNNER_MAIN);
    expect(code.match(/\brunResilience\b/gu) ?? []).toHaveLength(1);
    expect(code).toContain("...(previewGate === undefined ? {} : { runResilience: previewRunResilience(previewGate)! })");
    // Addition D14 / ruling R25: "is this the preview?" keys on the env's gate part, present for every accepted form
    // (a sockets-only env leaves PREVIEW_PROVIDER_TEST_CONFIG undefined, which would switch the preview's rules off).
    expect(code).toMatch(/const previewGate = environment\.PREVIEW_GATE_SETTINGS;/u);
    expect(code).not.toContain("PREVIEW_PROVIDER_TEST_CONFIG");
    // Control: the unguarded form is not what ships.
    expect(code).not.toMatch(/^\s*runResilience: previewRunResilience\(previewGate\)!,/mu);
  });

  it("the API's main.ts and the practice ask key the preview on the gate part (addition D14 / ruling R25), never the full config", () => {
    // A sockets-only env leaves PREVIEW_PROVIDER_TEST_CONFIG undefined, which would switch the preview's rules off.
    for (const source of [API_MAIN, PRACTICE_ASK]) {
      const code = withoutComments(source);
      expect(code).not.toContain("PREVIEW_PROVIDER_TEST_CONFIG");
      expect(code).toContain("const previewGate = environment.PREVIEW_GATE_SETTINGS;");
    }
    expect(withoutComments(API_MAIN)).toContain("if (previewGate !== undefined && environment.PUBLIC_APP_URL !== \"https://v3-preview.dezbatere.ro\") {");
  });

  it("both compositions hand the loader the same site context (addition D14-D16), and the practice keys on the gate part", () => {
    const preview = "preview: previewGate === undefined ? undefined : { gate: previewGate, envLineUp: environment.PREVIEW_ENV_LINE_UP ?? null },";
    // Side-by-side spec §13 (S14): both read their site through the ONE function check-version's runner half reads it
    // with (readRunnerSiteContext, run-settings.ts), each handing it its own money in-flight counter; the literal lives
    // there once, so the two cannot drift apart.
    const siteLiteral = objectAfter(RUN_SETTINGS, "const runnerSite: RunnerSiteContext = Object.freeze(");
    // Side-by-side spec §13 (S6): and the claim time, the makers' refs and the money every version's guard shares.
    expect([...siteLiteral].sort()).toEqual(["claim", "configuredMakerRefs", "declaredProviderTargets", "deploymentMode",
      "envelopeBand", "money", "preview", "siteCostEnvelopePolicy", "siteVersion"]);
    const site = flat(RUN_SETTINGS);
    expect(site).toContain("const previewGate = environment.PREVIEW_GATE_SETTINGS;");
    expect(site).toContain(preview);
    expect(site).toContain("siteVersion: environment.REGISTER_VERSION,");
    expect(site).toContain("siteCostEnvelopePolicy: costEnvelopePolicy,");
    expect(site).toContain("claim: { claimMs: environment.CLAIM_MS, claimMarginMs: environment.CLAIM_MARGIN_MS },");
    expect(site).toContain("configuredMakerRefs: runnerConfiguredMakerRefs(declaredProviderTargets),");
    for (const source of [RUNNER_MAIN, PRACTICE_RUNNER]) {
      const code = flat(source);
      expect(code).toMatch(/const \{ site: runnerSite(?:, configuredProviders, billingPlansSealed)? \} = await readRunnerSiteContext\(\{ pool, environment, moneyInFlight \}\);/u);
      expect(code).not.toContain("const runnerSite: RunnerSiteContext = Object.freeze(");
      expect(code).toContain("const siteVersionSettings = await runnerSettings.requireSettings(environment.REGISTER_VERSION);");
    }
    const practiceCode = withoutComments(PRACTICE_RUNNER);
    expect(practiceCode).toContain("const previewGate = environment.PREVIEW_GATE_SETTINGS;");
    expect(practiceCode).not.toContain("PREVIEW_PROVIDER_TEST_CONFIG");
  });


  it("hosted (2026-10-14): the runner's money wiring is main.ts's, statement for statement", () => {
    const shipped = flat(RUNNER_MAIN);
    const practice = flat(PRACTICE_RUNNER);
    // Side-by-side spec §13 (S14): the site's money (its row, band, plans, funding, wall and the money every version's
    // guard shares) is built by the ONE site-reads function both compositions call (readRunnerSiteContext), never by
    // either of them; each creates its two in-flight counters and hands it the money one.
    const siteReads = flat(RUN_SETTINGS.slice(RUN_SETTINGS.indexOf("export async function readRunnerSiteContext("),
      RUN_SETTINGS.indexOf("export async function declaredContractHashRefusals(")));
    for (const statement of [
      "const costEnvelopePolicy = environment.DEPLOYMENT_MODE === \"hosted\" ? await readCostEnvelopePolicy(pool, environment.REGISTER_VERSION) : null;",
      "const modelSpendStore = new PostgresModelSpendStore(pool);",
      "const envelopeBand = costEnvelopePolicy === null ? null : costEnvelopeBand(costEnvelopePolicy);",
      "const billingPlans = costEnvelopePolicy === null ? null : await readBillingPlans(pool, environment.REGISTER_VERSION);",
      // Side-by-side spec §9: the funding repository holds no register version (a grant lives under its own).
      "const allowances = new PostgresInternalAllowanceRepository(pool);",
      // Side-by-side spec §9: no funding read and no funding refusal at boot; the funding source is built whenever plans are.
      "const fundingAllowance = billingPlans === null ? undefined : new FundingAwarePersonAllowanceSource({ allowances,entitlements:{...fundingEntitlements.readOnlyPort(),readRunFundingBasis:(runId)=>fundingEntitlements.readRunFundingBasis(runId)}, plans:billingPlans,closeBasisPoints:envelopeBand?.closeBasisPoints ?? 10000 });",
      "finishBasisPoints: envelopeBand === null ? null : envelopeBand.finishBasisPoints, persons: billingPlans === null ? plansUnresolvedPersonAllowance() : fundingAllowance ?? new BillingPersonAllowanceSource({ entitlements: new EntitlementRepository(pool).readOnlyPort(), plans: billingPlans, closeBasisPoints: envelopeBand === null ? 10_000 : envelopeBand.closeBasisPoints }), owners: modelSpendStore",
      // Side-by-side spec §13 (S6): the money every version's guard shares (RunnerSiteContext.money): local mode none.
      "money: costEnvelopePolicy === null ? null : Object.freeze({ store: modelSpendStore, inFlight: moneyInFlight, ...(sharedWallTerms === null ? {} : { sharedWall: sharedWallTerms }), ...(fundingAllowance === undefined ? {} : { fundingAdmission: fundingAllowance }) })"
    ]) {
      expect(siteReads, statement).toContain(statement);
      expect(shipped, statement).not.toContain(statement);
      expect(practice, statement).not.toContain(statement);
    }
    for (const statement of [
      "assertHostedCostEnvelopesSealed(environment.DEPLOYMENT_MODE);",
      "const gatewayInFlight = createRunInFlight();",
      "const moneyInFlight = createRunInFlight();",
      "await readRunnerSiteContext({ pool, environment, moneyInFlight });",
      // Side-by-side spec §13 (S6): the run → version map, and each call's own run's version's guard; a story seam
      // whenever hosted (a version without a story ceiling refuses inside its guard, STORY_ENVELOPE_MISSING).
      "const runSettingsVersions = createRunSettingsVersions();",
      "const runCostEnvelopeGuard = runCostEnvelopeGuardOf(runnerSettings, runSettingsVersions);",
      // Owner answer F4 (2026-10-30, task W2-2): both seams charge at the vendor's real prices on the preview.
      "const price = previewTargetChargePrice(previewGate !== undefined, target, providerTargetPrice(target));",
      "if (runnerSite.money !== null && price === null) { throw new TypeError(`PROVIDER_TARGET_PRICE_REQUIRED:${target.providerRef}`); }",

      // Plan 2026-10-30 dig-model revision W3-2 (the owner's money rule): the month pause on a walled call, and a dig's
      // path rewrite on its own never-walled seam, in both compositions alike.
      "const monthPause = new MonthPause({ store: new PostgresDigModelRunnerRepository(pool) });",
      "...(runnerSite.money === null || price === null ? {} : { buildCostEnvelopeSeam: (runId: string, phase: CostEnvelopePhase, sharedWall: SharedWallApplication) => monthPaused(runCostEnvelopeGuard(runId).providerSeam({ runId, price, requireReportedUsage: true, phase, sharedWall }), { runId, phase, sharedWall, pause: monthPause, plannedMicros: () => runCostEnvelopeGuard(runId).bodyMicrosLeft(runId) }), buildStoryCostEnvelopeSeam: (runId: string) => runCostEnvelopeGuard(runId).storySeam({ runId, price, requireReportedUsage: true }), buildPathRewriteCostEnvelopeSeam: (runId: string) => runCostEnvelopeGuard(runId).pathRewriteSeam({ runId, price, requireReportedUsage: true }), buildInvestigationReportCostEnvelopeSeam: (runId: string) => runCostEnvelopeGuard(runId).investigationReportSeam({ runId, price, requireReportedUsage: true }) })",
      "settingsForVersion: (version) => runnerSettings.settingsFor(version),",
      "hosted: environment.DEPLOYMENT_MODE === \"hosted\",",
      "providerPrices: buildProviderPriceMap(providerTargets, environment.DEPLOYMENT_MODE),",
      "structureRepairCeiling: previewStructureRepairCeiling(structureRepairRoute),",
      "bodyCostFallback: envelopeBand !== null,"
    ]) {
      expect(shipped, statement).toContain(statement);
      expect(practice, statement).toContain(statement);
    }
    for (const gone of ["allowances.readPolicy()", "\"INTERNAL_FUNDING_UNAVAILABLE\"", "new CostEnvelopeGuard(", "storyCeilingMicros",
      "costEnvelopeGuard."]) {
      expect(shipped, gone).not.toContain(gone);
      expect(practice, gone).not.toContain(gone);
      expect(siteReads, gone).not.toContain(gone);
    }
    // Side-by-side spec §13: B9's run ceiling against one call is the version's, checked by the one loader both
    // compositions boot through (over the version's per-run ceiling and the site's day and band), never inline.
    for (const source of [shipped, practice]) {
      expect(source).not.toContain("assertRunCeilingCoversOneCall(");
      expect(source).not.toContain("firstPositionCallProjections(");
    }
    const loader = flat(RUN_SETTINGS);
    for (const statement of [
      "const debateEnvelope = siteCostEnvelopePolicy === null ? null : composeDebateCostEnvelope(siteCostEnvelopePolicy, await readCostEnvelopePolicy(pool, version)); if (debateEnvelope !== null && envelopeBand !== null) { const firstCalls = firstPositionCallProjections({ targets: declaredProviderTargets,",
      "bodyCeilingMicros: costEnvelopeCeilings(debateEnvelope).bodyMicros,",
      // Side-by-side spec §13 (S6): each version's guard, over the site's one store, counter and wall.
      "store: money.store, policy: costEnvelopeGuardPolicy(debateEnvelope, storyPolicy), ...(money.sharedWall === undefined ? {} : { sharedWall: money.sharedWall }), ...(money.fundingAdmission === undefined ? {} : { fundingAdmission: money.fundingAdmission }), inFlight: money.inFlight"
    ]) expect(loader, statement).toContain(statement);
    // The local-only refusal is gone; local mode builds no guard: the site reads give it no money (S14: the practice's
    // own money composition is gone, it reads the site as main.ts does).
    expect(practice).not.toContain("PRACTICE_REQUIRES_LOCAL_MODE");
    expect(practice).not.toContain("composePracticeRunnerMoney");
    expect(siteReads).toContain("const costEnvelopePolicy = environment.DEPLOYMENT_MODE === \"hosted\"");
  });

  it("hosted (2026-10-14): the ask's money stages are main.ts's, and the room gets main.ts's options but the funding", () => {
    const shipped = flat(API_MAIN);
    const practice = flat(PRACTICE_ASK);
    // Side-by-side spec §13 (S9): the site's money row and the room's boot questions before the admission loader; the
    // per-version money (the run's ceiling, the story's reserve, the daily guard, the estimator) is the loader's; the
    // room after it, over the site version's estimator and each version's own.
    for (const statement of [
      "assertHostedSupportAdmissionSealed(environment.DEPLOYMENT_MODE, admissionPolicy);",
      // S14 (ruling R57): the room's boot questions are one decision (decideAskRoomReadiness), asked by both of the same
      // rows; a missing band (null) checks the waiting line on both.
      "decideAskRoomReadiness({ envelope: siteCostEnvelopePolicy, admission: admissionPolicy, policy: await readBillingPolicy(pool, environment.REGISTER_VERSION), plans: await readBillingPlans(pool, environment.REGISTER_VERSION) });",
      "if (readiness === null) { const stranded = await new RunWaitRepository(pool).countWaiting();",
      "estimatorFor: async (version) => (await admissionCache.admissionSettingsFor(version)).estimator!,",
      "closeBasisPoints: band.closeBasisPoints, waitingLinePerPerson: band.waitingLinePerPerson",
      "...(askRoom === undefined ? {} : { room: askRoom, waitingLine: askRoom }),",
      // Side-by-side spec §13 (S14): both build the site context with the one builder check-version's API half uses.
      "buildAdmissionSiteContext({ pool, environment, declaredProviderTargets,",
      "const admissionCache = createAdmissionSettingsCache({ load: (version) => loadAdmissionSettings(pool, version, admissionSite), seed: siteAdmission });",
      "createActiveSettingsVersionReader({ pool, siteVersion: environment.REGISTER_VERSION,",
      "if (estimator === null) throw new TypeError(\"ASK_ROOM_ESTIMATOR_REQUIRED\");",
      // Fresh-site estimate (owner rulings 2026-10-22, merge of PR #212): the sealed starting figures, a SITE row read
      // from the site version and handed to the loader in the site context (every version's estimator starts from it).
      "readCostEstimateStartPolicy(pool, environment.REGISTER_VERSION)"
    ]) {
      expect(shipped, statement).toContain(statement);
      expect(practice, statement).toContain(statement);
    }
    // The room's estimator is the site version's (the loader's), on both sides.
    expect(shipped).toContain("const estimator = siteAdmission.estimator;");
    expect(practice).toContain("estimator: siteAdmission.estimator,");
    for (const gone of ["new CostEnvelopeGuard(", "costEnvelopeRows", "readStoryPolicyFromRegister(", "assertRunCeilingCoversOneCall(",
      "mostOneRunMaySpendMicros(", "new RecentRunsCostEstimator("]) {
      expect(shipped, gone).not.toContain(gone);
      expect(practice, gone).not.toContain(gone);
    }
    const loader = flat(ADMISSION);
    for (const statement of [
      // S14: what the site builder derives, once, for main.ts, the practice and the check.
      "preview: previewGate === undefined ? undefined : { gate: previewGate, envLineUp: environment.PREVIEW_ENV_LINE_UP ?? null },",
      "siteVersion: environment.REGISTER_VERSION,",
      "prices: buildApiProviderPriceMap(declaredProviderTargets, environment.DEPLOYMENT_MODE),",
      "billingEnabled: (input.askRoomReadiness?.billingPlans ?? null) !== null,",
      "const billingPlans = assertBillingReady({ policy: input.policy, plans: input.plans, envelope: input.envelope }); const band = costEnvelopeBand(input.envelope); if (band === null) return null; assertAskRoomAdmissionSealed({ envelope: input.envelope, admission: input.admission });",
      "const runPolicy = composeDebateCostEnvelope(siteEnvelope.runPolicy, await readers.readCostEnvelopePolicy(pool, version));",
      "const guardPolicy = costEnvelopeGuardPolicy(runPolicy, storyPolicy);",
      "dailyGuard: site.spend === null ? null : new CostEnvelopeGuard({ store: site.spend, policy: guardPolicy }),",
      "maximumMicros: mostOneRunMaySpendMicros(guardPolicy)",
      // Fresh-site estimate (merge of PR #212): every version's estimator starts from the SITE's row.
      "start: site.costEstimateStart",
      "perRunCeilingMicros: costEnvelope?.guardPolicy.perRunCeilingMicros ?? null,",
      "moneyPolicy: costEnvelope?.guardPolicy ?? null,",
      "bodyCeilingMicros: costEnvelopeCeilings(costEnvelope.runPolicy).bodyMicros,",
      "ownRosterOnly: site.billingEnabled ? [\"free\"] : []"
    ]) expect(loader, statement).toContain(statement);
    // The two site contexts, built by the one builder (S14): the same inputs, but the practice's forwarded "what is left"
    // seam (the file's head says why); the builder's own literal names every member of the context.
    const shippedSite = objectAfter(API_MAIN, "const admissionSite: AdmissionSiteContext = boot.runSync(\"admission-site\", () => buildAdmissionSiteContext(");
    const practiceSite = objectAfter(PRACTICE_ASK, "const admissionSite: AdmissionSiteContext = buildAdmissionSiteContext(");
    expect([...shippedSite].sort()).toEqual(["askRoomReadiness", "costEstimateStartPolicy", "declaredProviderTargets", "environment",
      "log", "pool", "questionLanguage", "siteCostEnvelopePolicy"]);
    expect([...practiceSite].sort()).toEqual([...shippedSite, "previewRemaining"].sort());
    const builtSite = objectAfter(ADMISSION, "  const previewGate = environment.PREVIEW_GATE_SETTINGS;\n  return Object.freeze(");
    expect([...builtSite].sort()).toEqual(["billingEnabled", "costEstimateStart", "declaredProviderTargets", "deploymentMode", "log", "preview",
      "previewRemaining", "prices", "questionLanguage", "recentRunUsage", "siteCostEnvelope", "siteVersion", "spend"]);
    // Side-by-side spec §9 (C17): neither ask composition reads the funding selection at boot or refuses boot over it.
    // main.ts builds the funding source whenever billing is on; the practice keeps billing off, so it builds none.
    for (const gone of ["allowances.readPolicy()", "The configured funding selection is mismatched", "Internal funding requires hosted billing"]) {
      expect(shipped, gone).not.toContain(gone);
      expect(practice, gone).not.toContain(gone);
    }
    expect(shipped).toContain("const fundedAllowance = entitlements === null || billingPlans === null ? undefined : new FundingAwarePersonAllowanceSource({allowances:new PostgresInternalAllowanceRepository(pool),entitlements,plans:billingPlans,closeBasisPoints:band.closeBasisPoints});");
    expect(practice).not.toContain("PostgresInternalAllowanceRepository");
    expect(practice).not.toContain("FundingAwarePersonAllowanceSource");
    const shippedRoom = objectAfter(API_MAIN, "const room = new AskRoom({");
    const practiceRoom = objectAfter(PRACTICE_ASK, "const room = new AskRoom({");
    expect(shippedRoom.has("funding")).toBe(true);
    expect(shippedRoom.has("estimatorFor")).toBe(true);
    expect([...practiceRoom].sort()).toEqual([...shippedRoom].filter((key) => key !== "funding").sort());
    // Billing kept off: the room has no person allowance, no entitlements and no plans; the ask has no `billing`. The
    // loader's picker and run ceiling read the register's own billing state through the room's readiness answer, as
    // main.ts's (S14: the site builder derives the switch from it).
    expect(practice).toContain("const billingPlans = null;");
    expect(practice).toContain("const entitlements = null;");
    expect(practice).toContain("const personAllowance = NO_PERSON_ALLOWANCE;");
    expect(practice).toContain("askRoomReadiness: money === null ? null : money.readiness,");
    expect(shipped).toContain("askRoomReadiness: askRoomReadiness ?? null,");
    expect(objectAfter(PRACTICE_ASK, "const runSettings: RunCreationSettings = {").has("billing")).toBe(false);
  });

  it("hosted and local alike: the debate shape and the question language are wired as the two main.ts files wire them", () => {
    // The merge of #165 into the debate-shape branch: the hosted compositions read the shape row (and its map hash) and
    // price the first call with the locked language exactly as main.ts does, in both modes.
    const runnerMain = flat(RUNNER_MAIN);
    const practiceRunner = flat(PRACTICE_RUNNER);
    const loader = flat(RUN_SETTINGS);
    // Side-by-side spec §13: the shape and engine reads are the one loader's, for the version it loads; neither
    // composition reads them itself, and both boot through the loader, in both modes.
    const shapeRead = "const debateShape = await readDebateShapeRunnerSettings(pool, version);";
    expect(loader.split(shapeRead)).toHaveLength(2);
    // Engine redesign (R1d Task 5): the runner's engine boot read, in both modes, after the shape's.
    const engineRead = "const engine = await readEngineRunnerSettings(pool, version);";
    expect(loader.split(engineRead)).toHaveLength(2);
    expect(loader.indexOf(engineRead)).toBeGreaterThan(loader.indexOf(shapeRead));
    expect(loader).toContain("questionLanguageLocked: debateShape !== null");
    const boot = "const siteVersionSettings = await runnerSettings.requireSettings(environment.REGISTER_VERSION);";
    for (const source of [runnerMain, practiceRunner]) {
      expect(source).not.toContain("readDebateShapeRunnerSettings(");
      expect(source).not.toContain("readEngineRunnerSettings(");
      expect(source).not.toContain("questionLanguageLocked");
      expect(source).toContain("load: (version) => loadRunnerVersionSettings(pool, version, runnerSite");
      expect(source).toContain(boot);
    }
    // Side-by-side spec §13 (S6, S14): the site's money (the site rows only) is read BEFORE the loader by the one site
    // reads both compositions call: the loader builds each version's guard over it.
    for (const source of [runnerMain, practiceRunner]) {
      const siteRead = source.indexOf("await readRunnerSiteContext({ pool, environment, moneyInFlight });");
      expect(siteRead).toBeGreaterThan(-1);
      expect(siteRead).toBeLessThan(source.indexOf(boot));
    }
    const apiMain = flat(API_MAIN);
    const practiceAsk = flat(PRACTICE_ASK);
    // Side-by-side spec §13 (S9): the shape, engine and question-language reads are the API's one admission loader's,
    // for the version it loads; both ask compositions load through it and hand it their own question-language route.
    const admission = flat(ADMISSION);
    expect(admission).toContain("questionLanguageLocked: debateShapeInForcePolicy !== null");
    // Engine redesign (R1d Task 6): the row in force for the ask side.
    expect(admission).toContain("const engineInForcePolicy = engineInForce(engineVersionPolicy);");
    expect(admission).toContain("const debateShapeInForcePolicy = debateShapeInForce(debateShapePolicy);");
    expect(admission).toContain("const questionLanguage = debateShapeInForcePolicy === null ? undefined : await run(\"question-language\"");
    expect(admission).toContain("route: await site.questionLanguage.routeFor({ policy, dayCeilingMicros: costEnvelope?.guardPolicy.dailyCeilingMicros ?? null }),");
    for (const source of [apiMain, practiceAsk]) {
      expect(source).not.toContain("questionLanguageLocked");
      expect(source).not.toContain("readDebateShapePolicy(");
      expect(source).not.toContain("readEngineVersionPolicy(");
      expect(source).toContain("loadAdmissionSettings(pool, environment.REGISTER_VERSION, admissionSite");
    }
    // Each hands the loader its own route: the practice its forwarded socket; main.ts the site's one route decision
    // (S14, ruling R57: questionLanguageSiteRoute, which check-version's API half calls too).
    expect(practiceAsk).toContain("questionLanguageRouteFor({");
    expect(apiMain).toContain("questionLanguageSiteRoute({");
  });

  it("one release key (side-by-side §1, §3): the practice's runner runs as, and its ask stamps runs with, settings.runner.RELEASE_KEY", () => {
    // The practice composes its runner in this process, so no RELEASE_KEY is booted: parsePracticeSettings derives the
    // one key (a RELEASE_KEY line, else the checkout's revision, else locally the development key). A runner fenced by
    // one key never claims a run stamped with another (NO_WORK), so the ask may read no other derivation.
    const runner = withoutComments(PRACTICE_RUNNER);
    expect(runner).toContain("releaseKey: environment.RELEASE_KEY,");
    expect(runner).toContain("renewals: new WorkItemRepository(input.keepAlivePool, { releaseKey: environment.RELEASE_KEY, workerId: environment.RUNNER_WORKER_ID })");
    const ask = withoutComments(PRACTICE_ASK);
    expect(ask).not.toContain("developmentReleaseKey(");
    // Two stamps, so the loop below cannot pass on none: the admission gate's key and the run's stamp.
    const stamps = ask.match(/\breleaseKey:[^,\n}]*/gu) ?? [];
    expect(stamps).toHaveLength(2);
    for (const stamp of stamps) expect(stamp).toBe("releaseKey: settings.runner.RELEASE_KEY");
  });

  it("control: the reader sees a key that is missing", () => {
    const shipped = objectKeys("{ a: 1, ...(x ? {} : { b: 2, c: { d: 3 } }), e: f(g, { h: 1 }), m(n: string) { return { o: n }; }, i }");
    expect([...shipped].sort()).toEqual(["a", "b", "c", "e", "i", "m"]);
    // And on the real files: the practice without one of its settings no longer matches main.ts.
    const anchor = "new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {";
    const trimmed = objectAfter(PRACTICE_RUNNER.replace("bodyCostFallback: envelopeBand !== null,", ""), anchor);
    expect(trimmed.has("bodyCostFallback")).toBe(false);
    expect(objectAfter(RUNNER_MAIN, anchor).has("bodyCostFallback")).toBe(true);
    expect(objectAfter(API_MAIN, "new PostgresAskApplication(pool, dispatcher, {").has("resolveDiscoveredPanel")).toBe(true);
    expect(objectAfter(ADMISSION, ADMISSION_MEMBERS_ANCHOR).has("resolveRisk")).toBe(true);
    expect(objectKeys("{ resolveRisk(a: string, b: string) { return { c: a }; } }")).toEqual(new Set(["resolveRisk"]));
  });
});

/*
 * The formats mode's jobs must see the context the runner gives the same job in production. On 2026-10-11 the
 * writer's citation check was handed only the served root (`servedNodes: [{ nodeId: "position:a" }]`), while the
 * runner lets a draft cite every argued point (buildDigestFollowingServeNodes): Haiku's correct drafts citing the
 * surviving objection were refused (COMPOSED_REF_NOT_IN_DIGEST@segments.1.node_refs.0), a false fail. These pins keep
 * the lanes on the runner's own builders and rules.
 */
describe("preview practice lanes: the jobs see the runner's context", () => {
  const RUNNER = withoutComments(read("apps/runner/src/index.ts"));
  const LANES = withoutComments(read("tools/preview-practice/practice-lanes.ts"));
  const q = PRACTICE_QUESTIONS[0]!;
  const graph = practiceDebateGraph(q);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
  const digest = (() => {
    const outcome = buildSynthesisDigest({ nodes: practiceDigestNodes(graph), servedRootNodeId: graph.servedRootNodeId,
      budgetBound: practiceDigestBudgetBound() });
    if (outcome.kind !== "DIGEST") throw new Error("no digest");
    return outcome.digest;
  })();
  const objection = graph.authored.find((node) => !graph.positionNodeIds.has(node.nodeId))!;
  const draft = (refs: readonly string[], ids = ["segment:verdict", "segment:objection"]) => JSON.stringify({ segments: [
    { segment_id: ids[0], text: "Free central buses are worth trying.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
    { segment_id: ids[1], text: "The cost objection stays open.", node_refs: refs, served_number_refs: [] }
  ] });
  const exemptTokens = idShapedTokensIn([q.questionLine, ...graph.authored.map((node) => node.statement)]);

  it("the runner builds the writer's citable set with buildDigestFollowingServeNodes and hands that set to its classifier", () => {
    expect(RUNNER).toMatch(/const servedNodes = buildDigestFollowingServeNodes\(\{\s*authored: authoredNodeList,\s*servedRootNodeId: servedRoot\.nodeId\s*\}\)/u);
    // All-steps format robustness (2026-10-12): the classifier is remembered (rememberingAcceptedReply), with the same set.
    expect(RUNNER).toMatch(/rememberingAcceptedReply\(\(content, reply\) => classifyComposedContent\(content, \{\s*digest: request\.digest,\s*servedNodes,/u);
    // The practice takes the same function, never a hand-written set.
    expect(LANES).toContain("buildDigestFollowingServeNodes({");
    expect(LANES).not.toMatch(/servedNodes: \[/u);
  });

  it("the practice's citable set is every argued point, the served root alone load-bearing (as the runner's)", () => {
    const served = practiceServedNodes(graph);
    expect(served.map((node) => node.nodeId).sort()).toEqual(graph.authored.map((node) => node.nodeId).sort());
    expect(served.filter((node) => node.loadBearing).map((node) => node.nodeId)).toEqual([graph.servedRootNodeId]);
  });

  it("the writer's check accepts a draft citing the surviving objection; the old root-only set refused it", () => {
    const content = draft([objection.nodeId]);
    expect(classifyComposedContent(content, { digest, servedNodes: practiceServedNodes(graph), exemptTokens }))
      .toMatchObject({ parseStatus: "PARSED" });
    const old = classifyComposedContent(content, { digest, servedNodes: [{ nodeId: graph.servedRootNodeId }], exemptTokens });
    expect(old.parseStatus).toBe("SCHEMA_FAILED");
    expect(old.parseError).toContain("COMPOSED_REF_NOT_IN_DIGEST");
    expect(practiceComposedPostCheck(content, { digest, servedRootNodeId: graph.servedRootNodeId, servedNodes: practiceServedNodes(graph) }))
      .toBeNull();
  });

  it("node ids are UUIDs as in production, so a draft that repeats one in its prose is refused as there", () => {
    for (const node of digest.nodes) expect(node.nodeId).toMatch(UUID);
    const naming = JSON.stringify({ segments: [{ segment_id: "segment:verdict", text: `Point ${objection.nodeId} stays open.`,
      node_refs: ["primary"], served_number_refs: [] }] });
    const classified = classifyComposedContent(naming, { digest, servedNodes: practiceServedNodes(graph), exemptTokens });
    expect(classified.parseStatus).toBe("SCHEMA_FAILED");
    expect(classified.parseError).toContain("COMPOSED_TEXT_NAMES_A_NODE");
  });

  it("the runner's reading after the format check: reserved and repeated segment ids end the writer's run (the practice too)", () => {
    expect(RUNNER).toContain('if (segment.segment_id === "memory:disclosure") {');
    expect(RUNNER).toContain('if (new Set(segments.map((segment) => segment.segmentId)).size !== segments.length) {');
    expect(RUNNER).toMatch(/assertedNodeRefs: Object\.freeze\(segment\.node_refs\.map\(\(ref\) => composedNodeIdOf\(\{/u);
    const context = { digest, servedRootNodeId: graph.servedRootNodeId, servedNodes: practiceServedNodes(graph) };
    expect(practiceComposedPostCheck(draft([], ["memory:disclosure", "segment:objection"]), context)).toBe("COMPOSITION_CONTRACT_ERROR");
    expect(practiceComposedPostCheck(draft([], ["segment:same", "segment:same"]), context)).toBe("COMPOSITION_CONTRACT_ERROR");
  });

  it("a surviving objection carries an attack arrow (the runner's rule), and two maker positions exist", () => {
    for (const node of practiceDigestNodes(graph).filter((entry) => entry.isSurvivingObjection)) {
      expect(node.polarityRelations.some((relation) => relation.polarity === "attack")).toBe(true);
    }
    expect(RUNNER).toMatch(/isSurvivingObjection: strengthByNodeId\.has\(node\.nodeId\)\s*&& materialised\.arrows\.some\(\(arrow\) => arrow\.sourceNodeId === node\.nodeId && arrow\.polarity === "attack"\)/u);
    expect(graph.positionNodeIds.size).toBeGreaterThanOrEqual(2);
  });

  it("the digest's byte budget is the sealed high tier's composition bundle budget", async () => {
    const row = (await buildDevelopmentRunnerRegisterRows()).find((entry) => entry.rowKey === "compositionBundleBudget");
    expect((row?.value as { high?: number } | undefined)?.high).toBe(practiceDigestBudgetBound());
  });

  it("the checker reads a written draft joined as serve joins it, never a bare position", () => {
    expect(read("packages/serve/src/index.ts")).toContain('readCandidateStatement: (candidate) => candidate.map((segment) => segment.text).join("\\n")');
    expect(practiceCandidateStatement(q).split("\n")).toHaveLength(2);
    expect(practiceCandidateStatement(q)).not.toBe(q.position);
  });

  it("the checker's verdict is read with the runner's own mapping (evaluatorVerdictOf)", () => {
    const mapping = (source: string, anchor: string) => {
      const at = source.indexOf(anchor);
      expect(at).toBeGreaterThanOrEqual(0);
      const criteria = source.indexOf("criteria: Object.freeze(", at);
      return group(source, source.indexOf("(", criteria)).replace(/\s+/gu, " ");
    };
    expect(mapping(LANES, "export function practiceEvaluatorVerdictOf"))
      .toBe(mapping(RUNNER, "const evaluatorVerdictOf = (content: string): EvaluatorVerdict =>"));
    // All-steps format robustness (2026-10-12): both read the accepted reply as its classifier read it.
    expect(RUNNER).toMatch(/const evaluatorVerdictOf = \(content: string\): EvaluatorVerdict => \{\s*const parsed = parseEvaluatorOutput\(content, checkerReading\.acceptedAs\(content\)\.reply\);\s*return assertEvaluatorVerdict\(/u);
    expect(LANES).toMatch(/const parsed = parseEvaluatorOutput\(content, reply\);\s*assertEvaluatorVerdict\(/u);
    expect(LANES).toContain("practiceEvaluatorVerdictOf(response.content, reading.acceptedAs(response.content).reply)");
  });

  it("the answer writer's and checker's calls carry the runner's own classifier and repair packet (all-steps format robustness)", () => {
    // The preview's one repair try is given only to a call with its own content check AND repair packet: without the
    // runner's packet the practice would never exercise the second try the app makes.
    expect(RUNNER).toContain("classifyContent: writerReading.classifyContent,\n            buildRepairPacket: (rejected) => buildComposedRepairPacket(framed, rejected)");
    expect(RUNNER).toContain("classifyContent: checkerReading.classifyContent,\n            buildRepairPacket: (rejected) => buildSchemaRepairPacket(framed, rejected)");
    expect(LANES).toContain("classifyContent: reading.classifyContent,\n        buildRepairPacket: (rejected) => buildComposedRepairPacket(framed, rejected)");
    expect(LANES).toContain("classifyContent: reading.classifyContent,\n        buildRepairPacket: (rejected) => buildSchemaRepairPacket(framed, rejected)");
    expect(RUNNER).toMatch(/const writerReading = rememberingAcceptedReply\(\(content, reply\) => classifyComposedContent\(content, \{/u);
    expect(LANES).toMatch(/const reading = rememberingAcceptedReply\(\(content, reply\) => classifyComposedContent\(content, \{/u);
    // Reply language (2026-10-12): both check the objection against the question's language.
    // Question language (P2L Task 17): the runner's reading also carries a shaped run's lock (null on today's run).
    expect(RUNNER).toContain("const checkerReading = rememberingAcceptedReply((content, reply) => classifyEvaluatorContent(content, reply, run.questionLine, shapeLanguage));");
    expect(LANES).toContain("const reading = rememberingAcceptedReply((content, reply) => classifyEvaluatorContent(content, reply, q.questionLine));");
    // R15 into dev (2026-10-13): the writer's classifier also carries Problem 7's wording index (no scores or engine
    // codes in the prose), so both pins now hold the wording member before the question line.
    // Question language (P2L Task 17): and, after the question line, a shaped run's lock (absent on today's run).
    expect(RUNNER).toMatch(/exemptTokens: personIdTokens,\s*wording: writerWording,\s*questionLine: run\.questionLine,\s*\.\.\.shapeLanguageInput\s*\}, reply\)\);/u);
    expect(LANES).toMatch(/wording: synthesisWordingIndex\(\{ request, personTexts \}\),\s*questionLine: q\.questionLine\s*\}, reply\)\);/u);
  });

  it("the story snapshot comes from the runner's own builder, and the story must give each position its own path", () => {
    expect(LANES).toContain('import { buildStoryRunSnapshot } from "../../apps/runner/src/story-snapshot.js";');
    expect(LANES).not.toMatch(/judgeArtifactRefs: new Map/u);
    const pack = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
    const snapshot = practiceStorySnapshot({ question: q, runId: "11111111-0000-4000-8000-000000000001",
      workItemId: "11111111-0000-4000-8000-000000000002" });
    expect("resolveProvider" in snapshot || "stepLease" in snapshot || "costFallback" in snapshot).toBe(false);
    const built = buildStoryMaterial({ snapshot: snapshot as never, enrichment: new Map(),
      budgetBytes: practiceStoryPolicy().materialBudget.high, shapeIds: new Set(pack.shapes.map((shape) => shape.id)) });
    if (built.kind !== "OK") throw new Error("material too large");
    expect(built.index.positionIds.size).toBe(2);
    const canned = practiceCannedStory(pack, q);
    expect(classifyStoryContent(canned, built.index)).toMatchObject({ parseStatus: "PARSED" });
    const onePath = JSON.parse(canned) as { short: { paths: unknown[] } };
    onePath.short.paths = onePath.short.paths.slice(0, 1);
    const refused = classifyStoryContent(JSON.stringify(onePath), built.index);
    expect(refused.parseStatus).not.toBe("PARSED");
    expect(refused.parseError).toContain("STORY_POSITION_COVERAGE");
  });

  it("the review job is asked with no edge (a root), two (a cross-root response) and one (an expansion point)", () => {
    expect(new Set([1, 2, 3].map((sample) => practiceReviewEdges(q, sample).length))).toEqual(new Set([0, 1, 2]));
    expect(practiceReviewEdges(q, 2).map((edge) => edge.polarity).sort()).toEqual(["attack", "support"]);
  });

  it("control: the root-only set is what the pins refuse", () => {
    expect("servedNodes: [{ nodeId: \"position:a\" }]").toMatch(/servedNodes: \[/u);
  });
});
