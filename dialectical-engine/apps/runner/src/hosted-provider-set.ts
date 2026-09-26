import { createHash } from "node:crypto";
import {
  CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF,
  CONFIGURED_PROVIDER_SET_ROW_KEY,
  buildConfiguredProviderSetDeploymentRow,
  computeRegisterSnapshotSha256,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  resolveDeploymentMode
} from "@debateai/register";
import { BUILT_IN_PROVIDER_ADAPTERS, parseProviderDiscoveryTargets } from "@debateai/providers";
import type {
  RegisterPublicationPort,
  RegisterPublicationReceipt,
  RegisterPublicationRow,
  RegisterVersionText,
  VettedConfiguredProvider
} from "@debateai/register";

export const HOSTED_TARGETS_RUNNER_STDOUT_PREFIX = "PES_HOSTED_TARGETS_RUNNER_V1=" as const;
export const HOSTED_TARGETS_API_STDOUT_PREFIX = "PES_HOSTED_TARGETS_API_V1=" as const;
export const HOSTED_PROVIDER_SET_RECEIPT_STDOUT_PREFIX = "PES_HOSTED_PROVIDER_SET_RECEIPT_V1=" as const;
export const HOSTED_PROVIDER_SET_PUBLICATION_SOURCE_REF = "provider-env-selection/S01#hosted-provider-set:published" as const;
export const HOSTED_ROLE_ROW_KEYS = Object.freeze(["synthesizerRoleRef", "evaluatorRoleRef"] as const);

export type HostedRosterProvider = Readonly<{
  provider_ref: unknown;
  adapter_kind: unknown;
  maker: unknown;
  vetting: unknown;
  base_url: unknown;
  model: unknown;
  runner_authorization_file: unknown;
  api_authorization_file: unknown;
  input_price_micros_per_million: unknown;
  output_price_micros_per_million: unknown;
}>;
export type HostedRoster = Readonly<{ providers: readonly HostedRosterProvider[] }>;
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

const ROSTER_KEYS = [
  "provider_ref", "adapter_kind", "maker", "vetting", "base_url", "model",
  "runner_authorization_file", "api_authorization_file",
  "input_price_micros_per_million", "output_price_micros_per_million"
] as const;
const VETTING_KEYS = [
  "data_use_terms_reviewed_on", "retention_terms_reviewed_on", "named_in_privacy_notice"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function gateHostedRoster(text: string): HostedRoster {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new TypeError("PES_PUBLISH_ROSTER_INVALID:"); }
  if (!isRecord(parsed) || Object.keys(parsed).length !== 1
    || !Array.isArray(parsed.providers) || parsed.providers.length === 0) {
    throw new TypeError("PES_PUBLISH_ROSTER_INVALID:");
  }
  const seen = new Set<string | undefined>();
  for (const [index, element] of parsed.providers.entries()) {
    const suffix = isRecord(element) && typeof element.provider_ref === "string" ? element.provider_ref : index;
    const refuse = () => { throw new TypeError(`PES_PUBLISH_ROSTER_INVALID:${suffix}`); };
    if (!isRecord(element)) refuse();
    const provider = element as Record<string, unknown>;
    if (Object.keys(provider).length !== ROSTER_KEYS.length
      || !ROSTER_KEYS.every(key => Object.hasOwn(provider, key))) refuse();
    if (!BUILT_IN_PROVIDER_ADAPTERS.some(adapter => adapter.adapterKind === provider.adapter_kind)) refuse();
    if (!isRecord(provider.vetting)
      || !Object.keys(provider.vetting).every(key => (VETTING_KEYS as readonly string[]).includes(key))) refuse();
    const ref = JSON.stringify(provider.provider_ref);
    if (seen.has(ref)) refuse();
    seen.add(ref);
  }
  return parsed as HostedRoster;
}
export function hostedConfiguredProviders(roster: HostedRoster): VettedConfiguredProvider[] {
  return roster.providers.map(provider => {
    const source = provider.vetting as Record<string, unknown>;
    const vetting: Record<string, unknown> = {};
    for (const [from, to] of [
      ["data_use_terms_reviewed_on", "dataUseTermsReviewedOn"],
      ["retention_terms_reviewed_on", "retentionTermsReviewedOn"],
      ["named_in_privacy_notice", "namedInPrivacyNotice"]
    ] as const) {
      if (Object.hasOwn(source, from)) vetting[to] = source[from];
    }
    // The shipped builder checks content, including absent vetting members, at step (4).
    return {
      providerRef: provider.provider_ref,
      adapterKind: provider.adapter_kind,
      maker: provider.maker,
      vetting
    } as VettedConfiguredProvider;
  });
}
export function deriveHostedProviderTargets(roster: HostedRoster): Readonly<{ runner: string; api: string }> {
  const derive = (authorizationKey: "runner_authorization_file" | "api_authorization_file") =>
    JSON.stringify(roster.providers.map(provider => ({
      provider_ref: provider.provider_ref,
      base_url: provider.base_url,
      model: provider.model,
      authorization_file: provider[authorizationKey],
      input_price_micros_per_million: provider.input_price_micros_per_million,
      output_price_micros_per_million: provider.output_price_micros_per_million
    })));
  return { runner: derive("runner_authorization_file"), api: derive("api_authorization_file") };
}
export function hostedProviderSetPublicationId(baseRegisterVersion: RegisterVersionText, snapshotSha256: string): string {
  const bytes = createHash("sha256")
    .update(`debateai:hosted-provider-set:${baseRegisterVersion}:${snapshotSha256}`)
    .digest().subarray(0, 16);
  const octets = Uint8Array.from(bytes);
  octets[6] = (octets[6]! & 0x0f) | 0x40;
  octets[8] = (octets[8]! & 0x3f) | 0x80;
  const hex = Buffer.from(octets).toString("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}
export function sealedSourceRefOf(baseSourceRef: string): string {
  return baseSourceRef.endsWith(CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF)
    ? baseSourceRef.slice(0, -CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF.length)
    : baseSourceRef;
}
export function formatHostedProviderSetReceipt(receipt: Pick<RegisterPublicationReceipt, "registerVersion" | "rowCount" | "snapshotSha256">): string {
  return HOSTED_PROVIDER_SET_RECEIPT_STDOUT_PREFIX + JSON.stringify({
    registerVersion: receipt.registerVersion,
    rowCount: receipt.rowCount,
    snapshotSha256: receipt.snapshotSha256
  });
}
export function hostedDeploymentModeOrRefuse(configured: string | undefined, nodeEnv: string | undefined): "hosted" {
  const mode = resolveDeploymentMode(configured, nodeEnv);
  if (mode !== "hosted") throw new TypeError(`PES_PUBLISH_SET_NOT_HOSTED:${mode}`);
  return mode;
}
export function assertHostedRoleProvidersKept(baseRows: readonly RegisterPublicationRow[], roster: HostedRoster): void {
  for (const key of HOSTED_ROLE_ROW_KEYS) {
    const row = baseRows.find(candidate => candidate.rowKey === key);
    if (!row) continue;
    const value: unknown = JSON.parse(row.valueJsonText);
    if (!isRecord(value) || typeof value.providerRef !== "string"
      || !roster.providers.some(provider => provider.provider_ref === value.providerRef)) {
      throw new TypeError(`PES_PUBLISH_ROLE_PROVIDER_DROPPED:${key}`);
    }
  }
}
export async function publishHostedProviderSet(inputs: HostedPublishInputs, ports: HostedPublishPorts): Promise<readonly [string, string, string]> {
  hostedDeploymentModeOrRefuse(inputs.deploymentMode, inputs.nodeEnv);
  if (!inputs.rosterPath?.startsWith("/")) throw new TypeError("PES_PUBLISH_ROSTER_INVALID:");
  let rosterText: string;
  try { rosterText = await ports.readRosterText(inputs.rosterPath); }
  catch { throw new TypeError("PES_PUBLISH_ROSTER_INVALID:"); }
  const roster = gateHostedRoster(rosterText);
  const version = parseRegisterVersionText(inputs.registerVersion);
  const { readVersionRows, port } = await ports.openRegister();
  const baseRows = await readVersionRows(version);
  const baseRow = baseRows.find(row => row.rowKey === CONFIGURED_PROVIDER_SET_ROW_KEY);
  if (!baseRow) throw new TypeError(`PES_PUBLISH_BASE_ROW_ABSENT:${version}`);
  const baseValue = JSON.parse(baseRow.valueJsonText) as { requiredDistinctMakers: number };
  const built = buildConfiguredProviderSetDeploymentRow({
    requiredDistinctMakers: baseValue.requiredDistinctMakers,
    providers: hostedConfiguredProviders(roster)
  }, sealedSourceRefOf(baseRow.sourceRef));
  const targets = deriveHostedProviderTargets(roster);
  try {
    const providers = built.value.providers as VettedConfiguredProvider[];
    parseProviderDiscoveryTargets(targets.runner, providers);
    parseProviderDiscoveryTargets(targets.api, providers);
  } catch (error) {
    throw new TypeError(`PES_PUBLISH_SET_TARGETS_REJECTED:${error instanceof Error ? error.message : String(error)}`);
  }
  assertHostedRoleProvidersKept(baseRows, roster);
  const rows = baseRows.map(row => row.rowKey === CONFIGURED_PROVIDER_SET_ROW_KEY ? {
    rowKey: built.rowKey,
    valueJsonText: parseCanonicalRegisterJson(Buffer.from(JSON.stringify(built.value), "utf8")),
    sourceRef: built.sourceRef
  } : row);
  const receipt = await port.publishGeneral({
    publicationId: hostedProviderSetPublicationId(version, computeRegisterSnapshotSha256(rows)),
    baseRegisterVersion: version,
    rows,
    sourceRef: HOSTED_PROVIDER_SET_PUBLICATION_SOURCE_REF,
    deployment: "hosted"
  });
  return [HOSTED_TARGETS_RUNNER_STDOUT_PREFIX + targets.runner,
    HOSTED_TARGETS_API_STDOUT_PREFIX + targets.api, formatHostedProviderSetReceipt(receipt)];
}
