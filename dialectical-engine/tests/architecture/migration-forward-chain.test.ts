import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";

/**
 * PR-54 (task N26n), PR-58 (task F10): NETOPIA's migration runs as the forward step 0111, chained after dev's 0110
 * (#101, itself chained after the sealed 0108). Dev's sealed lineage and its merged 0110 stay byte for byte as they
 * are; 0111 is bound by its own manifest to the recipe, to 0110's manifest and to the verifier it supersedes (the
 * sealed one, still in force after 0110), and a later step joins the chain with new files only
 * (migrations/lineage/README.md).
 */
const MIGRATIONS = new URL("../../migrations/", import.meta.url);
const DB_SOURCE = new URL("../../packages/db/src/", import.meta.url);
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const bytesOf = async (path: string): Promise<Buffer> => readFile(new URL(path, MIGRATIONS));

/** Dev's sealed lineage, as dedbb2d50 left it. N26n must not change one byte of these. */
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
/** Dev's merged 0110 (#101, origin/dev 20dafdd87). F10 must not change one byte of these either. */
const MERGED_110: Readonly<Record<string, string>> = Object.freeze({
  "0110_account_erasure_public_debates.sql": "c650b2bec01921dc96af83a1223896a021aa60e5d00a93683f37cb379305caab",
  "lineage/auth-dev-preview-20261006-forward110.json": "aab6bee30ee55b07116c21a25701af9af33f715caf5103a0b5c82f1fd77999d2",
  "lineage/verify-dpd110-erasure-bindings.sql": "f3ae5058e531c40373a9c5017afe13abc9066db5ad4bf85063cc5f1ccb8eea6b"
});

describe("F10: NETOPIA's migration is the forward step 0111 after dev's 0110 (PR-54, PR-58)", () => {
  it("keeps every sealed byte of dev's lineage, its recipe's sources included", async () => {
    for (const [path, digest] of Object.entries(SEALED)) expect(sha256(await bytesOf(path)), path).toBe(digest);
    const recipe = JSON.parse((await bytesOf("lineage/auth-dev-20261006.json")).toString("utf8")) as {
      sources: Array<{ name: string; sha256: string }>;
    };
    for (const source of recipe.sources) expect(sha256(await bytesOf(source.name)), source.name).toBe(source.sha256);
    for (const [path, digest] of Object.entries(MERGED_110)) expect(sha256(await bytesOf(path)), path).toBe(digest);
  });

  it("chains 0111 to the recipe, to 0110's manifest and to the verifier in force after 0110 (the sealed one)", async () => {
    const plan = await loadMigrationPlan();
    expect(plan.forward110.name).toBe("0110_account_erasure_public_debates.sql");
    // The auth DB batch (0112) follows 0111, and Part C's 0113 follows it (migrations/lineage/README.md).
    expect(plan.forwardChain.map((step) => step.name)).toEqual(["0111_billing_netopia.sql", "0112_auth_db_batch.sql", "0113_billing_price_currencies.sql"]);
    const [step] = plan.forwardChain;
    // 0110 runs the sealed effective-capability verifier after its SQL (applyForward110) and its own manifest names it
    // as its base verifier: after 0110, the sealed verifier is the one in force.
    const manifest110 = JSON.parse((await bytesOf("lineage/auth-dev-preview-20261006-forward110.json")).toString("utf8"));
    expect(manifest110.baseVerifierSha256).toBe(plan.manifest.effectiveCapabilityVerifier.executableSha256);
    expect(manifest110.chain).toBe(plan.forward108.name);
    const manifest = JSON.parse((await bytesOf("lineage/billing-netopia-forward111.json")).toString("utf8"));
    expect(manifest).toEqual({
      version: "billing-netopia-forward111-v1",
      baseRecipeSha256: plan.recipeSha256,
      previous: {
        name: "0110_account_erasure_public_debates.sql",
        manifestSha256: plan.forward110.manifestSha256,
        verifierSha256: plan.manifest.effectiveCapabilityVerifier.executableSha256
      },
      migration: { name: "0111_billing_netopia.sql", sha256: sha256(await bytesOf("0111_billing_netopia.sql")) },
      verifier: {
        path: "lineage/verify-effective-capabilities-111.sql",
        sha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      }
    });
    expect(plan.forward110.manifestSha256).toBe(sha256(await bytesOf("lineage/auth-dev-preview-20261006-forward110.json")));
    expect(step!.manifestSha256).toBe(sha256(await bytesOf("lineage/billing-netopia-forward111.json")));
    expect(step!.previousName).toBe(plan.forward110.name);
    expect(step!.previousManifestSha256).toBe(plan.forward110.manifestSha256);
    expect(step!.previousVerifierSha256).toBe(plan.manifest.effectiveCapabilityVerifier.executableSha256);
    expect(step!.verifierSql).toBe((await bytesOf("lineage/verify-effective-capabilities-111.sql")).toString("utf8"));
    const files = (await readdir(MIGRATIONS)).filter((name) => /^\d+.*\.sql$/u.test(name)).sort();
    expect(files).toEqual([...plan.manifest.order, plan.forward108.name, plan.forward110.name, ...plan.forwardChain.map((entry) => entry.name)].sort());
    expect(files).not.toContain("0096_billing_netopia.sql");
    expect(files).not.toContain("0109_billing_netopia.sql");
    for (const old of ["lineage/billing-netopia-forward109.json", "lineage/verify-effective-capabilities-109.sql"]) {
      await expect(bytesOf(old)).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("chains Part C's 0113 to the recipe, to 0111's manifest and to 0111's verifier, which it keeps in force", async () => {
    const plan = await loadMigrationPlan();
    const [netopia, step] = plan.forwardChain;
    const manifest = JSON.parse((await bytesOf("lineage/billing-price-currencies-forward0113.json")).toString("utf8"));
    expect(manifest).toEqual({
      version: "billing-price-currencies-forward0113-v1",
      baseRecipeSha256: plan.recipeSha256,
      previous: {
        name: "0111_billing_netopia.sql",
        manifestSha256: netopia!.manifestSha256,
        verifierSha256: netopia!.verifierSha256
      },
      migration: { name: "0113_billing_price_currencies.sql", sha256: sha256(await bytesOf("0113_billing_price_currencies.sql")) },
      verifier: {
        path: "lineage/verify-effective-capabilities-111.sql",
        sha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      }
    });
    expect(step!.manifestSha256).toBe(sha256(await bytesOf("lineage/billing-price-currencies-forward0113.json")));
    expect(step!.previousName).toBe(netopia!.name);
    expect(step!.previousManifestSha256).toBe(netopia!.manifestSha256);
    expect(step!.previousVerifierSha256).toBe(netopia!.verifierSha256);
    expect(step!.verifierSql).toBe((await bytesOf("lineage/verify-effective-capabilities-111.sql")).toString("utf8"));
  });

  it("supersedes the sealed verifier with NETOPIA's nine tables and two purges, and nothing else", async () => {
    const sealed = (await bytesOf("lineage/verify-effective-capabilities.sql")).toString("utf8");
    const superseding = (await bytesOf("lineage/verify-effective-capabilities-111.sql")).toString("utf8");
    for (const table of ["payment_notice", "payment_notice_raw", "notice_quarantine", "payment_notice_outcome", "card_token",
      "card_token_revocation", "hosted_payment", "status_read", "tool_order"]) {
      expect(sealed).not.toContain(`'${table}'`);
      expect(superseding).toContain(`'${table}'`);
    }
    for (const purge of ["billing.purge_short_lived(timestamptz)", "billing.purge_revoked_card_tokens(timestamptz)"]) {
      expect(sealed).not.toContain(purge);
      expect(superseding).toContain(purge);
    }
    // Every refusal the sealed verifier raises is raised by its successor too.
    const codes = (sql: string): string[] => [...new Set([...sql.matchAll(/RAISE EXCEPTION '([A-Z0-9_]+)/gu)].map((match) => match[1]!))].sort();
    expect(codes(superseding)).toEqual(expect.arrayContaining(codes(sealed)));
  });

  it("documents how the next step (0112, the auth DB batch) joins the chain after 0111 without touching earlier files", async () => {
    const readme = (await bytesOf("lineage/README.md")).toString("utf8");
    for (const needle of ["0110", "0111", "0112", "billing-netopia-forward111.json", "verify-effective-capabilities-111.sql",
      "packages/db/src/migration-forward-chain.ts", "packages/db/src/migration-forward111.ts",
      "packages/db/src/migration-forward110.ts"]) expect(readme).toContain(needle);
    expect(readme).not.toMatch(/0109|forward109|-109/u);
  });

  it("refuses a changed 0111, a manifest bound to the wrong previous step, and an undeclared file, before any database", async () => {
    const root = await mkdtemp(join(tmpdir(), "forward-chain-111-"));
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
      // 0111's bytes changed by one character.
      await refusal("0111_billing_netopia.sql", (text) => text.replace("NETOPIA", "NETOPIa"), "MIGRATION_FORWARD111_SOURCE_DIGEST");
      await refusal("lineage/verify-effective-capabilities-111.sql", (text) => `${text} `, "MIGRATION_FORWARD111_VERIFIER_DIGEST");
      await refusal("lineage/billing-netopia-forward111.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.manifestSha256 = "0".repeat(64);
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD111_MANIFEST");
      // A manifest bound to the wrong previous step: 0108 (where 0109 was anchored before F10), with 0108's digest.
      const forward108Digest = sha256(await bytesOf("lineage/auth-dev-preview-20261006-forward108.json"));
      await refusal("lineage/billing-netopia-forward111.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.name = "0108_preview_recovery_verified_bindings.sql";
        manifest.previous.manifestSha256 = forward108Digest;
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD111_MANIFEST");
      // The same refusal when 0110's own manifest changes under 0111 (its bytes are what 0111 is bound to).
      await refusal("lineage/auth-dev-preview-20261006-forward110.json", (text) => `${text}\n`, "MIGRATION_FORWARD111_MANIFEST");
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
