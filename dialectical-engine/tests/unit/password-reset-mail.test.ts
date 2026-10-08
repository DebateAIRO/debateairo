import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { renderPasswordResetMail } from "../../apps/api/src/password-reset-mail.js";
const options = { from: "noreply@dezbatere.ro", publicAppUrl: "https://preview.example.test" }, token = "A".repeat(43), cancelToken = "B".repeat(43);
const base = { messageId: randomUUID(), recipient: "owned@example.test", expiresAt: new Date("2026-10-06T12:00:00Z") };
describe("password-only reset mail boundaries", () => {
  it("refuses an unknown event even if its name exists on Object.prototype",()=>{
    expect(()=>renderPasswordResetMail({...base,event:"constructor"} as never,options)).toThrow("PASSWORD_RESET_MAIL_INPUT_INVALID");
  });
  it("sends primary proof and cancellation as fragments and accurately requires the current authenticator", () => {
    const message = renderPasswordResetMail({ ...base, event: "PROOF", token, cancelToken }, options);
    expect(message).toContain(`/reset-password#token=${token}`);
    expect(message).toContain(`/reset-password#cancel=${cancelToken}`);
    expect(message).toContain("current authenticator");
    expect(message).not.toContain("saved recovery code");
  });
  it("completion is metadata-only and says the authenticator and recovery codes are retained", () => {
    const message = renderPasswordResetMail({ ...base, event: "COMPLETED" }, options);
    expect(message).toContain("Your existing authenticator and unused recovery codes are unchanged.");
    expect(message).not.toMatch(/#token=|#cancel=|otpauth|Password:|Secret:|user_id|csrf/);
    expect(() => renderPasswordResetMail({ ...base, event: "COMPLETED", token }, options)).toThrow("PASSWORD_RESET_MAIL_INPUT_INVALID");
  });
  it("refuses recipient/header injection, insecure origins and unknown payload members", () => {
    expect(() => renderPasswordResetMail({ ...base, event: "COMPLETED", recipient: "one@example.test\r\nBcc: attacker@example.test" }, options)).toThrow("PASSWORD_RESET_MAIL_INPUT_INVALID");
    expect(() => renderPasswordResetMail({ ...base, event: "COMPLETED" }, { ...options, publicAppUrl: "http://preview.example.test" })).toThrow("PASSWORD_RESET_MAIL_INPUT_INVALID");
    expect(() => renderPasswordResetMail({ ...base, event: "COMPLETED", password: "a secret" } as never, options)).toThrow("PASSWORD_RESET_MAIL_INPUT_INVALID");
  });
});
