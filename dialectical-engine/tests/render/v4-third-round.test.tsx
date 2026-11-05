// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type MouseEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * The owner's third round of follow-ups (5 Nov 2026 afternoon, OPEN-OWNER-QUESTIONS-2026-11-04.md "Your answers"):
 *  - The page behind the account menu's "My questions" is renamed "My questions" (its heading, so its tab title too), and
 *    the first screen's link to it becomes "All my questions" (both the owner's words).
 * And, not one of the owner's answers: V4Header takes an optional onBrandClick, called when the brand link is pressed (the
 * start-step session asked for it and will pass it); without it the brand is the plain link to /v4 it always was.
 * Made-up texts only.
 */
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie-session",
  validateSession: async () => undefined,
  contractClient: {
    getBillingUsage: async () => ({ plan_id: "PLUS", windows: [{ scope: "PERSON_DAY", percent: 15, resets_at: "2026-12-01T00:00:00.000Z" }] }),
    readReadingLevel: async () => ({ reading_level: null }),
    saveReadingLevel: async () => ({ reading_level: null }),
    readSession: async () => ({ session_id: "synthetic" }),
    readAccountEmail: async () => ({ email: "maria@example.com", recovery_email: null, pending: null }),
    logout: async () => undefined,
    revokeAllSessions: async () => ({ revoked: 0 })
  }
}));
// The list behind a gate that lets the person in at once (the gate has its own tests).
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: (marker: string) => React.ReactNode }) => children("cookie-session") }));
const MAP = "33333333-3333-4333-8333-333333333333";
vi.mock("@/lib/v4/mapShelf", async (original) => ({
  ...(await original<typeof import("../../apps/ui/lib/v4/mapShelf.js")>()),
  readMapShelf: async () => ({
    maps: [{ runId: MAP, question: "Should the town plant more trees?", state: "READY", pause: null, startedAt: null, bar: null, changed: false, digs: [] }],
    more: false,
    anyRows: true
  })
}));

import { DocumentTitle } from "../../apps/ui/components/DocumentTitle.js";
import { V4Header } from "../../apps/ui/components/v4/V4Header.js";
import { V4AllMaps } from "../../apps/ui/components/v4/V4AllMaps.js";
import { V4MapShelf } from "../../apps/ui/components/v4/V4MapShelf.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.replaceChildren();
});

async function mount(element: React.ReactElement): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => {
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
  });
  return host;
}

describe("the third round: the page behind 'My questions' is called 'My questions'", () => {
  it("its heading, and so its tab title, read 'My questions'", async () => {
    window.history.replaceState(null, "", "/v4?maps=all");
    const page = await mount(
      <>
        <main id="main-content"><V4AllMaps catalog={CATALOG} newDebateCatalog={{}} locale="en" /></main>
        <DocumentTitle brand="Dialectical Engine" />
      </>
    );
    expect(page.querySelector("h1")!.textContent).toBe("My questions");
    // DocumentTitle names the tab after the page's h1 on its next turn.
    await act(async () => { await new Promise((done) => setTimeout(done, 5)); });
    expect(document.title).toBe("My questions — Dialectical Engine");
  });

  it("the first screen's list has the same name, and its link to the page reads 'All my questions'", async () => {
    const shelf = await mount(
      <V4MapShelf
        load={{ status: "READ", read: { maps: [{ runId: MAP, question: "Q", state: "READY", pause: null, startedAt: null, bar: null, changed: false, digs: [] }], more: false, anyRows: true } }}
        catalog={CATALOG} locale="en"
      />
    );
    expect(shelf.querySelector("h2")!.textContent).toBe("My questions");
    const all = shelf.querySelector<HTMLAnchorElement>(".v4ShelfAll")!;
    expect(all.textContent).toBe("All my questions");
    expect(all.getAttribute("href")).toBe("/v4?maps=all");
    expect(shelf.textContent).not.toMatch(/\b(?:Your|All my) maps\b/u);
  });
});

describe("V4Header's optional onBrandClick (asked for by the start-step session, not one of the owner's answers)", () => {
  // What the browser does with the click once React and the Link have seen it: a listener on the document runs after them
  // (React listens on its root, inside the document), reads whether the click was kept from going ahead, then stops jsdom's
  // own navigation, which it does not implement.
  const prevented: boolean[] = [];
  const settleClick = (event: Event): void => {
    prevented.push(event.defaultPrevented);
    event.preventDefault();
  };
  async function pressBrand(onBrandClick?: (event: MouseEvent<HTMLAnchorElement>) => void): Promise<boolean> {
    window.history.replaceState(null, "", "/v4/debate/made-up");
    const page = await mount(
      <V4Header catalog={CATALOG} showQuota={false} session="OUT" {...(onBrandClick === undefined ? {} : { onBrandClick })} />
    );
    const brand = page.querySelector<HTMLAnchorElement>("a.v4HdrBrand")!;
    expect(brand.getAttribute("href")).toBe("/v4");
    prevented.length = 0;
    document.addEventListener("click", settleClick);
    try {
      await act(async () => brand.click());
    } finally {
      document.removeEventListener("click", settleClick);
    }
    expect(prevented).toHaveLength(1);
    return prevented[0]!;
  }

  it("is called with the brand link's click, before the link is followed; a handler that prevents it keeps the page where it is", async () => {
    const seen: string[] = [];
    const kept = await pressBrand((event) => {
      seen.push(event.currentTarget.getAttribute("href") ?? "");
      event.preventDefault();
    });
    expect(seen).toEqual(["/v4"]);
    expect(kept).toBe(true);
  });

  it("a handler that does not prevent it lets the click go ahead to /v4", async () => {
    const seen: string[] = [];
    const kept = await pressBrand((event) => { seen.push(event.type); });
    expect(seen).toEqual(["click"]);
    expect(kept).toBe(false);
  });

  it("without it the brand is the plain link to /v4, as before: nothing keeps the click from going ahead", async () => {
    expect(await pressBrand()).toBe(false);
  });
});
