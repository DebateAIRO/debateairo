import { describe, expect, it, vi } from "vitest";
import type { DigLinkRecord, DigLinks } from "@debateai/contract";
import {
  mergeDigLinks, questionsAtPlaces, readAccountLevel, readDigRecords, readLastVisit, recordDig, recordLastVisit, saveAccountLevel,
  storableItems
} from "../../apps/ui/lib/v4/accountMemory.js";
import type { DigLink, V4Map, V4OpenQuestion, V4Path } from "../../apps/ui/lib/v4/types.js";

/*
 * V4 account memory (owner rulings N7 and N11, 2026-10-29): the page side. Reads throw (so a page can fall back to what it
 * did without memory); writes never throw and send nothing the account cannot keep; recorded digs decide which debates
 * are digs, and the text index finds only the ones without a record.
 */

const ZERO = { SURE: 0, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 };
const open = (id: string, kind: V4OpenQuestion["kind"], text: string, pathId: string | null): V4OpenQuestion =>
  ({ id, kind, text, star: false, pathId });
const ARGUED = open("p:n2", "STILL_ARGUED", "Building costs keep falling.", "path-1");
const OBJECTION = open("o:0", "OBJECTION", "Nuclear waste has no lasting solution.", null);
const PATH: V4Path = { id: "path-1", fate: "HELD_UP", line: "Nuclear power keeps the grid steady.", points: [], counts: ZERO, unchecked: 0, open: [ARGUED] };
const MAP: V4Map = {
  runId: "run-parent", answerId: "ans-1", answerVersion: 1, question: "Should Romania build more nuclear plants?", headline: null,
  summary: null, confidence: null, why: [], sections: [], paths: [PATH], points: [], open: [OBJECTION], counts: ZERO, unchecked: 0,
  wouldChange: null, wouldChangeAlt: null, objections: [OBJECTION.text], storyState: "READY", fallbackText: null, reservation: false
};
const PARENT = "11111111-1111-4111-8111-111111111111";
const OLD_DIG = "22222222-2222-4222-8222-222222222222";
const NEW_DIG = "33333333-3333-4333-8333-333333333333";
const BOTH_DIG = "44444444-4444-4444-8444-444444444444";

const record = (child: string, places: readonly string[], mode: "quick" | "thorough", at: string): DigLinkRecord =>
  ({ parent_run_id: PARENT, child_run_id: child, places: [...places], mode, created_at: at });
const textLink = (child: string, questions: readonly string[], ids: readonly string[] = []): DigLink =>
  ({ parentRunId: PARENT, childRunId: child, openQuestionIds: ids, questions, mode: null, startedAt: null });

describe("the reading level in the account", () => {
  it("reads the account's level (null before a choice) and throws when it cannot be read", async () => {
    expect(await readAccountLevel({ readReadingLevel: async () => ({ reading_level: "expert" }), saveReadingLevel: vi.fn() })).toBe("expert");
    expect(await readAccountLevel({ readReadingLevel: async () => ({ reading_level: null }), saveReadingLevel: vi.fn() })).toBeNull();
    await expect(readAccountLevel({ readReadingLevel: async () => { throw new Error("offline"); }, saveReadingLevel: vi.fn() })).rejects.toThrow("offline");
  });

  it("saves best-effort: true when saved, false on any failure, never a throw (even one thrown at once)", async () => {
    const saveReadingLevel = vi.fn(async () => ({ reading_level: "plain" as const }));
    expect(await saveAccountLevel("plain", { readReadingLevel: vi.fn(), saveReadingLevel })).toBe(true);
    expect(saveReadingLevel).toHaveBeenCalledWith("plain");
    expect(await saveAccountLevel("plain", { readReadingLevel: vi.fn(), saveReadingLevel: async () => { throw new Error("503"); } })).toBe(false);
    expect(await saveAccountLevel("plain", { readReadingLevel: vi.fn(), saveReadingLevel: () => { throw new Error("sync"); } })).toBe(false);
  });
});

describe("the last visit in the account", () => {
  it("reads null before a first visit, the snapshot after one, and throws when it cannot be read", async () => {
    const client = (visit: unknown) => ({ readLastVisit: async () => visit as never, recordLastVisit: vi.fn() });
    expect(await readLastVisit("run", client({ seen_at: null, items: null }))).toBeNull();
    expect(await readLastVisit("run", client({ seen_at: "2026-10-29T08:00:00.000Z", items: { "point:n-1": "SURE" } })))
      .toEqual({ at: "2026-10-29T08:00:00.000Z", items: { "point:n-1": "SURE" } });
    await expect(readLastVisit("run", { readLastVisit: async () => { throw new Error("404"); }, recordLastVisit: vi.fn() })).rejects.toThrow("404");
  });

  it("keeps only the entries the account can store, and the same filter applies to what is compared", () => {
    expect(storableItems({ "point:n-1": "SURE", "point:a b": "SURE", "point:café": "SURE", "path:p": "two words", "dig:x": "DONE" }))
      .toEqual({ "point:n-1": "SURE", "dig:x": "DONE" });
  });

  it("saves the storable snapshot, sends nothing over the limits, and never throws", async () => {
    const recordLastVisitCall = vi.fn(async () => ({ seen_at: "2026-10-29T08:00:00.000Z" }));
    const client = { readLastVisit: vi.fn(), recordLastVisit: recordLastVisitCall };
    expect(await recordLastVisit("run", { "point:n-1": "SURE", "point:a b": "SURE" }, client)).toBe(true);
    expect(recordLastVisitCall).toHaveBeenCalledWith("run", { "point:n-1": "SURE" });
    const tooMany = Object.fromEntries(Array.from({ length: 513 }, (_, at) => [`point:${at}`, "SURE"]));
    expect(await recordLastVisit("run", tooMany, client)).toBe(false);
    expect(recordLastVisitCall).toHaveBeenCalledTimes(1);
    expect(await recordLastVisit("run", { "point:n-1": "SURE" }, { readLastVisit: vi.fn(), recordLastVisit: async () => { throw new Error("500"); } })).toBe(false);
  });
});

describe("the dig records in the account (N11)", () => {
  it("records a dig with the places the account can keep (at most 16), skipping a dig without a mode; never throws", async () => {
    const recordDigLink = vi.fn(async () => ({ recorded: true as const }));
    const client = { readDigLinks: vi.fn(), recordDigLink };
    const link: DigLink = { parentRunId: PARENT, childRunId: NEW_DIG, openQuestionIds: ["p:n2", "path:has space", "o:0"], questions: [], mode: "thorough", startedAt: null };
    expect(await recordDig(link, client)).toBe(true);
    expect(recordDigLink).toHaveBeenCalledWith(PARENT, { child_run_id: NEW_DIG, places: ["p:n2", "o:0"], mode: "thorough" });
    const many = { ...link, openQuestionIds: Array.from({ length: 20 }, (_, at) => `o:${at}`) };
    await recordDig(many, client);
    expect((recordDigLink.mock.calls.at(-1) as unknown as [string, { places: string[] }])[1].places).toHaveLength(16);
    expect(await recordDig({ ...link, mode: null }, client)).toBe(false);
    expect(recordDigLink).toHaveBeenCalledTimes(2);
    expect(await recordDig(link, { readDigLinks: vi.fn(), recordDigLink: async () => { throw new Error("409"); } })).toBe(false);
  });

  it("reads the records, and lets a failed read reach the caller", async () => {
    const links: DigLinks = { parent: null, children: [] };
    expect(await readDigRecords("run", { readDigLinks: async () => links, recordDigLink: vi.fn() })).toBe(links);
    await expect(readDigRecords("run", { readDigLinks: async () => { throw new Error("offline"); }, recordDigLink: vi.fn() })).rejects.toThrow("offline");
  });

  it("names the questions at a dig's places from the map; unknown places add nothing", () => {
    expect(questionsAtPlaces(["p:n2", "path:path-1", "o:0", "o:9", "path:gone"], MAP))
      .toEqual(["Building costs keep falling.", "Nuclear power keeps the grid steady.", "Nuclear waste has no lasting solution."]);
    expect(questionsAtPlaces(["p:n2"], null)).toEqual([]);
  });

  it("lets the records decide the digs: text-only digs first, then the recorded ones with their places, mode and start", () => {
    const records: DigLinks = { parent: null, children: [
      record(NEW_DIG, ["o:0"], "quick", "2026-10-29T08:00:00.000Z"),
      record(BOTH_DIG, ["p:n2"], "thorough", "2026-10-29T09:00:00.000Z")
    ] };
    const byText = [textLink(OLD_DIG, ["An old dig's question."]), textLink(BOTH_DIG, ["Does this hold up, and when?"], ["w"])];
    expect(mergeDigLinks(records, byText, MAP)).toEqual([
      textLink(OLD_DIG, ["An old dig's question."]),
      { parentRunId: PARENT, childRunId: NEW_DIG, openQuestionIds: ["o:0"], questions: ["Nuclear waste has no lasting solution."],
        mode: "quick", startedAt: "2026-10-29T08:00:00.000Z" },
      // Found both ways: the record's link (places, mode, start) with the text's own questions.
      { parentRunId: PARENT, childRunId: BOTH_DIG, openQuestionIds: ["p:n2"], questions: ["Does this hold up, and when?"],
        mode: "thorough", startedAt: "2026-10-29T09:00:00.000Z" }
    ]);
  });

  it("falls back to the digs found by text when the records could not be read", () => {
    const byText = [textLink(OLD_DIG, ["An old dig's question."])];
    expect(mergeDigLinks(null, byText, MAP)).toBe(byText);
    expect(mergeDigLinks({ parent: null, children: [] }, byText, MAP)).toEqual(byText);
  });
});
