import { describe,expect,it } from "vitest";
import {
  diagnoseSupportDraft,
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
  it("reports a closed secret-safe rejection shape without completion bytes or identifiers", () => {
    const completion = JSON.stringify({
      kind: "answer",
      text: "Open https%3A%2F%2Finvalid.example with password hunter2",
      sourceIds: ["forged-source"],
      actionIds: ["forged-action"]
    });

    const diagnostic = diagnoseSupportDraft(
      completion,["getting-started-debate"],["start-debate"]
    );

    expect(diagnostic).toEqual({
      code: "TEXT_LINK_OR_MARKUP",
      jsonValid: true,
      fenced: false,
      exactKeys: true,
      kindValid: true,
      textCodePoints: 56,
      sourceIdCount: 1,
      allowedSourceIdCount: 0,
      actionIdCount: 1,
      allowedActionIdCount: 0
    });
    expect(Object.isFrozen(diagnostic)).toBe(true);
    expect(JSON.stringify(diagnostic)).not.toContain("hunter2");
    expect(JSON.stringify(diagnostic)).not.toContain("forged-source");
    expect(JSON.stringify(diagnostic)).not.toContain("forged-action");
  });

  it("distinguishes syntax, exact-key, provenance, and accepted producer results", () => {
    const allowedSources = ["getting-started-debate"];
    const allowedActions = ["start-debate"] as const;
    expect(diagnoseSupportDraft("```json\n{}\n```",allowedSources,allowedActions))
      .toMatchObject({ code: "JSON_INVALID",jsonValid: false,fenced: true });
    expect(diagnoseSupportDraft(raw("Open the debate page.",{ extra: true }),allowedSources,allowedActions))
      .toMatchObject({ code: "KEY_SET_INVALID",jsonValid: true,exactKeys: false });
    expect(diagnoseSupportDraft(raw("Open the debate page.",{
      sourceIds: ["forged-source"]
    }),allowedSources,allowedActions)).toMatchObject({
      code: "SOURCE_MEMBERSHIP_INVALID",allowedSourceIdCount: 0
    });
    expect(diagnoseSupportDraft(raw("Open the debate page."),allowedSources,allowedActions))
      .toMatchObject({ code: "ACCEPTED",allowedSourceIdCount: 1,allowedActionIdCount: 1 });
  });

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
