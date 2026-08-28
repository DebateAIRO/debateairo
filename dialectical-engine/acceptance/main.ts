import { pathToFileURL } from "node:url";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import {
  buildApi,PostgresAskApplication,type Dispatcher
} from "@debateai/api";
import type { AuthenticatedSession, SessionApplication } from "../apps/api/src/sessions.js";
import {
  createTerminalActivationEvaluator,
  WorkItemRepository,
  type TerminalCompletionDeclaration
} from "@debateai/battery";
import {
  createPool,
  configureContentEncryption,
  PostgresSessionRepository,
  ProviderProbeRepository,
  RunRepository,
  type AuthSourceContext,
  type CompletionActivationResolution
} from "@debateai/db";
import {
  ContentCipher,
  generateDek,
  hashVerificationToken,
  MemoryRunContentKeyStore,
  type AuditContextHasher,
  type KeyDestroyResult,
  type ReadableUserDekStore
} from "@debateai/crypto";
import { TypedDomainError, type RiskTier } from "@debateai/kernel";
import { resolveEffectiveRiskTier } from "@debateai/register";
import {
  RUNNER_MAX_RECOMPOSE,
  createPostgresProviderGateway,
  WalkingSkeletonRunner,
  type RunnerExecutionResult
} from "@debateai/runner";
import { startClaudeRelay } from "./claude-relay.js";
import {
  probeRelay,
  resolveFreshDiscovery,
  toDiscoveredPanel,
  type DiscoveredProvider
} from "./discovery.js";
import { startGrokRelay } from "./grok-relay.js";
import { ACCEPTANCE_REGISTER_SOURCE_REF, ACCEPTANCE_REGISTER_VERSION } from "./seed-register.js";
import {
  computeAcceptanceStructuralCeiling,
  readAcceptanceRuntimePolicy,
  readOptionalScoringOperator
} from "./runtime-policy.js";

const environmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  API_HOST: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().max(65_535),
  STRANGER_SAMPLE_RATE: z.coerce.number().min(0).max(1),
  BATTERY_VERSION: z.string().min(1),
  SETTLEMENT_WATCH_HANDLE: z.string().min(1),
  MODEL_BASE_URL: z.string().url()
}).strict();

const ceremonyEnvironmentSchema = z.object({
  ACCEPTANCE_DB_PORT: z.coerce.number().int().positive().max(65_535),
  ACCEPTANCE_API_HOST: z.string().min(1),
  ACCEPTANCE_API_PORT: z.coerce.number().int().positive().max(65_535),
  ACCEPTANCE_SHIM_PORT: z.coerce.number().int().positive().max(65_535),
  ACCEPTANCE_GROK_RELAY_PORT: z.coerce.number().int().positive().max(65_535),
  ACCEPTANCE_STRANGER_SAMPLE_RATE: z.coerce.number().min(0).max(1),
  ACCEPTANCE_BATTERY_VERSION: z.string().min(1),
  ACCEPTANCE_SETTLEMENT_WATCH_HANDLE: z.string().min(1)
}).strict();

export type AcceptanceEnvironment = z.infer<typeof environmentSchema>;
export type AcceptanceCeremonyEnvironment = z.infer<typeof ceremonyEnvironmentSchema>;

const environmentKeys = Object.keys(environmentSchema.shape);

export function loadAcceptanceEnvironment(source: NodeJS.ProcessEnv = process.env): AcceptanceEnvironment {
  return environmentSchema.parse(Object.fromEntries(environmentKeys.map((key) => [key, source[key]])));
}

export function loadAcceptanceCeremonyEnvironment(
  source: NodeJS.ProcessEnv = process.env
): AcceptanceCeremonyEnvironment {
  const keys = Object.keys(ceremonyEnvironmentSchema.shape);
  return ceremonyEnvironmentSchema.parse(Object.fromEntries(keys.map((key) => [key, source[key]])));
}

export interface AcceptanceWorkExecutor {
  executeWorkItem(workItemId: string): Promise<RunnerExecutionResult>;
}

export interface AcceptanceFailureRecorder {
  recordTerminalFailure(input: {
    readonly runId: string;
    readonly workItemId: string;
    readonly reason: string;
  }): Promise<boolean>;
}

function acceptanceFailureReason(error: unknown): string {
  return error instanceof TypedDomainError
    ? `ACCEPTANCE_EXECUTION_FAILED:${error.code}`
    : "ACCEPTANCE_EXECUTION_FAILED:UNEXPECTED_ERROR";
}

export class AcceptanceDispatcher implements Dispatcher {
  constructor(
    private readonly runner: AcceptanceWorkExecutor,
    private readonly failures: AcceptanceFailureRecorder
  ) {}

  async dispatch(input: { readonly runId: string; readonly workItemId: string }): Promise<void> {
    // The acceptance API keeps the same non-blocking 202 contract as Hatchet's
    // runNoWait adapter. The database queue remains the source of record (P11).
    setImmediate(() => {
      void this.runner.executeWorkItem(input.workItemId).catch(async (error: unknown) => {
        const recorded = await this.failures.recordTerminalFailure({
          ...input,
          reason: acceptanceFailureReason(error)
        });
        if (!recorded) {
          process.stderr.write("ACCEPTANCE_FAILURE_STATE_NOT_RECORDED\n");
        }
      }).catch(() => {
          process.stderr.write("ACCEPTANCE_FAILURE_STATE_PERSIST_FAILED\n");
      });
    });
  }
}

export interface AcceptanceRuntime {
  readonly api: ReturnType<typeof buildApi>;
  readonly runner: WalkingSkeletonRunner;
  readonly serviceSession: AcceptanceServiceSession;
}

export interface AcceptanceServiceSession {
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly userAgent: string;
}

export function acceptanceServiceRequestHeaders(
  serviceSession: AcceptanceServiceSession,
  origin: string,
  mutating: boolean
): Readonly<Record<string, string>> {
  return Object.freeze({
    cookie: `__Host-debateai-session=${serviceSession.sessionToken}; __Host-debateai-csrf=${serviceSession.csrfToken}`,
    "user-agent": serviceSession.userAgent,
    ...(mutating ? { origin, "x-csrf-token": serviceSession.csrfToken } : {})
  });
}

const SERVICE_CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ACCEPTANCE_SERVICE_USER_AGENT = "DebateAI-Acceptance-Service/1";

export class AcceptanceUserDekStore implements ReadableUserDekStore {
  readonly #keys = new Map<string, Buffer>();

  async store(userId: string, dek: Uint8Array): Promise<void> {
    if (this.#keys.has(userId)) throw new TypeError("ACCEPTANCE_USER_DEK_EXISTS");
    this.#keys.set(userId, Buffer.from(dek));
  }

  async load(userId: string): Promise<Buffer> {
    const key = this.#keys.get(userId);
    if (key === undefined) throw new TypeError("ACCEPTANCE_USER_DEK_UNRESOLVED");
    return Buffer.from(key);
  }

  async exists(userId: string): Promise<boolean> {
    return this.#keys.has(userId);
  }

  async destroy(userId: string): Promise<KeyDestroyResult> {
    const key = this.#keys.get(userId);
    if (key === undefined) return "ALREADY_ABSENT";
    key.fill(0);
    this.#keys.delete(userId);
    return "DESTROYED";
  }
}

const acceptanceContentStores = new WeakMap<Pool, AcceptanceUserDekStore>();

export function acceptanceContentStore(pool: Pool): AcceptanceUserDekStore {
  const existing = acceptanceContentStores.get(pool);
  if (existing !== undefined) return existing;
  const users = new AcceptanceUserDekStore();
  const runs = new MemoryRunContentKeyStore(users, async (ownerRef) => {
    const resolved = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM identity."user"
       WHERE owner_ref=$1 AND state='active'`,
      [ownerRef]
    );
    const userId = resolved.rows[0]?.user_id;
    if (userId === undefined) throw new TypeError("ACCEPTANCE_OWNER_REF_UNRESOLVED");
    return userId;
  });
  configureContentEncryption(pool, new ContentCipher(runs));
  acceptanceContentStores.set(pool, users);
  return users;
}

function acceptanceBindingHash(bindingKey: Uint8Array, source: AuthSourceContext): string {
  const userAgent = typeof source?.userAgent === "string" && source.userAgent.trim() !== ""
    ? source.userAgent.trim().slice(0, 256) : "unknown";
  return `sha256:${createHmac("sha256", bindingKey)
    .update("debateai:session-user-agent:v1\0", "utf8")
    .update(userAgent, "utf8").digest("hex")}`;
}

function exactHashEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

function derivedServiceToken(serviceCredential: string, purpose: string): string {
  return createHmac("sha256", serviceCredential)
    .update(`debateai:acceptance-service:${purpose}:v1\0`, "utf8")
    .update(randomUUID(), "utf8")
    .digest("base64url");
}

export async function createAcceptanceServiceSession(
  pool: Pool,
  serviceCredential: string,
  userDeks: AcceptanceUserDekStore
): Promise<Readonly<{
  application: SessionApplication;
  credentials: AcceptanceServiceSession;
  principal: Readonly<{ userId:string;ownerRef:string;sessionId:string }>;
  close(): Promise<void>;
}>> {
  if (!SERVICE_CREDENTIAL_PATTERN.test(serviceCredential)) {
    throw new TypeError("ACCEPTANCE_SERVICE_CREDENTIAL_INVALID");
  }
  const bindingKey = createHmac("sha256", serviceCredential)
    .update("debateai:acceptance-service:binding-key:v1", "utf8").digest();
  const sessionToken = derivedServiceToken(serviceCredential, "session");
  const csrfToken = derivedServiceToken(serviceCredential, "csrf");
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const auditToken = randomUUID();
  const sessionId = randomUUID();
  const now = new Date();
  const bindingHash = acceptanceBindingHash(bindingKey, {
    ip: "127.0.0.1",
    userAgent: ACCEPTANCE_SERVICE_USER_AGENT,
    requestId: "acceptance-service-bootstrap"
  });
  await pool.query(`
    INSERT INTO identity."user" (
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,$3::jsonb,$3::jsonb,NULL,$4,$5,$6,$7,'active',$8,$8)
  `, [
    userId,
    createHash("sha256").update(`acceptance-service:${userId}`, "utf8").digest(),
    JSON.stringify({ kind: "acceptance-service-non-address" }),
    "acceptance-service-credential-not-login-capable",
    `acceptance-service-${userId}`,
    auditToken,
    ownerRef,
    now
  ]);
  await pool.query(`
    INSERT INTO identity.session (
      session_id,user_id,token_hash,csrf_token_hash,binding_context,
      created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6,$7,$8,$6,NULL)
  `, [
    sessionId,userId,hashVerificationToken(sessionToken),hashVerificationToken(csrfToken),
    JSON.stringify({ user_agent_hash: bindingHash }),now,
    new Date(now.getTime() + 14 * 24 * 60 * 60 * 1_000),
    new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000)
  ]);
  const userDek = generateDek();
  try {
    await userDeks.store(userId, userDek);
  } finally {
    userDek.fill(0);
  }
  const unavailableAuditContext = Object.freeze({
    hashSourceIp: async () => { throw new Error("ACCEPTANCE_SERVICE_AUDIT_PATH_UNAVAILABLE"); },
    hashUserAgent: async () => { throw new Error("ACCEPTANCE_SERVICE_AUDIT_PATH_UNAVAILABLE"); }
  }) as unknown as AuditContextHasher;
  const repository = new PostgresSessionRepository(pool, unavailableAuditContext);
  const unsupported = (): never => { throw new Error("ACCEPTANCE_SERVICE_SESSION_OPERATION_UNSUPPORTED"); };
  const application: SessionApplication = Object.freeze({
    async authenticate(presented: string, source: AuthSourceContext): Promise<AuthenticatedSession | null> {
      if (!SERVICE_CREDENTIAL_PATTERN.test(presented)) return null;
      const tokenHash = hashVerificationToken(presented);
      const record = await repository.authenticateSession({
        tokenHash,
        bindingHash: acceptanceBindingHash(bindingKey, source),
        occurredAt: new Date(),
        idleExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1_000)
      });
      return record === null ? null : Object.freeze({
        session: Object.freeze({
          asker_id: `owner:${record.ownerRef}`,
          session_id: record.sessionId,
          caller_scope: "ASKER" as const,
          ownership_provenance: "server_session" as const,
          provisional_identity_model: false as const
        }),
        userId: record.userId,
        ownerRef: record.ownerRef,
        tokenHash,
        csrfTokenHash: record.csrfTokenHash,
        authKind: "cookie" as const
      });
    },
    verifyCsrf(authenticated: AuthenticatedSession, suppliedToken: string): boolean {
      if (!SERVICE_CREDENTIAL_PATTERN.test(suppliedToken)) return false;
      return exactHashEqual(hashVerificationToken(suppliedToken), authenticated.csrfTokenHash);
    },
    beginLogin: async () => unsupported(),
    completeLogin: async () => unsupported(),
    logout: async () => unsupported(),
    listSessions: async () => unsupported(),
    revokeSession: async () => unsupported(),
    revokeAllSessions: async () => unsupported(),
    stepUp: async () => unsupported()
  });
  return Object.freeze({
    application,
    credentials: Object.freeze({ sessionToken, csrfToken, userAgent: ACCEPTANCE_SERVICE_USER_AGENT }),
    principal:Object.freeze({ userId,ownerRef,sessionId }),
    close: async () => { await userDeks.destroy(userId); }
  });
}

/**
 * A non-primary maker's live relay endpoint after its startup handshake. The
 * model id is the one the CLI itself reported (DR-143(2)). DR-143 clause 1
 * makes the more-than-one-maker requirement run-level fair-debate law,
 * enforced on the acceptance debate at this composition root.
 */
export interface AcceptanceMakerRelay {
  readonly providerRef: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly authorizationHeader: string;
}

/**
 * The DR-135 refusing evaluator — the OUTERMOST fallback (DR-139 ruling 2).
 * The live acceptance path now wires the real DR-139 terminal evaluator
 * (createTerminalActivationEvaluator); this function resolves NOTHING and
 * stays available for any wiring that must fail closed instead.
 */
export async function resolveAcceptanceTerminalActivations(input: {
  readonly runId: string;
  readonly waitingRows: readonly string[];
  readonly completion?: TerminalCompletionDeclaration;
}): Promise<readonly CompletionActivationResolution[]> {
  if (input.waitingRows.length > 0) {
    throw new TypedDomainError(
      "ACCEPTANCE_TERMINAL_WAIT_ROWS_UNRESOLVED",
      `DR-135 refusing evaluator: run ${input.runId} retains terminal WAIT rows ${input.waitingRows.join(",")}`
    );
  }
  return Object.freeze([]);
}

export function resolveAcceptanceRisk(
  askerRiskTier: RiskTier,
  askerProvenanceRef: string,
  deploymentRiskTier: RiskTier
): ReturnType<typeof resolveEffectiveRiskTier> {
  return resolveEffectiveRiskTier({
    askerTier: askerRiskTier,
    askerProvenanceRef,
    policyLevels: {
      parent: {},
      run: {},
      deployment: { riskTier: deploymentRiskTier }
    }
  });
}

export async function createAcceptanceRuntime(input: {
  readonly pool: Pool;
  readonly environment: AcceptanceEnvironment;
  readonly makerRelays: readonly AcceptanceMakerRelay[];
  readonly serviceCredential:string;
  readonly testOnlyTerminalEvaluator?: (input: {
    readonly runId: string;
    readonly waitingRows: readonly string[];
    readonly completion: TerminalCompletionDeclaration;
  }) => Promise<readonly CompletionActivationResolution[]>;
}): Promise<AcceptanceRuntime> {
  if (input.testOnlyTerminalEvaluator !== undefined && process.env.NODE_ENV !== "test") {
    throw new Error("TEST_ONLY_TERMINAL_EVALUATOR_FORBIDDEN");
  }
  const policy = await readAcceptanceRuntimePolicy(input.pool);
  const scoringOperator = await readOptionalScoringOperator(input.pool);
  const runRepository = new RunRepository(input.pool);
  const relaysByProviderRef = new Map(input.makerRelays.map((relay) => [relay.providerRef, relay]));
  const discoveredProviders = policy.providers.flatMap((configured) => {
    const relay = relaysByProviderRef.get(configured.providerRef);
    return relay === undefined ? [] : [{ configured, relay }];
  });
  const primary = discoveredProviders[0];
  if (primary === undefined) throw new Error("ACCEPTANCE_PRIMARY_PROVIDER_UNRESOLVED");
  const primaryProviderPolicy = primary.configured;
  const additionalProviders = discoveredProviders.slice(1).map(({ configured, relay }) => {
    return Object.freeze({
      gateway: createPostgresProviderGateway(input.pool, {
        endpoint: `${relay.baseUrl}/v1`,
        model: relay.model,
        maker: configured.maker,
        authorizationHeader: relay.authorizationHeader
      }),
      providerRef: configured.providerRef,
      maker: configured.maker
    });
  });
  // The walking-skeleton judge/composer/conformance chain stays on the OpenAI
  // (codex) provider; FAIR-01 (DR-140(b)) adds the Anthropic relay as the
  // debate's SECOND maker — it runs the critic leg, so the counter-position
  // in the answer graph is genuinely independent of the position's maker.
  const provider = createPostgresProviderGateway(input.pool, {
    endpoint: `${primary.relay.baseUrl}/v1`,
    model: primary.relay.model,
    maker: primaryProviderPolicy.maker,
    authorizationHeader: primary.relay.authorizationHeader
  });
  const longestDeadline = Math.max(
    policy.bounds.JUDGE.deadlineMs,
    policy.bounds.COMPOSER.deadlineMs,
    policy.bounds.CONFORMANCE.deadlineMs
  );
  const maximumRunAttempts = computeAcceptanceStructuralCeiling(policy, policy.providers.length, 5)
    .max_model_attempts;
  const probes = new ProviderProbeRepository(input.pool);
  const runner = new WalkingSkeletonRunner(input.pool, provider, {
    workerId: "acceptance:walking-skeleton",
    claimMs: longestDeadline * maximumRunAttempts
      + policy.runDeathPolicy.cooldownMs * policy.runDeathPolicy.maxCooldownHoldsPerRun,
    claimMarginMs: 0,
    judgeBound: policy.bounds.JUDGE,
    composerBound: policy.bounds.COMPOSER,
    conformanceBound: policy.bounds.CONFORMANCE,
    runDeathPolicy: policy.runDeathPolicy,
    hiddenNodeScoreThreshold: policy.hiddenNodeScoreThreshold,
    holdRecorder: {
      countCooldownHolds: (runId) => runRepository.countCooldownHolds(runId),
      record: (event) => runRepository.recordRunLifecycleEvent({
        runId: event.runId,
        kind: event.kind,
        value: {
          // The DB repository persists this payload as JSON; its legacy union is
          // intentionally narrower than the runner's DR-184 halt vocabulary.
          state: event.state,
          call_site_key: event.callSiteKey,
          parent_node_ref: event.parentNodeId,
          hold_ms: event.holdMs,
          hold_until: event.holdUntil,
          attempts_spent: event.attemptsSpent,
          transport_outcome: event.transportOutcome,
          planned_leg_count: event.plannedLegCount
        }
      }),
      wait: (cooldownMs) => new Promise((resolve) => setTimeout(resolve, cooldownMs))
    },
    providerRef: primaryProviderPolicy.providerRef,
    maker: primaryProviderPolicy.maker,
    judgeContractHash: policy.hashes.judge,
    composerContractHash: policy.hashes.composer,
    conformanceContractHash: policy.hashes.conformance,
    propagationContractHash: policy.hashes.propagation,
    serveContractHash: policy.hashes.serve,
    maxRecompose: RUNNER_MAX_RECOMPOSE,
    factBundleVersion: ACCEPTANCE_REGISTER_VERSION,
    judgementNumberKind: "base-probability",
    judgementProducer: "judgement:acceptance",
    propagationNumberKind: "propagated-probability",
    propagationProducer: "propagation:acceptance",
    compositionRow: policy.compositionRow,
    servePolicy: {
      compositionBudgets: policy.compositionBudgets,
      candidateConfidenceBand: "FULL",
      bandCeiling: policy.bandCeiling
    },
    judgementPolicy: {
      selectionRule: {
        kind: "MAXIMIZE_WEIGHTED_TAU",
        rowKey: "claimTypeCompositionMap",
        registerVersion: ACCEPTANCE_REGISTER_VERSION,
        sourceRef: ACCEPTANCE_REGISTER_SOURCE_REF
      },
      earnedWeight: 1,
      judgeWeightVersion: "acceptance:single-judge:v1",
      reducerVersion: "acceptance:DR-133:v1"
    },
    // FAIR-01 (DR-140(b)): the first non-primary maker retains the critique
    // leg for M=2 compatibility. Every further configured maker is carried by
    // additionalMakers; each artifact persists its maker/provider lineage.
    ...(additionalProviders[0] === undefined ? {} : { critique: {
      provider: additionalProviders[0].gateway,
      providerRef: additionalProviders[0].providerRef,
      maker: additionalProviders[0].maker
    } }),
    additionalMakers: additionalProviders.slice(1).map((configured) => ({
      provider: configured.gateway,
      providerRef: configured.providerRef,
      maker: configured.maker
    })),
    claimTimeProbe: async (member) => {
      const relay = relaysByProviderRef.get(member.provider_ref);
      if (relay === undefined) {
        return { state: "ABSENT", modelId: null, failureCode: "CLAIM_GATEWAY_UNRESOLVED" };
      }
      try {
        const healthy = await probeRelay({ ...relay, maker: member.maker });
        return { state: "HEALTHY", modelId: healthy.modelId, failureCode: null };
      } catch (error) {
        return {
          state: "ABSENT",
          modelId: null,
          failureCode: error instanceof TypedDomainError ? error.code : "CLAIM_PROVIDER_PROBE_FAILED"
        };
      }
    },
    // DR-074: the raw deployment row when V has ruled it; absent ⇒ the runner
    // stops loudly before any claim or model call (AC-76 — never invented).
    ...(scoringOperator === undefined ? {} : { scoringOperator }),
    // TERM-01 (DR-139): the REAL recorded-facts terminal evaluator replaces
    // the DR-135 refusing evaluator on the live path. The refusing evaluator
    // (resolveAcceptanceTerminalActivations) remains the outermost fallback.
    resolveTerminalActivations: input.testOnlyTerminalEvaluator ?? createTerminalActivationEvaluator(input.pool)
  });
  const dispatcher = new AcceptanceDispatcher(runner, new WorkItemRepository(input.pool));
  for (const { configured, relay } of discoveredProviders) {
    await probes.record({
      probeEvidenceRef: randomUUID(),
      providerRef: configured.providerRef,
      maker: configured.maker,
      state: "HEALTHY",
      modelId: relay.model,
      failureCode: null,
      probedAt: new Date()
    });
  }
  const serverAskAdmissionPool=createPool(input.environment.DATABASE_URL);
  const legacyAskAdmissionPool=createPool(input.environment.DATABASE_URL);
  try {
    const principals=await Promise.all([
      input.pool,serverAskAdmissionPool,legacyAskAdmissionPool
    ].map(async (candidate) => (await candidate.query<{ principal:string }>(
      "SELECT current_user AS principal"
    )).rows[0]?.principal));
    if (principals.some((principal)=>principal===undefined)
      || new Set(principals).size!==1) {
      throw new TypeError("ACCEPTANCE_ASK_ADMISSION_DATABASE_ROLE_MISMATCH");
    }
  } catch (error) {
    await Promise.allSettled([
      serverAskAdmissionPool.end(),legacyAskAdmissionPool.end()
    ]);
    throw error;
  }
  let serviceSession: Awaited<ReturnType<typeof createAcceptanceServiceSession>> | null = null;
  try {
  const initializedSession=await createAcceptanceServiceSession(
    input.pool,input.serviceCredential,acceptanceContentStore(input.pool)
  );
  serviceSession=initializedSession;
  const application = new PostgresAskApplication(input.pool, dispatcher, {
    strangerSampleRate: input.environment.STRANGER_SAMPLE_RATE,
    registerVersion: ACCEPTANCE_REGISTER_VERSION,
    batteryVersion: input.environment.BATTERY_VERSION,
    settlementWatchHandle: input.environment.SETTLEMENT_WATCH_HANDLE,
    resolveDiscoveredPanel: async () => {
      const latest = await probes.readLatest(policy.providers.map((provider) => provider.providerRef));
      const latestRecords: DiscoveredProvider[] = latest.map((record) => {
        if (record.state === "HEALTHY" && record.modelId !== null) return {
          probeEvidenceRef: record.probeEvidenceRef,
          providerRef: record.providerRef,
          maker: record.maker,
          state: "HEALTHY",
          modelId: record.modelId,
          probedAt: record.probedAt
        };
        if (record.state === "ABSENT" && record.failureCode !== null) return {
          probeEvidenceRef: record.probeEvidenceRef,
          providerRef: record.providerRef,
          maker: record.maker,
          state: "ABSENT",
          failureCode: record.failureCode,
          probedAt: record.probedAt
        };
        throw new TypedDomainError("PROVIDER_PROBE_RECORD_INVALID", record.providerRef);
      });
      const resolved = await resolveFreshDiscovery({
        targets: discoveredProviders.map(({ configured, relay }) => ({
          providerRef: configured.providerRef,
          maker: configured.maker,
          relay
        })),
        latestRecords,
        probeFreshnessMs: policy.panelDiscoveryPolicy.probeFreshnessMs,
        now: new Date(),
        probe: async (target): Promise<DiscoveredProvider> => {
          let observation: DiscoveredProvider;
          try {
            observation = await probeRelay({ ...target.relay, maker: target.maker });
          } catch (error) {
            observation = {
              probeEvidenceRef: randomUUID(),
              providerRef: target.providerRef,
              maker: target.maker,
              state: "ABSENT",
              failureCode: error instanceof TypedDomainError ? error.code : "PROVIDER_PROBE_FAILED",
              probedAt: new Date()
            };
          }
          await probes.record({
            probeEvidenceRef: observation.probeEvidenceRef,
            providerRef: observation.providerRef,
            maker: observation.maker,
            state: observation.state,
            modelId: observation.state === "HEALTHY" ? observation.modelId : null,
            failureCode: observation.state === "ABSENT" ? observation.failureCode : null,
            probedAt: observation.probedAt
          });
          return observation;
        }
      });
      return toDiscoveredPanel(resolved.panel);
    },
    resolveEnvelopeBasis: async (basis) =>
      computeAcceptanceStructuralCeiling(policy, basis.panelSize, Number(basis.depthParams.depth)),
    resolveRisk: (askerRiskTier, askerProvenanceRef) => resolveAcceptanceRisk(
      askerRiskTier,
      askerProvenanceRef,
      policy.riskTier
    )
  },undefined,input.pool,Object.freeze({
    server:serverAskAdmissionPool,legacy:legacyAskAdmissionPool
  }));
  const api=buildApi({
    application,
    sessions:initializedSession.application,
    allowedOrigin:`http://${input.environment.API_HOST}:${input.environment.API_PORT}`
  });
  api.addHook("onClose",async () => {
    await Promise.allSettled([
      serverAskAdmissionPool.end(),legacyAskAdmissionPool.end(),initializedSession.close()
    ]);
  });
  return Object.freeze({ api,runner,serviceSession:initializedSession.credentials });
  } catch (error) {
    await Promise.allSettled([
      serverAskAdmissionPool.end(),legacyAskAdmissionPool.end(),
      ...(serviceSession === null ? [] : [serviceSession.close()])
    ]);
    throw error;
  }
}

async function main(): Promise<void> {
  const environment = loadAcceptanceEnvironment();
  const pool = createPool(environment.DATABASE_URL);
  // FAIR-01: the standalone boot starts the REAL Anthropic relay itself — the
  // startup handshake proves the claude CLI is alive and captures its honest
  // model id before the API accepts any ask (DR-143(3)).
  const policy = await readAcceptanceRuntimePolicy(pool);
  const grokRelayPort = z.coerce.number().int().positive().max(65_535).parse(process.env.GROK_RELAY_PORT);
  const relayStarts = await Promise.allSettled([
    startClaudeRelay({ port: 0, timeoutMs: policy.bounds.JUDGE.deadlineMs }),
    startGrokRelay({ port: grokRelayPort, timeoutMs: policy.bounds.JUDGE.deadlineMs })
  ]);
  const claudeRelay = relayStarts[0]?.status === "fulfilled" ? relayStarts[0].value : null;
  const grokRelay = relayStarts[1]?.status === "fulfilled" ? relayStarts[1].value : null;
  const runtime = await createAcceptanceRuntime({
    pool,
    environment,
    serviceCredential:z.string().regex(SERVICE_CREDENTIAL_PATTERN)
      .parse(process.env.ACCEPTANCE_SERVICE_CREDENTIAL),
    makerRelays: [
      ...(claudeRelay === null ? [] : [{
        providerRef: "acceptance:claude-cli",baseUrl: claudeRelay.baseUrl,model: claudeRelay.model,
        authorizationHeader:claudeRelay.authorizationHeader
      }]),
      ...(grokRelay === null ? [] : [{
        providerRef: "acceptance:grok-cli",baseUrl: grokRelay.baseUrl,model: grokRelay.model,
        authorizationHeader:grokRelay.authorizationHeader
      }])
    ]
  });
  runtime.api.addHook("onClose",async () => pool.end());
  await runtime.api.listen({ host: environment.API_HOST, port: environment.API_PORT });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
