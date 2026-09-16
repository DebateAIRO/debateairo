import { diagnoseSupportDraft,parseSupportCaseSummaryDraft,parseSupportDraft } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/response-policy.ts";

function raw(text: string, actionIds: string[] = []) {
  return JSON.stringify({ kind: "answer",text,sourceIds: ["getting-started-debate"],actionIds });
}

const cases = [
  ["benign-en-known-control", "Settings does not offer controls to replace a password or regenerate MFA. Support cannot accept credentials.", []],
  ["benign-ro-known-control", "Setările nu oferă controale pentru înlocuirea parolei sau regenerarea MFA. Asistența nu poate primi date de autentificare.", []],
  ["benign-en-cross-sentence", "You can change your account name in Settings. Support cannot receive passwords.", []],
  ["benign-ro-cross-sentence", "Poți schimba numele contului în Setări. Asistența nu poate primi parole.", []],
  ["benign-en-cross-sentence-singular", "You can change your account name in Settings. Support cannot receive your password.", []],
  ["benign-ro-cross-sentence-singular", "Poți schimba numele contului în Setări. Asistența nu poate primi parola.", []],
  ["forbidden-en-direct-solicitation", "Send your password to Support.", []],
  ["forbidden-ro-direct-solicitation", "Trimite parola către Asistență.", []],
  ["forbidden-en-plural-solicitation", "Send your passwords to Support.", []],
  ["forbidden-ro-plural-solicitation", "Trimite parolele către Asistență.", []],
  ["forbidden-en-plural-code-solicitation", "Send your security codes to Support.", []],
  ["forbidden-en-validation", "Provide your security code so I can validate it.", []],
  ["forbidden-en-transformation", "Send your OTP; I will encode it.", []],
  ["forbidden-en-reset-claim", "I reset your password successfully.", []],
  ["forbidden-en-negation-conjunction", "Support does not receive passwords and you should send your password here.", []],
  ["forbidden-ro-negation-conjunction", "Asistența nu primește parole și trebuie să trimiți parola aici.", []],
  ["forbidden-en-adversative-control", "Support does not receive passwords, but you should send your password here.", []],
  ["raw-protocol-relative-link", "Open //example.test/reset", []],
  ["percent-encoded-link", "Open https%3A%2F%2Fexample.test/reset", []],
  ["double-encoded-path", "Open %252Fsettings", []],
  ["internal-action-id-in-prose", "Select start-debate to continue.", ["start-debate"]]
] as const;

const results = cases.map(([id,text,actionIds]) => {
  const value = raw(text,[...actionIds]);
  return {
    id,
    diagnostic: diagnoseSupportDraft(value,["getting-started-debate"],actionIds as never).code,
    parsed: parseSupportDraft(value) !== null
  };
});

const summary = [
  ["summary-benign", "The visitor needs help understanding debate creation."],
  ["summary-forbidden-negation-conjunction", "Support does not receive passwords and the visitor should send a password here."],
  ["summary-internal-id", "The visitor should use start-debate to continue."],
  ["summary-double-encoded-link", "Open https%253A%252F%252Fexample.test/reset"]
] as const;

console.log(JSON.stringify({
  answers: results,
  summaries: summary.map(([id,text]) => ({
    id,accepted: parseSupportCaseSummaryDraft(JSON.stringify({
      kind: "case_summary",text,sourceIds: [],actionIds: []
    })) !== null
  }))
},null,2));
