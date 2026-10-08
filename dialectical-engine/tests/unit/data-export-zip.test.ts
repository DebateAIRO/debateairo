import { describe, expect, it } from "vitest";
import { crc32 } from "node:zlib";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { writeZip } from "../../apps/api/src/data-export/zip.js";
import { readZip } from "../support/zip-reader.js";

const at = new Date("2026-10-09T12:34:56.000Z");
const entries = [
  { name: "a.txt", bytes: Buffer.from("one") },
  { name: "b.json", bytes: Buffer.from(JSON.stringify({ text: "x".repeat(100) })) },
  { name: "c.txt", bytes: Buffer.from("three") }
];

describe("data export ZIP", () => {
  it("Z-1 preserves three names, payloads, and central-directory order", () => {
    const zip = writeZip(entries, at);
    const read = readZip(zip);
    expect(read.map(({ name }) => name)).toEqual(["a.txt", "b.json", "c.txt"]);
    expect(read.map(({ bytes }) => bytes.toString())).toEqual(entries.map(({ bytes }) => bytes.toString()));
    expect(zip.readUInt16LE(8)).toBe(0); // first entry, under 64 bytes, is STORE
    expect(zip.readUInt16LE(46)).toBe(8); // second entry begins at 38 and is DEFLATE
  });
  it("Z-2 writes each local CRC and the end record count", () => {
    const zip = writeZip(entries, at);
    let offset = 0;
    for (const entry of entries) {
      expect(zip.readUInt32LE(offset)).toBe(0x04034b50);
      expect(zip.readUInt32LE(offset + 14)).toBe(crc32(entry.bytes));
      offset += 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28) + zip.readUInt32LE(offset + 18);
    }
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(zip.readUInt16LE(end + 10)).toBe(3);
  });
  it("Z-3 is accepted by Python zipfile", () => {
    const dir = mkdtempSync(join(tmpdir(), "export-zip-"));
    const file = join(dir, "sample.zip");
    try {
      writeFileSync(file, writeZip(entries, at));
      const result = spawnSync("python3", ["-m", "zipfile", "-t", file], { encoding: "utf8" });
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("Z-4 writes identical bytes for identical inputs and timestamp", () => {
    const zip = writeZip(entries, at);
    expect(zip).toEqual(writeZip(entries, at));
    expect(zip.readUInt16LE(10)).toBe(25692); // 12:34:56 UTC in DOS time
    expect(zip.readUInt16LE(12)).toBe(23881); // 2026-10-09 UTC in DOS date
  });
  it("Z-5 rejects nested, traversal, and non-ASCII names", () => {
    for (const name of ["a/b.json", "../x", "é.json"]) {
      expect(() => writeZip([{ name, bytes: Buffer.from("x") }], at)).toThrow("ZIP_ENTRY_NAME_INVALID");
    }
  });
});
