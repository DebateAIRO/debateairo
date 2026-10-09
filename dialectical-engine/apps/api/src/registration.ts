import { normalizeMailDisplay as normalizeAccountMailDisplay } from "./account-mail-template.mjs";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { socialHash } from "./social-providers/hashes.js";
import type { PostgresSocialIdentityRepository, SocialSignupAuthority, PostgresIdentityRepository, AuthSourceContext } from "@debateai/db";
import type { AuthPolicy, AuthRouteLimit } from "@debateai/register";
import {
  Argon2InfrastructureError,
  argon2EnvelopeRefusal,
  createEmailBlindIndex,
  encrypt,
  generateDek,
  generatePseudonym,
  generateVerificationToken,
  hashPassword,
  hashToken,
  normalizeEmailForBlindIndex,
  parseEncodedArgon2id,
  type Argon2Executor,
  type UserDekStore
} from "@debateai/crypto";
import { AGE_RULE_VERSION, MIN_AGE, isDeclaredRegion, isMailAddress, type DeclaredRegion } from "@debateai/kernel";
import type { RegisterLegalDocuments } from "@debateai/contract";
import { LocaleCodeSchema } from "@debateai/contract/locale";
import { resolveSignUpDocuments, signUpAcceptanceRows, type SignUpDocuments } from "./legal.js";
import { normalizeManualPhone } from "./phone-profile.js";
import { MailDeliveryError, type MailSender } from "./mail-channel.js";
import { mailDomainRefused, type MailDomainCheck } from "./mail-domain-check.js";

export const REGISTRATION_PUBLIC_RESPONSE = Object.freeze({
  message: "If this address can be registered, verification instructions will arrive. Check your spam folder."
});

export const RESEND_PUBLIC_RESPONSE = Object.freeze({
  message: "If this address is awaiting verification, new instructions will arrive. Check your spam folder."
});

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly recoveryEmail?: string | null;
  readonly phone: string;
  /**
   * True only when the API's age gate found a date of birth of at least MIN_AGE; the
   * date itself never reaches this service. Registration records that result.
   */
  readonly adultAffirmed: boolean;
}

/**
 * Paid plans L3b: legal evidence travels on the request source, separately from account profile input.
 * The S04 gate pins the auth route region (apps/api/src/index.ts). The age gate's
 * edge country already rides here (AuthSourceContext.countryCode); the Terms and Privacy pairs the page
 * displayed and the declared region ride here too, parsed by register preHandler hooks and added by sourceFor.
 */
export type VerificationMailSource = AuthSourceContext & Readonly<{
  /** Validated UI language/time zone for delivery only; carries no identity authority. */
  mailDisplay?: Readonly<{ locale: string; timeZone: string | null }>;
}>;
export type RegistrationSource = VerificationMailSource & Readonly<{ legal?: RegisterLegalDocuments; region?: DeclaredRegion }>;

export type SocialRegisterInput = Omit<RegisterInput, "password" | "recoveryEmail">;
export type SocialRegistrationResult = typeof REGISTRATION_PUBLIC_RESPONSE | Readonly<{status:"mfa_required";enrollment_token:string;expires_at:string}>;

declare const sourceAdmissionBrand: unique symbol;
export type AuthSourceAdmission = Readonly<{ [sourceAdmissionBrand]: true; release(): void }>;
export type AuthSourceAdmissionRequest =
  | Readonly<{ route: "register"; input: RegisterInput; source: RegistrationSource }>
  | Readonly<{ route: "social"; input: SocialRegisterInput; source: RegistrationSource }>
  | Readonly<{ route: "resend"; input: Readonly<{ email: string }>; source: VerificationMailSource }>;
interface SourceAdmissionGrant {
  readonly route: "register" | "resend";
  readonly ip: string;
  readonly requestId: string;
  readonly releaseStructural: (() => void) | undefined;
}
export interface RegistrationApplication {
  /** Trusted composition port; the capability never enters public JSON or source metadata. */
  admitSource?(request: AuthSourceAdmissionRequest): Promise<AuthSourceAdmission>;
  register(input: RegisterInput, source: RegistrationSource, admission?: AuthSourceAdmission): Promise<typeof REGISTRATION_PUBLIC_RESPONSE>;
  verifyEmail(input: { readonly token: string }, source: AuthSourceContext): Promise<{ readonly status: "mfa_required" }>;
  resendVerification(
    input: { readonly email: string },
    source: VerificationMailSource,
    admission?: AuthSourceAdmission
  ): Promise<typeof RESEND_PUBLIC_RESPONSE>;
}

/**
 * The single code every Argon2 pool failure surfaces as, from every source and
 * on every auth route. Exported so the HTTP error boundary can apply the same
 * envelope to a pool failure that never passed through this service.
 */
export const AUTH_RETRYABLE_UNAVAILABLE_CODE = "AUTH_TEMPORARILY_UNAVAILABLE";

/**
 * V-22. The gate every stored Argon2id record passes before it is verified.
 *
 * Named for exactly what it decides: among records the global envelope can
 * PARSE, this one is not over twice its governing policy. It deliberately does
 * NOT decide parseability — a malformed, wrong-version or out-of-envelope
 * record (say a planted `m=1048576`) answers `true` here and is refused
 * immediately afterwards by `verifyPassword`/`verifyRecoveryCode`, which parse
 * before they hand anything to a worker. Nothing may read this boolean as
 * "safe to hash without parsing".
 *
 * Only the caller knows which sealed cost governs a given record — a password
 * hash answers to `passwordPolicy`, a recovery-code hash to the MFA policy — so
 * the ceiling is derived from the cost passed in here, never from one global
 * number. A refused record is never verified, which on every route is the same
 * outcome as a wrong credential: the visitor learns nothing new, the audit row
 * is written exactly as it would have been, and no worker slot or Argon2 arena
 * is ever occupied by a planted envelope. The operator gets the typed code.
 */
export function storedArgon2EnvelopeNotOverPolicy(
  encodedHash: string,
  cost: Readonly<{ memoryCostKiB: number; timeCost: number; parallelism: number }>,
  use: "password" | "recovery-code"
): boolean {
  const refusal = argon2EnvelopeRefusal(encodedHash, cost);
  if (refusal === undefined) return true;
  console.error(`[${refusal}] use=${use}`);
  return false;
}

/** Match the existing worker encoding admission AND its selected per-use cost ceiling. */
export function consumerPasswordUsable(value: string | null, policy: AuthPolicy): boolean {
    return value !== null && parseEncodedArgon2id(value) !== undefined && storedArgon2EnvelopeNotOverPolicy(value, policy.password.argon2id, 'password');
}
export class AuthFlowError extends Error {
  constructor(readonly code:
    | "AUTH_INPUT_INVALID"
    | "AUTH_RATE_LIMITED"
    | "AUTH_MAIL_BUSY"
    | "AUTH_REGISTRATION_FAILED"
    | "AUTH_TEMPORARILY_UNAVAILABLE"
    | "AUTH_CREDENTIALS_INVALID"
    | "VERIFICATION_TOKEN_INVALID"
    | "MFA_ENROLLMENT_INVALID"
    | "MFA_FIRST_STEP_UNAVAILABLE"
    | "MFA_ENROLLMENT_STATE_INVALID"
    | "MFA_TOTP_INVALID"
    | "MFA_TOTP_REPLAYED"
    | "MFA_RECOVERY_CONFIRMATION_INVALID"
    | "MFA_RATE_LIMITED"
    | "LEGAL_DOCUMENT_STALE"
    /** Open sign-up mail (2026-10-09): the one address rule, or a domain that takes no mail. Same code as email change. */
    | "EMAIL_INVALID"
    /** Open sign-up mail PR 3 (G2): today's account-mail budget is spent; "try again later". */
    | "MAIL_DAILY_LIMIT",
    options?: ErrorOptions
  ) {
    super(code, options);
    this.name = "AuthFlowError";
  }

  get statusCode(): 400 | 401 | 409 | 422 | 429 | 503 {
    return this.code === "AUTH_CREDENTIALS_INVALID" ? 401
      : this.code === "EMAIL_INVALID" ? 422
      : this.code === "AUTH_RATE_LIMITED" || this.code === "MFA_RATE_LIMITED" ? 429
      : this.code === "MFA_FIRST_STEP_UNAVAILABLE" || this.code === "MFA_ENROLLMENT_STATE_INVALID" || this.code === "MFA_TOTP_REPLAYED"
        || this.code === "LEGAL_DOCUMENT_STALE" ? 409
      : this.code === "AUTH_REGISTRATION_FAILED" || this.code === "AUTH_MAIL_BUSY"
        || this.code === "AUTH_TEMPORARILY_UNAVAILABLE" || this.code === "MAIL_DAILY_LIMIT" ? 503 : 400;
  }
}

/**
 * The ONE envelope every Argon2 pool failure gets, on every auth route and from
 * every source — password hashing, audit derivation, verification, resend and
 * account provisioning alike.
 *
 * Two properties matter. It is constant and secret-free: the body carries the
 * code and nothing else, so `ARGON2_POOL_CAPACITY_EXHAUSTED` vs
 * `ARGON2_WORKER_FAILED` — which describes internal capacity state — never
 * reaches a client, and the generic 500 handler (whose body is
 * `knownError.message`) is never the path these take. And it is a retryable
 * 503, not a 500: the request failed for want of a worker, not because the
 * credentials were wrong. The typed cause is retained on `cause` for operators.
 */
function asAuthFlowFailure(error: unknown): unknown {
  return error instanceof Argon2InfrastructureError
    ? new AuthFlowError("AUTH_TEMPORARILY_UNAVAILABLE", { cause: error })
    : error;
}

type AuthRoute = "register" | "verify" | "resend";
const AUTH_ROUTES = Object.freeze(["register", "verify", "resend"] as const);
const AUTH_REFUSAL_DISTINCT_SOURCE_CAP = 4_096;

interface RefusalEligibility {
  pending: number;
  ready: Promise<void> | undefined;
  settle: (() => void) | undefined;
}
interface RefusalAggregate {
  /** Shared by every snapshot of this window, without retaining a list of contributors. */
  readonly eligibility: RefusalEligibility;
  readonly windowStartedAt: number;
  readonly occurredAt: Date;
  readonly source: AuthSourceContext;
  readonly distinctSourceDigests: Set<string>;
  count: number;
  ipCount: number;
  addressCount: number;
  distinctSourceCountSaturated: boolean;
}

export class InProcessAuthRateLimiter {
  private readonly slotCounts: Uint8Array;
  private readonly slotHeads: Uint8Array;
  private readonly slotSaturatedUntil: Float64Array;
  private readonly slotExpiries: Float64Array;
  private readonly slotRowsByRoute: Readonly<Record<
    AuthRoute,
    readonly Readonly<{ offset: number; width: number }>[]
  >>;
  private readonly slotOffsetByRoute: Readonly<Record<AuthRoute, number>>;
  private readonly expiryOffsetByRoute: Readonly<Record<AuthRoute, number>>;
  private readonly slotHashKey: Buffer;
  private readonly occupiedSlotsByRoute: Record<AuthRoute, number> = {
    register: 0,
    verify: 0,
    resend: 0
  };
  private readonly refusalAggregates = new Map<AuthRoute, RefusalAggregate>();

  constructor(
    private readonly policy: Readonly<Record<AuthRoute, AuthRouteLimit>>,
    private readonly bucketCapacity: number,
    private readonly refusalAuditIntervalMs: number,
    slotHashKey: Uint8Array = randomBytes(32)
  ) {
    if (!Number.isInteger(bucketCapacity) || bucketCapacity < 1
      || !Number.isInteger(refusalAuditIntervalMs) || refusalAuditIntervalMs < 1
      || slotHashKey.byteLength < 16
      || AUTH_ROUTES.some((route) => !Number.isInteger(policy[route].admissionPerSource)
        || policy[route].admissionPerSource < 1 || policy[route].admissionPerSource > 255)) {
      throw new TypeError("AUTH_RATE_LIMIT_POLICY_INVALID");
    }
    const slotCapacity = bucketCapacity * AUTH_ROUTES.length;
    this.slotCounts = new Uint8Array(slotCapacity);
    this.slotHeads = new Uint8Array(slotCapacity);
    this.slotSaturatedUntil = new Float64Array(slotCapacity);
    let expiryOffset = 0;
    this.slotOffsetByRoute = Object.freeze(Object.fromEntries(AUTH_ROUTES.map((route, routeIndex) =>
      [route, routeIndex * bucketCapacity]
    )) as Record<AuthRoute, number>);
    this.expiryOffsetByRoute = Object.freeze(Object.fromEntries(AUTH_ROUTES.map((route) => {
      const offset = expiryOffset;
      expiryOffset += bucketCapacity * policy[route].admissionPerSource;
      return [route, offset];
    })) as Record<AuthRoute, number>);
    this.slotExpiries = new Float64Array(expiryOffset);
    const firstWidth = bucketCapacity === 1 ? 1 : Math.floor(bucketCapacity / 2);
    this.slotRowsByRoute = Object.freeze(Object.fromEntries(AUTH_ROUTES.map((route, routeIndex) => {
      const routeOffset = this.slotOffsetByRoute[route];
      return [route, bucketCapacity === 1
        ? Object.freeze([Object.freeze({ offset: routeOffset, width: 1 })])
        : Object.freeze([
            Object.freeze({ offset: routeOffset, width: firstWidth }),
            Object.freeze({
              offset: routeOffset + firstWidth,
              width: bucketCapacity - firstWidth
            })
          ])];
    })) as Record<AuthRoute, readonly Readonly<{ offset: number; width: number }>[]>);
    this.slotHashKey = Buffer.from(slotHashKey);
  }

  private slotIndexes(route: AuthRoute, key: string): readonly number[] {
    const digest = createHmac("sha256", this.slotHashKey).update(key, "utf8").digest();
    return this.slotRowsByRoute[route].map((row, index) =>
      row.offset + (digest.readUInt32BE(index * 4) % row.width)
    );
  }

  private expiryBase(route: AuthRoute, index: number, limit: number): number {
    return this.expiryOffsetByRoute[route]
      + (index - this.slotOffsetByRoute[route]) * limit;
  }

  private activeCount(route: AuthRoute, index: number, limit: number, now: number): number {
    let count = this.slotCounts[index]!;
    let head = this.slotHeads[index]!;
    const wasOccupied = count > 0 || this.slotSaturatedUntil[index]! > 0;
    const expiryBase = this.expiryBase(route, index, limit);
    while (count > 0 && this.slotExpiries[expiryBase + head]! <= now) {
      head = (head + 1) % limit;
      count -= 1;
    }
    if (this.slotSaturatedUntil[index]! <= now) this.slotSaturatedUntil[index] = 0;
    if (count === 0) head = 0;
    this.slotCounts[index] = count;
    this.slotHeads[index] = head;
    if (wasOccupied && count === 0 && this.slotSaturatedUntil[index] === 0) {
      this.occupiedSlotsByRoute[route] -= 1;
    }
    return count;
  }

  private refusalSourceDigest(route: AuthRoute, ip: string): string {
    return createHmac("sha256", this.slotHashKey)
      .update("auth-refusal-source:v1\0", "utf8")
      .update(route, "utf8")
      .update("\0", "utf8")
      .update(ip, "utf8")
      .digest("hex");
  }

  /**
   * Bounded memory, exact per-key counting, and zero false refusal at saturation
   * cannot coexist. This keyed, route-isolated two-row fixed-slot sketch gives up
   * exactness only on same-route collisions: colliding sources share counts, so
   * information loss can over-count/refuse but can never mint a fresh budget.
   * Slots are never evicted or reassigned, so an at-limit source receives no
   * early amnesty. The random per-process key makes targeted collisions
   * impractical while keeping the ruled slot count as the hard memory bound.
   *
   * D3 residual: raw IP exists transiently in the request and HMAC input but is
   * not retained in slot state. RefusalAggregate intentionally retains one
   * AuthSourceContext per route until the bounded audit-flush window; that map is
   * capped at three routes, is never logged/persisted raw, and the repository
   * hashes it at its boundary. A memory-hard per-request KDF is not justified for
   * this bounded ephemeral state. Slot state is held in preallocated typed
   * arrays, so attacker-driven occupancy changes values but never allocates a
   * retained object or array and resident storage converges on the ruled bound.
   */
  private take(
    route: AuthRoute,
    key: string,
    limit: number,
    windowMs: number,
    now: number
  ): boolean {
    const indexes = this.slotIndexes(route, key);
    const counts = indexes.map((index) => this.activeCount(route, index, limit, now));
    const estimatedCount = Math.min(...indexes.map((index, offset) =>
      this.slotSaturatedUntil[index]! > now ? limit : counts[offset]!
    ));
    if (estimatedCount >= limit) return false;

    const expiresAt = now + windowMs;
    for (let offset = 0; offset < indexes.length; offset += 1) {
      const index = indexes[offset]!;
      const count = counts[offset]!;
      if (count === 0 && this.slotSaturatedUntil[index] === 0) {
        this.occupiedSlotsByRoute[route] += 1;
      }
      if (this.slotSaturatedUntil[index]! > now || count >= limit) {
        this.slotSaturatedUntil[index] = Math.max(
          this.slotSaturatedUntil[index]!,
          expiresAt
        );
      } else {
        const head = this.slotHeads[index]!;
        const tail = (head + count) % limit;
        this.slotExpiries[this.expiryBase(route, index, limit) + tail] = expiresAt;
        this.slotCounts[index] = count + 1;
      }
    }
    return true;
  }

  memoryOccupancy(): Readonly<{
    occupiedSlots: number;
    slotCapacity: number;
    perRouteSlotCapacity: number;
    allocatedBytes: number;
    occupiedSlotsByRoute: Readonly<Record<AuthRoute, number>>;
  }> {
    const occupiedSlotsByRoute = Object.freeze({ ...this.occupiedSlotsByRoute });
    return Object.freeze({
      occupiedSlots: Object.values(occupiedSlotsByRoute).reduce((sum, count) => sum + count, 0),
      slotCapacity: this.bucketCapacity * AUTH_ROUTES.length,
      perRouteSlotCapacity: this.bucketCapacity,
      allocatedBytes: this.slotCounts.byteLength + this.slotHeads.byteLength
        + this.slotSaturatedUntil.byteLength + this.slotExpiries.byteLength,
      occupiedSlotsByRoute
    });
  }

  aggregateRefusal(input: {
    readonly route: AuthRoute;
    readonly scope: "ip" | "address";
    readonly now: Date;
    readonly source: AuthSourceContext;
    readonly persistAfter?: Promise<void>;
  }): Readonly<{
    finalized: Readonly<RefusalAggregate> | null;
    startedWindow: boolean;
    windowStartedAt: number;
  }> {
    const now = input.now.getTime();
    const windowStartedAt = Math.floor(now / this.refusalAuditIntervalMs) * this.refusalAuditIntervalMs;
    const current = this.refusalAggregates.get(input.route);
    const finalized = current !== undefined && current.windowStartedAt !== windowStartedAt
      ? Object.freeze({ ...current })
      : null;
    const aggregate = current?.windowStartedAt === windowStartedAt
      ? { ...current }
      : {
          eligibility: { pending: 0, ready: undefined, settle: undefined },
          windowStartedAt,
          occurredAt: input.now,
          source: input.source,
          distinctSourceDigests: new Set<string>(),
          count: 0,
          ipCount: 0,
          addressCount: 0,
          distinctSourceCountSaturated: false
        };
    if (input.persistAfter !== undefined) {
      const gate = aggregate.eligibility;
      if (gate.pending++ === 0) gate.ready = new Promise<void>(resolve => { gate.settle = resolve; });
      const settled = () => {
        if (--gate.pending === 0) {
          const release = gate.settle; gate.settle = undefined; gate.ready = undefined; release?.();
        }
      };
      // A failed clamp is also terminal; never orphan its aggregate or reject this shared barrier.
      void input.persistAfter.then(settled, settled);
    }
    const sourceDigest = this.refusalSourceDigest(input.route, input.source.ip);
    if (!aggregate.distinctSourceDigests.has(sourceDigest)) {
      if (aggregate.distinctSourceDigests.size < AUTH_REFUSAL_DISTINCT_SOURCE_CAP) {
        aggregate.distinctSourceDigests.add(sourceDigest);
      } else {
        aggregate.distinctSourceCountSaturated = true;
      }
    }
    if (aggregate.count < Number.MAX_SAFE_INTEGER) {
      aggregate.count += 1;
      if (input.scope === "ip") aggregate.ipCount += 1;
      else aggregate.addressCount += 1;
    }
    this.refusalAggregates.set(input.route, aggregate);
    return Object.freeze({
      finalized,
      startedWindow: current?.windowStartedAt !== windowStartedAt,
      windowStartedAt
    });
  }

  finalizeRefusalAggregate(route: AuthRoute, windowStartedAt: number): Readonly<RefusalAggregate> | null {
    const aggregate = this.refusalAggregates.get(route);
    if (aggregate?.windowStartedAt !== windowStartedAt) return null;
    this.refusalAggregates.delete(route);
    return Object.freeze({ ...aggregate });
  }

  consume(input: {
    readonly route: AuthRoute;
    readonly ip: string;
    readonly addressKey: string;
    readonly now: Date;
  }): Readonly<{ allowed: true } | { allowed: false; scope: "ip" | "address" }> {
    const route = this.policy[input.route];
    const now = input.now.getTime();
    // Public addresses/tokens are attacker-supplied, so they cannot own an
    // admission budget. Admission is charged only to the caller's source. The
    // explicit per-source values preserve the ruled 20/10/3 route ceilings;
    // existing channel cooldown remains the outbound-side-effect throttle.
    if (!this.take(
      input.route,
      `${input.route}:source:${input.ip}`,
      route.admissionPerSource,
      route.windowMs,
      now
    )) {
      return Object.freeze({ allowed: false, scope: "ip" as const });
    }
    return Object.freeze({ allowed: true as const });
  }
}

type IdentityRepository = Pick<PostgresIdentityRepository,
  | "createPendingAccount"
  | "findAuditIdentityByBlindIndex"
  | "findAuditIdentityByVerificationHash"
  | "recordVerificationDelivery"
  | "recordVerificationDeliveryRecordFailure"
  | "recordDuplicateRegistrationPostwork"
  | "consumeVerification"
  | "prepareVerificationResend"
  | "recordRegistrationFailure"
  | "recordRateLimitRefusal"
>;

/**
 * The one shared address rule (packages/kernel/src/mail-address.ts), the same one every mail sender asks just
 * before the sendmail hand-off: an account can never hold an address its own verification mail would refuse.
 */
function validEmail(value: unknown): value is string {
  return isMailAddress(value);
}

interface PendingRegistration {
  readonly email: string;
  readonly recoveryEmail: string | null;
  readonly phone: string;
  readonly emailBlindIndex: Buffer;
  readonly passwordHash: string | null;
  readonly social?: SocialSignupAuthority;
  readonly requestedAt: Date;
  readonly countryCode: string | null;
  readonly documents: SignUpDocuments | null;
  readonly region: DeclaredRegion | null;
  readonly source: VerificationMailSource;
}

interface VerificationDelivery {
  readonly reservationId: string;
  readonly userId: string;
  readonly channelBindingId: string;
  readonly email: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly source: VerificationMailSource;
}

interface VerificationDeliveryRecord {
  readonly userId: string;
  readonly channelBindingId: string;
  readonly source: AuthSourceContext;
  readonly errorCode: string | null;
}

type VerificationDeliveryPostwork = VerificationDelivery & Readonly<{ kind: "delivery" }>;

interface DuplicateRegistrationPostwork {
  readonly kind: "duplicate";
  readonly userId: string;
  readonly attemptId: string;
  readonly source: AuthSourceContext;
}

type RegistrationPostwork = VerificationDeliveryPostwork | DuplicateRegistrationPostwork | Readonly<{kind:"social_collision"}> | Readonly<{kind:"social_enrollment";token:string;expiresAt:Date}>;
export type RecoveryMailWork = () => Promise<void>;
export interface RecoveryMailDispatchPort {
  dispatchRecoveryMail(prepare:()=>Promise<RecoveryMailWork|null>):Promise<void>;
}
type MailDispatchRelease = () => Promise<void>;
interface MailDispatchActivationReceipt {
  readonly activatedAt: number;
  readonly release: MailDispatchRelease;
}
type MailDispatchActivation = () => Promise<MailDispatchActivationReceipt>;

interface WaitingMailDispatch {
  readonly resolve: (activate: MailDispatchActivation) => void;
  readonly reject: (error: AuthFlowError) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
  readonly minimumReservationMs: number;
  readonly activationSpacingMs: number;
}

interface MailCapacitySignalAggregate {
  readonly windowStartedAt: number;
  readonly correlationId: string;
  count: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface RegistrationHashWork {
  readonly promise: Promise<string>;
  readonly cancel: () => void;
  /**
   * Resolves — and NEVER rejects — at the exact moment this unit of
   * secret-bearing work is finished, whichever way it finished: the KDF
   * returned, the KDF failed, or it was cancelled while still queued and never
   * ran at all.
   *
   * `promise` cannot serve this purpose. It is the request's own result and its
   * losing outcome is discarded by `Promise.all`, whereas the admission token
   * must be held until the WORK is over, not until the CALLER is done with it.
   * Awaiting this is also what makes the outcome consumed rather than orphaned.
   */
  readonly settlement: Promise<void>;
}

/**
 * The route-owned refusal-audit persistence coordinator: one ordered queue, one
 * writer, one advancing window.
 */
interface RefusalAuditCoordinator {
  /**
   * Finalized aggregates awaiting their UNIQUE durable write, oldest window
   * first. The limiter has already released every entry here, so this array is
   * the last copy of that refusal evidence: an entry leaves only once its own
   * write has landed.
   */
  readonly queue: Readonly<RefusalAggregate>[];
  /**
   * The one window still accumulating inside the limiter, with the timer that
   * finalizes it at its aggregation deadline. Rollover ADVANCES this field and
   * touches nothing else.
   */
  active: Readonly<{
    windowStartedAt: number;
    timer: ReturnType<typeof setTimeout>;
  }> | undefined;
  /**
   * THE writer for this route while one is running. Every path — the public
   * refusal, the deadline timer, and every concurrent shutdown drain — joins
   * this exact promise rather than starting a private one, which is what makes
   * a second write of an in-flight window impossible and makes a drain unable
   * to return while this route still owes a write.
   */
  writer: Promise<void> | undefined;
}

function normalizeMailDisplay(display: NonNullable<VerificationMailSource["mailDisplay"]>): NonNullable<VerificationMailSource["mailDisplay"]> {
  if (!LocaleCodeSchema.safeParse(display.locale).success || (display.timeZone !== null && (typeof display.timeZone !== "string" || display.timeZone.length < 1 || display.timeZone.length > 128))) throw new AuthFlowError("AUTH_INPUT_INVALID");
  return normalizeAccountMailDisplay(display);
}
export function sourceContext(source: VerificationMailSource): VerificationMailSource {
  if (source.ip.trim() === "" || source.requestId.trim() === "") {
    throw new AuthFlowError("AUTH_INPUT_INVALID");
  }
  const userAgent = source.userAgent.trim();
  return Object.freeze({
    ip: source.ip.slice(0, 64),
    userAgent: (userAgent === "" ? "unknown" : userAgent).slice(0, 256),
    requestId: source.requestId.slice(0, 128),
    ...(source.mailDisplay === undefined ? {} : { mailDisplay: normalizeMailDisplay(source.mailDisplay) })
  });
}

export class RegistrationService implements RegistrationApplication {
  private readonly clock: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly pendingMailDispatches = new Set<Promise<void>>();
  // Ownership tracking only: these preparations already hold a slot or waiter
  // in the SAME mail dispatcher. This is not another admission pool.
  private readonly pendingMailPreparations = new Set<Promise<void>>();
  private readonly waitingMailDispatches: WaitingMailDispatch[] = [];
  private mailDispatchReservations = 0;
  private nextMailDispatchActivationAt = Number.NEGATIVE_INFINITY;
  private registrationHashesActive = 0;
  private readonly waitingRegistrationHashes: Array<() => void> = [];
  /**
   * How many scheduled hash units currently still RETAIN the caller's password
   * in their start closure. It rises when work is scheduled and falls the
   * moment the password is handed to the KDF or dropped by cancellation.
   *
   * It exists because that reference is otherwise unobservable: it lives inside
   * a closure, where no property walk over the service can reach it, so
   * "cancellation really cleared the secret" could only ever be asserted
   * vacuously. This counter is the seam that makes it provable.
   */
  private registrationPasswordReferencesHeld = 0;
  private mailCapacitySignalAggregate: MailCapacitySignalAggregate | undefined;
  /**
   * The structural registration admission budget: at most
   * `structuralMaximumConcurrentRegistrations` registrations may be inside the
   * service at once, and there is NO wait queue in front of it.
   *
   * `granted` and `released` are monotone lifetime totals, not live state. They
   * exist so that "released exactly once" is directly observable: a double
   * release would show up as `released > granted`, and a missing one as a
   * `held` that never returns to zero.
   */
  private registrationAdmissionsHeld = 0;
  private registrationAdmissionsGranted = 0;
  private registrationAdmissionsReleased = 0;
  private registrationAdmissionClosing = false;
  /**
   * THE drain promise while one is pending. Every concurrent drain joins this
   * exact promise rather than starting a private wait, which is what makes
   * repeated and concurrent drains impossible to hang or double-settle.
   */
  private registrationAdmissionDrain: Promise<void> | undefined;
  private settleRegistrationAdmissionDrain: (() => void) | undefined;
  /**
   * ONE persistence coordinator per route, stable across every window.
   *
   * A refusal window that rolls over is the hard case: W0 stops accumulating
   * the instant W1 opens, and from that moment exactly one owner must carry W0
   * to a durable row. Giving each window its own queue and its own writer is
   * what produced two owners (a superseded window's aggregates shallow-copied
   * into a successor that writes them again behind the still-unresolved
   * predecessor) or none (a rollover snapshot awaited on the public path and
   * discarded when its write failed).
   *
   * So the queue and the writer belong to the ROUTE and only the active window
   * advances. Nothing here is ever replaced or copied on rollover.
   */
  private readonly refusalAuditRoutes = new Map<AuthRoute, RefusalAuditCoordinator>();
  private readonly sourceAdmissions = new WeakMap<AuthSourceAdmission, SourceAdmissionGrant>();

  private validateRegistration(input: RegisterInput | SocialRegisterInput, rawSource: RegistrationSource, social = false) {
    const maximumPasswordLength = this.dependencies.policy.password.maximumLength;
    if (!validEmail(input.email) || ("recoveryEmail" in input && input.recoveryEmail != null && !validEmail(input.recoveryEmail))) {
      throw new AuthFlowError("EMAIL_INVALID");
    }
    if ((!social && (!("password" in input) || typeof input.password !== "string"
      || input.password.length < this.dependencies.policy.password.minimumLength
      // V-14: the ruled maximum, in the same unit as the minimum. The route
      // keeps its own 1024-byte request-shape bound ahead of this; a
      // register version that publishes no maximum leaves that bound alone.
      || (maximumPasswordLength !== null && input.password.length > maximumPasswordLength)))
      || input.adultAffirmed !== true) {
      throw new AuthFlowError("AUTH_INPUT_INVALID");
    }
    let phone: string;
    try { phone = normalizeManualPhone(input.phone); }
    catch { throw new AuthFlowError("AUTH_INPUT_INVALID"); }
    // Age gate (R3-3): the source's country — the edge's, else the country gate's lookup — is
    // recorded with the result, never decisive.
    const countryCode = typeof rawSource.countryCode === "string" && /^[A-Z]{2}$/.test(rawSource.countryCode)
      ? rawSource.countryCode : null;
    // L3b: the pairs of the documents the person read. Input validation, so it runs before
    // the admission gate and spends no budget; the refusal still sits behind the clamp.
    const documents = this.dependencies.legalAcceptance === undefined
      ? null : resolveSignUpDocuments(rawSource.legal);
    if (this.dependencies.legalAcceptance !== undefined && documents === null) {
      throw new AuthFlowError("LEGAL_DOCUMENT_STALE");
    }
    const source = sourceContext(rawSource);
    if (rawSource.region !== undefined && !isDeclaredRegion(rawSource.region)) throw new AuthFlowError("AUTH_INPUT_INVALID");
    const region = rawSource.region ?? null;
    return { phone, countryCode, documents, source, region };
  }

  async admitSource(request: AuthSourceAdmissionRequest): Promise<AuthSourceAdmission> {
    const startedAt = performance.now();
    let releaseStructural: (() => void) | undefined;
    let refusalClamped = false;
    try {
      const { input, source: rawSource } = request;
      const route = request.route === "social" ? "register" : request.route;
      let source: VerificationMailSource;
      if (request.route !== "resend") {
        source = this.validateRegistration(request.input, request.source, request.route === "social").source;
        // The existing 103-registration slot spans proof, provisioning, clamp and handoff: no async stage before it.
        releaseStructural = this.acquireRegistrationAdmission(randomUUID());
      } else {
        if (!validEmail(input.email)) throw new AuthFlowError("EMAIL_INVALID");
        source = sourceContext(rawSource);
      }
      const now = this.clock();
      const limit = this.dependencies.limiter.consume({ route, ip: source.ip, addressKey: "", now });
      if (!limit.allowed) {
        const persistAfter = (route === "register" ? this.holdRegistrationEnumerationClamp(startedAt) : this.holdEnumerationFloor(startedAt))
          .finally(() => { refusalClamped = true; });
        await this.refuseRateLimit({ route, scope: limit.scope, now,
          source: { ip: source.ip, userAgent: source.userAgent, requestId: source.requestId }, persistAfter });
      }
      const capability = Object.freeze({ release: () => { this.releaseSourceAdmission(capability); } }) as AuthSourceAdmission;
      this.sourceAdmissions.set(capability, Object.freeze({ route, ip: source.ip, requestId: source.requestId, releaseStructural }));
      releaseStructural = undefined; // The capability now owns this existing slot.
      return capability;
    } catch (error) {
      try {
        if (!refusalClamped) {
          if (request.route !== "resend") await this.holdRegistrationEnumerationClamp(startedAt);
          else await this.holdEnumerationFloor(startedAt);
        }
      } finally { releaseStructural?.(); }
      throw error;
    }
  }
  private releaseSourceAdmission(admission: AuthSourceAdmission): void {
    const granted = this.takeSourceAdmission(admission);
    granted?.releaseStructural?.();
  }
  private takeSourceAdmission(admission: AuthSourceAdmission): SourceAdmissionGrant | undefined {
    const granted = this.sourceAdmissions.get(admission);
    this.sourceAdmissions.delete(admission);
    return granted;
  }
  private assertSourceAdmission(route: "register" | "resend", source: AuthSourceContext, granted: SourceAdmissionGrant | undefined): void {
    if (!granted || granted.route !== route || granted.ip !== source.ip || granted.requestId !== source.requestId
      || (route === "register" && granted.releaseStructural === undefined)) throw new AuthFlowError("AUTH_INPUT_INVALID");
  }

  constructor(private readonly dependencies: {
    readonly repository: IdentityRepository;
    readonly socialRepository?: Pick<PostgresSocialIdentityRepository,"createAccount">;
    readonly mail: MailSender;
    readonly dekStore: UserDekStore;
    readonly blindIndexKey: Uint8Array;
    readonly policy: AuthPolicy;
    readonly limiter: InProcessAuthRateLimiter;
    /**
     * Off-thread Argon2. Injected, never constructed here: exactly one
     * process-owned pool is created in main.ts and shared with the repository,
     * so there is no module singleton, pool-per-request or second pool.
     */
    readonly argon2: Argon2Executor;
    readonly clock?: () => Date;
    readonly sleep?: (milliseconds: number) => Promise<void>;
    readonly verificationTokenFactory?: () => string;
    /**
     * Paid plans L3: the records key the acceptance evidence is sealed under. main.ts always
     * supplies it (tests/unit/legal-signup.test.ts pins that); a composition without it is a test
     * that predates the acceptance record and registers exactly as before.
     */
    readonly legalAcceptance?: Readonly<{ recordsKey: Buffer }>;
    /**
     * Open sign-up mail (owner decision G5, 2026-10-09): "does this domain take mail at all?", asked once per
     * password sign-up after the limiter has charged the request, so it can never be used to make this server
     * query DNS for free. UNDELIVERABLE refuses with EMAIL_INVALID; a timeout or resolver failure lets the address
     * through (fail open). Absent, no DNS question is asked (tests, and compositions that predate it).
     */
    readonly mailDomainCheck?: MailDomainCheck;
    /**
     * Open sign-up mail PR 3 (owner decision G2): the outbound mail gate's "is there room today for one more
     * sign-up mail?". Asked after the limiter and before any account work, for password sign-up and resend; a no
     * refuses with MAIL_DAILY_LIMIT. It depends on the day's count alone, never on whether an account exists.
     * The send itself is still gated in the sender. Absent, nothing is asked.
     */
    readonly outboundMail?: Readonly<{ hasCapacity(purposeClass: "standard"): Promise<boolean> }>;
  }) {
    this.clock = dependencies.clock ?? (() => new Date());
    this.sleep = dependencies.sleep ?? (async (milliseconds) => {
      await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
    });
  }

  /**
   * Takes one admission slot, or refuses. Synchronous by construction: the
   * caller must be able to run this before its first `await`, so the ceiling is
   * already decided by the time a simultaneous burst has been launched.
   *
   * Returns the ONE idempotent release closure for that slot. Idempotence is not
   * defensive here — ownership of this closure legitimately moves to a
   * reservation continuation on some failure paths, and both the local owner and
   * the continuation must be able to call it without a second release landing.
   */
  private acquireRegistrationAdmission(correlationId: string): () => void {
    if (this.registrationAdmissionClosing) {
      // Shutdown has begun. A generic retryable failure, and deliberately NOT
      // the capacity envelope: this is not a full budget, it is a closing one.
      throw new AuthFlowError(AUTH_RETRYABLE_UNAVAILABLE_CODE);
    }
    if (this.registrationAdmissionsHeld
      >= this.dependencies.policy.channel.structuralMaximumConcurrentRegistrations) {
      // The same opaque bounded capacity signal the shared queue already emits.
      // No address and no source material: window count and correlation only.
      this.signalMailCapacity(correlationId);
      throw new AuthFlowError("AUTH_MAIL_BUSY");
    }
    this.registrationAdmissionsHeld += 1;
    this.registrationAdmissionsGranted += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.registrationAdmissionsHeld -= 1;
      this.registrationAdmissionsReleased += 1;
      if (this.registrationAdmissionsHeld === 0) this.settleRegistrationAdmissionDrain?.();
    };
  }

  registrationAdmissionOccupancy(): Readonly<{
    admitted: number;
    maximum: number;
    closing: boolean;
    admissions: number;
    releases: number;
  }> {
    return Object.freeze({
      admitted: this.registrationAdmissionsHeld,
      maximum: this.dependencies.policy.channel.structuralMaximumConcurrentRegistrations,
      closing: this.registrationAdmissionClosing,
      admissions: this.registrationAdmissionsGranted,
      releases: this.registrationAdmissionsReleased
    });
  }

  /**
   * Closes admission and awaits the exact transition to zero admitted
   * registrations.
   *
   * This is a fail-closed join of in-flight OWNERSHIP, and nothing more. It does
   * not bound how long an admitted request may take: repository and transaction
   * awaits have no request-wide cancellation deadline, and the Argon2 worker
   * timeout only begins at dispatch. Any outer process-level shutdown budget and
   * its escalation policy belong to the deployment shutdown owner (T3), not
   * here.
   *
   * It runs FIRST in the shutdown order because an admitted registration can
   * still enqueue mail and refusal-audit work; draining those before this
   * returns would report work complete that had not yet been created.
   */
  async drainRegistrationAdmissions(): Promise<void> {
    this.registrationAdmissionClosing = true;
    if (this.registrationAdmissionsHeld === 0) return;
    if (this.registrationAdmissionDrain === undefined) {
      this.registrationAdmissionDrain = new Promise<void>((resolve) => {
        this.settleRegistrationAdmissionDrain = () => {
          this.settleRegistrationAdmissionDrain = undefined;
          this.registrationAdmissionDrain = undefined;
          resolve();
        };
      });
    }
    await this.registrationAdmissionDrain;
  }

  private async holdEnumerationFloor(startedAt: number): Promise<void> {
    const remaining = this.dependencies.policy.verification.enumerationResponseFloorMs
      - (performance.now() - startedAt);
    if (remaining > 0) await this.sleep(remaining);
  }

  private async holdRegistrationEnumerationClamp(startedAt: number): Promise<void> {
    const clampMs = this.dependencies.policy.verification.enumerationResponseFloorMs
      + this.dependencies.policy.verification.enumerationToleranceMs;
    const remaining = clampMs - (performance.now() - startedAt);
    if (remaining > 0) await this.sleep(remaining);
  }

  /**
   * A queued registration can receive its mail permit long after the ordinary
   * request-arrival clamp has expired. Anchor a second, branch-independent
   * boundary to the actual reservation activation so neither account creation
   * nor duplicate-account locking is reflected in the HTTP completion time.
   */
  private async holdRegistrationPostActivationFloor(activatedAt: number): Promise<void> {
    const remaining = this.dependencies.policy.channel.mailDispatchPreTransportWorkBudgetMs
      - (performance.now() - activatedAt);
    if (remaining > 0) await this.sleep(remaining);
  }

  private startNextRegistrationHash(): void {
    if (this.registrationHashesActive
      >= this.dependencies.policy.channel.maxConcurrentRegistrationHashes) return;
    this.waitingRegistrationHashes.shift()?.();
  }

  private scheduleRegistrationHash(password: string): RegistrationHashWork {
    let passwordValue: string | undefined = password;
    this.registrationPasswordReferencesHeld += 1;
    let started = false;
    let settled = false;
    let rejectWork!: (error: unknown) => void;
    let start!: () => void;
    let finishWork!: () => void;
    const settlement = new Promise<void>((resolve) => { finishWork = resolve; });
    // Idempotent by construction: the password is dropped either by dispatch or
    // by cancellation, never by both, and the counter must follow it exactly.
    const dropPasswordReference = (): void => {
      if (passwordValue === undefined) return;
      passwordValue = undefined;
      this.registrationPasswordReferencesHeld -= 1;
    };
    const promise = new Promise<string>((resolve, reject) => {
      rejectWork = reject;
      start = () => {
        if (settled) return;
        started = true;
        this.registrationHashesActive += 1;
        const value = passwordValue!;
        dropPasswordReference();
        void hashPassword(this.dependencies.argon2, value, this.dependencies.policy.password.argon2id)
          .then((hash) => {
            settled = true;
            resolve(hash);
          }, (error: unknown) => {
            settled = true;
            reject(error);
          })
          .finally(() => {
            this.registrationHashesActive -= 1;
            this.startNextRegistrationHash();
            // LAST, and only here: once this resolves, an admission owner
            // waiting on it is free to hand the slot back, so it must not
            // resolve while the pool slot is still charged to this work.
            finishWork();
          });
      };
    });
    if (this.registrationHashesActive
      < this.dependencies.policy.channel.maxConcurrentRegistrationHashes) {
      start();
    } else {
      this.waitingRegistrationHashes.push(start);
    }
    return Object.freeze({
      promise,
      settlement,
      cancel: () => {
        // Once dispatched this is a no-op BY CONSTRUCTION — the pool owns the
        // work and there is nothing here to revoke. That is precisely why the
        // caller must await `settlement` rather than assume cancellation won.
        if (started || settled) return;
        const index = this.waitingRegistrationHashes.indexOf(start);
        if (index >= 0) this.waitingRegistrationHashes.splice(index, 1);
        dropPasswordReference();
        settled = true;
        rejectWork(new Error("REGISTRATION_HASH_CANCELLED"));
        finishWork();
      }
    });
  }

  private async recordRefusalAggregate(route: AuthRoute, aggregate: Readonly<RefusalAggregate>): Promise<void> {
    await this.dependencies.repository.recordRateLimitRefusal({
      route,
      scope: aggregate.ipCount > 0 ? "ip" : "address",
      count: aggregate.count,
      ipCount: aggregate.ipCount,
      addressCount: aggregate.addressCount,
      distinctSourceCount: aggregate.distinctSourceDigests.size,
      distinctSourceCountSaturated: aggregate.distinctSourceCountSaturated,
      occurredAt: aggregate.occurredAt,
      aggregateWindowStartedAt: new Date(aggregate.windowStartedAt),
      source: aggregate.source
    });
  }

  private refusalAuditRoute(route: AuthRoute): RefusalAuditCoordinator {
    let coordinator = this.refusalAuditRoutes.get(route);
    if (coordinator === undefined) {
      coordinator = { queue: [], active: undefined, writer: undefined };
      this.refusalAuditRoutes.set(route, coordinator);
    }
    return coordinator;
  }

  /**
   * Cleanup is allowed ONLY once this route owns nothing: no accumulating
   * window, no aggregate still awaiting its row, no write in flight. Dropping
   * the coordinator any earlier would drop the only copy of that evidence.
   */
  private releaseRefusalAuditRoute(route: AuthRoute): void {
    const coordinator = this.refusalAuditRoutes.get(route);
    if (coordinator !== undefined && coordinator.active === undefined
      && coordinator.queue.length === 0 && coordinator.writer === undefined) {
      this.refusalAuditRoutes.delete(route);
    }
  }

  /**
   * Hands one finalized window to the route coordinator, in window order so a
   * recovery writes retained windows deterministically oldest-first.
   */
  private enqueueRefusalAggregate(route: AuthRoute, aggregate: Readonly<RefusalAggregate>): void {
    const { queue } = this.refusalAuditRoute(route);
    const at = queue.findIndex((queued) => queued.windowStartedAt > aggregate.windowStartedAt);
    if (at < 0) queue.push(aggregate);
    else queue.splice(at, 0, aggregate);
  }

  /**
   * Finalizes `windowStartedAt` INTO the queue, exactly once.
   *
   * The guard is the whole point: a timer that fires for a window which is no
   * longer the active one has already been superseded — its aggregate left the
   * limiter as the rollover snapshot and is queued — so it must not finalize
   * anything, or it would enqueue a second copy and cancel the successor's
   * deadline along the way.
   */
  private finalizeRefusalWindow(route: AuthRoute, windowStartedAt: number): void {
    const coordinator = this.refusalAuditRoutes.get(route);
    if (coordinator?.active?.windowStartedAt !== windowStartedAt) return;
    clearTimeout(coordinator.active.timer);
    coordinator.active = undefined;
    // The limiter releases its copy HERE; the queue is the only copy from now on.
    const aggregate = this.dependencies.limiter.finalizeRefusalAggregate(route, windowStartedAt);
    if (aggregate !== null) this.enqueueRefusalAggregate(route, aggregate);
  }

  /**
   * Returns THE route writer, starting it only if none is running.
   *
   * The running writer drains the whole queue, so an aggregate enqueued while
   * it works is picked up by that same writer instead of by a second one. A
   * caller therefore always gets a promise that covers everything this route
   * currently owes, and every caller gets the SAME promise.
   */
  private startRefusalAuditPump(route: AuthRoute): Promise<void> {
    const coordinator = this.refusalAuditRoute(route);
    if (coordinator.writer !== undefined) return coordinator.writer;
    if (coordinator.queue.length === 0) {
      this.releaseRefusalAuditRoute(route);
      return Promise.resolve();
    }
    const writer = this.pumpRefusalAuditQueue(route, coordinator);
    coordinator.writer = writer;
    return writer;
  }

  private async pumpRefusalAuditQueue(
    route: AuthRoute,
    coordinator: RefusalAuditCoordinator
  ): Promise<void> {
    try {
      // Dequeued one at a time and only AFTER its own write lands, so a failure
      // part-way through neither loses an unwritten window nor rewrites a
      // durable one — the rejected head stays at the front for the retry.
      //
      // Removal is by IDENTITY, never by position: the queue is ordered by
      // window, so a window finalized while this write is in flight — after a
      // backward wall-clock step, a real refusal can open an OLDER window — is
      // sorted in front of the aggregate being written. A positional shift()
      // would then discard that never-written window and re-attempt the one
      // that just landed, and `recordRateLimitRefusal` has no dedup key.
      while (coordinator.queue.length > 0) {
        const writing = coordinator.queue[0]!;
        while (writing.eligibility.pending > 0) await writing.eligibility.ready;
        await this.recordRefusalAggregate(route, writing);
        const at = coordinator.queue.indexOf(writing);
        if (at >= 0) coordinator.queue.splice(at, 1);
      }
    } finally {
      coordinator.writer = undefined;
      this.releaseRefusalAuditRoute(route);
    }
  }

  /**
   * Opens `windowStartedAt` as this route's active window and arms its
   * aggregation deadline. Rollover ADVANCES the window: the queue and the
   * writer are untouched, so a predecessor still being persisted keeps its one
   * owner.
   */
  private scheduleRefusalAuditFlush(route: AuthRoute, windowStartedAt: number, now: Date): void {
    const coordinator = this.refusalAuditRoute(route);
    if (coordinator.active?.windowStartedAt === windowStartedAt) return;
    if (coordinator.active !== undefined) clearTimeout(coordinator.active.timer);

    const delay = Math.max(0,
      windowStartedAt + this.dependencies.policy.rateLimitRefusalAuditIntervalMs - now.getTime()
    );
    const timer = setTimeout(() => {
      // The ORDINARY deadline path stays fire-and-forget: it logs, leaves the
      // unwritten window queued for a later drain, and never touches a request.
      this.finalizeRefusalWindow(route, windowStartedAt);
      void this.startRefusalAuditPump(route).catch(() => {
        console.error(
          `[AUTH_RATE_LIMIT_AUDIT_RECORD_FAILED] route=${route} window=${new Date(windowStartedAt).toISOString()}`
        );
      });
    }, delay);
    timer.unref();
    coordinator.active = Object.freeze({ windowStartedAt, timer });
  }

  /**
   * Awaits every pending refusal-audit window, firing each one NOW rather than
   * waiting out its aggregation deadline.
   *
   * That deadline is the ruled `rateLimitRefusalAuditIntervalMs` aggregation
   * window, so simply awaiting it would stall a shutdown drain for up to a
   * minute per route — and because the timer is unref'd, a process that exited
   * first would lose the durable refusal row entirely. Firing early changes no
   * aggregation semantics and no audit content: the same flush body runs, the
   * same row is written, only the wait is removed.
   *
   * Unlike the ordinary deadline path, this drain OBSERVES persistence. It is
   * the last chance to write the row before the process goes away, and its
   * caller uses it to decide that the Argon2 surface may be torn down. So a
   * failed write propagates here rather than being logged and forgotten: the
   * retained aggregate stays pending and retryable, and shutdown is not told
   * that work it never durably recorded is done.
   */
  async drainRateLimitAuditFlushes(): Promise<void> {
    let failure: unknown;
    let failed = false;
    // Sequential rather than raced, so one route's failure never cancels
    // another route's in-flight write half-way through.
    for (const route of [...this.refusalAuditRoutes.keys()]) {
      await this.drainRefusalAuditRoute(route).catch((error: unknown) => {
        if (!failed) {
          failed = true;
          failure = error;
        }
      });
    }
    if (failed) throw failure;
  }

  private async drainRefusalAuditRoute(route: AuthRoute): Promise<void> {
    for (;;) {
      const coordinator = this.refusalAuditRoutes.get(route);
      if (coordinator === undefined) return;
      // Firing the active window early is what bounds the drain; the flush body
      // and the row it produces are identical to the deadline path's.
      if (coordinator.active !== undefined) {
        this.finalizeRefusalWindow(route, coordinator.active.windowStartedAt);
      }
      if (coordinator.writer === undefined && coordinator.queue.length === 0) return;
      // Joining THE route writer — never a private copy of the queue — is what
      // stops this drain returning while a write it does not own is still in
      // flight, and what coalesces concurrent drains onto one write per window.
      // A rejection propagates: shutdown is never told that work it never
      // durably recorded is done, and the rejected window stays queued.
      await this.startRefusalAuditPump(route);
      // The writer just joined may have been a PREDECESSOR's, finishing before
      // this drain's own finalization was enqueued, so re-check rather than
      // assume this route is now clear.
    }
  }

  private activateMailDispatch(
    enforceMinimum = false,
    minimumReservationMs: number = this.dependencies.policy.channel.mailDispatchMinimumReservationMs
  ): MailDispatchActivationReceipt {
    const activatedAt = performance.now();
    let release: Promise<void> | undefined;
    const releaseReservation = () => {
      if (release !== undefined) return release;
      release = (async () => {
        const minimum = enforceMinimum || this.waitingMailDispatches.length > 0
          ? minimumReservationMs
          : 0;
        const remaining = minimum - (performance.now() - activatedAt);
        if (remaining > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, remaining));
        }
      })().then(async () => {
        this.mailDispatchReservations -= 1;
        const next = this.waitingMailDispatches.shift();
        if (next !== undefined) {
          clearTimeout(next.timeout);
          this.mailDispatchReservations += 1;
          next.resolve(() => this.scheduleMailDispatchActivation(
            true, next.minimumReservationMs, next.activationSpacingMs
          ));
        }
      });
      return release;
    };
    return Object.freeze({ activatedAt, release: releaseReservation });
  }

  private async scheduleMailDispatchActivation(
    enforceMinimum = false,
    minimumReservationMs: number = this.dependencies.policy.channel.mailDispatchMinimumReservationMs,
    activationSpacingMs: number = this.dependencies.policy.channel.mailDispatchActivationSpacingMs
  ): Promise<MailDispatchActivationReceipt> {
    const now = performance.now();
    const scheduledAt = Math.max(now, this.nextMailDispatchActivationAt);
    this.nextMailDispatchActivationAt = scheduledAt
      + activationSpacingMs;
    const delay = scheduledAt - now;
    if (delay > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
    return this.activateMailDispatch(enforceMinimum, minimumReservationMs);
  }

  private flushMailCapacitySignal(windowStartedAt: number): void {
    const aggregate = this.mailCapacitySignalAggregate;
    if (aggregate === undefined || aggregate.windowStartedAt !== windowStartedAt) return;
    clearTimeout(aggregate.timer);
    this.mailCapacitySignalAggregate = undefined;
    console.error(
      `[AUTH_MAIL_CAPACITY_EXHAUSTED] correlation=${aggregate.correlationId} `
      + `code=MAIL_DISPATCH_CAPACITY window=${new Date(windowStartedAt).toISOString()} `
      + `count=${aggregate.count}`
    );
  }

  private signalMailCapacity(correlationId: string): void {
    const now = this.clock().getTime();
    const windowMs = this.dependencies.policy.channel.mailCapacitySignalAggregationWindowMs;
    const active = this.mailCapacitySignalAggregate;
    if (active !== undefined && now - active.windowStartedAt < windowMs) {
      active.count = Math.min(Number.MAX_SAFE_INTEGER, active.count + 1);
      return;
    }
    if (active !== undefined) this.flushMailCapacitySignal(active.windowStartedAt);
    const windowStartedAt = now;
    const timer = setTimeout(
      () => this.flushMailCapacitySignal(windowStartedAt),
      windowMs
    );
    timer.unref();
    this.mailCapacitySignalAggregate = {
      windowStartedAt,
      correlationId,
      count: 1,
      timer
    };
  }

  drainMailCapacitySignals(): void {
    if (this.mailCapacitySignalAggregate !== undefined) {
      this.flushMailCapacitySignal(this.mailCapacitySignalAggregate.windowStartedAt);
    }
  }

  /**
   * The one shared reservation primitive, now taking an EXPLICIT named wait
   * deadline rather than reading one global bound.
   *
   * Registration and resend share this queue, but they no longer share a
   * deadline: registration passes the ruled 28,000 ms and everything else keeps
   * the shipped 18,000 ms default. The deadline is a property of the CALL, not
   * of the queue, so the FIFO, its 32/96 bounds and its arbitration are
   * untouched — a 28-second registration waiter and an 18-second resend waiter
   * sit in the same line, each on its own timer.
   */
  private reserveMailDispatchPermit(request: {
    readonly correlationId: string;
    readonly minimumReservationMs?: number;
    readonly activationSpacingMs?: number;
    readonly waitDeadlineMs?: number;
    readonly enforceMinimum?: boolean;
  }): Promise<MailDispatchActivation> {
    const channel = this.dependencies.policy.channel;
    const minimumReservationMs = request.minimumReservationMs
      ?? channel.mailDispatchMinimumReservationMs;
    const activationSpacingMs = request.activationSpacingMs
      ?? channel.mailDispatchActivationSpacingMs;
    const waitDeadlineMs = request.waitDeadlineMs ?? channel.mailDispatchQueueWaitTimeoutMs;
    if (this.mailDispatchReservations < channel.maxConcurrentVerificationDispatches) {
      this.mailDispatchReservations += 1;
      return Promise.resolve(() => this.scheduleMailDispatchActivation(
        request.enforceMinimum ?? false, minimumReservationMs, activationSpacingMs
      ));
    }
    if (this.waitingMailDispatches.length >= channel.maxQueuedVerificationDispatches) {
      this.signalMailCapacity(request.correlationId);
      throw new AuthFlowError("AUTH_MAIL_BUSY");
    }
    return new Promise<MailDispatchActivation>((resolve, reject) => {
      let waiting!: WaitingMailDispatch;
      const timeout = setTimeout(() => {
        // Removal is by the EXACT waiter object: a handoff that already shifted
        // this waiter out has cleared this timer, and a stale fire must never
        // splice out whoever now occupies that position.
        const index = this.waitingMailDispatches.indexOf(waiting);
        if (index < 0) return;
        this.waitingMailDispatches.splice(index, 1);
        this.signalMailCapacity(request.correlationId);
        reject(new AuthFlowError("AUTH_MAIL_BUSY"));
      }, waitDeadlineMs);
      waiting = Object.freeze({
        resolve, reject, timeout, minimumReservationMs, activationSpacingMs
      });
      this.waitingMailDispatches.push(waiting);
    });
  }

  private async reserveMailDispatch(correlationId: string): Promise<MailDispatchRelease> {
    const activate = await this.reserveMailDispatchPermit({ correlationId });
    return (await activate()).release;
  }

  mailDispatchOccupancy(): Readonly<{
    inFlight: number;
    activeSends: number;
    maximum: number;
    queued: number;
    maximumQueued: number;
  }> {
    return Object.freeze({
      inFlight: this.mailDispatchReservations,
      activeSends: this.pendingMailDispatches.size,
      maximum: this.dependencies.policy.channel.maxConcurrentVerificationDispatches,
      queued: this.waitingMailDispatches.length,
      maximumQueued: this.dependencies.policy.channel.maxQueuedVerificationDispatches
    });
  }

  private async refuseRateLimit(input: {
    readonly route: AuthRoute;
    readonly scope: "ip" | "address";
    readonly now: Date;
    readonly source: AuthSourceContext;
    readonly persistAfter?: Promise<void>;
  }): Promise<never> {
    const aggregate = this.dependencies.limiter.aggregateRefusal(input);
    if (aggregate.finalized !== null) {
      // Rollover. The limiter has just released the previous window, so this
      // snapshot is the only copy: it goes to the route coordinator ONCE, and
      // the timer that armed that window will decline to finalize it again
      // because it is no longer the active one.
      this.enqueueRefusalAggregate(input.route, aggregate.finalized);
    }
    if (aggregate.startedWindow) {
      this.scheduleRefusalAuditFlush(input.route, aggregate.windowStartedAt, input.now);
    }
    if (aggregate.finalized !== null) {
      // FIRE-AND-FORGET, never awaited. A rate-limit refusal is a public path:
      // an ordinary opaque 429 must not be gated on a database write. The
      // shared route writer carries the snapshot in the background, and a
      // shutdown drain joins this exact promise, so declining to wait here
      // loses no evidence and hides no failure.
      void this.startRefusalAuditPump(input.route).catch(() => {
        console.error(
          `[AUTH_RATE_LIMIT_AUDIT_RECORD_FAILED] route=${input.route} window=${new Date(aggregate.finalized!.windowStartedAt).toISOString()}`
        );
      });
    }
    if (input.persistAfter !== undefined) await input.persistAfter;
    throw new AuthFlowError("AUTH_RATE_LIMITED");
  }

  private dispatchVerification(
    input: RegistrationPostwork | VerificationDelivery,
    releaseReservation: MailDispatchRelease
  ): void {
    if ("kind" in input && (input.kind === "social_enrollment" || input.kind === "social_collision")) { this.dispatchMailReservationHold(releaseReservation, true); return; }
    const duplicate = "kind" in input && input.kind === "duplicate" ? input : undefined;
    let delivery: VerificationDelivery | undefined = duplicate === undefined
      ? input as VerificationDelivery
      : undefined;
    const deliveryAttemptId = delivery?.reservationId;
    let pending!: Promise<void>;
    pending = new Promise<void>((resolve) => setImmediate(resolve))
      .then(async () => {
        if (duplicate !== undefined) {
          await this.sleep(this.dependencies.policy.channel.mailDispatchNoSendEqualWorkMs);
          await releaseReservation();
          await this.dependencies.repository.recordDuplicateRegistrationPostwork({
            userId: duplicate.userId,
            occurredAt: this.clock(),
            source: duplicate.source
          });
          return;
        }
        const deliveryRecord = await this.attemptVerificationDelivery(delivery!);
        delivery = undefined;
        await releaseReservation();
        await this.recordVerificationDelivery(deliveryRecord);
      })
      .catch(() => {
        if (duplicate === undefined) {
          console.error(
            `[AUTH_MAIL_DISPATCH_FAILED] attempt=${deliveryAttemptId} code=UNEXPECTED_DISPATCH_FAILURE`
          );
        } else {
          console.error(
            `[AUTH_REGISTRATION_DUPLICATE_POSTWORK_FAILED] attempt=${duplicate.attemptId} code=AUDIT_RECORD_FAILED`
          );
        }
      })
      .finally(async () => {
        delivery = undefined;
        await releaseReservation();
        this.pendingMailDispatches.delete(pending);
      });
    this.pendingMailDispatches.add(pending);
  }

  private dispatchMailReservationHold(
    releaseReservation: MailDispatchRelease,
    equalTransportWork = false
  ): void {
    let pending!: Promise<void>;
    pending = (equalTransportWork
      ? this.sleep(this.dependencies.policy.channel.mailDispatchNoSendEqualWorkMs)
        .then(releaseReservation)
      : releaseReservation()).finally(() => {
      this.pendingMailDispatches.delete(pending);
    });
    this.pendingMailDispatches.add(pending);
  }

  /** Composition-only: one source-admitted recovery request owns one common ticket.
   * Both P2 and token preparation run only after activation. No raw token is
   * retained by a waiter, and public completion never awaits real transport. */
  dispatchRecoveryMail(prepare:()=>Promise<RecoveryMailWork|null>):Promise<void> {
    if(this.registrationAdmissionClosing)return Promise.reject(new AuthFlowError("AUTH_MAIL_BUSY"));
    const startedAt=performance.now();
    let permit:Promise<MailDispatchActivation>;
    try { permit=this.reserveMailDispatchPermit({correlationId:randomUUID(),enforceMinimum:true}); }
    catch(error){return Promise.reject(error);}
    let preparing!:Promise<void>;
    preparing=(async()=>{
      let receipt:MailDispatchActivationReceipt|undefined;
      let work:RecoveryMailWork|null= null;
      try {
        receipt=await(await permit)();
        work=await prepare();
        if(performance.now()-receipt.activatedAt>this.dependencies.policy.channel.mailDispatchPreTransportWorkBudgetMs)
          console.error("[AUTH_CONSUMER_RECOVERY_PREPARATION_SLOW]");
      } finally {
        try {
          await this.holdEnumerationFloor(startedAt);
          if(receipt!==undefined)await this.holdRegistrationPostActivationFloor(receipt.activatedAt);
        } finally {
          if(receipt!==undefined)this.dispatchRecoveryWork(work,receipt.release);
          work=null;
          this.pendingMailPreparations.delete(preparing);
        }
      }
    })();
    this.pendingMailPreparations.add(preparing);
    return preparing;
  }

  private dispatchRecoveryWork(work:RecoveryMailWork|null,release:MailDispatchRelease):void {
    let pending!:Promise<void>;
    pending=new Promise<void>(resolve=>setImmediate(resolve)).then(async()=>{
      if(work===null)await this.sleep(this.dependencies.policy.channel.mailDispatchNoSendEqualWorkMs);
      else await work();
    }).catch(()=>{console.error("[AUTH_CONSUMER_RECOVERY_DISPATCH_FAILED]");}).finally(async()=>{
      work=null;
      try {await release();} finally {this.pendingMailDispatches.delete(pending);}
    });
    this.pendingMailDispatches.add(pending);
  }

  async drainMailDispatches(): Promise<void> {
    while (this.pendingMailDispatches.size > 0 || this.pendingMailPreparations.size > 0) {
      await Promise.allSettled([...this.pendingMailPreparations,...this.pendingMailDispatches]);
    }
  }

  private async provisionPendingAccount(input: PendingRegistration): Promise<RegistrationPostwork> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const userId = randomUUID();
      const pseudonym = generatePseudonym();
      const token = this.dependencies.verificationTokenFactory?.() ?? generateVerificationToken();
      const tokenHash = hashToken("verification", token);
      const expiresAt = new Date(
        input.requestedAt.getTime() + this.dependencies.policy.verification.tokenTtlMs
      );
      const dek = generateDek();
      const emailPlaintext = Buffer.from(input.email, "utf8");
      const recoveryPlaintext = input.recoveryEmail === null ? null : Buffer.from(input.recoveryEmail, "utf8");
      const phonePlaintext = Buffer.from(input.phone, "utf8");
      try {
        const keyId = `user-dek:${userId}`;
        const emailCiphertext = encrypt(dek, emailPlaintext, [
          "identity", "user.email_ciphertext", userId, "run:none", userId, keyId, "1"
        ]);
        const recoveryEmailCiphertext = recoveryPlaintext === null ? null : encrypt(dek, recoveryPlaintext, [
          "identity", "user.recovery_email_ciphertext", userId, "run:none", userId, keyId, "1"
        ]);
        const phoneCiphertext = encrypt(dek, phonePlaintext, [
          "identity", "user.phone_ciphertext", userId, "run:none", userId, keyId, "1"
        ]);
        const acceptances = input.documents === null || this.dependencies.legalAcceptance === undefined
          ? undefined
          : signUpAcceptanceRows({
            recordsKey: this.dependencies.legalAcceptance.recordsKey,
            documents: input.documents,
            source: input.source
          });
        const accountInput = {
          userId,
          emailBlindIndex: input.emailBlindIndex,
          emailCiphertext,
          recoveryEmailCiphertext,
          phoneCiphertext,
          phoneSource: "manual" as const,
          phoneVerificationStatus: "unverified" as const,
          phoneUpdatedAt: input.requestedAt,
          passwordHash: input.passwordHash,
          pseudonym,
          adultAffirmedAt: input.requestedAt,
          ageCheck: {
            minAgeApplied: MIN_AGE,
            countryCode: input.countryCode,
            ruleVersion: AGE_RULE_VERSION
          },
          verificationTokenHash: tokenHash,
          verificationExpiresAt: expiresAt,
          verificationTokenTtlMs: this.dependencies.policy.verification.tokenTtlMs,
          occurredAt: input.requestedAt,
          source: input.source,
          ...(acceptances === undefined ? {} : { acceptances }),
          ...(input.region === null ? {} : { declaredRegion: input.region })
        };
        const created = input.social === undefined
          ? await this.dependencies.repository.createPendingAccount({...accountInput,passwordHash:input.passwordHash!}, () => this.dependencies.dekStore.store(userId,dek))
          : await this.dependencies.socialRepository!.createAccount({...accountInput,...input.social,socialEnrollmentHash:socialHash('enrollment',token)}, () => this.dependencies.dekStore.store(userId,dek));
        if(created.status==='collision') return {kind:'social_collision'};
        if(created.status==='enrollment') return {kind:'social_enrollment',token,expiresAt:created.verificationExpiresAt};
        if (created.status === "pseudonym_collision") continue;
        if (created.status === "email_duplicate") {
          return Object.freeze({
            kind: "duplicate" as const,
            userId: created.userId,
            attemptId: randomUUID(),
            source: input.source
          });
        }
        return Object.freeze({
          kind: "delivery" as const,
          userId: created.userId,
          channelBindingId: created.channelBindingId,
          reservationId: created.reservationId,
          email: input.email,
          token,
          expiresAt: created.verificationExpiresAt,
          source: input.source
        });
      } finally {
        emailPlaintext.fill(0);
        recoveryPlaintext?.fill(0);
        phonePlaintext.fill(0);
        dek.fill(0);
      }
    }
    throw new Error("PSEUDONYM_ALLOCATION_EXHAUSTED");
  }

  private async attemptVerificationDelivery(
    input: VerificationDelivery
  ): Promise<VerificationDeliveryRecord> {
    let errorCode: string | null = null;
    try {
      await this.dependencies.mail.sendVerification({
        attemptId: input.reservationId,
        recipient: input.email,
        token: input.token,
        expiresAt: input.expiresAt,
        display: normalizeAccountMailDisplay(input.source.mailDisplay)
      });
    } catch (error) {
      errorCode = error instanceof MailDeliveryError ? error.operatorCode : "MAIL_DELIVERY_FAILED";
      console.error(`[AUTH_MAIL_DELIVERY_FAILED] attempt=${input.reservationId} code=${errorCode}`);
    }
    return Object.freeze({
      userId: input.userId,
      channelBindingId: input.channelBindingId,
      source: input.source,
      errorCode
    });
  }

  private async recordVerificationDelivery(input: VerificationDeliveryRecord): Promise<void> {
    try {
      await this.dependencies.repository.recordVerificationDelivery({
        userId: input.userId,
        occurredAt: this.clock(),
        source: input.source,
        success: input.errorCode === null,
        errorCode: input.errorCode
      });
    } catch {
      console.error(
        `[AUTH_MAIL_DELIVERY_RECORD_FAILED] attempt=${input.channelBindingId} code=MAIL_RECORD_FAILED`
      );
      await this.dependencies.repository.recordVerificationDeliveryRecordFailure({
        userId: input.userId,
        correlationId: input.channelBindingId,
        occurredAt: this.clock(),
        source: input.source,
        errorCode: "MAIL_RECORD_FAILED"
      }).catch(() => {
        console.error(
          `[AUTH_MAIL_DELIVERY_FAILURE_AUDIT_FAILED] attempt=${input.channelBindingId} code=AUDIT_RECORD_FAILED`
        );
      });
    }
  }

  /** G2: at the day's cap for sign-up mail, refuse before any account work. A gate that cannot answer lets it through. */
  private async assertMailBudget(): Promise<void> {
    const budget = this.dependencies.outboundMail;
    if (budget === undefined) return;
    let room: boolean;
    try { room = await budget.hasCapacity("standard"); } catch { return; }
    if (!room) throw new AuthFlowError("MAIL_DAILY_LIMIT");
  }

  async register(input: RegisterInput, rawSource: RegistrationSource, admission?: AuthSourceAdmission): Promise<typeof REGISTRATION_PUBLIC_RESPONSE> {
    const result = await this.registerFlow(input,rawSource,admission);
    if(!('message' in result)) throw new AuthFlowError('AUTH_REGISTRATION_FAILED');
    return result;
  }
  async registerSocial(input:SocialRegisterInput,source:RegistrationSource,authority:SocialSignupAuthority,admission:AuthSourceAdmission):Promise<SocialRegistrationResult> {
    if(!this.dependencies.socialRepository || !this.dependencies.legalAcceptance) throw new AuthFlowError('AUTH_TEMPORARILY_UNAVAILABLE');
    return this.registerFlow(input,source,admission,authority);
  }
  private async registerFlow(input: RegisterInput | SocialRegisterInput, rawSource: RegistrationSource, admission?: AuthSourceAdmission,social?:SocialSignupAuthority): Promise<SocialRegistrationResult> {
    const requestedAt = new Date(this.clock().getTime());
    const startedAt = performance.now();
    const correlationId = randomUUID();
    let responseClamp: Promise<void> | undefined;
    const clampResponse = () => responseClamp ??= this.holdRegistrationEnumerationClamp(startedAt);
    let pendingPostwork: RegistrationPostwork | undefined;
    let releaseMailDispatch: MailDispatchRelease | undefined;
    let mailDispatchActivatedAt: number | undefined;
    let releaseAdmission: (() => void) | undefined;
    try {
      const granted = admission === undefined ? undefined : this.takeSourceAdmission(admission);
      releaseAdmission = granted?.releaseStructural;
      try {
        const { phone, countryCode, documents, source, region } = this.validateRegistration(input, rawSource, social !== undefined);
        if (admission !== undefined) this.assertSourceAdmission("register", source, granted);
        // THE ADMISSION GATE. After the input and source-context validation,
        // which must never consume budget, and before the first repository
        // await, the limiter lookup, either KDF, the mail reservation, the token
        // mint and every mutation. Nothing above this line has touched a
        // dependency, so the 104th valid request is refused having done no work
        // at all — it only pays the response clamp, like every other arm.
        if (admission === undefined) releaseAdmission = this.acquireRegistrationAdmission(correlationId);
        const email = normalizeEmailForBlindIndex(input.email);
        const recoveryEmail = !("recoveryEmail" in input) || input.recoveryEmail == null ? null : normalizeEmailForBlindIndex(input.recoveryEmail);
        const emailBlindIndex = createEmailBlindIndex(this.dependencies.blindIndexKey, email);
        // This lookup exists only to preserve the stable address limiter key.
        // Its account audit token never enters a refusal row: that event is a
        // route-window incident with DB-minted event-local actor/target refs.
        const existing = await this.dependencies.repository.findAuditIdentityByBlindIndex(emailBlindIndex);
        const limit = admission !== undefined ? { allowed: true as const } : this.dependencies.limiter.consume({
          route: "register",
          ip: source.ip,
          addressKey: existing?.addressKey ?? emailBlindIndex.toString("hex"),
          now: this.clock()
        });
        if (!limit.allowed) {
          await this.refuseRateLimit({
            route: "register",
            scope: limit.scope,
            now: this.clock(),
            source,
            persistAfter: clampResponse()
          });
        }
        // Open sign-up mail (G5): after the limiter, before any hashing or mail capacity. The answer depends on
        // the domain alone, never on whether an account exists. A slow resolver (up to 2 s) lengthens this
        // response beyond the clamp; that time says only how fast DNS answered for the domain, nothing about accounts.
        if (social === undefined) {
          for (const address of recoveryEmail === null ? [email] : [email, recoveryEmail]) {
            if (await mailDomainRefused(this.dependencies.mailDomainCheck, address)) throw new AuthFlowError("EMAIL_INVALID");
          }
          await this.assertMailBudget();
        }

        let passwordHash: string | null = null;
        if(social === undefined) {
        const passwordHashWork = this.scheduleRegistrationHash((input as RegisterInput).password);
        try {
          passwordHash = await passwordHashWork.promise;
        } catch (error) {
          // Cancellation only wins while the work is still QUEUED. If the KDF
          // was already dispatched this returns having revoked nothing, and the
          // password plus its closure are still live inside the pool — whose own
          // execution timeout starts at dispatch, not at submission.
          passwordHashWork.cancel();
          // Once dispatched, the work owns the secret until settlement. Keep
          // the admission slot until that ownership is gone, but do not reserve
          // any mail capacity for a registration that has no completed hash.
          await passwordHashWork.settlement;
          throw error;
        }
        }
        // Hash first: there is no live positive Argon2+provisioning bound that
        // fits the 600 ms pre-transport budget. Once hashing is complete, bind
        // activation directly to permit fulfillment so no granted-but-unleased
        // interval can be published to a successor.
        const activationReceipt = await this.reserveMailDispatchPermit({
          correlationId,
          minimumReservationMs:
            this.dependencies.policy.channel.registrationMailDispatchMinimumReservationMs,
          activationSpacingMs:
            this.dependencies.policy.channel.registrationMailDispatchActivationSpacingMs,
          // Registration alone waits the ruled 28,000 ms. Resend keeps 18,000.
          waitDeadlineMs:
            this.dependencies.policy.channel.registrationMailDispatchQueueWaitTimeoutMs
        }).then((activate) => activate());
        releaseMailDispatch = activationReceipt.release;
        mailDispatchActivatedAt = activationReceipt.activatedAt;
        try {
          pendingPostwork = await this.provisionPendingAccount(Object.freeze({
            email, recoveryEmail, phone, emailBlindIndex, passwordHash, requestedAt, countryCode, source, documents, region, ...(social===undefined?{}:{social})
          }));
          const preTransportWorkMs = performance.now() - mailDispatchActivatedAt;
          if (preTransportWorkMs
            > this.dependencies.policy.channel.mailDispatchPreTransportWorkBudgetMs) {
            console.error(
              `[AUTH_REGISTRATION_PRETRANSPORT_BUDGET_EXCEEDED] correlation=${correlationId} `
              + `code=REGISTRATION_PRETRANSPORT_SLOW elapsed_ms=${Math.ceil(preTransportWorkMs)} `
              + `budget_ms=${this.dependencies.policy.channel.mailDispatchPreTransportWorkBudgetMs}`
            );
          }
        } catch (provisionError) {
          console.error(
            `[AUTH_REGISTRATION_PROVISION_FAILED] correlation=${correlationId} code=PROVISION_FAILED`
          );
          await this.dependencies.repository.recordRegistrationFailure({
            correlationId,
            occurredAt: requestedAt,
            source
          }).catch(() => {
            console.error(
              `[AUTH_REGISTRATION_FAILURE_AUDIT_FAILED] correlation=${correlationId} code=AUDIT_RECORD_FAILED`
            );
          });
          // A provisioning failure caused by the Argon2 pool takes the one shared
          // retryable envelope; anything else keeps the existing registration
          // failure code, whose response shape is unchanged.
          throw provisionError instanceof Argon2InfrastructureError
            ? new AuthFlowError("AUTH_TEMPORARILY_UNAVAILABLE", { cause: provisionError })
            : new AuthFlowError("AUTH_REGISTRATION_FAILED");
        }
        return pendingPostwork?.kind === "social_enrollment" ? {status:"mfa_required",enrollment_token:pendingPostwork.token,expires_at:pendingPostwork.expiresAt.toISOString()} : REGISTRATION_PUBLIC_RESPONSE;
      } catch (error) {
        // Password-hash and mail-reservation failures reach here; every Argon2
        // pool failure among them leaves as the one constant 503 envelope.
        throw asAuthFlowFailure(error);
      } finally {
        const holdPostActivationFloor = mailDispatchActivatedAt !== undefined;
        try {
          // Begin the equal send/no-send work as soon as provisioning settles,
          // while the pre-activated reservation is still held. The public
          // response remains behind both arrival- and activation-anchored
          // floors, but the transport work runs inside rather than after them.
          if (pendingPostwork !== undefined && releaseMailDispatch !== undefined) {
            const release = releaseMailDispatch;
            releaseMailDispatch = undefined;
            this.dispatchVerification(pendingPostwork, release);
          } else if (releaseMailDispatch !== undefined) {
            const release = releaseMailDispatch;
            releaseMailDispatch = undefined;
            this.dispatchMailReservationHold(release);
          }
          await Promise.all([
            clampResponse(),
            holdPostActivationFloor
              ? this.holdRegistrationPostActivationFloor(mailDispatchActivatedAt!)
              : Promise.resolve()
          ]);
        } finally {
          if (pendingPostwork !== undefined && releaseMailDispatch !== undefined) {
            const release = releaseMailDispatch;
            releaseMailDispatch = undefined;
            this.dispatchVerification(pendingPostwork, release);
          }
          if (releaseMailDispatch !== undefined) {
            this.dispatchMailReservationHold(releaseMailDispatch);
          }
        }
      }
    } finally {
      // The OUTERMOST release, after the clamp and after the handoff block has
      // either given successful postwork to `dispatchVerification` or given the
      // reservation to a visible hold. Never at commit, clamp entry, or before
      // the secret/hash and mail-capacity owners have settled.
      if (admission !== undefined) this.releaseSourceAdmission(admission);
      releaseAdmission?.();
    }
  }

  async verifyEmail(
    input: { readonly token: string },
    rawSource: AuthSourceContext
  ): Promise<{ readonly status: "mfa_required" }> {
    try {
      return await this.runVerifyEmail(input, rawSource);
    } catch (error) {
      // The verify route reaches the pool through its audit derivations.
      throw asAuthFlowFailure(error);
    }
  }

  private async runVerifyEmail(
    input: { readonly token: string },
    rawSource: AuthSourceContext
  ): Promise<{ readonly status: "mfa_required" }> {
    if (typeof input.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(input.token)) {
      throw new AuthFlowError("VERIFICATION_TOKEN_INVALID");
    }
    const source = sourceContext(rawSource);
    const tokenHash = hashToken("verification", input.token);
    // V-2 (5). The visitor's OWN budget is charged first, before the indexed
    // repository lookup below, so an exhausted source can no longer buy a
    // database read per attempt. The ruled admission budget is source-owned
    // (S3c D2: an attacker-supplied token can never own one), so the key it
    // needs is the token hash, which is knowable without the lookup and is the
    // same value for a given token whether or not an account holds it — the
    // refusal is therefore identical either way and carries no enumeration
    // signal.
    const admittedAt = this.clock();
    const limit = this.dependencies.limiter.consume({
      route: "verify",
      ip: source.ip,
      addressKey: tokenHash,
      now: admittedAt
    });
    if (!limit.allowed) {
      await this.refuseRateLimit({
        route: "verify",
        scope: limit.scope,
        now: admittedAt,
        source
      });
    }
    // The stable address-limiter key lives behind this lookup. Nothing is
    // charged against it today; a per-address budget can only be charged AFTER
    // this await, never before it, which is why the read stays here.
    await this.dependencies.repository.findAuditIdentityByVerificationHash(tokenHash);
    // S3 rework4: the clock is re-read after the repository await, so the
    // consumed-at instant is the one the mutation actually happens at.
    const now = this.clock();
    if (!await this.dependencies.repository.consumeVerification({ tokenHash, occurredAt: now, source })) {
      throw new AuthFlowError("VERIFICATION_TOKEN_INVALID");
    }
    return Object.freeze({ status: "mfa_required" as const });
  }

  async resendVerification(
    input: { readonly email: string },
    rawSource: VerificationMailSource,
    admission?: AuthSourceAdmission
  ): Promise<typeof RESEND_PUBLIC_RESPONSE> {
    const startedAt = performance.now();
    const correlationId = randomUUID();
    let responseFloor: Promise<void> | undefined;
    const floorResponse = () => responseFloor ??= this.holdEnumerationFloor(startedAt);
    let pendingDelivery: VerificationDelivery | undefined;
    let releaseMailDispatch: MailDispatchRelease | undefined;
    const granted = admission === undefined ? undefined : this.takeSourceAdmission(admission);
    try {
      if (!validEmail(input.email)) throw new AuthFlowError("EMAIL_INVALID");
      const source = sourceContext(rawSource);
      if (admission !== undefined) this.assertSourceAdmission("resend", source, granted);
      const email = normalizeEmailForBlindIndex(input.email);
      const emailBlindIndex = createEmailBlindIndex(this.dependencies.blindIndexKey, email);
      const identity = await this.dependencies.repository.findAuditIdentityByBlindIndex(emailBlindIndex);
      const now = this.clock();
      const limit = admission !== undefined ? { allowed: true as const } : this.dependencies.limiter.consume({
        route: "resend",
        ip: source.ip,
        addressKey: identity?.addressKey ?? emailBlindIndex.toString("hex"),
        now
      });
      if (!limit.allowed) {
        await this.refuseRateLimit({
          route: "resend",
          scope: limit.scope,
          now,
          source,
          persistAfter: floorResponse()
        });
      }
      await this.assertMailBudget();
      releaseMailDispatch = await this.reserveMailDispatch(correlationId);
      const token = this.dependencies.verificationTokenFactory?.() ?? generateVerificationToken();
      const expiresAt = new Date(now.getTime() + this.dependencies.policy.verification.tokenTtlMs);
      const prepared = await this.dependencies.repository.prepareVerificationResend({
        emailBlindIndex,
        tokenHash: hashToken("verification", token),
        expiresAt,
        occurredAt: now,
        cooldownMs: this.dependencies.policy.verification.resendCooldownMs,
        windowMs: this.dependencies.policy.verification.outboundSendWindowMs,
        maximumSends: this.dependencies.policy.verification.outboundSendMax,
        tokenTtlMs: this.dependencies.policy.verification.tokenTtlMs,
        mechanism: this.dependencies.policy.verification.outboundSendMechanism,
        source
      });
      if (prepared.status === "send") {
        pendingDelivery = {
          userId: prepared.userId,
          channelBindingId: prepared.channelBindingId,
          reservationId: prepared.reservationId,
          email,
          token,
          expiresAt: prepared.verificationExpiresAt,
          source
        };
      }
      return RESEND_PUBLIC_RESPONSE;
    } catch (error) {
      // The resend route reaches the pool through its audit derivations.
      throw asAuthFlowFailure(error);
    } finally {
      if (admission !== undefined) this.releaseSourceAdmission(admission);
      try {
        await floorResponse();
      } finally {
        if (pendingDelivery !== undefined && releaseMailDispatch !== undefined) {
          const release = releaseMailDispatch;
          releaseMailDispatch = undefined;
          this.dispatchVerification(pendingDelivery, release);
        }
        if (releaseMailDispatch !== undefined) {
          this.dispatchMailReservationHold(releaseMailDispatch, true);
        }
        granted?.releaseStructural?.();
      }
    }
  }
}
