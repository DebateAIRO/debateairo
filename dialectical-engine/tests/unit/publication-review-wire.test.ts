import { describe, expect, it } from "vitest";
import * as contract from "../../packages/contract/src/index.js";
import { createContractClient } from "../../packages/contract/src/client.js";

type WireSchema = { safeParse(value: unknown): { success: boolean } };
const uuid = "123e4567-e89b-42d3-a456-426614174000";
const iso = "2026-10-20T12:00:00.000Z";
const category = "HATE_SPEECH";
const grant = "a".repeat(43);

function wire(name: string): WireSchema {
  const candidate = (contract as Record<string, unknown>)[name];
  expect(candidate, `${name} must be exported`).toBeDefined();
  return candidate as WireSchema;
}

const state = {
  flagged: true, state: "UNDER_REVIEW", categories: [category], asks_used: 1,
  may_ask: false, refusal: null
};
const reviewEvent = {
  event_id: uuid, actor_staff_id: uuid, event: "PUBLICATION_REVIEW_READ",
  review_ref: uuid, recorded_at: iso
};
const teamEvent = {
  event_id: uuid, actor_staff_id: uuid, subject_staff_id: uuid,
  event: "GRANTS_CHANGED", recorded_at: iso,
  reason: { code: "GRANT_CHANGE" }, delivery_state: "DELIVERED"
};

describe("publication review wire", () => {
  // Property: an ask authorizes team access only with an explicit true acknowledgement and no extra keys.
  it("the ask body is strict and requires team_read_acknowledged: true", () => {
    const ask = wire("PublicationReviewAskRequestSchema");
    const valid = { step_up_grant: grant, team_read_acknowledged: true };
    expect(ask.safeParse(valid).success).toBe(true);
    expect(ask.safeParse({ step_up_grant: grant }).success).toBe(false);
    expect(ask.safeParse({ ...valid, team_read_acknowledged: false }).success).toBe(false);
    expect(ask.safeParse({ ...valid, extra: true }).success).toBe(false);
  });

  // Property: a refusal carries a bounded nonblank owner-facing reason.
  it("a refuse reason is 1 to 500 characters after trim; 501 and whitespace-only are refused", () => {
    const refuse = wire("PublicationReviewRefuseRequestSchema");
    const base = { proof_handle: grant, operation_id: uuid };
    expect(refuse.safeParse({ ...base, reason: " x ".repeat(166) }).success).toBe(true);
    expect(refuse.safeParse({ ...base, reason: " ".repeat(500) }).success).toBe(false);
    expect(refuse.safeParse({ ...base, reason: "x".repeat(501) }).success).toBe(false);
  });

  // Property: the staff queue exposes request metadata without an owner or run identifier.
  it("a queue item refuses email, user_id, pseudonym, owner_ref and run_ref keys", () => {
    const queue = wire("PublicationReviewQueueItemSchema");
    const valid = { review_ref: uuid, asked_at: iso, ask_ordinal: 1, categories: [category] };
    expect(queue.safeParse(valid).success).toBe(true);
    for (const key of ["email", "user_id", "pseudonym", "owner_ref", "run_ref"]) {
      expect(queue.safeParse({ ...valid, [key]: "private" }).success, key).toBe(false);
    }
  });

  // Property: the review copy omits public identity and publication metadata.
  it("the review snapshot has no public_ref, author_pseudonym or published_at", () => {
    const snapshot = wire("PublicationReviewSnapshotSchema");
    const valid = {
      question: "Should this be published?", review_ref: uuid, asked_at: iso,
      ask_ordinal: 1, categories: [category],
      answer: {
        terminal: "SERVED", verdict: null, verdict_available: false,
        confidence_band: null, summary_segments: [], badges: [], residual_objections: [],
        reversal_point: "A new fact", as_of: iso
      }
    };
    expect(snapshot.safeParse(valid).success).toBe(true);
    for (const key of ["public_ref", "author_pseudonym", "published_at"]) {
      expect(snapshot.safeParse({ ...valid, [key]: "private" }).success, key).toBe(false);
    }
  });

  // Property: audit pages mix team and review events without putting reasons or delivery state on review events.
  it("the audit page parses a team event and a review event; a review event with reason or delivery_state is refused", () => {
    const audit = wire("StaffAuditPageSchema");
    const page = { events: [teamEvent, reviewEvent], next_cursor: null, order: "RECORDED_AT_ID_ASC" };
    expect(audit.safeParse(page).success).toBe(true);
    for (const extra of [{ reason: "private" }, { delivery_state: "DELIVERED" }]) {
      expect(audit.safeParse({ ...page, events: [teamEvent, { ...reviewEvent, ...extra }] }).success).toBe(false);
    }
  });

  // Property: review is a delegable capability; generic private debate reads are forbidden.
  it("PUBLICATION_REVIEW is a capability and a delegated capability; PRIVATE_DEBATE_READ stays refused", () => {
    const capability = wire("StaffCapabilitySchema");
    const delegated = wire("DelegatedStaffCapabilitiesSchema");
    expect(capability.safeParse("PUBLICATION_REVIEW").success).toBe(true);
    expect(delegated.safeParse(["PUBLICATION_REVIEW"]).success).toBe(true);
    expect(capability.safeParse("PRIVATE_DEBATE_READ").success).toBe(false);
    expect(delegated.safeParse(["PRIVATE_DEBATE_READ"]).success).toBe(false);
  });

  // Property: each review decision is bound to its request reference and operation id.
  it("the two review intents join the action intent union with review_ref", () => {
    const intent = wire("StaffActionIntentSchema");
    for (const action of ["PUBLICATION_REVIEW_APPROVE", "PUBLICATION_REVIEW_REFUSE"]) {
      const valid = { action, review_ref: uuid, operation_id: uuid,
        ...(action === "PUBLICATION_REVIEW_REFUSE" ? { reason: "A reason" } : {}) };
      expect(intent.safeParse(valid).success, action).toBe(true);
      const { review_ref: _omitted, ...withoutRef } = valid;
      expect(intent.safeParse(withoutRef).success, action).toBe(false);
    }
  });

  // Property: requesting a review reuses PUBLISH and does not widen the run-targeted grant union.
  it("RunTargetedGrantActionSchema holds exactly PUBLISH, UNPUBLISH and DELETE_PRIVATE_DEBATE", () => {
    const action = wire("RunTargetedGrantActionSchema");
    for (const value of ["PUBLISH", "UNPUBLISH", "DELETE_PRIVATE_DEBATE"]) {
      expect(action.safeParse(value).success, value).toBe(true);
    }
    expect(action.safeParse("REQUEST_PUBLICATION_REVIEW").success).toBe(false);
  });

  // Property: answer summaries may carry a strict publication review summary.
  it("AnswerSummarySchema accepts publication_review and refuses an unknown key inside it", () => {
    const summary = wire("AnswerSummarySchema");
    const base = {
      answer_id: uuid, run_ref: uuid, answer_version: 1, question_line: "Question?",
      verdict_state: null, abstention: null, serve_state: "COMPOSED", staleness_state: "FRESH",
      builds_on_previous: false, created_at_sequence: 1
    };
    const review = { review_state: "UNDER_REVIEW", asks_used: 1, visibility: "PRIVATE" };
    const parsed = summary.safeParse({ ...base, publication_review: review });
    expect(parsed.success, parsed.success ? "" : JSON.stringify((parsed as unknown as { error: { issues: unknown } }).error.issues)).toBe(true);
    expect(summary.safeParse({ ...base, publication_review: { ...review, owner_ref: uuid } }).success).toBe(false);
  });

  // Property: the client sends the acknowledged ask to the owner route and reads its strict state.
  it("the contract client posts the ask and reads the state at /v1/runs/{id}/publication-review", async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? "GET",
        body: init?.body === undefined ? null : JSON.parse(String(init.body)) });
      const response = calls.length === 1 ? { state: "UNDER_REVIEW" } : state;
      return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const client = createContractClient("https://example.test", fetcher) as unknown as {
      requestPublicationReview(runId: string, stepUpGrant: string): Promise<unknown>;
      readPublicationReview(runId: string): Promise<unknown>;
    };
    expect(await client.requestPublicationReview(uuid, grant)).toEqual({ state: "UNDER_REVIEW" });
    expect(await client.readPublicationReview(uuid)).toEqual(state);
    expect(calls).toEqual([
      { url: `https://example.test/v1/runs/${uuid}/publication-review`, method: "POST",
        body: { step_up_grant: grant, team_read_acknowledged: true } },
      { url: `https://example.test/v1/runs/${uuid}/publication-review`, method: "GET", body: null }
    ]);
  });
});
