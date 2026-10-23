// Preview register publish kit v3: the HOSTED preview with NETOPIA's sandbox (owner rulings 2026-10-13).
//
// Plain words: kit v2 (publish-register-v2.ts, kept byte for byte) builds a LOCAL-mode register with billing off,
// and refuses any base whose billing is on. The owner wants the preview to run in hosted mode, with billing on
// against NETOPIA's and Quaderno's sandboxes, so the owner can test the paid plans there. v3 supersedes v2 for that
// one purpose; v2 stays for a local-mode preview. v3's source is v2's source (same runtime gate, same provider panel,
// same checker, rotation and call-concurrency choices) with exactly these differences, each from the owner's plan:
// - storyCostEnvelopePolicy: the story's money row, which only a HOSTED build seals (story-policy.ts: without it the
//   hosted story writer refuses, STORY_ENVELOPE_MISSING, and the story is off). It is taken from the hosted builder
//   itself, and every other story row of that build must equal v2's byte for byte.
// - costEstimateStartPolicy (owner rulings 2026-10-22, fresh-site estimate): the room estimate's trusted minimum (5 settled
//   runs) and per-depth starting figures ($0.30 / $0.60 / $1.00 for depths 1-3). Code-owned, sealed by every HOSTED build
//   (dev-deployment-register.ts), so v2's local source has no such row; added here with the code's values, never an
//   operator input. A version without it keeps the estimate as before (20 runs, the maximum while short).
// - costEnvelopePolicy: the per-run and daily ceilings are the owner's plan inputs (never a value in this file); every
//   other member of the code-owned row stays, the budget band included (billing needs it, BILLING_REQUIRES_ENVELOPE_MEMBERS).
// - admissionPolicy: the owner's ask_room_reads budget joins the code-owned row as its one added member, exactly as
//   the hosted publisher does (apps/runner/src/hosted-register-publish.ts, P4-G); a hosted API with the band refuses
//   to start without it (ASK_ROOM_ADMISSION_UNSEALED).
// - billingPolicy: off, the code-owned row unchanged; or on, the same row with `enabled: true` and "US" added to
//   withdrawal_countries (the sandbox run buys as a United States buyer; deploy/vps/README.md §14.9). Only on this
//   sandbox host, never on a live one.
// The base may have billing on or off (a base this kit published). Every other v2 rule stays: canonical rows, the
// base snapshot hash, no support or scorecard row, the credential-free reviewed provider set, the two base-owned
// staff and internal-allowance policies carried over and parsed, the approval equal to the recomposed snapshot; the
// base check is the ACTIVE settings version since Phase 2 (publish-register-base.ts, side-by-side spec §13). On top,
// v3 asks of the composed rows the questions a hosted API asks at boot that need no database (cost envelope and band,
// the room read's and the support budgets, the country gate's scope, billing readiness and its four admission scopes,
// the story family and one day holding one run plus its story).
// Debate shape (ruling L-KIT): the operator's optional debateShapePolicy row passes through to v2's builder (v2's
// optional key, so v3's closure admits it); the sealed mapContractHash (a required v2 key) is parsed; a carried
// debateShapePolicy row is parsed like v2 does; and when the composed rows hold the shape, the hosted runner's own
// boot refusals (MAP_CONTRACT_HASH_MISMATCH, DEBATE_SHAPE_MAP_HASH_UNSEALED) are asked before anything is sealed.
// Question language (ruling L-KIT, P2L Task 12): the operator's optional questionLanguagePolicy row passes through to
// v2's builder the same way (v2's seventh argument); a carried questionLanguagePolicy row is parsed; and when the
// composed rows hold the debate shape in force, the hosted API's own question-language boot refusals (an owner text
// carrying a frame token, a fast-check model the preview's Anthropic gate does not review) are asked before sealing.
// Engine redesign (R1d): the operator's optional engineVersionPolicy row passes through to v2's builder (v2's ninth argument);
// the sealed engineContractHash (a required v2 key) is parsed; a carried engineVersionPolicy row is parsed; and with an
// engine row (enabled or not) the hosted runner's own engine boot refusals are asked before anything is sealed.
// Line-up and answer seats (side-by-side spec §13, addition D23; owner 2026-10-22): the plan's optional `lineUp` and
// `answerSeats` pass through to v2's builder (its tenth and eleventh arguments, v3's eleventh and twelfth); the hosted story rows
// v3 compares are built with the same seats; a carried previewLineUpPolicy row is re-parsed by the register's own reader.
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  parseCanonicalRegisterJson, computeRegisterSnapshotSha256, parseRegisterVersionText,
  buildConfiguredProviderSetSealedRow, buildConfiguredProviderSetDeploymentRow,
  costEnvelopePolicyFromValue, costEnvelopeBand, COST_ENVELOPE_POLICY_ROW_KEY,
  admissionPolicyFromValue, assertAskRoomAdmissionSealed, assertHostedSupportAdmissionSealed, ADMISSION_POLICY_ROW_KEY,
  billingPolicyFromValue, billingPlansFromValue, assertBillingReady, BILLING_POLICY_ROW_KEY, BILLING_PLANS_ROW_KEY,
  BILLING_POLICY_DEPLOYMENT_REGISTER_ROW, countryPolicyFromValue, COUNTRY_POLICY_ROW_KEY, readStoryPolicy,
  callConcurrencyPolicyFromValue, CALL_CONCURRENCY_POLICY_ROW_KEY,
  COST_ESTIMATE_START_POLICY_ROW_KEY, COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW, costEstimateStartPolicyFromValue,
  DEBATE_SHAPE_POLICY_ROW_KEY, parseDebateShapePolicy, MAP_CONTRACT_HASH_ROW_KEY, parseMapContractHash, debateShapeInForce,
  QUESTION_LANGUAGE_POLICY_ROW_KEY, parseQuestionLanguagePolicy,
  LENGTH_GUIDANCE_POLICY_ROW_KEY, parseLengthGuidancePolicy,
  ENGINE_CONTRACT_HASH_ROW_KEY, parseEngineContractHash, ENGINE_VERSION_POLICY_ROW_KEY, parseEngineVersionPolicy,
  type EngineVersionPolicy, PREVIEW_LINE_UP_POLICY_ROW_KEY, previewLineUpPolicyFromValue,
  type BootstrapRegister, type CallConcurrencyPolicy, type DebateShapePolicy, type LengthGuidancePolicy, type QuestionLanguagePolicy, type RegisterPublicationRow
} from '@debateai/register';
import { costEnvelopeGuardPolicy } from '@debateai/budget';
import { mapPromptContractHash } from '@debateai/map';
import { resolveDebateShapeRunnerSettings } from '../../../apps/runner/src/debate-shape-boot.js';
import { assertQuestionLanguagePolicyBootable } from '../../../apps/api/src/question-language/boot.js';
import { buildDevelopmentStoryRegisterRows } from '../../../apps/runner/src/dev-deployment-register.js';
import type { PreviewLineUp } from '@debateai/providers';
import { PREVIEW_GLM_PROVIDER_REFS } from '../../../packages/providers/src/preview-test.js';
import { PREVIEW_REVIEWED_PROVIDER_REFS, previewModelRowForRef, previewRefsAreReviewedSet } from '../../../packages/providers/src/preview-models.js';
import { staffAccessPolicyFromValue } from '../../../packages/register/src/staff-access-policy.js';
import { internalAllowancePolicyFromValue } from '../../../packages/register/src/internal-allowance-policy.js';
import { publishPreviewRegister, type RuntimeObservation, type PreviewSnapshot } from './publish-register.js';
import {
  buildPreviewSourceRowsV2, previewAnswerSeatRefs, previewStorySeatRows, previewDeltaSha256V2, assertPreviewEngineBootRows,
  PREVIEW_SOURCE_ROW_KEYS_V2, PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2, PREVIEW_BASE_OWNED_KEYS,
  type PreviewAnswerSeatsChoice, type PreviewCheckerChoice, type PreviewRoleRotationChoice, type SnapshotDeltaV2
} from './publish-register-v2.js';
import { assertBaseIsActive } from './publish-register-base.js';
/** The sealed-snapshot reader is v2's, unchanged; the native operator reads it through this module. */
export { readSealedSnapshot, BASE_NOT_CURRENT, PreviewRegisterBaseNotCurrentError } from './publish-register-v2.js';
/**
 * Side-by-side spec §13 (Task S18): v3's base check is the ACTIVE settings version (publish-register-base.ts), no longer
 * v2's "nothing sealed above the base"; v2's check is deliberately not re-exported, so the native operator cannot reach
 * it through kit v3. With no release yet the active rule falls back to v2's (which can still refuse BASE_NOT_CURRENT).
 */
export { assertBaseIsActive, BASE_NOT_ACTIVE, PreviewRegisterBaseNotActiveError } from './publish-register-base.js';

const sha = (value:string) => createHash('sha256').update(value).digest('hex');
const fail = (rule?:string):never => { throw new TypeError(rule?`PREVIEW_REGISTER_SNAPSHOT_REFUSED: ${rule}`:'PREVIEW_REGISTER_SNAPSHOT_REFUSED'); };
const COMPOSER = 'preview-register-composer-v3' as const;
const FORBIDDEN_KEYS = Object.freeze(['modelScorecard','supportActivation']);
/** The story's money row: the one key a hosted build adds to v2's source. */
export const STORY_COST_ENVELOPE_POLICY_ROW_KEY = 'storyCostEnvelopePolicy' as const;
/** v3's reviewed source closure: v2's keys plus the two rows only a hosted build seals (the estimate's starting figures, the story's money row). */
export const PREVIEW_SOURCE_ROW_KEYS_V3 = Object.freeze([...PREVIEW_SOURCE_ROW_KEYS_V2, COST_ESTIMATE_START_POLICY_ROW_KEY, STORY_COST_ENVELOPE_POLICY_ROW_KEY].sort());
/** The country added to withdrawal_countries while billing is on, on this sandbox host only (deploy/vps/README.md §14.9). */
export const PREVIEW_SANDBOX_WITHDRAWAL_COUNTRY = 'US' as const;
/** Why each owner-input row changed, as the proposal shows it to the owner. */
const OWNER_INPUT_REASON = 'owner-hosted-billing-input' as const;
const OWNER_INPUT_KEYS = Object.freeze([COST_ENVELOPE_POLICY_ROW_KEY, ADMISSION_POLICY_ROW_KEY, BILLING_POLICY_ROW_KEY] as string[]);
const OWNER_RULING = 'owner rulings 2026-10-13: hosted preview, NETOPIA and Quaderno sandboxes';

/**
 * Sanity bounds on the owner's ceilings, never a ceiling themselves: the values are the owner's plan inputs (suggested
 * $3 per debate and $10 per day, pending the owner's confirmation). A typed extra digit stops here, before the review.
 */
export const PREVIEW_HOSTED_CEILING_BOUNDS = Object.freeze({ perRunMaxMicros: 50_000_000, dailyMaxMicros: 200_000_000 });
/** The register's own bounds of an admission scope (packages/register/src/session-policy.ts admissionScopeValueSchema). */
const SCOPE_BOUNDS = Object.freeze({ limit: 1_000_000, windowMs: 86_400_000, capacity: 1_048_576 });

/**
 * The owner's inputs for a hosted preview publication (the native plan's `hostedBilling`): billing on or off, the
 * per-run and daily ceilings in micro-dollars, and the room read's budget (key `owner`, the register's only form).
 */
export type PreviewHostedBillingChoice = Readonly<{
  billing: 'on' | 'off';
  perRunCeilingMicros: number;
  dailyCeilingMicros: number;
  askRoomReads: Readonly<{ limit: number; windowMs: number; capacity: number }>;
}>;

const plain = (value:unknown):value is Record<string,unknown> => value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype;
const exactly = (value:Record<string,unknown>,keys:readonly string[]) => Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const whole = (value:unknown,most:number):value is number => Number.isSafeInteger(value)&&(value as number)>=1&&(value as number)<=most;

/** The one check of the owner's inputs (the native operator runs the same rule before it opens the database). */
export function previewHostedBillingChoice(value:unknown):PreviewHostedBillingChoice {
  if(!plain(value)||!exactly(value,['askRoomReads','billing','dailyCeilingMicros','perRunCeilingMicros']))return fail('hosted-billing-choice');
  const reads=value.askRoomReads;
  if(value.billing!=='on'&&value.billing!=='off')return fail('hosted-billing-choice');
  if(!whole(value.perRunCeilingMicros,PREVIEW_HOSTED_CEILING_BOUNDS.perRunMaxMicros)||!whole(value.dailyCeilingMicros,PREVIEW_HOSTED_CEILING_BOUNDS.dailyMaxMicros)
    ||value.perRunCeilingMicros>value.dailyCeilingMicros)return fail('hosted-billing-ceilings');
  if(!plain(reads)||!exactly(reads,['capacity','limit','windowMs'])||!whole(reads.limit,SCOPE_BOUNDS.limit)||!whole(reads.windowMs,SCOPE_BOUNDS.windowMs)
    ||!whole(reads.capacity,SCOPE_BOUNDS.capacity))return fail('hosted-billing-ask-room-reads');
  return Object.freeze({billing:value.billing,perRunCeilingMicros:value.perRunCeilingMicros,dailyCeilingMicros:value.dailyCeilingMicros,
    askRoomReads:Object.freeze({limit:reads.limit,windowMs:reads.windowMs,capacity:reads.capacity})});
}

const canonicalValue = (value:unknown) => parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value),'utf8'));
const withSuffix = (sourceRef:string,suffix:string) => {
  const joined=`${sourceRef} + ${suffix}`;
  return joined.length<=1024?joined:fail('source-ref-too-long');
};

/**
 * v2's source build with the hosted story row and the owner's three rows. `hosted` is checked first (the owner's
 * inputs), then v2 runs its own checks (runtime gate, checker, rotation, call-concurrency policy, debate shape,
 * question language). `debateShape` is v2's sixth argument, passed through (default null: no row; 'off': the start
 * values disabled); `questionLanguage` is v2's seventh (default null: no row, the code's start values); `lengthGuidance`
 * is v2's eighth (default null: no row; LG-C); `engineVersion` is v2's ninth (default null: no row; 'off': the start values
 * disabled; R1d); `lineUp` is v2's tenth (default null: no row; addition D23) and `answerSeats` v2's eleventh (default null:
 * today's seats; the hosted story rows follow the same seats).
 */
export async function buildPreviewSourceRowsV3(bootstrap:BootstrapRegister, runtime:RuntimeObservation, hosted:unknown, checker?:PreviewCheckerChoice, roleRotation:PreviewRoleRotationChoice='on', callConcurrency:CallConcurrencyPolicy|null=null, debateShape:DebateShapePolicy|'off'|null=null, questionLanguage:QuestionLanguagePolicy|null=null, lengthGuidance:LengthGuidancePolicy|null=null, engineVersion:EngineVersionPolicy|'off'|null=null, lineUp:PreviewLineUp|null=null, answerSeats:PreviewAnswerSeatsChoice|null=null):Promise<readonly RegisterPublicationRow[]> {
  const choice=previewHostedBillingChoice(hosted);
  const local=await buildPreviewSourceRowsV2(bootstrap,runtime,checker,roleRotation,callConcurrency,debateShape,questionLanguage,lengthGuidance,engineVersion,lineUp,answerSeats);
  const byKey=new Map(local.map(row=>[row.rowKey,row]));
  // The hosted builder's story rows: every one but the money row must be v2's, so the hosted build differs by that row alone.
  // Addition D23: built with the same seats v2 sealed (v2 already checked them), story seats chosen on their own applied alike.
  const seats=previewAnswerSeatRefs(answerSeats,checker);
  const story=previewStorySeatRows(buildDevelopmentStoryRegisterRows({synthesizerRoleRef:seats.synthesizerRoleRef,evaluatorRoleRef:seats.evaluatorRoleRef},'hosted')
    .map(row=>({rowKey:row.rowKey,valueJsonText:canonicalValue(row.value),sourceRef:row.sourceRef})),seats);
  for(const row of story){
    if(row.rowKey===STORY_COST_ENVELOPE_POLICY_ROW_KEY)continue;
    const same=byKey.get(row.rowKey);
    if(!same||same.valueJsonText!==row.valueJsonText||same.sourceRef!==row.sourceRef)fail('hosted-story-rows');
  }
  const storyCost=story.find(row=>row.rowKey===STORY_COST_ENVELOPE_POLICY_ROW_KEY)??fail('hosted-story-rows');
  if(byKey.has(STORY_COST_ENVELOPE_POLICY_ROW_KEY))fail('hosted-story-rows');
  const value=(key:string)=>JSON.parse((byKey.get(key)??fail(`source-row-missing:${key}`)).valueJsonText) as Record<string,unknown>;
  const sourceRef=(key:string)=>byKey.get(key)!.sourceRef;
  // The owner's ceilings; every other member of the code-owned row (the band among them) stays.
  const cost={...value(COST_ENVELOPE_POLICY_ROW_KEY),per_run_ceiling_micros:choice.perRunCeilingMicros,daily_ceiling_micros:choice.dailyCeilingMicros,
    provisional:true,provisional_reason:'Preview sandbox ceilings: the owner\'s per-run and daily values from the hosted preview publish plan'};
  const costRef=withSuffix(sourceRef(COST_ENVELOPE_POLICY_ROW_KEY),`preview hosted ceilings, the owner's plan values (${OWNER_RULING})`);
  if(costEnvelopeBand(costEnvelopePolicyFromValue(cost,costRef))===null)fail('hosted-cost-envelope-band');
  // The room read's budget joins the code-owned admission row as its one added member (the hosted publisher's P4-G rule).
  const codeAdmission=value(ADMISSION_POLICY_ROW_KEY);
  if(Object.hasOwn(codeAdmission,'ask_room_reads'))fail('hosted-admission-row');
  const admission={...codeAdmission,ask_room_reads:{key:'owner',limit:choice.askRoomReads.limit,window_ms:choice.askRoomReads.windowMs,capacity:choice.askRoomReads.capacity}};
  const admissionRef=withSuffix(sourceRef(ADMISSION_POLICY_ROW_KEY),`paid plans P4-G ask_room_reads, the owner's value from the hosted preview publish plan`);
  admissionPolicyFromValue(admission,admissionRef);
  // Billing: the code-owned row, switched on only by the owner's plan, with the sandbox host's US withdrawal right.
  const codeBilling=value(BILLING_POLICY_ROW_KEY);
  if(sourceRef(BILLING_POLICY_ROW_KEY)!==BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef||codeBilling.enabled!==false)fail('hosted-billing-row');
  const billingRows=choice.billing==='off'?[byKey.get(BILLING_POLICY_ROW_KEY)!]:(()=>{
    const countries=codeBilling.withdrawal_countries as string[];
    if(countries.includes(PREVIEW_SANDBOX_WITHDRAWAL_COUNTRY))fail('hosted-billing-row');
    const on={...codeBilling,enabled:true,withdrawal_countries:[...countries,PREVIEW_SANDBOX_WITHDRAWAL_COUNTRY]};
    const ref=withSuffix(sourceRef(BILLING_POLICY_ROW_KEY),`enabled on the hosted preview with NETOPIA's sandbox, "US" withdrawal on this sandbox host only (${OWNER_RULING})`);
    billingPolicyFromValue(on,ref);
    return [{rowKey:BILLING_POLICY_ROW_KEY,valueJsonText:canonicalValue(on),sourceRef:ref}];
  })();
  const replaced=new Map<string,RegisterPublicationRow>([
    [COST_ENVELOPE_POLICY_ROW_KEY,{rowKey:COST_ENVELOPE_POLICY_ROW_KEY,valueJsonText:canonicalValue(cost),sourceRef:costRef}],
    [ADMISSION_POLICY_ROW_KEY,{rowKey:ADMISSION_POLICY_ROW_KEY,valueJsonText:canonicalValue(admission),sourceRef:admissionRef}],
    [BILLING_POLICY_ROW_KEY,billingRows[0]!]
  ]);
  // Fresh-site estimate (owner rulings 2026-10-22): the code-owned row a hosted build seals, with the code's values.
  if(byKey.has(COST_ESTIMATE_START_POLICY_ROW_KEY))fail('hosted-estimate-start-row');
  const estimateStart={rowKey:COST_ESTIMATE_START_POLICY_ROW_KEY,valueJsonText:canonicalValue(COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.value),
    sourceRef:COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef};
  const rows=[...local.map(row=>replaced.get(row.rowKey)??row),estimateStart,storyCost];
  if(!sourceKeysReviewedV3(rows.map(row=>row.rowKey)))fail('source-key-list');
  return Object.freeze(rows.map(row=>Object.freeze({...row})));
}

const sameKeys = (actual:readonly string[], expected:readonly string[]) =>
  actual.length===expected.length && [...actual].sort().join('\0')===[...expected].sort().join('\0');
/** v3's closure: exactly the reviewed key list, plus at most one of each reviewed optional key (v2's optional list). */
const sourceKeysReviewedV3 = (keys:readonly string[]) => {
  const optional=PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2 as readonly string[];
  return new Set(keys).size===keys.length&&sameKeys(keys.filter(key=>!optional.includes(key)),PREVIEW_SOURCE_ROW_KEYS_V3);
};

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
const sameRefs = (providers:readonly any[], refs:readonly string[]) =>
  providers.length===refs.length && providers.every((p:any,i:number)=>p?.providerRef===refs[i]);
/** v2's provider-set rules, unchanged. Billing is checked separately (v3 admits it on). */
function assertProviderRows(rows:ReadonlyMap<string,RegisterPublicationRow>, side:'source'|'base') {
  const providers=JSON.parse(rows.get('configuredProviderSet')?.valueJsonText??'null');
  if(!credentialFree(providers)||!Array.isArray(providers?.providers))fail();
  if(side==='source'){
    if(!sameRefs(providers.providers,PREVIEW_REVIEWED_PROVIDER_REFS)||providers.requiredDistinctMakers!==1
      ||providers.providers.some((p:any)=>Object.keys(p).sort().join(',')!=='adapterKind,maker,providerRef'||p.adapterKind!==previewModelRowForRef(p.providerRef)?.adapterKind||p.maker!==previewModelRowForRef(p.providerRef)?.maker))fail();
    return;
  }
  if(!sameRefs(providers.providers,PREVIEW_GLM_PROVIDER_REFS)&&!previewRefsAreReviewedSet(providers.providers.map((p:any)=>p?.providerRef)))fail();
  const vetted=providers.setVersion===2;
  if(providers.kind!=='CONFIGURED_PROVIDER_SET'||Object.keys(providers).sort().join(',')!==(vetted?'kind,providers,requiredDistinctMakers,setVersion':'kind,providers,requiredDistinctMakers')
    ||providers.providers.some((p:any)=>Object.keys(p).sort().join(',')!==(vetted?'adapterKind,maker,providerRef,vetting':'adapterKind,maker,providerRef')
      ||vetted&&(!p.vetting||Object.keys(p.vetting).sort().join(',')!=='dataUseTermsReviewedOn,namedInPrivacyNotice,retentionTermsReviewedOn')))fail();
  const input={requiredDistinctMakers:providers.requiredDistinctMakers,providers:providers.providers},sourceRef=rows.get('configuredProviderSet')!.sourceRef;
  if(vetted)buildConfiguredProviderSetDeploymentRow(input,sourceRef);
  else buildConfiguredProviderSetSealedRow(input,sourceRef);
}

/**
 * The billing switch on either side: the strict row, parsed by the register's own reader. The source is the code-owned
 * row (enabled false) or that row switched on with the US withdrawal right; the base may be either (a version this kit
 * published) or any lawful billing-off row.
 */
function assertBillingRows(source:ReadonlyMap<string,RegisterPublicationRow>, base:ReadonlyMap<string,RegisterPublicationRow>) {
  const read=(row:RegisterPublicationRow|undefined)=>row===undefined?fail('billing-policy-missing'):billingPolicyFromValue(JSON.parse(row.valueJsonText),row.sourceRef);
  const own=read(source.get(BILLING_POLICY_ROW_KEY)),code=BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value;
  const expected=canonicalValue({...code,enabled:own.enabled,withdrawal_countries:own.enabled?[...code.withdrawal_countries,PREVIEW_SANDBOX_WITHDRAWAL_COUNTRY]:[...code.withdrawal_countries]});
  if(source.get(BILLING_POLICY_ROW_KEY)!.valueJsonText!==expected)fail('billing-policy-source');
  read(base.get(BILLING_POLICY_ROW_KEY));
}

/**
 * The questions a hosted API asks of the version in force at boot that need no database, in main.ts's order
 * (verifyHostedRegisterBootReadiness asks them of a sealed version; here they are asked before anything is sealed),
 * then, with a debate shape row, the hosted RUNNER's own boot refusals (apps/runner/src/debate-shape-boot.ts), and,
 * with the shape in force, the API's question-language boot refusals (apps/api/src/question-language/boot.ts).
 */
export function assertHostedPreviewBootRows(rows:readonly RegisterPublicationRow[]):void {
  const map=new Map(rows.map(row=>[row.rowKey,row]));
  const parsed=(key:string)=>{const row=map.get(key)??fail(`hosted-row-missing:${key}`);return {value:JSON.parse(row.valueJsonText) as unknown,sourceRef:row.sourceRef};};
  const cost=parsed(COST_ENVELOPE_POLICY_ROW_KEY),envelope=costEnvelopePolicyFromValue(cost.value,cost.sourceRef);
  const admissionRow=parsed(ADMISSION_POLICY_ROW_KEY),admission=admissionPolicyFromValue(admissionRow.value,admissionRow.sourceRef);
  const country=map.has(COUNTRY_POLICY_ROW_KEY)?parsed(COUNTRY_POLICY_ROW_KEY):null;
  if(country!==null)countryPolicyFromValue(country.value,country.sourceRef);
  if(country!==null&&admission.geoAvailability===null)fail('GEO_AVAILABILITY_ADMISSION_UNSEALED');
  assertHostedSupportAdmissionSealed('hosted',admission);
  // The story family (absent = story off; partial or malformed refuses) and one day holding one run plus its story.
  const story=readStoryPolicy(rows.map(row=>({rowKey:row.rowKey,value:JSON.parse(row.valueJsonText) as unknown,sourceRef:row.sourceRef})),1);
  if(story===null||story.perStoryCeilingMicros===null)fail('hosted-story-money-row');
  costEnvelopeGuardPolicy(envelope,story);
  // Fresh-site estimate (owner rulings 2026-10-22): main.ts's cost-estimate-start-policy stage. Optional (absent = the
  // estimate as before), but a malformed row refuses the API's boot (COST_ESTIMATE_START_POLICY_INVALID).
  const estimateStart=map.has(COST_ESTIMATE_START_POLICY_ROW_KEY)?parsed(COST_ESTIMATE_START_POLICY_ROW_KEY):null;
  if(estimateStart!==null)costEstimateStartPolicyFromValue(estimateStart.value,estimateStart.sourceRef);
  const billingRow=parsed(BILLING_POLICY_ROW_KEY),policy=billingPolicyFromValue(billingRow.value,billingRow.sourceRef);
  const plansRow=map.has(BILLING_PLANS_ROW_KEY)?parsed(BILLING_PLANS_ROW_KEY):null;
  assertBillingReady({policy,plans:plansRow===null?null:billingPlansFromValue(plansRow.value,plansRow.sourceRef),envelope});
  assertAskRoomAdmissionSealed({envelope,admission});
  if(costEnvelopeBand(envelope)===null)fail('hosted-cost-envelope-band');
  // NETOPIA's notify route is served in both hosted modes (provider-only too: assertProviderOnlyNotifySealed).
  if(admission.billingNotify===null)fail('BILLING_ADMISSION_UNSEALED');
  if(policy.enabled&&country===null)fail('BILLING_CONFIGURATION_INCOMPLETE');
  if(policy.enabled&&(admission.billingQuote===null||admission.billingCheckout===null||admission.billingCancelLink===null))fail('BILLING_ADMISSION_UNSEALED');
  // The hosted runner's own boot read (apps/runner/src/debate-shape-boot.ts): with a debateShapePolicy row (enabled or
  // not), the sealed mapContractHash must be present and the code's, or it throws the runner's typed refusal. No shape
  // row = today's boot: the map hash row is never read.
  const shape=map.get(DEBATE_SHAPE_POLICY_ROW_KEY);
  if(shape!==undefined){
    const hash=map.get(MAP_CONTRACT_HASH_ROW_KEY);
    resolveDebateShapeRunnerSettings({policy:parseDebateShapePolicy(JSON.parse(shape.valueJsonText)),
      mapContractHash:hash===undefined?null:parseMapContractHash(JSON.parse(hash.valueJsonText)),codeMapContractHash:mapPromptContractHash()});
  }
  // Engine redesign (R1d): the hosted runner's own engine boot read (apps/runner/src/engine-boot.ts): with an engine row
  // (enabled or not), the length row and this code's engineContractHash, or the runner's typed refusal. No engine row =
  // engine 1: the seal is never read.
  assertPreviewEngineBootRows(rows);
  // The API's question-language boot step (main.ts "question-language"): only with the shape row in force. The preview
  // route is the strictest one the API can take (L-ROUTE: never hosted): the fast-check model must be a reviewed row of
  // the preview's Anthropic gate, and the owner text must frame. No shape in force = the row is never read at boot.
  const language=map.get(QUESTION_LANGUAGE_POLICY_ROW_KEY);
  if(language!==undefined){
    const policy=parseQuestionLanguagePolicy(JSON.parse(language.valueJsonText));
    if(shape!==undefined&&debateShapeInForce(parseDebateShapePolicy(JSON.parse(shape.valueJsonText)))!==null){
      assertQuestionLanguagePolicyBootable(policy,{kind:'PREVIEW',fetch:(async()=>fail('question-language-boot-check-never-calls')) as typeof fetch});
    }
  }
}

export function composePreviewSnapshotV3(input:Readonly<{sourceRows:readonly RegisterPublicationRow[];baseRows:readonly RegisterPublicationRow[];baseRegisterVersion:string;baseSnapshotSha256:string}>) {
  const source=canonicalRows(input.sourceRows),base=canonicalRows(input.baseRows);
  const baseRegisterVersion=parseRegisterVersionText(input.baseRegisterVersion);
  if(computeRegisterSnapshotSha256(base)!==input.baseSnapshotSha256)fail('base-snapshot');
  const sourceMap=new Map(source.map(row=>[row.rowKey,row])),baseMap=new Map(base.map(row=>[row.rowKey,row]));
  const owned=PREVIEW_BASE_OWNED_KEYS as readonly string[];
  // Each rule refuses on its own, before the key list, so every one is separately observable (v2's order).
  if([...sourceMap.keys(),...baseMap.keys()].some(key=>FORBIDDEN_KEYS.includes(key)))fail('support-or-scorecard-row');
  if(source.some(row=>owned.includes(row.rowKey)))fail('base-owned-row-in-source');
  if(owned.some(key=>!baseMap.has(key)))fail('base-owned-row-missing');
  if(!sourceKeysReviewedV3(source.map(row=>row.rowKey)))fail('source-key-list');
  const optional=PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2 as readonly string[];
  const carried=base.filter(row=>optional.includes(row.rowKey)&&!sourceMap.has(row.rowKey));
  for(const row of carried){
    if(row.rowKey===CALL_CONCURRENCY_POLICY_ROW_KEY)callConcurrencyPolicyFromValue(JSON.parse(row.valueJsonText));
    if(row.rowKey===DEBATE_SHAPE_POLICY_ROW_KEY)parseDebateShapePolicy(JSON.parse(row.valueJsonText));
    if(row.rowKey===QUESTION_LANGUAGE_POLICY_ROW_KEY)parseQuestionLanguagePolicy(JSON.parse(row.valueJsonText));
    if(row.rowKey===LENGTH_GUIDANCE_POLICY_ROW_KEY)parseLengthGuidancePolicy(JSON.parse(row.valueJsonText));
    if(row.rowKey===ENGINE_VERSION_POLICY_ROW_KEY)parseEngineVersionPolicy(JSON.parse(row.valueJsonText));
    if(row.rowKey===PREVIEW_LINE_UP_POLICY_ROW_KEY)previewLineUpPolicyFromValue(JSON.parse(row.valueJsonText));
  }
  // The sealed map prompts' hash: a required source key (v2's builder makes it), parsed by the register's own reader.
  parseMapContractHash(JSON.parse(sourceMap.get(MAP_CONTRACT_HASH_ROW_KEY)!.valueJsonText));
  // Engine redesign (R1d): engine 2's seal, a required source key (v2's builder makes it), parsed by the register's own reader.
  parseEngineContractHash(JSON.parse(sourceMap.get(ENGINE_CONTRACT_HASH_ROW_KEY)!.valueJsonText));
  if(base.some(row=>!sourceMap.has(row.rowKey)&&!owned.includes(row.rowKey)&&!optional.includes(row.rowKey)))fail('base-row-dropped');
  assertProviderRows(sourceMap,'source');
  assertProviderRows(baseMap,'base');
  assertBillingRows(sourceMap,baseMap);
  const staff=baseMap.get('staffAccessPolicy')!,internal=baseMap.get('internalAllowancePolicy')!;
  staffAccessPolicyFromValue(JSON.parse(staff.valueJsonText),staff.sourceRef);
  internalAllowancePolicyFromValue(JSON.parse(internal.valueJsonText),internal.sourceRef);
  const rows=canonicalRows([...source,...owned.map(key=>baseMap.get(key)!),...carried]);
  assertHostedPreviewBootRows(rows);
  const delta:SnapshotDeltaV2[]=[];
  for(const row of source){
    const old=baseMap.get(row.rowKey);
    if(old&&old.valueJsonText===row.valueJsonText&&old.sourceRef===row.sourceRef)continue;
    delta.push(Object.freeze({
      rowKey:row.rowKey,change:old?'changed' as const:'added' as const,
      reason:!old?'added-source-key':row.rowKey==='nodeRuntimeVersion'?'observed-node-runtime':OWNER_INPUT_KEYS.includes(row.rowKey)?OWNER_INPUT_REASON:'reviewed-current-source-facet',
      oldValueJsonText:old?.valueJsonText??null,newValueJsonText:row.valueJsonText,oldSourceRef:old?.sourceRef??null,newSourceRef:row.sourceRef,
      oldValueSha256:old?sha(old.valueJsonText):null,newValueSha256:sha(row.valueJsonText),
      oldSourceRefSha256:old?sha(old.sourceRef):null,newSourceRefSha256:sha(row.sourceRef)
    }));
  }
  const snapshotSha256=computeRegisterSnapshotSha256(rows);
  return Object.freeze({composer:COMPOSER,baseRegisterVersion,baseSnapshotSha256:input.baseSnapshotSha256,rows:Object.freeze(rows),snapshotSha256,
    addedKeys:Object.freeze(delta.filter(entry=>entry.change==='added').map(entry=>entry.rowKey)),
    changedKeys:Object.freeze(delta.filter(entry=>entry.change==='changed').map(entry=>entry.rowKey)),
    delta:Object.freeze(delta),deltaSha256:previewDeltaSha256V2(delta)});
}
export type PreviewSnapshotV3 = ReturnType<typeof composePreviewSnapshotV3>;

/**
 * v2's publication path (the approval equal to the recomposed snapshot; base re-read; receipt re-read), with the base
 * checked against the ACTIVE settings version before and after the write (side-by-side spec §13): a version sealed
 * above the base no longer refuses; an activation that lands during the write is reported, not hidden.
 */
export async function publishPreviewRegisterV3(pool:Pool,input:Readonly<{publicationId:string;sourceRef:string;snapshot:PreviewSnapshotV3;approval:Readonly<{baseRegisterVersion:string;baseSnapshotSha256:string;snapshotSha256:string;deltaSha256:string}>}>) {
  if(input.snapshot?.composer!==COMPOSER)fail();
  await assertBaseIsActive(pool,input.snapshot.baseRegisterVersion,input.publicationId);
  const receipt=await publishPreviewRegister(pool,{...input,snapshot:input.snapshot as unknown as PreviewSnapshot});
  await assertBaseIsActive(pool,input.snapshot.baseRegisterVersion,input.publicationId);
  return receipt;
}
