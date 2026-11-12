// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

/*
 * Keyboard audit, 12 Nov 2026, wave 2 (V4A-12): "My questions" under the site's focus guard. "Show more" is switched off
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
// KBD_NO_GUARD=1 runs the same steps without the guard, to see the loss the audit found.
const guarded = process.env.KBD_NO_GUARD !== "1";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  shelf.reads = [];
  stop = guarded ? startFocusGuard() : installFocusFixup();
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

describe("'My questions' under the focus guard (V4A-12)", () => {
  it("Show more: once the next 20 are read, focus is on the first new card (more still to come)", async () => {
    await mount();
    await answer(true);
    expect(cards()).toHaveLength(20);
    pressByKeyboard(buttonNamed("Show more")!);
    await guardSettled();
    expect(buttonNamed("Show more")!.disabled, "switched off while it reads").toBe(true);
    await answer(true);
    await guardSettled();
    expect(cards()).toHaveLength(40);
    expect(document.activeElement).toBe(cards()[20]);
  });

  it("Show more: when nothing more is left the button goes, and focus is on the first new card", async () => {
    await mount();
    await answer(true);
    pressByKeyboard(buttonNamed("Show more")!);
    await answer(false);
    await guardSettled();
    expect(buttonNamed("Show more")).toBeUndefined();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(cards()[20]);
  });

  it("Show more that fails keeps the cards; focus comes back to Show more", async () => {
    await mount();
    await answer(true);
    pressByKeyboard(buttonNamed("Show more")!);
    await act(async () => { shelf.reads.at(-1)!.fail(); });
    await flush();
    await guardSettled();
    expect(cards()).toHaveLength(20);
    expect(document.activeElement).toBe(buttonNamed("Show more"));
  });

  it("Retry: the failed line goes; focus is kept on the page's list area, and the next Tab stop is the first card", async () => {
    await mount();
    await act(async () => { shelf.reads.at(-1)!.fail(); });
    await flush();
    pressByKeyboard(buttonNamed("Try again")!);
    await guardSettled();
    const area = document.querySelector<HTMLElement>(".v4MapsMain")!;
    expect(document.activeElement).toBe(area);
    await answer(false);
    await guardSettled();
    expect(document.activeElement, "the read landing does not move focus").toBe(area);
    // The area holds nothing focusable before the cards: the next Tab is the first card.
    const first = area.querySelector<HTMLElement>("a, button");
    expect(first).toBe(cards()[0]);
  });
});
