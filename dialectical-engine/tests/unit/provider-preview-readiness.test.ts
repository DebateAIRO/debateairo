import { describe, expect, it } from "vitest";
import * as providers from "@debateai/providers";
import { evaluateAskAdmission, type RunCreationSettings } from "@debateai/api";
import { PLAN_TIER_ROSTERS, type AskRequest } from "@debateai/contract";
import { deriveHostedProviderTargets, gateHostedRoster } from "../../apps/runner/src/hosted-provider-set.js";
import { createRunnerProviderTopology } from "../../apps/runner/src/provider-topology.js";
import { framedFixturePacket } from "../support/framed-packet.js";

const MODEL="zai-org/GLM-5.3-Flash";
const REF="preview:fixture-a";
const CONFIG={deployment:"v3-preview",free_model_ids:[MODEL],requested_thinking_level:"high",budget_socket:"/run/debateai-v3-preview/provider-budget.sock",scope_id:"preview-synthetic-debate-20261004"};
const configured=[{providerRef:REF,maker:"Z.AI"}];
const row={provider_ref:REF,base_url:"https://api.deepinfra.com/v1/openai",model:MODEL,input_price_micros_per_million:150000,output_price_micros_per_million:500000,thinking_parameter:"reasoning_effort",thinking_levels:["high"],context_window_tokens:1048576};
const decoded=(init?:RequestInit)=>JSON.parse(String(init?.body));
const success=(content="{}")=>JSON.stringify({id:"fixture",model:MODEL,choices:[{message:{content},finish_reason:"stop"}],usage:{prompt_tokens:100,completion_tokens:200}});
function feature(name:string){expect(name in providers,`missing provider integration: ${name}`).toBe(true);return (providers as unknown as Record<string,any>)[name];}
function nativeGateway(fetchImplementation:typeof fetch){const target=providers.parseProviderDiscoveryTargets(JSON.stringify([row]),configured)[0]!;return new providers.OpenAICompatibleProviderGateway({endpoint:target.baseUrl,model:target.model,maker:target.maker,...providers.providerTargetGatewayControls(target),fetchImplementation,persistRawArtifact:async a=>a.artifactId,appendLedgerEntry:async e=>e.attemptId,assertNoOpenWriteTransaction:()=>undefined,sleepImplementation:async()=>undefined});}
const request={runId:"run:synthetic",subjectItemId:"node:test",callSiteKey:"fixture:judge",role:"JUDGE" as const,lane:"served" as const,bound:{maxAttempts:3,tokenCeiling:2048,deadlineMs:5000},contractHash:"contract:test",providerRef:REF,packet:framedFixturePacket("Synthetic school phone policy; no personal data.")};
const ask={question:"Ce regulă proporțională ar trebui aplicată telefoanelor în școli?",plan_tier:"free",risk_tier:"standard",tier_source:"ASKER",tier_provenance_ref:"synthetic:test",depth_params:{depth:1},composition_budget_tier:"low",decision_scope:"synthetic school policy",as_of:"2026-10-04T00:00:00Z",steering_presets:[],steering_annotations:[]} as unknown as AskRequest;
function settings(extra:Partial<RunCreationSettings>={}):RunCreationSettings{return {strangerSampleRate:0,registerVersion:5,batteryVersion:"fixture",settlementWatchHandle:"fixture",resolveDiscoveredPanel:async()=>[{provider_ref:REF,maker:"Z.AI",model_id:MODEL,probe_evidence_ref:"fixture:probe",probed_at:"2026-10-04T00:00:00Z"}],resolveEnvelopeBasis:async input=>({panel_size:input.panelSize,max_model_attempts:8}),resolveRisk:(effectiveRiskTier,tierSource,tierProvenanceRef)=>({effectiveRiskTier,tierSource,tierProvenanceRef}),...extra};}

describe("preview provider readiness uses native seams",()=>{
 it("admits exact real GLM in a preview Free roster and honestly marks one maker",async()=>{const config=feature("parsePreviewProviderTestConfig")(JSON.stringify(CONFIG));const rosters=feature("previewPlanTierRosters")(config,PLAN_TIER_ROSTERS);const result=await evaluateAskAdmission(settings({previewProviderTestConfig:config}),ask);expect(result.discoveredPanel.map(x=>x.model_id)).toEqual([MODEL]);expect(result.criticUnavailableCap.conditionMarks).toEqual(["SINGLE-LINEAGE","CRITIQUE-UNAVAILABLE"]);expect(result.criticUnavailableCap.confidenceBandCapRequired).toBe(true);expect(PLAN_TIER_ROSTERS.free).toEqual(["gpt-5.6-luna","claude-sonnet-5"]);expect(rosters.premium).toBe(PLAN_TIER_ROSTERS.premium);});
 it("keeps production default admission and refuses unapproved model/configuration",async()=>{await expect(evaluateAskAdmission(settings(),ask)).rejects.toMatchObject({code:"ASK_PLAN_TIER_MODEL_UNAVAILABLE"});const parse=feature("parsePreviewProviderTestConfig");expect(parse(undefined)).toBeUndefined();for(const bad of [{...CONFIG,deployment:"production"},{...CONFIG,free_model_ids:["other/model"]},{...CONFIG,requested_thinking_level:"medium"},{...CONFIG,budget_socket:"https://remote"}])expect(()=>parse(JSON.stringify(bad))).toThrow();});
 it("forwards typed capability fields through the existing hosted roster publisher",()=>{const roster=gateHostedRoster(JSON.stringify({providers:[{...row,adapter_kind:"openai-compatible-http",maker:"Z.AI",vetting:{},runner_authorization_file:"/root/fixture/runner.header",api_authorization_file:"/root/fixture/api.header"}]}));const targets=deriveHostedProviderTargets(roster);const target=providers.parseProviderDiscoveryTargets(targets.runner,configured)[0]!;expect(providers.providerTargetGatewayControls(target)).toEqual({thinking:{parameter:"reasoning_effort",levels:["high"]},contextWindowTokens:1048576,supportsJsonObjectResponse:true});expect(providers.providerTargetPrice(target)).toEqual({inputMicrosPerMillionTokens:150000,outputMicrosPerMillionTokens:500000});});
 it("real native gateway sends requested high with one attempt and the approved deadline",async()=>{const calls:any[]=[];const gateway=feature("withPreviewProviderCallPolicy")(nativeGateway(async(_input,init)=>{calls.push(init);return new Response(success());}),feature("parsePreviewProviderTestConfig")(JSON.stringify(CONFIG)));const result=await gateway.call(request);expect(calls).toHaveLength(1);expect(decoded(calls[0])).toMatchObject({model:MODEL,reasoning_effort:"high",max_tokens:8192});expect(result.model).toBe(MODEL);});
 it("the shared guarded fetch covers native discovery probe and full gateway call",async()=>{const executeCalls:any[]=[];const fetcher=feature("createPreviewGuardedFetch")({execute:async(input:any)=>{executeCalls.push(input);return {status:200,body:success(executeCalls.length===1?"OK":"{}")};}});const target=providers.parseProviderDiscoveryTargets(JSON.stringify([row]),configured)[0]!;const probe=await providers.observeProviderTarget({target,thinkingLevel:"high",tokenCeiling:8192,timeoutMs:600000,fetchImplementation:fetcher,clock:()=>new Date()});expect(probe.state).toBe("HEALTHY");await feature("withPreviewProviderCallPolicy")(nativeGateway(fetcher),feature("parsePreviewProviderTestConfig")(JSON.stringify(CONFIG))).call(request);expect(executeCalls).toHaveLength(2);for(const call of executeCalls){expect(call.reservedUsd).toMatch(/^0\.08/);expect(call.requestSha256).toMatch(/^[0-9a-f]{64}$/);expect(call.requestBody).not.toContain("authorization");}expect(executeCalls.map(c=>JSON.parse(c.requestBody).max_tokens)).toEqual([8192,8192]);});
 it("no unknown-charge or unauthorized endpoint is retried inside the native gateway",async()=>{let count=0;const fetcher=feature("createPreviewGuardedFetch")({execute:async()=>{count++;throw new Error("PREVIEW_TEST_BUDGET_UNCERTAIN");}});await expect(feature("withPreviewProviderCallPolicy")(nativeGateway(fetcher),feature("parsePreviewProviderTestConfig")(JSON.stringify(CONFIG))).call(request)).rejects.toThrow();expect(count).toBe(1);await expect(fetcher("https://other.example/v1/chat/completions",{method:"POST",body:JSON.stringify({model:MODEL,max_tokens:8,messages:[]})})).rejects.toThrow();expect(count).toBe(1);});
});

describe("root-budget credential custody is explicit in the native publisher",()=>{
 it("publishes a target with no application credential only for the exact preview broker profile",()=>{
  const roster=gateHostedRoster(JSON.stringify({providers:[{...row,adapter_kind:"openai-compatible-http",maker:"Z.AI",vetting:{},preview_budget_authority:true}]}));
  const target=providers.parseProviderDiscoveryTargets(deriveHostedProviderTargets(roster).api,configured)[0]!;
  expect(target.authorizationFile).toBeUndefined();expect(target.authorizationHeader).toBeUndefined();
  expect(()=>gateHostedRoster(JSON.stringify({providers:[{...row,model:"other/model",adapter_kind:"openai-compatible-http",maker:"Z.AI",vetting:{},preview_budget_authority:true}]}))).toThrow();
 });
});

it("refuses an already canceled native deadline before reserving or dispatching",async()=>{
 let calls=0;const fetcher=feature("createPreviewGuardedFetch")({execute:async()=>{calls++;return {status:200,body:success()};}});
 await expect(fetcher("https://api.deepinfra.com/v1/openai/chat/completions",{method:"POST",body:JSON.stringify({model:MODEL,reasoning_effort:"high",max_tokens:8192,messages:[{role:"user",content:"synthetic"}]}),signal:AbortSignal.abort()})).rejects.toThrow();expect(calls).toBe(0);
});

 it("preserves both sealed logical job refs while using one real GLM model and maker",()=>{
  const config=feature("parsePreviewProviderTestConfig")(JSON.stringify(CONFIG));
  const refs=["preview:fixture-a","preview:fixture-b"];
  const targets=providers.parseProviderDiscoveryTargets(JSON.stringify(refs.map(provider_ref=>({...row,provider_ref}))),refs.map(providerRef=>({providerRef,maker:"Z.AI"})));
  feature("assertPreviewProviderTargets")(config,targets);
  const topology=createRunnerProviderTopology(targets,()=>nativeGateway(async()=>new Response(success())));
  expect(topology.primary.providerRef).toBe("preview:fixture-a");expect(topology.critique!.providerRef).toBe("preview:fixture-b");
  expect(new Set(targets.map(x=>x.model))).toEqual(new Set([MODEL]));expect(new Set(targets.map(x=>x.maker))).toEqual(new Set(["Z.AI"]));
 });

it("estimates the actual one-model preview Free roster while keeping default estimates",async()=>{
 const {runSettingsClassOfAsk}=await import("../../apps/api/src/ask-room.js");
 expect(runSettingsClassOfAsk(ask,feature("parsePreviewProviderTestConfig")(JSON.stringify(CONFIG)))).toMatchObject({makerCount:1});
 expect(runSettingsClassOfAsk(ask)).toMatchObject({makerCount:2});
});

it("effective preview deadlines satisfy the real cooldown-aware lease guard and task timeout",async()=>{
 const {assertClaimCoversCall}=await import("@debateai/battery");
 const {declareHatchetWalkingSkeletonTask}=await import("../../apps/runner/src/index.js");
 const config=feature("parsePreviewProviderTestConfig")(JSON.stringify(CONFIG));
 const bound={maxAttempts:3,tokenCeiling:2048,deadlineMs:180000};
 const policy=feature("previewRunnerPolicy")({bounds:{JUDGE:bound,COMPOSER:bound,CONFORMANCE:bound},synthesisRolePolicy:{synthesizerBound:bound,evaluatorBound:bound}},config);
 expect(policy.bounds.JUDGE).toEqual({maxAttempts:1,tokenCeiling:8192,deadlineMs:600000});
 expect(policy.synthesisRolePolicy.evaluatorBound).toEqual(policy.bounds.JUDGE);
 expect(()=>assertClaimCoversCall({claimMs:3600000,deadlineMs:policy.bounds.JUDGE.deadlineMs,marginMs:30000,cooldownMs:600000,maxCooldownHoldsPerRun:2})).not.toThrow();
 expect(()=>assertClaimCoversCall({claimMs:2000000,deadlineMs:policy.bounds.JUDGE.deadlineMs,marginMs:30000,cooldownMs:600000,maxCooldownHoldsPerRun:2})).toThrow(/CLAIM_BOUND_MISMATCH/);
 let declared:any;declareHatchetWalkingSkeletonTask({client:{task:(options:any)=>{declared=options;return options;}} as any,runner:{} as any,failures:{} as any,workflowName:"fixture",engineRetries:0,previewExecutionTimeout:"3600s"});
 expect(declared.executionTimeout).toBe("3600s");expect(declared.retries).toBe(0);
});

it("idle status reads and constructing discovery do not send paid probes",async()=>{
 const {createProviderDiscoveryResolver}=await import("../../apps/api/src/provider-discovery.js");
 const {PostgresAskApplication}=await import("../../apps/api/src/index.js");
 let paid=0;const fetcher=feature("createPreviewGuardedFetch")({execute:async()=>{paid++;return {status:200,body:success("OK")};}});
 const targets=providers.parseProviderDiscoveryTargets(JSON.stringify([row]),configured);
 const resolve=createProviderDiscoveryResolver({configuredProviders:configured,targets,probes:{readLatest:async()=>[],record:async()=>undefined},probeFreshnessMs:60000,probeTimeoutMs:600000,thinkingLevel:"high",probeTokenCeiling:8192,fetchImplementation:fetcher});
 const queries:string[]=[];const pool={query:async(sql:string)=>{queries.push(sql);return {rows:[]};}};
 const app={pool,settings:settings({resolveDiscoveredPanel:resolve})};
 await PostgresAskApplication.prototype.readDeployment.call(app as any,{session_id:"fixture-session",asker_id:"fixture-user",caller_scope:"ASKER",ownership_provenance:"server_session",provisional_identity_model:false} as any);
 expect(queries.length).toBeGreaterThan(0);expect(queries.every(q=>q.trimStart().startsWith("SELECT"))).toBe(true);expect(paid).toBe(0);
 await resolve();expect(paid).toBe(1); // only the explicit ask/claim discovery invocation spends.
});

// The old operator-only publisher assertion is deferred to Task3 actual native publication/selection.

it('refuses malformed explicit preview config and a VALID scorecard before discovery or probing',async()=>{
 let discoveries=0;const resolveDiscoveredPanel=async()=>{discoveries++;return [];};
 await expect(evaluateAskAdmission(settings({resolveDiscoveredPanel,previewProviderTestConfig:{...CONFIG,free_model_ids:['other/model']} as never}),ask)).rejects.toThrow('PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID');
 await expect(evaluateAskAdmission(settings({resolveDiscoveredPanel,previewProviderTestConfig:feature('parsePreviewProviderTestConfig')(JSON.stringify(CONFIG)),modelPicker:{scorecard:{state:'VALID'}} as never}),ask)).rejects.toMatchObject({code:'PREVIEW_SCORECARD_CONFLICT'});
 expect(discoveries).toBe(0);
});
it.each([{adapter_kind:'cli-relay'},{base_url:'https://other.test/v1'},{model:'other/model'},{provider_ref:'preview:other'},{maker:'Other'},{thinking_levels:['medium']},{context_window_tokens:42},{input_price_micros_per_million:1},{output_price_micros_per_million:1},{api_authorization_file:null},{runner_authorization_file:null},{unapproved:true}])('refuses widened credential-less preview authority %j',change=>{
 expect(()=>gateHostedRoster(JSON.stringify({providers:[{...row,adapter_kind:'openai-compatible-http',maker:'Z.AI',vetting:{},preview_budget_authority:true,...change}]}))).toThrow();
});
it.each([0,-1,163841,1.5,Number.MAX_SAFE_INTEGER+1])('refuses an invalid optional probe ceiling %s before fetch',async tokenCeiling=>{
 let calls=0;const target={providerRef:REF,maker:'Z.AI',baseUrl:'https://api.deepinfra.com/v1/openai',model:MODEL,thinkingParameter:'reasoning_effort' as const,thinkingLevels:['high']};
 const result=await providers.observeProviderTarget({target,tokenCeiling,timeoutMs:600000,clock:()=>new Date(),fetchImplementation:async()=>{calls++;return new Response(success('OK'));}});
 expect(result.state).toBe('ABSENT');expect(calls).toBe(0);
});
it('refuses unrecognized thinking before a probe fetch and retains absent-config defaults',async()=>{
 let calls=0;const target={providerRef:REF,maker:'Z.AI',baseUrl:'https://api.deepinfra.com/v1/openai',model:MODEL,thinkingParameter:'reasoning_effort' as const,thinkingLevels:['high']};
 const result=await providers.observeProviderTarget({target,thinkingLevel:'medium',timeoutMs:5000,clock:()=>new Date(),fetchImplementation:async()=>{calls++;return new Response(success('OK'));}});expect(result.state).toBe('ABSENT');expect(calls).toBe(0);
 expect(feature('previewPlanTierRosters')(undefined,PLAN_TIER_ROSTERS)).toBe(PLAN_TIER_ROSTERS);
});
