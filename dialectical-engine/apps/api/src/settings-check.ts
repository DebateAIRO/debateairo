import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import { readDeploymentMakerCapability } from "@debateai/critique";
import { previewProviderSocket, type PreviewGateSettings, type PreviewLineUp } from "@debateai/providers";
import {
  assertAskRoomAdmissionSealed,
  assertBillingReady,
  assertHostedCostEnvelopesSealed,
  assertHostedSupportAdmissionSealed,
  compareSiteSettings,
  costEnvelopeBand,
  questionLanguagePolicyStartValues,
  readAdmissionPolicy,
  readBillingPlans,
  readBillingPolicy,
  readCostEnvelopePolicy,
  readSettingsComparisonRows,
  readSettingsVersionFacts,
  runSettingsCheckSteps,
  settingsCheckReport,
  type DeploymentMode,
  type QuestionLanguagePolicy,
  type SettingsCheckReport,
  type SettingsCheckStep,
  type SettingsComparisonRow,
  type SettingsVersionFacts
} from "@debateai/register";
import { buildAdmissionSiteContext, loadAdmissionSettings, type AdmissionSiteContext } from "./admission-settings.js";
import { assertDeploymentProviderTargets, assertPricedProviderTargets, parseProviderDiscoveryTargets } from "./provider-discovery.js";
import { hostedQuestionLanguageRoute, questionLanguageRouteFor, type QuestionLanguagePaidRoute } from "./question-language/boot.js";
import { newQuestionLanguageReferenceKey } from "./question-language/reference.js";

/**
 * Side-by-side spec §13 "Activation is refused unless" (S14) — CHECK-VERSION, THE API HALF: the dry boot of this
 * release's API against one sealed settings version, from the API's own folder and env (`api.env`). It makes no AI call
 * (the question-language route it builds can never send: its fetch refuses, it never reads the support key), reads no
 * credential or key file and writes nothing (S15's verdict command writes the verdict). Each step is independent, so one
 * run lists every problem:
 *  - the boot's first refusal (a hosted deployment with unsealed envelopes) and the SITE reads main.ts makes before its
 *    admission loader, by the same functions: the declared targets with the mode decision and their prices; the
 *    admission row's support scopes (hosted); the site's costEnvelopePolicy row (hosted); and the room's readiness
 *    (billing ready or refused by name, the band, the sealed askRoomReads budget), which says whether billing is on and
 *    whether the room is built. Not repeated: the waiting line's count when the band is missing (live state, not a
 *    version's) and everything main.ts reads for other parts (keys, sessions, billing connectors). The context is then
 *    built by `buildAdmissionSiteContext`, as main.ts and the practice build theirs;
 *  - the version, loaded as main.ts would admit on it (`loadAdmissionSettings`): every moved stage, the picker's
 *    scorecard-versus-targets checks (condition 3 for the seated models), the question-language boot refusals, the API's
 *    own run ceiling against one call, the estimator maximum and condition 4 (`costEnvelopeGuardPolicy`);
 *  - the version is sealed and GENERAL (a support publication or an unknown version: SETTINGS_VERSION_KIND_INVALID);
 *  - condition 2: every SITE row and every MIXED row's site members equal the release's site version's
 *    (`compareSiteSettings`): each difference SETTINGS_SITE_MEMBER_DIFFERS:<row>[.<member>], a row or member this code
 *    never classified SETTINGS_ROW_UNCLASSIFIED:<row>[.<member>].
 * SA10 (addition D19, D24 item 5) adds the line-up's target and socket checks against this API's own declared targets as
 * further steps (what keeps every seatable model's company on the providers page). The CLI codes are REPORT codes: no
 * runtime path of the API throws them, so they are not in its KNOWN_DOMAIN_CODES.
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
 * The question-language route as main.ts decides it (ruling L-ROUTE), built so that nothing can be sent or spent: on
 * the preview the guarded fetch is `CHECK_NEVER_SENDS` (PREVIEW with the Anthropic gate socket, else NONE: the same
 * route, so the same boot refusals); off the preview `hostedQuestionLanguageRoute` runs its boot refusals (an unpriced
 * fast-check model, no day pot) and then meets "no spend record" before any key is read (NONE). The reference key is
 * per process (the check signs nothing).
 */
export function checkQuestionLanguage(environment: Pick<ApiCheckEnvironment, "DEPLOYMENT_MODE" | "PREVIEW_GATE_SETTINGS">): AdmissionSiteContext["questionLanguage"] {
  const previewGate = environment.PREVIEW_GATE_SETTINGS;
  return Object.freeze({
    routeFor: async ({ policy, dayCeilingMicros }: Readonly<{ policy: QuestionLanguagePolicy | null; dayCeilingMicros: number | null }>): Promise<QuestionLanguagePaidRoute> => {
      const hostedRoute = previewGate !== undefined ? undefined : await hostedQuestionLanguageRoute({
        mode: environment.DEPLOYMENT_MODE,
        fastCheck: (policy ?? questionLanguagePolicyStartValues()).fastCheck,
        readCredential: () => undefined,
        spend: {
          writerPresent: async () => false,
          record: async () => { throw new TypedDomainError("SETTINGS_CHECK_NO_AI_CALL", "check-version never records spend"); }
        },
        dayPot: dayCeilingMicros === null ? null : { ceilingMicros: dayCeilingMicros, spentMicros: async () => 0 },
        clock: () => new Date(),
        report: () => undefined
      });
      return questionLanguageRouteFor({
        previewConfigured: previewGate !== undefined,
        previewFetch: previewGate === undefined ? undefined : CHECK_NEVER_SENDS,
        anthropicSocket: previewGate === undefined ? undefined : previewProviderSocket(previewGate, "anthropic"),
        hosted: () => {
          if (hostedRoute === undefined) throw new TypeError("QUESTION_LANGUAGE_HOSTED_ROUTE_ON_PREVIEW");
          return hostedRoute;
        }
      });
    },
    referenceKey: newQuestionLanguageReferenceKey()
  });
}

/**
 * The API's site reads, as main.ts makes them before its admission loader (same functions, same order, no boot ledger),
 * and its site context, built by `buildAdmissionSiteContext`. Lines (the picker's, the story's) go to standard error.
 */
export async function readAdmissionCheckSite(pool: Pool, environment: ApiCheckEnvironment): Promise<AdmissionSiteContext> {
  const deploymentMakers = await readDeploymentMakerCapability(pool, environment.REGISTER_VERSION);
  if (environment.PROVIDER_DISCOVERY_TARGETS_JSON === undefined) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGETS_REQUIRED");
  }
  const declaredProviderTargets = parseProviderDiscoveryTargets(
    environment.PROVIDER_DISCOVERY_TARGETS_JSON, deploymentMakers.configuredProviders
  );
  assertDeploymentProviderTargets(declaredProviderTargets, {
    mode: environment.DEPLOYMENT_MODE, nodeEnv: environment.NODE_ENV
  });
  assertPricedProviderTargets(declaredProviderTargets, environment.DEPLOYMENT_MODE);
  const admissionPolicy = await readAdmissionPolicy(pool, environment.REGISTER_VERSION);
  assertHostedSupportAdmissionSealed(environment.DEPLOYMENT_MODE, admissionPolicy);
  const siteCostEnvelopePolicy = environment.DEPLOYMENT_MODE === "hosted"
    ? await readCostEnvelopePolicy(pool, environment.REGISTER_VERSION)
    : null;
  // main.ts's "ask-room" stage: billing ready (or refused by name), then, with the band, the sealed askRoomReads budget.
  let askRoom = false;
  let billingEnabled = false;
  if (environment.DEPLOYMENT_MODE === "hosted" && siteCostEnvelopePolicy !== null) {
    const billingPlans = assertBillingReady({
      policy: await readBillingPolicy(pool, environment.REGISTER_VERSION),
      plans: await readBillingPlans(pool, environment.REGISTER_VERSION),
      envelope: siteCostEnvelopePolicy
    });
    if (costEnvelopeBand(siteCostEnvelopePolicy) !== null) {
      assertAskRoomAdmissionSealed({ envelope: siteCostEnvelopePolicy, admission: admissionPolicy });
      askRoom = true;
      billingEnabled = billingPlans !== null;
    }
  }
  return buildAdmissionSiteContext({
    pool,
    environment,
    declaredProviderTargets,
    siteCostEnvelopePolicy,
    askRoom,
    billingEnabled,
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
}>;

export const ADMISSION_CHECK_READERS: AdmissionCheckReaders = Object.freeze({
  readSite: readAdmissionCheckSite,
  loadVersion: (pool: Pool, version: number, site: AdmissionSiteContext) => loadAdmissionSettings(pool, version, site),
  readVersionFacts: readSettingsVersionFacts,
  readComparisonRows: readSettingsComparisonRows
});

/**
 * The API half's steps, in order (SA10 adds its own as further entries). The version step is skipped (no code of its
 * own) when the site reads refused: their code already fails the half.
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
      name: "admission-settings",
      run: async () => {
        if (site !== undefined) await readers.loadVersion(pool, version, site);
        return [];
      }
    },
    {
      // The activation's own rule (0124: a sealed GENERAL version), checked here so the verdict never passes another.
      name: "version-kind",
      run: async () => {
        const facts = await readers.readVersionFacts(pool, version);
        input.onSnapshot(facts?.snapshotSha256 ?? null);
        const general = facts !== null && facts.sealed && (facts.publicationKind === null || facts.publicationKind === "GENERAL");
        return general ? [] : ["SETTINGS_VERSION_KIND_INVALID"];
      }
    },
    {
      // Condition 2: nothing the version would change is a site rule (that needs an upload).
      name: "site-members-equal",
      run: async () => compareSiteSettings({
        site: await readers.readComparisonRows(pool, environment.REGISTER_VERSION),
        candidate: await readers.readComparisonRows(pool, version)
      }).map(({ code, rowKey, member }) => `${code}:${rowKey}${member === undefined ? "" : `.${member}`}`)
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
