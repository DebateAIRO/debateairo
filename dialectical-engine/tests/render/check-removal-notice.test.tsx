// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { act } from "react";
import { isValidElement } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CrisisHelpNumbers, CrisisSupportDialog } from "../../apps/ui/components/CrisisSupport";
import { CheckRemovalNotice, RemovalNoticeLatch } from "../../apps/ui/components/CheckRemovalNotice";
import { ModeToggle } from "../../apps/ui/components/ModeToggle";
import { CRISIS_LINES, STABLE_CRISIS_COUNTRY_OPTIONS, crisisCountryOptions, formatCrisisHours } from "../../apps/ui/lib/crisisLines";
import HomePage from "../../apps/ui/app/page";
import home from "../../apps/ui/messages/en/home.json";

const { takeNotice } = vi.hoisted(() => ({ takeNotice: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/serverApi", () => ({
  readSessionCookie: () => "test-session", readTrustedClientIp: () => null,
  listDebatesPageServer: async () => ({ summaries: [] }),
  createServerContractClient: () => ({
    readPublicDebates: async () => ({ items: [], total: 0 }),
    readAgeConfirmation: async () => ({ status: "none" }),
    getLegalStatus: async () => ({ must_accept: [] }),
    takeRemovalNotice: takeNotice
  })
}));
vi.mock("@/lib/i18n/server", () => ({ loadNamespace: async () => ({}) }));

function findLatch(tree: unknown): React.ReactElement | null {
  if (Array.isArray(tree)) return tree.map(findLatch).find(Boolean) ?? null;
  if (!isValidElement(tree)) return null;
  if (tree.type === RemovalNoticeLatch) return tree;
  return findLatch((tree.props as { children?: unknown }).children);
}

describe("S01 removal notice", () => {
  const notice = () => renderToStaticMarkup(<CheckRemovalNotice catalog={home} locale="en" countryHint="US" onClose={() => {}} />);

  it("shows help numbers with the hinted country first", () => {
    const html = notice();
    expect(new Set(STABLE_CRISIS_COUNTRY_OPTIONS.map((option) => option.code)))
      .toEqual(new Set(Object.keys(CRISIS_LINES)));
    expect(html).toContain('class="crisisSupportCountry"');
    expect(html).toMatch(/<option value="US" selected="">/);
    expect(html).toContain('class="crisisSupportLines"');
  });

  it("prints localized country names in the server markup", () => {
    for (const [locale, code, name] of [["ro", "RO", "România"], ["de", "DE", "Deutschland"], ["ja", "JP", "日本"]]) {
      const html = renderToStaticMarkup(<CheckRemovalNotice catalog={home} locale={locale} countryHint={code} />);
      expect(html).toContain(`<option value="${code}" selected="">${name}</option>`);
      expect(crisisCountryOptions(locale).find((option) => option.code === code)?.name).toBe(name);
    }
  });

  it("keeps first-render names and weekday hours identical when browser Intl data differs", async () => {
    const page = <CheckRemovalNotice catalog={home} locale="mt" countryHint="MT" />;
    const markup = renderToString(page);
    const hours = [{ days: ["mon"], from: "09:00", to: "17:00" }] as const;
    const initialHours = formatCrisisHours(hours, "mt");
    expect(initialHours).not.toContain("Mon 09:00");
    const node = document.createElement("div"); node.innerHTML = markup; document.body.append(node);
    const original = Intl.DateTimeFormat;
    vi.stubGlobal("Intl", Object.assign(Object.create(Intl), { DateTimeFormat: class extends original {
      format(date: Date) { return "Mon"; }
    } }));
    const recovered: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => { root = hydrateRoot(node, page, { onRecoverableError: (error) => recovered.push(error) }); });
      expect(recovered).toEqual([]);
      expect(formatCrisisHours(hours, "mt")).toBe(initialHours);
    } finally { await act(async () => { root?.unmount(); }); vi.unstubAllGlobals(); node.remove(); }
  });

  it("hydrates the notice when browser country and ICU names differ from the server", async () => {
    const page = <div><header className="debateTopBar"><ModeToggle compact /></header>
      <CheckRemovalNotice catalog={home} locale="en" countryHint={null} onClose={() => {}} /></div>;
    const markup = renderToString(page);
    const node = document.createElement("div");
    node.innerHTML = markup;
    document.body.append(node);
    const priorLanguages = Object.getOwnPropertyDescriptor(navigator, "languages");
    Object.defineProperty(navigator, "languages", { configurable: true, value: ["en-US"] });
    const originalOf = Intl.DisplayNames.prototype.of;
    vi.spyOn(Intl.DisplayNames.prototype, "of").mockImplementation(function (this: Intl.DisplayNames, code: string) {
      return code === "HK" ? "Hong Kong" : originalOf.call(this, code);
    });
    const recovered: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => { root = hydrateRoot(node, page,
        { onRecoverableError: (error) => recovered.push(error) }); });
      expect(recovered).toEqual([]);
      expect(node.querySelector('[data-mode-toggle="true"]')).not.toBeNull();
      expect(node.querySelector<HTMLSelectElement>("select")?.value).toBe("US");
    } finally {
      await act(async () => { root?.unmount(); });
      vi.restoreAllMocks();
      if (priorLanguages) Object.defineProperty(navigator, "languages", priorLanguages);
      else delete (navigator as { languages?: readonly string[] }).languages;
      node.remove();
    }
  });

  it("first renders the locale country before using a different browser country", async () => {
    const page = <CrisisHelpNumbers catalog={home} locale="ro" countryHint={null} />;
    const markup = renderToString(page);
    expect(markup).toMatch(/<option value="RO" selected="">/);
    const node = document.createElement("div"); node.innerHTML = markup; document.body.append(node);
    const prior = Object.getOwnPropertyDescriptor(navigator, "languages");
    Object.defineProperty(navigator, "languages", { configurable: true, value: ["en-US"] });
    const recovered: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => { root = hydrateRoot(node, page, { onRecoverableError: (error) => recovered.push(error) }); });
      expect(recovered).toEqual([]);
      expect(node.querySelector<HTMLSelectElement>("select")?.value).toBe("US");
    } finally {
      await act(async () => { root?.unmount(); });
      if (prior) Object.defineProperty(navigator, "languages", prior);
      else delete (navigator as { languages?: readonly string[] }).languages;
      node.remove();
    }
  });

  it("retains a visitor-selected crisis country across locale changes", async () => {
    const node = document.createElement("div"); document.body.append(node);
    const root = createRoot(node);
    await act(async () => { root.render(<CrisisHelpNumbers catalog={home} locale="en" countryHint="US" />); });
    const select = () => node.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select(), "RO");
      select().dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(select().value).toBe("RO");
    await act(async () => { root.render(<CrisisHelpNumbers catalog={home} locale="ro" countryHint="US" />); });
    expect(select().value).toBe("RO");
    act(() => root.unmount()); node.remove();
  });

  it("orders the title, explanation, help numbers, five reasons and Close", () => {
    const html = notice();
    const phrases = ["We deleted this debate", "We do not keep it, and it cannot be restored.",
      'class="crisisSupportCountry"', "Only this debate was deleted.",
      "Our automatic check of its conclusion found", "This decision was made by an automated tool",
      "Ground: our Terms of Service", "To complain, write to office@dezbatere.ro", ">Close</button>"];
    let previous = -1;
    for (const phrase of phrases) {
      const at = html.indexOf(phrase);
      expect(at).toBeGreaterThan(previous);
      previous = at;
    }
    expect(html).toContain('class="removalNoticeReasons"');
  });

  it("contains no crisis screen small print or Back button", () => {
    const html = notice();
    expect(html).not.toContain("We did not start a debate");
    expect(html).not.toContain("Back to my question");
    expect(html).toContain('class="crisisSupportBack"');
  });

  it("calls onClose from Close", () => {
    const onClose = vi.fn();
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    act(() => root.render(<CheckRemovalNotice catalog={home} locale="en" countryHint="US" onClose={onClose} />));
    act(() => node.querySelector<HTMLButtonElement>(".crisisSupportBack")?.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    node.remove();
  });

  it("keeps a taken notice open across a false server refresh until Close", () => {
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    act(() => root.render(<RemovalNoticeLatch taken catalog={home} locale="en" countryHint="US" />));
    expect(node.querySelector('[data-dialog="removal-notice"]')).not.toBeNull();
    act(() => root.render(<RemovalNoticeLatch taken={false} catalog={home} locale="en" countryHint="US" />));
    expect(node.querySelector('[data-dialog="removal-notice"]')).not.toBeNull();
    act(() => node.querySelector<HTMLButtonElement>(".crisisSupportBack")?.click());
    expect(node.querySelector('[data-dialog="removal-notice"]')).toBeNull();
    act(() => root.unmount());
    node.remove();
  });

  it("Your debates takes the notice once and passes only that result to the latch", async () => {
    takeNotice.mockReset().mockResolvedValueOnce({ notice: true }).mockResolvedValueOnce({ notice: false });
    const first = findLatch(await HomePage({ searchParams: Promise.resolve({ tab: "yours" }) }));
    const second = findLatch(await HomePage({ searchParams: Promise.resolve({ tab: "yours" }) }));
    expect(first?.props).toMatchObject({ taken: true });
    expect(second?.props).toMatchObject({ taken: false });
    expect(takeNotice).toHaveBeenCalledTimes(2);
  });

  it("keeps the crisis dialog's existing markup byte for byte after number extraction", () => {
    const markup = renderToStaticMarkup(<CrisisSupportDialog catalog={home} locale="en" countryHint="US" onBack={() => {}} />);
    expect(createHash("sha256").update(markup).digest("hex")).toBe("4cae9a164011f7100721f6e3cadce37fcf71ac824be35464196d5bf5613110a8");
  });
});
