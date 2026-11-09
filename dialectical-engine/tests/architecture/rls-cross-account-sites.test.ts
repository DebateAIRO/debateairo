/**
 * Row-level security S01, cluster C4, step S4.5 (PLAN.md S4.3, S4.5; SPEC-v4 R19, R44; DECISIONS D36, D68, D70): the
 * cross-account sites of apps/api/src, by reader id, and the three targets main.ts gives its T1 pools.
 *
 * Inside a request a statement on a T1 pool runs as the T1 login with only the requester's rows visible; it reaches every
 * account only inside a `crossAccount("<id>", …)` frame or on `crossAccountPool(pool, "<id>")` (the pool's system
 * target). So the set of those sites IS the set of apps/api readers that see more than one account from inside a request:
 * a site unrouted, routed under the wrong id, or one added without a SPEC row changes what this file reads. Outside a
 * request a statement goes to the target `setCrossAccountTarget` gave the pool — so a pool left without one, or given it
 * after its first use, runs boot and background work on the T1 login with no account context. Parsed with the
 * TypeScript AST (typescript-classic), so a comment or a string naming a call does not count. FIX-S01-p1b (COR-B1): the
 * same rule sends a boot role check made on a T1 pool to its system login, so main.ts runs each one on both routes
 * (attestEveryRoute) and attests the logins themselves (assertAccountContextLogins); the two COR-B1 cases pin that wiring.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-classic";
import { describe, expect, it } from "vitest";

const PRODUCT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MAIN = "apps/api/src/main.ts";
const PREVIEW_BUDGET = "apps/api/src/preview-budget-estimate.ts";

/** PLAN S4.5, verbatim as a map: reader id → the apps/api/src files where its sites are. */
const EXPECTED_SITES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  X11: [MAIN],
  X14: [MAIN],
  X18h: [MAIN],
  X21: [PREVIEW_BUDGET],
  X27: [MAIN],
  X28: [MAIN],
  X30: [MAIN],
  X31: [MAIN],
  X32: [MAIN],
  X33: [MAIN],
  X37: [MAIN],
  X38: [MAIN]
});

/**
 * How many sites each id has (PLAN S4.3): X11 the NETOPIA intake's repository and jobs plus the billing runtime's pool;
 * X14 the three PostgresStaffRepository constructions and, since the security review (0171), the staff runtime's alert mapping pool; X18h the key store's owner lookup; X21 the gate's two reads; since
 * the merge onto synthesis-flag, X27 the staff threat report's recipient address reader and X28 the staff publication
 * review's repository and its two readers; since the security review (0171), X38 the Report button's settlement, after its
 * judge, and the writers of the site's day a request pays for, each the marker's alone: X30 the language check's probe and record,
 * X31 the question check's, X32 the clarify charge's (its reservation stays the request login's) and X33 the synthesis check's
 * record; and X37 the ask-time discovery's writer of a provider's probe, the marker's alone too (its reader stays the request pool's).
 * The file-level map alone cannot see a site added under an id already mapped to that file.
 */
const EXPECTED_SITE_COUNTS: Readonly<Record<string, number>> = Object.freeze({ X11: 3, X14: 4, X18h: 1, X21: 2, X27: 1, X28: 3, X30: 2,
  X31: 2, X32: 2, X33: 1, X37: 1, X38: 1 });

/** PLAN S4.3: main.ts's three `setCrossAccountTarget(pool, target)` calls, in this order. */
const EXPECTED_TARGETS = Object.freeze([
  ["pool", "systemPool"],
  ["legacyAskAdmissionPool", "systemPool"],
  ["authorizationPool", "authorizationSystemPool"]
]);

/** The three boot checks that run before the API listens, outside every request, and stay unwrapped (D29, D68). */
const BOOT_CHECKS = Object.freeze([
  "billing-other-system-records",
  "billing-records-dated-ahead",
  "billing-live-records-on-sandbox"
]);

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return /\.(?:ts|tsx|mts|cts)$/u.test(entry.name) && !/\.(?:test|spec)\.[cm]?tsx?$/u.test(entry.name)
      && !/\.d\.[cm]?ts$/u.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

async function parse(path: string): Promise<ts.SourceFile> {
  return ts.createSourceFile(path, await readFile(join(PRODUCT_ROOT, path), "utf8"), ts.ScriptTarget.Latest, true);
}

function descendants(root: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node): void => { found.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return found;
}

function callsOf(root: ts.Node, name: string): ts.CallExpression[] {
  return descendants(root).filter((node): node is ts.CallExpression =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name);
}

function newsOf(root: ts.Node, name: string): ts.NewExpression[] {
  return descendants(root).filter((node): node is ts.NewExpression =>
    ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name);
}

/** The `boot.run("<name>", …)` / `boot.runSync("<name>", …)` calls of a file, by name. */
function bootCalls(source: ts.SourceFile): Map<string, ts.CallExpression[]> {
  const byName = new Map<string, ts.CallExpression[]>();
  for (const node of descendants(source)) {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) continue;
    const { expression, name } = node.expression;
    const [first] = node.arguments;
    if (!ts.isIdentifier(expression) || expression.text !== "boot" || !["run", "runSync"].includes(name.text)) continue;
    if (first === undefined || !ts.isStringLiteralLike(first)) continue;
    byName.set(first.text, [...(byName.get(first.text) ?? []), node]);
  }
  return byName;
}

function enclosedBy(node: ts.Node, outer: ts.Node): boolean {
  return node.getStart() >= outer.getStart() && node.getEnd() <= outer.getEnd();
}

function enclosingFunctionName(node: ts.Node): string | null {
  for (let current: ts.Node | undefined = node.parent; current !== undefined; current = current.parent) {
    if ((ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) && current.name !== undefined) {
      return current.name.getText();
    }
  }
  return null;
}

/** The account-context wrapper a node runs inside: the call whose first argument (the callback) encloses it. */
function wrapperOf(node: ts.Node): string | null {
  for (let current: ts.Node | undefined = node.parent; current !== undefined; current = current.parent) {
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression)
      && ["attestEveryRoute", "onOwnConnections"].includes(current.expression.text)
      && current.arguments[0] !== undefined && enclosedBy(node, current.arguments[0])) return current.expression.text;
  }
  return null;
}

/** The names main.ts declares with `boot.hold(createPool(environment.<KEY>…))` for the URL keys `keys`, sorted. */
function poolsOn(source: ts.SourceFile, keys: readonly string[]): string[] {
  return descendants(source).filter((node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node)
    && node.initializer !== undefined
    && callsOf(node.initializer, "createPool").some((call) => keys.includes(call.arguments[0]?.getText().replace(/^environment\.|!$/gu, "") ?? "")))
    .map((declaration) => declaration.name.getText()).sort();
}

type Sites = Readonly<{ map: Record<string, string[]>; counts: Record<string, number>; unpinnable: string[] }>;

async function crossAccountSites(): Promise<Sites> {
  const files = (await sourceFiles(join(PRODUCT_ROOT, "apps/api/src"))).map((file) => relative(PRODUCT_ROOT, file)).sort();
  const map: Record<string, string[]> = {};
  const counts: Record<string, number> = {};
  const unpinnable: string[] = [];
  for (const path of files) {
    const source = await parse(path);
    for (const [name, position] of [["crossAccount", 0], ["crossAccountPool", 1]] as const) {
      for (const call of callsOf(source, name)) {
        const reader = call.arguments[position];
        if (reader === undefined || !ts.isStringLiteralLike(reader)) {
          unpinnable.push(`${path}:${source.getLineAndCharacterOfPosition(call.getStart()).line + 1}`);
          continue;
        }
        const list = (map[reader.text] ??= []);
        if (!list.includes(path)) list.push(path);
        counts[reader.text] = (counts[reader.text] ?? 0) + 1;
      }
    }
  }
  for (const list of Object.values(map)) list.sort();
  return { map, counts, unpinnable };
}

describe("row-level security S01 C4: the apps/api cross-account sites and the T1 pools' targets", () => {
  it("S4.5 every crossAccount(\"<id>\", …) and crossAccountPool(<pool>, \"<id>\") site in apps/api/src is exactly X11, X14, X18h, X27, X28, X30, X31, X32, X33, X37 and X38 in main.ts and X21 in preview-budget-estimate.ts, each id a literal, with 3, 4, 1, 1, 3, 2, 2, 2, 1, 1, 1 and 2 sites", async () => {
    const { map, counts, unpinnable } = await crossAccountSites();
    expect(unpinnable).toEqual([]);
    expect(map).toEqual(EXPECTED_SITES);
    expect(counts).toEqual(EXPECTED_SITE_COUNTS);
  });

  it("S4.3 (merge onto synthesis-flag) X27 is the staff threat report's recipient address reader and X28 the staff publication review's repository and both its readers, each the whole reader", async () => {
    const main = await parse(MAIN);
    const x27 = callsOf(main, "threatReportEmailReader").map((call) => call.arguments.map((argument) => argument.getText()));
    expect(x27).toEqual([['crossAccountPool(pool, "X27")', "dekStore"], ["pool", "dekStore", '"staff"']]);
    const service = callsOf(main, "createPublicationReviewStaffService");
    expect(service).toHaveLength(1);
    const options = service[0]!.arguments[0] as ts.ObjectLiteralExpression;
    const property = (name: string): string | undefined => options.properties
      .filter((member): member is ts.PropertyAssignment => ts.isPropertyAssignment(member))
      .find((member) => member.name.getText() === name)?.initializer.getText();
    expect(property("repository")).toBe('new PublicationReviewRepository(crossAccountPool(pool, "X28"))');
    // Each reader's whole body is the crossAccount("X28", …) frame, so every statement it awaits runs on the target.
    for (const name of ["readVerdictCategories", "readReviewBody"]) {
      expect(property(name), name).toMatch(/^\([^)]*\) => crossAccount\("X28", \(\) =>\s*application\.withContentLease\(/u);
    }
  });

  /**
   * The security review (0171, F5): the Report button's settlement records the judge's verdict and hides a public debate on AGREE, so it is the
   * cross-account marker's alone. The press calls it inside the reporter's request, after the judge, through its own port on the request pool's
   * system target; the target read and the opening stay on the request pool, under the reporter's session.
   */
  it("S4.3 (the security review) X38 is the Report button's settlement port, the press's one other repository is the request pool's", async () => {
    const main = await parse(MAIN);
    const objects = descendants(main).filter((node): node is ts.PropertyAssignment => ts.isPropertyAssignment(node) && node.name.getText() === "publicFlags")
      .map((assignment) => assignment.initializer).filter((value): value is ts.ObjectLiteralExpression => ts.isObjectLiteralExpression(value))
      .filter((value) => value.properties.some((member) => member.name?.getText() === "settlement"));
    expect(objects).toHaveLength(1);
    const property = (name: string): string | undefined => objects[0]!.properties
      .filter((member): member is ts.PropertyAssignment => ts.isPropertyAssignment(member))
      .find((member) => member.name.getText() === name)?.initializer.getText();
    expect(property("settlement")).toBe('new PostgresPublicFlagRepository(crossAccountPool(pool, "X38"))');
    expect(property("repository")).toBe("publicFlagRepository");
    const repository = descendants(main).filter((node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && node.name.getText() === "publicFlagRepository");
    expect(repository.map((declaration) => declaration.initializer?.getText())).toEqual(["new PostgresPublicFlagRepository(pool)"]);
  });

  /**
   * The security review (0171, F5): 0048's writer of a provider's probe is the cross-account marker's alone, as the API's ask-time discovery takes a
   * provider's latest row for healthy and probes only a stale one, so a request login dated rows as it liked. The discovery records each probe it makes,
   * inside the asking request, through the request pool's system target; it reads the latest rows on the request pool, as before.
   */
  it("S4.3 (the security review) X37 is the ask-time discovery's probe writer, and the discovery reads the latest probes on the request pool", async () => {
    const main = await parse(MAIN);
    const declared = (name: string): string[] => descendants(main)
      .filter((node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && node.name.getText() === name)
      .map((declaration) => declaration.initializer?.getText() ?? "");
    // The two repositories main.ts builds: the reader on the request pool, the writer on its X37 site, and no other.
    expect(newsOf(main, "ProviderProbeRepository").map((construction) => (construction.arguments ?? []).map((argument) => argument.getText())))
      .toEqual([["pool"], ['crossAccountPool(pool, "X37")']]);
    expect([declared("probeReader"), declared("probeRecorder")]).toEqual([["new ProviderProbeRepository(pool)"], ['new ProviderProbeRepository(crossAccountPool(pool, "X37"))']]);
    // The one store the discovery is handed reads through the reader and records through the writer.
    expect(declared("probes")).toEqual([
      "Object.freeze({\n  readLatest: (providerRefs) => probeReader.readLatest(providerRefs),\n  record: (observation) => probeRecorder.record(observation)\n})"]);
    const resolvers = callsOf(main, "createProviderDiscoveryResolver");
    expect(resolvers).toHaveLength(1);
    const options = resolvers[0]!.arguments[0] as ts.ObjectLiteralExpression;
    expect(options.properties.filter((member) => member.name?.getText() === "probes").map((member) => member.getText())).toEqual(["probes"]);
  });

  it("S4.5 main.ts's setCrossAccountTarget( calls are exactly pool→systemPool, legacyAskAdmissionPool→systemPool, authorizationPool→authorizationSystemPool, in that order, after the pool block's last createPool( and before any later statement that uses those pools", async () => {
    const source = await parse(MAIN);
    const targets = callsOf(source, "setCrossAccountTarget");
    expect(targets.map((call) => call.arguments.map((argument) => argument.getText()))).toEqual(EXPECTED_TARGETS);
    const statements = [...source.statements];
    const poolBlockEnd = statements.findIndex((statement) =>
      statement.getText().includes("createPool(environment.DATABASE_URL, API_DATABASE_POOLS.releaseWatch)"));
    expect(poolBlockEnd).toBeGreaterThan(0);
    const lastCreatePool = Math.max(...statements.map((statement, index) =>
      index <= poolBlockEnd && callsOf(statement, "createPool").length > 0 ? index : -1));
    expect(lastCreatePool).toBe(poolBlockEnd);
    const homes = targets.map((call) => statements.findIndex((statement) =>
      ts.isExpressionStatement(statement) && statement.expression === call));
    expect(homes.every((home) => home > poolBlockEnd)).toBe(true);
    const routed = new Set(EXPECTED_TARGETS.map(([pool]) => pool));
    const usesBefore = statements.slice(poolBlockEnd + 1, Math.max(...homes)).filter((statement, offset) =>
      !homes.includes(poolBlockEnd + 1 + offset)
      && descendants(statement).some((node) => ts.isIdentifier(node) && routed.has(node.text)));
    expect(usesBefore.map((statement) => statement.getText().slice(0, 80))).toEqual([]);
  });

  it("S4.5 main.ts's `new …Billing…(pool` constructions are exactly the three boot checks, one inside each of boot.run(\"billing-other-system-records\"), (\"billing-records-dated-ahead\") and (\"billing-live-records-on-sandbox\")", async () => {
    const source = await parse(MAIN);
    const text = source.getFullText();
    const matches = [...text.matchAll(/new \w*Billing\w*\(\s*pool\b/gu)].map((match) => match.index!);
    expect(matches).toHaveLength(3);
    const boots = bootCalls(source);
    for (const name of BOOT_CHECKS) {
      const calls = boots.get(name) ?? [];
      expect(calls, name).toHaveLength(1);
      const inside = matches.filter((index) => index >= calls[0]!.getStart() && index < calls[0]!.getEnd());
      expect(inside, name).toHaveLength(1);
    }
  });

  /**
   * FIX-S01-p1b, COR-B1 (t_25f52da5): a boot read that answers for the connection's OWN principal (a role check, a
   * capability probe) made on a T1 pool after its target is set reads the system login's catalog — outside a scope every
   * statement goes to the target. Derived, not listed: every call in main.ts of an `assert…DatabaseRole…` function,
   * every `.assertRole()` and the probes of the writers a request's paid calls use. Each runs inside attestEveryRoute (the
   * pool's own login, then its target — V-12: the recovery workers' background work runs on the target) or, for the
   * clarify charge's reservation, whose calls run inside requests only, onOwnConnections. The security review's 0171 made
   * the language check's, the question check's and the clarify charge's writers the cross-account marker's alone, so each
   * is probed on its site's pool (X30, X31, X32), the system login its record runs on, unwrapped.
   */
  it("COR-B1 every main.ts boot read that answers for the connection's own principal runs through attestEveryRoute — the reservation probe through onOwnConnections, the writer probes on their sites — 15 calls, 11 on a T1 pool", async () => {
    const source = await parse(MAIN);
    const found = descendants(source).filter((node): node is ts.CallExpression => ts.isCallExpression(node)).flatMap((call) => {
      const callee = call.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
      return /^assert\w*DatabaseRole\w*$/u.test(name) || name === "assertRole" || /^(?:languageCheckSpend|questionCheckSpend|askClarifyCharge)WriterPresent$/u.test(name)
        || name === "askClarifyReservationPresent" ? [`${call.getText()} @ ${wrapperOf(call) ?? "UNWRAPPED"}`] : [];
    });
    expect(found).toEqual([
      "assertAccountErasureDatabaseRole(pool,erasurePool) @ attestEveryRoute",
      "assertAccountErasureDatabaseRole(legacyAskAdmissionPool,erasurePool) @ attestEveryRoute",
      "assertPublicationDatabaseRoleSeparation(pool, authorizationPool) @ attestEveryRoute",
      "assertPublicationCleanupDatabaseRole(publicationCleanupPool) @ attestEveryRoute",
      "assertContentProvisionDatabaseRole(pool,contentProvisionPool) @ attestEveryRoute",
      "assertContentProvisionDatabaseRole(pool,serverAskAdmissionPool) @ attestEveryRoute",
      "assertDataExportDatabaseRoles(authorizationPool, dataExportPool) @ attestEveryRoute",
      // 0171: the language check's writer is the marker's, asked of its site's login (X30), where each check's record runs.
      'languageCheckSpendWriterPresent(crossAccountPool(pool, "X30")) @ UNWRAPPED',
      // Decisions 29 and 31: dynamic step 2 asks after 0144's writer on its site's login (X32), and after 0171's reservation on the request login.
      'askClarifyChargeWriterPresent(crossAccountPool(pool, "X32")) @ UNWRAPPED',
      "askClarifyReservationPresent(pool) @ onOwnConnections",
      "passwordResetRepository.assertRole() @ attestEveryRoute",
      "backupEmailRepository.assertRole() @ attestEveryRoute",
      "mfaRecoveryRepository.assertRole() @ attestEveryRoute",
      // 0171: the question check's writer is the marker's, asked of its site's login (X31), where each check's record runs.
      'questionCheckSpendWriterPresent(crossAccountPool(pool, "X31")) @ UNWRAPPED',
      "assertSupportDatabaseRole(pool, supportPool) @ attestEveryRoute"
    ]);
  });

  it("COR-B1 boot.run(\"account-context-logins\") calls assertAccountContextLogins once, after boot.run(\"database-roles\") and before the first register read, over every pool main.ts builds on a T1 URL (requestPools) and every pool it builds on a system URL (systemPools)", async () => {
    const source = await parse(MAIN);
    const boots = bootCalls(source);
    const stage = boots.get("account-context-logins") ?? [];
    expect(stage).toHaveLength(1);
    const calls = callsOf(stage[0]!, "assertAccountContextLogins");
    expect(calls).toHaveLength(1);
    const options = calls[0]!.arguments[0];
    expect(options !== undefined && ts.isObjectLiteralExpression(options)).toBe(true);
    const listed = (name: string): string[] => {
      const property = (options as ts.ObjectLiteralExpression).properties
        .find((member): member is ts.PropertyAssignment => ts.isPropertyAssignment(member) && member.name.getText() === name);
      return property !== undefined && ts.isArrayLiteralExpression(property.initializer)
        ? property.initializer.elements.map((element) => element.getText()).sort() : [];
    };
    const request = poolsOn(source, ["DATABASE_URL", "AUTHORIZATION_DATABASE_URL"]);
    const system = poolsOn(source, ["API_SYSTEM_DATABASE_URL", "API_AUTHORIZATION_SYSTEM_DATABASE_URL"]);
    expect({ request, system }).toEqual({
      request: ["authorizationPool", "legacyAskAdmissionPool", "pool", "releaseWatchPool"],
      system: ["authorizationSystemPool", "roomDecisionPool", "systemPool"]
    });
    expect({ requestPools: listed("requestPools"), systemPools: listed("systemPools") }).toEqual({ requestPools: request, systemPools: system });
    const roles = boots.get("database-roles") ?? [];
    const firstRegisterRead = boots.get("auth-policy") ?? [];
    expect([roles.length, firstRegisterRead.length]).toEqual([1, 1]);
    expect(stage[0]!.getStart()).toBeGreaterThan(roles[0]!.getEnd());
    expect(stage[0]!.getEnd()).toBeLessThan(firstRegisterRead[0]!.getStart());
  });

  it("S4.5 main.ts's createBillingRuntime({ call's pool property is crossAccountPool(pool, \"X11\")", async () => {
    const source = await parse(MAIN);
    const calls = callsOf(source, "createBillingRuntime");
    expect(calls).toHaveLength(1);
    const [options] = calls[0]!.arguments;
    expect(options !== undefined && ts.isObjectLiteralExpression(options)).toBe(true);
    const pool = (options as ts.ObjectLiteralExpression).properties.filter((property) => property.name?.getText() === "pool");
    expect(pool.map((property) => ts.isPropertyAssignment(property) ? property.initializer.getText() : property.getText()))
      .toEqual(['crossAccountPool(pool, "X11")']);
  });

  it("S4.3 each pinned site is routed where PLAN S4.3 names it: the NETOPIA intake's repository and jobs (X11), every PostgresStaffRepository and the staff runtime's alert mapping pool (X14), the run-content key store's owner lookup (X18h), the preview gate's two unfinished-run and usage reads (X21)", async () => {
    const main = await parse(MAIN);
    const intake = newsOf(main, "NetopiaNoticeIntake").filter((construction) => {
      const declaration = construction.parent?.parent;
      return declaration !== undefined && ts.isVariableDeclaration(declaration) && declaration.name.getText() === "providerOnlyIntake";
    });
    expect(intake).toHaveLength(1);
    const intakeOptions = intake[0]!.arguments?.[0] as ts.ObjectLiteralExpression;
    const property = (name: string): string | undefined => intakeOptions.properties
      .filter((member): member is ts.PropertyAssignment => ts.isPropertyAssignment(member))
      .find((member) => member.name.getText() === name)?.initializer.getText();
    expect([property("repository"), property("jobs")]).toEqual([
      'new BillingRepository(crossAccountPool(pool, "X11"))',
      'new BillingJobQueries(crossAccountPool(pool, "X11"))'
    ]);
    const staff = newsOf(main, "PostgresStaffRepository").map((construction) =>
      (construction.arguments ?? []).map((argument) => argument.getText()));
    expect(staff).toEqual([['crossAccountPool(pool, "X14")'], ['crossAccountPool(pool, "X14")'], ['crossAccountPool(pool, "X14")']]);
    // The security review (0171): a staff change's alert maps its key user, 0088's mapping now the marker's, on the same site; the dispatcher's
    // own pool stays `pool`, whose statements outside any request go to its system login.
    const runtimes = callsOf(main, "createStaffRuntime");
    expect(runtimes).toHaveLength(1);
    const runtimeOptions = runtimes[0]!.arguments[0] as ts.ObjectLiteralExpression;
    const runtimeProperty = (name: string): string | undefined => runtimeOptions.properties
      .filter((member): member is ts.PropertyAssignment | ts.ShorthandPropertyAssignment => ts.isPropertyAssignment(member) || ts.isShorthandPropertyAssignment(member))
      .map((member) => [member.name.getText(), ts.isPropertyAssignment(member) ? member.initializer.getText() : member.name.getText()] as const)
      .find(([key]) => key === name)?.[1];
    expect([runtimeProperty("pool"), runtimeProperty("mappingPool")]).toEqual(["pool", 'crossAccountPool(pool, "X14")']);
    const keyStore = bootCalls(main).get("run-content-key-store") ?? [];
    expect(keyStore).toHaveLength(1);
    const x18h = callsOf(main, "crossAccount").filter((call) => call.arguments[0]?.getText() === '"X18h"');
    expect(x18h).toHaveLength(1);
    expect(enclosedBy(x18h[0]!, keyStore[0]!)).toBe(true);
    expect(x18h[0]!.arguments[1]?.getText()).toMatch(/pool\.query<[^>]*>\(\s*`SELECT user_id FROM identity\."user"/u);
    const preview = await parse(PREVIEW_BUDGET);
    const x21 = callsOf(preview, "crossAccount").filter((call) => call.arguments[0]?.getText() === '"X21"');
    expect(x21.map((call) => enclosingFunctionName(call))).toEqual(["readPreviewBudgetGateSettings", "readPreviewBudgetGateSettings"]);
    expect(x21.map((call) => /PREVIEW_UNFINISHED_RUNS_SQL|PREVIEW_MEASURED_USAGE_SQL/u.exec(call.arguments[1]?.getText() ?? "")?.[0]))
      .toEqual(["PREVIEW_UNFINISHED_RUNS_SQL", "PREVIEW_MEASURED_USAGE_SQL"]);
  });
});
