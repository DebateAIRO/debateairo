import type { WayOfKnowing } from "@debateai/kernel";
import { READER_SENTENCE_WRITING, TypedDomainError, isRunLevelSpendStop } from "@debateai/kernel";
import { promptContractFingerprintText, type PromptContract } from "@debateai/providers";

/**
 * T9 — the synthesis serve chain (goal-v4 222-270; rulings S6-1..S6-4,
 * confirm-items 1 and 2).
 *
 * Three things live here, in the order the goal states them.
 *
 * 1. DIGEST. A deterministic ALL-NODE schema. One entry per materialized node
 *    at every rung but the last. The byte budget governs SUMMARY LENGTH per
 *    node (rungs 0-5), then the SHAPE of each entry (the compact rung: short
 *    refs, four-decimal strengths), so a decisive node that is neither a root
 *    nor one of the two surviving objections still reaches the synthesizer.
 *    The top-2 surviving objections and the runner-up positions are EMPHASIS
 *    fields laid OVER that total membership (S6-2) — they select what to
 *    stress, never what to send.
 *
 *    T9's MEMBERSHIP LAW, AMENDED (ENGINE MONEY RULE, spec §14.4.3, Task M4).
 *    The law was "the byte budget never changes membership". Measured: a
 *    debate of about 195 points cannot fit the low or medium tier with every
 *    node kept, in any entry shape that keeps the key names. So membership MAY
 *    drop, at the LAST rung only (the spine), ONLY when every earlier rung is
 *    over budget, and the drop is DISCLOSED: the answer carries
 *    DIGEST-COMPRESSED as at every compressed rung, the digest counts what it
 *    left out per position (`omittedPoints`), and the owner's record keeps the
 *    rung and the count. Only when even the smallest spine is over budget does
 *    the digest not exist.
 * 2. ROLES. SYNTHESIZER and EVALUATOR are named provider roles whose refs are
 *    read from T16's sealed rows (J8). Each call is fresh-context: the recorded
 *    request carries the named artifacts and NOTHING else — no debate
 *    transcript, no provider history. Initial and retry requests are
 *    DISTINGUISHED, so the loop converges by feedback and never by accident.
 * 3. LOOP. At most `evaluatorLoopMaxRounds` rounds (the sealed register row —
 *    never a code constant) or evaluator satisfied, whichever comes first.
 *    After the last round the statement is SERVED regardless, and a standing
 *    objection rides it as a visible condition mark (confirm-items 2-3).
 *
 * Nothing in this file returns a terminal. The chain in `./index.ts` owns the
 * terminal; this file owns the digest, the request shapes and the loop record.
 */

/* ------------------------------------------------------------------ digest */

/** One materialized node, as the digest's source hands it over. */
export interface DigestSourceNode {
  readonly nodeId: string;
  /** The node's statement in full. The digest summarises it; it never drops it. */
  readonly statement: string;
  /**
   * The propagated final strength, or `null` for a node the propagation run
   * produced no strength for (a hidden or excluded node). `null` is a real
   * value here, never a zero: a node with no number is still a MEMBER of the
   * digest, because membership is what the byte budget may not touch before
   * the last rung (Task M4).
   */
  readonly finalStrength: number | null;
  readonly wayOfKnowing: WayOfKnowing;
  readonly marks: readonly string[];
  readonly polarityRelations: readonly DigestPolarityRelation[];
  /** True for a node that is a served-root candidate (a maker position). */
  readonly isPosition: boolean;
  /** True for an objection that survived to the end of the debate. */
  readonly isSurvivingObjection: boolean;
  /**
   * ENGINE MONEY RULE (spec §14.4.3), TASK M4: the node's LEVERAGE — the most
   * any other node's propagated strength moves when this node is taken out
   * (propagation's sensitivity records, `digestLeverageByNodeId`). It is the
   * number the story ranks its most decisive points by, and here it does the
   * same: it chooses which points the spine rung keeps. It is never sent to a
   * model. Absent or null: the node is not ranked (it can still be kept as a
   * position, a direct child, or on a kept point's chain).
   */
  readonly leverage?: number | null;
}

export interface DigestPolarityRelation {
  readonly polarity: "support" | "attack";
  readonly targetNodeId: string;
}

/**
 * One digest entry. At rungs 0-5 every field except `statementSummary` is
 * verbatim. At the compact and spine rungs (Task M4) `nodeId` and each
 * relation's `targetNodeId` are the digest's short refs (`n1`, `n2`, …; the
 * runner maps a cited ref back, `resolveDigestNodeRef`), `finalStrength` is
 * rounded to four decimals, and the key names are unchanged.
 */
export interface DigestNodeEntry {
  readonly nodeId: string;
  readonly statementSummary: string;
  /** True when the summary is shorter than the statement it stands for. */
  readonly summaryTruncated: boolean;
  readonly finalStrength: number | null;
  readonly wayOfKnowing: WayOfKnowing;
  readonly marks: readonly string[];
  readonly polarityRelations: readonly DigestPolarityRelation[];
}

/**
 * S6-2: emphasis over total membership. These node ids are ALSO present in
 * `nodes` — this field says which of them to stress, never which to send. The
 * spine rung keeps every emphasised node (with its chain), so that stays true.
 */
export interface DigestEmphasis {
  readonly topSurvivingObjectionNodeIds: readonly string[];
  readonly runnerUpPositionNodeIds: readonly string[];
}

/**
 * ENGINE MONEY RULE (spec §14.4.3), TASK M4: the points the spine rung left
 * out, counted per position by their NET stance toward it — the relations on
 * the chain that reached them, each attack flipping the sign (the story's
 * `omitted` rule). `positionNodeId` is the position's digest ref, or null for
 * points no position reaches; those count by their own first relation.
 */
export interface DigestOmittedPoints {
  readonly positionNodeId: string | null;
  readonly supporting: number;
  readonly attacking: number;
}

export interface SynthesisDigest {
  /**
   * One entry per materialized node at rungs 0-6. At the spine rung (7) only
   * the spine's nodes, and `omittedPoints` counts the rest.
   */
  readonly nodes: readonly DigestNodeEntry[];
  readonly emphasis: DigestEmphasis;
  /**
   * The ladder rung this digest was built at (`DIGEST_LADDER`): 0-5 index
   * `DIGEST_COMPRESSION_LEVELS` (0 = no compression applied), then the compact
   * rung and the spine rung.
   */
  readonly compressionLevel: number;
  readonly summaryCharacterCap: number | null;
  /** Present at the spine rung only (Task M4). */
  readonly omittedPoints?: readonly DigestOmittedPoints[];
  readonly byteSize: number;
}

/**
 * The per-node summary caps the digest tightens through, widest first. `null`
 * is "the statement verbatim". The LAST entry is the tightest summary; the
 * compact and spine rungs (`DIGEST_LADDER`, Task M4) keep it. If even the
 * smallest spine exceeds the budget, the digest CANNOT EXIST and the outcome
 * is loud — never a silent subset of the membership.
 */
export const DIGEST_COMPRESSION_LEVELS: readonly (number | null)[] =
  Object.freeze([null, 480, 240, 120, 60, 24]);

/**
 * How many surviving objections the emphasis field carries (S6-2: top-2).
 *
 * Deliberately NOT exported — this is the carrier form the source-purity law
 * accepts for it. That law refuses an EXPORTED numeric literal outside
 * packages/published-arithmetic because a published number is a policy value
 * that belongs in a register/law carrier. This one is not policy: it is the
 * cardinality the S6-2 ruling fixes, it has exactly one call site (the emphasis
 * selection below), and no surface outside this file has ever imported it. A
 * deployment must not be able to reseal it, which is what a register row would
 * mean. The audit's GOAL_RULED_LAW_CARRIERS reconciliation is for constants the
 * goal ORDERS to be exported and imported elsewhere (T1's EXPANSION_DEPTH_MAX);
 * naming this one there would widen a deliberately narrow exemption for a
 * symbol nothing imports. The file's real policy value is the evaluator loop
 * bound, and it is a sealed register row (`evaluatorLoopMaxRounds`), never a
 * code constant — see the header above.
 */
const DIGEST_EMPHASIS_OBJECTION_COUNT = 2;

/** The mark a digest that had to be tightened to fit the budget rides on. */
export const DIGEST_COMPRESSED_MARK = "DIGEST-COMPRESSED" as const;

/** The mark the digest-cannot-exist crash class rides on. */
export const DIGEST_CANNOT_EXIST_MARK = "DIGEST-CANNOT-EXIST" as const;

/** F4 / J25: the envelope terminal fired with the R9 restatement FAILING. */
export const PROTECTED_CORE_GUARD_RETIRED_MARK = "PROTECTED-CORE-GUARD-RETIRED" as const;

/** The mark a served statement carrying an unsatisfied objection rides on. */
export const SYNTHESIS_OBJECTION_STANDING_MARK = "SYNTHESIS-OBJECTION-STANDING" as const;

export type DigestOutcome =
  | { readonly kind: "DIGEST"; readonly digest: SynthesisDigest; readonly marks: readonly string[] }
  | {
      readonly kind: "DIGEST_CANNOT_EXIST";
      /**
       * The size of the LAST rung the ladder tried: the smallest spine, or the
       * compact rung when no spine can leave anything out (Task M4).
       */
      readonly byteSizeAtMaxCompression: number;
      readonly budgetBound: number;
      readonly marks: readonly string[];
    };

function summarise(statement: string, cap: number | null): { text: string; truncated: boolean } {
  if (cap === null || statement.length <= cap) return { text: statement, truncated: false };
  // Provenance-preserving: the summary says it is one, so a reader of the
  // digest can never mistake a shortened statement for the whole statement.
  const ellipsis = "…";
  let end = Math.max(0, cap - ellipsis.length);
  // Task M4 review round 2: the cut falls on a code-point boundary. Cutting
  // between the two halves of a character outside the basic plane (an emoji)
  // left a lone half, which JSON escapes to six bytes — so a SHORTER summary
  // could cost MORE bytes. The cut steps back one unit instead; every other
  // summary is byte for byte what it was.
  const lastUnit = statement.charCodeAt(end - 1);
  if (end > 0 && lastUnit >= 0xd800 && lastUnit <= 0xdbff) end -= 1;
  return { text: `${statement.slice(0, end)}${ellipsis}`, truncated: true };
}

function compressAt(
  nodes: readonly DigestSourceNode[],
  emphasis: DigestEmphasis,
  levelIndex: number
): SynthesisDigest {
  const cap = DIGEST_COMPRESSION_LEVELS[levelIndex] ?? null;
  const entries: DigestNodeEntry[] = nodes.map((node) => {
    const summary = summarise(node.statement, cap);
    return Object.freeze({
      nodeId: node.nodeId,
      statementSummary: summary.text,
      summaryTruncated: summary.truncated,
      finalStrength: node.finalStrength,
      wayOfKnowing: node.wayOfKnowing,
      marks: Object.freeze([...node.marks]),
      polarityRelations: Object.freeze(node.polarityRelations.map((relation) => Object.freeze({ ...relation })))
    });
  });
  const shape = {
    nodes: entries,
    emphasis,
    compressionLevel: levelIndex,
    summaryCharacterCap: cap
  };
  return Object.freeze({
    ...shape,
    nodes: Object.freeze(entries),
    byteSize: Buffer.byteLength(JSON.stringify(shape), "utf8")
  });
}

/**
 * Emphasis selection. Deterministic: strongest first, node id breaks a tie —
 * the same total order T10 uses for the served root, for the same reason
 * (configuration order must not be able to change what the synthesizer is
 * told to stress).
 */
function selectEmphasis(
  nodes: readonly DigestSourceNode[],
  servedRootNodeId: string
): DigestEmphasis {
  const byStrengthThenId = (
    left: DigestSourceNode,
    right: DigestSourceNode
  ): number => (right.finalStrength ?? -1) - (left.finalStrength ?? -1)
    || left.nodeId.localeCompare(right.nodeId);
  return Object.freeze({
    topSurvivingObjectionNodeIds: Object.freeze(
      nodes.filter((node) => node.isSurvivingObjection)
        .sort(byStrengthThenId)
        .slice(0, DIGEST_EMPHASIS_OBJECTION_COUNT)
        .map((node) => node.nodeId)
    ),
    runnerUpPositionNodeIds: Object.freeze(
      nodes.filter((node) => node.isPosition && node.nodeId !== servedRootNodeId)
        .sort(byStrengthThenId)
        .map((node) => node.nodeId)
    )
  });
}

/**
 * ENGINE MONEY RULE (spec §14.4.3), TASK M4 — THE TWO RUNGS AFTER THE SUMMARY
 * LEVELS. Each is tried only when every rung before it is over the budget.
 *
 *  · `compactRung` — EVERY node kept. Node ids and relation targets become
 *    short refs (`n1`, `n2`, …: the positions first, strongest first, then each
 *    position's tree in order, then the rest in the order they were handed in),
 *    each strength is rounded to four decimals, and the summary takes the
 *    tightest cap. The key names are rung 0's, so the prompt contract TEXT —
 *    and with it the composer and conformance hashes — does not change.
 *  · `spineRung` — the ONLY rung where membership drops. It keeps the
 *    positions, every point that answers a position directly, and the most
 *    decisive points (the story's definition: the top points by leverage,
 *    never a position, the node id breaking a tie), each with its chain up to
 *    its position; the rest become `omittedPoints` counts. The decisive set
 *    shrinks through `spineDecisiveCounts` (the first is the story's 20) before
 *    the digest is declared impossible. The spine's refs are numbered
 *    contiguously, `n1` to `nK` over its own members (review fix M-3), so no
 *    gap invites a citation of a point it left out. Three more kinds of node stay to the
 *    last step, as the positions and their direct children do: the served root,
 *    the emphasised objections (S6-2 says they are members, and the synthesizer
 *    is told to stress them), each with its chain, and a node with no relation
 *    at all, which has no position to be counted under (the story keeps those
 *    too).
 *
 * THE SPINE USES ITS ROOM (review fix I-2). The first spine that fits is
 * built at the tightest summary, which is about four words. After it, and at
 * the spine rung ONLY, the builder tries EVERY step of `spineWidenings` — more
 * points, then longer summaries, alternately — and serves the LAST step, in
 * schedule order, that fits. It does not stop at the first step over budget:
 * sizes grow along the walk for ordinary text, but not for every text (a
 * verbatim statement can be no longer in bytes than its clipped summary), so a
 * fitting later step is never skipped (review round 2). When the spine that fit keeps fewer decisive points than
 * the walk's first step, the walk first widens that spine's own summaries to
 * the first step's cap (`(K, 60)` for the K that fit), so a tight budget gets
 * longer summaries before it could ever afford more points. `decisiveCount`
 * null is every ranked point; `summaryCap` null is the statement verbatim.
 * Above 120 points the walk climbs in steps of 40 up to 480 (owner ruling
 * 2026-10-29), so a large debate keeps as many points as fit.
 *
 * Both rungs keep the compressed mark the summary levels ride on; no new mark
 * exists, so the sealed chain's `.marks` pass-through is unchanged. The disclosure
 * of a dropped membership is the owner's record (`digestPointsOmitted`).
 */
export const DIGEST_LADDER = Object.freeze({
  compactRung: DIGEST_COMPRESSION_LEVELS.length,
  spineRung: DIGEST_COMPRESSION_LEVELS.length + 1,
  spineDecisiveCounts: Object.freeze([20, 10, 5, 0]) as readonly number[],
  spineWidenings: Object.freeze([
    Object.freeze({ decisiveCount: 20, summaryCap: 60 }),
    Object.freeze({ decisiveCount: 30, summaryCap: 60 }),
    Object.freeze({ decisiveCount: 30, summaryCap: 120 }),
    Object.freeze({ decisiveCount: 40, summaryCap: 120 }),
    Object.freeze({ decisiveCount: 60, summaryCap: 120 }),
    Object.freeze({ decisiveCount: 60, summaryCap: 240 }),
    Object.freeze({ decisiveCount: 80, summaryCap: 240 }),
    Object.freeze({ decisiveCount: 80, summaryCap: 480 }),
    Object.freeze({ decisiveCount: 120, summaryCap: 480 }),
    // Owner ruling 2026-10-29 (MORNING-2026-10-17 item 9, "finer steps in between"): above 120 points, a rung every 40
    // up to 480, so the writer gets the largest that fits rather than 120 or every point. The whole-statement ladder
    // (LG-E, R4's branch) takes its decisive counts from this schedule.
    Object.freeze({ decisiveCount: 160, summaryCap: 480 }),
    Object.freeze({ decisiveCount: 200, summaryCap: 480 }),
    Object.freeze({ decisiveCount: 240, summaryCap: 480 }),
    Object.freeze({ decisiveCount: 280, summaryCap: 480 }),
    Object.freeze({ decisiveCount: 320, summaryCap: 480 }),
    Object.freeze({ decisiveCount: 360, summaryCap: 480 }),
    Object.freeze({ decisiveCount: 400, summaryCap: 480 }),
    Object.freeze({ decisiveCount: 440, summaryCap: 480 }),
    Object.freeze({ decisiveCount: 480, summaryCap: 480 }),
    Object.freeze({ decisiveCount: null, summaryCap: null })
  ]) as readonly Readonly<{ decisiveCount: number | null; summaryCap: number | null }>[]
});

/** What the ladder tried at one rung, in order; the builder serves the first that fits. */
export interface SynthesisDigestAttempt {
  readonly digest: SynthesisDigest;
  /**
   * At the spine rung, how many most-decisive points this spine keeps (every
   * ranked point's count for a widening step with no limit); null below it.
   */
  readonly spineDecisiveCount: number | null;
}

/** Strengths travel at four decimals at the compact and spine rungs, like the story's scores. */
function digestStrength(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Node ids compared by code unit, as the story compares them. */
function compareDigestIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface DigestTreeEntry {
  readonly parent: string;
  readonly polarity: "support" | "attack";
  readonly root: string;
}

/**
 * The debate as a tree, mirrored from the story's `storyTreeOf`
 * (packages/story/src/material.ts; `serve` may not import `story`, so the
 * definition is copied and the two are pinned against each other by
 * `tests/unit/m4-digest-ladder.test.ts`). Children are taken in the order the
 * relations were handed in: node by node, each node's relations in turn.
 */
interface DigestTree {
  /** node id -> short ref, over every node. */
  readonly refOf: ReadonlyMap<string, string>;
  readonly nodesInRefOrder: readonly DigestSourceNode[];
  /** The positions, strongest first: the order they are numbered and counted in. */
  readonly positionIds: readonly string[];
  /** Every node a position reaches: the node it was reached through, the relation's polarity, the position. */
  readonly tree: ReadonlyMap<string, DigestTreeEntry>;
  /** node id -> the in-digest nodes it supports and attacks. */
  readonly links: ReadonlyMap<string, { readonly supports: readonly string[]; readonly attacks: readonly string[] }>;
}

function digestTreeOf(nodes: readonly DigestSourceNode[]): DigestTree {
  const byId = new Map(nodes.map((node) => [node.nodeId, node] as const));
  const positions = nodes
    .filter((node) => node.isPosition)
    .sort((left, right) => (right.finalStrength ?? -Infinity) - (left.finalStrength ?? -Infinity)
      || compareDigestIds(left.nodeId, right.nodeId));
  const children = new Map<string, { readonly source: string; readonly polarity: "support" | "attack" }[]>();
  const links = new Map<string, { readonly supports: string[]; readonly attacks: string[] }>();
  for (const node of nodes) {
    for (const relation of node.polarityRelations) {
      // A relation onto a node outside this digest links no two of its points.
      if (!byId.has(relation.targetNodeId)) continue;
      const link = links.get(node.nodeId) ?? { supports: [], attacks: [] };
      const list = relation.polarity === "support" ? link.supports : link.attacks;
      if (list.includes(relation.targetNodeId)) continue;
      list.push(relation.targetNodeId);
      links.set(node.nodeId, link);
      const below = children.get(relation.targetNodeId) ?? [];
      below.push({ source: node.nodeId, polarity: relation.polarity });
      children.set(relation.targetNodeId, below);
    }
  }
  const refOf = new Map<string, string>();
  const order: DigestSourceNode[] = [];
  const tree = new Map<string, DigestTreeEntry>();
  const assign = (nodeId: string): void => {
    refOf.set(nodeId, `n${String(refOf.size + 1)}`);
    const node = byId.get(nodeId);
    if (node !== undefined) order.push(node);
  };
  for (const position of positions) assign(position.nodeId);
  for (const position of positions) {
    const stack = [...(children.get(position.nodeId) ?? [])].reverse()
      .map((child) => ({ ...child, parent: position.nodeId }));
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === undefined || refOf.has(next.source)) continue;
      assign(next.source);
      tree.set(next.source, { parent: next.parent, polarity: next.polarity, root: position.nodeId });
      const below = children.get(next.source) ?? [];
      for (let index = below.length - 1; index >= 0; index -= 1) {
        const child = below[index];
        if (child !== undefined) stack.push({ ...child, parent: next.source });
      }
    }
  }
  for (const node of nodes) {
    if (!refOf.has(node.nodeId)) assign(node.nodeId);
  }
  return {
    refOf,
    nodesInRefOrder: order,
    positionIds: positions.map((node) => node.nodeId),
    tree,
    links
  };
}

/**
 * The story's "most decisive" order (material.ts `byLeverage`): the points —
 * never a position — that carry a finite leverage, the most leverage first,
 * the node id breaking a tie.
 */
function digestPointsByLeverage(nodes: readonly DigestSourceNode[]): readonly string[] {
  const ranked: { readonly nodeId: string; readonly leverage: number }[] = [];
  for (const node of nodes) {
    if (node.isPosition || typeof node.leverage !== "number" || !Number.isFinite(node.leverage)) continue;
    ranked.push({ nodeId: node.nodeId, leverage: node.leverage });
  }
  return ranked
    .sort((left, right) => right.leverage - left.leverage || compareDigestIds(left.nodeId, right.nodeId))
    .map((entry) => entry.nodeId);
}

/**
 * The spine (the story's ladder step 7, `spine` in material.ts): the
 * positions, every point that answers a position directly, the top
 * `decisiveCount` points by leverage each with the chain that carries it up to
 * its position, and every node with no relation at all. Then, serve's own
 * additions, each with its chain: the served root and the emphasised
 * objections.
 */
function digestSpineOf(input: {
  readonly nodes: readonly DigestSourceNode[];
  readonly tree: DigestTree;
  readonly byLeverage: readonly string[];
  readonly decisiveCount: number;
  readonly keptToTheEnd: readonly string[];
}): ReadonlySet<string> {
  const positionIds = new Set(input.tree.positionIds);
  const spine = new Set<string>(positionIds);
  for (const [source, link] of input.tree.links) {
    if ([...link.supports, ...link.attacks].some((target) => positionIds.has(target))) spine.add(source);
  }
  const climb = (nodeId: string): void => {
    let cursor: string | undefined = nodeId;
    while (cursor !== undefined && !spine.has(cursor)) {
      spine.add(cursor);
      cursor = input.tree.tree.get(cursor)?.parent;
    }
  };
  for (const nodeId of input.byLeverage.slice(0, input.decisiveCount)) climb(nodeId);
  for (const node of input.nodes) {
    if (node.polarityRelations.length === 0) spine.add(node.nodeId);
  }
  for (const nodeId of input.keptToTheEnd) climb(nodeId);
  return spine;
}

/**
 * A point's net stance toward the position its tree reaches (the story's
 * `storyStanceTowardPosition`): walk up the chain and flip at every attack.
 */
function digestStanceTowardPosition(nodeId: string, tree: ReadonlyMap<string, DigestTreeEntry>): "support" | "attack" {
  let supports = true;
  for (let entry = tree.get(nodeId); entry !== undefined; entry = tree.get(entry.parent)) {
    if (entry.polarity === "attack") supports = !supports;
  }
  return supports ? "support" : "attack";
}

function digestOmittedPointsOf(
  tree: DigestTree,
  members: ReadonlySet<string>,
  /** The digest's OWN ref table (review round 2): the refs the model is shown. */
  refOf: ReadonlyMap<string, string>
): readonly DigestOmittedPoints[] {
  const counts = new Map<string | null, { supporting: number; attacking: number }>();
  for (const node of tree.nodesInRefOrder) {
    if (members.has(node.nodeId)) continue;
    const entry = tree.tree.get(node.nodeId);
    // Under a position, a point counts by its net stance toward it. A point no
    // position reaches has no position to take a stance on, so its own first
    // relation counts (only nodes WITH a relation are ever left out).
    const polarity = entry !== undefined
      ? digestStanceTowardPosition(node.nodeId, tree.tree)
      : node.polarityRelations[0]?.polarity ?? "support";
    const key = entry === undefined ? null : entry.root;
    const count = counts.get(key) ?? { supporting: 0, attacking: 0 };
    if (polarity === "support") count.supporting += 1;
    else count.attacking += 1;
    counts.set(key, count);
  }
  const keys: (string | null)[] = [
    ...tree.positionIds.filter((positionId) => counts.has(positionId)),
    ...(counts.has(null) ? [null] : [])
  ];
  return Object.freeze(keys.map((key) => {
    const count = counts.get(key) ?? { supporting: 0, attacking: 0 };
    return Object.freeze({
      positionNodeId: key === null ? null : refOf.get(key) ?? null,
      supporting: count.supporting,
      attacking: count.attacking
    });
  }));
}

/**
 * Which node each short ref names, and the ref each member node carries, for a
 * digest built at the compact or spine rung. Held beside the digest rather
 * than in it: the model reads only the refs, and the byte budget pays only for
 * them. A digest without an entry here (rungs 0-5) names its nodes by id.
 */
interface DigestRefTable {
  readonly nodeIdOf: ReadonlyMap<string, string>;
  readonly refOf: ReadonlyMap<string, string>;
}
const DIGEST_REF_TABLES = new WeakMap<SynthesisDigest, DigestRefTable>();

function compactAt(input: {
  readonly tree: DigestTree;
  readonly emphasis: DigestEmphasis;
  /** The spine's members, or null for the compact rung's every node. */
  readonly members: ReadonlySet<string> | null;
  readonly rung: number;
  /** The summary cap: the tightest level's, or a spine widening's (null: verbatim). */
  readonly cap: number | null;
}): SynthesisDigest {
  const { tree, members, cap } = input;
  const isMember = (nodeId: string): boolean => members === null ? tree.refOf.has(nodeId) : members.has(nodeId);
  // Contiguous refs over this digest's own members, in the tree's order: the
  // compact rung's are the tree's refs; the spine's leave no gap (M-3).
  const refOf = new Map<string, string>();
  for (const node of tree.nodesInRefOrder) {
    if (isMember(node.nodeId)) refOf.set(node.nodeId, `n${String(refOf.size + 1)}`);
  }
  const ref = (nodeId: string): string => refOf.get(nodeId) ?? nodeId;
  const kept = tree.nodesInRefOrder.filter((node) => refOf.has(node.nodeId));
  const entries: DigestNodeEntry[] = kept.map((node) => {
    const summary = summarise(node.statement, cap);
    return Object.freeze({
      nodeId: ref(node.nodeId),
      statementSummary: summary.text,
      summaryTruncated: summary.truncated,
      finalStrength: node.finalStrength === null ? null : digestStrength(node.finalStrength),
      wayOfKnowing: node.wayOfKnowing,
      marks: Object.freeze([...node.marks]),
      // A relation onto a node this digest does not carry has nothing to name.
      polarityRelations: Object.freeze(node.polarityRelations
        .filter((relation) => refOf.has(relation.targetNodeId))
        .map((relation) => Object.freeze({ polarity: relation.polarity, targetNodeId: ref(relation.targetNodeId) })))
    });
  });
  const emphasis: DigestEmphasis = Object.freeze({
    topSurvivingObjectionNodeIds: Object.freeze(input.emphasis.topSurvivingObjectionNodeIds.filter(isMember).map(ref)),
    runnerUpPositionNodeIds: Object.freeze(input.emphasis.runnerUpPositionNodeIds.filter(isMember).map(ref))
  });
  const shape = {
    nodes: entries,
    emphasis,
    compressionLevel: input.rung,
    summaryCharacterCap: cap,
    ...(members === null ? {} : { omittedPoints: digestOmittedPointsOf(tree, members, refOf) })
  };
  const digest: SynthesisDigest = Object.freeze({
    ...shape,
    nodes: Object.freeze(entries),
    byteSize: Buffer.byteLength(JSON.stringify(shape), "utf8")
  });
  DIGEST_REF_TABLES.set(digest, Object.freeze({
    nodeIdOf: new Map([...refOf.entries()].map(([nodeId, short]) => [short, nodeId] as const)),
    refOf
  }));
  return digest;
}

function sameMembers(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((nodeId) => right.has(nodeId));
}

function assertDigestSource(input: {
  readonly nodes: readonly DigestSourceNode[];
  readonly servedRootNodeId: string;
}): void {
  if (input.nodes.length === 0) {
    throw new TypedDomainError("DIGEST_NODE_SET_EMPTY", "A digest requires at least one materialized node");
  }
  const seen = new Set(input.nodes.map((node) => node.nodeId));
  if (seen.size !== input.nodes.length) {
    throw new TypedDomainError("DIGEST_NODE_IDS_NOT_UNIQUE", "A materialized node appears twice in the digest source");
  }
  if (!seen.has(input.servedRootNodeId)) {
    throw new TypedDomainError("DIGEST_SERVED_ROOT_ABSENT", input.servedRootNodeId);
  }
}

/** What every spine of one debate is built from, computed once per ladder. */
interface DigestSpineSource {
  readonly nodes: readonly DigestSourceNode[];
  readonly tree: DigestTree;
  readonly emphasis: DigestEmphasis;
  readonly byLeverage: readonly string[];
  readonly keptToTheEnd: readonly string[];
}

function digestSpineSourceOf(input: {
  readonly nodes: readonly DigestSourceNode[];
  readonly servedRootNodeId: string;
}, emphasis: DigestEmphasis): DigestSpineSource {
  return {
    nodes: input.nodes,
    tree: digestTreeOf(input.nodes),
    emphasis,
    byLeverage: digestPointsByLeverage(input.nodes),
    keptToTheEnd: [input.servedRootNodeId, ...emphasis.topSurvivingObjectionNodeIds]
  };
}

function spineMembersOf(source: DigestSpineSource, decisiveCount: number): ReadonlySet<string> {
  return digestSpineOf({
    nodes: source.nodes,
    tree: source.tree,
    byLeverage: source.byLeverage,
    decisiveCount,
    keptToTheEnd: source.keptToTheEnd
  });
}

function* digestLadderFrom(input: {
  readonly nodes: readonly DigestSourceNode[];
  readonly servedRootNodeId: string;
}): Generator<SynthesisDigestAttempt, void, undefined> {
  const emphasis = selectEmphasis(input.nodes, input.servedRootNodeId);
  for (let level = 0; level < DIGEST_COMPRESSION_LEVELS.length; level += 1) {
    yield Object.freeze({ digest: compressAt(input.nodes, emphasis, level), spineDecisiveCount: null });
  }
  const tightest = DIGEST_COMPRESSION_LEVELS.at(-1) ?? null;
  const source = digestSpineSourceOf(input, emphasis);
  yield Object.freeze({
    digest: compactAt({ tree: source.tree, emphasis, members: null, rung: DIGEST_LADDER.compactRung, cap: tightest }),
    spineDecisiveCount: null
  });
  let previous: ReadonlySet<string> | null = null;
  for (const decisiveCount of DIGEST_LADDER.spineDecisiveCounts) {
    const members = spineMembersOf(source, decisiveCount);
    // A spine that leaves nothing out is the compact rung again, and a spine no
    // smaller than the step before it is that step again: neither is tried.
    if (members.size === input.nodes.length || (previous !== null && sameMembers(previous, members))) continue;
    previous = members;
    yield Object.freeze({
      digest: compactAt({ tree: source.tree, emphasis, members, rung: DIGEST_LADDER.spineRung, cap: tightest }),
      spineDecisiveCount: decisiveCount
    });
  }
}

function* digestSpineWideningsFrom(
  input: { readonly nodes: readonly DigestSourceNode[]; readonly servedRootNodeId: string },
  fitted: SynthesisDigestAttempt
): Generator<SynthesisDigestAttempt, void, undefined> {
  const source = digestSpineSourceOf(input, selectEmphasis(input.nodes, input.servedRootNodeId));
  const fittedCount = fitted.spineDecisiveCount ?? 0;
  const [first] = DIGEST_LADDER.spineWidenings;
  const walk = first !== undefined && first.decisiveCount !== null && fittedCount < first.decisiveCount
    ? [{ decisiveCount: fittedCount, summaryCap: first.summaryCap }, ...DIGEST_LADDER.spineWidenings]
    : DIGEST_LADDER.spineWidenings;
  let previous: { readonly members: ReadonlySet<string>; readonly cap: number | null } = {
    members: spineMembersOf(source, fittedCount),
    cap: fitted.digest.summaryCharacterCap
  };
  for (const step of walk) {
    const decisiveCount = step.decisiveCount ?? source.byLeverage.length;
    const members = spineMembersOf(source, decisiveCount);
    // Never a spine that leaves nothing out, and never the step before again.
    if (members.size === input.nodes.length) break;
    if (sameMembers(previous.members, members) && previous.cap === step.summaryCap) continue;
    previous = { members, cap: step.summaryCap };
    yield Object.freeze({
      digest: compactAt({ tree: source.tree, emphasis: source.emphasis, members, rung: DIGEST_LADDER.spineRung, cap: step.summaryCap }),
      spineDecisiveCount: decisiveCount
    });
  }
}

/**
 * Every rung the ladder tries for these nodes, widest first, built lazily: the
 * six summary levels, the compact rung, then each distinct spine. The builder
 * below serves the first whose bytes fit; this is the same sequence, exposed so
 * the ladder's own laws can be tested rung by rung.
 */
export function synthesisDigestLadder(input: {
  readonly nodes: readonly DigestSourceNode[];
  readonly servedRootNodeId: string;
}): Iterable<SynthesisDigestAttempt> {
  assertDigestSource(input);
  return digestLadderFrom(input);
}

/**
 * The spine widenings walked after `fitted`, the first spine that fit (review
 * fix I-2; see `DIGEST_LADDER`), in order and built lazily. The builder tries
 * every one and serves the last, in this order, that fits. Empty for an
 * attempt below the spine rung: only the spine is ever widened.
 */
export function synthesisDigestSpineWidenings(input: {
  readonly nodes: readonly DigestSourceNode[];
  readonly servedRootNodeId: string;
}, fitted: SynthesisDigestAttempt): Iterable<SynthesisDigestAttempt> {
  assertDigestSource(input);
  return fitted.digest.compressionLevel === DIGEST_LADDER.spineRung ? digestSpineWideningsFrom(input, fitted) : [];
}

/**
 * Build the digest for a byte budget.
 *
 * The budget tightens SUMMARIES first (rungs 0-5), then the SHAPE of each entry
 * (the compact rung): `digest.nodes` has one entry per input node at each of
 * them. Only if all of those are over the budget does the spine rung drop
 * membership (T9's law as amended, Task M4; see the file header). If the rung
 * that fits is not rung 0 the caller is told to serve WITH the compression
 * mark; if even the smallest spine exceeds the budget the outcome is
 * DIGEST_CANNOT_EXIST — loud, with its enumerated crash class and mark.
 */
export function buildSynthesisDigest(input: {
  readonly nodes: readonly DigestSourceNode[];
  readonly servedRootNodeId: string;
  readonly budgetBound: number;
}): DigestOutcome {
  const ladder = synthesisDigestLadder(input);
  if (!Number.isFinite(input.budgetBound) || input.budgetBound < 0) {
    throw new TypedDomainError("COMPOSITION_BUDGET_UNRESOLVED", "A V-ratified composition budget is required");
  }
  let lastTried = 0;
  for (const attempt of ladder) {
    lastTried = attempt.digest.byteSize;
    if (attempt.digest.byteSize <= input.budgetBound) {
      // I-2: a spine that fits then uses its room — the last widening, in
      // schedule order, that fits; every step is tried (review round 2).
      let served = attempt.digest;
      for (const widened of synthesisDigestSpineWidenings(input, attempt)) {
        if (widened.digest.byteSize <= input.budgetBound) served = widened.digest;
      }
      return Object.freeze({
        kind: "DIGEST" as const,
        digest: served,
        marks: Object.freeze(served.compressionLevel === 0 ? [] : [DIGEST_COMPRESSED_MARK])
      });
    }
  }
  return Object.freeze({
    kind: "DIGEST_CANNOT_EXIST" as const,
    byteSizeAtMaxCompression: lastTried,
    budgetBound: input.budgetBound,
    marks: Object.freeze([DIGEST_CANNOT_EXIST_MARK])
  });
}

/**
 * ENGINE MONEY RULE (spec §14.4.3), TASK M4 — A DIGEST CITATION, BACK TO ITS
 * NODE. The real node id this digest names by `ref`, or null when the digest
 * does not carry that node. At rungs 0-5 a node's ref IS its id. At the compact
 * and spine rungs it is the short ref the digest showed: a real id is not a ref
 * there, and a node the spine left out has no ref at all. The runner's one
 * citation point (`composedNodeIdOf`) refuses null exactly as it refuses an
 * unknown node id.
 */
export function resolveDigestNodeRef(digest: SynthesisDigest, ref: string): string | null {
  const table = DIGEST_REF_TABLES.get(digest);
  if (table !== undefined) return table.nodeIdOf.get(ref) ?? null;
  return digest.nodes.some((entry) => entry.nodeId === ref) ? ref : null;
}

/**
 * A whole-token short ref: `n`, then a number from 1, with no letter, digit or
 * underscore on either side, and not the start of a decimal (`n3.5`).
 */
const DIGEST_SHORT_REF_TOKEN = /(?<![\p{L}\p{N}_])n[1-9][0-9]*(?![\p{L}\p{N}_]|[.,]\p{N})/gu;
/** A node id as the engine mints them: a UUID, in either case, as a whole token. */
const UUID_SHAPED_ID = /(?<![0-9a-z])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-z])/giu;

/** One spelling per token: a short ref as written, a UUID in lower case. */
function idTokenKey(token: string): string {
  return token.startsWith("n") ? token : token.toLowerCase();
}

/**
 * REVIEW ROUND 2 — THE PERSON'S OWN TOKENS. Every token in these texts that
 * LOOKS like an internal id — a short ref (`n1`, as a whole token) or a UUID.
 * The runner passes the question and every node's FULL statement, so a figure
 * the person or a debater wrote ("n1 = 120 patients", a study arm `n2`, a 5G
 * band `n78`, an order number shaped like a UUID) is theirs to repeat, and
 * `nodeIdsNamedInText` exempts it. The story's checks exempt what the question
 * or a claim states the same way. The trade-off is accepted: a statement that
 * literally contains `n12` lets `(n12)` through.
 */
export function idShapedTokensIn(texts: readonly string[]): ReadonlySet<string> {
  const tokens = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(DIGEST_SHORT_REF_TOKEN)) tokens.add(idTokenKey(match[0]));
    for (const match of text.matchAll(UUID_SHAPED_ID)) tokens.add(idTokenKey(match[0]));
  }
  return tokens;
}

const NO_EXEMPT_TOKENS: ReadonlySet<string> = new Set<string>();

/**
 * REVIEW FIX I-1 (the owner's rule: no internals in the answer). Every internal
 * node name a text states: each short ref THIS digest carries, as a whole token
 * (`(n12)`, `n3.`), and any UUID-shaped id at any rung. Ordinary text is left
 * alone: `n12` when the digest has no `n12`, `N1 highway`, `n-type`, `n3.5`.
 * So is every token in `exempt` (review round 2, `idShapedTokensIn`): the
 * person's and the debaters' own words. The runner's writer classifier refuses
 * a draft whose prose names one, so the provider's own repair re-asks; nothing
 * ever rewrites the model's words.
 */
export function nodeIdsNamedInText(
  digest: SynthesisDigest,
  text: string,
  exempt: ReadonlySet<string> = NO_EXEMPT_TOKENS
): readonly string[] {
  const named: string[] = [];
  const table = DIGEST_REF_TABLES.get(digest);
  if (table !== undefined) {
    for (const match of text.matchAll(DIGEST_SHORT_REF_TOKEN)) {
      if (table.nodeIdOf.has(match[0]) && !exempt.has(idTokenKey(match[0]))) named.push(match[0]);
    }
  }
  for (const match of text.matchAll(UUID_SHAPED_ID)) {
    if (!exempt.has(idTokenKey(match[0]))) named.push(match[0]);
  }
  return Object.freeze(named);
}

/** The ref this digest shows a node by (its id at rungs 0-5), or null when the digest does not carry it. */
export function digestNodeRefOf(digest: SynthesisDigest, nodeId: string): string | null {
  const table = DIGEST_REF_TABLES.get(digest);
  if (table !== undefined) return table.refOf.get(nodeId) ?? null;
  return digest.nodes.some((entry) => entry.nodeId === nodeId) ? nodeId : null;
}

/** How many points this digest left out: 0 below the spine rung. */
export function digestPointsOmitted(digest: SynthesisDigest): number {
  return (digest.omittedPoints ?? []).reduce((total, entry) => total + entry.supporting + entry.attacking, 0);
}

/**
 * Each node's leverage from propagation's sensitivity records, as the story
 * reads it (`storyLeverageByNode`): the largest finite value recorded for the
 * node. The runner hands it in on each `DigestSourceNode`.
 */
export function digestLeverageByNodeId(
  records: readonly { readonly removedNodeId: string; readonly leverage: number }[]
): ReadonlyMap<string, number> {
  const leverage = new Map<string, number>();
  for (const record of records) {
    if (!Number.isFinite(record.leverage)) continue;
    leverage.set(record.removedNodeId, Math.max(leverage.get(record.removedNodeId) ?? record.leverage, record.leverage));
  }
  return leverage;
}

/* ------------------------------------------------------------------- roles */

/** The code-derived label and numbers every synthesis request carries (T10/T11). */
export interface SynthesisCodeLabel {
  readonly verdictLabel: string;
  readonly servedNodeId: string;
  readonly servedStrength: number;
  readonly margin: number | null;
  readonly registerVersion: number;
}

/** The T16 rows this loop reads. No value below is ever a code constant (J8). */
export interface SynthesisLoopControls {
  readonly synthesizerRoleRef: string;
  readonly evaluatorRoleRef: string;
  readonly evaluatorLoopMaxRounds: number;
}

/**
 * F-W9-1 (2026-09-03): the final sentence states the obligation the EVALUATOR
 * was already instructed to grade — "agreement between the statement and the
 * code label", and overstatement. Before it, the synthesizer RECEIVED
 * `codeLabel` and was never told what to do with it, so a rule was enforced
 * against a party that had never been told it was bound by it. That costs a
 * wasted round every time the synthesizer writes prose inconsistent with a label
 * nobody told it to honour, and at worst a loop that cannot converge, because
 * the retry carries the objection and still never states the rule.
 *
 * This is not MORE than the minimum payload — it is part of the minimum. A party
 * judged on agreement with the label needs to know it is judged on it.
 */
export const SYNTHESIZER_V2_INSTRUCTIONS =
  "Write the served statement from the digest below. Every load-bearing claim must trace to a "
  + "digest node. Do not overstate the evidence, and state the losing positions fairly. Your "
  + "statement must agree with the supplied code label, and must claim no more confidence than "
  + "that label carries.";

/**
 * PRACTICE DEBATE 3 (2026-10-12) — THE ANSWER WRITER'S INSTRUCTION, v3 (owner
 * approved 2026-10-12, "Approve as written"; the text below is that wording
 * verbatim). The v1/v2 instruction above asked for "the served statement from
 * the digest", traced "to a digest node" and bound to "the supplied code
 * label": the writer did as told and printed the served strength and the
 * engine's words, and the answer-text check (`synthesisWordingIndex`) refused
 * DeepSeek's answer four times running in that debate. The owner's rule: an
 * answer a person reads never shows a score, a threshold, a point number, a
 * citation marker or the engine's mechanics. This instruction says so to the
 * writer, and the code check stays exactly as strict.
 *
 * What its words name in the material (`toSynthesisPromptMaterial`, field
 * names unchanged): "the material" is the fenced block — the `digest` and the
 * `code_label` (and on a retry the checker's objection); "a point" is one of
 * the digest's nodes, whose id or short ref `node_refs` copies; "the label in
 * the material" is `code_label.verdictLabel`.
 *
 * The v1/v2 text stays above, byte for byte, as sealed history: register
 * versions sealed before v3 carry its fingerprint.
 */
export const SYNTHESIZER_INSTRUCTIONS =
  "Write the answer the person will read, from the material below. Every claim the answer rests on "
  + "must come from a point in the material; list those points in node_refs, never in the text. Do not "
  + "overstate the evidence, and describe the options that lost fairly. The answer must agree with the "
  + "label in the material and must not sound more certain than that label allows. Write for the person "
  + "who asked: never print a score, strength, margin, threshold or any other number taken from the "
  + "material; never name the material, its fields, labels, marks or point ids; never describe how the "
  + "debate, its judges or its checkers work. A figure that the question or an argument itself states "
  + "may be repeated.";

/** Shipped history: the checker's instruction of `serve.evaluator.v1`, byte for byte. */
export const EVALUATOR_V1_INSTRUCTIONS =
  "Judge the candidate statement against the digest and the code label. Check fairness to the "
  + "losing positions, agreement between the statement and the code label, and overstatement. "
  + "Return an objection whenever you are not satisfied.";

/**
 * The checker's instruction of `serve.evaluator.v2` (owner approved
 * 2026-10-12, verbatim): the same duties as v1, plus the reader's rule the
 * writer is now bound by, so the checker grades what the writer was told.
 */
export const EVALUATOR_INSTRUCTIONS =
  "Judge the candidate answer against the material and its label. Check that it is fair to the "
  + "options that lost, agrees with the label, does not overstate, and speaks to the person: no score "
  + "or other number taken from the material, no field names, labels, marks or point ids, and no "
  + "description of how the debate was run. Return an objection whenever you are not satisfied.";

/**
 * The synthesizer's recorded request. The key set IS the fresh-context
 * assertion: these are the named artifacts and there is nothing else to carry
 * a debate transcript or a provider history in.
 */
export type SynthesizerRequest =
  | {
      readonly role: "SYNTHESIZER";
      readonly stage: "INITIAL";
      readonly roleRef: string;
      readonly round: number;
      readonly instructions: string;
      readonly digest: SynthesisDigest;
      readonly codeLabel: SynthesisCodeLabel;
    }
  | {
      readonly role: "SYNTHESIZER";
      readonly stage: "RETRY";
      readonly roleRef: string;
      readonly round: number;
      readonly instructions: string;
      readonly digest: SynthesisDigest;
      readonly codeLabel: SynthesisCodeLabel;
      /** The prior evaluator objection, VERBATIM. Never paraphrased or truncated. */
      readonly priorObjection: string;
      readonly priorCandidateRef: string;
    };

/**
 * Model scorecard A15 (owner rulings R3/R4, 2026-09-26) — THE SEAT MARKER.
 *
 * A run with a pinned role assignment calls each seat's main OR its
 * runner-up, and the gateway counts attempts cumulatively PER KEY: a runner-up
 * recorded under its main's key would inherit an exhausted allowance and die as
 * CALL_BUDGET_EXHAUSTED instead of answering. Every key such a run records
 * therefore ends in `:seat:<main|runnerUp>`. It is a SUFFIX on purpose, so
 * every prefix reader keeps matching: 0049's `COMPOSER:%` / `POST_COMPOSE_R9:%`
 * counts and the `JUDGE:%` / `PANEL:%` readers. A run without an assignment
 * records the bare key, exactly as before.
 *
 * The format lives in TWO places: here (`CALL_SITE_SEATS`, `SEAT_MARKER`),
 * which builds and reads the marker, and the kernel's `SEAT_SUFFIX`
 * (packages/kernel/src/debate-roles.ts), which strips it before reading a
 * key's role. tests/unit/a15-seat-call-site-keys.test.ts pins that the two
 * agree: the kernel strips exactly the markers this module recognises.
 *
 * A cross-exchange site uses one key; its marker is the pinned slot of the
 * member that wrote the root, so `:seat:runnerUp` is possible.
 */
export const CALL_SITE_SEATS = Object.freeze(["main", "runnerUp"] as const);
export type CallSiteSeat = typeof CALL_SITE_SEATS[number];
const SEAT_MARKER = ":seat:";

/**
 * `<base>:seat:<seat>`. A base that already ENDS in a seat marker is refused:
 * `JUDGE:seat:main:seat:runnerUp` would strip to `JUDGE:seat:main`, whose role
 * the kernel reads as null, so a root call would lose its role.
 */
export function seatCallSiteKey(base: string, seat: CallSiteSeat): string {
  const marked = seatOfCallSiteKey(base);
  if (marked !== null) {
    throw new TypedDomainError(
      "CALL_SITE_SEAT_ALREADY_MARKED",
      `Call site ${base} already carries the ${marked} seat marker; a key carries at most one`
    );
  }
  return `${base}${SEAT_MARKER}${seat}`;
}

/** The seat a key was recorded under, or null for a bare key. */
export function seatOfCallSiteKey(key: string): CallSiteSeat | null {
  return CALL_SITE_SEATS.find((seat) => key.endsWith(`${SEAT_MARKER}${seat}`)) ?? null;
}

/** The key without its seat marker; a bare key comes back unchanged. */
export function seatBaseCallSiteKey(key: string): string {
  const seat = seatOfCallSiteKey(key);
  return seat === null ? key : key.slice(0, key.length - SEAT_MARKER.length - seat.length);
}

export type SynthesisCallSiteBinding =
  | {
      readonly role: "SYNTHESIZER";
      readonly stage: "INITIAL" | "RETRY";
      readonly round: number;
      readonly seat?: CallSiteSeat;
    }
  | { readonly role: "EVALUATOR"; readonly round: number; readonly seat?: CallSiteSeat };

/**
 * THE ONE call-site key builder, used by BOTH the runner that RECORDS the call
 * and the persistence that VERIFIES it (codex r4 B1).
 *
 * Before this, the runner built these keys with two template literals and
 * persistence accepted whatever the caller supplied, checking only that the key
 * ended in `:<round>`. A real round-1 SYNTHESIZER artifact offered as the
 * round's verdict therefore passed both the suffix check and the ledger lookup,
 * and a synthesizer response committed as the evaluator verdict.
 *
 * Deriving the EXPECTED key here, from the typed role and the round's own
 * fields, makes the role a PREDICATE. It also makes a future format change fail
 * closed: the runner and the verifier move together or not at all, because
 * there is only one place the format exists.
 *
 * The two prefixes are load-bearing beyond this module and are NOT free to
 * rename: `core.read_terminal_recorded_facts` (migrations/0049) counts
 * `COMPOSER:%` into `composer_calls` and `POST_COMPOSE_R9:%` into `r9_calls`,
 * which battery-row predicates read.
 */
export function synthesisCallSiteKey(binding: SynthesisCallSiteBinding): string {
  if (!Number.isInteger(binding.round) || binding.round < 1) {
    throw new TypedDomainError(
      "SYNTHESIS_ROUND_ARTIFACT_UNRESOLVED",
      `A synthesis call site needs a positive integer round, not ${String(binding.round)}`
    );
  }
  const base = binding.role === "SYNTHESIZER"
    ? `COMPOSER:SYNTHESIZER:${binding.stage}:${binding.round}`
    : `POST_COMPOSE_R9:EVALUATOR:${binding.round}`;
  return binding.seat === undefined ? base : seatCallSiteKey(base, binding.seat);
}

/**
 * A15: the keys a round's role may lawfully have been recorded under — the
 * bare key (no assignment) and its two seat forms. Persistence binds each
 * loop-round reference to ONE of these, so the role is still a predicate: a
 * SYNTHESIZER artifact can never pass as an EVALUATOR verdict, marked or not.
 * A seat named on the binding does not widen the set.
 */
export function acceptedSynthesisCallSiteKeys(binding: SynthesisCallSiteBinding): readonly string[] {
  const base = binding.role === "SYNTHESIZER"
    ? synthesisCallSiteKey({ role: "SYNTHESIZER", stage: binding.stage, round: binding.round })
    : synthesisCallSiteKey({ role: "EVALUATOR", round: binding.round });
  return Object.freeze([base, ...CALL_SITE_SEATS.map((seat) => seatCallSiteKey(base, seat))]);
}

export interface EvaluatorRequest {
  readonly role: "EVALUATOR";
  readonly roleRef: string;
  readonly round: number;
  readonly instructions: string;
  readonly digest: SynthesisDigest;
  readonly codeLabel: SynthesisCodeLabel;
  readonly candidateStatement: string;
}

/** The named artifacts a fresh-context request may contain, and no others. */
export const SYNTHESIZER_INITIAL_REQUEST_KEYS: readonly string[] =
  Object.freeze(["role", "stage", "roleRef", "round", "instructions", "digest", "codeLabel"]);
export const SYNTHESIZER_RETRY_REQUEST_KEYS: readonly string[] =
  Object.freeze([...SYNTHESIZER_INITIAL_REQUEST_KEYS, "priorObjection", "priorCandidateRef"]);
export const EVALUATOR_REQUEST_KEYS: readonly string[] =
  Object.freeze(["role", "roleRef", "round", "instructions", "digest", "codeLabel", "candidateStatement"]);

/**
 * The fresh-context assertion, stated as the goal states it: each recorded
 * request contains NO debate transcript or provider history BEYOND the named
 * artifacts — never the absence of an artifact the role needs. So this checks
 * the key set exactly, in both directions: an extra key is a leak, a missing
 * key is a starved role, and both are loud.
 */
export function assertFreshContextRequest(
  request: SynthesizerRequest | EvaluatorRequest
): void {
  const expected = request.role === "EVALUATOR"
    ? EVALUATOR_REQUEST_KEYS
    : request.stage === "RETRY" ? SYNTHESIZER_RETRY_REQUEST_KEYS : SYNTHESIZER_INITIAL_REQUEST_KEYS;
  const actual = Object.keys(request).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || wanted.some((key, index) => actual[index] !== key)) {
    throw new TypedDomainError(
      "SYNTHESIS_REQUEST_NOT_FRESH_CONTEXT",
      `${request.role} request keys ${actual.join(",")} are not exactly ${wanted.join(",")}`
    );
  }
}

export function buildSynthesizerRequest(input: {
  readonly controls: SynthesisLoopControls;
  readonly round: number;
  readonly digest: SynthesisDigest;
  readonly codeLabel: SynthesisCodeLabel;
  readonly prior: { readonly objection: string; readonly candidateRef: string } | null;
}): SynthesizerRequest {
  const base = {
    role: "SYNTHESIZER" as const,
    roleRef: input.controls.synthesizerRoleRef,
    round: input.round,
    instructions: SYNTHESIZER_INSTRUCTIONS,
    digest: input.digest,
    codeLabel: input.codeLabel
  };
  const request: SynthesizerRequest = input.prior === null
    ? Object.freeze({ ...base, stage: "INITIAL" as const })
    : Object.freeze({
        ...base,
        stage: "RETRY" as const,
        priorObjection: input.prior.objection,
        priorCandidateRef: input.prior.candidateRef
      });
  assertFreshContextRequest(request);
  return request;
}

export function buildEvaluatorRequest(input: {
  readonly controls: SynthesisLoopControls;
  readonly round: number;
  readonly digest: SynthesisDigest;
  readonly codeLabel: SynthesisCodeLabel;
  readonly candidateStatement: string;
}): EvaluatorRequest {
  const request: EvaluatorRequest = Object.freeze({
    role: "EVALUATOR" as const,
    roleRef: input.controls.evaluatorRoleRef,
    round: input.round,
    instructions: EVALUATOR_INSTRUCTIONS,
    digest: input.digest,
    codeLabel: input.codeLabel,
    candidateStatement: input.candidateStatement
  });
  assertFreshContextRequest(request);
  return request;
}

/**
 * W9 / V-MINIMUM-PAYLOAD (2026-09-03): the ONE model-facing projection of a
 * synthesis request. Both runner call sites send exactly these fields, and
 * `tests/unit/prompt-surface-guard.test.ts` pins that they do.
 *
 * RUN1 (V-11 addendum, DL4-F4/L4-F11) changed its RETURN SHAPE, not its rule.
 * It used to render one `JSON.stringify` blob that carried the engine's own
 * `instructions` and `role` beside the model-authored digest, the candidate
 * statement and the prior objection — instructions and untrusted material in
 * one compartment, with no framing that said which was which. It now returns
 * the MATERIAL FIELDS alone; `instructions` and `role` moved to the prompt
 * contract in the system message, where an injected line inside the digest
 * cannot reach them. The allow-list discipline below is unchanged: a field
 * added to a request type later is withheld by CONSTRUCTION.
 *
 * It is an ALLOW-LIST, not a delete-list, and that is the whole point. The
 * request key sets are FIXED (`assertFreshContextRequest` enforces them), and
 * the heartbeat's remedy for a fixed key set is a named allow-list: a field
 * added to a request type later is withheld by CONSTRUCTION rather than by
 * someone remembering to exclude it. `JSON.stringify(request)` was the opposite
 * rule — send everything, and hope the next field is harmless.
 *
 * WITHHELD, per the ruling:
 *  · `roleRef` — the routing address; the runner resolves the provider from it
 *    one line above the prompt and the model can do nothing with it.
 *  · `round` — the loop bound is configured, so "round 3" means "last attempt"
 *    and changes the decision both roles face. Neither task depends on the count.
 *  · `stage` — a retry already carries `priorObjection`, which shows the
 *    situation more directly than the flag states it.
 *  · `codeLabel.registerVersion` — settings metadata, useless to a writer.
 *  · `priorCandidateRef` — an artifact ADDRESS, the same class as `roleRef`, and
 *    absent from the ruling's kept-list. Withheld on that reading; see the guard.
 *
 * KEPT, because the tasks depend on them: `digest`, the code label's real
 * numbers, `candidateStatement` (the evaluator's entire job) and
 * `priorObjection` on a retry (without it a rewrite is blind and can only repeat
 * itself). `instructions` and `role` are kept too, in the system message.
 *
 * Nothing leaves the REQUEST object: `assertFreshContextRequest` inspects the
 * request, the audit record keeps full provenance, and the frozen key sets above
 * are untouched. V's rule is RECORDED and WITHHELD, never forgotten.
 *
 * PRACTICE DEBATE 2 (2026-10-12), PROBLEM 7 — THE NUMBERS TRAVEL ROUNDED. Every
 * strength the writer and its checker read (each digest node's `finalStrength`,
 * the code label's `servedStrength` and `margin`) is shown at four decimals, the
 * way the compact and spine rungs and the story's material already show them
 * (`digestStrength`). The served answer of that debate printed
 * "0.9600034199999999" because the material handed the float over unrounded.
 * Rounding changes only what is SHOWN: the request keeps the exact values, and
 * the answer text may print none of them anyway (`synthesisWordingIndex`).
 */
export function toSynthesisPromptMaterial(
  request: SynthesizerRequest | EvaluatorRequest
): readonly { readonly name: string; readonly content: string }[] {
  const codeLabel = {
    verdictLabel: request.codeLabel.verdictLabel,
    // Task M4: the served node by the ref the digest shows it under — its short
    // ref at the compact and spine rungs, its id below them — so the label and
    // the digest name the same node the same way, and no real id reaches the
    // model beside a digest of refs. The runner maps a cited ref back.
    servedNodeId: digestNodeRefOf(request.digest, request.codeLabel.servedNodeId) ?? request.codeLabel.servedNodeId,
    servedStrength: digestStrength(request.codeLabel.servedStrength),
    margin: request.codeLabel.margin === null ? null : digestStrength(request.codeLabel.margin)
  };
  const fields = [
    { name: "digest", content: JSON.stringify(shownDigest(request.digest)) },
    { name: "code_label", content: JSON.stringify(codeLabel) }
  ];
  if (request.role === "EVALUATOR") {
    fields.push({ name: "candidate_statement", content: request.candidateStatement });
  } else if (request.stage === "RETRY") {
    fields.push({ name: "prior_objection", content: request.priorObjection });
  }
  return Object.freeze(fields);
}

/**
 * The digest as the models are shown it: every node's strength at four
 * decimals, every other byte as built. The key order is the digest's own (a
 * spread keeps it), so the shown JSON differs from the built one only in the
 * digits of each strength, and never grows: a rounded number prints no longer
 * than the number it rounds.
 */
function shownDigest(digest: SynthesisDigest): SynthesisDigest {
  return Object.freeze({
    ...digest,
    nodes: Object.freeze(digest.nodes.map((node) => Object.freeze({
      ...node,
      finalStrength: node.finalStrength === null ? null : digestStrength(node.finalStrength)
    })))
  });
}

/* ------------------------------- problem 7: no score or code in the answer */

/**
 * PRACTICE DEBATE 2 (2026-10-12), PROBLEM 7 — THE ANSWER'S WORDS, CHECKED IN CODE.
 * The served answer printed the served strength ("0.9600034199999999") and the
 * engine's own words. The owner's rule: an answer a person reads never shows a
 * score, a threshold, or the engine's mechanics. Nothing checked that; the
 * checker model read the draft and was satisfied.
 *
 * This is the story's rule (`packages/story/src/material.ts`, `storyScoreTexts`
 * and `STORY_ENGINE_TOKENS`; `validate.ts`, STORY_TEXT_SCORE_VALUE and
 * STORY_TEXT_ENGINE_TOKEN) applied to the answer writer's material, and like the
 * story's it is language-independent: it reads digits and code-shaped tokens,
 * never a word list, so it holds in every language the question can be in.
 *
 *  · `scoreTexts` — every strength the material shows, and the exact value the
 *    request holds, as a text might print it: two decimals rounded half up, the
 *    value as the material prints it, and the exact value, each with "." and
 *    with ",". A form the person's question or a debater's full statement also
 *    states as a figure is theirs, and is not held ("0,96 lei" in the question).
 *  · `engineTokens` — every code-shaped key and value the material carries
 *    (`finalStrength`, `code_label`, `REASONING`, `UNSERVED-MAKER-POSITION`, the
 *    verdict label), the answer form's own identifiers (`node_refs`,
 *    `served_number_refs`, `segment_id`) and the served-number slot, less any
 *    the question or a statement uses itself as a whole token. A plain
 *    lowercase word is never a code token: it would refuse ordinary text.
 *
 * Internal node names (a short ref, a UUID) are `nodeIdsNamedInText`'s, as before.
 */
export interface SynthesisWordingIndex {
  readonly scoreTexts: ReadonlySet<string>;
  readonly engineTokens: ReadonlySet<string>;
}

/**
 * The one served-number slot the runner serves. The v2 answer form named it in
 * its own words; v3 asks for no slot at all (`served_number_refs` is always []),
 * and the slot stays an engine token: an answer text that names it is refused.
 */
export const SYNTHESIZER_SERVED_NUMBER_SLOT = "number:final-strength" as const;

/** The answer form's identifiers that are code, not words (each named in `SYNTHESIZER_ANSWER_FORM` or, the slot, in v2's). */
const SYNTHESIZER_FORM_TOKENS = Object.freeze([
  "segment_id", "node_refs", "served_number_refs", SYNTHESIZER_SERVED_NUMBER_SLOT
]);

/**
 * What a code token looks like: an all-capitals code with at least two letters
 * (CONTESTED, LOOKED_UP, UNSERVED-MAKER-POSITION), a lowercase key with an
 * underscore (code_label), or a camelCase key (finalStrength). A lowercase word
 * on its own ("margin", "digest") is never one: refusing it would refuse
 * ordinary text in any language that uses the word.
 */
const SYNTHESIS_ENGINE_TOKEN_SHAPE =
  /^(?:[A-Z][A-Z0-9]+(?:[_-][A-Z0-9]+)*|[a-z][a-z0-9]*(?:_[a-z0-9]+)+|[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+)$/u;

/**
 * A strength as a text might print it (the story's `storyScoreForms`): two
 * decimals rounded half up the way a person rounds, the value as the material
 * shows it (four decimals), and the exact value; each with a point and with a
 * comma. A value with no decimal separator in any of those (0, 1) has no form:
 * a bare digit is never a score text.
 */
function synthesisScoreForms(value: number): readonly string[] {
  const magnitude = Math.abs(value);
  const printed = new Set([
    (Math.round(magnitude * 100 + 1e-7) / 100).toFixed(2),
    String(digestStrength(magnitude)),
    String(magnitude)
  ]);
  return [...printed]
    .filter((form) => /^[0-9]+\.[0-9]+$/u.test(form))
    .flatMap((form) => [form, form.replace(".", ",")]);
}

/**
 * Every decimal a text states as a figure of its own (the story's
 * `storyStatedFigures`): digits, one "." or ",", digits, with no digit or
 * further separator on either side and no percent sign after it; read with the
 * comma as a point.
 */
function synthesisStatedFigures(texts: readonly string[]): ReadonlySet<string> {
  const figures = new Set<string>();
  const decimal = /(?<![\p{Nd}.,])\p{Nd}+[.,]\p{Nd}+(?![\p{Nd}]|[.,]\p{Nd})(?![\p{Zs}]?%)/gu;
  for (const text of texts) {
    for (const match of text.matchAll(decimal)) figures.add(match[0].replace(",", "."));
  }
  return figures;
}

/** Every non-integer number, object key and string value in a JSON value. */
function walkMaterial(
  value: unknown,
  visit: { readonly number: (value: number) => void; readonly token: (text: string) => void }
): void {
  if (typeof value === "number") {
    if (Number.isFinite(value) && !Number.isInteger(value)) visit.number(value);
  } else if (typeof value === "string") {
    visit.token(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) walkMaterial(entry, visit);
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      visit.token(key);
      walkMaterial(entry, visit);
    }
  }
}

/** A whole, case-sensitive token: no letter, digit or underscore right before or after it. */
function wholeTokenPattern(tokens: readonly string[]): RegExp | null {
  if (tokens.length === 0) return null;
  const alternatives = [...tokens]
    .sort((left, right) => right.length - left.length || (left < right ? -1 : left > right ? 1 : 0))
    .map((token) => token.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&"));
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}_])`, "u");
}

/**
 * The wording index for one synthesis request: built from the material the
 * models are shown (`toSynthesisPromptMaterial`) and the exact values the
 * request holds. `personTexts` are the person's question and every node's FULL
 * statement — the same texts `idShapedTokensIn` reads — whose own figures and
 * tokens the answer may repeat.
 */
export function synthesisWordingIndex(input: {
  readonly request: SynthesizerRequest | EvaluatorRequest;
  readonly personTexts: readonly string[];
}): SynthesisWordingIndex {
  const stated = synthesisStatedFigures(input.personTexts);
  const own = input.personTexts.join("\n");
  const numbers: number[] = [];
  const tokens = new Set<string>(SYNTHESIZER_FORM_TOKENS);
  const visit = {
    number: (value: number): void => { numbers.push(value); },
    token: (text: string): void => { if (SYNTHESIS_ENGINE_TOKEN_SHAPE.test(text)) tokens.add(text); }
  };
  for (const field of toSynthesisPromptMaterial(input.request)) {
    if (field.name !== "digest" && field.name !== "code_label") continue;
    visit.token(field.name);
    walkMaterial(JSON.parse(field.content) as unknown, visit);
  }
  // The exact values too: the material shows them rounded, but a model that read
  // an older prompt, or the request's audit record, could print them whole.
  numbers.push(input.request.codeLabel.servedStrength);
  if (input.request.codeLabel.margin !== null) numbers.push(input.request.codeLabel.margin);
  for (const node of input.request.digest.nodes) {
    if (node.finalStrength !== null) numbers.push(node.finalStrength);
  }
  const scoreTexts = new Set<string>();
  for (const value of numbers) {
    if (!Number.isFinite(value) || Number.isInteger(value)) continue;
    for (const form of synthesisScoreForms(value)) {
      if (!stated.has(form.replace(",", "."))) scoreTexts.add(form);
    }
  }
  const engineTokens = new Set([...tokens].filter((token) => {
    const pattern = wholeTokenPattern([token]);
    return pattern === null || !pattern.test(own);
  }));
  return Object.freeze({ scoreTexts, engineTokens });
}

/** The answer-text refusals `synthesisWordingRefusalsIn` names, each the code the writer's repair turn carries. */
export const SYNTHESIS_WORDING_REFUSALS = Object.freeze([
  "COMPOSED_TEXT_PRINTS_A_SCORE",
  "COMPOSED_TEXT_USES_ENGINE_CODE"
] as const);
export type SynthesisWordingRefusal = typeof SYNTHESIS_WORDING_REFUSALS[number];

/**
 * What one answer text does wrong, in the order the codes are listed: it prints
 * a score the material shows (a whole token: no digit right before or after it,
 * and no percent sign after it, so "10,96 lei" and "96%" are left alone, as in
 * the story), or it uses a code token. Deterministic and never throws.
 */
export function synthesisWordingRefusalsIn(
  text: string,
  index: SynthesisWordingIndex
): readonly SynthesisWordingRefusal[] {
  const refusals: SynthesisWordingRefusal[] = [];
  if (index.scoreTexts.size > 0) {
    const alternatives = [...index.scoreTexts]
      .sort((left, right) => right.length - left.length || (left < right ? -1 : left > right ? 1 : 0))
      .map((form) => form.replace(".", "\\."));
    if (new RegExp(`(?<!\\p{Nd})(?:${alternatives.join("|")})(?!\\p{Nd})(?![\\p{Zs}]?%)`, "u").test(text)) {
      refusals.push("COMPOSED_TEXT_PRINTS_A_SCORE");
    }
  }
  const engine = wholeTokenPattern([...index.engineTokens]);
  if (engine !== null && engine.test(text)) refusals.push("COMPOSED_TEXT_USES_ENGINE_CODE");
  return Object.freeze(refusals);
}

/* -------------------------------------------------------------------- loop */

/**
 * What the evaluator checked. `citationTracing` is the re-routed conformance
 * gate: every load-bearing claim traces to a digest node. `restatement` is the
 * re-routed R9 limb — pre-compose and post-compose alike. None of them is a
 * terminal any more; each is an OBJECTION CRITERION.
 */
export interface EvaluatorCriteria {
  readonly fairnessToLosers: boolean;
  readonly statementLabelAgreement: boolean;
  readonly noOverstatement: boolean;
  readonly restatement: boolean;
  readonly citationTracing: boolean;
}

export const EVALUATOR_CRITERIA_KEYS: readonly (keyof EvaluatorCriteria)[] = Object.freeze([
  "fairnessToLosers",
  "statementLabelAgreement",
  "noOverstatement",
  "restatement",
  "citationTracing"
]);

export interface EvaluatorVerdict {
  readonly satisfied: boolean;
  /** Required whenever `satisfied` is false; forbidden when it is true. */
  readonly objection: string | null;
  readonly criteria: EvaluatorCriteria;
}

export function assertEvaluatorVerdict(verdict: EvaluatorVerdict): EvaluatorVerdict {
  const allPass = EVALUATOR_CRITERIA_KEYS.every((key) => verdict.criteria[key]);
  if (verdict.satisfied !== allPass) {
    throw new TypedDomainError(
      "EVALUATOR_VERDICT_INCOHERENT",
      `satisfied=${String(verdict.satisfied)} disagrees with its own criteria`
    );
  }
  if (verdict.satisfied && verdict.objection !== null) {
    throw new TypedDomainError("EVALUATOR_VERDICT_INCOHERENT", "A satisfied evaluator raises no objection");
  }
  if (!verdict.satisfied && (verdict.objection ?? "").trim().length === 0) {
    throw new TypedDomainError(
      "EVALUATOR_OBJECTION_MISSING",
      "An unsatisfied evaluator must state the objection the next round answers verbatim"
    );
  }
  return verdict;
}

/** One loop round, persisted whole (goal DoD: "loop-round records"). */
export interface SynthesisLoopRound {
  readonly round: number;
  readonly synthesizerRequest: SynthesizerRequest;
  readonly candidateRef: string;
  readonly candidateStatement: string;
  readonly evaluatorRequest: EvaluatorRequest;
  readonly verdict: EvaluatorVerdict;
  /** The `ledger.raw_artifact` id of the evaluator call for this round. */
  readonly verdictRef: string;
  readonly candidateCallSiteKey: string;
  readonly verdictCallSiteKey: string;
}

export interface SynthesisLoopOutcome<TCandidate> {
  readonly candidate: TCandidate;
  readonly candidateStatement: string;
  readonly rounds: readonly SynthesisLoopRound[];
  /** The objection still standing when the loop ended, or null. */
  readonly standingObjection: string | null;
  /** `[SYNTHESIS-OBJECTION-STANDING]` when an objection stands, else empty. */
  readonly marks: readonly string[];
  /**
   * ENGINE MONEY RULE (spec §14.4.2), TASK M3: the code of the failure that
   * ended the loop before its bound or a satisfied checker, when the loop kept
   * its complete rounds instead of discarding them
   * (`keepsCompleteSynthesisRounds`); null for a loop that finished.
   */
  readonly endedEarlyBy: string | null;
}

/**
 * What one synthesizer call produced: the candidate itself and the RECORDED
 * artifact reference for it.
 *
 * `candidateRef` must resolve to the artifact the provider call actually
 * recorded. The first filing fabricated `candidate:round-N` here — a string
 * that resembles an identifier and dereferences to nothing, so a retry's
 * `priorCandidateRef` pointed at no artifact at all (codex r1 B2). Making the
 * reference part of the synthesizer's OWN result is what removes the seam a
 * label could be invented in: the loop has no way to name a candidate the
 * adapter did not record.
 */
export interface SynthesizedCandidate<TCandidate> {
  readonly candidate: TCandidate;
  /**
   * The `ledger.raw_artifact` id of the call that produced this candidate.
   * codex r2 B2: a TYPED KEY, not a label — persistence stores it as a uuid
   * foreign key and proves it belongs to this run before committing.
   */
  readonly candidateRef: string;
  /**
   * The call-site key the synthesizer call was recorded under. codex r3 B2: a
   * reference that only proves "some artifact in this run" is not a producer
   * binding — an unrelated JUDGE artifact from the same run satisfied it. The
   * call site is what the ledger uses to tell producers apart, so it travels
   * with the reference and `persist` resolves the pair against the ledger.
   */
  readonly candidateCallSiteKey: string;
}

/** The evaluator's verdict together with the artifact its call recorded. */
export interface EvaluatedCandidate {
  readonly verdict: EvaluatorVerdict;
  /** The `ledger.raw_artifact` id of the evaluator call. */
  readonly verdictRef: string;
  /** The call-site key the evaluator call was recorded under. */
  readonly verdictCallSiteKey: string;
}

export interface SynthesisLoopDependencies<TCandidate> {
  readonly synthesize: (request: SynthesizerRequest) => Promise<SynthesizedCandidate<TCandidate>>;
  readonly evaluate: (request: EvaluatorRequest) => Promise<EvaluatedCandidate>;
  /** The statement text the evaluator judges, read off the synthesizer's output. */
  readonly readCandidateStatement: (candidate: TCandidate) => string;
}

/**
 * ENGINE MONEY RULE (spec §14.4.2), TASK M3 — THE FAILURES AFTER WHICH A
 * COMPLETE ROUND IS KEPT RATHER THAN DISCARDED.
 *
 * Every run-level spend stop (the kernel's one list: money — after the
 * runner's cheaper-maker fallback found nothing that fits — the attempt
 * ceiling, a vendor that reports no usage, a spent day), a dead role transport,
 * and a later draft with nothing to serve (`SYNTHESIS_NO_ARTIFACT`, the sealed
 * chain's own check; M3 review polish). None of them says anything about the
 * drafts already checked: the draft the checker read, and the verdict it gave,
 * are as real as they were a call ago. The owner's rule is that money never
 * costs the person an answer, and a technical failure of a LATER round is not a
 * failure of the round before it.
 *
 * A contract or content error (`COMPOSITION_CONTRACT_ERROR`,
 * `EVALUATOR_CONTRACT_ERROR`, an incoherent verdict) is NOT on this list: it
 * keeps today's handling. Only a `TypedDomainError` is trusted — a code-shaped
 * object is not a refusal.
 *
 * Exported (M3 review carry, Task M4) so the runner's `serveLoopStopOf` is
 * pinned against it: every code the loop keeps a round for must name a stop on
 * the owner's record, or a new code would silently record NULL there.
 */
export const ROUND_KEEPING_TECHNICAL_FAILURES: readonly string[] = Object.freeze([
  "SYNTHESIS_TRANSPORT_DEATH",
  "SYNTHESIS_NO_ARTIFACT"
]);

export function keepsCompleteSynthesisRounds(error: unknown): boolean {
  return error instanceof TypedDomainError
    && (isRunLevelSpendStop(error) || ROUND_KEEPING_TECHNICAL_FAILURES.includes(error.code));
}

/**
 * The outcome a loop that ENDS on `rounds.at(-1)` serves: that round's draft,
 * and whatever objection that round's own checker left standing. One rule for
 * a loop that ran to its bound (or to a satisfied checker) and for a loop cut
 * short after a complete round, so a kept round is served exactly as the
 * sealed chain serves a finished loop's last round — the chain reads
 * `loop.rounds.at(-1)!.verdict`, and the rounds handed to it always END with a
 * complete round. No verdict is ever invented here.
 */
function loopOutcomeEndingOn<TCandidate>(input: {
  readonly candidate: TCandidate;
  readonly candidateStatement: string;
  readonly rounds: readonly SynthesisLoopRound[];
  readonly endedEarlyBy: string | null;
}): SynthesisLoopOutcome<TCandidate> {
  const standingObjection = input.rounds.at(-1)?.verdict.satisfied === true
    ? null
    : input.rounds.at(-1)?.verdict.objection ?? null;
  return Object.freeze({
    candidate: input.candidate,
    candidateStatement: input.candidateStatement,
    rounds: Object.freeze([...input.rounds]),
    standingObjection,
    marks: Object.freeze(standingObjection === null ? [] : [SYNTHESIS_OBJECTION_STANDING_MARK]),
    endedEarlyBy: input.endedEarlyBy
  });
}

/**
 * ≤ `evaluatorLoopMaxRounds` rounds, or evaluator satisfied — whichever comes
 * first. After the last round the statement is SERVED regardless: the loop
 * never returns "no answer", it returns the last candidate plus whatever
 * objection is still standing, and the caller serves it WITH the mark.
 *
 * ENGINE MONEY RULE (spec §14.4.2), TASK M3 — KEEP THE BEST COMPLETE ROUND.
 * Once at least one round is COMPLETE (a draft and its checker's verdict), a
 * later round that fails with a spend stop, a dead transport or no artifact
 * (`keepsCompleteSynthesisRounds`) no longer throws the complete rounds away:
 * the loop ends there, on its last complete round, as if its bound had been
 * that round. "Best" is the loop's own rule — the latest complete draft, which
 * answered every earlier objection verbatim — and it is the only draft the
 * sealed chain can serve, because the chain reads the LAST round's verdict.
 * A draft written in the failed round is never served: its checker never read
 * it. Before any round is complete there is nothing checked to keep, and the
 * failure travels exactly as it always has.
 */
export async function runSynthesisLoop<TCandidate>(
  input: {
    readonly controls: SynthesisLoopControls;
    readonly digest: SynthesisDigest;
    readonly codeLabel: SynthesisCodeLabel;
  },
  dependencies: SynthesisLoopDependencies<TCandidate>
): Promise<SynthesisLoopOutcome<TCandidate>> {
  const maxRounds = input.controls.evaluatorLoopMaxRounds;
  if (!Number.isInteger(maxRounds) || maxRounds < 1) {
    throw new TypedDomainError(
      "SYNTHESIS_ROLE_CONTROLS_UNRESOLVED",
      "The evaluator loop bound is a sealed T16 register row and is never invented"
    );
  }
  const rounds: SynthesisLoopRound[] = [];
  let prior: { objection: string; candidateRef: string } | null = null;
  /** The draft of the last COMPLETE round — never one its checker did not read. */
  let complete: { readonly candidate: TCandidate; readonly candidateStatement: string } | null = null;
  for (let round = 1; round <= maxRounds; round += 1) {
    let verdict: EvaluatorVerdict;
    let candidate: TCandidate;
    let candidateStatement: string;
    let candidateRef: string;
    try {
      const synthesizerRequest = buildSynthesizerRequest({
        controls: input.controls,
        round,
        digest: input.digest,
        codeLabel: input.codeLabel,
        prior
      });
      const synthesized = await dependencies.synthesize(synthesizerRequest);
      candidate = synthesized.candidate;
      candidateRef = synthesized.candidateRef;
      if (candidateRef.trim().length === 0) {
        throw new TypedDomainError(
          "SYNTHESIS_CANDIDATE_REF_MISSING",
          "A round's candidate must carry the reference of the artifact the provider call recorded"
        );
      }
      candidateStatement = dependencies.readCandidateStatement(candidate);
      const evaluatorRequest = buildEvaluatorRequest({
        controls: input.controls,
        round,
        digest: input.digest,
        codeLabel: input.codeLabel,
        candidateStatement
      });
      const evaluated = await dependencies.evaluate(evaluatorRequest);
      verdict = assertEvaluatorVerdict(evaluated.verdict);
      if (evaluated.verdictRef.trim().length === 0) {
        throw new TypedDomainError(
          "SYNTHESIS_CANDIDATE_REF_MISSING",
          "A round's verdict must carry the reference of the artifact the evaluator call recorded"
        );
      }
      rounds.push(Object.freeze({
        round,
        synthesizerRequest,
        candidateRef,
        candidateStatement,
        evaluatorRequest,
        verdict,
        verdictRef: evaluated.verdictRef,
        candidateCallSiteKey: synthesized.candidateCallSiteKey,
        verdictCallSiteKey: evaluated.verdictCallSiteKey
      }));
    } catch (error) {
      // Task M3: a spend stop, a dead transport or an empty draft after a complete round keeps
      // that round. `complete` is non-null exactly when `rounds` is non-empty.
      if (complete !== null && keepsCompleteSynthesisRounds(error)) {
        return loopOutcomeEndingOn({
          candidate: complete.candidate,
          candidateStatement: complete.candidateStatement,
          rounds,
          endedEarlyBy: (error as TypedDomainError).code
        });
      }
      throw error;
    }
    complete = { candidate, candidateStatement };
    if (verdict.satisfied) {
      prior = null;
      break;
    }
    prior = { objection: verdict.objection!, candidateRef };
  }
  if (complete === null) {
    throw new TypedDomainError("SYNTHESIS_LOOP_PRODUCED_NO_CANDIDATE", "The loop bound admitted no round");
  }
  return loopOutcomeEndingOn({
    candidate: complete.candidate,
    candidateStatement: complete.candidateStatement,
    rounds,
    endedEarlyBy: null
  });
}


/* ------------------------------------------- V-11: the two prompt contracts */

/**
 * The SYNTHESIZER's contract ids. The answer form is code's half of the prompt
 * and is sealed by hash in the register row `composerContractHash`: once a form
 * has shipped, changing it is a NEW contract id, never an edit (the storyteller
 * v1 -> v2 precedent in `packages/story/src/contracts.ts`). v1, v2 and v3 stay
 * below as shipped history, byte for byte; v4 is what the runner sends.
 */
export const SYNTHESIZER_V1_CONTRACT_ID = "serve.synthesizer.v1" as const;
export const SYNTHESIZER_V2_CONTRACT_ID = "serve.synthesizer.v2" as const;
export const SYNTHESIZER_V3_CONTRACT_ID = "serve.synthesizer.v3" as const;
export const SYNTHESIZER_CONTRACT_ID = "serve.synthesizer.v4" as const;

/**
 * Shipped v1 history. Moved verbatim out of `apps/runner/src/index.ts`, where
 * it was the system message; its fingerprint is the `composerContractHash`
 * every register version sealed before v2 carries.
 */
export const SYNTHESIZER_V1_ANSWER_FORM =
  "Return only JSON with a segments array of at most two {segment_id,text,node_refs,served_number_refs} entries. "
  + "node_refs must name the node ids of the digest nodes whose facts the segment asserts, so every load-bearing "
  + "claim traces to a digest node. Preserve the digest and add no facts. When the digest nodes a segment cites "
  + "rest on reasoning alone, with no measured or looked-up evidence behind them, return at least two segments in "
  + "order: the first segment states the provisional answer as a hypothesis; the second segment states the research "
  + "plan that would lift it.";

/**
 * Shipped v2 history: v1's full contract plus the served-number reference
 * format. On 2026-10-05 a real answer was refused because its
 * served_number_refs held values and prose instead of slot ids: v1 never named
 * the one slot the runner serves (`numberRef: "number:final-strength"` in
 * `apps/runner/src/index.ts`) nor the identifier grammar the runner's parser
 * enforces (`machineIdentifierSchema`). Its fingerprint is the
 * `composerContractHash` of every register version sealed from 2026-10-09 until
 * v3 (the preview's versions 10 and 11 among them).
 */
export const SYNTHESIZER_V2_ANSWER_FORM = `${SYNTHESIZER_V1_ANSWER_FORM} `
  + "segment_id and every node_refs or served_number_refs entry must be an ASCII identifier matching "
  + "^[A-Za-z0-9][A-Za-z0-9:._-]*$; copy digest node ids exactly and never translate identifiers. "
  + "served_number_refs identifies typed served-number slots, not the numeric values themselves. "
  + "The available slot is number:final-strength, referring to code_label.servedStrength. "
  + "Include that exact ref when the segment asserts that served number. If a segment asserts no served number, use []. "
  + "Never invent a slot from other digest statistics or code_label.margin, and never put numeric values, "
  + "percentages, expressions, or citation labels in served_number_refs.";

/**
 * Shipped v3 history (owner-approved content, 2026-10-12). PRACTICE DEBATE 3:
 * v2 told the writer to "include that exact ref when the segment asserts that
 * served number" (so it asserted the number in the text) and v1's two-segment
 * rule asked for "a hypothesis" and "the research plan" (so the model opened
 * its segments with "Hypothesis:" and "Research plan:"). v3 keeps the JSON shape
 * the runner parses (`compositionSchema`), the two-segment rule for an answer
 * that rests on reasoning alone (serve reads it as the provisional answer and
 * what would settle it, `HYPOTHESIS_WITH_RESEARCH_PLAN`) and v2's identifier
 * grammar, and asks for no served number at all: `served_number_refs` is
 * always []. No rule beyond the owner's content is added. Its fingerprint is
 * the `composerContractHash` of the preview's register version 12; with its
 * length variant (`serve.synthesizer.length.v1`) it is the debate shape's
 * practice value (SYNTHESIZER_V3_CONTRACTS_FINGERPRINT_TEXT).
 */
export const SYNTHESIZER_V3_ANSWER_FORM =
  "Return only JSON with a segments array of at most two {segment_id,text,node_refs,served_number_refs} entries. "
  + "node_refs lists the ids of the points whose facts the segment states, copied exactly. Add no facts. "
  + "When the points a segment relies on rest on reasoning alone, with nothing measured or looked up behind them, "
  + "return two segments in order: the first gives the provisional answer and says plainly that it is not yet "
  + "settled; the second says what evidence would settle it. Never start a segment with a heading or a label. "
  + "segment_id and every node_refs entry must be an ASCII identifier matching ^[A-Za-z0-9][A-Za-z0-9:._-]*$; "
  + "copy ids exactly and never translate identifiers. served_number_refs is always [].";

/**
 * Current form (v4, owner-approved wording, 2026-10-15, option 1). The owner's
 * blind reading of Romanian answers: the writer translated v3's English rule
 * word for word — "says plainly that it is not yet settled" became
 * «și acesta nu este încă așezat» (the wrong sense of "settled"), and "what
 * evidence would settle it" became the heading-like «Ce ar putea stabili
 * întrebarea:». v4 is v3 with only that clause replaced: the first segment says,
 * in natural words of the question's language, that the answer may still
 * change; the second says what evidence would decide it; both are ordinary
 * sentences in that language, never a translation of the instructions. Every
 * other sentence is v3's, byte for byte.
 */
export const SYNTHESIZER_ANSWER_FORM =
  "Return only JSON with a segments array of at most two {segment_id,text,node_refs,served_number_refs} entries. "
  + "node_refs lists the ids of the points whose facts the segment states, copied exactly. Add no facts. "
  + "When the points a segment relies on rest on reasoning alone, with nothing measured or looked up behind them, "
  + "return two segments in order: the first gives the provisional answer and says plainly, in natural words of the "
  + "question's language, that it may still change; the second says what evidence would decide it. Write both as "
  + "ordinary sentences in that language, never as a translation of these instructions. Never start a segment with "
  + "a heading or a label. "
  + "segment_id and every node_refs entry must be an ASCII identifier matching ^[A-Za-z0-9][A-Za-z0-9:._-]*$; "
  + "copy ids exactly and never translate identifiers. served_number_refs is always [].";

/** Shipped history, as sent: v1's contract (the v1/v2 instruction and the v1 form). */
export const SYNTHESIZER_V1_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: SYNTHESIZER_V1_CONTRACT_ID,
  instruction: SYNTHESIZER_V2_INSTRUCTIONS,
  answerForm: SYNTHESIZER_V1_ANSWER_FORM
});

/** Shipped history, as sent: v2's contract (the same instruction as v1, the v2 form). */
export const SYNTHESIZER_V2_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: SYNTHESIZER_V2_CONTRACT_ID,
  instruction: SYNTHESIZER_V2_INSTRUCTIONS,
  answerForm: SYNTHESIZER_V2_ANSWER_FORM
});

/** Shipped history, as sent: v3's contract (the v3 instruction, still current, and the v3 form). */
export const SYNTHESIZER_V3_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: SYNTHESIZER_V3_CONTRACT_ID,
  instruction: SYNTHESIZER_INSTRUCTIONS,
  answerForm: SYNTHESIZER_V3_ANSWER_FORM
});

export const SYNTHESIZER_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: SYNTHESIZER_CONTRACT_ID,
  instruction: SYNTHESIZER_INSTRUCTIONS,
  answerForm: SYNTHESIZER_ANSWER_FORM
});

/**
 * Debate shape (spec §3.3 step 8): the answer length. A VARIANT of the current writer contract — its instruction,
 * then one sentence; the target arrives as the material field `answer_length` ("about N words"). A run without a
 * shape never sends it, so its writer prompt is the current contract's to the byte. Sealed with it by
 * `composerContractHash` (SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT). length.v1 was v3's variant (shipped history,
 * byte for byte); length.v2 was v4's: the same instruction and sentence, v4's form (shipped history, byte for byte).
 * length.v3 (owner 17 Oct #5, ruled 2026-10-29) is what the runner sends: length.v2 with ONE new sentence that names
 * "the length" instead of "the number of words", because for Chinese, Japanese and Thai the `answer_length` field names
 * characters ("about N characters", `lengthGuidanceText`), and the old sentence then contradicted its own field. One
 * sentence for every language, as the kernel's length sentences already are. OWNER WORDING — pending approval.
 */
export const SYNTHESIZER_LENGTH_V1_CONTRACT_ID = "serve.synthesizer.length.v1" as const;
export const SYNTHESIZER_LENGTH_V2_CONTRACT_ID = "serve.synthesizer.length.v2" as const;
export const SYNTHESIZER_LENGTH_CONTRACT_ID = "serve.synthesizer.length.v3" as const;
/** Shipped history: the sentence of length.v1 and length.v2, byte for byte (it names words). */
export const SYNTHESIZER_LENGTH_V1_SENTENCE = "Write the answer in about the number of words named in answer_length; "
  + "it is a target, never a reason to leave out a point the answer needs.";
/** length.v3's sentence: length.v2's with "the length" for "the number of words"; every other byte the same. */
export const SYNTHESIZER_LENGTH_SENTENCE = "Write the answer in about the length named in answer_length; "
  + "it is a target, never a reason to leave out a point the answer needs.";
/** Shipped history, as sent: v3's length variant (v3's instruction, the length sentence, v3's form). */
export const SYNTHESIZER_LENGTH_V1_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: SYNTHESIZER_LENGTH_V1_CONTRACT_ID,
  instruction: `${SYNTHESIZER_INSTRUCTIONS} ${SYNTHESIZER_LENGTH_V1_SENTENCE}`,
  answerForm: SYNTHESIZER_V3_ANSWER_FORM
});
/** Shipped history, as sent: v4's first length variant (v4's instruction, the words sentence, v4's form). */
export const SYNTHESIZER_LENGTH_V2_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: SYNTHESIZER_LENGTH_V2_CONTRACT_ID,
  instruction: `${SYNTHESIZER_INSTRUCTIONS} ${SYNTHESIZER_LENGTH_V1_SENTENCE}`,
  answerForm: SYNTHESIZER_ANSWER_FORM
});
export const SYNTHESIZER_LENGTH_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: SYNTHESIZER_LENGTH_CONTRACT_ID,
  instruction: `${SYNTHESIZER_INSTRUCTIONS} ${SYNTHESIZER_LENGTH_SENTENCE}`,
  answerForm: SYNTHESIZER_ANSWER_FORM
});
/**
 * V4 reading level (owner ruling N6, 2026-10-29): the writer told the person's level. Two VARIANTS of the current
 * contract — without and with the length sentence — each with the kernel's one reader sentence last
 * (READER_SENTENCE_WRITING); the level itself arrives as the material field `reader`. A debate asked without a level
 * never sends them, so its writer prompt is v4's or length.v3's to the byte. OWNER WORDING — pending approval.
 */
export const SYNTHESIZER_READER_CONTRACT_ID = "serve.synthesizer.reader.v1" as const;
export const SYNTHESIZER_LENGTH_READER_CONTRACT_ID = "serve.synthesizer.length.reader.v1" as const;
export const SYNTHESIZER_READER_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: SYNTHESIZER_READER_CONTRACT_ID,
  instruction: `${SYNTHESIZER_INSTRUCTIONS} ${READER_SENTENCE_WRITING}`,
  answerForm: SYNTHESIZER_ANSWER_FORM
});
export const SYNTHESIZER_LENGTH_READER_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: SYNTHESIZER_LENGTH_READER_CONTRACT_ID,
  instruction: `${SYNTHESIZER_INSTRUCTIONS} ${SYNTHESIZER_LENGTH_SENTENCE} ${READER_SENTENCE_WRITING}`,
  answerForm: SYNTHESIZER_ANSWER_FORM
});
/**
 * Shipped history: what `composerContractHash` sealed from the debate shape (2026-10-13) until v4 — v3, then
 * length.v1 (9a46af29...).
 */
export const SYNTHESIZER_V3_CONTRACTS_FINGERPRINT_TEXT: string = [
  promptContractFingerprintText(SYNTHESIZER_V3_PROMPT_CONTRACT),
  promptContractFingerprintText(SYNTHESIZER_LENGTH_V1_PROMPT_CONTRACT)
].join("\n---\n");
/** Shipped history: what `composerContractHash` sealed from v4 (2026-10-15) until the reading level — v4, then length.v2 (879d2c5d...). */
export const SYNTHESIZER_V4_CONTRACTS_FINGERPRINT_TEXT: string = [
  promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT),
  promptContractFingerprintText(SYNTHESIZER_LENGTH_V2_PROMPT_CONTRACT)
].join("\n---\n");
/**
 * What `composerContractHash` seals from the reading level (2026-10-29) on: every writer contract the runner sends — v4,
 * length.v3, reader.v1, then length.reader.v1.
 */
export const SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT: string = [
  promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT),
  promptContractFingerprintText(SYNTHESIZER_LENGTH_PROMPT_CONTRACT),
  promptContractFingerprintText(SYNTHESIZER_READER_PROMPT_CONTRACT),
  promptContractFingerprintText(SYNTHESIZER_LENGTH_READER_PROMPT_CONTRACT)
].join("\n---\n");
/** The material field that carries the answer length the writer aims at ("about N words"; a target, never a cut). */
export function synthesizerAnswerLengthField(words: number): Readonly<{ name: "answer_length"; content: string }> {
  if (!Number.isSafeInteger(words) || words < 1) throw new TypeError("SYNTHESIZER_ANSWER_LENGTH_INVALID");
  return Object.freeze({ name: "answer_length", content: `about ${String(words)} words` });
}
