import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FileRunContentKeyStore,
  FileSavedQuestionKeyStore,
  FileUserDekStore,
  MemorySavedQuestionKeyStore,
  RunContentKeyUnresolvedError,
  SavedQuestionKeyUnresolvedError,
  decrypt,
  generateDek,
  loadKek,
  savedQuestionKeyId,
  type CryptoEnvelope,
  type ReadableUserDekStore,
  type RunContentKeyFileSystem,
  type RunContentKeyIdentity,
  type SavedQuestionKeyStore
} from "../../packages/crypto/src/index.js";

/**
 * The question-key store (V4 start step, plan 2026-11-03 Task 39d; owner answer S4 A, 4 Nov: each saved question has a key of its own,
 * locked by the person's account key exactly as a debate's run key is). The key file sits at <root>/saved-questions/<id>/question-key.v1.json
 * beside the debates' runs/ folder, written and removed step for step as the run keys (tests/unit/s6-content-encryption.test.ts), opened
 * only with the caller's own { userId, ownerRef }. Every case runs in a fresh folder under the run's TMPDIR, over a real FileUserDekStore.
 */
const KEY_FILE = "question-key.v1.json";
const FOLDER = "saved-questions";
const NOT_V4 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

type Person = RunContentKeyIdentity;
async function world() {
  const root = await mkdtemp(join(tmpdir(), "debateai-saved-question-keys-"));
  roots.push(root);
  const users = new FileUserDekStore(root, loadKek(generateDek()));
  const person = async (): Promise<Person> => {
    const identity = { userId: randomUUID(), ownerRef: randomUUID() };
    await users.store(identity.userId, generateDek());
    return identity;
  };
  return { root, users, person };
}

type Failure = "temp-sync" | "directory-sync" | "parent-sync" | "cleanup" | "unlink" | "readback";
/** The run keys' observing file system (s6-content-encryption.test.ts:109-122), for the question keys' folder, noting every path it is given. */
function observing(events: string[], paths: string[], failures: ReadonlySet<Failure> = new Set()): RunContentKeyFileSystem {
  const note = (path: unknown): void => { paths.push(String(path)); };
  return {
    async mkdir(path: string, options: Parameters<typeof mkdir>[1]) { note(path); return mkdir(path, options); },
    async chmod(path: string, mode: number) { note(path); return chmod(path, mode); },
    async lstat(path: string) { note(path); events.push("lstat"); return lstat(path); },
    async stat(path: string) { note(path); return stat(path); },
    async readFile(path: string, options: Parameters<typeof readFile>[1]) { note(path); return readFile(path, options); },
    async readdir(path: string, options: Parameters<typeof readdir>[1]) { note(path); return readdir(path, options as never); },
    async rename(source: string, destination: string) {
      note(source); note(destination); events.push("rename");
      await rename(source, destination);
    },
    async rm(path: string, options: { recursive: boolean; force: boolean }) {
      note(path); events.push("rm");
      if (failures.has("cleanup") || failures.has("unlink")) throw new Error("INJECTED_RM_FAILURE");
      if (!failures.has("readback")) await rm(path, options);
    },
    async open(path: string, flags: string | number, mode?: number) {
      note(path);
      const handle = await open(path, flags, mode);
      if (typeof flags === "number") { events.push("open-read"); return handle; }
      const kind = path.includes(KEY_FILE) ? "temp" : basename(path) === FOLDER ? "parent" : "directory";
      events.push(`open-${kind}`);
      return new Proxy(handle, {
        get(target, property, receiver) {
          if (property === "sync") {
            return async () => {
              events.push(`sync-${kind}`);
              if (failures.has(`${kind}-sync` as Failure)) throw new Error("INJECTED_FSYNC_FAILURE");
              await target.sync();
            };
          }
          if (property === "close") return async () => { events.push(`close-${kind}`); await target.close(); };
          const value = Reflect.get(target, property, receiver) as unknown;
          return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        }
      });
    }
  } as unknown as RunContentKeyFileSystem;
}

const both = async () => {
  const setting = await world();
  return {
    ...setting,
    stores: [
      ["file", new FileSavedQuestionKeyStore(setting.root, setting.users)],
      ["memory", new MemorySavedQuestionKeyStore(setting.users)]
    ] as const satisfies readonly (readonly [string, SavedQuestionKeyStore])[]
  };
};

describe("the question-key store", () => {
  it("names each key saved-question:<id>:v1", () => {
    const id = randomUUID();
    expect(savedQuestionKeyId(id)).toBe(`saved-question:${id}:v1`);
  });

  it("keeps exactly one custody file per question, holding the wrapped key and never the key's bytes", async () => {
    const { root, users, person } = await world();
    const store = new FileSavedQuestionKeyStore(root, users);
    const owner = await person();
    const id = randomUUID();
    const key = generateDek();
    await store.store(id, owner, key);
    expect(await readdir(join(root, FOLDER))).toEqual([id]);
    expect(await readdir(join(root, FOLDER, id))).toEqual([KEY_FILE]);
    // The run keys' custody modes: a run key stored in the same root has the same modes.
    const runId = randomUUID();
    await new FileRunContentKeyStore(root, users, async () => owner.userId).store(runId, owner, generateDek());
    const modes = async (path: string) => (await stat(path)).mode & 0o7777;
    expect(await modes(join(root, FOLDER, id, KEY_FILE))).toBe(await modes(join(root, "runs", runId, "content-key.v1.json")));
    expect(await modes(join(root, FOLDER, id))).toBe(await modes(join(root, "runs", runId)));
    expect(await modes(join(root, FOLDER))).toBe(await modes(join(root, "runs")));
    expect(await modes(join(root, FOLDER, id, KEY_FILE))).toBe(0o600);
    const text = await readFile(join(root, FOLDER, id, KEY_FILE), "utf8");
    const record = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(record).sort()).toEqual(["key_id", "owner_ref", "saved_question_id", "version", "wrapped_question_key"]);
    expect(record).toMatchObject({ version: 1, saved_question_id: id, owner_ref: owner.ownerRef, key_id: `saved-question:${id}:v1` });
    const wrapped = record.wrapped_question_key as Record<string, unknown>;
    expect(Object.keys(wrapped)).toEqual(["v", "keyId", "nonce", "ct", "tag"]);
    expect(wrapped).toMatchObject({ v: 1, keyId: `saved-question:${id}:v1` });
    for (const encoding of ["hex", "base64", "base64url", "latin1"] as const) {
      expect(text.includes(key.toString(encoding)), encoding).toBe(false);
    }
    expect(text).not.toContain(owner.userId);
  });

  it("gives back the stored 32 bytes, and only to its owner, for its own id", async () => {
    const { root, person, stores } = await both();
    for (const [kind, store] of stores) {
      const owner = await person();
      const stranger = await person();
      const id = randomUUID();
      const key = generateDek();
      await store.store(id, owner, key);
      const loaded = await store.load(id, owner);
      expect(loaded.byteLength, kind).toBe(32);
      expect(loaded.equals(key), kind).toBe(true);
      expect(await store.exists(id), kind).toBe(true);
      expect(await store.ownerRef(id), kind).toBe(owner.ownerRef);
      for (const identity of [
        { userId: owner.userId, ownerRef: stranger.ownerRef },
        { userId: stranger.userId, ownerRef: owner.ownerRef },
        stranger
      ]) await expect(store.load(id, identity), kind).rejects.toBeInstanceOf(SavedQuestionKeyUnresolvedError);
      await expect(store.load(randomUUID(), owner), kind).rejects.toBeInstanceOf(SavedQuestionKeyUnresolvedError);
      if (kind !== "file") continue;
      // A record copied into another id's folder does not open: as it is (it names the first id), and with every id rewritten (the wrap
      // AAD names the id the key was made for).
      for (const rewrite of [false, true]) {
        const other = randomUUID();
        const record = JSON.parse(await readFile(join(root, FOLDER, id, KEY_FILE), "utf8")) as Record<string, Record<string, unknown> | unknown>;
        const copy = rewrite ? { ...record, saved_question_id: other, key_id: savedQuestionKeyId(other),
          wrapped_question_key: { ...(record.wrapped_question_key as Record<string, unknown>), keyId: savedQuestionKeyId(other) } } : record;
        await mkdir(join(root, FOLDER, other), { mode: 0o700 });
        await writeFile(join(root, FOLDER, other, KEY_FILE), JSON.stringify(copy), { mode: 0o600 });
        await expect(store.load(other, owner), `copy rewritten=${String(rewrite)}`).rejects.toBeInstanceOf(SavedQuestionKeyUnresolvedError);
        await store.destroy(other);
      }
    }
  });

  it("wraps each key under the account key with the plan's wrap AAD, so a record rewritten to name another person does not open", async () => {
    // Review of Task 39d: the wrap AAD of the saved-questions Global Constraints, ["secret-store", "saved-question-key", <id>, "run:none",
    // <ownerRef>, "saved-question:<id>:v1", "1"], pinned by opening the stored record with it; and its owner slot, which the owner_ref
    // check alone cannot prove.
    const { root, users, person } = await world();
    const store = new FileSavedQuestionKeyStore(root, users);
    const owner = await person();
    const stranger = await person();
    const id = randomUUID();
    const key = generateDek();
    await store.store(id, owner, key);
    const location = join(root, FOLDER, id, KEY_FILE);
    const record = JSON.parse(await readFile(location, "utf8")) as Record<string, unknown>;
    const accountKey = await users.load(owner.userId);
    try {
      const opened = decrypt(accountKey, record.wrapped_question_key as CryptoEnvelope,
        ["secret-store", "saved-question-key", id, "run:none", owner.ownerRef, `saved-question:${id}:v1`, "1"]);
      expect(opened.equals(key)).toBe(true);
      opened.fill(0);
    } finally {
      accountKey.fill(0);
    }
    // The same file naming the stranger's owner_ref, opened under the owner's own account key with the stranger's owner_ref.
    await writeFile(location, JSON.stringify({ ...record, owner_ref: stranger.ownerRef }), { mode: 0o600 });
    expect(await store.ownerRef(id)).toBe(stranger.ownerRef);
    await expect(store.load(id, { userId: owner.userId, ownerRef: stranger.ownerRef })).rejects.toBeInstanceOf(SavedQuestionKeyUnresolvedError);
  });

  it("is kept apart from the debates' keys: neither store lists or opens the other's keys", async () => {
    const { root, users, person } = await world();
    const owner = await person();
    const events: string[] = [];
    const paths: string[] = [];
    const questions = new FileSavedQuestionKeyStore(root, users, observing(events, paths));
    const runs = new FileRunContentKeyStore(root, users, async () => owner.userId);
    const id = randomUUID();
    await questions.store(id, owner, generateDek());
    expect(await runs.listByOwner(owner.ownerRef)).toEqual([]);
    expect(await runs.exists(id)).toBe(false);
    await expect(runs.load(id)).rejects.toBeInstanceOf(RunContentKeyUnresolvedError);
    const runId = randomUUID();
    await runs.store(runId, owner, generateDek());
    expect(await runs.listByOwner(owner.ownerRef)).toEqual([runId]);
    expect(await questions.listByOwner(owner.ownerRef)).toEqual([id]);
    expect(await questions.exists(runId)).toBe(false);
    await expect(questions.load(runId, owner)).rejects.toBeInstanceOf(SavedQuestionKeyUnresolvedError);
    expect(await questions.destroy(runId)).toBe("ALREADY_ABSENT");
    expect(await runs.exists(runId)).toBe(true);
    // It never reads or lists the debates' folder or the account keys' folder.
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((path) => !path.startsWith(root))).toEqual([]);
    const inside = paths.map((path) => path.slice(root.length));
    expect(inside.filter((path) => path.startsWith(`${sep}runs`) || path.startsWith(`${sep}users`))).toEqual([]);
    expect(inside.filter((path) => path !== "" && !path.startsWith(`${sep}${FOLDER}`))).toEqual([]);
  });

  it("destroys a key for good: DESTROYED, then absent, unresolved and ALREADY_ABSENT", async () => {
    const { person, stores } = await both();
    for (const [kind, store] of stores) {
      const owner = await person();
      const id = randomUUID();
      await store.store(id, owner, generateDek());
      expect(await store.destroy(id), kind).toBe("DESTROYED");
      expect(await store.exists(id), kind).toBe(false);
      await expect(store.load(id, owner), kind).rejects.toBeInstanceOf(SavedQuestionKeyUnresolvedError);
      await expect(store.ownerRef(id), kind).rejects.toBeInstanceOf(SavedQuestionKeyUnresolvedError);
      expect(await store.listByOwner(owner.ownerRef), kind).toEqual([]);
      expect(await store.destroy(id), kind).toBe("ALREADY_ABSENT");
    }
  });

  it("publishes a key's absence only after the unlink, the parent's fsync and an lstat readback", async () => {
    for (const failure of ["unlink", "parent", "readback"] as const) {
      const { root, users, person } = await world();
      const owner = await person();
      const id = randomUUID();
      await new FileSavedQuestionKeyStore(root, users).store(id, owner, generateDek());
      const faulted = new FileSavedQuestionKeyStore(root, users,
        observing([], [], new Set([failure === "parent" ? "parent-sync" : failure])));
      const refused = await faulted.destroy(id).then(() => null, (error: unknown) => error as { code?: string });
      expect(refused?.code, failure).toBe(failure === "readback" ? "KEY_DESTROY_READBACK_FAILED" : "SAVED_QUESTION_KEY_DESTROY_FAILED");
      const fresh = new FileSavedQuestionKeyStore(root, users);
      if (failure === "parent") {
        expect(await fresh.exists(id)).toBe(false);
        await expect(fresh.load(id, owner)).rejects.toBeInstanceOf(SavedQuestionKeyUnresolvedError);
      } else {
        expect(await fresh.exists(id), failure).toBe(true);
        expect((await fresh.load(id, owner)).byteLength, failure).toBe(32);
      }
    }
    const { root, users, person } = await world();
    const owner = await person();
    const id = randomUUID();
    await new FileSavedQuestionKeyStore(root, users).store(id, owner, generateDek());
    const events: string[] = [];
    expect(await new FileSavedQuestionKeyStore(root, users, observing(events, [])).destroy(id)).toBe("DESTROYED");
    expect(events).toEqual(["lstat", "rm", "open-parent", "sync-parent", "close-parent", "lstat"]);
  });

  it("syncs the temporary file before the rename and the folders after it, as the run keys do", async () => {
    const { root, users, person } = await world();
    const owner = await person();
    const events: string[] = [];
    const id = randomUUID();
    await new FileSavedQuestionKeyStore(root, users, observing(events, [])).store(id, owner, generateDek());
    expect(events).toEqual([
      "open-temp", "sync-temp", "close-temp", "rename",
      "open-directory", "sync-directory", "close-directory",
      "open-parent", "sync-parent", "close-parent"
    ]);
  });

  it("leaves no folder after a temporary-file fsync crash, and reports a failed cleanup instead of swallowing it", async () => {
    const { root, users, person } = await world();
    const owner = await person();
    const events: string[] = [];
    const id = randomUUID();
    await expect(new FileSavedQuestionKeyStore(root, users, observing(events, [], new Set(["temp-sync"]))).store(id, owner, generateDek()))
      .rejects.toMatchObject({ code: "SAVED_QUESTION_KEY_STORE_FAILED" });
    expect(events).toContain("rm");
    expect(events).not.toContain("rename");
    await expect(stat(join(root, FOLDER, id))).rejects.toMatchObject({ code: "ENOENT" });
    const other = randomUUID();
    await expect(new FileSavedQuestionKeyStore(root, users, observing([], [], new Set(["temp-sync", "cleanup"]))).store(other, owner, generateDek()))
      .rejects.toMatchObject({ code: "SAVED_QUESTION_KEY_STORE_CLEANUP_FAILED" });
  });

  it("reports uncertain durability after the rename, and keeps the key", async () => {
    for (const failure of ["directory-sync", "parent-sync"] as const) {
      const { root, users, person } = await world();
      const owner = await person();
      const id = randomUUID();
      const key = generateDek();
      await expect(new FileSavedQuestionKeyStore(root, users, observing([], [], new Set([failure]))).store(id, owner, key), failure)
        .rejects.toMatchObject({ code: "SAVED_QUESTION_KEY_STORE_DURABILITY_UNCERTAIN" });
      expect((await stat(join(root, FOLDER, id, KEY_FILE))).isFile(), failure).toBe(true);
      expect((await new FileSavedQuestionKeyStore(root, users).load(id, owner)).equals(key), failure).toBe(true);
    }
  });

  it("lists only the owner's ids, sorted; a stray name or a symlink in the folder is unresolved, never skipped", async () => {
    const { root, person, stores } = await both();
    for (const [kind, store] of stores) {
      const owner = await person();
      const stranger = await person();
      const ids = [randomUUID(), randomUUID(), randomUUID()];
      for (const id of ids) await store.store(id, owner, generateDek());
      const theirs = randomUUID();
      await store.store(theirs, stranger, generateDek());
      expect(await store.listByOwner(owner.ownerRef), kind).toEqual([...ids].sort());
      expect(await store.listByOwner(stranger.ownerRef), kind).toEqual([theirs]);
      expect(await store.listByOwner(randomUUID()), kind).toEqual([]);
    }
    const store = new FileSavedQuestionKeyStore(root, (await world()).users);
    for (const stray of [
      async () => mkdir(join(root, FOLDER, "not-an-id"), { mode: 0o700 }),
      async () => mkdir(join(root, FOLDER, NOT_V4), { mode: 0o700 }),
      async () => symlink(join(root, "users"), join(root, FOLDER, randomUUID())),
      async () => writeFile(join(root, FOLDER, randomUUID()), "{}", { mode: 0o600 })
    ]) {
      const before = new Set(await readdir(join(root, FOLDER)));
      await stray();
      const added = (await readdir(join(root, FOLDER))).filter((name) => !before.has(name));
      await expect(store.listByOwner(randomUUID())).rejects.toBeInstanceOf(SavedQuestionKeyUnresolvedError);
      for (const name of added) await rm(join(root, FOLDER, name), { recursive: true, force: true });
    }
    expect((await store.listByOwner(randomUUID()))).toEqual([]);
  });

  it("refuses a non-v4 id, user id or owner ref before any file is touched, and a second key for one id", async () => {
    const { root, users, person } = await world();
    const owner = await person();
    const loads: string[] = [];
    const watched: ReadableUserDekStore = {
      store: async (userId, dek) => users.store(userId, dek), destroy: async (userId) => users.destroy(userId),
      exists: async (userId) => users.exists(userId), load: async (userId) => { loads.push(userId); return users.load(userId); }
    };
    const events: string[] = [];
    const paths: string[] = [];
    const stores = [
      ["file", new FileSavedQuestionKeyStore(root, watched, observing(events, paths))],
      ["memory", new MemorySavedQuestionKeyStore(watched)]
    ] as const;
    for (const [kind, store] of stores) {
      for (const [id, identity, code] of [
        [NOT_V4, owner, "SAVED_QUESTION_KEY_ID_INVALID"], ["question", owner, "SAVED_QUESTION_KEY_ID_INVALID"],
        [randomUUID(), { ...owner, userId: NOT_V4 }, "SAVED_QUESTION_KEY_USER_ID_INVALID"],
        [randomUUID(), { ...owner, ownerRef: NOT_V4 }, "SAVED_QUESTION_KEY_OWNER_REF_INVALID"],
        [`../${randomUUID()}`, owner, "SAVED_QUESTION_KEY_ID_INVALID"]
      ] as const) {
        const refused = await store.store(id, identity, generateDek()).then(() => null, (error: unknown) => error);
        expect(refused, `${kind} ${code}`).toBeInstanceOf(TypeError);
        expect((refused as Error).message, kind).toBe(code);
      }
      for (const [id, identity] of [[NOT_V4, owner], [randomUUID(), { ...owner, userId: NOT_V4 }], [randomUUID(), { ...owner, ownerRef: NOT_V4 }]] as const) {
        await expect(store.load(id, identity), kind).rejects.toBeInstanceOf(SavedQuestionKeyUnresolvedError);
      }
      for (const call of [() => store.exists(NOT_V4), () => store.ownerRef(NOT_V4), () => store.listByOwner(NOT_V4), () => store.destroy(NOT_V4),
        () => store.destroy(`..${sep}users`)]) {
        await expect(call(), kind).rejects.toBeInstanceOf(SavedQuestionKeyUnresolvedError);
      }
      // A key must be a key: 32 bytes.
      await expect(store.store(randomUUID(), owner, generateDek().subarray(0, 16)), kind).rejects.toThrow("SAVED_QUESTION_KEY_INVALID");
    }
    expect({ loads, events, paths }).toEqual({ loads: [], events: [], paths: [] });
    for (const [kind, store] of stores) {
      const id = randomUUID();
      const key = generateDek();
      await store.store(id, owner, key);
      const refused = await store.store(id, owner, generateDek()).then(() => null, (error: unknown) => error);
      expect(refused, kind).toBeInstanceOf(TypeError);
      expect((refused as Error).message, kind).toBe("SAVED_QUESTION_KEY_EXISTS");
      expect((await store.load(id, owner)).equals(key), kind).toBe(true);
    }
  });

  it("zeroes the account key it loads, in store and in load", async () => {
    const { users, person, root } = await world();
    const owner = await person();
    const loaded: Buffer[] = [];
    const spying: ReadableUserDekStore = {
      store: async (userId, dek) => users.store(userId, dek), destroy: async (userId) => users.destroy(userId),
      exists: async (userId) => users.exists(userId),
      load: async (userId) => { const key = await users.load(userId); vi.spyOn(key, "fill"); loaded.push(key); return key; }
    };
    for (const store of [new FileSavedQuestionKeyStore(root, spying), new MemorySavedQuestionKeyStore(spying)]) {
      const id = randomUUID();
      await store.store(id, owner, generateDek());
      (await store.load(id, owner)).fill(0);
      // A load that does not open (another owner's key named) zeroes the key it loaded too.
      await expect(store.load(id, { ...owner, userId: (await person()).userId })).rejects.toBeInstanceOf(SavedQuestionKeyUnresolvedError);
    }
    expect(loaded).toHaveLength(6);
    for (const key of loaded) {
      expect(key.fill).toHaveBeenCalledWith(0);
      expect(key.every((byte) => byte === 0)).toBe(true);
    }
  });

  it("carries no id, path or key bytes in any error it raises", async () => {
    const { root, users, person } = await world();
    const owner = await person();
    const id = randomUUID();
    const key = generateDek();
    const errors: unknown[] = [];
    const caught = async (run: () => Promise<unknown>) => { await run().then(() => errors.push(null), (error: unknown) => errors.push(error)); };
    const store = new FileSavedQuestionKeyStore(root, users);
    await caught(() => store.load(id, owner));
    await caught(() => store.ownerRef(id));
    await caught(() => store.store(NOT_V4, owner, key));
    await store.store(id, owner, key);
    await caught(() => store.store(id, owner, key));
    await caught(() => store.load(id, { ...owner, ownerRef: randomUUID() }));
    for (const failure of ["temp-sync", "directory-sync"] as const) {
      await caught(() => new FileSavedQuestionKeyStore(root, users, observing([], [], new Set([failure]))).store(randomUUID(), owner, key));
    }
    await caught(() => new FileSavedQuestionKeyStore(root, users, observing([], [], new Set(["temp-sync", "cleanup"]))).store(randomUUID(), owner, key));
    await caught(() => new FileSavedQuestionKeyStore(root, users, observing([], [], new Set(["unlink"]))).destroy(id));
    // A real file-system failure names its path in its own message: the store raises its code instead. (A write whose folder cannot be
    // made reads back as uncertain, as the run keys' does: the readback cannot tell that nothing was published.)
    const blocked = await mkdtemp(join(tmpdir(), "debateai-saved-question-blocked-"));
    roots.push(blocked);
    await writeFile(join(blocked, FOLDER), "not a folder", { mode: 0o600 });
    const broken = new FileSavedQuestionKeyStore(blocked, users);
    await caught(() => broken.store(randomUUID(), owner, key));
    await caught(() => broken.destroy(id));
    await caught(() => broken.exists(id));
    await caught(() => broken.listByOwner(owner.ownerRef));
    expect(errors.filter((error) => error === null)).toEqual([]);
    expect(errors.map((error) => (error as { code?: string }).code ?? (error as Error).message)).toEqual([
      "SAVED_QUESTION_KEY_UNRESOLVED", "SAVED_QUESTION_KEY_UNRESOLVED", "SAVED_QUESTION_KEY_ID_INVALID", "SAVED_QUESTION_KEY_EXISTS",
      "SAVED_QUESTION_KEY_UNRESOLVED", "SAVED_QUESTION_KEY_STORE_FAILED", "SAVED_QUESTION_KEY_STORE_DURABILITY_UNCERTAIN",
      "SAVED_QUESTION_KEY_STORE_CLEANUP_FAILED", "SAVED_QUESTION_KEY_DESTROY_FAILED",
      "SAVED_QUESTION_KEY_STORE_DURABILITY_UNCERTAIN", "SAVED_QUESTION_KEY_DESTROY_FAILED", "SAVED_QUESTION_KEY_STORE_FAILED",
      "SAVED_QUESTION_KEY_UNRESOLVED"
    ]);
    const secrets = [root, blocked, id, owner.userId, owner.ownerRef, FOLDER, KEY_FILE, key.toString("hex"), key.toString("base64")];
    for (const error of errors as Error[]) {
      const said = `${error.message} ${JSON.stringify(error)} ${String((error as { cause?: unknown }).cause ?? "")}`;
      for (const secret of secrets) expect(said, `${error.message} ${secret}`).not.toContain(secret);
    }
  });
});
