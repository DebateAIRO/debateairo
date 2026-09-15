import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ObservationError } from "./errors.js";

export type ResolvedRepoPath = string & {
  readonly __resolvedRepoPath: unique symbol;
};

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));

export function observationRepoRoot(): string {
  return REPO_ROOT;
}

export function resolveRepoPath(repoRoot: string, configuredPath: string): ResolvedRepoPath {
  if (typeof repoRoot !== "string" || !isAbsolute(repoRoot) || repoRoot.includes("\0")
    || typeof configuredPath !== "string" || configuredPath.length === 0
    || configuredPath.includes("\0") || isAbsolute(configuredPath)
    || configuredPath.split(/[\\/]/u).includes("..")) {
    throw new ObservationError("OBSERVATION_REPO_PATH_INVALID");
  }
  const root = resolve(repoRoot);
  const resolved = resolve(root, configuredPath);
  const fromRoot = relative(root, resolved);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${sep}`)
    || isAbsolute(fromRoot)) {
    throw new ObservationError("OBSERVATION_REPO_PATH_INVALID");
  }
  return resolved as ResolvedRepoPath;
}
