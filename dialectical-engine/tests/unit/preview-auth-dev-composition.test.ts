import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseApiEnvironment,parseRunnerEnvironment,API_ENVIRONMENT_KEYS,RUNNER_ENVIRONMENT_KEYS } from '../../packages/register/src/runtime-environment.js';
import { validApiEnvironmentFixture,validRunnerEnvironmentFixture } from '../support/apiEnvironmentFixture.js';
import { parsePreviewProviderTestConfig } from '../../packages/providers/src/preview-test.js';
import { parseProviderDiscoveryTargets,previewModelRow,previewTargetJsonRow } from '@debateai/providers';
import { assertPreviewVersionTargets } from '../../apps/runner/src/run-settings.js';
import ts from 'typescript-classic';
import { installBootCustody } from '../../apps/api/src/boot-custody.js';
const config={deployment:'v3-preview',free_model_ids:['zai-org/GLM-5.3-Flash'],requested_thinking_level:'high',budget_socket:'/run/debateai-v3-preview/glm.sock',scope_id:'fixture'};
const loaders=[['api',parseApiEnvironment,validApiEnvironmentFixture,API_ENVIRONMENT_KEYS],['runner',parseRunnerEnvironment,validRunnerEnvironmentFixture,RUNNER_ENVIRONMENT_KEYS]] as const;
describe('actual entrypoint opt-in preview composition',()=>{
 for(const [service,parse,fixture,inventory] of loaders){
  it(`${service} parses only the explicit optional strict preview configuration`,()=>{expect(inventory.optional).toContain('PREVIEW_PROVIDER_TEST_CONFIG_JSON');const value=parse({...fixture(),PREVIEW_PROVIDER_TEST_CONFIG_JSON:JSON.stringify(config)}) as any;expect(value.PREVIEW_PROVIDER_TEST_CONFIG).toEqual(parsePreviewProviderTestConfig(JSON.stringify(config)));expect((parse(fixture()) as any).PREVIEW_PROVIDER_TEST_CONFIG).toBeUndefined();});
  it.each([{extra:true},{free_model_ids:['other']},{budget_socket:'/tmp/other.sock'}])(`${service} refuses malformed opt-in before composition`,patch=>expect(()=>parse({...fixture(),PREVIEW_PROVIDER_TEST_CONFIG_JSON:JSON.stringify({...config,...patch})})).toThrow('PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID'));
 }
 for(const service of ['api']){
  it(`${service} executes its shipped pre-discovery guard and refuses VALID before credential resolution`,async()=>{
   const source=await readFile(new URL(`../../apps/${service}/src/main.ts`,import.meta.url),'utf8');
   const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
   const guard=ast.statements.find(statement=>ts.isIfStatement(statement)&&statement.expression.getText(ast)==='previewConfig !== undefined'&&statement.getText(ast).includes('PREVIEW_SCORECARD_CONFLICT'));
   expect(guard,'real entrypoint must contain a pre-credential preview guard').toBeDefined();
   if(!guard)return;
   const code=guard.getText(ast);let targetChecks=0,reads=0,roleChecks=0;
   const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
   const run=new AsyncFunction('previewConfig','declaredProviderTargets','assertPreviewProviderTargets','readModelScorecard','pool','environment','readEngineVersion','TypedDomainError','boot','assertPreviewRoleTargets','policy','storyPolicy',ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
   class Domain extends Error{constructor(code:string){super(code);}}
   let closed=0;const pool={end:async()=>{closed++;}},boot=installBootCustody({logger:{error:()=>undefined}});if(service==='api')boot.hold(pool);
   await expect(run(config,[],()=>{targetChecks++;},async()=>{reads++;return{state:'VALID'};},pool,{REGISTER_VERSION:12},async()=>'current',Domain,boot,()=>{roleChecks++;},{synthesisRolePolicy:{synthesizerRoleRef:'preview:fixture-a',evaluatorRoleRef:'preview:fixture-b'}},null)).rejects.toThrow('PREVIEW_SCORECARD_CONFLICT');expect({targetChecks,reads}).toEqual({targetChecks:1,reads:1});expect(roleChecks).toBe(service==='api'?0:1);expect(closed).toBe(service==='api'?1:0);
   const absentBoot=installBootCustody({logger:{error:()=>undefined}});targetChecks=0;reads=0;await run(undefined,[],()=>{targetChecks++;},async()=>{reads++;return{state:'VALID'};},pool,{REGISTER_VERSION:12},async()=>'current',Domain,absentBoot,()=>{roleChecks++;},{synthesisRolePolicy:{synthesizerRoleRef:'preview:fixture-a',evaluatorRoleRef:'preview:fixture-b'}},null);expect({targetChecks,reads}).toEqual({targetChecks:0,reads:0});absentBoot.release();
   expect(source.indexOf(code)).toBeLessThan(source.indexOf(service==='api'?'const providerDiscoveryTargets =':'const providerTargets ='));
  });
 }
 // Side-by-side spec §13, addition D16: the runner's preview guard is split. main.ts keeps the half that needs no line-up
 // (the declared targets are a reviewed set) and runs it before credential resolution; the version's rosters, seats and
 // scorecard are checked by the one settings loader (assertPreviewVersionTargets), which main.ts runs for its site
 // version before credential resolution too, so a VALID scorecard still refuses the boot before any credential is read.
 it('runner executes its shipped target-set guard, loads its site version and refuses VALID before credential resolution',async()=>{
  const source=await readFile(new URL('../../apps/runner/src/main.ts',import.meta.url),'utf8');
  const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
  const guard=ast.statements.find(statement=>ts.isIfStatement(statement)&&statement.expression.getText(ast)==='previewGate !== undefined'&&statement.getText(ast).includes('assertPreviewTargetSet(declaredProviderTargets)'));
  expect(guard,'real entrypoint must contain a pre-credential preview target guard').toBeDefined();
  if(!guard)return;
  const code=guard.getText(ast);let targetChecks=0;
  const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
  const run=new AsyncFunction('previewGate','declaredProviderTargets','assertPreviewTargetSet',ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
  await run(config,[],()=>{targetChecks++;});expect(targetChecks).toBe(1);
  targetChecks=0;await run(undefined,[],()=>{targetChecks++;});expect(targetChecks).toBe(0);
  const credentials=source.indexOf('const providerTargets =');
  expect(source.indexOf(code)).toBeGreaterThan(-1);
  expect(source.indexOf(code)).toBeLessThan(credentials);
  const boot=source.indexOf('const siteVersionSettings = await runnerSettings.requireSettings(environment.REGISTER_VERSION);');
  expect(boot).toBeGreaterThan(-1);expect(boot).toBeLessThan(credentials);
  // The version's half, executed: the same two seats on the sealed two-GLM targets; VALID refuses, ABSENT passes.
  const refs=['preview:fixture-a','preview:fixture-b'];
  const targets=parseProviderDiscoveryTargets(JSON.stringify(refs.map(ref=>previewTargetJsonRow(ref))),refs.map(ref=>{const row=previewModelRow(previewTargetJsonRow(ref).model as string)!;return{providerRef:ref,maker:row.maker,adapterKind:row.adapterKind};}));
  const previewConfig=parsePreviewProviderTestConfig(JSON.stringify(config))!;
  const policy={synthesisRolePolicy:{synthesizerRoleRef:'preview:fixture-a',evaluatorRoleRef:'preview:fixture-b'}} as never;
  expect(()=>assertPreviewVersionTargets({previewConfig,declaredProviderTargets:targets,policy,storyPolicy:null,scorecardState:'VALID'})).toThrowError(expect.objectContaining({code:'PREVIEW_SCORECARD_CONFLICT'}));
  expect(()=>assertPreviewVersionTargets({previewConfig,declaredProviderTargets:targets,policy,storyPolicy:null,scorecardState:'ABSENT'})).not.toThrow();
  // A seat on an undeclared ref is refused before the scorecard is looked at (today's order: targets, roles, scorecard).
  expect(()=>assertPreviewVersionTargets({previewConfig,declaredProviderTargets:targets.slice(0,1),policy,storyPolicy:null,scorecardState:'VALID'})).toThrow('PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID');
  // Off the preview the loader runs none of it: the version check sits behind the version's composed config.
  const loader=await readFile(new URL('../../apps/runner/src/run-settings.ts',import.meta.url),'utf8');
  expect(loader).toMatch(/if \(previewConfig !== undefined\) \{\s*assertPreviewVersionTargets\(\{/u);
 });
 it('binds both actual API constructor consumers and all runner claim/gateway transports',async()=>{const api=await readFile(new URL('../../apps/api/src/main.ts',import.meta.url),'utf8');const runner=await readFile(new URL('../../apps/runner/src/main.ts',import.meta.url),'utf8');expect(api.match(/previewProviderTestConfig: previewConfig/g)).toHaveLength(2);expect(api).toContain('fetchImplementation: previewFetch');// Spec 2026-10-11 busy model §2: the two claim probes share one helper (observeClaimTarget), so the gateway and that helper bind the transport.
expect(runner.match(/fetchImplementation: previewFetch/g)).toHaveLength(2);expect(runner.match(/await observeClaimTarget\(target\)/g)).toHaveLength(2);expect(runner).toContain('previewExecutionTimeout: "3600s"');expect(runner).toContain('withPreviewProviderCallPolicy(gateway, siteVersionSettings.previewConfig!, target, {\n    busy: previewBusy,\n    onGateUnsent: (gate) => { runnerCallScheduler.markGateUnhealthy(gate); },\n    gateRemaining: previewGateRemaining,\n    onFinalWriterTierUnread: previewFinalWriterTierUnread\n  });');expect(api).toContain('probeControlsFor: previewProbeControls');expect(runner.match(/previewProbeControls\(target\)/g)).toHaveLength(1);expect(runner).toContain('...previewTargetGatewayControls(previewGate, target),');const loader=await readFile(new URL('../../apps/runner/src/run-settings.ts',import.meta.url),'utf8');expect(loader).toContain('assertPreviewRoleTargets(previewConfig, declaredProviderTargets, [');expect(runner).not.toContain('assertPreviewRoleTargets(');expect(api).toContain('assertPreviewRoleTargets(previewConfig, declaredProviderTargets, settings.roleProviderRefs);');});
});
