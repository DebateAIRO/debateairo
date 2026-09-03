import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { ModuleTargetFragment } from "../../core/types.js";

export type CertificateCapacitySnapshot = Readonly<{
  days: number;
  notAfter: Date;
  observedAt: Date;
}>;

export type CertificateCapacityDependencies = Readonly<{
  read(path: string): Promise<Uint8Array>;
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
  dependencies: CertificateCapacityDependencies = productionDependencies
): Promise<CertificateCapacitySnapshot> {
  const path = targetPath(targetFragment);
  const contents = await dependencies.read(path);
  const notAfter = dependencies.notAfter(contents);
  if (!Number.isFinite(notAfter.getTime())) throw new Error("OBSERVATION_CERTIFICATE_INVALID");
  return Object.freeze({
    days: Math.floor((notAfter.getTime() - observedAt.getTime()) / 86_400_000),
    notAfter,
    observedAt
  });
}
