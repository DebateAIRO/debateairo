import { lookup } from "node:dns";
import type { LookupAddress } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { chmod, lstat, mkdir, mkdtemp, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { readCustodyAuthorizationHeader } from "@debateai/crypto";
import { resolveDeploymentMode } from "@debateai/register";
import type { ProviderProbeRecord } from "@debateai/db";
import {
  parseProviderDiscoveryTargets,
  assertDeploymentProviderTargets,
  assertPricedProviderTargets,
  resolveProviderTargetCredentials,
  createProviderDiscoveryResolver,
  type ProviderDiscoveryProbeStore
} from "../apps/api/src/provider-discovery.js";
import {
  FAKE_VENDOR_AUTHORIZATION,
  FAKE_VENDOR_HOST,
  FAKE_VENDOR_PORT_CANDIDATES,
  isPortListening,
  pickFreePort,
  createFixtureCertificate,
  startFakeVendor,
  createTrustingFetch,
  verifySeamHandshake,
  type FakeVendor
} from "./pes-s02-fake-vendor.js";

export const PES_S02_CONFIGURED_PROVIDERS = Object.freeze([Object.freeze({ providerRef: "vendor:a", maker: "Acme" })]);

export type RefusalCase = Readonly<{
  id: string;
  target: string;
  expected: string;
  stage: "parse" | "deployment" | "priced" | "credentials";
}>;

export const PES_S02_REFUSAL_CASES: readonly RefusalCase[] = Object.freeze([
  Object.freeze({
    id: "refused-loopback",
    target: "{\"provider_ref\":\"vendor:a\",\"base_url\":\"https://127.0.0.1:4455/v1\",\"model\":\"fake-model\",\"authorization_file\":\"/SCRATCH/custody.d/vendor.header\",\"input_price_micros_per_million\":1000,\"output_price_micros_per_million\":2000}",
    expected: "PROVIDER_TARGET_LOOPBACK_REFUSED:vendor:a",
    stage: "deployment",
  }),
  Object.freeze({
    id: "refused-inline",
    target: "{\"provider_ref\":\"vendor:a\",\"base_url\":\"https://api.localtest.me:4455/v1\",\"model\":\"fake-model\",\"authorization_header\":\"Bearer inline-not-provisioned\",\"input_price_micros_per_million\":1000,\"output_price_micros_per_million\":2000}",
    expected: "PROVIDER_INLINE_CREDENTIAL_REFUSED:vendor:a",
    stage: "deployment",
  }),
  Object.freeze({
    id: "refused-conflict",
    target: "{\"provider_ref\":\"vendor:a\",\"base_url\":\"https://api.localtest.me:4455/v1\",\"model\":\"fake-model\",\"authorization_file\":\"/SCRATCH/custody.d/vendor.header\",\"authorization_header\":\"Bearer inline-not-provisioned\",\"input_price_micros_per_million\":1000,\"output_price_micros_per_million\":2000}",
    expected: "PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT",
    stage: "parse",
  }),
  Object.freeze({
    id: "refused-absent",
    target: "{\"provider_ref\":\"vendor:a\",\"base_url\":\"https://api.localtest.me:4455/v1\",\"model\":\"fake-model\",\"authorization_file\":\"/SCRATCH/custody.d/absent.header\",\"input_price_micros_per_million\":1000,\"output_price_micros_per_million\":2000}",
    expected: "PROVIDER_AUTHORIZATION_FILE_ABSENT:vendor:a",
    stage: "credentials",
  }),
  Object.freeze({
    id: "refused-price",
    target: "{\"provider_ref\":\"vendor:a\",\"base_url\":\"https://api.localtest.me:4455/v1\",\"model\":\"fake-model\",\"authorization_file\":\"/SCRATCH/custody.d/vendor.header\"}",
    expected: "PROVIDER_TARGET_PRICE_REQUIRED:vendor:a",
    stage: "priced",
  }),
]);

export type HostedAcceptanceDeps = {
  emit(line: string): void;
  lookup: LookupFunction;
  opensslExecutable: string;
  portCandidates: readonly number[];
  isPortListening(port: number): boolean;
  credentialLiteral: string;
  refusalCases: readonly RefusalCase[];
};

export type HostedAcceptanceResult = {
  outcome: "PASS" | "FAIL" | "UNVERIFIED";
  lines: readonly string[];
  scratchRoot: string | null;
  port: number | null;
  refusals: readonly Readonly<{ id: string; message: string; stage: string }>[];
};

export function violatesStdoutLaw(
  line: string,
  forbidden: Readonly<{ tokens: readonly string[]; paths: readonly string[] }>
): boolean {
  return forbidden.tokens.some((token) => line.includes(token))
    || /Bearer \S/u.test(line)
    || forbidden.paths.some((path) => line.includes(path));
}

function resolveAll(lookup: LookupFunction, hostname: string): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) => {
    lookup(hostname, { all: true }, (error, answer) => {
      if (error) reject(error);
      else resolve(answer as LookupAddress[]);
    });
  });
}

class AcceptanceStop extends Error {
  constructor(readonly outcome: "FAIL" | "UNVERIFIED", readonly detail: string) {
    super(detail);
  }
}

function stop(outcome: "FAIL" | "UNVERIFIED", detail: string): never {
  throw new AcceptanceStop(outcome, detail);
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== "string") throw error;
  return code;
}

export async function runHostedAcceptance(
  overrides: Partial<HostedAcceptanceDeps> = {}
): Promise<HostedAcceptanceResult> {
  const deps: HostedAcceptanceDeps = {
    emit: () => undefined,
    lookup,
    opensslExecutable: "/usr/bin/openssl",
    portCandidates: FAKE_VENDOR_PORT_CANDIDATES,
    isPortListening,
    credentialLiteral: FAKE_VENDOR_AUTHORIZATION,
    refusalCases: PES_S02_REFUSAL_CASES,
    ...overrides
  };
  const lines: string[] = [];
  const refusals: { id: string; message: string; stage: string }[] = [];
  const forbidden = {
    tokens: [FAKE_VENDOR_AUTHORIZATION.slice("Bearer ".length), deps.credentialLiteral.slice("Bearer ".length)],
    paths: [] as string[]
  };
  let scratchRoot: string | null = null;
  let port: number | null = null;
  let vendor: FakeVendor | undefined;
  let trusting: ReturnType<typeof createTrustingFetch> | undefined;
  let failure: AcceptanceStop | undefined;
  const emit = (line: string) => {
    if (violatesStdoutLaw(line, forbidden)) stop("FAIL", "stdout-law");
    deps.emit(line);
    lines.push(line);
  };
  const rememberFailure = (error: unknown) => {
    failure ??= error instanceof AcceptanceStop ? error : new AcceptanceStop("FAIL", "internal");
  };
  try {
    scratchRoot = await mkdtemp(join(tmpdir(), "pes-s02-"));
    if (!basename(scratchRoot).startsWith("pes-s02-") || basename(scratchRoot).includes("custody")
      || !/^[A-Za-z0-9/._-]+$/u.test(scratchRoot)) stop("FAIL", "scratch-root");
    const custody = join(scratchRoot, "custody.d");
    forbidden.paths.push(custody, join(await realpath(scratchRoot), "custody.d"));
    emit(`PES-S02 SCRATCH-DIR ${scratchRoot}`);

    const tlsDirectory = join(scratchRoot, "tls");
    await mkdir(tlsDirectory, { mode: 0o700 });
    let certificate: ReturnType<typeof createFixtureCertificate>;
    try {
      certificate = createFixtureCertificate(tlsDirectory, deps.opensslExecutable);
    } catch (error) {
      if (error instanceof Error && error.message === "PES_S02_OPENSSL_UNAVAILABLE") {
        stop("UNVERIFIED", "tls-material openssl-unavailable");
      }
      if (error instanceof Error && /^PES_S02_OPENSSL_RC_\d+$/u.test(error.message)) {
        stop("UNVERIFIED", `tls-material openssl-rc-${error.message.slice("PES_S02_OPENSSL_RC_".length)}`);
      }
      throw error;
    }
    let addresses: LookupAddress[];
    try {
      addresses = await resolveAll(deps.lookup, FAKE_VENDOR_HOST);
    } catch (error) {
      stop("UNVERIFIED", `dns ${errorCode(error)}`);
    }
    if (addresses.some(({ address }) => address !== "::1" && !(isIP(address) === 4 && address.startsWith("127.")))) {
      stop("UNVERIFIED", "dns non-loopback");
    }
    if (!addresses.some(({ address }) => address === "127.0.0.1")) stop("UNVERIFIED", "dns no-ipv4-loopback");
    emit(`PES-S02 DNS ${FAKE_VENDOR_HOST} ${addresses.map((a) => a.address).join(",")}`);

    let evidence: string;
    try {
      ({ port, evidence } = pickFreePort(deps.portCandidates, deps.isPortListening));
    } catch (error) {
      if (error instanceof Error && error.message === "PES_S02_LSOF_UNAVAILABLE") stop("UNVERIFIED", "port lsof-unavailable");
      if (error instanceof Error && error.message === "PES_S02_NO_FREE_PORT") stop("UNVERIFIED", "port none-free");
      throw error;
    }
    emit(`PES-S02 PORT-FREE ${port} ${evidence}`);
    try {
      vendor = await startFakeVendor({ port, ...certificate });
    } catch (error) {
      if (error instanceof Error && error.message === "PES_S02_PORT_BIND_RACED") stop("UNVERIFIED", "port bind-raced");
      throw error;
    }
    emit(`PES-S02 FAKE-VENDOR ${vendor.baseUrl}`);
    try {
      await verifySeamHandshake({ port, caPem: certificate.certPem, lookup: deps.lookup });
    } catch (error) {
      if (!(error instanceof Error) || !/^[A-Z0-9_]+$/u.test(error.message)) throw error;
      stop("UNVERIFIED", `trust-seam handshake-${error.message}`);
    }
    let defaultFetchError: unknown;
    try {
      await fetch(`https://127.0.0.1:${port}/v1/chat/completions`, { method: "POST" });
    } catch (error) {
      defaultFetchError = error;
    }
    if (defaultFetchError === undefined) stop("UNVERIFIED", "trust-seam default-fetch-accepted");
    const defaultCode = errorCode((defaultFetchError as Error).cause);
    if (defaultCode !== "DEPTH_ZERO_SELF_SIGNED_CERT") stop("UNVERIFIED", `trust-seam default-fetch-${defaultCode}`);
    trusting = createTrustingFetch(certificate.certPem, deps.lookup);
    emit("PES-S02 TRUST seam-handshake=authorized default-fetch=DEPTH_ZERO_SELF_SIGNED_CERT");

    await mkdir(custody, { mode: 0o700 });
    await chmod(custody, 0o700);
    const credentialPath = join(custody, "vendor.header");
    await writeFile(credentialPath, deps.credentialLiteral + "\n", { mode: 0o600 });
    await chmod(credentialPath, 0o600);
    const directory = await lstat(custody);
    const credential = await lstat(credentialPath);
    const entries = await readdir(custody);
    if ((directory.mode & 0o777) !== 0o700 || directory.uid !== process.getuid!()
      || (credential.mode & 0o777) !== 0o600 || credential.nlink !== 1 || credential.isSymbolicLink()
      || entries.length !== 1 || entries[0] !== "vendor.header") stop("FAIL", "custody-layout");

    const mode = resolveDeploymentMode("hosted", "production");
    let stage: RefusalCase["stage"] = "parse";
    const chain = (source: string) => {
      stage = "parse";
      const declared = parseProviderDiscoveryTargets(source, PES_S02_CONFIGURED_PROVIDERS);
      stage = "deployment";
      assertDeploymentProviderTargets(declared, { mode, nodeEnv: "production" });
      stage = "priced";
      assertPricedProviderTargets(declared, mode);
      stage = "credentials";
      return resolveProviderTargetCredentials(declared, readCustodyAuthorizationHeader);
    };
    for (const refusal of deps.refusalCases) {
      let caught: unknown;
      try {
        chain(`[${refusal.target.replaceAll("/SCRATCH", scratchRoot)}]`);
      } catch (error) {
        caught = error;
      }
      if (!(caught instanceof Error) || caught.message !== refusal.expected || stage !== refusal.stage) stop("FAIL", refusal.id);
      refusals.push({ id: refusal.id, message: caught.message, stage });
      emit(`PES-S02 REFUSED ${caught.message}`);
    }
    try {
      const targets = chain(JSON.stringify([{
        provider_ref: "vendor:a",
        base_url: `https://api.localtest.me:${port}/v1`,
        model: "fake-model",
        authorization_file: credentialPath,
        input_price_micros_per_million: 1000,
        output_price_micros_per_million: 2000
      }]));
      const recorded: ProviderProbeRecord[] = [];
      const probes: ProviderDiscoveryProbeStore = {
        readLatest: async (refs) => recorded.filter((r) => refs.includes(r.providerRef)),
        record: async (o) => { recorded.push(o); }
      };
      const resolve = createProviderDiscoveryResolver({
        configuredProviders: PES_S02_CONFIGURED_PROVIDERS, targets, probes,
        probeFreshnessMs: 600000, probeTimeoutMs: 5000,
        fetchImplementation: trusting.fetch, clock: () => new Date()
      });
      const members = await resolve();
      if (members.length !== 1 || members[0]?.provider_ref !== "vendor:a" || members[0]?.maker !== "Acme") stop("FAIL", "admitted");
    } catch {
      stop("FAIL", "admitted");
    }
    emit("PES-S02 ADMITTED vendor:a");
    const counts = vendor.counts();
    emit(`PES-S02 VENDOR-REQUESTS ${counts.matched} matched ${counts.rejected} rejected`);
    if (counts.matched !== 1 || counts.rejected !== 0) stop("FAIL", "vendor-requests");
  } catch (error) {
    rememberFailure(error);
  } finally {
    try { trusting?.destroy(); } catch (error) { rememberFailure(error); }
    try { await vendor?.close(); } catch (error) { rememberFailure(error); }
    try {
      if (scratchRoot !== null) await rm(scratchRoot, { recursive: true, force: true });
    } catch (error) { rememberFailure(error); }
  }
  if (scratchRoot !== null) {
    try {
      await stat(scratchRoot);
      failure ??= new AcceptanceStop("FAIL", "scratch-removed");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") failure ??= new AcceptanceStop("FAIL", "scratch-removed");
    }
  }
  try {
    emit(failure ? `PES-S02-ACCEPT: ${failure.outcome} ${failure.detail}` : "PES-S02-ACCEPT: PASS");
  } catch (error) {
    failure = error instanceof AcceptanceStop ? error : new AcceptanceStop("FAIL", "internal");
    try { emit(`PES-S02-ACCEPT: ${failure.outcome} ${failure.detail}`); } catch { /* An unusable emitter cannot be recovered here. */ }
  }
  return { outcome: failure?.outcome ?? "PASS", lines, scratchRoot, port, refusals };
}
