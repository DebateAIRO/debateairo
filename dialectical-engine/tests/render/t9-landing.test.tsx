// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";

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

    expect(hero?.textContent).toContain("Find the weakest joint in your own argument.");
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
    expect(document.body.textContent).not.toContain("Find the weakest joint in your own argument.");
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
      ["Pricing", "#pricing"]
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
      .find((candidate) => (candidate.textContent ?? "").replace("→", "").trim() === "Start a round");

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

  it("keeps Create one query-free when next is absent", async () => {
    // PROPERTY: the real LoginFlow transports next only when it exists, so the
    // absent branch stays the exact bare sign-up route rather than adding ?next=.
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState({}, "", "/login");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(
        <LoginFlow client={{ beginLogin: vi.fn(), completeLogin: vi.fn() }} />
      ));
      const createOne = [...container.querySelectorAll("a")]
        .find((link) => link.textContent?.trim() === "Create one");

      expect(createOne?.getAttribute("href")).toBe("/sign-up");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      window.history.replaceState({}, "", "/");
      vi.unstubAllGlobals();
    }
  });

  it("preserves next through the login and sign-up round trip", async () => {
    // PROPERTY: both real pre-MFA cross-links transport the same raw next value,
    // so the sign-up branch returns to login with decoded next still equal to /new.
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState({}, "", "/login?next=%2Fnew");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(
        <LoginFlow client={{ beginLogin: vi.fn(), completeLogin: vi.fn() }} />
      ));
      const createOne = [...container.querySelectorAll("a")]
        .find((link) => link.textContent?.trim() === "Create one");

      expect(createOne?.getAttribute("href")).toBe("/sign-up?next=%2Fnew");

      const signUpUrl = new URL(createOne!.href);
      window.history.replaceState({}, "", `${signUpUrl.pathname}${signUpUrl.search}`);
      await act(async () => root.render(
        <SignUpFlow client={{ register: vi.fn(), resendVerification: vi.fn() }} />
      ));
      await act(async () => {
        await Promise.resolve();
      });

      const logIn = [...container.querySelectorAll("a")]
        .find((link) => link.textContent?.trim() === "Log in");
      const returnUrl = new URL(logIn!.href);

      expect(returnUrl.pathname).toBe("/login");
      expect(returnUrl.searchParams.get("next")).toBe("/new");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      window.history.replaceState({}, "", "/");
      vi.unstubAllGlobals();
    }
  });
});

describe("T9-C4 landing content", () => {
  it("renders the numbered method titles inside the method ledger", async () => {
    // PROPERTY: the real anonymous method subtree owns all four numbered
    // method steps, so matching copy elsewhere cannot satisfy the ledger.
    const document = await renderRoute(null);
    const method = document.querySelector('[data-landing-section="method"]');
    const steps = [...(method?.querySelectorAll("li") ?? [])];
    const expectedSteps = [
      [
        "01",
        "Models argue",
        "Five frontier models build the tree — pro, con, and the reasoning that binds them."
      ],
      [
        "02",
        "They review each other",
        "Every claim is cross-reviewed by a rival model: agree or dispute, on the record."
      ],
      [
        "03",
        "You challenge",
        "Flag any sentence; the bench spawns a focused rebuttal where you pointed."
      ],
      [
        "04",
        "Verdict with receipts",
        "Scores, condition marks, and replay handles — every number traces to its source."
      ]
    ] as const;

    expect(method).not.toBeNull();
    expect(steps).toHaveLength(expectedSteps.length);
    expectedSteps.forEach(([number, title, body], index) => {
      expect(steps[index]?.textContent).toContain(number);
      expect(steps[index]?.textContent).toContain(title);
      expect(steps[index]?.textContent).toContain(body);
    });
  });

  it("renders complete static sample-card anatomy inside the sample block", async () => {
    // PROPERTY: a sample card is a double-bezel, stance-marked card carrying
    // type, two scores, model attribution, and a recorded review disposition.
    const document = await renderRoute(null);
    const sample = document.querySelector('[data-landing-section="sample"]');

    expect(sample).not.toBeNull();
    expect(sample?.textContent).toContain("One round, four turns");
    expect(sample?.textContent).toContain("The pressure lands on the joint, not the wording.");
    for (const stance of ["pro", "con", "reasoning"] as const) {
      expect(sample?.querySelector(`[data-bezel="shell"][data-stance="${stance}"]`)).not.toBeNull();
    }

    const card = sample?.querySelector('[data-bezel="shell"][data-stance]');
    const cardText = card?.textContent ?? "";
    expect(card?.querySelector('[data-bezel="core"]')).not.toBeNull();
    expect(cardText).toMatch(/PRO|CON|REASONING/);
    expect(cardText).toContain("BASE");
    expect(cardText).toContain("FINAL");
    expect(cardText).toMatch(/\S+\s+·\s+\S+/);
    expect(cardText).toMatch(/REVIEW (?:AGREED|DISPUTED) BY:/);
  });

  it("keeps the hero and pricing placeholders literal", async () => {
    // PROPERTY: this mission renders the two V-closed placeholder strings,
    // never a live debate counter or a real price substituted in either region.
    const document = await renderRoute(null);
    const hero = document.querySelector('[data-landing-section="hero"]');
    const pricing = document.querySelector('[data-landing-section="pricing"]');

    expect(hero?.textContent).toContain("[PLACEHOLDER] rounds argued this week");
    expect(pricing?.textContent).toContain(
      "First [PLACEHOLDER] rounds free, then [PLACEHOLDER] per month. Cancel whenever."
    );
  });

  it("renders every binding landing paragraph verbatim in its owning subtree", async () => {
    // PROPERTY: V-approved landing prose survives verbatim and remains in the
    // region that owns it rather than being paraphrased or copied across regions.
    const document = await renderRoute(null);
    const hero = document.querySelector('[data-landing-section="hero"]');
    const sample = document.querySelector('[data-landing-section="sample"]');
    const method = document.querySelector('[data-landing-section="method"]');
    const pricing = document.querySelector('[data-landing-section="pricing"]');

    expect(hero?.textContent).toContain(
      "You argue. An opponent trained to locate the softest point in your reasoning presses on it until the joint holds or gives. Every turn is scored on evidence and on whether you actually answered the question — never on how well it was phrased."
    );
    expect(sample?.textContent).toContain(
      "The round ends here. Nothing is declared won. You get the transcript, the two marks per turn, and the joint you conceded."
    );
    expect(method?.textContent).toContain("Four steps, then you do it again tomorrow.");
    expect(method?.textContent).toContain(
      "The arena is built for repetition, not for a performance you prepare for once."
    );
    expect(method?.textContent).toContain(
      "Five frontier models build the tree — pro, con, and the reasoning that binds them."
    );
    expect(method?.textContent).toContain(
      "Every claim is cross-reviewed by a rival model: agree or dispute, on the record."
    );
    expect(method?.textContent).toContain(
      "Flag any sentence; the bench spawns a focused rebuttal where you pointed."
    );
    expect(method?.textContent).toContain(
      "Scores, condition marks, and replay handles — every number traces to its source."
    );
    expect(pricing?.textContent).toContain("Your argument is only as strong as its weakest joint.");
    expect(pricing?.textContent).toContain(
      "Take one round. Four turns, about nine minutes, and a transcript that tells you exactly where you stopped answering."
    );
  });

  it("renders both hero CTAs and sends the primary through the safe auth entry", async () => {
    // PROPERTY: the hero owns both CTA labels and its primary enters auth with
    // the exact encoded /new return path rather than a dead or unsafe target.
    const document = await renderRoute(null);
    const hero = document.querySelector('[data-landing-section="hero"]');
    const links = [...(hero?.querySelectorAll("a") ?? [])];
    // The CTA carries a trailing arrow glyph, so compare the label itself.
    const label = (link: Element): string =>
      (link.textContent ?? "").replace("→", "").trim();
    const primary = links.find((link) => label(link) === "Start a round");
    const secondary = links.find((link) => label(link) === "Read a scored transcript");

    expect(primary).toBeDefined();
    expect(primary?.getAttribute("href")).toBe("/login?next=%2Fnew");
    expect(secondary).toBeDefined();
  });

  it("renders the closing CTA with the safe auth entry", async () => {
    // PROPERTY: the tertiary Start action belongs to the closing subtree (the
    // document moved it out of the method split) and uses the same encoded
    // /new auth-entry contract as the other primaries.
    const document = await renderRoute(null);
    const closing = document.querySelector('[data-landing-section="pricing"]');
    const primary = [...(closing?.querySelectorAll("a") ?? [])]
      .find((link) => (link.textContent ?? "").replace("→", "").trim() === "Start a round");

    expect(primary).toBeDefined();
    expect(primary?.getAttribute("href")).toBe("/login?next=%2Fnew");
  });
});
