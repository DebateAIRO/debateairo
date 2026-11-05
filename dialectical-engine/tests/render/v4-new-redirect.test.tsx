// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * V4 start step, Task 78 (spec 2026-11-03 §4.5 "The classic view"; decision record: V4 replaces V3): `/new` redirects
 * to `/v4`, a topic handed in by a link going along (`/v4?topic=…`, the first one, cut at 4000 like the ask page's own
 * cut); "Open in the classic view" leaves the ask page; old debates' classic pages still open, and a debate's page still
 * offers its classic view.
 */
const gate = vi.hoisted(() => ({ session: "IN" as "IN" | "OUT" }));
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: string) => ReactNode }) => children(gate.session) }));
vi.mock("@/components/billing/RoomNotice", () => ({ RoomNotice: () => null }));
vi.mock("@/lib/v4/useV4Ask", () => ({
  useV4Ask: () => ({
    planTier: "premium", freePublicNotice: false, room: null, submitting: false, dialogs: null,
    submit: async () => ({ kind: "STOPPED" }), ensureConsent: async () => true, flagsCrisis: () => false
  })
}));
// The real header and its real account menu draw here; only the reads behind them are stood in (the classic debate
// page's own module imports the rest of this file, so the real one is kept under the stand-ins).
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/api.js")>()),
  validateSession: async () => undefined,
  contractClient: {
    readAnswerIndex: async () => ({ items: [], open_runs: [], limit: 32, offset: 0, total: 0 }),
    readDigLinks: async () => ({ parent: null, children: [] }),
    readReadingLevel: async () => ({ reading_level: null }),
    saveReadingLevel: async () => ({ reading_level: "plain" }),
    clarifyAsk: async () => ({ source: "NONE" }),
    readSession: async () => ({ session_id: "synthetic" }),
    readAccountEmail: async () => ({ email: "maria@example.com", recovery_email: null, pending: null }),
    getBillingUsage: async () => { throw new Error("404: billing off"); },
    logout: async () => undefined,
    revokeAllSessions: async () => ({ revoked: 0 })
  }
}));

import NewDebatePage from "../../apps/ui/app/new/page.js";
import V4AskPage from "../../apps/ui/app/v4/page.js";
import DebatePage from "../../apps/ui/app/debate/[id]/page.js";
import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";
import { V4Header } from "../../apps/ui/components/v4/V4Header.js";
import { readNotFoundCalls, readRedirects, resetNotFoundCalls, resetRedirects } from "./stubs/next-navigation.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
const CLASSIC = CATALOG["v4.common.classicView"]!;
const RUN_ID = "11111111-1111-4111-8111-111111111111";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle(): Promise<void> {
  await act(async () => { for (let turn = 0; turn < 8; turn += 1) await Promise.resolve(); });
}

async function mount(element: React.ReactElement): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await settle();
  return host;
}

/** Opens the header's round account button and returns the menu's items. */
async function menuItems(page: HTMLElement): Promise<HTMLElement[]> {
  const button = page.querySelector<HTMLButtonElement>(".v4HdrAccountButton");
  expect(button).not.toBeNull();
  await act(async () => button!.click());
  const menu = document.querySelector<HTMLElement>("[role=menu]");
  expect(menu).not.toBeNull();
  return [...menu!.querySelectorAll<HTMLElement>("[role=menuitem]")];
}

beforeEach(() => {
  gate.session = "IN";
  resetRedirects();
  resetNotFoundCalls();
  window.history.replaceState(null, "", "/v4");
});
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.replaceChildren();
});

describe("/new goes to /v4 (V4 replaces V3)", () => {
  it("with no topic, to the ask page itself", async () => {
    await expect(NewDebatePage({})).rejects.toThrow("NEXT_REDIRECT");
    expect(readRedirects()).toEqual(["/v4"]);
  });

  it("with a topic, the topic goes along, written for the address", async () => {
    await expect(NewDebatePage({ searchParams: Promise.resolve({ topic: "Trams & buses?" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(readRedirects()).toEqual(["/v4?topic=Trams%20%26%20buses%3F"]);
  });

  it("a repeated topic keeps its first value, and an empty one carries nothing", async () => {
    await expect(NewDebatePage({ searchParams: Promise.resolve({ topic: ["Trams?", "Buses?"] }) })).rejects.toThrow("NEXT_REDIRECT");
    await expect(NewDebatePage({ searchParams: Promise.resolve({ topic: "" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(readRedirects()).toEqual(["/v4?topic=Trams%3F", "/v4"]);
  });

  it("a topic longer than the ask page takes is cut at 4000, never refused", async () => {
    await expect(NewDebatePage({ searchParams: Promise.resolve({ topic: `${"a".repeat(4000)}TAIL` }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(readRedirects()).toEqual([`/v4?topic=${"a".repeat(4000)}`]);
  });

  it("a cut through a character written in two halves (an emoji) drops the half, so the address can still be written", async () => {
    await expect(NewDebatePage({ searchParams: Promise.resolve({ topic: `${"a".repeat(3999)}🚋 trams` }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(readRedirects()).toEqual([`/v4?topic=${"a".repeat(3999)}`]);
  });
});

// Review of Task 78 (5 Nov): the topic goes along only if the ask page reads it back. The landing page's question box
// sends `/new?topic=…`, so the ask page itself (app/v4/page.tsx) is handed what the address it was sent to holds, as
// Next hands a page its query, and its box must start with the same words (Romanian, 3-byte script, the cut, an emoji).
describe("the ask page starts with the words /new carried", () => {
  it.each([
    ["Trams & buses?", "Trams & buses?"],
    ["Tramvaiul e mai bun? 50% + 1 = majoritate, ș/ț și #hashtag", "Tramvaiul e mai bun? 50% + 1 = majoritate, ș/ț și #hashtag"],
    ["中".repeat(4001), "中".repeat(4000)],
    [`${"a".repeat(3999)}🚋 trams`, "a".repeat(3999)]
  ])("topic %#", async (topic, expected) => {
    await expect(NewDebatePage({ searchParams: Promise.resolve({ topic }) })).rejects.toThrow("NEXT_REDIRECT");
    const [address] = readRedirects();
    const url = new URL(address!, "https://ask.example.invalid");
    expect(url.pathname).toBe("/v4");
    expect(url.searchParams.getAll("topic")).toHaveLength(1);
    const element = await V4AskPage({ searchParams: Promise.resolve({ topic: url.searchParams.get("topic")! }) });
    expect((element.props as { initialQuestion?: unknown }).initialQuestion).toBe(expected);
  });
});

describe("Open in the classic view leaves the ask page", () => {
  it("the ask page's account menu has no classic view, and nothing on the page links to it", async () => {
    const page = await mount(
      <V4AskClient catalog={CATALOG} homeCatalog={messages("home")} newDebateCatalog={messages("newDebate")} billingCatalog={{}}
        locale="en" crisisCountryHint={null} initialQuestion="Should the city fund the tram line?" initialLevel="plain" />
    );
    const items = await menuItems(page);
    // The menu is the real one, open (Sign out is in it), and it holds no classic view.
    expect(items.map((item) => item.textContent)).toContain(CATALOG["v4.header.menu.signOut"]);
    expect(items.map((item) => item.textContent)).not.toContain(CLASSIC);
    expect(document.querySelector("[data-v4-menu=classic]")).toBeNull();
    const links = [...document.querySelectorAll<HTMLAnchorElement>("a")];
    expect(links.length).toBeGreaterThan(0);
    expect(links.filter((link) => link.textContent === CLASSIC)).toEqual([]);
    expect(links.filter((link) => /^\/(?:new|debate\/)/u.test(link.getAttribute("href") ?? ""))).toEqual([]);
  });
});

describe("old debates keep their classic view", () => {
  it("the same header, handed a debate's classic address as a debate's page hands it, still offers it in its menu", async () => {
    const page = await mount(<V4Header catalog={CATALOG} readingLevel="plain" classicHref={`/debate/${RUN_ID}`} session="IN" />);
    const classic = (await menuItems(page)).filter((item) => item.textContent === CLASSIC);
    expect(classic.map((item) => item.getAttribute("href"))).toEqual([`/debate/${RUN_ID}`]);
  });

  it("an old debate's classic page still opens: no redirect, no not-found", async () => {
    const element = await DebatePage({ params: Promise.resolve({ id: RUN_ID }), searchParams: Promise.resolve({ starting: "1" }) });
    expect(element).not.toBeNull();
    expect(readRedirects()).toEqual([]);
    expect(readNotFoundCalls()).toBe(0);
  });
});
