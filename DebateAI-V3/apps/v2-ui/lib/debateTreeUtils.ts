import type { ArgumentClaimRole, ArgumentClaimStatus, ArgumentClaimView, DebateNode } from "./types";

export function findNodeById(tree: DebateNode, id: string): DebateNode | null {
  if (tree.id === id) {
    return tree;
  }

  for (const child of tree.children) {
    const match = findNodeById(child, id);
    if (match !== null) {
      return match;
    }
  }

  return null;
}

export function findNodePathById(tree: DebateNode, id: string): DebateNode[] {
  if (tree.id === id) {
    return [tree];
  }

  for (const child of tree.children) {
    const childPath = findNodePathById(child, id);
    if (childPath.length > 0) {
      return [tree, ...childPath];
    }
  }

  return [];
}

export function partitionArgumentChildren(node: DebateNode): {
  proChildren: DebateNode[];
  conChildren: DebateNode[];
} {
  const proChildren: DebateNode[] = [];
  const conChildren: DebateNode[] = [];

  for (const child of node.children) {
    if (child.node_type === "PRO") {
      proChildren.push(child);
    } else if (child.node_type === "CON") {
      conChildren.push(child);
    }
  }

  return { proChildren, conChildren };
}

/**
 * Structural / argument node types that are NOT analytical lenses. Everything
 * else (any backend-provided lens/branch node_type) is treated as a lens, so
 * the tree renders arbitrary N-branch debates, not just the four legacy POVs.
 */
const NON_LENS_NODE_TYPES = new Set(["ROOT_CLAIM", "PRO", "CON", "EVIDENCE"]);

/**
 * True when a node_type represents an analytical lens/branch rather than the
 * structural root, a pro/con argument, or evidence. Generic across any
 * backend-provided lens type -- not limited to the four legacy POV literals.
 */
export function isLensNodeType(nodeType: string | null | undefined): boolean {
  const raw = (nodeType ?? "").trim().toUpperCase();
  if (!raw) return false;
  return !NON_LENS_NODE_TYPES.has(raw);
}

export function perspectiveChildren(node: DebateNode): DebateNode[] {
  return node.children.filter((child) => isLensNodeType(child.node_type));
}

export function initialFocusedNodeId(tree: DebateNode): string {
  return tree.id;
}

export function nearestExistingNodeId(
  tree: DebateNode,
  selectedId: string | null | undefined,
): string {
  if (selectedId !== null && selectedId !== undefined && findNodeById(tree, selectedId) !== null) {
    return selectedId;
  }

  return initialFocusedNodeId(tree);
}

// ---------------------------------------------------------------------------
// DDD-06A: ArgumentClaim domain language helpers
// ---------------------------------------------------------------------------

/**
 * Map a raw backend status string to the domain ArgumentClaimStatus.
 * "stale" and related backend values are surfaced as "abandoned" — abandoned
 * paths must remain visible in UX, never silently pruned.
 */
export function isAbandonedArgumentStatus(rawStatus: string | null | undefined): boolean {
  const s = (rawStatus ?? "").toLowerCase();
  return s === "abandoned" || s === "stale" || s === "paused" || s === "stopped";
}

/**
 * Returns true when a node's dialectical strength score is at or below the
 * documented low-strength threshold, false otherwise.
 *
 * Honesty contract: `strength == null` (missing/unknown score) always returns
 * `false` -- unknown strength is NOT the same as "known low strength," and
 * nodes without a score must never be dimmed for missing data.
 *
 * The default threshold (0.35) intentionally reuses the SAME value as the
 * "unsupported" band cutoff in coordinator/app/scoring/verdict.py
 * (VERDICT_THRESHOLDS_VERSION = "verdict-v1", _UNSUPPORTED_THRESHOLD = 0.35)
 * so the two numbers do not silently drift apart. If that coordinator
 * threshold ever changes, update this default to match.
 */
export function isLowStrengthNode(
  strength: number | null | undefined,
  threshold = 0.35,
): boolean {
  if (strength == null) return false;
  return strength <= threshold;
}

export function toArgumentClaimStatus(rawStatus: string | null | undefined): ArgumentClaimStatus {
  const s = (rawStatus ?? "").toLowerCase();
  if (isAbandonedArgumentStatus(s)) return "abandoned";
  if (s === "generating" || s === "running" || s === "streaming") return "generating";
  if (s === "pending" || s === "queued") return "pending";
  return "active";
}

/** Convert a DebateNode (persistence shape) to an ArgumentClaimView (domain shape). */
export function nodeToArgumentClaimView(node: DebateNode): ArgumentClaimView {
  return {
    id: node.id,
    debateId: node.debate_id,
    parentId: node.parent_id,
    claimRole: node.node_type as ArgumentClaimRole,
    depth: node.depth,
    position: node.position,
    claimText: node.claim ?? "",
    activeArgument: node.active_generation,
    investigationPath: node.materialized_path,
    children: node.children.map(nodeToArgumentClaimView),
    status: toArgumentClaimStatus(node.status),
    activeGenerationId: node.active_generation_id,
    score: node.score,
  };
}

/** Find an ArgumentClaimView by id in a domain tree. */
export function findClaimById(tree: ArgumentClaimView, id: string): ArgumentClaimView | null {
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    const match = findClaimById(child, id);
    if (match !== null) return match;
  }
  return null;
}

/** Returns true if this claim is on an abandoned exploration path. */
export function isAbandonedClaim(view: ArgumentClaimView): boolean {
  return view.status === "abandoned";
}

/** Split a claim's children into pro-stance and con-stance claims. */
export function partitionByStance(view: ArgumentClaimView): {
  proClaims: ArgumentClaimView[];
  conClaims: ArgumentClaimView[];
} {
  return {
    proClaims: view.children.filter((c) => c.claimRole === "PRO"),
    conClaims: view.children.filter((c) => c.claimRole === "CON"),
  };
}

/** Get perspective (analytical lens) children of a claim, for any lens type. */
export function perspectiveClaims(view: ArgumentClaimView): ArgumentClaimView[] {
  return view.children.filter((c) => isLensNodeType(c.claimRole));
}
