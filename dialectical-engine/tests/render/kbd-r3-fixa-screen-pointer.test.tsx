// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FOCUS_GUARD_SETTLE_MS } from "../../apps/ui/lib/focusGuard.js";
import type { RunProjection } from "../../packages/contract/src/index.js";
import { startFocusGuard } from "./kbd-guard-harness.js";
import { advance, harness, mountMap, page, resetHarness, settle, unmountMap } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Keyboard audit 2026-11-12, wave 3 fix round (A5 i), on the harness of kbd-r2-w2v4map-screens.test.tsx. The screen before
 * the map (here the R22 first card) is the page's content start (`.v4DebCentre#page-content`, tabIndex -1), so a mouse
 * press on its plain text focuses it. That is no focus of the person's in the screen: when the read answers and the screen
 * gives way to the map, nothing is moved for them (before wave 3 the press focused nothing). The skip link landing there
 * from the keyboard still counts, and focus goes on to the map's question card. Made-up questions only.
 */

let stopGuard: () => void = () => undefined;

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  stopGuard = startFocusGuard();
});

afterEach(async () => {
  stopGuard();
  await unmountMap();
  vi.useRealTimers();
});

const Q = "Should Brightwater ban cars from its old town on Sundays?\n\nWhere? Brightwater.";
const runningRun = (runId: string): RunProjection => ({ run_ref: runId, question_line: Q, state: "RUNNING", terminal_reason: null, hold_until: null } as RunProjection);

async function firstCard(): Promise<HTMLElement> {
  const runId = crypto.randomUUID();
  harness.run = runningRun(runId);
  await mountMap(1600, runId);
  page().id = "main-content";
  const region = page().querySelector<HTMLElement>(".v4DebCentre#page-content")!;
  expect(region, "the screen before the map is the content's start").not.toBeNull();
  expect(region.querySelector(".v4DebFirstCard")).not.toBeNull();
  return region;
}

async function mapArrives(): Promise<void> {
  harness.run = null;
  await advance(5_000);
  await settle();
  await advance(FOCUS_GUARD_SETTLE_MS + 20);
  await settle();
  expect(page().querySelector(".v4DebFirstCard")).toBeNull();
  expect(page().querySelector(".v4DebMapCol .v4MapRoot")).not.toBeNull();
}

describe("A5 i: a press on the screen's plain text is not focus in the screen", () => {
  it("a mouse press on the first card's text focuses the region; when the map arrives, focus is not moved for that person", async () => {
    const region = await firstCard();
    const text = region.querySelector<HTMLElement>(".v4DebFirstCard")!;
    act(() => {
      text.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      // A browser focuses the nearest focusable part around the press: the region.
      region.focus();
      text.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(document.activeElement).toBe(region);
    await mapArrives();
    expect(document.activeElement).not.toBe(page().querySelector(".v4DebMapCol .v4MapRoot"));
  });

  it("the skip link landing on the region from the keyboard still counts: focus goes on to the map's question card", async () => {
    const region = await firstCard();
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      region.focus();
    });
    await mapArrives();
    expect(document.activeElement).toBe(page().querySelector(".v4DebMapCol .v4MapRoot"));
  });
});

describe("the screens before the map mark where their content starts, once (A10)", () => {
  const oneMarkOn = (where: string): void => {
    const all = [...document.querySelectorAll<HTMLElement>("#page-content")];
    expect(all, "one #page-content in the rendered page").toHaveLength(1);
    expect(all[0]!.getAttribute("tabindex")).toBe("-1");
    expect(all[0]!.matches(where), `the mark is on ${where}`).toBe(true);
  };

  it("the R22 first card, then the map that replaces it", async () => {
    await firstCard();
    oneMarkOn(".v4DebCentre");
    await mapArrives();
    oneMarkOn(".v4DebMain");
  });

  it("\"couldn't load\"", async () => {
    harness.loadError = new Error("made-up network fault");
    await mountMap(1600);
    expect(page().querySelector("[role='alert'], .v4DebCentre")).not.toBeNull();
    oneMarkOn(".v4DebCentre");
  });
});
