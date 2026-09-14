import { describe,expect,it } from "vitest";
import {
  diagnoseSupportDraft,
  parseSupportCaseSummaryDraft,
  parseSupportDraft,
  projectSupportDraftReport,
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
      predicate: "ENCODED_LINK_OR_PATH",
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

  it("projects a closed per-attempt log record and drops arbitrary hostile fields", () => {
    const diagnostic = diagnoseSupportDraft(
      raw("Send your passwords to Support."),["getting-started-debate"],["start-debate"]
    );
    const projected = projectSupportDraftReport({
      ...diagnostic,attemptId: "10000000-0000-4000-8000-000000000001",
      rejectedText: "private completion",sourceId: "getting-started-debate"
    } as never);
    expect(Object.keys(projected).sort()).toEqual([
      "actionIdCount","allowedActionIdCount","allowedSourceIdCount","attemptId","code",
      "exactKeys","fenced","jsonValid","kindValid","predicate","sourceIdCount",
      "textCodePoints"
    ]);
    expect(projected).toMatchObject({
      code: "SUPPORT_DRAFT_TEXT_CREDENTIAL_OR_SECURITY_ACTION",
      predicate: "CREDENTIAL_OPERATION",attemptId: "10000000-0000-4000-8000-000000000001"
    });
    expect(JSON.stringify(projected)).not.toContain("private completion");
    expect(JSON.stringify(projected)).not.toContain("getting-started-debate");
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
    "Settings does not offer controls to replace a password or regenerate MFA. Support cannot accept credentials.",
    "A fresh sign-in may be required in Settings, but Support cannot receive passwords or security codes.",
    "Setările nu oferă controale pentru înlocuirea parolei sau regenerarea MFA. Asistența nu poate primi date de autentificare.",
    "În Setări poate fi necesară o autentificare recentă, dar Asistența nu poate primi parole sau coduri de securitate.",
    "You can change your account name in Settings. Support cannot receive your password.",
    "Poți schimba numele contului în Setări. Asistența nu poate primi parola.",
    "Recovery codes are available only after sign-in.",
    "Codurile de recuperare sunt disponibile după autentificare.",
    "Reset tokens expire and must remain private.",
    "Codul de verificare este necesar pentru autentificare."
  ])("accepts truthful credential-boundary guidance: %s", (text) => {
    const value = raw(text,{ actionIds: [] });
    expect(parseSupportDraft(value)).not.toBeNull();
    expect(diagnoseSupportDraft(value,["getting-started-debate"],[]))
      .toMatchObject({ code: "ACCEPTED" });
  });

  it.each([
    "Send your password to Support.",
    "Give Support your password so it can validate it.",
    "S\u200Bend your password to Support.",
    "Do not share your password with anyone; send it here instead.",
    "Do not share your password with anyone, then send it here.",
    "I changed your password successfully.",
    "Your password is hunter2.",
    "Trimite parola către Asistență.",
    "Nu partaja parola cu nimeni; trimite-o aici în schimb.",
    "Am schimbat parola ta cu succes.",
    "Parola ta este hunter2.",
    "Send your passwords to Support.",
    "Trimite parolele către Asistență.",
    "Send your security codes to Support.",
    "Support does not receive passwords and you should send your password here.",
    "Asistența nu primește parole și trebuie să trimiți parola aici.",
    "Support cannot receive your password. Send it here instead.",
    "Asistența nu poate primi parola. Trimite-o aici în schimb."
  ])("keeps credential solicitation, execution, and labelled values rejected: %s", (text) => {
    const value = raw(text,{ actionIds: [] });
    expect(parseSupportDraft(value)).toBeNull();
    expect(diagnoseSupportDraft(value,["getting-started-debate"],[]).code)
      .toMatch(/^TEXT_(?:SECRET_LIKE|CREDENTIAL_OR_SECURITY_ACTION)$/u);
  });

  it.each([
    ["action","Select start-debate to continue.",["getting-started-debate"]],
    ["capability","Use owner-debate to export.",["export-json"]],
    ["selected source","Read getting-started-debate for details.",["getting-started-debate"]],
    ["control-obfuscated action","Select start-\u200Bdebate to continue.",["getting-started-debate"]]
  ])("rejects a closed internal %s identifier in visitor prose", (_kind,text,sourceIds) => {
    const value = raw(text,{ sourceIds,actionIds: [] });
    expect(parseSupportDraft(value,sourceIds)).toBeNull();
    expect(diagnoseSupportDraft(value,sourceIds,[])).toMatchObject({
      code: "TEXT_INTERNAL_IDENTIFIER",predicate: "NARRATIVE_INTERNAL_IDENTIFIER"
    });
  });

  it.each([
    "Open Settings to review the ordinary feature name.",
    "Deschide Setări pentru a vedea numele obișnuit al funcției.",
    "Return home after reading Help."
  ])("keeps ambiguous human-facing feature names usable: %s", (text) => {
    const value = raw(text,{ actionIds: [] });
    expect(parseSupportDraft(value)).not.toBeNull();
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
    "Use [this link](/new)",
    "The visitor should use start-debate to continue.",
    "The visitor should read getting-started-debate for details.",
    "Support does not receive passwords and the visitor should send a password here."
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
