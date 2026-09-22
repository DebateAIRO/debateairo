import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { EVALUATOR_PROMPT_CONTRACT } from "@debateai/runner";
import { JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT } from "@debateai/judgement";
import { promptContractFingerprintText } from "@debateai/providers";
import { SYNTHESIZER_PROMPT_CONTRACT } from "@debateai/serve";
import {
  ENGINE_BAND_ORDER,
  buildAlgorithmRegisterRows,
  loadBootstrapRegister,
  warnOnIdenticalSynthesisRoleRefs,
  type ProviderFamilyEntry,
  canonicalDecimal,
  canonicalRegisterJson,
  createPostgresRegisterPublicationPort,
  parseRegisterVersionText,
  type CanonicalJsonAst,
  type RegisterPublicationRow
} from "@debateai/register";

/**
 * T16 · version 1 is HISTORICAL and sealed in every ceremony database created
 * before this lane; it is never re-opened. The fifteen algorithm rows landed in
 * a newly minted version 2, and version 2 is now sealed history in its own
 * right: it is what the owner's 2026-09-17 run (`d7b73d79`) read.
 *
 * D77 (c) refitted two of those rows — globalStopDelta 0.02 -> 0.01 and
 * branchFreezeEpsilon 0.01 -> 0.005 — and `seedAcceptanceRegister` carries the
 * rows in through `importHistorical`, which is replay-only: a version that
 * already exists must match the supplied snapshot byte for byte, or it raises
 * `REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift`
 * (`migrations/0055_register_support_publication.sql:1343-1374`). Sealed means
 * immutable PER VERSION, so a refit is a NEW VERSION, never an edit: the pin
 * moves to 3, which becomes the current ceremony register, and a standing data
 * directory keeps every earlier version exactly as the run that used it left
 * it. Raising this constant is the whole of the change — the historical import
 * needs no base and no contiguity, and the mandatory-row profile for the new
 * version is declared by `register._algorithm_publication_profile_guard`
 * (`migrations/0061_algorithm_publication_profiles.sql:10-37`) as it is sealed.
 *
 * NOTE for the next refit: `importHistorical` refuses any version above 4
 * (`packages/register/src/register-publication.ts:777`,
 * `migrations/0055_register_support_publication.sql:1288`), so exactly ONE rung
 * is left on this ladder. A refit after that one needs the ceremony's seeding
 * path changed, not this number.
 */
export const ACCEPTANCE_REGISTER_VERSION = 3 as const;
/**
 * The version that predates the T16 lane — the one a ceremony database created
 * before it holds. It names that fact, not "the version below the pin", so the
 * refit does not move it; nothing reads it (grep: this line only).
 */
export const ACCEPTANCE_HISTORICAL_REGISTER_VERSION = 1 as const;
export const ACCEPTANCE_REGISTER_SOURCE_REF = "acceptance:DR-133:V-approved" as const;
export const ACCEPTANCE_CONVERGENCE_SOURCE_REF = "acceptance:DR-136:V-approved" as const;
export const ACCEPTANCE_DISCOVERY_SOURCE_REF = "acceptance:DR-182:V-approved" as const;
export const ACCEPTANCE_RUN_DEATH_POLICY_SOURCE_REF = "acceptance:DR-174:V-approved" as const;
export const ACCEPTANCE_HIDDEN_SCORE_SOURCE_REF = "acceptance:DR-176:V-approved" as const;
/** DR-142: V approved the normative claimTypeCompositionMap entry; the map
 * row carries the ruling that approved its current value-set (same
 * discipline as DR-136's convergenceStopDefaults). */
export const ACCEPTANCE_COMPOSITION_MAP_SOURCE_REF = "acceptance:DR-142:V-approved" as const;
/** DR-177 extends the FAIR-02 roster with Grok Build, maker xAI. */
export const ACCEPTANCE_PROVIDER_SET_SOURCE_REF = "acceptance:DR-177:V-approved" as const;
/** FAIR-01 / DR-144: V ruled the DR-074 mandatory deployment scoringOperator
 * row = "accumulate" (provisional pending the DR-023 sitting). The row is
 * seeded byte-faithfully with this ruling's provenance; the runner resolves
 * it through the SHIPPED resolveScoringOperator chain (P8) and records the
 * supplying level on the propagation receipt. */
export const ACCEPTANCE_SCORING_OPERATOR_SOURCE_REF = "acceptance:DR-144:V-approved" as const;
/** T16 (goal-v4 80-96): ceremony provenance for the sealed algorithm rows. */
export const ACCEPTANCE_ALGORITHM_SOURCE_REF = "acceptance:T16-algorithm-register" as const;

/** GROK-01 (DR-177) roster — the single source for the configured provider set
 * row AND for T16's provider→family map, so the two can never disagree. */
export const ACCEPTANCE_CONFIGURED_PROVIDERS = Object.freeze([
  Object.freeze({ providerRef: "acceptance:codex-cli", adapterKind: "openai-compatible-http" as const, maker: "OpenAI" }),
  Object.freeze({ providerRef: "acceptance:claude-cli", adapterKind: "openai-compatible-http" as const, maker: "Anthropic" }),
  Object.freeze({ providerRef: "acceptance:grok-cli", adapterKind: "openai-compatible-http" as const, maker: "xAI" })
]);

function acceptanceProviderFamilies(): readonly ProviderFamilyEntry[] {
  const byMaker = new Map<string, string[]>();
  for (const provider of ACCEPTANCE_CONFIGURED_PROVIDERS) {
    const refs = byMaker.get(provider.maker);
    if (refs === undefined) byMaker.set(provider.maker, [provider.providerRef]);
    else refs.push(provider.providerRef);
  }
  return Object.freeze([...byMaker].map(([familyRef, providerRefs]) =>
    Object.freeze({ familyRef, providerRefs: Object.freeze([...providerRefs]) })
  ));
}

/**
 * T16 · the ceremony's synthesizer/evaluator identities (ruling J8): the first
 * two configured providers of DIFFERENT makers. Goal 84-85 permits identical
 * refs, so an operator override exists; an override naming an unconfigured
 * provider fails loudly rather than sealing a role nothing can serve.
 */
export function resolveAcceptanceSynthesisRoleRefs(
  source: NodeJS.ProcessEnv = process.env
): Readonly<{ synthesizerRoleRef: string; evaluatorRoleRef: string }> {
  const families = acceptanceProviderFamilies();
  const configured = new Set<string>(
    ACCEPTANCE_CONFIGURED_PROVIDERS.map((provider) => provider.providerRef)
  );
  const resolve = (override: string | undefined, fallback: string): string => {
    if (override === undefined || override.trim() === "") return fallback;
    if (!configured.has(override)) {
      throw new TypeError(`ACCEPTANCE_ALGORITHM_REGISTER_ROLE_REF_UNCONFIGURED:${override}`);
    }
    return override;
  };
  return Object.freeze({
    synthesizerRoleRef: resolve(source.ACCEPTANCE_SYNTHESIZER_ROLE_REF, families[0]!.providerRefs[0]!),
    evaluatorRoleRef: resolve(source.ACCEPTANCE_EVALUATOR_ROLE_REF, families[1]!.providerRefs[0]!)
  });
}

/** T16 · the ceremony's copy of every sealed algorithm row. Same ruled values as
 * the dev deployment register; ceremony provenance and ceremony role identities. */
export function buildAcceptanceAlgorithmRegisterRows(
  roleRefs: Readonly<{ synthesizerRoleRef: string; evaluatorRoleRef: string }>
    = resolveAcceptanceSynthesisRoleRefs()
): readonly AcceptanceRegisterRow[] {
  return buildAlgorithmRegisterRows({
    deploymentSourceRef: ACCEPTANCE_ALGORITHM_SOURCE_REF,
    synthesizerRoleRef: roleRefs.synthesizerRoleRef,
    evaluatorRoleRef: roleRefs.evaluatorRoleRef,
    providerFamilies: acceptanceProviderFamilies()
  });
}

export interface AcceptanceRegisterRow {
  readonly rowKey: string;
  readonly value: unknown;
  readonly sourceRef: string;
}

const digest = (text: string): string => createHash("sha256").update(text).digest("hex");



async function computeContractHashes(): Promise<readonly AcceptanceRegisterRow[]> {
  const [propagation, serve] = await Promise.all([
    readFile(new URL("../packages/propagation/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../packages/serve/src/index.ts", import.meta.url), "utf8")
  ]);
  const values = {
    // RUN1 (V-11 addendum): every prompt is now `SAFETY FRAME OWNED BY CODE +
    // INSTRUCTION TEXT`, so a fingerprint taken over a SEARCH of the source no
    // longer describes what is sent. Each row is the digest of the prompt
    // contracts themselves, through `promptContractFingerprintText`, which
    // folds in the frame version — so a change to the frame, to a code-owned
    // answer form, or to an owner's instruction slot is a NEW sealed version
    // and none of them can ship under an old hash.
    judgeContractHash: digest(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT),
    composerContractHash: digest(promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT)),
    conformanceContractHash: digest(promptContractFingerprintText(EVALUATOR_PROMPT_CONTRACT)),
    // codex r2 B1a: the fingerprint is taken from the constant the runner
    // SENDS, not from a search of the runner's source. There is nothing left
    // for a comment, string, regex or template literal to confuse.
    propagationContractHash: digest(propagation),
    serveContractHash: digest(serve)
  };
  return Object.entries(values).map(([rowKey, value]) => ({
    rowKey,
    value,
    sourceRef: ACCEPTANCE_REGISTER_SOURCE_REF
  }));
}

export async function buildAcceptanceRegisterRows(): Promise<readonly AcceptanceRegisterRow[]> {
  const ruledRows: readonly AcceptanceRegisterRow[] = [
    { rowKey: "riskTier", value: "standard", sourceRef: ACCEPTANCE_REGISTER_SOURCE_REF },
    {
      rowKey: "claimTypeCompositionMap",
      value: {
        kind: "CLAIM_TYPE_COMPOSITION_MAP",
        entries: {
          unknown: {
            branch: "EVIDENCE_AWARE",
            clarityDecayPerAmbiguity: 0.1,
            terms: [{ metric: "steelman_fidelity", coefficient: 1 }],
            caps: [],
            uncertaintyLadder: [{ atMost: 1, label: "PROVISIONAL" }]
          },
          // DR-142 (V-approved, seeded byte-faithfully as posted).
          normative: {
            branch: "EVIDENCE_AWARE",
            clarityDecayPerAmbiguity: 0.1,
            terms: [{ metric: "steelman_fidelity", coefficient: 1 }],
            caps: [],
            uncertaintyLadder: [{ atMost: 1, label: "PROVISIONAL" }]
          },
          // DR-151 (V-approved, UI question card): the six remaining members of
          // CLAIM_TYPES, each ratified with the SAME shape already ruled for
          // `normative`, so that no question can be refused for want of a
          // composition. V ruled this knowing the consequence: because every
          // entry is identical, claim type has NO differential effect on
          // scoring yet — this ends the wall, it does not model the types.
          // Real per-type compositions are their own future sitting.
          empirical: {
            branch: "EVIDENCE_AWARE",
            clarityDecayPerAmbiguity: 0.1,
            terms: [{ metric: "steelman_fidelity", coefficient: 1 }],
            caps: [],
            uncertaintyLadder: [{ atMost: 1, label: "PROVISIONAL" }]
          },
          causal: {
            branch: "EVIDENCE_AWARE",
            clarityDecayPerAmbiguity: 0.1,
            terms: [{ metric: "steelman_fidelity", coefficient: 1 }],
            caps: [],
            uncertaintyLadder: [{ atMost: 1, label: "PROVISIONAL" }]
          },
          definitional: {
            branch: "EVIDENCE_AWARE",
            clarityDecayPerAmbiguity: 0.1,
            terms: [{ metric: "steelman_fidelity", coefficient: 1 }],
            caps: [],
            uncertaintyLadder: [{ atMost: 1, label: "PROVISIONAL" }]
          },
          prediction: {
            branch: "EVIDENCE_AWARE",
            clarityDecayPerAmbiguity: 0.1,
            terms: [{ metric: "steelman_fidelity", coefficient: 1 }],
            caps: [],
            uncertaintyLadder: [{ atMost: 1, label: "PROVISIONAL" }]
          },
          comparative: {
            branch: "EVIDENCE_AWARE",
            clarityDecayPerAmbiguity: 0.1,
            terms: [{ metric: "steelman_fidelity", coefficient: 1 }],
            caps: [],
            uncertaintyLadder: [{ atMost: 1, label: "PROVISIONAL" }]
          },
          mixed: {
            branch: "EVIDENCE_AWARE",
            clarityDecayPerAmbiguity: 0.1,
            terms: [{ metric: "steelman_fidelity", coefficient: 1 }],
            caps: [],
            uncertaintyLadder: [{ atMost: 1, label: "PROVISIONAL" }]
          }
        }
      },
      sourceRef: ACCEPTANCE_COMPOSITION_MAP_SOURCE_REF
    },
    {
      rowKey: "wayOfKnowingCeiling",
      value: {
        bandOrder: [...ENGINE_BAND_ORDER],
        ceilingLabels: ["DEFAULT_CEILING", "REASONING_CEILING", "NO_VERIFIED_EVIDENCE_FLOOR"],
        defaultCeiling: { label: "DEFAULT_CEILING", ceilingBand: "FULL", liftPath: "retain-band" },
        cuts: [{
          minimumShares: { REASONING: 0.5 },
          label: "REASONING_CEILING",
          ceilingBand: "CAPPED",
          liftPath: "gather-evidence-to-lift"
        }],
        // F-T9B-3: the floor a run is entitled to on NO VERIFIED EVIDENCE —
        // reached when the evaluator's citation-tracing criterion failed and
        // the cited set is empty. It exists because the reasoning-share cut
        // above names the right band for that case and the WRONG REASON: its
        // trigger is a REASONING share of 0.5, which cannot fire on an empty
        // basis. The lift path is "gather ANY evidence" rather than "gather
        // evidence to lift", because nothing was verified at all.
        emptyBasisFloor: {
          label: "NO_VERIFIED_EVIDENCE_FLOOR",
          ceilingBand: "CAPPED",
          liftPath: "gather-any-verified-evidence-to-lift"
        }
      },
      sourceRef: ACCEPTANCE_REGISTER_SOURCE_REF
    },
    {
      rowKey: "acceptanceOrganCostBounds",
      value: {
        kind: "ACCEPTANCE_ORGAN_COST_BOUNDS",
        organs: {
          JUDGE: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 180_000 },
          COMPOSER: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 60_000 },
          CONFORMANCE: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 60_000 }
        }
      },
      sourceRef: ACCEPTANCE_REGISTER_SOURCE_REF
    },
    {
      rowKey: "runDeathPolicy",
      value: {
        kind: "RUN_DEATH_POLICY",
        cooldown_ms: 600_000,
        final_retry_attempts: 1,
        max_cooldown_holds_per_run: 2,
        applies_to: "TRANSPORT_EXHAUSTION"
      },
      sourceRef: ACCEPTANCE_RUN_DEATH_POLICY_SOURCE_REF
    },
    {
      rowKey: "hiddenNodeScoreThreshold",
      value: 0.35,
      sourceRef: ACCEPTANCE_HIDDEN_SCORE_SOURCE_REF
    },
    {
      rowKey: "panelDiscoveryPolicy",
      value: {
        kind: "PANEL_DISCOVERY_POLICY",
        probe_freshness_ms: 600_000,
        probe_max_attempts: 1
      },
      sourceRef: ACCEPTANCE_DISCOVERY_SOURCE_REF
    },
    {
      rowKey: "compositionBundleBudget",
      value: { low: 10_000, medium: 20_000, high: 30_000 },
      sourceRef: ACCEPTANCE_REGISTER_SOURCE_REF
    },
    { rowKey: "convergenceEpsilon", value: 0.001, sourceRef: ACCEPTANCE_REGISTER_SOURCE_REF },
    {
      rowKey: "convergenceStopDefaults",
      value: {
        kind: "CONVERGENCE_STOP_DEFAULTS",
        members: { maxRounds: 3, stopWhenDeltaBelowEpsilon: true }
      },
      sourceRef: ACCEPTANCE_CONVERGENCE_SOURCE_REF
    },
    {
      rowKey: "livenessPolicy",
      // DR-141(3): the canonical shape is the SHIPPED reader's classes{}
      // record (packages/register readLivenessPolicy); the evaluator's
      // tolerant dual-read remains for older recordings.
      value: {
        kind: "LIVENESS_POLICY",
        classes: {
          standard: {
            review_after_ms: 7 * 24 * 60 * 60 * 1_000,
            retire_after_ms: 180 * 24 * 60 * 60 * 1_000
          }
        }
      },
      sourceRef: ACCEPTANCE_REGISTER_SOURCE_REF
    },
    // DR-144 (V-approved, seeded byte-faithfully as ruled): the DR-074
    // mandatory deployment operator row. Value is the closed-vocabulary
    // member "accumulate"; provisional pending the DR-023 sitting.
    { rowKey: "scoringOperator", value: "accumulate", sourceRef: ACCEPTANCE_SCORING_OPERATOR_SOURCE_REF },
    {
      rowKey: "configuredProviderSet",
      // GROK-01 (DR-177): the Grok Build CLI relay, maker xAI, joins OpenAI
      // and Anthropic so the capability read honestly reports three configured
      // makers. requiredDistinctMakers stays 1:
      // DR-137 keeps mono-model admission lawful for casual/standard tiers;
      // the more-than-one-maker fair-debate requirement is DR-140(b) run-level
      // law, enforced on the debate itself, not a deployment capability floor.
      value: {
        kind: "CONFIGURED_PROVIDER_SET",
        requiredDistinctMakers: 1,
        providers: ACCEPTANCE_CONFIGURED_PROVIDERS.map((provider) => ({
          providerRef: provider.providerRef,
          adapterKind: provider.adapterKind,
          maker: provider.maker
        }))
      },
      sourceRef: ACCEPTANCE_PROVIDER_SET_SOURCE_REF
    },
    ...buildAcceptanceAlgorithmRegisterRows()
  ];
  return Object.freeze(
    [...ruledRows, ...await computeContractHashes()].map((row) => Object.freeze(row))
  );
}

function acceptanceValueAst(value: unknown): CanonicalJsonAst {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return canonicalDecimal(String(value));
  if (Array.isArray(value)) return Object.freeze(value.map(acceptanceValueAst));
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, member]) => [key, acceptanceValueAst(member)])
    ));
  }
  throw new TypeError("ACCEPTANCE_REGISTER_VALUE_INVALID");
}

/**
 * The EXACT publication rows `seedAcceptanceRegister` seals into
 * `ACCEPTANCE_REGISTER_VERSION` — the bootstrap rows plus every acceptance row,
 * including the fifteen the `register.required_row` manifest
 * (`migrations/0050_t16_algorithm_register_rows.sql:31-45`) declares mandatory for
 * that version, `envelope:envelopeFormulaInputs` among them.
 *
 * Exported so a fixture that has to stand a database up in a PRE-seeding state
 * seals a COMPLETE version and varies only the row it is about. Sealing a subset
 * of a declared version is rejected by `register.assert_required_rows` at the
 * seal itself (`:58-91`), which is that guard working, not a fixture affordance
 * to route around.
 */
export async function buildAcceptanceRegisterPublicationRows(): Promise<readonly RegisterPublicationRow[]> {
  const [bootstrap, acceptanceRows] = await Promise.all([
    loadBootstrapRegister(),
    buildAcceptanceRegisterRows()
  ]);
  const bootstrapRows: readonly AcceptanceRegisterRow[] = Object.entries(bootstrap.values).map(([rowKey, value]) => ({
    rowKey,
    value,
    sourceRef: bootstrap.resolution[rowKey as keyof typeof bootstrap.resolution]
  }));
  return Object.freeze([...bootstrapRows, ...acceptanceRows].map((row) =>
    Object.freeze({
      rowKey: row.rowKey,
      valueJsonText: canonicalRegisterJson(acceptanceValueAst(row.value)),
      sourceRef: row.sourceRef
    })
  ));
}

export async function seedAcceptanceRegister(pool: Pool): Promise<{ readonly rowCount: number }> {
  // Ruling J7: the ceremony's seeding path is a T16 startup surface.
  const roleRefs = resolveAcceptanceSynthesisRoleRefs();
  warnOnIdenticalSynthesisRoleRefs({
    synthesizerRoleRef: roleRefs.synthesizerRoleRef,
    evaluatorRoleRef: roleRefs.evaluatorRoleRef,
    deploymentRef: ACCEPTANCE_ALGORITHM_SOURCE_REF
  });
  const publicationRows = await buildAcceptanceRegisterPublicationRows();
  const receipt = await createPostgresRegisterPublicationPort(pool).importHistorical({
    registerVersion: parseRegisterVersionText(String(ACCEPTANCE_REGISTER_VERSION)),
    rows: publicationRows
  });
  await pool.query("SELECT register.assert_required_rows($1)", [ACCEPTANCE_REGISTER_VERSION]);
  return Object.freeze({ rowCount: receipt.rowCount });
}
