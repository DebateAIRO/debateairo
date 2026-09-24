import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createScanner, SyntaxKind } from "typescript/unstable/ast";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const sourceRoot = resolve(root, "apps/observation-agent/src");

async function sourceInventory(directory = sourceRoot): Promise<ReadonlyMap<string, string>> {
  const result = new Map<string, string>();
  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) return visit(path);
      if (!entry.isFile() || !entry.name.endsWith(".ts")) return;
      result.set(path.slice(sourceRoot.length + 1), await readFile(path, "utf8"));
    }));
  }
  await visit(directory);
  return result;
}

type Token = Readonly<{ kind: SyntaxKind; text: string; value: string }>;

function sourceTokens(source: string): readonly Token[] {
  const scanner = createScanner(true, undefined, source);
  const tokens: Token[] = [];
  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    tokens.push(Object.freeze({ kind, text: scanner.getTokenText(), value: scanner.getTokenValue() }));
  }
  return Object.freeze(tokens);
}

function runtimeImports(source: string): readonly string[] {
  const tokens = sourceTokens(source);
  const imports: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.kind === SyntaxKind.ImportKeyword) {
      const next = tokens[index + 1];
      if (next?.kind === SyntaxKind.TypeKeyword) continue;
      if (next?.kind === SyntaxKind.StringLiteral) imports.push(next.value);
      if (next?.kind === SyntaxKind.OpenParenToken
        && tokens[index + 2]?.kind === SyntaxKind.StringLiteral) {
        imports.push(tokens[index + 2]!.value);
      }
      for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
        if (tokens[cursor]!.kind === SyntaxKind.SemicolonToken) break;
        if (tokens[cursor]!.kind === SyntaxKind.FromKeyword
          && tokens[cursor + 1]?.kind === SyntaxKind.StringLiteral) {
          imports.push(tokens[cursor + 1]!.value);
          break;
        }
      }
    }
    if (token.kind === SyntaxKind.ExportKeyword && tokens[index + 1]?.kind !== SyntaxKind.TypeKeyword) {
      for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
        if (tokens[cursor]!.kind === SyntaxKind.SemicolonToken) break;
        if (tokens[cursor]!.kind === SyntaxKind.FromKeyword
          && tokens[cursor + 1]?.kind === SyntaxKind.StringLiteral) {
          imports.push(tokens[cursor + 1]!.value);
          break;
        }
      }
    }
    if (token.kind === SyntaxKind.Identifier && token.value === "require"
      && tokens[index + 1]?.kind === SyntaxKind.OpenParenToken
      && tokens[index + 2]?.kind === SyntaxKind.StringLiteral) {
      imports.push(tokens[index + 2]!.value);
    }
  }
  return Object.freeze(imports);
}

function databaseCapabilities(path: string, source: string): readonly string[] {
  const found = new Set<string>();
  for (const imported of runtimeImports(source)) {
    if (imported === "pg" || imported.startsWith("pg/")) found.add(`${path}:pg-value-import`);
  }
  for (const token of sourceTokens(source)) {
    if (token.kind === SyntaxKind.Identifier) {
      if (/^(?:OBSERVATION_DATABASE_URL|databaseUrl|connectionString)$/u.test(token.value)) {
        found.add(`${path}:connection-string-capability`);
      }
      if (/^(?:createPool|createClient|poolFactory|clientFactory)$/u.test(token.value)) {
        found.add(`${path}:database-factory-capability`);
      }
    }
  }
  return Object.freeze([...found].sort());
}

function resolveRuntimeImport(
  from: string,
  specifier: string,
  sources: ReadonlyMap<string, string>
): string | null {
  if (!specifier.startsWith(".")) return null;
  const joined = posix.normalize(posix.join(posix.dirname(from), specifier));
  const candidates = joined.endsWith(".js")
    ? [`${joined.slice(0, -3)}.ts`]
    : [joined, `${joined}.ts`, posix.join(joined, "index.ts")];
  return candidates.find((candidate) => sources.has(candidate)) ?? null;
}

function walkDaemonGraph(
  sources: ReadonlyMap<string, string>,
  roots: readonly string[]
): Readonly<{
  files: readonly string[];
  violations: readonly string[];
}> {
  const pending = [...roots];
  const files = new Set<string>();
  const violations = new Set<string>();
  while (pending.length > 0) {
    const path = pending.pop()!;
    if (files.has(path)) continue;
    files.add(path);
    if (path.split("/").includes("oactl")) violations.add(`${path}:command-only-import`);
    const source = sources.get(path);
    if (source === undefined) {
      violations.add(`${path}:missing-source`);
      continue;
    }
    for (const violation of databaseCapabilities(path, source)) violations.add(violation);
    for (const specifier of runtimeImports(source)) {
      const resolved = resolveRuntimeImport(path, specifier, sources);
      if (resolved !== null) pending.push(resolved);
    }
  }
  return Object.freeze({ files: Object.freeze([...files].sort()), violations: Object.freeze([...violations].sort()) });
}

function daemonRoots(sources: ReadonlyMap<string, string>): readonly string[] {
  return Object.freeze([...sources.keys()]
    .filter((path) => path.startsWith("modules/") && path.endsWith("/module.ts"))
    .filter((path) => !path.split("/").includes("oactl"))
    .sort());
}

type SourceRecord = Readonly<{
  path: string;
  source: string;
}>;

describe("OBS-01 launchd custody and runtime bounds", () => {
  it("ships a persistent launchd template and a credential-checking exec shell", async () => {
    const plistPath = resolve(
      root, "deploy/observation-agent/launchd/com.dialectical-engine.observation-agent.plist"
    );
    const launchPath = resolve(root, "apps/observation-agent/bin/launch.sh");
    const [plist, launch] = await Promise.all([
      readFile(plistPath, "utf8"),
      readFile(launchPath, "utf8")
    ]);
    expect(plist).toContain("com.dialectical-engine.observation-agent");
    expect(plist).toContain("<key>RunAtLoad</key>");
    expect(plist).toContain("<key>KeepAlive</key>");
    expect(plist).toContain("<integer>10</integer>");
    expect(plist).toContain("__OBSERVATION_LAUNCH_SCRIPT__");
    expect(plist).toContain("__OBSERVATION_STATE_DIR__");
    expect(launch).toMatch(/stat -f ['"]%Lp['"]/u);
    expect(launch).toMatch(/stat -f ['"]%u['"]/u);
    expect(launch).toContain("0600");
    expect(launch).toMatch(/\[\[ "\$mode" != "600" \]\]/u);
    expect(launch).toMatch(/\[\[ "\$owner" != "\$\(id -u\)" \]\]/u);
    expect(launch).toContain('cd "$repo_root"');
    // DL7-F5: the runtime is deduced by name and PROVEN to be a program before
    // exec, so the entrypoint is reached through the verified path and never
    // through a bare `node` the shell would re-run as a script on ENOEXEC.
    // The guard itself is pinned in obs-agent-dl7-f5-launcher.test.ts.
    expect(launch).toContain('exec "$node_bin" --import tsx apps/observation-agent/src/main.ts');
    expect((await stat(launchPath)).mode & 0o111).not.toBe(0);
  });

  it("keeps runtime resource and shutdown constraints explicit and has no sidecar", async () => {
    const [main, database, heartbeat, thresholds, packageSource, coreModule] = await Promise.all([
      readFile(resolve(root, "apps/observation-agent/src/main.ts"), "utf8"),
      readFile(resolve(root, "apps/observation-agent/src/core/database.ts"), "utf8"),
      readFile(resolve(root, "apps/observation-agent/src/modules/self/heartbeat.ts"), "utf8"),
      readFile(resolve(root, "deploy/observation-agent/thresholds/defaults/OBS-01.json"), "utf8"),
      readFile(resolve(root, "apps/observation-agent/package.json"), "utf8"),
      readFile(resolve(root, "apps/observation-agent/src/modules/core-liveness/module.ts"), "utf8")
    ]);
    expect(main).toContain("loadObservationAgentEnvironment");
    expect(database).toContain("max: Math.min(2, input.policy.value.resources.max_database_sessions)");
    expect(main).toContain("process.on(\"SIGTERM\"");
    expect(main).toContain("setInterval");
    expect(heartbeat).toContain("SET statement_timeout = 2000");
    const policy = JSON.parse(thresholds) as Record<string, unknown>;
    expect(policy).toMatchObject({
      liveness: { probe_interval_ms: 5_000, probe_timeout_ms: 2_000 },
      resources: {
        cpu_percent_max: 2, rss_mb_max: 150,
        max_database_sessions: 2, statement_timeout_ms: 2_000
      }
    });
    expect(packageSource).not.toContain("observation-agent.state");
    expect(coreModule).toContain("runCoreLivenessProbes");
    expect(coreModule).not.toContain("async probe() { return Object.freeze([]); }");
    await expect(stat(resolve(root, "apps/observation-agent/observation-agent.state")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("owns exactly one ended bootstrap pool and one max-two daemon pool", async () => {
    const [main, database] = await Promise.all([
      readFile(resolve(root, "apps/observation-agent/src/main.ts"), "utf8"),
      readFile(resolve(root, "apps/observation-agent/src/core/database.ts"), "utf8")
    ]);
    expect(main.match(/new pg\.Pool\s*\(/gu)).toHaveLength(1);
    expect(database.match(/new pg\.Pool\s*\(/gu)).toHaveLength(1);
    const bootstrap = main.indexOf("const bootstrapPool = new pg.Pool({");
    const bootstrapEnd = main.indexOf("await bootstrapPool.end();", bootstrap);
    const daemon = main.indexOf("createObservationDaemonDatabase({", bootstrap);
    expect(bootstrap).toBeGreaterThanOrEqual(0);
    expect(main.slice(bootstrap, bootstrapEnd)).toMatch(/max:\s*1/u);
    expect(bootstrapEnd).toBeGreaterThan(bootstrap);
    expect(daemon).toBeGreaterThan(bootstrapEnd);
    expect(database).toContain(
      "max: Math.min(2, input.policy.value.resources.max_database_sessions)"
    );
  });

  it("keeps command-only database capabilities outside the daemon transitive graph", async () => {
    const sources = await sourceInventory();
    const graph = walkDaemonGraph(sources, daemonRoots(sources));
    expect(graph.violations).toEqual([]);
    expect([...sources.keys()]
      .filter((path) => path.startsWith("modules/") && path.split("/").includes("oactl"))
      .sort()).toEqual([
      "modules/job-witness/oactl/support/command.ts",
      "modules/job-witness/oactl/witness.ts",
      "modules/routing/oactl/ack.ts"
    ]);
    expect(runtimeImports(sources.get("modules/job-witness/oactl/witness.ts") ?? "")).toEqual([
      "./support/command.js"
    ]);
  });

  it("keeps the actual daemon discovery edge runtime-only and discovers verbs only on command demand", async () => {
    const [main, modulesSource, typesSource, commandsSource] = await Promise.all([
      readFile(resolve(sourceRoot, "main.ts"), "utf8"),
      readFile(resolve(sourceRoot, "core/modules.ts"), "utf8"),
      readFile(resolve(sourceRoot, "core/types.ts"), "utf8"),
      readFile(resolve(sourceRoot, "oactl/core/commands.ts"), "utf8")
    ]);
    expect(runtimeImports(main)).toContain("./core/modules.js");
    expect(main).toMatch(/await discoverObservationRuntimeModules\s*\(/u);
    expect(main).not.toContain("discoverObservationCommandVerbs");
    expect(modulesSource).not.toMatch(
      /OactlVerbContribution|moduleVerbFiles|\bverbs\s*:|join\([^)]*["']oactl["']/su
    );
    expect(modulesSource).not.toMatch(/detachUnsupportedInlineCommand|Reflect\.deleteProperty/u);
    expect(modulesSource.lastIndexOf("assertRuntimeModuleSources("))
      .toBeLessThan(modulesSource.lastIndexOf("await importDefault(modulePath)"));
    const productionSources = await sourceInventory(resolve(sourceRoot, "modules"));
    expect([...productionSources.entries()]
      .filter(([path]) => path.endsWith("/module.ts"))
      .filter(([, source]) => sourceTokens(source).some(
        (token) => token.kind === SyntaxKind.Identifier && token.value === "oactl"
      ))
      .map(([path]) => path)).toEqual([]);

    const modulesRoot = await mkdtemp(join(tmpdir(), "obs-runtime-discovery-"));
    const sentinel = globalThis as typeof globalThis & {
      __obsCommandDiscoverySentinel?: number;
    };
    sentinel.__obsCommandDiscoverySentinel = 0;
    try {
      const moduleRoot = join(modulesRoot, "sentinel");
      const modulePath = join(moduleRoot, "module.ts");
      await mkdir(join(moduleRoot, "oactl", "support"), { recursive: true });
      await writeFile(modulePath, `const manifest = {
        name: "sentinel",
        cadence: { intervalMs: 5000, timeoutMs: 2000 },
        async probe() { return []; }, samples() { return []; }, signals() { return []; }
      };
      export default manifest;\n`, "utf8");
      await writeFile(join(moduleRoot, "oactl", "support", "sentinel-helper.ts"), `
        globalThis.__obsCommandDiscoverySentinel = (globalThis.__obsCommandDiscoverySentinel ?? 0) + 1;
      `, "utf8");
      await writeFile(join(moduleRoot, "oactl", "inline-sentinel.ts"), `
        import "./support/sentinel-helper.js";
        export default { verb: "inline-sentinel", async run() { return 0; } };
      `, "utf8");

      const { discoverObservationRuntimeModules } = await import(
        "../../apps/observation-agent/src/core/modules.js"
      );
      const runtimeCatalog = await discoverObservationRuntimeModules(modulesRoot);
      expect(sentinel.__obsCommandDiscoverySentinel).toBe(0);
      expect(Reflect.has(runtimeCatalog, "verbs")).toBe(false);
      expect(Reflect.has(runtimeCatalog.modules[0]!, "oactl")).toBe(false);
      const daemonModuleNamespace = await import(pathToFileURL(modulePath).href) as Readonly<{
        default: Readonly<Record<string, unknown>>;
      }>;
      expect(Object.getOwnPropertyDescriptor(daemonModuleNamespace.default, "oactl")).toBeUndefined();

      const { discoverObservationCommandVerbs } = await import(
        "../../apps/observation-agent/src/oactl/core/commands.js"
      );
      const verbs = await discoverObservationCommandVerbs(modulesRoot);
      expect(verbs.map(({ verb }) => verb)).toEqual(["inline-sentinel"]);
      expect(sentinel.__obsCommandDiscoverySentinel).toBe(1);
      expect(typesSource).not.toMatch(/\boactl\s*\?:/u);
      expect(commandsSource).not.toMatch(/manifest\.oactl|importDefault\(modulePath\)/u);
    } finally {
      delete sentinel.__obsCommandDiscoverySentinel;
      await rm(modulesRoot, { recursive: true, force: true });
    }
  });

  it("rejects every inline oactl manifest shape before evaluating the runtime module", async () => {
    const { discoverObservationRuntimeModules } = await import(
      "../../apps/observation-agent/src/core/modules.js"
    );
    const sentinel = globalThis as typeof globalThis & {
      __obsRuntimeModuleEvaluationSentinel?: number;
      __obsInlineOactlInitializerSentinel?: number;
      __obsInlineOactlAccessorSentinel?: number;
    };
    const scratchRoots: string[] = [];
    const cases = Object.freeze([
      Object.freeze({
        name: "direct-property",
        before: "",
        member: `oactl: (() => {
          globalThis.__obsInlineOactlInitializerSentinel =
            (globalThis.__obsInlineOactlInitializerSentinel ?? 0) + 1;
          return [];
        })()`
      }),
      Object.freeze({
        name: "getter",
        before: "",
        member: `get oactl() {
          globalThis.__obsInlineOactlAccessorSentinel =
            (globalThis.__obsInlineOactlAccessorSentinel ?? 0) + 1;
          return [];
        }`
      }),
      Object.freeze({ name: "setter", before: "", member: "set oactl(_value) {}" }),
      Object.freeze({ name: "method", before: "", member: "oactl() { return []; }" }),
      Object.freeze({ name: "computed-getter", before: "", member: `get ["oactl"]() { return []; }` }),
      Object.freeze({ name: "computed-setter", before: "", member: `set ["oactl"](_value) {}` }),
      Object.freeze({ name: "computed-method", before: "", member: `["oactl"]() { return []; }` }),
      Object.freeze({ name: "string-property", before: "", member: `"oactl": []` }),
      Object.freeze({ name: "computed-property", before: "", member: `["oactl"]: []` }),
      Object.freeze({ name: "shorthand-property", before: "const oactl = [];", member: "oactl" })
    ]);
    try {
      for (const fixture of cases) {
        const modulesRoot = await mkdtemp(join(tmpdir(), `obs-inline-${fixture.name}-`));
        scratchRoots.push(modulesRoot);
        const moduleRoot = join(modulesRoot, fixture.name);
        await mkdir(moduleRoot, { recursive: true });
        sentinel.__obsRuntimeModuleEvaluationSentinel = 0;
        sentinel.__obsInlineOactlInitializerSentinel = 0;
        sentinel.__obsInlineOactlAccessorSentinel = 0;
        await writeFile(join(moduleRoot, "module.ts"), `
          globalThis.__obsRuntimeModuleEvaluationSentinel =
            (globalThis.__obsRuntimeModuleEvaluationSentinel ?? 0) + 1;
          ${fixture.before}
          export default {
            name: ${JSON.stringify(fixture.name)},
            cadence: { intervalMs: 5000, timeoutMs: 2000 },
            ${fixture.member},
            async probe() { return []; }, samples() { return []; }, signals() { return []; }
          };
        `, "utf8");

        const outcome = await discoverObservationRuntimeModules(modulesRoot)
          .then(() => "RESOLVED", (error: unknown) =>
            error !== null && typeof error === "object" && "code" in error
              ? error.code
              : "UNNORMALIZED");
        expect(sentinel.__obsInlineOactlInitializerSentinel, fixture.name).toBe(0);
        expect(sentinel.__obsInlineOactlAccessorSentinel, fixture.name).toBe(0);
        expect(sentinel.__obsRuntimeModuleEvaluationSentinel, fixture.name).toBe(0);
        expect(outcome, fixture.name).toBe("OBSERVATION_MODULE_INVALID");
      }

      const invalidRoot = await mkdtemp(join(tmpdir(), "obs-inline-parse-error-"));
      scratchRoots.push(invalidRoot);
      const invalidModuleRoot = join(invalidRoot, "parse-error");
      await mkdir(invalidModuleRoot, { recursive: true });
      await writeFile(join(invalidModuleRoot, "module.ts"), "export default { oactl: [;\n", "utf8");
      await expect(discoverObservationRuntimeModules(invalidRoot)).rejects.toMatchObject({
        code: "OBSERVATION_MODULE_INVALID"
      });
    } finally {
      delete sentinel.__obsRuntimeModuleEvaluationSentinel;
      delete sentinel.__obsInlineOactlInitializerSentinel;
      delete sentinel.__obsInlineOactlAccessorSentinel;
      await Promise.all(scratchRoots.map((path) => rm(path, { recursive: true, force: true })));
    }
  });

  it.each([
    Object.freeze({
      name: "identifier-computed",
      before: `const commandKey = "oactl";`,
      memberName: "[commandKey]"
    }),
    Object.freeze({
      name: "expression-computed",
      before: "",
      memberName: `['oa' + 'ctl']`
    })
  ])("rejects $name manifest members before eager evaluation", async (fixture) => {
    const { discoverObservationRuntimeModules } = await import(
      "../../apps/observation-agent/src/core/modules.js"
    );
    const modulesRoot = await mkdtemp(join(tmpdir(), `obs-inline-${fixture.name}-`));
    const sentinel = globalThis as typeof globalThis & {
      __obsComputedModuleEvaluationSentinel?: number;
      __obsComputedInitializerSentinel?: number;
    };
    sentinel.__obsComputedModuleEvaluationSentinel = 0;
    sentinel.__obsComputedInitializerSentinel = 0;
    try {
      const moduleRoot = join(modulesRoot, fixture.name);
      await mkdir(moduleRoot, { recursive: true });
      await writeFile(join(moduleRoot, "module.ts"), `
        globalThis.__obsComputedModuleEvaluationSentinel =
          (globalThis.__obsComputedModuleEvaluationSentinel ?? 0) + 1;
        function eagerCommandContribution() {
          globalThis.__obsComputedInitializerSentinel =
            (globalThis.__obsComputedInitializerSentinel ?? 0) + 1;
          return Object.freeze([{ verb: "forbidden", async run() { return 0; } }]);
        }
        ${fixture.before}
        export default {
          name: ${JSON.stringify(fixture.name)},
          cadence: { intervalMs: 5000, timeoutMs: 2000 },
          ${fixture.memberName}: eagerCommandContribution(),
          async probe() { return []; }, samples() { return []; }, signals() { return []; }
        };
      `, "utf8");

      const outcome = await discoverObservationRuntimeModules(modulesRoot)
        .then(() => "RESOLVED", (error: unknown) =>
          error !== null && typeof error === "object" && "code" in error
            ? error.code
            : "UNNORMALIZED");
      expect(sentinel.__obsComputedInitializerSentinel).toBe(0);
      expect(sentinel.__obsComputedModuleEvaluationSentinel).toBe(0);
      expect(outcome).toBe("OBSERVATION_MODULE_INVALID");
    } finally {
      delete sentinel.__obsComputedModuleEvaluationSentinel;
      delete sentinel.__obsComputedInitializerSentinel;
      await rm(modulesRoot, { recursive: true, force: true });
    }
  });

  it("rejects unknown own runtime manifest keys after import", async () => {
    const { discoverObservationRuntimeModules } = await import(
      "../../apps/observation-agent/src/core/modules.js"
    );
    const modulesRoot = await mkdtemp(join(tmpdir(), "obs-unknown-manifest-key-"));
    try {
      const moduleRoot = join(modulesRoot, "unknown-key");
      await mkdir(moduleRoot, { recursive: true });
      await writeFile(join(moduleRoot, "module.ts"), `
        export default {
          name: "unknown-key",
          cadence: { intervalMs: 5000, timeoutMs: 2000 },
          commandCapability: Object.freeze([{ verb: "forbidden", async run() { return 0; } }]),
          async probe() { return []; }, samples() { return []; }, signals() { return []; }
        };
      `, "utf8");

      const outcome = await discoverObservationRuntimeModules(modulesRoot)
        .then((catalog) => Object.keys(catalog.modules[0] ?? {}), (error: unknown) =>
          error !== null && typeof error === "object" && "code" in error
            ? error.code
            : "UNNORMALIZED");
      expect(outcome).toBe("OBSERVATION_MODULE_INVALID");
    } finally {
      await rm(modulesRoot, { recursive: true, force: true });
    }
  });

  it("rejects daemon imports of oactl and disguised database capabilities", () => {
    const cases: readonly SourceRecord[] = Object.freeze([
      Object.freeze({ path: "modules/alias/module.ts", source: "import { Pool as Sessions } from 'pg'; export default new Sessions();" }),
      Object.freeze({ path: "modules/factory/module.ts", source: "export default poolFactory({ max: 1 });" }),
      Object.freeze({ path: "modules/string/module.ts", source: "export default config.OBSERVATION_DATABASE_URL;" })
    ]);
    for (const fixture of cases) {
      const graph = walkDaemonGraph(new Map([[fixture.path, fixture.source]]), [fixture.path]);
      expect(graph.violations, fixture.path).not.toEqual([]);
    }
    const oactlImport = new Map([
      ["modules/negative/module.ts", "import helper from '../job-witness/oactl/support/command.js'; export default helper;"],
      ["modules/job-witness/oactl/support/command.ts", "export default Object.freeze({});"]
    ]);
    expect(walkDaemonGraph(oactlImport, ["modules/negative/module.ts"]).violations).toContain(
      "modules/job-witness/oactl/support/command.ts:command-only-import"
    );
  });

  it("fails configuration through one code path and contains no product lifecycle command", async () => {
    const [main, launchd, commands] = await Promise.all([
      readFile(resolve(root, "apps/observation-agent/src/main.ts"), "utf8"),
      readFile(resolve(root, "apps/observation-agent/src/oactl/core/launchd.ts"), "utf8"),
      readFile(resolve(root, "apps/observation-agent/src/oactl/core/commands.ts"), "utf8")
    ]);
    expect(main).toContain("normalizeObservationError");
    expect(main).toContain("exitCode = 2");
    const combined = `${launchd}\n${commands}`;
    expect(combined).not.toMatch(/docker[^\n]*(start|stop|restart|kill|rm|pause|compose)/u);
    expect(combined).not.toMatch(/(apps\/api|apps\/runner|apps\/ui|dev:auth:down)/u);
    expect(combined.match(/com\.dialectical-engine\.observation-agent/gu)?.length).toBeGreaterThan(0);
  });

  it("keeps durable routing and status collection in their required runtime order", async () => {
    const main = await readFile(resolve(root, "apps/observation-agent/src/main.ts"), "utf8");
    const replay = main.indexOf("const replayed = await replayObservationJournals(");
    const restore = main.indexOf("const moduleRuntime = new ObservationModuleRuntime(");
    const routerInitialization = main.indexOf("const initializedRouter = routerOwner");
    const startSignal = main.indexOf("await emit(makeSelfSignal(");
    expect(replay).toBeGreaterThanOrEqual(0);
    expect(restore).toBeGreaterThan(replay);
    expect(routerInitialization).toBeGreaterThanOrEqual(0);
    expect(routerInitialization).toBeGreaterThan(restore);
    expect(startSignal).toBeGreaterThan(routerInitialization);
    const emitStart = main.indexOf("async function emit(");
    const emitEnd = main.indexOf("const moduleRuntime", emitStart);
    const emit = main.slice(emitStart, emitEnd);
    expect(emit.indexOf("await persistSignal(")).toBeGreaterThanOrEqual(0);
    expect(emit.indexOf("await router.onSignal(")).toBeGreaterThan(
      emit.indexOf("await persistSignal(")
    );
    expect(main.match(/module: currentRouterModule\(\)/gu)).toHaveLength(2);

    const cycleStart = main.indexOf("async function cycle(");
    const cycleEnd = main.indexOf("async function shutdown(", cycleStart);
    const cycle = main.slice(cycleStart, cycleEnd);
    expect(cycle.indexOf("await initializedRouter.onTick(")).toBeGreaterThanOrEqual(0);
    expect(cycle.indexOf("initializedRouter.status()")).toBeGreaterThan(
      cycle.indexOf("await initializedRouter.onTick(")
    );
    expect(cycle.indexOf("await writeStatusSnapshot(")).toBeGreaterThan(
      cycle.indexOf("initializedRouter.status()")
    );
  });
});
