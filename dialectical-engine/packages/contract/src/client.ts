import { SocialStepUpStatusResponseSchema,type SocialStepUpStatusResponse,type CompleteSocialStepUpRequest } from './index.js';
import { SocialLoginStatusResponseSchema, type SocialLoginStatusResponse, AuthProvidersResponseSchema, BeginSocialLoginResponseSchema, SocialSignupStatusResponseSchema, CompleteSocialSignupResponseSchema, SocialLinksResponseSchema, type AuthProvidersResponse, type SocialSignupStatusResponse, type CompleteSocialSignupRequest, type CompleteSocialSignupResponse, type SocialLinksResponse } from './social-auth.js';
import {ConsumerRecoveryProofResponseSchema,RecoveryEnrollmentOptionsResponseSchema,OnboardingRequirementsResponseSchema,
 type ConsumerRecoveryProveRequest,type ConsumerRecoveryProofResponse,type RecoveryEnrollmentBeginRequest,type RecoveryEnrollmentCompleteRequest,type RecoveryEnrollmentOptionsResponse,type PendingOnboardingStatusRequest,type PendingOnboardingCompleteRequest,type RecoveryEvidenceStatusRequest,type RecoveryEvidenceCompleteRequest,type OnboardingRequirementsResponse} from './consumer-auth.js';
import {AuthMethodsResponseSchema,RecoveryCodesResponseSchema,type AuthMethodsResponse} from "./index.js";
import type {ConsumerAuthenticationCredential} from "./consumer-auth.js";
import type { StepUpAuthorizationRequest, StepUpResponse } from "./index.js";
import {PasskeyRegistrationOptionsResponseSchema, PasskeyAuthenticationOptionsResponseSchema, PasskeyEnrollmentResponseSchema,
 type BeginPasskeyEnrollmentRequest,type CompletePasskeyEnrollmentRequest,type BeginPasskeyLoginRequest,type CompletePasskeyLoginRequest,
 type PasskeyRegistrationOptionsResponse,type PasskeyAuthenticationOptionsResponse,type PasskeyEnrollmentResponse} from './consumer-auth.js';
import {
  AuthenticationResponseSchema, BeginTotpEnrollmentRequestSchema, CompleteTotpEnrollmentRequestSchema, TotpEnrollmentOptionsResponseSchema, TotpEnrollmentResponseSchema, LoginContinuationResponseSchema,
  type BeginTotpEnrollmentRequest, type CompleteTotpEnrollmentRequest, type TotpEnrollmentOptionsResponse, type TotpEnrollmentResponse, type LoginContinuationResponse,
  REGISTRATION_PUBLIC_MESSAGE,
  RESEND_VERIFICATION_PUBLIC_MESSAGE,
  RegisterRequestSchema,
  ResendVerificationRequestSchema,
  RegistrationVerificationAckSchema,
  ResendVerificationAckSchema,
  type RegisterRequest,
  type ResendVerificationRequest,
  type VerificationAck,
  type AuthenticationResponse,
  AccountEmailSchema,
  AccountPhoneProfileSchema,PhoneProfileRevealSchema,PhoneProfileRevealRequestSchema,PhoneProfileUpdateRequestSchema,
  RecoveryEmailSettingsSchema,RecoveryEmailRequestSchema,RecoveryEmailRemoveRequestSchema,
  type AccountPhoneProfile,type PhoneProfileReveal,type RecoveryEmailSettings,
  AccountErasureCancelRequestSchema,
  AgeCheckResultSchema,
  AgeConfirmationStatusSchema,
  SENSITIVE_DATA_NOTICE_VERSION,
  SensitiveDataConsentStatusSchema,
  type SensitiveDataConsentStatus,
  type AgeCheckResult,
  type AgeConfirmationStatus,
  LegalStatusResponseSchema,
  type LegalAcceptRequest,
  type LegalStatusResponse,
  GeoAvailabilityResponseSchema,
  type GeoAvailabilityResponse,
  EmailChangeCancelledSchema,
  EmailChangeConfirmedSchema,
  EmailChangeLinkRequestSchema,
  EmailChangePendingSchema,
  EmailChangeRequestSchema,
  AccountErasureCancelledSchema,
  AccountErasureStatusSchema,
  AnswerSchema,
  AnswerIndexSchema,
  AnswerStorySchema,
  AnswerDisclosureSchema,
  AskAcceptedSchema,
  AskAlreadyWaitingSchema,
  AskRoomResponseSchema,
  BillingCancelLinkAcceptedSchema,
  BillingCardChangeResponseSchema,
  BillingPlansResponseSchema,
  BillingQuoteRequestSchema,
  BillingQuoteResponseSchema,
  BillingCheckoutPendingErrorSchema,
  BillingCheckoutRequestSchema,
  BillingCheckoutResponseSchema,
  BillingChargeStatusResponseSchema,
  BillingInvoicesResponseSchema,
  BillingSubscriptionResponseSchema,
  BillingUpgradeQuoteResponseSchema,
  BillingUpgradeResponseSchema,
  BillingUsageResponseSchema,
  BillingWithdrawResponseSchema,
  DeploymentSchema,
  ExecutionLedgerDigestSchema,
  InspectionSchema,
  InvestigationAcceptedSchema,
  LegacyRunClaimRequestSchema,
  LegacyRunClaimResultSchema,
  NodeSchema,
  PrivateDebateErasureStatusSchema,
  PublicationTransitionSchema,
  PublicationContentRefusalSchema,
  type PublicationRefusalStatement,
  PublicDebateListSchema,
  PublicDebateSchema,
  RunEventSchema,
  RunProjectionSchema,
  RevokeAllSessionsSchema,
  SessionListSchema,
  SessionSchema,
  StepUpResponseSchema,
  type Answer,
  type AnswerIndex,
  type AnswerStory,
  type AccountEmail,
  type AnswerDisclosure,
  type AskAccepted,
  type AskRequest,
  type AskRoomResponse,
  type BillingCardChangeResponse,
  type BillingPlansResponse,
  type BillingQuoteRequest,
  type BillingQuoteResponse,
  type BillingCheckoutPendingResponse,
  type BillingCheckoutRequest,
  type BillingCheckoutResponse,
  type BillingChargeStatusResponse,
  type BillingInvoicesResponse,
  type BillingSubscriptionResponse,
  type BillingUpgradeQuoteResponse,
  type BillingUpgradeResponse,
  type BillingUsageResponse,
  type BillingWithdrawResponse,
  type Deployment,
  type EmailChangePending,
  type ExecutionLedgerDigest,
  type Inspection,
  type InvestigationAccepted,
  type InvestigationRequest,
  type Node,
  type PlanTier,
  type PublicDebate,
  type RunEvent,
  type RunProjection,
  type Session,
  type SessionList
} from "./index.js";
import type { DeclaredRegion } from "@debateai/kernel";

export type ContractErrorCode =
  | "SESSION_REQUIRED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "MALFORMED_REQUEST"
  | "UNPROCESSABLE"
  | "FORBIDDEN"
  | "SERVER_FAILURE"
  | "NETWORK_FAILURE"
  | "INVALID_RESPONSE";

/** What a 422 ASK_ALREADY_WAITING says about the person's waiting run. */
export type ContractWaitingRefusal = Readonly<{ runRef: string; waitsUntil: string; waitsFor?: "OWN_DEBATES" }>;

export class ContractHttpError extends Error {
  constructor(
    readonly code: ContractErrorCode,
    readonly status: number,
    message: string,
    readonly serverCode: string | null = null,
    readonly statement: PublicationRefusalStatement | null = null,
    /**
     * Budget spec §2.7: set only for 422 ASK_ALREADY_WAITING whose body parses
     * as `AskAlreadyWaitingSchema`: the waiting run and its expected start (no
     * figure), and `waitsFor` when that start waits on the person's own running
     * debates rather than a reset (final review Part 1b, Important 1). The ask
     * page shows sentence D with that time when its room re-read fails.
     */
    readonly waiting: ContractWaitingRefusal | null = null
  ) {
    super(message);
    this.name = "ContractHttpError";
  }
}

function codeForStatus(status: number): ContractErrorCode {
  if (status === 400) return "MALFORMED_REQUEST";
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 422) return "UNPROCESSABLE";
  if (status === 429) return "RATE_LIMITED";
  return "SERVER_FAILURE";
}

async function contractErrorForResponse(response: Response): Promise<ContractHttpError> {
  let serverCode: string | null = null;
  let serverMessage: string | null = null;
  let statement: PublicationRefusalStatement | null = null;
  let waiting: ContractWaitingRefusal | null = null;
  try {
    const candidate: unknown = await response.json();
    if (response.status === 409) {
      const refusal = PublicationContentRefusalSchema.safeParse(candidate);
      if (refusal.success) statement = refusal.data.statement;
    }
    if (typeof candidate === "object" && candidate !== null) {
      const body = candidate as Record<string, unknown>;
      serverCode = typeof body.error === "string" && body.error.trim().length > 0 ? body.error : null;
      serverMessage = typeof body.message === "string" && body.message.trim().length > 0 ? body.message : null;
      const refusal = response.status === 422 ? AskAlreadyWaitingSchema.safeParse(body) : null;
      if (refusal?.success === true) {
        waiting = Object.freeze({
          runRef: refusal.data.run_ref,
          waitsUntil: refusal.data.waits_until,
          ...(refusal.data.waits_for === undefined ? {} : { waitsFor: refusal.data.waits_for })
        });
      }
    }
  } catch {
    // A non-JSON failure still retains its transport status below.
  }
  const detail = serverCode !== null && serverMessage !== null
    ? `${serverCode}: ${serverMessage}`
    : serverCode ?? serverMessage ?? `Contract request failed with ${response.status}`;
  return new ContractHttpError(codeForStatus(response.status), response.status, detail, serverCode, statement, waiting);
}

async function requestJson<T>(
  baseUrl: string,
  fetchImplementation: typeof fetch,
  path: string,
  schema: { parse(value: unknown): T },
  init: RequestInit = {},
  auth: ContractClientAuth,
  expectedStatus?: number,
  /** A documented refusal the caller reads as data (P8c: 409 CHECKOUT_PENDING); `null` keeps the error. */
  recover?: (status: number, body: unknown) => T | null
): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    if (auth.cookieHeader !== undefined) headers.set("cookie", auth.cookieHeader);
    if (auth.userAgent !== undefined) headers.set("user-agent", auth.userAgent);
    if (auth.forwardedFor !== undefined) headers.set("x-forwarded-for", auth.forwardedFor);
    if (init.method !== undefined && !["GET", "HEAD"].includes(init.method.toUpperCase())) {
      const csrf = auth.csrfToken?.() ?? browserCsrfToken();
      if (csrf !== null) headers.set("x-csrf-token", csrf);
    }
    if (init.body !== undefined) headers.set("content-type", "application/json");
    response = await fetchImplementation(new URL(path, baseUrl), {
      ...init,
      headers,
      cache: "no-store",
      credentials: "same-origin" as const
    });
  } catch (error) {
    throw new ContractHttpError("NETWORK_FAILURE", 0, error instanceof Error ? error.message : "Network failure");
  }
  if (!response.ok) {
    if (recover !== undefined) {
      // A clone, so the error path below still reads the body when the hook declines.
      const body: unknown = await response.clone().json().catch(() => null);
      const recovered = recover(response.status, body);
      if (recovered !== null) return recovered;
    }
    throw await contractErrorForResponse(response);
  }
  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    throw new ContractHttpError(
      "INVALID_RESPONSE",
      response.status,
      `Expected contract response status ${expectedStatus}, received ${response.status}`
    );
  }
  try {
    return schema.parse(await response.json());
  } catch (error) {
    throw new ContractHttpError("INVALID_RESPONSE", response.status, error instanceof Error ? error.message : "Invalid response");
  }
}

async function requestNoContent(
  baseUrl: string,
  fetchImplementation: typeof fetch,
  path: string,
  init: RequestInit,
  auth: ContractClientAuth
): Promise<void> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    if (auth.cookieHeader !== undefined) headers.set("cookie", auth.cookieHeader);
    if (auth.userAgent !== undefined) headers.set("user-agent", auth.userAgent);
    if (auth.forwardedFor !== undefined) headers.set("x-forwarded-for", auth.forwardedFor);
    const csrf = auth.csrfToken?.() ?? browserCsrfToken();
    if (csrf !== null) headers.set("x-csrf-token", csrf);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    response = await fetchImplementation(new URL(path, baseUrl), {
      ...init,
      headers,
      cache: "no-store",
      credentials: "same-origin" as const
    });
  } catch (error) {
    throw new ContractHttpError("NETWORK_FAILURE", 0, error instanceof Error ? error.message : "Network failure");
  }
  if (!response.ok) throw await contractErrorForResponse(response);
  if (response.status !== 204) {
    throw new ContractHttpError("INVALID_RESPONSE", response.status, "Expected an empty session mutation response");
  }
}

export type ContractClientAuth = Readonly<{
    mode: "cookie";
    /** Server-side rendering only; browser code relies on the cookie jar. */
    cookieHeader?: string;
    /** Server-side rendering only; preserves the browser UA used to bind the session. */
    userAgent?: string;
    /** Server-side rendering only; the visitor address the UI edge vouched for, so per-source
     * budgets and the audit source see the visitor rather than the SSR hop (DL3-F1). */
    forwardedFor?: string;
    csrfToken?: () => string | null;
  }>;

function browserCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie;
  if (/[\r\n\0]/.test(raw)) return null;
  const values = raw.split(";").flatMap((member) => {
    const index = member.indexOf("=");
    if (index < 1 || member.slice(0, index).trim() !== "__Host-debateai-csrf") return [];
    const value = member.slice(index + 1).trim();
    return [value];
  });
  return values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(values[0]!) ? values[0]! : null;
}

const RECOVERY_START_PUBLIC_MESSAGE =
  "If this account can be recovered, instructions will arrive through an eligible channel." as const;

function exactPublicMessageSchema<const Message extends string>(message: Message): {
  parse(value: unknown): Readonly<{ message: Message }>;
} {
  return Object.freeze({
    parse(value: unknown) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new TypeError("Invalid public auth response");
      }
      const row = value as Record<string, unknown>;
      if (Object.keys(row).length !== 1 || row.message !== message) {
        throw new TypeError("Invalid public auth response");
      }
      return Object.freeze({ message });
    }
  });
}

const RecoveryStartPublicResponseSchema = exactPublicMessageSchema(RECOVERY_START_PUBLIC_MESSAGE);

export interface ContractClient {
  /** Age gate: answers `refused` (and sets the lockout cookie) for anyone under the minimum age. */
  checkAge(dateOfBirth: string): Promise<AgeCheckResult>;
  register(input: RegisterRequest): Promise<VerificationAck>;
  resendVerification(input: ResendVerificationRequest): Promise<VerificationAck>;
  startRecovery(email: string): Promise<Readonly<{
    message: typeof RECOVERY_START_PUBLIC_MESSAGE;
  }>>;
  beginSocialStepUp(provider:'google'|'apple'|'facebook'|'x',authorization:StepUpAuthorizationRequest):Promise<{authorization_url:string}>;
  socialStepUpStatus(continuationToken:string):Promise<SocialStepUpStatusResponse>;
  beginSocialStepUpPasskey(continuationToken:string):Promise<PasskeyAuthenticationOptionsResponse>;
  completeSocialStepUp(input:CompleteSocialStepUpRequest):Promise<StepUpResponse>;
  authProviders():Promise<AuthProvidersResponse>;
  beginSocialLogin(provider:'google'|'apple'|'facebook'|'x',input?:{next?:'/'|'/new'|'/settings'|'/settings/security'|'/account'}):Promise<{authorization_url:string}>;
  socialLoginStatus(continuationToken:string):Promise<SocialLoginStatusResponse>;
  socialSignupStatus(input:{continuation_token:string}):Promise<SocialSignupStatusResponse>;
  completeSocialSignup(input:CompleteSocialSignupRequest):Promise<CompleteSocialSignupResponse>;
  linkedSocialProviders():Promise<SocialLinksResponse>;
  beginSocialLink(provider:'google'|'apple'|'facebook'|'x',grant:string):Promise<{authorization_url:string}>;
  unlinkSocialProvider(provider:'google'|'apple'|'facebook'|'x',grant:string):Promise<void>;
  beginPasskeyEnrollment(input:BeginPasskeyEnrollmentRequest):Promise<PasskeyRegistrationOptionsResponse>;
  completePasskeyEnrollment(input:CompletePasskeyEnrollmentRequest):Promise<PasskeyEnrollmentResponse>;
  beginPasskeyLogin(input?:BeginPasskeyLoginRequest):Promise<PasskeyAuthenticationOptionsResponse>;
  completePasskeyLogin(input:CompletePasskeyLoginRequest):Promise<AuthenticationResponse>;
  beginTotpEnrollment(input:BeginTotpEnrollmentRequest):Promise<TotpEnrollmentOptionsResponse>;
  completeTotpEnrollment(input:CompleteTotpEnrollmentRequest):Promise<TotpEnrollmentResponse>;
  beginLogin(email: string, password: string): Promise<LoginContinuationResponse>;
  completeLogin(challengeToken: string, code: string): Promise<AuthenticationResponse>;
  logout(): Promise<void>;
  listSessions(): Promise<SessionList>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllSessions(): Promise<{ revoked: number }>;
  /** Existing accounts without an age record answer `required` (the one-time 8k interstitial). */
  readAgeConfirmation(): Promise<AgeConfirmationStatus>;
  /** `refused` freezes the account, ends its sessions and sets the lockout cookie. */
  confirmAge(dateOfBirth: string): Promise<AgeCheckResult>;
  /** `required` until the account agrees, once, before its first debate. */
  readSensitiveDataConsent(): Promise<SensitiveDataConsentStatus>;
  /** Agrees to the current sensitive-data notice, shown in `locale`. */
  giveSensitiveDataConsent(locale: string): Promise<SensitiveDataConsentStatus>;
  recoveryProve(input:ConsumerRecoveryProveRequest):Promise<ConsumerRecoveryProofResponse>;
  beginRecoveryEnrollment(input:RecoveryEnrollmentBeginRequest):Promise<RecoveryEnrollmentOptionsResponse>;
  completeRecoveryEnrollment(input:RecoveryEnrollmentCompleteRequest):Promise<AuthenticationResponse>;
  pendingOnboardingStatus(input:PendingOnboardingStatusRequest):Promise<OnboardingRequirementsResponse>;
  completePendingOnboarding(input:PendingOnboardingCompleteRequest):Promise<void>;
  recoveryEnrollmentStatus(input:RecoveryEvidenceStatusRequest):Promise<OnboardingRequirementsResponse>;
  completeRecoveryEvidence(input:RecoveryEvidenceCompleteRequest):Promise<void>;
  authMethods():Promise<AuthMethodsResponse>;
  removeAuthMethod(factorId:string,grant:string):Promise<void>;
  regenerateRecoveryCodes(grant:string):Promise<{codes:string[]}>;
  beginPasskeyStepUp(authorization:StepUpAuthorizationRequest):Promise<PasskeyAuthenticationOptionsResponse>;
  completePasskeyStepUp(input:{challenge_handle:string;credential:ConsumerAuthenticationCredential}):Promise<StepUpResponse>;
  stepUp(password:string,code:string,authorization?:StepUpAuthorizationRequest):Promise<StepUpResponse>;
  readPublicDebates(limit: number, offset: number): Promise<Readonly<{
    items: readonly Readonly<{
      public_ref: string;
      author_pseudonym: string;
      question: string;
      published_at: string;
      verdict: "SUPPORTED" | "CONTESTED" | "UNSUPPORTED" | null;
      confidence_band: string | null;
    }>[];
    total: number;
  }>>;
  readPublicDebate(publicationRef: string): Promise<PublicDebate>;
  readRunVisibility(runId: string): Promise<{ state: "PRIVATE" | "PUBLISHED"; public_ref: string | null }>;
  publishRun(runId: string, stepUpGrant: string): Promise<{ state: "PRIVATE" | "PUBLISHED"; public_ref: string | null }>;
  unpublishRun(runId: string, stepUpGrant: string): Promise<{ state: "PRIVATE" | "PUBLISHED"; public_ref: string | null }>;
  scheduleAccountErasure(stepUpGrant:string):Promise<{
    status:"SCHEDULED"|"DUE"|"PROCESSING";execute_at:string;cancellation_ref:string;
  }>;
  readAccountErasure():Promise<
    | { status:"NONE" }
    | { status:"SCHEDULED"|"DUE"|"PROCESSING";execute_at:string;cancellation_ref:string }
  >;
  cancelAccountErasure(cancellationRef:string):Promise<{ status:"CANCELLED" }>;
  deletePrivateDebate(runId:string,stepUpGrant:string):Promise<{
    status:"CLEANED"|"PENDING";
  }>;
  claimLegacyRuns(legacyToken:string):Promise<{
    status:"CLAIMED"|"NO_MATCH";claimed_count:number;
  }>;
  /** Paid plans L4: the documents this person must accept again before the page shows. */
  getLegalStatus(locale: string): Promise<LegalStatusResponse>;
  acceptLegal(input: LegalAcceptRequest): Promise<void>;
  /** Paid plans G3a: whether this address may sign up and pay — two booleans, never the country. */
  getGeoAvailability(): Promise<GeoAvailabilityResponse>;
  readAccountEmail(): Promise<AccountEmail>;
  phoneProfile():Promise<AccountPhoneProfile>;
  revealPhoneProfile(grantToken:string):Promise<PhoneProfileReveal>;
  updatePhoneProfile(input:Readonly<{phone:string;grantToken:string}>):Promise<AccountPhoneProfile>;
  recoveryEmail():Promise<RecoveryEmailSettings>;
  requestRecoveryEmail(input:Readonly<{email:string;grantToken:string}>):Promise<RecoveryEmailSettings>;
  confirmRecoveryEmail(input:Readonly<{token:string}>):Promise<{status:"CONFIRMED"}>;
  removeRecoveryEmail(input:Readonly<{grantToken:string}>):Promise<void>;
  requestEmailChange(newEmail: string, stepUpGrant: string): Promise<EmailChangePending>;
  resendEmailChange(): Promise<EmailChangePending>;
  cancelEmailChange(): Promise<void>;
  confirmEmailChange(token: string): Promise<{ status: "CONFIRMED" }>;
  cancelEmailChangeByLink(token: string): Promise<{ status: "CANCELLED" }>;
  submitAsk(input: AskRequest): Promise<AskAccepted>;
  /** Budget spec §2.7: the room this ask would find — a word, never a figure. */
  getAskRoom(input: Readonly<{
    plan_tier: PlanTier;
    composition_budget_tier: "low" | "medium" | "high";
    depth: number;
  }>): Promise<AskRoomResponse>;
  /** Paid-plans spec §1.2 (U1): the person's windows as whole percentages; 404 when billing is off. */
  getBillingUsage(): Promise<BillingUsageResponse>;
  /** Paid-plans spec §2.5.3: the public plans list; 404 when billing is off. */
  getBillingPlans(): Promise<BillingPlansResponse>;
  createBillingQuote(input: BillingQuoteRequest): Promise<BillingQuoteResponse>;
  /** A payment already on its way for the open checkout resolves as `{state: "PENDING", charge_ref}` (409 CHECKOUT_PENDING). */
  startBillingCheckout(input: BillingCheckoutRequest): Promise<BillingCheckoutResponse | BillingCheckoutPendingResponse>;
  getBillingCharge(chargeRef: string): Promise<BillingChargeStatusResponse>;
  getBillingSubscription(): Promise<BillingSubscriptionResponse>;
  getBillingInvoices(): Promise<BillingInvoicesResponse>;
  downgradeSubscription(planId: "PLUS" | "PRO"): Promise<void>;
  cancelSubscription(): Promise<void>;
  revokeSubscriptionCancel(): Promise<void>;
  /** P12c: the prorated upgrade price with tax and the new plan's recurring total; spend it with `upgradeSubscription`. */
  quoteSubscriptionUpgrade(planId: "PRO" | "MAX"): Promise<BillingUpgradeQuoteResponse>;
  upgradeSubscription(planId: "PRO" | "MAX", quoteRef: string): Promise<BillingUpgradeResponse>;
  /** P12d: withdraw within the 14 days with a WITHDRAW_SUBSCRIPTION step-up grant; `refund` null = the owner settles it. */
  withdrawSubscription(stepUpGrant: string): Promise<BillingWithdrawResponse>;
  /** P12e: the card form's signed 1.00 USD authorization order, released once the new card is seen. */
  startCardChange(): Promise<BillingCardChangeResponse>;
  /** P13 (A25): always `{status: "ACCEPTED"}`; a link reaches the billing address only if there is a plan to cancel. */
  requestCancelLink(email: string): Promise<{ status: "ACCEPTED" }>;
  /**
   * P13: spends the emailed link's token once; 404 CANCEL_LINK_INVALID when it is unknown, spent or expired; 409
   * NOTHING_TO_CANCEL (W10) when the token was good but its plan had nothing left to cancel.
   */
  cancelByToken(token: string): Promise<void>;
  readSession(): Promise<Session>;
  readDeployment(): Promise<Deployment>;
  readAnswerIndex(limit: number, offset: number): Promise<AnswerIndex>;
  readAnswer(answerId: string, version?: number): Promise<Answer>;
  readRunAnswer(runId: string): Promise<Answer>;
  readRun(runId: string): Promise<RunProjection>;
  readInspection(answerId: string, version?: number): Promise<Inspection>;
  readLedgerDigest(answerId: string): Promise<ExecutionLedgerDigest>;
  readAnswerStory(answerId: string): Promise<AnswerStory>;
  readAnswerDisclosure(answerId: string): Promise<AnswerDisclosure>;
  readNode(answerId: string, nodeId: string): Promise<Node>;
  recordInvestigation(answerId: string, gapRef: string, input: InvestigationRequest): Promise<InvestigationAccepted>;
  unlinkMemory(answerId: string): Promise<{ memory_link_id: string; state: "UNLINKED" }>;
  readEvents(runId: string): Promise<readonly RunEvent[]>;
  streamEvents(runId: string, consume: (event: RunEvent) => void, signal?: AbortSignal): Promise<void>;
}

const UnlinkSchema = { parse(value: unknown) {
  if (typeof value !== "object" || value === null) throw new TypeError("Invalid unlink response");
  const row = value as Record<string, unknown>;
  if (typeof row.memory_link_id !== "string" || row.state !== "UNLINKED") throw new TypeError("Invalid unlink response");
  return { memory_link_id: row.memory_link_id, state: "UNLINKED" as const };
} };

export function createContractClient(
  baseUrl: string,
  fetchImplementation: typeof fetch = fetch,
  auth: ContractClientAuth = { mode: "cookie" }
): ContractClient {
  const root = new URL(baseUrl);
  const versionQuery = (version?: number) => version === undefined ? "" : `?version=${encodeURIComponent(String(version))}`;
  const request = <T>(
    path: string,
    schema: { parse(value: unknown): T },
    init: RequestInit = {},
    expectedStatus?: number
  ) => requestJson(root.href, fetchImplementation, path, schema, init, auth, expectedStatus);
  async function register(input: RegisterRequest): Promise<VerificationAck> {
    return request("/v1/auth/register", RegistrationVerificationAckSchema,
      {method:"POST",body:JSON.stringify(RegisterRequestSchema.parse(input))},202);
  }
  async function resendVerification(input: ResendVerificationRequest): Promise<VerificationAck> {
    return request("/v1/auth/resend-verification", ResendVerificationAckSchema,
      { method: "POST", body: JSON.stringify(ResendVerificationRequestSchema.parse(input)) }, 202);
  }
  const eventResponse = async (runId: string, signal?: AbortSignal): Promise<Response> => {
    let response: Response;
    try {
      const headers = new Headers();
      if (auth.cookieHeader !== undefined) headers.set("cookie", auth.cookieHeader);
      if (auth.userAgent !== undefined) headers.set("user-agent", auth.userAgent);
      if (auth.forwardedFor !== undefined) headers.set("x-forwarded-for", auth.forwardedFor);
      response = await fetchImplementation(new URL(`/v1/runs/${encodeURIComponent(runId)}/events`, root), {
        headers,
        cache: "no-store",
        credentials: "same-origin" as const,
        ...(signal === undefined ? {} : { signal })
      });
    } catch (error) {
      if (signal?.aborted === true) throw error;
      throw new ContractHttpError("NETWORK_FAILURE", 0, error instanceof Error ? error.message : "Network failure");
    }
    if (!response.ok) throw await contractErrorForResponse(response);
    return response;
  };
  const parseFrame = (frame: string): RunEvent | null => {
    const data = frame.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (data.length === 0) return null;
    try {
      return RunEventSchema.parse(JSON.parse(data));
    } catch (error) {
      throw new ContractHttpError("INVALID_RESPONSE", 200, error instanceof Error ? error.message : "Invalid event response");
    }
  };
  return Object.freeze({
    checkAge: (dateOfBirth: string) => request(
      "/v1/auth/age-check",
      AgeCheckResultSchema,
      { method: "POST", body: JSON.stringify({ date_of_birth: dateOfBirth }) }
    ),
    register,
    readAgeConfirmation: () => request("/v1/auth/age-confirmation", AgeConfirmationStatusSchema),
    confirmAge: (dateOfBirth: string) => request(
      "/v1/auth/age-confirmation",
      AgeCheckResultSchema,
      { method: "POST", body: JSON.stringify({ date_of_birth: dateOfBirth }) }
    ),
    readSensitiveDataConsent: () => request("/v1/account/sensitive-data-consent", SensitiveDataConsentStatusSchema),
    giveSensitiveDataConsent: (locale: string) => request(
      "/v1/account/sensitive-data-consent",
      SensitiveDataConsentStatusSchema,
      { method: "POST", body: JSON.stringify({ notice_version: SENSITIVE_DATA_NOTICE_VERSION, locale }) }
    ),
    resendVerification,
    startRecovery: (email: string) => request(
      "/v1/auth/recovery/start",
      RecoveryStartPublicResponseSchema,
      { method: "POST", body: JSON.stringify({ email }) },
      202
    ),
    beginTotpEnrollment:(input:BeginTotpEnrollmentRequest)=>request('/v1/auth/mfa/totp/begin',TotpEnrollmentOptionsResponseSchema,{method:'POST',body:JSON.stringify(BeginTotpEnrollmentRequestSchema.parse(input))}),
    completeTotpEnrollment:(input:CompleteTotpEnrollmentRequest)=>request('/v1/auth/mfa/totp/verify',TotpEnrollmentResponseSchema,{method:'POST',body:JSON.stringify(CompleteTotpEnrollmentRequestSchema.parse(input))}),
    beginLogin:(email:string,password:string)=>request('/v1/auth/login',LoginContinuationResponseSchema,{method:'POST',body:JSON.stringify({email,password})}),
    completeLogin: (challengeToken: string, code: string) => request(
      "/v1/auth/login", AuthenticationResponseSchema,
      { method: "POST", body: JSON.stringify({ challenge_token: challengeToken, code }) }
    ),
    async logout() {
      let response: Response;
      const headers = new Headers();
      if (auth.cookieHeader !== undefined) headers.set("cookie", auth.cookieHeader);
      if (auth.userAgent !== undefined) headers.set("user-agent", auth.userAgent);
      if (auth.forwardedFor !== undefined) headers.set("x-forwarded-for", auth.forwardedFor);
      const csrf = auth.csrfToken?.() ?? browserCsrfToken();
      if (csrf !== null) headers.set("x-csrf-token", csrf);
      try {
        response = await fetchImplementation(new URL("/v1/auth/logout", root), {
          method: "POST", headers, cache: "no-store",
          credentials: "same-origin" as const
        });
      } catch (error) {
        throw new ContractHttpError("NETWORK_FAILURE", 0, error instanceof Error ? error.message : "Network failure");
      }
      if (!response.ok) throw await contractErrorForResponse(response);
    },
    beginSocialStepUp:(provider:'google'|'apple'|'facebook'|'x',authorization:StepUpAuthorizationRequest)=>request(`/v1/account/social/${provider}/step-up/begin`,BeginSocialLoginResponseSchema,{method:'POST',body:JSON.stringify({authorization,next:'/settings/security'})}),
    socialStepUpStatus:(continuationToken:string)=>request('/v1/account/social/step-up/status',SocialStepUpStatusResponseSchema,{method:'POST',body:JSON.stringify({continuation_token:continuationToken})}),
    beginSocialStepUpPasskey:(continuationToken:string)=>request('/v1/account/social/step-up/passkey-options',PasskeyAuthenticationOptionsResponseSchema,{method:'POST',body:JSON.stringify({continuation_token:continuationToken})}),
    completeSocialStepUp:(input:CompleteSocialStepUpRequest)=>request('/v1/account/social/step-up/complete',StepUpResponseSchema,{method:'POST',body:JSON.stringify(input)}),
    authProviders:()=>request('/v1/auth/providers',AuthProvidersResponseSchema),
    beginSocialLogin:(provider:"google"|"apple"|"facebook"|"x",input:{next?:"/"|"/new"|"/settings"|"/settings/security"|"/account"}={})=>request(`/v1/auth/social/${provider}/begin`,BeginSocialLoginResponseSchema,{method:'POST',body:JSON.stringify(input)}),
    socialLoginStatus:(continuationToken:string)=>request('/v1/auth/social/login/status',SocialLoginStatusResponseSchema,{method:'POST',body:JSON.stringify({continuation_token:continuationToken})}),
    socialSignupStatus:(input:{continuation_token:string})=>request('/v1/auth/social/signup/status',SocialSignupStatusResponseSchema,{method:'POST',body:JSON.stringify(input)}),
    completeSocialSignup:(input:CompleteSocialSignupRequest)=>request('/v1/auth/social/signup/complete',CompleteSocialSignupResponseSchema,{method:'POST',body:JSON.stringify(input)}),
    linkedSocialProviders:()=>request('/v1/account/social-providers',SocialLinksResponseSchema),
    beginSocialLink:(provider:"google"|"apple"|"facebook"|"x",grant:string)=>request(`/v1/account/social/${provider}/link`,BeginSocialLoginResponseSchema,{method:'POST',body:JSON.stringify({step_up_grant:grant,next:'/settings/security'})}),
    unlinkSocialProvider:(provider:"google"|"apple"|"facebook"|"x",grant:string)=>requestNoContent(root.href,fetchImplementation,'/v1/account/social/unlink',{method:'POST',body:JSON.stringify({provider,step_up_grant:grant})},auth),
    beginPasskeyEnrollment:(input:BeginPasskeyEnrollmentRequest)=>request('/v1/auth/passkeys/enrollment/options',PasskeyRegistrationOptionsResponseSchema,{method:'POST',body:JSON.stringify(input)}),
    completePasskeyEnrollment:(input:CompletePasskeyEnrollmentRequest)=>request('/v1/auth/passkeys/enrollment/complete',PasskeyEnrollmentResponseSchema,{method:'POST',body:JSON.stringify(input)}),
    beginPasskeyLogin:(input:BeginPasskeyLoginRequest={})=>request('/v1/auth/passkeys/login/options',PasskeyAuthenticationOptionsResponseSchema,{method:'POST',body:JSON.stringify(input)}),
    completePasskeyLogin:(input:CompletePasskeyLoginRequest)=>request('/v1/auth/passkeys/login/complete',AuthenticationResponseSchema,{method:'POST',body:JSON.stringify(input)}),
    listSessions: () => request("/v1/auth/sessions", SessionListSchema),
    revokeSession: (sessionId: string) => requestNoContent(
      root.href,
      fetchImplementation,
      `/v1/auth/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
      auth
    ),
    revokeAllSessions: () => request(
      "/v1/auth/sessions", RevokeAllSessionsSchema, { method: "DELETE" }
    ),
    recoveryProve:(input:ConsumerRecoveryProveRequest)=>request('/v1/auth/recovery/prove',ConsumerRecoveryProofResponseSchema,{method:'POST',body:JSON.stringify(input)}),
    beginRecoveryEnrollment:(input:RecoveryEnrollmentBeginRequest)=>request('/v1/auth/recovery/enrollment/options',RecoveryEnrollmentOptionsResponseSchema,{method:'POST',body:JSON.stringify(input)}),
    completeRecoveryEnrollment:(input:RecoveryEnrollmentCompleteRequest)=>request('/v1/auth/recovery/enrollment/complete',AuthenticationResponseSchema,{method:'POST',body:JSON.stringify(input)}),
    pendingOnboardingStatus:(input:PendingOnboardingStatusRequest)=>request('/v1/auth/onboarding/status',OnboardingRequirementsResponseSchema,{method:'POST',body:JSON.stringify(input)}),
    completePendingOnboarding:(input:PendingOnboardingCompleteRequest)=>requestNoContent(root.href,fetchImplementation,'/v1/auth/onboarding/complete',{method:'POST',body:JSON.stringify(input)},auth),
    recoveryEnrollmentStatus:(input:RecoveryEvidenceStatusRequest)=>request('/v1/auth/recovery/enrollment/status',OnboardingRequirementsResponseSchema,{method:'POST',body:JSON.stringify(input)}),
    completeRecoveryEvidence:(input:RecoveryEvidenceCompleteRequest)=>requestNoContent(root.href,fetchImplementation,'/v1/auth/recovery/enrollment/complete-evidence',{method:'POST',body:JSON.stringify(input)},auth),
    authMethods:()=>request('/v1/account/auth-methods',AuthMethodsResponseSchema),
    removeAuthMethod:(factorId:string,grant:string)=>requestNoContent(root.href,fetchImplementation,'/v1/account/auth-methods/remove',{method:'POST',body:JSON.stringify({factor_id:factorId,step_up_grant:grant})},auth),
    regenerateRecoveryCodes:(grant:string)=>request('/v1/account/recovery-codes/regenerate',RecoveryCodesResponseSchema,{method:'POST',body:JSON.stringify({step_up_grant:grant})}),
    beginPasskeyStepUp:(authorization:StepUpAuthorizationRequest)=>request('/v1/auth/passkeys/step-up/options',PasskeyAuthenticationOptionsResponseSchema,{method:'POST',body:JSON.stringify({authorization})}),
    completePasskeyStepUp:(input:{challenge_handle:string;credential:ConsumerAuthenticationCredential})=>request('/v1/auth/passkeys/step-up/complete',StepUpResponseSchema,{method:'POST',body:JSON.stringify(input)}),
    stepUp: (password: string, code: string, authorization?:StepUpAuthorizationRequest) => request(
      "/v1/auth/step-up", StepUpResponseSchema,
      { method: "POST", body: JSON.stringify({
          password,
          code,
          ...(authorization === undefined ? {} : { authorization })
        }) }
    ),
    readPublicDebates: (limit: number, offset: number) => request(
      `/v1/public/debates?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`,
      PublicDebateListSchema
    ),
    readPublicDebate: (publicationRef: string) => request(
      `/v1/public/debates/${encodeURIComponent(publicationRef)}`,
      PublicDebateSchema
    ),
    readRunVisibility: (runId: string) => request(
      `/v1/runs/${encodeURIComponent(runId)}/visibility`,
      PublicationTransitionSchema
    ),
    publishRun: (runId: string, stepUpGrant: string) => request(
      `/v1/runs/${encodeURIComponent(runId)}/publish`,
      PublicationTransitionSchema,
      { method: "POST", body: JSON.stringify({
          step_up_grant: stepUpGrant,
          warning_acknowledged: true
        }) }
    ),
    unpublishRun: (runId: string, stepUpGrant: string) => request(
      `/v1/runs/${encodeURIComponent(runId)}/unpublish`,
      PublicationTransitionSchema,
      { method: "POST", body: JSON.stringify({
          step_up_grant: stepUpGrant,
          copies_may_persist_acknowledged: true
        }) }
    ),
    scheduleAccountErasure:(stepUpGrant:string)=>request(
      "/v1/account",AccountErasureStatusSchema,
      { method:"DELETE",body:JSON.stringify({
          confirmation:"DELETE MY ACCOUNT",step_up_grant:stepUpGrant
        }) }
    ).then((status)=>{
      if (status.status==="NONE") throw new ContractHttpError(
        "INVALID_RESPONSE",200,"Scheduled deletion returned NONE"
      );
      return status;
    }),
    readAccountErasure:()=>request(
      "/v1/account/erasure",AccountErasureStatusSchema
    ),
    phoneProfile:()=>request("/v1/account/profile",AccountPhoneProfileSchema),
    revealPhoneProfile:(grantToken:string)=>request("/v1/account/profile/reveal",PhoneProfileRevealSchema,{method:"POST",body:JSON.stringify(PhoneProfileRevealRequestSchema.parse({step_up_grant:grantToken}))}),
    updatePhoneProfile:(input:Readonly<{phone:string;grantToken:string}>)=>request("/v1/account/profile",AccountPhoneProfileSchema,{method:"POST",body:JSON.stringify(PhoneProfileUpdateRequestSchema.parse({phone:input.phone,step_up_grant:input.grantToken}))}),
    recoveryEmail:()=>request("/v1/account/recovery-email",RecoveryEmailSettingsSchema),
    requestRecoveryEmail:(input:Readonly<{email:string;grantToken:string}>)=>request("/v1/account/recovery-email",RecoveryEmailSettingsSchema,{method:"POST",body:JSON.stringify(RecoveryEmailRequestSchema.parse({email:input.email,step_up_grant:input.grantToken}))},202),
    confirmRecoveryEmail:(input:Readonly<{token:string}>)=>request("/v1/account/recovery-email/confirm",EmailChangeConfirmedSchema,{method:"POST",body:JSON.stringify(EmailChangeLinkRequestSchema.parse(input))}),
    removeRecoveryEmail:(input:Readonly<{grantToken:string}>)=>requestNoContent(root.href,fetchImplementation,"/v1/account/recovery-email",{method:"DELETE",body:JSON.stringify(RecoveryEmailRemoveRequestSchema.parse({step_up_grant:input.grantToken}))},auth),
    readAccountEmail: () => request("/v1/account/email", AccountEmailSchema),
    requestEmailChange: (newEmail: string, stepUpGrant: string) => request(
      "/v1/account/email/change", EmailChangePendingSchema,
      { method: "POST", body: JSON.stringify(EmailChangeRequestSchema.parse({
          new_email: newEmail, step_up_grant: stepUpGrant
        })) }
    ),
    resendEmailChange: () => request(
      "/v1/account/email/change/resend", EmailChangePendingSchema, { method: "POST", body: "{}" }
    ),
    cancelEmailChange: () => requestNoContent(
      root.href, fetchImplementation, "/v1/account/email/change", { method: "DELETE" }, auth
    ),
    confirmEmailChange: (token: string) => request(
      "/v1/account/email/change/confirm", EmailChangeConfirmedSchema,
      { method: "POST", body: JSON.stringify(EmailChangeLinkRequestSchema.parse({ token })) }
    ),
    cancelEmailChangeByLink: (token: string) => request(
      "/v1/account/email/change/cancel", EmailChangeCancelledSchema,
      { method: "POST", body: JSON.stringify(EmailChangeLinkRequestSchema.parse({ token })) }
    ),
    cancelAccountErasure:(cancellationRef:string)=>request(
      "/v1/account/erasure/cancel",AccountErasureCancelledSchema,
      { method:"POST",body:JSON.stringify(AccountErasureCancelRequestSchema.parse({
          cancellation_ref:cancellationRef
        })) }
    ),
    deletePrivateDebate:(runId:string,stepUpGrant:string)=>request(
      `/v1/debates/${encodeURIComponent(runId)}`,PrivateDebateErasureStatusSchema,
      { method:"DELETE",body:JSON.stringify({ step_up_grant:stepUpGrant }) }
    ),
    claimLegacyRuns:(legacyToken:string)=>request(
      "/v1/account/legacy-runs/claim",LegacyRunClaimResultSchema,
      { method:"POST",body:JSON.stringify(LegacyRunClaimRequestSchema.parse({
          legacy_token:legacyToken
        })) }
    ),
    getLegalStatus: (locale: string) => request(
      `/v1/account/legal-status?locale=${encodeURIComponent(locale)}`,
      LegalStatusResponseSchema
    ),
    acceptLegal: (input: LegalAcceptRequest) => requestNoContent(
      root.href, fetchImplementation, "/v1/account/legal-accept",
      { method: "POST", body: JSON.stringify(input) }, auth
    ),
    getGeoAvailability: () => request("/v1/geo/availability", GeoAvailabilityResponseSchema),
    submitAsk: (input: AskRequest) => request("/v1/asks", AskAcceptedSchema, { method: "POST", body: JSON.stringify(input) }),
    getAskRoom: (input: Readonly<{
      plan_tier: PlanTier;
      composition_budget_tier: "low" | "medium" | "high";
      depth: number;
    }>) => request(`/v1/asks/room?${new URLSearchParams({
      plan_tier: input.plan_tier,
      composition_budget_tier: input.composition_budget_tier,
      depth: String(input.depth)
    }).toString()}`, AskRoomResponseSchema),
    getBillingUsage: () => request("/v1/billing/usage", BillingUsageResponseSchema),
    getBillingPlans: () => request("/v1/billing/plans", BillingPlansResponseSchema),
    createBillingQuote: (input: BillingQuoteRequest) => request(
      "/v1/billing/quote", BillingQuoteResponseSchema,
      { method: "POST", body: JSON.stringify(BillingQuoteRequestSchema.parse(input)) }
    ),
    startBillingCheckout: (input: BillingCheckoutRequest) => requestJson<BillingCheckoutResponse | BillingCheckoutPendingResponse>(
      root.href, fetchImplementation, "/v1/billing/checkout", BillingCheckoutResponseSchema,
      { method: "POST", body: JSON.stringify(BillingCheckoutRequestSchema.parse(input)) }, auth, undefined,
      (status, body) => {
        if (status !== 409) return null;
        const pending = BillingCheckoutPendingErrorSchema.safeParse(body);
        return pending.success ? Object.freeze({ state: "PENDING" as const, charge_ref: pending.data.charge_ref }) : null;
      }
    ),
    getBillingCharge: (chargeRef: string) => request(
      `/v1/billing/charges/${encodeURIComponent(chargeRef)}`, BillingChargeStatusResponseSchema
    ),
    getBillingSubscription: () => request("/v1/billing/subscription", BillingSubscriptionResponseSchema),
    getBillingInvoices: () => request("/v1/billing/invoices", BillingInvoicesResponseSchema),
    downgradeSubscription: (planId: "PLUS" | "PRO") => requestNoContent(
      root.href, fetchImplementation, "/v1/billing/subscription/downgrade",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan_id: planId }) },
      auth
    ),
    cancelSubscription: () => requestNoContent(
      root.href, fetchImplementation, "/v1/billing/subscription/cancel", { method: "POST" }, auth
    ),
    revokeSubscriptionCancel: () => requestNoContent(
      root.href, fetchImplementation, "/v1/billing/subscription/cancel-revoke", { method: "POST" }, auth
    ),
    quoteSubscriptionUpgrade: (planId: "PRO" | "MAX") => request(
      "/v1/billing/subscription/upgrade-quote", BillingUpgradeQuoteResponseSchema,
      { method: "POST", body: JSON.stringify({ plan_id: planId }) }
    ),
    upgradeSubscription: (planId: "PRO" | "MAX", quoteRef: string) => request(
      "/v1/billing/subscription/upgrade", BillingUpgradeResponseSchema,
      { method: "POST", body: JSON.stringify({ plan_id: planId, quote_ref: quoteRef }) }
    ),
    withdrawSubscription: (stepUpGrant: string) => request(
      "/v1/billing/subscription/withdraw", BillingWithdrawResponseSchema,
      { method: "POST", body: JSON.stringify({ step_up_grant: stepUpGrant }) }
    ),
    startCardChange: () => request("/v1/billing/subscription/card", BillingCardChangeResponseSchema, { method: "POST" }),
    requestCancelLink: (email: string) => request(
      "/v1/billing/cancel-link", BillingCancelLinkAcceptedSchema,
      { method: "POST", body: JSON.stringify({ email }) }, 202
    ),
    cancelByToken: (token: string) => requestNoContent(
      root.href, fetchImplementation, "/v1/billing/cancel-by-token",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }, auth
    ),
    readSession: () => request("/v1/session", SessionSchema),
    readDeployment: () => request("/v1/deployment", DeploymentSchema),
    readAnswerIndex: (limit: number, offset: number) => request(`/v1/answers?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`, AnswerIndexSchema),
    readAnswer: (answerId: string, version?: number) => request(`/v1/answers/${encodeURIComponent(answerId)}${versionQuery(version)}`, AnswerSchema),
    readRunAnswer: (runId: string) => request(`/v1/runs/${encodeURIComponent(runId)}/answer`, AnswerSchema),
    readRun: (runId: string) => request(`/v1/runs/${encodeURIComponent(runId)}`, RunProjectionSchema),
    readInspection: (answerId: string, version?: number) => request(`/v1/answers/${encodeURIComponent(answerId)}/inspection${versionQuery(version)}`, InspectionSchema),
    readLedgerDigest: (answerId: string) => request(`/v1/answers/${encodeURIComponent(answerId)}/ledger-digest`, ExecutionLedgerDigestSchema),
    readAnswerStory: (answerId: string) => request(`/v1/answers/${encodeURIComponent(answerId)}/story`, AnswerStorySchema),
    readAnswerDisclosure: (answerId: string) => request(`/v1/answers/${encodeURIComponent(answerId)}/disclosure`, AnswerDisclosureSchema),
    readNode: (answerId: string, nodeId: string) => request(`/v1/answers/${encodeURIComponent(answerId)}/nodes/${encodeURIComponent(nodeId)}`, NodeSchema),
    recordInvestigation: (answerId: string, gapRef: string, input: InvestigationRequest) => request(`/v1/answers/${encodeURIComponent(answerId)}/investigations/${encodeURIComponent(gapRef)}`, InvestigationAcceptedSchema, { method: "POST", body: JSON.stringify(input) }),
    unlinkMemory: (answerId: string) => request(`/v1/answers/${encodeURIComponent(answerId)}/memory-link/unlink`, UnlinkSchema, { method: "POST" }),
    async readEvents(runId: string) {
      const response = await eventResponse(runId);
      const text = await response.text();
      return Object.freeze(text.split(/\r?\n\r?\n+/).flatMap((frame) => {
        const event = parseFrame(frame);
        return event === null ? [] : [event];
      }));
    },
    async streamEvents(runId: string, consume: (event: RunEvent) => void, signal?: AbortSignal) {
      const response = await eventResponse(runId, signal);
      if (response.body === null) throw new ContractHttpError("INVALID_RESPONSE", response.status, "Event stream has no body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const event = parseFrame(frame);
          if (event !== null) consume(event);
        }
        if (chunk.done) break;
      }
      const finalEvent = parseFrame(buffer);
      if (finalEvent !== null) consume(finalEvent);
    }
  });
}
