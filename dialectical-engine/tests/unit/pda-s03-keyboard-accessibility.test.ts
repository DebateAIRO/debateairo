import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type HomePageModule = {
  default: (props: { searchParams: Promise<{ tab?: string }> }) => Promise<unknown>;
};

type StaticRendererModule = {
  renderToStaticMarkup: (node: unknown) => string;
};

type JSDOMModule = {
  JSDOM: new (html: string) => { window: { document: Document } };
};

const serverMocks = vi.hoisted(() => ({
  // pin updated 2026-09-02: readSessionCookie enforces the 43-char base64url grammar
  // (L3-F5), so the fixture carries a lawful opaque token instead of a label.
  sessionCookie: "pda-s03-render-test-token-00000000000000000" as string | null,
  readPublicDebates: vi.fn(async () => ({ items: [], total: 0 })),
  listDebatesPageServer: vi.fn(async () => ({ summaries: [], shown: 0, total: 0 }))
}));

vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({ readPublicDebates: serverMocks.readPublicDebates }),
  listDebatesPageServer: serverMocks.listDebatesPageServer
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "__Host-debateai-session" && serverMocks.sessionCookie !== null
        ? { value: serverMocks.sessionCookie }
        : undefined
  }),
  headers: async () => new Headers({ "user-agent": "pda-s03-render-test" })
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../render/stubs/next-navigation.js")>()),
  useRouter: () => ({ push: vi.fn() })
}));

const expectedTabs = [
  { label: "Your debates", href: "/?tab=yours" },
  { label: "Public debates", href: "/?tab=public" }
] as const;

const globalStyles = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");

function accessibleName(element: Element, document: Document): string {
  const labelledBy = element.getAttribute("aria-labelledby")?.trim();
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return (element.getAttribute("aria-label") ?? element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function knownConcealmentBarrier(element: Element): string | null {
  // JSDOM does not compute an accessibility tree. This is intentionally an
  // enumerated blacklist of standard self/ancestor concealment mechanisms,
  // not a claim that every way of making a control unreachable is modeled.
  for (let current: Element | null = element; current !== null; current = current.parentElement) {
    if (current.hasAttribute("hidden")) return "hidden";
    if (current.getAttribute("aria-hidden") === "true") return 'aria-hidden="true"';
    if (current.hasAttribute("inert")) return "inert";

    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (style?.display === "none") return "display:none";
    if (style?.visibility === "hidden" || style?.visibility === "collapse") return `visibility:${style.visibility}`;
    if (style?.contentVisibility === "hidden") return "content-visibility:hidden";
  }
  return null;
}

async function renderHomePage(
  selected: "yours" | "public",
  sessionCookie: string | null = "pda-s03-render-test-token-00000000000000000"
): Promise<Document> {
  serverMocks.sessionCookie = sessionCookie;
  const [{ default: HomePage }, { renderToStaticMarkup }, { JSDOM }] = await Promise.all([
    vi.importActual<HomePageModule>("../../apps/ui/app/page.js"),
    vi.importActual<StaticRendererModule>("react-dom/server"),
    vi.importActual<JSDOMModule>("jsdom")
  ]);
  const page = await HomePage({ searchParams: Promise.resolve({ tab: selected }) });
  return new JSDOM(renderToStaticMarkup(page)).window.document;
}

function applyGlobalStyles(document: Document): void {
  const style = document.createElement("style");
  style.textContent = globalStyles;
  document.head.append(style);
}

describe("public debate navigation keyboard accessibility", () => {
  beforeEach(() => {
    serverMocks.sessionCookie = "pda-s03-render-test-token-00000000000000000";
    serverMocks.readPublicDebates.mockClear();
    serverMocks.listDebatesPageServer.mockClear();
  });

  it.each(["yours", "public"] as const)("renders enabled native links and current-page state for tab=%s", async (selected) => {
    // PROPERTY: the real HomePage render produces both named modes as enabled
    // navigation links with exact destinations and only the requested link
    // marked as the current page, without borrowing ARIA tab semantics, and
    // clears the enumerated `knownConcealmentBarrier` check -- this is a
    // blacklist, not proof the controls are exposed to a real user or
    // assistive technology; browser and assistive-technology exposure remain out of scope.
    const document = await renderHomePage(selected);
    const navigation = document.querySelector('.sectionHead[aria-label="Debate library"]');
    expect(navigation).not.toBeNull();
    expect(navigation!.getAttribute("role"), "navigation must not claim tablist semantics").not.toBe("tablist");

    const links = [...navigation!.querySelectorAll("a")];
    expect(links).toHaveLength(2);
    expect(navigation!.querySelector(".count")?.textContent?.trim(), "rendered row count").toBe("0 TOTAL");

    for (const expected of expectedTabs) {
      const matches = links.filter((link) => link.textContent?.trim() === expected.label);
      expect(matches, `${expected.label} rendered link count`).toHaveLength(1);
      const link = matches[0]!;
      expect(link.tagName, `${expected.label} native element`).toBe("A");
      expect(accessibleName(link, document), `${expected.label} accessible name`).toBe(expected.label);
      expect(link.getAttribute("href"), `${expected.label} real destination`).toBe(expected.href);
      expect((link as HTMLAnchorElement).tabIndex, `${expected.label} keyboard tab order`).toBe(0);
      expect(link.hasAttribute("disabled"), `${expected.label} native disabled state`).toBe(false);
      expect(link.getAttribute("aria-disabled"), `${expected.label} ARIA disabled state`).not.toBe("true");
      expect(link.getAttribute("role"), `${expected.label} must not claim tab semantics`).not.toBe("tab");
      expect(link.hasAttribute("aria-selected"), `${expected.label} must not expose tab selection`).toBe(false);
      expect(knownConcealmentBarrier(link), `${expected.label} known concealment barrier`).toBeNull();
      expect(link.getAttribute("aria-current"), `${expected.label} current-page state`).toBe(
        expected.href.endsWith(selected) ? "page" : null
      );
    }
  });

  it("renders the anonymous landing without library controls and keeps its mode control keyboard-reachable", async () => {
    // PROPERTY: anonymous `/` removes the library navigation and hint, renders
    // the exact landing hero, and exposes the mode button to keyboard users.
    const document = await renderHomePage("yours", null);
    const hero = document.querySelector('[data-landing-section="hero"]');
    const toggle = document.querySelector('[data-landing-section="chrome"] [data-mode-toggle]');

    expect(document.querySelector('.sectionHead[aria-label="Debate library"]') === null).toBe(true);
    expect(document.querySelector(".tabEmptyHint") === null).toBe(true);
    expect(hero?.textContent).toContain("Find the weakest joint in your own argument.");
    expect(toggle?.tagName, "mode control native element").toBe("BUTTON");
    expect((toggle as HTMLButtonElement | null)?.tabIndex, "mode control keyboard tab order").toBe(0);
    expect(toggle?.hasAttribute("disabled"), "mode control native disabled state").toBe(false);
    expect(toggle?.getAttribute("aria-disabled"), "mode control ARIA disabled state").not.toBe("true");
    expect(accessibleName(toggle!, document), "mode control accessible name").toMatch(
      /Switch to (Chamber|Terracotta) mode/
    );
    expect(knownConcealmentBarrier(toggle!), "mode control known concealment barrier").toBeNull();
  });

  it.each(["yours", "public"] as const)(
    "computes a grouped control treatment and a non-colour-only current state for tab=%s",
    async (selected) => {
      // PROPERTY: the real HomePage markup plus the real global stylesheet makes
      // both links read as one control group and distinguishes aria-current=page
      // through background, foreground, and shadow rather than colour alone.
      const document = await renderHomePage(selected);
      applyGlobalStyles(document);

      const navigation = document.querySelector<HTMLElement>('.sectionHead[aria-label="Debate library"]');
      const active = navigation?.querySelector<HTMLElement>('a[aria-current="page"]');
      const inactive = [...(navigation?.querySelectorAll<HTMLElement>("a") ?? [])].find(
        (link) => link !== active
      );
      const count = navigation?.querySelector<HTMLElement>(".count");

      expect(navigation, "debate navigation").not.toBeNull();
      expect(active, "current link").not.toBeNull();
      expect(inactive, "inactive link").not.toBeUndefined();
      expect(count, "debate count").not.toBeNull();

      const view = document.defaultView!;
      const navigationStyle = view.getComputedStyle(navigation!);
      const activeStyle = view.getComputedStyle(active!);
      const inactiveStyle = view.getComputedStyle(inactive!);
      const countStyle = view.getComputedStyle(count!);

      expect.soft(navigationStyle.justifyContent, "tabs stay grouped").toBe("flex-start");
      expect.soft(navigationStyle.gap, "group spacing").not.toBe("");
      expect.soft(countStyle.marginLeft, "count remains at the far edge").toBe("auto");
      expect.soft(inactiveStyle.fontWeight, "inactive link control weight").toBe("600");
      expect.soft(inactiveStyle.padding, "inactive link control padding").not.toBe("0");
      expect.soft(inactiveStyle.borderRadius, "inactive link control shape").not.toBe("");
      expect.soft(activeStyle.background, "current-state background").not.toBe(inactiveStyle.background);
      expect.soft(activeStyle.color, "current-state foreground").not.toBe(inactiveStyle.color);
      expect.soft(activeStyle.boxShadow, "current-state non-colour channel").not.toBe(inactiveStyle.boxShadow);
      expect.soft(activeStyle.boxShadow, "current-state shadow exists").not.toBe("");
      expect.soft(activeStyle.boxShadow, "current-state shadow is enabled").not.toBe("none");
    }
  );
});
