import { describe,expect,it } from "vitest";
import {
  parseSupportCaseSummaryDraft,
  parseSupportDraft,
  validateSupportDraft
} from "../../apps/api/src/support/response-policy.js";

function raw(text: string, overrides: Readonly<Record<string,unknown>> = {}): string {
  return JSON.stringify({
    kind: "answer",
    text,
    sourceIds: ["getting-started-debate"],
    actionIds: ["start-debate"],
    ...overrides
  });
}

describe("CP1 support model response policy", () => {
  it("accepts an exact bounded draft and preserves benign public identifiers", () => {
    const parsed = parseSupportDraft(raw(
      "Try again at 14:30 on 2026-09-14 and quote public error SUPPORT_MODEL_UNAVAILABLE."
    ));
    expect(parsed).toEqual({
      kind: "answer",
      text: "Try again at 14:30 on 2026-09-14 and quote public error SUPPORT_MODEL_UNAVAILABLE.",
      sourceIds: ["getting-started-debate"],
      actionIds: ["start-debate"]
    });
    expect(validateSupportDraft(
      parsed!,["getting-started-debate"],["start-debate"]
    )).toEqual(parsed);
  });

  it.each([
    ["raw text", "Open the debate page."],
    ["malformed JSON", "{"],
    ["oversized JSON", raw("a".repeat(8_001))],
    ["extra key", raw("Open the debate page.",{ href: "/new" })],
    ["wrong kind", raw("Open the debate page.",{ kind: "tool" })],
    ["raw URL", raw("Open https://example.test/reset")],
    ["protocol-relative URL", raw("Open //example.test/reset")],
    ["percent-encoded HTTPS URL", raw("Open https%3A%2F%2Fexample.test/reset")],
    ["percent-encoded path", raw("Open %2Fsettings")],
    ["double-encoded path", raw("Open %252Fsettings")],
    ["path instruction", raw("Go to /settings to continue")],
    ["Markdown link", raw("Use [this link](/new)")],
    ["HTML", raw("Choose <a href='/new'>Start</a>")],
    ["credential request", raw("Type your password here so I can check it")],
    ["Romanian credential request", raw("Trimite parola și codul de verificare aici")],
    ["grouped code", raw("Your recovery code is 123-456")],
    ["control-obfuscated code", raw("Enter your c\u200Bode 123456")],
    ["secret echo", raw("Use sk-test-secret-value")],
    ["false reset claim", raw("I reset your password successfully")]
  ])("rejects %s before validation", (_name,value) => {
    expect(parseSupportDraft(value)).toBeNull();
  });

  it("accepts only the exact purpose-specific advisory summary envelope", () => {
    expect(parseSupportCaseSummaryDraft(JSON.stringify({
      kind: "case_summary",text: "The visitor needs help understanding debate creation.",
      sourceIds: [],actionIds: []
    }))).toEqual({
      kind: "case_summary",text: "The visitor needs help understanding debate creation.",
      sourceIds: [],actionIds: []
    });
    expect(parseSupportCaseSummaryDraft(JSON.stringify({
      kind: "case_summary",text: "The visitor needs help.",sourceIds: [],actionIds: [],extra: true
    }))).toBeNull();
    expect(parseSupportCaseSummaryDraft(JSON.stringify({
      kind: "case_summary",text: "The visitor needs help.",
      sourceIds: ["getting-started-debate"],actionIds: []
    }))).toBeNull();
  });

  it.each([
    "Open //example.test/reset",
    "Open https%3A%2F%2Fexample.test/reset",
    "Open %2Fsettings",
    "Your password is hunter2",
    "I reset the visitor password successfully",
    "Choose <a href='/new'>Start</a>",
    "Use [this link](/new)"
  ])("rejects unsafe advisory summary text before sealing: %s", (text) => {
    expect(parseSupportCaseSummaryDraft(JSON.stringify({
      kind: "case_summary",text,sourceIds: [],actionIds: []
    }))).toBeNull();
  });

  it.each([
    ["forged source", ["forged"], ["start-debate"]],
    ["unrequested action", ["getting-started-debate"], ["settings"]],
    ["missing source", [], ["start-debate"]],
    ["duplicate source", ["getting-started-debate","getting-started-debate"], ["start-debate"]]
  ])("rejects %s", (_name,sourceIds,actionIds) => {
    const parsed = parseSupportDraft(raw("Open the debate page.",{ sourceIds,actionIds }));
    expect(parsed).not.toBeNull();
    expect(validateSupportDraft(
      parsed!,["getting-started-debate"],["start-debate"]
    )).toBeNull();
  });
});
