// W5-4: THE WHOLE SITE ON ONE COMPUTER, WITH NO VENDOR. Real PostgreSQL (embedded), every migration, the register built by the
// publish kits (hosted, billing on, the debate-shape, length and engine rows), the REAL API (buildApi over a real listening port,
// composed as apps/api/src/main.ts composes it: the room, the plan windows, the public lane, the reports), the REAL runner
// (tools/preview-practice/practice-runner-composition.ts, which tests/unit/preview-practice-wiring-drift.test.ts keeps equal to
// apps/runner/src/main.ts) over the two preview gates' unix-socket doubles, and the Perplexity stand-in in the search gate's place.
//
// What is scripted, and only this: the AIs' replies (tests/support/preview-gate-stubs.ts, tests/support/gate-later-steps.ts, and each
// test's `script`), the search replies (made-up pages), the sign-in (tests/support/httpSession.ts: the same seam every HTTP test uses,
// never a password or a passkey), the two publication judges (the content check on a public page and the Report button's judge,
// `contentCheck` and `flagJudge`; the checks' own code is the shipped one: tests/integration/public-tree-flow.test.ts), and time: the
// work a server does on its timers runs when the test calls `settle`, in the servers' own passes.
//
// Requests reach the API by real HTTP, through the typed client a page uses, with the cookies and the CSRF header a browser sends
// through the /api proxy. No browser is involved here.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { createContractClient, type ContractClient, type PublicDebate } from "@debateai/contract";
import { FundingAwarePersonAllowanceSource } from "@debateai/billing-core";
import { PostgresModelSpendStore } from "@debateai/budget";
import { WorkItemRepository } from "@debateai/battery";
import { readDeploymentMakerCapability } from "@debateai/critique";
import {
  ContentCipher, FileRunContentKeyStore, FileUserDekStore, MemoryPublicationKeyStore, PublicationCipher, generateDek, loadKek
} from "../../packages/crypto/src/index.js";
import {
  EntitlementRepository, PostgresDigModelRepository, PostgresDigPicksRepository, PostgresInternalAllowanceRepository, PostgresInvestigationReportRepository,
  PostgresInvestigationRepository, PostgresPublicDebateRepository, PostgresPublicDebateRunnerRepository, PostgresPublicFlagRepository, PostgresPublicPageRepository,
  PostgresPublicReviewRepository, PostgresPublicTreeRepository, PostgresPublicationRepository, PostgresWebResearchedRepository, ProviderProbeRepository, RunWaitRepository,
  ServeDisclosureRepository, configureContentEncryption, createPool, migrate, type Pool
} from "@debateai/db";
import { MapChoiceRepository } from "@debateai/map";
import {
  createPreviewBudgetRpcPort, createPreviewGuardedFetch, PREVIEW_GLM_DEADLINE_MS, PREVIEW_REVIEWED_PROVIDER_REFS, previewProbeControls, previewTargetJsonRow,
  resolveProviderTargetCredentials
} from "@debateai/providers";
import {
  canonicalRegisterJson, createPostgresRegisterPublicationPort, debateShapePolicyStartValues, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues,
  loadBootstrapRegister, parseRegisterVersionText, readPanelDiscoveryPolicy, readPreviewLineUpPolicy, registerVersionToSafeLegacyNumber
} from "@debateai/register";
import { buildProviderPriceMap } from "@debateai/runner";
import { StoryRepository, loadStoryPack, resolveStoryPackDir } from "@debateai/story";
import { PostgresAskApplication, buildApi, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from "../../packages/register/src/staff-access-policy.js";
import { buildPreviewSourceRowsV2, composePreviewSnapshotV2, publishPreviewRegisterV2, readSealedSnapshot } from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";
import { accountMemoryStoreFrom } from "../../apps/api/src/account-memory.js";
import { createActiveSettingsVersionReader, readActiveSettingsVersionOn } from "../../apps/api/src/active-settings-version.js";
import {
  admissionSettingsOfVersion, buildAdmissionSiteContext, createAdmissionSettingsCache, createAdmissionView, loadAdmissionSettings
} from "../../apps/api/src/admission-settings.js";
import { createAskClarify, ASK_CLARIFY_ROUTE_POLICY, askClarifyTransportFor } from "../../apps/api/src/ask-clarify.js";
import { AskRoom } from "../../apps/api/src/ask-room.js";
import { RepositoryAnswerDisclosureApplication } from "../../apps/api/src/disclosures.js";
import { investigationReportContentOpener } from "../../apps/api/src/investigation-report.js";
import { RepositoryAnswerMapViewApplication, runOwnerCheckFrom } from "../../apps/api/src/map-views.js";
import { continuedRunWake, runHandoverOf } from "../../apps/api/src/month-pause.js";
import { createProviderDiscoveryResolver, parseDeclaredProviderTargets } from "../../apps/api/src/provider-discovery.js";
import { sweepFreePublications, sweepPublicPage } from "../../apps/api/src/public-tree.js";
import type { PublicationContentCheck, PublicationJudgePort } from "../../apps/api/src/publication-check/check.js";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import { postgresPurposeLines, readPurposeLinesOf } from "../../apps/api/src/purpose-lines.js";
import { questionLanguageRouteFor } from "../../apps/api/src/question-language/boot.js";
import { questionLanguageSiteRoute } from "../../apps/api/src/question-language/boot.js";
import { newQuestionLanguageReferenceKey } from "../../apps/api/src/question-language/reference.js";
import { PostgresAskAdmissionGate, settingsVersionPassed } from "../../apps/api/src/release-state.js";
import { RepositoryAnswerStoryApplication, RepositoryPublicationStoryReader } from "../../apps/api/src/stories.js";
import { recordAskClarifyCharge, reserveAskClarifyCharge } from "@debateai/budget";
import { closingReservesOf, readAbuseLimits } from "@debateai/register";
import { sweepInvestigationClosings } from "../../apps/runner/src/investigation-close.js";
import { composeInvestigationClose } from "../../apps/runner/src/investigation-close-sources.js";
import { sweepTreeUpdates } from "../../apps/runner/src/path-climb.js";
import { composePathRewrite } from "../../apps/runner/src/path-rewrite-composition.js";
import { sweepPathRewrites } from "../../apps/runner/src/path-rewrite-sweep.js";
import { composePublicReport, sweepPublicTree } from "../../apps/runner/src/public-contribution.js";
import { DEVELOPMENT_RUN_DEATH_POLICY } from "../../apps/runner/src/dev-deployment-register.js";
import { composePracticeAskMoney, practiceRemainingPorts } from "../../tools/preview-practice/practice-ask-composition.js";
import {
  composePracticeHostedNextRegisterVersion, importPracticeRegister, parsePracticeNextRegisterInputs, parsePracticeRegisterExport
} from "../../tools/preview-practice/practice-register-import.js";
import { composePracticeRunner } from "../../tools/preview-practice/practice-runner-composition.js";
import { practiceMadeUpSearchReplies, practiceSearchStandIn, practiceWithSearchStandIn } from "../../tools/preview-practice/practice-search-stand-in.js";
import { parsePracticeSettings, practiceReleaseKeyAt, practiceSettingsWithLineUp } from "../../tools/preview-practice/practice-settings.js";
import { readFramedMaterial, wirePacket } from "./framed-packet.js";
import { questionCheckPass } from "./questionCheckPass.js";
import { seedNetopiaSubscription } from "./billingSubscriptionFixtures.js";
import { TEST_OWNER_LIMIT_ROWS } from "./hostedRegisterRows.js";
import { TEST_APP_ORIGIN, persistLiveSession, testHttpIdentity, testSessionApplication, testSessionHeaders, type TestHttpIdentity } from "./httpSession.js";
import { startPreviewGateStubs, type GateOverride, type GateRequest } from "./preview-gate-stubs.js";
import { startTestDatabase, type TestDatabase } from "./testDatabase.js";

const FIVE = ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash", "claude-haiku-5-5"];
const OBSERVATION = { nodeVersion: "v26.8.2", pnpmVersion: "11.20.0", sourceRevision: "a".repeat(40), sourceTree: "b".repeat(40),
  operatorSha256: "c".repeat(64), observedAt: "2026-10-12T08:00:00.000Z" };
const SOURCE_REVISION = "d".repeat(40);
/** A made-up per-debate ceiling and day (multiples of eleven), never a real figure. */
const HOSTED_BILLING = Object.freeze({ billing: "on", perRunCeilingMicros: 3_300_000, dailyCeilingMicros: 110_000_000,
  askRoomReads: { limit: 600, windowMs: 60_000, capacity: 65_536 }, ...TEST_OWNER_LIMIT_ROWS });

/** The live register's history as the practice's README exports it (v4, then kit v2 on top), the same way tests/integration/preview-practice-run.test.ts builds it. */
async function exportedRegister(): Promise<string> {
  const scratch = await startTestDatabase();
  try {
    await migrate(scratch.pool);
    const source = [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), OBSERVATION, undefined, "on", null, null, null, null, null, null)];
    const owned = [STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW]
      .map((row) => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }));
    const base = [...source.filter((row) => !["consumerRecoveryPolicy", "publicationCheckPolicy", "taxAuthorities", "answerRoleRotationPolicy"].includes(row.rowKey)), ...owned];
    await createPostgresRegisterPublicationPort(scratch.pool).importHistorical({ registerVersion: parseRegisterVersionText("4"), rows: base });
    const v4 = await readSealedSnapshot(scratch.pool, "4");
    const snapshot = composePreviewSnapshotV2({ sourceRows: source, baseRows: v4.rows, baseRegisterVersion: "4", baseSnapshotSha256: v4.snapshotSha256 });
    await publishPreviewRegisterV2(scratch.pool, { publicationId: randomUUID(), sourceRef: "r22 world fixture", snapshot,
      approval: { baseRegisterVersion: snapshot.baseRegisterVersion, baseSnapshotSha256: snapshot.baseSnapshotSha256, snapshotSha256: snapshot.snapshotSha256, deltaSha256: snapshot.deltaSha256 } });
    const readme = await readFile(new URL("../../tools/preview-practice/README.md", import.meta.url), "utf8");
    const sql = /-c "(SELECT json_build_object\('schema','preview-practice-register-export-v1'[^"]+)"/u.exec(readme)![1]!.split("${V}").join("5");
    const row = (await scratch.pool.query<{ document: unknown }>(`${sql} AS document`)).rows[0]!;
    return JSON.stringify(row.document);
  } finally {
    await scratch.stop();
  }
}

function settingsText(): string {
  const claimMs = 2 * (DEVELOPMENT_RUN_DEATH_POLICY.cooldown_ms + PREVIEW_GLM_DEADLINE_MS) + PREVIEW_GLM_DEADLINE_MS + 60_000;
  const gate = { deployment: "v3-preview", requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
    anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "r22-world", free_model_ids: FIVE.slice(0, 2), premium_model_ids: FIVE };
  return [`PREVIEW_PROVIDER_TEST_CONFIG_JSON=${JSON.stringify(gate)}`,
    `PROVIDER_DISCOVERY_TARGETS_JSON=${JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow))}`,
    "REGISTER_VERSION=5", "DEBATEAI_DEPLOYMENT_MODE=hosted", "NODE_ENV=production", `CLAIM_MS=${String(claimMs)}`, "CLAIM_MARGIN_MS=60000", "MAX_RECOMPOSE=1",
    "JUDGEMENT_NUMBER_KIND=base-probability", "JUDGEMENT_PRODUCER=judgement:r22-world", "PROPAGATION_NUMBER_KIND=propagated-probability", "PROPAGATION_PRODUCER=propagation:r22-world",
    "PROVIDER_PROBE_TIMEOUT_MS=5000", "PROVIDER_REF=preview:fixture-a", "STRANGER_SAMPLE_RATE=0", "BATTERY_VERSION=s00", "SETTLEMENT_WATCH_HANDLE=settlement-watch:r22-world", ""].join("\n");
}

export type R22Account = Readonly<{ identity: TestHttpIdentity; userId: string; ownerRef: string; pseudonym: string; client: ContractClient; send: typeof fetch }>;
/** A scripted reply by contract id. Null: the stand-in's own default for that request. */
export type R22Script = (contractId: string | null, request: GateRequest, chat: string, field: (name: string) => string | undefined) => GateOverride | null;

export type R22World = Awaited<ReturnType<typeof startR22World>>;

export async function startR22World(options: Readonly<{ log?: (line: string) => void }> = {}) {
  const log = options.log ?? (() => undefined);
  const document = parsePracticeRegisterExport(await exportedRegister());
  const database: TestDatabase = await startTestDatabase();
  await migrate(database.pool);
  const pools: Pool[] = [];
  const open = (): Pool => { const pool = createPool(database.connectionString); pools.push(pool); return pool; };
  const pool = open();
  // The register: kit v3's next version on the export, hosted with billing on, with the engine, length and shape rows the code starts from.
  const inputs = await parsePracticeNextRegisterInputs({ hostedBilling: JSON.stringify(HOSTED_BILLING), debateShape: debateShapePolicyStartValues(), lengthGuidance: lengthGuidancePolicyStartValues(),
    engineVersion: engineVersionPolicyStartValues() } as never);
  const next = await composePracticeHostedNextRegisterVersion(document, inputs.hostedBilling!, inputs.choices);
  const receipt = await importPracticeRegister(database.pool, document, next);
  const nextVersion = registerVersionToSafeLegacyNumber(parseRegisterVersionText(receipt.registerVersion));
  const parsed = parsePracticeSettings(settingsText(), { sourceRevision: SOURCE_REVISION });
  const versioned = Object.freeze({ ...parsed, runner: Object.freeze({ ...parsed.runner, REGISTER_VERSION: nextVersion, RELEASE_KEY: practiceReleaseKeyAt(parsed.runner.RELEASE_KEY, nextVersion, "hosted"), DEPLOYMENT_MODE: "hosted" as const }) });
  const settings = practiceSettingsWithLineUp(versioned, await readPreviewLineUpPolicy(database.pool, nextVersion), { trial: false });
  const environment = settings.runner;
  // The keys live in a throwaway folder; content encryption on, as on the site.
  const secretRoot = await mkdtemp(join(tmpdir(), "debateai-r22-world-"));
  const userIds = new Map<string, string>();
  const userDeks = new FileUserDekStore(secretRoot, loadKek(generateDek()));
  const runKeys = new FileRunContentKeyStore(secretRoot, userDeks, async (ownerRef) => {
    const userId = userIds.get(ownerRef);
    if (userId === undefined) throw new Error("OWNER_REF_UNRESOLVED");
    return userId;
  });
  const cipher = new ContentCipher(runKeys);
  const encrypted = (): Pool => { const each = open(); configureContentEncryption(each, cipher); return each; };
  const apiPool = encrypted();
  configureContentEncryption(pool, cipher);
  configureContentEncryption(database.pool, cipher);
  const runnerPool = encrypted();

  // The gates: AIs scripted, nothing leaves this computer.
  const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
  let script: R22Script | null = null;
  const contractOf = (chat: string) => { try { return readFramedMaterial(wirePacket(chat)); } catch { return null; } };
  const stubs = await startPreviewGateStubs({ storyDefaultShape: PACK.defaultShape, override: (request, chat) => {
    if (script === null) return null;
    const frame = contractOf(chat);
    return script(frame?.contractId ?? null, request, chat, (name) => frame?.fields.find((field) => field.name === name)?.content);
  } });
  const gate = environment.PREVIEW_GATE_SETTINGS;
  const budgetPorts = { deepinfra: createPreviewBudgetRpcPort(gate, stubs.sockets.deepinfra), anthropic: createPreviewBudgetRpcPort(gate, stubs.sockets.anthropic) };
  const remaining = practiceRemainingPorts(settings, stubs.sockets);
  const previewFetch = createPreviewGuardedFetch(budgetPorts);
  const search = practiceSearchStandIn(practiceMadeUpSearchReplies());

  // THE API, as apps/api/src/main.ts composes it (and tools/preview-practice/practice-ask-composition.ts, with billing ON here).
  const deploymentMakers = await readDeploymentMakerCapability(apiPool, nextVersion);
  const discoveryPolicy = await readPanelDiscoveryPolicy(apiPool, nextVersion);
  const declaredProviderTargets = parseDeclaredProviderTargets({ targetsJson: environment.PROVIDER_DISCOVERY_TARGETS_JSON, configuredProviders: deploymentMakers.configuredProviders,
    mode: environment.DEPLOYMENT_MODE, nodeEnv: environment.NODE_ENV });
  const resolveProviderPanel = createProviderDiscoveryResolver({ configuredProviders: deploymentMakers.configuredProviders,
    targets: resolveProviderTargetCredentials(declaredProviderTargets, () => { throw new TypeError("R22_TARGET_DECLARES_A_CREDENTIAL"); }),
    probes: new ProviderProbeRepository(apiPool), probeFreshnessMs: discoveryPolicy.probeFreshnessMs, probeTimeoutMs: PREVIEW_GLM_DEADLINE_MS, probeControlsFor: previewProbeControls,
    fetchImplementation: previewFetch, previewRound: true });
  const money = (await composePracticeAskMoney({ pool: apiPool, registerVersion: nextVersion, deploymentMode: "hosted" }))!;
  const readiness = money.readiness!;
  const admissionSite = buildAdmissionSiteContext({ pool: apiPool, environment, declaredProviderTargets, siteCostEnvelopePolicy: money.siteCostEnvelopePolicy, costEstimateStartPolicy: money.costEstimateStartPolicy,
    askRoomReadiness: readiness,
    questionLanguage: Object.freeze({ routeFor: async () => questionLanguageRouteFor({ previewConfigured: true, previewFetch, anthropicSocket: stubs.sockets.anthropic,
      hosted: () => { throw new TypeError("R22_QUESTION_LANGUAGE_HOSTED_ROUTE"); } }), referenceKey: newQuestionLanguageReferenceKey() }),
    previewRemaining: remaining, log });
  const siteAdmission = await loadAdmissionSettings(apiPool, nextVersion, admissionSite);
  const admissionCache = createAdmissionSettingsCache({ load: (version) => loadAdmissionSettings(apiPool, version, admissionSite), seed: siteAdmission });
  const activeSettings = createActiveSettingsVersionReader({ pool: apiPool, siteVersion: nextVersion, log: () => undefined });
  await activeSettings.current();
  const spend = new PostgresModelSpendStore(apiPool);
  const entitlements = new EntitlementRepository(apiPool);
  const billingPlans = readiness.billingPlans!;
  const closeBasisPoints = readiness.band.closeBasisPoints;
  const personAllowance = new FundingAwarePersonAllowanceSource({ allowances: new PostgresInternalAllowanceRepository(apiPool), entitlements, plans: billingPlans, closeBasisPoints });
  const estimator = siteAdmission.estimator!;
  const estimatorFor = async (version: number) => (await admissionCache.admissionSettingsFor(version)).estimator!;
  const askRoom = new AskRoom({ lockPool: encrypted(), spend, line: new RunWaitRepository(apiPool), estimator, estimatorFor, personAllowance, entitlements, billingPlans, funding: personAllowance,
    dailyCeilingMicros: money.siteCostEnvelopePolicy.dailyCeilingMicros, closeBasisPoints, waitingLinePerPerson: readiness.band.waitingLinePerPerson,
    gate: new PostgresAskAdmissionGate({ releaseKey: environment.RELEASE_KEY, hosted: false, siteVersion: nextVersion }) });
  const askBilling = Object.freeze({ plans: billingPlans, funding: personAllowance, entitlements, coarseFit: Object.freeze({ personAllowance, spend, estimator, estimatorFor }), clock: () => new Date() });
  const previewTeamUserIds: string[] = [];
  /** What the API handed the job system: the runner's work, in order. `settle` takes it. */
  const queue: { runId: string; workItemId: string }[] = [];
  const dispatcher: Dispatcher = { dispatch: async (job) => { queue.push({ ...job }); } };
  const runSettings = { ...admissionSettingsOfVersion(siteAdmission), previewTeamUserIds, strangerSampleRate: settings.strangerSampleRate, releaseKey: environment.RELEASE_KEY,
    batteryVersion: settings.batteryVersion, settlementWatchHandle: settings.settlementWatchHandle, room: askRoom, waitingLine: askRoom, billing: askBilling, resolveDiscoveredPanel: resolveProviderPanel,
    admissionSettings: { activeSettingsVersion: () => activeSettings.current(), admissionSettingsFor: async (version: number) => admissionSettingsOfVersion(await admissionCache.admissionSettingsFor(version)) } } as unknown as RunCreationSettings;
  const application = new PostgresAskApplication(apiPool, dispatcher, runSettings, undefined, encrypted(), Object.freeze({ server: encrypted(), legacy: encrypted() }));
  const storyRepository = new StoryRepository(apiPool);
  const mapViews = new RepositoryAnswerMapViewApplication(new MapChoiceRepository(apiPool), runOwnerCheckFrom((text, values) => apiPool.query<{ owned?: boolean; run_id?: string }>(text, values)));
  const hasher = { hash: () => "sha256:0" } as never;
  const publications = new PostgresPublicationApplication(new PostgresPublicationRepository(apiPool, hasher), new PublicationCipher(new MemoryPublicationKeyStore(loadKek(generateDek()))), undefined,
    new PostgresPublicationRepository(apiPool, hasher), new RepositoryPublicationStoryReader(storyRepository), mapViews, { ownReleaseKey: environment.RELEASE_KEY, readRunReleaseKey: (runId) => application.readRunReleaseKey(runId) }, {
      readUpdates: (ref) => new PostgresPublicDebateRunnerRepository(apiPool).readPageUpdates(ref),
      readReports: (ref) => new PostgresPublicPageRepository(apiPool).readReports(ref),
      authorNameGone: (ref) => new PostgresPublicDebateRunnerRepository(apiPool).isAuthorNameGone(ref),
      readOverlay: (ref) => new PostgresPublicReviewRepository(apiPool).readOverlay(ref),
      isHeld: (ref) => new PostgresPublicReviewRepository(apiPool).isHeld(ref)
    });
  /** The publication content check: scripted, by default allowing all; a test sets `refuseContent`. */
  const content: { refuse: (snapshot: PublicDebate) => boolean } = { refuse: () => false };
  const contentCheck: PublicationContentCheck = { check: async ({ snapshot }) => content.refuse(snapshot)
    ? { outcome: "REFUSE", reason: "CONTENT" } as never : { outcome: "ALLOW" } };
  /** The Report button's judge: the framing and the reading are the shipped code's, the judge's reply is the test's. */
  const flag: { reply: (packetText: string) => string } = { reply: () => JSON.stringify({ verdict: "NOT_FOUND", reason: null, quote: null }) };
  const flagJudge: PublicationJudgePort = { providerRef: "r22-world-judge", modelId: "r22-world-model",
    complete: async (input: Readonly<{ packet: unknown }>) => ({ text: flag.reply(JSON.stringify(input.packet)), usage: { input_tokens: 10, output_tokens: 5, cost_usd: 0 } }) } as never;
  const investigations = new PostgresInvestigationRepository(apiPool);
  const accountMemory = accountMemoryStoreFrom((text, values) => apiPool.query(text, values));
  const identities: TestHttpIdentity[] = [];
  const sessions = testSessionApplication(identities);
  const abuseLimits = await readAbuseLimits(apiPool, nextVersion);
  const askClarify = createAskClarify({ limits: abuseLimits.askClarify,
    transportFor: askClarifyTransportFor(await questionLanguageSiteRoute({ mode: environment.DEPLOYMENT_MODE, policy: ASK_CLARIFY_ROUTE_POLICY, dayCeilingMicros: money.siteCostEnvelopePolicy.dailyCeilingMicros,
      previewGate: gate, previewFetch, readCredential: () => { throw new TypeError("R22_NO_CREDENTIAL"); }, spend: { writerPresent: async () => true, record: async () => undefined },
      daySpentMicros: (day: string) => new PostgresModelSpendStore(apiPool).readDaySpentMicros(day), report: () => undefined } as never)),
    record: (entry) => recordAskClarifyCharge(apiPool, entry), reserve: (entry) => reserveAskClarifyCharge(apiPool, entry), clock: () => new Date(), report: () => undefined });
  const api: FastifyInstance = buildApi({
    questionCheck: questionCheckPass, previewProviderTestConfig: siteAdmission.previewConfig!, previewTeamUserIds, application, sessions, allowedOrigin: TEST_APP_ORIGIN,
    stories: new RepositoryAnswerStoryApplication(storyRepository), disclosures: new RepositoryAnswerDisclosureApplication(new ServeDisclosureRepository(apiPool)), mapViews, accountMemory,
    digModel: new PostgresDigModelRepository(apiPool), investigations,
    investigationReports: { reports: new PostgresInvestigationReportRepository(apiPool), investigations, owns: async (ownerRef: string, runId: string) => (await accountMemory.readLastVisit(ownerRef, runId)) !== null,
      openRootContent: investigationReportContentOpener(apiPool) },
    webResearched: { record: (ownerRef: string, runId: string, pageId: string) => new PostgresWebResearchedRepository(apiPool).record(ownerRef, runId, pageId),
      markActivity: async (ownerRef: string, runId: string) => { if (await investigations.open(ownerRef, runId) !== null) await investigations.touch(ownerRef, runId); } },
    digPicks: new PostgresDigPicksRepository(apiPool), purposeLines: postgresPurposeLines(apiPool),
    // The settlement on the same pool: the harness's login is a superuser, so it holds the cross-account marker that 0171 makes it need (main.ts: X38).
    publicFlags: { limits: abuseLimits.publicFlag, repository: new PostgresPublicFlagRepository(apiPool), settlement: new PostgresPublicFlagRepository(apiPool), judge: () => flagJudge,
      seal: (ref: string, runId: string, value: unknown) => publications.withReviewKey(ref, runId, (each) => each.encrypt(value)), readPublicDebate: (ref: string) => publications.readPublicDebate(ref) },
    publicTree: { pool: apiPool, tree: new PostgresPublicTreeRepository(apiPool), contributions: new PostgresPublicDebateRepository(apiPool), readPublicDebate: (ref: string) => publications.readPublicDebate(ref) },
    askClarify, monthRoom: askRoom,
    continuedRunWake: continuedRunWake({ claimableWorkItemOf: (runId) => new WorkItemRepository(apiPool).claimableWorkItemOfRun(runId), dispatch: (job) => dispatcher.dispatch(job) }),
    runHandover: runHandoverOf({ ownReleaseKey: environment.RELEASE_KEY, readRunReleaseNow: (runId) => new PostgresDigModelRepository(apiPool).readRunReleaseNow(runId),
      versionPassed: (version) => settingsVersionPassed(apiPool, environment.RELEASE_KEY, version), activeVersion: () => readActiveSettingsVersionOn(apiPool, nextVersion),
      resumeInRelease: (ownerRef, runId, releaseKey, registerVersion) => new PostgresDigModelRepository(apiPool).resumeInRelease(ownerRef, runId, releaseKey, registerVersion) }),
    admissionView: createAdmissionView({ activeSettingsVersion: () => activeSettings.current(), admissionSettingsFor: (version) => admissionCache.admissionSettingsFor(version), fallback: siteAdmission, log: () => undefined }),
    askRoom, askBilling, releaseKey: environment.RELEASE_KEY, publications, publicationContentCheck: contentCheck
  } as never);
  await api.listen({ host: "127.0.0.1", port: 0 });
  const base = `http://127.0.0.1:${String((api.server.address() as AddressInfo).port)}`;

  // THE RUNNER, by the practice's composition (kept equal to the runner's main.ts by the drift test), with the stand-in in the search gate's place.
  const standIn = practiceWithSearchStandIn(environment, budgetPorts, search);
  const composed = await composePracticeRunner({ pool: runnerPool, environment: standIn.environment, budgetPorts: standIn.budgetPorts, remaining, keepAlivePool: encrypted(),
    wait: async () => undefined, sleep: async () => undefined, storyLog: (event, detail) => { log(`story ${event} ${JSON.stringify(detail)}`); } });
  const members = [composed.providerTopology.primary, ...(composed.providerTopology.critique === undefined ? [] : [composed.providerTopology.critique]), ...composed.providerTopology.additionalMakers];
  const runnerLog = (event: string, detail: Record<string, unknown>): void => { log(`runner ${event} ${JSON.stringify(detail)}`); };
  const pathRewrite = composePathRewrite({ pool: runnerPool, targets: composed.providerTargets, members, log: runnerLog })!;
  // As apps/runner/src/main.ts: each target's price on the site's own map, the closing's reserve from the plans.
  const closingPrices = buildProviderPriceMap(composed.providerTargets, environment.DEPLOYMENT_MODE);
  const prices = (providerRef: string) => closingPrices.get(providerRef) ?? null;
  const reserves = closingReservesOf(billingPlans) ?? { paid: 0, free: 0 };
  const investigationClose = composeInvestigationClose({ pool: runnerPool, targets: composed.providerTargets, members, reserveMicros: reserves, priceOf: prices, log: runnerLog })!;
  const publicReports = composePublicReport({ pool: runnerPool, targets: composed.providerTargets, members, reserveMicros: reserves, priceOf: prices, log: runnerLog });

  // One pass of what the two servers do on their timers.
  const publicPage = new PostgresPublicPageRepository(apiPool);
  const publicContributions = new PostgresPublicDebateRunnerRepository(apiPool);
  const publicTreeRepository = new PostgresPublicTreeRepository(apiPool);
  const ownerSession = (ownerRef: string) => ({ asker_id: `owner:${ownerRef}`, session_id: "00000000-0000-0000-0000-000000000000", caller_scope: "ASKER", ownership_provenance: "server_session", provisional_identity_model: false }) as never;
  async function serverTimers(): Promise<void> {
    await sweepPathRewrites(pathRewrite.sweep);
    await sweepTreeUpdates(pathRewrite.treeSweep);
    await sweepInvestigationClosings(investigationClose);
    await sweepPublicTree({ ...pathRewrite.publicTree, reports: publicReports, staleMs: 0 });
    await sweepPublicPage({ pool: apiPool, page: publicPage, contributions: publicContributions, tree: publicTreeRepository, contentCheck, reportContentCheck: contentCheck,
      withPublicationKey: (ref, use) => publications.withPublicationKey(ref, use) });
    await sweepFreePublications({ contributions: publicContributions, publishOne: async (waiting) => {
      const owner = await publicPage.readFreeOwner(waiting.run_id);
      if (owner === null) return "NOT_WAITING";
      const ownership = { ownerRef: owner.owner_ref, legacyAskerId: null };
      const lease = { run: <T>(use: () => Promise<T>) => application.withContentLease(waiting.run_id, use), readAnswer: () => application.readRunAnswer(waiting.run_id, ownerSession(owner.owner_ref), ownership) };
      const answer = await lease.run(lease.readAnswer);
      if (answer === null) return "NO_ANSWER_YET";
      const lines = await readPurposeLinesOf(apiPool, owner.owner_ref, waiting.run_id);
      return publications.publishFreeDebate({ runId: waiting.run_id, answer, owner: { userId: owner.user_id, ownerRef: owner.owner_ref }, purposeLines: lines, contentCheck,
        source: { ip: "", userAgent: "", requestId: "free-publication-sweep" }, lease,
        store: { prepare: (runId, ref) => publicContributions.prepareFreePublication(runId, ref),
          publish: (input) => publicContributions.publishFree({ runId: input.runId, publicationRef: input.publicationRef, grantTokenHash: input.grantTokenHash, content: input.content, presentedAt: input.presentedAt }),
          refuse: (runId) => publicContributions.refuseFree(runId) } });
    } });
  }
  /** Every queued debate to its end, in the runner's own code; the timers' passes after each. Returns each job's result. */
  async function settle(rounds = 4): Promise<readonly { runId: string; result: unknown }[]> {
    const done: { runId: string; result: unknown }[] = [];
    for (let round = 0; round < rounds; round += 1) {
      for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
        const result = await composed.runner.executeWorkItem(job.workItemId);
        done.push({ runId: job.runId, result });
        await serverTimers();
      }
      await serverTimers();
    }
    return done;
  }
  /** The browser of an account a fixture made (a team member): the same seam, its own session row, its own keys. */
  const signedIn = async (given: Readonly<{ userId: string; ownerRef: string }>): Promise<R22Account> => {
    const made = testHttpIdentity(`adopted-${randomUUID()}`);
    const identity: TestHttpIdentity = Object.freeze({ ...made, authenticated: Object.freeze({ ...made.authenticated, userId: given.userId, ownerRef: given.ownerRef,
      session: Object.freeze({ ...made.authenticated.session, asker_id: `owner:${given.ownerRef}` }) }) });
    await persistLiveSession(database.pool, identity);
    userIds.set(given.ownerRef, given.userId);
    await userDeks.store(given.userId, generateDek());
    identities.push(identity);
    previewTeamUserIds.push(given.userId);
    return browserOf(identity, given.userId, given.ownerRef, given.userId);
  };
  const browserOf = (identity: TestHttpIdentity, userId: string, ownerRef: string, pseudonym: string): R22Account => {
    const headers = testSessionHeaders(identity, true);
    // The browser's request as the /api proxy forwards it: the two session cookies, the page's origin and the CSRF header; no bearer.
    const send = ((input: string | URL, init?: RequestInit) => {
      const merged = new Headers(init?.headers);
      for (const [name, value] of Object.entries(headers)) if (name !== "x-csrf-token") merged.set(name, value);
      return fetch(String(input), { ...init, headers: merged });
    }) as typeof fetch;
    const client = createContractClient(base, send, { mode: "cookie", csrfToken: () => identity.rawCsrfToken });
    return Object.freeze({ identity, userId, ownerRef, pseudonym, client, send });
  };
  const account = async (label: string, plan: "FREE" | "PLUS" | "PRO" | "MAX" = "FREE"): Promise<R22Account> => {
    const identity = testHttpIdentity(`${label}-${randomUUID()}`);
    const { userId, ownerRef } = identity.authenticated;
    const pseudonym = `name-${userId.slice(0, 8)}`;
    await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at)
      VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`, [userId, randomBytes(32), pseudonym, randomUUID(), ownerRef]);
    await persistLiveSession(database.pool, identity);
    userIds.set(ownerRef, userId);
    await userDeks.store(userId, generateDek());
    identities.push(identity);
    previewTeamUserIds.push(userId);
    if (plan !== "FREE") await seedNetopiaSubscription(database.pool, { ownerRef, planId: plan, activatedAt: new Date(Date.now() - 60_000), taxCountry: "RO" });
    return browserOf(identity, userId, ownerRef, pseudonym);
  };
  /** A signed-out reader: no cookies. */
  const stranger = createContractClient(base, fetch, { mode: "cookie", csrfToken: () => null });
  /** The public page as the review read sees it, for the staff seam (tests/integration/public-tree-flow.test.ts's). */
  const withReviewKey = publications.withReviewKey.bind(publications);
  return {
    base, database, apiPool, runnerPool, stubs, search, queue, content, flag, account, signedIn, stranger, settle, composed, askRoom, publications, nextVersion, environment, withReviewKey, api, identities,
    setScript: (next: R22Script | null) => { script = next; },
    async stop(): Promise<void> {
      await api.close();
      await stubs.close();
      await Promise.all(pools.map((each) => each.end().catch(() => undefined)));
      await database.stop();
      await rm(secretRoot, { recursive: true, force: true });
    }
  };
}
