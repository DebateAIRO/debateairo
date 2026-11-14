// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG, mountMap, page, resetHarness, settle, unmountMap } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Keyboard audit round 4 (2026-11-12), B6: the map's end-side fade (map-f22's `v4MapScrollMore`, a 48 px mask) shows only
 * while more of the map lies past the box's end. Scrolled to the end, a focused card in the last column, and its ring, are
 * wholly clear of it, in both directions; the hint line ("the map goes on") stays while the map is wider than its box. The
 * canvas has room past its last column for the whole ring (3 px ink + 2 px offset). jsdom does no layout: the box's sizes
 * are set by hand, and a painted browser is measured as the report says.
 */

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  vi.stubGlobal("ResizeObserver", class {
    observe(): void {}
    disconnect(): void {}
  });
});

afterEach(async () => {
  await unmountMap();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const box = (): HTMLElement => page().querySelector<HTMLElement>(".v4MapScroll")!;

/** The box is 600 px wide over a 1000 px map, scrolled to `left` (negative toward the end on a right-to-left page). */
async function sized(left: number): Promise<void> {
  const element = box();
  Object.defineProperty(element, "scrollWidth", { configurable: true, value: 1000 });
  Object.defineProperty(element, "clientWidth", { configurable: true, value: 600 });
  Object.defineProperty(element, "scrollLeft", { configurable: true, value: left });
  act(() => {
    element.dispatchEvent(new Event("scroll"));
  });
  await settle();
}

const hint = (): boolean => page().querySelector(".v4MapScrollHint") !== null;

describe("B6: the map's end fade", () => {
  it("shows at the start and in the middle, and goes once the box is scrolled to its end; the hint stays", async () => {
    await mountMap(1600);
    expect(box(), "the tree draws its scroll box").not.toBeNull();
    await sized(0);
    expect(box().classList.contains("v4MapScrollMore")).toBe(true);
    expect(hint()).toBe(true);
    await sized(200);
    expect(box().classList.contains("v4MapScrollMore")).toBe(true);
    await sized(400);
    expect(box().classList.contains("v4MapScrollMore")).toBe(false);
    expect(hint(), CATALOG["v4.map.scrollHint"]).toBe(true);
    await sized(150);
    expect(box().classList.contains("v4MapScrollMore")).toBe(true);
  });

  it("right to left: scrolled to its end (a negative offset), the fade goes too", async () => {
    await mountMap(1600);
    await sized(-200);
    expect(box().classList.contains("v4MapScrollMore")).toBe(true);
    await sized(-400);
    expect(box().classList.contains("v4MapScrollMore")).toBe(false);
  });

  it("the canvas ends with room for the whole ring past its last column", () => {
    const looks = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-map-looks.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
    expect(looks).toMatch(/\.v4Map > \.v4MapScroll \{ padding-inline-end: 8px; \}/u);
    // The ring it must hold: 3 px wide, 2 px out (v4-map.css, V4B-V2).
    const map = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-map.css"), "utf8");
    expect(map).toMatch(/\.v4MapCanvas \[data-rove\]:focus-visible, \.v4OutTree \[data-rove\]:focus-visible \{\s*outline: 3px solid var\(--ink\); outline-offset: 2px;/u);
  });
});
