import { AskRequestSchema, AskRoomQuerySchema, DepthParamsSchema, ContractHttpError, type ContractClient } from '@debateai/contract';
export const PHONE_COMPLETION_DRAFT_KEY = 'debateai.phone-completion-draft.v1';
export const PHONE_COMPLETION_DRAFT_MS = 15 * 60_000;
const MAX_BYTES = 32_768;
export type PhoneDraftForm = {
    topic: string; planTier: 'free' | 'premium'; optionsOpen: boolean;
    depthMode: 'fixed' | 'manual' | 'recommended' | 'adaptive'; scrutiny: 'standard' | 'deep' | 'exhaustive';
    depth: number; branching: number; concurrency: number; maxTokens: number;
    riskTier: string; riskTierWasEdited: boolean; budgetTier: 'low' | 'medium' | 'high';
    decisionScope: string; asOf: string;
};
export type SubmittedPhoneDraft = { topic: string; config: Record<string, unknown>; query: { plan_tier: 'free' | 'premium'; composition_budget_tier: 'low' | 'medium' | 'high'; depth: number } };
export type PhoneCompletionDraft = { version: 1; id: string; owner: string; created_at: number; expires_at: number; phase: 'phone-required' | 'updated' | 'draft'; form: PhoneDraftForm; submitted: SubmittedPhoneDraft };
let revision = 0;
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: unknown, names: string[]): v is Record<string, unknown> => plain(v) && Object.keys(v).length === names.length && names.every(name => Object.hasOwn(v, name));
const oneOf = (value: unknown, values: readonly unknown[]) => values.includes(value);
const finiteInt = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 128_000;
function validSubmitted(value: unknown): value is SubmittedPhoneDraft {
    if (!keys(value, ['topic', 'config', 'query']) || typeof value.topic !== 'string' || !keys(value.config, ['plan_tier', 'risk_tier', 'tier_source', 'tier_provenance_ref', 'composition_budget_tier', 'depth', 'decision_scope', 'as_of', 'steering_presets', 'steering_annotations'])) return false;
    const c = value.config;
    if (!Array.isArray(c.steering_presets) || c.steering_presets.length || !Array.isArray(c.steering_annotations) || c.steering_annotations.length) return false;
    if (c.tier_provenance_ref !== (c.tier_source === 'ASKER' ? 'asker:ui-selection' : c.tier_source === 'MACHINE_DEFAULT' ? 'machine:plan-tier-free' : null)) return false;
    const ask = AskRequestSchema.safeParse({question_line:value.topic, risk_tier:c.risk_tier,tier_source:c.tier_source,tier_provenance_ref:c.tier_provenance_ref,composition_budget_tier:c.composition_budget_tier,depth_params:{depth:c.depth},decision_scope:c.decision_scope,as_of:c.as_of,steering_presets:c.steering_presets,plan_tier:c.plan_tier,steering_annotations:c.steering_annotations});
    if (!keys(value.query, ['plan_tier','composition_budget_tier','depth']) || typeof value.query.depth !== 'number') return false;
    const room = AskRoomQuerySchema.safeParse({...value.query, depth: String(value.query.depth)});
    return ask.success && room.success && room.data.plan_tier === c.plan_tier && room.data.composition_budget_tier === c.composition_budget_tier && room.data.depth === c.depth;
}
function validForm(value: unknown): value is PhoneDraftForm {
    if (!keys(value, ['topic','planTier','optionsOpen','depthMode','scrutiny','depth','branching','concurrency','maxTokens','riskTier','riskTierWasEdited','budgetTier','decisionScope','asOf'])) return false;
    return typeof value.topic === 'string' && oneOf(value.planTier,['free','premium']) && typeof value.optionsOpen === 'boolean' && oneOf(value.depthMode,['fixed','manual','recommended','adaptive']) && oneOf(value.scrutiny,['standard','deep','exhaustive']) && DepthParamsSchema.safeParse({depth:value.depth}).success && finiteInt(value.branching) && Number(value.branching)<=4 && finiteInt(value.concurrency) && Number(value.concurrency)<=6 && finiteInt(value.maxTokens) && Number(value.maxTokens)>=128 && Number(value.maxTokens)<=4000 && Number(value.maxTokens)%32===0 && oneOf(value.riskTier,['casual','standard','high-stakes']) && typeof value.riskTierWasEdited === 'boolean' && oneOf(value.budgetTier,['low','medium','high']) && typeof value.decisionScope === 'string' && value.decisionScope.length > 0 && typeof value.asOf === 'string' && Number.isFinite(new Date(value.asOf).valueOf());
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
        const value: unknown = JSON.parse(text);
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
