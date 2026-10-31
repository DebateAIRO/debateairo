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
});
