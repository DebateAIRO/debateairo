// tests/unit/ask-clarify-join.test.ts
// V4 start step, Task 28 (items ask-f9, read-f13; spec 2026-11-03 §4.1 "The same words are never paid for twice"): step 2's clarifying
// call joins a read already running. A second read of the same line by the same person while the first still waits on its AI gets the
// first's answer, and only one AI call is made; another person's read of the same line is never joined. The 10-minute keep is unchanged.
// A scripted transport that answers when the test lets it. Data is made up.
import { describe, expect, it } from "vitest";
import type { AskClarifyChargeEntry } from "@debateai/budget";
import type { PromptPacket } from "@debateai/providers";
import { createAskClarify } from "../../apps/api/src/ask-clarify.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER_OWNER = "22222222-2222-4222-8222-222222222222";
const QUESTION = "Should the town build a second pier?";
const PURPOSE = { text: "What do you want the answer for?", answers: ["To vote on it", "To write to the council"] };
const WHERE = { text: "Which town?", answers: ["Harbour Town", "Bay Town"] };
/** Made up: the register's abuseLimits row gives the real ones to the running API. */
const ASK_LIMITS = Object.freeze({ perHour: 11, perDay: 22 });

/** A transport whose every call waits until the test answers it; each call reports usage, so each would be charged. */
function heldGateway() {
  const packets: PromptPacket[] = [];
  const waiting: ((text: string) => void)[] = [];
  const charges: AskClarifyChargeEntry[] = [];
  let ids = 0;
  const port = createAskClarify({ limits: ASK_LIMITS,
    transportFor: (onUsage) => async ({ packet }) => {
      packets.push(packet);
      const text = await new Promise<string>((resolve) => { waiting.push(resolve); });
      await onUsage({ inputTokens: 100, outputTokens: 50, projected: false });
      return text;
    },
    record: async (entry) => { charges.push(entry); },
    clock: () => new Date("2026-11-04T10:00:00.000Z"),
    report: () => undefined,
    newId: () => `0000000${String(++ids)}-0000-4000-8000-000000000000`
  });
  const answerAll = (body: unknown): void => { for (const resolve of waiting.splice(0)) resolve(JSON.stringify(body)); };
  return { port, packets, charges, answerAll };
}
const settle = async (): Promise<void> => { for (let at = 0; at < 10; at += 1) await Promise.resolve(); };

describe("a clarifying read already running is joined", () => {
  it("two reads of the same line by the same person at once: one AI call, one charge, both get the same answer", async () => {
    const { port, packets, charges, answerAll } = heldGateway();
    const first = port.read(OWNER, QUESTION, null);
    await settle();
    const second = port.read(OWNER, QUESTION, null);
    await settle();
    expect(packets).toHaveLength(1);
    answerAll({ questions: [WHERE], purpose: PURPOSE });
    const [one, two] = await Promise.all([first, second]);
    expect(one).toEqual({ source: "AI", questions: [WHERE], purpose: PURPOSE });
    expect(two).toEqual(one);
    expect(packets).toHaveLength(1);
    expect(charges.map((entry) => entry.ownerRef)).toEqual([OWNER]);
    // The 10-minute keep is unchanged: a third read after both answered is served from memory, with no call.
    expect(await port.read(OWNER, QUESTION, null)).toEqual(one);
    expect(packets).toHaveLength(1);
  });

  it("another person's read of the same line is never joined: its own call, its own charge", async () => {
    const { port, packets, charges, answerAll } = heldGateway();
    const mine = port.read(OWNER, QUESTION, null);
    await settle();
    const theirs = port.read(OTHER_OWNER, QUESTION, null);
    await settle();
    expect(packets).toHaveLength(2);
    answerAll({ questions: [], purpose: PURPOSE });
    expect(await mine).toEqual({ source: "AI", questions: [], purpose: PURPOSE });
    expect(await theirs).toEqual({ source: "AI", questions: [], purpose: PURPOSE });
    expect(charges.map((entry) => entry.ownerRef).sort()).toEqual([OWNER, OTHER_OWNER].sort());
  });

  it("the same person's other line is its own read; a read that ended is no longer joined", async () => {
    const { port, packets, answerAll } = heldGateway();
    const one = port.read(OWNER, QUESTION, null);
    const other = port.read(OWNER, "Should the town build a third pier?", null);
    await settle();
    expect(packets).toHaveLength(2);
    // A read that found nothing readable is not kept, and once it ended a new read calls again.
    answerAll({});
    await settle();
    answerAll({});
    expect(await one).toEqual({ source: "NONE" });
    expect(await other).toEqual({ source: "NONE" });
    const again = port.read(OWNER, QUESTION, null);
    await settle();
    expect(packets.length).toBeGreaterThan(2);
    answerAll({ questions: [], purpose: PURPOSE });
    await settle();
    answerAll({ questions: [], purpose: PURPOSE });
    expect(await again).toEqual({ source: "AI", questions: [], purpose: PURPOSE });
  });
});
