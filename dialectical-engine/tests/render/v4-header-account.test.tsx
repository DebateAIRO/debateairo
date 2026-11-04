// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setPathname } from "next/navigation";

/*
 * V4 screen review (owner's picks, 3 Nov 2026, OWNER-PICKS-2026-11-03.md):
 *   ask-d6 A    one V4 header: brand, level menu, quota share, and one round account button with the person's initial. Its
 *               menu: "My maps" (ask-d5 B's All my maps), "Language", "Light or dark", "Settings", "Sign out". Signed out:
 *               "Sign in" in place of the round button.
 *   ask-f5      only one header row on the V4 pages: the site's old top bar steps back there.
 *   journey-f19 / ask-f6  "Open in the classic view" moves into the account menu, once; the header shows no classic link.
 */
const server = vi.hoisted(() => ({
  session: "IN" as "IN" | "OUT",
  email: "maria@example.com" as string | null,
  sessionReads: 0,
  emailReads: 0,
  pageReads: 0
}));
vi.mock("@/lib/api", () => ({
  // The public lane's ask hook (a whole public page, W2L-8) imports these; a press would use them, and no test presses.
  COOKIE_SESSION_MARKER: "cookie-session",
  createDebate: async () => { throw new Error("not in this test"); },
  // public-f13: the public page's one session read (V4PublicSessionProvider).
  validateSession: async () => {
    server.pageReads += 1;
    if (server.session === "OUT") throw new Error("SESSION_REQUIRED");
  },
  contractClient: {
    readSession: async () => {
      server.sessionReads += 1;
      if (server.session === "OUT") throw new Error("SESSION_REQUIRED");
      return { session_id: "synthetic" };
    },
    readAccountEmail: async () => {
      server.emailReads += 1;
      if (server.email === null) throw new Error("503: EMAIL_CHANGE_UNAVAILABLE");
      return { email: server.email, recovery_email: null, pending: null };
    },
    getBillingUsage: async () => { throw new Error("404: billing off"); },
    logout: async () => undefined,
    revokeAllSessions: async () => ({ revoked: 0 })
  }
}));

import { V4Header } from "../../apps/ui/components/v4/V4Header.js";
import { initialOf } from "../../apps/ui/components/v4/V4AccountMenu.js";
import { TopBar } from "../../apps/ui/components/TopBar.js";
import { V4PublicHeader, V4PublicSessionProvider } from "../../apps/ui/components/v4/V4PublicSession.js";
import { PublicDebatePageClient } from "../../apps/ui/app/public/debate/[id]/PublicDebatePageClient.js";
import { PublicDebateSchema } from "@debateai/contract";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
beforeEach(() => {
  server.session = "IN";
  server.email = "maria@example.com";
  server.sessionReads = 0;
  server.emailReads = 0;
  server.pageReads = 0;
  window.history.replaceState(null, "", "/v4/debate/11111111-1111-4111-8111-111111111111?level=plain");
  delete document.documentElement.dataset.mode;
});
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.replaceChildren();
  delete document.documentElement.dataset.mode;
});

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
  });
}

async function mount(element: React.ReactElement): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await settle();
  return host;
}

const header = (props: Partial<Parameters<typeof V4Header>[0]> = {}) => (
  <V4Header catalog={CATALOG} readingLevel="plain" {...props} />
);
const accountButton = (): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>(".v4HdrAccountButton");
const menu = (): HTMLElement | null => document.querySelector<HTMLElement>("[role=menu]");
const items = (): HTMLElement[] => [...(menu()?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];

async function openMenu(): Promise<void> {
  await act(async () => accountButton()!.click());
  expect(menu()).not.toBeNull();
}

describe("ask-d6 A: the round account button", () => {
  it("ends the header row and shows the person's initial; its name says what it is", async () => {
    const page = await mount(header());
    const row = page.querySelector(".v4HdrRight")!;
    expect(row.lastElementChild!.className).toBe("v4HdrAccount");
    const button = accountButton()!;
    expect(button.textContent).toBe("M");
    expect(button.getAttribute("aria-label")).toBe(CATALOG["v4.header.account"]);
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(server.emailReads).toBe(1);
  });

  it("the report strip (`after`) comes after the account button in the page, so the keyboard meets it where it is seen", async () => {
    const page = await mount(header({
      children: <button type="button" className="v4ExtraBefore">Extra</button>,
      after: <section className="v4RepStrip v4RepStrip-top"><button type="button">Write it</button></section>
    }));
    const row = page.querySelector(".v4HdrRight")!;
    const account = row.querySelector(".v4HdrAccount")!;
    const strip = page.querySelector(".v4RepStrip-top")!;
    // A row of the header itself, after the controls (the second browser check: opening it moves none of them).
    expect(row.lastElementChild!.className).toBe("v4HdrAccount");
    expect(page.querySelector(".v4Hdr")!.lastElementChild).toBe(strip);
    expect(row.contains(strip)).toBe(false);
    expect(account.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(row.querySelector(".v4ExtraBefore")!.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("an address that cannot be read shows a plain person mark, never a guess", async () => {
    server.email = null;
    await mount(header());
    expect(accountButton()!.textContent).toBe("");
    expect(accountButton()!.querySelector(".v4HdrAccountMark")).not.toBeNull();
  });

  it("the initial is the first letter or digit of the address's name part, as a capital", () => {
    expect(initialOf("maria@example.com")).toBe("M");
    expect(initialOf("_.4you@example.com")).toBe("4");
    expect(initialOf("ștefan@example.ro")).toBe("Ș");
    expect(initialOf("@example.com")).toBeNull();
  });

  it("the menu holds My maps, Language, Light or dark, Settings, the classic view once, then Sign out", async () => {
    await mount(header({ classicHref: "/debate/11111111-1111-4111-8111-111111111111" }));
    // journey-f19: the header itself shows no classic link.
    expect(document.querySelector(".v4Hdr a[href^='/debate/']")).toBeNull();
    await openMenu();
    expect(items().map((item) => item.textContent)).toEqual([
      CATALOG["v4.maps.menu"],
      CATALOG["v4.header.menu.language"],
      CATALOG["v4.header.menu.theme"],
      CATALOG["v4.header.menu.settings"],
      CATALOG["v4.common.classicView"],
      CATALOG["v4.header.menu.signOut"]
    ]);
    expect(["My maps", "Language", "Light or dark", "Settings", "Sign out"].every((word) => items().some((item) => item.textContent === word))).toBe(true);
    expect(menu()!.getAttribute("aria-label")).toBe(CATALOG["v4.header.account"]);
    // ask-d5 B: "My maps" is All my maps, carrying the level the page's links carry.
    expect(items()[0]!.getAttribute("href")).toBe("/v4?maps=all&level=plain");
    expect(items()[3]!.getAttribute("href")).toBe("/settings");
    expect(items()[4]!.getAttribute("href")).toBe("/debate/11111111-1111-4111-8111-111111111111");
    expect(document.querySelectorAll("[data-v4-menu=classic]")).toHaveLength(1);
  });

  it("a page that shows the classic view elsewhere passes none, so the menu has no classic item", async () => {
    await mount(header({ classicHref: null }));
    await openMenu();
    expect(items().map((item) => item.textContent)).not.toContain(CATALOG["v4.common.classicView"]);
    expect(items()).toHaveLength(5);
  });

  it("Language closes the menu and opens the site's language list under the button; Escape gives focus back to it", async () => {
    await mount(header());
    await openMenu();
    await act(async () => items()[1]!.click());
    expect(menu()).toBeNull();
    await act(async () => { await new Promise((done) => setTimeout(done, 5)); });
    const list = document.querySelector<HTMLElement>("[role=dialog]")!;
    expect(list).not.toBeNull();
    const search = list.querySelector<HTMLInputElement>("[role=combobox]")!;
    expect(document.activeElement).toBe(search);
    await act(async () => { search.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(document.activeElement).toBe(accountButton());
  });

  it("Light or dark switches the site's mode at once (no reveal: V4 moves only its six moves) and keeps the choice", async () => {
    await mount(header());
    const transition = vi.fn();
    (document as Document & { startViewTransition?: unknown }).startViewTransition = transition;
    try {
      await openMenu();
      // ACCESS-13: its name says what a press does, after the words it shows.
      expect(items()[2]!.getAttribute("aria-label")).toBe(CATALOG["v4.header.menu.themeToDark"]);
      expect(items()[2]!.getAttribute("aria-label")!.startsWith(items()[2]!.textContent!)).toBe(true);
      await act(async () => items()[2]!.click());
      expect(document.documentElement.dataset.mode).toBe("chamber");
      expect(localStorage.getItem("debateai.mode")).toBe("chamber");
      expect(transition).not.toHaveBeenCalled();
      expect(menu()).toBeNull();
      await openMenu();
      expect(items()[2]!.getAttribute("aria-label")).toBe(CATALOG["v4.header.menu.themeToLight"]);
      await act(async () => items()[2]!.click());
      expect(document.documentElement.dataset.mode).toBe("terracotta");
    } finally {
      delete (document as Document & { startViewTransition?: unknown }).startViewTransition;
      localStorage.removeItem("debateai.mode");
    }
  });
});

describe("W2L-8 (the wave-2 checks): a whole public page with the real account menu reads the session once", () => {
  const messages = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
  const debate = PublicDebateSchema.parse({
    public_ref: "22222222-2222-4222-8222-222222222222",
    author_pseudonym: "Stable Public Author",
    question: "Should public readers receive the complete answer surface?",
    published_at: "2026-08-24T00:00:00.000Z",
    answer: {
      terminal: "SERVED", verdict: "SUPPORTED", verdict_available: true, confidence_band: "moderate",
      summary_segments: [{ text: "The public summary remains readable." }], badges: ["Evidence checked"],
      residual_objections: ["A later primary source could change the result."], reversal_point: "A replicated contrary result.",
      as_of: "2026-08-24T00:00:00.000Z"
    }
  });
  it.each([["IN", 1], ["OUT", 0]] as const)("signed %s: the page's one session read, no read of the menu's own, and %i email read", async (session, emails) => {
    server.session = session;
    window.history.replaceState(null, "", `/public/debate/${debate.public_ref}`);
    await mount(
      <PublicDebatePageClient debate={debate} locale="en" storyLocale="en" storyCatalog={messages("public")} publicCatalog={messages("public")}
        homeCatalog={{}} timeCatalog={messages("time")} debateChromeCatalog={messages("debateChrome")} v4Catalog={CATALOG} />
    );
    expect(server.pageReads).toBe(1);
    expect(server.sessionReads).toBe(0);
    expect(server.emailReads).toBe(emails);
    if (session === "IN") expect(accountButton()!.textContent).toBe("M");
    else expect(document.querySelector<HTMLAnchorElement>(".v4HdrAccount a")!.textContent).toBe(CATALOG["v4.ask.signIn"]);
    expect(document.querySelector(".v4HdrQuotaHold, .v4HdrAllowance")).toBeNull();
  });
});

describe("public-f13 with ask-d6 A: a public page reads the session once", () => {
  it.each([["IN"], ["OUT"]] as const)("signed %s, the header's account button takes the page's one answer and reads no session of its own", async (session) => {
    server.session = session;
    window.history.replaceState(null, "", "/public/debate/22222222-2222-4222-8222-222222222222");
    await mount(<V4PublicSessionProvider><V4PublicHeader catalog={CATALOG} /></V4PublicSessionProvider>);
    expect(server.pageReads).toBe(1);
    expect(server.sessionReads).toBe(0);
    if (session === "IN") expect(accountButton()).not.toBeNull();
    else expect(document.querySelector<HTMLAnchorElement>(".v4HdrAccount a")!.textContent).toBe(CATALOG["v4.ask.signIn"]);
    // journey-f19: no quota on a public page.
    expect(document.querySelector(".v4HdrAllowance")).toBeNull();
  });
});

describe("ask-d6 A: signed out, and while the page still checks", () => {
  it("a page that knows the visitor is signed out shows Sign in in the button's place, with the way back to this page and its level", async () => {
    window.history.replaceState(null, "", "/v4?topic=nuclear");
    await mount(header({ session: "OUT" }));
    expect(accountButton()).toBeNull();
    const signIn = document.querySelector<HTMLAnchorElement>(".v4HdrAccount a")!;
    expect(signIn.textContent).toBe(CATALOG["v4.ask.signIn"]);
    expect(signIn.className).toBe("v4Link v4HdrSignIn");
    expect(signIn.getAttribute("href")).toBe(`/login?next=${encodeURIComponent("/v4?topic=nuclear&level=plain")}`);
    // Nothing of the account is read for a stranger, and the page's own session answer is used.
    expect(server.sessionReads).toBe(0);
    expect(server.emailReads).toBe(0);
  });

  // WHOLE-14 (the wave-2 checks, W2L-7): the header's Sign in against the step-1 buttons is now checked on one render of the
  // real ask page with its real header (tests/render/v4-ask-header-way-back.test.tsx), never through a copied address or
  // the source text.

  it("a page with no session answer of its own reads it: signed out, Sign in", async () => {
    server.session = "OUT";
    await mount(header());
    expect(server.sessionReads).toBe(1);
    expect(document.querySelector(".v4HdrAccount a")!.textContent).toBe(CATALOG["v4.ask.signIn"]);
  });

  it("while the page still checks the session, the button's place is held empty and nothing is read", async () => {
    await mount(header({ session: "CHECKING" }));
    const slot = document.querySelector(".v4HdrAccount")!;
    expect(slot.querySelector("a, button")).toBeNull();
    expect(server.sessionReads).toBe(0);
  });
});

describe("ask-f5: one header row on the V4 pages", () => {
  it("the site's old top bar steps back on /v4 and every page under it, and stays on the others", async () => {
    for (const path of ["/v4", "/v4/debate/11111111-1111-4111-8111-111111111111", "/v4/debate/11111111-1111-4111-8111-111111111111/report"]) {
      setPathname(path);
      const page = await mount(<TopBar />);
      expect(page.innerHTML, path).toBe("");
      await act(async () => root!.unmount());
      root = null;
      host?.remove();
    }
    setPathname("/pricing");
    const page = await mount(<TopBar />);
    expect(page.querySelector("header.topBar")).not.toBeNull();
    // A path that only starts with the same letters is not a V4 page.
    setPathname("/v4x");
    await act(async () => root!.render(<TopBar />));
    expect(page.querySelector("header.topBar")).not.toBeNull();
    setPathname("/");
  });
});
