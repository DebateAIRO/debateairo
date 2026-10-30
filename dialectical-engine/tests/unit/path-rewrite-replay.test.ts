// tests/unit/path-rewrite-replay.test.ts
// W3-5 (dig-model revision 2026-10-30): a rewrite killed after the writer answered, and run again. The second copy finds its
// turn (ALREADY), builds the same material, sends byte-identical prompts (the replay book's fingerprint, fence and canary
// masked), so the writer is answered from the record and paid once; the checker, never answered before the kill, is sent
// now. One row. Scripted vendors behind the real gateway, the real replay book.
import { describe, expect, it } from "vitest";
import type { ProviderGateway } from "@debateai/providers";
import { canonicalPromptFingerprint } from "@debateai/scorecard";
import { runDigPathRewrite } from "../../apps/runner/src/path-rewrite.js";
import { createReplayBook, recordedCalls } from "../../apps/runner/src/run-replay.js";
import { DIG_A, dig, digSnapshot, memoryStore, membersOf, recorded, settingsOver, team, until } from "../support/path-rewrite-world.js";

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
