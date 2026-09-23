"use client";

import type { Answer, ExecutionLedgerDigest, Inspection, InvestigationGap } from "@debateai/contract";
import type { LiveRunState } from "@/lib/v3/liveEvents";
import type { AnswerExport } from "@/lib/v3/answerExport";
import { unrepresentedEdges } from "@/lib/v3/adapter";
import { abstentionKindLabel, conditionMarkLabel, riskTierSourceLabel, summarizeFreshness } from "@/lib/v3/labels";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import miscEnglish from "@/messages/en/misc.json";

/**
 * UI-01 honesty surface (additive, V2 drawer vocabulary). V2's workspace has
 * no home for V3's typed honesty — condition marks, abstention, freshness,
 * cost envelope, replay/inspection handles, the execution-ledger digest — and
 * the ticket's hard law is that none of it may be dropped. This drawer is the
 * S14 reading surface re-housed inside V2's own drawer design; it renders
 * only values the contract actually served, and typed absence otherwise.
 */

function labeledNumberLine(
  catalog: MessageCatalog,
  number: { value: number; source: string; replay_handle: string }
): string {
  return t(catalog, "misc.answerHonesty.numberLine", {
    value: number.value,
    source: number.source,
    replayHandle: number.replay_handle
  });
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
  onClose,
  catalog = miscEnglish
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
  catalog?: MessageCatalog;
}) {
  const { locale } = useChromeI18n();
  const freshness = summarizeFreshness(
    answer.nodes.map((node) => ({ subjectRef: node.node_id, state: node.staleness_state }))
  );
  const leftoverEdgeIds = new Set(unrepresentedEdges(answer).map((edge) => edge.edge_id));
  const componentsOnly = answer.serve_state === "COMPONENTS_ONLY";

  return (
    <>
      <div className="drawerScrim" onClick={onClose} />
      <aside className="drawer scroll" role="dialog" aria-modal aria-label={t(catalog, "misc.answerHonesty.honestyAndProvenance")}>
        <div className="drawerHead">
          <div className="drawerHeadMeta">
            <div className="nodeEyebrow">{t(catalog, "misc.answerHonesty.howToReadThis")}</div>
            <h2>{t(catalog, "misc.answerHonesty.honestyAndProvenance")}</h2>
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label={t(catalog, "misc.answerHonesty.close")}>
            ×
          </button>
        </div>

        <div className="drawerBody">
          <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.answerState")}>
            <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.answerState")}</div>
            <ul className="drawerFindingList">
              <li className="drawerFindingItem">
                <div className="drawerFindingMeta">
                  <span>{t(catalog, "misc.answerHonesty.terminalValue", { terminal: answer.terminal })}</span>
                  <span>{t(catalog, "misc.answerHonesty.serveValue", { serve: answer.serve_state })}</span>
                  <span>{t(catalog, "misc.answerHonesty.conformanceValue", { conformance: answer.conformance_outcome })}</span>
                </div>
                <div className="drawerFindingText">
                  {t(catalog, "misc.answerHonesty.riskTierLine", {
                    riskTier: answer.risk_tier,
                    source: riskTierSourceLabel(answer.tier_source),
                    provenanceRef: answer.tier_provenance_ref
                  })}
                </div>
                <div className="drawerFindingText">
                  {t(catalog, "misc.answerHonesty.freshnessLine", {
                    asOf: answer.as_of,
                    freshness: answer.staleness_state,
                    relevantAsOf: answer.relevant_as_of
                  })}
                </div>
                <div className="drawerFindingText">
                  {t(catalog, "misc.answerHonesty.liveStreamLine", {
                    runPhase: live.runPhase,
                    servePhase: live.servePhase
                  })}
                </div>
              </li>
            </ul>
            {componentsOnly ? (
              <div className="error" role="alert" style={{ marginTop: 10 }}>
                {t(catalog, "misc.answerHonesty.componentsOnlyNotice")}
              </div>
            ) : null}
          </section>

          <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.verdict")}>
            <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.verdict")}</div>
            {answer.verdict_state !== null ? (
              <div className="drawerFindingText" data-ai-generated="true">{answer.verdict_state}</div>
            ) : (
              <div className="drawerFindingText">
                {t(catalog, "misc.answerHonesty.verdictUnavailable", {
                  reason: answer.verdict_unavailable?.reason_ref ?? t(catalog, "misc.answerHonesty.noReasonRecorded")
                })}
              </div>
            )}
            {answer.confidence_band !== null ? (
              <div className="drawerFindingText" data-ai-generated="true">
                {t(catalog, "misc.answerHonesty.confidenceBand", { band: answer.confidence_band })}
              </div>
            ) : null}
            {answer.band_ceiling !== null ? (
              <div className="drawerFindingText">
                {t(catalog, "misc.answerHonesty.bandCeiling", {
                  label: answer.band_ceiling.label,
                  lookedUp: answer.band_ceiling.basis.LOOKED_UP,
                  ran: answer.band_ceiling.basis.RAN,
                  reasoning: answer.band_ceiling.basis.REASONING,
                  liftPath: answer.band_ceiling.lift_path
                })}
              </div>
            ) : null}
          </section>

          <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.conditionMarks")}>
            <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.conditionMarks")}</div>
            {answer.condition_marks.length === 0 ? (
              <div className="drawerHintMuted">{t(catalog, "misc.answerHonesty.noConditionMarks")}</div>
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
              <ul className="drawerFindingList" aria-label={t(catalog, "misc.answerHonesty.namedConditionMarks")}>
                {answer.condition_mark_records.map((record) => (
                  <li key={`${record.mark}:${record.subject_ref}`} className="drawerFindingItem">
                    <div className="drawerFindingMeta">
                      <span>{conditionMarkLabel(record.mark)}</span>
                      <span>{record.scope}</span>
                      <span>{record.subject_ref}</span>
                    </div>
                    <div className="drawerFindingText">{record.reason}</div>
                    {record.lift_path !== null ? (
                      <div className="drawerFindingText">{t(catalog, "misc.answerHonesty.liftPath", { liftPath: record.lift_path })}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {answer.abstention !== null ? (
            <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.abstention")}>
              <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.abstention")}</div>
              <div className="drawerFindingMeta">
                <span>{abstentionKindLabel(answer.abstention.kind)}</span>
                <span>
                  {t(catalog, "misc.answerHonesty.cell", {
                    questionClass: answer.abstention.question_class,
                    riskTier: answer.abstention.risk_tier
                  })}
                </span>
                <span>{t(catalog, "misc.answerHonesty.price", { price: answer.abstention.price })}</span>
              </div>
              <div className="drawerFindingText">{t(catalog, "misc.answerHonesty.unlock", { condition: answer.abstention.unlock_condition })}</div>
              <div className="drawerFindingText">
                {t(catalog, "misc.answerHonesty.registerLine", {
                  rowKey: answer.abstention.register_row_key,
                  version: answer.abstention.register_version,
                  unknownRef: answer.abstention.ledger_unknown_ref
                })}
              </div>
            </section>
          ) : null}

          <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.perItemFreshness")}>
            <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.perItemFreshness")}</div>
            {freshness.kind === "EMPTY" ? (
              <div className="drawerHintMuted">{t(catalog, "misc.answerHonesty.noGraphFreshness")}</div>
            ) : freshness.kind === "UNIFORM" ? (
              <div className="drawerFindingText">
                {tPlural(catalog, "misc.answerHonesty.allGraphItems", freshness.items.length, locale, {
                  state: freshness.state
                })}
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

          <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.costEnvelope")}>
            <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.costEnvelope")}</div>
            <div className="drawerFindingMeta">
              <span>{answer.cost_envelope.state}</span>
              <span>{tPlural(
                catalog,
                "misc.answerHonesty.modelAttemptsConsumed",
                answer.cost_envelope.consumed_model_attempts,
                locale
              )}</span>
              <span>{t(catalog, "misc.answerHonesty.budgetTier", { tier: answer.composition_budget_tier })}</span>
            </div>
            <div className="drawerFindingText">{t(catalog, "misc.answerHonesty.protectedCore", { core: answer.cost_envelope.protected_core })}</div>
            <div className="drawerFindingText">{t(catalog, "misc.answerHonesty.basis", { basis: JSON.stringify(answer.cost_envelope.basis) })}</div>
          </section>

          <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.graphEdges")}>
            <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.graphEdges")}</div>
            {answer.edges.length === 0 ? (
              <div className="drawerHintMuted">{t(catalog, "misc.answerHonesty.noEdges")}</div>
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
                      {edge.placeholder ? <span>{t(catalog, "misc.answerHonesty.placeholder")}</span> : null}
                      {leftoverEdgeIds.has(edge.edge_id) ? <span>{t(catalog, "misc.answerHonesty.notDrawnInTree")}</span> : null}
                    </div>
                    <div className="drawerFindingText">
                      {edge.strength.status === "PRESENT"
                        ? labeledNumberLine(catalog, edge.strength.number)
                        : t(catalog, "misc.answerHonesty.strengthUnknown", { reason: edge.strength.reason })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.numbersAndReplay")}>
            <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.numbersAndReplay")}</div>
            {answer.number_slots.length === 0 ? (
              <div className="drawerHintMuted">{t(catalog, "misc.answerHonesty.noServedNumberSlots")}</div>
            ) : (
              <ul className="drawerFindingList">
                {answer.number_slots.map((slot, index) => (
                  <li key={index} className="drawerFindingItem">
                    {slot.status === "PRESENT" ? (
                      <div className="drawerFindingText">{labeledNumberLine(catalog, slot.number)}</div>
                    ) : (
                      <div className="drawerFindingText">{conditionMarkLabel(slot.mark)}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {answer.badges.length > 0 ? (
            <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.badges")}>
              <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.badges")}</div>
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
            <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.residualObjections")}>
              <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.residualObjections")}</div>
              <ul className="drawerFindingList">
                {answer.residual_objections.map((objection) => (
                  <li key={objection} className="drawerFindingItem">
                    <div className="drawerFindingText" data-ai-generated="true">{objection}</div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.whatWouldReverseThis")}>
            <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.whatWouldReverseThis")}</div>
            <div className="drawerFindingText" data-ai-generated="true">{answer.reversal_point}</div>
          </section>

          {answer.value_hinges.length > 0 ? (
            <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.valueHinges")}>
              <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.valueHinges")}</div>
              <ul className="drawerFindingList">
                {answer.value_hinges.map((hinge) => (
                  <li key={hinge.value_hinge_ref} className="drawerFindingItem">
                    <div className="drawerFindingMeta">
                      <span>
                        {hinge.left_option_ref} ↔ {hinge.right_option_ref}
                      </span>
                      <span>
                        {hinge.weight_owner !== null
                          ? t(catalog, "misc.answerHonesty.weightsBy", {
                              source: hinge.weight_source,
                              owner: hinge.weight_owner
                            })
                          : t(catalog, "misc.answerHonesty.weights", { source: hinge.weight_source })}
                      </span>
                    </div>
                    <div className="drawerFindingText">
                      {t(catalog, "misc.answerHonesty.rejectedCriteria", {
                        criteria: hinge.rejected_criteria.length === 0
                          ? t(catalog, "misc.answerHonesty.noneRecorded")
                          : hinge.rejected_criteria.join(", ")
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {answer.shadow_suppressions.length > 0 ? (
            <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.shadowSuppressions")}>
              <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.shadowSuppressions")}</div>
              <ul className="drawerFindingList">
                {answer.shadow_suppressions.map((suppression, index) => (
                  <li key={index} className="drawerFindingItem">
                    <div className="drawerFindingMeta">
                      <span>{suppression.gate}</span>
                      <span>{suppression.subject_ref}</span>
                    </div>
                    <div className="drawerFindingText">{t(catalog, "misc.answerHonesty.unlock", { condition: suppression.unlock_condition })}</div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.buildsOnPreviousAnswer")}>
            <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.buildsOnPreviousAnswer")}</div>
            {answer.memory_disclosure !== null && answer.memory_disclosure.matched ? (
              <>
                <div className="drawerFindingMeta">
                  <span>{answer.memory_disclosure.tier ?? t(catalog, "misc.answerHonesty.tierUnrecorded")}</span>
                  <span>{answer.memory_disclosure.relation ?? t(catalog, "misc.answerHonesty.relationUnrecorded")}</span>
                </div>
                <div className="drawerFindingText">
                  {t(catalog, "misc.answerHonesty.priorFreshness", {
                    freshness: answer.memory_disclosure.prior?.staleness_state
                      ?? t(catalog, "misc.answerHonesty.noLinkedPriorAnswer")
                  })}
                </div>
                {answer.memory_disclosure.unlink.available ? (
                  <button type="button" className="btn" onClick={onUnlinkMemory}>
                    {t(catalog, "misc.answerHonesty.unlinkPriorAnswer")}
                  </button>
                ) : null}
              </>
            ) : (
              <div className="drawerHintMuted">{t(catalog, "misc.answerHonesty.noMatchedPriorAnswer")}</div>
            )}
          </section>

          <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.authorizedInspection")}>
            <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.authorizedInspection")}</div>
            <div className="drawerFindingText">{t(catalog, "misc.answerHonesty.handle", { handle: answer.inspection_handle })}</div>
            <button type="button" className="btn" onClick={onShowInspection}>
              {t(catalog, "misc.answerHonesty.showMeWhy")}
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

          <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.executionLedgerDigest")}>
            <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.executionLedgerDigest")}</div>
            <div className="drawerFindingText">{t(catalog, "misc.answerHonesty.handle", { handle: answer.ledger_digest_handle })}</div>
            {ledgerError !== null ? (
              <div className="drawerHintMuted" role="alert">
                {ledgerError}
              </div>
            ) : ledgerDigest === null ? (
              <div className="drawerHintMuted">{t(catalog, "misc.answerHonesty.ledgerDigestLoading")}</div>
            ) : (
              <>
                <div className="drawerFindingText">
                  {tPlural(
                    catalog,
                    "misc.answerHonesty.executedLedgerEntries",
                    ledgerDigest.entries.length,
                    locale
                  )}
                </div>
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
            <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.cycleRefusals")}>
              <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.cycleRefusals")}</div>
              {live.cycleRefusals.map((code, index) => (
                <div key={`${code}:${index}`} className="error">
                  {t(catalog, "misc.answerHonesty.redirectedToSharedCrux", { code })}
                </div>
              ))}
            </section>
          ) : null}

          {live.investigationGaps.length > 0 ? (
            <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.investigateDeeper")}>
              <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.investigateDeeper")}</div>
              {live.investigationGaps.map((gap) => (
                <article key={gap.gap_ref} className="wsCard">
                  <div className="wsCardHead">
                    <h3>{gap.gap}</h3>
                    <span className="pill">
                      {t(catalog, "misc.answerHonesty.modelAuthored", { verdict: conditionMarkLabel(gap.verdict) })}
                    </span>
                  </div>
                  <p>
                    {t(catalog, "misc.answerHonesty.investigationEffort", {
                      reason: gap.why,
                      effort: gap.effort_grade
                    })}
                  </p>
                  <pre className="drawerFindingText" style={{ whiteSpace: "pre-wrap" }}>{gap.constructed_prompt}</pre>
                  {gap.accepts_user_input ? (
                    <label style={{ display: "grid", gap: 6 }}>
                      {t(catalog, "misc.answerHonesty.optionalVerbatimInput")}
                      <textarea
                        value={investigationInput[gap.gap_ref] ?? ""}
                        onChange={(event) => onInvestigationInput(gap.gap_ref, event.target.value)}
                      />
                    </label>
                  ) : null}
                  <button type="button" className="btn" disabled={!token} onClick={() => onRecordInvestigation(gap)}>
                    {t(catalog, "misc.answerHonesty.recordInvestigateDeeperRequest")}
                  </button>
                  {!token ? (
                    <div className="drawerHintMuted">{t(catalog, "misc.answerHonesty.unlockActionsToRecord")}</div>
                  ) : null}
                </article>
              ))}
            </section>
          ) : null}

          {live.honestyEvents.length > 0 || live.ledgerEvents.length > 0 ? (
            <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.liveHonestyEvents")}>
              <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.liveHonestyEvents")}</div>
              <div className="drawerFindingText">
                {t(catalog, "misc.answerHonesty.eventsObserved", {
                  honestyCount: live.honestyEvents.length,
                  ledgerCount: live.ledgerEvents.length
                })}
              </div>
            </section>
          ) : null}

          <section className="wsSection" aria-label={t(catalog, "misc.answerHonesty.export")}>
            <div className="drawerSectionTitle">{t(catalog, "misc.answerHonesty.export")}</div>
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
