// tests/unit/web-step-replay.test.ts
// W3-1 (Perplexity plan 2026-10-30): a run killed after reader 1 and claimed again. The second copy finds its stored
// searches and pages, searches nothing again, sends byte-identical prompts (the replay book's fingerprint, fence and
// canary masked), so the planner, reader 1 and the pick are answered from the record and paid once; readers 2 and 3,
// never sent before the kill, are sent now with the page texts rebuilt from the store (the real sent form of W3-0), and
// still no call record holds a page text. Made-up pages, scripted vendors behind the real gateway.
import { describe, expect, it } from "vitest";
import type { ProviderCallRequest, ProviderGateway } from "@debateai/providers";
import { canonicalPromptFingerprint } from "@debateai/scorecard";
import { createReplayBook, recordedCalls, replayingGateway } from "../../apps/runner/src/run-replay.js";
import { runWebStep } from "../../apps/runner/src/web-step.js";
import { CANARY, membersOf, memoryStore, perplexity, recorded, searchMoney, stepInput, team } from "../support/web-step-world.js";

class Killed extends Error {}
const killedAtReadersTwoAndThree = (gateway: ProviderGateway): ProviderGateway => ({ call: async (request) => {
  if (request.callSiteKey.startsWith("WEB:read-top:")) throw new Killed("the claim was lost");
  return gateway.call(request);
} });

describe("W3-1 a run killed after reader 1 and claimed again", () => {
  it("pays no search and no reader twice, and sends byte-identical prompts", async () => {
    const store = memoryStore();
    const first = team();
    const firstSearch = perplexity();
    const firstMoney = searchMoney();
    await expect(runWebStep(stepInput({ members: membersOf(first.all, killedAtReadersTwoAndThree), search: firstSearch.port,
      prepare: store.prepare, searchSeam: firstMoney.seam, abandon: (error) => error instanceof Killed }))).rejects.toBeInstanceOf(Killed);
    expect(firstSearch.queries).toHaveLength(4);
    expect(firstMoney.charged).toHaveLength(4);
    expect(first.deepseek.bodies.length + first.glm.bodies.length).toBe(0);
    const firstHaikuCalls = first.haiku.bodies.length;
    expect(firstHaikuCalls).toBeGreaterThan(1);
    expect(store.pages.size).toBe(8);
    expect(store.packs.size).toBe(0);

    // Claimed again: the same store, the earlier copy's call records as the replay book, fresh vendors.
    const book = createReplayBook({ calls: recordedCalls(recorded(first.all)), earlierNodes: [] });
    const again = team();
    const againSearch = perplexity();
    const againMoney = searchMoney();
    const asked: ProviderCallRequest[] = [];
    const replayed = (gateway: ProviderGateway): ProviderGateway => {
      const inner = replayingGateway(book, gateway);
      return { call: async (request) => { asked.push(request); return inner.call(request); } };
    };
    const result = await runWebStep(stepInput({ members: membersOf(again.all, replayed),
      search: againSearch.port, prepare: store.prepare, searchSeam: againMoney.seam }));

    expect(result.paths.map((path) => [path.status, path.code])).toEqual([["SEARCHED", null], ["SEARCHED", null]]);
    // Nothing searched or charged again; the planner, reader 1 and the pick replayed: Haiku's vendor never called.
    expect({ searches: againSearch.queries.length, charged: againMoney.charged.length, admitted: againMoney.admitted() })
      .toEqual({ searches: 0, charged: 0, admitted: 0 });
    expect(again.haiku.bodies).toHaveLength(0);
    expect(again.qwen.bodies).toHaveLength(0);
    // Byte-identical: every Haiku request of the second copy has the fingerprint of the first copy's.
    const fingerprints = (requests: readonly ProviderCallRequest[]) => requests.map((request) =>
      `${request.callSiteKey}|${canonicalPromptFingerprint(request.packet.messages)}`).sort();
    const againHaiku = asked.filter((request) => request.providerRef === "ref-haiku");
    expect(againHaiku.length).toBe(first.haiku.requests.length);
    expect(fingerprints(againHaiku)).toEqual(fingerprints(first.haiku.requests));
    // Readers 2 and 3 are sent now, each once per path, the texts rebuilt from the store; their records hold none.
    expect(again.deepseek.bodies.length + again.glm.bodies.length).toBe(4);
    for (const body of [...again.deepseek.bodies, ...again.glm.bodies]) expect(body).toContain(CANARY);
    for (const entry of again.all) expect(entry.record()).not.toContain(CANARY);
    // The second copy wrote the same rows (ALREADY) and finished the packs.
    expect(store.searches.size).toBe(4);
    expect(store.pages.size).toBe(8);
    expect(store.packs.size).toBe(2);
    expect(result.paths.map((path) => path.extractLabels)).toEqual([["S1-1", "S1-2", "S1-3"], ["S2-1", "S2-2", "S2-3"]]);
  });

  it("a third copy after everything was done replays every call: no vendor is called at all", async () => {
    const store = memoryStore();
    const first = team();
    await runWebStep(stepInput({ members: membersOf(first.all), search: perplexity().port, prepare: store.prepare }));
    const book = createReplayBook({ calls: recordedCalls(recorded(first.all)), earlierNodes: [] });
    const again = team();
    const search = perplexity();
    const result = await runWebStep(stepInput({ members: membersOf(again.all, (gateway) => replayingGateway(book, gateway)),
      search: search.port, prepare: store.prepare }));
    expect(result.paths.map((path) => path.status)).toEqual(["SEARCHED", "SEARCHED"]);
    expect(again.all.reduce((sum, entry) => sum + entry.bodies.length, 0)).toBe(0);
    expect(search.queries).toHaveLength(0);
  });
});
