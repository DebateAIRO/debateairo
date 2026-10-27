import type { AnswerIndex } from "@debateai/contract";
import { describe, expect, it, vi } from "vitest";

import { digQuestion } from "../../apps/ui/lib/v4/askText.js";
import { digLinksFor, digParentOf, readQuestionIndex, type IndexEntry } from "../../apps/ui/lib/v4/digIndex.js";
import type { V4Map, V4OpenQuestion, V4Path } from "../../apps/ui/lib/v4/types.js";

/*
 * V4 initial, fix wave 1 (Decision A): digs are found again from the account's own question list, by text, because the
 * API has no dig link and V4 stores nothing in the browser.
 */

const CATALOG = Object.freeze({
  "v4.digText.path": "Look deeper into this part of the answer: {line}",
  "v4.digText.kind.STILL_ARGUED": "Does this hold up, and when? {text}",
  "v4.digText.kind.OBJECTION": "How strong is this objection, and does it change the answer? {text}",
  "v4.digText.kind.WOULD_CHANGE": "Would this change the answer? {text}",
  "v4.digText.together": "Please look into these questions together:",
  "v4.digText.context": "This follows from an earlier question: “{question}”"
});

const ZERO = { SURE: 0, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 };
const PARENT_LINE = "Should Romania build more nuclear plants?\n\nThis is about Romania.";

function open(id: string, kind: V4OpenQuestion["kind"], text: string, pathId: string | null, star = false): V4OpenQuestion {
  return { id, kind, text, star, pathId };
}

const ARGUED = open("p:n2", "STILL_ARGUED", "Building costs keep falling.", "path-1", true);
const OBJECTION = open("o:0", "OBJECTION", "Nuclear waste has no lasting solution.", null);
const CHANGE = open("w", "WOULD_CHANGE", "Cheap gas for twenty years.", null);
const PATH: V4Path = {
  id: "path-1", fate: "HELD_UP", line: "Nuclear power keeps the grid steady.", points: [], counts: ZERO, unchecked: 0,
  // The same point argued under two paths appears twice on the map (FIT-1); it is one question.
  open: [ARGUED]
};
const PATH_2: V4Path = { ...PATH, id: "path-2", line: "Renewables are cheaper.", open: [{ ...ARGUED, star: false, pathId: "path-2" }] };

const MAP: V4Map = {
  runId: "run-parent", answerId: "ans-1", answerVersion: 1, question: PARENT_LINE, headline: null, summary: null,
  confidence: null, why: [], sections: [], paths: [PATH, PATH_2], points: [], open: [OBJECTION, CHANGE], counts: ZERO,
  unchecked: 0, wouldChange: CHANGE.text, objections: [OBJECTION.text], storyState: "READY", fallbackText: null,
  reservation: false
};

function entry(runId: string, questionLine: string, createdAtSequence: number): IndexEntry {
  return { runId, questionLine, createdAtSequence };
}

describe("readQuestionIndex", () => {
  it("joins answers and open runs, one entry per run, newest first", async () => {
    const index = {
      items: [
        { run_ref: "run-a", question_line: "A?", created_at_sequence: 3 },
        { run_ref: "run-b", question_line: "B?", created_at_sequence: 5 },
        { run_ref: "run-a", question_line: "A?", created_at_sequence: 7 }
      ],
      open_runs: [{ run_ref: "run-c", question_line: "C?", created_at_sequence: 6 }],
      limit: 100, offset: 0, total: 4
    } as unknown as AnswerIndex;
    const readAnswerIndex = vi.fn(async () => index);
    const entries = await readQuestionIndex({ readAnswerIndex });
    expect(readAnswerIndex).toHaveBeenCalledWith(100, 0);
    expect(entries).toEqual([entry("run-a", "A?", 7), entry("run-c", "C?", 6), entry("run-b", "B?", 5)]);
  });

  it("keeps the limit inside what the API allows (1..128)", async () => {
    const readAnswerIndex = vi.fn(async () => ({ items: [], open_runs: [], limit: 1, offset: 0, total: 0 }) as unknown as AnswerIndex);
    await readQuestionIndex({ readAnswerIndex }, 500);
    await readQuestionIndex({ readAnswerIndex }, 0);
    expect(readAnswerIndex.mock.calls).toEqual([[128, 0], [1, 0]]);
  });

  it("lets a failed read reach the caller", async () => {
    await expect(readQuestionIndex({ readAnswerIndex: async () => { throw new Error("offline"); } })).rejects.toThrow("offline");
  });
});

describe("digLinksFor", () => {
  const pathDig = digQuestion({ kind: "path", path: PATH }, PARENT_LINE, CATALOG, "en");
  const argued = digQuestion({ kind: "open", questions: [ARGUED] }, PARENT_LINE, CATALOG, "en");
  const together = digQuestion({ kind: "open", questions: [OBJECTION, CHANGE, open("o:9", "OBJECTION", "Not on this map.", null)] },
    PARENT_LINE, CATALOG, "en");
  const offEnglish = digQuestion({ kind: "open", questions: [OBJECTION] }, PARENT_LINE, CATALOG, "ro");
  const otherParent = digQuestion({ kind: "path", path: PATH }, "A different question?", CATALOG, "en");
  const INDEX = [
    entry("run-off", offEnglish, 9),
    entry("run-together", together, 8),
    entry("run-other", otherParent, 7),
    entry("run-argued", argued, 6),
    entry("run-path", pathDig, 5),
    entry("run-parent", PARENT_LINE, 1)
  ];

  it("finds the digs of this question, oldest first, and places each item by its text", () => {
    const links = digLinksFor("run-parent", PARENT_LINE, MAP, INDEX, CATALOG);
    expect(links.map((link) => link.childRunId)).toEqual(["run-path", "run-argued", "run-together", "run-off"]);
    expect(links.map((link) => link.openQuestionIds)).toEqual([["path:path-1"], ["p:n2"], ["o:0", "w"], ["o:0"]]);
    expect(links[2]?.questions).toEqual([OBJECTION.text, CHANGE.text, "Not on this map."]);
    for (const link of links) {
      expect(link.parentRunId).toBe("run-parent");
      expect(link.mode).toBeNull();
      expect(link.startedAt).toBeNull();
    }
  });

  it("without a map, the digs are still found and hang under the question", () => {
    const links = digLinksFor("run-parent", PARENT_LINE, null, INDEX, CATALOG);
    expect(links).toHaveLength(4);
    expect(links.every((link) => link.openQuestionIds.length === 0)).toBe(true);
  });

  it("matches the parent's own words with spaces closed up, and never lists the parent itself", () => {
    const links = digLinksFor("run-parent", "  Should Romania build   more nuclear plants?  ", MAP, INDEX, CATALOG);
    expect(links.map((link) => link.childRunId)).toEqual(["run-path", "run-argued", "run-together", "run-off"]);
    expect(digLinksFor("run-parent", PARENT_LINE, MAP, [entry("run-parent", pathDig, 1)], CATALOG)).toEqual([]);
  });
});

describe("digParentOf", () => {
  it("finds the newest question whose own words the dig names", () => {
    const child = digQuestion({ kind: "path", path: PATH }, PARENT_LINE, CATALOG, "en");
    const index = [
      entry("run-child", child, 9),
      entry("run-newer-same", "Should Romania build more nuclear plants?", 4),
      entry("run-parent", PARENT_LINE, 2)
    ];
    expect(digParentOf(child, index, CATALOG)?.runId).toBe("run-newer-same");
  });

  it("walks a dig of a dig one step up", () => {
    const first = digQuestion({ kind: "open", questions: [ARGUED] }, PARENT_LINE, CATALOG, "en");
    const second = digQuestion({ kind: "path", path: PATH }, first, CATALOG, "en");
    const index = [entry("run-2", second, 3), entry("run-1", first, 2), entry("run-0", PARENT_LINE, 1)];
    expect(digParentOf(second, index, CATALOG)?.runId).toBe("run-1");
    expect(digParentOf(first, index, CATALOG)?.runId).toBe("run-0");
  });

  it("is null for a question that is not a dig, or whose parent is not in the list", () => {
    expect(digParentOf(PARENT_LINE, [entry("run-0", PARENT_LINE, 1)], CATALOG)).toBeNull();
    const child = digQuestion({ kind: "path", path: PATH }, PARENT_LINE, CATALOG, "en");
    expect(digParentOf(child, [entry("run-child", child, 2)], CATALOG)).toBeNull();
  });
});
