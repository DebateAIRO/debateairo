// The SQL of the owner's runbook's public debates steps (deploy/preview-auth-dev/v1/MAIN-SITE.md, 5.9), run on real
// PostgreSQL with every migration applied: the names file's own helpers and each step's own query lines build each query
// in bash (psql stood in for by a printer), and every one of them runs on the real schema. `pubrole`, the step's read of
// the clean-up login, gives the same verdict as the API's own role check on real logins, and `pubprobe`, the step's try
// of a clean-up line, runs the release's role check through tsx on those logins. Data is made up.
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertPublicationCleanupDatabaseRole, createPool, migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const ROOT = resolve(import.meta.dirname, "../..");
const RUNBOOK = readFileSync(resolve(ROOT, "deploy/preview-auth-dev/v1/MAIN-SITE.md"), "utf8");

/** Every fenced block of the runbook, in order. */
function fencedBlocks(text: string): string[] {
  const out: string[] = [];
  let open: string[] | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      if (open === null) open = [];
      else { out.push(open.join("\n")); open = null; }
    } else if (open !== null) open.push(line);
  }
  return out;
}
const blocks = fencedBlocks(RUNBOOK);
const script = (step: string): string => {
  const found = blocks.filter((block) => block.split("\n").some((line) => line.startsWith(`# ${step}: `)));
  if (found.length !== 1) throw new Error(`${found.length} blocks name ${step}`);
  return found[0]!;
};
const names = script("LOCKS0").split("\n");
const helper = (name: string): string => names.find((line) => line.startsWith(`${name}() {`))!;
const CLN = "debateai_prod_api_publication_cleanup";

/** What the given lines ask the database, with psql stood in for by a printer. */
function asked(lines: readonly string[], login = CLN): string[] {
  const source = ["set -euo pipefail", `CLN=${login}; HOST=dezbatere.ro`, "psqlq() { printf '%s\\0' \"$1\"; }", ...lines].join("\n");
  return execFileSync("bash", ["-c", source], { encoding: "utf8" }).split("\0").filter(Boolean);
}
/** Every `psqlq "…"` line of the steps, as written there. */
function stepQueries(): string[] {
  const lines: string[] = [];
  for (const step of ["PUBCHECK", "PUBLOGIN", "PUBBACKUP", "PUBON", "PUBAFTER", "PUBOFF"]) {
    for (const match of script(step).matchAll(/psqlq "((?:[^"\\]|\\.)*)"/gu)) lines.push(`psqlq "${match[1]}"`);
  }
  return lines;
}

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 300_000);

afterAll(async () => {
  await database?.stop();
});

const one = async (sql: string): Promise<string> => {
  const rows = (await database.pool.query<Record<string, unknown>>(sql)).rows;
  expect(rows).toHaveLength(1);
  return Object.values(rows[0]!).map(String).join(" ");
};

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

describe("5.9's queries on the real schema", () => {
  it("every query of the helpers and of the steps runs", async () => {
    const all = [
      ...asked([helper("pubrole"), "pubrole"]),
      ...asked([helper("pubhba"), `pubhba ${CLN}`, "pubhba debateai_prod_api_runtime"]),
      ...asked([helper("pubcounts"), "pubcounts"]),
      ...asked([helper("staffkey"), "staffkey"]),
      ...asked(stepQueries())
    ];
    expect(all.length).toBeGreaterThan(8);
    for (const sql of all) await expect(database.pool.query(sql), sql.slice(0, 80)).resolves.toBeDefined();
    expect(await one(asked([helper("staffkey"), "staffkey"])[0]!)).toBe("0");
    expect(await one(asked([helper("pubrole"), "pubrole"])[0]!)).toBe("missing");
  });

  it("pubcounts counts what was ever published, what is public now, the keys that should be in the store, the Free debates and the clean-ups", async () => {
    const [counts] = asked([helper("pubcounts"), "pubcounts"]);
    // The registry of used refs also takes a row when a debate starts, and four when a private debate is deleted, by its
    // owner or by the end-of-debate check. None of them is a sign of publishing.
    const used = (kind: string) => [`INSERT INTO core.publication_ref_tombstone (ref, ref_kind, created_at) VALUES ($1, $2, now())`, [randomUUID(), kind]] as const;
    await seeded(["run_execution_ref", "run_execution_ref",
      "private_erasure_request", "private_erasure_audit_id", "private_erasure_audit_actor", "private_erasure_audit_target",
      "synthesis_check_erasure_request", "synthesis_check_erasure_audit_id", "synthesis_check_erasure_audit_actor", "synthesis_check_erasure_audit_target"].map(used));
    expect(await one(counts!)).toBe("0 0 0 0 0 0 0 0 0");
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    const snapshot = (ref: string) => [`INSERT INTO serve.publication_snapshot (publication_ref, run_id, format_version, content_ciphertext, created_at)
      VALUES ($1, $2, 1, jsonb_build_object('v', '1', 'keyId', $3::text, 'nonce', 'n', 'ct', 'c', 'tag', 't'), now())`, [ref, randomUUID(), `publication-snapshot:${ref}:v1`]] as const;
    let seq = 1_000_000;
    const visibility = (ref: string, state: "PUBLISHED" | "PRIVATE", run: string) => [`INSERT INTO core.run_visibility_event (run_id, publication_ref, state, actor_audit_token, warning_version, occurred_at, at_seq)
      VALUES ($1, $2, $3, $4, $5, now(), $6)`, [run, ref, state, randomUUID(), state === "PUBLISHED" ? "PUBLIC_INDEXED_V1" : "COPIES_MAY_PERSIST_V1", seq++]] as const;
    const [runA, runB] = [randomUUID(), randomUUID()];
    const free = (outcome: string | null) => [`INSERT INTO identity.free_public_ask (run_id, owner_ref, notice_at, outcome, publication_ref, decided_at)
      VALUES ($1, $2, now(), $3, $4, $5)`, [randomUUID(), randomUUID(), outcome, outcome === "PUBLISHED" ? randomUUID() : null, outcome === null ? null : new Date().toISOString()]] as const;
    await seeded([snapshot(a), snapshot(b), snapshot(c), visibility(a, "PUBLISHED", runA), visibility(b, "PUBLISHED", runB), visibility(b, "PRIVATE", runB),
      [`INSERT INTO serve.publication_key_cleanup_intent (publication_ref, requested_at, completed_at, cleanup_state, cleanup_claim_token, destroy_result)
        VALUES ($1, now(), now(), 'CLEANED', $2, 'DESTROYED')`, [b, randomUUID()]],
      [`INSERT INTO serve.publication_key_cleanup_intent (publication_ref, requested_at, completed_at) VALUES ($1, now(), NULL)`, [c]],
      free(null), free("PUBLISHED"), free("REFUSED"),
      ...["publication_ref", "reservation", "visibility_event", "visibility_actor", "allow_audit_id", "allow_audit_actor", "allow_audit_target",
        "denied_audit_id", "denied_audit_actor", "denied_audit_target"].map(used)]);
    // Ever made 3; public now 1 (b came down); keys that should still be in the store 2 (b's was destroyed);
    // Free debates waiting 1, public 1, kept private 1; clean-ups waiting 1; provisions 0;
    // visibility events 3 and the ten kinds of ref only publishing writes, with the rows above left out: 13.
    expect(await one(counts!)).toBe("3 1 2 1 1 1 1 0 13");
    // A kind the table comes to allow later is counted until this guide says what it is: the steps then stop and ask.
    const allowed = await one(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'publication_ref_tombstone_ref_kind_check'`);
    expect([...allowed.matchAll(/'([a-z_]+)'/gu)].map(match => match[1]).sort()).toEqual(["run_execution_ref",
      "private_erasure_request", "private_erasure_audit_id", "private_erasure_audit_actor", "private_erasure_audit_target",
      "synthesis_check_erasure_request", "synthesis_check_erasure_audit_id", "synthesis_check_erasure_audit_actor", "synthesis_check_erasure_audit_target",
      "publication_ref", "reservation", "visibility_event", "visibility_actor", "allow_audit_id", "allow_audit_actor", "allow_audit_target",
      "denied_audit_id", "denied_audit_actor", "denied_audit_target"].sort());
  });
});

describe("pubrole and pubprobe read the clean-up login as the API's own role check does", () => {
  const password = "publishing-queries-witness-only";
  const urlFor = (role: string): string => {
    const url = new URL(database.connectionString);
    url.username = role;
    url.password = password;
    return url.toString();
  };
  /** The code's verdict on a login, through a real connection as that login. */
  const codeAccepts = async (role: string): Promise<boolean> => {
    const pool = createPool(urlFor(role));
    try { return await assertPublicationCleanupDatabaseRole(pool).then(() => true, () => false); } finally { await pool.end(); }
  };
  const roleOf = async (role: string): Promise<string> => one(asked([helper("pubrole"), "pubrole"], role)[0]!);

  it("gives the code's verdict for a right login, one with a runtime role, one with no clean-up role, one with special powers and one that does not inherit", async () => {
    await database.pool.query(`
      CREATE ROLE pq_cleanup_ok LOGIN INHERIT PASSWORD '${password}';
      GRANT debateai_publication_cleanup TO pq_cleanup_ok;
      CREATE ROLE pq_cleanup_runtime LOGIN INHERIT PASSWORD '${password}';
      GRANT debateai_publication_cleanup TO pq_cleanup_runtime;
      GRANT debateai_runtime TO pq_cleanup_runtime;
      CREATE ROLE pq_cleanup_none LOGIN INHERIT PASSWORD '${password}';
      CREATE ROLE pq_cleanup_powers LOGIN INHERIT CREATEDB PASSWORD '${password}';
      GRANT debateai_publication_cleanup TO pq_cleanup_powers;
      CREATE ROLE pq_cleanup_noinherit LOGIN NOINHERIT PASSWORD '${password}';
      GRANT debateai_publication_cleanup TO pq_cleanup_noinherit
    `);
    const expected: Record<string, string> = {
      pq_cleanup_ok: "",
      pq_cleanup_runtime: "runtime-member",
      pq_cleanup_none: "no-cleanup-role no-cleanup-functions",
      pq_cleanup_powers: "special-powers",
      pq_cleanup_noinherit: "no-cleanup-role no-cleanup-functions"
    };
    for (const [role, verdict] of Object.entries(expected)) {
      expect(await roleOf(role), role).toBe(verdict);
      expect(await codeAccepts(role), role).toBe(verdict === "");
    }
    expect(await roleOf("pq_cleanup_absent")).toBe("missing");
  }, 60_000);

  it("pubprobe answers accepted for the right login and names the refusal for the others, never printing the line", () => {
    const dir = mkdtempSync(join(tmpdir(), "main-site-publishing-probe-"));
    try {
      const probe = (role: string, secret = password) => {
        const url = new URL(urlFor(role));
        url.password = secret;
        writeFileSync(join(dir, "line"), `PUBLICATION_CLEANUP_DATABASE_URL=${url.toString()}\n`);
        const text = [`CAPI='${dirname(ROOT)}'; AU=x; N='${process.execPath}'`, 'runuser() { while [ "$1" != -- ]; do shift; done; shift; "$@"; }',
          helper("pubprobe"), `pubprobe '${join(dir, "line")}' || true`].join("\n");
        const out = spawnSync("bash", ["-c", text], { encoding: "utf8", timeout: 60_000 });
        expect(out.stdout + out.stderr).not.toContain(secret);
        return out.stdout.trim();
      };
      expect(probe("pq_cleanup_ok")).toBe("accepted");
      expect(probe("pq_cleanup_runtime")).toBe("it signs in, but the API role check refuses it");
      // A login without the clean-up role cannot even read the functions' schema: the check fails with that code.
      expect(probe("pq_cleanup_none")).toBe("it signs in, but the API role check refuses it (42501)");
      expect(probe("pq_cleanup_ok", "not-its-password")).toMatch(/^(the database refuses its password|accepted)$/u);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 120_000);
});
