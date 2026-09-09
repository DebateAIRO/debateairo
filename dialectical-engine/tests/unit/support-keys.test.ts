import { chmod, link, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SupportKeyError,
  createSupportKeyPort,
  type SupportKeyHandle,
  type SupportKeyPort,
  type SupportContentContext
} from "../../apps/api/src/support/keys.js";

const temporaryRoots: string[] = [];
const ports: SupportKeyPort[] = [];
const SESSION_HANDLE = Object.freeze({
  kind: "session",
  ref: "11111111-1111-4111-8111-111111111111"
}) satisfies SupportKeyHandle;
const CASE_HANDLE = Object.freeze({
  kind: "case",
  ref: "22222222-2222-4222-8222-222222222222"
}) satisfies SupportKeyHandle;

async function makeKekPath(material: Buffer = Buffer.alloc(32, 0x51)): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "debateai-support-keys-"));
  temporaryRoots.push(root);
  const directory = join(root, "secrets");
  await mkdir(directory, { mode: 0o700 });
  const supportKekPath = join(directory, "support-kek.bin");
  await writeFile(supportKekPath, material, { mode: 0o600 });
  return supportKekPath;
}

async function makePort(material?: Buffer): Promise<SupportKeyPort> {
  const port = await createSupportKeyPort({ supportKekPath: await makeKekPath(material) });
  ports.push(port);
  return port;
}

async function expectSupportFailure(
  operation: () => unknown | Promise<unknown>,
  code: string
): Promise<SupportKeyError> {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(SupportKeyError);
    expect(error).toMatchObject({ code, message: code });
    return error as SupportKeyError;
  }
  throw new Error(`Expected ${code}`);
}

function changedAt(bytes: Uint8Array, index: number): Buffer {
  const changed = Buffer.from(bytes);
  changed[index] = changed[index]! ^ 0x80;
  return changed;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(ports.splice(0).map((port) => port.close()));
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("SUP-07 support-only key envelopes", () => {
  it("writes semantic content v2, rejects AAD replay, and dual-reads legacy v1", async () => {
    const port = await makePort();
    const lease = await port.createDataKey(SESSION_HANDLE);
    const plaintext = Buffer.from("semantic support content","utf8");
    const context = Object.freeze({
      kind: "session-message",sessionId: SESSION_HANDLE.ref,
      messageId: "33333333-3333-4333-8333-333333333333",
      role: "user",outcome: "ANSWER_GROUNDED",purpose: "content"
    }) satisfies SupportContentContext;
    const changedContexts = Object.freeze([
      { ...context,sessionId: CASE_HANDLE.ref },
      { ...context,messageId: "44444444-4444-4444-8444-444444444444" },
      { ...context,role: "assistant" },
      { ...context,outcome: "NO_SOURCE" }
    ]) satisfies readonly SupportContentContext[];
    try {
      const v2 = port.sealContent(context,lease.dataKey,plaintext);
      expect(v2[0]).toBe(2);
      expect(port.openContent(context,lease.dataKey,v2)).toEqual(plaintext);
      for (const changed of changedContexts) {
        await expectSupportFailure(
          () => port.openContent(changed,lease.dataKey,v2),
          "SUPPORT_KEY_AUTHENTICATION_FAILED"
        );
      }

      const legacyV1 = port.seal(SESSION_HANDLE,lease.dataKey,plaintext);
      expect(legacyV1[0]).toBe(1);
      expect(port.openContent(context,lease.dataKey,legacyV1)).toEqual(plaintext);
    } finally {
      plaintext.fill(0);
      lease.close();
    }
  });

  it("creates fresh 32-byte DEKs and round-trips exact version-1 GCM envelopes", async () => {
    const port = await makePort();
    const first = await port.createDataKey(SESSION_HANDLE);
    const second = await port.createDataKey(SESSION_HANDLE);
    const plaintext = Buffer.from("caller-owned support plaintext", "utf8");
    const openedBuffers: Buffer[] = [];
    try {
      expect(first.dataKey).toHaveLength(32);
      expect(second.dataKey).toHaveLength(32);
      expect(first.dataKey.equals(second.dataKey)).toBe(false);
      expect(first.wrapped.version).toBe(1);
      expect(first.wrapped.bytes).toHaveLength(61);
      expect(first.wrapped.bytes[0]).toBe(1);
      expect(first.wrapped.bytes.equals(second.wrapped.bytes)).toBe(false);

      const unwrapped = await port.unwrapDataKey(SESSION_HANDLE, first.wrapped.bytes);
      openedBuffers.push(unwrapped);
      expect(unwrapped).toEqual(first.dataKey);
      unwrapped.fill(0x77);
      expect(first.dataKey.equals(unwrapped)).toBe(false);

      const ciphertext = port.seal(SESSION_HANDLE, first.dataKey, plaintext);
      expect(ciphertext).toHaveLength(plaintext.byteLength + 29);
      expect(ciphertext[0]).toBe(1);
      const opened = port.open(SESSION_HANDLE, first.dataKey, ciphertext);
      openedBuffers.push(opened);
      expect(opened).toEqual(plaintext);
      opened.fill(0x78);
      const reopened = port.open(SESSION_HANDLE, first.dataKey, ciphertext);
      openedBuffers.push(reopened);
      expect(reopened).toEqual(plaintext);
    } finally {
      plaintext.fill(0);
      for (const opened of openedBuffers) opened.fill(0);
      first.close();
      second.close();
    }
  });

  it("binds wrapped keys to kind and ref and rejects every malformed fixed envelope", async () => {
    const port = await makePort();
    const lease = await port.createDataKey(SESSION_HANDLE);
    try {
      for (const wrongHandle of [
        { kind: "case", ref: SESSION_HANDLE.ref },
        { kind: "session", ref: CASE_HANDLE.ref }
      ] as const) {
        await expectSupportFailure(
          () => port.unwrapDataKey(wrongHandle, lease.wrapped.bytes),
          "SUPPORT_KEY_AUTHENTICATION_FAILED"
        );
      }

      for (const malformed of [
        changedAt(lease.wrapped.bytes, 0),
        changedAt(lease.wrapped.bytes, 1),
        changedAt(lease.wrapped.bytes, 13),
        changedAt(lease.wrapped.bytes, 45),
        lease.wrapped.bytes.subarray(0, 60),
        Buffer.concat([lease.wrapped.bytes, Buffer.from([0])])
      ]) {
        await expectSupportFailure(
          () => port.unwrapDataKey(SESSION_HANDLE, malformed),
          malformed.byteLength === 61 && malformed[0] === 1
            ? "SUPPORT_KEY_AUTHENTICATION_FAILED"
            : "SUPPORT_WRAPPED_KEY_INVALID"
        );
      }
      await expectSupportFailure(
        () => port.unwrapDataKey(SESSION_HANDLE, Buffer.alloc(61)),
        "SUPPORT_KEY_DESTROYED"
      );
    } finally {
      lease.close();
    }
  });

  it("binds content to kind and ref and authenticates nonce, ciphertext, and tag", async () => {
    const port = await makePort();
    const lease = await port.createDataKey(SESSION_HANDLE);
    const plaintext = Buffer.from("sensitive support message", "utf8");
    try {
      const ciphertext = port.seal(SESSION_HANDLE, lease.dataKey, plaintext);
      for (const [handle, malformed] of [
        [{ kind: "case", ref: SESSION_HANDLE.ref }, ciphertext],
        [{ kind: "session", ref: CASE_HANDLE.ref }, ciphertext],
        [SESSION_HANDLE, changedAt(ciphertext, 1)],
        [SESSION_HANDLE, changedAt(ciphertext, 13)],
        [SESSION_HANDLE, changedAt(ciphertext, ciphertext.byteLength - 1)]
      ] as const) {
        const error = await expectSupportFailure(
          () => port.open(handle, lease.dataKey, malformed),
          "SUPPORT_KEY_AUTHENTICATION_FAILED"
        );
        for (const forbidden of [
          plaintext.toString("utf8"),
          plaintext.toString("hex"),
          lease.dataKey.toString("hex"),
          lease.dataKey.toString("base64")
        ]) expect(error.message).not.toContain(forbidden);
      }
      await expectSupportFailure(
        () => port.open(SESSION_HANDLE, lease.dataKey, changedAt(ciphertext, 0)),
        "SUPPORT_CONTENT_ENVELOPE_INVALID"
      );
      await expectSupportFailure(
        () => port.open(SESSION_HANDLE, lease.dataKey, ciphertext.subarray(0, 28)),
        "SUPPORT_CONTENT_ENVELOPE_INVALID"
      );
    } finally {
      plaintext.fill(0);
      lease.close();
    }
  });

  it("zeroes an idempotently closed lease and refuses its buffer before encryption", async () => {
    const port = await makePort();
    const lease = await port.createDataKey(SESSION_HANDLE);
    lease.close();
    lease.close();
    expect(lease.dataKey).toEqual(Buffer.alloc(32));
    const plaintext = Buffer.from("must never be encrypted", "utf8");
    try {
      const error = await expectSupportFailure(
        () => port.seal(SESSION_HANDLE, lease.dataKey, plaintext),
        "SUPPORT_DATA_KEY_CLOSED"
      );
      expect(error.message).not.toContain(plaintext.toString("utf8"));
    } finally {
      plaintext.fill(0);
    }
  });

  it("zeroes the KEK on idempotent close and rejects every operation as port-closed first", async () => {
    const port = await makePort();
    await port.close();
    await port.close();
    const malformedHandle = { kind: "invalid", ref: "" } as unknown as SupportKeyHandle;
    const operations = [
      () => port.createDataKey(malformedHandle),
      () => port.wrapDataKey(malformedHandle, Buffer.alloc(0)),
      () => port.unwrapDataKey(malformedHandle, Buffer.alloc(0)),
      () => port.seal(malformedHandle, Buffer.alloc(0), Buffer.alloc(0)),
      () => port.open(malformedHandle, Buffer.alloc(0), Buffer.alloc(0))
    ];
    for (const operation of operations) {
      await expectSupportFailure(operation, "SUPPORT_KEY_PORT_CLOSED");
    }
  });

  it("rejects a non-support KEK basename", async () => {
    const supportKekPath = await makeKekPath();
    const identityPath = join(dirname(supportKekPath), "kek.bin");
    await writeFile(identityPath, Buffer.alloc(32, 0x52), { mode: 0o600 });
    await expectSupportFailure(
      () => createSupportKeyPort({ supportKekPath: identityPath }),
      "SUPPORT_KEK_PATH_INVALID"
    );
  });

  it("rejects canonical, inode, and material aliases with protected credential domains", async () => {
    const supportKekPath = await makeKekPath();
    const protectedAlias = join(dirname(supportKekPath), "private-kek-alias.bin");
    await symlink(supportKekPath, protectedAlias);
    await expectSupportFailure(
      () => createSupportKeyPort({ supportKekPath, protectedKeyPaths: [protectedAlias] }),
      "SUPPORT_KEK_CUSTODY_INVALID"
    );

    const protectedCopy = join(dirname(supportKekPath), "private-kek-copy.bin");
    await writeFile(protectedCopy, await readFile(supportKekPath), { mode: 0o600 });
    await expectSupportFailure(
      () => createSupportKeyPort({ supportKekPath, protectedKeyPaths: [protectedCopy] }),
      "SUPPORT_KEK_CUSTODY_INVALID"
    );

    const distinctCredential = join(dirname(supportKekPath), "private-kek-distinct.bin");
    await writeFile(distinctCredential, Buffer.alloc(32, 0x5a), { mode: 0o600 });
    const port = await createSupportKeyPort({
      supportKekPath,
      protectedKeyPaths: [distinctCredential]
    });
    ports.push(port);
  });

  it("rejects symlinked and hardlinked KEKs without changing their targets", async () => {
    const symlinkPath = await makeKekPath();
    const symlinkTarget = join(dirname(symlinkPath), "symlink-target.bin");
    const symlinkMaterial = Buffer.alloc(32, 0x53);
    await writeFile(symlinkTarget, symlinkMaterial, { mode: 0o600 });
    await rm(symlinkPath);
    await symlink(symlinkTarget, symlinkPath);
    await expectSupportFailure(
      () => createSupportKeyPort({ supportKekPath: symlinkPath }),
      "SUPPORT_KEK_CUSTODY_INVALID"
    );
    expect(await readFile(symlinkTarget)).toEqual(symlinkMaterial);

    const hardlinkPath = await makeKekPath();
    const hardlinkTarget = join(dirname(hardlinkPath), "hardlink-target.bin");
    const hardlinkMaterial = Buffer.alloc(32, 0x54);
    await writeFile(hardlinkTarget, hardlinkMaterial, { mode: 0o600 });
    await rm(hardlinkPath);
    await link(hardlinkTarget, hardlinkPath);
    await expectSupportFailure(
      () => createSupportKeyPort({ supportKekPath: hardlinkPath }),
      "SUPPORT_KEK_CUSTODY_INVALID"
    );
    expect(await readFile(hardlinkTarget)).toEqual(hardlinkMaterial);
    expect((await lstat(hardlinkTarget)).nlink).toBe(2);
  });

  it("rejects wrong parent/file mode and short/long KEKs without normalization", async () => {
    const parentModePath = await makeKekPath();
    await chmod(dirname(parentModePath), 0o755);
    await expectSupportFailure(
      () => createSupportKeyPort({ supportKekPath: parentModePath }),
      "SUPPORT_KEK_CUSTODY_INVALID"
    );
    expect((await lstat(dirname(parentModePath))).mode & 0o777).toBe(0o755);

    const fileModePath = await makeKekPath();
    await chmod(fileModePath, 0o640);
    await expectSupportFailure(
      () => createSupportKeyPort({ supportKekPath: fileModePath }),
      "SUPPORT_KEK_CUSTODY_INVALID"
    );
    expect((await lstat(fileModePath)).mode & 0o777).toBe(0o640);

    for (const size of [31, 33]) {
      const sizedPath = await makeKekPath(Buffer.alloc(size, 0x55));
      await expectSupportFailure(
        () => createSupportKeyPort({ supportKekPath: sizedPath }),
        "SUPPORT_KEK_CUSTODY_INVALID"
      );
      expect(await readFile(sizedPath)).toHaveLength(size);
    }
  });

  it("rejects non-regular or wrong-owner KEKs", async () => {
    const directoryPath = await makeKekPath();
    await rm(directoryPath);
    await mkdir(directoryPath, { mode: 0o600 });
    await expectSupportFailure(
      () => createSupportKeyPort({ supportKekPath: directoryPath }),
      "SUPPORT_KEK_CUSTODY_INVALID"
    );

    if (typeof process.getuid === "function") {
      const wrongOwnerPath = await makeKekPath();
      const [parentUid, fileUid] = await Promise.all([
        lstat(dirname(wrongOwnerPath)).then((metadata) => metadata.uid),
        lstat(wrongOwnerPath).then((metadata) => metadata.uid)
      ]);
      vi.spyOn(process, "getuid")
        .mockReturnValueOnce(parentUid)
        .mockReturnValue(fileUid + 1);
      await expectSupportFailure(
        () => createSupportKeyPort({ supportKekPath: wrongOwnerPath }),
        "SUPPORT_KEK_CUSTODY_INVALID"
      );
    }
  });
});
