import { describe, expect, it } from 'vitest';
import * as runtime from '../../packages/register/src/runtime-environment.js';
import { fixtureReleaseKey, validApiEnvironmentFixture } from '../support/apiEnvironmentFixture.js';
const env = await import('../../deploy/' + 'preview-auth-dev/v1/environment.mjs');
const { PREVIEW_SITE_KEY } = await import('../../deploy/' + 'preview-auth-dev/v1/turnstile-custody.mjs');

/**
 * The public name a release answers as is its PUBLIC_APP_URL, and it must be exactly one of two listed origins: the
 * test name (the default) or the main site's name, the latter only in hosted mode. Anything else is refused at start,
 * with the launcher's one message and a content-free name in the cause.
 */
const PREVIEW = 'https://v3-preview.dezbatere.ro', MAIN = 'https://dezbatere.ro';
const CODES = ['PREVIEW_ORIGIN_NOT_LISTED', 'PREVIEW_MAIN_ORIGIN_NOT_HOSTED', 'PREVIEW_ORIGIN_SITE_KEY_MISMATCH', 'PREVIEW_STAFF_ORIGIN_MISMATCH'];
const native = { registerVersion: '12' };
const approved = { apiPort: '3101', uiPort: '3100', mailExecutable: '/opt/release/mail-handoff.mjs', mailFrom: 'noreply@dezbatere.ro', sourceRevision: '0123456789ab'.padEnd(40, 'c') };
const local = (): Record<string, string> => ({ ...validApiEnvironmentFixture(), NODE_ENV: 'production', REGISTER_VERSION: '12', RELEASE_KEY: fixtureReleaseKey('12'),
  PUBLIC_APP_URL: PREVIEW, API_PORT: '3101', API_HOST: '127.0.0.1', MAIL_SENDMAIL_PATH: approved.mailExecutable, MAIL_FROM: 'noreply@dezbatere.ro' });
const GATE = JSON.stringify({ deployment: 'v3-preview', free_model_ids: ['zai-org/GLM-5.3-Flash'], requested_thinking_level: 'high', budget_socket: '/run/debateai-v3-preview/team-budget-v2.sock', scope_id: 'preview-team-v2-20261009' });
const hosted = (): Record<string, string> => ({ ...local(), DEBATEAI_DEPLOYMENT_MODE: 'hosted', PREVIEW_PROVIDER_TEST_CONFIG_JSON: GATE, PREVIEW_TEAM_USER_IDS_JSON: '["0b7c6f1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e"]',
  GEOIP_COUNTRY_DB_PATH: '/var/lib/debateai-geoip/dbip-country-lite.mmdb', TOR_EXIT_LIST_PATH: '/var/lib/debateai-geoip/tor-exit-list.txt', TURNSTILE_SOCKET_PATH: '/run/debateai-preview-turnstile/siteverify.sock' });
const website = (patch: Record<string, string> = {}): Record<string, string> => ({ NODE_ENV: 'production', PUBLIC_APP_URL: PREVIEW, PORT: '3100', DIALECTICAL_UI_HOST: '127.0.0.1',
  DIALECTICAL_API_BASE: 'http://127.0.0.1:3101', NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON: env.PREVIEW_FREE_MODEL_IDS_JSON, RELEASE_KEY: fixtureReleaseKey('12'), ...patch });
const built = { builtModelRosterFlag: env.PREVIEW_FREE_MODEL_IDS_JSON };
const staff = (origin: string, rpId: string) => ({ STAFF_ACCESS_POLICY_VERSION: '2', STAFF_WEBAUTHN_ORIGIN: origin, STAFF_WEBAUTHN_RP_ID: rpId,
  STAFF_INDEPENDENT_ALERT_CONFIG_PATH: '/etc/debateai-v3-preview/staff/alerts.json', STAFF_ALERT_OPERATOR_MODULE_PATH: '/opt/debateai-v3-preview/staff/alert-operator.mjs',
  STAFF_ALERT_OPERATOR_MODULE_SHA256: 'a'.repeat(64) });
const api = (input: Record<string, string>) => env.narrowEnvironment('api', input, runtime, native, approved);
const ui = (input: Record<string, string>) => env.narrowEnvironment('ui', input, built, native, approved);
/** The refusal a call throws: its message and its cause. */
function refusalOf(call: () => unknown): { message: string; cause: unknown } {
  try { call(); } catch (error) { return { message: (error as Error).message, cause: (error as Error).cause }; }
  throw new Error('NOT_REFUSED');
}

describe('the main origin', () => {
  it('admits the API under the main origin in hosted mode, with PUBLIC_APP_URL unchanged', () => {
    const result = api({ ...hosted(), PUBLIC_APP_URL: MAIN });
    expect(result.deploymentMode).toBe('hosted');
    expect(result.environment.PUBLIC_APP_URL).toBe(MAIN);
  });

  it('refuses the main origin in local mode by name', () => {
    expect(refusalOf(() => api({ ...local(), PUBLIC_APP_URL: MAIN }))).toEqual({ message: 'PREVIEW_ENVIRONMENT_REFUSED', cause: 'PREVIEW_MAIN_ORIGIN_NOT_HOSTED' });
    // The mode is read as written: another spelling is not hosted.
    expect(refusalOf(() => api({ ...hosted(), PUBLIC_APP_URL: MAIN, DEBATEAI_DEPLOYMENT_MODE: 'Hosted' })).cause).toBe('PREVIEW_MAIN_ORIGIN_NOT_HOSTED');
  });

  it.each(['https://dezbatere.ro/', 'https://www.dezbatere.ro', 'http://dezbatere.ro', 'https://Dezbatere.ro', 'https://evil.test', 'https://v3-preview.dezbatere.ro/', ' https://dezbatere.ro'])(
    'refuses %s as an unlisted origin, for the API (both modes) and the website', origin => {
      for (const call of [() => api({ ...local(), PUBLIC_APP_URL: origin }), () => api({ ...hosted(), PUBLIC_APP_URL: origin }), () => ui(website({ PUBLIC_APP_URL: origin }))])
        expect(refusalOf(call)).toEqual({ message: 'PREVIEW_ENVIRONMENT_REFUSED', cause: 'PREVIEW_ORIGIN_NOT_LISTED' });
    });

  it('refuses a missing PUBLIC_APP_URL as unlisted', () => {
    const withoutApi = local(); delete withoutApi.PUBLIC_APP_URL;
    const withoutUi = website(); delete withoutUi.PUBLIC_APP_URL;
    expect(refusalOf(() => api(withoutApi)).cause).toBe('PREVIEW_ORIGIN_NOT_LISTED');
    expect(refusalOf(() => ui(withoutUi)).cause).toBe('PREVIEW_ORIGIN_NOT_LISTED');
  });

  it('admits the website under the main origin, with or without the site key, and only with that origin\'s key', () => {
    expect(ui(website({ PUBLIC_APP_URL: MAIN })).environment.PUBLIC_APP_URL).toBe(MAIN);
    expect(ui(website({ PUBLIC_APP_URL: MAIN, TURNSTILE_SITE_KEY: PREVIEW_SITE_KEY })).environment.TURNSTILE_SITE_KEY).toBe(PREVIEW_SITE_KEY);
    for (const origin of [PREVIEW, MAIN])
      expect(refusalOf(() => ui(website({ PUBLIC_APP_URL: origin, TURNSTILE_SITE_KEY: '0x4AAAAAAAother000000000' }))))
        .toEqual({ message: 'PREVIEW_ENVIRONMENT_REFUSED', cause: 'PREVIEW_ORIGIN_SITE_KEY_MISMATCH' });
  });

  it('binds staff passkeys (policy 2) to the name the API answers as', () => {
    expect(api({ ...hosted(), PUBLIC_APP_URL: MAIN, ...staff(MAIN, 'dezbatere.ro') }).environment.STAFF_WEBAUTHN_RP_ID).toBe('dezbatere.ro');
    expect(api({ ...local(), ...staff(PREVIEW, 'v3-preview.dezbatere.ro') }).environment.STAFF_WEBAUTHN_RP_ID).toBe('v3-preview.dezbatere.ro');
    for (const [input, name] of [
      [{ ...hosted(), PUBLIC_APP_URL: MAIN, ...staff(MAIN, 'v3-preview.dezbatere.ro') }, 'main name, test relying party'],
      [{ ...hosted(), PUBLIC_APP_URL: MAIN, ...staff(PREVIEW, 'v3-preview.dezbatere.ro') }, 'main name, test staff origin and relying party'],
      [{ ...local(), ...staff(MAIN, 'dezbatere.ro') }, 'test name, main staff origin and relying party'],
      [{ ...hosted(), ...staff(PREVIEW, 'dezbatere.ro') }, 'test name, main relying party']
    ] as const) expect(refusalOf(() => api(input)), name).toEqual({ message: 'PREVIEW_ENVIRONMENT_REFUSED', cause: 'PREVIEW_STAFF_ORIGIN_MISMATCH' });
  });

  it('leaves the default settings exactly as before', () => {
    const before = local();
    const result = api(before);
    expect(result).toEqual({ environment: { ...before, PATH: '/usr/local/bin:/usr/bin:/bin' }, selectedRegisterVersion: '12', deploymentMode: 'local' });
    expect(api(hosted())).toEqual({ environment: { ...hosted(), PATH: '/usr/local/bin:/usr/bin:/bin' }, selectedRegisterVersion: '12', deploymentMode: 'hosted' });
    const page = website({ TURNSTILE_SITE_KEY: PREVIEW_SITE_KEY });
    expect(ui(page)).toEqual({ environment: { ...page, PATH: '/usr/local/bin:/usr/bin:/bin' }, selectedRegisterVersion: null, deploymentMode: 'local' });
    // A default-name refusal that has nothing to do with the name stays unnamed.
    expect(refusalOf(() => api({ ...local(), API_PORT: '3201' }))).toEqual({ message: 'PREVIEW_ENVIRONMENT_REFUSED', cause: undefined });
    expect(refusalOf(() => ui(website({ PORT: '3200' })))).toEqual({ message: 'PREVIEW_ENVIRONMENT_REFUSED', cause: undefined });
  });

  it('never puts a value in a refusal', () => {
    const inputs: (() => unknown)[] = [
      () => api({ ...local(), PUBLIC_APP_URL: 'https://evil.test' }), () => api({ ...local(), PUBLIC_APP_URL: MAIN }),
      () => ui(website({ PUBLIC_APP_URL: 'https://evil.test' })), () => ui(website({ TURNSTILE_SITE_KEY: '0x4AAAAAAAother000000000' })),
      () => api({ ...hosted(), PUBLIC_APP_URL: MAIN, ...staff(MAIN, 'v3-preview.dezbatere.ro') })
    ];
    for (const call of inputs) {
      const { message, cause } = refusalOf(call);
      expect(message).toBe('PREVIEW_ENVIRONMENT_REFUSED');
      expect(CODES).toContain(cause);
      expect(`${message} ${String(cause)}`).not.toMatch(/dezbatere|evil|0x4A|https?:/);
    }
  });
});
