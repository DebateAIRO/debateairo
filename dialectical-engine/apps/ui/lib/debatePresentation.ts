import type { ArgumentClaimView, DebateNode } from "./types";
import { toArgumentClaimStatus } from "./debateTreeUtils";
import debateChromeEnglish from "../messages/en/debateChrome.json" with { type: "json" };
import { t, type MessageCatalog } from "./i18n/translate.js";

export function formatDialecticalSupport(
  value: number,
  semanticsVersion: string,
  catalog: MessageCatalog = debateChromeEnglish
): string {
  return t(catalog, "debateChrome.presentation.dialecticalSupport", {
    version: semanticsVersion,
    value
  });
}

export type Role = "root" | "pro" | "con" | "pov";
export type ClaimRenderState = "root" | "pending" | "streaming" | "done" | "empty" | "abandoned" | "failed";

export type RolePalette = {
  text: string;
  bg: string;
  border: string;
  line: string;
  arrow: string;
};

export const ROLE_PALETTES: Record<Exclude<Role, "root">, RolePalette> = {
  pro: {
    text: "var(--pro-text)",
    bg: "var(--pro-bg)",
    border: "var(--pro-border)",
    line: "var(--pro-line)",
    arrow: "↑"
  },
  con: {
    text: "var(--con-text)",
    bg: "var(--con-bg)",
    border: "var(--con-border)",
    line: "var(--con-line)",
    arrow: "↓"
  },
  pov: {
    text: "var(--text-3)",
    bg: "var(--surface-sunken)",
    border: "var(--line-strong)",
    line: "var(--line-strong)",
    arrow: "◆"
  }
};

/**
 * Human labels for the four legacy POV lenses. These keep their curated names;
 * any other lens type is derived generically by lensLabelFromNodeType. This is
 * NOT an exhaustive list of allowed lenses -- the backend dynamic engine may
 * emit arbitrary lens node types.
 */
const LEGACY_LENS_KEYS: Record<string, string> = {
  SCIENTIFIC_POV: "debateChrome.presentation.lens.scientific",
  STATISTICAL_POV: "debateChrome.presentation.lens.statistical",
  ETHICAL_POV: "debateChrome.presentation.lens.ethical",
  PRACTICAL_POV: "debateChrome.presentation.lens.practical"
};

/**
 * Derive a readable label for an analytical lens/branch node type. Works for any
 * backend-provided node_type string, not just the four legacy POV literals:
 * strips a trailing "_POV", splits on separators, and title-cases. Returns the
 * generic fallback only when nothing meaningful can be derived (blank/unknown).
 */
export function lensLabelFromNodeType(
  nodeType: string | null | undefined,
  catalog: MessageCatalog = debateChromeEnglish
): string {
  const raw = (nodeType ?? "").trim();
  if (!raw) return t(catalog, "debateChrome.presentation.lens");
  const knownKey = LEGACY_LENS_KEYS[raw.toUpperCase()];
  if (knownKey) return t(catalog, knownKey);
  const cleaned = raw.replace(/_POV$/i, "").replace(/[_-]+/g, " ").trim();
  if (!cleaned) return t(catalog, "debateChrome.presentation.lens");
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Data-driven display label for a lens/branch node. Prefers an explicit
 * backend-provided label or lens name, then derives one from the node_type.
 * Keeps arbitrary N-branch debates rendering without the four legacy POV
 * literals baked in.
 */
export function branchLabelOf(
  node: Pick<DebateNode, "node_type" | "label" | "lens">,
  catalog: MessageCatalog = debateChromeEnglish
): string {
  const provided = (node.label ?? node.lens ?? "").trim();
  if (provided) return provided;
  return lensLabelFromNodeType(node.node_type, catalog);
}

export function roleOf(node: DebateNode): Role {
  if (node.node_type === "ROOT_CLAIM") return "root";
  if (node.node_type === "PRO") return "pro";
  if (node.node_type === "CON") return "con";
  return "pov";
}

export function roleLabel(node: DebateNode, catalog: MessageCatalog = debateChromeEnglish): string {
  const role = roleOf(node);
  if (role === "pov") return branchLabelOf(node, catalog);
  if (role === "pro") return t(catalog, "debateChrome.presentation.pro");
  if (role === "con") return t(catalog, "debateChrome.presentation.con");
  return t(catalog, "debateChrome.presentation.rootClaim");
}

export function renderStateOf(node: DebateNode): ClaimRenderState {
  if (node.node_type === "ROOT_CLAIM") return "root";
  // Terminal generation failure (backend stopping_reason
  // "generation_exhausted"): the branch is honestly failed, never a normal
  // claim card. Checked on the raw status because the domain status mapping
  // has no failed member.
  if ((node.status ?? "").trim().toLowerCase() === "failed") return "failed";
  const status = toArgumentClaimStatus(node.status);
  if (status === "abandoned") return "abandoned";
  if (status === "pending") return "pending";
  if (status === "generating") return "streaming";
  const hasContent = Boolean(node.claim?.trim() || node.active_generation?.argument?.trim());
  if (!hasContent) return "empty";
  return "done";
}

// ---- layout (ported from the design comp) --------------------------------

export const CARD_W = 392;
const COL = 444;
const VGAP = 30;
const PADX = 44;
const PADY = 56;

export type PlacedClaim = {
  id: string;
  node: DebateNode;
  parent: DebateNode | null;
  depth: number;
  x: number;
  y: number;
  w: number;
  h: number;
  role: Role;
  state: ClaimRenderState;
};

export type Connector = {
  id: string;
  d: string;
  color: string;
  width: number;
  dash: string;
  opacity: number;
  stance: "pro" | "con" | "pov";
};

export type CanvasLayout = {
  placed: PlacedClaim[];
  connectors: Connector[];
  width: number;
  height: number;
};

type Internal = {
  node: DebateNode;
  parent: DebateNode | null;
  depth: number;
  children: Internal[];
  h: number;
  block: number;
  x: number;
  y: number;
};

export function estimateHeight(node: DebateNode, state: ClaimRenderState, expanded: boolean): number {
  if (state === "root") {
    const lines = Math.max(2, Math.ceil((node.claim?.length || 0) / 42));
    return 112 + lines * 27;
  }
  if (state === "abandoned") return 76;
  if (state === "failed") return 92;
  if (state === "empty") return 92;
  if (state === "pending" || state === "streaming") return 138;
  const claimLines = Math.min(2, Math.max(1, Math.ceil((node.claim?.length || 0) / 42)));
  return 128 + claimLines * 22 + 42;
}

/**
 * Compute an absolute layout for the tree. `heightOf` returns the measured (or
 * estimated) pixel height of each claim card so the columns pack without overlap.
 */
export function layoutTree(
  root: DebateNode,
  heightOf: (node: DebateNode) => number
): CanvasLayout {
  const build = (node: DebateNode, parent: DebateNode | null, depth: number): Internal => {
    const children = (node.children || []).map((child) => build(child, node, depth + 1));
    return { node, parent, depth, children, h: heightOf(node), block: 0, x: 0, y: 0 };
  };
  const tree = build(root, null, 0);

  const measure = (n: Internal): void => {
    if (!n.children.length) {
      n.block = n.h;
      return;
    }
    n.children.forEach(measure);
    const total = n.children.reduce((sum, k) => sum + k.block, 0) + VGAP * (n.children.length - 1);
    n.block = Math.max(n.h, total);
  };

  const place = (n: Internal, top: number): void => {
    n.x = PADX + n.depth * COL;
    n.y = PADY + top + (n.block - n.h) / 2;
    if (!n.children.length) return;
    const total = n.children.reduce((sum, k) => sum + k.block, 0) + VGAP * (n.children.length - 1);
    let cur = top + (n.block - total) / 2;
    n.children.forEach((k) => {
      place(k, cur);
      cur += k.block + VGAP;
    });
  };

  measure(tree);
  place(tree, 0);

  const placed: PlacedClaim[] = [];
  const flatten = (n: Internal): void => {
    placed.push({
      id: n.node.id,
      node: n.node,
      parent: n.parent,
      depth: n.depth,
      x: n.x,
      y: n.y,
      w: CARD_W,
      h: n.h,
      role: roleOf(n.node),
      state: renderStateOf(n.node)
    });
    n.children.forEach(flatten);
  };
  flatten(tree);

  const byId = new Map<string, Internal>();
  const index = (n: Internal): void => {
    byId.set(n.node.id, n);
    n.children.forEach(index);
  };
  index(tree);

  const connectors: Connector[] = [];
  placed.forEach((p) => {
    if (!p.parent) return;
    const parent = byId.get(p.parent.id);
    const self = byId.get(p.id);
    if (!parent || !self) return;
    const x1 = parent.x + CARD_W;
    const y1 = parent.y + parent.h / 2;
    const x2 = self.x;
    const y2 = self.y + self.h / 2;
    const dx = Math.max(40, (x2 - x1) * 0.5);
    const role = p.role;
    const pal = role === "pro" ? ROLE_PALETTES.pro : role === "con" ? ROLE_PALETTES.con : ROLE_PALETTES.pov;
    const streaming = p.state === "streaming" || p.state === "pending";
    connectors.push({
      id: p.id,
      d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
      color: p.state === "empty" || p.state === "abandoned" ? "var(--line-strong)" : pal.line,
      width: p.state === "empty" || p.state === "abandoned" ? 1.5 : 2,
      dash: p.state === "empty" || p.state === "abandoned" ? "4 5" : "none",
      opacity: streaming ? 0.45 : p.state === "abandoned" ? 0.5 : 0.9,
      stance: role === "pro" || role === "con" ? role : "pov"
    });
  });

  let maxX = 0;
  let maxY = 0;
  placed.forEach((p) => {
    maxX = Math.max(maxX, p.x + CARD_W);
    maxY = Math.max(maxY, p.y + p.h);
  });

  return { placed, connectors, width: maxX + PADX, height: maxY + PADY };
}

export function countClaims(root: DebateNode | null): number {
  if (!root) return 0;
  let count = 0;
  const walk = (n: DebateNode) => {
    count += 1;
    (n.children || []).forEach(walk);
  };
  walk(root);
  return Math.max(0, count - 1);
}

export function treeDepth(root: DebateNode | null): number {
  if (!root) return 0;
  const walk = (n: DebateNode): number =>
    1 + (n.children || []).reduce((max, child) => Math.max(max, walk(child)), 0);
  return Math.max(0, walk(root) - 1);
}

/**
 * P4.1 client-side STRUCTURAL FALLBACK for the synthesis "Leans" meter: the
 * balance of surviving pro vs con arguments in the tree. This is a
 * transparent proxy (argument count), never a dialectical-strength reading —
 * used only when the backend's top-level `lean` field (coordinator/app/
 * scoring/lean.py's compute_lean, which prefers the propagated DF-QuAD
 * strength split) is absent, e.g. a debate payload cached before that field
 * existed. (Investigated and confirmed vestigial: `synthesis.provenance.lean`
 * was never populated by any backend path, so it is no longer read anywhere.)
 *
 * The v2 debate-generation contract guarantees a symmetric PRO/CON node count
 * on every completed branch (audit-verified 2026-07-22: all debates in the DB
 * had exactly equal PRO/CON counts) — a bare "Even" there would silently
 * misrepresent that permanent topology artifact as a genuine 50/50 reading,
 * so an exactly-symmetric split is always labeled "Even (structural)". A
 * genuinely asymmetric split (only reachable once adaptive expansion grows
 * one side more than the other) gets a plain Pro/Con/Even label instead, but
 * `source` still honestly reads "structural" either way.
 */
export function computeLean(
  root: DebateNode | null,
  catalog: MessageCatalog = debateChromeEnglish
): { pct: number; label: string; source: "structural" } | null {
  if (!root) return null;
  let pro = 0;
  let con = 0;
  const walk = (node: DebateNode) => {
    const role = roleOf(node);
    const state = renderStateOf(node);
    if (state !== "empty" && state !== "abandoned") {
      if (role === "pro") pro += 1;
      else if (role === "con") con += 1;
    }
    (node.children || []).forEach(walk);
  };
  walk(root);
  const total = pro + con;
  if (total === 0) return null;
  const pct = Math.round((pro / total) * 100);
  const label = pro === con
    ? t(catalog, "debateChrome.presentation.leanEvenStructural")
    : pct >= 55
      ? t(catalog, "debateChrome.presentation.pro")
      : pct <= 45
        ? t(catalog, "debateChrome.presentation.con")
        : t(catalog, "debateChrome.presentation.leanEven");
  return { pct, label, source: "structural" };
}

export function flattenOutline(root: DebateNode | null): { node: DebateNode; depth: number }[] {
  if (!root) return [];
  const rows: { node: DebateNode; depth: number }[] = [];
  const walk = (node: DebateNode, depth: number) => {
    (node.children || []).forEach((child) => {
      rows.push({ node: child, depth });
      walk(child, depth + 1);
    });
  };
  walk(root, 0);
  return rows;
}

// ---------------------------------------------------------------------------
// DDD-06A: ArgumentClaimView presentation helpers
// ---------------------------------------------------------------------------

/**
 * Extended render state that includes abandoned paths.
 * Abandoned paths must be visible in UX — collapsed/greyed + explained.
 * Never map "abandoned" to "empty" or omit it from the tree.
 */
export type ArgumentClaimRenderState = ClaimRenderState | "abandoned";

/**
 * Render state for an ArgumentClaimView.
 * Handles "abandoned" explicitly — DDD doctrine: abandoned paths stay visible.
 */
export function claimRenderStateOf(view: ArgumentClaimView): ArgumentClaimRenderState {
  if (view.claimRole === "ROOT_CLAIM") return "root";
  if (view.status === "abandoned") return "abandoned";
  if (view.status === "pending") return "pending";
  if (view.status === "generating") return "streaming";
  const hasContent = Boolean(view.claimText?.trim() || view.activeArgument?.argument?.trim());
  if (!hasContent) return "empty";
  return "done";
}

/**
 * Role label for an ArgumentClaimView — domain language over internal node_type values.
 */
export function claimRoleLabel(
  view: ArgumentClaimView,
  catalog: MessageCatalog = debateChromeEnglish
): string {
  if (view.claimRole === "ROOT_CLAIM") return t(catalog, "debateChrome.presentation.rootClaim");
  if (view.claimRole === "PRO") return t(catalog, "debateChrome.presentation.pro");
  if (view.claimRole === "CON") return t(catalog, "debateChrome.presentation.con");
  return lensLabelFromNodeType(view.claimRole, catalog);
}
