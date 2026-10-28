import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadForward0129 } from "../../packages/db/src/migration-forward0129.js";

const sql = readFileSync(new URL("../../migrations/0129_support_answer_scope.sql", import.meta.url), "utf8")
  .replace(/--[^\n]*/gu, "");
const tables = ["session", "session_key", "message", "abuse_event", '"case"', "case_key", "case_event",
  "case_message", "rating", "tool_call", "admission_event", "relay_call", "relay_waiter", "relay_waiter_event"];
const deletion = ["rating", "case_message", "case_event", "case_key", '"case"', "tool_call", "abuse_event",
  "message", "session_key", "admission_event", "session", "shred_audit", "relay_waiter_event", "relay_waiter", "relay_call"];
const guarded = [...["abuse_event", "case_event", "rating", "tool_call", "relay_call", "relay_waiter",
  "relay_waiter_event", "admission_event", "shred_audit"].map((table) => `${table}.reject_mutation`),
  ...["session", '"case"', "session_key", "case_key"].map((table) => `${table}.reject_delete`)];

describe("0129 support tables keep nothing", () => {
  it("revokes INSERT on exactly the fourteen conversation and model-call tables", () => {
    const revokes = [...sql.matchAll(/REVOKE\s+INSERT\s+ON\s+([\s\S]*?)\s+FROM\s+debateai_support\s*;/giu)];
    expect(revokes).toHaveLength(1);
    expect(revokes[0]![1]!.split(",").map((table) => table.trim()).sort())
      .toEqual(tables.map((table) => `support.${table}`).sort());
  });

  it("deletes fifteen tables in dependency order without TRUNCATE", () => {
    expect([...sql.matchAll(/DELETE\s+FROM\s+support\.([\w"]+)\s*;/giu)].map((match) => match[1])).toEqual(deletion);
    expect(sql).not.toMatch(/\bTRUNCATE\b/iu);
  });

  it("restores the thirteen guards after making the shred row guard immediate", () => {
    const changes = [...sql.matchAll(/ALTER\s+TABLE\s+support\.([\w"]+)\s+(DISABLE|ENABLE)\s+TRIGGER\s+(reject_mutation|reject_delete)\s*;/giu)];
    for (const action of ["DISABLE", "ENABLE"]) {
      expect(changes.filter(([, , value]) => value === action).map(([, table, , trigger]) => `${table}.${trigger}`).sort())
        .toEqual([...guarded].sort());
    }
    const firstDelete = sql.indexOf("DELETE FROM");
    const lastDelete = sql.lastIndexOf("DELETE FROM");
    const immediate = sql.indexOf("SET CONSTRAINTS support.support_shred_row_guard IMMEDIATE");
    const firstEnable = sql.indexOf("ENABLE TRIGGER");
    const deferred = sql.indexOf("SET CONSTRAINTS support.support_shred_row_guard DEFERRED");
    expect(sql.lastIndexOf("DISABLE TRIGGER")).toBeLessThan(firstDelete);
    expect(lastDelete).toBeLessThan(immediate);
    expect(immediate).toBeLessThan(firstEnable);
    expect(sql.lastIndexOf("ENABLE TRIGGER")).toBeLessThan(deferred);
  });

  it("does not bypass role replication or all constraints or replace a function", () => {
    expect(sql).not.toMatch(/session_replication_role|SET\s+CONSTRAINTS\s+ALL|CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/iu);
  });

  it("ends with checks for missing guards, truncation guards, INSERT rights and retained rows", () => {
    const last = sql.slice(sql.lastIndexOf("DO $$"));
    expect(last).toMatch(/DO \$\$[\s\S]*\$\$\s*;\s*$/u);
    for (const code of ["MIGRATION_0129_GUARD_MISSING", "MIGRATION_0129_TRUNCATE_GUARDS",
      "MIGRATION_0129_INSERT_KEPT", "MIGRATION_0129_ROWS_KEPT"]) expect(last).toContain(code);
  });

  it("refuses a catalog with none of the guarded objects", async () => {
    const manifest = JSON.parse(readFileSync(new URL("../../migrations/lineage/support-answer-scope-forward0129.json", import.meta.url), "utf8"));
    const step = await loadForward0129({ baseRecipeSha256: manifest.baseRecipeSha256,
      previousName: manifest.previous.name, previousManifestSha256: manifest.previous.manifestSha256,
      previousVerifierSha256: manifest.previous.verifierSha256 });
    await expect(step.postconditionEvidence({ query: async () => ({ rows: [] }) } as never))
      .rejects.toThrow("MIGRATION_FORWARD0128_POSTCONDITION_OBJECTS");
  });
});
