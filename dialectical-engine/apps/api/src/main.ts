import { Hatchet } from "@hatchet-dev/typescript-sdk";
import {
  Argon2WorkerPool,
  AuditContextHasher,
  assertPublicationSecretDomains,
  ContentCipher,
  FilePublicationKeyStore,
  FileRunContentKeyStore,
  FileUserDekStore,
  loadKek,
  loadSecretKey,
  PublicationCipher
} from "@debateai/crypto";
import { assertPublicationDatabaseRoleSeparation, configureContentEncryption, createPool, PostgresIdentityRepository, PostgresPublicationRepository, PostgresSessionRepository, ProviderProbeRepository } from "@debateai/db";
import type { AskRequest } from "@debateai/contract";
import type { RiskTier } from "@debateai/kernel";
import { readDeploymentMakerCapability } from "@debateai/critique";
import {
  loadApiEnvironment,
  readDeploymentRiskTier,
  computeStructuralCeilingBasis,
  ENGINE_BRANCHING_FACTOR,
  ENGINE_COMPOSITION_SEGMENT_CAP,
  ENGINE_FIXED_ORGANS_PER_COMPOSITION,
  ENGINE_MAX_RECOMPOSE,
  readPanelDiscoveryPolicy,
  readAuthPolicy,
  readMfaPolicy,
  readSessionPolicy,
  readStructuralCeilingPolicyInputs,
  resolveEffectiveRiskTier,
} from "@debateai/register";
import {
  buildApi,
  createLegacyDevSessionResolver,
  HatchetDispatcher,
  PostgresAskApplication,
  preserveSubmittedTierSource
} from "./index.js";
import { InProcessAuthRateLimiter, RegistrationService } from "./registration.js";
import { MfaEnrollmentService } from "./mfa.js";
import { SessionService } from "./sessions.js";
import { PostgresPublicationApplication } from "./publications.js";
import { SendmailMailSender } from "./mail-channel.js";
import { installGracefulShutdown } from "./graceful-shutdown.js";
import { PostgresEvaluatorDevMenuRepository } from "@debateai/evaluator";

const environment = loadApiEnvironment();
const kek = loadKek(environment.KEK_PATH);
const corpusKek = environment.PUBLICATION_ENABLED === "true"
  ? loadKek(environment.CORPUS_KEK_PATH!) : undefined;
if (corpusKek !== undefined) {
  assertPublicationSecretDomains({
    privateKek: kek,
    corpusKek,
    privateKekPath: environment.KEK_PATH,
    corpusKekPath: environment.CORPUS_KEK_PATH!,
    privateStorePath: environment.USER_DEK_STORE_PATH,
    publicationStorePath: environment.PUBLICATION_KEY_STORE_PATH!
  });
}
const blindIndexKey = loadSecretKey(environment.BLIND_INDEX_KEY_PATH);
const sourceIpSalt = loadSecretKey(environment.AUDIT_SOURCE_IP_SALT_PATH);
const pool = createPool(environment.DATABASE_URL);
const authorizationPool = environment.PUBLICATION_ENABLED === "true"
  ? createPool(environment.AUTHORIZATION_DATABASE_URL!) : pool;
if (environment.PUBLICATION_ENABLED === "true") {
  try {
    await assertPublicationDatabaseRoleSeparation(pool, authorizationPool);
  } catch (error) {
    await Promise.allSettled([pool.end(), authorizationPool.end()]);
    throw error;
  }
}
const authPolicy = await readAuthPolicy(pool, environment.REGISTER_VERSION);
const mfaPolicy = await readMfaPolicy(pool, environment.REGISTER_VERSION);
const sessionPolicy = await readSessionPolicy(pool, environment.REGISTER_VERSION);
// Exactly ONE process-owned Argon2 worker pool. It is created before the
// repository and the registration service, both of which receive this same
// instance, and every worker completes its ready handshake before `listen`, so
// no request can arrive while a worker is still booting.
const argon2Pool = new Argon2WorkerPool();
await argon2Pool.ready();
const auditContextHasher = new AuditContextHasher(
  argon2Pool, sourceIpSalt, authPolicy.auditSourceIpKdf
);
const identityRepository = new PostgresIdentityRepository(pool, auditContextHasher);
sourceIpSalt.fill(0);
const hatchet = new Hatchet({
  token: environment.HATCHET_CLIENT_TOKEN, host_port: environment.HATCHET_HOST_PORT,
  api_url: environment.HATCHET_API_URL, tenant_id: environment.HATCHET_TENANT_ID,
  tls_config: { tls_strategy: environment.HATCHET_TLS_STRATEGY }
});
const dispatcher = new HatchetDispatcher(hatchet, environment.HATCHET_WORKFLOW_NAME);
const deploymentMakers = await readDeploymentMakerCapability(pool, environment.REGISTER_VERSION);
const discoveryPolicy = await readPanelDiscoveryPolicy(pool, environment.REGISTER_VERSION);
const structuralInputs = await readStructuralCeilingPolicyInputs(pool, environment.REGISTER_VERSION);
const probes = new ProviderProbeRepository(pool);
const deploymentRiskTier = await readDeploymentRiskTier(pool, environment.REGISTER_VERSION);
const dekStore = new FileUserDekStore(environment.USER_DEK_STORE_PATH, kek);
if (environment.CONTENT_ENCRYPTION_ENABLED === "true") {
  const contentBlindIndexKey = loadSecretKey(environment.CONTENT_BLIND_INDEX_KEY_PATH!);
  try {
    configureContentEncryption(pool, new ContentCipher(
      new FileRunContentKeyStore(
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
      ),
      contentBlindIndexKey
    ));
  } finally {
    contentBlindIndexKey.fill(0);
  }
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
const sessions = await SessionService.create({
  repository: new PostgresSessionRepository(authorizationPool, auditContextHasher),
  dekStore,
  argon2: argon2Pool,
  authPolicy,
  mfaPolicy,
  sessionPolicy,
  blindIndexKey
});
const application = new PostgresAskApplication(pool, dispatcher, {
  strangerSampleRate: environment.STRANGER_SAMPLE_RATE,
  registerVersion: environment.REGISTER_VERSION,
  batteryVersion: environment.BATTERY_VERSION,
  settlementWatchHandle: environment.SETTLEMENT_WATCH_HANDLE,
  resolveDiscoveredPanel: async () => {
    const latest = await probes.readLatest(deploymentMakers.configuredProviders.map((provider) => provider.providerRef));
    const now = Date.now();
    return Object.freeze(latest.flatMap((record) =>
      record.state === "HEALTHY" && record.modelId !== null
        && now - record.probedAt.getTime() <= discoveryPolicy.probeFreshnessMs
        ? [Object.freeze({
            provider_ref: record.providerRef,
            maker: record.maker,
            model_id: record.modelId,
            probe_evidence_ref: record.probeEvidenceRef,
            probed_at: record.probedAt.toISOString()
          })]
        : []
    ));
  },
  resolveEnvelopeBasis: async (input) => computeStructuralCeilingBasis({
    ...structuralInputs,
    panelSize: input.panelSize,
    depth: Number(input.depthParams.depth),
    maxRecompose: ENGINE_MAX_RECOMPOSE,
    branchingFactor: ENGINE_BRANCHING_FACTOR,
    compositionSegmentCap: ENGINE_COMPOSITION_SEGMENT_CAP,
    fixedOrgansPerComposition: ENGINE_FIXED_ORGANS_PER_COMPOSITION
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
});
const publications = environment.PUBLICATION_ENABLED === "true"
  ? new PostgresPublicationApplication(
      new PostgresPublicationRepository(pool, auditContextHasher),
      new PublicationCipher(new FilePublicationKeyStore(
        environment.PUBLICATION_KEY_STORE_PATH!,
        corpusKek!
      ))
    )
  : undefined;
if (publications !== undefined) await publications.reconcileKeyCleanup();
const evaluatorDevMenuPool = environment.EVALUATOR_DEV_MENU_ENABLED === "true"
  ? createPool(environment.EVALUATOR_DEV_MENU_DATABASE_URL!)
  : undefined;
const evaluatorDevMenu = evaluatorDevMenuPool !== undefined
  ? new PostgresEvaluatorDevMenuRepository(evaluatorDevMenuPool)
  : undefined;
const api = buildApi({
  application,
  registration,
  mfa,
  sessions,
  ...(publications === undefined ? {} : { publications }),
  allowedOrigin: environment.PUBLIC_APP_URL,
  ...(
    environment.LEGACY_USER_DEV_TOKEN === undefined
      && environment.LEGACY_OPERATOR_DEV_TOKEN === undefined
      ? {}
      : { legacyDevSessionResolver: createLegacyDevSessionResolver({
        ...(environment.LEGACY_USER_DEV_TOKEN === undefined
          ? {} : { userToken: environment.LEGACY_USER_DEV_TOKEN }),
        ...(environment.LEGACY_OPERATOR_DEV_TOKEN === undefined
          ? {} : { operatorToken: environment.LEGACY_OPERATOR_DEV_TOKEN })
      }) }
  ),
  ...(evaluatorDevMenu === undefined ? {} : {
    evaluatorDevMenu,
    evaluatorDevMenuRegisterVersion: environment.REGISTER_VERSION
  })
});
const shutdown = installGracefulShutdown({
  api,
  registration,
  auditContextHasher,
  argon2Pool,
  databasePools: [
    pool,
    ...(authorizationPool === pool ? [] : [authorizationPool]),
    ...(evaluatorDevMenuPool === undefined ? [] : [evaluatorDevMenuPool])
  ]
});
try {
  await api.listen({ host: environment.API_HOST, port: environment.API_PORT });
} catch (error) {
  // A listen failure still owns every worker, secret cache, and DB handle built
  // above. Reuse the exact shutdown graph before surfacing the startup failure.
  await shutdown.close("listen-failure").catch(() => undefined);
  throw error;
}
