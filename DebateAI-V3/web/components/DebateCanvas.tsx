import type { Edge, Node } from "@/lib/types";

export function DebateCanvas({ nodes, edges, liveNodes, onSelect }: {
  nodes: readonly Node[];
  edges: readonly Edge[];
  liveNodes: Readonly<Record<string, { lifecycle: string }>>;
  onSelect(node: Node): void;
}) {
  return <section aria-label="Argument graph" className="card">
    <div className="sectionHead"><h2>Argument graph</h2><span className="count">{nodes.length} nodes · {edges.length} edges</span></div>
    <div style={{ display: "grid", gap: 12 }}>
      {nodes.map((node) => <button key={node.node_id} className="debateCard" onClick={() => onSelect(node)}>
        <span className="pill">{liveNodes[node.node_id]?.lifecycle ?? "recorded"}</span>
        <span className="debateCardClaim">{node.claim}</span>
        <span>{node.way_of_knowing} · {node.staleness_state}</span>
      </button>)}
      {edges.map((edge) => <div key={edge.edge_id} className="debateCardMeta">
        <strong>{edge.relation}</strong> {edge.from_node_ref} → {edge.target_ref} · {edge.strength.status === "PRESENT" ? `${edge.strength.number.value} · ${edge.strength.number.source} · ${edge.strength.number.replay_handle}` : edge.strength.reason}
      </div>)}
    </div>
  </section>;
}
