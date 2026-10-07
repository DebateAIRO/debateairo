import { describe, expect, it } from "vitest";
import { createPasswordResetClient } from "../../packages/contract/src/password-reset.js";

const state = { status: "password_required", expires_at: "2030-01-01T00:00:00Z", password_min_length: 12, password_max_length: 1024 };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

describe("password-only reset typed client", () => {
  it.each([["/api", "/api"], ["/api/", "/api"], ["/api///", "/api"], ["/", ""], ["/a//b///", "/a//b"]])(
    "preserves validated base %s and trims only its trailing slashes", async (base, prefix) => {
      let url="",body="";
      const client=createPasswordResetClient(async (input,init)=>{url=String(input);body=String(init?.body);return json(state);},base);
      await client.exchange("A".repeat(43));
      expect(url).toBe(prefix+"/v1/auth/password-reset/exchange");
      expect(body).toBe(JSON.stringify({token:"A".repeat(43)}));
    });
  it("preserves a long allowed nontrailing slash run without transport at construction", async () => {
    const base="/a"+"/".repeat(32000)+"b";let calls=0,url="";
    const client=createPasswordResetClient(async input=>{calls++;url=String(input);return json(state);},base);
    expect(calls).toBe(0);await client.exchange("A".repeat(43));
    expect(url).toBe(base+"/v1/auth/password-reset/exchange");expect(calls).toBe(1);
  });
  it("exchanges the secret only in a same-origin POST body without ordinary or recovery CSRF", async () => {
    let url = "", init: RequestInit = {};
    const client = createPasswordResetClient(async (input, options) => { url = String(input); init = options!; return json(state); }, "/api", () => "B".repeat(43));
    expect(await client.exchange("A".repeat(43))).toEqual(state);
    expect(url).toBe("/api/v1/auth/password-reset/exchange");
    expect(init.body).toBe(JSON.stringify({ token: "A".repeat(43) }));
    expect(init.credentials).toBe("include");
    expect(init.cache).toBe("no-store");
    expect([...new Headers(init.headers).keys()]).toEqual(["accept", "content-type"]);
  });
  it("completes with only the new password and six digits under the reset CSRF scope", async () => {
    let url = "", init: RequestInit = {};
    const client = createPasswordResetClient(async (input, options) => { url = String(input); init = options!; return json({ status: "completed" }); }, "/api", () => "B".repeat(43));
    expect(await client.complete("a unique new password", "123456")).toEqual({ status: "completed" });
    expect(url).toBe("/api/v1/auth/password-reset/complete");
    expect(init.body).toBe('{"password":"a unique new password","code":"123456"}');
    expect(new Headers(init.headers).get("x-password-reset-csrf-token")).toBe("B".repeat(43));
    expect(new Headers(init.headers).get("x-csrf-token")).toBeNull();
    expect(new Headers(init.headers).get("x-recovery-csrf-token")).toBeNull();
  });
  it("reconciles completion using metadata only and rejects ordinary authority or factor secrets", async () => {
    const client = createPasswordResetClient(async () => json({ ...state, status: "completed" }));
    expect((await client.status()).status).toBe("completed");
    for (const response of [{ ...state, session: { caller_scope: "OWNER" } }, { ...state, secret: "JBSWY3DPEHPK3PXP" }, { ...state, password_min_length: undefined }, { status: "completed", session: "ordinary" }]) {
      const malformed = createPasswordResetClient(async () => json(response));
      await expect(malformed.status()).rejects.toThrow("Password reset could not be confirmed.");
    }
  });
  it("keeps start enumeration-resistant and errors secret-free", async () => {
    const client = createPasswordResetClient(async () => json({ message: "If this account can be recovered, instructions will arrive through an eligible channel." }, 202));
    expect(await client.start("demo@example.test")).toEqual({ message: "If this account can be recovered, instructions will arrive through an eligible channel." });
    const rejected = createPasswordResetClient(async () => json({ error: "PASSWORD_RESET_PROOF_INVALID", detail: "secret fixture" }, 401));
    await expect(rejected.complete("secret fixture", "123456")).rejects.toMatchObject({ status: 401, serverCode: "PASSWORD_RESET_PROOF_INVALID", message: "Password reset was not accepted." });
  });
  it("rejects cross-origin and encoded traversing API bases before transport", () => {
    for (const base of ["https://evil.test", "//evil.test", "/api/../escape", "/api/%2e%2e/escape", "/api%2fescape", "/api\\evil.test", "/api?x=1"]) expect(() => createPasswordResetClient(fetch, base)).toThrow("PASSWORD_RESET_API_BASE_INVALID");
  });
});
