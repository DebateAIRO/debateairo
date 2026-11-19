// Real payments on the hosted preview: one owner line in the API's file, PREVIEW_LIVE_PAYMENTS=real-money, and the
// launcher's live rules. Without the line every sandbox rule holds as before (preview-auth-dev-environment.test.ts);
// with it the billing group must be wholly live and each refusal names what is wrong, never a value.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as runtime from '../../packages/register/src/runtime-environment.js';
import { fixtureReleaseKey, validApiEnvironmentFixture, validRunnerEnvironmentFixture } from '../support/apiEnvironmentFixture.js';
const env = await import('../../deploy/' + 'preview-auth-dev/v1/environment.mjs');
const egress = await import('../../deploy/' + 'preview-auth-dev/v1/egress-proxy.mjs');
const hosts = await import('../../packages/payments-netopia/src/hosts.js');

const native = { registerVersion: '12' };
const approved = { apiPort: '3101', uiPort: '3100', mailExecutable: '/opt/release/mail-handoff.mjs', mailFrom: 'noreply@dezbatere.ro', sourceRevision: '0123456789ab'.padEnd(40, 'c') };
const configured = (): Record<string, string> => ({ ...validApiEnvironmentFixture(), NODE_ENV: 'production', REGISTER_VERSION: '12', RELEASE_KEY: fixtureReleaseKey('12'),
 PUBLIC_APP_URL: 'https://v3-preview.dezbatere.ro', API_PORT: '3101', API_HOST: '127.0.0.1', MAIL_SENDMAIL_PATH: approved.mailExecutable, MAIL_FROM: 'noreply@dezbatere.ro' });
const PREVIEW = JSON.stringify({ deployment: 'v3-preview', free_model_ids: ['zai-org/GLM-5.3-Flash'], requested_thinking_level: 'high', budget_socket: '/run/debateai-v3-preview/team-budget-v2.sock', scope_id: 'preview-team-v2-20261009' });
const hosted = (): Record<string, string> => ({ ...configured(), DEBATEAI_DEPLOYMENT_MODE: 'hosted', PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_TEAM_USER_IDS_JSON: '["0b7c6f1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e"]',
 GEOIP_COUNTRY_DB_PATH: '/var/lib/debateai-geoip/dbip-country-lite.mmdb', TOR_EXIT_LIST_PATH: '/var/lib/debateai-geoip/tor-exit-list.txt', TURNSTILE_SOCKET_PATH: '/run/debateai-preview-turnstile/siteverify.sock' });
const BILLING = '/etc/debateai-v3-preview/billing';
const SANDBOX = { NETOPIA_API_BASE_URL: 'https://secure-sandbox.netopia-payments.com', NETOPIA_POS_SIGNATURE: 'ABCD-EFGH-IJKL-MNOP-QRST',
 NETOPIA_API_KEY_PATH: `${BILLING}/netopia-api-key`, NETOPIA_IPN_KEYS_PATH: `${BILLING}/netopia-ipn-keys.pem`,
 QUADERNO_API_BASE_URL: 'https://dezbatere-test.sandbox-quadernoapp.com/api', QUADERNO_API_KEY_PATH: `${BILLING}/quaderno-api-key`,
 SMARTBILL_API_BASE_URL: 'https://smartbill.invalid', SMARTBILL_CREDENTIALS_PATH: `${BILLING}/smartbill-credentials`, SMARTBILL_SERIES: 'DBAI',
 OWNER_REPORT_EMAIL_PATH: `${BILLING}/owner-report-email` };
const LIVE = { NETOPIA_API_BASE_URL: 'https://secure.netopia-payments.com/api', NETOPIA_POS_SIGNATURE: 'ABCD-EFGH-IJKL-MNOP-QRST',
 NETOPIA_API_KEY_PATH: `${BILLING}/live-netopia-api-key`, NETOPIA_IPN_KEYS_PATH: `${BILLING}/live-netopia-ipn-keys.pem`,
 QUADERNO_API_BASE_URL: 'https://dezbatere.quadernoapp.com/api', QUADERNO_API_KEY_PATH: `${BILLING}/live-quaderno-api-key`,
 SMARTBILL_API_BASE_URL: 'https://ws.smartbill.ro/SBORO/api', SMARTBILL_CREDENTIALS_PATH: `${BILLING}/live-smartbill-credentials`, SMARTBILL_SERIES: 'DBAI',
 OWNER_REPORT_EMAIL_PATH: `${BILLING}/owner-report-email`, PREVIEW_LIVE_PAYMENTS: 'real-money' };
const SPOOL = '/var/lib/debateai-v3-preview/api/billing-notice-spool';
const narrow = (input: Record<string, string>) => env.narrowEnvironment('api', input, runtime, native, approved);
const without = (input: Record<string, string>, ...keys: string[]) => { const copy = { ...input }; for (const key of keys) delete copy[key]; return copy; };
/** The launcher's refusal: its one message and the name it carries (undefined when unnamed). */
function refusalOf(input: Record<string, string>) {
 try { narrow(input); } catch (error) { return { message: (error as Error).message, cause: (error as Error).cause }; }
 throw new Error('admitted');
}

describe('the live payments line on the hosted API', () => {
 it('admits the whole live group with the line, keeps the line for the API and says the start check must ask the egress proxy', () => {
  const result = narrow({ ...hosted(), ...LIVE });
  expect(result.deploymentMode).toBe('hosted');
  expect(result.livePayments).toBe(true);
  expect(result.environment.PREVIEW_LIVE_PAYMENTS).toBe('real-money');
  expect(Object.keys(result.environment).sort()).toEqual([...Object.keys({ ...hosted(), ...LIVE }), 'PATH'].sort());
  expect(Object.keys(result.environment).filter(key => /PROXY/i.test(key))).toEqual([]);
  // The notice spool and the restore fence keep their own rules beside live payments.
  expect(narrow({ ...hosted(), ...LIVE, BILLING_NOTICE_SPOOL_PATH: SPOOL }).livePayments).toBe(true);
  expect(narrow({ ...hosted(), ...LIVE, RESTORE_FENCE_PATH: env.PREVIEW_HOSTED_FIXED_VALUES.RESTORE_FENCE_PATH }).livePayments).toBe(true);
 });

 it('says livePayments false for every API without the line, and adds nothing to the runner\'s result', () => {
  for (const input of [configured(), hosted(), { ...hosted(), ...SANDBOX }, { ...hosted(), ...without(SANDBOX, 'QUADERNO_API_BASE_URL', 'QUADERNO_API_KEY_PATH', 'SMARTBILL_API_BASE_URL', 'SMARTBILL_CREDENTIALS_PATH', 'SMARTBILL_SERIES', 'OWNER_REPORT_EMAIL_PATH') }])
   expect(narrow(input).livePayments).toBe(false);
  const KEY = fixtureReleaseKey('12');
  const { VLLM_BASE_URL: _a, VLLM_MODEL: _b, VLLM_MAKER: _c, ...rest } = validRunnerEnvironmentFixture();
  const runner = { ...rest, NODE_ENV: 'production', REGISTER_VERSION: '12', RELEASE_KEY: KEY, DEBATEAI_DEPLOYMENT_MODE: 'local', PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW,
   RUNNER_WORKER_ID: `debateai-preview-runner-${KEY}`, HATCHET_WORKER_NAME: `debateai-preview-runner-${KEY}` };
  const result = env.narrowEnvironment('runner', runner, runtime, native, approved);
  expect(Object.keys(result).sort()).toEqual(['deploymentMode', 'environment', 'selectedRegisterVersion']);
  // The runner's file never takes the line: its shape does not know it.
  expect(() => env.narrowEnvironment('runner', { ...runner, PREVIEW_LIVE_PAYMENTS: 'real-money' }, runtime, native, approved)).toThrow(/^PREVIEW_ENVIRONMENT_REFUSED$/);
 });

 it.each([
  ['the value "yes"', { ...LIVE, PREVIEW_LIVE_PAYMENTS: 'yes' }, 'value'],
  ['the value "live"', { ...LIVE, PREVIEW_LIVE_PAYMENTS: 'live' }, 'value'],
  ['the value in capitals', { ...LIVE, PREVIEW_LIVE_PAYMENTS: 'REAL-MONEY' }, 'value'],
  ['the value with a space after it', { ...LIVE, PREVIEW_LIVE_PAYMENTS: 'real-money ' }, 'value'],
  ['the line with no billing setting (live is never billing off)', { PREVIEW_LIVE_PAYMENTS: 'real-money' }, 'incomplete'],
  ['NETOPIA\'s four alone with the line (live is never provider-only)', { PREVIEW_LIVE_PAYMENTS: 'real-money', NETOPIA_API_BASE_URL: LIVE.NETOPIA_API_BASE_URL,
   NETOPIA_POS_SIGNATURE: LIVE.NETOPIA_POS_SIGNATURE, NETOPIA_API_KEY_PATH: LIVE.NETOPIA_API_KEY_PATH, NETOPIA_IPN_KEYS_PATH: LIVE.NETOPIA_IPN_KEYS_PATH }, 'incomplete'],
  ['nine of the ten billing settings', without(LIVE, 'SMARTBILL_SERIES'), 'incomplete'],
  ['the invoicing settings without NETOPIA\'s', without(LIVE, 'NETOPIA_API_BASE_URL', 'NETOPIA_POS_SIGNATURE', 'NETOPIA_API_KEY_PATH', 'NETOPIA_IPN_KEYS_PATH'), 'incomplete'],
  ['NETOPIA\'s first sandbox base', { ...LIVE, NETOPIA_API_BASE_URL: 'https://secure-sandbox.netopia-payments.com' }, 'netopia-base'],
  ['NETOPIA\'s second sandbox base', { ...LIVE, NETOPIA_API_BASE_URL: 'https://secure.sandbox.netopia-payments.com' }, 'netopia-base'],
  ['NETOPIA\'s old mobilpay live base', { ...LIVE, NETOPIA_API_BASE_URL: 'https://secure.mobilpay.ro/pay' }, 'netopia-base'],
  ['NETOPIA\'s live base with a trailing slash', { ...LIVE, NETOPIA_API_BASE_URL: 'https://secure.netopia-payments.com/api/' }, 'netopia-base'],
  ['NETOPIA\'s live host over plain http', { ...LIVE, NETOPIA_API_BASE_URL: 'http://secure.netopia-payments.com/api' }, 'netopia-base'],
  ['a Quaderno sandbox address', { ...LIVE, QUADERNO_API_BASE_URL: 'https://dezbatere.sandbox-quadernoapp.com/api' }, 'quaderno-base'],
  ['a Quaderno address on two labels', { ...LIVE, QUADERNO_API_BASE_URL: 'https://a.b.quadernoapp.com/api' }, 'quaderno-base'],
  ['Quaderno with a trailing slash', { ...LIVE, QUADERNO_API_BASE_URL: 'https://dezbatere.quadernoapp.com/api/' }, 'quaderno-base'],
  ['Quaderno\'s bare host', { ...LIVE, QUADERNO_API_BASE_URL: 'https://quadernoapp.com/api' }, 'quaderno-base'],
  ['a Quaderno label in capitals', { ...LIVE, QUADERNO_API_BASE_URL: 'https://Dezbatere.quadernoapp.com/api' }, 'quaderno-base'],
  ['the dummy SmartBill address', { ...LIVE, SMARTBILL_API_BASE_URL: 'https://smartbill.invalid' }, 'smartbill-base'],
  ['SmartBill on another port', { ...LIVE, SMARTBILL_API_BASE_URL: 'https://ws.smartbill.ro:8183/SBORO/api' }, 'smartbill-base'],
  ['SmartBill with a trailing slash', { ...LIVE, SMARTBILL_API_BASE_URL: 'https://ws.smartbill.ro/SBORO/api/' }, 'smartbill-base'],
  ['the sandbox key paths behind the live addresses', { ...LIVE, NETOPIA_API_KEY_PATH: SANDBOX.NETOPIA_API_KEY_PATH, NETOPIA_IPN_KEYS_PATH: SANDBOX.NETOPIA_IPN_KEYS_PATH,
   QUADERNO_API_KEY_PATH: SANDBOX.QUADERNO_API_KEY_PATH, SMARTBILL_CREDENTIALS_PATH: SANDBOX.SMARTBILL_CREDENTIALS_PATH }, 'paths'],
  ['one sandbox key path behind the live addresses', { ...LIVE, QUADERNO_API_KEY_PATH: SANDBOX.QUADERNO_API_KEY_PATH }, 'paths'],
  ['NETOPIA\'s live key in the hosted kit\'s folder', { ...LIVE, NETOPIA_API_KEY_PATH: '/etc/debateai/api/billing/netopia-api-key' }, 'paths'],
  ['the owner\'s address file elsewhere', { ...LIVE, OWNER_REPORT_EMAIL_PATH: '/root/owner-email' }, 'paths'],
  ['the whole sandbox group with the line', { ...SANDBOX, PREVIEW_LIVE_PAYMENTS: 'real-money' }, 'netopia-base']
 ])('refuses %s, by name and without the value', (_name, patch, word) => {
  const refusal = refusalOf({ ...hosted(), ...patch });
  expect(refusal).toEqual({ message: 'PREVIEW_ENVIRONMENT_REFUSED', cause: `PREVIEW_LIVE_PAYMENTS_REFUSED:${word}` });
 });

 it.each([
  ['live addresses without the line (the sandbox rules, as before)', { ...hosted(), ...without(LIVE, 'PREVIEW_LIVE_PAYMENTS') }],
  ['live NETOPIA alone without the line', { ...hosted(), ...SANDBOX, NETOPIA_API_BASE_URL: LIVE.NETOPIA_API_BASE_URL }],
  ['the line in local mode', { ...configured(), PREVIEW_LIVE_PAYMENTS: 'real-money' }],
  ['the line and the live group in local mode', { ...configured(), ...LIVE }],
  ['the line with the moved billing clock', { ...hosted(), ...LIVE, BILLING_STAGE_CLOCK_OFFSET_DAYS: '31' }],
  ['the line without the country files', without({ ...hosted(), ...LIVE }, 'GEOIP_COUNTRY_DB_PATH')],
  ['the line with the notice spool elsewhere', { ...hosted(), ...LIVE, BILLING_NOTICE_SPOOL_PATH: `${SPOOL}/` }],
  ['the line with proxy settings in the file', { ...hosted(), ...LIVE, HTTPS_PROXY: 'http://127.0.0.1:3180' }]
 ])('refuses %s with the plain refusal', (_name, input) => {
  expect(refusalOf(input)).toEqual({ message: 'PREVIEW_ENVIRONMENT_REFUSED', cause: undefined });
 });
});

describe('the live values agree with the code that uses them', () => {
 it('NETOPIA\'s live base is the payment package\'s first live base, and its host is the egress proxy\'s', () => {
  expect(env.PREVIEW_NETOPIA_LIVE_BASE).toBe(hosts.NETOPIA_BASES[0]!.base);
  expect(hosts.netopiaEnvironmentOf(env.PREVIEW_NETOPIA_LIVE_BASE)).toBe('live');
  expect(egress.PREVIEW_EGRESS_LIVE_HOSTS).toContain(new URL(env.PREVIEW_NETOPIA_LIVE_BASE).hostname);
  for (const base of env.PREVIEW_NETOPIA_SANDBOX_BASES) expect(egress.PREVIEW_EGRESS_LIVE_HOSTS).not.toContain(new URL(base).hostname);
 });
 it('SmartBill\'s live base is the recorder\'s, and its host is the egress proxy\'s', () => {
  const recorder = readFileSync(resolve('tools/billing/record-connector.ts'), 'utf8');
  expect(recorder).toContain(`const baseUrl = "${env.PREVIEW_SMARTBILL_LIVE_BASE}";`);
  expect(egress.PREVIEW_EGRESS_LIVE_HOSTS).toEqual([new URL(env.PREVIEW_NETOPIA_LIVE_BASE).hostname, new URL(env.PREVIEW_SMARTBILL_LIVE_BASE).hostname]);
 });
 it('Quaderno\'s live form takes one label, never a sandbox account, and its host is the live egress form\'s', () => {
  expect(env.PREVIEW_QUADERNO_LIVE_BASE.test('https://dezbatere.quadernoapp.com/api')).toBe(true);
  expect(egress.admittedTarget('CONNECT dezbatere.quadernoapp.com:443 HTTP/1.1', { quadernoLiveAccount: 'dezbatere' })).toBe('dezbatere.quadernoapp.com');
  for (const address of ['https://dezbatere.sandbox-quadernoapp.com/api', 'https://sandbox-quadernoapp.com/api', 'https://x.quadernoapp.com.evil.test/api'])
   expect(env.PREVIEW_QUADERNO_LIVE_BASE.test(address), address).toBe(false);
  for (const address of ['https://dezbatere.quadernoapp.com/api', 'https://a.b.quadernoapp.com/api']) expect(env.PREVIEW_QUADERNO_SANDBOX_BASE.test(address), address).toBe(false);
 });
 it('every live key file has its own path in the same billing folder; the owner\'s address file is shared', () => {
  const live = env.PREVIEW_HOSTED_LIVE_FIXED_VALUES, sandbox = env.PREVIEW_HOSTED_FIXED_VALUES;
  expect(Object.isFrozen(live)).toBe(true);
  expect(Object.keys(live)).toEqual(['NETOPIA_API_KEY_PATH', 'NETOPIA_IPN_KEYS_PATH', 'QUADERNO_API_KEY_PATH', 'SMARTBILL_CREDENTIALS_PATH', 'OWNER_REPORT_EMAIL_PATH']);
  for (const key of ['NETOPIA_API_KEY_PATH', 'NETOPIA_IPN_KEYS_PATH', 'QUADERNO_API_KEY_PATH', 'SMARTBILL_CREDENTIALS_PATH'] as const) {
   expect(live[key], key).not.toBe(sandbox[key]);
   expect(live[key].startsWith(`${BILLING}/live-`), key).toBe(true);
   expect(live[key].slice(BILLING.length + 1).includes('/'), key).toBe(false);
  }
  expect(live.OWNER_REPORT_EMAIL_PATH).toBe(sandbox.OWNER_REPORT_EMAIL_PATH);
  expect(env.PREVIEW_LIVE_PAYMENTS_VALUE).toBe('real-money');
 });
});

describe('the API\'s environment shape knows the line', () => {
 it('is an optional key of the API and no key of the runner', () => {
  expect(runtime.API_ENVIRONMENT_KEYS.optional).toContain('PREVIEW_LIVE_PAYMENTS');
  expect(runtime.API_ENVIRONMENT_KEYS.required).not.toContain('PREVIEW_LIVE_PAYMENTS');
  expect([...runtime.RUNNER_ENVIRONMENT_KEYS.required, ...runtime.RUNNER_ENVIRONMENT_KEYS.optional]).not.toContain('PREVIEW_LIVE_PAYMENTS');
 });
 it('passes exactly "real-money" through, and refuses any other value by name without echoing it', () => {
  expect(runtime.parseApiEnvironment({ ...validApiEnvironmentFixture(), PREVIEW_LIVE_PAYMENTS: 'real-money' }).PREVIEW_LIVE_PAYMENTS).toBe('real-money');
  expect(runtime.parseApiEnvironment(validApiEnvironmentFixture()).PREVIEW_LIVE_PAYMENTS).toBeUndefined();
  for (const value of ['yes', 'true', 'live', 'Real-Money', 'real-money ', '', 'secret-value-9']) {
   let thrown: unknown;
   try { runtime.parseApiEnvironment({ ...validApiEnvironmentFixture(), PREVIEW_LIVE_PAYMENTS: value }); } catch (error) { thrown = error; }
   expect(thrown, value).toBeInstanceOf(TypeError);
   expect((thrown as Error).message, value).toBe('PREVIEW_LIVE_PAYMENTS_REFUSED:value');
  }
 });
});
