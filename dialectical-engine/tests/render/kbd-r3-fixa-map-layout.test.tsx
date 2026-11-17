// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FOCUS_GUARD_SETTLE_MS } from "../../apps/ui/lib/focusGuard.js";
import { startFocusGuard } from "./kbd-guard-harness.js";
import { advance, CATALOG, resetHarness, settle } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Keyboard audit 2026-11-12, wave 3 fix round (A6), on the harness of kbd-r3-k2-map-layout.test.tsx. Wave 3 (V4B-M4): browser zoom (or a window resize) across 1440 / 1100 / 768 swaps the map for
 * the folded tree, the outline or the phone layout, and the focused card went with it. When the layout changes under a
 * keyboard user's focus in the map area, focus goes to the same item in the new layout (else the open item, else the panel
 * heading); never when focus is somewhere real, never on the first look, never for a person who had nothing focused there.
 * The page is the real V4DebateClient with the harness's stand-in reads; the window's width is a stand-in whose changes
 * the page hears as a browser's media queries.
 */

type Width = 375 | 800 | 1280 | 1600;
let width: Width = 1600;
const listeners = new Set<() => void>();

function stubMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const max = Number(/max-width:\s*(\d+)px/u.exec(query)?.[1] ?? "0");
      return {
        get matches() { return width <= max; },
        media: query,
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener)
      };
    }
  });
}

/** The window crosses a breakpoint: every query hears it, as a browser's do. */
async function resize(to: Width): Promise<void> {
  width = to;
  await act(async () => { for (const listener of [...listeners]) listener(); });
  await settle();
}

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mountAt(start: Width): Promise<HTMLElement> {
  width = start;
  stubMedia();
  const runId = crypto.randomUUID();
  window.history.replaceState(null, "", `/v4/debate/${runId}`);
  const { V4DebateClient } = await import("../../apps/ui/components/v4/V4DebateClient.js");
  host = document.createElement("main");
  host.id = "main-content";
  host.tabIndex = -1;
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(
    <V4DebateClient id={runId} initialPath={null} initialLevel="background" catalog={CATALOG} homeCatalog={{}} newDebateCatalog={{}}
      billingCatalog={{}} locale="en" crisisCountryHint={null} />
  ));
  await settle();
  return host;
}

/** A keyboard user's focus on a control: focus first, as Tab and the arrows put it. */
function focusByKeyboard(element: HTMLElement): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    element.focus();
  });
}

const rowId = (element: Element | null): string | undefined => element?.getAttribute("data-row")?.split("@")[0];

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  listeners.clear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe("the layout-change rule acts only for the parts the other layout has too (A6)", () => {
  it("mid width, focus on the rail strip's link; to the laptop's width the strip goes: focus is not sent to the map's card", async () => {
    const stopGuard = startFocusGuard();
    try {
      const page = await mountAt(800);
      const link = page.querySelector<HTMLElement>(".v4DebBehind .v4DebRail-strip a[href]")!;
      expect(link, "the mid layout's strip draws a link").not.toBeNull();
      focusByKeyboard(link);
      await resize(1280);
      expect(page.querySelector(".v4DebRail-strip"), "the strip is gone").toBeNull();
      await advance(FOCUS_GUARD_SETTLE_MS + 20);
      await settle();
      // The person was in the strip, not on a card: the site's focus guard keeps the place, the map rule does not jump.
      expect(document.activeElement?.closest(".v4DebMapCol"), "focus was not sent into the map").toBeNull();
      expect(document.activeElement).not.toBe(page.querySelector(".v4DebMapCol [aria-current='true']"));
    } finally {
      stopGuard();
    }
  });

  it("a card focused on the wide map still goes to the same item at the tablet's width (the rule still acts for rows)", async () => {
    const page = await mountAt(1600);
    const card = page.querySelector<HTMLElement>(".v4DebMapCol [data-row^='path:']")!;
    focusByKeyboard(card);
    await resize(800);
    expect(document.activeElement?.closest(".v4DebMapCol .v4Out")).not.toBeNull();
  });
});

describe("the map page marks where its content starts, once, in every layout (A10)", () => {
  it.each([1600, 1280, 800, 375] as const)("at %ipx, and after a change across a breakpoint", async (at) => {
    const page = await mountAt(at);
    const marks = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>("#page-content")];
    expect(marks(), "one #page-content in the rendered page").toHaveLength(1);
    expect(marks()[0]!.getAttribute("tabindex")).toBe("-1");
    expect(marks()[0]!.classList.contains("v4DebMain")).toBe(true);
    expect(page.querySelector(".v4DebMapCol, .v4DebPanelCol"), "the map screen is drawn").not.toBeNull();
    await resize(at === 1600 ? 800 : 1600);
    expect(marks()).toHaveLength(1);
    expect(marks()[0]!.getAttribute("tabindex")).toBe("-1");
  });
});
