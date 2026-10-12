import { inflateRawSync } from "node:zlib";

/** Read the central directory so tests do not depend on the writer's entry order logic. */
export function readZip(bytes: Uint8Array): { name: string; bytes: Buffer }[] {
  const zip = Buffer.from(bytes);
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("ZIP end of central directory missing");
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const entries: { name: string; bytes: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error("ZIP central directory corrupt");
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const nameSize = zip.readUInt16LE(cursor + 28);
    const extraSize = zip.readUInt16LE(cursor + 30);
    const commentSize = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameSize).toString("ascii");
    if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("ZIP local header corrupt");
    const dataAt = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const compressed = zip.subarray(dataAt, dataAt + compressedSize);
    entries.push({ name, bytes: method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : (() => { throw new Error("ZIP method unsupported"); })() });
    cursor += 46 + nameSize + extraSize + commentSize;
  }
  return entries;
}
