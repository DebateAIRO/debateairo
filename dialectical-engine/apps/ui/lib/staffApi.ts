import * as contract from "@debateai/contract";
import type { z } from "zod";
import { API_BASE, createSameOriginFetch, readBrowserCsrfCookie } from "./api.js";
import { createStaffWebAuthnBrowser } from "./staffWebAuthn.js";
type Input<S extends z.ZodType> = z.infer<S>;
export type StaffBrowser = ReturnType<typeof createStaffWebAuthnBrowser>;
export type StaffApiClient = ReturnType<typeof createStaffApiClient>;
export type RegistrationInput = Input<typeof contract.StaffRegistrationOptionsRequestSchema>;
export type InvitationAcceptInput = Pick<Input<typeof contract.StaffInvitationAcceptRequestSchema>, "invitation_handle" | "operation_id">;
export type PossessionInput = Input<typeof contract.OwnerPossessionOptionsRequestSchema>;
/** Private handles remain in the caller's current ceremony. No browser storage or URL transport. */
export function createStaffApiClient({ fetchImplementation = fetch, apiBase = API_BASE, browser = createStaffWebAuthnBrowser(), fundingPolicyVersion }: {
    fetchImplementation?: typeof fetch;
    apiBase?: string;
    browser?: StaffBrowser;
    fundingPolicyVersion?: 1;
} = {}) {
    const actionIntentSchema = fundingPolicyVersion === 1 ? contract.FundedStaffActionIntentSchema : contract.StaffActionIntentSchema;
    const actionOptionsSchema = fundingPolicyVersion === 1 ? contract.FundedStaffActionOptionsRequestSchema : contract.StaffActionOptionsRequestSchema;
    const actionVerifySchema = fundingPolicyVersion === 1 ? contract.FundedStaffActionVerifyRequestSchema : contract.StaffActionVerifyRequestSchema;
    const elevationSchema = fundingPolicyVersion === 1 ? contract.FundedStaffElevationResponseSchema : contract.StaffElevationResponseSchema;
    const teamSchema = fundingPolicyVersion === 1 ? contract.FundedStaffTeamPageSchema : contract.StaffTeamPageSchema;
    let lifecycle = 0;
    const assertCurrent = (epoch: number) => {
        if (lifecycle !== epoch)
            throw new Error("STAFF_WEBAUTHN_CANCELLED");
    };
    const cancel = () => { lifecycle++; browser.cancel(); };
    const transport = createSameOriginFetch(apiBase, fetchImplementation);
    const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
    function checked<S extends z.ZodType>(schema: S, input: unknown): Input<S> {
        const result = schema.safeParse(input);
        if (!result.success)
            throw new contract.ContractHttpError("MALFORMED_REQUEST", 400, "STAFF_INPUT_INVALID");
        return result.data;
    }
    async function request<S extends z.ZodType>(path: string, schema: S, method = "GET", body?: unknown, staff = false): Promise<Input<S>> {
        const epoch = lifecycle;
        const headers = new Headers();
        if (method !== "GET") {
            headers.set("content-type", "application/json");
            const ordinaryCsrf = readBrowserCsrfCookie("__Host-debateai-csrf");
            if (ordinaryCsrf !== null)
                headers.set("x-csrf-token", ordinaryCsrf);
            if (staff) {
                const staffCsrf = readBrowserCsrfCookie("__Host-debateai-staff-csrf");
                if (staffCsrf !== null)
                    headers.set("x-staff-csrf-token", staffCsrf);
            }
        }
        let response: Response;
        try {
            response = await transport(new URL(`/v1/admin${path}`, origin), {
                method, headers, cache: "no-store", credentials: "same-origin",
                ...(body === undefined ? {} : { body: JSON.stringify(body) })
            });
        }
        catch {
            throw new contract.ContractHttpError("NETWORK_FAILURE", 0, "STAFF_NETWORK_FAILURE");
        }
        assertCurrent(epoch);
        if (!response.ok) {
            const value: unknown = await response.json().catch(() => null);
            const serverCode = value !== null && typeof value === "object" && "error" in value
                && typeof value.error === "string" && /^[A-Z][A-Z0-9_]{0,79}$/u.test(value.error) ? value.error : null;
            const code = response.status === 401 ? "SESSION_REQUIRED" : response.status === 403 ? "FORBIDDEN"
                : response.status === 400 ? "MALFORMED_REQUEST" : response.status === 422 ? "UNPROCESSABLE"
                    : response.status === 429 ? "RATE_LIMITED" : "SERVER_FAILURE";
            throw new contract.ContractHttpError(code, response.status, "STAFF_REQUEST_FAILED", serverCode);
        }
        if (response.status !== 200)
            throw new contract.ContractHttpError("INVALID_RESPONSE", response.status, "STAFF_RESPONSE_INVALID");
        let value: Input<S>;
        try {
            value = schema.parse(await response.json());
        }
        catch {
            throw new contract.ContractHttpError("INVALID_RESPONSE", response.status, "STAFF_RESPONSE_INVALID");
        }
        assertCurrent(epoch);
        return value;
    }
    const enrollment = () => request("/enrollment", contract.StaffEnrollmentResponseSchema);
    const prerequisite = async (input: contract.StaffPrerequisiteStepUpRequest) => request("/prerequisites/step-up", contract.StaffPrerequisiteResponseSchema, "POST", checked(contract.StaffPrerequisiteStepUpRequestSchema, input));
    const beginRegistration = async (input: RegistrationInput) => {
        const value = checked(contract.StaffRegistrationOptionsRequestSchema, input);
        return request("/webauthn/registration/options", contract.StaffRegistrationOptionsResponseSchema, "POST", value, "proof_handle" in value);
    };
    const finishRegistration = async (input: Input<typeof contract.StaffRegistrationVerifyRequestSchema>) => request("/webauthn/registration/verify", contract.StaffRegistrationResponseSchema, "POST", checked(contract.StaffRegistrationVerifyRequestSchema, input));
    const beginElevation = async () => request("/webauthn/elevation/options", contract.StaffAuthenticationOptionsResponseSchema, "POST", {});
    const finishElevation = async (input: Input<typeof contract.StaffAuthenticationVerifyRequestSchema>) => request("/webauthn/elevation/verify", elevationSchema, "POST", checked(contract.StaffAuthenticationVerifyRequestSchema, input));
    const beginAction = async (intent: contract.FundedStaffActionIntent) => request("/webauthn/action/options", contract.StaffAuthenticationOptionsResponseSchema, "POST", checked(actionOptionsSchema, { intent }), true);
    const finishAction = async (input: Input<typeof contract.FundedStaffActionVerifyRequestSchema>) => request("/webauthn/action/verify", contract.StaffActionProofResponseSchema, "POST", checked(actionVerifySchema, input), true);
    const beginInvitation = async (invitation_handle: string) => request("/team/invitations/accept/options", contract.StaffInvitationOptionsResponseSchema, "POST", checked(contract.StaffInvitationOptionsRequestSchema, { invitation_handle }));
    const finishInvitation = async (input: Input<typeof contract.StaffInvitationVerifyRequestSchema>) => request("/team/invitations/accept/verify", contract.StaffActionProofResponseSchema, "POST", checked(contract.StaffInvitationVerifyRequestSchema, input));
    const acceptInvitation = async (input: Input<typeof contract.StaffInvitationAcceptRequestSchema>) => request("/team/invitations/accept", contract.SecurityReceiptSchema, "POST", checked(contract.StaffInvitationAcceptRequestSchema, input));
    const beginPossession = async (input: PossessionInput) => request("/owner-possession/options", contract.StaffAuthenticationOptionsResponseSchema, "POST", checked(contract.OwnerPossessionOptionsRequestSchema, input));
    const finishPossession = async (input: Input<typeof contract.OwnerPossessionVerifyRequestSchema>) => request("/owner-possession/verify", contract.OwnerPossessionResponseSchema, "POST", checked(contract.OwnerPossessionVerifyRequestSchema, input));
    async function proveAction(input: contract.FundedStaffActionIntent) {
        const epoch = lifecycle;
        const intent = checked(actionIntentSchema, input);
        const options = await beginAction(intent);
        assertCurrent(epoch);
        const credential = await browser.authenticate(options);
        assertCurrent(epoch);
        return finishAction({ intent, challenge_handle: options.challenge_handle, credential });
    }
    async function mutate(input: contract.FundedStaffActionIntent) {
        const epoch = lifecycle;
        const intent = checked(actionIntentSchema, input);
        if (intent.action === "CREDENTIAL_REGISTER")
            throw new contract.ContractHttpError("MALFORMED_REQUEST", 400, "STAFF_INPUT_INVALID");
        const proof = await proveAction(intent);
        assertCurrent(epoch);
        if (intent.action === "ALLOWANCE_CONFIGURE") {
            const { action: _action, ...business } = intent;
            return request("/internal-allowances", contract.SecurityReceiptSchema, "POST", checked(contract.InternalAllowanceConfigureRequestSchema, { ...business, proof_handle: proof.proof_handle }), true);
        }
        if (intent.action === "ALLOWANCE_REVOKE") {
            return request(`/internal-allowances/${encodeURIComponent(intent.grant_id)}`, contract.SecurityReceiptSchema, "DELETE",
                checked(contract.InternalAllowanceRevokeRequestSchema, { operation_id: intent.operation_id, reason: intent.reason, proof_handle: proof.proof_handle }), true);
        }
        const { action, ...business } = intent;
        const body = { ...business, proof_handle: proof.proof_handle };
        if (action === "TEAM_INVITE")
            return request("/team/invitations", contract.StaffInviteResponseSchema, "POST", checked(contract.StaffInviteRequestSchema, body), true);
        const { target_staff_id, ...mutation } = body as typeof body & {
            target_staff_id: string;
        };
        const path = `/team/${encodeURIComponent(target_staff_id)}`;
        return action === "TEAM_GRANT"
            ? request(`${path}/grants`, contract.SecurityReceiptSchema, "PATCH", checked(contract.StaffGrantRequestSchema, mutation), true)
            : request(`${path}/disable`, contract.SecurityReceiptSchema, "POST", checked(contract.StaffDisableRequestSchema, mutation), true);
    }
    return Object.freeze({ enrollment, prerequisite, beginRegistration, finishRegistration, beginElevation, finishElevation,
        beginAction, finishAction, beginInvitation, finishInvitation, acceptInvitation, beginPossession, finishPossession, proveAction, mutate,
        cancel,
        async register(input: RegistrationInput) {
            const epoch = lifecycle;
            const options = await beginRegistration(input);
            assertCurrent(epoch);
            const credential = await browser.register(options);
            assertCurrent(epoch);
            return finishRegistration({ challenge_handle: options.challenge_handle, credential });
        },
        async elevate() {
            const epoch = lifecycle;
            const options = await beginElevation();
            assertCurrent(epoch);
            const credential = await browser.authenticate(options);
            assertCurrent(epoch);
            return finishElevation({ challenge_handle: options.challenge_handle, credential });
        },
        async accept(input: InvitationAcceptInput) {
            const epoch = lifecycle;
            const value = checked(contract.StaffInvitationAcceptRequestSchema.pick({ invitation_handle: true, operation_id: true }), input);
            const options = await beginInvitation(value.invitation_handle);
            assertCurrent(epoch);
            const credential = await browser.authenticate({ challenge_handle: options.challenge_handle, options: options.options });
            assertCurrent(epoch);
            const proof = await finishInvitation({ invitation_handle: value.invitation_handle, challenge_handle: options.challenge_handle, credential });
            assertCurrent(epoch);
            return acceptInvitation({ ...value, expected_revision: options.invitation_revision, proof_handle: proof.proof_handle });
        },
        async possess(input: PossessionInput) {
            const epoch = lifecycle;
            const value = checked(contract.OwnerPossessionOptionsRequestSchema, input);
            const options = await beginPossession(value);
            assertCurrent(epoch);
            const credential = await browser.authenticate(options);
            assertCurrent(epoch);
            const { prerequisite_handle: _prerequisite, ...verification } = value;
            return finishPossession({ ...verification, challenge_handle: options.challenge_handle, credential });
        },
        team(input: contract.StaffPageQuery) {
            const value = checked(contract.StaffTeamQuerySchema, input);
            const query = new URLSearchParams({ limit: String(value.limit), ...(value.cursor === undefined ? {} : { cursor: value.cursor }) });
            return request(`/team?${query}`, teamSchema);
        },
        audit(input: contract.StaffPageQuery) {
            const value = checked(contract.StaffAuditQuerySchema, input);
            const query = new URLSearchParams({ limit: String(value.limit), ...(value.cursor === undefined ? {} : { cursor: value.cursor }) });
            return request(`/audit?${query}`, contract.StaffAuditPageSchema);
        }
    });
}
