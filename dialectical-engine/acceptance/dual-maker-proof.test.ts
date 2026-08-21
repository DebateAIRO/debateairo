import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStandingDatabase, type StandingDatabase } from "./standing-db.js";
import { seedAcceptanceRegister } from "./seed-register.js";
import { runDualMakerProof } from "./dual-maker-proof.js";

const fakeCodexCli = fileURLToPath(new URL("./test-fixtures/fake-codex-cli.mjs", import.meta.url));
const fakeClaudeCli = fileURLToPath(new URL("./test-fixtures/fake-claude-cli.mjs", import.meta.url));

let database: StandingDatabase;
let dataDirectory: string;
let databasePort: number;

async function reservePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("TEST_PORT_RESOLUTION_FAILED");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), "debateai-fair-02-"));
  databasePort = await reservePort();
  database = await startStandingDatabase({ port: databasePort, dataDirectory });
});

afterAll(async () => {
  await database?.stop();
  await rm(dataDirectory, { recursive: true, force: true });
});

describe("FAIR-02 dual-maker proof", () => {
  it("round-trips one live call through BOTH makers and persists honest, never-blended lineage rows", async () => {
    const report = await runDualMakerProof({
      pool: database.pool,
      testOnlyCodexCommand: { binary: process.execPath, prefixArguments: [fakeCodexCli] },
      testOnlyClaudeCommand: { binary: process.execPath, prefixArguments: [fakeClaudeCli] }
    });

    expect(report.artifacts).toHaveLength(2);
    const byMaker = Object.fromEntries(report.artifacts.map((artifact) => [artifact.maker, artifact]));
    expect(Object.keys(byMaker).sort()).toEqual(["Anthropic", "OpenAI"]);
    expect(byMaker.OpenAI).toMatchObject({
      providerRef: "acceptance:codex-cli",
      model: "gpt-5.6-sol"
    });
    // DR-115: the Anthropic artifact records the model id the CLI itself
    // reported — the fake reports claude-fake-cli-model; live, the real CLI
    // reports its real model id through the same path.
    expect(byMaker.Anthropic).toMatchObject({
      providerRef: "acceptance:claude-cli",
      model: "claude-fake-cli-model"
    });
    // Never blended: each artifact carries exactly one maker and the two
    // artifacts disagree.
    expect(byMaker.OpenAI?.rawArtifactRef).not.toBe(byMaker.Anthropic?.rawArtifactRef);

    // The lineage rows are PERSISTED, not just returned: re-read them from
    // ledger.raw_artifact by id.
    const persisted = await database.pool.query<{ maker: string; model_id: string; provider_ref: string }>(
      "SELECT maker, model_id, provider_ref FROM ledger.raw_artifact WHERE raw_artifact_id = ANY($1::uuid[]) ORDER BY maker",
      [report.artifacts.map((artifact) => artifact.rawArtifactRef)]
    );
    expect(persisted.rows).toEqual([
      { maker: "Anthropic", model_id: "claude-fake-cli-model", provider_ref: "acceptance:claude-cli" },
      { maker: "OpenAI", model_id: "gpt-5.6-sol", provider_ref: "acceptance:codex-cli" }
    ]);

    // Each call also left a MODEL_CALL ledger entry (honest action record).
    const ledgerRows = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM ledger.ledger_entry WHERE ledger_entry_id = ANY($1::uuid[]) AND action_kind='MODEL_CALL' AND outcome='OK'",
      [report.artifacts.map((artifact) => artifact.ledgerEntryRef)]
    );
    expect(Number(ledgerRows.rows[0]?.count)).toBe(2);
  });

  it("stops loudly on a stale standing register row instead of silently reseeding (freshness discipline)", async () => {
    // Simulate a standing database seeded BEFORE FAIR-02: register_row is
    // append-only, so the old one-provider row is INSERTED first into a
    // pristine database — exactly what a stale standing .pgdata holds.
    const staleDataDirectory = await mkdtemp(join(tmpdir(), "debateai-fair-02-stale-"));
    const staleDatabase = await startStandingDatabase({
      port: await reservePort(),
      dataDirectory: staleDataDirectory
    });
    try {
      await staleDatabase.pool.query(
        `INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
         VALUES (1, 'configuredProviderSet', $1::jsonb, $2)`,
        [JSON.stringify({
          kind: "CONFIGURED_PROVIDER_SET",
          requiredDistinctMakers: 1,
          providers: [{ providerRef: "acceptance:codex-cli", adapterKind: "openai-compatible-http", maker: "OpenAI" }]
        }), "acceptance:DR-133:V-approved"]
      );

      await expect(seedAcceptanceRegister(staleDatabase.pool))
        .rejects.toThrow("ACCEPTANCE_REGISTER_CONFLICT:configuredProviderSet");
    } finally {
      await staleDatabase.stop();
      await rm(staleDataDirectory, { recursive: true, force: true });
    }
  });
});
