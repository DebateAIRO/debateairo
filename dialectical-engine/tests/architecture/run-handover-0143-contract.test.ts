import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationReplaySafety, definedFunctionNames, definedRelationNames } from "../../tools/orphan-audit/src/index.js";

/**
 * 0143 (plan 2026-10-31-r22-owner-changes decision 12): a paused debate moves to the current release, in codes only; `expand`, keeping
 * 0130's verifier. No database here: the behaviour is tests/integration/run-handover-database.test.ts and -debate.test.ts.
 */
const NAME = "0143_run_handover.sql";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sql = read(`migrations/${NAME}`);
const code = sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");

describe("0143: the hand-over", () => {
  it("is the chain's step after 0142 with its own loader, and its manifest binds the bytes", () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0143 } from './migration-forward0143.js';");
    expect(chain).toContain("loadForward0142,loadForward0143]");
    const manifest = JSON.parse(read("migrations/lineage/run-handover-forward0143.json")) as { migration: { name: string; sha256: string };
      previous: { name: string; manifestSha256: string } };
    expect(manifest.migration).toEqual({ name: NAME, sha256: createHash("sha256").update(sql).digest("hex") });
    expect(manifest.previous.name).toBe("0142_team_limit.sql");
    expect(manifest.previous.manifestSha256).toBe(createHash("sha256").update(read("migrations/lineage/team-limit-forward0142.json")).digest("hex"));
  });

  it("declares expand and keeps the verifier: core.run and every earlier object stay as they are", () => {
    expect(parseN1Header(NAME, sql)).toMatchObject({ expand: true });
    expect(sql).toContain("-- n1: keeps-verifier");
    expect(code).not.toMatch(/\b(UPDATE|DELETE FROM|ALTER TABLE)\s+core\.run\b/iu);
    expect(code).not.toMatch(/ALTER TABLE identity\.(?!run_handover\b)/iu);
    expect(definedRelationNames(sql)).toEqual(["identity.run_handover"]);
    expect([...definedFunctionNames(sql)].sort()).toEqual([
      "identity.continue_paused_run_in_release", "identity.run_release_now", "identity.run_settings_version_now", "identity.run_work_is_parked",
      "identity.wipe_inactive_web_page_text_of_idle_debates"]);
    expect(auditMigrationReplaySafety(`migrations/${NAME}`, sql)).toEqual([]);
  });

  it("keeps codes only, and never a person: the row needs no erasure and no export", () => {
    const table = /CREATE TABLE IF NOT EXISTS identity\.run_handover \(([^]*?)\n\);/u.exec(code)![1]!;
    expect(table).not.toMatch(/owner_ref|ciphertext|content/u);
  });

  it("no code calls the sweep it replaces, and every fence reads who owns a debate now", () => {
    expect(read("packages/db/src/investigations.ts")).not.toMatch(/identity\.wipe_inactive_web_page_text\(/u);
    const battery = read("packages/battery/src/index.ts");
    expect(battery).not.toMatch(/run\.release_key = \$/u);
    expect(read("apps/runner/src/runner-retirement.ts")).not.toMatch(/r\.release_key = \$/u);
  });
});
