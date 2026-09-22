import { randomBytes } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { fixedStateDirectory } from "./state.js";
import { readDevelopmentComposeSecret } from "../../../../../deploy/dev-auth/compose-secrets.mjs";
import { resolveDevCustodyRoot } from "../../../../../deploy/dev-auth/custody-root.mjs";

const DEV_DATABASE_ORIGIN = "postgresql://127.0.0.1:55432/debateai";
const DEV_ADMIN_ROLE = "debateai";
const DEV_OBSERVATION_ROLE = "debateai_observation_agent";

/**
 * V-21(a): the bootstrap superuser password is generated once into the 0600 dev key-custody
 * file that feeds compose; it is no longer a literal in this repository. This command runs
 * after `pnpm dev:auth:up`, so the file already exists; if it does not, refusing is correct —
 * inventing a password here would not match the database.
 */
async function devAdminDatabaseUrl(repoRoot: string): Promise<string> {
  const url = new URL(DEV_DATABASE_ORIGIN);
  url.username = DEV_ADMIN_ROLE;
  url.password = await readDevelopmentComposeSecret(
    resolveDevCustodyRoot(repoRoot),
    "POSTGRES_SUPERUSER_PASSWORD"
  );
  return url.toString();
}

function shellValue(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

// The admin URL is passed in, never defaulted: a credential that arrives by ambient default
// is one nobody can see at the call site.
export async function setObservationRolePassword(
  password: string,
  databaseUrl: string
): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 2000");
    const formatted = await client.query<{ statement: string }>(
      "SELECT format('ALTER ROLE debateai_observation_agent PASSWORD %L', $1::text) AS statement",
      [password]
    );
    const statement = formatted.rows[0]?.statement;
    if (statement === undefined) throw new Error("OBSERVATION_PROVISION_FAILED");
    await client.query(statement);
  } finally {
    client.release();
    await pool.end();
  }
}

export async function provisionObservationAgent(input: Readonly<{
  repoRoot: string;
  home: string;
  passwordFactory?: () => string;
  setRolePassword?: (password: string) => Promise<void>;
}>): Promise<Readonly<{ output: string; environmentPath: string }>> {
  const password = (input.passwordFactory ?? (() => randomBytes(32).toString("hex")))();
  await (input.setRolePassword ?? (async (value: string) => {
    await setObservationRolePassword(value, await devAdminDatabaseUrl(input.repoRoot));
  }))(password);

  const databaseUrl = new URL(DEV_DATABASE_ORIGIN);
  databaseUrl.username = DEV_OBSERVATION_ROLE;
  databaseUrl.password = password;
  // DL7-F4: dev custody is movable (DEBATEAI_DEV_CUSTODY_ROOT, F-05) so keys need never
  // live inside a cloud-synced checkout; the agent's own env file and Hatchet token follow it.
  const authDirectory = resolveDevCustodyRoot(input.repoRoot);
  const environmentPath = join(authDirectory, "observation-agent.env");
  const rows = [
    ["OBSERVATION_DATABASE_URL", databaseUrl.toString()],
    ["OBSERVATION_STATE_DIR", fixedStateDirectory(input.home)],
    ["OBSERVATION_TARGETS_PATH", join(input.repoRoot, "deploy", "observation-agent", "targets.dev.d")],
    ["OBSERVATION_HATCHET_TOKEN_PATH", join(authDirectory, "observation-agent-hatchet.token")]
  ] as const;
  await mkdir(authDirectory, { recursive: true, mode: 0o700 });
  await writeFile(
    environmentPath,
    `${rows.map(([key, value]) => `${key}=${shellValue(value)}`).join("\n")}\n`,
    { mode: 0o600 }
  );
  await chmod(environmentPath, 0o600);
  return Object.freeze({
    output: `PROVISIONED ${environmentPath}`,
    environmentPath
  });
}
