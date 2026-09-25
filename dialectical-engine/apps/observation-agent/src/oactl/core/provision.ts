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
// DL7-F9 (migration 0071): the principal `oactl thresholds apply` writes the policy as.
const DEV_THRESHOLD_OPERATOR_ROLE = "debateai_observation_threshold_operator";
const THRESHOLD_OPERATOR_ENVIRONMENT_FILE = "observation-threshold-operator.env";

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
  databaseUrl: string,
  role: typeof DEV_OBSERVATION_ROLE | typeof DEV_THRESHOLD_OPERATOR_ROLE = DEV_OBSERVATION_ROLE
): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 2000");
    const formatted = await client.query<{ statement: string }>(
      "SELECT format('ALTER ROLE %I PASSWORD %L', $2::text, $1::text) AS statement",
      [password, role]
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
  setRolePassword?: (password: string, role?: string) => Promise<void>;
}>): Promise<Readonly<{ output: string; environmentPath: string; operatorEnvironmentPath: string }>> {
  const passwordFactory = input.passwordFactory ?? (() => randomBytes(32).toString("hex"));
  const setRolePassword = input.setRolePassword ?? (async (value: string, role?: string) => {
    await setObservationRolePassword(
      value,
      await devAdminDatabaseUrl(input.repoRoot),
      role === DEV_THRESHOLD_OPERATOR_ROLE ? DEV_THRESHOLD_OPERATOR_ROLE : DEV_OBSERVATION_ROLE
    );
  });
  const password = passwordFactory();
  await setRolePassword(password, DEV_OBSERVATION_ROLE);
  // DL7-F9: a SECOND, distinct credential for the threshold operator, in its own file. The
  // daemon's env file never carries it, so the daemon cannot write the policy that rules it.
  const operatorPassword = passwordFactory();
  if (operatorPassword === password) throw new Error("OBSERVATION_PROVISION_FAILED");
  await setRolePassword(operatorPassword, DEV_THRESHOLD_OPERATOR_ROLE);

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
  const operatorUrl = new URL(DEV_DATABASE_ORIGIN);
  operatorUrl.username = DEV_THRESHOLD_OPERATOR_ROLE;
  operatorUrl.password = operatorPassword;
  const operatorEnvironmentPath = join(authDirectory, THRESHOLD_OPERATOR_ENVIRONMENT_FILE);
  await writeFile(
    operatorEnvironmentPath,
    `OBSERVATION_THRESHOLD_OPERATOR_DATABASE_URL=${shellValue(operatorUrl.toString())}\n`,
    { mode: 0o600 }
  );
  await chmod(operatorEnvironmentPath, 0o600);
  return Object.freeze({
    output: `PROVISIONED ${environmentPath}`,
    environmentPath,
    operatorEnvironmentPath
  });
}
