import { readFile } from "node:fs/promises";
import pg from "pg";
import { runLaunchReplayCeremony, type ReplayOperatorAttestation } from "./index.js";
import { replayCeremonyDatabaseUrl } from "./database-url.js";

const [databaseUrl, attestationPath] = process.argv.slice(2);
if (databaseUrl === undefined || attestationPath === undefined) {
  throw new TypeError("usage: replay-ceremony <postgres-url> <operator-attestation.json>");
}

const attestation = JSON.parse(await readFile(attestationPath, "utf8")) as ReplayOperatorAttestation;
const pool = new pg.Pool({ connectionString: replayCeremonyDatabaseUrl(databaseUrl), max: 1 });
try {
  await pool.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  const report = await runLaunchReplayCeremony(pool, attestation);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.exact) process.exitCode = 1;
} finally {
  await pool.end();
}
