// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useWaitPolling,
  WAIT_AFTER_FAILURE_MS,
  WAIT_HIDDEN_EVERY_MS,
  type WaitCheck,
  type WaitPolling,
  type WaitPollingOptions
} from "../../apps/ui/lib/v4/useWaitPolling.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
 * Owner's screen review, 3 Nov 2026 (wait-f19): check rarely while the tab is hidden, check at once when it is shown
 * again or the connection comes back, and offer [Try now] after a failed check. One check at a time; nothing after "done".
 */
let root: Root | undefined;
let host: HTMLDivElement | undefined;
let visibility: DocumentVisibilityState = "visible";
let latest: WaitPolling | null = null;

function Probe({ check, options }: Readonly<{ check: WaitCheck; options: WaitPollingOptions }>) {
  latest = useWaitPolling(check, options);
  return null;
}
/** Lets the check's promise and the state it sets land (a few microtask turns). */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
}
async function inAct(step: () => void): Promise<void> {
  await act(async () => { step(); await settle(); });
}
async function mount(check: WaitCheck, options: WaitPollingOptions = { everyMs: 5_000 }): Promise<void> {
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await inAct(() => root!.render(<Probe check={check} options={options} />));
}
async function advance(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); await settle(); });
}
async function setVisibility(next: DocumentVisibilityState): Promise<void> {
  visibility = next;
  await inAct(() => document.dispatchEvent(new Event("visibilitychange")));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-11-04T09:40:00.000Z"));
  visibility = "visible";
  latest = null;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.useRealTimers();
});

describe("checking for news while waiting (wait-f19)", () => {
  it("checks at once, then every everyMs while the tab is shown, and says when it last heard back", async () => {
    const check = vi.fn<WaitCheck>(async () => "AGAIN");
    await mount(check);
    expect(check).toHaveBeenCalledTimes(1);
    expect(latest!.checkedAt).toBe(Date.parse("2026-11-04T09:40:00.000Z"));
    expect(latest!.reconnecting).toBe(false);
    await advance(4_999);
    expect(check).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(check).toHaveBeenCalledTimes(2);
    expect(latest!.checkedAt).toBe(Date.parse("2026-11-04T09:40:05.000Z"));
  });

  it("checks rarely while the tab is hidden, and at once when it is shown again", async () => {
    const check = vi.fn<WaitCheck>(async () => "AGAIN");
    await mount(check);
    await setVisibility("hidden");
    await advance(WAIT_HIDDEN_EVERY_MS - 1);
    expect(check).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(check).toHaveBeenCalledTimes(2);
    await advance(30_000);
    expect(check).toHaveBeenCalledTimes(2);
    await setVisibility("visible");
    expect(check).toHaveBeenCalledTimes(3);
    await advance(5_000);
    expect(check).toHaveBeenCalledTimes(4);
  });

  it("after a failed check it says so and waits longer; [Try now] checks at once and, when it answers, the line goes", async () => {
    let fail = true;
    const check = vi.fn<WaitCheck>(async () => {
      if (fail) throw new Error("offline");
      return "AGAIN";
    });
    await mount(check);
    expect(latest!.reconnecting).toBe(true);
    expect(latest!.checkedAt).toBeNull();
    await advance(5_000);
    expect(check).toHaveBeenCalledTimes(1);
    fail = false;
    await inAct(() => latest!.tryNow());
    expect(check).toHaveBeenCalledTimes(2);
    expect(latest!.reconnecting).toBe(false);
    expect(latest!.checkedAt).not.toBeNull();
    // Back to the normal pace.
    await advance(5_000);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("a failed check is tried again after the longer wait, and at once when the connection comes back", async () => {
    const check = vi.fn<WaitCheck>(async () => { throw new Error("offline"); });
    await mount(check);
    await advance(WAIT_AFTER_FAILURE_MS - 1);
    expect(check).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(check).toHaveBeenCalledTimes(2);
    await inAct(() => window.dispatchEvent(new Event("online")));
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("one check at a time: [Try now], the tab coming back or the connection while a check is out add none", async () => {
    let finish: ((outcome: "AGAIN") => void) | undefined;
    const check = vi.fn<WaitCheck>(() => new Promise((done) => { finish = done; }));
    await mount(check);
    expect(check).toHaveBeenCalledTimes(1);
    await inAct(() => latest!.tryNow());
    await setVisibility("visible");
    await inAct(() => window.dispatchEvent(new Event("online")));
    expect(check).toHaveBeenCalledTimes(1);
    await inAct(() => finish!("AGAIN"));
    await advance(5_000);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("stops for good once the check says it is done", async () => {
    const check = vi.fn<WaitCheck>(async () => "DONE");
    await mount(check);
    await advance(10 * 60_000);
    await setVisibility("hidden");
    await setVisibility("visible");
    await inAct(() => { window.dispatchEvent(new Event("online")); latest!.tryNow(); });
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("does nothing while switched off, and stops when the page goes", async () => {
    const check = vi.fn<WaitCheck>(async () => "AGAIN");
    await mount(check, { everyMs: 5_000, enabled: false });
    await advance(60_000);
    expect(check).not.toHaveBeenCalled();
    await inAct(() => root!.render(<Probe check={check} options={{ everyMs: 5_000 }} />));
    expect(check).toHaveBeenCalledTimes(1);
    act(() => root!.unmount());
    root = undefined;
    await advance(60_000);
    await setVisibility("visible");
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("uses the newest check the page passes without starting over", async () => {
    const first = vi.fn<WaitCheck>(async () => "AGAIN");
    const second = vi.fn<WaitCheck>(async () => "AGAIN");
    await mount(first);
    await inAct(() => root!.render(<Probe check={second} options={{ everyMs: 5_000 }} />));
    expect(second).not.toHaveBeenCalled();
    await advance(5_000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
