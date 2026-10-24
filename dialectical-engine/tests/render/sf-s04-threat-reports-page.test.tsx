// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import staffRomanian from "../../apps/ui/messages/ro/staff.json";

const oldRef = "11111111-1111-4111-8111-111111111111";
const newRef = "22222222-2222-4222-8222-222222222222";
const handle = "a".repeat(43);
const credential = { id: "aA", rawId: "aA", type: "public-key" as const, response: { clientDataJSON: "aA", authenticatorData: "aA", signature: "aA", userHandle: null }, clientExtensionResults: {} };
const options = { challenge_handle: handle, options: { challenge: handle, rpId: "app.test", timeout: 300000, userVerification: "required", allowCredentials: [{ id: "aA", type: "public-key" }] } };
const kept = "2026-10-20T08:00:00.000Z";
const later = "2026-10-20T09:00:00.000Z";
const decided = "2026-10-21T10:00:00.000Z";
type Setup = { listStatus?: number; readStatus?: number; decisionStatus?: number; networkFailure?: boolean; direct?: boolean; romanian?: boolean };
let root: Root;
let host: HTMLDivElement;
let calls: { path: string; body: Record<string, unknown> | null }[];
let current: "UNREAD" | "REPORTED" | "NOT_REPORTED";
let key = 0;

beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); sessionStorage.removeItem("debateai:staff-authority"); history.replaceState(null, "", "/admin/threat-reports"); host = document.createElement("div"); document.body.append(host); root = createRoot(host); calls = []; current = "UNREAD"; key = 0; });
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); sessionStorage.removeItem("debateai:staff-authority"); vi.unstubAllGlobals(); });

async function mount(setup: Setup = {}) {
  const componentPath = "../../apps/ui/components/ThreatReportsPanel.js";
  const apiPath = "../../apps/ui/lib/threatReportsApi.js";
  const component = await import(/* @vite-ignore */ componentPath).catch(() => null);
  const api = await import(/* @vite-ignore */ apiPath).catch(() => null);
  expect(component).not.toBeNull();
  expect(api).not.toBeNull();
  if (component === null || api === null) return;
  history.replaceState(null, "", setup.direct ? `/admin/threat-reports?report=${oldRef}` : "/admin/threat-reports");
  const client = api.createThreatReportsClient({
    browser: { authenticate: async () => credential, register: async () => { throw Error("unused"); }, cancel() {} },
    fetchImplementation: (async (input, init) => {
      const path = String(input);
      const body = init?.body === undefined ? null : JSON.parse(String(init.body));
      calls.push({ path, body });
      if (path.endsWith("/webauthn/action/options")) return Response.json(options);
      if (path.endsWith("/webauthn/action/verify")) return Response.json({ proof_handle: handle, expires_at: "2099-01-01T00:00:00.000Z" });
      if (path.endsWith("/threat-reports")) {
        if (setup.networkFailure) throw Error("offline");
        if (setup.listStatus && setup.listStatus !== 200) return Response.json({ error: "FORBIDDEN" }, { status: setup.listStatus });
        return Response.json({ reports: [
          { report_ref: newRef, kept_at: later, decision: "UNREAD", decided_at: null },
          ...(current === "NOT_REPORTED" ? [] : [{ report_ref: oldRef, kept_at: kept, decision: current, decided_at: current === "REPORTED" ? decided : null }])
        ] });
      }
      if (path.endsWith(`/threat-reports/${oldRef}/decision`)) {
        if (setup.decisionStatus === 409) { current = "REPORTED"; return Response.json({ error: "THREAT_REPORT_ALREADY_DECIDED" }, { status: 409 }); }
        current = body!.decision as typeof current;
        return Response.json({ report_ref: oldRef, decision: current });
      }
      if (path.endsWith(`/threat-reports/${oldRef}`)) {
        if (setup.readStatus && setup.readStatus !== 200) return Response.json({ error: setup.readStatus === 404 ? "THREAT_REPORT_NOT_FOUND" : "FORBIDDEN" }, { status: setup.readStatus });
        if (current === "NOT_REPORTED") return Response.json({ error: "THREAT_REPORT_NOT_FOUND" }, { status: 404 });
        return Response.json({ report_ref: oldRef, kept_at: kept, decision: current, decided_at: current === "REPORTED" ? decided : null, question: "Threat question about Ion", account: { email: "asker@example.test", user_id: newRef } });
      }
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }) as typeof fetch
  });
  const ThreatReportsPanel = component.ThreatReportsPanel;
  await act(async () => root.render(<ThreatReportsPanel key={++key} client={client} {...(setup.romanian ? { catalog: staffRomanian, locale: "ro" } : {})}/>));
}
async function press(label: string) {
  const control = [...host.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>("button, a")].find(item => item.textContent?.trim() === label);
  expect(control, label).toBeDefined();
  await act(async () => control!.click());
}
async function openOld() { await press("Open"); }
const text = () => host.textContent ?? "";

describe("S04 threat reports page", () => {
  it("asks for Team access verification before the first list request in a fresh tab", async () => {
    // Property: a holder without a verified staff session sees the required action without a 401.
    sessionStorage.removeItem("debateai:staff-authority");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "UNAUTHORIZED" }, { status: 401 }));
    const { ThreatReportsPanel } = await import("../../apps/ui/components/ThreatReportsPanel.js");
    await act(async () => root.render(<ThreatReportsPanel />));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(text()).toContain("Verify Team access first");
  });
  it("shows the no-access state for verified staff without the report capability", async () => {
    // Property: a verified non-holder still reaches the server's 403 outcome.
    sessionStorage.setItem("debateai:staff-authority", JSON.stringify({ expires_at: "2099-01-01T00:00:00.000Z", capabilities: [] }));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "FORBIDDEN" }, { status: 403 }));
    const { ThreatReportsPanel } = await import("../../apps/ui/components/ThreatReportsPanel.js");
    await act(async () => root.render(<ThreatReportsPanel />));
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(text()).toContain("You don't have access to threat reports.");
    sessionStorage.removeItem("debateai:staff-authority");
  });
  it("lists kept threats oldest first with time, state badges and Open", async () => {
    await mount();
    expect(text()).toContain("Kept questions, oldest first");
    const rows = [...host.querySelectorAll(".threatReportsRow")];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.getAttribute("data-report-ref")).toBe(oldRef);
    expect(rows[0]?.querySelector('.staffBadge[data-state="unread"]')?.textContent).toBe("Unread");
    expect(rows[0]?.querySelector("time")?.dateTime).toBe(kept);
    expect(rows[0]?.textContent).toContain("Open");
  });
  it("opens only the question, kept time and account identifiers with the decision explanation above buttons", async () => {
    await mount(); await openOld();
    expect(text()).toContain("Kept threat");
    expect(text()).toContain("Threat question about Ion");
    expect(text()).toContain("asker@example.test");
    expect(text()).toContain(newRef);
    expect(host.querySelector(".threatReportsDecideHint")?.compareDocumentPosition(host.querySelector(".threatReportsDecisions")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text()).not.toContain("payment");
  });
  it("confirms Reported with WebAuthn and shows the reported date and completion notice", async () => {
    await mount(); await openOld(); await press("Reported");
    expect(calls.some(call => call.path.endsWith("/webauthn/action/options"))).toBe(true);
    expect(calls.some(call => call.path.endsWith("/webauthn/action/verify"))).toBe(true);
    expect(calls.find(call => call.path.endsWith("/decision"))?.body?.decision).toBe("REPORTED");
    expect(text()).toContain("The operation was recorded.");
    expect(host.querySelector('.staffBadge[data-state="active"]')?.textContent).toContain("Reported ·");
    // Property: a reported badge gives the calendar date without a clock time.
    expect(host.querySelector('.staffBadge[data-state="active"]')?.textContent).not.toMatch(/\d{1,2}:\d{2}/u);
  });
  it("erases Not reported from the list and an old address shows no report", async () => {
    await mount(); await openOld(); await press("Not reported");
    expect(host.querySelector(`[data-report-ref="${oldRef}"]`)).toBeNull();
    history.pushState(null, "", `/admin/threat-reports?report=${oldRef}`);
    await act(async () => dispatchEvent(new PopStateEvent("popstate")));
    expect(text()).toContain("This report no longer exists");
    expect(text()).not.toContain("Threat question about Ion");
  });
  it("shows no access and no report on 403", async () => {
    await mount({ listStatus: 403 });
    expect(text()).toContain("You don't have access to threat reports.");
    expect(text()).not.toContain("Threat question about Ion");
    expect(host.querySelector(".threatReportsRow")).toBeNull();
  });
  it("shows gone and no report fields when an opened item answers 404", async () => {
    await mount({ readStatus: 404 }); await openOld();
    expect(text()).toContain("This report no longer exists");
    expect(text()).not.toContain("asker@example.test");
    // Property: the gone state lets a holder return directly to the list.
    expect(host.querySelector(".threatReportsBackList")?.textContent).toBe("Back to the list");
    expect(host.querySelector(".threatReportsBackTop")).toBeNull();
  });
  it("reloads current state on decision 409 and offers no second decision", async () => {
    await mount({ decisionStatus: 409 }); await openOld(); await press("Reported");
    expect(text()).toContain("Another team member already recorded a decision");
    expect(host.querySelector('.staffBadge[data-state="active"]')?.textContent).toContain("Reported ·");
    expect(host.querySelector(".threatReportsDecisions")).toBeNull();
    // Property: the conflict notice precedes the reloaded record in the error style.
    const notice = host.querySelector(".setError");
    const card = host.querySelector(".setCard");
    expect(notice?.textContent).toContain("Another team member already recorded");
    expect(notice && card && (notice.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    expect(host.querySelector(".threatReportsBackTop")).toBeNull();
  });
  it("shows load failed and no report for an unavailable list, item or network", async () => {
    await mount({ listStatus: 503 });
    expect(text()).toContain("Threat reports could not be loaded.");
    await mount({ readStatus: 503 }); await openOld();
    expect(text()).toContain("Threat reports could not be loaded.");
    expect(text()).not.toContain("asker@example.test");
    await mount({ networkFailure: true });
    expect(text()).toContain("Threat reports could not be loaded.");
    expect(host.querySelector(".threatReportsRow")).toBeNull();
  });
  it("tells a holder without a staff session to verify Team access", async () => {
    // Property: retry instructions for a missing staff cookie identify the prerequisite.
    await mount({ listStatus: 401 });
    expect(text()).toContain("Verify Team access first");
    expect(text()).not.toContain("Threat reports could not be loaded");
  });
  it("gives the same verification prerequisite in Romanian", async () => {
    // Property: the staff error remains actionable in both shipped staff languages.
    await mount({ listStatus: 401, romanian: true });
    expect(text()).toContain("Verifică mai întâi accesul la echipă");
  });
  it("omits the Team access back link while a report is open", async () => {
    // Property: the record state has only the back-to-list control drawn by V.
    await mount(); await openOld();
    expect(host.querySelector(".threatReportsBackTop")).toBeNull();
  });
});
