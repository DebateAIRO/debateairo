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
