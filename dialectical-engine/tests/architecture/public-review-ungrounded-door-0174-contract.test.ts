// tests/architecture/public-review-ungrounded-door-0174-contract.test.ts
// 0174: 0150's staff review door without a ground is no longer the runtime's (the final review of 0172, 11 November 2026). One drained step, one revoke.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { atStep, stepsLiteralFrom } from "../support/forward-chain-steps.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const NAME = "0174_public_review_ungrounded_door.sql";
const SQL = read(`migrations/${NAME}`);
const DOOR = "staff.public_review_act(jsonb,uuid,jsonb,jsonb,jsonb,jsonb)";
const AMENDS = [{ step: "0150_public_review.sql", functions: [DOOR], revokes: [`EXECUTE ON FUNCTION ${DOOR} FROM debateai_runtime`], field: "function_acl_revoked" }];
const manifest = JSON.parse(read("migrations/lineage/public-review-ungrounded-door-forward0174.json")) as {
  previous: { name: string; manifestSha256: string; verifierSha256: string }; migration: { name: string; sha256: string };
  verifier: { path: string; sha256: string }; amendsPostconditionsOf: unknown };
/** Every source file under `directory` (relative to the root), build output and dependencies left out. */
const sources = (directory: string): string[] => readdirSync(new URL(`${directory}/`, ROOT), { withFileTypes: true }).flatMap((entry) => {
  const path = `${directory}/${entry.name}`;
  if (entry.isDirectory()) return ["node_modules", "dist", ".next", ".turbo", "coverage"].includes(entry.name) ? [] : sources(path);
  return /\.(?:ts|tsx|mts|mjs|js|sql)$/u.test(entry.name) ? [path] : [];
});
/** The SQL with its comments and its closing contract block taken out: what the step itself does. */
const statements = (): string[] => SQL.slice(0, SQL.indexOf("DO $public_review_ungrounded_door_contract$")).split("\n")
  .filter((line) => line.trim() !== "" && !line.startsWith("--"));

describe("0174: 0150's staff review door without a ground", () => {
  it("comes after 0173 in the chain, with its own loader, bound to its own bytes and 0173's manifest", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain(stepsLiteralFrom("0172"));
    expect(chain).toContain("import { loadForward0174 } from './migration-forward0174.js';");
    const loader = read("packages/db/src/migration-forward0174.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "public-review-ungrounded-door-forward0174-v1";');
    expect(loader).toContain('const PREVIOUS = "0173_settle_dismissed_flag.sql";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain("throw Error(`MIGRATION_FORWARD0174_${detail}`)");
    expect(manifest.previous.name).toBe("0173_settle_dismissed_flag.sql");
    expect(manifest.previous.manifestSha256).toBe(sha256(read("migrations/lineage/settle-dismissed-flag-forward0173.json")));
    expect(manifest.migration).toEqual({ name: NAME, sha256: sha256(SQL) });
    expect(manifest.verifier).toEqual({ path: "lineage/verify-effective-capabilities-130.sql", sha256: sha256(read("migrations/lineage/verify-effective-capabilities-130.sql")) });
    const plan = await loadMigrationPlan();
    const step = atStep(plan.forwardChain, NAME);
    expect(step.name).toBe(NAME);
    expect(step.previousName).toBe("0173_settle_dismissed_flag.sql");
    expect(step.verifierSha256).toBe(atStep(plan.forwardChain, "0173_settle_dismissed_flag.sql").verifierSha256);
    expect(step.replayVerifierSql).toBeUndefined();
    expect(step.amendsPostconditionsOf).toEqual(AMENDS);
  });

  it("is drained and keeps the verifier, and its header says so before its first statement", () => {
    expect(parseN1Header(NAME, SQL)).toEqual({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    const header = SQL.slice(0, SQL.search(/^(?!--)\S/mu));
    expect(header).toMatch(/^-- n1: drained$/mu);
    expect(header).toMatch(/^-- n1: keeps-verifier$/mu);
    // No billing object: the effective-capability verifier stays 0130's.
    expect(SQL).not.toMatch(/\b(?:billing|ledger)\.[a-z_]+/u);
  });

  it("does one thing: the runtime's EXECUTE on 0150's door, taken back; it creates, drops and grants nothing", () => {
    expect(statements()).toEqual([`REVOKE EXECUTE ON FUNCTION ${DOOR} FROM debateai_runtime;`]);
    expect(SQL).not.toMatch(/^\s*(?:CREATE|DROP|ALTER|GRANT)\b/imu);
    // The function is kept: 0150 created it and 0150's loader still digests it.
    expect(read("migrations/0150_public_review.sql")).toContain("CREATE OR REPLACE FUNCTION staff.public_review_act(p_context jsonb,p_proof uuid,p_binding jsonb,p_command jsonb,p_content jsonb,p_alert jsonb) RETURNS jsonb");
    expect(read("packages/db/src/migration-forward0150.ts")).toContain(`"${DOOR}"`);
  });

  it("declares its one change of 0150's digest as a function_acl_revoked amendment, in the manifest, the loader and the chain's type", () => {
    expect(manifest.amendsPostconditionsOf).toEqual(AMENDS);
    expect(read("packages/db/src/migration-forward-chain.ts"))
      .toContain("|Readonly<{step:string;functions:readonly string[];revokes:readonly string[];field:'function_acl_revoked'}>");
    // Its own postcondition digests that door whole, its grants included.
    const loader = read("packages/db/src/migration-forward0174.ts");
    expect(loader).toContain(`const DOOR = "${DOOR}";`);
    expect(loader).toContain("aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))");
  });

  it("checks its end state as it applies: the old door still 0150's and its owner's alone, the door with the law still the runtime's", () => {
    const contract = SQL.slice(SQL.indexOf("DO $public_review_ungrounded_door_contract$"));
    for (const needle of ["'staff.public_review_act(jsonb,uuid,jsonb,jsonb,jsonb,jsonb)'", "'staff.public_review_act_grounded(jsonb,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text)'",
      "'debateai_staff_security_owner'::regrole::oid", "ARRAY['search_path=pg_catalog']", "a.grantee <> p.proowner",
      "has_function_privilege('debateai_runtime', v_old, 'EXECUTE')", "NOT pg_catalog.has_function_privilege('debateai_runtime', v_grounded, 'EXECUTE')"])
      expect(contract, needle).toContain(needle);
  });

  it("leaves no caller of the old door in apps/ or packages/: the API's review store calls only 0172's door with the law", () => {
    const callers = [...sources("apps"), ...sources("packages")].filter((path) => /public_review_act(?![_a-z])/u.test(read(path))).sort();
    // Only 0150's loader names it, to digest it, and this step's, to digest its grants.
    expect(callers).toEqual(["packages/db/src/migration-forward0150.ts", "packages/db/src/migration-forward0174.ts"]);
    expect(read("packages/db/src/public-review.ts"))
      .toContain("SELECT staff.public_review_act_grounded($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::text)");
  });

  it("is documented as the sixty-fourth chain step, in the lineage README and the preview's README", () => {
    const readme = read("migrations/lineage/README.md");
    const section = readme.split("## 0150's staff review door without a ground (0174)")[1]?.split("\n## ")[0] ?? "";
    for (const needle of [NAME, "`-- n1: drained`", "`-- n1: keeps-verifier`", "`function_acl_revoked`", "DSA Art 17(3)"])
      expect(section, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain(`\`migrations/${NAME}\` (after \`0173_settle_dismissed_flag.sql\`, \`n1: drained\`)`);
  });
});
