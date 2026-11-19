import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileUserDekStore, generateDek, loadKek } from "@debateai/crypto";
import { describe, expect, it } from "vitest";
import { createUnfinishedSignupExpiry, UNFINISHED_SIGNUP_EXPIRY_EVERY_MS } from "../../apps/api/src/unfinished-signup-expiry.js";
import { PostgresUnfinishedSignupExpiryRepository } from "../../packages/db/src/unfinished-signup-expiry.js";

/** A database of sign-ups due and key files owed, in memory: expire moves an id from due to owed, completeKeyCleanup takes it. */
function fakeDatabase(dueIds: readonly string[], owedIds: readonly string[] = []) {
  const due = [...dueIds];
  const owed = [...owedIds];
  const calls: string[] = [];
  const stuck = new Set<string>();
  const notDue = new Set<string>();
  return {
    due, owed, calls, stuck, notDue,
    repository: {
      due: async (limit: number) => { calls.push(`due:${limit}`); return due.slice(0, limit); },
      expire: async (userId: string) => {
        calls.push(`expire:${userId}`);
        if (stuck.has(userId)) throw new Error("locked");
        if (notDue.has(userId)) return "NOT_DUE" as const;
        due.splice(due.indexOf(userId), 1);
        owed.push(userId);
        return "EXPIRED" as const;
      },
      keyCleanupOwed: async (limit: number) => { calls.push(`owed:${limit}`); return owed.slice(0, limit); },
      completeKeyCleanup: async (userId: string) => { calls.push(`complete:${userId}`); owed.splice(owed.indexOf(userId), 1); return true; }
    }
  };
}
const ids = (count: number, prefix = "u") => Array.from({ length: count }, (_, index) => `${prefix}${index}`);

describe("0183 the unfinished sign-up expiry pass", () => {
  it("deletes each sign-up due, then destroys each key file owed before taking its row, and logs only the counts", async () => {
    const db = fakeDatabase(["a", "b"], ["left-by-a-crashed-pass"]);
    const destroyed: string[] = [];
    const lines: string[] = [];
    const pass = createUnfinishedSignupExpiry({
      repository: db.repository, users: { destroy: async (userId) => { db.calls.push(`destroy:${userId}`); destroyed.push(userId); return "DESTROYED"; } },
      log: (line) => lines.push(line)
    });
    expect(await pass.run()).toEqual({ expired: 2, keys: 3, failed: 0, backlog: false });
    expect(db.calls).toEqual([
      "due:200", "expire:a", "expire:b",
      "owed:200", "destroy:left-by-a-crashed-pass", "complete:left-by-a-crashed-pass", "destroy:a", "complete:a", "destroy:b", "complete:b"
    ]);
    expect(destroyed).toEqual(["left-by-a-crashed-pass", "a", "b"]);
    expect(lines.map((line) => JSON.parse(line))).toEqual([{ event: "signup.unfinished_expired", expired: 2, keys: 3, failed: 0 }]);
  });

  it("logs nothing when nothing was due or owed", async () => {
    const db = fakeDatabase([]);
    const lines: string[] = [];
    const pass = createUnfinishedSignupExpiry({ repository: db.repository, users: { destroy: async () => "DESTROYED" }, log: (line) => lines.push(line) });
    expect(await pass.run()).toEqual({ expired: 0, keys: 0, failed: 0, backlog: false });
    expect(lines).toEqual([]);
  });

  it("one account or key file that fails never stops the others; the pass then ends incomplete, after its line", async () => {
    const db = fakeDatabase(["a", "b", "c", "d"]);
    db.stuck.add("b");
    db.notDue.add("c");
    const lines: string[] = [];
    const destroyed: string[] = [];
    const pass = createUnfinishedSignupExpiry({
      repository: db.repository,
      users: { destroy: async (userId) => { if (userId === "a") throw new Error("disk"); destroyed.push(userId); return "ALREADY_ABSENT"; } },
      log: (line) => lines.push(line)
    });
    await expect(pass.run()).rejects.toThrow("UNFINISHED_SIGNUP_EXPIRY_INCOMPLETE");
    // b failed and c had finished: both stay; a and d went. a's key file failed: it stays owed, never taken off the list.
    expect(db.due).toEqual(["b", "c"]);
    expect(destroyed).toEqual(["d"]);
    expect(db.owed).toEqual(["a"]);
    expect(db.calls).not.toContain("complete:a");
    expect(lines.map((line) => JSON.parse(line))).toEqual([{ event: "signup.unfinished_expired", expired: 2, keys: 1, failed: 2 }]);
  });

  it("takes a full batch again, stops at five batches with a backlog, and never spins on a batch nothing moved in", async () => {
    const db = fakeDatabase(ids(1100));
    const pass = createUnfinishedSignupExpiry({ repository: db.repository, users: { destroy: async () => "DESTROYED" }, log: () => undefined });
    expect(await pass.run()).toEqual({ expired: 1000, keys: 1000, failed: 0, backlog: true });
    expect(db.calls.filter((call) => call.startsWith("due:"))).toHaveLength(5);
    expect(db.due).toHaveLength(100);
    expect(await pass.run()).toEqual({ expired: 100, keys: 100, failed: 0, backlog: false });
    // A full batch of accounts that all answer NOT_DUE (finished between the read and the delete) is asked once, not five times.
    const idle = fakeDatabase(ids(200, "n"));
    for (const id of idle.due) idle.notDue.add(id);
    const idlePass = createUnfinishedSignupExpiry({ repository: idle.repository, users: { destroy: async () => "DESTROYED" }, log: () => undefined });
    expect(await idlePass.run()).toEqual({ expired: 0, keys: 0, failed: 0, backlog: false });
    expect(idle.calls.filter((call) => call.startsWith("due:"))).toHaveLength(1);
  });

  it("is asked every ten minutes", () => {
    expect(UNFINISHED_SIGNUP_EXPIRY_EVERY_MS).toBe(600_000);
  });

  it("destroys the real key file of a deleted sign-up, and a file already gone is taken off the list all the same", async () => {
    const directory = await mkdtemp(join(tmpdir(), "debateai-signup-expiry-"));
    try {
      const keyPath = join(directory, "kek.bin");
      await writeFile(keyPath, generateDek(), { mode: 0o600 });
      await chmod(directory, 0o700);
      const root = join(directory, "user-deks");
      await mkdir(root, { mode: 0o700 });
      const store = new FileUserDekStore(root, loadKek(keyPath));
      const expired = "11111111-1111-4111-8111-111111111111";
      const neverStored = "22222222-2222-4222-8222-222222222222";
      const kept = "33333333-3333-4333-8333-333333333333";
      await store.store(expired, generateDek());
      await store.store(kept, generateDek());
      const db = fakeDatabase([expired, neverStored]);
      const pass = createUnfinishedSignupExpiry({ repository: db.repository, users: store, log: () => undefined });
      expect(await pass.run()).toEqual({ expired: 2, keys: 2, failed: 0, backlog: false });
      expect(await store.exists(expired)).toBe(false);
      expect(await store.exists(kept)).toBe(true);
      expect(db.owed).toEqual([]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("the repository calls 0183's four functions and nothing else", async () => {
    const queries: Array<Readonly<{ sql: string; values: readonly unknown[] }>> = [];
    const answers: unknown[][] = [[{ due: ["a"] }], [{ outcome: "EXPIRED" }], [{ owed: ["a"] }], [{ taken: true }], [{ outcome: "DELETED" }]];
    const repository = new PostgresUnfinishedSignupExpiryRepository({
      query: async (sql: string, values: readonly unknown[]) => { queries.push({ sql, values }); return { rows: answers.shift() }; }
    } as never);
    expect(await repository.due(200)).toEqual(["a"]);
    expect(await repository.expire("a")).toBe("EXPIRED");
    expect(await repository.keyCleanupOwed(200)).toEqual(["a"]);
    expect(await repository.completeKeyCleanup("a")).toBe(true);
    await expect(repository.expire("a")).rejects.toThrow("UNFINISHED_SIGNUP_EXPIRY_OUTCOME_INVALID");
    expect(queries.slice(0, 4)).toEqual([
      { sql: "SELECT identity.read_unfinished_signups_due($1::integer)::text[] AS due", values: [200] },
      { sql: "SELECT identity.expire_unfinished_signup($1::uuid) AS outcome", values: ["a"] },
      { sql: "SELECT identity.read_unfinished_signup_key_cleanup($1::integer)::text[] AS owed", values: [200] },
      { sql: "SELECT identity.complete_unfinished_signup_key_cleanup($1::uuid) AS taken", values: ["a"] }
    ]);
  });

  it("is wired in main.ts like every sweep: on the pool outside any request, single flight, gated, once each time the release becomes current, cleared on close", async () => {
    const source = await readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    // Top-level statements (no indentation). The pool, never the erasure pool: 0183's functions are the cross-account marker's.
    expect(source).toMatch(/^const unfinishedSignupExpiry = createUnfinishedSignupExpiry\(\{ repository: new PostgresUnfinishedSignupExpiryRepository\(pool\), users: dekStore, log: \(line\) => console\.error\(line\) \}\);$/mu);
    expect(source).toMatch(/^const triggerUnfinishedSignupExpiry=createSingleFlightErasureReconciler\(\n {2}async \(\)=>\{ await unfinishedSignupExpiry\.run\(\); \},\n {2}\(\)=>console\.error\("\[UNFINISHED_SIGNUP_EXPIRY_PENDING\]"\)\n\);$/mu);
    expect(source).toMatch(/^const unfinishedSignupExpiryTimer=gatedInterval\(releaseWatcher,triggerUnfinishedSignupExpiry,UNFINISHED_SIGNUP_EXPIRY_EVERY_MS\);$/mu);
    expect(source).toMatch(/^api\.addHook\("onClose",async \(\) => clearInterval\(unfinishedSignupExpiryTimer\)\);$/mu);
    expect(source).toMatch(/^endBecameCurrent = releaseWatcher\.onBecameCurrent\(\(\) => \{\n(?: {2}.*\n)*? {2}triggerUnfinishedSignupExpiry\(\);$/mu);
    expect(source).not.toContain("PostgresUnfinishedSignupExpiryRepository(erasurePool)");
  });
});
