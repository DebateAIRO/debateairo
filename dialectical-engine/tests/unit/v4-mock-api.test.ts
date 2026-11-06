import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as fixture from "../../apps/ui/lib/v3/storyFixture.js";
import {
  AnswerDigSchema, AnswerPathRewritesSchema, AnswerSchema, AnswerWebSchema, AskParentSchema, AskRoomResponseSchema, AskRequestSchema,
  AnswerIndexSchema, AskRoomQuerySchema, BillingUsageResponseSchema, cutQuoteAtWordEdge, DebateInvestigationSchema, DIG_LEVEL_MAX, DigSuggestionSchema,
  InvestigationReportsSchema, MonthPauseSchema, NodeSchema, PathRewriteSchema, RunProjectionSchema, UsageBorrowSchema, WebOtherPageSchema, WebPathSchema,
  WebSourceSchema
} from "../../packages/contract/src/index.js";
import { createSeed, SEED_NODE_IDS } from "../../tools/v4-mock-api/seed.js";
import {
  answerDraftProblems, contractOrDraft, cutQuote, DraftAnswerWebSchema, DraftAskParentSchema, DraftDigSuggestionSchema,
  DraftInvestigationSchema, DraftOtherPageSchema, DraftRoomPartSchema, DraftSourceSchema, DraftWebPathSchema,
  DraftRoomQueryPartSchema, READ_DEPTHS, RESEARCHED_STATES, splitAsk, splitRoomQuery, stripAnswer, stripRoom, stripRun, stripUsage,
  SUGGESTION_KINDS, SUGGESTION_SIDES, DraftPathRewritesSchema, DraftAnswerDigSchema, DraftMonthPauseSchema, DraftRunQuotaUsedSchema,
  DraftUsageBorrowsSchema, DraftRunStartedAtSchema, answerIndexDraftProblems, DraftShelfRowPartSchema, stripAnswerIndex,
  DraftQuestionShareSchema, DraftShareScopeSchema, DraftReportSharePartSchema, reportShareProblems, stripReportShare
} from "../../tools/v4-mock-api/web-draft.js";
import {
  borrowNotice, DEEPEST_DIG, DIG_ANSWERS, DIG_FINISHED_AT, DIG_RUNS, mainAnswerAt, monthPause, PATH_REWRITES, reportVersionBody, SEEDED_NEW_DIGS
} from "../../tools/v4-mock-api/rewrite-seed.js";
import { WEB_CASES, type WebCase } from "../../tools/v4-mock-api/web-seed.js";
import { digProgressAt, DraftDigProgressSchema, LIVE_MODES, LIVE_STEPS_NO_WEB, LIVE_STEPS_WEB } from "../../tools/v4-mock-api/live-seed.js";
import { climbAt, CLIMB_MODES, CLIMB_STEP_MS } from "../../tools/v4-mock-api/climb-seed.js";
import { FAILED_DIGS, FAILED_DIGS_PARENT, RUN_FAILED_SOME } from "../../tools/v4-mock-api/failed-seed.js";
import { windowsForPlan } from "../../tools/v4-mock-api/plan-windows.js";
import { RUN_FAILURE_KINDS, runFailureKind } from "../../apps/ui/lib/v3/runFailure.js";
import { failedQuotaKey } from "../../apps/ui/lib/v4/failedRun.js";
import { digQuestion } from "../../apps/ui/lib/v4/askText.js";
import { digRetryOf, rebuildDigTarget, sameDig } from "../../apps/ui/lib/v4/digRetry.js";
import { buildV4Map, findOpenQuestion, findPath } from "../../apps/ui/lib/v4/mapModel.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import { parseDigProgress } from "../../apps/ui/lib/v4/digProgress.js";
import { belowStateOf, type BelowDig } from "../../apps/ui/lib/v4/digsBelow.js";

/*
 * These checks hold before and after W1-6 merges: they never assert that today's contract refuses a draft field.
 *
 * Perplexity plan W1-7 (2026-10-30): the V4 mock API (tools/v4-mock-api) carries DRAFT web fields (sources, each path's
 * search, other pages, "added to researched", dig suggestions, investigations, the room's reserve word and a dig's share
 * of today), mirroring W1-6's shapes until they merge into the contract. These checks hold the seed to the owner's rules
 * and keep today's contract happy once the draft fields are held back. The running mock checks itself with check.ts.
 */
const seed = createSeed(fixture);
const catalog = JSON.parse(readFileSync(join(resolve(import.meta.dirname, "../../apps/ui"), "messages/en/v4.json"), "utf8")) as Record<string, string>;
/** Owner: every quote shown to people is at most 120 characters. */
const QUOTE_MAX = 120;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const answerOf = (web: WebCase | undefined): Loose => seed.answer({
  answerId: "aaaa1111-1111-4111-8111-111111111111", runRef: "11111111-1111-4111-8111-111111111111",
  question: "Should countries build new nuclear power, or put the money into renewables and storage?",
  askedAt: "2026-10-27T15:12:00.000Z", servedAt: "2026-10-27T15:40:00.000Z", ...(web === undefined ? {} : { web })
});
const pathsOf = (web: WebCase): Loose[] => answerOf(web).web.paths;
const allSources = (web: WebCase): Loose[] => answerOf(web).nodes.flatMap((node: Loose) => node.sources);
const suggestionsOf = (web: WebCase): Loose[] => pathsOf(web).flatMap((path) => path.suggestions);

describe("V4 mock API: the draft web fields", () => {
  it("serves the contract's own shapes, not copies (plan W2-6: W1-6 merged)", () => {
    expect(DraftSourceSchema).toBe(WebSourceSchema);
    expect(DraftOtherPageSchema).toBe(WebOtherPageSchema);
    expect(DraftDigSuggestionSchema).toBe(DigSuggestionSchema);
    expect(DraftWebPathSchema).toBe(WebPathSchema);
    expect(DraftAnswerWebSchema).toBe(AnswerWebSchema);
    expect(DraftAskParentSchema).toBe(AskParentSchema);
    expect(DraftInvestigationSchema).toBe(DebateInvestigationSchema);
    expect(cutQuote("word ".repeat(40))).toBe(cutQuoteAtWordEdge("word ".repeat(40)));
    // The contract knows the web fields now, so the website gets every seeded case whole.
    for (const web of WEB_CASES) {
      const answer = answerOf(web);
      expect(contractOrDraft(AnswerSchema, answer, stripAnswer), web).toEqual({ body: answer, draft: true });
    }
  });


  it("cuts a quote to at most 120 characters at a word edge", () => {
    expect(cutQuote("A short quote.")).toBe("A short quote.");
    const long = "word ".repeat(40).trim();
    const cut = cutQuote(long);
    expect(cut.length).toBeLessThanOrEqual(QUOTE_MAX);
    expect(cut.endsWith("…")).toBe(true);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    expect(long[cut.length - 1]).toBe(" ");
    expect(cutQuote("x".repeat(200)).length).toBe(QUOTE_MAX);
    expect(cutQuote(cut)).toBe(cut);
  });

  it("every case passes today's contract once the draft fields are held back, and the draft schemas with them", () => {
    for (const web of [undefined, ...WEB_CASES]) {
      const answer = answerOf(web);
      const stripped = stripAnswer(answer);
      expect(AnswerSchema.safeParse(stripped).success, String(web)).toBe(true);
      for (const node of stripped.nodes) expect(NodeSchema.safeParse(node).success, `${web} ${node.node_id}`).toBe(true);
      // What the mock sends: the whole answer once the contract knows the draft fields (W1-6 merged), else the stripped one.
      const sent = contractOrDraft(AnswerSchema, answer, stripAnswer).body;
      expect(AnswerSchema.safeParse(sent).success, String(web)).toBe(true);
      expect([answer, stripped], String(web)).toContainEqual(sent);
      if (web === undefined) continue;
      expect(answerDraftProblems(answer), web).toEqual([]);
      expect(pathsOf(web).map((path) => path.position_ref)).toEqual(["n-mix", "n-renew", "n-nuclear", "n-smr"]);
    }
  });

  it("the paid debate shows sources, other pages, a path with no search planned and every outcome", () => {
    const paths = pathsOf("PAID");
    expect(paths.map((path) => path.search.status)).toEqual(["SEARCHED", "SEARCHED", "SEARCHED", "NO_SEARCH_PLANNED"]);
    expect(paths[3].search.reason.length).toBeGreaterThan(0);
    const sources = allSources("PAID");
    expect(sources.length).toBeGreaterThan(0);
    expect(new Set(sources.map((source) => source.read_depth))).toEqual(new Set(READ_DEPTHS));
    expect(sources.some((source) => source.fewer_readers === true)).toBe(true);
    expect(new Set(sources.map((source) => source.extract_id)).size).toBe(sources.length);
    for (const source of sources) {
      expect(Array.from(source.quote).length, source.extract_id).toBeLessThanOrEqual(QUOTE_MAX);
      expect(source.explanation.language).toBe("en");
      expect(new URL(source.link).hostname.endsWith(".example"), source.link).toBe(true);
    }
    const pages = paths.flatMap((path) => path.other_pages);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((page) => new URL(page.link).hostname.endsWith(".example"))).toBe(true);
    expect(new Set(pages.filter((page) => page.researched !== undefined).map((page) => page.researched.state))).toEqual(new Set(RESEARCHED_STATES));
    expect(new Set(suggestionsOf("PAID").map((suggestion) => suggestion.kind))).toEqual(new Set(SUGGESTION_KINDS));
    expect(new Set(suggestionsOf("PAID").filter((suggestion) => suggestion.side !== null).map((suggestion) => suggestion.side))).toEqual(new Set(SUGGESTION_SIDES));
  });

  it("only a point resting on an extract of this debate is checked as looked up; a remembered citation is not", () => {
    const nodes = answerOf("PAID").nodes;
    for (const node of nodes) {
      expect(node.looked_up_checked, node.node_id).toBe(node.sources.length > 0);
      if (!node.looked_up_checked) continue;
      expect(node.way_of_knowing, node.node_id).toBe("LOOKED_UP");
      expect(node.sources.map((source: Loose) => source.extract_id), node.node_id).toContain(node.locator);
    }
    const remembered = nodes.find((node: Loose) => node.node_id === "n-mix-cost");
    expect(remembered.way_of_knowing).toBe("LOOKED_UP");
    expect(remembered.locator).not.toBeNull();
    expect(remembered.looked_up_checked).toBe(false);
  });

  it("a failed search and a Free debate carry no sources and no pages, and Free never suggests a web search", () => {
    expect(pathsOf("FAILED").every((path) => path.search.status === "FAILED")).toBe(true);
    expect(pathsOf("FREE").every((path) => path.search.status === "NOT_ON_PLAN")).toBe(true);
    for (const web of ["FAILED", "FREE"] as const) {
      expect(allSources(web)).toEqual([]);
      expect(answerOf(web).nodes.every((node: Loose) => node.looked_up_checked === false)).toBe(true);
      expect(pathsOf(web).flatMap((path) => path.other_pages)).toEqual([]);
      expect(suggestionsOf(web).some((suggestion) => suggestion.kind === "NEEDS_MORE_WEB")).toBe(false);
    }
  });

  it("every suggestion rests on places of this map, and nothing on the page carries a grade or a score", () => {
    const nodes = new Set(SEED_NODE_IDS);
    for (const web of WEB_CASES) {
      const positions = new Set(pathsOf(web).map((path) => path.position_ref));
      for (const suggestion of suggestionsOf(web)) {
        for (const place of suggestion.places) {
          const known = place.startsWith("p:") ? nodes.has(place.slice(2)) : place.startsWith("path:") && positions.has(place.slice(5));
          expect(known, `${web} ${suggestion.suggestion_id} ${place}`).toBe(true);
        }
      }
      const text = JSON.stringify({ paths: pathsOf(web), sources: allSources(web) });
      expect(text).not.toMatch(/"[a-z_]*(grade|score|strength|spread)[a-z_]*":/u);
    }
  });

  it("the room's reserve word and a dig's share fall back to today's room read", () => {
    const blocked = {
      room: "FULL", scope: "PERSON_DAY", resets_at: "2026-10-31T00:00:00.000Z", waiting_run_ref: null, plan_id: "PLUS", reserve: "BLOCKED"
    };
    expect(DraftRoomPartSchema.safeParse(blocked).success).toBe(true);
    expect(DraftRoomPartSchema.safeParse({ ...blocked, room: "FITS", scope: null, resets_at: null }).success).toBe(false);
    const { reserve: _reserve, ...full } = blocked;
    expect(stripRoom(blocked)).toEqual(full);
    expect(AskRoomResponseSchema.safeParse(stripRoom(blocked)).success).toBe(true);
    const fits = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", reserve: "KEPT", dig_share_percent: 20 };
    expect(DraftRoomPartSchema.safeParse(fits).success).toBe(true);
    expect(DraftRoomPartSchema.safeParse({ ...fits, dig_share_percent: 22 }).success).toBe(false);
    expect(AskRoomResponseSchema.safeParse(stripRoom(fits)).success).toBe(true);
    const query = { plan_tier: "premium", composition_budget_tier: "medium", depth: "2", answer_length: "standard" };
    const dig = { dig_parent: "11111111-1111-4111-8111-111111111111", dig_mode: "thorough", dig_picks: "2" };
    const split = splitRoomQuery({ ...query, ...dig });
    expect(split).toEqual({ query, dig });
    expect(AskRoomQuerySchema.safeParse(split.query).success).toBe(true);
    expect(DraftRoomQueryPartSchema.safeParse(split.dig).success).toBe(true);
    expect(DraftRoomQueryPartSchema.safeParse({ dig_mode: "quick" }).success).toBe(false);
  });

  it("an ask's draft parent is split off before today's ask rules read it", () => {
    const ask = {
      question_line: "Does this hold up, and when?", risk_tier: "standard", tier_source: "MACHINE_DEFAULT", tier_provenance_ref: "check:v4-mock",
      composition_budget_tier: "medium", depth_params: { depth: 1, answerLength: "short" }, decision_scope: "personal",
      as_of: "2026-10-30T10:00:00.000Z", steering_presets: [], plan_tier: "premium", steering_annotations: [], site_language: "en"
    };
    const parent = {
      parent_run_id: "11111111-1111-4111-8111-111111111111", places: ["p:n-renew-storage"], mode: "quick",
      picks: [
        { kind: "CONTRADICTING", suggestion_id: "renew-contradicting", place: "p:n-renew-storage", text: "Can batteries cover several windless days?" },
        { kind: "OWN_VIEW", suggestion_id: null, place: "path:n-renew", text: "What about pumped hydro?" }
      ]
    };
    const split = splitAsk({ ...ask, parent });
    expect(AskRequestSchema.safeParse(split.ask).success).toBe(true);
    expect(DraftAskParentSchema.safeParse(split.parent).success).toBe(true);
    expect(DraftAskParentSchema.safeParse({ ...parent, picks: [{ ...parent.picks[1], suggestion_id: "x" }] }).success).toBe(false);
    expect(splitAsk(ask)).toEqual({ ask, parent: undefined });
  });

  it("a seeded report version is one the website can read, with the paths its PDF prints; Free has no sources", () => {
    const read = (fields: Readonly<{ free?: boolean; arabic?: boolean }>) => InvestigationReportsSchema.parse({
      investigation_id: "1a1a1a1a-1111-4111-8111-111111111111", root_run_id: "11111111-1111-4111-8111-111111111111", state: "CLOSED", digs: 1, current: 1,
      versions: [reportVersionBody({ version: 1, closedAt: "2026-10-28T09:00:00.000Z", writtenAt: "2026-10-28T09:00:00.000Z", ...fields })]
    }).versions[0] as Readonly<{ sources: readonly unknown[]; paths: readonly Readonly<{ dig?: unknown; level: number }>[]; story: Readonly<{ short_answer: string }> }>;
    const paid = read({});
    expect(paid.sources.length).toBeGreaterThan(0);
    expect(paid.paths.some((path) => path.dig !== undefined && path.level === 1)).toBe(true);
    expect(read({ free: true }).sources).toEqual([]);
    expect(read({ arabic: true }).story.short_answer).toMatch(/[\u0600-\u06FF]/u);
  });

  it("an investigation is open or closed, keeps its earlier reports and numbers its closings", () => {
    const open = {
      investigation_id: "1a1a1a1a-1111-4111-8111-111111111111", root_run_id: "11111111-1111-4111-8111-111111111111",
      state: "OPEN",
      digs: [{
        parent_run_id: "11111111-1111-4111-8111-111111111111", child_run_id: "88888888-8888-4888-8888-888888888888",
        places: ["p:n-renew-storage"], mode: "quick", created_at: "2026-10-29T08:00:00.000Z"
      }],
      closings: [{ report_version: 1, closed_at: "2026-10-28T09:00:00.000Z", report: "READY", answer_id: "aaaa1111-1111-4111-8111-111111111111" }]
    };
    expect(DraftInvestigationSchema.safeParse(open).success).toBe(true);
    expect(DraftInvestigationSchema.safeParse({ ...open, state: "CLOSED" }).success).toBe(true);
    expect(DraftInvestigationSchema.safeParse({ ...open, state: "CLOSED", closings: [] }).success).toBe(false);
    expect(DraftInvestigationSchema.safeParse({ ...open, closings: [{ ...open.closings[0], report_version: 2 }] }).success).toBe(false);
  });

  it("every draft word the mock uses has its English label in the V4 catalogue", () => {
    const words = [
      ...SUGGESTION_KINDS.filter((kind) => kind !== "HELPS_MAIN_QUESTION").map((kind) => `v4.suggest.kind.${kind}`),
      ...SUGGESTION_SIDES.map((side) => `v4.suggest.kind.HELPS_MAIN_QUESTION.${side}`),
      ...RESEARCHED_STATES.map((state) => `v4.web.researched.${state}`),
      "v4.web.noSearch", "v4.web.switchedOff", "v4.web.previewOnly", "v4.web.fewerReaders", "v4.web.otherPages", "v4.web.addResearched",
      "v4.web.failed", "v4.web.free", "v4.web.sureBasis", "v4.room.blockedUntil", "v4.dig.quotaShare", "v4.dig.quotaDayUsed",
      "v4.suggest.ownView", "v4.suggest.edit"
    ];
    expect(words.filter((key) => !(key in catalog))).toEqual([]);
  });
});

/*
 * Plan 2026-10-30-dig-model-revision.md, task W2-7: the mock's seeded dig model (rewritten paths, the verdict on the
 * person's point of view, a dig trail three levels down) and the money rule (a paused debate, a borrow notice, new starts
 * waiting for the reset). The shapes are the contract's; these checks hold the seed to the owner's rules.
 */
describe("V4 mock API: the new dig model and the money rule", () => {
  it("serves the contract's own shapes for the rewrites, a dig's part, the pause and the borrow notices", () => {
    expect(DraftPathRewritesSchema).toBe(AnswerPathRewritesSchema);
    expect(DraftAnswerDigSchema).toBe(AnswerDigSchema);
    expect(DraftMonthPauseSchema).toBe(MonthPauseSchema);
    expect(DraftUsageBorrowsSchema.element).toBe(UsageBorrowSchema);
  });

  it("every seeded rewrite and dig passes the contract, and an answer carrying them passes AnswerSchema", () => {
    for (const [run, rewrites] of Object.entries(PATH_REWRITES)) {
      expect(AnswerPathRewritesSchema.safeParse(rewrites).success, run).toBe(true);
      const answer = { ...answerOf("PAID"), path_rewrites: rewrites, ...(DIG_ANSWERS[run] === undefined ? {} : { dig: DIG_ANSWERS[run] }) };
      expect(AnswerSchema.safeParse(answer).success, run).toBe(true);
      expect(answerDraftProblems(answer), run).toEqual([]);
      // Held back from an older contract: no rewrites and no dig part.
      expect(Object.keys(stripAnswer(answer)).filter((key) => key === "path_rewrites" || key === "dig"), run).toEqual([]);
    }
    for (const [run, dig] of Object.entries(DIG_ANSWERS)) expect(AnswerDigSchema.safeParse(dig).success, run).toBe(true);
  });

  it("a rewritten path shows its new text, what the dig changed and, beside the person's own words, the verdict", () => {
    const root = PATH_REWRITES[DIG_RUNS.root]!;
    const mix = root.paths.find((path) => path.position_ref === "n-mix")!;
    const newest: Loose = mix.history.at(-1);
    expect(mix.current).toEqual(newest.text);
    expect(newest.what_changed.length).toBeGreaterThan(0);
    expect(newest.view).toMatchObject({ outcome: "HELPED", scope: "MAIN_QUESTION" });
    expect(newest.view.own_words).toEqual(DIG_ANSWERS[DIG_RUNS.ownView]!.picks.filter((pick) => pick.by !== "AI_SUGGESTION").map((pick) => pick.text));
    // A dig made of an AI suggestion chosen as it was carries no verdict.
    const renew = root.paths.find((path) => path.position_ref === "n-renew")!;
    expect((renew.history.at(-1) as Loose).view).toBeNull();
    expect(renew.changed_below).toBe(true);
    expect(root.changed_since).toEqual({ count: 2, since_report_version: 1 });
  });

  it("the dig trail goes three levels down, each dig under its parent, the deepest one still rewriting", () => {
    const chain = [DIG_RUNS.levelOne, DIG_RUNS.levelTwo, DIG_RUNS.levelThree].map((run) => DIG_ANSWERS[run]!);
    expect(chain.map((dig) => dig.level)).toEqual([1, 2, 3]);
    expect(chain.map((dig) => dig.parent_run_id)).toEqual([DIG_RUNS.root, DIG_RUNS.levelOne, DIG_RUNS.levelTwo]);
    expect(chain.map((dig) => dig.rewrite?.state)).toEqual(["READY", "READY", "WRITING"]);
    expect(chain.every((dig) => dig.level < DIG_LEVEL_MAX)).toBe(true);
    // Each rewrite stands in its parent's path history, finished when its dig's run settled.
    for (const [run, dig] of Object.entries(DIG_ANSWERS)) {
      const parent = PATH_REWRITES[dig.parent_run_id]!.paths.find((path) => path.position_ref === dig.position_ref)!;
      expect(parent.history.map((rewrite) => rewrite.rewrite_id), run).toContain(dig.rewrite!.rewrite_id);
      const seeded = SEEDED_NEW_DIGS.find((candidate) => candidate.runRef === run);
      expect(dig.rewrite!.dig_finished_at, run).toBe(seeded?.settledAt ?? DIG_FINISHED_AT.levelOne);
    }
  });

  it("W4-6: the first debate shows all four rewrite states for the click-test, and the count leaves out the two unchanged", () => {
    const root = PATH_REWRITES[DIG_RUNS.root]!;
    const newest = Object.fromEntries(root.paths.map((path) => [path.position_ref, path.history.at(-1) as Loose]));
    expect(newest["n-nuclear"]).toMatchObject({ state: "FAILED", dig_run_id: DIG_RUNS.failed });
    expect(root.paths.find((path) => path.position_ref === "n-nuclear")!.current).toBeNull();
    expect(newest["n-smr"]).toMatchObject({ state: "READY", changed: false, dig_run_id: DIG_RUNS.noChange });
    expect(newest["n-smr"].what_changed.length).toBeGreaterThan(0);
    expect(PATH_REWRITES[DIG_RUNS.levelTwo]!.paths[0]!.history.at(-1)!.state).toBe("WRITING");
    expect(root.changed_since.count).toBe(2);
    // Both digs are seeded runs of the first debate, so "Open the dig's map" opens a real page.
    for (const run of [DIG_RUNS.failed, DIG_RUNS.noChange]) {
      expect(SEEDED_NEW_DIGS.some((dig) => dig.runRef === run), run).toBe(true);
      expect(DIG_ANSWERS[run]!.parent_run_id, run).toBe(DIG_RUNS.root);
    }
  });

  it("W3-4: a dig at the deepest level, for the click-test of the deepest-level line", () => {
    expect(AnswerDigSchema.safeParse(DEEPEST_DIG.dig).success).toBe(true);
    expect(DEEPEST_DIG.dig.level).toBe(DIG_LEVEL_MAX);
    expect(DEEPEST_DIG.dig.parent_run_id).toBe(DIG_RUNS.levelThree);
    expect(Object.keys(DIG_ANSWERS)).not.toContain(DEEPEST_DIG.runRef);
    expect(Date.parse(DEEPEST_DIG.settledAt)).toBeGreaterThan(Date.parse(DEEPEST_DIG.askedAt));
  });

  it("dig-f1: the first debate's main answer is still being rewritten, then has its newest version; both pass the contract", () => {
    const readyAt = Date.parse("2026-11-04T10:00:00.000Z");
    const writing = mainAnswerAt(readyAt - 1, readyAt);
    const done = mainAnswerAt(readyAt, readyAt);
    expect(writing.writing).toBe(true);
    expect(writing.current!.version).toBe(1);
    expect(done.writing).toBeUndefined();
    expect(done.current!.version).toBe(2);
    expect(done.history.map((version) => version.version)).toEqual([1, 2]);
    // Each version names a path a seeded dig rewrote, and came after that dig finished.
    for (const version of done.history) {
      const path = PATH_REWRITES[DIG_RUNS.root]!.paths.find((candidate) => candidate.position_ref === version.position_ref)!;
      expect(Date.parse(version.updated_at)).toBeGreaterThan(Date.parse(path.history[0]!.dig_finished_at));
    }
    for (const main of [writing, done]) {
      const answer = { ...answerOf("PAID"), path_rewrites: PATH_REWRITES[DIG_RUNS.root], main_answer: main };
      expect(AnswerSchema.safeParse(answer).success).toBe(true);
      // An older contract gets the answer without it.
      expect(Object.keys(stripAnswer(answer))).not.toContain("main_answer");
    }
  });

  it("a paused debate, the borrow notice and a room whose new starts wait fall back to today's reads", () => {
    const run = { run_ref: DIG_RUNS.root, question_line: "Should I move?", state: "RUNNING", terminal_reason: null, hold_until: null };
    const paused = { ...run, month_pause: monthPause("2026-11-01T00:00:00.000Z", false) };
    expect(RunProjectionSchema.safeParse(paused).success).toBe(true);
    expect(stripRun(paused)).toEqual(run);
    const usage = {
      plan_id: "PLUS", windows: [{ scope: "PERSON_DAY", percent: 104, resets_at: "2026-11-01T00:00:00.000Z" }],
      borrowed: [borrowNotice(DIG_RUNS.root, "2026-11-01T00:00:00.000Z")]
    };
    expect(BillingUsageResponseSchema.safeParse(usage).success).toBe(true);
    expect(BillingUsageResponseSchema.safeParse(stripUsage(usage)).success).toBe(true);
    expect(Object.keys(stripUsage(usage))).toEqual(["plan_id", "windows"]);
    const wait = {
      room: "FULL", scope: "PERSON_DAY", resets_at: "2026-11-01T00:00:00.000Z", waiting_run_ref: null, plan_id: "PLUS",
      new_starts: "BLOCKED_UNTIL_RESET", start_share_percent: 15
    };
    expect(DraftRoomPartSchema.safeParse(wait).success).toBe(true);
    expect(AskRoomResponseSchema.safeParse(wait).success).toBe(true);
    expect(DraftRoomPartSchema.safeParse({ ...wait, room: "FITS", scope: null, resets_at: null }).success).toBe(false);
    expect(AskRoomResponseSchema.safeParse(stripRoom(wait)).success).toBe(true);
    expect(Object.keys(stripRoom(wait))).not.toContain("new_starts");
  });

  it("the waiting card's draft start time (journey-d2) is an ISO time, held back with the pause from a contract that lacks it", () => {
    expect(DraftRunStartedAtSchema.safeParse("2026-11-04T09:31:00.000Z").success).toBe(true);
    expect(DraftRunStartedAtSchema.safeParse("14:31").success).toBe(false);
    const run = { run_ref: DIG_RUNS.root, question_line: "Should I move?", state: "RUNNING", terminal_reason: null, hold_until: null };
    const started = { ...run, started_at: "2026-11-04T09:31:00.000Z" };
    // Today's run read has no `started_at`: the website never receives it until the contract knows it.
    expect(stripRun(started)).toEqual(run);
    expect(stripRun({ ...started, month_pause: monthPause("2026-12-01T00:00:00.000Z", false) })).toEqual(run);
    expect(RunProjectionSchema.safeParse(stripRun(started)).success).toBe(true);
  });

  it("a failed run's quota_used (owner review 3 Nov) passes its draft schema and falls back to today's run read", () => {
    const run = {
      run_ref: "44444444-4444-4444-8444-444444444444", question_line: "Will AI tutors replace homework help?", state: "FAILED",
      terminal_reason: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM", hold_until: null
    };
    for (const quota of ["NONE", "SOME"] as const) {
      expect(DraftRunQuotaUsedSchema.safeParse(quota).success).toBe(true);
      const full = { ...run, quota_used: quota };
      expect(stripRun(full)).toEqual(run);
      expect(RunProjectionSchema.safeParse(contractOrDraft(RunProjectionSchema, full, stripRun).body).success).toBe(true);
    }
    expect(DraftRunQuotaUsedSchema.safeParse("ALL").success).toBe(false);
    expect(["v4.debate.failedNothingTaken", "v4.digFailed.nothingTaken", "v4.digFailed.retry", "v4.digFailed.keepsFailing",
      "v4.pause.digCard", "v4.pause.digCardReady"].filter((key) => !(key in catalog))).toEqual([]);
  });

  // V4 start step, Task 57c (owner answer Q20 A, 5 Nov): the contract's run read carries a failed run's quota_used, so the stand-in's normal
  // view sends it as the API does (the failed question's "NONE", a failed dig's "SOME"), and a run that did not fail never carries it.
  it("Task 57c: a failed run's quota_used is the contract's own, so the normal view keeps it", () => {
    const run = {
      run_ref: "44444444-4444-4444-8444-444444444444", question_line: "Will AI tutors replace homework help?", state: "FAILED",
      terminal_reason: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM", hold_until: null
    };
    for (const quota of ["NONE", "SOME"] as const) {
      expect(contractOrDraft(RunProjectionSchema, { ...run, quota_used: quota }, stripRun)).toEqual({ body: { ...run, quota_used: quota }, draft: true });
    }
    expect(RunProjectionSchema.safeParse({ ...run, state: "RUNNING", terminal_reason: null, quota_used: "NONE" }).success).toBe(false);
  });

  it("the owner's 5 Nov answers (questions 3 A, 20 A): a failed dig for every reason group, and a failed question that used some", () => {
    // Question 3 A: every one of the seven reason groups has one seeded failed dig, each with a code of its group.
    expect(FAILED_DIGS.map((dig) => dig.kind).sort()).toEqual([...RUN_FAILURE_KINDS].sort());
    for (const dig of FAILED_DIGS) {
      expect(runFailureKind(dig.reason), dig.runRef).toBe(dig.kind);
      expect(dig.place, dig.runRef).toMatch(/^(?:path:n-(?:mix|renew|nuclear|smr)|p:n-renew-storage|o:0|w)$/u);
      expect(DraftRunQuotaUsedSchema.safeParse(dig.quotaUsed).success, dig.runRef).toBe(true);
      // Each dig's own line is in the catalogue (the page never shows the code).
      expect(catalog[`v4.digFailed.reason.${dig.kind}`], dig.kind).toBeTruthy();
      const run = { run_ref: dig.runRef, question_line: dig.question, state: "FAILED", terminal_reason: dig.reason, hold_until: null };
      expect(stripRun({ ...run, quota_used: dig.quotaUsed })).toEqual(run);
      expect(RunProjectionSchema.safeParse(run).success, dig.runRef).toBe(true);
    }
    expect(new Set([FAILED_DIGS_PARENT.runRef, ...FAILED_DIGS.map((dig) => dig.runRef), RUN_FAILED_SOME.runRef]).size).toBe(FAILED_DIGS.length + 2);
    expect(new Set(FAILED_DIGS.map((dig) => dig.seq)).size).toBe(FAILED_DIGS.length);
    // Only the dig that ran partway used some; the waived ones say so in their own line, so the page adds nothing.
    const quota = Object.fromEntries(FAILED_DIGS.map((dig) => [dig.kind, dig.quotaUsed]));
    expect(quota).toMatchObject({ STOPPED: "SOME", SET_ASIDE: "NONE", CHOICE_GONE: "NONE", NOT_STARTED: "NONE" });
    const shown = (dig: (typeof FAILED_DIGS)[number]) => failedQuotaKey(
      { run_ref: dig.runRef, question_line: dig.question, state: "FAILED", terminal_reason: dig.reason, hold_until: null, quota_used: dig.quotaUsed } as never, true);
    expect(Object.fromEntries(FAILED_DIGS.map((dig) => [dig.kind, shown(dig)]))).toEqual({
      STOPPED: null, NOT_STARTED: "v4.digFailed.nothingTaken", MODELS_UNAVAILABLE: "v4.digFailed.nothingTaken",
      RUN_LIMIT_REACHED: "v4.digFailed.nothingTaken", PLAN_ENDED: "v4.digFailed.nothingTaken", SET_ASIDE: null, CHOICE_GONE: null
    });
    // Question 20 A: the second failed question's draft view says SOME, so its page would say the "used some" line.
    expect(RUN_FAILED_SOME.quotaUsed).toBe("SOME");
    expect(failedQuotaKey({ run_ref: RUN_FAILED_SOME.runRef, question_line: RUN_FAILED_SOME.question, state: "FAILED",
      terminal_reason: RUN_FAILED_SOME.reason, hold_until: null, quota_used: "SOME" } as never, false)).toBe("v4.debate.failedSomeTaken");
    expect(catalog["v4.debate.failedSomeTaken"]).toBeTruthy();
  });

  it("the 5 Nov seed (wave-4 browser check): each failed dig digs its own place, asked as the website asks it, so its panel offers a retry", () => {
    const parent = FAILED_DIGS_PARENT;
    const answer = seed.answer({ answerId: parent.answerId, runRef: parent.runRef, question: parent.question, askedAt: parent.askedAt, servedAt: parent.settledAt, web: "PAID" });
    const map = buildV4Map({ runId: parent.runRef, answer, story: seed.story(parent.answerId, "READY", parent.settledAt) });
    // As the map reads a recorded dig: its places, and the map's own words at them (lib/v4/accountMemory.ts linkOfRecord).
    const textAt = (place: string): string | undefined =>
      place.startsWith("path:") ? findPath(map, place.slice("path:".length))?.line : findOpenQuestion(map, place)?.text;
    const views: DigView[] = FAILED_DIGS.map((dig) => {
      const link: DigLink = {
        parentRunId: parent.runRef, childRunId: dig.runRef, openQuestionIds: [dig.place], questions: [textAt(dig.place)!], mode: dig.mode, startedAt: dig.askedAt
      };
      expect(link.questions[0], dig.runRef).toBeTruthy();
      return { link, state: "FAILED", headline: null, counts: null, terminalReason: dig.reason, questionLine: dig.question };
    });
    for (const view of views) {
      const target = rebuildDigTarget(view.link, map);
      expect(target, view.link.childRunId).not.toBeNull();
      // Word for word what the website sends for that dig, so the page offers it again (lib/v4/useFailedDigs.ts).
      expect(digQuestion(target!, parent.question, catalog, "en"), view.link.childRunId).toBe(view.questionLine);
      const retry = digRetryOf(view, views, map, null, (rebuilt) => digQuestion(rebuilt, parent.question, catalog, "en") === view.questionLine);
      expect(retry.kind, view.link.childRunId).toBe("OFFER");
    }
    // No two are the same dig, so none reads as one dig that failed twice ("This keeps failing").
    expect(views.flatMap((a, i) => views.slice(i + 1).filter((b) => sameDig(a.link, b.link)).map((b) => [a.link.childRunId, b.link.childRunId]))).toEqual([]);
    // Four whole paths and three open questions, each dug once.
    expect(new Set(FAILED_DIGS.map((dig) => dig.place)).size).toBe(FAILED_DIGS.length);
  });

  it("the usage read names only the windows the plan counts: Free the month alone, a paid plan its day, week and month", () => {
    // The wave-4 browser check (5 Nov): a Free person's circle opened three bars on the stand-in.
    const all = [{ scope: "PERSON_DAY", percent: 14 }, { scope: "PERSON_WEEK", percent: 31 }, { scope: "PERSON_MONTH", percent: 9 }] as const;
    expect(windowsForPlan("FREE", all).map((window) => window.scope)).toEqual(["PERSON_MONTH"]);
    for (const plan of ["PLUS", "PRO", "MAX"]) expect(windowsForPlan(plan, all).map((window) => window.scope)).toEqual(["PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH"]);
    // Each read still passes the contract's own shape.
    for (const plan of ["FREE", "PLUS"]) {
      const read = { plan_id: plan, windows: windowsForPlan(plan, all.map((window) => ({ ...window, resets_at: "2026-12-01T00:00:00.000Z" }))) };
      expect(BillingUsageResponseSchema.safeParse(read).success, plan).toBe(true);
    }
  });

  it("the quota's windows (owner's screen review, 3 Nov): share_scope and question_share pass their draft schemas and fall back", () => {
    // read-f19 / public-f14 / map-f33: the window a room read's share is of, only beside a share.
    for (const scope of ["PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH"]) expect(DraftShareScopeSchema.safeParse(scope).success).toBe(true);
    expect(DraftShareScopeSchema.safeParse("SITE_DAY").success).toBe(false);
    const fits = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "FREE", dig_share_percent: 20 };
    expect(DraftRoomPartSchema.safeParse({ ...fits, share_scope: "PERSON_MONTH" }).success).toBe(true);
    const { dig_share_percent: _share, ...noShare } = fits;
    expect(DraftRoomPartSchema.safeParse({ ...noShare, share_scope: "PERSON_MONTH" }).success).toBe(false);
    // Today's contract never sees it: held back, the room read keeps its share.
    const held = stripRoom({ ...fits, share_scope: "PERSON_MONTH" });
    expect(Object.keys(held)).not.toContain("share_scope");
    expect(AskRoomResponseSchema.safeParse({ ...fits }).success).toBe(true);
    // map-f9: what a question has used of that window.
    expect(DraftQuestionShareSchema.safeParse({ scope: "PERSON_DAY", percent: 11 }).success).toBe(true);
    expect(DraftQuestionShareSchema.safeParse({ scope: "PERSON_DAY", percent: 11.5 }).success).toBe(false);
    expect(DraftQuestionShareSchema.safeParse({ scope: "PERSON_GRANT", percent: 11 }).success).toBe(false);
    const run = { run_ref: DIG_RUNS.root, question_line: "Should I move?", state: "SETTLED", terminal_reason: null, hold_until: null };
    expect(stripRun({ ...run, question_share: { scope: "PERSON_MONTH", percent: 11 } })).toEqual(run);
    expect(RunProjectionSchema.safeParse(contractOrDraft(RunProjectionSchema, { ...run, question_share: { scope: "PERSON_DAY", percent: 11 } }, stripRun).body).success)
      .toBe(true);
    for (const key of ["v4.debate.questionShare.PERSON_DAY", "v4.debate.questionShare.PERSON_MONTH", "v4.room.startShare.PERSON_MONTH", "v4.dig.period.PERSON_MONTH"]) {
      expect(catalog[key], key).toBeDefined();
    }
  });

  it("every dig-model and money-rule word the mock plays has its English line in the V4 catalogue", () => {
    const words = [
      "v4.view.heading", "v4.view.HELPED.MAIN_QUESTION", "v4.view.DID_NOT_HELP.PATH", "v4.view.asYours", "v4.view.why",
      "v4.rewrite.whatChanged", "v4.rewrite.changedSince.other", "v4.rewrite.changedSinceReport", "v4.rewrite.changedBelow",
      // V4 screen review (3 Nov 2026): the first debate's report is older than its map (dig-f19), and its main answer is rewritten (dig-f1).
      "v4.rewrite.reportOlder", "v4.rewrite.updateReport", "v4.rewrite.changedSinceYourReport", "v4.mainAnswer.writing", "v4.digsDid.news.ANSWER",
      "v4.rewrite.state.WRITING", "v4.nest.level", "v4.dig.chooseWhat", "v4.room.startShare", "v4.money.startsWait.PERSON_DAY",
      "v4.money.borrowed.PERSON_DAY", "v4.money.paused", "v4.money.pausedReady", "v4.money.continue", "v4.debate.state.PAUSED_MONTH"
    ];
    expect(words.filter((key) => !(key in catalog))).toEqual([]);
  });
});

describe("V4 mock API: the shelf's draft parts of the answer list (owner's screen review, 3 Nov)", () => {
  const item = {
    answer_id: "aaaa1111-1111-4111-8111-111111111111", run_ref: "11111111-1111-4111-8111-111111111111", answer_version: 1,
    question_line: "Should countries build new nuclear power?", verdict_state: null, abstention: null, serve_state: "COMPOSED",
    staleness_state: "FRESH", builds_on_previous: false, created_at_sequence: 2
  };
  const open = {
    run_ref: "22222222-2222-4222-8222-222222222222", question_line: "Is a four-day week good?", state: "RUNNING",
    terminal_reason: null, created_at_sequence: 5
  };
  const full = {
    items: [{ ...item, map_bar: { sure: 4, sure_for_case: 5, still_argued: 2, didnt_hold: 1 }, changed_since_visit: true, dug_from: null }],
    open_runs: [{ ...open, started_at: "2026-11-04T14:00:00.000Z", dug_from: null }],
    limit: 50, offset: 0, total: 1
  };

  it("pass their draft schema, and today's contract once they are held back", () => {
    expect(answerIndexDraftProblems(full)).toEqual([]);
    expect(stripAnswerIndex(full)).toEqual({ items: [item], open_runs: [open], limit: 50, offset: 0, total: 1 });
    expect(AnswerIndexSchema.safeParse(stripAnswerIndex(full)).success).toBe(true);
  });

  it("a broken part is caught before it is sent", () => {
    expect(DraftShelfRowPartSchema.safeParse({ map_bar: { sure: 1 } }).success).toBe(false);
    expect(DraftShelfRowPartSchema.safeParse({ started_at: "at two" }).success).toBe(false);
    expect(DraftShelfRowPartSchema.safeParse({ dug_from: "not-a-run" }).success).toBe(false);
    expect(answerIndexDraftProblems({ ...full, items: [{ ...item, changed_since_visit: "yes" }] })).toHaveLength(1);
  });
});

/*
 * Owner's screen review, 3 Nov 2026 (dig-d1 B): the stand-in's DRAFT progress read of a running dig (live-seed.ts), read by
 * the website's own reader (apps/ui/lib/v4/digProgress.ts); and (dig-f2) the played climb of the seeded level-3 dig up to
 * the first debate (climb-seed.ts), followed by the website's own rule (apps/ui/lib/v4/digsBelow.ts).
 */
describe("V4 mock API: a running dig's steps and checked findings (draft, switch live=ON)", () => {
  const RUN = "d9000000-0000-4000-8000-000000000009";
  const START = Date.parse("2026-11-04T10:00:00.000Z");
  const END = START + 100_000;
  const at = (share: number, extra: Partial<Parameters<typeof digProgressAt>[0]> = {}) =>
    digProgressAt({ runRef: RUN, startedAt: START, settleAt: END, web: true, free: false, waiting: false, ...extra }, START + share * 100_000);

  it("moves through the web steps, each checked finding listed once it passed, in the order it passed", () => {
    expect([at(0.1), at(0.3), at(0.6), at(0.9), at(1.2)].map((body) => [body.now, body.findings.length]))
      .toEqual([["FINDING_SOURCES", 0], ["READING", 0], ["CHECKING", 2], ["WRITING", 3], ["WRITING", 3]]);
    expect(at(0.5).steps).toEqual([...LIVE_STEPS_WEB]);
    expect(at(0.5, { waiting: true })).toEqual({ run_ref: RUN, steps: [...LIVE_STEPS_WEB], now: null, findings: [] });
  });

  it("without a web search argues first, and on Free never says Sure; never Didn't hold, never an unchecked point", () => {
    const free = at(0.95, { web: false, free: true });
    expect(free.steps).toEqual([...LIVE_STEPS_NO_WEB]);
    expect(at(0.1, { web: false }).now).toBe("ARGUING");
    expect(free.findings.map((finding) => finding.trust)).not.toContain("SURE");
    for (const body of [at(0.95), free]) expect(body.findings.every((finding) => ["SURE", "SURE_FOR_CASE", "STILL_ARGUED"].includes(finding.trust))).toBe(true);
  });

  it("every body passes its draft schema, and the website reads exactly what it says", () => {
    for (const body of [at(0), at(0.4), at(0.8), at(1), at(0.5, { waiting: true }), at(0.9, { web: false, free: true })]) {
      expect(DraftDigProgressSchema.safeParse(body).success, JSON.stringify(body)).toBe(true);
      expect(parseDigProgress(body, RUN)).toEqual({
        steps: body.steps, now: body.now, findings: body.findings.map((finding) => ({ id: finding.finding_id, text: finding.text, trust: finding.trust }))
      });
    }
    expect(DraftDigProgressSchema.safeParse({ ...at(0.5), now: "ARGUING" }).success).toBe(false);
    expect(DraftDigProgressSchema.safeParse({ ...at(0.5), steps: ["READING", "FINDING_SOURCES"] }).success).toBe(false);
  });

  it("the switch's words are the mock's own: OFF answers 404 as today's API", () => {
    expect(LIVE_MODES).toEqual(["OFF", "ON"]);
  });
});

describe("V4 mock API: the played climb three levels up (draft, switch climb=PLAY)", () => {
  const PLAYED = Date.parse("2026-11-04T10:00:00.000Z");
  const stepAt = (step: number) => climbAt(PLAYED + step * CLIMB_STEP_MS + 1, PLAYED);
  const d300: BelowDig = {
    link: { parentRunId: DIG_RUNS.levelTwo, childRunId: DIG_RUNS.levelThree, openQuestionIds: ["path:n-nuclear"], questions: [], mode: "thorough", startedAt: null },
    depth: 3, above: [DIG_RUNS.levelTwo, DIG_RUNS.levelOne, DIG_RUNS.root]
  };
  const stateAt = (step: number): string => {
    const parts = stepAt(step);
    const answers: Record<string, unknown> = { [DIG_RUNS.levelOne]: { path_rewrites: parts.levelOnePaths }, [DIG_RUNS.root]: { path_rewrites: parts.rootPaths } };
    const view = { link: d300.link, state: "DONE" as const, headline: null, counts: null, rewrite: parts.levelThreeRewrite };
    return belowStateOf(d300, view, (runId) => answers[runId] as never, PLAYED + step * CLIMB_STEP_MS + 1);
  };

  it("before PLAY is the seed: d300 still rewriting, the trail's answers as seeded", () => {
    const seeded = climbAt(PLAYED + 60_000, null);
    expect(seeded.levelThreeRewrite.state).toBe("WRITING");
    expect(seeded.rootPaths).toBe(PATH_REWRITES[DIG_RUNS.root]);
    expect(stepAt(0)).toEqual(seeded);
  });

  it("every step passes the contract, each level's row named by d300, the dig that started the climb", () => {
    for (let step = 0; step <= 4; step += 1) {
      const parts = stepAt(step);
      expect(PathRewriteSchema.safeParse(parts.levelThreeRewrite).success, `d300 step ${String(step)}`).toBe(true);
      for (const [name, paths] of Object.entries({ two: parts.levelTwoPaths, one: parts.levelOnePaths, root: parts.rootPaths })) {
        const result = AnswerPathRewritesSchema.safeParse(paths);
        expect(result.success, `${name} step ${String(step)}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
      }
      expect(AnswerDigSchema.safeParse({ ...DIG_ANSWERS[DIG_RUNS.levelThree]!, rewrite: parts.levelThreeRewrite }).success).toBe(true);
      // As the mock serves them (server.ts withClimb): whole answers the contract takes, so the website gets the rewrites.
      const whole = (runRef: string, extra: Record<string, unknown>) => AnswerSchema.safeParse({
        ...seed.answer({ answerId: "aaaa1111-1111-4111-8111-111111111111", runRef, question: "Q?", askedAt: "2026-10-27T15:12:00.000Z",
          servedAt: "2026-10-27T15:40:00.000Z", web: "PAID" }),
        ...extra
      }).success;
      expect(whole(DIG_RUNS.root, { path_rewrites: parts.rootPaths }), `root step ${String(step)}`).toBe(true);
      expect(whole(DIG_RUNS.levelOne, { path_rewrites: parts.levelOnePaths, dig: DIG_ANSWERS[DIG_RUNS.levelOne] })).toBe(true);
      expect(whole(DIG_RUNS.levelTwo, { path_rewrites: parts.levelTwoPaths, dig: DIG_ANSWERS[DIG_RUNS.levelTwo] })).toBe(true);
      expect(whole(DIG_RUNS.levelThree, { dig: { ...DIG_ANSWERS[DIG_RUNS.levelThree]!, rewrite: parts.levelThreeRewrite } })).toBe(true);
    }
    const last = stepAt(3);
    const renew = last.rootPaths.paths.find((path) => path.position_ref === "n-renew")!;
    expect(renew.history.at(-1)).toMatchObject({ dig_run_id: DIG_RUNS.levelThree, cause: "CHILD_PATH", state: "READY", changed: true });
    expect(renew.current).toEqual((renew.history.at(-1) as Extract<typeof renew.history[number], { state: "READY" }>).text);
  });

  it("the website's own rule sees it climbing at every step until it reaches the first debate, then quiet", () => {
    expect([0, 1, 2, 3].map(stateAt)).toEqual(["CLIMBING", "CLIMBING", "CLIMBING", "QUIET"]);
    expect(CLIMB_MODES).toEqual(["SEED", "PLAY"]);
  });
});

describe("V4 mock API: the report's share of today on the investigation read (owner's screen review, 3 Nov, report-d1)", () => {
  const reports = {
    investigation_id: "1a1a1a1a-5555-4555-8555-555555555555", root_run_id: "55555555-5555-4555-8555-555555555555",
    state: "OPEN", digs: 0, versions: [], current: null
  };

  it("passes its draft part, and today's contract once it is held back", () => {
    const full = { ...reports, report_share_percent: 5 };
    expect(reportShareProblems(full)).toEqual([]);
    expect(reportShareProblems(reports)).toEqual([]);
    expect(stripReportShare(full)).toEqual(reports);
    expect(InvestigationReportsSchema.safeParse(stripReportShare(full)).success).toBe(true);
    expect(InvestigationReportsSchema.safeParse(contractOrDraft(InvestigationReportsSchema, full, stripReportShare).body).success).toBe(true);
  });

  it("is a whole percent in the dig share's steps of 5, never 0 and never a price", () => {
    for (const share of [0, 3, 12.5, "5%", 105]) expect(DraftReportSharePartSchema.safeParse({ report_share_percent: share }).success, String(share)).toBe(false);
    expect(DraftReportSharePartSchema.safeParse({ report_share_percent: 5 }).success).toBe(true);
    expect(reportShareProblems({ ...reports, report_share_percent: 7 })).toHaveLength(1);
    expect(["v4.reportStrip.share", "v4.report.publicToo"].filter((key) => !(key in catalog))).toEqual([]);
  });
});

describe("the public dig flow and the public state (owner screen review, 3 Nov: public-d2 A, public-f26)", () => {
  it("each chip of the public read's draft field is a contract suggestion of a path the page shows; one was dug near, with its day and dig", async () => {
    const { PUBLIC_DIG_SUGGESTIONS, PUBLIC_UPDATE_REF, seedPublicDebates } = await import("../../tools/v4-mock-api/public-seed.js");
    const { PublicDebateSchema } = await import("../../packages/contract/src/index.js");
    const debate = PublicDebateSchema.parse(seedPublicDebates()[0]);
    const shown = new Set((debate.story_short?.paths ?? []).map((path) => path.position_ref));
    const chips: Loose[] = PUBLIC_DIG_SUGGESTIONS.flatMap((entry: Loose) => {
      expect(shown.has(entry.position_ref), entry.position_ref).toBe(true);
      return entry.suggestions;
    });
    for (const { dug_on: _on, dug_ref: _ref, ...suggestion } of chips) expect(DigSuggestionSchema.safeParse(suggestion).success, suggestion.suggestion_id).toBe(true);
    expect(chips.filter((chip) => chip.dug_on !== undefined)).toEqual([expect.objectContaining({ dug_on: "2026-10-28", dug_ref: PUBLIC_UPDATE_REF })]);
    // The field is a draft: today's strict public read does not take it, so the website's view never carries it.
    expect(PublicDebateSchema.safeParse({ ...debate, dig_suggestions: PUBLIC_DIG_SUGGESTIONS }).success).toBe(false);
  });

  it("the visibility read: PUBLISHED with the page's reference, PRIVATE for every other state; the draft view adds only the stages before or after the check", async () => {
    const { PUBLIC_REF, PUBLIC_STATES, visibilityOf } = await import("../../tools/v4-mock-api/public-seed.js");
    const { PublicationTransitionSchema } = await import("../../packages/contract/src/index.js");
    for (const state of PUBLIC_STATES) expect(PublicationTransitionSchema.safeParse(visibilityOf(state, false)).success, state).toBe(true);
    expect(visibilityOf("PUBLISHED", false)).toEqual({ state: "PUBLISHED", public_ref: PUBLIC_REF });
    expect(visibilityOf("BEING_CHECKED", false)).toEqual({ state: "PRIVATE", public_ref: null });
    expect(visibilityOf("BEING_CHECKED", true)).toEqual({ state: "PRIVATE", public_ref: null, public_stage: "BEING_CHECKED" });
    expect(visibilityOf("PRIVATE", true)).toEqual({ state: "PRIVATE", public_ref: null });
    expect(visibilityOf("PUBLISHED", true)).toEqual({ state: "PUBLISHED", public_ref: PUBLIC_REF });
  });

  it("a public dig on the page gives the digger its new text as `rewrite`; \"#confirm\" gives the path's text as it was, with nothing changed", async () => {
    const { contributionOf, contributionRewriteOf } = await import("../../tools/v4-mock-api/public-seed.js");
    const { AnswerContributionSchema } = await import("../../packages/contract/src/web.js");
    const added = contributionOf("p-fares", null, "f3000000-0000-4000-8000-000000000001", "2026-11-04", "Mine.");
    const rewrite = contributionRewriteOf(added, null);
    expect(rewrite).toEqual({ line: added.line, summary: added.summary, fate: added.fate, what_changed: added.what_changed });
    const same = contributionRewriteOf(null, "Free fares for everyone.");
    expect(same).toMatchObject({ line: "Free fares for everyone.", what_changed: [] });
    for (const body of [rewrite, same]) {
      expect(AnswerContributionSchema.safeParse({ public_ref: "f1000000-0000-4000-8000-000000000001", state: "ON_THE_PAGE", rewrite: body }).success).toBe(true);
    }
  });
});

/*
 * V4 start step, Task 75d (owner, 5 Nov): the mock serves the reading level as the API does. The run read says the level each run
 * was asked at (a new question its own, a dig its debate's, a dig on a public page the page's); the public read says the level the
 * page was asked at, last and optional (the seeded snapshot of an older page has none and reads as Plain words).
 */
describe("V4 mock API: the reading level kept per question (Task 75d)", () => {
  const server = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/server.ts"), "utf8");

  it("the public read: the first seeded page names its level, last; the older page names none; both parse", async () => {
    const { seedPublicDebates } = await import("../../tools/v4-mock-api/public-seed.js");
    const { PublicDebateSchema } = await import("../../packages/contract/src/index.js");
    const [first, older] = seedPublicDebates().map((debate) => PublicDebateSchema.parse(debate));
    expect(first!.reading_level).toBe("background");
    expect(Object.keys(seedPublicDebates()[0]!).at(-1)).toBe("reading_level");
    expect(older).not.toHaveProperty("reading_level");
  });

  it("the run read serves the level each run was asked at, kept when the ask is accepted", () => {
    const projection = server.slice(server.indexOf("function runProjection("), server.indexOf("function withQuestionShare("));
    expect(projection).toContain("...(level === undefined ? {} : { reading_level: level })");
    const ask = server.slice(server.indexOf("const publicParent = parsed.data.public_parent;"), server.indexOf('log(parent === null ? "QUEUED" : "QUEUED_DIG", runRef);'));
    expect(ask).toContain("const askedLevel = publicParent !== undefined ? publicLevelOf(publicParent.public_ref)");
    expect(ask).toContain(": parent !== null ? askedLevels.get(parent.parent_run_id) : ask.depth_params.readingLevel;");
    expect(ask).toContain("if (askedLevel !== undefined) askedLevels.set(runRef, askedLevel);");
    // The level is kept before any of the three ways a run starts (waiting, a dig that fails, a run that settles).
    expect(ask.indexOf("askedLevels.set(runRef, askedLevel)")).toBeLessThan(ask.indexOf("addRun("));
    expect(RunProjectionSchema.safeParse({ run_ref: "r", question_line: "q", state: "RUNNING", terminal_reason: null, hold_until: null, reading_level: "expert" }).success).toBe(true);
  });
});

describe("V4 mock API: every switch is named where people look for it (the wave-2 checks)", () => {
  const server = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/server.ts"), "utf8");
  const readme = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/README.md"), "utf8");
  const handler = server.slice(server.indexOf('if (parts[1] === "set"'), server.indexOf('if (parts[1] === "sign-in"'));
  const switches = [...handler.matchAll(/url\.searchParams\.get\("([a-z]+)"\)/gu)].map((match) => match[1]!);

  it("the set handler reads the switches the click-test uses, the public dig share among them (W2L-9)", () => {
    expect(switches).toEqual(expect.arrayContaining(["room", "ask", "plan", "usage", "pause", "public", "publicstate", "publicdigshare", "report", "dig", "live", "climb", "session"]));
  });

  it("the Known line, the refusal message and the README's Switches table name each one", () => {
    const known = /Known: ([^"]+)"/u.exec(server)![1]!;
    const refused = /"Unknown value for ([^;]+);/u.exec(server)![1]!;
    for (const name of switches.filter((name) => name !== "subscription")) {
      expect(known, name).toContain(`${name}=`);
      expect(refused, name).toMatch(new RegExp(`\\b${name}\\b`, "u"));
      expect(readme, name).toContain(`\`${name}=\``);
    }
    expect(known).toContain("subscription=RESET");
  });
});
