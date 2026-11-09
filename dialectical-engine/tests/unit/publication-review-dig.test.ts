import { describe, expect, it } from "vitest";
import { DigNotPublishableSchema, type Answer } from "@debateai/contract";
import type { PublicationReviewRepository } from "@debateai/serve";
import { createPublicationReviewOwnerRoutes } from "../../apps/api/src/publication-review/owner.js";
import type { PublicationApplication } from "../../apps/api/src/publications.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";

/**
 * Security review F2 (migration 0171): the owner decided that a dig is never published, so it is never put in the team's queue for an approval to
 * publish either. The owner's ask (POST /v1/runs/{id}/publication-review) answers 409 DIG_NOT_PUBLISHABLE, the publish route's own refusal, once the
 * grant is known live and before the answer is read, the verdict of record is asked or the repository writes anything (so no grant is consumed and
 * no request is queued); the database refuses it too (serve.ask_publication_review, tests/integration/publication-review-owner.test.ts). A debate
 * that is no dig asks as before.
 */
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const authenticated = Object.freeze({
  session: Object.freeze({
    asker_id: "owner:44444444-4444-4444-8444-444444444444", session_id: "55555555-5555-4555-8555-555555555555", caller_scope: "ASKER" as const,
    ownership_provenance: "server_session" as const, provisional_identity_model: false as const
  }),
  userId: "66666666-6666-4666-8666-666666666666", ownerRef: "44444444-4444-4444-8444-444444444444", tokenHash: "sha256:session",
  csrfTokenHash: "sha256:csrf", authKind: "cookie" as const
}) satisfies AuthenticatedSession;
const BODY = { step_up_grant: "g".repeat(43), team_read_acknowledged: true };

function routes(dig: boolean | undefined, preflight = true) {
  const calls: string[] = [];
  const publications = {
    preflightGrant: async () => { calls.push("preflightGrant"); return preflight; },
    ...(dig === undefined ? {} : { isDig: async () => { calls.push("isDig"); return dig; } })
  } as unknown as PublicationApplication;
  const repository = {
    ask: async () => { calls.push("ask"); return "ASKED" as const; },
    readStates: async () => []
  } as unknown as PublicationReviewRepository;
  const owner = createPublicationReviewOwnerRoutes({
    repository, publications,
    readOwnedAnswer: async () => { calls.push("readOwnedAnswer"); return { answer_id: "77777777-7777-4777-8777-777777777777" } as unknown as Answer; },
    readVerdictOfRecord: async () => { calls.push("readVerdictOfRecord"); return { verdict: "FLAGGED", synthesisOriginVersion: 1, categories: ["HATE_SPEECH"] } as never; },
    auditDenial: async () => { calls.push("auditDenial"); }
  });
  return { calls, ask: () => owner.ask({ runId: RUN_ID, authenticated, body: BODY, requestId: "request:review-dig" }) };
}

describe("the publication review refuses a dig (security review F2, 0171)", () => {
  it("a dig's ask answers 409 DIG_NOT_PUBLISHABLE right after the grant's check, and reads, asks and writes nothing", async () => {
    const { calls, ask } = routes(true);
    const response = await ask();
    expect(response.status).toBe(409);
    expect(DigNotPublishableSchema.parse(response.body)).toStrictEqual({ error: "DIG_NOT_PUBLISHABLE", message: "DIG_NOT_PUBLISHABLE" });
    expect(calls).toEqual(["preflightGrant", "isDig"]);
  });

  it("a debate that is no dig asks as before, and another's debate is still the audited 404 before anything is asked of it", async () => {
    const plain = routes(false);
    expect(await plain.ask()).toEqual({ status: 201, body: { state: "UNDER_REVIEW" } });
    expect(plain.calls).toEqual(["preflightGrant", "isDig", "readOwnedAnswer", "readVerdictOfRecord", "ask"]);
    const foreign = routes(true, false);
    expect((await foreign.ask()).status).toBe(404);
    expect(foreign.calls).toEqual(["preflightGrant", "auditDenial"]);
    // An application with no question to ask (a test double, an older composition) asks as before: the database still refuses a dig.
    const unasked = routes(undefined);
    expect((await unasked.ask()).status).toBe(201);
  });
});
