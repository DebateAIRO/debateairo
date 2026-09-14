import { describe,expect,it } from "vitest";

import { analyzeSupportCredentialText } from "../../packages/kernel/src/support-credentials.js";

describe("Support credential lexical facts", () => {
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
    ["My pass\u200Bword is inert-birch-7","inert-birch-7"],
    ["Paro\u200Bla mea este inert-fag-7","inert-fag-7"],
    ["Codul de veri\u2060ficare este INERTCODE","INERTCODE"]
  ])("keeps original spans across removed control characters: %s", (text,secret) => {
    const facts = analyzeSupportCredentialText(text);
    expect(facts.credentialValueSpans.map(({ start,end }) => text.slice(start,end)))
      .toEqual([secret]);
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
