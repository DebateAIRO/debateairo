// @vitest-environment jsdom
/*
 * Auth UI repair (2026-10-09), fix 3: a signed-out visitor had no way to sign in from the landing header
 * or the top bar, only "Start a round" (which happens to pass through /login). Signed-out visitors now see
 * a "Log in" link; signed-in visitors keep the account menu; while the session check is still running
 * neither shows, so a signed-in visitor never sees "Log in" flash.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setPathname } from "next/navigation";
import chrome from "../../apps/ui/messages/en/chrome.json";
import home from "../../apps/ui/messages/en/home.json";

const session = vi.hoisted(() => ({ read: (): Promise<unknown> => Promise.reject(new Error("SESSION_REQUIRED")) }));
vi.mock("@/lib/api", () => ({ contractClient: { readSession: () => session.read(), logout: async () => {} } }));

import { TopBar } from "../../apps/ui/components/TopBar.js";
import { LandingChrome } from "../../apps/ui/components/landing/LandingChrome.js";

let root: Root | undefined;
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); });

async function render(view: React.ReactNode): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(view); for (let turn = 0; turn < 4; turn++) await Promise.resolve(); });
  return host;
}
const logIn = (host: HTMLElement) => [...host.querySelectorAll<HTMLAnchorElement>("a")].find((link) => link.textContent?.trim() === "Log in");
const accountTrigger = (host: HTMLElement) => host.querySelector('button[aria-haspopup="menu"]');

describe("signed-out visitors can sign in from the header", () => {
  it("the top bar shows a Log in link to /login when there is no session", async () => {
    session.read = () => Promise.reject(new Error("SESSION_REQUIRED"));
    setPathname("/pricing");
    const host = await render(<TopBar />);
    expect(logIn(host)?.getAttribute("href")).toBe("/login");
    expect(accountTrigger(host)).toBeNull();
  });

  it("the top bar keeps the account menu, and no Log in link, for a signed-in visitor", async () => {
    session.read = () => Promise.resolve({ session_id: "synthetic" });
    setPathname("/pricing");
    const host = await render(<TopBar />);
    expect(accountTrigger(host)).not.toBeNull();
    expect(logIn(host)).toBeUndefined();
  });

  it("shows neither while the session check is still running", async () => {
    session.read = () => new Promise(() => {});
    setPathname("/pricing");
    const host = await render(<TopBar />);
    expect(logIn(host)).toBeUndefined();
    expect(accountTrigger(host)).toBeNull();
  });

  it("the landing header offers Log in beside Start a round", async () => {
    session.read = () => Promise.reject(new Error("SESSION_REQUIRED"));
    const host = await render(<LandingChrome catalog={{ ...home, ...chrome }} />);
    expect(logIn(host)?.getAttribute("href")).toBe("/login");
    expect([...host.querySelectorAll("a")].some((link) => link.textContent?.includes("Start a round"))).toBe(true);
  });
});
