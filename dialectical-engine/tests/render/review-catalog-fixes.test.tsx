import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema } from "@debateai/contract";
import DebatePage from "../../apps/ui/app/debate/[id]/page.js";
import EnrollMfaLayout from "../../apps/ui/app/enroll-mfa/layout.js";
import EnrollMfaPage from "../../apps/ui/app/enroll-mfa/page.js";
import NotFound from "../../apps/ui/app/not-found.js";
import { PublicDebatePageClient } from "../../apps/ui/app/public/debate/[id]/PublicDebatePageClient.js";
import SettingsPage from "../../apps/ui/app/settings/page.js";
import VerifyEmailLayout from "../../apps/ui/app/verify-email/layout.js";
import { AiBanner } from "../../apps/ui/components/AiNotice.js";
import { useSelectedAuthCatalog } from "../../apps/ui/components/AuthShell.js";
import { LOCALE_COOKIE } from "../../apps/ui/lib/i18n/locales.js";
import { loadNamespace } from "../../apps/ui/lib/i18n/server.js";

// FIX-DEBATE-CATALOGS follow-up 4: the independent review (REV-FIX-CATALOGS)
// found four surfaces that still painted English on a non-English page. Each
// row mounts the real server entry point under a locale cookie; the AuthGate is
// NOT mocked here, so its first paint is what a signed-in reader sees first.

const mocks = vi.hoisted(() => ({
  getDebateServer: vi.fn(),
  locale: "en",
  /** Values laid over what loadNamespace returns, to prove a placeholder key's source. */
  overlay: {} as Record<string, Record<string, string>>
}));

vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  getDebateServer: mocks.getDebateServer
}));
vi.mock("@/lib/i18n/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/i18n/server.js")>();
  return {
    ...actual,
    loadNamespace: async (...args: Parameters<typeof actual.loadNamespace>) => {
      const catalog = await actual.loadNamespace(...args);
      const overlay = mocks.overlay[`${args[0]}/${args[1]}`];
      return overlay === undefined ? catalog : Object.freeze({ ...catalog, ...overlay });
    }
  };
});
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: name === LOCALE_COOKIE ? mocks.locale : "t".repeat(43) })
  }),
  headers: async () => new Headers({ "user-agent": "vitest-render-browser" })
}));

const queuedRun = {
  run_ref: "run:queued",
  question_line: "Messi or Ronaldo?",
  state: "QUEUED" as const,
  terminal_reason: null,
  hold_until: null
};

const publicDebate = PublicDebateSchema.parse({
  public_ref: "22222222-2222-4222-8222-222222222222",
  author_pseudonym: "Stable Public Author",
  question: "Should public readers receive the complete answer surface?",
  published_at: "2026-08-24T00:00:00.000Z",
  answer: {
    terminal: "SERVED",
    verdict: "SUPPORTED",
    verdict_available: true,
    confidence_band: "moderate",
    summary_segments: [{ text: "The public summary remains readable." }],
    badges: ["Evidence checked"],
    residual_objections: [],
    reversal_point: "A replicated contrary result.",
    as_of: "2026-08-24T00:00:00.000Z"
  }
});

function catalogValue(locale: string, namespace: string, key: string): string {
  const catalog = JSON.parse(
    // Resolved from the lane root: under jsdom import.meta.url is not a file URL (TOOLING-TRAPS).
    readFileSync(resolve(process.cwd(), `apps/ui/messages/${locale}/${namespace}.json`), "utf8")
  ) as Record<string, string>;
  const value = catalog[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${locale}/${namespace} lacks ${key}`);
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

beforeEach(() => {
  mocks.locale = "en";
  mocks.overlay = {};
  mocks.getDebateServer.mockReset();
  mocks.getDebateServer.mockResolvedValue({ ok: false, kind: "loading", run: queuedRun });
});

describe("review F1: the AI notice and the support banner read the namespace their keys live in", () => {
  it("labels the public debate page's AI notice link from the Hebrew home catalogue", async () => {
    const [publicCatalog, timeCatalog, debateChromeCatalog, debateDrawersCatalog, miscCatalog, composeCatalog, homeCatalog] =
      await Promise.all(["public", "time", "debateChrome", "debateDrawers", "misc", "compose", "home"].map(
        (namespace) => loadNamespace("he", namespace as Parameters<typeof loadNamespace>[1])
      ));
    const html = renderToStaticMarkup(
      <PublicDebatePageClient
        debate={publicDebate}
        locale="he"
        publicCatalog={publicCatalog!}
        timeCatalog={timeCatalog!}
        debateChromeCatalog={debateChromeCatalog!}
        debateDrawersCatalog={debateDrawersCatalog!}
        miscCatalog={miscCatalog!}
        composeCatalog={composeCatalog!}
        homeCatalog={homeCatalog!}
      />
    );
    expect(html).toContain(`aria-label="${escapeHtml(catalogValue("he", "home", "home.aiLinkLabel"))}"`);
    expect(html).toContain(`>${escapeHtml(catalogValue("he", "home", "home.aiLink"))}<`);
    // MUT: hand AiNotice the debateChrome catalogue again (the pre-fix wiring) -> RED.
    expect(html).not.toContain(escapeHtml(catalogValue("en", "home", "home.aiLink")));
    expect(html).not.toContain(escapeHtml(catalogValue("en", "home", "home.aiLinkLabel")));
  });

  it("names the support banner's region from the reader's support catalogue", async () => {
    const hebrew = await loadNamespace("he", "support");
    const html = renderToStaticMarkup(<AiBanner catalog={hebrew} />);
    expect(html).toContain(`aria-label="${escapeHtml(catalogValue("he", "support", "support.aiDisclosure"))}"`);
    expect(html).toContain(escapeHtml(catalogValue("he", "support", "support.bannerLead")));
    // MUT: restore the hard-coded aria-label="AI disclosure" (Assistant.tsx:718/820 pre-fix) -> RED.
    expect(html).not.toContain('aria-label="AI disclosure"');
    expect(renderToStaticMarkup(<AiBanner />)).toContain('aria-label="AI disclosure"');
  });
});

describe("review F2: the session check paints in the reader's language", () => {
  const hebrewChecking = () => escapeHtml(catalogValue("he", "newDebate", "newDebate.checkingSession"));
  const englishChecking = () => escapeHtml(catalogValue("en", "newDebate", "newDebate.checkingSession"));

  it("the debate page's AuthGate shows the Hebrew session check", async () => {
    mocks.locale = "he";
    const html = renderToStaticMarkup(
      await DebatePage({ params: Promise.resolve({ id: queuedRun.run_ref }) }) as ReactElement
    );
    expect(html).toContain(hebrewChecking());
    // MUT: drop catalog={newDebateCatalog} from <AuthGate> in DebatePageGate.tsx -> RED.
    expect(html).not.toContain(englishChecking());
  });

  it("the settings page's AuthGate shows the Hebrew session check", async () => {
    mocks.locale = "he";
    const html = renderToStaticMarkup(await SettingsPage() as ReactElement);
    expect(html).toContain(hebrewChecking());
    // MUT: drop catalog={newDebateCatalog} from <AuthGate> in SettingsPageClient.tsx -> RED.
    expect(html).not.toContain(englishChecking());
  });

  it("the English pages still say Checking session…", async () => {
    expect(renderToStaticMarkup(await SettingsPage() as ReactElement)).toContain("Checking session…");
    expect(renderToStaticMarkup(
      await DebatePage({ params: Promise.resolve({ id: queuedRun.run_ref }) }) as ReactElement
    )).toContain("Checking session…");
  });
});

describe("review F5: /enroll-mfa and /verify-email are served with their auth catalogue", () => {
  async function firstPaint(locale: string, layout: typeof EnrollMfaLayout): Promise<string> {
    mocks.locale = locale;
    return renderToStaticMarkup(await layout({ children: <EnrollMfaPage /> }) as ReactElement);
  }

  it("paints the Hebrew enrolment copy on the first render, with no English in between", async () => {
    for (const layout of [EnrollMfaLayout, VerifyEmailLayout]) {
      const html = await firstPaint("he", layout);
      for (const key of ["auth.enroll.mandatoryMfa", "auth.enroll.protectAccount"]) {
        expect(html).toContain(escapeHtml(catalogValue("he", "auth", key)));
        // MUT: restore the lazy client loader (English until the chunk arrives) -> RED.
        expect(html).not.toContain(escapeHtml(catalogValue("en", "auth", key)));
      }
    }
  });

  it("keeps English on the English path and refuses a silent English fallback elsewhere", async () => {
    const html = await firstPaint("en", EnrollMfaLayout);
    expect(html).toContain(escapeHtml(catalogValue("en", "auth", "auth.enroll.protectAccount")));
    function Unserved() {
      useSelectedAuthCatalog("he");
      return null;
    }
    expect(() => renderToStaticMarkup(<Unserved />)).toThrow(/no auth catalogue was served for "he"/);
  });
});

describe("review Low: the 404 page is localized", () => {
  it("renders the not-found line and the way home from the reader's chrome catalogue", async () => {
    mocks.locale = "he";
    // Every non-en locale carries the English placeholder for chrome.notFound until
    // the translation seat runs; a value the page could not invent proves the source.
    mocks.overlay = { "he/chrome": { "chrome.notFound": "HE_NOT_FOUND_SENTINEL" } };
    const html = renderToStaticMarkup(await NotFound() as ReactElement);
    expect(html).toContain("HE_NOT_FOUND_SENTINEL");
    expect(html).toContain(`>${escapeHtml(catalogValue("he", "chrome", "chrome.library"))}<`);
    expect(html).not.toContain(">Library<");

    mocks.locale = "en";
    mocks.overlay = {};
    const english = renderToStaticMarkup(await NotFound() as ReactElement);
    expect(english).toContain("This page could not be found.");
    expect(english).toContain(">404<");
  });
});
