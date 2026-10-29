import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("S05 operator scripts", () => {
  it("does not offer inbox, case, reply or close commands", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(Object.keys(manifest.scripts).filter((name) =>
      ["support:inbox", "support:case", "support:reply", "support:close"].includes(name)
    )).toEqual([]);
  });
});
