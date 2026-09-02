import type { PublicDebate } from "@debateai/contract";

type PublicNode = NonNullable<PublicDebate["answer"]["nodes"]>[number];
type Side = "pro" | "con";

export type PublicArgumentPresentation = Readonly<{
  nodeId: string;
  side: Side;
  claim: string;
  baseScore: PublicNode["base_score"];
  finalScore: PublicNode["final_strength"];
  makerLineage: PublicNode["maker_lineage"];
  review: PublicNode["review"];
}>;

export type PublicDebatePresentation = Readonly<{
  verdict: PublicDebate["answer"]["verdict"];
  confidenceBand: string | null;
  summary: readonly string[];
  caveat: string;
  models: readonly string[];
  strongestPro: PublicArgumentPresentation | null;
  strongestCon: PublicArgumentPresentation | null;
  proCount: number;
  conCount: number;
  proPercent: number;
  supportMeasured: boolean;
  metrics: Readonly<{
    support: string;
    reviewed: string;
    judged: string;
    convergence: string;
  }>;
}>;

function uniqueModelIds(nodes: readonly PublicNode[]): string[] {
  return [...new Set(nodes.flatMap((node) =>
    node.maker_lineage === null ? [] : [node.maker_lineage.model_id]
  ))];
}

function scoreOf(node: PublicNode): number {
  return Math.max(0, node.final_strength?.value ?? node.base_score.value);
}

function strongest(
  nodes: readonly PublicNode[],
  sides: ReadonlyMap<string, Side>,
  side: Side
): PublicArgumentPresentation | null {
  let chosen: PublicNode | null = null;
  for (const node of nodes) {
    if (sides.get(node.node_id) !== side) continue;
    if (chosen === null || scoreOf(node) > scoreOf(chosen)) chosen = node;
  }
  if (chosen === null) return null;
  return {
    nodeId: chosen.node_id,
    side,
    claim: chosen.claim,
    baseScore: chosen.base_score,
    finalScore: chosen.final_strength,
    makerLineage: chosen.maker_lineage,
    review: chosen.review
  };
}

export function buildPublicDebatePresentation(debate: PublicDebate): PublicDebatePresentation {
  const nodes = debate.answer.nodes ?? [];
  const sides = new Map<string, Side>();
  for (const edge of debate.answer.edges ?? []) {
    if (sides.has(edge.from_node_ref)) continue;
    if (edge.relation === "support") sides.set(edge.from_node_ref, "pro");
    if (edge.relation === "attack" || edge.relation === "defeat") {
      sides.set(edge.from_node_ref, "con");
    }
  }

  const proNodes = nodes.filter((node) => sides.get(node.node_id) === "pro");
  const conNodes = nodes.filter((node) => sides.get(node.node_id) === "con");
  const proWeight = proNodes.reduce((total, node) => total + scoreOf(node), 0);
  const conWeight = conNodes.reduce((total, node) => total + scoreOf(node), 0);
  const supportMeasured = proWeight + conWeight > 0;
  const reviewed = nodes.filter((node) => node.review !== null);
  const agreed = reviewed.filter((node) => node.review?.outcome === "agree").length;
  const judged = nodes.filter((node) => node.final_strength !== null).length;

  return {
    verdict: debate.answer.verdict,
    confidenceBand: debate.answer.confidence_band,
    summary: debate.answer.summary_segments.map((segment) => segment.text),
    caveat: debate.answer.residual_objections[0] ?? debate.answer.reversal_point,
    models: uniqueModelIds(nodes),
    strongestPro: strongest(nodes, sides, "pro"),
    strongestCon: strongest(nodes, sides, "con"),
    proCount: proNodes.length,
    conCount: conNodes.length,
    proPercent: supportMeasured ? Math.round(proWeight / (proWeight + conWeight) * 100) : 50,
    supportMeasured,
    metrics: {
      support: `${proNodes.length} pro · ${conNodes.length} con`,
      reviewed: `${reviewed.length} / ${nodes.length}`,
      judged: `${judged} / ${nodes.length}`,
      convergence: reviewed.length === 0 ? "Not measured" : `${agreed} / ${reviewed.length} agreed`
    }
  };
}
