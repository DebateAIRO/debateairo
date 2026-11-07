// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { V4FailedScreen } from "../../apps/ui/components/v4/V4FailedScreen.js";
import { V4PausedScreen } from "../../apps/ui/components/v4/V4PausedScreen.js";
import type { RunProjection } from "../../packages/contract/src/index.js";
import { advance, CATALOG, harness, mountMap, page, resetHarness, settle, unmountMap } from "./v4-debate-harness.js";

/** Every classic-view link the header was handed, newest last (the harness's own header draws none), and the run reads. */
const seen = vi.hoisted(() => ({ headerLinks: [] as Array<string | null>, reads: 0 }));

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", () => ({
  V4Header: ({ children, classicHref = null }: { children?: ReactNode; classicHref?: string | null }) => {
    seen.headerLinks.push(classicHref);
    return <header className="v4StandInHeader">{children}</header>;
  }
}));
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => {
  const mocked = (await import("./v4-debate-harness.js")).loadMock(await original());
  return { ...mocked, loadV4: async (id: string) => { seen.reads += 1; return mocked.loadV4(id); } };
});
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Owner's screen review, 3 Nov 2026, on today's debate page: the question's status is read through useWaitPolling
 * (wait-f19: rarely while the tab is hidden, at once when it is shown again or the connection returns). "Open in the
 * classic view" shows once (wait-f23): since the owner's answer 12 B (5 Nov; Task 76j's wiring) in the header's account menu
 * only, on the waiting and failed screens too.
 */
let visibility: DocumentVisibilityState = "visible";
const running = (runId: string): RunProjection => ({
  run_ref: runId, question_line: "Should countries build new nuclear power?", state: "RUNNING", terminal_reason: null, hold_until: null
});
const classicLinks = (): Element[] =>
  [...page().querySelectorAll("a")].filter((link) => link.textContent === CATALOG["v4.common.classicView"]);

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  seen.headerLinks.length = 0;
  seen.reads = 0;
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("the debate page's checks while the question runs (wait-f19)", () => {
  it("reads every 5 seconds while shown, rarely while hidden, and at once when shown again or back online", async () => {
    const runId = crypto.randomUUID();
    harness.run = running(runId);
    await mountMap(1600, runId);
    expect(seen.reads).toBe(1);
    await advance(5_000);
    await settle();
    expect(seen.reads).toBe(2);
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await advance(30_000);
    await settle();
    expect(seen.reads).toBe(2);
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(seen.reads).toBe(3);
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(seen.reads).toBe(4);
  });

  it("stops reading once the answer is served", async () => {
    const runId = crypto.randomUUID();
    harness.run = running(runId);
    await mountMap(1600, runId);
    harness.run = null;
    await advance(5_000);
    await settle();
    const served = seen.reads;
    expect(page().querySelector(".v4DebGrid")).not.toBeNull();
    await advance(60_000);
    await settle();
    expect(seen.reads).toBe(served);
  });
});

describe("Open in the classic view while the question waits (wait-f23)", () => {
  // The owner's answers of 5 Nov, question 12 B (journey-f19): "Open in the classic view" in the account menu only. The page's
  // own wiring (V4DebateClient, Task 76j) hands it to the header on every screen and to no body screen.
  it("question 12 B: the header carries it on the waiting card, and the card does not; the map's header keeps it", async () => {
    const runId = crypto.randomUUID();
    harness.run = running(runId);
    await mountMap(1600, runId);
    expect(seen.headerLinks.at(-1)).toBe(`/debate/${runId}`);
    expect(classicLinks()).toEqual([]);
    harness.run = null;
    await advance(5_000);
    await settle();
    expect(seen.headerLinks.at(-1)).toBe(`/debate/${runId}`);
  });

  it("question 12 B: the failed screen's header carries it and the screen does not", async () => {
    const runId = crypto.randomUUID();
    harness.run = { ...running(runId), state: "FAILED", terminal_reason: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM" };
    await mountMap(1600, runId);
    expect(page().textContent).toContain(CATALOG["v4.debate.failedTitle"]);
    expect(seen.headerLinks.at(-1)).toBe(`/debate/${runId}`);
    expect(classicLinks()).toEqual([]);
  });
});

describe("question 12 B on the screens themselves: the classic link only when the page hands one", () => {
  const HOME: Record<string, string> = {};
  async function draw(node: ReactNode): Promise<HTMLElement> {
    const box = document.body.appendChild(document.createElement("div"));
    const root = createRoot(box);
    await act(async () => root.render(node));
    const html = box.cloneNode(true) as HTMLElement;
    await act(async () => root.unmount());
    box.remove();
    return html;
  }
  const classicIn = (box: HTMLElement): Element[] =>
    [...box.querySelectorAll("a")].filter((link) => link.textContent === CATALOG["v4.common.classicView"]);

  it("the failed screen and the paused screen draw none without one, and one when handed one", async () => {
    const runId = crypto.randomUUID();
    const failed = { ...running(runId), state: "FAILED", terminal_reason: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM" } as RunProjection;
    const pausedRun = { ...running(runId), month_pause: { until: "2026-12-01T00:00:00.000Z", can_continue: false } } as RunProjection;
    const failedScreen = (classicHref?: string) => (
      <V4FailedScreen run={failed} askAgainHref="/v4?again=1" askHref="/v4" dig={null} catalog={CATALOG} homeCatalog={HOME}
        {...(classicHref === undefined ? {} : { classicHref })} />
    );
    const pausedScreen = (classicHref?: string) => (
      <V4PausedScreen run={pausedRun} runId={runId} reconnecting={false} catalog={CATALOG} locale="en"
        {...(classicHref === undefined ? {} : { classicHref })} />
    );
    expect(classicIn(await draw(failedScreen()))).toEqual([]);
    expect(classicIn(await draw(pausedScreen()))).toEqual([]);
    expect(classicIn(await draw(failedScreen(`/debate/${runId}`))).map((link) => link.getAttribute("href"))).toEqual([`/debate/${runId}`]);
    expect(classicIn(await draw(pausedScreen(`/debate/${runId}`))).map((link) => link.getAttribute("href"))).toEqual([`/debate/${runId}`]);
  });
});
