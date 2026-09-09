import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import {
  canonicalDecimal,
  canonicalRegisterJson,
  createPostgresRegisterPublicationPort,
  loadBootstrapRegister,
  parseRegisterVersionText,
  type CanonicalJsonAst,
  type RegisterPublicationRow
} from "@debateai/register";

export const ACCEPTANCE_REGISTER_VERSION = 1 as const;
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

export interface AcceptanceRegisterRow {
  readonly rowKey: string;
  readonly value: unknown;
  readonly sourceRef: string;
}

const digest = (text: string): string => createHash("sha256").update(text).digest("hex");

function requireMatch(source: string, expression: RegExp, label: string): string {
  const value = source.match(expression)?.[1];
  if (value === undefined) throw new Error(`SHIPPED_CONTRACT_TEXT_UNRESOLVED:${label}`);
  return value;
}

async function computeContractHashes(): Promise<readonly AcceptanceRegisterRow[]> {
  const [judge, runner, propagation, serve] = await Promise.all([
    readFile(new URL("../packages/judgement/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../apps/runner/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../packages/propagation/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../packages/serve/src/index.ts", import.meta.url), "utf8")
  ]);
  const conformanceTexts = [...runner.matchAll(/content: "(Return only JSON \{(?:conforms,findings|pass)\}[^\"]+)"/g)]
    .map((match) => match[1]!);
  if (conformanceTexts.length !== 2) {
    throw new Error("SHIPPED_CONTRACT_TEXT_UNRESOLVED:conformance");
  }
  const values = {
    judgeContractHash: digest(requireMatch(judge, /content: `([\s\S]*?)`/, "judge")),
    composerContractHash: digest(requireMatch(
      runner,
      /content: "(Return only JSON with a segments array[^"]+)"/,
      "composer"
    )),
    conformanceContractHash: digest(conformanceTexts.join("\n")),
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
        bandOrder: ["CAPPED", "FULL"],
        ceilingLabels: ["DEFAULT_CEILING", "REASONING_CEILING"],
        defaultCeiling: { label: "DEFAULT_CEILING", ceilingBand: "FULL", liftPath: "retain-band" },
        cuts: [{
          minimumShares: { REASONING: 0.5 },
          label: "REASONING_CEILING",
          ceilingBand: "CAPPED",
          liftPath: "gather-evidence-to-lift"
        }]
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
        providers: [{
          providerRef: "acceptance:codex-cli",
          adapterKind: "openai-compatible-http",
          maker: "OpenAI"
        }, {
          providerRef: "acceptance:claude-cli",
          adapterKind: "openai-compatible-http",
          maker: "Anthropic"
        }, {
          providerRef: "acceptance:grok-cli",
          adapterKind: "openai-compatible-http",
          maker: "xAI"
        }]
      },
      sourceRef: ACCEPTANCE_PROVIDER_SET_SOURCE_REF
    }
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

export async function seedAcceptanceRegister(pool: Pool): Promise<{ readonly rowCount: number }> {
  const [bootstrap, acceptanceRows] = await Promise.all([
    loadBootstrapRegister(),
    buildAcceptanceRegisterRows()
  ]);
  const bootstrapRows: readonly AcceptanceRegisterRow[] = Object.entries(bootstrap.values).map(([rowKey, value]) => ({
    rowKey,
    value,
    sourceRef: bootstrap.resolution[rowKey as keyof typeof bootstrap.resolution]
  }));
  const rows = [...bootstrapRows, ...acceptanceRows];
  const publicationRows: readonly RegisterPublicationRow[] = Object.freeze(rows.map((row) =>
    Object.freeze({
      rowKey: row.rowKey,
      valueJsonText: canonicalRegisterJson(acceptanceValueAst(row.value)),
      sourceRef: row.sourceRef
    })
  ));
  const receipt = await createPostgresRegisterPublicationPort(pool).importHistorical({
    registerVersion: parseRegisterVersionText(String(ACCEPTANCE_REGISTER_VERSION)),
    rows: publicationRows
  });
  return Object.freeze({ rowCount: receipt.rowCount });
}
