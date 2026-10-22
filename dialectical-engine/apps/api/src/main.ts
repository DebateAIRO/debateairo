import { createPreviewGuardedFetch, createPreviewBudgetRpcPorts, previewProbeControls, PREVIEW_GLM_DEADLINE_MS, previewProviderSocket, providerCompaniesOfTargets } from "@debateai/providers";
import { questionLanguagePolicyStartValues, type QuestionLanguagePolicy } from "@debateai/register";
import { hostedQuestionLanguageRoute, questionLanguageRouteFor } from "./question-language/boot.js";
import { questionLanguageReferenceKeyFrom } from "./question-language/reference.js";
// Side-by-side spec §13: the per-version admission settings (loader and cache) and the activation pointer's one reader.
import {
  admissionSettingsOfVersion, createAdmissionSettingsCache, createAdmissionView, loadAdmissionSettings, type AdmissionSiteContext
} from "./admission-settings.js";
import { createActiveSettingsVersionReader } from "./active-settings-version.js";
import { PasswordResetService } from "./password-reset.js";
import { PasswordResetNotificationWorker, SendmailPasswordResetSender } from "./password-reset-mail.js";
import { BackupEmailService, MfaRecoveryService } from "./email-mfa-recovery.js";
import { EmailRecoveryNotificationWorker, SendmailEmailRecoverySender } from "./email-mfa-mail.js";
import { PostgresPasswordResetRepository } from "../../../packages/db/src/password-reset.js";
import { PostgresBackupEmailRepository, PostgresMfaRecoveryRepository } from "../../../packages/db/src/email-mfa-recovery.js";
import { readPasswordResetPolicy, readBackupEmailPolicy, readMfaRecoveryPolicy } from "@debateai/register";
import { SocialStepUpService } from './social-step-up.js';
import { SocialAuthService } from './social-auth.js';
import { SocialProviders, UnixSocialTransport, socialConfigurations } from './social-providers/provider.js';
import { PostgresSocialIdentityRepository } from '@debateai/db';
import {ConsumerRecoveryService} from "./consumer-recovery.js";
import {OnboardingEvidenceService} from "./onboarding-evidence.js";
import {ConsumerSecurityNoticeReconciler} from "./consumer-security-notices.js";
import {PostgresConsumerRecoveryRepository,PostgresOnboardingEvidenceRepository,PostgresConsumerSecurityNoticeRepository} from "@debateai/db";
import {readConsumerRecoveryPolicy} from "@debateai/register";
import {SendmailConsumerAccountSender} from "./mail-channel.js";
import { ConsumerSecurityService } from "./consumer-security.js";
import { PostgresConsumerSecurityRepository } from "@debateai/db";
import { ConsumerWebAuthnService } from "./consumer-webauthn.js";
import { PostgresConsumerAuthRepository } from "@debateai/db";
import { UnixTurnstileVerifier } from "./turnstile.js";
import { AccountProfileService } from "./account-profile.js";
import { RecoveryEmailService } from "./recovery-email.js";
import { PostgresAccountProfileRepository,PostgresRecoveryEmailRepository } from "@debateai/db";
import { Hatchet } from "@hatchet-dev/typescript-sdk";
import { randomUUID } from "node:crypto";
import { DataExportApplication } from "./data-export/service.js";
import { FileDataExportStore } from "./data-export/store.js";
import { collectSnapshot } from "./data-export/snapshot.js";
import { loadArchiveCatalog } from "./data-export/archive-catalog.js";
import { OwnerViewAdapter } from "./data-export/owner-view-adapter.js";
import { TemplatedDataExportMail } from "./data-export/mail.js";
import { PostgresDataExportRepository, PostgresDataExportSource } from "@debateai/db";
import { assertDataExportDatabaseRoles } from "../../../packages/db/src/data-export.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Argon2WorkerPool,
  AuditContextHasher,
  assertPublicationSecretDomains,
  configureCustodyGroup,
  ContentCipher,
  decrypt,
  openRecord,
  FilePublicationKeyStore,
  FileRunContentKeyStore,
  FileUserDekStore,
  loadKekRing,
  loadSecretKey,
  PublicationCipher,
  readCustodyAuthorizationHeader
} from "@debateai/crypto";
import { AcceptanceRepository, AccountErasureCoordinator, API_DATABASE_POOLS, BillingJobQueries, BillingRepository, assertAccountErasureDatabaseRole, assertContentProvisionDatabaseRole, assertPublicationCleanupDatabaseRole, assertPublicationDatabaseRoleSeparation, assertSupportDatabaseRole, assertSupportKeyCoverage, configureContentEncryption, createPool, createSupportControlPlanePool, EntitlementRepository, PostgresInternalAllowanceRepository, PostgresAccountErasureRepository, PostgresAuthenticationRiskSignalRepository, PostgresEmailChangeRepository, PostgresIdentityRepository, PostgresLegacyRunClaimRepository, PostgresPrivateRunErasureRepository, PostgresPublicationCheckRecordRepository, PostgresPublicationRepository, PostgresRecoveryStartRepository, PostgresSessionRepository, PostgresStaffPrerequisiteProducer, PostgresStaffRepository, PostgresSupportCaseRepository, PostgresSupportCaseSummaryRepository, PostgresSupportMessageRepository, PostgresSupportRelayReservationRepository, PostgresSupportSessionRepository, PostgresSupportStatusRepository, PrivateRunErasureCoordinator, ProviderProbeRepository, RunWaitRepository, ServeDisclosureRepository } from "@debateai/db";
import { recordSpendWaiver } from "@debateai/db";
import { WorkItemRepository } from "@debateai/battery";
import { TypedDomainError } from "@debateai/kernel";
import { readDeploymentMakerCapability } from "@debateai/critique";
import {
  assertAskRoomAdmissionSealed,
  assertBillingReady,
  assertHostedCostEnvelopesSealed,
  assertHostedSupportAdmissionSealed,
  costEnvelopeBand,
  readBillingPlans,
  readBillingPolicy,
  readBillingEnvironmentGroup,
  readNetopiaEnvironmentGroup,
  type BillingPolicy,
  loadApiEnvironment,
  loadRetiredBillingSettings,
  createSupportConfigurationPort,
  readPanelDiscoveryPolicy,
  readAdmissionPolicy,
  readCostEnvelopePolicy,
  readCountryPolicy,
  readAuthPolicy,
  readMfaPolicy,
  readProductRolePolicy,
  readPublicationCheckPolicy,
  readRecoveryPolicy,
  readSessionPolicy,
  readTaxAuthorities,
} from "@debateai/register";
// V-28 (DL4-F2): the application-wide daily spending ceiling, over the persisted
// model-spend ledger migration 0066 created.
import {
  NO_PERSON_ALLOWANCE,
  PostgresModelSpendStore,
  PostgresRecentRunUsageSource,
  languageCheckSpendWriterPresent,
  recordLanguageCheckSpend
} from "@debateai/budget";
import { BillingPersonAllowanceSource } from "@debateai/billing-core";
import { FundingAwarePersonAllowanceSource } from "@debateai/billing-core";
import { SELLER_COMPANY } from "@debateai/billing-core";
import { createHelpCorpusSnapshotLookup,loadHelpCorpus } from "@debateai/support-kb";
import {
  buildApi,
  createReleaseNotServedAlert,
  installPublicationJudgeSwitchSignal,
  PostgresAskApplication,
  PostgresRunReleaseLookup,
  ReleaseRoutedDispatcher
} from "./index.js";
import { InProcessAuthRateLimiter, RegistrationService } from "./registration.js";
import { RepositoryLegalAcceptanceApplication } from "./legal.js";
import { AdmissionLimiter } from "./admission.js";
import { openGeoLookup } from "@debateai/geo";
import { CountryGate, countryPolicyInForce } from "./country-gate.js";
import { AskRoom, everyWholeMinute } from "./ask-room.js";
import type { AskBilling } from "./ask-billing.js";
import { PersonUsageReader } from "./billing/usage.js";
import type { BillingRouteOptions } from "./billing/index.js";
import { consoleBillingAudit } from "./billing/audit.js";
import { NetopiaNoticeIntake } from "./billing/netopia-intake.js";
import { assertNoticeSpoolDirectory, NoticeSpool } from "./billing/notice-spool.js";
import { createProviderOnlyJobs } from "./billing/provider-only-jobs.js";
import { createBillingRuntime } from "./billing/runtime.js";
import {
  assertLiveInvoicersAreLive,
  assertStageInvoicersAreSandboxes,
  billingClock
} from "./billing/stage-clock.js";
import { TimeShiftedCardPayments } from "./billing/time-shifted-payments.js";
import { createRetentionPurge } from "./retention-purge.js";
import {
  assertNoRecordsDatedAhead, assertOtherSystemRecordsClosed, assertProviderOnlyNotifySealed, billingCustodyPaths,
  billingModeOf, incompleteNetopiaKey, loadBillingConnectors, loadNetopiaConnectors, type BillingConnectors, type BillingMode, type NetopiaConnectors
} from "./billing/connectors.js";
import { createSupportCaseMaterial, createSupportCaseService, createSupportMessageCipher, createWrappedSupportSessionKey } from "./support/session.js";
import { MfaEnrollmentService } from "./mfa.js";
import { SessionService } from "./sessions.js";
import { StaffWebAuthnService } from "./staff/webauthn.js";
import { StaffAccessService } from "./staff/access.js";
import { createStaffRuntime } from "./staff/runtime.js";
import { PostgresPublicationApplication } from "./publications.js";
import { createPublicationContentCheck } from "./publication-check/check.js";
import { createPublicationJudgeSwitch, createPublicationJudgeTransport, publicationJudgeOffFlagPath } from "./publication-check/judge-transport.js";
import { RepositoryAnswerStoryApplication, RepositoryPublicationStoryReader } from "./stories.js";
import { RepositoryAnswerDisclosureApplication } from "./disclosures.js";
import { MapChoiceRepository } from "@debateai/map";
import { RepositoryAnswerMapViewApplication, runOwnerCheckFrom } from "./map-views.js";
import { StoryRepository } from "@debateai/story";
import { PostgresLegacyRunClaimApplication } from "./legacy-claim.js";
import { SendmailRecoveryEmailMailSender, SendmailEmailChangeMailSender, SendmailMailSender, SendmailSecurityNotificationSender, TemplatedMailSender } from "./mail-channel.js";
import { systemMailDomainCheck } from "./mail-domain-check.js";
import { EmailChangeService } from "./email-change.js";
import { billingMailAttachmentResolvers } from "./mail-attachments.js";
import {
  AccountErasureNotificationReconciler,
  createSingleFlightErasureReconciler,
  PostgresAccountErasureApplication
} from "./account-erasure.js";
import { installBootCustody } from "./boot-custody.js";
import { installStartupResourceOwner } from "./startup-resource-owner.js";
import { PostgresAskAdmissionGate, PostgresReleaseStateReader, ReleaseWatcher, siteCapBootLine } from "./release-state.js";
import { gatedInterval, gatedTrigger } from "./release-loops.js";
import { PostgresEvaluatorDevMenuRepository } from "@debateai/evaluator";
import { RecoveryStartService } from "./recovery.js";
import {
  assertDeploymentProviderTargets,
  assertPricedProviderTargets,
  buildApiProviderPriceMap,
  createProviderDiscoveryResolver,
  parseProviderDiscoveryTargets,
  resolveProviderTargetCredentials
} from "./provider-discovery.js";
import { riskSignalFailureIdentity } from "./risk-signal-identity.js";
import { createSupportKeyPort } from "./support/keys.js";
import { createSupportAnswerService } from "./support/answer.js";
import { projectSupportDraftReport,type SupportDraftReport } from "./support/response-policy.js";
import {
  createSupportModelAdapter,parseSupportModelTargetJson,supportAnthropicMessagesKey,type SupportModelPort
} from "./support/model.js";
import {
  SupportModelReservationLedger,createReservedSupportModelPort
} from "./support/model-reservation.js";
import { createAdvisorySummaryService,createSupportCaseAccessService,createSupportSummarySealer } from "./support/cases.js";
import { PostgresSupportIncidentRepository } from "./support/incidents.js";
import { readLimits } from "./support/limits.js";
import { SupportRelayQueue } from "./support/queue.js";
import { SupportDegradedState } from "./support/degraded.js";

const environment = loadApiEnvironment();
// NETOPIA spec 2026-10-05 §2.17.1: a removed card-processor setting still in api.env is named once, never its value.
for (const key of loadRetiredBillingSettings()) console.warn(JSON.stringify({ event: "billing.setting.retired", key }));
// Addition D14-D16 / ruling R25: "is this the preview?" keys on the env's gate part, present for every accepted form of
// the preview configuration (the sockets-only form leaves no line-up in the env). Each settings version's own line-up is
// composed over it by the admission loader (./admission-settings.ts).
const previewGate = environment.PREVIEW_GATE_SETTINGS;
if (previewGate !== undefined && environment.PUBLIC_APP_URL !== "https://v3-preview.dezbatere.ro") {
  throw new TypeError("PREVIEW_PROVIDER_ORIGIN_INVALID");
}
// V-9(c) / V-28: a hosted deployment may not admit an ask — nor probe a paid
// vendor, which is itself a model call — until the per-run and daily cost
// envelopes are sealed. The seam is `readSealedCostEnvelopeStatus` in
// @debateai/register, which task 11 replaces. Local mode is untouched.
assertHostedCostEnvelopesSealed(environment.DEPLOYMENT_MODE);
/**
 * The reviewed support knowledge base, its review manifest and its recovery
 * components (dev's SUP rework). Loading can refuse (SUPPORT_KB_*), and it is
 * SYNCHRONOUS: it stays here, before `installBootCustody()`, where no key or
 * secret has been loaded yet — a refusal at this line leaves nothing live to
 * zero, which is why it needs no ledger stage (DL7-F7).
 */
const supportKnowledge = loadHelpCorpus(resolve("packages/support-kb/content"),{
  reviewManifest: JSON.parse(readFileSync(
    resolve("packages/support-kb/reviews/manifest.json"),"utf8"
  )) as unknown,
  recoveryComponents: readFileSync(resolve("packages/support-kb/recovery/components.json")),
  requireReviewedRecovery: true
});
const supportKnowledgeSnapshots = createHelpCorpusSnapshotLookup(supportKnowledge);
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
/**
 * V-3 (fix wave A-C2). The KEK a service holds is a RING: the current key and,
 * for the length of a changeover, the previous one. Reads try current then
 * previous; every write uses the current key; verification is current-alone.
 * With no `*_KEK_PREVIOUS_PATH` set — the steady state — each ring is exactly
 * the single key this root has always built.
 *
 * Both handles are held by the boot ledger the moment they exist (DL7-F7), so a
 * stage that rejects mid-boot zeroes the previous key too — and the LOAD itself
 * runs under the ledger, because it can refuse between the two: a missing,
 * short or duplicate previous key file throws with the current key already
 * held, which is the residual A-I2 closes.
 */
const userKeks = boot.runSync("user-dek-kek", () => loadKekRing(environment.KEK_PATH, environment.KEK_PREVIOUS_PATH, (handle) => boot.holdKek(handle)));
const kek = userKeks.current;
const corpusKeks = environment.PUBLICATION_ENABLED === "true"
  ? boot.runSync("corpus-kek", () => loadKekRing(environment.CORPUS_KEK_PATH!, environment.CORPUS_KEK_PREVIOUS_PATH, (handle) => boot.holdKek(handle)))
  : undefined;
const corpusKek = corpusKeks?.current;
const blindIndexKey = loadSecretKey(environment.BLIND_INDEX_KEY_PATH);
const sourceIpSalt = loadSecretKey(environment.AUDIT_SOURCE_IP_SALT_PATH);
// DL7-F7: two plain secret buffers, held the moment they exist. Each has an
// owner LATER in the boot — the salt is zeroed once the hasher has copied it,
// the blind-index key once the session service holds it — and every stage in
// between can reject. Zeroing twice is harmless; not zeroing once is the
// finding.
boot.hold({ end: async () => { blindIndexKey.fill(0); } });
boot.hold({ end: async () => { sourceIpSalt.fill(0); } });
// Paid plans L1 (spec §2.3.1): the records key. Loaded under the ledger AFTER the two plain
// secrets are held, so a missing or mis-permissioned file zeroes the KEKs, the blind-index key
// and the audit salt already held; it lives for the whole process (the acceptance writer and,
// later, the billing profile use it) and is zeroed by the startup owner.
const recordsKey = boot.runSync("records-key", () => loadSecretKey(environment.RECORDS_KEY_PATH));
boot.hold({ end: async () => { recordsKey.fill(0); } });
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
  // V-3 (fix round 1): a changeover's previous keys are this process's key
  // material too, so they join the same pairwise domain check.
  previousKeks: [
    ...(userKeks.previous === undefined
      ? [] : [{ handle: userKeks.previous, path: environment.KEK_PREVIOUS_PATH! }]),
    ...(corpusKeks?.previous === undefined
      ? [] : [{ handle: corpusKeks.previous, path: environment.CORPUS_KEK_PREVIOUS_PATH! }])
  ],
  additionalSecrets: [
    { path: environment.BLIND_INDEX_KEY_PATH, material: blindIndexKey },
    { path: environment.AUDIT_SOURCE_IP_SALT_PATH, material: sourceIpSalt },
    { path: environment.RECORDS_KEY_PATH, material: recordsKey }
  ],
  // Paid plans: the billing custody files are text, not 32-byte keys, so they cannot be pairwise compared
  // as key material — but they are refused here if they alias any key, store or each other by path or inode.
  additionalStorePaths: [environment.AUDIT_KEY_STORE_PATH, ...billingCustodyPaths(environment),
    ...(environment.DATA_EXPORT_STORE_PATH === undefined ? [] : [environment.DATA_EXPORT_STORE_PATH])]
}));
const pool = boot.hold(createPool(environment.DATABASE_URL, API_DATABASE_POOLS.runtime));
const authorizationPool = boot.hold(createPool(environment.AUTHORIZATION_DATABASE_URL!, API_DATABASE_POOLS.authorization));
const publicationCleanupPool = environment.PUBLICATION_ENABLED === "true"
  ? boot.hold(createPool(environment.PUBLICATION_CLEANUP_DATABASE_URL!, API_DATABASE_POOLS.publicationCleanup)) : pool;
// Cleanup remains necessary when new encrypted writes are disabled: an intent
// left by an earlier enabled process must not abort every erasure cycle under
// the ordinary runtime principal.
const contentProvisionPool = boot.hold(createPool(environment.CONTENT_PROVISION_DATABASE_URL, API_DATABASE_POOLS.contentProvision));
// Ask admission holds a session advisory lock while the count-changing run
// commit uses that same backend. Keep both principal paths on explicit pool
// instances so lock waiters cannot consume ordinary runtime/provision capacity.
const serverAskAdmissionPool=boot.hold(createPool(environment.CONTENT_PROVISION_DATABASE_URL, API_DATABASE_POOLS.serverAskAdmission));
const legacyAskAdmissionPool=boot.hold(createPool(environment.DATABASE_URL, API_DATABASE_POOLS.legacyAskAdmission));
// Budget spec §2.6 (B6b): the room decision holds the site's day lock while the
// run is created, so its transaction takes a connection from a pool of its own —
// a decision waiting for the lock must never hold a connection the decision it
// waits for needs (packages/budget/src/spend-lock.ts). The runtime principal's
// URL on purpose: the hold, the wait row and the run's charge scope are
// debateai_runtime's grants (0083, 0084), never the content-provision role's.
const roomDecisionPool=boot.hold(createPool(environment.DATABASE_URL, API_DATABASE_POOLS.roomDecision));
await boot.run("ask-admission-pools", async () => {
  if (serverAskAdmissionPool === contentProvisionPool
    || serverAskAdmissionPool === pool
    || legacyAskAdmissionPool === pool
    || legacyAskAdmissionPool === contentProvisionPool
    || legacyAskAdmissionPool === serverAskAdmissionPool) {
    throw new TypeError("ASK_ADMISSION_DATABASE_POOLS_MUST_BE_SEPARATE");
  }
});
const erasurePool = boot.hold(createPool(environment.ERASURE_DATABASE_URL, API_DATABASE_POOLS.erasure));
const dataExportPool = environment.DATA_EXPORT_STORE_PATH === undefined ? undefined : boot.hold(createPool(environment.DATA_EXPORT_DATABASE_URL!, API_DATABASE_POOLS.dataExport));
// Side-by-side spec §4, §6 (plan C3): which release is current, read every second (debateai_runtime holds EXECUTE on
// 0123's readers). With no release recorded a local API is current, as before; a hosted one is not.
// Held from here so a failed boot stops it; started before the boot's first background pass; stopped first at close.
// Final fix wave P1: on a pool of its own (the runtime principal's URL), so a burst of page reads queued on the runtime
// pool never holds its read past the 5 s stale bound (/readyz DATABASE_UNREACHABLE, the front pair marked down).
const releaseWatchPool = boot.hold(createPool(environment.DATABASE_URL, API_DATABASE_POOLS.releaseWatch));
const releaseWatcher = new ReleaseWatcher({
  releaseKey: environment.RELEASE_KEY,
  hosted: environment.DEPLOYMENT_MODE === "hosted",
  reader: new PostgresReleaseStateReader(releaseWatchPool)
});
boot.hold({ end: async () => { releaseWatcher.stop(); } });
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
  assertContentProvisionDatabaseRole(pool,serverAskAdmissionPool),
  ...(dataExportPool === undefined ? [] : [assertDataExportDatabaseRoles(authorizationPool, dataExportPool)])
]));
const authPolicy = await boot.run("auth-policy", () => readAuthPolicy(pool, environment.REGISTER_VERSION));
const mfaPolicy = await boot.run("mfa-policy", () => readMfaPolicy(pool, environment.REGISTER_VERSION));
const sessionPolicy = await boot.run("session-policy", () => readSessionPolicy(pool, environment.REGISTER_VERSION));
const passwordResetPolicy = await boot.run("password-reset-policy", () => readPasswordResetPolicy(pool, environment.REGISTER_VERSION));
const backupEmailPolicy = await boot.run("backup-email-policy", () => readBackupEmailPolicy(pool, environment.REGISTER_VERSION));
const mfaRecoveryPolicy = await boot.run("mfa-recovery-policy", () => readMfaRecoveryPolicy(pool, environment.REGISTER_VERSION));
const recoveryPolicy = await boot.run("recovery-policy", () => readRecoveryPolicy(pool, environment.REGISTER_VERSION));
const admissionPolicy = await boot.run("admission-policy", () => readAdmissionPolicy(pool, environment.REGISTER_VERSION));
/**
 * Paid plans G3a (amendment A14): the country gate runs only in hosted mode AND when the register
 * version in force publishes `countryPolicy` — one decision, countryPolicyInForce, which never reads
 * the row in local mode. The row is read under the ledger; the data files are opened
 * (GEOIP_PATHS_REQUIRED already guaranteed their paths in hosted mode) and held, so a missing file
 * refuses the boot with its own code and zeroes nothing it should not.
 */
const countryPolicy = await boot.run("country-policy", () => countryPolicyInForce(
  environment.DEPLOYMENT_MODE,
  () => readCountryPolicy(pool, environment.REGISTER_VERSION)
));
await boot.run("country-gate-admission", async () => {
  if (countryPolicy !== null && admissionPolicy.geoAvailability === null) {
    throw new TypedDomainError("GEO_AVAILABILITY_ADMISSION_UNSEALED",
      "A hosted register with countryPolicy must also seal the geoAvailability admission scope");
  }
});
const geoLookup = countryPolicy === null ? undefined : boot.runSync("geo-lookup", () => openGeoLookup({
  countryDbPath: environment.GEOIP_COUNTRY_DB_PATH!,
  torListPath: environment.TOR_EXIT_LIST_PATH!,
  onReloadFailure: (code) => console.error(JSON.stringify({ event: "geo.reload.failed", code }))
}));
if (geoLookup !== undefined) boot.hold({ end: async () => { geoLookup.close(); } });
/**
 * TASK 11 AMENDMENT (V-28, from task 8's review). The support chat's three
 * admission budgets are OPTIONAL members of the row, so a host pinned to an
 * older `REGISTER_VERSION` runs unmetered support reads and an unshared model
 * cap and says nothing. Hosted refuses; local keeps today's fail-open path.
 *
 * It is taken HERE and not beside `assertHostedCostEnvelopesSealed` at the top
 * of this file, because the question is about the row IN FORCE at this
 * deployment's register version — which needs the pool that only exists by now.
 * It is still the earliest moment the question can be asked.
 */
await boot.run("support-admission-scopes", async () => {
  assertHostedSupportAdmissionSealed(environment.DEPLOYMENT_MODE, admissionPolicy);
});
/**
 * V-28(2) and side-by-side spec §13: the SITE's money row — the application-wide daily ceiling and the band, which
 * follow the release, not the debate. In local mode there is no money to bound and nothing is read. The per-run half,
 * the story's reserve and the daily guard over them are each settings version's own: the admission loader composes
 * them over this row ("cost-envelope-policy", ./admission-settings.ts).
 */
const siteCostEnvelopePolicy = environment.DEPLOYMENT_MODE === "hosted"
  ? await boot.run("site-cost-envelope-policy", () => readCostEnvelopePolicy(pool, environment.REGISTER_VERSION))
  : null;
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
const countryGate = countryPolicy === null || geoLookup === undefined ? undefined : new CountryGate({
  policy: countryPolicy,
  lookup: geoLookup,
  audit: identityRepository,
  onAuditFailure: (code) => console.error(JSON.stringify({ event: "api.country_gate.audit_failed", code }))
});
sourceIpSalt.fill(0);
const hatchet = new Hatchet({
  token: environment.HATCHET_CLIENT_TOKEN, host_port: environment.HATCHET_HOST_PORT,
  api_url: environment.HATCHET_API_URL, tenant_id: environment.HATCHET_TENANT_ID,
  tls_config: { tls_strategy: environment.HATCHET_TLS_STRATEGY }
});
// Side-by-side spec §2, §4 (plan C task C4): every send goes to the run's OWN release's task, read per send; a release
// that no longer serves the run is never sent to (its never-claimed job closed FAILED, its waiver written, one owner
// line per key per half hour). recordSetupFailure is not fenced by release, so the default repository can close it.
const dispatcher = new ReleaseRoutedDispatcher({
  client: hatchet,
  workflowName: environment.HATCHET_WORKFLOW_NAME,
  hosted: environment.DEPLOYMENT_MODE === "hosted",
  lookup: new PostgresRunReleaseLookup(pool),
  work: new WorkItemRepository(pool),
  waive: async (runId) => { await recordSpendWaiver(pool, runId, "RELEASE_NOT_SERVED"); },
  alert: createReleaseNotServedAlert()
});
const deploymentMakers = await boot.run("deployment-makers", () => readDeploymentMakerCapability(pool, environment.REGISTER_VERSION));
const discoveryPolicy = await boot.run("discovery-policy", () => readPanelDiscoveryPolicy(pool, environment.REGISTER_VERSION));
/**
 * DL7-F7 (fix wave A-I2): a SYNCHRONOUS decision answers to the boot ledger
 * like every awaited one. A hosted first boot whose vendor credential file is
 * mis-permissioned refuses here — `PROVIDER_AUTHORIZATION_FILE_UNUSABLE` —
 * and used to end the process by top-level throw with three KEKs, the
 * blind-index key and the audit salt live in memory and no `api.boot.failed`
 * line. `boot.runSync` closes the ledger newest-first and names the stage.
 */
const providerTargetsJson = boot.runSync("provider-discovery-targets", () => {
  if (environment.PROVIDER_DISCOVERY_TARGETS_JSON === undefined) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGETS_REQUIRED");
  }
  return environment.PROVIDER_DISCOVERY_TARGETS_JSON;
});
const probes = new ProviderProbeRepository(pool);
const declaredProviderTargets = boot.runSync("provider-targets", () => {
  const declared = parseProviderDiscoveryTargets(
    providerTargetsJson, deploymentMakers.configuredProviders
  );
  // V-9(c): the same mode decision the runner takes, over the same target set,
  // and taken on the DECLARED targets — before any credential file is resolved.
  assertDeploymentProviderTargets(declared, {
    mode: environment.DEPLOYMENT_MODE, nodeEnv: environment.NODE_ENV
  });
  // V-28: and a hosted DEBATE target must carry its price, or its calls cannot
  // be billed against the per-run and daily envelopes. Separate from the rule
  // above because the support chat's target shares that one and keeps its own
  // accounting.
  assertPricedProviderTargets(declared, environment.DEPLOYMENT_MODE);
  return declared;
});
// Side-by-side spec §13, addition D24 (owner 2026-10-22: providers only, not the models, listed automatically): the
// companies these declared targets reach, once, for GET /v1/public/ai-providers (the "AI providers" legal page).
const aiProviderCompanies = providerCompaniesOfTargets(declaredProviderTargets);
// Addition D16: the guarded fetch reaches the gates through the env's gate part (one per process); each settings
// version's rosters, roles and gate terms are the admission loader's (its stages "preview-line-up",
// "preview-scorecard-conflict" and "preview-budget-gate").
const previewFetch = previewGate === undefined ? undefined : createPreviewGuardedFetch(createPreviewBudgetRpcPorts(previewGate));
/**
 * Budget spec 2026-09-28 §2.4–§2.7 and the paid-plans spec §2.4 (B6b): THE ROOM's boot questions and its site parts.
 * Hosted, and only once the site's costEnvelopePolicy row carries the band; without it the API answers exactly as
 * today (the daily guard's 429 and its 30-minute reservation). B4a's one readiness check comes first (R-5): billing
 * switched on without a billingPlans row, or without the band, refuses this boot by name (BILLING_PLANS_UNRESOLVED /
 * BILLING_REQUIRES_ENVELOPE_MEMBERS, A22); it answers the plans when billing is on and null when it is off. Billing on
 * supplies each person's windows and pins every started run to its person (R-19); billing off leaves the room the
 * site's day alone and writes no charge scope. A version WITHOUT the band builds no room and no waker, so a run already
 * waiting would never start: that boot is refused (WAITING_LINE_REQUIRES_BAND) while the line lists any run — publish
 * such a version only once the line is empty. Side-by-side spec §13: asked BEFORE the admission loader, because billing
 * on or off is a site member the loader's picker and run-ceiling stages read; the room itself is built after it, over
 * the site version's estimator ("ask-room-composition").
 */
const askRoomReadiness = environment.DEPLOYMENT_MODE === "hosted" && siteCostEnvelopePolicy !== null
  ? await boot.run("ask-room", async () => {
      const billingPlans = assertBillingReady({
        policy: await readBillingPolicy(pool, environment.REGISTER_VERSION),
        plans: await readBillingPlans(pool, environment.REGISTER_VERSION),
        envelope: siteCostEnvelopePolicy
      });
      const band = costEnvelopeBand(siteCostEnvelopePolicy);
      if (band === null) {
        const stranded = await new RunWaitRepository(pool).countWaiting();
        if (stranded > 0) {
          throw new TypedDomainError(
            "WAITING_LINE_REQUIRES_BAND",
            "Questions are waiting in line, and a register version without the band has no waker to start them"
          );
        }
        return undefined;
      }
      // Paid plans P4-G, ruling C7 (go-live row 31): with the band the room read is a real computation on
      // every call, so the version in force must seal its askRoomReads budget (ASK_ROOM_ADMISSION_UNSEALED).
      // The hosted publish asks the same question in its plan and in verifyHostedRegisterBootReadiness.
      assertAskRoomAdmissionSealed({ envelope: siteCostEnvelopePolicy, admission: admissionPolicy });
      const spend = new PostgresModelSpendStore(pool);
      const entitlements = billingPlans === null ? null : new EntitlementRepository(pool);
      // Side-by-side spec §9 (C17), the runner's rule (B14): no funding read and no funding refusal at boot. The selection
      // is shared by every live release and moved by the newest; a grant is checked against the policy of the version it
      // was issued with, never the pointer, and a new ask reads the pointer only to know whether funding is switched on.
      // So a selection made by another release (another version or content, switched on or off) needs no restart here.
      // The team's funding tools are the staff runtime's (createStaffRuntime: one api.funding.selection_differs line).
      const fundedAllowance = entitlements === null || billingPlans === null ? undefined
        : new FundingAwarePersonAllowanceSource({allowances:new PostgresInternalAllowanceRepository(pool),entitlements,plans:billingPlans,closeBasisPoints:band.closeBasisPoints});
      // Since C17 the `?? new BillingPersonAllowanceSource(...)` fallback is unreachable (billing on → always
      // funding-aware); kept until its wiring pins are retired with it.
      const personAllowance = entitlements === null || billingPlans === null
        ? NO_PERSON_ALLOWANCE
        : fundedAllowance ?? new BillingPersonAllowanceSource({ entitlements, plans: billingPlans, closeBasisPoints: band.closeBasisPoints });
      return Object.freeze({ runPolicy: siteCostEnvelopePolicy, band, spend, entitlements, fundedAllowance, personAllowance, billingPlans });
    })
  : undefined;
// Paid plans S2/S4b: billing is on exactly when the room's readiness answer carries the plans (a site member the
// admission loader's picker and run-ceiling stages read).
const billingEnabled = (askRoomReadiness?.billingPlans ?? null) !== null;
// V-30(1): the support chat's model is configuration, on the SAME mode decision
// the debate targets take above. Hosted refuses a relay target here exactly as
// it refuses one there; local keeps today's relay path. Parsed HERE, above the
// admission loader, whose question-language stage's hosted fast check borrows this target's key
// (P2L Task 19, pre-flight PF-L36); the support chat below receives this same target.
const supportModelTarget = boot.runSync("support-model-target", () =>
  (environment.SUPPORT_MODEL_TARGET_JSON === undefined
    ? undefined
    : parseSupportModelTargetJson(environment.SUPPORT_MODEL_TARGET_JSON,{
      mode: environment.DEPLOYMENT_MODE,nodeEnv: environment.NODE_ENV
    })));
// Task 19 fix round 2 (Minor 6): the support target's key file is read ONCE at boot, through the same custody loader,
// by whichever reader comes first (the hosted question-language route, else the support adapter); the other gets the
// same value. Both readers are at boot, so the adapter sees exactly what it read before. Cleared once the support
// adapter is built, so this process keeps no copy beyond the adapter's own.
const supportCredentialReads = new Map<string,string>();
const readSupportCredentialOnce = (path: string): string => {
  const known = supportCredentialReads.get(path);
  if (known !== undefined) return known;
  const value = readCustodyAuthorizationHeader(path);
  supportCredentialReads.set(path, value);
  return value;
};
/**
 * Side-by-side spec §13 (settings changes without an upload), API points 1-3 — THE SITE CONTEXT of the one per-version
 * admission loader (./admission-settings.ts): what follows this release, not a debate (the mode, the declared targets
 * and their prices, the preview's gate part and the env's line-up, the site's money row and band, billing, the stores,
 * the question-language route and its reference key). Read once, here; every version is loaded over it.
 */
const admissionSite: AdmissionSiteContext = boot.runSync("admission-site", () => Object.freeze({
  siteVersion: environment.REGISTER_VERSION,
  deploymentMode: environment.DEPLOYMENT_MODE,
  preview: previewGate === undefined ? undefined : { gate: previewGate, envLineUp: environment.PREVIEW_ENV_LINE_UP ?? null },
  declaredProviderTargets,
  siteCostEnvelope: siteCostEnvelopePolicy === null ? null
    : { runPolicy: siteCostEnvelopePolicy, band: costEnvelopeBand(siteCostEnvelopePolicy) },
  billingEnabled,
  // V-28(2): the daily guard's store only without the room (hosted); with it the room decides instead, never both.
  spend: siteCostEnvelopePolicy === null || askRoomReadiness !== undefined ? null : new PostgresModelSpendStore(pool),
  recentRunUsage: askRoomReadiness === undefined ? null : new PostgresRecentRunUsageSource(pool),
  prices: buildApiProviderPriceMap(declaredProviderTargets, environment.DEPLOYMENT_MODE),
  questionLanguage: Object.freeze({
    /**
     * Question language (spec 2026-10-13), Task 19: with no preview configured the hosted side decides. It probes for
     * 0118's one writer (absent = the fast check stays off, HOSTED_BEFORE_SPEND_RECORD: never spend unrecorded) and reads
     * the support target's Anthropic key once, through the same custody loader the support chat uses. Each check is then
     * one run-less site cost in the day's pot, never the person's; a failed record is one code-only line. Ruling L-ROUTE:
     * a configured preview is PREVIEW (the guarded fetch with the Anthropic gate socket) or NONE, never HOSTED (no
     * onUsage there: the gate settles preview money).
     */
    routeFor: async ({ policy, dayCeilingMicros }: Readonly<{ policy: QuestionLanguagePolicy | null; dayCeilingMicros: number | null }>) => {
      const hostedRoute = previewGate !== undefined ? undefined : await hostedQuestionLanguageRoute({
        mode: environment.DEPLOYMENT_MODE,
        fastCheck: (policy ?? questionLanguagePolicyStartValues()).fastCheck,
        readCredential: () => supportAnthropicMessagesKey(supportModelTarget, readSupportCredentialOnce),
        spend: {
          writerPresent: () => languageCheckSpendWriterPresent(pool),
          record: (entry) => recordLanguageCheckSpend(pool, entry)
        },
        // Ruling L-POT: the day ceiling the ask admission uses (costEnvelopeGuardPolicy), against the day's whole site pot.
        dayPot: dayCeilingMicros === null ? null : {
          ceilingMicros: dayCeilingMicros,
          spentMicros: (day) => new PostgresModelSpendStore(pool).readDaySpentMicros(day)
        },
        clock: () => new Date(),
        report: (line) => console.error(JSON.stringify(line))
      });
      return questionLanguageRouteFor({
        previewConfigured: previewGate !== undefined,
        previewFetch,
        anthropicSocket: previewGate === undefined ? undefined : previewProviderSocket(previewGate, "anthropic"),
        hosted: () => {
          if (hostedRoute === undefined) throw new TypeError("QUESTION_LANGUAGE_HOSTED_ROUTE_ON_PREVIEW");
          return hostedRoute;
        }
      });
    },
    // CR-5: one key for every API process of this deployment, derived from the blind-index key loaded above.
    referenceKey: questionLanguageReferenceKeyFrom(blindIndexKey)
  }),
  log: (line: string) => console.error(line)
}));
/**
 * Side-by-side spec §13 — THE SITE VERSION, LOADED. Every admission read of this boot that belongs to a settings
 * version (the per-run money and the story's reserve with the daily guard and the room's estimator, the structural and
 * formula inputs, the preview's line-up and gate terms, the token ceilings, the debate shape, the length guidance, the
 * engine, the question language, the model scorecard and picker, the run ceiling against one call, the risk tier and
 * the role rotation) is made by `loadAdmissionSettings`, for REGISTER_VERSION, in one block under the boot ledger, with
 * main.ts's own stage names; a refusal names its stage and refuses the boot with the loader's own typed code, as before.
 */
const siteAdmission = await loadAdmissionSettings(pool, environment.REGISTER_VERSION, admissionSite, (name, run) => boot.run(name, async () => run()));
// Side-by-side spec §13 API point 2: every other version is loaded once, on first use, and kept (sealed versions never
// change); the site version is served from the boot's load.
const admissionCache = createAdmissionSettingsCache({
  load: (version) => loadAdmissionSettings(pool, version, admissionSite),
  seed: siteAdmission
});
/**
 * Side-by-side spec §13 API point 1, plan D1 and D8: the activation pointer's one runtime reader (at most one read a
 * second, on this main pool; empty = the site version). Read once at boot, so a login that cannot call the reader
 * refuses the boot. The pointer's version itself is NOT loaded here: an API boots before its switch, while the pointer
 * may name the other release's version, which this release may not have passed; asks reach this API only once it is
 * current, and the switch guarantees the current release passed the active version.
 */
const activeSettings = createActiveSettingsVersionReader({
  pool, siteVersion: environment.REGISTER_VERSION, log: (line) => { console.error(JSON.stringify(line)); }
});
await boot.run("active-settings-version", () => activeSettings.current());
// V-9(2): the ask-time health probe needs the same credential the runner uses, so it resolves each vendor's file
// through the same custody-checked seam. Side-by-side spec §13: only once the site version has loaded, so a version the
// boot refuses (a VALID scorecard under the preview's roster, a line-up the env contradicts) refuses before any
// credential file is read, as before the loader (the runner's order too).
const providerDiscoveryTargets = boot.runSync("provider-credentials", () =>
  resolveProviderTargetCredentials(declaredProviderTargets, readCustodyAuthorizationHeader));
const resolveProviderPanel = createProviderDiscoveryResolver({
  configuredProviders: deploymentMakers.configuredProviders,
  targets: providerDiscoveryTargets,
  probes,
  probeFreshnessMs: discoveryPolicy.probeFreshnessMs,
  probeTimeoutMs: previewGate === undefined ? environment.PROVIDER_PROBE_TIMEOUT_MS : PREVIEW_GLM_DEADLINE_MS,
  // Spec 2026-10-11 busy model §1-§3 and §3a: on the preview, one probe per model and no resend at ask
  // time; the round's busy models (an unbilled refusal) may sit out an ask (evaluateAskAdmission).
  ...(previewGate === undefined ? {} : { probeControlsFor: previewProbeControls, fetchImplementation: previewFetch!, previewRound: true })
});
// B6b: THE ROOM, over the readiness answer above and the site version's estimator (each version's own estimator is
// its cap: `estimatorFor`).
const askRoomComposition = askRoomReadiness === undefined ? undefined : boot.runSync("ask-room-composition", () => {
  const { runPolicy, band, spend, entitlements, fundedAllowance, personAllowance, billingPlans } = askRoomReadiness;
  const estimator = siteAdmission.estimator;
  if (estimator === null) throw new TypeError("ASK_ROOM_ESTIMATOR_REQUIRED");
  const room = new AskRoom({
    lockPool: roomDecisionPool,
    spend,
    line: new RunWaitRepository(pool),
    estimator,
    estimatorFor: async (version) => (await admissionCache.admissionSettingsFor(version)).estimator!,
    personAllowance,
    entitlements,
    billingPlans,
    ...(fundedAllowance === undefined ? {} : {funding:fundedAllowance}),
    dailyCeilingMicros: runPolicy.dailyCeilingMicros,
    closeBasisPoints: band.closeBasisPoints,
    waitingLinePerPerson: band.waitingLinePerPerson,
    // Side-by-side spec §9, §13 (plan C8): at most SITE_CONCURRENT_DEBATES debates across releases, and an ask
    // admitted while this release is not current waits in line; both read inside the room's spend-decision lock.
    // Side-by-side spec §13 (C14, Task S13): with the site version, the gate reads the activation pointer on a waiting
    // debate's START transaction (this pool's login is the API's runtime login, which may: D8).
    gate: new PostgresAskAdmissionGate({
      releaseKey: environment.RELEASE_KEY, hosted: environment.DEPLOYMENT_MODE === "hosted", siteVersion: environment.REGISTER_VERSION
    })
  });
  // B7a (the usage read) and B8 (the server-decided ask and its coarse fit)
  // reuse these same instances and this one readiness answer.
  return Object.freeze({ room, spend, estimator, entitlements, personAllowance, billingPlans });
});
const askRoom = askRoomComposition?.room;
// Side-by-side final fix wave P7: hosted without the room, the site's cap of 8 debates and the SWITCHING hold (both read
// in the room's decision) do not hold. One content-free boot line on stderr; never a refusal.
const noSiteCapLine = siteCapBootLine({
  hosted: environment.DEPLOYMENT_MODE === "hosted", roomComposed: askRoom !== undefined
});
if (noSiteCapLine !== null) console.warn(noSiteCapLine);
/**
 * Paid plans (spec 2026-09-29 §2.3.4, §2.6 item 7; R1 A5; rulings R-5, R-28):
 * the server decides the ask ONLY when the room's composition carries billing —
 * hosted, the band published, and a billingPolicy saying enabled: true with its
 * plans (B6b's `ask-room` step asked `assertBillingReady`). The coarse fit reads
 * the room's own person windows, spend store and estimator.
 */
// Since C17 the `instanceof FundingAwarePersonAllowanceSource` guard below is always true when billing is on (billing on →
// always funding-aware); its false branch is unreachable, kept for now.
const askBilling: AskBilling | undefined = askRoomComposition === undefined
  || askRoomComposition.entitlements === null || askRoomComposition.billingPlans === null
  ? undefined
  : Object.freeze({
      plans: askRoomComposition.billingPlans,
      ...(askRoomComposition.personAllowance instanceof FundingAwarePersonAllowanceSource ? {funding:askRoomComposition.personAllowance} : {}),
      entitlements: askRoomComposition.entitlements,
      coarseFit: Object.freeze({
        personAllowance: askRoomComposition.personAllowance,
        spend: askRoomComposition.spend,
        estimator: askRoomComposition.estimator,
        // Side-by-side spec §13: the room's per-version estimator (S10 asks it for an ask admitted on another version).
        estimatorFor: async (version: number) => (await admissionCache.admissionSettingsFor(version)).estimator!
      }),
      clock: () => new Date()
    });
/**
 * Paid plans (spec 2026-09-29 §2.2 rule 1, §2.11; amendments R1 A22/A23; rulings R-5, R-7). Billing exists only
 * when this is the hosted site AND the billingPolicy row in force says enabled; local mode never reads the row.
 * Billing on must pass B4a's one readiness question (plans row + the three budget members), and only then is the
 * billing group of the environment validated, by name (BILLING_CONFIGURATION_INCOMPLETE:<KEY>), and SmartBill's
 * code built from the legal notice's facts before any secret is read (BILLING_COMPANY_FACTS_UNVERIFIED:cui while the
 * CUI is still bracketed, and :vat in SMARTBILL_CIF_FORM's "ro" form while the RO VAT code is; RULINGS-R3 R3-4), and
 * the facts every email prints checked the same way (:legalName, :registeredOffice, :emails.general; P2-M35).
 */
const billingPolicy: BillingPolicy | null = environment.DEPLOYMENT_MODE === "hosted"
  ? await boot.run("billing-policy", () => readBillingPolicy(pool, environment.REGISTER_VERSION))
  : null;
if (billingPolicy?.enabled === true) {
  await boot.run("billing-readiness", async () => {
    assertBillingReady({
      policy: billingPolicy,
      plans: await readBillingPlans(pool, environment.REGISTER_VERSION),
      envelope: await readCostEnvelopePolicy(pool, environment.REGISTER_VERSION)
    });
  });
}
/**
 * NETOPIA (spec 2026-10-05 §2.7.3, ruling C-9): which billing exists. ON is the whole of it; PROVIDER_ONLY (hosted,
 * billing off, NETOPIA's four settings all set) builds the NETOPIA connector alone, over which N9 serves NETOPIA's
 * message for the owner's test tool's orders; OFF builds nothing. A NETOPIA group set only in part, with billing off,
 * is one content-free line naming the first missing key, never its value.
 */
const billingMode: BillingMode = billingModeOf({
  hosted: environment.DEPLOYMENT_MODE === "hosted", billingEnabled: billingPolicy?.enabled === true, environment
});
const billingConnectors: BillingConnectors | null = billingMode === "ON"
  ? boot.runSync("billing-connectors", () => loadBillingConnectors({
      environment: readBillingEnvironmentGroup(environment),
      // RULINGS-R3 R3-4: SmartBill's CIF is built from the legal notice's facts (COMPANY, mirrored), never a setting.
      company: SELLER_COMPANY,
      recordsKey
    }))
  : null;
const providerOnlyConnectors: NetopiaConnectors | null = billingMode === "PROVIDER_ONLY"
  ? boot.runSync("billing-netopia-connectors", () => {
      assertProviderOnlyNotifySealed(admissionPolicy);
      return loadNetopiaConnectors({ environment: readNetopiaEnvironmentGroup(environment), recordsKey });
    })
  : null;
if (environment.DEPLOYMENT_MODE === "hosted" && billingMode === "OFF") {
  const missing = incompleteNetopiaKey(environment);
  if (missing !== null) console.error(JSON.stringify({ event: "billing.provider_only.incomplete", missing }));
}
/**
 * B3a (NETOPIA answers 2026-10-21): NETOPIA sends the saved card only in its first message about a payment, so a
 * verified message the database could not take is kept, sealed under the records key, in BILLING_NOTICE_SPOOL_PATH's
 * folder and replayed at the start and every 10 minutes. Optional (absent: one `billing.notice.spool_off` line once
 * the API listens, and such a message is only answered 503, as before); set, it must be an existing folder this
 * process can write, or the API refuses to start (BILLING_NOTICE_SPOOL_PATH_INVALID).
 */
const billingNoticeSpool = environment.BILLING_NOTICE_SPOOL_PATH === undefined
  ? undefined
  : boot.runSync("billing-notice-spool", () => new NoticeSpool({
      directory: assertNoticeSpoolDirectory(environment.BILLING_NOTICE_SPOOL_PATH!), recordsKey
    }));
/**
 * N9 (spec 2026-10-05 §2.7.3, ruling C-9): in the provider-only mode NETOPIA's message is the one billing route served.
 * The intake keeps the owner's test-tool orders' cards; every other verified message is stored as BILLING_OFF, with no
 * card, no job and no email. Nothing drains an outbox here, so the kick does nothing.
 */
const providerOnlyIntake = providerOnlyConnectors === null ? undefined : new NetopiaNoticeIntake({
  repository: new BillingRepository(pool), jobs: new BillingJobQueries(pool), trust: providerOnlyConnectors.noticeTrust,
  recordsKey: providerOnlyConnectors.recordsKey, paymentEnvironment: providerOnlyConnectors.paymentEnvironment,
  mode: "PROVIDER_ONLY", audit: consoleBillingAudit, kick: () => undefined,
  ...(billingNoticeSpool === undefined ? {} : { spool: billingNoticeSpool })
});
/**
 * F7 (final review data-1): the intake above keeps the owner's test-tool cards and every message's raw bytes, so the
 * provider-only mode runs the daily owner job's card steps alone (the tool cards revoked once a day old and purged a
 * day later, raw messages and the quarantine purged after 14 days), started with the API like the billing runtime.
 */
const providerOnlyJobs = providerOnlyConnectors === null ? undefined : createProviderOnlyJobs({
  pool, paymentEnvironment: providerOnlyConnectors.paymentEnvironment,
  publicAppUrl: providerOnlyConnectors.publicAppUrl, audit: consoleBillingAudit, clock: () => new Date(),
  reportPending: (code) => console.error(`[${code}]`),
  // B3a: the spool's replay every 10 minutes, as the billing runtime's.
  ...(billingNoticeSpool === undefined || providerOnlyIntake === undefined ? {} : { notices: providerOnlyIntake })
});
// A live boot refuses while rows of another payment system (NETOPIA's sandbox, or the previous card processor) are
// open: the live renewal pass never renews them, so they would stay ACTIVE for ever. The runbook's switch-on step
// closes them first.
if (billingConnectors?.paymentEnvironment === "live") {
  await boot.run("billing-other-system-records", async () => {
    assertOtherSystemRecordsClosed(await new BillingRepository(pool).openOtherSystemRecordCounts({
      paymentProvider: "netopia", paymentEnvironment: "live"
    }));
  });
  // W14 (P2-I19): nor while billing rows or open jobs are dated more than a day ahead (a moved sandbox clock's leftovers).
  await boot.run("billing-records-dated-ahead", async () => {
    assertNoRecordsDatedAhead(await new BillingRepository(pool).recordsDatedAhead(new Date()));
  });
}
// F7 (final review data-2): the reverse direction, which the runbook never takes: a sandbox boot refuses while live
// NETOPIA plans are open, so a sandbox API never runs over live customers' plans and cards.
if (billingConnectors?.paymentEnvironment === "sandbox") {
  await boot.run("billing-live-records-on-sandbox", async () => {
    assertOtherSystemRecordsClosed({
      subscriptions: await new BillingRepository(pool).openNetopiaSubscriptionCount("live"), charges: 0, jobs: 0
    });
  });
}
// V-3: over the RING, so a record still wrapped by the previous key opens for
// the length of a changeover. Writes stay under the current key. Under the
// ledger (A-I2) because the construction refuses a store path that is not one
// and a ring whose two keys are the same key.
const dekStore = boot.runSync("user-dek-store", () =>
  new FileUserDekStore(environment.USER_DEK_STORE_PATH, userKeks));
const authenticationRiskSignals = new PostgresAuthenticationRiskSignalRepository(
  pool,auditContextHasher,dekStore,recoveryPolicy.riskSignals.rawSignalRetentionMs,
  recoveryPolicy.riskSignals.maximumEvaluatorSignals
);
const consumerRecoveryPolicy=await boot.run("consumer-recovery-policy",()=>readConsumerRecoveryPolicy(pool,environment.REGISTER_VERSION));
const recovery = new RecoveryStartService({
  consumerPrepare:(input,source)=>consumerRecovery.prepareStart(input,source),
  mailDispatch:{dispatchRecoveryMail:prepare=>registration.dispatchRecoveryMail(prepare)},
  repository: new PostgresRecoveryStartRepository(pool,auditContextHasher,dekStore),
  riskSignals:authenticationRiskSignals,
  onRiskSignalFailure:(error)=>console.error(
    "[RECOVERY_RISK_SIGNAL_PENDING]",riskSignalFailureIdentity(error)
  ),
  blindIndexKey,
  enumerationFloorMs: authPolicy.verification.enumerationResponseFloorMs,
  publicResponsePolicy: recoveryPolicy.publicResponse
});
const runKeyStore = boot.runSync("run-content-key-store", () =>
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
  ));
if (environment.CONTENT_ENCRYPTION_ENABLED === "true") {
  configureContentEncryption(pool, new ContentCipher(runKeyStore));
}
const socialProviders = (()=>{try{return new SocialProviders(socialConfigurations(environment.SOCIAL_PROVIDERS_JSON,environment.PUBLIC_APP_URL),environment.SOCIAL_SOCKET_PATH===undefined?undefined:new UnixSocialTransport(environment.SOCIAL_SOCKET_PATH));}catch{console.error('[SOCIAL_CONFIGURATION_INVALID]');return new SocialProviders([]);}})();
const socialRepository = new PostgresSocialIdentityRepository(authorizationPool,auditContextHasher,pool);
// Open sign-up mail (owner decision G5, 2026-10-09): the DNS question at the three entry points, 2 s, fail open.
// Ruling 2026-10-09: outside local mode the special-use endings (.test .example .invalid .localhost) are refused.
const mailDomainCheck = systemMailDomainCheck(environment.DEPLOYMENT_MODE);
const registration = new RegistrationService({
  repository: identityRepository,
  socialRepository,
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
  argon2: argon2Pool,
  // Paid plans L3b: the acceptance record's evidence is sealed under the records key (L1).
  legalAcceptance: { recordsKey },
  mailDomainCheck
});
// Paid plans L4: re-acceptance of the Terms and the Privacy Policy, over the acceptance record.
// Hosted: an account with no record owes both documents (it must accept before it can pay).
// Local: only a manifest floor makes a document owed, so local mode keeps today's behaviour
// (spec §2.2 rule 1, §2.3.2) until the owners move a floor.
const legal = new RepositoryLegalAcceptanceApplication({
  acceptances: new AcceptanceRepository(pool),
  recordsKey,
  owedWithoutRecord: environment.DEPLOYMENT_MODE === "hosted"
});
const sessions = await boot.run("session-service", () => SessionService.create({
  repository: new PostgresSessionRepository(authorizationPool, auditContextHasher),
  ...(environment.STAFF_ACCESS.policyVersion === 2 ? {staffPrerequisites: new PostgresStaffPrerequisiteProducer(pool, auditContextHasher)} : {}),
  riskSignals:authenticationRiskSignals,
  onRiskSignalFailure:(error)=>console.error(
    "[LOGIN_RISK_SIGNAL_PENDING]",riskSignalFailureIdentity(error)
  ),
  dekStore,
  argon2: argon2Pool,
  authPolicy,
  mfaPolicy,
  sessionPolicy,
  socialProviderBindings:async()=>(await socialProviders.available()).map(p=>p.configuration),
  blindIndexKey
}));
const socialAuth = new SocialAuthService(socialRepository,socialProviders,sessions.consumerProducer(),{registration,security:new PostgresConsumerSecurityRepository(authorizationPool,auditContextHasher),authPolicy,blindIndexKey});
const consumerAccountMail=new SendmailConsumerAccountSender({executable:environment.MAIL_SENDMAIL_PATH,from:environment.MAIL_FROM,timeoutMs:authPolicy.channel.transportTimeoutMs,publicAppUrl:environment.PUBLIC_APP_URL});
const consumerRecovery=new ConsumerRecoveryService(new PostgresConsumerRecoveryRepository(authorizationPool,auditContextHasher),sessions.consumerProducer(),{publicAppUrl:environment.PUBLIC_APP_URL,users:dekStore,argon2:argon2Pool,mfaPolicy,authPolicy,policy:consumerRecoveryPolicy,blindIndexKey,mail:consumerAccountMail,onMailFailure:()=>console.error('[CONSUMER_RECOVERY_MAIL_FAILED]')});
const onboardingEvidence=new OnboardingEvidenceService(new PostgresOnboardingEvidenceRepository(authorizationPool,auditContextHasher),sessions.consumerProducer(),recordsKey);
const consumerSecurityNotices=new ConsumerSecurityNoticeReconciler(new PostgresConsumerSecurityNoticeRepository(authorizationPool),dekStore,consumerAccountMail);
const passwordResetRepository=passwordResetPolicy?new PostgresPasswordResetRepository(pool,auditContextHasher,environment.REGISTER_VERSION):undefined;
if(passwordResetRepository)await boot.run("password-reset-role",()=>passwordResetRepository.assertRole());
const passwordReset=passwordResetRepository&&passwordResetPolicy?new PasswordResetService({repository:passwordResetRepository,users:dekStore,argon2:argon2Pool,authPolicy,mfaPolicy,passwordResetPolicy,blindIndexKey,reportDiagnostic:code=>console.error(`[${code}]`)}):undefined;
const passwordResetNotices=passwordResetRepository&&passwordResetPolicy?new PasswordResetNotificationWorker({repository:passwordResetRepository,users:dekStore,sender:new SendmailPasswordResetSender({executable:environment.MAIL_SENDMAIL_PATH,from:environment.MAIL_FROM,publicAppUrl:environment.PUBLIC_APP_URL,timeoutMs:authPolicy.channel.transportTimeoutMs}),authPolicy,passwordResetPolicy,dispatch:operation=>registration.dispatchRecoveryMail(operation),reportDiagnostic:code=>console.error(`[${code}]`)}):undefined;
const triggerPasswordResetReconciliation=passwordResetNotices?createSingleFlightErasureReconciler(()=>passwordResetNotices.reconcile(100),()=>console.error("[PASSWORD_RESET_RECONCILIATION_PENDING]")):undefined;
let passwordResetTimer:ReturnType<typeof setInterval>|undefined;
const backupEmailRepository=backupEmailPolicy?new PostgresBackupEmailRepository(pool,auditContextHasher,environment.REGISTER_VERSION):undefined;
const mfaRecoveryRepository=mfaRecoveryPolicy?new PostgresMfaRecoveryRepository(pool,auditContextHasher,environment.REGISTER_VERSION):undefined;
if(backupEmailRepository)await boot.run("backup-email-role",()=>backupEmailRepository.assertRole());
if(mfaRecoveryRepository)await boot.run("mfa-recovery-role",()=>mfaRecoveryRepository.assertRole());
const backupEmail=backupEmailRepository&&backupEmailPolicy?new BackupEmailService({repository:backupEmailRepository,users:dekStore,argon2:argon2Pool,authPolicy,mfaPolicy,policy:backupEmailPolicy}):undefined;
const mfaRecovery=mfaRecoveryRepository&&mfaRecoveryPolicy?new MfaRecoveryService({repository:mfaRecoveryRepository,users:dekStore,argon2:argon2Pool,authPolicy,mfaPolicy,policy:mfaRecoveryPolicy,blindIndexKey}):undefined;
const emailRecoverySender=new SendmailEmailRecoverySender({executable:environment.MAIL_SENDMAIL_PATH,from:environment.MAIL_FROM,publicAppUrl:environment.PUBLIC_APP_URL,timeoutMs:authPolicy.channel.transportTimeoutMs});
const emailRecoveryWorkers=[...(backupEmailRepository?[new EmailRecoveryNotificationWorker({flow:"backup_email",repository:backupEmailRepository,users:dekStore,sender:emailRecoverySender,authPolicy,dispatch:operation=>registration.dispatchRecoveryMail(operation),reportDiagnostic:code=>console.error(`[${code}]`)})]:[]),...(mfaRecoveryRepository?[new EmailRecoveryNotificationWorker({flow:"mfa_recovery",repository:mfaRecoveryRepository,users:dekStore,sender:emailRecoverySender,authPolicy,dispatch:operation=>registration.dispatchRecoveryMail(operation),reportDiagnostic:code=>console.error(`[${code}]`)})]:[])];
const triggerEmailRecoveryReconciliation=emailRecoveryWorkers.length?createSingleFlightErasureReconciler(async()=>{for(const worker of emailRecoveryWorkers)await worker.reconcile(100);},()=>console.error("[EMAIL_RECOVERY_RECONCILIATION_PENDING]")):undefined;
let emailRecoveryTimer:ReturnType<typeof setInterval>|undefined;

boot.hold({end:async()=>{await passwordResetNotices?.close();for(const worker of emailRecoveryWorkers)await worker.close();}});

const mfa = new MfaEnrollmentService({
  repository: identityRepository,
  consumerRepository: new PostgresConsumerAuthRepository(authorizationPool,auditContextHasher),
  sessions: sessions.consumerProducer(),
  dekStore,
  argon2: argon2Pool,
  policy: mfaPolicy
});
// Explicit v2 composition retains current-state checks and refuses unavailable operator readiness.
const staffAccess = environment.STAFF_ACCESS.policyVersion === 2
  ? new StaffAccessService(new PostgresStaffRepository(pool), sessions) : undefined;
// Explicit protected adapters, config custody, installation and policy are startup-only gates. A stale ACK
// proof or readiness publication never blocks boot: Team tools start locked (one api.staff.tools_locked line)
// and each staff action re-checks readiness, so an operator unlock needs no restart.
const staffAlerts = environment.STAFF_ACCESS.policyVersion === 2
  ? await boot.run("staff-activation", () => createStaffRuntime({environment:environment.STAFF_ACCESS as Extract<typeof environment.STAFF_ACCESS,{policyVersion:2}>,registerVersion:environment.REGISTER_VERSION,publicAppUrl:environment.PUBLIC_APP_URL,pool,keys:dekStore,deploymentMode:environment.DEPLOYMENT_MODE,billingPlans:askRoomComposition?.billingPlans??null,providerTargets:declaredProviderTargets,log:code=>console.error('[STAFF_ALERT_FAILURE]',code)})) : undefined;
if (staffAlerts !== undefined) boot.hold({end:()=>staffAlerts.close()});
const staffHttp = staffAccess === undefined || staffAlerts === undefined ? undefined : {
  access: staffAccess, sessions, repository: new PostgresStaffRepository(pool),
  webauthn: new StaffWebAuthnService(new PostgresStaffRepository(pool), {publicAppUrl: environment.PUBLIC_APP_URL}),
  intents: staffAlerts.intents, readiness: staffAlerts.readiness,
  targetInvitationTransport: staffAlerts.targetInvitationTransport,
  ...(staffAlerts.funding === undefined ? {} : { funding: staffAlerts.funding })
};
// Self-service profile/recovery capabilities use the existing authorization
// role and account DEK custody, beside purpose-bound TOTP grant rotation.
const accountProfile = new AccountProfileService({
  repository: new PostgresAccountProfileRepository(authorizationPool, auditContextHasher),
  users: dekStore
});
const recoveryEmail = new RecoveryEmailService({
  repository: new PostgresRecoveryEmailRepository(authorizationPool, auditContextHasher),
  users: dekStore,
  blindIndexKey,
  mail: new SendmailRecoveryEmailMailSender({
    executable: environment.MAIL_SENDMAIL_PATH,
    from: environment.MAIL_FROM,
    publicAppUrl: environment.PUBLIC_APP_URL,
    timeoutMs: authPolicy.channel.transportTimeoutMs
  }),
  mailDomainCheck
});
const emailChange = new EmailChangeService({
  repository: new PostgresEmailChangeRepository(authorizationPool, auditContextHasher),
  users: dekStore,
  blindIndexKey,
  mail: new SendmailEmailChangeMailSender({
    executable: environment.MAIL_SENDMAIL_PATH,
    from: environment.MAIL_FROM,
    publicAppUrl: environment.PUBLIC_APP_URL,
    timeoutMs: authPolicy.channel.transportTimeoutMs
  }),
  mailDomainCheck
});
const legacyRunClaim=new PostgresLegacyRunClaimApplication(
  new PostgresLegacyRunClaimRepository(pool,auditContextHasher)
);
const application = new PostgresAskApplication(pool, dispatcher, {
  /**
   * Side-by-side spec §13: the members a settings version decides (its preview line-up and gate terms, the daily guard
   * without the room, the envelope basis, the risk tier, the picker, the role rotation, the shape, length, engine and
   * question-language rows), by the ONE mapping, for the site version: the defaults. `admissionSettings` below hands S10's
   * per-ask read the active version's, by the same mapping.
   */
  ...admissionSettingsOfVersion(siteAdmission),
  // Step 1: the preview's team; keyed on the env's gate part (ruling R25).
  ...(previewGate === undefined ? {} : { previewTeamUserIds: environment.PREVIEW_TEAM_USER_IDS ?? [] }),
  strangerSampleRate: environment.STRANGER_SAMPLE_RATE,
  // Side-by-side spec §1: every run this API admits carries its own checked release key.
  releaseKey: environment.RELEASE_KEY,
  batteryVersion: environment.BATTERY_VERSION,
  settlementWatchHandle: environment.SETTLEMENT_WATCH_HANDLE,
  // V-28(2) / B6b: the room when it is composed, INSTEAD of the daily guard (the mapping hands the guard only without
  // the room: the site context gives the guard no store then); neither locally.
  ...(askRoom === undefined ? {} : { room: askRoom, waitingLine: askRoom }),
  ...(askBilling === undefined ? {} : { billing: askBilling }),
  resolveDiscoveredPanel: resolveProviderPanel,
  // Side-by-side spec §13 API points 1-2: the active version (the pointer, or the site version while it is empty) and
  // each version's members, loaded once and kept.
  admissionSettings: {
    activeSettingsVersion: () => activeSettings.current(),
    admissionSettingsFor: async (version) => admissionSettingsOfVersion(await admissionCache.admissionSettingsFor(version))
  }
},undefined,contentProvisionPool,Object.freeze({
  server:serverAskAdmissionPool,legacy:legacyAskAdmissionPool
}));
// Verdict story (spec 2026-09-26 §10): the owner reads stories through the
// API's runtime pool; decryption uses the content encryption configured above.
const storyRepository = new StoryRepository(pool);
const publicationCipher = environment.PUBLICATION_ENABLED === "true"
  ? boot.runSync("publication-key-store", () => new PublicationCipher(new FilePublicationKeyStore(
      environment.PUBLICATION_KEY_STORE_PATH!,corpusKeks!
    )))
  : undefined;
// Debate shape P2c (spec 2026-10-12 §3.3 step 8): the debate page's map view, for the
// owner's route and for the snapshot a publication takes, on the same runtime pool. P2b's
// reader checks no owner, so the view asks core.run_is_owned_by first (pre-flight PF-C16).
const mapViews = new RepositoryAnswerMapViewApplication(
  new MapChoiceRepository(pool),
  runOwnerCheckFrom((text, values) => pool.query<{ owned?: boolean; run_id?: string }>(text, values))
);
const publications = publicationCipher === undefined
  ? undefined
  : new PostgresPublicationApplication(
      new PostgresPublicationRepository(pool, auditContextHasher),
      publicationCipher,
      undefined,
      new PostgresPublicationRepository(publicationCleanupPool,auditContextHasher),
      new RepositoryPublicationStoryReader(storyRepository),
      mapViews,
      // Final fix wave P5: an unparsable public snapshot is a newer release's only when its run is stamped by one.
      { ownReleaseKey: environment.RELEASE_KEY, readRunReleaseKey: (runId) => application.readRunReleaseKey(runId) }
    );
// Side-by-side spec §4 (plan C3): the first read is awaited (a failure is recorded, never thrown), then it polls.
await boot.run("release-watcher", () => releaseWatcher.start());
let publicationCleanupTimer: ReturnType<typeof setInterval> | undefined;
if (publications !== undefined) {
  // Crash-orphan publication keys are claimed and removed before the process
  // can accept traffic. Both bounded outboxes continue reconciling while the
  // process is live; an item failure is reported only after later items in the
  // same batch were given a chance to complete.
  //
  // DL7-F7 (fix round 1): these two run DURING the boot and were the last
  // awaits outside the ledger — indented inside this block, which is exactly
  // what the old line-based scan could not see. A publication pool that refuses
  // here used to leave every key live and print no `api.boot.failed` line.
  //
  // Side-by-side spec §4 (plan C7): the boot pass runs only when the watcher's first read (awaited above) says this
  // release is current, and the 30-second pass is gated, so a release that becomes current later cleans within a tick.
  if (releaseWatcher.ownIsCurrent()) {
    await boot.run("publication-key-cleanup", async () => {
      await publications.reconcileKeyProvisionCleanup();
      await publications.reconcileKeyCleanup();
    });
  }
  publicationCleanupTimer = gatedInterval(releaseWatcher, () => {
    void Promise.all([
      publications.reconcileKeyProvisionCleanup(),
      publications.reconcileKeyCleanup()
    ]).catch(() => console.error("[PUBLICATION_KEY_CLEANUP_PENDING]"));
  },30_000);
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
  try { await consumerSecurityNotices.reconcile(100); } catch { console.error('[CONSUMER_SECURITY_NOTICE_PENDING]'); }
  await erasureNotifications.reconcile(100);
  await accountErasure.reconcileRunKeyProvisionIntents(100);
  await privateErasure.reconcile(reconciliationSource(),100);
  await accountErasure.reconcile(reconciliationSource(),100);
};
const triggerErasureReconciliation=createSingleFlightErasureReconciler(
  reconcileErasure,
  ()=>console.error("[ACCOUNT_ERASURE_RECONCILIATION_PENDING]")
);
// Side-by-side spec §4 (plan C7): this timer and every background timer below run their work only while this release
// is current (gatedInterval, unref'd); the post-listen one-shots run each time it becomes current (end of this file).
const erasureReconcileTimer=gatedInterval(releaseWatcher,triggerErasureReconciliation,30_000);
const triggerAuthenticationRiskCleanup=createSingleFlightErasureReconciler(
  async ()=>{
    await authenticationRiskSignals.purgeExpired(recoveryPolicy.riskSignals.cleanupBatchMax);
  },
  ()=>console.error("[AUTHENTICATION_RISK_SIGNAL_CLEANUP_PENDING]")
);
const authenticationRiskCleanupTimer=gatedInterval(
  releaseWatcher,triggerAuthenticationRiskCleanup,60_000
);
// A15 (P16c): the retention purge runs wherever the API runs, whatever DEPLOYMENT_MODE and billingPolicy say —
// acceptance records exist in every mode (A14). Asked once each time this release becomes current after listen (below;
// side-by-side C7), so a service restarted more often than daily still reaches a check (P2-M42), then daily (gated);
// it purges once per UTC year, from 2 January.
const retentionPurge = createRetentionPurge({ pool, clock: () => new Date(), log: (line) => console.error(line) });
const triggerRetentionPurge=createSingleFlightErasureReconciler(
  async ()=>{ await retentionPurge.runIfDue(); },
  ()=>console.error("[RETENTION_PURGE_PENDING]")
);
const retentionPurgeTimer=gatedInterval(releaseWatcher,triggerRetentionPurge,86_400_000);
/**
 * Budget spec 2026-09-28 §2.7 (B7b) — THE WAKER. Single-flight like every timer
 * here; once right after listen (a raised site limit arrives as a restart, and
 * the line must not sleep through it), then on every whole minute — the very
 * instants `nextWholeMinute` tells a waiting question — unref'd and stopped on
 * close. Only when the room is composed; nothing can wait otherwise. Side-by-side
 * C7: the "once" runs each time this release becomes current, and a minute's
 * tick asks the waker only while it is current.
 */
const triggerAskWake = createSingleFlightErasureReconciler(
  async () => { await application.wakeWaitingRuns(); },
  () => console.error("[ASK_WAITING_LINE_WAKE_PENDING]")
);
let askWaker: Readonly<{ stop(): void }> | undefined;
/** Side-by-side (plan C7): the post-listen one-shots' subscription to the watcher, ended with the API. */
let endBecameCurrent: (() => void) | undefined;
const evaluatorDevMenuPool = environment.EVALUATOR_DEV_MENU_ENABLED === "true"
  ? boot.hold(createPool(environment.EVALUATOR_DEV_MENU_DATABASE_URL!, API_DATABASE_POOLS.evaluatorDevMenu))
  : undefined;
const evaluatorDevMenu = evaluatorDevMenuPool !== undefined
  ? new PostgresEvaluatorDevMenuRepository(evaluatorDevMenuPool)
  : undefined;
const supportPool = boot.hold(createPool(environment.SUPPORT_DATABASE_URL, API_DATABASE_POOLS.support));
const supportRelayLeasePool = boot.hold(
  createPool(environment.SUPPORT_DATABASE_URL, API_DATABASE_POOLS.supportRelayLease)
);
const supportKeys = await boot.run("support-keys", () => createSupportKeyPort({
  supportKekPath: environment.SUPPORT_KEK_PATH,
  // V-3: the support envelope carries no key label, so a row written before a
  // changeover is opened by trying the current key and then this one. Absent
  // outside a changeover, which is the steady state.
  previousSupportKekPath: environment.SUPPORT_KEK_PREVIOUS_PATH,
  protectedKeyPaths: [
    environment.KEK_PATH,
    environment.CORPUS_KEK_PATH,
    environment.BLIND_INDEX_KEY_PATH,
    environment.AUDIT_SOURCE_IP_SALT_PATH,
    environment.RECORDS_KEY_PATH
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
const reportSupportDraftDiagnostic = (diagnostic: SupportDraftReport): void => {
  console.error(projectSupportDraftReport(diagnostic));
};
const supportRelayReservations = new PostgresSupportRelayReservationRepository(supportRelayLeasePool);
const supportRelayCallRecords = new PostgresSupportRelayReservationRepository(supportPool);
const supportRelayQueue = new SupportRelayQueue({
  readLimits: () => readLimits(supportConfiguration),
  reservations: supportRelayReservations,
  reportCleanupFailure: reportSupportDiagnostic
});
const supportDegraded = new SupportDegradedState();
// V-30(1): the support chat's model target is parsed above, before the question-language step (P2L Task 19,
// pre-flight PF-L36); the support chat receives that same target here.
const supportModels = new Map<string,SupportModelPort>(supportModelTarget === undefined ? [] : [[
  supportModelTarget.providerRef,
  // V-9(2): a declared credential FILE is resolved here, through the same
  // custody-checked loader the debate targets use — one seam, one contract.
  createSupportModelAdapter(supportModelTarget,{
    readAuthorizationHeader: readSupportCredentialOnce,
    timeoutMs: environment.PROVIDER_PROBE_TIMEOUT_MS,
    reportDiagnostic: reportSupportDiagnostic
  })
] as const]);
// Fix round 2 (Minor 6): the adapter holds its key now; the boot's one-read memo keeps no copy past this line.
supportCredentialReads.clear();
// hate-speech S02 (D-S02-12, D-S02-21): the publish check's judge is the support
// chat's configured target, called through its own per-call adapter; absent,
// every publish answers UNAVAILABLE `JUDGE_NOT_CONFIGURED`. SIGUSR2 toggles the
// judge off and back on (SPEC-v2 §6 step 9) — it can only make publishing
// refuse, never skip the check.
// FIX-HS2-p1 sd-N5: only a LOCAL deployment has the switch — a flag file named by the API port (`touch` = off,
// `rm` = on, read per attempt, so it survives a restart) and SIGUSR2, which writes the file. Hosted has neither.
// sd-N6: the transport prefixes the judge's diagnostics `PUBLICATION_JUDGE:`.
// ct-B4, and the owner's ruling of 2026-10-04: D, the check's deadline, is the register's publicationCheckPolicy
// row, read at start-up (a version without it refuses here, PUBLICATION_CHECK_POLICY_UNRESOLVED) and wired into the
// check and the judge transport's backstop (D + 10 s), never a literal.
const publicationCheckPolicy = await boot.run("publication-check-policy", () => readPublicationCheckPolicy(pool, environment.REGISTER_VERSION));
const publicationJudgeOffFlag = environment.DEPLOYMENT_MODE === "hosted" ? null : publicationJudgeOffFlagPath(environment.API_PORT);
const publicationJudgeSwitch = createPublicationJudgeSwitch(supportModelTarget === undefined
  ? null
  : createPublicationJudgeTransport(supportModelTarget, {
    readAuthorizationHeader: readCustodyAuthorizationHeader,
    reportDiagnostic: reportSupportDiagnostic,
    deadlineMs: publicationCheckPolicy.deadlineMs
  }), { offFlagPath: publicationJudgeOffFlag });
const publicationContentCheck = createPublicationContentCheck({
  judge: publicationJudgeSwitch.current,
  recorder: new PostgresPublicationCheckRecordRepository(pool),
  clock: () => new Date(),
  deadlineMs: publicationCheckPolicy.deadlineMs
});
if (publicationJudgeOffFlag !== null) installPublicationJudgeSwitchSignal(process, publicationJudgeSwitch);
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
  modelFor: (modelRef) => supportModels.get(modelRef),
  // V-30: a configured model ref that names no composed model says so, once,
  // instead of degrading every visitor's answer with no reason recorded.
  reportDiagnostic: reportSupportDiagnostic
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
  requireStructuredDraft: true,
  messages: supportMessages,
  incidents: supportIncidents,
  reportDraftDiagnostic: reportSupportDraftDiagnostic,
  queue: supportRelayQueue,
  degraded: supportDegraded,
  modelFor: () => supportAdmittedModel
});
const supportStatus = new PostgresSupportStatusRepository(supportPool);
/**
 * Paid plans P16c (R-35): where and when each tax is paid, read only while billing is on (the owner's O1 text);
 * billing on with no taxAuthorities row at REGISTER_VERSION is refused below by name.
 */
const taxAuthorities = billingConnectors === null
  ? null : await boot.run("tax-authorities", () => readTaxAuthorities(pool, environment.REGISTER_VERSION));
/**
 * Paid plans P7: the billing runtime (the durable outbox worker and, later, every billing job and route), composed
 * only while billing is on (P6a built the connectors). Billing on with no plans row, country policy or country lookup
 * is a configuration error, refused at boot by name.
 */
const billingRuntime = billingConnectors === null
  ? undefined
  : boot.runSync("billing-runtime", () => {
    const billingPlans = askBilling?.plans ?? null;
    if (
      billingPolicy === null || billingPlans === null || countryPolicy === null || geoLookup === undefined
      || taxAuthorities === null
    ) {
      throw new TypedDomainError(
        "BILLING_CONFIGURATION_INCOMPLETE",
        "billing needs billingPlans, countryPolicy, the country lookup and taxAuthorities"
      );
    }
    // Paid plans P8b: the quote route charges the owner's billingQuote budget (contract §2), so billing on with an
    // admission row that does not seal it is refused at boot by name.
    // The hosted publish asks the same question in verifyHostedRegisterBootReadiness, so a billing admission scope required here is required there too.
    if (admissionPolicy.billingQuote === null) {
      throw new TypedDomainError("BILLING_ADMISSION_UNSEALED",
        "Billing is on, so the register must seal the billingQuote admission scope");
    }
    // Paid plans P8c: the checkout charges its own owner-keyed billingCheckout budget (spec §2.7).
    if (admissionPolicy.billingCheckout === null) {
      throw new TypedDomainError("BILLING_ADMISSION_UNSEALED",
        "Billing is on, so the register must seal the billingCheckout admission scope");
    }
    // Paid plans P9a, NETOPIA spec §2.7.1: an unverified payment message charges the source-keyed billingNotify budget
    // (contract §2: 120 a minute).
    if (admissionPolicy.billingNotify === null) {
      throw new TypedDomainError("BILLING_ADMISSION_UNSEALED",
        "Billing is on, so the register must seal the billingNotify admission scope");
    }
    // Paid plans P13 (A25): the public cancel link charges the source-keyed billingCancelLink budget (5 an hour).
    if (admissionPolicy.billingCancelLink === null) {
      throw new TypedDomainError("BILLING_ADMISSION_UNSEALED",
        "Billing is on, so the register must seal the billingCancelLink admission scope");
    }
    // A sandbox payment never reaches a live invoicing service (SmartBill has no sandbox), offset or not.
    assertStageInvoicersAreSandboxes({
      paymentEnvironment: billingConnectors.paymentEnvironment,
      quadernoApiBaseUrl: environment.QUADERNO_API_BASE_URL ?? null,
      smartbillApiBaseUrl: environment.SMARTBILL_API_BASE_URL ?? null
    });
    // ... and a live payment never meets a sandbox invoicer (exactly one legal invoice per charge).
    assertLiveInvoicersAreLive({
      paymentEnvironment: billingConnectors.paymentEnvironment,
      quadernoApiBaseUrl: environment.QUADERNO_API_BASE_URL ?? null,
      smartbillApiBaseUrl: environment.SMARTBILL_API_BASE_URL ?? null
    });
    const stageOffsetDays = environment.BILLING_STAGE_CLOCK_OFFSET_DAYS ?? null;
    const stageClock = billingClock({
      paymentEnvironment: billingConnectors.paymentEnvironment,
      offsetDays: stageOffsetDays
    });
    // One moved clock for everything the runtime records and decides; real time wherever it talks to NETOPIA.
    const runtimeConnectors = stageClock.offsetMs === 0 || stageOffsetDays === null
      ? billingConnectors
      : Object.freeze({
        ...billingConnectors,
        payments: new TimeShiftedCardPayments(billingConnectors.payments, stageOffsetDays)
      });
    return createBillingRuntime({
      pool, connectors: runtimeConnectors, policy: billingPolicy, plans: billingPlans, countryPolicy,
      geo: geoLookup, legal, dekStore,
      // P17 (spec §2.5.10): the EMAIL jobs send through the same sendmail path, sender and timeout as the mail above.
      mail: {
        sender: new TemplatedMailSender({
          executable: environment.MAIL_SENDMAIL_PATH,
          from: environment.MAIL_FROM,
          timeoutMs: authPolicy.channel.transportTimeoutMs
        }),
        attachments: billingMailAttachmentResolvers({ audit: consoleBillingAudit })
      },
      // P12d: the owner's model spend, the credit-used share of a withdrawal (the same reader as B6a's room).
      ownerSpend: new PostgresModelSpendStore(pool),
      // P13 (R-35): the sign-up blind-index key (held by boot.hold above) and the identity lookup of the cancel link.
      blindIndexKey,
      identities: identityRepository,
      // P16c (R-35): the owner's quarterly tax summary (email O1) names where and when each tax is paid.
      taxAuthorities,
      audit: consoleBillingAudit, clock: stageClock.clock, clockOffsetMs: stageClock.offsetMs,
      reportPending: (code) => console.error(`[${code}]`),
      // B3a: the spool of verified NETOPIA messages the database could not take (BILLING_NOTICE_SPOOL_PATH).
      ...(billingNoticeSpool === undefined ? {} : { noticeSpool: billingNoticeSpool })
    });
  });
/**
 * Paid plans (B7a onward): the billing routes' dependencies, only while billing is
 * on. B7a's usage reader (the room composed with entitlements) and, from P8a, the
 * billing runtime's routes; later billing tasks add their members to
 * `billingRuntime.routes`. Absent, every billing route answers 404.
 */
// Since C17 the `instanceof FundingAwarePersonAllowanceSource` guard below is always true here (billing on → always
// funding-aware); its false branch is unreachable, kept for now.
const billingUsageReader = askRoomComposition === undefined || askRoomComposition.entitlements === null
  ? undefined
  : new PersonUsageReader({
      entitlements: askRoomComposition.entitlements,
      allowance: askRoomComposition.personAllowance,
      ...(askRoomComposition.personAllowance instanceof FundingAwarePersonAllowanceSource ? { funding: askRoomComposition.personAllowance } : {}),
      spend: askRoomComposition.spend
    });
const billingRouteOptions: BillingRouteOptions | undefined =
  billingUsageReader === undefined && billingRuntime === undefined && providerOnlyIntake === undefined
    ? undefined
    : Object.freeze({
        ...(billingUsageReader === undefined ? {} : { usage: billingUsageReader }),
        ...(billingRuntime === undefined ? {} : billingRuntime.routes),
        ...(providerOnlyIntake === undefined ? {} : { netopiaNotices: providerOnlyIntake })
      });
const DATA_EXPORT_TICK_MS = 15_000;
const ownerStories = new RepositoryAnswerStoryApplication(storyRepository);
const ownerDisclosures = new RepositoryAnswerDisclosureApplication(new ServeDisclosureRepository(pool));
let dataExport: DataExportApplication | undefined;
let dataExportTimer: ReturnType<typeof setInterval> | undefined;
let triggerDataExportWork = (): void => {};
if (environment.DATA_EXPORT_STORE_PATH !== undefined) {
  const repository = new PostgresDataExportRepository(authorizationPool, dataExportPool!, auditContextHasher);
  const source = new PostgresDataExportSource(dataExportPool!);
  const store = new FileDataExportStore({ directory: environment.DATA_EXPORT_STORE_PATH, users: dekStore });
  const mail = new TemplatedDataExportMail(new TemplatedMailSender({
    executable: environment.MAIL_SENDMAIL_PATH,
    from: environment.MAIL_FROM,
    timeoutMs: authPolicy.channel.transportTimeoutMs
  }));
  const ownerDeps = { application, stories: ownerStories, disclosures: ownerDisclosures };
  dataExport = new DataExportApplication({
    repository, store, mail, archiveCatalog: loadArchiveCatalog,
    publicAppUrl: environment.PUBLIC_APP_URL, workerId: randomUUID(),
    collect: (claim, workerId) => collectSnapshot({
      claim, workerId, source,
      ownerView: new OwnerViewAdapter(ownerDeps, runKeyStore, claim.sessionId),
      decrypt: {
        openUserField: async (userId, field, envelope) => {
          const dek = await dekStore.load(userId);
          let plain: Buffer | undefined;
          try {
            plain = decrypt(dek, envelope as Parameters<typeof decrypt>[1],
              ["identity", field, userId, "run:none", userId, `user-dek:${userId}`, "1"] as const);
            return plain.toString("utf8");
          } finally { plain?.fill(0); dek.fill(0); }
        },
        openRecord: (aad, ciphertext) => {
          const plain = openRecord(recordsKey, aad, ciphertext);
          try { return plain.toString("utf8"); } finally { plain.fill(0); }
        },
        openSupport: async (handle, wrapped, context, ciphertext) => {
          const key = await supportKeys.unwrapDataKey(handle, wrapped);
          let plain: Buffer | undefined;
          try {
            plain = supportKeys.openContent(context as Parameters<typeof supportKeys.openContent>[0], key, ciphertext);
            return plain.toString("utf8");
          } finally { plain?.fill(0); key.fill(0); }
        }
      },
      now: () => new Date()
    })
  });
  const app = dataExport;
  triggerDataExportWork = createSingleFlightErasureReconciler(
    () => app.runOnce(), () => console.error("[DATA_EXPORT_WORK_PENDING]"));
  dataExportTimer = gatedInterval(releaseWatcher, triggerDataExportWork, DATA_EXPORT_TICK_MS);
}
const api = buildApi({
  // Addition D16 / ruling R25: keyed on the env's gate part; the configuration is the site version's composed one (its
  // line-up over the gate part). `admissionView` below carries the active version's: the room read's class counts it (SA6).
  ...(previewGate === undefined ? {} : { previewProviderTestConfig: siteAdmission.previewConfig!, previewTeamUserIds: environment.PREVIEW_TEAM_USER_IDS ?? [] }),
  application,
  stories: ownerStories,
  // Engine money rule, Task M5 (spec 2026-09-26 §14.4.5): the owner's read of
  // the content-free disclosure record, on the same runtime pool.
  disclosures: ownerDisclosures,
  mapViews,
  ...(dataExport === undefined ? {} : { dataExport }),
  /**
   * Side-by-side spec §13 (S10): what the ACTIVE settings version says to the pages, per request — the room read's shape
   * and length rows and the version it estimates with, and A21's yes/no on GET /v1/session (owner decision O4: from the
   * very picker admission asks, the same test `evaluateAskAdmission` makes before it lets the scorecard choose). It
   * replaces the static shape, length and scorecard members, so /new advises on the version the next ask is admitted on.
   */
  admissionView: createAdmissionView({
    activeSettingsVersion: () => activeSettings.current(),
    admissionSettingsFor: (version) => admissionCache.admissionSettingsFor(version),
    fallback: siteAdmission,
    log: (line) => { console.error(line); }
  }),
  aiProviderCompanies,
  accountErasure:erasureApplication,
  registration,
  socialAuth,
  socialStepUp:new SocialStepUpService(socialRepository,socialProviders,sessions.consumerProducer(),{publicAppUrl:environment.PUBLIC_APP_URL,users:dekStore,argon2:argon2Pool,mfaPolicy}),
  turnstile: new UnixTurnstileVerifier({ publicAppUrl: environment.PUBLIC_APP_URL, ...(environment.TURNSTILE_SOCKET_PATH === undefined ? {} : { socketPath: environment.TURNSTILE_SOCKET_PATH }) }),
  // Auth API hardening 2026-10-09: sign-in and recovery-start proofs, each off until its UI widget ships.
  turnstileLoginRequired: environment.TURNSTILE_LOGIN_REQUIRED === "true",
  turnstileRecoveryRequired: environment.TURNSTILE_RECOVERY_REQUIRED === "true",
  recovery,
  ...(passwordReset?{passwordReset}:{}),
  ...(backupEmail?{backupEmail}:{}),
  ...(mfaRecovery?{mfaRecovery}:{}),
  consumerRecovery,
  onboardingEvidence,
  mfa,
  sessions,
  consumerSecurity:new ConsumerSecurityService(new PostgresConsumerSecurityRepository(authorizationPool,auditContextHasher),sessions.consumerProducer(),{publicAppUrl:environment.PUBLIC_APP_URL,argon2:argon2Pool,mfaPolicy,authPolicy}),
  consumerWebAuthn: new ConsumerWebAuthnService(new PostgresConsumerAuthRepository(authorizationPool,auditContextHasher),sessions.consumerProducer(),{publicAppUrl:environment.PUBLIC_APP_URL}),
  ...(staffAccess === undefined ? {} : { staffAccess }),
  staffPolicyVersion: environment.STAFF_ACCESS.policyVersion,
  ...(staffHttp === undefined ? {} : {staff: staffHttp}),
  legacyRunClaim,
  legal,
  emailChange,
  accountProfile,
  recoveryEmail,
  // Side-by-side spec §6 (plan C5): the release header on every answer, and /readyz from the watcher's last read.
  releaseKey: environment.RELEASE_KEY,
  readiness: releaseWatcher,
  // B10: the sealed admission budgets are always composed in production.
  admission: new AdmissionLimiter(admissionPolicy),
  // B7a: the room read and, while billing is on, the usage read. Absent, the
  // room answers FITS and the usage route 404.
  ...(askRoom === undefined ? {} : { askRoom }),
  ...(askBilling === undefined ? {} : { askBilling }),
  ...(billingRouteOptions === undefined ? {} : { billing: billingRouteOptions }),
  // P15, W7: scheduling an account erasure stops the owner's renewal at once (the reconciler's sweep repeats it, and
  // ends the plan once the erasure commits).
  ...(billingRuntime === undefined ? {} : { billingErasure: billingRuntime.erasure }),
  ...(countryGate === undefined ? {} : { countryGate }),
  support: {
    configuration: supportConfiguration,
    // DL5-F3: the caller's network is pseudonymised under a key derived from
    // the support KEK before it ever reaches an append-only table.
    sourcePseudonym: (value: string) => supportKeys.sourcePseudonym(value),
    sessions: Object.freeze({
      create: supportSessions.create.bind(supportSessions),
      read: supportSessions.read.bind(supportSessions),
      admitMessage: supportSessions.admitMessage.bind(supportSessions),
      admitIpSession: supportSessions.admitIpSession.bind(supportSessions),
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
    incidents: supportIncidents,
    reportDiagnostic: reportSupportDiagnostic,
    knowledge: {
      snapshot: (version) => supportKnowledgeSnapshots.get(version),
      status: async () => Object.freeze({
        kbVersion: supportKnowledge.kbVersion,
        shipped: supportKnowledge.shippedCount,
        ignored: supportKnowledge.ignoredCount
      })
    }
  },
  ...(publications === undefined ? {} : { publications }),
  publicationContentCheck,
  allowedOrigin: environment.PUBLIC_APP_URL,
  ...(evaluatorDevMenu === undefined ? {} : {
    evaluatorDevMenu,
    evaluatorDevMenuRegisterVersion: environment.REGISTER_VERSION
  })
});
// Side-by-side spec §4 (plan C7 review): the release listener unsubscribes FIRST on close. Fastify runs onClose hooks
// last-in-first-out, so an onClose here would run after every stop below; preClose runs before all of them, so no
// one-shot pass can start a runtime the hooks below have already stopped.
api.addHook("preClose",async () => endBecameCurrent?.());
if (publicationCleanupTimer !== undefined) {
  api.addHook("onClose",async () => clearInterval(publicationCleanupTimer));
}
api.addHook("onClose",async () => clearInterval(erasureReconcileTimer));
api.addHook("onClose",async () => { if (dataExportTimer !== undefined) clearInterval(dataExportTimer); });
api.addHook("onClose",async () => billingRuntime?.stop());
api.addHook("onClose",async () => providerOnlyJobs?.stop());
api.addHook("onClose",async () => clearInterval(authenticationRiskCleanupTimer));
api.addHook("onClose",async () => clearInterval(retentionPurgeTimer));
api.addHook("onClose",async () => askWaker?.stop());
api.addHook("onClose",async () => staffAlerts?.close());
api.addHook("onClose",async()=>{
 if(passwordResetTimer)clearInterval(passwordResetTimer);
 if(emailRecoveryTimer)clearInterval(emailRecoveryTimer);
 await passwordResetNotices?.close();
 for(const worker of emailRecoveryWorkers)await worker.close();
});
const startup = installStartupResourceOwner({
  api,
  // Side-by-side spec §6 (plan C6): SIGTERM drains first, so live run-event streams close cleanly before api.close().
  drain: { begin: () => releaseWatcher.beginDrain() },
  registration,
  auditContextHasher,
  argon2Pool,
  databasePools: [
    // Side-by-side (plan C3): the release watcher stops before its own pool (final fix wave P1) closes.
    { end: async () => { releaseWatcher.stop(); } },
    releaseWatchPool,
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
    roomDecisionPool,
    ...(erasurePool === pool
        || erasurePool === authorizationPool
        || erasurePool === publicationCleanupPool
        || erasurePool === contentProvisionPool
      ? [] : [erasurePool]),
    ...(evaluatorDevMenuPool === undefined ? [] : [evaluatorDevMenuPool]),
    ...(dataExportPool === undefined ? [] : [dataExportPool]),
    supportPool,
    supportRelayLeasePool,
    { end: () => supportKeys.close() },
    { end: () => supportConfiguration.close() },
    // Paid plans G3a: the country lookup is closed with the process (close only sets a flag, so twice is harmless).
    { end: async () => { geoLookup?.close(); } },
    // L1: the records key outlives the boot ledger; it is zeroed after every pool has closed.
    { end: async () => { recordsKey.fill(0); } }
  ],
  // L2-F7: zeroed after every pool that borrows from them has closed. A
  // changeover's PREVIOUS keys are in this list for the same reason the current
  // ones are: the process holds them, so the process zeroes them (V-3).
  kekHandles: [
    kek,
    ...(userKeks.previous === undefined ? [] : [userKeks.previous]),
    ...(corpusKek === undefined ? [] : [corpusKek]),
    ...(corpusKeks?.previous === undefined ? [] : [corpusKeks.previous])
  ]
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
// Side-by-side spec §1; INTERFACE "Journal lines": once listening, the API names the release it is (checked at boot by
// assertReleaseKeyForRegister), exactly once, so a launcher or operator reads which release answered on which port.
console.info(`DEBATEAI_API_READY ${JSON.stringify({ releaseKey: environment.RELEASE_KEY, port: environment.API_PORT })}`);
// Side-by-side spec §4 (plan C7): the timers started here, like every timer above, run their work only while this
// release is current; the ask waker's whole-minute tick (with its stalled-start re-send) is gated the same way.
if (askRoom !== undefined) askWaker = everyWholeMinute(gatedTrigger(releaseWatcher, triggerAskWake));
if(triggerPasswordResetReconciliation)passwordResetTimer=gatedInterval(releaseWatcher,triggerPasswordResetReconciliation,30_000);
if(triggerEmailRecoveryReconciliation)emailRecoveryTimer=gatedInterval(releaseWatcher,triggerEmailRecoveryReconciliation,30_000);
// Side-by-side spec §4 (plan C7): the post-listen one-shots, in their order, run each time this release BECOMES current
// (at once when it already is, as on a single-release host; at the switch for a staged release; again after a database
// outage made the watcher's read stale), never on a release beside the current one. Each is single-flight and claims
// its rows in SQL, so a repeat is a restart's pass. The three runtimes' start() is idempotent and gates every one of
// their ticks on the same watcher, so a release that is never current starts no billing, card or staff-alert work.
endBecameCurrent = releaseWatcher.onBecameCurrent(() => {
  // Queue draining is deliberately background-only. A bounded sendmail timeout
  // can never hold readiness hostage, while the SQL ACK gate still prevents any
  // user-key destruction before completion delivery succeeds.
  triggerErasureReconciliation();
  triggerDataExportWork();
  triggerAuthenticationRiskCleanup();
  triggerRetentionPurge();
  billingRuntime?.start({ when: () => releaseWatcher.ownIsCurrent() });
  providerOnlyJobs?.start({ when: () => releaseWatcher.ownIsCurrent() });
  // N9 (spec 2026-10-05 §2.7.4 step 2): the trusted keys were read at this start, so every quarantined NETOPIA message
  // is verified again with them, and one that now verifies is stored as if it had just arrived. In the background: a
  // slow database never holds the listening API; a failure is one content-free line, and the next start tries again.
  const netopiaIntake = billingRuntime?.netopiaNotices ?? providerOnlyIntake;
  if (netopiaIntake !== undefined) {
    void netopiaIntake.recheckQuarantine(new Date()).catch(() => {
      consoleBillingAudit("billing.notice.recheck", { code: "BILLING_NOTICE_RECHECK_FAILED" });
    });
    // B3a: the spool's kept messages are verified again and stored the same way; the 10-minute tick replays them after.
    if (billingNoticeSpool === undefined) {
      consoleBillingAudit("billing.notice.spool_off", {});
    } else {
      void netopiaIntake.replaySpool(new Date()).catch(() => {
        consoleBillingAudit("billing.notice.spool_replay", { code: "BILLING_NOTICE_SPOOL_REPLAY_FAILED" });
      });
    }
  }
  if (askRoom !== undefined) triggerAskWake();
  staffAlerts?.start({ when: () => releaseWatcher.ownIsCurrent() });
  triggerPasswordResetReconciliation?.();
  triggerEmailRecoveryReconciliation?.();
});
// Side-by-side spec §6 (plan C3): boot finished, so BOOTING is no longer a readiness reason.
releaseWatcher.markBooted();
