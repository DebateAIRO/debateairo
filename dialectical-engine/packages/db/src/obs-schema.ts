import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea"
});

export const obs = pgSchema("obs");

export const obsOccurrence = obs.table("occurrence", {
  occurrenceId: uuid("occurrence_id").primaryKey().defaultRandom(),
  occSeq: bigint("occ_seq", { mode: "bigint" }).notNull()
    .default(sql`nextval('obs.occurrence_seq'::regclass)`).unique(),
  prevLink: bytea("prev_link"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  environment: text("environment").notNull(),
  buildRef: text("build_ref").notNull(),
  buildDirty: boolean("build_dirty").notNull(),
  runtime: text("runtime").notNull(),
  component: jsonb("component").notNull(),
  capturePoint: text("capture_point").notNull(),
  code: text("code").notNull(),
  taxonomyClass: text("taxonomy_class").notNull(),
  severity: text("severity").notNull(),
  conditionMark: text("condition_mark"),
  disposition: text("disposition").notNull(),
  fingerprint: text("fingerprint").notNull(),
  fingerprintVersion: integer("fingerprint_version").notNull(),
  redactionPolicyVersion: text("redaction_policy_version").notNull(),
  allowlistSetId: text("allowlist_set_id").notNull(),
  fallbackMinimized: boolean("fallback_minimized").notNull().default(false),
  captureStatus: text("capture_status").notNull(),
  runRef: text("run_ref").notNull(),
  workItemRef: text("work_item_ref").notNull(),
  nodeRef: text("node_ref").notNull(),
  attemptRef: text("attempt_ref").notNull(),
  ledgerRef: text("ledger_ref").notNull(),
  parentOccurrenceRef: text("parent_occurrence_ref").notNull(),
  causeRelation: text("cause_relation"),
  atSeqWatermark: text("at_seq_watermark").notNull(),
  frames: jsonb("frames").notNull().default([]),
  safeTemplateId: text("safe_template_id").notNull(),
  templateParameters: jsonb("template_parameters").notNull().default({}),
  source: text("source").notNull(),
  sourceEventRef: text("source_event_ref").notNull(),
  zoneContext: boolean("zone_context").notNull().default(false),
  attemptIndex: integer("attempt_index"),
  writerIdentity: text("writer_identity").notNull()
}, (table) => [
  unique("occurrence_source_source_event_ref_key").on(table.source, table.sourceEventRef)
]);

export const obsIncident = obs.table("incident", {
  incidentId: uuid("incident_id").primaryKey().defaultRandom(),
  fingerprint: text("fingerprint").notNull().unique(),
  fingerprintVersion: integer("fingerprint_version").notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  distinctWorkUnitCount: bigint("distinct_work_unit_count", { mode: "bigint" }).notNull().default(0n),
  maxSeverity: text("max_severity").notNull(),
  state: text("state").notNull(),
  sourceSet: jsonb("source_set").notNull().default([]),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  attributedLandingRef: text("attributed_landing_ref"),
  lineageDepth: integer("lineage_depth").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const obsOccurrenceDetail = obs.table("occurrence_detail", {
  occurrenceDetailId: uuid("occurrence_detail_id").primaryKey().defaultRandom(),
  occurrenceId: uuid("occurrence_id").notNull().unique().references(() => obsOccurrence.occurrenceId),
  normalizedFrames: jsonb("normalized_frames").notNull(),
  causeChainCodes: jsonb("cause_chain_codes").notNull(),
  templateParameters: jsonb("template_parameters").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const obsDelivery = obs.table("delivery", {
  deliveryId: uuid("delivery_id").primaryKey().defaultRandom(),
  occurrenceId: uuid("occurrence_id").notNull().references(() => obsOccurrence.occurrenceId),
  consumer: text("consumer").notNull(),
  attemptIndex: integer("attempt_index").notNull(),
  leaseRef: text("lease_ref").notNull(),
  deliveryStatus: text("delivery_status").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
});

export const obsTrace = obs.table("trace", {
  traceId: uuid("trace_id").primaryKey().defaultRandom(),
  occurrenceId: uuid("occurrence_id").notNull().references(() => obsOccurrence.occurrenceId),
  verdict: text("verdict").notNull(),
  evidence: jsonb("evidence").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow()
});

export const obsAgentAction = obs.table("agent_action", {
  agentActionId: uuid("agent_action_id").primaryKey().defaultRandom(),
  prevLink: bytea("prev_link"),
  writerIdentity: text("writer_identity").notNull(),
  actor: text("actor").notNull(),
  actionKind: text("action_kind").notNull(),
  occurrenceId: uuid("occurrence_id").references(() => obsOccurrence.occurrenceId),
  incidentId: uuid("incident_id").references(() => obsIncident.incidentId),
  actionRef: text("action_ref").notNull(),
  actionPayload: jsonb("action_payload").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
});

export const obsPolicyDecision = obs.table("policy_decision", {
  policyDecisionId: uuid("policy_decision_id").primaryKey().defaultRandom(),
  occurrenceId: uuid("occurrence_id").references(() => obsOccurrence.occurrenceId),
  policyRef: text("policy_ref").notNull(),
  inputHash: text("input_hash").notNull(),
  decision: text("decision").notNull(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow()
});

export const obsBudgetUsage = obs.table("budget_usage", {
  budgetUsageId: uuid("budget_usage_id").primaryKey().defaultRandom(),
  component: text("component").notNull(),
  budgetKind: text("budget_kind").notNull(),
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow()
});

export const obsSpoolReceipt = obs.table("spool_receipt", {
  spoolReceiptId: uuid("spool_receipt_id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  spoolRef: text("spool_ref").notNull().unique(),
  occurrenceId: uuid("occurrence_id").references(() => obsOccurrence.occurrenceId),
  reingestedAt: timestamp("reingested_at", { withTimezone: true }).notNull().defaultNow()
});

export const obsCaptureGap = obs.table("capture_gap", {
  captureGapId: uuid("capture_gap_id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  gapClass: text("gap_class").notNull(),
  lostCount: bigint("lost_count", { mode: "bigint" }).notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true })
});

export const obsZoneDaily = obs.table("zone_daily", {
  zoneDailyId: uuid("zone_daily_id").primaryKey().defaultRandom(),
  zoneCode: text("zone_code").notNull(),
  counterDate: date("counter_date").notNull(),
  counterKind: text("counter_kind").notNull(),
  delta: bigint("delta", { mode: "bigint" }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow()
});

export const obsSourceLink = obs.table("source_link", {
  sourceLinkId: uuid("source_link_id").primaryKey().defaultRandom(),
  leftOccurrenceId: uuid("left_occurrence_id").notNull().references(() => obsOccurrence.occurrenceId),
  rightOccurrenceId: uuid("right_occurrence_id").notNull().references(() => obsOccurrence.occurrenceId),
  evidence: jsonb("evidence").notNull(),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check("source_link_check", sql`${table.leftOccurrenceId} <> ${table.rightOccurrenceId}`),
  unique("source_link_left_occurrence_id_right_occurrence_id_key")
    .on(table.leftOccurrenceId, table.rightOccurrenceId)
]);

export const obsConsumerCursor = obs.table("consumer_cursor", {
  consumer: text("consumer").primaryKey(),
  lastOccSeq: bigint("last_occ_seq", { mode: "bigint" }).notNull().default(0n),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const obsComponentHealth = obs.table("component_health", {
  component: text("component").primaryKey(),
  state: text("state").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  detailCode: text("detail_code").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
