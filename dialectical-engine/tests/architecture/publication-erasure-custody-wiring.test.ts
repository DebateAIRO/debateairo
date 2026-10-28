import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * NV-11 (security-audit run 3, K02). The API composition root gates publication KEY CUSTODY (the corpus KEK ring,
 * the publication cipher, the cleanup pool and its role check, the two key-cleanup timers) on publicationCustodyOf,
 * and only the public routes on PUBLICATION_ENABLED. Both erasure coordinators keep receiving the cipher.
 */
const main = await readFile("apps/api/src/main.ts", "utf8");

/** The statement that starts at `head`, up to its terminating `;` at a line end. */
function statement(head: string): string {
  const start = main.indexOf(head);
  expect(start, head).toBeGreaterThan(-1);
  expect(main.indexOf(head, start + 1), `${head} once`).toBe(-1);
  const end = main.indexOf(";\n", start);
  expect(end, head).toBeGreaterThan(start);
  return main.slice(start, end + 1);
}

/** A call that starts at `head`, up to its closing `);` (single- or multi-line arguments). */
function call(head: string): string {
  const start = main.indexOf(head);
  expect(start, head).toBeGreaterThan(-1);
  const end = main.indexOf(");", start);
  expect(end, head).toBeGreaterThan(start);
  return main.slice(start, end + 2);
}

describe("NV-11 · main.ts gates publication custody apart from publication serving", () => {
  it("computes custody once, from the loaded environment", () => {
    expect(main).toContain("const publicationCustody = publicationCustodyOf(environment);");
    expect(main.indexOf("const publicationCustody = publicationCustodyOf(environment);"))
      .toBeGreaterThan(main.indexOf("const environment = loadApiEnvironment();"));
  });

  it("loads the corpus KEK ring and builds the cipher on custody.keys, not on the flag", () => {
    for (const head of ["const corpusKeks =", "const publicationCipher ="]) {
      const text = statement(head);
      expect(text, head).toContain("publicationCustody.keys");
      expect(text, head).not.toContain("PUBLICATION_ENABLED");
    }
  });

  it("opens and attests the cleanup pool and builds the cleanup application on custody.cleanup", () => {
    expect(statement("const publicationCleanupPool =")).toContain("const publicationCleanupPool = publicationCustody.cleanup");
    expect(statement("const publicationCleanupPool =")).not.toContain("PUBLICATION_ENABLED");
    const custody = statement("const publicationKeyCustody =");
    expect(custody).toContain("publicationCustody.cleanup");
    expect(custody).not.toContain("PUBLICATION_ENABLED");
    expect(custody).toContain("new PostgresPublicationApplication(");
    const roles = call('await boot.run("database-roles"');
    expect(roles).toContain("...(publicationCustody.cleanup ? [\n    assertPublicationCleanupDatabaseRole(publicationCleanupPool)");
    expect(roles).not.toContain("PUBLICATION_ENABLED");
  });

  it("serves public routes only when publication is enabled, and runs the key cleanup on custody", () => {
    expect(main).toContain(
      'const publications = environment.PUBLICATION_ENABLED === "true" ? publicationKeyCustody : undefined;'
    );
    expect(main).toContain("if (publicationKeyCustody !== undefined) {");
    expect(main).not.toContain("if (publications !== undefined) {");
    expect(main).toContain("await publicationKeyCustody.reconcileKeyProvisionCleanup();");
    expect(main).toContain("await publicationKeyCustody.reconcileKeyCleanup();");
    expect(main).not.toMatch(/\bpublications\.reconcileKey/u);
  });

  it("both erasure coordinators still receive the publication cipher", () => {
    for (const head of ["new AccountErasureCoordinator(", "new PrivateRunErasureCoordinator("]) {
      expect(call(head), head).toMatch(/[\s,(]publicationCipher[\s,)]/u);
    }
  });

  it("says once at boot when custody is missing, right after the cleanup block and before C-1's support pool", () => {
    const missing = main.indexOf('console.error("[PUBLICATION_CUSTODY_NOT_CONFIGURED]")');
    expect(missing).toBeGreaterThan(-1);
    expect(main).toContain('console.error("[PUBLICATION_KEY_CLEANUP_NOT_CONFIGURED]")');
    expect(missing).toBeGreaterThan(main.indexOf("publicationCleanupTimer = gatedInterval(releaseWatcher,"));
    expect(missing).toBeLessThan(main.indexOf("const supportPool = boot.hold("));
    expect(missing).toBeLessThan(main.indexOf("const accountErasure = new AccountErasureCoordinator("));
  });
});
