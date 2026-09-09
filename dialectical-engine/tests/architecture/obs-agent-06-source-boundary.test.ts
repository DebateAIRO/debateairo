import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("OBS-06 Hatchet source boundary", () => {
  it("uses only injected HTTP and Prometheus inputs, never vendor database access", async () => {
    const root = "apps/observation-agent/src/modules/hatchet-throughput";
    const files = (await readdir(root)).filter((name) => name.endsWith(".ts"));
    const source = (await Promise.all(files.map((name) => readFile(join(root, name), "utf8")))).join("\n");
    expect(source).not.toMatch(/\b(?:pg|Pool|postgres|hatchet_database|v1_queue_item)\b/iu);
    expect(source).not.toMatch(/SELECT\s|FROM\s+["']?hatchet/iu);
    expect(source).toContain("fetch");
  });
});
