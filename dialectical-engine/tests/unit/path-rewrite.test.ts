// tests/unit/path-rewrite.test.ts
// W3-5 (dig-model revision 2026-10-30): a settled dig rewrites the path it was dug from, through the real gateway with
// scripted vendors (tests/support/path-rewrite-world.ts): the writer (Haiku) and the checker (GLM), at most 2 rounds, the
// recovery order on a slip, a backup writer of another maker, a FAILED row that leaves the path's text, orders in a page
// or a pick that stay data, code's checks of the reply (refs, verdict, trust word), and two digs of one path in order.
import { describe, expect, it } from "vitest";
import { readPromptFrame, type PromptPacket } from "@debateai/providers";
import {
  ownPathSuggestionsSetIdOf, writeOwnPathSuggestions, type DigSuggestionsJob, type PathSuggestionsRefresh, type PathSuggestionsStore
} from "../../apps/runner/src/dig-suggestions-step.js";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { sweepTreeUpdates, type TreeUpdateSettings } from "../../apps/runner/src/path-climb.js";
import {
  owedDigSuggestions, pathRewriteIdOf, runDigPathRewrite, runFirstDebateSuggestions, type PathRewriteRunnerSettings, type PathRewriteStoredInput
} from "../../apps/runner/src/path-rewrite.js";
import { createReplayBook, recordedCalls } from "../../apps/runner/src/run-replay.js";
import {
  AI_PICK, DIG_A, DIG_B, DIG_NODES, OBJECTION, ORDERS, OWN_VIEW, PARENT_POINTS, SATISFIED, dig, digSnapshot, down, fieldsOf,
  fittingRewrite, isChecker, memoryStore, membersOf, parentOf, recorded, settingsOver, storyParentPath, team, until, writesFitting,
  type Logged
} from "../support/path-rewrite-world.js";

const writerBodies = (bodies: readonly string[]) => bodies.map((body) => JSON.parse(body) as { messages: PromptPacket["messages"] })
  .filter((body) => !isChecker(body));
/** A suggestion call on a dig's own path (web.suggest-dig.v1), and a reply resting on that path's first point. */
const isSuggestPacket = (packet: PromptPacket): boolean => readPromptFrame({ messages: packet.messages.slice(0, 2) }).contractId === "web.suggest-dig.v1";
function suggestedOn(packet: PromptPacket): string {
  const fields = fieldsOf(packet);
  const refs = [...JSON.parse(fields.get("for")!) as Array<{ ref: string }>, ...JSON.parse(fields.get("against")!) as Array<{ ref: string }>];
  return JSON.stringify({ suggestions: [{ side: "for", question: "Does it hold in winter too?", why: "It could change where this path comes out.", rests_on: [refs[0]!.ref] }] });
}

describe("W3-5 a dig rewrites the path it was dug from", () => {
  it("writer then checker, one round, READY: the row, the sealed text, the dig's paths by their real refs, and the hook", async () => {
    const store = memoryStore();
    const vendors = team();
    const hooked: unknown[] = [];
    const settings = settingsOver({ store, digs: new Map([[DIG_A, dig()]]), extra: { afterRewrite: (settled) => { hooked.push(settled); } } });
    const ran = await runDigPathRewrite(settings, digSnapshot(DIG_A, membersOf(vendors)));

    expect(ran).toBe(true);
    expect(store.rewrites).toHaveLength(1);
    const row = store.rewrites[0]!;
    expect(row).toMatchObject({ rewriteId: pathRewriteIdOf(DIG_A), digRunId: DIG_A, parentAnswerVersion: 3, basedOnRewriteId: null,
      outcome: "READY", failureCode: null, fateBefore: "HELD_UP", fateAfter: "PARTLY_HELD", verdict: null, rounds: 1 });
    expect(row.writerLineage).toMatchObject({ maker: "Anthropic", provider_ref: "ref-haiku" });
    expect(row.checkerLineage).toMatchObject({ maker: "Z.AI", provider_ref: "ref-glm" });
    expect(row.artifactRefs).toHaveLength(2);
    // The text is sealed under the dig's run key, keyed by the rewrite id; refs are gone, the dig's paths named by their ids.
    expect(row.content?.envelope).toEqual({ sealedFor: DIG_A, key: pathRewriteIdOf(DIG_A) });
    expect(store.contents.get(row.rewriteId)).toEqual({
      text: { line: "Partly: a second pier helps at rush hour, not in winter.",
        summary: "The dig found winter ridership falls by half, so the pier helps only in the busy months.", fate: "PARTLY_HELD" },
      what_changed: ["The dig weakened the year-round case: winter ridership falls."],
      view_reason: null,
      // The judges' order: the winner (No) first, then the runner-up (Yes).
      dig_paths: [{ position_ref: DIG_NODES.no, line: "Winter ridership falls.", fate: "HELD_UP" },
        { position_ref: DIG_NODES.yes, line: "Winter crowds fill both piers.", fate: "FELL" }],
      // W4-8 (Q-D3): the point the sentence rests on, by its real id (P1 is the parent path's first point).
      rests_on: [PARENT_POINTS.queues]
    });
    // The calls: Haiku writes, GLM checks, on the story lane at the rewrite's own call sites, under the engine seal.
    expect(vendors.haiku.requests.map((request) => [request.callSiteKey, request.role, request.lane])).toEqual([["PATH_REWRITE:WRITER:1", "SYNTHESIZER", "story"]]);
    expect(vendors.glm.requests.map((request) => [request.callSiteKey, request.role, request.lane])).toEqual([["PATH_REWRITE:CHECKER:1", "EVALUATOR", "story"]]);
    for (const request of [...vendors.haiku.requests, ...vendors.glm.requests]) expect(request.contractHash).toBe(engineContractHash());
    expect(vendors.haiku.requests[0]!.bound.tokenCeiling).toBe(8192);
    expect(readPromptFrame(vendors.haiku.requests[0]!.packet).contractId).toBe("path-rewrite.writer.v2");
    expect(readPromptFrame(vendors.glm.requests[0]!.packet).contractId).toBe("path-rewrite.checker.v2");
    // The checker reads the rewrite code kept, after the material.
    const checked = fieldsOf(vendors.glm.requests[0]!.packet);
    expect(JSON.parse(checked.get("rewrite")!)).toMatchObject({ fate: "PARTLY_HELD" });
    expect([...checked.keys()]).toEqual(["question", "place", "purpose", "path", "picks", "dig_paths", "rewrite", "reader"]);
    // W4-3's hook: once the row is stored, for the dig's own paths.
    expect(hooked).toEqual([{ digRunId: DIG_A, parentRunId: dig().parentRunId, positionRef: dig().positionRef, level: 1,
      outcome: "READY", digPathRefs: [DIG_NODES.no, DIG_NODES.yes] }]);
  });

  it("the checked rewrite is stored, and the climb starts, while the suggestion calls are still out; the run ends once they are in", async () => {
    const store = memoryStore();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const jobs: DigSuggestionsJob[] = [];
    const refreshed: PathSuggestionsRefresh[] = [];
    let suggestionsIn = false;
    let climbing = false;
    let markWaitedForThem: boolean | null = null;
    const settings = settingsOver({ store, digs: new Map([[DIG_A, dig()]]), extra: {
      // Both kinds of call hang until released, as a slow vendor's would (up to three tries of 240 s each).
      suggest: async (job) => { jobs.push(job); await held; suggestionsIn = true; },
      refreshSuggestions: async (input) => { refreshed.push(input); await held; },
      // The climb is handed the suggestions' promise: it marks the dig settled only once they are in.
      afterStored: async (_digRunId, _lease, alongside) => { climbing = true; await alongside; markWaitedForThem = suggestionsIn; }
    } });
    let ended = false;
    const running = runDigPathRewrite(settings, digSnapshot(DIG_A, membersOf(team()))).then(() => { ended = true; });
    await until(() => store.rewrites.length === 1 && climbing);
    // The row is there, READY, sealed without the dig's own suggestions, and the climb has begun: nothing waited for the calls.
    expect(store.rewrites[0]!.outcome).toBe("READY");
    expect(store.contents.get(store.rewrites[0]!.rewriteId)).not.toHaveProperty("dig_suggestions");
    expect([jobs.length, refreshed.length, suggestionsIn]).toEqual([1, 1, false]);
    // The job: the dig's own paths, told what the rewrite changed, on the rewrite's writer.
    expect(jobs[0]).toMatchObject({ digRunId: DIG_A, free: false, level: 1, whatChanged: ["The dig weakened the year-round case: winter ridership falls."] });
    expect(jobs[0]!.digPaths.map((path) => path.positionRef)).toEqual([DIG_NODES.no, DIG_NODES.yes]);
    expect(jobs[0]!.writer.providerRef).toBe("ref-haiku");
    // The rewrite's task is still open (the sweep never starts a second copy beside it) until the calls are in.
    for (let at = 0; at < 50; at += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    expect(ended).toBe(false);
    release();
    await running;
    expect(markWaitedForThem).toBe(true);
  });

  it("a runner that stopped after the row: the tree's sweep asks the dig's own suggestions from the store alone, the same prompts, every answered call replayed free", async () => {
    const store = memoryStore();
    const inputs = new Map<string, PathRewriteStoredInput>();
    const sources = {
      recordInput: async (runId: string, workItemId: string, digPaths: PathRewriteStoredInput["digPaths"]) => {
        inputs.set(runId, JSON.parse(JSON.stringify({ workItemId, digPaths })) as PathRewriteStoredInput);
        return "RECORDED";
      },
      storedInputOf: async (runId: string) => inputs.get(runId) ?? null,
      ownWhatChangedOf: async (runId: string) => store.contents.get(pathRewriteIdOf(runId))?.what_changed ?? null
    };
    const withSources = (settings: PathRewriteRunnerSettings) => ({ ...settings, sources: { ...settings.sources, ...sources } });
    const first = team({ haiku: (packet) => (isSuggestPacket(packet) ? suggestedOn(packet) : writesFitting(packet, 1)) });
    // The first runner dies once both calls have answered and before it keeps either: its store never answers.
    const dying: PathSuggestionsStore = { positionsOf: async () => new Set(), record: () => new Promise<string>(() => undefined) };
    void runDigPathRewrite(withSources(settingsOver({ store, digs: new Map([[DIG_A, dig()]]), extra: {
      suggest: (job) => writeOwnPathSuggestions(job, dying, async () => "[]") } })), digSnapshot(DIG_A, membersOf(first)));
    await until(() => first.haiku.ledger.filter((entry) => entry.callSiteKey.startsWith("PATH_REWRITE:SUGGEST:") && entry.outcome === "OK").length === 2);
    expect(store.rewrites.map((row) => row.outcome)).toEqual(["READY"]);

    // A new process: its own members, which anything asked of them would be a call paid twice.
    const again = team();
    const kept: Array<Readonly<{ setId: string; runId: string; debateRunId: string; positionRef: string; content: { suggestions: readonly unknown[] } }>> = [];
    const keeping: PathSuggestionsStore = { positionsOf: async () => new Set(kept.map((set) => set.positionRef)),
      record: async (input) => { kept.push(input); return "RECORDED"; } };
    let books = 0;
    const book = createReplayBook({ calls: recordedCalls(recorded(first.all)), earlierNodes: [] });
    const sweep = withSources(settingsOver({ store, digs: new Map([[DIG_A, dig()], [DIG_B, dig()]]), extra: {
      suggest: (job) => writeOwnPathSuggestions(job, keeping, async () => "[]"),
      replayBookOf: async (runId, workItemId) => { books += 1; expect([runId, workItemId]).toEqual([DIG_A, inputs.get(DIG_A)!.workItemId]); return book; } } }));
    const roles = { resolveProvider: membersOf(again).resolve, backupCandidates: membersOf(again).backups };
    await owedDigSuggestions(sweep, roles, keeping, DIG_A);
    expect(again.haiku.bodies).toEqual([]);
    expect([...kept].sort((left, right) => left.positionRef.localeCompare(right.positionRef)).map((set) => [set.setId, set.runId, set.debateRunId, set.positionRef]))
      .toEqual([DIG_NODES.no, DIG_NODES.yes].sort().map((ref) => [ownPathSuggestionsSetIdOf(DIG_A, ref), DIG_A, DIG_A, ref]));
    expect(kept.map((set) => set.content.suggestions.length)).toEqual([1, 1]);
    // Asked again: every path has its set, so nothing more is read or asked. A dig with no finished rewrite of its own owes nothing.
    await owedDigSuggestions(sweep, roles, keeping, DIG_A);
    await owedDigSuggestions(sweep, roles, keeping, DIG_B);
    expect([books, again.haiku.bodies.length, kept.length]).toEqual([1, 0, 2]);
  });

  it("the tree's sweep asks what a dig owes beside its climb, and marks the dig settled only once that is in", async () => {
    const refused = async (): Promise<never> => { throw new Error("test: not read here"); };
    const settled: string[] = [];
    const tree: TreeUpdateSettings = { writerRoleRef: "ref-haiku", checkerRoleRef: "ref-glm", roles: {},
      ports: { tree: { takeTurn: refused, readTurn: refused, record: refused, readLine: refused, readClimbNext: refused, recordMainAnswer: refused,
        readMainAnswers: refused, markDigSettled: async (runId: string) => { settled.push(runId); return "RECORDED"; } } as never,
      // A finished rewrite whose text did not open: nothing to climb, so the dig is marked as soon as what it owes is in.
      ownRewriteOf: async () => ({ entry: { state: "READY", rewrite_id: pathRewriteIdOf(DIG_A) } as never, text: null }),
      digOf: refused, parentPathOf: refused, childOf: refused, sealUpdate: refused, sealMainAnswer: refused, openMainAnswer: refused, answerInputOf: refused,
      payerOf: refused, answerSpentMicros: refused } };
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const owed: string[] = [];
    const pass = sweepTreeUpdates({ tree, list: async () => [DIG_A], owed: async (digRunId) => { owed.push(digRunId); await held; } });
    await until(() => owed.length === 1);
    for (let at = 0; at < 50; at += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toEqual([]);
    release();
    expect(await pass).toEqual({ listed: 1, advanced: 1, skipped: 0 });
    expect([owed, settled]).toEqual([[DIG_A], [DIG_A]]);
  });

  it("the AI's suggestions are asked once the row is stored, told what it changed, and not sealed in it; a failure costs the rewrite nothing", async () => {
    const store = memoryStore();
    const jobs: DigSuggestionsJob[] = [];
    let storedFirst = false;
    await runDigPathRewrite(settingsOver({ store, digs: new Map([[DIG_A, dig()]]), extra: { suggest: async (job) => { storedFirst = store.rewrites.length === 1; jobs.push(job); } } }),
      digSnapshot(DIG_A, membersOf(team())));
    expect(storedFirst).toBe(true);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ digRunId: DIG_A, free: false, whatChanged: ["The dig weakened the year-round case: winter ridership falls."] });
    const row = store.rewrites[0]!;
    expect(row.outcome).toBe("READY");
    expect(store.contents.get(row.rewriteId)).not.toHaveProperty("dig_suggestions");

    const failing = memoryStore();
    let climbed = false;
    await runDigPathRewrite(settingsOver({ store: failing, digs: new Map([[DIG_A, dig()]]), extra: { suggest: async () => { throw new Error("down"); },
      afterStored: async () => { climbed = true; } } }), digSnapshot(DIG_A, membersOf(team())));
    expect(failing.rewrites[0]!.outcome).toBe("READY");
    expect(climbed).toBe(true);
    expect(failing.contents.get(failing.rewrites[0]!.rewriteId)).not.toHaveProperty("dig_suggestions");
    // A rewrite every writer failed asks for none.
    const none: DigSuggestionsJob[] = [];
    await runDigPathRewrite(settingsOver({ store: memoryStore(), digs: new Map([[DIG_A, dig()]]), extra: { suggest: async (job) => { none.push(job); } } }),
      digSnapshot(DIG_A, membersOf(team({ haiku: down, deepseek: down, qwen: down }))));
    expect(none).toEqual([]);
    // Nor does a text that could not be sealed: its row is FAILED, and neither kind of suggestion is asked for it.
    const unsealed = memoryStore();
    const asked: string[] = [];
    await runDigPathRewrite(settingsOver({ store: unsealed, digs: new Map([[DIG_A, dig()]]), extra: { seal: async () => { throw new Error("no key"); },
      suggest: async () => { asked.push("own"); }, refreshSuggestions: async () => { asked.push("refresh"); } } }), digSnapshot(DIG_A, membersOf(team())));
    expect(unsealed.rewrites[0]).toMatchObject({ outcome: "FAILED", failureCode: "PATH_REWRITE_UNEXPECTED_ERROR" });
    expect(asked).toEqual([]);
  });

  it("Q-D8: once the row is stored, the rewritten path's suggestions again, from its new text; a failed rewrite asks for none", async () => {
    const store = memoryStore();
    const asked: PathSuggestionsRefresh[] = [];
    let storedFirst = false;
    await runDigPathRewrite(settingsOver({ store, digs: new Map([[DIG_A, dig()]]), extra: { refreshSuggestions: async (input) => { storedFirst = store.rewrites.length === 1; asked.push(input); } } }),
      digSnapshot(DIG_A, membersOf(team())));
    expect(storedFirst).toBe(true);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ digRunId: DIG_A, free: false, step: 0, line: "Partly: a second pier helps at rush hour, not in winter.",
      whatChanged: ["The dig weakened the year-round case: winter ridership falls."] });
    expect(asked[0]!.points.length).toBeGreaterThan(0);

    const none: PathSuggestionsRefresh[] = [];
    await runDigPathRewrite(settingsOver({ store: memoryStore(), digs: new Map([[DIG_A, dig()]]), extra: { refreshSuggestions: async (input) => { none.push(input); } } }),
      digSnapshot(DIG_A, membersOf(team({ haiku: down, deepseek: down, qwen: down }))));
    expect(none).toEqual([]);
  });

  it("W4-3: a first debate gets its suggestions after its story; a dig, Free, or no writer none", async () => {
    const store = { positionsOf: async () => new Set<string>(), record: async () => "RECORDED" };
    const extra = (free: boolean) => ({ firstDebateSuggestions: { store, read: async () => ({ free, wouldChangeIt: null }) } });
    const first = team();
    await runFirstDebateSuggestions(settingsOver({ store: memoryStore(), digs: new Map(), extra: extra(false) }), digSnapshot(DIG_A, membersOf(first)));
    expect(first.haiku.bodies.length).toBeGreaterThan(0);
    const free = team();
    await runFirstDebateSuggestions(settingsOver({ store: memoryStore(), digs: new Map(), extra: extra(true) }), digSnapshot(DIG_A, membersOf(free)));
    expect(free.haiku.bodies).toEqual([]);
    const isDig = team();
    await runFirstDebateSuggestions(settingsOver({ store: memoryStore(), digs: new Map([[DIG_A, dig()]]), extra: extra(false) }), digSnapshot(DIG_A, membersOf(isDig)));
    expect(isDig.haiku.bodies).toEqual([]);
  });

  it("at level 10 the rewrite runs and no suggestions are asked for", async () => {
    const store = memoryStore();
    const hooked: unknown[] = [];
    const settings = settingsOver({ store, digs: new Map([[DIG_A, dig({ level: 10 })]]), extra: { afterRewrite: (settled) => { hooked.push(settled); } } });
    await runDigPathRewrite(settings, digSnapshot(DIG_A, membersOf(team())));
    expect(store.rewrites.map((row) => row.outcome)).toEqual(["READY"]);
    expect(hooked).toEqual([]);
  });

  it("the checker objects once and round 2 passes: the writer revises its own draft", async () => {
    const store = memoryStore();
    let checks = 0;
    const vendors = team({ glm: () => { checks += 1; return checks === 1 ? OBJECTION : SATISFIED; } });
    await runDigPathRewrite(settingsOver({ store, digs: new Map([[DIG_A, dig()]]) }), digSnapshot(DIG_A, membersOf(vendors)));

    expect(store.rewrites[0]).toMatchObject({ outcome: "READY", rounds: 2 });
    expect(vendors.haiku.requests.map((request) => request.callSiteKey)).toEqual(["PATH_REWRITE:WRITER:1", "PATH_REWRITE:WRITER:2"]);
    expect(vendors.glm.requests.map((request) => request.callSiteKey)).toEqual(["PATH_REWRITE:CHECKER:1", "PATH_REWRITE:CHECKER:2"]);
    // Round 2: the same material, the writer's own draft as its turn, then the checker's problem in one fenced block.
    const second = vendors.haiku.requests[1]!.packet.messages;
    expect(second.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(second[2]!.content).toContain("Partly: a second pier helps at rush hour");
    expect(second[3]!.content).toContain("revision_problems");
    expect(second[3]!.content).toContain("the dig left it disputed");
  });

  it("the checker objects twice on a paid plan: READY_WITH_RESERVATION; Free runs one round (Q-D14)", async () => {
    const paid = memoryStore();
    await runDigPathRewrite(settingsOver({ store: paid, digs: new Map([[DIG_A, dig()]]) }),
      digSnapshot(DIG_A, membersOf(team({ glm: () => OBJECTION }))));
    expect(paid.rewrites[0]).toMatchObject({ outcome: "READY_WITH_RESERVATION", rounds: 2 });
    const free = memoryStore();
    const vendors = team({ glm: () => OBJECTION });
    await runDigPathRewrite(settingsOver({ store: free, digs: new Map([[DIG_A, dig({ free: true })]]) }), digSnapshot(DIG_A, membersOf(vendors)));
    expect(free.rewrites[0]).toMatchObject({ outcome: "READY_WITH_RESERVATION", rounds: 1 });
    expect(vendors.haiku.requests).toHaveLength(1);
  });

  it("a slip is salvaged in code: a fenced reply with a note after it is read with no second call", async () => {
    const store = memoryStore();
    const logged: Logged = [];
    const vendors = team({ haiku: (packet) => (isChecker(packet) ? SATISFIED : `Here it is:\n\`\`\`json\n${fittingRewrite(packet)}\n\`\`\`\nThanks.`) });
    await runDigPathRewrite(settingsOver({ store, digs: new Map([[DIG_A, dig()]]), logged }), digSnapshot(DIG_A, membersOf(vendors)));
    expect(store.rewrites[0]).toMatchObject({ outcome: "READY", rounds: 1 });
    expect(vendors.haiku.bodies).toHaveLength(1);
    expect(logged.some((entry) => entry.event === "PATH_REWRITE_REPLY_REPAIRED")).toBe(true);
  });

  it("a reply code refuses gets the follow-up next, on the same call (the recovery order's second step)", async () => {
    const store = memoryStore();
    const vendors = team({ haiku: (packet, call) => (call === 1 ? fittingRewrite(packet, { fate: "MOSTLY_HELD" }) : fittingRewrite(packet)) });
    await runDigPathRewrite(settingsOver({ store, digs: new Map([[DIG_A, dig()]]) }), digSnapshot(DIG_A, membersOf(vendors)));
    expect(store.rewrites[0]).toMatchObject({ outcome: "READY", fateAfter: "PARTLY_HELD", rounds: 1 });
    // One gateway call, two POSTs: the reply, then the smallest follow-up, which names only the member that was wrong
    // (machine paths, the reply as the AI's own turn, never an engine sentence about it).
    expect(vendors.haiku.requests).toHaveLength(1);
    expect(vendors.haiku.bodies).toHaveLength(2);
    const followUp = (JSON.parse(vendors.haiku.bodies[1]!) as { messages: PromptPacket["messages"] }).messages;
    expect(followUp.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(followUp[3]!.content).toContain("machine_rejection_paths");
    expect(followUp[3]!.content).toContain("PATCH");
  });

  it("the first writer cannot be reached: the backup writer of another maker writes, at rounds 3 and on", async () => {
    const store = memoryStore();
    const logged: Logged = [];
    const vendors = team({ haiku: down });
    await runDigPathRewrite(settingsOver({ store, digs: new Map([[DIG_A, dig()]]), logged }), digSnapshot(DIG_A, membersOf(vendors)));
    expect(store.rewrites[0]).toMatchObject({ outcome: "READY", rounds: 1 });
    expect(store.rewrites[0]!.writerLineage).toMatchObject({ maker: "DeepSeek", provider_ref: "ref-deepseek" });
    expect(vendors.deepseek.requests.map((request) => request.callSiteKey)).toEqual(["PATH_REWRITE:WRITER:3"]);
    expect(vendors.glm.requests.map((request) => request.callSiteKey)).toEqual(["PATH_REWRITE:CHECKER:3"]);
    expect(logged.find((entry) => entry.event === "STORY_BACKUP_USED")?.detail).toMatchObject({ signal: "UNREACHABLE",
      firstModel: "ref-haiku", backupModel: "ref-deepseek", step: "PATH_REWRITE" });
  });

  it("every writer fails: the row is FAILED, the path keeps its text, and the next dig of the path writes on the story's line", async () => {
    const store = memoryStore();
    const parent = parentOf(store);
    const settings = settingsOver({ store, parent, digs: new Map([[DIG_A, dig()], [DIG_B, dig({ picks: [OWN_VIEW] })]]) });
    await runDigPathRewrite(settings, digSnapshot(DIG_A, membersOf(team({ haiku: down, deepseek: down, qwen: down }))));
    expect(store.rewrites[0]).toMatchObject({ outcome: "FAILED", failureCode: "PATH_REWRITE_TRANSPORT_DEATH", fateBefore: "HELD_UP",
      fateAfter: null, verdict: null, content: null, rounds: 0 });
    expect(store.contents.size).toBe(0);
    // The turn ended with its row, so the next dig is at the front at once, and its base is still the story's text.
    await runDigPathRewrite(settings, digSnapshot(DIG_B, membersOf(team())));
    expect(store.rewrites.map((row) => [row.digRunId, row.outcome, row.basedOnRewriteId])).toEqual([[DIG_A, "FAILED", null], [DIG_B, "READY", null]]);
    expect(parent.asked).toEqual([null, null]);
  });

  it("a page or a pick that gives orders stays data: inside the fence, never in the instruction, and the rewrite is as asked", async () => {
    const store = memoryStore();
    const vendors = team();
    const orders = { ...dig(), picks: [AI_PICK, { text: ORDERS, by: "AI_SUGGESTION" as const }] };
    const parent = parentOf(store, storyParentPath({ extracts: [{ pointId: PARENT_POINTS.queues, label: "S1-1", site: "harbour.example",
      title: "Pier queues", quote: ORDERS }] }));
    await runDigPathRewrite(settingsOver({ store, parent, digs: new Map([[DIG_A, orders]]) }), digSnapshot(DIG_A, membersOf(vendors)));
    const packet = vendors.haiku.requests[0]!.packet;
    expect(packet.messages[0]!.content).not.toContain(ORDERS);
    const fields = fieldsOf(packet);
    expect(fields.get("picks")).toContain(ORDERS);
    expect(fields.get("path")).toContain(ORDERS);
    expect(store.rewrites[0]).toMatchObject({ outcome: "READY", verdict: null });
  });

  it("a reply naming a point not in the material loses that sentence; one resting only on such a point is asked again", async () => {
    const store = memoryStore();
    const vendors = team({ haiku: (packet, call) => (isChecker(packet) ? SATISFIED : fittingRewrite(packet, { what_changed: call === 1
      ? [{ text: "It rests on a point nobody made.", rests_on: ["P99"] }]
      : [{ text: "The dig weakened the year-round case.", rests_on: ["P1", "P4"] }, { text: "It also proved the pier pays.", rests_on: ["P77"] }] })) });
    await runDigPathRewrite(settingsOver({ store, digs: new Map([[DIG_A, dig()]]) }), digSnapshot(DIG_A, membersOf(vendors)));
    expect(vendors.haiku.bodies).toHaveLength(2);
    expect(store.contents.get(store.rewrites[0]!.rewriteId)!.what_changed).toEqual(["The dig weakened the year-round case."]);
    // W4-8: the kept sentence's points by their real ids (P1 the parent path's, P4 the dig's), never the dropped one's.
    expect(store.contents.get(store.rewrites[0]!.rewriteId)!.rests_on).toEqual([PARENT_POINTS.queues, DIG_NODES.bridge]);
    expect(JSON.parse(fieldsOf(vendors.glm.requests[0]!.packet).get("rewrite")!).what_changed).toEqual([
      { text: "The dig weakened the year-round case.", rests_on: ["P1", "P4"] }]);
  });

  it("a verdict only when the person's words are in the picks (Q-D4), and never a trust word (Q-D3)", async () => {
    // No words of the person's: a reply with a verdict is refused and asked again.
    const plain = memoryStore();
    const noView = team({ haiku: (packet, call) => (call === 1
      ? fittingRewrite(packet, { view: { outcome: "HELPED", scope: "PATH", reason: "It helped." } }) : fittingRewrite(packet)) });
    await runDigPathRewrite(settingsOver({ store: plain, digs: new Map([[DIG_A, dig()]]) }), digSnapshot(DIG_A, membersOf(noView)));
    expect(noView.haiku.bodies).toHaveLength(2);
    expect(plain.rewrites[0]).toMatchObject({ outcome: "READY", verdict: null });
    // The person's own view: the verdict is required, and stored as codes with its reason sealed.
    const own = memoryStore();
    const withView = team({ haiku: (packet, call) => (call === 1 ? fittingRewrite(packet, { view: null }) : fittingRewrite(packet)) });
    await runDigPathRewrite(settingsOver({ store: own, digs: new Map([[DIG_A, dig({ picks: [OWN_VIEW] })]]) }), digSnapshot(DIG_A, membersOf(withView)));
    expect(withView.haiku.bodies).toHaveLength(2);
    expect(own.rewrites[0]).toMatchObject({ outcome: "READY", verdict: { outcome: "DID_NOT_HELP", scope: "PATH" } });
    expect(own.contents.get(own.rewrites[0]!.rewriteId)!.view_reason).toBe("The dig found winter ridership falls by half.");
    expect(JSON.parse(fieldsOf(withView.haiku.requests[0]!.packet).get("picks")!)).toEqual([{ text: OWN_VIEW.text, marked: "PERSON_OWN_VIEW" }]);
    // A reply that names a trust word is refused by the strict form: the word is code's, from the evidence.
    const sure = memoryStore();
    const trust = team({ haiku: (packet, call) => (call === 1 ? fittingRewrite(packet, { trust: "SURE" }) : fittingRewrite(packet)) });
    await runDigPathRewrite(settingsOver({ store: sure, digs: new Map([[DIG_A, dig()]]) }), digSnapshot(DIG_A, membersOf(trust)));
    expect(trust.haiku.bodies).toHaveLength(2);
    expect(sure.rewrites[0]).toMatchObject({ outcome: "READY" });
  });

  it("two digs on one path rewrite in order: the second waits, then writes on the first's rewrite", async () => {
    const store = memoryStore();
    const parent = parentOf(store);
    const settings = settingsOver({ store, parent, digs: new Map([[DIG_A, dig()], [DIG_B, dig()]]) });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    // Dig A's checker holds until dig B has taken its turn behind it.
    const first = team({ glm: async () => { await gate; return SATISFIED; } });
    const second = team();
    const a = runDigPathRewrite(settings, digSnapshot(DIG_A, membersOf(first)));
    await until(() => first.glm.bodies.length === 1);
    const b = runDigPathRewrite(settings, digSnapshot(DIG_B, membersOf(second)));
    await until(() => store.turns.length === 2);
    // B is behind A: nothing sent yet.
    for (let at = 0; at < 50; at += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    expect(writerBodies(second.haiku.bodies)).toHaveLength(0);
    release();
    await Promise.all([a, b]);
    expect(store.turns.map((turn) => [turn.runId, turn.pathSeq])).toEqual([[DIG_A, 1], [DIG_B, 2]]);
    expect(store.order).toEqual([DIG_A, DIG_B]);
    expect(store.rewrites[1]).toMatchObject({ digRunId: DIG_B, basedOnRewriteId: pathRewriteIdOf(DIG_A), fateBefore: "PARTLY_HELD" });
    expect(parent.asked).toEqual([null, pathRewriteIdOf(DIG_A)]);
    // B's writer read A's rewrite as the path's current text.
    expect(JSON.parse(fieldsOf(second.haiku.requests[0]!.packet).get("path")!).line).toBe("Partly: a second pier helps at rush hour, not in winter.");
  });

  it("a first debate is no dig: nothing is rewritten and the caller writes its story", async () => {
    const store = memoryStore();
    const vendors = team({ haiku: writesFitting });
    expect(await runDigPathRewrite(settingsOver({ store, digs: new Map() }), digSnapshot(DIG_A, membersOf(vendors)))).toBe(false);
    expect(store.turns).toHaveLength(0);
    expect(vendors.haiku.bodies).toHaveLength(0);
  });
});
