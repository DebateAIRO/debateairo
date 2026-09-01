import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type HomePageModule = {
  default: (props: { searchParams: Promise<{ tab?: string }> }) => Promise<ReactNode>;
};

type TopBarModule = {
  TopBar: () => ReactNode;
};

type StaticRendererModule = {
  renderToStaticMarkup: (node: ReactNode) => string;
};

type JSDOMModule = {
  JSDOM: new (html: string) => { window: { document: Document } };
};

const routeMocks = vi.hoisted(() => ({
  sessionCookie: null as string | null,
  readPublicDebates: vi.fn(async () => ({ items: [], total: 0 })),
  listDebatesPageServer: vi.fn(async () => ({ summaries: [], shown: 0, total: 0 }))
}));

vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({ readPublicDebates: routeMocks.readPublicDebates }),
  listDebatesPageServer: routeMocks.listDebatesPageServer
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "__Host-debateai-session" && routeMocks.sessionCookie !== null
        ? { value: routeMocks.sessionCookie }
        : undefined
  }),
  headers: async () => new Headers({ "user-agent": "t9-c1-render-test" })
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stubs/next-navigation.js")>()),
  useRouter: () => ({ push: vi.fn() })
}));

async function renderRoute(sessionCookie: string | null): Promise<Document> {
  routeMocks.sessionCookie = sessionCookie;
  const [
    { default: HomePage },
    { TopBar },
    { renderToStaticMarkup },
    { JSDOM }
  ] = await Promise.all([
    vi.importActual<HomePageModule>("../../apps/ui/app/page.js"),
    vi.importActual<TopBarModule>("../../apps/ui/components/TopBar.js"),
    vi.importActual<StaticRendererModule>("react-dom/server"),
    vi.importActual<JSDOMModule>("jsdom")
  ]);
  const page = await HomePage({ searchParams: Promise.resolve({ tab: "yours" }) });
  const html = renderToStaticMarkup(
    <>
      <TopBar />
      {page}
    </>
  );
  return new JSDOM(html).window.document;
}

describe("T9-C1 route split & chrome", () => {
  beforeEach(() => {
    routeMocks.sessionCookie = null;
    routeMocks.readPublicDebates.mockClear();
    routeMocks.listDebatesPageServer.mockClear();
  });

  it("renders the landing hero instead of the library for an anonymous request", async () => {
    // PROPERTY: a request without the session cookie renders the landing's
    // exact hero headline and does not leak the signed-in library surface.
    const document = await renderRoute(null);
    const hero = document.querySelector('[data-landing-section="hero"]');

    expect(hero?.textContent).toContain("Find the weakest claim in your own argument.");
    expect(document.querySelector('.sectionHead[aria-label="Debate library"]')).toBeNull();
  });

  it("keeps the library document for a request carrying the session cookie", async () => {
    // PROPERTY: cookie presence selects the unchanged library branch, including
    // its discriminating library section, and excludes the landing-only headline.
    const document = await renderRoute("t9-c1-session");

    expect(
      document.querySelector('.sectionHead[aria-label="Debate library"]'),
      "signed-in library discriminator"
    ).not.toBeNull();
    expect(document.body.textContent).not.toContain("Find the weakest claim in your own argument.");
  });

  it("renders an accessibly named mode control on the anonymous document", async () => {
    // PROPERTY: the anonymous landing chrome mounts the real mode control,
    // identifiable by its marker and accessible name rather than its decorative glyph.
    const document = await renderRoute(null);
    const toggle = document.querySelector('[data-landing-section="chrome"] [data-mode-toggle]');
    const accessibleName = toggle?.getAttribute("aria-label") ?? toggle?.textContent?.trim() ?? "";

    expect(toggle?.tagName).toBe("BUTTON");
    expect(accessibleName).toMatch(/Switch to (Chamber|Terracotta) mode/);
  });

  it("composes the five landing sections in contract order", async () => {
    // PROPERTY: the landing's structural sections stay in Chrome → Hero →
    // Sample → Method → Pricing document order even while later clusters fill them.
    const document = await renderRoute(null);
    const order = [...document.querySelectorAll("[data-landing-section]")].map(
      (section) => section.getAttribute("data-landing-section")
    );

    expect(order).toEqual(["chrome", "hero", "sample", "method", "pricing"]);
  });

  it("keeps the route branch immediate and the landing a server component", () => {
    // PROPERTY: the cookie read is followed by the landing branch before any
    // library work, AuthGate stays off `/`, and LandingPage remains server-rendered.
    const pageSource = readFileSync(resolve(process.cwd(), "apps/ui/app/page.tsx"), "utf8");
    const cookieReadIndex = pageSource.indexOf("const token = (await cookies()).get(USER_TOKEN_COOKIE)?.value ?? null;");
    const landingBranch = /if\s*\(\s*token\s*===\s*null\s*\)\s*(?:\{\s*)?return\s*<LandingPage\s*\/>\s*;/.exec(
      pageSource
    );
    const landingReturnIndex = landingBranch?.index ?? -1;
    const libraryWorkIndex = pageSource.indexOf("const requestedTab = (await searchParams).tab;");
    const landingPath = resolve(process.cwd(), "apps/ui/components/landing/LandingPage.tsx");

    expect(pageSource).not.toContain("AuthGate");
    expect(cookieReadIndex).toBeGreaterThanOrEqual(0);
    expect(landingReturnIndex).toBeGreaterThan(cookieReadIndex);
    expect(landingReturnIndex).toBeLessThan(libraryWorkIndex);
    expect(existsSync(landingPath)).toBe(true);

    const landingSource = readFileSync(landingPath, "utf8");
    expect(landingSource).not.toMatch(/^\s*["']use client["'];/m);
  });
});

describe("T9-C2 chrome labels & CTAs", () => {
  it("renders the wordmark and exact navigation labels inside landing chrome", async () => {
    // PROPERTY: C2-owned labels are found only through the chrome subtree, so
    // content in later T9 sections cannot accidentally satisfy this contract.
    const document = await renderRoute(null);
    const chrome = document.querySelector('[data-landing-section="chrome"]');
    expect(chrome).not.toBeNull();

    const expectedLinks = [
      ["Method", "#method"],
      ["Transcripts", "#transcripts"],
      ["Pricing", "#pricing"],
      ["Log in", "/login"],
      ["Sign up", "/sign-up"]
    ] as const;

    for (const [label, href] of expectedLinks) {
      const link = [...chrome!.querySelectorAll("a")]
        .find((candidate) => candidate.textContent?.trim() === label);
      expect(link, `missing chrome link ${label}`).toBeDefined();
      expect(link?.getAttribute("href")).toBe(href);
    }

    const wordmark = [...chrome!.querySelectorAll<HTMLAnchorElement>("a")]
      .find((candidate) => candidate.textContent?.trim() === "DebateAI");
    expect(wordmark).toBeDefined();
    expect(wordmark?.style.fontFamily).toBe("var(--font-display)");
  });

  it("renders the chrome primary CTA with the exact safe return target", async () => {
    // PROPERTY: the AM8-narrowed C2 CTA is asserted inside chrome only; hero
    // CTAs remain T9-C4's contract.
    const document = await renderRoute(null);
    const chrome = document.querySelector('[data-landing-section="chrome"]');
    const primary = [...chrome!.querySelectorAll("a")]
      .find((candidate) => candidate.textContent?.trim() === "Start a debate");

    expect(primary).toBeDefined();
    expect(primary?.getAttribute("href")).toBe("/login?next=%2Fnew");
    expect(primary?.getAttribute("href")).not.toBe("#");
    expect(primary?.getAttribute("href")).not.toBe("/new");
  });

  it("keeps every stub navigation link safe to click", async () => {
    // PROPERTY: all three stub anchors can be activated on the real anonymous
    // document without replacing the page with an uncaught error surface.
    const document = await renderRoute(null);
    const chrome = document.querySelector('[data-landing-section="chrome"]');
    const errorEvents: ErrorEvent[] = [];
    document.defaultView?.addEventListener("error", (event) => errorEvents.push(event));

    for (const href of ["#method", "#transcripts", "#pricing"]) {
      const link = chrome!.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
      expect(link, `missing stub ${href}`).not.toBeNull();
      expect(() => link!.click()).not.toThrow();
      expect(chrome!.textContent).toContain("DebateAI");
      expect(document.querySelector("[data-nextjs-error-boundary]")).toBeNull();
    }

    expect(errorEvents).toEqual([]);
  });
});

describe.todo("T9-C4 landing content", () => {});
