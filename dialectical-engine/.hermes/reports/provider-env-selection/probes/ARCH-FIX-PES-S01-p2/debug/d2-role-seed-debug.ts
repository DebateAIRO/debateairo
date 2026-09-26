// ARCH-FIX-PES-S01-p2 probe d2 — why does SPEC-v4 R1.12's role seed throw? Seeds v4, publishes the hosted v5 through
// the reference library (fake-free, real port), then calls publishReplacementRegisterFixture exactly as R1.12 words it.
import { migrate, type Pool } from "@debateai/db";
import { createPostgresRegisterPublicationPort, parseCanonicalRegisterJson, parseRegisterVersionText } from "@debateai/register";
import { importHistoricalRegisterFixture, publishReplacementRegisterFixture, readLegacyDevelopmentV4Rows }
  from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine/tests/support/registerFixtures.js";
import { startTestDatabase } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine/tests/support/testDatabase.js";
import { publishHostedProviderSet } from "../proposed/hosted-provider-set.js";
import { PES_S01_ELEMENT_E, PES_S01_ROLE_ROWS, PES_S01_ROLE_ROWS_SOURCE_REF } from "../proposed/pes-s01-publish-set-acceptance.js";

const out = (line: string): void => { process.stdout.write(`${line}\n`); };
const { info, log } = console; console.info = () => undefined; console.log = () => undefined;
const database = await startTestDatabase();
const pool = database.pool as Pool;
const roleRows = PES_S01_ROLE_ROWS.map((row) => ({ rowKey: row.rowKey,
  valueJsonText: parseCanonicalRegisterJson(Buffer.from(JSON.stringify(row.value), "utf8")), sourceRef: PES_S01_ROLE_ROWS_SOURCE_REF }));
const readVersionRows = async (version: string) => (await pool.query<{ row_key: string; value_json_text: string; source_ref: string }>(
  "SELECT row_key,value_json::text AS value_json_text,source_ref FROM register.register_row WHERE register_version=$1 ORDER BY row_key", [version]))
  .rows.map((r) => ({ rowKey: r.row_key, valueJsonText: parseCanonicalRegisterJson(Buffer.from(r.value_json_text, "utf8")), sourceRef: r.source_ref }));
const publish = (version: string) => publishHostedProviderSet(
  { deploymentMode: "hosted", nodeEnv: undefined, registerVersion: version, rosterPath: "/roster.json" },
  { readRosterText: async () => JSON.stringify({ providers: [PES_S01_ELEMENT_E] }),
    openRegister: async () => ({ readVersionRows: readVersionRows as never, port: createPostgresRegisterPublicationPort(pool) }) });
try {
  await migrate(pool);
  out(`seed v4 rows=${(await importHistoricalRegisterFixture(pool, 4, await readLegacyDevelopmentV4Rows())).rowCount}`);
  const lines = await publish("4"); out(`hosted publish: ${lines[2]}`);
  for (const [label, base] of [["A role seed on the HOSTED version 5 (R1.12 as worded)", "5"], ["B role seed on the SEALED version 4 (control)", "4"]] as const) {
    try {
      const receipt = await publishReplacementRegisterFixture(pool, parseRegisterVersionText(base), roleRows, PES_S01_ROLE_ROWS_SOURCE_REF);
      out(`${label}: OK version=${receipt.registerVersion} rowCount=${receipt.rowCount} deployment=${receipt.deployment}`);
    } catch (error) {
      const e = error as Error & { cause?: unknown; code?: string };
      out(`${label}: THROWS message=${JSON.stringify(e.message)} code=${e.code ?? ""} cause=${JSON.stringify(String(e.cause ?? ""))}`);
    }
  }
  const versions = await pool.query<{ v: string; base: string | null; dep: string | null }>(
    "SELECT register_version::text AS v, base_register_version::text AS base FROM register.register_version ORDER BY register_version");
  out(`versions: ${JSON.stringify(versions.rows)}`);
} finally { await database.stop(); console.info = info; console.log = log; out("stopped"); }
