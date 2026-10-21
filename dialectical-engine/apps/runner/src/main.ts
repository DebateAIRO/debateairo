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
import { configureContentEncryption, createPool, EntitlementRepository, PostgresInternalAllowanceRepository, RUNNER_CAPACITY, RUNNER_DATABASE_POOLS, RunRepository } from "@debateai/db";
import { BillingPersonAllowanceSource } from "@debateai/billing-core";
import { FundingAwarePersonAllowanceSource } from "@debateai/billing-core";
import { createTerminalActivationEvaluator, WorkItemRepository } from "@debateai/battery";
import { TypedDomainError } from "@debateai/kernel";
import {
  assertHostedCostEnvelopesSealed,
  costEnvelopeBand,
  costEnvelopeCeilings,
  loadRunnerEnvironment,
  readBillingPlans,
  readCostEnvelopePolicy,
  readEngineVersion,
  readModelScorecard,
  readStoryPolicyFromRegister,
  effectiveCallConcurrency,
  readCallConcurrencyPolicy
} from "@debateai/register";
import {
  CostEnvelopeGuard,
  PostgresModelSpendStore,
  assertRunCeilingCoversOneCall,
  costEnvelopeGuardPolicy,
  type CostEnvelopePhase,
  type SharedWallApplication
} from "@debateai/budget";
import { PLAN_TIER_ROSTERS, askQuestionMaxBytes } from "@debateai/contract";
import { firstCallsByPlanRoster, firstPositionCallProjections } from "@debateai/judgement";
import { firstCallPlanModels } from "@debateai/scorecard";
import { readDeploymentMakerCapability } from "@debateai/critique";
// ONE line on purpose: `tests/architecture/dev-runner-provider-set.test.ts` pins this
// import line so `probeTarget` — the persisting probe — cannot enter this module under
// any local name (codex r2 B1). A multi-line import hides the specifiers from that pin.
import { assertPreviewProviderTargets, assertPreviewRoleTargets, createPreviewGuardedFetch, createPreviewBudgetRpcPorts, createPreviewBusyCoordinator, previewRunnerPolicy, previewRunResilience, withPreviewProviderCallPolicy, previewProbeControls, previewSealedRoleFallbackCovered, previewTargetGatewayControls, PREVIEW_GLM_DEADLINE_MS, assertDeploymentProviderTargets, assertPricedProviderTargets, observeClaimTimeTarget, parseProviderDiscoveryTargets, providerTargetGatewayControls, providerTargetPrice, resolveProviderTargetCredentials, previewStructureRepairRoute, previewStructureRepairCeiling, withStructureRepair, previewFinalWriterTierUnreadLine, type PreviewFinalWriterTierUnread, type ProviderGateway } from "@debateai/providers";
import {
  STORY_SHAPES_DIR_ENV_KEY,
  StoryWriter,
  loadStoryPack,
  resolveStoryPackDir,
  type StoryPack
} from "@debateai/story";
import { assertRegisterPromptContractHashes, buildProviderPriceMap, createPostgresProviderGateway, declareHatchetWalkingSkeletonTask, logBodyCostFallback, logServeDisclosure, plansUnresolvedPersonAllowance, WalkingSkeletonRunner } from "./index.js";
import { createCallScheduler, type CallSubject } from "./call-scheduler.js";
import { applyPreviewGateCapacities, previewCallSubjects, previewGateRemainingReaders, structureRepairThroughLane, targetCallSubjects } from "./call-lane-gateway.js";
import { createRunInFlight } from "./run-in-flight.js";
import { readDebateShapeRunnerSettings } from "./debate-shape-boot.js";
import { readEngineRunnerSettings } from "./engine-boot.js";
import {
  assertRunnerPrimaryProviderConfiguration,
  createRunnerProviderTopology
} from "./provider-topology.js";
import { readDevelopmentRunnerPolicy } from "./dev-runner-policy.js";
import { reconcileRunnerStartupWork } from "./runner-startup-reconciliation.js";
import { postgresRunnerPreviewTeamGateStore, refusePreviewOutsiderWork } from "./runner-preview-team-gate.js";
import { announceRunnerReady } from "./runner-ready.js";

const environment = loadRunnerEnvironment();
const previewConfig = environment.PREVIEW_PROVIDER_TEST_CONFIG;
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
const policy = previewRunnerPolicy(await readDevelopmentRunnerPolicy(pool, environment.REGISTER_VERSION), previewConfig);
// Practice debate 3 (2026-10-12): every judge, answer-writer and answer-checker call is recorded under the register's
// prompt fingerprint, so a register that does not carry the fingerprint of a prompt this code sends refuses the start
// (REGISTER_PROMPT_CONTRACT_HASH_MISMATCH) instead of logging the new prompt under the old fingerprint.
assertRegisterPromptContractHashes(policy.hashes, environment.REGISTER_VERSION);
/**
 * VERDICT STORY (spec 2026-09-26 §9): the story's register rows are OPTIONAL.
 * A register that never sealed them — every version before this feature,
 * acceptance v3 included — reads as `null`, and each story is then written as
 * FAILED/STORY_NOT_CONFIGURED without a model call. A PARTLY sealed or
 * malformed family is logged by code and treated the same way: the story can
 * never stop this runner from claiming a debate.
 */
const storyPolicy = await readStoryPolicyFromRegister(pool, environment.REGISTER_VERSION)
  .catch((error: unknown) => {
    console.warn(JSON.stringify({
      kind: "DEBATEAI_STORY",
      event: "STORY_POLICY_UNREADABLE",
      code: error instanceof TypedDomainError ? error.code : "UNTYPED"
    }));
    return null;
  });
const storyCeilingMicros = storyPolicy?.perStoryCeilingMicros ?? null;
/**
 * Debate shape (spec 2026-10-12 §3.1, §4): the optional row (absent = today's shape, byte for byte; malformed = boot
 * refused, DEBATE_SHAPE_POLICY_INVALID) and, only with it, the sealed map contracts (DEBATE_SHAPE_MAP_HASH_UNSEALED /
 * MAP_CONTRACT_HASH_MISMATCH). A run's sizes are read from its own receipt, never from this row.
 */
const debateShape = await readDebateShapeRunnerSettings(pool, environment.REGISTER_VERSION);
/**
 * Engine redesign (spec 2026-10-15 §3.3; INTERFACE §1.5, §2.3): the optional engineVersionPolicy row (absent = engine 1,
 * today's runner byte for byte, and neither the length row nor the seal is read; malformed = boot refused,
 * ENGINE_VERSION_POLICY_INVALID) and, only with it (enabled or not), the length row's presence and the sealed
 * engineContractHash (ENGINE_REQUIRES_LENGTH_POLICY / ENGINE_CONTRACT_HASH_UNSEALED / ENGINE_CONTRACT_HASH_MISMATCH).
 * A run's engine is read from its own receipt, never from this row.
 */
const engine = await readEngineRunnerSettings(pool, environment.REGISTER_VERSION);
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
const deploymentMakers = await readDeploymentMakerCapability(pool, environment.REGISTER_VERSION);
if (environment.PROVIDER_DISCOVERY_TARGETS_JSON === undefined) {
  throw new TypeError("PROVIDER_DISCOVERY_TARGETS_REQUIRED");
}
const declaredProviderTargets = parseProviderDiscoveryTargets(
  environment.PROVIDER_DISCOVERY_TARGETS_JSON,
  deploymentMakers.configuredProviders
);
// The mode decision is taken on what the operator DECLARED, before any credential
// is resolved: that is what makes an inline `authorization_header` refusable in
// hosted mode even though a resolved target legitimately carries a header.
assertDeploymentProviderTargets(declaredProviderTargets, {
  mode: environment.DEPLOYMENT_MODE, nodeEnv: environment.NODE_ENV
});
// V-28: and a hosted DEBATE target must carry its price, or its calls cannot be
// billed against the per-run and daily envelopes. Separate from the rule above
// because the support chat's target shares that one and keeps its own accounting.
assertPricedProviderTargets(declaredProviderTargets, environment.DEPLOYMENT_MODE);
// V-9(2): each vendor's credential file, read once under the custody contract.
if (previewConfig !== undefined) {
  assertPreviewProviderTargets(previewConfig, declaredProviderTargets);
  // Every role the register names must be a declared target, or its debates would fail at claim.
  assertPreviewRoleTargets(previewConfig, declaredProviderTargets, [
    policy.synthesisRolePolicy.synthesizerRoleRef, policy.synthesisRolePolicy.evaluatorRoleRef,
    ...(storyPolicy === null ? [] : [storyPolicy.storytellerRoleRef, storyPolicy.storyCheckerRoleRef])
  ]);
  if ((await readModelScorecard(pool, environment.REGISTER_VERSION, await readEngineVersion())).state === "VALID") {
    throw new TypedDomainError("PREVIEW_SCORECARD_CONFLICT", "Preview roster cannot override a valid scorecard");
  }
}
const previewFetch = previewConfig === undefined ? fetch : createPreviewGuardedFetch(createPreviewBudgetRpcPorts(previewConfig));
const providerTargets = resolveProviderTargetCredentials(
  declaredProviderTargets, readCustodyAuthorizationHeader
);
const hatchet = new Hatchet({
  token: environment.HATCHET_CLIENT_TOKEN, host_port: environment.HATCHET_HOST_PORT,
  api_url: environment.HATCHET_API_URL, tenant_id: environment.HATCHET_TENANT_ID,
  tls_config: { tls_strategy: environment.HATCHET_TLS_STRATEGY }
});
/**
 * V-28 (DL4-F2) — THE PER-RUN MONEY ENVELOPE, wired per target.
 *
 * HOSTED only, and the mode decides it once here rather than at every call:
 * local mode is the relays and loopback model servers, which report no usage and
 * cost no money, and V-28(3) leaves it untouched with the attempt ceiling it has
 * always had. In hosted mode `assertPricedProviderTargets` above has already
 * refused any target with no declared price, so `providerTargetPrice` below
 * cannot be null there — the refusal is kept anyway, because a control that
 * depends on another control having run is one edit away from being none.
 */
const costEnvelopePolicy = environment.DEPLOYMENT_MODE === "hosted"
  ? await readCostEnvelopePolicy(pool, environment.REGISTER_VERSION)
  : null;
const modelSpendStore = new PostgresModelSpendStore(pool);
/**
 * Parallel AI calls (spec 2026-10-12 §3.5; ruling R15) — the calls in flight, TWO counters, never one shared: the
 * counting gateway's (each call's attempt, for the run-wide attempt ceiling) and the money guard's (each call's
 * projected micros, for the run's envelope and the shared wall). One shared counter would count a paid call's attempt
 * twice against the ceiling (run-in-flight.ts).
 */
const gatewayInFlight = createRunInFlight();
const moneyInFlight = createRunInFlight();
/**
 * B9 (budget spec §2.9, paid-plans spec §2.4.1–2.4.2) — THE SHARED WALL WHILE
 * ARGUING, in two independent halves, built whenever hosted.
 *
 *  · THE SITE'S DAY, only with the costEnvelopePolicy row's three band members,
 *    read by their one reader (`costEnvelopeBand`, task B1), at the band's
 *    finish edge (115%). Without the band there is no site-day wall and no body
 *    fallback (budget spec §2.4): `finishBasisPoints` is null.
 *  · THE PERSON, for every run with a charge scope (ruling R-19: the person wall
 *    applies iff the row exists), band or no band: each of the run owner's
 *    windows at its own finish edge (110%, from the plan). The owner is the one
 *    billing pinned on the run at admission (`billing.run_charge_scope`, read by
 *    the spend store); the windows come from `BillingPersonAllowanceSource`
 *    (billing-core) over the READ-ONLY entitlement port —
 *    `billing.person_windows_v`, never the lazy Free append (ruling R-12). The
 *    wall reads each window's finish edge and never its close edge, so without
 *    the band the source is built with a close edge of 10 000 (inside the range
 *    it accepts). B6 writes a charge scope only while billing is on, so under
 *    old settings the only change is one read by primary key per walled BODY
 *    call, and it finds no owner.
 *
 * Amendment A20: those two relations, the billingPlans and costEnvelopePolicy
 * rows and the pure billing-core are all this process reads of billing — never
 * billingPolicy — and a paid plan past its paid-through time already reads as
 * FREE inside the view (A8).
 *
 * A missing band or missing plans at the runner, on a run with a charge scope,
 * means the API and the runner are on different register versions (billing on
 * needs both at the API's version, A22; the runbook pins the same
 * REGISTER_VERSION in both units; a mismatch or a staggered restart breaks
 * that). The walls fail closed: without the band the person half still stands;
 * without `billingPlans` it refuses (`plansUnresolvedPersonAllowance`) every
 * walled call of such a run as the person's month, the arguing stops and the
 * answer is still written. A run with no charge scope is untouched. The boot
 * says the plans are missing once, in one content-free line.
 */
const envelopeBand = costEnvelopePolicy === null ? null : costEnvelopeBand(costEnvelopePolicy);
const billingPlans = costEnvelopePolicy === null ? null : await readBillingPlans(pool, environment.REGISTER_VERSION);
if (costEnvelopePolicy !== null && billingPlans === null) {
  console.warn(JSON.stringify({ kind: "DEBATEAI_PERSON_WALL", event: "PLANS_UNRESOLVED" }));
}
const fundingEntitlements = new EntitlementRepository(pool);
const allowances = new PostgresInternalAllowanceRepository(pool);
const selectedFunding = await allowances.readPolicy();
if (selectedFunding !== null && (environment.DEPLOYMENT_MODE !== "hosted" || envelopeBand === null || billingPlans === null))
  throw new TypedDomainError("INTERNAL_FUNDING_UNAVAILABLE","Internal funding requires hosted billing and finite envelope members");
const fundingAllowance = selectedFunding === null || billingPlans === null ? undefined : new FundingAwarePersonAllowanceSource({
  allowances,entitlements:{...fundingEntitlements.readOnlyPort(),readRunFundingBasis:(runId)=>fundingEntitlements.readRunFundingBasis(runId)},
  plans:billingPlans,closeBasisPoints:envelopeBand?.closeBasisPoints ?? 10000
});
const sharedWallTerms = costEnvelopePolicy === null
  ? null
  : Object.freeze({
      finishBasisPoints: envelopeBand === null ? null : envelopeBand.finishBasisPoints,
      persons: billingPlans === null
        ? plansUnresolvedPersonAllowance()
        : fundingAllowance ?? new BillingPersonAllowanceSource({
            entitlements: new EntitlementRepository(pool).readOnlyPort(),
            plans: billingPlans,
            closeBasisPoints: envelopeBand === null ? 10_000 : envelopeBand.closeBasisPoints
          }),
      owners: modelSpendStore
    });
const costEnvelopeGuard = costEnvelopePolicy === null
  ? undefined
  : new CostEnvelopeGuard({
      store: modelSpendStore,
      // Verdict story: the story's OWN ceiling and overrun, when the register
      // sealed them. Engine money rule, Task M7: built by the one check over
      // BOTH money rows, which refuses this boot (STORY_DAILY_CEILING_INSUFFICIENT)
      // when the day cannot hold one full run plus its story.
      policy: costEnvelopeGuardPolicy(costEnvelopePolicy, storyPolicy),
      ...(sharedWallTerms === null ? {} : { sharedWall: sharedWallTerms }),
      ...(fundingAllowance === undefined ? {} : {fundingAdmission:fundingAllowance}),
      inFlight: moneyInFlight
    });
/**
 * B9 (budget spec §2.10) — A LIMIT BELOW ONE CALL REFUSES THIS BOOT
 * (RUN_CEILING_BELOW_ONE_CALL), instead of failing a person's first debate.
 * Hosted, and only with the costEnvelopePolicy row's three band members (the
 * same `envelopeBand` that builds the shared wall's site-day half, B9b).
 * Priced per plan: the cheapest price among each plan's models, and every
 * plan's cheapest must fit.
 * Paid plans S2: while the sealed model scorecard at this register version is
 * VALID (the row the hosted API's picker reads), each plan's models are every
 * configured model, because the picker seats from all of them. Paid plans S4b:
 * with billing on the picker seats Free from the Free roster only, but this
 * process never reads billingPolicy (amendment A20), so it keeps the looser
 * all-models groups; the API's boot and the hosted publish, which know billing,
 * price Free on its own roster (`ownRosterOnly`).
 */
if (costEnvelopePolicy !== null && envelopeBand !== null) {
  const firstCalls = firstPositionCallProjections({
    targets: declaredProviderTargets,
    judgeTokenCeiling: policy.bounds.JUDGE.tokenCeiling,
    questionMaxBytes: askQuestionMaxBytes(),
    // Ruling L-B9R (P2L Task 17): with ANY debateShapePolicy row (read raw above, enabled false too: this runner still
    // finishes the shaped runs admitted before the switch), a run's first call may carry the locked language, so it is
    // priced at the longest lock too. No row: today's price.
    questionLanguageLocked: debateShape !== null
  });
  assertRunCeilingCoversOneCall({
    bodyCeilingMicros: costEnvelopeCeilings(costEnvelopePolicy).bodyMicros,
    firstCallsByRoster: firstCallsByPlanRoster({
      projections: firstCalls,
      rosters: firstCallPlanModels({
        scorecardInForce: (await readModelScorecard(pool, environment.REGISTER_VERSION, await readEngineVersion())).state === "VALID",
        rosters: PLAN_TIER_ROSTERS,
        models: firstCalls.map((call) => call.model)
      })
    })
  });
}
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
if (previewConfig !== undefined) {
  await applyPreviewGateCapacities({ scheduler: runnerCallScheduler, gates: previewGateRemainingReaders(previewConfig) });
}
/**
 * Pre-flight PF-B2.3 (LG-B): each preview gate's read-only `/remaining`, by gate, for the call policy: a final writer's
 * call asks its gate once and gets the final-writer tier only when the gate serves it (a gate older than LG-B: STANDARD).
 */
const previewGateRemaining = previewConfig === undefined ? {} : Object.freeze(Object.fromEntries(
  previewGateRemainingReaders(previewConfig).map(({ gate, remaining }) => [gate, remaining] as const)));
/**
 * Task 4 review fix 1: ONE notice for every target's policy, so a final writer sent as STANDARD (its gate offers no
 * final-writer slots, or could not be read) is one warn line per gate and reason for this runner. Codes only.
 */
const previewFinalWriterTierUnread = (event: PreviewFinalWriterTierUnread): void => {
  console.warn(previewFinalWriterTierUnreadLine(event));
};
/** Spec §3.3 (owner ruling O4): ONE busy coordinator for every preview call of this runner, so one call probes a busy model. */
const previewBusy = createPreviewBusyCoordinator();
function targetGateway(target: (typeof providerTargets)[number]): ProviderGateway {
  const price = providerTargetPrice(target);
  if (costEnvelopeGuard !== undefined && price === null) {
    throw new TypeError(`PROVIDER_TARGET_PRICE_REQUIRED:${target.providerRef}`);
  }
  const gateway = createPostgresProviderGateway(pool, {
    ...(previewConfig === undefined ? {} : { fetchImplementation: previewFetch }),
    endpoint: target.baseUrl,
    model: target.model,
    maker: target.maker,
    // Model scorecard §2.2/§2.10: the levels this target can set and its window.
    ...providerTargetGatewayControls(target),
    // Contract A §2: on the preview only, max_tokens never exceeds the target's reviewed row bound.
    ...previewTargetGatewayControls(previewConfig, target),
    ...(target.authorizationHeader === undefined
      ? {} : { authorizationHeader: target.authorizationHeader }),
    // Spec §3.5: this process's calls in flight count toward each run's attempt ceiling.
    inFlight: gatewayInFlight,
    ...(costEnvelopeGuard === undefined || price === null ? {} : {
      // The run is not known until a work item is claimed, so the seam is built
      // per call from the run the gateway was handed. Hosted requires the vendor
      // to report usage: a call that cannot be billed cannot be bounded.
      // Task M1: the gateway also names the call's phase, so an answer-writing
      // call is held to the answer's ceiling and every other call to the body's.
      // B9: and whether the call is walled (`providerCallSharedWall`).
      buildCostEnvelopeSeam: (runId: string, phase: CostEnvelopePhase, sharedWall: SharedWallApplication) => costEnvelopeGuard.providerSeam({
        runId, price, requireReportedUsage: true, phase, sharedWall
      }),
      // Verdict story (spec §8): the story's calls spend its OWN envelope. With
      // no sealed story ceiling there is no story seam, and the gateway refuses
      // a metered story call (STORY_ENVELOPE_MISSING) rather than run it unbounded.
      ...(storyCeilingMicros === null ? {} : {
        buildStoryCostEnvelopeSeam: (runId: string) => costEnvelopeGuard.storySeam({
          runId, price, requireReportedUsage: true
        })
      })
    })
  });
  // Spec §3.4: the policy marks the gate unhealthy on its FIRST unsent refusal, before the minute's resend wait.
  return previewConfig === undefined ? gateway : withPreviewProviderCallPolicy(gateway, previewConfig, target, {
    busy: previewBusy,
    onGateUnsent: (gate) => { runnerCallScheduler.markGateUnhealthy(gate); },
    gateRemaining: previewGateRemaining,
    onFinalWriterTierUnread: previewFinalWriterTierUnread
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
const structureRepairRoute = previewConfig === undefined ? null : structureRepairThroughLane(
  previewStructureRepairRoute(providerTargets, (providerRef) => targetGateways.get(providerRef)), previewCallSubjects(previewConfig));
const providerTopology = createRunnerProviderTopology(providerTargets,
  (target) => withStructureRepair(targetGateways.get(target.providerRef)!, structureRepairRoute));
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
  policy: storyPolicy,
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
  return observeClaimTimeTarget({
    preview: previewConfig !== undefined,
    target,
    timeoutMs: previewConfig === undefined ? environment.PROVIDER_PROBE_TIMEOUT_MS : PREVIEW_GLM_DEADLINE_MS,
    ...(previewConfig === undefined ? {} : previewProbeControls(target)),
    fetchImplementation: previewFetch,
    clock: () => new Date()
  });
}
const runner = new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {
  workerId: environment.RUNNER_WORKER_ID, claimMs: environment.CLAIM_MS, claimMarginMs: environment.CLAIM_MARGIN_MS,
  judgeBound: policy.bounds.JUDGE,
  composerBound: policy.bounds.COMPOSER,
  conformanceBound: policy.bounds.CONFORMANCE,
  providerRef: providerTopology.primary.providerRef, maker: providerTopology.primary.maker,
  ...(providerTopology.critique === undefined
    ? {} : { critique: providerTopology.critique }),
  additionalMakers: providerTopology.additionalMakers,
  judgeContractHash: policy.hashes.judge,
  composerContractHash: policy.hashes.composer,
  conformanceContractHash: policy.hashes.conformance,
  propagationContractHash: policy.hashes.propagation,
  serveContractHash: policy.hashes.serve,
  maxRecompose: environment.MAX_RECOMPOSE, factBundleVersion: environment.REGISTER_VERSION,
  judgementNumberKind: environment.JUDGEMENT_NUMBER_KIND, judgementProducer: environment.JUDGEMENT_PRODUCER,
  propagationNumberKind: environment.PROPAGATION_NUMBER_KIND,
  propagationProducer: environment.PROPAGATION_PRODUCER,
  resolveTerminalActivations: createTerminalActivationEvaluator(pool),
  compositionRow: policy.compositionRow,
  servePolicy: {
    compositionBudgets: policy.compositionBudgets,
    candidateConfidenceBand: policy.candidateConfidenceBand,
    bandCeiling: policy.bandCeiling
  },
  judgementPolicy: policy.judgementPolicy,
  scoringOperator: policy.scoringOperator,
  runDeathPolicy: policy.runDeathPolicy,
  hiddenNodeScoreThreshold: policy.hiddenNodeScoreThreshold,
  verdictLabelPolicy: policy.verdictLabelPolicy,
  panelPolicy: policy.panelPolicy,
  stoppingPolicy: policy.stoppingPolicy,
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
  // S6-2 / T9 (board F33 class): the SHIPPED entry point must LOAD and PASS
  // every register family the run reads. Without this line the claim-time
  // gate refuses every work item and no statement is ever synthesized.
  synthesisRolePolicy: policy.synthesisRolePolicy,
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
  ...(previewConfig === undefined ? {} : { runResilience: previewRunResilience(previewConfig)! }),
  // Parallel AI calls (spec 2026-10-12 §3.2, §3.6): every debate's calls through its lane of the one scheduler above,
  // each provider ref's model, vendor and (preview) gate, and the claim renewals on their own pool.
  callScheduler: runnerCallScheduler,
  // Debate shape (spec 2026-10-12 §3): resolved at boot above; null without the row (today's runner).
  debateShape,
  // Engine redesign (R1d): resolved at boot above; null without the engine row (engine 1, today's runner).
  engine,
  callSubjects: previewConfig === undefined ? targetCallSubjects(providerTargets) : previewCallSubjects(previewConfig),
  // Ruling R31 (preview only): a call to a busy model waits on the busy coordinator BEFORE it takes any slot.
  ...(previewConfig === undefined ? {} : { callBeforeSlot: (subject: CallSubject) => previewBusy.admit(subject.model) }),
  renewals: new WorkItemRepository(keepAlivePool),
  ...(previewConfig === undefined ? {} : {
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
const task = declareHatchetWalkingSkeletonTask({ client: hatchet, runner,
  ...(previewConfig === undefined ? {} : { previewExecutionTimeout: "3600s" as const }),
  failures: new WorkItemRepository(pool),
  workflowName: environment.HATCHET_WORKFLOW_NAME, engineRetries: environment.HATCHET_ENGINE_RETRIES });
// Step 1 (GAP-RUNNER): on the private preview, every open job no team member owns is recorded
// FAILED (RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY) BEFORE this worker exists, so neither the start-up
// re-dispatch below nor an older job-system dispatch can run it. Off the preview: no read.
await refusePreviewOutsiderWork({
  previewConfigured: previewConfig !== undefined,
  teamUserIds: environment.PREVIEW_TEAM_USER_IDS,
  ...postgresRunnerPreviewTeamGateStore(pool),
  log: (line) => console.warn(JSON.stringify(line))
});
// Connection budget (2026-10-10, owner ruling): at most 8 debates at once, each
// holding two of the pool's connections; the rest wait in Hatchet's queue
// (packages/db/src/pool-budget.ts). Unset, Hatchet hands one worker 100.
const worker = await hatchet.worker(environment.HATCHET_WORKER_NAME, { slots: RUNNER_CAPACITY.concurrentRuns });
await worker.registerWorkflows([task]);
const started = worker.start();
await worker.waitUntilReady(30_000);
const startupReconciliation = await reconcileRunnerStartupWork({
  work: new WorkItemRepository(pool),
  dispatcher: {
    dispatch: async ({ runId, workItemId }) => {
      await hatchet.runNoWait(environment.HATCHET_WORKFLOW_NAME, { runId, workItemId }, {
        additionalMetadata: {
          v3RunId: runId,
          v3WorkItemId: workItemId,
          sourceOfRecord: "core.work_item",
          dispatchSource: "runner-startup-reconciliation"
        }
      });
    }
  }
});
announceRunnerReady({
  kind: "DEBATEAI_RUNNER_READY",
  worker: environment.HATCHET_WORKER_NAME,
  registerVersion: String(environment.REGISTER_VERSION),
  startupDispatched: startupReconciliation.dispatched
});
await started;
