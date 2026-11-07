// tests/unit/purpose-lines-ask.test.ts
// R22 decision 5: the ask's structured place, time and purpose lines: stored at the ask for a new debate, read by the question check when
// the question does not already say them, none for a dig, and the ask stands whatever the store says. Data is made up.
import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import type { AskRequest, PurposeLines } from "@debateai/contract";
import { questionWithPurposeLines, recordPurposeLinesAtAsk, type PurposeLinesPort } from "../../apps/api/src/purpose-lines.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const IDENTITY = testHttpIdentity("purpose-lines-ask");
const LINES: PurposeLines = { place: "This is about Harbour Town.", purpose: "I need this to make a decision." };
const ask = { question_line: "Should the town build a second pier?", risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker-declaration:test",
  composition_budget_tier: "low", plan_tier: "free", depth_params: { depth: 1 }, decision_scope: "test-layer scope", as_of: "2026-08-07T00:00:00.000Z",
  steering_presets: [], steering_annotations: [] };

function apiOver(record: PurposeLinesPort["record"]) {
  const checked: string[] = [];
  const stored: unknown[] = [];
  const submitted: AskRequest[] = [];
  const application = { submit: async (request: AskRequest) => { submitted.push(request); return { run_ref: RUN_ID, status: "QUEUED" as const }; } } as unknown as AskApplication;
  const api = buildApi({ application, questionCheck: { check: async (text: string) => { checked.push(text); return { outcome: "PASS" as const }; } } as never,
    sessions: testSessionApplication([IDENTITY]), allowedOrigin: TEST_APP_ORIGIN,
    purposeLines: { record: async (ownerRef: string, runId: string, lines: PurposeLines) => { stored.push([ownerRef, runId, lines]); return record(ownerRef, runId, lines); } } } as never);
  return { api, checked, stored, submitted };
}
const headers = testSessionHeaders(IDENTITY, true);

describe("the ask stores the lines", () => {
  it("a new debate's lines are stored under its run, and the check reads them with the question", async () => {
    const { api, checked, stored } = apiOver(async () => "RECORDED");
    const response = await api.inject({ method: "POST", url: "/v1/asks", headers, payload: { ...ask, purpose_lines: LINES } });
    expect(response.statusCode).toBe(202);
    expect(stored).toEqual([[expect.any(String), RUN_ID, LINES]]);
    expect(checked).toEqual([`${ask.question_line}\n\n${LINES.place!}\n${LINES.purpose!}`]);
    await api.close();
  });
  it("an ask without them is as before: nothing stored, the question checked alone", async () => {
    const { api, checked, stored } = apiOver(async () => "RECORDED");
    expect((await api.inject({ method: "POST", url: "/v1/asks", headers, payload: ask })).statusCode).toBe(202);
    expect(stored).toEqual([]);
    expect(checked).toEqual([ask.question_line]);
    await api.close();
  });
  it("the ask stands when the store fails, and the failure is logged by code, never the words", async () => {
    const { api, stored } = apiOver(async () => { throw new Error(LINES.place!); });
    expect((await api.inject({ method: "POST", url: "/v1/asks", headers, payload: { ...ask, purpose_lines: LINES } })).statusCode).toBe(202);
    expect(stored).toHaveLength(1);
    await api.close();
    const logged: string[] = [];
    expect(await recordPurposeLinesAtAsk({ ownerRef: "o", runId: RUN_ID, lines: LINES }, { record: async () => { throw new Error(LINES.place!); } },
      (line) => logged.push(line))).toBe("FAILED");
    expect(logged).toEqual([JSON.stringify({ kind: "DEBATEAI_PURPOSE_LINES", code: "PURPOSE_LINES_FAILED" })]);
  });
  it("a line the question already says is not checked twice", () => {
    const line = `${ask.question_line}\n\n${LINES.place!}`;
    expect(questionWithPurposeLines(line, LINES)).toBe(`${line}\n\n${LINES.purpose!}`);
    expect(questionWithPurposeLines(line, { place: LINES.place! })).toBe(line);
    expect(questionWithPurposeLines(line, undefined)).toBe(line);
  });
  it("decision 29: the answers in the question reach the debate and the check as one text, and the structured copy is stored beside it, nothing checked twice", async () => {
    const { api, checked, stored, submitted } = apiOver(async () => "RECORDED");
    const answered: PurposeLines = { answers: [{ question: "Which town?", answer: "Harbour Town" }], matters: "the cost", angles: ["fishing jobs"] };
    const line = `${ask.question_line}\n\nWhich town? Harbour Town.\nWhat matters most to me: the cost\nPlease also look at: fishing jobs.`;
    expect((await api.inject({ method: "POST", url: "/v1/asks", headers, payload: { ...ask, question_line: line, purpose_lines: answered } })).statusCode).toBe(202);
    expect(submitted[0]!.question_line).toBe(line);
    expect(checked).toEqual([line]);
    expect(stored).toEqual([[expect.any(String), RUN_ID, answered]]);
    await api.close();
  });
  // Review of V4 start step Task 50b (owner, 4 Nov, "Goal in answer": "Always say it"): the page marks the answer to "What do you care
  // about most?" (`cares: true`); the run reads a stated goal from that mark alone, so the ask keeps it as sent. The check reads the
  // same text as for an unmarked answer: the mark is never words.
  it("Task 50b: the care answer's mark is stored as sent, and the check reads the same text as without it", async () => {
    const marked: PurposeLines = { answers: [{ question: "Which town?", answer: "Harbour Town" },
      { question: "What do you care about most?", answer: "Keeping bills low", cares: true }] };
    const unmarked: PurposeLines = { answers: marked.answers!.map(({ question, answer }) => ({ question, answer })) };
    const line = `${ask.question_line}\n\nWhich town? Harbour Town.\nWhat I care about is: keeping bills low.`;
    const withMark = apiOver(async () => "RECORDED");
    expect((await withMark.api.inject({ method: "POST", url: "/v1/asks", headers, payload: { ...ask, question_line: line, purpose_lines: marked } }))
      .statusCode).toBe(202);
    expect(withMark.stored).toEqual([[expect.any(String), RUN_ID, marked]]);
    expect(withMark.submitted[0]!.purpose_lines).toEqual(marked);
    await withMark.api.close();
    const without = apiOver(async () => "RECORDED");
    expect((await without.api.inject({ method: "POST", url: "/v1/asks", headers, payload: { ...ask, question_line: line, purpose_lines: unmarked } }))
      .statusCode).toBe(202);
    expect(without.stored).toEqual([[expect.any(String), RUN_ID, unmarked]]);
    expect(withMark.checked).toEqual(without.checked);
    await without.api.close();
    // Only `true` marks an answer; anything else is refused at the door, as any malformed line is.
    const refused = apiOver(async () => "RECORDED");
    const bad = { answers: [{ question: "What do you care about most?", answer: "Keeping bills low", cares: "yes" }] };
    expect((await refused.api.inject({ method: "POST", url: "/v1/asks", headers, payload: { ...ask, purpose_lines: bad } })).statusCode).toBe(400);
    expect(refused.stored).toEqual([]);
    await refused.api.close();
  });
  it("decision 29: a line sent beside the question and not in it is still judged by the check", async () => {
    const { api, checked } = apiOver(async () => "RECORDED");
    await api.inject({ method: "POST", url: "/v1/asks", headers, payload: { ...ask, purpose_lines: { angles: ["a line the question does not say"] } } });
    expect(checked).toEqual([`${ask.question_line}\n\na line the question does not say`]);
    await api.close();
  });
});
