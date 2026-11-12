// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startFocusGuard } from "./kbd-guard-harness";

/*
 * Keyboard audit, 12 Nov 2026, wave 3 fix round (A10), on the stand-ins of kbd-r2-w2v4a-all-maps.test.tsx: the rendered
 * "My questions" page has exactly one `#page-content` (the skip link's landing), focusable from script only, in each state
 * the stand-ins reach. Wave 2 (V4A-12): "My questions" under the site's focus guard. "Show more" is switched off
 * while it reads and may go once nothing more is left; "Retry" goes with its failed line. The page, its list and the guard
 * are the real ones; the shelf read is stood in (made-up maps only), as in v4-third-round.test.tsx.
 */
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie-session",
  validateSession: async () => undefined,
  contractClient: {
    getBillingUsage: async () => ({ plan_id: "PLUS", windows: [] }),
    readReadingLevel: async () => ({ reading_level: null }),
    saveReadingLevel: async () => ({ reading_level: null }),
    readSession: async () => ({ session_id: "synthetic" }),
    readAccountEmail: async () => ({ email: "maria@example.com", recovery_email: null, pending: null }),
    logout: async () => undefined,
    revokeAllSessions: async () => ({ revoked: 0 })
  }
}));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: (marker: string) => React.ReactNode }) => children("cookie-session") }));
vi.mock("@/components/v4/V4QuotaPill", () => ({ V4QuotaPill: () => null }));
vi.mock("@/components/v4/V4AccountMenu", () => ({ V4AccountMenu: () => null }));

type Read = { want: number; answer: (more: boolean) => void; fail: () => void };
const shelf = vi.hoisted(() => ({ reads: [] as Read[] }));
const mapOf = (n: number) => ({
  runId: `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`, question: `Made-up question ${n}?`,
  state: "READY", pause: null, startedAt: null, bar: null, changed: false, digs: []
});
vi.mock("@/lib/v4/mapShelf", async (original) => ({
  ...(await original<typeof import("../../apps/ui/lib/v4/mapShelf.js")>()),
  readMapShelf: (want: number) => new Promise((resolveRead, rejectRead) => {
    shelf.reads.push({
      want,
      answer: (more) => resolveRead({ maps: Array.from({ length: want }, (_, at) => mapOf(at + 1)), more, anyRows: true }),
      fail: () => rejectRead(new Error("made-up failure"))
    });
  })
}));

import { V4AllMaps } from "../../apps/ui/components/v4/V4AllMaps.js";

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;

let root: Root | null = null;
let stop: () => void = () => undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  shelf.reads = [];
  stop = startFocusGuard();
});
afterEach(async () => {
  stop();
  stop = () => undefined;
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function flush(): Promise<void> {
  await act(async () => { for (let turn = 0; turn < 10; turn += 1) await Promise.resolve(); });
}

async function mount(): Promise<void> {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => root!.render(<V4AllMaps catalog={CATALOG} newDebateCatalog={{}} locale="en" />));
  await flush();
}

async function answer(more: boolean): Promise<void> {
  await act(async () => { shelf.reads.at(-1)!.answer(more); });
  await flush();
}

const buttonNamed = (name: string): HTMLButtonElement | undefined =>
  [...document.querySelectorAll("button")].find((one) => one.textContent?.trim() === name);
const cards = (): HTMLAnchorElement[] => [...document.querySelectorAll<HTMLAnchorElement>("a.v4ShelfCard")];

function oneMark(): HTMLElement {
  const all = [...document.querySelectorAll<HTMLElement>("#page-content")];
  expect(all, "one #page-content in the rendered page").toHaveLength(1);
  expect(all[0]!.getAttribute("tabindex")).toBe("-1");
  return all[0]!;
}

describe("'My questions' marks where its content starts, once (A10)", () => {
  it("while the list is read, once it is read, and after Show more", async () => {
    await mount();
    const reading = oneMark();
    expect(reading.classList.contains("v4MapsMain")).toBe(true);
    await answer(true);
    expect(cards()).toHaveLength(20);
    expect(oneMark()).toBe(reading);
    await act(async () => buttonNamed("Show more")!.click());
    await answer(false);
    expect(cards()).toHaveLength(40);
    expect(oneMark()).toBe(reading);
  });

  it("when the list could not be read", async () => {
    await mount();
    await act(async () => { shelf.reads.at(-1)!.fail(); });
    await flush();
    expect(buttonNamed("Try again")).toBeDefined();
    oneMark();
  });
});
