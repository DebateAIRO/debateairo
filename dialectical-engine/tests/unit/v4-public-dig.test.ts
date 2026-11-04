import { describe, expect, it } from "vitest";
// The contract's index first, then its client (the client's own imports read the index's schemas).
import { PublicDebateSchema, type Answer, type RunProjection } from "../../packages/contract/src/index.js";
import { ContractHttpError } from "../../packages/contract/src/client.js";
import {
  newWordMarks, progressOfAnswer, progressSettled, publicDigAnchor, publicDigParentKey, publicDigShareLine, publicPathAnchor, publicSuggestionsFor,
  readPublicDigProgress, stopsReached, waitingPublicDig
} from "../../apps/ui/lib/v4/publicDig.js";
import { publicPageHref, publicStageOf, readPublicStage, stageMayChange, typedGoesPublic } from "../../apps/ui/lib/v4/publicState.js";
import type { DigUndoEntry } from "../../apps/ui/lib/v4/digUndo.js";
import { PUBLIC_DIG_SUGGESTIONS, PUBLIC_REF, PUBLIC_UPDATE_REF, seedPublicDebates } from "../../tools/v4-mock-api/public-seed.js";

/*
 * V4 screen review (owner picks 3 Nov 2026): the public dig flow's own rules (lib/v4/publicDig.ts: public-f11, public-d2 A, dig-f25) and a debate's
 * public state for the globe line (lib/v4/publicState.ts: public-f26, journey-f20). Nothing here is kept in the browser.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const answerWith = (contribution: Loose): Answer => ({ contribution } as unknown as Answer);
const BEFORE = "Free fares for everyone: partly held. They help people with little money, but few drivers switch.";

describe("a public page's place in the site's one Undo list (public-f11)", () => {
  it("is the page's reference and the dig it hangs under, never a run id; one waiting dig per box", () => {
    expect(publicDigParentKey(PUBLIC_REF, null)).toBe(`public:${PUBLIC_REF}`);
    expect(publicDigParentKey(PUBLIC_REF, PUBLIC_UPDATE_REF)).toBe(`public:${PUBLIC_REF}/${PUBLIC_UPDATE_REF}`);
    const entry = (phase: DigUndoEntry["phase"], parentRunId = `public:${PUBLIC_REF}`, targetKey = "picks:p-fares"): DigUndoEntry =>
      ({ id: 1, parentRunId, runIds: [], dig: {} as never, targetKey, sharePercent: null, showMode: false, period: "today", phase, focused: false,
        slow: false, result: null });
    const path = { ref: "p-fares", digRef: null };
    expect(waitingPublicDig([entry("COUNTING")], PUBLIC_REF, path)?.id).toBe(1);
    expect(waitingPublicDig([entry("SENDING")], PUBLIC_REF, path)?.id).toBe(1);
    for (const phase of ["STARTED", "REFUSED", "CANCELLED"] as const) expect(waitingPublicDig([entry(phase)], PUBLIC_REF, path)).toBeNull();
    // Another path, or the same path under a dig, is another box.
    expect(waitingPublicDig([entry("COUNTING", undefined, "picks:p-service")], PUBLIC_REF, path)).toBeNull();
    expect(waitingPublicDig([entry("COUNTING")], PUBLIC_REF, { ref: "p-fares", digRef: PUBLIC_UPDATE_REF })).toBeNull();
  });

  it("the share before the press is the room read's own share for a dig, never a new question's; Free's says the month", () => {
    expect(publicDigShareLine(null, "premium")).toBeNull();
    // Today a public page's room read is a new question's: its share is never shown as the dig's.
    expect(publicDigShareLine({ start_share_percent: 10 } as Loose, "premium")).toBeNull();
    expect(publicDigShareLine({ dig_share_percent: 0 } as Loose, "premium")).toBeNull();
    expect(publicDigShareLine({ dig_share_percent: 5 } as Loose, "premium")).toEqual({ key: "v4.public.dig.shareToday", values: { percent: 5 } });
    expect(publicDigShareLine({ dig_share_percent: 5 } as Loose, "free")).toEqual({ key: "v4.public.dig.shareMonth", values: { percent: 5 } });
  });
});

describe("what became of a started dig: the card's two stops and one outcome (public-d2 A)", () => {
  it("reads the digger's own contribution: checking, kept, removed, on the page with its new text, or confirmed when nothing changed", () => {
    expect(progressOfAnswer(answerWith({ public_ref: PUBLIC_REF, state: "CHECKING" }), BEFORE)).toEqual({ kind: "CHECKING" });
    expect(progressOfAnswer(answerWith({ public_ref: PUBLIC_REF, state: "KEPT_PRIVATE" }), BEFORE)).toEqual({ kind: "KEPT_PRIVATE" });
    expect(progressOfAnswer(answerWith({ public_ref: PUBLIC_REF, state: "REMOVED_AFTER_REVIEW" }), BEFORE)).toEqual({ kind: "REMOVED" });
    // A dig that never joined the page has no contribution: it is the person's own (public-f10).
    expect(progressOfAnswer(answerWith(undefined), BEFORE)).toEqual({ kind: "KEPT_PRIVATE" });
    const after = "Free fares for everyone: partly held, also in small towns.";
    expect(progressOfAnswer(answerWith({ public_ref: PUBLIC_REF, state: "ON_THE_PAGE", rewrite: { line: after, summary: "s", fate: "PARTLY_HELD", what_changed: ["x"] } }), BEFORE))
      .toEqual({ kind: "ON_THE_PAGE", after });
    // The same text (spaces aside) and nothing changed: "Confirmed: the answer holds."
    expect(progressOfAnswer(answerWith({ public_ref: PUBLIC_REF, state: "ON_THE_PAGE", rewrite: { line: ` ${BEFORE.replace(/ /gu, "  ")} `, summary: "s", fate: "PARTLY_HELD", what_changed: [] } }), BEFORE))
      .toEqual({ kind: "CONFIRMED" });
    // On the page with its new text not given yet: never called "confirmed".
    expect(progressOfAnswer(answerWith({ public_ref: PUBLIC_REF, state: "ON_THE_PAGE", rewrite: null }), BEFORE)).toEqual({ kind: "ON_THE_PAGE", after: null });
  });

  it("the stops: none while running or failed, the dig once checking, both once there is an outcome", () => {
    expect(stopsReached(null)).toEqual({ dug: false, checked: false });
    expect(stopsReached({ kind: "RUNNING", wait: { kind: "LOOKING" } })).toEqual({ dug: false, checked: false });
    expect(stopsReached({ kind: "FAILED" })).toEqual({ dug: false, checked: false });
    expect(stopsReached({ kind: "CHECKING" })).toEqual({ dug: true, checked: false });
    for (const kind of ["CONFIRMED", "KEPT_PRIVATE", "REMOVED"] as const) expect(stopsReached({ kind })).toEqual({ dug: true, checked: true });
    expect(progressSettled({ kind: "CHECKING" })).toBe(false);
    expect(progressSettled({ kind: "CONFIRMED" })).toBe(true);
    expect(progressSettled(null)).toBe(false);
  });

  it("reads the dig's own run, then its answer once settled; a run that is gone or failed did not finish; an unreachable server throws", async () => {
    const run = (state: RunProjection["state"], extra: Loose = {}): RunProjection => ({ state, hold_until: null, ...extra } as unknown as RunProjection);
    const notFound = new ContractHttpError("NOT_FOUND", 404, "RUN_NOT_FOUND", "RUN_NOT_FOUND");
    const client = (read: () => Promise<RunProjection>, answer: () => Promise<Answer> = async () => answerWith({ public_ref: PUBLIC_REF, state: "CHECKING" })) =>
      ({ readRun: read, readRunAnswer: answer }) as Loose;
    expect(await readPublicDigProgress("r", BEFORE, client(async () => { throw notFound; }))).toEqual({ kind: "FAILED" });
    expect(await readPublicDigProgress("r", BEFORE, client(async () => run("FAILED")))).toEqual({ kind: "FAILED" });
    expect(await readPublicDigProgress("r", BEFORE, client(async () => run("RUNNING")))).toEqual({ kind: "RUNNING", wait: { kind: "LOOKING" } });
    expect(await readPublicDigProgress("r", BEFORE, client(async () => run("WAITING", { waits_until: "2026-11-05T08:00:00.000Z" }))))
      .toEqual({ kind: "RUNNING", wait: { kind: "WAITING", startsAfter: "2026-11-05T08:00:00.000Z" } });
    expect(await readPublicDigProgress("r", BEFORE, client(async () => run("SETTLED")))).toEqual({ kind: "CHECKING" });
    expect(await readPublicDigProgress("r", BEFORE, client(async () => run("SETTLED"), async () => { throw notFound; }))).toEqual({ kind: "RUNNING", wait: { kind: "LOOKING" } });
    await expect(readPublicDigProgress("r", BEFORE, client(async () => { throw new TypeError("offline"); }))).rejects.toThrow("offline");
  });
});

describe("new words underlined (public-d2 A)", () => {
  const added = (before: string, after: string): string[] => newWordMarks(before, after).filter((mark) => mark.added).map((mark) => mark.text);
  it("marks only the words that are not in the old text, in order; case and punctuation aside", () => {
    expect(added("Free fares help people.", "Free fares help people, also in small towns.")).toEqual(["also in small towns."]);
    expect(added("Better service first.", "better service, first")).toEqual([]);
    expect(added("A B C", "A X C")).toEqual(["X"]);
    // The whole text comes back, word for word and space for space.
    const after = "Free  fares help\npeople, also in small towns.";
    expect(newWordMarks("Free fares help people.", after).map((mark) => mark.text).join("")).toBe(after);
  });
  it("a space is underlined only between two new words; punctuation alone is never new; nothing new, nothing underlined", () => {
    const marks = newWordMarks("one two", "one new words two");
    expect(marks).toEqual([{ text: "one ", added: false }, { text: "new words", added: true }, { text: " two", added: false }]);
    expect(added("one two", "one — two")).toEqual([]);
    expect(added("Same text.", "Same text.")).toEqual([]);
    expect(newWordMarks("anything", "")).toEqual([]);
  });
  it("a very long text is compared no further: shown plain", () => {
    const long = Array.from({ length: 401 }, (_, at) => `w${String(at)}`).join(" ");
    expect(newWordMarks("short", long)).toEqual([{ text: long, added: false }]);
  });
});

describe("the path's own suggestions on the public read (public-d2 A, an optional field the server does not send yet)", () => {
  const debate = (): Loose => PublicDebateSchema.parse(seedPublicDebates()[0]);
  it("absent today: no chips, the box is as before", () => {
    expect(publicSuggestionsFor(debate(), { ref: "p-fares", digRef: null })).toEqual([]);
  });
  it("when there: the path's own, each once, a dug one with its day and dig; another path's and a malformed one are left out", () => {
    const page = { ...debate(), dig_suggestions: [
      ...PUBLIC_DIG_SUGGESTIONS,
      { position_ref: "p-fares", dig_ref: PUBLIC_UPDATE_REF, suggestions: [{ suggestion_id: "under-a-dig", kind: "UNDOCUMENTED", side: null, text: "Under the dig.", places: ["path:p-fares"] }] }
    ] };
    const fares = publicSuggestionsFor(page, { ref: "p-fares", digRef: null });
    expect(fares.map((chip) => chip.suggestion.suggestion_id)).toEqual(["pub-fares-towns", "pub-fares-drivers"]);
    expect(fares[0]).toMatchObject({ dugOn: "2026-10-28", dugRef: PUBLIC_UPDATE_REF });
    expect(fares[1]).toMatchObject({ dugOn: null, dugRef: null });
    expect(publicSuggestionsFor(page, { ref: "p-fares", digRef: PUBLIC_UPDATE_REF }).map((chip) => chip.suggestion.suggestion_id)).toEqual(["under-a-dig"]);
    const broken = { ...debate(), dig_suggestions: [{ position_ref: "p-fares", suggestions: [
      { suggestion_id: "ok", kind: "UNDOCUMENTED", side: null, text: "Fine.", places: ["path:p-fares"], dug_on: "yesterday", dug_ref: PUBLIC_UPDATE_REF },
      { suggestion_id: "ok", kind: "UNDOCUMENTED", side: null, text: "Twice.", places: ["path:p-fares"] },
      { suggestion_id: "bad", kind: "HELPS_MAIN_QUESTION", side: null, text: "No side.", places: ["path:p-fares"] },
      "not a suggestion"
    ] }] };
    const kept = publicSuggestionsFor(broken, { ref: "p-fares", digRef: null });
    // A "dug near" day that is not a day is no dug mark; the duplicate and the malformed one are dropped.
    expect(kept).toEqual([expect.objectContaining({ dugOn: null, dugRef: null, suggestion: expect.objectContaining({ suggestion_id: "ok", text: "Fine." }) })]);
  });
  it("names the places on the page a dug chip and \"See it on the page\" go to", () => {
    expect(publicPathAnchor({ ref: "p-fares", digRef: null })).toBe("public-path-root-p-fares");
    expect(publicPathAnchor({ ref: "p-towns", digRef: PUBLIC_UPDATE_REF })).toBe(`public-path-${PUBLIC_UPDATE_REF}-p-towns`);
    expect(publicDigAnchor(PUBLIC_UPDATE_REF)).toBe(`public-dig-${PUBLIC_UPDATE_REF}`);
  });
});

describe("a debate's public state for the globe line (public-f26, journey-f20)", () => {
  it("PUBLISHED with a reference is public; PRIVATE alone shows nothing; the stages before and after the check come only from the optional field", () => {
    expect(publicStageOf({ state: "PUBLISHED", public_ref: PUBLIC_REF })).toEqual({ kind: "PUBLIC", publicRef: PUBLIC_REF });
    expect(publicStageOf({ state: "PUBLISHED", public_ref: null })).toBeNull();
    expect(publicStageOf({ state: "PRIVATE", public_ref: null })).toBeNull();
    for (const kind of ["WILL_BE_PUBLIC", "BEING_CHECKED", "KEPT_PRIVATE"] as const) {
      expect(publicStageOf({ state: "PRIVATE", public_ref: null, public_stage: kind })).toEqual({ kind });
    }
    expect(publicStageOf({ state: "PRIVATE", public_ref: null, public_stage: "PUBLIC" })).toBeNull();
    expect(publicPageHref(PUBLIC_REF)).toBe(`/public/debate/${PUBLIC_REF}`);
  });
  it("only the stages before the check change by themselves; typed words go public unless the debate was kept private", () => {
    expect(stageMayChange({ kind: "WILL_BE_PUBLIC" })).toBe(true);
    expect(stageMayChange({ kind: "BEING_CHECKED" })).toBe(true);
    expect(stageMayChange({ kind: "PUBLIC", publicRef: PUBLIC_REF })).toBe(false);
    expect(stageMayChange({ kind: "KEPT_PRIVATE" })).toBe(false);
    expect(stageMayChange(null)).toBe(false);
    expect(typedGoesPublic(null)).toBe(false);
    expect(typedGoesPublic({ kind: "KEPT_PRIVATE" })).toBe(false);
    expect(typedGoesPublic({ kind: "PUBLIC", publicRef: PUBLIC_REF })).toBe(true);
    expect(typedGoesPublic({ kind: "WILL_BE_PUBLIC" })).toBe(true);
  });
  it("a read that fails, or a client without the read, says nothing (never a guess)", async () => {
    expect(await readPublicStage("r", { readRunVisibility: async () => ({ state: "PUBLISHED", public_ref: PUBLIC_REF }) })).toEqual({ kind: "PUBLIC", publicRef: PUBLIC_REF });
    expect(await readPublicStage("r", { readRunVisibility: async () => { throw new TypeError("offline"); } })).toBeNull();
    expect(await readPublicStage("r", {} as Loose)).toBeNull();
  });
});
