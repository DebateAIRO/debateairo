### Task T01: Database step 0193 (the vote table, six functions, and the step's files)

The database half of upvotes (design §5, §7.1): one table, five functions of the fixed interface, and a sixth that
deletes the votes of a page that is gone for good. Nothing calls them yet. T02 pins and exercises them on real logins;
T05, T06 and T16 call them.

Every command below is run from the code root with this prefix (written out in each step):
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

Depends on: nothing of this slice (T00, `dev` with step 0192, is already this tree). May run alongside T03, T04,
T09, T10 (no shared file). If another task shares your working tree, run your typecheck and commit steps while no
other task is in the middle of an edit, and read every `git status` and typecheck expectation below as "nothing
else of yours".

**Files:**
- Create: `migrations/0193_public_debate_upvotes.sql`
- Create: `migrations/lineage/public-debate-upvotes-forward0193.json`
- Create: `packages/db/src/migration-forward0193.ts`
- Create: `tests/architecture/public-debate-upvotes-0193-contract.test.ts`
- Modify: `packages/db/src/migration-forward-chain.ts:86` (one import after it), `:200` (the doc comment's last
  clause), `:203` (the `STEPS` literal's end)
- Modify: `tests/support/forward-chain-steps.ts:99` (one line after it)
- Modify: `tests/architecture/migration-forward-chain.test.ts:1184-1186` (0192's case finds its step by name), and a
  new case inserted after `:1229`
- Modify: `migrations/lineage/README.md:13` (the one long sentence), `:17-19`, and a new last section after `:1789`
- Test: `tests/architecture/public-debate-upvotes-0193-contract.test.ts`,
  `tests/architecture/migration-forward-chain.test.ts`

**Interfaces:**
- Consumes (from T00, already true of this tree at `c946564be`): the chain ends at
  `0192_registration_country_read.sql`; `migrations/lineage/registration-country-read-forward0192.json` has sha256
  `891dedf72e8299e5d49aa9c421304fa897f484b27db1fff44fe334bfd92216b0`; the verifier in force is
  `migrations/lineage/verify-effective-capabilities-130.sql`, sha256
  `12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57`; the recipe
  `migrations/lineage/auth-dev-20261006.json` has sha256
  `3ad4ca844799fa0e498124250dba11683d0e305a2e3571468809ec5a6cec45c2`. Step 7 recomputes all three from the files.
- Produces (every later task uses these names exactly):
  - Table `identity.public_debate_upvote (publication_ref uuid, owner_ref uuid, created_at timestamptz)`, primary key
    `(publication_ref, owner_ref)`, index `public_debate_upvote_owner (owner_ref, created_at)`. The account key is
    `ON DELETE CASCADE`. No role holds any right on it.
  - `identity.cast_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb`, for
    `debateai_billing_runtime`. Answers `{"outcome":"CAST"|"ALREADY","upvotes":<integer>}` or
    `{"outcome":"NOT_PUBLIC","upvotes":null}`. Raises, in this order: `22023 PUBLIC_DEBATE_UPVOTE_INVALID` (a null
    argument), `42501 REQUEST_OWNER_MISMATCH`, `22023 PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID` (no account row with
    `state = 'active'`).
  - `identity.withdraw_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb`, for
    `debateai_billing_runtime`. Answers `{"outcome":"WITHDRAWN"|"NONE","upvotes":<integer or null>}`; `upvotes` is null
    exactly when the page is not public now. Raises the first two errors of cast, never the third.
  - `identity.read_own_public_debate_upvotes(p_owner_ref uuid, p_publication_refs uuid[]) RETURNS uuid[]`, for
    `debateai_billing_runtime`. The asked refs the account upvoted, sorted; an empty array when none. It does not
    ask whether a page is public. Raises
    `22023 PUBLIC_DEBATE_UPVOTE_INVALID` (a null argument, or more than 100 refs), then `42501 REQUEST_OWNER_MISMATCH`.
  - `identity.read_public_debate_upvote_counts(p_publication_refs uuid[]) RETURNS jsonb`, for
    `debateai_rls_all_accounts`. `[{"publication_ref":uuid,"upvotes":integer}]` ordered by ref, one entry per distinct
    asked ref that is public now (0 when it has no votes); `[]` otherwise. Raises `22023 PUBLIC_DEBATE_UPVOTE_INVALID`
    (null, or more than 100 refs).
  - `identity.read_data_export_public_debate_upvotes(p_export_id uuid, p_worker uuid) RETURNS jsonb`, for
    `debateai_data_export_worker`. `[{"publication_ref":uuid,"created_at":timestamptz}]` ordered by
    `created_at, publication_ref`; `[]` when none; a wrong lease or worker raises 0128's `DATA_EXPORT_LEASE_INVALID`.
  - `identity.delete_gone_public_debate_upvotes(p_limit integer) RETURNS integer`, for `debateai_rls_all_accounts`.
    Deletes at most `p_limit` votes of pages that are gone for good and returns how many. `p_limit` must be 1 to 1000;
    null or outside raises `22023 PUBLIC_DEBATE_UPVOTE_INVALID`. A vote another transaction holds is skipped and left
    for the next pass. A return equal to `p_limit` means more may remain. It takes no owner and never touches a page
    that is only held. (For T16: call it as `SELECT identity.delete_gone_public_debate_upvotes($1) AS deleted` on a
    login that holds the marker; a request login gets "permission denied".)
  - Loader `loadForward0193` in `packages/db/src/migration-forward0193.ts`, refusal prefix `MIGRATION_FORWARD0193_`.
  - For T02's disclosure entries, the six GRANT lines are, in file order: cast, withdraw, read_own to
    `debateai_billing_runtime`; counts, delete_gone to `debateai_rls_all_accounts`; the export reader to
    `debateai_data_export_worker`.

**Before you start:**

Read these as templates. The SQL of step 5 already follows them; read them to understand it, not to rewrite it.
- `migrations/0162_saved_questions.sql:45-76` (a person-linked identity table: the cascading account key, the index,
  the truncate guard), `:234-254` (the one reviewed owner block), `:272-320` (the closing block that checks the
  file's own claims).
- `migrations/0192_registration_country_read.sql:28-58`: the newest function that asks whose connection it is, its
  "owner unable" check and its REVOKE list. `migrations/0190_check_deletes_public_debate.sql:349-358`: grants to the
  cross-account marker, one role per line.
- `packages/db/src/migration-forward0188.ts:1-107`: the loader of a step with tables and functions. Step 8 copies it
  whole.
- `tests/architecture/migration-forward-chain.test.ts:1063-1130` (0190's case) and `:1181-1229` (0192's case, today's
  chain head): the shape of the case step 3 adds.
- `migrations/lineage/README.md:1750-1789` (0192's section) and `:1619-1702` (0190's): the shape of the section
  step 11 writes.

What "public now", "gone for good" and "held" mean here. These are the code's own rules; the SQL uses them as they are.
- Public now, the list's rule (`packages/db/src/publication.ts:694`), as a function
  (`migrations/0150_public_review.sql:162-181`):
  `SELECT state = 'PUBLISHED' AND publication_ref = p_publication_ref AND NOT identity.public_review_held(p_publication_ref) FROM latest`
  where `latest` is the run's newest visibility event. Cast and the count use
  `core.run_is_published(core.run_of_publication(ref), ref)`.
- Current publication, which ignores holds (`migrations/0171_security_review_hardening.sql:367-375`):
  `SELECT COALESCE((SELECT latest.state = 'PUBLISHED' AND latest.publication_ref = p_publication_ref FROM (… ORDER BY event.at_seq DESC LIMIT 1) AS latest), false)`.
  Its comment: "a hold changes nothing here (it writes no visibility event), a debate made private again or published
  under a new link answers false".
- Gone for good = `NOT core.publication_is_current(ref)`. Three writers end a page, each with a `PRIVATE` event under
  the page's own link: the owner's unpublish (`migrations/0085_staff_access_foundation.sql:1519`
  `v_publication_ref := v_latest_publication_ref;` and `:1546`
  `CASE p_action WHEN 'PUBLISH' THEN 'PUBLISHED' ELSE 'PRIVATE' END`), the end-of-debate check's takedown
  (`migrations/0190_check_deletes_public_debate.sql:241-247`, `… v_latest_publication_ref,'PRIVATE' …`), and an
  account closing that removes its public debates (`migrations/0178_security_fixes_run3.sql:1862-1866`). It never
  comes back: every publish inserts a new snapshot row first (`0085:1527-1529`, `migrations/0137_public_debates.sql:671-676`),
  and the link is that table's primary key (`migrations/0039_publication_visibility.sql:42`).
- Held = `identity.public_review_held(ref)` (`migrations/0150_public_review.sql:102-106`): the page's newest `HIDE` or
  `REPUBLISH` review event is `HIDE`. A hold writes only `identity.public_review_event`
  (`migrations/0150_public_review.sql:895`), so a held page is still current. The sweep asks
  `core.publication_is_current` and nothing else, so it cannot touch a page that is merely held. A page that is held
  and then unpublished is gone for good and is swept.

Traps.
- A lone SQL file breaks every test that loads the migration plan (`packages/db/src/migration-lineage.ts:55`,
  `SOURCE_INVENTORY`). Steps 5 to 10 land together; do not run a plan-loading test between them.
- Every edit of the SQL moves `migration.sha256`. After any edit, run step 7's command again, or the loader fails
  `MIGRATION_FORWARD0193_SOURCE_DIGEST`.
- The manifest has six keys (`amendsPostconditionsOf: []`); the loader refuses five
  (`packages/db/src/migration-forward0188.ts:85`).
- Only three comment lines may start with `-- n1:`: `-- n1: expand`, `-- n1: keeps-verifier`, and the one
  `-- n1: reviewed …` line directly above `DO $public_debate_upvotes_owner$` (`packages/db/src/migration-n1.ts:48-55`).
- Each GRANT is one line naming one role (`tests/architecture/p3-production-database-principals.test.ts:2400-2419`
  parses them with a line regex).
- Nothing is granted to `debateai_erasure_runtime`: the API counts at its start what that login may run
  (`migrations/0190_check_deletes_public_debate.sql:12-13`).
- No `core.reject_mutation` trigger, no row security, no policy, no table grant. Only the truncate guard.
- Do not edit 0190 or any earlier migration. `CREATE OR REPLACE` of an earlier function is `N1_FORBIDDEN_REPLACE`
  (`tools/orphan-audit/src/migration-n1.ts:316`).
- Do not edit `packages/db/src/index.ts`: its bytes are pinned (`tools/orphan-audit/src/index.ts:678`, checked at
  `:744`).
- Not yours: `tests/support/shipped-corpus.manifest.txt` and `tests/ci-integration-auth.txt` (T15 alone edits them);
  the disclosure JSON, the census, the identity table inventory and `tests/n1-baseline.json` (T02). So after this
  task three tests are red on purpose: `tests/unit/s1-1-depth-contract.test.ts` (it names
  `packages/db/src/migration-forward0193.ts`, until T15), the inventory case of
  `tests/integration/identity-database.test.ts` (until T02), and the census case of
  `tests/integration/security-review-hardening-database.test.ts`, "the census sees every definer either request
  login may EXECUTE" (until T02 names the three request functions; that file is on the pull request's list,
  `tests/ci-integration-auth.txt:130`). Leave all three.
- The postcondition digest pins the table's and the functions' owners, ACLs, columns, constraints, indexes and
  bodies. A later change to any of them needs a new step with a declared amendment. Get them right here.

- [ ] **Step 1: Write the step's contract test**

Create `tests/architecture/public-debate-upvotes-0193-contract.test.ts` with exactly this content. It reads files
only; it starts no database.

```ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import {
  auditMigrationN1Compatibility,
  auditMigrationReplaySafety,
  definedFunctionNames,
  definedRelationNames,
  type N1AuditContext
} from "../../tools/orphan-audit/src/index.js";

/**
 * 0193 (design docs/superpowers/specs/2026-11-26-public-debate-upvotes-design.md §5, §7.1): upvotes on public debates. One
 * identity table, one row per account and page; three functions for the API's own role, each asking whose connection it
 * is; the count and the sweep for the cross-account marker; the export reader for the export worker; 0115's export owner
 * owns all of it. No database here: the behaviour on real logins is tests/integration/public-debate-upvotes-0193.test.ts.
 */
const NAME = "0193_public_debate_upvotes.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/public-debate-upvotes-forward0193.json";
const PREVIOUS = "0192_registration_country_read.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/registration-country-read-forward0192.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** The SQL without its `--` comments (no literal or body of 0193 contains `--`). */
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const TABLE = "identity.public_debate_upvote";
const CAST = "identity.cast_public_debate_upvote(uuid,uuid)";
const WITHDRAW = "identity.withdraw_public_debate_upvote(uuid,uuid)";
const READ_OWN = "identity.read_own_public_debate_upvotes(uuid,uuid[])";
const COUNTS = "identity.read_public_debate_upvote_counts(uuid[])";
const EXPORT_READER = "identity.read_data_export_public_debate_upvotes(uuid,uuid)";
const SWEEP = "identity.delete_gone_public_debate_upvotes(integer)";
/** In the file's order, which is the loader's FUNCTIONS order. */
const FUNCTIONS = [CAST, WITHDRAW, READ_OWN, COUNTS, EXPORT_READER, SWEEP] as const;
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
const tableBody = (sql: string): string => {
  const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${TABLE} (`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("\n);", at));
};
/** One function from its CREATE line to the end of its body, on one line. */
const flat = (sql: string, signature: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${nameOf(signature)}(`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("$$;", sql.indexOf("AS $$", at))).replace(/\s+/gu, " ");
};
/** Every needle is there, each after the one before it. */
const inOrder = (text: string, needles: readonly string[]): boolean =>
  needles.every((needle, at) => text.indexOf(needle) > (at === 0 ? -1 : text.indexOf(needles[at - 1]!)));
const PUBLIC_NOW = "core.run_is_published(core.run_of_publication(p_publication_ref), p_publication_ref)";
const ASKS_OWNER = "IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;";
/** What the census of tests/integration/security-review-hardening-database.test.ts calls "asks the connection". */
const ASKS_CONNECTION = /identity\.(?:request_owner_matches|page_memory_run_owned)\(|rls\.(?:context_owner_ref|context_user_id|session_credential_hash)\(|staff\.require_http_authority\(|pg_has_role\(|core\.lock_owned_live_runs\(/u;
const EVERYONE = "PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;";

describe("0193: upvotes on public debates", () => {
  it("C-T is the step right after 0192, found by name, with its own loader, no amendment and no verifier of its own", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0193 } from './migration-forward0193.js';");
    expect(chain).toContain("loadForward0192,loadForward0193");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    // Found by name, never as the chain's last step: a step after it needs no edit here.
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    const step = plan.forwardChain.find((entry) => entry.name === NAME)!;
    expect(step.amendsPostconditionsOf).toEqual([]);
    expect(step.replayVerifierSql).toBeUndefined();
    const loader = read("packages/db/src/migration-forward0193.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "public-debate-upvotes-forward0193-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/public-debate-upvotes-forward0193.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain('const TABLES: readonly string[] = ["identity.public_debate_upvote"];');
    for (const signature of FUNCTIONS) expect(loader, signature).toContain(`"${signature}"`);
    expect(loader).toContain("export async function loadForward0193(anchor: ForwardStepAnchor): Promise<ForwardStepPlan>");
    expect(loader).toContain("MIGRATION_FORWARD0193_");
    expect(loader).not.toMatch(/MIGRATION_FORWARD0(?!193_)\d{3}_/u);
  });

  it("C-M is bound to 0192's manifest and to the verifier in force (0130's, which 0192 keeps)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string; verifier: { sha256: string } };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier", "amendsPostconditionsOf"]);
    expect(manifest).toEqual({
      version: "public-debate-upvotes-forward0193-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: []
    });
    expect(previous.verifier.sha256).toBe(VERIFIER_130);
    expect(sha256(read("migrations/lineage/verify-effective-capabilities-130.sql"))).toBe(VERIFIER_130);
    expect(read(MANIFEST_PATH)).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
  });

  it("C-H says truthfully that it is expand and keeps the verifier, and stays outside row security", () => {
    const sql = read(SQL_PATH);
    expect(parseN1Header(NAME, sql)).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect(sql).toMatch(/^-- n1: expand$/mu);
    expect(sql).toMatch(/^-- n1: keeps-verifier$/mu);
    expect(sql).toContain("row security    outside 0130's scope rule: no request role can SELECT this table.");
    expect(code(sql)).not.toMatch(/ROW LEVEL SECURITY|CREATE POLICY|CREATE TRIGGER|reject_mutation/iu);
    expect(code(sql)).not.toMatch(/\bbilling\./u);
  });

  it("C-A passes the replay audit and the N-1 audit, and only through its one reviewed owner block; nothing it creates existed before", async () => {
    const sql = read(SQL_PATH);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
    const earlier = readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME).sort();
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const name of earlier) {
      const source = read(`migrations/${name}`);
      for (const defined of definedFunctionNames(source)) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(source)) earlierRelations.add(defined);
      for (const created of ["public_debate_upvote", "delete_gone_public_debate_upvotes"]) expect(source, `${name} ${created}`).not.toContain(created);
    }
    expect([...definedRelationNames(sql)]).toEqual([TABLE]);
    expect([...definedFunctionNames(sql)]).toEqual(FUNCTIONS.map(nameOf));
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    const unreviewed = sql.split("\n").map((line) => (line.startsWith("-- n1: reviewed ") ? "-- (review removed)" : line)).join("\n");
    expect(auditMigrationN1Compatibility(SQL_PATH, unreviewed, context).map((finding) => finding.split(" ")[1])).toEqual(["N1_DYNAMIC_SQL"]);
  });

  it("C-O one table: the page, the account with ON DELETE CASCADE, a time; the pair is the primary key; a truncate guard and nothing else", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([TABLE]);
    const body = tableBody(sql);
    expect([...body.matchAll(/^ {2}([a-z_]+) ([a-z]+)\b/gmu)].map((match) => [match[1], match[2]]))
      .toEqual([["publication_ref", "uuid"], ["owner_ref", "uuid"], ["created_at", "timestamptz"]]);
    expect(body).toContain("  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),\n");
    expect(body).toContain('  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,\n');
    expect(body).toContain("  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),\n");
    expect(body).toContain("  PRIMARY KEY (publication_ref, owner_ref)");
    // The page's row is never deleted (0039's trigger), so its key carries no ON DELETE: the account's is the only one.
    expect(body.match(/ON DELETE/gu)).toHaveLength(1);
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS public_debate_upvote_owner ON identity.public_debate_upvote (owner_ref, created_at);");
    expect(sql.match(/CREATE (?:UNIQUE )?INDEX/gu)).toHaveLength(1);
    expect(sql).toContain(`SELECT core.install_truncate_guard('${TABLE}');`);
  });

  it("C-F exactly six functions, each a plpgsql definer with only pg_catalog on its path, owned in one reviewed block by 0115's export owner", () => {
    const sql = read(SQL_PATH);
    const lines = code(sql).split("\n");
    const created = "CREATE OR REPLACE FUNCTION ";
    expect(lines.flatMap((line, at) => (line.startsWith(created) ? [[line.slice(created.length), lines[at + 1]]] : []))).toEqual([
      ["identity.cast_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb", "LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$"],
      ["identity.withdraw_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb", "LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$"],
      ["identity.read_own_public_debate_upvotes(p_owner_ref uuid, p_publication_refs uuid[]) RETURNS uuid[]", "LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$"],
      ["identity.read_public_debate_upvote_counts(p_publication_refs uuid[]) RETURNS jsonb", "LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$"],
      ["identity.read_data_export_public_debate_upvotes(p_export_id uuid, p_worker uuid) RETURNS jsonb", "LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$"],
      ["identity.delete_gone_public_debate_upvotes(p_limit integer) RETURNS integer", "LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$"]
    ]);
    expect(code(sql)).not.toMatch(/^\s*(?:ALTER|DROP) (?:TABLE|FUNCTION) /mu);
    const owner = sql.slice(sql.indexOf("DO $public_debate_upvotes_owner$"), sql.indexOf("$public_debate_upvotes_owner$;"));
    expect(owner).toContain("WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;");
    expect(owner).toContain("'ALTER TABLE identity.public_debate_upvote OWNER TO %I'");
    expect(owner).toContain("'ALTER FUNCTION %s OWNER TO %I'");
    for (const signature of FUNCTIONS) expect(owner, signature).toContain(`'${signature}'`);
    // The step refuses to apply where the owner could not ask what the six functions ask.
    for (const called of ["identity.request_owner_matches(uuid)", "core.run_is_published(uuid,uuid)", "core.run_of_publication(uuid)",
      "core.publication_is_current(uuid)", "identity.data_export_lease_user(uuid,uuid)"]) {
      expect(owner, called).toContain(`NOT pg_catalog.has_function_privilege(v_owner, '${called}', 'EXECUTE')`);
    }
    expect(owner).toContain("MESSAGE='PUBLIC_DEBATE_UPVOTES_OWNER_UNABLE'");
    const raw = sql.split("\n");
    expect(raw.filter((line) => line.startsWith("-- n1: reviewed "))).toHaveLength(1);
    expect(raw[raw.indexOf("DO $public_debate_upvotes_owner$") - 1]).toMatch(/^-- n1: reviewed \S/u);
    // The closing block checks the contract instead of assuming it, after the last grant.
    const contract = sql.slice(sql.indexOf("DO $public_debate_upvotes_contract$"), sql.indexOf("$public_debate_upvotes_contract$;"));
    expect(contract).toContain("PUBLIC_DEBATE_UPVOTES_CONTRACT");
    for (const signature of FUNCTIONS) expect(contract, signature).toContain(`'${signature}'`);
    expect(contract).toContain("'debateai_rls_all_accounts'");
    expect(sql.lastIndexOf("DO $public_debate_upvotes_contract$")).toBeGreaterThan(sql.lastIndexOf("GRANT "));
  });

  it("C-V cast and withdraw ask whose connection it is before they write, and answer {outcome, upvotes}; only cast asks for an active account and a public page first", () => {
    const sql = code(read(SQL_PATH));
    const cast = flat(sql, CAST);
    expect(cast).toContain(ASKS_OWNER);
    expect(inOrder(cast, ["MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'", "identity.request_owner_matches(p_owner_ref)", "account.state = 'active'",
      "MESSAGE='PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID'", `IF NOT ${PUBLIC_NOW} THEN`, "pg_catalog.jsonb_build_object('outcome', 'NOT_PUBLIC', 'upvotes', NULL::integer)",
      "INSERT INTO identity.public_debate_upvote (publication_ref, owner_ref) VALUES (p_publication_ref, p_owner_ref)",
      "ON CONFLICT (publication_ref, owner_ref) DO NOTHING", "pg_catalog.jsonb_build_object('outcome', CASE WHEN v_written = 1 THEN 'CAST' ELSE 'ALREADY' END",
      "'upvotes', (SELECT pg_catalog.count(*)::integer FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = p_publication_ref)"])).toBe(true);
    const withdraw = flat(sql, WITHDRAW);
    expect(withdraw).toContain(ASKS_OWNER);
    expect(inOrder(withdraw, ["MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'", "identity.request_owner_matches(p_owner_ref)",
      "DELETE FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = p_publication_ref AND vote.owner_ref = p_owner_ref;",
      "pg_catalog.jsonb_build_object('outcome', CASE WHEN v_deleted = 1 THEN 'WITHDRAWN' ELSE 'NONE' END",
      `'upvotes', CASE WHEN ${PUBLIC_NOW} THEN (SELECT pg_catalog.count(*)::integer FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = p_publication_ref) END)`])).toBe(true);
    // A person may always take their own vote back: no account state and no page state stands before the delete.
    expect(withdraw).not.toContain("account.state");
    expect(withdraw.match(/core\.run_is_published\(/gu)).toHaveLength(1);
  });

  it("C-Q the three readers: own votes behind the owner question, counts for pages public now and no owner, the export behind 0128's lease", () => {
    const sql = code(read(SQL_PATH));
    const own = flat(sql, READ_OWN);
    expect(own).toContain(ASKS_OWNER);
    expect(inOrder(own, ["COALESCE(pg_catalog.cardinality(p_publication_refs), 0) > 100", "MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'",
      "identity.request_owner_matches(p_owner_ref)", "pg_catalog.array_agg(vote.publication_ref ORDER BY vote.publication_ref)",
      "WHERE vote.owner_ref = p_owner_ref AND vote.publication_ref = ANY (p_publication_refs)", "ARRAY[]::uuid[]"])).toBe(true);
    expect(own).not.toContain("run_is_published");
    const counts = flat(sql, COUNTS);
    expect(inOrder(counts, ["COALESCE(pg_catalog.cardinality(p_publication_refs), 0) > 100", "MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'",
      "pg_catalog.jsonb_build_object('publication_ref', asked.ref, 'upvotes', (SELECT pg_catalog.count(*)::integer FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = asked.ref))",
      "ORDER BY asked.ref", "SELECT DISTINCT ref FROM pg_catalog.unnest(p_publication_refs)",
      "WHERE core.run_is_published(core.run_of_publication(asked.ref), asked.ref)", "'[]'::jsonb"])).toBe(true);
    expect(counts).not.toMatch(ASKS_CONNECTION);
    expect(counts).not.toMatch(/p_owner|owner_ref/u);
    const reader = flat(sql, EXPORT_READER);
    expect(reader).toContain("BEGIN v_user := identity.data_export_lease_user(p_export_id, p_worker);");
    expect(inOrder(reader, ["identity.data_export_lease_user(p_export_id, p_worker)", "pg_catalog.jsonb_build_object('publication_ref', vote.publication_ref, 'created_at', vote.created_at)",
      "ORDER BY vote.created_at, vote.publication_ref", "WHERE vote.owner_ref = v_owner_ref", "'[]'::jsonb"])).toBe(true);
    expect(reader).not.toContain("run_is_published");
  });

  it("C-S the sweep deletes only votes of a page that is no longer its debate's current publication, in a bounded batch, and never asks whether a page is held", () => {
    const sql = code(read(SQL_PATH));
    const sweep = flat(sql, SWEEP);
    expect(inOrder(sweep, ["IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'; END IF;",
      "WITH gone AS MATERIALIZED (", "WHERE NOT core.publication_is_current(page.publication_ref)", "ORDER BY candidate.publication_ref, candidate.owner_ref",
      "LIMIT p_limit", "FOR UPDATE OF candidate SKIP LOCKED", "DELETE FROM identity.public_debate_upvote AS vote USING gone",
      "WHERE vote.publication_ref = gone.publication_ref AND vote.owner_ref = gone.owner_ref;", "GET DIAGNOSTICS v_deleted = ROW_COUNT;", "RETURN v_deleted;"])).toBe(true);
    // A held page is still current (0150's HIDE writes no visibility event). The list's rule, which a hold turns false, must not decide here.
    expect(sweep).not.toMatch(/run_is_published|public_review_held/u);
    expect(sweep.match(/core\.publication_is_current\(/gu)).toHaveLength(1);
    expect(sweep).not.toMatch(ASKS_CONNECTION);
    expect(sweep).not.toMatch(/p_owner/u);
    // The only other DELETE of the file is the withdraw's own row.
    expect(sql.match(/\bDELETE FROM\b/gu)).toHaveLength(2);
  });

  it("C-G exactly six GRANT lines, one role each: the API's role three, the cross-account marker two, the export worker one; never the runtime, authorization or erasure role", () => {
    const sql = code(read(SQL_PATH));
    expect(sql.split("\n").filter((line) => /^\s*GRANT /u.test(line))).toEqual([
      `GRANT EXECUTE ON FUNCTION ${CAST} TO debateai_billing_runtime;`,
      `GRANT EXECUTE ON FUNCTION ${WITHDRAW} TO debateai_billing_runtime;`,
      `GRANT EXECUTE ON FUNCTION ${READ_OWN} TO debateai_billing_runtime;`,
      `GRANT EXECUTE ON FUNCTION ${COUNTS} TO debateai_rls_all_accounts;`,
      `GRANT EXECUTE ON FUNCTION ${SWEEP} TO debateai_rls_all_accounts;`,
      `GRANT EXECUTE ON FUNCTION ${EXPORT_READER} TO debateai_data_export_worker;`
    ]);
    // Whole-file, not line by line: a GRANT split over two lines, indented or inside a DO block counts too.
    expect(sql.match(/\bGRANT\b/gu)).toHaveLength(6);
    expect(sql).not.toMatch(/\bGRANT\b[^;]*\bTO\s+(?:PUBLIC|debateai_runtime|debateai_authorization_runtime|debateai_erasure_runtime|debateai_replay|debateai_staff_security_owner)\b/u);
    expect(sql).not.toMatch(/\bGRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|ALL)\b/iu);
    expect(sql).toContain(`REVOKE ALL ON ${TABLE}\n  FROM ${EVERYONE}`);
    for (const signature of FUNCTIONS) expect(sql, signature).toContain(`REVOKE ALL ON FUNCTION ${signature}\n  FROM ${EVERYONE}`);
    expect(sql.match(/\bREVOKE\b/gu)).toHaveLength(7);
  });

  it("C-R is documented where the chain's steps are, and nothing of it is in the database package's pinned index", () => {
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0192, below) the eighty-second, and upvotes on public debates (0193, below) the eighty-third. A step is added",
      "(after 0193: 0193, `public-debate-upvotes-forward0193.json`, and", "0131 to 0193 keep 0130's",
      "## Upvotes on public debates (0193)", "`loadForward0193`", "MIGRATION_FORWARD0193_"]) expect(readme, needle).toContain(needle);
    expect(read("packages/db/src/index.ts")).not.toMatch(/public[-_]debate[-_]upvote|forward0193/u);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/architecture/public-debate-upvotes-0193-contract.test.ts`

Expected: `Tests  11 failed (11)`. C-T fails on the missing import line; the others on `ENOENT` for
`migrations/0193_public_debate_upvotes.sql` or the manifest; C-R on the README sentence.

- [ ] **Step 3: Make 0192's chain case find its step by name, and add 0193's case**

In `tests/architecture/migration-forward-chain.test.ts`, replace lines 1184-1186 (the comment, the `names.slice(-2)`
assertion and the `plan.forwardChain.slice(-2)` line of 0192's case) with:

```ts
    // One function of the API's billing role, its owner set by one reviewed DO block. Found by name: upvotes on public
    // debates (0193) follow it.
    const at = names.indexOf("0192_registration_country_read.sql");
    expect(names.slice(at - 1, at + 1)).toEqual(["0191_preview_buyer_add_key_only.sql", "0192_registration_country_read.sql"]);
    const [previous, step] = plan.forwardChain.slice(at - 1, at + 1) as [ChainStep, ChainStep];
```

Then insert this case after 0192's case (after the `});` on line 1229, before the comment that starts
"The release before refuses"):

```ts
  it("chains upvotes on public debates 0193 after 0192 as an expand step that keeps 0130's verifier and gives the erasure login nothing, and documents it", async () => {
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((entry) => entry.name);
    // The chain head: one table and six functions, their owner set by one reviewed DO block.
    expect(names.slice(-2)).toEqual(["0192_registration_country_read.sql", "0193_public_debate_upvotes.sql"]);
    const [previous, step] = plan.forwardChain.slice(-2) as [ChainStep, ChainStep];
    expect(JSON.parse((await bytesOf("lineage/public-debate-upvotes-forward0193.json")).toString("utf8"))).toEqual({
      version: "public-debate-upvotes-forward0193-v1",
      baseRecipeSha256: plan.recipeSha256,
      previous: { name: "0192_registration_country_read.sql", manifestSha256: sha256(await bytesOf("lineage/registration-country-read-forward0192.json")), verifierSha256: previous.verifierSha256 },
      migration: { name: "0193_public_debate_upvotes.sql", sha256: sha256(await bytesOf("0193_public_debate_upvotes.sql")) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: sha256(await bytesOf("lineage/verify-effective-capabilities-130.sql")) },
      amendsPostconditionsOf: []
    });
    expect(step.manifestSha256).toBe(sha256(await bytesOf("lineage/public-debate-upvotes-forward0193.json")));
    expect(step.previousName).toBe(previous.name);
    expect(step.previousManifestSha256).toBe(previous.manifestSha256);
    expect(step.previousVerifierSha256).toBe(previous.verifierSha256);
    expect(step.verifierPath).toBe("lineage/verify-effective-capabilities-130.sql");
    expect(step.n1).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect(step.replayVerifierSql).toBeUndefined();
    expect(step.amendsPostconditionsOf ?? []).toEqual([]);
    // One new table, its index, six new functions, their owner, their revokes and their six grants; nothing earlier
    // replaced, nothing of billing. (The truncate guard is a SELECT, and each REVOKE's role list is on its second line.)
    const statements = step.sql.split("\n").filter((line) => line.trim() !== "" && !line.startsWith("--")).join("\n");
    expect(statements.match(/^(?:CREATE|ALTER|REVOKE|GRANT|DROP|INSERT|UPDATE|DELETE|DO)\b.*$/gmu)).toEqual([
      "CREATE TABLE IF NOT EXISTS identity.public_debate_upvote (",
      "CREATE INDEX IF NOT EXISTS public_debate_upvote_owner ON identity.public_debate_upvote (owner_ref, created_at);",
      "CREATE OR REPLACE FUNCTION identity.cast_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb",
      "CREATE OR REPLACE FUNCTION identity.withdraw_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb",
      "CREATE OR REPLACE FUNCTION identity.read_own_public_debate_upvotes(p_owner_ref uuid, p_publication_refs uuid[]) RETURNS uuid[]",
      "CREATE OR REPLACE FUNCTION identity.read_public_debate_upvote_counts(p_publication_refs uuid[]) RETURNS jsonb",
      "CREATE OR REPLACE FUNCTION identity.read_data_export_public_debate_upvotes(p_export_id uuid, p_worker uuid) RETURNS jsonb",
      "CREATE OR REPLACE FUNCTION identity.delete_gone_public_debate_upvotes(p_limit integer) RETURNS integer",
      "DO $public_debate_upvotes_owner$",
      "REVOKE ALL ON identity.public_debate_upvote",
      "REVOKE ALL ON FUNCTION identity.cast_public_debate_upvote(uuid,uuid)",
      "REVOKE ALL ON FUNCTION identity.withdraw_public_debate_upvote(uuid,uuid)",
      "REVOKE ALL ON FUNCTION identity.read_own_public_debate_upvotes(uuid,uuid[])",
      "REVOKE ALL ON FUNCTION identity.read_public_debate_upvote_counts(uuid[])",
      "REVOKE ALL ON FUNCTION identity.read_data_export_public_debate_upvotes(uuid,uuid)",
      "REVOKE ALL ON FUNCTION identity.delete_gone_public_debate_upvotes(integer)",
      "GRANT EXECUTE ON FUNCTION identity.cast_public_debate_upvote(uuid,uuid) TO debateai_billing_runtime;",
      "GRANT EXECUTE ON FUNCTION identity.withdraw_public_debate_upvote(uuid,uuid) TO debateai_billing_runtime;",
      "GRANT EXECUTE ON FUNCTION identity.read_own_public_debate_upvotes(uuid,uuid[]) TO debateai_billing_runtime;",
      "GRANT EXECUTE ON FUNCTION identity.read_public_debate_upvote_counts(uuid[]) TO debateai_rls_all_accounts;",
      "GRANT EXECUTE ON FUNCTION identity.delete_gone_public_debate_upvotes(integer) TO debateai_rls_all_accounts;",
      "GRANT EXECUTE ON FUNCTION identity.read_data_export_public_debate_upvotes(uuid,uuid) TO debateai_data_export_worker;",
      "DO $public_debate_upvotes_contract$"
    ]);
    expect(statements).not.toMatch(/\bbilling\./u);
    // The erasure login gains nothing: the release before counts the functions it may run at its start.
    expect(statements).not.toMatch(/\bTO\b[^;]*\bdebateai_erasure_runtime\b/u);
    const earlier = (await readdir(MIGRATIONS)).filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name < step.name);
    for (const name of earlier) expect((await bytesOf(name)).toString("utf8"), name).not.toContain("public_debate_upvote");
    const lines = step.sql.split("\n");
    const reviewed = lines.findIndex((line) => line.startsWith("-- n1: reviewed "));
    expect(lines.filter((line) => line.startsWith("-- n1: reviewed "))).toHaveLength(1);
    expect(lines[reviewed + 1]).toBe("DO $public_debate_upvotes_owner$");
    const loader = await readFile(new URL("migration-forward0193.ts", DB_SOURCE), "utf8");
    const signatures = ["identity.cast_public_debate_upvote(uuid,uuid)", "identity.withdraw_public_debate_upvote(uuid,uuid)",
      "identity.read_own_public_debate_upvotes(uuid,uuid[])", "identity.read_public_debate_upvote_counts(uuid[])",
      "identity.read_data_export_public_debate_upvotes(uuid,uuid)", "identity.delete_gone_public_debate_upvotes(integer)"];
    for (const signature of signatures) expect(loader).toContain(`"${signature}"`);
    expect(loader).toContain('const TABLES: readonly string[] = ["identity.public_debate_upvote"];');
    const readme = (await bytesOf("lineage/README.md")).toString("utf8");
    const section = readme.slice(readme.indexOf("## Upvotes on public debates (0193)"));
    expect(section.startsWith("## Upvotes on public debates (0193)")).toBe(true);
    for (const needle of ["0192", "0193_public_debate_upvotes.sql", "public-debate-upvotes-forward0193.json", "packages/db/src/migration-forward0193.ts",
      "MIGRATION_FORWARD0193_", "`STEPS`", "-- n1: expand", "-- n1: keeps-verifier", "-- n1: reviewed", "verify-effective-capabilities-130.sql", "replayVerifierSql",
      "previous.manifestSha256", "migration.sha256", "renumber", "identity.public_debate_upvote", ...signatures, "ON DELETE CASCADE",
      "REQUEST_OWNER_MISMATCH", "PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID", "PUBLIC_DEBATE_UPVOTES_OWNER_UNABLE", "NOT_PUBLIC", "core.run_is_published",
      "core.publication_is_current", "identity.public_review_held", "debateai_billing_runtime", "debateai_rls_all_accounts", "debateai_data_export_worker",
      "debateai_erasure_runtime", "tests/architecture/public-debate-upvotes-0193-contract.test.ts", "tests/integration/public-debate-upvotes-0193.test.ts"
    ]) expect(section, needle).toContain(needle);
    expect(readme.replace(/\s+/gu, " ")).toContain(
      "(0192, below) the eighty-second, and upvotes on public debates (0193, below) the eighty-third");
  });
```

- [ ] **Step 4: Run the chain test and see only the new case fail**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/architecture/migration-forward-chain.test.ts`

Expected: `Tests  1 failed | 68 passed (69)`. The one failure is the new 0193 case, on `names.slice(-2)`. 0192's
rewritten case passes. (The untouched file gives `68 passed (68)`.)

- [ ] **Step 5: Write the SQL**

Create `migrations/0193_public_debate_upvotes.sql` by copying the block below out of this task file with one
command. Do not retype it: 272 long lines typed by hand end in a digest hunt. The block is lines 541 to 812 of this
file (the line after the opening code fence to the line before the closing one).

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools sh -c "sed -n '541,812p' docs/superpowers/plans/2026-11-26-public-debate-upvotes/T01-database-step-0193.md > migrations/0193_public_debate_upvotes.sql"`

Step 6 checks the copy. The block stays here for reading. Do not reflow, re-indent or reword the file afterwards:
the tests of steps 1 and 3 pin its statements, and the comment lines that start with `-- n1:` are parsed.

```sql
-- 0193 · Upvotes on public debates (migrations/lineage/README.md "Upvotes on public debates (0193)").
--
-- Plain words. A signed-in account can upvote a debate that is public now, once; pressing again takes the vote back. Each
-- public row shows how many accounts upvoted it. Who upvoted is never shown: no reader here returns another account's vote.
--
--   identity.public_debate_upvote   one row per (publication, account). No counter and no log: the count is counted when
--                                   it is read, and taking a vote back deletes its row. The account link deletes with the
--                                   account (0110's identity.finalize_account_erasure deletes the identity."user" row).
--
-- The API's three functions on its request login, for debateai_billing_runtime alone (the API's own role, as 0162's; never
-- the runtime role the runner and the scheduler share). Each asks identity.request_owner_matches first, so only the
-- account's own request (or a system login) casts, withdraws or reads its votes: 42501 REQUEST_OWNER_MISMATCH otherwise.
--   identity.cast_public_debate_upvote(owner, publication)       {outcome, upvotes}: CAST or ALREADY with the page's count,
--                                                                or NOT_PUBLIC with a null count (0150's rule: the debate's
--                                                                latest visibility event is PUBLISHED under this very link
--                                                                and no review holds it).
--   identity.withdraw_public_debate_upvote(owner, publication)   {outcome, upvotes}: WITHDRAWN or NONE. It asks nothing of
--                                                                the page before it deletes: a person may always take their
--                                                                own vote back. The count is null when the page is not
--                                                                public now.
--   identity.read_own_public_debate_upvotes(owner, publications) which of at most 100 publications the account upvoted.
-- For the cross-account marker alone (the API's system login, never a request login):
--   identity.read_public_debate_upvote_counts(publications)      [{publication_ref, upvotes}] for those public now (the
--                                                                public list's read, site X10).
--   identity.delete_gone_public_debate_upvotes(limit)            deletes at most limit votes of pages that can never be
--                                                                public again, and returns how many it deleted.
-- The account's export, for the export worker alone, behind 0128's lease gate:
--   identity.read_data_export_public_debate_upvotes(export, worker)
--
-- Gone for good, and held. A page is its debate's current publication while the debate's latest visibility event is
-- PUBLISHED under this very link (0171's core.publication_is_current). The owner's unpublish (0085), the end-of-debate
-- check's takedown (0190) and an account closing that removes its public debates (0110) each write a PRIVATE event under
-- that link, and every publish writes its PUBLISHED event under a new link (the snapshot's primary key), so a link that
-- has stopped being current never becomes current again. The sweep deletes the votes of such links only. A staff hold
-- (0150's HIDE) writes a review event and no visibility event: a held page is still current, the sweep never touches it,
-- and its votes count again when the hold is lifted (REPUBLISH).
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new table and six new functions, which the release before never reads, writes or
--                   calls; no earlier table, function, trigger or grant changes, and the erasure login gains nothing.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule: no request role can SELECT this table.
--
-- Replay-safe in the repository's form: CREATE TABLE / INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION of names no earlier
-- migration defines, and core.install_truncate_guard (idempotent, 0056).

-- 1. The votes ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.public_debate_upvote (
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (publication_ref, owner_ref)
);
-- The account's cascade and its export find its rows by this; the count and the one-vote rule use the primary key.
CREATE INDEX IF NOT EXISTS public_debate_upvote_owner ON identity.public_debate_upvote (owner_ref, created_at);
SELECT core.install_truncate_guard('identity.public_debate_upvote');

-- 2. The API's functions (debateai_billing_runtime, the request login inside the account's own request) -------------------
CREATE OR REPLACE FUNCTION identity.cast_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_written integer;
BEGIN
  IF p_owner_ref IS NULL OR p_publication_ref IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'; END IF;
  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity."user" AS account WHERE account.owner_ref = p_owner_ref AND account.state = 'active') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID';
  END IF;
  IF NOT core.run_is_published(core.run_of_publication(p_publication_ref), p_publication_ref) THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'NOT_PUBLIC', 'upvotes', NULL::integer);
  END IF;
  INSERT INTO identity.public_debate_upvote (publication_ref, owner_ref) VALUES (p_publication_ref, p_owner_ref)
  ON CONFLICT (publication_ref, owner_ref) DO NOTHING;
  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN pg_catalog.jsonb_build_object('outcome', CASE WHEN v_written = 1 THEN 'CAST' ELSE 'ALREADY' END,
    'upvotes', (SELECT pg_catalog.count(*)::integer FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = p_publication_ref));
END
$$;

CREATE OR REPLACE FUNCTION identity.withdraw_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_deleted integer;
BEGIN
  IF p_owner_ref IS NULL OR p_publication_ref IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'; END IF;
  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;
  DELETE FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = p_publication_ref AND vote.owner_ref = p_owner_ref;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN pg_catalog.jsonb_build_object('outcome', CASE WHEN v_deleted = 1 THEN 'WITHDRAWN' ELSE 'NONE' END,
    'upvotes', CASE WHEN core.run_is_published(core.run_of_publication(p_publication_ref), p_publication_ref)
      THEN (SELECT pg_catalog.count(*)::integer FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = p_publication_ref) END);
END
$$;

CREATE OR REPLACE FUNCTION identity.read_own_public_debate_upvotes(p_owner_ref uuid, p_publication_refs uuid[]) RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_owner_ref IS NULL OR p_publication_refs IS NULL OR COALESCE(pg_catalog.cardinality(p_publication_refs), 0) > 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID';
  END IF;
  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;
  RETURN COALESCE((SELECT pg_catalog.array_agg(vote.publication_ref ORDER BY vote.publication_ref) FROM identity.public_debate_upvote AS vote
    WHERE vote.owner_ref = p_owner_ref AND vote.publication_ref = ANY (p_publication_refs)), ARRAY[]::uuid[]);
END
$$;

-- 3. The count (the cross-account marker: the public list's read on the API's system login) ---------------------------------
-- One entry per asked publication that is public now, with how many accounts upvoted it (0 when none). The same answer for
-- every caller; it names no account.
CREATE OR REPLACE FUNCTION identity.read_public_debate_upvote_counts(p_publication_refs uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_publication_refs IS NULL OR COALESCE(pg_catalog.cardinality(p_publication_refs), 0) > 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID';
  END IF;
  RETURN COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('publication_ref', asked.ref,
      'upvotes', (SELECT pg_catalog.count(*)::integer FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = asked.ref)) ORDER BY asked.ref)
    FROM (SELECT DISTINCT ref FROM pg_catalog.unnest(p_publication_refs) AS listed(ref) WHERE ref IS NOT NULL) AS asked
    WHERE core.run_is_published(core.run_of_publication(asked.ref), asked.ref)), '[]'::jsonb);
END
$$;

-- 4. The export reader ----------------------------------------------------------------------------------------------------
-- The leased export's account (0128's gate refuses a wrong worker or lease): every vote of the account, whatever its page's
-- state, oldest first, and an empty list when there is none.
CREATE OR REPLACE FUNCTION identity.read_data_export_public_debate_upvotes(p_export_id uuid, p_worker uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_user uuid;
  v_owner_ref uuid;
BEGIN
  v_user := identity.data_export_lease_user(p_export_id, p_worker);
  SELECT identity_user.owner_ref INTO v_owner_ref FROM identity."user" AS identity_user WHERE identity_user.user_id = v_user;
  RETURN COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('publication_ref', vote.publication_ref, 'created_at', vote.created_at)
      ORDER BY vote.created_at, vote.publication_ref)
    FROM identity.public_debate_upvote AS vote WHERE vote.owner_ref = v_owner_ref), '[]'::jsonb);
END
$$;

-- 5. The sweep (the cross-account marker: an existing timer of the API, on its system login outside any request) ------------
-- Deletes at most p_limit (1..1000) votes whose page is no longer its debate's current publication, and returns how many.
-- It takes no owner and decides from the rows alone. A held page is still current, so its votes stay. A vote another
-- transaction holds (its own withdraw, its account's closing) is skipped and left for the next pass.
CREATE OR REPLACE FUNCTION identity.delete_gone_public_debate_upvotes(p_limit integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_deleted integer;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'; END IF;
  WITH gone AS MATERIALIZED (
    SELECT candidate.publication_ref, candidate.owner_ref FROM identity.public_debate_upvote AS candidate
    WHERE candidate.publication_ref IN (
      SELECT page.publication_ref FROM (SELECT DISTINCT listed.publication_ref FROM identity.public_debate_upvote AS listed) AS page
      WHERE NOT core.publication_is_current(page.publication_ref))
    ORDER BY candidate.publication_ref, candidate.owner_ref
    LIMIT p_limit
    FOR UPDATE OF candidate SKIP LOCKED
  )
  DELETE FROM identity.public_debate_upvote AS vote USING gone
  WHERE vote.publication_ref = gone.publication_ref AND vote.owner_ref = gone.owner_ref;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;

-- 6. One owner, then the grants -------------------------------------------------------------------------------------------
-- 0115's export owner, as 0162's table and functions: it owns identity.request_owner_matches and 0128's lease gate, and the
-- step refuses to apply where it could not ask whether a page is public or still current.
-- n1: reviewed gives only the new table and the six new functions 0115's export owner and checks what that owner may call; touches no earlier object
DO $public_debate_upvotes_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO STRICT v_owner FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE identity.public_debate_upvote OWNER TO %I', v_owner);
  FOREACH v_name IN ARRAY ARRAY[
    'identity.cast_public_debate_upvote(uuid,uuid)',
    'identity.withdraw_public_debate_upvote(uuid,uuid)',
    'identity.read_own_public_debate_upvotes(uuid,uuid[])',
    'identity.read_public_debate_upvote_counts(uuid[])',
    'identity.read_data_export_public_debate_upvotes(uuid,uuid)',
    'identity.delete_gone_public_debate_upvotes(integer)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
  IF NOT pg_catalog.has_function_privilege(v_owner, 'identity.request_owner_matches(uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'core.run_is_published(uuid,uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'core.run_of_publication(uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'core.publication_is_current(uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'identity.data_export_lease_user(uuid,uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_table_privilege(v_owner, 'identity."user"', 'SELECT') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='PUBLIC_DEBATE_UPVOTES_OWNER_UNABLE';
  END IF;
END
$public_debate_upvotes_owner$;

-- No role reads or writes the table directly: every access goes through the functions above.
REVOKE ALL ON identity.public_debate_upvote
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.cast_public_debate_upvote(uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.withdraw_public_debate_upvote(uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.read_own_public_debate_upvotes(uuid,uuid[])
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.read_public_debate_upvote_counts(uuid[])
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.read_data_export_public_debate_upvotes(uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.delete_gone_public_debate_upvotes(integer)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
-- The API's vote routes and its "which have I upvoted" read, on its request login inside the account's own request.
GRANT EXECUTE ON FUNCTION identity.cast_public_debate_upvote(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.withdraw_public_debate_upvote(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_own_public_debate_upvotes(uuid,uuid[]) TO debateai_billing_runtime;
-- The public list's read (site X10) and the sweep, on the API's system login, as 0190 gave the marker its two.
GRANT EXECUTE ON FUNCTION identity.read_public_debate_upvote_counts(uuid[]) TO debateai_rls_all_accounts;
GRANT EXECUTE ON FUNCTION identity.delete_gone_public_debate_upvotes(integer) TO debateai_rls_all_accounts;
-- The account's export, behind 0128's lease gate.
GRANT EXECUTE ON FUNCTION identity.read_data_export_public_debate_upvotes(uuid,uuid) TO debateai_data_export_worker;

-- 7. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0162 §5's shape) ------------------------------------------
DO $public_debate_upvotes_contract$
DECLARE
  v_owner oid;
  v_table regclass := pg_catalog.to_regclass('identity.public_debate_upvote');
  v_name text;
  v_role text;
BEGIN
  SELECT p.proowner INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  IF v_table IS NULL
    OR (SELECT c.relowner FROM pg_catalog.pg_class AS c WHERE c.oid = v_table) IS DISTINCT FROM v_owner
    OR (SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c WHERE c.oid = v_table)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = v_table AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = v_table AND k.contype = 'f'
      AND k.confrelid = 'identity."user"'::regclass AND k.confdeltype = 'c')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = v_table AND k.contype = 'f'
      AND k.confrelid = 'serve.publication_snapshot'::regclass AND k.confdeltype = 'a')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = v_table AND k.contype = 'p') THEN
    RAISE EXCEPTION 'PUBLIC_DEBATE_UPVOTES_CONTRACT table';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker', 'debateai_rls_all_accounts'] LOOP
    IF pg_catalog.has_table_privilege(v_role, v_table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'PUBLIC_DEBATE_UPVOTES_CONTRACT table privilege %', v_role;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.cast_public_debate_upvote(uuid,uuid)', 'identity.withdraw_public_debate_upvote(uuid,uuid)',
    'identity.read_own_public_debate_upvotes(uuid,uuid[])', 'identity.read_public_debate_upvote_counts(uuid[])',
    'identity.read_data_export_public_debate_upvotes(uuid,uuid)', 'identity.delete_gone_public_debate_upvotes(integer)'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proowner = v_owner AND p.proconfig = '{search_path=pg_catalog}'::text[]) THEN
      RAISE EXCEPTION 'PUBLIC_DEBATE_UPVOTES_CONTRACT definers %', v_name;
    END IF;
    -- Exactly one of the seven roles may call each: the export worker the reader, the marker the count and the sweep, the API's role the rest.
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker', 'debateai_rls_all_accounts'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_name, 'EXECUTE') IS DISTINCT FROM (v_role = CASE v_name
          WHEN 'identity.read_data_export_public_debate_upvotes(uuid,uuid)' THEN 'debateai_data_export_worker'
          WHEN 'identity.read_public_debate_upvote_counts(uuid[])' THEN 'debateai_rls_all_accounts'
          WHEN 'identity.delete_gone_public_debate_upvotes(integer)' THEN 'debateai_rls_all_accounts'
          ELSE 'debateai_billing_runtime' END) THEN
        RAISE EXCEPTION 'PUBLIC_DEBATE_UPVOTES_CONTRACT privileges % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
END
$public_debate_upvotes_contract$;
```

How this text was checked while the plan was written (26 Nov 2026, on a throwaway embedded PostgreSQL 18 started with
the flags of `tests/support/testDatabase.ts:178-203` and migrated through 0192 by the repo's own `migrate()`):
- It applied twice in a row (replay). Every function came out a definer with `{search_path=pg_catalog}`, owned by
  the export owner, its ACL the owner plus its one grantee. The table's ACL was the owner alone, row security off,
  trigger `reject_truncate` present. The erasure login's function count stayed 42.
- `auditMigrationReplaySafety` and `auditMigrationN1Compatibility` returned `[]`; without the reviewed line the N-1
  audit returned exactly `N1_DYNAMIC_SQL`. The eight SQL-reading cases of step 1 (C-H, C-A, C-O, C-F, C-V, C-Q, C-S,
  C-G) passed against it.
- On made-up rows, called as the cluster's superuser: `CAST` 1, `ALREADY` 1, a second account `CAST` 2; an unknown
  page and a held page `NOT_PUBLIC` with `upvotes` null; a suspended account `PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID`;
  withdraw on a public page `WITHDRAWN` with the new count then `NONE`; withdraw on an unpublished page `WITHDRAWN`
  with null. The sweep left a held page's votes, deleted an unpublished page's, returned 0 on the next pass, deleted a
  held-then-unpublished page's in batches of 1, skipped a row another transaction had locked, and refused limits 0,
  1001 and null. After `REPUBLISH` the held page counted again. `TRUNCATE` was refused.
- A login holding only `debateai_billing_runtime` and no session got `REQUEST_OWNER_MISMATCH` from the three request
  functions and "permission denied" from the count, the sweep, the export reader and the table.
- NOT checked: a real request login presenting a live session (T02's integration test); the step applied through the
  chain by `migrate()` (the two database rows of step 13 do that); a database where the export owner is not also the owner of
  `core.run_is_published` and `core.publication_is_current` (on the embedded cluster both are `debateai`; the step
  raises `PUBLIC_DEBATE_UPVOTES_OWNER_UNABLE` where that owner could not call them).

- [ ] **Step 6: Check the copy**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools shasum -a 256 migrations/0193_public_debate_upvotes.sql`

Expected: `3604f800b6efb74f9e67697daa85e2b933641377ce8a2585983a5fcb61e53ac5`, and `wc -l` gives 272. A different digest
means the copy took the wrong lines (this task file was edited after its line numbers were written) or a character
changed (a lost trailing newline, a changed dash, a tab). The first line of the file is
`-- 0193 · Upvotes on public debates (…)` and the last is `$public_debate_upvotes_contract$;`. Compare with the block
above and fix the file, so that what is applied is what was checked. This digest is a copy check only; no test holds it.

- [ ] **Step 7: Write the manifest**

Run (it writes `migrations/lineage/public-debate-upvotes-forward0193.json` with all digests taken from the files, in
the two-space form with one trailing newline that C-M pins, and prints it):

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node -e 'const fs=require("node:fs"),h=p=>require("node:crypto").createHash("sha256").update(fs.readFileSync(p)).digest("hex"),L="migrations/lineage/",v=h(L+"verify-effective-capabilities-130.sql"),out=L+"public-debate-upvotes-forward0193.json";fs.writeFileSync(out,JSON.stringify({version:"public-debate-upvotes-forward0193-v1",baseRecipeSha256:h(L+"auth-dev-20261006.json"),previous:{name:"0192_registration_country_read.sql",manifestSha256:h(L+"registration-country-read-forward0192.json"),verifierSha256:v},migration:{name:"0193_public_debate_upvotes.sql",sha256:h("migrations/0193_public_debate_upvotes.sql")},verifier:{path:"lineage/verify-effective-capabilities-130.sql",sha256:v},amendsPostconditionsOf:[]},null,2)+"\n");console.log(fs.readFileSync(out,"utf8"))'
```

Expected output (the `migration.sha256` is the digest of step 6):

```json
{
  "version": "public-debate-upvotes-forward0193-v1",
  "baseRecipeSha256": "3ad4ca844799fa0e498124250dba11683d0e305a2e3571468809ec5a6cec45c2",
  "previous": {
    "name": "0192_registration_country_read.sql",
    "manifestSha256": "891dedf72e8299e5d49aa9c421304fa897f484b27db1fff44fe334bfd92216b0",
    "verifierSha256": "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57"
  },
  "migration": {
    "name": "0193_public_debate_upvotes.sql",
    "sha256": "3604f800b6efb74f9e67697daa85e2b933641377ce8a2585983a5fcb61e53ac5"
  },
  "verifier": {
    "path": "lineage/verify-effective-capabilities-130.sql",
    "sha256": "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57"
  },
  "amendsPostconditionsOf": []
}
```

If `previous.manifestSha256` prints anything else, `dev` moved under you: stop and report it (the step would have to
be renumbered). Never reformat this file by hand; the next step of the chain binds to its raw bytes.

- [ ] **Step 8: Write the loader**

Create `packages/db/src/migration-forward0193.ts` as a copy of `packages/db/src/migration-forward0188.ts` (all 107
lines) with only these changes:
- the doc comment: 0193, upvotes on public debates (expand; README "Upvotes on public debates (0193)"); one table and
  six functions; no earlier object changed; it keeps 0130's verifier, amends no earlier step and carries no verifier
  of its own;
- `const NAME = "0193_public_debate_upvotes.sql";`
- `const VERSION = "public-debate-upvotes-forward0193-v1";`
- `const MANIFEST_PATH = "lineage/public-debate-upvotes-forward0193.json";`
- `const PREVIOUS = "0192_registration_country_read.sql";`
- `const TABLES: readonly string[] = ["identity.public_debate_upvote"];` (on one line, exactly)
- `FUNCTIONS`, in this order:

```ts
const FUNCTIONS: readonly string[] = [
  "identity.cast_public_debate_upvote(uuid,uuid)",
  "identity.withdraw_public_debate_upvote(uuid,uuid)",
  "identity.read_own_public_debate_upvotes(uuid,uuid[])",
  "identity.read_public_debate_upvote_counts(uuid[])",
  "identity.read_data_export_public_debate_upvotes(uuid,uuid)",
  "identity.delete_gone_public_debate_upvotes(integer)"
];
```

- the refusal prefix `MIGRATION_FORWARD0193_` (no `MIGRATION_FORWARD0188_` may remain; C-T refuses any other number);
- `export async function loadForward0193(anchor: ForwardStepAnchor): Promise<ForwardStepPlan>`.

Keep `VERIFIER_PATH`, `AMENDS`, `sha`, `exactKeys`, `digest`, `postconditionEvidence` (both queries) and the body of
the load function as they are. Fix the two JSDoc counts ("twenty-six functions", "four tables") to six and one.

- [ ] **Step 9: Register the loader in the chain** (closed list: `STEPS`, `packages/db/src/migration-forward-chain.ts:203`)

- After line 86 (`import { loadForward0192 } from './migration-forward0192.js';`) add:
  `import { loadForward0193 } from './migration-forward0193.js';`
- On line 203 the literal ends `…,loadForward0191,loadForward0192]);`. Make it end
  `…,loadForward0191,loadForward0192,loadForward0193]);` (no space after the comma;
  `tests/architecture/migration-forward-chain.test.ts:110-113` compares the literal).
- On line 200 the doc comment ends `sign-up country read for prices (0192, expand: one function of the API's billing role).`
  Replace that full stop with:
  `, then upvotes on public debates (0193, expand: one table and six functions; the API's billing role casts, withdraws and reads its own, the cross-account marker counts and sweeps, the export worker reads).`
  wrapped as ` * ` comment lines of the block's width. Line 201 (`A new step appends its loader here (README).`) stays.

- [ ] **Step 10: Add the step to the tests' list** (closed list: `STEPS`, `tests/support/forward-chain-steps.ts:17-100`)

Line 99 is `  ["0192_registration_country_read.sql", "expand"]`. Add a comma to it and this line after it:

```ts
  ["0193_public_debate_upvotes.sql", "expand"]
```

- [ ] **Step 11: Document the step in `migrations/lineage/README.md`**

Three edits.
1. Line 13, the one long sentence. It ends
   `…and the sign-up country read for prices (0192, below) the eighty-second. A step is added with new files only;`.
   Insert `, and upvotes on public debates (0193, below) the eighty-third` between `the eighty-second` and the full
   stop. Change nothing else on that line: earlier clauses are pinned byte for byte by other cases.
2. Lines 17-19. Change `(after 0192: 0192,` to `(after 0193: 0193,`, the file name
   `` `registration-country-read-forward0192.json` `` to `` `public-debate-upvotes-forward0193.json` ``, and
   `0131 to 0192 keep 0130's` to `0131 to 0193 keep 0130's`.
3. A new last section, after line 1789, headed exactly `## Upvotes on public debates (0193)`, in the shape of 0192's
   section (`:1750-1789`). Its prose is yours; it must say these things, and step 3's case looks for each quoted
   string in it:
   - First sentence: `The eighty-third chain step, after the sign-up country read for prices (0192).` Then, in two or
     three sentences, what an upvote is: one per account per public debate, pressing again takes it back, each public
     row shows the count, nobody is shown who voted.
   - The files: `0193_public_debate_upvotes.sql`, `public-debate-upvotes-forward0193.json`,
     `packages/db/src/migration-forward0193.ts` (`loadForward0193`, appended last to `` `STEPS` ``,
     `MIGRATION_FORWARD0193_*` refusals).
   - The table `identity.public_debate_upvote`: its three columns, the primary key as the one-vote rule, the account
     key `ON DELETE CASCADE` (the votes go when 0110's finalize deletes the account row, at the end of the closure
     grace period), the page key with no delete rule because a snapshot row is never deleted, the truncate guard, no
     row security, no right for any role, owned by 0115's export owner (`PUBLIC_DEBATE_UPVOTES_OWNER_UNABLE` where
     that owner could not ask what the functions ask).
   - The three request functions, each with its signature, for `debateai_billing_runtime` alone, each refusing
     `REQUEST_OWNER_MISMATCH` unless the connection is the account's own; cast's `NOT_PUBLIC` and
     `PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID`; that cast and withdraw answer the fresh count themselves; that "public
     now" is `core.run_is_published`, the list's rule; that withdraw works whatever the page's state.
   - The two marker functions, for `debateai_rls_all_accounts` alone: the count
     (`identity.read_public_debate_upvote_counts(uuid[])`, pages public now only, the same for every caller) and the
     sweep (`identity.delete_gone_public_debate_upvotes(integer)`): it deletes the votes of a page that is no longer
     its debate's current publication (`core.publication_is_current`), in batches of at most 1000; a page under a
     staff hold (`identity.public_review_held`) is still current and is never swept, and its votes count again when the
     hold is lifted.
   - The export reader `identity.read_data_export_public_debate_upvotes(uuid,uuid)`, for `debateai_data_export_worker`
     alone, behind 0128's lease gate.
   - That `debateai_erasure_runtime` gains nothing.
   - Where it is tested: `tests/architecture/public-debate-upvotes-0193-contract.test.ts` (the text) and
     `tests/integration/public-debate-upvotes-0193.test.ts` (real rows on the dev and the production logins).
   - The header paragraph, as 0192's: `-- n1: expand` and `-- n1: keeps-verifier`; one table and six functions the
     release before never reads or calls; no billing relation or function, so the manifest names 0130's verifier
     (`verify-effective-capabilities-130.sql`) as both `previous.verifierSha256` and its own; one statement carries a
     `-- n1: reviewed <reason>` line, the `DO` block that sets the owner; it amends no earlier step and has no
     `replayVerifierSql`; its check is its postcondition digest (the table and the six functions, each whole).
   - That the step can stay applied if the site goes back to the release before.
   - The closing paragraph, as 0192's: its `previous` is 0192, so `previous.manifestSha256` is the SHA-256 of
     `registration-country-read-forward0192.json`; after an SQL edit recompute `migration.sha256` (the one-liner of
     0184's section, with this step's manifest); if `origin/dev` takes 0193 first, renumber this step.

- [ ] **Step 12: Run the two tests and see them pass**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/architecture/public-debate-upvotes-0193-contract.test.ts`
Expected: `Tests  11 passed (11)`.

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/architecture/migration-forward-chain.test.ts`
Expected: `Tests  69 passed (69)`.

If a case fails on the SQL's text, the file differs from step 5's block: fix the file, rerun step 7, rerun. Do not
loosen an assertion.

- [ ] **Step 13: Verify the task**

Each command with the prefix
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`:

| Command | Expected |
|---|---|
| `pnpm exec vitest run tests/architecture/migration-n1-audit.test.ts` | `Tests  13 passed (13)`, as before |
| `pnpm exec vitest run tests/architecture/scaffold.test.ts` | `Tests  1 failed \| 28 passed (29)`, as before; the one failure is "dev's F31 debt: apps/api, apps/runner and apps/scheduler declare their obs-capture edge" |
| `pnpm exec vitest run tests/architecture/security-migration-0065.test.ts` | `Tests  17 passed (17)`, as before (it migrates a real database through 0193: the truncate guard, the search path, `IF NOT EXISTS`) |
| `pnpm exec vitest run tests/integration/migration-per-step.test.ts` | `Tests  6 passed (6)`, as before (about a minute; it applies every step in its own transaction and re-measures each postcondition) |
| `pnpm exec vitest run tests/architecture/p3-production-database-principals.test.ts` | `Tests  27 passed (27)`, as before (T02 adds the 0193 entries) |
| `pnpm run typecheck` | exit 0 |
| `git status --short` | exactly the eight paths of step 14, four `??` and four ` M` (plus whatever the plan and design folders already show) |

Known red after this task, not to be fixed here (see Traps): `tests/unit/s1-1-depth-contract.test.ts` (one unlisted
shipped file, T15), the inventory case of `tests/integration/identity-database.test.ts` (one extra table, T02) and
the census case of `tests/integration/security-review-hardening-database.test.ts` (three unnamed functions, T02).

- [ ] **Step 14: Commit**

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add migrations/0193_public_debate_upvotes.sql migrations/lineage/public-debate-upvotes-forward0193.json migrations/lineage/README.md packages/db/src/migration-forward0193.ts packages/db/src/migration-forward-chain.ts tests/support/forward-chain-steps.ts tests/architecture/migration-forward-chain.test.ts tests/architecture/public-debate-upvotes-0193-contract.test.ts
```

Then commit (the repository's style: one plain sentence saying what is now true):

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "Database step 0193 adds upvotes on public debates: one row per account and page, the API's three functions that ask whose connection it is, the count for the public list, the export reader, and a sweep that deletes the votes of a page that can never be public again and leaves a held page's alone." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

Never `git add -A` or `git add .`. The commit goes to the branch `feat/2026-11-26-public-debate-upvotes` in this
worktree; nothing is pushed. The last `-m` is the attribution line; if your session's instructions give another
one, use theirs.
