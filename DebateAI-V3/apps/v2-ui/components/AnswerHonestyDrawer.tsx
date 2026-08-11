"use client";

import type { Answer, ExecutionLedgerDigest, Inspection, InvestigationGap } from "@debateai/contract";
import type { LiveRunState } from "@/lib/v3/liveEvents";
import type { AnswerExport } from "@/lib/v3/answerExport";
import { unrepresentedEdges } from "@/lib/v3/adapter";
import { abstentionKindLabel, conditionMarkLabel, summarizeFreshness } from "@/lib/v3/labels";

/**
 * UI-01 honesty surface (additive, V2 drawer vocabulary). V2's workspace has
 * no home for V3's typed honesty — condition marks, abstention, freshness,
 * cost envelope, replay/inspection handles, the execution-ledger digest — and
 * the ticket's hard law is that none of it may be dropped. This drawer is the
 * S14 reading surface re-housed inside V2's own drawer design; it renders
 * only values the contract actually served, and typed absence otherwise.
 */

function labeledNumberLine(number: { value: number; source: string; replay_handle: string }): string {
  return `${number.value} · ${number.source} · replay ${number.replay_handle}`;
}

export function AnswerHonestyDrawer({
  answer,
  live,
  ledgerDigest,
  ledgerError,
  inspection,
  inspectionError,
  onShowInspection,
  onUnlinkMemory,
  actionState,
  investigationInput,
  onInvestigationInput,
  onRecordInvestigation,
  answerExport,
  token,
  onClose
}: {
  answer: Answer;
  live: LiveRunState;
  ledgerDigest: ExecutionLedgerDigest | null;
  ledgerError: string | null;
  inspection: Inspection | null;
  inspectionError: string | null;
  onShowInspection: () => void;
  onUnlinkMemory: () => void;
  actionState: string | null;
  investigationInput: Record<string, string>;
  onInvestigationInput: (gapRef: string, value: string) => void;
  onRecordInvestigation: (gap: InvestigationGap) => void;
  answerExport: AnswerExport;
  token: string | null;
  onClose: () => void;
}) {
  const freshness = summarizeFreshness(
    answer.nodes.map((node) => ({ subjectRef: node.node_id, state: node.staleness_state }))
  );
  const leftoverEdgeIds = new Set(unrepresentedEdges(answer).map((edge) => edge.edge_id));
  const componentsOnly = answer.serve_state === "COMPONENTS_ONLY";

  return (
    <>
      <div className="drawerScrim" onClick={onClose} />
      <aside className="drawer scroll" role="dialog" aria-modal aria-label="Honesty and provenance">
        <div className="drawerHead">
          <div className="drawerHeadMeta">
            <div className="nodeEyebrow">How to read this</div>
            <h2>Honesty &amp; provenance</h2>
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="drawerBody">
          <section className="wsSection" aria-label="Answer state">
            <div className="drawerSectionTitle">Answer state</div>
            <ul className="drawerFindingList">
              <li className="drawerFindingItem">
                <div className="drawerFindingMeta">
                  <span>terminal {answer.terminal}</span>
                  <span>serve {answer.serve_state}</span>
                  <span>conformance {answer.conformance_outcome}</span>
                </div>
                <div className="drawerFindingText">
                  Risk tier {answer.risk_tier} · {answer.tier_source} · {answer.tier_provenance_ref}
                </div>
                <div className="drawerFindingText">
                  As of {answer.as_of} · freshness {answer.staleness_state} · relevant as of {answer.relevant_as_of}
                </div>
                <div className="drawerFindingText">
                  Live stream: run {live.runPhase} · serve {live.servePhase}
                </div>
              </li>
            </ul>
            {componentsOnly ? (
              <div className="error" role="alert" style={{ marginTop: 10 }}>
                Components only: composed prose was not cleared to serve. The verified projections below remain readable.
              </div>
            ) : null}
          </section>

          <section className="wsSection" aria-label="Verdict">
            <div className="drawerSectionTitle">Verdict</div>
            {answer.verdict_state !== null ? (
              <div className="drawerFindingText">{answer.verdict_state}</div>
            ) : (
              <div className="drawerFindingText">
                Verdict unavailable · {answer.verdict_unavailable?.reason_ref ?? "no reason recorded"}
              </div>
            )}
            {answer.confidence_band !== null ? (
              <div className="drawerFindingText">Confidence band: {answer.confidence_band}</div>
            ) : null}
            {answer.band_ceiling !== null ? (
              <div className="drawerFindingText">
                Band ceiling {answer.band_ceiling.label} · basis LOOKED_UP {answer.band_ceiling.basis.LOOKED_UP} / RAN{" "}
                {answer.band_ceiling.basis.RAN} / REASONING {answer.band_ceiling.basis.REASONING} · lift:{" "}
                {answer.band_ceiling.lift_path}
              </div>
            ) : null}
          </section>

          <section className="wsSection" aria-label="Condition marks">
            <div className="drawerSectionTitle">Condition marks</div>
            {answer.condition_marks.length === 0 ? (
              <div className="drawerHintMuted">No condition marks on this answer.</div>
            ) : (
              <div className="roleChips">
                {answer.condition_marks.map((mark) => (
                  <span key={mark} className="roleChip" title={mark}>
                    {conditionMarkLabel(mark)}
                  </span>
                ))}
              </div>
            )}
            {answer.condition_mark_records.length > 0 ? (
              <ul className="drawerFindingList" aria-label="Named condition marks">
                {answer.condition_mark_records.map((record) => (
                  <li key={`${record.mark}:${record.subject_ref}`} className="drawerFindingItem">
                    <div className="drawerFindingMeta">
                      <span>{conditionMarkLabel(record.mark)}</span>
                      <span>{record.scope}</span>
                      <span>{record.subject_ref}</span>
                    </div>
                    <div className="drawerFindingText">{record.reason}</div>
                    {record.lift_path !== null ? (
                      <div className="drawerFindingText">Lift path: {record.lift_path}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {answer.abstention !== null ? (
            <section className="wsSection" aria-label="Abstention">
              <div className="drawerSectionTitle">Abstention</div>
              <div className="drawerFindingMeta">
                <span>{abstentionKindLabel(answer.abstention.kind)}</span>
                <span>
                  cell {answer.abstention.question_class}/{answer.abstention.risk_tier}
                </span>
                <span>price {answer.abstention.price}</span>
              </div>
              <div className="drawerFindingText">Unlock: {answer.abstention.unlock_condition}</div>
              <div className="drawerFindingText">
                Register {answer.abstention.register_row_key} v{answer.abstention.register_version} ·{" "}
                {answer.abstention.ledger_unknown_ref}
              </div>
            </section>
          ) : null}

          <section className="wsSection" aria-label="Per-item freshness">
            <div className="drawerSectionTitle">Per-item freshness</div>
            {freshness.kind === "EMPTY" ? (
              <div className="drawerHintMuted">No graph items carry freshness yet.</div>
            ) : freshness.kind === "UNIFORM" ? (
              <div className="drawerFindingText">
                All {freshness.items.length} graph items: {freshness.state}
              </div>
            ) : (
              <ul className="drawerFindingList">
                {freshness.items.map((item) => (
                  <li key={item.subjectRef} className="drawerFindingItem">
                    <div className="drawerFindingMeta">
                      <span>{item.subjectRef}</span>
                      <span>{item.state}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="wsSection" aria-label="Cost envelope">
            <div className="drawerSectionTitle">Cost envelope</div>
            <div className="drawerFindingMeta">
              <span>{answer.cost_envelope.state}</span>
              <span>{answer.cost_envelope.consumed_model_attempts} model attempts consumed</span>
              <span>budget tier {answer.composition_budget_tier}</span>
            </div>
            <div className="drawerFindingText">Protected core: {answer.cost_envelope.protected_core}</div>
            <div className="drawerFindingText">Basis: {JSON.stringify(answer.cost_envelope.basis)}</div>
          </section>

          <section className="wsSection" aria-label="Graph edges">
            <div className="drawerSectionTitle">Graph edges</div>
            {answer.edges.length === 0 ? (
              <div className="drawerHintMuted">No edges on this answer graph.</div>
            ) : (
              <ul className="drawerFindingList">
                {answer.edges.map((edge) => (
                  <li key={edge.edge_id} className="drawerFindingItem">
                    <div className="drawerFindingMeta">
                      <span>{edge.relation}</span>
                      <span>
                        {edge.from_node_ref} → {edge.target_ref}
                      </span>
                      <span>{edge.target_kind}</span>
                      {edge.placeholder ? <span>placeholder</span> : null}
                      {leftoverEdgeIds.has(edge.edge_id) ? <span>not drawn in tree</span> : null}
                    </div>
                    <div className="drawerFindingText">
                      {edge.strength.status === "PRESENT"
                        ? labeledNumberLine(edge.strength.number)
                        : `strength unknown · ${edge.strength.reason}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="wsSection" aria-label="Numbers and replay">
            <div className="drawerSectionTitle">Numbers and replay</div>
            {answer.number_slots.length === 0 ? (
              <div className="drawerHintMuted">No served number slots.</div>
            ) : (
              <ul className="drawerFindingList">
                {answer.number_slots.map((slot, index) => (
                  <li key={index} className="drawerFindingItem">
                    {slot.status === "PRESENT" ? (
                      <div className="drawerFindingText">{labeledNumberLine(slot.number)}</div>
                    ) : slot.status === "EVICTED" ? (
                      <div className="drawerFindingText">{conditionMarkLabel(slot.mark)}</div>
                    ) : (
                      <>
                        <div className="drawerFindingText">Withheld: {slot.reason}</div>
                        {slot.components.map((component, componentIndex) => (
                          <div key={componentIndex} className="drawerFindingText">
                            {labeledNumberLine(component)}
                          </div>
                        ))}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {answer.badges.length > 0 ? (
            <section className="wsSection" aria-label="Badges">
              <div className="drawerSectionTitle">Badges</div>
              <div className="roleChips">
                {answer.badges.map((badge) => (
                  <span key={badge} className="roleChip">
                    {badge}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {answer.residual_objections.length > 0 ? (
            <section className="wsSection" aria-label="Residual objections">
              <div className="drawerSectionTitle">Residual objections</div>
              <ul className="drawerFindingList">
                {answer.residual_objections.map((objection) => (
                  <li key={objection} className="drawerFindingItem">
                    <div className="drawerFindingText">{objection}</div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="wsSection" aria-label="What would reverse this">
            <div className="drawerSectionTitle">What would reverse this</div>
            <div className="drawerFindingText">{answer.reversal_point}</div>
          </section>

          {answer.value_hinges.length > 0 ? (
            <section className="wsSection" aria-label="Value hinges">
              <div className="drawerSectionTitle">Value hinges</div>
              <ul className="drawerFindingList">
                {answer.value_hinges.map((hinge) => (
                  <li key={hinge.value_hinge_ref} className="drawerFindingItem">
                    <div className="drawerFindingMeta">
                      <span>
                        {hinge.left_option_ref} ↔ {hinge.right_option_ref}
                      </span>
                      <span>
                        weights {hinge.weight_source}
                        {hinge.weight_owner !== null ? ` by ${hinge.weight_owner}` : ""}
                      </span>
                    </div>
                    <div className="drawerFindingText">
                      Rejected criteria: {hinge.rejected_criteria.length === 0 ? "None recorded" : hinge.rejected_criteria.join(", ")}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {answer.shadow_suppressions.length > 0 ? (
            <section className="wsSection" aria-label="Shadow suppressions">
              <div className="drawerSectionTitle">Shadow suppressions</div>
              <ul className="drawerFindingList">
                {answer.shadow_suppressions.map((suppression, index) => (
                  <li key={index} className="drawerFindingItem">
                    <div className="drawerFindingMeta">
                      <span>{suppression.gate}</span>
                      <span>{suppression.subject_ref}</span>
                    </div>
                    <div className="drawerFindingText">Unlock: {suppression.unlock_condition}</div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="wsSection" aria-label="Builds on a previous answer">
            <div className="drawerSectionTitle">Builds on a previous answer</div>
            {answer.memory_disclosure !== null && answer.memory_disclosure.matched ? (
              <>
                <div className="drawerFindingMeta">
                  <span>{answer.memory_disclosure.tier ?? "tier unrecorded"}</span>
                  <span>{answer.memory_disclosure.relation ?? "relation unrecorded"}</span>
                </div>
                <div className="drawerFindingText">
                  Prior freshness: {answer.memory_disclosure.prior?.staleness_state ?? "No linked prior answer"}
                </div>
                {answer.memory_disclosure.unlink.available ? (
                  <button type="button" className="btn" onClick={onUnlinkMemory}>
                    Unlink prior answer
                  </button>
                ) : null}
              </>
            ) : (
              <div className="drawerHintMuted">No matched prior answer.</div>
            )}
          </section>

          <section className="wsSection" aria-label="Authorized inspection">
            <div className="drawerSectionTitle">Authorized inspection</div>
            <div className="drawerFindingText">Handle: {answer.inspection_handle}</div>
            <button type="button" className="btn" onClick={onShowInspection}>
              Show me why
            </button>
            {inspectionError !== null ? (
              <div className="drawerHintMuted" role="alert">
                {inspectionError}
              </div>
            ) : null}
            {inspection !== null ? (
              <pre className="drawerFindingText" style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>
                {JSON.stringify(inspection, null, 2)}
              </pre>
            ) : null}
          </section>

          <section className="wsSection" aria-label="Execution ledger digest">
            <div className="drawerSectionTitle">Execution ledger digest</div>
            <div className="drawerFindingText">Handle: {answer.ledger_digest_handle}</div>
            {ledgerError !== null ? (
              <div className="drawerHintMuted" role="alert">
                {ledgerError}
              </div>
            ) : ledgerDigest === null ? (
              <div className="drawerHintMuted">Ledger digest loading…</div>
            ) : (
              <>
                <div className="drawerFindingText">{ledgerDigest.entries.length} executed ledger entries.</div>
                <ul className="drawerFindingList">
                  {ledgerDigest.work_items.map((item) => (
                    <li key={item.node_ref} className="drawerFindingItem">
                      <div className="drawerFindingMeta">
                        <span>{item.node_ref}</span>
                        <span>{item.status}</span>
                      </div>
                      {item.reason !== null ? <div className="drawerFindingText">{item.reason}</div> : null}
                    </li>
                  ))}
                  {ledgerDigest.entries.map((entry) => (
                    <li key={entry.entry_ref} className="drawerFindingItem">
                      <div className="drawerFindingMeta">
                        <span>{entry.action_kind}</span>
                        <span>{entry.subject_ref}</span>
                        <span>{entry.outcome}</span>
                        <span>{entry.actor_ref}</span>
                      </div>
                      <div className="drawerFindingText">
                        {entry.started_at} → {entry.finished_at}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {live.cycleRefusals.length > 0 ? (
            <section className="wsSection" aria-label="Cycle refusals">
              <div className="drawerSectionTitle">Cycle refusals</div>
              {live.cycleRefusals.map((code, index) => (
                <div key={`${code}:${index}`} className="error">
                  {code}: redirected to a shared crux.
                </div>
              ))}
            </section>
          ) : null}

          {live.investigationGaps.length > 0 ? (
            <section className="wsSection" aria-label="Investigate deeper">
              <div className="drawerSectionTitle">Investigate deeper</div>
              {live.investigationGaps.map((gap) => (
                <article key={gap.gap_ref} className="wsCard">
                  <div className="wsCardHead">
                    <h3>{gap.gap}</h3>
                    <span className="pill">Model-authored · {conditionMarkLabel(gap.verdict)}</span>
                  </div>
                  <p>
                    {gap.why} · effort {gap.effort_grade}
                  </p>
                  <pre className="drawerFindingText" style={{ whiteSpace: "pre-wrap" }}>{gap.constructed_prompt}</pre>
                  {gap.accepts_user_input ? (
                    <label style={{ display: "grid", gap: 6 }}>
                      Optional verbatim input
                      <textarea
                        value={investigationInput[gap.gap_ref] ?? ""}
                        onChange={(event) => onInvestigationInput(gap.gap_ref, event.target.value)}
                      />
                    </label>
                  ) : null}
                  <button type="button" className="btn" disabled={!token} onClick={() => onRecordInvestigation(gap)}>
                    Record investigate-deeper request
                  </button>
                  {!token ? <div className="drawerHintMuted">Unlock actions to record a request.</div> : null}
                </article>
              ))}
            </section>
          ) : null}

          {live.honestyEvents.length > 0 || live.ledgerEvents.length > 0 ? (
            <section className="wsSection" aria-label="Live honesty events">
              <div className="drawerSectionTitle">Live honesty events</div>
              <div className="drawerFindingText">
                {live.honestyEvents.length} honesty · {live.ledgerEvents.length} ledger events observed on the stream.
              </div>
            </section>
          ) : null}

          <section className="wsSection" aria-label="Export">
            <div className="drawerSectionTitle">Export</div>
            {answerExport.available ? (
              <a className="btn" href={answerExport.href} download={answerExport.filename}>
                ↓ {answerExport.label}
              </a>
            ) : (
              <div className="drawerHintMuted">{answerExport.message}</div>
            )}
          </section>

          {actionState !== null ? (
            <div className="pill" role="status">
              {actionState}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
