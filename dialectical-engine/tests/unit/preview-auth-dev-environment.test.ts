import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as runtime from '../../packages/register/src/runtime-environment.js';
import { fixtureReleaseKey, validApiEnvironmentFixture } from '../support/apiEnvironmentFixture.js';
const env=await import('../../deploy/'+'preview-auth-dev/v1/environment.mjs');
const native={registerVersion:'12'};
const approved={apiPort:'3101',uiPort:'3100',mailExecutable:'/opt/release/mail-handoff.mjs',mailFrom:'noreply@dezbatere.ro'};
function configured():Record<string,string>{return{...validApiEnvironmentFixture(),NODE_ENV:'production',REGISTER_VERSION:'12',RELEASE_KEY:fixtureReleaseKey('12'),PUBLIC_APP_URL:'https://v3-preview.dezbatere.ro',API_PORT:'3101',API_HOST:'127.0.0.1',MAIL_SENDMAIL_PATH:approved.mailExecutable,MAIL_FROM:'noreply@dezbatere.ro'};}
describe('source-derived strict preview environment',()=>{
 it('retains opaque values only for current source keys and privately normalizes exact local register selection',()=>{const input=configured();const result=env.narrowEnvironment('api',input,runtime,native,approved);expect(result.environment.DATABASE_URL).toBe(input.DATABASE_URL);expect(result.selectedRegisterVersion).toBe('12');expect(result.deploymentMode).toBe('local');expect(result.environment.PATH).toBe('/usr/local/bin:/usr/bin:/bin');});
 it.each([{NODE_OPTIONS:'--require attacker'},{EXTRA:'unrecognized'},{REGISTER_VERSION:'11',RELEASE_KEY:fixtureReleaseKey('11')},{PUBLIC_APP_URL:'https://dezbatere.ro'},{DEBATEAI_DEPLOYMENT_MODE:'hosted'},{TURNSTILE_SOCKET_PATH:'/tmp/relay.sock'},{MAIL_SENDMAIL_PATH:'/usr/sbin/sendmail'},{RECORDS_KEY_PATH:'/run/secrets/kek'}])('rejects env, domain, native version, mail or key-domain drift without emitting values',patch=>expect(()=>env.narrowEnvironment('api',{...configured(),...patch},runtime,native,approved)).toThrow(/^PREVIEW_ENVIRONMENT_REFUSED$/));
 it('admits only the exact optional public Turnstile mapping',()=>expect(env.narrowEnvironment('api',{...configured(),TURNSTILE_SOCKET_PATH:'/run/debateai-preview-turnstile/siteverify.sock'},runtime,native,approved).environment.TURNSTILE_SOCKET_PATH).toBe('/run/debateai-preview-turnstile/siteverify.sock'));
 it.each(['A=one\nA=two\n','A=$(command)\n','export A=one\n','A=one\r\n','BAD-NAME=one\n'])('refuses ambiguous executable environment syntax',text=>expect(()=>env.parseEnvironmentText(text)).toThrow(/^PREVIEW_ENVIRONMENT_REFUSED$/));
 it('parses exact bare values including embedded equals without expansion',()=>expect(env.parseEnvironmentText('A=one=two\nB={"fixed":true}\n')).toEqual({A:'one=two',B:'{"fixed":true}'}));
});

const LEGACY_FLAG='["zai-org/GLM-5.3-Flash"]';
const MULTI_FLAG='{"free":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash"],"premium":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro","Qwen/Qwen3.8-Flash"]}';
const GLM='zai-org/GLM-5.3-Flash',DEEPSEEK='deepseek-ai/DeepSeek-V4.1-Flash',MIMO='XiaomiMiMo/MiMo-V2.6-Pro',QWEN='Qwen/Qwen3.8-Flash',HAIKU='claude-haiku-5-5';
// The owner's first debate: all five AIs on Free and on Premium (DeepInfra's four, then Anthropic's Haiku).
const ALL_FIVE=[GLM,DEEPSEEK,MIMO,QWEN,HAIKU];
const ALL_FLAG=JSON.stringify({free:ALL_FIVE,premium:ALL_FIVE});
const ANTHROPIC_SOCKET='/run/debateai-v3-preview/anthropic-budget-v1.sock';
const apiConfig=(lists:Record<string,unknown>)=>JSON.stringify({deployment:'v3-preview',requested_thinking_level:'high',budget_socket:'/run/debateai-v3-preview/deepinfra-budget-v3.sock',scope_id:'preview-scope',...lists});
describe('the website\'s model list: one reviewed value per stage of the switch-on order',()=>{
 it('names exactly the legacy array, the two-list value and the all-five value, legacy as the default build value',()=>{
  expect(env.PREVIEW_MODEL_ROSTER_FLAGS).toEqual({'glm-only':LEGACY_FLAG,'multi-model':MULTI_FLAG,'all-models':ALL_FLAG});
  expect(env.PREVIEW_FREE_MODEL_IDS_JSON).toBe(LEGACY_FLAG);
  for(const value of [LEGACY_FLAG,MULTI_FLAG,ALL_FLAG])expect(env.isReviewedModelRosterFlag(value)).toBe(true);
  for(const value of [JSON.stringify({free:ALL_FIVE.slice(0,4),premium:ALL_FIVE.slice(0,4)}),JSON.stringify({free:[...ALL_FIVE].reverse(),premium:ALL_FIVE})])expect(env.isReviewedModelRosterFlag(value)).toBe(false);
  for(const value of [undefined,'',' '+LEGACY_FLAG,'["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash"]',MULTI_FLAG.replace(',"Qwen/Qwen3.8-Flash"',''),MULTI_FLAG.replace(',"XiaomiMiMo/MiMo-V2.6-Pro"',''),JSON.stringify(JSON.parse(MULTI_FLAG),null,1)])expect(env.isReviewedModelRosterFlag(value)).toBe(false);
 });
 const ui=(flag:string)=>({NODE_ENV:'production',PUBLIC_APP_URL:'https://v3-preview.dezbatere.ro',PORT:'3100',DIALECTICAL_UI_HOST:'127.0.0.1',DIALECTICAL_API_BASE:'http://127.0.0.1:3101',NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON:flag});
 it('ui.env must name the list the website was built with',()=>{
  for(const flag of [LEGACY_FLAG,MULTI_FLAG,ALL_FLAG])expect(env.narrowEnvironment('ui',ui(flag),{builtModelRosterFlag:flag},null,approved).environment.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON).toBe(flag);
  expect(()=>env.narrowEnvironment('ui',ui(LEGACY_FLAG),{builtModelRosterFlag:MULTI_FLAG},null,approved)).toThrow('PREVIEW_ENVIRONMENT_REFUSED');
  expect(()=>env.narrowEnvironment('ui',ui(MULTI_FLAG),{builtModelRosterFlag:LEGACY_FLAG},null,approved)).toThrow('PREVIEW_ENVIRONMENT_REFUSED');
  expect(()=>env.narrowEnvironment('ui',ui(LEGACY_FLAG),{},null,approved)).toThrow('PREVIEW_ENVIRONMENT_REFUSED');
  const other='["deepseek-ai/DeepSeek-V4.1-Flash"]';
  expect(()=>env.narrowEnvironment('ui',ui(other),{builtModelRosterFlag:other},null,approved)).toThrow('PREVIEW_ENVIRONMENT_REFUSED');
 });
 it.each([
  ['the legacy array with the legacy five-key config',LEGACY_FLAG,apiConfig({free_model_ids:[GLM]}),true],
  ['the two-list value with the six-field config holding the same lists',MULTI_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK],premium_model_ids:[GLM,DEEPSEEK,MIMO,QWEN]}),true],
  ['the two-list value with the premium list before Qwen',MULTI_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK],premium_model_ids:[GLM,DEEPSEEK,MIMO]}),false],
  ['the legacy array with a six-key config',LEGACY_FLAG,apiConfig({free_model_ids:[GLM],premium_model_ids:[GLM]}),false],
  ['the legacy array with the six-field multi config',LEGACY_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK],premium_model_ids:[GLM,DEEPSEEK,MIMO,QWEN]}),false],
  ['the two-list value with the legacy config (the website would offer models the API refuses)',MULTI_FLAG,apiConfig({free_model_ids:[GLM]}),false],
  ['the two-list value with a narrower premium list',MULTI_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK],premium_model_ids:[GLM,DEEPSEEK]}),false],
  ['the two-list value with lists in another order',MULTI_FLAG,apiConfig({free_model_ids:[DEEPSEEK,GLM],premium_model_ids:[GLM,DEEPSEEK,MIMO,QWEN]}),false],
  ['the two-list value with free and premium swapped',MULTI_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK,MIMO,QWEN],premium_model_ids:[GLM,DEEPSEEK]}),false],
  ['a config with an extra key',LEGACY_FLAG,apiConfig({free_model_ids:[GLM],extra:true}),false],
  // Spec 2026-10-12 §4.2: thinking_levels is an optional key on both forms; the website lists still have to match.
  ['the legacy array with the legacy config plus a thinking_levels table',LEGACY_FLAG,apiConfig({free_model_ids:[GLM],thinking_levels:{[GLM]:{level:'high'}}}),true],
  ['the two-list value with the six-key config plus a thinking_levels table',MULTI_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK],premium_model_ids:[GLM,DEEPSEEK,MIMO,QWEN],thinking_levels:{[QWEN]:{level:'low',steps:{story_writer:'medium'}}}}),true],
  ['the legacy config with a thinking_levels table and an extra key',LEGACY_FLAG,apiConfig({free_model_ids:[GLM],thinking_levels:{[GLM]:{level:'high'}},extra:true}),false],
  // PR B: the six-key config may also name the Anthropic gate's socket; the website lists must still match.
  ['the two-list value with the six-key config plus the Anthropic socket',MULTI_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK],premium_model_ids:[GLM,DEEPSEEK,MIMO,QWEN],anthropic_budget_socket:'/run/debateai-v3-preview/anthropic-budget-v1.sock'}),true],
  ['the legacy array with the legacy config plus the Anthropic socket',LEGACY_FLAG,apiConfig({free_model_ids:[GLM],anthropic_budget_socket:'/run/debateai-v3-preview/anthropic-budget-v1.sock'}),false],
  ['the two-list value with an API roster naming Haiku the website does not offer',MULTI_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK],premium_model_ids:[GLM,DEEPSEEK,MIMO,QWEN,'claude-haiku-5-5'],anthropic_budget_socket:'/run/debateai-v3-preview/anthropic-budget-v1.sock'}),false],
  ['the all-models value with the six-key config holding all five on both lists plus the Anthropic socket',ALL_FLAG,apiConfig({free_model_ids:ALL_FIVE,premium_model_ids:ALL_FIVE,anthropic_budget_socket:ANTHROPIC_SOCKET}),true],
  ['the all-models value with an API config without Haiku (the website would offer a model the API refuses)',ALL_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK,MIMO,QWEN],premium_model_ids:[GLM,DEEPSEEK,MIMO,QWEN],anthropic_budget_socket:ANTHROPIC_SOCKET}),false],
  ['the all-models value with the multi-model config',ALL_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK],premium_model_ids:[GLM,DEEPSEEK,MIMO,QWEN]}),false],
  ['the multi-model value with the all-models config',MULTI_FLAG,apiConfig({free_model_ids:ALL_FIVE,premium_model_ids:ALL_FIVE,anthropic_budget_socket:ANTHROPIC_SOCKET}),false],
  ['no API config',LEGACY_FLAG,undefined,false],
  ['an API config that is not JSON',LEGACY_FLAG,'{',false],
  ['an unreviewed website list that matches the config',JSON.stringify([GLM,DEEPSEEK]),apiConfig({free_model_ids:[GLM,DEEPSEEK]}),false]
 ])('the stage check: %s',(_name,flag,config,expected)=>{expect(env.uiRosterMatchesApiConfig(flag,config)).toBe(expected);});
});

// Owner rulings 2026-10-13: the preview may run HOSTED, with NETOPIA's and Quaderno's sandboxes, only on its own configuration.
describe('hosted preview environment', async () => {
 const hosts = await import('../../packages/payments-netopia/src/hosts.js');
 const egress = await import('../../deploy/' + 'preview-auth-dev/v1/egress-proxy.mjs');
 const PREVIEW = JSON.stringify({ deployment: 'v3-preview', free_model_ids: ['zai-org/GLM-5.3-Flash'], requested_thinking_level: 'high', budget_socket: '/run/debateai-v3-preview/team-budget-v2.sock', scope_id: 'preview-team-v2-20261009' });
 const TEAM = '["0b7c6f1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e"]';
 const SOCKET = '/run/debateai-preview-turnstile/siteverify.sock';
 const hosted = (): Record<string, string> => ({ ...configured(), DEBATEAI_DEPLOYMENT_MODE: 'hosted', PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_TEAM_USER_IDS_JSON: TEAM,
  GEOIP_COUNTRY_DB_PATH: '/var/lib/debateai-geoip/dbip-country-lite.mmdb', TOR_EXIT_LIST_PATH: '/var/lib/debateai-geoip/tor-exit-list.txt', TURNSTILE_SOCKET_PATH: SOCKET });
 const NETOPIA = { NETOPIA_API_BASE_URL: 'https://secure-sandbox.netopia-payments.com', NETOPIA_POS_SIGNATURE: 'ABCD-EFGH-IJKL-MNOP-QRST',
  NETOPIA_API_KEY_PATH: '/etc/debateai-v3-preview/billing/netopia-api-key', NETOPIA_IPN_KEYS_PATH: '/etc/debateai-v3-preview/billing/netopia-ipn-keys.pem' };
 const INVOICING = { QUADERNO_API_BASE_URL: 'https://dezbatere-test.sandbox-quadernoapp.com/api', QUADERNO_API_KEY_PATH: '/etc/debateai-v3-preview/billing/quaderno-api-key',
  SMARTBILL_API_BASE_URL: 'https://smartbill.invalid', SMARTBILL_CREDENTIALS_PATH: '/etc/debateai-v3-preview/billing/smartbill-credentials', SMARTBILL_SERIES: 'DBAI',
  OWNER_REPORT_EMAIL_PATH: '/etc/debateai-v3-preview/billing/owner-report-email' };
 const SPOOL = '/var/lib/debateai-v3-preview/api/billing-notice-spool';
 const narrow = (input: Record<string, string>) => env.narrowEnvironment('api', input, runtime, native, approved);
 it.each([
  ['hosted, billing off', {}],
  ['hosted with NETOPIA\'s sandbox alone (the provider-only mode)', NETOPIA],
  ['hosted with the whole billing group', { ...NETOPIA, ...INVOICING }],
  ['hosted with NETOPIA\'s other sandbox base', { ...NETOPIA, ...INVOICING, NETOPIA_API_BASE_URL: 'https://secure.sandbox.netopia-payments.com' }],
  // B3a (NETOPIA answers 2026-10-21): the optional spool of NETOPIA messages the database could not store.
  ['hosted with NETOPIA\'s sandbox alone and the billing notice spool', { ...NETOPIA, BILLING_NOTICE_SPOOL_PATH: SPOOL }],
  ['hosted with the whole billing group and the billing notice spool', { ...NETOPIA, ...INVOICING, BILLING_NOTICE_SPOOL_PATH: SPOOL }]
 ])('admits %s', (_name, patch) => {
  const result = narrow({ ...hosted(), ...patch });
  expect(result.deploymentMode).toBe('hosted');
  expect(result.selectedRegisterVersion).toBe('12');
  expect(Object.keys(result.environment).sort()).toEqual([...Object.keys({ ...hosted(), ...patch }), 'PATH'].sort());
  // The proxy settings never reach the environment the API reads.
  expect(Object.keys(result.environment).filter(key => /PROXY/i.test(key))).toEqual([]);
 });
 const drop = (key: string) => { const value = hosted(); delete value[key]; return value; };
 it.each([
  ['hosted without the preview configuration (the spending gates and the team)', (() => { const v = hosted(); delete v.PREVIEW_PROVIDER_TEST_CONFIG_JSON; delete v.PREVIEW_TEAM_USER_IDS_JSON; return v; })()],
  ['hosted without the country database', drop('GEOIP_COUNTRY_DB_PATH')],
  ['hosted with the country database elsewhere', { ...hosted(), GEOIP_COUNTRY_DB_PATH: '/tmp/dbip.mmdb' }],
  ['hosted with the Tor list elsewhere', { ...hosted(), TOR_EXIT_LIST_PATH: '/var/lib/debateai-geoip/../tor.txt' }],
  ['hosted without the Turnstile relay', drop('TURNSTILE_SOCKET_PATH')],
  ['a mode in another spelling', { ...hosted(), DEBATEAI_DEPLOYMENT_MODE: 'Hosted' }],
  ['NETOPIA\'s live base', { ...hosted(), ...NETOPIA, NETOPIA_API_BASE_URL: 'https://secure.netopia-payments.com/api' }],
  ['NETOPIA\'s sandbox base with a trailing slash', { ...hosted(), ...NETOPIA, NETOPIA_API_BASE_URL: 'https://secure-sandbox.netopia-payments.com/' }],
  ['three of NETOPIA\'s four settings', (() => { const v: Record<string, string> = { ...hosted(), ...NETOPIA }; delete v.NETOPIA_POS_SIGNATURE; return v; })()],
  ['NETOPIA\'s key file elsewhere', { ...hosted(), ...NETOPIA, NETOPIA_API_KEY_PATH: '/etc/debateai/api/billing/netopia-api-key' }],
  ['NETOPIA\'s public key file elsewhere', { ...hosted(), ...NETOPIA, NETOPIA_IPN_KEYS_PATH: '/etc/debateai-v3-preview/billing/other.pem' }],
  ['the invoicing settings without NETOPIA\'s', { ...hosted(), ...INVOICING }],
  ['five of the six invoicing settings', (() => { const v: Record<string, string> = { ...hosted(), ...NETOPIA, ...INVOICING }; delete v.SMARTBILL_SERIES; return v; })()],
  ['Quaderno\'s live address', { ...hosted(), ...NETOPIA, ...INVOICING, QUADERNO_API_BASE_URL: 'https://dezbatere.quadernoapp.com/api' }],
  ['a Quaderno sandbox address on two labels', { ...hosted(), ...NETOPIA, ...INVOICING, QUADERNO_API_BASE_URL: 'https://a.b.sandbox-quadernoapp.com/api' }],
  ['a real SmartBill address', { ...hosted(), ...NETOPIA, ...INVOICING, SMARTBILL_API_BASE_URL: 'https://ws.smartbill.ro/SBORO/api' }],
  ['the owner\'s address file elsewhere', { ...hosted(), ...NETOPIA, ...INVOICING, OWNER_REPORT_EMAIL_PATH: '/root/owner-email' }],
  ['the moved billing clock (owner ruling 2026-10-13: still refused)', { ...hosted(), ...NETOPIA, ...INVOICING, BILLING_STAGE_CLOCK_OFFSET_DAYS: '31' }],
  ['the moved billing clock in local mode', { ...configured(), BILLING_STAGE_CLOCK_OFFSET_DAYS: '31' }],
  ['a billing setting in local mode', { ...configured(), ...NETOPIA }],
  ['the billing notice spool without NETOPIA\'s settings (hosted, billing off)', { ...hosted(), BILLING_NOTICE_SPOOL_PATH: SPOOL }],
  ['the billing notice spool beside the invoicing settings without NETOPIA\'s', { ...hosted(), ...INVOICING, BILLING_NOTICE_SPOOL_PATH: SPOOL }],
  ['the billing notice spool in the hosted kit\'s folder', { ...hosted(), ...NETOPIA, ...INVOICING, BILLING_NOTICE_SPOOL_PATH: '/var/lib/debateai/api/billing-notice-spool' }],
  ['the billing notice spool with a trailing slash', { ...hosted(), ...NETOPIA, ...INVOICING, BILLING_NOTICE_SPOOL_PATH: `${SPOOL}/` }],
  ['the billing notice spool in local mode', { ...configured(), BILLING_NOTICE_SPOOL_PATH: SPOOL }],
  ['proxy settings in the environment file', { ...hosted(), HTTPS_PROXY: 'http://127.0.0.1:3180' }],
  ['Node\'s proxy switch in the environment file', { ...hosted(), NODE_USE_ENV_PROXY: '1' }]
 ])('refuses %s without emitting values', (_name, input) => expect(() => narrow(input)).toThrow(/^PREVIEW_ENVIRONMENT_REFUSED$/));
 it('pins NETOPIA\'s sandbox bases to the payment package\'s own table, and the egress proxy to their hosts', () => {
  const sandbox = hosts.NETOPIA_BASES.filter(entry => entry.environment === 'sandbox').map(entry => entry.base);
  expect(env.PREVIEW_NETOPIA_SANDBOX_BASES).toEqual(sandbox);
  expect(egress.PREVIEW_EGRESS_NETOPIA_HOSTS).toEqual(sandbox.map(base => new URL(base).hostname));
  for (const base of env.PREVIEW_NETOPIA_SANDBOX_BASES) expect(hosts.netopiaEnvironmentOf(base)).toBe('sandbox');
 });
 it('points only the hosted API\'s https at the loopback egress proxy, and never through the process environment', () => {
  const calls: unknown[] = [];
  const setProxy = (value: unknown) => { calls.push(value); return () => undefined; };
  const before = { ...process.env };
  env.installHostedEgress('local', setProxy);
  expect(calls).toEqual([]);
  env.installHostedEgress('hosted', setProxy);
  expect(calls).toEqual([{ HTTPS_PROXY: 'http://127.0.0.1:3180', NO_PROXY: 'localhost,127.0.0.1,[::1]' }]);
  expect(egress.PREVIEW_EGRESS_PROXY_URL).toBe('http://127.0.0.1:3180');
  expect(process.env).toEqual(before);
  expect(() => env.installHostedEgress('staging', setProxy)).toThrow(/^PREVIEW_ENVIRONMENT_REFUSED$/);
 });
});

// B3a (NETOPIA answers 2026-10-21): the preview's spool folder, the API unit's write permission for it and the guide agree.
describe('the billing notice spool on the preview', () => {
 const read = (path: string) => readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8');
 const SPOOL = env.PREVIEW_HOSTED_FIXED_VALUES.BILLING_NOTICE_SPOOL_PATH;
 const DROPIN = 'deploy/preview-auth-dev/v1/debateai-preview-api-notice-spool.conf';
 const INSTALLED = 'zzzzzzzzzz-billing-notice-spool.conf';
 it('is an optional key of the API, in the preview\'s own state folder under the hosted kit\'s name', () => {
  expect(runtime.API_ENVIRONMENT_KEYS.optional).toContain('BILLING_NOTICE_SPOOL_PATH');
  expect(SPOOL).toBe('/var/lib/debateai-v3-preview/api/billing-notice-spool');
  const vps = /^# BILLING_NOTICE_SPOOL_PATH=(.+)$/m.exec(read('deploy/vps/env/api.env.example'))?.[1];
  expect(vps?.replace('/var/lib/debateai/', '/var/lib/debateai-v3-preview/')).toBe(SPOOL);
 });
 it('the drop-in adds exactly that one write path, optional, and sorts after the older drop-ins and before the release one', async () => {
  const text = read(DROPIN);
  expect(text.split('\n').filter(line => line !== '' && !line.startsWith('#'))).toEqual(['[Service]', `ReadWritePaths=-${SPOOL}`]);
  expect(text).toContain(`# Install as /etc/systemd/system/debateai-preview-api.service.d/${INSTALLED}\n`);
  // The release drop-in sets no ReadWritePaths= (its lines are pinned in preview-lifecycle-prestart.test.ts).
  const { RELEASE_DROPIN_NAME } = await import('../../deploy/' + 'preview-lifecycle/v1/prestart.mjs');
  const order = ['50-lifecycle.conf', '60-hosted-egress.conf', 'zzzzzzzzz-auth-dev-task12-final.conf', INSTALLED, RELEASE_DROPIN_NAME];
  expect([...order].sort()).toEqual(order);
 });
 it('the guide makes the folder 0700 as the API\'s user, installs that drop-in under that name and reloads, then adds the line once', () => {
  const guide = read('deploy/preview-release/v1/README.md');
  const steps = [
   `SP=${SPOOL}`,
   'install -d -m 0700 -o "$AU" -g "$AGRP" "$SP"',
   `install -o root -g root -m 0644 "$CAPI/dialectical-engine/${DROPIN}" /etc/systemd/system/debateai-preview-api.service.d/${INSTALLED}`,
   'systemctl daemon-reload',
   'systemctl show -p ReadWritePaths debateai-preview-api',
   `grep -q '^BILLING_NOTICE_SPOOL_PATH=' "$E/api.env" || printf '\\nBILLING_NOTICE_SPOOL_PATH=%s\\n' "$SP" >> "$E/api.env"`
  ];
  let from = guide.indexOf('### H9. The billing notice spool');
  expect(from).toBeGreaterThan(0);
  for (const step of steps) {
   const at = guide.indexOf(step, from);
   expect(at, step).toBeGreaterThan(from);
   from = at;
  }
 });
});
