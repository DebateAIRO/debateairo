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
  sessionCookie: "t".repeat(43) as string | null,
  readPublicDebates: vi.fn(async (_limit: number, _offset: number) => ({ items: [] as PublicDebateSummary[], total: 0 })),
  readOwnPublicVotes: vi.fn(async (_refs: readonly string[]) => ({ voted: [] as string[] })),
  listDebatesPageServer: vi.fn(async () => ({ summaries: [] as DebateSummary[], shown: 0, total: 0 })),
  // Each server read, with the session its client was made with ("none" for the anonymous client), in order.
  serverReads: [] as string[],
  // The props the list hands each vote box, in row order (a static render cannot press the box).
  voteProps: [] as Record<string, unknown>[]
}));

vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: (_fetch?: unknown, session?: string) => ({
    readPublicDebates: (limit: number, offset: number) => {
      routeMocks.serverReads.push(`readPublicDebates:${session ?? "none"}`);
      return routeMocks.readPublicDebates(limit, offset);
    },
    readOwnPublicVotes: (refs: readonly string[]) => {
      routeMocks.serverReads.push(`readOwnPublicVotes:${session ?? "none"}`);
      return routeMocks.readOwnPublicVotes(refs);
    }
  }),
  listDebatesPageServer: routeMocks.listDebatesPageServer
}));

// The real vote box, with the props it was handed kept for the assertions.
vi.mock("@/components/LibraryVote", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/components/LibraryVote.js")>();
  return {
    LibraryVote: (props: Parameters<typeof actual.LibraryVote>[0]) => {
      routeMocks.voteProps.push(props);
      return <actual.LibraryVote {...props} />;
    }
  };
});

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
  return renderRoute("t".repeat(43));
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
    routeMocks.sessionCookie = "t".repeat(43);
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
    // AccountMenu resolves the session after hydration; SSR must not invent an identity role.
    expect(topBar?.querySelector('.roleChip')).toBeNull();
    expect(topBar?.textContent).not.toContain("ASKER");
    expect(library?.textContent?.includes("Your Debates") || topBar?.textContent?.includes("+ New debate")).toBe(true);
    expect(rendered.body.textContent).not.toContain("Find the weakest claim in your own argument.");
  });

  it("renders the signed-in composer copy", async () => {
    // PROPERTY: the signed-in library composer exposes the T3 prompt, helper,
    // and submit copy as three distinct strings.
    const rendered = await renderSignedInRoute();
    const input = rendered.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your question"]');
    const submit = rendered.querySelector<HTMLButtonElement>(".libStart");

    expect(input?.placeholder).toBe("Type your question…");
    expect(rendered.body.textContent).toContain("You choose what the AIs look into");
    expect(submit?.textContent?.replace(/\s+/g, " ").trim()).toBe("Next →");
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
    expect(accessibleName).toMatch(/Switch to (dark|light) mode/);
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
    // PROPERTY: the real anonymous `/` branch emits all four
    // landing markers and suppresses the real global TopBar with display:none.
    const rendered = await renderRoute(null);
    const topBar = rendered.querySelector<HTMLElement>(".topBar");

    expect(rendered.querySelectorAll("[data-landing-section]")).toHaveLength(4);
    expect(topBar, "real anonymous TopBar").not.toBeNull();
    expect(rendered.defaultView!.getComputedStyle(topBar!).display).toBe("none");
  });

  it("keeps the TopBar mode toggle visible in the real signed-in document", async () => {
    // PROPERTY (T3-C1-4 P2): the same real route harness keeps signed-in
    // global chrome and its accessibly named mode control visible.
    const rendered = await renderRoute("t".repeat(43));
    const topBar = rendered.querySelector<HTMLElement>(".topBar");
    const toggle = topBar?.querySelector<HTMLElement>("[data-mode-toggle]") ?? null;
    const accessibleName = toggle?.getAttribute("aria-label") ?? toggle?.textContent?.trim() ?? "";

    expect(rendered.defaultView!.getComputedStyle(topBar!).display).toBe("flex");
    expect(toggle, "real signed-in TopBar mode toggle").not.toBeNull();
    expect(accessibleName).toMatch(/Switch to (dark|light) mode/);
    expect(rendered.defaultView!.getComputedStyle(toggle!).display).not.toBe("none");
  });

  it("keeps the real layout TopBar as a direct appShell child", () => {
    // PROPERTY (T3-C1-4 P3): layout.tsx preserves the direct-child shape on
    // which the anonymous suppression selector depends.
    const layoutSource = readFileSync(resolve(process.cwd(), "apps/ui/app/layout.tsx"), "utf8");

    // Only the skip link (first in the Tab order) may precede it; TopBar stays a direct child.
    expect(layoutSource).toMatch(
      /<div className="appShell">\s*(?:\{\/\*[^*]*\*\/\}\s*)?<SkipLink>[^<]*<\/SkipLink>\s*<TopBar \/>/
    );
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
    "Published debates may be indexed by search engines, and copies may remain elsewhere.";

  beforeEach(() => {
    routeMocks.sessionCookie = "t".repeat(43);
    routeMocks.listDebatesPageServer.mockReset().mockResolvedValue({
      summaries: yourDebates,
      shown: yourDebates.length,
      total: 41
    });
    routeMocks.readPublicDebates.mockReset().mockResolvedValue({
      items: publicDebates,
      total: 37
    });
    routeMocks.readOwnPublicVotes.mockReset().mockResolvedValue({ voted: [] });
    routeMocks.serverReads.length = 0;
    routeMocks.voteProps.length = 0;
  });

  // Upvotes (design 2026-11-26, sections 4 and 7.4): the same three rows as an API that has the feature sends them.
  const VOTE_COUNTS = [0, 1, 1249] as const;
  const countedDebates = publicDebates.map((debate, at) => ({ ...debate, vote_count: VOTE_COUNTS[at]! }));
  const countedRefs = countedDebates.map((debate) => debate.public_ref);
  const SIGN_IN = "/login?next=%2F%3Ftab%3Dpublic";
  const voteButtons = (rendered: Document) => [...rendered.querySelectorAll<HTMLButtonElement>("button[data-library-vote]")];

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
    const rendered = await renderRoute("t".repeat(43), "yours");
    const labels = [...rendered.querySelectorAll('.sectionHead[aria-label="Debate library"] a')]
      .map((link) => link.textContent?.trim());

    expect(labels).toEqual(["Your debates", "Public debates"]);
    expectLiveCount(rendered, "4 TOTAL");
  });

  it("renders a live count for the three Public debates rows", async () => {
    // PROPERTY (T3-C2-4): the Public debates chip follows the rendered public
    // rows, even when the API's aggregate total is larger than this page.
    const rendered = await renderRoute("t".repeat(43), "public");

    expectLiveCount(rendered, "3 TOTAL");
  });

  it("keeps Your and Public membership distinct", async () => {
    // PROPERTY (T3-C2-2): switching the routed selector changes the rendered
    // membership instead of showing one hard-coded list under both labels.
    const yours = await renderRoute("t".repeat(43), "yours");
    const publicList = await renderRoute("t".repeat(43), "public");

    expect(yours.body.textContent).toContain("Should cities price road congestion?");
    expect(yours.body.textContent).not.toContain("Should public algorithms publish their evaluation sets?");
    expect(publicList.body.textContent).toContain("Should public algorithms publish their evaluation sets?");
    expect(publicList.body.textContent).not.toContain("Should cities price road congestion?");
  });

  it("renders every library row as a link around one core box", async () => {
    // PROPERTY (T3-C2-3, as Design Document v2 screen 3a draws it): every row in both routed lists
    // is a link wrapper with one direct core body. The box is the core's alone and comes from the
    // stylesheet (.libRowCore, pinned in debateReferenceDesign.source-test.mjs): nothing inline
    // gives the wrapper a second, tray layer.
    for (const selected of ["yours", "public"] as const) {
      const rendered = await renderRoute("t".repeat(43), selected);
      const rows = [...rendered.querySelectorAll<HTMLElement>('[data-library-row][data-bezel="shell"]')];

      expect(rows.length).toBe(selected === "yours" ? 4 : 3);
      for (const row of rows) {
        const core = row.querySelector<HTMLElement>(':scope > [data-bezel="core"]');

        expect(row.classList.contains("libRow")).toBe(true);
        expect(row.style.background).toBe("");
        expect(core).not.toBeNull();
        expect(core?.classList.contains("libRowCore")).toBe(true);
        expect(core?.style.background).toBe("");
      }
    }
  });

  it("renders the public search-indexing disclosure once under the list and never on Yours", async () => {
    // PROPERTY (T3-C2-4): indexing persistence is a public-list disclosure,
    // not per-row copy and not content shown on the private list.
    const yours = await renderRoute("t".repeat(43), "yours");
    const publicList = await renderRoute("t".repeat(43), "public");
    const publicMatches = [...publicList.querySelectorAll("p")]
      .filter((paragraph) => paragraph.textContent?.trim() === disclosure);
    const yoursMatches = [...yours.querySelectorAll("p")]
      .filter((paragraph) => paragraph.textContent?.trim() === disclosure);

    expect(publicMatches.length).toBe(1);
    expect(publicList.querySelector(".recentList")?.nextElementSibling === publicMatches[0]).toBe(true);
    expect(yoursMatches.length).toBe(0);
  });

  it("gives each public row that carries a count one vote box beside its link, never inside it", async () => {
    routeMocks.readPublicDebates.mockResolvedValue({ items: countedDebates, total: 37 });
    routeMocks.readOwnPublicVotes.mockResolvedValue({ voted: [countedRefs[1]!] });
    const rendered = await renderRoute("t".repeat(43), "public");
    const buttons = voteButtons(rendered);

    expect(buttons).toHaveLength(3);
    expect(rendered.querySelector("a button")).toBeNull();
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Upvote. 0 votes", "Upvote. 1 vote", "Upvote. 1249 votes"]);
    expect(buttons.map((button) => button.querySelector(".libVoteCount")?.textContent)).toEqual(["0", "1", "1.2k"]);
    buttons.forEach((button, at) => {
      const box = button.parentElement!;
      const link = box.querySelector<HTMLAnchorElement>(':scope > a.libRow[data-library-row][data-bezel="shell"]');
      const claim = link?.querySelector(".libRowClaim");
      expect(box.className).toBe("libVoteRow");
      expect(box.parentElement?.classList.contains("recentList")).toBe(true);
      expect(box.hasAttribute("data-library-row") || box.hasAttribute("data-bezel")).toBe(false);
      expect(button.hasAttribute("data-library-row") || button.hasAttribute("data-bezel")).toBe(false);
      expect(button.hasAttribute("disabled")).toBe(false);
      expect(link?.getAttribute("href")).toBe(`/public/debate/${countedRefs[at]}`);
      expect(claim?.textContent).toBe(countedDebates[at]!.question);
      expect(claim?.id).toBe(`lib-claim-${countedRefs[at]}`);
      expect(button.getAttribute("aria-describedby")).toBe(claim?.id);
    });
    // The chip still counts rows, not boxes, and the indexing note still follows the list.
    expectLiveCount(rendered, "3 TOTAL");
    expect(rendered.querySelector(".recentList")?.nextElementSibling?.textContent?.trim()).toBe(disclosure);
  });

  it("asks once which rows the account upvoted, with its session, and still reads the list without one", async () => {
    routeMocks.readPublicDebates.mockResolvedValue({ items: countedDebates, total: 37 });
    routeMocks.readOwnPublicVotes.mockResolvedValue({ voted: [countedRefs[1]!] });
    await renderRoute("t".repeat(43), "public");

    expect(routeMocks.readPublicDebates.mock.calls).toEqual([[50, 0]]);
    expect(routeMocks.readOwnPublicVotes.mock.calls).toEqual([[countedRefs]]);
    expect(routeMocks.serverReads).toEqual(["readPublicDebates:none", `readOwnPublicVotes:${"t".repeat(43)}`]);
    expect(routeMocks.voteProps.map(({ publicRef, initialCount, initialVoted, signedIn, signInHref, locale, describedBy }) =>
      ({ publicRef, initialCount, initialVoted, signedIn, signInHref, locale, describedBy }))).toEqual(countedDebates.map((debate, at) => ({
      publicRef: debate.public_ref, initialCount: VOTE_COUNTS[at], initialVoted: at === 1, signedIn: true,
      signInHref: SIGN_IN, locale: "en", describedBy: `lib-claim-${debate.public_ref}`
    })));
    for (const props of routeMocks.voteProps) {
      // Only the vote box's own words cross to the browser, and the box keeps its own way of sending.
      expect(Object.isFrozen(props.catalog)).toBe(true);
      expect(Object.keys(props.catalog as object).sort()).toEqual(
        ["home.upvote.failed", "home.upvote.label.one", "home.upvote.label.other", "home.upvote.signedOut"]);
      expect("send" in props).toBe(false);
    }
  });

  it("draws no vote box and asks nothing on Your debates", async () => {
    routeMocks.readPublicDebates.mockResolvedValue({ items: countedDebates, total: 37 });
    const rendered = await renderRoute("t".repeat(43), "yours");

    expect(rendered.querySelectorAll("[data-library-vote], .libVoteRow")).toHaveLength(0);
    expect(rendered.querySelectorAll("[data-library-row]")).toHaveLength(4);
    expect(routeMocks.readOwnPublicVotes).not.toHaveBeenCalled();
    expect(routeMocks.voteProps).toEqual([]);
  });

  it("renders a row that carries no count exactly as before, and asks only about the rows that carry one", async () => {
    // An API from before the upvotes sends no count: no box, no wrapper, no id, and nothing asked.
    const plain = await renderRoute("t".repeat(43), "public");
    expect(plain.querySelectorAll('[data-library-vote], .libVoteRow, [id^="lib-claim-"]')).toHaveLength(0);
    expect([...plain.querySelector(".recentList")!.children].every((child) => child.matches("a.libRow[data-library-row]"))).toBe(true);
    expect(routeMocks.readOwnPublicVotes).not.toHaveBeenCalled();

    routeMocks.readPublicDebates.mockResolvedValue({ items: [countedDebates[0]!, publicDebates[1]!, countedDebates[2]!], total: 37 });
    const mixed = await renderRoute("t".repeat(43), "public");
    const bare = mixed.querySelectorAll("[data-library-row]")[1]!;
    expect(voteButtons(mixed)).toHaveLength(2);
    expect(bare.outerHTML).toBe(plain.querySelectorAll("[data-library-row]")[1]!.outerHTML);
    expect(bare.parentElement?.classList.contains("recentList")).toBe(true);
    expect(routeMocks.readOwnPublicVotes.mock.calls).toEqual([[[countedRefs[0], countedRefs[2]]]]);
    expectLiveCount(mixed, "3 TOTAL");
  });

  it("keeps every row and its box, none pressed, when the account's votes cannot be read", async () => {
    routeMocks.readPublicDebates.mockResolvedValue({ items: countedDebates, total: 37 });
    routeMocks.readOwnPublicVotes.mockRejectedValue(new Error("the votes read is down"));
    const rendered = await renderRoute("t".repeat(43), "public");

    expect(voteButtons(rendered).map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "false", "false"]);
    expect(routeMocks.voteProps.map((props) => props.signedIn)).toEqual([true, true, true]);
    expect(rendered.querySelector(".error")).toBeNull();
  });

  it("shows the counts to a session that could not be confirmed, as signed out, and asks nothing", async () => {
    routeMocks.readPublicDebates.mockResolvedValue({ items: countedDebates, total: 37 });
    routeMocks.listDebatesPageServer.mockRejectedValue(new Error("the session could not be confirmed"));
    const rendered = await renderRoute("t".repeat(43), "public");

    expect(voteButtons(rendered).map((button) => button.querySelector(".libVoteCount")?.textContent)).toEqual(["0", "1", "1.2k"]);
    expect(routeMocks.voteProps.map(({ signedIn, initialVoted, signInHref }) => ({ signedIn, initialVoted, signInHref }))).toEqual(
      Array.from({ length: 3 }, () => ({ signedIn: false, initialVoted: false, signInHref: SIGN_IN })));
    expect(routeMocks.readOwnPublicVotes).not.toHaveBeenCalled();
    expect(routeMocks.serverReads).toEqual(["readPublicDebates:none"]);
  });

});
