// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://localhost/settings"}

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A signed-in page whose session the server has ended: the browser still holds both cookies, and the API refuses the
 * session read with 401 SESSION_REQUIRED. The page sends the person to sign in, as before. Each such 401 makes the
 * browser forget the site password, and the next page used to send the same read and get the same refusal again. Now
 * the first refusal removes the readable cookie, so the next page goes to sign in without asking the server. The page,
 * its session check, the account menu and the contract client are the real ones; only the server behind `fetch` and the
 * address bar are stood in. The cookie follows the browser's own rules on this https page.
 */
const server = vi.hoisted(() => {
  const state = { calls: [] as string[] };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    state.calls.push(String(input));
    return new Response(JSON.stringify({ error: "SESSION_REQUIRED" }), { status: 401, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return state;
});
const address = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("@/lib/ageConfirmation", () => ({ ageConfirmationRequired: async () => false, ageConfirmationHref: (next: string) => next }));
vi.mock("@/components/billing/LegalAcceptGate", () => ({ LegalAcceptGate: ({ children }: { children: ReactNode }) => <>{children}</> }));

import { AuthGate } from "../../apps/ui/components/AuthGate.js";
import { AccountMenu } from "../../apps/ui/components/AccountMenu.js";
import { supportAssistantClient } from "../../apps/ui/components/support/Assistant.js";
import { readWakeFacts } from "../../apps/ui/components/support/sessionChange.js";

const CSRF = `__Host-debateai-csrf=${"c".repeat(43)}`;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  server.calls.length = 0;
  address.replace.mockReset();
  document.cookie = `${CSRF}; Path=/; Max-Age=1209600; Secure; SameSite=Lax`;
  const native = window;
  const location = {
    get href() { return native.location.href; },
    get origin() { return native.location.origin; },
    get pathname() { return native.location.pathname; },
    get search() { return native.location.search; },
    get hash() { return native.location.hash; },
    replace: address.replace
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
  document.cookie = "__Host-debateai-csrf=; Path=/; Max-Age=0; Secure; SameSite=Lax";
  vi.unstubAllGlobals();
});

async function openPage(): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<><AccountMenu /><AuthGate>{() => <p>signed-in page</p>}</AuthGate></>);
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
  });
  return host;
}

describe("a signed-in page whose session the server has ended", () => {
  it("goes to sign in, and the next page goes there too without asking the server again", async () => {
    const first = await openPage();
    const sessionReads = server.calls.filter((call) => call === "/api/v1/session").length;
    // The menu and the page check the session together, before either answer is in.
    expect(sessionReads, "the session is asked on the first page").toBeGreaterThanOrEqual(1);
    expect(address.replace).toHaveBeenCalledTimes(1);
    expect(String(address.replace.mock.calls[0]![0])).toMatch(/^\/login\?next=/u);
    expect(first.textContent).not.toContain("signed-in page");
    expect(document.cookie, "the readable cookie is gone").not.toContain("__Host-debateai-csrf=");
    await act(async () => root!.unmount()); root = null; document.body.replaceChildren();

    const next = await openPage();
    expect(server.calls, "nothing more reaches the server").toHaveLength(sessionReads);
    expect(address.replace, "the next page goes to sign in as well").toHaveBeenCalledTimes(2);
    expect(String(address.replace.mock.calls[1]![0])).toMatch(/^\/login\?next=/u);
    expect(next.textContent).not.toContain("signed-in page");
  });

  it("the support panel's own session reads, sent without the site's usual client, follow the same rule", async () => {
    await expect(supportAssistantClient.isSignedIn!()).resolves.toBe(false);
    expect(document.cookie).not.toContain("__Host-debateai-csrf=");
    document.cookie = `${CSRF}; Path=/; Max-Age=1209600; Secure; SameSite=Lax`;
    await expect(readWakeFacts()).resolves.toMatchObject({ signedIn: false });
    expect(document.cookie).not.toContain("__Host-debateai-csrf=");
    // Both now answer from the browser.
    await supportAssistantClient.isSignedIn!();
    await readWakeFacts();
    expect(server.calls).toEqual(["/api/v1/session", "/api/v1/session"]);
  });
});
