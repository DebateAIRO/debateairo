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
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { chmod, mkdtemp, open, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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
import { PLAN_TIER_ROSTERS } from "../../packages/contract/src/index.js";
import {
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW,
  ALGORITHM_REGISTER_ROW_KEYS,
  BILLING_POLICY_DEPLOYMENT_REGISTER_ROW,
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW,
  COST_ENVELOPE_POLICY_ROW_KEY,
  CONFIGURED_PROVIDER_SET_ROW_KEY,
  COUNTRY_POLICY_ROW_KEY,
  STORY_ROW_KEYS,
  MODEL_SCORECARD_MAX_BYTES,
  MODEL_SCORECARD_ROW_KEY,
  loadBootstrapRegister,
  parseRegisterVersionText,
  readEngineVersion,
  readStoryPolicy,
  type GeneralRegisterPublication
} from "../../packages/register/src/index.js";
import { compatibleExampleScorecard } from "../support/modelScorecardFixture.js";

const EXAMPLE_PATH = new URL("../../deploy/vps/register/hosted-register.example.json", import.meta.url);
const INLINE_SECRET = "Bearer hosted-register-test-inline-credential-must-never-print";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** P4-G: a room-read admission budget, which every file that seals the budget band must carry (ruling C7). */
const ROOM_READS_FIXTURE = Object.freeze({ key: "owner", limit: 60, window_ms: 60_000, capacity: 65_536 });

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
   * Final review I-3. Bring-up step 4b copies this example into the live hosted file, so what it
   * carries is the kit's default: NO countryPolicy member, so the first publication has no country
   * gate (A14). The switches live in country-policy.example.json, merged in only once the gate's
   * preconditions hold (the DB-IP credit on the site among them; README "Country data").
   */
  it("ships the example WITHOUT countryPolicy, so a hosted file built from it has no country gate", async () => {
    const example = JSON.parse(await readFile(EXAMPLE_PATH, "utf8")) as Record<string, unknown>;
    expect(Object.hasOwn(example, "countryPolicy")).toBe(false);
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(example)));
    expect(plan.rows.some((row) => row.rowKey === COUNTRY_POLICY_ROW_KEY)).toBe(false);
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
    // Task M7 (spec §14.4.6): the code-owned row carries the story's margin.
    expect(policy?.perStoryOverrunBasisPoints).toBe(2_000);
    expect(policy?.storytellerRoleRef).toBe(plan.synthesisRoles.synthesizerRoleRef);
    expect(policy?.storyCheckerRoleRef).toBe(plan.synthesisRoles.evaluatorRoleRef);
  });

  /**
   * Engine money rule, Task M7 (spec §14.4.1, the M1 review carry). The
   * operator's cost row can only check its day against ONE run; the story row
   * is code-owned and lands in the same publication, so the plan checks the
   * day against one run AND its story, over both rows, before anything is
   * sealed: 250 000 x 1.2 + 50 000 x 1.2 = 360 000.
   */
  it("refuses a day that cannot hold one full run plus its story, before anything is sealed", async () => {
    const file = validFile();
    Object.assign(file.costEnvelopePolicy as Record<string, unknown>, {
      serve_overrun_basis_points: 2_000, daily_ceiling_micros: 359_999
    });
    await expect(planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(file))))
      .rejects.toThrowError(expect.objectContaining({ code: "STORY_DAILY_CEILING_INSUFFICIENT" }));
    expect(await planCode(file)).toBe("STORY_DAILY_CEILING_INSUFFICIENT");
    // A day of exactly one run plus its story plans.
    (file.costEnvelopePolicy as Record<string, unknown>).daily_ceiling_micros = 360_000;
    await expect(planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(file)))).resolves.toBeDefined();
  });

  it("counts the story beside a run with no overrun too: 250 000 + 60 000", async () => {
    const file = validFile();
    (file.costEnvelopePolicy as Record<string, unknown>).daily_ceiling_micros = 309_999;
    expect(await planCode(file)).toBe("STORY_DAILY_CEILING_INSUFFICIENT");
    (file.costEnvelopePolicy as Record<string, unknown>).daily_ceiling_micros = 310_000;
    expect(await planCode(file)).toBe("NO_REFUSAL");
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
      // The provider targets' own price members (`input_/output_price_micros_per_million`).
      // Paid plans B4a: the code-owned `billingPlans` row legitimately seals the PLANS' prices
      // (`net_price_micros`), which come from no provider target, so the guard names the
      // provider-target members instead of every "price".
      expect(sealed, row.rowKey).not.toContain("_price_micros_per_million");
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
 * PAID PLANS (spec 2026-09-29 §2.5.1; R1 A22) and the budget rule (spec
 * 2026-09-28 §2.4). The billing rows are code-owned (billing OFF) unless the
 * operator's file supplies them. Billing can be switched on only with the
 * three budget members; a plan window below one debate's ceiling WARNS, it
 * never refuses.
 */
describe("Paid plans · the billing rows and the budget band in the hosted register (B11a)", () => {
  it("ships an example with the three budget members and both billing rows, billing off", async () => {
    const example = JSON.parse(await readFile(EXAMPLE_PATH, "utf8")) as Record<string, unknown>;
    expect(example.costEnvelopePolicy).toMatchObject({
      admission_close_basis_points: 9_500, finish_up_to_basis_points: 11_500, waiting_line_per_person: 1
    });
    expect(example.billingPlans).toEqual(JSON.parse(JSON.stringify(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value)));
    expect(example.billingPolicy).toEqual(JSON.parse(JSON.stringify(BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value)));
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(example)));
    const rendered = renderHostedRegisterPlan(plan);
    expect(rendered).toContain(
      "cost_envelope_band admission_close_basis_points=9500 finish_up_to_basis_points=11500 waiting_line_per_person=1\n"
    );
    expect(rendered).toContain("billing_policy enabled=false\n");
    expect(rendered).toContain("billing_plans plan_ids=FREE,PLUS,PRO,MAX\n");
    // §2.5.1: Free's whole month (0.20 USD) is below 0.25 USD per debate. A warning, never a refusal.
    expect(rendered).toContain("warning=BILLING_PLAN_WINDOW_BELOW_RUN_CEILING:FREE\n");
    expect(rendered).not.toContain("BILLING_PLAN_WINDOW_BELOW_RUN_CEILING:PLUS");
    // The existing cost_envelope line keeps its shape (the M1 regex above still matches it).
    expect(rendered).toMatch(/^cost_envelope .* serve_overrun_basis_points=2000$/mu);
  });

  it("seals the engine's own billing rows, billing off, when a v1 file names neither", async () => {
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(validFile())));
    const policy = plan.rows.find((row) => row.rowKey === "billingPolicy");
    expect(policy?.sourceRef).toBe(BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef);
    expect(JSON.parse(policy!.valueJsonText)).toMatchObject({ enabled: false });
    expect(plan.rows.some((row) => row.rowKey === "billingPlans")).toBe(true);
    expect(renderHostedRegisterPlan(plan)).toContain("cost_envelope_band absent\n");
  });

  it("seals the operator's billing row verbatim under the file's sourceRef", async () => {
    const file = validFile();
    file.billingPolicy = { ...BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value, quote_ttl_seconds: 900 };
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(file)));
    const policy = plan.rows.find((row) => row.rowKey === "billingPolicy")!;
    expect(JSON.parse(policy.valueJsonText)).toMatchObject({ quote_ttl_seconds: 900 });
    expect(policy.sourceRef).toBe(file.sourceRef);
  });

  it("refuses billing switched on without the three budget members (A22)", async () => {
    const file = validFile();
    file.billingPolicy = { ...BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value, enabled: true };
    expect(await planCode(file)).toBe("BILLING_REQUIRES_ENVELOPE_MEMBERS");
  });

  it("accepts billing switched on with the members, and says so in the plan", async () => {
    const file = validFile();
    Object.assign(file.costEnvelopePolicy as Record<string, unknown>, {
      admission_close_basis_points: 9_500, finish_up_to_basis_points: 11_500, waiting_line_per_person: 1
    });
    // P4-G (ruling C7): a version with the band seals the room read's admission budget too.
    file.askRoomReads = ROOM_READS_FIXTURE;
    file.billingPolicy = { ...BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value, enabled: true };
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(file)));
    expect(plan.billingPolicy?.enabled).toBe(true);
    expect(renderHostedRegisterPlan(plan)).toContain("billing_policy enabled=true\n");
  });

  it.each([
    ["a malformed plans row", "billingPlans", { kind: "BILLING_PLANS" }, "BILLING_PLANS_INVALID"],
    ["a policy still naming the xMoney environment (A22)", "billingPolicy",
      { ...BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value, xmoney_environment: "stage" }, "BILLING_POLICY_INVALID"]
  ])("refuses %s by the register's own code", async (_name, key, value, code) => {
    const file = validFile();
    file[key] = value;
    expect(await planCode(file)).toBe(code);
  });
});

/**
 * Final review Part 1b, Important 3 (budget spec §2.10, B9d). The file's
 * `providerTargets` carry the prices both units read at boot (they must equal
 * PROVIDER_DISCOVERY_TARGETS_JSON) and the composed register carries the sealed
 * JUDGE bound, so the boot's RUN_CEILING_BELOW_ONE_CALL check is asked of the
 * plan: a dry run refuses a version both services would refuse to start on.
 * As at boot, only with the band published.
 */
describe("Budget rule · the plan asks the boot's one-call check (RUN_CEILING_BELOW_ONE_CALL)", () => {
  /** Both vendors serve the Free plan's whole roster at `prices`, with a 30% answer reserve: arguing gets 175 000 micros. */
  function freeRosterFile(prices: Readonly<{ input: number; output: number }>, band: boolean): Record<string, unknown> {
    const file = validFile();
    (file.providerTargets as Array<Record<string, unknown>>).forEach((target, index) => {
      target.model = PLAN_TIER_ROSTERS.free[index];
      target.input_price_micros_per_million = prices.input;
      target.output_price_micros_per_million = prices.output;
    });
    Object.assign(file.costEnvelopePolicy as Record<string, unknown>, {
      serve_reserve_basis_points: 3_000,
      ...(band ? { admission_close_basis_points: 9_500, finish_up_to_basis_points: 11_500, waiting_line_per_person: 1 } : {})
    });
    // P4-G (ruling C7): a version with the band seals the room read's admission budget too.
    if (band) file.askRoomReads = ROOM_READS_FIXTURE;
    return file;
  }

  it("refuses at plan time, before anything is sealed, a band whose cheapest model cannot pay for one first call", async () => {
    expect(await planCode(freeRosterFile({ input: 5_000_000, output: 25_000_000 }, true))).toBe("RUN_CEILING_BELOW_ONE_CALL");
  });

  it("lets the same prices through without the band (the boot asks only with it), and cheaper ones with it", async () => {
    expect(await planCode(freeRosterFile({ input: 5_000_000, output: 25_000_000 }, false))).toBe("NO_REFUSAL");
    expect(await planCode(freeRosterFile({ input: 1_000_000, output: 4_000_000 }, true))).toBe("NO_REFUSAL");
  });

  it("has nothing to ask while no plan's whole roster is configured, as at boot", async () => {
    const file = validFile();
    Object.assign(file.costEnvelopePolicy as Record<string, unknown>, {
      serve_reserve_basis_points: 3_000, admission_close_basis_points: 9_500, finish_up_to_basis_points: 11_500,
      waiting_line_per_person: 1
    });
    // P4-G (ruling C7): a version with the band seals the room read's admission budget too.
    file.askRoomReads = ROOM_READS_FIXTURE;
    for (const target of file.providerTargets as Array<Record<string, unknown>>) {
      target.input_price_micros_per_million = 5_000_000;
      target.output_price_micros_per_million = 25_000_000;
    }
    expect(await planCode(file)).toBe("NO_REFUSAL");
  });

  /**
   * Paid plans S2 (A28(c)): with `--scorecard` the version seals a VALID
   * scorecard, so both boots count every configured model for every plan
   * (`firstCallPlanModels`, the picker seats from all of them); the plan asks
   * the same groups.
   */
  async function planCodeWithScorecard(file: unknown): Promise<string> {
    const scorecard = parseHostedScorecardFile(bytesOf(await compatibleExampleScorecard()), await readEngineVersion());
    return codeOfAsync(async () => planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(file)), scorecard));
  }

  it("refuses, with a scorecard, a site whose only priced models are on no roster and cannot pay for one first call", async () => {
    const file = validFile();
    Object.assign(file.costEnvelopePolicy as Record<string, unknown>, {
      serve_reserve_basis_points: 3_000, admission_close_basis_points: 9_500, finish_up_to_basis_points: 11_500,
      waiting_line_per_person: 1
    });
    // P4-G (ruling C7): a version with the band seals the room read's admission budget too.
    file.askRoomReads = ROOM_READS_FIXTURE;
    for (const target of file.providerTargets as Array<Record<string, unknown>>) {
      target.input_price_micros_per_million = 5_000_000;
      target.output_price_micros_per_million = 25_000_000;
    }
    expect(await planCode(file)).toBe("NO_REFUSAL");
    expect(await planCodeWithScorecard(file)).toBe("RUN_CEILING_BELOW_ONE_CALL");
  });

  it("lets through, with a scorecard, a ceiling the Free roster alone refuses when a cheap model on no roster is configured", async () => {
    const file = freeRosterFile({ input: 5_000_000, output: 25_000_000 }, true);
    const providers = (file.configuredProviderSet as Record<string, unknown>).providers as Array<Record<string, unknown>>;
    providers.push({ ...providers[1], providerRef: "vendor:gamma", maker: "Gamma" });
    (file.providerTargets as Array<Record<string, unknown>>).push({
      provider_ref: "vendor:gamma",
      base_url: "https://api.gamma-vendor-fixture.com/v1",
      model: "gamma-small",
      authorization_file: "/etc/debateai/runner/providers/gamma-fixture-path.header",
      input_price_micros_per_million: 1_000_000,
      output_price_micros_per_million: 4_000_000
    });
    expect(await planCode(file)).toBe("RUN_CEILING_BELOW_ONE_CALL");
    expect(await planCodeWithScorecard(file)).toBe("NO_REFUSAL");
    // Paid plans S4b: a version that sells plans prices Free on the Free roster alone, as the API's
    // boot does, because the picker then seats a Free ask from it only: the same ceiling is refused.
    file.billingPolicy = { ...BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value, enabled: true };
    const example = await compatibleExampleScorecard();
    const pickerSettings = example.pickerSettings as Record<string, unknown>;
    const scorecard = parseHostedScorecardFile(bytesOf({
      ...example,
      pickerSettings: { ...pickerSettings, planStrengthCaps: { free: "ECONOMY" }, freeCap: exampleFreeCaps(pickerSettings, 0.5) }
    }), await readEngineVersion());
    expect(await codeOfAsync(async () => planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(file)), scorecard)))
      .toBe("RUN_CEILING_BELOW_ONE_CALL");
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
    // A defined text field (fix round 1: an unknown field is now refused on its own).
    const withVendorText = (text: string) => {
      const value = structuredClone(base) as { candidates: Array<Record<string, unknown>> };
      value.candidates[0]!.vendor = text;
      return bytesOf(value);
    };
    // Control: the same field with one newline is accepted.
    expect(codeOf(() => parseHostedScorecardFile(withVendorText("Vendor\n"), engine))).toBe("NO_REFUSAL");
    const expanding = withVendorText(`Vendor${"\n".repeat(12_000)}`);
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

/**
 * A19 fix round 1 (review Minor 2) — a sealed row is never edited, so hosted
 * publish REFUSES a scorecard that carries any field the scorecard format does
 * not define, at any depth. The format itself ignores such a field (zod strips
 * it), which is why local mode, which seals nothing, still reads it.
 *
 * Fix round 2 (re-review Minor 1): the code names only the DEFINED parent path
 * and a fixed `*` marker — never the unknown key's name, which is operator text
 * and could be secret-shaped — and never its value.
 */
describe("A19 fix round 1 · a field the scorecard format does not define is never sealed", () => {
  const SECRET = "private-evaluator-note-must-never-print";
  /** Secret-shaped, and entirely inside the printable code alphabet, so no sanitising could hide it. */
  // Built from pieces so the secret scan does not read this made-up value as a key (owner's ruling, PR #70).
  const SECRET_KEY = ["sk-live-", "4f9c2a7e1b8d6f3a", "0c5e9b2d7a4f1c8e"].join("");
  type Mutable = Record<string, any>;

  async function codeAndText(value: unknown): Promise<{ code: string; text: string }> {
    try {
      parseHostedScorecardFile(bytesOf(value), await readEngineVersion());
    } catch (error) {
      return { code: hostedRegisterRefusalCode(error), text: `${String(error)} ${JSON.stringify(error)}` };
    }
    return { code: "NO_REFUSAL", text: "" };
  }

  it("refuses an unknown field at every depth the schema defines, naming its defined parent and never its name or value", async () => {
    const example = await compatibleExampleScorecard() as Mutable;
    // Control: the example carries only defined fields, and is accepted.
    expect((await codeAndText(example)).code).toBe("NO_REFUSAL");
    const role = Object.keys(example.roles).find((name) => example.roles[name].length > 0)!;
    const priced = (example.candidates as Mutable[]).findIndex((candidate) => candidate.apiPrice !== null);
    expect(priced).toBeGreaterThanOrEqual(0);
    const cases: Record<string, (value: Mutable) => void> = {
      "*": (value) => { value[SECRET_KEY] = SECRET; },
      "engineCompatibility.*": (value) => { value.engineCompatibility[SECRET_KEY] = SECRET; },
      "candidates.1.*": (value) => { value.candidates[1][SECRET_KEY] = SECRET; },
      "candidates.0.accessRoutes.0.*": (value) => { value.candidates[0].accessRoutes[0][SECRET_KEY] = SECRET; },
      [`candidates.${priced}.apiPrice.*`]: (value) => { value.candidates[priced].apiPrice[SECRET_KEY] = SECRET; },
      [`roles.${role}.0.*`]: (value) => { value.roles[role][0][SECRET_KEY] = SECRET; },
      [`roles.${role}.0.quality.*`]: (value) => { value.roles[role][0].quality[SECRET_KEY] = SECRET; },
      [`roles.${role}.0.qualityByLanguage.*`]: (value) => {
        value.roles[role][0].qualityByLanguage = { ro: { ...value.roles[role][0].quality }, [SECRET_KEY]: SECRET };
      },
      [`roles.${role}.0.typicalCall.*`]: (value) => { value.roles[role][0].typicalCall[SECRET_KEY] = SECRET; },
      [`roles.${role}.0.tags.0.*`]: (value) => {
        value.roles[role][0].tags = [{ code: "PRIVATE_TAG", strength: "WEAK", text: "a tag", [SECRET_KEY]: SECRET }];
      },
      "pickerSettings.*": (value) => { value.pickerSettings[SECRET_KEY] = SECRET; },
      [`pickerSettings.economyCap.${role}.*`]: (value) => { value.pickerSettings.economyCap[role][SECRET_KEY] = SECRET; },
      "pickerSettings.planStrengthCaps.*": (value) => { value.pickerSettings.planStrengthCaps[SECRET_KEY] = SECRET; }
    };
    for (const [path, mutate] of Object.entries(cases)) {
      const value = structuredClone(example);
      mutate(value);
      const refused = await codeAndText(value);
      expect(refused.code, path).toBe(`HOSTED_REGISTER_SCORECARD_KEY_UNKNOWN:${path}`);
      expect(`${refused.code} ${refused.text}`, path).not.toContain(SECRET);
      expect(`${refused.code} ${refused.text}`, path).not.toContain(SECRET_KEY);
    }
  });

  it("never prints the unknown key's name, whatever its characters or length", async () => {
    for (const name of [SECRET_KEY, "private note/é", `sk-${"a".repeat(300)}`, ""]) {
      const value = structuredClone(await compatibleExampleScorecard()) as Mutable;
      value.candidates[1][name] = SECRET;
      const refused = await codeAndText(value);
      expect(refused.code, name).toBe("HOSTED_REGISTER_SCORECARD_KEY_UNKNOWN:candidates.1.*");
      if (name !== "") expect(`${refused.code} ${refused.text}`, name).not.toContain(name.slice(0, 16));
    }
  });

  it("refuses it as operator input, before the plan and before any connection, with nothing from the file on stderr", async () => {
    const path = await custodyFile(JSON.stringify(validFile()));
    const scorecardPath = await custodyFile(JSON.stringify({ ...await compatibleExampleScorecard(), [SECRET_KEY]: SECRET }));
    let stdout = "";
    let stderr = "";
    let opened = false;
    const exitCode = await runHostedRegisterPublishCli(
      ["--dry-run", "--file", path, "--scorecard", scorecardPath],
      { stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; } },
      async () => { opened = true; throw new Error("unreachable"); }
    );
    expect({ exitCode, stdout, stderr, opened }).toEqual({
      exitCode: 2, stdout: "", stderr: "HOSTED_REGISTER_SCORECARD_KEY_UNKNOWN:*\n", opened: false
    });
    expect(stderr).not.toContain(SECRET_KEY);
    expect(stderr).not.toContain(SECRET);
  });
});

/**
 * A19 fix round 1 (review Minor 1) — the operator files are opened without
 * waiting: a FIFO named by `--file` or `--scorecard` is refused by the custody
 * rule (not a regular file) at once, instead of blocking the command until
 * something writes to it.
 */
describe("A19 fix round 1 · a FIFO in place of an operator file", () => {
  async function fifoInCustodyDirectory(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "debateai-hosted-register-"));
    temporaryRoots.push(root);
    await chmod(root, 0o700);
    const fifo = join(root, "operator-file.json");
    execFileSync("mkfifo", [fifo]);
    await chmod(fifo, 0o600);
    return fifo;
  }

  /** The read's answer within 2 s; a reader still blocked in open() is then released so the worker can exit. */
  async function answerWithin(fifo: string, read: Promise<string>): Promise<string> {
    const stop = new AbortController();
    try {
      return await Promise.race([
        read,
        delay(2_000, undefined, { signal: stop.signal }).then(() => "STILL_WAITING_FOR_A_WRITER", () => "ABORTED")
      ]);
    } finally {
      stop.abort();
      // With no reader waiting this refuses (ENXIO) and is ignored.
      await open(fifo, constants.O_WRONLY | constants.O_NONBLOCK).then((handle) => handle.close(), () => undefined);
      await Promise.race([read.catch(() => undefined), delay(1_000)]);
    }
  }

  it("refuses a FIFO given as --scorecard at once", async () => {
    const fifo = await fifoInCustodyDirectory();
    const engine = await readEngineVersion();
    expect(await answerWithin(fifo, codeOfAsync(() => readHostedScorecardFile(fifo, engine))))
      .toBe("HOSTED_REGISTER_SCORECARD_FILE_CUSTODY_INVALID");
  });

  it("refuses a FIFO given as --file at once", async () => {
    const fifo = await fifoInCustodyDirectory();
    expect(await answerWithin(fifo, codeOfAsync(() => readHostedRegisterFile(fifo))))
      .toBe("HOSTED_REGISTER_FILE_CUSTODY_INVALID");
  });
});

describe("A19 fix round 2 · the refusal line admits `*` only as the unknown-field marker", () => {
  it("prints both marker forms as codes and keeps any other `*` on the generic line", () => {
    expect(hostedRegisterRefusalCode(new Error("HOSTED_REGISTER_SCORECARD_KEY_UNKNOWN:candidates.1.*")))
      .toBe("HOSTED_REGISTER_SCORECARD_KEY_UNKNOWN:candidates.1.*");
    expect(hostedRegisterRefusalCode(new Error("HOSTED_REGISTER_SCORECARD_KEY_UNKNOWN:*")))
      .toBe("HOSTED_REGISTER_SCORECARD_KEY_UNKNOWN:*");
    expect(hostedRegisterRefusalCode(new Error("PROVIDER_TARGET_PRICE_ZERO:vendor:beta")))
      .toBe("PROVIDER_TARGET_PRICE_ZERO:vendor:beta");
    expect(hostedRegisterRefusalCode(new Error("PROVIDER_TARGET_PRICE_ZERO:vendor:a*b")))
      .toBe("HOSTED_REGISTER_PUBLISH_FAILED");
    expect(hostedRegisterRefusalCode(new Error("PROVIDER_TARGET_PRICE_ZERO:vendor:*b")))
      .toBe("HOSTED_REGISTER_PUBLISH_FAILED");
  });
});

/**
 * Paid plans S2 (spec §2.6 item 6): a scorecard sealed with billing on follows the owners' plan-cap
 * rule, checked BEFORE anything is sealed — a sealed register row can never be edited.
 */
describe("Paid plans S2 · the plan caps of a scorecard published with billing on", () => {
  // Paid plans P4-E (M-4): the two vendors serve the Free plan's models, which the scorecard below
  // scores for the answer jobs, so only the rule each row names decides it.
  const billingOn = (): Record<string, unknown> => {
    const file = serveFreeRoster(validFile());
    Object.assign(file.costEnvelopePolicy as Record<string, unknown>, {
      admission_close_basis_points: 9_500, finish_up_to_basis_points: 11_500, waiting_line_per_person: 1
    });
    // P4-G (ruling C7): a version with the band seals the room read's admission budget too.
    file.askRoomReads = ROOM_READS_FIXTURE;
    file.billingPolicy = { ...BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value, enabled: true };
    return file;
  };
  // Paid plans S4b: every row here carries Free caps that follow the owners' Free rule unless it names
  // others, or "OMIT" for none.
  const planCodeWith = async (
    file: Record<string, unknown>,
    planStrengthCaps: Readonly<Record<string, string>>,
    freeCap: unknown = "FOLLOWS_THE_RULE"
  ) => {
    const example = freeRosterScored(await compatibleExampleScorecard(8));
    const pickerSettings = example.pickerSettings as Record<string, unknown>;
    const caps = freeCap === "FOLLOWS_THE_RULE" ? exampleFreeCaps(pickerSettings, 0.5) : freeCap;
    const scorecard = parseHostedScorecardFile(bytesOf({
      ...example, pickerSettings: { ...pickerSettings, planStrengthCaps, ...(caps === "OMIT" ? {} : { freeCap: caps }) }
    }), await readEngineVersion());
    return codeOfAsync(async () => planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(file)), scorecard));
  };

  it.each([[{ free: "BALANCED" }], [{}], [{ free: "ECONOMY", premium: "BALANCED" }]])("refuses %o", async (caps) => {
    expect(await planCodeWith(billingOn(), caps)).toBe("SCORECARD_PLAN_CAPS_INVALID");
  });

  it.each([[{ free: "ECONOMY" }], [{ free: "ECONOMY", premium: "BEST" }]])("seals %o", async (caps) => {
    expect(await planCodeWith(billingOn(), caps)).toBe("NO_REFUSAL");
  });

  it("keeps sealing the example's { free: BALANCED } with billing off, as today", async () => {
    expect(await planCodeWith(validFile(), { free: "BALANCED" })).toBe("NO_REFUSAL");
  });

  /**
   * Paid plans S4b (final review P3-I2; the owner's ruling of 3 October 2026): a version that sells
   * plans seals only a scorecard whose every role has a Free money cap at or below its Economy cap.
   */
  it.each([
    ["without Free caps", (settings: Record<string, unknown>): unknown => { void settings; return "OMIT"; }],
    ["with a role's Free cap unset", (settings: Record<string, unknown>) =>
      ({ ...exampleFreeCaps(settings, 0.5), JUDGE: { moneyMicrosPerCall: null } })],
    ["with a role's Free cap above its Economy cap", (settings: Record<string, unknown>) =>
      ({ ...exampleFreeCaps(settings, 0.5), POSITION: exampleFreeCaps(settings, 2).POSITION })]
  ])("refuses a scorecard %s, by a content-free code", async (_name, freeCapOf) => {
    const example = await compatibleExampleScorecard(8);
    const freeCap = freeCapOf(example.pickerSettings as Record<string, unknown>);
    expect(await planCodeWith(billingOn(), { free: "ECONOMY" }, freeCap)).toBe("SCORECARD_FREE_CAPS_INVALID");
  });

  it("seals Free caps equal to the Economy caps, and keeps sealing a scorecard without Free caps with billing off", async () => {
    const example = await compatibleExampleScorecard(8);
    const equal = exampleFreeCaps(example.pickerSettings as Record<string, unknown>, 1);
    expect(await planCodeWith(billingOn(), { free: "ECONOMY" }, equal)).toBe("NO_REFUSAL");
    expect(await planCodeWith(validFile(), { free: "BALANCED" }, "OMIT")).toBe("NO_REFUSAL");
  });

  it("asks the plan-cap rule first", async () => {
    expect(await planCodeWith(billingOn(), { free: "BALANCED" }, "OMIT")).toBe("SCORECARD_PLAN_CAPS_INVALID");
  });
});

/**
 * Paid plans P4-E (Part 3b re-review M-4; the controller's ruling C4 of 3 October 2026). With billing
 * on, a Free ask's answer writer and answer checker take only a scored Free-plan model (S4b fix round
 * 1), so a scorecard under which no configured Free-plan model can take one of those two jobs would
 * refuse every Free question at ask time. A version that sells plans seals no such scorecard. The
 * test is the picker's own eligibility (`eligiblePool`): scored for the job and not AVOID or UNTESTED,
 * reachable through an API, a configured target serving a Free-plan model at the candidate's level,
 * and a typical call that fits the window. Billing off changes nothing.
 */
describe("Paid plans P4-E · a scorecard published with billing on can seat Free's answer jobs", () => {
  const sellingPlans = (file: Record<string, unknown>): Record<string, unknown> => {
    Object.assign(file.costEnvelopePolicy as Record<string, unknown>, {
      admission_close_basis_points: 9_500, finish_up_to_basis_points: 11_500, waiting_line_per_person: 1
    });
    // P4-G (ruling C7): a version with the band seals the room read's admission budget too.
    file.askRoomReads = ROOM_READS_FIXTURE;
    file.billingPolicy = { ...BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value, enabled: true };
    return file;
  };
  /** The example with caps that follow the owners' two rules, after `change`. */
  const planCodeOf = async (file: Record<string, unknown>, change: (example: Record<string, unknown>) => Record<string, unknown>) => {
    const example = change(await compatibleExampleScorecard(8));
    const pickerSettings = example.pickerSettings as Record<string, unknown>;
    const scorecard = parseHostedScorecardFile(bytesOf({
      ...example,
      pickerSettings: { ...pickerSettings, planStrengthCaps: { free: "ECONOMY" }, freeCap: exampleFreeCaps(pickerSettings, 0.5) }
    }), await readEngineVersion());
    return codeOfAsync(async () => planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(file)), scorecard));
  };
  const asIs = (example: Record<string, unknown>) => example;

  it("refuses a scorecard that scores no Free-plan model, by a content-free code", async () => {
    expect(await planCodeOf(sellingPlans(serveFreeRoster(validFile())), asIs)).toBe("SCORECARD_FREE_ANSWER_UNSCORED");
  });

  it("refuses scored Free-plan models the register file does not configure", async () => {
    expect(await planCodeOf(sellingPlans(validFile()), freeRosterScored)).toBe("SCORECARD_FREE_ANSWER_UNSCORED");
  });

  it.each([
    ["AVOID for the answer checker", (example: Record<string, unknown>) => withFreeEntries(example, "ANSWER_CHECKER", { tier: "AVOID" })],
    ["UNTESTED for the answer writer", (example: Record<string, unknown>) => withFreeEntries(example, "ANSWER_WRITER", { tier: "UNTESTED" })],
    ["listed for the answer writer only", (example: Record<string, unknown>) => withoutFreeEntries(example, "ANSWER_CHECKER")],
    ["reachable only through a subscription", (example: Record<string, unknown>) =>
      withFreeCandidates(example, { accessRoutes: [{ kind: "SUBSCRIPTION", tool: "codex" }] })],
    ["whose typical answer does not fit its window", (example: Record<string, unknown>) =>
      withFreeCandidates(example, { contextWindowTokens: 20_000 })],
    ["at a thinking level its connection does not declare", (example: Record<string, unknown>) =>
      withFreeCandidates(example, { thinkingLevel: "high" })]
  ])("refuses Free-plan models scored but %s", async (_name, change) => {
    expect(await planCodeOf(sellingPlans(serveFreeRoster(validFile())), (example) => change(freeRosterScored(example))))
      .toBe("SCORECARD_FREE_ANSWER_UNSCORED");
  });

  it("reads the version's own sealed answer bound against the window", async () => {
    const rows = (await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(serveFreeRoster(validFile()))))).rows;
    const bound = (JSON.parse(rows.find((row) => row.rowKey === "synthesizerCallBound")!.valueJsonText) as { tokenCeiling: number })
      .tokenCeiling;
    // The example's typical answer-writer call has 9000 input tokens; the gateway's wall counts each as 4, plus the bound.
    const writerWindow = 9_000 * 4 + bound;
    const windowOf = (tokens: number) => (example: Record<string, unknown>) =>
      withFreeCandidates(freeRosterScored(example), { contextWindowTokens: tokens });
    expect(await planCodeOf(sellingPlans(serveFreeRoster(validFile())), windowOf(writerWindow - 1))).toBe("SCORECARD_FREE_ANSWER_UNSCORED");
    expect(await planCodeOf(sellingPlans(serveFreeRoster(validFile())), windowOf(writerWindow))).toBe("NO_REFUSAL");
  });

  it("seals a scorecard under which a configured Free-plan model can take both answer jobs", async () => {
    expect(await planCodeOf(sellingPlans(serveFreeRoster(validFile())), freeRosterScored)).toBe("NO_REFUSAL");
  });

  it("seals one when a single Free-plan model can take both jobs, the other unscored", async () => {
    const one = (example: Record<string, unknown>) => {
      const scored = freeRosterScored(example);
      const roles = scored.roles as Record<string, Array<Record<string, unknown>>>;
      for (const role of ["ANSWER_WRITER", "ANSWER_CHECKER"]) {
        roles[role] = roles[role]!.filter((entry) => entry.candidateId !== FREE_SCORED_CANDIDATES[1]);
      }
      return scored;
    };
    expect(await planCodeOf(sellingPlans(serveFreeRoster(validFile())), one)).toBe("NO_REFUSAL");
  });

  it("keeps sealing a scorecard that scores no Free-plan model with billing off", async () => {
    expect(await planCodeOf(serveFreeRoster(validFile()), asIs)).toBe("NO_REFUSAL");
    expect(await planCodeOf(validFile(), asIs)).toBe("NO_REFUSAL");
  });

  it("asks the two cap rules first", async () => {
    const example = await compatibleExampleScorecard(8);
    const scorecard = parseHostedScorecardFile(bytesOf({
      ...example, pickerSettings: { ...(example.pickerSettings as Record<string, unknown>), planStrengthCaps: { free: "ECONOMY" } }
    }), await readEngineVersion());
    expect(await codeOfAsync(async () => planHostedRegisterPublication(
      parseHostedRegisterFile(bytesOf(sellingPlans(serveFreeRoster(validFile())))), scorecard
    ))).toBe("SCORECARD_FREE_CAPS_INVALID");
  });
});

/** P4-E: validFile's two vendors (makers Alpha and Beta) serve the Free plan's two models instead. */
function serveFreeRoster(file: Record<string, unknown>): Record<string, unknown> {
  (file.providerTargets as Array<Record<string, unknown>>).forEach((target, index) => {
    target.model = PLAN_TIER_ROSTERS.free[index];
  });
  return file;
}

/** P4-E: the example's two candidates re-pointed at the Free plan's models, in serveFreeRoster's order. */
const FREE_SCORED_CANDIDATES = ["openai-alpha-low", "anthropic-gamma-low"] as const;

/**
 * P4-E: the example scorecard with two of its candidates (GOOD_VALUE for both answer jobs) re-pointed
 * at the Free plan's models on validFile's makers, at the default level. EXAMPLE scoring only.
 */
function freeRosterScored(example: Record<string, unknown>): Record<string, unknown> {
  const makers = ["Alpha", "Beta"];
  const candidates = (example.candidates as Array<Record<string, unknown>>).map((candidate) => {
    const index = (FREE_SCORED_CANDIDATES as readonly string[]).indexOf(candidate.candidateId as string);
    return index < 0 ? candidate : {
      ...candidate, vendor: makers[index], maker: makers[index], modelId: PLAN_TIER_ROSTERS.free[index], thinkingLevel: "DEFAULT_ONLY"
    };
  });
  return { ...example, candidates, roles: structuredClone(example.roles) };
}

function withFreeCandidates(example: Record<string, unknown>, fields: Record<string, unknown>): Record<string, unknown> {
  return {
    ...example,
    candidates: (example.candidates as Array<Record<string, unknown>>).map((candidate) =>
      ((FREE_SCORED_CANDIDATES as readonly string[]).includes(candidate.candidateId as string) ? { ...candidate, ...fields } : candidate))
  };
}

function withFreeEntries(example: Record<string, unknown>, role: string, fields: Record<string, unknown>): Record<string, unknown> {
  const roles = structuredClone(example.roles) as Record<string, Array<Record<string, unknown>>>;
  roles[role] = roles[role]!.map((entry) =>
    ((FREE_SCORED_CANDIDATES as readonly string[]).includes(entry.candidateId as string) ? { ...entry, ...fields } : entry));
  return { ...example, roles };
}

function withoutFreeEntries(example: Record<string, unknown>, role: string): Record<string, unknown> {
  const roles = structuredClone(example.roles) as Record<string, Array<Record<string, unknown>>>;
  roles[role] = roles[role]!.filter((entry) => !(FREE_SCORED_CANDIDATES as readonly string[]).includes(entry.candidateId as string));
  return { ...example, roles };
}

/** S4b: EXAMPLE Free caps — each role's Economy money cap × `share`, floored. Not production numbers. */
function exampleFreeCaps(pickerSettings: Record<string, unknown>, share: number): Record<string, { moneyMicrosPerCall: number }> {
  const economyCap = pickerSettings.economyCap as Record<string, { moneyMicrosPerCall: number }>;
  return Object.fromEntries(Object.entries(economyCap).map(([role, cap]) => [
    role, { moneyMicrosPerCall: Math.floor(cap.moneyMicrosPerCall * share) }
  ]));
}

/**
 * Paid plans P4-G, ruling C7 (go-live row 31). The room read GET /v1/asks/room charges its own owner-keyed
 * admission budget, `ask_room_reads`. No code-owned row carries it: the operator's file supplies it as the
 * optional `askRoomReads` member, which the plan adds to the code-owned admission row, and a version that
 * seals the budget band without it is refused before anything is sealed (ASK_ROOM_ADMISSION_UNSEALED), as
 * the API's boot refuses it. The example carries an example budget; the owner sets the real value.
 */
describe("Paid plans P4-G · the room read's admission budget (ruling C7)", () => {
  const ROOM_READS = Object.freeze({ key: "owner", limit: 30, window_ms: 60_000, capacity: 65_536 });
  const BAND = Object.freeze({
    admission_close_basis_points: 9_500, finish_up_to_basis_points: 11_500, waiting_line_per_person: 1
  });
  function bandedFile(): Record<string, unknown> {
    const file = validFile();
    Object.assign(file.costEnvelopePolicy as Record<string, unknown>, BAND);
    return file;
  }
  const admissionOf = (plan: Awaited<ReturnType<typeof planHostedRegisterPublication>>) =>
    plan.rows.find((row) => row.rowKey === "admissionPolicy")!;

  it("refuses a version that seals the band without askRoomReads, and accepts it with the member", async () => {
    expect(await planCode(bandedFile())).toBe("ASK_ROOM_ADMISSION_UNSEALED");
    expect(await planCode({ ...bandedFile(), askRoomReads: ROOM_READS })).toBe("NO_REFUSAL");
    // Billing on needs the band, so it needs the member too.
    const billingOn = { ...bandedFile(), billingPolicy: { ...BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value, enabled: true } };
    expect(await planCode(billingOn)).toBe("ASK_ROOM_ADMISSION_UNSEALED");
    expect(await planCode({ ...billingOn, askRoomReads: ROOM_READS })).toBe("NO_REFUSAL");
  });

  it("changes nothing without the band: the code-owned admission row is sealed as it is", async () => {
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(validFile())));
    const admission = admissionOf(plan);
    expect(admission.sourceRef).toBe(ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef);
    expect(JSON.parse(admission.valueJsonText)).toEqual(JSON.parse(JSON.stringify(ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value)));
    expect(plan.askRoomReads).toBeNull();
    expect(renderHostedRegisterPlan(plan)).toContain("ask_room_reads absent\n");
  });

  it("adds the owner's budget to the code-owned admission row, every other member as it was, and says so in the plan", async () => {
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf({ ...bandedFile(), askRoomReads: ROOM_READS })));
    const admission = admissionOf(plan);
    expect(JSON.parse(admission.valueJsonText)).toEqual({
      ...JSON.parse(JSON.stringify(ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value)), ask_room_reads: ROOM_READS
    });
    expect(admission.sourceRef.startsWith(ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef)).toBe(true);
    expect(admission.sourceRef).toContain("P4-G ask_room_reads");
    expect(admission.sourceRef.length).toBeLessThanOrEqual(1_024);
    expect(plan.askRoomReads).toEqual({ key: "owner", limit: 30, windowMs: 60_000, capacity: 65_536 });
    expect(renderHostedRegisterPlan(plan)).toContain("ask_room_reads key=owner limit=30 window_ms=60000 capacity=65536\n");
  });

  it.each([
    ["a source-keyed budget", { ...ROOM_READS, key: "source" }],
    ["a zero limit", { ...ROOM_READS, limit: 0 }],
    ["an unknown field", { ...ROOM_READS, extra: true }],
    ["the JSON value null", null]
  ])("refuses %s by the register's own code", async (_name, value) => {
    expect(await planCode({ ...bandedFile(), askRoomReads: value })).toBe("ADMISSION_POLICY_INVALID");
  });

  it("ships an example that seals the band with an example room-read budget", async () => {
    const example = JSON.parse(await readFile(EXAMPLE_PATH, "utf8")) as Record<string, unknown>;
    expect(example.askRoomReads).toEqual({ key: "owner", limit: 60, window_ms: 60_000, capacity: 65_536 });
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(example)));
    expect(renderHostedRegisterPlan(plan)).toContain("ask_room_reads key=owner limit=60 window_ms=60000 capacity=65536\n");
    // Without the member the example itself is refused: the band is sealed.
    delete example.askRoomReads;
    expect(await planCode(example)).toBe("ASK_ROOM_ADMISSION_UNSEALED");
  });
});
