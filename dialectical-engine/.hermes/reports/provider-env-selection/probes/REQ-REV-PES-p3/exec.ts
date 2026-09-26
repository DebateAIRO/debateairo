// REQ-REV-PES-p3 independent execution. Runs the lane's shipped functions.
// Writes nothing in the lane. Opens no listener and no database. Holds no real key.
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-base/dialectical-engine";
const providers = await import(`${LANE}/packages/providers/src/index.js`);
const register = await import(`${LANE}/packages/register/src/configured-provider-set.js`);
const publication = await import(`${LANE}/packages/register/src/register-publication.js`);
const runtime = await import(`${LANE}/packages/register/src/runtime-environment.js`);
const crypto = await import(`${LANE}/packages/crypto/src/index.js`);
const discovery = await import(`${LANE}/apps/api/src/provider-discovery.js`);

const message = (error: unknown) => {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return code === undefined ? error.message : `${error.message} code=${String(code)}`;
  }
  return String(error);
};

const E = {
  provider_ref: "vendor:a",
  adapter_kind: "openai-compatible-http",
  maker: "Acme",
  vetting: {
    data_use_terms_reviewed_on: "2026-09-01",
    retention_terms_reviewed_on: "2026-09-01",
    named_in_privacy_notice: true
  },
  base_url: "https://api.acme.example/v1",
  model: "acme-large",
  runner_authorization_file: "/etc/debateai/runner/providers/acme.header",
  api_authorization_file: "/etc/debateai/api/providers/acme.header",
  input_price_micros_per_million: 1000,
  output_price_micros_per_million: 2000
};

function element(change?: (row: typeof E) => void) {
  const copy = structuredClone(E);
  change?.(copy);
  return copy;
}

function builtFrom(rows: Array<typeof E>, sourceRef: string) {
  return register.buildConfiguredProviderSetDeploymentRow({
    requiredDistinctMakers: 1,
    providers: rows.map((row) => ({
      providerRef: row.provider_ref,
      adapterKind: row.adapter_kind,
      maker: row.maker,
      vetting: {
        dataUseTermsReviewedOn: row.vetting.data_use_terms_reviewed_on,
        retentionTermsReviewedOn: row.vetting.retention_terms_reviewed_on,
        namedInPrivacyNotice: row.vetting.named_in_privacy_notice
      }
    }))
  }, sourceRef);
}

function targetsJson(rows: Array<typeof E>, fileKey: "runner_authorization_file" | "api_authorization_file") {
  return JSON.stringify(rows.map((row) => ({
    provider_ref: row.provider_ref,
    base_url: row.base_url,
    model: row.model,
    authorization_file: row[fileKey],
    input_price_micros_per_million: row.input_price_micros_per_million,
    output_price_micros_per_million: row.output_price_micros_per_million
  })));
}

function parseBoth(rows: Array<typeof E>, providersArg: readonly { providerRef: string; maker: string }[]) {
  for (const key of ["runner_authorization_file", "api_authorization_file"] as const) {
    providers.parseProviderDiscoveryTargets(targetsJson(rows, key), providersArg);
  }
}

const out: Record<string, unknown> = {};

out.modeLocal = messageOf(() => runtime.resolveDeploymentMode("local", undefined));
out.modeHosted = messageOf(() => runtime.resolveDeploymentMode("hosted", undefined));
out.modeBad = messageOf(() => runtime.resolveDeploymentMode("nope", undefined));
out.modeUnsetProd = messageOf(() => runtime.resolveDeploymentMode(undefined, "production"));

const sealedSource = "DEV-01-local-auth-topology.md#ordered-bootstrap:DEV-05";
out.suffixLen = register.CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF.length;
out.builtSourceLen = (sealedSource + register.CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF).length;
out.suffixAlreadyPresent = sealedSource.endsWith(register.CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF);

out.published = messageOf(() => {
  const row = builtFrom([element()], sealedSource);
  parseBoth([element()], row.value.providers as { providerRef: string; maker: string }[]);
  return `PUBLISHABLE setVersion=${String((row.value as { setVersion?: unknown }).setVersion)} sourceRefLen=${row.sourceRef.length}`;
});

out.unvetted = messageOf(() => {
  const row = element((copy) => { copy.vetting.named_in_privacy_notice = false; });
  builtFrom([row], sealedSource);
  return "NO_THROW";
});

out.targetsRejected = messageOf(() => {
  const row = element((copy) => { copy.base_url = "https://api.acme.example/v2"; });
  const built = builtFrom([row], sealedSource);
  parseBoth([row], built.value.providers as { providerRef: string; maker: string }[]);
  return "NO_THROW";
});

out.duplicateBuilder = messageOf(() => {
  builtFrom([element(), element()], sealedSource);
  return "NO_THROW";
});

out.duplicateParser = messageOf(() => {
  const rows = [element(), element()];
  providers.parseProviderDiscoveryTargets(
    targetsJson(rows, "runner_authorization_file"),
    rows.map((row) => ({ providerRef: row.provider_ref, maker: row.maker }))
  );
  return "NO_THROW";
});

out.httpLoopback = chain({
  provider_ref: "vendor:a",
  base_url: "http://127.0.0.1:4455/v1",
  model: "fake-model",
  authorization_file: "/etc/debateai/api/providers/acme.header",
  input_price_micros_per_million: 1000,
  output_price_micros_per_million: 2000
});

const fixtures: Record<string, Record<string, unknown>> = {
  "refused-loopback": {
    provider_ref: "vendor:a", base_url: "https://127.0.0.1:4455/v1", model: "fake-model",
    authorization_file: "/SCRATCH/custody.d/vendor.header",
    input_price_micros_per_million: 1000, output_price_micros_per_million: 2000
  },
  "refused-inline": {
    provider_ref: "vendor:a", base_url: "https://api.localtest.me:4455/v1", model: "fake-model",
    authorization_header: "Bearer inline-not-provisioned",
    input_price_micros_per_million: 1000, output_price_micros_per_million: 2000
  },
  "refused-conflict": {
    provider_ref: "vendor:a", base_url: "https://api.localtest.me:4455/v1", model: "fake-model",
    authorization_file: "/SCRATCH/custody.d/vendor.header",
    authorization_header: "Bearer inline-not-provisioned",
    input_price_micros_per_million: 1000, output_price_micros_per_million: 2000
  },
  "refused-absent": {
    provider_ref: "vendor:a", base_url: "https://api.localtest.me:4455/v1", model: "fake-model",
    authorization_file: "/SCRATCH/custody.d/absent.header",
    input_price_micros_per_million: 1000, output_price_micros_per_million: 2000
  },
  "refused-price": {
    provider_ref: "vendor:a", base_url: "https://api.localtest.me:4455/v1", model: "fake-model",
    authorization_file: "/SCRATCH/custody.d/vendor.header"
  }
};
out.s02 = Object.fromEntries(Object.entries(fixtures).map(([name, target]) => [name, chain(target)]));
out.localtestRefused = providers.isRefusedHostedProviderHost("api.localtest.me");
out.loopbackRefused = providers.isRefusedHostedProviderHost("127.0.0.1");

const scratch = mkdtempSync(join(tmpdir(), "pes-s02-"));
try {
  const file = join(scratch, "custody.d/vendor.header");
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  chmodSync(dirname(file), 0o700);
  writeFileSync(file, "Bearer pes-s02-fake-vendor-token\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  let reader = "READ_OK";
  try { crypto.readCustodyAuthorizationHeader(file); }
  catch (error) { reader = message(error); }
  const admitted = chain({
    provider_ref: "vendor:a",
    base_url: "https://api.localtest.me:4455/v1",
    model: "fake-model",
    authorization_file: file,
    input_price_micros_per_million: 1000,
    output_price_micros_per_million: 2000
  });
  const scratchLine = `PES-S02 SCRATCH-DIR ${scratch}`;
  const custody = dirname(file);
  out.layout = {
    reader,
    admitted,
    scratchLineContainsCustody: scratchLine.includes(custody),
    scratchLineContainsFile: scratchLine.includes(file),
    grepPattern: `${scratch}/custody.d`,
    grepHitsFile: file.startsWith(`${scratch}/custody.d`),
    grepHitsScratchLine: scratchLine.includes(`${scratch}/custody.d`),
    basename: scratch.split("/").at(-1)
  };
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

out.n1 = messageOf(() => {
  discovery.createProviderDiscoveryResolver({
    configuredProviders: [{ providerRef: "vendor:a", maker: "Acme" }],
    targets: [{
      providerRef: "vendor:a", maker: "Acme",
      baseUrl: "https://api.localtest.me:4455/v1", model: "fake-model"
    }],
    probes: { readLatest: async () => [], record: async () => undefined },
    probeFreshnessMs: 600000,
    probeTimeoutMs: 5000,
    fetchImplementation: fetch,
    clock: () => new Date()
  });
  return "CONSTRUCTED";
});
out.n1missing = messageOf(() => {
  discovery.createProviderDiscoveryResolver({
    configuredProviders: [{ providerRef: "vendor:a", maker: "Acme" }],
    targets: [{
      providerRef: "vendor:a", maker: "Acme",
      baseUrl: "https://api.localtest.me:4455/v1", model: "fake-model"
    }],
    probes: { readLatest: async () => [], record: async () => undefined },
    fetchImplementation: fetch,
    clock: () => new Date()
  } as never);
  return "CONSTRUCTED";
});

const seedPath = `${LANE}/tests/support/fixtures/register-development-v4.json`;
const seed = JSON.parse(await (await import("node:fs/promises")).readFile(seedPath, "utf8")) as Array<{
  rowKey: string; valueJsonText: string; sourceRef: string;
}>;
const canonicalProblems: string[] = [];
for (const row of seed) {
  try {
    const canonical = publication.parseCanonicalRegisterJson(Buffer.from(row.valueJsonText));
    if (canonical !== row.valueJsonText) canonicalProblems.push(`${row.rowKey}: file text is not canonical (${row.valueJsonText.length} -> ${canonical.length})`);
  } catch (error) {
    canonicalProblems.push(`${row.rowKey}: ${message(error)}`);
  }
}
out.seed = {
  rowCount: seed.length,
  roleRef: seed.filter((row) => row.rowKey.includes("RoleRef") || row.valueJsonText.includes("RoleRef")).length,
  canonicalProblems: canonicalProblems.slice(0, 8),
  canonicalProblemCount: canonicalProblems.length
};

console.log(JSON.stringify(out, null, 2));

function messageOf(fn: () => string): string {
  try { return fn(); }
  catch (error) { return message(error); }
}

function chain(target: Record<string, unknown>): string {
  const configured = [{ providerRef: String(target.provider_ref), maker: "Acme" }];
  try {
    const declared = providers.parseProviderDiscoveryTargets(JSON.stringify([target]), configured);
    providers.assertDeploymentProviderTargets(declared, { mode: "hosted", nodeEnv: undefined });
    providers.assertPricedProviderTargets(declared, "hosted");
    const resolved = providers.resolveProviderTargetCredentials(declared, crypto.readCustodyAuthorizationHeader);
    const header = resolved[0]?.authorizationHeader;
    return header === undefined ? "RESOLVED_WITHOUT_HEADER" : `RESOLVED headerEqualsLiteral=${header === "Bearer pes-s02-fake-vendor-token"}`;
  } catch (error) {
    return message(error);
  }
}
