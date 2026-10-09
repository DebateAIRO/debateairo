/**
 * Task 14b — the HOSTED register publication, on a real (embedded) PostgreSQL.
 *
 * Proves, end to end and without the development seeder:
 *  - the command publishes ONE new sealed version on a fresh database, after
 *    importing the sealed historical bootstrap;
 *  - the readers BOTH services call at boot, in hosted mode, accept what it
 *    published — called here directly, not through the command's own check;
 *  - a second identical publish appends nothing, and a changed file appends a
 *    NEW version while the earlier one stays exactly as it was sealed;
 *  - a drifted historical bootstrap and a principal that cannot publish are
 *    refused before anything is written;
 *  - the pnpm entry point runs the same path, and its dry run writes nothing.
 */
import { spawn } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDeploymentMakerCapability } from "../../packages/critique/src/index.js";
import { createPool, migrate } from "../../packages/db/src/index.js";
import {
  assertDeploymentProviderTargets,
  assertPricedProviderTargets,
  parseProviderDiscoveryTargets
} from "../../packages/providers/src/index.js";
import {
  BILLING_POLICY_DEPLOYMENT_REGISTER_ROW,
  COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW,
  assertAskRoomAdmissionSealed,
  assertHostedSupportAdmissionSealed,
  loadBootstrapRegister,
  parseCanonicalRegisterJson,
  readAdmissionPolicy,
  readAuthPolicy,
  readBillingPlans,
  readBillingPolicy,
  readCostEnvelopePolicy,
  readDeploymentRiskTier,
  readEnvelopeFormulaInputs,
  readMfaPolicy,
  readPanelDiscoveryPolicy,
  readProductRolePolicy,
  readPublicationCheckPolicy,
  readOutboundMailPolicy,
  readCountryPolicy,
  readRecoveryPolicy,
  readSessionPolicy,
  readStructuralCeilingPolicyInputs,
  registerVersionToSafeLegacyNumber
} from "../../packages/register/src/index.js";
import { readDevelopmentRunnerPolicy } from "../../apps/runner/src/dev-runner-policy.js";
import {
  HOSTED_REGISTER_FILE_FORMAT,
  createPostgresHostedRegisterOperations,
  hostedRegisterRefusalCode,
  parseHostedRegisterFile,
  planHostedRegisterPublication,
  publishHostedRegister
} from "../../apps/runner/src/hosted-register-publish.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { importHistoricalRegisterFixture, registerFixtureRow } from "../support/registerFixtures.js";

let database: TestDatabase;
const temporaryRoots: string[] = [];

beforeEach(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterEach(async () => {
  if (database !== undefined) await database.stop();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const VETTING = Object.freeze({
  dataUseTermsReviewedOn: "2026-09-24",
  retentionTermsReviewedOn: "2026-09-24",
  namedInPrivacyNotice: true
});

function hostedFile(perRunCeilingMicros = 250_000): Record<string, unknown> {
  return {
    format: HOSTED_REGISTER_FILE_FORMAT,
    sourceRef: "task-14b integration: first hosted register",
    configuredProviderSet: {
      requiredDistinctMakers: 2,
      providers: [
        { providerRef: "vendor:alpha", adapterKind: "openai-compatible-http", maker: "Alpha", vetting: VETTING },
        { providerRef: "vendor:beta", adapterKind: "openai-compatible-http", maker: "Beta", vetting: VETTING }
      ]
    },
    costEnvelopePolicy: {
      kind: "COST_ENVELOPE_POLICY",
      currency: "USD",
      minor_units_per_unit: 1_000_000,
      per_run_ceiling_micros: perRunCeilingMicros,
      daily_ceiling_micros: 2_000_000,
      provisional: true,
      provisional_reason: "PROVISIONAL first hosted run ceiling under V-28"
    },
    providerTargets: [
      {
        provider_ref: "vendor:alpha",
        base_url: "https://api.alpha-vendor-fixture.com/v1",
        model: "alpha-large",
        authorization_file: "/etc/debateai/runner/providers/alpha.header",
        input_price_micros_per_million: 3_000_000,
        output_price_micros_per_million: 15_000_000
      },
      {
        provider_ref: "vendor:beta",
        base_url: "https://api.beta-vendor-fixture.com/v1",
        model: "beta-large",
        authorization_file: "/etc/debateai/runner/providers/beta.header",
        input_price_micros_per_million: 1_000_000,
        output_price_micros_per_million: 4_000_000
      }
    ]
  };
}

async function planOf(file: Record<string, unknown>) {
  return planHostedRegisterPublication(parseHostedRegisterFile(Buffer.from(JSON.stringify(file), "utf8")));
}

async function versionCount(): Promise<number> {
  const result = await database.pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM register.register_version"
  );
  return Number(result.rows[0]!.count);
}

async function custodyFile(file: Record<string, unknown>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "debateai-hosted-register-cli-"));
  temporaryRoots.push(root);
  await chmod(root, 0o700);
  const path = join(root, "hosted-register.json");
  await writeFile(path, JSON.stringify(file));
  await chmod(path, 0o600);
  return path;
}

async function runCli(args: readonly string[], environment: NodeJS.ProcessEnv): Promise<Readonly<{
  exitCode: number | null; stdout: string; stderr: string;
}>> {
  const childEnvironment: NodeJS.ProcessEnv = { ...environment };
  delete childEnvironment.FORCE_COLOR;
  delete childEnvironment.NO_COLOR;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--import", createRequire(import.meta.url).resolve("tsx"),
      join(process.cwd(), "apps", "runner", "src", "hosted-register-publish-cli.ts"),
      ...args
    ], { cwd: process.cwd(), env: childEnvironment, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

describe("Task 14b · hosted register publication on PostgreSQL", () => {
  it("publishes one sealed version that the hosted boot readers accept, and replays it unchanged", async () => {
    const file = hostedFile();
    const plan = await planOf(file);
    const operations = createPostgresHostedRegisterOperations(database.pool);

    const first = await publishHostedRegister({ plan, operations });
    expect(first.outcome).toBe("CREATED");
    expect(BigInt(first.registerVersion)).toBeGreaterThan(1n);
    const afterFirst = await versionCount();

    // The boot readers, called directly and in the order the API and the
    // runner call them, in HOSTED mode.
    const version = registerVersionToSafeLegacyNumber(first.registerVersion);
    await readAuthPolicy(database.pool, version);
    await readMfaPolicy(database.pool, version);
    await readSessionPolicy(database.pool, version);
    await readRecoveryPolicy(database.pool, version);
    assertHostedSupportAdmissionSealed("hosted", await readAdmissionPolicy(database.pool, version));
    await expect(readCostEnvelopePolicy(database.pool, version)).resolves.toMatchObject({
      perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000, provisional: true
    });
    await readProductRolePolicy(database.pool, version);
    const makers = await readDeploymentMakerCapability(database.pool, version);
    expect(makers.configuredProviders.map((provider) => provider.providerRef))
      .toEqual(["vendor:alpha", "vendor:beta"]);
    await readPanelDiscoveryPolicy(database.pool, version);
    await readStructuralCeilingPolicyInputs(database.pool, version);
    await readEnvelopeFormulaInputs(database.pool, version);
    await readDeploymentRiskTier(database.pool, version);
    // Owner's ruling 2026-10-04: the API's "publication-check-policy" stage; the file carries no member, so the
    // code-owned deadline is what was sealed.
    await expect(readPublicationCheckPolicy(database.pool, version)).resolves.toEqual({ deadlineMs: 60_000 });
    // Open sign-up mail (G2): the API's "outbound-mail-policy" stage; no member, so the code-owned budget was sealed.
    await expect(readOutboundMailPolicy(database.pool, version)).resolves.toEqual({ dailyCap: 2_000, reservedForSecurityPct: 20, alertAtPct: 50 });
    await readDevelopmentRunnerPolicy(database.pool, version);
    const targets = parseProviderDiscoveryTargets(
      JSON.stringify(file.providerTargets), makers.configuredProviders
    );
    assertDeploymentProviderTargets(targets, { mode: "hosted", nodeEnv: "production" });
    assertPricedProviderTargets(targets, "hosted");

    // The same file again: the same version, and nothing appended.
    const second = await publishHostedRegister({ plan: await planOf(file), operations });
    expect(second).toMatchObject({ outcome: "REPLAYED", registerVersion: first.registerVersion });
    expect(await versionCount()).toBe(afterFirst);
  }, 120_000);

  it("supersedes with a NEW version and leaves the sealed one exactly as it was", async () => {
    const operations = createPostgresHostedRegisterOperations(database.pool);
    const first = await publishHostedRegister({ plan: await planOf(hostedFile()), operations });
    const sealedBefore = await database.pool.query(
      "SELECT row_key,value_json::text AS v,source_ref FROM register.register_row WHERE register_version=$1 ORDER BY row_key",
      [first.registerVersion]
    );
    const second = await publishHostedRegister({ plan: await planOf(hostedFile(300_000)), operations });
    expect(second.outcome).toBe("CREATED");
    expect(BigInt(second.registerVersion)).toBeGreaterThan(BigInt(first.registerVersion));
    const sealedAfter = await database.pool.query(
      "SELECT row_key,value_json::text AS v,source_ref FROM register.register_row WHERE register_version=$1 ORDER BY row_key",
      [first.registerVersion]
    );
    expect(sealedAfter.rows).toEqual(sealedBefore.rows);
    await expect(readCostEnvelopePolicy(
      database.pool, registerVersionToSafeLegacyNumber(second.registerVersion)
    )).resolves.toMatchObject({ perRunCeilingMicros: 300_000 });
  }, 120_000);

  it("refuses a drifted historical bootstrap with the existing code and writes nothing", async () => {
    // The version the sealed bootstrap claims, holding something else.
    const { registerVersion } = await loadBootstrapRegister();
    expect(registerVersion).toBe(1);
    await importHistoricalRegisterFixture(database.pool, 1, [
      registerFixtureRow("riskTier", "standard", "fixture:drifted-historical-bootstrap")
    ]);
    const before = await versionCount();
    const code = await publishHostedRegister({
      plan: await planOf(hostedFile()),
      operations: createPostgresHostedRegisterOperations(database.pool)
    }).then(() => "NO_REFUSAL", hostedRegisterRefusalCode);
    expect(code).toBe("FX-REG-SEALED_VERSION_MISMATCH");
    expect(await versionCount()).toBe(before);
  }, 120_000);

  it("refuses a principal that cannot publish before anything is written", async () => {
    await database.pool.query("CREATE ROLE hosted_register_probe LOGIN PASSWORD 'hosted-register-probe-only'");
    const url = new URL(database.connectionString);
    url.username = "hosted_register_probe";
    url.password = "hosted-register-probe-only";
    const probePool = createPool(url.toString());
    try {
      const code = await publishHostedRegister({
        plan: await planOf(hostedFile()),
        operations: createPostgresHostedRegisterOperations(probePool)
      }).then(() => "NO_REFUSAL", hostedRegisterRefusalCode);
      expect(code).toBe("HOSTED_REGISTER_PUBLISHER_REQUIRED");
    } finally {
      await probePool.end();
    }
    expect(await versionCount()).toBe(0);
  }, 120_000);

  it("runs as the pnpm entry point: a dry run writes nothing, a publish prints the version to pin", async () => {
    const path = await custodyFile(hostedFile());
    const environment = { ...process.env, MIGRATION_DATABASE_URL: database.connectionString };

    const dryRun = await runCli(["--dry-run", "--file", path], environment);
    expect(dryRun.stderr).toBe("");
    expect(dryRun.exitCode).toBe(0);
    expect(dryRun.stdout).toContain("HOSTED_REGISTER_PLAN");
    expect(dryRun.stdout).not.toContain("/etc/debateai");
    expect(await versionCount()).toBe(0);

    const published = await runCli(["--file", path], environment);
    expect(published.stderr).toBe("");
    expect(published.exitCode).toBe(0);
    expect(published.stdout).toMatch(/^HOSTED_REGISTER_PUBLISHED outcome=CREATED register_version=\d+ /mu);
    expect(published.stdout).toMatch(/^HOSTED_REGISTER_BOOT_READY register_version=\d+$/mu);
    expect(published.stdout).toMatch(/^REGISTER_VERSION=\d+$/mu);

    const refused = await runCli(["--file", `${path}.absent`], environment);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr).toBe("HOSTED_REGISTER_FILE_ABSENT\n");
  }, 120_000);

  it("seals the operator's countryPolicy with the geoAvailability scope, and a version without the member has no country gate", async () => {
    const operations = createPostgresHostedRegisterOperations(database.pool);
    // Paid plans G3a: the command's own boot check now reads the country row, as the API boot does.
    const gated = await publishHostedRegister({
      plan: await planOf({ ...hostedFile(), countryPolicy: COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value }),
      operations
    });
    expect(gated.outcome).toBe("CREATED");
    const gatedVersion = registerVersionToSafeLegacyNumber(gated.registerVersion);
    await expect(readCountryPolicy(database.pool, gatedVersion)).resolves.toMatchObject({
      unknownIp: "REFUSE", tor: "REFUSE", sourceRef: "task-14b integration: first hosted register"
    });
    expect((await readAdmissionPolicy(database.pool, gatedVersion)).geoAvailability).toEqual({
      key: "source", limit: 60, windowMs: 60_000, capacity: 65_536
    });

    // Without the member (A14): no country row in that version.
    const ungated = await publishHostedRegister({ plan: await planOf(hostedFile()), operations });
    expect(ungated.outcome).toBe("CREATED");
    await expect(readCountryPolicy(
      database.pool, registerVersionToSafeLegacyNumber(ungated.registerVersion)
    )).resolves.toBeNull();
  }, 120_000);

  it("refuses, after publishing, a countryPolicy version whose admission row lacks the geoAvailability scope", async () => {
    const plan = await planOf({ ...hostedFile(), countryPolicy: COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value });
    const rows = plan.rows.map((row) => {
      if (row.rowKey !== "admissionPolicy") return row;
      const value = JSON.parse(row.valueJsonText) as Record<string, unknown>;
      expect(Object.hasOwn(value, "geo_availability")).toBe(true);
      delete value.geo_availability;
      return {
        rowKey: row.rowKey,
        valueJsonText: parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value), "utf8")),
        sourceRef: row.sourceRef
      };
    });
    await expect(publishHostedRegister({
      plan: { ...plan, rows },
      operations: createPostgresHostedRegisterOperations(database.pool)
    })).rejects.toMatchObject({
      code: "HOSTED_REGISTER_BOOT_CHECK_FAILED:GEO_AVAILABILITY_ADMISSION_UNSEALED"
    });
  }, 120_000);

  // Paid plans P8b: a billing-on hosted file (the band members, billing enabled, the operator's countryPolicy).
  function billingOnFile(): Record<string, unknown> {
    const file = hostedFile();
    return {
      ...file,
      costEnvelopePolicy: {
        ...(file.costEnvelopePolicy as Record<string, unknown>),
        admission_close_basis_points: 9_500,
        finish_up_to_basis_points: 11_500,
        waiting_line_per_person: 1
      },
      // P4-G (ruling C7): a version with the band seals the room read's admission budget too.
      askRoomReads: ROOM_READS,
      billingPolicy: { ...BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value, enabled: true },
      countryPolicy: COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value
    };
  }

  // Paid plans P4-G (go-live row 31; ruling C7): the band, billing off, and the room read's budget.
  const ROOM_READS = Object.freeze({ key: "owner", limit: 60, window_ms: 60_000, capacity: 65_536 });
  function bandFile(): Record<string, unknown> {
    const file = hostedFile();
    return {
      ...file,
      costEnvelopePolicy: {
        ...(file.costEnvelopePolicy as Record<string, unknown>),
        admission_close_basis_points: 9_500,
        finish_up_to_basis_points: 11_500,
        waiting_line_per_person: 1
      },
      askRoomReads: ROOM_READS
    };
  }

  it("publishes a band version whose admission row seals the owner's askRoomReads budget, which the boot readers accept", async () => {
    const result = await publishHostedRegister({
      plan: await planOf(bandFile()),
      operations: createPostgresHostedRegisterOperations(database.pool)
    });
    expect(result.outcome).toBe("CREATED");
    const version = registerVersionToSafeLegacyNumber(result.registerVersion);
    const admission = await readAdmissionPolicy(database.pool, version);
    expect(admission.askRoomReads).toEqual({ key: "owner", limit: 60, windowMs: 60_000, capacity: 65_536 });
    const envelope = await readCostEnvelopePolicy(database.pool, version);
    expect(envelope.closeBasisPoints).toBe(9_500);
    expect(() => assertAskRoomAdmissionSealed({ envelope, admission })).not.toThrow();
  }, 120_000);

  it("refuses, after publishing, a band version whose admission row lacks ask_room_reads", async () => {
    const plan = await planOf(bandFile());
    const rows = plan.rows.map((row) => {
      if (row.rowKey !== "admissionPolicy") return row;
      const value = JSON.parse(row.valueJsonText) as Record<string, unknown>;
      expect(Object.hasOwn(value, "ask_room_reads")).toBe(true);
      delete value.ask_room_reads;
      return {
        rowKey: row.rowKey,
        valueJsonText: parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value), "utf8")),
        sourceRef: row.sourceRef
      };
    });
    await expect(publishHostedRegister({
      plan: { ...plan, rows },
      operations: createPostgresHostedRegisterOperations(database.pool)
    })).rejects.toMatchObject({
      code: "HOSTED_REGISTER_BOOT_CHECK_FAILED:ASK_ROOM_ADMISSION_UNSEALED"
    });
  }, 120_000);

  it("publishes a billing-on version whose code-owned admission row seals the billingQuote, billingCheckout, billingNotify and billingCancelLink scopes", async () => {
    const result = await publishHostedRegister({
      plan: await planOf(billingOnFile()),
      operations: createPostgresHostedRegisterOperations(database.pool)
    });
    expect(result.outcome).toBe("CREATED");
    const version = registerVersionToSafeLegacyNumber(result.registerVersion);
    const admission = await readAdmissionPolicy(database.pool, version);
    expect(admission.billingQuote).toEqual({ key: "owner", limit: 10, windowMs: 3_600_000, capacity: 65_536 });
    expect(admission.billingCheckout).toEqual({ key: "owner", limit: 10, windowMs: 3_600_000, capacity: 65_536 });
    expect(admission.billingNotify).toEqual({ key: "source", limit: 120, windowMs: 60_000, capacity: 65_536 });
    expect(admission.billingCancelLink).toEqual({ key: "source", limit: 5, windowMs: 3_600_000, capacity: 65_536 });
  }, 120_000);

  // One row per admission member a billing-on boot requires (P8c, P9a and P13 each add theirs).
  it.each([
    ["billing_quote"],
    ["billing_checkout"],
    ["billing_notify"],
    ["billing_cancel_link"]
  ])("refuses, after publishing, a billing-on version whose admission row lacks %s", async (member) => {
    const plan = await planOf(billingOnFile());
    const rows = plan.rows.map((row) => {
      if (row.rowKey !== "admissionPolicy") return row;
      const value = JSON.parse(row.valueJsonText) as Record<string, unknown>;
      expect(Object.hasOwn(value, member)).toBe(true);
      delete value[member];
      return {
        rowKey: row.rowKey,
        valueJsonText: parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value), "utf8")),
        sourceRef: row.sourceRef
      };
    });
    await expect(publishHostedRegister({
      plan: { ...plan, rows },
      operations: createPostgresHostedRegisterOperations(database.pool)
    })).rejects.toMatchObject({
      code: "HOSTED_REGISTER_BOOT_CHECK_FAILED:BILLING_ADMISSION_UNSEALED"
    });
  }, 120_000);

  it("refuses, after publishing, a billing-on version that publishes no countryPolicy row", async () => {
    const file = billingOnFile();
    delete file.countryPolicy;
    await expect(publishHostedRegister({
      plan: await planOf(file),
      operations: createPostgresHostedRegisterOperations(database.pool)
    })).rejects.toMatchObject({
      code: "HOSTED_REGISTER_BOOT_CHECK_FAILED:BILLING_CONFIGURATION_INCOMPLETE"
    });
  }, 120_000);

  it("seals the billing rows both boots read, billing off (B11a)", async () => {
    const plan = await planOf(hostedFile());
    const result = await publishHostedRegister({ plan, operations: createPostgresHostedRegisterOperations(database.pool) });
    const version = registerVersionToSafeLegacyNumber(result.registerVersion);
    await expect(readBillingPolicy(database.pool, version)).resolves.toMatchObject({ enabled: false });
    expect((await readBillingPlans(database.pool, version))?.plans.map((plan) => plan.planId))
      .toEqual(["FREE", "PLUS", "PRO", "MAX"]);
  }, 120_000);
});
