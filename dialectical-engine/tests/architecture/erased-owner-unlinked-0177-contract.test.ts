// tests/architecture/erased-owner-unlinked-0177-contract.test.ts
// 0177: once an account is erased, nothing kept beside a debate names its owner reference. One drained step: four functions of its own, the mutation
// guard of seven tables swapped for one that allows a single change, and a trigger on the account row. It restates no earlier function.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const NAME = "0177_erased_owner_unlinked.sql";
const SQL = read(`migrations/${NAME}`);
const FUNCTIONS = ["core.reject_mutation_except_erased_owner()", "billing.reject_charge_scope_mutation()",
  "billing.reject_charge_scope_update_except_erased_owner()", "identity.unlink_erased_owner_runs()"];
/** The six tables under the one row guard: the column that holds the reference and what stands before it there. */
const ROW_GUARDED = [["core.run", "asker_id", "owner:"], ["core.run_ownership_event", "owner_ref", ""], ["core.legacy_run_claim", "owner_ref", ""],
  ["memory.question_key", "asker_scope", "owner:"], ["memory.pull_record", "asker_scope", "owner:"], ["memory.memory_link_event", "actor_ref", "asker:owner:"]] as const;
const manifest = JSON.parse(read("migrations/lineage/erased-owner-unlinked-forward0177.json")) as {
  previous: { name: string; manifestSha256: string; verifierSha256: string }; migration: { name: string; sha256: string };
  verifier: { path: string; sha256: string }; amendsPostconditionsOf: unknown };
/** A function's source in the file, from its CREATE to the end of its body. */
const source = (signature: string): string => {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  expect(start, signature).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf("$$;", start));
};

describe("0177: an erased account's owner reference leaves its debates", () => {
  it("comes last in the chain, after 0176, with its own loader, bound to its own bytes and 0176's manifest", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("loadForward0175,loadForward0176,loadForward0177]);");
    expect(chain).toContain("import { loadForward0177 } from './migration-forward0177.js';");
    const loader = read("packages/db/src/migration-forward0177.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "erased-owner-unlinked-forward0177-v1";');
    expect(loader).toContain('const PREVIOUS = "0176_moderation_final_outcome.sql";');
    expect(loader).toContain("throw Error(`MIGRATION_FORWARD0177_${detail}`)");
    for (const signature of FUNCTIONS) expect(loader, signature).toContain(`"${signature}"`);
    expect(manifest.previous.name).toBe("0176_moderation_final_outcome.sql");
    expect(manifest.previous.manifestSha256).toBe(sha256(read("migrations/lineage/moderation-final-outcome-forward0176.json")));
    expect(manifest.migration).toEqual({ name: NAME, sha256: sha256(SQL) });
    expect(manifest.verifier.path).toBe("lineage/verify-effective-capabilities-130.sql");
    expect(manifest.amendsPostconditionsOf).toEqual([]);
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.at(-1)?.name).toBe(NAME);
    expect(parseN1Header(NAME, SQL)).toMatchObject({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false });
  });

  it("defines only functions of its own, each closed to PUBLIC, and restates none of an earlier step", () => {
    const created = [...SQL.matchAll(/^CREATE OR REPLACE FUNCTION ([a-z_.]+\([a-z, ]*\))/gmu)].map((match) => match[1]);
    expect(created.sort()).toEqual([...FUNCTIONS].sort());
    for (const signature of FUNCTIONS) {
      expect(SQL, signature).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`);
      expect(source(signature), signature).toContain("SET search_path = pg_catalog, pg_temp");
      const name = signature.slice(0, signature.indexOf("("));
      for (const earlier of ["0000_s00.sql", "0037_run_ownership.sql", "0084_billing_entitlement.sql", "0110_account_erasure_public_debates.sql"])
        expect(read(`migrations/${earlier}`), `${earlier} ${name}`).not.toContain(name);
    }
    expect(SQL).not.toMatch(/GRANT /u);
    // 0110's erasure functions and 0084's and 0000's guards are called or replaced on a table, never redefined.
    for (const kept of ["identity.finalize_account_erasure", "core.reject_mutation()", "billing.reject_mutation_unless_retention_purge"])
      expect(SQL, kept).not.toContain(`CREATE OR REPLACE FUNCTION ${kept}`);
  });

  it("swaps the row guard of the six core and memory tables under 0000's trigger name, each with its own column and prefix", () => {
    for (const [table, column, prefix] of ROW_GUARDED) {
      expect(SQL, table).toContain(`DROP TRIGGER IF EXISTS reject_mutation ON ${table};\nCREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table}\n`
        + `  FOR EACH ROW EXECUTE FUNCTION core.reject_mutation_except_erased_owner('${column}', '${prefix}');`);
    }
    expect([...SQL.matchAll(/EXECUTE FUNCTION core\.reject_mutation_except_erased_owner\(/gu)]).toHaveLength(ROW_GUARDED.length);
    const guard = source("core.reject_mutation_except_erased_owner()");
    // Without the flag, or for a DELETE: 0000's refusal, word for word.
    expect(guard).toContain("IF TG_OP <> 'UPDATE' OR pg_catalog.current_setting('debateai.erased_owner_unlink', true) IS DISTINCT FROM 'on' THEN\n"
      + "    RAISE EXCEPTION 'append-only or immutable table % rejects %', TG_TABLE_NAME, TG_OP USING ERRCODE = '55000';");
    expect(read("migrations/0000_s00.sql")).toContain("RAISE EXCEPTION 'append-only or immutable table % rejects %', TG_TABLE_NAME, TG_OP");
    // Nothing but the owner column; from a reference no account holds to a version-4 one no account holds.
    expect(guard).toContain("IF (pg_catalog.to_jsonb(NEW) - v_column) IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - v_column) THEN");
    expect(guard).toContain("-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-");
    expect(guard).toContain('IF EXISTS (SELECT 1 FROM identity."user" AS account');
    expect(guard).not.toContain("SECURITY DEFINER");
  });

  it("keeps 0084's rule on the usage row for a DELETE and adds the one UPDATE: the owner reference and the entitlement event id, nothing else", () => {
    expect(SQL).toContain("DROP TRIGGER IF EXISTS reject_mutation ON billing.run_charge_scope;\nCREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON billing.run_charge_scope\n"
      + "  FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_charge_scope_mutation();");
    expect(SQL).toContain("CREATE TRIGGER reject_update_except_erased_owner BEFORE UPDATE ON billing.run_charge_scope\n"
      + "  FOR EACH ROW EXECUTE FUNCTION billing.reject_charge_scope_update_except_erased_owner();");
    const statement = source("billing.reject_charge_scope_mutation()");
    expect(statement).toContain("IF TG_OP = 'DELETE' AND pg_catalog.current_setting('debateai.retention_purge', true) IS NOT DISTINCT FROM 'on' THEN");
    expect(statement).toContain("IF TG_OP = 'UPDATE' AND pg_catalog.current_setting('debateai.erased_owner_unlink', true) IS NOT DISTINCT FROM 'on' THEN");
    expect(statement).toContain("RAISE EXCEPTION 'append-only or immutable table % rejects %', TG_TABLE_NAME, TG_OP USING ERRCODE = '55000';");
    const row = source("billing.reject_charge_scope_update_except_erased_owner()");
    expect(row).toContain("(pg_catalog.to_jsonb(NEW) - 'owner_ref' - 'entitlement_event_id') IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'owner_ref' - 'entitlement_event_id')");
    expect(row).toContain("IF EXISTS (SELECT 1 FROM billing.entitlement_event AS event WHERE event.event_id = NEW.entitlement_event_id) THEN");
    // The other billing tables keep 0084's guard: this step names none of them.
    for (const table of ["billing.customer", "billing.charge", "billing.entitlement_event", "billing.quote", "billing.subscription_event", "legal.acceptance", "legal.account_closure"])
      expect(SQL, table).not.toMatch(new RegExp(`(TRIGGER[^;]* ON|UPDATE|DELETE FROM|INSERT INTO) ${table.replace(".", "\\.")}\\b`, "u"));
  });

  it("runs when the account row is deleted, as the tables' owner, with the flag on for its own duration only", () => {
    expect(SQL).toContain('DROP TRIGGER IF EXISTS unlink_erased_owner_runs ON identity."user";\nCREATE TRIGGER unlink_erased_owner_runs AFTER DELETE ON identity."user"\n'
      + "  FOR EACH ROW EXECUTE FUNCTION identity.unlink_erased_owner_runs();");
    const unlink = source("identity.unlink_erased_owner_runs()");
    expect(unlink).toContain("SECURITY DEFINER\nSET search_path = pg_catalog, pg_temp\nSET debateai.erased_owner_unlink = 'on'");
    // The flag is set nowhere else: not by a session-wide SET, not by set_config.
    expect([...SQL.matchAll(/^SET debateai\.erased_owner_unlink/gmu)]).toHaveLength(1);
    expect(SQL).not.toContain("set_config");
    // Every table that names the reference beside a debate is written, each row filtered by the old reference.
    for (const update of ["UPDATE core.run SET asker_id", "UPDATE core.run_ownership_event SET owner_ref", "UPDATE core.legacy_run_claim SET owner_ref",
      "UPDATE memory.question_key SET asker_scope", "UPDATE memory.pull_record SET asker_scope", "UPDATE memory.memory_link_event SET actor_ref", "UPDATE billing.run_charge_scope"])
      expect(unlink, update).toContain(update);
    expect(unlink).toContain("pg_catalog.gen_random_uuid()");
    // An account with no ownership record and no usage row has no debate: both are read through an index, and the function stops there.
    expect(SQL).toContain("CREATE INDEX IF NOT EXISTS run_ownership_event_owner_ref ON core.run_ownership_event (owner_ref);");
    expect(unlink.indexOf("RETURN OLD;")).toBeLessThan(unlink.indexOf("FOR v_run IN"));
    expect(unlink).not.toMatch(/DELETE FROM|INSERT INTO/u);
    // 0110's finalize deletes the account row last; this step leaves it as it is.
    expect(read("migrations/0110_account_erasure_public_debates.sql")).toContain('DELETE FROM identity."user" WHERE user_id=v_user_id;\n    IF NOT FOUND THEN RETURN \'NOT_FOUND\'; END IF;\n    RETURN \'COMMITTED\';');
  });
});
