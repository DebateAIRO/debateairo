import { randomUUID } from "node:crypto";
import { accessSync, constants, statSync } from "node:fs";
import { open, readdir, readFile, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { TypedDomainError } from "@debateai/kernel";
import { z } from "zod";
import { openSpooledNotice, sealSpooledNotice } from "./records.js";

/** One kept message, as the replay reads it: its arrival, and the bytes and header exactly as NETOPIA sent them. */
export type SpooledNotice = Readonly<{ rawBody: Buffer; header: string | undefined; receivedAt: Date }>;
export type SpoolEntry = Readonly<{ spoolId: string; receivedAt: Date }>;

const SPOOL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SPOOL_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/u;
const Base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/u);
const SpoolFileSchema = z.object({
  v: z.literal(1),
  receivedAt: z.string().datetime(),
  keyId: z.string().regex(/^[0-9a-f]{16}$/u),
  raw: Base64.min(1),
  header: Base64.min(1).nullable()
}).strict();

/**
 * B3a (NETOPIA answers 2026-10-21): NETOPIA sends the saved card only in its FIRST message about a payment, and resends
 * a failed delivery 5 times, 5 minutes apart, without it. A verified message the database could not take is therefore
 * kept here, one file per message, until the replay (at every start and every 10 minutes) stores it.
 *
 * `<spoolId>.json`, mode 0600: `{"v":1,"receivedAt":"<ISO>","keyId":"…","raw":"<base64>","header":"<base64>"|null}`,
 * `raw` and `header` sealed under the records key with the file's own spool id in their AAD (records.ts
 * `sealSpooledNotice`), so nothing in it is readable without the key and no seal opens under another file's name.
 * Written atomically: a `.<spoolId>.tmp` created exclusively, written, flushed and closed, renamed, and the folder
 * flushed (best effort, C4), so a crash leaves either a whole file or a temporary one, which is never listed.
 */
export class NoticeSpool {
  constructor(private readonly deps: Readonly<{ directory: string; recordsKey: Buffer }>) {}

  /** Keeps one message; returns its spool id. Throws when the folder cannot take it (the intake catches that). */
  async put(input: SpooledNotice): Promise<string> {
    const spoolId = randomUUID();
    const sealed = sealSpooledNotice(this.deps.recordsKey, spoolId, input.rawBody, input.header);
    const content = JSON.stringify({
      v: 1, receivedAt: input.receivedAt.toISOString(), keyId: sealed.keyId, raw: sealed.rawCiphertext.toString("base64"),
      header: sealed.headerCiphertext === null ? null : sealed.headerCiphertext.toString("base64")
    });
    const temporary = join(this.deps.directory, `.${spoolId}.tmp`);
    const handle = await open(temporary, "wx", 0o600);
    try {
      try {
        await handle.writeFile(content, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.fileOf(spoolId));
    } catch (error) {
      // A full or failing disk: the half-written temporary file goes, so the folder never fills with them.
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    // C4: the folder flush is best effort. The file is already in place under its final name and will be replayed, so
    // a folder that cannot be opened or flushed now never turns a kept message into a failure.
    try {
      const folder = await open(this.deps.directory, "r");
      try {
        await folder.sync();
      } finally {
        await folder.close();
      }
    } catch {
      // Kept: only the folder entry's durability across a power cut is not proved.
    }
    return spoolId;
  }

  /**
   * The kept messages, oldest arrival first (then by id), at most `limit`. Only `<uuid>.json` files are listed, never
   * a `.tmp` leftover; a file that does not parse is listed by its modification time, so the replay keeps it and
   * drops it once it is 14 days old.
   */
  async entries(limit: number): Promise<ReadonlyArray<SpoolEntry>> {
    const listed: SpoolEntry[] = [];
    for (const name of await readdir(this.deps.directory)) {
      const spoolId = SPOOL_FILE.exec(name)?.[1];
      if (spoolId === undefined) continue;
      const receivedAt = await this.arrivalOf(spoolId);
      if (receivedAt !== null) listed.push(Object.freeze({ spoolId, receivedAt }));
    }
    listed.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime() || (a.spoolId < b.spoolId ? -1 : 1));
    return Object.freeze(listed.slice(0, Math.max(0, limit)));
  }

  /** One kept message, opened. The caller owns `rawBody` and wipes it when done. Throws for any file that does not open. */
  async open(spoolId: string): Promise<SpooledNotice> {
    const content = SpoolFileSchema.parse(JSON.parse(await readFile(this.fileOf(spoolId), "utf8")));
    const opened = openSpooledNotice(this.deps.recordsKey, spoolId, {
      rawCiphertext: Buffer.from(content.raw, "base64"),
      headerCiphertext: content.header === null ? null : Buffer.from(content.header, "base64")
    });
    return Object.freeze({ rawBody: opened.rawBody, header: opened.header, receivedAt: new Date(content.receivedAt) });
  }

  /** Removes one kept message; a file already gone is not an error (two replays may meet). */
  async remove(spoolId: string): Promise<void> {
    try {
      await unlink(this.fileOf(spoolId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  /** The file's own `receivedAt`, else its modification time; null for a file removed meanwhile. */
  private async arrivalOf(spoolId: string): Promise<Date | null> {
    try {
      const parsed = SpoolFileSchema.safeParse(JSON.parse(await readFile(this.fileOf(spoolId), "utf8")));
      if (parsed.success) return new Date(parsed.data.receivedAt);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    }
    try {
      return (await stat(this.fileOf(spoolId))).mtime;
    } catch {
      return null;
    }
  }

  /** A spool id is always one of our UUIDs, so no name ever reaches a path outside the folder. */
  private fileOf(spoolId: string): string {
    if (!SPOOL_ID.test(spoolId)) throw new TypedDomainError("BILLING_NOTICE_SPOOL_ID_INVALID", "BILLING_NOTICE_SPOOL_ID_INVALID");
    return join(this.deps.directory, `${spoolId}.json`);
  }
}

/**
 * B3a: BILLING_NOTICE_SPOOL_PATH, when set, must name an existing folder this process can write, or the API refuses to
 * start (BILLING_NOTICE_SPOOL_PATH_INVALID): a spool that cannot keep a message would lose the card it was set up for.
 * The message names the code only, never the path.
 */
export function assertNoticeSpoolDirectory(path: string): string {
  try {
    if (!statSync(path).isDirectory()) throw new Error("not a folder");
    accessSync(path, constants.W_OK);
  } catch {
    throw new TypedDomainError("BILLING_NOTICE_SPOOL_PATH_INVALID", "BILLING_NOTICE_SPOOL_PATH_INVALID");
  }
  return path;
}
