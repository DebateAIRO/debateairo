// REQ-FIX-PES pass 3 — the EXECUTED half of the checkers. It runs the SHIPPED functions of the
// read-only planning lane on the fixtures a SPEC names and prints what they actually do, as JSON.
// It writes nothing in the lane, opens no listener and no database, and holds no real key.
//
//   node_modules/.bin/tsx p3_exec.ts '<json request>'
//
// Requests (one per call):
//   {"op":"s01_case", ...}    the publish command's order over one roster fixture
//   {"op":"s02_chain", ...}   one target through the chain apps/api/src/main.ts:300-325 takes
//   {"op":"s02_layout", ...}  build a credential layout and read it through the shipped custody reader
//   {"op":"n1_resolver", ...} build createProviderDiscoveryResolver with the two integers given
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-base/dialectical-engine";
const providers = await import(`${LANE}/packages/providers/src/index.js`);
const register = await import(`${LANE}/packages/register/src/configured-provider-set.js`);
const runtime = await import(`${LANE}/packages/register/src/runtime-environment.js`);
const crypto = await import(`${LANE}/packages/crypto/src/index.js`);
const discovery = await import(`${LANE}/apps/api/src/provider-discovery.js`);

const request = JSON.parse(process.argv[2] ?? "{}");
const out = (value: unknown) => console.log(JSON.stringify(value));
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const ROSTER_KEYS = [
  "provider_ref", "adapter_kind", "maker", "vetting", "base_url", "model",
  "runner_authorization_file", "api_authorization_file",
  "input_price_micros_per_million", "output_price_micros_per_million"
];
const VETTING_KEYS = ["data_use_terms_reviewed_on", "retention_terms_reviewed_on", "named_in_privacy_notice"];

function s01Case(r: {
  elements: Record<string, unknown>[];
  mode?: string;                       // DEBATEAI_DEPLOYMENT_MODE for the case (undefined = hosted)
  registerVersion?: string;            // REGISTER_VERSION for the case
  gate: { uniqueRefs: boolean };       // the roster gate the SPEC states
  base: { version: string; requiredDistinctMakers: number; sourceRef: string } | null;
}): string {
  // 1. mode (R1.5) — the shipped resolver
  let mode: string;
  try { mode = runtime.resolveDeploymentMode(r.mode ?? "hosted", undefined); }
  catch (error) { return message(error); }
  if (mode !== "hosted") return `PES_PUBLISH_SET_NOT_HOSTED:${mode}`;
  // 2. the roster gate (R1.2) — the SPEC's own rule, modelled from the flags the caller read
  const seen = new Set<string>();
  const adapterKinds = providers.BUILT_IN_PROVIDER_ADAPTERS.map((a: { adapterKind: string }) => a.adapterKind);
  for (const [index, element] of r.elements.entries()) {
    const ref = typeof element.provider_ref === "string" ? element.provider_ref : String(index);
    const keys = Object.keys(element);
    if (keys.length !== ROSTER_KEYS.length || !ROSTER_KEYS.every((k) => keys.includes(k))) {
      return `PES_PUBLISH_ROSTER_INVALID:${ref}`;
    }
    if (r.gate.uniqueRefs && seen.has(ref)) return `PES_PUBLISH_ROSTER_INVALID:${ref}`;
    seen.add(ref);
    if (!adapterKinds.includes(element.adapter_kind)) return `PES_PUBLISH_ROSTER_INVALID:${ref}`;
    const vetting = element.vetting;
    if (typeof vetting !== "object" || vetting === null || Array.isArray(vetting)
        || Object.keys(vetting).some((k) => !VETTING_KEYS.includes(k))) {
      return `PES_PUBLISH_ROSTER_INVALID:${ref}`;
    }
  }
  // 3. the base row (R1.2) — the seed the SPEC names, at the version the SPEC names
  if (r.base === null) return "NO_BASE_ROW_SOURCE_NAMED";
  const version = r.registerVersion ?? r.base.version;
  if (version !== r.base.version) return `PES_PUBLISH_BASE_ROW_ABSENT:${version}`;
  // 4. build (R1.7) — the SHIPPED builder, with the snake->camel vetting mapping
  const built = r.elements.map((element) => {
    const v = element.vetting as Record<string, unknown>;
    return {
      providerRef: element.provider_ref, adapterKind: element.adapter_kind, maker: element.maker,
      vetting: {
        dataUseTermsReviewedOn: v.data_use_terms_reviewed_on,
        retentionTermsReviewedOn: v.retention_terms_reviewed_on,
        namedInPrivacyNotice: v.named_in_privacy_notice
      }
    };
  });
  let row: { value: { providers: { providerRef: string; maker: string }[] } };
  try {
    row = register.buildConfiguredProviderSetDeploymentRow(
      { requiredDistinctMakers: r.base.requiredDistinctMakers, providers: built }, r.base.sourceRef);
  } catch (error) { return message(error); }
  // 5. derive both targets values and self-check them with the SHIPPED parser (R1.3)
  for (const fileKey of ["runner_authorization_file", "api_authorization_file"]) {
    const targets = r.elements.map((element) => ({
      provider_ref: element.provider_ref, base_url: element.base_url, model: element.model,
      authorization_file: element[fileKey],
      input_price_micros_per_million: element.input_price_micros_per_million,
      output_price_micros_per_million: element.output_price_micros_per_million
    }));
    try { providers.parseProviderDiscoveryTargets(JSON.stringify(targets), row.value.providers); }
    catch (error) { return `PES_PUBLISH_SET_TARGETS_REJECTED:${message(error)}`; }
  }
  return "PUBLISHABLE";
}

function s02Chain(r: { target: Record<string, unknown>; credentialFile?: string }): string {
  // The order the shipped API composition root takes: parse (main.ts:300-302) -> mode
  // (:305-307) -> price (:312) -> credentials (:317-318).
  const configured = [{ providerRef: String(r.target.provider_ref), maker: "Acme" }];
  try {
    const declared = providers.parseProviderDiscoveryTargets(JSON.stringify([r.target]), configured);
    providers.assertDeploymentProviderTargets(declared, { mode: "hosted", nodeEnv: undefined });
    providers.assertPricedProviderTargets(declared, "hosted");
    const resolved = providers.resolveProviderTargetCredentials(declared, crypto.readCustodyAuthorizationHeader);
    return resolved[0]?.authorizationHeader === undefined ? "RESOLVED_WITHOUT_HEADER" : "RESOLVED_WITH_HEADER";
  } catch (error) { return message(error); }
}

function s02Layout(r: { fileRelative: string; header: string }): Record<string, unknown> {
  // Builds <scratch>/<fileRelative> with the file's own directory at 0700 and the file at 0600,
  // exactly as the custody contract (deploy/vps/README.md:786-790) states, then reads it through
  // the SHIPPED reader. Returns the absolute paths so the caller can test the stdout law on them.
  const scratch = mkdtempSync(join(tmpdir(), "pes-s02-"));
  try {
    const file = join(scratch, r.fileRelative);
    const directory = dirname(file);
    if (directory !== scratch) mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    writeFileSync(file, `${r.header}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
    let reader: string;
    try { crypto.readCustodyAuthorizationHeader(file); reader = "READ_OK"; }
    catch (error) { reader = message(error); }
    return { scratch, file, custodyDirectory: directory, reader };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function n1Resolver(r: { probeFreshnessMs?: number; probeTimeoutMs?: number }): string {
  try {
    discovery.createProviderDiscoveryResolver({
      configuredProviders: [{ providerRef: "vendor:a", maker: "Acme" }],
      // one target matching the one configured provider, so the exact-set check at
      // provider-discovery.ts:55-60 passes and only the two integers decide the outcome
      targets: [{ providerRef: "vendor:a", maker: "Acme", baseUrl: "https://api.localtest.me:4455/v1", model: "fake-model" }],
      probes: { readLatest: async () => [], record: async () => undefined },
      probeFreshnessMs: r.probeFreshnessMs,
      probeTimeoutMs: r.probeTimeoutMs,
      fetchImplementation: fetch,
      clock: () => new Date()
    } as never);
    return "CONSTRUCTED";
  } catch (error) { return message(error); }
}

switch (request.op) {
  case "s01_case": out({ printed: s01Case(request) }); break;
  case "s02_chain": out({ outcome: s02Chain(request) }); break;
  case "s02_layout": out(s02Layout(request)); break;
  case "n1_resolver": out({ outcome: n1Resolver(request) }); break;
  default: out({ error: `unknown op ${String(request.op)}` });
}
