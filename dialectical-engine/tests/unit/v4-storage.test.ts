import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addDigLink,
  addStartedRun,
  findDigParent,
  readDigLinks,
  readReadingLevel,
  readSeen,
  readStartedRuns,
  writeReadingLevel,
  writeSeen
} from "../../apps/ui/lib/v4/storage.js";
import type { DigLink } from "../../apps/ui/lib/v4/types.js";

/*
 * V4 initial (spec 2026-10-28, B2): what V4 keeps in this browser. Everything read is checked, the lists are capped,
 * and a browser without storage (server, private window, a throwing quota) leaves every call harmless.
 */

class FakeStorage {
  readonly data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, String(value)); }
}

let storage: FakeStorage;
beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => true });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function link(parentRunId: string, childRunId: string, startedAt = "2026-10-28T10:00:00.000Z"): DigLink {
  return { parentRunId, childRunId, openQuestionIds: ["w"], questions: ["Would gas prices change it?"], mode: "quick", startedAt };
}

describe("reading level", () => {
  it("saves and reads a known level, and ignores anything else", () => {
    expect(readReadingLevel()).toBeNull();
    writeReadingLevel("expert");
    expect(storage.getItem("v4.readingLevel")).toBe("expert");
    expect(readReadingLevel()).toBe("expert");
    storage.setItem("v4.readingLevel", "genius");
    expect(readReadingLevel()).toBeNull();
  });
});

describe("dig links", () => {
  it("keeps a link per follow-up, finds the way back to the parent, and replaces a repeated follow-up", () => {
    addDigLink(link("run:a", "run:b"));
    addDigLink(link("run:a", "run:c"));
    addDigLink({ ...link("run:a", "run:b"), mode: "thorough" });
    expect(readDigLinks("run:a").map((item) => [item.childRunId, item.mode])).toEqual([["run:c", "quick"], ["run:b", "thorough"]]);
    expect(findDigParent("run:b")?.parentRunId).toBe("run:a");
    expect(findDigParent("run:zzz")).toBeNull();
    expect(JSON.parse(storage.getItem("v4.digParents")!)).toEqual({ "run:c": "run:a", "run:b": "run:a" });
  });

  it("keeps at most 50 links per debate (the oldest go)", () => {
    for (let index = 0; index < 55; index += 1) addDigLink(link("run:a", `run:child-${index}`));
    const links = readDigLinks("run:a");
    expect(links).toHaveLength(50);
    expect(links[0]?.childRunId).toBe("run:child-5");
    expect(links[49]?.childRunId).toBe("run:child-54");
  });

  it("ignores malformed data and links filed under another debate", () => {
    storage.setItem("v4.digs.run:a", "{not json");
    expect(readDigLinks("run:a")).toEqual([]);
    storage.setItem("v4.digs.run:a", JSON.stringify([
      link("run:a", "run:ok"),
      { ...link("run:a", "run:bad-mode"), mode: "forever" },
      { ...link("run:a", "run:bad-time"), startedAt: "yesterday" },
      { ...link("run:a", "run:bad-ids"), openQuestionIds: [1] },
      link("run:other", "run:elsewhere"),
      "text",
      null
    ]));
    expect(readDigLinks("run:a").map((item) => item.childRunId)).toEqual(["run:ok"]);
    storage.setItem("v4.digParents", JSON.stringify(["run:ok"]));
    expect(findDigParent("run:ok")).toBeNull();
    addDigLink({ ...link("run:a", "run:x"), mode: "forever" } as unknown as DigLink);
    expect(readDigLinks("run:a").map((item) => item.childRunId)).toEqual(["run:ok"]);
  });
});

describe("what this browser saw last time", () => {
  it("saves and reads a snapshot, dropping words that are not text", () => {
    writeSeen("run:a", { at: "2026-10-28T10:00:00.000Z", items: { root: "SURE" } });
    expect(readSeen("run:a")).toEqual({ at: "2026-10-28T10:00:00.000Z", items: { root: "SURE" } });
    storage.setItem("v4.seen.run:b", JSON.stringify({ at: "2026-10-28T10:00:00.000Z", items: { root: "SURE", bad: 3 } }));
    expect(readSeen("run:b")).toEqual({ at: "2026-10-28T10:00:00.000Z", items: { root: "SURE" } });
    storage.setItem("v4.seen.run:c", JSON.stringify({ at: "soon", items: {} }));
    expect(readSeen("run:c")).toBeNull();
  });

  it("keeps the 30 most recently seen debates, the one just written always among them", () => {
    for (let index = 0; index < 35; index += 1) {
      const at = new Date(Date.UTC(2026, 9, 1 + index)).toISOString();
      writeSeen(`run:${index}`, { at, items: {} });
    }
    storage.setItem("v4.seen.run:broken", "{");
    writeSeen("run:old", { at: "2020-01-01T00:00:00.000Z", items: {} });
    const kept = [...storage.data.keys()].filter((key) => key.startsWith("v4.seen."));
    expect(kept).toHaveLength(30);
    expect(kept).toContain("v4.seen.run:old");
    expect(kept).toContain("v4.seen.run:34");
    expect(kept).not.toContain("v4.seen.run:5");
    expect(kept).not.toContain("v4.seen.run:broken");
  });
});

describe("asks started from /v4", () => {
  it("lists them newest first, once per debate, at most 20", () => {
    for (let index = 0; index < 22; index += 1) {
      addStartedRun({ runId: `run:${index}`, question: `Question ${index}?`, startedAt: new Date(Date.UTC(2026, 9, 1, index)).toISOString() });
    }
    addStartedRun({ runId: "run:21", question: "Question 21 again?", startedAt: new Date(Date.UTC(2026, 9, 2)).toISOString() });
    const runs = readStartedRuns();
    expect(runs).toHaveLength(20);
    expect(runs[0]).toEqual({ runId: "run:21", question: "Question 21 again?", startedAt: "2026-10-02T00:00:00.000Z" });
    expect(runs.filter((run) => run.runId === "run:21")).toHaveLength(1);
    expect(runs.at(-1)?.runId).toBe("run:2");
  });

  it("ignores malformed entries", () => {
    storage.setItem("v4.started", JSON.stringify([{ runId: "", question: "x", startedAt: "2026-10-28T10:00:00.000Z" }, { runId: "run:1" }, 5]));
    expect(readStartedRuns()).toEqual([]);
    storage.setItem("v4.started", "null");
    expect(readStartedRuns()).toEqual([]);
  });
});

describe("a browser without usable storage", () => {
  it("answers empty and never throws when storage throws", () => {
    const throwing = {
      get length(): number { throw new Error("blocked"); },
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("blocked"); },
      key: () => { throw new Error("blocked"); },
      clear: () => { throw new Error("blocked"); }
    };
    vi.stubGlobal("window", { localStorage: throwing, dispatchEvent: () => true });
    expect(() => {
      writeReadingLevel("plain");
      addDigLink(link("run:a", "run:b"));
      writeSeen("run:a", { at: "2026-10-28T10:00:00.000Z", items: {} });
      addStartedRun({ runId: "run:a", question: "Q?", startedAt: "2026-10-28T10:00:00.000Z" });
    }).not.toThrow();
    expect(readReadingLevel()).toBeNull();
    expect(readDigLinks("run:a")).toEqual([]);
    expect(findDigParent("run:b")).toBeNull();
    expect(readSeen("run:a")).toBeNull();
    expect(readStartedRuns()).toEqual([]);
  });

  it("answers empty when the localStorage getter itself throws, or there is no window (the server)", () => {
    vi.stubGlobal("window", { get localStorage(): Storage { throw new Error("SecurityError"); } });
    expect(readReadingLevel()).toBeNull();
    expect(() => addStartedRun({ runId: "run:a", question: "Q?", startedAt: "2026-10-28T10:00:00.000Z" })).not.toThrow();
    vi.stubGlobal("window", undefined);
    expect(readStartedRuns()).toEqual([]);
    expect(() => writeReadingLevel("plain")).not.toThrow();
  });
});
