import type { MapChoice, MapKeyPoint } from "@debateai/map";

/**
 * Debate shape (spec 2026-10-12 §3.3) — THE PLAN, in the runner's own vocabulary: P roots (plan positions 0..P−1) and
 * one breadth-first leg list whose plan positions follow the roots. Round 1 holds every position's chosen points, then
 * one cross-reply per position; each deeper round holds one reply and one defence per chosen point, extending that
 * point's linear chain (fixed: every chain; adaptive: the chains `shape-select.ts` keeps at the round-1 boundary).
 * Parents always precede children, so the ordered recorders, review batches and round boundaries work unchanged; the
 * scrutiny slots are reserved after the plan and filled once scrutiny has chosen its nodes.
 */
export type ShapeLegKind = "POINT" | "CROSS" | "REPLY" | "DEFENCE";
export interface ShapeLeg {
  readonly kind: ShapeLegKind;
  readonly round: number;
  readonly rootIndex: number;
  readonly parentIndex: number;
  readonly childIndex: number;
  readonly polarity: "support" | "attack";
  readonly authorIndex: number;
  readonly siblingOrdinal: number;
  readonly chain: number | null;
  readonly consideration: string | null;
  readonly keyPointId: string | null;
  readonly targetRootIndex: number | null;
  readonly callSiteKey: string;
}
export type ShapePointSpec = Readonly<{ polarity: "support" | "attack"; consideration: string | null; keyPointId: string | null }>;
export type ShapePositionPlan = Readonly<{ answerId: string | null; statement: string | null; mapPoints: string | null;
  points: readonly ShapePointSpec[]; rivalIndex: number }>;
export type ShapeScrutinySlots = Readonly<{ start: number; nodesPerDebate: number; roundsPerNode: number; count: number }>;
export type ShapePlan = Readonly<{ rootCount: number; legs: readonly ShapeLeg[]; scrutiny: ShapeScrutinySlots; totalPlannedNodes: number }>;

const role = (polarity: "support" | "attack"): string => (polarity === "support" ? "defender" : "critic");
/** Every shape leg's key names its OWN plan position (`p<n>`): unique per node, and inside 0069's code shape. */
const legKey = (polarity: "support" | "attack", rootIndex: number, round: number, position: number): string =>
  `JUDGE:${role(polarity)}:root${String(rootIndex)}:r${String(round)}:p${String(position)}`;

/** Spec §3.3 step 3: against first, then for; at least one of each when both exist and K allows two. */
export function shapeRoundOnePoints(forIds: readonly string[], againstIds: readonly string[], k: number):
  readonly Readonly<{ polarity: "support" | "attack"; keyPointId: string }>[] {
  const keepOneFor = forIds.length > 0 && againstIds.length > 0 && k >= 2 ? 1 : 0;
  const against = againstIds.slice(0, Math.max(0, k - keepOneFor));
  const supporting = forIds.slice(0, Math.max(0, k - against.length));
  return Object.freeze([
    ...against.map((keyPointId) => Object.freeze({ polarity: "attack" as const, keyPointId })),
    ...supporting.map((keyPointId) => Object.freeze({ polarity: "support" as const, keyPointId }))
  ]);
}

const nextRival = (index: number, count: number): number => (index + 1) % count;

export function shapePositionsFromMap(input: Readonly<{ choice: MapChoice; keyPoints: readonly MapKeyPoint[]; answers: number; pointsPerAnswer: number }>): readonly ShapePositionPlan[] {
  const claimOf = new Map(input.keyPoints.map((keyPoint) => [keyPoint.keyPointId, keyPoint.claim] as const));
  const answers = input.choice.answers.slice(0, input.answers);
  return Object.freeze(answers.map((answer, index): ShapePositionPlan => {
    const rival = answers.findIndex((other) => other.answerId === answer.strongestRival);
    const claims = (ids: readonly string[]) => ids.flatMap((id) => claimOf.get(id) ?? []);
    return Object.freeze({
      answerId: answer.answerId,
      statement: answer.statement,
      mapPoints: JSON.stringify({ for: claims(answer.forKeyPointIds), against: claims(answer.againstKeyPointIds) }),
      points: Object.freeze(shapeRoundOnePoints(answer.forKeyPointIds, answer.againstKeyPointIds, input.pointsPerAnswer)
        .flatMap((point) => { const claim = claimOf.get(point.keyPointId); return claim === undefined ? [] : [Object.freeze({ ...point, consideration: claim })]; })),
      rivalIndex: rival < 0 || rival === index ? nextRival(index, answers.length) : rival
    });
  }));
}

/** Spec §1.2 + P2a deviation 5: the map was unavailable — today's opening for the first P seats, at most K points each. */
export function shapePositionsForTodaysOpening(input: Readonly<{ answers: number; pointsPerAnswer: number }>): readonly ShapePositionPlan[] {
  return Object.freeze(Array.from({ length: input.answers }, (_unused, index): ShapePositionPlan => Object.freeze({
    answerId: null, statement: null, mapPoints: null,
    points: Object.freeze(Array.from({ length: input.pointsPerAnswer }, (_point, at): ShapePointSpec =>
      Object.freeze({ polarity: at % 2 === 0 ? "attack" : "support", consideration: null, keyPointId: null }))),
    rivalIndex: nextRival(index, input.answers)
  })));
}

export function buildShapePlan(input: Readonly<{ positions: readonly ShapePositionPlan[]; depth: number;
  scrutiny: Readonly<{ roundsPerPoint: number; pointsPerDebate: number }> }>): ShapePlan {
  const rootCount = input.positions.length;
  if (rootCount < 2 || !Number.isSafeInteger(input.depth) || input.depth < 1) throw new TypeError("SHAPE_PLAN_INPUT_INVALID");
  const legs: ShapeLeg[] = [];
  const children = new Map<number, number>();
  const ordinal = (parent: number): number => { const next = (children.get(parent) ?? 0) + 1; children.set(parent, next); return next; };
  let next = rootCount;
  const push = (leg: Omit<ShapeLeg, "childIndex" | "siblingOrdinal" | "authorIndex" | "callSiteKey">, key: (position: number) => string): ShapeLeg => {
    const childIndex = next;
    next += 1;
    const made: ShapeLeg = Object.freeze({ ...leg, childIndex, authorIndex: leg.rootIndex, siblingOrdinal: ordinal(leg.parentIndex), callSiteKey: key(childIndex) });
    legs.push(made);
    return made;
  };
  input.positions.forEach((position, rootIndex) => {
    for (const point of position.points) {
      push({ kind: "POINT", round: 1, rootIndex, parentIndex: rootIndex, polarity: point.polarity, chain: null,
        consideration: point.consideration, keyPointId: point.keyPointId, targetRootIndex: null },
      (childIndex) => legKey(point.polarity, rootIndex, 1, childIndex));
    }
  });
  // A POINT's chain is itself: set after the push (its position is only known then).
  for (const [index, leg] of legs.entries()) legs[index] = Object.freeze({ ...leg, chain: leg.childIndex });
  input.positions.forEach((position, rootIndex) => {
    push({ kind: "CROSS", round: 1, rootIndex, parentIndex: rootIndex, polarity: "attack", chain: null, consideration: null,
      keyPointId: null, targetRootIndex: position.rivalIndex },
    () => `JUDGE:cross-root:${String(rootIndex)}->${String(position.rivalIndex)}`);
  });
  const chains = legs.filter((leg) => leg.kind === "POINT");
  const tips = new Map(chains.map((leg) => [leg.childIndex, leg.childIndex] as const));
  for (let round = 2; round <= input.depth; round += 1) {
    for (const chain of chains) {
      const reply = push({ kind: "REPLY", round, rootIndex: chain.rootIndex, parentIndex: tips.get(chain.childIndex)!, polarity: "attack",
        chain: chain.childIndex, consideration: null, keyPointId: chain.keyPointId, targetRootIndex: null },
      (childIndex) => legKey("attack", chain.rootIndex, round, childIndex));
      const defence = push({ kind: "DEFENCE", round, rootIndex: chain.rootIndex, parentIndex: reply.childIndex, polarity: "attack",
        chain: chain.childIndex, consideration: null, keyPointId: chain.keyPointId, targetRootIndex: null },
      (childIndex) => legKey("attack", chain.rootIndex, round, childIndex));
      tips.set(chain.childIndex, defence.childIndex);
    }
  }
  const start = rootCount + legs.length;
  const count = 2 * input.scrutiny.roundsPerPoint * input.scrutiny.pointsPerDebate;
  return Object.freeze({
    rootCount, legs: Object.freeze(legs),
    scrutiny: Object.freeze({ start, nodesPerDebate: input.scrutiny.pointsPerDebate, roundsPerNode: input.scrutiny.roundsPerPoint, count }),
    totalPlannedNodes: start + count
  });
}

/**
 * Spec §3.3 step 7: the scrutiny legs for the nodes scrutiny chose (in its rank order). Slot of rank q in scrutiny
 * round s: reply at start + ((s−1)·Qmax + q)·2, its defence right after; a node's first reply takes the next sibling
 * ordinal under it (after every leg the plan put there), each later one extends the node's own scrutiny chain.
 */
export function buildScrutinyLegs(input: Readonly<{ plan: ShapePlan; depth: number; selected: readonly Readonly<{ position: number; rootIndex: number }>[] }>): readonly ShapeLeg[] {
  const { plan } = input;
  const selected = input.selected.slice(0, plan.scrutiny.nodesPerDebate);
  const legs: ShapeLeg[] = [];
  const tips = new Map(selected.map((node) => [node.position, node.position] as const));
  for (let round = 1; round <= plan.scrutiny.roundsPerNode; round += 1) {
    selected.forEach((node, rank) => {
      const replyAt = plan.scrutiny.start + ((round - 1) * plan.scrutiny.nodesPerDebate + rank) * 2;
      const parent = tips.get(node.position)!;
      const firstOrdinal = plan.legs.filter((leg) => leg.parentIndex === parent).length + 1;
      const common = { rootIndex: node.rootIndex, authorIndex: node.rootIndex, polarity: "attack" as const, chain: node.position,
        consideration: null, keyPointId: null, targetRootIndex: null, round: input.depth + round };
      legs.push(Object.freeze({ ...common, kind: "REPLY" as const, parentIndex: parent, childIndex: replyAt,
        siblingOrdinal: parent === node.position ? firstOrdinal : 1, callSiteKey: legKey("attack", node.rootIndex, input.depth + round, replyAt) }));
      legs.push(Object.freeze({ ...common, kind: "DEFENCE" as const, parentIndex: replyAt, childIndex: replyAt + 1,
        siblingOrdinal: 1, callSiteKey: legKey("attack", node.rootIndex, input.depth + round, replyAt + 1) }));
      tips.set(node.position, replyAt + 1);
    });
  }
  return Object.freeze(legs);
}

/**
 * How many nodes the plan can make at most — what P2a's `debateShapeSiteCounts(shape, depth).nodes` priced — COUNTED
 * FROM THE PLAN'S OWN LEGS, never re-derived from a formula (pre-flight PF-B29): the roots, every round-1 leg, the
 * deeper legs of every chain (fixed) or of the first `deeperTopPoints` chains of each position (adaptive: the most chains
 * `shapeSelectChains` keeps, and every chain has as many deeper legs as any other), and the scrutiny slots. A plan with a
 * leg deeper than `depth` is refused: the ceiling was never minted for it.
 */
export function shapeRunnableNodeCount(plan: ShapePlan, depth: number, depthMode: "fixed" | "adaptive", deeperTopPoints: number): number {
  if (plan.legs.some((leg) => leg.round > depth)) throw new TypeError("SHAPE_PLAN_DEEPER_THAN_PRICED");
  const kept = new Set<number>();
  for (let rootIndex = 0; rootIndex < plan.rootCount; rootIndex += 1) {
    const chains = plan.legs.filter((leg) => leg.kind === "POINT" && leg.rootIndex === rootIndex).map((leg) => leg.childIndex);
    for (const chain of depthMode === "fixed" ? chains : chains.slice(0, deeperTopPoints)) kept.add(chain);
  }
  const runnable = plan.legs.filter((leg) => leg.round === 1 || (leg.chain !== null && kept.has(leg.chain)));
  return plan.rootCount + runnable.length + plan.scrutiny.count;
}
