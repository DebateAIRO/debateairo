import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import * as contract from "@debateai/contract";
import type { CryptoEnvelope, PreparedPublicationCipher } from "@debateai/crypto";
import type { ActionBinding } from "@debateai/kernel";
import type { PostgresPublicReviewRepository, PublicReviewCommandState, PublicReviewMaterial } from "@debateai/db";
import { parseCanonicalRegisterJson } from "@debateai/register";
import type { StaffAccessApplication, StaffAuthentication } from "./access.js";
import type { StaffAlertIntentProducer } from "./alerts.js";
import { StaffAlertError } from "./alerts.js";
import { correctedPiece, textPiecesOf } from "../public-tree.js";

/**
 * A PUBLIC DEBATE UNDER REVIEW over HTTP (plan 2026-10-31-r22-owner-changes decision 33; migration 0150). The two accounts of decision 24 only, the same authority and no other role. Every change needs that
 * person's passkey, bound by the server to the debate, the piece, the step and the log's revision (`canonicalPublicReviewBinding`); the database recomputes the same digest under the debate's lock.
 * A hide is containment: it goes on while team tools are locked, and no money and no check is ever asked. Everything else waits for the tools.
 */
export type PublicReviewIntent = Extract<contract.StaffActionIntent, { action: "PUBLIC_REVIEW_HIDE" | "PUBLIC_REVIEW_STEP" }>;
export type PublicReviewKey = <T>(publicationRef: string, runId: string, use: (cipher: PreparedPublicationCipher) => T) => Promise<T>;
export interface PublicReviewStaffService { repository: PostgresPublicReviewRepository; withKey: PublicReviewKey }
export class PublicReviewHttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export const isPublicReviewIntent = (intent: { action: string }): intent is PublicReviewIntent => intent.action === "PUBLIC_REVIEW_HIDE" || intent.action === "PUBLIC_REVIEW_STEP";

export function canonicalPublicReviewBinding(intent: PublicReviewIntent, state: PublicReviewCommandState): ActionBinding {
  if (intent.expected_revision !== state.expectedRevision) throw new PublicReviewHttpError(409, "PUBLIC_REVIEW_STALE");
  const step = intent.action === "PUBLIC_REVIEW_HIDE" ? null : intent;
  const body = { action: intent.action, target_id: intent.publication_ref, step: step?.step ?? "HIDE", piece_kind: step?.piece_kind ?? "", piece_id: step?.piece_id ?? "", pointer: step?.pointer ?? "",
    text_sha256: step?.text_sha256 ?? "", expected_revision: intent.expected_revision, operation_id: intent.operation_id };
  return { action: intent.action, targetId: intent.publication_ref, expectedRevision: intent.expected_revision, operationId: intent.operation_id,
    bodySha256: sha(parseCanonicalRegisterJson(Buffer.from(JSON.stringify(body)))) };
}

const iso = (at: string): string => new Date(at).toISOString();
const textOf = (opened: unknown): string => {
  if (typeof opened !== "object" || opened === null || typeof (opened as { text?: unknown }).text !== "string") throw new Error("PUBLIC_REVIEW_CORRECTION_UNREAD");
  return (opened as { text: string }).text;
};

/** The page the two read: every piece's original, its newest correction, and whether it is on the page; each row with the path's text before it, so a problem can be traced to one dig. */
export function publicReviewPageOf(publicationRef: string, material: PublicReviewMaterial, open: (envelope: CryptoEnvelope) => unknown): contract.PublicReviewPage {
  const corrected = new Map<string, string>();
  for (const correction of material.corrections) corrected.set(`${correction.piece_kind}:${correction.piece_id.toLowerCase()}:${correction.pointer}`, textOf(open(correction.content)));
  const pieces = (kind: string, id: string, value: unknown) => textPiecesOf(value).map((piece) => ({ pointer: piece.pointer, original: piece.text, corrected: corrected.get(`${kind}:${id.toLowerCase()}:${piece.pointer}`) ?? null }));
  let snapshot: unknown = null;
  let snapshotUnreadable = false;
  try { snapshot = open(material.snapshot.content); } catch { snapshotUnreadable = true; }
  const before = new Map<string, string>();
  const updates = material.updates.map((row) => {
    let opened: unknown = null;
    try { opened = open(row.content); } catch { /* A row that does not open shows no text. */ }
    const line = typeof opened === "object" && opened !== null && typeof (opened as { line?: unknown }).line === "string" ? (opened as { line: string }).line : null;
    const key = row.position_ref ?? "";
    const earlier = row.kind === "PATH" ? before.get(key) ?? null : null;
    if (row.kind === "PATH" && line !== null) before.set(key, line);
    return { update_id: row.update_id, update_seq: row.update_seq, dig_run_id: row.dig_run_id, kind: row.kind, position_ref: row.position_ref, recorded_at: iso(row.recorded_at),
      state: row.own_dig_removed ? "ITS_DIG_REMOVED" as const : row.off ? "AFFECTED" as const : "ON_THE_PAGE" as const, before: earlier, pieces: pieces("UPDATE", row.update_id, opened) };
  });
  const reports = material.reports.map((row) => {
    let opened: unknown = null;
    try { opened = open(row.content); } catch { /* As above. */ }
    return { report_id: row.report_id, report_version: row.report_version, writer: row.writer, requested_at: iso(row.requested_at), recorded_at: iso(row.recorded_at),
      state: row.hidden_by_hand ? "HIDDEN" as const : row.off ? "AFFECTED" as const : "ON_THE_PAGE" as const, pieces: pieces("REPORT", row.report_id, opened) };
  });
  const question = typeof snapshot === "object" && snapshot !== null && typeof (snapshot as { question?: unknown }).question === "string" ? (snapshot as { question: string }).question : "";
  return contract.PublicReviewPageSchema.parse({ publication_ref: publicationRef, hidden: material.hidden, revision: material.revision, question, published_at: iso(material.snapshot.created_at),
    snapshot_unreadable: snapshotUnreadable, snapshot: pieces("SNAPSHOT", publicationRef, snapshot),
    digs: material.digs.map((dig) => ({ ...dig, contributed_at: iso(dig.contributed_at) })), updates, reports,
    log: material.log.map((entry) => ({ revision: entry.revision, action: entry.action, piece_kind: entry.piece_kind, actor_staff_id: entry.actor_staff_id, at: iso(entry.at) })) });
}

type Route = (method: "GET" | "POST", path: string, handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => void;
function parsed<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new PublicReviewHttpError(422, "STAFF_INPUT_INVALID");
  return result.data;
}
const PLAIN_REFUSALS: Readonly<Record<string, number>> = Object.freeze({ PUBLIC_REVIEW_STALE: 409, PUBLIC_REVIEW_ALREADY_HIDDEN: 409, PUBLIC_REVIEW_NOT_HIDDEN: 409, PUBLIC_REVIEW_NOT_PUBLIC: 404, PUBLIC_REVIEW_PIECE_UNKNOWN: 404 });
/** The database's own words for a step it would not take; anything else stays the generic refusal. */
async function plainRefusals<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = PLAIN_REFUSALS[message];
    if (status !== undefined) throw new PublicReviewHttpError(status, message);
    throw error;
  }
}

export function registerPublicReviewRoutes(route: Route, service: () => PublicReviewStaffService | undefined, access: () => StaffAccessApplication,
  intents: () => Pick<StaffAlertIntentProducer, "mutation">, auth: (request: FastifyRequest) => StaffAuthentication, unlocked: () => Promise<boolean>,
  actionAuthority: (request: FastifyRequest, intent: PublicReviewIntent) => Promise<{ authentication: StaffAuthentication; binding: ActionBinding }>): void {
  const present = (): PublicReviewStaffService => {
    const value = service();
    if (value === undefined) throw new StaffAlertError("STAFF_ALERT_UNAVAILABLE");
    return value;
  };
  const publicationOf = (request: FastifyRequest): string => parsed(contract.PublicReviewPageSchema.shape.publication_ref, (request.params as { id?: unknown }).id);
  async function proved(request: FastifyRequest, intent: PublicReviewIntent, proofHandle: string) {
    const { authentication, binding } = await actionAuthority(request, intent);
    const proof = await access().readActionProof(authentication, proofHandle, binding);
    if (proof === null) throw new PublicReviewHttpError(403, "STAFF_REQUEST_REFUSED");
    // A hide never waits for the alert channel. Every other step has come through `actionAuthority`'s lock.
    const alertIntent = intent.action === "PUBLIC_REVIEW_HIDE" && !await unlocked() ? null : await intents().mutation({ event: "PUBLIC_REVIEW_CHANGED", operationId: binding.operationId,
      keyUserId: authentication.context.userId, actorStaffId: authentication.context.staffId, subjectStaffId: authentication.context.staffId, reason: { code: "SECURITY_RESPONSE" } });
    return { actor: authentication.context, proof, alertIntent };
  }
  const answer = (value: { operationId: string; outcome: string; recordedAt: Date }) => ({ operation_id: value.operationId, outcome: value.outcome, recorded_at: value.recordedAt.toISOString() });
  route("GET", "/v1/admin/public-review", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const authentication = auth(request);
    await access().requireCapability(authentication, "TEAM_LIMIT_SET");
    const list = await present().repository.list(authentication.context, authentication.baseSession.tokenHash);
    return contract.PublicReviewListSchema.parse({ hidden: list.hidden.map((row) => ({ publication_ref: row.publication_ref, hidden_at: iso(row.hidden_at) })),
      log: list.log.map((row) => ({ publication_ref: row.publication_ref, revision: row.revision, action: row.action, piece_kind: row.piece_kind, actor_staff_id: row.actor_staff_id, at: iso(row.at) })) });
  });
  route("GET", "/v1/admin/public-review/:id", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const publicationRef = publicationOf(request);
    const authentication = auth(request);
    await access().requireCapability(authentication, "TEAM_LIMIT_SET");
    const { repository, withKey } = present();
    const material = await repository.read(authentication.context, authentication.baseSession.tokenHash, publicationRef);
    if (material === null) throw new PublicReviewHttpError(404, "PUBLIC_REVIEW_NOT_PUBLIC");
    return withKey(publicationRef, material.snapshot.run_id, (cipher) => publicReviewPageOf(publicationRef, material, (envelope) => cipher.decrypt(envelope)));
  });
  route("POST", "/v1/admin/public-review/:id/hide", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const publicationRef = publicationOf(request);
    const input = parsed(contract.PublicReviewHideRequestSchema, request.body);
    return plainRefusals(async () => {
      const common = await proved(request, { action: "PUBLIC_REVIEW_HIDE", publication_ref: publicationRef, expected_revision: input.expected_revision, operation_id: input.operation_id }, input.proof_handle);
      return answer(await present().repository.act({ ...common, step: "HIDE", publicationRef, pieceKind: null, pieceId: null, pointer: null, textSha256: null, content: null,
        expectedRevision: input.expected_revision, operationId: input.operation_id }));
    });
  });
  route("POST", "/v1/admin/public-review/:id/step", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const publicationRef = publicationOf(request);
    const input = parsed(contract.PublicReviewStepRequestSchema, request.body);
    if ((input.step === "CORRECT") !== (input.text !== null) || (input.step === "CORRECT") !== (input.pointer !== null)) throw new PublicReviewHttpError(422, "STAFF_INPUT_INVALID");
    if ((input.step === "REPUBLISH") !== (input.piece_id === null) || (input.step === "REPUBLISH") !== (input.piece_kind === null)) throw new PublicReviewHttpError(422, "STAFF_INPUT_INVALID");
    const textSha256 = input.text === null ? null : sha(input.text);
    return plainRefusals(async () => {
      const common = await proved(request, { action: "PUBLIC_REVIEW_STEP", publication_ref: publicationRef, step: input.step, piece_kind: input.piece_kind, piece_id: input.piece_id, pointer: input.pointer,
        text_sha256: textSha256, expected_revision: input.expected_revision, operation_id: input.operation_id }, input.proof_handle);
      const { repository, withKey } = present();
      let content: CryptoEnvelope | null = null;
      if (input.text !== null) {
        // Only a string a person reads can be replaced, and the page must still read after it. Read under the same authority; a read here is logged as any other.
        const material = await repository.read(common.actor, auth(request).baseSession.tokenHash, publicationRef);
        if (material === null) throw new PublicReviewHttpError(404, "PUBLIC_REVIEW_NOT_PUBLIC");
        const text = input.text;
        content = await withKey(publicationRef, material.snapshot.run_id, (cipher) => {
          const target = input.piece_kind === "SNAPSHOT" ? material.snapshot.content
            : input.piece_kind === "UPDATE" ? material.updates.find((row) => row.update_id === input.piece_id)?.content
              : material.reports.find((row) => row.report_id === input.piece_id)?.content;
          if (target === undefined) throw new PublicReviewHttpError(404, "PUBLIC_REVIEW_PIECE_UNKNOWN");
          const opened: unknown = cipher.decrypt(target);
          if (!textPiecesOf(opened).some((piece) => piece.pointer === input.pointer)) throw new PublicReviewHttpError(404, "PUBLIC_REVIEW_PIECE_UNKNOWN");
          if (input.piece_kind === "SNAPSHOT" && !contract.PublicDebateSchema.safeParse(correctedPiece(opened, [{ pointer: input.pointer!, text }])).success) throw new PublicReviewHttpError(422, "STAFF_INPUT_INVALID");
          return cipher.encrypt({ text });
        });
      }
      return answer(await repository.act({ ...common, step: input.step, publicationRef, pieceKind: input.piece_kind, pieceId: input.piece_id, pointer: input.pointer, textSha256, content,
        expectedRevision: input.expected_revision, operationId: input.operation_id }));
    });
  });
}
