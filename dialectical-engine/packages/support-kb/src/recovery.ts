import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";

import {
  analyzeSupportCredentialText,canonicalSupportTextViews,supportTextContainsCredentialOperation,
  supportTextHasUnsafePath,TypedDomainError
} from "@debateai/kernel";
import {
  SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES,type SupportSourcePolicy
} from "./catalog.js";

export type SupportRecoveryComponent = Readonly<{
  id: string;
  lang: "en" | "ro";
  articleSha256: string;
  modelProjection: string;
  fallback: string;
}>;

export type ParsedSupportRecoveryComponents = Readonly<{
  schemaVersion: 1;
  components: readonly SupportRecoveryComponent[];
  fileSha256: string;
  canonicalManifest: string;
}>;

const SHA256 = /^[0-9a-f]{64}$/u;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const COMPONENT_KEYS = ["articleSha256","fallback","id","lang","modelProjection"];
const CLOSED_IDS = new Set([
  ...SUPPORT_ACTION_IDS,...SUPPORT_CAPABILITIES.map(({ id }) => id),
  ...SUPPORT_CAPABILITIES.flatMap(({ articleIds }) => articleIds)
].filter((id) => id.includes("-")));
const NARRATIVE_ID = /\b[a-z0-9]+(?:-[a-z0-9]+)+\b/giu;
const MARKUP_OR_URL = /(?:https?:\/\/|www\.|\[[^\]]+\]\s*\(|<\/?[a-z][^>]*>)/iu;
const REPOSITORY_METADATA = /(?:^|\s)(?:apps|packages|tests|tools)\/[a-z0-9_./\[\]-]+|\b[a-z0-9_.-]+\.(?:ts|tsx|js|json|md):\d+\b/iu;
const CONTROL = /[\p{Cc}\p{Cf}]/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;

function fail(detail: string): never {
  throw new TypedDomainError("SUPPORT_KB_RECOVERY_COMPONENT_INVALID",detail);
}

function decode(bytes: Buffer): string {
  try { return new TextDecoder("utf-8",{ fatal: true }).decode(bytes); }
  catch { return fail("component file must be valid UTF-8"); }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isSupportRecoveryTextSafe(value: string): boolean {
  if (value.trim() === "" || [...value].length > 4_000 || CONTROL.test(value) || CYRILLIC.test(value)) return false;
  const canonical = canonicalSupportTextViews(value);
  if (canonical.unsafeEncoding || supportTextHasUnsafePath(value)) return false;
  return canonical.views.every((candidate) => {
    if (MARKUP_OR_URL.test(candidate) || REPOSITORY_METADATA.test(candidate)) return false;
    if (analyzeSupportCredentialText(candidate).credentialValueSpans.length > 0) return false;
    if (supportTextContainsCredentialOperation(candidate)) return false;
    NARRATIVE_ID.lastIndex = 0;
    return ![...candidate.toLocaleLowerCase("en-US").matchAll(NARRATIVE_ID)]
      .some(([id]) => CLOSED_IDS.has(id));
  });
}

export function parseSupportRecoveryComponents(input: string | Buffer): ParsedSupportRecoveryComponents {
  const bytes = typeof input === "string" ? Buffer.from(input,"utf8") : Buffer.from(input);
  let decoded: unknown;
  try { decoded = JSON.parse(decode(bytes)) as unknown; }
  catch { return fail("component file must contain JSON"); }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) fail("root must be an object");
  const root = decoded as Record<string,unknown>;
  if (Object.keys(root).sort().join(",") !== "components,schemaVersion"
    || root.schemaVersion !== 1 || !Array.isArray(root.components)) {
    fail("root must contain exactly schemaVersion 1 and components");
  }
  const seen = new Set<string>();
  const components = root.components.map((value,index) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`components[${index}] must be an object`);
    const row = value as Record<string,unknown>;
    if (Object.keys(row).sort().join(",") !== COMPONENT_KEYS.join(",")) fail(`components[${index}] has unexpected keys`);
    if (typeof row.id !== "string" || !ID.test(row.id)) fail(`components[${index}].id is invalid`);
    if (row.lang !== "en" && row.lang !== "ro") fail(`components[${index}].lang is invalid`);
    if (typeof row.articleSha256 !== "string" || !SHA256.test(row.articleSha256)) fail(`components[${index}].articleSha256 is invalid`);
    if (typeof row.modelProjection !== "string" || !isSupportRecoveryTextSafe(row.modelProjection)) fail(`components[${index}].modelProjection is unsafe`);
    if (typeof row.fallback !== "string" || !isSupportRecoveryTextSafe(row.fallback)) fail(`components[${index}].fallback is unsafe`);
    const key = `${row.id}.${row.lang}`;
    if (seen.has(key)) fail(`components[${index}] duplicates ${key}`);
    seen.add(key);
    return Object.freeze({
      id: row.id,lang: row.lang,articleSha256: row.articleSha256,
      modelProjection: row.modelProjection,fallback: row.fallback
    }) as SupportRecoveryComponent;
  });
  const keys = components.map(({ id,lang }) => `${id}.${lang}`);
  if (keys.some((key,index) => index > 0 && keys[index - 1]!.localeCompare(key,"en") >= 0)) {
    fail("components must be strictly ordered by id then language");
  }
  const canonicalManifest = components.map((component) => [
    `${component.id}.${component.lang}`,
    component.articleSha256,
    sha256(component.modelProjection),
    sha256(component.fallback)
  ].join(":" )).join("\n");
  return Object.freeze({
    schemaVersion: 1,components:Object.freeze(components),fileSha256:sha256(bytes),canonicalManifest
  });
}

export function supportRecoveryTextSha256(value: string): string { return sha256(value); }

function validSourcePolicy(policy: SupportSourcePolicy): boolean {
  const required = new Set(policy.requiredSourceIds);
  const allowed = new Set(policy.allowedSourceIds);
  const recovery = new Set(policy.recoverySourceIds);
  return policy.requiredSourceIds.length > 0
    && required.size === policy.requiredSourceIds.length
    && allowed.size === policy.allowedSourceIds.length
    && recovery.size === policy.recoverySourceIds.length
    && policy.requiredSourceIds.every((id) => allowed.has(id))
    && policy.recoverySourceIds.length === 1
    && policy.recoverySourceIds.every((id) => required.has(id));
}

export function supportSourceIdsSatisfyPolicy(
  sourceIds: readonly string[],policy: SupportSourcePolicy | null
): boolean {
  if (policy === null) return true;
  if (!validSourcePolicy(policy)) return false;
  return sourceIds.length > 0
    && sourceIds.every((id) => policy.allowedSourceIds.includes(id))
    && policy.requiredSourceIds.every((id) => sourceIds.includes(id));
}

export function selectSupportRecoveryEntry<T extends Readonly<{
  id: string;
  fallback?: string;
}>>(
  entries: readonly T[],policy: SupportSourcePolicy | null,
  preferredSourceIds: readonly string[] = []
): T | undefined {
  if (policy === null) {
    const preferred = preferredSourceIds
      .map((id) => entries.find((entry) => entry.id === id))
      .find((entry) => entry?.fallback !== undefined);
    return preferred ?? entries[0];
  }
  if (!validSourcePolicy(policy)
    || !supportSourceIdsSatisfyPolicy(entries.map(({ id }) => id),policy)) return undefined;
  const recoveryId = policy.recoverySourceIds[0]!;
  const entry = entries.find(({ id }) => id === recoveryId);
  return entry?.fallback === undefined ? undefined : entry;
}
