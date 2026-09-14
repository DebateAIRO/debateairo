const REPO_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\/\/)[A-Za-z0-9@+._-]+(?:\/[A-Za-z0-9@+._-]+)*$/u;
const INVARIANT = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,7}$/u;

export interface HumanOwnedCatalog {
  readonly invariants: readonly Readonly<{
    id: string;
    description: string;
    command: string;
    ownedBy: "V";
  }>[];
}

export type PatchValidationResult =
  | Readonly<{
      ok: true;
      touchedPaths: readonly string[];
      productionRoot: string;
      invariantId: string;
      command: string;
    }>
  | Readonly<{ ok: false; code: string }>;

function regexForGlob(glob: string): RegExp {
  let pattern = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index]!;
    if (character === "*") {
      if (glob[index + 1] === "*") { pattern += ".*"; index += 1; }
      else pattern += "[^/]*";
    } else if (character === "?") pattern += "[^/]";
    else pattern += character.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  }
  return new RegExp(`${pattern}$`, "u");
}

function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((glob) => REPO_PATH.test(glob.replaceAll("*", "x").replaceAll("?", "x")) && regexForGlob(glob).test(path));
}

function touchedPaths(patch: string): readonly string[] | null {
  if (!patch.endsWith("\n") || patch.includes("\0") || patch.includes("\r")) return null;
  const paths: string[] = [];
  for (const line of patch.split("\n")) {
    if (!line.startsWith("diff --git ")) continue;
    const match = /^diff --git a\/([^ ]+) b\/([^ ]+)$/u.exec(line);
    if (match === null || match[1] !== match[2] || !REPO_PATH.test(match[1]!)) return null;
    if (paths.includes(match[1]!)) return null;
    paths.push(match[1]!);
  }
  return paths.length === 0 ? null : Object.freeze(paths);
}

function immutable(path: string): boolean {
  const segments = path.toLowerCase().split("/");
  const basename = segments.at(-1)!;
  return path.startsWith("tools/") || path.startsWith(".github/") || path.startsWith(".gitlab/") ||
    path.startsWith("deploy/") || path.startsWith("migrations/") || path.startsWith("packages/obs-capture/") ||
    path.includes("/src/zone/") || path.startsWith("src/zone/") || basename === "package.json" ||
    basename === "pnpm-lock.yaml" || basename === "pnpm-workspace.yaml" || basename === "register.bootstrap.json" ||
    basename.includes("manifest") || basename.includes("register") || basename.startsWith("compose") ||
    segments.includes("ci") || segments.includes("scripts");
}

function testPath(path: string): boolean {
  return path.startsWith("tests/") || /(?:^|\/)__tests__(?:\/|$)/u.test(path) || /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path);
}

function weakensTests(patch: string, paths: readonly string[]): boolean {
  if (!paths.some(testPath)) return false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("---") || line.startsWith("+++")) continue;
    if (line.startsWith("-") && /\b(?:expect|assert)(?:\.|\s*\()|snapshot|toMatchSnapshot/u.test(line)) return true;
    if (line.startsWith("+") && /\b(?:test|it|describe)\.skip\s*\(|\.skip\s*\(|--passWithNoTests\b/u.test(line)) return true;
  }
  return paths.some((path) => path.endsWith(".snap")) && /\ndeleted file mode /u.test(`\n${patch}`);
}

function rootPath(root: string): string | null {
  const separator = root.lastIndexOf(":");
  if (separator <= 0) return null;
  const path = root.slice(0, separator);
  return REPO_PATH.test(path) ? path : null;
}

function validCatalog(catalog: HumanOwnedCatalog): boolean {
  const ids = new Set<string>();
  return catalog.invariants.every((entry) => {
    if (!INVARIANT.test(entry.id) || entry.ownedBy !== "V" || entry.description.length === 0 ||
        entry.description.length > 256 || entry.command.length === 0 || entry.command.length > 512 ||
        /[\0\r\n]/u.test(entry.command) || ids.has(entry.id)) return false;
    ids.add(entry.id);
    return true;
  });
}

export function validatePatch(input: Readonly<{
  patch: string;
  proposalRoot: string;
  declaredScope: readonly string[];
  allowlistGlobs: readonly string[];
  floorDenyGlobs: readonly string[];
  catalog: HumanOwnedCatalog;
  invariantId: string;
}>): PatchValidationResult {
  if (input.allowlistGlobs.length === 0) return Object.freeze({ ok: false, code: "REFUSED_ALLOWLIST_EMPTY" });
  if (input.catalog.invariants.length === 0) return Object.freeze({ ok: false, code: "REFUSED_CATALOG_EMPTY" });
  if (!validCatalog(input.catalog)) return Object.freeze({ ok: false, code: "REFUSED_CATALOG_INVALID" });
  const paths = touchedPaths(input.patch);
  if (paths === null) return Object.freeze({ ok: false, code: "REFUSED_PATCH_INVALID" });
  if (paths.some((path) => !matchesAny(path, input.allowlistGlobs))) return Object.freeze({ ok: false, code: "REFUSED_OUTSIDE_ALLOWLIST" });
  if (paths.some((path) => matchesAny(path, input.floorDenyGlobs))) return Object.freeze({ ok: false, code: "REFUSED_FLOOR_DENY" });
  if (paths.some(immutable)) return Object.freeze({ ok: false, code: "REFUSED_IMMUTABLE_PATH" });
  const declared = new Set(input.declaredScope);
  if (declared.size !== input.declaredScope.length || paths.length !== declared.size || paths.some((path) => !declared.has(path))) {
    return Object.freeze({ ok: false, code: "REFUSED_SCOPE_DRIFT" });
  }
  const expectedRoot = rootPath(input.proposalRoot);
  const productionRoots = paths.filter((path) => !testPath(path));
  if (productionRoots.length !== 1 || expectedRoot === null || productionRoots[0] !== expectedRoot) {
    return Object.freeze({ ok: false, code: "REFUSED_MULTIPLE_ROOTS" });
  }
  if (weakensTests(input.patch, paths)) return Object.freeze({ ok: false, code: "REFUSED_WEAKENS_TEST" });
  const catalogEntry = input.catalog.invariants.find((entry) => entry.id === input.invariantId);
  if (catalogEntry === undefined) return Object.freeze({ ok: false, code: "REFUSED_INVARIANT_NOT_CATALOGED" });
  if (!input.patch.split("\n").some((line) => line === `+// invariant: ${input.invariantId}`)) {
    return Object.freeze({ ok: false, code: "REFUSED_INVARIANT_UNBOUND" });
  }
  if (!paths.some((path) => testPath(path) && catalogEntry.command.includes(path))) {
    return Object.freeze({ ok: false, code: "REFUSED_CATALOG_COMMAND_SCOPE" });
  }
  return Object.freeze({
    ok: true,
    touchedPaths: paths,
    productionRoot: productionRoots[0]!,
    invariantId: catalogEntry.id,
    command: catalogEntry.command,
  });
}
