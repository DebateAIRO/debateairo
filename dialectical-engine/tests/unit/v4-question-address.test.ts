import { describe, expect, it } from "vitest";
import * as fixture from "../../apps/ui/lib/v3/storyFixture.js";
import { buildV4Map, uniqueOpenQuestions } from "../../apps/ui/lib/v4/mapModel.js";
import {
  addressPicksOf, addressWith, draftFromAddress, picksFromSearch, picksKeyOf, selectionFromSearch
} from "../../apps/ui/lib/v4/questionAddress.js";
import { addPick, editPick, EMPTY_DRAFT, openPick, ownViewPick, suggestionPick } from "../../apps/ui/lib/v4/suggestions.js";
import { WEB_CONTRACT_LIMITS, type Answer } from "../../packages/contract/src/index.js";
import { createSeed } from "../../tools/v4-mock-api/seed.js";

/*
 * V4 screen review, 3 Nov (journey-d4 A, map-f24, dig-f23): the map page's address names the open question and the
 * ticked picks, by id only, so Back, a reload and a shared link keep them. Never the person's words: an own view or an
 * edited wording stays in the page. Every other parameter (the reading level) and any #part are kept.
 */

const seed = createSeed(fixture);
const RUN = "11111111-1111-4111-8111-111111111111";
const answer = (): Answer => seed.answer({
  answerId: "aaaa1111-1111-4111-8111-111111111111", runRef: RUN,
  question: "Should countries build new nuclear power, or put the money into renewables and storage?",
  askedAt: "2026-10-27T15:12:00.000Z", servedAt: "2026-10-27T15:40:00.000Z", web: "PAID"
}) as Answer;
const story = () => seed.story("aaaa1111-1111-4111-8111-111111111111", "READY", "2026-10-27T15:41:00.000Z");
const map = () => buildV4Map({ runId: RUN, answer: answer(), story: story() });
const PAGE = `/v4/debate/${RUN}`;

describe("the open question in the address", () => {
  it("reads ?path=, ?open= and ?dig=, and none of them is the main question", () => {
    expect(selectionFromSearch("")).toBeNull();
    expect(selectionFromSearch("?level=plain")).toBeNull();
    expect(selectionFromSearch("?path=n-renew")).toBe("path:n-renew");
    expect(selectionFromSearch("?open=p%3An-12")).toBe("open:p:n-12");
    expect(selectionFromSearch("?dig=d1000000-0000-4000-8000-000000000001")).toBe("dig:d1000000-0000-4000-8000-000000000001");
    // Anything malformed opens the main question.
    expect(selectionFromSearch("?path=%3Cscript%3E")).toBeNull();
    expect(selectionFromSearch(`?open=${"x".repeat(161)}`)).toBeNull();
    expect(selectionFromSearch("?dig=not%20an%20id")).toBeNull();
  });

  it("writes the question and keeps the level and the #part; the main question clears the parameter", () => {
    expect(addressWith(`${PAGE}?level=plain`, "path:n-renew", [])).toBe(`${PAGE}?level=plain&path=n-renew`);
    expect(addressWith(`${PAGE}?level=plain&path=n-renew#top`, "open:p:n-12", [])).toBe(`${PAGE}?level=plain&open=p%3An-12#top`);
    expect(addressWith(`${PAGE}?path=n-renew&level=expert`, "root", [])).toBe(`${PAGE}?level=expert`);
    expect(addressWith(PAGE, "root", [])).toBe(PAGE);
    // Round trip.
    const written = addressWith(PAGE, "dig:d1000000-0000-4000-8000-000000000001", []);
    expect(selectionFromSearch(written.slice(written.indexOf("?")))).toBe("dig:d1000000-0000-4000-8000-000000000001");
  });
});

describe("the ticked picks in the address (ids only, never words)", () => {
  it("keeps suggestion and open-question ids in the order they were ticked, never an own view or an edited wording", () => {
    const current = map();
    const renew = current.paths.find((path) => path.id === "n-renew")!;
    const [first, second] = renew.suggestions!;
    const question = uniqueOpenQuestions(current).find((candidate) => candidate.pathId === "n-renew")!;
    let draft = addPick(EMPTY_DRAFT, suggestionPick(renew.id, second!), "premium").draft;
    draft = addPick(draft, openPick(question), "premium").draft;
    draft = addPick(draft, suggestionPick(renew.id, first!), "premium").draft;
    draft = addPick(draft, ownViewPick(renew.id, "My own private view about my town", 1), "premium").draft;
    draft = editPick(draft, `suggestion:${first!.suggestion_id}`, "My edited wording with my name in it").draft;
    const picks = addressPicksOf(draft);
    expect(picks).toEqual([
      { kind: "SUGGESTION", id: second!.suggestion_id },
      { kind: "OPEN", id: question.id },
      { kind: "SUGGESTION", id: first!.suggestion_id }
    ]);
    const href = addressWith(`${PAGE}?level=plain`, "path:n-renew", picks);
    expect(href).not.toMatch(/own|private|edited|name/iu);
    expect(picksFromSearch(href.slice(href.indexOf("?")))).toEqual(picks);
    // A null list leaves the address's own ticks as they are (the page has not read them back yet).
    expect(addressWith(href, "root", null)).toBe(href.replace("&path=n-renew", ""));
    expect(picksKeyOf(picks)).not.toBe(picksKeyOf([]));
  });

  it("leaves out malformed and repeated ticks, and keeps at most one dig's worth", () => {
    expect(picksFromSearch("?pick=s.ok-1&pick=s.ok-1&pick=x.bad&pick=s.has%20space&pick=o.w")).toEqual([
      { kind: "SUGGESTION", id: "ok-1" },
      { kind: "OPEN", id: "w" }
    ]);
    const many = Array.from({ length: 40 }, (_, index) => `pick=s.id-${index}`).join("&");
    expect(picksFromSearch(`?${many}`)).toHaveLength(WEB_CONTRACT_LIMITS.digPicksMax);
  });

  it("brings the ticks back on the map as the page would tick them: one path, gone ones left out", () => {
    const current = map();
    const renew = current.paths.find((path) => path.id === "n-renew")!;
    const mix = current.paths.find((path) => path.id === "n-mix")!;
    const question = uniqueOpenQuestions(current).find((candidate) => candidate.pathId === "n-renew")!;
    const draft = draftFromAddress(current, [
      { kind: "SUGGESTION", id: renew.suggestions![0]!.suggestion_id },
      { kind: "SUGGESTION", id: "no-such-suggestion" },
      { kind: "OPEN", id: question.id },
      // Owner Q-D1: a pick of another path is refused, as on the page.
      { kind: "SUGGESTION", id: mix.suggestions![0]!.suggestion_id }
    ]);
    expect(draft.group).toBe("n-renew");
    expect(draft.picks.map((pick) => pick.key)).toEqual([`suggestion:${renew.suggestions![0]!.suggestion_id}`, `open:${question.id}`]);
    // The suggestion comes back with its own text: an edited wording never travels in the address.
    const first = draft.picks[0]!;
    expect(first.kind === "SUGGESTION" ? first.text : null).toBe(renew.suggestions![0]!.text);
    expect(draftFromAddress(current, [])).toBe(EMPTY_DRAFT);
  });
});
