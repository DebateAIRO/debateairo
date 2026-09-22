import { Hatchet } from "@hatchet-dev/typescript-sdk";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  Argon2WorkerPool,
  AuditContextHasher,
  assertPublicationSecretDomains,
  configureCustodyGroup,
  ContentCipher,
  FilePublicationKeyStore,
  FileRunContentKeyStore,
  FileUserDekStore,
  loadKek,
  loadSecretKey,
  PublicationCipher,
  readCustodyAuthorizationHeader
} from "@debateai/crypto";
import { AccountErasureCoordinator, assertAccountErasureDatabaseRole, assertContentProvisionDatabaseRole, assertPublicationCleanupDatabaseRole, assertPublicationDatabaseRoleSeparation, assertSupportDatabaseRole, assertSupportKeyCoverage, configureContentEncryption, createPool, createSupportControlPlanePool, PostgresAccountErasureRepository, PostgresAuthenticationRiskSignalRepository, PostgresIdentityRepository, PostgresLegacyRunClaimRepository, PostgresPrivateRunErasureRepository, PostgresPublicationRepository, PostgresRecoveryStartRepository, PostgresSessionRepository, PostgresSupportCaseRepository, PostgresSupportCaseSummaryRepository, PostgresSupportMessageRepository, PostgresSupportOwnContextRepository, PostgresSupportRelayReservationRepository, PostgresSupportSessionRepository, PostgresSupportStatusRepository, PrivateRunErasureCoordinator, ProviderProbeRepository } from "@debateai/db";
import type { AskRequest } from "@debateai/contract";
import type { RiskTier } from "@debateai/kernel";
import { readDeploymentMakerCapability } from "@debateai/critique";
import {
  assertHostedCostEnvelopesSealed,
  loadApiEnvironment,
  createSupportConfigurationPort,
  readDeploymentRiskTier,
  computeStructuralCeilingBasis,
  readEnvelopeFormulaInputs,
  readPanelDiscoveryPolicy,
  readAdmissionPolicy,
  readAuthPolicy,
  readMfaPolicy,
  readProductRolePolicy,
  readRecoveryPolicy,
  readSessionPolicy,
  readStructuralCeilingPolicyInputs,
  resolveEffectiveRiskTier,
} from "@debateai/register";
import { loadHelpCorpus } from "@debateai/support-kb";
import {
  buildApi,
  HatchetDispatcher,
  PostgresAskApplication,
  preserveSubmittedTierSource
} from "./index.js";
import { InProcessAuthRateLimiter, RegistrationService } from "./registration.js";
import { AdmissionLimiter } from "./admission.js";
import { createSupportCaseMaterial, createSupportCaseService, createSupportMessageCipher, createWrappedSupportSessionKey } from "./support/session.js";
import { MfaEnrollmentService } from "./mfa.js";
import { SessionService } from "./sessions.js";
import { PostgresPublicationApplication } from "./publications.js";
import { PostgresLegacyRunClaimApplication } from "./legacy-claim.js";
import { SendmailMailSender, SendmailSecurityNotificationSender } from "./mail-channel.js";
import {
  AccountErasureNotificationReconciler,
  createSingleFlightErasureReconciler,
  PostgresAccountErasureApplication
} from "./account-erasure.js";
import { installBootCustody } from "./boot-custody.js";
import { installStartupResourceOwner } from "./startup-resource-owner.js";
import { PostgresEvaluatorDevMenuRepository } from "@debateai/evaluator";
import { RecoveryStartService } from "./recovery.js";
import {
  assertDeploymentProviderTargets,
  createProviderDiscoveryResolver,
  parseProviderDiscoveryTargets,
  resolveProviderTargetCredentials
} from "./provider-discovery.js";
import { riskSignalFailureIdentity } from "./risk-signal-identity.js";
import { createSupportKeyPort } from "./support/keys.js";
import { createSupportAnswerService } from "./support/answer.js";
import {
  createSupportModelAdapter,parseSupportModelTargetJson,type SupportModelPort
} from "./support/model.js";
import {
  SupportModelReservationLedger,createReservedSupportModelPort
} from "./support/model-reservation.js";
import { createAdvisorySummaryService,createSupportCaseAccessService,createSupportSummarySealer } from "./support/cases.js";
import { createSupportOwnContextService } from "./support/own-context.js";
import { PostgresSupportIncidentRepository } from "./support/incidents.js";
import { readLimits } from "./support/limits.js";
import { SupportRelayQueue } from "./support/queue.js";
import { SupportDegradedState } from "./support/degraded.js";

const environment = loadApiEnvironment();
// V-9(c) / V-28: a hosted deployment may not admit an ask — nor probe a paid
// vendor, which is itself a model call — until the per-run and daily cost
// envelopes are sealed. The seam is `readSealedCostEnvelopeStatus` in
// @debateai/register, which task 11 replaces. Local mode is untouched.
assertHostedCostEnvelopesSealed(environment.DEPLOYMENT_MODE);
const supportKnowledge = loadHelpCorpus(resolve("packages/support-kb/content"));
// V-19: before the first key file is opened, so a group this host cannot
// resolve refuses at boot instead of at the first private debate.
configureCustodyGroup(environment.DEBATEAI_CUSTODY_GROUP);
/**
 * DL7-F7. Custody of the boot's own secrets, from the first key load until the
 * startup resource owner exists. Everything registered here is zeroed or closed
 * if a later stage fails, so a boot that stops at, say, an unresolved register
 * row no longer exits with three KEKs live in memory.
 */
const boot = installBootCustody();
const kek = boot.holdKek(loadKek(environment.KEK_PATH));
const corpusKek = environment.PUBLICATION_ENABLED === "true"
  ? boot.holdKek(loadKek(environment.CORPUS_KEK_PATH!)) : undefined;
const blindIndexKey = loadSecretKey(environment.BLIND_INDEX_KEY_PATH);
const sourceIpSalt = loadSecretKey(environment.AUDIT_SOURCE_IP_SALT_PATH);
// DL7-F7: two plain secret buffers, held the moment they exist. Each has an
// owner LATER in the boot — the salt is zeroed once the hasher has copied it,
// the blind-index key once the session service holds it — and every stage in
// between can reject. Zeroing twice is harmless; not zeroing once is the
// finding.
boot.hold({ end: async () => { blindIndexKey.fill(0); } });
boot.hold({ end: async () => { sourceIpSalt.fill(0); } });
// L2-F8: this guarded the whole check on publication being enabled, so a
// private-only deployment could point KEK_PATH and BLIND_INDEX_KEY_PATH at one
// file and boot. The private domains are always checked; the corpus KEK and
// publication store join the same check only when publication is on.
await boot.run("publication-secret-domains", async () => assertPublicationSecretDomains({
  privateKek: kek,
  ...(corpusKek === undefined ? {} : {
    corpusKek,
    corpusKekPath: environment.CORPUS_KEK_PATH!,
    publicationStorePath: environment.PUBLICATION_KEY_STORE_PATH!
  }),
  privateKekPath: environment.KEK_PATH,
  privateStorePath: environment.USER_DEK_STORE_PATH,
  additionalSecrets: [
    { path: environment.BLIND_INDEX_KEY_PATH, material: blindIndexKey },
    { path: environment.AUDIT_SOURCE_IP_SALT_PATH, material: sourceIpSalt }
  ],
  additionalStorePaths: [environment.AUDIT_KEY_STORE_PATH]
}));
const pool = boot.hold(createPool(environment.DATABASE_URL));
const authorizationPool = boot.hold(createPool(environment.AUTHORIZATION_DATABASE_URL!));
const publicationCleanupPool = environment.PUBLICATION_ENABLED === "true"
  ? boot.hold(createPool(environment.PUBLICATION_CLEANUP_DATABASE_URL!)) : pool;
// Cleanup remains necessary when new encrypted writes are disabled: an intent
// left by an earlier enabled process must not abort every erasure cycle under
// the ordinary runtime principal.
const contentProvisionPool = boot.hold(createPool(environment.CONTENT_PROVISION_DATABASE_URL));
// Ask admission holds a session advisory lock while the count-changing run
// commit uses that same backend. Keep both principal paths on explicit pool
// instances so lock waiters cannot consume ordinary runtime/provision capacity.
const serverAskAdmissionPool=boot.hold(createPool(environment.CONTENT_PROVISION_DATABASE_URL));
const legacyAskAdmissionPool=boot.hold(createPool(environment.DATABASE_URL));
await boot.run("ask-admission-pools", async () => {
  if (serverAskAdmissionPool === contentProvisionPool
    || serverAskAdmissionPool === pool
    || legacyAskAdmissionPool === pool
    || legacyAskAdmissionPool === contentProvisionPool
    || legacyAskAdmissionPool === serverAskAdmissionPool) {
    throw new TypeError("ASK_ADMISSION_DATABASE_POOLS_MUST_BE_SEPARATE");
  }
});
const erasurePool = boot.hold(createPool(environment.ERASURE_DATABASE_URL));
// DL7-F7: the hand-rolled pool cleanup this stage carried is the ledger's job
// now, and it covers the KEKs the old one never reached.
await boot.run("database-roles", () => Promise.all([
  assertAccountErasureDatabaseRole(pool,erasurePool),
  assertAccountErasureDatabaseRole(legacyAskAdmissionPool,erasurePool),
  assertPublicationDatabaseRoleSeparation(pool, authorizationPool),
  ...(environment.PUBLICATION_ENABLED === "true" ? [
    assertPublicationCleanupDatabaseRole(publicationCleanupPool)
  ] : []),
  assertContentProvisionDatabaseRole(pool,contentProvisionPool),
  assertContentProvisionDatabaseRole(pool,serverAskAdmissionPool)
]));
const authPolicy = await boot.run("auth-policy", () => readAuthPolicy(pool, environment.REGISTER_VERSION));
const mfaPolicy = await boot.run("mfa-policy", () => readMfaPolicy(pool, environment.REGISTER_VERSION));
const sessionPolicy = await boot.run("session-policy", () => readSessionPolicy(pool, environment.REGISTER_VERSION));
const recoveryPolicy = await boot.run("recovery-policy", () => readRecoveryPolicy(pool, environment.REGISTER_VERSION));
const admissionPolicy = await boot.run("admission-policy", () => readAdmissionPolicy(pool, environment.REGISTER_VERSION));
await boot.run("product-role-policy", () => readProductRolePolicy(pool, environment.REGISTER_VERSION));
// Exactly ONE process-owned Argon2 worker pool. It is created before the
// repository and the registration service, both of which receive this same
// instance, and every worker completes its ready handshake before `listen`, so
// no request can arrive while a worker is still booting.
// L2-F9: the pool cannot end the process itself, and a latched breaker means
// every credential route fails closed forever. `shutdown` does not exist yet at
// this point in the boot order, so the handler is late-bound; before it is
// installed the fallback still marks the process for its supervisor.
let announceArgon2BreakerTrip = (): void => { process.exitCode = 75; };
const argon2Pool = new Argon2WorkerPool({
  onBreakerTripped: () => { announceArgon2BreakerTrip(); }
});
boot.hold({ end: () => argon2Pool.close() });
await boot.run("argon2-pool", () => argon2Pool.ready());
const auditContextHasher = new AuditContextHasher(
  argon2Pool, sourceIpSalt, authPolicy.auditSourceIpKdf
);
// The hasher holds the Argon2 salt copy; it closes with the rest of the boot.
boot.hold({ end: async () => auditContextHasher.close() });
const identityRepository = new PostgresIdentityRepository(pool, auditContextHasher);
sourceIpSalt.fill(0);
const hatchet = new Hatchet({
  token: environment.HATCHET_CLIENT_TOKEN, host_port: environment.HATCHET_HOST_PORT,
  api_url: environment.HATCHET_API_URL, tenant_id: environment.HATCHET_TENANT_ID,
  tls_config: { tls_strategy: environment.HATCHET_TLS_STRATEGY }
});
const dispatcher = new HatchetDispatcher(hatchet, environment.HATCHET_WORKFLOW_NAME);
const deploymentMakers = await boot.run("deployment-makers", () => readDeploymentMakerCapability(pool, environment.REGISTER_VERSION));
const discoveryPolicy = await boot.run("discovery-policy", () => readPanelDiscoveryPolicy(pool, environment.REGISTER_VERSION));
if (environment.PROVIDER_DISCOVERY_TARGETS_JSON === undefined) {
  throw new TypeError("PROVIDER_DISCOVERY_TARGETS_REQUIRED");
}
const structuralInputs = await boot.run("structural-ceilings", () => readStructuralCeilingPolicyInputs(pool, environment.REGISTER_VERSION));
/**
 * T17: the sealed `envelopeFormulaInputs` row (T16). The reader is the loud
 * stop — a deployment that never sealed the row cannot boot the API, so no ask
 * is ever admitted against an envelope this file invented. The engine shape
 * constants that used to be re-declared at the call site below now come from
 * this row, which seeds them from the same `engine-shape.ts` exports.
 */
const envelopeFormulaInputs = await boot.run("envelope-formula-inputs", () => readEnvelopeFormulaInputs(pool, environment.REGISTER_VERSION));
const probes = new ProviderProbeRepository(pool);
const declaredProviderTargets = parseProviderDiscoveryTargets(
  environment.PROVIDER_DISCOVERY_TARGETS_JSON,
  deploymentMakers.configuredProviders
);
// V-9(c): the same mode decision the runner takes, over the same target set, and
// taken on the DECLARED targets — before any credential file is resolved.
assertDeploymentProviderTargets(declaredProviderTargets, {
  mode: environment.DEPLOYMENT_MODE, nodeEnv: environment.NODE_ENV
});
// V-9(2): the ask-time health probe needs the same credential the runner uses, so
// it resolves each vendor's file through the same custody-checked seam.
const providerDiscoveryTargets = resolveProviderTargetCredentials(
  declaredProviderTargets, readCustodyAuthorizationHeader
);
const resolveProviderPanel = createProviderDiscoveryResolver({
  configuredProviders: deploymentMakers.configuredProviders,
  targets: providerDiscoveryTargets,
  probes,
  probeFreshnessMs: discoveryPolicy.probeFreshnessMs,
  probeTimeoutMs: environment.PROVIDER_PROBE_TIMEOUT_MS
});
const deploymentRiskTier = await boot.run("deployment-risk-tier", () => readDeploymentRiskTier(pool, environment.REGISTER_VERSION));
const dekStore = new FileUserDekStore(environment.USER_DEK_STORE_PATH, kek);
const authenticationRiskSignals = new PostgresAuthenticationRiskSignalRepository(
  pool,auditContextHasher,dekStore,recoveryPolicy.riskSignals.rawSignalRetentionMs,
  recoveryPolicy.riskSignals.maximumEvaluatorSignals
);
const recovery = new RecoveryStartService({
  repository: new PostgresRecoveryStartRepository(pool,auditContextHasher,dekStore),
  riskSignals:authenticationRiskSignals,
  onRiskSignalFailure:(error)=>console.error(
    "[RECOVERY_RISK_SIGNAL_PENDING]",riskSignalFailureIdentity(error)
  ),
  blindIndexKey,
  enumerationFloorMs: authPolicy.verification.enumerationResponseFloorMs,
  publicResponsePolicy: recoveryPolicy.publicResponse
});
const runKeyStore = new FileRunContentKeyStore(
  environment.USER_DEK_STORE_PATH,
  dekStore,
  async (ownerRef) => {
    const resolved = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM identity."user"
       WHERE owner_ref=$1 AND state='active'`,
      [ownerRef]
    );
    const userId = resolved.rows[0]?.user_id;
    if (userId === undefined) throw new TypeError("OWNER_REF_UNRESOLVED");
    return userId;
  }
);
if (environment.CONTENT_ENCRYPTION_ENABLED === "true") {
  configureContentEncryption(pool, new ContentCipher(runKeyStore));
}
const registration = new RegistrationService({
  repository: identityRepository,
  mail: new SendmailMailSender({
    executable: environment.MAIL_SENDMAIL_PATH,
    from: environment.MAIL_FROM,
    publicAppUrl: environment.PUBLIC_APP_URL,
    timeoutMs: authPolicy.channel.transportTimeoutMs
  }),
  dekStore,
  blindIndexKey,
  policy: authPolicy,
  limiter: new InProcessAuthRateLimiter(
    authPolicy.rateLimits,
    authPolicy.rateLimitBucketCapacity,
    authPolicy.rateLimitRefusalAuditIntervalMs
  ),
  argon2: argon2Pool
});
const mfa = new MfaEnrollmentService({
  repository: identityRepository,
  dekStore,
  argon2: argon2Pool,
  policy: mfaPolicy
});
const sessions = await boot.run("session-service", () => SessionService.create({
  repository: new PostgresSessionRepository(authorizationPool, auditContextHasher),
  riskSignals:authenticationRiskSignals,
  onRiskSignalFailure:(error)=>console.error(
    "[LOGIN_RISK_SIGNAL_PENDING]",riskSignalFailureIdentity(error)
  ),
  dekStore,
  argon2: argon2Pool,
  authPolicy,
  mfaPolicy,
  sessionPolicy,
  blindIndexKey
}));
const legacyRunClaim=new PostgresLegacyRunClaimApplication(
  new PostgresLegacyRunClaimRepository(pool,auditContextHasher)
);
const application = new PostgresAskApplication(pool, dispatcher, {
  strangerSampleRate: environment.STRANGER_SAMPLE_RATE,
  registerVersion: environment.REGISTER_VERSION,
  batteryVersion: environment.BATTERY_VERSION,
  settlementWatchHandle: environment.SETTLEMENT_WATCH_HANDLE,
  resolveDiscoveredPanel: resolveProviderPanel,
  resolveEnvelopeBasis: async (input) => computeStructuralCeilingBasis({
    ...structuralInputs,
    panelSize: input.panelSize,
    depth: Number(input.depthParams.depth),
    maxRecompose: envelopeFormulaInputs.maxRecompose,
    branchingFactor: envelopeFormulaInputs.branchingFactor,
    compositionSegmentCap: envelopeFormulaInputs.compositionSegmentCap,
    fixedOrgansPerComposition: envelopeFormulaInputs.fixedOrgansPerComposition,
    reviewerCallsPerNode: envelopeFormulaInputs.reviewerCallsPerNode,
    synthesizerMaxRounds: envelopeFormulaInputs.synthesizerMaxRounds,
    evaluatorMaxRounds: envelopeFormulaInputs.evaluatorMaxRounds,
    maxDepth: envelopeFormulaInputs.maxDepth
  }),
  resolveRisk(askerRiskTier: RiskTier, askerTierSource: AskRequest["tier_source"], askerProvenanceRef: string) {
    const resolved = resolveEffectiveRiskTier({
      askerTier: askerRiskTier,
      askerProvenanceRef,
      policyLevels: {
        parent: {},
        run: {},
        deployment: { riskTier: deploymentRiskTier.value }
      }
    });
    return preserveSubmittedTierSource(resolved, askerTierSource);
  }
},undefined,contentProvisionPool,Object.freeze({
  server:serverAskAdmissionPool,legacy:legacyAskAdmissionPool
}));
const publicationCipher = environment.PUBLICATION_ENABLED === "true"
  ? new PublicationCipher(new FilePublicationKeyStore(
      environment.PUBLICATION_KEY_STORE_PATH!,corpusKek!
    ))
  : undefined;
const publications = publicationCipher === undefined
  ? undefined
  : new PostgresPublicationApplication(
      new PostgresPublicationRepository(pool, auditContextHasher),
      publicationCipher,
      undefined,
      new PostgresPublicationRepository(publicationCleanupPool,auditContextHasher)
    );
let publicationCleanupTimer: ReturnType<typeof setInterval> | undefined;
if (publications !== undefined) {
  // Crash-orphan publication keys are claimed and removed before the process
  // can accept traffic. Both bounded outboxes continue reconciling while the
  // process is live; an item failure is reported only after later items in the
  // same batch were given a chance to complete.
  await publications.reconcileKeyProvisionCleanup();
  await publications.reconcileKeyCleanup();
  publicationCleanupTimer = setInterval(() => {
    void Promise.all([
      publications.reconcileKeyProvisionCleanup(),
      publications.reconcileKeyCleanup()
    ]).catch(() => console.error("[PUBLICATION_KEY_CLEANUP_PENDING]"));
  },30_000);
  publicationCleanupTimer.unref();
}
const accountErasureRepository = new PostgresAccountErasureRepository(
  erasurePool,auditContextHasher,contentProvisionPool
);
const accountErasure = new AccountErasureCoordinator(
  accountErasureRepository,dekStore,runKeyStore,publicationCipher
);
const privateErasure = new PrivateRunErasureCoordinator(
  new PostgresPrivateRunErasureRepository(erasurePool,auditContextHasher),
  runKeyStore,publicationCipher
);
const erasureApplication=new PostgresAccountErasureApplication(
  accountErasureRepository,privateErasure
);
const erasureNotifications = new AccountErasureNotificationReconciler(
  accountErasureRepository,dekStore,new SendmailSecurityNotificationSender({
    executable:environment.MAIL_SENDMAIL_PATH,
    from:environment.MAIL_FROM,
    timeoutMs:authPolicy.channel.transportTimeoutMs
  })
);
const reconciliationSource = () => Object.freeze({
  ip:"background",userAgent:"debateai-account-erasure-reconciler",requestId:randomUUID()
});
const reconcileErasure = async ():Promise<void> => {
  // Completion notifications must be acknowledged while the user DEK still
  // exists. Account cleanup runs last, so a same-cycle ACK can open the
  // authoritative SQL gate before any key destruction begins.
  await erasureNotifications.reconcile(100);
  await accountErasure.reconcileRunKeyProvisionIntents(100);
  await privateErasure.reconcile(reconciliationSource(),100);
  await accountErasure.reconcile(reconciliationSource(),100);
};
const triggerErasureReconciliation=createSingleFlightErasureReconciler(
  reconcileErasure,
  ()=>console.error("[ACCOUNT_ERASURE_RECONCILIATION_PENDING]")
);
const erasureReconcileTimer=setInterval(triggerErasureReconciliation,30_000);
erasureReconcileTimer.unref();
const triggerAuthenticationRiskCleanup=createSingleFlightErasureReconciler(
  async ()=>{
    await authenticationRiskSignals.purgeExpired(recoveryPolicy.riskSignals.cleanupBatchMax);
  },
  ()=>console.error("[AUTHENTICATION_RISK_SIGNAL_CLEANUP_PENDING]")
);
const authenticationRiskCleanupTimer=setInterval(
  triggerAuthenticationRiskCleanup,60_000
);
authenticationRiskCleanupTimer.unref();
const evaluatorDevMenuPool = environment.EVALUATOR_DEV_MENU_ENABLED === "true"
  ? boot.hold(createPool(environment.EVALUATOR_DEV_MENU_DATABASE_URL!))
  : undefined;
const evaluatorDevMenu = evaluatorDevMenuPool !== undefined
  ? new PostgresEvaluatorDevMenuRepository(evaluatorDevMenuPool)
  : undefined;
const supportPool = boot.hold(createPool(environment.SUPPORT_DATABASE_URL));
const supportRelayLeasePool = boot.hold(
  createPool(environment.SUPPORT_DATABASE_URL,{ max: 18 })
);
const supportKeys = await boot.run("support-keys", () => createSupportKeyPort({
  supportKekPath: environment.SUPPORT_KEK_PATH,
  protectedKeyPaths: [
    environment.KEK_PATH,
    environment.CORPUS_KEK_PATH,
    environment.BLIND_INDEX_KEY_PATH,
    environment.AUDIT_SOURCE_IP_SALT_PATH
  ].filter((path): path is string => path !== undefined)
}));
// DL7-F7: the support KEK is the third key the boot holds, and every stage
// after this one — the model target parse and eight repository constructions —
// used to be able to throw with it live in memory.
boot.hold({ end: () => supportKeys.close() });
const supportSessions = new PostgresSupportSessionRepository(
  supportPool,
  createWrappedSupportSessionKey(supportKeys)
);
const supportMessages = createSupportMessageCipher(
  supportKeys,
  new PostgresSupportMessageRepository(supportPool)
);
const supportConfiguration = createSupportConfigurationPort(
  createSupportControlPlanePool(environment.DATABASE_URL)
);
const reportSupportDiagnostic = (diagnostic: Readonly<{ code: string }> | string): void => {
  console.error({ code: typeof diagnostic === "string" ? diagnostic : diagnostic.code });
};
const supportRelayReservations = new PostgresSupportRelayReservationRepository(supportRelayLeasePool);
const supportRelayCallRecords = new PostgresSupportRelayReservationRepository(supportPool);
const supportRelayQueue = new SupportRelayQueue({
  readLimits: () => readLimits(supportConfiguration),
  reservations: supportRelayReservations,
  reportCleanupFailure: reportSupportDiagnostic
});
const supportDegraded = new SupportDegradedState();
// V-30(1): the support chat's model is configuration, on the SAME mode decision
// the debate targets take above. Hosted refuses a relay target here exactly as
// it refuses one there; local keeps today's relay path.
const supportModelTarget = environment.SUPPORT_MODEL_TARGET_JSON === undefined
  ? undefined : parseSupportModelTargetJson(environment.SUPPORT_MODEL_TARGET_JSON,{
    mode: environment.DEPLOYMENT_MODE,nodeEnv: environment.NODE_ENV
  });
const supportModels = new Map<string,SupportModelPort>(supportModelTarget === undefined ? [] : [[
  supportModelTarget.providerRef,
  // V-9(2): a declared credential FILE is resolved here, through the same
  // custody-checked loader the debate targets use — one seam, one contract.
  createSupportModelAdapter(supportModelTarget,{
    readAuthorizationHeader: readCustodyAuthorizationHeader,
    timeoutMs: environment.PROVIDER_PROBE_TIMEOUT_MS
  })
] as const]);
const supportModelReservations = new SupportModelReservationLedger({
  processId: `support-api-${process.pid}`,
  processPid: process.pid,
  ordinaryPoolId: "support-runtime",
  controlPoolId: "support-control"
});
const supportAdmittedModel = createReservedSupportModelPort({
  configuration: supportConfiguration,
  ledger: supportModelReservations,
  durableCalls: supportRelayCallRecords,
  modelFor: (modelRef) => supportModels.get(modelRef)
});
const supportCaseSummaries = new PostgresSupportCaseSummaryRepository(supportPool);
const supportSummaryService = createAdvisorySummaryService({
  complete: async (request) => {
    return (await supportRelayQueue.execute({
      modelBacked: true,language: request.language,signal: request.signal
    },(signal) => supportAdmittedModel.complete({
      ...request,...(signal === undefined ? {} : { signal })
    }))).text;
  },
  seal: createSupportSummarySealer(
    supportKeys,supportCaseSummaries.readCaseKey.bind(supportCaseSummaries)
  ),
  persist: supportCaseSummaries.updateCaseSummary.bind(supportCaseSummaries)
});
const supportCases = createSupportCaseService({
  messages: supportMessages,
  summaries: supportSummaryService,
  reportSummaryFailure: reportSupportDiagnostic,
  createOnce: async (input) => {
    let snapshot: Uint8Array | undefined;
    const repository = new PostgresSupportCaseRepository(
      supportPool,
      async (caseId) => {
        if (snapshot === undefined) throw new TypeError("SUPPORT_CASE_SNAPSHOT_UNAVAILABLE");
        return createSupportCaseMaterial(supportKeys,snapshot)(caseId);
      }
    );
    return repository.createCaseOnce({
      sessionId: input.sessionId,identityOwnerRef: input.identityOwnerRef,
      language: input.language,createdAt: input.createdAt,
      triggerPredicate: input.triggerPredicate,triggerGeneration: input.triggerGeneration,
      toolCalls: input.toolCalls,kbVersion: input.kbVersion,slaHours: input.slaHours,
      prepare: async () => {
        const prepared = await input.prepare();
        snapshot = prepared.transcriptSnapshot;
        return Object.freeze({
          caseId: prepared.caseId,token: prepared.token,tokenSha256: prepared.tokenSha256
        });
      }
    });
  },
  create: async (input) => {
    const repository = new PostgresSupportCaseRepository(
      supportPool,
      createSupportCaseMaterial(supportKeys,input.transcriptSnapshot)
    );
    return repository.createCase({
      caseId: input.caseId,
      tokenSha256: input.tokenSha256,
      sessionId: input.sessionId,
      language: input.language,
      createdAt: input.createdAt,
      identityOwnerRef: input.identityOwnerRef,
      triggerPredicate: input.triggerPredicate,
      toolCalls: input.toolCalls,
      kbVersion: input.kbVersion,
      slaHours: input.slaHours
    });
  }
});
const supportIncidents = new PostgresSupportIncidentRepository(supportPool as never);
const supportAnswers = createSupportAnswerService({
  entries: supportKnowledge.entries,
  messages: supportMessages,
  incidents: supportIncidents,
  queue: supportRelayQueue,
  degraded: supportDegraded,
  modelFor: () => supportAdmittedModel
});
const supportStatus = new PostgresSupportStatusRepository(supportPool);
const supportOwnContext = createSupportOwnContextService(
  new PostgresSupportOwnContextRepository(pool,supportPool)
);
const api = buildApi({
  application,
  accountErasure:erasureApplication,
  registration,
  recovery,
  mfa,
  sessions,
  legacyRunClaim,
  // B10: the sealed admission budgets are always composed in production.
  admission: new AdmissionLimiter(admissionPolicy),
  support: {
    configuration: supportConfiguration,
    // DL5-F3: the caller's network is pseudonymised under a key derived from
    // the support KEK before it ever reaches an append-only table.
    sourcePseudonym: (value: string) => supportKeys.sourcePseudonym(value),
    sessions: Object.freeze({
      create: supportSessions.create.bind(supportSessions),
      read: supportSessions.read.bind(supportSessions),
      setConsent: supportSessions.setConsent.bind(supportSessions),
      admitMessage: supportSessions.admitMessage.bind(supportSessions),
      admitIpSession: supportSessions.admitIpSession.bind(supportSessions),
      finalizeInjectionLock: supportSessions.finalizeInjectionLock.bind(supportSessions),
      recordRateLimit: supportSessions.recordRateLimit.bind(supportSessions),
      rateMessage: supportSessions.rateMessage.bind(supportSessions),
      status: supportStatus.status.bind(supportStatus)
    }),
    messages: supportMessages,
    cases: supportCases,
    caseAccess: createSupportCaseAccessService({
      repository: supportCaseSummaries,keys: supportKeys
    }),
    answer: supportAnswers,
    ownContext: supportOwnContext,
    incidents: supportIncidents,
    reportDiagnostic: reportSupportDiagnostic,
    knowledge: {
      status: async () => Object.freeze({
        kbVersion: supportKnowledge.kbVersion,
        shipped: supportKnowledge.shippedCount,
        ignored: supportKnowledge.ignoredCount
      })
    }
  },
  ...(publications === undefined ? {} : { publications }),
  allowedOrigin: environment.PUBLIC_APP_URL,
  ...(evaluatorDevMenu === undefined ? {} : {
    evaluatorDevMenu,
    evaluatorDevMenuRegisterVersion: environment.REGISTER_VERSION
  })
});
if (publicationCleanupTimer !== undefined) {
  api.addHook("onClose",async () => clearInterval(publicationCleanupTimer));
}
api.addHook("onClose",async () => clearInterval(erasureReconcileTimer));
api.addHook("onClose",async () => clearInterval(authenticationRiskCleanupTimer));
const startup = installStartupResourceOwner({
  api,
  registration,
  auditContextHasher,
  argon2Pool,
  databasePools: [
    pool,
    ...(authorizationPool === pool ? [] : [authorizationPool]),
    ...(publicationCleanupPool === pool || publicationCleanupPool === authorizationPool
      ? [] : [publicationCleanupPool]),
    ...(contentProvisionPool === pool
        || contentProvisionPool === authorizationPool
        || contentProvisionPool === publicationCleanupPool
      ? [] : [contentProvisionPool]),
    serverAskAdmissionPool,
    legacyAskAdmissionPool,
    ...(erasurePool === pool
        || erasurePool === authorizationPool
        || erasurePool === publicationCleanupPool
        || erasurePool === contentProvisionPool
      ? [] : [erasurePool]),
    ...(evaluatorDevMenuPool === undefined ? [] : [evaluatorDevMenuPool]),
    supportPool,
    supportRelayLeasePool,
    { end: () => supportKeys.close() },
    { end: () => supportConfiguration.close() }
  ],
  // L2-F7: zeroed after every pool that borrows from them has closed.
  kekHandles: [kek, ...(corpusKek === undefined ? [] : [corpusKek])]
});
// DL7-F7: the boot ledger hands everything it held to the startup resource
// owner, which is the lifecycle from here on. Exactly one owner at a time:
// nothing can now be closed twice, and the ledger's own `run` becomes a
// pass-through so a later stage answers to `startup.run` alone.
boot.release();

// EX_TEMPFAIL (75): a transient, restartable failure. systemd's
// Restart=on-failure then replaces the process instead of leaving a latched
// 503 on every authentication route until a human notices.
announceArgon2BreakerTrip = (): void => {
  console.error(JSON.stringify({
    event: "argon2.breaker.tripped", action: "graceful-shutdown", exit_code: 75
  }));
  process.exitCode = 75;
  void startup.close("ARGON2_BREAKER_TRIPPED").catch(() => undefined);
};
await startup.run("support-attestation", async () => {
  await assertSupportDatabaseRole(pool, supportPool);
  await assertSupportDatabaseRole(pool, supportRelayLeasePool);
  await assertSupportKeyCoverage(supportPool);
});
await startup.run("listen", async () => {
  await api.listen({ host: environment.API_HOST, port: environment.API_PORT });
});
// Queue draining is deliberately background-only. A bounded sendmail timeout
// can never hold readiness hostage, while the SQL ACK gate still prevents any
// user-key destruction before completion delivery succeeds.
triggerErasureReconciliation();
triggerAuthenticationRiskCleanup();
