import { randomBytes } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { fixedStateDirectory } from "./state.js";
import { resolveDevCustodyRoot } from "../../../../../deploy/dev-auth/custody-root.mjs";

const DEV_ADMIN_DATABASE_URL =
  "postgresql://debateai:debateai-dev-only@127.0.0.1:55432/debateai";

function shellValue(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export async function setObservationRolePassword(
  password: string,
  databaseUrl: string = DEV_ADMIN_DATABASE_URL
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
  await (input.setRolePassword ?? setObservationRolePassword)(password);

  const databaseUrl = new URL(DEV_ADMIN_DATABASE_URL);
  databaseUrl.username = "debateai_observation_agent";
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
