// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };

type HomePageModule = {
  default: (props: { searchParams: Promise<{ tab?: string; country?: string; postal_code?: string }> }) => Promise<ReactNode>;
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
  listDebatesPageServer: vi.fn(async () => ({ summaries: [], shown: 0, total: 0 })),
  getBillingPlans: vi.fn(async (): Promise<unknown> => {
    throw new ContractHttpError("NOT_FOUND", 404, "Not found");
  })
}));

vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({ readPublicDebates: routeMocks.readPublicDebates, getBillingPlans: routeMocks.getBillingPlans }),
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

async function renderRoute(
  sessionCookie: string | null, place: Readonly<{ country?: string; postal_code?: string }> = {}
): Promise<Document> {
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
  const page = await HomePage({ searchParams: Promise.resolve({ tab: "yours", ...place }) });
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

    expect(hero?.textContent).toContain("See what holds up, and what is still open.");
    expect(document.querySelector('.sectionHead[aria-label="Debate library"]')).toBeNull();
  });

  it("keeps the library document for a request carrying the session cookie", async () => {
    // PROPERTY: cookie presence selects the unchanged library branch, including
    // its discriminating library section, and excludes the landing-only headline.
    const document = await renderRoute("t".repeat(43));

    expect(
      document.querySelector('.sectionHead[aria-label="Debate library"]'),
      "signed-in library discriminator"
    ).not.toBeNull();
    expect(document.body.textContent).not.toContain("See what holds up, and what is still open.");
  });

  it("renders an accessibly named mode control on the anonymous document", async () => {
    // PROPERTY: the anonymous landing chrome mounts the real mode control,
    // identifiable by its marker and accessible name rather than its decorative glyph.
    const document = await renderRoute(null);
    const toggle = document.querySelector('[data-landing-section="chrome"] [data-mode-toggle]');
    const accessibleName = toggle?.getAttribute("aria-label") ?? toggle?.textContent?.trim() ?? "";

    expect(toggle?.tagName).toBe("BUTTON");
    expect(accessibleName).toMatch(/Switch to (dark|light) mode/);
  });

  it("composes the four landing sections in contract order", async () => {
    // PROPERTY: the landing's structural sections stay in Chrome → Hero →
    // Method → Pricing document order. The sample exchange is not shown: it
    // showed an older kind of debate, with scores and model codes.
    const document = await renderRoute(null);
    const order = [...document.querySelectorAll("[data-landing-section]")].map(
      (section) => section.getAttribute("data-landing-section")
    );

    expect(order).toEqual(["chrome", "hero", "method", "pricing"]);
  });

  it("keeps the route branch immediate and the landing a server component", () => {
    // PROPERTY: the cookie read is followed by the landing branch before any
    // library work, AuthGate stays off `/`, and LandingPage remains server-rendered.
    const pageSource = readFileSync(resolve(process.cwd(), "apps/ui/app/page.tsx"), "utf8");
    const cookieReadIndex = pageSource.indexOf("const token = readSessionCookie(cookieStore);");
    // b300ee91 (feat(support): add guarded SupportAgent experience) mounted the
    // support dock on the anonymous landing route, so the branch returns a
    // fragment rather than the bare landing. The PROPERTY above is untouched by
    // that — the branch is still the first thing after the cookie read and still
    // ahead of any library work — so the shape admits exactly that fragment and
    // nothing looser: an arbitrary body here would let real work sneak in front
    // of the landing and the ordering assertions below would stop meaning it.
    // Paid plans (P18, spec 2026-09-29 §2.10): the branch now awaits exactly ONE
    // price read, the landing's lowest paid price, and nothing else, so no
    // library work can slip in front of the landing.
    // P21: that one read now answers the price line AND the footer's billing facts.
    // Terms §12: the same read says whether that price already holds the visitor's tax.
    // The same read also says whether card payments are test-only (the price line's test-mode note).
    // The same read also fills the plan cards above the closing CTA, for the place the visitor chose in
    // their place form (the search parameters) or, with none chosen, for the connection's country.
    const landingBranch =
      /if\s*\(\s*token\s*===\s*null\s*\)\s*\{\s*const\s+plans\s*=\s*await\s+landingPlans\(\s*locale\s*,\s*await\s+headers\(\)\s*,\s*await\s+searchParams\s*\)\s*;\s*return\s*<>\s*<LandingPage\s+catalog=\{catalog\}\s+lowestPaidPrice=\{plans\.lowestPaidPrice\}\s+tax=\{plans\.tax\}\s+footerBilling=\{plans\.footer\}\s+testModeNote=\{plans\.testModeNote\}\s+plans=\{plans\.cards\}\s*\/>\s*<SupportWidget\s*\/>\s*<\/>\s*;\s*\}/.exec(
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

  it("closes the anonymous landing with the colleague's full footer; with billing off it credits DB-IP and offers nothing to buy", async () => {
    const document = await renderRoute(null);
    const footer = document.querySelector("footer.siteFooterFull");
    expect(footer?.querySelector('a[href="https://db-ip.com"]')?.textContent).toBe("IP Geolocation by DB-IP");
    expect(footer?.querySelector('a[href="/legal"]')).not.toBeNull();
    for (const href of ["/pricing", "/cancel", "/withdraw"]) expect(footer?.querySelector(`a[href="${href}"]`), href).toBeNull();
  });

  it("with billing on, the landing's footer links pricing, cancel and withdraw", async () => {
    routeMocks.getBillingPlans.mockResolvedValueOnce({
      currency: "USD",
      plans: [{ plan_id: "PLUS", net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, allowance_vs_plus: "1" }]
    });
    const footer = (await renderRoute(null)).querySelector("footer.siteFooterFull");
    for (const href of ["/pricing", "/cancel", "/withdraw"]) expect(footer?.querySelector(`a[href="${href}"]`), href).not.toBeNull();
  });

  it("says under the price line that payments are test-only exactly while the plans list names NETOPIA's sandbox", async () => {
    const note = (billingEnglish as Readonly<Record<string, string>>)["billing.testMode.notice"]!;
    const answer = (environment?: "sandbox" | "live") => ({
      currency: "USD",
      plans: [{ plan_id: "PLUS", net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, allowance_vs_plus: "1" }],
      ...(environment === undefined ? {} : { environment })
    });
    const notes = async (): Promise<string[]> => [
      ...(await renderRoute(null)).querySelectorAll('[data-landing-section="pricing"] [role="note"]')
    ].map((element) => element.textContent ?? "");
    routeMocks.getBillingPlans.mockResolvedValueOnce(answer("sandbox"));
    expect(await notes()).toEqual([note]);
    // Switched to live payments on the server: the next visit shows no note, with no new upload of the website.
    routeMocks.getBillingPlans.mockResolvedValueOnce(answer("live"));
    expect(await notes()).toEqual([]);
    routeMocks.getBillingPlans.mockResolvedValueOnce(answer());
    expect(await notes()).toEqual([]);
    // Billing off (the route's 404): no price line to carry it.
    expect(await notes()).toEqual([]);
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
      ["Pricing", "#pricing"]
    ] as const;

    for (const [label, href] of expectedLinks) {
      const link = [...chrome!.querySelectorAll("a")]
        .find((candidate) => candidate.textContent?.trim() === label);
      expect(link, `missing chrome link ${label}`).toBeDefined();
      expect(link?.getAttribute("href")).toBe(href);
    }
    // The sample exchange is not shown, so nothing links to it.
    expect(chrome!.querySelector('a[href="#transcripts"]')).toBeNull();
    expect(chrome!.textContent).not.toContain("Transcripts");

    const wordmark = [...chrome!.querySelectorAll<HTMLAnchorElement>("a")]
      .find((candidate) => candidate.textContent?.trim() === "Dialectical Engine");
    expect(wordmark).toBeDefined();
    // Design Document v2: the wordmark is the public top bar's, drawn by a class, with "Engine" in its own span.
    expect(wordmark?.classList.contains("lpWordmark")).toBe(true);
    expect(wordmark?.querySelector(".lpWordmarkAccent")?.textContent).toBe("Engine");
  });

  it("with billing on, the chrome's Pricing link leads to the pricing page, not to the landing's own pricing line", async () => {
    // PROPERTY: /pricing is "not found" while billing is off (the test above keeps the in-page anchor there), so the
    // link leads to it exactly while billing is on; the header stays pinned to the viewport either way.
    routeMocks.getBillingPlans.mockResolvedValueOnce({
      currency: "USD",
      plans: [{ plan_id: "PLUS", net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, allowance_vs_plus: "1" }]
    });
    const chrome = (await renderRoute(null)).querySelector<HTMLElement>('[data-landing-section="chrome"]');
    const pricing = [...chrome!.querySelectorAll("a")].find((candidate) => candidate.textContent?.trim() === "Pricing");

    expect(pricing?.getAttribute("href")).toBe("/pricing");
    expect(chrome!.querySelector('a[href="#pricing"]')).toBeNull();
    expect(chrome!.style.position).toBe("fixed");
  });

  it("renders the chrome primary CTA with the exact safe return target", async () => {
    // PROPERTY: the AM8-narrowed C2 CTA is asserted inside chrome only; hero
    // CTAs remain T9-C4's contract.
    const document = await renderRoute(null);
    const chrome = document.querySelector('[data-landing-section="chrome"]');
    const primary = [...chrome!.querySelectorAll("a")]
      .find((candidate) => (candidate.textContent ?? "").replace("→", "").trim() === "Ask a question");

    expect(primary).toBeDefined();
    expect(primary?.getAttribute("href")).toBe("/login?next=%2Fv4");
    expect(primary?.getAttribute("href")).not.toBe("#");
    expect(primary?.getAttribute("href")).not.toBe("/v4");
  });

  it("keeps every stub navigation link safe to click", async () => {
    // PROPERTY: both stub anchors can be activated on the real anonymous
    // document without replacing the page with an uncaught error surface.
    const document = await renderRoute(null);
    const chrome = document.querySelector('[data-landing-section="chrome"]');
    const errorEvents: ErrorEvent[] = [];
    document.defaultView?.addEventListener("error", (event) => errorEvents.push(event));

    for (const href of ["#method", "#pricing"]) {
      const link = chrome!.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
      expect(link, `missing stub ${href}`).not.toBeNull();
      expect(() => link!.click()).not.toThrow();
      expect(chrome!.textContent).toContain("Dialectical Engine");
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
        <SignUpFlow client={{ register: vi.fn() }} />
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
    // The four steps are the V4 ask page's own four steps, in its words.
    const expectedSteps = [
      [
        "01",
        "Your question",
        "Ask in your own words. We show how we read your question, and you can change our assumptions."
      ],
      [
        "02",
        "What we'll look into",
        "The AIs suggest paths: different ways to answer it. You pick the ones to look into, or let the AIs choose."
      ],
      [
        "03",
        "The map",
        "Each point carries a word for how sure it is, such as Sure or Still argued. Dig into any point to look closer."
      ],
      [
        "04",
        "Your report",
        "A plain answer, what would change it, the objections still standing, and how each point was checked."
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

  it("shows no sample exchange: no scores, turns or model codes anywhere on the landing", async () => {
    // PROPERTY: the hand-made sample of an older debate (BASE/FINAL scores, Pro/Con turns,
    // model codes) is not on the page, and no link points at where it was.
    const document = await renderRoute(null);
    const landing = document.querySelector(".lpRoot");

    expect(landing).not.toBeNull();
    expect(document.querySelector('[data-landing-section="sample"]')).toBeNull();
    expect(document.querySelector("#transcripts")).toBeNull();
    expect(document.querySelector('a[href="#transcripts"]')).toBeNull();
    expect(landing?.querySelector("[data-bezel]")).toBeNull();
    const text = landing?.textContent ?? "";
    for (const retired of ["One round, four turns", "BASE ", "FINAL ", "REVIEW AGREED BY:", "Read a scored transcript"]) {
      expect(text, retired).not.toContain(retired);
    }
    expect(text).not.toMatch(/claude-opus|gpt-5|gemini/iu);
  });

  it("shows no placeholder counter in the hero and states the pricing plainly when billing is off", async () => {
    // PROPERTY: the "[PLACEHOLDER] rounds argued this week" counter is gone (auth UI repair,
    // 2026-10-09: no invented numbers), leaving the two real facts and one rule between them; the
    // pricing line is real copy (spec 2026-09-29 §2.10) and, with no plans to read, promises
    // nothing about paid plans.
    const document = await renderRoute(null);
    const hero = document.querySelector('[data-landing-section="hero"]');
    const pricing = document.querySelector('[data-landing-section="pricing"]');
    expect(hero?.textContent).not.toContain("[PLACEHOLDER]");
    expect(hero?.textContent).not.toContain("rounds argued this week");
    const facts = [...(hero?.querySelectorAll(".lpStatBar > li") ?? [])];
    expect(facts.map((item) => item.classList.contains("lpStatRule") ? "rule" : "fact")).toEqual(["fact", "rule", "fact"]);
    expect(pricing?.textContent).toContain("Start free. No card needed.");
    // This line shows only while billing is off, where no question is published, so it says nothing about public questions.
    expect(pricing?.textContent).not.toContain("questions are public");
    expect(pricing?.textContent).not.toContain("[PLACEHOLDER]");
    expect(pricing?.querySelector('a[href="/pricing"]')).toBeNull();
  });

  it("names the lowest paid price, with the visitor's country's tax in it, and links to the pricing page (Terms §12)", async () => {
    routeMocks.getBillingPlans.mockResolvedValueOnce({
      currency: "EUR",
      place: { country: "DE", postal_code: null, status: "PRICED" },
      tax: { country: "DE", tax_name: "MwSt.", tax_rate_bp: 1_900, tax_status: "TAXABLE" },
      plans: [
        { plan_id: "FREE", net_prices: { USD: "0.00", EUR: "0.00", RON: "0.00" }, total_price: "0.00", allowance_vs_plus: "0.05" },
        { plan_id: "MAX", net_prices: { USD: "200.00", EUR: "200.00", RON: "1000.00" }, total_price: "238.00", allowance_vs_plus: "33" },
        { plan_id: "PLUS", net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, total_price: "23.80", allowance_vs_plus: "1" }
      ]
    });
    const pricing = (await renderRoute(null)).querySelector('[data-landing-section="pricing"]');
    // Spec 2026-10-05 §2.16.1: in the currency the visitor's connection pays in.
    expect(pricing?.textContent).toContain("Start free. Paid plans start at €23.80 a month, tax included. Cancel whenever.");
    expect(pricing?.querySelector('a[href="/pricing"]')?.textContent).toBe("See the plans");
    expect(pricing?.textContent).not.toMatch(/plus tax|€20\.00/u);
  });

  it("says no tax is added, never \"tax included\", where the visitor's country adds none", async () => {
    routeMocks.getBillingPlans.mockResolvedValueOnce({
      currency: "USD",
      place: { country: "CH", postal_code: null, status: "PRICED" },
      tax: { country: "CH", tax_name: "VAT", tax_rate_bp: 0, tax_status: "NOT_REGISTERED" },
      plans: [
        { plan_id: "FREE", net_prices: { USD: "0.00", EUR: "0.00", RON: "0.00" }, total_price: "0.00", allowance_vs_plus: "0.05" },
        { plan_id: "PLUS", net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, total_price: "20.00", allowance_vs_plus: "1" }
      ]
    });
    const pricing = (await renderRoute(null)).querySelector('[data-landing-section="pricing"]');
    expect(pricing?.textContent).toContain("Start free. Paid plans start at $20.00 a month, no tax added. Cancel whenever.");
    expect(pricing?.textContent).not.toMatch(/tax included|plus tax/u);
  });

  it("names no price, never one before tax, when the visitor's place is not priced yet", async () => {
    const unpriced = [
      { country: null, postal_code: null, status: "COUNTRY_NEEDED" },
      { country: "US", postal_code: null, status: "POSTAL_CODE_NEEDED" },
      { country: "DE", postal_code: null, status: "TAX_UNAVAILABLE" }
    ];
    for (const place of unpriced) {
      routeMocks.getBillingPlans.mockResolvedValueOnce({
        currency: "USD", place, tax: null,
        plans: [
          { plan_id: "FREE", net_prices: { USD: "0.00", EUR: "0.00", RON: "0.00" }, total_price: null, allowance_vs_plus: "0.05" },
          { plan_id: "PLUS", net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, total_price: null, allowance_vs_plus: "1" }
        ]
      });
      const pricing = (await renderRoute(null)).querySelector('[data-landing-section="pricing"]');
      expect(pricing?.textContent, place.status).toContain("Start free. Paid plans are priced with your country's tax included. Cancel whenever.");
      expect(pricing?.textContent, place.status).not.toMatch(/\$20\.00|plus tax/u);
      expect(pricing?.querySelector('a[href="/pricing"]')?.textContent).toBe("See the plans");
    }
    // A hand-made answer without the fields (the contract client always parses them in) names no price either.
    routeMocks.getBillingPlans.mockResolvedValueOnce({
      currency: "USD",
      plans: [{ plan_id: "PLUS", net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, allowance_vs_plus: "1" }]
    });
    expect((await renderRoute(null)).querySelector('[data-landing-section="pricing"]')?.textContent).not.toContain("$20.00");
  });

  /** A plans answer for Germany: every paid price holds its 19 %. */
  const GERMANY_PLANS = Object.freeze({
    currency: "EUR",
    place: { country: "DE", postal_code: null, status: "PRICED" },
    tax: { country: "DE", tax_name: "MwSt.", tax_rate_bp: 1_900, tax_status: "TAXABLE" },
    plans: [
      { plan_id: "FREE", net_prices: { USD: "0.00", EUR: "0.00", RON: "0.00" }, total_price: "0.00", allowance_vs_plus: "0.05" },
      { plan_id: "PLUS", net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, total_price: "23.80", allowance_vs_plus: "1" },
      { plan_id: "PRO", net_prices: { USD: "50.00", EUR: "50.00", RON: "250.00" }, total_price: "59.50", allowance_vs_plus: "5" },
      { plan_id: "MAX", net_prices: { USD: "200.00", EUR: "200.00", RON: "1000.00" }, total_price: "238.00", allowance_vs_plus: "33" }
    ]
  });
  /** Whether `first` comes before `second` in the document. */
  const precedes = (first: Element | null | undefined, second: Element | null | undefined): boolean =>
    first != null && second != null
    && (first.compareDocumentPosition(second) & 4 /* DOCUMENT_POSITION_FOLLOWING */) !== 0;

  it("shows every plan's price, tax included, between the closing title and its CTA (Terms §12)", async () => {
    // PROPERTY: a visitor sees the prices on the landing itself: the pricing page's own cards, one per plan,
    // each paid price with the visitor's country's tax in it, placed after the closing title and lede and
    // before the "Ask a question" button.
    routeMocks.getBillingPlans.mockClear();
    routeMocks.getBillingPlans.mockResolvedValueOnce(GERMANY_PLANS);
    const pricing = (await renderRoute(null)).querySelector('[data-landing-section="pricing"]');
    const plans = pricing?.querySelector("[data-landing-plans]");
    const cards = [...(plans?.querySelectorAll("[data-pricing-cards] > article") ?? [])];
    expect(cards.map((card) => card.getAttribute("data-plan"))).toEqual(["FREE", "PLUS", "PRO", "MAX"]);
    expect(cards.map((card) => card.querySelector(".pricingPrice")?.textContent)).toEqual([
      "€0.00 a month", "€23.80 a month", "€59.50 a month", "€238.00 a month"
    ]);
    for (const card of cards.slice(1)) expect(card.textContent).toContain("Tax included (19%, Germany)");
    // Never a price before tax.
    expect(plans?.textContent).not.toMatch(/€20\.00|€50\.00|€200\.00|plus tax/u);
    // The plan names are level 3 under the closing's level 2 title.
    expect(cards.map((card) => card.querySelector("h3")?.textContent)).toEqual(["Free", "Plus", "Pro", "Max"]);
    expect(plans?.querySelector("h2")).toBeNull();
    // Title and lede, then the plans, then the CTA.
    expect(precedes(pricing?.querySelector("#landing-pricing-title"), plans)).toBe(true);
    expect(precedes(pricing?.querySelector(".lpClosingLede"), plans)).toBe(true);
    expect(precedes(plans, pricing?.querySelector("a.lpCtaClosing"))).toBe(true);
    expect(plans?.textContent).toContain(billingEnglish["billing.pricing.currencyNote"]);
    // A visitor priced by their connection is asked for no place here, and the read names none.
    expect(plans?.querySelector("[data-pricing-place]")).toBeNull();
    expect(routeMocks.getBillingPlans).toHaveBeenCalledWith();
  });

  it("asks for the place above the cards while they cannot be priced, and prices them here once it is chosen", async () => {
    // PROPERTY: with no priced place the paid cards name no price and say what they need; the pricing page's
    // place form stands above them and sends the place back to the landing's own cards, never to another page.
    routeMocks.getBillingPlans.mockResolvedValueOnce({
      currency: "USD", place: { country: null, postal_code: null, status: "COUNTRY_NEEDED" }, tax: null,
      plans: GERMANY_PLANS.plans.map((plan) => ({ ...plan, total_price: null }))
    });
    const unpriced = (await renderRoute(null)).querySelector("[data-landing-plans]");
    const form = unpriced?.querySelector("form[data-pricing-place]");
    expect(form?.getAttribute("action")).toBe("/#plans");
    expect(form?.getAttribute("method")).toBe("get");
    expect(unpriced?.getAttribute("id")).toBe("plans");
    expect(precedes(form, unpriced?.querySelector("[data-pricing-cards]"))).toBe(true);
    const paid = [...(unpriced?.querySelectorAll('article:not([data-plan="FREE"])') ?? [])];
    expect(paid.length).toBe(3);
    for (const card of paid) {
      expect(card.querySelector(".pricingPrice")?.textContent).toBe(billingEnglish["billing.pricing.chooseCountry"]);
    }
    expect(unpriced?.querySelector("[data-pricing-cards]")?.textContent).not.toMatch(/\$20\.00|\$50\.00|\$200\.00/u);

    // The chosen place is the one the read asks for; the form stays so the place can be corrected.
    routeMocks.getBillingPlans.mockClear();
    routeMocks.getBillingPlans.mockResolvedValueOnce(GERMANY_PLANS);
    const chosen = (await renderRoute(null, { country: "DE" })).querySelector("[data-landing-plans]");
    expect(routeMocks.getBillingPlans).toHaveBeenCalledWith({ country: "DE" });
    expect(chosen?.querySelector('article[data-plan="PLUS"] .pricingPrice')?.textContent).toBe("€23.80 a month");
    expect(chosen?.querySelector("form[data-pricing-place]")?.getAttribute("action")).toBe("/#plans");
    routeMocks.getBillingPlans.mockClear();
    routeMocks.getBillingPlans.mockResolvedValueOnce(GERMANY_PLANS);
    await renderRoute(null, { country: "US", postal_code: "75201" });
    expect(routeMocks.getBillingPlans).toHaveBeenCalledWith({ country: "US", postalCode: "75201" });
  });

  it("shows no plan cards while billing is off or the plans cannot be read", async () => {
    // PROPERTY: with nothing to sell (the route's 404) or no answer, the closing keeps its title, lede, CTA
    // and price line, and invents no plan.
    const off = (await renderRoute(null)).querySelector('[data-landing-section="pricing"]');
    expect(off?.querySelector("[data-landing-plans]")).toBeNull();
    expect(off?.querySelector("a.lpCtaClosing")).not.toBeNull();
    routeMocks.getBillingPlans.mockRejectedValueOnce(new Error("upstream down"));
    const failed = (await renderRoute(null)).querySelector('[data-landing-section="pricing"]');
    expect(failed?.querySelector("[data-landing-plans]")).toBeNull();
    expect(failed?.querySelector("[data-pricing-cards]")).toBeNull();
    expect(failed?.textContent).toContain("Start free. Paid plans are priced with your country's tax included. Cancel whenever.");
  });

  it("renders every binding landing paragraph verbatim in its owning subtree", async () => {
    // PROPERTY: V-approved landing prose survives verbatim and remains in the
    // region that owns it rather than being paraphrased or copied across regions.
    const document = await renderRoute(null);
    const hero = document.querySelector('[data-landing-section="hero"]');
    const method = document.querySelector('[data-landing-section="method"]');
    const pricing = document.querySelector('[data-landing-section="pricing"]');

    // The hero lede is the V4 ask page's promise (v4.ask.promise) with "Ask a question." in front.
    expect(hero?.textContent).toContain(
      "Ask a question. Several AIs from different companies argue it from all sides. You choose what they look into. You get a plain answer and see what holds up and what doesn't."
    );
    expect(hero?.textContent).toContain("Several AIs, one plain answer");
    expect([...(hero?.querySelectorAll(".lpStatBar > li:not(.lpStatRule)") ?? [])].map((item) => item.textContent)).toEqual([
      "Each point shows whether a second AI agreed",
      "Free questions are public"
    ]);
    expect(method?.textContent).toContain("Four steps, from your question to your report.");
    expect(method?.textContent).toContain(
      "You choose what the AIs look into, and you can dig into any point."
    );
    expect(pricing?.textContent).toContain("Good questions deserve more than one answer.");
    // The closing line names no time.
    expect(pricing?.textContent).toContain(
      "Ask one question. You get a plain answer, the points it rests on, and what is still open."
    );
    expect(pricing?.textContent).not.toMatch(/minute/iu);
    // None of the older product's promises is left on the landing.
    const landing = document.querySelector(".lpRoot")?.textContent ?? "";
    for (const retired of ["You argue", "Four turns", "turn is scored", "Five frontier models", "Verdict with receipts",
      "No audience", "weakest joint", "Take one round", "Start a round"]) {
      expect(landing, retired).not.toContain(retired);
    }
  });

  it("renders the hero's one CTA and sends it through the safe auth entry", async () => {
    // PROPERTY: the hero's CTA enters auth with the exact encoded /v4 return path
    // rather than a dead or unsafe target. The second button, which opened the
    // sample exchange, is gone with it.
    const document = await renderRoute(null);
    const hero = document.querySelector('[data-landing-section="hero"]');
    const links = [...(hero?.querySelectorAll("a") ?? [])];
    // The CTA carries a trailing arrow glyph, so compare the label itself.
    const label = (link: Element): string =>
      (link.textContent ?? "").replace("→", "").trim();
    const primary = links.find((link) => label(link) === "Ask a question");

    expect(primary).toBeDefined();
    expect(primary?.getAttribute("href")).toBe("/login?next=%2Fv4");
    expect(hero?.querySelector(".lpCtaGhost")).toBeNull();
    expect(links.find((link) => label(link) === "Read a scored transcript")).toBeUndefined();
  });

  it("renders the closing CTA with the safe auth entry", async () => {
    // PROPERTY: the tertiary Start action belongs to the closing subtree (the
    // document moved it out of the method split) and uses the same encoded
    // /v4 auth-entry contract as the other primaries.
    const document = await renderRoute(null);
    const closing = document.querySelector('[data-landing-section="pricing"]');
    const primary = [...(closing?.querySelectorAll("a") ?? [])]
      .find((link) => (link.textContent ?? "").replace("→", "").trim() === "Ask a question");

    expect(primary).toBeDefined();
    expect(primary?.getAttribute("href")).toBe("/login?next=%2Fv4");
  });
});
