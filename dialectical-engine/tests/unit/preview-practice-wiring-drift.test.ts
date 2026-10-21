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

/**
 * The one setting the practice never passes: `billing` (hosted with billing on). The practice composes the hosted ask
 * too since 2026-10-14 (the room, its waiting line, or the daily guard), but keeps billing off: its throwaway person
 * has bought no plan (practice-ask-composition.ts says why).
 */
const HOSTED_ONLY_ASK_KEYS = new Set(["billing"]);

describe("the practice runs the shipped composition (drift guard)", () => {
  it("hands WalkingSkeletonRunner exactly the settings apps/runner/src/main.ts hands it", () => {
    const shipped = objectAfter(RUNNER_MAIN, "new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {");
    const practice = objectAfter(PRACTICE_RUNNER, "new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {");
    expect(shipped.size).toBeGreaterThan(30);
    expect([...practice].sort()).toEqual([...shipped].sort());
  });

  it("hands PostgresAskApplication every preview setting apps/api/src/main.ts hands it", () => {
    const shipped = objectAfter(API_MAIN, "new PostgresAskApplication(pool, dispatcher, {");
    const practice = objectAfter(PRACTICE_ASK, "const runSettings: RunCreationSettings = {");
    expect(shipped.has("previewBudgetGate")).toBe(true);
    expect([...practice].sort()).toEqual([...shipped].filter((key) => !HOSTED_ONLY_ASK_KEYS.has(key)).sort());
  });

  it("the gateway is wrapped by the preview call policy on both sides, over the guarded fetch", () => {
    for (const source of [RUNNER_MAIN, PRACTICE_RUNNER]) {
      expect(source).toContain("withPreviewProviderCallPolicy(gateway, previewConfig, target");
      expect(source).toContain("...previewTargetGatewayControls(previewConfig, target)");
      expect(source).toContain("...providerTargetGatewayControls(target)");
      expect(source).toContain("createPreviewGuardedFetch(");
      // Run resilience (spec 2026-10-12): the runner's sit-out book is the preview's own, on both sides.
      expect(source).toContain("runResilience: previewRunResilience(previewConfig)!");
    }
    for (const source of [API_MAIN, PRACTICE_ASK]) {
      expect(source).toMatch(/probeControlsFor: previewProbeControls, fetchImplementation: previewFetch!?, previewRound: true/u);
      expect(source).toContain("readPreviewBudgetGateSettings(pool,");
    }
  });

  it("parallel AI calls: both build the call scheduler, the busy coordinator, the call subjects, the attempt counter and the keep-alive renewals", () => {
    // Spec 2026-10-12-parallel-calls-design.md §3.2-§3.6: the practice measures the runner the preview runs.
    for (const source of [RUNNER_MAIN, PRACTICE_RUNNER]) {
      const code = withoutComments(source);
      expect(code).toContain("effectiveCallConcurrency(await readCallConcurrencyPolicy(");
      expect(code.match(/createCallScheduler\(/gu) ?? []).toHaveLength(1);
      expect(code.match(/createPreviewBusyCoordinator\(\)/gu) ?? []).toHaveLength(1);
      expect(code).toContain("withPreviewProviderCallPolicy(gateway, previewConfig, target");
      expect(code).toMatch(/busy: previewBusy/u);
      expect(code).toContain("inFlight: gatewayInFlight");
      expect(code).toContain("previewCallSubjects(previewConfig)");
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
    expect(code).toContain("...(previewConfig === undefined ? {} : { runResilience: previewRunResilience(previewConfig)! })");
    expect(code).toMatch(/const previewConfig = environment\.PREVIEW_PROVIDER_TEST_CONFIG;/u);
    // Control: the unguarded form is not what ships.
    expect(code).not.toMatch(/^\s*runResilience: previewRunResilience\(previewConfig\)!,/mu);
  });

  /** Without comments, every run of white space one space: a statement reads the same however it is wrapped. */
  const flat = (source: string) => withoutComments(source).replace(/\s+/gu, " ");

  it("hosted (2026-10-14): the runner's money wiring is main.ts's, statement for statement", () => {
    const shipped = flat(RUNNER_MAIN);
    const practice = flat(PRACTICE_RUNNER);
    for (const statement of [
      "assertHostedCostEnvelopesSealed(environment.DEPLOYMENT_MODE);",
      "const costEnvelopePolicy = environment.DEPLOYMENT_MODE === \"hosted\" ? await readCostEnvelopePolicy(pool, environment.REGISTER_VERSION) : null;",
      "const moneyInFlight = createRunInFlight();",
      "const envelopeBand = costEnvelopePolicy === null ? null : costEnvelopeBand(costEnvelopePolicy);",
      "const billingPlans = costEnvelopePolicy === null ? null : await readBillingPlans(pool, environment.REGISTER_VERSION);",
      // Side-by-side spec §9: the funding repository holds no register version (a grant lives under its own).
      "const allowances = new PostgresInternalAllowanceRepository(pool);",
      "const selectedFunding = await allowances.readPolicy();",
      "if (selectedFunding !== null && (environment.DEPLOYMENT_MODE !== \"hosted\" || envelopeBand === null || billingPlans === null)) throw new TypedDomainError(\"INTERNAL_FUNDING_UNAVAILABLE\",",
      "finishBasisPoints: envelopeBand === null ? null : envelopeBand.finishBasisPoints, persons: billingPlans === null ? plansUnresolvedPersonAllowance() : fundingAllowance ?? new BillingPersonAllowanceSource({ entitlements: new EntitlementRepository(pool).readOnlyPort(), plans: billingPlans, closeBasisPoints: envelopeBand === null ? 10_000 : envelopeBand.closeBasisPoints }), owners: modelSpendStore",
      "store: modelSpendStore, policy: costEnvelopeGuardPolicy(costEnvelopePolicy, storyPolicy), ...(sharedWallTerms === null ? {} : { sharedWall: sharedWallTerms }), ...(fundingAllowance === undefined ? {} : {fundingAdmission:fundingAllowance}), inFlight: moneyInFlight",
      "if (costEnvelopePolicy !== null && envelopeBand !== null) { const firstCalls = firstPositionCallProjections({ targets: declaredProviderTargets,",
      "bodyCeilingMicros: costEnvelopeCeilings(costEnvelopePolicy).bodyMicros,",
      "if (costEnvelopeGuard !== undefined && price === null) { throw new TypeError(`PROVIDER_TARGET_PRICE_REQUIRED:${target.providerRef}`); }",
      "buildCostEnvelopeSeam: (runId: string, phase: CostEnvelopePhase, sharedWall: SharedWallApplication) => costEnvelopeGuard.providerSeam({ runId, price, requireReportedUsage: true, phase, sharedWall }),",
      "...(storyCeilingMicros === null ? {} : { buildStoryCostEnvelopeSeam: (runId: string) => costEnvelopeGuard.storySeam({ runId, price, requireReportedUsage: true }) })",
      "hosted: environment.DEPLOYMENT_MODE === \"hosted\",",
      "providerPrices: buildProviderPriceMap(providerTargets, environment.DEPLOYMENT_MODE),",
      "structureRepairCeiling: previewStructureRepairCeiling(structureRepairRoute),",
      "bodyCostFallback: envelopeBand !== null,"
    ]) {
      expect(shipped, statement).toContain(statement);
      expect(practice, statement).toContain(statement);
    }
    // The local-only refusal is gone; local mode builds no guard (composePracticeRunnerMoney returns null there).
    expect(practice).not.toContain("PRACTICE_REQUIRES_LOCAL_MODE");
    expect(practice).toContain("if (environment.DEPLOYMENT_MODE !== \"hosted\") return null;");
  });

  it("hosted (2026-10-14): the ask's money stages are main.ts's, and the room gets main.ts's options but the funding", () => {
    const shipped = flat(API_MAIN);
    const practice = flat(PRACTICE_ASK);
    for (const statement of [
      "assertHostedSupportAdmissionSealed(environment.DEPLOYMENT_MODE, admissionPolicy);",
      "return Object.freeze({ runPolicy, guardPolicy: costEnvelopeGuardPolicy(runPolicy, storyPolicy) });",
      "new CostEnvelopeGuard({ store: new PostgresModelSpendStore(pool), policy: costEnvelopeRows.guardPolicy })",
      "policy: await readBillingPolicy(pool, environment.REGISTER_VERSION), plans: await readBillingPlans(pool, environment.REGISTER_VERSION), envelope: costEnvelopeRows.runPolicy",
      "const band = costEnvelopeBand(costEnvelopeRows.runPolicy);",
      "const stranded = await new RunWaitRepository(pool).countWaiting();",
      "assertAskRoomAdmissionSealed({ envelope: costEnvelopeRows.runPolicy, admission: admissionPolicy });",
      "maximumMicros: mostOneRunMaySpendMicros(costEnvelopeRows.guardPolicy)",
      "dailyCeilingMicros: costEnvelopeRows.runPolicy.dailyCeilingMicros, closeBasisPoints: band.closeBasisPoints, waitingLinePerPerson: band.waitingLinePerPerson",
      "perRunCeilingMicros: costEnvelopeRows?.guardPolicy.perRunCeilingMicros ?? null,",
      "moneyPolicy: costEnvelopeRows?.guardPolicy ?? null,",
      "...(askRoom !== undefined ? { room: askRoom, waitingLine: askRoom } : costEnvelopeGuard === undefined ? {} : { assertDailyCostEnvelope: () => costEnvelopeGuard.assertDailyEnvelopeAdmitsNewRun() }),",
      "bodyCeilingMicros: costEnvelopeCeilings(costEnvelopeRows.runPolicy).bodyMicros,",
      "ownRosterOnly: billingEnabled ? [\"free\"] : []"
    ]) {
      expect(shipped, statement).toContain(statement);
      expect(practice, statement).toContain(statement);
    }
    const shippedRoom = objectAfter(API_MAIN, "const room = new AskRoom({");
    const practiceRoom = objectAfter(PRACTICE_ASK, "const room = new AskRoom({");
    expect(shippedRoom.has("funding")).toBe(true);
    expect([...practiceRoom].sort()).toEqual([...shippedRoom].filter((key) => key !== "funding").sort());
    // Billing kept off: the room has no person allowance, no entitlements and no plans; the ask has no `billing`.
    expect(practice).toContain("const billingPlans = null;");
    expect(practice).toContain("const entitlements = null;");
    expect(practice).toContain("const personAllowance = NO_PERSON_ALLOWANCE;");
    expect(practice).toContain("billingEnabled: false,");
    expect(objectAfter(PRACTICE_ASK, "const runSettings: RunCreationSettings = {").has("billing")).toBe(false);
  });

  it("hosted and local alike: the debate shape and the question language are wired as the two main.ts files wire them", () => {
    // The merge of #165 into the debate-shape branch: the hosted compositions read the shape row (and its map hash) and
    // price the first call with the locked language exactly as main.ts does, in both modes.
    const runnerMain = flat(RUNNER_MAIN);
    const practiceRunner = flat(PRACTICE_RUNNER);
    const shapeRead = "const debateShape = await readDebateShapeRunnerSettings(pool, environment.REGISTER_VERSION);";
    expect(runnerMain).toContain(shapeRead);
    expect(practiceRunner).toContain(shapeRead);
    // Engine redesign (R1d Task 5): the runner's engine boot read, in both modes, on both sides.
    const engineRead = "const engine = await readEngineRunnerSettings(pool, environment.REGISTER_VERSION);";
    expect(runnerMain).toContain(engineRead);
    expect(practiceRunner).toContain(engineRead);
    expect(runnerMain).toContain("questionLanguageLocked: debateShape !== null");
    expect(practiceRunner).toContain("questionLanguageLocked: input.debateShape !== null");
    expect(practiceRunner).toContain("storyPolicy, debateShape, log:");
    // Read before the money wiring, never only in one mode.
    expect(practiceRunner.indexOf(shapeRead)).toBeLessThan(practiceRunner.indexOf("const money = await composePracticeRunnerMoney("));
    const apiMain = flat(API_MAIN);
    const practiceAsk = flat(PRACTICE_ASK);
    for (const source of [apiMain, practiceAsk]) {
      expect(source).toContain("questionLanguageLocked: debateShapeInForcePolicy !== null");
      // Engine redesign (R1d Task 6): the row in force for the ask side, on both sides.
      expect(source).toContain("const engineInForcePolicy = engineInForce(engineVersionPolicy);");
      expect(source).toContain("const debateShapeInForcePolicy = debateShapeInForce(debateShapePolicy);");
      expect(source).toContain("const questionLanguage = debateShapeInForcePolicy === null ? undefined : await");
      expect(source).toContain("route: questionLanguageRouteFor({");
    }
  });

  it("control: the reader sees a key that is missing", () => {
    const shipped = objectKeys("{ a: 1, ...(x ? {} : { b: 2, c: { d: 3 } }), e: f(g, { h: 1 }), m(n: string) { return { o: n }; }, i }");
    expect([...shipped].sort()).toEqual(["a", "b", "c", "e", "i", "m"]);
    // And on the real files: the practice without one of its settings no longer matches main.ts.
    const anchor = "new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {";
    const trimmed = objectAfter(PRACTICE_RUNNER.replace("bodyCostFallback: envelopeBand !== null,", ""), anchor);
    expect(trimmed.has("bodyCostFallback")).toBe(false);
    expect(objectAfter(RUNNER_MAIN, anchor).has("bodyCostFallback")).toBe(true);
    expect(objectAfter(API_MAIN, "new PostgresAskApplication(pool, dispatcher, {").has("resolveRisk")).toBe(true);
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
