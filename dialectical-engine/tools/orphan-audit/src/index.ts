import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { EVENT_CONSUMERS } from "@debateai/contract";

const root = fileURLToPath(new URL("../../..", import.meta.url));
type Row = readonly [name: string, directory: string, allowed: readonly string[]];

const rows: readonly Row[] = [
  ["kernel", "packages/kernel", []],
  ["crypto", "packages/crypto", []],
  ["published-arithmetic", "packages/published-arithmetic", []],
  ["propagation", "packages/propagation", ["kernel", "published-arithmetic"]],
  ["battery-decision", "packages/battery/decision", ["kernel"]],
  ["contract", "packages/contract", ["kernel"]],
  ["db", "packages/db", ["kernel", "crypto"]],
  ["register", "packages/register", ["kernel", "db"]],
  ["ledger", "packages/ledger", ["kernel", "db", "register"]],
  ["providers", "packages/providers", ["kernel", "register", "ledger"]],
  ["graph", "packages/graph", ["kernel", "db", "ledger", "register"]],
  ["judgement", "packages/judgement", ["kernel", "db", "ledger", "providers", "register"]],
  ["evidence", "packages/evidence", ["kernel", "db", "ledger", "providers", "register", "graph"]],
  ["critique", "packages/critique", ["kernel", "db", "ledger", "providers", "register", "graph"]],
  ["memory", "packages/memory", ["kernel", "db", "ledger", "providers", "register", "graph"]],
  ["liveness", "packages/liveness", ["kernel", "db", "ledger", "providers", "register", "graph"]],
  ["settlement", "packages/settlement", ["kernel", "db", "ledger", "providers", "register", "graph"]],
  ["valuation", "packages/valuation", ["kernel", "db", "ledger", "register", "graph", "propagation"]],
  ["budget", "packages/budget", ["kernel", "db", "ledger", "register"]],
  ["battery", "packages/battery", ["kernel", "db", "ledger", "register", "budget", "graph", "battery-decision", "evidence", "judgement", "critique", "valuation", "serve", "settlement"]],
  ["serve", "packages/serve", ["kernel", "db", "ledger", "register", "graph", "propagation", "providers", "contract", "valuation", "memory", "liveness"]],
  ["apps/api", "apps/api", ["contract", "kernel", "crypto", "db", "register", "serve", "battery", "ledger", "settlement", "critique", "liveness", "evaluator"]],
  ["apps/runner", "apps/runner", ["kernel", "published-arithmetic", "propagation", "register", "db", "ledger", "providers", "graph", "judgement", "evidence", "battery", "battery-decision", "critique", "valuation", "serve", "memory", "settlement", "liveness", "budget"]],
  ["apps/replay", "apps/replay", ["published-arithmetic"]],
  ["apps/scheduler", "apps/scheduler", ["kernel", "db", "ledger", "register", "propagation", "serve", "battery", "settlement", "liveness"]],
  ["web", "web", ["contract"]],
  ["tools/orphan-audit", "tools/orphan-audit", ["kernel", "contract"]],
  ["tools/acceptance-bundle", "tools/acceptance-bundle", ["kernel", "contract", "register", "db"]]
];

function workspaceName(dependency: string): string | null {
  if (!dependency.startsWith("@debateai/")) return null;
  return dependency.slice("@debateai/".length);
}

export async function auditArchitecture(): Promise<{
  readonly edgeRowsChecked: number;
  readonly violations: readonly string[];
}> {
  const violations: string[] = [];
  const graph = new Map<string, string[]>();
  for (const [name, directory, allowed] of rows) {
    const manifest = JSON.parse(await readFile(join(root, directory, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const actual = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
      .map(workspaceName)
      .filter((value): value is string => value !== null);
    graph.set(name, actual);
    for (const dependency of actual) {
      if (!allowed.includes(dependency)) violations.push(`${name} -> ${dependency} is not a declared edge`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (name: string): void => {
    if (visiting.has(name)) {
      violations.push(`dependency cycle reaches ${name}`);
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    for (const dependency of graph.get(name) ?? []) visit(dependency);
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of graph.keys()) visit(name);
  const replaySource = await readFile(join(root, "apps/replay/src/index.ts"), "utf8");
  const replayImport = replaySource.match(/import\s*\{([^}]+)\}\s*from\s*["']@debateai\/published-arithmetic["']/)?.[1]
    ?.split(",").map((name) => name.trim()).sort();
  if (JSON.stringify(replayImport) !== JSON.stringify(["agg", "product", "σ"].sort())) {
    violations.push("apps/replay must import exactly agg, σ, product from published-arithmetic");
  }
  const arithmeticSource = await readFile(join(root, "packages/published-arithmetic/src/index.ts"), "utf8");
  const arithmeticExports = [...arithmeticSource.matchAll(/export function\s+([^\s(]+)/g)].map((match) => match[1]).sort();
  if (JSON.stringify(arithmeticExports) !== JSON.stringify(["agg", "product", "σ"].sort())) {
    violations.push("published-arithmetic must export exactly agg, σ, product");
  }
  const replayWithoutImport = replaySource.replace(/import[^;]+;/g, "");
  if (/(?:function|const|let|class)\s+(?:agg|σ|product)\b/.test(replayWithoutImport)) {
    violations.push("apps/replay declares a local arithmetic symbol");
  }
  return { edgeRowsChecked: rows.length, violations };
}

async function sourceFiles(directory: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await sourceFiles(path));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) output.push(path);
  }
  return output;
}

// UI-01 (DR-145): apps/ui is V's restored V2 debate workspace — a Next.js
// UI surface, the same class of code as the root-level web/ app, which these
// engine sweeps have never covered (web/ sits outside packages/apps/tools by
// placement). V placed the restored UI under apps/, so the exemption must be
// explicit here: UI code lawfully reads NEXT_PUBLIC_* / framework env and is
// not part of the engine's register/dependency-edge law. Engine rules keep
// applying to every other apps/* directory.
const uiSurfaceDirectory = join(root, "apps/ui");
function withoutUiSurface(paths: readonly string[]): string[] {
  return paths.filter((path) => !path.startsWith(uiSurfaceDirectory));
}

export async function auditS14TypeGraph(): Promise<{
  readonly contractVersion: string;
  readonly servedWithoutConsumer: readonly string[];
  readonly consumedWithoutServed: readonly string[];
  readonly eventsWithoutConsumer: readonly string[];
  readonly deathListReachable: readonly string[];
}> {
  const inventory = JSON.parse(await readFile(join(root, "packages/contract/generated/field-inventory.json"), "utf8")) as {
    contractVersion: string;
    resources: { AnswerSchema: string[] };
  };
  const projection = await readFile(join(root, "web/lib/v3Presentation.ts"), "utf8");
  const destructuring = projection.match(/const\s*\{([\s\S]*?)\}\s*=\s*answer;/)?.[1] ?? "";
  const consumed = [...destructuring.matchAll(/\b([a-z][a-z0-9_]*)\b/g)].map((match) => match[1]!);
  const served = inventory.resources.AnswerSchema;
  const servedWithoutConsumer = served.filter((field) => !consumed.includes(field));
  const consumedWithoutServed = [...new Set(consumed.filter((field) => !served.includes(field)))];
  const eventsWithoutConsumer = Object.entries(EVENT_CONSUMERS)
    .filter(([, consumers]) => consumers.length === 0)
    .map(([event]) => event);

  const webFiles = await sourceFiles(join(root, "web"));
  const sources = await Promise.all(webFiles.map(async (path) => ({
    path: relative(join(root, "web"), path),
    source: await readFile(path, "utf8")
  })));
  const reachableText = sources
    .filter(({ path }) => path.startsWith("app/") || path === "lib/api.ts" || path === "lib/serverApi.ts" || path === "lib/v3Presentation.ts")
    .map(({ source }) => source)
    .join("\n");
  const deathMarkers = [
    "DebateTree", "ArgumentFocusView", "DebateOutline", "listDebates", "ScoringRefreshState",
    "indexScoringResponse", "force_refresh", "DIALECTICAL_COORDINATOR_URL", "/api/debates"
  ];
  const deathListReachable = deathMarkers.filter((marker) => reachableText.includes(marker));
  return {
    contractVersion: inventory.contractVersion,
    servedWithoutConsumer,
    consumedWithoutServed,
    eventsWithoutConsumer,
    deathListReachable
  };
}

const productionEntryPointFiles = [
  "apps/api/src/main.ts",
  "apps/runner/src/main.ts",
  "apps/scheduler/src/cli.ts",
  "acceptance/review-catch-up.ts"
] as const;

type CallableDeclaration = {
  readonly id: string;
  readonly callName: string;
  readonly body: string;
};

function maskNonCode(source: string): string {
  const output = [...source];
  let quote: "'" | "\"" | "`" | null = null;
  let lineComment = false;
  let blockComment = false;
  let regexLiteral = false;
  let regexCharacterClass = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index]!;
    const next = source[index + 1];
    if (lineComment) {
      if (current === "\n") lineComment = false;
      else output[index] = " ";
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        output[index] = " ";
        output[index + 1] = " ";
        blockComment = false;
        index += 1;
      } else if (current !== "\n") output[index] = " ";
      continue;
    }
    if (regexLiteral) {
      if (current !== "\n") output[index] = " ";
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === "[") regexCharacterClass = true;
      else if (current === "]") regexCharacterClass = false;
      else if (current === "/" && !regexCharacterClass) regexLiteral = false;
      continue;
    }
    if (quote !== null) {
      if (current !== "\n") output[index] = " ";
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === quote) quote = null;
      continue;
    }
    if (current === "/" && next === "/") {
      output[index] = " ";
      output[index + 1] = " ";
      lineComment = true;
      index += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      output[index] = " ";
      output[index + 1] = " ";
      blockComment = true;
      index += 1;
      continue;
    }
    if (current === "/") {
      let previousIndex = index - 1;
      while (previousIndex >= 0 && /\s/.test(output[previousIndex]!)) previousIndex -= 1;
      const previous = previousIndex < 0 ? null : output[previousIndex]!;
      if (previous === null || /[=(:,;!&|?{}\[]/.test(previous)) {
        output[index] = " ";
        regexLiteral = true;
        regexCharacterClass = false;
        escaped = false;
        continue;
      }
    }
    if (current === "'" || current === "\"" || current === "`") {
      output[index] = " ";
      quote = current;
    }
  }
  return output.join("");
}

function matchingBrace(source: string, openIndex: number): number | null {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

function braceDepthAt(source: string, start: number, index: number): number {
  let depth = 0;
  for (let cursor = start; cursor < index; cursor += 1) {
    if (source[cursor] === "{") depth += 1;
    else if (source[cursor] === "}") depth -= 1;
  }
  return depth;
}

function callableDeclarations(source: string): readonly CallableDeclaration[] {
  const masked = maskNonCode(source);
  const declarations: CallableDeclaration[] = [];
  const topLevelDeclarations = [...masked.matchAll(/\b(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/g)];
  for (const match of topLevelDeclarations.filter((candidate) => /\bfunction\b/.test(candidate[0]))) {
    const name = match[1]!;
    const next = topLevelDeclarations.find((candidate) => candidate.index > match.index);
    declarations.push({ id: name, callName: name, body: masked.slice(match.index + match[0].length, next?.index) });
  }
  for (const classMatch of masked.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)[^\{;]*\{/g)) {
    const className = classMatch[1]!;
    const classOpen = classMatch.index + classMatch[0].lastIndexOf("{");
    const classClose = matchingBrace(masked, classOpen);
    if (classClose === null) continue;
    const classBody = masked.slice(classOpen + 1, classClose);
    const methodPattern = /(?:^|\n)\s*(?:(?:public|private|protected|static|readonly|async|override)\s+)*(constructor|[A-Za-z_$][\w$]*)\s*(?:<[^\n{};]*>)?\s*\(/g;
    const methods = [...classBody.matchAll(methodPattern)]
      .filter((methodMatch) => braceDepthAt(classBody, 0, methodMatch.index) === 0)
      .filter((methodMatch) => !["if", "for", "while", "switch", "catch"].includes(methodMatch[1]!));
    for (let methodIndex = 0; methodIndex < methods.length; methodIndex += 1) {
      const methodMatch = methods[methodIndex]!;
      const methodName = methodMatch[1]!;
      declarations.push({
        id: `${className}.${methodName}`,
        callName: methodName === "constructor" ? className : methodName,
        body: classBody.slice(methodMatch.index + methodMatch[0].length, methods[methodIndex + 1]?.index)
      });
    }
  }
  return declarations;
}

export async function auditSurfaceReachability(): Promise<{
  readonly declaredEntryPointFiles: readonly string[];
  readonly declaredCallables: readonly string[];
  readonly reachableCallables: readonly string[];
  readonly declarationsChecked: number;
  readonly blocking: readonly string[];
}> {
  const productionFiles = withoutUiSurface([
    ...await sourceFiles(join(root, "packages")),
    ...await sourceFiles(join(root, "apps"))
  ]);
  const declarations = new Map<string, CallableDeclaration>();
  const byCallName = new Map<string, string[]>();
  for (const path of productionFiles) {
    const source = await readFile(path, "utf8");
    for (const declaration of callableDeclarations(source)) {
      declarations.set(declaration.id, declaration);
      const matches = byCallName.get(declaration.callName) ?? [];
      matches.push(declaration.id);
      byCallName.set(declaration.callName, matches);
    }
  }

  const referencedDeclarations = (source: string, currentId?: string): readonly string[] => {
    const referenced = new Set<string>();
    const constructedVariables = new Map<string, string>();
    for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
      constructedVariables.set(match[1]!, match[2]!);
    }
    for (const [variable, className] of constructedVariables) {
      const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (const match of source.matchAll(new RegExp(`\\b${escaped}\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(`, "g"))) {
        const exact = `${className}.${match[1]!}`;
        if (declarations.has(exact)) referenced.add(exact);
      }
    }
    for (const match of source.matchAll(/\bnew\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
      for (const id of byCallName.get(match[1]!) ?? []) {
        if (id.endsWith(".constructor")) referenced.add(id);
      }
    }
    const currentClass = currentId?.includes(".") === true ? currentId.slice(0, currentId.indexOf(".")) : null;
    if (currentClass !== null) {
      for (const match of source.matchAll(/\bthis\s*\.\s*#?([A-Za-z_$][\w$]*)\s*\(/g)) {
        const exact = `${currentClass}.${match[1]!}`;
        if (declarations.has(exact)) referenced.add(exact);
      }
    }
    for (const match of source.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = match[1]!;
      if (["if", "for", "while", "switch", "catch"].includes(name)) continue;
      if (declarations.has(name)) referenced.add(name);
      const candidates = byCallName.get(name) ?? [];
      if (candidates.length === 1) referenced.add(candidates[0]!);
    }
    return [...referenced];
  };

  const blocking: string[] = [];
  const pending: string[] = [];
  for (const where of productionEntryPointFiles) {
    try {
      const source = maskNonCode(await readFile(join(root, where), "utf8"));
      pending.push(...referencedDeclarations(source));
    } catch {
      blocking.push(`declared production entry point is missing: ${where}`);
    }
  }

  const reachable = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const declaration = declarations.get(id);
    if (declaration === undefined) continue;
    pending.push(...referencedDeclarations(declaration.body, declaration.id));
  }
  return {
    declaredEntryPointFiles: productionEntryPointFiles,
    declaredCallables: [...declarations.keys()].sort(),
    reachableCallables: [...reachable].sort(),
    declarationsChecked: declarations.size,
    blocking
  };
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function maskSqlComments(source: string): string {
  return source
    .replace(/--[^\n]*/g, (comment) => " ".repeat(comment.length))
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

function constraintHasReplayGuard(source: string, index: number, name: string): boolean {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const before = source.slice(0, index);
  if (new RegExp(`\\bDROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+${escapedName}\\b`, "i").test(before)) {
    return true;
  }
  for (const block of source.matchAll(/\bDO\s+\$\$[\s\S]*?\$\$\s*;/gi)) {
    const start = block.index;
    const end = start + block[0].length;
    if (index < start || index >= end) continue;
    return /\bIF\s+NOT\s+EXISTS\b/i.test(block[0])
      && new RegExp(`['"]${escapedName}['"]`, "i").test(block[0]);
  }
  return false;
}

export function auditMigrationReplaySafety(name: string, source: string): readonly string[] {
  const findings: string[] = [];
  const sql = maskSqlComments(source);
  for (const match of sql.matchAll(/\bADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS\b)/gi)) {
    findings.push(`${name}:${lineAt(source, match.index)} has bare ADD COLUMN without IF NOT EXISTS`);
  }
  for (const match of sql.matchAll(/\bADD\s+CONSTRAINT\s+([A-Za-z_][\w$]*)/gi)) {
    const constraint = match[1]!;
    if (!constraintHasReplayGuard(sql, match.index, constraint)) {
      findings.push(`${name}:${lineAt(source, match.index)} has unguarded ADD CONSTRAINT ${constraint}`);
    }
  }
  for (const match of sql.matchAll(/\bCREATE\s+FUNCTION\b/gi)) {
    findings.push(`${name}:${lineAt(source, match.index)} has bare CREATE FUNCTION without OR REPLACE`);
  }
  for (const match of sql.matchAll(/\bCREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS\b)/gi)) {
    const kind = match[1] === undefined ? "CREATE INDEX" : "CREATE UNIQUE INDEX";
    findings.push(`${name}:${lineAt(source, match.index)} has bare ${kind} without IF NOT EXISTS`);
  }
  return findings;
}

export function auditSurfaceAttachmentLiterals(name: string, source: string): readonly string[] {
  return [...source.matchAll(/attachment:\s*"(?:ATTACHED|UNATTACHED)"\s*,/g)]
    .map((match) => `${name}:${lineAt(source, match.index)} hand-authors s*Surface attachment instead of deriving production reachability`);
}

export async function auditSourceRules(): Promise<{ readonly blocking: readonly string[] }> {
  const blocking: string[] = [];
  const engineFiles = withoutUiSurface([
    ...await sourceFiles(join(root, "packages")),
    ...await sourceFiles(join(root, "apps")),
    ...await sourceFiles(join(root, "tools"))
  ]);
  let gatewayDeclarations = 0;
  for (const path of engineFiles) {
    const source = await readFile(path, "utf8");
    const where = relative(root, path);
    gatewayDeclarations += source.match(/interface\s+ProviderGateway\b/g)?.length ?? 0;
    if (source.includes(["process", "env"].join(".")) && where !== "packages/register/src/runtime-environment.ts") {
      blocking.push(`${where} reads the process environment outside the register loader`);
    }
    if ((where.startsWith("packages/propagation/") || where.startsWith("packages/battery/decision/")) && /from\s+["'](?:node:|pg|drizzle|@debateai\/db)/.test(source)) {
      blocking.push(`${where} imports an impure dependency`);
    }
    if (where.startsWith("packages/battery/decision/")) {
      for (const imported of source.matchAll(/from\s+["']([^"']+)["']/g)) {
        if (imported[1] !== "@debateai/kernel") {
          blocking.push(`${where} imports ${imported[1]} but battery/decision may import kernel only`);
        }
      }
    }
    if ((where.startsWith("packages/propagation/") || where.startsWith("packages/battery/decision/")) && /\b(?:Date\s*\(|new\s+Date|Math\.random|performance\.now|randomUUID)\b/.test(source)) {
      blocking.push(`${where} reads a clock or randomness inside the pure core`);
    }
    if (/from\s+["'][^"']*(?:tests?|fixtures?)[^"']*["']/.test(source)) {
      blocking.push(`${where} imports a test/fixture module from production code`);
    }
    if (/switch\s*\(/.test(source) && (!/default\s*:/.test(source) || !/exhaustive\s*\(/.test(source))) {
      blocking.push(`${where} has a switch without default + exhaustive fall-through`);
    }
    if (/export\s+const\s+[A-Z][A-Z0-9_]*\s*=\s*-?\d+(?:\.\d+)?\s*[;\n]/.test(source) && !where.startsWith("packages/published-arithmetic/")) {
      blocking.push(`${where} exports a numeric source literal instead of a register/law carrier`);
    }
  }
  const reachability = await auditSurfaceReachability();
  blocking.push(...reachability.blocking);
  const auditSource = await readFile(join(root, "tools/orphan-audit/src/index.ts"), "utf8");
  blocking.push(...auditSurfaceAttachmentLiterals("tools/orphan-audit/src/index.ts", auditSource));
  const migrationsDirectory = join(root, "migrations");
  for (const name of (await readdir(migrationsDirectory)).filter((entry) => entry.endsWith(".sql")).sort()) {
    const source = await readFile(join(migrationsDirectory, name), "utf8");
    blocking.push(...auditMigrationReplaySafety(`migrations/${name}`, source));
  }
  await auditOrphans();
  if (gatewayDeclarations !== 1) blocking.push(`ProviderGateway declaration count is ${gatewayDeclarations}, expected 1`);
  return { blocking };
}

type SurfaceDeclaration = {
  readonly package: string;
  readonly evidence: string;
};

const surfaceReachabilityTargetOverrides: Readonly<Record<string, string>> = Object.freeze({
  "packages/valuation.ValuationRepository": "ValuationRepository.recordOverlay",
  "packages/critique.CritiqueRepository": "CritiqueRepository.recordCritiquePacket",
  "packages/serve.ServeRepository.persist.conditionMarks": "ServeRepository.persist"
});

export function surfaceReachabilityTarget(packageName: string): string {
  const override = surfaceReachabilityTargetOverrides[packageName];
  if (override !== undefined) return override;
  const segments = packageName.split(".");
  const classIndex = segments.findIndex((segment) => /^[A-Z]/.test(segment));
  if (classIndex >= 0 && segments[classIndex + 1] !== undefined) {
    return `${segments[classIndex]}.${segments[classIndex + 1]}`;
  }
  return segments.at(-1)!;
}

function deriveSurfaceRows(
  declarations: readonly SurfaceDeclaration[],
  reachableCallables: ReadonlySet<string>
): readonly (SurfaceDeclaration & { readonly attachment: "ATTACHED" | "UNATTACHED" })[] {
  return declarations.map((declaration) => Object.freeze({
    package: declaration.package,
    attachment: reachableCallables.has(surfaceReachabilityTarget(declaration.package)) ? "ATTACHED" : "UNATTACHED",
    evidence: declaration.evidence
  }));
}

export async function auditOrphans(): Promise<{
  readonly entryPoints: readonly string[];
  readonly neverCalled: readonly { readonly package: string; readonly reason: string }[];
  readonly s04Surface: readonly {
    readonly package: string;
    readonly attachment: "ATTACHED" | "UNATTACHED";
    readonly evidence: string;
  }[];
  readonly s05Surface: readonly {
    readonly package: string;
    readonly attachment: "ATTACHED" | "UNATTACHED";
    readonly evidence: string;
  }[];
  readonly s06Surface: readonly {
    readonly package: string;
    readonly attachment: "ATTACHED" | "UNATTACHED";
    readonly evidence: string;
  }[];
  readonly s07Surface: readonly {
    readonly package: string;
    readonly attachment: "ATTACHED" | "UNATTACHED";
    readonly evidence: string;
  }[];
  readonly s08Surface: readonly {
    readonly package: string;
    readonly attachment: "ATTACHED" | "UNATTACHED";
    readonly evidence: string;
  }[];
  readonly s09Surface: readonly {
    readonly package: string;
    readonly attachment: "ATTACHED" | "UNATTACHED";
    readonly evidence: string;
  }[];
  readonly s10Surface: readonly {
    readonly package: string;
    readonly attachment: "ATTACHED" | "UNATTACHED";
    readonly evidence: string;
  }[];
  readonly s11Surface: readonly {
    readonly package: string;
    readonly attachment: "ATTACHED" | "UNATTACHED";
    readonly evidence: string;
  }[];
  readonly s12Surface: readonly {
    readonly package: string;
    readonly attachment: "ATTACHED" | "UNATTACHED";
    readonly evidence: string;
  }[];
  readonly s13Surface: readonly {
    readonly package: string;
    readonly attachment: "ATTACHED" | "UNATTACHED";
    readonly evidence: string;
  }[];
  readonly deferredGates: readonly {
    readonly fixture: "FX-DEF-01" | "FX-DEF-02";
    readonly status: "NOT_SHIPPED";
    readonly evidence: string;
  }[];
  readonly advisory: readonly { readonly fixture: string; readonly finding: string }[];
}> {
  const reachability = await auditSurfaceReachability();
  if (reachability.blocking.length > 0) {
    throw new Error(`Surface reachability audit failed: ${reachability.blocking.join("; ")}`);
  }
  const reachableCallables = new Set(reachability.reachableCallables);
  const report = {
    entryPoints: [
      "apps/api:POST /v1/asks",
      "apps/api:GET /v1/session",
      "apps/api:GET /v1/runs/:id/events",
      "apps/runner:Hatchet walking-skeleton task",
      "apps/scheduler:job:replay-self-test",
      "apps/scheduler:job:liveness-sweep",
      "apps/scheduler:job:reaper (stub; invocation throws SCAFFOLD_ONLY)",
      "apps/scheduler:job:settlement-watch",
      "acceptance:job:review-catch-up"
    ],
    neverCalled: [
      { package: "packages/kernel.exhaustive", reason: "closed-switch fall-through carrier is present; the S00 runtime path has no switch" },
      { package: "packages/graph.constructEdge", reason: "S02 exposes the pure construction seam, but its current callers are test fixtures; the first production caller belongs to a later graph-construction slice" },
      { package: "packages/judgement.runJudgePanel", reason: "S04 proves the P15 panel bulkhead in the pure surface; the current production shell is honestly single-judge until panel routing is composed" },
      { package: "packages/judgement.measureDispersion", reason: "S04 proves typed dispersion at two judgements; the current single-judge production shell persists null" },
      { package: "packages/judgement.applyCorrelatedErrorDiscount", reason: "S04 proves first-appearance family discounting; production attachment waits for multi-member routing" },
      { package: "packages/judgement.applyDeclaredDisagreement", reason: "S04 proves declared disagreement decisions in the pure surface; the single-judge production shell records truthful NOT_MEASURED instead" },
      { package: "packages/judgement.createTypedNonAnswer", reason: "S04 enforces spec section 12.3 at the pure seam; ignorance-ledger production attachment belongs to the serving shell" },
      { package: "packages/serve.projectProvenance", reason: "DR-081 layer projection is pure and test-covered; the S14 enriched provenance read owns its production attachment once V supplies the flip row" },
      { package: "packages/battery/decision.decideSplitClassification", reason: "callers are test fixtures; production SPLIT-loop attachment belongs to a later runner slice." },
      { package: "packages/ledger.LedgerRepository.recordDecision", reason: "callers are test fixtures; production SPLIT-loop attachment belongs to a later runner slice." },
      { package: "packages/graph.GraphWriter.spawnPendingChild", reason: "callers are test fixtures; production SPLIT-loop attachment belongs to a later runner slice." },
      { package: "packages/valuation.resolveDeepeningReentry", reason: "callers are test fixtures; production SPLIT-loop attachment belongs to a later runner slice." },
      { package: "packages/battery/decision.certifyDefeaterCompleteness", reason: "callers are test fixtures; production SPLIT-loop attachment belongs to a later runner slice." },
      { package: "packages/battery/decision.resolveRegeneration", reason: "callers are test fixtures; production SPLIT-loop attachment belongs to a later runner slice." },
      { package: "packages/battery/decision.selectRivalCarver", reason: "callers are test fixtures; production SPLIT-loop attachment belongs to a later runner slice." },
      { package: "packages/budget.compareConvergence", reason: "H8 comparison and typed non-comparison are test-covered; production convergence-loop attachment belongs to its later loop owner." },
      { package: "packages/register.readConvergenceControls", reason: "the ruled H8 register rows are typed and test-covered; production convergence-loop attachment belongs to its later loop owner." },
      { package: "apps/runner.WalkingSkeletonRunner.executeValueOverlay", reason: "the S10 value pipeline is staged behind this method, but no production task or route dispatches it; attachment belongs to the later value-serving composition." },
      { package: "packages/critique.planBlindVerification", reason: "callers are test fixtures; production CROSS-loop attachment belongs to a later runner composition." },
      { package: "packages/critique.computeSymmetryDiff", reason: "callers are test fixtures; production CROSS-loop attachment belongs to a later runner composition." },
      { package: "packages/critique.buildBlindedCritiquePacket", reason: "callers are test fixtures; the FAIR-01 counter leg deliberately records no packet (DR-141(4): a run carrying critique packets refuses at terminal until the Q42 recording migration is ruled); production CROSS-loop attachment follows that ruling." },
      { package: "packages/critique.computeIndependenceReceipt", reason: "callers are test fixtures; the FAIR-01 counter's independence is carried by recorded per-artifact maker lineage; the P18 receipt attaches with the ruled Q42 recording migration." },
      { package: "packages/critique.evaluateMakerAvailability", reason: "callers are test fixtures; production per-run maker reachability belongs to a later CROSS runner composition." },
      { package: "packages/critique.applyCriticUnavailableCap", reason: "callers are test fixtures; production DR-014 serving attachment belongs to a later CROSS runner composition." },
      { package: "packages/critique.deriveObjectionRecords", reason: "callers are test fixtures; production CROSS-loop attachment belongs to a later runner composition." },
      { package: "packages/critique.CritiqueRepository", reason: "callers are test fixtures; production CROSS-loop attachment follows the ruled Q42 recording migration (DR-141(4))." },
      { package: "packages/providers.selectProviderAdapter", reason: "callers are test fixtures; production configured-provider selection belongs to the provider composition slice." },
      { package: "packages/providers.VllmOpenAICompatibleProviderGateway", reason: "compiled adapter is present; production selection awaits the configured-provider register row." },
      { package: "apps/replay", reason: "S00 pins its isolated arithmetic surface; the launch ceremony closes in the deployment tail" },
      { package: "tools/acceptance-bundle", reason: "S00 scaffolds its read edges; S15 owns invocation" }
    ],
    s04Surface: deriveSurfaceRows([
      { package: "packages/judgement.runJudgePanel", evidence: "pure P15 bulkhead only; production runner is honestly single-judge" },
      { package: "packages/judgement.measureDispersion", evidence: "pure >=2-judgement measurement only; production single-judge path persists null" },
      { package: "packages/judgement.applyCorrelatedErrorDiscount", evidence: "pure multi-member family grouping only; no production panel routing exists" },
      { package: "packages/judgement.applyDeclaredDisagreement", evidence: "two-way declared predicate evaluation is pure-only; production single-judge path truthfully records NOT_MEASURED" },
      { package: "packages/judgement.createTypedNonAnswer", evidence: "pure spec section 12.3 enforcement only; serving-shell attachment remains later work" },
      { package: "packages/judgement.resolveClaimType", evidence: "Judge.judge calls the shared resolver for code-first then bounded model classification" }
    ], reachableCallables),
    s05Surface: deriveSurfaceRows([
      { package: "packages/serve.validateServeItems", evidence: "S14 execution-ledger digest validates database-derived per-node work state" },
      { package: "packages/serve.sanitizeServeItem", evidence: "S14 execution-ledger digest scrubs every projected work item before the wire" },
      { package: "packages/serve.reconcileServeItems", evidence: "S14 execution-ledger digest reconciles against the current node set" },
      { package: "packages/serve.deriveWorkReadState", evidence: "S14 execution read derives expired claims without writing; the reaper owns transition" },
      { package: "packages/serve.projectProvenance", evidence: "owner: S14 enriched provenance read after VG-02 flip supply" },
      { package: "packages/serve.deriveHonestVerdict", evidence: "ServeRepository.persist derives verdict_state versus verdict_unavailable" },
      { package: "packages/serve.foldServedNumberEvents", evidence: "ServeRepository.readAnswerProjection folds each current or sealed event stream" },
      { package: "packages/serve.deriveAnswerServeState", evidence: "ServeRepository.readAnswerProjection derives current versus sealed serve state" }
    ], reachableCallables),
    s06Surface: deriveSurfaceRows([
      { package: "packages/evidence.freezeQuerySet", evidence: "staged inside EvidenceRepository.recordFrozenQuerySet, but no declared production entry point reaches EvidenceRepository" },
      { package: "packages/evidence.createQueryAmendment", evidence: "staged inside EvidenceRepository.recordQueryAmendment, but no declared production entry point reaches EvidenceRepository" },
      { package: "packages/evidence.assessAdmissibility", evidence: "staged inside EvidenceRepository.recordEvidenceItem, but no declared production entry point reaches EvidenceRepository" },
      { package: "packages/evidence.deriveProvenanceClusterKey", evidence: "staged inside EvidenceRepository.recordEvidenceItem, but no declared production entry point reaches EvidenceRepository" },
      { package: "packages/evidence.evaluateFreshness", evidence: "staged inside EvidenceRepository.readFreshness, but no declared production entry point reaches EvidenceRepository" },
      { package: "packages/evidence.createEvidenceBaseScore", evidence: "staged inside EvidenceRepository.recordEvidenceItem, but no declared production entry point reaches EvidenceRepository" },
      { package: "packages/evidence.classifyCitationAttempt", evidence: "staged inside EvidenceRepository.recordCitationAttempt, but no declared production entry point reaches EvidenceRepository" },
      { package: "packages/evidence.evaluateEvidenceGate", evidence: "staged inside EvidenceRepository.recordShadowSuppression, but no declared production entry point reaches EvidenceRepository" },
      { package: "packages/evidence.certifyInstrument", evidence: "staged inside EvidenceRepository.recordInstrumentCertification, but no declared production entry point reaches EvidenceRepository" }
    ], reachableCallables),
    s07Surface: deriveSurfaceRows([
      { package: "packages/battery/decision.decideSplitClassification", evidence: "callers are test fixtures; production SPLIT-loop attachment belongs to a later runner slice." },
      { package: "packages/ledger.LedgerRepository.recordDecision", evidence: "callers are test fixtures; production SPLIT-loop attachment belongs to a later runner slice." },
      { package: "packages/graph.GraphWriter.spawnPendingChild", evidence: "callers are test fixtures; production SPLIT-loop attachment belongs to a later runner slice." },
      { package: "packages/graph.GraphRepository.readNodeLifecycleEvents", evidence: "PostgresAskApplication reaches the live fact projection through battery's SPLIT facade" },
      { package: "packages/db.RunRepository.drainWaitsForCompletion", evidence: "WalkingSkeletonRunner records terminal predicate transitions before serve writes TERMINAL" },
      { package: "packages/valuation.resolveDeepeningReentry", evidence: "callers are test fixtures; production SPLIT-loop attachment belongs to a later runner slice." }
    ], reachableCallables),
    s08Surface: deriveSurfaceRows([
      { package: "packages/critique.assertMakerAdmission", evidence: "PostgresAskApplication refuses standard-or-above admission before run creation" },
      { package: "packages/critique.readDeploymentMakerCapability", evidence: "API composition root validates the register-backed provider set at launch and reads it again on admission" },
      { package: "packages/critique.planBlindVerification", evidence: "callers are test fixtures; production CROSS-loop attachment belongs to a later runner composition." },
      { package: "packages/critique.computeSymmetryDiff", evidence: "callers are test fixtures; production CROSS-loop attachment belongs to a later runner composition." },
      { package: "packages/critique.buildBlindedCritiquePacket", evidence: "callers are test fixtures; the FAIR-01 counter records no packet under DR-141(4)'s Q42 refusal law." },
      { package: "packages/critique.computeIndependenceReceipt", evidence: "callers are test fixtures; FAIR-01 independence is carried by recorded per-artifact maker lineage." },
      { package: "packages/critique.evaluateMakerAvailability", evidence: "callers are test fixtures; production per-run reachability belongs to a later CROSS runner composition." },
      { package: "packages/critique.applyCriticUnavailableCap", evidence: "callers are test fixtures; production DR-014 serving attachment belongs to a later CROSS runner composition." },
      { package: "packages/critique.deriveObjectionRecords", evidence: "callers are test fixtures; production CROSS-loop attachment belongs to a later runner composition." },
      { package: "packages/critique.CritiqueRepository", evidence: "callers are test fixtures; production CROSS-loop attachment follows the ruled Q42 recording migration." }
    ], reachableCallables),
    s09Surface: deriveSurfaceRows([
      { package: "packages/budget.decideBudgetPressure", evidence: "WalkingSkeletonRunner evaluates the pinned run basis before and after the serve model calls" },
      { package: "packages/budget.BudgetRepository.countRunModelAttempts", evidence: "runner and provider gateway fold MODEL_CALL facts from ledger.ledger_entry" },
      { package: "packages/register.resolveEffectiveRiskTier", evidence: "API composition resolves parent then run then deployment and only records a policy source when it raises" },
      { package: "packages/register.computeStructuralCeilingBasis", evidence: "API composition computes the run-total tripwire from exported engine facts and register-supplied bounds" },
      { package: "packages/serve.createEnvelopeExhaustedResult", evidence: "WalkingSkeletonRunner converts envelope exhaustion to components-only without a DEFECT mark" },
      { package: "packages/serve.ServeRepository.persist.conditionMarks", evidence: "typed S09 marks are inserted with non-empty affected-node links and projected by node inspection" },
      { package: "packages/budget.compareConvergence", evidence: "pure H8 comparison is test-covered; production convergence-loop attachment belongs to its later loop owner" },
      { package: "packages/register.readConvergenceControls", evidence: "typed mandatory readers are test-covered; no production convergence loop consumes them yet" }
    ], reachableCallables),
    s10Surface: deriveSurfaceRows([
      { package: "packages/valuation.buildValueOverlay", evidence: "pure overlay is test-covered and staged behind undispatched executeValueOverlay; production attachment belongs to a later value-serving composition" },
      { package: "packages/valuation.ValuationRepository", evidence: "repository methods are integration-tested but called only by undispatched executeValueOverlay; production attachment belongs to a later value-serving composition" },
      { package: "packages/valuation.serveMixedAnswer", evidence: "typed dual answer is test-covered but called only by undispatched executeValueOverlay; production attachment belongs to a later value-serving composition" }
    ], reachableCallables),
    s11Surface: deriveSurfaceRows([
      { package: "packages/liveness.LivenessRepository.recordQuery", evidence: "PostgresAskApplication records matching-question activity and revives archived graphs before accepting the next query" },
      { package: "packages/liveness.LivenessRepository.recordTriggerFired", evidence: "scheduler sweep detects recorded provider model-version transitions and appends the trigger, state, and stream events" },
      { package: "packages/liveness.LivenessRepository.detectProviderModelVersionTriggers", evidence: "scheduler sweep reads raw-artifact history and fires only real recorded model-version transitions" },
      { package: "packages/liveness.LivenessRepository.sweep", evidence: "scheduler liveness-sweep resolves the register policy and archives eligible graphs" },
      { package: "packages/liveness.foldStaleness", evidence: "ServeRepository derives current answer and node staleness on every read" },
      { package: "packages/liveness.planAffectedReassessment", evidence: "pure child-to-parent affected-set planner; watched-trigger execution owns its later model gateway composition" },
      { package: "packages/liveness.propagateAffectedNodes", evidence: "purely orchestrated callback seam is test-covered; watched-trigger execution owns its later model gateway composition" },
      { package: "packages/register.readLivenessPolicy", evidence: "scheduler refuses a liveness sweep without the versioned class member and provenance" }
    ], reachableCallables),
    s12Surface: deriveSurfaceRows([
      { package: "packages/settlement.deriveScorecardCell", evidence: "SettlementRepository folds accepted immutable outcomes into a frozen derivation" },
      { package: "packages/settlement.SettlementRepository.settle", evidence: "the separate scheduler settlement-watch dispatches resolver outcome envelopes into the repository" },
      { package: "apps/scheduler.runSettlementWatch", evidence: "the scheduler CLI publishes settlement-watch as an independently credentialed third job" }
    ], reachableCallables),
    s13Surface: deriveSurfaceRows([
      { package: "packages/memory.matchQuestionKeys", evidence: "MemoryRepository applies the ruled precision ladder to frozen keys" },
      { package: "packages/memory.MemoryRepository.recordQuestionAndMatch", evidence: "the API records and evaluates the per-asker question key after run creation" },
      { package: "packages/memory.MemoryRepository.readDisclosure", evidence: "the runner reads only persisted link, candidate, and pinned-pull facts into the serve bundle" },
      { package: "packages/memory.validateMemorySentence", evidence: "the runner validates the typed disclosure sentence before adding its reserved composition segment" },
      { package: "packages/memory.MemoryRepository.unlinkForAnswer", evidence: "the asker-owned unlink endpoint appends an UNLINKED event" },
      { package: "packages/memory.MemoryRepository.observeAnswerContradiction", evidence: "the runner compares served verdict facts and wakes the prior answer through a typed revision trigger" }
    ], reachableCallables),
    deferredGates: [
      { fixture: "FX-DEF-01", status: "NOT_SHIPPED", evidence: "citation routes ship; no citation hard-kill predicate, switch, enable key, or kill column exists" },
      { fixture: "FX-DEF-02", status: "NOT_SHIPPED", evidence: "UNCOVERED-SCOPE remains diagnostic-only; no coverage_passed field or serving gate exists" }
    ],
    advisory: [
      { fixture: "FX-ORPH-03", finding: "register-key reader audit is wired as advisory" },
      { fixture: "FX-ORPH-06", finding: "dead-cost indictment lane is wired as advisory" }
    ]
  } as const;
  const allSurfaceRows = [
    ...report.s04Surface,
    ...report.s05Surface,
    ...report.s06Surface,
    ...report.s07Surface,
    ...report.s08Surface,
    ...report.s09Surface,
    ...report.s10Surface,
    ...report.s11Surface,
    ...report.s12Surface,
    ...report.s13Surface
  ];
  const declaredCallables = new Set(reachability.declaredCallables);
  const missingTargets = allSurfaceRows
    .map((row) => surfaceReachabilityTarget(row.package))
    .filter((target) => !declaredCallables.has(target));
  if (missingTargets.length > 0) {
    throw new Error(`Surface reachability target has no production declaration: ${[...new Set(missingTargets)].join(", ")}`);
  }
  const reportDirectory = join(root, "reports");
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(join(reportDirectory, "orphan-audit.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

export const auditRootName = basename(dirname(root));
