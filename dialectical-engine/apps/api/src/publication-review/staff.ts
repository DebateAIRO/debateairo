import { createHash } from "node:crypto";
import {
  PublicationReviewDecisionResponseSchema, PublicationReviewQueuePageSchema,
  PublicationReviewSnapshotSchema, type StaffActionIntent, type SynthesisCheckCategory
} from "@debateai/contract";
import type { ActionBinding } from "@debateai/kernel";
import type { OpenedReview, PublicationReviewRepository } from "@debateai/serve";
import type { PublicDebateBody } from "../publications.js";
import type { StaffAuthentication } from "../staff/access.js";

export type PublicationReviewIntent = Extract<StaffActionIntent,
  { action: "PUBLICATION_REVIEW_APPROVE" | "PUBLICATION_REVIEW_REFUSE" }>;

const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

export function canonicalPublicationReviewBinding(intent: PublicationReviewIntent, reasonSalt: string): ActionBinding {
  const body = {
    action: intent.action,
    target_id: intent.review_ref,
    ...(intent.action === "PUBLICATION_REVIEW_REFUSE"
      ? { reason_sha256: sha256Hex(`${reasonSalt}:${intent.reason.trim()}`) } : {}),
    expected_revision: 0,
    operation_id: intent.operation_id
  };
  return {
    action: intent.action, targetId: intent.review_ref, expectedRevision: 0,
    operationId: intent.operation_id, bodySha256: sha256Hex(JSON.stringify(body))
  };
}

type Repository = Pick<PublicationReviewRepository, "listPending" | "open" | "recordCopy" | "decide">;
type Deps = Readonly<{
  repository: Repository;
  readVerdictCategories(input: { runId: string; answerId: string; originVersion: number }): Promise<SynthesisCheckCategory[]>;
  readReviewBody(opened: OpenedReview): Promise<{ answerVersion: number; body: PublicDebateBody }>;
}>;

export function createPublicationReviewStaffService(deps: Deps) {
  const staff = (auth: StaffAuthentication) => ({ context: auth.context, tokenHash: auth.baseSession.tokenHash });
  return Object.freeze({
    async list(auth: StaffAuthentication) {
      const pending = await deps.repository.listPending({ ...staff(auth), limit: 101 });
      const items = [];
      for (const item of pending.slice(0, 100)) {
        items.push({
          review_ref: item.reviewRef, asked_at: item.askedAt.toISOString(), ask_ordinal: item.askOrdinal,
          categories: await deps.readVerdictCategories({ runId: item.runId, answerId: item.answerId, originVersion: item.originVersion })
        });
      }
      return PublicationReviewQueuePageSchema.parse({ items, order: "ASKED_AT_ASC", has_more: pending.length > 100 });
    },
    async read(auth: StaffAuthentication, reviewRef: string) {
      const opened = await deps.repository.open({ ...staff(auth), reviewRef, purpose: "READ" });
      const { answerVersion, body } = await deps.readReviewBody(opened);
      const categories = await deps.readVerdictCategories({
        runId: opened.runId, answerId: opened.answerId, originVersion: opened.originVersion
      });
      const snapshot = PublicationReviewSnapshotSchema.parse({
        ...body, review_ref: opened.reviewRef, asked_at: opened.askedAt.toISOString(),
        ask_ordinal: opened.askOrdinal, categories
      });
      await deps.repository.recordCopy({ ...staff(auth), opened, answerVersion, snapshot });
      return snapshot;
    },
    async decisionBinding(auth: StaffAuthentication, intent: PublicationReviewIntent) {
      const opened = await deps.repository.open({ ...staff(auth), reviewRef: intent.review_ref, purpose: "DECIDE" });
      return canonicalPublicationReviewBinding(intent, opened.reasonSalt);
    },
    async decide(auth: StaffAuthentication, intent: PublicationReviewIntent, proofId: string, binding: ActionBinding) {
      const opened = await deps.repository.open({ ...staff(auth), reviewRef: intent.review_ref, purpose: "DECIDE" });
      const outcome = intent.action === "PUBLICATION_REVIEW_APPROVE" ? "APPROVE" : "REFUSE";
      const result = await deps.repository.decide({ ...staff(auth), opened, proofId, binding, outcome,
        ...(intent.action === "PUBLICATION_REVIEW_REFUSE" ? { reason: intent.reason.trim() } : {}) });
      return PublicationReviewDecisionResponseSchema.parse({
        review_ref: opened.reviewRef, outcome, decided_at: result.decidedAt.toISOString()
      });
    }
  });
}

export type PublicationReviewStaffService = ReturnType<typeof createPublicationReviewStaffService>;
