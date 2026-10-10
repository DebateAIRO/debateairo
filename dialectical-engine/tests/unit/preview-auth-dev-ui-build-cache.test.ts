import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// String-built path, as the other deploy tests do: the .mjs module has no type declarations.
const { dropBuildCache } = await import('../../deploy/' + 'preview-auth-dev/v1/ui-build.mjs');

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function release(): { root: string; next: string } {
  const root = mkdtempSync(join(tmpdir(), 'ui-build-cache-'));
  roots.push(root);
  const next = join(root, 'dialectical-engine/apps/ui/.next');
  mkdirSync(join(next, 'cache/webpack/server-production'), { recursive: true });
  mkdirSync(join(next, 'static'), { recursive: true });
  writeFileSync(join(next, 'cache/webpack/server-production/0.pack'), 'build-time cache');
  writeFileSync(join(next, 'cache/.previewinfo'), 'kept');
  writeFileSync(join(next, 'BUILD_ID'), 'abc');
  writeFileSync(join(next, 'static/served.js'), 'served');
  return { root, next };
}

describe('preview UI build: the webpack build cache is dropped before the inventory', () => {
  it('removes only .next/cache/webpack and keeps everything the server reads', async () => {
    const { root, next } = release();
    await dropBuildCache(root);
    expect(existsSync(join(next, 'cache/webpack'))).toBe(false);
    expect(existsSync(join(next, 'cache/.previewinfo'))).toBe(true);
    expect(existsSync(join(next, 'BUILD_ID'))).toBe(true);
    expect(existsSync(join(next, 'static/served.js'))).toBe(true);
  });
  it('is a no-op when there is no build cache', async () => {
    const { root, next } = release();
    await dropBuildCache(root);
    await expect(dropBuildCache(root)).resolves.toBeUndefined();
    expect(existsSync(join(next, 'BUILD_ID'))).toBe(true);
  });
});
