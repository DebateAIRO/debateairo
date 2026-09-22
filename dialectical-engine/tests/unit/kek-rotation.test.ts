/**
 * V-3 — master-key (KEK) rotation. Coordinator ruling 2026-09-22 (option A of the
 * task-6 report §6.3): the two FILE record kinds gain a `kek_id`; the support
 * rows keep their v1 binary format byte-for-byte and are read by trying the
 * current KEK then the previous one.
 *
 * THIS FILE'S FIRST TEST IS THE COMPATIBILITY ONE, on purpose. Every wrapped-key
 * record written before this change carries no `kek_id`, and the whole package is
 * worthless if one of them stops opening: "a record without one keeps working and
 * is read as 'wrapped by the original KEK'" is the promise, so it is measured
 * before anything else is built.
 *
 * No real key material is ever read here. Every key is generated into a
 * `mkdtemp` directory and the directory is removed afterwards.
 */
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FilePublicationKeyStore,
  FileUserDekStore,
  generateDek,
  kekId,
  loadKek,
  wrapDek
} from "../../packages/crypto/src/index.js";
import type { KekHandle } from "../../packages/crypto/src/index.js";
import { createSupportKeyPort } from "../../apps/api/src/support/keys.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PUBLICATION_REF = "22222222-2222-4222-8222-222222222222";

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

/** A throwaway KEK file under the custody contract, and its handle. */
async function throwawayKek(directory: string, name: string): Promise<KekHandle> {
  const path = join(directory, name);
  await writeFile(path, generateDek(), { mode: 0o600 });
  await chmod(path, 0o600);
  await chmod(directory, 0o700);
  return loadKek(path);
}

/**
 * Writes a wrapped user-DEK record in the EXACT shape the store wrote before
 * `kek_id` existed: `version: 1`, no `kek_id`. The AAD is spelled out here on
 * purpose — this is the historical format, and a test that derived it from the
 * code under test could not detect the code changing it.
 */
async function writeLegacyUserDekRecord(
  root: string,
  kek: KekHandle,
  userId: string,
  dek: Uint8Array
): Promise<void> {
  const envelope = wrapDek(kek, dek, [
    "secret-store", "user-dek", userId, "run:none", userId, `user-dek:${userId}`, "1"
  ]);
  const directory = join(root, "users", userId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(join(root, "users"), 0o700);
  await chmod(root, 0o700);
  await chmod(directory, 0o700);
  const location = join(directory, "dek.v1.json");
  await writeFile(location, JSON.stringify({
    version: 1,
    user_id: userId,
    key_id: envelope.keyId,
    wrapped_dek: envelope
  }), { mode: 0o600 });
  await chmod(location, 0o600);
}

/** The same, for the publication-key record. */
async function writeLegacyPublicationKeyRecord(
  root: string,
  corpusKek: KekHandle,
  publicationRef: string,
  key: Uint8Array
): Promise<void> {
  const keyIdentifier = `publication-key:${publicationRef}:v1`;
  const envelope = wrapDek(corpusKek, key, [
    "secret-store", "publication-key", publicationRef,
    `publication:${publicationRef}`, "public-corpus", keyIdentifier, "1"
  ]);
  const directory = join(root, "publications", publicationRef);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(join(root, "publications"), 0o700);
  await chmod(root, 0o700);
  await chmod(directory, 0o700);
  const location = join(directory, "publication-key.v1.json");
  await writeFile(location, JSON.stringify({
    version: 1,
    publication_ref: publicationRef,
    key_id: envelope.keyId,
    wrapped_publication_key: envelope
  }), { mode: 0o600 });
  await chmod(location, 0o600);
}

describe("V-3 rotation: a record written before kek_id keeps working", () => {
  it("opens a v1 user-DEK record, which carries no kek_id at all", async () => {
    const directory = await temporaryDirectory("debateai-rotation-legacy-");
    const kek = await throwawayKek(directory, "kek.bin");
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });
    const dek = generateDek();
    await writeLegacyUserDekRecord(root, kek, USER_ID, dek);

    // The record on disk really is the old shape.
    const onDisk = JSON.parse(
      await readFile(join(root, "users", USER_ID, "dek.v1.json"), "utf8")
    ) as Record<string, unknown>;
    expect(onDisk.version).toBe(1);
    expect(onDisk).not.toHaveProperty("kek_id");

    expect(await new FileUserDekStore(root, kek).load(USER_ID)).toEqual(dek);
  });

  it("reads a v1 record as wrapped by the original KEK during a changeover", async () => {
    const directory = await temporaryDirectory("debateai-rotation-legacy-ring-");
    const original = await throwawayKek(directory, "kek.bin");
    const replacement = await throwawayKek(directory, "kek-new.bin");
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });
    const dek = generateDek();
    await writeLegacyUserDekRecord(root, original, USER_ID, dek);

    // Current is the new KEK, previous is the one that actually wrapped it.
    const during = new FileUserDekStore(root, { current: replacement, previous: original });
    expect(await during.load(USER_ID)).toEqual(dek);

    // And with the original gone, an unlabelled record that only it can open is
    // refused — never silently returned as something else. The code is the
    // cryptographic one, not the configuration one: an UNLABELLED record was
    // tried under every key this process holds and none of them authenticated
    // it. A LABELLED record naming a key we do not hold answers KEK_UNRESOLVED
    // instead, and the two cases tell an operator different things: "you are
    // missing a key this record names" versus "no key you have opens this".
    const after = new FileUserDekStore(root, { current: replacement });
    await expect(after.load(USER_ID)).rejects.toThrowError(
      expect.objectContaining({ code: "CRYPTO_AUTHENTICATION_FAILED" })
    );
  });

  it("opens a v1 publication-key record, and during a changeover too", async () => {
    const directory = await temporaryDirectory("debateai-rotation-legacy-corpus-");
    const original = await throwawayKek(directory, "corpus-kek.bin");
    const replacement = await throwawayKek(directory, "corpus-kek-new.bin");
    const root = join(directory, "publication-keys");
    await mkdir(root, { mode: 0o700 });
    const key = generateDek();
    await writeLegacyPublicationKeyRecord(root, original, PUBLICATION_REF, key);

    const onDisk = JSON.parse(await readFile(
      join(root, "publications", PUBLICATION_REF, "publication-key.v1.json"), "utf8"
    )) as Record<string, unknown>;
    expect(onDisk.version).toBe(1);
    expect(onDisk).not.toHaveProperty("kek_id");

    expect((await new FilePublicationKeyStore(root, original).load(PUBLICATION_REF)).key)
      .toEqual(key);
    const during = new FilePublicationKeyStore(root, {
      current: replacement, previous: original
    });
    expect((await during.load(PUBLICATION_REF)).key).toEqual(key);
  });
});

describe("V-3 rotation: the kek_id label", () => {
  it("is a stable, opaque label that differs between two KEKs", async () => {
    const directory = await temporaryDirectory("debateai-rotation-label-");
    const first = await throwawayKek(directory, "kek.bin");
    const second = await throwawayKek(directory, "kek-new.bin");

    const label = kekId(first);
    expect(label).toMatch(/^[0-9a-f]{16}$/);
    expect(kekId(first)).toBe(label);
    expect(kekId(second)).not.toBe(label);
  });

  it("never reveals the key bytes it labels", async () => {
    const directory = await temporaryDirectory("debateai-rotation-label-secret-");
    const path = join(directory, "kek.bin");
    const material = generateDek();
    await writeFile(path, material, { mode: 0o600 });
    await chmod(path, 0o600);
    await chmod(directory, 0o700);

    const label = kekId(loadKek(path));
    for (const encoding of ["hex", "base64", "base64url"] as const) {
      expect(label).not.toContain(Buffer.from(material).toString(encoding));
    }
    // 16 hex characters is 8 bytes; a 32-byte key cannot be in there.
    expect(label).toHaveLength(16);
  });
});

/**
 * The support KEK's records are not files: they are `bytea` columns whose length
 * (61) and version byte (1) are pinned by a CHECK constraint in migration 0054
 * and re-asserted in packages/db. The coordinator ruled that format stays
 * byte-for-byte v1 — no migration — so the port reads by trying the current KEK
 * and then the previous one, and a re-wrap produces the same 61-byte shape.
 */
describe("V-3 rotation: re-wrapping a file store, one record at a time", () => {
  it("re-wraps a v1 record, labels it, and leaves an already-current one alone", async () => {
    const directory = await temporaryDirectory("debateai-rotation-rewrap-");
    const original = await throwawayKek(directory, "kek.bin");
    const replacement = await throwawayKek(directory, "kek-new.bin");
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });
    const legacyDek = generateDek();
    await writeLegacyUserDekRecord(root, original, USER_ID, legacyDek);

    const store = new FileUserDekStore(root, { current: replacement, previous: original });
    expect(await store.rewrapUnderCurrentKek(USER_ID)).toBe("REWRAPPED");

    const record = JSON.parse(
      await readFile(join(root, "users", USER_ID, "dek.v1.json"), "utf8")
    ) as Record<string, unknown>;
    expect(record.version).toBe(2);
    expect(record.kek_id).toBe(kekId(replacement));
    expect(record.user_id).toBe(USER_ID);

    // Same DEK, now readable by the new KEK on its own.
    expect(await new FileUserDekStore(root, replacement).load(USER_ID)).toEqual(legacyDek);
    // Idempotent: running the pass again is a no-op.
    expect(await store.rewrapUnderCurrentKek(USER_ID)).toBe("ALREADY_CURRENT");
    expect(await store.rewrapUnderCurrentKek(USER_ID)).toBe("ALREADY_CURRENT");
  });

  it("verifies a record under the current KEK ALONE, ignoring the previous one", async () => {
    const directory = await temporaryDirectory("debateai-rotation-verify-");
    const original = await throwawayKek(directory, "kek.bin");
    const replacement = await throwawayKek(directory, "kek-new.bin");
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });
    await writeLegacyUserDekRecord(root, original, USER_ID, generateDek());

    // The ring can still READ it through the previous key — but a verification
    // pass that accepted that would certify a rotation that had not happened.
    const store = new FileUserDekStore(root, { current: replacement, previous: original });
    expect(await store.load(USER_ID)).toBeInstanceOf(Buffer);
    await expect(store.verifyUnderCurrentKek(USER_ID)).rejects.toThrowError();

    expect(await store.rewrapUnderCurrentKek(USER_ID)).toBe("REWRAPPED");
    await expect(store.verifyUnderCurrentKek(USER_ID)).resolves.toBeUndefined();
  });

  it("lists every record each store holds, and nothing else", async () => {
    const directory = await temporaryDirectory("debateai-rotation-list-");
    const kek = await throwawayKek(directory, "kek.bin");
    const corpusKek = await throwawayKek(directory, "corpus-kek.bin");
    const users = join(directory, "user-deks");
    const publications = join(directory, "publication-keys");
    await mkdir(users, { mode: 0o700 });
    await mkdir(publications, { mode: 0o700 });

    const userStore = new FileUserDekStore(users, kek);
    expect(await userStore.listKeyRefs()).toEqual([]);
    const second = "44444444-4444-4444-8444-444444444444";
    await userStore.store(USER_ID, generateDek());
    await userStore.store(second, generateDek());
    expect([...await userStore.listKeyRefs()].sort()).toEqual([USER_ID, second].sort());

    const publicationStore = new FilePublicationKeyStore(publications, corpusKek);
    expect(await publicationStore.listKeyRefs()).toEqual([]);
    await publicationStore.store(PUBLICATION_REF, generateDek());
    expect(await publicationStore.listKeyRefs()).toEqual([PUBLICATION_REF]);
  });

  it("re-wraps a publication key and verifies it under the new corpus KEK alone", async () => {
    const directory = await temporaryDirectory("debateai-rotation-rewrap-corpus-");
    const original = await throwawayKek(directory, "corpus-kek.bin");
    const replacement = await throwawayKek(directory, "corpus-kek-new.bin");
    const root = join(directory, "publication-keys");
    await mkdir(root, { mode: 0o700 });
    const key = generateDek();
    await writeLegacyPublicationKeyRecord(root, original, PUBLICATION_REF, key);

    const store = new FilePublicationKeyStore(root, {
      current: replacement, previous: original
    });
    expect(await store.rewrapUnderCurrentKek(PUBLICATION_REF)).toBe("REWRAPPED");
    await expect(store.verifyUnderCurrentKek(PUBLICATION_REF)).resolves.toBeUndefined();
    expect((await new FilePublicationKeyStore(root, replacement).load(PUBLICATION_REF)).key)
      .toEqual(key);
    expect(await store.rewrapUnderCurrentKek(PUBLICATION_REF)).toBe("ALREADY_CURRENT");
  });

  it("leaves the original record in place when a record cannot be opened at all", async () => {
    const directory = await temporaryDirectory("debateai-rotation-unreadable-");
    const original = await throwawayKek(directory, "kek.bin");
    const stranger = await throwawayKek(directory, "kek-stranger.bin");
    const replacement = await throwawayKek(directory, "kek-new.bin");
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });
    await writeLegacyUserDekRecord(root, original, USER_ID, generateDek());
    const before = await readFile(join(root, "users", USER_ID, "dek.v1.json"), "utf8");

    // Neither held key opens it: refuse, and do not touch what is on disk.
    const store = new FileUserDekStore(root, { current: replacement, previous: stranger });
    await expect(store.rewrapUnderCurrentKek(USER_ID)).rejects.toThrowError();
    expect(await readFile(join(root, "users", USER_ID, "dek.v1.json"), "utf8")).toBe(before);
  });

  it("keeps the custody modes of the record it rewrites", async () => {
    const directory = await temporaryDirectory("debateai-rotation-modes-");
    const original = await throwawayKek(directory, "kek.bin");
    const replacement = await throwawayKek(directory, "kek-new.bin");
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });
    await writeLegacyUserDekRecord(root, original, USER_ID, generateDek());

    const store = new FileUserDekStore(root, { current: replacement, previous: original });
    await store.rewrapUnderCurrentKek(USER_ID);
    const location = join(root, "users", USER_ID, "dek.v1.json");
    expect((await stat(location)).mode & 0o777).toBe(0o600);
    // No temporary file is left behind for a backup to pick up.
    expect(await readdir(join(root, "users", USER_ID))).toEqual(["dek.v1.json"]);
  });
});

describe("V-3 rotation: the support KEK, whose format cannot carry a label", () => {
  const SESSION = Object.freeze({ kind: "session", ref: USER_ID } as const);

  async function supportKekPath(directory: string, name: string): Promise<string> {
    const holder = join(directory, name);
    await mkdir(holder, { recursive: true, mode: 0o700 });
    await chmod(holder, 0o700);
    // The loader pins the basename, so a second KEK lives in its own directory.
    const path = join(holder, "support-kek.bin");
    await writeFile(path, generateDek(), { mode: 0o600 });
    await chmod(path, 0o600);
    return path;
  }

  it("opens a row wrapped under the previous KEK, and refuses it once that key is gone", async () => {
    const directory = await temporaryDirectory("debateai-rotation-support-");
    const originalPath = await supportKekPath(directory, "original");
    const replacementPath = await supportKekPath(directory, "replacement");

    const before = await createSupportKeyPort({ supportKekPath: originalPath });
    const lease = await before.createDataKey(SESSION);
    const wrapped = Buffer.from(lease.wrapped.bytes);
    const dataKey = Buffer.from(lease.dataKey);
    lease.close();
    await before.close();

    const during = await createSupportKeyPort({
      supportKekPath: replacementPath,
      previousSupportKekPath: originalPath
    });
    expect(await during.unwrapDataKey(SESSION, wrapped)).toEqual(dataKey);
    await during.close();

    const after = await createSupportKeyPort({ supportKekPath: replacementPath });
    await expect(after.unwrapDataKey(SESSION, wrapped)).rejects.toThrowError(
      expect.objectContaining({ code: "SUPPORT_KEY_AUTHENTICATION_FAILED" })
    );
    await after.close();
  });

  it("re-wraps a previous-KEK row into the same 61-byte v1 shape", async () => {
    const directory = await temporaryDirectory("debateai-rotation-support-rewrap-");
    const originalPath = await supportKekPath(directory, "original");
    const replacementPath = await supportKekPath(directory, "replacement");

    const before = await createSupportKeyPort({ supportKekPath: originalPath });
    const lease = await before.createDataKey(SESSION);
    const wrapped = Buffer.from(lease.wrapped.bytes);
    const dataKey = Buffer.from(lease.dataKey);
    lease.close();
    await before.close();

    const during = await createSupportKeyPort({
      supportKekPath: replacementPath,
      previousSupportKekPath: originalPath
    });
    const rotated = await during.rewrapDataKey(SESSION, wrapped);
    expect(rotated.outcome).toBe("REWRAPPED");
    const rewrapped = rotated.outcome === "REWRAPPED"
      ? Buffer.from(rotated.wrapped.bytes) : Buffer.alloc(0);
    // The database CHECK is the reason this matters: 61 bytes, version byte 1.
    expect(rewrapped).toHaveLength(61);
    expect(rewrapped[0]).toBe(1);
    expect(rewrapped.equals(wrapped)).toBe(false);
    await during.close();

    // The new bytes open under the new KEK alone — the changeover is complete
    // for this row.
    const after = await createSupportKeyPort({ supportKekPath: replacementPath });
    expect(await after.unwrapDataKey(SESSION, rewrapped)).toEqual(dataKey);
    await after.close();
  });

  it("is idempotent: a row already under the current KEK is not re-wrapped", async () => {
    const directory = await temporaryDirectory("debateai-rotation-support-idempotent-");
    const originalPath = await supportKekPath(directory, "original");
    const replacementPath = await supportKekPath(directory, "replacement");

    const port = await createSupportKeyPort({
      supportKekPath: replacementPath,
      previousSupportKekPath: originalPath
    });
    const lease = await port.createDataKey(SESSION);
    const wrapped = Buffer.from(lease.wrapped.bytes);
    lease.close();

    expect((await port.rewrapDataKey(SESSION, wrapped)).outcome).toBe("ALREADY_CURRENT");
    // Running the whole pass twice must reach the same place.
    expect((await port.rewrapDataKey(SESSION, wrapped)).outcome).toBe("ALREADY_CURRENT");
    await port.close();
  });

  it("skips a destroyed-key tombstone instead of re-wrapping or failing on it", async () => {
    const directory = await temporaryDirectory("debateai-rotation-support-tombstone-");
    const port = await createSupportKeyPort({
      supportKekPath: await supportKekPath(directory, "current"),
      previousSupportKekPath: await supportKekPath(directory, "previous")
    });
    // SUP-07's irreversible tombstone: 61 zero bytes, with destroyed_at set.
    const tombstone = Buffer.alloc(61);
    expect((await port.rewrapDataKey(SESSION, tombstone)).outcome).toBe("TOMBSTONE");
    await port.close();
  });

  it("refuses a row neither key opens, loudly and typed — never silently skipped", async () => {
    const directory = await temporaryDirectory("debateai-rotation-support-stranger-");
    const strangerPath = await supportKekPath(directory, "stranger");
    const stranger = await createSupportKeyPort({ supportKekPath: strangerPath });
    const lease = await stranger.createDataKey(SESSION);
    const wrapped = Buffer.from(lease.wrapped.bytes);
    lease.close();
    await stranger.close();

    const port = await createSupportKeyPort({
      supportKekPath: await supportKekPath(directory, "current"),
      previousSupportKekPath: await supportKekPath(directory, "previous")
    });
    await expect(port.rewrapDataKey(SESSION, wrapped)).rejects.toThrowError(
      expect.objectContaining({ code: "SUPPORT_KEY_AUTHENTICATION_FAILED" })
    );
    await port.close();
  });

  it("labels its current KEK in the same vocabulary the file stores use", async () => {
    const directory = await temporaryDirectory("debateai-rotation-support-label-");
    const currentPath = await supportKekPath(directory, "current");
    const port = await createSupportKeyPort({ supportKekPath: currentPath });
    const label = port.currentKekId();
    expect(label).toMatch(/^[0-9a-f]{16}$/);
    // Same construction as @debateai/crypto's kekId, so an operator reads one
    // vocabulary of key ids across all three KEKs.
    expect(label).toBe(kekId(loadKek(await readFile(currentPath))));
    // And it is a label, not the key.
    expect(label).not.toContain((await readFile(currentPath)).toString("hex"));
    await port.close();
  });

  it("refuses a previous path that is the same key as the current one", async () => {
    const directory = await temporaryDirectory("debateai-rotation-support-same-");
    const path = await supportKekPath(directory, "current");
    const copyDirectory = join(directory, "copy");
    await mkdir(copyDirectory, { recursive: true, mode: 0o700 });
    await chmod(copyDirectory, 0o700);
    const copy = join(copyDirectory, "support-kek.bin");
    await writeFile(copy, await readFile(path), { mode: 0o600 });
    await chmod(copy, 0o600);

    await expect(createSupportKeyPort({
      supportKekPath: path,
      previousSupportKekPath: copy
    })).rejects.toThrowError(
      expect.objectContaining({ code: "SUPPORT_KEK_CUSTODY_INVALID" })
    );
  });
});

describe("V-3 rotation: records written now carry their kek_id", () => {
  it("writes a v2 user-DEK record labelled with the current KEK", async () => {
    const directory = await temporaryDirectory("debateai-rotation-v2-");
    const kek = await throwawayKek(directory, "kek.bin");
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });
    const dek = generateDek();
    await new FileUserDekStore(root, kek).store(USER_ID, dek);

    const record = JSON.parse(
      await readFile(join(root, "users", USER_ID, "dek.v1.json"), "utf8")
    ) as Record<string, unknown>;
    expect(record.version).toBe(2);
    expect(record.kek_id).toBe(kekId(kek));
    expect(await new FileUserDekStore(root, kek).load(USER_ID)).toEqual(dek);
  });

  it("writes a v2 publication-key record labelled with the current corpus KEK", async () => {
    const directory = await temporaryDirectory("debateai-rotation-v2-corpus-");
    const corpusKek = await throwawayKek(directory, "corpus-kek.bin");
    const root = join(directory, "publication-keys");
    await mkdir(root, { mode: 0o700 });
    const key = generateDek();
    await new FilePublicationKeyStore(root, corpusKek).store(PUBLICATION_REF, key);

    const record = JSON.parse(await readFile(
      join(root, "publications", PUBLICATION_REF, "publication-key.v1.json"), "utf8"
    )) as Record<string, unknown>;
    expect(record.version).toBe(2);
    expect(record.kek_id).toBe(kekId(corpusKek));
  });

  it("refuses a record whose label names a KEK this process does not hold", async () => {
    const directory = await temporaryDirectory("debateai-rotation-unknown-label-");
    const kek = await throwawayKek(directory, "kek.bin");
    const stranger = await throwawayKek(directory, "kek-stranger.bin");
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });
    await new FileUserDekStore(root, kek).store(USER_ID, generateDek());

    // The label is authoritative: a process holding neither the labelled KEK nor
    // a previous one refuses instead of try-decrypting its way in.
    await expect(new FileUserDekStore(root, stranger).load(USER_ID)).rejects.toThrowError(
      expect.objectContaining({ code: "KEK_UNRESOLVED" })
    );
  });

  it("opens a v2 record under the previous KEK while the labels disagree", async () => {
    const directory = await temporaryDirectory("debateai-rotation-v2-ring-");
    const original = await throwawayKek(directory, "kek.bin");
    const replacement = await throwawayKek(directory, "kek-new.bin");
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });
    const dek = generateDek();
    await new FileUserDekStore(root, original).store(USER_ID, dek);

    const during = new FileUserDekStore(root, { current: replacement, previous: original });
    expect(await during.load(USER_ID)).toEqual(dek);
  });
});
