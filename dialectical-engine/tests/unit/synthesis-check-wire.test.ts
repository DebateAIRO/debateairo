import { describe, expect, it } from "vitest";
import {
  AnswerSummarySchema,
  PublicDebateSummarySchema,
  RunProjectionSchema,
  DEBATE_REMOVED_BY_CHECK,
  PUBLICATION_APPROVAL_REQUIRED,
  RemovalNoticeTakeSchema,
  SYNTHESIS_CHECK_CATEGORIES,
  SYNTHESIS_CHECK_CATEGORY_WORDS,
  SynthesisCheckHoldSchema,
  SynthesisFlagSchema,
  removesDebate
} from "../../packages/contract/src/index.js";
import { createContractClient } from "../../packages/contract/src/client.js";

const answer = {
  answer_id: "answer-1", run_ref: "run-1", answer_version: 1,
  question_line: "A question", verdict_state: null, abstention: null,
  serve_state: "COMPOSED", staleness_state: "FRESH",
  builds_on_previous: false, created_at_sequence: 1
};

describe("the synthesis check's closed public wire", () => {
  it("AnswerSummarySchema accepts synthesis_flag {verdict: FLAGGED} and null, and refuses crisis_help, any other verdict or an extra key", () => {
    expect(AnswerSummarySchema.safeParse({ ...answer, synthesis_flag: { verdict: "FLAGGED" } }).success).toBe(true);
    expect(AnswerSummarySchema.safeParse({ ...answer, synthesis_flag: null }).success).toBe(true);
    expect(AnswerSummarySchema.safeParse({ ...answer, synthesis_flag: { verdict: "FLAGGED", crisis_help: true } }).success).toBe(false);
    expect(AnswerSummarySchema.safeParse({ ...answer, synthesis_flag: { verdict: "CLEAR" } }).success).toBe(false);
    expect(SynthesisFlagSchema.safeParse({ verdict: "FLAGGED", extra: true }).success).toBe(false);
  });

  it("PublicDebateSummarySchema's key set is exactly the 27e21e5e1 set", () => {
    expect(Object.keys(PublicDebateSummarySchema.shape)).toEqual([
      "public_ref", "author_pseudonym", "question", "published_at", "models",
      "verdict", "confidence_band", "floor_verdict"
    ]);
  });

  it("the four category words are V's, character for character", () => {
    expect(SYNTHESIS_CHECK_CATEGORIES).toEqual([
      "TERRORISM", "HATE_SPEECH", "SUICIDE_OR_HARM_TO_OTHERS", "WEAPONS_OR_DRUGS"
    ]);
    expect(SYNTHESIS_CHECK_CATEGORY_WORDS).toEqual({
      TERRORISM: "Possible terrorism",
      HATE_SPEECH: "hate speech of any kind",
      SUICIDE_OR_HARM_TO_OTHERS: "tendencies to suicide or harming other people",
      WEAPONS_OR_DRUGS: "crafting weapons or drugs"
    });
    expect(DEBATE_REMOVED_BY_CHECK).toBe("DEBATE_REMOVED_BY_CHECK");
    expect(PUBLICATION_APPROVAL_REQUIRED).toBe("PUBLICATION_APPROVAL_REQUIRED");
  });

  it("AnswerSummarySchema and RunProjectionSchema accept synthesis_check CHECKING and refuse any other value; RemovalNoticeTakeSchema is exactly {notice: boolean}; removesDebate is true only for FLAGGED with SUICIDE_OR_HARM_TO_OTHERS", () => {
    expect(AnswerSummarySchema.safeParse({ ...answer, synthesis_check: "CHECKING" }).success).toBe(true);
    expect(AnswerSummarySchema.safeParse({ ...answer, synthesis_check: null }).success).toBe(false);
    expect(AnswerSummarySchema.safeParse({ ...answer, synthesis_check: "DONE" }).success).toBe(false);
    const run = { run_ref: "run-1", question_line: "A question", state: "SETTLED",
      terminal_reason: null, hold_until: null };
    expect(RunProjectionSchema.safeParse({ ...run, synthesis_check: "CHECKING" }).success).toBe(true);
    expect(RunProjectionSchema.safeParse({ ...run, synthesis_check: null }).success).toBe(false);
    expect(RunProjectionSchema.safeParse({ ...run, synthesis_check: "DONE" }).success).toBe(false);
    expect(SynthesisCheckHoldSchema.safeParse("CHECKING").success).toBe(true);
    expect(RemovalNoticeTakeSchema.safeParse({ notice: true }).success).toBe(true);
    expect(RemovalNoticeTakeSchema.safeParse({ notice: false, extra: true }).success).toBe(false);
    expect(removesDebate({ verdict: "FLAGGED", categories: ["SUICIDE_OR_HARM_TO_OTHERS"] })).toBe(true);
    expect(removesDebate({ verdict: "FLAGGED", categories: ["TERRORISM"] })).toBe(false);
    expect(removesDebate({ verdict: "CLEAR", categories: [] })).toBe(false);
  });

  it("takeRemovalNotice posts to /v1/account/removal-notice/take and parses {notice}", async () => {
    const seen: Array<{ url: string; method: string | undefined }> = [];
    const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), method: init?.method });
      return new Response(JSON.stringify({ notice: true }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;
    const client = createContractClient("https://contract.example", fetchMock);
    expect(await client.takeRemovalNotice()).toEqual({ notice: true });
    expect(seen).toEqual([{ url: "https://contract.example/v1/account/removal-notice/take", method: "POST" }]);
  });
});
