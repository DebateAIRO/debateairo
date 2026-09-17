import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const fixturePath = "tests/acceptance/obs-agent-04-fixture.ts";

describe("OBS-04 acceptance preparer boundary", () => {
  it("cannot inspect or assert the output surfaces owned by V", async () => {
    expect(existsSync(fixturePath)).toBe(true);
    const source = await readFile(fixturePath, "utf8");
    expect(source).not.toMatch(/SELECT[\s\S]{0,160}observation\.(?:signal|open_signal_v|defect_signal_v|delivery)/iu);
    expect(source).not.toMatch(/readFile[\s\S]{0,120}(?:status\.json|digest)/iu);
    expect(source).not.toMatch(/assert(?:Signal|Status|Digest|Delivery|Defect)|expect\s*\(/u);
    expect(source).not.toMatch(/emitted\.find|PREPARER_FAILED/u);
    expect(source).not.toMatch(/signalSchema\.parse/u);
    expect(source).not.toMatch(/state:\s*"CLEARED"[\s\S]{0,120}class:\s*"CAPTURE_GAP"/u);
    expect(source).not.toMatch(/chmod|mode\s*change|permission\s*change/iu);
  });

  it("guards the isolated database and contains no product-database write literal", async () => {
    expect(existsSync(fixturePath)).toBe(true);
    const source = await readFile(fixturePath, "utf8");
    expect(source).toContain("OBS_ACCEPTANCE_ADMIN_DATABASE_MUST_BE_POSTGRES");
    expect(source).toContain("debateai_obs04_");
    expect(source).not.toMatch(/INSERT INTO obs\.component_health/iu);
    expect(source).not.toMatch(/(?:INSERT|UPDATE|DELETE|TRUNCATE)[\s\S]{0,120}(?:core|ledger|serve|identity|register)\./iu);
  });
});
