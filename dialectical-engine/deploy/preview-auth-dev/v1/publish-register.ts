import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  canonicalRegisterJson, parseCanonicalRegisterJson, computeRegisterSnapshotSha256,
  createPostgresRegisterPublicationPort, parseRegisterVersionText, buildConfiguredProviderSetSealedRow, buildConfiguredProviderSetDeploymentRow,
  PASSWORD_RESET_POLICY_REGISTER_ROW, BACKUP_EMAIL_POLICY_REGISTER_ROW, MFA_RECOVERY_POLICY_REGISTER_ROW,
  type BootstrapRegister, type RegisterPublicationRow
} from '@debateai/register';
import { buildDevelopmentDeploymentRegisterPublicationRows } from '../../../apps/runner/src/dev-deployment-register.js';
import { parseProviderDiscoveryTargets } from '@debateai/providers';
import { PREVIEW_GLM_TARGET, PREVIEW_GLM_PROVIDER_REFS, assertPreviewProviderTargets } from '../../../packages/providers/src/preview-test.js';
import { staffAccessPolicyFromValue } from '../../../packages/register/src/staff-access-policy.js';
import { internalAllowancePolicyFromValue } from '../../../packages/register/src/internal-allowance-policy.js';
const hash = (value:string) => createHash('sha256').update(value).digest('hex');
const fail = ():never => { throw new TypeError('PREVIEW_REGISTER_SNAPSHOT_REFUSED'); };
const additions = ['consumerRecoveryPolicy','publicationCheckPolicy','taxAuthorities'] as const;
const preserved = ['internalAllowancePolicy','staffAccessPolicy'] as const;
export type RuntimeObservation = Readonly<{nodeVersion:string;pnpmVersion:string;sourceRevision:string;sourceTree:string;operatorSha256:string;observedAt:string}>;
export async function buildPreviewSourceRows(bootstrap:BootstrapRegister, runtime:RuntimeObservation):Promise<readonly RegisterPublicationRow[]> {
  if(runtime.nodeVersion!=='v26.8.2'||runtime.pnpmVersion!=='11.20.0'||!/^([0-9a-f]{40})$/.test(runtime.sourceRevision)
    ||!/^([0-9a-f]{40})$/.test(runtime.sourceTree)||!/^([0-9a-f]{64})$/.test(runtime.operatorSha256)
    ||!Number.isFinite(Date.parse(runtime.observedAt))||bootstrap.values.pnpmVersion!==runtime.pnpmVersion||bootstrap.values.postgresMajorVersion!=='18')fail();
  const configuredProviders=PREVIEW_GLM_PROVIDER_REFS.map(providerRef=>({providerRef,adapterKind:'openai-compatible-http' as const,maker:'Z.AI'}));
  const targetsJson=JSON.stringify(PREVIEW_GLM_PROVIDER_REFS.map(provider_ref=>({...PREVIEW_GLM_TARGET,provider_ref})));
  const targets=parseProviderDiscoveryTargets(targetsJson,configuredProviders);
  // This config is validation only; composition never contacts an authority or declares health.
  assertPreviewProviderTargets({deployment:'v3-preview',free_model_ids:[PREVIEW_GLM_TARGET.model],requested_thinking_level:'high',budget_socket:'/run/debateai-v3-preview/composition.sock',scope_id:'composition-only'},targets);
  const panel={configuredProviders,requiredDistinctMakers:1,healthyProviderRefs:[],targets,targetsJson};
  const projected:BootstrapRegister={...bootstrap,values:{...bootstrap.values,nodeRuntimeVersion:runtime.nodeVersion},resolution:{...bootstrap.resolution,
    nodeRuntimeVersion:`preview-auth-dev-v1 actual Node ${runtime.nodeVersion}; measured ${runtime.observedAt}; source ${runtime.sourceRevision}/${runtime.sourceTree}; operator sha256:${runtime.operatorSha256}`}};
  const rows=[...await buildDevelopmentDeploymentRegisterPublicationRows(projected,panel,{synthesizerRoleRef:PREVIEW_GLM_PROVIDER_REFS[0],evaluatorRoleRef:PREVIEW_GLM_PROVIDER_REFS[1]},'local'),
    ...[PASSWORD_RESET_POLICY_REGISTER_ROW,BACKUP_EMAIL_POLICY_REGISTER_ROW,MFA_RECOVERY_POLICY_REGISTER_ROW].map(row=>({rowKey:row.rowKey,valueJsonText:canonicalRegisterJson(row.valueAst),sourceRef:row.sourceRef}))];
  if(rows.length!==66)fail(); // Reviewed source closure; allocator result is never assumed from this count.
  return Object.freeze(rows.map(row=>Object.freeze(row)));
}
function canonicalRows(rows:readonly RegisterPublicationRow[]):RegisterPublicationRow[] {
  if(!Array.isArray(rows)||rows.length<1||rows.length>128)fail();
  const keys=new Set<string>();
  return rows.map(row=>{
    if(!row||Object.keys(row).sort().join(',')!=='rowKey,sourceRef,valueJsonText'||typeof row.rowKey!=='string'||keys.has(row.rowKey)
      ||typeof row.sourceRef!=='string'||row.sourceRef.length<1||row.sourceRef.length>1024||typeof row.valueJsonText!=='string')fail();
    keys.add(row.rowKey);
    return {...row,valueJsonText:parseCanonicalRegisterJson(Buffer.from(row.valueJsonText))};
  }).sort((a,b)=>a.rowKey.localeCompare(b.rowKey,'en'));
}
function credentialFree(value:unknown):boolean {
  if(Array.isArray(value))return value.every(credentialFree);
  if(value!==null&&typeof value==='object')return Object.entries(value).every(([key,item])=>!/(authorization|credential|api.?key|secret|password)/i.test(key)&&credentialFree(item));
  return true;
}
export type SnapshotDelta = Readonly<{rowKey:string;oldValueSha256:string;newValueSha256:string;oldSourceRefSha256:string;newSourceRefSha256:string;reason:string}>;
export function composePreviewSnapshot(input:Readonly<{sourceRows:readonly RegisterPublicationRow[];baseRows:readonly RegisterPublicationRow[];baseRegisterVersion:string;baseSnapshotSha256:string}>) {
  const source=canonicalRows(input.sourceRows),base=canonicalRows(input.baseRows);
  const baseRegisterVersion=parseRegisterVersionText(input.baseRegisterVersion);
  if(computeRegisterSnapshotSha256(base)!==input.baseSnapshotSha256||source.length!==66||base.length!==65)fail();
  const sourceMap=new Map(source.map(row=>[row.rowKey,row])),baseMap=new Map(base.map(row=>[row.rowKey,row]));
  if(source.some(row=>['supportActivation','modelScorecard',...preserved].includes(row.rowKey))
    ||base.some(row=>['supportActivation','modelScorecard',...additions].includes(row.rowKey))
    ||preserved.some(key=>!baseMap.has(key))||additions.some(key=>!sourceMap.has(key))
    ||base.some(row=>!sourceMap.has(row.rowKey)&&!preserved.includes(row.rowKey as typeof preserved[number]))
    ||source.some(row=>!baseMap.has(row.rowKey)&&!additions.includes(row.rowKey as typeof additions[number])))fail();
  for(const rows of [sourceMap,baseMap]){
    if(JSON.parse(rows.get('billingPolicy')?.valueJsonText??'null')?.enabled!==false)fail();
    const providers=JSON.parse(rows.get('configuredProviderSet')?.valueJsonText??'null');
    if(!credentialFree(providers)||providers?.providers?.length!==2
      ||providers.providers.some((p:any,i:number)=>p.providerRef!==PREVIEW_GLM_PROVIDER_REFS[i]))fail();
    if(rows===sourceMap){
      if(providers.requiredDistinctMakers!==1||providers.providers.some((p:any)=>Object.keys(p).sort().join(',')!=='adapterKind,maker,providerRef'||p.adapterKind!=='openai-compatible-http'||p.maker!=='Z.AI'))fail();
    }else{
      // Historical sealed and vetted deployment rows have distinct source-owned schemas.
      const vetted=providers.setVersion===2;
      if(providers.kind!=='CONFIGURED_PROVIDER_SET'||Object.keys(providers).sort().join(',')!==(vetted?'kind,providers,requiredDistinctMakers,setVersion':'kind,providers,requiredDistinctMakers')
        ||providers.providers.some((p:any)=>Object.keys(p).sort().join(',')!==(vetted?'adapterKind,maker,providerRef,vetting':'adapterKind,maker,providerRef')
          ||vetted&&(!p.vetting||Object.keys(p.vetting).sort().join(',')!=='dataUseTermsReviewedOn,namedInPrivacyNotice,retentionTermsReviewedOn')))fail();
      const input={requiredDistinctMakers:providers.requiredDistinctMakers,providers:providers.providers},sourceRef=rows.get('configuredProviderSet')!.sourceRef;
      if(vetted)buildConfiguredProviderSetDeploymentRow(input,sourceRef);
      else buildConfiguredProviderSetSealedRow(input,sourceRef);
    }
  }
  const staff=baseMap.get('staffAccessPolicy')!,internal=baseMap.get('internalAllowancePolicy')!;
  staffAccessPolicyFromValue(JSON.parse(staff.valueJsonText),staff.sourceRef);
  internalAllowancePolicyFromValue(JSON.parse(internal.valueJsonText),internal.sourceRef);
  const rows=canonicalRows([...source,...preserved.map(key=>baseMap.get(key)!)]);
  const delta:SnapshotDelta[]=[];
  for(const row of source){const old=baseMap.get(row.rowKey);if(old&&(old.valueJsonText!==row.valueJsonText||old.sourceRef!==row.sourceRef))delta.push(Object.freeze({
    rowKey:row.rowKey,oldValueSha256:hash(old.valueJsonText),newValueSha256:hash(row.valueJsonText),oldSourceRefSha256:hash(old.sourceRef),newSourceRefSha256:hash(row.sourceRef),
    reason:row.rowKey==='nodeRuntimeVersion'?'observed-node-runtime':'reviewed-current-source-facet'
  }));}
  const snapshotSha256=computeRegisterSnapshotSha256(rows);
  return Object.freeze({baseRegisterVersion,baseSnapshotSha256:input.baseSnapshotSha256,rows:Object.freeze(rows),snapshotSha256,
    addedKeys:Object.freeze([...additions]),delta:Object.freeze(delta),deltaSha256:hash(JSON.stringify(delta))});
}
export type PreviewSnapshot = ReturnType<typeof composePreviewSnapshot>;
export async function readSealedSnapshot(pool:Pool,version:string) {
  const parsed=parseRegisterVersionText(version);
  const result=await pool.query<{sealed:boolean;row_count:number;snapshot_sha256:string|null;actual_sha256:string;historical:boolean}>(
    `SELECT sealed,row_count,snapshot_sha256,register._snapshot_sha256(register_version) actual_sha256,
      (register_version<=4 AND base_register_version IS NULL AND publication_id IS NULL AND request_sha256 IS NULL AND snapshot_sha256 IS NULL AND publication_kind IS NULL AND recorded_at IS NULL) historical
      FROM register.register_version WHERE register_version=$1`,[parsed]);
  const state=result.rows[0]??fail();
  if(result.rows.length!==1||state?.sealed!==true)fail();
  const raw=await pool.query<{row_key:string;value_json:string;source_ref:string}>(
    'SELECT row_key,value_json::text,source_ref FROM register.register_row WHERE register_version=$1 ORDER BY row_key',[parsed]);
  const rows=canonicalRows(raw.rows.map(row=>({rowKey:row.row_key,valueJsonText:row.value_json as RegisterPublicationRow['valueJsonText'],sourceRef:row.source_ref})));
  if(rows.length!==state.row_count||computeRegisterSnapshotSha256(rows)!==state.actual_sha256
    ||(state.snapshot_sha256!==state.actual_sha256&&!state.historical))fail();
  return Object.freeze({registerVersion:parsed,rows,snapshotSha256:state.actual_sha256});
}
export async function publishPreviewRegister(pool:Pool,input:Readonly<{publicationId:string;sourceRef:string;snapshot:PreviewSnapshot;approval:Readonly<{baseRegisterVersion:string;baseSnapshotSha256:string;snapshotSha256:string;deltaSha256:string}>}>) {
  const {snapshot,approval}=input;
  if(Object.keys(approval).sort().join(',')!=='baseRegisterVersion,baseSnapshotSha256,deltaSha256,snapshotSha256'
    ||(['baseRegisterVersion','baseSnapshotSha256','snapshotSha256','deltaSha256'] as const).some(key=>approval[key]!==snapshot[key]))fail();
  const current=await readSealedSnapshot(pool,snapshot.baseRegisterVersion);
  if(current.snapshotSha256!==snapshot.baseSnapshotSha256)fail();
  const receipt=await createPostgresRegisterPublicationPort(pool).publishGeneral({publicationId:input.publicationId,baseRegisterVersion:snapshot.baseRegisterVersion,rows:snapshot.rows,sourceRef:input.sourceRef,deployment:'local'});
  const actual=await readSealedSnapshot(pool,receipt.registerVersion);
  if(actual.snapshotSha256!==receipt.snapshotSha256||receipt.snapshotSha256!==snapshot.snapshotSha256||actual.rows.length!==receipt.rowCount)fail();
  return receipt;
}
