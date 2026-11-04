// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * V4 review ask-f1: a stranger sent to sign in from the new ask page never came back to it (the gate sent everyone to a
 * bare /login, which landed on the old new-debate page). The gate now sends people to sign in with the way back to the
 * page they were on, query included, so a question handed in by a link and the reading level come back too. A page sign-in
 * cannot return to gets the plain sign-in page, which lands on the new ask page.
 */
const state = vi.hoisted(() => ({ replace: vi.fn(), validate: vi.fn() }));
vi.mock("@/lib/api", () => ({ COOKIE_SESSION_MARKER: "cookie-session", validateSession: () => state.validate() }));
vi.mock("@/components/billing/LegalAcceptGate", () => ({ LegalAcceptGate: ({ children }: { children: ReactNode }) => children }));

import { AuthGate } from "../../apps/ui/components/AuthGate.js";

let root: Root | null = null;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.replace.mockReset();
  state.validate.mockReset().mockRejectedValue(new Error("SESSION_REQUIRED"));
  const native = window;
  const location = {
    get href() { return native.location.href; },
    get origin() { return native.location.origin; },
    get pathname() { return native.location.pathname; },
    get search() { return native.location.search; },
    get hash() { return native.location.hash; },
    replace: state.replace
  };
  vi.stubGlobal("window", new Proxy(native, {
    get(target, key) {
      if (key === "location") return location;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" && ["addEventListener", "removeEventListener", "dispatchEvent", "getComputedStyle", "setTimeout", "clearTimeout"].includes(String(key))
        ? value.bind(target) : value;
    }
  }));
});
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

async function signedOutAt(address: string): Promise<HTMLElement> {
  window.history.replaceState(null, "", address);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<AuthGate>{() => <p>the page</p>}</AuthGate>);
    for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
  });
  return host;
}

describe("AuthGate sends a signed-out visitor to sign in with the way back", () => {
  it.each([
    ["/v4", "/login?next=%2Fv4"],
    ["/v4?topic=Why%20now%3F&level=plain", `/login?next=${encodeURIComponent("/v4?topic=Why%20now%3F&level=plain")}`],
    ["/settings", "/login?next=%2Fsettings"],
    // public-f13: a V4 debate's map is on the return list too; the classic debate page is not, so it gets the plain page.
    ["/v4/debate/11111111-1111-4111-8111-111111111111", "/login?next=%2Fv4%2Fdebate%2F11111111-1111-4111-8111-111111111111"],
    ["/debate/11111111-1111-4111-8111-111111111111", "/login"]
  ])("from %s to %s, by the redirect and by the link shown meanwhile", async (address, href) => {
    const host = await signedOutAt(address);
    expect(state.replace.mock.calls).toEqual([[href]]);
    expect(host.querySelector("a")?.getAttribute("href")).toBe(href);
    expect(host.textContent).not.toContain("the page");
  });

  it("shows the page and sends nobody away once the session is valid", async () => {
    state.validate.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ status: "not_required" }), { status: 200 }));
    const host = await signedOutAt("/v4");
    expect(state.replace).not.toHaveBeenCalled();
    expect(host.textContent).toContain("the page");
  });
});
