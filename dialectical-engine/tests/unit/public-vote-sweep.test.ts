// tests/unit/public-vote-sweep.test.ts
// The pass that deletes the upvotes of debates gone for good (0193), its repository on a fake pool, and its place in main.ts.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { sweepGonePublicDebateUpvotes } from "../../apps/api/src/public-vote-sweep.js";
import { PostgresPublicDebateUpvoteSweepRepository } from "../../packages/db/src/public-debate-upvote.js";

const EVENT = "public_debate_upvote.gone_deleted";
/** One pass over a fake database: `answer(limit, call)` is what the call numbered `call` (from 1) deletes. */
function passOver(answer: (limit: number, call: number) => number) {
  const limits: number[] = [];
  const lines: string[] = [];
  return {
    limits,
    logged: (): unknown[] => lines.map((line) => JSON.parse(line) as unknown),
    run: () => sweepGonePublicDebateUpvotes({
      repository: { deleteGone: async (limit) => { limits.push(limit); return answer(limit, limits.length); } },
      log: (line) => lines.push(line)
    })
  };
}
const over = (query: (sql: string, values: readonly unknown[]) => Promise<unknown>) =>
  new PostgresPublicDebateUpvoteSweepRepository({ query } as never);

describe("0193 the pass that deletes the upvotes of debates gone for good", () => {
  it("takes the votes in batches of 500 until one comes back short, and logs the count alone", async () => {
    const left = [500, 500, 7];
    const pass = passOver(() => left.shift() ?? 0);
    expect(await pass.run()).toBe(1007);
    expect(pass.limits).toEqual([500, 500, 500]);
    expect(pass.logged()).toEqual([{ event: EVENT, deleted: 1007 }]);
  });
  it("logs nothing when no vote was gone", async () => {
    const pass = passOver(() => 0);
    expect(await pass.run()).toBe(0);
    expect(pass.limits).toEqual([500]);
    expect(pass.logged()).toEqual([]);
  });
  it("one pass takes at most twenty batches, so a backlog never holds the timer; the next pass takes the rest", async () => {
    const pass = passOver((limit) => limit);
    expect(await pass.run()).toBe(10_000);
    expect(pass.limits).toHaveLength(20);
    expect(pass.logged()).toEqual([{ event: EVENT, deleted: 10_000 }]);
  });
  it("a batch that fails ends the pass with its failure, after the line for what already went", async () => {
    const failure = Object.assign(new Error("permission denied"), { code: "42501" });
    const second = passOver((limit, call) => { if (call === 2) throw failure; return limit; });
    await expect(second.run()).rejects.toBe(failure);
    expect(second.limits).toHaveLength(2);
    expect(second.logged()).toEqual([{ event: EVENT, deleted: 500 }]);
    const first = passOver(() => { throw failure; });
    await expect(first.run()).rejects.toBe(failure);
    expect(first.logged()).toEqual([]);
  });
});

describe("PostgresPublicDebateUpvoteSweepRepository", () => {
  it("calls 0193's sweep and nothing else, and answers its count", async () => {
    const queries: Array<Readonly<{ sql: string; values: readonly unknown[] }>> = [];
    const repository = over(async (sql, values) => { queries.push({ sql, values }); return { rows: [{ deleted: 3 }] }; });
    expect(await repository.deleteGone(500)).toBe(3);
    expect(queries).toEqual([{ sql: "SELECT identity.delete_gone_public_debate_upvotes($1::integer) AS deleted", values: [500] }]);
  });
  it("refuses an answer that is not a count, and hands back a database refusal as it was", async () => {
    for (const rows of [[], [{ deleted: null }], [{ deleted: -1 }], [{ deleted: 1.5 }]]) {
      await expect(over(async () => ({ rows })).deleteGone(500), JSON.stringify(rows)).rejects.toThrow("PUBLIC_DEBATE_UPVOTE_SWEEP_ANSWER_INVALID");
    }
    const invalid = Object.assign(new Error("PUBLIC_DEBATE_UPVOTE_INVALID"), { code: "22023" });
    await expect(over(async () => { throw invalid; }).deleteGone(0)).rejects.toBe(invalid);
  });
});

describe("the sweep's place in main.ts", () => {
  it("runs on the hourly sweep's timer: on the pool outside any request, in its own try, before the reservations, built once", async () => {
    const source = await readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    expect(source).toMatch(/^const publicDebateUpvoteSweep = new PostgresPublicDebateUpvoteSweepRepository\(pool\);$/mu);
    expect(source.match(/new PostgresPublicDebateUpvoteSweepRepository\(/gu)).toHaveLength(1);
    expect(source.match(/sweepGonePublicDebateUpvotes\(/gu)).toHaveLength(1);
    // Two facts, not the spacing: the pass is inside the hourly trigger in a try of its own, and it runs before the reservations' sweep.
    const trigger = /^const triggerAskClarifyReservationSweep=createSingleFlightErasureReconciler\(\n([\s\S]*?)\n\);$/mu.exec(source)?.[1] ?? "";
    expect(trigger).toMatch(/try\s*\{\s*await sweepGonePublicDebateUpvotes\(\{\s*repository: publicDebateUpvoteSweep,\s*log: [^}]*\}\);?\s*\}\s*catch\s*\{\s*console\.error\("\[PUBLIC_DEBATE_UPVOTE_SWEEP_PENDING\]"\);?\s*\}/u);
    expect(trigger.indexOf("sweepGonePublicDebateUpvotes(")).toBeLessThan(trigger.indexOf("await sweepAskClarifyReservations("));
    expect(trigger.indexOf("await sweepAskClarifyReservations(")).toBeGreaterThan(-1);
    expect(trigger).toContain('console.error("[ASK_CLARIFY_RESERVATION_SWEEP_PENDING]")');
    expect(source).toMatch(/^const askClarifyReservationSweepTimer=gatedInterval\(releaseWatcher,triggerAskClarifyReservationSweep,ASK_CLARIFY_RESERVATION_SWEEP_EVERY_MS\);$/mu);
    expect(source).toMatch(/^api\.addHook\("onClose",async \(\) => clearInterval\(askClarifyReservationSweepTimer\)\);$/mu);
    expect(source).toMatch(/^endBecameCurrent = releaseWatcher\.onBecameCurrent\(\(\) => \{\n(?: {2}.*\n)*? {2}triggerAskClarifyReservationSweep\(\);$/mu);
  });
});
