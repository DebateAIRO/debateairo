import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("OBS-06 acceptance boundary", () => {
  it("keeps the preparer stimulus-only and isolated from debateai", async () => {
    const source = await readFile("tests/acceptance/obs-agent-06-fixture.ts", "utf8");
    expect(source).not.toMatch(/SELECT[\s\S]{0,120}observation\.(?:signal|delivery|open_signal_v|defect_signal_v)/iu);
    expect(source).not.toMatch(/status\.json|\/digest\/|EXPLAIN\s*\(/iu);
    expect(source).not.toMatch(/assert(?:Signal|Status|Digest|Explain)/u);
    expect(source).not.toMatch(/(?:CREATE|INSERT|UPDATE|DELETE)[\s\S]{0,80}(?:DATABASE\s+)?debateai(?:\s|[;'"`])/iu);
  });

  it("contains no hard-coded historical 5/21 throughput value", async () => {
    const files = [
      "apps/observation-agent/src/modules/throughput/deltas.ts",
      "apps/observation-agent/src/modules/throughput/queries.ts",
      "tests/acceptance/obs-agent-06-fixture.ts"
    ];
    const source = (await Promise.all(files.map((path) => readFile(path, "utf8")))).join("\n");
    expect(source).not.toMatch(/\b5\s*\/\s*21\b/u);
  });
});
