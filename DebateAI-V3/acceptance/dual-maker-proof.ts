import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { Pool } from "pg";
import { createPostgresProviderGateway } from "@debateai/runner";
import { startClaudeRelay, type ClaudeRelayHandle } from "./claude-relay.js";
import { ACCEPTANCE_MODEL, startModelShim, type ModelShimHandle } from "./model-shim.js";
import type { CommandSpec } from "./relay-core.js";
import { readAcceptanceRuntimePolicy, type AcceptanceRuntimePolicy } from "./runtime-policy.js";
import { seedAcceptanceRegister } from "./seed-register.js";
import { startStandingDatabase, type StandingDatabase } from "./standing-db.js";

/**
 * FAIR-02 DONE-gate driver: one LIVE call round-trips through BOTH configured
 * makers (codex/OpenAI and claude/Anthropic) via the real Postgres provider
 * gateway, so every call persists its honest lineage row (ledger.raw_artifact:
 * one maker per artifact, never blended) and its MODEL_CALL ledger entry.
 *
 * Orchestrator command (live, from a plain terminal so the claude CLI sees its
 * own keychain auth):
 *
 *   ACCEPTANCE_DB_PORT=<port> ./node_modules/.bin/tsx acceptance/dual-maker-proof.ts
 *
 * The proof seeds the acceptance register first, so the loud stale-row stop
 * (ACCEPTANCE_REGISTER_CONFLICT:configuredProviderSet against a pre-FAIR-02
 * standing .pgdata) applies before any model call is made.
 */

export const DUAL_MAKER_PROOF_CONTRACT_TEXT =
  "FAIR-02 dual-maker transport proof (DR-140). You are one of two independent model makers; answer the user's request directly." as const;
const PROOF_USER_LINE = "Reply with the single word: OK";

const digest = (text: string): string => createHash("sha256").update(text).digest("hex");

export interface DualMakerProofArtifact {
  readonly providerRef: string;
  readonly maker: string;
  readonly model: string;
  readonly rawArtifactRef: string;
  readonly ledgerEntryRef: string;
  readonly content: string;
}

export interface DualMakerProofReport {
  readonly artifacts: readonly DualMakerProofArtifact[];
  /** The distinct makers re-read from the PERSISTED lineage rows. */
  readonly persistedMakers: readonly string[];
}

export interface DualMakerProofOptions {
  /** Reuse an existing standing pool (its lifecycle stays with the caller)… */
  readonly pool?: Pool;
  /** …or provision the standing acceptance database on this port. */
  readonly databasePort?: number;
  readonly testOnlyCodexCommand?: CommandSpec;
  readonly testOnlyClaudeCommand?: CommandSpec;
}

async function callThroughMaker(input: {
  readonly pool: Pool;
  readonly endpoint: string;
  readonly model: string;
  readonly provider: { readonly providerRef: string; readonly maker: string };
  readonly policy: AcceptanceRuntimePolicy;
}): Promise<DualMakerProofArtifact> {
  const gateway = createPostgresProviderGateway(input.pool, {
    endpoint: input.endpoint,
    model: input.model,
    maker: input.provider.maker
  });
  const result = await gateway.call({
    runId: null,
    subjectItemId: `acceptance:dual-maker-proof:${randomUUID()}`,
    callSiteKey: `acceptance:dual-maker-proof:${input.provider.providerRef}`,
    role: "JUDGE",
    lane: "served",
    bound: input.policy.bounds.JUDGE,
    contractHash: digest(DUAL_MAKER_PROOF_CONTRACT_TEXT),
    providerRef: input.provider.providerRef,
    packet: {
      messages: [
        { role: "system", content: DUAL_MAKER_PROOF_CONTRACT_TEXT },
        { role: "user", content: PROOF_USER_LINE }
      ]
    }
  });
  return Object.freeze({
    providerRef: input.provider.providerRef,
    maker: result.maker,
    model: result.model,
    rawArtifactRef: result.rawArtifactRef,
    ledgerEntryRef: result.ledgerEntryRef,
    content: result.content
  });
}

export async function runDualMakerProof(options: DualMakerProofOptions): Promise<DualMakerProofReport> {
  let ownedDatabase: StandingDatabase | null = null;
  let shim: ModelShimHandle | null = null;
  let relay: ClaudeRelayHandle | null = null;
  try {
    let pool: Pool;
    if (options.pool !== undefined) {
      pool = options.pool;
    } else if (options.databasePort !== undefined) {
      ownedDatabase = await startStandingDatabase({ port: options.databasePort });
      pool = ownedDatabase.pool;
    } else {
      throw new TypeError("DUAL_MAKER_PROOF_DATABASE_UNSPECIFIED");
    }
    await seedAcceptanceRegister(pool);
    const policy = await readAcceptanceRuntimePolicy(pool);
    shim = await startModelShim({
      port: 0,
      timeoutMs: policy.bounds.JUDGE.deadlineMs,
      ...(options.testOnlyCodexCommand !== undefined ? { testOnlyCommand: options.testOnlyCodexCommand } : {})
    });
    relay = await startClaudeRelay({
      port: 0,
      timeoutMs: policy.bounds.JUDGE.deadlineMs,
      ...(options.testOnlyClaudeCommand !== undefined ? { testOnlyCommand: options.testOnlyClaudeCommand } : {})
    });
    const artifacts = [
      await callThroughMaker({
        pool,
        endpoint: `${shim.baseUrl}/v1`,
        model: ACCEPTANCE_MODEL,
        provider: policy.providers[0]!,
        policy
      }),
      await callThroughMaker({
        pool,
        endpoint: `${relay.baseUrl}/v1`,
        // DR-115: the Anthropic model id comes from the relay's real CLI
        // handshake, never from a literal in this file.
        model: relay.model,
        provider: policy.providers[1]!,
        policy
      })
    ];
    const persisted = await pool.query<{ raw_artifact_id: string; maker: string; model_id: string; provider_ref: string }>(
      `SELECT raw_artifact_id, maker, model_id, provider_ref FROM ledger.raw_artifact
       WHERE raw_artifact_id = ANY($1::uuid[]) ORDER BY maker`,
      [artifacts.map((artifact) => artifact.rawArtifactRef)]
    );
    if (persisted.rows.length !== artifacts.length) {
      throw new Error("DUAL_MAKER_PROOF_LINEAGE_MISSING");
    }
    for (const artifact of artifacts) {
      const row = persisted.rows.find((candidate) => candidate.raw_artifact_id === artifact.rawArtifactRef);
      if (row === undefined || row.maker !== artifact.maker || row.model_id !== artifact.model
        || row.provider_ref !== artifact.providerRef) {
        throw new Error(`DUAL_MAKER_PROOF_LINEAGE_DISHONEST:${artifact.providerRef}`);
      }
    }
    const persistedMakers = [...new Set(persisted.rows.map((row) => row.maker))].sort();
    const declaredMakers = policy.providers.slice(0, 2).map((provider) => provider.maker).sort();
    if (persistedMakers.length !== declaredMakers.length
      || persistedMakers.some((maker, index) => maker !== declaredMakers[index])) {
      throw new Error(`DUAL_MAKER_PROOF_MAKERS_UNSATISFIED:${persistedMakers.join(",")}`);
    }
    return Object.freeze({ artifacts: Object.freeze(artifacts), persistedMakers: Object.freeze(persistedMakers) });
  } finally {
    await relay?.close().catch(() => undefined);
    await shim?.close().catch(() => undefined);
    await ownedDatabase?.stop().catch(() => undefined);
  }
}

const proofEnvironmentSchema = z.object({
  ACCEPTANCE_DB_PORT: z.coerce.number().int().positive().max(65_535)
}).strict();

async function main(): Promise<void> {
  const keys = Object.keys(proofEnvironmentSchema.shape);
  const environment = proofEnvironmentSchema.parse(
    Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  );
  const report = await runDualMakerProof({ databasePort: environment.ACCEPTANCE_DB_PORT });
  console.info("FAIR-02 dual-maker proof: PERSISTED LINEAGE");
  for (const artifact of report.artifacts) {
    console.info(JSON.stringify(artifact));
  }
  console.info(`FAIR-02 distinct persisted makers: ${report.persistedMakers.join(", ")}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
