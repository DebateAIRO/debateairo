// ARCH-PES-S01 probe p1 — executes the SPEC-v3 R1.2/R1.3/R1.7 chain through the SHIPPED functions of the
// S01 lane (absolute imports, so the lane's code is what runs, never the main tree's), for the exact
// fixtures of SPEC-v3 §5 and the extra fixtures this plan adds. Read-only: prints to stdout only.
// Run: cd <lane> && PATH=/opt/homebrew/bin:$PATH pnpm exec tsx <this file>
import { createHash } from "node:crypto";

const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine";
const register = await import(`${LANE}/packages/register/src/index.ts`);
const providers = await import(`${LANE}/packages/providers/src/index.ts`);
const devRegister = await import(`${LANE}/apps/runner/src/dev-deployment-register.ts`);
const fixtures = await import(`${LANE}/tests/support/registerFixtures.ts`);

const out = (label: string, value: unknown) => console.log(`${label}\t${typeof value === "string" ? value : JSON.stringify(value)}`);
const attempt = (label: string, run: () => unknown) => {
  try { out(label, `OK ${JSON.stringify(run())}`); } catch (error) { out(label, `THROW ${(error as Error).message}`); }
};

const E = {
  provider_ref: "vendor:a", adapter_kind: "openai-compatible-http", maker: "Acme",
  vetting: { data_use_terms_reviewed_on: "2026-09-01", retention_terms_reviewed_on: "2026-09-01", named_in_privacy_notice: true },
  base_url: "https://api.acme.example/v1", model: "acme-large",
  runner_authorization_file: "/etc/debateai/runner/providers/acme.header",
  api_authorization_file: "/etc/debateai/api/providers/acme.header",
  input_price_micros_per_million: 1000, output_price_micros_per_million: 2000
} as const;
type Element = Record<string, unknown>;

const RENAME: Record<string, string> = {
  data_use_terms_reviewed_on: "dataUseTermsReviewedOn",
  retention_terms_reviewed_on: "retentionTermsReviewedOn",
  named_in_privacy_notice: "namedInPrivacyNotice"
};
const toVetted = (element: Element) => {
  const vetting = element.vetting as Record<string, unknown>;
  const renamed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(vetting)) renamed[RENAME[key]!] = value;
  return { providerRef: element.provider_ref, adapterKind: element.adapter_kind, maker: element.maker, vetting: renamed };
};
const derived = (elements: Element[], which: "runner" | "api") => JSON.stringify(elements.map((element) => ({
  provider_ref: element.provider_ref,
  base_url: element.base_url,
  model: element.model,
  authorization_file: which === "runner" ? element.runner_authorization_file : element.api_authorization_file,
  input_price_micros_per_million: element.input_price_micros_per_million,
  output_price_micros_per_million: element.output_price_micros_per_million
})));
const BASE_SOURCE_REF = "DEV-01-local-auth-topology.md#ordered-bootstrap:DEV-05";
const build = (elements: Element[], requiredDistinctMakers: unknown = 1, sealed = BASE_SOURCE_REF) =>
  register.buildConfiguredProviderSetDeploymentRow(
    { requiredDistinctMakers, providers: elements.map(toVetted) }, sealed
  );

// --- the shipped constants the gate reads
out("BUILT_IN_ADAPTER_KINDS", providers.BUILT_IN_PROVIDER_ADAPTERS.map((a: { adapterKind: string }) => a.adapterKind));
out("DEPLOYMENT_SOURCE_REF", register.CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF);

// --- R1.5: the shipped resolver
for (const [mode, nodeEnv] of [["hosted", undefined], ["local", undefined], [undefined, undefined], [undefined, "production"], ["HOSTED", undefined], [" hosted", undefined], ["", "production"]] as const) {
  attempt(`resolveDeploymentMode(${JSON.stringify(mode)},${JSON.stringify(nodeEnv)})`, () => register.resolveDeploymentMode(mode, nodeEnv));
}

// --- REGISTER_VERSION parse
for (const version of ["4", "999", "abc", "0", "", undefined]) {
  attempt(`parseRegisterVersionText(${JSON.stringify(version)})`, () => register.parseRegisterVersionText(version));
}

// --- R1.2 / R1.7 build through the shipped builder
const published = build([E]);
out("published.sourceRef", published.sourceRef);
const canonical = register.parseCanonicalRegisterJson(Buffer.from(JSON.stringify(published.value), "utf8"));
out("published.valueJsonText", canonical);
attempt("build unvetted (named_in_privacy_notice=false)", () => build([{ ...E, vetting: { ...E.vetting, named_in_privacy_notice: false } }]));
attempt("build vetting {}", () => build([{ ...E, vetting: {} }]));
attempt("build vetting missing retention", () => build([{ ...E, vetting: { data_use_terms_reviewed_on: "2026-09-01", named_in_privacy_notice: true } }]));
attempt("build date 2026-9-1", () => build([{ ...E, vetting: { ...E.vetting, data_use_terms_reviewed_on: "2026-9-1" } }]));
attempt("build [E,E] (gate-skipped)", () => build([E, E]));
attempt("build maker empty", () => build([{ ...E, maker: "" }]));
attempt("build maker padded", () => build([{ ...E, maker: " Acme" }]));
attempt("build provider_ref number", () => build([{ ...E, provider_ref: 7 }]));
attempt("build requiredDistinctMakers 0", () => build([E], 0));
attempt("build unvetted + maker empty (shape first?)", () => build([{ ...E, maker: "", vetting: {} }]));

// --- R1.3 self-check through the shipped parser, configured set = the BUILT row's providers
const configured = (published.value as { providers: readonly { providerRef: string; maker: string }[] }).providers;
out("derived.runner", derived([E], "runner"));
out("derived.api", derived([E], "api"));
attempt("parse runner", () => providers.parseProviderDiscoveryTargets(derived([E], "runner"), configured).length);
attempt("parse api", () => providers.parseProviderDiscoveryTargets(derived([E], "api"), configured).length);
const v2 = { ...E, base_url: "https://api.acme.example/v2" };
attempt("parse targets-rejected /v2", () => providers.parseProviderDiscoveryTargets(derived([v2], "runner"), (build([v2]).value as { providers: [] }).providers));
const httpE = { ...E, base_url: "http://api.acme.example/v1" };
attempt("parse http base_url", () => providers.parseProviderDiscoveryTargets(derived([httpE], "runner"), configured).length);
const priceText = { ...E, input_price_micros_per_million: "1000" };
attempt("parse price as string", () => providers.parseProviderDiscoveryTargets(derived([priceText], "runner"), configured).length);
const relative = { ...E, runner_authorization_file: "relative/acme.header" };
attempt("parse relative authorization_file", () => providers.parseProviderDiscoveryTargets(derived([relative], "runner"), configured).length);
const badModel = { ...E, model: "" };
attempt("parse empty model", () => providers.parseProviderDiscoveryTargets(derived([badModel], "runner"), configured).length);

// --- publicationId: the hosted construction (the SPEC's R1.2 row) vs the shipped development one
const hostedId = (version: string, sha: string) => {
  const bytes = Uint8Array.from(createHash("sha256").update(`debateai:hosted-provider-set:${version}:${sha}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
};
const ZERO = "0".repeat(64);
out("hostedId(4,0x64)", hostedId("4", ZERO));
out("devId(4,0x64)", devRegister.developmentProviderSetPublicationId(register.parseRegisterVersionText("4"), ZERO));

// --- the complete snapshot the `published` case sends: seed v4 with configuredProviderSet replaced
const seed = await fixtures.readLegacyDevelopmentV4Rows();
out("seed.count", seed.length);
const seedProviderRow = seed.find((row: { rowKey: string }) => row.rowKey === "configuredProviderSet");
out("seed.configuredProviderSet.sourceRef", seedProviderRow.sourceRef);
out("seed.configuredProviderSet.valueJsonText", seedProviderRow.valueJsonText);
const baseValue = JSON.parse(seedProviderRow.valueJsonText) as { requiredDistinctMakers: unknown };
out("seed.requiredDistinctMakers", baseValue.requiredDistinctMakers);
out("seed.hasSupportActivation", seed.some((row: { rowKey: string }) => row.rowKey === "supportActivation"));
const rows = seed.map((row: { rowKey: string; valueJsonText: string; sourceRef: string }) => row.rowKey === "configuredProviderSet"
  ? { rowKey: published.rowKey, valueJsonText: canonical, sourceRef: published.sourceRef }
  : row);
const snapshot = register.computeRegisterSnapshotSha256(rows);
out("published.snapshotSha256(seed v4 + built row)", snapshot);
out("published.publicationId(base 4)", hostedId("4", snapshot));
out("published.rows.count", rows.length);

// --- sealedSourceRef strip: a republication must append the suffix exactly once
const suffix = register.CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF as string;
const strip = (sourceRef: string) => sourceRef.endsWith(suffix) ? sourceRef.slice(0, -suffix.length) : sourceRef;
out("strip(v1 base)", strip(BASE_SOURCE_REF));
out("strip(v2 base) === v1 base", strip(published.sourceRef) === BASE_SOURCE_REF);
out("rebuild from v2 base sourceRef ends with ONE suffix", build([E], 1, strip(published.sourceRef)).sourceRef.split(suffix).length - 1);

// --- the hosted publication door accepts the built row (the value on its way into the database)
attempt("assertHostedConfiguredProviderSetVetted(built)", () => { register.assertHostedConfiguredProviderSetVetted?.(JSON.parse(canonical)); return "passes or not exported"; });

// --- R1.9: a V8 JSON.parse error message quotes the source text around the error
const brokenRoster = `{"providers":[{"runner_authorization_file":"/etc/debateai/runner/providers/acme.header" "x":1}]}`;
attempt("JSON.parse(broken roster) message", () => JSON.parse(brokenRoster));
const brokenRoster2 = `{"providers":[{"runner_authorization_file":/etc/debateai/runner/providers/acme.header}]}`;
attempt("JSON.parse(unquoted path) message", () => JSON.parse(brokenRoster2));
