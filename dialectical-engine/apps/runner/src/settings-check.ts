import type { Pool } from "pg";
import {
  assertHostedCostEnvelopesSealed,
  readSealedPreviewLineUp,
  readSettingsVersionFacts,
  readStoryPolicyFromRegister,
  runSettingsCheckSteps,
  settingsCheckReport,
  settingsGateThinkingCodes,
  settingsGateTokenCeilingCodes,
  settingsGateUnreviewedCodes,
  settingsLineUpEnvironmentCodes,
  settingsSeatableModels,
  settingsVersionKindRefusal,
  settingsVersionLineUp,
  type SealedPreviewLineUp,
  type SettingsCallBound,
  type SettingsCheckReport,
  type SettingsCheckStep,
  type SettingsVersionFacts
} from "@debateai/register";
import { readDevelopmentRunnerPolicy } from "./dev-runner-policy.js";
import { createRunInFlight } from "./run-in-flight.js";
import {
  declaredContractHashRefusals,
  loadRunnerVersionSettings,
  readRunnerSiteContext,
  type RunnerSiteContext,
  type RunnerSiteEnvironment,
  type RunnerVersionSettings
} from "./run-settings.js";

/**
 * Side-by-side spec §13 "Activation is refused unless" (S14) — CHECK-VERSION, THE RUNNER HALF: the dry boot of this
 * release's runner against one sealed settings version, from the runner's own folder and env (`runner.env`, the preview
 * overlay included). It makes no AI call, reads no credential file, loads no key, opens no Hatchet connection and writes
 * nothing (S15's verdict command writes the verdict). What it runs, each step independent of the others, so one run
 * lists every problem:
 *  - the boot's own first refusal (a hosted deployment with unsealed envelopes) and the release's SITE reads, exactly as
 *    main.ts makes them (`readRunnerSiteContext`: the declared targets with the mode decision, their prices and, on the
 *    preview, the reviewed provider set; hosted, the site's money row, band and billingPlans, and the money every
 *    version's guard shares);
 *  - the version, loaded as main.ts would load it (`loadRunnerVersionSettings`, strict: a story refusal is a finding
 *    here, not "no story"): the prompt fingerprints, the story rows, the line-up, the shape, the engine, the preview's
 *    rosters, roles and scorecard conflict, the run ceiling against one call, the money guard over both money rows
 *    (condition 4: the day holds one full run plus its story), the call lanes and the claim-time gates;
 *  - condition 3: every role ref the version names (synthesizer, evaluator, storyteller, story checker) is one of this
 *    release's declared targets, else SETTINGS_NEEDS_ENV_CHANGE:ROLE_REF:<ref> (the env must change: an upload);
 *  - condition 5 (plan D5): both prompt-fingerprint rows sealed and equal to this code's
 *    (`declaredContractHashRefusals`);
 *  - on the preview only, the version's line-up (addition D14: its own row, else the env's; neither:
 *    PREVIEW_LINE_UP_REQUIRED) and its SEATABLE SET (addition D20, SA10: both rosters, the four seats' models, the
 *    structure-repair model when a declared target serves it; `settingsSeatableModels`), and on it:
 *    - condition 3 for the line-up (addition D19): every seatable model is served by one of this runner's declared
 *      targets (SETTINGS_NEEDS_ENV_CHANGE:TARGET:<model>) and its gate has a socket in `runner.env`
 *      (SETTINGS_NEEDS_ENV_CHANGE:GATE_SOCKET:<provider>);
 *    - condition 6, the code copy (addition D20, which with D26 replaces plan D6): every seatable model and every model
 *      the sealed table names is a reviewed row (SETTINGS_GATE_UNREVIEWED:<model or ref>), every level of the sealed
 *      table is on its model's reviewed menu in this code (SETTINGS_GATE_THINKING_UNREVIEWED:<model>:<level>), and no
 *      sealed ceiling the preview sends is above a seatable model's output bound
 *      (SETTINGS_GATE_TOKEN_CEILING:<rowKey>:<model>; the storyteller's bound exempt). The line-up is read as sealed
 *      (shape only, `readSealedPreviewLineUp`), so a version an older, wider code sealed is named code by code;
 *  - first of the version's own steps, the activation's rule (0124): a sealed GENERAL version, else
 *    SETTINGS_VERSION_KIND_INVALID and the version's steps are skipped (an unknown version is a finding, not exit 2).
 * The role-ref and gate codes are REPORT codes (returned, never thrown); the two typed codes this check's modules can
 * throw (SETTINGS_HASH_UNDECLARED from `assertDeclaredContractHashes`, SETTINGS_CHECK_NO_AI_CALL from the API half's
 * fetch) are in both KNOWN_DOMAIN_CODES lists (ruling R57b), though only the CLI meets them today.
 */

/** The runner env keys the check reads: the site reads' and the release key (a full `loadRunnerEnvironment()` fits). */
export type RunnerCheckEnvironment = RunnerSiteEnvironment & Readonly<{ RELEASE_KEY: string }>;

/** Every read the runner half makes (unit tests inject them; the defaults are the boot's own functions). */
export type RunnerCheckReaders = Readonly<{
  /** The site reads (`readRunnerSiteContext`, with the check's own money in-flight counter). */
  readSite: (pool: Pool, environment: RunnerSiteEnvironment) => Promise<RunnerSiteContext>;
  /** The version, strict (`loadRunnerVersionSettings(pool, v, site, { strict: true })`). */
  loadVersion: (pool: Pool, version: number, site: RunnerSiteContext) => Promise<RunnerVersionSettings>;
  /** The four role refs the version names, by the register's own readers at the version (story refs only with story rows). */
  readRoleRefs: (pool: Pool, version: number) => Promise<readonly string[]>;
  /** SA10: the version's line-up row as sealed (shape only), or null without the row (`readSealedPreviewLineUp`). */
  readLineUp: (pool: Pool, version: number) => Promise<SealedPreviewLineUp | null>;
  /** SA10: the sealed call bounds the version's debates and stories send (`readRunnerCallBounds`). */
  readCallBounds: (pool: Pool, version: number) => Promise<readonly SettingsCallBound[]>;
  contractHashRefusals: (pool: Pick<Pool, "query">, version: number) => Promise<readonly string[]>;
  readVersionFacts: (pool: Pick<Pool, "query">, version: number) => Promise<SettingsVersionFacts | null>;
}>;

/** The four role refs one version names: the synthesis pair (runner policy), and the story pair when it seals story rows. */
export async function readRunnerRoleRefs(pool: Pool, version: number): Promise<readonly string[]> {
  const { synthesisRolePolicy } = await readDevelopmentRunnerPolicy(pool, version);
  const story = await readStoryPolicyFromRegister(pool, version);
  return Object.freeze([
    synthesisRolePolicy.synthesizerRoleRef, synthesisRolePolicy.evaluatorRoleRef,
    ...(story === null ? [] : [story.storytellerRoleRef, story.storyCheckerRoleRef])
  ]);
}

/**
 * Addition D20 (SA10): the sealed call bounds one version's calls carry, read by the loader's own readers at the version
 * (`readDevelopmentRunnerPolicy`, `readStoryPolicyFromRegister`): the three organ bounds (row key
 * `acceptanceOrganCostBounds.<organ>`), the synthesizer and evaluator bounds, and with the story rows the storyteller's
 * (exempt from the ceiling check: the preview sends the row's allowance) and the story checker's.
 */
export async function readRunnerCallBounds(pool: Pool, version: number): Promise<readonly SettingsCallBound[]> {
  const { bounds, synthesisRolePolicy } = await readDevelopmentRunnerPolicy(pool, version);
  const story = await readStoryPolicyFromRegister(pool, version);
  const bound = (rowKey: string, tokenCeiling: number): SettingsCallBound => Object.freeze({ rowKey, tokenCeiling });
  return Object.freeze([
    ...(["JUDGE", "COMPOSER", "CONFORMANCE"] as const).map((organ) => bound(`acceptanceOrganCostBounds.${organ}`, bounds[organ].tokenCeiling)),
    bound("synthesizerCallBound", synthesisRolePolicy.synthesizerBound.tokenCeiling),
    bound("evaluatorCallBound", synthesisRolePolicy.evaluatorBound.tokenCeiling),
    ...(story === null ? [] : [
      bound("storytellerCallBound", story.storytellerBound.tokenCeiling), bound("storyCheckerCallBound", story.checkerBound.tokenCeiling)
    ])
  ]);
}

export const RUNNER_CHECK_READERS: RunnerCheckReaders = Object.freeze({
  readSite: async (pool: Pool, environment: RunnerSiteEnvironment) =>
    (await readRunnerSiteContext({ pool, environment, moneyInFlight: createRunInFlight() })).site,
  loadVersion: (pool: Pool, version: number, site: RunnerSiteContext) =>
    loadRunnerVersionSettings(pool, version, site, { strict: true }),
  readRoleRefs: readRunnerRoleRefs,
  readLineUp: readSealedPreviewLineUp,
  readCallBounds: readRunnerCallBounds,
  contractHashRefusals: declaredContractHashRefusals,
  readVersionFacts: readSettingsVersionFacts
});

/**
 * The runner half's steps, in order; SA10 (addition D19-D20) added the line-up, target, socket, thinking-level and
 * ceiling steps (preview only). A step needing the site reads is skipped (no code of its own) when they refused, and
 * the version's own steps when it is not a sealed GENERAL version: the code already found fails the half.
 */
export function runnerSettingsCheckSteps(input: Readonly<{
  pool: Pool;
  environment: RunnerCheckEnvironment;
  version: number;
  readers: RunnerCheckReaders;
  /** Receives the version's sealed snapshot digest (null when the version has none). */
  onSnapshot: (snapshotSha256: string | null) => void;
}>): readonly SettingsCheckStep[] {
  const { pool, environment, version, readers } = input;
  let site: RunnerSiteContext | undefined;
  let checkable = false;
  let roleRefs: Promise<readonly string[]> | undefined;
  const refs = (): Promise<readonly string[]> => (roleRefs ??= readers.readRoleRefs(pool, version));
  const previewGate = environment.PREVIEW_GATE_SETTINGS;
  const declaredModels = (): readonly string[] => site?.declaredProviderTargets.map((target) => target.model) ?? [];
  /**
   * SA10: the version's line-up (its row, else the env's; null = neither) and its seatable set, read once. Without a
   * line-up the set still holds the seats' models, so an unreviewed seat is still named.
   */
  let seatableRead: Promise<Readonly<{ lineUp: SealedPreviewLineUp | null; seatable: readonly string[] }>> | undefined;
  const seatableOf = () => (seatableRead ??= (async () => {
    const lineUp = settingsVersionLineUp(await readers.readLineUp(pool, version), environment.PREVIEW_ENV_LINE_UP);
    const seatable = settingsSeatableModels({
      lineUp: lineUp ?? { free_model_ids: [], premium_model_ids: [], thinking_levels: null },
      seatRefs: await refs(), declaredModels: declaredModels()
    });
    return Object.freeze({ lineUp, seatable });
  })());
  const onPreview = (): boolean => previewGate !== undefined && checkable;
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
      // The activation's own rule (0124: a sealed GENERAL version), first: an unknown, unsealed or support version is
      // a finding (SETTINGS_VERSION_KIND_INVALID) and the version's own steps are skipped, never a failure to read it.
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
      name: "version-settings",
      run: async () => {
        if (site !== undefined && checkable) await readers.loadVersion(pool, version, site);
        return [];
      }
    },
    {
      // Condition 3: a role on a ref this release does not declare could never be called: the env must change.
      name: "role-refs-declared",
      run: async () => {
        if (site === undefined || !checkable) return [];
        const declared = new Set(site.declaredProviderTargets.map((target) => target.providerRef));
        return (await refs()).filter((ref) => !declared.has(ref)).map((ref) => `SETTINGS_NEEDS_ENV_CHANGE:ROLE_REF:${ref}`);
      }
    },
    {
      name: "contract-hashes-declared",
      run: async () => (checkable ? readers.contractHashRefusals(pool, version) : [])
    },
    {
      // Addition D14: the version's line-up exists (its row, or the env's old forms); else the boot's own refusal.
      name: "preview-line-up",
      run: async () => (onPreview() && (await seatableOf()).lineUp === null ? ["PREVIEW_LINE_UP_REQUIRED"] : [])
    },
    {
      // Condition 3 for the line-up (addition D19): every seatable model is served and has its gate's socket here.
      name: "line-up-environment",
      run: async () => (!onPreview() || site === undefined ? [] : settingsLineUpEnvironmentCodes({
        seatable: (await seatableOf()).seatable, declaredModels: declaredModels(), gate: previewGate!
      }))
    },
    {
      // Condition 6 (the code copy, addition D20): every seatable model and every table model is a reviewed row.
      name: "gate-models-reviewed",
      run: async () => {
        if (!onPreview()) return [];
        const { lineUp, seatable } = await seatableOf();
        return settingsGateUnreviewedCodes({ seatable, lineUp });
      }
    },
    {
      // Condition 6: every sealed level is on its model's reviewed menu in this code.
      name: "gate-thinking-levels",
      run: async () => (onPreview() ? settingsGateThinkingCodes({ lineUp: (await seatableOf()).lineUp }) : [])
    },
    {
      // Condition 6: no sealed ceiling the preview sends is above a seatable model's output bound (storyteller exempt).
      name: "gate-token-ceilings",
      run: async () => (!onPreview() ? [] : settingsGateTokenCeilingCodes({
        seatable: (await seatableOf()).seatable, callBounds: await readers.readCallBounds(pool, version), gate: previewGate!
      }))
    }
  ]);
}

/**
 * Side-by-side spec §13 (S14): the runner half's report. A typed refusal of any step is a code in it; an untyped error (a
 * database failure included) propagates: the half could not check (the CLI's exit 2, no report line).
 */
export async function checkRunnerSettingsVersion(input: Readonly<{
  pool: Pool;
  environment: RunnerCheckEnvironment;
  version: number;
  readers?: RunnerCheckReaders;
}>): Promise<SettingsCheckReport> {
  let snapshotSha256: string | null = null;
  const codes = await runSettingsCheckSteps(runnerSettingsCheckSteps({
    pool: input.pool, environment: input.environment, version: input.version,
    readers: input.readers ?? RUNNER_CHECK_READERS,
    onSnapshot: (digest) => { snapshotSha256 = digest; }
  }));
  return settingsCheckReport({
    half: "runner", releaseKey: input.environment.RELEASE_KEY, version: input.version, codes, snapshotSha256
  });
}
