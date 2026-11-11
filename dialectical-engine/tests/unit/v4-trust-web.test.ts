import { describe, expect, it } from "vitest";
import { AnswerSchema, type Answer, type AnswerStory, type WebPath, type WebSource } from "@debateai/contract";
import { STORY_FIXTURE_ANSWER, storyFixture, storyFixtureNode } from "../../apps/ui/lib/v3/storyFixture.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import { countTrust, pointsOf } from "../../apps/ui/lib/v4/trust.js";
import { basisKey, TRUST_BASES } from "../../apps/ui/lib/v4/types.js";
import { pathWebOf, ranOnFree, sourcesOf, webNoteOf } from "../../apps/ui/lib/v4/web.js";

/*
 * Perplexity plan W2-6 (2026-10-30), owner answers of 30 Oct: "Sure" only on a point resting on a page this debate looked
 * up (the server's checked looked-up flag), with the second AI agreeing and the point fresh. Without the flag a point is
 * at most "Sure, for the case named" — so a remembered citation, and every debate from before R22, is no longer "Sure"
 * (Q17). Free never shows "Sure". Quotes are cut to 120 characters; never a grade.
 */

type Node = Answer["nodes"][number];
type Review = "agree" | "dispute" | "cannot-assess" | null;

const page = (id: string, quote: string, extra: Partial<WebSource> = {}): WebSource => ({
  extract_id: id,
  quote,
  title: `Made-up report ${id}`,
  site: "made-up-site.example",
  link: `https://made-up-site.example/${id}`,
  read_depth: "WHOLE",
  explanation: { text: `What page ${id} is about and why it matters.`, language: "en" },
  published_on: "2025-06-12",
  ...extra
});

function node(id: string, review: Review, way: Node["way_of_knowing"], extra: Partial<Node> = {}): Node {
  return {
    ...storyFixtureNode({
      id, claim: `Claim ${id}.`, way, base: 0.5, final: 0.5, maker: "OpenAI",
      review: review === null ? null : { outcome: review, by: "Anthropic", reason: `Review of ${id}.` },
      locator: null, marks: []
    }),
    ...extra
  };
}

/** A point resting on a checked extract of this debate: its locator is the extract id and the server set the flag. */
function checked(id: string, review: Review, extra: Partial<Node> = {}): Node {
  const source = page(`S1-${id.length}`, `A made-up line the page says about ${id}.`);
  return node(id, review, "LOOKED_UP", { locator: source.extract_id, sources: [source], looked_up_checked: true, ...extra });
}

const webPath = (position: string, search: WebPath["search"], extra: Partial<WebPath> = {}): WebPath =>
  ({ position_ref: position, search, other_pages: [], suggestions: [], ...extra });

function answerWith(nodes: Node[], extra: Partial<Answer> = {}): Answer {
  return { ...STORY_FIXTURE_ANSWER, nodes, edges: [], ...extra };
}

function storyOf(paths: Array<Readonly<{ position: string; nodes: string[] }>>): AnswerStory {
  const story = storyFixture("READY");
  story.story!.short.paths = paths.map((path) => ({ position_ref: path.position, fate: "HELD_UP", line: `Line ${path.position}.`, node_refs: path.nodes }));
  return story;
}

const word = (answer: Answer, id: string) => {
  const point = pointsOf(answer).get(id);
  return [point?.trust, point?.basis];
};

describe("the new 'Sure' rule (W2-6)", () => {
  it("a remembered citation (looked up, agreed, fresh, but no checked flag) is no longer 'Sure'", () => {
    const answer = answerWith([
      node("remembered", "agree", "LOOKED_UP", { locator: "Smith et al. 2020, p. 4" }),
      node("ran", "agree", "RAN", { locator: "a worked sum" }),
      node("flagFalse", "agree", "LOOKED_UP", { locator: "S1-9", sources: [page("S1-9", "Some line.")], looked_up_checked: false })
    ]);
    expect(word(answer, "remembered")).toEqual(["SURE_FOR_CASE", "LOOKED_UP_AND_AGREED"]);
    expect(word(answer, "ran")).toEqual(["SURE_FOR_CASE", "LOOKED_UP_AND_AGREED"]);
    expect(word(answer, "flagFalse")).toEqual(["SURE_FOR_CASE", "LOOKED_UP_AND_AGREED"]);
    expect(countTrust([...pointsOf(answer).values()]).counts.SURE).toBe(0);
  });

  it("an old debate (no web fields at all) gets the new rule too (owner Q17)", () => {
    const old = answerWith([node("old", "agree", "LOOKED_UP", { locator: "https://example.org/remembered" })]);
    expect(old.web).toBeUndefined();
    expect(word(old, "old")).toEqual(["SURE_FOR_CASE", "LOOKED_UP_AND_AGREED"]);
  });

  it("'Sure' needs the checked flag, the reviewer's agreement and fresh", () => {
    const answer = answerWith([
      checked("sure", "agree"),
      checked("dated", "agree", { staleness_state: "STALE", relevant_as_of: "2025-01-02T00:00:00.000Z" }),
      checked("disputed", "dispute"),
      checked("unsure", "cannot-assess"),
      checked("unreviewed", null)
    ]);
    expect(AnswerSchema.safeParse(answer).success).toBe(true);
    expect(word(answer, "sure")).toEqual(["SURE", "WEB_CHECKED_AND_AGREED"]);
    expect(word(answer, "dated")).toEqual(["SURE_FOR_CASE", "AGREED_BUT_DATED"]);
    expect(pointsOf(answer).get("dated")?.asOf).toBe("2025-01-02T00:00:00.000Z");
    expect(word(answer, "disputed")).toEqual(["STILL_ARGUED", "DISPUTED"]);
    expect(word(answer, "unsure")).toEqual(["STILL_ARGUED", "COULD_NOT_CHECK"]);
    expect(word(answer, "unreviewed")).toEqual([null, null]);
  });

  it("Free is never 'Sure', even on a point that carries a checked flag", () => {
    const answer = answerWith([checked("flagged", "agree"), node("reasoned", "agree", "REASONING")], {
      web: { paths: [webPath("flagged", { status: "NOT_ON_PLAN" })] }
    });
    expect(ranOnFree(answer)).toBe(true);
    expect(word(answer, "flagged")).toEqual(["SURE_FOR_CASE", "LOOKED_UP_AND_AGREED"]);
    expect(word(answer, "reasoned")).toEqual(["SURE_FOR_CASE", "ARGUED_AND_AGREED"]);
    const map = buildV4Map({ runId: "run-free", answer, story: null });
    expect(map.counts.SURE).toBe(0);
    expect(map.webNote).toBe("FREE");
  });

  it("the new basis reads the owner-approved line; every other basis keeps its own key", () => {
    expect(basisKey("WEB_CHECKED_AND_AGREED")).toBe("v4.web.sureBasis");
    for (const basis of TRUST_BASES.filter((basis) => basis !== "WEB_CHECKED_AND_AGREED")) expect(basisKey(basis)).toBe(`v4.basis.${basis}`);
  });
});

describe("sources on the points (W2-6)", () => {
  it("carries each point's sources, with every quote at most 120 characters at a word edge", () => {
    const long = "This made-up page says a great many things about the costs of new power plants, and it keeps on going well past the limit set.";
    expect(Array.from(long).length).toBeGreaterThan(120);
    // A served quote is already cut; one that is not (an older or broken reply) is cut again here, never shown longer.
    const answer = answerWith([node("p", "agree", "LOOKED_UP", { sources: [page("S1-1", long), page("S1-2", "Short.")] })]);
    const sources = pointsOf(answer).get("p")?.sources ?? [];
    expect(sources.map((source) => source.extract_id)).toEqual(["S1-1", "S1-2"]);
    expect(Array.from(sources[0]!.quote).length).toBeLessThanOrEqual(120);
    expect(sources[0]!.quote.endsWith("…")).toBe(true);
    expect(long.startsWith(sources[0]!.quote.slice(0, -1))).toBe(true);
    expect(sources[1]!.quote).toBe("Short.");
    expect(sources[0]!.explanation?.text).toBe("What page S1-1 is about and why it matters.");
  });

  it("leaves out a source without a plain web link and keeps at most 8", () => {
    const many = Array.from({ length: 10 }, (_, at) => page(`S1-${at + 1}`, `Line ${at + 1}.`));
    const bad = page("S2-1", "Bad link.", { link: "javascript:alert(1)" });
    const sources = sourcesOf(node("p", "agree", "LOOKED_UP", { sources: [bad, ...many] }));
    expect(sources.map((source) => source.extract_id)).toEqual(many.slice(0, 8).map((source) => source.extract_id));
  });

  it("a point with no sources has none (old debates, reasoning points)", () => {
    expect(pointsOf(answerWith([node("p", "agree", "REASONING")])).get("p")?.sources).toEqual([]);
  });

  it("never carries a grade or a score onto the page's points", () => {
    const point = pointsOf(answerWith([checked("sure", "agree")])).get("sure")!;
    expect(JSON.stringify(point)).not.toMatch(/grade|score|strength/iu);
  });
});

describe("each path's web part and the debate's note (W2-6)", () => {
  const other = { page_ref: "pg-1", title: "Another made-up page", site: "other.example", link: "https://other.example/a", read_depth: "WHOLE" as const, explanation: null };

  it("gives each story path its search and other pages, by its position", () => {
    const answer = answerWith([checked("a", "agree"), node("b", "agree", "REASONING")], {
      web: {
        paths: [
          webPath("a", { status: "SEARCHED" }, { other_pages: [other] }),
          webPath("b", { status: "NO_SEARCH_PLANNED", reason: "A matter of values; no page can settle it." })
        ]
      }
    });
    expect(AnswerSchema.safeParse(answer).success).toBe(true);
    const map = buildV4Map({ runId: "run-1", answer, story: storyOf([{ position: "a", nodes: ["a"] }, { position: "b", nodes: ["b"] }]) });
    expect(map.paths.map((path) => path.web?.search.status)).toEqual(["SEARCHED", "NO_SEARCH_PLANNED"]);
    expect(map.paths[0]!.web?.otherPages.map((page) => page.page_ref)).toEqual(["pg-1"]);
    expect(map.paths[1]!.web?.otherPages).toEqual([]);
    expect(map.webNote).toBeNull();
    expect(map.counts.SURE).toBe(1);
  });

  it("a path the answer says nothing about has no web part; an old answer has none and no note", () => {
    const answer = answerWith([node("a", "agree", "REASONING")]);
    const map = buildV4Map({ runId: "run-1", answer, story: storyOf([{ position: "a", nodes: ["a"] }]) });
    expect(map.paths[0]!.web).toBeUndefined();
    expect(map.webNote).toBeNull();
    expect(pathWebOf(answer, "a")).toBeUndefined();
  });

  it("notes the debate FAILED or SWITCHED_OFF only when every path says so", () => {
    const failedAll = answerWith([], { web: { paths: [webPath("a", { status: "FAILED" }), webPath("b", { status: "FAILED" })] } });
    const mixed = answerWith([], { web: { paths: [webPath("a", { status: "FAILED" }), webPath("b", { status: "SEARCHED" })] } });
    const off = answerWith([], { web: { paths: [webPath("a", { status: "SWITCHED_OFF" })] } });
    expect(webNoteOf(failedAll)).toBe("FAILED");
    expect(webNoteOf(mixed)).toBeNull();
    expect(pathWebOf(mixed, "a")?.search.status).toBe("FAILED");
    expect(webNoteOf(off)).toBe("SWITCHED_OFF");
  });
});
