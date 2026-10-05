import { StepUpResponseSchema, type StepUpAuthorizationRequest, type StepUpResponse } from '@debateai/contract';
export type ConfirmedSecurityAction = StepUpResponse & {
    step_up_grant: NonNullable<StepUpResponse['step_up_grant']>;
};
/** Client comparison is a presentation guard. The operation independently consumes server authority. */
export function matchingSecurityGrant(result: StepUpResponse, authorization: StepUpAuthorizationRequest): result is ConfirmedSecurityAction {
    const parsed = StepUpResponseSchema.safeParse(result);
    if (!parsed.success || !parsed.data.step_up_grant)
        return false;
    const grant = parsed.data.step_up_grant;
    return Number.isFinite(Date.parse(grant.expires_at)) && Date.parse(grant.expires_at) > Date.now() && Object.entries(authorization).every(([key, value]) => (grant as Record<string, unknown>)[key] === value);
}
