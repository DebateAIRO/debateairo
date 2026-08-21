import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  DOMAIN_GUARDRAIL_VERSION,
  evaluateDomainProposal,
  normalizeDomainName
} from "../../packages/evaluator/src/index.js";

const domains = [
  { domainId: "domain:software", canonicalName: "Software Engineering", normalizedName: "software engineering" },
  { domainId: "domain:health", canonicalName: "Health & Medicine", normalizedName: "health & medicine" }
] as const;

describe("evaluator domain admission guardrails", () => {
  it("normalizes Unicode, case, and whitespace deterministically", () => {
    expect(normalizeDomainName("  ＳＯＦＴＷＡＲＥ\t Engineering  ")).toBe("software engineering");
    expect(DOMAIN_GUARDRAIL_VERSION).toBe(1);
  });

  it("matches exact normalized names and rejects near duplicates", () => {
    expect(evaluateDomainProposal("Software   ENGINEERING", domains)).toMatchObject({
      decision: "MATCHED_EXISTING",
      domainId: "domain:software"
    });
    expect(evaluateDomainProposal("Software Engineer", domains)).toMatchObject({
      decision: "REJECTED_NEAR_DUPLICATE",
      domainId: null,
      candidates: [{ domainId: "domain:software" }]
    });
    expect(evaluateDomainProposal("Health & Medicine", domains)).toMatchObject({
      decision: "MATCHED_EXISTING",
      domainId: "domain:health"
    });
  });

  it("admits genuinely new labels and rejects labels outside fixed bounds", () => {
    expect(evaluateDomainProposal("Climate Science", domains)).toMatchObject({
      decision: "ADMITTED_NEW",
      normalizedName: "climate science",
      domainId: null
    });
    expect(evaluateDomainProposal("Children's Health", [])).toMatchObject({ decision: "ADMITTED_NEW" });
    expect(evaluateDomainProposal("Pre-trial Law", [])).toMatchObject({ decision: "ADMITTED_NEW" });
    for (const invalid of [
      "", "a", "one two three four five six seven", "health!!!", "Health && Medicine", "x".repeat(81)
    ]) {
      expect(evaluateDomainProposal(invalid, domains)).toMatchObject({
        decision: "REJECTED_INVALID",
        domainId: null
      });
    }
  });

  it("returns candidates in stable similarity/name/id order", () => {
    const reversed = [...domains].reverse();
    expect(evaluateDomainProposal("Software Engineer", reversed)).toEqual(
      evaluateDomainProposal("Software Engineer", domains)
    );
  });

  it("exposes the approved 0024 seed to the migration runner scan", async () => {
    const topLevelMigrations = (await readdir(new URL("../../migrations/", import.meta.url)))
      .filter((name) => /^\d+.*\.sql$/.test(name));
    expect(topLevelMigrations).toContain("0024_evaluator_domain_seed.sql");
    const migration = await readFile(
      new URL("../../migrations/0024_evaluator_domain_seed.sql", import.meta.url),
      "utf8"
    );
    expect(migration).toContain("mission:model-evaluator:V-approved-starter-list");
    expect(migration).toContain("WITH seed_data(canonical_name) AS");
  });
});
