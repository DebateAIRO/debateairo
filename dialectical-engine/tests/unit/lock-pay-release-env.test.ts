// Real payments and side-by-side releases: two releases on one database must name the same payment system, or each
// API would end the other's billing jobs as another payment system's. derive copies the owner's line forward as it is.
import { describe, expect, it } from 'vitest';
const releaseEnv = await import('../../deploy/' + 'preview-lifecycle/v1/release-env.mjs');
const deriveEnvironmentText = releaseEnv.deriveEnvironmentText as (input: Record<string, unknown>) => string;
const sameChecks = releaseEnv.sameChecks as (releases: readonly unknown[]) => readonly Readonly<{ check: string; ok: boolean }>[];

const OLD_KEY = ['r17', 'aaaaaaaaaaaa'].join('-'), NEW_KEY = ['r18', '0123456789ab'].join('-');
const BILLING = '/etc/debateai-v3-preview/billing';
const SANDBOX = ['NETOPIA_API_BASE_URL=https://secure-sandbox.netopia-payments.com', 'NETOPIA_POS_SIGNATURE=ABCD-EFGH-IJKL-MNOP-QRST',
 `NETOPIA_API_KEY_PATH=${BILLING}/netopia-api-key`, `NETOPIA_IPN_KEYS_PATH=${BILLING}/netopia-ipn-keys.pem`];
const LIVE = ['NETOPIA_API_BASE_URL=https://secure.netopia-payments.com/api', 'NETOPIA_POS_SIGNATURE=ABCD-EFGH-IJKL-MNOP-QRST',
 `NETOPIA_API_KEY_PATH=${BILLING}/live-netopia-api-key`, `NETOPIA_IPN_KEYS_PATH=${BILLING}/live-netopia-ipn-keys.pem`, 'PREVIEW_LIVE_PAYMENTS=real-money'];
const api = (lines: readonly string[]) => ['NODE_ENV=production', 'PUBLIC_APP_URL=https://v3-preview.dezbatere.ro', 'API_HOST=127.0.0.1', 'API_PORT=3101', 'REGISTER_VERSION=17',
 'DEBATEAI_DEPLOYMENT_MODE=hosted', 'HATCHET_WORKFLOW_NAME=debateai-preview-run',
 'MAIL_SENDMAIL_PATH=/opt/debateai-v3-preview/releases/auth-dev-candidate-r19-api/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs',
 'MAIL_FROM=noreply@dezbatere.ro', ...lines, ''].join('\n');
const RUNNER = ['NODE_ENV=production', 'REGISTER_VERSION=17', 'RUNNER_WORKER_ID=debateai-preview-runner', 'DEBATEAI_DEPLOYMENT_MODE=hosted',
 'HATCHET_WORKFLOW_NAME=debateai-preview-run', 'HATCHET_WORKER_NAME=debateai-preview-runner', ''].join('\n');
const UI = ['NODE_ENV=production', 'PUBLIC_APP_URL=https://v3-preview.dezbatere.ro', 'PORT=3100', 'DIALECTICAL_UI_HOST=127.0.0.1', 'DIALECTICAL_API_BASE=http://127.0.0.1:3101', ''].join('\n');
const parse = (text: string) => Object.fromEntries(text.split('\n').filter(Boolean).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const release = (label: string, slot: 'A' | 'B', releaseKey: string, apiLines: readonly string[], runnerExtra: readonly string[] = []) => ({
 label, slot,
 api: parse(deriveEnvironmentText({ service: 'api', sourceText: api(apiLines), releaseKey, slot, label })),
 runner: parse(deriveEnvironmentText({ service: 'runner', sourceText: RUNNER + runnerExtra.map(line => `${line}\n`).join(''), releaseKey, slot, label })),
 ui: parse(deriveEnvironmentText({ service: 'ui', sourceText: UI, releaseKey, slot, label }))
});
const verdict = (results: readonly { check: string; ok: boolean }[]) => results.filter(result => result.check === 'SAME_API_PAYMENT_SYSTEM').map(result => result.ok);

describe('SAME_API_PAYMENT_SYSTEM', () => {
 it.each([
  ['both without billing', [], [], true],
  ['both on NETOPIA\'s sandbox', SANDBOX, SANDBOX, true],
  ['the two sandbox bases (one sandbox system)', SANDBOX, [...SANDBOX.slice(1), 'NETOPIA_API_BASE_URL=https://secure.sandbox.netopia-payments.com'], true],
  ['both live with the owner\'s line', LIVE, LIVE, true],
  ['one live with the line, the other on the sandbox', LIVE, SANDBOX, false],
  ['one on the sandbox, the other live with the line', SANDBOX, LIVE, false],
  ['the line in one release only', LIVE, LIVE.filter(line => !line.startsWith('PREVIEW_LIVE_PAYMENTS=')), false],
  ['one with billing, the other without', SANDBOX, [], false],
  ['both on an address that is no NETOPIA base', [...SANDBOX.slice(1), 'NETOPIA_API_BASE_URL=https://secure.mobilpay.ro/pay'], [...SANDBOX.slice(1), 'NETOPIA_API_BASE_URL=https://secure.mobilpay.ro/pay'], false]
 ] as const)('%s: OK is %s', (_name, older, newer, ok) => {
  expect(verdict(sameChecks([release('old-v1', 'A', OLD_KEY, older), release('new-v1', 'B', NEW_KEY, newer)]))).toEqual([ok]);
 });

 it('is asked only across two releases, and only of the API files', () => {
  expect(verdict(sameChecks([release('old-v1', 'A', OLD_KEY, LIVE)]))).toEqual([]);
  // A runner or website file never carries a payment setting, so a stray one there is not this check's business.
  const results = sameChecks([release('old-v1', 'A', OLD_KEY, SANDBOX, ['NETOPIA_API_BASE_URL=https://secure.netopia-payments.com/api']), release('new-v1', 'B', NEW_KEY, SANDBOX)]);
  expect(verdict(results)).toEqual([true]);
 });

 it('derive copies the owner\'s line into the new release\'s API file as it is', () => {
  const text = deriveEnvironmentText({ service: 'api', sourceText: api(LIVE), releaseKey: NEW_KEY, slot: 'B', label: 'new-v1' });
  for (const line of LIVE) expect(text.split('\n')).toContain(line);
 });
});
