// ARCH-FIX-PES-S01-p2 PROPOSED CODE (Revision 2: + S01-26, the role rows of SPEC-v4 R1.14) — not product code.
// The module PLAN steps S01-07 … S01-14 and S01-26 ask BUILD to write at
// apps/runner/src/hosted-provider-set.ts. Kept here only so `tsc` can check the plan's code blocks.
import { createHash } from "node:crypto";
import { BUILT_IN_PROVIDER_ADAPTERS, parseProviderDiscoveryTargets } from "@debateai/providers";
import {
  CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF,
  CONFIGURED_PROVIDER_SET_ROW_KEY,
  buildConfiguredProviderSetDeploymentRow,
  computeRegisterSnapshotSha256,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  resolveDeploymentMode,
  type RegisterPublicationPort,
  type RegisterPublicationReceipt,
  type RegisterPublicationRow,
  type RegisterVersionText,
  type VettedConfiguredProvider
} from "@debateai/register";

// S01-07 — this slice's own literals (SPEC-v3 R1.8, R1.2 `sourceRef`).
export const HOSTED_TARGETS_RUNNER_STDOUT_PREFIX = "PES_HOSTED_TARGETS_RUNNER_V1=" as const;
export const HOSTED_TARGETS_API_STDOUT_PREFIX = "PES_HOSTED_TARGETS_API_V1=" as const;
export const HOSTED_PROVIDER_SET_RECEIPT_STDOUT_PREFIX = "PES_HOSTED_PROVIDER_SET_RECEIPT_V1=" as const;
export const HOSTED_PROVIDER_SET_PUBLICATION_SOURCE_REF =
  "provider-env-selection/S01#hosted-provider-set:published" as const;

// S01-08 — the roster gate (SPEC-v3 R1.2 "The roster gate").
const ROSTER_KEYS = [
  "provider_ref", "adapter_kind", "maker", "vetting", "base_url", "model",
  "runner_authorization_file", "api_authorization_file",
  "input_price_micros_per_million", "output_price_micros_per_million"
] as const;
const VETTING_NAMES = Object.freeze({
  data_use_terms_reviewed_on: "dataUseTermsReviewedOn",
  retention_terms_reviewed_on: "retentionTermsReviewedOn",
  named_in_privacy_notice: "namedInPrivacyNotice"
});

export type HostedRosterProvider = Readonly<Record<(typeof ROSTER_KEYS)[number], unknown>>;
export type HostedRoster = Readonly<{ providers: readonly HostedRosterProvider[] }>;

function rosterRefusal(suffix: string): TypeError {
  return new TypeError(`PES_PUBLISH_ROSTER_INVALID:${suffix}`);
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function gateHostedRoster(text: string): HostedRoster {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    // Never the parser's message: V8 quotes the source text around the error (probe p1).
    throw rosterRefusal("");
  }
  if (!isPlainObject(decoded) || Object.keys(decoded).length !== 1) throw rosterRefusal("");
  const providers = decoded.providers;
  if (!Array.isArray(providers) || providers.length < 1) throw rosterRefusal("");
  const seen = new Set<string>();
  providers.forEach((element: unknown, index: number) => {
    const named = isPlainObject(element) && typeof element.provider_ref === "string"
      ? element.provider_ref
      : String(index);
    if (!isPlainObject(element)) throw rosterRefusal(named);
    const keys = Object.keys(element);
    if (keys.length !== ROSTER_KEYS.length || !ROSTER_KEYS.every((key) => Object.hasOwn(element, key))) {
      throw rosterRefusal(named);
    }
    if (!BUILT_IN_PROVIDER_ADAPTERS.some((adapter) => adapter.adapterKind === element.adapter_kind)) {
      throw rosterRefusal(named);
    }
    const vetting = element.vetting;
    if (!isPlainObject(vetting) || !Object.keys(vetting).every((key) => Object.hasOwn(VETTING_NAMES, key))) {
      throw rosterRefusal(named);
    }
    const identity = JSON.stringify(element.provider_ref);
    if (seen.has(identity)) throw rosterRefusal(named);
    seen.add(identity);
  });
  return decoded as HostedRoster;
}

// S01-09 — R1.1: the hosted configured-provider set, as a value of type VettedConfiguredProvider[].
export function hostedConfiguredProviders(roster: HostedRoster): VettedConfiguredProvider[] {
  return roster.providers.map((element) => {
    const vetting: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(element.vetting as Readonly<Record<string, unknown>>)) {
      vetting[VETTING_NAMES[key as keyof typeof VETTING_NAMES]] = value;
    }
    return {
      providerRef: element.provider_ref,
      adapterKind: element.adapter_kind,
      maker: element.maker,
      vetting
    } as VettedConfiguredProvider;
  });
}

// S01-10 — R1.2 "The command also DERIVES … the two PROVIDER_DISCOVERY_TARGETS_JSON values".
export function deriveHostedProviderTargets(roster: HostedRoster): Readonly<{ runner: string; api: string }> {
  const targets = (file: "runner_authorization_file" | "api_authorization_file"): string =>
    JSON.stringify(roster.providers.map((element) => ({
      provider_ref: element.provider_ref,
      base_url: element.base_url,
      model: element.model,
      authorization_file: element[file],
      input_price_micros_per_million: element.input_price_micros_per_million,
      output_price_micros_per_million: element.output_price_micros_per_million
    })));
  return Object.freeze({ runner: targets("runner_authorization_file"), api: targets("api_authorization_file") });
}

// S01-11 — R1.2 `publicationId` (the construction of dev-deployment-register.ts:784-799, hosted namespace)
// and `sealedSourceRef` (one trailing deployment suffix removed).
export function hostedProviderSetPublicationId(
  baseRegisterVersion: RegisterVersionText,
  snapshotSha256: string
): string {
  const octets = Uint8Array.from(createHash("sha256")
    .update(`debateai:hosted-provider-set:${baseRegisterVersion}:${snapshotSha256}`)
    .digest()
    .subarray(0, 16));
  octets[6] = (octets[6]! & 0x0f) | 0x40;
  octets[8] = (octets[8]! & 0x3f) | 0x80;
  const hex = Buffer.from(octets).toString("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export function sealedSourceRefOf(baseSourceRef: string): string {
  return baseSourceRef.endsWith(CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF)
    ? baseSourceRef.slice(0, baseSourceRef.length - CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF.length)
    : baseSourceRef;
}

// S01-12 — R1.8 the machine receipt line.
export function formatHostedProviderSetReceipt(
  receipt: Pick<RegisterPublicationReceipt, "registerVersion" | "rowCount" | "snapshotSha256">
): string {
  return `${HOSTED_PROVIDER_SET_RECEIPT_STDOUT_PREFIX}${JSON.stringify({
    registerVersion: receipt.registerVersion,
    rowCount: receipt.rowCount,
    snapshotSha256: receipt.snapshotSha256
  })}`;
}

// S01-13 — R1.5 the mode.
export function hostedDeploymentModeOrRefuse(
  configured: string | undefined,
  nodeEnv: string | undefined
): "hosted" {
  const mode = resolveDeploymentMode(configured, nodeEnv);
  if (mode !== "hosted") throw new TypeError(`PES_PUBLISH_SET_NOT_HOSTED:${mode}`);
  return mode;
}

// S01-26 — SPEC-v4 R1.14 (V-10): the role rows of the base register. An absent row is not checked; a present
// row passes only when its value is a JSON object whose `providerRef` is a string equal to a roster
// `provider_ref`; the first present row that does not pass refuses by its key.
export const HOSTED_ROLE_ROW_KEYS = Object.freeze(["synthesizerRoleRef", "evaluatorRoleRef"] as const);

export function assertHostedRoleProvidersKept(
  baseRows: readonly RegisterPublicationRow[],
  roster: HostedRoster
): void {
  for (const rowKey of HOSTED_ROLE_ROW_KEYS) {
    const row = baseRows.find((candidate) => candidate.rowKey === rowKey);
    if (row === undefined) continue; throw new TypeError(`PES_PUBLISH_ROLE_PROVIDER_DROPPED:${rowKey}`);
    const value: unknown = JSON.parse(row.valueJsonText);
    const providerRef = isPlainObject(value) ? value.providerRef : undefined;
    if (typeof providerRef !== "string"
      || !roster.providers.some((element) => element.provider_ref === providerRef)) {
      throw new TypeError(`PES_PUBLISH_ROLE_PROVIDER_DROPPED:${rowKey}`);
    }
  }
}

// S01-14 — R1.3 the seven checks in order (SPEC-v4), R1.4 the hosted publication.
export type HostedPublishInputs = Readonly<{
  deploymentMode: string | undefined;
  nodeEnv: string | undefined;
  registerVersion: string | undefined;
  rosterPath: string | undefined;
}>;

export type HostedRegisterAccess = Readonly<{
  readVersionRows(version: RegisterVersionText): Promise<readonly RegisterPublicationRow[]>;
  port: Pick<RegisterPublicationPort, "publishGeneral">;
}>;

export type HostedPublishPorts = Readonly<{
  readRosterText(path: string): Promise<string>;
  openRegister(): Promise<HostedRegisterAccess>;
}>;

export async function publishHostedProviderSet(
  inputs: HostedPublishInputs,
  ports: HostedPublishPorts
): Promise<readonly [string, string, string]> {
  // (1) the mode
  hostedDeploymentModeOrRefuse(inputs.deploymentMode, inputs.nodeEnv);
  // (2) the roster gate
  const rosterPath = inputs.rosterPath;
  if (rosterPath === undefined || !rosterPath.startsWith("/")) throw rosterRefusal("");
  let rosterText: string;
  try {
    rosterText = await ports.readRosterText(rosterPath);
  } catch {
    throw rosterRefusal("");
  }
  const roster = gateHostedRoster(rosterText);
  // (3) the base row
  const baseRegisterVersion = parseRegisterVersionText(inputs.registerVersion);
  const register = await ports.openRegister();
  const baseRows = await register.readVersionRows(baseRegisterVersion);
  const baseRow = baseRows.find((row) => row.rowKey === CONFIGURED_PROVIDER_SET_ROW_KEY);
  if (baseRow === undefined) throw new TypeError(`PES_PUBLISH_BASE_ROW_ABSENT:${baseRegisterVersion}`);
  const baseValue = JSON.parse(baseRow.valueJsonText) as Readonly<{ requiredDistinctMakers?: unknown }>;
  // (4) the build — the shipped builder refuses an unvetted vendor
  const built = buildConfiguredProviderSetDeploymentRow(
    {
      requiredDistinctMakers: baseValue.requiredDistinctMakers as number,
      providers: hostedConfiguredProviders(roster)
    },
    sealedSourceRefOf(baseRow.sourceRef)
  );
  // (5) the self-check — both derived values through the SHIPPED parser, against the built row's providers
  const targets = deriveHostedProviderTargets(roster);
  const configured = (built.value as Readonly<{ providers: readonly VettedConfiguredProvider[] }>).providers;
  for (const text of [targets.runner, targets.api]) {
    try {
      parseProviderDiscoveryTargets(text, configured);
    } catch (error) {
      throw new TypeError(
        `PES_PUBLISH_SET_TARGETS_REJECTED:${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  // (6) the role rows — SPEC-v4 R1.14
  assertHostedRoleProvidersKept(baseRows, roster);
  // (7) the publication — every base row carried forward, the configuredProviderSet row replaced
  const rows: readonly RegisterPublicationRow[] = baseRows.map((row) => row.rowKey === CONFIGURED_PROVIDER_SET_ROW_KEY
    ? Object.freeze({
        rowKey: built.rowKey,
        valueJsonText: parseCanonicalRegisterJson(Buffer.from(JSON.stringify(built.value), "utf8")),
        sourceRef: built.sourceRef
      })
    : row);
  const snapshotSha256 = computeRegisterSnapshotSha256(rows);
  const receipt = await register.port.publishGeneral({
    publicationId: hostedProviderSetPublicationId(baseRegisterVersion, snapshotSha256),
    baseRegisterVersion,
    rows,
    sourceRef: HOSTED_PROVIDER_SET_PUBLICATION_SOURCE_REF,
    deployment: "hosted"
  });
  return [
    `${HOSTED_TARGETS_RUNNER_STDOUT_PREFIX}${targets.runner}`,
    `${HOSTED_TARGETS_API_STDOUT_PREFIX}${targets.api}`,
    formatHostedProviderSetReceipt(receipt)
  ] as const;
}
