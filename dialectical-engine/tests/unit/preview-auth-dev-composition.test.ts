import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseApiEnvironment,parseRunnerEnvironment,API_ENVIRONMENT_KEYS,RUNNER_ENVIRONMENT_KEYS } from '../../packages/register/src/runtime-environment.js';
import { validApiEnvironmentFixture,validRunnerEnvironmentFixture } from '../support/apiEnvironmentFixture.js';
import { parsePreviewProviderTestConfig } from '../../packages/providers/src/preview-test.js';
import ts from 'typescript-classic';
const config={deployment:'v3-preview',free_model_ids:['zai-org/GLM-5.3-Flash'],requested_thinking_level:'high',budget_socket:'/run/debateai-v3-preview/glm.sock',scope_id:'fixture'};
const loaders=[['api',parseApiEnvironment,validApiEnvironmentFixture,API_ENVIRONMENT_KEYS],['runner',parseRunnerEnvironment,validRunnerEnvironmentFixture,RUNNER_ENVIRONMENT_KEYS]] as const;
describe('actual entrypoint opt-in preview composition',()=>{
 for(const [service,parse,fixture,inventory] of loaders){
  it(`${service} parses only the explicit optional strict preview configuration`,()=>{expect(inventory.optional).toContain('PREVIEW_PROVIDER_TEST_CONFIG_JSON');const value=parse({...fixture(),PREVIEW_PROVIDER_TEST_CONFIG_JSON:JSON.stringify(config)}) as any;expect(value.PREVIEW_PROVIDER_TEST_CONFIG).toEqual(parsePreviewProviderTestConfig(JSON.stringify(config)));expect((parse(fixture()) as any).PREVIEW_PROVIDER_TEST_CONFIG).toBeUndefined();});
  it.each([{extra:true},{free_model_ids:['other']},{budget_socket:'/tmp/other.sock'}])(`${service} refuses malformed opt-in before composition`,patch=>expect(()=>parse({...fixture(),PREVIEW_PROVIDER_TEST_CONFIG_JSON:JSON.stringify({...config,...patch})})).toThrow('PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID'));
 }
 for(const service of ['api','runner']){
  it(`${service} executes its shipped pre-discovery guard and refuses VALID before credential resolution`,async()=>{
   const source=await readFile(new URL(`../../apps/${service}/src/main.ts`,import.meta.url),'utf8');
   const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
   const guard=ast.statements.find(statement=>ts.isIfStatement(statement)&&statement.expression.getText(ast)==='previewConfig !== undefined'&&statement.getText(ast).includes('PREVIEW_SCORECARD_CONFLICT'));
   expect(guard,'real entrypoint must contain a pre-credential preview guard').toBeDefined();
   if(!guard)return;
   const code=guard.getText(ast);let targetChecks=0,reads=0;
   const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
   const run=new AsyncFunction('previewConfig','declaredProviderTargets','assertPreviewProviderTargets','readModelScorecard','pool','environment','readEngineVersion','TypedDomainError',ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
   class Domain extends Error{constructor(code:string){super(code);}}
   await expect(run(config,[],()=>{targetChecks++;},async()=>{reads++;return{state:'VALID'};},{},{REGISTER_VERSION:12},async()=>'current',Domain)).rejects.toThrow('PREVIEW_SCORECARD_CONFLICT');expect({targetChecks,reads}).toEqual({targetChecks:1,reads:1});
   targetChecks=0;reads=0;await run(undefined,[],()=>{targetChecks++;},async()=>{reads++;return{state:'VALID'};},{},{REGISTER_VERSION:12},async()=>'current',Domain);expect({targetChecks,reads}).toEqual({targetChecks:0,reads:0});
   expect(source.indexOf(code)).toBeLessThan(source.indexOf(service==='api'?'const providerDiscoveryTargets =':'const providerTargets ='));
  });
 }
 it('binds both actual API constructor consumers and all runner claim/gateway transports',async()=>{const api=await readFile(new URL('../../apps/api/src/main.ts',import.meta.url),'utf8');const runner=await readFile(new URL('../../apps/runner/src/main.ts',import.meta.url),'utf8');expect(api.match(/previewProviderTestConfig: previewConfig/g)).toHaveLength(2);expect(api).toContain('fetchImplementation: previewFetch');expect(runner.match(/fetchImplementation: previewFetch/g)).toHaveLength(3);expect(runner).toContain('previewExecutionTimeout: "3600s"');expect(runner).toContain('withPreviewProviderCallPolicy(gateway, previewConfig)');});
});
