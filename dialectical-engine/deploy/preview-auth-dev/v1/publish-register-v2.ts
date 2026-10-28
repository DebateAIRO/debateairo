// Preview register publish kit v2.
//
// Plain words: v1 (publish-register.ts, unchanged but for S04's questionCheckPolicy, which the API reads at start-up) could
// only make ONE publication: a 67-row source on top of a 65-row base, adding exactly four fixed
// keys. From the live v9 (68 rows) it refuses, and it can never add a further key.
// v2 composes the next snapshot from the CURRENT published version plus the reviewed source rows:
// - a changed value or source reference shows in the delta as `changed`;
// - a key the source has and the base lacks shows as `added` (e.g. outboundMailPolicy);
// - a key the base has and the source lacks is refused, except the two base-owned policies
//   (staffAccessPolicy, internalAllowancePolicy), which are carried over unchanged.
// The source is closed by an exact, reviewed key list (not a row count): adding a key to the
// preview register means adding it here in the same reviewed change.
// Every v1 rule stays: canonical rows, base snapshot hash, billing off, no support or scorecard
// row, credential-free provider set, base-owned policies parsed.
// Multi-model (2026-10-10): the source provider set is the reviewed DeepInfra rows (preview-models.ts):
// preview:fixture-a and preview:fixture-b stay GLM (Z.AI) so runs pinned to the sealed two-GLM version
// keep resolving, plus one ref per new model with its own maker. requiredDistinctMakers stays 1 (a missing
// second maker serves with marks, never blocks). The answer writer stays fixture-a (GLM). By default the
// checker stays fixture-b (GLM), as in the sealed two-GLM version: a version with five refs can then be
// published while the gate has only GLM switched on. Moving the checker (and the story checker that
// follows it, story-policy.ts) to the DeepSeek ref is a separate, explicit choice, `checker: 'deepseek'`,
// which refuses unless the operator also states `deepseekEnabledOnGate: true` (the gate's GO switches
// DeepSeek on; the app refuses an ask whose role model the gate has not switched on). The base may be the
// sealed two-GLM pair (or its historical shapes) or a version this kit already published.
// PR B (2026-10-10): the source set also carries Anthropic's reviewed ref (preview:claude-haiku-5-5,
// maker Anthropic, adapter kind anthropic-messages-http). A base may be any reviewed set: DeepInfra's
// refs plus any other reviewed providers' refs, in register order.
// Role rotation (spec 2026-10-11): the source also carries the answerRoleRotationPolicy row, enabled, so the
// preview rotates the four roles over each debate's own panel. A base without it (the live v9) shows it as `added`.
// The operator's `roleRotation: 'off'` publishes the same row disabled (the preview's rollback: a republish).
// Parallel calls (spec 2026-10-12 §3.1): the operator MAY also hand the kit a callConcurrencyPolicy; only then does
// the source carry that row (an optional key, PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2). Left out (the default), the
// source has no such row: a base without it stays without it (one call at a time per debate, as before), and a base
// that holds it keeps it unchanged (controller ruling R19: the composer carries it from the base, like a base-owned row).
// Debate shape (spec 2026-10-12 §3.1): likewise optional; the source carries a debateShapePolicy row only when the operator hands one.
// Question language (spec 2026-10-13): likewise optional; the source carries a questionLanguagePolicy row only when the operator hands one.
// Length guidance (spec 2026-10-15, LG-C): likewise optional; the source carries a lengthGuidancePolicy row only when the operator hands one
// (the eighth builder argument), re-parsed by the register's own parser; a carried base row is re-parsed too. No 'off' word: the rollback is
// a version without the row.
// Line-up and answer seats (side-by-side spec §13, addition D23; owner 2026-10-22): the operator's plan may name the preview's
// line-up (`lineUp`: the two rosters and the thinking-level table, the optional previewLineUpPolicy row, D12), the tenth builder
// argument, checked by the providers' line-up parser before any row is built; a carried base row is re-parsed by the register's
// own reader (R19: a plan without it keeps the current one). The plan may also name the four answer seats (`answerSeats`, the
// eleventh argument): writer and checker, and optionally the storyteller and the story checker (which otherwise follow them),
// each a reviewed preview ref. Without seats the refs are today's, byte for byte; seats and a checker choice together refuse.
// The delta now carries the old and new canonical values, so the owner reviews values, not hashes;
// deltaSha256 binds that exact document and the approval binds deltaSha256.
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  canonicalRegisterJson, parseCanonicalRegisterJson, computeRegisterSnapshotSha256,
  parseRegisterVersionText, buildConfiguredProviderSetSealedRow, buildConfiguredProviderSetDeploymentRow,
  PASSWORD_RESET_POLICY_REGISTER_ROW, BACKUP_EMAIL_POLICY_REGISTER_ROW, MFA_RECOVERY_POLICY_REGISTER_ROW,
  answerRoleRotationPolicyRow, callConcurrencyPolicyRow, callConcurrencyPolicyFromValue, CALL_CONCURRENCY_POLICY_ROW_KEY,
  DEBATE_SHAPE_POLICY_ROW_KEY, debateShapePolicyRow, debateShapePolicyStartValues, parseDebateShapePolicy, debateShapeInForce, type DebateShapePolicy,
  QUESTION_LANGUAGE_POLICY_ROW_KEY, questionLanguagePolicyRow, parseQuestionLanguagePolicy, type QuestionLanguagePolicy,
  LENGTH_GUIDANCE_POLICY_ROW_KEY, lengthGuidancePolicyRow, parseLengthGuidancePolicy, type LengthGuidancePolicy,
  ENGINE_CONTRACT_HASH_ROW_KEY, parseEngineContractHash, ENGINE_VERSION_POLICY_ROW_KEY, engineVersionPolicyRow,
  engineVersionPolicyStartValues, parseEngineVersionPolicy, type EngineVersionPolicy,
  PREVIEW_LINE_UP_POLICY_ROW_KEY, previewLineUpPolicyFromValue, previewLineUpPolicyRow,
  type BootstrapRegister, type CallConcurrencyPolicy, type RegisterPublicationRow
} from '@debateai/register';
import { buildDevelopmentDeploymentRegisterPublicationRows } from '../../../apps/runner/src/dev-deployment-register.js';
import { resolveEngineRunnerSettings } from '../../../apps/runner/src/engine-boot.js';
import { engineContractHash } from '../../../apps/runner/src/engine-contracts.js';
import { assertQuestionLanguagePolicyBootable } from '../../../apps/api/src/question-language/boot.js';
import { parseProviderDiscoveryTargets, parsePreviewLineUp, type PreviewLineUp } from '@debateai/providers';
import { PREVIEW_GLM_PROVIDER_REFS, assertPreviewProviderTargets } from '../../../packages/providers/src/preview-test.js';
import { PREVIEW_MODEL_ROWS, PREVIEW_REVIEWED_PROVIDER_REFS, previewModelRowForRef, previewRefsAreReviewedSet, previewTargetJsonRow } from '../../../packages/providers/src/preview-models.js';
import { staffAccessPolicyFromValue } from '../../../packages/register/src/staff-access-policy.js';
import { internalAllowancePolicyFromValue } from '../../../packages/register/src/internal-allowance-policy.js';
import { publishPreviewRegister, type RuntimeObservation, type PreviewSnapshot } from './publish-register.js';
/** The sealed-snapshot reader is unchanged; the native operator reads it through this module. */
export { readSealedSnapshot } from './publish-register.js';

const hash = (value:string) => createHash('sha256').update(value).digest('hex');
const fail = (rule?:string):never => { throw new TypeError(rule?`PREVIEW_REGISTER_SNAPSHOT_REFUSED: ${rule}`:'PREVIEW_REGISTER_SNAPSHOT_REFUSED'); };
/** The one register refusal the native operator prints in words: the operator can act on it (plan again from the newest publication). */
export const BASE_NOT_CURRENT = 'PREVIEW_REGISTER_BASE_NOT_CURRENT: a sealed register version exists above the selected base; plan again from the newest publication' as const;
export class PreviewRegisterBaseNotCurrentError extends TypeError { readonly code='PREVIEW_REGISTER_BASE_NOT_CURRENT'; constructor(){ super(BASE_NOT_CURRENT); } }
const COMPOSER = 'preview-register-composer-v2' as const;
/** Base-owned rows: never built from source, carried from the base version unchanged. */
export const PREVIEW_BASE_OWNED_KEYS = Object.freeze(['internalAllowancePolicy','staffAccessPolicy'] as const);
const FORBIDDEN_KEYS = Object.freeze(['modelScorecard','supportActivation']);
/**
 * The reviewed source closure: exactly the keys buildPreviewSourceRowsV2 must produce (69: the 67 at
 * dev 5109a5501 plus role rotation — the 66 of dev b75e4c294 and answerRoleRotationPolicy — mapContractHash, the
 * debate shape's sealed map prompts (P2b Task 6), and engineContractHash, engine 2's seal (engine redesign R1d Task 4);
 * the same keys the live v9 holds minus the two base-owned ones, plus those three rows once they are published).
 * A new register row reaches the preview only by being added here.
 */
export const PREVIEW_SOURCE_ROW_KEYS_V2 = Object.freeze([
  'acceptanceOrganCostBounds','admissionPolicy','answerRoleRotationPolicy','auditSourceIpKdfPolicy','backupEmailVerificationPolicy','billingPlans','billingPolicy',
  'branchFreezeEpsilon','candidateConfidenceBand','channelPolicy','claimTypeCompositionMap','composerContractHash','compositionBundleBudget',
  'configuredProviderSet','conformanceContractHash','consumerRecoveryPolicy','costEnvelopePolicy','countryPolicy','disagreementQuantity',
  'disagreementThreshold','dispersionScale','downgradeBands','engineContractHash','envelopeFormulaInputs','evaluatorCallBound','evaluatorLoopMaxRounds',
  'evaluatorRoleRef','globalStopDelta','hiddenNodeScoreThreshold','judgeContractHash','judgementSelectionPolicy','livenessPolicy',
  'mapContractHash','mfaPolicy','mfaRecoveryPolicy','nodeRuntimeVersion','panelDiscoveryPolicy','passwordPolicy','passwordResetPolicy',
  'pnpmVersion','postgresMajorVersion','productRolePolicy','propagationContractHash','providerFamilyMap','publicationCheckPolicy','questionCheckPolicy',
  'rateLimitPolicy','recoveryPolicy','repeatedFamilyMultiplier','riskTier','runDeathPolicy','scoringOperator',
  'serveContractHash','sessionPolicy','storyCheckerCallBound','storyCheckerRoleRef','storyLoopMaxRounds','storyMaterialBudget',
  'storytellerCallBound','storytellerRoleRef','synthesizerCallBound','synthesizerRoleRef','taxAuthorities','typescriptVersion',
  'verdictHighCut','verdictLowCut','verdictMarginGamma','verificationPolicy','vllmImageDigest','wayOfKnowingCeiling'
] as const);
/**
 * Reviewed keys the source carries only when the operator supplies them (spec 2026-10-12 §3.1): never required,
 * never in PREVIEW_SOURCE_ROW_KEYS_V2's exact closure. A base row with such a key that the source leaves out is
 * carried from the base unchanged (R19: a plan that does not name the value keeps the current one); it is never dropped.
 */
export const PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2 = Object.freeze([CALL_CONCURRENCY_POLICY_ROW_KEY, DEBATE_SHAPE_POLICY_ROW_KEY, QUESTION_LANGUAGE_POLICY_ROW_KEY, LENGTH_GUIDANCE_POLICY_ROW_KEY, ENGINE_VERSION_POLICY_ROW_KEY, PREVIEW_LINE_UP_POLICY_ROW_KEY] as const);

/** The answer writer: GLM (fixture-a), always. Story roles follow the writer and checker (story-policy.ts). */
export const PREVIEW_SYNTHESIZER_ROLE_REF = 'preview:fixture-a' as const;
/** The default checker: GLM's second ref (fixture-b), the value the sealed two-GLM version holds. */
export const PREVIEW_EVALUATOR_ROLE_REF = 'preview:fixture-b' as const;
/** The checker after the explicit `checker: 'deepseek'` choice: DeepSeek, a different maker from the writer. */
export const PREVIEW_DEEPSEEK_CHECKER_ROLE_REF = 'preview:deepseek-v4-1-flash' as const;
/**
 * Which model checks the answer. Omitted means `{checker:'glm'}`. `{checker:'deepseek'}` must also say
 * `deepseekEnabledOnGate: true` (exactly): the operator's statement that the gate's GO switches DeepSeek on.
 */
export type PreviewCheckerChoice = Readonly<{checker:'glm'}> | Readonly<{checker:'deepseek';deepseekEnabledOnGate:true}>;
/** The checker's provider ref for a choice; anything but the two reviewed shapes refuses by its own rule. */
export function previewCheckerRoleRef(choice:unknown={checker:'glm'}):string {
  if(choice===null||typeof choice!=='object'||Object.getPrototypeOf(choice)!==Object.prototype)fail('checker-choice');
  const value=choice as Record<string,unknown>,keys=Object.keys(value).sort().join(',');
  if(value.checker==='glm'&&keys==='checker')return PREVIEW_EVALUATOR_ROLE_REF;
  if(value.checker!=='deepseek'||!['checker','checker,deepseekEnabledOnGate'].includes(keys))fail('checker-choice');
  if(value.deepseekEnabledOnGate!==true)fail('checker-deepseek-not-enabled-on-gate');
  return PREVIEW_DEEPSEEK_CHECKER_ROLE_REF;
}

/**
 * The four answer seats an operator's plan may choose (side-by-side spec §13, addition D23; owner 2026-10-22): `writer`
 * (synthesizerRoleRef) and `checker` (evaluatorRoleRef), and optionally `storyteller` (storytellerRoleRef, else the writer's)
 * and `storyChecker` (storyCheckerRoleRef, else the checker's), as story-policy.ts pairs them. Each is a reviewed preview ref
 * (PREVIEW_REVIEWED_PROVIDER_REFS): the source's provider set holds exactly those, so a seat is always served by a configured
 * identity; whether the live gates switch its model on is activation's check (addition D21), not the kit's.
 */
export type PreviewAnswerSeatsChoice = Readonly<{ writer: string; checker: string; storyteller?: string; storyChecker?: string }>;
/** The four sealed seat refs, in register row names. */
export type PreviewAnswerSeatRefs = Readonly<{ synthesizerRoleRef: string; evaluatorRoleRef: string; storytellerRoleRef: string; storyCheckerRoleRef: string }>;
const ANSWER_SEAT_KEYS = Object.freeze(['checker','storyChecker','storyteller','writer']);
/**
 * Addition D23: the seat refs for a plan. No seats (undefined or null) = today's refs, byte for byte: the writer fixture-a and
 * the checker from `checker` (default GLM), the story seats following them. Seats are one way to set the checker, so seats
 * with any checker choice refuse (answer-seats-with-checker-choice); a malformed choice refuses as answer-seats-choice, a
 * ref outside the reviewed rows as answer-seat-unreviewed, a writer seated as its own checker as
 * answer-seats-writer-is-checker (Ruling R27b) and a storyteller seated as its own story checker as
 * answer-seats-storyteller-is-story-checker (Ruling R28: the effective seats, `storyteller ?? writer` against
 * `storyChecker ?? checker`), each before any row is built.
 */
export function previewAnswerSeatRefs(seats:unknown, checker?:unknown):PreviewAnswerSeatRefs {
  if(seats===undefined||seats===null){
    const synthesizerRoleRef=PREVIEW_SYNTHESIZER_ROLE_REF,evaluatorRoleRef=previewCheckerRoleRef(checker);
    return Object.freeze({synthesizerRoleRef,evaluatorRoleRef,storytellerRoleRef:synthesizerRoleRef,storyCheckerRoleRef:evaluatorRoleRef});
  }
  if(typeof seats!=='object'||Object.getPrototypeOf(seats)!==Object.prototype)fail('answer-seats-choice');
  const value=seats as Record<string,unknown>,keys=Object.keys(value);
  if(!Object.hasOwn(value,'writer')||!Object.hasOwn(value,'checker')||keys.some(key=>!ANSWER_SEAT_KEYS.includes(key))
    ||keys.some(key=>typeof value[key]!=='string'))fail('answer-seats-choice');
  if(keys.some(key=>!(PREVIEW_REVIEWED_PROVIDER_REFS as readonly string[]).includes(value[key] as string)))fail('answer-seat-unreviewed');
  // Ruling R27b (SA9 fix round 1): one AI must not check its own answer.
  if(value.writer===value.checker)fail('answer-seats-writer-is-checker');
  const synthesizerRoleRef=value.writer as string,evaluatorRoleRef=value.checker as string;
  const storytellerRoleRef=(value.storyteller as string|undefined)??synthesizerRoleRef,storyCheckerRoleRef=(value.storyChecker as string|undefined)??evaluatorRoleRef;
  // Ruling R28 (final fix wave F3): nor its own story — the effective story seats, as story-policy.ts pairs them.
  if(storytellerRoleRef===storyCheckerRoleRef)fail('answer-seats-storyteller-is-story-checker');
  if(checker!==undefined)fail('answer-seats-with-checker-choice');
  return Object.freeze({synthesizerRoleRef,evaluatorRoleRef,storytellerRoleRef,storyCheckerRoleRef});
}
/**
 * Addition D23: the two story seat rows set to the chosen refs. The story builder seals the storyteller to the writer and the
 * story checker to the checker (story-policy.ts); a story seat chosen on its own replaces only that row's providerRef (same
 * kind, same source reference, canonical JSON). A row already holding its ref is returned unchanged, so no seats (or seats
 * the story rows already follow) keep every byte. Kit v3 applies the same to the hosted builder's story rows it compares.
 */
export function previewStorySeatRows<T extends Readonly<{rowKey:string;valueJsonText:string;sourceRef:string}>>(rows:readonly T[], refs:PreviewAnswerSeatRefs):T[] {
  const wanted:Readonly<Record<string,string>>={storytellerRoleRef:refs.storytellerRoleRef,storyCheckerRoleRef:refs.storyCheckerRoleRef};
  return rows.map(row=>{
    if(!Object.hasOwn(wanted,row.rowKey))return row;
    const value=JSON.parse(row.valueJsonText) as Record<string,unknown>;
    if(value.providerRef===wanted[row.rowKey])return row;
    return {...row,valueJsonText:parseCanonicalRegisterJson(Buffer.from(JSON.stringify({...value,providerRef:wanted[row.rowKey]}),'utf8'))};
  });
}
/**
 * Addition D12, D23: the operator's optional line-up as its row (null or undefined: no row). The providers' parser checks the
 * plan value whole first (exactly the three members; reviewed, unique ids; the maker rule; each level on its AI's menu), so a
 * refusal is that parser's own message (PREVIEW_LINE_UP_POLICY_INVALID:<detail> or PREVIEW_THINKING_LEVELS_INVALID:<detail>).
 */
export function previewLineUpRows(lineUp:unknown):readonly RegisterPublicationRow[] {
  if(lineUp===undefined||lineUp===null)return [];
  return [previewLineUpPolicyRow(parsePreviewLineUp(lineUp),'side-by-side spec §13 addition D12, D23 (the operator\'s plan lineUp); owner 2026-10-22')];
}

/**
 * Role rotation on the preview (spec 2026-10-11, Deploying): 'on' (the default) publishes the row enabled, 'off'
 * publishes it disabled. The row stays present either way, so switching rotation off (the preview's rollback) is a
 * republish with 'off', never a code change, and the base-row-dropped refusal is never hit.
 */
export type PreviewRoleRotationChoice = 'on' | 'off';
/** The row's enabled flag for a choice; anything but the two exact words refuses by its own rule. */
export function previewRoleRotationEnabled(choice:unknown='on'):boolean {
  if(choice!=='on'&&choice!=='off')fail('role-rotation-choice');
  return choice==='on';
}

const sameKeys = (actual:readonly string[], expected:readonly string[]) =>
  actual.length===expected.length && [...actual].sort().join('\0')===[...expected].sort().join('\0');
/** The source closure: exactly the reviewed key list, plus at most one of each reviewed optional key. */
const sourceKeysReviewed = (keys:readonly string[]) => {
  const optional=PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2 as readonly string[];
  return new Set(keys).size===keys.length&&sameKeys(keys.filter(key=>!optional.includes(key)),PREVIEW_SOURCE_ROW_KEYS_V2);
};

/**
 * v1's source build (same runtime gate, same provider panel), closed by the reviewed key list instead of a count.
 * `checker` is the reviewed checker choice (default GLM) and `roleRotation` the operator's rotation switch
 * (default 'on'); `callConcurrency` the operator's optional parallel-calls policy (default null: no row, one call at
 * a time); `debateShape` the operator's optional debate shape policy (default null: no row, today's shape; 'off': the
 * row published disabled, the start values with enabled false — P2b Task 6); `questionLanguage` the operator's optional
 * question-language policy (default null: no row, the code's start values; the owners switch the fast check off with
 * `fastCheck: null`, P2L Task 12); `lengthGuidance` the owners' optional length guidance (default null: no row; LG-C);
 * `engineVersion` the operator's optional engine row (default null: no row, engine 1; 'off': the start
 * values with enabled false, so the row stays and a runner still finishes the engine-2 debates admitted before; engine redesign
 * R1d), checked by the register's own parser (ENGINE_VERSION_POLICY_INVALID); `lineUp` the operator's optional preview line-up
 * (default null: no row, the env's line-up; addition D12, D23), checked by the providers' line-up parser; `answerSeats` the
 * operator's optional four seats (default null: today's refs; with a checker choice it refuses, previewAnswerSeatRefs).
 * The line-up and the seats are checked first, then the rest; all before anything else is built (each policy by the register's own parser, CALL_CONCURRENCY_POLICY_INVALID,
 * DEBATE_SHAPE_POLICY_INVALID, QUESTION_LANGUAGE_POLICY_INVALID or LENGTH_GUIDANCE_POLICY_INVALID).
 */
export async function buildPreviewSourceRowsV2(bootstrap:BootstrapRegister, runtime:RuntimeObservation, checker?:PreviewCheckerChoice, roleRotation:PreviewRoleRotationChoice='on', callConcurrency:CallConcurrencyPolicy|null=null, debateShape:DebateShapePolicy|'off'|null=null, questionLanguage:QuestionLanguagePolicy|null=null, lengthGuidance:LengthGuidancePolicy|null=null, engineVersion:EngineVersionPolicy|'off'|null=null, lineUp:PreviewLineUp|null=null, answerSeats:PreviewAnswerSeatsChoice|null=null):Promise<readonly RegisterPublicationRow[]> {
  // Addition D23: the plan's line-up and seats, before anything else (each refusal its own parser's or rule's).
  const lineUpRows=previewLineUpRows(lineUp);
  const seats=previewAnswerSeatRefs(answerSeats,checker);
  const rotationEnabled=previewRoleRotationEnabled(roleRotation);
  const concurrencyRows=callConcurrency===null?[]:[callConcurrencyPolicyRow(callConcurrency,'docs/superpowers/specs/2026-10-12-parallel-calls-design.md; owner 2026-10-12')];
  // Debate shape (P2b Task 6): 'off' = the START VALUES with enabled false (this function never sees the base), so the
  // row stays present, disabled (the preview's rollback): the API asks today's shape, the runner still finishes the
  // debates admitted with it, and the base-row-dropped refusal is never hit.
  const shapeRows=debateShape===null?[]:[debateShapePolicyRow(debateShape==='off'?{...debateShapePolicyStartValues(),enabled:false}:debateShape,'docs/superpowers/specs/2026-10-12-debate-shape-design.md; owner 2026-10-12')];
  // Question language (P2L Task 12): the register's own parser refuses a malformed policy here, before any row is built.
  const languageRows=questionLanguage===null?[]:[questionLanguagePolicyRow(questionLanguage,'question-language spec 2026-10-13 (owner rulings L1-L8); owner 2026-10-13')];
  // Length guidance (LG-C): the register's own parser refuses a malformed policy here, before any row is built.
  const lengthRows=lengthGuidance===null?[]:[lengthGuidancePolicyRow(lengthGuidance,'length guidance spec 2026-10-15 (owner rulings L1-L36); owner 2026-10-15')];
  // Engine redesign (R1d; INTERFACE §1.6): 'off' = the START VALUES with enabled false (this function never sees the base),
  // so the row stays present, disabled: the API admits engine 1 and a runner still finishes the engine-2 debates admitted
  // before. The register's own parser refuses a malformed policy here, before any row is built.
  const engineRows=engineVersion===null?[]:[engineVersionPolicyRow(engineVersion==='off'?{...engineVersionPolicyStartValues(),enabled:false}:engineVersion,'docs/superpowers/specs/2026-10-15-engine-redesign-design.md; owner 2026-10-15')];
  if(runtime.nodeVersion!=='v26.8.2'||runtime.pnpmVersion!=='11.20.0'||!/^([0-9a-f]{40})$/.test(runtime.sourceRevision)
    ||!/^([0-9a-f]{40})$/.test(runtime.sourceTree)||!/^([0-9a-f]{64})$/.test(runtime.operatorSha256)
    ||!Number.isFinite(Date.parse(runtime.observedAt))||bootstrap.values.pnpmVersion!==runtime.pnpmVersion||bootstrap.values.postgresMajorVersion!=='18')fail();
  // PR B: each ref carries its row's adapter kind (Claude Haiku: the native Anthropic Messages adapter).
  const configuredProviders=PREVIEW_REVIEWED_PROVIDER_REFS.map(providerRef=>({providerRef,adapterKind:previewModelRowForRef(providerRef)!.adapterKind,maker:previewModelRowForRef(providerRef)!.maker}));
  const targetsJson=JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow));
  const targets=parseProviderDiscoveryTargets(targetsJson,configuredProviders);
  // Validation only; composition never contacts an authority or declares health.
  const models=PREVIEW_MODEL_ROWS.map(row=>row.model);
  assertPreviewProviderTargets({free_model_ids:models,premium_model_ids:models},targets);
  const panel={configuredProviders,requiredDistinctMakers:1,healthyProviderRefs:[],targets,targetsJson};
  const projected:BootstrapRegister={...bootstrap,values:{...bootstrap.values,nodeRuntimeVersion:runtime.nodeVersion},resolution:{...bootstrap.resolution,
    nodeRuntimeVersion:`preview-auth-dev-v1 actual Node ${runtime.nodeVersion}; measured ${runtime.observedAt}; source ${runtime.sourceRevision}/${runtime.sourceTree}; operator sha256:${runtime.operatorSha256}`}};
  // Addition D23: the writer and checker seal the synthesis rows and, by default, the two story seats; a story seat chosen
  // on its own then replaces only its row's ref.
  const rows=[...previewStorySeatRows(await buildDevelopmentDeploymentRegisterPublicationRows(projected,panel,{synthesizerRoleRef:seats.synthesizerRoleRef,evaluatorRoleRef:seats.evaluatorRoleRef},'local'),seats),
    ...[PASSWORD_RESET_POLICY_REGISTER_ROW,BACKUP_EMAIL_POLICY_REGISTER_ROW,MFA_RECOVERY_POLICY_REGISTER_ROW].map(row=>({rowKey:row.rowKey,valueJsonText:canonicalRegisterJson(row.valueAst),sourceRef:row.sourceRef})),
    // Role rotation (spec 2026-10-11): the preview rotates the four roles over each debate's own panel, unless the
    // operator published with roleRotation 'off' (the row stays, disabled: behaviour is then today's).
    answerRoleRotationPolicyRow(rotationEnabled,'docs/superpowers/specs/2026-10-11-role-rotation-design.md; owner 2026-10-10'),
    // Parallel calls (spec 2026-10-12 §3.1): only when the operator supplied a policy.
    ...concurrencyRows,
    // Debate shape (spec 2026-10-12 §3.1): only when the operator supplied a policy.
    ...shapeRows,
    // Question language (spec 2026-10-13): only when the operator supplied a policy.
    ...languageRows,
    // Length guidance (LG-C, spec 2026-10-15 §3.1): only when the operator supplied a policy.
    ...lengthRows,
    // Engine redesign (spec 2026-10-15 §3): only when the operator supplied a policy (or 'off').
    ...engineRows,
    // Line-up (side-by-side spec §13, addition D12, D23): only when the operator's plan names one.
    ...lineUpRows];
  if(!sourceKeysReviewed(rows.map(row=>row.rowKey)))fail('source-key-list');
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
const sameRefs = (providers:readonly any[], refs:readonly string[]) =>
  providers.length===refs.length && providers.every((p:any,i:number)=>p?.providerRef===refs[i]);
/**
 * Provider-set rules. Source: exactly the reviewed refs in order, each with its row's maker, one
 * maker required. Base: the sealed two-GLM pair (sealed or vetted historical schema), or the
 * reviewed set this kit publishes.
 */
function assertProviderRows(rows:ReadonlyMap<string,RegisterPublicationRow>, side:'source'|'base') {
  if(JSON.parse(rows.get('billingPolicy')?.valueJsonText??'null')?.enabled!==false)fail();
  const providers=JSON.parse(rows.get('configuredProviderSet')?.valueJsonText??'null');
  if(!credentialFree(providers)||!Array.isArray(providers?.providers))fail();
  if(side==='source'){
    if(!sameRefs(providers.providers,PREVIEW_REVIEWED_PROVIDER_REFS)||providers.requiredDistinctMakers!==1
      ||providers.providers.some((p:any)=>Object.keys(p).sort().join(',')!=='adapterKind,maker,providerRef'||p.adapterKind!==previewModelRowForRef(p.providerRef)?.adapterKind||p.maker!==previewModelRowForRef(p.providerRef)?.maker))fail();
    return;
  }
  // The base may be the sealed two-GLM pair or any reviewed set (DeepInfra's refs plus any other
  // reviewed providers', in order): a version published before a provider's gate existed qualifies.
  if(!sameRefs(providers.providers,PREVIEW_GLM_PROVIDER_REFS)&&!previewRefsAreReviewedSet(providers.providers.map((p:any)=>p?.providerRef)))fail();
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

/**
 * P2L final review I4 (as kit v3, ruling L-KIT): the API's question-language boot step (main.ts "question-language")
 * asked of the composed rows (source and carried alike) before anything is sealed, only when they hold the debate
 * shape in force (no shape row, or `enabled: false`: the API never reads the row at boot, so it is parsed only). The
 * preview route is the one the preview API takes (L-ROUTE: never hosted): an owner text carrying a frame token (the
 * providers' one rule) or a fast-check model the preview's Anthropic gate does not review refuses by the API's own code.
 */
function assertQuestionLanguageBootableV2(rows:readonly RegisterPublicationRow[]):void {
  const map=new Map(rows.map(row=>[row.rowKey,row]));
  const language=map.get(QUESTION_LANGUAGE_POLICY_ROW_KEY),shape=map.get(DEBATE_SHAPE_POLICY_ROW_KEY);
  if(language===undefined||shape===undefined||debateShapeInForce(parseDebateShapePolicy(JSON.parse(shape.valueJsonText)))===null)return;
  assertQuestionLanguagePolicyBootable(parseQuestionLanguagePolicy(JSON.parse(language.valueJsonText)),
    {kind:'PREVIEW',fetch:(async()=>fail('question-language-boot-check-never-calls')) as typeof fetch});
}

/**
 * Engine redesign (R1d; INTERFACE §1.5, §2.3): the runner's own engine boot read, asked of composed rows (source and
 * carried alike) before anything is sealed. No engineVersionPolicy row = engine 1: neither the length row nor the seal is
 * read. A row, enabled or not, needs the length row and this code's engineContractHash, or it refuses by the runner's own
 * code (ENGINE_REQUIRES_LENGTH_POLICY / ENGINE_CONTRACT_HASH_UNSEALED / ENGINE_CONTRACT_HASH_MISMATCH). Kit v3 asks it too.
 */
export function assertPreviewEngineBootRows(rows:readonly RegisterPublicationRow[]):void {
  const map=new Map(rows.map(row=>[row.rowKey,row]));
  const engine=map.get(ENGINE_VERSION_POLICY_ROW_KEY);
  if(engine===undefined)return;
  const seal=map.get(ENGINE_CONTRACT_HASH_ROW_KEY);
  const lengthPolicyPresent=map.has(LENGTH_GUIDANCE_POLICY_ROW_KEY);
  // As the runner's boot read (readEngineRunnerSettings): the seal is parsed only beside the length row, so a kit
  // refusal is the runner's own code (Task 8 review 1).
  resolveEngineRunnerSettings({policy:parseEngineVersionPolicy(JSON.parse(engine.valueJsonText)),
    lengthPolicyPresent,
    engineContractHash:!lengthPolicyPresent||seal===undefined?null:parseEngineContractHash(JSON.parse(seal.valueJsonText)),
    codeEngineContractHash:engineContractHash()});
}

export function composePreviewSnapshotV2(input:Readonly<{sourceRows:readonly RegisterPublicationRow[];baseRows:readonly RegisterPublicationRow[];baseRegisterVersion:string;baseSnapshotSha256:string}>) {
  const source=canonicalRows(input.sourceRows),base=canonicalRows(input.baseRows);
  const baseRegisterVersion=parseRegisterVersionText(input.baseRegisterVersion);
  if(computeRegisterSnapshotSha256(base)!==input.baseSnapshotSha256)fail('base-snapshot');
  const sourceMap=new Map(source.map(row=>[row.rowKey,row])),baseMap=new Map(base.map(row=>[row.rowKey,row]));
  const owned=PREVIEW_BASE_OWNED_KEYS as readonly string[];
  // Each rule refuses on its own, before the key list, so every one is separately observable.
  if([...sourceMap.keys(),...baseMap.keys()].some(key=>FORBIDDEN_KEYS.includes(key)))fail('support-or-scorecard-row');
  if(source.some(row=>owned.includes(row.rowKey)))fail('base-owned-row-in-source');
  if(owned.some(key=>!baseMap.has(key)))fail('base-owned-row-missing');
  if(!sourceKeysReviewed(source.map(row=>row.rowKey)))fail('source-key-list');
  // An optional row the source leaves out keeps the base's value (R19), checked by its own parser, never in the delta.
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
  // Any other base row the source no longer builds is never dropped silently.
  if(base.some(row=>!sourceMap.has(row.rowKey)&&!owned.includes(row.rowKey)&&!optional.includes(row.rowKey)))fail('base-row-dropped');
  assertProviderRows(sourceMap,'source');
  assertProviderRows(baseMap,'base');
  const staff=baseMap.get('staffAccessPolicy')!,internal=baseMap.get('internalAllowancePolicy')!;
  staffAccessPolicyFromValue(JSON.parse(staff.valueJsonText),staff.sourceRef);
  internalAllowancePolicyFromValue(JSON.parse(internal.valueJsonText),internal.sourceRef);
  const rows=canonicalRows([...source,...owned.map(key=>baseMap.get(key)!),...carried]);
  assertQuestionLanguageBootableV2(rows);
  assertPreviewEngineBootRows(rows);
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
  if(!Array.isArray(result.rows)||result.rows.length>1||result.rows.some(row=>row.publication_id!==publicationId))throw new PreviewRegisterBaseNotCurrentError();
}

/** v1's publication path unchanged (approval must equal the recomposed snapshot; base re-read; receipt re-read), after the currency check. */
export async function publishPreviewRegisterV2(pool:Pool,input:Readonly<{publicationId:string;sourceRef:string;snapshot:PreviewSnapshotV2;approval:Readonly<{baseRegisterVersion:string;baseSnapshotSha256:string;snapshotSha256:string;deltaSha256:string}>}>) {
  if(input.snapshot?.composer!==COMPOSER)fail();
  await assertBaseIsCurrent(pool,input.snapshot.baseRegisterVersion,input.publicationId);
  const receipt=await publishPreviewRegister(pool,{...input,snapshot:input.snapshot as unknown as PreviewSnapshot});
  // The SQL accepts any sealed base and the check above ran outside its lock: after the write, the new
  // version must still be the only one above the base (a concurrent publication is reported, not hidden).
  await assertBaseIsCurrent(pool,input.snapshot.baseRegisterVersion,input.publicationId);
  return receipt;
}
