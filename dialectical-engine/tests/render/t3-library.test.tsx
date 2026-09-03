// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setPathname } from "next/navigation";
import type { PublicDebateSummary } from "@debateai/contract";
import type { DebateSummary } from "../../apps/ui/lib/types.js";

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
  readPublicDebates: vi.fn(async () => ({ items: [] as PublicDebateSummary[], total: 0 })),
  listDebatesPageServer: vi.fn(async () => ({ summaries: [] as DebateSummary[], shown: 0, total: 0 }))
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

async function renderRoute(
  sessionCookie: string | null,
  selected: "yours" | "public" = "yours"
): Promise<Document> {
  routeMocks.sessionCookie = sessionCookie;
  setPathname("/");
  const [{ default: HomePage }, { TopBar }, { renderToStaticMarkup }, { JSDOM }] = await Promise.all([
    vi.importActual<HomePageModule>("../../apps/ui/app/page.js"),
    vi.importActual<TopBarModule>("../../apps/ui/components/TopBar.js"),
    vi.importActual<StaticRendererModule>("react-dom/server"),
    vi.importActual<JSDOMModule>("jsdom")
  ]);
  const page = await HomePage({ searchParams: Promise.resolve({ tab: selected }) });
  const html = renderToStaticMarkup(
    <div className="appShell">
      <TopBar />
      {page}
    </div>
  );
  const document = new JSDOM(html).window.document;
  const style = document.createElement("style");
  style.textContent = globalStyles;
  document.head.append(style);
  return document;
}

async function renderSignedInRoute(): Promise<Document> {
  return renderRoute("t3-c1-session");
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
    const askerPlaceholder = [...(topBar?.querySelectorAll("span") ?? [])].find(
      (element) => element.textContent === "ASKER"
    );

    expect(topBar?.textContent).toContain("Library");
    expect(topBar?.textContent).toContain("+ New debate");
    // Placeholder pending V's Q-13 identity chip (t_afb67c94): this is an
    // honest, non-interactive role label and makes no signed-in-state claim.
    expect(askerPlaceholder, "ASKER role placeholder").not.toBeNull();
    expect(askerPlaceholder?.classList.contains("roleChip")).toBe(true);
    expect(askerPlaceholder?.classList.contains("btn")).toBe(false);
    expect(askerPlaceholder?.getAttribute("title")).toBe("Asker role placeholder");
    expect(askerPlaceholder?.hasAttribute("aria-label")).toBe(false);
    expect(library?.textContent?.includes("Your Debates") || topBar?.textContent?.includes("+ New debate")).toBe(true);
    expect(rendered.body.textContent).not.toContain("Find the weakest claim in your own argument.");
  });

  it("renders the signed-in composer copy", async () => {
    // PROPERTY: the signed-in library composer exposes the T3 prompt, helper,
    // and submit copy as three distinct strings.
    const rendered = await renderSignedInRoute();
    const input = rendered.querySelector<HTMLTextAreaElement>('textarea[aria-label="Debate claim"]');
    const submit = rendered.querySelector<HTMLButtonElement>(".libStart");

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

  it("mounts an enabled mode toggle in the auth TopBar", async () => {
    // PROPERTY (T3-C1-5): auth routes expose the authTopBar branch's own
    // accessibly named mode control, and the control is never disabled.
    setPathname("/login");
    const { TopBar } = await vi.importActual<TopBarModule>("../../apps/ui/components/TopBar.js");
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<TopBar />));

    const toggle = document.querySelector<HTMLButtonElement>(".authTopBar [data-mode-toggle]");
    const accessibleName = toggle?.getAttribute("aria-label") ?? toggle?.textContent?.trim() ?? "";

    expect(toggle, "authTopBar mode toggle").not.toBeNull();
    expect(accessibleName).toMatch(/Switch to (Chamber|Terracotta) mode/);
    expect(toggle?.hasAttribute("aria-disabled")).toBe(false);
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

  it("suppresses the TopBar in the real anonymous landing document", async () => {
    // PROPERTY (T3-C1-4 P1): the real anonymous `/` branch emits all five
    // landing markers and suppresses the real global TopBar with display:none.
    const rendered = await renderRoute(null);
    const topBar = rendered.querySelector<HTMLElement>(".topBar");

    expect(rendered.querySelectorAll("[data-landing-section]")).toHaveLength(5);
    expect(topBar, "real anonymous TopBar").not.toBeNull();
    expect(rendered.defaultView!.getComputedStyle(topBar!).display).toBe("none");
  });

  it("keeps the TopBar mode toggle visible in the real signed-in document", async () => {
    // PROPERTY (T3-C1-4 P2): the same real route harness keeps signed-in
    // global chrome and its accessibly named mode control visible.
    const rendered = await renderRoute("t3-c1-session");
    const topBar = rendered.querySelector<HTMLElement>(".topBar");
    const toggle = topBar?.querySelector<HTMLElement>("[data-mode-toggle]") ?? null;
    const accessibleName = toggle?.getAttribute("aria-label") ?? toggle?.textContent?.trim() ?? "";

    expect(rendered.defaultView!.getComputedStyle(topBar!).display).toBe("flex");
    expect(toggle, "real signed-in TopBar mode toggle").not.toBeNull();
    expect(accessibleName).toMatch(/Switch to (Chamber|Terracotta) mode/);
    expect(rendered.defaultView!.getComputedStyle(toggle!).display).not.toBe("none");
  });

  it("keeps the real layout TopBar as a direct appShell child", () => {
    // PROPERTY (T3-C1-4 P3): layout.tsx preserves the direct-child shape on
    // which the anonymous suppression selector depends.
    const layoutSource = readFileSync(resolve(process.cwd(), "apps/ui/app/layout.tsx"), "utf8");

    expect(layoutSource).toMatch(/<div className="appShell">\s*<TopBar \/>/);
  });

  it("pins the real signed-in render to zero landing markers", async () => {
    // PROPERTY: the actual signed-in `/` document contains no landing marker,
    // keeping the CSS suppression predicate false on the library route.
    const rendered = await renderSignedInRoute();

    expect(rendered.querySelectorAll("[data-landing-section]")).toHaveLength(0);
  });
});

describe("lists", () => {
  const yourDebates = [
    {
      id: "debate:yours-1",
      topic: "Should cities price road congestion?",
      status: "complete",
      created_at: "2026-08-31T08:00:00.000Z",
      completed_at: "2026-08-31T08:10:00.000Z",
      models: ["gpt-5.6-sol", "claude-opus-5"]
    },
    {
      id: "debate:yours-2",
      topic: "Can prediction markets improve public policy?",
      status: "generating",
      created_at: "2026-08-31T09:00:00.000Z",
      completed_at: null,
      models: ["gpt-5.6-sol", "claude-opus-5", "grok-4"]
    },
    {
      id: "debate:yours-3",
      topic: "Should scientific peer review be open by default?",
      status: "complete",
      created_at: "2026-08-31T10:00:00.000Z",
      completed_at: "2026-08-31T10:10:00.000Z",
      models: ["gpt-5.6-sol"]
    },
    {
      id: "debate:yours-4",
      topic: "Does remote work strengthen small cities?",
      status: "complete",
      created_at: "2026-08-31T11:00:00.000Z",
      completed_at: "2026-08-31T11:10:00.000Z",
      models: ["claude-opus-5", "grok-4"]
    }
  ] satisfies DebateSummary[];

  const publicDebates = [
    {
      public_ref: "11111111-1111-4111-8111-111111111111",
      author_pseudonym: "ember-archive",
      question: "Should public algorithms publish their evaluation sets?",
      published_at: "2026-08-30T08:00:00.000Z",
      verdict: "SUPPORTED",
      confidence_band: "moderate"
    },
    {
      public_ref: "22222222-2222-4222-8222-222222222222",
      author_pseudonym: "quiet-cedar",
      question: "Can a city eliminate parking minimums without displacement?",
      published_at: "2026-08-30T09:00:00.000Z",
      verdict: "CONTESTED",
      confidence_band: "mixed"
    },
    {
      public_ref: "33333333-3333-4333-8333-333333333333",
      author_pseudonym: "north-starling",
      question: "Should replication grants precede novel research grants?",
      published_at: "2026-08-30T10:00:00.000Z",
      verdict: null,
      confidence_band: null
    }
  ] satisfies PublicDebateSummary[];

  const disclosure =
    "Published debates may be indexed by search engines. Copies may persist after unpublishing.";

  beforeEach(() => {
    routeMocks.sessionCookie = "t3-c2-session";
    routeMocks.listDebatesPageServer.mockReset().mockResolvedValue({
      summaries: yourDebates,
      shown: yourDebates.length,
      total: 41
    });
    routeMocks.readPublicDebates.mockReset().mockResolvedValue({
      items: publicDebates,
      total: 37
    });
  });

  function expectLiveCount(document: Document, exact: string): void {
    const navigation = document.querySelector('.sectionHead[aria-label="Debate library"]');
    const count = navigation?.querySelector<HTMLElement>(".count");
    const rows = document.querySelectorAll("[data-library-row]");

    expect(count?.textContent?.trim()).toBe(exact);
    expect(Number.parseInt(count?.textContent ?? "", 10)).toBe(rows.length);
  }

  it("renders recased native selectors and a live count for the four Your debates rows", async () => {
    // PROPERTY (T3-C2-1/T3-C2-4): the Your debates selector uses the
    // approved casing and its chip is the number of rows actually rendered.
    const rendered = await renderRoute("t3-c2-session", "yours");
    const labels = [...rendered.querySelectorAll('.sectionHead[aria-label="Debate library"] a')]
      .map((link) => link.textContent?.trim());

    expect(labels).toEqual(["Your debates", "Public debates"]);
    expectLiveCount(rendered, "4 TOTAL");
  });

  it("renders a live count for the three Public debates rows", async () => {
    // PROPERTY (T3-C2-4): the Public debates chip follows the rendered public
    // rows, even when the API's aggregate total is larger than this page.
    const rendered = await renderRoute("t3-c2-session", "public");

    expectLiveCount(rendered, "3 TOTAL");
  });

  it("keeps Your and Public membership distinct", async () => {
    // PROPERTY (T3-C2-2): switching the routed selector changes the rendered
    // membership instead of showing one hard-coded list under both labels.
    const yours = await renderRoute("t3-c2-session", "yours");
    const publicList = await renderRoute("t3-c2-session", "public");

    expect(yours.body.textContent).toContain("Should cities price road congestion?");
    expect(yours.body.textContent).not.toContain("Should public algorithms publish their evaluation sets?");
    expect(publicList.body.textContent).toContain("Should public algorithms publish their evaluation sets?");
    expect(publicList.body.textContent).not.toContain("Should cities price road congestion?");
  });

  it("renders every library row as a shell/core bezel", async () => {
    // PROPERTY (T3-C2-3): every row in both routed lists has a shell wrapper
    // and one direct core body, using the shared T1 bezel vocabulary.
    for (const selected of ["yours", "public"] as const) {
      const rendered = await renderRoute("t3-c2-session", selected);
      const rows = [...rendered.querySelectorAll<HTMLElement>('[data-library-row][data-bezel="shell"]')];

      expect(rows.length).toBe(selected === "yours" ? 4 : 3);
      for (const row of rows) {
        const core = row.querySelector<HTMLElement>(':scope > [data-bezel="core"]');

        expect(row.style.background).toBe("var(--shell)");
        expect(core).not.toBeNull();
        expect(core?.style.background).toBe("var(--core)");
        expect(core?.style.background).not.toBe(row.style.background);
      }
    }
  });

  it("renders the public search-indexing disclosure once under the list and never on Yours", async () => {
    // PROPERTY (T3-C2-4): indexing persistence is a public-list disclosure,
    // not per-row copy and not content shown on the private list.
    const yours = await renderRoute("t3-c2-session", "yours");
    const publicList = await renderRoute("t3-c2-session", "public");
    const publicMatches = [...publicList.querySelectorAll("p")]
      .filter((paragraph) => paragraph.textContent?.trim() === disclosure);
    const yoursMatches = [...yours.querySelectorAll("p")]
      .filter((paragraph) => paragraph.textContent?.trim() === disclosure);

    expect(publicMatches.length).toBe(1);
    expect(publicList.querySelector(".recentList")?.nextElementSibling === publicMatches[0]).toBe(true);
    expect(yoursMatches.length).toBe(0);
  });

});
