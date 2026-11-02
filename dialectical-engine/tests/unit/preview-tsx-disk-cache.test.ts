// NV-54 (security audit run 3): every preview entry that loads release TypeScript through tsx loads tsx only
// through deploy/preview-auth-dev/v1/tsx-api.mjs, which switches tsx's disk transform cache off before tsx is first
// evaluated. tsx 4.23 chooses its cache ONCE at evaluation and serves a stored entry from os.tmpdir()/tsx-<euid>
// instead of transpiling the integrity-checked source, so the switch has to be set in the process that loads tsx.
import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const OPERATOR = resolve('deploy/preview-auth-dev/v1');
const SWITCH = 'TSX_DISABLE_CACHE';
const CACHE_ENTRY = /^\d+-[^-]+$/;
const scratch: string[] = [];

afterEach(async () => {
  await Promise.all(scratch.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

/** The slice of `code` from `start` up to (not including) `end`, or to the end of the file. */
function slice(code: string, start: string, end?: string): string {
  const from = code.indexOf(start);
  expect(from, start).toBeGreaterThanOrEqual(0);
  const to = end === undefined ? code.length : code.indexOf(end, from + start.length);
  expect(to, end).toBeGreaterThan(from);
  return code.slice(from, to);
}

/** Every step is present in `body`, in this order. */
function expectOrder(body: string, steps: readonly string[]): void {
  const at = steps.map(step => body.indexOf(step));
  for (const [index, step] of steps.entries()) expect(at[index], step).toBeGreaterThanOrEqual(0);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
}

describe('NV-54 preview entries load tsx with its disk transform cache off', () => {
  it('every preview operator entry loads tsx through tsx-api.mjs, after its source check', async () => {
    const names = (await readdir(OPERATOR)).filter(name => name.endsWith('.mjs') && name !== 'tsx-api.mjs');
    expect(names).toEqual(expect.arrayContaining(['launch-api.mjs', 'launch-runner.mjs', 'native-operator.mjs', 'mail-handoff.mjs']));
    for (const name of names) {
      const text = await readFile(join(OPERATOR, name), 'utf8');
      expect(text, name).not.toMatch(/^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]tsx(?:\/[^'"]*)?['"]/m);
      expect(text, name).not.toMatch(/import\(\s*['"]tsx/);
    }
    const helper = await readFile(join(OPERATOR, 'tsx-api.mjs'), 'utf8');
    expect(helper.split("import('tsx/esm/api')").length - 1).toBe(1);

    const api = await readFile(join(OPERATOR, 'launch-api.mjs'), 'utf8');
    expectOrder(slice(api, 'export async function launchApi', 'if(process.argv[1]'), [
      "prepareLaunch(argv,'api',import.meta.url)", 'await loadTsxApi()', "tsImport(join(engine,'packages/register/src/runtime-environment.ts')"
    ]);
    const runner = await readFile(join(OPERATOR, 'launch-runner.mjs'), 'utf8');
    expectOrder(slice(runner, 'export async function prepareRunner', 'export async function launchRunner'), [
      "prepareLaunch(argv,'runner',import.meta.url)", 'await loadTsxApi()', 'tsImport(join(plan.sourceRoot,'
    ]);
    expectOrder(slice(runner, 'export async function launchRunner', 'export function installRunnerFailureCodes'), [
      "prepareLaunch(argv,'runner',import.meta.url)", 'await loadTsxApi()', 'tsImport(join(engine,'
    ]);
    const native = slice(await readFile(join(OPERATOR, 'native-operator.mjs'), 'utf8'), 'export async function runNativeOperator', 'const PENDING_FORWARD_STEP=');
    expectOrder(native, [
      "if(operatorManifestSha256(source)!==plan.operatorManifestSha256)refuse('PREVIEW_OPERATOR_SOURCE_REFUSED');",
      'await loadTsxApi()', "tsImport(join(engine,'packages/db/src/index.ts')"
    ]);
    // The peer actor check admits only PATH/LANG/LC_ALL/TZ: the switch is put back as the caller had it first.
    expectOrder(native, ["tsImport('./verify-native.ts',import.meta.url)", 'restoreCacheSwitch();', 'return withActiveNativePool(']);
    const mail = await readFile(join(OPERATOR, 'mail-handoff.mjs'), 'utf8');
    expectOrder(slice(mail, 'async function main'), ['await loadTsxApi()', "tsImport('../../../packages/register/src/auth-policy.ts'"]);
  });

  it('loadTsxApi switches the cache off before tsx is evaluated, and its restore puts back only that key', async () => {
    const tsxApi = await import('../../deploy/' + 'preview-auth-dev/v1/tsx-api.mjs') as {
      readonly TSX_CACHE_SWITCH: string;
      readonly loadTsxApi: (options?: { readonly importApi?: () => Promise<Record<string, unknown>> }) =>
        Promise<{ readonly tsImport: unknown; readonly restoreCacheSwitch: () => void }>;
    };
    expect(tsxApi.TSX_CACHE_SWITCH).toBe(SWITCH);
    const original = process.env[SWITCH];
    const marker = () => undefined;
    try {
      for (const prior of [undefined, 'caller-supplied']) {
        if (prior === undefined) delete process.env[SWITCH];
        else process.env[SWITCH] = prior;
        let seen: string | undefined;
        const loaded = await tsxApi.loadTsxApi({ importApi: async () => { seen = process.env[SWITCH]; return { tsImport: marker }; } });
        expect(seen, String(prior)).toBe('1');
        expect(loaded.tsImport).toBe(marker);
        const others = Object.entries(process.env).filter(([key]) => key !== SWITCH);
        loaded.restoreCacheSwitch();
        // A caller-supplied key comes back, so the actor check still refuses it exactly as before NV-54.
        if (prior === undefined) expect(Object.hasOwn(process.env, SWITCH)).toBe(false);
        else expect(process.env[SWITCH]).toBe(prior);
        expect(Object.entries(process.env).filter(([key]) => key !== SWITCH)).toEqual(others);
      }
    } finally {
      if (original === undefined) delete process.env[SWITCH];
      else process.env[SWITCH] = original;
    }
  });

  it('a planted tsx cache entry is served to a static importer and never through loadTsxApi', async () => {
    const fixture = await realpath(await mkdtemp(join(tmpdir(), 'nv54-fx-')));
    const cache = await realpath(await mkdtemp(join(tmpdir(), 'nv54-tmp-')));
    const freshCache = await realpath(await mkdtemp(join(tmpdir(), 'nv54-tmp2-')));
    scratch.push(fixture, cache, freshCache);
    const moduleFile = join(fixture, 'm.ts');
    await writeFile(moduleFile, 'export const x = 1;\n');
    // An ESM package, so tsx takes its ESM transform and the planted entry is ESM too (NV-54 review r1, minor 2).
    await writeFile(join(fixture, 'package.json'), '{"type":"module"}\n');
    const tsxEntry = pathToFileURL(resolve('node_modules/tsx/dist/esm/api/index.mjs')).href;
    const helperEntry = pathToFileURL(join(OPERATOR, 'tsx-api.mjs')).href;
    const load = `const m=await tsImport(${JSON.stringify(moduleFile)},import.meta.url);process.stdout.write(String(m.x));`;
    const STATIC = `const {tsImport}=await import(${JSON.stringify(tsxEntry)});${load}`;
    const HELPER = `const {loadTsxApi}=await import(${JSON.stringify(helperEntry)});const {tsImport}=await loadTsxApi();${load}`;
    const run = async (script: string, temporary: string): Promise<string> => (await execute(
      process.execPath, ['--input-type=module', '-e', script],
      { cwd: fixture, env: { PATH: dirname(process.execPath), TMPDIR: temporary }, timeout: 30_000 }
    )).stdout;
    const cacheFolder = (temporary: string) => join(temporary, `tsx-${process.geteuid!()}`);
    const entries = async (temporary: string): Promise<readonly string[]> =>
      (await readdir(cacheFolder(temporary)).catch(() => [] as string[])).filter(name => CACHE_ENTRY.test(name));

    // 1. Today's launcher shape writes one transform to the disk cache.
    expect(await run(STATIC, cache)).toBe('1');
    const written = await entries(cache);
    expect(written, 'the hazard does not reproduce on this tsx/Node').toHaveLength(1);
    const entryPath = join(cacheFolder(cache), written[0]!);
    // 2. Plant: another uid that could write there first replaces the transform.
    const stored = JSON.parse(await readFile(entryPath, 'utf8')) as { code: string; map?: unknown };
    await writeFile(entryPath, JSON.stringify({ ...stored, code: 'export const x = 2;\n' }));
    const planted = await readFile(entryPath, 'utf8');
    // 3. The static importer is served the planted code, not the verified source.
    expect(await run(STATIC, cache)).toBe('2');
    // 4. Through loadTsxApi the source is transpiled again and the cache is neither read nor written.
    expect(await run(HELPER, cache)).toBe('1');
    expect(await readFile(entryPath, 'utf8')).toBe(planted);
    // 5. A fresh temporary folder gets no cache entry at all.
    expect(await run(HELPER, freshCache)).toBe('1');
    expect(await entries(freshCache)).toEqual([]);
  }, 120_000);
});
