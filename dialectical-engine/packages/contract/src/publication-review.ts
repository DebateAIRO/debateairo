import { z } from "zod";
import { PublicDebateSchema } from "./index.js";
import type { SynthesisCheckCategory } from "./synthesis-check.js";

export const PUBLICATION_REVIEW_ERROR_CODES = [
  "PUBLICATION_REVIEW_PENDING", "PUBLICATION_REVIEW_DECIDED", "PUBLICATION_REVIEW_NOT_ALLOWED",
  "PUBLICATION_REVIEW_OWN_DEBATE", "PUBLICATION_REVIEW_SAME_REVIEWER",
  "PUBLICATION_REVIEW_NOT_FOUND", "PUBLICATION_REVIEW_UNAVAILABLE"
] as const;
export const PublicationReviewErrorCodeSchema = z.enum(PUBLICATION_REVIEW_ERROR_CODES);
export type PublicationReviewErrorCode = z.infer<typeof PublicationReviewErrorCodeSchema>;

const ReviewRefSchema = z.uuid();
const SynthesisCheckCategorySchema = z.enum([
  "HATE_SPEECH", "WEAPONS_OR_DRUGS", "SUICIDE_OR_HARM_TO_OTHERS", "TERRORISM"
]) satisfies z.ZodType<SynthesisCheckCategory>;
const ReviewCategoriesSchema = z.array(SynthesisCheckCategorySchema);
const AskOrdinalSchema = z.union([z.literal(1), z.literal(2)]);
const AsksUsedSchema = z.union([z.literal(0), AskOrdinalSchema]);
const ProofHandleSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

export const PublicationReviewAskRequestSchema = z.object({
  step_up_grant: ProofHandleSchema,
  team_read_acknowledged: z.literal(true)
}).strict();
export const PublicationReviewAskResponseSchema = z.object({ state: z.literal("UNDER_REVIEW") }).strict();
export const PublicationReviewStateSchema = z.object({
  flagged: z.boolean(),
  state: z.enum(["NONE", "UNDER_REVIEW", "APPROVED", "REFUSED"]),
  categories: ReviewCategoriesSchema,
  asks_used: AsksUsedSchema,
  may_ask: z.boolean(),
  refusal: z.object({ reason: z.string(), decided_at: z.iso.datetime() }).strict().nullable()
}).strict();
export type PublicationReviewState = z.infer<typeof PublicationReviewStateSchema>;

export const PublicationReviewSummarySchema = z.object({
  review_state: z.enum(["NONE", "UNDER_REVIEW", "APPROVED", "REFUSED"]),
  asks_used: AsksUsedSchema,
  visibility: z.enum(["PRIVATE", "PUBLISHED"])
}).strict();
export const PublicationReviewQueueItemSchema = z.object({
  review_ref: ReviewRefSchema,
  asked_at: z.iso.datetime(),
  ask_ordinal: AskOrdinalSchema,
  categories: ReviewCategoriesSchema.min(1)
}).strict();
export const PublicationReviewQueuePageSchema = z.object({
  items: z.array(PublicationReviewQueueItemSchema).max(100),
  order: z.literal("ASKED_AT_ASC"),
  has_more: z.boolean().optional()
}).strict();

// Defer the index dependency until parse time: the public schema is declared by index.ts.
export const PublicationReviewSnapshotSchema = z.lazy(() => PublicDebateSchema
  .omit({ public_ref: true, author_pseudonym: true, published_at: true })
  .extend({
    review_ref: ReviewRefSchema,
    asked_at: z.iso.datetime(),
    ask_ordinal: AskOrdinalSchema,
    categories: ReviewCategoriesSchema
  }).strict());

export const PublicationReviewApproveRequestSchema = z.object({
  proof_handle: ProofHandleSchema, operation_id: z.uuid()
}).strict();
export const PublicationReviewRefuseRequestSchema = PublicationReviewApproveRequestSchema.extend({
  reason: z.string().trim().min(1).max(500)
}).strict();
export const PublicationReviewDecisionResponseSchema = z.object({
  review_ref: ReviewRefSchema,
  outcome: z.enum(["APPROVE", "REFUSE"]),
  decided_at: z.iso.datetime()
}).strict();
export const PublicationReviewAuditEventSchema = z.object({
  event_id: z.uuid(),
  actor_staff_id: z.uuid(),
  event: z.enum([
    "PUBLICATION_REVIEW_LISTED", "PUBLICATION_REVIEW_READ",
    "PUBLICATION_REVIEW_APPROVED", "PUBLICATION_REVIEW_REFUSED"
  ]),
  review_ref: ReviewRefSchema.nullable(),
  recorded_at: z.iso.datetime()
}).strict();
