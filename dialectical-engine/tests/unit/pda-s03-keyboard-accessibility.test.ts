import { describe, expect, it, vi } from "vitest";

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
  readPublicDebates: vi.fn(async () => ({ items: [], total: 0 }))
}));

vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({ readPublicDebates: serverMocks.readPublicDebates })
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ "user-agent": "pda-s03-render-test" })
}));

const expectedTabs = [
  { label: "Your Debates", href: "/?tab=yours" },
  { label: "Public Debates", href: "/?tab=public" }
] as const;

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

async function renderHomePage(selected: "yours" | "public"): Promise<Document> {
  const [{ default: HomePage }, { renderToStaticMarkup }, { JSDOM }] = await Promise.all([
    vi.importActual<HomePageModule>("../../apps/ui/app/page.js"),
    vi.importActual<StaticRendererModule>("react-dom/server"),
    vi.importActual<JSDOMModule>("jsdom")
  ]);
  const page = await HomePage({ searchParams: Promise.resolve({ tab: selected }) });
  return new JSDOM(renderToStaticMarkup(page)).window.document;
}

describe("public debate navigation keyboard accessibility", () => {
  it.each(["yours", "public"] as const)("renders enabled native links and current-page state for tab=%s", async (selected) => {
    // PROPERTY: the real HomePage render exposes both named modes as enabled
    // navigation links with exact destinations and only the requested link
    // marked as the current page, without borrowing ARIA tab semantics.
    const document = await renderHomePage(selected);
    const navigation = document.querySelector('.sectionHead[aria-label="Debate library"]');
    expect(navigation).not.toBeNull();
    expect(navigation!.getAttribute("role"), "navigation must not claim tablist semantics").not.toBe("tablist");

    const links = [...navigation!.querySelectorAll("a")];
    expect(links).toHaveLength(2);

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

  it("renders the logged-out Your Debates sign-in pointer inside the switched content area", async () => {
    // PROPERTY: selecting Your Debates without a session visibly replaces the
    // public list area with the exact account-path hint owned by that mode.
    const yoursDocument = await renderHomePage("yours");
    const navigation = yoursDocument.querySelector('.sectionHead[aria-label="Debate library"]');
    const hint = navigation?.nextElementSibling;

    expect(hint?.tagName, "in-panel hint element").toBe("P");
    expect(hint?.classList.contains("tabEmptyHint"), "in-panel hint class").toBe(true);
    expect(hint?.textContent?.trim(), "in-panel hint copy").toBe(
      "Sign in or create an account above to see your debates."
    );

    const publicDocument = await renderHomePage("public");
    expect(publicDocument.querySelector(".tabEmptyHint"), "hint is exclusive to Your Debates").toBeNull();
  });
});
