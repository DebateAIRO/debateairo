import type { Node } from "@/lib/types";
import { abstentionKindLabel, conditionMarkLabel } from "@/lib/v3Presentation";

export function NodeDetailDrawer({ node, onClose }: { node: Node | null; onClose(): void }) {
  if (node === null) return null;
  return <aside className="drawer open" aria-label="Node details">
    <button className="button" onClick={onClose}>Close</button>
    <div className="eyebrow">{node.way_of_knowing}</div><h2>{node.claim}</h2>
    <dl><dt>Base score</dt><dd>{node.base_score.value} · {node.base_score.source}</dd><dt>Final strength</dt><dd>{node.final_strength === null ? "Unavailable" : `${node.final_strength.value} · ${node.final_strength.source}`}</dd><dt>Replay</dt><dd>{node.final_strength?.replay_handle ?? "Unavailable"}</dd><dt>Restatement</dt><dd>{node.stranger_restatement.check_status}</dd><dt>Defeaters</dt><dd>{node.defeater_refs.length > 0 ? node.defeater_refs.join(", ") : node.defeater_exhaustion_marked ? "Rotation exhausted and marked" : "Obligation remains open"}</dd><dt>Judge disagreement</dt><dd>{node.disagreement === null ? "No disagreement record" : JSON.stringify(node.disagreement)}</dd></dl>
    {node.condition_marks.map((mark) => <div className="pill" key={mark}>{conditionMarkLabel(mark)}</div>)}
    {node.abstention ? <p><strong>Abstention:</strong> {abstentionKindLabel(node.abstention.kind)} · {node.abstention.unlock_condition}</p> : null}
  </aside>;
}
