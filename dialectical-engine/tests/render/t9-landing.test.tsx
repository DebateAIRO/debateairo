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

    expect(document.body.textContent).toContain("Find the weakest claim in your own argument.");
    expect(document.querySelector('.sectionHead[aria-label="Debate library"]')).toBeNull();
  });

  it("keeps the library document for a request carrying the session cookie", async () => {
    // PROPERTY: cookie presence selects the unchanged library branch, including
    // its global + New debate action, and excludes the landing-only headline.
    const document = await renderRoute("t9-c1-session");

    expect(document.body.textContent).toContain("+ New debate");
    expect(document.querySelector('.sectionHead[aria-label="Debate library"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain("Find the weakest claim in your own argument.");
  });

  it("renders an accessibly named mode control on the anonymous document", async () => {
    // PROPERTY: the anonymous landing mounts the real mode control, identifiable
    // by its marker and accessible name rather than by its decorative glyph.
    const document = await renderRoute(null);
    const toggle = document.querySelector("[data-mode-toggle]");
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

describe.todo("T9-C2 chrome labels & CTAs", () => {});

describe.todo("T9-C4 landing content", () => {});
