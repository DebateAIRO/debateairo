import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("OBS-07 acceptance boundary", () => {
  it("keeps the preparer stimulus-only and targets only its unique isolated database", async () => {
    const source = await readFile("tests/acceptance/obs-agent-07-storm-fixture.ts", "utf8");
    expect(source).not.toMatch(/SELECT[\s\S]{0,160}observation\.(?:signal|delivery|open_signal_v)/iu);
    expect(source).not.toMatch(/readFile\([^)]*(?:status\.json|digest)/iu);
    expect(source).not.toMatch(/assert(?:Signal|Status|Digest|Delivery)/u);
    expect(source).not.toMatch(/(?:CREATE|INSERT|UPDATE|DELETE)[\s\S]{0,80}(?:DATABASE\s+)?debateai(?:\s|[;'"`])/iu);
    expect(source).not.toMatch(/databaseName\s*=\s*["']debateai["']/u);
    expect(source).toContain("debateai_obs07_");
    expect(source).toContain("persistSignal");
    expect(source).toContain("router.onSignal");
  });
});
