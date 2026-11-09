import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MemorySavedQuestionKeyStore,
  encrypt,
  generateDek,
  type KeyDestroyResult,
  type ReadableUserDekStore
} from "../../packages/crypto/src/index.js";
import { AccountErasureCoordinator } from "../../packages/db/src/account-erasure.js";

/**
 * Closing the account destroys every saved question's own key (V4 start step, plan 2026-11-03 Task 39d; owner answer S4 A, 4 Nov: "account
 * deletion destroys them too"). In the API's closing code (packages/db/src/account-erasure.ts), right after the debates' keys and before the
 * account key: every key file naming the account's owner_ref goes (so a key whose row never landed goes too), and none may be left at the
 * readback. They are destroyed and checked, never counted: 0110's finalize still counts the debates' keys only. The coordinator runs over
 * fakes, as tests/integration/sf-s04-threat-erasure.test.ts:15-34 builds them, with a real MemorySavedQuestionKeyStore for the question keys.
 */
class MemoryUserDekStore implements ReadableUserDekStore {
  readonly #keys = new Map<string, Buffer>();
  async store(userId: string, dek: Uint8Array): Promise<void> { this.#keys.set(userId, Buffer.from(dek)); }
  async load(userId: string): Promise<Buffer> {
    const key = this.#keys.get(userId);
    if (key === undefined) throw new Error("USER_DEK_NOT_FOUND");
    return Buffer.from(key);
  }
  async exists(userId: string): Promise<boolean> { return this.#keys.has(userId); }
  async destroy(userId: string): Promise<KeyDestroyResult> { return this.#keys.delete(userId) ? "DESTROYED" : "ALREADY_ABSENT"; }
}

const source = { ip: "127.0.0.1", userAgent: "test", requestId: randomUUID() };
type Manifest = Readonly<{ userId: string; ownerRef: string; runIds: string[]; legacyRunIds: string[]; publishedRunIds: string[];
  currentPublicationRefs: string[]; cleanupPublicationRefs: string[] }>;
type Options = Readonly<{
  runIds?: readonly string[];
  /** A first attempt (preview, prepare) or a retry of a PREPARED closing (no preview). */
  retry?: boolean;
  userKeyExists?: boolean;
  questionKeys?: Readonly<{ listByOwner(ownerRef: string): Promise<readonly string[]>; destroy(id: string): Promise<KeyDestroyResult> }>;
  hold?: boolean;
}>;

function closing(account: Readonly<{ userId: string; ownerRef: string }>, options: Options = {}) {
  const order: string[] = [];
  const finalized: Record<string, unknown>[] = [];
  let userKeyExists = options.userKeyExists ?? true;
  const keys = new Set(options.runIds ?? []);
  const manifest: Manifest = { userId: account.userId, ownerRef: account.ownerRef, runIds: [...(options.runIds ?? [])], legacyRunIds: [],
    publishedRunIds: [], currentPublicationRefs: [], cleanupPublicationRefs: [] };
  const repository = {
    preview: async () => options.retry === true ? null : manifest,
    withNotificationLease: async (_user: string, run: () => Promise<unknown>) => run(),
    prepare: async () => "PREPARED", cleanupManifest: async () => manifest,
    completionNotificationsReady: async () => true,
    finalize: async (input: Record<string, unknown>) => { order.push("finalize"); finalized.push(input); return "CLEANED"; },
    status: async () => options.retry === true && !order.includes("finalize") ? "PREPARED" : "CLEANED"
  };
  const accountKey = Buffer.alloc(32, 7);
  const users = {
    load: async () => Buffer.from(accountKey),
    exists: async () => userKeyExists,
    destroy: async () => { order.push("user-key"); const was = userKeyExists; userKeyExists = false; return was ? "DESTROYED" : "ALREADY_ABSENT"; }
  };
  const runs = {
    listByOwner: async () => [...keys].sort(), exists: async (runId: string) => keys.has(runId), ownerRef: async () => account.ownerRef,
    destroy: async (runId: string) => { order.push(`debate-key:${runId}`); return keys.delete(runId) ? "DESTROYED" : "ALREADY_ABSENT"; }
  };
  const aad = ["identity", "user.email_ciphertext", account.userId, "run:none", account.userId, `user-dek:${account.userId}`, "1"] as const;
  const hold = options.hold === true ? {
    readEmailCiphertext: async () => encrypt(accountKey, Buffer.from("asker@example.test"), aad),
    beforeKeyDestruction: async () => { order.push("hold"); }
  } : {};
  const coordinator = new AccountErasureCoordinator(repository as never, users as never, runs as never, undefined,
    { ...hold, ...(options.questionKeys === undefined ? {} : { savedQuestionKeys: options.questionKeys }) });
  return { coordinator, order, finalized };
}

/** The question keys of two people in one store; destroy calls are noted, and a "leaky" store keeps what it was asked to destroy. */
async function questionKeys(order: () => string[], leaky = false) {
  const users = new MemoryUserDekStore();
  const person = async () => {
    const identity = { userId: randomUUID(), ownerRef: randomUUID() };
    await users.store(identity.userId, generateDek());
    return identity;
  };
  const owner = await person();
  const other = await person();
  const store = new MemorySavedQuestionKeyStore(users);
  const mine = [randomUUID(), randomUUID()].sort();
  for (const id of mine) await store.store(id, owner, generateDek());
  const theirs = randomUUID();
  const theirKey = generateDek();
  await store.store(theirs, other, theirKey);
  const watched = {
    listByOwner: (ownerRef: string) => store.listByOwner(ownerRef),
    destroy: async (id: string) => { order().push(`question-key:${id}`); return leaky ? "DESTROYED" as const : store.destroy(id); }
  };
  return { users, store, owner, other, mine, theirs, theirKey, watched };
}

describe("account closing destroys the saved questions' keys (S4 A)", () => {
  it("destroys the debate's key, then the account's two question keys, then the account key; another owner's key still opens", async () => {
    let log: string[] = [];
    const keys = await questionKeys(() => log);
    const runId = randomUUID();
    const { coordinator, order, finalized } = closing(keys.owner, { runIds: [runId], questionKeys: keys.watched });
    log = order;
    const outcome = await coordinator.execute(randomUUID(), source);
    expect(outcome).toBe("CLEANED");
    expect(order).toEqual([`debate-key:${runId}`, ...keys.mine.map((id) => `question-key:${id}`), "user-key", "finalize"]);
    expect(await keys.store.listByOwner(keys.owner.ownerRef)).toEqual([]);
    expect(await keys.store.listByOwner(keys.other.ownerRef)).toEqual([keys.theirs]);
    expect((await keys.store.load(keys.theirs, keys.other)).equals(keys.theirKey)).toBe(true);
    // The question keys never count as debates' keys: 0110's finalize receives the debates' counts only.
    expect(finalized).toEqual([expect.objectContaining({ destroyedRunKeyCount: 1, alreadyAbsentRunKeyCount: 0,
      destroyedUserDekCount: 1, alreadyAbsentUserDekCount: 0 })]);
  });

  it("answers INVALID_EVIDENCE, and never finalizes, while a question key is still listed at the readback", async () => {
    let log: string[] = [];
    const keys = await questionKeys(() => log, true);
    const { coordinator, order } = closing(keys.owner, { questionKeys: keys.watched });
    log = order;
    expect(await coordinator.execute(randomUUID(), source)).toBe("INVALID_EVIDENCE");
    expect(order).toEqual([...keys.mine.map((id) => `question-key:${id}`), "user-key"]);
    expect(order).not.toContain("finalize");
    expect(await keys.store.listByOwner(keys.owner.ownerRef)).toEqual(keys.mine);
  });

  it("a retry after the account key is already gone still destroys a leftover question key, then finalizes", async () => {
    let log: string[] = [];
    const keys = await questionKeys(() => log);
    // The first attempt destroyed the account key (and the run keys) before it stopped; a key made in between is left over.
    await keys.users.destroy(keys.owner.userId);
    await keys.store.destroy(keys.mine[1]!);
    const { coordinator, order, finalized } = closing(keys.owner, { retry: true, userKeyExists: false, questionKeys: keys.watched });
    log = order;
    expect(await coordinator.execute(randomUUID(), source)).toBe("CLEANED");
    expect(order).toEqual([`question-key:${keys.mine[0]!}`, "user-key", "finalize"]);
    expect(await keys.store.listByOwner(keys.owner.ownerRef)).toEqual([]);
    expect(finalized).toEqual([expect.objectContaining({ destroyedRunKeyCount: 0, alreadyAbsentRunKeyCount: 0,
      destroyedUserDekCount: 0, alreadyAbsentUserDekCount: 1 })]);
  });

  it("without savedQuestionKeys the closing runs exactly as before (sf-s04-threat-erasure's first case); with an empty store it is the same", async () => {
    const account = { userId: randomUUID(), ownerRef: randomUUID() };
    const before = closing(account, { hold: true });
    expect(await before.coordinator.execute(randomUUID(), source)).toBe("CLEANED");
    expect(before.order).toEqual(["hold", "user-key", "finalize"]);
    const withoutTimes = (inputs: readonly Record<string, unknown>[]) =>
      inputs.map(({ erasureId: _id, keyCleanupCompletedAt, occurredAt, ...rest }) => ({ ...rest,
        times: [keyCleanupCompletedAt instanceof Date, keyCleanupCompletedAt === occurredAt] }));
    expect(withoutTimes(before.finalized)).toEqual([{ source, destroyedRunKeyCount: 0, alreadyAbsentRunKeyCount: 0,
      destroyedUserDekCount: 1, alreadyAbsentUserDekCount: 0, times: [true, true] }]);
    const empty = await questionKeys(() => [], false);
    const after = closing(account, { hold: true, questionKeys: { listByOwner: async () => [], destroy: empty.watched.destroy } });
    expect(await after.coordinator.execute(randomUUID(), source)).toBe("CLEANED");
    expect(after.order).toEqual(before.order);
    expect(withoutTimes(after.finalized)).toEqual(withoutTimes(before.finalized));
  });
});
