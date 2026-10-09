import { describe, expect, it } from "vitest";
import { createMfaRecoveryClient, createBackupEmailClient } from "../../packages/contract/src/mfa-recovery.js";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const expires_at = "2030-01-01T00:00:00Z";
describe("approved current-password and verified-email clients", () => {
  it.each([["/api", "/api"], ["/api/", "/api"], ["/api///", "/api"], ["/", ""], ["/a//b///", "/a//b"]])(
    "preserves validated base %s and trims only its trailing slashes", async (base,prefix) => {
      let url="",body="";
      const client=createMfaRecoveryClient(async (input,init)=>{url=String(input);body=String(init?.body);return json({status:"factor_required",expires_at});},base);
      await client.exchange("A".repeat(43),"fixture password");
      expect(url).toBe(prefix+"/v1/auth/mfa-recovery/exchange");
      expect(body).toBe(JSON.stringify({token:"A".repeat(43),password:"fixture password"}));
    });
  it("preserves a long allowed nontrailing slash run without transport at construction", async () => {
    const base="/a"+"/".repeat(32000)+"b";let calls=0,url="";
    const client=createMfaRecoveryClient(async input=>{calls++;url=String(input);return json({status:"factor_required",expires_at});},base);
    expect(calls).toBe(0);await client.exchange("A".repeat(43),"fixture password");
    expect(url).toBe(base+"/v1/auth/mfa-recovery/exchange");expect(calls).toBe(1);
  });
  it("pairs current password with the mailed token once in an unscoped exchange body", async () => {
    let request: { url: string; init: RequestInit };
    const client = createMfaRecoveryClient(async (url, init) => { request = { url: String(url), init: init! }; return json({ status: "factor_required", expires_at }); }, "/api", () => "B".repeat(43));
    await client.exchange("A".repeat(43), "current password fixture");
    expect(request!.url).toBe("/api/v1/auth/mfa-recovery/exchange");
    expect(request!.init.body).toBe(JSON.stringify({ token: "A".repeat(43), password: "current password fixture" }));
    expect(new Headers(request!.init.headers).get("x-mfa-recovery-csrf-token")).toBeNull();
    expect(request!.init.credentials).toBe("include");
  });
  it("restricts later requests to the MFA scope with no password or ordinary authority", async () => {
    let init: RequestInit = {};
    const client = createMfaRecoveryClient(async (_url, options) => { init = options!; return json({ status: "waiting", not_before: expires_at }); }, "/api", () => "B".repeat(43));
    await expect(client.complete()).resolves.toEqual({ status: "waiting", not_before: expires_at });
    expect(init.body).toBe("{}");
    expect(new Headers(init.headers).get("x-mfa-recovery-csrf-token")).toBe("B".repeat(43));
    expect(new Headers(init.headers).get("x-csrf-token")).toBeNull();
    await expect(createMfaRecoveryClient(async () => json({ status: "waiting", not_before: expires_at, session: "forged" })).complete()).rejects.toThrow();
    await expect(createMfaRecoveryClient(async () => json({ status: "completed" })).complete()).rejects.toThrow();
    await expect(createMfaRecoveryClient(async () => json({ status: "ready", expires_at, secret: "forged" })).status()).rejects.toThrow();
  });
  it("reads and uses the emailed finish link with the current password and no recovery-session authority", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const client = createMfaRecoveryClient(async (url, init) => { requests.push({ url: String(url), init: init! }); return String(url).endsWith("/finish/status") ? json({ status: "ready_to_finish", expires_at }) : json({ status: "completed" }); }, "/api", () => "B".repeat(43));
    await expect(client.finishStatus("F".repeat(43))).resolves.toEqual({ status: "ready_to_finish", expires_at });
    await expect(client.finish("F".repeat(43), "current password fixture")).resolves.toEqual({ status: "completed" });
    expect(requests.map(r => r.url)).toEqual(["/api/v1/auth/mfa-recovery/finish/status", "/api/v1/auth/mfa-recovery/finish"]);
    expect(requests.map(r => r.init.body)).toEqual([JSON.stringify({ token: "F".repeat(43) }), JSON.stringify({ token: "F".repeat(43), password: "current password fixture" })]);
    expect(requests.every(r => new Headers(r.init.headers).get("x-mfa-recovery-csrf-token") === null)).toBe(true);
    await expect(createMfaRecoveryClient(async () => json({ status: "waiting", not_before: expires_at })).finishStatus("F".repeat(43))).resolves.toEqual({ status: "waiting", not_before: expires_at });
    await expect(createMfaRecoveryClient(async () => json({ status: "ready_to_finish", not_before: expires_at })).finishStatus("F".repeat(43))).rejects.toThrow();
    await expect(createMfaRecoveryClient(async () => json({ error: "MFA_RECOVERY_TOO_EARLY" }, 409)).finish("F".repeat(43), "p")).rejects.toMatchObject({ status: 409, serverCode: "MFA_RECOVERY_TOO_EARLY" });
    // Review I1 2026-10-09: a replacement already waiting is refused at the email link with its own code.
    await expect(createMfaRecoveryClient(async () => json({ error: "MFA_RECOVERY_ALREADY_WAITING" }, 409)).exchange("A".repeat(43), "p")).rejects.toMatchObject({ status: 409, serverCode: "MFA_RECOVERY_ALREADY_WAITING" });
  });
  it("verifies only the bound backup address using ordinary password and current MFA proofs", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const client = createBackupEmailClient(async (url, init) => { requests.push({ url: String(url), init: init! }); return String(url).endsWith("/start") ? json({ message: "If this account can be recovered, instructions will arrive through an eligible channel." }, 202) : json({ status: "verified" }); }, "/api", () => "B".repeat(43));
    await client.startVerification("current fixture", "123456");
    expect(requests[0]!.init.body).toBe('{"password":"current fixture","code":"123456"}');
    expect(new Headers(requests[0]!.init.headers).get("x-csrf-token")).toBe("B".repeat(43));
    await client.confirm("A".repeat(43));
    expect(requests[1]!.init.body).toBe(JSON.stringify({ token: "A".repeat(43) }));
    expect(new Headers(requests[1]!.init.headers).get("x-csrf-token")).toBeNull();
  });
  it("rejects cross-origin bases and private account selectors in status", async () => {
    for (const base of ["//evil.test", "https://evil.test", "/api/%2e%2e/a", "/api?query=1"]) expect(() => createMfaRecoveryClient(fetch, base)).toThrow();
    await expect(createBackupEmailClient(async () => json({ status: "verified", email: "bound@example.test", user_id: "forged" })).status()).rejects.toThrow();
  });
});
