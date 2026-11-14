// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG, resetHarness, settle } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Keyboard audit 2026-11-12, wave 3 (V4B-M4): browser zoom (or a window resize) across 1440 / 1100 / 768 swaps the map for
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

describe("the map page across a breakpoint (V4B-M4)", () => {
  it("the first look at a narrow window moves no focus (the layout is read once mounted)", async () => {
    await mountAt(800);
    expect(document.querySelector(".v4DebMapCol .v4Out [data-row]"), "the outline is drawn").not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("a card focused on the wide map: at the tablet's width focus is on that same item in the outline", async () => {
    const page = await mountAt(1600);
    const card = page.querySelector<HTMLElement>(".v4DebMapCol [data-row^='path:']")!;
    const id = rowId(card);
    expect(id, "a path card on the tree").toBeTruthy();
    focusByKeyboard(card);
    await resize(800);
    expect(page.querySelector(".v4DebMapCol .v4MapBranch"), "the tree is gone").toBeNull();
    const focused = document.activeElement;
    expect(focused?.closest(".v4DebMapCol"), "focus is in the outline").not.toBeNull();
    expect(rowId(focused)).toBe(id);
  });

  it("the question's card focused at the tablet's width: back on the wide map, focus is on the question's card", async () => {
    const page = await mountAt(800);
    const root = page.querySelector<HTMLElement>(".v4DebMapCol [data-row^='root']")!;
    focusByKeyboard(root);
    await resize(1600);
    expect(document.activeElement).toBe(page.querySelector(".v4DebMapCol .v4MapRoot"));
  });

  it("to the phone, which has no map in the page: focus is on the panel's heading", async () => {
    const page = await mountAt(1600);
    focusByKeyboard(page.querySelector<HTMLElement>(".v4DebMapCol [data-row^='path:']")!);
    await resize(375);
    expect(page.querySelector(".v4DebMapCol")).toBeNull();
    expect(document.activeElement?.closest(".v4DebPanelCol"), "focus is in the panel").not.toBeNull();
    expect(document.activeElement?.matches("h1, h2, h3, [tabindex='-1']")).toBe(true);
  });

  it("nothing focused before the change (a pointer user reading): no focus is moved", async () => {
    await mountAt(1600);
    await resize(800);
    expect(document.activeElement).toBe(document.body);
  });

  it("focus somewhere that survives the change stays where it is", async () => {
    const page = await mountAt(1600);
    const brand = document.createElement("button");
    brand.textContent = "Elsewhere";
    page.prepend(brand);
    focusByKeyboard(brand);
    await resize(800);
    expect(document.activeElement).toBe(brand);
  });

  // Wave-3 fix round (A6): inside the area the rule acts on (the panel), a control that survives the change keeps focus;
  // without the "nothing holds focus" check the rule would send it to the map's open card.
  it("focus on a panel control that survives the change stays on it", async () => {
    const page = await mountAt(1600);
    const panelRow = page.querySelector<HTMLElement>(".v4DebPanelCol .v4PanelRowBtn")!;
    expect(panelRow, "the panel draws a row button").not.toBeNull();
    focusByKeyboard(panelRow);
    await resize(1280);
    expect(panelRow.isConnected, "the panel's row is the same element after the change").toBe(true);
    expect(document.activeElement).toBe(panelRow);
  });
});
