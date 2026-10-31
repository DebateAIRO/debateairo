import type { AnswerIndex } from "@debateai/contract";
import { describe, expect, it, vi } from "vitest";

import { digQuestion } from "../../apps/ui/lib/v4/askText.js";
import { digLinksFor, digParentOf, mergeIndex, readQuestionIndex, type IndexEntry } from "../../apps/ui/lib/v4/digIndex.js";
import type { V4Map, V4OpenQuestion, V4Path } from "../../apps/ui/lib/v4/types.js";

/*
 * V4 initial, fix wave 1 (Decision A): digs are found again from the account's own question list, by text, because the
 * API has no dig link and V4 stores nothing in the browser.
 */

const CATALOG = Object.freeze({
  "v4.askText.place.ROMANIA": "This is about Romania.",
  "v4.askText.place.EU": "This is about the European Union as a whole.",
  "v4.askText.horizon.FIVE_YEARS": "Time frame: the next 5 years.",
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
  unchecked: 0, wouldChange: CHANGE.text, wouldChangeAlt: null, objections: [OBJECTION.text], storyState: "READY",
  fallbackText: null, reservation: false
};

function entry(runId: string, questionLine: string, createdAtSequence: number, firstSequence = createdAtSequence): IndexEntry {
  return { runId, questionLine, createdAtSequence, firstSequence };
}

type Row = Readonly<{ run: string; seq: number; open?: boolean; line?: string }>;

/** A fake GET /v1/answers over `rows` (newest first), paged by limit/offset like the API. */
function pagedIndex(rows: readonly Row[]) {
  return vi.fn(async (limit: number, offset: number) => {
    const page = rows.slice(offset, offset + limit);
    return {
      items: page.filter((row) => row.open !== true)
        .map((row) => ({ run_ref: row.run, question_line: row.line ?? `${row.run}?`, created_at_sequence: row.seq })),
      open_runs: page.filter((row) => row.open === true)
        .map((row) => ({ run_ref: row.run, question_line: row.line ?? `${row.run}?`, created_at_sequence: row.seq })),
      limit, offset, total: rows.length
    } as unknown as AnswerIndex;
  });
}

describe("readQuestionIndex", () => {
  it("joins answers and open runs, one entry per run, newest first, keeping each run's lowest sequence", async () => {
    const index = {
      items: [
        { run_ref: "run-a", question_line: "A?", created_at_sequence: 3 },
        { run_ref: "run-b", question_line: "B?", created_at_sequence: 5 },
        { run_ref: "run-a", question_line: "A?", created_at_sequence: 7 }
      ],
      open_runs: [{ run_ref: "run-c", question_line: "C?", created_at_sequence: 6 }],
      limit: 128, offset: 0, total: 4
    } as unknown as AnswerIndex;
    const readAnswerIndex = vi.fn(async () => index);
    const entries = await readQuestionIndex({ readAnswerIndex });
    expect(readAnswerIndex).toHaveBeenCalledWith(128, 0);
    expect(entries).toEqual([entry("run-a", "A?", 7, 3), entry("run-c", "C?", 6), entry("run-b", "B?", 5)]);
  });

  it("keeps the limit inside what the API allows (1..128)", async () => {
    const readAnswerIndex = vi.fn(async () => ({ items: [], open_runs: [], limit: 1, offset: 0, total: 0 }) as unknown as AnswerIndex);
    await readQuestionIndex({ readAnswerIndex }, { limit: 500 });
    await readQuestionIndex({ readAnswerIndex }, { limit: 0 });
    await readQuestionIndex({ readAnswerIndex }, { limit: 20 });
    expect(readAnswerIndex.mock.calls).toEqual([[128, 0], [1, 0], [20, 0]]);
  });

  const ROWS: readonly Row[] = [
    { run: "r7", seq: 70, open: true }, { run: "r6", seq: 60 },
    { run: "r5", seq: 50 }, { run: "r4", seq: 40 },
    { run: "r3", seq: 30 }, { run: "r2", seq: 20 },
    { run: "r1", seq: 10 }
  ];

  it("reads one page when no run is waited for, however long the list (R2DIG-6: re-reads)", async () => {
    const readAnswerIndex = pagedIndex(ROWS);
    const entries = await readQuestionIndex({ readAnswerIndex }, { limit: 2 });
    expect(readAnswerIndex.mock.calls).toEqual([[2, 0]]);
    expect(entries.map((item) => item.runId)).toEqual(["r7", "r6"]);
  });

  it("pages until the run has been seen, then the extra pages asked for (R2DIG-6)", async () => {
    const seen = pagedIndex(ROWS);
    expect((await readQuestionIndex({ readAnswerIndex: seen }, { limit: 2, untilRunId: "r4" })).map((item) => item.runId))
      .toEqual(["r7", "r6", "r5", "r4"]);
    expect(seen.mock.calls).toEqual([[2, 0], [2, 2]]);
    const extra = pagedIndex(ROWS);
    expect((await readQuestionIndex({ readAnswerIndex: extra }, { limit: 2, untilRunId: "r6", extraPages: 2 })).map((item) => item.runId))
      .toEqual(["r7", "r6", "r5", "r4", "r3", "r2"]);
    expect(extra.mock.calls).toEqual([[2, 0], [2, 2], [2, 4]]);
  });

  it("stops at the end of the list and at the page cap", async () => {
    const all = pagedIndex(ROWS);
    expect(await readQuestionIndex({ readAnswerIndex: all }, { limit: 2, untilRunId: "gone", extraPages: 5 })).toHaveLength(7);
    expect(all.mock.calls).toEqual([[2, 0], [2, 2], [2, 4], [2, 6]]);
    const capped = pagedIndex(ROWS);
    expect(await readQuestionIndex({ readAnswerIndex: capped }, { limit: 2, untilRunId: "r1", maxPages: 2 })).toHaveLength(4);
    expect(capped.mock.calls).toHaveLength(2);
    // The default cap is 10 pages.
    const long = pagedIndex(Array.from({ length: 30 }, (_, index) => ({ run: `x${index}`, seq: 100 - index })));
    await readQuestionIndex({ readAnswerIndex: long }, { limit: 1, untilRunId: "never" });
    expect(long.mock.calls).toHaveLength(10);
  });

  it("keeps one entry per run when rows shift between pages", async () => {
    // A new run arrived between the two reads, so r6 is listed on both pages.
    let call = 0;
    const readAnswerIndex = vi.fn(async (limit: number, offset: number) => {
      call += 1;
      const rows = call === 1 ? ROWS : [{ run: "r8", seq: 80 }, ...ROWS];
      return pagedIndex(rows)(limit, offset);
    });
    const entries = await readQuestionIndex({ readAnswerIndex }, { limit: 2, untilRunId: "r5" });
    expect(entries.map((item) => item.runId)).toEqual(["r7", "r6", "r5"]);
  });

  it("lets a failed read reach the caller", async () => {
    await expect(readQuestionIndex({ readAnswerIndex: async () => { throw new Error("offline"); } })).rejects.toThrow("offline");
  });
});

describe("mergeIndex", () => {
  it("merges a re-read by run, keeping the lowest first sequence and the newest row, newest first", () => {
    const known = [entry("run-b", "B?", 5), entry("run-a", "A?", 3)];
    // run-a's answer was recomposed (a newer row); run-c is new.
    const fresh = [entry("run-a", "A? (new row)", 9), entry("run-c", "C?", 7)];
    expect(mergeIndex(known, fresh)).toEqual([entry("run-a", "A? (new row)", 9, 3), entry("run-c", "C?", 7), entry("run-b", "B?", 5)]);
    expect(mergeIndex([], [])).toEqual([]);
    expect(mergeIndex(fresh, known)).toEqual(mergeIndex(known, fresh));
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

describe("digLinksFor: one parent per dig (R2DIG-1, R2REG-1)", () => {
  const WORDS = "Should Romania build more nuclear plants?";
  const IN_RO = `${WORDS}\n\nThis is about Romania.`;
  const IN_EU = `${WORDS}\n\nThis is about the European Union as a whole.`;

  it("a re-ask with the same words but other added lines keeps its own digs", () => {
    const digA = digQuestion({ kind: "path", path: PATH }, IN_RO, CATALOG, "en");
    const digB = digQuestion({ kind: "path", path: PATH }, IN_EU, CATALOG, "en");
    const index = [entry("dig-b", digB, 6), entry("dig-a", digA, 5), entry("run-b", IN_EU, 3), entry("run-a", IN_RO, 1)];
    expect(digLinksFor("run-a", IN_RO, MAP, index, CATALOG).map((link) => link.childRunId)).toEqual(["dig-a"]);
    expect(digLinksFor("run-b", IN_EU, MAP, index, CATALOG).map((link) => link.childRunId)).toEqual(["dig-b"]);
  });

  it("the same question asked twice: a dig belongs to the newest one asked before it", () => {
    const dig = digQuestion({ kind: "path", path: PATH }, IN_RO, CATALOG, "en");
    const index = [entry("dig-late", dig, 5), entry("run-b", IN_RO, 3), entry("dig-early", dig, 2), entry("run-a", IN_RO, 1)];
    expect(digLinksFor("run-a", IN_RO, MAP, index, CATALOG).map((link) => link.childRunId)).toEqual(["dig-early"]);
    expect(digLinksFor("run-b", IN_RO, MAP, index, CATALOG).map((link) => link.childRunId)).toEqual(["dig-late"]);
  });

  it("a recomposed parent (a newer answer row) keeps its digs: 'older' uses the lowest sequence seen", () => {
    const dig = digQuestion({ kind: "path", path: PATH }, IN_RO, CATALOG, "en");
    const index = [entry("run-a", IN_RO, 9, 1), entry("dig", dig, 5)];
    expect(digLinksFor("run-a", IN_RO, MAP, index, CATALOG).map((link) => link.childRunId)).toEqual(["dig"]);
  });

  it("a debate asked after the dig never claims it", () => {
    const dig = digQuestion({ kind: "path", path: PATH }, IN_RO, CATALOG, "en");
    expect(digLinksFor("run-late", IN_RO, MAP, [entry("run-late", IN_RO, 7), entry("dig", dig, 5), entry("run-a", IN_RO, 1)], CATALOG))
      .toEqual([]);
  });

  it("when the parent is not in the list yet, its digs are still found unless a listed debate fits better", () => {
    const dig = digQuestion({ kind: "path", path: PATH }, IN_RO, CATALOG, "en");
    expect(digLinksFor("run-a", IN_RO, MAP, [entry("dig", dig, 5)], CATALOG).map((link) => link.childRunId)).toEqual(["dig"]);
    expect(digLinksFor("run-a", IN_RO, MAP, [entry("dig", dig, 5), entry("run-b", IN_RO, 3)], CATALOG)).toEqual([]);
  });

  it("a question that really ends in '…' is not a cut of a longer one (R2DIG-8)", () => {
    const short = "Should I quit my job…";
    const long = "Should I quit my job to study law?";
    const dig = digQuestion({ kind: "path", path: PATH }, short, CATALOG, "en");
    const index = [entry("dig", dig, 5), entry("run-long", long, 3), entry("run-short", short, 1)];
    expect(digLinksFor("run-short", short, MAP, index, CATALOG).map((link) => link.childRunId)).toEqual(["dig"]);
    expect(digLinksFor("run-long", long, MAP, index, CATALOG)).toEqual([]);
    expect(digParentOf("dig", dig, index, CATALOG)?.runId).toBe("run-short");
  });

  it("a parent cut for length still matches the debate it was cut from", () => {
    const longWords = `${"Should we build ".repeat(700)}?`;
    const dig = digQuestion({ kind: "path", path: PATH }, longWords, CATALOG, "en");
    expect(dig).toContain("…”");
    const index = [entry("dig", dig, 5), entry("run-long", longWords, 1)];
    expect(digLinksFor("run-long", longWords, MAP, index, CATALOG).map((link) => link.childRunId)).toEqual(["dig"]);
  });
});

describe("digLinksFor: placing items (R2DIG-4, R2REG-2, R2DIG-8)", () => {
  const STORY_TEXT = "The answer would change if gas stayed cheap for twenty years.";
  const RAW_TEXT = "Cheap gas for twenty years.";
  const READY_MAP: V4Map = {
    ...MAP,
    open: [OBJECTION, { ...CHANGE, text: STORY_TEXT }],
    wouldChange: STORY_TEXT,
    wouldChangeAlt: RAW_TEXT
  };

  it("a dig sent before the story was ready still hangs under 'w' once the story's text is used", () => {
    const english = digQuestion({ kind: "open", questions: [{ ...CHANGE, text: RAW_TEXT }] }, PARENT_LINE, CATALOG, "en");
    const romanian = digQuestion({ kind: "open", questions: [{ ...CHANGE, text: RAW_TEXT }] }, PARENT_LINE, CATALOG, "ro");
    const index = [entry("dig-ro", romanian, 6), entry("dig-en", english, 5), entry("run-parent", PARENT_LINE, 1)];
    expect(digLinksFor("run-parent", PARENT_LINE, READY_MAP, index, CATALOG).map((link) => link.openQuestionIds))
      .toEqual([["w"], ["w"]]);
  });

  it("in English, any 'Would this change the answer?' item hangs under 'w'", () => {
    const other = digQuestion({ kind: "open", questions: [{ ...CHANGE, text: "Some older wording entirely." }] }, PARENT_LINE, CATALOG, "en");
    const index = [entry("dig", other, 5), entry("run-parent", PARENT_LINE, 1)];
    expect(digLinksFor("run-parent", PARENT_LINE, READY_MAP, index, CATALOG)[0]?.openQuestionIds).toEqual(["w"]);
    // Not when the map has no 'w' any more.
    const noW: V4Map = { ...READY_MAP, open: [OBJECTION], wouldChange: null, wouldChangeAlt: null };
    expect(digLinksFor("run-parent", PARENT_LINE, noW, index, CATALOG)[0]?.openQuestionIds).toEqual([]);
  });

  it("a cut item matches only when enough of it is kept (80 characters)", () => {
    const longText = `${"Building costs keep falling across the region ".repeat(4)}and beyond.`;
    const longArgued = { ...ARGUED, text: longText };
    const map: V4Map = { ...MAP, paths: [{ ...PATH, open: [longArgued] }], open: [OBJECTION] };
    const cutLine = `Does this hold up, and when? ${Array.from(longText).slice(0, 90).join("").trimEnd()}…\n\n`
      + "This follows from an earlier question: “Should Romania build more nuclear plants?”\nThis is about Romania.";
    const tooShort = "Does this hold up, and when? Buil…\n\n"
      + "This follows from an earlier question: “Should Romania build more nuclear plants?”\nThis is about Romania.";
    const index = [entry("dig-short", tooShort, 6), entry("dig-cut", cutLine, 5), entry("run-parent", PARENT_LINE, 1)];
    expect(digLinksFor("run-parent", PARENT_LINE, map, index, CATALOG).map((link) => [link.childRunId, link.openQuestionIds]))
      .toEqual([["dig-cut", ["p:n2"]], ["dig-short", []]]);
  });
});

describe("digParentOf (R2DIG-2)", () => {
  it("finds the newest matching question asked BEFORE the dig, never one asked after it", () => {
    const child = digQuestion({ kind: "path", path: PATH }, PARENT_LINE, CATALOG, "en");
    const index = [
      entry("run-after", PARENT_LINE, 12),
      entry("run-child", child, 9),
      entry("run-newer-same", PARENT_LINE, 4),
      entry("run-parent", PARENT_LINE, 2)
    ];
    expect(digParentOf("run-child", child, index, CATALOG)?.runId).toBe("run-newer-same");
  });

  it("prefers the question whose added lines the dig carried", () => {
    const child = digQuestion({ kind: "path", path: PATH }, PARENT_LINE, CATALOG, "en");
    const index = [
      entry("run-child", child, 9),
      entry("run-other-lines", "Should Romania build more nuclear plants?\n\nTime frame: the next 5 years.", 4),
      entry("run-parent", PARENT_LINE, 2)
    ];
    expect(digParentOf("run-child", child, index, CATALOG)?.runId).toBe("run-parent");
  });

  it("walks a dig of a dig one step up", () => {
    const first = digQuestion({ kind: "open", questions: [ARGUED] }, PARENT_LINE, CATALOG, "en");
    const second = digQuestion({ kind: "path", path: PATH }, first, CATALOG, "en");
    const index = [entry("run-2", second, 3), entry("run-1", first, 2), entry("run-0", PARENT_LINE, 1)];
    expect(digParentOf("run-2", second, index, CATALOG)?.runId).toBe("run-1");
    expect(digParentOf("run-1", first, index, CATALOG)?.runId).toBe("run-0");
  });

  it("when the child is not listed yet, every listed entry counts as older", () => {
    const child = digQuestion({ kind: "path", path: PATH }, PARENT_LINE, CATALOG, "en");
    expect(digParentOf("run-child", child, [entry("run-parent", PARENT_LINE, 2)], CATALOG)?.runId).toBe("run-parent");
  });

  it("is null for a question that is not a dig, or whose parent is not in the list", () => {
    expect(digParentOf("run-0", PARENT_LINE, [entry("run-0", PARENT_LINE, 1)], CATALOG)).toBeNull();
    const child = digQuestion({ kind: "path", path: PATH }, PARENT_LINE, CATALOG, "en");
    expect(digParentOf("run-child", child, [entry("run-child", child, 2)], CATALOG)).toBeNull();
  });
});
