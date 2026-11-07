import { describe, expect, it } from "vitest";
import * as fixture from "../../apps/ui/lib/v3/storyFixture.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import {
  addPick,
  askParentOf,
  draftTarget,
  editPick,
  EMPTY_DRAFT,
  isEdited,
  openPick,
  ownViewPick,
  pathSuggestionsOf,
  pickedOpenIds,
  pickRefusal,
  picksMax,
  placesOf,
  removePick,
  suggestionKindKey,
  suggestionPick,
  suggestionsByKind,
  togglePick
} from "../../apps/ui/lib/v4/suggestions.js";
import type { V4DigDraft, V4DigPick, V4OpenQuestion } from "../../apps/ui/lib/v4/types.js";
import {
  AskParentSchema, DIG_LEVEL_MAX, FREE_DIG_PICKS_MAX, WEB_CONTRACT_LIMITS, type Answer, type DigSuggestion
} from "../../packages/contract/src/index.js";
import { createSeed } from "../../tools/v4-mock-api/seed.js";

/*
 * Perplexity plan W3-4 (2026-10-30) and the dig model revision (31 Oct): choosing what to dig is pure code in
 * lib/v4/suggestions.ts, so the owner's rules hold whatever the page does with it:
 *  - Q-D1: picks stay on one path; a pick from another path is refused and the draft is left as it was;
 *  - Q19: Free combines at most 3; a paid plan at most as many places as one dig names (16);
 *  - a pick is a suggestion with its text as sent (edited or not), or the person's own view; never search words;
 *  - the ask's parent always passes the contract's AskParentSchema.
 */

const seed = createSeed(fixture);
const RUN = "11111111-1111-4111-8111-111111111111";
const answer = (): Answer => seed.answer({
  answerId: "aaaa1111-1111-4111-8111-111111111111", runRef: RUN,
  question: "Should countries build new nuclear power, or put the money into renewables and storage?",
  askedAt: "2026-10-27T15:12:00.000Z", servedAt: "2026-10-27T15:40:00.000Z", web: "PAID"
}) as Answer;
const story = () => seed.story("aaaa1111-1111-4111-8111-111111111111", "READY", "2026-10-27T15:41:00.000Z");

const suggestion = (id: string, kind: DigSuggestion["kind"], side: DigSuggestion["side"] = null): DigSuggestion =>
  ({ suggestion_id: id, kind, side, text: `Suggestion ${id}`, places: [`p:${id}`] });
const open = (id: string, pathId: string | null): V4OpenQuestion =>
  ({ id, kind: "STILL_ARGUED", text: `Open ${id}`, star: false, pathId });

const add = (draft: V4DigDraft, pick: V4DigPick, plan: "free" | "premium" = "premium") => addPick(draft, pick, plan);

describe("a path's suggestions, by kind", () => {
  it("come from the answer's web part, by the position that argued the path", () => {
    const map = buildV4Map({ runId: RUN, answer: answer(), story: story() });
    const byPath = Object.fromEntries(map.paths.map((path) => [path.id, (path.suggestions ?? []).map((item) => item.suggestion_id)]));
    expect(byPath).toEqual({
      "n-mix": ["mix-helps-for", "mix-undocumented"],
      "n-renew": ["renew-contradicting", "renew-more-web", "renew-helps-against"],
      "n-nuclear": ["nuclear-helps-for"],
      "n-smr": ["smr-undocumented"]
    });
  });

  it("are shown in the four kinds' order, 'helps the main question' split by its side", () => {
    const list = [
      suggestion("a", "HELPS_MAIN_QUESTION", "AGAINST"), suggestion("b", "NEEDS_MORE_WEB"), suggestion("c", "CONTRADICTING"),
      suggestion("d", "HELPS_MAIN_QUESTION", "FOR"), suggestion("e", "UNDOCUMENTED"), suggestion("f", "CONTRADICTING")
    ];
    expect(suggestionsByKind(list).map((group) => [group.key, group.suggestions.map((item) => item.suggestion_id)])).toEqual([
      ["v4.suggest.kind.CONTRADICTING", ["c", "f"]],
      ["v4.suggest.kind.UNDOCUMENTED", ["e"]],
      ["v4.suggest.kind.NEEDS_MORE_WEB", ["b"]],
      ["v4.suggest.kind.HELPS_MAIN_QUESTION.FOR", ["d"]],
      ["v4.suggest.kind.HELPS_MAIN_QUESTION.AGAINST", ["a"]]
    ]);
    expect(suggestionKindKey(suggestion("x", "HELPS_MAIN_QUESTION", "AGAINST"))).toBe("v4.suggest.kind.HELPS_MAIN_QUESTION.AGAINST");
  });

  it("each id once, and none for a position the answer does not name or an answer from before R22", () => {
    const base = answer();
    const twice = { ...base, web: { paths: base.web!.paths.map((path) => ({ ...path, suggestions: [...path.suggestions, ...path.suggestions] })) } } as Answer;
    expect(pathSuggestionsOf(twice, "n-renew").map((item) => item.suggestion_id)).toEqual(["renew-contradicting", "renew-more-web", "renew-helps-against"]);
    expect(pathSuggestionsOf(base, "nowhere")).toEqual([]);
    const { web: _web, ...old } = base;
    expect(pathSuggestionsOf(old as Answer, "n-mix")).toEqual([]);
  });

  it("are not offered on a map at the deepest level (its paths cannot be dug)", () => {
    const base = answer();
    const dig = { parent_run_id: RUN, position_ref: "n-mix", places: ["path:n-mix"], level: DIG_LEVEL_MAX, picks: [], rewrite: null };
    const deepest = buildV4Map({ runId: RUN, answer: { ...base, dig } as Answer, story: story() });
    expect(deepest.digLevel).toBe(DIG_LEVEL_MAX);
    expect(deepest.paths.every((path) => path.suggestions === undefined)).toBe(true);
    const nine = buildV4Map({ runId: RUN, answer: { ...base, dig: { ...dig, level: DIG_LEVEL_MAX - 1 } } as Answer, story: story() });
    expect(nine.digLevel).toBe(DIG_LEVEL_MAX - 1);
    expect(nine.paths.some((path) => (path.suggestions ?? []).length > 0)).toBe(true);
    expect(buildV4Map({ runId: RUN, answer: base, story: story() }).digLevel).toBeNull();
  });
});

describe("picks stay on one path (owner Q-D1)", () => {
  it("a pick from another path is refused, and the draft is left as it was", () => {
    const first = add(EMPTY_DRAFT, suggestionPick("a", suggestion("s1", "CONTRADICTING")));
    expect(first.refused).toBeNull();
    expect(first.draft.group).toBe("a");
    const other = add(first.draft, suggestionPick("b", suggestion("s2", "UNDOCUMENTED")));
    expect(other.refused).toBe("OTHER_PATH");
    expect(other.draft).toBe(first.draft);
    expect(add(first.draft, openPick(open("p:x", "b"))).refused).toBe("OTHER_PATH");
    expect(add(first.draft, ownViewPick("b", "Mine", 1)).refused).toBe("OTHER_PATH");
    // The main question's own open questions are a group of their own.
    expect(add(first.draft, openPick(open("o:0", null))).refused).toBe("OTHER_PATH");
    expect(pickRefusal(first.draft, "b", "premium")).toBe("OTHER_PATH");
    expect(pickRefusal(first.draft, "a", "premium")).toBeNull();
  });

  it("combines a suggestion, an open question and an own view of the same path; emptied, any path may start again", () => {
    let draft = add(EMPTY_DRAFT, suggestionPick("a", suggestion("s1", "CONTRADICTING"))).draft;
    draft = add(draft, openPick(open("p:x", "a"))).draft;
    draft = add(draft, ownViewPick("a", "  I think rent eats it.  ", 1)).draft;
    expect(draft.picks.map((pick) => pick.kind)).toEqual(["SUGGESTION", "OPEN", "OWN_VIEW"]);
    expect(draft.picks[2]).toMatchObject({ text: "I think rent eats it." });
    expect([...pickedOpenIds(draft)]).toEqual(["p:x"]);
    for (const pick of draft.picks) draft = removePick(draft, pick.key);
    expect(draft).toBe(EMPTY_DRAFT);
    expect(add(draft, openPick(open("p:y", "b"))).refused).toBeNull();
  });

  it("a pick box toggles; the same pick twice is one pick", () => {
    const pick = suggestionPick("a", suggestion("s1", "CONTRADICTING"));
    const on = togglePick(EMPTY_DRAFT, pick, "premium").draft;
    expect(add(on, pick).draft.picks).toHaveLength(1);
    expect(togglePick(on, pick, "premium").draft).toBe(EMPTY_DRAFT);
  });
});

describe("how many picks one dig combines", () => {
  it("Free: at most FREE_DIG_PICKS_MAX (3, owner Q19), then the next is refused", () => {
    expect(picksMax("free")).toBe(FREE_DIG_PICKS_MAX);
    expect(FREE_DIG_PICKS_MAX).toBe(3);
    let draft = EMPTY_DRAFT;
    for (const id of ["p:1", "p:2", "p:3"]) draft = add(draft, openPick(open(id, "a")), "free").draft;
    expect(draft.picks).toHaveLength(3);
    const fourth = add(draft, ownViewPick("a", "One more", 1), "free");
    expect(fourth.refused).toBe("FULL");
    expect(fourth.draft).toBe(draft);
  });

  it("a paid plan: as many as one dig names places (16)", () => {
    expect(picksMax("premium")).toBe(WEB_CONTRACT_LIMITS.digPicksMax);
    let draft = EMPTY_DRAFT;
    for (let at = 0; at < WEB_CONTRACT_LIMITS.digPicksMax; at += 1) draft = add(draft, openPick(open(`p:${at}`, "a"))).draft;
    expect(draft.picks).toHaveLength(16);
    expect(add(draft, openPick(open("p:extra", "a"))).refused).toBe("FULL");
  });
});

describe("editing a suggestion and the person's own view", () => {
  it("an edit keeps the suggestion and changes the text sent; an empty or too long text is refused", () => {
    const original = suggestion("s1", "UNDOCUMENTED");
    const draft = add(EMPTY_DRAFT, suggestionPick("a", original)).draft;
    const key = draft.picks[0]!.key;
    expect(isEdited(draft.picks[0]!)).toBe(false);
    const edited = editPick(draft, key, "  Does that matter in a small country like mine?  ");
    expect(edited.refused).toBeNull();
    expect(edited.draft.picks[0]).toMatchObject({ kind: "SUGGESTION", text: "Does that matter in a small country like mine?" });
    expect(isEdited(edited.draft.picks[0]!)).toBe(true);
    expect(editPick(draft, key, "   ").refused).toBe("EMPTY");
    expect(editPick(draft, key, "x".repeat(WEB_CONTRACT_LIMITS.pickTextMaxChars + 1)).refused).toBe("TOO_LONG");
    expect(add(EMPTY_DRAFT, ownViewPick("a", " \n ", 1)).refused).toBe("EMPTY");
  });
});

describe("the ask's parent (AskParentSchema)", () => {
  it("names the path first, each pick's place once, and the picks with their text as sent", () => {
    let draft = add(EMPTY_DRAFT, suggestionPick("n-mix", { ...suggestion("s1", "UNDOCUMENTED"), places: ["p:n-mix-land", "path:n-mix"] })).draft;
    draft = editPick(draft, draft.picks[0]!.key, "My wording of it").draft;
    draft = add(draft, openPick(open("p:n-mix-firm", "n-mix"))).draft;
    draft = add(draft, ownViewPick("n-mix", "Old gas plants could be the back-up.", 1)).draft;
    const map = buildV4Map({ runId: RUN, answer: answer(), story: story() });
    const target = draftTarget(draft, map.paths)!;
    expect(target.kind).toBe("picks");
    expect(placesOf(target)).toEqual(["path:n-mix", "p:n-mix-land", "p:n-mix-firm"]);
    const parent = askParentOf(RUN, target, "thorough")!;
    expect(AskParentSchema.safeParse(parent).success).toBe(true);
    expect(parent).toEqual({
      parent_run_id: RUN,
      places: ["path:n-mix", "p:n-mix-land", "p:n-mix-firm"],
      mode: "thorough",
      picks: [
        { kind: "UNDOCUMENTED", suggestion_id: "s1", place: "p:n-mix-land", text: "My wording of it" },
        { kind: "OWN_VIEW", suggestion_id: null, place: "path:n-mix", text: "Old gas plants could be the back-up." }
      ]
    });
    // No search words, anywhere (the owner's correction of 31 Oct).
    expect(JSON.stringify(parent)).not.toMatch(/search/iu);
  });

  it("a dig of open questions only, or of a whole path, sends its places and no picks", () => {
    const questions = [open("p:a", "x"), open("o:0", null)];
    expect(askParentOf(RUN, { kind: "open", questions }, "quick")).toEqual({ parent_run_id: RUN, places: ["p:a", "o:0"], mode: "quick" });
    const map = buildV4Map({ runId: RUN, answer: answer(), story: story() });
    expect(askParentOf(RUN, { kind: "path", path: map.paths[0]! }, "quick")).toEqual({ parent_run_id: RUN, places: ["path:n-mix"], mode: "quick" });
  });

  it("a parent that would not pass the contract is not sent (an id that is no run)", () => {
    expect(askParentOf("not-a-run", { kind: "open", questions: [open("p:a", "x")] }, "quick")).toBeNull();
  });

  it("an empty draft makes no dig", () => {
    expect(draftTarget(EMPTY_DRAFT, [])).toBeNull();
  });
});
