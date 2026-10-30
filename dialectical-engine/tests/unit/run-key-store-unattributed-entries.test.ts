import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

/**
 * NV-10 (security-audit run 3, K02). A crash between store()'s mkdir and its rename, or an interrupted recursive
 * destroy, leaves a run directory with no published content-key.v1.json. The store-wide listing used to throw on it,
 * so one such directory stalled EVERY owner's account erasure after PREPARE, and the three removers (which check the
 * owner first) could never remove it. Now the listing skips record-less directories and non-run names and reports a
 * count, and a remover that holds DB authority for the run id destroys it. Everything that IS a published record, or
 * cannot be trusted (unparsable, custody-invalid, a run-named file or link), still fails closed.
 *
 * Namespace imports (and a dynamic import for the new reporter module), so a missing member fails its own row instead
 * of the file's link step. Synthetic UUIDv4 principals only; every case gets its own mkdtemp root.
 */
import * as keyStore from "../../packages/crypto/src/index.js";
import * as erasure from "../../packages/db/src/account-erasure.js";

type AccountRepository = ConstructorParameters<typeof erasure.AccountErasureCoordinator>[0];
type UserDeks = ConstructorParameters<typeof erasure.AccountErasureCoordinator>[1];
type PrivateRepository = ConstructorParameters<typeof erasure.PrivateRunErasureCoordinator>[0];

/** Test-local, as in tests/unit/s6-content-encryption.test.ts. */
class MemoryUserDekStore implements keyStore.ReadableUserDekStore {
  readonly #keys = new Map<string, Buffer>();

  async store(userId: string, dek: Uint8Array): Promise<void> {
    this.#keys.set(userId, Buffer.from(dek));
  }

  async load(userId: string): Promise<Buffer> {
    const key = this.#keys.get(userId);
    if (key === undefined) throw new Error("USER_DEK_NOT_FOUND");
    return Buffer.from(key);
  }

  async exists(userId: string): Promise<boolean> {
    return this.#keys.has(userId);
  }

  async destroy(userId: string): Promise<"DESTROYED" | "ALREADY_ABSENT"> {
    return this.#keys.delete(userId) ? "DESTROYED" : "ALREADY_ABSENT";
  }
}

const E = "22222222-2222-4222-8222-222222222222";
const E2 = "66666666-6666-4666-8666-666666666666";
const SOURCE = Object.freeze({
  ip: "background",
  userAgent: "run-key-store-unattributed-entries",
  requestId: "44444444-4444-4444-8444-444444444444"
}) as unknown as Parameters<erasure.AccountErasureCoordinator["reconcile"]>[0];
const UNRESOLVED = Object.freeze({
  name: "RunContentKeyUnresolvedError",
  message: "RUN_CONTENT_KEY_UNRESOLVED",
  code: "RUN_CONTENT_KEY_UNRESOLVED"
});

let root: string;
let users: MemoryUserDekStore;
let keys: keyStore.FileRunContentKeyStore;
let onUnattributedEntries: Mock<(count: number) => void>;
let userA: string;
let ownerA: string;
let userB: string;
let ownerB: string;
let runA: string;
let orphan1: string;
let orphan2: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "debateai-nv10-run-keys-"));
  users = new MemoryUserDekStore();
  userA = randomUUID();
  ownerA = randomUUID();
  userB = randomUUID();
  ownerB = randomUUID();
  runA = randomUUID();
  orphan1 = randomUUID();
  orphan2 = randomUUID();
  await users.store(userA, keyStore.generateDek());
  onUnattributedEntries = vi.fn<(count: number) => void>();
  keys = new keyStore.FileRunContentKeyStore(root, users, async () => userA, undefined, { onUnattributedEntries });
  await keys.store(runA, { userId: userA, ownerRef: ownerA }, keyStore.generateDek());
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Crash residue under runs/: orphan1/ with only an unpublished temporary, an empty orphan2/, and lost+found. */
async function createResidue(): Promise<void> {
  const runs = join(root, "runs");
  await mkdir(join(runs, orphan1), { mode: 0o700 });
  await writeFile(join(runs, orphan1, "content-key.v1.json.tmp"), "", { mode: 0o600 });
  await mkdir(join(runs, orphan2), { mode: 0o700 });
  await mkdir(join(runs, "lost+found"), { mode: 0o700 });
}

/** A UUIDv4 run directory whose published record is the unparsable `{}` (a real file, under custody modes). */
async function createUnparsableRecord(): Promise<string> {
  const runId = randomUUID();
  await mkdir(join(root, "runs", runId), { mode: 0o700 });
  await writeFile(join(root, "runs", runId, "content-key.v1.json"), "{}", { mode: 0o600 });
  return runId;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

/** Test 4's stubs: a PREPARED erasure of `ownerRef`, with C-1's support port (no support sessions). */
function accountHarness(manifest: Readonly<{ ownerRef: string; runIds: readonly string[] }>) {
  let finalized = false;
  const finalize = vi.fn(async () => {
    finalized = true;
    return "COMMITTED" as const;
  });
  const repository = {
    pendingWork: async () => [E],
    preview: async () => null,
    status: async () => finalized ? "CLEANED" : "PREPARED",
    cleanupManifest: async () => ({
      userId: userA,
      ownerRef: manifest.ownerRef,
      runIds: [...manifest.runIds],
      legacyRunIds: [],
      publishedRunIds: [],
      currentPublicationRefs: [],
      cleanupPublicationRefs: [],
      deletePublicDebates: false
    }),
    completionNotificationsReady: async () => true,
    withNotificationLease: async (_userId: string, use: () => Promise<unknown>) => use(),
    finalize
  } as unknown as AccountRepository;
  const usersStub = { destroy: vi.fn(async () => "DESTROYED" as const), exists: async () => false };
  const support = {
    shredOwnerForErasure: vi.fn(async () => "NONE" as const),
    liveOwnerKeyCount: vi.fn(async () => 0)
  };
  const coordinator = new erasure.AccountErasureCoordinator(
    repository, usersStub as unknown as UserDeks, keys, undefined, support
  );
  return { coordinator, finalize, usersStub, support };
}

describe("NV-10 · the run-key store listing skips record-less and non-run entries", () => {
  it("1. listByOwner skips record-less and non-run entries and reports the count", async () => {
    await createResidue();
    expect(await keys.listByOwner(ownerA)).toEqual([runA]);
    expect(onUnattributedEntries).toHaveBeenCalledTimes(1);
    expect(onUnattributedEntries).toHaveBeenCalledWith(3);
  });

  it("2. ownerRef of a record-less directory is distinguishable but keeps its public shape", async () => {
    await createResidue();
    const error = await rejection(keys.ownerRef(orphan1));
    expect(keyStore.isRunContentKeyRecordMissing(error)).toBe(true);
    expect(error).toMatchObject(UNRESOLVED);
    expect(error).toBeInstanceOf(keyStore.RunContentKeyUnresolvedError);
    expect(keyStore.isRunContentKeyRecordMissing({ reason: "RECORD_MISSING" })).toBe(false);
    expect(keyStore.isRunContentKeyRecordMissing(undefined)).toBe(false);
  });

  it("3. a run-named FILE still fails closed (control)", async () => {
    await writeFile(join(root, "runs", randomUUID()), "", { mode: 0o600 });
    await expect(keys.listByOwner(ownerA)).rejects.toMatchObject(UNRESOLVED);
    expect(onUnattributedEntries).not.toHaveBeenCalled();
  });

  it("3b. an unparsable record still blocks, and is not record-missing", async () => {
    const unparsable = await createUnparsableRecord();
    await expect(keys.listByOwner(ownerA)).rejects.toMatchObject(UNRESOLVED);
    const error = await rejection(keys.ownerRef(unparsable));
    expect(error).toMatchObject(UNRESOLVED);
    expect(keyStore.isRunContentKeyRecordMissing(error)).toBe(false);
    expect(onUnattributedEntries).not.toHaveBeenCalled();
  });

  it("3c. a custody-invalid record still blocks", async () => {
    await chmod(join(root, "runs", runA, "content-key.v1.json"), 0o644);
    await expect(keys.listByOwner(ownerA)).rejects.toMatchObject({
      name: "CryptoCustodyError",
      code: "SECRET_CUSTODY_INVALID"
    });
    expect(onUnattributedEntries).not.toHaveBeenCalled();
  });

  it("3d. a symlink at a run path is not record-missing", async () => {
    const linked = randomUUID();
    await symlink(join(root, "nowhere"), join(root, "runs", linked));
    const error = await rejection(keys.ownerRef(linked));
    expect(error).toMatchObject(UNRESOLVED);
    expect(keyStore.isRunContentKeyRecordMissing(error)).toBe(false);
    await expect(keys.listByOwner(ownerA)).rejects.toMatchObject(UNRESOLVED);
    expect(onUnattributedEntries).not.toHaveBeenCalled();
  });
});

describe("NV-10 · the erasure removers no longer stall on record-less run directories", () => {
  it("4. account erasure completes beside another owner's orphans, and leaves them", async () => {
    await createResidue();
    const h = accountHarness({ ownerRef: ownerA, runIds: [runA] });
    expect(await h.coordinator.reconcile(SOURCE)).toEqual([{ erasureId: E, outcome: "CLEANED" }]);
    expect(h.usersStub.destroy).toHaveBeenCalledTimes(1);
    expect(h.finalize).toHaveBeenCalledTimes(1);
    expect(await keys.exists(runA)).toBe(false);
    expect(await keys.exists(orphan1)).toBe(true);
    expect(await keys.exists(orphan2)).toBe(true);
    expect(onUnattributedEntries).toHaveBeenCalledWith(3);
  });

  it("4b. the erasing owner's own record-less run is destroyed", async () => {
    const ownOrphan = randomUUID();
    await mkdir(join(root, "runs", ownOrphan), { mode: 0o700 });
    const h = accountHarness({ ownerRef: ownerA, runIds: [runA, ownOrphan] });
    expect(await h.coordinator.reconcile(SOURCE)).toEqual([{ erasureId: E, outcome: "CLEANED" }]);
    expect(await keys.exists(runA)).toBe(false);
    expect(await keys.exists(ownOrphan)).toBe(false);
    expect(h.finalize).toHaveBeenCalledWith(expect.objectContaining({
      destroyedRunKeyCount: 2,
      alreadyAbsentRunKeyCount: 0
    }));
  });

  it("5. provision cleanup removes its own record-less orphan", async () => {
    await createResidue();
    const completeRunKeyProvisionCleanup = vi.fn(async () => true);
    const coordinator = new erasure.AccountErasureCoordinator({
      claimRunKeyProvisionCleanup: async () => [{ runId: orphan1, userId: userB, ownerRef: ownerB, claimToken: "t" }],
      completeRunKeyProvisionCleanup
    } as unknown as AccountRepository, {} as unknown as UserDeks, keys);
    expect(await coordinator.reconcileRunKeyProvisionIntents()).toEqual([{ runId: orphan1, outcome: "CLEANED" }]);
    expect(completeRunKeyProvisionCleanup).toHaveBeenCalledTimes(1);
    expect(completeRunKeyProvisionCleanup).toHaveBeenCalledWith(orphan1, "t");
    expect(await keys.exists(orphan1)).toBe(false);
    expect(await keys.exists(orphan2)).toBe(true);
  });

  it("5b. provision cleanup still refuses an unparsable record its intent names, and leaves it", async () => {
    const unparsable = await createUnparsableRecord();
    const completeRunKeyProvisionCleanup = vi.fn(async () => true);
    const coordinator = new erasure.AccountErasureCoordinator({
      claimRunKeyProvisionCleanup: async () => [{ runId: unparsable, userId: userB, ownerRef: ownerB, claimToken: "t" }],
      completeRunKeyProvisionCleanup
    } as unknown as AccountRepository, {} as unknown as UserDeks, keys);
    expect(await coordinator.reconcileRunKeyProvisionIntents()).toEqual([{
      runId: unparsable,
      outcome: "INVALID_EVIDENCE",
      diagnosticStage: "run-key-provision-cleanup"
    }]);
    expect(completeRunKeyProvisionCleanup).not.toHaveBeenCalled();
    expect(await keys.exists(unparsable)).toBe(true);
    expect(await readFile(join(root, "runs", unparsable, "content-key.v1.json"), "utf8")).toBe("{}");
  });

  it("6. private-run completion destroys its own record-less run", async () => {
    await createResidue();
    const finalize = vi.fn(async () => "COMMITTED" as const);
    const coordinator = new erasure.PrivateRunErasureCoordinator({
      pendingCleanup: async () => [E2],
      manifest: async () => ({ runId: orphan2, ownerRef: ownerA, cleanupPublicationRefs: [] }),
      status: async () => "PREPARED",
      finalize
    } as unknown as PrivateRepository, keys);
    expect(await coordinator.reconcile(SOURCE)).toEqual([{ erasureId: E2, outcome: "CLEANED" }]);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(await keys.exists(orphan2)).toBe(false);
    expect(await keys.exists(orphan1)).toBe(true);
  });

  it("7. a published record owned by someone else still blocks (control)", async () => {
    await createResidue();
    const h = accountHarness({ ownerRef: ownerB, runIds: [runA] });
    expect(await h.coordinator.reconcile(SOURCE)).toEqual([{ erasureId: E, outcome: "INVALID_EVIDENCE" }]);
    // The :745 listing ran (after C-1's support guard, before the ownership loop) and completed its walk.
    expect(onUnattributedEntries).toHaveBeenCalledTimes(1);
    expect(onUnattributedEntries).toHaveBeenCalledWith(3);
    expect(h.usersStub.destroy).not.toHaveBeenCalled();
    expect(h.support.shredOwnerForErasure).not.toHaveBeenCalled();
    expect(h.finalize).not.toHaveBeenCalled();
    expect(await keys.exists(runA)).toBe(true);
  });
});

describe("NV-10 · the residue is reported once per change, counts only", () => {
  it("8. the reporter logs once per change", async () => {
    const reporter = await import("../../apps/api/src/run-key-store-report.js");
    const lines: string[] = [];
    const report = reporter.createUnattributedEntriesReporter((line) => lines.push(line));
    for (const count of [0, 3, 3, 3, 2, 0, 0, -1, 1.5]) report(count);
    expect(lines).toEqual([
      "[RUN_KEY_STORE_UNATTRIBUTED_ENTRIES] count=3",
      "[RUN_KEY_STORE_UNATTRIBUTED_ENTRIES] count=2",
      "[RUN_KEY_STORE_UNATTRIBUTED_ENTRIES] count=0"
    ]);
  });

  it("9. main.ts wires the reporter into the run-key store", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const start = main.indexOf('boot.runSync("run-content-key-store"');
    expect(start).toBeGreaterThan(-1);
    const ends = [
      main.indexOf("boot.runSync(", start + 1),
      main.indexOf("configureContentEncryption(", start)
    ].filter((at) => at > start);
    expect(ends.length).toBeGreaterThan(0);
    const slice = main.slice(start, Math.min(...ends));
    expect(slice).toContain("new FileRunContentKeyStore(");
    expect(slice).toContain("onUnattributedEntries:createUnattributedEntriesReporter(");
    expect(main).toMatch(/import \{[^}]*\bcreateUnattributedEntriesReporter\b[^}]*\} from "\.\/run-key-store-report\.js";/u);
  });
});
