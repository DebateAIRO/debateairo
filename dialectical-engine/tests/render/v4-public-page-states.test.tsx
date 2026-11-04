// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };

/*
 * Owner screen review (3 Nov), the public debate page before the debate shows:
 * - public-f6: a plain grey outline shows at once while the server reads the debate: header, title, answer card, three rows; no words, no spinner.
 * - public-f7: "not found" only for a debate that does not exist; a passing fault, the read limit or a lost connection says "We couldn't load this
 *   debate just now." with Try again, which asks the server again in place.
 * - public-f8: "under review" and "made by a newer version" sit inside the normal header, with "See other public debates" and "Ask your own question".
 */
const mocks = vi.hoisted(() => ({ readPublicDebate: vi.fn() }));
vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({ readPublicDebate: mocks.readPublicDebate })
}));
vi.mock("@/lib/billing/usage", () => ({ readBillingUsage: async () => null }));
// ask-d6 A: the V4 header's account button reads the session; its own test is v4-header-account.
vi.mock("@/components/v4/V4AccountMenu", () => ({ V4AccountMenu: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const V4 = v4English as Record<string, string>;
const REF = "22222222-2222-4222-8222-222222222222";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

type Navigation = typeof import("./stubs/next-navigation.js");

/**
 * The page's own module graph; `failure` is built from that graph's error class (instanceof holds within one), and `nav` is that graph's
 * next/navigation stand-in, whose notFound() throws NEXT_NOT_FOUND (so reaching an element proves it was not called) and which records refreshes.
 */
async function pageFor(failure: (contract: typeof import("@debateai/contract")) => unknown): Promise<Readonly<{ element: ReactElement; nav: Navigation }>> {
  vi.resetModules();
  mocks.readPublicDebate.mockReset();
  mocks.readPublicDebate.mockRejectedValue(failure(await import("@debateai/contract")));
  const { default: PublicDebatePage } = await import("../../apps/ui/app/public/debate/[id]/page.js");
  const nav = await import("./stubs/next-navigation.js");
  nav.resetRefreshes();
  return { element: await PublicDebatePage({ params: Promise.resolve({ id: REF }) }) as ReactElement, nav };
}

async function mount(element: ReactElement): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(element); });
  return host;
}

describe("a debate that cannot be shown", () => {
  it("only a debate that does not exist is 'not found'", async () => {
    await expect(pageFor(({ ContractHttpError }) => new ContractHttpError("NOT_FOUND", 404, "x", "DEBATE_NOT_FOUND"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each([
    ["the read limit", ({ ContractHttpError }: typeof import("@debateai/contract")) => new ContractHttpError("RATE_LIMITED", 429, "x")],
    ["a server fault", ({ ContractHttpError }: typeof import("@debateai/contract")) => new ContractHttpError("SERVER_FAILURE", 502, "x")],
    ["a lost connection", ({ ContractHttpError }: typeof import("@debateai/contract")) => new ContractHttpError("NETWORK_FAILURE", 0, "x")],
    ["a failed fetch", () => new TypeError("fetch failed")]
  ])("%s says it couldn't load just now, inside the header, with Try again that asks the server again", async (_case, failure) => {
    const { element, nav } = await pageFor(failure);
    const page = await mount(element);
    const note = page.querySelector("[data-public-note=could-not-load]")!;
    expect(note.querySelector("[role=status]")!.textContent).toBe("We couldn't load this debate just now.");
    expect(page.querySelector(".v4Hdr")).not.toBeNull();
    const retry = [...note.querySelectorAll("button")].find((button) => button.textContent === V4["v4.common.retry"])!;
    await act(async () => { retry.click(); });
    expect(nav.readRefreshes()).toHaveLength(1);
    expect(page.querySelector('meta[name="robots"]')?.getAttribute("content") ?? document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
  });

  it.each([
    ["under review", "under-review", ({ ContractHttpError }: typeof import("@debateai/contract")) => new ContractHttpError("NOT_FOUND", 410, "x", "DEBATE_UNDER_REVIEW"), V4["v4.public.underReview"]],
    ["made by a newer version", "newer-release", ({ ContractHttpError }: typeof import("@debateai/contract")) => new ContractHttpError("NOT_FOUND", 409, "x", "MADE_BY_NEWER_RELEASE"),
      chromeEnglish["chrome.release.madeByNewer"]]
  ])("%s: its one line inside the normal header, with the two ways on", async (_case, kind, failure, line) => {
    const html = renderToStaticMarkup((await pageFor(failure)).element);
    const page = new DOMParser().parseFromString(html, "text/html");
    const note = page.querySelector(`[data-public-note=${kind}]`)!;
    expect(note.querySelector("[role=status]")!.textContent).toBe(line);
    expect(page.querySelector("header.v4Hdr a.v4HdrBrand")!.getAttribute("href")).toBe("/v4");
    const ways = [...note.querySelectorAll(".v4PubNoteWays a")].map((link) => [link.textContent, link.getAttribute("href")]);
    expect(ways).toEqual([["See other public debates", "/?tab=public"], ["Ask your own question", "/v4"]]);
    expect(page.querySelector('meta[name="robots"]')!.getAttribute("content")).toBe("noindex");
    // Nothing of the debate is shown.
    expect(html).not.toContain(REF);
  });
});

describe("while a public debate loads", () => {
  it("a plain grey outline: a header, the title, the answer card and three rows, with no words and no movement", async () => {
    const { default: LoadingPublicDebate } = await import("../../apps/ui/app/public/debate/[id]/loading.js");
    const page = await mount(<LoadingPublicDebate />);
    const outline = page.querySelector("[data-public-loading]")!;
    expect(outline.getAttribute("aria-busy")).toBe("true");
    expect(outline.textContent).toBe("");
    expect(outline.querySelector(".v4PubSkelHeader")).not.toBeNull();
    expect(outline.querySelectorAll(".v4PubSkelTitle").length).toBeGreaterThan(0);
    expect(outline.querySelectorAll(".v4PubSkelCard")).toHaveLength(1);
    expect(outline.querySelectorAll(".v4PubSkelRow")).toHaveLength(3);
    expect(outline.querySelector("[role=progressbar], svg, img")).toBeNull();
    const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/public/debate/[id]/public-lane.css"), "utf8");
    const skeleton = css.split("\n").filter((line) => line.includes(".v4PubSkel")).join("\n");
    expect(skeleton.length).toBeGreaterThan(0);
    expect(skeleton).not.toMatch(/animation|transition|@keyframes/u);
  });
});
