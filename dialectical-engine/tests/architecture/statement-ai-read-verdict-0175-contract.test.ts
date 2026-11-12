// 0175: the statement to a debate's author says an AI read the report first only for a verdict (Q3 of the final review of 0172, 11 November 2026).
// One drained step: 0157's identity.moderation_statement_ground restated from 0172's body with the one line that decides automated_detection changed.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const NAME = "0175_statement_ai_read_verdict.sql";
const SQL = read(`migrations/${NAME}`);
const GROUND = "identity.moderation_statement_ground(uuid)";
const AMENDS = [{ step: "0157_moderation_statements.sql", functions: [GROUND], field: "function_definition" }];
const manifest = JSON.parse(read("migrations/lineage/statement-ai-read-verdict-forward0175.json")) as {
  previous: { name: string; manifestSha256: string; verifierSha256: string }; migration: { name: string; sha256: string };
  verifier: { path: string; sha256: string }; amendsPostconditionsOf: unknown };
/** The function's CREATE statement in `sql`, from its CREATE line to its closing `END $$;`. */
const groundOf = (sql: string): string => {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION identity.moderation_statement_ground(p_statement_id uuid) RETURNS jsonb");
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf("END $$;", start) + "END $$;".length);
};
const code = (body: string): string[] => body.split("\n").filter((line) => !line.trimStart().startsWith("--"));
const OLD_LINE = "  v_detected := v_decided OR EXISTS (SELECT 1 FROM identity.public_flag AS flag WHERE flag.flag_id = v_flag AND flag.judge_model_id IS NOT NULL);";
const NEW_LINE = "  v_detected := v_decided OR EXISTS (SELECT 1 FROM identity.public_flag AS flag WHERE flag.flag_id = v_flag AND flag.verdict IN ('AGREE','NOT_FOUND','UNSURE') AND flag.judged_at <= s.happened_at);";

describe("0175: the statement's AI line needs a verdict", () => {
  it("comes after 0174 in the chain (0176 follows it), with its own loader, bound to its own bytes and 0174's manifest", async () => {
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("import { loadForward0175 } from './migration-forward0175.js';");
    const loader = read("packages/db/src/migration-forward0175.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "statement-ai-read-verdict-forward0175-v1";');
    expect(loader).toContain('const PREVIOUS = "0174_public_review_ungrounded_door.sql";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain("throw Error(`MIGRATION_FORWARD0175_${detail}`)");
    expect(manifest.previous.name).toBe("0174_public_review_ungrounded_door.sql");
    expect(manifest.previous.manifestSha256).toBe(sha256(read("migrations/lineage/public-review-ungrounded-door-forward0174.json")));
    expect(manifest.migration).toEqual({ name: NAME, sha256: sha256(SQL) });
    expect(manifest.verifier).toEqual({ path: "lineage/verify-effective-capabilities-130.sql", sha256: sha256(read("migrations/lineage/verify-effective-capabilities-130.sql")) });
    expect(manifest.amendsPostconditionsOf).toEqual(AMENDS);
    const plan = await loadMigrationPlan();
    const step = plan.forwardChain.at(-2)!;
    expect(step.name).toBe(NAME);
    expect(step.previousName).toBe("0174_public_review_ungrounded_door.sql");
    expect(step.verifierSha256).toBe(plan.forwardChain.at(-3)!.verifierSha256);
    expect(step.replayVerifierSql).toBeUndefined();
    expect(step.amendsPostconditionsOf).toEqual(AMENDS);
  });

  it("is drained and keeps the verifier, and its header says so before its first statement", () => {
    expect(parseN1Header(NAME, SQL)).toEqual({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    const header = SQL.slice(0, SQL.search(/^(?!--)\S/mu));
    expect(header).toMatch(/^-- n1: drained$/mu);
    expect(header).toMatch(/^-- n1: keeps-verifier$/mu);
    expect(SQL).not.toMatch(/\b(?:billing|ledger)\.[a-z_]+/u);
  });

  it("restates 0172's statement ground with one line changed: a recorded model alone no longer says an AI read the report", () => {
    const before = code(groundOf(read("migrations/0172_moderation_notice_fixes.sql")));
    const after = code(groundOf(SQL));
    expect(before).toContain(OLD_LINE);
    expect(after).toEqual(before.map((line) => (line === OLD_LINE ? NEW_LINE : line)));
    expect(groundOf(SQL)).not.toContain("judge_model_id");
    // Nothing else: one function, no grant, no revoke, no other object.
    const statements = SQL.slice(0, SQL.indexOf("DO $statement_ai_read_verdict_contract$")).split("\n").filter((line) => /^[A-Z]/u.test(line));
    expect(statements.filter((line) => /^(?:CREATE|ALTER|DROP|GRANT|REVOKE)\b/u.test(line)))
      .toEqual(["CREATE OR REPLACE FUNCTION identity.moderation_statement_ground(p_statement_id uuid) RETURNS jsonb"]);
  });

  it("is documented as the sixty-fifth chain step, in the lineage README and the preview's README", () => {
    const readme = read("migrations/lineage/README.md");
    const section = readme.split("## The statement to a debate's author says an AI read the report first only for a verdict (0175)")[1]?.split("\n## ")[0] ?? "";
    for (const needle of [NAME, "`-- n1: drained`", "`-- n1: keeps-verifier`", "`UNAVAILABLE`", "identity.read_public_flag_mail"])
      expect(section, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain(`\`migrations/${NAME}\` (after \`0174_public_review_ungrounded_door.sql\`, \`n1: drained\`)`);
  });
});
