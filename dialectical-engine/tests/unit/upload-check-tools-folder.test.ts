import { afterEach, describe, expect, it, onTestFinished } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const tools = await import('../../tools/' + 'upload-check/tools-folder.mjs');

// The repository root is one level above dialectical-engine/, where git archive reads the deploy folders from.
const engine = resolve(import.meta.dirname, '../..');
const repo = resolve(engine, '..');
const FOLDERS = ['preview-lifecycle', 'preview-auth-dev', 'preview-release'];
const BAD_TOOL = 'preview-lifecycle/v1/bad.mjs';
const BAD_EXTRA = { [`dialectical-engine/deploy/${BAD_TOOL}`]: "import '../../../../tools/missing.mjs';\n" };
const NO_FOLDERS_EXTRA = { 'README.md': 'no tools here\n' };
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const scratch = () => { const root = realpathSync(mkdtempSync(join(tmpdir(), 'upload-check-tools-'))); roots.push(root); return root; };
const git = (cwd: string, args: string[]) => execFileSync('git', ['-c', 'user.name=upload-check-test', '-c', 'user.email=upload-check-test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

/** A throwaway git repository with one commit: the named deploy folders copied from this checkout, and any extra files. */
function repository({ folders = FOLDERS, extra = {} }: { folders?: string[]; extra?: Record<string, string> } = {}) {
  const dir = scratch();
  for (const folder of folders) cpSync(join(engine, 'deploy', folder), join(dir, 'dialectical-engine/deploy', folder), { recursive: true });
  for (const [path, text] of Object.entries(extra)) { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), text); }
  git(dir, ['init', '-q']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'fixture']);
  return dir;
}

describe('check 1: the shared tools folder', () => {
  it('loads every tool at HEAD except the release-folder ones', async () => {
    const dest = scratch();
    await tools.buildToolsFolder({ repo, rev: 'HEAD', dest });
    const results = await tools.loadEachTool({ folder: dest, node: process.execPath, skip: tools.RELEASE_FOLDER_TOOLS });
    expect(results.filter((result: { ok: boolean }) => !result.ok)).toEqual([]);
    expect(results.length).toBeGreaterThanOrEqual(30);
  }, 300_000);

  it('names a tool that reaches outside the three folders', async () => {
    const dest = scratch();
    await tools.buildToolsFolder({ repo: repository({ extra: BAD_EXTRA }), rev: 'HEAD', dest });
    expect(await tools.loadEachTool({ folder: dest, node: process.execPath, only: [BAD_TOOL] })).toEqual([{ tool: BAD_TOOL, ok: false, code: 'ERR_MODULE_NOT_FOUND' }]);
  }, 120_000);

  it('refuses a commit without the three folders', async () => {
    const dest = scratch();
    await expect(tools.buildToolsFolder({ repo: repository({ folders: [], extra: NO_FOLDERS_EXTRA }), rev: 'HEAD', dest })).rejects.toMatchObject({ code: 'UPLOAD_CHECK_TOOLS_FOLDER_EMPTY' });
    expect(readdirSync(dest)).toEqual([]);
  }, 120_000);

  it('a tool that runs too long is TIMEOUT on time, even when a process it started holds its error output open', async () => {
    // The tool starts a grandchild that inherits its error output and outlives it, then never ends itself. Killing the
    // tool cannot close that output, so the result must not wait for it to close.
    const dest = scratch();
    for (const folder of FOLDERS) mkdirSync(join(dest, 'dialectical-engine/deploy', folder), { recursive: true });
    const tool = 'preview-lifecycle/hold.mjs';
    // The grandchild's pid goes to a folder of its own: afterEach removes the scratch folders before onTestFinished runs.
    const pidDir = realpathSync(mkdtempSync(join(tmpdir(), 'upload-check-hold-')));
    const pidFile = join(pidDir, 'pid.json');
    writeFileSync(join(dest, 'dialectical-engine/deploy', tool), [
      "import { spawn } from 'node:child_process';",
      "import { writeFileSync } from 'node:fs';",
      "const grand = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: ['ignore', 'ignore', 'inherit'] });",
      `writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify({ grandchild: grand.pid }));`,
      'setInterval(() => {}, 1000);',
      ''
    ].join('\n'));
    onTestFinished(() => {
      try { process.kill(JSON.parse(readFileSync(pidFile, 'utf8')).grandchild, 'SIGKILL'); } catch { /* not started, or gone */ }
      rmSync(pidDir, { recursive: true, force: true });
    });
    const started = Date.now();
    expect(await tools.loadEachTool({ folder: dest, node: process.execPath, only: [tool], limitMs: 1_000 })).toEqual([{ tool, ok: false, code: 'TIMEOUT' }]);
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 20_000);

  it('the release-folder list is exactly the seven', () => {
    expect(tools.RELEASE_FOLDER_TOOLS).toEqual([
      'preview-auth-dev/v1/launch-api.mjs',
      'preview-auth-dev/v1/launch-runner.mjs',
      'preview-auth-dev/v1/mail-handoff.mjs',
      'preview-auth-dev/v1/native-operator.mjs',
      'preview-auth-dev/v1/native-peer.mjs',
      'preview-auth-dev/v1/run-stage.mjs',
      'preview-auth-dev/v1/stage-runtime.mjs'
    ]);
    expect(Object.isFrozen(tools.RELEASE_FOLDER_TOOLS)).toBe(true);
  });

  it('the check passes at HEAD with no lines', async () => {
    const result = await tools.checkToolsFolder({ repo, rev: 'HEAD', workdir: scratch(), node: process.execPath });
    expect(result).toEqual({ name: 'tools-folder', status: 'passed', lines: [], seconds: expect.any(Number) });
  }, 300_000);

  it('the check is refused with one line per tool that fails', async () => {
    const result = await tools.checkToolsFolder({ repo: repository({ extra: BAD_EXTRA }), rev: 'HEAD', workdir: scratch(), node: process.execPath });
    expect(result).toEqual({ name: 'tools-folder', status: 'refused', lines: [`${BAD_TOOL}: ERR_MODULE_NOT_FOUND`], seconds: expect.any(Number) });
  }, 300_000);

  it('the check is refused, with the reason, for a commit without the folders', async () => {
    const result = await tools.checkToolsFolder({ repo: repository({ folders: [], extra: NO_FOLDERS_EXTRA }), rev: 'HEAD', workdir: scratch(), node: process.execPath });
    expect(result).toEqual({ name: 'tools-folder', status: 'refused', lines: [expect.stringContaining('UPLOAD_CHECK_TOOLS_FOLDER_EMPTY')], seconds: expect.any(Number) });
  }, 120_000);

  it('the check is not-checked, with a line saying why, when the commit cannot be read', async () => {
    const result = await tools.checkToolsFolder({ repo, rev: 'no-such-commit-upload-check', workdir: scratch(), node: process.execPath });
    expect(result).toEqual({ name: 'tools-folder', status: 'not-checked', lines: [expect.any(String)], seconds: expect.any(Number) });
    expect(result.lines[0].length).toBeGreaterThan(0);
  }, 120_000);
});
