import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DL2-F7. Two places in the support key module left key material behind.
 *
 * (a) `readSupportKek` and `readProtectedKeyIdentity` read the 32 KEK bytes and
 *     only afterwards build the identity record. A `realpath` that rejects after
 *     the read — or a short read — dropped that buffer un-zeroed, because only
 *     the record's copy was ever zeroed on the failure path.
 *
 * (b) `unwrapDataKey` and `openContent` returned `Buffer.concat([update, final])`.
 *     `concat` of small pieces answers from Node's shared 8 KiB slab, and the two
 *     cipher outputs it copied from stay in that slab un-zeroed: a data key and
 *     every decrypted support message existed in more memory than the caller
 *     could ever erase, and the caller's own `fill(0)` reached only its view.
 *
 * Both are observed here rather than argued: the bytes the loader read are
 * asserted zero after the failure, and every buffer the cipher produced is
 * asserted zero after the call returns.
 */

const readMaterials: Buffer[] = [];
const cipherOutputs: Buffer[] = [];
let realpathRejectsAfterRead = false;

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    default: actual,
    async open(...args: Parameters<typeof actual.open>) {
      const handle = await actual.open(...args);
      return new Proxy(handle, {
        get(target, property) {
          const value = Reflect.get(target, property, target) as unknown;
          if (property !== "readFile") {
            return typeof value === "function" ? (value as () => unknown).bind(target) : value;
          }
          return async (...readArgs: unknown[]) => {
            const material = await (value as (...rest: unknown[]) => Promise<Buffer>)
              .apply(target, readArgs);
            readMaterials.push(material);
            return material;
          };
        }
      });
    },
    async realpath(...args: Parameters<typeof actual.realpath>) {
      if (realpathRejectsAfterRead) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
      return actual.realpath(...args);
    }
  };
});

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    default: actual,
    createDecipheriv(...args: Parameters<typeof actual.createDecipheriv>) {
      const decipher = actual.createDecipheriv(...(args as Parameters<typeof actual.createDecipheriv>));
      return new Proxy(decipher, {
        get(target, property) {
          const value = Reflect.get(target, property, target) as unknown;
          if (typeof value !== "function") return value;
          const bound = (value as (...rest: unknown[]) => unknown).bind(target);
          if (property !== "update" && property !== "final") return bound;
          return (...rest: unknown[]) => {
            const produced = bound(...rest);
            if (Buffer.isBuffer(produced)) cipherOutputs.push(produced);
            return produced;
          };
        }
      });
    }
  };
});

const { mkdir, mkdtemp, rm, writeFile } = await import("node:fs/promises");
const { SupportKeyError, createSupportKeyPort } =
  await import("../../apps/api/src/support/keys.js");
type SupportContentContext =
  import("../../apps/api/src/support/keys.js").SupportContentContext;
type SupportKeyHandle = import("../../apps/api/src/support/keys.js").SupportKeyHandle;
type SupportKeyPort = import("../../apps/api/src/support/keys.js").SupportKeyPort;

const temporaryRoots: string[] = [];
const ports: SupportKeyPort[] = [];
const SESSION_HANDLE = Object.freeze({
  kind: "session",
  ref: "11111111-1111-4111-8111-111111111111"
}) satisfies SupportKeyHandle;
const CONTEXT = Object.freeze({
  kind: "session-message", sessionId: SESSION_HANDLE.ref,
  messageId: "22222222-2222-4222-8222-222222222222",
  role: "user", outcome: "ANSWER_GROUNDED", purpose: "content"
}) satisfies SupportContentContext;

async function makeKekPath(material: Buffer = Buffer.alloc(32, 0x51)): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "debateai-dl2-f7-"));
  temporaryRoots.push(root);
  const directory = join(root, "secrets");
  await mkdir(directory, { mode: 0o700 });
  const supportKekPath = join(directory, "support-kek.bin");
  await writeFile(supportKekPath, material, { mode: 0o600 });
  return supportKekPath;
}

async function makePort(): Promise<SupportKeyPort> {
  const port = await createSupportKeyPort({ supportKekPath: await makeKekPath() });
  ports.push(port);
  return port;
}

beforeEach(() => {
  readMaterials.length = 0;
  cipherOutputs.length = 0;
  realpathRejectsAfterRead = false;
});

afterEach(async () => {
  realpathRejectsAfterRead = false;
  await Promise.all(ports.splice(0).map((port) => port.close()));
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("DL2-F7 the support key module leaves no key material behind", () => {
  it("zeroes the KEK bytes it read when the loader fails after the read", async () => {
    const supportKekPath = await makeKekPath();
    realpathRejectsAfterRead = true;
    const failure = await createSupportKeyPort({ supportKekPath }).then(
      () => { throw new Error("a KEK whose realpath failed was accepted"); },
      (caught: unknown) => caught
    );
    expect(failure).toBeInstanceOf(SupportKeyError);
    expect(failure).toMatchObject({ code: "SUPPORT_KEK_CUSTODY_INVALID" });
    // The read happened: the failure is after it, which is the whole point.
    expect(readMaterials).toHaveLength(1);
    expect(readMaterials[0]).toHaveLength(32);
    expect(readMaterials[0]).toEqual(Buffer.alloc(32));
  });

  // Already true before this fix; kept so the two loaders cannot drift apart.
  it("zeroes the protected-key bytes it read when the comparison refuses", async () => {
    const supportKekPath = await makeKekPath();
    const protectedPath = join(supportKekPath, "..", "kek.bin");
    // The same 32 bytes under another name: the loader must refuse the alias.
    await writeFile(protectedPath, Buffer.alloc(32, 0x51), { mode: 0o600 });
    const failure = await createSupportKeyPort({
      supportKekPath, protectedKeyPaths: [protectedPath]
    }).then(
      () => { throw new Error("a support KEK equal to a protected key was accepted"); },
      (caught: unknown) => caught
    );
    expect(failure).toMatchObject({ code: "SUPPORT_KEK_CUSTODY_INVALID" });
    expect(readMaterials).toHaveLength(2);
    for (const material of readMaterials) expect(material).toEqual(Buffer.alloc(32));
  });

  it("hands back a data key on its own allocation and leaves no cipher output un-zeroed", async () => {
    const port = await makePort();
    const lease = await port.createDataKey(SESSION_HANDLE);
    try {
      cipherOutputs.length = 0;
      const unwrapped = await port.unwrapDataKey(SESSION_HANDLE, lease.wrapped.bytes);
      try {
        expect(unwrapped).toEqual(lease.dataKey);
        // Its own exact-size allocation, never a view into Node's shared slab,
        // so the caller's `fill(0)` really erases the key and nothing else.
        expect(unwrapped.byteOffset).toBe(0);
        expect(unwrapped.buffer.byteLength).toBe(unwrapped.byteLength);
        expect(cipherOutputs.length).toBeGreaterThan(0);
        for (const produced of cipherOutputs) {
          expect(produced).toEqual(Buffer.alloc(produced.byteLength));
        }
      } finally {
        unwrapped.fill(0);
      }
    } finally {
      lease.close();
    }
  });

  it("hands back decrypted content on its own allocation and zeroes every cipher output", async () => {
    const port = await makePort();
    const lease = await port.createDataKey(SESSION_HANDLE);
    const plaintext = Buffer.from("a support message nobody else may keep", "utf8");
    try {
      const sealed = port.sealContent(CONTEXT, lease.dataKey, plaintext);
      cipherOutputs.length = 0;
      const opened = port.openContent(CONTEXT, lease.dataKey, sealed);
      try {
        expect(opened).toEqual(plaintext);
        expect(opened.byteOffset).toBe(0);
        expect(opened.buffer.byteLength).toBe(opened.byteLength);
        expect(cipherOutputs.length).toBeGreaterThan(0);
        for (const produced of cipherOutputs) {
          expect(produced).toEqual(Buffer.alloc(produced.byteLength));
        }
      } finally {
        opened.fill(0);
      }
    } finally {
      plaintext.fill(0);
      lease.close();
    }
  });
});
