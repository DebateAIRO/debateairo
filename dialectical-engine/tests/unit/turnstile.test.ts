import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UnixTurnstileVerifier, requireTurnstileProof } from "../../apps/api/src/turnstile.js";

const now = new Date("2026-10-04T12:00:00.000Z");
const success = { success: true, hostname: "v3-preview.dezbatere.ro", action: "signup", challenge_ts: "2026-10-04T11:59:00Z", "error-codes": [] };
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
async function fixture(body: unknown = success, status = 200, delay = 0) {
  const dir = await mkdtemp(join(tmpdir(), "ts-")); const socketPath = join(dir, "relay.sock");
  const requests: unknown[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({ method: request.method, path: request.url, body: JSON.parse(Buffer.concat(chunks).toString()) });
    setTimeout(() => { response.writeHead(status, { "content-type": "application/json" }); response.end(typeof body === "string" ? body : JSON.stringify(body)); }, delay).unref();
  });
  await new Promise<void>(resolve => server.listen(socketPath, resolve));
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); });
  const verifier = new UnixTurnstileVerifier({ socketPath, publicAppUrl: "https://v3-preview.dezbatere.ro", clock: () => now });
  return { verifier, requests };
}
describe("confined Turnstile verifier", () => {
  it("sends only proof/action over the fixed Unix operation and consumes a proof once", async () => {
    const { verifier, requests } = await fixture();
    expect(await verifier.verify({ token: "fixture-token", action: "signup" })).toBe("passed");
    expect(await verifier.verify({ token: "fixture-token", action: "signup" })).toBe("rejected");
    expect(requests).toEqual([{ method: "POST", path: "/siteverify", body: { token: "fixture-token", action: "signup" } }]);
  });
  it.each(["", " ", "x".repeat(2049)])("does no transport for invalid token %j", async token => {
    const { verifier, requests } = await fixture(); expect(await verifier.verify({ token, action: "signup" })).toBe("rejected"); expect(requests).toEqual([]);
  });
  it.each([
    { ...success, hostname: "dezbatere.ro" }, { ...success, action: "resend-verification" },
    { ...success, challenge_ts: "2026-10-04T11:54:59Z" }, { ...success, challenge_ts: "2026-10-04T12:00:01Z" }
  ])("rejects mismatched or expired successful proof %j", async body => {
    const { verifier } = await fixture(body); expect(await verifier.verify({ token: "fixture", action: "signup" })).toBe("rejected");
  });
  it.each([
    [{ success: false, "error-codes": ["invalid-input-response"] }, "rejected"],
    [{ success: false, "error-codes": ["timeout-or-duplicate"] }, "rejected"],
    [{ success: false, "error-codes": ["invalid-input-secret"] }, "unavailable"],
    [{ success: false, "error-codes": ["internal-error"] }, "unavailable"],
    [{ success: "true" }, "unavailable"], [{ success: true }, "unavailable"], ["not JSON", "unavailable"], ["x".repeat(8193), "unavailable"]
  ] as const)("classifies provider rejection versus infrastructure fault", async (body, want) => {
    const { verifier } = await fixture(body); expect(await verifier.verify({ token: "fixture", action: "signup" })).toBe(want);
  });
  it("does not follow redirects or accept HTTP failure", async () => {
    const { verifier, requests } = await fixture(success, 302); expect(await verifier.verify({ token: "fixture", action: "signup" })).toBe("unavailable"); expect(requests).toHaveLength(1);
  });
  it("ends the entire verification operation at five seconds", async () => {
    const { verifier } = await fixture(success, 200, 6000); const start = performance.now();
    expect(await verifier.verify({ token: "fixture", action: "signup" })).toBe("unavailable"); expect(performance.now() - start).toBeLessThan(5600);
  });
  it("fails closed on absent configuration and throws only constant gate errors", async () => {
    const verifier = new UnixTurnstileVerifier({ publicAppUrl: "https://v3-preview.dezbatere.ro" });
    expect(await verifier.verify({ token: "fixture", action: "signup" })).toBe("unavailable");
    await expect(requireTurnstileProof(undefined, { token: "fixture", action: "signup" })).rejects.toMatchObject({ code: "TURNSTILE_UNAVAILABLE", statusCode: 503 });
  });
  it.each(["http://example.test", "https://user:pw@example.test", "https://example.test/path", "https://example.test?x=1"])("refuses non-origin deployment URL %s", publicAppUrl => {
    expect(() => new UnixTurnstileVerifier({ publicAppUrl })).toThrow("TURNSTILE_PUBLIC_APP_URL_INVALID");
  });
});

/**
 * Auth API hardening (2026-10-09, item 2): the single-use memory refused every
 * proof once it held 10,000 digests, and it held a digest for five minutes
 * even when the proof was refused — so 10,000 garbage proofs turned every real
 * sign-up into TURNSTILE_UNAVAILABLE for five minutes.
 */
async function classifyingRelay(passing: ReadonlySet<string>) {
  const dir = await mkdtemp(join(tmpdir(), "ts-")); const socketPath = join(dir, "relay.sock");
  let calls = 0, clock = now.getTime();
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const { token } = JSON.parse(Buffer.concat(chunks).toString()) as { token: string };
    calls += 1;
    const fresh = { ...success, challenge_ts: new Date(clock - 1_000).toISOString() };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(passing.has(token) || token.startsWith("valid-") ? fresh : { success: false, "error-codes": ["invalid-input-response"] }));
  });
  await new Promise<void>(resolve => server.listen(socketPath, resolve));
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); });
  const verifier = new UnixTurnstileVerifier({ socketPath, publicAppUrl: "https://v3-preview.dezbatere.ro", clock: () => new Date(clock) });
  return { verifier, calls: () => calls, advance: (ms: number) => { clock += ms; } };
}
describe("single-use proof memory under a garbage flood", () => {
  it("still verifies a fresh valid proof after 10,000 refused proofs", async () => {
    const relay = await classifyingRelay(new Set(["fresh-valid"]));
    for (let index = 0; index < 10_000; index += 1) {
      expect(await relay.verifier.verify({ token: `garbage-${index}`, action: "signup" })).toBe("rejected");
    }
    expect(await relay.verifier.verify({ token: "fresh-valid", action: "signup" })).toBe("passed");
    // A passed proof stays consumed: its replay is refused without transport.
    const before = relay.calls();
    expect(await relay.verifier.verify({ token: "fresh-valid", action: "signup" })).toBe("rejected");
    expect(relay.calls()).toBe(before);
  }, 120_000);

  it("refuses a fresh proof only while every held proof is still inside its validity window", async () => {
    const relay = await classifyingRelay(new Set());
    for (let index = 0; index < 10_000; index += 1) {
      expect(await relay.verifier.verify({ token: `valid-${index}`, action: "signup" })).toBe("passed");
    }
    expect(await relay.verifier.verify({ token: "valid-next", action: "signup" })).toBe("unavailable");
    relay.advance(300_001);
    expect(await relay.verifier.verify({ token: "valid-after-window", action: "signup" })).toBe("passed");
  }, 120_000);
});
