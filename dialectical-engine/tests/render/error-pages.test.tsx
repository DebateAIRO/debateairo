// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import chromeRomanian from "../../apps/ui/messages/ro/chrome.json" with { type: "json" };

/*
 * The app's own pages for an unexpected error, in the reader's language (Next's built-in page printed English for every
 * reader). app/error.tsx stands inside the root layout and reads the layout's chrome catalogue; app/global-error.tsx replaces
 * the layout, so it reads the language cookie itself. Each shows one plain line, a button that draws the page again, and the
 * way home, and never what went wrong.
 */
const provided = vi.hoisted(() => ({ catalog: {} as Record<string, string> }));
vi.mock("@/lib/i18n/I18nProvider", () => ({ useChromeI18n: () => ({ locale: "ro", catalog: provided.catalog }) }));

import PageError from "../../apps/ui/app/error.js";
import GlobalError from "../../apps/ui/app/global-error.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const EN = chromeEnglish as Record<string, string>;
const RO = chromeRomanian as Record<string, string>;
const FAILURE = Object.assign(new Error("secret server detail"), { digest: "digest-123" });

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.cookie = "debateai.locale=; Max-Age=0; Path=/";
});

async function mount(element: ReactElement): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(element); });
  return host;
}

describe("the page shown when a page fails (app/error.tsx)", () => {
  it.each([["English", EN], ["Romanian", RO]])("speaks the layout's language (%s): the title, one plain line, Try again and Home", async (_name, words) => {
    provided.catalog = words;
    const reset = vi.fn();
    const page = await mount(<PageError error={FAILURE} reset={reset} />);
    expect(page.querySelector("h1")!.textContent).toBe(words["chrome.error.title"]);
    expect(page.querySelector("[role=alert]")!.textContent).toBe(words["chrome.error.body"]);
    const retry = page.querySelector("button")!;
    expect(retry.textContent).toBe(words["chrome.error.retry"]);
    const home = page.querySelector("a")!;
    expect([home.textContent, home.getAttribute("href")]).toEqual([words["chrome.footer.home"], "/"]);
    await act(async () => { retry.click(); });
    expect(reset).toHaveBeenCalledTimes(1);
    expect(page.textContent).not.toContain("secret server detail");
    expect(page.textContent).not.toContain("digest-123");
  });

  it("the Romanian words are Romanian, in the formal voice, with ș and ț written with a comma", () => {
    for (const key of ["chrome.error.title", "chrome.error.body", "chrome.error.retry"]) {
      expect(RO[key], key).not.toBe(EN[key]);
      expect(RO[key], key).not.toMatch(/[şţŞŢ]/u);
    }
    expect(RO["chrome.error.retry"]).toBe("Încercați din nou");
  });
});

describe("the page shown when the layout itself fails (app/global-error.tsx)", () => {
  it("draws its own document, in English on the server, where no cookie is read", () => {
    const html = renderToStaticMarkup(<GlobalError error={FAILURE} reset={() => undefined} />);
    expect(html.startsWith('<html lang="en">')).toBe(true);
    expect(html).toContain(`<h1>${EN["chrome.error.title"]}</h1>`);
    expect(html).toContain('<a href="/">');
    expect(html).not.toContain("secret server detail");
  });

  it.each([
    ["the Romanian cookie", "debateai.locale=ro", RO, "ro"],
    ["no language cookie", null, EN, "en"],
    ["a language the site does not offer now (its lines are English)", "debateai.locale=de", EN, "en"]
  ])("in the browser, reads the language from %s", async (_name, cookie, words, lang) => {
    if (cookie !== null) document.cookie = `${cookie}; Path=/`;
    const reset = vi.fn();
    await mount(<GlobalError error={FAILURE} reset={reset} />);
    expect(document.documentElement.getAttribute("lang")).toBe(lang);
    expect(document.querySelector("h1")!.textContent).toBe(words["chrome.error.title"]);
    expect(document.querySelector("[role=alert]")!.textContent).toBe(words["chrome.error.body"]);
    const retry = document.querySelector<HTMLButtonElement>("main button")!;
    expect(retry.textContent).toBe(words["chrome.error.retry"]);
    await act(async () => { retry.click(); });
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
