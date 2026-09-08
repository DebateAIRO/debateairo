import { isAbsolute, join, relative, resolve } from "node:path";

function checkedAbsolutePath(path: string): string {
  if (!isAbsolute(path) || resolve(path) !== path || /[\n\r"\\]/u.test(path)) {
    throw new TypeError("FIX13_PROFILE_PATH");
  }
  return path;
}

function literal(path: string): string {
  return `(literal "${checkedAbsolutePath(path)}")`;
}

export function fixWorkerForbiddenPaths(input: Readonly<{
  controlRoot: string;
  workerHome: string;
  bundlePath: string;
}>): readonly string[] {
  const controlRoot = checkedAbsolutePath(input.controlRoot);
  const workerHome = checkedAbsolutePath(input.workerHome);
  return Object.freeze([
    controlRoot,
    checkedAbsolutePath(input.bundlePath),
    join(workerHome, ".gitconfig"),
    join(workerHome, ".config", "gh"),
    join(workerHome, ".ssh"),
  ]);
}

export function buildFixWorkerProfile(input: Readonly<{
  worktree: string;
  scratchDirectory: string;
  forbiddenPaths: readonly string[];
}>): string {
  const worktree = checkedAbsolutePath(input.worktree);
  const scratch = checkedAbsolutePath(input.scratchDirectory);
  if (input.forbiddenPaths.length === 0) throw new TypeError("FIX13_PROFILE_FORBIDDEN_EMPTY");
  const forbidden = input.forbiddenPaths.map((path) => literal(path)).join(" ");
  return [
    "; FIX-13 generated worker profile — default deny, no network",
    "(version 1)",
    "(deny default)",
    "(allow process*)",
    "(allow sysctl-read)",
    "(allow mach-lookup)",
    "(allow file-read* (subpath \"/System\"))",
    "(allow file-read* (subpath \"/usr/lib\"))",
    "(allow file-read* (subpath \"/usr/bin\"))",
    "(allow file-read* (subpath \"/bin\"))",
    "(allow file-read* (literal \"/dev/null\"))",
    `(allow file-read* (subpath "${worktree}"))`,
    `(allow file-read* (subpath "${scratch}"))`,
    `(allow file-write* (subpath "${scratch}"))`,
    "(allow file-write* (literal \"/dev/null\"))",
    `(deny file-read* file-write* ${forbidden})`,
    "(deny network*)",
    "",
  ].join("\n");
}

function isWithin(root: string, candidate: string): boolean {
  const offset = relative(root, candidate);
  return offset === "" || (!offset.startsWith("..") && !isAbsolute(offset));
}

export function evaluateFixWorkerCapability(input: Readonly<{
  worktree: string;
  scratchDirectory: string;
  forbiddenPaths: readonly string[];
  attempt: Readonly<
    { operation: "network" } |
    { operation: "read" | "stat" | "write"; path: string }
  >;
}>): "ALLOWED" | "CONTAINED" {
  if (input.attempt.operation === "network") return "CONTAINED";
  const path = checkedAbsolutePath(input.attempt.path);
  const forbidden = input.forbiddenPaths.some((root) => isWithin(checkedAbsolutePath(root), path));
  if (forbidden) return "CONTAINED";
  const scratch = checkedAbsolutePath(input.scratchDirectory);
  if (input.attempt.operation === "write") return isWithin(scratch, path) ? "ALLOWED" : "CONTAINED";
  const worktree = checkedAbsolutePath(input.worktree);
  const readable = [worktree, scratch, "/System", "/usr/lib", "/usr/bin", "/bin"];
  return readable.some((root) => isWithin(root, path)) ? "ALLOWED" : "CONTAINED";
}
