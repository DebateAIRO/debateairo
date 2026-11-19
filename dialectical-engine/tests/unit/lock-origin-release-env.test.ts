import { describe, expect, it } from 'vitest';
const releaseEnv = await import('../../deploy/' + 'preview-lifecycle/v1/release-env.mjs');
const sameChecks = releaseEnv.sameChecks as (releases: readonly unknown[]) => readonly Readonly<{ check: string; ok: boolean }>[];

/**
 * The SAME checks hold a release's website and API to one public name, and two live releases to the same one, since the
 * server answers as one name at a time. Which names are allowed is the launchers' check (public-origins.mjs).
 */
const PREVIEW = 'https://v3-preview.dezbatere.ro', MAIN = 'https://dezbatere.ro';
const OLD_KEY = ['r17', 'aaaaaaaaaaaa'].join('-'), NEW_KEY = ['r18', '0123456789ab'].join('-');
const CONFIG = JSON.stringify({ deployment: 'v3-preview', free_model_ids: ['zai-org/GLM-5.3-Flash'], requested_thinking_level: 'high',
  budget_socket: '/run/debateai-v3-preview/deepinfra-budget-v3.sock', scope_id: 'preview-team-v2-20261009' });
const TEAM = JSON.stringify(['0b9c6c1e-5f3a-4f0e-9d6b-1a2b3c4d5e6f']);
const PORTS = { A: { ui: '3100', api: '3101' }, B: { ui: '3200', api: '3201' } } as const;
/** A hand-built release whose files agree on everything; `origins` names each file's PUBLIC_APP_URL. */
function release(label: string, slot: 'A' | 'B', key: string, origins: Readonly<{ api?: string; ui?: string }> = { api: PREVIEW, ui: PREVIEW }) {
  const shared = { REGISTER_VERSION: key.slice(1, key.indexOf('-')), RELEASE_KEY: key, DEBATEAI_DEPLOYMENT_MODE: 'hosted', PREVIEW_PROVIDER_TEST_CONFIG_JSON: CONFIG,
    PREVIEW_TEAM_USER_IDS_JSON: TEAM, HATCHET_WORKFLOW_NAME: 'debateai-preview-run' };
  const named = (origin: string | undefined) => origin === undefined ? {} : { PUBLIC_APP_URL: origin };
  return {
    label, slot,
    api: { NODE_ENV: 'production', ...named(origins.api), API_HOST: '127.0.0.1', API_PORT: PORTS[slot].api, ...shared },
    runner: { NODE_ENV: 'production', ...shared, RUNNER_WORKER_ID: `debateai-preview-runner-${key}`, HATCHET_WORKER_NAME: `debateai-preview-runner-${key}` },
    ui: { NODE_ENV: 'production', ...named(origins.ui), PORT: PORTS[slot].ui, DIALECTICAL_UI_HOST: '127.0.0.1', DIALECTICAL_API_BASE: `http://127.0.0.1:${PORTS[slot].api}`, RELEASE_KEY: key }
  };
}
const bad = (results: readonly { check: string; ok: boolean }[]) => results.filter(result => !result.ok).map(result => result.check);

describe('the public name in the SAME checks', () => {
  it('passes the default files and names each check', () => {
    const one = sameChecks([release('t', 'A', OLD_KEY)]);
    expect(bad(one)).toEqual([]);
    expect(one.map(result => result.check)).toContain('SAME_UI_API_PUBLIC_APP_URL:t');
    expect(one.map(result => result.check)).not.toContain('SAME_PUBLIC_APP_URL');
    const two = sameChecks([release('old-v1', 'A', OLD_KEY), release('new-v1', 'B', NEW_KEY)]);
    expect(bad(two)).toEqual([]);
    expect(two.map(result => result.check)).toEqual(expect.arrayContaining(['SAME_UI_API_PUBLIC_APP_URL:old-v1', 'SAME_UI_API_PUBLIC_APP_URL:new-v1', 'SAME_PUBLIC_APP_URL']));
  });

  it('refuses a release whose website and API name different origins', () => {
    expect(bad(sameChecks([release('t', 'A', OLD_KEY, { api: PREVIEW, ui: MAIN })]))).toEqual(['SAME_UI_API_PUBLIC_APP_URL:t']);
    expect(bad(sameChecks([release('t', 'A', OLD_KEY, { api: MAIN, ui: PREVIEW })]))).toEqual(['SAME_UI_API_PUBLIC_APP_URL:t']);
    expect(bad(sameChecks([release('t', 'A', OLD_KEY, { api: PREVIEW })]))).toEqual(['SAME_UI_API_PUBLIC_APP_URL:t']);
  });

  it('refuses two releases that name different origins', () => {
    expect(bad(sameChecks([release('old-v1', 'A', OLD_KEY), release('new-v1', 'B', NEW_KEY, { api: MAIN, ui: MAIN })]))).toEqual(['SAME_PUBLIC_APP_URL']);
  });

  it('passes when every file names the main origin', () => {
    const main = { api: MAIN, ui: MAIN };
    expect(bad(sameChecks([release('t', 'A', OLD_KEY, main)]))).toEqual([]);
    expect(bad(sameChecks([release('old-v1', 'A', OLD_KEY, main), release('new-v1', 'B', NEW_KEY, main)]))).toEqual([]);
  });

  it('passes hand-built files without the key at all', () => {
    expect(bad(sameChecks([release('old-v1', 'A', OLD_KEY, {}), release('new-v1', 'B', NEW_KEY, {})]))).toEqual([]);
  });
});
