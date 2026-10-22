import type { Pool } from "pg";
import {
  assertHostedCostEnvelopesSealed,
  readSettingsVersionFacts,
  readStoryPolicyFromRegister,
  runSettingsCheckSteps,
  settingsCheckReport,
  type SettingsCheckReport,
  type SettingsCheckStep,
  type SettingsVersionFacts
} from "@debateai/register";
import { previewModelRowForRef } from "@debateai/providers";
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
 *  - condition 6, the code copy, on the preview only (addition D26 replaces plan D6; SA10 adds the whole seatable set):
 *    each role ref's model is a reviewed row (`previewModelRowForRef`), else SETTINGS_GATE_UNREVIEWED:<ref>.
 * The CLI codes (SETTINGS_NEEDS_ENV_CHANGE:…, SETTINGS_GATE_UNREVIEWED:…, SETTINGS_HASH_UNDECLARED:…) are REPORT codes:
 * no runtime path of the runner throws them, so they are not in its KNOWN_DOMAIN_CODES.
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

export const RUNNER_CHECK_READERS: RunnerCheckReaders = Object.freeze({
  readSite: async (pool: Pool, environment: RunnerSiteEnvironment) =>
    (await readRunnerSiteContext({ pool, environment, moneyInFlight: createRunInFlight() })).site,
  loadVersion: (pool: Pool, version: number, site: RunnerSiteContext) =>
    loadRunnerVersionSettings(pool, version, site, { strict: true }),
  readRoleRefs: readRunnerRoleRefs,
  contractHashRefusals: declaredContractHashRefusals,
  readVersionFacts: readSettingsVersionFacts
});

/**
 * The runner half's steps, in order. SA10 (addition D19-D20) adds its target, socket, thinking-level and ceiling checks
 * as further steps of this list. A step needing the site reads is skipped (no code of its own) when they refused: their
 * code already fails the half.
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
  let roleRefs: Promise<readonly string[]> | undefined;
  const refs = (): Promise<readonly string[]> => (roleRefs ??= readers.readRoleRefs(pool, version));
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
      name: "version-settings",
      run: async () => {
        if (site !== undefined) await readers.loadVersion(pool, version, site);
        return [];
      }
    },
    {
      // Condition 3: a role on a ref this release does not declare could never be called: the env must change.
      name: "role-refs-declared",
      run: async () => {
        if (site === undefined) return [];
        const declared = new Set(site.declaredProviderTargets.map((target) => target.providerRef));
        return (await refs()).filter((ref) => !declared.has(ref)).map((ref) => `SETTINGS_NEEDS_ENV_CHANGE:ROLE_REF:${ref}`);
      }
    },
    {
      name: "contract-hashes-declared",
      run: () => readers.contractHashRefusals(pool, version)
    },
    {
      // Condition 6 (the code copy): on the preview, every role's model is a row the gates' helper reviewed.
      name: "gate-models-reviewed",
      run: async () => environment.PREVIEW_GATE_SETTINGS === undefined
        ? []
        : (await refs()).filter((ref) => previewModelRowForRef(ref) === undefined).map((ref) => `SETTINGS_GATE_UNREVIEWED:${ref}`)
    },
    {
      name: "version-snapshot",
      run: async () => { input.onSnapshot((await readers.readVersionFacts(pool, version))?.snapshotSha256 ?? null); return []; }
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
