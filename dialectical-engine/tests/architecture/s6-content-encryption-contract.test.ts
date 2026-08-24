import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFile(new URL(relative, root), "utf8");

describe("S6 content-encryption architecture contract", () => {
  it("has an additive replay-safe 0038 migration covering all eleven carrier groups", async () => {
    const migration = await read("migrations/0038_content_encryption.sql");
    for (const table of [
      "core.run", "core.node", "core.stranger_restatement", "ledger.raw_artifact",
      "serve.fact_bundle", "serve.composed_text", "ledger.node_review",
      "memory.question_key", "memory.pull_record", "core.investigation_request",
      "evidence.query_set", "evidence.query_amendment", "evidence.evidence_item", "evidence.absence_row"
    ]) expect(migration).toContain(table);
    expect(migration).toContain("question_blind_index");
    expect(migration).toContain("content_ciphertext");
    expect(migration).toContain("CONTENT_PLAINTEXT_WRITE_FORBIDDEN");
    expect(migration).toContain("IF NOT EXISTS");
  });

  it("keeps irreversible enablement default-off and wires both API and runner through the external key store", async () => {
    const [environment, apiMain, runnerMain] = await Promise.all([
      read("packages/register/src/runtime-environment.ts"),
      read("apps/api/src/main.ts"),
      read("apps/runner/src/main.ts")
    ]);
    expect(environment).toContain('CONTENT_ENCRYPTION_ENABLED: z.enum(["true", "false"]).default("false")');
    expect(environment).toContain("CONTENT_BLIND_INDEX_KEY_PATH");
    expect(environment.match(/USER_DEK_STORE_PATH/g)?.length).toBeGreaterThanOrEqual(2);
    expect(apiMain).toContain('environment.CONTENT_ENCRYPTION_ENABLED === "true"');
    expect(runnerMain).toContain('environment.CONTENT_ENCRYPTION_ENABLED === "true"');
    expect(apiMain).toContain("FileRunContentKeyStore");
    expect(runnerMain).toContain("FileRunContentKeyStore");
  });

  it("declares the crypto dependency instead of relying on relative package traversal", async () => {
    const runner = JSON.parse(await read("apps/runner/package.json")) as { dependencies?: Record<string, string> };
    expect(runner.dependencies?.["@debateai/crypto"]).toBe("workspace:*");
  });

  it("keeps evaluator key preparation outside harvest transactions and add-on run locks", async () => {
    const evaluator = await read("packages/evaluator/src/index.ts");
    const harvest = evaluator.slice(
      evaluator.indexOf("async harvestTerminalRun"),
      evaluator.indexOf("private async recordPipelineEvent", evaluator.indexOf("async harvestTerminalRun"))
    );
    const readSnapshot = evaluator.slice(
      evaluator.indexOf("private async readSnapshot"),
      evaluator.indexOf("export const PROFILE_DERIVATION_VERSION", evaluator.indexOf("private async readSnapshot"))
    );
    const harvestPrepare = harvest.indexOf("prepareContentEncryptionForRun");
    const harvestTransaction = harvest.indexOf("withWriteTransaction");
    const harvestCallback = harvest.indexOf("async (client) =>", harvestTransaction);
    expect(harvestPrepare).toBeGreaterThan(-1);
    expect(harvestPrepare).toBeLessThan(harvestTransaction);
    expect(harvestCallback).toBeGreaterThan(harvestTransaction);
    expect(harvest.slice(harvestCallback, harvest.indexOf("});", harvestCallback) + 3))
      .not.toContain("this.pool");
    expect(harvest).toContain("preparedContent?.close()");
    expect(readSnapshot).toContain("decryptPreparedContentForRun");
    expect(readSnapshot).not.toContain("decryptContentForRun");
    expect(readSnapshot).not.toContain("prepareContentEncryptionForRun");
    expect(readSnapshot).not.toContain("this.pool");

    const addonRunner = evaluator.slice(
      evaluator.indexOf("export async function runEvaluatorJudgeAddon"),
      evaluator.indexOf("function extractBlindJudgementReasons")
    );
    const addonCallback = addonRunner.slice(addonRunner.indexOf("withRunLock"));
    expect(addonCallback).toContain("loadCandidate(input.runId, client, preparedContent)");
    expect(addonCallback).toContain("preparedContent?.close()");
    expect(addonCallback).not.toContain("prepareContentEncryptionForRun");
    expect(addonCallback).not.toContain("decryptContentForRun");

    const withRunLock = evaluator.slice(
      evaluator.indexOf("async withRunLock<T>(", evaluator.indexOf("export class PostgresEvaluatorAddonRepository")),
      evaluator.indexOf("async loadCandidate", evaluator.indexOf("export class PostgresEvaluatorAddonRepository"))
    );
    const addonPrepare = withRunLock.indexOf("prepareContentEncryptionForRun");
    const addonConnect = withRunLock.indexOf("this.pool.connect");
    expect(addonPrepare).toBeGreaterThan(-1);
    expect(addonPrepare).toBeLessThan(addonConnect);
    expect(withRunLock).toContain("work(client, preparedContent)");
    expect(withRunLock).toContain("preparedContent?.close()");

    const loadCandidate = evaluator.slice(
      evaluator.indexOf("async #loadCandidate", evaluator.indexOf("export class PostgresEvaluatorAddonRepository")),
      evaluator.indexOf("async recordPipelineEvent", evaluator.indexOf("export class PostgresEvaluatorAddonRepository"))
    );
    expect(loadCandidate).toContain("decryptPreparedContentForRun");
    expect(loadCandidate).not.toContain("decryptContentForRun");
    expect(loadCandidate).not.toContain("prepareContentEncryptionForRun");
    expect(loadCandidate).not.toContain("this.pool");
  });
});
