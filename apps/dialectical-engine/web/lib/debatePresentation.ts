import type { DebateNode } from "./types";

export type Role = "root" | "pro" | "con" | "pov";
export type NodeRenderState = "root" | "pending" | "streaming" | "done" | "empty" | "abandoned";

export type RolePalette = {
  text: string;
  bg: string;
  border: string;
  line: string;
  arrow: string;
  label: string;
};

export const ROLE_PALETTES: Record<Exclude<Role, "root">, RolePalette> = {
  pro: {
    text: "var(--pro-text)",
    bg: "var(--pro-bg)",
    border: "var(--pro-border)",
    line: "var(--pro-line)",
    arrow: "↑",
    label: "Pro"
  },
  con: {
    text: "var(--con-text)",
    bg: "var(--con-bg)",
    border: "var(--con-border)",
    line: "var(--con-line)",
    arrow: "↓",
    label: "Con"
  },
  pov: {
    text: "var(--text-3)",
    bg: "var(--surface-sunken)",
    border: "var(--line-strong)",
    line: "oklch(0.78 0.01 80)",
    arrow: "◆",
    label: "Lens"
  }
};

const POV_LABELS: Record<string, string> = {
  SCIENTIFIC_POV: "Scientific",
  STATISTICAL_POV: "Statistical",
  ETHICAL_POV: "Ethical",
  PRACTICAL_POV: "Practical"
};

export function roleOf(node: DebateNode): Role {
  if (node.node_type === "ROOT_CLAIM") return "root";
  if (node.node_type === "PRO") return "pro";
  if (node.node_type === "CON") return "con";
  return "pov";
}

export function roleLabel(node: DebateNode): string {
  const role = roleOf(node);
  if (role === "pov") return POV_LABELS[node.node_type] ?? "Lens";
  if (role === "pro") return "Pro";
  if (role === "con") return "Con";
  return "Root claim";
}

export function renderStateOf(node: DebateNode): NodeRenderState {
  if (node.node_type === "ROOT_CLAIM") return "root";
  const status = (node.status || "").toLowerCase();
  if (status === "abandoned" || status === "stale" || status === "paused" || status === "stopped") return "abandoned";
  if (status === "pending" || status === "queued") return "pending";
  if (status === "generating" || status === "running" || status === "streaming") return "streaming";
  const hasContent = Boolean(node.claim?.trim() || node.active_generation?.argument?.trim());
  if (!hasContent) return "empty";
  return "done";
}

// ---- layout (ported from the design comp) --------------------------------

export const CARD_W = 320;
const COL = 404;
const VGAP = 24;
const PADX = 44;
const PADY = 40;

export type PlacedNode = {
  id: string;
  node: DebateNode;
  parent: DebateNode | null;
  depth: number;
  x: number;
  y: number;
  w: number;
  h: number;
  role: Role;
  state: NodeRenderState;
};

export type Connector = {
  id: string;
  d: string;
  color: string;
  width: number;
  dash: string;
  opacity: number;
};

export type CanvasLayout = {
  placed: PlacedNode[];
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

export function estimateHeight(node: DebateNode, state: NodeRenderState, expanded: boolean): number {
  if (state === "root") {
    const lines = Math.max(2, Math.ceil((node.claim?.length || 0) / 34));
    return 96 + lines * 26;
  }
  if (state === "abandoned") return 76;
  if (state === "empty") return 92;
  if (state === "pending" || state === "streaming") return 138;
  const claimLines = Math.max(1, Math.ceil((node.claim?.length || 0) / 38));
  const base = 96 + claimLines * 22;
  return expanded ? base + 118 : base;
}

/**
 * Compute an absolute layout for the tree. `heightOf` returns the measured (or
 * estimated) pixel height of each node's card so the columns pack without overlap.
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

  const placed: PlacedNode[] = [];
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
      color: p.state === "empty" || p.state === "abandoned" ? "oklch(0.82 0.006 80)" : pal.line,
      width: p.state === "empty" || p.state === "abandoned" ? 1.5 : 2,
      dash: p.state === "empty" || p.state === "abandoned" ? "4 5" : "none",
      opacity: streaming ? 0.45 : p.state === "abandoned" ? 0.5 : 0.9
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

export function countNodes(root: DebateNode | null): number {
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
 * A structural lean for the synthesis verdict bar: the balance of surviving
 * pro vs con arguments in the tree. This is a transparent proxy (argument
 * count), not an LLM judgement — used only when the backend doesn't supply
 * an explicit lean in synthesis provenance.
 */
export function computeLean(root: DebateNode | null): { pct: number; label: string } | null {
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
  const label = pct >= 55 ? "Pro" : pct <= 45 ? "Con" : "Even";
  return { pct, label };
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
