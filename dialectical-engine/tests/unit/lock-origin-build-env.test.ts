import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
const tool = await import('../../deploy/' + 'preview-release/v1/release-artifacts.mjs');
const environment = await import('../../deploy/' + 'preview-auth-dev/v1/environment.mjs');
const { PREVIEW_ORIGIN, PREVIEW_SITE_KEY } = await import('../../deploy/' + 'preview-auth-dev/v1/turnstile-custody.mjs');

/**
 * `build-env --origin` reports the public build values for the name ui.env answers as, so the hash comparison with
 * ui.env still works after the server answers as the main name. The build itself is the same for both names.
 */
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const KEY = `r10-${'c'.repeat(12)}`;
const run = (argv: string[]) => tool.runCommand(argv);

describe('build-env --origin', () => {
  it('reports the main origin with the same site key, each with its sha256', async () => {
    const report = await run(['build-env', '--origin', 'https://dezbatere.ro', '--release-key', KEY]);
    expect(report.values.PUBLIC_APP_URL).toEqual({ value: 'https://dezbatere.ro', sha256: sha('https://dezbatere.ro') });
    expect(report.values.TURNSTILE_SITE_KEY).toEqual({ value: PREVIEW_SITE_KEY, sha256: sha(PREVIEW_SITE_KEY) });
    expect(Object.keys(report.values)).toEqual(Object.keys(tool.UI_PUBLIC_BUILD_VALUES));
    for (const [key, { value, sha256 }] of Object.entries(report.values as Record<string, { value: string; sha256: string }>)) expect(sha256, key).toBe(sha(value));
  });

  it('reports values the website launcher admits under that name', async () => {
    const report = await run(['build-env', '--release-key', KEY, '--models', 'multi-model', '--origin', 'https://dezbatere.ro']);
    const values = Object.fromEntries(Object.entries(report.values as Record<string, { value: string }>).map(([key, { value }]) => [key, value]));
    const runtimeOnly = { PORT: '3100', DIALECTICAL_UI_HOST: '127.0.0.1', DIALECTICAL_API_BASE: 'http://127.0.0.1:3101' };
    const narrowed = environment.narrowEnvironment('ui', { ...values, ...runtimeOnly }, { builtModelRosterFlag: environment.PREVIEW_MODEL_ROSTER_FLAGS['multi-model'] },
      { registerVersion: '10' }, { uiPort: '3100', apiPort: '3101', sourceRevision: 'c'.repeat(40) });
    expect(narrowed.environment.PUBLIC_APP_URL).toBe('https://dezbatere.ro');
  });

  it('gives exactly the default report without --origin or with the test name', async () => {
    const plain = await run(['build-env', '--release-key', KEY]);
    expect(plain).toEqual(tool.buildEnvironmentReport(KEY));
    expect(plain.values.PUBLIC_APP_URL.value).toBe(PREVIEW_ORIGIN);
    expect(JSON.stringify(await run(['build-env', '--release-key', KEY, '--origin', PREVIEW_ORIGIN]))).toBe(JSON.stringify(plain));
    expect(Object.fromEntries(Object.entries(plain.values as Record<string, { value: string }>).map(([key, { value }]) => [key, value])))
      .toEqual(tool.uiPublicBuildValues(KEY));
  });

  it.each(['https://www.dezbatere.ro', 'https://dezbatere.ro/', 'http://dezbatere.ro', 'https://evil.test', 'main'])('refuses --origin %s', async origin => {
    await expect(run(['build-env', '--origin', origin, '--release-key', KEY])).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED', fields: ['--origin'] });
  });

  it('is a flag of build-env only', () => {
    expect(() => tool.parseArguments(['ui-build', '--source', '/x.json', '--release-key', KEY, '--out', '/y.json', '--origin', 'https://dezbatere.ro'])).toThrow(/ARGUMENTS_REFUSED/);
    expect(tool.parseArguments(['build-env', '--release-key', KEY, '--origin', 'https://dezbatere.ro']).options['--origin']).toBe('https://dezbatere.ro');
  });

  it('leaves the website build values on the test name', () => {
    expect(tool.UI_PUBLIC_BUILD_VALUES.PUBLIC_APP_URL).toBe(PREVIEW_ORIGIN);
    expect(tool.UI_BUILD_ENVIRONMENT.PUBLIC_APP_URL).toBe(PREVIEW_ORIGIN);
    expect(tool.uiPublicBuildValues(KEY).TURNSTILE_SITE_KEY).toBe(PREVIEW_SITE_KEY);
  });
});
