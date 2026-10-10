import { describe, expect, it } from 'vitest';
import * as runtime from '../../packages/register/src/runtime-environment.js';
import { validApiEnvironmentFixture } from '../support/apiEnvironmentFixture.js';
const env=await import('../../deploy/'+'preview-auth-dev/v1/environment.mjs');
const native={registerVersion:'12'};
const approved={apiPort:'3101',uiPort:'3100',mailExecutable:'/opt/release/mail-handoff.mjs',mailFrom:'noreply@dezbatere.ro'};
function configured():Record<string,string>{return{...validApiEnvironmentFixture(),NODE_ENV:'production',REGISTER_VERSION:'12',PUBLIC_APP_URL:'https://v3-preview.dezbatere.ro',API_PORT:'3101',API_HOST:'127.0.0.1',MAIL_SENDMAIL_PATH:approved.mailExecutable,MAIL_FROM:'noreply@dezbatere.ro'};}
describe('source-derived strict preview environment',()=>{
 it('retains opaque values only for current source keys and privately normalizes exact local register selection',()=>{const input=configured();const result=env.narrowEnvironment('api',input,runtime,native,approved);expect(result.environment.DATABASE_URL).toBe(input.DATABASE_URL);expect(result.selectedRegisterVersion).toBe('12');expect(result.deploymentMode).toBe('local');expect(result.environment.PATH).toBe('/usr/local/bin:/usr/bin:/bin');});
 it.each([{NODE_OPTIONS:'--require attacker'},{EXTRA:'unrecognized'},{REGISTER_VERSION:'11'},{PUBLIC_APP_URL:'https://dezbatere.ro'},{DEBATEAI_DEPLOYMENT_MODE:'hosted'},{TURNSTILE_SOCKET_PATH:'/tmp/relay.sock'},{MAIL_SENDMAIL_PATH:'/usr/sbin/sendmail'},{RECORDS_KEY_PATH:'/run/secrets/kek'}])('rejects env, domain, native version, mail or key-domain drift without emitting values',patch=>expect(()=>env.narrowEnvironment('api',{...configured(),...patch},runtime,native,approved)).toThrow(/^PREVIEW_ENVIRONMENT_REFUSED$/));
 it('admits only the exact optional public Turnstile mapping',()=>expect(env.narrowEnvironment('api',{...configured(),TURNSTILE_SOCKET_PATH:'/run/debateai-preview-turnstile/siteverify.sock'},runtime,native,approved).environment.TURNSTILE_SOCKET_PATH).toBe('/run/debateai-preview-turnstile/siteverify.sock'));
 it.each(['A=one\nA=two\n','A=$(command)\n','export A=one\n','A=one\r\n','BAD-NAME=one\n'])('refuses ambiguous executable environment syntax',text=>expect(()=>env.parseEnvironmentText(text)).toThrow(/^PREVIEW_ENVIRONMENT_REFUSED$/));
 it('parses exact bare values including embedded equals without expansion',()=>expect(env.parseEnvironmentText('A=one=two\nB={"fixed":true}\n')).toEqual({A:'one=two',B:'{"fixed":true}'}));
});

const LEGACY_FLAG='["zai-org/GLM-5.3-Flash"]';
const MULTI_FLAG='{"free":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash"],"premium":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro"]}';
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
  for(const value of [undefined,'',' '+LEGACY_FLAG,'["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash"]',MULTI_FLAG.replace(',"XiaomiMiMo/MiMo-V2.6-Pro"',''),JSON.stringify(JSON.parse(MULTI_FLAG),null,1)])expect(env.isReviewedModelRosterFlag(value)).toBe(false);
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
  ['the two-list value with the six-key config holding the same lists',MULTI_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK],premium_model_ids:[GLM,DEEPSEEK,MIMO]}),true],
  ['the legacy array with a six-key config',LEGACY_FLAG,apiConfig({free_model_ids:[GLM],premium_model_ids:[GLM]}),false],
  ['the legacy array with the six-key multi config',LEGACY_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK],premium_model_ids:[GLM,DEEPSEEK,MIMO]}),false],
  ['the two-list value with the legacy config (the website would offer models the API refuses)',MULTI_FLAG,apiConfig({free_model_ids:[GLM]}),false],
  ['the two-list value with a narrower premium list',MULTI_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK],premium_model_ids:[GLM,DEEPSEEK]}),false],
  ['the two-list value with lists in another order',MULTI_FLAG,apiConfig({free_model_ids:[DEEPSEEK,GLM],premium_model_ids:[GLM,DEEPSEEK,MIMO]}),false],
  ['the two-list value with free and premium swapped',MULTI_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK,MIMO],premium_model_ids:[GLM,DEEPSEEK]}),false],
  ['a config with an extra key',LEGACY_FLAG,apiConfig({free_model_ids:[GLM],extra:true}),false],
  // PR B: the six-key config may also name the Anthropic gate's socket; the website lists must still match.
  ['the two-list value with the six-key config plus the Anthropic socket',MULTI_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK],premium_model_ids:[GLM,DEEPSEEK,MIMO],anthropic_budget_socket:'/run/debateai-v3-preview/anthropic-budget-v1.sock'}),true],
  ['the legacy array with the legacy config plus the Anthropic socket',LEGACY_FLAG,apiConfig({free_model_ids:[GLM],anthropic_budget_socket:'/run/debateai-v3-preview/anthropic-budget-v1.sock'}),false],
  ['the two-list value with an API roster naming Haiku the website does not offer',MULTI_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK],premium_model_ids:[GLM,DEEPSEEK,MIMO,'claude-haiku-5-5'],anthropic_budget_socket:'/run/debateai-v3-preview/anthropic-budget-v1.sock'}),false],
  ['the all-models value with the six-key config holding all five on both lists plus the Anthropic socket',ALL_FLAG,apiConfig({free_model_ids:ALL_FIVE,premium_model_ids:ALL_FIVE,anthropic_budget_socket:ANTHROPIC_SOCKET}),true],
  ['the all-models value with an API config without Haiku (the website would offer a model the API refuses)',ALL_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK,MIMO,QWEN],premium_model_ids:[GLM,DEEPSEEK,MIMO,QWEN],anthropic_budget_socket:ANTHROPIC_SOCKET}),false],
  ['the all-models value with the multi-model config',ALL_FLAG,apiConfig({free_model_ids:[GLM,DEEPSEEK],premium_model_ids:[GLM,DEEPSEEK,MIMO]}),false],
  ['the multi-model value with the all-models config',MULTI_FLAG,apiConfig({free_model_ids:ALL_FIVE,premium_model_ids:ALL_FIVE,anthropic_budget_socket:ANTHROPIC_SOCKET}),false],
  ['no API config',LEGACY_FLAG,undefined,false],
  ['an API config that is not JSON',LEGACY_FLAG,'{',false],
  ['an unreviewed website list that matches the config',JSON.stringify([GLM,DEEPSEEK]),apiConfig({free_model_ids:[GLM,DEEPSEEK]}),false]
 ])('the stage check: %s',(_name,flag,config,expected)=>{expect(env.uiRosterMatchesApiConfig(flag,config)).toBe(expected);});
});
