import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF,
  CONFIGURED_PROVIDER_SET_DEPLOYMENT_VERSION,
  CONFIGURED_PROVIDER_SET_ROW_KEY,
  CONFIGURED_PROVIDER_SET_SEALED_VERSION,
  buildConfiguredProviderSetDeploymentRow,
  buildConfiguredProviderSetSealedRow,
  type ConfiguredProviderSetRow
} from "../../packages/register/src/configured-provider-set.js";
import {
  computeGeneralPublicationRequestSha256,
  computeRegisterSnapshotSha256,
  createPostgresRegisterPublicationPort,
  parseCanonicalRegisterJson,
  parseRegisterVersionText
} from "../../packages/register/src/register-publication.js";
import {
  CONFIGURED_PROVIDER_SET_ROW_KEY as CRITIQUE_ROW_KEY,
  readDeploymentMakerCapability
} from "../../packages/critique/src/index.js";
import { buildDevelopmentDeploymentRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";

/**
 * V-9(3) and V-9(4), task 10c. Vendors are CONFIGURATION: a new
 * OpenAI-compatible vendor is a target entry, a key file and one more entry in
 * this row. The row is republished at a NEW deployment version — constraint 5,
 * the same discipline `AUTH_POLICY_DEPLOYMENT_PUBLICATION_ROWS` follows for
 * V-14 — so the sealed version-1 value is superseded, never edited.
 *
 * The superseding version carries what V-9(4) ruled: each hosted vendor's API
 * data-use and retention terms are checked and the vendor is named in the
 * privacy notice BEFORE it goes live. Publishing the row is where that is
 * enforced, so an unvetted vendor cannot be added by configuration either.
 */

const VETTING = Object.freeze({
  dataUseTermsReviewedOn: "2026-09-22",
  retentionTermsReviewedOn: "2026-09-22",
  namedInPrivacyNotice: true
} as const);

const SEALED_INPUT = Object.freeze({
  requiredDistinctMakers: 1,
  providers: Object.freeze([
    Object.freeze({
      providerRef: "development:codex-cli",
      adapterKind: "openai-compatible-http",
      maker: "OpenAI"
    }),
    Object.freeze({
      providerRef: "development:claude-cli",
      adapterKind: "openai-compatible-http",
      maker: "Anthropic"
    })
  ])
});

const vetted = (providers: typeof SEALED_INPUT.providers) =>
  providers.map((provider) => ({ ...provider, vetting: VETTING }));

/** A register pool that answers exactly one row — the shipped reader's only input. */
function registerPool(value: unknown, sourceRef: string): Pool {
  return {
    query: async () => ({ rows: [{ value_json: value, source_ref: sourceRef }] })
  } as unknown as Pool;
}

describe("V-9 the configured-providers row is superseded, never edited (task 10c)", () => {
  it("agrees with the row key the shipped reader asks for", () => {
    expect(CONFIGURED_PROVIDER_SET_ROW_KEY).toBe(CRITIQUE_ROW_KEY);
    expect(CONFIGURED_PROVIDER_SET_SEALED_VERSION).toBe(1);
    expect(CONFIGURED_PROVIDER_SET_DEPLOYMENT_VERSION).toBe(2);
  });

  it("leaves the sealed value byte-for-byte what the deployment publishes today", () => {
    const sealed = buildConfiguredProviderSetSealedRow(SEALED_INPUT, "fixture-source-ref");
    expect(sealed.value).toEqual({
      kind: "CONFIGURED_PROVIDER_SET",
      requiredDistinctMakers: 1,
      providers: SEALED_INPUT.providers
    });
    expect(Object.hasOwn(sealed.value, "setVersion")).toBe(false);
    // ...and it is the very object the runner's dev deployment register writes,
    // so "sealed" is measured against the shipped publisher, not against a copy.
    const [devRow] = buildDevelopmentDeploymentRegisterRows({
      configuredProviders: SEALED_INPUT.providers,
      requiredDistinctMakers: SEALED_INPUT.requiredDistinctMakers,
      healthyProviderRefs: [],
      targets: [],
      targetsJson: "[]"
    });
    expect(devRow?.rowKey).toBe(CONFIGURED_PROVIDER_SET_ROW_KEY);
    expect(devRow?.value).toEqual(sealed.value);
  });

  it("publishes a superseding row that adds the version and the vetting record, and nothing else", () => {
    const sealed = buildConfiguredProviderSetSealedRow(SEALED_INPUT, "fixture-source-ref");
    const deployment = buildConfiguredProviderSetDeploymentRow({
      requiredDistinctMakers: 1,
      providers: vetted(SEALED_INPUT.providers)
    }, "fixture-source-ref");
    expect(deployment.rowKey).toBe(sealed.rowKey);
    expect(deployment.value).toEqual({
      kind: "CONFIGURED_PROVIDER_SET",
      setVersion: CONFIGURED_PROVIDER_SET_DEPLOYMENT_VERSION,
      requiredDistinctMakers: 1,
      providers: vetted(SEALED_INPUT.providers)
    });
    // The sealed provenance survives, and the superseding row cites the ruling.
    expect(deployment.sourceRef).toContain("fixture-source-ref");
    expect(deployment.sourceRef).toContain(CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF);
    expect(deployment.sourceRef).toMatch(/V-9/u);
    // Building it did not touch the sealed row.
    expect(sealed.value).toEqual(
      buildConfiguredProviderSetSealedRow(SEALED_INPUT, "fixture-source-ref").value
    );
  });

  it("refuses to publish a vendor that has not been vetted (V-9(4))", () => {
    const refused = [
      undefined,
      {},
      { ...VETTING, namedInPrivacyNotice: false },
      { ...VETTING, dataUseTermsReviewedOn: undefined },
      { ...VETTING, retentionTermsReviewedOn: "yesterday" },
      { ...VETTING, dataUseTermsReviewedOn: "2026-13-01" }
    ];
    for (const vetting of refused) {
      expect(() => buildConfiguredProviderSetDeploymentRow({
        requiredDistinctMakers: 1,
        providers: [
          { ...SEALED_INPUT.providers[0]!, vetting: VETTING },
          { ...SEALED_INPUT.providers[1]!, vetting: vetting as never }
        ]
      }, "fixture-source-ref"))
        .toThrowError(new TypeError("PROVIDER_VENDOR_NOT_VETTED:development:claude-cli"));
    }
  });

  it("refuses a malformed set under the code the reader already uses", () => {
    for (const input of [
      { requiredDistinctMakers: 0, providers: vetted(SEALED_INPUT.providers) },
      { requiredDistinctMakers: 1, providers: [] },
      {
        requiredDistinctMakers: 1,
        providers: [
          { ...SEALED_INPUT.providers[0]!, vetting: VETTING },
          { ...SEALED_INPUT.providers[0]!, vetting: VETTING }
        ]
      },
      {
        requiredDistinctMakers: 1,
        providers: [{ providerRef: " ", adapterKind: "openai-compatible-http", maker: "m", vetting: VETTING }]
      }
    ]) {
      expect(() => buildConfiguredProviderSetDeploymentRow(input as never, "fixture-source-ref"))
        .toThrowError(new TypeError("CONFIGURED_PROVIDER_SET_INVALID"));
    }
  });
});

describe("V-9 adding a vendor is one more entry, read by the shipped reader (task 10c)", () => {
  it("reads the superseding row exactly as it reads the sealed one", async () => {
    const deployment = buildConfiguredProviderSetDeploymentRow({
      requiredDistinctMakers: 1,
      providers: vetted(SEALED_INPUT.providers)
    }, "fixture-source-ref");
    const sealed = buildConfiguredProviderSetSealedRow(SEALED_INPUT, "fixture-source-ref");
    const fromDeployment = await readDeploymentMakerCapability(
      registerPool(deployment.value, deployment.sourceRef), 2
    );
    const fromSealed = await readDeploymentMakerCapability(
      registerPool(sealed.value, sealed.sourceRef), 1
    );
    expect(fromDeployment.configuredProviders).toEqual(fromSealed.configuredProviders);
    expect(fromDeployment.configuredMakers).toEqual(["Anthropic", "OpenAI"]);
    expect(fromDeployment.deploymentMakerCapability).toBe(true);
  });

  it("adds a vendor with no code at all: one entry, one maker more", async () => {
    const added = buildConfiguredProviderSetDeploymentRow({
      requiredDistinctMakers: 3,
      providers: [
        ...vetted(SEALED_INPUT.providers),
        {
          providerRef: "vendor:new-openai-compatible",
          adapterKind: "openai-compatible-http",
          maker: "NewVendor",
          vetting: VETTING
        }
      ]
    }, "fixture-source-ref");
    const capability = await readDeploymentMakerCapability(
      registerPool(added.value, added.sourceRef), 2
    );
    expect(capability.configuredMakers).toEqual(["Anthropic", "NewVendor", "OpenAI"]);
    expect(capability.configuredProviders.map((provider) => provider.providerRef))
      .toContain("vendor:new-openai-compatible");
    expect(capability.deploymentMakerCapability).toBe(true);
  });
});

/**
 * C-I5 (final review, area C) — THE BUILDER HAS A SEAM, SO THE REFUSAL IS REACHABLE.
 *
 * `buildConfiguredProviderSetDeploymentRow` had no shipped caller: the only
 * `publishGeneral` caller in the tree is the DEV seeder, which writes the sealed
 * version-1 shape from the fixed dev relay roster, and both readers accept
 * either shape. So `PROVIDER_VENDOR_NOT_VETTED` — V-9(4), the owner's rule that
 * a vendor's data-use and retention terms are read and the vendor named in the
 * privacy notice BEFORE it goes live — could not fire in production, and an
 * unvetted vendor went live by configuration. The kit's §11 step 4 says
 * publication "uses this deployment's ordinary register publication path": that
 * path is `RegisterPublicationPort.publishGeneral`, and this is where the rule
 * belongs, because it is the ONE door every publication passes through.
 *
 * The publication therefore says which deployment it is FOR. It is a required
 * member, not an option with a default: a hosted publication path that forgets
 * to declare itself does not compile, and a control that depends on another
 * control having remembered is one edit from being no control.
 */
describe("C-I5 a hosted publication carries the vetted row or none at all", () => {
  const PUBLICATION_ID = "00000000-0000-4000-8000-000000000001";
  const canonical = (value: unknown) =>
    parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value), "utf8"));

  const publicationOf = (row: ConfiguredProviderSetRow, deployment: "hosted" | "local") => ({
    publicationId: PUBLICATION_ID,
    baseRegisterVersion: parseRegisterVersionText("4"),
    rows: [{
      rowKey: row.rowKey,
      valueJsonText: canonical(row.value),
      sourceRef: row.sourceRef
    }],
    sourceRef: "fixture:publication",
    deployment
  });

  /** A pool that answers one valid receipt, and records whether it was asked. */
  function fakePool(input: ReturnType<typeof publicationOf>) {
    const events: string[] = [];
    const receipt = {
      register_version: "5",
      base_register_version: "4",
      publication_id: PUBLICATION_ID,
      publication_kind: "GENERAL",
      request_sha256: computeGeneralPublicationRequestSha256(input),
      snapshot_sha256: computeRegisterSnapshotSha256(input.rows),
      row_count: input.rows.length,
      recorded_at: new Date("2026-09-22T11:00:00.000Z")
    };
    const query = async (sql: string) => {
      events.push(sql);
      return /^(BEGIN|COMMIT|ROLLBACK)/u.test(sql)
        ? { rows: [], rowCount: 0 }
        : { rows: [receipt], rowCount: 1 };
    };
    const client = { query, release: () => events.push("RELEASE") };
    return {
      pool: { connect: async () => client, query } as unknown as Pool,
      events
    };
  }

  const sealedRow = () => buildConfiguredProviderSetSealedRow(SEALED_INPUT, "fixture-source-ref");
  const vettedRow = () => buildConfiguredProviderSetDeploymentRow({
    requiredDistinctMakers: 1,
    providers: vetted(SEALED_INPUT.providers)
  }, "fixture-source-ref");

  it("refuses the sealed shape, which carries no vetting, before any SQL runs", async () => {
    const input = publicationOf(sealedRow(), "hosted");
    const fixture = fakePool(input);

    await expect(createPostgresRegisterPublicationPort(fixture.pool).publishGeneral(input))
      .rejects.toThrowError(new TypeError("PROVIDER_VENDOR_NOT_VETTED:development:codex-cli"));

    // Nothing was published and no transaction was even opened.
    expect(fixture.events).toEqual([]);
  });

  it("refuses a hand-written row that names the deployment version but skips a vendor's record", async () => {
    const forged = Object.freeze({
      rowKey: CONFIGURED_PROVIDER_SET_ROW_KEY,
      value: Object.freeze({
        kind: "CONFIGURED_PROVIDER_SET",
        setVersion: CONFIGURED_PROVIDER_SET_DEPLOYMENT_VERSION,
        requiredDistinctMakers: 1,
        providers: [
          { ...SEALED_INPUT.providers[0]!, vetting: VETTING },
          { ...SEALED_INPUT.providers[1]!, vetting: { ...VETTING, namedInPrivacyNotice: false } }
        ]
      }),
      sourceRef: "fixture-source-ref"
    }) as ConfiguredProviderSetRow;
    const input = publicationOf(forged, "hosted");
    const fixture = fakePool(input);

    await expect(createPostgresRegisterPublicationPort(fixture.pool).publishGeneral(input))
      .rejects.toThrowError(new TypeError("PROVIDER_VENDOR_NOT_VETTED:development:claude-cli"));
    expect(fixture.events).toEqual([]);
  });

  it("publishes the row the builder made", async () => {
    const input = publicationOf(vettedRow(), "hosted");
    const fixture = fakePool(input);

    await expect(createPostgresRegisterPublicationPort(fixture.pool).publishGeneral(input))
      .resolves.toMatchObject({ registerVersion: "5", rowCount: 1 });
    expect(fixture.events[0]).toBe("BEGIN ISOLATION LEVEL READ COMMITTED");
  });

  it("leaves the LOCAL deployment publishing exactly what it publishes today", async () => {
    const input = publicationOf(sealedRow(), "local");
    const fixture = fakePool(input);

    await expect(createPostgresRegisterPublicationPort(fixture.pool).publishGeneral(input))
      .resolves.toMatchObject({ registerVersion: "5" });
    expect(fixture.events[0]).toBe("BEGIN ISOLATION LEVEL READ COMMITTED");
  });

  it("is the seam the dev seeder goes through, declaring itself local", async () => {
    const source = await readFile(
      new URL("../../apps/runner/src/dev-deployment-register.ts", import.meta.url), "utf8"
    );
    expect(source).toContain("publishGeneral({");
    expect(source).toMatch(/deployment: "local"/u);
  });
});
