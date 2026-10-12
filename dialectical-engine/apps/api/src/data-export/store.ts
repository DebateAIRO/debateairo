import * as nodeFs from "node:fs/promises";
import { join } from "node:path";
import {
  decrypt,
  encrypt,
  generateDek,
  type AeadAad,
  type CryptoEnvelope,
  type ReadableUserDekStore
} from "@debateai/crypto";

export interface DataExportStoreFs {
  readonly mkdir: typeof nodeFs.mkdir;
  readonly writeFile: (path: string, data: string | Uint8Array, options: { mode: number; flag: string }) => Promise<void>;
  readonly rename: typeof nodeFs.rename;
  readonly readFile: typeof nodeFs.readFile;
  readonly unlink: typeof nodeFs.unlink;
  readonly readdir: typeof nodeFs.readdir;
}

export type DataExportStoreErrorCode =
  | "DATA_EXPORT_KEY_DESTROYED"
  | "DATA_EXPORT_ARCHIVE_MISSING"
  | "DATA_EXPORT_STORE_UNREADABLE";

export class DataExportStoreError extends Error {
  constructor(readonly code: DataExportStoreErrorCode) {
    super(code);
    this.name = "DataExportStoreError";
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function keyAad(exportId: string, userId: string): AeadAad {
  return ["identity", "data_export", exportId, exportId, userId, "data-export-key", "1"];
}

function archiveAad(exportId: string, userId: string): AeadAad {
  return ["identity", "data_export", exportId, exportId, userId, "data-export-archive", "1"];
}

export class FileDataExportStore {
  private readonly directory: string;
  private readonly users: Pick<ReadableUserDekStore, "load">;
  private readonly fs: DataExportStoreFs;

  constructor(input: { directory: string; users: Pick<ReadableUserDekStore, "load">; fs?: DataExportStoreFs }) {
    this.directory = input.directory;
    this.users = input.users;
    this.fs = input.fs ?? nodeFs;
  }

  async write(exportId: string, userId: string, zip: Buffer): Promise<void> {
    let userDek: Buffer;
    try {
      userDek = await this.users.load(userId);
    } catch {
      throw new DataExportStoreError("DATA_EXPORT_KEY_DESTROYED");
    }
    const key = generateDek();
    try {
      const keyEnvelope = encrypt(userDek, key, keyAad(exportId, userId));
      const archiveEnvelope = encrypt(key, zip, archiveAad(exportId, userId));
      await this.fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      await this.writeEnvelope(`${exportId}.key`, keyEnvelope);
      await this.writeEnvelope(`${exportId}.zip.enc`, archiveEnvelope);
    } catch (error) {
      if (error instanceof DataExportStoreError) throw error;
      throw new DataExportStoreError("DATA_EXPORT_STORE_UNREADABLE");
    } finally {
      key.fill(0);
      userDek.fill(0);
    }
  }

  async read(exportId: string, userId: string): Promise<Buffer> {
    const keyEnvelope = await this.readEnvelope(`${exportId}.key`, "DATA_EXPORT_KEY_DESTROYED");
    let userDek: Buffer;
    try {
      userDek = await this.users.load(userId);
    } catch {
      throw new DataExportStoreError("DATA_EXPORT_KEY_DESTROYED");
    }
    let key: Buffer;
    try {
      key = decrypt(userDek, keyEnvelope, keyAad(exportId, userId));
    } catch {
      throw new DataExportStoreError("DATA_EXPORT_STORE_UNREADABLE");
    } finally {
      userDek.fill(0);
    }
    try {
      const archiveEnvelope = await this.readEnvelope(`${exportId}.zip.enc`, "DATA_EXPORT_ARCHIVE_MISSING");
      return decrypt(key, archiveEnvelope, archiveAad(exportId, userId));
    } catch (error) {
      if (error instanceof DataExportStoreError) throw error;
      throw new DataExportStoreError("DATA_EXPORT_STORE_UNREADABLE");
    } finally {
      key.fill(0);
    }
  }

  async destroyKey(exportId: string): Promise<"DESTROYED" | "ALREADY_ABSENT"> {
    const key = await this.unlinkIfPresent(`${exportId}.key`);
    const temporary = await this.unlinkIfPresent(`${exportId}.key.tmp`);
    return key || temporary ? "DESTROYED" : "ALREADY_ABSENT";
  }

  async deleteArchive(exportId: string): Promise<void> {
    await this.unlinkIfPresent(`${exportId}.zip.enc`);
    await this.unlinkIfPresent(`${exportId}.zip.enc.tmp`);
  }

  async listIds(): Promise<string[]> {
    try {
      const ids = (await this.fs.readdir(this.directory)).flatMap((name) => {
        const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(?:key|zip\.enc)(?:\.tmp)?$/.exec(name);
        return match ? [match[1]!] : [];
      });
      return [...new Set(ids)].sort();
    } catch (error) {
      if (isMissing(error)) return [];
      throw new DataExportStoreError("DATA_EXPORT_STORE_UNREADABLE");
    }
  }

  private async unlinkIfPresent(name: string): Promise<boolean> {
    try {
      await this.fs.unlink(join(this.directory, name));
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw new DataExportStoreError("DATA_EXPORT_STORE_UNREADABLE");
    }
  }

  private async writeEnvelope(name: string, envelope: CryptoEnvelope): Promise<void> {
    const location = join(this.directory, name);
    const temporary = `${location}.tmp`;
    await this.fs.writeFile(temporary, JSON.stringify(envelope), { mode: 0o600, flag: "w" });
    await this.fs.rename(temporary, location);
  }

  private async readEnvelope(name: string, missingCode: DataExportStoreErrorCode): Promise<CryptoEnvelope> {
    try {
      const bytes = await this.fs.readFile(join(this.directory, name));
      return JSON.parse(bytes.toString("utf8")) as CryptoEnvelope;
    } catch (error) {
      throw new DataExportStoreError(isMissing(error) ? missingCode : "DATA_EXPORT_STORE_UNREADABLE");
    }
  }
}
