import { hashToken } from "@debateai/crypto";
import {
  PublicationReviewAskRequestSchema, PublicationReviewAskResponseSchema,
  PublicationReviewStateSchema, type Answer
} from "@debateai/contract";
import {
  PublicationReviewRepository, reviewStateOf, type VerdictOfRecord
} from "@debateai/serve";
import type { AuthenticatedSession } from "../sessions.js";
import type { PublicationApplication } from "../publications.js";

type Response = Readonly<{ status: number; body: unknown }>;
type OwnerInput = Readonly<{ runId: string; authenticated: AuthenticatedSession }>;
type AskInput = OwnerInput & Readonly<{ body: unknown; requestId: string | undefined }>;

const error = (status: number, code: string): Response => ({ status, body: { error: code, message: code } });

export function createPublicationReviewOwnerRoutes(deps: Readonly<{
  repository: PublicationReviewRepository;
  publications: PublicationApplication | undefined;
  readOwnedAnswer(input: OwnerInput): Promise<Answer | null>;
  readVerdictOfRecord(input: OwnerInput & Readonly<{ answer: Answer }>): Promise<VerdictOfRecord>;
  auditDenial(input: Readonly<{ authenticated: AuthenticatedSession; requestId: string | undefined }>): Promise<unknown>;
}>) {
  return {
    async ask(input: AskInput): Promise<Response> {
      const parsed = PublicationReviewAskRequestSchema.safeParse(input.body);
      if (!parsed.success) return error(400, "MALFORMED_REQUEST");
      if (deps.publications === undefined) return error(503, "PUBLICATION_REVIEW_UNAVAILABLE");
      if (!await deps.publications.preflightGrant({
        runId: input.runId, authenticated: input.authenticated,
        grantToken: parsed.data.step_up_grant, action: "PUBLISH"
      })) {
        await deps.auditDenial({ authenticated: input.authenticated, requestId: input.requestId });
        return error(404, "RUN_NOT_FOUND");
      }
      const answer = await deps.readOwnedAnswer(input);
      if (answer === null) return error(404, "RUN_NOT_FOUND");
      const verdict = await deps.readVerdictOfRecord({ ...input, answer });
      if (verdict?.verdict !== "FLAGGED") return error(409, "PUBLICATION_REVIEW_NOT_ALLOWED");
      let result: Awaited<ReturnType<PublicationReviewRepository["ask"]>>;
      try {
        result = await deps.repository.ask({
          grantTokenHash: hashToken("step-up-grant", parsed.data.step_up_grant),
          sessionId: input.authenticated.session.session_id,
          userId: input.authenticated.userId,
          ownerRef: input.authenticated.ownerRef,
          runId: input.runId, answerId: answer.answer_id,
          originVersion: verdict.synthesisOriginVersion
        });
      } catch (caught) {
        if (caught instanceof Error && caught.message === "PRIVATE_CONTENT_ERASED") return error(404, "RUN_NOT_FOUND");
        throw caught;
      }
      if (result === "GRANT_INVALID") return error(404, "RUN_NOT_FOUND");
      if (result === "PENDING") return error(409, "PUBLICATION_REVIEW_PENDING");
      if (result === "NOT_ALLOWED") return error(409, "PUBLICATION_REVIEW_NOT_ALLOWED");
      return { status: 201, body: PublicationReviewAskResponseSchema.parse({ state: "UNDER_REVIEW" }) };
    },

    async read(input: OwnerInput): Promise<Response> {
      const answer = await deps.readOwnedAnswer(input);
      if (answer === null) return error(404, "RUN_NOT_FOUND");
      const verdict = await deps.readVerdictOfRecord({ ...input, answer });
      const flagged = verdict?.verdict === "FLAGGED";
      const state = flagged
        ? reviewStateOf(await deps.repository.readStates({
          ownerRef: input.authenticated.ownerRef, runId: input.runId, answerId: answer.answer_id
        }), verdict.synthesisOriginVersion)
        : { state: "NONE" as const, asksUsed: 0 as const, mayAsk: false, refusal: null };
      return {
        status: 200,
        body: PublicationReviewStateSchema.parse({
          flagged, state: state.state, categories: flagged ? verdict.categories : [],
          asks_used: state.asksUsed, may_ask: state.mayAsk,
          refusal: state.refusal === null ? null : {
            reason: state.refusal.reason, decided_at: state.refusal.decidedAt.toISOString()
          }
        })
      };
    }
  };
}
