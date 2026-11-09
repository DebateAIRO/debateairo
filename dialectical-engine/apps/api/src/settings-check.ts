import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import { readDeploymentMakerCapability } from "@debateai/critique";
import {
  PERPLEXITY_SEARCH_VENDOR, PREVIEW_REMAINING_TIMEOUT_MS, createPreviewRemainingRpcPort, previewGateSocket, previewModelRow,
  type PreviewGateName, type PreviewGateRemaining, type PreviewGateSettings, type PreviewLineUp
} from "@debateai/providers";
import {
  DEBATE_SHAPE_PLAN_KEYS,
  assertHostedCostEnvelopesSealed,
  assertHostedSupportAdmissionSealed,
  compareSiteSettings,
  debateShapeStartStepOf,
  isSettingsCheckCode,
  normaliseDepthParamsForShape,
  readAdmissionPolicy,
  readBillingPlans,
  readBillingPolicy,
  readCostEnvelopePolicy,
  readCostEstimateStartPolicy,
  readSealedPreviewLineUp,
  readSettingsComparisonRows,
  readSettingsSeatRefs,
  readSettingsVersionFacts,
  runSettingsCheckSteps,
  settingsCheckReport,
  settingsLineUpEnvironmentCodes,
  settingsSeatableModels,
  settingsVersionKindRefusal,
  settingsVersionLineUp,
  type DebateShapePlanKey,
  type DebateShapePolicy,
  type DeploymentMode,
  type SealedPreviewLineUp,
  type QuestionLanguagePolicy,
  type SettingsCheckReport,
  type SettingsCheckStep,
  type SettingsComparisonRow,
  type SettingsVersionFacts
} from "@debateai/register";
import {
  buildAdmissionSiteContext, decideAskRoomReadiness, loadAdmissionSettings, type AdmissionSiteContext, type AdmissionVersionSettings
} from "./admission-settings.js";
import { askShapesForPanel } from "./debate-shape-ask.js";
import { engineForAsk, webSitesForAsk } from "./engine-ask.js";
import { lengthGuidanceForAsk } from "./length-guidance-ask.js";
import {
  estimatePreviewGateNeeds, previewGateEstimateNanoUsd, previewWebSearchNeed, previewWebSitesOf, type PreviewGateNeed,
  type PreviewPanelMember
} from "./preview-budget-estimate.js";
import { parseDeclaredProviderTargets } from "./provider-discovery.js";
import { questionLanguageSiteRoute, type QuestionLanguagePaidRoute } from "./question-language/boot.js";
import { newQuestionLanguageReferenceKey } from "./question-language/reference.js";

/**
 * Side-by-side spec §13 "Activation is refused unless" (S14) — CHECK-VERSION, THE API HALF: the dry boot of this
 * release's API against one sealed settings version, from the API's own folder and env (`api.env`). It makes no AI call
 * (the question-language route it builds can never send: its fetch refuses, it never reads the support key), reads no
 * credential or key file and writes nothing (S15's verdict command writes the verdict). Each step is independent, so one
 * run lists every problem:
 *  - the boot's first refusal (a hosted deployment with unsealed envelopes) and the SITE reads main.ts makes before its
 *    admission loader, in main.ts's order and through the decisions main.ts itself calls (ruling R57): the admission
 *    row's support scopes (hosted); the site's costEnvelopePolicy row (hosted); the declared targets with the mode
 *    decision and their prices (`parseDeclaredProviderTargets`); and the room's readiness (`decideAskRoomReadiness`:
 *    billing ready or refused by name, the band, the sealed askRoomReads budget), which says whether billing is on and
 *    whether the room is built. Not repeated: the waiting line's count when the band is missing (live state, not a
 *    version's) and everything main.ts reads for other parts (keys, sessions, billing connectors). The context is then
 *    built by `buildAdmissionSiteContext`, as main.ts and the practice build theirs;
 *  - the version, loaded as main.ts would admit on it (`loadAdmissionSettings`): every moved stage, the picker's
 *    scorecard-versus-targets checks (condition 3 for the seated models), the question-language boot refusals, the API's
 *    own run ceiling against one call, the estimator maximum and condition 4 (`costEnvelopeGuardPolicy`);
 *  - first of the version's own steps: it is sealed and GENERAL (a support publication or an unknown version:
 *    SETTINGS_VERSION_KIND_INVALID, and the loader and condition 2 are skipped);
 *  - condition 2: every SITE row and every MIXED row's site members equal the release's site version's
 *    (`compareSiteSettings`): each difference SETTINGS_SITE_MEMBER_DIFFERS:<row>[.<member>], a row or member this code
 *    never classified SETTINGS_ROW_UNCLASSIFIED:<row>[.<member>].
 *  - on the preview only (SA10, addition D19 and D24 item 5): the version's line-up (its row, else the env's; neither:
 *    PREVIEW_LINE_UP_REQUIRED) and condition 3 for its SEATABLE SET (both rosters, the four seats' models, the
 *    structure-repair model when a declared target serves it) against THIS API's own declared targets and `api.env`:
 *    SETTINGS_NEEDS_ENV_CHANGE:TARGET:<model> (no target of this API serves it: this is also what keeps every seatable
 *    model's company on the providers page, which lists the companies of exactly these targets) and
 *    SETTINGS_NEEDS_ENV_CHANGE:GATE_SOCKET:<provider> (its gate has no socket here). No website input: the page asks
 *    this API (D24 item 5). Condition 6's code copy (reviewed rows, menus, ceilings) is the runner half's.
 *  - V4 start step, Task 42, on the preview only, last: the start step is never switched on where it would not run
 *    (START_STEP_UNREACHABLE:<plan>:<reason>), and one debate at the widest choice fits each spending gate's daily pot
 *    (the GATE_POT_* refusals; a pot already spent today is a note, handed to `onWarning`, never a report code).
 * The condition codes are REPORT codes
 * (returned, never thrown); SETTINGS_CHECK_NO_AI_CALL, thrown by the check's never-sending fetch, is in both
 * KNOWN_DOMAIN_CODES lists (ruling R57b).
 */

/** The API env keys the check reads (a full `loadApiEnvironment()` fits). */
export type ApiCheckEnvironment = Readonly<{
  REGISTER_VERSION: number;
  RELEASE_KEY: string;
  DEPLOYMENT_MODE: DeploymentMode;
  NODE_ENV?: string | undefined;
  PROVIDER_DISCOVERY_TARGETS_JSON?: string | undefined;
  PREVIEW_GATE_SETTINGS: PreviewGateSettings | undefined;
  PREVIEW_ENV_LINE_UP?: PreviewLineUp | null | undefined;
}>;

/** A fetch the check hands the question-language route on the preview: building the route never sends, and nor can it. */
const CHECK_NEVER_SENDS: typeof fetch = async () => {
  throw new TypedDomainError("SETTINGS_CHECK_NO_AI_CALL", "check-version never calls a model");
};

/**
 * The question-language route by main.ts's own decision (`questionLanguageSiteRoute`, ruling L-ROUTE), handed parts that
 * can neither send nor spend: on the preview the guarded fetch is `CHECK_NEVER_SENDS` (PREVIEW with the Anthropic gate
 * socket, else NONE: the same route, so the same boot refusals); off the preview the hosted route runs its boot refusals
 * (an unpriced fast-check model, no day pot) and then meets "no spend record" before any key is read (NONE). The
 * reference key is per process (the check signs nothing).
 */
export function checkQuestionLanguage(environment: Pick<ApiCheckEnvironment, "DEPLOYMENT_MODE" | "PREVIEW_GATE_SETTINGS">): AdmissionSiteContext["questionLanguage"] {
  const previewGate = environment.PREVIEW_GATE_SETTINGS;
  return Object.freeze({
    routeFor: async ({ policy, dayCeilingMicros }: Readonly<{ policy: QuestionLanguagePolicy | null; dayCeilingMicros: number | null }>): Promise<QuestionLanguagePaidRoute> => questionLanguageSiteRoute({
      mode: environment.DEPLOYMENT_MODE,
      policy,
      dayCeilingMicros,
      previewGate,
      previewFetch: previewGate === undefined ? undefined : CHECK_NEVER_SENDS,
      readCredential: () => undefined,
      spend: {
        writerPresent: async () => false,
        record: async () => { throw new TypedDomainError("SETTINGS_CHECK_NO_AI_CALL", "check-version never records spend"); }
      },
      daySpentMicros: async () => 0,
      report: () => undefined
    }),
    referenceKey: newQuestionLanguageReferenceKey()
  });
}

/**
 * The API's site reads, as main.ts makes them before its admission loader, in main.ts's order (its boot stages
 * "admission-policy", "support-admission-scopes", "site-cost-envelope-policy", "deployment-makers",
 * "provider-discovery-targets", "provider-targets", "ask-room"; no boot ledger), through the decisions main.ts calls
 * (ruling R57: `parseDeclaredProviderTargets`, `decideAskRoomReadiness`, `questionLanguageSiteRoute`,
 * `buildAdmissionSiteContext`; tests/unit/settings-check.test.ts pins the remaining statements against main.ts). Not
 * repeated: the waiting line's count when the band is missing (live state, not a version's). Lines (the picker's, the
 * story's) go to standard error.
 */
export async function readAdmissionCheckSite(pool: Pool, environment: ApiCheckEnvironment): Promise<AdmissionSiteContext> {
  const admissionPolicy = await readAdmissionPolicy(pool, environment.REGISTER_VERSION);
  assertHostedSupportAdmissionSealed(environment.DEPLOYMENT_MODE, admissionPolicy);
  const siteCostEnvelopePolicy = environment.DEPLOYMENT_MODE === "hosted"
    ? await readCostEnvelopePolicy(pool, environment.REGISTER_VERSION)
    : null;
  const deploymentMakers = await readDeploymentMakerCapability(pool, environment.REGISTER_VERSION);
  if (environment.PROVIDER_DISCOVERY_TARGETS_JSON === undefined) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGETS_REQUIRED");
  }
  const declaredProviderTargets = parseDeclaredProviderTargets({
    targetsJson: environment.PROVIDER_DISCOVERY_TARGETS_JSON, configuredProviders: deploymentMakers.configuredProviders,
    mode: environment.DEPLOYMENT_MODE, nodeEnv: environment.NODE_ENV
  });
  // Fresh-site estimate (owner rulings 2026-10-22): main.ts's "cost-estimate-start-policy" stage — a SITE row, read from
  // the site version (a malformed row refuses the boot, so it fails the check too: COST_ESTIMATE_START_POLICY_INVALID).
  const costEstimateStartPolicy = environment.DEPLOYMENT_MODE === "hosted"
    ? await readCostEstimateStartPolicy(pool, environment.REGISTER_VERSION)
    : null;
  const askRoomReadiness = environment.DEPLOYMENT_MODE === "hosted" && siteCostEnvelopePolicy !== null
    ? decideAskRoomReadiness({
        envelope: siteCostEnvelopePolicy,
        admission: admissionPolicy,
        policy: await readBillingPolicy(pool, environment.REGISTER_VERSION),
        plans: await readBillingPlans(pool, environment.REGISTER_VERSION)
      })
    : null;
  return buildAdmissionSiteContext({
    pool,
    environment,
    declaredProviderTargets,
    siteCostEnvelopePolicy,
    costEstimateStartPolicy,
    askRoomReadiness,
    questionLanguage: checkQuestionLanguage(environment),
    log: (line: string) => { console.error(line); }
  });
}

/** Every read the API half makes (unit tests inject them; the defaults are the boot's own functions). */
export type AdmissionCheckReaders = Readonly<{
  readSite: (pool: Pool, environment: ApiCheckEnvironment) => Promise<AdmissionSiteContext>;
  loadVersion: (pool: Pool, version: number, site: AdmissionSiteContext) => Promise<unknown>;
  readVersionFacts: (pool: Pick<Pool, "query">, version: number) => Promise<SettingsVersionFacts | null>;
  readComparisonRows: (pool: Pick<Pool, "query">, version: number) => Promise<readonly SettingsComparisonRow[]>;
  /** SA10: the version's line-up row as sealed (shape only), or null without the row (`readSealedPreviewLineUp`). */
  readLineUp: (pool: Pool, version: number) => Promise<SealedPreviewLineUp | null>;
  /** SA10: the four seat refs the version names, by the register's own readers (`readSettingsSeatRefs`). */
  readSeatRefs: (pool: Pool, version: number) => Promise<readonly string[]>;
  /**
   * V4 start step, Task 42: the pot guard over the loaded version (`readGatePotFindings`: it asks each gate it needs
   * once, read-only). Absent: the guard is not run (a test that checks other steps).
   */
  checkGatePots?: typeof readGatePotFindings;
}>;

export const ADMISSION_CHECK_READERS: AdmissionCheckReaders = Object.freeze({
  readSite: readAdmissionCheckSite,
  // Final fix wave F9, ruling R79: B9 groups by the version's own preview rosters for ANY version checked (the runner
  // half by the same rule): the code's rosters, which no preview target serves, checked nothing on the preview.
  loadVersion: (pool: Pool, version: number, site: AdmissionSiteContext) =>
    loadAdmissionSettings(pool, version, site, undefined, { groupRunCeilingByPreviewRosters: true }),
  readVersionFacts: readSettingsVersionFacts,
  readComparisonRows: readSettingsComparisonRows,
  readLineUp: readSealedPreviewLineUp,
  readSeatRefs: readSettingsSeatRefs,
  checkGatePots: readGatePotFindings
});

/**
 * The API half's steps, in order (SA10 added the two preview line-up steps; V4 start step, Task 42, the start step's
 * reach and the pot guard, last). The loader step is skipped (no code of its own) when the site reads refused (their
 * code already fails the half); the loader, condition 2 and the line-up steps are skipped when the version is not a
 * sealed GENERAL one (SETTINGS_VERSION_KIND_INVALID already fails it); Task 42's two steps need the loaded version, so
 * they are skipped when the loader refused it (its code already fails the half). `onWarning` receives the guard's notes.
 */
export function admissionSettingsCheckSteps(input: Readonly<{
  pool: Pool;
  environment: ApiCheckEnvironment;
  version: number;
  readers: AdmissionCheckReaders;
  onSnapshot: (snapshotSha256: string | null) => void;
  onWarning?: (code: string) => void;
}>): readonly SettingsCheckStep[] {
  const { pool, environment, version, readers } = input;
  let site: AdmissionSiteContext | undefined;
  let checkable = false;
  // Task 42: the version as the loader admitted it (undefined: not loaded, or refused).
  let loaded: unknown;
  const previewGate = environment.PREVIEW_GATE_SETTINGS;
  // SA10: the version's line-up (its row, else the env's; null = neither), read once for both line-up steps.
  let lineUpRead: Promise<SealedPreviewLineUp | null> | undefined;
  const lineUpOf = () => (lineUpRead ??= (async () =>
    settingsVersionLineUp(await readers.readLineUp(pool, version), environment.PREVIEW_ENV_LINE_UP))());
  return Object.freeze([
    {
      name: "hosted-cost-envelopes-sealed",
      run: async () => { assertHostedCostEnvelopesSealed(environment.DEPLOYMENT_MODE); return []; }
    },
    {
      name: "site",
      run: async () => { site = await readers.readSite(pool, environment); return []; }
    },
    {
      // The activation's own rule (0124: a sealed GENERAL version), first, so the verdict never passes another and an
      // unknown version is a finding, not a failure to read it.
      name: "version-kind",
      run: async () => {
        const facts = await readers.readVersionFacts(pool, version);
        input.onSnapshot(facts?.snapshotSha256 ?? null);
        const refusal = settingsVersionKindRefusal(facts);
        checkable = refusal === null;
        return refusal === null ? [] : [refusal];
      }
    },
    {
      name: "admission-settings",
      run: async () => {
        if (site !== undefined && checkable) loaded = await readers.loadVersion(pool, version, site);
        return [];
      }
    },
    {
      // Condition 2: nothing the version would change is a site rule (that needs an upload).
      name: "site-members-equal",
      run: async () => !checkable ? [] : compareSiteSettings({
        site: await readers.readComparisonRows(pool, environment.REGISTER_VERSION),
        candidate: await readers.readComparisonRows(pool, version)
      }).map(({ code, rowKey, member }) => `${code}:${rowKey}${member === undefined ? "" : `.${member}`}`)
    },
    {
      // Addition D14: the version's line-up exists (its row, or the env's old forms); else the boot's own refusal.
      name: "preview-line-up",
      run: async () => (previewGate !== undefined && checkable && await lineUpOf() === null ? ["PREVIEW_LINE_UP_REQUIRED"] : [])
    },
    {
      // Condition 3 for the line-up (addition D19, D24 item 5): every seatable model is served by THIS API's declared
      // targets and has its gate's socket in this API's env.
      name: "line-up-environment",
      run: async () => {
        if (previewGate === undefined || !checkable || site === undefined) return [];
        const declaredModels = site.declaredProviderTargets.map((target) => target.model);
        const seatable = settingsSeatableModels({
          lineUp: await lineUpOf() ?? { free_model_ids: [], premium_model_ids: [], thinking_levels: null },
          seatRefs: await readers.readSeatRefs(pool, version), declaredModels
        });
        return settingsLineUpEnvironmentCodes({ seatable, declaredModels, gate: previewGate });
      }
    },
    {
      // V4 start step, Task 42: a plan whose start step is switched on but would not run for a signed-in person here.
      name: "start-step-reachable",
      run: async () => {
        if (previewGate === undefined || loaded === undefined) return [];
        const lineUp = await lineUpOf();
        if (lineUp === null) return [];
        const facts = loaded as Partial<AdmissionVersionSettings>;
        return startStepUnreachableCodes({
          policy: facts.debateShapePolicy ?? null,
          engineInForce: (facts.engineVersionPolicy ?? null) !== null,
          scorecardInForce: facts.modelPicker?.scorecard.state === "VALID",
          makersOf: (plan) => lineUpMakersOf(lineUp, plan)
        });
      }
    },
    {
      // V4 start step, Task 42 (spec 2026-11-03 §5 "Before upload"): one debate at the widest choice fits each gate's pot.
      name: "gate-pots",
      run: async () => {
        const check = readers.checkGatePots;
        if (previewGate === undefined || loaded === undefined || site === undefined || check === undefined) return [];
        const lineUp = await lineUpOf();
        if (lineUp === null) return [];
        const findings = await check({ loaded, site, lineUp, environment });
        for (const code of findings.warnings) input.onWarning?.(code);
        return findings.refusals;
      }
    }
  ]);
}

/**
 * Side-by-side spec §13 (S14): the API half's report. A typed refusal of any step is a code in it; an untyped error (a
 * database failure included) propagates: the half could not check (the CLI's exit 2, no report line). V4 start step,
 * Task 42: a note (GATE_POT_SPENT_TODAY:<gate>) is never in the report; it goes to `onWarning` (the CLI prints it).
 */
export async function checkAdmissionSettingsVersion(input: Readonly<{
  pool: Pool;
  environment: ApiCheckEnvironment;
  version: number;
  readers?: AdmissionCheckReaders;
  onWarning?: (code: string) => void;
}>): Promise<SettingsCheckReport> {
  let snapshotSha256: string | null = null;
  const codes = await runSettingsCheckSteps(admissionSettingsCheckSteps({
    pool: input.pool, environment: input.environment, version: input.version,
    readers: input.readers ?? ADMISSION_CHECK_READERS,
    onSnapshot: (digest) => { snapshotSha256 = digest; },
    ...(input.onWarning === undefined ? {} : { onWarning: input.onWarning })
  }));
  return settingsCheckReport({
    half: "api", releaseKey: input.environment.RELEASE_KEY, version: input.version, codes, snapshotSha256
  });
}

/**
 * V4 start step, Task 41 (spec 2026-11-03 §5 "Money", its "Before upload" line): one debate must fit each spending
 * gate's daily pot. The pure half of the guard; Task 42 builds each case's needs from the checked version and asks each
 * gate's `/remaining` once with its pot. Refusals are report codes; a SPENT_TODAY finding is a note only (the pot resets
 * at midnight).
 */
export const GATE_POT_CODES = Object.freeze({
  BELOW: "GATE_POT_BELOW_ONE_DEBATE",
  SPENT_TODAY: "GATE_POT_SPENT_TODAY",
  UNREPORTED: "GATE_POT_UNREPORTED",
  UNANSWERED: "GATE_POT_UNANSWERED"
} as const);

/** One choice a person can make at Start: a plan, a question or a dig, its depth, How wide's path count, web search. */
export type GatePotCase = Readonly<{ plan: DebateShapePlanKey; kind: "QUESTION" | "DIG"; depth: 1 | 2; paths: number; web: boolean }>;
/** A case's needs on the model gates (the ask's own estimate) and its searches' money on the search gate (null: none). */
export type GatePotCaseNeeds = Readonly<{ choice: GatePotCase; needs: readonly PreviewGateNeed[]; searchNanoUsd: bigint | null }>;
export type GatePotFindings = Readonly<{ refusals: readonly string[]; warnings: readonly string[] }>;

/** The case as lowercase parts, e.g. "plus:question:d2:p7:web" (no ":web" without web search). */
export function gatePotChoice(c: GatePotCase): string {
  return [c.plan, c.kind.toLowerCase(), `d${String(c.depth)}`, `p${String(c.paths)}`, ...(c.web ? ["web"] : [])].join(":");
}

/**
 * The choices checked: every plan whose start step is switched on (`debateShapeStartStepOf`; none without the switch),
 * at the widest How wide (Free capped at 3 there), a question at depth 1 and 2, and one dig (Free at depth 1, a paid
 * plan at 2); web search on a paid plan when the site has the search gate.
 */
export function gatePotCases(policy: DebateShapePolicy, site: Readonly<{ searchGate: boolean }>): readonly GatePotCase[] {
  const cases: GatePotCase[] = [];
  for (const plan of DEBATE_SHAPE_PLAN_KEYS) {
    const widths = debateShapeStartStepOf(policy, plan);
    if (widths === null) continue;
    const paths = Math.max(...widths.options);
    const web = plan !== "free" && site.searchGate;
    const at = (kind: GatePotCase["kind"], depth: GatePotCase["depth"]): GatePotCase => Object.freeze({ plan, kind, depth, paths, web });
    cases.push(at("QUESTION", 1), at("QUESTION", 2), at("DIG", plan === "free" ? 1 : 2));
  }
  return Object.freeze(cases);
}

/**
 * Weighs one debate of each case on every gate it needs (its model gates, and the search gate when it searches) as the
 * ask's own estimate (`previewGateEstimateNanoUsd`: the calls plus the gate's holds for calls in flight). Above the
 * pot: BELOW:<gate>:<choice>; within the pot but above today's money left: SPENT_TODAY:<gate> (a note, once per gate);
 * a gate that answers without its pot: UNREPORTED:<gate>; one that did not answer (null) or was never asked:
 * UNANSWERED:<gate>. A gate no case needs is never named. Both lists sorted, each code once.
 */
export function checkGatePotsFitOneDebate(input: Readonly<{
  cases: readonly GatePotCaseNeeds[];
  remaining: Readonly<Partial<Record<PreviewGateName, PreviewGateRemaining | null>>>;
}>): GatePotFindings {
  const refusals = new Set<string>();
  const warnings = new Set<string>();
  const weigh = (gate: PreviewGateName, need: PreviewGateNeed, choice: GatePotCase): void => {
    const remaining = input.remaining[gate];
    if (remaining === undefined || remaining === null) {
      refusals.add(`${GATE_POT_CODES.UNANSWERED}:${gate}`);
      return;
    }
    const pot = remaining.dailyPotNanoUsd;
    if (pot === undefined) {
      refusals.add(`${GATE_POT_CODES.UNREPORTED}:${gate}`);
      return;
    }
    const one = previewGateEstimateNanoUsd(need, remaining);
    if (one > pot) refusals.add(`${GATE_POT_CODES.BELOW}:${gate}:${gatePotChoice(choice)}`);
    else if (one > remaining.remainingNanoUsd) warnings.add(`${GATE_POT_CODES.SPENT_TODAY}:${gate}`);
  };
  for (const { choice, needs, searchNanoUsd } of input.cases) {
    for (const need of needs) weigh(need.gate, need, choice);
    // The estimate reads only a need's money: the search gate's need is its searches' money (`previewWebSearchNeed`).
    if (searchNanoUsd !== null) weigh(PERPLEXITY_SEARCH_VENDOR, { callsNanoUsd: searchNanoUsd } as PreviewGateNeed, choice);
  }
  return Object.freeze({ refusals: Object.freeze([...refusals].sort()), warnings: Object.freeze([...warnings].sort()) });
}

/**
 * V4 start step, Task 42: the line a half prints for one note (a finding that is not a failure), beside its one report
 * line: `DEBATEAI_SETTINGS_WARNING {"half":"api","code":"GATE_POT_SPENT_TODAY:deepinfra"}`. Root's settings-version.mjs
 * keeps it in the receipt and shows it with its hint; the verdict never reads it.
 */
export const SETTINGS_WARNING_LINE = "DEBATEAI_SETTINGS_WARNING " as const;

/** One note's line (a code in the report's own alphabet, `isSettingsCheckCode`; anything else is refused). */
export function settingsWarningLine(half: "api", code: string): string {
  if (!isSettingsCheckCode(code)) throw new TypeError("SETTINGS_WARNING_CODE_INVALID");
  return `${SETTINGS_WARNING_LINE}${JSON.stringify({ half, code })}\n`;
}

/**
 * V4 start step, Task 42 (plan call 6; the owner's rule that a switched-on step never switches itself off unseen): a
 * plan whose start step is switched on while Task 34's v2 rule would keep it off for a signed-in person on the preview.
 */
export const START_STEP_UNREACHABLE = "START_STEP_UNREACHABLE" as const;

/**
 * For every plan whose switch is on (`debateShapeStartStepOf`), the first reason Task 34's v2 rule would be off:
 * SCORECARD (a VALID model scorecard, `startStepWidthsFor`), then ENGINE_OFF (engine 2 not in force, the same predicate),
 * then ONE_MAKER (fewer than two makers on the plan's line-up: the rule's second half, `askShapesForPanel`). As
 * `START_STEP_UNREACHABLE:<plan>:<reason>`, sorted. With the switch absent, or the row's `enabled: false`: nothing.
 */
export function startStepUnreachableCodes(input: Readonly<{
  policy: DebateShapePolicy | null;
  engineInForce: boolean;
  scorecardInForce: boolean;
  makersOf(plan: DebateShapePlanKey): number;
}>): readonly string[] {
  const codes: string[] = [];
  for (const plan of DEBATE_SHAPE_PLAN_KEYS) {
    if (debateShapeStartStepOf(input.policy, plan) === null) continue;
    const reason = input.scorecardInForce ? "SCORECARD" : !input.engineInForce ? "ENGINE_OFF" : input.makersOf(plan) < 2 ? "ONE_MAKER" : null;
    if (reason !== null) codes.push(`${START_STEP_UNREACHABLE}:${plan}:${reason}`);
  }
  return Object.freeze(codes.sort());
}

/** The two rosters of a version's line-up (its row, else the env's), as the guard reads them. */
export type GatePotLineUp = Readonly<{ free_model_ids: readonly string[]; premium_model_ids: readonly string[] }>;

/** A plan's roster on the preview, as admission seats it (`previewPlanTierRosters`): Free's on Free, else the premium one. */
function lineUpRosterOf(lineUp: GatePotLineUp, plan: DebateShapePlanKey): readonly string[] {
  return plan === "free" ? lineUp.free_model_ids : lineUp.premium_model_ids;
}

/** The distinct makers of a plan's roster (a model the reviewed rows do not hold counts as its own maker). */
function lineUpMakersOf(lineUp: GatePotLineUp, plan: DebateShapePlanKey): number {
  return new Set(lineUpRosterOf(lineUp, plan).map((model) => previewModelRow(model)?.maker ?? model)).size;
}

/**
 * V4 start step, Task 42: one case's needs, priced as the checked version would admit that ask on the preview: its
 * settings `{depth, adaptive, deep at depth 2 else standard, detailed}` normalised for the plan; the plan's roster as the
 * panel (each model on its declared target); the widest paths as the run's own list (RUN_BUILT) for a question or a
 * dig's picks (DIG_PICKS); the shapes (`askShapesForPanel`), length, engine 2 and web part as admission resolves them
 * (a dig searches in its own look: thorough at depth 2); the basis minted by the version's own `resolveEnvelopeBasis`;
 * the needs by `estimatePreviewGateNeeds` at the version's gate terms, rotated as admission rotates (the row on and two
 * makers or more), at the active mode's worst case (the largest story); the searches' money from the minted web part.
 */
export async function gatePotCaseNeeds(input: Readonly<{
  settings: AdmissionVersionSettings;
  site: AdmissionSiteContext;
  lineUp: GatePotLineUp;
  choice: GatePotCase;
}>): Promise<GatePotCaseNeeds> {
  const { settings, site, lineUp, choice } = input;
  const terms = settings.previewBudgetGate;
  if (terms === undefined) throw new TypeError("PREVIEW_VERSION_TERMS_UNAVAILABLE");
  const plan = choice.plan;
  const depthParams = normaliseDepthParamsForShape({ depth: choice.depth, depthMode: "adaptive",
    scrutiny: choice.depth === 2 ? "deep" : "standard", answerLength: "detailed" }, settings.debateShapePolicy, plan, settings.lengthGuidancePolicy);
  const panel: readonly PreviewPanelMember[] = lineUpRosterOf(lineUp, plan).map((model) => Object.freeze({
    provider_ref: site.declaredProviderTargets.find((target) => target.model === model)?.providerRef ?? model, model_id: model }));
  const makers = lineUpMakersOf(lineUp, plan);
  const { shape, shapeV2 } = askShapesForPanel(settings.debateShapePolicy, depthParams, plan, makers,
    { paths: choice.paths, pathsSource: choice.kind === "QUESTION" ? "RUN_BUILT" : "DIG_PICKS" });
  const length = lengthGuidanceForAsk(settings.lengthGuidancePolicy ?? undefined, depthParams, plan);
  const engine = engineForAsk({ policy: settings.engineVersionPolicy ?? undefined, length, makers, mapOpening: shape !== null });
  const web = webSitesForAsk({ searchGate: choice.web, shape, shapeV2, engine, depth: depthParams.depth,
    parent: choice.kind === "DIG" ? { mode: choice.depth === 2 ? "thorough" : "quick" } : undefined });
  const basis = await settings.resolveEnvelopeBasis({
    depthParams,
    // The loaded version's resolver reads no risk tier; the basis is the same for every tier.
    riskTier: "standard",
    panelSize: panel.length,
    // No pinned assignment on the preview (a VALID scorecard is refused there): no runner-up, as admission.
    backupSequencesProvisioned: 0,
    shape, shapeV2, length, engine, web
  });
  const needs = estimatePreviewGateNeeds({ ...terms, basis, panel,
    ...(settings.roleRotation !== null && makers >= 2 ? { rotated: true } : {}) });
  const sites = previewWebSitesOf(basis);
  return Object.freeze({ choice, needs, searchNanoUsd: sites === null ? null : previewWebSearchNeed(sites).nanoUsd });
}

/** How the guard asks one gate its `/remaining` with the day's pot (tests inject it). */
export type GatePotRemainingReader = (gate: PreviewGateName, socket: string, scopeId: string) => Promise<PreviewGateRemaining>;

/** The default: the app's own strict reader on the gate's socket, asking for the pot (`{ dailyPot: true }`), read-only. */
const READ_REMAINING_WITH_POT: GatePotRemainingReader = (_gate, socket, scopeId) =>
  createPreviewRemainingRpcPort({ budget_socket: socket, scope_id: scopeId }, PREVIEW_REMAINING_TIMEOUT_MS, { dailyPot: true }).remaining();

/** The gates in the order they are asked. */
const GATE_POT_GATES: readonly PreviewGateName[] = Object.freeze(["deepinfra", "anthropic", PERPLEXITY_SEARCH_VENDOR]);
const NO_GATE_POT_FINDINGS: GatePotFindings = Object.freeze({ refusals: Object.freeze([]), warnings: Object.freeze([]) });

/**
 * V4 start step, Task 42 — THE POT GUARD IN CHECK-VERSION (spec 2026-11-03 §5 "Before upload"). On the preview only, for
 * the loaded version: its cases (`gatePotCases`: every switched-on plan, web where the site has the search gate), each
 * priced by `gatePotCaseNeeds`; then each gate a case needs is asked its `/remaining` once, with its pot. A gate without
 * a socket here, or one whose answer is refused, is unanswered (null). The findings are `checkGatePotsFitOneDebate`'s.
 * Off the preview, with no shape row in force, without the switch or without a loaded version: nothing is asked.
 */
export async function readGatePotFindings(input: Readonly<{
  loaded: unknown;
  site: AdmissionSiteContext;
  lineUp: GatePotLineUp;
  environment: ApiCheckEnvironment;
  readRemaining?: GatePotRemainingReader;
}>): Promise<GatePotFindings> {
  const gate = input.environment.PREVIEW_GATE_SETTINGS;
  const settings = input.loaded as AdmissionVersionSettings | undefined;
  const policy = settings?.debateShapePolicy ?? null;
  if (gate === undefined || settings === undefined || policy === null) return NO_GATE_POT_FINDINGS;
  const cases = gatePotCases(policy, { searchGate: previewGateSocket(gate, PERPLEXITY_SEARCH_VENDOR) !== undefined });
  if (cases.length === 0) return NO_GATE_POT_FINDINGS;
  const caseNeeds: GatePotCaseNeeds[] = [];
  for (const choice of cases) caseNeeds.push(await gatePotCaseNeeds({ settings, site: input.site, lineUp: input.lineUp, choice }));
  const needed = new Set<PreviewGateName>();
  for (const { needs, searchNanoUsd } of caseNeeds) {
    for (const need of needs) needed.add(need.gate);
    if (searchNanoUsd !== null) needed.add(PERPLEXITY_SEARCH_VENDOR);
  }
  const read = input.readRemaining ?? READ_REMAINING_WITH_POT;
  const remaining: Partial<Record<PreviewGateName, PreviewGateRemaining | null>> = {};
  for (const name of GATE_POT_GATES) {
    if (!needed.has(name)) continue;
    const socket = previewGateSocket(gate, name);
    remaining[name] = socket === undefined ? null : await read(name, socket, gate.scope_id).catch(() => null);
  }
  return checkGatePotsFitOneDebate({ cases: caseNeeds, remaining });
}
