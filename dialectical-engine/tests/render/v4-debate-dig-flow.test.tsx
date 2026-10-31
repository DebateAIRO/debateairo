// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskParentSchema, DIG_LEVEL_MAX, FREE_DIG_PICKS_MAX } from "../../packages/contract/src/index.js";
import {
  advance, branch, buttonNamed, buttonsNamed, CATALOG, click, digPart, harness, mountMap, openPath, page, panel, PATHS, resetHarness,
  seededAnswer, seededStory, settle, text, tray, typeInto, unmountMap
} from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * The first click test of V4DebateClient's dig flow (Perplexity plan W3-4): row D decision 1 (a dig starts at once with
 * a 10-second Undo and nothing is sent before then), and since W3-4 the dig is sent with its `parent` (AskParentSchema):
 * the debate it digs, its places (its path first), the mode, and its picks — suggestions with their text as sent, edited
 * or not, and the person's own view. Only the reads and the ask itself are stand-ins (v4-debate-harness.tsx).
 */

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const panelBoxes = (): HTMLInputElement[] => [...panel().querySelectorAll<HTMLInputElement>(".v4Sugs input[type=checkbox]")];

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("V4DebateClient's dig flow", () => {
  it("sends the picks of one path after 10 seconds, with their parent, and shows the dig on the map", async () => {
    const runId = await mountMap();
    await openPath(PATHS.renew);
    await click(buttonNamed(CATALOG["v4.digMode.thorough"]!, panel()));
    await click(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())[0]!);
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "Can batteries cover a windless week here?");
    await click(buttonNamed(CATALOG["v4.suggest.editDone"]!, panel()));
    await click(panelBoxes()[2]!);
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "Pumped hydro could carry a windless week.");
    await click(buttonNamed(CATALOG["v4.suggest.ownViewAdd"]!, panel()));
    // The room read is for this dig, so it can say the dig's share of today.
    expect(harness.digRooms.at(-1)).toEqual({ parentRunId: runId, picks: 3 });

    await click(buttonNamed(word("v4.dig.trayDig.other", { count: 3 }), tray()!));
    await advance(9_500);
    expect(harness.submit).not.toHaveBeenCalled();
    await advance(600);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    const [question, mode, origin, parent] = harness.submit.mock.calls[0]!;
    expect(mode).toBe("thorough");
    expect(origin).toBe("dig");
    expect(AskParentSchema.safeParse(parent).success).toBe(true);
    expect(parent).toEqual({
      parent_run_id: runId,
      places: ["path:n-renew", "p:n-renew-storage"],
      mode: "thorough",
      picks: [
        { kind: "CONTRADICTING", suggestion_id: "renew-contradicting", place: "p:n-renew-storage", text: "Can batteries cover a windless week here?" },
        {
          kind: "HELPS_MAIN_QUESTION", suggestion_id: "renew-helps-against", place: "path:n-renew",
          text: "How large would seasonal storage need to be in a northern country that runs on renewables alone?"
        },
        { kind: "OWN_VIEW", suggestion_id: null, place: "path:n-renew", text: "Pumped hydro could carry a windless week." }
      ]
    });
    // The question names the path's line first, then what the person digs into, then the earlier question.
    expect(question).toContain(word("v4.digText.ownView", { text: "Pumped hydro could carry a windless week." }));
    expect(question).toContain(word("v4.digText.suggestion", { text: "Can batteries cover a windless week here?" }));
    expect(question).toContain("This follows from an earlier question:");
    expect(question).not.toMatch(/search words/iu);

    await settle();
    expect(tray()).toBeNull();
    expect(text()).toContain(CATALOG["v4.dig.started"]);
    expect(branch(PATHS.renew).querySelector(".v4MapDig")).not.toBeNull();
    // A path that now has a dig offers "Dig here too".
    expect(buttonsNamed(CATALOG["v4.nest.digHereToo"]!, branch(PATHS.renew))).toHaveLength(1);
  });

  it("a whole path dug as before sends its place and no picks", async () => {
    const runId = await mountMap();
    await openPath(PATHS.smr);
    await click(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    await advance(10_100);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(harness.submit.mock.calls[0]![3]).toEqual({ parent_run_id: runId, places: ["path:n-smr"], mode: "quick" });
  });

  it("leaving the page during the Undo time sends nothing", async () => {
    await mountMap();
    await openPath(PATHS.smr);
    await click(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    await unmountMap();
    await advance(30_000);
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("a refused dig (two quick clicks past level 10) says so, and the picks stay", async () => {
    harness.submit = vi.fn(async () => ({ kind: "REFUSED" as const, message: CATALOG["v4.nest.tooDeep"]! }));
    await mountMap();
    await click(branch(PATHS.renew).querySelector<HTMLInputElement>(".v4MapLeafSuggestion input[type=checkbox]")!);
    await click(buttonNamed(CATALOG["v4.panel.dig"]!, tray()!));
    await advance(10_100);
    await settle();
    expect(text()).toContain(CATALOG["v4.nest.tooDeep"]);
    expect(tray()?.textContent).toContain(word("v4.dig.trayPicked.one", { count: 1 }));
  });

  // R22 W3-8: the two dig refusals with their own codes are said where DIG_TOO_DEEP is, and the picks stay too.
  it.each([["v4.nest.picksOnePath", {}], ["v4.nest.freePicksMax", { count: FREE_DIG_PICKS_MAX }]] as const)(
    "a dig refused with its own code (%s) says so, and the picks stay", async (key, values) => {
      harness.submit = vi.fn(async () => ({ kind: "REFUSED" as const, message: word(key, values) }));
      await mountMap();
      await click(branch(PATHS.renew).querySelector<HTMLInputElement>(".v4MapLeafSuggestion input[type=checkbox]")!);
      await click(buttonNamed(CATALOG["v4.panel.dig"]!, tray()!));
      await advance(10_100);
      await settle();
      expect(text()).toContain(word(key, values));
      expect(tray()?.textContent).toContain(word("v4.dig.trayPicked.one", { count: 1 }));
    });

  // Dig model revision W4-6 (owner Q-D13): a dig keeps its points and its answer text and writes no story, so its page never
  // reads one or waits for one: it opens with the dig's own paths and answer text at once, and its card on the map above
  // says what became of its rewrite, not that a short answer is still to come.
  it("a dig's own page never reads or waits for a story, and its card says what became of its rewrite", async () => {
    const parentRunId = await mountMap();
    await openPath(PATHS.smr);
    await click(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    await advance(10_100);
    const childRunId = (await harness.submit.mock.results[0]!.value as { runId: string }).runId;
    await unmountMap();

    harness.story = { ...seededStory(), status: "WRITING", story: null };
    harness.answer = seededAnswer(childRunId, {
      dig: { parent_run_id: parentRunId, position_ref: "n-smr", places: ["path:n-smr"], level: 1, picks: [], rewrite: null }
    });
    harness.loadStory.mockClear();
    await mountMap(1280, childRunId);
    await advance(60_000);
    expect(harness.loadStory).not.toHaveBeenCalled();
    expect(text()).not.toContain(CATALOG["v4.debate.storyWriting"]);
    expect(text()).not.toContain(CATALOG["v4.panel.fallbackWriting"]);
    expect(text()).toContain(harness.answer.composed_text[0]!.text);
    expect(page().querySelectorAll(".v4MapBranch")).toHaveLength(4);
    await unmountMap();

    // Back on the map above, the dig's card reads its rewrite, never "Its short answer is not written yet."
    harness.answer = null;
    harness.story = seededStory();
    harness.digView = (link) => ({ link, state: "DONE", headline: null, counts: null, rewrite: null, points: [] });
    await mountMap(1280, parentRunId);
    expect(branch(PATHS.smr).querySelector(".v4MapDig")!.textContent).toContain(CATALOG["v4.rewrite.digCard.DONE"]);
    await click(branch(PATHS.smr).querySelector<HTMLButtonElement>(".v4MapDig")!);
    expect(panel().textContent).not.toContain(CATALOG["v4.panel.digNoHeadline"]);
  });

  it("the deepest level reads no dig room and offers no dig at all", async () => {
    const runId = crypto.randomUUID();
    harness.answer = seededAnswer(runId, { dig: digPart(crypto.randomUUID(), DIG_LEVEL_MAX) });
    await mountMap(1280, runId);
    expect(harness.digRooms.at(-1)).toBeNull();
    await openPath(PATHS.smr);
    expect(buttonsNamed(CATALOG["v4.panel.dig"]!)).toHaveLength(0);
    expect(harness.submit).not.toHaveBeenCalled();
  });
});
