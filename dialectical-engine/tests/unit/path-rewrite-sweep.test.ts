// tests/unit/path-rewrite-sweep.test.ts
// W3-7 (dig-model revision 2026-10-30): the path rewrite made robust. Every turn ends with a row (an unreadable parent or
// unreadable dig paths end it FAILED, the path keeping its text, and the next dig goes on); the dig's own paths are stored
// before the turn is taken; a turn waiting behind another is held at most its bound and then left to the sweep; the sweep
// runs a rewrite whose runner stopped again from the store alone, its answered calls replayed (nothing paid twice), never
// beside a live copy, and ends FAILED a dig whose material cannot be read once it has waited past the give-up time.
import { describe, expect, it } from "vitest";
import type { UnwrittenPathRewrite } from "@debateai/db";
import type { ProviderGateway } from "@debateai/providers";
import {
  UNKNOWN_PARENT_CODES, createPathRewriteInFlight, runDigPathRewrite, type PathRewriteRunnerSettings, type PathRewriteStoredInput
} from "../../apps/runner/src/path-rewrite.js";
import { sweepPathRewrites } from "../../apps/runner/src/path-rewrite-sweep.js";
import { createReplayBook, recordedCalls } from "../../apps/runner/src/run-replay.js";
import {
  DIG_A, DIG_B, PARENT_RUN, POSITION, dig, digSnapshot, memoryStore, membersOf, parentOf, recorded, settingsOver, team, until,
  type Logged
} from "../support/path-rewrite-world.js";

/** 0135's material in memory: what `recordInput` stored, read back by `storedInputOf`. */
function inputStore() {
  const stored = new Map<string, PathRewriteStoredInput>();
  const order: string[] = [];
  return Object.freeze({
    stored, order,
    sources: {
      recordInput: async (runId: string, workItemId: string, digPaths: PathRewriteStoredInput["digPaths"]) => {
        order.push(`input ${runId}`);
        if (stored.has(runId)) return "ALREADY";
        stored.set(runId, JSON.parse(JSON.stringify({ workItemId, digPaths })) as PathRewriteStoredInput);
        return "RECORDED";
      },
      storedInputOf: async (runId: string) => stored.get(runId) ?? null
    }
  });
}

function withSources(settings: PathRewriteRunnerSettings, extra: Partial<PathRewriteRunnerSettings["sources"]>): PathRewriteRunnerSettings {
  return Object.freeze({ ...settings, sources: Object.freeze({ ...settings.sources, ...extra }) });
}

const open = (runId: string, pathSeq: number | null, since = "2026-10-31T00:00:00.000Z"): UnwrittenPathRewrite =>
  Object.freeze({ runId, parentRunId: PARENT_RUN, positionRef: POSITION, pathSeq, since });
const NOW = () => new Date("2026-10-31T01:00:00.000Z");
/** The runner's configured members, as the sweep is handed them (the story writer's boot resolver's). */
const rolesOf = (vendors: ReturnType<typeof team>) => {
  const members = membersOf(vendors);
  return { resolveProvider: members.resolve, backupCandidates: members.backups };
};

describe("W3-7 every turn ends with a row", () => {
  it("an unreadable parent ends the turn FAILED with the clear codes, and the next dig of the path writes", async () => {
    const store = memoryStore();
    const parent = parentOf(store);
    let broken = true;
    const settings = withSources(settingsOver({ store, parent, digs: new Map([[DIG_A, dig()], [DIG_B, dig()]]) }), {
      parentPathOf: async (input) => { if (broken) throw Object.assign(new Error("gone"), { code: "57P01" }); return parent.parentPathOf(input); },
      parentCodesOf: async () => ({ answerVersion: 3, fate: "HELD_UP" as const })
    });
    const vendors = team();
    expect(await runDigPathRewrite(settings, digSnapshot(DIG_A, membersOf(vendors)))).toBe(true);
    expect(store.rewrites[0]).toMatchObject({ digRunId: DIG_A, outcome: "FAILED", failureCode: "PATH_REWRITE_PARENT_UNREAD",
      parentAnswerVersion: 3, fateBefore: "HELD_UP", rounds: 0, content: null, writerLineage: null });
    // Nothing was sent for it: no material, no call.
    expect(vendors.haiku.bodies).toHaveLength(0);
    broken = false;
    await runDigPathRewrite(settings, digSnapshot(DIG_B, membersOf(team())));
    expect(store.rewrites.map((row) => [row.digRunId, row.outcome])).toEqual([[DIG_A, "FAILED"], [DIG_B, "READY"]]);
  });

  it("without readable codes either, the FAILED row takes the unknown codes (never served)", async () => {
    const store = memoryStore();
    const settings = withSources(settingsOver({ store, digs: new Map([[DIG_A, dig()]]) }), {
      parentPathOf: async () => { throw new Error("gone"); },
      parentCodesOf: async () => { throw new Error("also gone"); }
    });
    await runDigPathRewrite(settings, digSnapshot(DIG_A, membersOf(team())));
    expect(store.rewrites[0]).toMatchObject({ outcome: "FAILED", parentAnswerVersion: UNKNOWN_PARENT_CODES.answerVersion,
      fateBefore: UNKNOWN_PARENT_CODES.fate });
  });

  it("the dig's own paths unreadable: the turn is still taken and ends FAILED, so no later dig waits", async () => {
    const store = memoryStore();
    const settings = withSources(settingsOver({ store, digs: new Map([[DIG_A, dig()]]) }), {
      readEnrichment: async () => { throw new Error("review store down"); }
    });
    expect(await runDigPathRewrite(settings, digSnapshot(DIG_A, membersOf(team())))).toBe(true);
    expect(store.turns).toHaveLength(1);
    expect(store.rewrites[0]).toMatchObject({ outcome: "FAILED", failureCode: "PATH_REWRITE_DIG_PATHS_UNREAD", fateBefore: "HELD_UP" });
  });
});

describe("W3-7 the dig's material is stored before its turn", () => {
  it("recordInput comes first, with the work item and the dig's own paths the rewrite then uses", async () => {
    const store = memoryStore();
    const inputs = inputStore();
    const settings = withSources(settingsOver({ store, digs: new Map([[DIG_A, dig()]]) }), inputs.sources);
    const turns = { ...store.turnsPort, takeRewriteTurn: async (...args: Parameters<typeof store.turnsPort.takeRewriteTurn>) => {
      inputs.order.push("turn"); return store.turnsPort.takeRewriteTurn(...args); } };
    const snapshot = digSnapshot(DIG_A, membersOf(team()));
    await runDigPathRewrite({ ...settings, turns }, snapshot);
    expect(inputs.order).toEqual([`input ${DIG_A}`, "turn"]);
    const stored = inputs.stored.get(DIG_A)!;
    expect(stored.workItemId).toBe(snapshot.workItemId);
    expect(stored.digPaths.map((path) => path.statement)).toEqual(["No: winter ridership falls by half.", "Yes: winter crowds fill both piers."]);
    expect(store.rewrites[0]!.outcome).toBe("READY");
  });
});

describe("W3-7 waiting is bounded, then the sweep's", () => {
  it("a dig behind an unfinished one waits at most its bound and leaves its turn open; the sweep writes it at the front", async () => {
    const store = memoryStore();
    const inputs = inputStore();
    const logged: Logged = [];
    let sleeps = 0;
    const settings = withSources(settingsOver({ store, logged, digs: new Map([[DIG_A, dig()], [DIG_B, dig()]]), extra: {
      wait: { pollMs: 5_000, maxWaitMs: 15_000, sleep: async () => { sleeps += 1; } } } }), inputs.sources);
    // DIG_A took its turn and its runner stopped (no row).
    await store.turnsPort.takeRewriteTurn(DIG_A, PARENT_RUN, POSITION);
    await runDigPathRewrite(settings, digSnapshot(DIG_B, membersOf(team())));
    expect(sleeps).toBe(3);
    expect(store.rewrites).toHaveLength(0);
    expect(logged.map((entry) => entry.event)).toContain("PATH_REWRITE_LEFT_TO_SWEEP");
    // DIG_A ends FAILED once given up (its material was never stored); then DIG_B is at the front and the sweep writes it.
    const vendors = team();
    const pass = await sweepPathRewrites({ rewrite: settings, roles: rolesOf(vendors), now: NOW, giveUpMs: 30 * 60_000,
      list: async () => [open(DIG_A, 1), open(DIG_B, 2)] });
    expect(pass).toEqual({ listed: 2, rewritten: 2, skipped: 0 });
    expect(store.rewrites.map((row) => [row.digRunId, row.outcome, row.failureCode])).toEqual([
      [DIG_A, "FAILED", "PATH_REWRITE_INPUT_UNREAD"], [DIG_B, "READY", null]]);
    expect(vendors.haiku.requests).toHaveLength(1);
  });
});

describe("W3-7 the sweep runs a stopped rewrite again", () => {
  it("from the store alone: the same prompts, the writer replayed from the record, the checker bought once, one row", async () => {
    const store = memoryStore();
    const inputs = inputStore();
    const plain = withSources(settingsOver({ store, digs: new Map([[DIG_A, dig()]]) }), inputs.sources);
    const first = team();
    let writerAnswered = false;
    const marking = (gateway: ProviderGateway): ProviderGateway => ({ call: async (request) => {
      const result = await gateway.call(request);
      if (request.callSiteKey.startsWith("PATH_REWRITE:WRITER:")) writerAnswered = true;
      return result;
    } });
    // The first copy dies once its writer has answered.
    void runDigPathRewrite(plain, digSnapshot(DIG_A, membersOf(first, marking), {
      stepLease: <T>(use: () => Promise<T>) => (writerAnswered ? new Promise<T>(() => undefined) : use())
    }));
    await until(() => writerAnswered);
    for (let at = 0; at < 20; at += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    expect(store.rewrites).toHaveLength(0);
    expect(inputs.stored.has(DIG_A)).toBe(true);

    // The sweep, on a fresh runner: the configured members, the first copy's records as the dig's replay book.
    const again = team();
    const book = createReplayBook({ calls: recordedCalls(recorded(first.all)), earlierNodes: [] });
    const pass = await sweepPathRewrites({ rewrite: { ...plain, replayBookOf: async (runId, workItemId) => {
      expect([runId, workItemId]).toEqual([DIG_A, inputs.stored.get(DIG_A)!.workItemId]); return book; } },
    roles: rolesOf(again), now: NOW, list: async () => [open(DIG_A, 1)] });
    expect(pass).toEqual({ listed: 1, rewritten: 1, skipped: 0 });
    expect(again.haiku.bodies).toHaveLength(0);
    expect(again.glm.bodies).toHaveLength(1);
    expect(first.haiku.bodies).toHaveLength(1);
    expect(store.rewrites.map((row) => [row.digRunId, row.outcome])).toEqual([[DIG_A, "READY"]]);
    // A second pass finds the row: nothing more is sent.
    await sweepPathRewrites({ rewrite: plain, roles: rolesOf(again), now: NOW, list: async () => [open(DIG_A, 1)] });
    expect(again.glm.bodies).toHaveLength(1);
    expect(store.rewrites).toHaveLength(1);
  });

  it("never beside a live copy of the same dig in this process", async () => {
    const store = memoryStore();
    const inFlight = createPathRewriteInFlight();
    const settings = settingsOver({ store, digs: new Map([[DIG_A, dig()]]), extra: { inFlight } });
    const release = inFlight.begin(DIG_A)!;
    const vendors = team();
    expect(await sweepPathRewrites({ rewrite: settings, roles: rolesOf(vendors), now: NOW, list: async () => [open(DIG_A, 1)] }))
      .toEqual({ listed: 1, rewritten: 0, skipped: 1 });
    expect(await runDigPathRewrite(settings, digSnapshot(DIG_A, membersOf(vendors)))).toBe(true);
    expect(vendors.haiku.bodies).toHaveLength(0);
    release();
    expect(inFlight.has(DIG_A)).toBe(false);
  });

  it("a dig whose reads fail is tried again later, and ends FAILED only past the give-up time", async () => {
    const store = memoryStore();
    const settings = withSources(settingsOver({ store, digs: new Map([[DIG_A, dig()]]) }), {
      digOf: async () => { throw new Error("store blip"); }
    });
    const roles = rolesOf(team());
    expect(await sweepPathRewrites({ rewrite: settings, roles, now: NOW, giveUpMs: 2 * 60 * 60_000, list: async () => [open(DIG_A, null)] }))
      .toEqual({ listed: 1, rewritten: 0, skipped: 1 });
    expect(store.turns).toHaveLength(0);
    await sweepPathRewrites({ rewrite: settings, roles, now: () => new Date("2026-10-31T03:00:00.000Z"), giveUpMs: 2 * 60 * 60_000,
      list: async () => [open(DIG_A, null)] });
    expect(store.rewrites.map((row) => [row.digRunId, row.outcome, row.failureCode])).toEqual([[DIG_A, "FAILED", "PATH_REWRITE_INPUT_UNREAD"]]);
  });

  it("a list that cannot be read is one code line and no work", async () => {
    const logged: Logged = [];
    const settings = settingsOver({ store: memoryStore(), logged, digs: new Map() });
    expect(await sweepPathRewrites({ rewrite: settings, roles: rolesOf(team()), now: NOW,
      list: async () => { throw Object.assign(new Error("Should Harbour Town build a pier?"), { code: "57P01" }); } }))
      .toEqual({ listed: 0, rewritten: 0, skipped: 0 });
    expect(logged).toEqual([{ event: "PATH_REWRITE_SWEEP_UNREAD", detail: { code: "57P01" } }]);
  });
});
