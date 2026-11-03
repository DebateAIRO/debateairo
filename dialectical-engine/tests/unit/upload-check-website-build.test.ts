import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
const website = await import('../../tools/' + 'upload-check/website-build.mjs');
const hotfix = await import('../../tools/' + 'source-map-hotfix.mjs');

// The repository root is one level above dialectical-engine/, where git archive reads the release from.
const engine = resolve(import.meta.dirname, '../..');
const repo = resolve(engine, '..');
// The folder that holds pnpm on this Mac, as the checker is given it.
const pnpmDir = dirname(execFileSync('sh', ['-c', 'command -v pnpm'], { encoding: 'utf8' }).trim());
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const scratch = () => { const root = realpathSync(mkdtempSync(join(tmpdir(), 'upload-check-website-'))); roots.push(root); return root; };

describe('the early allowances the package helper grants', () => {
  it('earlyUseInForce lists only unexpired allowances', () => {
    expect(hotfix.earlyUseInForce(Date.parse('2026-11-02T12:00:00Z'))).toEqual([
      { pin: '@isaacs/nonrecursive-glob-match@1.0.1', until: '2026-11-03T04:24:52.559Z' },
      { pin: 'path-scurry@3.0.0', until: '2026-11-03T21:14:48.842Z' },
      { pin: 'glob@14.0.2', until: '2026-11-03T22:07:00.325Z' },
      { pin: 'minimatch@11.0.1', until: '2026-11-03T22:26:03.755Z' }
    ]);
    expect(hotfix.earlyUseInForce(Date.parse('2026-11-04T00:00:00Z'))).toEqual([]);
    // No allowance applies before its day (2026-11-01).
    expect(hotfix.earlyUseInForce(Date.parse('2026-10-31T00:00:00Z'))).toEqual([]);
  });
});

describe('check 2: the release install and the website build', () => {
  it('an older target without uiBuildEnvironment is not checked', async () => {
    const root = scratch();
    const tool = join(root, 'dialectical-engine/deploy/preview-release/v1/release-artifacts.mjs');
    mkdirSync(dirname(tool), { recursive: true });
    writeFileSync(tool, "export const LAYOUT = Object.freeze({});\n");
    const result = await website.buildWebsiteIn({ root, node: process.execPath, pnpmDir });
    expect(result).toMatchObject({ name: 'website-build', status: 'not-checked', lines: ['website build: this commit has no uiBuildEnvironment export'] });
    expect(typeof result.seconds).toBe('number');
  });

  // A release root with a release tool whose build environment is plain, and a fake pnpm in its own folder that exits 0.
  // With <writesBuildId>, the fake pnpm leaves Next's build id file where a real build leaves it.
  function fakeBuild({ writesBuildId }: { writesBuildId: boolean }) {
    const root = scratch();
    const deploy = join(root, 'dialectical-engine/deploy');
    for (const folder of ['preview-lifecycle', 'preview-auth-dev', 'preview-release/v1']) mkdirSync(join(deploy, folder), { recursive: true });
    writeFileSync(join(deploy, 'preview-release/v1/release-artifacts.mjs'), "export async function uiBuildEnvironment() { return { PATH: '/usr/bin:/bin' }; }\n");
    const fakePnpmDir = join(scratch(), 'bin');
    mkdirSync(fakePnpmDir);
    writeFileSync(join(fakePnpmDir, 'pnpm'), writesBuildId ? '#!/bin/sh\nmkdir -p apps/ui/.next && echo fake > apps/ui/.next/BUILD_ID\n' : '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    return { root, fakePnpmDir };
  }

  it('a build that exits 0 but leaves no output is refused', async () => {
    const { root, fakePnpmDir } = fakeBuild({ writesBuildId: false });
    const result = await website.buildWebsiteIn({ root, node: process.execPath, pnpmDir: fakePnpmDir });
    expect(result.status).toBe('refused');
    expect(result.lines).toContain('UPLOAD_CHECK_WEBSITE_BUILD_NO_OUTPUT');
  }, 60_000);

  it('a build that exits 0 and leaves Next\'s build id file goes on to the release-folder tools', async () => {
    const { root, fakePnpmDir } = fakeBuild({ writesBuildId: true });
    const result = await website.buildWebsiteIn({ root, node: process.execPath, pnpmDir: fakePnpmDir });
    expect(result.status, result.lines.join('\n')).toBe('passed');
    expect(result.lines).toContain('website build: built with the release tool\'s own environment');
  }, 60_000);

  it('a failed online fill is refused, not thrown', async () => {
    const { result, root } = await website.checkWebsiteBuild({
      repo, rev: 'HEAD', workdir: scratch(), node: process.execPath, pnpmDir, extraEnv: { PNPM_CONFIG_REGISTRY: 'http://127.0.0.1:9' }
    });
    expect(result.name).toBe('website-build');
    expect(result.status).toBe('refused');
    expect(result.lines).toContain('the online package fill failed');
    expect(root).toBeNull();
  }, 600_000);
});

// A fake command for the timeout test: a child that starts a grandchild, and both stay alive for a minute at most, so a
// failing test cannot leave them running for long. Their pids go to UC_PIDFILE.
const FAKE_TREE = "const { spawn } = require('node:child_process'); const { writeFileSync } = require('node:fs'); const grand = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' }); writeFileSync(process.env.UC_PIDFILE, JSON.stringify({ child: process.pid, grandchild: grand.pid })); setTimeout(() => {}, 60000);";
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
/** True once <pid> is gone; false if it is still there after <ms>. */
async function stoppedWithin(pid: number, ms = 5_000) {
  const until = Date.now() + ms;
  while (alive(pid) && Date.now() < until) await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  return !alive(pid);
}

describe('a timed-out step takes its whole process group with it', () => {
  it('no process the timed-out command started is left', async () => {
    const dir = scratch();
    const pidFile = join(dir, 'pids.json');
    const code = await website.runChild(process.execPath, ['-e', FAKE_TREE], { cwd: dir, env: { PATH: '/usr/bin:/bin', UC_PIDFILE: pidFile }, log: join(dir, 'fake.log'), limitMs: 3_000 });
    expect(code).toBeNull();
    const pids = JSON.parse(readFileSync(pidFile, 'utf8')) as { child: number; grandchild: number };
    expect(await stoppedWithin(pids.child)).toBe(true);
    expect(await stoppedWithin(pids.grandchild)).toBe(true);
  }, 60_000);
});
