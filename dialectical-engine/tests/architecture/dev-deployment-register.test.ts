import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  DEVELOPMENT_HISTORICAL_REGISTER_VERSION,
  DEVELOPMENT_REGISTER_VERSION
} from "../../apps/runner/src/dev-deployment-register.js";

describe("DEV-05 development deployment register source contract", () => {
  it("publishes one admin-only dev command without acceptance-seeder coupling", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const cli = await readFile("apps/runner/src/dev-deployment-register-cli.ts", "utf8");
    const source = await readFile("apps/runner/src/dev-deployment-register.ts", "utf8");
    expect(packageJson.scripts?.["dev:auth:seed-register"])
      .toBe("tsx apps/runner/src/dev-deployment-register-cli.ts");
    expect(cli).toContain("loadMigrationEnvironment()");
    // The panel and the T16 role identities both come from the ONE development
    // command environment the CLI loads (T16 ruling J7 added the role refs).
    expect(cli).toContain("loadDevelopmentCommandEnvironment()");
    expect(cli).toContain("loadDevelopmentProviderPanelFromEnvironment(commandEnvironment)");
    expect(cli).toContain("resolveDevelopmentSynthesisRoleRefs(providerPanel, commandEnvironment)");
    expect(cli).toContain("seedDevelopmentDeploymentRegister({");
    expect(cli).toContain("repositoryRoot: process.cwd()");
    expect(cli).toContain("DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX");
    expect(cli).toContain("serializeDevelopmentDeploymentRegisterReceipt(receipt)");
    expect(source).toContain("DEV_DEPLOYMENT_REGISTER_ADMIN_REQUIRED");
    expect(source).not.toMatch(/acceptance\/|seedAcceptanceRegister/);
  });

  it("defines the exact five additional API boot rows and delegates the sealed ceremony to the closed port", async () => {
    const source = await readFile("apps/runner/src/dev-deployment-register.ts", "utf8");
    for (const rowKey of [
      "configuredProviderSet",
      "panelDiscoveryPolicy",
      "riskTier",
      "acceptanceOrganCostBounds",
      "runDeathPolicy"
    ]) expect(source).toContain(`rowKey: "${rowKey}"`);
    // V-14: the deployment register publishes the superseding authentication
    // rows; the sealed historical set is never republished from here.
    expect(source).toContain("AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS");
    expect(source).toContain("MFA_POLICY_REGISTER_ROW");
    expect(source).toContain("SESSION_POLICY_REGISTER_ROW");
    expect(source).toContain("RECOVERY_POLICY_REGISTER_ROW");
    expect(source).toContain("PRODUCT_ROLE_POLICY_REGISTER_ROW");
    expect(source).toContain("createPostgresRegisterPublicationPort(input.adminPool).publishGeneral");
    expect(source).toContain("buildDevelopmentDeploymentRegisterPublicationRows");
    expect(source).not.toMatch(/INSERT\s+INTO\s+register[.]register_(?:row|version)/iu);
    expect(source).not.toContain('await client.query("BEGIN")');
  });

  it("publishes one canonical receipt only after the closed port resolves and verifies custody", async () => {
    const source = await readFile("apps/runner/src/dev-deployment-register.ts", "utf8");
    const port = source.indexOf("await createPostgresRegisterPublicationPort(input.adminPool).publishGeneral");
    const receipt = source.indexOf("createDevelopmentDeploymentRegisterMachineReceipt", port);
    const custody = source.indexOf("await writeDevelopmentDeploymentRegisterReceipt", receipt);
    expect(port).toBeGreaterThan(-1);
    expect(receipt).toBeGreaterThan(port);
    expect(custody).toBeGreaterThan(receipt);
    expect(source).toContain("O_NOFOLLOW");
    expect(source).toContain("metadata.nlink !== 1");
    expect(source).toContain("directory.sync()");
  });
});

/**
 * C-I4 (final review, area C) — THE CONSTANT AND THE ALLOCATOR MUST AGREE.
 *
 * `DEVELOPMENT_REGISTER_VERSION` documents itself as "the first allocated
 * version on a fresh database", and the runtime never reads it — both dev roots
 * pin the RECEIPT's allocated version. So its only job is to be the number the
 * database will actually hand out, and three Docker-bound cases assert exactly
 * that. It said 6 while a fresh database allocates 5: migration 0055's sequence
 * contract sets the next version to `greatest(4, max(register_version)) + 1`,
 * and the only version a fresh database holds when the dev seeder publishes is
 * the sealed bootstrap, imported as HISTORICAL (the historical import never
 * touches the allocator sequence). 6 is what a re-seed on a STANDING database
 * that already holds a 5 allocates — a different question, answered by the
 * receipt.
 *
 * Nothing here edits a sealed row: the version NUMBER a publication is given is
 * the allocator's to choose, and a database that already sealed a 5 still gets
 * a 6 for the new rows.
 */
describe("C-I4 the first allocated development register version", () => {
  it("is what 0055's sequence contract allocates on a fresh database", async () => {
    const migration = await readFile("migrations/0055_register_support_publication.sql", "utf8");
    const contract = /greatest\(\s*(\d+)::bigint,\s*coalesce\(pg_catalog\.max\(register_version\), 0::bigint\)\s*\)\s*\+\s*(\d+)/u
      .exec(migration);
    expect(contract, "0055 no longer states the sequence contract this pin reads").not.toBeNull();
    const floor = Number(contract![1]);
    const step = Number(contract![2]);
    // ...and the allocator refuses anything at or below that floor.
    expect(migration).toContain("IF v_allocated <= 4 THEN");
    expect(migration).toContain("REGISTER_PUBLICATION_DEFINITION_DRIFT: allocator floor");
    // The only version a fresh database holds when the seeder publishes.
    const bootstrap = JSON.parse(await readFile("register.bootstrap.json", "utf8")) as {
      registerVersion: number;
    };
    expect(DEVELOPMENT_REGISTER_VERSION)
      .toBe(Math.max(floor, bootstrap.registerVersion) + step);
  });

  it("leaves the version below it as the historical one", () => {
    expect(DEVELOPMENT_HISTORICAL_REGISTER_VERSION).toBe(DEVELOPMENT_REGISTER_VERSION - 1);
  });

  it("is the version the dev topology record tells an operator to expect", async () => {
    const topology = JSON.parse(await readFile(
      "docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.json",
      "utf8"
    )) as { apiEnvironment: Record<string, string> };
    expect(topology.apiEnvironment.REGISTER_VERSION).toBe(String(DEVELOPMENT_REGISTER_VERSION));
  });
});
