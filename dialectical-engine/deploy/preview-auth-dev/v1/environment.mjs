import { refuse, withPrivateBytes } from './custody.mjs';
import { PREVIEW_ORIGIN, PREVIEW_SITE_KEY, PREVIEW_SOCKET } from './turnstile-custody.mjs';
const STAFF=['STAFF_ACCESS_POLICY_VERSION','STAFF_WEBAUTHN_ORIGIN','STAFF_WEBAUTHN_RP_ID','STAFF_INDEPENDENT_ALERT_CONFIG_PATH','STAFF_ALERT_OPERATOR_MODULE_PATH','STAFF_ALERT_OPERATOR_MODULE_SHA256',
 'INTERNAL_ALLOWANCE_POLICY_VERSION','INTERNAL_ALLOWANCE_CURRENCY','INTERNAL_ALLOWANCE_MAXIMUM_GRANT_MICROS','INTERNAL_ALLOWANCE_MAXIMUM_DAY_MICROS','INTERNAL_ALLOWANCE_MAXIMUM_WEEK_MICROS','INTERNAL_ALLOWANCE_MAXIMUM_LIFETIME_MS','INTERNAL_ALLOWANCE_FINISH_ALLOWANCE_BP','INTERNAL_ALLOWANCE_POLICY_SOURCE_REF'];
const UI=['NODE_ENV','PUBLIC_APP_URL','PORT','DIALECTICAL_UI_HOST','DIALECTICAL_API_BASE','DIALECTICAL_UI_TRUSTED_PROXIES','DIALECTICAL_UI_EDGE_SECRET_PATH','NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON','TURNSTILE_SITE_KEY'];
export function parseEnvironmentText(text) {
 try{
  if(typeof text!=='string'||Buffer.byteLength(text)>32768||/[\0\r]/.test(text))refuse();const out={};
  for(const line of text.split('\n')){if(line==='')continue;const match=/^([A-Z][A-Z0-9_]*)=([^\n]*)$/.exec(line);
   if(!match||Object.hasOwn(out,match[1])||match[2].length===0||/[`\x00-\x1f\x7f]/.test(match[2])||match[2].includes('$(')||/^['"]/.test(match[2]))refuse();out[match[1]]=match[2];}
  return out;
 }catch{refuse('PREVIEW_ENVIRONMENT_REFUSED');}
}
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
    ||configured.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON!=='["zai-org/GLM-5.3-Flash"]'
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
