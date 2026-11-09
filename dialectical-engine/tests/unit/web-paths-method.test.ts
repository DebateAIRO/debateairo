// tests/unit/web-paths-method.test.ts
// V4 start step, Task 48 (spec 2026-11-03 §4.3, as amended 4 Nov, read-d3): web search per path. On a path debate each chosen
// path has its own planner (the approved dig planner, web.plan-dig.v3, word for word), all at once, at WEB:plan:<n>; each path
// searches under its own path_ref b<n> and keeps its own pack; every leg reads every path's pack, each labelled by its path's
// title. The planner reads the question with the person's stored lines it does not already say, the answers counted as said
// (the page writes them into the line as sentences), so none reaches it twice. Scripted vendors behind the real gateway;
// made-up figures and pages.
import { describe, expect, it } from "vitest";
import { questionWithPurposeLines, type PurposeLines } from "@debateai/contract";
import { WEB_DIG_PLANNER_V3_CONTRACT_ID, framedJudgePromptForTest, type JudgeLeg } from "@debateai/judgement";
import { LENGTH_GUIDANCE_START, type LengthGuide } from "@debateai/kernel";
import { createPerplexitySearchPort, readPromptFrame, type PromptPacket } from "@debateai/providers";
import { addressKey, selectPathPages } from "../../packages/evidence/src/host-filter.js";
import { questionWithPurposeLines as apiQuestionWithPurposeLines } from "../../apps/api/src/purpose-lines.js";
import { pathChosenText, type WebPathsPlannerPath } from "../../apps/runner/src/web-planner.js";
import { debateWebPacks, legWithWebSources, pathsPackShares, webSourcesText, type WebPack } from "../../apps/runner/src/web-packs.js";
import type { WebReuseSource } from "../../apps/runner/src/web-reuse.js";
import { runWebStep, webStepRowId, type WebStepPathsMode } from "../../apps/runner/src/web-step.js";
import { CANARY, RUN_ID, membersOf, memoryStore, stepInput, team } from "../support/web-step-world.js";

const Q = "Should Cluj build a second tram line?";
/** The line as the v2 page sends it: the person's words, a blank line, then each answer as a sentence. */
const LINE = `${Q}\n\nIn the north.`;
const LINES: PurposeLines = { place: "Cluj, Romania", answers: [{ question: "Which region?", answer: "The north" }] };
const TITLES = ["Costs", "Riders", "Traffic", "Air", "Jobs", "Land", "Time"] as const;

const pathOf = (no: number): WebPathsPlannerPath => {
  const title = TITLES[no - 1]!;
  return { pathNo: no, pathRef: `b${String(no)}`,
    chosen: pathChosenText({ question: `What does the ${title.toLowerCase()} angle show about the tram?`, viewpoints: [{ title }, { title: null }] }) };
};
const pathsOf = (count: number): readonly WebPathsPlannerPath[] => Array.from({ length: count }, (_, at) => pathOf(at + 1));
const modeOf = (count: number, overrides: Partial<WebStepPathsMode> = {}): WebStepPathsMode =>
  ({ origin: "START", cap: 4 * count, paths: pathsOf(count), alreadyInvestigated: "", reuse: null, purposeLines: LINES, ...overrides });

const frameOf = (body: string) => readPromptFrame({ messages: (JSON.parse(body) as { messages: PromptPacket["messages"] }).messages });
const fieldOf = (body: string, name: string): string | undefined => frameOf(body).fields.find((entry) => entry.name === name)?.content;
const plannersOf = (bodies: readonly string[]) => bodies.filter((body) => frameOf(body).contractId === WEB_DIG_PLANNER_V3_CONTRACT_ID);
const chosenIn = (packet: PromptPacket): string => readPromptFrame(packet).fields.find((entry) => entry.name === "chosen")?.content ?? "";
/** The path's title, the chosen words' second line. */
const titleIn = (packet: PromptPacket): string => chosenIn(packet).split("\n")[1] ?? "";

type Search = Readonly<{ side?: "for" | "against"; local?: boolean; query: string }>;
const reply = (searches: readonly Search[], country: string | null = null) => JSON.stringify({ country, needs_search: true, reason: null, pace: "normal",
  searches: searches.map((search) => ({ side: search.side ?? "for", local: search.local ?? false, query: search.query })) });
const pair = (query: string, local = false) => [{ side: "for" as const, local, query }, { side: "against" as const, local, query: `${query} doubts` }];
const noSearch = (reason: string) => JSON.stringify({ country: null, needs_search: false, reason, pace: null, searches: [] });
const englishPlans = (packet: PromptPacket) => reply(pair(`${titleIn(packet).toLowerCase()} tram report`));
const fourPlans = (country: string | null) => (packet: PromptPacket) => {
  const word = titleIn(packet).toLowerCase();
  return reply([...pair(`${word} tram report`), ...pair(`${word} tramvai raport`, true)], country);
};

/** Perplexity behind the real adapter: what each search asked for, and two made-up pages for it. */
function perplexity() {
  const asked: { query: string; results: number }[] = [];
  const fetchStub = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { query: string; max_results: number };
    asked.push({ query: body.query, results: body.max_results });
    const slug = body.query.toLowerCase().replace(/[^a-z]+/gu, "-");
    const results = [1, 2].map((rank) => ({ title: `${body.query} ${String(rank)}`, url: `https://${slug}-${String(rank)}.example/page`,
      snippet: `The ${body.query} page counts ${String(rank * 7)} thousand riders.\n${CANARY}`, date: "2026-03-01", last_updated: null }));
    return new Response(JSON.stringify({ id: "s", results }), { status: 200 });
  }) as typeof fetch;
  return { asked, port: createPerplexitySearchPort({ fetch: fetchStub, selectPages: (pages) => selectPathPages(pages, new Set()), timeLimitMs: 50 }) };
}

describe("Task 48: one planner per path, the approved dig planner, all at once", () => {
  it("five paths: five web.plan-dig.v3 calls at WEB:plan:1..5, each reading the question with the place once and the answer once", async () => {
    const ais = team({ haiku: { planner: englishPlans } });
    const search = perplexity();
    const result = await runWebStep(stepInput({ members: membersOf(ais.all), search: search.port, prepare: memoryStore().prepare,
      question: LINE, pathsMode: modeOf(5) }));
    const planners = plannersOf(ais.haiku.bodies);
    expect(planners).toHaveLength(5);
    for (const body of planners) {
      expect(fieldOf(body, "question")).toBe(`${Q}\n\nIn the north.\n\nCluj, Romania`);
      expect(fieldOf(body, "country")).toBeUndefined();
      expect(fieldOf(body, "already_investigated")).toBe("");
    }
    expect(planners.map((body) => fieldOf(body, "chosen")).sort()).toEqual(pathsOf(5).map((path) => path.chosen).sort());
    expect(ais.haiku.requests.filter((request) => request.callSiteKey.startsWith("WEB:plan")).map((request) => request.callSiteKey).sort())
      .toEqual(["WEB:plan:1", "WEB:plan:2", "WEB:plan:3", "WEB:plan:4", "WEB:plan:5"]);
    expect(result.plan).toBe("PLANNED");
    expect(result.paths.map((path) => [path.pathRef, path.status])).toEqual(["b1", "b2", "b3", "b4", "b5"].map((ref) => [ref, "SEARCHED"]));
    expect(search.asked).toHaveLength(10);
  });

  it("the question text is the question check's: without the option the answer is added again (today's bytes); the API's name is the same function", () => {
    expect(questionWithPurposeLines(LINE, LINES)).toBe(`${LINE}\n\nCluj, Romania\nWhich region? The north.`);
    expect(questionWithPurposeLines(LINE, LINES, { answersSaid: true })).toBe(`${LINE}\n\nCluj, Romania`);
    expect(questionWithPurposeLines(Q, null)).toBe(Q);
    expect(questionWithPurposeLines(Q, undefined)).toBe(Q);
    expect(apiQuestionWithPurposeLines).toBe(questionWithPurposeLines);
  });

  it("no stored lines: the planner reads the question alone; a line the question already says is not repeated", async () => {
    const bare = team({ haiku: { planner: englishPlans } });
    await runWebStep(stepInput({ members: membersOf(bare.all), search: perplexity().port, prepare: memoryStore().prepare,
      question: Q, pathsMode: modeOf(2, { purposeLines: null }) }));
    expect(plannersOf(bare.haiku.bodies).map((body) => fieldOf(body, "question"))).toEqual([Q, Q]);
    const said = `${Q}\n\nIn Cluj, Romania, in the north.`;
    const once = team({ haiku: { planner: englishPlans } });
    await runWebStep(stepInput({ members: membersOf(once.all), search: perplexity().port, prepare: memoryStore().prepare,
      question: said, pathsMode: modeOf(2, { purposeLines: { place: "Cluj, Romania", time: "By 2030" } }) }));
    expect(plannersOf(once.haiku.bodies).map((body) => fieldOf(body, "question"))).toEqual([`${said}\n\nBy 2030`, `${said}\n\nBy 2030`]);
  });

  it("a dig without pathsMode is unchanged: its planners read the run's line byte for byte, under dig-pick-<n>", async () => {
    const picks = [{ pickNo: 1, text: "Riders in the north." }, { pickNo: 2, text: "The tram's running cost." }];
    const ais = team({ haiku: { planner: (packet) => reply(pair(`${chosenIn(packet).split(" ")[1]!.toLowerCase()} tram study`)) } });
    const store = memoryStore();
    const result = await runWebStep(stepInput({ members: membersOf(ais.all), search: perplexity().port, prepare: store.prepare,
      question: LINE, dig: { picks, alreadyInvestigated: "[]", reuse: null } }));
    expect(plannersOf(ais.haiku.bodies).map((body) => fieldOf(body, "question"))).toEqual([LINE, LINE]);
    expect(ais.haiku.requests.filter((request) => request.callSiteKey.startsWith("WEB:plan")).map((request) => request.callSiteKey).sort())
      .toEqual(["WEB:plan:1", "WEB:plan:2"]);
    expect([...new Set([...store.searches.values()].map((row) => row.pathRef))].sort()).toEqual(["dig-pick-1", "dig-pick-2"]);
    expect(result.dig).toBeDefined();
  });
});

describe("Task 48: the country (spec §4.3, ruling of 30 Oct)", () => {
  it("with the step-2 code RO, every path's planner is told RO and a path planning a local pair keeps it", async () => {
    const ais = team({ haiku: { planner: fourPlans("HU") } });
    const store = memoryStore();
    await runWebStep(stepInput({ members: membersOf(ais.all), search: perplexity().port, prepare: store.prepare,
      question: LINE, placeCountry: "RO", pathsMode: modeOf(3) }));
    const planners = plannersOf(ais.haiku.bodies);
    expect(planners).toHaveLength(3);
    for (const body of planners) expect(fieldOf(body, "country")).toBe("RO");
    const local = [...store.searches.values()].filter((row) => row.languageKind === "local");
    expect(local.map((row) => [row.pathRef, row.country]).sort()).toEqual(
      ["b1", "b1", "b2", "b2", "b3", "b3"].map((ref) => [ref, "RO"]));
  });

  it("with no code, no country field; a planner naming RO keeps RO after code's salvage", async () => {
    const ais = team({ haiku: { planner: fourPlans("RO") } });
    const store = memoryStore();
    await runWebStep(stepInput({ members: membersOf(ais.all), search: perplexity().port, prepare: store.prepare,
      question: LINE, placeCountry: null, pathsMode: modeOf(2) }));
    for (const body of plannersOf(ais.haiku.bodies)) expect(fieldOf(body, "country")).toBeUndefined();
    const local = [...store.searches.values()].filter((row) => row.languageKind === "local");
    expect(local.map((row) => [row.pathRef, row.country, row.language]).sort()).toEqual(
      [["b1", "RO", "ro"], ["b1", "RO", "ro"], ["b2", "RO", "ro"], ["b2", "RO", "ro"]]);
  });
});

describe("Task 48: each path its own decision, its own searches and its own pack", () => {
  it("one path answering NO_SEARCH_PLANNED leaves the other paths' searches and packs untouched", async () => {
    const all = memoryStore();
    await runWebStep(stepInput({ members: membersOf(team({ haiku: { planner: englishPlans } }).all), search: perplexity().port,
      prepare: all.prepare, question: LINE, pathsMode: modeOf(5) }));
    const planner = (packet: PromptPacket) => titleIn(packet) === "Traffic" ? noSearch("Traffic here turns on what the town values.") : englishPlans(packet);
    const store = memoryStore();
    const input = stepInput({ members: membersOf(team({ haiku: { planner } }).all), search: perplexity().port, prepare: store.prepare,
      question: LINE, pathsMode: modeOf(5) });
    const result = await runWebStep(input);
    expect(result.paths.map((path) => [path.pathRef, path.status])).toEqual([["b1", "SEARCHED"], ["b2", "SEARCHED"], ["b3", "NO_SEARCH_PLANNED"],
      ["b4", "SEARCHED"], ["b5", "SEARCHED"]]);
    expect(input.planStatuses[0]!.map((entry) => [entry.pathId, entry.status, entry.reason])).toEqual([["b1", "PLANNED", null], ["b2", "PLANNED", null],
      ["b3", "NO_SEARCH_PLANNED", "Traffic here turns on what the town values."], ["b4", "PLANNED", null], ["b5", "PLANNED", null]]);
    const others = (rows: ReadonlyMap<string, Record<string, unknown>>) => [...rows.entries()].filter(([, row]) => row.pathRef !== "b3")
      .map(([id, row]) => [id, row.pathRef]).sort();
    expect(others(store.searches)).toEqual(others(all.searches));
    expect(others(store.packs)).toEqual(others(all.packs));
    expect([...store.packs.values()].map((row) => row.pathRef).sort()).toEqual(["b1", "b2", "b4", "b5"]);
    expect([...store.searches.values()].some((row) => row.pathRef === "b3")).toBe(false);
  });

  it("a path whose planners all fail, or whose searches the cap cut whole, is FAILED with its own code; the others go on", async () => {
    const planner = (packet: PromptPacket) => titleIn(packet) === "Riders" ? "{{ not a reply" : englishPlans(packet);
    const input = stepInput({ members: membersOf(team({ haiku: { planner }, qwen: { planner } }).all), search: perplexity().port,
      prepare: memoryStore().prepare, question: LINE, pathsMode: modeOf(3) });
    const result = await runWebStep(input);
    expect(result.paths.map((path) => [path.pathRef, path.status, path.code])).toEqual([["b1", "SEARCHED", null],
      ["b2", "FAILED", "WEB_PLANNER_REPLY_REFUSED"], ["b3", "SEARCHED", null]]);
    expect(input.planStatuses[0]!.map((entry) => [entry.pathId, entry.status, entry.searchesToSend])).toEqual([["b1", "PLANNED", 2],
      ["b2", "FAILED", 0], ["b3", "PLANNED", 2]]);
    const capped = stepInput({ members: membersOf(team({ haiku: { planner: englishPlans } }).all), search: perplexity().port,
      prepare: memoryStore().prepare, question: LINE, pathsMode: modeOf(2, { cap: 2 }) });
    const over = await runWebStep(capped);
    expect(over.paths.map((path) => [path.pathRef, path.status, path.code])).toEqual([["b1", "SEARCHED", null], ["b2", "FAILED", "WEB_PLAN_OVER_CAP"]]);
    expect(capped.planStatuses[0]!.map((entry) => [entry.pathId, entry.status, entry.searchesToSend])).toEqual([["b1", "PLANNED", 2], ["b2", "PLANNED", 0]]);
  });

  it("Free never searches (NOT_ON_PLAN for every path), the setting off says SWITCHED_OFF: no planner, nothing opened", async () => {
    for (const [overrides, status] of [[{ planId: "FREE" as const }, "NOT_ON_PLAN"], [{ webSwitchedOn: false }, "SWITCHED_OFF"]] as const) {
      const ais = team({ haiku: { planner: englishPlans } });
      const search = perplexity();
      const store = memoryStore();
      const input = stepInput({ members: membersOf(ais.all), search: search.port, prepare: store.prepare, question: LINE,
        pathsMode: modeOf(3), ...overrides });
      const result = await runWebStep(input);
      expect(ais.haiku.bodies).toEqual([]);
      expect(search.asked).toEqual([]);
      expect(store.prepared()).toBe(0);
      expect(result.paths.map((path) => [path.pathRef, path.status])).toEqual(["b1", "b2", "b3"].map((ref) => [ref, status]));
      expect(input.planStatuses[0]!.map((entry) => [entry.pathId, entry.status])).toEqual(["b1", "b2", "b3"].map((ref) => [ref, status]));
    }
  });

  it("seven paths keep all 28 searches under a cap of 4 per path; the cap given is the one kept", async () => {
    const seven = perplexity();
    await runWebStep(stepInput({ members: membersOf(team({ haiku: { planner: fourPlans("RO") } }).all), search: seven.port,
      prepare: memoryStore().prepare, question: LINE, pathsMode: modeOf(7) }));
    expect(seven.asked).toHaveLength(28);
    expect(new Set(seven.asked.map((entry) => entry.query)).size).toBe(28);
    // Under Quick look's first-debate cap of 20 the last paths would lose their local pairs first.
    const twenty = perplexity();
    const store = memoryStore();
    await runWebStep(stepInput({ members: membersOf(team({ haiku: { planner: fourPlans("RO") } }).all), search: twenty.port,
      prepare: store.prepare, question: LINE, pathsMode: modeOf(7, { cap: 20 }) }));
    expect(twenty.asked).toHaveLength(20);
    const localOf = (ref: string) => [...store.searches.values()].filter((row) => row.pathRef === ref && row.languageKind === "local").length;
    expect(["b1", "b2", "b3", "b4", "b5", "b6", "b7"].map(localOf)).toEqual([2, 2, 2, 0, 0, 0, 0]);
  });

  it("each path is its own group under b<n>, serving itself: START asks 10 results a search; DIG 5, reusing the investigation's pages", async () => {
    const url = "https://riders-tram-report-1.example/page";
    const asked: string[] = [];
    const reuse: WebReuseSource = { find: async (addresses) => { asked.push(...addresses);
      return new Map(addresses.filter((key) => key === addressKey(url)).map((key) => [key, {
        sourceRunId: "44444444-4444-4444-8444-444444444444", sourcePageId: "55555555-5555-4555-8555-555555555555", text: "The earlier page text.", grade: 3 as const,
        line: "It counts riders.", note: null, lineLanguage: "en", readerOneMaker: "anthropic", topReadings: [], extracts: [] }])); } };
    const start = perplexity();
    const store = memoryStore();
    // A first debate has no investigation: a reuse source handed to START is never asked.
    const result = await runWebStep(stepInput({ members: membersOf(team({ haiku: { planner: englishPlans } }).all), search: start.port,
      prepare: store.prepare, question: LINE, pathsMode: modeOf(3, { reuse }) }));
    expect(asked).toEqual([]);
    expect(start.asked.every((entry) => entry.results === 10)).toBe(true);
    expect([...store.searches.values()].map((row) => row.pathRef).sort()).toEqual(["b1", "b1", "b2", "b2", "b3", "b3"]);
    expect(result.paths.map((path) => path.packId)).toEqual(["b1", "b2", "b3"].map((ref) => webStepRowId(RUN_ID, "pack", ref)));
    expect([...store.packs.values()].map((row) => row.pathRef).sort()).toEqual(["b1", "b2", "b3"]);
    expect(result.paths.every((path) => path.digPacks === undefined)).toBe(true);
    expect(result.dig).toBeUndefined();

    const dig = perplexity();
    const ais = team({ haiku: { planner: englishPlans } });
    const digResult = await runWebStep(stepInput({ members: membersOf(ais.all), search: dig.port, prepare: memoryStore().prepare,
      question: LINE, pathsMode: modeOf(3, { origin: "DIG", alreadyInvestigated: "[]", reuse }) }));
    expect(dig.asked.every((entry) => entry.results === 5)).toBe(true);
    expect(asked).toContain(addressKey(url));
    // Reader 1 reads each path's 4 pages against its own words, but not the page the investigation already read (Riders is b2).
    const readerOne = ais.haiku.bodies.filter((body) => frameOf(body).contractId.startsWith("web.read-all"));
    const pagesFor = (no: number) => readerOne.filter((body) => fieldOf(body, "answer") === pathOf(no).chosen)
      .flatMap((body) => JSON.parse(fieldOf(body, "pages")!) as unknown[]).length;
    expect([1, 2, 3].map(pagesFor)).toEqual([4, 3, 4]);
    expect(plannersOf(ais.haiku.bodies).map((body) => fieldOf(body, "already_investigated"))).toEqual(["[]", "[]", "[]"]);
    expect(digResult.paths.map((path) => [path.pathRef, path.status])).toEqual(["b1", "b2", "b3"].map((ref) => [ref, "SEARCHED"]));
  });
});

describe("Task 48: every leg reads every path's pack, labelled by its path's title", () => {
  const packOf = (no: number): WebPack => ({ pathRef: `b${String(no)}`,
    pages: [{ pageId: `p${String(no)}`, rank: 1, title: `Page ${String(no)}`, site: `s${String(no)}.example.org`, date: null, readDepth: "whole" }],
    extracts: [{ label: `S${String(no)}-1`, pageId: `p${String(no)}`, quote: `Made-up quote ${String(no)}.` }] });
  const sharesOf = () => pathsPackShares([{ pathRef: "b1", label: "T1" }, { pathRef: "b2", label: "T2" }]);
  type Section = Readonly<{ for: string; chosen: string; extracts: readonly Readonly<{ id: string }>[] }>;

  it("pathsPackShares: each path reads every path's pack, in the paths' order, under its label", () => {
    const reads = [{ keptUnder: "b1", chosen: "T1" }, { keptUnder: "b2", chosen: "T2" }];
    expect(sharesOf()).toEqual([{ pathRef: "b1", reads }, { pathRef: "b2", reads }]);
    const packs = debateWebPacks([packOf(1), packOf(2)], sharesOf())!;
    for (const own of ["b1", "b2"]) {
      const sections = JSON.parse(webSourcesText(packs, [{ pathRef: own, for: "position_under_debate" }])!) as readonly Section[];
      expect(sections.map((section) => section.chosen)).toEqual(["T1", "T2"]);
      expect(sections.map((section) => section.extracts[0]!.id)).toEqual(["S1-1", "S2-1"]);
    }
  });

  it("a path's root leg reads them all under path_question, in its sources variant; with no packs it is the same leg", () => {
    const root: JudgeLeg = { kind: "path-root", pathTitle: "Riders", pathQuestion: "Who would ride the second line?",
      viewpoints: "Riders: who would ride it?", pointsRaised: "", readingLevel: null };
    const packs = debateWebPacks([packOf(1), packOf(2)], sharesOf())!;
    const leg = legWithWebSources(root, packs, { own: "b2" });
    expect(leg).not.toBe(root);
    const sections = JSON.parse((leg as { sources: string }).sources) as readonly Section[];
    expect(sections.map((section) => [section.for, section.chosen])).toEqual([["path_question", "T1"], ["path_question", "T2"]]);
    const guide: LengthGuide = { words: 120, languageCode: "en", charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
    const frame = readPromptFrame(framedJudgePromptForTest(leg, Q, "English", "resolved", null, guide).packet);
    expect(frame.contractId).toBe("judge.path-root.resolved.sources.v1");
    expect(frame.fields.find((field) => field.name === "sources")?.content).toBe((leg as { sources: string }).sources);
    expect(legWithWebSources(root, null, { own: "b1" })).toBe(root);
  });

  it("pathChosenText: the path's question, then each viewpoint's title once, at most 2,000 characters", () => {
    expect(pathChosenText({ question: "Who would ride it?", viewpoints: [{ title: "Riders" }, { title: null }, { title: "Riders" }, { title: "Costs" }] }))
      .toBe("Who would ride it?\nRiders\nCosts");
    expect(pathChosenText({ question: "Who would ride it?", viewpoints: [] })).toBe("Who would ride it?");
    // The cut never splits the tram's two code units: it ends on the last whole character, then "…".
    const long = pathChosenText({ question: `${"a".repeat(1_998)}\u{1F68B}`, viewpoints: [{ title: "Riders" }] });
    expect(long).toBe(`${"a".repeat(1_998)}…`);
    expect(pathChosenText({ question: "b".repeat(2_500), viewpoints: [] })).toHaveLength(2_000);
  });
});
