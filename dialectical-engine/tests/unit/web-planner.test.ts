import { describe, expect, it } from "vitest";
import { TypedDomainError, type QuestionLanguage } from "@debateai/kernel";
import {
  ProviderContentUnacceptedError,
  previewThinkingStepOf,
  type PromptPacket,
  type ProviderCallRequest,
  type ProviderGateway
} from "@debateai/providers";
import { WEB_PLANNER_V2_PROMPT_CONTRACT } from "@debateai/judgement";
import { canonicalPromptFingerprint } from "@debateai/scorecard";
import {
  WEB_PLAN_BACKUP_CALL_SITE_KEY,
  WEB_PLAN_NO_REASON_GIVEN,
  WEB_PLAN_SEARCH_CAP_BY_MODE,
  WEB_PLANNER_MODEL_ORDER,
  planWebSearches,
  salvageWebPlannerReply,
  webPlanPathStatuses,
  webPlannerFramedPrompt,
  webPlannerSeats,
  type WebPlanOutcome,
  type WebPlannerInput,
  type WebPlannerPath,
  type WebPlannerSeat
} from "../../apps/runner/src/web-planner.js";

/**
 * W2-3, the web planner (plan 2026-10-30). Every AI here is a scripted stand-in: replies by call-site key, read through
 * the request's own classifier as the real gateway does; a refused reply makes the stand-in build the step's own repair
 * packet and answer it with the next scripted reply, as the gateway's follow-up does. Nothing is ever sent.
 */

type Script = Readonly<Record<string, readonly (string | Error)[]>>;
/** The replay book's own fingerprint: the prompt with its per-call fence and canary masked (run-replay.ts). */
const fingerprint = (packet: PromptPacket): string => canonicalPromptFingerprint(packet.messages);

type Sent = Readonly<{ callSiteKey: string; providerRef: string; packet: PromptPacket; repair: boolean; request: ProviderCallRequest }>;

function scriptedGateway(script: Script, sent: Sent[]): ProviderGateway {
  const used = new Map<string, number>();
  return {
    async call(request) {
      const replies = script[request.callSiteKey];
      if (replies === undefined) throw new Error(`UNSCRIPTED:${request.callSiteKey}`);
      let packet = request.packet;
      let repair = false;
      for (;;) {
        const at = used.get(request.callSiteKey) ?? 0;
        used.set(request.callSiteKey, at + 1);
        sent.push({ callSiteKey: request.callSiteKey, providerRef: request.providerRef, packet, repair, request });
        const reply = replies[at];
        if (reply === undefined) throw new Error(`SCRIPT_EXHAUSTED:${request.callSiteKey}`);
        if (reply instanceof Error) throw reply;
        const verdict = request.classifyContent?.(reply, STOP);
        if (verdict === undefined || verdict.parseStatus === "PARSED") {
          const name = request.providerRef.replace("ref-", "");
          return { rawArtifactRef: `artifact:${request.callSiteKey}`, ledgerEntryRef: `ledger:${request.callSiteKey}`, content: reply,
            provider: "openai-compatible-http", model: `model-${name}`, maker: `maker-${name}`, modelVersion: `model-${name}` };
        }
        if (at + 1 >= replies.length || request.buildRepairPacket === undefined) {
          throw new ProviderContentUnacceptedError(at + 1, verdict.parseStatus, verdict.parseError, "artifact:refused", "ledger:refused");
        }
        packet = request.buildRepairPacket({ rawText: reply, parseStatus: verdict.parseStatus, parseError: verdict.parseError });
        repair = true;
      }
    }
  };
}

const STOP = { finishReason: "stop" } as const;
const ROMANIAN: QuestionLanguage = Object.freeze({ code: "ro", name: "Romanian" });
const AS_OF = new Date("2026-10-30T09:00:00Z");
const BOUND = Object.freeze({ maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 120_000 });

const PATHS: readonly WebPlannerPath[] = Object.freeze([
  Object.freeze({ pathId: "root-0", answer: "Yes, move to Germany for the higher nurse pay.",
    forPoints: [{ text: "Net pay for nurses is higher in Germany.", restsOn: "assumption" as const }],
    againstPoints: [{ text: "Rent in German cities eats most of the difference.", restsOn: "assumption" as const }] }),
  Object.freeze({ pathId: "root-1", answer: "Stay, because family matters more than pay.",
    forPoints: [{ text: "The person says family comes first.", restsOn: "question" as const }],
    againstPoints: [] })
]);

const seat = (name: string, gateway: ProviderGateway): WebPlannerSeat => Object.freeze({ provider: gateway, providerRef: `ref-${name}`, maker: `maker-${name}` });

function input(overrides: Partial<WebPlannerInput> & Readonly<{ gateway: ProviderGateway }>): WebPlannerInput {
  const { gateway, ...rest } = overrides;
  return {
    planId: "PLUS", webSwitchedOn: true, mode: "quick", runId: "run-1", subjectItemId: "work-1",
    question: "Should a nurse from Romania move to Germany?", questionLanguage: ROMANIAN, placeCountry: "RO", asOf: AS_OF,
    paths: PATHS, seats: [seat("qwen", gateway), seat("haiku", gateway)], contractHash: "seal-engine", bound: BOUND,
    ...rest
  };
}

const search = (side: "for" | "against", query: string, local = false) => ({ side, local, query });
const web = (answerId: string, pace: "fast" | "normal" | "slow", searches: readonly object[], reason: string | null = null) =>
  ({ answer_id: answerId, needs_search: true, reason, pace, searches });
const none = (answerId: string, reason: string) => ({ answer_id: answerId, needs_search: false, reason, pace: null, searches: [] });
const reply = (country: string | null, answers: readonly object[]) => JSON.stringify({ country, answers });

const ENGLISH_PAIR = [search("for", "nurse net salary Germany 2026"), search("against", "nurse cost of living Germany rent share of pay")];
const LOCAL_PAIR = [search("for", "salariu net asistentă medicală Germania", true), search("against", "asistente românce revin din Germania chirii", true)];

async function planned(outcome: Promise<WebPlanOutcome>) {
  const result = await outcome;
  if (result.kind !== "PLANNED") throw new Error(`expected PLANNED, got ${result.kind}`);
  return result;
}

describe("W2-3 the web planner: when no call is made", () => {
  it("Free never searches: no call, every path NOT_ON_PLAN", async () => {
    const sent: Sent[] = [];
    const outcome = await planWebSearches(input({ gateway: scriptedGateway({}, sent), planId: "FREE" }));
    expect(outcome).toEqual({ kind: "NOT_ON_PLAN" });
    expect(sent).toEqual([]);
    expect(webPlanPathStatuses(outcome, ["root-0", "root-1"]).map((path) => path.status)).toEqual(["NOT_ON_PLAN", "NOT_ON_PLAN"]);
  });

  it("the web switch off: no call, every path SWITCHED_OFF; Free wins over the switch", async () => {
    const sent: Sent[] = [];
    expect(await planWebSearches(input({ gateway: scriptedGateway({}, sent), webSwitchedOn: false }))).toEqual({ kind: "SWITCHED_OFF" });
    expect(await planWebSearches(input({ gateway: scriptedGateway({}, sent), webSwitchedOn: false, planId: "FREE" }))).toEqual({ kind: "NOT_ON_PLAN" });
    expect(sent).toEqual([]);
  });

  it("refuses a wiring defect before anything is sent: no paths, too many, repeated ids, a place that is not one country", async () => {
    const sent: Sent[] = [];
    const gateway = scriptedGateway({}, sent);
    const code = (value: string) => expect.objectContaining({ code: value });
    await expect(planWebSearches(input({ gateway, paths: [] }))).rejects.toEqual(code("WEB_PLANNER_PATHS_INVALID"));
    await expect(planWebSearches(input({ gateway, paths: Array.from({ length: 9 }, (_, i) => ({ ...PATHS[0]!, pathId: `p${String(i)}` })) })))
      .rejects.toEqual(code("WEB_PLANNER_PATHS_INVALID"));
    await expect(planWebSearches(input({ gateway, paths: [PATHS[0]!, PATHS[0]!] }))).rejects.toEqual(code("WEB_PLANNER_PATHS_INVALID"));
    await expect(planWebSearches(input({ gateway, placeCountry: "EU" }))).rejects.toEqual(code("WEB_PLACE_COUNTRY_INVALID"));
    expect(sent).toEqual([]);
  });
});

describe("W2-3 the web planner: the call and the plan", () => {
  it("one call with web.plan.v2: the step-2 country in the material, the language last, the WEB:plan key, the engine seal", async () => {
    const sent: Sent[] = [];
    const gateway = scriptedGateway({ "WEB:plan": [reply("RO", [web("a1", "fast", [...ENGLISH_PAIR, ...LOCAL_PAIR]), none("a2", "It turns on what the person values.")])] }, sent);
    const result = await planned(planWebSearches(input({ gateway })));
    expect(sent).toHaveLength(1);
    const [call] = sent;
    expect(call!.callSiteKey).toBe("WEB:plan");
    expect(call!.providerRef).toBe("ref-qwen");
    expect(call!.request).toMatchObject({ runId: "run-1", subjectItemId: "work-1", role: "JUDGE", lane: "served", contractHash: "seal-engine", bound: BOUND });
    expect(call!.request.thinkingLevel).toBeUndefined();
    const framed = webPlannerFramedPrompt({ question: input({ gateway }).question, placeCountry: "RO", questionLanguage: ROMANIAN, paths: PATHS });
    expect(fingerprint(call!.packet)).toBe(fingerprint(framed.packet));
    const text = JSON.stringify(call!.packet);
    expect(text).toContain(JSON.stringify(WEB_PLANNER_V2_PROMPT_CONTRACT.instruction).slice(1, -1));
    expect(text.indexOf("question_language")).toBeGreaterThan(text.indexOf("a2"));
    expect(text).not.toContain("root-0");
    expect(previewThinkingStepOf({ callSiteKey: "WEB:plan" })).toBe("web_planner");
    expect(previewThinkingStepOf({ callSiteKey: WEB_PLAN_BACKUP_CALL_SITE_KEY })).toBe("web_planner");

    expect(result.country).toBe("RO");
    expect(result.cap).toBe(20);
    expect(result.searchesToSend).toBe(4);
    expect(result.salvaged).toEqual([]);
    expect(result.querySet.searches.map((s) => [s.searchId, s.language, s.country, s.status, s.text, s.afterDate])).toEqual([
      ["root-0:ENGLISH:SUPPORTING", "en", null, "SEND", "nurse net salary Germany", "2025-10-30"],
      ["root-0:ENGLISH:DISCONFIRMING", "en", null, "SEND", "nurse cost of living Germany rent share of pay", "2025-10-30"],
      ["root-0:LOCAL:SUPPORTING", "ro", "RO", "SEND", "salariu net asistentă medicală Germania", "2025-10-30"],
      ["root-0:LOCAL:DISCONFIRMING", "ro", "RO", "SEND", "asistente românce revin din Germania chirii", "2025-10-30"]
    ]);
    expect(result.querySet.paths.map((p) => [p.pathId, p.web, p.reason, p.localHelps])).toEqual([
      ["root-0", true, WEB_PLAN_NO_REASON_GIVEN, true], ["root-1", false, "It turns on what the person values.", false]
    ]);
    expect(webPlanPathStatuses(result, ["root-0", "root-1"])).toEqual([
      { pathId: "root-0", status: "PLANNED", reason: null, searchesToSend: 4 },
      { pathId: "root-1", status: "NO_SEARCH_PLANNED", reason: "It turns on what the person values.", searchesToSend: 0 }
    ]);
  });

  it("zero searches is a valid plan: values-only paths get their reasons and nothing is searched", async () => {
    const sent: Sent[] = [];
    const gateway = scriptedGateway({ "WEB:plan": [reply(null, [none("a1", "It is about the person's own priorities."), none("a2", "Only values decide it.")])] }, sent);
    const result = await planned(planWebSearches(input({ gateway })));
    expect(result.querySet.searches).toEqual([]);
    expect(result.searchesToSend).toBe(0);
    expect(webPlanPathStatuses(result, ["root-0", "root-1"]).map((path) => [path.status, path.reason])).toEqual([
      ["NO_SEARCH_PLANNED", "It is about the person's own priorities."], ["NO_SEARCH_PLANNED", "Only values decide it."]
    ]);
    expect(sent).toHaveLength(1);
  });

  it("without a step-2 code, the material sends no country and the planner's country is used for the local pair", async () => {
    const sent: Sent[] = [];
    const gateway = scriptedGateway({ "WEB:plan": [reply("DE", [web("a1", "normal", [...ENGLISH_PAIR, ...LOCAL_PAIR]), none("a2", "Values only.")])] }, sent);
    const result = await planned(planWebSearches(input({ gateway, placeCountry: null, questionLanguage: Object.freeze({ code: "de", name: "German" }) })));
    const framedFor = (placeCountry: string | null) => webPlannerFramedPrompt({ question: input({ gateway }).question, placeCountry,
      questionLanguage: Object.freeze({ code: "de", name: "German" }), paths: PATHS }).packet;
    expect(fingerprint(sent[0]!.packet)).toBe(fingerprint(framedFor(null)));
    expect(fingerprint(sent[0]!.packet)).not.toBe(fingerprint(framedFor("DE")));
    expect(result.country).toBe("DE");
    expect(result.querySet.searches.filter((s) => s.scope === "LOCAL").map((s) => [s.language, s.country, s.afterDate])).toEqual([
      ["de", "DE", "2023-10-30"], ["de", "DE", "2023-10-30"]
    ]);
  });

  it("a personal word is refused: the search and its partner are held back, keep no words, and are not counted to send", async () => {
    const sent: Sent[] = [];
    const gateway = scriptedGateway({ "WEB:plan": [reply("RO", [
      web("a1", "slow", [search("for", "I'm a nurse from Cluj net salary Germany"), search("against", "nurse emigration Romania costs")]),
      web("a2", "slow", [search("for", "family ties and emigration decisions study"), search("against", "nurses emigrate despite family survey")])
    ])] }, sent);
    const result = await planned(planWebSearches(input({ gateway })));
    const held = result.querySet.searches.filter((s) => s.pathId === "root-0");
    expect(held.map((s) => [s.status, s.text, s.heldBecause])).toEqual([
      ["HELD", null, ["FIRST_PERSON"]], ["HELD", "nurse emigration Romania costs", ["PAIR_PARTNER_HELD"]]
    ]);
    expect(result.searchesToSend).toBe(2);
    expect(webPlanPathStatuses(result, ["root-0", "root-1"]).map((path) => [path.status, path.searchesToSend])).toEqual([["PLANNED", 0], ["PLANNED", 2]]);
    expect(sent).toHaveLength(1);
  });
});

describe("W2-3 the web planner: slips follow the owner's recovery order", () => {
  it("(1) code reads it as is: prose and a fence around the JSON, a local pair with no country to search in — no second call", async () => {
    const sent: Sent[] = [];
    const slipped = `Here is the plan.\n\`\`\`json\n${reply(null, [web("a1", "fast", [...ENGLISH_PAIR, ...LOCAL_PAIR]), none("a2", "Values only.")])}\n\`\`\``;
    const gateway = scriptedGateway({ "WEB:plan": [slipped] }, sent);
    const result = await planned(planWebSearches(input({ gateway, placeCountry: null, questionLanguage: null, question: "Should a nurse move abroad?" })));
    expect(sent).toHaveLength(1);
    expect(result.salvaged).toEqual(["LOCAL_WITHOUT_TARGET_DROPPED"]);
    expect(result.country).toBeNull();
    expect(result.querySet.searches.map((s) => s.scope)).toEqual(["ENGLISH", "ENGLISH"]);
    expect(result.querySet.paths[0]!.localHelps).toBe(false);
  });

  it("(1) salvage keeps the step-2 country over the planner's, drops half a local pair and a pace on a no-search path", () => {
    const value = { country: "DE", answers: [
      { answer_id: "a1", needs_search: true, reason: null, pace: "fast" as const, searches: [...ENGLISH_PAIR, LOCAL_PAIR[0]!] },
      { answer_id: "a2", needs_search: false, reason: "Values only.", pace: "slow" as const, searches: [] }
    ] };
    const fixed = salvageWebPlannerReply(value, { givenCountryCode: "RO", questionLanguage: ROMANIAN });
    expect(fixed.salvaged).toEqual(["COUNTRY_GIVEN_KEPT", "LOCAL_PAIR_INCOMPLETE_DROPPED", "PACE_WITHOUT_SEARCH_DROPPED"]);
    expect(fixed.reply.country).toBe("RO");
    expect(fixed.reply.answers[0]!.searches).toEqual(ENGLISH_PAIR);
    expect(fixed.reply.answers[1]!.pace).toBeNull();
    const notOne = salvageWebPlannerReply({ country: "EU", answers: [] }, { givenCountryCode: null, questionLanguage: null });
    expect(notOne).toEqual({ reply: { country: null, answers: [] }, salvaged: ["COUNTRY_NOT_ONE_COUNTRY"] });
    const clean = { country: "RO", answers: [{ answer_id: "a1", needs_search: true, reason: null, pace: "fast" as const, searches: [...ENGLISH_PAIR, ...LOCAL_PAIR] }] };
    expect(salvageWebPlannerReply(clean, { givenCountryCode: "RO", questionLanguage: ROMANIAN })).toEqual({ reply: clean, salvaged: [] });
  });

  it("(2) what code cannot fix is asked again for that entry only: the refusal names answers.0, the next reply is used", async () => {
    const sent: Sent[] = [];
    const oneSided = reply("RO", [web("a1", "fast", [ENGLISH_PAIR[0]!]), none("a2", "Values only.")]);
    const fixedReply = reply("RO", [web("a1", "fast", ENGLISH_PAIR), none("a2", "Values only.")]);
    const gateway = scriptedGateway({ "WEB:plan": [oneSided, fixedReply] }, sent);
    const result = await planned(planWebSearches(input({ gateway })));
    expect(sent.map((s) => s.repair)).toEqual([false, true]);
    const verdict = sent[0]!.request.classifyContent!(oneSided);
    expect(verdict.parseStatus).toBe("SCHEMA_FAILED");
    expect(JSON.parse(verdict.parseStatus === "SCHEMA_FAILED" ? verdict.parseError : "[]")).toEqual([
      { code: "WEB_REPLY_SEARCHES_INVALID", path: ["answers", 0], message: "WEB_REPLY_SEARCHES_INVALID" }
    ]);
    expect(fingerprint(sent[1]!.packet)).not.toBe(fingerprint(sent[0]!.packet));
    expect(result.searchesToSend).toBe(2);
  });

  it("(2) a for and an against that are the same words once cleaned are refused at that entry, never sent", async () => {
    const sent: Sent[] = [];
    const same = reply("RO", [none("a1", "Values only."), web("a2", "fast", [search("for", "nurse family emigration 2025"), search("against", "nurse family emigration 2026")])]);
    const fixedReply = reply("RO", [none("a1", "Values only."), web("a2", "fast", [search("for", "family ties keep nurses home study"), search("against", "nurses emigrate despite family survey")])]);
    const gateway = scriptedGateway({ "WEB:plan": [same, fixedReply] }, sent);
    const result = await planned(planWebSearches(input({ gateway })));
    expect(JSON.parse((sent[0]!.request.classifyContent!(same) as { parseError: string }).parseError)).toEqual([
      { code: "WEB_REPLY_SEARCHES_INVALID", path: ["answers", 1], message: "WEB_REPLY_SEARCHES_INVALID" }
    ]);
    expect(sent).toHaveLength(2);
    expect(result.querySet.searches.map((s) => s.pathId)).toEqual(["root-1", "root-1"]);
  });

  it("(2) a no-search path without its reason, or an unknown answer id, is refused and asked again", async () => {
    const sent: Sent[] = [];
    const gateway = scriptedGateway({ "WEB:plan": [
      reply("RO", [{ answer_id: "a1", needs_search: false, reason: null, pace: null, searches: [] }, none("a9", "Values only.")]),
      reply("RO", [none("a1", "Values only."), none("a2", "Values only.")])
    ] }, sent);
    const result = await planned(planWebSearches(input({ gateway })));
    expect(sent.map((s) => s.repair)).toEqual([false, true]);
    expect(result.querySet.paths.map((p) => p.web)).toEqual([false, false]);
  });

  it("(3) an unusable reply, still refused after its repair: the backup planner of another company plans instead", async () => {
    const sent: Sent[] = [];
    const gateway = scriptedGateway({
      "WEB:plan": ["I cannot help with that.", "{\"answers\": ["],
      [WEB_PLAN_BACKUP_CALL_SITE_KEY]: [reply("RO", [web("a1", "fast", ENGLISH_PAIR), none("a2", "Values only.")])]
    }, sent);
    const result = await planned(planWebSearches(input({ gateway })));
    expect(sent.map((s) => [s.callSiteKey, s.providerRef, s.repair])).toEqual([
      ["WEB:plan", "ref-qwen", false], ["WEB:plan", "ref-qwen", true], [WEB_PLAN_BACKUP_CALL_SITE_KEY, "ref-haiku", false]
    ]);
    expect(result.attempts).toEqual([{ callSiteKey: "WEB:plan", maker: "maker-qwen", code: "WEB_PLANNER_REPLY_REFUSED" }]);
    expect(result).toMatchObject({ callSiteKey: WEB_PLAN_BACKUP_CALL_SITE_KEY, maker: "maker-haiku", model: "model-haiku" });
  });

  it("every planner failing is not a crash: the debate goes on without the web (FAILED), nothing searched", async () => {
    const sent: Sent[] = [];
    const down = new TypedDomainError("PREVIEW_GATE_UNAVAILABLE", "gate down");
    const gateway = scriptedGateway({ "WEB:plan": [down], [WEB_PLAN_BACKUP_CALL_SITE_KEY]: [new Error("socket closed")] }, sent);
    const outcome = await planWebSearches(input({ gateway }));
    expect(outcome).toEqual({ kind: "FAILED", code: "WEB_PLANNER_CALL_FAILED", attempts: [
      { callSiteKey: "WEB:plan", maker: "maker-qwen", code: "PREVIEW_GATE_UNAVAILABLE" },
      { callSiteKey: WEB_PLAN_BACKUP_CALL_SITE_KEY, maker: "maker-haiku", code: "WEB_PLANNER_CALL_FAILED" }
    ] });
    expect(webPlanPathStatuses(outcome, ["root-0", "root-1"]).map((path) => path.status)).toEqual(["FAILED", "FAILED"]);
    const none0 = await planWebSearches(input({ gateway, seats: [] }));
    expect(none0).toEqual({ kind: "FAILED", code: "WEB_PLANNER_NO_SEAT", attempts: [] });
  });

  it("a money stop tries no backup; an abandon is rethrown as it came", async () => {
    const stop = new TypedDomainError("RUN_SPEND_STOPPED", "stop");
    const sent: Sent[] = [];
    const gateway = scriptedGateway({ "WEB:plan": [stop, stop] }, sent);
    const outcome = await planWebSearches(input({ gateway, stopsHere: (error) => error === stop }));
    expect(outcome).toEqual({ kind: "FAILED", code: "RUN_SPEND_STOPPED", attempts: [{ callSiteKey: "WEB:plan", maker: "maker-qwen", code: "RUN_SPEND_STOPPED" }] });
    expect(sent).toHaveLength(1);
    await expect(planWebSearches(input({ gateway, abandon: (error) => error === stop }))).rejects.toBe(stop);
  });
});

describe("W2-3 the web planner: replay, the cap and who plans", () => {
  it("a resumed run sends the same prompt (its per-call fence and canary aside) and gets the same plan, so its recorded reply replays", async () => {
    const answer = reply("RO", [web("a1", "fast", [...ENGLISH_PAIR, ...LOCAL_PAIR]), none("a2", "Values only.")]);
    const first: Sent[] = [];
    const second: Sent[] = [];
    const a = await planned(planWebSearches(input({ gateway: scriptedGateway({ "WEB:plan": [answer] }, first) })));
    const b = await planned(planWebSearches(input({ gateway: scriptedGateway({ "WEB:plan": [answer] }, second) })));
    expect(fingerprint(second[0]!.packet)).toBe(fingerprint(first[0]!.packet));
    expect(second[0]!.callSiteKey).toBe(first[0]!.callSiteKey);
    expect(b.querySet).toEqual(a.querySet);
    expect(b.querySet.contentHash).toBe(a.querySet.contentHash);
  });

  it("the cap: every web path gets all 4 on Quick look up to 20; Thorough doubles it; the English pairs always stay", async () => {
    expect(WEB_PLAN_SEARCH_CAP_BY_MODE).toEqual({ quick: 20, thorough: 40 });
    const eight = Array.from({ length: 8 }, (_, i): WebPlannerPath => ({ ...PATHS[0]!, pathId: `p${String(i)}` }));
    const answers = eight.map((_, i) => web(`a${String(i + 1)}`, "fast", [
      search("for", `nurse pay Germany report ${"abcdefgh"[i]!}`), search("against", `nurse rent Germany survey ${"abcdefgh"[i]!}`),
      search("for", `salariu asistentă Germania raport ${"abcdefgh"[i]!}`, true), search("against", `chirii asistente Germania ${"abcdefgh"[i]!}`, true)
    ]));
    const script = { "WEB:plan": [reply("RO", answers)] };
    const quick = await planned(planWebSearches(input({ gateway: scriptedGateway(script, []), paths: eight })));
    expect(quick.searchesToSend).toBe(20);
    expect(quick.localPairsOverCap).toEqual(["p2", "p3", "p4", "p5", "p6", "p7"]);
    expect(quick.querySet.searches.filter((s) => s.scope === "ENGLISH")).toHaveLength(16);
    const thorough = await planned(planWebSearches(input({ gateway: scriptedGateway(script, []), paths: eight, mode: "thorough" })));
    expect(thorough.searchesToSend).toBe(32);
    expect(thorough.localPairsOverCap).toEqual([]);
    // The map's own most (4 paths) never meets the Quick look cap: 4 paths x 4 searches.
    const four = await planned(planWebSearches(input({ gateway: scriptedGateway({ "WEB:plan": [reply("RO", answers.slice(0, 4))] }, []), paths: eight.slice(0, 4) })));
    expect([four.searchesToSend, four.localPairsOverCap]).toEqual([16, []]);
  });

  it("who plans: the cheapest suitable model first, then the next of another company", () => {
    expect(WEB_PLANNER_MODEL_ORDER).toEqual(["Qwen/Qwen3.8-Flash", "claude-haiku-5-5", "zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash"]);
    const member = (model: string, maker: string) => ({ model, maker, providerRef: `ref-${model}` });
    const panel = [member("deepseek-ai/DeepSeek-V4.1-Flash", "DeepSeek"), member("zai-org/GLM-5.3-Flash", "Z.AI"),
      member("Qwen/Qwen3.8-Flash", "Alibaba"), member("claude-haiku-5-5", "Anthropic")];
    expect(webPlannerSeats(panel).map((m) => m.model)).toEqual(["Qwen/Qwen3.8-Flash", "claude-haiku-5-5"]);
    expect(webPlannerSeats(panel.slice(0, 2)).map((m) => m.model)).toEqual(["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash"]);
    expect(webPlannerSeats([member("Qwen/Qwen3.8-Flash", "Alibaba")]).map((m) => m.model)).toEqual(["Qwen/Qwen3.8-Flash"]);
    expect(webPlannerSeats([member("XiaomiMiMo/MiMo-V2.6-Pro", "Xiaomi")])).toEqual([]);
  });
});
