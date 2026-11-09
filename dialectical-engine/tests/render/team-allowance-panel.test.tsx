// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamAllowancePanel } from "../../apps/ui/components/TeamAllowancePanel.js";
import { createTeamAllowanceClient } from "../../apps/ui/lib/teamAllowanceApi.js";
import english from "../../apps/ui/messages/en/staff.json";
import romanian from "../../apps/ui/messages/ro/staff.json";

/**
 * Plan 2026-10-31-r22-owner-changes decision 32: the Owner's panel. Everything runs through the real client over a fake server, so each row reads
 * the bodies that would reach the API. Amounts are made up.
 */
const OWNER = "11111111-1111-4111-8111-111111111111";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const HOLDER = "44444444-4444-4444-8444-444444444444";
const GRANT = "55555555-5555-4555-8555-555555555555";
const name = (id: string) => `staff-${id.replaceAll("-", "")}`;
const handle = "a".repeat(43);
const credential = { id: "aA", rawId: "aA", type: "public-key" as const, response: { clientDataJSON: "aA", authenticatorData: "aA", signature: "aA", userHandle: null }, clientExtensionResults: {} };
const allowance = { grant_id: GRANT, amount_micros: 30_000_000, day_micros: 3_000_000, week_micros: 10_000_000, starts_at: "2031-03-01T00:00:00.000Z", expires_at: "2031-03-20T00:00:00.000Z", spent_micros: 1_250_000 };
const basePage = {
  limits: { maximum_grant_micros: 50_000_000, maximum_day_micros: 5_000_000, maximum_week_micros: 20_000_000, maximum_lifetime_ms: 2_592_000_000 },
  members: [
    { staff_id: OWNER, pseudonym: name(OWNER), is_owner: true, revision: 0, allowance: null },
    { staff_id: MEMBER, pseudonym: name(MEMBER), is_owner: false, revision: 2, allowance: null },
    { staff_id: HOLDER, pseudonym: name(HOLDER), is_owner: false, revision: 4, allowance }
  ],
  log: [
    { kind: "GIVEN", subject_staff_id: HOLDER, actor_staff_id: OWNER, amount_micros: 30_000_000, day_micros: 3_000_000, week_micros: 10_000_000, expires_at: "2031-03-20T00:00:00.000Z", at: "2031-03-01T00:00:00.000Z", notice: "SENT" },
    { kind: "ENDED", subject_staff_id: MEMBER, actor_staff_id: null, cause: "STAFF_DISABLED", at: "2031-02-01T00:00:00.000Z", notice: "FAILED" }
  ]
};
type Call = Readonly<{ path: string; method: string; body: Record<string, unknown> | null; headers: Headers }>;
function server(page: typeof basePage | null, options: { status?: number; refuse?: { path: string; status: number; error: string }; authenticate?: () => Promise<typeof credential> } = {}) {
  const calls: Call[] = [];
  const fetchImplementation = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input).slice(String(input).indexOf("/v1/")), "http://localhost");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
    calls.push({ path: url.pathname, method, body, headers: new Headers(init?.headers) });
    if (options.refuse !== undefined && method !== "GET" && url.pathname === options.refuse.path) return Response.json({ error: options.refuse.error }, { status: options.refuse.status });
    if (url.pathname === "/v1/admin/team-allowances" && method === "GET") {
      if (page === null) return Response.json({ error: "STAFF_REQUEST_REFUSED" }, { status: options.status ?? 403 });
      return Response.json(page);
    }
    if (url.pathname === "/v1/admin/webauthn/action/options") return Response.json({ challenge_handle: handle, options: { challenge: handle, rpId: "app.test", timeout: 300000, userVerification: "required", allowCredentials: [{ id: "aA", type: "public-key" }] } });
    if (url.pathname === "/v1/admin/webauthn/action/verify") return Response.json({ proof_handle: "b".repeat(43), expires_at: "2099-01-01T00:00:00.000Z" });
    if (url.pathname.startsWith("/v1/admin/team-allowances")) return Response.json({ operation_id: String(body?.operation_id), outcome: "COMPLETED", recorded_at: "2031-03-02T00:00:00.000Z" });
    return Response.json({ error: "UNEXPECTED" }, { status: 500 });
  }) as typeof fetch;
  const client = createTeamAllowanceClient({ fetchImplementation, browser: { authenticate: options.authenticate ?? (async () => credential), register: async () => { throw Error("unused"); }, cancel() {} } as never });
  return { calls, client, proofs: () => calls.filter(call => call.path === "/v1/admin/webauthn/action/options").map(call => call.body!.intent as Record<string, unknown>) };
}
let root: Root, host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
const mount = async (api: ReturnType<typeof server>, catalog: Record<string, string> = english) => { await act(async () => root.render(<TeamAllowancePanel client={api.client} catalog={catalog} locale="en"/>)); };
const text = () => host.textContent ?? "";
const button = (label: string) => [...host.querySelectorAll("button")].find(item => item.textContent?.trim() === label);
async function submit(values: Record<string, string>) {
  const target = host.querySelector<HTMLFormElement>("form[data-team-allowance-form]")!;
  for (const [field, value] of Object.entries(values)) (target.elements.namedItem(field) as HTMLInputElement | HTMLSelectElement).value = value;
  await act(async () => { target.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
const GOOD = { person: MEMBER, amount: "20", day: "2", week: "8", days: "10" };
const confirm = async () => { await act(async () => button("Confirm")!.click()); };

describe("who sees the panel", () => {
  it.each([[403], [401], [503]])("renders nothing at all on %i: the partner and a delegate learn it does not exist", async status => {
    await mount(server(null, { status }));
    expect(host.innerHTML).toBe("");
  });
  it("renders nothing when the answer is not the page's shape", async () => {
    await mount(server({ ...basePage, members: [{ ...basePage.members[0]!, pseudonym: "not-a-staff-name" }] }));
    expect(host.innerHTML).toBe("");
  });
  it("goes as soon as the authority ends", async () => {
    await mount(server(basePage));
    expect(text()).toContain(english["staff.teamAllowance.title"]);
    await act(async () => window.dispatchEvent(new CustomEvent("debateai:staff-authority-changed", { detail: { capabilities: [] } })));
    expect(host.innerHTML).toBe("");
  });
});
describe("what the Owner reads", () => {
  it("each member by pseudonym, what is spent, the most they may give, and the log in plain words", async () => {
    await mount(server(basePage));
    expect(text()).toContain(`${name(OWNER)} (you)`);
    expect(text()).toContain("Spent $1.25 of $30.00. Up to $3.00 a day and $10.00 a week.");
    expect(text()).toContain("The most you can give: $50.00 in total, $5.00 a day, $20.00 a week, for 30 days.");
    expect(text()).toContain(`${name(HOLDER)} was given $30.00, up to $3.00 a day and $10.00 a week`);
    expect(text()).toContain(`${name(MEMBER)}'s quota ended: they left the team or were disabled`);
    expect(text()).toContain(english["staff.teamAllowance.notice.FAILED"]);
    expect([...host.querySelectorAll("option")].map(option => option.getAttribute("value"))).toEqual(["", OWNER, MEMBER]);
  });
  it("in Romanian too: every key of this panel exists there", () => {
    const keys = Object.keys(english).filter(key => key.startsWith("staff.teamAllowance."));
    expect(keys.length).toBeGreaterThan(30);
    expect(keys.filter(key => (romanian as Record<string, string>)[key] === undefined || (romanian as Record<string, string>)[key] === (english as Record<string, string>)[key])).toEqual([]);
  });
});
describe("giving", () => {
  it("confirms in words, then proves and sends exactly that: the member, the amounts, the revision the page saw, and no account reference", async () => {
    const api = server(basePage);
    await mount(api);
    await submit(GOOD);
    expect(api.proofs()).toEqual([]);
    expect(text()).toContain(`Give ${name(MEMBER)} $20.00 in total, up to $2.00 a day and $8.00 a week, for 10 days?`);
    await confirm();
    const [intent] = api.proofs();
    expect(intent).toMatchObject({ action: "TEAM_ALLOWANCE_CONFIGURE", target_staff_id: MEMBER, expected_revision: 2, amount_micros: 20_000_000, day_micros: 2_000_000, week_micros: 8_000_000, reason: { code: "FUNDING_APPROVAL" } });
    expect(Date.parse(intent!.expires_at as string) - Date.parse(intent!.starts_at as string)).toBe(10 * 86_400_000);
    const sent = api.calls.find(call => call.method === "POST" && call.path === `/v1/admin/team-allowances/${MEMBER}`)!;
    const { proof_handle: proofHandle, ...fields } = sent.body!;
    const { action: _action, target_staff_id: _target, ...proved } = intent!;
    expect(fields).toEqual(proved);
    expect(proofHandle).toBe("b".repeat(43));
    expect(JSON.stringify(sent.body)).not.toMatch(/owner_ref/u);
    expect(text()).toContain(english["staff.teamAllowance.done"]);
  });
  it.each([
    [{ ...GOOD, person: "" }, "chooseFirst"], [{ ...GOOD, amount: "abc" }, "invalidAmount"], [{ ...GOOD, day: "0" }, "invalidAmount"],
    [{ ...GOOD, day: "9" }, "outOfOrder"], [{ ...GOOD, week: "21" , amount: "30" }, "tooMuch"], [{ ...GOOD, amount: "51", week: "8" }, "tooMuch"],
    [{ ...GOOD, days: "31" }, "invalidDays"], [{ ...GOOD, days: "1.5" }, "invalidDays"]
  ])("%o says %s and starts no ceremony", async (values, key) => {
    const api = server(basePage);
    await mount(api);
    await submit(values);
    expect(text()).toContain((english as Record<string, string>)[`staff.teamAllowance.${key}`]);
    expect(api.proofs()).toEqual([]);
  });
  it.each([["TEAM_ALLOWANCE_STALE", 409, "stale"], ["TEAM_ALLOWANCE_EXISTS", 409, "exists"], ["TEAM_ALLOWANCE_MEMBER_UNAVAILABLE", 409, "unavailable"], ["TEAM_ALLOWANCE_INVALID", 422, "tooMuch"], ["STAFF_ALERT_UNAVAILABLE", 503, "locked"], ["STAFF_REQUEST_REFUSED", 403, "failed"]])(
    "the server's %s reads in plain words", async (error, status, key) => {
      const api = server(basePage, { refuse: { path: `/v1/admin/team-allowances/${MEMBER}`, status, error } });
      await mount(api);
      await submit(GOOD);
      await confirm();
      expect(text()).toContain((english as Record<string, string>)[`staff.teamAllowance.${key}`]);
    });
  it("a cancelled passkey changes nothing and says so", async () => {
    const api = server(basePage, { authenticate: async () => { throw new Error("STAFF_WEBAUTHN_CANCELLED"); } });
    await mount(api);
    await submit(GOOD);
    await confirm();
    expect(text()).toContain(english["staff.teamAllowance.nothingChanged"]);
    expect(api.calls.some(call => call.method === "POST" && call.path.startsWith("/v1/admin/team-allowances"))).toBe(false);
  });
});
describe("taking back", () => {
  it("confirms, and binds the grant, the member and the revision the page saw", async () => {
    const api = server(basePage);
    await mount(api);
    await act(async () => button(english["staff.teamAllowance.takeBack"])!.click());
    expect(text()).toContain(`Take back ${name(HOLDER)}'s quota?`);
    await confirm();
    expect(api.proofs()[0]).toMatchObject({ action: "TEAM_ALLOWANCE_REVOKE", target_staff_id: HOLDER, grant_id: GRANT, expected_revision: 4 });
    expect(api.calls.some(call => call.method === "DELETE" && call.path === `/v1/admin/team-allowances/${HOLDER}/${GRANT}`)).toBe(true);
  });
});
