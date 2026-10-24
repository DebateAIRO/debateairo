// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import staffRomanian from "../../apps/ui/messages/ro/staff.json";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); sessionStorage.removeItem("debateai:staff-authority"); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); sessionStorage.removeItem("debateai:staff-authority"); vi.unstubAllGlobals(); });

async function mount(status: number, unread = 3) {
  const componentPath = "../../apps/ui/components/ThreatReportsLink.js";
  const component = await import(/* @vite-ignore */ componentPath).catch(() => null);
  const apiPath = "../../apps/ui/lib/threatReportsApi.js";
  const api = await import(/* @vite-ignore */ apiPath).catch(() => null);
  expect(component).not.toBeNull();
  expect(api).not.toBeNull();
  if (component === null || api === null) return;
  const client = api.createThreatReportsClient({
    browser: { authenticate: async () => { throw Error("unused"); }, register: async () => { throw Error("unused"); }, cancel() {} },
    fetchImplementation: (async () => Response.json(status === 200 ? { unread } : { error: "FORBIDDEN" }, { status })) as typeof fetch
  });
  const ThreatReportsLink = component.ThreatReportsLink;
  await act(async () => root.render(<ThreatReportsLink client={client}/>));
}

describe("S04 threat reports link", () => {
  it("does not probe the capability route before this tab verifies staff access", async () => {
    // Property: a fresh Team access page makes no unauthorized summary request.
    sessionStorage.removeItem("debateai:staff-authority");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "UNAUTHORIZED" }, { status: 401 }));
    const { ThreatReportsLink } = await import("../../apps/ui/components/ThreatReportsLink.js");
    await act(async () => root.render(<ThreatReportsLink />));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(host.querySelector(".threatReportsLinkRow")).toBeNull();
  });
  it("restores the link after reload while this tab's verified authority is live", async () => {
    // Property: a reload does not hide a report link backed by an unexpired staff session.
    sessionStorage.setItem("debateai:staff-authority", JSON.stringify({ expires_at: "2099-01-01T00:00:00.000Z", capabilities: ["THREAT_REPORT"] }));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ unread: 2 }));
    const { ThreatReportsLink } = await import("../../apps/ui/components/ThreatReportsLink.js");
    await act(async () => root.render(<ThreatReportsLink />));
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(host.querySelector(".threatReportsCount")?.textContent).toBe("2 unread");
    sessionStorage.removeItem("debateai:staff-authority");
  });
  it("shows the count in a pill link to the threat reports page", async () => {
    await mount(200);
    const link = host.querySelector<HTMLAnchorElement>('a.setBtn.threatReportsLink');
    expect(link?.getAttribute("href")).toBe("/admin/threat-reports");
    expect(link?.textContent).toContain("Threat reports");
    expect(link?.querySelector('[data-part="unread-count"]')?.textContent).toBe("3 unread");
  });
  it("renders no link when summary returns 403", async () => {
    await mount(403);
    expect(host.querySelector(".threatReportsLinkRow")).toBeNull();
  });
  it("refreshes the unread link on the same page after team access is verified", async () => {
    // Property: a prior unauthorized summary cannot hide the link after authority arrives.
    const component = await import("../../apps/ui/components/ThreatReportsLink.js");
    const api = await import("../../apps/ui/lib/threatReportsApi.js");
    let authorized = false;
    const client = api.createThreatReportsClient({
      browser: { authenticate: async () => { throw Error("unused"); }, register: async () => { throw Error("unused"); }, cancel() {} },
      fetchImplementation: (async () => Response.json(authorized ? { unread: 3 } : { error: "UNAUTHORIZED" }, { status: authorized ? 200 : 401 })) as typeof fetch
    });
    await act(async () => root.render(<component.ThreatReportsLink client={client} />));
    expect(host.querySelector(".threatReportsLinkRow")).toBeNull();
    authorized = true;
    await act(async () => window.dispatchEvent(new CustomEvent("debateai:staff-authority-changed", { detail: { capabilities: ["THREAT_REPORT"] } })));
    expect(host.querySelector(".threatReportsCount")?.textContent).toBe("3 unread");
  });
  it("shows the link when the real Team access panel verifies a holder", async () => {
    // Property: the successful Verify action itself publishes authority to the mounted link.
    const { ThreatReportsLink } = await import("../../apps/ui/components/ThreatReportsLink.js");
    const { StaffAccessPanel } = await import("../../apps/ui/components/StaffAccessPanel.js");
    const api = await import("../../apps/ui/lib/threatReportsApi.js");
    let authorized = false;
    const reportsClient = api.createThreatReportsClient({
      browser: { authenticate: async () => { throw Error("unused"); }, register: async () => { throw Error("unused"); }, cancel() {} },
      fetchImplementation: (async () => Response.json(authorized ? { unread: 3 } : { error: "UNAUTHORIZED" }, { status: authorized ? 200 : 401 })) as typeof fetch
    });
    const staffClient = {
      withFundingPolicyVersion() { return this; }, cancel() {},
      enrollment: async () => ({ user_id: "11111111-1111-4111-8111-111111111111", readiness: {
        account_active: true, email_verified: true, totp_active: true, security_hold: false,
        owner_credential_requirement_met: true, delegated_credential_requirement_met: true, verified_credential_count: 1
      } }),
      elevate: async () => { authorized = true; return { staff_id: "22222222-2222-4222-8222-222222222222", capabilities: ["THREAT_REPORT"], expires_at: "2099-01-01T00:00:00.000Z" }; }
    };
    await act(async () => root.render(<><ThreatReportsLink client={reportsClient}/><StaffAccessPanel client={staffClient as never}/></>));
    expect(host.querySelector(".threatReportsLinkRow")).toBeNull();
    const verify = [...host.querySelectorAll("button")].find(button => button.textContent === "Verify security key for team access");
    expect(verify?.disabled).toBe(false);
    await act(async () => verify!.click());
    expect(host.querySelector(".threatReportsCount")?.textContent).toBe("3 unread");
  });
  it.each([[1, "1 necitit"], [3, "3 necitite"], [20, "20 de necitite"]] as const)("uses Romanian count agreement for %i", async (unread, expected) => {
    // Property: the label follows Romanian one, few and other agreement.
    const component = await import("../../apps/ui/components/ThreatReportsLink.js");
    const api = await import("../../apps/ui/lib/threatReportsApi.js");
    const client = api.createThreatReportsClient({
      browser: { authenticate: async () => { throw Error("unused"); }, register: async () => { throw Error("unused"); }, cancel() {} },
      fetchImplementation: (async () => Response.json({ unread })) as typeof fetch
    });
    const oldLanguage = document.documentElement.lang;
    document.documentElement.lang = "ro";
    try {
      await act(async () => root.render(<component.ThreatReportsLink client={client} catalog={staffRomanian} />));
      expect(host.querySelector(".threatReportsCount")?.textContent).toBe(expected);
    } finally { document.documentElement.lang = oldLanguage; }
  });
});
