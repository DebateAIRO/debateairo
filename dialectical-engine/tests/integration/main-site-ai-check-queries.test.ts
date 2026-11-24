// The SQL of AICHECK, the owner's runbook's read of the AI check for publication and reports (deploy/preview-auth-dev/v1/
// MAIN-SITE.md, 6b.1), run on real PostgreSQL with every migration applied: the runbook's own lines build each query in bash
// (psql stood in for by a printer), and the queries read the tables the API writes: the publication checks' records, the
// Report button's reports, the Free debates' list and the end-of-debate check's results and deletions. Each prints names
// and counts, never an amount or a token count. Data is made up.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { PUBLICATION_CHECK_POLICY_VERSION } from "../../apps/api/src/publication-check/policy.js";
import { SYNTHESIS_CHECK_POLICY_VERSION } from "../../apps/api/src/synthesis-check/policy.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const RUNBOOK = readFileSync(resolve(import.meta.dirname, "../../deploy/preview-auth-dev/v1/MAIN-SITE.md"), "utf8");

/** AICHECK's lines from its `db` helper on, run in bash with psql stood in for by a printer: each query it would ask. */
function queries(): string[] {
  const at = RUNBOOK.indexOf("\n# AICHECK: ");
  const lines = RUNBOOK.slice(RUNBOOK.lastIndexOf("```sh\n", at) + 6, RUNBOOK.indexOf("\n```", at)).split("\n");
  const from = lines.findIndex((line) => line.startsWith("db() { "));
  const until = lines.findIndex((line) => line.startsWith('[ -z "$NO" ]'));
  expect(from).toBeGreaterThan(0);
  // What the lines print is not wanted here, only what they ask.
  const source = ["set -euo pipefail", "psqlq() { printf '%s\\0' \"$1\" >> \"$QFILE\"; echo 0; }", "{", ...lines.slice(from, until), "} > /dev/null", 'cat "$QFILE"'].join("\n");
  const out = execFileSync("bash", ["-c", `QFILE=$(mktemp); trap 'rm -f "$QFILE"' EXIT\n${source}\n`], { encoding: "utf8" });
  return out.split("\0").filter(Boolean);
}

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 300_000);

afterAll(async () => {
  await database?.stop();
});

/** Rows as the API leaves them, written past their references (this file reads them, it never follows them). */
async function seeded(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = 'replica'");
    for (const [sql, values] of statements) await client.query(sql, [...values]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

describe("AICHECK's queries on the real schema", () => {
  it("count the last day's publication checks by outcome and cause, the reports by verdict, the Free debates by state, and the end-of-debate checks answered, not answered by cause, and deleted", async () => {
    const asked = queries();
    expect(asked).toHaveLength(4);
    const read = async (sql: string) => (await database.pool.query<Record<string, unknown>>(sql)).rows.map((row) => Object.values(row).join(" "));
    // An empty site: no check ran, no report, no Free debate, no end-of-debate check.
    expect(await Promise.all(asked.map(read))).toEqual([[], [], ["0 0 0"], ["answered 0, deleted 0"]]);

    const check = (outcome: string, cause: string | null, at: string) => [`INSERT INTO serve.publication_check_record (run_id,attempted_at,outcome,failure_cause,rules,part_kinds,ground,
      judge_provider_ref,judge_model_id,policy_version,judge_call_count) VALUES ($1,$2,$3,$4,'{}','{}',NULL,'anthropic','claude-haiku-5-5',$5,4)`,
      [randomUUID(), at, outcome, cause, PUBLICATION_CHECK_POLICY_VERSION]] as const;
    const now = new Date().toISOString(), old = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const free = (outcome: string | null, decidedAt: string | null) => [`INSERT INTO identity.free_public_ask (run_id,owner_ref,notice_at,outcome,publication_ref,decided_at)
      VALUES ($1,$2,now(),$3,$4,$5)`, [randomUUID(), randomUUID(), outcome, outcome === "PUBLISHED" ? randomUUID() : null, decidedAt]] as const;
    await seeded([check("ALLOW", null, now), check("ALLOW", null, now), check("UNAVAILABLE", "JUDGE_TRANSPORT_FAILED", now), check("ALLOW", null, old),
      free(null, null), free(null, null), free("PUBLISHED", now), free("REFUSED", now), free("PUBLISHED", old)]);
    // The end-of-debate check's results: its answer is sealed, so a row says only whether it answered, or why not.
    const result = (failureCode: string | null, at: string) => [`INSERT INTO serve.synthesis_check_result (result_id,attempt_id,run_id,answer_id,answer_version,
      synthesis_origin_version,final,failure_code,policy_version,checked_at,content) VALUES ($1,$2,$3,$4,1,1,$5,$6,$7,$8,'{}'::jsonb)`,
      [randomUUID(), randomUUID(), randomUUID(), randomUUID(), failureCode === null, failureCode, SYNTHESIS_CHECK_POLICY_VERSION, at]] as const;
    // A deletion waiting for the erasure, and one the erasure has taken on; one from two days ago.
    const removal = (at: string) => [`INSERT INTO serve.synthesis_check_removal_request (request_id,result_id,run_id,requested_at) VALUES ($1,$2,$3,$4)`,
      [randomUUID(), randomUUID(), randomUUID(), at]] as const;
    const erasure = (at: string) => [`INSERT INTO identity.synthesis_check_erasure_binding (request_ref,run_id,owner_ref,audit_id,audit_actor_ref,audit_target_ref,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), at]] as const;
    await seeded([result(null, now), result(null, now), result(null, old), result("DEADLINE", now), result("TRANSPORT_FAILED", now), result("TRANSPORT_FAILED", now),
      removal(now), erasure(now), erasure(old)]);
    const [checks, reports, debates, ends] = await Promise.all(asked.map(read));
    expect(checks).toEqual(["ALLOW - 2", "UNAVAILABLE JUDGE_TRANSPORT_FAILED 1"]);
    expect(reports).toEqual([]);
    expect(debates).toEqual(["2 1 1"]);
    expect(ends).toEqual(["answered 2, UNAVAILABLE DEADLINE 1, UNAVAILABLE TRANSPORT_FAILED 2, deleted 2"]);
  }, 120_000);
});
