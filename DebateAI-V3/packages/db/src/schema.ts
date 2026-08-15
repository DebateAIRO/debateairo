import { bigint, boolean, doublePrecision, integer, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const core = pgSchema("core");
export const ledger = pgSchema("ledger");
export const serve = pgSchema("serve");
export const scorecard = pgSchema("scorecard");
export const register = pgSchema("register");
export const memory = pgSchema("memory");
export const evidence = pgSchema("evidence");
export const evaluator = pgSchema("evaluator");

export const run = core.table("run", {
  runId: uuid("run_id").primaryKey(),
  questionLine: text("question_line").notNull(),
  askerId: text("asker_id").notNull(),
  sessionId: text("session_id").notNull(),
  callerScope: text("caller_scope").notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  askerRiskTier: text("asker_risk_tier").notNull(),
  riskTier: text("risk_tier").notNull(),
  tierSource: text("tier_source").notNull(),
  tierProvenanceRef: text("tier_provenance_ref").notNull(),
  compositionBudgetTier: text("composition_budget_tier").notNull(),
  depthParams: jsonb("depth_params").notNull(),
  agentCount: integer("agent_count").notNull(),
  discoveredPanel: jsonb("discovered_panel").notNull(),
  strangerSampleRate: doublePrecision("stranger_sample_rate").notNull(),
  envelopeBasis: jsonb("envelope_basis").notNull(),
  registerVersion: bigint("register_version", { mode: "number" }).notNull(),
  batteryVersion: text("battery_version").notNull(),
  askContract: jsonb("ask_contract").notNull(),
  createdAtSeq: bigint("created_at_seq", { mode: "number" }).notNull()
});

export const workItem = core.table("work_item", {
  workItemId: uuid("work_item_id").primaryKey(),
  runId: uuid("run_id"),
  batteryRowId: text("battery_row_id").notNull(),
  nodeSet: jsonb("node_set").notNull(),
  commandKey: text("command_key").notNull(),
  state: text("state").notNull(),
  claimedBy: text("claimed_by"),
  claimDeadline: timestamp("claim_deadline", { withTimezone: true }),
  createdAtSeq: bigint("created_at_seq", { mode: "number" }).notNull()
});

export const node = core.table("node", {
  nodeId: uuid("node_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  claimText: text("claim_text").notNull(),
  claimType: text("claim_type").notNull(),
  parentNodeId: uuid("parent_node_id"),
  childKind: text("child_kind"),
  depth: integer("depth").notNull(),
  siblingOrdinal: integer("sibling_ordinal").notNull(),
  materializedPath: text("materialized_path").notNull(),
  generationStatus: text("generation_status").notNull(),
  pathStatus: text("path_status").notNull(),
  explorationDecision: text("exploration_decision").notNull(),
  wayOfKnowing: text("way_of_knowing").notNull(),
  provenanceRef: uuid("provenance_ref"),
  locator: text("locator"),
  valueLaden: boolean("value_laden").notNull(),
  positionLabel: text("position_label"),
  isFolder: boolean("is_folder").notNull(),
  createdAtSeq: bigint("created_at_seq", { mode: "number" }).notNull(),
  relevantAsOf: timestamp("relevant_as_of", { withTimezone: true }).notNull()
});

export const revisionTrigger = core.table("revision_trigger", {
  revisionTriggerEventId: uuid("revision_trigger_event_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => run.runId),
  triggerKey: text("trigger_key").notNull(),
  triggerKind: text("trigger_kind").notNull(),
  subjectKind: text("subject_kind").notNull(),
  subjectRef: text("subject_ref").notNull(),
  state: text("state").notNull(),
  reason: text("reason").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const reviewClock = core.table("review_clock", {
  reviewClockEventId: uuid("review_clock_event_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => run.runId),
  subjectKind: text("subject_kind").notNull(),
  subjectRef: text("subject_ref").notNull(),
  questionClass: text("question_class").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  registerRowKey: text("register_row_key").notNull(),
  registerVersion: bigint("register_version", { mode: "number" }).notNull(),
  registerSourceRef: text("register_source_ref").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const stalenessState = core.table("staleness_state", {
  stalenessStateEventId: uuid("staleness_state_event_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => run.runId),
  subjectKind: text("subject_kind").notNull(),
  subjectRef: text("subject_ref").notNull(),
  state: text("state").notNull(),
  reason: text("reason").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const questionLivenessEvent = core.table("question_liveness_event", {
  questionLivenessEventId: uuid("question_liveness_event_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => run.runId),
  kind: text("kind").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const investigationRequest = core.table("investigation_request", {
  investigationRequestId: uuid("investigation_request_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => run.runId),
  answerId: uuid("answer_id").notNull(),
  answerVersion: integer("answer_version").notNull(),
  gapRef: text("gap_ref").notNull(),
  userInput: text("user_input"),
  inputKind: text("input_kind").notNull(),
  status: text("status").notNull(),
  replayHandle: text("replay_handle").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const edge = core.table("edge", {
  edgeId: uuid("edge_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  sourceNodeId: uuid("source_node_id").notNull(),
  targetKind: text("target_kind").notNull(),
  targetNodeId: uuid("target_node_id"),
  targetEdgeId: uuid("target_edge_id"),
  targetEdgePolarity: text("target_edge_polarity"),
  polarity: text("polarity").notNull(),
  kind: text("kind"),
  strength: doublePrecision("strength"),
  magnitudeStatus: text("magnitude_status").notNull(),
  strengthSource: text("strength_source").notNull(),
  provenanceRef: text("provenance_ref").notNull(),
  createdAtSeq: bigint("created_at_seq", { mode: "number" }).notNull()
});

export const ledgerEntry = ledger.table("ledger_entry", {
  ledgerEntryId: uuid("ledger_entry_id").primaryKey(),
  sequence: bigint("sequence", { mode: "number" }).notNull(),
  runId: uuid("run_id"),
  attemptId: uuid("attempt_id"),
  actionKind: text("action_kind").notNull(),
  callSiteKey: text("call_site_key"),
  subjectItemId: text("subject_item_id").notNull(),
  stanceAtAction: text("stance_at_action").notNull(),
  outcome: text("outcome").notNull(),
  actorRef: text("actor_ref").notNull(),
  inputHash: text("input_hash").notNull(),
  contractHash: text("contract_hash").notNull(),
  rawArtifactRef: uuid("raw_artifact_ref"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull()
});

export const rawArtifact = ledger.table("raw_artifact", {
  rawArtifactId: uuid("raw_artifact_id").primaryKey(),
  attemptId: uuid("attempt_id").notNull(),
  runId: uuid("run_id"),
  providerRef: text("provider_ref").notNull(),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  maker: text("maker").notNull(),
  modelVersion: text("model_version"),
  rawText: text("raw_text").notNull(),
  metadataJson: jsonb("metadata_json").notNull(),
  parseStatus: text("parse_status").notNull(),
  parseError: text("parse_error"),
  inputHash: text("input_hash").notNull(),
  contractHash: text("contract_hash").notNull(),
  contentHash: text("content_hash").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const nodeReview = ledger.table("node_review", {
  nodeReviewId: uuid("node_review_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  nodeId: uuid("node_id").notNull(),
  authorRawArtifactRef: uuid("author_raw_artifact_ref").notNull(),
  reviewRawArtifactRef: uuid("review_raw_artifact_ref").notNull(),
  outcome: text("outcome").notNull(),
  reasons: jsonb("reasons").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const propagationRun = ledger.table("propagation_run", {
  propagationRunId: uuid("propagation_run_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  inputHash: text("input_hash").notNull(),
  contractHash: text("contract_hash").notNull(),
  graphFingerprint: text("graph_fingerprint").notNull(),
  arrowOrder: jsonb("arrow_order").notNull(),
  clusterRecords: jsonb("cluster_records").notNull(),
  operatorByParent: jsonb("operator_by_parent").notNull(),
  transmissionReductions: jsonb("transmission_reductions").notNull(),
  liftRecords: jsonb("lift_records").notNull(),
  judgementSelectionRule: jsonb("judgement_selection_rule").notNull(),
  judgementSelectionRuleKey: text("judgement_selection_rule_key"),
  judgementSelectionRuleRegisterVersion: bigint("judgement_selection_rule_register_version", { mode: "number" }),
  judgementSelectionRuleSourceRef: text("judgement_selection_rule_source_ref"),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const reducedJudgement = ledger.table("reduced_judgement", {
  reducedJudgementId: uuid("reduced_judgement_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  nodeId: uuid("node_id").notNull(),
  rawArtifactRef: uuid("raw_artifact_ref").notNull(),
  tau: doublePrecision("tau").notNull(),
  numberKind: text("number_kind").notNull(),
  sourceRef: text("source_ref").notNull(),
  producer: text("producer").notNull(),
  replayHandle: text("replay_handle").notNull(),
  wayOfKnowing: text("way_of_knowing").notNull(),
  uncertaintyLadderPosition: text("uncertainty_ladder_position"),
  uncertaintyDrivers: jsonb("uncertainty_drivers"),
  scoreCaps: jsonb("score_caps"),
  holes: jsonb("holes"),
  branchIdentifier: text("branch_identifier"),
  reducerVersion: text("reducer_version"),
  judgeWeightVersion: text("judge_weight_version"),
  selectedJudgementRef: uuid("selected_judgement_ref"),
  dispersion: doublePrecision("dispersion"),
  panelContractHashes: jsonb("panel_contract_hashes"),
  disagreement: jsonb("disagreement"),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const nodeStrengthRecord = ledger.table("node_strength_record", {
  propagationRunId: uuid("propagation_run_id").notNull(),
  nodeId: uuid("node_id").notNull(),
  strength: doublePrecision("strength").notNull(),
  numberKind: text("number_kind").notNull(),
  sourceRef: text("source_ref").notNull(),
  producer: text("producer").notNull(),
  replayHandle: text("replay_handle").notNull(),
  wayOfKnowing: text("way_of_knowing").notNull(),
  tauSource: text("tau_source"),
  clusterId: text("cluster_id"),
  judgedBy: text("judged_by"),
  abstained: boolean("abstained").notNull(),
  supportedBy: jsonb("supported_by").notNull(),
  attackedBy: jsonb("attacked_by").notNull(),
  operatorUsed: text("operator_used"),
  operatorLevel: text("operator_level"),
  positionLabel: text("position_label"),
  liftMarker: jsonb("lift_marker").notNull(),
  rivalOperator: text("rival_operator"),
  rivalStrength: doublePrecision("rival_strength"),
  reducedJudgementRef: uuid("reduced_judgement_ref")
    .references(() => reducedJudgement.reducedJudgementId)
});

export const sensitivityRecord = ledger.table("sensitivity_record", {
  propagationRunId: uuid("propagation_run_id").notNull(),
  removedNodeId: uuid("removed_node_id").notNull(),
  leverage: doublePrecision("leverage").notNull(),
  fragility: jsonb("fragility").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const valueHinge = core.table("value_hinge", {
  valueHingeId: uuid("value_hinge_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => run.runId),
  leftOptionId: text("left_option_id").notNull(),
  rightOptionId: text("right_option_id").notNull(),
  criterionIds: jsonb("criterion_ids").notNull(),
  reversalBoundary: jsonb("reversal_boundary").notNull(),
  weightSource: text("weight_source").notNull(),
  weightOwner: text("weight_owner"),
  weightVector: jsonb("weight_vector"),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const reversalPoint = core.table("reversal_point", {
  reversalPointId: uuid("reversal_point_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => run.runId),
  valueHingeId: uuid("value_hinge_id").notNull().references(() => valueHinge.valueHingeId),
  leftOptionId: text("left_option_id").notNull(),
  rightOptionId: text("right_option_id").notNull(),
  boundary: jsonb("boundary").notNull(),
  rejectedCriteria: jsonb("rejected_criteria").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const overlayRun = ledger.table("overlay_run", {
  overlayRunId: uuid("overlay_run_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => run.runId),
  propagationRunId: uuid("propagation_run_id").notNull().references(() => propagationRun.propagationRunId),
  weightSource: text("weight_source").notNull(),
  weightOwner: text("weight_owner"),
  weightVector: jsonb("weight_vector"),
  profileRef: text("profile_ref"),
  profileVersion: text("profile_version"),
  signatureRef: text("signature_ref"),
  acceptedCriteria: jsonb("accepted_criteria").notNull(),
  rejectedCriteria: jsonb("rejected_criteria").notNull(),
  paretoOptionIds: jsonb("pareto_option_ids").notNull(),
  recordedArrowOrder: jsonb("recorded_arrow_order").notNull(),
  recordedStrengths: jsonb("recorded_strengths").notNull(),
  detachedStrengths: jsonb("detached_strengths").notNull(),
  detachmentByteIdentical: boolean("detachment_byte_identical").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const factBundle = serve.table("fact_bundle", {
  factBundleId: uuid("fact_bundle_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  facts: jsonb("facts").notNull(),
  residualObjections: jsonb("residual_objections").notNull(),
  contentHash: text("content_hash").notNull(),
  version: integer("version").notNull()
});

export const composedText = serve.table("composed_text", {
  composedTextId: uuid("composed_text_id").primaryKey(),
  factBundleId: uuid("fact_bundle_id").notNull(),
  segments: jsonb("segments").notNull(),
  rawArtifactRef: uuid("raw_artifact_ref").notNull(),
  attempt: integer("attempt").notNull()
});

export const conformanceRecord = serve.table("conformance_record", {
  conformanceRecordId: uuid("conformance_record_id").primaryKey(),
  composedTextId: uuid("composed_text_id").notNull(),
  segmentResults: jsonb("segment_results").notNull(),
  coverageMode: text("coverage_mode").notNull(),
  rawArtifactRefs: jsonb("raw_artifact_refs").notNull(),
  sealedAtSeq: bigint("sealed_at_seq", { mode: "number" }).notNull()
});

export const servedNumber = serve.table("served_number", {
  servedNumberId: uuid("served_number_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  answerId: uuid("answer_id"),
  answerVersion: integer("answer_version"),
  numberRef: text("number_ref"),
  value: doublePrecision("value").notNull(),
  numberKind: text("number_kind").notNull(),
  sourceRef: text("source_ref").notNull(),
  producer: text("producer").notNull(),
  replayHandle: text("replay_handle").notNull(),
  provenanceRef: uuid("provenance_ref").notNull()
});

export const servedNumberEvent = serve.table("served_number_event", {
  eventId: uuid("event_id").primaryKey(),
  servedNumberId: uuid("served_number_id").notNull(),
  status: text("status").notNull(),
  reason: text("reason"),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const answer = serve.table("answer", {
  answerId: uuid("answer_id").notNull(),
  answerVersion: integer("answer_version").notNull(),
  runId: uuid("run_id").notNull(),
  workItemId: uuid("work_item_id").notNull(),
  terminal: text("terminal").notNull(),
  serveState: text("serve_state").notNull(),
  verdictState: text("verdict_state"),
  confidenceBand: text("confidence_band"),
  bandCeiling: jsonb("band_ceiling"),
  answerForm: jsonb("answer_form").notNull(),
  conditionMarks: jsonb("condition_marks").notNull(),
  reversalPoint: text("reversal_point"),
  buildsOnPrevious: jsonb("builds_on_previous"),
  memoryDisclosure: jsonb("memory_disclosure"),
  badges: jsonb("badges"),
  verdictUnavailable: jsonb("verdict_unavailable"),
  factBundleId: uuid("fact_bundle_id").notNull(),
  composedTextId: uuid("composed_text_id"),
  conformanceRecordId: uuid("conformance_record_id"),
  sealedAtSeq: bigint("sealed_at_seq", { mode: "number" }).notNull(),
  relevantAsOf: timestamp("relevant_as_of", { withTimezone: true }).notNull()
});

export const segmentSuppression = serve.table("segment_suppression", {
  answerId: uuid("answer_id").notNull(),
  answerVersion: integer("answer_version").notNull(),
  segmentId: text("segment_id").notNull(),
  evictedNumberRef: text("evicted_number_ref").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const conditionMark = serve.table("condition_mark", {
  conditionMarkId: uuid("condition_mark_id").primaryKey(),
  answerId: uuid("answer_id").notNull(),
  answerVersion: integer("answer_version").notNull(),
  mark: text("mark").notNull(),
  scope: text("scope").notNull(),
  subjectRef: text("subject_ref").notNull(),
  reason: text("reason").notNull(),
  liftPath: text("lift_path"),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const conditionMarkNode = serve.table("condition_mark_node", {
  conditionMarkId: uuid("condition_mark_id").notNull(),
  nodeId: uuid("node_id").notNull()
});

export const shadowSuppression = serve.table("shadow_suppression", {
  shadowSuppressionId: uuid("shadow_suppression_id").primaryKey(),
  answerId: uuid("answer_id").notNull(),
  answerVersion: integer("answer_version").notNull(),
  gate: text("gate").notNull(),
  subjectRef: text("subject_ref").notNull(),
  wouldHaveSuppressed: jsonb("would_have_suppressed").notNull(),
  unlockCondition: text("unlock_condition").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const abstention = serve.table("abstention", {
  abstentionId: uuid("abstention_id").primaryKey(),
  answerId: uuid("answer_id").notNull(),
  answerVersion: integer("answer_version").notNull(),
  kind: text("kind").notNull(),
  questionClass: text("question_class").notNull(),
  riskTier: text("risk_tier").notNull(),
  price: doublePrecision("price").notNull(),
  registerRowKey: text("register_row_key").notNull(),
  registerVersion: bigint("register_version", { mode: "number" }).notNull(),
  registerSourceRef: text("register_source_ref").notNull(),
  unlockCondition: text("unlock_condition").notNull(),
  ledgerUnknownRef: text("ledger_unknown_ref").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const registerRow = register.table("register_row", {
  registerVersion: bigint("register_version", { mode: "number" }).notNull(),
  rowKey: text("row_key").notNull(),
  valueJson: jsonb("value_json").notNull(),
  sourceRef: text("source_ref").notNull()
});

export const querySet = evidence.table("query_set", {
  querySetId: uuid("query_set_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  version: integer("version").notNull(),
  queries: jsonb("queries").notNull(),
  contentHash: text("content_hash").notNull(),
  frozenAtSeq: bigint("frozen_at_seq", { mode: "number" }).notNull()
});

export const queryAmendment = evidence.table("query_amendment", {
  queryAmendmentId: uuid("query_amendment_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  querySetRef: uuid("query_set_ref").notNull(),
  kind: text("kind").notNull(),
  amendedQuery: text("amended_query").notNull(),
  reason: text("reason").notNull(),
  confirmationPower: text("confirmation_power").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const sourceRecord = evidence.table("source_record", {
  sourceRecordId: uuid("source_record_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  querySetRef: uuid("query_set_ref").notNull(),
  locator: text("locator").notNull(),
  archivedVersion: text("archived_version").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  accessDepth: text("access_depth").notNull(),
  sourceRole: text("source_role").notNull(),
  suppliedNumberRef: text("supplied_number_ref"),
  suppliedQuoteRef: text("supplied_quote_ref"),
  contentHash: text("content_hash"),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evidenceItem = evidence.table("evidence_item", {
  evidenceItemId: uuid("evidence_item_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  nodeId: uuid("node_id").notNull(),
  sourceRef: uuid("source_ref").notNull(),
  excerpt: text("excerpt"),
  excerptTruncated: boolean("excerpt_truncated").notNull(),
  truncationAtWordBoundary: boolean("truncation_at_word_boundary").notNull(),
  admissibility: text("admissibility").notNull(),
  offSubjectShare: text("off_subject_share"),
  baseScore: doublePrecision("base_score"),
  scoreProducer: text("score_producer"),
  provenanceClusterKey: text("provenance_cluster_key").notNull(),
  archivedSourceVersion: text("archived_source_version").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const absenceRow = evidence.table("absence_row", {
  absenceRowId: uuid("absence_row_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  querySetRef: uuid("query_set_ref").notNull(),
  queryText: text("query_text").notNull(),
  scope: text("scope").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  reason: text("reason").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const probeCapture = evidence.table("probe_capture", {
  probeCaptureId: uuid("probe_capture_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  nodeId: uuid("node_id").notNull(),
  gatewayLedgerEntryRef: uuid("gateway_ledger_entry_ref").notNull(),
  rawArtifactRef: uuid("raw_artifact_ref").notNull(),
  instrumentRef: text("instrument_ref").notNull(),
  expectedPolarity: text("expected_polarity").notNull(),
  observedOutcome: text("observed_outcome").notNull(),
  observation: jsonb("observation").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const instrumentCertification = evidence.table("instrument_certification", {
  instrumentCertificationId: uuid("instrument_certification_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  instrumentRef: text("instrument_ref").notNull(),
  positiveProbeCaptureRef: uuid("positive_probe_capture_ref").notNull(),
  negativeProbeCaptureRef: uuid("negative_probe_capture_ref").notNull(),
  outcome: text("outcome").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const citationRouteRecord = evidence.table("citation_route_record", {
  citationRouteRecordId: uuid("citation_route_record_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  nodeId: uuid("node_id").notNull(),
  assertionRef: text("assertion_ref").notNull(),
  rowId: text("row_id").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull(),
  outcome: text("outcome").notNull(),
  route: text("route"),
  sourceRef: uuid("source_ref"),
  evidenceItemRef: uuid("evidence_item_ref"),
  absenceRowRef: uuid("absence_row_ref"),
  ledgerEntryRef: uuid("ledger_entry_ref"),
  openingActionRef: uuid("opening_action_ref"),
  attemptAccessDepth: text("attempt_access_depth"),
  claimedSourceText: text("claimed_source_text"),
  previewLimb: text("preview_limb"),
  compareUnavailableReason: text("compare_unavailable_reason"),
  observedVersion: text("observed_version"),
  observedAt: timestamp("observed_at", { withTimezone: true }),
  mismatchLocus: jsonb("mismatch_locus"),
  engineVersion: text("engine_version").notNull()
});

export const modelIdentity = scorecard.table("model_identity", {
  modelIdentityId: uuid("model_identity_id").primaryKey(),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  modelVersion: text("model_version").notNull(),
  observedAsOf: timestamp("observed_as_of", { withTimezone: true }).notNull(),
  provenanceRef: text("provenance_ref").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const answerOutcome = scorecard.table("answer_outcome", {
  answerOutcomeId: uuid("answer_outcome_id").primaryKey(),
  outcomeAttemptId: uuid("outcome_attempt_id").notNull(),
  answerId: uuid("answer_id").notNull(),
  answerVersion: integer("answer_version").notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  runId: uuid("run_id").notNull(),
  modelId: text("model_id").notNull(),
  modelVersion: text("model_version").notNull(),
  provider: text("provider").notNull(),
  taskClass: text("task_class").notNull(),
  prior: doublePrecision("prior").notNull(),
  posterior: doublePrecision("posterior").notNull(),
  basis: text("basis").notNull(),
  resolverRef: text("resolver_ref").notNull(),
  resolverIsExternal: boolean("resolver_is_external").notNull(),
  resolvedOutcome: boolean("resolved_outcome").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }).notNull(),
  provenanceRef: text("provenance_ref").notNull(),
  scoreability: text("scoreability").notNull(),
  accepted: boolean("accepted").notNull(),
  supersededByAnswerOutcomeId: uuid("superseded_by_answer_outcome_id"),
  properScoreTotal: doublePrecision("proper_score_total"),
  properScoreDecomposition: jsonb("proper_score_decomposition"),
  properScoreRowKey: text("proper_score_row_key"),
  properScoreRegisterVersion: bigint("proper_score_register_version", { mode: "number" }),
  properScoreSourceRef: text("proper_score_source_ref"),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const scorecardCell = scorecard.table("scorecard_cell", {
  scorecardCellId: uuid("scorecard_cell_id").primaryKey(),
  derivationVersion: bigint("derivation_version", { mode: "number" }).notNull(),
  modelId: text("model_id").notNull(),
  modelVersion: text("model_version").notNull(),
  provider: text("provider").notNull(),
  taskClass: text("task_class").notNull(),
  metric: text("metric").notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  value: doublePrecision("value"),
  n: integer("n").notNull(),
  intervalLower: doublePrecision("interval_lower"),
  intervalUpper: doublePrecision("interval_upper"),
  settledCount: integer("settled_count").notNull(),
  unsettledCount: integer("unsettled_count").notNull(),
  permanentlyUnscoreableCount: integer("permanently_unscoreable_count").notNull(),
  abstainedCount: integer("abstained_count").notNull(),
  basis: text("basis").notNull(),
  properScoreDecomposition: jsonb("proper_score_decomposition"),
  derivationInput: jsonb("derivation_input").notNull(),
  derivationHash: text("derivation_hash").notNull(),
  strategyRowKey: text("strategy_row_key").notNull(),
  strategyRegisterVersion: bigint("strategy_register_version", { mode: "number" }).notNull(),
  strategySourceRef: text("strategy_source_ref").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const routingDecision = scorecard.table("routing_decision", {
  routingDecisionId: uuid("routing_decision_id").primaryKey(),
  sessionId: text("session_id").notNull(),
  taskClass: text("task_class").notNull(),
  lane: text("lane").notNull(),
  selectedModelId: text("selected_model_id").notNull(),
  selectedModelVersion: text("selected_model_version"),
  propensity: doublePrecision("propensity").notNull(),
  guardTrail: jsonb("guard_trail").notNull(),
  policyRowKey: text("policy_row_key").notNull(),
  policyRegisterVersion: bigint("policy_register_version", { mode: "number" }).notNull(),
  policySourceRef: text("policy_source_ref").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const sessionAssignment = scorecard.table("session_assignment", {
  sessionAssignmentId: uuid("session_assignment_id").primaryKey(),
  sessionId: text("session_id").notNull(),
  taskClass: text("task_class").notNull(),
  modelId: text("model_id").notNull(),
  modelVersion: text("model_version").notNull(),
  provider: text("provider").notNull(),
  routingDecisionId: uuid("routing_decision_id").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const memoryQuestionKey = memory.table("question_key", {
  questionKeyId: uuid("question_key_id").primaryKey(),
  runId: uuid("run_id").notNull(),
  canonicalQuestionText: text("canonical_question_text").notNull(),
  callerScope: text("caller_scope").notNull(),
  askerScope: text("asker_scope").notNull(),
  settlementAct: text("settlement_act"),
  questionType: text("question_type"),
  declaredField: text("declared_field"),
  normalizedBinding: jsonb("normalized_binding").notNull(),
  frozenTerms: jsonb("frozen_terms").notNull(),
  frozenQuerySetHash: text("frozen_query_set_hash"),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  policyVersion: bigint("policy_version", { mode: "number" }).notNull(),
  keyVersion: integer("key_version").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const memoryLink = memory.table("memory_link", {
  memoryLinkId: uuid("memory_link_id").primaryKey(),
  sourceRunId: uuid("source_run_id").notNull(),
  priorRunId: uuid("prior_run_id").notNull(),
  relation: text("relation").notNull(),
  matchTier: text("match_tier").notNull(),
  agreedFields: jsonb("agreed_fields").notNull(),
  disagreedFields: jsonb("disagreed_fields").notNull(),
  notComparedFields: jsonb("not_compared_fields").notNull(),
  decidedBy: text("decided_by").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
  sourceAsOf: timestamp("source_as_of", { withTimezone: true }).notNull(),
  priorAsOf: timestamp("prior_as_of", { withTimezone: true }).notNull(),
  sourcePolicyVersion: bigint("source_policy_version", { mode: "number" }).notNull(),
  priorPolicyVersion: bigint("prior_policy_version", { mode: "number" }).notNull(),
  sourceKeyVersion: integer("source_key_version").notNull(),
  priorKeyVersion: integer("prior_key_version").notNull(),
  aliasRowIds: jsonb("alias_row_ids").notNull(),
  priorAnswerId: uuid("prior_answer_id").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const memoryLinkEvent = memory.table("memory_link_event", {
  memoryLinkEventId: uuid("memory_link_event_id").primaryKey(),
  memoryLinkId: uuid("memory_link_id").notNull(),
  state: text("state").notNull(),
  actorRef: text("actor_ref").notNull(),
  reason: text("reason").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const memoryAliasRow = memory.table("alias_row", {
  aliasRowId: uuid("alias_row_id").primaryKey(),
  surface: text("surface").notNull(),
  canonical: text("canonical").notNull(),
  confirmedBy: text("confirmed_by").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull(),
  sourceRunId: uuid("source_run_id").notNull(),
  priorRunId: uuid("prior_run_id").notNull(),
  keyVersion: integer("key_version").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const memoryAliasRevocation = memory.table("alias_revocation", {
  aliasRevocationId: uuid("alias_revocation_id").primaryKey(),
  aliasRowId: uuid("alias_row_id").notNull(),
  revokedBy: text("revoked_by").notNull(),
  reason: text("reason").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const memoryPullRecord = memory.table("pull_record", {
  pullRecordId: uuid("pull_record_id").primaryKey(),
  memoryLinkId: uuid("memory_link_id").notNull(),
  artifactKind: text("artifact_kind").notNull(),
  artifactId: text("artifact_id").notNull(),
  artifactVersion: integer("artifact_version").notNull(),
  contentHash: text("content_hash").notNull(),
  artifactAsOf: timestamp("artifact_as_of", { withTimezone: true }).notNull(),
  stalenessStateAtPull: text("staleness_state_at_pull").notNull(),
  askerScope: text("asker_scope").notNull(),
  payloadSnapshot: jsonb("payload_snapshot").notNull(),
  registerRowKey: text("register_row_key").notNull(),
  registerVersion: bigint("register_version", { mode: "number" }).notNull(),
  registerSourceRef: text("register_source_ref").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const memoryCandidateRecord = memory.table("candidate_record", {
  candidateRecordId: uuid("candidate_record_id").primaryKey(),
  sourceRunId: uuid("source_run_id").notNull(),
  priorRunId: uuid("prior_run_id").notNull(),
  matchTier: text("match_tier").notNull(),
  agreementPattern: jsonb("agreement_pattern").notNull(),
  reason: text("reason").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evaluatorDomain = evaluator.table("domain", {
  domainId: uuid("domain_id").primaryKey(),
  canonicalName: text("canonical_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  origin: text("origin").notNull(),
  proposedByProvider: text("proposed_by_provider"),
  proposedByModelId: text("proposed_by_model_id"),
  proposedByModelVersion: text("proposed_by_model_version"),
  proposalRawArtifactRef: uuid("proposal_raw_artifact_ref").references(() => rawArtifact.rawArtifactId),
  sourceRunId: uuid("source_run_id").references(() => run.runId),
  guardrailVersion: bigint("guardrail_version", { mode: "number" }).notNull(),
  provenanceRef: text("provenance_ref").notNull(),
  admittedAt: timestamp("admitted_at", { withTimezone: true }).notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evaluatorDomainAdmission = evaluator.table("domain_admission", {
  domainAdmissionId: uuid("domain_admission_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => run.runId),
  proposedName: text("proposed_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  decision: text("decision").notNull(),
  domainId: uuid("domain_id").references(() => evaluatorDomain.domainId),
  candidateSimilarities: jsonb("candidate_similarities").notNull(),
  guardrailVersion: bigint("guardrail_version", { mode: "number" }).notNull(),
  taggerRawArtifactRef: uuid("tagger_raw_artifact_ref").references(() => rawArtifact.rawArtifactId),
  reason: text("reason").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evaluatorQuestionDomain = evaluator.table("question_domain", {
  questionDomainId: uuid("question_domain_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => run.runId),
  domainId: uuid("domain_id").notNull().references(() => evaluatorDomain.domainId),
  assignmentBasis: text("assignment_basis").notNull(),
  domainAdmissionId: uuid("domain_admission_id").notNull()
    .references(() => evaluatorDomainAdmission.domainAdmissionId),
  taggerRawArtifactRef: uuid("tagger_raw_artifact_ref").references(() => rawArtifact.rawArtifactId),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evaluatorPipelineEvent = evaluator.table("pipeline_event", {
  pipelineEventId: uuid("pipeline_event_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => run.runId),
  pipeline: text("pipeline").notNull(),
  pipelineVersion: bigint("pipeline_version", { mode: "number" }).notNull(),
  attemptId: uuid("attempt_id").notNull(),
  state: text("state").notNull(),
  reason: text("reason").notNull(),
  inputHash: text("input_hash").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evaluatorObservation = evaluator.table("observation", {
  observationId: uuid("observation_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => run.runId),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  modelVersion: text("model_version").notNull(),
  domainId: uuid("domain_id").references(() => evaluatorDomain.domainId),
  step: text("step").notNull(),
  metric: text("metric").notNull(),
  value: doublePrecision("value"),
  outcomeJson: jsonb("outcome_json"),
  truthBasis: text("truth_basis").notNull(),
  sourceKind: text("source_kind").notNull(),
  sourceRef: text("source_ref").notNull(),
  sourceRawArtifactRef: uuid("source_raw_artifact_ref").references(() => rawArtifact.rawArtifactId),
  answerOutcomeId: uuid("answer_outcome_id").references(() => answerOutcome.answerOutcomeId),
  gradedRawArtifactRef: uuid("graded_raw_artifact_ref").references(() => rawArtifact.rawArtifactId),
  graderRawArtifactRef: uuid("grader_raw_artifact_ref").references(() => rawArtifact.rawArtifactId),
  derivationVersion: bigint("derivation_version", { mode: "number" }).notNull(),
  supersedesObservationId: uuid("supersedes_observation_id"),
  provenanceJson: jsonb("provenance_json").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evaluatorProfileCell = evaluator.table("profile_cell", {
  profileCellId: uuid("profile_cell_id").primaryKey(),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  modelVersion: text("model_version").notNull(),
  domainId: uuid("domain_id").references(() => evaluatorDomain.domainId),
  step: text("step").notNull(),
  metric: text("metric").notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  value: doublePrecision("value"),
  n: integer("n").notNull(),
  intervalLower: doublePrecision("interval_lower"),
  intervalUpper: doublePrecision("interval_upper"),
  consensusCount: integer("consensus_count").notNull(),
  settlementCount: integer("settlement_count").notNull(),
  addonCount: integer("addon_count").notNull(),
  basis: text("basis").notNull(),
  derivationVersion: bigint("derivation_version", { mode: "number" }).notNull(),
  derivationInput: jsonb("derivation_input").notNull(),
  derivationHash: text("derivation_hash").notNull(),
  strategyRowKey: text("strategy_row_key").notNull(),
  strategyRegisterVersion: bigint("strategy_register_version", { mode: "number" }).notNull(),
  strategySourceRef: text("strategy_source_ref").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evaluatorRankSnapshot = evaluator.table("rank_snapshot", {
  rankSnapshotId: uuid("rank_snapshot_id").primaryKey(),
  rankKind: text("rank_kind").notNull(),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  modelVersion: text("model_version").notNull(),
  domainId: uuid("domain_id").references(() => evaluatorDomain.domainId),
  step: text("step").notNull(),
  metric: text("metric").notNull(),
  ordinal: integer("ordinal").notNull(),
  score: doublePrecision("score").notNull(),
  n: integer("n").notNull(),
  intervalLower: doublePrecision("interval_lower"),
  intervalUpper: doublePrecision("interval_upper"),
  sourceProfileCellIds: jsonb("source_profile_cell_ids").notNull(),
  sourceHash: text("source_hash").notNull(),
  derivationVersion: bigint("derivation_version", { mode: "number" }).notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evaluatorModelCallUsage = evaluator.table("model_call_usage", {
  modelCallUsageId: uuid("model_call_usage_id").primaryKey(),
  ledgerEntryId: uuid("ledger_entry_id").notNull().references(() => ledgerEntry.ledgerEntryId),
  rawArtifactId: uuid("raw_artifact_id").references(() => rawArtifact.rawArtifactId),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  modelVersion: text("model_version").notNull(),
  callSiteKey: text("call_site_key").notNull(),
  runtimeClass: text("runtime_class").notNull(),
  meteringStatus: text("metering_status").notNull(),
  promptTokens: bigint("prompt_tokens", { mode: "number" }),
  completionTokens: bigint("completion_tokens", { mode: "number" }),
  totalTokens: bigint("total_tokens", { mode: "number" }),
  reportedVendorAmount: doublePrecision("reported_vendor_amount"),
  reportedVendorUnit: text("reported_vendor_unit"),
  rawUsage: jsonb("raw_usage"),
  captureVersion: bigint("capture_version", { mode: "number" }).notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evaluatorRelativeCostCell = evaluator.table("relative_cost_cell", {
  relativeCostCellId: uuid("relative_cost_cell_id").primaryKey(),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  modelVersion: text("model_version").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  relativeCost: doublePrecision("relative_cost"),
  comparability: text("comparability").notNull(),
  meteredCallCount: integer("metered_call_count").notNull(),
  unmeteredCallCount: integer("unmetered_call_count").notNull(),
  sourceUnitTotals: jsonb("source_unit_totals").notNull(),
  normalizationBasis: text("normalization_basis").notNull(),
  derivationVersion: bigint("derivation_version", { mode: "number" }).notNull(),
  derivationInput: jsonb("derivation_input").notNull(),
  derivationHash: text("derivation_hash").notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evaluatorShadowDecision = evaluator.table("shadow_decision", {
  shadowDecisionId: uuid("shadow_decision_id").primaryKey(),
  runId: uuid("run_id").references(() => run.runId),
  kind: text("kind").notNull(),
  inputJson: jsonb("input_json").notNull(),
  inputHash: text("input_hash").notNull(),
  outputJson: jsonb("output_json").notNull(),
  bindingState: text("binding_state").notNull(),
  formulaVersion: bigint("formula_version", { mode: "number" }).notNull(),
  notConsumedReason: text("not_consumed_reason").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evaluatorVllmProbe = evaluator.table("vllm_probe", {
  vllmProbeId: uuid("vllm_probe_id").primaryKey(),
  providerRef: text("provider_ref").notNull(),
  state: text("state").notNull(),
  failureCode: text("failure_code"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evaluatorVllmCatalogModel = evaluator.table("vllm_catalog_model", {
  vllmProbeId: uuid("vllm_probe_id").notNull().references(() => evaluatorVllmProbe.vllmProbeId),
  modelId: text("model_id").notNull(),
  metadataJson: jsonb("metadata_json").notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evaluatorConsumerSelection = evaluator.table("consumer_selection", {
  consumerSelectionId: uuid("consumer_selection_id").primaryKey(),
  vllmProbeId: uuid("vllm_probe_id").notNull(),
  modelId: text("model_id").notNull(),
  selectedBy: text("selected_by").notNull(),
  orderRef: text("order_ref").notNull(),
  supersedesSelectionId: uuid("supersedes_selection_id"),
  selectedAt: timestamp("selected_at", { withTimezone: true }).notNull(),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

export const evaluatorConsumerOutput = evaluator.table("consumer_output", {
  consumerOutputId: uuid("consumer_output_id").primaryKey(),
  consumerSelectionId: uuid("consumer_selection_id").notNull()
    .references(() => evaluatorConsumerSelection.consumerSelectionId),
  targetProvider: text("target_provider").notNull(),
  targetModelId: text("target_model_id").notNull(),
  targetModelVersion: text("target_model_version").notNull(),
  domainId: uuid("domain_id").references(() => evaluatorDomain.domainId),
  promptVersion: bigint("prompt_version", { mode: "number" }).notNull(),
  aggregateSnapshotHash: text("aggregate_snapshot_hash").notNull(),
  aggregateRefs: jsonb("aggregate_refs").notNull(),
  blindedSampleRefs: jsonb("blinded_sample_refs").notNull(),
  summary: text("summary").notNull(),
  adjacentDomainFlags: jsonb("adjacent_domain_flags").notNull(),
  generatedRawArtifactRef: uuid("generated_raw_artifact_ref").notNull()
    .references(() => rawArtifact.rawArtifactId),
  atSeq: bigint("at_seq", { mode: "number" }).notNull()
});

void [scorecard, memory, evaluator];
