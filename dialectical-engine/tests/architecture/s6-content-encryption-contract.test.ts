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

  it("shares the content-lease scope across duplicate workspace module instances", async () => {
    const database = await read("packages/db/src/index.ts");
    expect(database).toContain("type ContentLeaseScopeState = Readonly<{");
    expect(database).toContain("__debateaiRunContentLeaseScopeV1?: AsyncLocalStorage<ContentLeaseScopeState>");
    expect(database).toContain("databaseGlobals.__debateaiRunContentLeaseScopeV1");
    expect(database).toContain("??= new AsyncLocalStorage<ContentLeaseScopeState>()");
    const acquisition = database.slice(
      database.indexOf("export async function acquireRunContentLease("),
      database.indexOf("export async function withRunContentLease<T>(")
    );
    expect(acquisition).toContain(
      "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired"
    );
    expect(acquisition).not.toContain(
      "SELECT pg_advisory_lock(hashtextextended($1,0))"
    );
    expect(acquisition).toContain("await unlock()");
    expect(acquisition).toContain("setTimeout(resolve,10)");
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
    const harvestPrepare = harvest.indexOf("prepareLeasedContentEncryptionForRun");
    const harvestTransaction = harvest.indexOf("withWriteTransaction");
    const harvestCallback = harvest.indexOf("async (client) =>", harvestTransaction);
    expect(harvestPrepare).toBeGreaterThan(-1);
    expect(harvestPrepare).toBeLessThan(harvestTransaction);
    expect(harvestCallback).toBeGreaterThan(harvestTransaction);
    expect(harvest.slice(harvestCallback, harvest.indexOf("});", harvestCallback) + 3))
      .not.toContain("this.pool");
    expect(harvest).toContain("leasedContent?.close()");
    expect(readSnapshot).toContain("decryptLeasedContentForRun");
    expect(readSnapshot).not.toContain("decryptContentForRun");
    expect(readSnapshot).not.toContain("prepareLeasedContentEncryptionForRun");
    expect(readSnapshot).not.toContain("this.pool");

    const addonCallback = evaluator.slice(
      evaluator.indexOf("async withRunLock<T>"),
      evaluator.indexOf("async loadCandidate(", evaluator.indexOf("async withRunLock<T>"))
    );
    expect(addonCallback).toContain("withRunContentLease(this.pool, [runId]");
    expect(addonCallback).toContain("prepareLeasedContentEncryptionForRun");
    expect(addonCallback).toContain("work(client, leasedContent)");
    expect(addonCallback).toContain("leasedContent.close()");
    expect(addonCallback).not.toContain("prepareContentEncryptionForRun");
    expect(addonCallback).not.toContain("decryptContentForRun");

    const withRunLock = evaluator.slice(
      evaluator.indexOf("async withRunLock<T>(", evaluator.indexOf("export class PostgresEvaluatorAddonRepository")),
      evaluator.indexOf("async loadCandidate", evaluator.indexOf("export class PostgresEvaluatorAddonRepository"))
    );
    const addonLease = withRunLock.indexOf("withRunContentLease(this.pool, [runId]");
    const addonPrepare = withRunLock.indexOf("prepareLeasedContentEncryptionForRun");
    const addonSharedClient = withRunLock.indexOf("const client=contentLease.client");
    const addonLock = withRunLock.indexOf("pg_try_advisory_lock");
    const addonWork = withRunLock.indexOf("work(client, leasedContent)");
    const addonClose = withRunLock.indexOf("leasedContent.close()");
    expect(addonLease).toBeGreaterThan(-1);
    expect(addonPrepare).toBeGreaterThan(-1);
    expect(addonSharedClient).toBeGreaterThan(-1);
    expect(addonLock).toBeGreaterThan(-1);
    expect(addonWork).toBeGreaterThan(-1);
    expect(addonClose).toBeGreaterThan(-1);
    expect(addonLease).toBeLessThan(addonPrepare);
    expect(addonPrepare).toBeLessThan(addonSharedClient);
    expect(addonSharedClient).toBeLessThan(addonLock);
    expect(addonLock).toBeLessThan(addonWork);
    expect(addonWork).toBeLessThan(addonClose);
    expect(withRunLock).not.toContain("this.pool.connect");

    const loadCandidate = evaluator.slice(
      evaluator.indexOf("async #loadCandidate", evaluator.indexOf("export class PostgresEvaluatorAddonRepository")),
      evaluator.indexOf("async recordPipelineEvent", evaluator.indexOf("export class PostgresEvaluatorAddonRepository"))
    );
    expect(loadCandidate).toContain("decryptLeasedContentForRun");
    expect(loadCandidate).not.toContain("decryptContentForRun");
    expect(loadCandidate).not.toContain("prepareContentEncryptionForRun");
    expect(loadCandidate).not.toContain("this.pool");
  });

  it("bounds every owner-history decrypt scan before leases or key loads", async () => {
    const [database,liveness,memory,serve,api,main,acceptance] = await Promise.all([
      read("packages/db/src/index.ts"),
      read("packages/liveness/src/index.ts"),
      read("packages/memory/src/index.ts"),
      read("packages/serve/src/index.ts"),
      read("apps/api/src/index.ts"),
      read("apps/api/src/main.ts"),
      read("acceptance/main.ts")
    ]);
    expect(database).toContain("export const MAX_OWNER_PRIVATE_HISTORY_SCAN = 128");
    expect(liveness).toContain("LIMIT $3");
    expect(liveness).toContain("MAX_OWNER_PRIVATE_HISTORY_SCAN+1");
    expect(liveness).toContain(
      "FROM core.lock_owned_live_runs($1::uuid[],$2::uuid,$3::text)"
    );
    expect(liveness).not.toMatch(
      /SELECT run_id FROM core\.run\s+WHERE run_id=ANY\(\$1::uuid\[\]\) ORDER BY run_id FOR UPDATE/
    );
    expect(memory).toContain("LIMIT $4");
    expect(memory).toContain("MAX_OWNER_PRIVATE_HISTORY_SCAN+1");
    for (const source of [liveness,memory]) {
      expect(source).toContain("OWNER_PRIVATE_HISTORY_SCAN_SATURATED");
    }
    expect(serve).toContain("limit > MAX_OWNER_PRIVATE_HISTORY_SCAN");
    expect(api).toContain("limit > MAX_OWNER_PRIVATE_HISTORY_SCAN");
    expect(api).toContain('error.code === "OWNER_PRIVATE_HISTORY_SCAN_SATURATED"');
    expect(api).toContain('throw new TypeError("ASK_ADMISSION_DATABASE_POOLS_MUST_BE_SEPARATE")');
    expect(api).not.toContain("askAdmissionPools:Readonly<{ server:Pool;legacy:Pool }>=");
    expect(database).toContain('const OWNER_ASK_ADMISSION_NAMESPACE = "debateai:owner-ask-admission:v1:"');
    expect(database).toContain("export async function acquireOwnerAskAdmissionLease(");
    expect(database).toContain("SELECT pg_advisory_lock(hashtextextended($1,0))");
    expect(database).toContain("SELECT pg_advisory_unlock(hashtextextended($1,0)) AS unlocked");
    const admissionLease=database.slice(
      database.indexOf("export async function withOwnerAskAdmissionLease<T>("),
      database.indexOf("export interface DiscoveredPanelMember")
    );
    expect(admissionLease).toContain("await acquireOwnerAskAdmissionLease(pool,input)");
    expect(admissionLease).toContain("await lease.release()");
    const startRun=database.slice(
      database.indexOf("async startRun("),database.indexOf("async readLoadingProjection(")
    );
    expect(startRun).toContain("admissionClient?: PoolClient");
    expect(startRun).toContain("const provisionExecutor=admissionClient ?? this.provisionPool");
    expect(startRun).toContain("client = admissionClient ?? await this.pool.connect()");
    expect(startRun).toContain("if (ownsClient) client?.release()");
    const submit=api.slice(
      api.indexOf("async submit("),api.indexOf("async unlinkMemoryLink(")
    );
    const lease=submit.indexOf("withOwnerAskAdmissionLease(admissionPool,ownership");
    const livenessCall=submit.indexOf("this.#liveness.recordQuery",lease);
    const start=submit.indexOf("this.#runs.startRun",livenessCall);
    const memoryWrite=submit.indexOf("this.#serve.recordMemoryQuestion",start);
    const enqueue=submit.indexOf("this.#work.enqueue",memoryWrite);
    const dispatch=submit.indexOf("this.dispatcher.dispatch",enqueue);
    expect(lease).toBeGreaterThan(-1);
    expect(livenessCall).toBeGreaterThan(lease);
    expect(start).toBeGreaterThan(livenessCall);
    expect(memoryWrite).toBeGreaterThan(start);
    expect(enqueue).toBeGreaterThan(memoryWrite);
    expect(dispatch).toBeGreaterThan(enqueue);
    expect(submit.slice(lease,memoryWrite)).toContain("},lease.client);");
    expect(submit.slice(start,memoryWrite)).toContain("});\n    } catch");
    expect(main).toContain("const serverAskAdmissionPool=createPool(environment.CONTENT_PROVISION_DATABASE_URL)");
    expect(main).toContain("const legacyAskAdmissionPool=createPool(environment.DATABASE_URL)");
    expect(main).toContain("ASK_ADMISSION_DATABASE_POOLS_MUST_BE_SEPARATE");
    expect(main).toContain("assertContentProvisionDatabaseRole(pool,serverAskAdmissionPool)");
    expect(main).toContain("assertAccountErasureDatabaseRole(legacyAskAdmissionPool,erasurePool)");
    expect(main).toContain("server:serverAskAdmissionPool,legacy:legacyAskAdmissionPool");
    expect(main).toContain("serverAskAdmissionPool,\n    legacyAskAdmissionPool");
    expect(acceptance.match(/createPool\(input\.environment\.DATABASE_URL\)/g)).toHaveLength(2);
    expect(acceptance).toContain("ACCEPTANCE_ASK_ADMISSION_DATABASE_ROLE_MISMATCH");
    expect(acceptance).toContain("server:serverAskAdmissionPool,legacy:legacyAskAdmissionPool");
    expect(acceptance).toContain("serverAskAdmissionPool.end(),legacyAskAdmissionPool.end()");
  });
});
