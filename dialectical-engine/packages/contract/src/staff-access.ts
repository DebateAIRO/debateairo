import { z } from "zod";
import type { ActionBinding, Reason, SecurityReceipt, StaffCapability, DelegatedStaffCapability, StaffDisableMode } from "@debateai/kernel";
import { PublicationReviewAuditEventSchema } from "./publication-review.js";
export const StaffCapabilitySchema = z.enum([
    "TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE", "ALLOWANCE_WRITE", "PUBLICATION_REVIEW", "THREAT_REPORT"
]) satisfies z.ZodType<StaffCapability>;
const DelegatedStaffCapabilitySchema = z.enum(["TEAM_READ", "AUDIT_READ", "EMERGENCY_DISABLE", "PUBLICATION_REVIEW", "THREAT_REPORT"]) satisfies z.ZodType<DelegatedStaffCapability>;
export const DelegatedStaffCapabilitiesSchema = z.array(DelegatedStaffCapabilitySchema).max(5)
    .refine((values) => new Set(values).size === values.length, "Capabilities must be unique");
export const ActiveStaffCapabilitiesSchema = z.array(z.enum([
    "TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE", "PUBLICATION_REVIEW", "THREAT_REPORT"
])).max(8).refine((values) => new Set(values).size === values.length, "Capabilities must be unique");
export const StaffActionSchema = z.enum([
    "TEAM_INVITE", "INVITATION_ACCEPT", "TEAM_GRANT", "TEAM_DISABLE", "EMERGENCY_DISABLE",
    "CREDENTIAL_REGISTER", "CREDENTIAL_REVOKE", "PUBLICATION_REVIEW_APPROVE", "PUBLICATION_REVIEW_REFUSE",
    "THREAT_REPORT_REPORTED", "THREAT_REPORT_NOT_REPORTED",
    "TEAM_LIMIT_SET", "TEAM_LIMIT_PARTNER_GRANT", "TEAM_LIMIT_PARTNER_REVOKE", "TEAM_PRACTICE_RECORD",
    "PUBLIC_REVIEW_HIDE", "PUBLIC_REVIEW_STEP", "PUBLIC_REPORT_DISMISS"
]);
const RevisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const OpaqueHandleSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);
const CredentialIdSchema = z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/u);
const TicketReferenceSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u);
export type ReasonWire = Omit<Reason, "ticketRef"> & {
    ticket_ref?: Reason["ticketRef"];
};
export const ReasonSchema = z.object({
    code: z.enum(["TEAM_ONBOARDING", "GRANT_CHANGE", "OFFBOARDING", "SECURITY_RESPONSE", "KEY_MAINTENANCE", "FUNDING_APPROVAL"]),
    ticket_ref: TicketReferenceSchema.optional()
}).strict() satisfies z.ZodType<ReasonWire>;
export type ActionBindingWire = {
    action: ActionBinding["action"];
    target_id: ActionBinding["targetId"];
    body_sha256: ActionBinding["bodySha256"];
    expected_revision: ActionBinding["expectedRevision"];
    operation_id: ActionBinding["operationId"];
};
export const ActionBindingSchema = z.object({
    action: StaffActionSchema, target_id: z.uuid(), body_sha256: DigestSchema,
    expected_revision: RevisionSchema, operation_id: z.uuid()
}).strict() satisfies z.ZodType<ActionBindingWire>;
export type SecurityReceiptWire = {
    operation_id: SecurityReceipt["operationId"];
    outcome: SecurityReceipt["outcome"];
    recorded_at: string;
};
export const SecurityReceiptSchema = z.object({
    operation_id: z.uuid(), outcome: z.literal("COMPLETED"), recorded_at: z.iso.datetime()
}).strict() satisfies z.ZodType<SecurityReceiptWire>;
const FreshFactorShape = { password: z.string().min(1).max(1024), totp_code: z.string().regex(/^[0-9]{6}$/u) };
export const StaffPrerequisiteStepUpRequestSchema = z.discriminatedUnion("purpose", [
    z.object({ purpose: z.literal("KEY_PREREGISTRATION"), ...FreshFactorShape }).strict(),
    z.object({ purpose: z.literal("OWNER_POSSESSION"), ...FreshFactorShape,
        command_id: z.uuid(), command_nonce: OpaqueHandleSchema }).strict()
]);
/** Ordinary rotated cookies travel through the existing transport, never in this DTO. */
export const StaffPrerequisiteResponseSchema = z.object({
    prerequisite_handle: OpaqueHandleSchema, expires_at: z.iso.datetime()
}).strict();
export const StaffEnrollmentResponseSchema = z.object({
    user_id: z.uuid(), readiness: z.object({
        account_active: z.boolean(), email_verified: z.boolean(), totp_active: z.boolean(), security_hold: z.boolean(),
        verified_credential_count: RevisionSchema, owner_credential_requirement_met: z.boolean(), delegated_credential_requirement_met: z.boolean()
    }).strict()
}).strict();
export const FundedStaffEnrollmentResponseSchema = StaffEnrollmentResponseSchema.extend({funding_policy_version:z.literal(1)}).strict();
export const SelectedStaffEnrollmentResponseSchema = z.union([StaffEnrollmentResponseSchema,FundedStaffEnrollmentResponseSchema]);
const TransportSchema = z.enum(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);
const TransportsSchema = z.array(TransportSchema).max(7).refine((values) => new Set(values).size === values.length);
const EncodedCeremonyValueSchema = z.string().min(1).max(32768).regex(/^[A-Za-z0-9_-]+$/u);
const ExtensionResultsSchema = z.object({ credProps: z.object({ rk: z.boolean().optional() }).strict().optional() }).strict();
export const WebAuthnRegistrationCredentialSchema = z.object({
    id: CredentialIdSchema, rawId: CredentialIdSchema, type: z.literal("public-key"),
    response: z.object({ clientDataJSON: EncodedCeremonyValueSchema, attestationObject: EncodedCeremonyValueSchema,
        transports: TransportsSchema.optional(), publicKeyAlgorithm: z.union([z.literal(-7), z.literal(-257)]).optional(),
        publicKey: EncodedCeremonyValueSchema.optional(), authenticatorData: EncodedCeremonyValueSchema.optional() }).strict(),
    clientExtensionResults: ExtensionResultsSchema,
    authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional()
}).strict();
export const WebAuthnAuthenticationCredentialSchema = z.object({
    id: CredentialIdSchema, rawId: CredentialIdSchema, type: z.literal("public-key"),
    response: z.object({ clientDataJSON: EncodedCeremonyValueSchema, authenticatorData: EncodedCeremonyValueSchema,
        signature: EncodedCeremonyValueSchema, userHandle: EncodedCeremonyValueSchema.nullable().optional() }).strict(),
    clientExtensionResults: ExtensionResultsSchema,
    authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional()
}).strict();
function ceremonyBodyBound(value: unknown, context: z.RefinementCtx): void {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 32768) {
        context.addIssue({ code: "custom", message: "Ceremony body exceeds the sealed 32 KiB bound" });
    }
}
export const StaffRegistrationOptionsRequestSchema = z.union([
    z.object({ prerequisite_handle: OpaqueHandleSchema }).strict(),
    z.object({ proof_handle: OpaqueHandleSchema, operation_id: z.uuid() }).strict()
]);
export const StaffRegistrationVerifyRequestSchema = z.object({
    challenge_handle: OpaqueHandleSchema, credential: WebAuthnRegistrationCredentialSchema
}).strict().superRefine(ceremonyBodyBound);
/** Only its own authenticated registrant receives the verified public credential identifier. */
export const StaffRegistrationResponseSchema = z.object({ receipt: SecurityReceiptSchema, credentialId: CredentialIdSchema }).strict();
export const StaffElevationOptionsRequestSchema = z.object({}).strict();
export const StaffAuthenticationVerifyRequestSchema = z.object({
    challenge_handle: OpaqueHandleSchema, credential: WebAuthnAuthenticationCredentialSchema
}).strict().superRefine(ceremonyBodyBound);
/** Own display metadata only, produced after verified elevation and session issuance. */
export const StaffElevationResponseSchema = z.object({
    staff_id: z.uuid(), capabilities: ActiveStaffCapabilitiesSchema, grant_revision: RevisionSchema, expires_at: z.iso.datetime()
}).strict();
/** Business inputs only: the server derives every binding field and digest. */
const ActionMutationShape = { expected_revision: RevisionSchema, operation_id: z.uuid(), reason: ReasonSchema };
/**
 * Decision 24: the new amount, and the amount and log revision the person is looking at (0 and 0 before any limit), so a page or a
 * ceremony made against another value never applies. Whole micros; made-up numbers only in examples.
 */
const TeamLimitMicrosSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const TeamLimitSetShape = { amount_micros: TeamLimitMicrosSchema, current_micros: TeamLimitMicrosSchema, expected_revision: RevisionSchema, operation_id: z.uuid() };
const TeamPracticeShape = { practice_ref: z.uuid(), charge_micros: TeamLimitMicrosSchema, operation_id: z.uuid() };
/**
 * Decision 33: a public debate under review. Each passkey is bound to the debate, the step, the piece and the log's revision (and to the text's digest for a correction, whose words never enter the proof).
 */
export const PublicReviewPieceKindSchema = z.enum(["SNAPSHOT", "UPDATE", "REPORT", "DIG"]);
export const PublicReviewStepSchema = z.enum(["REPUBLISH", "REMOVE_DIG", "PUT_BACK", "CORRECT", "HIDE_REPORT"]);
const PublicReviewPointerSchema = z.string().regex(/^(\/[A-Za-z0-9_]{1,64}){1,12}$/u);
const PublicReviewHideShape = { publication_ref: z.uuid(), expected_revision: RevisionSchema, operation_id: z.uuid() };
const PublicReviewStepShape = { ...PublicReviewHideShape, step: PublicReviewStepSchema, piece_kind: PublicReviewPieceKindSchema.nullable(), piece_id: z.uuid().nullable(),
    pointer: PublicReviewPointerSchema.nullable(), text_sha256: z.string().regex(/^[0-9a-f]{64}$/u).nullable() };
export const StaffActionIntentSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("TEAM_INVITE"), target_user_id: z.uuid(), capabilities: DelegatedStaffCapabilitiesSchema, ...ActionMutationShape }).strict(),
    z.object({ action: z.literal("TEAM_GRANT"), target_staff_id: z.uuid(), capabilities: DelegatedStaffCapabilitiesSchema, ...ActionMutationShape }).strict(),
    z.object({ action: z.literal("TEAM_DISABLE"), target_staff_id: z.uuid(), mode: z.literal("OFFBOARD"), ...ActionMutationShape }).strict(),
    z.object({ action: z.literal("EMERGENCY_DISABLE"), target_staff_id: z.uuid(), mode: z.literal("COMPROMISE"), ...ActionMutationShape }).strict(),
    z.object({ action: z.literal("CREDENTIAL_REGISTER"), operation_id: z.uuid() }).strict(),
    z.object({ action: z.literal("PUBLICATION_REVIEW_APPROVE"), review_ref: z.uuid(), operation_id: z.uuid() }).strict(),
    z.object({ action: z.literal("PUBLICATION_REVIEW_REFUSE"), review_ref: z.uuid(), reason: z.string().trim().min(1).max(500), operation_id: z.uuid() }).strict(),
    z.object({ action: z.literal("THREAT_REPORT_DECIDE"), target_report_ref: z.uuid(), decision: z.enum(["REPORTED", "NOT_REPORTED"]), expected_revision: RevisionSchema, operation_id: z.uuid() }).strict(),
    z.object({ action: z.literal("TEAM_LIMIT_SET"), ...TeamLimitSetShape }).strict(),
    z.object({ action: z.literal("TEAM_LIMIT_PARTNER_GRANT"), target_staff_id: z.uuid(), ...ActionMutationShape }).strict(),
    z.object({ action: z.literal("TEAM_LIMIT_PARTNER_REVOKE"), target_staff_id: z.uuid(), ...ActionMutationShape }).strict(),
    z.object({ action: z.literal("TEAM_PRACTICE_RECORD"), ...TeamPracticeShape }).strict(),
    z.object({ action: z.literal("PUBLIC_REVIEW_HIDE"), ...PublicReviewHideShape }).strict(),
    z.object({ action: z.literal("PUBLIC_REVIEW_STEP"), ...PublicReviewStepShape }).strict(),
    z.object({ action: z.literal("PUBLIC_REPORT_DISMISS"), flag_id: z.uuid(), operation_id: z.uuid() }).strict()
]);
export const StaffActionOptionsRequestSchema = z.object({ intent: StaffActionIntentSchema }).strict();
export const StaffActionVerifyRequestSchema = z.object({ intent: StaffActionIntentSchema,
    challenge_handle: OpaqueHandleSchema, credential: WebAuthnAuthenticationCredentialSchema
}).strict().superRefine(ceremonyBodyBound);
export const TeamLimitSetRequestSchema = z.object({ ...TeamLimitSetShape, proof_handle: OpaqueHandleSchema }).strict();
export const TeamLimitPartnerRequestSchema = z.object({ ...ActionMutationShape, proof_handle: OpaqueHandleSchema }).strict();
export const TeamPracticeRequestSchema = z.object({ ...TeamPracticeShape, proof_handle: OpaqueHandleSchema }).strict();
const TeamLimitLogEntrySchema = z.object({
    kind: z.enum(["LIMIT", "PARTNER_GRANTED", "PARTNER_REVOKED", "PRACTICE"]), at: z.iso.datetime({ offset: true }),
    amount_micros: TeamLimitMicrosSchema.optional(), previous_micros: TeamLimitMicrosSchema.nullable().optional(),
    actor_staff_id: z.uuid().nullable(), subject_staff_id: z.uuid().optional(),
    cause: z.enum(["OWNER_REVOKED", "STAFF_DISABLED", "ACCOUNT_ERASED", "OWNER_CHANGED"]).optional(),
    notice: z.enum(["NONE", "WAITING", "SENT", "FAILED"])
}).strict();
/** The private team panel: only the two accounts ever receive it. A null amount: no limit yet, so the team has no room. */
export const TeamLimitPageSchema = z.object({
    amount_micros: TeamLimitMicrosSchema.nullable(), revision: RevisionSchema, spent_micros: TeamLimitMicrosSchema, committed_micros: TeamLimitMicrosSchema,
    month_starts_at: z.iso.datetime({ offset: true }), month_ends_at: z.iso.datetime({ offset: true }), is_owner: z.boolean(),
    partner: z.object({ staff_id: z.uuid(), pseudonym: z.string().regex(/^staff-[0-9a-f]{32}$/u), grant_revision: RevisionSchema }).strict().nullable(),
    log: z.array(TeamLimitLogEntrySchema).max(100)
}).strict();
export type TeamLimitPage = z.infer<typeof TeamLimitPageSchema>;
export const PublicReviewHideRequestSchema = z.object({ expected_revision: RevisionSchema, operation_id: z.uuid(), proof_handle: OpaqueHandleSchema }).strict();
export const PublicReviewStepRequestSchema = z.object({ step: PublicReviewStepSchema, piece_kind: PublicReviewPieceKindSchema.nullable(), piece_id: z.uuid().nullable(),
    pointer: PublicReviewPointerSchema.nullable(), text: z.string().trim().min(1).max(20000).nullable(), expected_revision: RevisionSchema, operation_id: z.uuid(), proof_handle: OpaqueHandleSchema }).strict();
const PublicReviewPieceSchema = z.object({ pointer: PublicReviewPointerSchema, original: z.string(), corrected: z.string().nullable() }).strict();
const PublicReviewLogEntrySchema = z.object({ revision: z.number().int().positive(), action: z.enum(["HIDE", "REPUBLISH", "REMOVE_DIG", "PUT_BACK", "CORRECT", "HIDE_REPORT"]), piece_kind: PublicReviewPieceKindSchema.nullable(),
    actor_staff_id: z.uuid(), at: z.iso.datetime({ offset: true }) }).strict();
/** The whole debate for the two accounts. The originals are here and nowhere else now: no-store, and each read is logged. */
export const PublicReviewPageSchema = z.object({
    publication_ref: z.uuid(), hidden: z.boolean(), revision: RevisionSchema, question: z.string(), published_at: z.iso.datetime({ offset: true }),
    snapshot_unreadable: z.boolean(), snapshot: z.array(PublicReviewPieceSchema),
    digs: z.array(z.object({ dig_run_id: z.uuid(), parent_run_id: z.uuid(), position_ref: z.string().nullable(), contributor: z.string().nullable(), contributed_at: z.iso.datetime({ offset: true }), removed: z.boolean() }).strict()),
    updates: z.array(z.object({ update_id: z.uuid(), update_seq: z.number().int().positive(), dig_run_id: z.uuid().nullable(), kind: z.enum(["PATH", "MAIN_ANSWER"]), position_ref: z.string().nullable(), recorded_at: z.iso.datetime({ offset: true }),
        state: z.enum(["ON_THE_PAGE", "ITS_DIG_REMOVED", "AFFECTED"]), before: z.string().nullable(), pieces: z.array(PublicReviewPieceSchema) }).strict()),
    reports: z.array(z.object({ report_id: z.uuid(), report_version: z.number().int().positive(), writer: z.string().nullable(), requested_at: z.iso.datetime({ offset: true }), recorded_at: z.iso.datetime({ offset: true }),
        state: z.enum(["ON_THE_PAGE", "HIDDEN", "AFFECTED"]), pieces: z.array(PublicReviewPieceSchema) }).strict()),
    log: z.array(PublicReviewLogEntrySchema)
}).strict();
export type PublicReviewPage = z.infer<typeof PublicReviewPageSchema>;
export const PublicReviewListSchema = z.object({
    hidden: z.array(z.object({ publication_ref: z.uuid(), hidden_at: z.iso.datetime({ offset: true }) }).strict()),
    log: z.array(PublicReviewLogEntrySchema.extend({ publication_ref: z.uuid() }).strict()).max(100)
}).strict();
export type PublicReviewList = z.infer<typeof PublicReviewListSchema>;
/** Decision 35: the Report button's queue, for the same two accounts. The reporter's name is here and nowhere else, and each read is logged. `claim` and `where` go null six months after a report closed. */
export const PublicFlagQueueSchema = z.object({ reports: z.array(z.object({
    flag_id: z.uuid(), publication_ref: z.uuid(), reporter: z.string().nullable(), state: z.enum(["CHECKING", "QUEUED", "NOT_FOUND", "HIDDEN"]), verdict: z.enum(["AGREE", "NOT_FOUND", "UNSURE", "UNAVAILABLE"]).nullable(), reason: z.enum(["CONTENT", "PERSONAL"]).nullable(),
    created_at: z.iso.datetime({ offset: true }), judged_at: z.iso.datetime({ offset: true }).nullable(), dismissed_at: z.iso.datetime({ offset: true }).nullable(), where: z.string().nullable(), claim: z.string().nullable(), debate_hidden: z.boolean() }).strict()).max(200) }).strict();
export type PublicFlagQueue = z.infer<typeof PublicFlagQueueSchema>;
export const PublicFlagDismissRequestSchema = z.object({ operation_id: z.uuid(), proof_handle: OpaqueHandleSchema }).strict();
export const StaffActionProofResponseSchema = z.object({ proof_handle: OpaqueHandleSchema, expires_at: z.iso.datetime() }).strict();
const CredentialDescriptorSchema = z.object({ id: CredentialIdSchema, type: z.literal("public-key"), transports: TransportsSchema.optional() }).strict();
export const StaffRegistrationOptionsResponseSchema = z.object({
    challenge_handle: OpaqueHandleSchema, options: z.object({
        challenge: OpaqueHandleSchema, rp: z.object({ id: z.string().min(1).max(253), name: z.string().min(1).max(128) }).strict(),
        user: z.object({ id: EncodedCeremonyValueSchema, name: z.string().min(1).max(128), displayName: z.string().min(1).max(128) }).strict(),
        pubKeyCredParams: z.tuple([
            z.object({ type: z.literal("public-key"), alg: z.literal(-7) }).strict(),
            z.object({ type: z.literal("public-key"), alg: z.literal(-257) }).strict()
        ]), timeout: z.literal(300000), attestation: z.literal("none"),
        authenticatorSelection: z.object({ userVerification: z.literal("required"), authenticatorAttachment: z.literal("cross-platform") }).strict(),
        excludeCredentials: z.array(CredentialDescriptorSchema).max(100)
    }).strict()
}).strict();
export const StaffAuthenticationOptionsResponseSchema = z.object({
    challenge_handle: OpaqueHandleSchema, options: z.object({
        challenge: OpaqueHandleSchema, rpId: z.string().min(1).max(253), timeout: z.literal(300000),
        userVerification: z.literal("required"), allowCredentials: z.array(CredentialDescriptorSchema).min(1).max(100)
    }).strict()
}).strict();
/** Only the authenticated invitation target receives its current revision. */
export const StaffInvitationOptionsResponseSchema = StaffAuthenticationOptionsResponseSchema.extend({
    invitation_revision: RevisionSchema
}).strict();
export const OwnerPossessionOptionsRequestSchema = z.object({
    command_id: z.uuid(), command_nonce: OpaqueHandleSchema, credential_id: CredentialIdSchema, prerequisite_handle: OpaqueHandleSchema
}).strict();
export const OwnerPossessionVerifyRequestSchema = z.object({
    command_id: z.uuid(), command_nonce: OpaqueHandleSchema, credential_id: CredentialIdSchema,
    challenge_handle: OpaqueHandleSchema, credential: WebAuthnAuthenticationCredentialSchema
}).strict().superRefine(ceremonyBodyBound);
export const OwnerPossessionResponseSchema = z.object({ receipt_id: z.uuid(), expires_at: z.iso.datetime() }).strict();
const MutationShape = { expected_revision: RevisionSchema, operation_id: z.uuid(), proof_handle: OpaqueHandleSchema, reason: ReasonSchema };
export const StaffInviteRequestSchema = z.object({ target_user_id: z.uuid(), capabilities: DelegatedStaffCapabilitiesSchema, ...MutationShape }).strict();
/** Raw invitation handles are delivered only to the verified target through the protected outbox. */
export const StaffInviteResponseSchema = z.object({ receipt: SecurityReceiptSchema, invitation_id: z.uuid(), expires_at: z.iso.datetime() }).strict();
export const StaffInvitationOptionsRequestSchema = z.object({ invitation_handle: OpaqueHandleSchema }).strict();
export const StaffInvitationVerifyRequestSchema = z.object({ invitation_handle: OpaqueHandleSchema,
    challenge_handle: OpaqueHandleSchema, credential: WebAuthnAuthenticationCredentialSchema }).strict().superRefine(ceremonyBodyBound);
export const StaffInvitationAcceptRequestSchema = z.object({ invitation_handle: OpaqueHandleSchema,
    proof_handle: OpaqueHandleSchema, expected_revision: RevisionSchema, operation_id: z.uuid() }).strict();
export const StaffTargetParamsSchema = z.object({ staffId: z.uuid() }).strict();
export const StaffGrantRequestSchema = z.object({ capabilities: DelegatedStaffCapabilitiesSchema, ...MutationShape }).strict();
export const StaffDisableModeSchema = z.enum(["OFFBOARD", "COMPROMISE"]) satisfies z.ZodType<StaffDisableMode>;
export const StaffDisableRequestSchema = z.object({ mode: StaffDisableModeSchema, ...MutationShape }).strict();
/** ASCII base64url cursors are opaque to callers and have a byte bound, not a character loophole. */
const CursorSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/u);
const PageLimitSchema = z.union([z.number(), z.string().regex(/^[1-9][0-9]{0,2}$/u).transform(Number)])
    .pipe(z.number().int().min(1).max(100));
export const StaffPageQuerySchema = z.object({ limit: PageLimitSchema, cursor: CursorSchema.optional() }).strict();
export const StaffTeamQuerySchema = StaffPageQuerySchema;
export const StaffAuditQuerySchema = StaffPageQuerySchema;
const DeliveryStateSchema = z.enum(["PENDING", "DELIVERED", "FAILED"]);
export const StaffTeamMemberSchema = z.object({
    staff_id: z.uuid(), pseudonym: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/u),
    status: z.enum(["ACTIVE", "REVOKED", "DISABLED"]), capabilities: ActiveStaffCapabilitiesSchema,
    grant_revision: RevisionSchema, credential_count: RevisionSchema,
    last_privilege_at: z.iso.datetime().nullable(), delivery_state: DeliveryStateSchema
}).strict();
export const StaffTeamPageSchema = z.object({
    members: z.array(StaffTeamMemberSchema).max(100), next_cursor: CursorSchema.nullable(), order: z.literal("CREATED_AT_ID_ASC")
}).strict();
export const StaffAuditEventSchema = z.object({
    event_id: z.uuid(), actor_staff_id: z.uuid().nullable(), subject_staff_id: z.uuid().nullable(),
    event: z.enum(["OWNER_BOOTSTRAPPED", "INVITATION_ISSUED", "INVITATION_ACCEPTED", "GRANTS_CHANGED", "STAFF_DISABLED",
        "OWNER_RECOVERED", "CREDENTIAL_REGISTERED", "CREDENTIAL_REVOKED", "ALLOWANCE_CONFIGURED", "ALLOWANCE_REVOKED"]),
    recorded_at: z.iso.datetime(), reason: ReasonSchema.nullable(), delivery_state: DeliveryStateSchema
}).strict();
export const ThreatReportAuditEventSchema = z.object({
    event_id: z.uuid(), actor_staff_id: z.uuid(),
    event: z.enum(["THREAT_REPORT_LIST", "THREAT_REPORT_READ", "THREAT_REPORT_REPORTED", "THREAT_REPORT_NOT_REPORTED"]),
    threat_report_ref: z.uuid().nullable(), recorded_at: z.iso.datetime()
}).strict();
export const StaffAuditPageSchema = z.object({
    events: z.array(z.union([StaffAuditEventSchema, PublicationReviewAuditEventSchema, ThreatReportAuditEventSchema])).max(100), next_cursor: CursorSchema.nullable(), order: z.literal("RECORDED_AT_ID_ASC")
}).strict();
const ThreatReportBaseSchema = z.object({
    report_ref: z.uuid(), kept_at: z.iso.datetime(), decision: z.enum(["UNREAD", "REPORTED", "NOT_REPORTED"]),
    decided_at: z.iso.datetime().nullable()
}).strict();
export const ThreatReportListSchema = z.object({ reports: z.array(ThreatReportBaseSchema) }).strict();
export const ThreatReportSchema = ThreatReportBaseSchema.extend({
    question: z.string(), account: z.object({ email: z.email(), user_id: z.uuid().nullable() }).strict()
}).strict();
export const ThreatReportSummarySchema = z.object({ unread: z.number().int().nonnegative() }).strict();
export const ThreatReportDecisionRequestSchema = z.object({
    decision: z.enum(["REPORTED", "NOT_REPORTED"]), expected_revision: RevisionSchema,
    operation_id: z.uuid(), proof: OpaqueHandleSchema
}).strict();
export type StaffActionIntent = z.infer<typeof StaffActionIntentSchema>;
export type StaffPrerequisiteStepUpRequest = z.infer<typeof StaffPrerequisiteStepUpRequestSchema>;
export type StaffPrerequisiteResponse = z.infer<typeof StaffPrerequisiteResponseSchema>;
export type StaffEnrollmentResponse = z.infer<typeof StaffEnrollmentResponseSchema>;
export type StaffRegistrationResponse = z.infer<typeof StaffRegistrationResponseSchema>;
export type StaffElevationResponse = z.infer<typeof StaffElevationResponseSchema>;
export type StaffPageQuery = z.infer<typeof StaffPageQuerySchema>;
export type StaffTeamPage = z.infer<typeof StaffTeamPageSchema>;
export type StaffAuditPage = z.infer<typeof StaffAuditPageSchema>;
export const staffContractInventory = Object.freeze({
    policyVersion: 2 as const,
    routes: Object.freeze([
        "GET /v1/admin/enrollment", "POST /v1/admin/prerequisites/step-up",
        "POST /v1/admin/webauthn/registration/options", "POST /v1/admin/webauthn/registration/verify",
        "POST /v1/admin/webauthn/elevation/options", "POST /v1/admin/webauthn/elevation/verify",
        "POST /v1/admin/webauthn/action/options", "POST /v1/admin/webauthn/action/verify",
        "GET /v1/admin/team", "POST /v1/admin/team/invitations",
        "POST /v1/admin/team/invitations/accept/options", "POST /v1/admin/team/invitations/accept/verify", "POST /v1/admin/team/invitations/accept",
        "POST /v1/admin/owner-possession/options", "POST /v1/admin/owner-possession/verify",
        "PATCH /v1/admin/team/{staffId}/grants", "POST /v1/admin/team/{staffId}/disable", "GET /v1/admin/audit",
        "GET /v1/admin/publication-reviews", "GET /v1/admin/publication-reviews/{reviewRef}",
        "POST /v1/admin/publication-reviews/{reviewRef}/approve", "POST /v1/admin/publication-reviews/{reviewRef}/refuse",
        "GET /v1/admin/threat-reports", "GET /v1/admin/threat-reports/summary",
        "GET /v1/admin/threat-reports/{reportRef}", "POST /v1/admin/threat-reports/{reportRef}/decision",
        "GET /v1/admin/team-limit", "POST /v1/admin/team-limit", "POST /v1/admin/team-limit/partner/{staffId}",
        "DELETE /v1/admin/team-limit/partner/{staffId}", "POST /v1/admin/team-limit/practice",
        "GET /v1/admin/public-review", "GET /v1/admin/public-review/{id}", "POST /v1/admin/public-review/{id}/hide", "POST /v1/admin/public-review/{id}/step",
        "GET /v1/admin/public-reports", "POST /v1/admin/public-reports/{id}/dismiss"
    ]),
    resources: Object.freeze({
        StaffCapabilitySchema, DelegatedStaffCapabilitiesSchema, ActiveStaffCapabilitiesSchema, StaffActionSchema,
        ReasonSchema, ActionBindingSchema, SecurityReceiptSchema, StaffPrerequisiteStepUpRequestSchema, StaffPrerequisiteResponseSchema,
        StaffEnrollmentResponseSchema, WebAuthnRegistrationCredentialSchema, WebAuthnAuthenticationCredentialSchema,
        StaffRegistrationOptionsRequestSchema, StaffRegistrationVerifyRequestSchema, StaffRegistrationResponseSchema,
        StaffElevationOptionsRequestSchema, StaffAuthenticationVerifyRequestSchema, StaffElevationResponseSchema,
        StaffActionIntentSchema, StaffActionOptionsRequestSchema, StaffActionVerifyRequestSchema, StaffActionProofResponseSchema, StaffRegistrationOptionsResponseSchema, StaffAuthenticationOptionsResponseSchema,
        OwnerPossessionOptionsRequestSchema, OwnerPossessionVerifyRequestSchema, OwnerPossessionResponseSchema,
        StaffInviteRequestSchema, StaffInviteResponseSchema, StaffInvitationOptionsRequestSchema, StaffInvitationOptionsResponseSchema, StaffInvitationVerifyRequestSchema,
        StaffInvitationAcceptRequestSchema, StaffTargetParamsSchema, StaffGrantRequestSchema, StaffDisableModeSchema, StaffDisableRequestSchema,
        StaffPageQuerySchema, StaffTeamQuerySchema, StaffAuditQuerySchema, StaffTeamMemberSchema, StaffTeamPageSchema, StaffAuditEventSchema, ThreatReportAuditEventSchema, StaffAuditPageSchema,
        ThreatReportListSchema, ThreatReportSchema, ThreatReportSummarySchema, ThreatReportDecisionRequestSchema,
        TeamLimitSetRequestSchema, TeamLimitPartnerRequestSchema, TeamPracticeRequestSchema, TeamLimitPageSchema,
        PublicReviewHideRequestSchema, PublicReviewStepRequestSchema, PublicReviewPageSchema, PublicReviewListSchema,
        PublicFlagQueueSchema, PublicFlagDismissRequestSchema
    })
});

/** Funded v2 is explicitly selected; the historical core-A schemas above stay strict. */
export const FundedActiveStaffCapabilitiesSchema = z.array(StaffCapabilitySchema).max(9)
    .refine(values => new Set(values).size === values.length, "Capabilities must be unique");
export const FundedStaffActionSchema = z.enum([
    ...StaffActionSchema.options, "ALLOWANCE_CONFIGURE", "ALLOWANCE_REVOKE"
]);
export const FundedActionBindingSchema = ActionBindingSchema.extend({ action: FundedStaffActionSchema }).strict();
export const FundedStaffElevationResponseSchema = StaffElevationResponseSchema.extend({ capabilities: FundedActiveStaffCapabilitiesSchema }).strict();
export const FundedStaffTeamMemberSchema = StaffTeamMemberSchema.extend({ capabilities: FundedActiveStaffCapabilitiesSchema }).strict();
export const FundedStaffTeamPageSchema = StaffTeamPageSchema.extend({ members: z.array(FundedStaffTeamMemberSchema).max(100) }).strict();
const FiniteFundingMicrosSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const FundingReasonSchema = z.object({ code: z.literal("FUNDING_APPROVAL"), ticket_ref: TicketReferenceSchema.optional() }).strict();
const FundingMutationShape = { operation_id: z.uuid(), reason: FundingReasonSchema };
const FundingConfigureShape = {
    amount_micros: FiniteFundingMicrosSchema, day_micros: FiniteFundingMicrosSchema, week_micros: FiniteFundingMicrosSchema,
    starts_at: z.iso.datetime(), expires_at: z.iso.datetime(), funding_approval_ref: TicketReferenceSchema,
    ...FundingMutationShape
};
function finiteFundingWindow(value: { amount_micros: number; day_micros: number; week_micros: number; starts_at: string; expires_at: string }, context: z.RefinementCtx): void {
    const duration = Date.parse(value.expires_at) - Date.parse(value.starts_at);
    if (value.day_micros > value.week_micros || value.week_micros > value.amount_micros
        || !Number.isFinite(duration) || duration <= 0 || duration > 2678400000) {
        context.addIssue({ code: "custom", message: "Funding limits and window must be finite and ordered" });
    }
}
const FundedConfigureIntentSchema = z.object({ action: z.literal("ALLOWANCE_CONFIGURE"), ...FundingConfigureShape }).strict().superRefine(finiteFundingWindow);
const FundedRevokeIntentSchema = z.object({ action: z.literal("ALLOWANCE_REVOKE"), grant_id: z.uuid(), ...FundingMutationShape }).strict();
/** Decision 32: the Owner's allowance for a member. The revision is the one the page was looking at; the database's own is what the proof binds. */
const TeamAllowanceMemberShape = { target_staff_id: z.uuid(), expected_revision: RevisionSchema };
const TeamAllowanceConfigureIntentSchema = z.object({ action: z.literal("TEAM_ALLOWANCE_CONFIGURE"), ...TeamAllowanceMemberShape, ...FundingConfigureShape }).strict().superRefine(finiteFundingWindow);
const TeamAllowanceRevokeIntentSchema = z.object({ action: z.literal("TEAM_ALLOWANCE_REVOKE"), ...TeamAllowanceMemberShape, grant_id: z.uuid(), ...FundingMutationShape }).strict();
export type TeamAllowanceIntent = z.infer<typeof TeamAllowanceConfigureIntentSchema> | z.infer<typeof TeamAllowanceRevokeIntentSchema>;
export const FundedStaffActionIntentSchema = z.union([StaffActionIntentSchema, FundedConfigureIntentSchema, FundedRevokeIntentSchema, TeamAllowanceConfigureIntentSchema, TeamAllowanceRevokeIntentSchema]);
export const FundedStaffActionOptionsRequestSchema = z.object({ intent: FundedStaffActionIntentSchema }).strict();
export const FundedStaffActionVerifyRequestSchema = z.object({ intent: FundedStaffActionIntentSchema,
    challenge_handle: OpaqueHandleSchema, credential: WebAuthnAuthenticationCredentialSchema }).strict().superRefine(ceremonyBodyBound);
export const InternalAllowanceConfigureRequestSchema = z.object({ ...FundingConfigureShape, proof_handle: OpaqueHandleSchema }).strict().superRefine(finiteFundingWindow);
export const InternalAllowanceRevokeRequestSchema = z.object({ ...FundingMutationShape, proof_handle: OpaqueHandleSchema }).strict();
export const InternalAllowanceTargetParamsSchema = z.object({ grantId: z.uuid() }).strict();
export const TeamAllowanceConfigureRequestSchema = z.object({ expected_revision: RevisionSchema, ...FundingConfigureShape, proof_handle: OpaqueHandleSchema }).strict().superRefine(finiteFundingWindow);
export const TeamAllowanceRevokeRequestSchema = z.object({ expected_revision: RevisionSchema, ...FundingMutationShape, proof_handle: OpaqueHandleSchema }).strict();
export const TeamAllowanceRevokeParamsSchema = z.object({ staffId: z.uuid(), grantId: z.uuid() }).strict();
const TeamAllowanceMicrosSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const TeamAllowanceLogEntrySchema = z.object({
    kind: z.enum(["GIVEN", "TAKEN_BACK", "ENDED"]), subject_staff_id: z.uuid(), actor_staff_id: z.uuid().nullable(), at: z.string(),
    amount_micros: FiniteFundingMicrosSchema.optional(), day_micros: FiniteFundingMicrosSchema.optional(), week_micros: FiniteFundingMicrosSchema.optional(), expires_at: z.string().optional(),
    cause: z.enum(["STAFF_DISABLED", "ACCOUNT_ERASED", "OWNER_CHANGED"]).optional(), notice: z.enum(["NONE", "WAITING", "SENT", "FAILED"])
}).strict();
export const TeamAllowancePageSchema = z.object({
    limits: z.object({ maximum_grant_micros: FiniteFundingMicrosSchema, maximum_day_micros: FiniteFundingMicrosSchema, maximum_week_micros: FiniteFundingMicrosSchema, maximum_lifetime_ms: FiniteFundingMicrosSchema }).strict(),
    members: z.array(z.object({
        staff_id: z.uuid(), pseudonym: z.string().regex(/^staff-[0-9a-f]{32}$/u), is_owner: z.boolean(), revision: RevisionSchema,
        allowance: z.object({ grant_id: z.uuid(), amount_micros: FiniteFundingMicrosSchema, day_micros: FiniteFundingMicrosSchema, week_micros: FiniteFundingMicrosSchema,
            starts_at: z.string(), expires_at: z.string(), spent_micros: TeamAllowanceMicrosSchema }).strict().nullable()
    }).strict()).max(100),
    log: z.array(TeamAllowanceLogEntrySchema).max(100)
}).strict();
export type TeamAllowancePage = z.infer<typeof TeamAllowancePageSchema>;
export type InternalAllowanceIntent = z.infer<typeof FundedConfigureIntentSchema> | z.infer<typeof FundedRevokeIntentSchema>;
export type FundedStaffActionIntent = z.infer<typeof FundedStaffActionIntentSchema>;
export const fundedStaffContractInventory = Object.freeze({
    fundingPolicyVersion: 1 as const,
    routes: Object.freeze(["POST /v1/admin/internal-allowances", "DELETE /v1/admin/internal-allowances/{grantId}",
        "GET /v1/admin/team-allowances", "POST /v1/admin/team-allowances/{staffId}", "DELETE /v1/admin/team-allowances/{staffId}/{grantId}"] as const),
    resources: Object.freeze({ FundedStaffEnrollmentResponseSchema, SelectedStaffEnrollmentResponseSchema, FundedActiveStaffCapabilitiesSchema, FundedStaffActionSchema, FundedActionBindingSchema,
        FundedStaffElevationResponseSchema, FundedStaffTeamMemberSchema, FundedStaffTeamPageSchema,
        FundedStaffActionIntentSchema, FundedStaffActionOptionsRequestSchema, FundedStaffActionVerifyRequestSchema,
        InternalAllowanceConfigureRequestSchema, InternalAllowanceRevokeRequestSchema, InternalAllowanceTargetParamsSchema,
        TeamAllowanceConfigureRequestSchema, TeamAllowanceRevokeRequestSchema, TeamAllowanceRevokeParamsSchema, TeamAllowancePageSchema })
});
