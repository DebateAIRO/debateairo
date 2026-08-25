import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const source = (relativePath: string): Promise<string> =>
  readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");

async function TypeScriptSources(relativePath: string): Promise<readonly string[]> {
  const root = new URL(`../../${relativePath}/`,import.meta.url);
  const visit = async (directory: URL, prefix: string): Promise<string[]> => {
    const result: string[] = [];
    for (const entry of await readdir(directory,{ withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) result.push(...await visit(new URL(`${entry.name}/`,directory),`${path}/`));
      else if (entry.isFile() && entry.name.endsWith(".ts")) result.push(`${relativePath}/${path}`);
    }
    return result;
  };
  return Object.freeze(await visit(root,""));
}

describe("S10 carrier erasure — RED acceptance contracts", () => {
  it("keeps provider parse details inside the run envelope and persists only a content-free code", async () => {
    const [providers, ledger] = await Promise.all([
      source("packages/providers/src/index.ts"),
      source("packages/ledger/src/index.ts")
    ]);

    expect(/parseErrorDetail:\s*input\.parseError\s*\?\?\s*null/.test(ledger)).toBe(true);
    expect(/parseErrorCode/.test(ledger)).toBe(true);
    expect(/JSON\.stringify\(input\.metadata\),\s*input\.parseStatus,\s*input\.parseError/
      .test(ledger)).toBe(false);
    // Provider detail is allowed to cross this in-memory boundary only because
    // the repository puts it inside the run envelope before persistence.
    expect(/parseError:\s*error instanceof Error\s*\?\s*error\.message\s*:\s*String\(error\)/
      .test(providers)).toBe(true);
  });

  it("does not persist an unkeyed query-set digest or copy it into memory", async () => {
    const [evidence, memory] = await Promise.all([
      source("packages/evidence/src/index.ts"),
      source("packages/memory/src/index.ts")
    ]);

    expect(evidence.includes("deriveContentLocatorForRun")).toBe(false);
    expect(evidence.includes("content_attestation")).toBe(true);
    expect(evidence.includes("content_hash_version")).toBe(true);
    expect(/frozenQuerySetHash:\s*row\.content_hash/.test(memory)).toBe(false);
    expect(/frozen_query_set_hash[^\n]*content_hash/.test(memory)).toBe(false);
  });

  it("does not copy fact-bundle or prior-pull locators across carrier domains", async () => {
    const memory = await source("packages/memory/src/index.ts");

    expect(memory.includes("content_attestation")).toBe(true);
    expect(memory.includes("deriveContentLocatorForRun")).toBe(false);
    expect(memory.includes("content_hash_version")).toBe(true);
  });

  it("does not persist shared raw-artifact and ledger-entry plaintext input hashes", async () => {
    const ledger = await source("packages/ledger/src/index.ts");

    expect(/input\.inputHash,\s*input\.contractHash,\s*input\.contentHash,\s*sequence/
      .test(ledger)).toBe(false);
    expect(ledger.includes("deriveContentLocatorsForRun")).toBe(false);
  });

  it("lets the trusted DB overwrite content-free critique receipts", async () => {
    const critique = await source("packages/critique/src/index.ts");

    expect(critique.includes("deriveContentLocatorsForRun")).toBe(false);
    expect(critique.includes("packet_fingerprint_version")).toBe(true);
  });

  it("refuses every encrypted v1 blind index instead of grandfathering equality bytes", async () => {
    const migration = await source("migrations/0040_account_erasure.sql");

    // Version 1 remains the migration default only so pre-S10 rows are never
    // silently relabelled as v2. The no-grandfather preflight below must reject
    // every encrypted v1 row before any forward writer is installed.
    expect(/question_blind_index_version\s+integer\s+NOT NULL\s+DEFAULT 2/
      .test(migration)).toBe(false);
    expect(/CONTENT_BLIND_INDEX_V1_ROWS_FORBIDDEN/.test(migration)).toBe(true);
    expect(/content_encryption_version\s*=\s*1[\s\S]{0,240}question_blind_index_version<>2/
      .test(migration)).toBe(true);
  });

  it("filters completed private tombstones before any external key load", async () => {
    const [liveness, memory] = await Promise.all([
      source("packages/liveness/src/index.ts"),
      source("packages/memory/src/index.ts")
    ]);

    expect(liveness.includes("serve.private_run_erasure_tombstone")).toBe(true);
    expect(memory.includes("serve.private_run_erasure_tombstone")).toBe(true);
  });

  it("holds a PostgreSQL session content lease across prepared decrypt and use", async () => {
    const db = await source("packages/db/src/index.ts");

    expect(/pg_advisory_lock/.test(db)).toBe(true);
    expect(/pg_advisory_unlock/.test(db)).toBe(true);
    expect(/CONTENT_LEASE/.test(db)).toBe(true);
    expect(/export function decryptPreparedContentForRun/.test(db)).toBe(false);
  });

  it("discovers complete related-run scopes at every production runner and Serve entrypoint", async () => {
    const [memory,runner,serve] = await Promise.all([
      source("packages/memory/src/index.ts"),
      source("apps/runner/src/index.ts"),
      source("packages/serve/src/index.ts")
    ]);
    expect(memory).toMatch(/async withDisclosureContentLease<T>/);
    expect(memory).toMatch(/CONTENT_LEASE_SCOPE_CHANGED/);
    expect(memory).toMatch(/attempt < 3/);
    expect(memory).toMatch(/return this\.withDisclosureContentLease\(\[runId\]/);
    expect(runner).toMatch(/this\.#memory\.withDisclosureContentLease\(\[claimedRunId\]/);
    expect(serve.match(/this\.#memory\.withDisclosureContentLease/g)).toHaveLength(3);
    expect(serve).toMatch(/readReviewCatchUpSource[\s\S]*withDisclosureContentLease\(\[runId\]/);
    expect(serve).toMatch(/readAnswerProjection[\s\S]*withDisclosureContentLease\(\[row\.run_id\]/);
    expect(serve).toMatch(/readAnswerIndex[\s\S]*withDisclosureContentLease\([\s\S]*page\.rows\.map/);
  });

  it("keeps the cross-run evaluator consumer on current public snapshots only", async () => {
    const [consumer,contract,adapter,worker] = await Promise.all([
      source("packages/evaluator/src/consumer-postgres.ts"),
      source("packages/evaluator/src/consumer.ts"),
      source("packages/evaluator/src/public-aggregate-provider.ts"),
      source("apps/evaluator-worker/src/index.ts")
    ]);

    expect(/decryptContentForRun/.test(consumer)).toBe(false);
    expect(consumer.includes("serve.publication_snapshot")).toBe(true);
    expect(/PUBLISHED/.test(consumer)).toBe(true);
    expect(/INSUFFICIENT_PUBLIC_SAMPLE|SKIPPED/.test(consumer)).toBe(true);
    expect(contract).toMatch(/interface PublicAggregateProvider/);
    expect(contract).not.toMatch(/import[^\n]*ProviderGateway/);
    expect(adapter).not.toMatch(/import[^\n]*(?:@debateai\/db|LedgerRepository|ProviderGateway)/);
    expect(worker).toMatch(/createPublicEvaluatorConsumerWorker/);
    expect(worker).toMatch(/createOpenAiPublicAggregateProvider/);
    expect(worker).toMatch(/publicationCipher/);
  });

  it("isolates run-key provisioning from the ordinary runtime principal", async () => {
    const [migration,db,environment,apiMain] = await Promise.all([
      source("migrations/0040_account_erasure.sql"),
      source("packages/db/src/index.ts"),
      source("packages/register/src/runtime-environment.ts"),
      source("apps/api/src/main.ts")
    ]);

    expect(migration).toMatch(/CREATE ROLE debateai_content_provision NOLOGIN NOINHERIT/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION core\.create_encrypted_run\(jsonb,uuid,uuid,jsonb\)[^;]*debateai_runtime/s);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[^;]*core\.create_encrypted_run\(jsonb,uuid,uuid,jsonb\)[^;]*TO debateai_content_provision/s);
    expect(db).toMatch(/assertContentProvisionDatabaseRole/);
    expect(db).toMatch(/constructor\(\s*private readonly pool: Pool,\s*private readonly provisionPool: Pool = pool/);
    expect(environment).toMatch(/CONTENT_PROVISION_DATABASE_URL:\s*z\.string\(\)\.url\(\)/);
    expect(environment).toMatch(/CONTENT_PROVISION_DATABASE_URL_MUST_BE_SEPARATE/);
    expect(apiMain).toMatch(/createPool\(environment\.CONTENT_PROVISION_DATABASE_URL\)/);
    expect(apiMain).toMatch(/assertContentProvisionDatabaseRole\(pool,contentProvisionPool\)/);
  });

  it("enumerates every private cipher and provider surface under an enforced lease", async () => {
    const paths = [...await TypeScriptSources("apps"),...await TypeScriptSources("packages")];
    const contents = new Map(await Promise.all(paths.map(async (path) => [path,await source(path)] as const)));
    const privatePrimitive = /prepareLeasedContentEncryptionForRun|prepareLeasedContentEncryptionForRuns|encryptAttestedContentForRun|decryptContentForRun/;
    const primitiveFiles = [...contents]
      .filter(([,body]) => privatePrimitive.test(body))
      .map(([path]) => path)
      .sort();
    expect(primitiveFiles).toEqual([
      "apps/evaluator-worker/src/index.ts",
      "packages/db/src/index.ts",
      "packages/evaluator/src/index.ts",
      "packages/evidence/src/index.ts",
      "packages/graph/src/index.ts",
      "packages/judgement/src/index.ts",
      "packages/ledger/src/index.ts",
      "packages/liveness/src/index.ts",
      "packages/memory/src/index.ts",
      "packages/serve/src/index.ts",
      "packages/settlement/src/index.ts"
    ]);
    for (const path of primitiveFiles.filter((path) => path !== "packages/db/src/index.ts")) {
      const body = contents.get(path)!;
      expect(
        /withRunContentLease|prepareLeasedContentEncryptionForRun|prepareLeasedContentEncryptionForRuns/
          .test(body),
        `${path} must establish or borrow a session content lease`
      ).toBe(true);
    }

    const providerFiles = [...contents]
      .filter(([,body]) => /(?:provider|gateway)\.call\(/.test(body))
      .map(([path]) => path)
      .sort();
    expect(providerFiles).toEqual([
      "apps/runner/src/index.ts",
      "packages/evaluator/src/index.ts",
      "packages/judgement/src/index.ts"
    ]);
    expect(contents.get("apps/runner/src/index.ts")).toMatch(/withRunContentLease/);
    expect(contents.get("apps/runner/src/index.ts")).toMatch(/PROVIDER_RUN_REQUIRED/);
    expect(contents.get("packages/evaluator/src/consumer.ts")).toMatch(/withPublicSampleLease\(sample/);
    expect(contents.get("packages/evaluator/src/consumer.ts")).toMatch(/provider\.classify/);
    expect(contents.get("packages/evaluator/src/index.ts")).toMatch(/withRunContentLease/);
    // Judge is a pure prompt/parser object. Its only production construction is
    // under the leased runner and the run-required gateway above.
    expect(contents.get("apps/runner/src/index.ts")).toMatch(/new Judge\(/);
  });

  it("classifies direct ContentCipher consumers as provisioning or public-corpus paths", async () => {
    const [db,apiMain,runnerMain,publication,evaluatorWorker,evaluatorPublicReader] = await Promise.all([
      source("packages/db/src/index.ts"),source("apps/api/src/main.ts"),
      source("apps/runner/src/main.ts"),source("apps/api/src/publications.ts"),
      source("apps/evaluator-worker/src/index.ts"),
      source("packages/evaluator/src/consumer-postgres.ts")
    ]);
    expect(db).toMatch(/run_key_provision_intent|prepare_run_key_provision/);
    expect(apiMain).toMatch(/configureContentEncryption/);
    expect(runnerMain).toMatch(/configureContentEncryption/);
    expect(publication).toMatch(/PublicationCipher|publicationCipher/);
    expect(publication).not.toMatch(/contentCipherFor|prepareLeasedContentEncryption/);
    expect(evaluatorWorker).toMatch(/publicationCipher/);
    expect(evaluatorPublicReader).toMatch(/serve\.publication_snapshot/);
    expect(evaluatorPublicReader).toMatch(/core\.run_visibility_event/);
    expect(evaluatorPublicReader).toMatch(/latest\.state='PUBLISHED'/);
    expect(evaluatorPublicReader).toMatch(/withPublicationContentLease/);
  });
});
