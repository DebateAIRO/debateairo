import { posix } from "node:path";
import { ZONE_MANIFEST } from "../../../packages/obs-capture/src/zone/manifest.js";

const GOVERNED_IMPORTER_PREFIXES = [
  "packages/obs-capture/",
  "tools/obs-listener/",
  "acceptance/obs/",
] as const;

const MANIFEST_PATH = "packages/obs-capture/src/zone/manifest.ts";

const ZONE_PREFIXES = [
  ...ZONE_MANIFEST.zone_path_prefixes,
  ...ZONE_MANIFEST.compiled_alternate_prefixes,
].map((item) => normalizeRepositoryPath(item)).filter((item): item is string => item !== null);

function withoutQueryOrFragment(value: string): string {
  const query = value.indexOf("?");
  const fragment = value.indexOf("#");
  const end = query < 0 ? fragment : fragment < 0 ? query : Math.min(query, fragment);
  return end < 0 ? value : value.slice(0, end);
}

export function normalizeRepositoryPath(value: string): string | null {
  let slashed = value.replaceAll("\\", "/");
  while (slashed.startsWith("/")) slashed = slashed.slice(1);
  const normalized = posix.normalize(slashed);
  if (normalized === ".." || normalized.startsWith("../")) return null;
  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
}

function workspaceSpecifierPath(specifier: string): string | null {
  const marker = "@debateai/";
  if (!specifier.startsWith(marker)) return null;
  const remainder = specifier.slice(marker.length);
  const slash = remainder.indexOf("/");
  const workspace = slash < 0 ? remainder : remainder.slice(0, slash);
  const subpath = slash < 0 ? "" : remainder.slice(slash + 1);
  if (workspace.length === 0) return null;
  const base = workspace === "api" || workspace === "runner" || workspace === "scheduler"
    ? `apps/${workspace}`
    : `packages/${workspace}`;
  return subpath.length === 0 ? base : `${base}/${subpath}`;
}

function resolveSpecifier(importerPath: string, rawSpecifier: string): string | null {
  const specifier = withoutQueryOrFragment(rawSpecifier).replaceAll("\\", "/");
  if (specifier.startsWith("@debateai/")) {
    const workspacePath = workspaceSpecifierPath(specifier);
    return workspacePath === null ? null : normalizeRepositoryPath(workspacePath);
  }
  if (specifier.startsWith("@/")) return normalizeRepositoryPath(specifier.slice(2));
  if (specifier.startsWith("#root/")) return normalizeRepositoryPath(specifier.slice("#root/".length));
  if (specifier.startsWith(".")) {
    return normalizeRepositoryPath(posix.join(posix.dirname(importerPath), specifier));
  }
  if (
    specifier.startsWith("apps/")
    || specifier.startsWith("packages/")
    || specifier.startsWith("tools/")
    || specifier.startsWith("acceptance/")
    || specifier.startsWith("migrations/")
  ) {
    return normalizeRepositoryPath(specifier);
  }
  return null;
}

function sourceEquivalent(path: string): string {
  if (path.endsWith(".mjs")) return `${path.slice(0, -4)}.mts`;
  if (path.endsWith(".cjs")) return `${path.slice(0, -4)}.cts`;
  if (path.endsWith(".js")) return `${path.slice(0, -3)}.ts`;
  if (path.endsWith(".jsx")) return `${path.slice(0, -4)}.tsx`;
  return path;
}

function withoutTypeScriptExtension(path: string): string {
  for (const extension of [".tsx", ".mts", ".cts", ".ts"] as const) {
    if (path.endsWith(extension)) return path.slice(0, -extension.length);
  }
  return path;
}

function hasZonePrefix(resolvedPath: string): boolean {
  const candidates = new Set([
    resolvedPath,
    sourceEquivalent(resolvedPath),
    withoutTypeScriptExtension(resolvedPath),
  ]);
  return ZONE_PREFIXES.some((prefix) => {
    const comparablePrefixes = new Set([prefix, sourceEquivalent(prefix), withoutTypeScriptExtension(prefix)]);
    for (const candidate of candidates) {
      for (const comparablePrefix of comparablePrefixes) {
        if (candidate === comparablePrefix || candidate.startsWith(`${comparablePrefix}/`)) return true;
      }
    }
    return false;
  });
}

export type ZonePathClassifier = {
  readonly governed: boolean;
  readonly manifestExempt: boolean;
  readonly matches: (specifier: string) => boolean;
};

export function createZonePathClassifier(rawImporterPath: string): ZonePathClassifier {
  const importerPath = normalizeRepositoryPath(rawImporterPath);
  const governed = importerPath !== null
    && GOVERNED_IMPORTER_PREFIXES.some((prefix) => importerPath.startsWith(prefix));
  return {
    governed,
    manifestExempt: importerPath === MANIFEST_PATH,
    matches(specifier) {
      if (!governed || importerPath === null) return false;
      const resolved = resolveSpecifier(importerPath, specifier);
      return resolved !== null && hasZonePrefix(resolved);
    },
  };
}

export function isClassifiedZonePath(rawPath: string): boolean {
  const path = normalizeRepositoryPath(rawPath);
  return path !== null && hasZonePrefix(path);
}
