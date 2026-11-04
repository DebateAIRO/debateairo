// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDig,
  DIG_CANCELLED_SHOWN_MS,
  DIG_SEND_GIVE_UP_MS,
  DIG_STARTED_SHOWN_MS,
  DIG_UNDO_MS,
  digGroupOf,
  digTargetKey,
  dismissDig,
  readDigUndo,
  resetDigUndo,
  undoDig,
  waitForDigs,
  waitingDigFor,
  waitingDigsOf,
  type DigUndoResult
} from "../../apps/ui/lib/v4/digUndo.js";
import type { DigTarget, PendingDig, V4OpenQuestion, V4Path } from "../../apps/ui/lib/v4/types.js";

/*
 * V4 UX fixes (owner pick dig-d3, 3 Nov 2026): the digs waiting out their 10-second Undo belong to the whole V4 site, in
 * the page's memory only. Each keeps its own Undo, nothing is sent before its 10 seconds, the sends go one at a time, a
 * report waits for a dig still waiting (ruling F7), and closing the tab asks first while one waits.
 */

const path = (id: string): V4Path => ({ id, line: `Path ${id}` }) as unknown as V4Path;
const target = (id: string): DigTarget => ({ kind: "path", path: path(id) });
const pathIdOf = (pending: PendingDig): string => (pending.target as Extract<DigTarget, { kind: "path" }>).path.id;
const phases = (): string[] => readDigUndo().map((entry) => entry.phase);

type Sender = (pending: PendingDig) => Promise<DigUndoResult>;
const started = (childRunId: string): DigUndoResult => ({ kind: "STARTED", childRunId, startedAt: new Date().toISOString() });

function add(id: string, send: Sender, runIds: readonly string[] = []): number {
  return addDig({
    parentRunId: "run-1",
    runIds,
    dig: { target: target(id), mode: "quick", sendsAt: Date.now() + DIG_UNDO_MS },
    sharePercent: 4,
    showMode: true,
    send,
    failedLine: "We couldn't start this dig."
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetDigUndo();
});

afterEach(() => {
  resetDigUndo();
  vi.useRealTimers();
});

describe("the site-wide waiting digs (dig-d3)", () => {
  it("sends nothing before 10 seconds, then sends once; the started note goes by itself", async () => {
    const send = vi.fn<Sender>(async () => started("child-1"));
    add("a", send);
    expect(phases()).toEqual(["COUNTING"]);
    await vi.advanceTimersByTimeAsync(DIG_UNDO_MS - 100);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(phases()).toEqual(["STARTED"]);
    await vi.advanceTimersByTimeAsync(DIG_STARTED_SHOWN_MS + 10);
    expect(readDigUndo()).toEqual([]);
  });

  it("several digs each keep their own Undo: undoing one never touches the other", async () => {
    const send = vi.fn<Sender>(async () => started(crypto.randomUUID()));
    const first = add("a", send);
    await vi.advanceTimersByTimeAsync(3_000);
    add("b", send);
    expect(undoDig(first)).toBe(true);
    expect(phases()).toEqual(["CANCELLED", "COUNTING"]);
    await vi.advanceTimersByTimeAsync(DIG_UNDO_MS + 100);
    expect(send).toHaveBeenCalledTimes(1);
    expect(pathIdOf(send.mock.calls[0]![0])).toBe("b");
    expect(phases()).not.toContain("CANCELLED");
  });

  it("'Cancelled' stays 4 seconds; Undo is refused once the dig is being sent; a refusal stays until closed", async () => {
    let release: (result: DigUndoResult) => void = () => undefined;
    const send = vi.fn<Sender>(() => new Promise((resolve) => { release = resolve; }));
    const id = add("a", send);
    await vi.advanceTimersByTimeAsync(DIG_UNDO_MS + 10);
    expect(phases()).toEqual(["SENDING"]);
    expect(undoDig(id)).toBe(false);
    release({ kind: "REFUSED", message: "No." });
    await vi.advanceTimersByTimeAsync(1);
    expect(phases()).toEqual(["REFUSED"]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(phases()).toEqual(["REFUSED"]);
    dismissDig(id);
    expect(readDigUndo()).toEqual([]);

    const again = add("b", send);
    undoDig(again);
    await vi.advanceTimersByTimeAsync(DIG_CANCELLED_SHOWN_MS - 10);
    expect(phases()).toEqual(["CANCELLED"]);
    await vi.advanceTimersByTimeAsync(20);
    expect(readDigUndo()).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("a dig that still waits is never closed by hand", () => {
    const id = add("a", async () => started("c"));
    dismissDig(id);
    expect(phases()).toEqual(["COUNTING"]);
  });

  it("sends one at a time: a second dig waits for the first one's send to end", async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const send = vi.fn<Sender>(async (pending) => {
      const id = pathIdOf(pending);
      order.push(`start ${id}`);
      if (id === "a") await new Promise<void>((resolve) => { releaseFirst = resolve; });
      order.push(`end ${id}`);
      return started(id);
    });
    add("a", send);
    await vi.advanceTimersByTimeAsync(500);
    add("b", send);
    await vi.advanceTimersByTimeAsync(DIG_UNDO_MS + 1_000);
    expect(order).toEqual(["start a"]);
    releaseFirst();
    await vi.advanceTimersByTimeAsync(1);
    expect(order).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("a stopped send (a pop-up took over) or a send that throws leaves no note", async () => {
    add("a", async () => ({ kind: "STOPPED" }));
    add("b", async () => {
      throw new Error("unreachable");
    });
    await vi.advanceTimersByTimeAsync(DIG_UNDO_MS + 10);
    expect(readDigUndo()).toEqual([]);
  });

  it("a send that never answers stops holding up the next dig after a minute, and its note says it could not start", async () => {
    const send = vi.fn<Sender>(async (pending) => (pathIdOf(pending) === "a" ? new Promise<DigUndoResult>(() => undefined) : started("b")));
    add("a", send);
    add("b", send);
    await vi.advanceTimersByTimeAsync(DIG_UNDO_MS + 30_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(phases()).toEqual(["SENDING", "SENDING"]);
    // The minute runs from the first send (10 s in); the second dig goes out just after it.
    await vi.advanceTimersByTimeAsync(DIG_SEND_GIVE_UP_MS - 30_000 + 10);
    expect(send).toHaveBeenCalledTimes(2);
    expect(phases()).toEqual(["REFUSED", "STARTED"]);
    expect(readDigUndo()[0]!.result).toEqual({ kind: "REFUSED", message: "We couldn't start this dig." });
  });

  it("knows one waiting dig per place, and which debates (the one dug and those above it) wait for it", () => {
    add("a", async () => ({ kind: "STOPPED" }), ["root-run"]);
    expect(waitingDigFor(readDigUndo(), "run-1", target("a"))?.targetKey).toBe("path:a");
    expect(waitingDigFor(readDigUndo(), "run-1", target("b"))).toBeNull();
    expect(waitingDigFor(readDigUndo(), "other-run", target("a"))).toBeNull();
    expect(waitingDigFor(readDigUndo(), null, target("a"))).toBeNull();
    expect(waitingDigsOf(readDigUndo(), "ROOT-RUN")).toHaveLength(1);
    expect(waitingDigsOf(readDigUndo(), "run-1")).toHaveLength(1);
    expect(waitingDigsOf(readDigUndo(), "elsewhere")).toHaveLength(0);
  });

  it("the report waits until the dig is sent or undone (ruling F7)", async () => {
    const id = add("a", async () => started("c"));
    let done = false;
    void waitForDigs("run-1").then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(done).toBe(false);
    undoDig(id);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    await expect(waitForDigs("run-1")).resolves.toBeUndefined();
  });

  it("asks before the tab closes while a dig waits, and not after", () => {
    const id = add("a", async () => ({ kind: "STOPPED" }));
    const asked = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(asked);
    expect(asked.defaultPrevented).toBe(true);
    undoDig(id);
    const free = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(free);
    expect(free.defaultPrevented).toBe(false);
  });

  it("names each place, and the group a dig hangs under on the map", () => {
    const open = { id: "o1", text: "Open", pathId: "p1" } as unknown as V4OpenQuestion;
    const rootOpen = { id: "o2", text: "Open", pathId: null } as unknown as V4OpenQuestion;
    expect(digTargetKey(target("p1"))).toBe("path:p1");
    expect(digTargetKey({ kind: "open", questions: [open] })).toBe("open:o1");
    expect(digTargetKey({ kind: "picks", path: path("p1"), picks: [] })).toBe("picks:p1");
    expect(digTargetKey({ kind: "picks", path: null, picks: [] })).toBe("picks:root");
    expect(digGroupOf(target("p1"))).toBe("p1");
    expect(digGroupOf({ kind: "open", questions: [open] })).toBe("p1");
    expect(digGroupOf({ kind: "open", questions: [rootOpen] })).toBe("root");
    expect(digGroupOf({ kind: "picks", path: null, picks: [] })).toBe("root");
  });
});

/*
 * The rule the start step builds on (its Start Undo imports DIG_UNDO_MS, and its dig paths plan rides on the waiting
 * dig): nothing is sent before a dig's sendsAt, an Undo means that dig is never sent, and the dig reaches its send exactly
 * as it was handed in.
 */
describe("nothing is sent before sendsAt; Undo means nothing is sent", () => {
  it("one dig", async () => {
    const send = vi.fn<Sender>(async () => started("child-1"));
    add("a", send);
    await vi.advanceTimersByTimeAsync(DIG_UNDO_MS - 1);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    expect(send).toHaveBeenCalledTimes(1);

    const undone = add("b", send);
    await vi.advanceTimersByTimeAsync(DIG_UNDO_MS - 1);
    expect(undoDig(undone)).toBe(true);
    await vi.advanceTimersByTimeAsync(DIG_UNDO_MS * 3);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("two digs waiting at once: neither goes before its own sendsAt, and the one undone never goes", async () => {
    const send = vi.fn<Sender>(async (pending) => started(pathIdOf(pending)));
    const first = add("a", send);
    await vi.advanceTimersByTimeAsync(4_000);
    add("b", send);
    expect(phases()).toEqual(["COUNTING", "COUNTING"]);
    await vi.advanceTimersByTimeAsync(DIG_UNDO_MS - 4_000 - 1);
    expect(send).not.toHaveBeenCalled();
    expect(undoDig(first)).toBe(true);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    expect(send.mock.calls.map(([pending]) => pathIdOf(pending))).toEqual(["b"]);
    await vi.advanceTimersByTimeAsync(DIG_UNDO_MS * 3);
    expect(send.mock.calls.map(([pending]) => pathIdOf(pending))).toEqual(["b"]);
  });

  it("hands the dig to its send exactly as given, so an extra field rides along unchanged", async () => {
    const send = vi.fn<Sender>(async () => started("child-1"));
    const paths = { source: "DIG_PICKS", ids: ["p1"] };
    const dig = { target: target("a"), mode: "quick", sendsAt: Date.now() + DIG_UNDO_MS, paths } as unknown as PendingDig;
    addDig({ parentRunId: "run-1", runIds: [], dig, sharePercent: null, showMode: true, send, failedLine: "x" });
    await vi.advanceTimersByTimeAsync(DIG_UNDO_MS + 10);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toBe(dig);
    expect((send.mock.calls[0]![0] as unknown as { paths: unknown }).paths).toBe(paths);
  });
});
