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
  PRACTICE_COMPOSITION_BUDGET_HIGH,
  practiceCandidateStatement,
  practiceCannedStory,
  practiceComposedPostCheck,
  practiceDebateGraph,
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

/** Settings only a hosted (money-metered, billing) deployment passes; the preview is local mode. */
const HOSTED_ONLY_ASK_KEYS = new Set(["room", "waitingLine", "assertDailyCostEnvelope", "billing"]);

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

  it("control: the reader sees a key that is missing", () => {
    const shipped = objectKeys("{ a: 1, ...(x ? {} : { b: 2, c: { d: 3 } }), e: f(g, { h: 1 }), m(n: string) { return { o: n }; }, i }");
    expect([...shipped].sort()).toEqual(["a", "b", "c", "e", "i", "m"]);
    // And on the real files: the practice without one of its settings no longer matches main.ts.
    const anchor = "new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {";
    const trimmed = objectAfter(PRACTICE_RUNNER.replace("bodyCostFallback: false,", ""), anchor);
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
      budgetBound: PRACTICE_COMPOSITION_BUDGET_HIGH });
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
    expect(RUNNER).toMatch(/classifyContent: \(content\) => classifyComposedContent\(content, \{\s*digest: request\.digest,\s*servedNodes,/u);
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
    expect((row?.value as { high?: number } | undefined)?.high).toBe(PRACTICE_COMPOSITION_BUDGET_HIGH);
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
    expect(RUNNER).toMatch(/const evaluatorVerdictOf = \(content: string\): EvaluatorVerdict => \{\s*const parsed = parseEvaluatorOutput\(content\);\s*return assertEvaluatorVerdict\(/u);
    expect(LANES).toMatch(/const parsed = parseEvaluatorOutput\(content\);\s*assertEvaluatorVerdict\(/u);
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
