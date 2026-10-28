import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { runOutsideTransactionStep, type ChainStep } from "../../packages/db/src/migration-forward-chain.js";
import { MIGRATION_LOCK_TIMEOUT_MS } from "../../packages/db/src/migration-transaction.js";

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
    // The auth DB batch (0112) follows 0111, Part C's 0113 follows it, role rotation's 0114 follows 0113, the data
    // export's 0115 follows 0114 (V-41), the mail locale (0116) follows 0115 (S01-C05), the debate shape's map (0117)
    // follows 0116, the language check's site cost (0118) follows 0117, the reclaim resume (0119) follows 0118, then the
    // reply measures (0120, spec 2026-10-15), then the engine verdict (0121, spec 2026-10-15 engine redesign R2), then
    // the engine's map answer step (0122, spec 2026-10-15 engine redesign R3), then the side-by-side releases (0123,
    // spec 2026-10-21 side-by-side uploads), then the settings activation (0124), last (side-by-side spec §13)
    // (migrations/lineage/README.md).
    expect(plan.forwardChain.map((step) => step.name)).toEqual([
      "0111_billing_netopia.sql",
      "0112_auth_db_batch.sql",
      "0113_billing_price_currencies.sql",
      "0114_role_rotation.sql",
      "0115_data_export.sql",
      "0116_mail_locale.sql",
      "0117_debate_shape_map.sql",
      "0118_language_check_spend.sql",
      "0119_reclaim_resume.sql",
      "0120_reply_measures.sql",
      "0121_engine_verdict.sql",
      "0122_engine_map_check.sql",
      "0123_side_by_side_releases.sql",
      "0124_settings_activation.sql",
      "0126_synthesis_check.sql",
      "0127_publication_review.sql",
      "0128_threat_reports.sql",
      "0129_support_answer_scope.sql"
    ]);
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

  it("chains Part C's 0113 after dev's 0112: the recipe, 0112's manifest and the effective verifier 0112 keeps (0111's)", async () => {
    const plan = await loadMigrationPlan();
    const [netopia, batch, step] = plan.forwardChain;
    expect(plan.forwardChain.map((entry) => entry.name)).toEqual([
      "0111_billing_netopia.sql",
      "0112_auth_db_batch.sql",
      "0113_billing_price_currencies.sql",
      "0114_role_rotation.sql",
      "0115_data_export.sql",
      "0116_mail_locale.sql",
      "0117_debate_shape_map.sql",
      "0118_language_check_spend.sql",
      "0119_reclaim_resume.sql",
      "0120_reply_measures.sql",
      "0121_engine_verdict.sql",
      "0122_engine_map_check.sql",
      "0123_side_by_side_releases.sql",
      "0124_settings_activation.sql",
      "0126_synthesis_check.sql",
      "0127_publication_review.sql",
      "0128_threat_reports.sql",
      "0129_support_answer_scope.sql"
    ]);
    // The verifier in force after 0112 is the one 0112's manifest names (it adds no billing object): 0111's.
    const batchManifest = JSON.parse((await bytesOf("lineage/auth-db-batch-forward.json")).toString("utf8"));
    expect(batchManifest.verifier.path).toBe("lineage/verify-effective-capabilities-111.sql");
    expect(batch!.verifierSha256).toBe(sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql")));
    expect(batch!.verifierSha256).toBe(netopia!.verifierSha256);
    const manifest = JSON.parse((await bytesOf("lineage/billing-price-currencies-forward0113.json")).toString("utf8"));
    expect(manifest).toEqual({
      version: "billing-price-currencies-forward0113-v1",
      baseRecipeSha256: plan.recipeSha256,
      previous: {
        name: "0112_auth_db_batch.sql",
        manifestSha256: sha256(await bytesOf("lineage/auth-db-batch-forward.json")),
        verifierSha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      },
      migration: { name: "0113_billing_price_currencies.sql", sha256: sha256(await bytesOf("0113_billing_price_currencies.sql")) },
      verifier: {
        path: "lineage/verify-effective-capabilities-111.sql",
        sha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      }
    });
    expect(step!.manifestSha256).toBe(sha256(await bytesOf("lineage/billing-price-currencies-forward0113.json")));
    expect(step!.previousName).toBe(batch!.name);
    expect(step!.previousManifestSha256).toBe(batch!.manifestSha256);
    expect(step!.previousVerifierSha256).toBe(batch!.verifierSha256);
    expect(step!.verifierSql).toBe((await bytesOf("lineage/verify-effective-capabilities-111.sql")).toString("utf8"));
    // Its checks are its postcondition (the quote's column and the three CHECKs, compared on every replay); it has no
    // supplemental verifier of its own.
    expect(step!.replayVerifierSql).toBeUndefined();
  });

  it("chains role rotation's 0114 after 0113: the recipe, 0113's manifest and the effective verifier 0113 keeps (0111's)", async () => {
    const plan = await loadMigrationPlan();
    const [netopia, , partC, step] = plan.forwardChain;
    expect(plan.forwardChain.map((entry) => entry.name)).toEqual([
      "0111_billing_netopia.sql",
      "0112_auth_db_batch.sql",
      "0113_billing_price_currencies.sql",
      "0114_role_rotation.sql",
      "0115_data_export.sql",
      "0116_mail_locale.sql",
      "0117_debate_shape_map.sql",
      "0118_language_check_spend.sql",
      "0119_reclaim_resume.sql",
      "0120_reply_measures.sql",
      "0121_engine_verdict.sql",
      "0122_engine_map_check.sql",
      "0123_side_by_side_releases.sql",
      "0124_settings_activation.sql",
      "0126_synthesis_check.sql",
      "0127_publication_review.sql",
      "0128_threat_reports.sql",
      "0129_support_answer_scope.sql"
    ]);
    expect(partC!.verifierSha256).toBe(netopia!.verifierSha256);
    const manifest = JSON.parse((await bytesOf("lineage/role-rotation-forward0114.json")).toString("utf8"));
    expect(manifest).toEqual({
      version: "role-rotation-forward0114-v1",
      baseRecipeSha256: plan.recipeSha256,
      previous: {
        name: "0113_billing_price_currencies.sql",
        manifestSha256: sha256(await bytesOf("lineage/billing-price-currencies-forward0113.json")),
        verifierSha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      },
      migration: { name: "0114_role_rotation.sql", sha256: sha256(await bytesOf("0114_role_rotation.sql")) },
      verifier: {
        path: "lineage/verify-effective-capabilities-111.sql",
        sha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      }
    });
    expect(step!.manifestSha256).toBe(sha256(await bytesOf("lineage/role-rotation-forward0114.json")));
    expect(step!.previousName).toBe(partC!.name);
    expect(step!.previousManifestSha256).toBe(partC!.manifestSha256);
    expect(step!.previousVerifierSha256).toBe(partC!.verifierSha256);
    expect(step!.verifierSql).toBe((await bytesOf("lineage/verify-effective-capabilities-111.sql")).toString("utf8"));
    // Its checks are its postcondition (the pin table's columns, the story column, the disclosure's per-role reasons and the twelve CHECKs, compared on
    // every replay); it has no supplemental verifier of its own.
    expect(step!.replayVerifierSql).toBeUndefined();
  });

  it("chains the debate shape's map 0117 after 0116: the recipe, 0116's manifest and the effective verifier 0116 keeps (0111's)", async () => {
    const plan = await loadMigrationPlan();
    const [netopia, , , , , mailLocale, step] = plan.forwardChain;
    expect(plan.forwardChain.map((entry) => entry.name)).toEqual([
      "0111_billing_netopia.sql",
      "0112_auth_db_batch.sql",
      "0113_billing_price_currencies.sql",
      "0114_role_rotation.sql",
      "0115_data_export.sql",
      "0116_mail_locale.sql",
      "0117_debate_shape_map.sql",
      "0118_language_check_spend.sql",
      "0119_reclaim_resume.sql",
      "0120_reply_measures.sql",
      "0121_engine_verdict.sql",
      "0122_engine_map_check.sql",
      "0123_side_by_side_releases.sql",
      "0124_settings_activation.sql",
      "0126_synthesis_check.sql",
      "0127_publication_review.sql",
      "0128_threat_reports.sql",
      "0129_support_answer_scope.sql"
    ]);
    expect(mailLocale!.verifierSha256).toBe(netopia!.verifierSha256);
    const manifest = JSON.parse((await bytesOf("lineage/debate-shape-map-forward0117.json")).toString("utf8"));
    expect(manifest).toEqual({
      version: "debate-shape-map-forward0117-v1",
      baseRecipeSha256: plan.recipeSha256,
      previous: {
        name: "0116_mail_locale.sql",
        manifestSha256: sha256(await bytesOf("lineage/mail-locale-forward0116.json")),
        verifierSha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      },
      migration: { name: "0117_debate_shape_map.sql", sha256: sha256(await bytesOf("0117_debate_shape_map.sql")) },
      verifier: {
        path: "lineage/verify-effective-capabilities-111.sql",
        sha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      }
    });
    expect(step!.manifestSha256).toBe(sha256(await bytesOf("lineage/debate-shape-map-forward0117.json")));
    expect(step!.previousName).toBe(mailLocale!.name);
    expect(step!.previousManifestSha256).toBe(mailLocale!.manifestSha256);
    expect(step!.previousVerifierSha256).toBe(mailLocale!.verifierSha256);
    expect(step!.verifierSql).toBe((await bytesOf("lineage/verify-effective-capabilities-111.sql")).toString("utf8"));
    // Its checks are its postcondition (the three map tables and the carriers' four guard functions, compared on every
    // replay); it has no supplemental verifier of its own.
    expect(step!.replayVerifierSql).toBeUndefined();
  });

  it("chains the language check's site cost 0118 after 0117: the recipe, 0117's manifest and the effective verifier 0117 keeps (0111's)", async () => {
    const plan = await loadMigrationPlan();
    const [netopia, , , , , , mapStep, step] = plan.forwardChain;
    expect(plan.forwardChain.map((entry) => entry.name)).toEqual([
      "0111_billing_netopia.sql",
      "0112_auth_db_batch.sql",
      "0113_billing_price_currencies.sql",
      "0114_role_rotation.sql",
      "0115_data_export.sql",
      "0116_mail_locale.sql",
      "0117_debate_shape_map.sql",
      "0118_language_check_spend.sql",
      "0119_reclaim_resume.sql",
      "0120_reply_measures.sql",
      "0121_engine_verdict.sql",
      "0122_engine_map_check.sql",
      "0123_side_by_side_releases.sql",
      "0124_settings_activation.sql",
      "0126_synthesis_check.sql",
      "0127_publication_review.sql",
      "0128_threat_reports.sql",
      "0129_support_answer_scope.sql"
    ]);
    expect(mapStep!.verifierSha256).toBe(netopia!.verifierSha256);
    const manifest = JSON.parse((await bytesOf("lineage/language-check-spend-forward0118.json")).toString("utf8"));
    expect(manifest).toEqual({
      version: "language-check-spend-forward0118-v1",
      baseRecipeSha256: plan.recipeSha256,
      previous: {
        name: "0117_debate_shape_map.sql",
        manifestSha256: sha256(await bytesOf("lineage/debate-shape-map-forward0117.json")),
        verifierSha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      },
      migration: { name: "0118_language_check_spend.sql", sha256: sha256(await bytesOf("0118_language_check_spend.sql")) },
      verifier: {
        path: "lineage/verify-effective-capabilities-111.sql",
        sha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      }
    });
    expect(step!.manifestSha256).toBe(sha256(await bytesOf("lineage/language-check-spend-forward0118.json")));
    expect(step!.previousName).toBe(mapStep!.name);
    expect(step!.previousManifestSha256).toBe(mapStep!.manifestSha256);
    expect(step!.previousVerifierSha256).toBe(mapStep!.verifierSha256);
    expect(step!.verifierSql).toBe((await bytesOf("lineage/verify-effective-capabilities-111.sql")).toString("utf8"));
    // Its checks are its postcondition (the one writer's definition, owner and ACL, and the two CHECKs on
    // ledger.model_spend, compared on every replay); it has no supplemental verifier of its own.
    expect(step!.replayVerifierSql).toBeUndefined();
  });

  it("chains the reclaim resume 0119 after 0118: the recipe, 0118's manifest and the effective verifier 0118 keeps (0111's)", async () => {
    const plan = await loadMigrationPlan();
    const [netopia, , , , , , , languageStep, step] = plan.forwardChain;
    expect(plan.forwardChain.map((entry) => entry.name)).toEqual([
      "0111_billing_netopia.sql",
      "0112_auth_db_batch.sql",
      "0113_billing_price_currencies.sql",
      "0114_role_rotation.sql",
      "0115_data_export.sql",
      "0116_mail_locale.sql",
      "0117_debate_shape_map.sql",
      "0118_language_check_spend.sql",
      "0119_reclaim_resume.sql",
      "0120_reply_measures.sql",
      "0121_engine_verdict.sql",
      "0122_engine_map_check.sql",
      "0123_side_by_side_releases.sql",
      "0124_settings_activation.sql",
      "0126_synthesis_check.sql",
      "0127_publication_review.sql",
      "0128_threat_reports.sql",
      "0129_support_answer_scope.sql"
    ]);
    expect(languageStep!.verifierSha256).toBe(netopia!.verifierSha256);
    const manifest = JSON.parse((await bytesOf("lineage/reclaim-resume-forward0119.json")).toString("utf8"));
    expect(manifest).toEqual({
      version: "reclaim-resume-forward0119-v1",
      baseRecipeSha256: plan.recipeSha256,
      previous: {
        name: "0118_language_check_spend.sql",
        manifestSha256: sha256(await bytesOf("lineage/language-check-spend-forward0118.json")),
        verifierSha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      },
      migration: { name: "0119_reclaim_resume.sql", sha256: sha256(await bytesOf("0119_reclaim_resume.sql")) },
      verifier: {
        path: "lineage/verify-effective-capabilities-111.sql",
        sha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      }
    });
    expect(step!.manifestSha256).toBe(sha256(await bytesOf("lineage/reclaim-resume-forward0119.json")));
    expect(step!.previousName).toBe(languageStep!.name);
    expect(step!.previousManifestSha256).toBe(languageStep!.manifestSha256);
    expect(step!.previousVerifierSha256).toBe(languageStep!.verifierSha256);
    expect(step!.verifierSql).toBe((await bytesOf("lineage/verify-effective-capabilities-111.sql")).toString("utf8"));
    // Its checks are its postcondition (the two trigger functions, core.node's guard trigger with 0000's reject_mutation
    // absent, the runtime's rights on core.node, and core.map_position_repoint whole, compared on every replay); it has
    // no supplemental verifier of its own.
    expect(step!.replayVerifierSql).toBeUndefined();
  });

  it("chains the reply measures 0120 after 0119: the recipe, 0119's manifest and the effective verifier 0119 keeps (0111's)", async () => {
    const plan = await loadMigrationPlan();
    const [netopia, , , , , , , , reclaimStep, step] = plan.forwardChain;
    const names = plan.forwardChain.map((entry) => entry.name);
    expect(names.indexOf("0120_reply_measures.sql")).toBe(names.indexOf("0119_reclaim_resume.sql") + 1);
    expect(reclaimStep!.verifierSha256).toBe(netopia!.verifierSha256);
    const manifest = JSON.parse((await bytesOf("lineage/reply-measures-forward0120.json")).toString("utf8"));
    expect(manifest).toEqual({
      version: "reply-measures-forward0120-v1",
      baseRecipeSha256: plan.recipeSha256,
      previous: {
        name: "0119_reclaim_resume.sql",
        manifestSha256: sha256(await bytesOf("lineage/reclaim-resume-forward0119.json")),
        verifierSha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      },
      migration: { name: "0120_reply_measures.sql", sha256: sha256(await bytesOf("0120_reply_measures.sql")) },
      verifier: { path: "lineage/verify-effective-capabilities-111.sql", sha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql")) }
    });
    expect(step!.manifestSha256).toBe(sha256(await bytesOf("lineage/reply-measures-forward0120.json")));
    expect(step!.previousName).toBe(reclaimStep!.name);
    expect(step!.previousManifestSha256).toBe(reclaimStep!.manifestSha256);
    expect(step!.previousVerifierSha256).toBe(reclaimStep!.verifierSha256);
    expect(step!.verifierSql).toBe((await bytesOf("lineage/verify-effective-capabilities-111.sql")).toString("utf8"));
    expect(step!.replayVerifierSql).toBeUndefined();
  });

  it("chains the engine verdict 0121 after 0120: the recipe, 0120's manifest and the effective verifier 0120 keeps (0111's)", async () => {
    const plan = await loadMigrationPlan();
    const netopia = plan.forwardChain[0];
    const names = plan.forwardChain.map((entry) => entry.name);
    const replyStep = plan.forwardChain[names.indexOf("0120_reply_measures.sql")];
    const step = plan.forwardChain[names.indexOf("0121_engine_verdict.sql")];
    expect(names.indexOf("0121_engine_verdict.sql")).toBe(names.indexOf("0120_reply_measures.sql") + 1);
    expect(replyStep!.verifierSha256).toBe(netopia!.verifierSha256);
    const manifest = JSON.parse((await bytesOf("lineage/engine-verdict-forward0121.json")).toString("utf8"));
    expect(manifest).toEqual({
      version: "engine-verdict-forward0121-v1",
      baseRecipeSha256: plan.recipeSha256,
      previous: {
        name: "0120_reply_measures.sql",
        manifestSha256: sha256(await bytesOf("lineage/reply-measures-forward0120.json")),
        verifierSha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      },
      migration: { name: "0121_engine_verdict.sql", sha256: sha256(await bytesOf("0121_engine_verdict.sql")) },
      verifier: { path: "lineage/verify-effective-capabilities-111.sql", sha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql")) }
    });
    expect(step!.manifestSha256).toBe(sha256(await bytesOf("lineage/engine-verdict-forward0121.json")));
    expect(step!.previousName).toBe(replyStep!.name);
    expect(step!.previousManifestSha256).toBe(replyStep!.manifestSha256);
    expect(step!.previousVerifierSha256).toBe(replyStep!.verifierSha256);
    expect(step!.verifierSql).toBe((await bytesOf("lineage/verify-effective-capabilities-111.sql")).toString("utf8"));
    // Its checks are its postcondition (the two tables whole, the four functions); no supplemental verifier.
    expect(step!.replayVerifierSql).toBeUndefined();
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

  it("documents Part C's 0113 as the step after 0112, with its manifest, its loader and the verifier it keeps", async () => {
    const readme = (await bytesOf("lineage/README.md")).toString("utf8");
    const section = readme.slice(readme.indexOf("## Part C's prices (0113)"));
    expect(section.startsWith("## Part C's prices (0113)")).toBe(true);
    for (const needle of ["0112", "auth-db-batch-forward.json", "billing-price-currencies-forward0113.json",
      "verify-effective-capabilities-111.sql", "packages/db/src/migration-forward0113.ts", "MIGRATION_FORWARD0113_",
      "replayVerifierSql", "`STEPS`",
      // C5a fix round 1: unlike the batch's, 0113's number is in its guard, its loader's names and its refusal prefix.
      "`$billing_0113_requires$`", "`BILLING_0113_REQUIRES_0111`", "`loadForward0113`", "`VERSION` and `MANIFEST_PATH`",
      "rename every file and constant that carries the number"
    ]) expect(section.slice(0, section.indexOf("\n## ", 1)), needle).toContain(needle);
    expect(section.slice(0, section.indexOf("\n## ", 1))).not.toContain("Its number lives only in");
    expect(readme).not.toContain("else renumbered 0112");
  });

  it("documents role rotation's 0114 as the step after 0113, with its manifest, its loader and the verifier it keeps", async () => {
    const readme = (await bytesOf("lineage/README.md")).toString("utf8");
    const section = readme.slice(readme.indexOf("## Role rotation (0114)"));
    expect(section.startsWith("## Role rotation (0114)")).toBe(true);
    for (const needle of ["0113", "0114_role_rotation.sql", "role-rotation-forward0114.json",
      "verify-effective-capabilities-111.sql", "packages/db/src/migration-forward0114.ts", "replayVerifierSql",
      "core.run_role_rotation", "serve.answer_story.storyteller_repairs", "renumber",
      // Task 11: the disclosure's fallback reason per role.
      "serve.serve_disclosure", "ROLE_UNAVAILABLE"
    ]) expect(section.slice(0, section.indexOf("\n## ", 1)), needle).toContain(needle);
    expect(readme.replace(/\s+/gu, " ")).toContain("role rotation (0114, below) the fourth");
  });

  it("documents the debate shape's map 0117 as the step after 0116, with its manifest, its loader and the verifier it keeps", async () => {
    const readme = (await bytesOf("lineage/README.md")).toString("utf8");
    const section = readme.slice(readme.indexOf("## The debate shape map (0117)"));
    expect(section.startsWith("## The debate shape map (0117)")).toBe(true);
    for (const needle of ["0116", "0117_debate_shape_map.sql", "debate-shape-map-forward0117.json",
      "verify-effective-capabilities-111.sql", "packages/db/src/migration-forward0117.ts", "replayVerifierSql",
      "core.map_item", "core.map_choice", "core.map_position", "MIGRATION_FORWARD0117_", "`STEPS`", "renumber"
    ]) expect(section.slice(0, section.indexOf("\n## ", 1)), needle).toContain(needle);
    expect(readme.replace(/\s+/gu, " ")).toContain("the data export (0115, V-41) the fifth, the mail locale (0116, below) the sixth, the debate shape's map (0117, below) the seventh");
  });

  it("documents the language check's site cost 0118 as the step after 0117, with its manifest, its loader and the verifier it keeps", async () => {
    const readme = (await bytesOf("lineage/README.md")).toString("utf8");
    const section = readme.slice(readme.indexOf("## The language check's site cost (0118)"));
    expect(section.startsWith("## The language check's site cost (0118)")).toBe(true);
    for (const needle of ["0117", "0118_language_check_spend.sql", "language-check-spend-forward0118.json",
      "verify-effective-capabilities-111.sql", "packages/db/src/migration-forward0118.ts", "replayVerifierSql",
      "ledger.record_language_check_spend", "LANGUAGE_CHECK", "MIGRATION_FORWARD0118_", "`STEPS`", "renumber"
    ]) expect(section.slice(0, section.indexOf("\n## ", 1)), needle).toContain(needle);
    expect(readme.replace(/\s+/gu, " ")).toContain("the debate shape's map (0117, below) the seventh, the language check's site cost (0118, below) the eighth");
  });

  it("documents the reclaim resume 0119 as the step after 0118, with its manifest, its loader and the verifier it keeps", async () => {
    const readme = (await bytesOf("lineage/README.md")).toString("utf8");
    const section = readme.slice(readme.indexOf("## The reclaim resume (0119)"));
    expect(section.startsWith("## The reclaim resume (0119)")).toBe(true);
    for (const needle of ["0118", "0119_reclaim_resume.sql", "reclaim-resume-forward0119.json",
      "verify-effective-capabilities-111.sql", "packages/db/src/migration-forward0119.ts", "replayVerifierSql",
      "core.map_position_repoint", "core.reject_node_mutation_except_retire()", "reject_mutation_except_retire",
      "generation_status", "NODE_RETIRE_AFTER_ANSWER", "MIGRATION_FORWARD0119_", "`STEPS`", "renumber"
    ]) expect(section.slice(0, section.indexOf("\n## ", 1)), needle).toContain(needle);
    expect(readme.replace(/\s+/gu, " ")).toContain("the language check's site cost (0118, below) the eighth, the reclaim resume (0119, below) the ninth");
  });

  it("documents the reply measures 0120 as the step after 0119, with its manifest, its loader and the verifier it keeps", async () => {
    const readme = (await bytesOf("lineage/README.md")).toString("utf8");
    const section = readme.slice(readme.indexOf("## The reply measures (0120)"));
    expect(section.startsWith("## The reply measures (0120)")).toBe(true);
    for (const needle of ["0119", "0120_reply_measures.sql", "reply-measures-forward0120.json", "verify-effective-capabilities-111.sql",
      "packages/db/src/migration-forward0120.ts", "replayVerifierSql", "reply_repairs", "MIGRATION_FORWARD0120_", "`STEPS`", "renumber",
      "core.read_terminal_recorded_facts(uuid)", "REPAIR:STRUCTURE:"
    ]) expect(section.slice(0, section.indexOf("\n## ", 1)), needle).toContain(needle);
    expect(readme.replace(/\s+/gu, " ")).toContain("the reclaim resume (0119, below) the ninth, the reply measures (0120, below) the tenth");
  });

  it("documents the engine verdict 0121 as the step after 0120, with its manifest, its loader and the verifier it keeps", async () => {
    const readme = (await bytesOf("lineage/README.md")).toString("utf8");
    const section = readme.slice(readme.indexOf("## The engine verdict (0121)"));
    expect(section.startsWith("## The engine verdict (0121)")).toBe(true);
    for (const needle of ["0120", "0121_engine_verdict.sql", "engine-verdict-forward0121.json", "verify-effective-capabilities-111.sql",
      "packages/db/src/migration-forward0121.ts", "replayVerifierSql", "ledger.verdict_vote", "SPLIT", "MIGRATION_FORWARD0121_",
      "`STEPS`", "renumber"
    ]) expect(section.slice(0, section.indexOf("\n## ", 1)), needle).toContain(needle);
    expect(readme.replace(/\s+/gu, " ")).toContain("the reply measures (0120, below) the tenth, the engine verdict (0121, below) the eleventh");
  });

  it("chains the engine's map answer step 0122 after 0121: the recipe, 0121's manifest and the effective verifier 0121 keeps (0111's)", async () => {
    const plan = await loadMigrationPlan();
    const netopia = plan.forwardChain[0];
    const names = plan.forwardChain.map((entry) => entry.name);
    const verdictStep = plan.forwardChain[names.indexOf("0121_engine_verdict.sql")];
    const step = plan.forwardChain[names.indexOf("0122_engine_map_check.sql")];
    expect(names.indexOf("0122_engine_map_check.sql")).toBe(names.indexOf("0121_engine_verdict.sql") + 1);
    expect(verdictStep!.verifierSha256).toBe(netopia!.verifierSha256);
    const manifest = JSON.parse((await bytesOf("lineage/engine-map-check-forward0122.json")).toString("utf8"));
    expect(manifest).toEqual({
      version: "engine-map-check-forward0122-v1",
      baseRecipeSha256: plan.recipeSha256,
      previous: {
        name: "0121_engine_verdict.sql",
        manifestSha256: sha256(await bytesOf("lineage/engine-verdict-forward0121.json")),
        verifierSha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      },
      migration: { name: "0122_engine_map_check.sql", sha256: sha256(await bytesOf("0122_engine_map_check.sql")) },
      verifier: { path: "lineage/verify-effective-capabilities-111.sql", sha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql")) }
    });
    expect(step!.manifestSha256).toBe(sha256(await bytesOf("lineage/engine-map-check-forward0122.json")));
    expect(step!.previousName).toBe(verdictStep!.name);
    expect(step!.previousManifestSha256).toBe(verdictStep!.manifestSha256);
    expect(step!.previousVerifierSha256).toBe(verdictStep!.verifierSha256);
    expect(step!.verifierSql).toBe((await bytesOf("lineage/verify-effective-capabilities-111.sql")).toString("utf8"));
    // Its checks are its postcondition (the two tables whole); no supplemental verifier.
    expect(step!.replayVerifierSql).toBeUndefined();
  });

  it("documents the engine's map answer step 0122 as the step after 0121, with its manifest, its loader and the verifier it keeps", async () => {
    const readme = (await bytesOf("lineage/README.md")).toString("utf8");
    const section = readme.slice(readme.indexOf("## The engine's map answer step (0122)"));
    expect(section.startsWith("## The engine's map answer step (0122)")).toBe(true);
    for (const needle of ["0121", "0122_engine_map_check.sql", "engine-map-check-forward0122.json", "verify-effective-capabilities-111.sql",
      "packages/db/src/migration-forward0122.ts", "replayVerifierSql", "core.map_answer_check", "MIGRATION_FORWARD0122_", "`STEPS`", "renumber"
    ]) expect(section.slice(0, section.indexOf("\n## ", 1)), needle).toContain(needle);
    expect(readme.replace(/\s+/gu, " ")).toContain("the engine verdict (0121, below) the eleventh, the engine's map answer step (0122, below) the twelfth");
  });

  it("chains 0124 after 0123: the recipe, 0123's manifest and the effective verifier 0123 keeps (0111's)", async () => {
    const plan = await loadMigrationPlan();
    const netopia = plan.forwardChain[0];
    const names = plan.forwardChain.map((entry) => entry.name);
    const releasesStep = plan.forwardChain[names.indexOf("0123_side_by_side_releases.sql")];
    const step = plan.forwardChain[names.indexOf("0124_settings_activation.sql")];
    expect(names.indexOf("0124_settings_activation.sql")).toBe(names.indexOf("0123_side_by_side_releases.sql") + 1);
    expect(releasesStep!.verifierSha256).toBe(netopia!.verifierSha256);
    const manifest = JSON.parse((await bytesOf("lineage/settings-activation-forward0124.json")).toString("utf8"));
    expect(manifest).toEqual({
      version: "settings-activation-forward0124-v1",
      baseRecipeSha256: plan.recipeSha256,
      previous: {
        name: "0123_side_by_side_releases.sql",
        manifestSha256: sha256(await bytesOf("lineage/side-by-side-releases-forward0123.json")),
        verifierSha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      },
      migration: { name: "0124_settings_activation.sql", sha256: sha256(await bytesOf("0124_settings_activation.sql")) },
      verifier: { path: "lineage/verify-effective-capabilities-111.sql", sha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql")) }
    });
    expect(step!.manifestSha256).toBe(sha256(await bytesOf("lineage/settings-activation-forward0124.json")));
    expect(step!.previousName).toBe(releasesStep!.name);
    expect(step!.previousManifestSha256).toBe(releasesStep!.manifestSha256);
    expect(step!.previousVerifierSha256).toBe(releasesStep!.verifierSha256);
    expect(step!.verifierSql).toBe((await bytesOf("lineage/verify-effective-capabilities-111.sql")).toString("utf8"));
    // The first expand step after the drained 0123: its header says expand and keeps-verifier, as its manifest agrees.
    expect(step!.n1).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    // Its checks are its postcondition (the three tables and the ten functions whole); no supplemental verifier.
    expect(step!.replayVerifierSql).toBeUndefined();
  });

  it("documents 0124 as the step after 0123, with its manifest, its loader and the verifier it keeps", async () => {
    const readme = (await bytesOf("lineage/README.md")).toString("utf8");
    const section = readme.slice(readme.indexOf("## The settings activation (0124)"));
    expect(section.startsWith("## The settings activation (0124)")).toBe(true);
    for (const needle of ["0123", "0124_settings_activation.sql", "settings-activation-forward0124.json", "verify-effective-capabilities-111.sql",
      "packages/db/src/migration-forward0124.ts", "replayVerifierSql", "register.settings_activation", "register.release_switch_settings_hook",
      "-- n1: expand", "MIGRATION_FORWARD0124_", "`STEPS`", "renumber"
    ]) expect(section.slice(0, section.indexOf("\n## ", 1)), needle).toContain(needle);
    expect(readme.replace(/\s+/gu, " ")).toContain(
      "the side-by-side releases (0123, below) the thirteenth, the settings activation (0124, below) the fourteenth");
  });

  it("chains the synthesis check 0126 after 0124: the recipe, 0124's manifest and the effective verifier 0124 keeps (0111's)", async () => {
    const plan = await loadMigrationPlan();
    const step = plan.forwardChain.at(-4);
    const prior = plan.forwardChain.at(-5);
    expect(step?.name).toBe("0126_synthesis_check.sql");
    expect(prior?.name).toBe("0124_settings_activation.sql");
    const manifest = JSON.parse((await bytesOf("lineage/synthesis-check-forward0126.json")).toString("utf8"));
    expect(manifest).toEqual({
      version: "synthesis-check-forward0126-v1",
      baseRecipeSha256: plan.recipeSha256,
      previous: {
        name: "0124_settings_activation.sql",
        manifestSha256: sha256(await bytesOf("lineage/settings-activation-forward0124.json")),
        verifierSha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
      },
      migration: { name: "0126_synthesis_check.sql", sha256: sha256(await bytesOf("0126_synthesis_check.sql")) },
      verifier: { path: "lineage/verify-effective-capabilities-111.sql", sha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql")) }
    });
    expect(step!.manifestSha256).toBe(sha256(await bytesOf("lineage/synthesis-check-forward0126.json")));
    expect(step!.previousManifestSha256).toBe(prior!.manifestSha256);
    expect(step!.previousVerifierSha256).toBe(prior!.verifierSha256);
    expect(step!.replayVerifierSql).toBeUndefined();
  });

  it("documents the synthesis check 0126 as the step after 0124, with its manifest, its loader and the verifier it keeps", async () => {
    const readme = (await bytesOf("lineage/README.md")).toString("utf8");
    const section = readme.slice(readme.indexOf("## The synthesis check (0126)"));
    expect(section.startsWith("## The synthesis check (0126)")).toBe(true);
    const own = section.slice(0, section.indexOf("\n## ", 1));
    for (const needle of ["0124", "0126_synthesis_check.sql", "synthesis-check-forward0126.json",
      "packages/db/src/migration-forward0126.ts", "MIGRATION_FORWARD0125_", "replayVerifierSql",
      "verify-effective-capabilities-111.sql", "synthesis_check_request", "synthesis_check_attempt",
      "synthesis_check_result", "synthesis_check_inheritance", "synthesis_check_removal_request",
      "synthesis_check_removal_notice", "synthesis_check_erasure_binding", "SYNTHESIS_CHECK",
      "debateai_erasure_runtime", "renumber", "`STEPS`"
    ]) expect(own, needle).toContain(needle);
    expect(readme.replace(/\s+/gu, " ")).toContain("the settings activation (0124, below) the fourteenth, the synthesis check (0126, below) the fifteenth, the publication review (0127, below) the sixteenth, the threat reports (0128, below) the seventeenth and the support answer scope (0129, below) the eighteenth");
  });

  it("0127 is followed by 0128 and its previous is 0126", async () => {
    const plan = await loadMigrationPlan();
    const step = plan.forwardChain.at(-3);
    expect(step?.name).toBe("0127_publication_review.sql");
    expect(step?.previousName).toBe("0126_synthesis_check.sql");
  });

  it("0127's manifest binds 0126's manifest and effective verifier SHA-256", async () => {
    const plan = await loadMigrationPlan();
    const step = plan.forwardChain.at(-3);
    const prior = plan.forwardChain.at(-4);
    const manifest = JSON.parse((await bytesOf("lineage/publication-review-forward0127.json")).toString("utf8"));
    expect(manifest.previous).toEqual({
      name: "0126_synthesis_check.sql",
      manifestSha256: sha256(await bytesOf("lineage/synthesis-check-forward0126.json")),
      verifierSha256: sha256(await bytesOf("lineage/verify-effective-capabilities-111.sql"))
    });
    expect(step?.previousManifestSha256).toBe(prior?.manifestSha256);
    expect(step?.previousVerifierSha256).toBe(prior?.verifierSha256);
  });

  it("refuses a changed 0111, 0113, 0114, 0117, 0118, 0119, 0120, 0121, 0122, 0123, 0124, 0126 or 0128, a manifest bound to the wrong previous step, and an undeclared file, before any database", async () => {
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
      // Part C's 0113 changed by one character, and its manifest bound to 0111 (where it was built) instead of 0112.
      await refusal("0113_billing_price_currencies.sql", (text) => text.replace("RON", "RoN"), "MIGRATION_FORWARD0113_SOURCE_DIGEST");
      const forward111Digest = sha256(await bytesOf("lineage/billing-netopia-forward111.json"));
      await refusal("lineage/billing-price-currencies-forward0113.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.name = "0111_billing_netopia.sql";
        manifest.previous.manifestSha256 = forward111Digest;
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD0113_MANIFEST");
      // The same refusal when 0112's own manifest changes under 0113 (its bytes are what 0113 is bound to).
      await refusal("lineage/auth-db-batch-forward.json", (text) => `${text}\n`, "MIGRATION_FORWARD0113_MANIFEST");
      // Role rotation's 0114 changed by one character, and its manifest bound to 0112 instead of 0113.
      await refusal("0114_role_rotation.sql", (text) => text.replace("LEAST_SHARE_SEEDED_TIE_V1", "LEAST_SHARE_SEEDED_TIE_V2"),
        "MIGRATION_FORWARD0114_SOURCE_DIGEST");
      const batchDigest = sha256(await bytesOf("lineage/auth-db-batch-forward.json"));
      await refusal("lineage/role-rotation-forward0114.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.name = "0112_auth_db_batch.sql";
        manifest.previous.manifestSha256 = batchDigest;
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD0114_MANIFEST");
      // The same refusal when 0113's own manifest changes under 0114 (its bytes are what 0114 is bound to).
      await refusal("lineage/billing-price-currencies-forward0113.json", (text) => `${text}\n`, "MIGRATION_FORWARD0114_MANIFEST");
      // The debate shape's map 0117 changed by one character, and its manifest bound to 0115 instead of 0116.
      await refusal("0117_debate_shape_map.sql", (text) => text.replace("MAP_GUARD_CONTRACT_INCOMPLETE", "MAP_GUARD_CONTRACT_INCOMPLETe"),
        "MIGRATION_FORWARD0117_SOURCE_DIGEST");
      const exportDigest = sha256(await bytesOf("lineage/data-export-forward115.json"));
      await refusal("lineage/debate-shape-map-forward0117.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.name = "0115_data_export.sql";
        manifest.previous.manifestSha256 = exportDigest;
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD0117_MANIFEST");
      // The same refusal when 0116's own manifest changes under 0117 (its bytes are what 0117 is bound to): 0116's own
      // loader reads its manifest by content, so a trailing line break leaves 0116 valid and refuses 0117 alone.
      await refusal("lineage/mail-locale-forward0116.json", (text) => `${text}\n`, "MIGRATION_FORWARD0117_MANIFEST");
      // The language check's site cost 0118 changed by one character, and its manifest bound to 0116 instead of 0117.
      await refusal("0118_language_check_spend.sql", (text) => text.replace("LANGUAGE_CHECK_SPEND_GUARD_CONTRACT_INVALID", "LANGUAGE_CHECK_SPEND_GUARD_CONTRACT_INVALId"),
        "MIGRATION_FORWARD0118_SOURCE_DIGEST");
      const mailLocaleDigest = sha256(await bytesOf("lineage/mail-locale-forward0116.json"));
      await refusal("lineage/language-check-spend-forward0118.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.name = "0116_mail_locale.sql";
        manifest.previous.manifestSha256 = mailLocaleDigest;
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD0118_MANIFEST");
      // The same refusal when 0117's own manifest changes under 0118 (its bytes are what 0118 is bound to): 0117's own
      // loader reads its manifest by content, so a trailing line break leaves 0117 valid and refuses 0118 alone.
      await refusal("lineage/debate-shape-map-forward0117.json", (text) => `${text}\n`, "MIGRATION_FORWARD0118_MANIFEST");
      // The reclaim resume 0119 changed by one character, and its manifest bound to 0117 instead of 0118.
      await refusal("0119_reclaim_resume.sql", (text) => text.replace("NODE_RETIRE_ONE_WAY", "NODE_RETIRE_ONE_WAy"),
        "MIGRATION_FORWARD0119_SOURCE_DIGEST");
      const mapDigest = sha256(await bytesOf("lineage/debate-shape-map-forward0117.json"));
      await refusal("lineage/reclaim-resume-forward0119.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.name = "0117_debate_shape_map.sql";
        manifest.previous.manifestSha256 = mapDigest;
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD0119_MANIFEST");
      // The same refusal when 0118's own manifest changes under 0119: 0118 stays valid, 0119 alone refuses.
      await refusal("lineage/language-check-spend-forward0118.json", (text) => `${text}\n`, "MIGRATION_FORWARD0119_MANIFEST");
      // The reply measures 0120 changed by one character, and its manifest bound to 0118 instead of 0119.
      await refusal("0120_reply_measures.sql", (text) => text.replace("reply_form text", "reply_form varchar"), "MIGRATION_FORWARD0120_SOURCE_DIGEST");
      const languageDigest = sha256(await bytesOf("lineage/language-check-spend-forward0118.json"));
      await refusal("lineage/reply-measures-forward0120.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.name = "0118_language_check_spend.sql";
        manifest.previous.manifestSha256 = languageDigest;
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD0120_MANIFEST");
      // The same refusal when 0119's own manifest changes under 0120: 0119 stays valid, 0120 alone refuses.
      await refusal("lineage/reclaim-resume-forward0119.json", (text) => `${text}\n`, "MIGRATION_FORWARD0120_MANIFEST");
      // The engine verdict 0121 changed by one character, and its manifest bound to 0119 instead of 0120.
      await refusal("0121_engine_verdict.sql", (text) => text.replace("ENGINE_VERDICT_GUARD_CONTRACT_INCOMPLETE", "ENGINE_VERDICT_GUARD_CONTRACT_INCOMPLETe"),
        "MIGRATION_FORWARD0121_SOURCE_DIGEST");
      const reclaimDigest = sha256(await bytesOf("lineage/reclaim-resume-forward0119.json"));
      await refusal("lineage/engine-verdict-forward0121.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.name = "0119_reclaim_resume.sql";
        manifest.previous.manifestSha256 = reclaimDigest;
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD0121_MANIFEST");
      // The same refusal when 0120's own manifest changes under 0121: 0120 stays valid, 0121 alone refuses.
      await refusal("lineage/reply-measures-forward0120.json", (text) => `${text}\n`, "MIGRATION_FORWARD0121_MANIFEST");
      // The engine's map answer step 0122 changed by one character, and its manifest bound to 0120 instead of 0121.
      await refusal("0122_engine_map_check.sql", (text) => text.replace("ENGINE_MAP_CHECK_GUARD_CONTRACT_INCOMPLETE", "ENGINE_MAP_CHECK_GUARD_CONTRACT_INCOMPLETe"),
        "MIGRATION_FORWARD0122_SOURCE_DIGEST");
      const replyDigest = sha256(await bytesOf("lineage/reply-measures-forward0120.json"));
      await refusal("lineage/engine-map-check-forward0122.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.name = "0120_reply_measures.sql";
        manifest.previous.manifestSha256 = replyDigest;
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD0122_MANIFEST");
      // The same refusal when 0121's own manifest changes under 0122: 0121 stays valid, 0122 alone refuses.
      await refusal("lineage/engine-verdict-forward0121.json", (text) => `${text}\n`, "MIGRATION_FORWARD0122_MANIFEST");
      // The side-by-side releases 0123 changed by one character, and its manifest bound to 0121 instead of 0122.
      await refusal("0123_side_by_side_releases.sql", (text) => text.replace("SIDE_BY_SIDE_RELEASE_STAMP_CONTRACT_INCOMPLETE", "SIDE_BY_SIDE_RELEASE_STAMP_CONTRACT_INCOMPLETe"),
        "MIGRATION_FORWARD0123_SOURCE_DIGEST");
      const verdictDigest = sha256(await bytesOf("lineage/engine-verdict-forward0121.json"));
      await refusal("lineage/side-by-side-releases-forward0123.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.name = "0121_engine_verdict.sql";
        manifest.previous.manifestSha256 = verdictDigest;
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD0123_MANIFEST");
      // The same refusal when 0122's own manifest changes under 0123: 0122 stays valid, 0123 alone refuses.
      await refusal("lineage/engine-map-check-forward0122.json", (text) => `${text}\n`, "MIGRATION_FORWARD0123_MANIFEST");
      // The settings activation 0124 changed by one character, and its manifest bound to 0122 instead of 0123.
      await refusal("0124_settings_activation.sql", (text) => text.replace("SETTINGS_ACTIVATION_GUARD_CONTRACT_INCOMPLETE", "SETTINGS_ACTIVATION_GUARD_CONTRACT_INCOMPLETe"),
        "MIGRATION_FORWARD0124_SOURCE_DIGEST");
      const mapCheckDigest = sha256(await bytesOf("lineage/engine-map-check-forward0122.json"));
      await refusal("lineage/settings-activation-forward0124.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.name = "0122_engine_map_check.sql";
        manifest.previous.manifestSha256 = mapCheckDigest;
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD0124_MANIFEST");
      // The same refusal when 0123's own manifest changes under 0124: 0123 stays valid, 0124 alone refuses.
      await refusal("lineage/side-by-side-releases-forward0123.json", (text) => `${text}\n`, "MIGRATION_FORWARD0124_MANIFEST");
      // Side-by-side §5 (A6 review): 0123 without its `-- n1: keeps-verifier` line, its manifest re-digested so 0123's own
      // loader accepts the bytes: the header now says the verifier changes while the manifest names the one before, so
      // the chain refuses the disagreement (an older release trusts keeps-verifier when it accepts a database ahead).
      {
        const sqlPath = join(root, "migrations/0123_side_by_side_releases.sql");
        const manifestPath = join(root, "migrations/lineage/side-by-side-releases-forward0123.json");
        const [originalSql, originalManifest] = [await readFile(sqlPath, "utf8"), await readFile(manifestPath, "utf8")];
        const changed = originalSql.replace("-- n1: keeps-verifier\n", "");
        expect(changed).not.toBe(originalSql);
        const manifest = JSON.parse(originalManifest);
        manifest.migration.sha256 = sha256(changed);
        try {
          await writeFile(sqlPath, changed);
          await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
          await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_FORWARD_CHAIN_N1_KEEPS_VERIFIER 0123_side_by_side_releases.sql") });
        } finally {
          await writeFile(sqlPath, originalSql);
          await writeFile(manifestPath, originalManifest);
        }
      }
      // The synthesis check 0126 changed by one character, and its manifest bound to 0123 instead of 0124.
      await refusal("0126_synthesis_check.sql", (text) => `${text} `, "MIGRATION_FORWARD0125_SOURCE_DIGEST");
      const releasesDigest = sha256(await bytesOf("lineage/side-by-side-releases-forward0123.json"));
      await refusal("lineage/synthesis-check-forward0126.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.name = "0123_side_by_side_releases.sql";
        manifest.previous.manifestSha256 = releasesDigest;
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD0125_MANIFEST");
      // The same refusal when 0124's own manifest changes under 0126: 0124 stays valid, 0126 alone refuses.
      await refusal("lineage/settings-activation-forward0124.json", (text) => `${text}\n`, "MIGRATION_FORWARD0125_MANIFEST");
      // The threat reports 0128 changed by one character, its manifest bound to 0126 instead of 0127, and 0127's manifest
      // changed under it.
      await refusal("0128_threat_reports.sql", (text) => `${text} `, "MIGRATION_FORWARD0127_SOURCE_DIGEST");
      await refusal("lineage/threat-reports-forward0128.json", (text) => {
        const manifest = JSON.parse(text);
        manifest.previous.name = "0126_synthesis_check.sql";
        return `${JSON.stringify(manifest, null, 2)}\n`;
      }, "MIGRATION_FORWARD0127_MANIFEST");
      await refusal("lineage/publication-review-forward0127.json", (text) => `${text}\n`, "MIGRATION_FORWARD0127_MANIFEST");
      const extra = join(root, "migrations/0199_unbound_step.sql");
      await writeFile(extra, "SELECT 1;\n");
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_LINEAGE_REFUSED SOURCE_INVENTORY") });
      await rm(extra);
      await run();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);
  it("chains the threat reports 0128 after 0127 with 0127's manifest and effective verifier", async () => {
    const plan = await loadMigrationPlan();
    const step = plan.forwardChain.at(-2);
    const previous = plan.forwardChain.at(-3);
    const manifest = JSON.parse((await bytesOf("lineage/threat-reports-forward0128.json")).toString("utf8"));
    expect(step?.name).toBe("0128_threat_reports.sql");
    expect(previous?.name).toBe("0127_publication_review.sql");
    expect(manifest.previous).toEqual({
      name: previous?.name,
      manifestSha256: sha256(await bytesOf("lineage/publication-review-forward0127.json")),
      verifierSha256: previous?.verifierSha256
    });
    expect(step?.replayVerifierSql).toBeUndefined();
  });

  it("documents the threat reports 0128 as the seventeenth chain step", async () => {
    const readme = (await bytesOf("lineage/README.md")).toString("utf8");
    const section = readme.split("## The threat reports (0128)")[1]?.split("\n## ")[0] ?? "";
    for (const needle of ["0127", "0128_threat_reports.sql", "threat-reports-forward0128.json",
      "verify-effective-capabilities-111.sql", "packages/db/src/migration-forward0128.ts",
      "replayVerifierSql", "staff.threat_report", "MIGRATION_FORWARD0127_", "`STEPS`", "renumber"])
      expect(section, needle).toContain(needle);
    expect(readme.replace(/\s+/gu, " ")).toContain("the publication review (0127, below) the sixteenth, the threat reports (0128, below) the seventeenth");
  });

  it("chains support deletion 0129 after 0128 and records its source digest", async () => {
    const plan = await loadMigrationPlan();
    const step = plan.forwardChain.at(-1);
    const previous = plan.forwardChain.at(-2);
    const manifest = JSON.parse((await bytesOf("lineage/support-answer-scope-forward0129.json")).toString("utf8"));
    expect(step?.name).toBe("0129_support_answer_scope.sql");
    expect(previous?.name).toBe("0128_threat_reports.sql");
    expect(manifest.previous).toEqual({ name: previous?.name,
      manifestSha256: sha256(await bytesOf("lineage/threat-reports-forward0128.json")),
      verifierSha256: previous?.verifierSha256 });
    expect(manifest.migration.sha256).toBe(sha256(await bytesOf("0129_support_answer_scope.sql")));
    expect(step?.replayVerifierSql).toBeUndefined();
  });

  it("keeps loadMigrationPlan's import closure self-contained: node built-ins and ./migration-*.js only (A6 ruling B)", async () => {
    // The plan is loaded by standalone probes (the temporary copies above, which hold only packages/db/src/migration-*.ts)
    // and by the preview's superuser JIT creator (deploy/preview-lifecycle/v1/jit-creator-actor.mjs). A package import
    // (for example @debateai/kernel for TypedDomainError) would break the first and widen the second, so the loader
    // family's refusals are plain Errors carrying `.code` (migration-n1.ts migrationRefusal). Type-only imports are erased.
    const seen = new Set<string>();
    const pending = ["migration-lineage.ts"];
    while (pending.length > 0) {
      const file = pending.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = await readFile(new URL(file, DB_SOURCE), "utf8");
      expect(source, file).not.toMatch(/\bimport\s*\(|\brequire\s*\(/u);
      for (const [statement, specifier] of [...source.matchAll(/^\s*(?:import|export)\s[^'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gmu)]
        .map((match) => [match[0], match[1] ?? match[2]!] as const)) {
        if (/^\s*(?:import|export)\s+type\s/u.test(statement)) continue;
        if (specifier.startsWith("node:")) continue;
        expect(specifier, `${file} imports ${specifier}`).toMatch(/^\.\/migration-[a-z0-9-]+\.js$/u);
        pending.push(specifier.slice(2).replace(/\.js$/u, ".ts"));
      }
    }
    // The walk reaches the n1 parser; the per-step transaction module (house TypedDomainError) stays outside it.
    expect(seen).toContain("migration-forward-chain.ts");
    expect(seen).toContain("migration-n1.ts");
    expect(seen).not.toContain("migration-transaction.ts");
  });

  it("refuses an outside-transaction step that names no plain index, before any SQL (A6 review)", async () => {
    const sent: string[] = [];
    const client = { query: async (text: string) => { sent.push(text); return { rows: [] }; } } as unknown as PoolClient;
    const step = (n1: ChainStep["n1"]): ChainStep => ({ name: "0199_probe.sql", n1 } as unknown as ChainStep);
    const declared = { expand: true, drained: false, keepsVerifier: true, outsideTransaction: true } as const;
    for (const n1 of [
      { ...declared, concurrentIndex: null },
      { ...declared, outsideTransaction: false, concurrentIndex: { schema: "core", table: "run", name: "probe_idx" } },
      { ...declared, concurrentIndex: { schema: "core; DROP TABLE core.run", table: "run", name: "probe_idx" } },
      { ...declared, concurrentIndex: { schema: "core", table: "run x", name: "probe_idx" } },
      { ...declared, concurrentIndex: { schema: "core", table: "run", name: "Probe" } }
    ]) {
      await expect(runOutsideTransactionStep(client, step(n1)), JSON.stringify(n1))
        .rejects.toMatchObject({ code: "MIGRATION_FORWARD_CHAIN_OUTSIDE_TRANSACTION_UNDECLARED", message: "MIGRATION_FORWARD_CHAIN_OUTSIDE_TRANSACTION_UNDECLARED 0199_probe.sql" });
    }
    expect(sent).toEqual([]);
  });

  it("writes every migration lock wait as MIGRATION_LOCK_TIMEOUT_MS (A6 review)", async () => {
    // The step transaction's SET LOCAL and the outside-transaction build's session SET: each module holds exactly one.
    const seconds = `${MIGRATION_LOCK_TIMEOUT_MS / 1000}s`;
    for (const file of ["migration-transaction.ts", "migration-forward-chain.ts"]) {
      const literals = [...(await readFile(new URL(file, DB_SOURCE), "utf8")).matchAll(/lock_timeout = '([^']*)'/gu)].map((match) => match[1]);
      expect(literals, file).toEqual([seconds]);
    }
  });
});
