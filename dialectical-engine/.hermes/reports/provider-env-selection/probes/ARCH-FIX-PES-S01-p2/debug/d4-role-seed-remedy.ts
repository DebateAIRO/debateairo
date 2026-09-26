// ARCH-FIX-PES-S01-p2 probe d4 — the remedy for SPEC-v4 R1.12's role seed: the two role rows EXACTLY as R1.12 names
// them, plus every OTHER row the register's required-row manifest names (migrations/0050, 0064), taken from the shipped
// buildAlgorithmRegisterRows. Then: (i) the hosted publish on that version refuses by evaluatorRoleRef; (ii) a control
// seed whose evaluator names vendor:a publishes and carries every role row byte for byte.
import { migrate, type Pool } from "@debateai/db";
import { ALGORITHM_REGISTER_ROW_KEYS, buildAlgorithmRegisterRows, createPostgresRegisterPublicationPort,
  parseCanonicalRegisterJson, parseRegisterVersionText } from "@debateai/register";
import { importHistoricalRegisterFixture, publishReplacementRegisterFixture, readLegacyDevelopmentV4Rows }
  from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine/tests/support/registerFixtures.js";
import { startTestDatabase } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine/tests/support/testDatabase.js";
import { publishHostedProviderSet } from "../proposed/hosted-provider-set.js";
import { PES_S01_ELEMENT_E, PES_S01_ROLE_ROWS_SOURCE_REF } from "../proposed/pes-s01-publish-set-acceptance.js";

const out = (line: string): void => { process.stdout.write(`${line}\n`); };
const canon = (value: unknown): string => parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value), "utf8"));
const { info, log, warn } = console; console.info = () => undefined; console.log = () => undefined;
const database = await startTestDatabase();
const pool = database.pool as Pool;
const readVersionRows = async (version: string) => (await pool.query<{ row_key: string; value_json_text: string; source_ref: string }>(
  "SELECT row_key,value_json::text AS value_json_text,source_ref FROM register.register_row WHERE register_version=$1 ORDER BY row_key", [version]))
  .rows.map((r) => ({ rowKey: r.row_key, valueJsonText: parseCanonicalRegisterJson(Buffer.from(r.value_json_text, "utf8")), sourceRef: r.source_ref }));
const publish = (version: string) => publishHostedProviderSet(
  { deploymentMode: "hosted", nodeEnv: undefined, registerVersion: version, rosterPath: "/roster.json" },
  { readRosterText: async () => JSON.stringify({ providers: [PES_S01_ELEMENT_E] }),
    openRegister: async () => ({ readVersionRows: readVersionRows as never, port: createPostgresRegisterPublicationPort(pool) }) });
function seedRows(evaluatorProviderRef: string) {
  const role = [
    { rowKey: "synthesizerRoleRef", valueJsonText: canon({ kind: "SYNTHESIZER_ROLE_REF", providerRef: "vendor:a", provisional: true }), sourceRef: PES_S01_ROLE_ROWS_SOURCE_REF },
    { rowKey: "evaluatorRoleRef", valueJsonText: canon({ kind: "EVALUATOR_ROLE_REF", providerRef: evaluatorProviderRef, provisional: true }), sourceRef: PES_S01_ROLE_ROWS_SOURCE_REF }
  ];
  const others = buildAlgorithmRegisterRows({ deploymentSourceRef: PES_S01_ROLE_ROWS_SOURCE_REF, synthesizerRoleRef: "vendor:a",
    evaluatorRoleRef: evaluatorProviderRef, providerFamilies: [{ familyRef: "acme", providerRefs: ["vendor:a"] }] })
    .filter((row) => row.rowKey !== "synthesizerRoleRef" && row.rowKey !== "evaluatorRoleRef")
    .map((row) => ({ rowKey: row.rowKey, valueJsonText: canon(row.value), sourceRef: row.sourceRef }));
  return [...role, ...others];
}
try {
  await migrate(pool);
  out(`ALGORITHM_REGISTER_ROW_KEYS count=${ALGORITHM_REGISTER_ROW_KEYS.length}`);
  const manifest = await pool.query<{ row_key: string }>("SELECT row_key FROM register.required_row ORDER BY row_key");
  out(`required_row manifest count=${manifest.rowCount} equals ALGORITHM_REGISTER_ROW_KEYS as a set: ${JSON.stringify([...manifest.rows.map((r) => r.row_key)].sort()) === JSON.stringify([...ALGORITHM_REGISTER_ROW_KEYS].sort())}`);
  out(`seed v4 rows=${(await importHistoricalRegisterFixture(pool, 4, await readLegacyDevelopmentV4Rows())).rowCount}`);
  out(`hosted publish on 4: ${(await publish("4"))[2]}`);
  const dropped = await publishReplacementRegisterFixture(pool, parseRegisterVersionText("5"), seedRows("vendor:z"), PES_S01_ROLE_ROWS_SOURCE_REF);
  out(`role seed (evaluator vendor:z) on 5: version=${dropped.registerVersion} rowCount=${dropped.rowCount} deployment=${dropped.deployment}`);
  const before = (await pool.query("SELECT count(*)::text AS n FROM register.register_version")).rows[0].n;
  try { await publish(dropped.registerVersion); out("(i) UNEXPECTED: published"); }
  catch (error) { out(`(i) hosted publish on ${dropped.registerVersion}: THROWS ${(error as Error).message}`); }
  out(`(i) versions before=${before} after=${(await pool.query("SELECT count(*)::text AS n FROM register.register_version")).rows[0].n}`);
  const kept = await publishReplacementRegisterFixture(pool, parseRegisterVersionText("5"), seedRows("vendor:a"), PES_S01_ROLE_ROWS_SOURCE_REF);
  out(`control seed (evaluator vendor:a) on 5: version=${kept.registerVersion} rowCount=${kept.rowCount}`);
  const lines = await publish(kept.registerVersion);
  out(`(ii) hosted publish on ${kept.registerVersion}: ${lines[2]}`);
  const next = JSON.parse(lines[2].slice(lines[2].indexOf("=") + 1)).registerVersion as string;
  const a = await readVersionRows(kept.registerVersion); const b = await readVersionRows(next);
  const roleSame = ["synthesizerRoleRef", "evaluatorRoleRef"].every((k) => JSON.stringify(a.find((r) => r.rowKey === k)) === JSON.stringify(b.find((r) => r.rowKey === k)));
  out(`(ii) role rows byte-equal ${kept.registerVersion}->${next}: ${roleSame}; rows ${a.length}->${b.length}`);
  const profile = await pool.query("SELECT register_version::text AS v, profile FROM register.required_row_version ORDER BY register_version");
  out(`profiles: ${JSON.stringify(profile.rows)}`);
} finally { await database.stop(); console.info = info; console.log = log; void warn; out("stopped"); }
