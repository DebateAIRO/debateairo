import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, link, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import {
  CryptoAuthenticationError,
  decrypt,
  encrypt,
  generateDek,
  generateVerificationToken,
  hashToken,
  hashVerificationToken,
  destroyKek,
  loadKek,
  loadSecretKey,
  unwrapDek,
  wrapDek
} from "../../packages/crypto/src/index.js";
import {
  loadApiEnvironment,
  loadRunnerEnvironment
} from "../../packages/register/src/runtime-environment.js";

const contentAad = [
  "core", "run", "run:test", "run:test", "user:test", "dek:user:test", "1"
] as const;
const wrappedDekAad = [
  "secret-store", "wrapped-dek", "user:test", "run:test", "user:test", "kek:primary", "1"
] as const;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("S1 crypto foundation", () => {
  it("round-trips AES-256-GCM content with a fresh nonce and bound AAD", () => {
    const dek = generateDek();
    const plaintext = Buffer.from("private debate content", "utf8");
    const first = encrypt(dek, plaintext, contentAad);
    const second = encrypt(dek, plaintext, contentAad);

    expect(first).toMatchObject({ v: 1, keyId: "dek:user:test" });
    expect(Buffer.from(first.nonce, "base64")).toHaveLength(12);
    expect(first.nonce).not.toBe(second.nonce);
    expect(decrypt(dek, first, contentAad)).toEqual(plaintext);
  });

  it("rejects AAD relocation and a flipped ciphertext byte without returning plaintext", () => {
    const dek = generateDek();
    const envelope = encrypt(dek, Buffer.from("bound to owner", "utf8"), contentAad);
    const relocatedAad = [
      "core", "run", "run:other", "run:other", "user:other", "dek:user:test", "1"
    ] as const;
    expect(() => decrypt(dek, envelope, relocatedAad)).toThrowError(
      expect.objectContaining({ code: "CRYPTO_AUTHENTICATION_FAILED" })
    );

    const ciphertext = Buffer.from(envelope.ct, "base64");
    ciphertext[0] = ciphertext[0]! ^ 0x01;
    const tampered = { ...envelope, ct: ciphertext.toString("base64") };
    expect(() => decrypt(dek, tampered, contentAad)).toThrow(CryptoAuthenticationError);
  });

  it("wraps and unwraps a DEK while rejecting a wrong KEK and wrong AAD", () => {
    const kek = loadKek(generateDek());
    const wrongKek = loadKek(generateDek());
    const dek = generateDek();
    const wrapped = wrapDek(kek, dek, wrappedDekAad);

    expect(unwrapDek(kek, wrapped, wrappedDekAad)).toEqual(dek);
    expect(() => unwrapDek(wrongKek, wrapped, wrappedDekAad)).toThrowError(
      expect.objectContaining({ code: "CRYPTO_AUTHENTICATION_FAILED" })
    );
    expect(() => unwrapDek(kek, wrapped, [
      "secret-store", "wrapped-dek", "user:other", "run:test", "user:other", "kek:primary", "1"
    ])).toThrowError(expect.objectContaining({ code: "CRYPTO_AUTHENTICATION_FAILED" }));
  });

  it("loads only 0600, 256-bit KEKs and keeps the handle opaque", async () => {
    const directory = await mkdtemp(join(tmpdir(), "debateai-kek-"));
    temporaryDirectories.push(directory);
    const validPath = join(directory, "kek");
    await writeFile(validPath, generateDek(), { mode: 0o600 });
    await chmod(validPath, 0o600);

    expect(Object.keys(loadKek(validPath))).toEqual([]);
    expect(() => loadKek(join(directory, "absent"))).toThrowError(
      expect.objectContaining({ code: "KEK_UNRESOLVED" })
    );
    expect(() => loadKek(Buffer.alloc(31))).toThrowError(
      expect.objectContaining({ code: "KEK_UNRESOLVED" })
    );

    await chmod(validPath, 0o644);
    expect(() => loadKek(validPath)).toThrowError(
      expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
    );
  });

  it("domain-separates token hashes per kind while keeping the sha256:<hex> column grammar", () => {
    // L2-F12: one unkeyed SHA-256 served session, CSRF, login-challenge,
    // step-up-grant and verification tokens with no per-purpose domain.
    const token = generateVerificationToken();
    const kinds = ["session", "csrf", "login-challenge", "step-up-grant", "verification"] as const;
    const hashes = kinds.map((kind) => hashToken(kind, token));
    for (const hash of hashes) expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(new Set(hashes).size).toBe(kinds.length);
    expect(hashes).not.toContain(hashVerificationToken(token));
    expect(hashToken("session", token)).toBe(`sha256:${createHash("sha256")
      .update("debateai:token:session:v1\0", "utf8").update(token, "utf8").digest("hex")}`);
    expect(hashToken("session", token)).toBe(hashToken("session", token));
    expect(() => hashToken("session", "too-short")).toThrowError(
      expect.objectContaining({ code: "CRYPTO_KEY_INVALID" })
    );
    expect(() => hashToken("cookie" as never, token)).toThrowError(
      expect.objectContaining({ code: "CRYPTO_TOKEN_KIND_INVALID" })
    );
  });

  it("proves destroying the sole wrapped-DEK blob makes retained ciphertext unrecoverable", () => {
    const kek = loadKek(generateDek());
    const wrappedDeks = new Map<string, ReturnType<typeof wrapDek>>();
    let dek: Buffer | undefined = generateDek();
    const retainedCiphertext = encrypt(dek, Buffer.from("retained ciphertext", "utf8"), contentAad);
    wrappedDeks.set("user:test", wrapDek(kek, dek, wrappedDekAad));
    dek.fill(0);
    dek = undefined;

    const recover = (): Buffer => {
      const wrapped = wrappedDeks.get("user:test");
      if (wrapped === undefined) throw new Error("WRAPPED_DEK_DESTROYED");
      return decrypt(unwrapDek(kek, wrapped, wrappedDekAad), retainedCiphertext, contentAad);
    };
    expect(recover()).toEqual(Buffer.from("retained ciphertext", "utf8"));

    wrappedDeks.delete("user:test");
    expect(() => recover()).toThrow("WRAPPED_DEK_DESTROYED");
    expect(() => decrypt(generateDek(), retainedCiphertext, contentAad)).toThrowError(
      expect.objectContaining({ code: "CRYPTO_AUTHENTICATION_FAILED" })
    );
  });

  it("refuses key files that fail the custody contract instead of following them", async () => {
    // L2-F6: the production loaders checked only isFile + 0600, so they
    // followed symlinks, accepted a file owned by anyone, ignored extra hard
    // links, and never looked at the parent directory. The dev launchers
    // already enforced O_NOFOLLOW + uid + nlink + size.
    const directory = await mkdtemp(join(tmpdir(), "debateai-custody-"));
    temporaryDirectories.push(directory);
    await chmod(directory, 0o700);
    const validPath = join(directory, "kek");
    await writeFile(validPath, generateDek(), { mode: 0o600 });
    await chmod(validPath, 0o600);

    // The contract-satisfying file still loads through both loaders.
    expect(Object.keys(loadKek(validPath))).toEqual([]);
    expect(loadSecretKey(validPath)).toHaveLength(32);

    // A symlink pointing at a perfectly valid key is still refused: the
    // custody decision must be made about the file the loader opened.
    const linkPath = join(directory, "kek-symlink");
    await symlink(validPath, linkPath);
    expect(() => loadKek(linkPath)).toThrowError(
      expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
    );
    expect(() => loadSecretKey(linkPath)).toThrowError(
      expect.objectContaining({ code: "SECRET_CUSTODY_INVALID" })
    );

    // A second hard link means a second name can outlive a custody rotation.
    const hardPath = join(directory, "kek-hardlink");
    await link(validPath, hardPath);
    expect(() => loadKek(hardPath)).toThrowError(
      expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
    );
    await rm(hardPath);

    // A raw key is exactly 32 bytes; 31 or 33 is a different secret.
    const shortPath = join(directory, "kek-short");
    await writeFile(shortPath, Buffer.alloc(31), { mode: 0o600 });
    await chmod(shortPath, 0o600);
    expect(() => loadKek(shortPath)).toThrowError(
      expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
    );
    expect(() => loadSecretKey(shortPath)).toThrowError(
      expect.objectContaining({ code: "SECRET_CUSTODY_INVALID" })
    );

    // A group/world-readable key file.
    await chmod(validPath, 0o640);
    expect(() => loadKek(validPath)).toThrowError(
      expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
    );
    await chmod(validPath, 0o600);

    // A 0600 key inside a 0755 directory is a key anyone can replace.
    await chmod(directory, 0o755);
    expect(() => loadKek(validPath)).toThrowError(
      expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
    );
    expect(() => loadSecretKey(validPath)).toThrowError(
      expect.objectContaining({ code: "SECRET_CUSTODY_INVALID" })
    );
    await chmod(directory, 0o700);
    expect(Object.keys(loadKek(validPath))).toEqual([]);

    // A path that is simply not there stays the unresolved-configuration code.
    expect(() => loadKek(join(directory, "absent"))).toThrowError(
      expect.objectContaining({ code: "KEK_UNRESOLVED" })
    );
    expect(() => loadSecretKey(join(directory, "absent"))).toThrowError(
      expect.objectContaining({ code: "KEK_UNRESOLVED" })
    );
  });

  it("destroys the KEK master copy so nothing can wrap or unwrap after shutdown", async () => {
    // L2-F7: the WeakMap master copy was never zeroed and there was no destroy
    // API, so the KEK stayed in process memory for a core dump or swap to find
    // long after the pools closed.
    const kek = loadKek(generateDek());
    const dek = generateDek();
    const wrapped = wrapDek(kek, dek, wrappedDekAad);
    expect(unwrapDek(kek, wrapped, wrappedDekAad)).toEqual(dek);

    destroyKek(kek);

    expect(() => wrapDek(kek, dek, wrappedDekAad)).toThrowError(
      expect.objectContaining({ code: "KEK_DESTROYED" })
    );
    expect(() => unwrapDek(kek, wrapped, wrappedDekAad)).toThrowError(
      expect.objectContaining({ code: "KEK_DESTROYED" })
    );
    // Shutdown may run twice (signal then controller close); destroy is idempotent.
    expect(() => destroyKek(kek)).not.toThrow();

    const shutdown = await readFile(
      new URL("../../apps/api/src/graceful-shutdown.ts", import.meta.url), "utf8"
    );
    expect(shutdown).toContain("destroyKek");
  });

  it("makes both process compositions refuse a missing KEK_PATH with the typed code", () => {
    vi.stubEnv("KEK_PATH", undefined);
    expect(() => loadApiEnvironment()).toThrowError(
      expect.objectContaining({ code: "KEK_UNRESOLVED" })
    );
    expect(() => loadRunnerEnvironment()).toThrowError(
      expect.objectContaining({ code: "KEK_UNRESOLVED" })
    );
  });

  it("wires KEK validation into both executable process roots", async () => {
    const [apiMain, runnerMain] = await Promise.all([
      readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8")
    ]);
    expect(apiMain).toContain("loadKek(environment.KEK_PATH)");
    expect(runnerMain).toContain("loadKek(environment.KEK_PATH)");
  });
});
