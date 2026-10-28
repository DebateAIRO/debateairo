import "@debateai/obs-capture/install/runner";
import { Hatchet } from "@hatchet-dev/typescript-sdk";
import {
  configureCustodyGroup,
  ContentCipher,
  FileRunContentKeyStore,
  FileUserDekStore,
  loadKekRing,
  readCustodyAuthorizationHeader
} from "@debateai/crypto";
import { configureContentEncryption, createPool, RUNNER_CAPACITY, RUNNER_DATABASE_POOLS, RunRepository } from "@debateai/db";
import { createTerminalActivationEvaluator, WorkItemRepository } from "@debateai/battery";
import { releaseTaskName, TypedDomainError } from "@debateai/kernel";
import {
  assertHostedCostEnvelopesSealed,
  loadRunnerEnvironment,
  effectiveCallConcurrency,
  readCallConcurrencyPolicy
} from "@debateai/register";
import {
  type CostEnvelopePhase,
  type SharedWallApplication
} from "@debateai/budget";
// ONE line on purpose: `tests/architecture/dev-runner-provider-set.test.ts` pins this
// import line so `probeTarget` — the persisting probe — cannot enter this module under
// any local name (codex r2 B1). A multi-line import hides the specifiers from that pin.
import { createPreviewGuardedFetch, createPreviewBudgetRpcPorts, createPreviewBusyCoordinator, previewRunResilience, withPreviewProviderCallPolicy, previewProbeControls, previewSealedRoleFallbackCovered, previewTargetGatewayControls, PREVIEW_GLM_DEADLINE_MS, observeClaimTimeTarget, providerTargetGatewayControls, providerTargetPrice, resolveProviderTargetCredentials, previewStructureRepairRoute, previewStructureRepairCeiling, withStructureRepair, previewFinalWriterTierUnreadLine, type PreviewFinalWriterTierUnread, type ProviderGateway } from "@debateai/providers";
import {
  STORY_SHAPES_DIR_ENV_KEY,
  StoryWriter,
  loadStoryPack,
  resolveStoryPackDir,
  type StoryPack
} from "@debateai/story";
import { buildProviderPriceMap, createPostgresProviderGateway, declareHatchetWalkingSkeletonTask, logBodyCostFallback, logServeDisclosure, WalkingSkeletonRunner } from "./index.js";
import { createCallScheduler, type CallSubject } from "./call-scheduler.js";
import { applyPreviewGateCapacities, previewCallSubjects, previewGateRemainingReaders, structureRepairThroughLane, targetCallSubjects } from "./call-lane-gateway.js";
import { createRunInFlight } from "./run-in-flight.js";
import { createRunnerSettingsCache, createRunSettingsVersions, loadRunnerVersionSettings, preloadRunnerSettings, readRunnerSiteContext, runCostEnvelopeGuardOf, runnerSettingsLine, runnerSettingsOfVersion, runPreviewThinkingLevelsOf, staleReadyDayAdmission } from "./run-settings.js";
import {
  assertRunnerPrimaryProviderConfiguration,
  createRunnerProviderTopology
} from "./provider-topology.js";
import { reconcileRunnerStartupWork } from "./runner-startup-reconciliation.js";
import { startLapsedClaimResend, startStaleReadyResend } from "./runner-lapsed-resend.js";
import { postgresRunnerPreviewTeamGateStore, refusePreviewOutsiderWork } from "./runner-preview-team-gate.js";
import { announceRunnerReady } from "./runner-ready.js";
import {
  countModelCalls,
  createModelCallCounter,
  createRunnerRetirementSignal,
  createTaskExecutionCounter,
  honourStandingRetireRequest,
  postgresRunnerRetirementStore,
  RUNNER_RETIRED_PROCESS_EVENT,
  startRunnerRetirement
} from "./runner-retirement.js";

const environment = loadRunnerEnvironment();
/**
 * Addition D14-D16 (side-by-side spec §13): "is this the preview?" keys on the env's GATE part, present for every accepted
 * form (the sockets-only one too), never on a composed config: the line-up is each settings version's own
 * (`siteVersionSettings.previewConfig` below; run-settings.ts). Every gate-only helper takes this part.
 */
const previewGate = environment.PREVIEW_GATE_SETTINGS;
// V-9(c) / V-28: a hosted deployment spends money on paid vendor APIs, so it may
// not claim work until the per-run and daily cost envelopes are sealed. The seam
// is `readSealedCostEnvelopeStatus` in @debateai/register — task 11 publishes the
// rows behind it; until then hosted refuses here, before anything is opened.
// Local mode spends nothing this control could bound and is untouched.
assertHostedCostEnvelopesSealed(environment.DEPLOYMENT_MODE);
// V-19: this principal owns nothing in the user-DEK store it reads, so without
// the custody group every load below refuses. Configured before the first open
// so an unresolvable group is a boot failure, not a mid-run one.
configureCustodyGroup(environment.DEBATEAI_CUSTODY_GROUP);
// V-3 (fix wave A-C2): the runner reads the store the API writes, so it must
// hold the same ring for the length of a KEK changeover — its own copy of the
// current key and, while `KEK_PREVIOUS_PATH` is set, of the previous one.
// Absent, this is the single key it has always loaded. The runner only ever
// READS this store, so no write ever chooses between the two.
const kek = loadKekRing(environment.KEK_PATH, environment.KEK_PREVIOUS_PATH);
const pool = createPool(environment.DATABASE_URL, RUNNER_DATABASE_POOLS.runtime);
// Parallel AI calls (spec 2026-10-12 §3.6): claim renewals only, on their own two connections, so a burst of a
// debate's writes on the pool above never keeps a renewal waiting and never costs a debate its claim.
const keepAlivePool = createPool(environment.DATABASE_URL, RUNNER_DATABASE_POOLS.keepAlive);
if (environment.CONTENT_ENCRYPTION_ENABLED === "true") {
  const users = new FileUserDekStore(environment.USER_DEK_STORE_PATH!, kek);
  configureContentEncryption(pool, new ContentCipher(
    new FileRunContentKeyStore(
      environment.USER_DEK_STORE_PATH!,
      users,
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
    )
  ));
}
/**
 * Codes and ids only: a story log line never carries story or debate text. The
 * detail goes FIRST, so no detail key can overwrite the line's kind or event.
 */
const storyLog = (event: string, detail: Record<string, unknown>): void => {
  console.warn(JSON.stringify({ ...detail, kind: "DEBATEAI_STORY", event }));
};
/**
 * The shape pack is loaded ONCE, here (spec §5.1). An invalid pack never stops
 * the runner: every story is then FAILED/STORY_PACK_INVALID, and this line says
 * exactly which rule failed. ANY error counts — a typed pack refusal, an
 * unresolvable directory, or a raw file-system or URL error — so the story can
 * never stop this runner from booting. The directory comes from the runner's
 * environment shape, never from the process environment directly (the source
 * audit's law).
 */
let storyPack: StoryPack | { readonly error: string };
try {
  storyPack = loadStoryPack(resolveStoryPackDir({
    env: { [STORY_SHAPES_DIR_ENV_KEY]: environment.DEBATEAI_STORY_SHAPES_DIR },
    moduleUrl: import.meta.url
  }));
} catch (error) {
  // The rule the pack broke (a typed refusal names it), or, for a raw failure,
  // the error's own code or class name — never a file's text.
  const rawCode = typeof error === "object" && error !== null ? (error as { readonly code?: unknown }).code : undefined;
  const cause = typeof rawCode === "string" && /^[A-Z][A-Z0-9_]{0,63}$/u.test(rawCode)
    ? rawCode
    : error instanceof Error ? error.name : "UNKNOWN";
  storyPack = Object.freeze({
    error: error instanceof TypedDomainError ? `${error.code}: ${error.message}` : `STORY_PACK_UNREADABLE: ${cause}`
  });
  storyLog("STORY_PACK_INVALID", { reason: storyPack.error });
}
/**
 * Parallel AI calls (spec 2026-10-12 §3.5; ruling R15) — the calls in flight, TWO counters, never one shared: the
 * counting gateway's (each call's attempt, for the run-wide attempt ceiling) and the money guard's (each call's
 * projected micros, for the run's envelope and the shared wall). One shared counter would count a paid call's attempt
 * twice against the ceiling (run-in-flight.ts).
 */
const gatewayInFlight = createRunInFlight();
const moneyInFlight = createRunInFlight();
/**
 * R1 (final review): EVERY model call of this process in flight — the debate's, the story's, a structure repair, a
 * claim-time probe — from the ask until it settles (`countModelCalls`). The two counters above see only the calls
 * their check binds (the story's calls are under neither), so the backstop reads this one before this release ends.
 */
const modelCalls = createModelCallCounter();
/**
 * Side-by-side spec §13 (S14) — THE SITE READS, read once by `readRunnerSiteContext` (run-settings.ts), the one
 * function this boot, the preview practice and `check-version`'s runner half share: the declared provider targets with
 * the mode decision (V-9(c)), a hosted target's price (V-28) and, on the preview, the reviewed provider set (addition
 * D16), all taken on what the operator DECLARED, before any credential file is read; and, hosted only, the site's money
 * row and band, the billingPlans row (one PLANS_UNRESOLVED line when it is missing) and the money every version's guard
 * shares — one spend store, the money counter above and the B9 shared wall with the funding admission (never
 * billingPolicy, amendment A20). The release's site members, handed to the per-version loader below.
 */
const { site: runnerSite } = await readRunnerSiteContext({ pool, environment, moneyInFlight });
const { declaredProviderTargets, envelopeBand } = runnerSite;
const previewFetch = previewGate === undefined ? fetch : createPreviewGuardedFetch(createPreviewBudgetRpcPorts(previewGate));
const hatchet = new Hatchet({
  token: environment.HATCHET_CLIENT_TOKEN, host_port: environment.HATCHET_HOST_PORT,
  api_url: environment.HATCHET_API_URL, tenant_id: environment.HATCHET_TENANT_ID,
  tls_config: { tls_strategy: environment.HATCHET_TLS_STRATEGY }
});
/**
 * Side-by-side spec §13 (runner points 1, 2, 7) — ONE PER-VERSION SETTINGS LOADER. Every read of this boot that belongs
 * to a settings version (the runner policy and its prompt fingerprints, the story's rows, the preview line-up, the
 * debate shape, the engine, the preview's roster, role and scorecard checks, the run ceiling against one call, the
 * debate's call lanes) is made by `loadRunnerVersionSettings` (run-settings.ts), for the version asked, and kept in one
 * cache for the life of this process. The release's site members are read here, once, and handed in. The boot loads
 * the site version and refuses with the loader's own typed code, as before; from S6 every debate then runs on its own
 * stamped version through the same cache (`settingsForVersion` in the runner's settings below).
 */
const runnerSettings = createRunnerSettingsCache({
  load: (version) => loadRunnerVersionSettings(pool, version, runnerSite),
  log: (line) => { console.warn(JSON.stringify(line)); }
});
const siteVersionSettings = await runnerSettings.requireSettings(environment.REGISTER_VERSION);
/**
 * Side-by-side spec §13 (S6): each claimed run's version, by run id, set by the runner right after the claim; every
 * money seam below charges a call to its own run's version's guard through it (RUN_SETTINGS_VERSION_UNKNOWN otherwise).
 */
const runSettingsVersions = createRunSettingsVersions();
const runCostEnvelopeGuard = runCostEnvelopeGuardOf(runnerSettings, runSettingsVersions);
// V-9(2): each vendor's credential file, read once under the custody contract: after the settings checks above, so a
// boot they refuse (the preview's scorecard conflict among them) never reads a credential.
const providerTargets = resolveProviderTargetCredentials(
  declaredProviderTargets, readCustodyAuthorizationHeader
);
/**
 * Parallel AI calls (spec 2026-10-12 §3.2-§3.4) — THE RUNNER'S CALL SCHEDULER. One for this process: every debate opens
 * a lane in it, and every model call waits there for a slot under the register's `callConcurrencyPolicy` row (absent:
 * one call at a time per debate, today's order). On the preview each gate's own slots are read once here, from its
 * `/remaining`, so the runner never sends a gate more calls at once than it holds: the rest wait their turn instead of
 * being refused. A gate that cannot be read gets one slot and one content-free line.
 */
const runnerCallScheduler = createCallScheduler({
  policy: effectiveCallConcurrency(await readCallConcurrencyPolicy(pool, environment.REGISTER_VERSION))
});
if (previewGate !== undefined) {
  await applyPreviewGateCapacities({ scheduler: runnerCallScheduler, gates: previewGateRemainingReaders(previewGate) });
}
/**
 * Pre-flight PF-B2.3 (LG-B): each preview gate's read-only `/remaining`, by gate, for the call policy: a final writer's
 * call asks its gate once and gets the final-writer tier only when the gate serves it (a gate older than LG-B: STANDARD).
 */
const previewGateRemaining = previewGate === undefined ? {} : Object.freeze(Object.fromEntries(
  previewGateRemainingReaders(previewGate).map(({ gate, remaining }) => [gate, remaining] as const)));
/**
 * Task 4 review fix 1: ONE notice for every target's policy, so a final writer sent as STANDARD (its gate offers no
 * final-writer slots, or could not be read) is one warn line per gate and reason for this runner. Codes only.
 */
const previewFinalWriterTierUnread = (event: PreviewFinalWriterTierUnread): void => {
  console.warn(previewFinalWriterTierUnreadLine(event));
};
/** Spec §3.3 (owner ruling O4): ONE busy coordinator for every preview call of this runner, so one call probes a busy model. */
const previewBusy = createPreviewBusyCoordinator();
/**
 * V-28 (DL4-F2) — THE PER-RUN MONEY ENVELOPE, wired per target.
 *
 * HOSTED only, and the mode decided it once, in the site reads (`runnerSite.money` is null in local mode): local mode
 * is the relays and loopback model servers, which report no usage and cost no money, and V-28(3) leaves it untouched
 * with the attempt ceiling it has always had. In hosted mode `assertPricedProviderTargets` (the site reads) has already
 * refused any target with no declared price, so `providerTargetPrice` below cannot be null there — the refusal is kept
 * anyway, because a control that depends on another control having run is one edit away from being none.
 */
function targetGateway(target: (typeof providerTargets)[number]): ProviderGateway {
  const price = providerTargetPrice(target);
  if (runnerSite.money !== null && price === null) {
    throw new TypeError(`PROVIDER_TARGET_PRICE_REQUIRED:${target.providerRef}`);
  }
  const gateway = createPostgresProviderGateway(pool, {
    ...(previewGate === undefined ? {} : { fetchImplementation: previewFetch }),
    endpoint: target.baseUrl,
    model: target.model,
    maker: target.maker,
    // Model scorecard §2.2/§2.10: the levels this target can set and its window.
    ...providerTargetGatewayControls(target),
    // Contract A §2: on the preview only, max_tokens never exceeds the target's reviewed row bound.
    ...previewTargetGatewayControls(previewGate, target),
    ...(target.authorizationHeader === undefined
      ? {} : { authorizationHeader: target.authorizationHeader }),
    // Spec §3.5: this process's calls in flight count toward each run's attempt ceiling.
    inFlight: gatewayInFlight,
    ...(runnerSite.money === null || price === null ? {} : {
      // The run is not known until a work item is claimed, so the seam is built
      // per call from the run the gateway was handed. Hosted requires the vendor
      // to report usage: a call that cannot be billed cannot be bounded.
      // Task M1: the gateway also names the call's phase, so an answer-writing
      // call is held to the answer's ceiling and every other call to the body's.
      // B9: and whether the call is walled (`providerCallSharedWall`).
      // Side-by-side spec §13 (S6): every call is charged to its OWN run's version's guard (`runCostEnvelopeGuard`).
      buildCostEnvelopeSeam: (runId: string, phase: CostEnvelopePhase, sharedWall: SharedWallApplication) => runCostEnvelopeGuard(runId).providerSeam({ runId, price, requireReportedUsage: true, phase, sharedWall }),
      // Verdict story (spec §8): the story's calls spend its OWN envelope, its run's version's story ceiling. A
      // version that sealed no story ceiling refuses inside the guard (STORY_ENVELOPE_MISSING), the code the gateway
      // used to raise without a seam; the story writer refuses before that anyway (no story rows, no story).
      buildStoryCostEnvelopeSeam: (runId: string) => runCostEnvelopeGuard(runId).storySeam({ runId, price, requireReportedUsage: true })
    })
  });
  // Spec §3.4: the policy marks the gate unhealthy on its FIRST unsent refusal, before the minute's resend wait.
  // Addition D16-D18 (SA5): each call runs at its OWN debate's thinking table, read per call by its run id through the
  // run → version map (`runPreviewThinkingLevelsOf`; a call of no debate: the site version's), so a debate keeps its
  // levels through re-claims and its story (O1). The site version's composed config gives only the gate part here (its
  // table is replaced by the resolver's); it exists whenever the gate part does: the loader refuses a preview version it
  // cannot compose.
  return previewGate === undefined ? gateway : withPreviewProviderCallPolicy(gateway, siteVersionSettings.previewConfig!, target, {
    busy: previewBusy,
    onGateUnsent: (gate) => { runnerCallScheduler.markGateUnhealthy(gate); },
    gateRemaining: previewGateRemaining,
    onFinalWriterTierUnread: previewFinalWriterTierUnread,
    thinkingLevelsOf: runPreviewThinkingLevelsOf(runnerSettings, runSettingsVersions, environment.REGISTER_VERSION)
  });
}
/**
 * LG-A (spec 2026-10-15, L32; controller ruling 1, ruling R10): every target's gateway first, so the structure-repair
 * route can name the repair model's own (Haiku's, through its own gate); then every target's gateway is wrapped by
 * withStructureRepair. The route follows the preview provider config, whatever the deployment mode (the practice runs
 * hosted with it). Without that config (hosted production, local without the preview) the route is null and each
 * wrapped gateway is the gateway itself, byte for byte: today's follow-ups. The route's repair calls ask the debate's lane
 * for the repair model's slots the original call does not hold (`structureRepairThroughLane`): the owner's limits hold.
 */
const targetGateways = new Map(providerTargets.map((target) => [target.providerRef, targetGateway(target)] as const));
const structureRepairRoute = previewGate === undefined ? null : structureRepairThroughLane(
  previewStructureRepairRoute(providerTargets, (providerRef) => targetGateways.get(providerRef)), previewCallSubjects(previewGate));
// R1: every model call the runner and the story make goes through one of these members, so each is counted here, from
// the ask until it settles: the preview's one 60-second unbilled resend and a structure repair's call (the route's
// gateway is only ever called inside the call it repairs) included.
const providerTopology = createRunnerProviderTopology(providerTargets,
  (target) => countModelCalls(
    withStructureRepair(targetGateways.get(target.providerRef)!, structureRepairRoute), modelCalls));
const runRepository = new RunRepository(pool);
// V-20: taken on the DECLARED targets, because the three optional keys describe
// what the operator wrote, credential included — a credential resolved from a
// file was never in this environment to compare against.
assertRunnerPrimaryProviderConfiguration({
  primary: providerTopology.primary,
  firstTarget: declaredProviderTargets[0],
  declared: environment
});
/**
 * VERDICT STORY: one writer for this runner, on the runner's OWN pool (the
 * content lease is borrowed by pool identity). Its boot resolver covers every
 * configured provider, but the runner hands every run's story that run's own
 * claim-eligible providers, and that resolver REPLACES the boot one for the
 * run: a story role outside them is STORY_ROLE_UNAVAILABLE, never a fallback
 * to a provider the run's claim did not probe.
 */
const storyWriter = new StoryWriter({
  pool,
  pack: storyPack,
  // Side-by-side spec §13 (ruling R36): no boot policy. Every write carries its own debate's version's story policy
  // (WalkingSkeletonRunner's `settings.storyPolicy`, null included).
  hosted: environment.DEPLOYMENT_MODE === "hosted",
  resolveProvider: (roleRef) => {
    const member = [
      providerTopology.primary,
      ...(providerTopology.critique === undefined ? [] : [providerTopology.critique]),
      ...providerTopology.additionalMakers
    ].find((candidate) => candidate.providerRef === roleRef);
    return member === undefined ? null : { provider: member.provider, providerRef: member.providerRef };
  },
  log: storyLog
});
/**
 * The claim-time probe of one target (both claim probes below). Spec 2026-10-11 busy model §2: on the
 * preview, a gate-proven unbilled refusal gets the one 60-second resend, as at ask time, and the claim
 * keeps the LAST observation (the runner records it). Off the preview: one probe, exactly as before.
 */
function observeClaimTarget(target: (typeof providerTargets)[number]) {
  // R1: a probe is a model call through the gate too (its 60-second resend included): counted until it settles.
  const leave = modelCalls.enter();
  return observeClaimTimeTarget({
    preview: previewGate !== undefined,
    target,
    timeoutMs: previewGate === undefined ? environment.PROVIDER_PROBE_TIMEOUT_MS : PREVIEW_GLM_DEADLINE_MS,
    ...(previewGate === undefined ? {} : previewProbeControls(target)),
    fetchImplementation: previewFetch,
    clock: () => new Date()
  }).finally(leave);
}
// Side-by-side spec §3: every work repository this process builds serves only this release's work items (claims,
// renewals, the start-up re-send, failure writes), and its failure writes land only under this worker's live claim.
const workFence = Object.freeze({ releaseKey: environment.RELEASE_KEY, workerId: environment.RUNNER_WORKER_ID });
/**
 * Side-by-side spec §13 runner point 3 (S8) — THE BOOT PRELOAD: "a bad version still fails loudly at start". After the
 * site version (whose refusal refuses the boot, above), every version this release may meet is loaded through the same
 * cache before anything is claimed: its open debates' versions and every version it has a PASS verdict for — never the
 * activation pointer, which is the API's alone. Another version this release cannot run prints its one loud
 * DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED line and the boot goes on (its debates are set aside at claim, S7). A database
 * failure refuses the boot (S8 ruling: at boot the database must work). Before the team gate and the worker: nothing is
 * claimed until it has run. Summed up after the ready line (DEBATEAI_RUNNER_SETTINGS).
 */
const runnerSettingsPreload = await preloadRunnerSettings({
  cache: runnerSettings, pool, work: new WorkItemRepository(pool, workFence),
  releaseKey: environment.RELEASE_KEY, siteVersion: environment.REGISTER_VERSION
});
// Side-by-side spec §4 (D1): this process's running tasks (each whole task, the verdict story included) and its two
// retirement stops (claims, then new model calls), both off until this release retires.
const executions = createTaskExecutionCounter();
const retirementSignal = createRunnerRetirementSignal();
const runner = new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {
  workerId: environment.RUNNER_WORKER_ID, claimMs: environment.CLAIM_MS, claimMarginMs: environment.CLAIM_MARGIN_MS,
  // Side-by-side spec §3: the runner runs only this release's debates; another release's is NO_WORK.
  releaseKey: environment.RELEASE_KEY,
  // Side-by-side spec §4: a retiring release stops claiming and starts no new model call (RUNNER_RETIRING).
  retirement: retirementSignal,
  // Side-by-side spec §13 runner point 7: every debate member of the site version, written once (run-settings.ts).
  ...runnerSettingsOfVersion(siteVersionSettings),
  // Side-by-side spec §13 (S6): and every debate runs on its OWN stamped version, through the loader's cache, with
  // its run → version map (the money seams above read it).
  settingsForVersion: (version) => runnerSettings.settingsFor(version),
  runSettingsVersions,
  providerRef: providerTopology.primary.providerRef, maker: providerTopology.primary.maker,
  ...(providerTopology.critique === undefined
    ? {} : { critique: providerTopology.critique }),
  additionalMakers: providerTopology.additionalMakers,
  maxRecompose: environment.MAX_RECOMPOSE,
  judgementNumberKind: environment.JUDGEMENT_NUMBER_KIND, judgementProducer: environment.JUDGEMENT_PRODUCER,
  propagationNumberKind: environment.PROPAGATION_NUMBER_KIND,
  propagationProducer: environment.PROPAGATION_PRODUCER,
  resolveTerminalActivations: createTerminalActivationEvaluator(pool),
  // T3C / F34 (ruling J20): DR-182 VROW-5's claim-time health re-probe. Without
  // this the runner's probe block is skipped entirely — a member pinned at ask
  // time that has since gone absent is trusted, the panel is never revised, and
  // no CLAIM_PANEL_REVISED disclosure is emitted. That is a SILENT degradation,
  // which the Scope law forbids.
  //
  // It is the SAME probe the API runs at ask time (moved to @debateai/providers
  // by J21 so there is exactly one implementation), and it is immediate: VROW-5
  // asks for one no-hold check at claim, so no freshness window is consulted.
  // A member with no configured target is ABSENT with the reason the runner
  // already understands, never a silent pass.
  claimTimeProbe: async (member) => {
    const target = providerTargets.find((candidate) => candidate.providerRef === member.provider_ref);
    if (target === undefined) {
      return { state: "ABSENT" as const, modelId: null, failureCode: "CLAIM_GATEWAY_UNRESOLVED" };
    }
    // OBSERVE only. The runner persists the claim-time verdict itself in both
    // arms (DR-182), so a persisting probe here would write the same re-probe
    // twice under two evidence refs — codex r1 B1.
    const observation = await observeClaimTarget(target);
    return {
      state: observation.state,
      modelId: observation.modelId,
      failureCode: observation.failureCode
    };
  },
  // Verdict story (spec §3): written after each settled debate; never inside it.
  story: storyWriter,
  // Engine money rule, Task M3 (spec §14.4.2): each target's price, so an
  // answer-writing call refused for money tries the cheaper claim-eligible
  // makers first. Hosted only (local mode's map is empty); never sealed.
  providerPrices: buildProviderPriceMap(providerTargets, environment.DEPLOYMENT_MODE),
  // LG-A (Task 14 carry): when the route is wired, root 0's room adds the structure-repair call to its first attempt
  // and its retry (the sum: refused-repair salvage B is root 0's own second POST after the repair call).
  structureRepairCeiling: previewStructureRepairCeiling(structureRepairRoute),
  // B9 (budget spec §2.9, §2.4): a call while arguing refused for money moves
  // to a cheaper claim-eligible maker — hosted, and only with the
  // costEnvelopePolicy row's three band members: the same `envelopeBand` that
  // builds the shared wall's site-day half. (The wall's person half is on
  // whenever hosted; without the band nothing moves.)
  bodyCostFallback: envelopeBand !== null,
  // Engine money rule, Task M3 (spec §14.4.5): the row goes to the runner's own
  // pool (the default store); a failure to write it is the runner's one
  // code-only DEBATEAI_SERVE_DISCLOSURE line, named here so the shipped wiring
  // says where it goes.
  serveDisclosure: { log: logServeDisclosure },
  // B9 (budget spec §2.9, §2.12): each moved call's owner record goes to the
  // runner's own pool (the default store, B8's RunCostSubstitutionRepository);
  // the moved call and a failed write are the runner's content-free
  // DEBATEAI_BODY_COST_FALLBACK lines, named here so the shipped wiring says
  // where they go.
  costSubstitutions: { log: logBodyCostFallback },
  claimTimeSynthesisRoleProbe: async (providerRef) => {
    const target = providerTargets.find((candidate) => candidate.providerRef === providerRef);
    if (target === undefined) {
      return { state: "ABSENT" as const, modelId: null, failureCode: "CLAIM_GATEWAY_UNRESOLVED" };
    }
    // The same target probe validates the configured model identity. The runner
    // persists this observation separately from the selected debate panel.
    const observation = await observeClaimTarget(target);
    return { state: observation.state, modelId: observation.modelId, failureCode: observation.failureCode };
  },
  // Role rotation, Task 11: a sealed answer role stands in for an unavailable pinned member only when the debate's
  // estimate covers it. On the preview the rotated estimate prices only the panel's members; off the preview the
  // estimate prices the sealed roles as for any debate (no setting: always covered). Everywhere (Task 12) the runner
  // also requires the stand-in to be one of the debate's panel refs.
  // Run resilience (spec docs/superpowers/specs/2026-10-12-preview-run-resilience-design.md; ruling R-c): on the
  // preview only, each maker's own attempt allowance at re-claim, a busy member or an unavailable gate sitting out
  // the rest of the run, and the answer and story roles moving on from it (ROLE_UNAVAILABLE). Off the preview the
  // setting is absent and the runner is today's.
  ...(previewGate === undefined ? {} : { runResilience: previewRunResilience(previewGate)! }),
  // Parallel AI calls (spec 2026-10-12 §3.2, §3.6): every debate's calls through its lane of the one scheduler above,
  // each provider ref's model, vendor and (preview) gate, and the claim renewals on their own pool.
  callScheduler: runnerCallScheduler,
  callSubjects: previewGate === undefined ? targetCallSubjects(providerTargets) : previewCallSubjects(previewGate),
  // Ruling R31 (preview only): a call to a busy model waits on the busy coordinator BEFORE it takes any slot.
  ...(previewGate === undefined ? {} : { callBeforeSlot: (subject: CallSubject) => previewBusy.admit(subject.model) }),
  renewals: new WorkItemRepository(keepAlivePool, workFence),
  ...(previewGate === undefined ? {} : {
    answerRoleFallbackCovered: ({ roleRef, panel }: Readonly<{ roleRef: string; panel: readonly Readonly<{ provider_ref: string; model_id: string }>[] }>) =>
      previewSealedRoleFallbackCovered(roleRef, panel)
  }),
  holdRecorder: {
    countCooldownHolds: (runId) => runRepository.countCooldownHolds(runId),
    record: (event) => runRepository.recordRunLifecycleEvent({
      runId: event.runId,
      kind: event.kind,
      value: {
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
  }
});
// Side-by-side spec §2: each release listens, and re-sends its own open work, under its own Hatchet task
// (`<base>-<release key>`). One shared name would let two live releases take each other's debates and flip each
// other's retries between two codes; the `legacy` key keeps the bare base name (today's single task).
const taskName = releaseTaskName(environment.HATCHET_WORKFLOW_NAME, environment.RELEASE_KEY);
const task = declareHatchetWalkingSkeletonTask({ client: hatchet, runner,
  ...(previewGate === undefined ? {} : { previewExecutionTimeout: "3600s" as const }),
  // Side-by-side spec §3: a failed task records FAILED only on this release's item, under this worker's own live claim.
  failures: new WorkItemRepository(pool, workFence),
  // Side-by-side spec §4: every task counted while it runs, the story included.
  executions,
  workflowName: taskName, engineRetries: environment.HATCHET_ENGINE_RETRIES });
// Step 1 (GAP-RUNNER): on the private preview, every open job no team member owns is recorded
// FAILED (RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY) BEFORE this worker exists, so neither the start-up
// re-dispatch below nor an older job-system dispatch can run it. Off the preview: no read.
await refusePreviewOutsiderWork({
  previewConfigured: previewGate !== undefined,
  teamUserIds: environment.PREVIEW_TEAM_USER_IDS,
  // Side-by-side spec §3: this release's jobs only (its live-outsider refusal and its 100 cap included).
  ...postgresRunnerPreviewTeamGateStore(pool, environment.RELEASE_KEY),
  log: (line) => console.warn(JSON.stringify(line))
});
// Connection budget (2026-10-10, owner ruling): at most 8 debates at once, each
// holding two of the pool's connections; the rest wait in Hatchet's queue
// (packages/db/src/pool-budget.ts). Unset, Hatchet hands one worker 100.
const worker = await hatchet.worker(environment.HATCHET_WORKER_NAME, { slots: RUNNER_CAPACITY.concurrentRuns });
await worker.registerWorkflows([task]);
const retirementStore = postgresRunnerRetirementStore(pool, workFence);
// X2 (final review): one read of this release's facts BEFORE the worker starts. Under a standing retire request on a
// DRAINING release (a restart mid-drain) both stops are on before the first claim, so nothing is claimed or paid for
// before the backstop's first pass, and the start-up re-send is skipped (it would only hand back work to refuse).
const retireRequestStanding = await honourStandingRetireRequest({
  releaseKey: environment.RELEASE_KEY,
  store: retirementStore,
  signal: retirementSignal,
  log: (line) => console.warn(JSON.stringify(line))
});
const started = worker.start();
await worker.waitUntilReady(30_000);
const startupReconciliation = retireRequestStanding
  ? Object.freeze({ dispatched: 0 })
  : await reconcileRunnerStartupWork({
    work: new WorkItemRepository(pool, workFence),
    dispatcher: {
      dispatch: async ({ runId, workItemId }) => {
        await hatchet.runNoWait(taskName, { runId, workItemId }, {
          additionalMetadata: {
            v3RunId: runId,
            v3WorkItemId: workItemId,
            sourceOfRecord: "core.work_item",
            dispatchSource: "runner-startup-reconciliation"
          }
        });
      }
    },
    // NV-25: more open work than one start hands over is said in one content-free line; the start goes on.
    log: (line) => console.warn(JSON.stringify(line))
  });
announceRunnerReady({
  kind: "DEBATEAI_RUNNER_READY",
  worker: environment.HATCHET_WORKER_NAME,
  registerVersion: String(environment.REGISTER_VERSION),
  // Side-by-side spec §1: the ready line names the release this runner runs as.
  releaseKey: environment.RELEASE_KEY,
  startupDispatched: startupReconciliation.dispatched
});
// Side-by-side spec §13 runner point 3 (S8): what the boot preloaded, content-free, right after the unchanged ready line.
process.stdout.write(runnerSettingsLine(runnerSettingsPreload));
// Side-by-side spec §2 (plan B D4): every five minutes this release re-sends its own lapsed CLAIMED items (a copy that
// died mid-debate) under its own task name, not only at a fresh start; none while it retires (claims stopped, §4).
const lapsedResend = startLapsedClaimResend({
  work: new WorkItemRepository(pool, workFence),
  dispatch: async ({ runId, workItemId }) => {
    await hatchet.runNoWait(taskName, { runId, workItemId }, {
      additionalMetadata: {
        v3RunId: runId,
        v3WorkItemId: workItemId,
        sourceOfRecord: "core.work_item",
        dispatchSource: "runner-lapsed-resend"
      }
    });
  },
  paused: () => retirementSignal.claimsStopped(),
  // R2 (final review): never an item a task of this process still runs (it would come back here as a second copy).
  running: (workItemId) => executions.isWorkingOn(workItemId),
  log: (line) => console.warn(JSON.stringify(line))
});
// NV-25 (security audit run 3): a READY job Hatchet gave up after its 30-minute queue wait is handed over again by this
// release's runner, once the run's own daily guard has admitted it again and only into this worker's free places (the
// lapsed re-send above takes lapsed claims only). Not started on the private preview, whose start-up gate is the only
// team check the runner makes.
const staleReadyResend = previewGate === undefined
  ? startStaleReadyResend({
    work: new WorkItemRepository(pool, workFence),
    admit: staleReadyDayAdmission({ cache: runnerSettings, hosted: environment.DEPLOYMENT_MODE === "hosted" }),
    capacity: () => RUNNER_CAPACITY.concurrentRuns - executions.count(),
    dispatch: async ({ runId, workItemId }) => {
      await hatchet.runNoWait(taskName, { runId, workItemId }, {
        additionalMetadata: {
          v3RunId: runId,
          v3WorkItemId: workItemId,
          sourceOfRecord: "core.work_item",
          dispatchSource: "runner-stale-ready-resend"
        }
      });
    },
    paused: () => retirementSignal.claimsStopped(),
    running: (workItemId) => executions.isWorkingOn(workItemId),
    log: (line) => console.warn(JSON.stringify(line))
  })
  : undefined;
// Side-by-side spec §4: every 60 s this runner reads its release's facts in one snapshot; once it is DRAINING, its
// front pair stopped, none of its work is READY or CLAIMED and no task of it runs, it says DEBATEAI_RUNNER_RETIRED
// (stdout and the in-process event the preview launcher hears) BEFORE it stops the worker, so main ends as asked.
const retirement = startRunnerRetirement({
  releaseKey: environment.RELEASE_KEY,
  store: retirementStore,
  executions,
  // R1: the backstop never retires under a model call still in flight.
  calls: modelCalls,
  signal: retirementSignal,
  // R4 (final review): worker.stop() resolves once Hatchet has waited for every task, so both pools end then and no
  // database connection keeps a retired runner's process up: on the public server, which has no launcher, it exits by
  // itself, without process.exit. Never after `await started` below: Hatchet ends that listener BEFORE its running
  // tasks finish, and a planned stop (SIGTERM) leaves the exit to Hatchet itself once they have. allSettled: a pool
  // that fails to end never turns a clean retirement into RETIREMENT_STOP_FAILED. The Hatchet client's own connections
  // are the SDK's; a live-handle check needs Hatchet and Postgres running, so the unit test pins this wiring instead.
  stopWorker: async () => {
    lapsedResend.stop();
    staleReadyResend?.stop();
    await worker.stop();
    await Promise.allSettled([pool.end(), keepAlivePool.end()]);
  },
  log: (line) => console.warn(JSON.stringify(line)),
  announce: (line) => process.stdout.write(line),
  emit: (payload) => (process as NodeJS.EventEmitter).emit(RUNNER_RETIRED_PROCESS_EVENT, payload)
});
await started;
// The worker ended (retired, or stopped by a signal): no further re-send pass or retirement read.
lapsedResend.stop();
retirement.stop();
staleReadyResend?.stop();
