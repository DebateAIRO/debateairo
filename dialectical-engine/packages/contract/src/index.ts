import { passwordResetEndpointContracts, passwordResetContractSchemas } from "./password-reset.js";
import { mfaRecoveryEndpointContracts, backupEmailEndpointContracts, mfaRecoveryContractSchemas } from "./mfa-recovery.js";
export * from "./password-reset.js";
export * from "./mfa-recovery.js";
import { socialAuthContractSchemas } from './social-auth.js';
export * from './social-auth.js';
import { staffContractInventory, fundedStaffContractInventory } from "./staff-access.js";
export * from "./staff-access.js";
import { z } from "zod";
import { SessionSchema, LegalDocumentPairSchema } from "./auth-shared.js";
export * from "./auth-shared.js";
import { ConsumerAuthenticationCredentialSchema, consumerAuthContractSchemas } from "./consumer-auth.js";
export * from "./consumer-auth.js";
import { ABSTENTION_KINDS, CONDITION_MARKS, DEBATE_ROLES, LEDGER_ACTION_KINDS, LEDGER_OUTCOMES, MODEL_STRENGTHS, SERVED_ROOT_RULE_HISTORY, TIER_SOURCES } from "@debateai/kernel";
import { PlanTierSchema } from "./plan-tiers.js"; export * from "./plan-tiers.js";
import { MakerLineageSchema, PublicMakerLineageSchema } from "./lineage.js"; export * from "./lineage.js";
import { AnswerStorySchema, PublicStoryShortSchema, StoryLanguageTagSchema } from "./story.js"; export * from "./story.js";
import { AnswerDisclosureSchema, AnswerFloorSchema } from "./disclosure.js"; export * from "./disclosure.js";
export * from "./crisis.js";
export * from "./romania-address.js";

export const RiskTierSchema = z.enum(["casual", "standard", "high-stakes"]);
export const TierSourceSchema = z.enum(TIER_SOURCES);
export const AskTierSourceSchema = z.enum(["ASKER", "MACHINE_DEFAULT"]);
export const CompositionBudgetTierSchema = z.enum(["low", "medium", "high"]);
/**
 * Model-scorecard design, the model-strength control (owner ruling R2): Economy, Balanced or
 * Best, minted in @debateai/kernel. OPTIONAL on the ask, because "absent" must stay
 * distinguishable: the default is the active scorecard's pickerSettings.defaultStrength, or
 * BALANCED when there is none.
 */
export const ModelStrengthSchema = z.enum(MODEL_STRENGTHS);
export const WayOfKnowingSchema = z.enum(["LOOKED_UP", "RAN", "REASONING"]);
export const CheckStatusSchema = z.enum(["PASS", "FAIL", "NOT_SAMPLED"]);
export const StalenessStateSchema = z.enum(["FRESH", "UNDER_REVIEW", "STALE", "ARCHIVED_REVIVED"]);
export const ConditionMarkSchema = z.enum(CONDITION_MARKS);
export const AbstentionKindSchema = z.enum(ABSTENTION_KINDS);
export type ConditionMark = z.infer<typeof ConditionMarkSchema>;
export type AbstentionKind = z.infer<typeof AbstentionKindSchema>;
export type StalenessState = z.infer<typeof StalenessStateSchema>;

export const EVENT_CONSUMERS = Object.freeze({
  "run.accepted": Object.freeze(["W6", "W16"]),
  "run.planning": Object.freeze(["W6"]),
  "run.running": Object.freeze(["W6"]),
  "run.terminal": Object.freeze(["W6", "W20"]),
  "node.spawned": Object.freeze(["W6", "W8", "W10"]),
  "node.generating": Object.freeze(["W6", "W8"]),
  "node.being_judged": Object.freeze(["W6", "W8"]),
  "node.scored": Object.freeze(["W6", "W8", "W10"]),
  "node.text_delta": Object.freeze(["W6", "W20"]),
  "node.complete": Object.freeze(["W6", "W8"]),
  "node.failed": Object.freeze(["W6", "W8"]),
  "node.retrying": Object.freeze(["W6", "W8"]),
  "graph.edge_added": Object.freeze(["W6", "W10"]),
  "graph.cycle_refused": Object.freeze(["W6", "W10"]),
  "serve.bundle_frozen": Object.freeze(["W6", "W20"]),
  "serve.composition_started": Object.freeze(["W6", "W20"]),
  "serve.composition_delta": Object.freeze(["W6", "W20"]),
  "serve.conformance_verdict": Object.freeze(["W6", "W20"]),
  "serve.recompose_or_defect": Object.freeze(["W6", "W20"]),
  "honesty.abstention_typed": Object.freeze(["W6", "W9"]),
  "honesty.budget_skip_marked": Object.freeze(["W6", "W12", "W21"]),
  "honesty.fallback_labeled": Object.freeze(["W6", "W12"]),
  "honesty.investigation_gap_opened": Object.freeze(["W6", "W14"]),
  "honesty.memory_link_decided": Object.freeze(["W6", "W15"]),
  "honesty.staleness_trigger_fired": Object.freeze(["W6", "W11"]),
  "honesty.under_explored_marked": Object.freeze(["W6", "W11"]),
  "ledger.attempt": Object.freeze(["W6", "W18"]),
  "ledger.failure": Object.freeze(["W6", "W18"]),
  "ledger.could_not_do": Object.freeze(["W6", "W18"])
} as const);
export const EVENT_TYPES = Object.freeze(Object.keys(EVENT_CONSUMERS) as Array<keyof typeof EVENT_CONSUMERS>);
export const EventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventTypeSchema>;

export const InvestigationGapSchema = z.object({
  gap_ref: z.string().trim().min(1),
  gap: z.string().trim().min(1),
  verdict: ConditionMarkSchema,
  why: z.string().trim().min(1),
  effort_grade: z.string().trim().min(1),
  constructed_prompt: z.string().trim().min(1),
  accepts_user_input: z.boolean(),
  model_authored: z.literal(true)
}).strict();
export type InvestigationGap = z.infer<typeof InvestigationGapSchema>;

export const InvestigationRequestSchema = z.object({
  user_input: z.string().min(1).nullable(),
  human_steer_input: z.literal(true)
}).strict();
export const InvestigationAcceptedSchema = z.object({
  request_ref: z.string().min(1),
  status: z.literal("RECORDED"),
  replay_handle: z.string().min(1)
}).strict();
export type InvestigationRequest = z.infer<typeof InvestigationRequestSchema>;
export type InvestigationAccepted = z.infer<typeof InvestigationAcceptedSchema>;

export const ExecutionLedgerDigestSchema = z.object({
  answer_id: z.string().min(1),
  run_ref: z.string().min(1),
  work_items: z.array(z.object({
    node_ref: z.string().min(1),
    status: z.enum(["READY", "PENDING", "ERROR"]),
    reason: z.string().nullable()
  }).strict()),
  entries: z.array(z.object({
    entry_ref: z.string().min(1),
    action_kind: z.enum(LEDGER_ACTION_KINDS),
    subject_ref: z.string().min(1),
    outcome: z.enum(LEDGER_OUTCOMES),
    actor_ref: z.string().min(1),
    started_at: z.iso.datetime(),
    finished_at: z.iso.datetime()
  }).strict())
}).strict();
export type ExecutionLedgerDigest = z.infer<typeof ExecutionLedgerDigestSchema>;

export const HONESTY_EVENT_CONSUMERS = Object.freeze({
  "honesty.staleness_trigger_fired": Object.freeze(["W6", "W11"])
} as const);

export const NODE_LIFECYCLE_EVENT_CONSUMERS = Object.freeze({
  "node.spawned": Object.freeze(["W6", "W8", "W10"]),
  "node.generating": Object.freeze(["W6", "W8"]),
  "node.being_judged": Object.freeze(["W6", "W8"]),
  "node.scored": Object.freeze(["W6", "W8", "W10"])
} as const);

// S1-1 / DR-157 / DR-159: the expansion-depth bound is declared HERE and only
// here. Every other surface — the ask schema below, the runner's
// RUN_DEPTH_PARAMS_INVALID guard — imports these constants instead of restating
// the range, so moving the bound is a one-line change with no second literal.
export const EXPANSION_DEPTH_MIN = 1;
export const EXPANSION_DEPTH_MAX = 5;

export const ExpansionDepthSchema = z.number().int().min(EXPANSION_DEPTH_MIN).max(EXPANSION_DEPTH_MAX);
export type ExpansionDepth = z.infer<typeof ExpansionDepthSchema>;

/**
 * The largest question an ask may carry, in UTF-8 bytes: the API refuses a
 * larger one, and the boot check (B9, budget spec §2.10) prices the first
 * position's own call at it. A function, not an exported number: numbers live
 * in register rows or inside functions.
 */
export function askQuestionMaxBytes(): number {
  return 8_192;
}

/**
 * The ruled domain, DERIVED from the bound above. Selectors and option lists
 * import this instead of enumerating the values by hand, so widening the bound
 * widens every chooser without touching a consumer.
 */
export const EXPANSION_DEPTH_VALUES: readonly number[] = Object.freeze(
  Array.from(
    { length: EXPANSION_DEPTH_MAX - EXPANSION_DEPTH_MIN + 1 },
    (_unused, index) => EXPANSION_DEPTH_MIN + index
  )
);

/** Closed at the contract door: exactly one key, an integer inside the range. */
export const DepthParamsSchema = z.object({ depth: ExpansionDepthSchema }).strict();
export type DepthParams = z.infer<typeof DepthParamsSchema>;

export const AskRequestSchema = z.object({
  question_line: z.string().trim().min(1),
  risk_tier: RiskTierSchema,
  tier_source: AskTierSourceSchema,
  tier_provenance_ref: z.string().trim().min(1),
  composition_budget_tier: CompositionBudgetTierSchema,
  depth_params: DepthParamsSchema,
  decision_scope: z.string().trim().min(1),
  as_of: z.iso.datetime(),
  steering_presets: z.array(z.string().trim().min(1)),
  plan_tier: PlanTierSchema,
  model_strength: ModelStrengthSchema.optional(),
  steering_annotations: z.array(z.string().min(1))
}).strict();
export type AskRequest = z.infer<typeof AskRequestSchema>;

/**
 * Budget spec 2026-09-28 §2.2 / paid-plans spec §2.4.1 — the limit a question
 * waits for or is close to: the site's day, or one of the person's windows.
 * The same four words as `SpendScope` in @debateai/budget (the contract cannot
 * import it); tests/unit/b6a-waiting-projection.test.ts reads both.
 */
export const SpendScopeSchema = z.enum(["SITE_DAY", "PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH", "PERSON_GRANT"]);

/**
 * Final review Part 1b, Important 1 — WHY A QUESTION WAITS when no reset is
 * what it waits for: OWN_DEBATES, every limit that is full is one of the
 * person's windows, full only because of their own running debates. The
 * question starts by itself as soon as one of them finishes, so its expected
 * start is the waker's next tick and the UI says so instead of naming a reset
 * or offering an upgrade. Never the site's day (budget spec §2.7). The same
 * word as `WaitsFor` in @debateai/budget (the contract cannot import it);
 * tests/unit/b6a-waiting-projection.test.ts reads both.
 */
export const WaitsForSchema = z.enum(["OWN_DEBATES"]);
const PERSON_SCOPES: ReadonlySet<string> = new Set(["PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH", "PERSON_GRANT"]);

/**
 * Paid plans (spec 2026-09-29 §2.3.4): the gauges the SERVER decided for an
 * ask from the person's plan, present only when billing decided them (hosted,
 * billing on): the plan's tier, and the risk tier, composition and depth the
 * run is asked with (for Free, its sealed fixed gauges, which is why a Free
 * person's controls stay disabled in the UI). It reports the PLAN's tier, not
 * the roster that runs: when the interim coarse fit moves a paid question that
 * STARTs to the Free roster (spec §2.6 item 7, A5), `plan_tier` still says
 * "premium" while the Free roster's models argue. That move is recorded for the
 * owner only (`core.run_cost_substitution`); whether a paying person is told is
 * an owner decision (final review Part 1b, Owner item 4).
 */
export const AskAppliedSchema = z.object({
  plan_tier: PlanTierSchema,
  risk_tier: RiskTierSchema,
  composition_budget_tier: CompositionBudgetTierSchema,
  depth: ExpansionDepthSchema
}).strict();
export type AskApplied = z.infer<typeof AskAppliedSchema>;

export const AskAcceptedSchema = z.object({
  run_ref: z.string().min(1),
  status: z.enum(["QUEUED", "WAITING"]),
  // Budget spec §2.7 and AMENDMENTS-R1 A16: a question that waits in line says
  // when it is expected to start and which limit it waits for. Present iff WAITING.
  waits_until: z.iso.datetime().optional(),
  waiting_scope: SpendScopeSchema.optional(),
  // Final review Part 1b, Important 1: only on a WAITING answer whose person's
  // own running debates are all that fill their windows (a person scope).
  waits_for: WaitsForSchema.optional(),
  applied: AskAppliedSchema.optional(),
  // Model-scorecard design, cost estimate before a run: the strength the picker applied, and
  // whether the per-run money ceiling stepped it down. Optional, so an accepted ask without
  // them reads exactly as before (QUEUED or WAITING alike; paid plans S1a).
  model_strength_applied: ModelStrengthSchema.optional(),
  model_strength_stepped_down: z.boolean().optional()
}).strict().superRefine((accepted, context) => {
  const waiting = accepted.status === "WAITING";
  if (waiting !== (accepted.waits_until !== undefined) || waiting !== (accepted.waiting_scope !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "WAITING requires waits_until and waiting_scope, and QUEUED forbids both"
    });
  }
  if (accepted.waits_for !== undefined && (!waiting || !PERSON_SCOPES.has(accepted.waiting_scope ?? ""))) {
    context.addIssue({ code: "custom", message: "waits_for names a WAITING answer's person scope only" });
  }
});
export type AskAccepted = z.infer<typeof AskAcceptedSchema>;

/**
 * Budget spec §2.7 — the 422 body of ASK_ALREADY_WAITING: the waiting run and its
 * expected start, and nothing else (no figure, no limit, no count). `waits_for`
 * (final review Part 1b, Important 1) when that start waits on the person's own
 * running debates rather than a reset.
 */
export const AskAlreadyWaitingSchema = z.object({
  error: z.literal("ASK_ALREADY_WAITING"),
  message: z.literal("ASK_ALREADY_WAITING"),
  run_ref: z.string().min(1),
  waits_until: z.iso.datetime(),
  waits_for: WaitsForSchema.optional()
}).strict();
export type AskAlreadyWaiting = z.infer<typeof AskAlreadyWaitingSchema>;

/** Paid-plans spec §1.2: the four plans, as billingPlans names them (`PlanId` in @debateai/register). */
export const PlanIdSchema = z.enum(["FREE", "PLUS", "PRO", "MAX"]);
export const FundingBasisSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("SUBSCRIPTION"), planId: PlanIdSchema, entitlementEventId: z.uuid() }).strict(),
  z.object({ kind: z.literal("INTERNAL"), grantId: z.uuid(), grantEventId: z.uuid() }).strict()
]) satisfies z.ZodType<import("@debateai/kernel").FundingBasis>;

/** Budget spec §2.7: GET /v1/asks/room — the ask's settings class, as query parameters. */
export const AskRoomQuerySchema = z.object({
  plan_tier: PlanTierSchema,
  composition_budget_tier: CompositionBudgetTierSchema,
  depth: z.string().regex(/^[0-9]{1,2}$/u).transform(Number).pipe(ExpansionDepthSchema)
}).strict();

/**
 * Budget spec §2.7 / AMENDMENTS-R1 A16 — THE ROOM READ: a word, the limit it is
 * about, when that limit resets or the waiting question starts, the person's own
 * waiting run, and their plan. Never a figure (I6: figures are a capacity oracle).
 */
const CustomerAskRoomResponseSchema = z.object({
  room: z.enum(["FITS", "CLOSE", "FULL", "ALREADY_WAITING"]),
  scope: z.enum(["SITE_DAY", "PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH"]).nullable(),
  resets_at: z.iso.datetime().nullable(),
  waiting_run_ref: z.string().min(1).nullable(),
  plan_id: PlanIdSchema.nullable(),
  // Final review Part 1b, Important 1: a question that would wait (or the one
  // waiting) waits only for the person's own running debates; `resets_at` is
  // then the waker's next tick, not a reset.
  waits_for: WaitsForSchema.optional()
}).strict().superRefine((answer, context) => {
  if (answer.waits_for !== undefined
    && (!(answer.room === "FULL" || answer.room === "ALREADY_WAITING") || !PERSON_SCOPES.has(answer.scope ?? ""))) {
    context.addIssue({ code: "custom", message: "waits_for names a person scope of a question that would wait" });
  }
  const fits = answer.room === "FITS";
  if (fits !== (answer.scope === null) || (fits && answer.resets_at !== null)) {
    context.addIssue({ code: "custom", message: "FITS names no scope and no reset; every other room names its scope" });
  }
  if ((answer.room === "ALREADY_WAITING") !== (answer.waiting_run_ref !== null)) {
    context.addIssue({ code: "custom", message: "only ALREADY_WAITING names the waiting run" });
  }
  if ((answer.room === "FULL" || answer.room === "ALREADY_WAITING") && answer.resets_at === null) {
    context.addIssue({ code: "custom", message: "a question that would wait says when it would start" });
  }
});
const InternalFundingUsageSchema = z.object({kind:z.literal("INTERNAL"),expires_at:z.iso.datetime()}).strict();
const InternalAskRoomResponseSchema = z.object({
  room:z.enum(["FITS","CLOSE","FULL","ALREADY_WAITING"]),scope:z.enum(["SITE_DAY","PERSON_DAY","PERSON_WEEK","PERSON_GRANT"]).nullable(),
  resets_at:z.iso.datetime().nullable(),waiting_run_ref:z.string().min(1).nullable(),plan_id:z.null(),funding:InternalFundingUsageSchema,waits_for:WaitsForSchema.optional()
}).strict().superRefine((answer,context)=>{
  if ((answer.room==="FITS") !== (answer.scope===null) || (answer.room==="FITS" && answer.resets_at!==null)
    || ((answer.room==="ALREADY_WAITING") !== (answer.waiting_run_ref!==null))
    || ((answer.room==="FULL" || answer.room==="ALREADY_WAITING") && answer.resets_at===null)
    || (answer.waits_for!==undefined && (!(answer.room==="FULL" || answer.room==="ALREADY_WAITING") || !PERSON_SCOPES.has(answer.scope??""))))
    context.addIssue({code:"custom",message:"Internal room state is inconsistent"});
});
export const AskRoomResponseSchema = z.union([CustomerAskRoomResponseSchema,InternalAskRoomResponseSchema]);
export type AskRoomResponse = z.infer<typeof AskRoomResponseSchema>;

/** Paid-plans spec §1.2 (U1): GET /v1/billing/usage — whole percentages per window, never an amount. */
const CustomerBillingUsageResponseSchema = z.object({
  plan_id: PlanIdSchema,
  windows: z.array(z.object({
    scope: z.enum(["PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH"]),
    percent: z.number().int().min(0).max(110),
    resets_at: z.iso.datetime()
  }).strict()).max(3)
}).strict();
const InternalBillingUsageResponseSchema = z.object({
 plan_id:z.null(),funding:InternalFundingUsageSchema,windows:z.array(z.object({scope:z.enum(["PERSON_DAY","PERSON_WEEK","PERSON_GRANT"]),percent:z.number().int().min(0).max(100),resets_at:z.iso.datetime()}).strict()).min(1).max(3)
}).strict();
export const BillingUsageResponseSchema = z.union([CustomerBillingUsageResponseSchema,InternalBillingUsageResponseSchema]);
export type BillingUsageResponse = z.infer<typeof BillingUsageResponseSchema>;

/** Paid-plans spec §2.5.3: money crosses the wire as a decimal string with exactly two places, "20.00". */
export const BillingDecimalMoneySchema = z.string().regex(/^(?:0|[1-9]\d{0,8})\.\d{2}$/);

/** GET /v1/billing/plans (public). Credit is never shown in dollars: "4" reads "4× the Plus allowance". */
export const BillingPlansResponseSchema = z.object({
  currency: z.literal("USD"),
  plans: z.array(z.object({
    plan_id: PlanIdSchema,
    net_price: BillingDecimalMoneySchema,
    allowance_vs_plus: z.string().regex(/^\d+(?:\.\d+)?$/)
  }).strict()).min(1)
}).strict();
export type BillingPlansResponse = z.infer<typeof BillingPlansResponseSchema>;

const BillingIso2Schema = z.string().regex(/^[A-Z]{2}$/);

/** POST /v1/billing/quote (paid-plans spec §2.5.3; P19's pre-fill makes `country` optional; R-15 adds `name`). */
export const BillingQuoteRequestSchema = z.object({
  plan_id: PlanIdSchema.exclude(["FREE"]),
  /** Absent: the country of the caller's address is used, and answered back as `country`. */
  country: BillingIso2Schema.optional(),
  /** The buyer's own name; a Romanian invoice needs it (or the company's). */
  name: z.string().trim().min(1).max(256).optional(),
  /** The county (RO) or state (US/CA). */
  region: z.string().trim().min(1).max(64).optional(),
  postal_code: z.string().trim().min(1).max(16).optional(),
  city: z.string().trim().min(1).max(128).optional(),
  company: z.object({
    name: z.string().trim().min(1).max(256),
    vat_id: z.string().trim().min(2).max(32),
    address: z.string().trim().min(1).max(512)
  }).strict().optional()
}).strict();
export type BillingQuoteRequest = z.infer<typeof BillingQuoteRequestSchema>;

/** The page builds "VAT 21% (Romania)" itself (spec §2.5.3) from tax_name, the rate and the country. */
export const BillingQuoteResponseSchema = z.object({
  quote_ref: z.uuid(),
  plan_id: PlanIdSchema.exclude(["FREE"]),
  net: BillingDecimalMoneySchema,
  tax: BillingDecimalMoneySchema,
  total: BillingDecimalMoneySchema,
  tax_name: z.string().min(1).max(64),
  /** Basis points; a US rate may be fractional (8.875 % = 887.5). */
  tax_rate_bp: z.number().min(0).max(10_000),
  tax_country: BillingIso2Schema,
  tax_region: z.string().max(64).nullable(),
  tax_status: z.enum(["TAXABLE", "NON_TAXABLE", "NOT_REGISTERED", "REVERSE_CHARGE"]),
  /** The country the quote was made for: the one sent, or the connection's. */
  country: BillingIso2Schema,
  /** The connection's country; sentence G3 names it when `country_confirm_needed`. */
  ip_country: z.string().regex(/^[A-Z]{2}$/),
  country_confirm_needed: z.boolean(),
  /** R-15: the invoice issuer needs the buyer's name, city and county before the checkout can start. */
  address_required: z.boolean(),
  renews_on: z.iso.datetime(),
  /** Null where no withdrawal right applies (outside `withdrawalCountries`). */
  withdrawal_days: z.number().int().positive().nullable(),
  expires_at: z.iso.datetime()
}).strict();
export type BillingQuoteResponse = z.infer<typeof BillingQuoteResponseSchema>;

const BillingDocumentPairSchema = z.object({
  version: z.string().min(1).max(64),
  sha256: z.string().regex(/^[0-9a-f]{64}$/)
}).strict();

export const BillingCheckoutRequestSchema = z.object({
  quote_ref: z.uuid(),
  /** The interface locale the consents were shown in; it is also the locale of every billing email. */
  locale: z.string().regex(/^[a-z]{2}$/),
  consents: z.object({ renewal_terms: BillingDocumentPairSchema, immediate_start: BillingDocumentPairSchema }).strict(),
  country_confirmed: z.literal(true).optional()
}).strict();
export type BillingCheckoutRequest = z.infer<typeof BillingCheckoutRequestSchema>;

export const BillingCheckoutResponseSchema = z.object({
  public_key: z.string().min(1).max(256),
  order_payload: z.string().min(1).max(16_384),
  order_checksum: z.string().min(1).max(512),
  charge_ref: z.string().regex(/^[0-9a-f]{32}$/),
  sdk_environment: z.enum(["stage", "live"])
}).strict();
export type BillingCheckoutResponse = z.infer<typeof BillingCheckoutResponseSchema>;

/**
 * The 409 body the checkout answers while a payment for the person's open checkout is already on its way (a stored
 * notice, an open check or an xMoney transaction for that charge): the page waits on `charge_ref` instead of
 * mounting a second card form (D7 #5).
 */
export const BillingCheckoutPendingErrorSchema = z.object({
  error: z.literal("CHECKOUT_PENDING"),
  message: z.literal("CHECKOUT_PENDING"),
  charge_ref: z.string().regex(/^[0-9a-f]{32}$/)
}).strict();
/** What `startBillingCheckout` resolves to for that 409, beside the signed order. */
export type BillingCheckoutPendingResponse = Readonly<{ state: "PENDING"; charge_ref: string }>;

/** NEEDS_ACTION: the bank declined and the person can try again; FAILED: refused or voided, final. */
export const BillingChargeStatusResponseSchema = z.object({
  state: z.enum(["PENDING", "SUCCEEDED", "FAILED", "NEEDS_ACTION"]),
  reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/).nullable()
}).strict();
export type BillingChargeStatusResponse = z.infer<typeof BillingChargeStatusResponseSchema>;

/**
 * The paid subset of B7a's `PlanIdSchema`: a subscription is never on Free (0085 CHECKs plan_id IN PLUS/PRO/MAX).
 * tests/unit/billing-subscription-view.test.ts pins every member to `PlanIdSchema`.
 */
export const SubscribedPlanIdSchema = z.enum(["PLUS", "PRO", "MAX"]);

export const BillingSubscriptionResponseSchema = z.object({
  subscription: z.object({
    plan_id: SubscribedPlanIdSchema,
    status: z.enum(["CREATED", "ACTIVE", "PAST_DUE", "SUSPENDED", "ENDED", "WITHDRAWN"]),
    cancel_requested: z.boolean(),
    current_period_end: z.iso.datetime().nullable(),
    renews_on: z.iso.datetime().nullable(),
    renewal_total: BillingDecimalMoneySchema.nullable(),
    scheduled_downgrade_plan_id: SubscribedPlanIdSchema.nullable(),
    withdrawal_open_until: z.iso.datetime().nullable(),
    /** The window's last day in the consumer's own calendar (the UI's "withdraw until {date}"); null with no window. */
    withdrawal_last_day: z.iso.date().nullable(),
    can_upgrade: z.boolean(),
    can_change_card: z.boolean(),
    /** C-15: Settings offers "Undo cancellation" only when the revoke route would accept it. */
    can_revoke_cancel: z.boolean()
  }).strict().nullable()
}).strict();
export type BillingSubscriptionResponse = z.infer<typeof BillingSubscriptionResponseSchema>;

/** A downgrade target is a paid plan below Max; Free is reached by cancelling. */
export const BillingDowngradeRequestSchema = z.object({ plan_id: z.enum(["PLUS", "PRO"]) }).strict();

export const BillingInvoicesResponseSchema = z.object({
  invoices: z.array(z.object({
    number: z.string().min(1).max(64),
    issued_on: z.iso.date(),
    total: BillingDecimalMoneySchema,
    kind: z.enum(["INVOICE", "CREDIT_NOTE"]),
    url: z.url().nullable()
  }).strict())
}).strict();
export type BillingInvoicesResponse = z.infer<typeof BillingInvoicesResponseSchema>;

/** P12c: an upgrade goes to a dearer paid plan; Plus is never an upgrade target. */
export const BillingUpgradeQuoteRequestSchema = z.object({ plan_id: z.enum(["PRO", "MAX"]) }).strict();
/**
 * P12c (A7): the prorated difference with its tax, and the new plan's full recurring total the next renewal charges.
 * `tax_rate_basis_points` is not required to be whole: a US combined rate such as 8.875 % is 887.5 basis points
 * (0085's `numeric(8,2)`).
 */
export const BillingUpgradeQuoteResponseSchema = z.object({
  quote_ref: z.uuid(),
  plan_id: z.enum(["PRO", "MAX"]),
  net: BillingDecimalMoneySchema,
  tax: BillingDecimalMoneySchema,
  total: BillingDecimalMoneySchema,
  tax_name: z.string().min(1).max(64),
  tax_rate_basis_points: z.number().nonnegative().max(10_000),
  tax_country: z.string().regex(/^[A-Z]{2}$/u),
  recurring_total: BillingDecimalMoneySchema,
  renews_on: z.iso.datetime(),
  expires_at: z.iso.datetime()
}).strict();
export type BillingUpgradeQuoteResponse = z.infer<typeof BillingUpgradeQuoteResponseSchema>;
export const BillingUpgradeRequestSchema = z.object({ plan_id: z.enum(["PRO", "MAX"]), quote_ref: z.uuid() }).strict();
/** P12c: the upgrade charge's state; the plan changes only once VERIFY_PAYMENT confirms the payment. */
export const BillingUpgradeResponseSchema = z.object({
  charge_ref: z.string().regex(/^[0-9a-f]{32}$/u),
  state: z.enum(["PENDING", "SUCCEEDED", "FAILED"]),
  reason_code: z.enum(["PAYMENT_DECLINED", "VOIDED", "REBILL_REFUSED", "NO_TRANSACTION"]).nullable()
}).strict();
export type BillingUpgradeResponse = z.infer<typeof BillingUpgradeResponseSchema>;
/** P12d: the step-up grant for WITHDRAW_SUBSCRIPTION (the same 43-character token every step-up grant is). */
export const BillingWithdrawRequestSchema = z.object({ step_up_grant: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) }).strict();
/**
 * `refund`: what goes back to the card. Null when a refund made in the xMoney dashboard already touched a payment:
 * the plan has ended, and the owner settles what is still due and writes (P14c; M8 follows).
 */
export const BillingWithdrawResponseSchema = z.object({ refund: BillingDecimalMoneySchema.nullable() }).strict();
export type BillingWithdrawResponse = z.infer<typeof BillingWithdrawResponseSchema>;
/**
 * P12e (A12): the card form's signed order, as checkout's, plus the hold the server signed — the amount the page
 * names before "Save card" ("1.00" today, "0.00" if X0 shows `auth` takes a zero amount).
 */
export const BillingCardChangeResponseSchema = BillingCheckoutResponseSchema.extend({
  hold_amount: BillingDecimalMoneySchema
}).strict();
export type BillingCardChangeResponse = z.infer<typeof BillingCardChangeResponseSchema>;
/** Any string shaped like an address; whether it belongs to anyone is never answered. */
export const BillingCancelLinkRequestSchema = z.object({ email: z.string().min(3).max(320) }).strict();
export const BillingCancelLinkAcceptedSchema = z.object({ status: z.literal("ACCEPTED") }).strict();
export const BillingCancelByTokenRequestSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) }).strict();

/**
 * The language a run's question was argued in (spec 2026-09-26 §14.3): dev's
 * `core.run.argument_language_tag` (a BCP-47 tag, "und" when detection was not
 * confident) and `argument_language_name`, the English name the debate's model
 * calls are told to write in. The UI reads the tag to show the verdict story's
 * fixed text in the question's language and to offer switching the site to it.
 */
export const ArgumentLanguageSchema = z.object({
  tag: StoryLanguageTagSchema,
  name: z.string().trim().min(1).max(80)
}).strict();
export type ArgumentLanguage = z.infer<typeof ArgumentLanguageSchema>;

export const RunProjectionSchema = z.object({
  run_ref: z.string().min(1),
  question_line: z.string().trim().min(1),
  state: z.enum(["QUEUED", "WAITING", "CLAIMED", "RUNNING", "HOLDING", "SETTLED", "FAILED"]),
  terminal_reason: z.string().trim().min(1).nullable(),
  hold_until: z.iso.datetime().nullable(),
  // R2 (spec 2026-09-26 §14.3): null on a database without dev's migration
  // 0072; optional, so a reader built before the field still parses.
  argument_language: ArgumentLanguageSchema.nullable().optional(),
  // Budget spec §2.7: when a WAITING run is expected to start (recomputed on
  // every read). Optional, so a reader built before the field still parses.
  waits_until: z.iso.datetime().nullable().optional(),
  // Final review Part 1b, Important 1: a WAITING run that waits only for its
  // person's own running debates (`waits_until` is then the next tick).
  waits_for: WaitsForSchema.nullable().optional()
}).strict().superRefine((run, context) => {
  if (run.waits_for !== undefined && run.waits_for !== null && run.state !== "WAITING") {
    context.addIssue({ code: "custom", message: "only a WAITING run waits for anything" });
  }
  if ((run.state === "FAILED") !== (run.terminal_reason !== null)) {
    context.addIssue({
      code: "custom",
      message: "FAILED requires a terminal reason and non-failed runs forbid one"
    });
  }
  if ((run.state === "HOLDING") !== (run.hold_until !== null)) {
    context.addIssue({ code: "custom", message: "HOLDING requires hold_until and other states forbid it" });
  }
  if ((run.state === "WAITING") !== (run.waits_until !== undefined && run.waits_until !== null)) {
    context.addIssue({ code: "custom", message: "WAITING requires waits_until and other states forbid it" });
  }
});
export type RunProjection = z.infer<typeof RunProjectionSchema>;

export const SessionSummarySchema = z.object({
  session_id: z.uuid(),
  created_at: z.iso.datetime(),
  last_seen_at: z.iso.datetime(),
  idle_expires_at: z.iso.datetime(),
  absolute_expires_at: z.iso.datetime(),
  last_mfa_at: z.iso.datetime(),
  current: z.boolean()
}).strict();
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const SessionListSchema = z.object({
  sessions: z.array(SessionSummarySchema)
}).strict();
export type SessionList = z.infer<typeof SessionListSchema>;

export const RevokeAllSessionsSchema = z.object({ revoked: z.number().int().nonnegative() }).strict();

/**
 * Age gate (design document Turn 8 · 8d/8j/8k). The date of birth crosses the wire
 * only to be checked; it is never stored. `refused` sets the 30-day lockout cookie.
 */
export const AGE_REFUSAL_COOKIE_NAME = "__Host-debateai-age-refusal" as const;
export const AGE_REFUSAL_COOKIE_VALUE = "refused" as const;
export const AGE_REFUSAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const DateOfBirthSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const AgeCheckRequestSchema = z.object({ date_of_birth: DateOfBirthSchema }).strict();
export const AgeCheckResultSchema = z.object({ outcome: z.enum(["allowed", "refused"]) }).strict();
export type AgeCheckResult = z.infer<typeof AgeCheckResultSchema>;
export const AgeConfirmationStatusSchema = z.object({ status: z.enum(["required", "confirmed"]) }).strict();
export type AgeConfirmationStatus = z.infer<typeof AgeConfirmationStatusSchema>;
/** What sign-up sends for the two documents it displayed, and the locale it displayed them in. */
export const RegisterLegalDocumentsSchema = z.object({
  terms: LegalDocumentPairSchema,
  privacy: LegalDocumentPairSchema,
  locale: z.string().regex(/^[a-z]{2}$/u)
}).strict();
export type RegisterLegalDocuments = z.infer<typeof RegisterLegalDocumentsSchema>;

/** Paid plans L4. Only the Terms and the Privacy Policy are ever re-accepted. */
export const LegalReacceptableKindSchema = z.enum(["TERMS", "PRIVACY"]);
export const LegalStatusDocumentSchema = LegalDocumentPairSchema.extend({ kind: LegalReacceptableKindSchema }).strict();
export const LegalStatusResponseSchema = z.object({
  must_accept: z.array(LegalStatusDocumentSchema).max(2)
}).strict();
export type LegalStatusResponse = z.infer<typeof LegalStatusResponseSchema>;
export const LegalAcceptRequestSchema = z.object({
  documents: z.array(LegalStatusDocumentSchema).min(1).max(2)
    .refine((documents) => new Set(documents.map((document) => document.kind)).size === documents.length),
  locale: z.string().regex(/^[a-z]{2}$/u)
}).strict();
export type LegalAcceptRequest = z.infer<typeof LegalAcceptRequestSchema>;
/** Paid plans G3a: booleans only — never the country the server saw. `support`: the support assistant is open here. */
export const GeoAvailabilityResponseSchema = z.object({ signup: z.boolean(), pay: z.boolean(), support: z.boolean() }).strict();
export type GeoAvailabilityResponse = z.infer<typeof GeoAvailabilityResponseSchema>;

/**
 * Sensitive-data consent (V's ruling of 2026-09-29). Before the first debate an account
 * agrees, once, to the processing of sensitive information (politics, religion, health,
 * sexuality) in its own questions. Without it `POST /v1/asks` answers 403 with
 * `SENSITIVE_DATA_CONSENT_REQUIRED`. The version names the wording agreed to.
 */
export const SENSITIVE_DATA_NOTICE_VERSION = "2026-09-29" as const;
export const SENSITIVE_DATA_CONSENT_REQUIRED = "SENSITIVE_DATA_CONSENT_REQUIRED" as const;
export const SensitiveDataConsentRequestSchema = z.object({
  notice_version: z.literal(SENSITIVE_DATA_NOTICE_VERSION),
  locale: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/)
}).strict();
export const SensitiveDataConsentStatusSchema = z.object({ status: z.enum(["required", "given"]) }).strict();
export type SensitiveDataConsentStatus = z.infer<typeof SensitiveDataConsentStatusSchema>;
export const VisibilityGrantActionSchema = z.enum(["PUBLISH", "UNPUBLISH"]);
export const RunTargetedGrantActionSchema = z.enum([
  "PUBLISH", "UNPUBLISH", "DELETE_PRIVATE_DEBATE"
]);
export const StepUpAuthorizationRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: RunTargetedGrantActionSchema,
    target_run_id: z.uuid()
  }).strict(),
  z.object({ action: z.literal("DELETE_ACCOUNT") }).strict(),
  z.object({ action: z.literal("REMOVE_AUTH_METHOD"), target_factor_id: z.uuid() }).strict(),
  z.object({ action: z.enum(["LINK_PROVIDER", "UNLINK_PROVIDER"]), target_provider: z.enum(["google", "apple", "facebook", "x"]) }).strict(),
  z.object({ action: z.literal("CHANGE_EMAIL") }).strict(),
  z.object({ action: z.enum(["READ_PHONE_PROFILE", "CHANGE_PHONE_PROFILE", "CHANGE_RECOVERY_EMAIL", "ADD_PASSKEY", "ADD_TOTP", "REGENERATE_RECOVERY_CODES"]) }).strict(),
  z.object({ action: z.literal("WITHDRAW_SUBSCRIPTION") }).strict()
]);
const StepUpGrantResponseSchema = z.discriminatedUnion("action", [
  z.object({ token:z.string().regex(/^[A-Za-z0-9_-]{43}$/), action:z.literal("REMOVE_AUTH_METHOD"), target_factor_id:z.uuid(), expires_at:z.iso.datetime() }).strict(),
  z.object({ token:z.string().regex(/^[A-Za-z0-9_-]{43}$/), action:z.enum(["LINK_PROVIDER","UNLINK_PROVIDER"]), target_provider:z.enum(["google","apple","facebook","x"]), expires_at:z.iso.datetime() }).strict(),
  z.object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    action: RunTargetedGrantActionSchema,
    target_run_id: z.uuid(),
    expires_at: z.iso.datetime()
  }).strict(),
  z.object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    action: z.literal("DELETE_ACCOUNT"),
    expires_at: z.iso.datetime()
  }).strict(),
  z.object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    action: z.enum(["CHANGE_EMAIL", "READ_PHONE_PROFILE", "CHANGE_PHONE_PROFILE", "CHANGE_RECOVERY_EMAIL", "ADD_PASSKEY", "ADD_TOTP", "REGENERATE_RECOVERY_CODES"]),
    expires_at: z.iso.datetime()
  }).strict(),
  z.object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    action: z.literal("WITHDRAW_SUBSCRIPTION"),
    expires_at: z.iso.datetime()
  }).strict()
]);
export const StepUpResponseSchema = z.object({
  replacement_recovery_code:z.string().min(1).max(1024).optional(),
  status: z.literal("step_up_complete"),
  csrf_token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  step_up_grant: StepUpGrantResponseSchema.optional()
}).strict();

export type StepUpAuthorizationRequest = z.infer<typeof StepUpAuthorizationRequestSchema>;
export type StepUpResponse = z.infer<typeof StepUpResponseSchema>;
export const BeginSocialStepUpRequestSchema = z.object({authorization:StepUpAuthorizationRequestSchema,next:z.enum(['/','/new','/settings','/settings/security','/account']).optional()}).strict();
export const SocialStepUpStatusRequestSchema = z.object({continuation_token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
export const SocialStepUpStatusResponseSchema = z.object({authorization:StepUpAuthorizationRequestSchema,expires_at:z.iso.datetime(),available_methods:z.array(z.enum(['passkey','totp','recovery_code']))}).strict();
export const CompleteSocialStepUpRequestSchema = z.union([SocialStepUpStatusRequestSchema.extend({code:z.string().min(1).max(1024)}).strict(),SocialStepUpStatusRequestSchema.extend({challenge_handle:z.string().regex(/^[A-Za-z0-9_-]{43}$/),credential:ConsumerAuthenticationCredentialSchema}).strict()]);
export type SocialStepUpStatusResponse = z.infer<typeof SocialStepUpStatusResponseSchema>;
export type CompleteSocialStepUpRequest = z.infer<typeof CompleteSocialStepUpRequestSchema>;
export const BeginPasskeyStepUpRequestSchema = z.object({ authorization:StepUpAuthorizationRequestSchema }).strict();
export const CompletePasskeyStepUpRequestSchema = z.object({ challenge_handle:z.string().regex(/^[A-Za-z0-9_-]{43}$/),credential:ConsumerAuthenticationCredentialSchema }).strict();
export const AuthMethodsResponseSchema = z.object({ methods:z.array(z.object({ factor_id:z.uuid(),type:z.enum(["passkey","totp"]),label:z.string().nullable(),created_at:z.iso.datetime(),last_used_at:z.iso.datetime().nullable(),removable:z.boolean() }).strict()),recovery_codes_remaining:z.number().int().min(0).max(10),available_step_up_methods:z.array(z.enum(["passkey","password_totp","provider"])).max(3),step_up_providers:z.array(z.enum(["google","apple","facebook","x"])).max(4) }).strict();
export type AuthMethodsResponse = z.infer<typeof AuthMethodsResponseSchema>;
export const RemoveAuthMethodRequestSchema = z.object({factor_id:z.uuid(),step_up_grant:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
export const RegenerateRecoveryCodesRequestSchema = z.object({step_up_grant:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
export const RecoveryCodesResponseSchema = z.object({codes:z.array(z.string()).length(10)}).strict();
export const consumerSecurityContractSchemas=Object.freeze({StepUpAuthorizationRequestSchema,StepUpResponseSchema,BeginPasskeyStepUpRequestSchema,CompletePasskeyStepUpRequestSchema,AuthMethodsResponseSchema,RemoveAuthMethodRequestSchema,RegenerateRecoveryCodesRequestSchema,RecoveryCodesResponseSchema});

export const PUBLICATION_PART_KINDS = ["QUESTION", "SUMMARY", "ARGUMENTS", "REVIEWS", "STORY"] as const;
export const PublicationPartKindSchema = z.enum(PUBLICATION_PART_KINDS);
export type PublicationPartKind = z.infer<typeof PublicationPartKindSchema>;
export const PublicationRefusalGroundSchema = z.enum(["TERMS", "TERMS_AND_POSSIBLY_ILLEGAL"]);
export const PublicationRefusalStatementSchema = z.object({
  outcome: z.enum(["BLOCK", "UNSURE"]),
  parts: z.array(PublicationPartKindSchema).min(1),
  ground: PublicationRefusalGroundSchema,
  automated: z.literal(true),
  visibility: z.literal("PRIVATE")
}).strict().superRefine((statement, context) => {
  if (!statement.parts.every((part, index, parts) => index === 0
    || PUBLICATION_PART_KINDS.indexOf(parts[index - 1]!) < PUBLICATION_PART_KINDS.indexOf(part))) {
    context.addIssue({ code: "custom", path: ["parts"], message: "Parts must be unique and in publication order" });
  }
  if (statement.outcome === "UNSURE" && statement.ground !== "TERMS") {
    context.addIssue({ code: "custom", path: ["ground"], message: "An uncertain refusal must use the Terms ground" });
  }
});
export type PublicationRefusalStatement = z.infer<typeof PublicationRefusalStatementSchema>;
export const PUBLICATION_CONTENT_REFUSED_MESSAGE = "The content check refused to publish this debate. It stays private.";
export const PublicationContentRefusalSchema = z.object({
  error: z.literal("PUBLICATION_CONTENT_REFUSED"),
  message: z.literal(PUBLICATION_CONTENT_REFUSED_MESSAGE),
  statement: PublicationRefusalStatementSchema
}).strict();

export const PublishDebateRequestSchema = z.object({
  step_up_grant: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  warning_acknowledged: z.literal(true)
}).strict();

export const UnpublishDebateRequestSchema = z.object({
  step_up_grant: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  copies_may_persist_acknowledged: z.literal(true)
}).strict();

const StepUpGrantTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const AccountErasureScheduleRequestSchema = z.object({
  confirmation: z.literal("DELETE MY ACCOUNT"),
  step_up_grant: StepUpGrantTokenSchema
}).strict();
export const AccountErasureStatusSchema = z.discriminatedUnion("status", [
  z.object({ status:z.literal("NONE") }).strict(),
  z.object({
    status:z.enum(["SCHEDULED","DUE","PROCESSING"]),
    execute_at:z.iso.datetime(),
    cancellation_ref:z.uuid()
  }).strict()
]);
export const AccountErasureCancelRequestSchema = z.object({
  cancellation_ref:z.uuid()
}).strict();
export const AccountErasureCancelledSchema = z.object({
  status:z.literal("CANCELLED")
}).strict();
// Turn 14 — change email. The request needs a CHANGE_EMAIL step-up grant; the
// two link routes carry only the bearer mailed to the new (confirm) or the
// current (cancel) address.
const EmailAddressSchema = z.string().min(3).max(254);
export const AccountEmailSchema = z.object({
  email: EmailAddressSchema,
  recovery_email: EmailAddressSchema.nullable(),
  pending: z.object({
    new_email: EmailAddressSchema,
    expires_at: z.iso.datetime()
  }).strict().nullable()
}).strict();
export type AccountEmail = z.infer<typeof AccountEmailSchema>;
export const EmailChangeRequestSchema = z.object({
  new_email: EmailAddressSchema,
  step_up_grant: StepUpGrantTokenSchema
}).strict();
export const EmailChangePendingSchema = z.object({
  status: z.literal("PENDING"),
  new_email: EmailAddressSchema,
  expires_at: z.iso.datetime()
}).strict();
export type EmailChangePending = z.infer<typeof EmailChangePendingSchema>;
export const EmailChangeLinkRequestSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
}).strict();
export const EmailChangeConfirmedSchema = z.object({ status: z.literal("CONFIRMED") }).strict();
export const EmailChangeCancelledSchema = z.object({ status: z.literal("CANCELLED") }).strict();

export const AccountPhoneProfileSchema=z.object({phone_present:z.boolean(),phone_masked:z.string().nullable(),phone_verified:z.literal(false),updated_at:z.iso.datetime().nullable()}).strict();
export type AccountPhoneProfile=z.infer<typeof AccountPhoneProfileSchema>;
export const PhoneProfileRevealRequestSchema=z.object({step_up_grant:StepUpGrantTokenSchema}).strict();
export const PhoneProfileRevealSchema=z.object({phone:z.string().nullable(),phone_verified:z.literal(false)}).strict();
export type PhoneProfileReveal=z.infer<typeof PhoneProfileRevealSchema>;
export const PhoneProfileUpdateRequestSchema=z.object({phone:z.string().min(1).max(128),step_up_grant:StepUpGrantTokenSchema}).strict();
export const RecoveryEmailSettingsSchema=z.object({state:z.enum(["absent","pending","verified"]),email:EmailAddressSchema.nullable(),pending:z.object({email:EmailAddressSchema,expires_at:z.iso.datetime()}).strict().nullable()}).strict();
export type RecoveryEmailSettings=z.infer<typeof RecoveryEmailSettingsSchema>;
export const RecoveryEmailRequestSchema=z.object({email:EmailAddressSchema,step_up_grant:StepUpGrantTokenSchema}).strict();
export const RecoveryEmailRemoveRequestSchema=z.object({step_up_grant:StepUpGrantTokenSchema}).strict();

export const accountProfileContractSchemas = {
  AccountPhoneProfileSchema, PhoneProfileRevealRequestSchema, PhoneProfileRevealSchema, PhoneProfileUpdateRequestSchema,
  RecoveryEmailSettingsSchema, RecoveryEmailRequestSchema, RecoveryEmailRemoveRequestSchema,
  EmailChangeLinkRequestSchema, EmailChangeConfirmedSchema
} as const;

export const PrivateDebateErasureRequestSchema = z.object({
  step_up_grant:StepUpGrantTokenSchema
}).strict();
export const PrivateDebateErasureStatusSchema = z.object({
  status:z.enum(["CLEANED","PENDING"])
}).strict();
export const LegacyRunClaimRequestSchema = z.object({
  legacy_token:z.string().min(1).max(1024)
}).strict();
export const LegacyRunClaimResultSchema = z.object({
  status:z.enum(["CLAIMED","NO_MATCH"]),
  claimed_count:z.number().int().nonnegative()
}).strict();

export const PublicationTransitionSchema = z.object({
  state: z.enum(["PRIVATE", "PUBLISHED"]),
  public_ref: z.uuid().nullable()
}).strict();

export const PublicDebateSummarySchema = z.object({
  public_ref: z.uuid(),
  author_pseudonym: z.string().trim().min(1),
  question: z.string().trim().min(1),
  published_at: z.iso.datetime(),
  models: z.array(z.string().trim().min(1)).optional(),
  verdict: z.enum(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]).nullable(),
  confidence_band: z.string().trim().min(1).nullable(),
  // Engine money rule, Task M6 (spec §14.4.4): a components-only snapshot's
  // floor label (`PublicDebate.floor.verdict_state`), so the public library row
  // shows the label the page shows instead of "verdict unavailable". Absent
  // for every other snapshot; the floor's position and cause never ride here.
  floor_verdict: z.enum(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]).optional()
}).strict();
export type PublicDebateSummary = z.infer<typeof PublicDebateSummarySchema>;

export const PublicDebateListSchema = z.object({
  items: z.array(PublicDebateSummarySchema),
  total: z.number().int().nonnegative()
}).strict();
export type PublicDebateList = z.infer<typeof PublicDebateListSchema>;

export const DeploymentSchema = z.object({
  register: z.object({
    register_version: z.number().int().positive(),
    rows: z.array(z.object({
      row_key: z.string().trim().min(1),
      value: z.unknown(),
      source_ref: z.string().trim().min(1)
    }).strict())
  }).strict(),
  scorecards: z.array(z.object({
    model_id: z.string().trim().min(1),
    model_version: z.string().trim().min(1),
    provider: z.string().trim().min(1),
    task_class: z.string().trim().min(1),
    metric: z.string().trim().min(1),
    value: z.number().finite().nullable(),
    basis: z.enum(["MEASURED_OUTCOME", "MEASURED_PROCESS", "EXTERNAL_BENCHMARK", "NONE"]),
    derivation_hash: z.string().regex(/^[a-f0-9]{64}$/i),
    source_ref: z.string().trim().min(1),
    as_of: z.iso.datetime()
  }).strict()),
  model_ledger: z.array(z.object({
    task_class: z.string().trim().min(1),
    model_id: z.string().trim().min(1),
    model_version: z.string().trim().min(1),
    provider: z.string().trim().min(1),
    routing_decision_ref: z.string().trim().min(1)
  }).strict()),
  fleet: z.discriminatedUnion("state", [
    z.object({ state: z.literal("UNAVAILABLE"), reason: z.literal("NO_TYPED_FLEET_SOURCE") }).strict(),
    z.object({ state: z.literal("AVAILABLE"), workers: z.array(z.object({
      worker_ref: z.string().trim().min(1), status: z.enum(["ONLINE", "OFFLINE"]), source_ref: z.string().trim().min(1)
    }).strict()) }).strict()
  ])
}).strict();
export type Deployment = z.infer<typeof DeploymentSchema>;

export const LabeledNumberSchema = z.object({
  value: z.number().finite(),
  kind: z.string().min(1),
  source: z.string().min(1),
  producer: z.string().min(1),
  provenance_ref: z.string().min(1),
  replay_handle: z.string().min(1)
}).strict();

// S5-2 (goal 119-128): the WITHHELD slot existed solely to carry the repealed
// second operator's conjunct-withholding reason. With `accumulate` pinned as THE
// operator nothing can produce it, so the slot is repealed together with its
// branch rather than left as an unreachable status a later writer could revive.
export const NumberSlotSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("PRESENT"), number: LabeledNumberSchema }).strict(),
  z.object({ status: z.literal("EVICTED"), mark: z.literal("MISSING-NUMBER") }).strict()
]);

export const ComposedSegmentSchema = z.object({
  segment_id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  load_bearing: z.boolean(),
  served_number_refs: z.array(z.string().trim().min(1))
}).strict();

export const BandCeilingSchema = z.object({
  label: z.string().trim().min(1),
  basis: z.object({
    LOOKED_UP: z.number().int().nonnegative(),
    RAN: z.number().int().nonnegative(),
    REASONING: z.number().int().nonnegative()
  }).strict(),
  register_row_key: z.string().trim().min(1),
  register_version: z.number().int().positive(),
  source_ref: z.string().trim().min(1),
  lift_path: z.string().trim().min(1)
}).strict();

export const ShadowSuppressionSchema = z.object({
  gate: z.enum(["EVIDENCE_GATE", "VALUE_OVERLAY"]),
  subject_ref: z.string().trim().min(1),
  would_have_suppressed: z.unknown(),
  unlock_condition: z.string().trim().min(1)
}).strict();

export const ValueHingeProjectionSchema = z.object({
  value_hinge_ref: z.string().min(1),
  left_option_ref: z.string().min(1),
  right_option_ref: z.string().min(1),
  criterion_refs: z.array(z.string().min(1)),
  weight_source: z.enum(["owner_elicited", "org_policy", "none"]),
  weight_owner: z.string().nullable(),
  rejected_criteria: z.array(z.string().min(1))
}).strict();

export const AbstentionSchema = z.object({
  kind: AbstentionKindSchema,
  question_class: z.string().trim().min(1),
  risk_tier: RiskTierSchema,
  price: z.number().finite().gt(0).lt(1),
  register_row_key: z.string().trim().min(1),
  register_version: z.number().int().positive(),
  register_source_ref: z.string().trim().min(1),
  unlock_condition: z.string().trim().min(1),
  ledger_unknown_ref: z.string().trim().min(1)
}).strict();

export const AnswerSummarySchema = z.object({
  answer_id: z.string().min(1),
  run_ref: z.string().min(1),
  answer_version: z.number().int().positive(),
  question_line: z.string().min(1),
  verdict_state: z.enum(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]).nullable(),
  abstention: AbstentionSchema.nullable(),
  serve_state: z.enum(["COMPOSED", "RECOMPOSED_ONCE", "COMPONENTS_ONLY"]),
  staleness_state: StalenessStateSchema,
  builds_on_previous: z.boolean(),
  created_at_sequence: z.number().int().positive(),
  // DL3-F2: the library row states the model lineage that made it, exactly as
  // PublicDebateSummarySchema.models does for a published debate. The index
  // query already reads every answer projection it summarises, so this costs
  // nothing there and removes the home page's per-row full answer read.
  // Optional, never invented: a row with no recorded maker lineage says so by
  // omission rather than by an empty claim about what ran.
  models: z.array(z.string().trim().min(1)).optional()
}).strict();
export const OpenRunSummarySchema = z.object({
  run_ref: z.string().min(1),
  question_line: z.string().trim().min(1),
  state: z.enum(["QUEUED", "WAITING", "CLAIMED", "RUNNING", "HOLDING", "SETTLED", "FAILED"]),
  terminal_reason: z.string().trim().min(1).nullable(),
  created_at_sequence: z.number().int().positive()
}).strict().superRefine((run, context) => {
  if ((run.state === "FAILED") !== (run.terminal_reason !== null)) {
    context.addIssue({
      code: "custom",
      message: "FAILED requires a terminal reason and non-failed runs forbid one"
    });
  }
});
export const AnswerIndexSchema = z.object({
  items: z.array(AnswerSummarySchema),
  open_runs: z.array(OpenRunSummarySchema),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
}).strict();
export type AnswerIndex = z.infer<typeof AnswerIndexSchema>;

export const NodeReviewSchema = z.object({
  outcome: z.enum(["agree", "dispute", "cannot-assess"]),
  reasons: z.array(z.string().trim().min(1)).min(1),
  provenance_ref: z.string().min(1),
  reviewer_lineage: MakerLineageSchema
}).strict();
export type NodeReview = z.infer<typeof NodeReviewSchema>;

export const NodeSchema = z.object({
  node_id: z.string().min(1),
  claim: z.string().min(1),
  way_of_knowing: WayOfKnowingSchema,
  base_score: LabeledNumberSchema,
  final_strength: LabeledNumberSchema.nullable(),
  provenance_ref: z.string().min(1),
  maker_lineage: MakerLineageSchema.nullable(),
  review: NodeReviewSchema.nullable(),
  locator: z.string().nullable(),
  stranger_restatement: z.object({ check_status: CheckStatusSchema }).strict(),
  defeater_refs: z.array(z.string().min(1)),
  defeater_exhaustion_marked: z.boolean(),
  disagreement: z.record(z.string(), z.unknown()).nullable(),
  condition_marks: z.array(ConditionMarkSchema),
  abstention: AbstentionSchema.nullable(),
  staleness_state: StalenessStateSchema,
  relevant_as_of: z.iso.datetime()
}).strict();
export type Node = z.infer<typeof NodeSchema>;

export const PublicNodeReviewSchema = NodeReviewSchema.extend({
  reviewer_lineage: PublicMakerLineageSchema
});
export type PublicNodeReview = z.infer<typeof PublicNodeReviewSchema>;

export const PublicNodeSchema = NodeSchema.omit({ disagreement: true }).extend({
  disagreement: z.null(),
  maker_lineage: PublicMakerLineageSchema.nullable(),
  review: PublicNodeReviewSchema.nullable()
});
export type PublicNode = z.infer<typeof PublicNodeSchema>;

export const EdgeSchema = z.object({
  edge_id: z.string().min(1),
  from_node_ref: z.string().min(1),
  target_kind: z.enum(["NODE", "EDGE"]),
  target_ref: z.string().min(1),
  relation: z.enum(["support", "attack", "defeat", "shared-crux"]),
  strength: z.discriminatedUnion("status", [
    z.object({ status: z.literal("PRESENT"), number: LabeledNumberSchema }).strict(),
    z.object({ status: z.literal("UNKNOWN"), reason: z.literal("NO_JUDGEMENT_OR_MAGNITUDE") }).strict()
  ]),
  provenance_ref: z.string().min(1),
  placeholder: z.boolean()
}).strict();
export type Edge = z.infer<typeof EdgeSchema>;

/**
 * T6 / S4-2 / J14 (+ ADDENDUM) — the typed condition-mark record, extracted so
 * the contract layer's own rules can be probed directly rather than only
 * through a whole `Answer`.
 *
 * DR-139(4): each record names its subject (an OWED-CHECK-UNEXECUTED record
 * names the battery row whose owed check has no recorded execution at
 * terminal).
 */
export const ConditionMarkRecordSchema = z.object({
  mark: ConditionMarkSchema,
  scope: z.enum(["answer", "node"]),
  subject_ref: z.string().min(1),
  reason: z.string().min(1),
  lift_path: z.string().nullable(),
  // T10 / codex r1 B3 / J17: the READ vocabulary is the rule HISTORY, not the
  // live rule alone. Answers sealed before migration 0055 carry the retired
  // DR-161 value and 0055 preserves those rows rather than relabelling them, so
  // a contract accepting only the live rule turned every pre-0055 multi-maker
  // answer into a schema failure on both answer routes. Widening breaks no
  // consumer: nothing switches or compares on this field.
  served_root_rule: z.enum(SERVED_ROOT_RULE_HISTORY).nullable(),
  call_site_key: z.string().min(1).nullable().default(null),
  planned_leg_count: z.number().int().nonnegative().nullable().default(null),
  terminal_transport_outcome: z.enum(["TIMED_OUT", "FAILED"]).nullable().default(null),
  // T6 / S4-2 / J14: the second route into class H/D. A review that came back
  // `cannot-assess` reached its reviewer, so it has no transport outcome; the
  // reason it leaves the node unjudged is the outcome itself.
  review_outcome: z.enum(["cannot-assess"]).nullable().default(null),
  hidden_strength: z.number().min(0).max(1).nullable().default(null),
  hidden_score_threshold: z.number().min(0).max(1).nullable().default(null),
  hidden_score_threshold_source_ref: z.string().min(1).nullable().default(null),
  excluded_from_served_number: z.boolean().nullable().default(null),
  judged_basis_count: z.number().int().positive().nullable().default(null),
  affected_node_ids: z.array(z.string().min(1)).default([])
}).strict().superRefine((record, context) => {
  // T6/J14: EXACTLY ONE reason. A transport outcome (the review never landed)
  // or a review outcome (it landed and could not judge) — never both, never
  // neither. Stated as an XOR so the transport route keeps the requirement it
  // has always had instead of the second route weakening it into optional.
  const namesOneUnjudgedReason = (record.terminal_transport_outcome === null)
    !== (record.review_outcome === null);
  if (record.mark === "HIDDEN-UNJUDGEABLE" && (
    record.call_site_key === null || !namesOneUnjudgedReason
    || record.excluded_from_served_number !== true || record.affected_node_ids.length === 0
  )) context.addIssue({ code: "custom", message: "Class H requires a call site, exactly one unjudged reason, and affected hidden nodes" });
  if (record.mark === "HIDDEN-LOW-SCORE" && (
    record.hidden_strength === null || record.hidden_score_threshold === null
    || record.hidden_score_threshold_source_ref === null
    || record.excluded_from_served_number !== false || record.affected_node_ids.length === 0
  )) context.addIssue({ code: "custom", message: "Class L requires threshold provenance, presentation-only status, and affected hidden nodes" });
  if (record.mark === "DERIVED-STANDING-UNREVIEWED" && (
    record.call_site_key === null || !namesOneUnjudgedReason
    || record.excluded_from_served_number !== false
    || record.judged_basis_count === null || record.affected_node_ids.length === 0
  )) context.addIssue({ code: "custom", message: "Class D requires unjudged-review provenance and a positive judged basis" });
  if (record.mark === "UNAUTHORED-BRANCH-HALTED" && (
    record.call_site_key === null || record.planned_leg_count === null
    || record.terminal_transport_outcome === null || record.affected_node_ids.length === 0
  )) context.addIssue({ code: "custom", message: "Class N requires halted-call provenance and a surviving parent" });
});

export const PublicDebateSchema = z.object({
  public_ref: z.uuid(),
  author_pseudonym: z.string().trim().min(1),
  question: z.string().trim().min(1),
  published_at: z.iso.datetime(),
  answer: z.object({
    terminal: z.enum(["SERVED", "DOWNGRADED", "COMPONENTS_ONLY"]),
    verdict: z.enum(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]).nullable(),
    verdict_available: z.boolean(),
    confidence_band: z.string().trim().min(1).nullable(),
    summary_segments: z.array(z.object({ text: z.string().min(1) }).strict()),
    badges: z.array(z.string()),
    residual_objections: z.array(z.string()),
    reversal_point: z.string().min(1),
    as_of: z.iso.datetime(),
    nodes: z.array(PublicNodeSchema).optional(),
    edges: z.array(EdgeSchema).optional(),
    tree_included: z.boolean().optional()
  }).strict(),
  // Verdict story (spec 2026-09-26 §10): copied at publish time when the story
  // is READY or READY_WITH_RESERVATION. Optional, so every snapshot published
  // before it still parses.
  story_short: PublicStoryShortSchema.optional(),
  // The question's language tag (spec §14.3), copied at publish time from the
  // run: the public page shows the short story's fixed text in it. Not private
  // (low-entropy operational metadata dev keeps even after erasure); optional,
  // so every snapshot published before it still parses.
  language: StoryLanguageTagSchema.optional(),
  // Engine money rule, Task M5 (spec §14.4.4): the floor of a components-only
  // answer, copied at publish time from the owner's record: the label the
  // engine derived and the published position it rests on, whose own
  // statement the public page shows. No reason code, no model: optional, so
  // every snapshot published before it still parses.
  floor: AnswerFloorSchema.optional()
}).strict();
export type PublicDebate = z.infer<typeof PublicDebateSchema>;

/**
 * A21 — WHICH MODELS WERE CHOSEN FOR EACH DEBATE JOB, projected from the run's
 * pinned role assignment (core.run_role_assignment); absent when the run pinned
 * none (no scorecard was in force) OR its pin could not be read (A21.1 fix
 * round 1: omitted whole and reported to the operator as
 * ANSWER_MODEL_ASSIGNMENT_INVALID), so an absent field never proves which of
 * the two happened. Owner decisions O1/O3: the honesty drawer
 * shows visitors only the model names per job and never the step-down; this
 * full detail is for the JSON export and audit. Engine identifiers only —
 * makers, model ids, thinking levels — never a provider route, a candidate id,
 * a price or a prompt.
 */
const AnswerModelSeatSchema = z.object({
  maker: z.string().min(1),
  model_id: z.string().min(1),
  thinking_level: z.string().min(1)
}).strict();

export const AnswerModelAssignmentSchema = z.object({
  strength: ModelStrengthSchema,
  stepped_down: z.boolean(),
  scorecard_version: z.number().int().positive().nullable(),
  roles: z.array(z.object({
    role: z.enum(DEBATE_ROLES),
    seats: z.array(z.object({
      seat_index: z.number().int().nonnegative(),
      source: z.enum(["SCORECARD", "FALLBACK"]),
      main: AnswerModelSeatSchema,
      runner_up: AnswerModelSeatSchema.nullable(),
      runner_up_share: z.number().min(0).max(1)
    }).strict())
  }).strict())
}).strict();
export type AnswerModelAssignment = z.infer<typeof AnswerModelAssignmentSchema>;

export const AnswerSchema = z.object({
  answer_id: z.string().min(1),
  answer_version: z.number().int().positive(),
  run_ref: z.string().min(1),
  question_line: z.string().min(1),
  terminal: z.enum(["SERVED", "DOWNGRADED", "BLOCKED", "COMPONENTS_ONLY"]),
  verdict_state: z.enum(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]).nullable(),
  verdict_unavailable: z.object({ reason_ref: z.string().trim().min(1) }).strict().nullable(),
  confidence_band: z.string().min(1).nullable(),
  band_ceiling: BandCeilingSchema.nullable(),
  answer_form: z.unknown().nullable(),
  serve_state: z.enum(["COMPOSED", "RECOMPOSED_ONCE", "COMPONENTS_ONLY"]),
  composed_text: z.array(ComposedSegmentSchema),
  number_slots: z.array(NumberSlotSchema),
  abstention: AbstentionSchema.nullable(),
  shadow_suppressions: z.array(ShadowSuppressionSchema),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  badges: z.array(z.string()),
  residual_objections: z.array(z.string()),
  value_hinges: z.array(ValueHingeProjectionSchema),
  condition_marks: z.array(ConditionMarkSchema),
  // DR-139(4): typed loud condition-mark records on the served answer —
  // each names its subject (an OWED-CHECK-UNEXECUTED record names the battery
  // row whose owed check has no recorded execution at terminal).
  condition_mark_records: z.array(ConditionMarkRecordSchema),
  reversal_point: z.string().min(1),
  builds_on_previous: z.object({
    value: z.boolean(),
    answer_ref: z.string().min(1).nullable()
  }).strict(),
  memory_disclosure: z.object({
    matched: z.boolean(),
    memory_link_id: z.string().nullable(),
    tier: z.enum(["EXACT_QUESTION", "SAME_BINDING", "PARTIAL_BINDING", "TERM_OVERLAP"]).nullable(),
    relation: z.enum(["REPEATS", "REFINES", "CONTRADICTS_PRIOR", "RELATED_ONLY"]).nullable(),
    decided_by: z.string().nullable(),
    prior: z.object({
      run_id: z.string(), answer_id: z.string(), answer_version: z.number().int().positive(),
      question_line: z.string(), answered_at: z.iso.datetime(), verdict: z.string().nullable(),
      confidence_band: z.string().nullable(), staleness_state: z.string()
    }).strict().nullable(),
    agreed_fields: z.array(z.string()),
    disagreed_fields: z.array(z.string()),
    not_compared_fields: z.array(z.string()),
    pulls: z.array(z.object({
      artifactId: z.string(), version: z.number().int().positive(), contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
      asOf: z.iso.datetime(), stalenessStateAtPull: z.string(), askerScope: z.string(), registerRowKey: z.string(),
      registerVersion: z.number().int().positive(), registerSourceRef: z.string()
    }).strict()),
    candidates_not_linked: z.array(z.object({
      prior_run_id: z.string(), tier: z.enum(["EXACT_QUESTION", "SAME_BINDING", "PARTIAL_BINDING", "TERM_OVERLAP"])
    }).strict()),
    unlink: z.object({ available: z.boolean(), memory_link_id: z.string().nullable() }).strict()
  }).strict().nullable(),
  risk_tier: RiskTierSchema,
  tier_source: TierSourceSchema,
  tier_provenance_ref: z.string().trim().min(1),
  cost_envelope: z.object({
    basis: z.record(z.string(), z.unknown()),
    state: z.enum(["WITHIN", "ENRICHMENT_SKIPPED", "EXHAUSTED"]),
    consumed_model_attempts: z.number().int().nonnegative(),
    protected_core: z.literal("NEVER_SKIPPABLE")
  }).strict(),
  composition_budget_tier: CompositionBudgetTierSchema,
  conformance_outcome: z.string().min(1),
  ledger_digest_handle: z.string().min(1),
  inspection_handle: z.string().min(1),
  as_of: z.iso.datetime(),
  staleness_state: StalenessStateSchema,
  relevant_as_of: z.iso.datetime(),
  // A21: optional, so every stored and fixture answer without it still parses.
  model_assignment: AnswerModelAssignmentSchema.optional()
}).strict().superRefine((answer, context) => {
  if ((answer.confidence_band === null) !== (answer.band_ceiling === null)) {
    context.addIssue({ code: "custom", message: "confidence_band and band_ceiling must be present together" });
  }
  if ((answer.verdict_state === null) === (answer.verdict_unavailable === null)) {
    context.addIssue({ code: "custom", message: "exactly one verdict projection must be present" });
  }
  if (answer.verdict_unavailable !== null && answer.confidence_band !== null) {
    context.addIssue({ code: "custom", message: "an unavailable verdict cannot carry a confidence band" });
  }
});
export type Answer = z.infer<typeof AnswerSchema>;

export const InspectionSchema = z.object({
  answer_id: z.string().min(1),
  answer_version: z.number().int().positive(),
  conformance: z.object({
    outcome: z.enum(["PASS", "FAIL", "NOT_RUN"]),
    coverage_mode: z.enum(["EXHAUSTIVE", "SAMPLED", "NOT_RUN"]),
    segment_results: z.array(z.object({
      segment_id: z.string().min(1),
      state: z.enum(["JUDGED", "SAMPLED_PASSED", "NOT_SAMPLED"]),
      conforms: z.boolean()
    }).strict())
  }).strict(),
  segment_suppressions: z.array(z.object({
    segment_id: z.string().min(1),
    evicted_number_ref: z.string().min(1)
  }).strict()),
  shadow_suppressions: z.array(ShadowSuppressionSchema)
}).strict();
export type Inspection = z.infer<typeof InspectionSchema>;

export const RunEventSchema = z.object({
  event_id: z.string().min(1),
  event_type: EventTypeSchema,
  run_ref: z.string().min(1),
  subject_ref: z.string().min(1).nullable().optional(),
  at_sequence: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown())
}).strict().superRefine((event, context) => {
  if (event.event_type === "honesty.investigation_gap_opened") {
    const parsed = InvestigationGapSchema.safeParse(event.payload);
    if (!parsed.success) context.addIssue({ code: "custom", message: "Investigation gap payload violates its closed projection" });
  }
});
export type RunEvent = z.infer<typeof RunEventSchema>;

export const contractInventory = Object.freeze({
  routes: Object.freeze([
    ...Object.keys(passwordResetEndpointContracts),
    ...Object.keys(mfaRecoveryEndpointContracts),
    ...Object.keys(backupEmailEndpointContracts),
    ...staffContractInventory.routes,
    ...fundedStaffContractInventory.routes,
    // Current social account surfaces are governed and documented like every other route.
    "GET /v1/auth/providers",
    "POST /v1/auth/social/{provider}/begin",
    "GET /v1/auth/social/{provider}/callback",
    "POST /v1/auth/social/apple/callback",
    "POST /v1/auth/social/signup/status",
    "POST /v1/auth/social/login/status",
    "POST /v1/auth/social/signup/complete",
    "GET /v1/account/social-providers",
    "POST /v1/account/social/{provider}/link",
    "POST /v1/account/social/unlink",
    "POST /v1/account/social/{provider}/step-up/begin",
    "POST /v1/account/social/step-up/status",
    "POST /v1/account/social/step-up/passkey-options",
    "POST /v1/account/social/step-up/complete",
    "POST /v1/auth/age-check",
    "POST /v1/auth/register",
    "POST /v1/auth/verify-email",
    "POST /v1/auth/resend-verification",
    "POST /v1/auth/recovery/start",
    "POST /v1/auth/recovery/prove",
    "POST /v1/auth/recovery/enrollment/options",
    "POST /v1/auth/recovery/enrollment/complete",
    "POST /v1/auth/recovery/enrollment/status",
    "POST /v1/auth/recovery/enrollment/complete-evidence",
    "POST /v1/auth/onboarding/status",
    "POST /v1/auth/onboarding/complete",
    "POST /v1/auth/passkeys/step-up/options",
    "POST /v1/auth/passkeys/step-up/complete",
    "GET /v1/account/auth-methods",
    "POST /v1/account/auth-methods/remove",
    "POST /v1/account/recovery-codes/regenerate",

    "POST /v1/auth/mfa/totp/begin",
    "POST /v1/auth/mfa/totp/verify",
    "POST /v1/auth/mfa/recovery-codes/generate",
    "POST /v1/auth/mfa/recovery-codes/confirm",
    "POST /v1/auth/passkeys/enrollment/options",
    "POST /v1/auth/passkeys/enrollment/complete",
    "POST /v1/auth/passkeys/login/options",
    "POST /v1/auth/passkeys/login/complete",
    "POST /v1/auth/login",
    "POST /v1/auth/logout",
    "GET /v1/auth/sessions",
    "DELETE /v1/auth/sessions/{id}",
    "DELETE /v1/auth/sessions",
    "POST /v1/auth/step-up",
    "GET /v1/auth/age-confirmation",
    "POST /v1/auth/age-confirmation",
    "GET /v1/account/sensitive-data-consent",
    "POST /v1/account/sensitive-data-consent",
    "DELETE /v1/account",
    "GET /v1/account/erasure",
    "POST /v1/account/erasure/cancel",
    "GET /v1/account/legal-status",
    "POST /v1/account/legal-accept",
    "POST /v1/account/legacy-runs/claim",
    "GET /v1/account/profile",
    "POST /v1/account/profile/reveal",
    "POST /v1/account/profile",
    "GET /v1/account/recovery-email",
    "POST /v1/account/recovery-email",
    "POST /v1/account/recovery-email/confirm",
    "DELETE /v1/account/recovery-email",
    "GET /v1/account/email",
    "POST /v1/account/email/change",
    "POST /v1/account/email/change/resend",
    "DELETE /v1/account/email/change",
    "POST /v1/account/email/change/confirm",
    "POST /v1/account/email/change/cancel",
    "DELETE /v1/debates/{id}",
    "GET /v1/public/debates",
    "GET /v1/public/debates/{id}",
    "GET /v1/geo/availability",
    "POST /v1/support/sessions",
    "GET /v1/support/sessions/{id}",
    "POST /v1/support/sessions/{id}/messages",
    "POST /v1/support/messages/{id}/rating",
    "POST /v1/support/sessions/{id}/escalate",
    "GET /v1/support/cases",
    // DL1-F5c/DL3-F4: the case bearer rides `x-support-case-token`, never a path.
    "GET /v1/support/case",
    "POST /v1/support/case/messages",
    "GET /v1/support/status",
    "POST /v1/asks",
    "GET /v1/asks/room",
    "GET /v1/session",
    "GET /v1/deployment",
    "GET /v1/dev/evaluator",
    "POST /v1/dev/evaluator/consumer-selection",
    "GET /v1/answers",
    "GET /v1/answers/{id}",
    "GET /v1/answers/{id}/inspection",
    "GET /v1/answers/{id}/nodes/{nodeId}",
    "GET /v1/answers/{id}/ledger-digest",
    "GET /v1/answers/{id}/story",
    "GET /v1/answers/{id}/disclosure",
    "POST /v1/answers/{id}/investigations/{gapRef}",
    "POST /v1/answers/{id}/memory-link/unlink",
    "GET /v1/runs/{id}",
    "GET /v1/runs/{id}/visibility",
    "GET /v1/runs/{id}/events",
    "GET /v1/runs/{id}/answer",
    "POST /v1/runs/{id}/publish",
    "POST /v1/runs/{id}/unpublish",
    "GET /v1/billing/usage",
    "GET /v1/billing/plans",
    "POST /v1/billing/quote",
    "POST /v1/billing/checkout",
    "GET /v1/billing/charges/{chargeRef}",
    "POST /v1/billing/xmoney/notify",
    "GET /v1/billing/subscription",
    "GET /v1/billing/invoices",
    "POST /v1/billing/subscription/downgrade",
    "POST /v1/billing/subscription/cancel",
    "POST /v1/billing/subscription/cancel-revoke",
    "POST /v1/billing/subscription/upgrade-quote",
    "POST /v1/billing/subscription/upgrade",
    "POST /v1/billing/subscription/withdraw",
    "POST /v1/billing/subscription/card",
    "POST /v1/billing/cancel-link",
    "POST /v1/billing/cancel-by-token"
  ]),
  resources: Object.freeze({
    ...passwordResetContractSchemas,
    ...mfaRecoveryContractSchemas,
    ...consumerAuthContractSchemas,
    ...socialAuthContractSchemas,
    ...staffContractInventory.resources,
    ...fundedStaffContractInventory.resources,
    FundingBasisSchema,
    AskRequestSchema, AskAcceptedSchema, AskAlreadyWaitingSchema, AskRoomQuerySchema, AskRoomResponseSchema,
    BillingUsageResponseSchema, RunProjectionSchema, SessionSchema, SessionSummarySchema,
    SessionListSchema, RevokeAllSessionsSchema, VisibilityGrantActionSchema,
    AgeCheckRequestSchema, AgeCheckResultSchema, AgeConfirmationStatusSchema, RegisterLegalDocumentsSchema,
    LegalStatusResponseSchema, LegalAcceptRequestSchema, GeoAvailabilityResponseSchema,
    SensitiveDataConsentRequestSchema, SensitiveDataConsentStatusSchema,
    RunTargetedGrantActionSchema,
    BeginSocialStepUpRequestSchema,SocialStepUpStatusRequestSchema,SocialStepUpStatusResponseSchema,CompleteSocialStepUpRequestSchema,StepUpAuthorizationRequestSchema, StepUpResponseSchema, BeginPasskeyStepUpRequestSchema, CompletePasskeyStepUpRequestSchema, AuthMethodsResponseSchema, RemoveAuthMethodRequestSchema, RegenerateRecoveryCodesRequestSchema, RecoveryCodesResponseSchema,
    PublishDebateRequestSchema, UnpublishDebateRequestSchema,
    AccountErasureScheduleRequestSchema,AccountErasureStatusSchema,
    AccountErasureCancelRequestSchema,AccountErasureCancelledSchema,PrivateDebateErasureRequestSchema,
    PrivateDebateErasureStatusSchema,LegacyRunClaimRequestSchema,LegacyRunClaimResultSchema,
    AccountPhoneProfileSchema,PhoneProfileRevealRequestSchema,PhoneProfileRevealSchema,PhoneProfileUpdateRequestSchema,
    RecoveryEmailSettingsSchema,RecoveryEmailRequestSchema,RecoveryEmailRemoveRequestSchema,
    AccountEmailSchema,EmailChangeRequestSchema,EmailChangePendingSchema,EmailChangeLinkRequestSchema,
    EmailChangeConfirmedSchema,EmailChangeCancelledSchema,
    PublicationTransitionSchema, PublicDebateSummarySchema, PublicDebateSchema, PublicDebateListSchema,
    DeploymentSchema, AnswerSummarySchema, OpenRunSummarySchema, AnswerIndexSchema,
    AnswerSchema, InspectionSchema, NodeSchema,
    RunEventSchema, ComposedSegmentSchema, NumberSlotSchema, BandCeilingSchema, StalenessStateSchema,
    ShadowSuppressionSchema, AbstentionSchema, InvestigationGapSchema, InvestigationRequestSchema,
    InvestigationAcceptedSchema, ExecutionLedgerDigestSchema, ValueHingeProjectionSchema, ConditionMarkSchema, EdgeSchema,
    AnswerStorySchema, AnswerDisclosureSchema, BillingPlansResponseSchema,
    BillingQuoteRequestSchema, BillingQuoteResponseSchema, BillingCheckoutRequestSchema, BillingCheckoutResponseSchema,
    BillingCheckoutPendingErrorSchema, BillingChargeStatusResponseSchema,
    BillingSubscriptionResponseSchema, BillingDowngradeRequestSchema, BillingInvoicesResponseSchema,
    BillingUpgradeQuoteRequestSchema, BillingUpgradeQuoteResponseSchema, BillingUpgradeRequestSchema,
    BillingUpgradeResponseSchema, BillingWithdrawRequestSchema, BillingWithdrawResponseSchema,
    BillingCardChangeResponseSchema, BillingCancelLinkRequestSchema, BillingCancelLinkAcceptedSchema,
    BillingCancelByTokenRequestSchema
  })
});
