import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// String-built path, as the other deploy tests do: the .mjs module has no type declarations.
const { dropBuildCache, recordModelRosterFlag, builtModelRosterFlag, MODEL_ROSTER_FILE } = await import('../../deploy/' + 'preview-auth-dev/v1/ui-build.mjs');
const { PREVIEW_MODEL_ROSTER_FLAGS } = await import('../../deploy/' + 'preview-auth-dev/v1/environment.mjs');

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

describe('preview UI build: the model list the website was built with is recorded inside the build', () => {
  it('records each reviewed list once and reads it back', async () => {
    for (const flag of Object.values(PREVIEW_MODEL_ROSTER_FLAGS) as string[]) {
      const { root, next } = release();
      await recordModelRosterFlag(root, flag);
      expect(MODEL_ROSTER_FILE).toBe('preview-model-roster.json');
      expect(JSON.parse(readFileSync(join(next, MODEL_ROSTER_FILE), 'utf8'))).toEqual({ NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON: flag });
      expect(statSync(join(next, MODEL_ROSTER_FILE)).mode & 0o777).toBe(0o644);
      await expect(builtModelRosterFlag(next)).resolves.toBe(flag);
      // Never overwritten: a second record of the same build refuses.
      await expect(recordModelRosterFlag(root, flag)).rejects.toThrow();
    }
  });
  it('refuses to record an unreviewed list', async () => {
    const { root, next } = release();
    await expect(recordModelRosterFlag(root, '["deepseek-ai/DeepSeek-V4.1-Flash"]')).rejects.toThrow('PREVIEW_UI_MODEL_ROSTER_REFUSED');
    expect(existsSync(join(next, MODEL_ROSTER_FILE))).toBe(false);
  });
  it.each([
    ['a build without the record (an older tool): never guessed', null],
    ['an unreviewed list', JSON.stringify({ NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON: '["other/model"]' })],
    ['an extra field', JSON.stringify({ NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON: '["zai-org/GLM-5.3-Flash"]', extra: true })],
    ['not JSON', '{']
  ])('reading refuses %s', async (_name, bytes) => {
    const { next } = release();
    if (bytes !== null) writeFileSync(join(next, MODEL_ROSTER_FILE), bytes);
    await expect(builtModelRosterFlag(next)).rejects.toThrow('PREVIEW_UI_MODEL_ROSTER_REFUSED');
  });
  it('the UI launcher checks ui.env against the record after the build inventory, and the stage checks the record against the API config before anything starts', () => {
    const launch = readFileSync(resolve('deploy/preview-auth-dev/v1/launch-ui.mjs'), 'utf8');
    const verified = launch.indexOf('await verifyUiBuildManifest(build,source);'), narrowed = launch.indexOf("narrowEnvironment('ui',await readEnvironmentFile(plan.environment.path,plan.environment),{builtModelRosterFlag:await builtModelRosterFlag(build.buildRoot)}");
    expect(verified).toBeGreaterThan(0);
    expect(narrowed).toBeGreaterThan(verified);
    const stage = readFileSync(resolve('deploy/preview-auth-dev/v1/stage-runtime.mjs'), 'utf8');
    const check = stage.indexOf("if(!uiRosterMatchesApiConfig(modelRoster,environment.PREVIEW_PROVIDER_TEST_CONFIG_JSON))refuse('PREVIEW_STAGE_MODEL_ROSTER_REFUSED');");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(stage.indexOf('api=ownedChild('));
    expect(stage).toContain('NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON:modelRoster,');
  });
});
