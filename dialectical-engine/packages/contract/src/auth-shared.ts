import { z } from "zod";

/** Public session identity only; bearer tokens stay in HttpOnly cookies. */
export const SessionSchema = z.object({
  asker_id: z.string().regex(/^owner:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  session_id: z.uuid(),
  caller_scope: z.literal("ASKER"),
  ownership_provenance: z.literal("server_session"),
  provisional_identity_model: z.literal(false),
  /** Whether the deployment currently has a valid model scorecard, without exposing its internals. */
  model_scorecard_in_force: z.boolean().optional()
}).strict();
export type Session = z.infer<typeof SessionSchema>;

/** The displayed document's immutable version and content digest. */
export const LegalDocumentPairSchema = z.object({
  version: z.string().regex(/^[0-9]{1,4}\.[0-9]{1,4}$/u),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u)
}).strict();
export type LegalDocumentPairWire = z.infer<typeof LegalDocumentPairSchema>;
