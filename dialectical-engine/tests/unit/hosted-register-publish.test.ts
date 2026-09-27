/**
 * Task 14b — the HOSTED register publication command, without a database.
 *
 * Everything the command decides before it opens a connection is decided in
 * `apps/runner/src/hosted-register-publish.ts`: the operator file's custody and
 * shape, the refusals that reuse the deployment-mode checks the two services
 * take at boot, the composed row set, the deterministic publication id, and
 * the dry-run plan. The database-backed half (publish, replay, boot readiness)
 * is `tests/integration/hosted-register-publish.test.ts`.
 */
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HOSTED_REGISTER_EXAMPLE_SOURCE_REF,
  HOSTED_REGISTER_FILE_FORMAT,
  hostedRegisterRefusalCode,
  parseHostedRegisterArguments,
  parseHostedRegisterFile,
  parseHostedScorecardFile,
  planHostedRegisterPublication,
  publishHostedRegister,
  readHostedRegisterFile,
  readHostedScorecardFile,
  renderHostedRegisterPlan,
  type HostedRegisterOperations
} from "../../apps/runner/src/hosted-register-publish.js";
import { runHostedRegisterPublishCli } from "../../apps/runner/src/hosted-register-publish-cli.js";
import {
  ALGORITHM_REGISTER_ROW_KEYS,
  COST_ENVELOPE_POLICY_ROW_KEY,
  CONFIGURED_PROVIDER_SET_ROW_KEY,
  MODEL_SCORECARD_MAX_BYTES,
  MODEL_SCORECARD_ROW_KEY,
  loadBootstrapRegister,
  parseRegisterVersionText,
  readEngineVersion,
  type GeneralRegisterPublication
} from "../../packages/register/src/index.js";
import { compatibleExampleScorecard } from "../support/modelScorecardFixture.js";

const EXAMPLE_PATH = new URL("../../deploy/vps/register/hosted-register.example.json", import.meta.url);
const INLINE_SECRET = "Bearer hosted-register-test-inline-credential-must-never-print";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A file the operator would publish: two vendors on real-looking public names. */
function validFile(): Record<string, unknown> {
  const vetting = {
    dataUseTermsReviewedOn: "2026-09-24",
    retentionTermsReviewedOn: "2026-09-24",
    namedInPrivacyNotice: true
  };
  return {
    format: HOSTED_REGISTER_FILE_FORMAT,
    sourceRef: "task-14b fixture: first hosted register",
    configuredProviderSet: {
      requiredDistinctMakers: 2,
      providers: [
        { providerRef: "vendor:alpha", adapterKind: "openai-compatible-http", maker: "Alpha", vetting },
        { providerRef: "vendor:beta", adapterKind: "openai-compatible-http", maker: "Beta", vetting }
      ]
    },
    costEnvelopePolicy: {
      kind: "COST_ENVELOPE_POLICY",
      currency: "USD",
      minor_units_per_unit: 1_000_000,
      per_run_ceiling_micros: 250_000,
      daily_ceiling_micros: 2_000_000,
      provisional: true,
      provisional_reason: "PROVISIONAL first hosted run ceiling under V-28"
    },
    providerTargets: [
      {
        provider_ref: "vendor:alpha",
        base_url: "https://api.alpha-vendor-fixture.com/v1",
        model: "alpha-large",
        authorization_file: "/etc/debateai/runner/providers/alpha-fixture-path.header",
        input_price_micros_per_million: 3_000_000,
        output_price_micros_per_million: 15_000_000
      },
      {
        provider_ref: "vendor:beta",
        base_url: "https://api.beta-vendor-fixture.com/v1",
        model: "beta-large",
        authorization_file: "/etc/debateai/runner/providers/beta-fixture-path.header",
        input_price_micros_per_million: 1_000_000,
        output_price_micros_per_million: 4_000_000
      }
    ]
  };
}

function bytesOf(value: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(value), "utf8");
}

async function custodyFile(contents: string | Uint8Array, mode = 0o600): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "debateai-hosted-register-"));
  temporaryRoots.push(root);
  await chmod(root, 0o700);
  const path = join(root, "hosted-register.json");
  await writeFile(path, contents);
  await chmod(path, mode);
  return path;
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return hostedRegisterRefusalCode(error);
  }
  return "NO_REFUSAL";
}

async function codeOfAsync(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return hostedRegisterRefusalCode(error);
  }
  return "NO_REFUSAL";
}

async function planCode(file: unknown): Promise<string> {
  return codeOfAsync(async () => planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(file))));
}

const RECORDED_AT = new Date("2026-09-25T00:00:00.000Z");

/**
 * Records every operation; a refusal must leave this list empty. `existing`
 * models a publication the database already holds: its receipt was recorded
 * before this run read the clock.
 */
function recordingOperations(existing: string | null = null, bootFailure: unknown = null) {
  const calls: string[] = [];
  const publications: GeneralRegisterPublication[] = [];
  const operations: HostedRegisterOperations = {
    async assertPublisher() { calls.push("assertPublisher"); },
    async importHistoricalBootstrap() { calls.push("importHistoricalBootstrap"); },
    async databaseNow() {
      calls.push("databaseNow");
      return new Date(RECORDED_AT.getTime() + (existing === null ? -1_000 : 1_000));
    },
    async publishGeneral(input) {
      calls.push("publishGeneral");
      publications.push(input);
      return Object.freeze({
        registerVersion: parseRegisterVersionText(existing ?? "5"),
        baseRegisterVersion: input.baseRegisterVersion,
        publicationId: input.publicationId,
        publicationKind: "GENERAL" as const,
        requestSha256: "a".repeat(64),
        snapshotSha256: "b".repeat(64),
        rowCount: input.rows.length,
        recordedAt: RECORDED_AT
      });
    },
    async verifyBootReadiness() {
      calls.push("verifyBootReadiness");
      if (bootFailure !== null) throw bootFailure;
    }
  };
  return { operations, calls, publications };
}

describe("Task 14b · the operator's hosted register file", () => {
  it("ships an example the command accepts in a dry run, with the provisional envelopes", async () => {
    const example = JSON.parse(await readFile(EXAMPLE_PATH, "utf8")) as Record<string, unknown>;
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(example)));
    expect(plan.costEnvelope).toMatchObject({
      perRunCeilingMicros: 250_000,
      dailyCeilingMicros: 2_000_000,
      provisional: true
    });
    expect(plan.vendorRefs.length).toBeGreaterThanOrEqual(2);
    // Every example vendor sits under a reserved example name, so the plan says so.
    expect(plan.exampleTargetRefs).toEqual(plan.vendorRefs);
  });

  it("refuses to PUBLISH the example's vendors, which live under reserved example names", async () => {
    const example = JSON.parse(await readFile(EXAMPLE_PATH, "utf8")) as Record<string, unknown>;
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(example)));
    const recorded = recordingOperations();
    const code = await codeOfAsync(() => publishHostedRegister({ plan, operations: recorded.operations }));
    expect(code).toMatch(/^HOSTED_REGISTER_EXAMPLE_VENDOR_REFUSED:/u);
    expect(recorded.calls).toEqual([]);
  });

  it("names the example's own sourceRef, so a copy that kept it is recognised", async () => {
    const example = JSON.parse(await readFile(EXAMPLE_PATH, "utf8")) as Record<string, unknown>;
    expect(example.sourceRef).toBe(HOSTED_REGISTER_EXAMPLE_SOURCE_REF);
  });

  /**
   * Review Minor 3: ANY example literal left in a real file refuses the
   * publication — a vendor ref, a maker, a vetting date, or the sourceRef —
   * even when every address was replaced with a real one.
   */
  it("refuses to publish a file that kept any one of the example's literals", async () => {
    const vendors = (file: Record<string, unknown>) =>
      (file.configuredProviderSet as { providers: Record<string, unknown>[] }).providers;
    const targets = (file: Record<string, unknown>) => file.providerTargets as Record<string, unknown>[];
    const cases: Record<string, (file: Record<string, unknown>) => void> = {
      "example vendor ref": (file) => {
        vendors(file)[0]!.providerRef = "vendor:example-alpha";
        targets(file)[0]!.provider_ref = "vendor:example-alpha";
      },
      "example maker": (file) => { vendors(file)[1]!.maker = "ExampleBeta"; },
      "example vetting date": (file) => {
        vendors(file)[0]!.vetting = { ...(vendors(file)[0]!.vetting as object), retentionTermsReviewedOn: "2000-01-01" };
      },
      "example sourceRef": (file) => { file.sourceRef = HOSTED_REGISTER_EXAMPLE_SOURCE_REF; }
    };
    for (const [name, mutate] of Object.entries(cases)) {
      const file = validFile();
      mutate(file);
      const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(file)));
      const recorded = recordingOperations();
      const code = await codeOfAsync(() => publishHostedRegister({ plan, operations: recorded.operations }));
      expect(code, name).toMatch(/^HOSTED_REGISTER_EXAMPLE_(?:VENDOR|SOURCE_REF)_REFUSED\b/u);
      expect(recorded.calls, name).toEqual([]);
    }
  });

  it("composes ONE complete deployment set: the vetted provider set and the operator's envelopes", async () => {
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(validFile())));
    const byKey = new Map(plan.rows.map((row) => [row.rowKey, row]));
    expect(byKey.size).toBe(plan.rows.length);
    for (const key of ALGORITHM_REGISTER_ROW_KEYS) expect(byKey.has(key), key).toBe(true);
    const providerSet = JSON.parse(byKey.get(CONFIGURED_PROVIDER_SET_ROW_KEY)!.valueJsonText) as Record<string, unknown>;
    expect(providerSet).toMatchObject({ kind: "CONFIGURED_PROVIDER_SET", setVersion: 2, requiredDistinctMakers: 2 });
    const envelope = JSON.parse(byKey.get(COST_ENVELOPE_POLICY_ROW_KEY)!.valueJsonText) as Record<string, unknown>;
    expect(envelope).toMatchObject({ per_run_ceiling_micros: 250_000, daily_ceiling_micros: 2_000_000 });
    // The sealed historical bootstrap is the base, exactly as the seeder uses it.
    expect(plan.baseRegisterVersion).toBe(String((await loadBootstrapRegister()).registerVersion));
    expect(plan.exampleTargetRefs).toEqual([]);
  });

  it("derives the publication id from content, so the same file replays the same publication", async () => {
    const first = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(validFile())));
    const second = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(validFile())));
    expect(second.publicationId).toBe(first.publicationId);
    expect(second.snapshotSha256).toBe(first.snapshotSha256);
    const changed = validFile();
    (changed.costEnvelopePolicy as Record<string, unknown>).per_run_ceiling_micros = 300_000;
    const third = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(changed)));
    expect(third.publicationId).not.toBe(first.publicationId);
  });

  it("seals nothing from the provider targets: no path, no URL, no credential file", async () => {
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(validFile())));
    for (const row of plan.rows) {
      const sealed = `${row.rowKey} ${row.valueJsonText} ${row.sourceRef}`;
      expect(sealed, row.rowKey).not.toContain("/etc/");
      expect(sealed, row.rowKey).not.toContain("base_url");
      expect(sealed, row.rowKey).not.toMatch(/https?:\/\//u);
      expect(sealed, row.rowKey).not.toContain("authorization");
      expect(sealed, row.rowKey).not.toContain("fixture-path");
      expect(sealed, row.rowKey).not.toContain("price");
    }
  });

  it("says in the plan that the code-owned rows carry development provenance", async () => {
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(validFile())));
    expect(renderHostedRegisterPlan(plan)).toMatch(/^provenance=development-source-refs \(known limitation\)$/mu);
  });

  it("prints a plan with no credential path and no secret", async () => {
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(validFile())));
    const text = renderHostedRegisterPlan(plan);
    expect(text).toContain("HOSTED_REGISTER_PLAN");
    expect(text).toContain(`publication_id=${plan.publicationId}`);
    expect(text).toContain("per_run_ceiling_micros=250000");
    expect(text).not.toContain("authorization_file");
    expect(text).not.toContain("fixture-path");
    expect(text).not.toContain("/etc/debateai");
  });
});

describe("Task 14b · refusals, each by its typed code", () => {
  it("refuses an unknown top-level key", () => {
    expect(codeOf(() => parseHostedRegisterFile(bytesOf({ ...validFile(), notes: "x" }))))
      .toBe("HOSTED_REGISTER_FILE_KEY_UNKNOWN");
  });

  it("refuses an unknown key inside a vendor entry", () => {
    const file = validFile();
    const providers = (file.configuredProviderSet as { providers: Record<string, unknown>[] }).providers;
    providers[0] = { ...providers[0]!, endpoint: "https://api.alpha-vendor-fixture.com/v1" };
    expect(codeOf(() => parseHostedRegisterFile(bytesOf(file)))).toBe("HOSTED_REGISTER_FILE_INVALID");
  });

  it("refuses a file that is not the declared format, not JSON, or carries a duplicate key", () => {
    expect(codeOf(() => parseHostedRegisterFile(bytesOf({ ...validFile(), format: "v0" }))))
      .toBe("HOSTED_REGISTER_FILE_INVALID");
    expect(codeOf(() => parseHostedRegisterFile(Buffer.from("{not json")))).toBe("HOSTED_REGISTER_FILE_INVALID");
  });

  /**
   * Review Important 3: the duplicate must sit in a file that is otherwise
   * COMPLETE and valid, so nothing but the canonical parser can refuse it.
   * `JSON.parse` keeps the last `sourceRef` and would accept this file whole.
   */
  it("refuses a complete, otherwise valid file that repeats one key", () => {
    const complete = JSON.stringify(validFile());
    const duplicated = `{"sourceRef":"an earlier sourceRef the operator forgot to delete",${complete.slice(1)}`;
    // Controls: the complete file is accepted, and JSON.parse alone takes the duplicate.
    expect(codeOf(() => parseHostedRegisterFile(Buffer.from(complete)))).toBe("NO_REFUSAL");
    expect((JSON.parse(duplicated) as { sourceRef: string }).sourceRef)
      .toBe("task-14b fixture: first hosted register");
    expect(codeOf(() => parseHostedRegisterFile(Buffer.from(duplicated)))).toBe("HOSTED_REGISTER_FILE_INVALID");
  });

  it("refuses a file missing a row a hosted start-up needs", () => {
    for (const rowKey of ["costEnvelopePolicy", "configuredProviderSet"] as const) {
      const file = validFile();
      delete file[rowKey];
      expect(codeOf(() => parseHostedRegisterFile(bytesOf(file))), rowKey)
        .toBe(`HOSTED_REGISTER_ROW_MISSING:${rowKey}`);
    }
  });

  it("refuses a file without the provider targets the prices and addresses are checked on", () => {
    const file = validFile();
    delete file.providerTargets;
    expect(codeOf(() => parseHostedRegisterFile(bytesOf(file)))).toBe("HOSTED_REGISTER_PROVIDER_TARGETS_MISSING");
  });

  it("refuses an absent price and a zero price with the boot's own codes", async () => {
    const absent = validFile();
    const absentTargets = absent.providerTargets as Record<string, unknown>[];
    delete absentTargets[0]!.input_price_micros_per_million;
    delete absentTargets[0]!.output_price_micros_per_million;
    expect(await planCode(absent)).toBe("PROVIDER_TARGET_PRICE_REQUIRED:vendor:alpha");

    const zero = validFile();
    (zero.providerTargets as Record<string, unknown>[])[1]!.output_price_micros_per_million = 0;
    expect(await planCode(zero)).toBe("PROVIDER_TARGET_PRICE_ZERO:vendor:beta");
  });

  it("refuses a relay or a loopback target with the hosted deployment's own codes", async () => {
    const loopback = validFile();
    (loopback.providerTargets as Record<string, unknown>[])[0]!.base_url = "https://127.0.0.1:8443/v1";
    expect(await planCode(loopback)).toBe("PROVIDER_TARGET_LOOPBACK_REFUSED:vendor:alpha");

    const privateRelay = validFile();
    (privateRelay.providerTargets as Record<string, unknown>[])[0]!.base_url = "https://10.0.0.2:8443/v1";
    expect(await planCode(privateRelay)).toBe("PROVIDER_TARGET_LOOPBACK_REFUSED:vendor:alpha");

    const cleartextRelay = validFile();
    (cleartextRelay.providerTargets as Record<string, unknown>[])[1]!.base_url = "http://127.0.0.1:11434/v1";
    expect(await planCode(cleartextRelay)).toBe("PROVIDER_BASE_URL_TLS_REQUIRED:vendor:beta");
  });

  it("refuses an inline credential without ever repeating it", async () => {
    const file = validFile();
    const target = (file.providerTargets as Record<string, unknown>[])[0]!;
    delete target.authorization_file;
    target.authorization_header = INLINE_SECRET;
    let message = "";
    try {
      await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(file)));
    } catch (error) {
      message = `${hostedRegisterRefusalCode(error)} ${String(error)} ${JSON.stringify(error)}`;
    }
    expect(message).toContain("PROVIDER_INLINE_CREDENTIAL_REFUSED:vendor:alpha");
    expect(message).not.toContain("hosted-register-test-inline-credential");
  });

  it("refuses a vendor with no V-9(4) vetting record", async () => {
    const file = validFile();
    const providers = (file.configuredProviderSet as { providers: Record<string, unknown>[] }).providers;
    providers[1] = { ...providers[1]!, vetting: { ...(providers[1]!.vetting as object), namedInPrivacyNotice: false } };
    expect(await planCode(file)).toBe("PROVIDER_VENDOR_NOT_VETTED:vendor:beta");
  });

  it("refuses provider targets that do not match the vendor list one to one", async () => {
    const file = validFile();
    (file.providerTargets as unknown[]).pop();
    expect(await planCode(file)).toBe("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");
  });

  it("refuses envelopes the register's own schema refuses", async () => {
    const file = validFile();
    (file.costEnvelopePolicy as Record<string, unknown>).daily_ceiling_micros = 100_000;
    expect(await planCode(file)).toBe("COST_ENVELOPE_POLICY_INVALID");
    const floating = validFile();
    (floating.costEnvelopePolicy as Record<string, unknown>).per_run_ceiling_micros = 0.25;
    expect(await planCode(floating)).toBe("COST_ENVELOPE_POLICY_INVALID");
  });

  it("refuses fewer distinct makers than the set requires, instead of sealing a set no boot can use", async () => {
    const file = validFile();
    (file.configuredProviderSet as Record<string, unknown>).requiredDistinctMakers = 3;
    expect(await planCode(file)).toBe("HOSTED_REGISTER_MAKER_CAPABILITY_INSUFFICIENT");
    const sameMaker = validFile();
    const providers = (sameMaker.configuredProviderSet as { providers: Record<string, unknown>[] }).providers;
    providers[1] = { ...providers[1]!, maker: "Alpha" };
    expect(await planCode({
      ...sameMaker,
      synthesisRoles: { synthesizerRoleRef: "vendor:alpha", evaluatorRoleRef: "vendor:beta" }
    })).toBe("HOSTED_REGISTER_MAKER_CAPABILITY_INSUFFICIENT");
  });

  it("refuses a synthesis role that names no configured vendor", async () => {
    const file = { ...validFile(), synthesisRoles: { synthesizerRoleRef: "vendor:alpha", evaluatorRoleRef: "vendor:gamma" } };
    expect(await planCode(file)).toBe("HOSTED_REGISTER_ROLE_REF_UNCONFIGURED");
  });

  it("refuses a usage it does not understand", () => {
    expect(codeOf(() => parseHostedRegisterArguments([]))).toBe("HOSTED_REGISTER_USAGE");
    expect(codeOf(() => parseHostedRegisterArguments(["--file"]))).toBe("HOSTED_REGISTER_USAGE");
    expect(codeOf(() => parseHostedRegisterArguments(["--file", "a.json", "--force"]))).toBe("HOSTED_REGISTER_USAGE");
    expect(codeOf(() => parseHostedRegisterArguments(["--dry-run", "--dry-run", "--file", "a.json"])))
      .toBe("HOSTED_REGISTER_USAGE");
    expect(parseHostedRegisterArguments(["--dry-run", "--file", "a.json"])).toMatchObject({ dryRun: true });
    expect(parseHostedRegisterArguments(["--file", "a.json"])).toMatchObject({ dryRun: false });
  });
});

describe("Task 14b · the file is read under the custody contract", () => {
  it("reads a 0600 file in a 0700 directory owned by the caller", async () => {
    const path = await custodyFile(JSON.stringify(validFile()));
    const file = await readHostedRegisterFile(path);
    expect(file.sourceRef).toBe("task-14b fixture: first hosted register");
  });

  it("refuses a file other principals could read or replace", async () => {
    const path = await custodyFile(JSON.stringify(validFile()), 0o644);
    expect(await codeOfAsync(() => readHostedRegisterFile(path))).toBe("HOSTED_REGISTER_FILE_CUSTODY_INVALID");
  });

  it("refuses a 0600 file whose directory other principals can enter and list", async () => {
    const path = await custodyFile(JSON.stringify(validFile()));
    await chmod(join(path, ".."), 0o755);
    expect(await codeOfAsync(() => readHostedRegisterFile(path))).toBe("HOSTED_REGISTER_FILE_CUSTODY_INVALID");
  });

  it("refuses a symlink and names an absent file as absent", async () => {
    const path = await custodyFile(JSON.stringify(validFile()));
    const link = `${path}.link`;
    await symlink(path, link);
    expect(await codeOfAsync(() => readHostedRegisterFile(link))).toBe("HOSTED_REGISTER_FILE_CUSTODY_INVALID");
    expect(await codeOfAsync(() => readHostedRegisterFile(`${path}.absent`))).toBe("HOSTED_REGISTER_FILE_ABSENT");
  });
});

describe("Task 14b · publication order", () => {
  it("asserts the publisher, imports the sealed bootstrap, publishes ONE hosted version, then checks boot", async () => {
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(validFile())));
    const recorded = recordingOperations();
    const result = await publishHostedRegister({ plan, operations: recorded.operations });
    expect(recorded.calls).toEqual([
      "assertPublisher", "importHistoricalBootstrap", "databaseNow", "publishGeneral", "verifyBootReadiness"
    ]);
    expect(recorded.publications).toHaveLength(1);
    expect(recorded.publications[0]).toMatchObject({
      deployment: "hosted",
      publicationId: plan.publicationId,
      baseRegisterVersion: String((await loadBootstrapRegister()).registerVersion)
    });
    expect(result).toMatchObject({ outcome: "CREATED", registerVersion: "5" });
  });

  it("names a byte-identical re-publish as a replay of the version that already holds it", async () => {
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(validFile())));
    const recorded = recordingOperations("7");
    const result = await publishHostedRegister({ plan, operations: recorded.operations });
    expect(result).toMatchObject({ outcome: "REPLAYED", registerVersion: "7" });
  });
});

/**
 * Review Important 2 — a version that is SEALED but that a boot reader refused
 * must never read like success: no `REGISTER_VERSION=` line, an explicit
 * NOT_BOOT_READY line, the BOOT_CHECK_FAILED label kept whatever the reader's
 * code contains, and a non-zero exit.
 */
describe("Task 14b · a published version the boot readers refuse", () => {
  const readerFailure = new TypeError("PROVIDER_TARGET_PRICE_REQUIRED:vendor/a,b c");

  it("keeps the BOOT_CHECK_FAILED label with a sanitised inner code", async () => {
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(validFile())));
    const recorded = recordingOperations(null, readerFailure);
    const code = await codeOfAsync(() => publishHostedRegister({ plan, operations: recorded.operations }));
    expect(code).toBe("HOSTED_REGISTER_BOOT_CHECK_FAILED:PROVIDER_TARGET_PRICE_REQUIRED:vendor_a_b");
    expect(recorded.calls.at(-1)).toBe("verifyBootReadiness");
  });

  it("never falls back to the generic code, even for an untyped reader failure", async () => {
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(validFile())));
    for (const failure of [new Error("permission denied for table register_row"), "a string", null]) {
      const recorded = recordingOperations(null, failure ?? new Error());
      expect(await codeOfAsync(() => publishHostedRegister({ plan, operations: recorded.operations })))
        .toBe("HOSTED_REGISTER_BOOT_CHECK_FAILED:UNKNOWN");
    }
  });

  it("prints NOT_BOOT_READY and never REGISTER_VERSION= from the command", async () => {
    const path = await custodyFile(JSON.stringify(validFile()));
    const recorded = recordingOperations(null, readerFailure);
    let stdout = "";
    let stderr = "";
    const exitCode = await runHostedRegisterPublishCli(["--file", path], {
      stdout: (text) => { stdout += text; },
      stderr: (text) => { stderr += text; }
    }, async () => ({ operations: recorded.operations, close: async () => undefined }));
    expect(exitCode).not.toBe(0);
    expect(stdout).toMatch(/^HOSTED_REGISTER_NOT_BOOT_READY register_version=5 /mu);
    expect(stdout).not.toMatch(/^REGISTER_VERSION=/mu);
    expect(stdout).not.toMatch(/^HOSTED_REGISTER_BOOT_READY/mu);
    expect(stdout).not.toMatch(/^HOSTED_REGISTER_PUBLISHED/mu);
    expect(stderr).toBe("HOSTED_REGISTER_BOOT_CHECK_FAILED:PROVIDER_TARGET_PRICE_REQUIRED:vendor_a_b\n");
  });

  it("prints the version to pin only when the boot readers accept it", async () => {
    const path = await custodyFile(JSON.stringify(validFile()));
    const recorded = recordingOperations();
    let stdout = "";
    let stderr = "";
    let closed = false;
    const exitCode = await runHostedRegisterPublishCli(["--file", path], {
      stdout: (text) => { stdout += text; },
      stderr: (text) => { stderr += text; }
    }, async () => ({ operations: recorded.operations, close: async () => { closed = true; } }));
    expect({ exitCode, stderr, closed }).toEqual({ exitCode: 0, stderr: "", closed: true });
    expect(stdout).toMatch(/^HOSTED_REGISTER_BOOT_READY register_version=5$/mu);
    expect(stdout).toMatch(/^REGISTER_VERSION=5$/mu);
  });
});

/**
 * A19 — THE MODEL SCORECARD, published beside the register file.
 *
 * `--scorecard <file>` carries the owners' approved scorecard as ONE ADDITIVE
 * operator row: it has no code-owned twin, it comes from its own
 * custody-checked file under the scorecard bound (64 KiB, owner ruling
 * 2026-09-27, the same constant local mode reads under), and it is judged by
 * the engine's own scorecard validation. Every other row the command seals is
 * exactly what it seals without the scorecard.
 */
describe("A19 · the model scorecard, published beside the register file", () => {
  async function hostedScorecard(scorecardVersion?: number) {
    return parseHostedScorecardFile(
      bytesOf(await compatibleExampleScorecard(scorecardVersion)), await readEngineVersion()
    );
  }

  const registerFile = () => parseHostedRegisterFile(bytesOf(validFile()));

  it("accepts --scorecard once, beside --file, and nothing else new", () => {
    expect(parseHostedRegisterArguments(["--file", "a.json", "--scorecard", "s.json"]))
      .toMatchObject({ dryRun: false, scorecardPath: resolve("s.json") });
    expect(parseHostedRegisterArguments(["--file", "a.json"])).toMatchObject({ scorecardPath: null });
    for (const args of [
      ["--file", "a.json", "--scorecard"],
      ["--file", "a.json", "--scorecard", "--dry-run"],
      ["--file", "a.json", "--scorecard", "s.json", "--scorecard", "t.json"],
      ["--scorecard", "s.json"]
    ]) {
      expect(codeOf(() => parseHostedRegisterArguments(args)), args.join(" ")).toBe("HOSTED_REGISTER_USAGE");
    }
  });

  it("adds ONE modelScorecard row and leaves every other row exactly as without it", async () => {
    const without = await planHostedRegisterPublication(registerFile());
    const carried = await planHostedRegisterPublication(registerFile(), await hostedScorecard());
    expect(without.rows.some((row) => row.rowKey === MODEL_SCORECARD_ROW_KEY)).toBe(false);
    expect(without.modelScorecard).toBeNull();
    expect(carried.rows.filter((row) => row.rowKey === MODEL_SCORECARD_ROW_KEY)).toHaveLength(1);
    expect(carried.rows.filter((row) => row.rowKey !== MODEL_SCORECARD_ROW_KEY)).toEqual(without.rows);
  });

  it("seals the operator's canonical document, with provenance naming the file, the version and the hash", async () => {
    const sealed = await hostedScorecard(9);
    const plan = await planHostedRegisterPublication(registerFile(), sealed);
    const row = plan.rows.find((candidate) => candidate.rowKey === MODEL_SCORECARD_ROW_KEY)!;
    expect(row.valueJsonText).toBe(sealed.valueJsonText);
    expect(JSON.parse(row.valueJsonText)).toMatchObject({ kind: "DEBATEAI_SCORECARD", scorecardVersion: 9 });
    expect(row.sourceRef).toBe(`task-14b fixture: first hosted register | modelScorecard v9 sha256:${sealed.sha256}`);
    // Carry 8: the plan also carries the API-route count it prints.
    expect(plan.modelScorecard).toEqual({
      scorecardVersion: 9, candidateCount: sealed.candidateCount, apiCandidateCount: sealed.apiCandidateCount,
      sha256: sealed.sha256, bytes: sealed.bytes
    });
  });

  it("makes a different scorecard a different publication, and the same one a replay", async () => {
    const first = await planHostedRegisterPublication(registerFile(), await hostedScorecard(4));
    const same = await planHostedRegisterPublication(registerFile(), await hostedScorecard(4));
    const next = await planHostedRegisterPublication(registerFile(), await hostedScorecard(5));
    const none = await planHostedRegisterPublication(registerFile());
    expect(same.publicationId).toBe(first.publicationId);
    expect(new Set([first.publicationId, next.publicationId, none.publicationId]).size).toBe(3);
  });

  it("says in the plan whether a scorecard is carried", async () => {
    expect(renderHostedRegisterPlan(await planHostedRegisterPublication(registerFile())))
      .toMatch(/^model_scorecard=none \(asks keep the plan rosters\)$/mu);
    expect(renderHostedRegisterPlan(await planHostedRegisterPublication(registerFile(), await hostedScorecard(6))))
      .toMatch(/^model_scorecard version=6 candidates=\d+ bytes=\d+ sha256=[0-9a-f]{64}$/mu);
  });

  /**
   * Carry 8 (pre-flight H5). The hosted site reaches a model only through an
   * API, so the plan says how many of the scorecard's candidates have an API
   * route, and says in plain words when none has. That is NOT a refusal: the
   * scorecard stays VALID and is sealed, and relays never run hosted either way.
   */
  it("counts the candidates with an API route and prints that count", async () => {
    const example = await compatibleExampleScorecard(6);
    const candidates = example.candidates as Array<{ accessRoutes: Array<{ kind: string }> }>;
    const expected = candidates.filter((candidate) => candidate.accessRoutes.some((route) => route.kind === "API")).length;
    // Not vacuous: the example mixes API and subscription-only candidates, so
    // counting every candidate, or none, fails this row.
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(candidates.length);
    const sealed = parseHostedScorecardFile(bytesOf(example), await readEngineVersion());
    expect(sealed.apiCandidateCount).toBe(expected);
    const plan = await planHostedRegisterPublication(registerFile(), sealed);
    expect(plan.modelScorecard?.apiCandidateCount).toBe(expected);
    const text = renderHostedRegisterPlan(plan);
    expect(text).toContain(
      `\nmodel_scorecard api_candidates=${expected} (${expected} of the ${candidates.length} scored models`
      + " can be reached through an API; the hosted site reaches models only that way)\n"
    );
    expect(text).not.toMatch(/^model_scorecard note:/mu);
  });

  it("says in plain words when no candidate has an API route, and still publishes the scorecard", async () => {
    const example = await compatibleExampleScorecard(6);
    const subscriptionOnly = {
      ...example,
      candidates: (example.candidates as Array<Record<string, unknown>>).map((candidate) => ({
        ...candidate, accessRoutes: [{ kind: "SUBSCRIPTION", tool: "claude" }]
      }))
    };
    const sealed = parseHostedScorecardFile(bytesOf(subscriptionOnly), await readEngineVersion());
    expect(sealed.apiCandidateCount).toBe(0);
    const plan = await planHostedRegisterPublication(registerFile(), sealed);
    const text = renderHostedRegisterPlan(plan);
    expect(text).toMatch(/^model_scorecard api_candidates=0 \(0 of the \d+ scored models /mu);
    expect(text).toContain(
      "\nmodel_scorecard note: none of these models can be reached through an API, so the hosted site will keep"
      + " using the plan's usual models until a model it can reach through an API is scored."
      + " The scorecard is still valid and can still be published.\n"
    );
    const recorded = recordingOperations();
    await expect(publishHostedRegister({ plan, operations: recorded.operations }))
      .resolves.toMatchObject({ outcome: "CREATED" });
    expect(recorded.publications[0]!.rows.filter((row) => row.rowKey === MODEL_SCORECARD_ROW_KEY)).toHaveLength(1);
  });

  it("refuses a scorecard the engine refuses, by the scorecard's own reason", async () => {
    const engine = await readEngineVersion();
    const base = await compatibleExampleScorecard();
    expect(codeOf(() => parseHostedScorecardFile(bytesOf({ ...base, kind: "NOT_A_SCORECARD" }), engine)))
      .toBe("HOSTED_REGISTER_SCORECARD_REFUSED:SCHEMA_INVALID");
    expect(codeOf(() => parseHostedScorecardFile(bytesOf({
      ...base, engineCompatibility: { minEngineVersion: "999999.0.0", maxEngineVersion: null }
    }), engine))).toBe("HOSTED_REGISTER_SCORECARD_REFUSED:ENGINE_INCOMPATIBLE");
  });

  it("refuses bytes the register could not seal", async () => {
    const engine = await readEngineVersion();
    for (const bytes of [
      new Uint8Array(),
      Buffer.from("not json", "utf8"),
      Buffer.from("{\"kind\":\"DEBATEAI_SCORECARD\",\"kind\":\"DEBATEAI_SCORECARD\"}", "utf8"),
      Buffer.from("{\"balancedMargin\":1e-7}", "utf8"),
      new Uint8Array(MODEL_SCORECARD_MAX_BYTES + 1)
    ]) {
      expect(codeOf(() => parseHostedScorecardFile(bytes, engine))).toBe("HOSTED_REGISTER_SCORECARD_FILE_INVALID");
    }
  });

  it("reads the scorecard under the same custody contract, with its own codes", async () => {
    const engine = await readEngineVersion();
    const loose = await custodyFile(JSON.stringify(await compatibleExampleScorecard()), 0o644);
    expect(await codeOfAsync(() => readHostedScorecardFile(loose, engine)))
      .toBe("HOSTED_REGISTER_SCORECARD_FILE_CUSTODY_INVALID");
    expect(await codeOfAsync(() => readHostedScorecardFile(`${loose}.absent`, engine)))
      .toBe("HOSTED_REGISTER_SCORECARD_FILE_ABSENT");
  });

  /*
   * Owner ruling 2026-09-27: the scorecard bound is 64 KiB, the SAME constant
   * local mode reads the bundled file under, so one file gets one answer in
   * both modes. It caps the file and the canonical text that is sealed.
   */
  it("admits a scorecard file of exactly 64 KiB, and refuses one byte more", async () => {
    const engine = await readEngineVersion();
    const padded = JSON.stringify(await compatibleExampleScorecard(undefined, MODEL_SCORECARD_MAX_BYTES));
    const size = Buffer.byteLength(padded, "utf8");
    expect(size).toBeGreaterThan(MODEL_SCORECARD_MAX_BYTES - 1_024);
    const atBound = await custodyFile(padded + " ".repeat(MODEL_SCORECARD_MAX_BYTES - size));
    const sealed = await readHostedScorecardFile(atBound, engine);
    expect(sealed.bytes).toBeGreaterThan(MODEL_SCORECARD_MAX_BYTES - 1_024);
    expect(sealed.bytes).toBeLessThanOrEqual(MODEL_SCORECARD_MAX_BYTES);
    const over = await custodyFile(padded + " ".repeat(MODEL_SCORECARD_MAX_BYTES + 1 - size));
    expect(await codeOfAsync(() => readHostedScorecardFile(over, engine))).toBe("HOSTED_REGISTER_SCORECARD_FILE_INVALID");
  });

  it("refuses a file under 64 KiB whose sealed form is over it", async () => {
    // "\n" is 2 bytes in the file and `\u000a`, 6 bytes, in the register's canonical form.
    const engine = await readEngineVersion();
    const base = await compatibleExampleScorecard();
    // Control: an unknown field is ignored by the scorecard format, so a short one is accepted.
    expect(codeOf(() => parseHostedScorecardFile(bytesOf({ ...base, futureNote: "\n" }), engine))).toBe("NO_REFUSAL");
    const expanding = bytesOf({ ...base, futureNote: "\n".repeat(12_000) });
    expect(expanding.byteLength).toBeLessThanOrEqual(MODEL_SCORECARD_MAX_BYTES);
    expect(codeOf(() => parseHostedScorecardFile(expanding, engine))).toBe("HOSTED_REGISTER_SCORECARD_FILE_INVALID");
  });

  it("prints the scorecard in a dry run and seals it through the command", async () => {
    const path = await custodyFile(JSON.stringify(validFile()));
    const scorecardPath = await custodyFile(JSON.stringify(await compatibleExampleScorecard(7)));
    let stdout = "";
    let stderr = "";
    const output = {
      stdout: (text: string) => { stdout += text; },
      stderr: (text: string) => { stderr += text; }
    };
    expect(await runHostedRegisterPublishCli(["--dry-run", "--file", path, "--scorecard", scorecardPath], output,
      async () => { throw new Error("a dry run opens nothing"); })).toBe(0);
    expect(stdout).toMatch(/^model_scorecard version=7 /mu);
    const recorded = recordingOperations();
    expect(await runHostedRegisterPublishCli(["--file", path, "--scorecard", scorecardPath], output,
      async () => ({ operations: recorded.operations, close: async () => undefined }))).toBe(0);
    expect(stderr).toBe("");
    expect(recorded.publications[0]!.rows.filter((row) => row.rowKey === MODEL_SCORECARD_ROW_KEY)).toHaveLength(1);
  });

  it("refuses a scorecard problem as operator input, before any connection", async () => {
    const path = await custodyFile(JSON.stringify(validFile()));
    let opened = false;
    let stderr = "";
    const exitCode = await runHostedRegisterPublishCli(
      ["--file", path, "--scorecard", `${path}.absent`],
      { stdout: () => undefined, stderr: (text) => { stderr += text; } },
      async () => { opened = true; throw new Error("unreachable"); }
    );
    expect({ exitCode, stderr, opened })
      .toEqual({ exitCode: 2, stderr: "HOSTED_REGISTER_SCORECARD_FILE_ABSENT\n", opened: false });
  });
});
