import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { OPERATOR_SUPPLYING_LEVELS, SCORING_OPERATORS } from "@debateai/kernel";

const root = new URL("../../", import.meta.url);

describe("S03 DDL and pure-core contract", () => {
  it("keeps kernel scoring vocabularies in parity with migrated CHECK members", async () => {
    const migration = await readFile(new URL("migrations/0003_s03.sql", root), "utf8");
    for (const member of [...SCORING_OPERATORS, ...OPERATOR_SUPPLYING_LEVELS]) {
      expect(migration).toContain(`'${member}'`);
    }
  });

  it("materialises a real folder carrier and avoids locale-dependent collation in propagation", async () => {
    const migration = await readFile(new URL("migrations/0003_s03.sql", root), "utf8");
    const graph = await readFile(new URL("packages/graph/src/index.ts", root), "utf8");
    const propagation = await readFile(new URL("packages/propagation/src/index.ts", root), "utf8");
    expect(migration).toContain("is_folder boolean NOT NULL DEFAULT false");
    expect(graph).toContain("isFolder: row.is_folder");
    expect(propagation).not.toContain("localeCompare");
    expect(propagation).toContain("function compareCodeUnits");
    expect(propagation).toContain("DR-127");
  });
});
