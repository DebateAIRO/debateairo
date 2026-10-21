// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });

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
});
