// @vitest-environment jsdom
/*
 * Auth UI repair (2026-10-09), fix 3: a signed-out visitor had no way to sign in from the landing header
 * or the top bar, only "Start a round" (which happens to pass through /login). Signed-out visitors now see
 * a "Log in" link; signed-in visitors keep the account menu; while the session check is still running
 * neither shows, so a signed-in visitor never sees "Log in" flash.
 */
import { readFileSync } from "node:fs";
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
    // /pricing is not a sign-in return path, so the link carries the default one (safeReturnPath).
    expect(logIn(host)?.getAttribute("href")).toBe("/login?next=%2Fnew");
    expect(accountTrigger(host)).toBeNull();
  });

  it("the top bar's Log in link brings the visitor back to the page they were on", async () => {
    session.read = () => Promise.reject(new Error("SESSION_REQUIRED"));
    setPathname("/settings/security");
    const host = await render(<TopBar />);
    expect(logIn(host)?.getAttribute("href")).toBe("/login?next=%2Fsettings%2Fsecurity");
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

/*
 * Review fix (2026-10-09): the phone layout hid every plain `.btn` in the top bar
 * (`.topBarActions > .btn:not(.btnDark){display:none}` at <=640px), and the new Log in link is one, so on a
 * phone the signed-out header again had no way to sign in. Render tests run without CSS, so this reads
 * globals.css through jsdom's CSSOM and checks the rendered link against the real rules.
 */
describe("the top bar's Log in link stays visible on phones", () => {
  type Rule = { selectors: string[]; display: string; media: string | null };
  function stylesheetRules(): Rule[] {
    const style = document.createElement("style");
    style.textContent = readFileSync("apps/ui/app/globals.css", "utf8");
    document.head.append(style);
    const rules: Rule[] = [];
    const walk = (list: CSSRuleList, media: string | null) => {
      for (const rule of [...list]) {
        if ((rule as CSSMediaRule).media !== undefined && (rule as CSSMediaRule).cssRules !== undefined) walk((rule as CSSMediaRule).cssRules, (rule as CSSMediaRule).media.mediaText);
        else if ((rule as CSSStyleRule).selectorText !== undefined) rules.push({ selectors: (rule as CSSStyleRule).selectorText.split(",").map((part) => part.trim()), display: (rule as CSSStyleRule).style.display, media });
      }
    };
    walk(style.sheet!.cssRules, null);
    style.remove();
    return rules;
  }
  const matches = (element: Element, selector: string) => { try { return element.matches(selector); } catch { return false; } };
  const phone = (media: string | null) => media !== null && Number(/max-width:\s*(\d+(?:\.\d+)?)px/.exec(media)?.[1] ?? Infinity) <= 640;

  async function signedOutTopBar() {
    session.read = () => Promise.reject(new Error("SESSION_REQUIRED"));
    setPathname("/pricing");
    const host = await render(<TopBar />);
    return logIn(host)!;
  }

  it("carries its own class", async () => {
    expect((await signedOutTopBar()).classList.contains("topBarSignIn")).toBe(true);
  });

  it("no rule that hides elements matches it, at any width", async () => {
    const link = await signedOutTopBar();
    const hiding = stylesheetRules().filter((rule) => rule.display === "none")
      .flatMap((rule) => rule.selectors.filter((selector) => matches(link, selector)).map((selector) => `${rule.media ?? "all"}: ${selector}`));
    expect(hiding).toEqual([]);
  });

  it("a phone-width (<=640px) rule keeps it displayed", async () => {
    const link = await signedOutTopBar();
    const shown = stylesheetRules().filter((rule) => phone(rule.media) && rule.display !== "" && rule.display !== "none")
      .filter((rule) => rule.selectors.some((selector) => matches(link, selector)));
    expect(shown.length).toBeGreaterThan(0);
  });
});
