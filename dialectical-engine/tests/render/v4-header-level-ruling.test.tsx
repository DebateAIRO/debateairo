// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The owner's answers of 5 Nov 2026 (OPEN-OWNER-QUESTIONS-2026-11-04.md, question 15 and its follow-ups), the header side:
 *  - The reading level is chosen only when asking and is kept for that debate, its digs and its report: no level menu and
 *    no "Plain words" label in any header (the V4 header, the report's header, All my maps), All my maps no longer reads
 *    the account's level, and no link of the header, the account menu, the shelf or All my maps carries a level.
 *  - Question 15 (with its follow-ups): on a phone the header is one row: the brand's mark (its name hidden on screen but
 *    still the link's name), the quota circle, the round account button. jsdom draws no layout, so the row's rules are read
 *    from the stylesheet here, and the browser check at 320 and 375 px looks at the row itself.
 *  - Not built here: question 18 A and the second follow-up (on a phone the top bar drops "Write my report" or "See my
 *    report" whenever the bottom bar shows it). The map's report item is the start-step session's (V4DebateClient,
 *    V4BottomStack); until it lands a phone at a good moment still shows the map's report button in this row too.
 *  - Not built here either: the ask page's level choice for every question (V4AskClient, the start-step session's). Until
 *    it lands, a person whose account already holds a level is offered no level choice anywhere.
 */
const LEVEL_WORDS = /Plain words|Some background|Expert|How much detail/u;
const server = vi.hoisted(() => ({ levelReads: 0, levelSaves: 0 }));
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie-session",
  validateSession: async () => undefined,
  contractClient: {
    getBillingUsage: async () => ({ plan_id: "PLUS", windows: [{ scope: "PERSON_DAY", percent: 15, resets_at: "2026-12-01T00:00:00.000Z" }] }),
    // The account remembers "Expert": a page that still read it would show it, and carry it on its links.
    readReadingLevel: async () => { server.levelReads += 1; return { reading_level: "expert" }; },
    saveReadingLevel: async () => { server.levelSaves += 1; return { reading_level: "expert" }; },
    readSession: async () => ({ session_id: "synthetic" }),
    readAccountEmail: async () => ({ email: "maria@example.com", recovery_email: null, pending: null }),
    logout: async () => undefined,
    revokeAllSessions: async () => ({ revoked: 0 })
  }
}));
// All my maps behind a gate that lets the person in at once (the gate has its own tests).
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: (marker: string) => React.ReactNode }) => children("cookie-session") }));
const MAP = "11111111-1111-4111-8111-111111111111";
const DIG = "22222222-2222-4222-8222-222222222222";
vi.mock("@/lib/v4/mapShelf", async (original) => ({
  ...(await original<typeof import("../../apps/ui/lib/v4/mapShelf.js")>()),
  readMapShelf: async () => ({
    maps: [{
      runId: MAP, question: "Should the city fund the tram line?", state: "READY", pause: null, startedAt: null, bar: null, changed: false,
      digs: [{ runId: DIG, pick: "Fares cover running costs.", more: false, state: "READY", pause: null }]
    }],
    more: false,
    anyRows: true
  })
}));

import { V4Header } from "../../apps/ui/components/v4/V4Header.js";
import { V4ReportHeader } from "../../apps/ui/components/v4/V4ReportHeader.js";
import { V4AllMaps } from "../../apps/ui/components/v4/V4AllMaps.js";
import { V4MapShelf, allMapsHref } from "../../apps/ui/components/v4/V4MapShelf.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
beforeEach(() => {
  server.levelReads = 0;
  server.levelSaves = 0;
  window.history.replaceState(null, "", `/v4/debate/${MAP}?level=expert`);
});
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

/** Every link on the page, with any level it carries. */
const hrefs = (page: ParentNode): string[] => [...page.querySelectorAll<HTMLAnchorElement>("a[href]")].map((link) => link.getAttribute("href")!);

describe("the reading-level ruling (5 Nov): no level in any header, and no link carries one", () => {
  it("the V4 header draws no level menu or label even when a page hands it a level, and its links carry none", async () => {
    const chosen: string[] = [];
    const page = await mount(
      <V4Header catalog={CATALOG} readingLevel="expert" linkLevel="expert" onReadingLevel={(level) => chosen.push(level)} session="IN" />
    );
    const header = page.querySelector("header.v4Hdr")!;
    // Its only controls are the circle and the round account button: no level menu or label of any kind.
    expect([...header.querySelectorAll("button")].map((button) => button.className)).toEqual(["v4HdrQuotaCircle", "v4HdrAccountButton"]);
    expect(header.textContent).not.toMatch(LEVEL_WORDS);
    expect([...header.querySelectorAll("[aria-label]")].map((node) => node.getAttribute("aria-label")).join(" ")).not.toMatch(LEVEL_WORDS);
    // The row holds the quota circle and the round account button, nothing else.
    expect([...header.querySelector(".v4HdrRight")!.children].map((child) => child.className)).toEqual(["v4HdrQuota", "v4HdrAccount"]);
    expect(header.querySelector("a.v4HdrBrand")!.getAttribute("href")).toBe("/v4");
    // The account menu's links too (the menu opens outside the header's own box).
    await act(async () => header.querySelector<HTMLButtonElement>(".v4HdrAccountButton")!.click());
    expect(document.querySelector("[role=menu]")).not.toBeNull();
    expect(hrefs(document).filter((href) => href.includes("level="))).toEqual([]);
    expect(hrefs(document)).toContain("/v4?maps=all");
    expect(chosen).toEqual([]);
  });

  it("the report's header has no level menu (only Back and the account button here), whatever level the page holds", async () => {
    const chosen: string[] = [];
    const page = await mount(
      <V4ReportHeader catalog={CATALOG} backHref={`/v4/debate/${MAP}`} level="expert" onLevel={(level) => chosen.push(level)} share={[]} status={null} />
    );
    const row = page.querySelector(".v4RepHdr")!;
    expect([...row.children].map((child) => child.className)).toEqual(["v4RepHdrBack", "v4HdrAccount"]);
    expect(row.querySelector(".v4RepLevel, [aria-pressed]")).toBeNull();
    expect(row.textContent).not.toMatch(LEVEL_WORDS);
    expect(chosen).toEqual([]);
  });

  it("All my maps has no level menu, never reads the account's level, and its links carry none", async () => {
    window.history.replaceState(null, "", "/v4?maps=all");
    const page = await mount(<V4AllMaps catalog={CATALOG} newDebateCatalog={{}} locale="en" initialLevel={null} />);
    expect(page.querySelector(".v4ShelfCard")).not.toBeNull();
    expect(server.levelReads).toBe(0);
    expect(server.levelSaves).toBe(0);
    // Its header's only control is the round account button: no level menu or label of any kind.
    expect([...page.querySelectorAll("header.v4Hdr button")].map((button) => button.className)).toEqual(["v4HdrAccountButton"]);
    expect(page.querySelector("header.v4Hdr")!.textContent).not.toMatch(LEVEL_WORDS);
    // journey-f19: no quota on All my maps.
    expect(page.querySelector(".v4HdrQuotaCircle, .v4HdrQuotaHold")).toBeNull();
    expect(hrefs(page)).toEqual(["/v4", `/v4/debate/${MAP}`, `/v4/debate/${DIG}`]);
  });

  it("a level handed to All my maps or to the ask page's shelf goes on none of their links", async () => {
    const page = await mount(<V4AllMaps catalog={CATALOG} newDebateCatalog={{}} locale="en" initialLevel="expert" />);
    expect(hrefs(page).filter((href) => href.includes("level="))).toEqual([]);
    await act(async () => root!.unmount());
    root = null;
    const shelf = await mount(
      <V4MapShelf
        load={{ status: "READ", read: { maps: [{ runId: MAP, question: "Q", state: "READY", pause: null, startedAt: null, bar: null, changed: false, digs: [] }], more: false, anyRows: true } }}
        catalog={CATALOG} locale="en" level="expert"
      />
    );
    expect(hrefs(shelf)).toEqual([`/v4/debate/${MAP}`, "/v4?maps=all"]);
    expect(allMapsHref("expert")).toBe("/v4?maps=all");
  });
});

describe("question 15 (5 Nov): the phone header is one row", () => {
  const base = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-base.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
  const phoneAt = base.indexOf("@media (max-width: 767px)");
  const phone = base.slice(phoneAt);
  /** The declarations of the phone rule whose selector list is exactly `selector`. */
  const rule = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const found = new RegExp(`${escaped} \\{([^}]*)\\}`, "u").exec(phone);
    expect(found, selector).not.toBeNull();
    return found![1]!;
  };

  it("on a phone the brand's name and badge are hidden on screen, the mark stays, and the row's controls never wrap to a second row", () => {
    expect(phoneAt).toBeGreaterThan(-1);
    expect(rule(".v4Hdr .v4HdrName, .v4Hdr .v4HdrBadge")).toMatch(/position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect\(0 0 0 0\);/u);
    expect(rule(".v4Hdr .v4HdrBrand")).toMatch(/flex: none;[\s\S]*min-inline-size: 44px;/u);
    expect(rule(".v4Hdr .v4HdrRight")).toMatch(/flex: 1 1 0; min-inline-size: 0; flex-wrap: nowrap;/u);
    // The mark itself is never hidden, and the circle is the same at every size (no phone rule for it).
    expect(phone).not.toMatch(/\.v4HdrMark|\.v4HdrQuota/u);
  });

  it("the brand link keeps its whole name for screen readers ('Dialectical Engine V4 preview') and goes to /v4", async () => {
    const page = await mount(<V4Header catalog={CATALOG} session="OUT" />);
    const brand = page.querySelector<HTMLAnchorElement>("a.v4HdrBrand")!;
    expect(brand.textContent).toBe(`Dialectical Engine ${CATALOG["v4.brand.badge"]}`);
    expect(brand.querySelector(".v4HdrMark")!.getAttribute("aria-hidden")).toBe("true");
    expect(brand.getAttribute("href")).toBe("/v4");
    // One row of controls: the brand, then the circle's place and the account's (signed out: no circle, Sign in).
    const header = page.querySelector("header.v4Hdr")!;
    expect([...header.children].map((child) => child.className)).toEqual(["v4HdrBrand", "v4HdrRight"]);
  });
});
