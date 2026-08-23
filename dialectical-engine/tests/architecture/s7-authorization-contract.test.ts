import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

describe("Accounts S7 ownership architecture", () => {
  it("uses a distinct mutable identity owner ref and an append-only latest-wins run event", async () => {
    const [migration, identityFoundation, database] = await Promise.all([
      read("migrations/0037_run_ownership.sql"),
      read("migrations/0030_identity_foundation.sql"),
      read("packages/db/src/index.ts")
    ]);
    expect(identityFoundation).toMatch(/append-only event tables with latest-wins projections/i);
    expect(migration).toMatch(/ALTER TABLE identity\."user"[\s\S]*owner_ref uuid/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS core\.run_ownership_event/i);
    const ownershipTable = migration.slice(
      migration.indexOf("CREATE TABLE IF NOT EXISTS core.run_ownership_event"),
      migration.indexOf(";", migration.indexOf("CREATE TABLE IF NOT EXISTS core.run_ownership_event")) + 1
    );
    expect(ownershipTable).toMatch(/owner_ref uuid NOT NULL/i);
    expect(migration).toMatch(/run_ownership_event[\s\S]*reject_mutation/i);
    expect(migration).toMatch(/ORDER BY event\.at_seq DESC[\s\S]*LIMIT 1/i);
    expect(migration).toContain("core.run_is_owned_by");
    expect(migration).not.toMatch(/ALTER TABLE core\.run[\s\S]*owner_user_id/i);
    expect(migration).not.toMatch(/UPDATE core\.run/i);
    expect(ownershipTable).not.toMatch(/REFERENCES identity\."user"/i);
    expect(migration).toContain("identity_user_owner_ref_distinct_from_audit");
    expect(migration).toContain("identity_user_owner_ref_distinct_from_user_id");
    expect(migration).toContain("identity_user_audit_token_distinct_from_user_id");
    const appendFunction = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION core.append_run_ownership_event"),
      migration.indexOf("REVOKE ALL ON FUNCTION core.append_run_ownership_event")
    );
    expect(appendFunction).toContain("FROM core.run WHERE run_id = p_run_id FOR NO KEY UPDATE");
    expect(appendFunction.indexOf("FROM core.run WHERE run_id = p_run_id FOR NO KEY UPDATE"))
      .toBeLessThan(appendFunction.indexOf("SELECT ledger.allocate_sequence()"));
    expect(migration).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON core\.run_ownership_event FROM debateai_runtime/i);
    expect(database).toContain("core.append_run_ownership_event");
    expect(migration).toContain("FOR NO KEY UPDATE NOWAIT");
    expect(database).not.toMatch(/INSERT INTO core\.run_ownership_event/i);
    // MUT-S7-OWNER-AUDIT-REUSE: replace owner_ref with audit_token -> RED.
    expect(migration).not.toMatch(/INSERT INTO core\.run_ownership_event\s*\([^)]*audit_token/i);
  });

  it("routes every governed repository lookup through the authoritative ownership predicate", async () => {
    const [database, schema, serve, memory, api, liveness] = await Promise.all([
      read("packages/db/src/index.ts"),
      read("packages/db/src/schema.ts"),
      read("packages/serve/src/index.ts"),
      read("packages/memory/src/index.ts"),
      read("apps/api/src/index.ts"),
      read("packages/liveness/src/index.ts")
    ]);
    expect(schema).toContain("ownerRef");
    expect(schema).toContain("runOwnershipEvent");
    for (const [name, source] of [
      ["database", database],
      ["serve", serve],
      ["memory", memory],
      ["api", api],
      ["liveness", liveness]
    ] as const) {
      expect(source, name).toContain("core.run_is_owned_by");
    }
    for (const source of [database, serve, memory, api, liveness]) {
      expect(source).not.toMatch(/run\.asker_id\s*=\s*\$\d/);
    }
    const recordQuery = liveness.slice(
      liveness.indexOf("async recordQuery"),
      liveness.indexOf("async recordTriggerFired")
    );
    expect(recordQuery.indexOf("ORDER BY run_id FOR UPDATE"))
      .toBeLessThan(recordQuery.indexOf("await allocateSequence(client)"));
  });

  it("hardens every immutable memory scope carrier and derives it from run ownership", async () => {
    const [migration, memory] = await Promise.all([
      read("migrations/0037_run_ownership.sql"),
      read("packages/memory/src/index.ts")
    ]);
    expect(migration).toContain("memory_question_key_asker_scope_no_raw_user_uuid");
    expect(migration).toContain("memory_pull_record_asker_scope_no_raw_user_uuid");
    expect(memory).toContain("MEMORY_ASKER_SCOPE_MISMATCH");
    expect(memory).toContain("`owner:${access.ownerRef}`");
    const recordAndMatch = memory.slice(
      memory.indexOf("async recordQuestionAndMatch"),
      memory.indexOf("async #recordAnswerPull")
    );
    const candidateDiscovery = recordAndMatch.indexOf("const candidates = await client.query");
    const orderedRunLock = recordAndMatch.indexOf("ORDER BY run_id FOR UPDATE");
    const firstAllocation = recordAndMatch.indexOf("await allocateSequence(client)");
    expect(candidateDiscovery).toBeGreaterThan(-1);
    expect(orderedRunLock).toBeGreaterThan(candidateDiscovery);
    expect(firstAllocation).toBeGreaterThan(orderedRunLock);
  });

  it("revalidates ownership after reading the ungated lifecycle projection", async () => {
    const api = await read("apps/api/src/index.ts");
    const projectionRead = api.indexOf("const projected = await this.#splitLifecycle.read(runId)");
    const finalRecheck = api.indexOf("const stillOwned = await this.pool.query", projectionRead);
    const firstYield = api.indexOf("for (const event of events) yield event", projectionRead);
    expect(projectionRead).toBeGreaterThan(-1);
    expect(finalRecheck).toBeGreaterThan(projectionRead);
    expect(firstYield).toBeGreaterThan(finalRecheck);
    expect(api.slice(finalRecheck, firstYield)).toContain("core.run_is_owned_by");
  });

  it("never trusts ask-body ownership or caller scope", async () => {
    const [contract, api, acceptanceCli, acceptanceReadme] = await Promise.all([
      read("packages/contract/src/index.ts"),
      read("apps/api/src/index.ts"),
      read("acceptance/run-acceptance.ts"),
      read("acceptance/README.md")
    ]);
    const askSchema = contract.slice(
      contract.indexOf("export const AskRequestSchema"),
      contract.indexOf("export type AskRequest")
    );
    for (const field of ["decision_owner", "action_owner", "caller_scope"]) {
      expect(askSchema).not.toContain(field);
    }
    expect(api).not.toContain("ask.caller_scope");
    expect(api).not.toContain("ask.decision_owner");
    expect(api).not.toContain("ask.action_owner");
    for (const argument of ["--decision-owner", "--action-owner"]) {
      expect(acceptanceCli).not.toContain(argument);
      expect(acceptanceReadme).not.toContain(argument);
    }
  });
});
