import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { CONTENT_CARRIERS } from "../../packages/crypto/src/index.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { auditMigrationReplaySafety } from "../../tools/orphan-audit/src/index.js";

const migration = new URL("../../migrations/0126_publication_review.sql", import.meta.url);
const loader = new URL("../../packages/db/src/migration-forward0126.ts", import.meta.url);
const sql = () => readFile(migration, "utf8");
const newTables = [
  "serve.publication_review_request",
  "serve.publication_review_decision",
  "serve.publication_review_copy",
  "staff.publication_review_event"
];
const newFunctions = [
  "core.enforce_publication_review_answer_run()",
  "core.enforce_erasure_barrier_publication_review_request()",
  "core.enforce_content_attestation_v2_publication_review_decision()",
  "core.enforce_content_ciphertext_publication_review_decision()",
  "core.enforce_erasure_barrier_publication_review_decision()",
  "core.enforce_content_attestation_v2_publication_review_copy()",
  "core.enforce_content_ciphertext_publication_review_copy()",
  "core.enforce_erasure_barrier_publication_review_copy()",
  "serve.ask_publication_review(text,uuid,uuid,uuid,uuid,uuid,integer)",
  "serve.read_publication_review_state(uuid,uuid,uuid)",
  "serve.publication_review_approved(uuid,uuid,integer)",
  "serve.sever_publication_review(uuid)",
  "serve.sever_publication_review_on_secret_delete()",
  "serve.sever_publication_review_on_cleanup_intent()",
  "staff.list_publication_reviews(jsonb,text,integer)",
  "staff.open_publication_review(jsonb,text,uuid,text)",
  "staff.record_publication_review_copy(jsonb,text,uuid,uuid,uuid,integer,jsonb,jsonb,bytea)",
  "staff.decide_publication_review(jsonb,text,uuid,jsonb,uuid,text,jsonb,jsonb,bytea)",
  "serve.publication_review_run_live(uuid)"
];

describe("0126 publication review contract", () => {
  it("0126 is replay-safe in the repository's form", async () => {
    const plan = await loadMigrationPlan();
    const migrateSource = await readFile(new URL("../../packages/db/src/index.ts", import.meta.url), "utf8");
    expect(auditMigrationReplaySafety("migrations/0126_publication_review.sql", await sql(), { plan, migrateSource })).toEqual([]);
  });

  it("0126 creates four private tables and grants debateai_runtime no table privilege", async () => {
    const source = await sql();
    expect([...source.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual(newTables);
    for (const table of newTables) {
      expect(source).toContain(`REVOKE ALL ON ${table} FROM PUBLIC, debateai_runtime`);
      expect(source).not.toMatch(new RegExp(`GRANT [^;]* ON ${table.replace(".", "\\.")} TO debateai_runtime`, "u"));
    }
  });

  it("both review carriers are in CONTENT_CARRIERS", () => {
    expect(CONTENT_CARRIERS).toContain("serve.publication_review_decision");
    expect(CONTENT_CARRIERS).toContain("serve.publication_review_copy");
  });

  it("0126 changes no identity step-up DDL and consumes one PUBLISH grant without a new row lock", async () => {
    let source = await sql();
    for (const forbidden of [
      "step_up_grant_action_check", "FUNCTION identity.rotate_session_after_step_up",
      "FUNCTION identity.valid_consumer_authorization_internal", "ALTER TABLE identity.step_up_grant",
      "ON identity.step_up_grant"
    ]) expect(source, forbidden).not.toContain(forbidden);
    expect(source.match(/UPDATE identity\.step_up_grant/gu)).toHaveLength(1);
    for (const name of ["begin_owned_webauthn", "commit_owner_command"]) {
      const expression = new RegExp(`CREATE OR REPLACE FUNCTION staff\\.${name}\\([\\s\\S]*?END \\$\\$;`, "u");
      const copied = source.match(expression)?.[0];
      expect(copied, name).toBeDefined();
      expect(copied?.match(/CREATE /gu), name).toHaveLength(1);
      source = source.replace(expression, "");
    }
    expect(source).not.toContain("FOR UPDATE");
  });

  it("PUBLICATION_REVIEW enters the capability gates and the copied owner set", async () => {
    const source = await sql();
    for (const name of ["subject_capabilities_check", "staff.valid_capabilities", "staff.authorize_action", "staff.owned_action_allowed", "staff.begin_owned_webauthn"]) {
      expect(source, name).toContain(name);
    }
    const begin = "-- BEGIN staff.commit_owner_command (owner set of 0126; a later migration that changes the owner set copies this block whole)";
    const end = "-- END staff.commit_owner_command";
    expect(source.split(begin)).toHaveLength(2);
    expect(source.split(end)).toHaveLength(2);
    const block = source.slice(source.indexOf(begin), source.indexOf(end) + end.length);
    expect(block.match(/CREATE /gu)).toHaveLength(1);
    expect(block).toContain("ARRAY['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE','PUBLICATION_REVIEW']");
    expect(block).not.toContain("WITH owner AS (");
    expect(source.indexOf("WITH owner AS (")).toBeGreaterThan(source.indexOf("ADD CONSTRAINT subject_capabilities_check"));
    expect(source).toContain("'PUBLICATION_REVIEW_APPROVE','PUBLICATION_REVIEW_REFUSE'");
  });

  it("the two sever triggers follow secret deletion and cleanup intent creation", async () => {
    const source = await sql();
    expect(source).toMatch(/CREATE TRIGGER zz_sever_publication_review\s+AFTER DELETE ON core\.run_content_attestation_secret/gu);
    expect(source).toMatch(/CREATE TRIGGER zz_sever_publication_review\s+AFTER INSERT ON serve\.private_run_key_cleanup_intent/gu);
  });

  it("loadForward0126 pins only the four new tables, nineteen new functions and two sever triggers", async () => {
    const source = (await readFile(loader, "utf8")).replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
    for (const name of [...newTables, ...newFunctions, "zz_sever_publication_review", "core.run_content_attestation_secret", "serve.private_run_key_cleanup_intent"]) {
      expect(source, name).toContain(name);
    }
    for (const shared of [
      "staff.valid_capabilities", "staff.authorize_action", "staff.owned_action_allowed",
      "staff.begin_owned_webauthn", "staff.commit_owner_command", "staff.read_audit_page",
      "subject_capabilities_check"
    ]) expect(source, shared).not.toContain(shared);
    const chain = await readFile(new URL("../../packages/db/src/migration-forward-chain.ts", import.meta.url), "utf8");
    expect(chain).toContain("loadForward0125,loadForward0126,loadForward0127,loadForward0128]");
  });
});

const main = () => readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");

describe("publication review production composition", () => {
  it("joins approved origins to the publish gate and the owner route", async () => {
    const source = await main();
    expect(source).toContain("approvalCovers: input => publicationReviewRepository.approvalCovers(input)");
    expect(source).toContain("publicationReviews: {\n    repository: publicationReviewRepository");
    expect(source).toContain("core.run_private_content_is_live($1) AND NOT serve.run_removed_by_synthesis_check($1)");
    expect(source).toContain("candidate => candidate === origin");
  });

  it("joins the staff window, its origin, and its verdict categories", async () => {
    const source = await main();
    expect(source).toContain("staff: { ...staffHttp, publicationReviews: publicationReviewStaff }");
    expect(source).toContain("version) => version === originVersion)?.categories");
    expect(source).toContain("for (let version = bound; version >= opened.originVersion; version--)");
  });

  it("includes review decisions in the export view", async () => {
    expect(await main()).toContain("new OwnerViewAdapter(ownerDeps, runKeyStore, publicationReviewRepository, claim.sessionId)");
  });
});

describe("publication review write serialization", () => {
  it("serializes copy creation with decisions for the same request", async () => {
    const source = await sql();
    const copy = source.slice(source.indexOf("CREATE OR REPLACE FUNCTION staff.record_publication_review_copy("),
      source.indexOf("ALTER FUNCTION staff.record_publication_review_copy("));
    const lock = "pg_advisory_xact_lock(hashtextextended('publication-review-decide:' || p_review_ref::text, 0))";
    expect(copy).toContain(lock);
    expect(copy.indexOf(lock)).toBeLessThan(copy.indexOf("staff.open_publication_review"));
  });

  it("orders Ask after the run's erasure lock and bars later request inserts", async () => {
    const source = await sql();
    const ask = source.slice(source.indexOf("CREATE OR REPLACE FUNCTION serve.ask_publication_review("),
      source.indexOf("REVOKE ALL ON FUNCTION serve.ask_publication_review("));
    expect(ask).toMatch(/FROM core\.run r WHERE r\.run_id=p_run_id[^;]*FOR SHARE/u);
    expect(ask.indexOf("FOR SHARE")).toBeLessThan(ask.indexOf("publication_review_run_live"));
    expect(source).toContain("CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON serve.publication_review_request");
  });

  it("keeps account closure in the database liveness predicate", async () => {
    const source = await sql();
    const live = source.slice(source.indexOf("CREATE OR REPLACE FUNCTION serve.publication_review_run_live("),
      source.indexOf("REVOKE ALL ON FUNCTION serve.publication_review_run_live("));
    expect(live).toContain("core.run_private_content_is_live(p_run_id)");
  });
});

describe("review copy privacy", () => {
  it("keeps the reading staff identity in the audit, outside the private copy", async () => {
    const source = await sql();
    const copy = source.slice(source.indexOf("CREATE TABLE IF NOT EXISTS serve.publication_review_copy"),
      source.indexOf("SELECT core.install_truncate_guard('serve.publication_review_request')"));
    expect(copy).not.toContain("reader_staff_id");
  });
});
