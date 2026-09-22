/**
 * V-3 — `pnpm keys:rotate-kek`, the decision logic.
 *
 * The command is driven entirely through seams: a `RotatableKeyStore` per file
 * store and a `SupportKeyRotationRepository` for the two database columns. That
 * is what lets the counting, the ordering, the batching, the idempotence and
 * the failure exit be proved here without a database — `tests/integration/
 * support-kek-rotation-database.test.ts` then proves the Postgres half.
 *
 * No real key material: every key in this file is generated into a temporary
 * directory that is removed afterwards.
 */
import { chmod, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FilePublicationKeyStore,
  FileUserDekStore,
  generateDek,
  loadKek
} from "../../packages/crypto/src/index.js";
import type { KekHandle } from "../../packages/crypto/src/index.js";
import { createSupportKeyPort } from "../../apps/api/src/support/keys.js";
import {
  renderRotationReport,
  rotateFileStore,
  rotateSupportKeys,
  rotationFailed,
  SUPPORT_ROTATION_BATCH_SIZE
} from "../../apps/runner/src/rotate-kek.js";
import type {
  SupportKeyReplacement,
  SupportKeyRotationRepository,
  SupportWrappedKeyRow
} from "../../apps/runner/src/rotate-kek.js";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "33333333-3333-4333-8333-333333333333";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function throwawayKek(directory: string, name: string): Promise<KekHandle> {
  const path = join(directory, name);
  await writeFile(path, generateDek(), { mode: 0o600 });
  await chmod(path, 0o600);
  await chmod(directory, 0o700);
  return loadKek(path);
}

async function supportKekPath(directory: string, name: string): Promise<string> {
  const holder = join(directory, name);
  await mkdir(holder, { recursive: true, mode: 0o700 });
  await chmod(holder, 0o700);
  const path = join(holder, "support-kek.bin");
  await writeFile(path, generateDek(), { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

/**
 * An in-memory stand-in for the two `bytea` columns. It records the batches it
 * was given so the test can prove the transaction boundary the real repository
 * owns, and it refuses a replacement whose "previous" bytes no longer match —
 * the same optimistic condition the SQL carries, so a shred landing mid-rotation
 * cannot be clobbered.
 */
type MutableRow = {
  kind: "session" | "case";
  ref: string;
  wrappedKey: Uint8Array;
  destroyed: boolean;
};

class FakeSupportKeyRepository implements SupportKeyRotationRepository {
  readonly batches: number[] = [];
  readonly #rows: MutableRow[];

  constructor(rows: readonly SupportWrappedKeyRow[]) {
    this.#rows = rows.map((row) => ({ ...row }));
  }

  rows(): readonly SupportWrappedKeyRow[] {
    return this.#rows.map((row) => ({ ...row }));
  }

  async listWrappedKeys(): Promise<readonly SupportWrappedKeyRow[]> {
    return this.#rows.map((row) => ({ ...row }));
  }

  async replaceWrappedKeys(replacements: readonly SupportKeyReplacement[]): Promise<number> {
    this.batches.push(replacements.length);
    let changed = 0;
    for (const replacement of replacements) {
      const row = this.#rows.find((candidate) =>
        candidate.kind === replacement.kind && candidate.ref === replacement.ref);
      if (row === undefined || row.destroyed) continue;
      if (!Buffer.from(row.wrappedKey).equals(Buffer.from(replacement.previous))) continue;
      row.wrappedKey = Buffer.from(replacement.next);
      changed += 1;
    }
    return changed;
  }
}

describe("V-3 rotate: a file store", () => {
  it("counts what it did and verifies every record under the new KEK alone", async () => {
    const directory = await temporaryDirectory("debateai-rotate-files-");
    const original = await throwawayKek(directory, "kek.bin");
    const replacement = await throwawayKek(directory, "kek-new.bin");
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });

    await new FileUserDekStore(root, original).store(USER_A, generateDek());
    await new FileUserDekStore(root, original).store(USER_B, generateDek());

    const store = new FileUserDekStore(root, { current: replacement, previous: original });
    const report = await rotateFileStore("user-deks", store);
    expect(report).toMatchObject({
      store: "user-deks",
      counts: { rewrapped: 2, alreadyCurrent: 0, tombstonesSkipped: 0, unreadable: 0 },
      verified: 2
    });
    expect(rotationFailed([report])).toBe(false);
  });

  it("is idempotent: the second pass re-wraps nothing and still verifies", async () => {
    const directory = await temporaryDirectory("debateai-rotate-files-twice-");
    const original = await throwawayKek(directory, "kek.bin");
    const replacement = await throwawayKek(directory, "kek-new.bin");
    const root = join(directory, "publication-keys");
    await mkdir(root, { mode: 0o700 });
    await new FilePublicationKeyStore(root, original).store(USER_A, generateDek());

    const store = new FilePublicationKeyStore(root, {
      current: replacement, previous: original
    });
    expect((await rotateFileStore("publication-keys", store)).counts.rewrapped).toBe(1);
    const second = await rotateFileStore("publication-keys", store);
    expect(second.counts).toMatchObject({ rewrapped: 0, alreadyCurrent: 1, unreadable: 0 });
    expect(second.verified).toBe(1);
  });

  it("counts an unreadable record instead of stopping, and fails the run", async () => {
    const directory = await temporaryDirectory("debateai-rotate-files-unreadable-");
    const original = await throwawayKek(directory, "kek.bin");
    const stranger = await throwawayKek(directory, "kek-stranger.bin");
    const replacement = await throwawayKek(directory, "kek-new.bin");
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });
    await new FileUserDekStore(root, original).store(USER_A, generateDek());
    await new FileUserDekStore(root, stranger).store(USER_B, generateDek());

    // Only the original is held as previous, so USER_B's record opens under
    // neither key. The pass must still finish USER_A and then fail the run.
    const store = new FileUserDekStore(root, { current: replacement, previous: original });
    const report = await rotateFileStore("user-deks", store);
    expect(report.counts.rewrapped).toBe(1);
    expect(report.counts.unreadable).toBe(1);
    expect(report.unreadableRefs).toEqual([USER_B]);
    expect(rotationFailed([report])).toBe(true);
    // The readable one really did move.
    await expect(new FileUserDekStore(root, replacement).load(USER_A)).resolves.toBeInstanceOf(Buffer);
  });

  it("reports an empty store as a clean pass", async () => {
    const directory = await temporaryDirectory("debateai-rotate-files-empty-");
    const kek = await throwawayKek(directory, "kek.bin");
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });
    const report = await rotateFileStore("user-deks", new FileUserDekStore(root, kek));
    expect(report.counts).toMatchObject({ rewrapped: 0, alreadyCurrent: 0, unreadable: 0 });
    expect(report.verified).toBe(0);
    expect(rotationFailed([report])).toBe(false);
  });
});

describe("V-3 rotate: the support rows behind the repository seam", () => {
  async function ports(directory: string): Promise<Readonly<{
    duringPath: string;previousPath: string;
  }>> {
    return {
      duringPath: await supportKekPath(directory, "current"),
      previousPath: await supportKekPath(directory, "previous")
    };
  }

  it("re-wraps the rows the previous KEK opens and skips tombstones", async () => {
    const directory = await temporaryDirectory("debateai-rotate-support-");
    const { duringPath, previousPath } = await ports(directory);

    const before = await createSupportKeyPort({ supportKekPath: previousPath });
    const session = await before.createDataKey({ kind: "session", ref: USER_A });
    const supportCase = await before.createDataKey({ kind: "case", ref: USER_B });
    const rows: SupportWrappedKeyRow[] = [
      { kind: "session", ref: USER_A, wrappedKey: Buffer.from(session.wrapped.bytes), destroyed: false },
      { kind: "case", ref: USER_B, wrappedKey: Buffer.from(supportCase.wrapped.bytes), destroyed: false },
      // SUP-07 tombstone: destroyed, 61 zero bytes. Never re-wrapped.
      { kind: "session", ref: USER_B, wrappedKey: Buffer.alloc(61), destroyed: true }
    ];
    session.close();
    supportCase.close();
    await before.close();

    const repository = new FakeSupportKeyRepository(rows);
    const during = await createSupportKeyPort({
      supportKekPath: duringPath, previousSupportKekPath: previousPath
    });
    const report = await rotateSupportKeys(repository, during);
    expect(report.counts).toMatchObject({
      rewrapped: 2, alreadyCurrent: 0, tombstonesSkipped: 1, unreadable: 0
    });
    expect(report.verified).toBe(2);
    await during.close();

    // The tombstone is byte-for-byte what it was.
    const after = repository.rows();
    expect(after.find((row) => row.destroyed)?.wrappedKey).toEqual(Buffer.alloc(61));
    // And the two live rows now open under the new KEK alone.
    const alone = await createSupportKeyPort({ supportKekPath: duringPath });
    for (const row of after.filter((candidate) => !candidate.destroyed)) {
      await expect(alone.unwrapDataKey(
        { kind: row.kind, ref: row.ref }, row.wrappedKey
      )).resolves.toBeInstanceOf(Buffer);
    }
    await alone.close();
  });

  it("is idempotent and resumable: a second pass changes nothing", async () => {
    const directory = await temporaryDirectory("debateai-rotate-support-twice-");
    const { duringPath, previousPath } = await ports(directory);
    const before = await createSupportKeyPort({ supportKekPath: previousPath });
    const lease = await before.createDataKey({ kind: "session", ref: USER_A });
    const repository = new FakeSupportKeyRepository([
      { kind: "session", ref: USER_A, wrappedKey: Buffer.from(lease.wrapped.bytes), destroyed: false }
    ]);
    lease.close();
    await before.close();

    const during = await createSupportKeyPort({
      supportKekPath: duringPath, previousSupportKekPath: previousPath
    });
    expect((await rotateSupportKeys(repository, during)).counts.rewrapped).toBe(1);
    const settled = repository.rows();
    const second = await rotateSupportKeys(repository, during);
    expect(second.counts).toMatchObject({ rewrapped: 0, alreadyCurrent: 1, unreadable: 0 });
    expect(repository.rows()).toEqual(settled);
    await during.close();
  });

  it("refuses a row neither key opens, counts it, and fails the run", async () => {
    const directory = await temporaryDirectory("debateai-rotate-support-stranger-");
    const { duringPath, previousPath } = await ports(directory);
    const strangerPath = await supportKekPath(directory, "stranger");
    const stranger = await createSupportKeyPort({ supportKekPath: strangerPath });
    const lease = await stranger.createDataKey({ kind: "session", ref: USER_A });
    const repository = new FakeSupportKeyRepository([
      { kind: "session", ref: USER_A, wrappedKey: Buffer.from(lease.wrapped.bytes), destroyed: false }
    ]);
    lease.close();
    await stranger.close();

    const during = await createSupportKeyPort({
      supportKekPath: duringPath, previousSupportKekPath: previousPath
    });
    const report = await rotateSupportKeys(repository, during);
    expect(report.counts.unreadable).toBe(1);
    expect(report.unreadableRefs).toEqual([`session:${USER_A}`]);
    expect(rotationFailed([report])).toBe(true);
    await during.close();
  });

  it("writes in batches, because every UPDATE re-runs the shred-integrity check", async () => {
    const directory = await temporaryDirectory("debateai-rotate-support-batch-");
    const { duringPath, previousPath } = await ports(directory);
    const before = await createSupportKeyPort({ supportKekPath: previousPath });
    const rows: SupportWrappedKeyRow[] = [];
    for (let index = 0; index < SUPPORT_ROTATION_BATCH_SIZE + 3; index += 1) {
      const ref = `${index.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
      const lease = await before.createDataKey({ kind: "session", ref });
      rows.push({
        kind: "session", ref, wrappedKey: Buffer.from(lease.wrapped.bytes), destroyed: false
      });
      lease.close();
    }
    await before.close();

    const repository = new FakeSupportKeyRepository(rows);
    const during = await createSupportKeyPort({
      supportKekPath: duringPath, previousSupportKekPath: previousPath
    });
    const report = await rotateSupportKeys(repository, during);
    expect(report.counts.rewrapped).toBe(rows.length);
    // One transaction per batch, never one per row: the integrity assertion is
    // a full-table scan that serialises on a guard row.
    expect(repository.batches).toEqual([SUPPORT_ROTATION_BATCH_SIZE, 3]);
    await during.close();
  });
});

/**
 * The rehearsal V-3 asks for, as an automated test: take a COPY of a populated
 * custody tree, rotate it, prove every record still opens, and prove the old KEK
 * alone now opens nothing. It runs against a `mkdtemp` copy and never touches
 * any real custody folder.
 */
describe("V-3 rotate: the rehearsal, on a throwaway copy", () => {
  it("rotates a copy of a populated tree, and the old KEK then opens nothing", async () => {
    const directory = await temporaryDirectory("debateai-rehearsal-");
    const oldKek = await throwawayKek(directory, "kek.bin");
    const newKek = await throwawayKek(directory, "kek-new.bin");
    const oldCorpusKek = await throwawayKek(directory, "corpus-kek.bin");
    const newCorpusKek = await throwawayKek(directory, "corpus-kek-new.bin");
    const oldSupportPath = await supportKekPath(directory, "support-old");
    const newSupportPath = await supportKekPath(directory, "support-new");

    // --- a live-shaped tree under the OLD keys --------------------------------
    const live = join(directory, "live");
    const users = join(live, "user-deks");
    const publications = join(live, "publication-keys");
    await mkdir(users, { recursive: true, mode: 0o700 });
    await mkdir(publications, { recursive: true, mode: 0o700 });
    const userDeks = new Map<string, Buffer>();
    for (const userId of [USER_A, USER_B]) {
      const dek = generateDek();
      userDeks.set(userId, Buffer.from(dek));
      await new FileUserDekStore(users, oldKek).store(userId, dek);
    }
    const publicationKey = generateDek();
    await new FilePublicationKeyStore(publications, oldCorpusKek)
      .store(USER_A, publicationKey);

    const oldSupport = await createSupportKeyPort({ supportKekPath: oldSupportPath });
    const lease = await oldSupport.createDataKey({ kind: "session", ref: USER_A });
    const sealed = oldSupport.seal(
      { kind: "session", ref: USER_A }, lease.dataKey, Buffer.from("rehearsal", "utf8")
    );
    const repository = new FakeSupportKeyRepository([
      { kind: "session", ref: USER_A, wrappedKey: Buffer.from(lease.wrapped.bytes), destroyed: false }
    ]);
    lease.close();
    await oldSupport.close();

    // --- the COPY the rehearsal runs on ---------------------------------------
    const copy = join(directory, "copy");
    await cp(live, copy, { recursive: true });
    const copiedUsers = join(copy, "user-deks");
    const copiedPublications = join(copy, "publication-keys");

    // --- rotate ---------------------------------------------------------------
    const duringSupport = await createSupportKeyPort({
      supportKekPath: newSupportPath, previousSupportKekPath: oldSupportPath
    });
    const reports = [
      await rotateFileStore("user-deks", new FileUserDekStore(
        copiedUsers, { current: newKek, previous: oldKek }
      )),
      await rotateFileStore("publication-keys", new FilePublicationKeyStore(
        copiedPublications, { current: newCorpusKek, previous: oldCorpusKek }
      )),
      await rotateSupportKeys(repository, duringSupport)
    ];
    await duringSupport.close();
    expect(rotationFailed(reports)).toBe(false);
    expect(reports.map((report) => report.counts.rewrapped)).toEqual([2, 1, 1]);
    expect(reports.map((report) => report.counts.unreadable)).toEqual([0, 0, 0]);

    // --- everything still opens, under the NEW keys alone ---------------------
    const rotatedUsers = new FileUserDekStore(copiedUsers, newKek);
    for (const [userId, dek] of userDeks) {
      expect(await rotatedUsers.load(userId)).toEqual(dek);
    }
    expect((await new FilePublicationKeyStore(copiedPublications, newCorpusKek)
      .load(USER_A)).key).toEqual(publicationKey);
    const newSupport = await createSupportKeyPort({ supportKekPath: newSupportPath });
    const rotatedRow = repository.rows()[0]!;
    const rotatedDataKey = await newSupport.unwrapDataKey(
      { kind: "session", ref: USER_A }, rotatedRow.wrappedKey
    );
    // The CONTENT was never re-encrypted: the same ciphertext still opens.
    expect(newSupport.open(
      { kind: "session", ref: USER_A }, rotatedDataKey, sealed
    ).toString("utf8")).toBe("rehearsal");
    await newSupport.close();

    // --- and the OLD keys alone now open nothing ------------------------------
    const retiredUsers = new FileUserDekStore(copiedUsers, oldKek);
    for (const userId of userDeks.keys()) {
      await expect(retiredUsers.load(userId)).rejects.toThrowError(
        expect.objectContaining({ code: "KEK_UNRESOLVED" })
      );
    }
    await expect(new FilePublicationKeyStore(copiedPublications, oldCorpusKek)
      .load(USER_A)).rejects.toThrowError(
      expect.objectContaining({ code: "PUBLICATION_KEY_UNRESOLVED" })
    );
    const retiredSupport = await createSupportKeyPort({ supportKekPath: oldSupportPath });
    await expect(retiredSupport.unwrapDataKey(
      { kind: "session", ref: USER_A }, rotatedRow.wrappedKey
    )).rejects.toThrowError(
      expect.objectContaining({ code: "SUPPORT_KEY_AUTHENTICATION_FAILED" })
    );
    await retiredSupport.close();

    // --- the ORIGINAL tree is untouched: a rehearsal rehearses ---------------
    expect(await new FileUserDekStore(users, oldKek).load(USER_A))
      .toEqual(userDeks.get(USER_A));
  });
});

describe("V-3 rotate: what the operator is told", () => {
  it("prints every count and names the failure when a record is unreadable", () => {
    const text = renderRotationReport([
      {
        store: "user-deks",
        counts: { rewrapped: 4, alreadyCurrent: 1, tombstonesSkipped: 0, unreadable: 0 },
        verified: 5,
        unreadableRefs: []
      },
      {
        store: "support",
        counts: { rewrapped: 2, alreadyCurrent: 0, tombstonesSkipped: 3, unreadable: 1 },
        verified: 2,
        unreadableRefs: [`session:${USER_A}`]
      }
    ]);
    for (const needle of [
      "user-deks", "support", "re-wrapped", "already current", "tombstones skipped",
      "unreadable", "verified", `session:${USER_A}`, "KEYS_ROTATE_KEK_FAILED"
    ]) expect(text, needle).toContain(needle);
    // No key material can reach a printed line: the report only ever holds
    // counts and record ids.
    expect(text).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
  });

  it("says OK, and only that, when every store verified", () => {
    const text = renderRotationReport([{
      store: "user-deks",
      counts: { rewrapped: 1, alreadyCurrent: 0, tombstonesSkipped: 0, unreadable: 0 },
      verified: 1,
      unreadableRefs: []
    }]);
    expect(text).toContain("KEYS_ROTATE_KEK_OK");
    expect(text).not.toContain("KEYS_ROTATE_KEK_FAILED");
  });
});
