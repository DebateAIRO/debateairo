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
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HOSTED_REGISTER_EXAMPLE_SOURCE_REF,
  HOSTED_REGISTER_FILE_FORMAT,
  hostedRegisterRefusalCode,
  parseHostedRegisterArguments,
  parseHostedRegisterFile,
  planHostedRegisterPublication,
  publishHostedRegister,
  readHostedRegisterFile,
  renderHostedRegisterPlan,
  type HostedRegisterOperations
} from "../../apps/runner/src/hosted-register-publish.js";
import { runHostedRegisterPublishCli } from "../../apps/runner/src/hosted-register-publish-cli.js";
import {
  ALGORITHM_REGISTER_ROW_KEYS,
  COST_ENVELOPE_POLICY_ROW_KEY,
  CONFIGURED_PROVIDER_SET_ROW_KEY,
  STORY_ROW_KEYS,
  loadBootstrapRegister,
  parseRegisterVersionText,
  readStoryPolicy,
  type GeneralRegisterPublication
} from "../../packages/register/src/index.js";

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

  /**
   * Engine money rule, Task M1 (spec 2026-09-26 §14.4.1). `costEnvelopePolicy`
   * stays operator-owned, so the answer's reserve and overrun reach a hosted
   * deployment only through this file. The format string stays v1: every v1
   * file already published stays valid and keeps its meaning (missing = 0).
   */
  it("ships an example carrying the answer's reserve (3000) and overrun (2000), and the plan prints them", async () => {
    const example = JSON.parse(await readFile(EXAMPLE_PATH, "utf8")) as Record<string, unknown>;
    expect(example.format).toBe("debateai.hosted-register.v1");
    expect(example.costEnvelopePolicy).toMatchObject({
      serve_reserve_basis_points: 3_000,
      serve_overrun_basis_points: 2_000
    });
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(example)));
    expect(plan.costEnvelope).toMatchObject({ serveReserveBasisPoints: 3_000, serveOverrunBasisPoints: 2_000 });
    expect(renderHostedRegisterPlan(plan))
      .toMatch(/^cost_envelope .* serve_reserve_basis_points=3000 serve_overrun_basis_points=2000$/mu);
    const envelope = plan.rows.find((row) => row.rowKey === COST_ENVELOPE_POLICY_ROW_KEY);
    expect(JSON.parse(envelope!.valueJsonText)).toMatchObject({
      serve_reserve_basis_points: 3_000, serve_overrun_basis_points: 2_000
    });
  });

  it("keeps a v1 file WITHOUT the two members valid, and means 0 by it (the margin is off)", async () => {
    const file = validFile();
    expect(file.costEnvelopePolicy).not.toHaveProperty("serve_reserve_basis_points");
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(file)));
    expect(plan.costEnvelope).toMatchObject({ serveReserveBasisPoints: 0, serveOverrunBasisPoints: 0 });
    expect(renderHostedRegisterPlan(plan)).toContain("serve_reserve_basis_points=0 serve_overrun_basis_points=0");
    // The SEALED row is the operator's value verbatim: the code-owned row's 3000
    // and 2000 can never slip into a hosted version the operator did not write.
    const envelope = plan.rows.find((row) => row.rowKey === COST_ENVELOPE_POLICY_ROW_KEY);
    expect(envelope).toBeDefined();
    const sealed = JSON.parse(envelope!.valueJsonText) as Record<string, unknown>;
    expect(sealed).not.toHaveProperty("serve_reserve_basis_points");
    expect(sealed).not.toHaveProperty("serve_overrun_basis_points");
  });

  it("refuses an overrun the day cannot hold, by the register's own code", async () => {
    const file = validFile();
    // 250 000 x 1.2 = 300 000 must fit in the day; 299 999 does not hold it.
    Object.assign(file.costEnvelopePolicy as Record<string, unknown>, {
      serve_overrun_basis_points: 2_000, daily_ceiling_micros: 299_999
    });
    await expect(planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(file))))
      .rejects.toThrowError(expect.objectContaining({ code: "COST_ENVELOPE_POLICY_INVALID" }));
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

  it("seals the verdict story's rows, money row included, by the seeder's own builders", async () => {
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(validFile())));
    const storyKeys: readonly string[] = STORY_ROW_KEYS;
    const rows = plan.rows.filter((row) => storyKeys.includes(row.rowKey));
    expect(rows.map((row) => row.rowKey).sort()).toEqual([...STORY_ROW_KEYS].sort());
    const policy = readStoryPolicy(rows.map((row) => ({
      rowKey: row.rowKey, value: JSON.parse(row.valueJsonText) as unknown, sourceRef: row.sourceRef
    })), 9);
    expect(policy?.perStoryCeilingMicros).toBe(50_000);
    expect(policy?.storytellerRoleRef).toBe(plan.synthesisRoles.synthesizerRoleRef);
    expect(policy?.storyCheckerRoleRef).toBe(plan.synthesisRoles.evaluatorRoleRef);
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
