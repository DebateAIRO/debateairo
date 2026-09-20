import { describe,expect,it } from "vitest";
import {
  bindSupportDraftAuthority,
  diagnoseSupportDraft,
  parseSupportCaseSummaryDraft,
  parseSupportDraft,
  projectSupportDraftReport,
  validateSupportDraft
} from "../../apps/api/src/support/response-policy.js";
import {
  SUPPORT_ACTION_CATALOG,SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES,SUPPORT_GUIDE_LABELS
} from "../../packages/support-kb/src/catalog.js";

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
  it("completes material Account citations from supplied authority without widening ordinary prose", () => {
    const detailed = {
      kind: "answer" as const,
      text: "Active sessions reviews devices and Delete account shows the deletion schedule.",
      sourceIds: ["app-navigation"],actionIds: []
    };

    expect(bindSupportDraftAuthority(detailed,["settings-help-menus","app-navigation"],[]))
      .toEqual({ ...detailed,sourceIds:["app-navigation","settings-help-menus"] });
    expect(bindSupportDraftAuthority(detailed,["app-navigation"],[])).toBeNull();
    expect(bindSupportDraftAuthority({
      kind:"answer",text:"Account opens the signed-in settings page.",
      sourceIds:["app-navigation"],actionIds:[]
    },["app-navigation"],[])).not.toBeNull();
  });

  it("requires source-backed closed actions for navigation commitments but preserves descriptions", () => {
    const unsupported = {
      kind:"answer" as const,
      text:"Support can guide you to Home, sign in, account creation, and Help.",
      sourceIds:["support-status-limits"],actionIds:[]
    };
    expect(bindSupportDraftAuthority(unsupported,[
      "support-status-limits","public-answer-disclosure","unsupported-capabilities"
    ],[])).toBeNull();

    const description = {
      kind:"answer" as const,
      text:"Home is the debate library and Public debates is the published catalog.",
      sourceIds:["app-navigation"],actionIds:[]
    };
    expect(bindSupportDraftAuthority(description,["app-navigation"],[])).toEqual(description);

    const navigation = {
      kind:"answer" as const,
      text:"Support can guide you to Home.",sourceIds:["app-navigation"],
      actionIds:["home"]
    };
    expect(bindSupportDraftAuthority(
      navigation,["app-navigation"],["home"]
    )).toEqual(navigation);
  });

  it("derives every promised destination from the canonical action and guide catalogs", () => {
    for (const action of SUPPORT_ACTION_CATALOG) {
      const guideRows = SUPPORT_GUIDE_LABELS.filter(({ actionId }) => actionId === action.id);
      expect(guideRows.length).toBeGreaterThan(0);
      const row = guideRows[0]!;
      const label = row.labels.en[0]!;
      const draft = {
        kind:"answer" as const,text:`Support can guide you to ${label}.`,
        sourceIds:[row.articleId],actionIds:[action.id]
      };
      const bound = bindSupportDraftAuthority(draft,[row.articleId],[action.id]);
      if (["unresolved","excluded"].includes(action.availability)) expect(bound).toBeNull();
      else expect(bound).toEqual(draft);
    }
    expect(new Set(SUPPORT_ACTION_CATALOG.map(({ id }) => id)))
      .toEqual(new Set(SUPPORT_ACTION_IDS));

    for (const row of SUPPORT_GUIDE_LABELS.filter(({ actionId }) => actionId === "start-debate")) {
      const draft = {
        kind:"answer" as const,
        text:`Support can guide you to ${row.labels.en[0]}.`,
        sourceIds:[row.articleId],actionIds:["start-debate"]
      };
      expect(bindSupportDraftAuthority(draft,[row.articleId],["start-debate"])).toEqual(draft);
    }
  });

  it("rejects a canonical promise when any request-local authority edge is missing", () => {
    const valid = {
      kind:"answer" as const,text:"Support can guide you to Active sessions.",
      sourceIds:["settings-help-menus"],actionIds:["active-sessions"]
    };
    expect(bindSupportDraftAuthority(valid,["settings-help-menus"],["active-sessions"]))
      .toEqual(valid);
    expect(bindSupportDraftAuthority(valid,["app-navigation"],["active-sessions"]))
      .toBeNull();
    expect(bindSupportDraftAuthority(valid,["settings-help-menus"],[])).toBeNull();
    expect(bindSupportDraftAuthority({ ...valid,actionIds:[] },["settings-help-menus"],["active-sessions"]))
      .toBeNull();
    expect(diagnoseSupportDraft(JSON.stringify({
      kind:"answer",text:"Support can guide you to Home.",
      sourceIds:["app-navigation"],actionIds:["home-library"]
    }),["app-navigation"],["home"])).toMatchObject({ code:"ACTION_MEMBERSHIP_INVALID" });
  });

  it("rejects case-email conflation while preserving the separate mail workflow", () => {
    expect(bindSupportDraftAuthority({
      kind:"answer",text:"A human case is created through escalation or the support-email flow.",
      sourceIds:["support-cases"],actionIds:[]
    },["support-cases"],[])).toBeNull();
    expect(bindSupportDraftAuthority({
      kind:"answer",text:"Escalation creates the human case; support email is a separate mail workflow.",
      sourceIds:["support-cases"],actionIds:[]
    },["support-cases"],[])).not.toBeNull();
    expect(bindSupportDraftAuthority({
      kind:"answer",text:"Escaladarea creează cazul uman; emailul de asistență este un flux separat.",
      sourceIds:["support-cases"],actionIds:[]
    },["support-cases"],[])).not.toBeNull();
    expect(bindSupportDraftAuthority({
      kind:"answer",text:"Escalation creates the human case, while support email is a separate mail workflow.",
      sourceIds:["support-cases"],actionIds:[]
    },["support-cases"],[])).not.toBeNull();
    expect(bindSupportDraftAuthority({
      kind:"answer",text:"Escaladarea creează cazul uman, iar emailul este un flux separat.",
      sourceIds:["support-cases"],actionIds:[]
    },["support-cases"],[])).not.toBeNull();
    expect(bindSupportDraftAuthority({
      kind:"answer",text:"Support email does not create the human case; escalation does.",
      sourceIds:["support-cases"],actionIds:[]
    },["support-cases"],[])).not.toBeNull();
    expect(bindSupportDraftAuthority({
      kind:"answer",text:"Emailul de asistență nu creează cazul uman; escaladarea îl creează.",
      sourceIds:["support-cases"],actionIds:[]
    },["support-cases"],[])).not.toBeNull();
    expect(bindSupportDraftAuthority({
      kind:"answer",text:"Email support creates the human case and receives its private case link.",
      sourceIds:["support-cases"],actionIds:[]
    },["support-cases"],[])).toBeNull();
    expect(bindSupportDraftAuthority({
      kind:"answer",text:"Emailul de asistență creează cazul uman și primește legătura privată.",
      sourceIds:["support-cases"],actionIds:[]
    },["support-cases"],[])).toBeNull();
  });

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
    "A fresh sign in may be required in Settings, but Support cannot receive passwords or security codes.",
    "Setările nu oferă controale pentru înlocuirea parolei sau regenerarea MFA. Asistența nu poate primi date de autentificare.",
    "În Setări poate fi necesară o autentificare recentă, dar Asistența nu poate primi parole sau coduri de securitate.",
    "You can change your account name in Settings. Support cannot receive your password.",
    "Poți schimba numele contului în Setări. Asistența nu poate primi parola.",
    "Recovery codes are available only after sign in.",
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
    ,"Support does not receive passwords and also asks you to send them here."
    ,"Support does not receive passwords, so send them here."
    ,"Support does not receive passwords and then asks you to send them here."
    ,"Asistența nu primește parole și de asemenea îți cere să le trimiți aici."
    ,"Asistența nu primește parole, așa că trimite-le aici."
    ,"Send your p%61ssword to Support."
    ,"Trimite p%2561rola către Asistență."
    ,"Support does not receive passwords while it asks you to send them here."
    ,"Support does not receive passwords and generally asks you to send them here."
    ,"Send your %EF%BD%90%EF%BD%81%EF%BD%93%EF%BD%93%EF%BD%97%EF%BD%8F%EF%BD%92%EF%BD%84 to Support."
    ,"Send your pass%E2%80%8Bword to Support."
  ])("keeps credential solicitation, execution, and labelled values rejected: %s", (text) => {
    const value = raw(text,{ actionIds: [] });
    expect(parseSupportDraft(value)).toBeNull();
    expect(diagnoseSupportDraft(value,["getting-started-debate"],[]).code)
      .toMatch(/^TEXT_(?:SECRET_LIKE|CREDENTIAL_OR_SECURITY_ACTION)$/u);
  });

  it.each([
    "Support does not receive passwords and may receive them.",
    "Support cannot accept a security code, but it could validate it.",
    "Asistența nu primește parole și poate primi acestea.",
    "Asistența nu verifică un cod de securitate, dar ar putea să îl primească.",
    "Support never asks for OTP codes, plus it accepts them.",
    "Support does not request passwords, plus it could receive them.",
    "Support does not request passwords, in addition it accepts them.",
    "Support does not request passwords, additionally it accepts them.",
    "Support does not request passwords, moreover it accepts them.",
    "Support does not request passwords, furthermore it accepts them.",
    "Asistența nu cere parole, plus le poate primi.",
    "Asistența nu cere parole, în plus le poate primi.",
    "Asistența nu cere parole, de asemenea le poate primi."
    ,"Asistența nu cere coduri de recuperare; de asemenea le poate valida."
    ,"Asistența nu cere coduri de verificare; de asemenea le poate valida."
    ,"Asistența nu cere coduri de securitate; de asemenea le poate valida."
    ,"Asistența nu cere coduri de autentificare; de asemenea le poate valida."
  ])("rejects a positive credential operation in a new modal group: %s", (text) => {
    expect(parseSupportDraft(raw(text,{ actionIds: [] }))).toBeNull();
    expect(parseSupportCaseSummaryDraft(JSON.stringify({
      kind: "case_summary",text,sourceIds: [],actionIds: []
    }))).toBeNull();
  });

  it.each([
    "Support does not request passwords, plus it does not accept them.",
    "Support does not request passwords, in addition it never receives them.",
    "Support does not request passwords, additionally it cannot validate them.",
    "Support does not request passwords, moreover it does not use them.",
    "Asistența nu cere parole, în plus nu le primește.",
    "Asistența nu cere parole, de asemenea nu le verifică."
    ,"Asistența nu cere coduri de recuperare; de asemenea nu le poate valida."
    ,"Asistența nu cere coduri de verificare; de asemenea nu le poate valida."
    ,"Asistența nu cere coduri de securitate; de asemenea nu le poate valida."
    ,"Asistența nu cere coduri de autentificare; de asemenea nu le poate valida."
  ])("accepts independently negated additive operation groups: %s", (text) => {
    expect(parseSupportDraft(raw(text,{ actionIds: [] }))).not.toBeNull();
    expect(parseSupportCaseSummaryDraft(JSON.stringify({
      kind: "case_summary",text,sourceIds: [],actionIds: []
    }))).not.toBeNull();
  });

  it.each(["=",":",",",";"] .flatMap((delimiter) => [
    [`root backslash after ${delimiter}`,`Target${delimiter}%5Csettings`],
    [`drive path after ${delimiter}`,`Target${delimiter}C:%5Csettings`],
    [`UNC path after ${delimiter}`,`Target${delimiter}%5C%5Cserver%5Cshare`]
  ]))("rejects a decoded structural %s boundary in answer and summary text", (_name,text) => {
    expect(parseSupportDraft(raw(text,{ actionIds: [] }))).toBeNull();
    expect(parseSupportCaseSummaryDraft(JSON.stringify({
      kind: "case_summary",text,sourceIds: [],actionIds: []
    }))).toBeNull();
  });

  it.each([
    "Progress=84% complete.",
    "Ratio=3/4 with four observations.",
    "Time=14:30 local.",
    "Version=1.2.3 is available."
  ])("keeps benign assignment text usable in answer and summary text: %s", (text) => {
    expect(parseSupportDraft(raw(text,{ actionIds: [] }))).not.toBeNull();
    expect(parseSupportCaseSummaryDraft(JSON.stringify({
      kind: "case_summary",text,sourceIds: [],actionIds: []
    }))).not.toBeNull();
  });

  it.each([
    "Support cannot receive passwords. You can change this display name in Settings.",
    "Support cannot accept recovery codes. You may edit that profile name in Settings.",
    "Asistența nu primește parole. Poți schimba acest nume afișat în Setări."
  ])("keeps an explicit noncredential object independent from an older credential: %s", (text) => {
    expect(parseSupportDraft(raw(text,{ actionIds: [] }))).not.toBeNull();
  });

  it("keeps all current human labels neutral in factual framing", () => {
    const labels = [
      ...SUPPORT_ACTION_CATALOG.flatMap(({ labels }) => [labels.en,labels.ro]),
      ...SUPPORT_CAPABILITIES.flatMap(({ labels }) => [labels.en,labels.ro])
    ];
    expect(labels).toHaveLength(60);
    for (const label of labels) {
      expect(parseSupportDraft(raw(`Available feature: ${label}.`,{ actionIds: [] })),label)
        .not.toBeNull();
    }
  });

  it.each([
    ["action","Select start-debate to continue.",["getting-started-debate"]],
    ["capability","Use owner-debate to export.",["export-json"]],
    ["selected source","Read getting-started-debate for details.",["getting-started-debate"]],
    ["control-obfuscated action","Select start-\u200Bdebate to continue.",["getting-started-debate"]]
    ,["formerly excepted action","Select forgot-password to continue.",["account-access"]]
    ,["formerly excepted action","Select privacy-preferences to continue.",["privacy-consent"]]
    ,["formerly excepted action","Select sign-in to continue.",["account-access"]]
    ,["formerly excepted action","Read support-status for details.",["support-status-limits"]]
  ])("rejects a closed internal %s identifier in visitor prose", (_kind,text,sourceIds) => {
    const value = raw(text,{ sourceIds,actionIds: [] });
    expect(parseSupportDraft(value,sourceIds)).toBeNull();
    expect(diagnoseSupportDraft(value,sourceIds,[])).toMatchObject({
      code: "TEXT_INTERNAL_IDENTIFIER",predicate: "NARRATIVE_INTERNAL_IDENTIFIER"
    });
  });

  it.each([...new Set([
    ...SUPPORT_ACTION_IDS,
    ...SUPPORT_CAPABILITIES.map(({ id }) => id),
    ...SUPPORT_CAPABILITIES.flatMap(({ articleIds }) => articleIds)
  ])].filter((id) => id.includes("-")))(
    "rejects exact catalog machine id %s in narrative prose",(id) => {
      expect(parseSupportDraft(raw(`Select ${id} to continue.`,{ actionIds: [] }))).toBeNull();
    }
  );

  it.each([
    "Open Settings to review the ordinary feature name.",
    "Deschide Setări pentru a vedea numele obișnuit al funcției.",
    "Return home after reading Help."
    ,"Select Forgot password to continue."
    ,"Alege Preferințe de confidențialitate pentru a continua."
    ,"Choose Sign in to continue."
    ,"Read Support status for details."
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
    ["triple-encoded URL", raw("Open https%25253A%25252F%25252Fexample.test/reset")],
    ["deeper encoded path", raw("Open %2525252Fsettings")],
    ["malformed structural escape", raw("Open https%3")],
    ["path instruction", raw("Go to /settings to continue")],
    ["root backslash", raw("Open \\settings to continue")],
    ["relative forward path", raw("Open ../settings to continue")],
    ["relative backslash path", raw("Open ..\\settings to continue")],
    ["drive path", raw("Open C:\\settings to continue")],
    ["UNC path", raw("Open \\\\host\\share to continue")],
    ["encoded backslash", raw("Open %5Csettings to continue")],
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

  it.each([
    "Progress is 50% complete.",
    "The 100% local export remains available.",
    "Progresul este 50% finalizat."
  ])("keeps benign percentage text usable: %s", (text) => {
    expect(parseSupportDraft(raw(text,{ actionIds: [] }))).not.toBeNull();
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
    ,"Support does not receive passwords and also asks the visitor to send them here."
    ,"Send the visitor p%61ssword to Support."
    ,"Open https%25253A%25252F%25252Fexample.test/reset"
    ,"The visitor should use forgot-password to continue."
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
