import { setGlobalProxyFromEnv } from 'node:http';
import { refuse, withPrivateBytes } from './custody.mjs';
import { PREVIEW_ORIGIN, PREVIEW_SITE_KEY, PREVIEW_SOCKET } from './turnstile-custody.mjs';
import { PREVIEW_EGRESS_PROXY_URL } from './egress-proxy.mjs';
const STAFF=['STAFF_ACCESS_POLICY_VERSION','STAFF_WEBAUTHN_ORIGIN','STAFF_WEBAUTHN_RP_ID','STAFF_INDEPENDENT_ALERT_CONFIG_PATH','STAFF_ALERT_OPERATOR_MODULE_PATH','STAFF_ALERT_OPERATOR_MODULE_SHA256',
 'INTERNAL_ALLOWANCE_POLICY_VERSION','INTERNAL_ALLOWANCE_CURRENCY','INTERNAL_ALLOWANCE_MAXIMUM_GRANT_MICROS','INTERNAL_ALLOWANCE_MAXIMUM_DAY_MICROS','INTERNAL_ALLOWANCE_MAXIMUM_WEEK_MICROS','INTERNAL_ALLOWANCE_MAXIMUM_LIFETIME_MS','INTERNAL_ALLOWANCE_FINISH_ALLOWANCE_BP','INTERNAL_ALLOWANCE_POLICY_SOURCE_REF'];
/**
 * The only public model lists the preview UI may be built and run with, one per stage of the switch-on
 * order (deploy/preview-gate/v3/README.md, "Switching on the new models, in order"):
 * - `glm-only`: the legacy array, GLM for Free and Premium (until the gate and the API offer more);
 * - `multi-model`: Free gets two makers (Z.AI, DeepSeek), Premium four (plus Xiaomi and Alibaba);
 * - `all-models`: Free and Premium both get all five AIs (Z.AI, DeepSeek, Xiaomi, Alibaba via the DeepInfra
 *   gate; Anthropic's Haiku via the Anthropic gate), the owner's first-debate value; the API config must
 *   then also name `anthropic_budget_socket`.
 * The value is baked into the website when it is built (release-artifacts.mjs `ui-build --models`),
 * ui-build.mjs records it next to the build, and narrowEnvironment demands that ui.env says the same.
 */
export const PREVIEW_MODEL_ROSTER_FLAGS=Object.freeze({
 'glm-only':'["zai-org/GLM-5.3-Flash"]',
 'multi-model':'{"free":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash"],"premium":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro","Qwen/Qwen3.8-Flash"]}',
 'all-models':'{"free":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro","Qwen/Qwen3.8-Flash","claude-haiku-5-5"],"premium":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro","Qwen/Qwen3.8-Flash","claude-haiku-5-5"]}'
});
/** The default build value (the stage before the API offers more than GLM): the legacy array. */
export const PREVIEW_FREE_MODEL_IDS_JSON=PREVIEW_MODEL_ROSTER_FLAGS['glm-only'];
const REVIEWED_ROSTER_FLAGS=Object.values(PREVIEW_MODEL_ROSTER_FLAGS);
export const isReviewedModelRosterFlag=value=>typeof value==='string'&&REVIEWED_ROSTER_FLAGS.includes(value);
const LEGACY_CONFIG_KEYS='budget_socket,deployment,free_model_ids,requested_thinking_level,scope_id';
const ROSTER_CONFIG_KEYS='budget_socket,deployment,free_model_ids,premium_model_ids,requested_thinking_level,scope_id';
// PR B: the roster form may also name the Anthropic gate's socket (the API's parser checks its value).
const OPTIONAL_SOCKET_KEYS=Object.freeze(['anthropic_budget_socket']);
// Spec 2026-10-12 §4.2: the owner's thinking-level table is optional on both forms (the API's parser checks its contents).
const OPTIONAL_TABLE_KEYS=Object.freeze(['thinking_levels']);
/**
 * Whether the UI's public model list (NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON) offers exactly what the
 * API's preview configuration (PREVIEW_PROVIDER_TEST_CONFIG_JSON) allows: the legacy array only with the
 * legacy five-key config holding that one list; the two-list object only with the six-key config holding
 * the same free and premium lists, in the same order. A UI that offers a model the API refuses, or the
 * reverse, is a mismatch. The API config's own parser (packages/providers preview-test.ts) checks the rest.
 * The optional thinking_levels table (spec 2026-10-12 §4.2) may ride on either form and is not compared here.
 */
export function uiRosterMatchesApiConfig(uiFlag,apiConfigJson) {
 try{
  if(!isReviewedModelRosterFlag(uiFlag)||typeof apiConfigJson!=='string')return false;
  const ui=JSON.parse(uiFlag),api=JSON.parse(apiConfigJson);
  if(!api||typeof api!=='object'||Array.isArray(api))return false;
  const keys=Object.keys(api).filter(key=>!OPTIONAL_TABLE_KEYS.includes(key)).sort().join(','),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(Array.isArray(ui))return keys===LEGACY_CONFIG_KEYS&&same(api.free_model_ids,ui);
  const rosterKeys=Object.keys(api).filter(key=>!OPTIONAL_SOCKET_KEYS.includes(key)&&!OPTIONAL_TABLE_KEYS.includes(key)).sort().join(',');
  return rosterKeys===ROSTER_CONFIG_KEYS&&same(api.free_model_ids,ui.free)&&same(api.premium_model_ids,ui.premium);
 }catch{return false;}
}
/**
 * The hosted preview (owner rulings 2026-10-13: hosted mode with NETOPIA's and Quaderno's sandboxes). The API's
 * country files are the hosted kit's fixed refresh output (deploy/vps/systemd/debateai-geoip-refresh.service); the
 * billing custody files sit at fixed paths in one API-owned 0700 folder (the IPN key file root-owned 0644, as in the
 * kit); SmartBill stays the dummy `.invalid` address (it has no sandbox: every invoice is a real fiscal document).
 */
export const PREVIEW_HOSTED_FIXED_VALUES=Object.freeze({
 GEOIP_COUNTRY_DB_PATH:'/var/lib/debateai-geoip/dbip-country-lite.mmdb',
 TOR_EXIT_LIST_PATH:'/var/lib/debateai-geoip/tor-exit-list.txt',
 NETOPIA_API_KEY_PATH:'/etc/debateai-v3-preview/billing/netopia-api-key',
 NETOPIA_IPN_KEYS_PATH:'/etc/debateai-v3-preview/billing/netopia-ipn-keys.pem',
 QUADERNO_API_KEY_PATH:'/etc/debateai-v3-preview/billing/quaderno-api-key',
 SMARTBILL_CREDENTIALS_PATH:'/etc/debateai-v3-preview/billing/smartbill-credentials',
 OWNER_REPORT_EMAIL_PATH:'/etc/debateai-v3-preview/billing/owner-report-email',
 SMARTBILL_API_BASE_URL:'https://smartbill.invalid',
 // Optional (NETOPIA's answers 2026-10-21, B3a): the API-owned 0700 folder of NETOPIA messages the database could not
 // store; its unit's write permission is debateai-preview-api-notice-spool.conf (deploy/preview-release/v1/README.md H9).
 BILLING_NOTICE_SPOOL_PATH:'/var/lib/debateai-v3-preview/api/billing-notice-spool'
});
/** NETOPIA's two sandbox bases, exactly (packages/payments-netopia/src/hosts.ts; a unit test pins the two lists equal). */
export const PREVIEW_NETOPIA_SANDBOX_BASES=Object.freeze(['https://secure-sandbox.netopia-payments.com','https://secure.sandbox.netopia-payments.com']);
/** A Quaderno SANDBOX account's API address, the only Quaderno form the preview admits. */
export const PREVIEW_QUADERNO_SANDBOX_BASE=/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.sandbox-quadernoapp\.com\/api$/;
const NETOPIA_KEYS=['NETOPIA_API_BASE_URL','NETOPIA_POS_SIGNATURE','NETOPIA_API_KEY_PATH','NETOPIA_IPN_KEYS_PATH'];
const INVOICING_KEYS=['QUADERNO_API_KEY_PATH','QUADERNO_API_BASE_URL','SMARTBILL_CREDENTIALS_PATH','SMARTBILL_API_BASE_URL','SMARTBILL_SERIES','OWNER_REPORT_EMAIL_PATH'];
const SPOOL_KEY='BILLING_NOTICE_SPOOL_PATH';
/**
 * Owner ruling 2026-10-13: moving the billing clock for renewal tests stays refused on the preview (the owner is still
 * deciding). A host that ever ran with it must never go live (deploy/vps/README.md §14.8).
 */
const REFUSED_ON_PREVIEW=['BILLING_STAGE_CLOCK_OFFSET_DAYS'];
/**
 * The hosted API's extra rules: the country files and the Turnstile relay at their fixed values (the API refuses to
 * start without them in hosted mode); NETOPIA's four settings all or none, and Quaderno's, SmartBill's and the owner's
 * six all or none and only beside NETOPIA's (none: hosted, billing off; NETOPIA alone: the provider-only mode; all
 * ten: billing on, once the register says so); and every value a sandbox form at its fixed path. The billing notice
 * spool is optional, only beside NETOPIA's four (it keeps NETOPIA's messages), and only at its fixed folder.
 */
function assertHostedApiValues(configured) {
 const fixed=PREVIEW_HOSTED_FIXED_VALUES;
 if(configured.GEOIP_COUNTRY_DB_PATH!==fixed.GEOIP_COUNTRY_DB_PATH||configured.TOR_EXIT_LIST_PATH!==fixed.TOR_EXIT_LIST_PATH
  ||configured.TURNSTILE_SOCKET_PATH!==PREVIEW_SOCKET)refuse();
 const present=keys=>keys.filter(key=>configured[key]!==undefined).length;
 const netopia=present(NETOPIA_KEYS),invoicing=present(INVOICING_KEYS);
 if(![0,NETOPIA_KEYS.length].includes(netopia)||![0,INVOICING_KEYS.length].includes(invoicing)||(invoicing>0&&netopia===0))refuse();
 if(netopia>0&&(!PREVIEW_NETOPIA_SANDBOX_BASES.includes(configured.NETOPIA_API_BASE_URL)
  ||configured.NETOPIA_API_KEY_PATH!==fixed.NETOPIA_API_KEY_PATH||configured.NETOPIA_IPN_KEYS_PATH!==fixed.NETOPIA_IPN_KEYS_PATH))refuse();
 if(invoicing>0&&(!PREVIEW_QUADERNO_SANDBOX_BASE.test(configured.QUADERNO_API_BASE_URL)||configured.SMARTBILL_API_BASE_URL!==fixed.SMARTBILL_API_BASE_URL
  ||['QUADERNO_API_KEY_PATH','SMARTBILL_CREDENTIALS_PATH','OWNER_REPORT_EMAIL_PATH'].some(key=>configured[key]!==fixed[key])))refuse();
 if(configured[SPOOL_KEY]!==undefined&&(netopia===0||configured[SPOOL_KEY]!==fixed[SPOOL_KEY]))refuse();
}
/** No billing setting in local mode: billing exists only in hosted mode (apps/api/src/billing/connectors.ts billingModeOf). */
const BILLING_ONLY_KEYS=[...NETOPIA_KEYS,...INVOICING_KEYS,SPOOL_KEY];
/** What the hosted API's fetch does: https through the loopback egress proxy, loopback itself direct. */
export const PREVIEW_HOSTED_PROXY_ENVIRONMENT=Object.freeze({HTTPS_PROXY:PREVIEW_EGRESS_PROXY_URL,NO_PROXY:'localhost,127.0.0.1,[::1]'});
/**
 * Hosted only, before the API's main is imported: every https request of the process's global fetch (NETOPIA's,
 * Quaderno's) and of the https module goes through the egress proxy (egress-proxy.mjs), which lets only NETOPIA's and
 * Quaderno's sandboxes through. Plain-http requests (the spending gates' Unix sockets) and loopback stay direct. The
 * values are given to Node directly, never put into the process environment the API reads. Returns Node's restore.
 */
export function installHostedEgress(deploymentMode,setProxy=setGlobalProxyFromEnv) {
 if(deploymentMode==='local')return ()=>{};
 if(deploymentMode!=='hosted')refuse('PREVIEW_ENVIRONMENT_REFUSED');
 return setProxy({...PREVIEW_HOSTED_PROXY_ENVIRONMENT});
}
/** A release key (side-by-side INTERFACE): `r<site version>-<12 hex of the code revision>`. Root's release-table.mjs keeps the same text; a test pins the two equal. */
export const RELEASE_KEY_PATTERN=/^r[1-9][0-9]*-[0-9a-f]{12}$/;
/** The one release key a reviewed plan may run under: its register version and the first 12 hex of its source revision (side-by-side INTERFACE). */
export function expectedReleaseKey(publication,sourceRevision) {
 return `r${publication.registerVersion}-${sourceRevision.slice(0,12)}`;
}
// RELEASE_KEY: the website refuses to start without its release key (side-by-side spec §1, §7; apps/ui/release-edge.mjs).
const UI=['NODE_ENV','PUBLIC_APP_URL','PORT','DIALECTICAL_UI_HOST','DIALECTICAL_API_BASE','DIALECTICAL_UI_TRUSTED_PROXIES','DIALECTICAL_UI_EDGE_SECRET_PATH','NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON','TURNSTILE_SITE_KEY','RELEASE_KEY'];
/**
 * Side-by-side spec §1 (O1): a preview process starts only as its plan's release. Its RELEASE_KEY must be exactly
 * r<plan register pin>-<first 12 hex of the plan's source revision>, so an env file of another release (another
 * revision, another register version) never starts this one's code; the parsers only check the key's form and number.
 * A runner's worker id and Hatchet worker name end with that key (plan D, release-env.mjs), so two releases' runners
 * never share a worker identity.
 */
function assertReleaseKey(service,configured,publication,approved) {
 if(typeof approved?.sourceRevision!=='string'||!/^[0-9a-f]{40}$/.test(approved.sourceRevision)||typeof publication?.registerVersion!=='string'
  ||!RELEASE_KEY_PATTERN.test(configured.RELEASE_KEY??'')||configured.RELEASE_KEY!==expectedReleaseKey(publication,approved.sourceRevision))refuse();
 if(service==='runner'&&['RUNNER_WORKER_ID','HATCHET_WORKER_NAME'].some(key=>typeof configured[key]!=='string'||!configured[key].endsWith(`-${configured.RELEASE_KEY}`)))refuse();
}
export function parseEnvironmentText(text) {
 try{
  if(typeof text!=='string'||Buffer.byteLength(text)>32768||/[\0\r]/.test(text))refuse();const out={};
  for(const line of text.split('\n')){if(line==='')continue;const match=/^([A-Z][A-Z0-9_]*)=([^\n]*)$/.exec(line);
   if(!match||Object.hasOwn(out,match[1])||match[2].length===0||/[`\x00-\x1f\x7f]/.test(match[2])||match[2].includes('$(')||/^['"]/.test(match[2]))refuse();out[match[1]]=match[2];}
  return out;
 }catch{refuse('PREVIEW_ENVIRONMENT_REFUSED');}
}
/**
 * For service ui, `runtime` is `{builtModelRosterFlag}`: the model list the website was built with (ui-build.mjs builtModelRosterFlag).
 * Every service needs the reviewed plan's publication and source revision for its release key (assertReleaseKey).
 */
export function narrowEnvironment(service,configured,runtime,publication,approved) {
 try{
  if(!configured||Object.getPrototypeOf(configured)!==Object.prototype)refuse();
  const inventory=service==='api'?runtime.API_ENVIRONMENT_KEYS:service==='runner'?runtime.RUNNER_ENVIRONMENT_KEYS:null;
  const keys=service==='ui'?UI:inventory?[...inventory.required,...inventory.optional,...(service==='api'?STAFF:[])]:[];
  if(!keys.length||Object.entries(configured).some(([key,value])=>!keys.includes(key)||typeof value!=='string'||/[\0\r\n]/.test(value)))refuse();
  if(configured.NODE_ENV!=='production')refuse();
  assertReleaseKey(service,configured,publication,approved);
  const environment={...configured,PATH:'/usr/local/bin:/usr/bin:/bin'};
  if(service==='ui'){
   if(configured.PUBLIC_APP_URL!==PREVIEW_ORIGIN||configured.PORT!==approved.uiPort||configured.DIALECTICAL_UI_HOST!=='127.0.0.1'
    ||configured.DIALECTICAL_API_BASE!==`http://127.0.0.1:${approved.apiPort}`
    ||!isReviewedModelRosterFlag(configured.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON)||configured.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON!==runtime?.builtModelRosterFlag
    ||(configured.TURNSTILE_SITE_KEY!==undefined&&configured.TURNSTILE_SITE_KEY!==PREVIEW_SITE_KEY))refuse();
   return {environment:Object.freeze(environment),selectedRegisterVersion:null,deploymentMode:'local'};
  }
  if(REFUSED_ON_PREVIEW.some(key=>configured[key]!==undefined))refuse();
  const normalized=service==='api'?runtime.parseApiEnvironment(configured):runtime.parseRunnerEnvironment(configured);
  // Local, or hosted (owner rulings 2026-10-13) only on the preview's own configuration (the spending gates and the team).
  const mode=configured.DEBATEAI_DEPLOYMENT_MODE;
  if(!['local','hosted'].includes(mode)||normalized.DEPLOYMENT_MODE!==mode||String(normalized.REGISTER_VERSION)!==publication.registerVersion
    ||(mode==='hosted'&&normalized.PREVIEW_PROVIDER_TEST_CONFIG===undefined))refuse();
  if(service==='api'){
   if(configured.PUBLIC_APP_URL!==PREVIEW_ORIGIN||configured.API_HOST!=='127.0.0.1'||configured.API_PORT!==approved.apiPort
    ||configured.MAIL_SENDMAIL_PATH!==approved.mailExecutable||configured.MAIL_FROM!==approved.mailFrom
    ||(configured.TURNSTILE_SOCKET_PATH!==undefined&&configured.TURNSTILE_SOCKET_PATH!==PREVIEW_SOCKET))refuse();
   if(normalized.STAFF_ACCESS.policyVersion===2&&(normalized.STAFF_ACCESS.origin!==PREVIEW_ORIGIN||normalized.STAFF_ACCESS.rpId!=='v3-preview.dezbatere.ro'))refuse();
   // Social configuration is admitted by the final product's parser only when its whole pair is present.
   if((configured.SOCIAL_SOCKET_PATH===undefined)!==(configured.SOCIAL_PROVIDERS_JSON===undefined))refuse();
   if(mode==='hosted')assertHostedApiValues(configured);
   else if(BILLING_ONLY_KEYS.some(key=>configured[key]!==undefined))refuse();
  }
  return {environment:Object.freeze(environment),selectedRegisterVersion:String(normalized.REGISTER_VERSION),deploymentMode:normalized.DEPLOYMENT_MODE};
 }catch{refuse('PREVIEW_ENVIRONMENT_REFUSED');}
}
export async function readEnvironmentFile(path,custody) {
 return withPrivateBytes(path,{...custody,maxBytes:32768},raw=>parseEnvironmentText(new TextDecoder('utf8',{fatal:true}).decode(raw)));
}
export function installNarrowEnvironment(environment) {
 for(const key of Object.keys(process.env))delete process.env[key];
 for(const [key,value]of Object.entries(environment))process.env[key]=value;
}
