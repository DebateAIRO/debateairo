import { describe, expect, it } from "vitest";
import { STORY_FIXTURE_ANSWER, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import { diffSnapshots, selectionForChange, snapshotItems } from "../../apps/ui/lib/v4/changes.js";
import type { DigLink, DigView, V4Change } from "../../apps/ui/lib/v4/types.js";

/** V4 initial (2026-10-28), D4: what this browser saw, what changed since, and where the tour goes. */

const MAP = buildV4Map({ runId: "run-1", answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY") });

function dig(childRunId: string, state: DigView["state"], openQuestionIds: string[]): DigView {
  const link: DigLink = {
    parentRunId: "run-1", childRunId, openQuestionIds, questions: ["Q?"], mode: "quick", startedAt: "2026-10-28T00:00:00.000Z"
  };
  return { link, state, headline: null, counts: null };
}

describe("snapshotItems", () => {
  it("records digs, paths, open questions and points, in that order", () => {
    const items = snapshotItems(MAP, [dig("child-1", "RUNNING", ["w"])]);
    expect(Object.entries(items)).toEqual([
      ["dig:child-1", "RUNNING"],
      ["path:n-hybrid", "PARTLY_HELD"],
      ["path:n-yes", "PARTLY_HELD"],
      ["path:n-not-now", "FELL"],
      ["open:w", "dug"],
      ["open:o:0", "open"],
      ["open:p:n-hybrid-school", "open"],
      ["open:p:n-not-now", "open"],
      ["point:n-yes", "SURE_FOR_CASE"],
      ["point:n-yes-pay", "SURE"],
      ["point:n-yes-rent", "SURE"],
      ["point:n-not-now", "STILL_ARGUED"],
      ["point:n-not-now-once", "SURE_FOR_CASE"],
      ["point:n-hybrid", "SURE_FOR_CASE"],
      ["point:n-hybrid-school", "STILL_ARGUED"],
      ["point:n-hybrid-forum", "unchecked"]
    ]);
  });

  it("writes 'none' for the stand-in path's missing fate", () => {
    const standIn = buildV4Map({ runId: "run-1", answer: STORY_FIXTURE_ANSWER, story: null });
    expect(snapshotItems(standIn, [])["path:all"]).toBe("none");
  });
});

describe("diffSnapshots", () => {
  it("has nothing to say on a first visit", () => {
    expect(diffSnapshots(null, snapshotItems(MAP, []))).toEqual([]);
  });

  it("finds added and changed items, ignores removed ones, and tells digs, paths, open, points in order", () => {
    const before = { at: "2026-10-27T00:00:00.000Z", items: {
      "point:n-yes": "unchecked",
      "open:w": "open",
      "path:n-yes": "HELD_UP",
      "path:n-hybrid": "PARTLY_HELD",
      "point:gone": "SURE"
    } };
    const now = { "point:n-yes": "SURE_FOR_CASE", "point:new": "SURE", "open:w": "dug", "path:n-yes": "PARTLY_HELD", "path:n-hybrid": "PARTLY_HELD", "dig:c": "DONE" };
    expect(diffSnapshots(before, now)).toEqual([
      { id: "dig:c", kind: "ADDED", before: null, now: "DONE" },
      { id: "path:n-yes", kind: "CHANGED", before: "HELD_UP", now: "PARTLY_HELD" },
      { id: "open:w", kind: "CHANGED", before: "open", now: "dug" },
      { id: "point:n-yes", kind: "CHANGED", before: "unchecked", now: "SURE_FOR_CASE" },
      { id: "point:new", kind: "ADDED", before: null, now: "SURE" }
    ]);
  });

  it("is empty when nothing moved", () => {
    const items = snapshotItems(MAP, [dig("c", "DONE", [])]);
    expect(diffSnapshots({ at: "x", items }, items)).toEqual([]);
  });
});

describe("selectionForChange", () => {
  const change = (id: string): V4Change => ({ id, kind: "ADDED", before: null, now: "x" });

  it("sends each kind to its place on the map", () => {
    expect(selectionForChange(MAP, change("dig:child-1"))).toBe("dig:child-1");
    expect(selectionForChange(MAP, change("path:n-yes"))).toBe("path:n-yes");
    expect(selectionForChange(MAP, change("open:p:n-not-now"))).toBe("open:p:n-not-now");
    expect(selectionForChange(MAP, change("point:n-yes-rent"))).toBe("path:n-yes");
    expect(selectionForChange(MAP, change("point:not-in-any-path"))).toBe("root");
    expect(selectionForChange(MAP, change("strange"))).toBe("root");
  });

  it("sends a point to the stand-in path when there is no story", () => {
    const standIn = buildV4Map({ runId: "run-1", answer: STORY_FIXTURE_ANSWER, story: null });
    expect(selectionForChange(standIn, change("point:n-hybrid-forum"))).toBe("path:all");
  });
});
