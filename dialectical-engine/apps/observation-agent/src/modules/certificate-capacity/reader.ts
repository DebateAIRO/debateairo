import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveDevCustodyRoot } from "../../../../../deploy/dev-auth/custody-root.mjs";
import { observationRepoRoot, resolveRepoPath, type ResolvedRepoPath } from "../../core/paths.js";
import type { ModuleTargetFragment } from "../../core/types.js";

/**
 * DL7-F4. The ratified target names the certificate by its custody-relative location, and
 * dev custody is movable (`DEBATEAI_DEV_CUSTODY_ROOT`, F-05): keys must be able to live
 * outside a cloud-synced checkout. The configured value stays the contract — it is still
 * compared exactly — but the path is RESOLVED through the custody resolver, so the agent
 * reads the certificate where custody actually is rather than where the repository is.
 */
const CUSTODY_PREFIX = ".local/dev-auth/";

function resolveCertificatePath(repoRoot: string, configuredPath: string): ResolvedRepoPath {
  if (!configuredPath.startsWith(CUSTODY_PREFIX)) return resolveRepoPath(repoRoot, configuredPath);
  const withinCustody = configuredPath.slice(CUSTODY_PREFIX.length);
  return join(resolveDevCustodyRoot(repoRoot), withinCustody) as ResolvedRepoPath;
}

export type CertificateCapacitySnapshot = Readonly<{
  days: number;
  notAfter: Date;
  observedAt: Date;
}>;

export type CertificateCapacityDependencies = Readonly<{
  read(path: ResolvedRepoPath): Promise<Uint8Array>;
  notAfter(contents: Uint8Array): Date;
}>;

const productionDependencies: CertificateCapacityDependencies = Object.freeze({
  read: readFile,
  notAfter(contents) {
    const value = new Date(new X509Certificate(contents).validTo);
    if (!Number.isFinite(value.getTime())) throw new Error("OBSERVATION_CERTIFICATE_INVALID");
    return value;
  }
});

function targetPath(fragment: ModuleTargetFragment | null): string {
  if (fragment?.basename !== "OBS-05.json" || fragment.targets.length !== 1) {
    throw new Error("OBSERVATION_CERTIFICATE_TARGET_INVALID");
  }
  const target = fragment.targets[0];
  if (typeof target !== "object" || target === null) {
    throw new Error("OBSERVATION_CERTIFICATE_TARGET_INVALID");
  }
  const value = target as Readonly<Record<string, unknown>>;
  if (value.component !== "tls_front_door" || value.kind !== "certificate"
    || typeof value.path !== "string" || value.path !== ".local/dev-auth/tls/localhost.pem") {
    throw new Error("OBSERVATION_CERTIFICATE_TARGET_INVALID");
  }
  return value.path;
}

export async function readCertificateCapacity(
  targetFragment: ModuleTargetFragment | null,
  observedAt = new Date(),
  dependencies: CertificateCapacityDependencies = productionDependencies,
  repoRoot = observationRepoRoot()
): Promise<CertificateCapacitySnapshot> {
  const path = resolveCertificatePath(repoRoot, targetPath(targetFragment));
  const contents = await dependencies.read(path);
  const notAfter = dependencies.notAfter(contents);
  if (!Number.isFinite(notAfter.getTime())) throw new Error("OBSERVATION_CERTIFICATE_INVALID");
  return Object.freeze({
    days: Math.floor((notAfter.getTime() - observedAt.getTime()) / 86_400_000),
    notAfter,
    observedAt
  });
}
