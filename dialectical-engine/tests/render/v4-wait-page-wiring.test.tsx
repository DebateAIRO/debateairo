// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
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
 * (wait-f19: rarely while the tab is hidden, at once when it is shown again or the connection returns), and while it
 * waits the header leaves "Open in the classic view" out, so the waiting card shows it once (wait-f23).
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
    await mountMap(1280, runId);
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
    await mountMap(1280, runId);
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
  it("the header leaves it out on the waiting card, so it shows once; the map's header has it again", async () => {
    const runId = crypto.randomUUID();
    harness.run = running(runId);
    await mountMap(1280, runId);
    expect(seen.headerLinks.at(-1)).toBeNull();
    expect(classicLinks()).toHaveLength(1);
    harness.run = null;
    await advance(5_000);
    await settle();
    expect(seen.headerLinks.at(-1)).toBe(`/debate/${runId}`);
  });
});
