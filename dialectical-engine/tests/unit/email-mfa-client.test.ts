import { describe, expect, it } from "vitest";
import { createMfaRecoveryClient, createBackupEmailClient } from "../../packages/contract/src/mfa-recovery.js";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const expires_at = "2030-01-01T00:00:00Z";
describe("approved current-password and verified-email clients", () => {
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
    const client = createMfaRecoveryClient(async (_url, options) => { init = options!; return json({ status: "completed" }); }, "/api", () => "B".repeat(43));
    await client.complete();
    expect(init.body).toBe("{}");
    expect(new Headers(init.headers).get("x-mfa-recovery-csrf-token")).toBe("B".repeat(43));
    expect(new Headers(init.headers).get("x-csrf-token")).toBeNull();
    await expect(createMfaRecoveryClient(async () => json({ status: "completed", session: "forged" })).complete()).rejects.toThrow();
    await expect(createMfaRecoveryClient(async () => json({ status: "ready", expires_at, secret: "forged" })).status()).rejects.toThrow();
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
