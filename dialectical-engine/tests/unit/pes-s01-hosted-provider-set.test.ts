import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";
import { parseProviderDiscoveryTargets } from "@debateai/providers";
import {
  CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF,
  computeRegisterSnapshotSha256,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  type RegisterPublicationPort,
  type RegisterPublicationReceipt,
  type RegisterPublicationRow,
  type VettedConfiguredProvider
} from "@debateai/register";
import {
  DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX,
  developmentProviderSetPublicationId,
  parseDevelopmentDeploymentRegisterCliOutput
} from "../../apps/runner/src/dev-deployment-register.js";
import * as hosted from "../../apps/runner/src/hosted-provider-set.js";
import { readLegacyDevelopmentV4Rows } from "../support/registerFixtures.js";

const E = {
  provider_ref: "vendor:a", adapter_kind: "openai-compatible-http", maker: "Acme",
  vetting: { data_use_terms_reviewed_on: "2026-09-01", retention_terms_reviewed_on: "2026-09-01", named_in_privacy_notice: true },
  base_url: "https://api.acme.example/v1", model: "acme-large",
  runner_authorization_file: "/etc/debateai/runner/providers/acme.header",
  api_authorization_file: "/etc/debateai/api/providers/acme.header",
  input_price_micros_per_million: 1000, output_price_micros_per_million: 2000
};
const Eprime = { ...E, provider_ref: "vendor:b", maker: "Beta" };
const V1REF = "DEV-01-local-auth-topology.md#ordered-bootstrap:DEV-05";
const SUFFIX = CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF;
const text = (elements: readonly unknown[]) => JSON.stringify({ providers: elements });
const RUNNER = 'PES_HOSTED_TARGETS_RUNNER_V1=[{"provider_ref":"vendor:a","base_url":"https://api.acme.example/v1","model":"acme-large","authorization_file":"/etc/debateai/runner/providers/acme.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}]';
const API = 'PES_HOSTED_TARGETS_API_V1=[{"provider_ref":"vendor:a","base_url":"https://api.acme.example/v1","model":"acme-large","authorization_file":"/etc/debateai/api/providers/acme.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}]';
const SNAPSHOT = "579690d7a51248ea486632c347c32ee0dbd99814206f1a5c05d85c7d405931c9";
const RECEIPT = 'PES_HOSTED_PROVIDER_SET_RECEIPT_V1={"registerVersion":"5","rowCount":32,"snapshotSha256":"579690d7a51248ea486632c347c32ee0dbd99814206f1a5c05d85c7d405931c9"}';
const BUILT = '{"kind":"CONFIGURED_PROVIDER_SET","providers":[{"adapterKind":"openai-compatible-http","maker":"Acme","providerRef":"vendor:a","vetting":{"dataUseTermsReviewedOn":"2026-09-01","namedInPrivacyNotice":true,"retentionTermsReviewedOn":"2026-09-01"}}],"requiredDistinctMakers":1,"setVersion":2}';
const inputs: hosted.HostedPublishInputs = {
  deploymentMode: "hosted", nodeEnv: undefined, registerVersion: "4", rosterPath: "/roster.json"
};
let seed: readonly RegisterPublicationRow[];
beforeAll(async () => { seed = await readLegacyDevelopmentV4Rows(); });

// Every rejection asserts the error class and byte-exact message; a wrapping or leaking mutant must fail.
function refused(run: () => unknown, message: string): void {
  let error: unknown;
  try { run(); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(TypeError);
  expect((error as TypeError).message).toBe(message);
}
async function refusedAsync(run: Promise<unknown>, message: string): Promise<void> {
  let error: unknown;
  try { await run; } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(TypeError);
  expect((error as TypeError).message).toBe(message);
}
function fixture(rosterText = text([E]), baseRows = seed) {
  const publishGeneral = vi.fn<RegisterPublicationPort["publishGeneral"]>(async p => ({
    registerVersion: parseRegisterVersionText("5"), rowCount: p.rows.length,
    snapshotSha256: computeRegisterSnapshotSha256(p.rows), publicationId: p.publicationId,
    baseRegisterVersion: p.baseRegisterVersion, publicationKind: "GENERAL",
    requestSha256: "0".repeat(64), recordedAt: new Date("2026-09-25T00:00:00Z")
  } satisfies RegisterPublicationReceipt));
  const readVersionRows = vi.fn(async (v: string) => v === "4" ? baseRows : []);
  const readRosterText = vi.fn(async (_path: string) => rosterText);
  const openRegister = vi.fn(async () => ({ readVersionRows, port: { publishGeneral } }));
  const ports = { readRosterText, openRegister };
  return { publishGeneral, readVersionRows, readRosterText, openRegister, ports,
    run: (overrides: Partial<hosted.HostedPublishInputs> = {}) => hosted.publishHostedProviderSet({ ...inputs, ...overrides }, ports) };
}
const role = (rowKey: string, value: unknown): RegisterPublicationRow => ({
  rowKey, valueJsonText: parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value), "utf8")), sourceRef: "pes-s01-unit-role"
});
const SYN = (providerRef: string) => role("synthesizerRoleRef", { kind: "SYNTHESIZER_ROLE_REF", providerRef, provisional: true });
const EVA = (providerRef: string) => role("evaluatorRoleRef", { kind: "EVALUATOR_ROLE_REF", providerRef, provisional: true });
function publishedRows(f: ReturnType<typeof fixture>) { return f.publishGeneral.mock.calls[0]![0].rows; }
function configuredRow(f: ReturnType<typeof fixture>) { return publishedRows(f).find(r => r.rowKey === "configuredProviderSet")!; }

describe("hosted provider set", () => {
  // Property: roster order and values survive the gate. Mutant: reverse admitted elements.
  it("A1 admits element E and keeps the roster's providers in order", () => {
    expect(hosted.gateHostedRoster(text([E, Eprime])).providers).toStrictEqual([E, Eprime]);
  });
  // Property: repeats stop at the gate. Mutant: remove repeat detection.
  it("A2 refuses a repeated provider_ref with the repeated ref", () => {
    refused(() => hosted.gateHostedRoster(text([E, E])), "PES_PUBLISH_ROSTER_INVALID:vendor:a");
  });
  // Property: only exactly ten keys are admitted. Mutant: drop the key-set comparison.
  it("A3 refuses a missing, an eleventh or a renamed key, naming the provider_ref", () => {
    const { model, ...missing } = E;
    const { base_url, ...renamed } = E;
    for (const element of [missing, { ...E, authorization_header: "x" }, { ...renamed, baseUrl: base_url }]) {
      refused(() => hosted.gateHostedRoster(text([element])), "PES_PUBLISH_ROSTER_INVALID:vendor:a");
    }
  });
  // Property: adapter admission follows the shipped set. Mutant: skip adapter membership.
  it("A4 refuses an adapter_kind outside BUILT_IN_PROVIDER_ADAPTERS and admits both shipped kinds", () => {
    refused(() => hosted.gateHostedRoster(text([{ ...E, adapter_kind: "anthropic-http" }])), "PES_PUBLISH_ROSTER_INVALID:vendor:a");
    for (const adapter_kind of ["openai-compatible-http", "vllm-openai-compatible-http"]) {
      expect(hosted.gateHostedRoster(text([{ ...E, adapter_kind }])).providers[0]!.adapter_kind).toBe(adapter_kind);
    }
  });
  // Property: vetting shape is checked, absent members are left to the builder. Mutant: allow unknown keys.
  it("A5 refuses a vetting that is not an object or has an unknown key, and admits one with a member missing", () => {
    for (const vetting of ["yes", { ...E.vetting, reviewed_by: "V" }]) {
      refused(() => hosted.gateHostedRoster(text([{ ...E, vetting }])), "PES_PUBLISH_ROSTER_INVALID:vendor:a");
    }
    expect(hosted.gateHostedRoster(text([{ ...E, vetting: {} }])).providers[0]!.vetting).toStrictEqual({});
  });
  // Property: non-string refs identify the index, never input values. Mutant: stringify the ref.
  it("A6 names the array index when the offending element has no string provider_ref", () => {
    const { model, ...missing } = E;
    refused(() => hosted.gateHostedRoster(text([E, { ...missing, provider_ref: 7 }])), "PES_PUBLISH_ROSTER_INVALID:1");
    refused(() => hosted.gateHostedRoster(text(["x"])), "PES_PUBLISH_ROSTER_INVALID:0");
  });
  // Property: exactly one nonempty providers array is required. Mutant: accept an empty roster.
  it("A7 refuses a top level that is not one non-empty providers array, with an empty suffix", () => {
    for (const raw of ["[]", "null", '{"providers":[]}', '{"providers":{}}', JSON.stringify({ providers: [E], extra: 1 })]) {
      refused(() => hosted.gateHostedRoster(raw), "PES_PUBLISH_ROSTER_INVALID:");
    }
  });
  // Property: JSON errors cannot disclose the source. Mutant: rethrow JSON.parse's error.
  it("A8 refuses text that is not JSON without quoting it", () => {
    refused(() => hosted.gateHostedRoster('{"providers":[{"runner_authorization_file":/etc/debateai/runner/providers/acme.header}]}'), "PES_PUBLISH_ROSTER_INVALID:");
  });
  // Property: adapter source stays the package constant. Mutant: replace it with literal names.
  it("A9 reads the adapter kinds from the shipped constant, never retyped", async () => {
    const source = await readFile("apps/runner/src/hosted-provider-set.ts", "utf8");
    expect(source).toContain("BUILT_IN_PROVIDER_ADAPTERS");
    expect(source).not.toContain('"openai-compatible-http"');
    expect(source).not.toContain('"vllm-openai-compatible-http"');
  });
  // Property: row projection and vetting names are exact. Mutant: rename providerRef or leak base_url.
  it("B1 maps element E to the VettedConfiguredProvider of R1.1", () => {
    const result = hosted.hostedConfiguredProviders(hosted.gateHostedRoster(text([E])));
    expect(result).toStrictEqual([{ providerRef: "vendor:a", adapterKind: "openai-compatible-http", maker: "Acme", vetting: {
      dataUseTermsReviewedOn: "2026-09-01", retentionTermsReviewedOn: "2026-09-01", namedInPrivacyNotice: true
    } }]);
    expect(Object.keys(result[0]!)).toStrictEqual(["providerRef", "adapterKind", "maker", "vetting"]);
    expectTypeOf(hosted.hostedConfiguredProviders).returns.toEqualTypeOf<VettedConfiguredProvider[]>();
  });
  // Property: missing vetting members remain absent. Mutant: add undefined-valued members.
  it("B2 leaves a vetting member the roster omits absent", () => {
    const roster = hosted.gateHostedRoster(text([{ ...E, vetting: { data_use_terms_reviewed_on: "2026-09-01" } }]));
    expect(hosted.hostedConfiguredProviders(roster)[0]!.vetting).toStrictEqual({ dataUseTermsReviewedOn: "2026-09-01" });
  });
  // Property: row provider order follows input in both directions. Mutant: sort refs.
  it("B3 keeps the roster's order", () => {
    expect(hosted.hostedConfiguredProviders(hosted.gateHostedRoster(text([E, Eprime]))).map(p => p.providerRef)).toStrictEqual(["vendor:a", "vendor:b"]);
    expect(hosted.hostedConfiguredProviders(hosted.gateHostedRoster(text([Eprime, E]))).map(p => p.providerRef)).toStrictEqual(["vendor:b", "vendor:a"]);
  });
  // Property: each service receives its own credential path. Mutant: use runner path for API.
  it("C1 derives the runner and the API targets", () => {
    expect(hosted.deriveHostedProviderTargets(hosted.gateHostedRoster(text([E])))).toStrictEqual({
      runner: RUNNER.slice("PES_HOSTED_TARGETS_RUNNER_V1=".length), api: API.slice("PES_HOSTED_TARGETS_API_V1=".length)
    });
  });
  // Property: target projection preserves exact keys/order and parses. Mutant: reverse targets or add maker.
  it("C2 derives only the six allow-listed keys, in the roster's order", () => {
    const { runner } = hosted.deriveHostedProviderTargets(hosted.gateHostedRoster(text([E, Eprime])));
    const targets = JSON.parse(runner) as Record<string, unknown>[];
    const keys = ["provider_ref", "base_url", "model", "authorization_file", "input_price_micros_per_million", "output_price_micros_per_million"];
    expect(targets.map(Object.keys)).toStrictEqual([keys, keys]);
    expect(targets.map(t => t.provider_ref)).toStrictEqual(["vendor:a", "vendor:b"]);
    expect(parseProviderDiscoveryTargets(runner, [{ providerRef: "vendor:a", maker: "Acme" }, { providerRef: "vendor:b", maker: "Beta" }])).toHaveLength(2);
  });
  // Property: stable UUID identity uses the hosted namespace. Mutant: reuse the dev namespace.
  it("D1 builds the publication id in the hosted namespace", () => {
    expect(hosted.hostedProviderSetPublicationId(parseRegisterVersionText("4"), "0".repeat(64))).toBe("f46205a2-12c8-4dad-a14a-abb2b836354e");
    expect(developmentProviderSetPublicationId(parseRegisterVersionText("4"), "0".repeat(64))).toBe("e5e29eff-627c-4507-b9d5-e131a69c35de");
  });
  // Property: republication strips exactly one trailing suffix. Mutant: keep the suffix.
  it("D2 removes one trailing deployment suffix", () => {
    expect(hosted.sealedSourceRefOf(V1REF)).toBe(V1REF);
    expect(hosted.sealedSourceRefOf(V1REF + SUFFIX)).toBe(V1REF);
    expect(hosted.sealedSourceRefOf(V1REF + SUFFIX + SUFFIX)).toBe(V1REF + SUFFIX);
    expect(hosted.sealedSourceRefOf(V1REF + SUFFIX + "tail")).toBe(V1REF + SUFFIX + "tail");
  });
  // Property: receipt projects three keys in the declared order. Mutant: swap rowCount and version.
  it("E1 formats the receipt line", () => {
    expect(hosted.formatHostedProviderSetReceipt({ registerVersion: parseRegisterVersionText("5"), rowCount: 32, snapshotSha256: SNAPSHOT })).toBe(RECEIPT);
  });
  // Property: hosted receipts do not enter the development reader. Mutant: emit a development prefix.
  it("E2 is refused by the development receipt reader", async () => {
    const line = hosted.formatHostedProviderSetReceipt({ registerVersion: parseRegisterVersionText("5"), rowCount: 32, snapshotSha256: SNAPSHOT });
    await refusedAsync(parseDevelopmentDeploymentRegisterCliOutput(line + "\n", "/nonexistent"), "DEV_DEPLOYMENT_REGISTER_RECEIPT_OUTPUT_INVALID");
  });
  // Property: the external line and publication identities are stable. Mutant: empty literals.
  it("E3 names this slice's literals", () => {
    expect(hosted.HOSTED_TARGETS_RUNNER_STDOUT_PREFIX).toBe("PES_HOSTED_TARGETS_RUNNER_V1=");
    expect(hosted.HOSTED_TARGETS_API_STDOUT_PREFIX).toBe("PES_HOSTED_TARGETS_API_V1=");
    expect(hosted.HOSTED_PROVIDER_SET_RECEIPT_STDOUT_PREFIX).toBe("PES_HOSTED_PROVIDER_SET_RECEIPT_V1=");
    expect(hosted.HOSTED_PROVIDER_SET_RECEIPT_STDOUT_PREFIX).not.toBe(DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX);
    expect(hosted.HOSTED_PROVIDER_SET_PUBLICATION_SOURCE_REF).toBe("provider-env-selection/S01#hosted-provider-set:published");
  });
  // Property: only hosted resolves successfully. Mutant: allow local.
  it("F1 admits hosted and refuses every other resolved mode by name", () => {
    expect(hosted.hostedDeploymentModeOrRefuse("hosted", undefined)).toBe("hosted");
    refused(() => hosted.hostedDeploymentModeOrRefuse("local", undefined), "PES_PUBLISH_SET_NOT_HOSTED:local");
    refused(() => hosted.hostedDeploymentModeOrRefuse(undefined, undefined), "PES_PUBLISH_SET_NOT_HOSTED:local");
  });
  // Property: resolver failures remain verbatim. Mutant: replace resolver with a default.
  it("F2 passes the shipped resolver's codes through verbatim", () => {
    refused(() => hosted.hostedDeploymentModeOrRefuse("HOSTED", undefined), "DEPLOYMENT_MODE_INVALID");
    refused(() => hosted.hostedDeploymentModeOrRefuse(undefined, "production"), "DEPLOYMENT_MODE_UNRESOLVED");
  });
  // Property: mode is checked before either side-effect port. Mutant: read/open first.
  it("G1 not-hosted: refused before the roster is read or the register opened", async () => {
    const f = fixture();
    await refusedAsync(f.run({ deploymentMode: "local" }), "PES_PUBLISH_SET_NOT_HOSTED:local");
    expect(f.readRosterText).toHaveBeenCalledTimes(0); expect(f.openRegister).toHaveBeenCalledTimes(0);
  });
  // Property: an invalid roster never opens the register. Mutant: open before gate.
  it("G2 roster-invalid: refused before the register opens", async () => {
    const f = fixture(text([E, E]));
    await refusedAsync(f.run(), "PES_PUBLISH_ROSTER_INVALID:vendor:a");
    expect(f.openRegister).toHaveBeenCalledTimes(0);
  });
  // Property: path failures neither leak paths nor open the register. Mutant: expose read error.
  it("G3 an unset, relative or unreadable roster path is refused with an empty suffix", async () => {
    for (const rosterPath of [undefined, "roster.json"]) {
      const f = fixture();
      await refusedAsync(f.run({ rosterPath }), "PES_PUBLISH_ROSTER_INVALID:");
      expect(f.readRosterText).toHaveBeenCalledTimes(0); expect(f.openRegister).toHaveBeenCalledTimes(0);
    }
    const f = fixture();
    f.readRosterText.mockRejectedValue(new Error("ENOENT: no such file or directory, open '/roster.json'"));
    await refusedAsync(f.run(), "PES_PUBLISH_ROSTER_INVALID:"); expect(f.openRegister).toHaveBeenCalledTimes(0);
  });
  // Property: bad versions stop before DB access. Mutant: open before parse.
  it("G4 a REGISTER_VERSION that is not a version text is refused before the register opens", async () => {
    for (const registerVersion of ["abc", undefined]) {
      const f = fixture(); await refusedAsync(f.run({ registerVersion }), "REGISTER_VERSION_TEXT_INVALID");
      expect(f.openRegister).toHaveBeenCalledTimes(0);
    }
  });
  // Property: a valid but absent base reports the requested version and publishes nothing. Mutant: change suffix.
  it("G5 base-row-absent: refused before the builder, nothing published", async () => {
    const f = fixture(); await refusedAsync(f.run({ registerVersion: "999" }), "PES_PUBLISH_BASE_ROW_ABSENT:999");
    expect(f.publishGeneral).toHaveBeenCalledTimes(0);
  });
  // Property: unvetted content stops at the shipped builder. Mutant: force vetting true.
  it("G6 unvetted: the shipped builder's line, nothing published", async () => {
    const f = fixture(text([{ ...E, vetting: { ...E.vetting, named_in_privacy_notice: false } }]));
    await refusedAsync(f.run(), "PROVIDER_VENDOR_NOT_VETTED:vendor:a"); expect(f.publishGeneral).toHaveBeenCalledTimes(0);
  });
  // Property: builder shape failures remain verbatim. Mutant: replace missing maker with Acme.
  it("G7 a shape refusal of the shipped builder is printed verbatim", async () => {
    const f = fixture(text([{ ...E, maker: "" }]));
    await refusedAsync(f.run(), "CONFIGURED_PROVIDER_SET_INVALID"); expect(f.publishGeneral).toHaveBeenCalledTimes(0);
  });
  // Property: both targets are parsed before any publish. Mutant: skip API self-check.
  it("G8 targets-rejected: the parser's code behind the prefix, nothing published", async () => {
    for (const [element, code] of [
      [{ ...E, base_url: "https://api.acme.example/v2" }, "PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID"],
      [{ ...E, runner_authorization_file: "relative/acme.header" }, "PROVIDER_DISCOVERY_AUTHORIZATION_FILE_INVALID"],
      [{ ...E, api_authorization_file: "relative/acme.header" }, "PROVIDER_DISCOVERY_AUTHORIZATION_FILE_INVALID"]
    ] as const) {
      const f = fixture(text([element])); await refusedAsync(f.run(), "PES_PUBLISH_SET_TARGETS_REJECTED:" + code);
      expect(f.publishGeneral).toHaveBeenCalledTimes(0);
    }
  });
  // Property: the exact hosted request replaces one row and preserves 31 other rows. Mutant: drop a row.
  it("G9 published: one hosted publication and the three lines", async () => {
    const expectedSeed = structuredClone(seed);
    const f = fixture(); expect(await f.run()).toStrictEqual([RUNNER, API, RECEIPT]);
    expect(f.readRosterText).toHaveBeenCalledExactlyOnceWith("/roster.json");
    expect(f.readVersionRows).toHaveBeenCalledExactlyOnceWith("4");
    expect(f.publishGeneral).toHaveBeenCalledTimes(1);
    const p = f.publishGeneral.mock.calls[0]![0];
    expect(Object.keys(p)).toStrictEqual(["publicationId", "baseRegisterVersion", "rows", "sourceRef", "deployment"]);
    expect(p.publicationId).toBe("2a1ff6e9-7bfe-4bc8-b7d9-36e786ab80b4"); expect(p.baseRegisterVersion).toBe("4");
    expect(p.sourceRef).toBe("provider-env-selection/S01#hosted-provider-set:published"); expect(p.deployment).toBe("hosted");
    expect(p.rows).toHaveLength(32);
    expect(configuredRow(f)).toStrictEqual({ rowKey: "configuredProviderSet", valueJsonText: BUILT, sourceRef: V1REF + SUFFIX });
    expect(p.rows.filter(r => r.rowKey !== "configuredProviderSet")).toStrictEqual(expectedSeed.filter(r => r.rowKey !== "configuredProviderSet"));
  });
  // Property: the diversity floor comes from the base, independent of roster size. Mutant: hardcode one.
  it("G10 requiredDistinctMakers comes from the base row", async () => {
    const rows = seed.map(r => r.rowKey === "configuredProviderSet" ? { ...r, valueJsonText: parseCanonicalRegisterJson(Buffer.from(JSON.stringify({ ...JSON.parse(r.valueJsonText), requiredDistinctMakers: 2 }))) } : r);
    const f = fixture(text([E]), rows); await f.run();
    expect(configuredRow(f).valueJsonText).toContain('"requiredDistinctMakers":2');
  });
  // Property: republication appends provenance once. Mutant: bypass suffix stripping at call site.
  it("G11 a republication from a hosted base appends the suffix once", async () => {
    const f = fixture(text([E]), seed.map(r => r.rowKey === "configuredProviderSet" ? { ...r, sourceRef: V1REF + SUFFIX } : r));
    await f.run(); expect(configuredRow(f).sourceRef).toBe(V1REF + SUFFIX);
  });
  // Property: kept roles are copied exactly and may name any roster element. Mutant: check only first provider.
  it("G12 a present role row naming a roster provider passes and is carried forward byte for byte", async () => {
    const roles = [SYN("vendor:a"), EVA("vendor:a")];
    const expectedRoles = structuredClone(roles);
    const f = fixture(text([E]), [...seed, ...roles]); await f.run();
    expect(f.publishGeneral).toHaveBeenCalledTimes(1); expect(publishedRows(f)).toHaveLength(34);
    expect(publishedRows(f).filter(r => r.rowKey.endsWith("RoleRef"))).toStrictEqual(expectedRoles);
    const other = fixture(text([E, Eprime]), [...seed, SYN("vendor:a"), EVA("vendor:b")]);
    await other.run(); expect(other.publishGeneral).toHaveBeenCalledTimes(1);
  });
  // Property: the first dropped role refuses before publication. Mutant: reverse role key order.
  it("G13 the first present role row naming no roster provider refuses by its key, nothing published", async () => {
    for (const [s, key] of [["vendor:a", "evaluatorRoleRef"], ["vendor:z", "synthesizerRoleRef"]]) {
      const f = fixture(text([E]), [...seed, SYN(s!), EVA("vendor:z")]);
      await refusedAsync(f.run(), "PES_PUBLISH_ROLE_PROVIDER_DROPPED:" + key); expect(f.publishGeneral).toHaveBeenCalledTimes(0);
    }
  });
  // Property: absence skips one key, without skipping later keys. Mutant: return at first absence.
  it("G14 an absent role row is not checked", async () => {
    const bad = fixture(text([E]), [...seed, EVA("vendor:z")]);
    await refusedAsync(bad.run(), "PES_PUBLISH_ROLE_PROVIDER_DROPPED:evaluatorRoleRef"); expect(bad.publishGeneral).toHaveBeenCalledTimes(0);
    const good = fixture(text([E]), [...seed, SYN("vendor:a")]); await good.run(); expect(publishedRows(good)).toHaveLength(33);
  });
  // Property: present roles require a string ref. Mutant: ignore missing/non-string refs.
  it("G15 a present role row whose value holds no string providerRef refuses", async () => {
    for (const value of [null, [], "vendor:a", { kind: "SYNTHESIZER_ROLE_REF", providerRef: 7, provisional: true }, { kind: "SYNTHESIZER_ROLE_REF", provisional: true }]) {
      const f = fixture(text([E]), [...seed, role("synthesizerRoleRef", value)]);
      await refusedAsync(f.run(), "PES_PUBLISH_ROLE_PROVIDER_DROPPED:synthesizerRoleRef"); expect(f.publishGeneral).toHaveBeenCalledTimes(0);
    }
  });
  // Property: builder and self-check precede role validation. Mutant: move role check before builder.
  it("G16 the role rows are step (6): after the build and the self-check", async () => {
    for (const [element, code] of [
      [{ ...E, base_url: "https://api.acme.example/v2" }, "PES_PUBLISH_SET_TARGETS_REJECTED:PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID"],
      [{ ...E, vetting: { ...E.vetting, named_in_privacy_notice: false } }, "PROVIDER_VENDOR_NOT_VETTED:vendor:a"]
    ] as const) {
      const f = fixture(text([element]), [...seed, EVA("vendor:z")]); await refusedAsync(f.run(), code); expect(f.publishGeneral).toHaveBeenCalledTimes(0);
    }
  });
});
