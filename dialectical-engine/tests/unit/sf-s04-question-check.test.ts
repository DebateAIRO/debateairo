import { describe, expect, it, vi } from "vitest";
import { createQuestionCheck } from "../../apps/api/src/question-check/check.js";
import { QuestionCheckFailure, type QuestionCheckPort } from "../../apps/api/src/question-check/transport.js";
import { readQuestionSubjects } from "../../apps/api/src/question-check/subjects.js";
import { SUPPORT_RELAY_PROVIDER_REF } from "../../apps/api/src/support/model.js";

const day = new Date("2026-10-20T12:00:00.000Z");
const marker = /DEBATEAI-FENCE-([0-9a-f]{32})/u;
type Completion = Awaited<ReturnType<QuestionCheckPort["complete"]>>;

function harness(subject = "NONE", healthy = true) {
  const entries: unknown[] = [];
  const reports: unknown[] = [];
  const state: {
    completion: (input: Parameters<QuestionCheckPort["complete"]>[0]) => Promise<Completion>;
    record: (entry: unknown) => Promise<void>;
    spent: number;
    port: QuestionCheckPort | null;
    price: { input: number; output: number } | null;
    dayPot: { ceilingMicros: number; spentMicros: () => Promise<number> } | null;
    now: Date;
    deadlineMs: number;
  } = {
    completion: async ({ packet }) => ({
      text: JSON.stringify({ call: packet.messages[1]!.content.match(marker)![1], subject, healthy }),
      usage: { inputTokens: 3, outputTokens: 4 }
    }),
    record: async entry => { entries.push(entry); },
    spent: 0,
    port: null,
    price: { input: 1, output: 2 },
    dayPot: null,
    now: day,
    deadlineMs: 10
  };
  const port: QuestionCheckPort = {
    providerRef: SUPPORT_RELAY_PROVIDER_REF, modelId: "claude-haiku-5-5",
    complete: input => state.completion(input)
  };
  state.port = port;
  const create = () => createQuestionCheck({
    subjects: readQuestionSubjects(), port: () => state.port, deadlineMs: state.deadlineMs, price: state.price,
    spend: { record: entry => state.record(entry) },
    dayPot: state.dayPot, clock: () => state.now,
    report: line => { reports.push(line); }
  });
  return { state, entries, reports, create, port };
}

describe("S04 question check", () => {
  // Property (V, 2026-10-28): the subject and whether the question is healthy decide the outcome; a help-numbers
  // subject shows help numbers whatever the model says about health, so a crisis question never starts a debate.
  it.each([
    ["NONE", true, { outcome: "PASS" }],
    ["DRUGS", true, { outcome: "PASS" }],
    ["DRUGS", false, { outcome: "REFUSE", kind: "DRUGS", screen: "REFUSE", emergencyNumber: false }],
    ["HARM_TO_OTHERS", false, { outcome: "REFUSE", kind: "HARM_TO_OTHERS", screen: "REFUSE", emergencyNumber: true }],
    ["HARM_TO_OTHERS", true, { outcome: "PASS" }],
    ["CRIME", false, { outcome: "REFUSE", kind: "CRIME", screen: "REFUSE", emergencyNumber: false }],
    ["SUICIDE_AND_ASSISTED_DYING", false, { outcome: "REFUSE", kind: "SUICIDE_AND_ASSISTED_DYING", screen: "SENSITIVE", emergencyNumber: false }],
    ["SUICIDE_AND_ASSISTED_DYING", true, { outcome: "PASS" }],
    ["OWN_CRISIS", false, { outcome: "CRISIS" }],
    ["OWN_CRISIS", true, { outcome: "CRISIS" }],
    ["SUICIDE_METHODS", true, { outcome: "CRISIS" }]
  ] as const)("maps subject %s with healthy %s to the exact outcome", async (subject, healthy, expected) => {
    const h = harness(subject, healthy);
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
    const started = performance.now();
    await expect(h.create().check("line")).resolves.toEqual({ outcome: "UNAVAILABLE", code });
    if (code === "QUESTION_CHECK_DEADLINE") expect(performance.now() - started).toBeLessThan(250);
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

  it("retries a latched spend writer after five minutes and closes the breaker on a recorded check", async () => {
    // Property: a transient spend outage does not keep all later questions unavailable until restart.
    // Mutant: keep the breaker latched forever; changing the provider model is a neighbour.
    const h = harness();
    let records = 0;
    h.state.record = async () => {
      records++;
      if (records === 1) throw Object.assign(new Error("writer down"), { code: "42501" });
    };
    const check = h.create();
    await expect(check.check("first")).resolves.toEqual({ outcome: "PASS" });
    h.state.now = new Date(day.getTime() + 299_999);
    await expect(check.check("before retry")).resolves.toEqual({ outcome: "UNAVAILABLE", code: "QUESTION_CHECK_SPEND_RECORD_DOWN" });
    expect(records).toBe(1);
    h.state.now = new Date(day.getTime() + 300_000);
    await expect(check.check("retry")).resolves.toEqual({ outcome: "PASS" });
    await expect(check.check("after recovery")).resolves.toEqual({ outcome: "PASS" });
    expect(records).toBe(3);
  });

  it("opens the breaker again when the five-minute retry still cannot record", async () => {
    // Property: a failed half-open trial must not send every subsequent question to a known-down writer.
    const h = harness();
    let records = 0;
    h.state.record = async () => {
      records++;
      if (records === 1) throw Object.assign(new Error("writer down"), { code: "42501" });
      throw new Error("retry failed");
    };
    const check = h.create();
    await check.check("first");
    h.state.now = new Date(day.getTime() + 300_000);
    await check.check("retry");
    h.state.now = new Date(day.getTime() + 300_001);
    await expect(check.check("after failed retry")).resolves.toEqual({
      outcome: "UNAVAILABLE", code: "QUESTION_CHECK_SPEND_RECORD_DOWN"
    });
    expect(records).toBe(2);
  });

  it.each(["day pot", "spend writer"] as const)("bounds a slow %s by the same D4 deadline", async part => {
    // Property: no awaited part of the check keeps the ask past D4.
    // Mutant: await this part outside the race; changing the question wording is a neighbour.
    const h = harness();
    h.state.deadlineMs = 20;
    const slow = () => new Promise<void>(resolve => setTimeout(resolve, 200));
    if (part === "day pot") h.state.dayPot = { ceilingMicros: 100, spentMicros: async () => { await slow(); return 0; } };
    else h.state.record = async () => { await slow(); };
    const started = performance.now();
    await expect(h.create().check("deadline probe")).resolves.toEqual({ outcome: "UNAVAILABLE", code: "QUESTION_CHECK_DEADLINE" });
    expect(performance.now() - started).toBeLessThan(120);
  });

  it("reports the final deadline code when a slow spend follows an unusable answer", async () => {
    // Property: the one unavailable log names the outcome returned to the caller.
    // Mutant: report ANSWER_NOT_JSON before the spend await; changing the day is a neighbour.
    const h = harness();
    h.state.deadlineMs = 20;
    h.state.completion = async () => ({ text: "not json" });
    h.state.record = async () => { await new Promise(resolve => setTimeout(resolve, 200)); };
    await expect(h.create().check("line")).resolves.toEqual({ outcome: "UNAVAILABLE", code: "QUESTION_CHECK_DEADLINE" });
    expect(h.reports).toEqual([{ event: "api.question_check.unavailable", code: "QUESTION_CHECK_DEADLINE" }]);
  });

  it("records one priced entry per sent call with adapter token counts", async () => {
    const h = harness();
    const check = h.create();
    await check.check("line");
    await check.check("second line");
    expect(h.entries).toHaveLength(2);
    expect(h.entries[0]).toMatchObject({
      providerRef: "question-check:development:claude-haiku-5.5:claude-haiku-5-5",
      chargedOn: "2026-10-20", chargeMicros: 1, inputTokens: 3, outputTokens: 4
    });
    expect((h.entries[0] as { spendId: string }).spendId).toBeTruthy();
    expect((h.entries[1] as { spendId: string }).spendId)
      .not.toBe((h.entries[0] as { spendId: string }).spendId);
  });

  it("records a projected maximum when usage is absent", async () => {
    const h = harness();
    h.state.completion = async ({ packet }) => ({
      text: JSON.stringify({ call: packet.messages[1]!.content.match(marker)![1], subject: "NONE", healthy: true })
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
