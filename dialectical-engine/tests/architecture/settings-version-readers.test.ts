import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import ts from "typescript-classic";
import { describe, expect, it } from "vitest";

/**
 * Side-by-side spec §13 (settings changes without an upload), task S16 step 2 — the audit list of every shipped
 * REGISTER_VERSION reader. With settings versions, REGISTER_VERSION no longer means "the version every debate runs on":
 * it is the release's own SITE version (D1), which a debate's per-run version may differ from. So every shipped place
 * that reads it is listed here with what it uses it for, and a new reader nobody classified fails this test:
 *
 *  - "site version": reads register rows at the release's own version (the boot's site reads, the billing operator
 *    CLIs, check-version's site half, the practice's site context). Correct only for site-wide settings; a per-run
 *    setting must be read at the run's own version (the loaders in run-settings.ts / admission-settings.ts).
 *  - "the process's handshake": the value is compared with or forwarded alongside the release key, a ready line, a
 *    launcher's selection or a receipt; no register row is read with it.
 *  - "publisher": the version a publish targets or a stack rewrites its env file to.
 *
 * A reader is any AST use of the value in shipped code (not comments): `<anything>.REGISTER_VERSION` (environment.,
 * env., process.env., apiEnvironment., operator., settings.runner., …: every spelling, drift sweep S16),
 * `<x>["REGISTER_VERSION"]`, a call whose first argument is the string "REGISTER_VERSION" (`values.get(…)`, a parser's
 * `integer(…)`), or a destructuring `{ REGISTER_VERSION }`. Shipped = git's files under apps, packages, tools,
 * acceptance, deploy, scripts, minus test folders and *.test / *.spec files.
 */
type ReaderKind = "site version" | "the process's handshake" | "publisher";
const READER_KINDS: readonly ReaderKind[] = Object.freeze(["site version", "the process's handshake", "publisher"]);
type ReaderEntry = Readonly<{ file: string; kinds: readonly ReaderKind[]; use: string }>;

const REGISTER_VERSION_READERS: readonly ReaderEntry[] = Object.freeze([
  { file: "acceptance/pes-s01-publish-set-acceptance.ts", kinds: ["publisher"],
    use: "sets the hosted provider-set publish command's REGISTER_VERSION to the role's version" },
  { file: "apps/api/src/admission-settings.ts", kinds: ["site version"],
    use: "the admission site context's siteVersion (the release's own); every other version is loaded as itself" },
  { file: "apps/api/src/billing/check-cli.ts", kinds: ["site version"],
    use: "the billing check reads billing policy, plans and country policy at operator.REGISTER_VERSION" },
  { file: "apps/api/src/billing/refund-done-cli.ts", kinds: ["site version"], use: "billing policy at the site version" },
  { file: "apps/api/src/billing/tax-summary-cli.ts", kinds: ["site version"], use: "tax authorities at the site version" },
  { file: "apps/api/src/billing/withdraw-cli.ts", kinds: ["site version"], use: "billing policy and plans at the site version" },
  { file: "apps/api/src/main.ts", kinds: ["site version"],
    use: "the API boot's site reads (auth, admission, billing, tax, …) and the site version handed to the per-version loader and pointer reader" },
  { file: "apps/api/src/settings-check.ts", kinds: ["site version"],
    use: "check-version's API half: the site's own reads, as main.ts; the checked version is a separate argument" },
  { file: "apps/runner/src/dev-api-environment.ts", kinds: ["publisher"],
    use: "the dev stack rewrites api.env only when a newer published version is expected (values.get)" },
  { file: "apps/runner/src/dev-runner-process.ts", kinds: ["the process's handshake"],
    use: "forwards the dev API's REGISTER_VERSION to the dev runner and checks its ready line names it" },
  { file: "apps/runner/src/hosted-provider-set-publish-cli.ts", kinds: ["publisher"],
    use: "the hosted provider-set publish targets the environment's version" },
  { file: "apps/runner/src/main.ts", kinds: ["site version", "the process's handshake"],
    use: "the runner boot's site settings, call-concurrency row and settings preload; the ready line's registerVersion" },
  { file: "apps/runner/src/run-settings.ts", kinds: ["site version"],
    use: "readRunnerSiteContext's site reads and siteVersion; every other version is loaded as itself" },
  { file: "deploy/preview-auth-dev/v1/environment.mjs", kinds: ["the process's handshake"],
    use: "the staged environment's version must equal the publication's" },
  { file: "deploy/preview-auth-dev/v1/launch-api.mjs", kinds: ["the process's handshake"],
    use: "the API launcher's selection (process.env.REGISTER_VERSION)" },
  { file: "deploy/preview-auth-dev/v1/launch-runner.mjs", kinds: ["the process's handshake"],
    use: "the runner launcher's selection (process.env.REGISTER_VERSION)" },
  { file: "deploy/preview-auth-dev/v1/runtime-receipt.mjs", kinds: ["the process's handshake"],
    use: "the runtime receipt's selected version must be the plan's, with a release key of it" },
  { file: "deploy/preview-auth-dev/v1/stage-runtime.mjs", kinds: ["the process's handshake"],
    use: "the stage refuses an environment whose version is not the publication's" },
  { file: "deploy/preview-lifecycle/v1/release-info.mjs", kinds: ["the process's handshake"],
    use: "the release overlay's REGISTER_VERSION must be its release key's number" },
  { file: "packages/register/src/runtime-environment.ts", kinds: ["the process's handshake"],
    use: "RELEASE_KEY's number must be this process's REGISTER_VERSION (API and runner environments)" },
  { file: "tools/preview-practice/practice-ask-composition.ts", kinds: ["site version"],
    use: "the practice ask's site context, as the API boot" },
  { file: "tools/preview-practice/practice-debate.ts", kinds: ["site version", "the process's handshake"],
    use: "the settings file's version must be the export's live one; shape/length/engine rows at it; --register-next" },
  { file: "tools/preview-practice/practice-runner-composition.ts", kinds: ["site version"],
    use: "the practice runner's site settings and call-concurrency row, as the runner boot" },
  { file: "tools/preview-practice/practice-settings.ts", kinds: ["site version"],
    use: "parses the practice settings file's REGISTER_VERSION (integer(…))" }
]);

/**
 * The evaluator worker (apps/evaluator-worker/src/index.ts) does NOT read REGISTER_VERSION: its judge add-on reads each
 * run's own `core.run.register_version` and skips a run whose version is not its provider family's
 * (ADDON_FAMILY_REGISTER_VERSION_MISMATCH), then reads its add-on policy at that run's version. It is not deployed
 * today (no deploy file names it; P3 lists its database URL as REQUIRED_NOT_WIRED). WHEN IT IS DEPLOYED it must load
 * its provider family at each run's version (side-by-side spec §13: runs on different settings versions coexist), not
 * one family for the process — otherwise every run on another version is skipped. This test pins that comparison.
 */
const EVALUATOR_WORKER_FILE = "apps/evaluator-worker/src/index.ts";

/** The brief's list (grep at 47293e3ca) plus the site-version entries of run-settings.ts and admission-settings.ts. */
const BRIEF_NAMED_READERS = Object.freeze([
  "apps/runner/src/main.ts", "apps/runner/src/hosted-provider-set-publish-cli.ts", "apps/api/src/main.ts",
  "apps/api/src/billing/withdraw-cli.ts", "apps/api/src/billing/refund-done-cli.ts", "apps/api/src/billing/tax-summary-cli.ts",
  "tools/preview-practice/practice-ask-composition.ts", "tools/preview-practice/practice-runner-composition.ts",
  "acceptance/pes-s01-publish-set-acceptance.ts", "deploy/preview-auth-dev/v1/launch-runner.mjs",
  "deploy/preview-auth-dev/v1/launch-api.mjs", "deploy/preview-auth-dev/v1/stage-runtime.mjs",
  "apps/runner/src/run-settings.ts", "apps/api/src/admission-settings.ts"
]);

const execFileAsync = promisify(execFile);
const SHIPPED_ROOTS = Object.freeze(["apps", "packages", "tools", "acceptance", "deploy", "scripts"]);

function isShippedSource(file: string): boolean {
  return /[.](?:[cm]?[jt]sx?)$/u.test(file)
    && !/(?:^|\/)(?:tests?|__tests__)\//u.test(file)
    && !/[.](?:test|spec)[.][cm]?[jt]sx?$/u.test(file);
}

/** The lines where `source` uses REGISTER_VERSION's value (see the header), comments and plain text excluded. */
function registerVersionUses(file: string, source: string): readonly number[] {
  if (!source.includes("REGISTER_VERSION")) return [];
  const kind = /[.][cm]?jsx?$/u.test(file) ? ts.ScriptKind.JS : file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const lines = [] as number[];
  const isName = (node: ts.Node | undefined): boolean =>
    node !== undefined && (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) && node.text === "REGISTER_VERSION";
  const visit = (node: ts.Node): void => {
    const use = (ts.isPropertyAccessExpression(node) && node.name.text === "REGISTER_VERSION")
      || (ts.isElementAccessExpression(node) && isName(node.argumentExpression))
      || (ts.isCallExpression(node) && node.arguments[0] !== undefined && ts.isStringLiteralLike(node.arguments[0])
        && node.arguments[0].text === "REGISTER_VERSION")
      || (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)
        && (isName(node.propertyName) || (node.propertyName === undefined && isName(node.name))));
    if (use) lines.push(root.getLineAndCharacterOfPosition(node.getStart()).line + 1);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return lines;
}

async function shippedSources(): Promise<ReadonlyMap<string, string>> {
  const listed = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...SHIPPED_ROOTS]);
  const files = listed.stdout.split("\n").filter(isShippedSource);
  return new Map(await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")] as const)));
}

describe("side-by-side §13: every shipped REGISTER_VERSION reader is classified", () => {
  it("lists exactly the shipped readers, each with its kind, and fails for a reader nobody classified", async () => {
    const sources = await shippedSources();
    expect(sources.has("apps/api/src/main.ts")).toBe(true);
    const readers = [...sources].filter(([file, source]) => registerVersionUses(file, source).length > 0).map(([file]) => file).sort();
    const listed = REGISTER_VERSION_READERS.map(({ file }) => file);
    expect(listed).toEqual([...listed].sort());
    expect(new Set(listed).size).toBe(listed.length);
    const unclassified = readers.filter((file) => !listed.includes(file));
    const stale = listed.filter((file) => !readers.includes(file));
    expect({ unclassified, stale }).toEqual({ unclassified: [], stale: [] });
    for (const entry of REGISTER_VERSION_READERS) {
      expect(entry.kinds.length, entry.file).toBeGreaterThan(0);
      expect(entry.kinds.every((kind) => READER_KINDS.includes(kind)), entry.file).toBe(true);
      expect(new Set(entry.kinds).size, entry.file).toBe(entry.kinds.length);
      expect(entry.use.trim(), entry.file).not.toBe("");
    }
    for (const file of BRIEF_NAMED_READERS) expect(listed, file).toContain(file);
    // run-settings.ts's and admission-settings.ts's site-version entry: the site context hands the loader the release's
    // own version as siteVersion; every other version is read as itself.
    expect(sources.get("apps/runner/src/run-settings.ts")).toContain("siteVersion: environment.REGISTER_VERSION");
    expect(sources.get("apps/api/src/admission-settings.ts")).toContain("siteVersion: environment.REGISTER_VERSION");
  });

  it("sees every spelling of a read and nothing in comments or plain text", () => {
    const planted = (text: string) => registerVersionUses("apps/runner/src/unapproved.ts", text);
    expect(planted("const v = environment.REGISTER_VERSION;")).toEqual([1]);
    expect(planted("const v = env.REGISTER_VERSION;")).toEqual([1]);
    expect(planted("const v = process.env.REGISTER_VERSION;")).toEqual([1]);
    expect(planted("const v = apiEnvironment.REGISTER_VERSION;")).toEqual([1]);
    expect(planted('const v = env["REGISTER_VERSION"];')).toEqual([1]);
    expect(planted('const v = values.get("REGISTER_VERSION");')).toEqual([1]);
    expect(planted("const { REGISTER_VERSION } = env;")).toEqual([1]);
    expect(planted("const { REGISTER_VERSION: version } = env;")).toEqual([1]);
    expect(planted("// pin it in REGISTER_VERSION\n/** r<REGISTER_VERSION>-hex */\nconst text = `REGISTER_VERSION=${v}`;")).toEqual([]);
    expect(planted("const keys = { REGISTER_VERSION: 4 };")).toEqual([]);
    expect(registerVersionUses("deploy/x/unapproved.mjs", "const v = process.env.REGISTER_VERSION;")).toEqual([1]);
    expect(isShippedSource("apps/runner/src/unapproved.ts")).toBe(true);
    expect(isShippedSource("acceptance/pes-s01-publish-set-acceptance.test.ts")).toBe(false);
  });

  it("pins the evaluator worker's per-run comparison: the run's own version, never REGISTER_VERSION", async () => {
    const sources = await shippedSources();
    const source = sources.get(EVALUATOR_WORKER_FILE);
    expect(source).toBeDefined();
    expect(registerVersionUses(EVALUATOR_WORKER_FILE, source!)).toEqual([]);
    expect(source).not.toMatch(/process[.]env/u);
    const query = source!.indexOf('"SELECT register_version FROM core.run WHERE run_id=$1"');
    const parsed = source!.indexOf("parseRegisterVersionText(run.rows[0].register_version)", query);
    const compared = source!.indexOf("if (input.family.registerVersion !== registerVersion) {", parsed);
    const skipped = source!.indexOf(
      'return Object.freeze({ state: "SKIPPED", reason: "ADDON_FAMILY_REGISTER_VERSION_MISMATCH" });', compared);
    const policy = source!.indexOf("readEvaluatorJudgeAddonPolicy(input.pool, registerVersion)", skipped);
    expect([query, parsed, compared, skipped, policy].every((index) => index >= 0)).toBe(true);
    expect(source!.slice(compared, skipped)).toContain('recordPreflightReceipt("SKIPPED", "ADDON_FAMILY_REGISTER_VERSION_MISMATCH")');
    // Not deployed: no deploy file (documentation aside) names it. A deployment must first load its family per run.
    const listed = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "deploy"]);
    const deployFiles = listed.stdout.split("\n").filter((file) => file !== "" && !file.endsWith(".md"));
    const naming = [] as string[];
    for (const file of deployFiles) {
      const text = await readFile(file, "utf8").catch(() => "");
      if (/evaluator-worker/u.test(text)) naming.push(file);
    }
    expect(naming).toEqual([]);
  });
});
