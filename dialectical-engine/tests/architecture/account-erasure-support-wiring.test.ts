import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * C-1 (security-audit run 3, K01). The coordinator's support port is optional and fails closed when absent
 * (INVALID_EVIDENCE, nothing destroyed), so the production composition root must pass it. This pins that it does, on
 * the support data credential, and that the pool exists before the coordinator is built.
 */
describe("C-1 · the API composes account erasure with the support shred", () => {
  it("passes PostgresSupportShredRepository(supportPool) to AccountErasureCoordinator", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const start = main.indexOf("const accountErasure = new AccountErasureCoordinator(");
    expect(start).toBeGreaterThan(-1);
    const end = main.indexOf(");", start);
    expect(end).toBeGreaterThan(start);
    const statement = main.slice(start, end + 2);
    expect(statement).toContain("new PostgresSupportShredRepository(supportPool)");
    const supportPoolDeclaration =
      "const supportPool = boot.hold(createPool(environment.SUPPORT_DATABASE_URL, API_DATABASE_POOLS.support))";
    expect(main).toContain(supportPoolDeclaration);
    expect(main.indexOf(supportPoolDeclaration)).toBeLessThan(start);
  });
});
