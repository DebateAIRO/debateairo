import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findForbiddenControlBytes,
  scanRepositoryTextSources
} from "../../tools/check-text-control-bytes.js";

describe("HYG-01 tracked text control-byte guard", () => {
  it("allows tab/newline and rejects NUL, carriage return, other C0 bytes, and DEL", () => {
    expect(findForbiddenControlBytes(Buffer.from([0x61, 0x09, 0x0a, 0x00, 0x0d, 0x1f, 0x7f]))).toEqual([
      { offset: 3, byte: 0x00 },
      { offset: 4, byte: 0x0d },
      { offset: 5, byte: 0x1f },
      { offset: 6, byte: 0x7f }
    ]);
  });

  it("finds no forbidden raw control bytes in cached or untracked repository text sources", () => {
    expect(scanRepositoryTextSources(process.cwd())).toEqual([]);
  });

  it("scans untracked non-ignored dotfiles as text sources", async () => {
    const repository = await mkdtemp(join(tmpdir(), "hyg-control-byte-repo-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: repository });
      await writeFile(join(repository, ".gitignore"), Buffer.from([0x61, 0x00, 0x62]));

      expect(scanRepositoryTextSources(repository)).toEqual([{
        path: ".gitignore",
        offset: 1,
        byte: 0x00
      }]);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });
});
