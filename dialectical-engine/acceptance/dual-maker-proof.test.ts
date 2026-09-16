import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStandingDatabase, type StandingDatabase } from "./standing-db.js";
import {
  ACCEPTANCE_REGISTER_VERSION,
  buildAcceptanceRegisterPublicationRows,
  seedAcceptanceRegister
} from "./seed-register.js";
import { runDualMakerProof } from "./dual-maker-proof.js";
import {
  importHistoricalRegisterFixture,
  registerFixtureRow
} from "../tests/support/registerFixtures.js";

const fakeCodexCli = fileURLToPath(new URL("./test-fixtures/fake-codex-cli.mjs", import.meta.url));
const fakeClaudeCli = fileURLToPath(new URL("./test-fixtures/fake-claude-cli.mjs", import.meta.url));
// The rollout tree the FAKE codex CLI belongs to. Its one rollout is keyed by the
// thread id that CLI prints, so the model id under test is READ from this store —
// never from the operator's real ~/.codex/sessions, which no fake ever writes to.
const fakeCodexSessions = fileURLToPath(new URL("./test-fixtures/codex-sessions", import.meta.url));

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
      testOnlyCodexSessionsRoot: fakeCodexSessions,
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
      // The staleness this arm is about lives in ONE ROW's VALUE, not in the row
      // count. A one-row seal of version 2 is now rejected at the seal itself by
      // `register.assert_required_rows`
      // (`migrations/0050_t16_algorithm_register_rows.sql:58-91`), which declares
      // version 2 to carry all fifteen mandatory rows — the first missing one being
      // `envelope:envelopeFormulaInputs`. That guard is correct and the manifest is
      // correct: `buildAlgorithmRegisterRows` (`packages/register/src/algorithm-policy.ts:241`)
      // already mints the envelope row and the ceremony seeder already carries it.
      // It was this FIXTURE's seed that was incomplete, so it now seals the SAME
      // complete set the seeder seals and overrides only `configuredProviderSet`
      // with the pre-FAIR-02 one-provider value.
      const stale = registerFixtureRow("configuredProviderSet", {
        kind: "CONFIGURED_PROVIDER_SET",
        requiredDistinctMakers: 1,
        providers: [{ providerRef: "acceptance:codex-cli", adapterKind: "openai-compatible-http", maker: "OpenAI" }]
      }, "acceptance:DR-133:V-approved");
      const standingRows = (await buildAcceptanceRegisterPublicationRows())
        .map((row) => (row.rowKey === stale.rowKey ? stale : row));
      if (!standingRows.includes(stale)) {
        throw new Error("FAIR_02_FIXTURE: configuredProviderSet is not part of the sealed acceptance set");
      }
      await importHistoricalRegisterFixture(staleDatabase.pool, ACCEPTANCE_REGISTER_VERSION, standingRows);

      await expect(seedAcceptanceRegister(staleDatabase.pool))
        .rejects.toThrow("REGISTER_PUBLICATION_SEAL_INVALID");
    } finally {
      await staleDatabase.stop();
      await rm(staleDataDirectory, { recursive: true, force: true });
    }
  });
});
