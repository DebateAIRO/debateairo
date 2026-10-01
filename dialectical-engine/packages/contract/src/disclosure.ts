import { z } from "zod";
import { MakerLineageSchema } from "./lineage.js";

/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.4 and §14.4.5), TASK M5 — what the
 * owner's side record (`serve.serve_disclosure`, migration 0076) lets the
 * answer's owner read. It imports only zod and ./lineage.js (never ./index.js),
 * for the same module-cycle reason story.ts does.
 */

const VerdictStateSchema = z.enum(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]);

/**
 * THE FLOOR (§14.4.4): an answer that ended components-only while its
 * arithmetic label existed. `verdict_state` is that label, exactly as the
 * engine derived it before the answer-writing step; `leading_node_id` is the
 * position it rests on, a node of the answer, whose own statement the page
 * shows as "Our best answer". `basis_incomplete` is true when that label was
 * derived without a margin or a disagreement measure — what a served label
 * discloses as LABEL-BASIS-INCOMPLETE; the page shows a plain note for it.
 * The sealed answer itself stays components-only. The same shape rides a
 * public snapshot (`PublicDebateSchema.floor`); its cause does not.
 */
export const AnswerFloorSchema = z.object({
  verdict_state: VerdictStateSchema,
  leading_node_id: z.guid(),
  basis_incomplete: z.boolean()
}).strict();
export type AnswerFloor = z.infer<typeof AnswerFloorSchema>;

/**
 * One role of the answer-writing step: the model the sealed register PLANNED
 * for it and the model that actually wrote (or checked) the round the answer
 * serves. A model is shown the way the story's "Written by" shows one: a maker
 * lineage (maker, model id, transport, provider ref), never a provider address
 * or a credential. A model is null when the record holds no call it made in
 * this run (a planned model refused before sending on every call), so it
 * cannot be named from the record. `lower_cost` is true when a lower-cost model
 * served in the planned one's place (spec §14.4.2: the only substitution the
 * engine makes, and only for money).
 */
export const DisclosedRoleSchema = z.object({
  planned_model: MakerLineageSchema.nullable(),
  served_model: MakerLineageSchema.nullable(),
  lower_cost: z.boolean()
}).strict();
export type DisclosedRole = z.infer<typeof DisclosedRoleSchema>;

/**
 * Why no answer could be written (§14.4.4): the sealed components-only cause of
 * a floor answer — money after every cheaper model, a digest that cannot
 * exist, a dead model connection, or a draft with nothing to serve. Owner-only:
 * it is never in a public snapshot.
 */
export const FloorReasonSchema = z.enum(["ENVELOPE_EXHAUSTED", "DIGEST_CANNOT_EXIST", "TRANSPORT_DEATH", "NO_ARTIFACT"]);

/** What cut the ARGUING short (§14.4.1): a stop kind, or null when nothing did. ALLOWANCE: the run owner's window (B9). */
export const ArguingStopSchema = z.enum(["MONEY", "ATTEMPTS", "USAGE", "DAILY", "ALLOWANCE"]);
/** What cut the ANSWER-WRITING loop short (§14.4.2), whether or not a round was kept. */
export const AnswerWritingStopSchema = z.enum(["MONEY", "ATTEMPTS", "USAGE", "DAILY", "ALLOWANCE", "TRANSPORT_DEATH", "NO_ARTIFACT"]);

/**
 * GET /v1/answers/{id}/disclosure — the owner-scoped read of the record.
 *
 *  · `answer_version`: the version the record belongs to — the answer's LATEST
 *    version that has one. A review catch-up version (DR-184) runs no
 *    answer-writing step, so it has no record of its own and the one before it
 *    is read.
 *  · `floor`: the floor, or null for an answer that carries its own label (or
 *    none at all); `floor_reason`, beside it and owner-only, its cause (null
 *    exactly when there is no floor).
 *  · `writer` / `checker`: null when the answer has no checked round
 *    (components-only).
 *  · `checker_same_as_writer`: one model both wrote and checked the served
 *    round (the two-model check was lost; spec §14.4.2).
 *  · `digest`: `compacted` is true when the answer-writer read a shortened
 *    digest of the debate (any ladder rung above the whole one, §14.4.3);
 *    `points_left_out` counts the points its last rung left out (0 otherwise).
 *    Null when no digest was handed to the answer-writer at all.
 *  · `cut_short`: what ended the arguing early, and what ended the
 *    answer-writing loop early; null when nothing did.
 *
 * Codes and counts only: no debate or model text. The engine's words are for
 * the page to translate (Task M6); they are never shown as they are.
 */
export const AnswerDisclosureSchema = z.object({
  answer_id: z.string().min(1),
  answer_version: z.number().int().positive(),
  floor: AnswerFloorSchema.nullable(),
  floor_reason: FloorReasonSchema.nullable(),
  writer: DisclosedRoleSchema.nullable(),
  checker: DisclosedRoleSchema.nullable(),
  checker_same_as_writer: z.boolean(),
  digest: z.object({
    compacted: z.boolean(),
    points_left_out: z.number().int().nonnegative()
  }).strict().nullable(),
  cut_short: z.object({
    arguing: ArguingStopSchema.nullable(),
    answer_writing: AnswerWritingStopSchema.nullable()
  }).strict()
}).strict().refine(
  (disclosure) => (disclosure.floor === null) === (disclosure.floor_reason === null),
  { message: "A floor names its cause, and only a floor has one" }
);
export type AnswerDisclosure = z.infer<typeof AnswerDisclosureSchema>;
