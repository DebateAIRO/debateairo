// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamLimitPanel } from "../../apps/ui/components/TeamLimitPanel.js";
import { createTeamLimitClient, dollarsToMicros, formatDollars } from "../../apps/ui/lib/teamLimitApi.js";
import english from "../../apps/ui/messages/en/staff.json";
import romanian from "../../apps/ui/messages/ro/staff.json";

/**
 * Plan 2026-10-31-r22-owner-changes decision 24: the private panel for the team's one limit. Everything runs through the real client over a
 * fake server, so each row reads the bodies that would reach the API. Amounts are made up.
 */
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const OWNER = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const LEFT = "44444444-4444-4444-8444-444444444444";
const PRACTICE = "55555555-5555-4555-8555-555555555555";
const name = (id: string) => `staff-${id.replaceAll("-", "")}`;
const handle = "a".repeat(43);
const credential = { id: "aA", rawId: "aA", type: "public-key" as const, response: { clientDataJSON: "aA", authenticatorData: "aA", signature: "aA", userHandle: null }, clientExtensionResults: {} };

type Entry = Readonly<Record<string, unknown>>;
const basePage = {
  amount_micros: 40_000_000 as number | null, revision: 3, spent_micros: 12_500_000, committed_micros: 2_250_000,
  month_starts_at: "2031-03-01T00:00:00.000Z", month_ends_at: "2031-04-01T00:00:00.000Z", is_owner: true,
  partner: null as { staff_id: string; pseudonym: string; grant_revision: number } | null, log: [] as Entry[]
};
const partnerRow = { staff_id: PARTNER, pseudonym: name(PARTNER), grant_revision: 7 };
const member = (staffId: string, overrides: Entry = {}) => ({
  staff_id: staffId, pseudonym: name(staffId), status: "ACTIVE", capabilities: ["TEAM_READ"], grant_revision: 5, credential_count: 1,
  last_privilege_at: null, delivery_state: "DELIVERED", ...overrides
});
const teamMembers = [
  member(OWNER, { capabilities: ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE"], grant_revision: 1 }),
  member(MEMBER, { grant_revision: 9 }),
  member(LEFT, { status: "DISABLED", capabilities: [] })
];

type Call = Readonly<{ path: string; method: string; body: Record<string, unknown> | null; headers: Headers }>;
/** A small API: `refuse` answers one mutation path once with a chosen status and code; `after` is the page the next reads return. */
function server(page: typeof basePage | null, options: { status?: number; refuse?: { path: string; status: number; error: string }; after?: typeof basePage; authenticate?: () => Promise<typeof credential>; fundingPolicy?: boolean; teamPages?: readonly (readonly unknown[])[] } = {}) {
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
    if (url.pathname === "/v1/admin/team-limit" && method === "GET") {
      if (current === null) return Response.json({ error: "STAFF_REQUEST_REFUSED" }, { status: options.status ?? 403 });
      return Response.json(current);
    }
    if (url.pathname === "/v1/admin/webauthn/action/options") return Response.json({ challenge_handle: handle, options: { challenge: handle, rpId: "app.test", timeout: 300000, userVerification: "required", allowCredentials: [{ id: "aA", type: "public-key" }] } });
    if (url.pathname === "/v1/admin/webauthn/action/verify") return Response.json({ proof_handle: "b".repeat(43), expires_at: "2099-01-01T00:00:00.000Z" });
    if (url.pathname === "/v1/admin/enrollment") return Response.json({ user_id: OWNER, ...(options.fundingPolicy === true ? { funding_policy_version: 1 } : {}), readiness: { account_active: true, email_verified: true, totp_active: true, security_hold: false, verified_credential_count: 2, owner_credential_requirement_met: true, delegated_credential_requirement_met: true } });
    if (url.pathname === "/v1/admin/team") {
      const pages = options.teamPages ?? [teamMembers];
      const index = url.searchParams.get("cursor") === null ? 0 : 1;
      return Response.json({ members: pages[index], next_cursor: index + 1 < pages.length ? "Y3Vyc29yLTE" : null, order: "CREATED_AT_ID_ASC" });
    }
    if (url.pathname.startsWith("/v1/admin/team-limit")) {
      if (options.after !== undefined) current = options.after;
      return Response.json({ operation_id: String(body?.operation_id), outcome: "COMPLETED", recorded_at: "2031-03-02T00:00:00.000Z" });
    }
    return Response.json({ error: "UNEXPECTED" }, { status: 500 });
  }) as typeof fetch;
  const client = createTeamLimitClient({ fetchImplementation, browser: { authenticate: options.authenticate ?? (async () => credential), register: async () => { throw Error("unused"); }, cancel() {} } });
  return { calls, client, proofs: () => calls.filter(call => call.path === "/v1/admin/webauthn/action/options").map(call => call.body!.intent as Record<string, unknown>) };
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function mount(api: ReturnType<typeof server>, locale = "en", catalog: Record<string, string> = english) {
  await act(async () => root.render(<TeamLimitPanel client={api.client} catalog={catalog} locale={locale as "en"}/>));
}
const text = () => host.textContent ?? "";
const button = (label: string) => [...host.querySelectorAll("button")].find(item => item.textContent?.trim() === label);
const form = (name: string) => host.querySelector<HTMLFormElement>(`form[data-team-limit-form="${name}"]`)!;
async function submit(name: string, values: Record<string, string>) {
  const target = form(name);
  for (const [field, value] of Object.entries(values)) (target.elements.namedItem(field) as HTMLInputElement | HTMLSelectElement).value = value;
  await act(async () => { target.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
async function confirm() { await act(async () => button("Confirm")!.click()); }

describe("who sees the panel", () => {
  it.each([[403, "STAFF_REQUEST_REFUSED"], [401, "UNAUTHORIZED"], [503, "STAFF_UNAVAILABLE"]])("renders nothing at all on %i", async status => {
    await mount(server(null, { status }));
    expect(host.innerHTML).toBe("");
  });
  it("renders nothing when the answer is not the page's shape", async () => {
    await mount(server({ ...basePage, amount_micros: 1.5 }));
    expect(host.innerHTML).toBe("");
  });
  it("appears when team access is verified and goes when that authority ends", async () => {
    // Property: a first refusal does not hide the panel for good; the server decides on each authority change, and an ended one hides it at once.
    let current: typeof basePage | null = null;
    const api = server(null);
    const fetchThrough = createTeamLimitClient({ browser: { authenticate: async () => credential, register: async () => { throw Error("unused"); }, cancel() {} },
      fetchImplementation: (async () => current === null ? Response.json({ error: "UNAUTHORIZED" }, { status: 401 }) : Response.json(current)) as typeof fetch });
    await act(async () => root.render(<TeamLimitPanel client={fetchThrough}/>));
    expect(host.innerHTML).toBe("");
    current = { ...basePage, is_owner: false };
    await act(async () => window.dispatchEvent(new CustomEvent("debateai:staff-authority-changed", { detail: { capabilities: ["TEAM_READ"] } })));
    expect(text()).toContain("$40.00");
    await act(async () => window.dispatchEvent(new CustomEvent("debateai:staff-authority-changed", { detail: { capabilities: [] } })));
    expect(host.innerHTML).toBe("");
    expect(api.calls).toEqual([]);
  });
  it("is mounted on the team page", async () => {
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => String(input).endsWith("/v1/admin/team-limit")
      ? Response.json({ ...basePage, is_owner: false }) : Response.json({ error: "UNAUTHORIZED" }, { status: 401 })) as typeof fetch);
    const { default: TeamPage } = await import("../../apps/ui/app/admin/team/page.js");
    const page = await TeamPage();
    await act(async () => root.render(page));
    expect(host.querySelector("[data-team-limit-panel]")?.textContent).toContain("$40.00");
  });
});

describe("the figures", () => {
  it("says plainly that no limit means no room, and offers only the set form", async () => {
    const api = server({ ...basePage, amount_micros: null, revision: 0, spent_micros: 0, committed_micros: 0 });
    await mount(api);
    expect(text()).toContain("No team limit is set, so the team has no room this month. New team questions wait until one is set.");
    expect(host.querySelector("[data-team-limit-figures]")).toBeNull();
    expect(form("limit").querySelector('button[type="submit"]')?.textContent).toBe("Set the limit");
  });
  it("shows limit, spent, held, room left and the UTC month", async () => {
    await mount(server(basePage));
    const figures = host.querySelector("[data-team-limit-figures]")!.textContent;
    expect(figures).toContain("$40.00");
    expect(figures).toContain("$12.50");
    expect(figures).toContain("$2.25");
    expect(figures).toContain("$25.25");
    expect(figures).toContain("March 2031");
    expect(figures).toContain("UTC");
  });
  it("never shows room left below nothing", async () => {
    await mount(server({ ...basePage, amount_micros: 1_000_000, spent_micros: 5_000_000, committed_micros: 1_000_000 }));
    const room = host.querySelector('[data-team-limit-figure="room"]')!.textContent;
    expect(room).toContain("$0.00");
    expect(room).not.toContain("-");
  });
  it("names the month by UTC, even on a machine far west of it", async () => {
    await mount(server({ ...basePage, month_starts_at: "2031-03-01T00:00:00+00:00" }));
    const month = host.querySelector('[data-team-limit-figure="month"]')!.textContent;
    expect(month).toContain("March 2031");
    expect(month).not.toContain("February");
  });
});

describe("dollars", () => {
  it.each([["20", 20_000_000], ["0.29", 290_000], ["19.99", 19_990_000], ["1.1", 1_100_000], ["12,50", 12_500_000], ["$7.5", 7_500_000], [" 0 ", 0], ["0.000001", 1], ["2.01", 2_010_000], ["4.02", 4_020_000]])("reads %s exactly", (input, micros) => {
    expect(dollarsToMicros(input)).toBe(micros);
  });
  it.each(["", "abc", "-1", "1,000", "1.2345678", "1.", ".5", "1e3", "99999999999", "9007199999"])("refuses %s", input => {
    expect(dollarsToMicros(input)).toBeNull();
  });
  it("prints two decimals with no floating error", () => {
    expect(formatDollars("en", 290_000)).toBe("$0.29");
    expect(formatDollars("en", 1_005_000)).toBe("$1.01");
    expect(formatDollars("en", 0)).toBe("$0.00");
  });
});

describe("changing the limit", () => {
  it("sends the new amount, the current value and the revision in the proof, then in the post", async () => {
    const api = server(basePage, { after: { ...basePage, amount_micros: 60_000_000, revision: 4 } });
    await mount(api);
    await submit("limit", { amount: "60" });
    expect(api.proofs()).toEqual([]);
    expect(text()).toContain("Change the limit from $40.00 to $60.00?");
    expect(text()).toContain("You will be asked for your passkey.");
    await confirm();
    const [intent] = api.proofs();
    expect(intent).toEqual({ action: "TEAM_LIMIT_SET", amount_micros: 60_000_000, current_micros: 40_000_000, expected_revision: 3, operation_id: expect.any(String) });
    const post = api.calls.find(call => call.path === "/v1/admin/team-limit" && call.method === "POST")!;
    expect(post.body).toEqual({ amount_micros: 60_000_000, current_micros: 40_000_000, expected_revision: 3, operation_id: intent!.operation_id, proof_handle: "b".repeat(43) });
    expect(host.querySelector("[data-team-limit-figures]")!.textContent).toContain("$60.00");
  });
  it("lets a drop through the same way", async () => {
    const api = server(basePage);
    await mount(api);
    await submit("limit", { amount: "5.5" });
    expect(text()).toContain("Change the limit from $40.00 to $5.50?");
    await confirm();
    expect(api.proofs()[0]).toMatchObject({ action: "TEAM_LIMIT_SET", amount_micros: 5_500_000, current_micros: 40_000_000 });
  });
  it("the first limit proves a current value of nothing", async () => {
    const api = server({ ...basePage, amount_micros: null, revision: 0 });
    await mount(api);
    await submit("limit", { amount: "30" });
    expect(text()).toContain("Set the limit to $30.00?");
    await confirm();
    expect(api.proofs()[0]).toMatchObject({ amount_micros: 30_000_000, current_micros: 0, expected_revision: 0 });
  });
  it("a fresh operation per change", async () => {
    const api = server(basePage);
    await mount(api);
    for (const amount of ["50", "51"]) { await submit("limit", { amount }); await confirm(); }
    const [first, second] = api.proofs();
    expect(first!.operation_id).not.toBe(second!.operation_id);
  });
  it("asks for nothing when the amount cannot be read or is the same", async () => {
    const api = server(basePage);
    await mount(api);
    await submit("limit", { amount: "1,000" });
    expect(text()).toContain("Write an amount in dollars, like 20 or 12.50.");
    await submit("limit", { amount: "40" });
    expect(text()).toContain("That is already the limit.");
    expect(button("Confirm")).toBeUndefined();
    expect(api.proofs()).toEqual([]);
  });
  it("Cancel closes the confirm line without a passkey", async () => {
    const api = server(basePage);
    await mount(api);
    await submit("limit", { amount: "60" });
    await act(async () => button("Cancel")!.click());
    expect(button("Confirm")).toBeUndefined();
    expect(api.proofs()).toEqual([]);
  });
  it("a cancelled passkey says nothing changed and posts nothing", async () => {
    const api = server(basePage, { authenticate: async () => { throw new Error("STAFF_WEBAUTHN_CANCELLED"); } });
    await mount(api);
    await submit("limit", { amount: "60" });
    await confirm();
    expect(text()).toContain("Nothing changed.");
    expect(api.calls.some(call => call.path === "/v1/admin/team-limit" && call.method === "POST")).toBe(false);
  });
});

describe("error sentences", () => {
  it("a stale change says so and shows the new value", async () => {
    const api = server(basePage, { refuse: { path: "/v1/admin/webauthn/action/options", status: 409, error: "TEAM_LIMIT_STALE" }, after: { ...basePage, amount_micros: 70_000_000, revision: 4 } });
    await mount(api);
    await submit("limit", { amount: "60" });
    await confirm();
    expect(text()).toContain("Someone changed this a moment ago. Look at the new value and try again.");
    expect(host.querySelector("[data-team-limit-figures]")!.textContent).toContain("$70.00");
  });
  it("locked team tools say so", async () => {
    const api = server(basePage, { refuse: { path: "/v1/admin/webauthn/action/options", status: 503, error: "STAFF_ALERT_UNAVAILABLE" } });
    await mount(api);
    await submit("limit", { amount: "60" });
    await confirm();
    expect(text()).toContain("Team tools are locked, so this can't be changed right now.");
  });
  it("a second holder is refused in words and re-read", async () => {
    const api = server(basePage, { refuse: { path: `/v1/admin/team-limit/partner/${MEMBER}`, status: 409, error: "TEAM_LIMIT_PARTNER_EXISTS" }, after: { ...basePage, partner: partnerRow } });
    await mount(api);
    await submit("pick", { person: MEMBER });
    await confirm();
    expect(text()).toContain("Someone already holds this. To pick someone else, take it back first.");
    expect(text()).toContain(name(PARTNER));
    expect(form("pick")).toBeNull();
  });
  it("a practice already counted says so", async () => {
    const api = server(basePage, { refuse: { path: "/v1/admin/team-limit/practice", status: 409, error: "TEAM_PRACTICE_ALREADY_RECORDED" } });
    await mount(api);
    await submit("practice", { ref: PRACTICE, amount: "1" });
    await confirm();
    expect(text()).toContain("This practice is already counted.");
  });
  it("anything else is one plain sentence with no code in it", async () => {
    const api = server(basePage, { refuse: { path: "/v1/admin/team-limit", status: 500, error: "SOME_INTERNAL_CODE" } });
    await mount(api);
    await submit("limit", { amount: "60" });
    await confirm();
    expect(text()).toContain("This did not go through. Look at the values here and try again.");
    expect(text()).not.toContain("SOME_INTERNAL_CODE");
  });
});

describe("the partner", () => {
  it("the Owner picks from active members only, never themselves, and the row's revision goes into the proof", async () => {
    const api = server(basePage, { after: { ...basePage, partner: { ...partnerRow, staff_id: MEMBER, pseudonym: name(MEMBER), grant_revision: 10 } } });
    await mount(api);
    expect(text()).toContain("None yet");
    const options = [...form("pick").querySelectorAll("option")].map(option => option.value).filter(value => value !== "");
    expect(options).toEqual([MEMBER]);
    expect(form("pick").textContent).toContain(name(MEMBER));
    await submit("pick", { person: MEMBER });
    await confirm();
    const [intent] = api.proofs();
    expect(intent).toEqual({ action: "TEAM_LIMIT_PARTNER_GRANT", target_staff_id: MEMBER, expected_revision: 9, operation_id: expect.any(String), reason: { code: "GRANT_CHANGE" } });
    const post = api.calls.find(call => call.path === `/v1/admin/team-limit/partner/${MEMBER}`)!;
    expect(post.method).toBe("POST");
    expect(post.body).toEqual({ expected_revision: 9, operation_id: intent!.operation_id, reason: { code: "GRANT_CHANGE" }, proof_handle: "b".repeat(43) });
    expect(text()).toContain(name(MEMBER));
  });
  it("reads every page of the team, with the funded schema when the server has selected it", async () => {
    // An Owner holding ALLOWANCE_WRITE would fail the plain team schema and leave nobody to pick.
    const owner = member(OWNER, { capabilities: ["TEAM_READ", "TEAM_GRANT", "ALLOWANCE_WRITE"] });
    const api = server(basePage, { fundingPolicy: true, teamPages: [[owner], [member(MEMBER)]] });
    await mount(api);
    expect([...form("pick").querySelectorAll("option")].map(option => option.value).filter(value => value !== "")).toEqual([MEMBER]);
  });
  it("hides the pick while someone holds it, and the take back uses the holder's revision on a DELETE", async () => {
    const api = server({ ...basePage, partner: partnerRow }, { after: basePage });
    await mount(api);
    expect(form("pick")).toBeNull();
    expect(text()).toContain("To pick someone else, take it back first.");
    expect(text()).toContain(name(PARTNER));
    await act(async () => button("Take back")!.click());
    expect(text()).toContain("You will be asked for your passkey.");
    await confirm();
    const [intent] = api.proofs();
    expect(intent).toEqual({ action: "TEAM_LIMIT_PARTNER_REVOKE", target_staff_id: PARTNER, expected_revision: 7, operation_id: expect.any(String), reason: { code: "GRANT_CHANGE" } });
    const sent = api.calls.find(call => call.path === `/v1/admin/team-limit/partner/${PARTNER}`)!;
    expect(sent.method).toBe("DELETE");
    expect(sent.body).toEqual({ expected_revision: 7, operation_id: intent!.operation_id, reason: { code: "GRANT_CHANGE" }, proof_handle: "b".repeat(43) });
    expect(form("pick")).not.toBeNull();
  });
  it("only the Owner is offered a pick, even when nobody holds it", async () => {
    await mount(server({ ...basePage, is_owner: false, partner: null }));
    expect(text()).toContain("None yet");
    expect(form("pick")).toBeNull();
    expect(text()).not.toContain("There is nobody on the team to pick yet.");
  });
  it("the partner sees who holds it, with no pick and no take back, and the team list is never asked for", async () => {
    const api = server({ ...basePage, is_owner: false, partner: partnerRow });
    await mount(api);
    expect(text()).toContain(name(PARTNER));
    expect(form("pick")).toBeNull();
    expect(button("Take back")).toBeUndefined();
    expect(text()).not.toContain("To pick someone else, take it back first.");
    expect(api.calls.some(call => call.path.startsWith("/v1/admin/team?"))).toBe(false);
    expect(form("limit")).not.toBeNull();
  });
});

describe("a practice's charge", () => {
  it("proves the reference and the charge, then posts them", async () => {
    const api = server(basePage);
    await mount(api);
    await submit("practice", { ref: PRACTICE, amount: "1.23" });
    expect(text()).toContain("You will be asked for your passkey.");
    expect(text()).toContain("$1.23");
    await confirm();
    const [intent] = api.proofs();
    expect(intent).toEqual({ action: "TEAM_PRACTICE_RECORD", practice_ref: PRACTICE, charge_micros: 1_230_000, operation_id: expect.any(String) });
    const post = api.calls.find(call => call.path === "/v1/admin/team-limit/practice")!;
    expect(post.body).toEqual({ practice_ref: PRACTICE, charge_micros: 1_230_000, operation_id: intent!.operation_id, proof_handle: "b".repeat(43) });
  });
  it("refuses a reference that is not one before any passkey", async () => {
    const api = server(basePage);
    await mount(api);
    await submit("practice", { ref: "not-a-reference", amount: "1" });
    expect(text()).toContain("This practice reference is not right.");
    expect(api.proofs()).toEqual([]);
  });
});

describe("the log", () => {
  const entry = (values: Entry) => ({ at: "2031-03-05T10:00:00.000Z", actor_staff_id: OWNER, notice: "NONE", ...values });
  const rows = () => [...host.querySelectorAll("[data-team-limit-log] > li")];
  it("runs newest first, with amounts, who, and each reason a person lost it", async () => {
    await mount(server({ ...basePage, log: [
      entry({ kind: "LIMIT", at: "2031-03-01T10:00:00.000Z", amount_micros: 10_000_000, previous_micros: null }),
      entry({ kind: "LIMIT", at: "2031-03-02T10:00:00.000Z", amount_micros: 8_000_000, previous_micros: 10_000_000 }),
      entry({ kind: "PRACTICE", at: "2031-03-03T10:00:00.000Z", amount_micros: 1_500_000 }),
      entry({ kind: "PARTNER_GRANTED", at: "2031-03-04T10:00:00.000Z", subject_staff_id: PARTNER }),
      entry({ kind: "PARTNER_REVOKED", at: "2031-03-05T10:00:00.000Z", subject_staff_id: PARTNER, cause: "OWNER_REVOKED" }),
      entry({ kind: "PARTNER_REVOKED", at: "2031-03-06T10:00:00.000Z", subject_staff_id: PARTNER, cause: "STAFF_DISABLED", actor_staff_id: null }),
      entry({ kind: "PARTNER_REVOKED", at: "2031-03-07T10:00:00.000Z", subject_staff_id: PARTNER, cause: "ACCOUNT_ERASED", actor_staff_id: null }),
      entry({ kind: "PARTNER_REVOKED", at: "2031-03-08T10:00:00.000Z", subject_staff_id: PARTNER, cause: "OWNER_CHANGED", actor_staff_id: null })
    ] }));
    const lines = rows().map(row => row.textContent!);
    expect(lines).toHaveLength(8);
    expect(lines[0]).toContain("because the Owner changed");
    expect(lines[1]).toContain("because their account was erased");
    expect(lines[2]).toContain("because their team access ended");
    expect(lines[3]).toContain("The Owner took it back");
    expect(lines[3]).toContain(name(PARTNER));
    expect(lines[4]).toContain(`${name(PARTNER)} was picked`);
    expect(lines[5]).toContain("$1.50");
    expect(lines[6]).toContain("The limit changed from $10.00 to $8.00.");
    expect(lines[7]).toContain("The limit was set to $10.00.");
    expect(lines[7]).toContain(name(OWNER));
    expect(lines[0]).not.toContain("null");
  });
  it("makes a failed email clearly visible, and says the change stands", async () => {
    await mount(server({ ...basePage, log: [entry({ kind: "LIMIT", amount_micros: 10_000_000, previous_micros: null, notice: "FAILED" })] }));
    const failed = rows()[0]!.querySelector(".setError");
    expect(failed?.textContent).toBe("The email about this could not be sent. The change stands.");
  });
  it("says an email on its way quietly, and nothing for sent or none", async () => {
    await mount(server({ ...basePage, log: [
      entry({ kind: "LIMIT", at: "2031-03-03T10:00:00.000Z", amount_micros: 3_000_000, previous_micros: 2_000_000, notice: "WAITING" }),
      entry({ kind: "LIMIT", at: "2031-03-02T10:00:00.000Z", amount_micros: 2_000_000, previous_micros: 1_000_000, notice: "SENT" }),
      entry({ kind: "LIMIT", at: "2031-03-01T10:00:00.000Z", amount_micros: 1_000_000, previous_micros: null, notice: "NONE" })
    ] }));
    const [waiting, sent, none] = rows();
    expect(waiting!.textContent).toContain("Email on its way");
    expect(waiting!.querySelector(".setError")).toBeNull();
    for (const row of [sent!, none!]) {
      expect(row.textContent).not.toContain("Email");
      expect(row.querySelector(".setError")).toBeNull();
    }
  });
});

describe("the words", () => {
  const ours = (catalog: Record<string, string>) => Object.entries(catalog).filter(([key]) => key.startsWith("staff.teamLimit."));
  it("English and Romanian hold the same keys and placeholders", () => {
    const placeholders = (value: string) => [...value.matchAll(/\{[A-Za-z]+\}/gu)].map(match => match[0]).sort();
    expect(ours(romanian).map(([key]) => key).sort()).toEqual(ours(english).map(([key]) => key).sort());
    const ro = romanian as Record<string, string>;
    for (const [key, value] of ours(english)) expect(placeholders(ro[key]!), key).toEqual(placeholders(value));
  });
  it("no sentence names an internal, in either language", () => {
    for (const catalog of [english, romanian]) for (const [key, value] of ours(catalog)) expect(value, key).not.toMatch(/micro|revision|revizi|proof|TEAM_|STAFF_|\bAPI\b/iu);
  });
  it("speaks Romanian, with every printed sentence from the catalogue", async () => {
    const api = server({ ...basePage, amount_micros: null, log: [{ kind: "LIMIT", at: "2031-03-05T10:00:00.000Z", actor_staff_id: OWNER, notice: "FAILED", amount_micros: 1_000_000, previous_micros: null }] });
    await mount(api, "ro", romanian);
    expect(text()).toContain((romanian as Record<string, string>)["staff.teamLimit.noLimit"]);
    expect(text()).toContain((romanian as Record<string, string>)["staff.teamLimit.notice.FAILED"]);
    expect(text()).not.toMatch(/\bstaff\.teamLimit\./u);
    expect(text()).not.toContain("The email about this");
  });
  it("keeps nothing in the address or browser storage, and sends the staff guards on a change", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(`__Host-debateai-csrf=${"p".repeat(43)}; __Host-debateai-staff-csrf=${"s".repeat(43)}`);
    const api = server(basePage);
    await mount(api);
    await submit("limit", { amount: "60" });
    await confirm();
    expect(sessionStorage.length + localStorage.length).toBe(0);
    for (const call of api.calls) expect(call.path).not.toContain(handle);
    expect(api.calls.every(call => !call.path.includes("b".repeat(43)))).toBe(true);
    const post = api.calls.find(call => call.path === "/v1/admin/team-limit" && call.method === "POST")!;
    expect(post.headers.get("x-csrf-token")).toBe("p".repeat(43));
    expect(post.headers.get("x-staff-csrf-token")).toBe("s".repeat(43));
  });
});
