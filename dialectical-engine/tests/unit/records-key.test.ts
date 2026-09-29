import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  openRecord,
  readCustodyTextSecretBytes,
  recordsKeyId,
  sealRecord,
  type RecordAad
} from "@debateai/crypto";
import { parseApiEnvironment } from "../../packages/register/src/runtime-environment.js";
import { validApiEnvironmentFixture } from "../support/apiEnvironmentFixture.js";

const AAD: RecordAad = Object.freeze({
  table: "legal.acceptance",
  column: "evidence_ciphertext",
  rowId: "5b0f2a3e-6c1d-4e8f-9a7b-1c2d3e4f5a6b"
});
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A custody-shaped file: 0600 inside a 0700 directory owned by this process. */
async function custodyFile(contents: Buffer | string, mode = 0o600): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "records-key-"));
  roots.push(root);
  const directory = join(root, "secrets");
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
  const path = join(directory, "secret.txt");
  await writeFile(path, contents, { mode });
  await chmod(path, mode);
  return path;
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe("the records key (paid plans L1, spec §2.3.1)", () => {
  it("names a key by the first 16 hex of sha256('debateai.records.v1' || key)", () => {
    const key = Buffer.alloc(32, 0x42);
    const expected = createHash("sha256")
      .update("debateai.records.v1", "utf8").update(key).digest("hex").slice(0, 16);
    expect(recordsKeyId(key)).toBe(expected);
    expect(recordsKeyId(Buffer.alloc(32, 0x43))).not.toBe(expected);
  });

  it("seals and opens a record bound to its table, column and row, with a fresh nonce each time", () => {
    const key = randomBytes(32);
    const plaintext = Buffer.from(JSON.stringify({ ip: "81.196.1.2", user_agent: "test/1" }), "utf8");
    const sealed = sealRecord(key, AAD, plaintext);
    expect(sealed.keyId).toBe(recordsKeyId(key));
    expect(sealed.ciphertext.includes(plaintext)).toBe(false);
    expect(openRecord(key, AAD, sealed.ciphertext).equals(plaintext)).toBe(true);
    expect(sealRecord(key, AAD, plaintext).ciphertext.equals(sealed.ciphertext)).toBe(false);
  });

  it("accepts a 32-hex row id (billing charge ids) as well as a uuid", () => {
    const key = randomBytes(32);
    const aad = { ...AAD, rowId: "0123456789abcdef0123456789abcdef" };
    const sealed = sealRecord(key, aad, Buffer.from("x"));
    expect(openRecord(key, aad, sealed.ciphertext).toString("utf8")).toBe("x");
  });

  it("refuses a record opened under another row, column, table or key, and a tampered one", () => {
    const key = randomBytes(32);
    const sealed = sealRecord(key, AAD, Buffer.from("evidence"));
    for (const other of [
      { ...AAD, rowId: "5b0f2a3e-6c1d-4e8f-9a7b-1c2d3e4f5a6c" },
      { ...AAD, column: "profile_ciphertext" },
      { ...AAD, table: "billing.location_evidence" }
    ]) {
      expect(codeOf(() => openRecord(key, other, sealed.ciphertext))).toBe("RECORD_DECRYPT_FAILED");
    }
    expect(codeOf(() => openRecord(randomBytes(32), AAD, sealed.ciphertext))).toBe("RECORD_DECRYPT_FAILED");
    const tampered = Buffer.from(sealed.ciphertext);
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0x01;
    expect(codeOf(() => openRecord(key, AAD, tampered))).toBe("RECORD_DECRYPT_FAILED");
    expect(codeOf(() => openRecord(key, AAD, sealed.ciphertext.subarray(0, 20)))).toBe("RECORD_DECRYPT_FAILED");
  });

  it("refuses a key that is not 32 bytes and a row id that is not an id", () => {
    expect(codeOf(() => sealRecord(Buffer.alloc(31), AAD, Buffer.from("x")))).toBe("RECORD_KEY_INVALID");
    expect(codeOf(() => sealRecord(randomBytes(32), { ...AAD, rowId: "row-1" }, Buffer.from("x"))))
      .toBe("RECORD_AAD_INVALID");
    expect(codeOf(() => sealRecord(randomBytes(32), { ...AAD, table: "acceptance" }, Buffer.from("x"))))
      .toBe("RECORD_AAD_INVALID");
  });
});

describe("readCustodyTextSecretBytes (amendment A23)", () => {
  it("returns one printable line, trimmed, in its own zeroable buffer", async () => {
    const value = readCustodyTextSecretBytes(await custodyFile("  sk_test_abc123  \n"));
    expect(Buffer.isBuffer(value)).toBe(true);
    expect(value.toString("latin1")).toBe("sk_test_abc123");
    value.fill(0);
    expect(value.every((byte) => byte === 0)).toBe(true);
    expect(readCustodyTextSecretBytes(await custodyFile("abc\r\n")).toString("latin1")).toBe("abc");
  });

  it("refuses a second line, a control byte, a blank file, a missing file and loose custody", async () => {
    expect(codeOf(() => readCustodyTextSecretBytes("/nonexistent/debateai-secret"))).toBe("SECRET_TEXT_ABSENT");
    const twoLines = await custodyFile("first\nsecond\n");
    expect(codeOf(() => readCustodyTextSecretBytes(twoLines))).toBe("SECRET_TEXT_INVALID");
    const control = await custodyFile("ab\u0007c\n");
    expect(codeOf(() => readCustodyTextSecretBytes(control))).toBe("SECRET_TEXT_INVALID");
    const blank = await custodyFile("   \n");
    expect(codeOf(() => readCustodyTextSecretBytes(blank))).toBe("SECRET_TEXT_INVALID");
    const loose = await custodyFile("abc\n", 0o644);
    expect(codeOf(() => readCustodyTextSecretBytes(loose))).toBe("SECRET_CUSTODY_INVALID");
  });
});

describe("RECORDS_KEY_PATH in the API environment and boot", () => {
  it("is required always and must name its own file", () => {
    const fixture = validApiEnvironmentFixture();
    expect(parseApiEnvironment(fixture).RECORDS_KEY_PATH).toBe("/run/secrets/records-key");
    expect(() => parseApiEnvironment({ ...fixture, RECORDS_KEY_PATH: undefined })).toThrow();
    for (const other of ["KEK_PATH", "SUPPORT_KEK_PATH", "BLIND_INDEX_KEY_PATH", "AUDIT_SOURCE_IP_SALT_PATH"] as const) {
      expect(() => parseApiEnvironment({ ...fixture, RECORDS_KEY_PATH: fixture[other]! }))
        .toThrow("RECORDS_KEY_PATH_MUST_BE_SEPARATE");
    }
  });

  it("is loaded under the ledger after the two plain secrets are held, held before the first stage, domain-checked, protected and zeroed", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const blindIndexHold = main.indexOf("boot.hold({ end: async () => { blindIndexKey.fill(0); } });");
    const saltHold = main.indexOf("boot.hold({ end: async () => { sourceIpSalt.fill(0); } });");
    const load = main.indexOf(
      'const recordsKey = boot.runSync("records-key", () => loadSecretKey(environment.RECORDS_KEY_PATH));'
    );
    const hold = main.indexOf("boot.hold({ end: async () => { recordsKey.fill(0); } });");
    // DL7-F7: a missing or mis-permissioned records key must find the blind-index key and the audit
    // salt already held, so the refusal zeroes them with the KEKs. Each anchor must exist: a renamed
    // line fails here instead of passing without checking anything.
    expect(blindIndexHold).toBeGreaterThan(-1);
    expect(saltHold).toBeGreaterThan(-1);
    expect(load).toBeGreaterThan(-1);
    expect(load).toBeGreaterThan(blindIndexHold);
    expect(load).toBeGreaterThan(saltHold);
    expect(hold).toBeGreaterThan(load);
    expect(hold).toBeLessThan(main.indexOf("await boot.run("));
    expect(main).toContain("{ path: environment.RECORDS_KEY_PATH, material: recordsKey }");
    const protectedStart = main.indexOf("protectedKeyPaths: [");
    const protectedPaths = main.slice(protectedStart, main.indexOf("].filter(", protectedStart));
    expect(protectedPaths).toContain("environment.RECORDS_KEY_PATH");
    const startup = main.slice(main.indexOf("installStartupResourceOwner({"), main.indexOf("boot.release()"));
    expect(startup).toContain("{ end: async () => { recordsKey.fill(0); } }");
  });
});
