import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import { readDeploymentMakerCapability } from "@debateai/critique";
import type { PreviewGateSettings, PreviewLineUp } from "@debateai/providers";
import {
  assertHostedCostEnvelopesSealed,
  assertHostedSupportAdmissionSealed,
  compareSiteSettings,
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
  type DeploymentMode,
  type SealedPreviewLineUp,
  type QuestionLanguagePolicy,
  type SettingsCheckReport,
  type SettingsCheckStep,
  type SettingsComparisonRow,
  type SettingsVersionFacts
} from "@debateai/register";
import {
  buildAdmissionSiteContext, decideAskRoomReadiness, loadAdmissionSettings, type AdmissionSiteContext
} from "./admission-settings.js";
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
  readSeatRefs: readSettingsSeatRefs
});

/**
 * The API half's steps, in order (SA10 added the two preview line-up steps last). The loader step is skipped (no code
 * of its own) when the site reads refused (their code already fails the half); the loader, condition 2 and the line-up
 * steps are skipped when the version is not a sealed GENERAL one (SETTINGS_VERSION_KIND_INVALID already fails it).
 */
export function admissionSettingsCheckSteps(input: Readonly<{
  pool: Pool;
  environment: ApiCheckEnvironment;
  version: number;
  readers: AdmissionCheckReaders;
  onSnapshot: (snapshotSha256: string | null) => void;
}>): readonly SettingsCheckStep[] {
  const { pool, environment, version, readers } = input;
  let site: AdmissionSiteContext | undefined;
  let checkable = false;
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
        if (site !== undefined && checkable) await readers.loadVersion(pool, version, site);
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
    }
  ]);
}

/**
 * Side-by-side spec §13 (S14): the API half's report. A typed refusal of any step is a code in it; an untyped error (a
 * database failure included) propagates: the half could not check (the CLI's exit 2, no report line).
 */
export async function checkAdmissionSettingsVersion(input: Readonly<{
  pool: Pool;
  environment: ApiCheckEnvironment;
  version: number;
  readers?: AdmissionCheckReaders;
}>): Promise<SettingsCheckReport> {
  let snapshotSha256: string | null = null;
  const codes = await runSettingsCheckSteps(admissionSettingsCheckSteps({
    pool: input.pool, environment: input.environment, version: input.version,
    readers: input.readers ?? ADMISSION_CHECK_READERS,
    onSnapshot: (digest) => { snapshotSha256 = digest; }
  }));
  return settingsCheckReport({
    half: "api", releaseKey: input.environment.RELEASE_KEY, version: input.version, codes, snapshotSha256
  });
}
