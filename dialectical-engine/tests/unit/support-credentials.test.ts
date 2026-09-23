import { describe,expect,it } from "vitest";

import { analyzeSupportCredentialText } from "../../packages/kernel/src/support-credentials.js";

describe("Support credential lexical facts", () => {
  const romanianCodeNouns = ["cod","codul","codului","coduri","codurile","codurilor"] as const;
  const romanianNamedCodeKinds = [
    ["recuperare","recovery-code"],
    ["verificare","verification-code"],
    ["securitate","security-code"],
    ["autentificare","authentication-code"]
  ] as const;

  it.each(romanianCodeNouns.flatMap((noun) => romanianNamedCodeKinds.map(([category,kind]) => [
    `${noun} de ${category}`,kind
  ] as const)))("recognizes the shipped Romanian code category %s", (text,kind) => {
    expect(analyzeSupportCredentialText(text).credentialTerms).toEqual([
      expect.objectContaining({ kind,start: 0,end: text.length })
    ]);
  });

  it.each([
    ["coduri TOTP","totp"],
    ["codurilor MFA","mfa"],
    ["codului OTP","otp"]
  ] as const)("recognizes the Romanian code noun in acronym category %s", (text,kind) => {
    expect(analyzeSupportCredentialText(text).credentialTerms)
      .toEqual([expect.objectContaining({ kind })]);
  });

  it.each([
    ["password","My password is inert-orchid-7","inert-orchid-7"],
    ["password","Passwordul meu este inert-stejar-7","inert-stejar-7"],
    ["passcode","My passcode is inert-maple-7","inert-maple-7"],
    ["otp","OTP is INERTABC","INERTABC"],
    ["totp","Codul TOTP este INERTDEF","INERTDEF"],
    ["mfa","My MFA code is INERTGHI","INERTGHI"],
    ["authenticator","Authenticator code: INERTJKL","INERTJKL"],
    ["recovery-code","Recovery code is INERTMNO","INERTMNO"],
    ["verification-code","Codul de verificare este INERTPQR","INERTPQR"],
    ["security-code","Security codes are INERTSTU","INERTSTU"],
    ["reset-token","Tokenul de resetare este INERTVWX","INERTVWX"],
    ["credentials","Datele de autentificare sunt INERTYZ1","INERTYZ1"]
  ] as const)("maps a labelled %s value back to its original source span", (
    kind,text,secret
  ) => {
    const facts = analyzeSupportCredentialText(text);
    expect(facts.credentialTerms.some((term) => term.kind === kind)).toBe(true);
    expect(facts.credentialValueSpans.map(({ start,end }) => text.slice(start,end)))
      .toContain(secret);
    expect(Object.isFrozen(facts)).toBe(true);
  });

  it.each([
    ["Show me the recovery page; my reset token is INERT-RESET-7.","INERT-RESET-7"],
    ["Arată-mi pagina de recuperare; parola mea este inert-stejar-9.","inert-stejar-9"]
  ])("retains a supplied credential value inside a recovery-navigation request: %s",(
    text,secret
  ) => {
    const facts = analyzeSupportCredentialText(text);
    expect(facts.credentialValueSpans.map(({ start,end }) => text.slice(start,end)))
      .toContain(secret);
  });

  it.each([
    ["My pass\u200Bword is inert-birch-7","inert-birch-7"],
    ["Paro\u200Bla mea este inert-fag-7","inert-fag-7"],
    ["Codul de veri\u2060ficare este INERTCODE","INERTCODE"]
  ])("keeps original spans across removed control characters: %s", (text,secret) => {
    const facts = analyzeSupportCredentialText(text);
    expect(facts.credentialValueSpans.map(({ start,end }) => text.slice(start,end)))
      .toEqual([secret]);
  });

  it.each([
    ['My password is "inert horse battery".',"inert horse battery"],
    ["Parola mea este „inert cal albastru”.","inert cal albastru"],
    ["My recovery code is inert horse battery; keep it private.","inert horse battery"],
    ["Codul de verificare este inert cal albastru, păstrează-l privat.","inert cal albastru"]
  ])("maps a complete bounded multiword supplied value: %s", (text,secret) => {
    const facts = analyzeSupportCredentialText(text);
    expect(facts.credentialValueSpans.map(({ start,end }) => text.slice(start,end)))
      .toContain(secret);
  });

  it.each([
    ['My recovery code is "inert amber fern',"inert amber fern"],
    ["My password is amber birch cedar dogwood elm fir grove hazel; keep it private.","amber birch cedar dogwood elm fir grove hazel"],
    ["My reset token is inert.alpha-beta/gamma; keep it private.","inert.alpha-beta/gamma"],
    ["My reset token is quartz and ember; keep it private.","quartz and ember"],
    ["My reset token is quartz, and ember; keep it private.","quartz, and ember"],
    ["My reset token is quartz but ember; keep it private.","quartz but ember"],
    ["Codul de verificare este cuarț și chihlimbar; păstrează-l privat.","cuarț și chihlimbar"]
  ])("owns the complete supplied-value span without retaining a suffix: %s", (text,secret) => {
    const facts = analyzeSupportCredentialText(text);
    expect(facts.credentialValueSpans.map(({ start,end }) => text.slice(start,end)))
      .toContain(secret);
  });

  it.each([
    ["My password is inert horse battery and I need help.","inert horse battery"],
    ["My password is inert horse battery, and I need help.","inert horse battery"],
    ["Parola mea este inert cal albastru și am nevoie de ajutor.","inert cal albastru"],
    ["Parola mea este inert cal albastru, păstrează-l privat.","inert cal albastru"]
  ])("stops a supplied value only at an independent subject-led clause: %s", (text,secret) => {
    expect(analyzeSupportCredentialText(text).credentialValueSpans.map(({ start,end }) =>
      text.slice(start,end)
    )).toEqual([secret]);
  });

  it.each([
    "My password is unavailable; show ordinary recovery guidance.",
    "Parola mea este indisponibilă; arată ghidul obișnuit de recuperare."
  ])("does not classify a benign unavailable state as a supplied value: %s", (text) => {
    expect(analyzeSupportCredentialText(text).credentialValueSpans).toEqual([]);
  });

  it.each([
    ["Support does not receive passwords and also asks you to send them here.","solicit"],
    ["Support does not receive passwords, so send them here.","solicit"],
    ["Asistența nu primește parole și de asemenea îți cere să le trimiți aici.","solicit"],
    ["Asistența nu primește parole, așa că trimite-le aici.","solicit"],
    ["Support does not receive passwords while it asks you to send them here.","solicit"],
    ["Support does not receive passwords and generally asks you to send them here.","solicit"]
  ])("does not carry negation into a later coordinated operation: %s", (text,kind) => {
    const operations = analyzeSupportCredentialText(text).operations.filter((row) => row.kind === kind);
    expect(operations.some(({ negated }) => negated === false)).toBe(true);
  });

  it.each([
    "Support does not receive passwords and may receive them.",
    "Support cannot accept security codes, but it could validate them.",
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
    ,"Asistența nu cere coduri de autentificare; de asemenea le poate valida."
  ])("starts a separate positive modal or auxiliary operation group: %s", (text) => {
    const facts = analyzeSupportCredentialText(text);
    expect(facts.credentialTerms.length).toBeGreaterThan(0);
    expect(facts.operations.some(({ negated }) => !negated)).toBe(true);
  });

  it.each([
    "Support does not request passwords, plus it does not accept them.",
    "Support does not request passwords, in addition it never receives them.",
    "Support does not request passwords, additionally it cannot validate them.",
    "Support does not request passwords, moreover it does not use them.",
    "Asistența nu cere parole, în plus nu le primește.",
    "Asistența nu cere parole, de asemenea nu le verifică."
    ,"Asistența nu cere coduri de autentificare; de asemenea nu le poate valida."
  ])("keeps each additive operation group independently negated: %s", (text) => {
    const operations = analyzeSupportCredentialText(text).operations;
    expect(operations.length).toBeGreaterThan(1);
    expect(operations.every(({ negated }) => negated)).toBe(true);
  });

  it("emits only closed lexical facts and numeric spans", () => {
    const hostile = "Send your passwords and then validate them.";
    const serialized = JSON.stringify(analyzeSupportCredentialText(hostile));
    expect(serialized).not.toContain(hostile);
    expect(serialized).not.toContain("passwords");
    expect(JSON.parse(serialized)).toEqual(expect.objectContaining({
      credentialTerms: expect.any(Array),operations: expect.any(Array),
      negations: expect.any(Array),references: expect.any(Array),
      credentialValueSpans: expect.any(Array)
    }));
  });
});
