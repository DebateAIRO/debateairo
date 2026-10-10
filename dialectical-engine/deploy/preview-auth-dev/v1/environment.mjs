import { refuse, withPrivateBytes } from './custody.mjs';
import { PREVIEW_ORIGIN, PREVIEW_SITE_KEY, PREVIEW_SOCKET } from './turnstile-custody.mjs';
const STAFF=['STAFF_ACCESS_POLICY_VERSION','STAFF_WEBAUTHN_ORIGIN','STAFF_WEBAUTHN_RP_ID','STAFF_INDEPENDENT_ALERT_CONFIG_PATH','STAFF_ALERT_OPERATOR_MODULE_PATH','STAFF_ALERT_OPERATOR_MODULE_SHA256',
 'INTERNAL_ALLOWANCE_POLICY_VERSION','INTERNAL_ALLOWANCE_CURRENCY','INTERNAL_ALLOWANCE_MAXIMUM_GRANT_MICROS','INTERNAL_ALLOWANCE_MAXIMUM_DAY_MICROS','INTERNAL_ALLOWANCE_MAXIMUM_WEEK_MICROS','INTERNAL_ALLOWANCE_MAXIMUM_LIFETIME_MS','INTERNAL_ALLOWANCE_FINISH_ALLOWANCE_BP','INTERNAL_ALLOWANCE_POLICY_SOURCE_REF'];
/**
 * The only public model lists the preview UI may be built and run with, one per stage of the switch-on
 * order (deploy/preview-gate/v3/README.md, "Switching on the new models, in order"):
 * - `glm-only`: the legacy array, GLM for Free and Premium (until the gate and the API offer more);
 * - `multi-model`: Free gets two makers (Z.AI, DeepSeek), Premium three (plus Xiaomi).
 * The value is baked into the website when it is built (release-artifacts.mjs `ui-build --models`),
 * ui-build.mjs records it next to the build, and narrowEnvironment demands that ui.env says the same.
 */
export const PREVIEW_MODEL_ROSTER_FLAGS=Object.freeze({
 'glm-only':'["zai-org/GLM-5.3-Flash"]',
 'multi-model':'{"free":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash"],"premium":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro"]}'
});
/** The default build value (the stage before the API offers more than GLM): the legacy array. */
export const PREVIEW_FREE_MODEL_IDS_JSON=PREVIEW_MODEL_ROSTER_FLAGS['glm-only'];
const REVIEWED_ROSTER_FLAGS=Object.values(PREVIEW_MODEL_ROSTER_FLAGS);
export const isReviewedModelRosterFlag=value=>typeof value==='string'&&REVIEWED_ROSTER_FLAGS.includes(value);
const LEGACY_CONFIG_KEYS='budget_socket,deployment,free_model_ids,requested_thinking_level,scope_id';
const ROSTER_CONFIG_KEYS='budget_socket,deployment,free_model_ids,premium_model_ids,requested_thinking_level,scope_id';
// PR B and C: the roster form may also name the Anthropic and the Google gate's sockets (the API's
// parser checks their values).
const OPTIONAL_SOCKET_KEYS=Object.freeze(['anthropic_budget_socket','google_budget_socket']);
/**
 * Whether the UI's public model list (NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON) offers exactly what the
 * API's preview configuration (PREVIEW_PROVIDER_TEST_CONFIG_JSON) allows: the legacy array only with the
 * legacy five-key config holding that one list; the two-list object only with the six-key config holding
 * the same free and premium lists, in the same order. A UI that offers a model the API refuses, or the
 * reverse, is a mismatch. The API config's own parser (packages/providers preview-test.ts) checks the rest.
 */
export function uiRosterMatchesApiConfig(uiFlag,apiConfigJson) {
 try{
  if(!isReviewedModelRosterFlag(uiFlag)||typeof apiConfigJson!=='string')return false;
  const ui=JSON.parse(uiFlag),api=JSON.parse(apiConfigJson);
  if(!api||typeof api!=='object'||Array.isArray(api))return false;
  const keys=Object.keys(api).sort().join(','),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(Array.isArray(ui))return keys===LEGACY_CONFIG_KEYS&&same(api.free_model_ids,ui);
  const rosterKeys=Object.keys(api).filter(key=>!OPTIONAL_SOCKET_KEYS.includes(key)).sort().join(',');
  return rosterKeys===ROSTER_CONFIG_KEYS&&same(api.free_model_ids,ui.free)&&same(api.premium_model_ids,ui.premium);
 }catch{return false;}
}
const UI=['NODE_ENV','PUBLIC_APP_URL','PORT','DIALECTICAL_UI_HOST','DIALECTICAL_API_BASE','DIALECTICAL_UI_TRUSTED_PROXIES','DIALECTICAL_UI_EDGE_SECRET_PATH','NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON','TURNSTILE_SITE_KEY'];
export function parseEnvironmentText(text) {
 try{
  if(typeof text!=='string'||Buffer.byteLength(text)>32768||/[\0\r]/.test(text))refuse();const out={};
  for(const line of text.split('\n')){if(line==='')continue;const match=/^([A-Z][A-Z0-9_]*)=([^\n]*)$/.exec(line);
   if(!match||Object.hasOwn(out,match[1])||match[2].length===0||/[`\x00-\x1f\x7f]/.test(match[2])||match[2].includes('$(')||/^['"]/.test(match[2]))refuse();out[match[1]]=match[2];}
  return out;
 }catch{refuse('PREVIEW_ENVIRONMENT_REFUSED');}
}
/** For service ui, `runtime` is `{builtModelRosterFlag}`: the model list the website was built with (ui-build.mjs builtModelRosterFlag). */
export function narrowEnvironment(service,configured,runtime,publication,approved) {
 try{
  if(!configured||Object.getPrototypeOf(configured)!==Object.prototype)refuse();
  const inventory=service==='api'?runtime.API_ENVIRONMENT_KEYS:service==='runner'?runtime.RUNNER_ENVIRONMENT_KEYS:null;
  const keys=service==='ui'?UI:inventory?[...inventory.required,...inventory.optional,...(service==='api'?STAFF:[])]:[];
  if(!keys.length||Object.entries(configured).some(([key,value])=>!keys.includes(key)||typeof value!=='string'||/[\0\r\n]/.test(value)))refuse();
  if(configured.NODE_ENV!=='production')refuse();
  const environment={...configured,PATH:'/usr/local/bin:/usr/bin:/bin'};
  if(service==='ui'){
   if(configured.PUBLIC_APP_URL!==PREVIEW_ORIGIN||configured.PORT!==approved.uiPort||configured.DIALECTICAL_UI_HOST!=='127.0.0.1'
    ||configured.DIALECTICAL_API_BASE!==`http://127.0.0.1:${approved.apiPort}`
    ||!isReviewedModelRosterFlag(configured.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON)||configured.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON!==runtime?.builtModelRosterFlag
    ||(configured.TURNSTILE_SITE_KEY!==undefined&&configured.TURNSTILE_SITE_KEY!==PREVIEW_SITE_KEY))refuse();
   return {environment:Object.freeze(environment),selectedRegisterVersion:null,deploymentMode:'local'};
  }
  const normalized=service==='api'?runtime.parseApiEnvironment(configured):runtime.parseRunnerEnvironment(configured);
  if(normalized.DEPLOYMENT_MODE!=='local'||String(normalized.REGISTER_VERSION)!==publication.registerVersion
    ||configured.DEBATEAI_DEPLOYMENT_MODE!=='local')refuse();
  if(service==='api'){
   if(configured.PUBLIC_APP_URL!==PREVIEW_ORIGIN||configured.API_HOST!=='127.0.0.1'||configured.API_PORT!==approved.apiPort
    ||configured.MAIL_SENDMAIL_PATH!==approved.mailExecutable||configured.MAIL_FROM!==approved.mailFrom
    ||(configured.TURNSTILE_SOCKET_PATH!==undefined&&configured.TURNSTILE_SOCKET_PATH!==PREVIEW_SOCKET))refuse();
   if(normalized.STAFF_ACCESS.policyVersion===2&&(normalized.STAFF_ACCESS.origin!==PREVIEW_ORIGIN||normalized.STAFF_ACCESS.rpId!=='v3-preview.dezbatere.ro'))refuse();
   // Social configuration is admitted by the final product's parser only when its whole pair is present.
   if((configured.SOCIAL_SOCKET_PATH===undefined)!==(configured.SOCIAL_PROVIDERS_JSON===undefined))refuse();
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
