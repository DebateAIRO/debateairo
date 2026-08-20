import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { PostgresIdentityRepository, AuthSourceContext } from "@debateai/db";
import type { AuthPolicy, AuthRouteLimit } from "@debateai/register";
import {
  createEmailBlindIndex,
  encrypt,
  generateDek,
  generatePseudonym,
  generateVerificationToken,
  hashPassword,
  hashVerificationToken,
  normalizeEmailForBlindIndex,
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
  verifyEmail(input: { readonly token: string }, source: AuthSourceContext): Promise<{ readonly status: "active" }>;
  resendVerification(
    input: { readonly email: string },
    source: AuthSourceContext
  ): Promise<typeof RESEND_PUBLIC_RESPONSE>;
}

export class AuthFlowError extends Error {
  constructor(readonly code:
    | "AUTH_INPUT_INVALID"
    | "AUTH_RATE_LIMITED"
    | "AUTH_REGISTRATION_FAILED"
    | "VERIFICATION_TOKEN_INVALID"
  ) {
    super(code);
    this.name = "AuthFlowError";
  }

  get statusCode(): 400 | 429 | 503 {
    return this.code === "AUTH_RATE_LIMITED" ? 429 : this.code === "AUTH_REGISTRATION_FAILED" ? 503 : 400;
  }
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

type VerificationDeliveryPostwork = VerificationDelivery & Readonly<{ kind: "delivery" }>;

interface DuplicateRegistrationPostwork {
  readonly kind: "duplicate";
  readonly userId: string;
  readonly attemptId: string;
  readonly source: AuthSourceContext;
}

type RegistrationPostwork = VerificationDeliveryPostwork | DuplicateRegistrationPostwork;

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
  private readonly pendingRefusalAuditFlushes = new Map<AuthRoute, {
    readonly windowStartedAt: number;
    readonly timer: ReturnType<typeof setTimeout>;
    readonly completion: Promise<void>;
    readonly complete: () => void;
  }>();

  constructor(private readonly dependencies: {
    readonly repository: IdentityRepository;
    readonly mail: MailSender;
    readonly dekStore: UserDekStore;
    readonly blindIndexKey: Uint8Array;
    readonly policy: AuthPolicy;
    readonly limiter: InProcessAuthRateLimiter;
    readonly clock?: () => Date;
    readonly sleep?: (milliseconds: number) => Promise<void>;
  }) {
    this.clock = dependencies.clock ?? (() => new Date());
    this.sleep = dependencies.sleep ?? (async (milliseconds) => {
      await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
    });
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

  private scheduleRefusalAuditFlush(route: AuthRoute, windowStartedAt: number, now: Date): void {
    const active = this.pendingRefusalAuditFlushes.get(route);
    if (active?.windowStartedAt === windowStartedAt) return;
    if (active !== undefined) {
      clearTimeout(active.timer);
      active.complete();
      this.pendingRefusalAuditFlushes.delete(route);
    }

    let complete!: () => void;
    const completion = new Promise<void>((resolve) => { complete = resolve; });
    const delay = Math.max(0,
      windowStartedAt + this.dependencies.policy.rateLimitRefusalAuditIntervalMs - now.getTime()
    );
    const timer = setTimeout(() => {
      void (async () => {
        const aggregate = this.dependencies.limiter.finalizeRefusalAggregate(route, windowStartedAt);
        if (aggregate !== null) await this.recordRefusalAggregate(route, aggregate);
      })().catch(() => {
        console.error(
          `[AUTH_RATE_LIMIT_AUDIT_RECORD_FAILED] route=${route} window=${new Date(windowStartedAt).toISOString()}`
        );
      }).finally(() => {
        if (this.pendingRefusalAuditFlushes.get(route)?.windowStartedAt === windowStartedAt) {
          this.pendingRefusalAuditFlushes.delete(route);
        }
        complete();
      });
    }, delay);
    timer.unref();
    this.pendingRefusalAuditFlushes.set(route, { windowStartedAt, timer, completion, complete });
  }

  async drainRateLimitAuditFlushes(): Promise<void> {
    while (this.pendingRefusalAuditFlushes.size > 0) {
      await Promise.all([...this.pendingRefusalAuditFlushes.values()].map((pending) => pending.completion));
    }
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
      await this.recordRefusalAggregate(input.route, aggregate.finalized).catch(() => {
        console.error(
          `[AUTH_RATE_LIMIT_AUDIT_RECORD_FAILED] route=${input.route} window=${new Date(aggregate.finalized!.windowStartedAt).toISOString()}`
        );
      });
    }
    if (aggregate.startedWindow) {
      this.scheduleRefusalAuditFlush(input.route, aggregate.windowStartedAt, input.now);
    }
    throw new AuthFlowError("AUTH_RATE_LIMITED");
  }

  private dispatchVerification(input: RegistrationPostwork | VerificationDelivery): void {
    const duplicate = "kind" in input && input.kind === "duplicate" ? input : undefined;
    let pending!: Promise<void>;
    pending = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => duplicate === undefined
        ? this.deliverVerification(input as VerificationDelivery)
        : this.dependencies.repository.recordDuplicateRegistrationPostwork({
            userId: duplicate.userId,
            occurredAt: this.clock(),
            source: duplicate.source
          }))
      .catch(() => {
        if (duplicate === undefined) {
          console.error(
            `[AUTH_MAIL_DELIVERY_RECORD_FAILED] attempt=${(input as VerificationDelivery).channelBindingId} code=MAIL_RECORD_FAILED`
          );
        } else {
          console.error(
            `[AUTH_REGISTRATION_DUPLICATE_POSTWORK_FAILED] attempt=${duplicate.attemptId} code=AUDIT_RECORD_FAILED`
          );
        }
      })
      .finally(() => this.pendingMailDispatches.delete(pending));
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
      const auditToken = randomUUID();
      const pseudonym = generatePseudonym();
      const token = generateVerificationToken();
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
          auditToken,
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

  private async deliverVerification(input: VerificationDelivery): Promise<void> {
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
    await this.dependencies.repository.recordVerificationDelivery({
      userId: input.userId,
      occurredAt: this.clock(),
      source: input.source,
      success: errorCode === null,
      errorCode
    });
  }

  async register(input: RegisterInput, rawSource: AuthSourceContext): Promise<typeof REGISTRATION_PUBLIC_RESPONSE> {
    const requestedAt = new Date(this.clock().getTime());
    const startedAt = performance.now();
    const correlationId = randomUUID();
    let pendingPostwork: RegistrationPostwork | undefined;
    try {
      if (!validEmail(input.email) || !validEmail(input.recoveryEmail)
        || typeof input.password !== "string"
        || input.password.length < this.dependencies.policy.password.minimumLength
        || input.adultAffirmed !== true) {
        throw new AuthFlowError("AUTH_INPUT_INVALID");
      }
      const source = sourceContext(rawSource);
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

      const passwordHash = await hashPassword(input.password, this.dependencies.policy.password.argon2id);
      try {
        pendingPostwork = await this.provisionPendingAccount(Object.freeze({
          email, recoveryEmail, emailBlindIndex, passwordHash, requestedAt, source
        }));
      } catch {
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
        throw new AuthFlowError("AUTH_REGISTRATION_FAILED");
      }
      return REGISTRATION_PUBLIC_RESPONSE;
    } finally {
      try {
        await this.holdRegistrationEnumerationClamp(startedAt);
      } finally {
        if (pendingPostwork !== undefined) this.dispatchVerification(pendingPostwork);
      }
    }
  }

  async verifyEmail(
    input: { readonly token: string },
    rawSource: AuthSourceContext
  ): Promise<{ readonly status: "active" }> {
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
    return Object.freeze({ status: "active" as const });
  }

  async resendVerification(
    input: { readonly email: string },
    rawSource: AuthSourceContext
  ): Promise<typeof RESEND_PUBLIC_RESPONSE> {
    const startedAt = performance.now();
    let pendingDelivery: Parameters<RegistrationService["deliverVerification"]>[0] | undefined;
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
      const token = generateVerificationToken();
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
    } finally {
      try {
        await this.holdEnumerationFloor(startedAt);
      } finally {
        if (pendingDelivery !== undefined) this.dispatchVerification(pendingDelivery);
      }
    }
  }
}
