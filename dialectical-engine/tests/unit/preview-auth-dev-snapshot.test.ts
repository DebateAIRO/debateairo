import { describe, expect, it } from 'vitest';
import { loadBootstrapRegister, canonicalRegisterJson, parseCanonicalRegisterJson, computeRegisterSnapshotSha256 } from '@debateai/register';
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from '../../packages/register/src/staff-access-policy.js';
import { buildPreviewSourceRows, composePreviewSnapshot } from '../../deploy/preview-auth-dev/v1/publish-register.js';
const runtime={nodeVersion:'v26.8.2',pnpmVersion:'11.20.0',sourceRevision:'a'.repeat(40),sourceTree:'b'.repeat(40),operatorSha256:'c'.repeat(64),observedAt:'2026-10-06T12:00:00.000Z'};
async function fixture(){const bootstrap=await loadBootstrapRegister();const source:any[]=[...await buildPreviewSourceRows(bootstrap,runtime)];const preserved=[STAFF_ACCESS_POLICY_REGISTER_ROW,INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map(row=>({rowKey:row.rowKey,valueJsonText:canonicalRegisterJson(row.valueAst),sourceRef:row.sourceRef}));const base=[...source.filter((r:any)=>!['consumerRecoveryPolicy','publicationCheckPolicy','taxAuthorities'].includes(r.rowKey)).map((r:any)=>r.rowKey==='nodeRuntimeVersion'?{...r,valueJsonText:'"v22.23.1"',sourceRef:'historical node measurement'}:r),...preserved];return{source,base,version:'8',snapshot:computeRegisterSnapshotSha256(base)};}
describe('complete native preview General snapshot',()=>{
 it('uses two explicit same-maker refs, canonical external policies, and only honest Node projection',async()=>{const bootstrap=await loadBootstrapRegister();const before=structuredClone(bootstrap);const rows=await buildPreviewSourceRows(bootstrap,runtime);expect(rows).toHaveLength(66);const values=Object.fromEntries(rows.map((r:any)=>[r.rowKey,JSON.parse(r.valueJsonText)]));expect(values.nodeRuntimeVersion).toBe(runtime.nodeVersion);expect(values.vllmImageDigest).toBe(bootstrap.values.vllmImageDigest);expect(values.configuredProviderSet.providers.map((p:any)=>p.providerRef)).toEqual(['preview:fixture-a','preview:fixture-b']);expect(values.configuredProviderSet.requiredDistinctMakers).toBe(1);expect(values.passwordResetPolicy).toBeTruthy();expect(values.modelScorecard).toBeUndefined();expect(bootstrap).toEqual(before);});
 it('preserves all predecessor keys and both old policy references, recording comparable changed-value hashes',async()=>{const f=await fixture();const plan=composePreviewSnapshot({sourceRows:f.source,baseRows:f.base,baseRegisterVersion:f.version,baseSnapshotSha256:f.snapshot});expect(plan.rows).toHaveLength(68);expect(plan.addedKeys).toEqual(['consumerRecoveryPolicy','publicationCheckPolicy','taxAuthorities']);expect(plan.delta.find((r:any)=>r.rowKey==='nodeRuntimeVersion')).toMatchObject({reason:'observed-node-runtime'});for(const key of ['staffAccessPolicy','internalAllowancePolicy'])expect(plan.rows.find((r:any)=>r.rowKey===key)).toEqual(f.base.find((r:any)=>r.rowKey===key));expect(plan.baseRegisterVersion).toBe('8');});
 it('supersedes the historical two-maker provider set without rewriting predecessor rows',async()=>{
  const f=await fixture();
  const historicalProviders={kind:'CONFIGURED_PROVIDER_SET',requiredDistinctMakers:2,providers:[
   {providerRef:'preview:fixture-a',adapterKind:'fixture',maker:'Fixture A'},
   {providerRef:'preview:fixture-b',adapterKind:'fixture',maker:'Fixture B'}
  ]};
  f.base=f.base.map(row=>row.rowKey==='configuredProviderSet'?{...row,valueJsonText:parseCanonicalRegisterJson(Buffer.from(JSON.stringify(historicalProviders))),sourceRef:'historical two-maker preview fixture'}:row);
  const before=structuredClone(f.base),snapshot=computeRegisterSnapshotSha256(f.base);
  const plan=composePreviewSnapshot({sourceRows:f.source,baseRows:f.base,baseRegisterVersion:f.version,baseSnapshotSha256:snapshot});
  expect(plan.rows).toHaveLength(68);
  expect(JSON.parse(plan.rows.find(row=>row.rowKey==='configuredProviderSet')!.valueJsonText)).toEqual({kind:'CONFIGURED_PROVIDER_SET',requiredDistinctMakers:1,providers:[
   {providerRef:'preview:fixture-a',adapterKind:'openai-compatible-http',maker:'Z.AI'},
   {providerRef:'preview:fixture-b',adapterKind:'openai-compatible-http',maker:'Z.AI'}
  ]});
  expect(plan.delta.find(row=>row.rowKey==='configuredProviderSet')).toMatchObject({reason:'reviewed-current-source-facet'});
  for(const key of ['staffAccessPolicy','internalAllowancePolicy'])expect(plan.rows.find(row=>row.rowKey===key)).toEqual(before.find(row=>row.rowKey===key));
  expect(f.base).toEqual(before);
 });
 it.each(['base-credential','base-empty-maker','base-zero-makers','base-alternate-ref','source-maker','source-makers'] as const)('refuses %s provider drift while allowing the historical transition',async kind=>{
  const f=await fixture(),target=kind.startsWith('base-')?f.base:f.source;
  const row=target.find(row=>row.rowKey==='configuredProviderSet')!,value=JSON.parse(row.valueJsonText);
  if(kind==='base-credential')value.providers[0].authorization='secret';
  if(kind==='base-empty-maker')value.providers[0].maker='';
  if(kind==='base-zero-makers')value.requiredDistinctMakers=0;
  if(kind==='base-alternate-ref')value.providers[0].providerRef='unexpected';
  if(kind==='source-maker')value.providers[0].maker='Fixture A';
  if(kind==='source-makers')value.requiredDistinctMakers=2;
  target[target.indexOf(row)]={...row,valueJsonText:parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value)))};
  expect(()=>composePreviewSnapshot({sourceRows:f.source,baseRows:f.base,baseRegisterVersion:f.version,baseSnapshotSha256:computeRegisterSnapshotSha256(f.base)})).toThrow();
 });
 it.each(['missing','extra','duplicate','base','billing','staff','credential','support','scorecard'] as const)('refuses %s snapshot drift before native publication',async kind=>{const f=await fixture();if(kind==='missing')f.base=f.base.filter((r:any)=>r.rowKey!=='staffAccessPolicy');if(kind==='extra')f.base.push({rowKey:'unexpected',valueJsonText:'false',sourceRef:'fixture'});if(kind==='duplicate')f.base.push(f.base[0]);if(kind==='base')f.snapshot='0'.repeat(64);if(kind==='billing')f.base=f.base.map((r:any)=>r.rowKey==='billingPolicy'?{...r,valueJsonText:'{"enabled":true}'}:r);if(kind==='staff')f.source.push(f.base.find((r:any)=>r.rowKey==='staffAccessPolicy'));if(kind==='credential')f.source=f.source.map((r:any)=>r.rowKey==='configuredProviderSet'?{...r,valueJsonText:r.valueJsonText.replace('"adapterKind"','"authorization":"secret","adapterKind"')}:r);if(kind==='support'||kind==='scorecard')f.source.push({rowKey:kind==='support'?'supportActivation':'modelScorecard',valueJsonText:'{}',sourceRef:'fixture'});expect(()=>composePreviewSnapshot({sourceRows:f.source,baseRows:f.base,baseRegisterVersion:f.version,baseSnapshotSha256:f.snapshot})).toThrow();});
 it('refuses unmeasured or wrong runtime without mutating the historical bootstrap',async()=>{const bootstrap=await loadBootstrapRegister();await expect(buildPreviewSourceRows(bootstrap,{...runtime,nodeVersion:'v22.23.1'})).rejects.toThrow();});
});
