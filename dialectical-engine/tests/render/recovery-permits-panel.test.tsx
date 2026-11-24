// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecoveryPermitsPanel } from "../../apps/ui/components/RecoveryPermitsPanel.js";
import { createRecoveryPermitsClient } from "../../apps/ui/lib/recoveryPermitsApi.js";
import english from "../../apps/ui/messages/en/staff.json";
import romanian from "../../apps/ui/messages/ro/staff.json";
import { formatDate } from "../../apps/ui/lib/i18n/translate.js";
import { CSRF_COOKIE, holdReadableCookies, STAFF_CSRF_COOKIE } from "../support/sessionCookie.js";

// The team panels read once the team sign-in is done: each test starts in a browser that holds its cookies.
beforeEach(() => holdReadableCookies(CSRF_COOKIE, STAFF_CSRF_COOKIE).drop);

/**
 * The Owner's box on the Team page for requests to get back into an account (migration 0188). Everything runs through
 * the real client over a fake server, so each case reads the bodies that would reach the API: the key ceremony's intent
 * and the decision with its proof handle. Addresses are made up and arrive already shortened, as the API sends them.
 */
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const ANA = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const CARA = "33333333-3333-4333-8333-333333333333";
const DAN = "44444444-4444-4444-8444-444444444444";
const handle = "a".repeat(43);
const proofHandle = "b".repeat(43);
const credential = { id: "aA", rawId: "aA", type: "public-key" as const, response: { clientDataJSON: "aA", authenticatorData: "aA", signature: "aA", userHandle: null }, clientExtensionResults: {} };

type Row = Record<string, unknown>;
type Page = Readonly<{ daily_cap: number; approved_today: number; requests: readonly Row[] }>;
const ask = (ref: string, changes: Row = {}): Row => ({
  ref, revision: 3, stage: "REQUESTED", masked_address: "a•••@example.com",
  requested_at: "2026-11-24T09:00:00.000Z", request_expires_at: "2026-11-27T09:00:00.000Z",
  approved_at: null, not_before: null, finish_expires_at: null,
  account_created_at: "2025-03-02T10:00:00.000Z", last_sign_in_at: "2026-11-01T08:30:00.000Z",
  passkeys: 2, authenticator_app: true, saved_codes_left: false, security_hold: false, risk_mark: false, ever_paid: true, earlier_requests: 1,
  ...changes
});
const basePage: Page = {
  daily_cap: 3, approved_today: 1,
  requests: [
    ask(ANA),
    ask(BOB, { masked_address: null, last_sign_in_at: null, passkeys: 0, authenticator_app: false, saved_codes_left: true, ever_paid: null, earlier_requests: 0, revision: 7 }),
    ask(CARA, { stage: "WAITING", masked_address: "c•••@example.com", approved_at: "2026-11-24T10:00:00.000Z", not_before: "2026-11-27T10:00:00.000Z", finish_expires_at: "2026-12-04T10:00:00.000Z", revision: 5 }),
    ask(DAN, { stage: "OPENED", masked_address: "d•••@example.com", approved_at: "2026-11-20T10:00:00.000Z", not_before: "2026-11-23T10:00:00.000Z", finish_expires_at: "2026-11-30T10:00:00.000Z", revision: 9 })
  ]
};

type Call = Readonly<{ path: string; method: string; body: Record<string, unknown> | null; headers: Headers }>;
/** A small API: `refuse` answers one path once with a status and a code; `after` is the page the reads return after a change or a refusal. */
function server(page: Page | null, options: { status?: number; refuse?: { path: string; status: number; error: string }; after?: Page | null; authenticate?: () => Promise<typeof credential> } = {}) {
  const calls: Call[] = [];
  let current = page;
  let refusal = options.refuse;
  const fetchImplementation = (async (input: RequestInfo | URL, init?: RequestInit) => {
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
    if (url.pathname === "/v1/admin/recovery-permits" && method === "GET") {
      if (current === null) return Response.json({ error: "STAFF_REQUEST_REFUSED" }, { status: options.status ?? 403 });
      return Response.json(current);
    }
    if (url.pathname === "/v1/admin/webauthn/action/options") return Response.json({ challenge_handle: handle, options: { challenge: handle, rpId: "app.test", timeout: 300000, userVerification: "required", allowCredentials: [{ id: "aA", type: "public-key" }] } });
    if (url.pathname === "/v1/admin/webauthn/action/verify") return Response.json({ proof_handle: proofHandle, expires_at: "2099-01-01T00:00:00.000Z" });
    if (url.pathname.startsWith("/v1/admin/recovery-permits/")) {
      if (options.after !== undefined) current = options.after;
      return Response.json({ operation_id: String(body?.operation_id), outcome: "COMPLETED", recorded_at: "2026-11-25T09:00:00.000Z" });
    }
    return Response.json({ error: "UNEXPECTED" }, { status: 500 });
  }) as typeof fetch;
  const client = createRecoveryPermitsClient({ fetchImplementation, browser: { authenticate: options.authenticate ?? (async () => credential), register: async () => { throw Error("unused"); }, cancel() {} } });
  return {
    calls, client,
    proofs: () => calls.filter(call => call.path === "/v1/admin/webauthn/action/options").map(call => call.body!.intent as Record<string, unknown>),
    decisions: () => calls.filter(call => call.path.startsWith("/v1/admin/recovery-permits/"))
  };
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function mount(api: ReturnType<typeof server>, locale = "en", catalog: Record<string, string> = english) {
  await act(async () => root.render(<RecoveryPermitsPanel client={api.client} catalog={catalog} locale={locale as "en"}/>));
}
const text = () => host.textContent ?? "";
const button = (label: string, scope: ParentNode = host) => [...scope.querySelectorAll("button")].find(item => item.textContent?.trim() === label);
const row = (ref: string) => host.querySelector(`[data-recovery-permit="${ref}"]`)!;
const facts = (ref: string) => Object.fromEntries([...row(ref).querySelectorAll("dl > div")].map(pair => [pair.querySelector("dt")!.textContent, pair.querySelector("dd")!.textContent]));
async function confirm() { await act(async () => button("Confirm")!.click()); }
const status = () => host.querySelector('[role="status"]')?.textContent ?? null;
/** A moment as the page writes it, in this machine's time zone. */
const at = (iso: string) => formatDate("en", iso, { dateStyle: "medium", timeStyle: "short" });

describe("who sees the box", () => {
  it.each([[403, "STAFF_REQUEST_REFUSED"], [401, "UNAUTHORIZED"], [404, "NOT_FOUND"], [503, "STAFF_UNAVAILABLE"]])("renders nothing at all on %i", async status_ => {
    await mount(server(null, { status: status_ }));
    expect(host.innerHTML).toBe("");
  });
  it("renders nothing when the answer is not the page's shape", async () => {
    await mount(server({ ...basePage, requests: [ask(ANA, { requested_at: "yesterday" })] }));
    expect(host.innerHTML).toBe("");
  });
  it("sends nothing before the team sign-in, appears after it and goes when that authority ends", async () => {
    let current: Page | null = null;
    const paths: string[] = [];
    const fetchThrough = createRecoveryPermitsClient({ browser: { authenticate: async () => credential, register: async () => { throw Error("unused"); }, cancel() {} },
      fetchImplementation: (async (input: RequestInfo | URL) => { paths.push(String(input)); return current === null ? Response.json({ error: "UNAUTHORIZED" }, { status: 401 }) : Response.json(current); }) as typeof fetch });
    // Only the site's own cookie: no team sign-in yet in this browser.
    holdReadableCookies(CSRF_COOKIE);
    await act(async () => root.render(<RecoveryPermitsPanel client={fetchThrough}/>));
    expect(host.innerHTML).toBe("");
    expect(paths).toEqual([]);
    current = basePage;
    await act(async () => window.dispatchEvent(new CustomEvent("debateai:staff-authority-changed", { detail: { capabilities: ["TEAM_GRANT"] } })));
    expect(text()).toContain("Requests to get back into an account");
    await act(async () => window.dispatchEvent(new CustomEvent("debateai:staff-authority-changed", { detail: { capabilities: [] } })));
    expect(host.innerHTML).toBe("");
  });
  it("is mounted on the team page, right after the buyers box", async () => {
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => String(input).endsWith("/v1/admin/recovery-permits")
      ? Response.json(basePage) : String(input).endsWith("/v1/admin/preview-buyers")
        ? Response.json({ applies: true, team_count: 1, cap: 20, revision: 1, buyers: [] }) : Response.json({ error: "UNAUTHORIZED" }, { status: 401 })) as typeof fetch);
    const { default: TeamPage } = await import("../../apps/ui/app/admin/team/page.js");
    const page = await TeamPage();
    await act(async () => root.render(page));
    const panel = host.querySelector("[data-recovery-permits-panel]");
    expect(panel?.textContent).toContain("Requests to get back into an account");
    expect(panel?.previousElementSibling?.hasAttribute("data-preview-buyers-panel")).toBe(true);
  });
});

describe("the requests", () => {
  it("shows every fact the API sent, as it sent it, and how many approvals are used", async () => {
    await mount(server(basePage));
    expect(host.querySelector("h2")?.textContent).toBe("Requests to get back into an account");
    expect(host.querySelector("[data-recovery-permits-used]")?.textContent).toBe("1 of 3 approvals used in the last 24 hours.");
    expect(row(ANA).querySelector("h3")?.textContent).toBe("a•••@example.com");
    expect(facts(ANA)).toEqual({
      "Asked": at("2026-11-24T09:00:00.000Z"), "Ends by itself": at("2026-11-27T09:00:00.000Z"), "Account made": "2 Mar 2025", "Last sign-in": at("2026-11-01T08:30:00.000Z"),
      "Proofs given": "mailbox link and password", "Passkeys": "2", "Authenticator app": "yes", "Saved recovery codes left": "no",
      "Security hold": "no", "Risk mark": "no", "Has ever paid": "yes", "Earlier requests": "1"
    });
    expect(row(BOB).querySelector("h3")?.textContent).toBe("address unavailable");
    expect(facts(BOB)).toMatchObject({ "Last sign-in": "never", "Passkeys": "0", "Authenticator app": "no", "Saved recovery codes left": "yes", "Has ever paid": "unknown", "Earlier requests": "0" });
    expect(button("Approve", row(ANA))!.disabled).toBe(false);
    expect(button("Refuse", row(ANA))!.disabled).toBe(false);
  });
  it("masks nothing itself: an address is printed exactly as the API sent it", async () => {
    await mount(server({ ...basePage, requests: [ask(ANA, { masked_address: "stefan.nour@example.com" })] }));
    expect(row(ANA).querySelector("h3")?.textContent).toBe("stefan.nour@example.com");
  });
  it("lists the approved ones apart, with when the finish link works and a Stop", async () => {
    await mount(server(basePage));
    const approved = host.querySelector("[data-recovery-permits-approved]")!;
    expect(approved.querySelectorAll("li")).toHaveLength(2);
    expect(row(CARA).textContent).toContain("c•••@example.com");
    expect(row(CARA).textContent).toContain(`approved ${at("2026-11-24T10:00:00.000Z")}`);
    expect(row(CARA).textContent).toContain(`the finish link works from ${at("2026-11-27T10:00:00.000Z")} until ${at("2026-12-04T10:00:00.000Z")}`);
    expect(row(CARA).textContent).not.toContain("the finish link was opened");
    expect(row(DAN).textContent).toContain("the finish link was opened");
    expect(button("Stop", row(CARA))).toBeDefined();
    expect(button("Stop", row(DAN))).toBeDefined();
    expect(button("Approve", row(CARA))).toBeUndefined();
  });
  it("says so in one sentence when nobody asks", async () => {
    await mount(server({ ...basePage, requests: [] }));
    expect(host.querySelector("[data-recovery-permits-empty]")?.textContent).toBe("Nobody is asking for help right now.");
    expect(host.querySelector("[data-recovery-permits-approved]")).toBeNull();
  });
  it.each([
    [{ security_hold: true }, 1, "Approve is off: this account is under a security hold."],
    [{ risk_mark: true }, 1, "Approve is off: this account has a risk mark."],
    [{}, 3, "Approve is off: 3 approvals in 24 hours is the most allowed."]
  ])("turns Approve off with the reason (%o, %i used), and Refuse stays on", async (changes, used, reason) => {
    await mount(server({ ...basePage, approved_today: used, requests: [ask(ANA, changes)] }));
    const approve = button("Approve", row(ANA))!;
    expect(approve.disabled).toBe(true);
    const said = row(ANA).querySelector("[data-recovery-permit-blocked]")!;
    expect(said.textContent).toBe(reason);
    expect(approve.getAttribute("aria-describedby")?.split(" ")).toContain(said.id);
    expect(button("Refuse", row(ANA))!.disabled).toBe(false);
  });
});

describe("deciding", () => {
  it("approving says what it does before the key, then proves with the right intent and sends the proof handle", async () => {
    const api = server(basePage, { after: { ...basePage, approved_today: 2, requests: basePage.requests.slice(1) } });
    await mount(api);
    await act(async () => button("Approve", row(ANA))!.click());
    expect(api.proofs()).toEqual([]);
    const box = host.querySelector("[data-recovery-permits-confirm=approve]")!;
    expect(box.textContent).toContain("Approve the request for a•••@example.com? The account then waits 72 hours. Every address on the account is told and can cancel. After that, the person may set up one new sign-in method.");
    expect(box.textContent).toContain("Touch your security key to confirm.");
    await confirm();
    const [intent] = api.proofs();
    expect(intent).toEqual({ action: "RECOVERY_PERMIT_APPROVE", request_ref: ANA, expected_revision: 3, operation_id: expect.any(String) });
    const [sent] = api.decisions();
    expect([sent!.method, sent!.path]).toEqual(["POST", `/v1/admin/recovery-permits/${ANA}/approve`]);
    expect(sent!.body).toEqual({ expected_revision: 3, operation_id: intent!.operation_id, proof_handle: proofHandle });
    expect(status()).toBe("Done: the request is approved. The 72-hour wait has started.");
    expect(host.querySelector("[data-recovery-permits-used]")?.textContent).toBe("2 of 3 approvals used in the last 24 hours.");
  });
  it("refusing a request uses the refusal intent and its own revision", async () => {
    const api = server(basePage);
    await mount(api);
    await act(async () => button("Refuse", row(BOB))!.click());
    expect(host.querySelector("[data-recovery-permits-confirm=refuse]")!.textContent).toContain("Refuse the request for address unavailable? Nothing on the account changes.");
    await confirm();
    expect(api.proofs()).toEqual([{ action: "RECOVERY_PERMIT_REFUSE", request_ref: BOB, expected_revision: 7, operation_id: expect.any(String) }]);
    const [sent] = api.decisions();
    expect([sent!.method, sent!.path]).toEqual(["POST", `/v1/admin/recovery-permits/${BOB}/refuse`]);
    expect(status()).toBe("Done: the request is refused.");
  });
  it.each([[CARA, 5], [DAN, 9]])("Stop on an approved request is the refusal, at either stage (%s)", async (ref, revision) => {
    const api = server(basePage);
    await mount(api);
    await act(async () => button("Stop", row(ref))!.click());
    expect(host.querySelector("[data-recovery-permits-confirm=stop]")!.textContent).toContain("Stop the approved request for");
    await confirm();
    expect(api.proofs()).toEqual([{ action: "RECOVERY_PERMIT_REFUSE", request_ref: ref, expected_revision: revision, operation_id: expect.any(String) }]);
    expect(api.decisions().map(call => call.path)).toEqual([`/v1/admin/recovery-permits/${ref}/refuse`]);
    expect(status()).toBe("Done: the request is stopped.");
  });
  it("Cancel closes the confirmation without a key", async () => {
    const api = server(basePage);
    await mount(api);
    await act(async () => button("Approve", row(ANA))!.click());
    await act(async () => button("Cancel")!.click());
    expect(button("Confirm")).toBeUndefined();
    expect(api.proofs()).toEqual([]);
  });
  it("a cancelled key says nothing changed and sends nothing", async () => {
    const api = server(basePage, { authenticate: async () => { throw new Error("STAFF_WEBAUTHN_CANCELLED"); } });
    await mount(api);
    await act(async () => button("Approve", row(ANA))!.click());
    await confirm();
    expect(status()).toBe("Nothing changed.");
    expect(api.decisions()).toEqual([]);
  });
  it.each([
    [409, "RECOVERY_PERMITS_STALE", "The list changed meanwhile. Nothing changed: look at the list again and repeat."],
    [409, "RECOVERY_PERMIT_NOT_ALLOWED", "This account is under a security hold or has a risk mark, so it cannot be approved. Nothing changed."],
    [409, "RECOVERY_PERMITS_DAILY_CAP", "3 approvals in 24 hours is the most allowed, and that is reached. Nothing changed: try again later."],
    [503, "STAFF_ALERT_UNAVAILABLE", "The team tools are locked, so nothing was approved. Unlock them on the server, then try again. Refusing and stopping work while they are locked."],
    [500, "SOME_INTERNAL_CODE", "This did not go through. Look at the list and try again."]
  ])("the decision's %i %s is one plain sentence with no code in it", async (status_, error, sentence) => {
    const api = server(basePage, { refuse: { path: `/v1/admin/recovery-permits/${ANA}/approve`, status: status_, error } });
    await mount(api);
    await act(async () => button("Approve", row(ANA))!.click());
    await confirm();
    expect(status()).toBe(sentence);
    expect(text()).not.toContain(error);
  });
  it("locked team tools refuse before the key's ceremony too, in the same sentence", async () => {
    const api = server(basePage, { refuse: { path: "/v1/admin/webauthn/action/options", status: 503, error: "STAFF_ALERT_UNAVAILABLE" } });
    await mount(api);
    await act(async () => button("Approve", row(ANA))!.click());
    await confirm();
    expect(status()).toContain("The team tools are locked");
    expect(api.decisions()).toEqual([]);
  });
});

describe("the words", () => {
  const ours = (catalog: Record<string, string>) => Object.entries(catalog).filter(([key]) => key.startsWith("staff.recoveryPermits."));
  it("English and Romanian hold the same keys and placeholders", () => {
    const placeholders = (value: string) => [...value.matchAll(/\{[A-Za-z]+\}/gu)].map(match => match[0]).sort();
    expect(ours(romanian).map(([key]) => key).sort()).toEqual(ours(english).map(([key]) => key).sort());
    const ro = romanian as Record<string, string>;
    for (const [key, value] of ours(english)) expect(placeholders(ro[key]!), key).toEqual(placeholders(value));
  });
  it("no sentence names an internal or uses jargon", () => {
    for (const catalog of [english, romanian]) for (const [key, value] of ours(catalog)) expect(value, key).not.toMatch(/revision|RECOVERY_|TEAM_|STAFF_|\bAPI\b|permit|credential|capability|token|factor|\bMFA\b/iu);
  });
  it("prints every sentence from the catalogue it is given", async () => {
    const marked = Object.fromEntries(ours(english).map(([key, value]) => [key, `[ro] ${value}`]));
    await mount(server(basePage), "ro", { ...romanian, ...marked });
    expect(host.querySelector("h2")?.textContent).toBe("[ro] Requests to get back into an account");
    expect(text()).not.toMatch(/\bstaff\.recoveryPermits\./u);
  });
});
