import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
