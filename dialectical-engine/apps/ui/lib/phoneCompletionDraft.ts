import { AskRequestSchema, AskRoomQuerySchema, DepthParamsSchema, ContractHttpError, type ContractClient } from '@debateai/contract';
export const PHONE_COMPLETION_DRAFT_KEY = 'debateai.phone-completion-draft.v1';
export const PHONE_COMPLETION_DRAFT_MS = 15 * 60_000;
const MAX_BYTES = 32_768;
export type PhoneDraftForm = {
    topic: string; planTier: 'free' | 'premium'; optionsOpen: boolean;
    depthMode: 'fixed' | 'adaptive'; scrutiny: 'standard' | 'deep' | 'exhaustive';
    depth: number; answerLength: 'short' | 'standard' | 'detailed';
    riskTier: string; riskTierWasEdited: boolean; budgetTier: 'low' | 'medium' | 'high';
    decisionScope: string; asOf: string;
};
export type SubmittedPhoneDraft = { topic: string; config: Record<string, unknown>; query: {
    plan_tier: 'free' | 'premium'; composition_budget_tier: 'low' | 'medium' | 'high'; depth: number;
    depth_mode?: 'fixed' | 'adaptive'; scrutiny?: 'standard' | 'deep' | 'exhaustive'; answer_length?: 'short' | 'standard' | 'detailed';
} };
export type PhoneCompletionDraft = { version: 1; id: string; owner: string; created_at: number; expires_at: number; phase: 'phone-required' | 'updated' | 'draft'; form: PhoneDraftForm; submitted: SubmittedPhoneDraft };
let revision = 0;
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: unknown, names: string[]): v is Record<string, unknown> => plain(v) && Object.keys(v).length === names.length && names.every(name => Object.hasOwn(v, name));
const oneOf = (value: unknown, values: readonly unknown[]) => values.includes(value);
const ASK_CONFIG_KEYS = ['plan_tier', 'risk_tier', 'tier_source', 'tier_provenance_ref', 'composition_budget_tier', 'depth', 'decision_scope', 'as_of', 'steering_presets', 'steering_annotations'];
/** Debate shape P2c: the ask now also carries the three depth choices; an ask saved before carries none. */
const DEPTH_CHOICE_CONFIG_KEYS = ['depth_mode', 'scrutiny', 'answer_length'];
const ROOM_QUERY_KEYS = ['plan_tier', 'composition_budget_tier', 'depth'];
function validSubmitted(value: unknown): value is SubmittedPhoneDraft {
    if (!keys(value, ['topic', 'config', 'query']) || typeof value.topic !== 'string') return false;
    const withChoices = keys(value.config, [...ASK_CONFIG_KEYS, ...DEPTH_CHOICE_CONFIG_KEYS]);
    if (!withChoices && !keys(value.config, ASK_CONFIG_KEYS)) return false;
    const c = value.config as Record<string, unknown>;
    if (!Array.isArray(c.steering_presets) || c.steering_presets.length || !Array.isArray(c.steering_annotations) || c.steering_annotations.length) return false;
    if (c.tier_provenance_ref !== (c.tier_source === 'ASKER' ? 'asker:ui-selection' : c.tier_source === 'MACHINE_DEFAULT' ? 'machine:plan-tier-free' : null)) return false;
    const depthParams = withChoices ? {depth:c.depth, depthMode:c.depth_mode, scrutiny:c.scrutiny, answerLength:c.answer_length} : {depth:c.depth};
    const ask = AskRequestSchema.safeParse({question_line:value.topic, risk_tier:c.risk_tier,tier_source:c.tier_source,tier_provenance_ref:c.tier_provenance_ref,composition_budget_tier:c.composition_budget_tier,depth_params:depthParams,decision_scope:c.decision_scope,as_of:c.as_of,steering_presets:c.steering_presets,plan_tier:c.plan_tier,steering_annotations:c.steering_annotations});
    // Debate shape P2c (Contract deviation 9): the room query carries the three choices exactly when the ask does
    // (both follow the page's one room flag); an older draft carries them in neither.
    const queryWithChoices = keys(value.query, [...ROOM_QUERY_KEYS, ...DEPTH_CHOICE_CONFIG_KEYS]);
    if ((!queryWithChoices && !keys(value.query, ROOM_QUERY_KEYS)) || queryWithChoices !== withChoices) return false;
    const q = value.query as Record<string, unknown>;
    if (typeof q.depth !== 'number') return false;
    const room = AskRoomQuerySchema.safeParse({...q, depth: String(q.depth)});
    return ask.success && room.success && room.data.plan_tier === c.plan_tier && room.data.composition_budget_tier === c.composition_budget_tier && room.data.depth === c.depth
        && (!withChoices || (room.data.depth_mode === c.depth_mode && room.data.scrutiny === c.scrutiny && room.data.answer_length === c.answer_length));
}
const FORM_KEYS = ['topic','planTier','optionsOpen','depthMode','scrutiny','depth','answerLength','riskTier','riskTierWasEdited','budgetTier','decisionScope','asOf'];
/** The form as the page saved it before debate shape P2c: Max tokens instead of Answer length. */
const PARALLEL_CALLS_FORM_KEYS = [...FORM_KEYS.filter((name) => name !== 'answerLength'), 'maxTokens'];
/** ... and before parallel calls (owner ruling 2026-10-12): Branching width and Concurrency too. */
const OLDEST_FORM_KEYS = [...PARALLEL_CALLS_FORM_KEYS, 'branching', 'concurrency'];
/** A draft saved in an older shape is READ in today's. The retired values are dropped, Answer
 *  length takes its default (Standard), and a retired depth mode (manual, recommended) reads as
 *  Adaptive. It is never WRITTEN again in an old shape. Any other shape is left as it is, for
 *  validForm to refuse. */
function upgradedForm(value: unknown): unknown {
    if (!plain(value) || (!keys(value, PARALLEL_CALLS_FORM_KEYS) && !keys(value, OLDEST_FORM_KEYS))) return value;
    const form: Record<string, unknown> = { ...value };
    for (const name of ['maxTokens', 'branching', 'concurrency']) delete form[name];
    if (oneOf(form.depthMode, ['manual', 'recommended'])) form.depthMode = 'adaptive';
    form.answerLength = 'standard';
    return form;
}
function validForm(value: unknown): value is PhoneDraftForm {
    if (!keys(value, FORM_KEYS)) return false;
    return typeof value.topic === 'string' && oneOf(value.planTier,['free','premium']) && typeof value.optionsOpen === 'boolean' && oneOf(value.depthMode,['fixed','adaptive']) && oneOf(value.scrutiny,['standard','deep','exhaustive']) && DepthParamsSchema.safeParse({depth:value.depth}).success && oneOf(value.answerLength,['short','standard','detailed']) && oneOf(value.riskTier,['casual','standard','high-stakes']) && typeof value.riskTierWasEdited === 'boolean' && oneOf(value.budgetTier,['low','medium','high']) && typeof value.decisionScope === 'string' && value.decisionScope.length > 0 && typeof value.asOf === 'string' && Number.isFinite(new Date(value.asOf).valueOf());
}
function validRecord(value: unknown): value is PhoneCompletionDraft {
    return keys(value,['version','id','owner','created_at','expires_at','phase','form','submitted']) && value.version === 1 && typeof value.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) && typeof value.owner === 'string' && value.owner.length > 0 && value.owner.length <= 256 && typeof value.created_at === 'number' && Number.isFinite(value.created_at) && value.created_at <= Date.now() && typeof value.expires_at === 'number' && value.expires_at - value.created_at === PHONE_COMPLETION_DRAFT_MS && value.expires_at > Date.now() && oneOf(value.phase,['phone-required','updated','draft']) && validForm(value.form) && validSubmitted(value.submitted);
}
export function clearPhoneCompletionDraft(): void {
    revision++;
    try { if (typeof window !== 'undefined') window.sessionStorage.removeItem(PHONE_COMPLETION_DRAFT_KEY); } catch {}
}
function readRecord(): PhoneCompletionDraft | null {
    if (typeof window === 'undefined') return null;
    try {
        const text = window.sessionStorage.getItem(PHONE_COMPLETION_DRAFT_KEY);
        if (!text) return null;
        if (new TextEncoder().encode(text).byteLength > MAX_BYTES) { clearPhoneCompletionDraft(); return null; }
        const parsed: unknown = JSON.parse(text);
        const value: unknown = plain(parsed) ? { ...parsed, form: upgradedForm(parsed.form) } : parsed;
        if (!validRecord(value)) { clearPhoneCompletionDraft(); return null; }
        return value;
    } catch { clearPhoneCompletionDraft(); return null; }
}
function writeRecord(value: PhoneCompletionDraft): void {
    const text = JSON.stringify(value);
    if (!validRecord(value) || new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('PHONE_DRAFT_INVALID');
    window.sessionStorage.setItem(PHONE_COMPLETION_DRAFT_KEY, text);
    revision++;
}
export function phoneCompletionDraftForOwner(owner: string): PhoneCompletionDraft | null {
    const value = readRecord();
    if (value && value.owner !== owner) { clearPhoneCompletionDraft(); return null; }
    return value;
}
export async function ownedPhoneCompletionDraft(client: Pick<ContractClient,'readSession'>, isCurrent:()=>boolean): Promise<PhoneCompletionDraft | null> {
    const value = readRecord(); if (!value) return null;
    const epoch = revision;
    try {
        const session = await client.readSession();
        if (!isCurrent() || epoch !== revision) return null;
        const current = phoneCompletionDraftForOwner(session.asker_id);
        return current?.id === value.id ? current : null;
    } catch (failure) {
        if (isCurrent() && epoch === revision && failure instanceof ContractHttpError && (failure.status === 401 || failure.status === 403)) clearPhoneCompletionDraft();
        return null;
    }
}
export async function savePhoneCompletionDraft(client: Pick<ContractClient,'readSession'>, form:()=>PhoneDraftForm, submitted:SubmittedPhoneDraft, isCurrent:()=>boolean):Promise<boolean> {
    const epoch = revision;
    let session;
    try { session = await client.readSession(); }
    catch (failure) {
        if (isCurrent() && epoch === revision && failure instanceof ContractHttpError && (failure.status === 401 || failure.status === 403)) clearPhoneCompletionDraft();
        throw failure;
    }
    if (!isCurrent() || epoch !== revision) return false;
    const existing = phoneCompletionDraftForOwner(session.asker_id);
    if (!isCurrent() || epoch !== revision) return false;
    const now = Date.now();
    const sameRequest = existing && JSON.stringify(existing.submitted) === JSON.stringify(submitted);
    const value:PhoneCompletionDraft={version:1,id:sameRequest ? existing.id : crypto.randomUUID(),owner:session.asker_id,created_at:sameRequest ? existing.created_at : now,expires_at:sameRequest ? existing.expires_at : now+PHONE_COMPLETION_DRAFT_MS,phase:'phone-required',form:form(),submitted};
    if (!isCurrent() || epoch !== revision) return false;
    writeRecord(value);
    if (!isCurrent()) { clearPhoneCompletionDraft(); return false; }
    const url = new URL(window.location.href); url.searchParams.delete('topic');
    window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
    return true;
}
/** A local flow acknowledgement, never authentication/phone/eligibility authority. */
export function acknowledgePhoneDraftUpdate(id:string,owner:string):boolean {
    const value=phoneCompletionDraftForOwner(owner);
    if(!value || value.id!==id || value.phase!=='phone-required') return false;
    writeRecord({...value,phase:'updated'}); return true;
}
export function consumePhoneDraftUpdate(id:string,owner:string):SubmittedPhoneDraft|null {
    const value=phoneCompletionDraftForOwner(owner);
    if(!value || value.id!==id || value.phase!=='updated') return null;
    writeRecord({...value,phase:'draft'}); return value.submitted;
}
