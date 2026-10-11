import { crc32, deflateRawSync } from "node:zlib";

export class ZipError extends Error {
  constructor(readonly code: "ZIP_ENTRY_NAME_INVALID" | "ZIP_TOO_LARGE") {
    super(code);
    this.name = "ZipError";
  }
}

const UINT32_MAX = 0xffffffff;

function dosDateTime(at: Date): { date: number; time: number } {
  const year = at.getUTCFullYear();
  if (!Number.isFinite(at.getTime()) || year < 1980 || year > 2107) throw new ZipError("ZIP_TOO_LARGE");
  return {
    date: ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1)
  };
}

export function writeZip(entries: readonly { name: string; bytes: Uint8Array }[], modifiedAt: Date): Buffer {
  if (entries.length > 0xffff) throw new ZipError("ZIP_TOO_LARGE");
  const stamp = dosDateTime(modifiedAt);
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  let directorySize = 0;
  for (const entry of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.name) || entry.name === "..") {
      throw new ZipError("ZIP_ENTRY_NAME_INVALID");
    }
    const name = Buffer.from(entry.name, "ascii");
    const raw = Buffer.from(entry.bytes);
    const method = raw.length < 64 ? 0 : 8;
    const compressed = method === 0 ? raw : deflateRawSync(raw, { level: 9 });
    const localSize = 30 + name.length + compressed.length;
    const centralSize = 46 + name.length;
    if (raw.length > UINT32_MAX || compressed.length > UINT32_MAX || offset + localSize > UINT32_MAX || directorySize + centralSize > UINT32_MAX) {
      throw new ZipError("ZIP_TOO_LARGE");
    }
    const checksum = crc32(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(stamp.time, 10);
    header.writeUInt16LE(stamp.date, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0, 8);
    record.writeUInt16LE(method, 10);
    record.writeUInt16LE(stamp.time, 12);
    record.writeUInt16LE(stamp.date, 14);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(raw.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += localSize;
    directorySize += centralSize;
  }
  if (offset + directorySize + 22 > UINT32_MAX) throw new ZipError("ZIP_TOO_LARGE");
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
