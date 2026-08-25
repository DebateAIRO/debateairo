import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { PostgresIdentityRepository, AuthSourceContext } from "@debateai/db";
import type { AuthPolicy, AuthRouteLimit } from "@debateai/register";
import {
  Argon2InfrastructureError,
  createEmailBlindIndex,
  encrypt,
  generateDek,
  generatePseudonym,
  generateVerificationToken,
  hashPassword,
  hashVerificationToken,
  normalizeEmailForBlindIndex,
  type Argon2Executor,
  type UserDekStore
} from "@debateai/crypto";
import { MailDeliveryError, type MailSender } from "./mail-channel.js";

export const REGISTRATION_PUBLIC_RESPONSE = Object.freeze({
  message: "If this address can be registered, verification instructions will arrive. Check your spam folder."
});

export const RESEND_PUBLIC_RESPONSE = Object.freeze({
  message: "If this address is awaiting verification, new instructions will arrive. Check your spam folder."
});

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly recoveryEmail: string;
  readonly adultAffirmed: boolean;
}

export interface RegistrationApplication {
  register(input: RegisterInput, source: AuthSourceContext): Promise<typeof REGISTRATION_PUBLIC_RESPONSE>;
  verifyEmail(input: { readonly token: string }, source: AuthSourceContext): Promise<{ readonly status: "mfa_required" }>;
  resendVerification(
    input: { readonly email: string },
    source: AuthSourceContext
  ): Promise<typeof RESEND_PUBLIC_RESPONSE>;
}

/**
 * The single code every Argon2 pool failure surfaces as, from every source and
 * on every auth route. Exported so the HTTP error boundary can apply the same
 * envelope to a pool failure that never passed through this service.
 */
export const AUTH_RETRYABLE_UNAVAILABLE_CODE = "AUTH_TEMPORARILY_UNAVAILABLE";

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
    | "MFA_ENROLLMENT_STATE_INVALID"
    | "MFA_TOTP_INVALID"
    | "MFA_TOTP_REPLAYED"
    | "MFA_RECOVERY_CONFIRMATION_INVALID"
    | "MFA_RATE_LIMITED",
    options?: ErrorOptions
  ) {
    super(code, options);
    this.name = "AuthFlowError";
  }

  get statusCode(): 400 | 401 | 409 | 429 | 503 {
    return this.code === "AUTH_CREDENTIALS_INVALID" ? 401
      : this.code === "AUTH_RATE_LIMITED" || this.code === "MFA_RATE_LIMITED" ? 429
      : this.code === "MFA_ENROLLMENT_STATE_INVALID" || this.code === "MFA_TOTP_REPLAYED" ? 409
      : this.code === "AUTH_REGISTRATION_FAILED" || this.code === "AUTH_MAIL_BUSY"
        || this.code === "AUTH_TEMPORARILY_UNAVAILABLE" ? 503 : 400;
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

interface RefusalAggregate {
  readonly windowStartedAt: number;
  readonly actorToken: string;
  readonly occurredAt: Date;
  readonly source: AuthSourceContext;
  count: number;
  ipCount: number;
  addressCount: number;
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
    readonly actorToken: string;
    readonly now: Date;
    readonly source: AuthSourceContext;
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
          windowStartedAt,
          actorToken: input.actorToken,
          occurredAt: input.now,
          source: input.source,
          count: 0,
          ipCount: 0,
          addressCount: 0
        };
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

function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 320 && !value.startsWith("-")
    && /^[^\s@]+@[^\s@]+$/.test(value);
}

interface PendingRegistration {
  readonly email: string;
  readonly recoveryEmail: string;
  readonly emailBlindIndex: Buffer;
  readonly passwordHash: string;
  readonly requestedAt: Date;
  readonly source: AuthSourceContext;
}

interface VerificationDelivery {
  readonly userId: string;
  readonly channelBindingId: string;
  readonly email: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly source: AuthSourceContext;
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

type RegistrationPostwork = VerificationDeliveryPostwork | DuplicateRegistrationPostwork;
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

function sourceContext(source: AuthSourceContext): AuthSourceContext {
  if (source.ip.trim() === "" || source.requestId.trim() === "") {
    throw new AuthFlowError("AUTH_INPUT_INVALID");
  }
  const userAgent = source.userAgent.trim();
  return Object.freeze({
    ip: source.ip.slice(0, 64),
    userAgent: (userAgent === "" ? "unknown" : userAgent).slice(0, 256),
    requestId: source.requestId.slice(0, 128)
  });
}

export class RegistrationService implements RegistrationApplication {
  private readonly clock: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly pendingMailDispatches = new Set<Promise<void>>();
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

  constructor(private readonly dependencies: {
    readonly repository: IdentityRepository;
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
      actorToken: aggregate.actorToken,
      route,
      scope: aggregate.ipCount > 0 ? "ip" : "address",
      count: aggregate.count,
      ipCount: aggregate.ipCount,
      addressCount: aggregate.addressCount,
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
        false, minimumReservationMs, activationSpacingMs
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
    readonly actorToken: string;
    readonly now: Date;
    readonly source: AuthSourceContext;
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
    throw new AuthFlowError("AUTH_RATE_LIMITED");
  }

  private dispatchVerification(
    input: RegistrationPostwork | VerificationDelivery,
    releaseReservation: MailDispatchRelease
  ): void {
    const duplicate = "kind" in input && input.kind === "duplicate" ? input : undefined;
    let delivery: VerificationDelivery | undefined = duplicate === undefined
      ? input as VerificationDelivery
      : undefined;
    const deliveryAttemptId = delivery?.channelBindingId;
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

  async drainMailDispatches(): Promise<void> {
    while (this.pendingMailDispatches.size > 0) {
      await Promise.allSettled([...this.pendingMailDispatches]);
    }
  }

  private async provisionPendingAccount(input: PendingRegistration): Promise<RegistrationPostwork> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const userId = randomUUID();
      const pseudonym = generatePseudonym();
      const token = this.dependencies.verificationTokenFactory?.() ?? generateVerificationToken();
      const tokenHash = hashVerificationToken(token);
      const expiresAt = new Date(
        input.requestedAt.getTime() + this.dependencies.policy.verification.tokenTtlMs
      );
      const dek = generateDek();
      try {
        const keyId = `user-dek:${userId}`;
        const emailCiphertext = encrypt(dek, Buffer.from(input.email, "utf8"), [
          "identity", "user.email_ciphertext", userId, "run:none", userId, keyId, "1"
        ]);
        const recoveryEmailCiphertext = encrypt(dek, Buffer.from(input.recoveryEmail, "utf8"), [
          "identity", "user.recovery_email_ciphertext", userId, "run:none", userId, keyId, "1"
        ]);
        const created = await this.dependencies.repository.createPendingAccount({
          userId,
          emailBlindIndex: input.emailBlindIndex,
          emailCiphertext,
          recoveryEmailCiphertext,
          passwordHash: input.passwordHash,
          pseudonym,
          adultAffirmedAt: input.requestedAt,
          verificationTokenHash: tokenHash,
          verificationExpiresAt: expiresAt,
          occurredAt: input.requestedAt,
          source: input.source
        }, () => this.dependencies.dekStore.store(userId, dek));
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
          email: input.email,
          token,
          expiresAt,
          source: input.source
        });
      } finally {
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
        attemptId: input.channelBindingId,
        recipient: input.email,
        token: input.token,
        expiresAt: input.expiresAt
      });
    } catch (error) {
      errorCode = error instanceof MailDeliveryError ? error.operatorCode : "MAIL_DELIVERY_FAILED";
      console.error(`[AUTH_MAIL_DELIVERY_FAILED] attempt=${input.channelBindingId} code=${errorCode}`);
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

  async register(input: RegisterInput, rawSource: AuthSourceContext): Promise<typeof REGISTRATION_PUBLIC_RESPONSE> {
    const requestedAt = new Date(this.clock().getTime());
    const startedAt = performance.now();
    const correlationId = randomUUID();
    let pendingPostwork: RegistrationPostwork | undefined;
    let releaseMailDispatch: MailDispatchRelease | undefined;
    let mailDispatchActivatedAt: number | undefined;
    let releaseAdmission: (() => void) | undefined;
    try {
      try {
        if (!validEmail(input.email) || !validEmail(input.recoveryEmail)
          || typeof input.password !== "string"
          || input.password.length < this.dependencies.policy.password.minimumLength
          || input.adultAffirmed !== true) {
          throw new AuthFlowError("AUTH_INPUT_INVALID");
        }
        const source = sourceContext(rawSource);
        // THE ADMISSION GATE. After the input and source-context validation,
        // which must never consume budget, and before the first repository
        // await, the limiter lookup, either KDF, the mail reservation, the token
        // mint and every mutation. Nothing above this line has touched a
        // dependency, so the 104th valid request is refused having done no work
        // at all — it only pays the response clamp, like every other arm.
        releaseAdmission = this.acquireRegistrationAdmission(correlationId);
        const email = normalizeEmailForBlindIndex(input.email);
        const recoveryEmail = normalizeEmailForBlindIndex(input.recoveryEmail);
        const emailBlindIndex = createEmailBlindIndex(this.dependencies.blindIndexKey, email);
        const existing = await this.dependencies.repository.findAuditIdentityByBlindIndex(emailBlindIndex);
        const limit = this.dependencies.limiter.consume({
          route: "register",
          ip: source.ip,
          addressKey: emailBlindIndex.toString("hex"),
          now: this.clock()
        });
        if (!limit.allowed) {
          await this.refuseRateLimit({
            route: "register",
            scope: limit.scope,
            actorToken: existing?.auditToken ?? randomUUID(),
            now: this.clock(),
            source
          });
        }

        const passwordHashWork = this.scheduleRegistrationHash(input.password);
        let passwordHash: string;
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
            email, recoveryEmail, emailBlindIndex, passwordHash, requestedAt, source
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
        return REGISTRATION_PUBLIC_RESPONSE;
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
            this.holdRegistrationEnumerationClamp(startedAt),
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
    const tokenHash = hashVerificationToken(input.token);
    const identity = await this.dependencies.repository.findAuditIdentityByVerificationHash(tokenHash);
    const now = this.clock();
    const limit = this.dependencies.limiter.consume({
      route: "verify",
      ip: source.ip,
      addressKey: identity?.addressKey ?? tokenHash,
      now
    });
    if (!limit.allowed) {
      await this.refuseRateLimit({
        route: "verify",
        scope: limit.scope,
        actorToken: identity?.auditToken ?? randomUUID(),
        now,
        source
      });
    }
    if (!await this.dependencies.repository.consumeVerification({ tokenHash, occurredAt: now, source })) {
      throw new AuthFlowError("VERIFICATION_TOKEN_INVALID");
    }
    return Object.freeze({ status: "mfa_required" as const });
  }

  async resendVerification(
    input: { readonly email: string },
    rawSource: AuthSourceContext
  ): Promise<typeof RESEND_PUBLIC_RESPONSE> {
    const startedAt = performance.now();
    const correlationId = randomUUID();
    let pendingDelivery: VerificationDelivery | undefined;
    let releaseMailDispatch: MailDispatchRelease | undefined;
    try {
      if (!validEmail(input.email)) throw new AuthFlowError("AUTH_INPUT_INVALID");
      const source = sourceContext(rawSource);
      const email = normalizeEmailForBlindIndex(input.email);
      const emailBlindIndex = createEmailBlindIndex(this.dependencies.blindIndexKey, email);
      const identity = await this.dependencies.repository.findAuditIdentityByBlindIndex(emailBlindIndex);
      const now = this.clock();
      const limit = this.dependencies.limiter.consume({
        route: "resend",
        ip: source.ip,
        addressKey: emailBlindIndex.toString("hex"),
        now
      });
      if (!limit.allowed) {
        await this.refuseRateLimit({
          route: "resend",
          scope: limit.scope,
          actorToken: identity?.auditToken ?? randomUUID(),
          now,
          source
        });
      }
      releaseMailDispatch = await this.reserveMailDispatch(correlationId);
      const token = this.dependencies.verificationTokenFactory?.() ?? generateVerificationToken();
      const expiresAt = new Date(now.getTime() + this.dependencies.policy.verification.tokenTtlMs);
      const prepared = await this.dependencies.repository.prepareVerificationResend({
        emailBlindIndex,
        tokenHash: hashVerificationToken(token),
        expiresAt,
        occurredAt: now,
        cooldownMs: this.dependencies.policy.verification.resendCooldownMs,
        source
      });
      if (prepared.status === "send") {
        pendingDelivery = {
          userId: prepared.userId,
          channelBindingId: prepared.channelBindingId,
          email,
          token,
          expiresAt,
          source
        };
      }
      return RESEND_PUBLIC_RESPONSE;
    } catch (error) {
      // The resend route reaches the pool through its audit derivations.
      throw asAuthFlowFailure(error);
    } finally {
      try {
        await this.holdEnumerationFloor(startedAt);
      } finally {
        if (pendingDelivery !== undefined && releaseMailDispatch !== undefined) {
          const release = releaseMailDispatch;
          releaseMailDispatch = undefined;
          this.dispatchVerification(pendingDelivery, release);
        }
        if (releaseMailDispatch !== undefined) {
          this.dispatchMailReservationHold(releaseMailDispatch, true);
        }
      }
    }
  }
}
