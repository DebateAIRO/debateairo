import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  DIGEST_COMPRESSED_MARK,
  DIGEST_COMPRESSION_LEVELS,
  DIGEST_LADDER,
  buildFactBundle,
  buildSynthesisDigest,
  buildSynthesizerRequest,
  digestLeverageByNodeId,
  digestNodeRefOf,
  digestPointsOmitted,
  resolveDigestNodeRef,
  runServeGateChain,
  synthesisDigestLadder,
  toSynthesisPromptMaterial,
  type ComposedSegment,
  type DigestSourceNode,
  type ServeGateDependencies,
  type SynthesisDigest,
  type SynthesisDigestAttempt
} from "@debateai/serve";
import {
  buildStoryMaterial,
  type StoryMaterialResult,
  type StoryRunSnapshot
} from "@debateai/story";
import {
  buildServeDisclosureRecord,
  composedNodeIdOf,
  serveDisclosureDigestFacts
} from "../../apps/runner/src/index.js";

/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.3), TASK M4 — a deep debate fits
 * the answer-writer's input through a shrinking digest.
 *
 * Before M4 the ladder kept every node and shrank only the summaries, so a
 * debate of about 195 points (57 KB at maximum compression) could never fit the
 * 10 / 20 / 30 KB composition budget and ended components-only
 * (DIGEST-CANNOT-EXIST). Now two rungs follow the summary levels:
 *
 *  · compact — every node kept, ids and relation targets as short refs, the
 *    strength at four decimals, the tightest summary; the key names unchanged;
 *  · spine — the ONLY rung where membership drops: the positions, their direct
 *    children and the most decisive points (the story's definition) with their
 *    chains, the rest counted per position.
 *
 * The runner maps each cited short ref back to its node id at its one citation
 * point, before anything reaches the sealed checks.
 */

const TIERS = Object.freeze({ low: 10_000, medium: 20_000, high: 30_000 });
const COMPACT = DIGEST_LADDER.compactRung;
const SPINE = DIGEST_LADDER.spineRung;

/** A real-looking node id: 36 characters, like the engine's UUIDs. */
function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

interface TreeOptions {
  /** Which points are surviving objections (default: every attacking point). */
  readonly survivingObjection?: (index: number, parent: number) => boolean;
  /** Each point's leverage (default: a spread with ties). */
  readonly leverage?: (index: number) => number | undefined;
}

/**
 * The measured shape (money map §F): real 36-character ids, 300-character
 * statements, one relation per point, full-precision strengths. Three positions,
 * and a binary tree of points under them: point i answers point
 * floor((i - 3) / 2), so each position has two direct children and the tree
 * runs several generations deep.
 */
function measuredTree(count: number, options: TreeOptions = {}): readonly DigestSourceNode[] {
  const nodes: DigestSourceNode[] = [];
  for (let index = 0; index < count; index += 1) {
    const isPosition = index < 3;
    const parent = isPosition ? -1 : Math.floor((index - 3) / 2);
    const polarity = index % 2 === 0 ? "attack" as const : "support" as const;
    const head = `Point ${String(index)} argues that `;
    nodes.push(Object.freeze({
      nodeId: uuid(index),
      statement: (head + "the measured evidence settles the question in a way the other side disputes. ".repeat(5)).slice(0, 300),
      finalStrength: ((index * 7919) % 10007) / 10007,
      wayOfKnowing: index % 3 === 0 ? "LOOKED_UP" as const : "REASONING" as const,
      marks: Object.freeze([]),
      polarityRelations: Object.freeze(parent < 0 ? [] : [Object.freeze({ polarity, targetNodeId: uuid(parent) })]),
      isPosition,
      isSurvivingObjection: !isPosition && (options.survivingObjection ?? (() => polarity === "attack"))(index, parent),
      leverage: isPosition ? null : (options.leverage ?? ((at: number) => ((at * 37) % 23) / 23))(index) ?? null
    }));
  }
  return Object.freeze(nodes);
}

function fitted(outcome: ReturnType<typeof buildSynthesisDigest>): SynthesisDigest {
  if (outcome.kind !== "DIGEST") throw new Error(`expected a digest, got ${outcome.kind}`);
  return outcome.digest;
}

/** The bytes the builder measures: the digest without its own size field. */
function measuredBytes(digest: SynthesisDigest): number {
  const { byteSize: _ignored, ...shape } = digest;
  return Buffer.byteLength(JSON.stringify(shape), "utf8");
}

/** The real node ids a digest carries, through the one ref resolver. */
function memberIds(digest: SynthesisDigest): readonly string[] {
  return digest.nodes.map((entry) => {
    const nodeId = resolveDigestNodeRef(digest, entry.nodeId);
    if (nodeId === null) throw new Error(`digest entry ${entry.nodeId} resolves to nothing`);
    return nodeId;
  });
}

function directChildren(nodes: readonly DigestSourceNode[]): readonly string[] {
  const positions = new Set(nodes.filter((node) => node.isPosition).map((node) => node.nodeId));
  return nodes
    .filter((node) => node.polarityRelations.some((relation) => positions.has(relation.targetNodeId)))
    .map((node) => node.nodeId);
}

/** Every rung the ladder tries for these nodes, in order (the builder takes the first that fits). */
function ladderOf(nodes: readonly DigestSourceNode[]): readonly SynthesisDigestAttempt[] {
  return [...synthesisDigestLadder({ nodes, servedRootNodeId: nodes[0]!.nodeId })];
}

/** The typed refusal an unknown citation meets, or a failure if none was thrown. */
function refusalOf(call: () => unknown): TypedDomainError {
  try {
    call();
  } catch (error) {
    if (error instanceof TypedDomainError) return error;
    throw error;
  }
  throw new Error("expected a typed refusal");
}

describe("M4 · the measured case: 195 points fit every tier", () => {
  const nodes = measuredTree(195);

  it.each([
    ["low", TIERS.low],
    ["medium", TIERS.medium],
    ["high", TIERS.high]
  ] as const)("%s: a DIGEST within the budget, at the spine rung", (_tier, budget) => {
    const outcome = buildSynthesisDigest({ nodes, servedRootNodeId: uuid(0), budgetBound: budget });
    const digest = fitted(outcome);
    expect(digest.byteSize).toBeLessThanOrEqual(budget);
    expect(measuredBytes(digest)).toBe(digest.byteSize);
    // Measured: every node at the compact rung is about 216 bytes (the key names
    // stay), so 195 of them take about 42 KB, over even the high tier. Membership
    // must drop, and it drops only here.
    expect(digest.compressionLevel).toBe(SPINE);
    expect(outcome.marks).toEqual([DIGEST_COMPRESSED_MARK]);
    const members = new Set(memberIds(digest));
    expect(members.size).toBeLessThan(nodes.length);
    for (const kept of [uuid(0), uuid(1), uuid(2), ...directChildren(nodes)]) expect(members.has(kept)).toBe(true);
    expect(digestPointsOmitted(digest)).toBe(nodes.length - members.size);
  });

  it("the compact rung keeps every one of the 195 and is still over the high tier", () => {
    const compact = ladderOf(nodes).find((attempt) => attempt.digest.compressionLevel === COMPACT)!;
    expect(compact.digest.nodes).toHaveLength(195);
    expect(compact.digest.byteSize).toBeGreaterThan(TIERS.high);
  });

  it("the tighter the tier, the fewer decisive points the spine keeps", () => {
    const decisive = (budget: number): number => {
      const digest = fitted(buildSynthesisDigest({ nodes, servedRootNodeId: uuid(0), budgetBound: budget }));
      const attempt = ladderOf(nodes).find((candidate) => JSON.stringify(candidate.digest) === JSON.stringify(digest));
      return attempt!.spineDecisiveCount!;
    };
    expect(decisive(TIERS.high)).toBeGreaterThanOrEqual(decisive(TIERS.medium));
    expect(decisive(TIERS.medium)).toBeGreaterThanOrEqual(decisive(TIERS.low));
  });
});

describe("M4 · no regression below the new rungs", () => {
  it("50 points on medium stay at summary level 3, byte for byte as before M4", () => {
    // Measured on the base tree (bea9f780) with this same generator: level 3, 19,532 bytes.
    const nodes = measuredTree(50);
    const digest = fitted(buildSynthesisDigest({ nodes, servedRootNodeId: uuid(0), budgetBound: TIERS.medium }));
    expect(digest.compressionLevel).toBe(3);
    expect(digest.byteSize).toBe(19_532);
    expect(digest.nodes.map((entry) => entry.nodeId)).toEqual(nodes.map((node) => node.nodeId));
    expect(digest.nodes[5]!.finalStrength).toBe(nodes[5]!.finalStrength);
    expect(Object.keys(digest)).toEqual(["nodes", "emphasis", "compressionLevel", "summaryCharacterCap", "byteSize"]);
  });

  it("50 points on high stay uncompressed", () => {
    const digest = fitted(buildSynthesisDigest({ nodes: measuredTree(50), servedRootNodeId: uuid(0), budgetBound: TIERS.high }));
    expect(digest.compressionLevel).toBe(0);
    expect(digest.byteSize).toBe(28_483);
  });

  it("rungs 0-5 are today's summary levels, in order, each with every node", () => {
    const attempts = ladderOf(measuredTree(50));
    expect(attempts.slice(0, DIGEST_COMPRESSION_LEVELS.length).map((attempt) => attempt.digest.summaryCharacterCap))
      .toEqual([...DIGEST_COMPRESSION_LEVELS]);
    for (const attempt of attempts.slice(0, DIGEST_COMPRESSION_LEVELS.length)) {
      expect(attempt.digest.nodes).toHaveLength(50);
      expect(attempt.spineDecisiveCount).toBeNull();
    }
  });
});

describe("M4 · the compact rung", () => {
  const nodes = measuredTree(60);
  const compact = (): SynthesisDigest => ladderOf(nodes).find((attempt) => attempt.digest.compressionLevel === COMPACT)!.digest;

  it("keeps every node, with the key names of rung 0", () => {
    const digest = compact();
    const widest = ladderOf(nodes)[0]!.digest;
    expect(digest.nodes).toHaveLength(nodes.length);
    expect(Object.keys(digest)).toEqual(Object.keys(widest));
    for (const [index, entry] of digest.nodes.entries()) {
      expect(Object.keys(entry)).toEqual(Object.keys(widest.nodes[index]!));
    }
    expect(Object.keys(digest.emphasis)).toEqual(Object.keys(widest.emphasis));
  });

  it("names nodes by short refs, positions first (strongest first), then each position's tree", () => {
    const digest = compact();
    expect(digest.nodes.map((entry) => entry.nodeId)).toEqual(nodes.map((_node, index) => `n${String(index + 1)}`));
    const positions = nodes.slice(0, 3)
      .map((node) => node.nodeId)
      .sort((left, right) => (nodes.find((node) => node.nodeId === right)!.finalStrength ?? 0)
        - (nodes.find((node) => node.nodeId === left)!.finalStrength ?? 0));
    expect(digest.nodes.slice(0, 3).map((entry) => resolveDigestNodeRef(digest, entry.nodeId))).toEqual(positions);
    expect(JSON.stringify(digest)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/u);
  });

  it("points relation targets and emphasis at the same short refs", () => {
    const digest = compact();
    for (const entry of digest.nodes) {
      const source = nodes.find((node) => node.nodeId === resolveDigestNodeRef(digest, entry.nodeId))!;
      expect(entry.polarityRelations.map((relation) => resolveDigestNodeRef(digest, relation.targetNodeId)))
        .toEqual(source.polarityRelations.map((relation) => relation.targetNodeId));
    }
    const widest = ladderOf(nodes)[0]!.digest;
    expect(digest.emphasis.topSurvivingObjectionNodeIds.map((ref) => resolveDigestNodeRef(digest, ref)))
      .toEqual(widest.emphasis.topSurvivingObjectionNodeIds);
    expect(digest.emphasis.runnerUpPositionNodeIds.map((ref) => resolveDigestNodeRef(digest, ref)))
      .toEqual(widest.emphasis.runnerUpPositionNodeIds);
  });

  it("rounds each strength to four decimals and takes the tightest summary", () => {
    const digest = compact();
    for (const entry of digest.nodes) {
      const source = nodes.find((node) => node.nodeId === resolveDigestNodeRef(digest, entry.nodeId))!;
      expect(entry.finalStrength).toBe(Math.round(source.finalStrength! * 10_000) / 10_000);
      expect(Array.from(entry.statementSummary).length).toBeLessThanOrEqual(DIGEST_COMPRESSION_LEVELS.at(-1)!);
    }
    expect(digest.summaryCharacterCap).toBe(DIGEST_COMPRESSION_LEVELS.at(-1));
    expect(digest.omittedPoints).toBeUndefined();
    expect(digestPointsOmitted(digest)).toBe(0);
  });

  it("keeps a null strength null", () => {
    const withNull = nodes.map((node, index) => index === 7 ? { ...node, finalStrength: null } : node);
    const attempt = ladderOf(withNull).find((candidate) => candidate.digest.compressionLevel === COMPACT)!;
    const entry = attempt.digest.nodes.find((candidate) => resolveDigestNodeRef(attempt.digest, candidate.nodeId) === uuid(7))!;
    expect(entry.finalStrength).toBeNull();
  });
});

describe("M4 · the spine rung", () => {
  const nodes = measuredTree(195);
  const spines = (): readonly SynthesisDigestAttempt[] =>
    ladderOf(nodes).filter((attempt) => attempt.digest.compressionLevel === SPINE);

  it("comes only after the compact rung, and shrinks the decisive set 20, 10, 5, 0", () => {
    const attempts = ladderOf(nodes);
    const rungs = attempts.map((attempt) => attempt.digest.compressionLevel);
    expect(rungs).toEqual([...rungs].sort((left, right) => left - right));
    expect(rungs.indexOf(SPINE)).toBe(rungs.indexOf(COMPACT) + 1);
    expect(DIGEST_LADDER.spineDecisiveCounts).toEqual([20, 10, 5, 0]);
    expect(spines().map((attempt) => attempt.spineDecisiveCount)).toEqual([20, 10, 5, 0]);
    const sizes = spines().map((attempt) => attempt.digest.byteSize);
    expect(sizes).toEqual([...sizes].sort((left, right) => right - left));
  });

  it("keeps the positions and their direct children to the last step", () => {
    const mustStay = [uuid(0), uuid(1), uuid(2), ...directChildren(nodes)];
    for (const attempt of spines()) {
      const members = new Set(memberIds(attempt.digest));
      for (const nodeId of mustStay) expect(members.has(nodeId), `${nodeId} at ${String(attempt.spineDecisiveCount)}`).toBe(true);
    }
  });

  it("keeps each decisive point with its chain up to its position", () => {
    const top = spines()[0]!;
    const members = new Set(memberIds(top.digest));
    const ranked = nodes
      .filter((node) => !node.isPosition)
      .sort((left, right) => right.leverage! - left.leverage! || (left.nodeId < right.nodeId ? -1 : 1))
      .slice(0, 20);
    const byId = new Map(nodes.map((node) => [node.nodeId, node] as const));
    for (const point of ranked) {
      for (let cursor: DigestSourceNode | undefined = point; cursor !== undefined;
        cursor = byId.get(cursor.polarityRelations[0]?.targetNodeId ?? "")) {
        expect(members.has(cursor.nodeId)).toBe(true);
      }
    }
  });

  it("keeps the emphasised objections, each with its chain", () => {
    for (const attempt of spines()) {
      const members = new Set(memberIds(attempt.digest));
      for (const ref of attempt.digest.emphasis.topSurvivingObjectionNodeIds) {
        expect(members.has(resolveDigestNodeRef(attempt.digest, ref)!)).toBe(true);
      }
    }
  });

  it("counts every left-out point once, per position, by its net stance toward it", () => {
    for (const attempt of spines()) {
      const omitted = attempt.digest.omittedPoints!;
      const total = omitted.reduce((sum, entry) => sum + entry.supporting + entry.attacking, 0);
      expect(total).toBe(nodes.length - attempt.digest.nodes.length);
      expect(digestPointsOmitted(attempt.digest)).toBe(total);
      for (const entry of omitted) {
        expect(entry.positionNodeId === null || attempt.digest.nodes.some((node) => node.nodeId === entry.positionNodeId)).toBe(true);
        expect(Object.keys(entry)).toEqual(["positionNodeId", "supporting", "attacking"]);
      }
    }
    // Net stance: an attack on an attack supports the position.
    const small: DigestSourceNode[] = [
      { ...measuredTree(1)[0]!, nodeId: "p", isPosition: true },
      { ...measuredTree(1)[0]!, nodeId: "a", isPosition: false, polarityRelations: [{ polarity: "attack", targetNodeId: "p" }] },
      { ...measuredTree(1)[0]!, nodeId: "aa", isPosition: false, polarityRelations: [{ polarity: "attack", targetNodeId: "a" }] },
      { ...measuredTree(1)[0]!, nodeId: "sa", isPosition: false, polarityRelations: [{ polarity: "support", targetNodeId: "a" }] }
    ];
    const spine = [...synthesisDigestLadder({ nodes: small, servedRootNodeId: "p" })]
      .find((attempt) => attempt.digest.compressionLevel === SPINE)!;
    expect(spine.digest.omittedPoints).toEqual([{ positionNodeId: "n1", supporting: 1, attacking: 1 }]);
  });

  it("drops a relation onto a left-out point instead of naming it", () => {
    const attempt = spines().at(-1)!;
    const refs = new Set(attempt.digest.nodes.map((entry) => entry.nodeId));
    for (const entry of attempt.digest.nodes) {
      for (const relation of entry.polarityRelations) expect(refs.has(relation.targetNodeId)).toBe(true);
    }
  });

  it("never offers a spine that leaves nothing out: that is the compact rung again", () => {
    // Every point answers a position directly, so the spine is the whole debate.
    const flat = measuredTree(3).concat(Array.from({ length: 30 }, (_unused, index) => ({
      ...measuredTree(1)[0]!,
      nodeId: `flat:${String(index)}`,
      isPosition: false,
      polarityRelations: [{ polarity: "support" as const, targetNodeId: uuid(index % 3) }]
    })));
    const attempts = [...synthesisDigestLadder({ nodes: flat, servedRootNodeId: uuid(0) })];
    expect(attempts.some((attempt) => attempt.digest.compressionLevel === SPINE)).toBe(false);
    const outcome = buildSynthesisDigest({ nodes: flat, servedRootNodeId: uuid(0), budgetBound: 1 });
    expect(outcome.kind).toBe("DIGEST_CANNOT_EXIST");
    if (outcome.kind !== "DIGEST_CANNOT_EXIST") throw new Error("unreachable");
    expect(outcome.byteSizeAtMaxCompression).toBe(attempts.at(-1)!.digest.byteSize);
  });

  it("is still DIGEST_CANNOT_EXIST when even the smallest spine is over budget", () => {
    const smallest = spines().at(-1)!.digest.byteSize;
    const outcome = buildSynthesisDigest({ nodes, servedRootNodeId: uuid(0), budgetBound: smallest - 1 });
    expect(outcome.kind).toBe("DIGEST_CANNOT_EXIST");
    if (outcome.kind !== "DIGEST_CANNOT_EXIST") throw new Error("unreachable");
    expect(outcome.byteSizeAtMaxCompression).toBe(smallest);
    expect(fitted(buildSynthesisDigest({ nodes, servedRootNodeId: uuid(0), budgetBound: smallest })).compressionLevel).toBe(SPINE);
  });
});

describe("M4 · determinism", () => {
  it("the same tree gives the same bytes at every tier", () => {
    for (const budget of [TIERS.low, TIERS.medium, TIERS.high, 5_000, 200_000]) {
      const first = buildSynthesisDigest({ nodes: measuredTree(195), servedRootNodeId: uuid(0), budgetBound: budget });
      const second = buildSynthesisDigest({ nodes: measuredTree(195), servedRootNodeId: uuid(0), budgetBound: budget });
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    }
  });
});

/* ----------------------------------------------- the byte budget, as a property */

/** mulberry32: a small seeded generator, so the property run is the same every time. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const WORDS = ["evidence", "ă", "cost", "risc", "données", "💡", "…", "measured", "claim", "x"];

function randomTree(random: () => number): readonly DigestSourceNode[] {
  const count = 1 + Math.floor(random() * 70);
  const positions = 1 + Math.floor(random() * Math.min(4, count));
  const nodes: DigestSourceNode[] = [];
  for (let index = 0; index < count; index += 1) {
    const isPosition = index < positions;
    const relations: { polarity: "support" | "attack"; targetNodeId: string }[] = [];
    if (!isPosition && random() > 0.08) {
      relations.push({ polarity: random() > 0.5 ? "attack" : "support", targetNodeId: `node:${String(Math.floor(random() * index))}` });
      if (random() > 0.85) relations.push({ polarity: "support", targetNodeId: `node:${String(Math.floor(random() * index))}` });
    }
    const words = Array.from({ length: Math.floor(random() * 60) }, () => WORDS[Math.floor(random() * WORDS.length)]!);
    nodes.push({
      nodeId: `node:${String(index)}`,
      statement: words.join(" "),
      finalStrength: random() > 0.1 ? random() : null,
      wayOfKnowing: random() > 0.5 ? "REASONING" : "LOOKED_UP",
      marks: random() > 0.8 ? ["SINGLE-LINEAGE"] : [],
      polarityRelations: relations,
      isPosition,
      isSurvivingObjection: relations[0]?.polarity === "attack" && random() > 0.3,
      leverage: random() > 0.2 ? Math.floor(random() * 50) / 50 : null
    });
  }
  return nodes;
}

describe("M4 · the byte budget is never exceeded, on any rung", () => {
  it("holds for random trees and random budgets, and the result is the first rung that fits", () => {
    const random = seeded(20_260_927);
    let spineResults = 0;
    for (let trial = 0; trial < 250; trial += 1) {
      const nodes = randomTree(random);
      const attempts = [...synthesisDigestLadder({ nodes, servedRootNodeId: "node:0" })];
      const widest = attempts[0]!.digest.byteSize;
      const budget = Math.floor(random() * widest * 1.1);
      const outcome = buildSynthesisDigest({ nodes, servedRootNodeId: "node:0", budgetBound: budget });
      const firstFit = attempts.find((attempt) => attempt.digest.byteSize <= budget);
      for (const attempt of attempts) expect(measuredBytes(attempt.digest)).toBe(attempt.digest.byteSize);
      if (firstFit === undefined) {
        expect(outcome.kind).toBe("DIGEST_CANNOT_EXIST");
        if (outcome.kind === "DIGEST_CANNOT_EXIST") expect(outcome.byteSizeAtMaxCompression).toBe(attempts.at(-1)!.digest.byteSize);
        continue;
      }
      const digest = fitted(outcome);
      expect(digest.byteSize).toBeLessThanOrEqual(budget);
      expect(JSON.stringify(digest)).toBe(JSON.stringify(firstFit.digest));
      if (digest.compressionLevel < SPINE) {
        expect(digest.nodes).toHaveLength(nodes.length);
      } else {
        spineResults += 1;
        const members = new Set(memberIds(digest));
        for (const nodeId of [...nodes.filter((node) => node.isPosition).map((node) => node.nodeId), ...directChildren(nodes)]) {
          expect(members.has(nodeId)).toBe(true);
        }
        expect(digestPointsOmitted(digest)).toBe(nodes.length - members.size);
        // Rung 7 only when every rung before it is over budget.
        for (const earlier of attempts.filter((attempt) => attempt.digest.compressionLevel < SPINE)) {
          expect(earlier.digest.byteSize).toBeGreaterThan(budget);
        }
      }
    }
    // The run must actually reach the new rung, or it proves nothing about it.
    expect(spineResults).toBeGreaterThan(5);
  });
});

/* ------------------------------------------------ "most decisive": story parity */

function storySnapshotOf(nodes: readonly DigestSourceNode[]): StoryRunSnapshot {
  const positions = nodes.filter((node) => node.isPosition)
    .sort((left, right) => (right.finalStrength ?? 0) - (left.finalStrength ?? 0));
  return {
    runId: "run:parity",
    workItemId: "work:parity",
    answerId: "answer:parity",
    answerVersion: 1,
    questionLine: "Does the parity hold?",
    argumentLanguage: { tag: "en", name: "English" },
    compositionBudgetTier: "low",
    verdictBasis: {
      label: "CONTESTED",
      rung: 4,
      trigger: "MID_BAND",
      winner_node_id: positions[0]!.nodeId,
      winner_strength: positions[0]!.finalStrength ?? 0,
      runner_up_node_id: positions[1]?.nodeId ?? null,
      runner_up_strength: positions[1]?.finalStrength ?? null,
      margin: null,
      disagreement: null,
      thresholds: { gamma: 1, high_cut: 1, low_cut: 0, disagreement: 1 },
      confidence_band: null,
      marks: []
    },
    servedStatement: ["A statement."],
    nodes: nodes.map((node) => ({
      nodeId: node.nodeId,
      claim: node.statement,
      isPosition: node.isPosition,
      wayOfKnowing: node.wayOfKnowing,
      baseScore: null,
      finalStrength: node.finalStrength,
      excludedReason: null,
      authorModel: null,
      panelDispersion: null,
      criticSummary: null
    })),
    // The arrows in the order the digest reads relations: node by node, each node's in turn.
    arrows: nodes.flatMap((node) => node.polarityRelations.map((relation) => ({
      sourceNodeId: node.nodeId,
      targetNodeId: relation.targetNodeId,
      polarity: relation.polarity
    }))),
    sensitivity: nodes.flatMap((node) => typeof node.leverage === "number"
      ? [{ removedNodeId: node.nodeId, leverage: node.leverage }]
      : []),
    setAside: []
  };
}

/** The story's own last ladder step: each build one byte under the last fitted size. */
function storyAtSpine(snapshot: StoryRunSnapshot): ReadonlySet<string> {
  const build = (budgetBytes: number): StoryMaterialResult =>
    buildStoryMaterial({ snapshot, enrichment: new Map(), budgetBytes, shapeIds: new Set(["general"]) });
  let result = build(50_000_000);
  while (result.kind === "OK" && result.compressionStep < 7) result = build(result.material.bytes - 1);
  if (result.kind !== "OK") throw new Error("the story material never reached its spine step");
  const refMap = result.refMap;
  return new Set(result.material.points.map((point) => refMap.get(point.id)!));
}

function serveSpineAt(nodes: readonly DigestSourceNode[], decisive: number): ReadonlySet<string> {
  const attempt = [...synthesisDigestLadder({ nodes, servedRootNodeId: nodes.find((node) => node.isPosition)!.nodeId })]
    .find((candidate) => candidate.digest.compressionLevel === SPINE && candidate.spineDecisiveCount === decisive);
  if (attempt === undefined) throw new Error("no spine attempt at that decisive count");
  return new Set(memberIds(attempt.digest));
}

describe("M4 · 'most decisive' is the story's definition, mirrored in serve", () => {
  it.each([
    ["the measured binary tree", measuredTree(195, { survivingObjection: (_index, parent) => parent < 3 })],
    ["leverage ties broken by id", measuredTree(120, { survivingObjection: () => false, leverage: (index) => (index % 4) / 4 })],
    ["points with no leverage are never ranked", measuredTree(150, {
      survivingObjection: () => false,
      leverage: (index) => index % 5 === 0 ? undefined : ((index * 13) % 17) / 17
    })]
  ])("the serve spine at 20 decisive points is the story's spine step: %s", (_name, nodes) => {
    const story = storyAtSpine(storySnapshotOf(nodes));
    const serve = serveSpineAt(nodes, 20);
    expect([...serve].sort()).toEqual([...story].sort());
    expect(serve.size).toBeLessThan(nodes.length);
  });

  it("parity holds on a tree where some points answer two points", () => {
    const base = measuredTree(90, { survivingObjection: () => false });
    const nodes = base.map((node, index) => index > 40 && index % 7 === 0
      ? { ...node, polarityRelations: [...node.polarityRelations, { polarity: "support" as const, targetNodeId: uuid(index - 30) }] }
      : node);
    expect([...serveSpineAt(nodes, 20)].sort()).toEqual([...storyAtSpine(storySnapshotOf(nodes))].sort());
  });
});

describe("M4 · leverage reaches the digest from propagation's sensitivity records", () => {
  it("takes each node's largest finite leverage, as the story does", () => {
    const leverage = digestLeverageByNodeId([
      { removedNodeId: "a", leverage: 0.2 },
      { removedNodeId: "a", leverage: 0.4 },
      { removedNodeId: "b", leverage: Number.NaN },
      { removedNodeId: "c", leverage: 0 }
    ]);
    expect([...leverage.entries()]).toEqual([["a", 0.4], ["c", 0]]);
  });

  it("never sends leverage to the model", () => {
    for (const attempt of ladderOf(measuredTree(80))) expect(JSON.stringify(attempt.digest)).not.toContain("leverage");
  });
});

/* ----------------------------------------------------- short refs map back */

describe("M4 · the runner maps each cited ref back before the sealed checks", () => {
  const nodes = measuredTree(195);
  const servedNodes = nodes.map((node) => ({ nodeId: node.nodeId }));
  const spine = fitted(buildSynthesisDigest({ nodes, servedRootNodeId: uuid(0), budgetBound: TIERS.low }));
  const members = new Set(memberIds(spine));
  const omittedIndex = nodes.findIndex((node) => !members.has(node.nodeId));
  const map = (ref: string, digest: SynthesisDigest = spine): string =>
    composedNodeIdOf({ ref, digest, servedRootNodeId: uuid(0), servedNodes });

  it("turns a short ref into its real node id", () => {
    for (const entry of spine.nodes) expect(map(entry.nodeId)).toBe(resolveDigestNodeRef(spine, entry.nodeId));
    expect(map(digestNodeRefOf(spine, uuid(0))!)).toBe(uuid(0));
  });

  it("keeps the served root's `primary` alias", () => {
    expect(map("primary")).toBe(uuid(0));
  });

  it("refuses an unknown ref exactly as an unknown node id is refused", () => {
    for (const ref of ["n9999", "node:nowhere", ""]) {
      const refused = refusalOf(() => map(ref));
      expect(refused.code).toBe("COMPOSITION_CONTRACT_ERROR");
      expect(refused.message).toBe(`Unknown composition node ref ${ref}`);
    }
  });

  it("refuses a citation of a point the spine left out, by any name", () => {
    expect(omittedIndex).toBeGreaterThan(0);
    const omitted = nodes[omittedIndex]!.nodeId;
    expect(digestNodeRefOf(spine, omitted)).toBeNull();
    // Its real id is not in the digest; nor is the ref it held at the compact rung.
    const compact = ladderOf(nodes).find((attempt) => attempt.digest.compressionLevel === COMPACT)!.digest;
    for (const ref of [omitted, digestNodeRefOf(compact, omitted)!]) {
      expect(refusalOf(() => map(ref)).code).toBe("COMPOSITION_CONTRACT_ERROR");
    }
  });

  it("at rungs 0-5 a real id is still the citation, unchanged", () => {
    const wide = fitted(buildSynthesisDigest({ nodes: measuredTree(50), servedRootNodeId: uuid(0), budgetBound: TIERS.high }));
    expect(map(uuid(7), wide)).toBe(uuid(7));
    expect(refusalOf(() => map("n8", wide)).code).toBe("COMPOSITION_CONTRACT_ERROR");
    expect(digestNodeRefOf(wide, uuid(7))).toBe(uuid(7));
  });

  it("shows the answer-writer the served node by the ref the digest uses for it", () => {
    const request = buildSynthesizerRequest({
      controls: { synthesizerRoleRef: "provider:w", evaluatorRoleRef: "provider:c", evaluatorLoopMaxRounds: 2 },
      round: 1,
      digest: spine,
      codeLabel: { verdictLabel: "CONTESTED", servedNodeId: uuid(0), servedStrength: 0.6, margin: null, registerVersion: 1 },
      prior: null
    });
    const fields = toSynthesisPromptMaterial(request);
    const codeLabel = JSON.parse(fields.find((field) => field.name === "code_label")!.content) as { servedNodeId: string };
    expect(codeLabel.servedNodeId).toBe(digestNodeRefOf(spine, uuid(0)));
    expect(fields.map((field) => field.content).join("\n")).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/u);
  });
});

describe("M4 · through the sealed chain: a deep debate is answered, not components-only", () => {
  it("serves 195 points on the low tier, the citations mapped back to real ids", async () => {
    const nodes = measuredTree(195);
    const cited: string[] = [];
    const dependencies: ServeGateDependencies = {
      synthesize: async (request) => {
        // The runner's adapter: the model cites the refs it was shown.
        const refs = [request.digest.nodes[0]!.nodeId, request.digest.nodes.at(-1)!.nodeId];
        const assertedNodeRefs = refs.map((ref) => composedNodeIdOf({
          ref, digest: request.digest, servedRootNodeId: uuid(0), servedNodes: nodes
        }));
        cited.push(...assertedNodeRefs);
        const candidate: readonly ComposedSegment[] = [
          { segmentId: "s1", text: "The answer.", loadBearing: false, assertedNodeRefs, servedNumberRefs: ["number:final-strength"] },
          { segmentId: "s2", text: "The plan.", loadBearing: false, assertedNodeRefs: [], servedNumberRefs: [] }
        ];
        return { candidate, candidateRef: "artifact:draft:1", candidateCallSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1" };
      },
      evaluate: async () => ({
        verdict: {
          satisfied: true,
          objection: null,
          criteria: { fairnessToLosers: true, statementLabelAgreement: true, noOverstatement: true, restatement: true, citationTracing: true }
        },
        verdictRef: "artifact:verdict:1",
        verdictCallSiteKey: "POST_COMPOSE_R9:EVALUATOR:1"
      }),
      applyBandCeiling: ({ basis, candidateConfidenceBand }) => ({
        kind: "NOT_CAPPED",
        confidenceBand: candidateConfidenceBand,
        ceiling: {
          label: "TEST_CEILING", basis, registerRowKey: "test-layer:ceiling", registerVersion: 1,
          sourceRef: "test-layer:m4", liftPath: "test-layer:lift"
        }
      })
    };
    const result = await runServeGateChain({
      nodes: nodes.map((node, index) => ({
        nodeId: node.nodeId, text: node.statement, wayOfKnowing: node.wayOfKnowing, provenanceRef: `artifact:${node.nodeId}`,
        locator: null, restatementStatus: "PASS" as const, loadBearing: index === 0
      })),
      factBundle: buildFactBundle({
        facts: ["A position."], residualObjections: [], badges: [], conditionMarks: [],
        reversalPoint: "A contrary measurement would reverse this.",
        buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null
      }),
      compositionBudget: { tier: "low", bound: TIERS.low, registerRowKey: "compositionBundleBudget", registerVersion: 1, sourceRef: "test-layer:M4" },
      candidateConfidenceBand: "medium",
      digestNodes: nodes,
      servedRootNodeId: uuid(0),
      codeLabel: { verdictLabel: "CONTESTED", servedNodeId: uuid(0), servedStrength: 0.6, margin: null, registerVersion: 1 },
      synthesisRoleControls: { synthesizerRoleRef: "provider:w", evaluatorRoleRef: "provider:c", evaluatorLoopMaxRounds: 2 }
    }, dependencies);
    expect(result.crashClass).toBeNull();
    expect(["SERVED", "DOWNGRADED"]).toContain(result.terminal);
    expect(result.gateTrace).toContain("DIGEST_COMPRESSED");
    expect(result.conditionMarks).toContain(DIGEST_COMPRESSED_MARK);
    expect(result.digest?.compressionLevel).toBe(SPINE);
    expect(cited.every((nodeId) => nodes.some((node) => node.nodeId === nodeId))).toBe(true);
    expect(result.segments[0]!.assertedNodeRefs).toEqual(cited);
  });
});

/* ---------------------------------------------------------------- disclosure */

describe("M4 · the owner's row carries the rung and the points left out", () => {
  const ids = Object.freeze({
    answerId: "00000000-0000-4000-8000-00000000a001",
    answerVersion: 1,
    runId: "00000000-0000-4000-8000-00000000b001"
  });
  const row = (digest: ReturnType<typeof serveDisclosureDigestFacts>) => buildServeDisclosureRecord({
    ...ids,
    planned: { writerRef: "provider:a", checkerRef: "provider:b" },
    served: { writerRef: "provider:a", checkerRef: "provider:b" },
    body: { bodyStop: null, pointsWithoutReview: null },
    serveStop: null,
    digest
  });

  it("names the spine rung and counts what it left out", () => {
    const spine = fitted(buildSynthesisDigest({ nodes: measuredTree(195), servedRootNodeId: uuid(0), budgetBound: TIERS.low }));
    const facts = serveDisclosureDigestFacts(spine);
    expect(facts).toEqual({ rung: SPINE, pointsOmitted: 195 - spine.nodes.length });
    expect(row(facts)).toMatchObject({ digestRung: SPINE, digestPointsOmitted: 195 - spine.nodes.length });
  });

  it("records rung 0 with nothing left out for a digest that fitted whole", () => {
    const whole = fitted(buildSynthesisDigest({ nodes: measuredTree(10), servedRootNodeId: uuid(0), budgetBound: TIERS.high }));
    expect(row(serveDisclosureDigestFacts(whole))).toMatchObject({ digestRung: 0, digestPointsOmitted: 0 });
  });

  it("records the compact rung with nothing left out", () => {
    const compact = ladderOf(measuredTree(60)).find((attempt) => attempt.digest.compressionLevel === COMPACT)!.digest;
    expect(serveDisclosureDigestFacts(compact)).toEqual({ rung: COMPACT, pointsOmitted: 0 });
  });

  it("leaves both null when no digest was handed to the answer-writer", () => {
    expect(serveDisclosureDigestFacts(null)).toBeNull();
    expect(row(null)).toMatchObject({ digestRung: null, digestPointsOmitted: null });
  });
});
