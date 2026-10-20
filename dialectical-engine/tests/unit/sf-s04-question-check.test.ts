import { describe, expect, it, vi } from "vitest";
import { createQuestionCheck } from "../../apps/api/src/question-check/check.js";
import { QuestionCheckFailure, type QuestionCheckPort } from "../../apps/api/src/question-check/transport.js";
import type { QuestionCheckLabel } from "../../apps/api/src/question-check/contract.js";

const day = new Date("2026-10-20T12:00:00.000Z");
const marker = /DEBATEAI-FENCE-([0-9a-f]{32})/u;
type Completion = Awaited<ReturnType<QuestionCheckPort["complete"]>>;

function harness(label: QuestionCheckLabel = "ORDINARY") {
  const entries: unknown[] = [];
  const reports: unknown[] = [];
  const state: {
    completion: (input: Parameters<QuestionCheckPort["complete"]>[0]) => Promise<Completion>;
    record: (entry: unknown) => Promise<void>;
    spent: number;
    port: QuestionCheckPort | null;
    price: { input: number; output: number } | null;
    dayPot: { ceilingMicros: number; spentMicros: () => Promise<number> } | null;
  } = {
    completion: async ({ packet }) => ({
      text: JSON.stringify({ call: packet.messages[1]!.content.match(marker)![1], label }),
      usage: { inputTokens: 3, outputTokens: 4 }
    }),
    record: async entry => { entries.push(entry); },
    spent: 0,
    port: null,
    price: { input: 1, output: 2 },
    dayPot: null
  };
  const port: QuestionCheckPort = {
    providerRef: "anthropic-test", modelId: "claude-haiku-5-5",
    complete: input => state.completion(input)
  };
  state.port = port;
  const create = () => createQuestionCheck({
    port: () => state.port, deadlineMs: 10, price: state.price,
    spend: { record: entry => state.record(entry) },
    dayPot: state.dayPot, clock: () => day,
    report: line => { reports.push(line); }
  });
  return { state, entries, reports, create, port };
}

describe("S04 question check", () => {
  it.each([
    ["OWN_CRISIS", { outcome: "CRISIS" }],
    ["METHODS_OR_ENCOURAGEMENT", { outcome: "CRISIS" }],
    ["HARM_TO_OTHERS", { outcome: "REFUSE", kind: "HARM_TO_OTHERS", kept: true }],
    ["WEAPONS_DRUGS_TERRORISM", { outcome: "REFUSE", kind: "WEAPONS_DRUGS_TERRORISM", kept: true }],
    ["HATE_SPEECH", { outcome: "REFUSE", kind: "HATE_SPEECH", kept: false }],
    ["RELIGIOUS_INSULT", { outcome: "REFUSE", kind: "RELIGIOUS_INSULT", kept: false }],
    ["SENSITIVE_TOPIC", { outcome: "REFUSE", kind: "SENSITIVE_TOPIC", kept: false }],
    ["ORDINARY", { outcome: "PASS" }]
  ] as const)("maps label %s to the exact outcome", async (label, expected) => {
    const h = harness(label);
    await expect(h.create().check("line")).resolves.toEqual(expected);
    expect(h.entries).toHaveLength(1);
  });

  it.each([
    "QUESTION_CHECK_NOT_CONFIGURED",
    "QUESTION_CHECK_DOOR_REFUSED",
    "QUESTION_CHECK_TRANSPORT_FAILED",
    "QUESTION_CHECK_HTTP_STATUS",
    "QUESTION_CHECK_DEADLINE",
    "QUESTION_CHECK_ANSWER_NOT_JSON",
    "QUESTION_CHECK_ANSWER_SCHEMA",
    "QUESTION_CHECK_BUDGET_REFUSED"
  ] as const)("returns UNAVAILABLE for %s", async code => {
    const h = harness();
    if (code === "QUESTION_CHECK_NOT_CONFIGURED") h.state.port = null;
    else if (code === "QUESTION_CHECK_BUDGET_REFUSED") {
      h.state.dayPot = { ceilingMicros: 40, spentMicros: async () => 40 };
    } else if (code === "QUESTION_CHECK_ANSWER_NOT_JSON") {
      h.state.completion = async () => ({ text: "not json" });
    } else if (code === "QUESTION_CHECK_ANSWER_SCHEMA") {
      h.state.completion = async () => ({ text: '{"call":"bad","label":"ORDINARY"}' });
    } else if (code === "QUESTION_CHECK_DEADLINE") {
      h.state.completion = async ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new QuestionCheckFailure("QUESTION_CHECK_DEADLINE")), { once: true });
      });
    } else h.state.completion = async () => { throw new QuestionCheckFailure(code); };
    await expect(h.create().check("line")).resolves.toEqual({ outcome: "UNAVAILABLE", code });
    expect(h.reports).toContainEqual({ event: "api.question_check.unavailable", code });
    expect(h.entries).toHaveLength(code === "QUESTION_CHECK_NOT_CONFIGURED" || code === "QUESTION_CHECK_BUDGET_REFUSED" ? 0 : 1);
  });

  it("latches after SQLSTATE 42501 or three consecutive record failures", async () => {
    const h = harness();
    let sent = 0;
    const original = h.state.completion;
    h.state.completion = input => { sent++; return original(input); };
    h.state.record = async () => { throw Object.assign(new Error("db"), { code: "42501" }); };
    const check = h.create();
    await expect(check.check("first")).resolves.toEqual({ outcome: "PASS" });
    await expect(check.check("second")).resolves.toEqual({ outcome: "UNAVAILABLE", code: "QUESTION_CHECK_SPEND_RECORD_DOWN" });
    expect(sent).toBe(1);

    const streak = harness();
    let sends = 0;
    let records = 0;
    const complete = streak.state.completion;
    streak.state.completion = input => { sends++; return complete(input); };
    streak.state.record = async () => {
      records++;
      if (records !== 2) throw new Error("temporary record outage");
    };
    const retryingCheck = streak.create();
    for (let call = 0; call < 5; call++) {
      await expect(retryingCheck.check(`call ${call}`)).resolves.toEqual({ outcome: "PASS" });
    }
    await expect(retryingCheck.check("after three in a row")).resolves.toEqual({
      outcome: "UNAVAILABLE", code: "QUESTION_CHECK_SPEND_RECORD_DOWN"
    });
    expect(sends).toBe(5);
  });

  it("records one priced entry per sent call with adapter token counts", async () => {
    const h = harness();
    const check = h.create();
    await check.check("line");
    await check.check("second line");
    expect(h.entries).toHaveLength(2);
    expect(h.entries[0]).toMatchObject({
      providerRef: "question-check:anthropic-test:claude-haiku-5-5",
      chargedOn: "2026-10-20", chargeMicros: 1, inputTokens: 3, outputTokens: 4
    });
    expect((h.entries[0] as { spendId: string }).spendId).toBeTruthy();
    expect((h.entries[1] as { spendId: string }).spendId)
      .not.toBe((h.entries[0] as { spendId: string }).spendId);
  });

  it("records a projected maximum when usage is absent", async () => {
    const h = harness();
    h.state.completion = async ({ packet }) => ({
      text: JSON.stringify({ call: packet.messages[1]!.content.match(marker)![1], label: "ORDINARY" })
    });
    await h.create().check("💡");
    expect(h.entries).toHaveLength(1);
    expect(h.entries[0]).toMatchObject({ outputTokens: 16000 });
    expect((h.entries[0] as { inputTokens: number }).inputTokens).toBeGreaterThan(0);
    expect((h.entries[0] as { chargeMicros: number }).chargeMicros).toBeGreaterThan(0);
  });

  it("reports one code when spend recording fails and keeps the outcome", async () => {
    const h = harness();
    h.state.record = async () => { throw new Error("db"); };
    await expect(h.create().check("line")).resolves.toEqual({ outcome: "PASS" });
    expect(h.reports).toEqual([{ event: "api.question_check.spend_unrecorded", code: "QUESTION_CHECK_SPEND_RECORD_DOWN" }]);
  });

  it("reports only event and code, with no question or label", async () => {
    const h = harness("HATE_SPEECH");
    h.state.record = async () => { throw new Error("db"); };
    h.state.completion = async () => { throw new QuestionCheckFailure("QUESTION_CHECK_TRANSPORT_FAILED"); };
    await h.create().check("secret question phrase");
    expect(h.reports).toHaveLength(2);
    for (const line of h.reports) {
      expect(Object.keys(line as object).sort()).toEqual(["code", "event"]);
      expect(JSON.stringify(line)).not.toMatch(/secret question phrase|HATE_SPEECH/u);
    }
  });
});
