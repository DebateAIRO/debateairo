import { afterEach, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const run = await import('../../tools/' + 'upload-check/run.mjs');

// The repository root is one level above dialectical-engine/, where git reads the commit from.
const engine = resolve(import.meta.dirname, '../..');
const repo = resolve(engine, '..');
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const scratch = () => { const root = realpathSync(mkdtempSync(join(tmpdir(), 'upload-check-run-'))); roots.push(root); return root; };

const quiet = () => {};
const free = async () => ({ processes: ['/usr/sbin/cfprefsd agent'], freePercent: 80 });
const busy = async () => ({ processes: ['node node_modules/vitest/vitest.mjs run tests/unit/a.test.ts'], freePercent: 80 });
const passed = (name: string) => ({ name, status: 'passed', lines: [], seconds: 0 });
const passingChecks = {
  toolsFolder: async () => passed('tools-folder'),
  websiteBuild: async () => ({ result: passed('website-build'), root: '/release-root' }),
  startChecks: async () => passed('start-checks')
};
// A stand-in for any check: the run must not call it.
const neverCalled = async () => { throw new Error('a check ran'); };
const noCheckRuns = { toolsFolder: neverCalled, websiteBuild: neverCalled, startChecks: neverCalled };

describe('hostIsFree: the same bar as run-clean.sh', () => {
  it('is false while a vitest run is going', () => {
    expect(run.hostIsFree({ processes: ['node node_modules/vitest/vitest.mjs run tests/unit/a.test.ts'], freePercent: 90 })).toBe(false);
    expect(run.hostIsFree({ processes: ['node node_modules/vitest/dist/cli.js run'], freePercent: 90 })).toBe(false);
    expect(run.hostIsFree({ processes: ['npx vitest run'], freePercent: 90 })).toBe(false);
  });

  it('is false while a PostgreSQL is going', () => {
    expect(run.hostIsFree({ processes: ['node_modules/embedded-postgres/bin/postgres -D data -p 5499'], freePercent: 90 })).toBe(false);
    expect(run.hostIsFree({ processes: ['node_modules/embedded-postgres/native/bin/postgres -D data'], freePercent: 90 })).toBe(false);
  });

  it('is false below 40% of memory free, and true at 40%', () => {
    expect(run.hostIsFree({ processes: [], freePercent: 39 })).toBe(false);
    expect(run.hostIsFree({ processes: [], freePercent: 40 })).toBe(true);
  });

  it('is true when no heavy run is going and memory is free', () => {
    expect(run.hostIsFree({ processes: ['/usr/sbin/cfprefsd agent', 'node tools/upload-check/run.mjs --rev abc'], freePercent: 62 })).toBe(true);
  });

  it('ignores a practice-worktree PostgreSQL, as run-clean.sh does', () => {
    expect(run.hostIsFree({ processes: ['node_modules/embedded-postgres/bin/postgres -D /x/worktrees/r21-practice/data'], freePercent: 90 })).toBe(true);
  });
});

describe('formatReport: the plain report', () => {
  const rev = '0123456789abcdef0123456789abcdef01234567';

  it('prints a head line, one line per check with its lines indented, and NOT PASSED last', () => {
    const results = [
      { name: 'tools-folder', status: 'passed', lines: [], seconds: 12.5 },
      { name: 'website-build', status: 'refused', lines: ['website build: the build failed', 'UPLOAD_CHECK_WEBSITE_BUILD_FAILED'], seconds: 300 },
      { name: 'start-checks', status: 'not-checked', lines: ['no installed release'], seconds: 0 }
    ];
    expect(run.formatReport({ rev, results }).split('\n')).toEqual([
      'Upload check of 0123456789ab',
      'tools-folder: passed (12.5 s)',
      'website-build: REFUSED (300 s)',
      '  website build: the build failed',
      '  UPLOAD_CHECK_WEBSITE_BUILD_FAILED',
      'start-checks: not checked (0 s)',
      '  no installed release',
      'NOT PASSED'
    ]);
  });

  it('ends with ALL PASSED only when every check passed', () => {
    const results = [passed('tools-folder'), passed('website-build'), passed('start-checks')];
    expect(run.formatReport({ rev, results }).split('\n').at(-1)).toBe('ALL PASSED');
    expect(run.formatReport({ rev, results: [...results.slice(0, 2), { ...passed('start-checks'), status: 'not-checked' }] }).split('\n').at(-1)).toBe('NOT PASSED');
  });
});

describe('versionProblem: the checker needs Node v26.8.2 and pnpm 11.20.0', () => {
  it('names the version that is not the checker\'s, and is silent when both match', () => {
    expect(run.versionProblem({ nodeVersion: 'v26.8.2', pnpmVersion: '11.20.0' })).toBeNull();
    expect(run.versionProblem({ nodeVersion: 'v26.8.1', pnpmVersion: '11.20.0' })).toContain('v26.8.2');
    expect(run.versionProblem({ nodeVersion: 'v26.8.2', pnpmVersion: '10.28.2' })).toContain('11.20.0');
  });
});

describe('the run command', () => {
  it('an unknown rev refuses with code 2 and creates no temporary folder', async () => {
    const tmp = scratch();
    const result = await run.runUploadCheck({ rev: 'upload-check-no-such-commit', repo, tmp, host: free, log: quiet, checks: noCheckRuns });
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('UPLOAD_CHECK_REV_UNKNOWN');
    expect(readdirSync(tmp)).toEqual([]);
  }, 60_000);

  it('the temporary folder is gone after a check throws, and the run exits 2', async () => {
    const tmp = scratch();
    let folder = '';
    let existedDuringCheck = false;
    const throwing = async (options: { workdir: string }) => {
      folder = options.workdir;
      existedDuringCheck = existsSync(folder);
      throw new Error('a check blew up');
    };
    const result = await run.runUploadCheck({ rev: 'HEAD', repo, tmp, host: free, log: quiet, checks: { ...passingChecks, toolsFolder: throwing } });
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('a check blew up');
    expect(existedDuringCheck).toBe(true);
    expect(folder).toMatch(/upload-check-[0-9a-f]{12}-\d+$/u);
    expect(existsSync(folder)).toBe(false);
    expect(readdirSync(tmp)).toEqual([]);
  }, 60_000);

  it('start-checks is not checked, with no installed release, and check 3 is never called, when check 2 left no root', async () => {
    const tmp = scratch();
    let startCalls = 0;
    const websiteRefused = async () => ({ result: { name: 'website-build', status: 'refused', lines: ['website build: the build failed'], seconds: 0 }, root: null });
    const countingStart = async () => { startCalls += 1; return passed('start-checks'); };
    const result = await run.runUploadCheck({
      rev: 'HEAD', repo, tmp, host: free, log: quiet,
      checks: { toolsFolder: async () => passed('tools-folder'), websiteBuild: websiteRefused, startChecks: countingStart }
    });
    expect(startCalls).toBe(0);
    expect(result.results[2]).toEqual({ name: 'start-checks', status: 'not-checked', lines: ['no installed release'], seconds: 0 });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('start-checks: not checked (');
    expect(result.output).toContain('  no installed release');
    expect(readdirSync(tmp)).toEqual([]);
  }, 60_000);

  it('passes with exit 0 when all three checks pass, and leaves no folder', async () => {
    const tmp = scratch();
    const result = await run.runUploadCheck({ rev: 'HEAD', repo, tmp, host: free, log: quiet, checks: passingChecks });
    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/^Upload check of [0-9a-f]{12}$/mu);
    expect(result.output.split('\n').at(-1)).toBe('ALL PASSED');
    expect(readdirSync(tmp)).toEqual([]);
  }, 60_000);

  it('refuses with UPLOAD_CHECK_HOST_BUSY when the host stays busy, and creates no folder', async () => {
    const tmp = scratch();
    const result = await run.runUploadCheck({ rev: 'HEAD', repo, tmp, host: busy, waitMs: 0, pollMs: 0, log: quiet, checks: noCheckRuns });
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('UPLOAD_CHECK_HOST_BUSY');
    expect(readdirSync(tmp)).toEqual([]);
  }, 60_000);

  it('the command line refuses an unknown rev with exit 2 and no folder', () => {
    const tmp = scratch();
    const child = spawnSync(process.execPath, [join(engine, 'tools/upload-check/run.mjs'), '--rev', 'upload-check-no-such-commit'], { encoding: 'utf8', env: { ...process.env, TMPDIR: tmp } });
    expect(child.status).toBe(2);
    expect(child.stderr).toContain('UPLOAD_CHECK_REV_UNKNOWN');
    expect(readdirSync(tmp)).toEqual([]);
  });

  it('the command line without --rev refuses with exit 2', () => {
    const child = spawnSync(process.execPath, [join(engine, 'tools/upload-check/run.mjs')], { encoding: 'utf8' });
    expect(child.status).toBe(2);
    expect(child.stderr).toContain('UPLOAD_CHECK_USAGE');
  });
});

// A busy writer, as pnpm is during an install: for a minute at most, it makes its own folder in the work folder again and
// again (mkdir -p, so a removed work folder comes back) and writes files into it, never resting.
const WRITER = "const { mkdirSync, writeFileSync } = require('node:fs'); const dir = require('node:path').join(process.env.UC_WORKDIR, 'busy-' + process.pid); const until = Date.now() + 60000; let i = 0; while (Date.now() < until) { try { mkdirSync(dir, { recursive: true }); writeFileSync(dir + '/f' + (i++ % 200), 'x'); } catch {} }";
// A fake command for the signal tests: a child that starts a grandchild, and both write into the work folder as above.
// Their pids go to UC_PIDFILE before the child starts writing.
const FAKE_TREE = `const WRITER = ${JSON.stringify(WRITER)}; const { spawn } = require('node:child_process'); const { writeFileSync } = require('node:fs'); const grand = spawn(process.execPath, ['-e', WRITER], { stdio: 'ignore', env: process.env }); writeFileSync(process.env.UC_PIDFILE, JSON.stringify({ child: process.pid, grandchild: grand.pid })); eval(WRITER);`;
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
/** True once <pid> is gone; false if it is still there after <ms>. */
async function stoppedWithin(pid: number, ms = 5_000) {
  const until = Date.now() + ms;
  while (alive(pid) && Date.now() < until) await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  return !alive(pid);
}

/**
 * The script a signal test runs as a child: one run whose first check starts the fake tree and never finishes. With
 * <locked>, the check first makes a folder in the work folder that cannot be emptied (no write permission), so the
 * work folder cannot be removed.
 */
function fixtureSource(tmp: string, locked = false): string {
  return [
    `import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';`,
    `import { runUploadCheck } from ${JSON.stringify(pathToFileURL(join(engine, 'tools/upload-check/run.mjs')).href)};`,
    `import { runChild } from ${JSON.stringify(pathToFileURL(join(engine, 'tools/upload-check/website-build.mjs')).href)};`,
    `const hangs = async ({ workdir }) => {`,
    ...(locked ? [`  mkdirSync(workdir + '/locked'); writeFileSync(workdir + '/locked/file', 'x'); chmodSync(workdir + '/locked', 0o555);`] : []),
    `  process.stdout.write(workdir + '\\n');`,
    `  return runChild(process.execPath, ['-e', ${JSON.stringify(FAKE_TREE)}], { cwd: workdir, env: { PATH: '/usr/bin:/bin', UC_PIDFILE: process.env.UC_PIDFILE, UC_WORKDIR: workdir }, log: workdir + '/fake.log', limitMs: 600000 });`,
    `};`,
    `await runUploadCheck({ rev: 'HEAD', tmp: ${JSON.stringify(tmp)}, host: async () => ({ processes: [], freePercent: 80 }), log: () => {}, checks: { toolsFolder: hangs, websiteBuild: hangs, startChecks: hangs } });`,
    ''
  ].join('\n');
}

/** True once the fixture has named its work folder and both fake writers are writing into it. */
function writersBusy(stdout: string, pidFile: string): boolean {
  const folder = stdout.split('\n')[0];
  if (!stdout.includes('\n') || !folder || !existsSync(pidFile)) return false;
  let pids: { child: number; grandchild: number };
  try { pids = JSON.parse(readFileSync(pidFile, 'utf8')); } catch { return false; }
  return existsSync(join(folder, `busy-${pids.child}`)) && existsSync(join(folder, `busy-${pids.grandchild}`));
}

/** Runs the fixture as a child, sends <signal> once both fake writers are writing into its work folder, and reports how it ended. */
function runFixtureUntil(signal: NodeJS.Signals, { locked = false } = {}) {
  return new Promise<{ code: number | null; exitSignal: NodeJS.Signals | null; stderr: string; folder: string; tmp: string; pids: { child: number; grandchild: number } }>((resolveRun, rejectRun) => {
    const dir = scratch();
    const tmp = join(dir, 'tmp');
    mkdirSync(tmp);
    const pidFile = join(dir, 'pids.json');
    const script = join(dir, 'fixture.mjs');
    writeFileSync(script, fixtureSource(tmp, locked));
    const child = spawn(process.execPath, [script], { env: { ...process.env, UC_PIDFILE: pidFile }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let sent = false;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    const watch = setInterval(() => {
      if (!sent && writersBusy(stdout, pidFile)) { sent = true; child.kill(signal); }
    }, 50);
    const giveUp = setTimeout(() => { child.kill('SIGKILL'); }, 30_000);
    child.on('error', rejectRun);
    // 'close', not 'exit': the fixture's stderr must be read to its end before the run is judged.
    child.on('close', (code, exitSignal) => {
      clearInterval(watch);
      clearTimeout(giveUp);
      if (!existsSync(pidFile)) { rejectRun(new Error('the fixture never started its fake tree')); return; }
      // An empty first line would make "the work folder is gone" pass without a folder, so it fails the run instead.
      const folder = stdout.split('\n')[0];
      if (!folder) { rejectRun(new Error('the fixture never named its work folder')); return; }
      if (!sent) { rejectRun(new Error('the fixture ended before the signal was sent')); return; }
      resolveRun({ code, exitSignal, stderr, folder, tmp, pids: JSON.parse(readFileSync(pidFile, 'utf8')) });
    });
  });
}

describe('a run stopped by a signal', () => {
  for (const [signal, code] of [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]] as const) {
    it(`exits ${code} on ${signal}, stops the processes its check started, then removes its work folder while they were writing into it`, async () => {
      const outcome = await runFixtureUntil(signal);
      // Both writers are gone first, so a leftover folder below is the run's fault, not a writer still at work.
      expect(await stoppedWithin(outcome.pids.grandchild)).toBe(true);
      expect(await stoppedWithin(outcome.pids.child)).toBe(true);
      expect({ code: outcome.code, signal: outcome.exitSignal, stderr: outcome.stderr }).toEqual({ code, signal: null, stderr: '' });
      expect(existsSync(outcome.folder)).toBe(false);
      expect(readdirSync(outcome.tmp)).toEqual([]);
    }, 60_000);
  }

  it('names a work folder it could not remove in one stderr line, and keeps the exit code', async () => {
    const outcome = await runFixtureUntil('SIGTERM', { locked: true });
    try {
      expect(await stoppedWithin(outcome.pids.grandchild)).toBe(true);
      expect(await stoppedWithin(outcome.pids.child)).toBe(true);
      expect(outcome.code).toBe(143);
      const lines = outcome.stderr.split('\n').filter((line) => line !== '');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^UPLOAD_CHECK_WORK_FOLDER_LEFT: /u);
      expect(lines[0]).toContain(outcome.folder);
      expect(existsSync(outcome.folder)).toBe(true);
    } finally {
      // The locked folder must be writable again, or the scratch folder could not be removed after the test.
      if (existsSync(join(outcome.folder, 'locked'))) chmodSync(join(outcome.folder, 'locked'), 0o755);
    }
  }, 60_000);
});
