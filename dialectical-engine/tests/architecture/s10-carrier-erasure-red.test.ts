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
    const [liveness, memory, migration] = await Promise.all([
      source("packages/liveness/src/index.ts"),
      source("packages/memory/src/index.ts"),
      source("migrations/0040_account_erasure.sql")
    ]);

    // DEV-11E(3) / commit 2d1f86b8: the restricted runtime principal is denied
    // SELECT on the private erasure carriers, so liveness and memory naming
    // serve.private_run_erasure_tombstone themselves is now a 42501, not a
    // safeguard. The completed-tombstone filter moved into the SECURITY DEFINER
    // predicate core.run_private_content_is_live, which both owner-scoped reads
    // apply before any lease or key load. The filter is pinned at both call
    // sites AND in the predicate's body, so the whole path stays guarded; the
    // direct carrier read is now pinned ABSENT, which the old pair never did.
    expect(liveness.includes("core.run_private_content_is_live")).toBe(true);
    expect(memory.includes("core.run_private_content_is_live")).toBe(true);
    expect(liveness.includes("serve.private_run_erasure_tombstone")).toBe(false);
    expect(memory.includes("serve.private_run_erasure_tombstone")).toBe(false);

    const predicate = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION core.run_private_content_is_live"),
      migration.indexOf("REVOKE ALL ON FUNCTION core.run_private_content_is_live")
    );
    expect(predicate).toContain("SECURITY DEFINER");
    expect(predicate).toMatch(
      /NOT EXISTS \(\s*SELECT 1 FROM serve\.private_run_erasure_tombstone/
    );
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
    // Connection budget (2026-10-10): the pool now names its size row.
    expect(apiMain).toMatch(/createPool\(environment\.CONTENT_PROVISION_DATABASE_URL, API_DATABASE_POOLS\.contentProvision\)/);
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
      // V-6 (0069): the live event stream decrypts an encrypted run's
      // investigation-gap rows, and the value overlay seals the weight owner.
      // Both prepare the run's cipher through prepareLeasedContentEncryptionForRun,
      // which establishes or borrows the session content lease (checked below).
      "apps/api/src/index.ts",
      "apps/evaluator-worker/src/index.ts",
      // Reclaim resume (spec 2026-10-14): the replay book reads the run's recorded prompts and replies through
      // prepareLeasedContentEncryptionForRun, which borrows the lease the runner already holds when it is read.
      "apps/runner/src/run-replay.ts",
      "packages/db/src/index.ts",
      "packages/evaluator/src/index.ts",
      "packages/evidence/src/index.ts",
      "packages/graph/src/index.ts",
      // Engine verdict (0121): the investigation and vote repositories seal and read ledger.point_investigation /
      // ledger.verdict_vote inside withRunContentLease, borrowed when the runner already holds it.
      "packages/judgement/src/engine-repository.ts",
      "packages/judgement/src/index.ts",
      "packages/ledger/src/index.ts",
      "packages/liveness/src/index.ts",
      // Debate shape (0117): the map repository seals and reads core.map_item / core.map_choice inside withRunContentLease.
      "packages/map/src/repository.ts",
      "packages/memory/src/index.ts",
      "packages/serve/src/index.ts",
      // The synthesis check (0123) seals and reads serve.synthesis_check_result inside withRunContentLease.
      "packages/serve/src/synthesis-check.ts",
      "packages/settlement/src/index.ts",
      // Verdict story: the enrichment reader decrypts the judge's raw artifact and
      // the review reasons through prepareLeasedContentEncryptionForRun, which
      // borrows the lease the runner's post-settle hook already holds.
      "packages/story/src/enrichment.ts",
      // Verdict story (0074): the story repository seals and reads serve.answer_story
      // inside withRunContentLease, borrowed when the runner's hook already holds it.
      "packages/story/src/repository.ts",
      "packages/valuation/src/index.ts"
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
      // Parallel AI calls (spec 2026-10-12 §3.2): the debate's call lane hands each runner call, unchanged, to the
      // member's gateway it wraps, once a slot is free, in the caller's own async context (its lease and keep-alive).
      // It opens no lease and reads no content.
      "apps/runner/src/call-lane-gateway.ts",
      "apps/runner/src/index.ts",
      // Debate shape (0117, c5e0b2862): the map stage's caller sends each map call through the member gateway the
      // runner hands it (lane, sit-out book, keep-alive, the run-required leased gateway), naming the run. It opens
      // no lease and reads no content of its own; the map's storage goes through packages/map/src/repository.ts above.
      "apps/runner/src/map-stage.ts",
      // L4-F9 repair: the keep-alive hands each runner call, unchanged, to the
      // gateway it wraps (the run-required, leased gateway), or refuses it before
      // anything is sent. It opens no lease and reads no content of its own.
      "apps/runner/src/run-keep-alive.ts",
      // Model scorecard A15: the seat caller's candidate stamp forwards the leased runner's request.
      "apps/runner/src/run-seats.ts",
      // Run resilience (spec 2026-10-12, fix (d)): the sit-out book hands each runner call, unchanged, to the
      // member's gateway it wraps, or refuses it before anything is sent. It opens no lease and reads no content.
      "apps/runner/src/run-sit-out.ts",
      "packages/evaluator/src/index.ts",
      // Engine redesign R2b (B1): the comparing judges' call is sent through the gateway the runner hands it (the judge
      // seat's own lane-wrapped member gateway, never the arguing judge's, inside the leased runner, naming the run). It
      // opens no lease and reads no content of its own.
      "packages/judgement/src/comparing-judges.ts",
      "packages/judgement/src/index.ts",
      "packages/providers/src/preview-test.ts",
      // LG-A (L32): the structure-repair wrapper hands each call, routed, to the target gateway it wraps, and sends the
      // one structure-repair call through the repair model's own gateway, naming the original call's run. It opens no
      // lease and reads no content of its own (the runner's leased gateway does, around it).
      "packages/providers/src/structure-repair.ts",
      // Verdict story: the writer calls ONLY the gateway the runner hands it (the
      // run-required, leased gateway above), from the post-settle hook inside the
      // runner's lease, and every request names the run it belongs to.
      "packages/story/src/writer.ts"
    ]);
    expect(contents.get("apps/runner/src/index.ts")).toMatch(/withRunContentLease/);
    expect(contents.get("apps/runner/src/index.ts")).toMatch(/PROVIDER_RUN_REQUIRED/);
    // The map stage: every call names the run, it touches no cipher or lease itself, and only the leased runner uses it.
    expect(contents.get("apps/runner/src/map-stage.ts")).toMatch(/member\.provider\.call\(\{\s*runId: deps\.runId,/);
    expect(contents.get("apps/runner/src/map-stage.ts")).not.toMatch(privatePrimitive);
    expect(contents.get("apps/runner/src/map-stage.ts")).not.toMatch(/withRunContentLease|ContentCipher|@debateai\/db/);
    expect(contents.get("packages/judgement/src/comparing-judges.ts")).toMatch(/provider\.call\(\{\s*runId: input\.runId,/);
    expect(contents.get("packages/judgement/src/comparing-judges.ts")).not.toMatch(privatePrimitive);
    expect(contents.get("packages/judgement/src/comparing-judges.ts")).not.toMatch(/withRunContentLease|ContentCipher|@debateai\/db/);
    expect([...contents].filter(([,body]) => /from "\.\/map-stage\.js"/.test(body)).map(([path]) => path))
      .toEqual(["apps/runner/src/index.ts"]);
    expect(contents.get("packages/story/src/writer.ts")).toMatch(/runId: input\.story\.runId,/);
    expect(contents.get("packages/story/src/writer.ts")).toMatch(/lane: "story",/);
    expect(contents.get("packages/providers/src/preview-test.ts")).toMatch(/gateway\.call\(\{\s*\.\.\.request,/);
    expect(contents.get("packages/providers/src/structure-repair.ts")).toMatch(/route\.gateway\.call\(\{\s*runId: request\.runId,/);
    expect(contents.get("packages/providers/src/structure-repair.ts")).not.toMatch(privatePrimitive);
    expect(contents.get("packages/evaluator/src/consumer.ts")).toMatch(/withPublicSampleLease\(sample/);
    expect(contents.get("packages/evaluator/src/consumer.ts")).toMatch(/provider\.classify/);
    expect(contents.get("packages/evaluator/src/index.ts")).toMatch(/withRunContentLease/);
    // Judge is a pure prompt/parser object. Its production constructions are all
    // under the leased runner and the run-required gateway above: the runner's
    // own, and the seat book's (model scorecard A15), which builds a Judge around
    // a configured maker's gateway wrapped in the candidate stamp. run-seats.ts
    // opens no lease of its own, and only the leased runner imports it.
    expect([...contents].filter(([,body]) => /new Judge\(/.test(body)).map(([path]) => path).sort()).toEqual([
      "apps/runner/src/index.ts",
      "apps/runner/src/run-seats.ts"
    ]);
    // Paid plans S1a: the seat's judge is built over the stamped provider, or over the
    // gateway the runner's cheaper-model-while-arguing factory wraps around it.
    expect(contents.get("apps/runner/src/run-seats.ts")).toMatch(/new Judge\(judgeGateway\)/);
    // Only the leased runner imports run-seats' CODE. A type-only import (debate shape, 8b6bc71be: shape-select.ts
    // takes the SeatMember type) is erased at build and reaches no seat book, Judge or gateway. Every reference to the
    // module must be one of the import/export statements read here, so none escapes the classification.
    const seatStatements = [...contents].flatMap(([path, body]) =>
      [...body.matchAll(/^(?:import|export)\s[^;]*?from "\.\/run-seats\.js"/gmu)].map((match) => [path, match[0]] as const));
    expect([...new Set(seatStatements.map(([path]) => path))].sort())
      .toEqual([...contents].filter(([,body]) => /from "\.\/run-seats\.js"/.test(body)).map(([path]) => path).sort());
    expect([...new Set(seatStatements.filter(([, statement]) => !/^(?:import|export)\s+type\s/u.test(statement)).map(([path]) => path))])
      .toEqual(["apps/runner/src/index.ts"]);
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
