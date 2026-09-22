/**
 * V-9(3) and V-9(4), ruled 2026-09-22 — the configured-providers register row.
 *
 * Vendors are CONFIGURATION, not code: one OpenAI-compatible adapter serves most
 * vendors, so adding one is a target entry in `PROVIDER_DISCOVERY_TARGETS_JSON`,
 * a credential file under the custody contract, and one more entry in THIS row.
 *
 * The row is superseded, never edited (constraint 5, the discipline
 * `AUTH_POLICY_DEPLOYMENT_PUBLICATION_ROWS` follows for V-14). Version 1 is the
 * sealed shape every deployment published before this ruling and it stays as
 * history. Version 2 is the superseding DEPLOYMENT shape: the same members, plus
 * `setVersion` and, per vendor, the vetting record V-9(4) ruled — the vendor's
 * API data-use and retention terms checked, and the vendor named in the privacy
 * notice, BEFORE it goes live.
 *
 * Publishing is where that is enforced, so "no code needed" never means "no
 * vetting needed". Version 2 adds members only, so the shipped reader
 * (`readDeploymentMakerCapability`) reads it exactly as it reads version 1.
 */

export const CONFIGURED_PROVIDER_SET_ROW_KEY = "configuredProviderSet" as const;
export const CONFIGURED_PROVIDER_SET_SEALED_VERSION = 1 as const;
export const CONFIGURED_PROVIDER_SET_DEPLOYMENT_VERSION = 2 as const;

/** Appended to the sealed row's provenance, exactly as V-14's row appends its own. */
export const CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF =
  " + V-9 ruled 2026-09-22 (V, chat): versioned configuredProviderSet row carrying"
  + " each vendor's V-9(4) vetting record, superseding the sealed row without altering it";

export type ConfiguredProvider = Readonly<{
  providerRef: string;
  adapterKind: string;
  maker: string;
}>;

/**
 * V-9(4). Two review dates and the privacy-notice fact — what the owner ruled is
 * checked before a hosted vendor is added. Dates are plain ISO calendar days:
 * the row records THAT the terms were read and when, never their text.
 */
export type ConfiguredProviderVetting = Readonly<{
  dataUseTermsReviewedOn: string;
  retentionTermsReviewedOn: string;
  namedInPrivacyNotice: boolean;
}>;

export type VettedConfiguredProvider = ConfiguredProvider & Readonly<{
  vetting: ConfiguredProviderVetting;
}>;

export type ConfiguredProviderSetRow = Readonly<{
  rowKey: typeof CONFIGURED_PROVIDER_SET_ROW_KEY;
  value: Readonly<Record<string, unknown>>;
  sourceRef: string;
}>;

const ISO_CALENDAR_DAY = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/u;

function namedText(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "" && value === value.trim();
}

/** The shape both versions share, refused under the code the reader already uses. */
function assertConfiguredProviderSetShape(
  requiredDistinctMakers: unknown,
  providers: readonly ConfiguredProvider[]
): void {
  if (!Number.isInteger(requiredDistinctMakers) || (requiredDistinctMakers as number) < 1) {
    throw new TypeError("CONFIGURED_PROVIDER_SET_INVALID");
  }
  if (!Array.isArray(providers) || providers.length < 1) {
    throw new TypeError("CONFIGURED_PROVIDER_SET_INVALID");
  }
  const refs = new Set<string>();
  for (const provider of providers) {
    if (typeof provider !== "object" || provider === null
      || !namedText(provider.providerRef)
      || !namedText(provider.adapterKind)
      || !namedText(provider.maker)) {
      throw new TypeError("CONFIGURED_PROVIDER_SET_INVALID");
    }
    if (refs.has(provider.providerRef)) throw new TypeError("CONFIGURED_PROVIDER_SET_INVALID");
    refs.add(provider.providerRef);
  }
}

function assertVendorVetted(provider: VettedConfiguredProvider): void {
  const vetting = provider.vetting as unknown;
  if (typeof vetting !== "object" || vetting === null || Array.isArray(vetting)) {
    throw new TypeError(`PROVIDER_VENDOR_NOT_VETTED:${provider.providerRef}`);
  }
  const record = vetting as Readonly<Record<string, unknown>>;
  if (record.namedInPrivacyNotice !== true
    || typeof record.dataUseTermsReviewedOn !== "string"
    || typeof record.retentionTermsReviewedOn !== "string"
    || !ISO_CALENDAR_DAY.test(record.dataUseTermsReviewedOn)
    || !ISO_CALENDAR_DAY.test(record.retentionTermsReviewedOn)) {
    throw new TypeError(`PROVIDER_VENDOR_NOT_VETTED:${provider.providerRef}`);
  }
}

/**
 * The SEALED version-1 value, exactly as every deployment published it before
 * this ruling — `apps/runner/src/dev-deployment-register.ts` writes this object.
 * It exists here so the superseding row can be proved to add members and move
 * nothing; it is never the row a hosted deployment publishes.
 */
export function buildConfiguredProviderSetSealedRow(
  input: Readonly<{
    requiredDistinctMakers: number;
    providers: readonly ConfiguredProvider[];
  }>,
  sourceRef: string
): ConfiguredProviderSetRow {
  assertConfiguredProviderSetShape(input.requiredDistinctMakers, input.providers);
  return Object.freeze({
    rowKey: CONFIGURED_PROVIDER_SET_ROW_KEY,
    value: Object.freeze({
      kind: "CONFIGURED_PROVIDER_SET" as const,
      requiredDistinctMakers: input.requiredDistinctMakers,
      providers: input.providers
    }),
    sourceRef
  });
}

/**
 * C-I5 — THE RULE AT THE PUBLICATION SEAM, over a row that has already been
 * canonicalised.
 *
 * The builder below refuses an unvetted vendor to whoever CALLS it, which is no
 * control at all while nothing has to call it: a hosted operator can write the
 * sealed version-1 shape by hand, or hand-write a version-2 shape with a vendor
 * whose record is missing, and publish it. So the same question is asked again
 * of the value on its way into the database, where every publication passes —
 * `RegisterPublicationPort.publishGeneral`, for HOSTED publications only.
 *
 * Asked of the parsed value rather than of the builder's output, because by the
 * time a row reaches the port it is canonical JSON text and its provenance is
 * unknowable. What is checked is therefore the SHAPE the builder produces: the
 * deployment set version, and V-9(4)'s record on every vendor in it.
 *
 * A hosted publication that carries no `configuredProviderSet` row at all is
 * untouched — it is changing something else.
 */
export function assertHostedConfiguredProviderSetVetted(value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("CONFIGURED_PROVIDER_SET_INVALID");
  }
  const row = value as Readonly<Record<string, unknown>>;
  const providers = row.providers;
  if (row.kind !== "CONFIGURED_PROVIDER_SET" || !Array.isArray(providers) || providers.length < 1) {
    throw new TypeError("CONFIGURED_PROVIDER_SET_INVALID");
  }
  for (const provider of providers) {
    if (typeof provider !== "object" || provider === null || Array.isArray(provider)
      || !namedText((provider as Readonly<Record<string, unknown>>).providerRef)) {
      throw new TypeError("CONFIGURED_PROVIDER_SET_INVALID");
    }
  }
  const named = providers as readonly VettedConfiguredProvider[];
  // The sealed version-1 shape carries no vetting for ANY vendor, so the first
  // one names the refusal: the operator's next step is the same either way.
  if (row.setVersion !== CONFIGURED_PROVIDER_SET_DEPLOYMENT_VERSION) {
    throw new TypeError(`PROVIDER_VENDOR_NOT_VETTED:${named[0]!.providerRef}`);
  }
  for (const provider of named) assertVendorVetted(provider);
}

/**
 * The superseding DEPLOYMENT version. `sealedSourceRef` is the provenance the
 * sealed row carried; the ruling is appended to it rather than replacing it, so
 * the row's history reads forward.
 */
export function buildConfiguredProviderSetDeploymentRow(
  input: Readonly<{
    requiredDistinctMakers: number;
    providers: readonly VettedConfiguredProvider[];
  }>,
  sealedSourceRef: string
): ConfiguredProviderSetRow {
  assertConfiguredProviderSetShape(input.requiredDistinctMakers, input.providers);
  for (const provider of input.providers) assertVendorVetted(provider);
  return Object.freeze({
    rowKey: CONFIGURED_PROVIDER_SET_ROW_KEY,
    value: Object.freeze({
      kind: "CONFIGURED_PROVIDER_SET" as const,
      setVersion: CONFIGURED_PROVIDER_SET_DEPLOYMENT_VERSION,
      requiredDistinctMakers: input.requiredDistinctMakers,
      providers: input.providers
    }),
    sourceRef: `${sealedSourceRef}${CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF}`
  });
}
