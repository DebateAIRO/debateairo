import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../apps/ui/app/api/[...path]/route.js";
const authNames = ["__Host-debateai-session", "__Host-debateai-csrf", "__Host-debateai-staff", "__Host-debateai-staff-csrf"];
const context = { params: Promise.resolve({ path: ["v1", "admin", "webauthn", "action", "options"] }) };
let forwarded: Headers;
let outgoing: string[];
let receivedBody: string;
beforeEach(() => {
    vi.stubEnv("DIALECTICAL_API_BASE", "http://synthetic-api.test");
    outgoing = [];
    vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
        forwarded = new Headers(init.headers);
        receivedBody = new TextDecoder().decode(init.body as Uint8Array);
        const headers = new Headers();
        for (const value of outgoing)
            headers.append("set-cookie", value);
        return new Response("{}", { headers });
    });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function proxy(cookie: string) {
    return POST(new Request("https://app.test/api/v1/admin/webauthn/action/options", {
        method: "POST", headers: { cookie, origin: "https://app.test", "x-csrf-token": "c".repeat(43),
            "x-staff-csrf-token": "d".repeat(43), "x-staff-token": "must-drop", authorization: "must-drop" }, body: '{"intent":{"action":"CREDENTIAL_REGISTER","operation_id":"00000000-0000-4000-8000-000000000001"}}'
    }), context);
}
describe("private staff proxy transport", () => {
    it("forwards exactly four auth cookies, existing age refusal and exact CSRF headers", async () => {
        const expected = authNames.map((name, i) => `${name}=${String.fromCharCode(97 + i).repeat(43)}`).join("; ");
        await proxy(`unrelated=drop; ${expected}; __Host-debateai-age-refusal=refused`);
        expect(forwarded.get("cookie")).toBe(`${expected}; __Host-debateai-age-refusal=refused`);
        expect(forwarded.get("x-staff-csrf-token")).toBe("d".repeat(43));
        expect(forwarded.get("x-csrf-token")).toBe("c".repeat(43));
        expect(forwarded.get("x-staff-token")).toBeNull();
        expect(forwarded.get("authorization")).toBeNull();
        expect(JSON.parse(receivedBody)).toEqual({ intent: { action: "CREDENTIAL_REGISTER", operation_id: "00000000-0000-4000-8000-000000000001" } });
    });
    it.each(authNames)("drops authority on duplicate or malformed %s", async (name) => {
        await proxy(`${authNames[0]}=${"a".repeat(43)}; ${name}=${"b".repeat(43)}; ${name}=${"c".repeat(43)}`);
        expect(forwarded.get("cookie")).toBeNull();
        await proxy(`${authNames[0]}=${"a".repeat(43)}; ${name}=bad`);
        expect(forwarded.get("cookie")).toBeNull();
    });
    it("accepts only exact secure staff issuance and zero-age clearing", async () => {
        outgoing = [
            `${authNames[2]}=${"s".repeat(43)}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`,
            `${authNames[3]}=${"c".repeat(43)}; Path=/; Max-Age=13; Secure; SameSite=Strict`
        ];
        expect((await proxy("")).headers.getSetCookie()).toEqual(outgoing);
        outgoing = [`${authNames[2]}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`, `${authNames[3]}=; Path=/; Max-Age=0; Secure; SameSite=Strict`];
        expect((await proxy("")).headers.getSetCookie()).toEqual(outgoing);
    });
    it.each(["Max-Age=28801", "Max-Age=-1", "Max-Age=0", "Max-Age=0001", "Path=/admin", "Domain=app.test", "SameSite=Lax", "SameSite=None", "HttpOnly; HttpOnly", "Secure; Secure"])("rejects insecure or malformed staff attributes: %s", async (bad) => {
        const lawful = `${authNames[2]}=${"s".repeat(43)}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`;
        outgoing = [bad.startsWith("Domain") ? `${lawful}; ${bad}` : lawful.replace(bad.split("=")[0] === "Max-Age" ? "Max-Age=28800" : bad.startsWith("Path") ? "Path=/" : bad.startsWith("SameSite") ? "SameSite=Strict" : bad.startsWith("HttpOnly") ? "HttpOnly" : "Secure", bad)];
        expect((await proxy("")).headers.getSetCookie()).toEqual([]);
    });
    it("suppresses duplicate upstream staff names even when the second cookie is malformed", async () => {
        outgoing = [`${authNames[2]}=${"s".repeat(43)}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`, `${authNames[2]}=bad; Path=/`];
        expect((await proxy("")).headers.getSetCookie()).toEqual([]);
    });
});
it("drops authority for a permitted cookie missing its pair separator", async () => {
    await proxy(`__Host-debateai-session=${"a".repeat(43)}; __Host-debateai-staff`);
    expect(forwarded.get("cookie")).toBeNull();
});
it("rejects missing Secure/HttpOnly and forbidden HttpOnly on staff CSRF", async () => {
    const lawful = `__Host-debateai-staff=${"s".repeat(43)}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`;
    for (const cookie of [lawful.replace("; Secure", ""), lawful.replace("; HttpOnly", ""), lawful.replace("__Host-debateai-staff=", "__Host-debateai-staff-csrf=")]) {
        outgoing = [cookie];
        expect((await proxy("")).headers.getSetCookie()).toEqual([]);
    }
});
it("never emits an elevation success body when permitted auth cookies were rejected", async () => {
    outgoing = [`__Host-debateai-staff=${"s".repeat(43)}; Path=/; Max-Age=28800; Secure; SameSite=Strict`];
    const result = await proxy("");
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ error: "UPSTREAM_AUTH_COOKIES_INVALID" });
    expect(result.headers.getSetCookie()).toEqual([]);
});
it("retains lawful ordinary Lax issuance/clearing and drops unrelated upstream cookies", async () => {
    outgoing = [`__Host-debateai-session=${"s".repeat(43)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`, `__Host-debateai-csrf=${"c".repeat(43)}; Path=/; Max-Age=1209600; Secure; SameSite=Lax`, "tracking=drop; Path=/"];
    let result = await proxy("");
    expect(result.status).toBe(200);
    expect(result.headers.getSetCookie()).toEqual(outgoing.slice(0, 2));
    outgoing = ["__Host-debateai-session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax", "__Host-debateai-csrf=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax"];
    result = await proxy("");
    expect(result.status).toBe(200);
    expect(result.headers.getSetCookie()).toEqual(outgoing);
});
it.each(["__Host-debateai-staff", "__Host-debateai-staff-csrf"])("never trims whitespace into valid %s request authority", async (name) => {
    for (const value of [` ${"s".repeat(43)}`, `${"s".repeat(43)} `, `\t${"s".repeat(43)}`]) {
        await proxy(`__Host-debateai-session=${"a".repeat(43)}; ${name}=${value}; unrelated=drop`);
        expect(forwarded.get("cookie")).toBeNull();
    }
});
it("preserves existing ordinary request whitespace normalization", async () => {
    await proxy(`__Host-debateai-session= ${"a".repeat(43)} ; __Host-debateai-csrf= ${"c".repeat(43)} ; unrelated=drop`);
    expect(forwarded.get("cookie")).toBe(`__Host-debateai-session=${"a".repeat(43)}; __Host-debateai-csrf=${"c".repeat(43)}`);
});
it("rejects upstream staff token whitespace without emitting an elevation success", async () => {
    outgoing = [`__Host-debateai-staff=${"s".repeat(43)} ; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`];
    const result = await proxy("");
    expect(result.status).toBe(502);
    expect(result.headers.getSetCookie()).toEqual([]);
});
