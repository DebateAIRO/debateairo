// tests/unit/billing-notice-spool.test.ts
// B3a (NETOPIA answers 2026-10-21): the saved card comes only in NETOPIA's FIRST message, so a verified message the
// database could not take is kept on disk, sealed under the records key, one file per message, until it is replayed.
import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertNoticeSpoolDirectory, NoticeSpool } from "../../apps/api/src/billing/notice-spool.js";
import { TEST_RECORDS_KEY } from "../support/billingSubscriptionFixtures.js";

const AT = new Date("2026-10-21T08:00:00.000Z");
const later = (minutes: number): Date => new Date(AT.getTime() + minutes * 60_000);
const BODY = Buffer.from(JSON.stringify({ payment: { status: 3, binding: { token: ["tok", "spool", "1a2b"].join("-") } } }), "utf8");
const HEADER = ["eyJhbGciOiJSUzUxMiJ9", "eyJzdWIiOiJ4In0", "c2lnbmF0dXJl"].join(".");

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "spool-"));
});
afterEach(async () => {
  await chmod(directory, 0o700).catch(() => undefined);
  await rm(directory, { recursive: true, force: true });
});

const spool = (): NoticeSpool => new NoticeSpool({ directory, recordsKey: TEST_RECORDS_KEY });
const fileOf = (spoolId: string): string => join(directory, `${spoolId}.json`);

describe("B3a the notice spool's files", () => {
  it("round-trips a message: put, then entries, then open give back the same bytes, header and arrival", async () => {
    const spoolId = await spool().put({ rawBody: BODY, header: HEADER, receivedAt: AT });
    expect(await spool().entries(10)).toEqual([{ spoolId, receivedAt: AT }]);
    const opened = await spool().open(spoolId);
    expect(opened.rawBody.equals(BODY)).toBe(true);
    expect(opened.header).toBe(HEADER);
    expect(opened.receivedAt).toEqual(AT);
    const missing = await spool().put({ rawBody: BODY, header: undefined, receivedAt: AT });
    expect((await spool().open(missing)).header).toBeUndefined();
  });

  it("writes one owner-only file in the documented format, the body and header sealed, never in clear", async () => {
    const spoolId = await spool().put({ rawBody: BODY, header: HEADER, receivedAt: AT });
    expect(await readdir(directory)).toEqual([`${spoolId}.json`]);
    expect((await stat(fileOf(spoolId))).mode & 0o777).toBe(0o600);
    const text = await readFile(fileOf(spoolId), "utf8");
    const content = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(content).sort()).toEqual(["header", "keyId", "raw", "receivedAt", "v"]);
    expect(content).toMatchObject({ v: 1, receivedAt: AT.toISOString() });
    expect(content.keyId).toMatch(/^[0-9a-f]{16}$/u);
    expect(text).not.toContain("spool-1a2b");
    expect(text).not.toContain(HEADER);
  });

  it("refuses to open a file whose ciphertext was changed by one byte", async () => {
    const spoolId = await spool().put({ rawBody: BODY, header: HEADER, receivedAt: AT });
    const content = JSON.parse(await readFile(fileOf(spoolId), "utf8")) as { raw: string };
    const raw = Buffer.from(content.raw, "base64");
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 0x01;
    await writeFile(fileOf(spoolId), JSON.stringify({ ...content, raw: raw.toString("base64") }));
    await expect(spool().open(spoolId)).rejects.toThrow();
  });

  it("refuses to open a file renamed to another spool id (the seal names its own id)", async () => {
    const spoolId = await spool().put({ rawBody: BODY, header: HEADER, receivedAt: AT });
    const other = randomUUID();
    await rename(fileOf(spoolId), fileOf(other));
    expect((await spool().entries(10)).map((entry) => entry.spoolId)).toEqual([other]);
    await expect(spool().open(other)).rejects.toThrow();
  });

  it("refuses to open a file sealed under another records key", async () => {
    const spoolId = await new NoticeSpool({ directory, recordsKey: Buffer.alloc(32, 9) })
      .put({ rawBody: BODY, header: HEADER, receivedAt: AT });
    await expect(spool().open(spoolId)).rejects.toThrow();
  });

  it("lists only finished files, oldest arrival first, at most `limit`", async () => {
    const newest = await spool().put({ rawBody: BODY, header: HEADER, receivedAt: later(30) });
    const oldest = await spool().put({ rawBody: BODY, header: HEADER, receivedAt: AT });
    const middle = await spool().put({ rawBody: BODY, header: HEADER, receivedAt: later(10) });
    // A write cut short leaves its temporary file; it is never a message.
    await writeFile(join(directory, `.${randomUUID()}.tmp`), "half a file", { mode: 0o600 });
    await writeFile(join(directory, "notes.txt"), "not ours", { mode: 0o600 });
    expect(await spool().entries(2)).toEqual([{ spoolId: oldest, receivedAt: AT }, { spoolId: middle, receivedAt: later(10) }]);
    expect((await spool().entries(10)).map((entry) => entry.spoolId)).toEqual([oldest, middle, newest]);
  });

  it("lists a file that does not parse by its modification time, and removes a file (twice is harmless)", async () => {
    const broken = randomUUID();
    await writeFile(fileOf(broken), "{not json", { mode: 0o600 });
    await utimes(fileOf(broken), later(5), later(5));
    const spoolId = await spool().put({ rawBody: BODY, header: HEADER, receivedAt: AT });
    expect(await spool().entries(10)).toEqual([{ spoolId, receivedAt: AT }, { spoolId: broken, receivedAt: later(5) }]);
    await expect(spool().open(broken)).rejects.toThrow();
    await spool().remove(broken);
    await spool().remove(broken);
    expect(await readdir(directory)).toEqual([`${spoolId}.json`]);
  });

  it("refuses a spool id that is not one of its own (no path outside the folder is ever read)", async () => {
    await expect(spool().open("../escape")).rejects.toThrow();
    await expect(spool().remove("../escape")).rejects.toThrow();
  });

  it("puts nothing and throws when the folder is gone (the intake catches it)", async () => {
    await rm(directory, { recursive: true, force: true });
    await expect(spool().put({ rawBody: BODY, header: HEADER, receivedAt: AT })).rejects.toThrow();
  });

  it("C4: a folder flush that fails after the rename does not throw: the file is in place and will be replayed", async () => {
    // Write and search, but no read: the temporary file and the rename work, opening the folder itself does not.
    await chmod(directory, 0o300);
    const spoolId = await spool().put({ rawBody: BODY, header: HEADER, receivedAt: AT });
    await chmod(directory, 0o700);
    expect(await readdir(directory)).toEqual([`${spoolId}.json`]);
    expect((await spool().open(spoolId)).rawBody.equals(BODY)).toBe(true);
  });
});

describe("B3a the start's check of BILLING_NOTICE_SPOOL_PATH", () => {
  it("accepts an existing writable folder and refuses a missing path, a file or a read-only folder by code", async () => {
    expect(assertNoticeSpoolDirectory(directory)).toBe(directory);
    const refused = (path: string): unknown => {
      try {
        assertNoticeSpoolDirectory(path);
        return null;
      } catch (error) {
        return (error as { code?: unknown }).code;
      }
    };
    expect(refused(join(directory, "missing"))).toBe("BILLING_NOTICE_SPOOL_PATH_INVALID");
    const file = join(directory, "a-file");
    await writeFile(file, "x", { mode: 0o600 });
    expect(refused(file)).toBe("BILLING_NOTICE_SPOOL_PATH_INVALID");
    const readOnly = join(directory, "read-only");
    await mkdir(readOnly, { mode: 0o700 });
    await chmod(readOnly, 0o500);
    try {
      // A root test runner may write anywhere; the refusal is then not observable.
      if (process.getuid?.() !== 0) expect(refused(readOnly)).toBe("BILLING_NOTICE_SPOOL_PATH_INVALID");
    } finally {
      await chmod(readOnly, 0o700);
    }
  });
});
