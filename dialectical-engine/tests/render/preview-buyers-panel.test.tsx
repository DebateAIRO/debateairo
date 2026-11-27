// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewBuyersPanel } from "../../apps/ui/components/PreviewBuyersPanel.js";
import { createPreviewBuyersClient } from "../../apps/ui/lib/previewBuyersApi.js";
import english from "../../apps/ui/messages/en/staff.json";
import romanian from "../../apps/ui/messages/ro/staff.json";
import { CSRF_COOKIE, holdReadableCookies, STAFF_CSRF_COOKIE } from "../support/sessionCookie.js";

// The team panels read once the team sign-in is done: each test starts in a browser that holds its cookies.
beforeEach(() => holdReadableCookies(CSRF_COOKIE, STAFF_CSRF_COOKIE).drop);

/**
 * The Owner's box on the Team page for who may buy while the whole site is open with buying kept to listed accounts
 * (migration 0186), with test payments or with real money. Everything runs through the real client over a fake server,
 * so each case reads the bodies that would reach the API: the look-up that shows the account's shortened address before
 * any key, the key ceremony's intent, and the change. Addresses are made up.
 */
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const S = english as Readonly<Record<string, string>>;
const ANA = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const NEW_REF = "33333333-3333-4333-8333-333333333333";
const ADDRESS = "stefan.nour@example.com";
const MASKED = "ste•••n.n•••our@example.com";
const handle = "a".repeat(43);
const proofHandle = "b".repeat(43);
const credential = { id: "aA", rawId: "aA", type: "public-key" as const, response: { clientDataJSON: "aA", authenticatorData: "aA", signature: "aA", userHandle: null }, clientExtensionResults: {} };

type Page = Readonly<{ applies: boolean; environment: "sandbox" | "live"; team_count: number; cap: number; revision: number; buyers: ReadonlyArray<Readonly<{ ref: string; masked_address: string | null; since: string }>> }>;
const basePage: Page = {
  applies: true, environment: "sandbox", team_count: 2, cap: 20, revision: 4,
  buyers: [{ ref: ANA, masked_address: "a•••@example.com", since: "2026-11-24T09:00:00.000Z" }, { ref: BOB, masked_address: null, since: "2026-11-20T09:00:00.000Z" }]
};
const withNew: Page = { ...basePage, revision: 5, buyers: [...basePage.buyers, { ref: NEW_REF, masked_address: MASKED, since: "2026-11-25T09:00:00.000Z" }] };

type Call = Readonly<{ path: string; method: string; body: Record<string, unknown> | null; headers: Headers }>;
/** A small API: `refuse` answers one path once with a status and a code; `after` is the page the reads return after a change or a refusal. */
function server(page: Page | null, options: { status?: number; refuse?: { path: string; status: number; error: string }; after?: Page | null; authenticate?: () => Promise<typeof credential> } = {}) {
  const calls: Call[] = [];
  let current = page;
  let refusal = options.refuse;
  const fetchImplementation = (async (input: RequestInfo | URL, init?: RequestInit) => {
    // The same-origin proxy prefix is the transport's business; the routes below are the API's own.
    const url = new URL(String(input).slice(String(input).indexOf("/v1/")), "http://localhost");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
    calls.push({ path: url.pathname + url.search, method, body, headers: new Headers(init?.headers) });
    if (refusal !== undefined && method !== "GET" && url.pathname === refusal.path) {
      const { status, error } = refusal;
      refusal = undefined;
      if (options.after !== undefined) current = options.after;
      return Response.json({ error }, { status });
    }
    if (url.pathname === "/v1/admin/preview-buyers" && method === "GET") {
      if (current === null) return Response.json({ error: "STAFF_REQUEST_REFUSED" }, { status: options.status ?? 403 });
      return Response.json(current);
    }
    if (url.pathname === "/v1/admin/preview-buyers/find") return Response.json({ masked_address: MASKED });
    if (url.pathname === "/v1/admin/webauthn/action/options") return Response.json({ challenge_handle: handle, options: { challenge: handle, rpId: "app.test", timeout: 300000, userVerification: "required", allowCredentials: [{ id: "aA", type: "public-key" }] } });
    if (url.pathname === "/v1/admin/webauthn/action/verify") return Response.json({ proof_handle: proofHandle, expires_at: "2099-01-01T00:00:00.000Z" });
    if (url.pathname.startsWith("/v1/admin/preview-buyers")) {
      if (options.after !== undefined) current = options.after;
      return Response.json({ operation_id: String(body?.operation_id), outcome: "COMPLETED", recorded_at: "2026-11-25T09:00:00.000Z" });
    }
    return Response.json({ error: "UNEXPECTED" }, { status: 500 });
  }) as typeof fetch;
  const client = createPreviewBuyersClient({ fetchImplementation, browser: { authenticate: options.authenticate ?? (async () => credential), register: async () => { throw Error("unused"); }, cancel() {} } });
  return {
    calls, client,
    proofs: () => calls.filter(call => call.path === "/v1/admin/webauthn/action/options").map(call => call.body!.intent as Record<string, unknown>),
    changes: () => calls.filter(call => call.path.startsWith("/v1/admin/preview-buyers") && call.path !== "/v1/admin/preview-buyers/find" && call.method !== "GET"),
    finds: () => calls.filter(call => call.path === "/v1/admin/preview-buyers/find")
  };
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function mount(api: ReturnType<typeof server>, locale = "en", catalog: Record<string, string> = english) {
  await act(async () => root.render(<PreviewBuyersPanel client={api.client} catalog={catalog} locale={locale as "en"}/>));
}
const text = () => host.textContent ?? "";
const button = (label: string, scope: ParentNode = host) => [...scope.querySelectorAll("button")].find(item => item.textContent?.trim() === label);
const field = () => host.querySelector<HTMLInputElement>("#preview-buyer-address");
const row = (ref: string) => host.querySelector(`[data-preview-buyer="${ref}"]`)!;
async function allow(address: string) {
  const form = host.querySelector<HTMLFormElement>("form[data-preview-buyers-form]")!;
  field()!.value = address;
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
async function confirm() { await act(async () => button("Confirm")!.click()); }
const status = () => host.querySelector('[role="status"]')?.textContent ?? null;

describe("who sees the box", () => {
  it.each([[403, "STAFF_REQUEST_REFUSED"], [401, "UNAUTHORIZED"], [404, "NOT_FOUND"], [503, "STAFF_UNAVAILABLE"]])("renders nothing at all on %i", async status => {
    await mount(server(null, { status }));
    expect(host.innerHTML).toBe("");
  });
  it("renders nothing when the answer is not the page's shape", async () => {
    await mount(server({ ...basePage, buyers: [{ ref: ANA, masked_address: "a•••@example.com", since: "yesterday" }] }));
    expect(host.innerHTML).toBe("");
  });
  it("appears when team access is verified and goes when that authority ends", async () => {
    let current: Page | null = null;
    const fetchThrough = createPreviewBuyersClient({ browser: { authenticate: async () => credential, register: async () => { throw Error("unused"); }, cancel() {} },
      fetchImplementation: (async () => current === null ? Response.json({ error: "UNAUTHORIZED" }, { status: 401 }) : Response.json(current)) as typeof fetch });
    await act(async () => root.render(<PreviewBuyersPanel client={fetchThrough}/>));
    expect(host.innerHTML).toBe("");
    current = basePage;
    await act(async () => window.dispatchEvent(new CustomEvent("debateai:staff-authority-changed", { detail: { capabilities: ["TEAM_GRANT"] } })));
    expect(text()).toContain(S["staff.previewBuyers.title"]);
    await act(async () => window.dispatchEvent(new CustomEvent("debateai:staff-authority-changed", { detail: { capabilities: [] } })));
    expect(host.innerHTML).toBe("");
  });
  it("is mounted on the team page", async () => {
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => String(input).endsWith("/v1/admin/preview-buyers")
      ? Response.json(basePage) : Response.json({ error: "UNAUTHORIZED" }, { status: 401 })) as typeof fetch);
    const { default: TeamPage } = await import("../../apps/ui/app/admin/team/page.js");
    const page = await TeamPage();
    await act(async () => root.render(page));
    expect(host.querySelector("[data-preview-buyers-panel]")?.textContent).toContain("Who may buy while payments are in test mode");
  });
});

describe("the list", () => {
  it("shows each account's shortened address and the day it was allowed, and how many can buy with the team", async () => {
    await mount(server(basePage));
    expect(host.querySelector("h2")?.textContent).toBe("Who may buy while payments are in test mode");
    expect(host.querySelector("[data-preview-buyers-count]")?.textContent).toBe("4 of 20 accounts can buy, the team included.");
    expect(row(ANA).textContent).toContain("a•••@example.com");
    expect(row(ANA).textContent).toContain("allowed on 24 Nov 2026");
    // An address that cannot be read now says so; the row can still be removed.
    expect(row(BOB).textContent).toContain("address not readable now");
    expect(button("Remove", row(BOB))).toBeDefined();
    // Each Remove is described by its own row's address, for a screen reader.
    const remove = button("Remove", row(ANA))!;
    expect(host.querySelector(`#${remove.getAttribute("aria-describedby")}`)?.textContent).toBe("a•••@example.com");
    expect(host.querySelector("[data-preview-buyers-not-now]")).toBeNull();
    // The form says what a change needs: the security key alone, with no alert while the team tools are locked.
    expect(host.querySelector("form[data-preview-buyers-form]")?.textContent).toContain(
      "Adding and removing need only your security key. While the team tools are locked, no security alert goes out, but the change is still recorded.");
  });
  it("says so when nobody is on it", async () => {
    await mount(server({ ...basePage, buyers: [] }));
    expect(text()).toContain("No account is on this list.");
    expect(host.querySelector("[data-preview-buyers-count]")?.textContent).toBe("2 of 20 accounts can buy, the team included.");
  });
  it("while the list counts for nothing, says so, offers no addition, and still offers Remove", async () => {
    await mount(server({ ...basePage, applies: false }));
    expect(text()).toContain("This list counts only while the whole site is open with buying kept to invited accounts. It counts for nothing right now.");
    expect(host.querySelector("form[data-preview-buyers-form]")).toBeNull();
    expect(button("Remove", row(ANA))).toBeDefined();
  });
  it("while the list counts for nothing, counts only who is on it and does not say they can buy", async () => {
    await mount(server({ ...basePage, applies: false }));
    expect(host.querySelector("[data-preview-buyers-count]")?.textContent).toBe("Accounts on this list: 2.");
    expect(text()).not.toContain("accounts can buy");
  });
  it("while the list counts for nothing and nobody is on it, says only that", async () => {
    await mount(server({ ...basePage, applies: false, buyers: [] }));
    expect(host.querySelector("[data-preview-buyers-count]")).toBeNull();
    expect(text()).toContain("No account is on this list.");
    expect(text()).not.toContain("accounts can buy");
  });
});

describe("allowing an account to buy", () => {
  it("looks the address up first, confirms with the shortened address and the test-plan rule, then proves and sends the change", async () => {
    const api = server(basePage, { after: withNew });
    await mount(api);
    await allow(`  ${ADDRESS} `);
    // The look-up carries the address in its body; no key has been asked for yet.
    expect(api.finds().map(call => [call.method, call.body])).toEqual([["POST", { address: ADDRESS }]]);
    expect(api.proofs()).toEqual([]);
    const confirmBox = host.querySelector("[data-preview-buyers-confirm=add]")!;
    expect(confirmBox.textContent).toContain(`Allow ${MASKED} to buy test plans? Each test plan it buys must be withdrawn or cancelled within 14 days, before real payments.`);
    expect(confirmBox.textContent).toContain("Touch your security key to confirm.");
    expect(confirmBox.textContent).not.toContain(ADDRESS);
    await confirm();
    const [intent] = api.proofs();
    expect(intent).toEqual({ action: "PREVIEW_BUYER_ADD", address: ADDRESS, expected_revision: 4, operation_id: expect.any(String) });
    const [post] = api.changes();
    expect([post!.method, post!.path]).toEqual(["POST", "/v1/admin/preview-buyers"]);
    expect(post!.body).toEqual({ address: ADDRESS, expected_revision: 4, operation_id: intent!.operation_id, proof_handle: proofHandle });
    expect(status()).toBe("Done: this account can buy now.");
    expect(row(NEW_REF).textContent).toContain(MASKED);
    expect(field()!.value).toBe("");
  });
  it("a fresh operation per change", async () => {
    const api = server(basePage);
    await mount(api);
    for (let round = 0; round < 2; round++) { await allow(ADDRESS); await confirm(); }
    const [first, second] = api.proofs();
    expect(first!.operation_id).not.toBe(second!.operation_id);
  });
  it("asks the server nothing for something that is not an address, and clears the field", async () => {
    const api = server(basePage);
    await mount(api);
    for (const typed of ["", "ana", "ana@", "a b@example.com"]) {
      await allow(typed);
      expect(status(), typed).toBe("That is not an email address. Check it and try again.");
      expect(field()!.value).toBe("");
    }
    expect(api.finds()).toEqual([]);
  });
  it.each([
    [404, "PREVIEW_BUYER_ACCOUNT_UNKNOWN", "No account uses that address. The person must sign up first."],
    [409, "PREVIEW_BUYER_ON_TEAM", "That account is on the team: it can buy already."],
    [409, "PREVIEW_BUYER_ALREADY", "That account can buy already."],
    [409, "PREVIEW_BUYERS_FULL", "The list is full (20 accounts, the team included). Remove one first."],
    [409, "PREVIEW_BUYERS_NOT_OPEN", "Adding works only while the whole site is open with buying kept to invited accounts. Nothing changed."],
    [422, "STAFF_INPUT_INVALID", "That is not an email address. Check it and try again."]
  ])("the look-up's %i %s is said plainly, before any key, and the field is cleared", async (status_, error, sentence) => {
    const api = server(basePage, { refuse: { path: "/v1/admin/preview-buyers/find", status: status_, error } });
    await mount(api);
    await allow(ADDRESS);
    expect(status()).toBe(sentence);
    expect(button("Confirm")).toBeUndefined();
    expect(api.proofs()).toEqual([]);
    expect(field()!.value).toBe("");
    expect(text()).not.toContain(error);
  });
  it("the team tools locking while a change is saved: says nothing changed and that the key alone is enough to try again", async () => {
    const api = server(basePage, { refuse: { path: "/v1/admin/webauthn/action/options", status: 503, error: "STAFF_ALERT_UNAVAILABLE" } });
    await mount(api);
    await allow(ADDRESS);
    await confirm();
    expect(status()).toBe("The team tools locked while this was being saved, so nothing changed. Try again: your security key alone is enough.");
    expect(api.changes()).toEqual([]);
    expect(field()!.value).toBe("");
  });
  it("a list that changed meanwhile says so and shows the list as it is now", async () => {
    const api = server(basePage, { refuse: { path: "/v1/admin/webauthn/action/options", status: 409, error: "PREVIEW_BUYERS_STALE" }, after: withNew });
    await mount(api);
    await allow(ADDRESS);
    await confirm();
    expect(status()).toBe("The list changed meanwhile. Nothing changed: look at the list again and repeat.");
    expect(row(NEW_REF)).not.toBeNull();
  });
  it.each([
    [409, "PREVIEW_BUYERS_FULL", "The list is full (20 accounts, the team included). Remove one first."],
    [409, "PREVIEW_BUYER_ALREADY", "That account can buy already."],
    [409, "STAFF_OPERATION_CONFLICT", "This clashed with another change. Nothing changed: look at the list again and repeat."],
    [503, "STAFF_ALERT_UNAVAILABLE", "The team tools locked while this was being saved, so nothing changed. Try again: your security key alone is enough."],
    [500, "SOME_INTERNAL_CODE", "This did not go through. Look at the list and try again."]
  ])("the change's %i %s is one plain sentence with no code in it", async (status_, error, sentence) => {
    const api = server(basePage, { refuse: { path: "/v1/admin/preview-buyers", status: status_, error } });
    await mount(api);
    await allow(ADDRESS);
    await confirm();
    expect(status()).toBe(sentence);
    expect(text()).not.toContain(error);
  });
  it("Cancel closes the confirmation without a key and clears the field", async () => {
    const api = server(basePage);
    await mount(api);
    await allow(ADDRESS);
    await act(async () => button("Cancel")!.click());
    expect(button("Confirm")).toBeUndefined();
    expect(api.proofs()).toEqual([]);
    expect(field()!.value).toBe("");
  });
  it("a cancelled key says nothing changed and sends nothing", async () => {
    const api = server(basePage, { authenticate: async () => { throw new Error("STAFF_WEBAUTHN_CANCELLED"); } });
    await mount(api);
    await allow(ADDRESS);
    await confirm();
    expect(status()).toBe("Nothing changed.");
    expect(api.changes()).toEqual([]);
  });
  it.each([[404, "NOT_FOUND"], [403, "STAFF_REQUEST_REFUSED"]])("a change answered %i %s, with the list no longer readable after it, takes the box away", async (code, error) => {
    const api = server(basePage, { status: code, refuse: { path: "/v1/admin/preview-buyers", status: code, error }, after: null });
    await mount(api);
    await allow(ADDRESS);
    await confirm();
    expect(host.innerHTML).toBe("");
  });
});

describe("with real payments", () => {
  const live: Page = { ...basePage, environment: "live" };
  it("the title and the hint say real money, and nothing speaks of test plans", async () => {
    await mount(server(live));
    expect(host.querySelector("h2")?.textContent).toBe("Who may buy plans with real money");
    expect(text()).toContain("While the whole site is open, the team and the accounts below can buy a plan with real money.");
    expect(text()).not.toContain("test mode");
    expect(host.querySelector("[data-preview-buyers-count]")?.textContent).toBe("4 of 20 accounts can buy, the team included.");
  });
  it("the confirmation says real money and that a plan renews, with no rule to withdraw it, then proves and sends the change", async () => {
    const api = server(live, { after: { ...withNew, environment: "live" } });
    await mount(api);
    await allow(ADDRESS);
    const confirmBox = host.querySelector("[data-preview-buyers-confirm=add]")!;
    expect(confirmBox.textContent).toContain(`Allow ${MASKED} to buy plans with real money? A plan it buys renews each month on its card until it is cancelled.`);
    expect(confirmBox.textContent).not.toMatch(/test plan|14 days/u);
    await confirm();
    expect(api.proofs()).toEqual([{ action: "PREVIEW_BUYER_ADD", address: ADDRESS, expected_revision: 4, operation_id: expect.any(String) }]);
    expect(status()).toBe("Done: this account can buy now.");
    expect(row(NEW_REF).textContent).toContain(MASKED);
  });
  it("while the list counts for nothing, the box says so in the same words as with test payments", async () => {
    await mount(server({ ...live, applies: false }));
    expect(host.querySelector("h2")?.textContent).toBe("Who may buy plans with real money");
    expect(host.querySelector("[data-preview-buyers-not-now]")?.textContent).toBe(S["staff.previewBuyers.notNow"]);
    expect(host.querySelector("form[data-preview-buyers-form]")).toBeNull();
  });
  it("an answer that names no payment system is not the page's shape, and renders nothing", async () => {
    const { environment: _environment, ...without } = basePage;
    await mount(server(without as unknown as Page));
    expect(host.innerHTML).toBe("");
  });
});

describe("removing an account", () => {
  it("names the row by its ref, confirms with its shortened address, proves and sends a DELETE", async () => {
    const api = server(basePage, { after: { ...basePage, revision: 5, buyers: [basePage.buyers[1]!] } });
    await mount(api);
    await act(async () => button("Remove", row(ANA))!.click());
    expect(api.proofs()).toEqual([]);
    const confirmBox = host.querySelector("[data-preview-buyers-confirm=remove]")!;
    expect(confirmBox.textContent).toContain("Stop a•••@example.com from buying? A plan it bought goes on until it is withdrawn or cancelled.");
    await confirm();
    const [intent] = api.proofs();
    expect(intent).toEqual({ action: "PREVIEW_BUYER_REMOVE", buyer_ref: ANA, expected_revision: 4, operation_id: expect.any(String) });
    const [sent] = api.changes();
    expect([sent!.method, sent!.path]).toEqual(["DELETE", `/v1/admin/preview-buyers/${ANA}`]);
    expect(sent!.body).toEqual({ expected_revision: 4, operation_id: intent!.operation_id, proof_handle: proofHandle });
    expect(status()).toBe("Done: this account can no longer start a purchase.");
    expect(host.querySelector(`[data-preview-buyer="${ANA}"]`)).toBeNull();
  });
  it("works while the list counts for nothing, and a row that is gone says so", async () => {
    const api = server({ ...basePage, applies: false }, { refuse: { path: `/v1/admin/preview-buyers/${BOB}`, status: 404, error: "PREVIEW_BUYER_NOT_LISTED" } });
    await mount(api);
    await act(async () => button("Remove", row(BOB))!.click());
    expect(host.querySelector("[data-preview-buyers-confirm=remove]")!.textContent).toContain("Stop address not readable now from buying?");
    await confirm();
    expect(api.proofs()).toEqual([{ action: "PREVIEW_BUYER_REMOVE", buyer_ref: BOB, expected_revision: 4, operation_id: expect.any(String) }]);
    expect(status()).toBe("That account is not on the list any more. Nothing changed.");
  });
});

describe("privacy and the words", () => {
  const ours = (catalog: Record<string, string>) => Object.entries(catalog).filter(([key]) => key.startsWith("staff.previewBuyers."));
  it("the typed address goes only in request bodies: never in a path, browser storage or the page; the staff guards go with every change", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(`__Host-debateai-csrf=${"p".repeat(43)}; __Host-debateai-staff-csrf=${"s".repeat(43)}`);
    const api = server(basePage, { after: withNew });
    await mount(api);
    await allow(ADDRESS);
    await confirm();
    for (const call of api.calls) {
      expect(call.path).not.toContain("@");
      expect(call.path).not.toContain(encodeURIComponent(ADDRESS));
      expect(call.path).not.toContain(proofHandle);
    }
    expect(sessionStorage.length + localStorage.length).toBe(0);
    expect(host.innerHTML).not.toContain(ADDRESS);
    for (const call of [...api.finds(), ...api.changes()]) {
      expect(call.headers.get("x-csrf-token")).toBe("p".repeat(43));
      expect(call.headers.get("x-staff-csrf-token")).toBe("s".repeat(43));
    }
  });
  it("English and Romanian hold the same keys and placeholders", () => {
    const placeholders = (value: string) => [...value.matchAll(/\{[A-Za-z]+\}/gu)].map(match => match[0]).sort();
    expect(ours(romanian).map(([key]) => key).sort()).toEqual(ours(english).map(([key]) => key).sort());
    const ro = romanian as Record<string, string>;
    for (const [key, value] of ours(english)) expect(placeholders(ro[key]!), key).toEqual(placeholders(value));
  });
  it("no sentence names an internal", () => {
    for (const catalog of [english, romanian]) for (const [key, value] of ours(catalog)) expect(value, key).not.toMatch(/revision|proof|PREVIEW_|TEAM_|STAFF_|\bAPI\b|allowance/iu);
  });
  it("prints every sentence from the catalogue it is given", async () => {
    const marked = Object.fromEntries(ours(english).map(([key, value]) => [key, `[ro] ${value}`]));
    await mount(server(basePage), "ro", { ...romanian, ...marked });
    expect(host.querySelector("h2")?.textContent).toBe("[ro] Who may buy while payments are in test mode");
    expect(text()).not.toMatch(/\bstaff\.previewBuyers\./u);
  });
});
