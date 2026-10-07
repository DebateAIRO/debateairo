import type { StepUpResponse } from '@debateai/contract';
let pending: StepUpResponse | null = null;
let expiry: ReturnType<typeof setTimeout> | undefined;
/** Ephemeral same-document handoff for Security settings; never storage or URL. */
export function retainSocialStepUp(result: StepUpResponse): void { if (expiry)
    clearTimeout(expiry); pending = result; const until = result.step_up_grant ? new Date(result.step_up_grant.expires_at).getTime() : 0; expiry = setTimeout(() => { pending = null; expiry = undefined; }, Math.max(0, until - Date.now())); }
export function takeSocialStepUp(): StepUpResponse | null { const result = pending; pending = null; if (expiry)
    clearTimeout(expiry); expiry = undefined; return result?.step_up_grant && new Date(result.step_up_grant.expires_at).getTime() > Date.now() ? result : null; }
