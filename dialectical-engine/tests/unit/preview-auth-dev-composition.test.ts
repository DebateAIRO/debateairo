import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseApiEnvironment,parseRunnerEnvironment,API_ENVIRONMENT_KEYS,RUNNER_ENVIRONMENT_KEYS } from '../../packages/register/src/runtime-environment.js';
import { validApiEnvironmentFixture,validRunnerEnvironmentFixture } from '../support/apiEnvironmentFixture.js';
import { parsePreviewProviderTestConfig } from '../../packages/providers/src/preview-test.js';
import { parsePreviewEnvironmentConfig,parseProviderDiscoveryTargets,previewModelRow,previewTargetJsonRow } from '@debateai/providers';
import { loadAdmissionSettings } from '../../apps/api/src/admission-settings.js';
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
 // Side-by-side spec §13 (S9), addition D16: the API's preview guard is the admission loader's stage
 // "preview-scorecard-conflict", over the version's composed config; main.ts loads its site version through that loader,
 // under its boot ledger, before credential resolution, so a VALID scorecard still refuses the boot (zeroing what the
 // ledger holds) before any credential is read. Executed here through the loader with injected readers.
 it('api runs its shipped preview guard through the admission loader and refuses VALID before credential resolution',async()=>{
  const source=await readFile(new URL('../../apps/api/src/main.ts',import.meta.url),'utf8');
  const load=source.indexOf('const siteAdmission = await loadAdmissionSettings(pool, environment.REGISTER_VERSION, admissionSite, (name, run) => boot.run(name, async () => run()));');
  expect(load,'real entrypoint must load its site version under the boot ledger').toBeGreaterThan(-1);
  expect(load).toBeLessThan(source.indexOf('const providerDiscoveryTargets ='));
  const refs=['preview:fixture-a','preview:fixture-b'];
  const targets=parseProviderDiscoveryTargets(JSON.stringify(refs.map(ref=>previewTargetJsonRow(ref))),refs.map(ref=>{const row=previewModelRow(previewTargetJsonRow(ref).model as string)!;return{providerRef:ref,maker:row.maker,adapterKind:row.adapterKind};}));
  let reads=0,gateReads=0;
  const readers=new Proxy({},{get:(_target,name)=>name==='readModelScorecard'?async()=>{reads++;return{state:'VALID'};}
   :name==='readPreviewLineUpPolicy'?async()=>null:name==='readEngineVersion'?async()=>'current'
   :name==='readPreviewBudgetGateSettings'?async()=>{gateReads++;return{roleProviderRefs:refs};}
   :async()=>({sentinel:String(name)})}) as never;
  const environmentConfig=parsePreviewEnvironmentConfig(JSON.stringify(config))!;
  const site=(preview:unknown)=>({siteVersion:12,deploymentMode:'local',preview,declaredProviderTargets:targets,siteCostEnvelope:null,billingEnabled:false,spend:null,recentRunUsage:null,prices:new Map(),questionLanguage:{routeFor:async()=>({kind:'NONE',reason:'NO_GATE'}),referenceKey:{bytes:Buffer.alloc(32)}},log:()=>undefined}) as never;
  let closed=0;const pool={end:async()=>{closed++;}},boot=installBootCustody({logger:{error:()=>undefined}});boot.hold(pool);
  await expect(loadAdmissionSettings({} as never,12,site(environmentConfig),(name,run)=>boot.run(name,async()=>run()),{readers})).rejects.toMatchObject({code:'PREVIEW_SCORECARD_CONFLICT'});
  expect({reads,gateReads,closed}).toEqual({reads:1,gateReads:0,closed:1});
  // S17 re-pin (the guard ran the roster's target check once, before the scorecard read): a declared target set the
  // roster does not match refuses in the same stage, before the scorecard or the gate terms are read.
  reads=0;const narrowBoot=installBootCustody({logger:{error:()=>undefined}});
  const narrowSite=({...(site(environmentConfig) as object),declaredProviderTargets:targets.slice(0,1)}) as never;
  await expect(loadAdmissionSettings({} as never,12,narrowSite,(name,run)=>narrowBoot.run(name,async()=>run()),{readers})).rejects.toThrow('PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID');
  expect({reads,gateReads}).toEqual({reads:0,gateReads:0});
  // Off the preview: no roster, no scorecard read, no gate read.
  reads=0;const absentBoot=installBootCustody({logger:{error:()=>undefined}});
  await expect(loadAdmissionSettings({} as never,12,site(undefined),(name,run)=>absentBoot.run(name,async()=>run()),{readers})).resolves.toMatchObject({previewConfig:undefined,previewBudgetGate:undefined});
  expect({reads,gateReads}).toEqual({reads:0,gateReads:0});absentBoot.release();
 });
 // Side-by-side spec §13, addition D16: the runner's preview guard is split. main.ts keeps the half that needs no line-up
 // (the declared targets are a reviewed set) and runs it before credential resolution; the version's rosters, seats and
 // scorecard are checked by the one settings loader (assertPreviewVersionTargets), which main.ts runs for its site
 // version before credential resolution too, so a VALID scorecard still refuses the boot before any credential is read.
 it('runner executes its shipped target-set guard, loads its site version and refuses VALID before credential resolution',async()=>{
  const source=await readFile(new URL('../../apps/runner/src/main.ts',import.meta.url),'utf8');
  // Side-by-side spec §13 (S14): the guard is one of the runner's site reads (readRunnerSiteContext, run-settings.ts),
  // the function main.ts, the practice and check-version share; main.ts calls it before credential resolution.
  const siteSource=await readFile(new URL('../../apps/runner/src/run-settings.ts',import.meta.url),'utf8');
  const ast=ts.createSourceFile('run-settings.ts',siteSource,ts.ScriptTarget.Latest,true);
  const siteReads=ast.statements.find((statement):statement is ts.FunctionDeclaration=>ts.isFunctionDeclaration(statement)&&statement.name?.getText(ast)==='readRunnerSiteContext');
  expect(siteReads?.body,'the site reads must be one exported function').toBeDefined();
  if(!siteReads?.body)return;
  const guard=siteReads.body.statements.find(statement=>ts.isIfStatement(statement)&&statement.expression.getText(ast)==='previewGate !== undefined'&&statement.getText(ast).includes('assertPreviewTargetSet(declaredProviderTargets)'));
  expect(guard,'the site reads must contain the preview target guard').toBeDefined();
  if(!guard)return;
  const code=guard.getText(ast);let targetChecks=0;
  const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
  const run=new AsyncFunction('previewGate','declaredProviderTargets','assertPreviewTargetSet',ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
  await run(config,[],()=>{targetChecks++;});expect(targetChecks).toBe(1);
  targetChecks=0;await run(undefined,[],()=>{targetChecks++;});expect(targetChecks).toBe(0);
  const credentials=source.indexOf('const providerTargets =');
  expect(siteSource.indexOf(code)).toBeGreaterThan(-1);
  expect(siteSource).not.toContain('resolveProviderTargetCredentials(');
  const siteRead=source.indexOf('const { site: runnerSite } = await readRunnerSiteContext({ pool, environment, moneyInFlight });');
  expect(siteRead).toBeGreaterThan(-1);
  expect(siteRead).toBeLessThan(credentials);
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
 it('binds both actual API constructor consumers and all runner claim/gateway transports',async()=>{const api=await readFile(new URL('../../apps/api/src/main.ts',import.meta.url),'utf8');const runner=await readFile(new URL('../../apps/runner/src/main.ts',import.meta.url),'utf8');const admission=await readFile(new URL('../../apps/api/src/admission-settings.ts',import.meta.url),'utf8');// Side-by-side spec §13 (S9): the ask application gets the version's composed config by the one mapping, the room read the site version's.
expect(api).toContain('...admissionSettingsOfVersion(siteAdmission),');expect(admission).toContain('...(previewConfig === undefined ? {} : { previewProviderTestConfig: previewConfig }),');expect(api.match(/previewProviderTestConfig: siteAdmission\.previewConfig!/g)).toHaveLength(1);expect(api).toContain('fetchImplementation: previewFetch');// Spec 2026-10-11 busy model §2: the two claim probes share one helper (observeClaimTarget), so the gateway and that helper bind the transport.
expect(runner.match(/fetchImplementation: previewFetch/g)).toHaveLength(2);expect(runner.match(/await observeClaimTarget\(target\)/g)).toHaveLength(2);expect(runner).toContain('previewExecutionTimeout: "3600s"');expect(runner).toContain('withPreviewProviderCallPolicy(gateway, siteVersionSettings.previewConfig!, target, {\n    busy: previewBusy,\n    onGateUnsent: (gate) => { runnerCallScheduler.markGateUnhealthy(gate); },\n    gateRemaining: previewGateRemaining,\n    onFinalWriterTierUnread: previewFinalWriterTierUnread,\n    thinkingLevelsOf: runPreviewThinkingLevelsOf(runnerSettings, runSettingsVersions, environment.REGISTER_VERSION)\n  });');expect(api).toContain('probeControlsFor: previewProbeControls');expect(runner.match(/previewProbeControls\(target\)/g)).toHaveLength(1);expect(runner).toContain('...previewTargetGatewayControls(previewGate, target),');const loader=await readFile(new URL('../../apps/runner/src/run-settings.ts',import.meta.url),'utf8');expect(loader).toContain('assertPreviewRoleTargets(previewConfig, declaredProviderTargets, [');expect(runner).not.toContain('assertPreviewRoleTargets(');expect(api).not.toContain('assertPreviewRoleTargets(');expect(admission).toContain('assertPreviewRoleTargets(previewConfig, declaredProviderTargets, settings.roleProviderRefs);');});
});
