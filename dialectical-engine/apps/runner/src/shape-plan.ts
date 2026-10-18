import { MAP_LIMITS, type MapChoice, type MapKeyPoint, type MapRestsOn } from "@debateai/map";

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
/** Engine 2 (spec §5.2 rule 4): a key point given to a position's writer UNSIDED, with what it rests on. */
export type ShapeRaisedPoint = Readonly<{ text: string; restsOn: MapRestsOn | null }>;
export type ShapePositionPlan = Readonly<{ answerId: string | null; statement: string | null; mapPoints: string | null;
  points: readonly ShapePointSpec[]; rivalIndex: number;
  /** Engine 2 only: the chosen answer's assumptions (AI-written), for its writer. */
  assumptions?: readonly string[];
  /** Engine 2 only: the points raised to its writer unsided. */
  pointsRaised?: readonly ShapeRaisedPoint[] }>;

/** Today's generic legs for a position with no chosen points: K alternating attack / support, no consideration. */
export function shapeGenericPoints(k: number): readonly ShapePointSpec[] {
  return Object.freeze(Array.from({ length: k }, (_point, at): ShapePointSpec =>
    Object.freeze({ polarity: at % 2 === 0 ? "attack" : "support", consideration: null, keyPointId: null })));
}
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

/**
 * ENGINE 2'S RIVAL-REPLY RING (spec 2026-10-15 §4.2a rule 1, ruling E6(1); INTERFACE §7.1): every answer replies to
 * exactly one rival and receives exactly one reply, so no answer goes unanswered and none is answered twice. Built
 * from the chooser's "strongest rival" names (`preferred[i]`: an index, or null for none). Answers are taken in index
 * order: a named rival with no reply yet is kept; a taken name (or none) moves to the next answer after it, in index
 * order and round the end, that has no reply yet and is not the answer itself. Only the last answer can be left with
 * nobody but itself: it then swaps with the answer holding its own named rival (so its name is kept), or with answer 0
 * when it named none. A name equal to the answer's own index, or out of range, reads as none. Pure; one reply per
 * answer, so the cross-reply call count is unchanged.
 */
export function shapeRivalRing(preferred: readonly (number | null)[]): readonly number[] {
  const count = preferred.length;
  if (count < 2) throw new TypeError("SHAPE_RIVAL_RING_INVALID");
  const named = (index: number): number | null => {
    const name = preferred[index] ?? null;
    return name !== null && Number.isSafeInteger(name) && name >= 0 && name < count && name !== index ? name : null;
  };
  const targets: number[] = [];
  const received = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const name = named(index);
    let pick: number | null = name !== null && !received.has(name) ? name : null;
    for (let step = 1; pick === null && step <= count; step += 1) {
      const candidate = ((name ?? index) + step) % count;
      if (candidate !== index && !received.has(candidate)) pick = candidate;
    }
    if (pick === null) {
      // The last answer, and the one answer without a reply is itself: swap, keeping its own name when it has one.
      const swapWith = name === null ? 0 : targets.indexOf(name);
      pick = targets[swapWith]!;
      targets[swapWith] = index;
    }
    targets.push(pick);
    received.add(pick);
  }
  return Object.freeze(targets);
}

/**
 * The map's P answers as positions. `ring` (engine 2, INTERFACE §7.1): every rival comes from `shapeRivalRing`; absent or
 * false (engine 1): the chooser's rival, else the next position, value for value as before R2.
 */
export function shapePositionsFromMap(input: Readonly<{ choice: MapChoice; keyPoints: readonly MapKeyPoint[]; answers: number;
  pointsPerAnswer: number; ring?: boolean;
  /** Engine 2 (R3): labelled points, generic legs for an unsided answer, its points raised and assumptions. */
  engineMap?: boolean }>): readonly ShapePositionPlan[] {
  const claimOf = new Map(input.keyPoints.map((keyPoint) => [keyPoint.keyPointId, keyPoint.claim] as const));
  const keyPointOf = new Map(input.keyPoints.map((keyPoint) => [keyPoint.keyPointId, keyPoint] as const));
  const answers = input.choice.answers.slice(0, input.answers);
  // The chooser's named rival as an index; an id not among the answers, or the answer itself, names none.
  const named = answers.map((answer, index): number | null => {
    const rival = answers.findIndex((other) => other.answerId === answer.strongestRival);
    return rival < 0 || rival === index ? null : rival;
  });
  const ring = input.ring === true && answers.length >= 2 ? shapeRivalRing(named) : null;
  return Object.freeze(answers.map((answer, index): ShapePositionPlan => {
    const claims = (ids: readonly string[]) => ids.flatMap((id) => claimOf.get(id) ?? []);
    const labelled = (ids: readonly string[]) => ids.flatMap((id) => { const keyPoint = keyPointOf.get(id);
      return keyPoint === undefined ? [] : [{ text: keyPoint.claim, rests_on: keyPoint.restsOn ?? null }]; });
    const sidedPoints = shapeRoundOnePoints(answer.forKeyPointIds, answer.againstKeyPointIds, input.pointsPerAnswer)
      .flatMap((point) => { const claim = claimOf.get(point.keyPointId); return claim === undefined ? [] : [Object.freeze({ ...point, consideration: claim })]; });
    const engine = input.engineMap === true;
    return Object.freeze({
      answerId: answer.answerId,
      statement: answer.statement,
      mapPoints: engine ? JSON.stringify({ for: labelled(answer.forKeyPointIds), against: labelled(answer.againstKeyPointIds) })
        : JSON.stringify({ for: claims(answer.forKeyPointIds), against: claims(answer.againstKeyPointIds) }),
      // Spec §5.2 rule 4: an unsided answer (code-chosen, code-filled, or a merged replacement) gets today's generic legs.
      points: Object.freeze(engine && sidedPoints.length === 0 ? [...shapeGenericPoints(input.pointsPerAnswer)] : sidedPoints),
      rivalIndex: ring === null ? named[index] ?? nextRival(index, answers.length) : ring[index]!,
      ...(engine ? {
        assumptions: Object.freeze([...(answer.assumptions ?? [])]),
        pointsRaised: Object.freeze((answer.pointsRaised ?? []).flatMap((id) => { const keyPoint = keyPointOf.get(id);
          return keyPoint === undefined ? [] : [Object.freeze({ text: keyPoint.claim, restsOn: keyPoint.restsOn ?? null })]; }))
      } : {})
    });
  }));
}

/**
 * Spec §1.2 + P2a deviation 5: the map was unavailable — today's opening for the first P seats, at most K points each.
 * Its rivals already form a ring (each replies to the next); `ring` (engine 2) builds the same one through
 * `shapeRivalRing`, so both engines give the same rivals here.
 */
export function shapePositionsForTodaysOpening(input: Readonly<{ answers: number; pointsPerAnswer: number; ring?: boolean }>): readonly ShapePositionPlan[] {
  const ring = input.ring === true && input.answers >= 2
    ? shapeRivalRing(Array.from({ length: input.answers }, () => null)) : null;
  return Object.freeze(Array.from({ length: input.answers }, (_unused, index): ShapePositionPlan => Object.freeze({
    answerId: null, statement: null, mapPoints: null,
    points: shapeGenericPoints(input.pointsPerAnswer),
    rivalIndex: ring === null ? nextRival(index, input.answers) : ring[index]!
  })));
}

/**
 * How many positions a shaped run argues (pre-flight PF-B31): the receipt's P, lowered to the distinct makers left after
 * a sit-out, never below two — `buildShapePlan` refuses fewer, and a refusal would leave the run without an answer. A
 * missing position is handed over or dropped afterwards (Task 13), never planned away here.
 */
export function shapePositionCount(answers: number, makersLeft: number): number {
  if (!Number.isSafeInteger(answers) || answers < 2 || !Number.isSafeInteger(makersLeft) || makersLeft < 0) {
    throw new TypeError("SHAPE_POSITION_COUNT_INVALID");
  }
  // Ruling T-P5, defence in depth: never more positions than the map stores (MAP_LIMITS.chooseAnswersMax, 0117's
  // a1..a4), whatever the receipt says; the register already refuses a plan above it.
  return Math.max(2, Math.min(answers, makersLeft, MAP_LIMITS.chooseAnswersMax));
}

export function buildShapePlan(input: Readonly<{ positions: readonly ShapePositionPlan[]; depth: number;
  scrutiny: Readonly<{ roundsPerPoint: number; pointsPerDebate: number }> }>): ShapePlan {
  const rootCount = input.positions.length;
  if (rootCount < 2 || !Number.isSafeInteger(input.depth) || input.depth < 1) throw new TypeError("SHAPE_PLAN_INPUT_INVALID");
  // A cross-reply answers ANOTHER position of this plan: a rival out of range or the position itself is refused.
  input.positions.forEach((position, rootIndex) => {
    const rival = position.rivalIndex;
    if (!Number.isSafeInteger(rival) || rival < 0 || rival >= rootCount || rival === rootIndex) throw new TypeError("SHAPE_PLAN_RIVAL_INVALID");
  });
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
      // A POINT's chain is itself: `next` is the plan position `push` is about to give it.
      push({ kind: "POINT", round: 1, rootIndex, parentIndex: rootIndex, polarity: point.polarity, chain: next,
        consideration: point.consideration, keyPointId: point.keyPointId, targetRootIndex: null },
      (childIndex) => legKey(point.polarity, rootIndex, 1, childIndex));
    }
  });
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
 * FROM THE PLAN'S OWN LEGS, never re-derived from a formula (pre-flight PF-B29): the roots, every leg
 * `shapeRunnableLegs` keeps (all of them in fixed mode; adaptive drops only the deeper legs of the chains past the first
 * `deeperTopPoints` of each position — the most chains `shapeSelectChains` keeps, and every chain has as many deeper
 * legs as any other), and the scrutiny slots. A plan with a leg deeper than `depth` is refused: the ceiling was never
 * minted for it.
 */
export function shapeRunnableNodeCount(plan: ShapePlan, depth: number, depthMode: "fixed" | "adaptive", deeperTopPoints: number): number {
  return plan.rootCount + shapeRunnableLegs(plan, depth, depthMode, deeperTopPoints).length + plan.scrutiny.count;
}

/**
 * The plan's legs that can run: EVERY leg except the deeper legs of a chain adaptive mode drops (a chain past the first
 * `deeperTopPoints` of its position). A leg the rule does not recognise — a deeper leg with no chain — is counted, never
 * silently skipped (never under-count).
 */
export function shapeRunnableLegs(plan: ShapePlan, depth: number, depthMode: "fixed" | "adaptive", deeperTopPoints: number): readonly ShapeLeg[] {
  if (plan.legs.some((leg) => leg.round > depth)) throw new TypeError("SHAPE_PLAN_DEEPER_THAN_PRICED");
  const dropped = new Set<number>();
  if (depthMode === "adaptive") {
    for (let rootIndex = 0; rootIndex < plan.rootCount; rootIndex += 1) {
      const chains = plan.legs.filter((leg) => leg.kind === "POINT" && leg.rootIndex === rootIndex).map((leg) => leg.childIndex);
      for (const chain of chains.slice(deeperTopPoints)) dropped.add(chain);
    }
  }
  return Object.freeze(plan.legs.filter((leg) => leg.kind === "POINT" || leg.chain === null || !dropped.has(leg.chain)));
}

/**
 * Task 13 fix round 1 — WHETHER A PLAN POSITION CAN STILL BE ASKED, for a halted leg's planned count: a root or a leg
 * of today's plan always (`leg === null`); a deeper leg of a chain the adaptive choice dropped never; and, on an
 * adaptive run, a planned deeper leg (round 2..depth) only once the round-1 choice was made — a halted point is never
 * kept, so nothing under it can run. Scrutiny legs (past the depth) and fixed-mode legs are priced on their own.
 */
export function shapeLegCanRun(leg: Pick<ShapeLeg, "round"> | null, input: Readonly<{ deselected: boolean; adaptive: boolean;
  chosen: boolean; depth: number }>): boolean {
  if (leg === null) return true;
  if (input.deselected) return false;
  return !(input.adaptive && leg.round > 1 && leg.round <= input.depth && !input.chosen);
}
