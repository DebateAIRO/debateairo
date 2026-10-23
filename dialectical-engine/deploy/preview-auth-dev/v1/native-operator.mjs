import { tsImport } from 'tsx/esm/api';
import { join } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { withPrivateBytes,strictJson,exactKeys,refuse,sha256 } from './custody.mjs';
import { RELEASE_LABEL,readPublicArtifact } from './launch-plan.mjs';
import { DATABASE_AHEAD_MAX_BYTES,DATABASE_AHEAD_ROOT,databaseAheadPathForLabel,newerManifestMatches,validateDatabaseAheadFile } from './database-ahead.mjs';
import { verifySourceManifest,operatorManifestSha256 } from './source-manifest.mjs';
import { withActiveNativePool } from './native-peer.mjs';
const NATIVE_PLAN_KEYS=['schema','operation','sourceRoot','sourceRevision','sourceTree','sourceManifest','operatorManifestSha256','selectedBaseRegisterVersion','selectedBaseSnapshotSha256','publicationId','approval'];
/**
 * The one reviewed non-default checker choice a plan may carry (publish-register-v2.ts PreviewCheckerChoice).
 * Without `checkerChoice` the register's checker stays GLM. Only plan and publish compose a reviewed proposal,
 * so only they may carry it; the publisher checks it again before it builds a row.
 */
export const DEEPSEEK_CHECKER_CHOICE=Object.freeze({checker:'deepseek',deepseekEnabledOnGate:true});
/**
 * The one non-default role rotation choice a plan may carry (publish-register-v2.ts PreviewRoleRotationChoice):
 * `roleRotation: 'off'` publishes the rotation row disabled (the preview's rollback). Without it rotation stays on.
 * Like the checker choice, only plan and publish may carry it; the publisher checks it again.
 */
export const ROLE_ROTATION_OFF='off';
/**
 * The operator's optional parallel-calls policy (publish-register-v2.ts buildPreviewSourceRowsV2's fifth argument,
 * spec 2026-10-12 §3.1): exactly perDebate 1..64, perModelPerDebate 1..16 and perModelPerRunner, an object of
 * lower-case vendor keys with a required `default`, each 1..1000. The same bounds as the register's own parser
 * (packages/register/src/call-concurrency-policy.ts), which the publisher runs again before it builds the row.
 * Like the checker choice, only plan and publish may carry it. Returns the policy in one fixed key order.
 */
export function validateCallConcurrencyChoice(value) {
 const count=(number,max)=>Number.isSafeInteger(number)&&number>=1&&number<=max;
 exactKeys(value,['perDebate','perModelPerDebate','perModelPerRunner'],'PREVIEW_NATIVE_PLAN_REFUSED');
 const runner=value.perModelPerRunner;
 if(!runner||typeof runner!=='object'||Object.getPrototypeOf(runner)!==Object.prototype||!Object.hasOwn(runner,'default'))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 const vendors=Object.keys(runner);
 if(!count(value.perDebate,64)||!count(value.perModelPerDebate,16)
  ||vendors.some(vendor=>!/^[a-z][a-z0-9-]{0,31}$/.test(vendor)||!count(runner[vendor],1000)))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 return {perDebate:value.perDebate,perModelPerDebate:value.perModelPerDebate,
  perModelPerRunner:Object.fromEntries(['default',...vendors.filter(vendor=>vendor!=='default').sort()].map(vendor=>[vendor,runner[vendor]]))};
}
/**
 * The operator's optional debate shape choice (publish-register-v2.ts buildPreviewSourceRowsV2's sixth argument;
 * kit v3's buildPreviewSourceRowsV3 passes it through as its seventh, spec 2026-10-12 §3.1): the exact word 'off'
 * (the row published disabled: the start values with enabled false, the preview's rollback) or one plain JSON object
 * (the policy, with its kind). Shape only: the register's own parser checks the object in buildPreviewSourceRowsV2
 * (DEBATE_SHAPE_POLICY_INVALID:<path>) before any row is built, for either kit. Like the checker choice, only plan and
 * publish may carry it.
 */
export const DEBATE_SHAPE_OFF='off';
export function validateDebateShapeChoice(value) {
 if(value===DEBATE_SHAPE_OFF)return value;
 if(value===null||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 return value;
}
/**
 * The operator's optional question-language choice (spec 2026-10-13, P2L Task 12): kit v2's seventh argument and kit
 * v3's eighth. One plain JSON object (the policy, with its kind); there is no 'off' word: the owners switch the fast
 * check off with `"fastCheck": null`. Shape only: the register's own parser checks the object in
 * buildPreviewSourceRowsV2 (QUESTION_LANGUAGE_POLICY_INVALID:<path>) before any row is built, for either kit. Like the
 * checker choice, only plan and publish may carry it.
 */
export function validateQuestionLanguageChoice(value) {
 if(value===null||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 return value;
}
/**
 * The operator's optional length-guidance choice (spec 2026-10-15, LG-C): kit v2's eighth argument and kit v3's ninth. One
 * plain JSON object (the policy, with its kind); there is no 'off' word: a version without the row is the rollback. Shape
 * only here: the register's own parser checks it in buildPreviewSourceRowsV2 (LENGTH_GUIDANCE_POLICY_INVALID:<path>)
 * before any row is built. Only plan and publish may carry it.
 */
export function validateLengthGuidanceChoice(value) {
 if(value===null||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 return value;
}
/**
 * The operator's optional line-up (side-by-side spec §13, addition D12, D23; owner 2026-10-22): kit v2's tenth argument and
 * kit v3's eleventh, sealed as the previewLineUpPolicy row. Exactly the three members the env carries today
 * (`free_model_ids`, `premium_model_ids`: lists of model-id texts; `thinking_levels`: the owner's table, or null for every AI
 * at its default), so `check-thinking-levels.ts --print-line-up` output pastes in unchanged. Shape only here: the providers'
 * line-up parser checks the values (reviewed ids, the maker rule, each level on its AI's menu) where the rows are built,
 * before any row is, and its message is the refusal. Like the checker choice, only plan and publish may carry it.
 */
export function validateLineUpChoice(value) {
 const plain=item=>item!==null&&typeof item==='object'&&!Array.isArray(item)&&Object.getPrototypeOf(item)===Object.prototype;
 exactKeys(value,['free_model_ids','premium_model_ids','thinking_levels'],'PREVIEW_NATIVE_PLAN_REFUSED');
 const roster=list=>Array.isArray(list)&&list.every(id=>typeof id==='string');
 if(!plain(value)||!roster(value.free_model_ids)||!roster(value.premium_model_ids)||(value.thinking_levels!==null&&!plain(value.thinking_levels)))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 return value;
}
/**
 * The operator's optional four answer seats (addition D23; publish-register-v2.ts PreviewAnswerSeatsChoice): kit v2's eleventh
 * argument and kit v3's twelfth. `writer` and `checker` required, `storyteller` and `storyChecker` optional (they otherwise
 * follow the writer and the checker), each a non-empty text, the writer never its own checker (Ruling R27b). Shape only here: the kit refuses a ref outside the reviewed
 * preview refs before any row is built. One way to set the checker: a plan may not carry both `answerSeats` and
 * `checkerChoice`. Like the checker choice, only plan and publish may carry it.
 */
export function validateAnswerSeatsChoice(value) {
 if(value===null||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 exactKeys(value,['writer','checker',...['storyteller','storyChecker'].filter(key=>Object.hasOwn(value,key))],'PREVIEW_NATIVE_PLAN_REFUSED');
 if(Object.values(value).some(ref=>typeof ref!=='string'||ref.length<1))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 // Ruling R27b (SA9 fix round 1): one AI must not check its own answer (the kit refuses it too, answer-seats-writer-is-checker).
 if(value.writer===value.checker)refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 return value;
}
/**
 * Sanity bounds on the owner's hosted-preview ceilings (publish-register-v3.ts PREVIEW_HOSTED_CEILING_BOUNDS; a unit
 * test pins the two equal). They catch a typed extra digit; the ceilings themselves are always the owner's inputs.
 */
export const HOSTED_CEILING_BOUNDS=Object.freeze({perRunMaxMicros:50_000_000,dailyMaxMicros:200_000_000});
/**
 * The owner's hosted-preview inputs (publish-register-v3.ts PreviewHostedBillingChoice, owner rulings 2026-10-13):
 * exactly `billing` ('on' or 'off'), `perRunCeilingMicros` and `dailyCeilingMicros` (whole micro-dollars, per run at
 * most the day) and `askRoomReads` ({limit, windowMs, capacity}: the room read's budget, the register's own bounds).
 * A plan that carries it composes with kit v3 (hosted rows); without it, with kit v2 (local rows, billing off). The
 * kit checks it again before it builds a row. Returns the choice in one fixed key order.
 */
export function validateHostedBillingChoice(value) {
 const count=(number,max)=>Number.isSafeInteger(number)&&number>=1&&number<=max;
 exactKeys(value,['billing','perRunCeilingMicros','dailyCeilingMicros','askRoomReads'],'PREVIEW_NATIVE_PLAN_REFUSED');
 exactKeys(value.askRoomReads,['limit','windowMs','capacity'],'PREVIEW_NATIVE_PLAN_REFUSED');
 const reads=value.askRoomReads;
 if(!['on','off'].includes(value.billing)||!count(value.perRunCeilingMicros,HOSTED_CEILING_BOUNDS.perRunMaxMicros)||!count(value.dailyCeilingMicros,HOSTED_CEILING_BOUNDS.dailyMaxMicros)
  ||value.perRunCeilingMicros>value.dailyCeilingMicros||!count(reads.limit,1_000_000)||!count(reads.windowMs,86_400_000)||!count(reads.capacity,1_048_576))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 return {billing:value.billing,perRunCeilingMicros:value.perRunCeilingMicros,dailyCeilingMicros:value.dailyCeilingMicros,askRoomReads:{limit:reads.limit,windowMs:reads.windowMs,capacity:reads.capacity}};
}
/** The reviewed native-plan schema check; the release tool runs it before writing a plan. */
export function validateNativePlan(plan) {
 const chosen=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'checkerChoice');
 const rotation=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'roleRotation');
 const concurrency=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'callConcurrency');
 const shape=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'debateShape');
 const language=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'questionLanguage');
 const lengthGuided=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'lengthGuidance');
 const hosted=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'hostedBilling');
 const lineUp=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'lineUp');
 const seated=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'answerSeats');
 exactKeys(plan,[...NATIVE_PLAN_KEYS,...(chosen?['checkerChoice']:[]),...(rotation?['roleRotation']:[]),...(concurrency?['callConcurrency']:[]),...(shape?['debateShape']:[]),...(language?['questionLanguage']:[]),...(lengthGuided?['lengthGuidance']:[]),...(hosted?['hostedBilling']:[]),...(lineUp?['lineUp']:[]),...(seated?['answerSeats']:[])]);
 if(plan.schema!=='preview-auth-dev-native-plan-v1'||!['apply-and-plan','plan','publish','verify'].includes(plan.operation)
  ||!/^\/opt\/debateai-v3-preview\/releases\/auth-dev-candidate-[a-z0-9-]+$/.test(plan.sourceRoot))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 if(chosen){
  exactKeys(plan.checkerChoice,Object.keys(DEEPSEEK_CHECKER_CHOICE),'PREVIEW_NATIVE_PLAN_REFUSED');
  if(!['plan','publish'].includes(plan.operation)||Object.entries(DEEPSEEK_CHECKER_CHOICE).some(([key,value])=>plan.checkerChoice[key]!==value))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 }
 if(rotation&&(plan.roleRotation!==ROLE_ROTATION_OFF||!['plan','publish'].includes(plan.operation)))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 if(concurrency){
  validateCallConcurrencyChoice(plan.callConcurrency);
  if(!['plan','publish'].includes(plan.operation))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 }
 if(shape){
  validateDebateShapeChoice(plan.debateShape);
  if(!['plan','publish'].includes(plan.operation))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 }
 if(language){
  validateQuestionLanguageChoice(plan.questionLanguage);
  if(!['plan','publish'].includes(plan.operation))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 }
 if(lengthGuided){
  validateLengthGuidanceChoice(plan.lengthGuidance);
  if(!['plan','publish'].includes(plan.operation))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 }
 // Addition D23: the line-up and the seats, shape only (the kit's parsers run before any row is built).
 if(lineUp){
  validateLineUpChoice(plan.lineUp);
  if(!['plan','publish'].includes(plan.operation))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 }
 if(seated){
  validateAnswerSeatsChoice(plan.answerSeats);
  if(!['plan','publish'].includes(plan.operation)||chosen)refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 }
 // Unlike the choices above, every operation may carry it: once a hosted version is the base, verify and
 // apply-and-plan compose with kit v3 too (kit v2 refuses a base with billing on).
 if(hosted)validateHostedBillingChoice(plan.hostedBilling);
 return plan;
}
/**
 * What the owner reviews before publish (v2): the full delta with old and new canonical values.
 * The release tool re-hashes `delta` against `deltaSha256` and copies the approval from this file.
 */
export function snapshotProposal({runtimeObservedAt,source,plan,snapshot}) {
 return {schema:'preview-auth-dev-snapshot-proposal-v2',composer:snapshot.composer,runtimeObservedAt,sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,operatorManifestSha256:plan.operatorManifestSha256,
  baseRegisterVersion:snapshot.baseRegisterVersion,baseSnapshotSha256:snapshot.baseSnapshotSha256,snapshotSha256:snapshot.snapshotSha256,deltaSha256:snapshot.deltaSha256,
  rowCount:snapshot.rows.length,rowKeys:snapshot.rows.map(row=>row.rowKey),addedKeys:snapshot.addedKeys,changedKeys:snapshot.changedKeys,delta:snapshot.delta};
}
/** Root's folder of per-release plans (side-by-side spec §10): native-plan-<label>.json, database-ahead-<label>.json. */
const NATIVE_PLAN_ROOT=DATABASE_AHEAD_ROOT;
const RELEASES_ROOT='/opt/debateai-v3-preview/releases';
/** This operator inside a candidate API release folder: `…/auth-dev-candidate-<label>-api/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs`. */
const ENTRY=new RegExp(`^${RELEASES_ROOT}/auth-dev-candidate-(${RELEASE_LABEL.source.slice(1,-1)})-api/dialectical-engine/deploy/preview-auth-dev/v1/native-operator\\.mjs$`);
const entryLabel=entryPath=>(typeof entryPath==='string'?ENTRY.exec(entryPath)?.[1]:undefined)??refuse('PREVIEW_NATIVE_PLAN_REFUSED');
/**
 * Side-by-side spec §10 (plan D task D5): each release has its own verify plan, named by the release label of the API
 * folder this operator runs from. Any other location refuses, so a release never reads another release's plan.
 */
export function nativePlanPathForEntry(entryPath) {
 return `${NATIVE_PLAN_ROOT}/native-plan-${entryLabel(entryPath)}.json`;
}
/**
 * The operator's whole command line: nothing, or exactly `--credential-fd 3`, optionally followed by `--database-ahead`
 * (prestart.mjs passes it when the lock pins a database-ahead file on this release, side-by-side spec §5). The fixed
 * peer module (native-common106.mjs assertPeerActor106) admits only nothing or the credential pair, so it is handed
 * just that pair after this exact check.
 */
export function parseOperatorArguments(argv) {
 const credential=argv?.length>=2&&argv[0]==='--credential-fd'&&argv[1]==='3';
 if(Array.isArray(argv)&&argv.length===0)return {databaseAhead:false,peerArguments:[]};
 if(!credential||argv.length>3||(argv.length===3&&argv[2]!=='--database-ahead'))refuse('PREVIEW_NATIVE_INPUT_REFUSED');
 return {databaseAhead:argv.length===3,peerArguments:['--credential-fd','3']};
}
/**
 * Side-by-side spec §5 ("database ahead", plan D task D5): this release's root-owned database-ahead file
 * (database-ahead-<label>.json, root 0644), checked whole (database-ahead.mjs), written for this release and this
 * revision, naming the newer release's candidate API source manifest (read through readPublicArtifact: root-owned, its
 * sha256 checked), whose label and revision it names, and listing each step's bytes at its migration path exactly
 * (newerManifestMatches, the rule prestart's accept-ahead uses too). Returns what verify-native.ts needs: the file's
 * sha256, the newer label, the steps and the newer chain.
 * `io` replaces the two reads in unit tests.
 */
export async function readDatabaseAhead({label,plan},io={}) {
 const readFile=io.readFile??(path=>withPrivateBytes(path,{root:NATIVE_PLAN_ROOT,uid:0,mode:0o644,maxBytes:DATABASE_AHEAD_MAX_BYTES},raw=>({value:strictJson(raw),sha256:sha256(raw)})));
 const readManifest=io.readManifest??(file=>readPublicArtifact(file,'source'));
 const file=await readFile(databaseAheadPathForLabel(label));
 const ahead=validateDatabaseAheadFile(file.value);
 if(ahead.olderLabel!==label||ahead.olderSourceRevision!==plan.sourceRevision)refuse('PREVIEW_DATABASE_AHEAD_REFUSED');
 if(!newerManifestMatches(ahead,await readManifest(ahead.newerSourceManifest)))refuse('PREVIEW_DATABASE_AHEAD_REFUSED');
 return Object.freeze({fileSha256:file.sha256,newerLabel:ahead.newerLabel,accepted:ahead.steps,newerChain:ahead.newerChain});
}
/** This release's public plan + fixed private peer FD. No database URL, role, secret or env override argument. */
export async function runNativeOperator(argv=process.argv.slice(2)) {
 const {databaseAhead:aheadMode,peerArguments}=parseOperatorArguments(argv);
 const entry=fileURLToPath(import.meta.url),label=entryLabel(entry);
 const plan=validateNativePlan(await withPrivateBytes(nativePlanPathForEntry(entry),{root:NATIVE_PLAN_ROOT,uid:0,mode:0o644,maxBytes:32768},raw=>strictJson(raw)));
 // The plan is this release's own: its source root is the folder this operator runs from.
 if(plan.sourceRoot!==`${RELEASES_ROOT}/auth-dev-candidate-${label}-api`)refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 // Only the automatic restart's verify reads a database-ahead file (prestart.mjs); plan, publish and apply-and-plan never do.
 if(aheadMode&&plan.operation!=='verify')refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 const source=await readPublicArtifact(plan.sourceManifest,'source');
 if(source.uid!==0)refuse('PREVIEW_SOURCE_OWNER_REFUSED');
 await verifySourceManifest(source,{sourceRevision:plan.sourceRevision,sourceTree:plan.sourceTree,sourceRoot:plan.sourceRoot,role:'api',manifestSha256:plan.sourceManifest.sha256,execution:{entryUrl:import.meta.url,entryName:'native-operator.mjs',operatorManifestSha256:plan.operatorManifestSha256}});
 if(operatorManifestSha256(source)!==plan.operatorManifestSha256)refuse('PREVIEW_OPERATOR_SOURCE_REFUSED');
 const databaseAhead=aheadMode?await readDatabaseAhead({label,plan}):null;
 const engine=join(plan.sourceRoot,'dialectical-engine');
 // Owner rulings 2026-10-13: a plan with the owner's hosted-billing inputs composes with kit v3 (hosted rows); every
 // other plan with kit v2, exactly as before.
 const hosted=Object.hasOwn(plan,'hostedBilling');
 const [db,lineage,register,publisher,verify]=await Promise.all([tsImport(join(engine,'packages/db/src/index.ts'),import.meta.url),tsImport(join(engine,'packages/db/src/migration-lineage.ts'),import.meta.url),tsImport(join(engine,'packages/register/src/index.ts'),import.meta.url),tsImport(hosted?'./publish-register-v3.ts':'./publish-register-v2.ts',import.meta.url),tsImport('./verify-native.ts',import.meta.url)]);
 const migration=await lineage.loadMigrationPlan();
 return withActiveNativePool({publicPeerModule:'/opt/debateai-v3-preview/operator/recovery106-v1/native-common106.mjs',auth106Names:migration.manifest.cohorts.auth106,peerArguments},async pool=>{
  if(plan.operation==='apply-and-plan')await db.migrate(pool);
  const base=await publisher.readSealedSnapshot(pool,plan.selectedBaseRegisterVersion);
  if(base.snapshotSha256!==plan.selectedBaseSnapshotSha256)refuse('PREVIEW_SELECTED_BASE_DRIFT');
  // Kit v3 (side-by-side spec §13, Task S18): plan and publish compose from the ACTIVE settings version (the pointer, else
  // the current release's site version; no release yet = the rule below). Versions sealed above it are allowed.
  // Publish kit v2: plan and publish compose from the CURRENT published version (nothing sealed above the base but this publication's own replay).
  if(hosted&&(plan.operation==='plan'||plan.operation==='publish'))await publisher.assertBaseIsActive(pool,base.registerVersion,plan.publicationId);
  else if(plan.operation==='plan'||plan.operation==='publish')await publisher.assertBaseIsCurrent(pool,base.registerVersion,plan.publicationId);
  const runtimeObservedAt=plan.approval?.runtimeObservedAt??new Date().toISOString();
  const observation={nodeVersion:process.version,pnpmVersion:source.pnpmVersion,sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,operatorSha256:plan.operatorManifestSha256,observedAt:runtimeObservedAt};
  const rows=hosted?await publisher.buildPreviewSourceRowsV3(await register.loadBootstrapRegister(),observation,plan.hostedBilling,plan.checkerChoice,plan.roleRotation,plan.callConcurrency??null,plan.debateShape??null,plan.questionLanguage??null,plan.lengthGuidance??null,null,plan.lineUp??null,plan.answerSeats??null)
   :await publisher.buildPreviewSourceRowsV2(await register.loadBootstrapRegister(),{...observation},plan.checkerChoice,plan.roleRotation,plan.callConcurrency??null,plan.debateShape??null,plan.questionLanguage??null,plan.lengthGuidance??null,null,plan.lineUp??null,plan.answerSeats??null);
  const composition={sourceRows:rows,baseRows:base.rows,baseRegisterVersion:base.registerVersion,baseSnapshotSha256:base.snapshotSha256};
  const snapshot=hosted?publisher.composePreviewSnapshotV3(composition):publisher.composePreviewSnapshotV2(composition);
  const metadata=snapshotProposal({runtimeObservedAt,source,plan,snapshot});
  if(plan.operation==='plan'||plan.operation==='apply-and-plan')return metadata;
  if(!plan.approval)refuse('PREVIEW_SNAPSHOT_REVIEW_REQUIRED');
  const {runtimeObservedAt:approvedRuntimeObservedAt,publication,...approval}=plan.approval;
  if(typeof approvedRuntimeObservedAt!=='string')refuse('PREVIEW_RUNTIME_OBSERVATION_REQUIRED');
  // Only apply-and-plan applies SQL. publish and verify refuse a pending forward step before writing anything.
  if(plan.operation==='publish')await verify.refusePendingForwardSteps(pool);
  const input={publicationId:plan.publicationId,sourceRef:`preview-auth-dev-v1 ${source.sourceRevision}/${source.sourceTree}; operator sha256:${plan.operatorManifestSha256}`,snapshot,approval};
  const receipt=plan.operation!=='publish'?publication:hosted?await publisher.publishPreviewRegisterV3(pool,input):await publisher.publishPreviewRegisterV2(pool,input);
  return verify.verifyNativeState(pool,{sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,nativeSourceSha256:source.nativeSha256,publication:receipt},{databaseAhead});
 });
}
/** The exact refusal verify-native.ts gives a database that lacks a forward step of this source (any number of steps). */
const PENDING_FORWARD_STEP=/^PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP: not applied yet: \d{4}_[a-z0-9_]+\.sql(?:, \d{4}_[a-z0-9_]+\.sql){0,63}\. Verify never applies a migration; run the native operator with operation apply-and-plan first\.$/;
/** Fixed text of publish-register-v2.ts BASE_NOT_CURRENT, which v3 re-exports (both load lazily through tsx; a unit test pins the two equal). */
export const BASE_NOT_CURRENT_LINE='PREVIEW_REGISTER_BASE_NOT_CURRENT: a sealed register version exists above the selected base; plan again from the newest publication';
/** Fixed text of publish-register-base.ts BASE_NOT_ACTIVE, kit v3's base refusal (side-by-side spec §13; a unit test pins the two equal). */
export const BASE_NOT_ACTIVE_LINE='PREVIEW_REGISTER_BASE_NOT_ACTIVE: the selected base is not the active settings version; plan again from the active version';
/** The exact refusal verify-native.ts gives a database ahead of this source with no database-ahead file pinned (side-by-side spec §5). */
const DATABASE_AHEAD=/^PREVIEW_NATIVE_VERIFY_DATABASE_AHEAD: the database has steps this release does not know: \d{4}_[a-z0-9_]+\.sql(?:, \d{4}_[a-z0-9_]+\.sql){0,63}\. Pin the newer release's database-ahead file with prestart\.mjs accept-ahead first\.$/;
/**
 * Every failure stays opaque except a pending forward step (its line says to run apply-and-plan), a database ahead with
 * no pinned file (its line says to pin the newer release's database-ahead file) or a stale register base (its line says
 * to plan again: from the newest publication for kit v2, from the active settings version for kit v3).
 */
export function operatorRefusalLine(error){
 if(error?.code==='PREVIEW_REGISTER_BASE_NOT_CURRENT'&&error.message===BASE_NOT_CURRENT_LINE)return `${error.message}\n`;
 if(error?.code==='PREVIEW_REGISTER_BASE_NOT_ACTIVE'&&error.message===BASE_NOT_ACTIVE_LINE)return `${error.message}\n`;
 if(error?.code==='PREVIEW_NATIVE_VERIFY_DATABASE_AHEAD'&&typeof error.message==='string'&&DATABASE_AHEAD.test(error.message))return `${error.message}\n`;
 return error?.code==='PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP'&&typeof error.message==='string'&&PENDING_FORWARD_STEP.test(error.message)?`${error.message}\n`:'PREVIEW_NATIVE_OPERATION_REFUSED\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{process.stdout.write(`${JSON.stringify(await runNativeOperator())}\n`);}catch(error){process.stderr.write(operatorRefusalLine(error));process.exitCode=1;}}
