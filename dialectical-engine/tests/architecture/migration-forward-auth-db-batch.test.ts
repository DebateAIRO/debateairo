import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { AUTH_DB_BATCH_MIGRATION } from "../../packages/db/src/migration-forward-auth-db-batch.js";

/**
 * The auth database batch (design note docs/superpowers/specs/2026-10-09-auth-db-batch-design.md) joins the forward
 * chain after dev's sealed 0108 with new files only. Its number lives in one constant (AUTH_DB_BATCH_MIGRATION) so a
 * renumber is cheap; it does not supersede the effective-capability verifier (it adds no billing objects) and carries
 * its own supplemental verifier.
 */
const MIGRATIONS = new URL("../../migrations/", import.meta.url);
const DB_SOURCE = new URL("../../packages/db/src/", import.meta.url);
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const bytesOf = async (path: string): Promise<Buffer> => readFile(new URL(path, MIGRATIONS));

/** Dev's sealed lineage. Not one byte of these changes. */
const SEALED: Readonly<Record<string, string>> = Object.freeze({
  "lineage/auth-dev-20261006.json": "3ad4ca844799fa0e498124250dba11683d0e305a2e3571468809ec5a6cec45c2",
  "lineage/auth-dev-preview-20261006-forward108.json": "cf892973f467aa1260aeb5acd17941b5a8e1ca11ff7c61282528b20c41295eba",
  "lineage/verify-effective-capabilities.sql": "efeddf3d398eef8f6b47e1b1c5820f9ee5f551a7404e65135b5a4e0c70157944",
  "lineage/verify-auth108-recovery-bindings.sql": "5a719632d28d31336ad66aad57d6a97578574e2d1b676e3b9dc6119b473f609e",
  "0108_preview_recovery_verified_bindings.sql": "3a3e4ab7178aecf98dfce25523f23b4f2caecd9bb2054f9c950ba8f88d34789f",
  "compatibility/auth-dev-20261006/0025_evaluator_domain_refusal_receipts.sql": "48361826289fa9eec6764993a4da8e775492a158d3bd017c0a9122e374044e5c",
  "compatibility/auth-dev-20261006/0029_evaluator_dev_menu_grants.sql": "d248e724838094a21f61cc62fd2e733ff7eb7473eafd2b840041d15b3201d45b",
  "compatibility/auth-dev-20261006/0093_billing_runtime_role.sql": "253d188697be7f16054c047834819f9f15dfaddbee32556a3e2c4c10696cbe68"
});

describe("auth database batch: a forward step after dev's sealed 0108", () => {
  it("keeps every sealed byte of dev's lineage, its recipe's sources included", async () => {
    for (const [path, digest] of Object.entries(SEALED)) expect(sha256(await bytesOf(path)), path).toBe(digest);
    const recipe = JSON.parse((await bytesOf("lineage/auth-dev-20261006.json")).toString("utf8")) as {
      sources: Array<{ name: string; sha256: string }>;
    };
    for (const source of recipe.sources) expect(sha256(await bytesOf(source.name)), source.name).toBe(source.sha256);
  });

  it("is the chain's step after 0108, bound to the recipe, 0108's manifest and the verifier it keeps", async () => {
    expect(AUTH_DB_BATCH_MIGRATION).toMatch(/^\d{4}_auth_db_batch\.sql$/u);
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.map((step) => step.name)).toContain(AUTH_DB_BATCH_MIGRATION);
    const step = plan.forwardChain.find((entry) => entry.name === AUTH_DB_BATCH_MIGRATION)!;
    const manifest = JSON.parse((await bytesOf("lineage/auth-db-batch-forward.json")).toString("utf8"));
    expect(manifest).toEqual({
      version: "auth-db-batch-forward-v1",
      baseRecipeSha256: plan.recipeSha256,
      previous: { name: step.previousName, manifestSha256: step.previousManifestSha256, verifierSha256: step.previousVerifierSha256 },
      migration: { name: AUTH_DB_BATCH_MIGRATION, sha256: sha256(await bytesOf(AUTH_DB_BATCH_MIGRATION)) },
      verifier: { path: manifest.verifier.path, sha256: step.previousVerifierSha256 },
      supplementalVerifier: { path: "lineage/verify-auth-db-batch.sql", sha256: sha256(await bytesOf("lineage/verify-auth-db-batch.sql")) }
    });
    // It keeps (does not supersede) the effective-capability verifier of the step before it.
    expect(sha256(await bytesOf(manifest.verifier.path))).toBe(step.previousVerifierSha256);
    expect(step.verifierSha256).toBe(step.previousVerifierSha256);
    expect(step.manifestSha256).toBe(sha256(await bytesOf("lineage/auth-db-batch-forward.json")));
    const files = (await readdir(MIGRATIONS)).filter((name) => /^\d+.*\.sql$/u.test(name)).sort();
    expect(files).toEqual([...plan.manifest.order, plan.forward108.name, ...plan.forwardChain.map((entry) => entry.name)].sort());
  });

  it("documents how a renumber and the next step touch the chain", async () => {
    const readme = (await bytesOf("lineage/README.md")).toString("utf8");
    for (const needle of ["auth-db-batch-forward.json", "verify-auth-db-batch.sql", "packages/db/src/migration-forward-chain.ts",
      "packages/db/src/migration-forward-auth-db-batch.ts", "renumber"]) expect(readme).toContain(needle);
  });

  it("refuses a changed step, a changed supplemental verifier, a rebound manifest and an undeclared file, before any database", async () => {
    const root = await mkdtemp(join(tmpdir(), "forward-auth-db-batch-"));
    try {
      await mkdir(join(root, "packages/db/src"), { recursive: true });
      for (const name of (await readdir(DB_SOURCE)).filter((entry) => /^migration-.*\.ts$/u.test(entry))) {
        await cp(new URL(name, DB_SOURCE), join(root, "packages/db/src", name));
      }
      await cp(MIGRATIONS, join(root, "migrations"), { recursive: true });
      const script = join(root, "probe.mts");
      await writeFile(script, "import {loadMigrationPlan} from './packages/db/src/migration-lineage.ts'; await loadMigrationPlan();");
      const run = () => promisify(execFile)(process.execPath, ["--import", "tsx", script], { cwd: process.cwd(), timeout: 30_000, maxBuffer: 100_000 });
      const refusal = async (path: string, change: (text: string) => string, code: string): Promise<void> => {
        const file = join(root, "migrations", path);
        const original = await readFile(file, "utf8");
        await writeFile(file, change(original));
        try {
          await expect(run(), path).rejects.toMatchObject({ stderr: expect.stringContaining(code) });
        } finally {
          await writeFile(file, original);
        }
      };
      await run();
      await refusal(AUTH_DB_BATCH_MIGRATION, (text) => `${text}\n-- drift\n`, "MIGRATION_FORWARD_AUTH_DB_BATCH_SOURCE_DIGEST");
      await refusal("lineage/verify-auth-db-batch.sql", (text) => `${text} `, "MIGRATION_FORWARD_AUTH_DB_BATCH_VERIFIER_DIGEST");
      await refusal("lineage/auth-db-batch-forward.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.manifestSha256 = "0".repeat(64);
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD_AUTH_DB_BATCH_MANIFEST");
      const extra = join(root, "migrations/0199_unbound_step.sql");
      await writeFile(extra, "SELECT 1;\n");
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_LINEAGE_REFUSED SOURCE_INVENTORY") });
      await rm(extra);
      await run();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);
});
