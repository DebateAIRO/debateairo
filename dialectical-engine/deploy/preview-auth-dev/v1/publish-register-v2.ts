// Preview register publish kit v2.
//
// Plain words: v1 (publish-register.ts, kept byte for byte: the live v9 was composed by it) could
// only make ONE publication: a 66-row source on top of a 65-row base, adding exactly three fixed
// keys. From the live v9 (68 rows) it refuses, and it can never add a further key.
// v2 composes the next snapshot from the CURRENT published version plus the reviewed source rows:
// - a changed value or source reference shows in the delta as `changed`;
// - a key the source has and the base lacks shows as `added` (e.g. outboundMailPolicy);
// - a key the base has and the source lacks is refused, except the two base-owned policies
//   (staffAccessPolicy, internalAllowancePolicy), which are carried over unchanged.
// The source is closed by an exact, reviewed key list (not a row count): adding a key to the
// preview register means adding it here in the same reviewed change.
// Every v1 rule stays: canonical rows, base snapshot hash, billing off, no support or scorecard
// row, credential-free provider set with the two preview refs, base-owned policies parsed.
// The delta now carries the old and new canonical values, so the owner reviews values, not hashes;
// deltaSha256 binds that exact document and the approval binds deltaSha256.
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  canonicalRegisterJson, parseCanonicalRegisterJson, computeRegisterSnapshotSha256,
  parseRegisterVersionText, buildConfiguredProviderSetSealedRow, buildConfiguredProviderSetDeploymentRow,
  PASSWORD_RESET_POLICY_REGISTER_ROW, BACKUP_EMAIL_POLICY_REGISTER_ROW, MFA_RECOVERY_POLICY_REGISTER_ROW,
  type BootstrapRegister, type RegisterPublicationRow
} from '@debateai/register';
import { buildDevelopmentDeploymentRegisterPublicationRows } from '../../../apps/runner/src/dev-deployment-register.js';
import { parseProviderDiscoveryTargets } from '@debateai/providers';
import { PREVIEW_GLM_TARGET, PREVIEW_GLM_PROVIDER_REFS, assertPreviewProviderTargets } from '../../../packages/providers/src/preview-test.js';
import { staffAccessPolicyFromValue } from '../../../packages/register/src/staff-access-policy.js';
import { internalAllowancePolicyFromValue } from '../../../packages/register/src/internal-allowance-policy.js';
import { publishPreviewRegister, type RuntimeObservation, type PreviewSnapshot } from './publish-register.js';
/** The sealed-snapshot reader is unchanged; the native operator reads it through this module. */
export { readSealedSnapshot } from './publish-register.js';

const hash = (value:string) => createHash('sha256').update(value).digest('hex');
const fail = ():never => { throw new TypeError('PREVIEW_REGISTER_SNAPSHOT_REFUSED'); };
const COMPOSER = 'preview-register-composer-v2' as const;
/** Base-owned rows: never built from source, carried from the base version unchanged. */
export const PREVIEW_BASE_OWNED_KEYS = Object.freeze(['internalAllowancePolicy','staffAccessPolicy'] as const);
const FORBIDDEN_KEYS = Object.freeze(['modelScorecard','supportActivation']);
/**
 * The reviewed source closure: exactly the keys buildPreviewSourceRowsV2 must produce (66 at
 * dev b75e4c294, the same keys the live v9 holds minus the two base-owned ones).
 * A new register row reaches the preview only by being added here.
 */
export const PREVIEW_SOURCE_ROW_KEYS_V2 = Object.freeze([
  'acceptanceOrganCostBounds','admissionPolicy','auditSourceIpKdfPolicy','backupEmailVerificationPolicy','billingPlans','billingPolicy',
  'branchFreezeEpsilon','candidateConfidenceBand','channelPolicy','claimTypeCompositionMap','composerContractHash','compositionBundleBudget',
  'configuredProviderSet','conformanceContractHash','consumerRecoveryPolicy','costEnvelopePolicy','countryPolicy','disagreementQuantity',
  'disagreementThreshold','dispersionScale','downgradeBands','envelopeFormulaInputs','evaluatorCallBound','evaluatorLoopMaxRounds',
  'evaluatorRoleRef','globalStopDelta','hiddenNodeScoreThreshold','judgeContractHash','judgementSelectionPolicy','livenessPolicy',
  'mfaPolicy','mfaRecoveryPolicy','nodeRuntimeVersion','panelDiscoveryPolicy','passwordPolicy','passwordResetPolicy',
  'pnpmVersion','postgresMajorVersion','productRolePolicy','propagationContractHash','providerFamilyMap','publicationCheckPolicy',
  'rateLimitPolicy','recoveryPolicy','repeatedFamilyMultiplier','riskTier','runDeathPolicy','scoringOperator',
  'serveContractHash','sessionPolicy','storyCheckerCallBound','storyCheckerRoleRef','storyLoopMaxRounds','storyMaterialBudget',
  'storytellerCallBound','storytellerRoleRef','synthesizerCallBound','synthesizerRoleRef','taxAuthorities','typescriptVersion',
  'verdictHighCut','verdictLowCut','verdictMarginGamma','verificationPolicy','vllmImageDigest','wayOfKnowingCeiling'
] as const);

const sameKeys = (actual:readonly string[], expected:readonly string[]) =>
  actual.length===expected.length && [...actual].sort().join('\0')===[...expected].sort().join('\0');

/** v1's source build (same runtime gate, same provider panel), closed by the reviewed key list instead of a count. */
export async function buildPreviewSourceRowsV2(bootstrap:BootstrapRegister, runtime:RuntimeObservation):Promise<readonly RegisterPublicationRow[]> {
  if(runtime.nodeVersion!=='v26.8.2'||runtime.pnpmVersion!=='11.20.0'||!/^([0-9a-f]{40})$/.test(runtime.sourceRevision)
    ||!/^([0-9a-f]{40})$/.test(runtime.sourceTree)||!/^([0-9a-f]{64})$/.test(runtime.operatorSha256)
    ||!Number.isFinite(Date.parse(runtime.observedAt))||bootstrap.values.pnpmVersion!==runtime.pnpmVersion||bootstrap.values.postgresMajorVersion!=='18')fail();
  const configuredProviders=PREVIEW_GLM_PROVIDER_REFS.map(providerRef=>({providerRef,adapterKind:'openai-compatible-http' as const,maker:'Z.AI'}));
  const targetsJson=JSON.stringify(PREVIEW_GLM_PROVIDER_REFS.map(provider_ref=>({...PREVIEW_GLM_TARGET,provider_ref})));
  const targets=parseProviderDiscoveryTargets(targetsJson,configuredProviders);
  // Validation only; composition never contacts an authority or declares health.
  assertPreviewProviderTargets({deployment:'v3-preview',free_model_ids:[PREVIEW_GLM_TARGET.model],requested_thinking_level:'high',budget_socket:'/run/debateai-v3-preview/composition.sock',scope_id:'composition-only'},targets);
  const panel={configuredProviders,requiredDistinctMakers:1,healthyProviderRefs:[],targets,targetsJson};
  const projected:BootstrapRegister={...bootstrap,values:{...bootstrap.values,nodeRuntimeVersion:runtime.nodeVersion},resolution:{...bootstrap.resolution,
    nodeRuntimeVersion:`preview-auth-dev-v1 actual Node ${runtime.nodeVersion}; measured ${runtime.observedAt}; source ${runtime.sourceRevision}/${runtime.sourceTree}; operator sha256:${runtime.operatorSha256}`}};
  const rows=[...await buildDevelopmentDeploymentRegisterPublicationRows(projected,panel,{synthesizerRoleRef:PREVIEW_GLM_PROVIDER_REFS[0],evaluatorRoleRef:PREVIEW_GLM_PROVIDER_REFS[1]},'local'),
    ...[PASSWORD_RESET_POLICY_REGISTER_ROW,BACKUP_EMAIL_POLICY_REGISTER_ROW,MFA_RECOVERY_POLICY_REGISTER_ROW].map(row=>({rowKey:row.rowKey,valueJsonText:canonicalRegisterJson(row.valueAst),sourceRef:row.sourceRef}))];
  if(!sameKeys(rows.map(row=>row.rowKey),PREVIEW_SOURCE_ROW_KEYS_V2))fail();
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
/** v1's provider-set rules: the source shape is the preview Z.AI pair; a base row may be the sealed or the vetted historical schema. */
function assertProviderRows(rows:ReadonlyMap<string,RegisterPublicationRow>, side:'source'|'base') {
  if(JSON.parse(rows.get('billingPolicy')?.valueJsonText??'null')?.enabled!==false)fail();
  const providers=JSON.parse(rows.get('configuredProviderSet')?.valueJsonText??'null');
  if(!credentialFree(providers)||providers?.providers?.length!==2
    ||providers.providers.some((p:any,i:number)=>p.providerRef!==PREVIEW_GLM_PROVIDER_REFS[i]))fail();
  if(side==='source'){
    if(providers.requiredDistinctMakers!==1||providers.providers.some((p:any)=>Object.keys(p).sort().join(',')!=='adapterKind,maker,providerRef'||p.adapterKind!=='openai-compatible-http'||p.maker!=='Z.AI'))fail();
    return;
  }
  const vetted=providers.setVersion===2;
  if(providers.kind!=='CONFIGURED_PROVIDER_SET'||Object.keys(providers).sort().join(',')!==(vetted?'kind,providers,requiredDistinctMakers,setVersion':'kind,providers,requiredDistinctMakers')
    ||providers.providers.some((p:any)=>Object.keys(p).sort().join(',')!==(vetted?'adapterKind,maker,providerRef,vetting':'adapterKind,maker,providerRef')
      ||vetted&&(!p.vetting||Object.keys(p.vetting).sort().join(',')!=='dataUseTermsReviewedOn,namedInPrivacyNotice,retentionTermsReviewedOn')))fail();
  const input={requiredDistinctMakers:providers.requiredDistinctMakers,providers:providers.providers},sourceRef=rows.get('configuredProviderSet')!.sourceRef;
  if(vetted)buildConfiguredProviderSetDeploymentRow(input,sourceRef);
  else buildConfiguredProviderSetSealedRow(input,sourceRef);
}

export type SnapshotDeltaV2 = Readonly<{
  rowKey:string; change:'added'|'changed'; reason:string;
  oldValueJsonText:string|null; newValueJsonText:string; oldSourceRef:string|null; newSourceRef:string;
  oldValueSha256:string|null; newValueSha256:string; oldSourceRefSha256:string|null; newSourceRefSha256:string;
}>;
/** One canonical serialisation of the delta, shared by the composer and the release tool. */
export const previewDeltaSha256V2 = (delta:readonly SnapshotDeltaV2[]) => hash(JSON.stringify(delta));

export function composePreviewSnapshotV2(input:Readonly<{sourceRows:readonly RegisterPublicationRow[];baseRows:readonly RegisterPublicationRow[];baseRegisterVersion:string;baseSnapshotSha256:string}>) {
  const source=canonicalRows(input.sourceRows),base=canonicalRows(input.baseRows);
  const baseRegisterVersion=parseRegisterVersionText(input.baseRegisterVersion);
  if(computeRegisterSnapshotSha256(base)!==input.baseSnapshotSha256)fail();
  if(!sameKeys(source.map(row=>row.rowKey),PREVIEW_SOURCE_ROW_KEYS_V2))fail();
  const sourceMap=new Map(source.map(row=>[row.rowKey,row])),baseMap=new Map(base.map(row=>[row.rowKey,row]));
  const owned=PREVIEW_BASE_OWNED_KEYS as readonly string[];
  if([...sourceMap.keys(),...baseMap.keys()].some(key=>FORBIDDEN_KEYS.includes(key))
    ||source.some(row=>owned.includes(row.rowKey))
    ||owned.some(key=>!baseMap.has(key))
    // A base row the source no longer builds is never dropped silently.
    ||base.some(row=>!sourceMap.has(row.rowKey)&&!owned.includes(row.rowKey)))fail();
  assertProviderRows(sourceMap,'source');
  assertProviderRows(baseMap,'base');
  const staff=baseMap.get('staffAccessPolicy')!,internal=baseMap.get('internalAllowancePolicy')!;
  staffAccessPolicyFromValue(JSON.parse(staff.valueJsonText),staff.sourceRef);
  internalAllowancePolicyFromValue(JSON.parse(internal.valueJsonText),internal.sourceRef);
  const rows=canonicalRows([...source,...owned.map(key=>baseMap.get(key)!)]);
  const delta:SnapshotDeltaV2[]=[];
  for(const row of source){
    const old=baseMap.get(row.rowKey);
    if(old&&old.valueJsonText===row.valueJsonText&&old.sourceRef===row.sourceRef)continue;
    delta.push(Object.freeze({
      rowKey:row.rowKey,change:old?'changed' as const:'added' as const,
      reason:!old?'added-source-key':row.rowKey==='nodeRuntimeVersion'?'observed-node-runtime':'reviewed-current-source-facet',
      oldValueJsonText:old?.valueJsonText??null,newValueJsonText:row.valueJsonText,oldSourceRef:old?.sourceRef??null,newSourceRef:row.sourceRef,
      oldValueSha256:old?hash(old.valueJsonText):null,newValueSha256:hash(row.valueJsonText),
      oldSourceRefSha256:old?hash(old.sourceRef):null,newSourceRefSha256:hash(row.sourceRef)
    }));
  }
  const snapshotSha256=computeRegisterSnapshotSha256(rows);
  return Object.freeze({composer:COMPOSER,baseRegisterVersion,baseSnapshotSha256:input.baseSnapshotSha256,rows:Object.freeze(rows),snapshotSha256,
    addedKeys:Object.freeze(delta.filter(entry=>entry.change==='added').map(entry=>entry.rowKey)),
    changedKeys:Object.freeze(delta.filter(entry=>entry.change==='changed').map(entry=>entry.rowKey)),
    delta:Object.freeze(delta),deltaSha256:previewDeltaSha256V2(delta)});
}
export type PreviewSnapshotV2 = ReturnType<typeof composePreviewSnapshotV2>;

/**
 * "Compose from the CURRENT published version": no sealed version may exist above the base,
 * except the one this very publication already wrote (a crashed run re-run with the same plan
 * replays its receipt instead of failing).
 */
export async function assertBaseIsCurrent(pool:Pool,baseRegisterVersion:string,publicationId:string):Promise<void> {
  const base=parseRegisterVersionText(baseRegisterVersion);
  const result=await pool.query<{register_version:string;publication_id:string|null}>(
    'SELECT register_version::text,publication_id::text FROM register.register_version WHERE register_version>$1 ORDER BY register_version',[base]);
  if(!Array.isArray(result.rows)||result.rows.length>1||result.rows.some(row=>row.publication_id!==publicationId))fail();
}

/** v1's publication path unchanged (approval must equal the recomposed snapshot; base re-read; receipt re-read), after the currency check. */
export async function publishPreviewRegisterV2(pool:Pool,input:Readonly<{publicationId:string;sourceRef:string;snapshot:PreviewSnapshotV2;approval:Readonly<{baseRegisterVersion:string;baseSnapshotSha256:string;snapshotSha256:string;deltaSha256:string}>}>) {
  if(input.snapshot?.composer!==COMPOSER)fail();
  await assertBaseIsCurrent(pool,input.snapshot.baseRegisterVersion,input.publicationId);
  return publishPreviewRegister(pool,{...input,snapshot:input.snapshot as unknown as PreviewSnapshot});
}
