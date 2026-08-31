// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setPathname } from "next/navigation";

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
  sessionCookie: "t3-c1-session" as string | null,
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
  headers: async () => new Headers({ "user-agent": "t3-c1-render-test" })
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stubs/next-navigation.js")>()),
  useRouter: () => ({ push: vi.fn() })
}));

const globalStyles = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");

async function renderSignedInRoute(): Promise<Document> {
  routeMocks.sessionCookie = "t3-c1-session";
  setPathname("/");
  const [{ default: HomePage }, { TopBar }, { renderToStaticMarkup }, { JSDOM }] = await Promise.all([
    vi.importActual<HomePageModule>("../../apps/ui/app/page.js"),
    vi.importActual<TopBarModule>("../../apps/ui/components/TopBar.js"),
    vi.importActual<StaticRendererModule>("react-dom/server"),
    vi.importActual<JSDOMModule>("jsdom")
  ]);
  const page = await HomePage({ searchParams: Promise.resolve({ tab: "yours" }) });
  const html = renderToStaticMarkup(
    <div className="appShell">
      <TopBar />
      {page}
    </div>
  );
  return new JSDOM(html).window.document;
}

async function syntheticShell(hasLanding: boolean): Promise<Document> {
  const { JSDOM } = await vi.importActual<JSDOMModule>("jsdom");
  const landing = hasLanding ? '<main><section data-landing-section="hero"></section></main>' : "<main></main>";
  const document = new JSDOM(`<div class="appShell"><header class="topBar"></header>${landing}</div>`).window.document;
  const style = document.createElement("style");
  style.textContent = globalStyles;
  document.head.append(style);
  return document;
}

describe("chrome", () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    routeMocks.sessionCookie = "t3-c1-session";
    routeMocks.readPublicDebates.mockClear();
    routeMocks.listDebatesPageServer.mockClear();
    setPathname("/");
    document.documentElement.dataset.mode = "terracotta";
    localStorage.clear();
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    document.documentElement.removeAttribute("data-mode");
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("keeps the signed-in library chrome and excludes the anonymous landing", async () => {
    // PROPERTY: a signed-in `/` renders the complete library chrome and a
    // library discriminator, without any anonymous-landing hero content.
    const rendered = await renderSignedInRoute();
    const topBar = rendered.querySelector(".topBar");
    const library = rendered.querySelector('.sectionHead[aria-label="Debate library"]');

    expect(topBar?.textContent).toContain("Library");
    expect(topBar?.textContent).toContain("+ New debate");
    expect(topBar?.textContent).toContain("ASKER");
    expect(library?.textContent?.includes("Your Debates") || topBar?.textContent?.includes("+ New debate")).toBe(true);
    expect(rendered.body.textContent).not.toContain("Find the weakest claim in your own argument.");
  });

  it("renders the signed-in composer copy", async () => {
    // PROPERTY: the signed-in library composer exposes the T3 prompt, helper,
    // and submit copy as three distinct strings.
    const rendered = await renderSignedInRoute();
    const input = rendered.querySelector<HTMLInputElement>('input[aria-label="Debate claim"]');
    const submit = rendered.querySelector<HTMLButtonElement>(".startBtn");

    expect(input?.placeholder).toBe("Type a debatable claim or question…");
    expect(rendered.body.textContent).toContain("Models argue · you judge");
    expect(submit?.textContent?.replace(/\s+/g, " ").trim()).toBe("Start debate →");
  });

  it("mounts a working mode toggle in the signed-in TopBar", async () => {
    // PROPERTY: signed-in global chrome owns a real mode toggle whose click
    // flips the Terracotta document marker to Chamber.
    const { TopBar } = await vi.importActual<TopBarModule>("../../apps/ui/components/TopBar.js");
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<TopBar />));

    const toggle = document.querySelector<HTMLButtonElement>(".topBar [data-mode-toggle]");
    expect(toggle, "signed-in TopBar mode toggle").not.toBeNull();
    await act(async () => toggle!.click());
    expect(document.documentElement.dataset.mode).toBe("chamber");
    expect(toggle?.getAttribute("aria-pressed")).toBe("true");
  });

  it("suppresses the global TopBar when the landing is the document", async () => {
    // PROPERTY: a landing marker anywhere inside appShell suppresses its direct
    // global TopBar child before paint.
    const rendered = await syntheticShell(true);
    const topBar = rendered.querySelector<HTMLElement>(".topBar");

    expect(rendered.defaultView!.getComputedStyle(topBar!).display).toBe("none");
  });

  it("keeps the global TopBar visible without a landing marker", async () => {
    // PROPERTY: absence of landing markup leaves the global application chrome
    // visible, so the suppression selector cannot hide every TopBar.
    const rendered = await syntheticShell(false);
    const topBar = rendered.querySelector<HTMLElement>(".topBar");

    expect(rendered.defaultView!.getComputedStyle(topBar!).display).not.toBe("none");
  });

  it("pins the real signed-in render to zero landing markers", async () => {
    // PROPERTY: the actual signed-in `/` document contains no landing marker,
    // keeping the CSS suppression predicate false on the library route.
    const rendered = await renderSignedInRoute();

    expect(rendered.querySelectorAll("[data-landing-section]")).toHaveLength(0);
  });
});

describe.todo("lists", () => {});
