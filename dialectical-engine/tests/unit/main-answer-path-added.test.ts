// tests/unit/main-answer-path-added.test.ts (V4 start step, Task 55e; spec 2026-11-03 §4.4).
// "Digging a path you left out before Start uses today's dig-under-the-question. It shows up as a new first-level path, and the main
// answer updates, as approved for first-level changes." The contract's new trigger kind PATH_ADDED (an old stored version still parses),
// what the tree's runner does with a dig under the main question of a path debate (one main-answer version, its trigger the dig itself,
// written by the Overall-view writer, the dig marked settled), a deeper dig's change of that new path climbing to the main answer, the
// sweep retrying an update left undone, and nothing for a first debate, an R22 dig under the question or a runner without the read. The
// database side runs in tests/integration/v2-paths-report.test.ts. Every id, question and text here is made up.
// Task 50c: an update whose root question states what the person cares about says how that goal fares (the drafts).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MainAnswerUpdateRead, MainAnswerUpdateRecord, WebSealed } from "@debateai/db";
import { readPromptFrame, type ProviderCallRequest } from "@debateai/providers";
import { REPORT_ANSWER_LATER_V4_PROMPT_CONTRACT } from "@debateai/story";
import { AnswerMainAnswerSchema, MAIN_ANSWER_TRIGGERS, MainAnswerVersionSchema } from "../../packages/contract/src/web.js";
import { serveMainAnswer } from "../../packages/serve/src/path-rewrites.js";
import {
  advanceAfterStory, advanceTree, climbFrom, mainAnswerUpdateIdOf, sweepTreeUpdates, type MainAnswerContent, type TreeUpdatePorts, type TreeUpdateSettings
} from "../../apps/runner/src/path-climb.js";
import { createPathRewriteInFlight, type PathRewriteDig } from "../../apps/runner/src/path-rewrite.js";
import { ROOT, contractOf, fieldsOf, investigationInput, team } from "../support/investigation-close-world.js";

const MORE_DIG = "66666666-6666-4666-8666-666666666666";
const DEEPER_DIG = "77777777-7777-4777-8777-777777777777";
const R22_DIG = "88888888-8888-4888-8888-888888888888";
const REWRITE = "99999999-9999-4999-8999-999999999999";
const QUESTION = "Should the city build a second ferry pier?";
const AT = "2026-11-05T10:00:00.000Z";

describe("the contract: a dig added a path to the question (PATH_ADDED)", () => {
  const version = (trigger: string, at: number) => ({ version: at, updated_at: AT, trigger, position_ref: at === 2 ? "more-kp07" : "b2",
    segments: [{ text: `Version ${String(at)} of the answer.` }] });

  it("MAIN_ANSWER_TRIGGERS gains PATH_ADDED, last", () => {
    expect(MAIN_ANSWER_TRIGGERS).toEqual(["PATH_REWRITE", "CHILD_PATH", "PATH_ADDED"]);
  });

  it("a version a '+ N more' dig triggered parses, named by the item its pick named; an old stored version still parses", () => {
    expect(MainAnswerVersionSchema.parse(version("PATH_ADDED", 2))).toMatchObject({ trigger: "PATH_ADDED", position_ref: "more-kp07" });
    expect(MainAnswerVersionSchema.parse(version("PATH_REWRITE", 1)).trigger).toBe("PATH_REWRITE");
    expect(MainAnswerVersionSchema.parse(version("CHILD_PATH", 3)).trigger).toBe("CHILD_PATH");
    expect(MainAnswerVersionSchema.safeParse(version("PATH_UPDATE", 1)).success).toBe(false);
    expect(AnswerMainAnswerSchema.parse({ current: version("CHILD_PATH", 3), history: [version("PATH_REWRITE", 1), version("PATH_ADDED", 2),
      version("CHILD_PATH", 3)] }).history.map((entry) => entry.trigger)).toEqual(["PATH_REWRITE", "PATH_ADDED", "CHILD_PATH"]);
  });

  it("serve lists a PATH_ADDED version the runner sealed, beside the old ones", () => {
    const row = (seq: number, trigger: "PATH_REWRITE" | "PATH_ADDED"): MainAnswerUpdateRead => ({ update_id: `00000000-0000-4000-8000-00000000000${String(seq)}`,
      answer_seq: seq, based_on_update_id: null, trigger_kind: trigger, trigger_id: MORE_DIG, trigger_run_id: MORE_DIG, paid_by_owner_ref: null,
      outcome: "READY", failure_code: null, recorded_at: AT, content: null });
    const served = serveMainAnswer([
      { row: row(1, "PATH_REWRITE"), opened: { v: 1, segments: ["The first update."], position_ref: "b2", trigger: "PATH_REWRITE" } },
      { row: row(2, "PATH_ADDED"), opened: { v: 1, segments: ["The second update."], position_ref: "more-kp07", trigger: "PATH_ADDED" } }
    ], false);
    expect(served?.history.map((entry) => [entry.version, entry.trigger, entry.position_ref])).toEqual([[1, "PATH_REWRITE", "b2"], [2, "PATH_ADDED", "more-kp07"]]);
  });
});

/** Task 50c: a main-answer version already stored, so the next update is a later version (made up). */
const STORED_VERSION: MainAnswerUpdateRead = Object.freeze({ update_id: "12121212-1212-4121-8121-121212121212", answer_seq: 1, based_on_update_id: null,
  trigger_kind: "PATH_REWRITE", trigger_id: REWRITE, trigger_run_id: R22_DIG, paid_by_owner_ref: null, outcome: "READY", failure_code: null,
  recorded_at: AT, content: null });

/**
 * A tree in memory: the climb's next steps, the digs, what each `addedPathOf` read finds, and what the runner recorded. Task 50c:
 * `stored`, a version is already stored (the next is a later one); `goalStated`, the root's purpose lines carry the care mark.
 */
function treeOf(input: Readonly<{
  next?: Readonly<Record<string, Readonly<{ parent_run_id: string; root_run_id: string; position_ref: string | null }>>>;
  added?: Readonly<Record<string, Readonly<{ rootRunId: string; positionRef: string; free: boolean }>>>;
  digs?: Readonly<Record<string, PathRewriteDig>>;
  withoutAddedPathRead?: boolean;
  stored?: boolean;
  goalStated?: boolean;
}>) {
  const recorded: MainAnswerUpdateRecord[] = [];
  const sealed: Array<Readonly<{ rootRunId: string; updateId: string; content: MainAnswerContent }>> = [];
  const settled: string[] = [];
  const addedReads: Array<readonly [string, string | null]> = [];
  const logged: string[] = [];
  const vendors = team();
  const readOf = (record: MainAnswerUpdateRecord, at: number): MainAnswerUpdateRead => ({ update_id: record.updateId, answer_seq: at + 1,
    based_on_update_id: record.basedOnUpdateId, trigger_kind: record.triggerKind, trigger_id: record.triggerId, trigger_run_id: record.triggerRunId,
    paid_by_owner_ref: record.paidByOwnerRef, outcome: record.outcome, failure_code: record.failureCode, recorded_at: AT,
    content: record.content?.envelope ?? null });
  const refused = (what: string) => async (): Promise<never> => { throw new Error(`test: ${what} is not read here`); };
  const ports: TreeUpdatePorts = {
    tree: {
      takeTurn: refused("takeTurn"), readTurn: refused("readTurn"), record: refused("record"), readLine: async () => [],
      readClimbNext: async (runId: string) => input.next?.[runId] ?? null,
      recordMainAnswer: async (record: MainAnswerUpdateRecord) => {
        if (recorded.some((entry) => entry.triggerKind === record.triggerKind && entry.triggerId === record.triggerId)) {
          return Object.freeze({ outcome: "ALREADY" as const, answerSeq: 1 });
        }
        recorded.push(record);
        return Object.freeze({ outcome: "RECORDED" as const, answerSeq: recorded.length });
      },
      readMainAnswers: async () => [...(input.stored === true ? [STORED_VERSION] : []), ...recorded.map(readOf)],
      markDigSettled: async (runId: string) => { settled.push(runId); }
    },
    digOf: async (runId: string) => input.digs?.[runId] ?? null,
    ownRewriteOf: async () => null,
    parentPathOf: refused("parentPathOf"),
    childOf: refused("childOf"),
    sealUpdate: refused("sealUpdate"),
    sealMainAnswer: async (rootRunId: string, updateId: string, content: MainAnswerContent): Promise<WebSealed> => {
      sealed.push(Object.freeze({ rootRunId, updateId, content }));
      return Object.freeze({ envelope: { sealed: updateId } as never, attestation: Buffer.from("made-up") });
    },
    openMainAnswer: async () => ["The answer before."],
    answerInputOf: async (_rootRunId, earlier) => Object.freeze({ input: investigationInput({ earlier }), free: false, questionLine: QUESTION,
      ...(input.goalStated === true ? { goalStated: true } : {}) }),
    payerOf: async () => "owner-ref",
    answerSpentMicros: async () => 0,
    ...(input.withoutAddedPathRead === true ? {} : {
      addedPathOf: async (runId: string, pathRef: string | null) => {
        addedReads.push([runId, pathRef]);
        return input.added?.[runId] ?? null;
      }
    })
  };
  const settings: TreeUpdateSettings = {
    ports, writerRoleRef: "ref-haiku", checkerRoleRef: "ref-glm",
    roles: Object.freeze({
      resolveProvider: (roleRef: string) => roleRef === "ref-haiku" ? { provider: vendors.haiku.provider, providerRef: "ref-haiku" }
        : roleRef === "ref-glm" ? { provider: vendors.glm.provider, providerRef: "ref-glm" } : null,
      backupCandidates: [], backupMakers: []
    }),
    log: (event) => { logged.push(event); }
  };
  return { settings, recorded, sealed, settled, addedReads, logged, vendors };
}

const MORE = Object.freeze({ [MORE_DIG]: Object.freeze({ rootRunId: ROOT, positionRef: "more-kp07", free: false }) });

describe("a dig under the main question of a path debate updates the main answer (PATH_ADDED)", () => {
  it("the '+ N more' dig: one version, its trigger the dig itself, sealed under the root's key, the Overall-view writer's; the dig is settled", async () => {
    const tree = treeOf({ added: MORE });
    expect(await advanceTree(tree.settings, MORE_DIG)).toBe("ANSWER_UPDATED");
    expect(tree.addedReads).toEqual([[MORE_DIG, null]]);
    const updateId = mainAnswerUpdateIdOf(ROOT, "PATH_ADDED", MORE_DIG);
    expect(tree.recorded.map((record) => [record.updateId, record.rootRunId, record.triggerKind, record.triggerId, record.triggerRunId, record.outcome,
      record.basedOnUpdateId])).toEqual([[updateId, ROOT, "PATH_ADDED", MORE_DIG, MORE_DIG, "READY", null]]);
    expect(tree.sealed).toEqual([{ rootRunId: ROOT, updateId, content: { v: 1, segments: [expect.any(String)], position_ref: "more-kp07", trigger: "PATH_ADDED" } }]);
    // The report's own answer step and check (the 31 Oct ruling: every automatic main-answer update), charged on the dig's run.
    expect(tree.vendors.haiku.requests.map((request) => [request.callSiteKey, request.runId])).toEqual([["ANSWER_UPDATE:ANSWER:1", MORE_DIG]]);
    expect(tree.vendors.glm.requests.map((request) => [request.callSiteKey, request.runId])).toEqual([["ANSWER_UPDATE:ANSWER_CHECK:1", MORE_DIG]]);
    expect(tree.settled).toEqual([MORE_DIG]);
  });

  it("the update is written while the dig's first-debate suggestions are still out; the dig is marked settled only once they are in", async () => {
    const tree = treeOf({ added: MORE });
    let release: () => void = () => undefined;
    const beside = new Promise<void>((resolve) => { release = resolve; });
    const running = advanceAfterStory(tree.settings, MORE_DIG, undefined, beside);
    for (let at = 0; at < 2_000 && tree.recorded.length === 0; at += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    expect(tree.recorded).toHaveLength(1);
    for (let at = 0; at < 50; at += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    expect(tree.settled).toEqual([]);
    release();
    expect(await running).toBe("ANSWER_UPDATED");
    expect(tree.settled).toEqual([MORE_DIG]);
  });

  it("one update per trigger: asked again (the sweep, a second copy), nothing more is written or bought", async () => {
    const tree = treeOf({ added: MORE });
    await advanceTree(tree.settings, MORE_DIG);
    const calls = tree.vendors.haiku.requests.length;
    expect(await advanceTree(tree.settings, MORE_DIG)).toBe("ANSWER_UPDATED");
    expect(tree.recorded).toHaveLength(1);
    expect(tree.vendors.haiku.requests).toHaveLength(calls);
  });

  it("a first debate, an R22 dig under the question and a dig still argued: nothing, and nothing marked", async () => {
    const tree = treeOf({ added: MORE });
    for (const runId of [ROOT, R22_DIG]) expect(await advanceTree(tree.settings, runId)).toBe("NOTHING");
    expect(tree.recorded).toEqual([]);
    expect(tree.settled).toEqual([]);
    expect(tree.vendors.haiku.requests).toEqual([]);
  });

  it("a runner whose tree has no such read (the public tree's) does as before: nothing", async () => {
    const tree = treeOf({ added: MORE, withoutAddedPathRead: true });
    expect(await advanceTree(tree.settings, MORE_DIG)).toBe("NOTHING");
    expect(tree.recorded).toEqual([]);
  });

  it("the hook after a story: the '+ N more' dig's update, nothing for a first debate, and nothing beside a copy already running", async () => {
    const tree = treeOf({ added: MORE });
    const inFlight = createPathRewriteInFlight();
    const settings = { ...tree.settings, inFlight };
    expect(await advanceAfterStory(settings, ROOT)).toBe("NOTHING");
    const held = inFlight.begin(MORE_DIG)!;
    expect(await advanceAfterStory(settings, MORE_DIG)).toBe("LEFT");
    expect(tree.recorded).toEqual([]);
    held();
    expect(await advanceAfterStory(settings, MORE_DIG)).toBe("ANSWER_UPDATED");
    expect(tree.recorded.map((record) => [record.triggerKind, record.triggerId])).toEqual([["PATH_ADDED", MORE_DIG]]);
    expect(inFlight.has(MORE_DIG)).toBe(false);
  });

  it("the sweep retries an update left undone: the listed '+ N more' dig gets its version once, and is not asked again", async () => {
    const tree = treeOf({ added: MORE });
    const finished = new Set<string>();
    const sweep = { tree: tree.settings, list: async () => [MORE_DIG, ROOT], now: () => new Date(AT) };
    expect(await sweepTreeUpdates(sweep, finished)).toEqual({ listed: 2, advanced: 2, skipped: 0 });
    expect(tree.recorded.map((record) => [record.triggerKind, record.triggerId])).toEqual([["PATH_ADDED", MORE_DIG]]);
    expect(finished.has(MORE_DIG)).toBe(true);
    await sweepTreeUpdates(sweep, finished);
    expect(tree.addedReads.filter(([runId]) => runId === MORE_DIG)).toHaveLength(1);
  });
});

describe("a deeper dig under the new path climbs to the main answer", () => {
  const deeper: PathRewriteDig = Object.freeze({ parentRunId: MORE_DIG, positionRef: "b1", level: 2, free: false,
    question: Object.freeze({ line: QUESTION, place: null, time: null, purpose: null, readingLevel: null, language: null }), picks: Object.freeze([]) });
  const start = Object.freeze({ digRunId: DEEPER_DIG, debateRunId: MORE_DIG, positionRef: "b1",
    cause: Object.freeze({ kind: "PATH_REWRITE" as const, id: REWRITE }), step: 1 });
  const under = Object.freeze({ [MORE_DIG]: Object.freeze({ parent_run_id: ROOT, root_run_id: ROOT, position_ref: null }) });

  it("a change of the '+ N more' dig's path is a first-level change: the main answer updates on that rewrite, named by the new path", async () => {
    const tree = treeOf({ added: MORE, next: under, digs: { [DEEPER_DIG]: deeper } });
    expect(await climbFrom(tree.settings, start)).toBe("ANSWER_UPDATED");
    expect(tree.addedReads).toEqual([[MORE_DIG, "b1"]]);
    expect(tree.recorded.map((record) => [record.updateId, record.triggerKind, record.triggerId, record.triggerRunId])).toEqual([
      [mainAnswerUpdateIdOf(ROOT, "PATH_REWRITE", REWRITE), "PATH_REWRITE", REWRITE, DEEPER_DIG]]);
    expect(tree.sealed.map((entry) => [entry.rootRunId, entry.content.trigger, entry.content.position_ref])).toEqual([[ROOT, "PATH_REWRITE", "more-kp07"]]);
    expect(tree.logged).not.toContain("PATH_CLIMB_UNDER_THE_QUESTION");
  });

  it("under a dig that is no added path (an R22 dig under the question), the climb still stops there", async () => {
    const tree = treeOf({ next: under, digs: { [DEEPER_DIG]: deeper } });
    expect(await climbFrom(tree.settings, start)).toBe("STOPPED");
    expect(tree.recorded).toEqual([]);
    expect(tree.logged).toContain("PATH_CLIMB_UNDER_THE_QUESTION");
  });
});

/* ----------------------------------------------------------------- Task 50c: the person's stated goal */

// V4 start step, Task 50c (follow-up to Task 50b; the owner, 4 Nov, "Always say it": "the main answer always says in one or two plain
// sentences how a stated goal fares"): an update of the main answer after a dig says how the person's stated goal fares too. Nothing
// earlier stored: Task 50b's draft report.answer.v5; a later version: the draft report.answer.later.v5; both checked by Task 50b's draft
// report.answer-check.v4. Whether a goal was stated is the ROOT's purpose lines' (the tree reads the closing's own material reader). Without
// a goal, every byte is today's: the digests below were taken on this file's world before Task 50c changed any code (wave16-t50c-1.log
// and -2.log).
const GOAL_WRITER_SENTENCE = "If the question says what the person cares about, say in one or two plain sentences how that goal fares across the paths.";
const GOAL_CHECKER_SENTENCE = "If the question says what the person cares about, the answer must say how that goal fares across the paths.";
const instructionOf = (request: ProviderCallRequest): string => request.packet.messages[0]!.content;
/** Every call's bytes as sent, in each member's order, the fence and the canary masked (each update draws its own). */
function sentDigest(requests: readonly ProviderCallRequest[]): string {
  return createHash("sha256").update(JSON.stringify(requests.map((request) => {
    const frame = readPromptFrame({ messages: request.packet.messages.slice(0, 2) });
    return [request.callSiteKey, request.providerRef,
      JSON.stringify(request.packet.messages).split(frame.fence).join("<fence>").split(frame.canary).join("<canary>")];
  })), "utf8").digest("hex");
}

describe("Task 50c: the update after a dig says how the person's stated goal fares", () => {
  it("the first version of a root that stated a goal (nothing earlier stored): report.answer.v5, checked by report.answer-check.v4", async () => {
    const tree = treeOf({ added: MORE, goalStated: true });
    expect(await advanceTree(tree.settings, MORE_DIG)).toBe("ANSWER_UPDATED");
    expect(tree.vendors.haiku.requests.map((request) => [request.callSiteKey, contractOf(request.packet)])).toEqual([["ANSWER_UPDATE:ANSWER:1", "report.answer.v5"]]);
    expect(tree.vendors.glm.requests.map((request) => [request.callSiteKey, contractOf(request.packet)]))
      .toEqual([["ANSWER_UPDATE:ANSWER_CHECK:1", "report.answer-check.v4"]]);
    expect(instructionOf(tree.vendors.haiku.requests[0]!)).toContain(GOAL_WRITER_SENTENCE);
    expect(instructionOf(tree.vendors.glm.requests[0]!)).toContain(GOAL_CHECKER_SENTENCE);
    expect(tree.recorded.map((record) => [record.basedOnUpdateId, record.outcome])).toEqual([[null, "READY"]]);
  });

  it("a later version of a root that stated a goal: report.answer.later.v5 (later.v4 and the one sentence), checked by report.answer-check.v4, over the same material", async () => {
    const plain = treeOf({ added: MORE, stored: true });
    await advanceTree(plain.settings, MORE_DIG);
    const tree = treeOf({ added: MORE, stored: true, goalStated: true });
    expect(await advanceTree(tree.settings, MORE_DIG)).toBe("ANSWER_UPDATED");
    expect(tree.vendors.haiku.requests.map((request) => contractOf(request.packet))).toEqual(["report.answer.later.v5"]);
    expect(tree.vendors.glm.requests.map((request) => contractOf(request.packet))).toEqual(["report.answer-check.v4"]);
    expect(instructionOf(tree.vendors.haiku.requests[0]!).startsWith(`${REPORT_ANSWER_LATER_V4_PROMPT_CONTRACT.instruction}\n\n${GOAL_WRITER_SENTENCE}`)).toBe(true);
    expect(instructionOf(tree.vendors.glm.requests[0]!)).toContain(GOAL_CHECKER_SENTENCE);
    expect(tree.recorded.map((record) => [record.basedOnUpdateId, record.outcome])).toEqual([[STORED_VERSION.update_id, "READY"]]);
    // Only the instructions change: the same material, the earlier answer included, field for field.
    expect(JSON.parse(fieldsOf(tree.vendors.haiku.requests[0]!.packet).get("earlier_report")!)).toMatchObject({ version: 1 });
    for (const member of ["haiku", "glm"] as const) {
      expect(tree.vendors[member].requests.map((request) => [...fieldsOf(request.packet)]))
        .toEqual(plain.vendors[member].requests.map((request) => [...fieldsOf(request.packet)]));
    }
  });

  it("without a goal, the first and a later version send today's bytes", async () => {
    const first = treeOf({ added: MORE });
    expect(await advanceTree(first.settings, MORE_DIG)).toBe("ANSWER_UPDATED");
    const later = treeOf({ added: MORE, stored: true });
    expect(await advanceTree(later.settings, MORE_DIG)).toBe("ANSWER_UPDATED");
    expect([first, later].map((tree) => [...tree.vendors.haiku.requests, ...tree.vendors.glm.requests].map((request) => contractOf(request.packet))))
      .toEqual([["report.answer.v4", "report.answer-check.v3"], ["report.answer.later.v4", "report.answer-check.v3"]]);
    expect(sentDigest([...first.vendors.haiku.requests, ...first.vendors.glm.requests])).toBe("9cf243d841e5e29022dbfca1ecba1f2fb1fca3cffa46acae8cf44fc132acc170");
    expect(sentDigest([...later.vendors.haiku.requests, ...later.vendors.glm.requests])).toBe("d0095301ddb0c7d7f656c118ee4effd9ca75fa3af0fa23c615540d92f435e717");
  });
});
