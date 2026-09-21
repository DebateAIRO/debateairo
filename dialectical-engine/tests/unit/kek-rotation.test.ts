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
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
