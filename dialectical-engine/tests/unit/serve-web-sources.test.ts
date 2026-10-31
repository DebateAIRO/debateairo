// tests/unit/serve-web-sources.test.ts
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { AnswerSchema, WEB_CONTRACT_LIMITS, type Node } from "@debateai/contract";
import {
  serveWebEvidence, webPathRefOfPosition, webPathRootsOf, webPathsAtRoots, webPlanReasonOf, withWebSources,
  type WebPlanPathRecord, type WebServeEvidence
} from "../../packages/serve/src/web-sources.js";
import { ServeRepository } from "../../packages/serve/src/index.js";
import { buildPublicDebateBody } from "../../apps/api/src/publications.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

/**
 * Plan 2026-10-30 W3-3 (serve: sources and web status to the answer). The web step's stored rows (0132, opened under the
 * run's key by the repository) become each point's `sources[]`, the answer's `web.paths[]` and the server's checked
 * looked-up flag. Owner rules held here: a quote is at most 120 characters, cut at a word edge; each quote carries reader
 * 1's one line in the site's language (Q8); "Sure" needs an extract of THIS debate the reviewer agreed with (Q17); after
 * the page texts are wiped only the shown quotes and reader 1's line are served (F9); never a grade or a score.
 */

const LONG_QUOTE = "Nurses in Munich earn about forty percent more than in Cluj, but a one-bedroom flat in the city takes "
  + "close to half of a starting salary after tax, the survey found.";

/** Opened values as the web step seals them (the shapes web-sources.ts names). */
const about = (url: string, title: string | null, date: string | null = "2026-03-14") =>
  ({ url, site: new URL(url).hostname, title, date });
const line = (text: string) => ({ line: text, language: "ro" });

/** One searched path (pos-a): two searches, three pages, page p1 its top page, extracts S1-1 (p1) and S1-2 (p2). */
function evidence(overrides: Partial<WebServeEvidence> = {}): WebServeEvidence {
  return {
    searches: [
      { searchId: "s1", pathRef: "pos-a", outcome: "FOUND" },
      { searchId: "s2", pathRef: "pos-a", outcome: "FAILED" }
    ],
    pages: [
      { pageId: "p1", searchId: "s1", rank: 1, readDepth: "whole", about: about("https://stats.example.de/nurses", "Nurse pay 2026") },
      { pageId: "p2", searchId: "s1", rank: 2, readDepth: "preview", about: about("https://news.example.ro/chirii", "Chirii", null) },
      { pageId: "p3", searchId: "s1", rank: 3, readDepth: "abstract", about: about("https://papers.example.org/abs/1", null, "March 2026") }
    ],
    readings: [
      { pageId: "p1", reader: 1, outcome: "READ", line: line("Arată salariile asistentelor în München.") },
      { pageId: "p1", reader: 2, outcome: "READ", line: null },
      { pageId: "p1", reader: 3, outcome: "READ", line: null },
      { pageId: "p2", reader: 1, outcome: "READ", line: line("Chiriile din Cluj în 2026.") },
      { pageId: "p3", reader: 1, outcome: "FAILED", line: null }
    ],
    extracts: [
      { pageId: "p1", pathRef: "pos-a", label: "S1-1", quote: { quote: LONG_QUOTE } },
      { pageId: "p2", pathRef: "pos-a", label: "S1-2", quote: { quote: "Chiria medie a urcat la 450 de euro." } }
    ],
    picks: [{ pathRef: "pos-a", rank: 1, pageId: "p1" }],
    researched: [],
    ...overrides
  };
}

const reviewer = { maker: "Reviewer", model_id: "model:r", transport: "http", provider_ref: "provider:r" };
const labeled = (source: string) =>
  ({ value: 0.5, kind: "strength", source, producer: "judgement", provenance_ref: `prov:${source}`, replay_handle: `replay:${source}` });
function point(nodeId: string, wayOfKnowing: Node["way_of_knowing"], locator: string | null,
  review: "agree" | "dispute" | "cannot-assess" | null): Node {
  return {
    node_id: nodeId, claim: `The claim of ${nodeId}.`, way_of_knowing: wayOfKnowing, base_score: labeled(nodeId),
    final_strength: null, provenance_ref: `prov:${nodeId}`, maker_lineage: null,
    review: review === null ? null : { outcome: review, reasons: ["Checked."], provenance_ref: `review:${nodeId}`, reviewer_lineage: reviewer },
    locator, stranger_restatement: { check_status: "PASS" }, defeater_refs: [], defeater_exhaustion_marked: false,
    disagreement: null, condition_marks: [], abstention: null, staleness_state: "FRESH", relevant_as_of: "2026-10-31T00:00:00.000Z"
  };
}

/** The served answer must still parse under the contract (its looked-up flag rule included). */
const parses = (nodes: Node[], web?: unknown) =>
  AnswerSchema.parse({ ...buildFairShapedAnswer(), nodes, edges: [], ...(web === undefined ? {} : { web }) });

describe("W3-3 · each point's sources, from the stored extracts", () => {
  it("cuts every quote to at most 120 characters at a word edge and carries title, site, link, read depth, date and reader 1's line", () => {
    const served = serveWebEvidence({ evidence: evidence(), plan: null })!;
    const [nodeA] = withWebSources([point("a", "LOOKED_UP", "S1-1", "agree")], served);
    expect(nodeA!.sources).toHaveLength(1);
    const source = nodeA!.sources![0]!;
    expect(Array.from(source.quote).length).toBeLessThanOrEqual(WEB_CONTRACT_LIMITS.quoteMaxChars);
    expect(source.quote.endsWith("…")).toBe(true);
    // Cut after a whole word: the text before the mark is a prefix of the quote ending at a word.
    const kept = source.quote.slice(0, -1);
    expect(LONG_QUOTE.startsWith(kept)).toBe(true);
    expect(LONG_QUOTE[kept.length]).toBe(" ");
    expect(source).toEqual({
      extract_id: "S1-1", quote: source.quote, title: "Nurse pay 2026", site: "stats.example.de",
      link: "https://stats.example.de/nurses", read_depth: "WHOLE",
      explanation: { text: "Arată salariile asistentelor în München.", language: "ro" }, published_on: "2026-03-14"
    });
    parses([nodeA!], served.web);
  });

  it("serves a short quote unchanged, marks a preview-only page, and reads no date it cannot name", () => {
    const served = serveWebEvidence({ evidence: evidence(), plan: null })!;
    const [node] = withWebSources([point("b", "LOOKED_UP", "S1-2", "agree")], served);
    expect(node!.sources![0]).toMatchObject({ quote: "Chiria medie a urcat la 450 de euro.", read_depth: "PREVIEW_ONLY", published_on: null });
  });

  it("says fewer readers when fewer than the planned readers read the page, and nothing when all did", () => {
    const failed = evidence({ readings: evidence().readings.map((reading) =>
      reading.pageId === "p1" && reading.reader === 3 ? { ...reading, outcome: "FAILED" } : reading) });
    const missing = evidence({ readings: evidence().readings.filter((reading) => !(reading.pageId === "p1" && reading.reader === 2)) });
    for (const stored of [failed, missing]) {
      const [node] = withWebSources([point("a", "LOOKED_UP", "S1-1", "agree")], serveWebEvidence({ evidence: stored, plan: null }));
      expect(node!.sources![0]!.fewer_readers).toBe(true);
    }
    // p1 (a top page) was read by all three; p2 (not a top page) by reader 1, all that was planned for it.
    const [top, other] = withWebSources([point("a", "LOOKED_UP", "S1-1", "agree"), point("b", "LOOKED_UP", "S1-2", "agree")],
      serveWebEvidence({ evidence: evidence(), plan: null }));
    expect(top!.sources![0]).not.toHaveProperty("fewer_readers");
    expect(other!.sources![0]).not.toHaveProperty("fewer_readers");
  });

  it("gives no source for a locator that names no extract of this debate, and leaves a point without a locator alone", () => {
    const served = serveWebEvidence({ evidence: evidence(), plan: null });
    const [elsewhere, plain] = withWebSources([point("a", "LOOKED_UP", "S7-1", "agree"), point("b", "REASONING", null, null)], served);
    expect(elsewhere).not.toHaveProperty("sources");
    expect(plain).toEqual(point("b", "REASONING", null, null));
  });

  it("leaves out a source whose page cannot be linked, never failing the answer", () => {
    const broken = evidence({ pages: evidence().pages.map((page) => page.pageId === "p1"
      ? { ...page, about: { url: "javascript:alert(1)", site: "x", title: "t", date: null } } : page) });
    const [node] = withWebSources([point("a", "LOOKED_UP", "S1-1", "agree")], serveWebEvidence({ evidence: broken, plan: null }));
    expect(node).not.toHaveProperty("sources");
    expect(node!.looked_up_checked).toBe(false);
    parses([node!]);
  });
});

describe("W3-3 · the checked looked-up flag (Q17)", () => {
  it("is true only for a looked-up point whose locator is an extract of THIS debate that the reviewer agreed with", () => {
    const served = serveWebEvidence({ evidence: evidence(), plan: null })!;
    const nodes = withWebSources([
      point("agreed", "LOOKED_UP", "S1-1", "agree"),
      point("other-debate", "LOOKED_UP", "S9-4", "agree"),
      point("disputed", "LOOKED_UP", "S1-1", "dispute"),
      point("not-assessed", "LOOKED_UP", "S1-1", "cannot-assess"),
      point("no-review", "LOOKED_UP", "S1-1", null),
      point("reasoning", "REASONING", "S1-1", "agree")
    ], served);
    const flags = Object.fromEntries(nodes.map((node) => [node.node_id, node.looked_up_checked]));
    expect(flags).toEqual({
      agreed: true, "other-debate": false, disputed: false, "not-assessed": false, "no-review": false, reasoning: undefined
    });
    // A reasoning point's locator still shows its quote; only the flag is for looked-up points.
    expect(nodes.find((node) => node.node_id === "reasoning")!.sources).toHaveLength(1);
    parses(nodes, served.web);
  });

  it("is false for an extract id another debate holds: the store read is this run's only", () => {
    // The same label, served from another run's evidence, never makes this run's point checked.
    const thisRun = evidence({ extracts: evidence().extracts.filter((extract) => extract.label !== "S1-1") });
    const [node] = withWebSources([point("a", "LOOKED_UP", "S1-1", "agree")], serveWebEvidence({ evidence: thisRun, plan: null }));
    expect(node!.looked_up_checked).toBe(false);
    expect(node).not.toHaveProperty("sources");
  });

  it("needs the locator to be exactly the extract id", () => {
    const [node] = withWebSources([point("a", "LOOKED_UP", "S1-1, S1-2", "agree")], serveWebEvidence({ evidence: evidence(), plan: null }));
    expect(node!.sources!.map((source) => source.extract_id)).toEqual(["S1-1", "S1-2"]);
    expect(node!.looked_up_checked).toBe(false);
  });
});

describe("W3-3 · an old answer is served exactly as before", () => {
  it("adds nothing when the debate kept no web rows", () => {
    const nodes = [point("a", "LOOKED_UP", "S1-1", "agree"), point("b", "REASONING", null, null)];
    const empty: WebServeEvidence = { searches: [], pages: [], readings: [], extracts: [], picks: [], researched: [] };
    for (const stored of [null, empty]) {
      const served = serveWebEvidence({ evidence: stored, plan: null });
      expect(served).toBeNull();
      const out = withWebSources(nodes, served);
      expect(JSON.stringify(out)).toBe(JSON.stringify(nodes));
    }
  });

  it("reads the answer through the repository byte for byte when the store has nothing for the run", async () => {
    const reads: string[] = [];
    const before = await new ServeRepository(answerReadPool(undefined, reads)).readAnswerProjection("answer-1", OWNERSHIP);
    const none = await new ServeRepository(answerReadPool(null, reads)).readAnswerProjection("answer-1", OWNERSHIP);
    const empty = await new ServeRepository(answerReadPool({ searches: [], pages: [], readings: [], extracts: [], picks: [],
      packs: [], researched: [] }, reads)).readAnswerProjection("answer-1", OWNERSHIP);
    // W3-6: no plan stored (0134's read answers [] before the planner ran, null when the debate is not live) adds nothing.
    const noPlan = await new ServeRepository(answerReadPool(null, reads, [])).readAnswerProjection("answer-1", OWNERSHIP);
    const notLive = await new ServeRepository(answerReadPool(null, reads, null)).readAnswerProjection("answer-1", OWNERSHIP);
    expect(reads.filter((sql) => sql.includes("identity.read_web_evidence"))).toHaveLength(5);
    expect(reads.filter((sql) => sql.includes("identity.read_web_plan"))).toHaveLength(5);
    // Nothing kept: no map root is looked up and no key is opened for the web part.
    expect(reads.filter((sql) => sql.includes("core.map_position"))).toEqual([]);
    for (const read of [none, empty, noPlan, notLive]) expect(JSON.stringify(read)).toBe(JSON.stringify(before));
    expect(before).not.toHaveProperty("web");
    for (const node of before!.nodes) {
      expect(node).not.toHaveProperty("sources");
      expect(node).not.toHaveProperty("looked_up_checked");
    }
  });
});

describe("W3-3 · each path's web status", () => {
  const plan = (status: WebPlanPathRecord["status"], reason: string | null = null): WebPlanPathRecord[] =>
    [{ pathId: "pos-a", status, reason }];
  const noSearches = evidence({ searches: [], pages: [], readings: [], extracts: [], picks: [] });

  it("SEARCHED, with its other pages (everything found but its top pages)", () => {
    const web = serveWebEvidence({ evidence: evidence(), plan: plan("PLANNED") })!.web;
    expect(web.paths).toHaveLength(1);
    const path = web.paths[0]!;
    expect(path.position_ref).toBe("pos-a");
    expect(path.search).toEqual({ status: "SEARCHED" });
    expect(path.suggestions).toEqual([]);
    expect(path.other_pages).toEqual([
      { page_ref: "p2", title: "Chirii", site: "news.example.ro", link: "https://news.example.ro/chirii", read_depth: "PREVIEW_ONLY",
        explanation: { text: "Chiriile din Cluj în 2026.", language: "ro" } },
      { page_ref: "p3", title: null, site: "papers.example.org", link: "https://papers.example.org/abs/1", read_depth: "ABSTRACT_ONLY",
        explanation: null }
    ]);
    parses([], web);
  });

  it("SEARCHED without a stored plan, from the searches alone; an empty search still searched", () => {
    expect(serveWebEvidence({ evidence: evidence(), plan: null })!.web.paths[0]!.search).toEqual({ status: "SEARCHED" });
    const empty = evidence({ searches: [{ searchId: "s1", pathRef: "pos-a", outcome: "EMPTY" }], pages: [], readings: [],
      extracts: [], picks: [] });
    expect(serveWebEvidence({ evidence: empty, plan: null })!.web.paths[0]).toEqual(
      { position_ref: "pos-a", search: { status: "SEARCHED" }, other_pages: [], suggestions: [] });
  });

  it("NO_SEARCH_PLANNED with the planner's reason, or null when its reply gave none", () => {
    const web = serveWebEvidence({ evidence: noSearches, plan: plan("NO_SEARCH_PLANNED", "Only values are weighed here.") })!.web;
    expect(web.paths[0]).toEqual({ position_ref: "pos-a", search: { status: "NO_SEARCH_PLANNED", reason: "Only values are weighed here." },
      other_pages: [], suggestions: [] });
    for (const reason of [null, "NO_REASON_GIVEN", "   "]) {
      expect(serveWebEvidence({ evidence: null, plan: plan("NO_SEARCH_PLANNED", reason) })!.web.paths[0]!.search)
        .toEqual({ status: "NO_SEARCH_PLANNED", reason: null });
    }
  });

  it("FAILED when no search of the path answered, or when the planner failed", () => {
    const failed = evidence({ searches: [{ searchId: "s2", pathRef: "pos-a", outcome: "FAILED" },
      { searchId: "s3", pathRef: "pos-a", outcome: "REFUSED" }], pages: [], readings: [], extracts: [], picks: [] });
    expect(serveWebEvidence({ evidence: failed, plan: null })!.web.paths[0]!.search).toEqual({ status: "FAILED" });
    expect(serveWebEvidence({ evidence: failed, plan: plan("PLANNED") })!.web.paths[0]!.search).toEqual({ status: "FAILED" });
    expect(serveWebEvidence({ evidence: null, plan: plan("FAILED") })!.web.paths[0]!.search).toEqual({ status: "FAILED" });
    // Planned but nothing sent (the guard held every search back): the path went on without the web.
    expect(serveWebEvidence({ evidence: null, plan: plan("PLANNED") })!.web.paths[0]!.search).toEqual({ status: "FAILED" });
  });

  it("NOT_ON_PLAN (Free) and SWITCHED_OFF (the setting), with no pages", () => {
    for (const status of ["NOT_ON_PLAN", "SWITCHED_OFF"] as const) {
      const served = serveWebEvidence({ evidence: null, plan: [{ pathId: "pos-a", status, reason: null }, { pathId: "pos-b", status, reason: null }] })!;
      expect(served.web.paths).toEqual(["pos-a", "pos-b"].map((position_ref) =>
        ({ position_ref, search: { status }, other_pages: [], suggestions: [] })));
      parses([], served.web);
    }
  });

  it("lists every path once, in the plan's order, then any searched path the plan did not name", () => {
    const stored = evidence({ searches: [...evidence().searches, { searchId: "s9", pathRef: "pos-z", outcome: "EMPTY" }] });
    const web = serveWebEvidence({ evidence: stored, plan: [
      { pathId: "pos-b", status: "NO_SEARCH_PLANNED", reason: "Values." }, { pathId: "pos-a", status: "PLANNED", reason: null }] })!.web;
    expect(web.paths.map((path) => [path.position_ref, path.search.status])).toEqual(
      [["pos-b", "NO_SEARCH_PLANNED"], ["pos-a", "SEARCHED"], ["pos-z", "SEARCHED"]]);
  });

  it("shows what became of a page the person added to researched", () => {
    const stored = evidence({ researched: [
      { pageId: "p2", pathRef: "pos-a", outcome: "ADDS" },
      { pageId: "p3", pathRef: "pos-a", outcome: null }
    ] });
    const pages = serveWebEvidence({ evidence: stored, plan: null })!.web.paths[0]!.other_pages;
    expect(pages[0]!.researched).toEqual({ state: "ADDS", sources: [expect.objectContaining({ extract_id: "S1-2" })] });
    expect(pages[1]!.researched).toEqual({ state: "READING" });
    const settled = (outcome: string) => serveWebEvidence({ evidence: evidence({ researched: [{ pageId: "p3", pathRef: "pos-a", outcome }] }),
      plan: null })!.web.paths[0]!.other_pages[1]!.researched;
    expect(settled("DOES_NOT_ADD")).toEqual({ state: "ADDS_NOTHING" });
    expect(settled("FAILED")).toEqual({ state: "FAILED" });
    // ADDS with no checked quote of that page left: nothing joined the path.
    expect(settled("ADDS")).toEqual({ state: "ADDS_NOTHING" });
  });
});

describe("W3-3 · after the page texts are wiped (F9)", () => {
  it("serves the same quotes and reader 1's lines: nothing served comes from a page's text", () => {
    // The input carries no page text and no text state at all: the serve reads the extracts, never the texts.
    const before = serveWebEvidence({ evidence: evidence(), plan: null })!;
    const wiped = evidence({ pages: evidence().pages.map((page) => ({ ...page, textState: "WIPED" }) as never) });
    const after = serveWebEvidence({ evidence: wiped, plan: null })!;
    expect(after.web).toEqual(before.web);
    expect([...after.sources.values()]).toEqual([...before.sources.values()]);
    for (const source of after.sources.values()) {
      expect(Array.from(source.quote).length).toBeLessThanOrEqual(120);
      expect(source.explanation).not.toBeNull();
    }
  });
});

describe("W3-3 · never a grade or a score", () => {
  it("carries no grade, spread, rank or reader count anywhere in what it serves", () => {
    const graded = evidence({ readings: evidence().readings.map((reading) => ({ ...reading, grade: 3 }) as never) });
    const served = serveWebEvidence({ evidence: graded, plan: null })!;
    const [node] = withWebSources([point("a", "LOOKED_UP", "S1-1", "agree")], served);
    const text = JSON.stringify({ web: served.web, sources: node!.sources });
    for (const word of ["grade", "score", "spread", "rank", "reader", "found_by", "maker", "charge"]) {
      expect(text.toLowerCase()).not.toContain(`"${word}`);
    }
    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object") for (const [key, inner] of Object.entries(value)) { keys.add(key); walk(inner); }
    };
    walk([served.web, node!.sources]);
    expect([...keys].sort()).toEqual([
      "explanation", "extract_id", "language", "link", "other_pages", "page_ref", "paths", "position_ref", "published_on", "quote",
      "read_depth", "search", "site", "status", "suggestions", "text", "title"
    ]);
  });
});

describe("W3-3 · the public debate carries the same sources (publication check, 432c6bdec)", () => {
  const publicBody = (nodes: Node[]) => buildPublicDebateBody({
    runId: "run-1", answer: parses(nodes), owner: { userId: "user-1", ownerRef: OWNERSHIP.ownerRef },
    readers: {
      stories: { readStoryShort: async () => null },
      repository: { readArgumentLanguageTag: async () => null, readAnswerFloor: async () => null } as never,
      mapViews: { readMapView: async () => null } as never
    },
    source: {} as never
  });

  it("copies each point's sources and flag as the owner's answer serves them, and nothing on a point without them", async () => {
    const nodes = withWebSources([point("a", "LOOKED_UP", "S1-1", "agree"), point("b", "REASONING", null, null)],
      serveWebEvidence({ evidence: evidence(), plan: null }));
    const body = await publicBody(nodes);
    expect(body.answer.nodes![0]!.sources).toEqual(nodes[0]!.sources);
    expect(body.answer.nodes![0]!.looked_up_checked).toBe(true);
    expect(body.answer.nodes![1]).not.toHaveProperty("sources");
    expect(body.answer.nodes![1]).not.toHaveProperty("looked_up_checked");
  });

  it("publishes an old answer's points exactly as before", async () => {
    const nodes = [point("a", "LOOKED_UP", "S1-1", "agree")];
    const body = await publicBody(nodes);
    expect(Object.keys(body.answer.nodes![0]!)).not.toContain("sources");
    expect(Object.keys(body.answer.nodes![0]!)).not.toContain("looked_up_checked");
  });
});

describe("W3-6 · every plan status reaches the served answer, each path named by its root in force", () => {
  const ROOT_A = "6f1c2a3b-0000-4000-8000-00000000000a";
  const ROOT_B = "6f1c2a3b-0000-4000-8000-00000000000b";
  const ROOT_C = "6f1c2a3b-0000-4000-8000-00000000000c";
  const ROOT_D = "6f1c2a3b-0000-4000-8000-00000000000d";
  const ROOT_E = "6f1c2a3b-0000-4000-8000-00000000000e";
  /** The store keys paths by the map's answer id: a1 searched, then one path for each other decision. */
  const stored = () => evidence({
    searches: evidence().searches.map((search) => ({ ...search, pathRef: "a1" })),
    extracts: evidence().extracts.map((extract) => ({ ...extract, pathRef: "a1" })),
    picks: [{ pathRef: "a1", rank: 1, pageId: "p1" }]
  });
  const PLAN: WebPlanPathRecord[] = [
    { pathId: "a1", status: "PLANNED", reason: null },
    { pathId: "a2", status: "NO_SEARCH_PLANNED", reason: "Only values are weighed here." },
    { pathId: "a3", status: "NOT_ON_PLAN", reason: null },
    { pathId: "a4", status: "SWITCHED_OFF", reason: null }
  ];
  const roots = webPathRootsOf([
    { answerId: "a1", rootNodeId: ROOT_A, stale: false }, { answerId: "a2", rootNodeId: ROOT_B, stale: false },
    { answerId: "a3", rootNodeId: ROOT_C, stale: false }, { answerId: "a4", rootNodeId: ROOT_D, stale: false }]);

  it("SEARCHED, NO_SEARCH_PLANNED with its reason, NOT_ON_PLAN and SWITCHED_OFF, each at its answer's root", () => {
    const served = webPathsAtRoots(serveWebEvidence({ evidence: stored(), plan: PLAN }), roots)!;
    expect(served.web.paths.map((path) => [path.position_ref, path.search])).toEqual([
      [ROOT_A, { status: "SEARCHED" }],
      [ROOT_B, { status: "NO_SEARCH_PLANNED", reason: "Only values are weighed here." }],
      [ROOT_C, { status: "NOT_ON_PLAN" }],
      [ROOT_D, { status: "SWITCHED_OFF" }]
    ]);
    expect(served.web.paths[0]!.other_pages.map((page) => page.page_ref)).toEqual(["p2", "p3"]);
    // FAILED too: a planned path no search answered, and a failed planner.
    const failed = webPathsAtRoots(serveWebEvidence({ evidence: null, plan: [{ pathId: "a1", status: "PLANNED", reason: null },
      { pathId: "a2", status: "FAILED", reason: null }] }), roots)!;
    expect(failed.web.paths.map((path) => [path.position_ref, path.search.status])).toEqual([[ROOT_A, "FAILED"], [ROOT_B, "FAILED"]]);
    parses([], served.web);
    parses([], failed.web);
  });

  it("names a path by the root in force, never the answer id: after a re-point, the new root; a stale root is no root", () => {
    const repointed = webPathRootsOf([{ answerId: "a1", rootNodeId: ROOT_E.toUpperCase(), stale: false },
      { answerId: "a2", rootNodeId: ROOT_B, stale: true }]);
    const served = webPathsAtRoots(serveWebEvidence({ evidence: stored(), plan: PLAN }), repointed)!;
    expect(served.web.paths.map((path) => path.position_ref)).toEqual([ROOT_E]);
    expect(JSON.stringify(served.web)).not.toMatch(/"a[1-4]"/u);
  });

  it("leaves out a path whose answer has no root yet; the points' sources are untouched", () => {
    const whole = serveWebEvidence({ evidence: stored(), plan: PLAN })!;
    const unrooted = webPathsAtRoots(whole, new Map([["a2", ROOT_B]]))!;
    expect(unrooted.web.paths.map((path) => [path.position_ref, path.search.status])).toEqual([[ROOT_B, "NO_SEARCH_PLANNED"]]);
    expect(unrooted.sources).toBe(whole.sources);
    const nodes = [point("a", "LOOKED_UP", "S1-1", "agree")];
    expect(withWebSources(nodes, unrooted)).toEqual(withWebSources(nodes, whole));
    expect(webPathsAtRoots(whole, new Map())!.web.paths).toEqual([]);
    expect(webPathsAtRoots(null, roots)).toBeNull();
  });

  it("opens the stored reason's shape only: `{ reason }`, else none", () => {
    expect(webPlanReasonOf({ reason: "Values." })).toBe("Values.");
    for (const value of [null, "Values.", { reason: 3 }, { reason: "  " }, ["Values."]]) expect(webPlanReasonOf(value)).toBeNull();
  });
});

describe("W3-6 · \"Add to researched\" goes back from a root to the stored path (W4-4)", () => {
  it("gives the answer id whose root in force a served position_ref names, or null", () => {
    const roots = webPathRootsOf([{ answerId: "a1", rootNodeId: "6f1c2a3b-0000-4000-8000-00000000000a", stale: false },
      { answerId: "a2", rootNodeId: "6f1c2a3b-0000-4000-8000-00000000000b", stale: true }]);
    const served = webPathsAtRoots(serveWebEvidence({ evidence: null, plan: [{ pathId: "a1", status: "SWITCHED_OFF", reason: null }] }), roots)!;
    expect(webPathRefOfPosition(served.web.paths[0]!.position_ref, roots)).toBe("a1");
    expect(webPathRefOfPosition(" 6F1C2A3B-0000-4000-8000-00000000000A ", roots)).toBe("a1");
    // A set-aside root, an answer id and an unknown node name no path.
    for (const position of ["6f1c2a3b-0000-4000-8000-00000000000b", "a1", "6f1c2a3b-0000-4000-8000-0000000000ff"]) {
      expect(webPathRefOfPosition(position, roots)).toBeNull();
    }
  });
});

/* ----------------------------------------------------------------- a stand-in pool for one answer read */

const OWNERSHIP = { ownerRef: "00000000-0000-4000-8000-0000000000c1", legacyAskerId: null } as const;

/**
 * One answer read (as tests/unit/r2-comparing-judges.test.ts stands it in): two looked-up points, one with an S-locator.
 * `web` is what identity.read_web_evidence answers: undefined = a database that knows no such read (every unknown read
 * finds nothing, as before W3-3), null = the run is not a live private debate, or an empty store. Every read is kept.
 * `plan` is what 0134's identity.read_web_plan answers, likewise (W3-6).
 */
function answerReadPool(web: unknown, reads: string[], plan?: unknown): Pool {
  const at = new Date("2026-10-21T00:00:00.000Z");
  const nodeRow = (nodeId: string, locator: string | null) => ({
    node_id: nodeId, claim_text: `The point ${nodeId}.`, node_content_ciphertext: null, way_of_knowing: "LOOKED_UP",
    provenance_ref: `artifact:${nodeId}`, maker: "OpenAI", model_id: "model", model_version: null, provider: "gate",
    provider_ref: "provider:openai", review_outcome: "agree", review_reasons: ["Checked."], node_review_id: null,
    review_content_ciphertext: null, review_provenance_ref: `review:${nodeId}`, reviewer_maker: "Anthropic",
    reviewer_model_id: "model-r", reviewer_model_version: null, reviewer_provider: "gate", reviewer_provider_ref: "provider:r",
    locator, tau: 0.5, base_number_kind: "tau", base_source_ref: nodeId, base_producer: "reducer", base_replay_handle: "replay",
    base_provenance_ref: "judgement", strength: null, final_number_kind: null, final_source_ref: null, final_producer: null,
    final_replay_handle: null, final_provenance_ref: null, disagreement: null, defeater_refs: [], check_status: "PASS",
    relevant_as_of: at
  });
  const answerRow = {
    answer_id: "answer-1", answer_version: 1, run_id: "run-1", release_key: "r22-000000000000", served_root_rule: null,
    question_line: "Should I move?", run_content_ciphertext: null, fact_bundle_id: "facts-1", facts: [],
    facts_content_ciphertext: null, composed_text_id: null, composed_content_ciphertext: null, terminal: "SERVED",
    serve_state: "COMPOSED", verdict_state: "SUPPORTED", verdict_unavailable: null, confidence_band: null, band_ceiling: null,
    answer_form: null, answer_content_ciphertext: null, segments: [], residual_objections: [], condition_marks: [], badges: [],
    reversal_point: "none", builds_on_previous: null, memory_disclosure: null, sealed_at_seq: 1, risk_tier: "LOW",
    tier_source: "classifier", tier_provenance_ref: "tier", envelope_basis: { kind: "COMPUTED_STRUCTURAL_CEILING" },
    envelope_state: "WITHIN", envelope_consumed: 1, composition_budget_tier: "low", conformance_segment_results: null,
    conformance_coverage_mode: null, conformance_record_id: null, conformance_content_ciphertext: null, as_of: at,
    relevant_as_of: at, role_assignment_row: null, verdict_votes: [], root_sites: []
  };
  const query = async (sql: string, params: readonly unknown[] = []) => {
    reads.push(sql);
    if (sql.includes("AS root_sites")) return { rows: [answerRow] };
    if (sql.includes("AS defeater_refs")) return { rows: [nodeRow("node-a", "S1-1"), nodeRow("node-b", null)] };
    if (sql.includes("identity.read_web_evidence")) return { rows: web === undefined ? [] : [{ web }] };
    if (sql.includes("identity.read_web_plan")) return { rows: plan === undefined ? [] : [{ plan }] };
    if (sql.includes("pg_try_advisory_lock_shared")) return { rows: [{ acquired: true }] };
    if (sql.includes("pg_advisory_unlock_shared")) return { rows: [{ unlocked: true }] };
    if (sql.includes("run_private_content_is_live")) return { rows: (params[0] as string[]).map((runId) => ({ run_id: runId, live: true })) };
    return { rows: [] };
  };
  const client = { query, release: () => undefined };
  return { query, connect: async () => client } as unknown as Pool;
}
