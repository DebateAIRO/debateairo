// tests/unit/path-rewrite-replay.test.ts
// W3-5 (dig-model revision 2026-10-30): a rewrite killed after the writer answered, and run again. The second copy finds its
// turn (ALREADY), builds the same material, sends byte-identical prompts (the replay book's fingerprint, fence and canary
// masked), so the writer is answered from the record and paid once; the checker, never answered before the kill, is sent
// now. One row. Scripted vendors behind the real gateway, the real replay book.
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import type { ProviderGateway } from "@debateai/providers";
import { canonicalPromptFingerprint } from "@debateai/scorecard";
import { runDigPathRewrite } from "../../apps/runner/src/path-rewrite.js";
import { createReplayBook, recordedCalls } from "../../apps/runner/src/run-replay.js";
import { DIG_A, dig, digSnapshot, down, memoryStore, membersOf, recorded, settingsOver, team, until } from "../support/path-rewrite-world.js";

describe("decision 12: a dig's rewrite owed across an upload", () => {
  it("the writer's answer under the older wording stands, free; only the checker it never reached is sent, under the new wording", async () => {
    const store = memoryStore();
    const settings = settingsOver({ store, digs: new Map([[DIG_A, dig()]]) });
    const first = team();
    let writerAnswered = false;
    const marking = (gateway: ProviderGateway): ProviderGateway => ({ call: async (request) => {
      const result = await gateway.call(request);
      if (request.callSiteKey.startsWith("PATH_REWRITE:WRITER:")) writerAnswered = true;
      return result;
    } });
    void runDigPathRewrite(settings, digSnapshot(DIG_A, membersOf(first, marking), {
      stepLease: <T>(use: () => Promise<T>) => (writerAnswered ? new Promise<T>(() => undefined) : use())
    }));
    await until(() => writerAnswered);
    for (let at = 0; at < 20; at += 1) await new Promise<void>((resolve) => setImmediate(resolve));

    // The record as the older release wrote it: other bytes, under its own hash.
    const attempts = recorded(first.all).map((attempt) => ({ ...attempt, contractHash: "older-release", promptFingerprint: "older-words" }));
    const book = createReplayBook({ calls: recordedCalls(attempts), earlierNodes: [] });
    const again = team();
    expect(await runDigPathRewrite({ ...settings, replayBookOf: async () => book }, digSnapshot(DIG_A, membersOf(again)))).toBe(true);
    expect(again.haiku.bodies).toHaveLength(0);
    expect(again.glm.bodies).toHaveLength(1);
    expect(book.stood).toBe(1);
    expect(store.rewrites[0]).toMatchObject({ digRunId: DIG_A, outcome: "READY" });
    expect(store.rewrites[0]!.artifactRefs[0]).toBe(first.haiku.artifacts[0]!.artifactId);
  });
});

describe("W3-5 a rewrite killed after the writer, run again", () => {
  it("pays nothing twice: the writer is replayed from the record, the checker is sent once, one row is stored", async () => {
    const store = memoryStore();
    const settings = settingsOver({ store, digs: new Map([[DIG_A, dig()]]) });

    // The first copy: once the writer has answered, the runner dies (its next step never comes back).
    const first = team();
    let writerAnswered = false;
    const marking = (gateway: ProviderGateway): ProviderGateway => ({ call: async (request) => {
      const result = await gateway.call(request);
      if (request.callSiteKey.startsWith("PATH_REWRITE:WRITER:")) writerAnswered = true;
      return result;
    } });
    const killed = digSnapshot(DIG_A, membersOf(first, marking), {
      stepLease: <T>(use: () => Promise<T>) => (writerAnswered ? new Promise<T>(() => undefined) : use())
    });
    void runDigPathRewrite(settings, killed);
    await until(() => writerAnswered);
    for (let at = 0; at < 20; at += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    expect(first.haiku.bodies).toHaveLength(1);
    expect(first.glm.bodies).toHaveLength(0);
    expect(store.rewrites).toHaveLength(0);
    expect(store.turns).toHaveLength(1);

    // Run again: the same store, the first copy's call records as the replay book, fresh vendors.
    const book = createReplayBook({ calls: recordedCalls(recorded(first.all)), earlierNodes: [] });
    const again = team();
    expect(book.pending).toBe(1);
    const ran = await runDigPathRewrite({ ...settings, replayBookOf: async () => book }, digSnapshot(DIG_A, membersOf(again)));

    expect(ran).toBe(true);
    // The writer's vendor is never called again; the checker's is called once. Nothing else anywhere.
    expect(again.haiku.bodies).toHaveLength(0);
    expect(again.glm.bodies).toHaveLength(1);
    expect(again.deepseek.bodies.length + again.qwen.bodies.length).toBe(0);
    // Byte-identical: the book answers a request only when its prompt has the recorded fingerprint (fence and canary
    // masked), at the same call site and member, and the one recorded call was taken.
    expect(book.pending).toBe(0);
    expect(first.haiku.prompts.map((prompt) => canonicalPromptFingerprint(prompt.messages)))
      .toEqual(first.haiku.requests.map((request) => canonicalPromptFingerprint(request.packet.messages)));
    expect(store.turns).toHaveLength(1);
    expect(store.rewrites).toHaveLength(1);
    expect(store.rewrites[0]).toMatchObject({ digRunId: DIG_A, outcome: "READY", rounds: 1 });
    // The stored writer artifact is the first copy's (the replayed one); the checker's is the new call's.
    expect(store.rewrites[0]!.artifactRefs[0]).toBe(first.haiku.artifacts[0]!.artifactId);
    expect(store.rewrites[0]!.artifactRefs[1]).toBe(again.glm.artifacts[0]!.artifactId);

    // A third run after the row is stored changes nothing and calls no one.
    const third = team();
    await runDigPathRewrite({ ...settings, replayBookOf: async () => createReplayBook({ calls: [], earlierNodes: [] }) },
      digSnapshot(DIG_A, membersOf(third)));
    expect(third.all.reduce((sum, entry) => sum + entry.bodies.length, 0)).toBe(0);
    expect(store.rewrites).toHaveLength(1);
  });
});

describe("a rewrite killed after its backup checker answered, run again", () => {
  it("the spent checker's site sends the run to the same backup, whose answer is replayed: nothing is bought again", async () => {
    const store = memoryStore();
    const settings = settingsOver({ store, digs: new Map([[DIG_A, dig()]]) });
    // The first copy: GLM cannot be reached, DeepSeek checks in its place (its answer recorded), then the runner dies before the row.
    const first = team({ glm: down });
    let backupAnswered = false;
    const marking = (gateway: ProviderGateway): ProviderGateway => ({ call: async (request) => {
      const result = await gateway.call(request);
      if (!request.callSiteKey.endsWith(":BACKUP")) return result;
      backupAnswered = true;
      return new Promise<never>(() => undefined);
    } });
    void runDigPathRewrite(settings, digSnapshot(DIG_A, membersOf(first, marking)));
    await until(() => backupAnswered);
    for (let at = 0; at < 20; at += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    expect(first.deepseek.requests.map((request) => request.callSiteKey)).toEqual(["PATH_REWRITE:CHECKER:1:BACKUP"]);
    expect(store.rewrites).toHaveLength(0);

    // Run again. The gateway counts attempts per call site: GLM's site is spent, so its call is refused before anything is sent.
    const book = createReplayBook({ calls: recordedCalls(recorded(first.all)), earlierNodes: [] });
    expect(book.pending).toBe(2);
    const again = team();
    const spentSite: ProviderGateway = { call: async () => { throw new TypedDomainError("CALL_BUDGET_EXHAUSTED", "subject"); } };
    const members = membersOf(again, (gateway) => (gateway === again.glm.gateway ? spentSite : gateway));
    expect(await runDigPathRewrite({ ...settings, replayBookOf: async () => book }, digSnapshot(DIG_A, members))).toBe(true);
    expect(again.haiku.bodies).toHaveLength(0);
    expect(again.glm.bodies).toHaveLength(0);
    expect(again.deepseek.bodies).toHaveLength(0);
    expect(again.qwen.bodies).toHaveLength(0);
    expect(book.pending).toBe(0);
    expect(store.rewrites[0]).toMatchObject({ outcome: "READY" });
    expect(store.rewrites[0]!.checkerLineage).toMatchObject({ provider_ref: "ref-deepseek" });
    expect(store.rewrites[0]!.artifactRefs).toEqual([first.haiku.artifacts[0]!.artifactId, first.deepseek.artifacts[0]!.artifactId]);
  });
});
