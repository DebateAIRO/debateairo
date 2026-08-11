import type { AnswerSurfaceProjection } from "@/lib/v3Presentation";
import { abstentionKindLabel, conditionMarkLabel } from "@/lib/v3Presentation";

export function DebateWorkspaceDrawer({ answer }: { answer: AnswerSurfaceProjection }) {
  return <aside className="card" aria-label="Honesty and provenance">
    <div className="sectionHead"><h2>How to read this</h2></div>
    <p>Freshness: {answer.time.stalenessState} · relevant as of {answer.time.relevantAsOf}</p>
    <p>Conformance: {answer.conformanceOutcome}</p>
    {answer.conditionMarks.map((mark) => <div className="pill" key={mark}>{conditionMarkLabel(mark)}</div>)}
    {answer.conditionMarkRecords.length > 0 ? <section aria-label="Condition mark records">
      <h3>Named condition marks</h3>
      {answer.conditionMarkRecords.map((record) => <p key={`${record.mark}:${record.subject_ref}`}>
        {conditionMarkLabel(record.mark)} · {record.subject_ref} · {record.reason}
      </p>)}
    </section> : null}
    {answer.abstention ? <p><strong>Abstention:</strong> {abstentionKindLabel(answer.abstention.kind)} · cell {answer.abstention.question_class}/{answer.abstention.risk_tier} · {answer.abstention.unlock_condition}</p> : null}
    <h3>What would reverse this</h3><p>{answer.reversalPoint}</p>
    {answer.valueHinges.map((hinge) => <section key={hinge.value_hinge_ref}><h3>Value hinge</h3><p>{hinge.left_option_ref} ↔ {hinge.right_option_ref} · weights: {hinge.weight_source}{hinge.weight_owner ? ` by ${hinge.weight_owner}` : ""}</p><p>Rejected criteria: {hinge.rejected_criteria.length === 0 ? "None recorded" : hinge.rejected_criteria.join(", ")}</p></section>)}
    <h3>Cost envelope</h3><p>{answer.costEnvelope.state} · protected core {answer.costEnvelope.protected_core}</p>
    <h3>Numbers and replay</h3>{answer.numberSlots.map((slot, index) => <p key={index}>{slot.status === "PRESENT" ? `${slot.number.value} · ${slot.number.source} · ${slot.number.replay_handle}` : slot.status === "EVICTED" ? conditionMarkLabel(slot.mark) : slot.reason}</p>)}
    <h3>Execution</h3><p>{answer.ledgerDigestHandle}</p>
  </aside>;
}
