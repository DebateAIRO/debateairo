import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import {
  CryptoAuthenticationError,
  decrypt,
  encrypt,
  generateDek,
  loadKek,
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
      expect.objectContaining({ code: "KEK_UNRESOLVED" })
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
