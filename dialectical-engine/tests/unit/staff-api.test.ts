import { afterEach, describe, expect, it, vi } from "vitest";
import { createStaffApiClient } from "../../apps/ui/lib/staffApi.js";
const id = "11111111-1111-4111-8111-111111111111";
const handle = "a".repeat(43);
const options = { challenge_handle: handle, options: { challenge: handle, rpId: "app.test", timeout: 300000, userVerification: "required", allowCredentials: [{ id: "aA", type: "public-key" }] } };
const credential = { id: "aA", rawId: "aA", type: "public-key" as const, response: { clientDataJSON: "aA", authenticatorData: "aA", signature: "aA", userHandle: null }, clientExtensionResults: {} };
afterEach(() => vi.unstubAllGlobals());
describe("staff browser contract client", () => {
    it("uses same-origin cookie transport, two exact CSRF cookies and strict intent at both action calls", async () => {
        vi.stubGlobal("document", { cookie: `__Host-debateai-csrf=${"c".repeat(43)}; __Host-debateai-staff-csrf=${"s".repeat(43)}` });
        const calls: Array<{
            input: string;
            init: RequestInit;
        }> = [];
        const client = createStaffApiClient({ fetchImplementation: (async (input, init) => { calls.push({ input: String(input), init: init! }); return Response.json(String(input).endsWith("options") ? options : { proof_handle: handle, expires_at: "2099-01-01T00:00:00.000Z" }); }) as typeof fetch,
            browser: { authenticate: async () => credential, register: async () => { throw Error("unused"); }, cancel() { } } });
        const intent = { action: "CREDENTIAL_REGISTER" as const, operation_id: id };
        await client.proveAction(intent);
        expect(calls.map(c => c.input)).toEqual(["/api/v1/admin/webauthn/action/options", "/api/v1/admin/webauthn/action/verify"]);
        expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ intent });
        expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ intent, challenge_handle: handle, credential });
        for (const call of calls) {
            expect(call.init.credentials).toBe("same-origin");
            expect(call.init.cache).toBe("no-store");
            expect(new Headers(call.init.headers).get("x-staff-csrf-token")).toBe("s".repeat(43));
            expect(new Headers(call.init.headers).get("x-csrf-token")).toBe("c".repeat(43));
            expect(new Headers(call.init.headers).get("authorization")).toBeNull();
        }
    });
    it("refuses uploaded binding fields before network and private or guessed elevation responses", async () => {
        let calls = 0;
        const client = createStaffApiClient({ fetchImplementation: (async () => { calls++; return Response.json({ staff_id: id, capabilities: ["TEAM_READ"], grant_revision: 0, expires_at: "2099-01-01T00:00:00.000Z", role: "OWNER", staffToken: "secret" }); }) as typeof fetch });
        await expect(client.beginAction({ action: "CREDENTIAL_REGISTER", operation_id: id, body_sha256: "a".repeat(64) } as never)).rejects.toMatchObject({ code: "MALFORMED_REQUEST" });
        expect(calls).toBe(0);
        await expect(client.finishElevation({ challenge_handle: handle, credential })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    });
    it("uses only ordinary CSRF for prerequisites, candidate possession and invitee acceptance", async () => {
        vi.stubGlobal("document", { cookie: `__Host-debateai-csrf=${"c".repeat(43)}; __Host-debateai-staff-csrf=${"s".repeat(43)}` });
        let headers: Headers | undefined;
        const client = createStaffApiClient({ fetchImplementation: (async (_input, init) => { headers = new Headers(init?.headers); return Response.json({ prerequisite_handle: handle, expires_at: "2099-01-01T00:00:00.000Z" }); }) as typeof fetch });
        await client.prerequisite({ purpose: "KEY_PREREGISTRATION", password: "synthetic", totp_code: "123456" });
        expect(headers!.get("x-csrf-token")).toBe("c".repeat(43));
        expect(headers!.get("x-staff-csrf-token")).toBeNull();
    });
});
it("cancel during an outstanding options request cannot start native verification or mutation", async () => {
    let resolveOptions!: (value: Response) => void;
    const calls: string[] = [];
    let nativeCalls = 0;
    const client = createStaffApiClient({
        fetchImplementation: (async (input) => { calls.push(String(input)); return calls.length === 1 ? new Promise<Response>(resolve => { resolveOptions = resolve; }) : Response.json({ proof_handle: handle, expires_at: "2099-01-01T00:00:00.000Z" }); }) as typeof fetch,
        browser: { authenticate: async () => { nativeCalls++; return credential; }, register: async () => { throw Error("unused"); }, cancel() { } }
    });
    const work = client.proveAction({ action: "CREDENTIAL_REGISTER", operation_id: id });
    client.cancel();
    resolveOptions(Response.json(options));
    await expect(work).rejects.toThrow("STAFF_WEBAUTHN_CANCELLED");
    expect(nativeCalls).toBe(0);
    expect(calls).toHaveLength(1);
});
it("pins strict intent across native await even if caller changes its object", async () => {
    let finishNative!: (value: typeof credential) => void;
    const bodies: unknown[] = [];
    const client = createStaffApiClient({ fetchImplementation: (async (_input, init) => {
            bodies.push(JSON.parse(String(init?.body)));
            return Response.json(bodies.length === 1 ? options : { proof_handle: handle, expires_at: "2099-01-01T00:00:00.000Z" });
        }) as typeof fetch, browser: { authenticate: () => new Promise(resolve => { finishNative = resolve; }), register: async () => { throw Error("unused"); }, cancel() { } } });
    const intent = { action: "TEAM_GRANT" as const, target_staff_id: id, capabilities: ["TEAM_READ" as const], expected_revision: 3, operation_id: id, reason: { code: "GRANT_CHANGE" as const } };
    const work = client.proveAction(intent);
    await vi.waitFor(() => expect(finishNative).toBeDefined());
    intent.expected_revision = 99;
    intent.capabilities.push("AUDIT_READ" as never);
    finishNative(credential);
    await work;
    expect(bodies[1]).toMatchObject({ intent: { expected_revision: 3, capabilities: ["TEAM_READ"] } });
});
it("cancel while verification is pending discards its private proof response", async () => {
    let resolveVerify!: (value: Response) => void;
    const client = createStaffApiClient({ fetchImplementation: (async (input) => String(input).endsWith("options") ? Response.json(options) : new Promise<Response>(resolve => { resolveVerify = resolve; })) as typeof fetch,
        browser: { authenticate: async () => credential, register: async () => { throw Error("unused"); }, cancel() { } } });
    const work = client.proveAction({ action: "CREDENTIAL_REGISTER", operation_id: id });
    await vi.waitFor(() => expect(resolveVerify).toBeDefined());
    client.cancel();
    resolveVerify(Response.json({ proof_handle: handle, expires_at: "2099-01-01T00:00:00.000Z" }));
    await expect(work).rejects.toThrow("STAFF_WEBAUTHN_CANCELLED");
});
it("takes acceptance revision from scoped server options without adding it to native input", async () => {
    const calls: Array<{
        path: string;
        body: unknown;
    }> = [];
    let nativeInput: unknown;
    const client = createStaffApiClient({ fetchImplementation: (async (input, init) => {
            const path = String(input);
            calls.push({ path, body: JSON.parse(String(init?.body)) });
            return Response.json(path.endsWith("/options") ? { ...options, invitation_revision: 7 }
                : path.endsWith("/verify") ? { proof_handle: handle, expires_at: "2099-01-01T00:00:00.000Z" }
                    : { operation_id: id, outcome: "COMPLETED", recorded_at: "2026-10-03T00:00:00.000Z" });
        }) as typeof fetch, browser: { authenticate: async (input) => { nativeInput = input; return credential; }, register: async () => { throw Error("unused"); }, cancel() { } } });
    await client.accept({ invitation_handle: handle, operation_id: id });
    expect(nativeInput).toEqual(options);
    expect(calls[2]!.body).toEqual({ invitation_handle: handle, operation_id: id, proof_handle: handle, expected_revision: 7 });
});
