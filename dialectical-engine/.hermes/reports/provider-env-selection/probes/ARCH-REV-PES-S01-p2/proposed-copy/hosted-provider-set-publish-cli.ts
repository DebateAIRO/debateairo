// ARCH-FIX-PES-S01-p2 PROPOSED CODE (Revision 2: the reader now imported from the BUILT C1 export) — not product code. The entry PLAN step S01-18 asks BUILD to write at
// apps/runner/src/hosted-provider-set-publish-cli.ts. In the product file, `readOperatorCommandEnvironment` is
// imported from "@debateai/register" (steps S01-02/S01-03); here it comes from the proposed addition so `tsc` can
// check this block before the register package carries it.
import { readFile } from "node:fs/promises";
import { createPool, type Pool } from "@debateai/db";
import {
  createPostgresRegisterPublicationPort,
  loadMigrationEnvironment,
  parseCanonicalRegisterJson,
  type RegisterPublicationRow,
  type RegisterVersionText
} from "@debateai/register";
import { readOperatorCommandEnvironment } from "@debateai/register";
import { publishHostedProviderSet, type HostedRegisterAccess } from "./hosted-provider-set.js";

const environment = readOperatorCommandEnvironment([
  "DEBATEAI_DEPLOYMENT_MODE", "NODE_ENV", "REGISTER_VERSION", "PROVIDER_HOSTED_ROSTER_PATH"
] as const);

function hostedRegisterAccess(pool: Pool): HostedRegisterAccess {
  return Object.freeze({
    async readVersionRows(version: RegisterVersionText): Promise<readonly RegisterPublicationRow[]> {
      const result = await pool.query<{ row_key: string; value_json_text: string; source_ref: string }>(
        "SELECT row_key,value_json::text AS value_json_text,source_ref FROM register.register_row WHERE register_version=$1 ORDER BY row_key",
        [version]
      );
      return result.rows.map((row) => Object.freeze({
        rowKey: row.row_key,
        valueJsonText: parseCanonicalRegisterJson(Buffer.from(row.value_json_text, "utf8")),
        sourceRef: row.source_ref
      }));
    },
    port: createPostgresRegisterPublicationPort(pool)
  });
}

let pool: Pool | undefined;
try {
  const lines = await publishHostedProviderSet({
    deploymentMode: environment.DEBATEAI_DEPLOYMENT_MODE,
    nodeEnv: environment.NODE_ENV,
    registerVersion: environment.REGISTER_VERSION,
    rosterPath: environment.PROVIDER_HOSTED_ROSTER_PATH
  }, {
    readRosterText: (path) => readFile(path, "utf8"),
    openRegister: async () => {
      pool = createPool(loadMigrationEnvironment().MIGRATION_DATABASE_URL);
      return hostedRegisterAccess(pool);
    }
  });
  process.stdout.write(`${lines.join("\n")}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
