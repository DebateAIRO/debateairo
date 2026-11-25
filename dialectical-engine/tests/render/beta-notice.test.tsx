// @vitest-environment jsdom

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The site says it is in Beta: a small "Beta" mark beside the site's name on the V4 pages, one sentence where a person
 * starts (the ask page and the public home page), and a "Report a problem" link in the account menu and both footers.
 * A report is a mail the person sends themselves: the site only writes the draft's address, subject and first lines.
 */
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie-session",
  validateSession: async () => undefined,
  contractClient: {
    readSession: async () => ({ session_id: "synthetic" }),
    readAccountEmail: async () => ({ email: "maria@example.com", recovery_email: null, pending: null }),
    getBillingUsage: async () => ({ plan_id: "PLUS", windows: [] }),
    logout: async () => undefined,
    revokeAllSessions: async () => ({ revoked: 0 })
  }
}));

import { BetaBadge, BetaNote, ReportProblemLink, reportedPageAddress, reportProblemHref } from "../../apps/ui/components/BetaNotice.js";
import { LandingHero } from "../../apps/ui/components/landing/LandingHero.js";
import { SiteFooter } from "../../apps/ui/components/SiteFooter.js";
import { V4Header } from "../../apps/ui/components/v4/V4Header.js";

const MESSAGES = resolve(import.meta.dirname, "../../apps/ui/messages");
const words = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;
const CHROME = words("en", "chrome");
const V4 = words("en", "v4");
const LANDING = { ...words("en", "home"), ...CHROME };

/** What a `mailto:` address holds, read back the way a mail program reads it. */
function mailOf(href: string): { to: string; subject: string; body: string } {
  const [to, query = ""] = href.slice("mailto:".length).split("?");
  const fields = new URLSearchParams(query.replaceAll("+", "%2B"));
  return { to: to!, subject: fields.get("subject") ?? "", body: fields.get("body") ?? "" };
}

let root: Root | null = null;
async function mount(node: React.ReactNode): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState(null, "", "/v4");
});
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("the Beta mark", () => {
  it("says 'Beta'", async () => {
    const page = await mount(<BetaBadge />);
    expect(page.querySelector(".betaBadge")!.textContent).toBe("Beta");
  });

  it("follows the site's name in the V4 header, inside the brand's link, for signed-in and signed-out people alike", async () => {
    for (const session of ["IN", "OUT"] as const) {
      const page = await mount(<V4Header catalog={V4} session={session} showQuota={false} />);
      const marks = page.querySelectorAll("header.v4Hdr .betaBadge");
      expect(marks, session).toHaveLength(1);
      expect(marks[0]!.closest("a.v4HdrBrand"), session).not.toBeNull();
      expect(marks[0]!.previousElementSibling?.className, session).toBe("v4HdrName");
      await act(async () => root!.unmount());
      root = null;
    }
  });

  it("stays on screen on a phone, where the header hides the site's name", () => {
    const phone = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-base.css"), "utf8");
    const rules = phone.slice(phone.indexOf("@media (max-width: 767px)"));
    expect(rules).toContain(".v4Hdr .v4HdrName {");
    expect(rules).not.toMatch(/v4HdrBeta|betaBadge/u);
  });
});

describe("the mail a report starts as", () => {
  it("goes to the support address, says what it is, names the page and leaves room to write", () => {
    const mail = mailOf(reportProblemHref(CHROME, "https://dezbatere.ro/v4/debate/11111111-1111-4111-8111-111111111111"));
    expect(mail.to).toBe("support@dezbatere.ro");
    expect(mail.subject).toBe("Dialectical Engine Beta: a problem or an idea");
    expect(mail.body.split("\r\n")).toEqual([
      "Page: https://dezbatere.ro/v4/debate/11111111-1111-4111-8111-111111111111",
      "",
      "What happened, or what could be better:",
      ""
    ]);
  });

  it("before the page is known (the server's first paint) it names no page", () => {
    expect(mailOf(reportProblemHref(CHROME, null)).body.split("\r\n")).toEqual(["What happened, or what could be better:", ""]);
  });

  it("the page's address is its site and path only: a one-time code or a question after '?' or '#' never travels", () => {
    expect(reportedPageAddress({ origin: "https://dezbatere.ro", pathname: "/reset-password" })).toBe("https://dezbatere.ro/reset-password");
    const location = new URL("https://dezbatere.ro/v4?topic=my%20private%20question&token=one-time-code#part");
    expect(reportedPageAddress(location)).toBe("https://dezbatere.ro/v4");
  });

  it("the link writes the page the person is on at the press, without what follows '?'", async () => {
    const page = await mount(<ReportProblemLink />);
    const link = page.querySelector<HTMLAnchorElement>("a[data-report-problem]")!;
    expect(link.textContent).toBe("Report a problem");
    expect(mailOf(link.getAttribute("href")!).body).not.toContain("Page:");
    window.history.replaceState(null, "", "/reset-password?token=one-time-code");
    let pressed = 0;
    link.addEventListener("click", (event) => { pressed += 1; event.preventDefault(); });
    await act(async () => link.click());
    expect(pressed).toBe(1);
    const mail = mailOf(link.getAttribute("href")!);
    expect(mail.body.split("\r\n")[0]).toBe(`Page: ${window.location.origin}/reset-password`);
    expect(link.getAttribute("href")).not.toContain("one-time-code");
  });

  it("a menu that holds the link is told of the press, so it can close", async () => {
    let told = 0;
    const page = await mount(<ReportProblemLink role="menuitem" onPress={() => { told += 1; }} />);
    const link = page.querySelector<HTMLAnchorElement>("a[role=menuitem]")!;
    link.addEventListener("click", (event) => event.preventDefault());
    await act(async () => link.click());
    expect(told).toBe(1);
  });
});

describe("the Beta sentence", () => {
  it("says the site is in Beta, thanks for patience, and ends in a link that starts a report", async () => {
    const page = await mount(<BetaNote />);
    const note = page.querySelector("p.betaNote[role=note]")!;
    expect(note.textContent).toBe(
      "BetaDialectical Engine is in Beta. You may run into bugs. Thank you for your patience. Found a problem or have an idea? Tell us"
    );
    const link = note.querySelector<HTMLAnchorElement>("a.betaNoteLink")!;
    expect(link.textContent).toBe("Tell us");
    expect(mailOf(link.getAttribute("href")!).to).toBe("support@dezbatere.ro");
  });

  it("is not on the public home page, whose top bar carries the Beta mark beside the wordmark instead", async () => {
    // The simpler landing (2026-11-25): the hero holds no Beta sentence; the mark is in the landing's top bar
    // (its rendered place: t9-landing.test.tsx) and "Report a problem" is in the footer under it.
    const page = await mount(<LandingHero catalog={LANDING} />);
    expect(page.querySelectorAll(".betaNote")).toHaveLength(0);
    const chrome = readFileSync(resolve(import.meta.dirname, "../../apps/ui/components/landing/LandingChrome.tsx"), "utf8");
    expect(chrome.split("<BetaBadge />")).toHaveLength(2);
  });

  it("is on the ask page, once, right under the header and above both steps", () => {
    const ask = readFileSync(resolve(import.meta.dirname, "../../apps/ui/components/v4/V4AskClient.tsx"), "utf8");
    expect(ask.split("<BetaNote ")).toHaveLength(2);
    const [before, after] = ask.split('<BetaNote className="v4BetaNote" />');
    expect(before!.trimEnd().split("\n").slice(-3).map((line) => line.trim()).slice(0, 2)).toEqual(["{header}", "{updateBanner}"]);
    expect(after!.trimStart().startsWith('{pendingView !== null ? pendingView : step === "ask" ? (')).toBe(true);
  });
});

describe("'Report a problem' in the footers", () => {
  it("both footer shapes hold it once", async () => {
    for (const variant of ["line", "full"] as const) {
      const page = await mount(<SiteFooter variant={variant} />);
      const links = page.querySelectorAll<HTMLAnchorElement>("footer a[data-report-problem]");
      expect(links, variant).toHaveLength(1);
      expect(links[0]!.textContent, variant).toBe("Report a problem");
      expect(links[0]!.className, variant).toBe("siteFooterLink");
      await act(async () => root!.unmount());
      root = null;
    }
  });
});

describe("the Beta words in every language", () => {
  const KEYS = [
    "chrome.beta.badge", "chrome.beta.note", "chrome.beta.tellUsLead", "chrome.beta.tellUs", "chrome.beta.report",
    "chrome.beta.mailSubject", "chrome.beta.mailPage", "chrome.beta.mailPrompt"
  ] as const;

  it("every language has every sentence, and the page line names the address once", () => {
    const locales = readdirSync(MESSAGES, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    expect(locales).toHaveLength(35);
    for (const locale of locales) {
      const catalog = words(locale, "chrome");
      for (const key of KEYS) expect(catalog[key]?.trim(), `${locale}:${key}`).not.toBe("");
      for (const key of KEYS) expect(catalog[key], `${locale}:${key}`).toBeDefined();
      expect(catalog["chrome.beta.mailPage"]!.split("{address}"), locale).toHaveLength(2);
    }
  });

  it("Romanian, the site's other offered language, is translated", () => {
    const romanian = words("ro", "chrome");
    for (const key of KEYS.filter((key) => key !== "chrome.beta.badge")) expect(romanian[key], key).not.toBe(CHROME[key]);
  });
});
