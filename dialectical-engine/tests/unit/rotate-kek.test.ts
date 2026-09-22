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
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FilePublicationKeyStore,
  FileUserDekStore,
  generateDek,
  kekId,
  loadKek
} from "../../packages/crypto/src/index.js";
import type { KekHandle } from "../../packages/crypto/src/index.js";
import {
  createSupportKeyPort, type SupportContentContext
} from "../../apps/api/src/support/keys.js";
import {
  renderRotationReport,
  rotateFileStore,
  rotateSupportKeys,
  rotationFailed
} from "../../apps/runner/src/rotate-kek.js";
import {
  keyRotationEnvironmentCode,
  keyRotationRefusalLine,
  publicationStoreDecision
} from "../../apps/runner/src/rotate-kek-cli.js";
import { assertSupportPrincipalRole } from "../../packages/db/src/index.js";
import { parseKeyRotationEnvironment } from "../../packages/register/src/runtime-environment.js";
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

  /** What a concurrent shred does: the row becomes an irreversible tombstone. */
  destroy(ref: string): void {
    const row = this.#rows.find((candidate) => candidate.ref === ref);
    if (row === undefined) return;
    row.destroyed = true;
    row.wrappedKey = Buffer.alloc(61);
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
    const report = await rotateFileStore("user-deks", store, kekId(replacement));
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
    expect((await rotateFileStore("publication-keys", store, kekId(replacement))).counts.rewrapped).toBe(1);
    const second = await rotateFileStore("publication-keys", store, kekId(replacement));
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
    const report = await rotateFileStore("user-deks", store, kekId(replacement));
    expect(report.counts.rewrapped).toBe(1);
    expect(report.counts.unreadable).toBe(1);
    // M1: the code travels with the record, because "unreadable" covers three
    // different faults and the operator is told to investigate these. Here the
    // record is v2 and its LABEL names a key this process does not hold — a
    // configuration fault, not a cryptographic one, and the operator's next
    // move differs accordingly.
    expect(report.unreadableRefs).toEqual([{ ref: USER_B, code: "KEK_UNRESOLVED" }]);
    expect(rotationFailed([report])).toBe(true);
    // The readable one really did move.
    await expect(new FileUserDekStore(root, replacement).load(USER_A)).resolves.toBeInstanceOf(Buffer);
  });

  it("reports a genuinely empty store as a clean pass", async () => {
    const directory = await temporaryDirectory("debateai-rotate-files-empty-");
    const kek = await throwawayKek(directory, "kek.bin");
    const root = join(directory, "user-deks");
    // The ROOT exists; no record has been written into it yet. That is empty.
    await mkdir(root, { mode: 0o700 });
    const report = await rotateFileStore("user-deks", new FileUserDekStore(root, kek), kekId(kek));
    expect(report.counts).toMatchObject({ rewrapped: 0, alreadyCurrent: 0, unreadable: 0 });
    expect(report.verified).toBe(0);
    expect(rotationFailed([report])).toBe(false);
  });

  /**
   * A2(b) of the combined review. "Not there" is never "empty". A mistyped
   * USER_DEK_STORE_PATH used to list zero records and report a clean pass, and
   * the runbook keys key-retirement to that pass.
   */
  it("refuses a store root that does not exist, instead of calling it empty", async () => {
    const directory = await temporaryDirectory("debateai-rotate-files-absent-");
    const kek = await throwawayKek(directory, "kek.bin");
    const absent = join(directory, "user-deks-typo");
    const store = new FileUserDekStore(absent, kek);
    await expect(store.listKeyRefs()).rejects.toThrowError(
      expect.objectContaining({ code: "USER_DEK_STORE_ROOT_ABSENT" })
    );
    await expect(
      new FilePublicationKeyStore(absent, kek).listKeyRefs()
    ).rejects.toThrowError(
      expect.objectContaining({ code: "PUBLICATION_KEY_STORE_ROOT_ABSENT" })
    );
  });

  /**
   * M4. The support port already refuses a previous key that IS the current
   * one; the two file stores accepted it silently, and every record would then
   * look already-current whichever key really wrapped it.
   */
  it("refuses a ring whose previous key is the current one", async () => {
    const directory = await temporaryDirectory("debateai-rotate-same-key-");
    const path = join(directory, "kek.bin");
    await writeFile(path, generateDek(), { mode: 0o600 });
    await chmod(path, 0o600);
    await chmod(directory, 0o700);
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });
    const current = loadKek(path);
    const sameBytes = loadKek(path);

    expect(() => new FileUserDekStore(root, { current, previous: sameBytes }))
      .toThrowError(expect.objectContaining({ code: "KEK_RING_NOT_A_CHANGEOVER" }));
    expect(() => new FilePublicationKeyStore(root, { current, previous: current }))
      .toThrowError(expect.objectContaining({ code: "KEK_RING_NOT_A_CHANGEOVER" }));
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

  /**
   * A1 of the combined review, and the worst bug in the package. The support
   * verification pass used `unwrapDataKey`, which is current-then-previous by
   * construction, so a row STILL UNDER THE OLD KEY verified clean and the run
   * printed OK. The operator then retires the old key per the runbook and those
   * rows are unreadable forever.
   *
   * Reachable without anything exotic: an API instance still holding the old key
   * as current writes a row between the re-wrap pass and the verification — the
   * rolling-restart, or simply the wrong order.
   */
  it("fails a row that is still under the OLD key when the verification runs", async () => {
    const directory = await temporaryDirectory("debateai-rotate-support-verify-");
    const { duringPath, previousPath } = await ports(directory);
    const before = await createSupportKeyPort({ supportKekPath: previousPath });
    const settled = await before.createDataKey({ kind: "session", ref: USER_A });
    const straggler = await before.createDataKey({ kind: "session", ref: USER_B });
    const repository = new FakeSupportKeyRepository([
      { kind: "session", ref: USER_A, wrappedKey: Buffer.from(settled.wrapped.bytes), destroyed: false }
    ]);
    settled.close();

    const during = await createSupportKeyPort({
      supportKekPath: duringPath, previousSupportKekPath: previousPath
    });
    // The re-wrap pass sees one row and moves it. Then a process still holding
    // the OLD key as current writes a second row, under the old key.
    const listed = repository.listWrappedKeys.bind(repository);
    let firstCall = true;
    repository.listWrappedKeys = async () => {
      const rows = await listed();
      if (firstCall) { firstCall = false; return rows; }
      return [...rows, {
        kind: "session" as const, ref: USER_B,
        wrappedKey: Buffer.from(straggler.wrapped.bytes), destroyed: false
      }];
    };

    const report = await rotateSupportKeys(repository, during);
    straggler.close();
    await before.close();
    await during.close();

    // The straggler must be reported, not certified. Verifying it through a
    // port that still holds the old key is what made this pass look clean.
    expect(report.counts.unreadable).toBe(1);
    expect(report.unreadableRefs.map((entry) => entry.ref)).toEqual([`session:${USER_B}`]);
    expect(report.verified).toBe(1);
    expect(rotationFailed([report])).toBe(true);
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
    expect(report.unreadableRefs).toEqual([
      { ref: `session:${USER_A}`, code: "SUPPORT_KEY_AUTHENTICATION_FAILED" }
    ]);
    expect(rotationFailed([report])).toBe(true);
    await during.close();
  });

  it("writes in batches, because every UPDATE re-runs the shred-integrity check", async () => {
    const batchSize = 4;
    const directory = await temporaryDirectory("debateai-rotate-support-batch-");
    const { duringPath, previousPath } = await ports(directory);
    const before = await createSupportKeyPort({ supportKekPath: previousPath });
    const rows: SupportWrappedKeyRow[] = [];
    for (let index = 0; index < batchSize + 2; index += 1) {
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
    const report = await rotateSupportKeys(repository, during, batchSize);
    expect(report.counts.rewrapped).toBe(rows.length);
    // One transaction per batch, never one per row: the integrity assertion is
    // a full-table scan that serialises on a guard row.
    expect(repository.batches).toEqual([batchSize, 2]);
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
    const sealedContext = Object.freeze({
      kind: "session-message", sessionId: USER_A,
      messageId: "88888888-8888-4888-8888-888888888888",
      role: "user", outcome: "ANSWER_GROUNDED", purpose: "content"
    }) satisfies SupportContentContext;
    const sealed = oldSupport.sealContent(
      sealedContext, lease.dataKey, Buffer.from("rehearsal", "utf8")
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
      ), kekId(newKek)),
      await rotateFileStore("publication-keys", new FilePublicationKeyStore(
        copiedPublications, { current: newCorpusKek, previous: oldCorpusKek }
      ), kekId(newCorpusKek)),
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
    expect(newSupport.openContent(
      sealedContext, rotatedDataKey, sealed
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

describe("V-3 rotate: a refusal names what is wrong", () => {
  /**
   * M5. A missing or malformed variable used to leave as a ZodError and print
   * as UNKNOWN, which tells an operator nothing. The code names the variable.
   */
  it("names every environment variable a refusal is about", () => {
    expect(keyRotationEnvironmentCode({
      issues: [
        { path: ["SUPPORT_DATABASE_URL"], message: "Invalid url" },
        { path: ["USER_DEK_STORE_PATH"], message: "Required" },
        { path: ["USER_DEK_STORE_PATH"], message: "Required" }
      ]
    })).toBe("KEYS_ROTATE_KEK_ENVIRONMENT_INVALID:SUPPORT_DATABASE_URL,USER_DEK_STORE_PATH");
    // A typed rejection keeps its own code — KEK_UNRESOLVED from the kekPath
    // fields already says exactly what is wrong.
    expect(keyRotationEnvironmentCode(Object.assign(
      new TypeError("KEK_UNRESOLVED"), { code: "KEK_UNRESOLVED" }
    ))).toBe("KEK_UNRESOLVED");
    // And nothing untyped degrades to a prose message.
    expect(keyRotationEnvironmentCode(new Error("some prose about /etc/debateai")))
      .toBe("KEYS_ROTATE_KEK_ENVIRONMENT_INVALID");
  });
});

describe("V-3 rotate: the counts account for every record", () => {
  /**
   * M2. A row the optimistic UPDATE declined used to be counted nowhere, so the
   * counts did not have to sum to the rows seen — which is exactly how a
   * silently dropped record hides.
   */
  it("counts a row a concurrent change declined, and the counts sum to the rows", async () => {
    const directory = await temporaryDirectory("debateai-rotate-declined-");
    const duringPath = await supportKekPath(directory, "current");
    const previousPath = await supportKekPath(directory, "previous");
    const before = await createSupportKeyPort({ supportKekPath: previousPath });
    const first = await before.createDataKey({ kind: "session", ref: USER_A });
    const second = await before.createDataKey({ kind: "session", ref: USER_B });
    const rows: SupportWrappedKeyRow[] = [
      { kind: "session", ref: USER_A, wrappedKey: Buffer.from(first.wrapped.bytes), destroyed: false },
      { kind: "session", ref: USER_B, wrappedKey: Buffer.from(second.wrapped.bytes), destroyed: false }
    ];
    first.close();
    second.close();
    await before.close();

    const repository = new FakeSupportKeyRepository(rows);
    // A real shred lands on the second row between the read and the write: the
    // row is destroyed, so the optimistic UPDATE declines it AND the
    // verification pass then skips it as a tombstone. The other actor won.
    const replace = repository.replaceWrappedKeys.bind(repository);
    repository.replaceWrappedKeys = async (replacements) => {
      repository.destroy(USER_B);
      return replace(replacements);
    };

    const during = await createSupportKeyPort({
      supportKekPath: duringPath, previousSupportKekPath: previousPath
    });
    const report = await rotateSupportKeys(repository, during);
    await during.close();

    expect(report.counts.rewrapped).toBe(1);
    expect(report.counts.declined).toBe(1);
    expect(report.counts.unreadable).toBe(0);
    const { rewrapped, alreadyCurrent, tombstonesSkipped, declined, unreadable } = report.counts;
    // The re-wrap phase puts every row it saw into exactly one of the five
    // counts, so they sum to the rows it saw. (The verification phase can add
    // to `unreadable` afterwards, which is why a failing run need not sum.)
    expect(rewrapped + alreadyCurrent + tombstonesSkipped + declined + unreadable)
      .toBe(rows.length);
    expect(rotationFailed([report])).toBe(false);
  });
});

describe("V-3 rotate: what the operator is told", () => {
  /**
   * A2. A store the command never opened is NOT a clean store, and the runbook
   * keys key-retirement to this answer.
   */
  it("fails the run and says so when a store was not covered", () => {
    const clean = [{
      store: "user-deks",
      kekId: "0123456789abcdef",
      counts: {
        rewrapped: 1, alreadyCurrent: 0, tombstonesSkipped: 0, declined: 0, unreadable: 0
      },
      verified: 1,
      unreadableRefs: []
    }];
    expect(rotationFailed(clean, [])).toBe(false);
    expect(rotationFailed(clean, [
      { store: "publication-keys", code: "PUBLICATION_KEY_PATHS_INCOMPLETE", fatal: true }
    ])).toBe(true);
    const text = renderRotationReport(clean, [
      { store: "publication-keys", code: "PUBLICATION_KEY_PATHS_INCOMPLETE", fatal: true }
    ]);
    expect(text).toContain("NOT COVERED publication-keys PUBLICATION_KEY_PATHS_INCOMPLETE");
    expect(text).toContain("KEYS_ROTATE_KEK_FAILED");
  });

  it("prints every count and names the failure when a record is unreadable", () => {
    const text = renderRotationReport([
      {
        store: "user-deks",
        kekId: "0123456789abcdef",
        counts: {
          rewrapped: 4, alreadyCurrent: 1, tombstonesSkipped: 0, declined: 0, unreadable: 0
        },
        verified: 5,
        unreadableRefs: []
      },
      {
        store: "support",
        kekId: "fedcba9876543210",
        counts: {
          rewrapped: 2, alreadyCurrent: 0, tombstonesSkipped: 3, declined: 1, unreadable: 1
        },
        verified: 2,
        unreadableRefs: [{ ref: `session:${USER_A}`, code: "SUPPORT_KEY_AUTHENTICATION_FAILED" }]
      }
    ]);
    for (const needle of [
      "user-deks", "support", "re-wrapped", "already current", "tombstones skipped",
      "unreadable", "verified", `session:${USER_A}`, "KEYS_ROTATE_KEK_FAILED",
      // M1: the operator is told WHICH fault each record hit.
      "SUPPORT_KEY_AUTHENTICATION_FAILED",
      // M2 and A2: the fifth count, and the key the pass rotated TO.
      "declined by a concurrent change", "0123456789abcdef", "fedcba9876543210"
    ]) expect(text, needle).toContain(needle);
    // No key material can reach a printed line: the report only ever holds
    // counts and record ids.
    expect(text).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
  });

  it("says OK, and only that, when every store verified", () => {
    const text = renderRotationReport([{
      store: "user-deks",
      kekId: "0123456789abcdef",
      counts: {
        rewrapped: 1, alreadyCurrent: 0, tombstonesSkipped: 0, declined: 0, unreadable: 0
      },
      verified: 1,
      unreadableRefs: []
    }]);
    expect(text).toContain("KEYS_ROTATE_KEK_OK");
    expect(text).not.toContain("KEYS_ROTATE_KEK_FAILED");
  });
});

describe("V-3 rotate: least privilege on the database", () => {
  const ROTATION_ENVIRONMENT = Object.freeze({
    KEK_PATH: "/run/secrets/kek",
    USER_DEK_STORE_PATH: "/run/secrets/user-deks",
    SUPPORT_KEK_PATH: "/run/secrets/support-kek",
    SUPPORT_DATABASE_URL: "postgresql://support:pass@127.0.0.1:5432/debateai"
  });

  /**
   * The coordinator's ruling on M3: a key rotation must require only what it
   * uses. It writes two support columns and never touches the runtime pool, so
   * it must not need the runtime credential to start.
   */
  it("starts without the runtime credential", () => {
    const parsed = parseKeyRotationEnvironment({ ...ROTATION_ENVIRONMENT });
    expect(parsed.SUPPORT_DATABASE_URL).toBe(ROTATION_ENVIRONMENT.SUPPORT_DATABASE_URL);
    expect(parsed).not.toHaveProperty("DATABASE_URL");
  });

  it("asserts the support role alone, and leaves the API's two-sided call alone", async () => {
    const cli = await readFile(
      new URL("../../apps/runner/src/rotate-kek-cli.ts", import.meta.url), "utf8"
    );
    // The support-only half, and no runtime pool anywhere in the command.
    expect(cli).toContain("assertSupportPrincipalRole");
    expect(cli).not.toContain("assertSupportDatabaseRole");
    // The RUNTIME url specifically — SUPPORT_DATABASE_URL is the one pool this
    // command legitimately opens, so the check has to name the other one.
    expect(cli).not.toContain("environment.DATABASE_URL");
    expect(cli).not.toContain("runtimePool");
    // The API still makes the two-sided assertion sup-01-boundary.test.ts pins.
    const main = await readFile(
      new URL("../../apps/api/src/main.ts", import.meta.url), "utf8"
    );
    expect(main).toContain("assertSupportDatabaseRole(pool, supportPool)");
  });
});

describe("V-3 rotate: a refusal reaches the operator as a code", () => {
  /**
   * Leftover 1. assertSupportPrincipalRole threw a bare TypeError with no
   * `code`, so a wrong-role run printed KEYS_ROTATE_KEK_REFUSED UNKNOWN — the
   * exact shape M5 exists to eliminate, on the path M3 asked to be typed.
   */
  it("prints the code of a wrong-role refusal, never UNKNOWN", () => {
    const wrongRole = Object.assign(
      new TypeError("SUPPORT_DATABASE_ROLE_INVALID"),
      { code: "SUPPORT_DATABASE_ROLE_INVALID" }
    );
    expect(keyRotationRefusalLine(wrongRole))
      .toBe("KEYS_ROTATE_KEK_REFUSED SUPPORT_DATABASE_ROLE_INVALID");
    // And the assertion really does carry a code, not only a message.
    expect(assertSupportPrincipalRole).toBeTypeOf("function");
    // Anything genuinely untyped still says so rather than inventing a code.
    expect(keyRotationRefusalLine(new Error("prose")))
      .toBe("KEYS_ROTATE_KEK_REFUSED UNKNOWN");
  });
});

describe("V-3 rotate: the publication store follows the API's own rule", () => {
  /**
   * Leftover 2. Declining the publication store ALWAYS failed the run, so a
   * host that never enabled publication could never print KEYS_ROTATE_KEK_OK
   * and could never satisfy the runbook's retirement rule. The API requires the
   * pair only when PUBLICATION_ENABLED=true; the rotation must say the same.
   */
  const CASES = [
    { name: "enabled, pair present", enabled: true, corpus: true, store: true, covered: true, fatal: false },
    { name: "enabled, pair absent", enabled: true, corpus: false, store: false, covered: false, fatal: true },
    { name: "enabled, half-set (corpus only)", enabled: true, corpus: true, store: false, covered: false, fatal: true },
    { name: "enabled, half-set (store only)", enabled: true, corpus: false, store: true, covered: false, fatal: true },
    { name: "not enabled, pair absent", enabled: false, corpus: false, store: false, covered: false, fatal: false },
    { name: "not enabled, half-set (corpus only)", enabled: false, corpus: true, store: false, covered: false, fatal: true },
    { name: "not enabled, half-set (store only)", enabled: false, corpus: false, store: true, covered: false, fatal: true }
  ] as const;

  for (const row of CASES) {
    it(`${row.covered ? "covers" : row.fatal ? "fails" : "declines without failing"} — ${row.name}`, () => {
      const decision = publicationStoreDecision({
        publicationEnabled: row.enabled,
        corpusKekPath: row.corpus ? "/run/secrets/corpus-kek" : undefined,
        publicationKeyStorePath: row.store ? "/run/secrets/publication-keys" : undefined
      });
      expect(decision.covered).toBe(row.covered);
      if (!row.covered) {
        expect(decision.declined?.fatal).toBe(row.fatal);
        expect(decision.declined?.code).toMatch(/^PUBLICATION_KEY_PATHS_/);
      }
    });
  }

  it("lets a host that never enabled publication reach KEYS_ROTATE_KEK_OK", () => {
    const clean = [{
      store: "user-deks",
      kekId: "0123456789abcdef",
      counts: {
        rewrapped: 1, alreadyCurrent: 0, tombstonesSkipped: 0, declined: 0, unreadable: 0
      },
      verified: 1,
      unreadableRefs: []
    }];
    const byConfiguration = [{
      store: "publication-keys", code: "PUBLICATION_KEY_PATHS_ABSENT", fatal: false
    }];
    expect(rotationFailed(clean, byConfiguration)).toBe(false);
    const text = renderRotationReport(clean, byConfiguration);
    expect(text).toContain("declined by configuration publication-keys");
    expect(text).toContain("KEYS_ROTATE_KEK_OK");
    // A half-set pair is still always a failure.
    expect(rotationFailed(clean, [
      { store: "publication-keys", code: "PUBLICATION_KEY_PATHS_INCOMPLETE", fatal: true }
    ])).toBe(true);
  });
});

/**
 * INT2 (SYNC2 into integration), 2026-09-22 — the deferred one-line script.
 *
 * `rotate-kek-cli.ts`, `packages/crypto/SECRET_STORE_LAYOUT.md` and the VPS
 * runbook all call this command `pnpm keys:rotate-kek`, and until now none of
 * them could: the script did not exist, so an operator following the written
 * procedure got "Command not found" at the moment a master key is suspected of
 * exposure. Declared here rather than in a source-text grep of the runbook,
 * because what must be true is that the NAME the documents use resolves to the
 * CLI the tests above drive.
 */
describe("V-3 rotate: the operator's command has the name the documents give it", () => {
  it("declares keys:rotate-kek, running the CLI through tsx like its siblings", async () => {
    const manifest = JSON.parse(await readFile(
      new URL("../../package.json", import.meta.url), "utf8"
    )) as { scripts: Record<string, string> };

    expect(manifest.scripts["keys:rotate-kek"])
      .toBe("tsx apps/runner/src/rotate-kek-cli.ts");
    // The sibling shape, so the name cannot drift into a different runner: every
    // operator CLI under apps/runner/src is invoked by `tsx <path>`.
    expect(manifest.scripts["db:migrate"]).toMatch(/^tsx apps\/runner\/src\/.+-cli\.ts$/u);
  });
});
