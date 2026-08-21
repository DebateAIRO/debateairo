import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { NODE_LIFECYCLE_EVENT_CONSUMERS } from "@debateai/contract";

describe("S07 / FX-HR-H3D / FX-LG-17 / FX-LG-18 — structural contract", () => {
  it("keeps battery/decision kernel-only with no clock or randomness", async () => {
    const [manifest, source] = await Promise.all([
      readFile(new URL("../../packages/battery/decision/package.json", import.meta.url), "utf8"),
      readFile(new URL("../../packages/battery/decision/src/index.ts", import.meta.url), "utf8")
    ]);
    expect(Object.keys(JSON.parse(manifest).dependencies)).toEqual(["@debateai/kernel"]);
    expect(source).not.toMatch(/node:|\bDate\b|Math\.random|randomUUID|@debateai\/db|\bpg\b/);
  });

  it("declares consumers for every minted node-lifecycle event", () => {
    expect(NODE_LIFECYCLE_EVENT_CONSUMERS).toEqual({
      "node.spawned": ["W6", "W8", "W10"],
      "node.generating": ["W6", "W8"],
      "node.being_judged": ["W6", "W8"],
      "node.scored": ["W6", "W8", "W10"]
    });
  });

  it("carries replay-safe decision, lifecycle, and WAIT-drain DDL", async () => {
    const migration = await readFile(new URL("../../migrations/0010_s07.sql", import.meta.url), "utf8");
    expect(migration).toContain("ledger.decision_record");
    expect(migration).toContain("decision_scalar_cannot_spawn");
    expect(migration).toContain("core.reject_terminal_with_wait");
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(migration).not.toContain("node.generating");
  });
});
