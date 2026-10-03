/** Pure server-domain types. Wire validation belongs to contract; policy validation to register. */
export type StaffCapability =
  | "TEAM_READ" | "TEAM_INVITE" | "TEAM_GRANT" | "TEAM_DISABLE"
  | "AUDIT_READ" | "EMERGENCY_DISABLE" | "ALLOWANCE_WRITE";
export type StaffDisableMode = "OFFBOARD" | "COMPROMISE";
export type DelegatedStaffCapability = "TEAM_READ" | "AUDIT_READ" | "EMERGENCY_DISABLE";
export type StaffAction =
  | "TEAM_INVITE" | "INVITATION_ACCEPT" | "TEAM_GRANT" | "TEAM_DISABLE" | "EMERGENCY_DISABLE"
  | "CREDENTIAL_REGISTER" | "CREDENTIAL_REVOKE" | "ALLOWANCE_CONFIGURE" | "ALLOWANCE_REVOKE";
export type Reason = Readonly<{
  code: "TEAM_ONBOARDING" | "GRANT_CHANGE" | "OFFBOARDING" | "SECURITY_RESPONSE" | "KEY_MAINTENANCE" | "FUNDING_APPROVAL";
  ticketRef?: string;
}>;
export type ActionBinding = Readonly<{
  action: StaffAction;
  targetId: string;
  bodySha256: string;
  expectedRevision: number;
  operationId: string;
}>;
export type SecurityReceipt = Readonly<{
  operationId: string;
  outcome: "COMPLETED";
  recordedAt: Date;
}>;
export type StaffContext = Readonly<{
  staffId: string;
  userId: string;
  ordinarySessionId: string;
  privilegeSessionId: string;
  designation: "OWNER" | "DELEGATED";
  securityEpoch: number;
  accountSecurityEpoch: number;
  grantRevision: number;
  capabilities: readonly StaffCapability[];
}>;
export type StaffProof = Readonly<{
  proofId: string;
  context: StaffContext;
  binding: ActionBinding;
  credentialId: string;
  verifiedAt: Date;
  expiresAt: Date;
}>;
export type InvitationContext = Readonly<{
  invitationId: string;
  targetUserId: string;
  ordinarySessionId: string;
  issuerStaffId: string;
  issuerSecurityEpoch: number;
  targetAccountSecurityEpoch: number;
  invitationRevision: number;
  expiresAt: Date;
}>;
export type InvitationProof = Readonly<{
  proofId: string;
  purpose: "INVITATION_ACCEPT";
  context: InvitationContext;
  credentialId: string;
  verifiedAt: Date;
  expiresAt: Date;
}>;
export type OwnerCommand = Readonly<{
  commandId: string;
  targetUserId: string;
  targetAccountSecurityEpoch: number;
  credentialIds: readonly [string, string];
  nonceSha256: string;
  expiresAt: Date;
}> & (
  | Readonly<{ purpose: "BOOTSTRAP"; previousOwnerUserId?: never }>
  | Readonly<{ purpose: "RECOVER_OWNER"; previousOwnerUserId?: string }>
);
export type OwnerPossessionContext = Readonly<{
  command: OwnerCommand;
  ordinarySessionId: string;
  prerequisiteReceiptId: string;
}>;
export type OwnerPossessionReceipt = Readonly<{
  receiptId: string;
  commandId: string;
  purpose: OwnerCommand["purpose"];
  targetUserId: string;
  ordinarySessionId: string;
  targetAccountSecurityEpoch: number;
  credentialId: string;
  nonceSha256: string;
  verifiedAt: Date;
  expiresAt: Date;
}>;
export type StaffPrerequisiteReceipt = Readonly<{
  receiptId: string;
  handleSha256: string;
  userId: string;
  ordinarySessionId: string;
  accountSecurityEpoch: number;
  factorReceiptId: string;
  verifiedAt: Date;
  expiresAt: Date;
}> & (
  | Readonly<{ purpose: "KEY_PREREGISTRATION"; registrationChallengeId: string | null }>
  | Readonly<{ purpose: "OWNER_POSSESSION"; commandId: string; nonceSha256: string; credentialIds: readonly [string, string] }>
);
type StaffAccessPolicyBase = Readonly<{
  policyVersion: 2;
  cookieName: "__Host-debateai-staff";
  csrfCookieName: "__Host-debateai-staff-csrf";
  tokenBytes: 32;
  cookieHttpOnly: true;
  csrfCookieHttpOnly: false;
  cookieSecure: true;
  cookiePath: "/";
  cookieSameSite: "Strict";
  tokenStorage: "HASH_ONLY";
  challengeSingleUse: true;
  actionProofSingleUse: true;
  prerequisiteSingleUse: true;
  invitationSingleUse: true;
  ownerCommandSingleUse: true;
  ordinarySessionRequired: true;
  positiveAuthorityCache: false;
  attestation: "none";
  crossOrigin: "DENIED";
  originPolicy: "EXACT_PUBLIC_APP_URL_ORIGIN";
  rpIdPolicy: "EXACT_PUBLIC_APP_URL_HOSTNAME";
  independentAlertRequired: true;
  idleLifetimeMs: 900000;
  absoluteLifetimeMs: 28800000;
  challengeLifetimeMs: 300000;
  actionProofLifetimeMs: 300000;
  prerequisiteLifetimeMs: 300000;
  ownerCommandLifetimeMs: 300000;
  invitationLifetimeMs: 86400000;
  epochPollIntervalMs: 1000;
  externalOperationTimeoutMs: 5000;
  ownerCredentialMinimum: 2;
  delegatedCredentialMinimum: 1;
  userVerification: "required";
  backupEligible: false;
  backedUp: false;
  algorithms: readonly [-7, -257];
  ceremonyBodyMaxBytes: 32768;
  challengeMaxFailures: 5;
  delegatedCapabilities: readonly DelegatedStaffCapability[];
  sourceRef: string;
}>;
export type StaffAccessPolicy = StaffAccessPolicyBase & (
  | Readonly<{ fundingPolicyVersion?: never; activeCapabilities: readonly Exclude<StaffCapability, "ALLOWANCE_WRITE">[] }>
  | Readonly<{ fundingPolicyVersion: 1; activeCapabilities: readonly StaffCapability[] }>
);
export type InternalAllowancePolicy =
  | Readonly<{ enabled: false; sourceRef: string }>
  | Readonly<{
      enabled: true;
      fundingPolicyVersion: 1;
      currency: "USD";
      maximumGrantMicros: number;
      maximumDayMicros: number;
      maximumWeekMicros: number;
      maximumLifetimeMs: number;
      finishAllowanceBp: 10000;
      sourceRef: string;
    }>;
export type FundingBasis =
  | Readonly<{ kind: "SUBSCRIPTION"; planId: "FREE" | "PLUS" | "PRO" | "MAX"; entitlementEventId: string }>
  | Readonly<{ kind: "INTERNAL"; grantId: string; grantEventId: string }>;
export type InternalGrant = Readonly<{
  grantId: string;
  grantEventId: string;
  ownerRef: string;
  revision: number;
  amountMicros: number;
  dayMicros: number;
  weekMicros: number;
  startsAt: Date;
  expiresAt: Date;
  fundingApprovalRef: string;
  policyRegisterVersion: number;
}>;
export type InternalAllowanceConfigure = Readonly<{
  ownerRef: string;
  expectedRevision: number;
  policyRegisterVersion: number;
  amountMicros: number;
  dayMicros: number;
  weekMicros: number;
  startsAt: Date;
  expiresAt: Date;
  fundingApprovalRef: string;
}>;
export type InternalAllowanceRevoke = Readonly<{
  ownerRef: string;
  grantId: string;
  expectedRevision: number;
  policyRegisterVersion: number;
}>;
export interface InternalAllowanceReadPort {
  current(ownerRef: string, now: Date): Promise<InternalGrant | null>;
  forRun(runId: string, now: Date): Promise<InternalGrant | null>;
}
export type StaffAccessEnvironment =
  | Readonly<{ policyVersion: 1 }>
  | Readonly<{ policyVersion: 2; origin: string; rpId: string; independentAlertConfigPath: string; operatorModulePath: string; operatorModuleSha256: string; internalAllowancePolicy?: Extract<InternalAllowancePolicy, { enabled: true }> }>;
