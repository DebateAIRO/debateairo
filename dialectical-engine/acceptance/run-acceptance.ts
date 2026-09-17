import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { AskAcceptedSchema, AskRequestSchema, AnswerSchema, type AskRequest } from "@debateai/contract";
import { ProviderProbeRepository } from "@debateai/db";
import { announceAbsentMakers } from "./absent-makers.js";
import { startClaudeRelay, type ClaudeRelayHandle } from "./claude-relay.js";
import {
  readDefinitionOfDoneFacts,
  renderDefinitionOfDoneLines,
  type DefinitionOfDoneFacts
} from "./dod-facts.js";
import { startGrokRelay, type GrokRelayHandle } from "./grok-relay.js";
import { assertFairDebate, type FairDebateReport } from "./fair-debate.js";
import {
  acceptanceServiceRequestHeaders,
  createAcceptanceRuntime,
  loadAcceptanceCeremonyEnvironment,
  type AcceptanceEnvironment
} from "./main.js";
import { startModelShim, type ModelShimHandle } from "./model-shim.js";
import { readAcceptanceRuntimePolicy } from "./runtime-policy.js";
import { seedAcceptanceRegister } from "./seed-register.js";
import { startStandingDatabase, type StandingDatabase } from "./standing-db.js";

export interface AcceptanceArguments {
  readonly serviceCredential: string;
  readonly ask: AskRequest;
  /** TERM-01 rider: keep DB + shim + API standing after settle so the UI at
   * :3000 browses the result (replaces the ad-hoc standing script). */
  readonly serve: boolean;
}

/**
 * F-CREDENTIAL-ON-ARGV. The argument name that carries the service credential is
 * deliberately ABSENT from this set and must never return to it: the credential
 * is read from the environment and from nowhere else. The name is refused by
 * `parseAcceptanceArguments` before any other check, so an operator who still
 * types the old shape reads the specific reason rather than a generic
 * unknown-argument line.
 */
const credentialArgument = "--service-credential";

/** The environment key the operator exports in their own shell before the run. */
const credentialEnvironmentKey = "ACCEPTANCE_SERVICE_CREDENTIAL";

const supportedArguments = new Set([
  "--question",
  "--risk-tier",
  "--tier-provenance-ref",
  "--composition-budget-tier",
  "--depth-params",
  "--decision-scope",
  "--as-of",
  "--steering-presets",
  "--steering-annotations"
]);

function argumentMap(arguments_: readonly string[]): ReadonlyMap<string, string> {
  const output = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    if (name === undefined || !supportedArguments.has(name)) {
      throw new Error(`UNKNOWN_ACCEPTANCE_ARGUMENT:${String(name)}`);
    }
    const value = arguments_[index + 1];
    if (value === undefined) throw new Error(`ACCEPTANCE_ARGUMENT_VALUE_REQUIRED:${name}`);
    if (output.has(name)) throw new Error(`DUPLICATE_ACCEPTANCE_ARGUMENT:${name}`);
    output.set(name, value);
  }
  return output;
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`ACCEPTANCE_ARGUMENT_JSON_INVALID:${label}`, { cause: error });
  }
}

export function parseAcceptanceArguments(
  arguments_: readonly string[],
  now: Date = new Date(),
  environment: NodeJS.ProcessEnv = process.env
): AcceptanceArguments {
  /**
   * F-CREDENTIAL-ON-ARGV, decided FIRST — before the unknown-argument check and
   * before the missing-value check — so the operator reads this reason and not a
   * generic one. A process's arguments are readable by every user of the machine
   * through the process list for the whole of the run; its environment is not.
   * The offered value is never repeated in the message, in any form.
   */
  if (arguments_.includes(credentialArgument)) {
    throw new Error(
      `ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED:${credentialArgument} is no longer read from the ` +
      `command line; export ${credentialEnvironmentKey} in your own shell instead`
    );
  }
  // "--serve" is the one value-less flag; extract it before pair parsing.
  const serveCount = arguments_.filter((argument) => argument === "--serve").length;
  if (serveCount > 1) throw new Error("DUPLICATE_ACCEPTANCE_ARGUMENT:--serve");
  const values = argumentMap(arguments_.filter((argument) => argument !== "--serve"));
  const serviceCredential = environment[credentialEnvironmentKey];
  if (serviceCredential === undefined || serviceCredential.trim().length === 0) {
    throw new Error("ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED");
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(serviceCredential)) {
    throw new Error("ACCEPTANCE_SERVICE_CREDENTIAL_INVALID");
  }
  const ask = AskRequestSchema.parse({
    // ACC-01 N1: the default question must carry its own proposal — a
    // question referring to an unsupplied proposal makes the judge honestly
    // refuse (restatement FAIL) and the run terminates components-only.
    question_line: values.get("--question") ?? "What is the strongest case for adopting a four-day workweek at a software company?",
    risk_tier: values.get("--risk-tier") ?? "standard",
    tier_source: "ASKER",
    tier_provenance_ref: values.get("--tier-provenance-ref") ?? "acceptance:cli-default",
    composition_budget_tier: values.get("--composition-budget-tier") ?? "low",
    depth_params: parseJson(values.get("--depth-params") ?? '{"depth":1}', "--depth-params"),
    decision_scope: values.get("--decision-scope") ?? "prototype-acceptance",
    as_of: values.get("--as-of") ?? now.toISOString(),
    steering_presets: parseJson(values.get("--steering-presets") ?? "[]", "--steering-presets"),
    steering_annotations: parseJson(values.get("--steering-annotations") ?? "[]", "--steering-annotations")
  });
  return Object.freeze({ serviceCredential, ask, serve: serveCount === 1 });
}

export interface LiveAcceptanceCeremony {
  readonly runId: string;
  readonly answerId: string;
  readonly uiUrl: string;
  /** FAIR-01: the RUN-LEVEL fair-debate report (DR-140(b), DR-143 clause 1). */
  readonly fairDebate: FairDebateReport;
  /** Retry-tolerant run total: failed/timed-out attempts remain counted. */
  readonly modelCallCount: number;
  readonly discoveredPanelSize: number;
  readonly structuralCeilingMaxModelAttempts: number;
  /**
   * T17: the ENVELOPE_STATE standing at the terminal, read from the same run's
   * progress stream. The Global DoD requires WITHIN; EXHAUSTED is the only
   * other value the runner can leave behind, and the live proofs refuse it.
   */
  readonly terminalEnvelopeState: "WITHIN" | "EXHAUSTED";
  /**
   * The Global definition of done's remaining sub-clauses, read off this same
   * settled run: the panel-reduced taus and their voice counts, the measured
   * attack edges, each root's final strength against its tau, the strongest
   * surviving objection, the evaluator loop record against its sealed bound,
   * the code-derived label, and the band with its basis. Sub-clauses 4 and 9
   * are `structuralCeilingMaxModelAttempts` and `terminalEnvelopeState` above.
   *
   * A DoD OUTCOME (no root differs, an objection standing, a single-voice
   * panel, an UNKNOWN magnitude, no surviving objection) rides this block and
   * the printed report; only a SHAPE violation refuses the ceremony.
   */
  readonly definitionOfDone: DefinitionOfDoneFacts;
  /** Append-only probe evidence rows for this isolated ceremony (boot/admission/claim). */
  readonly providerProbeEvidenceCount: number;
  readonly nodeMakerLineage: readonly {
    readonly nodeId: string;
    readonly depth: number;
    readonly childKind: string | null;
    readonly maker: string;
    readonly modelId: string;
    readonly providerRef: string;
  }[];
  readonly nodeReviewLineage: readonly {
    readonly nodeId: string;
    readonly outcome: "agree" | "dispute" | "cannot-assess";
    readonly authorMaker: string;
    readonly reviewerMaker: string;
    readonly reviewerModelId: string;
    readonly reviewerProviderRef: string;
    readonly reviewArtifactRef: string;
  }[];
  close(): Promise<void>;
}

export interface AcceptanceCeremonyOptions {
  /** Operator/test-owned isolated directory; omitted keeps the standing DB. */
  readonly databaseDataDirectory?: string;
}

async function closeAll(
  database: StandingDatabase | null,
  shim: ModelShimHandle | null,
  claudeRelay: ClaudeRelayHandle | null,
  grokRelay: GrokRelayHandle | null,
  api: Awaited<ReturnType<typeof createAcceptanceRuntime>>["api"] | null
): Promise<void> {
  await api?.close().catch(() => undefined);
  await Promise.all([
    claudeRelay?.close().catch(() => undefined),
    grokRelay?.close().catch(() => undefined)
  ]);
  await shim?.close().catch(() => undefined);
  await database?.stop().catch(() => undefined);
}

export async function runAcceptanceCeremony(
  parsed: AcceptanceArguments,
  source: NodeJS.ProcessEnv = process.env,
  options: AcceptanceCeremonyOptions = {}
): Promise<LiveAcceptanceCeremony> {
  const ceremony = loadAcceptanceCeremonyEnvironment(source);
  let database: StandingDatabase | null = null;
  let shim: ModelShimHandle | null = null;
  let claudeRelay: ClaudeRelayHandle | null = null;
  let grokRelay: GrokRelayHandle | null = null;
  let api: Awaited<ReturnType<typeof createAcceptanceRuntime>>["api"] | null = null;
  try {
    database = await startStandingDatabase({
      port: ceremony.ACCEPTANCE_DB_PORT,
      ...(options.databaseDataDirectory === undefined ? {} : { dataDirectory: options.databaseDataDirectory })
    });
    await seedAcceptanceRegister(database.pool);
    const policy = await readAcceptanceRuntimePolicy(database.pool);
    const relayStarts = await Promise.allSettled([
      startModelShim({
        port: ceremony.ACCEPTANCE_SHIM_PORT,
        timeoutMs: policy.bounds.JUDGE.deadlineMs
      }),
      startClaudeRelay({ port: 0, timeoutMs: policy.bounds.JUDGE.deadlineMs }),
      startGrokRelay({
        port: ceremony.ACCEPTANCE_GROK_RELAY_PORT,
        timeoutMs: policy.bounds.JUDGE.deadlineMs
      })
    ]);
    shim = relayStarts[0]?.status === "fulfilled" ? relayStarts[0].value : null;
    claudeRelay = relayStarts[1]?.status === "fulfilled" ? relayStarts[1].value : null;
    grokRelay = relayStarts[2]?.status === "fulfilled" ? relayStarts[2].value : null;
    const probes = new ProviderProbeRepository(database.pool);
    // F-GROK-SANDBOX-PROFILE outcome (1). The announcement and the ABSENT
    // provider probe come from ONE call, so the ceremony cannot keep the
    // database record while losing the line its own log is read from. The
    // provider refs are named here rather than indexed out of `policy.providers`
    // — only this call site knows which relay sits at which position, and the
    // refs below are the same ones `makerRelays` is built from.
    const namedStarts = (["acceptance:codex-cli", "acceptance:claude-cli", "acceptance:grok-cli"] as const)
      .flatMap((providerRef, index) => {
        const start = relayStarts[index];
        return start === undefined ? [] : [{ providerRef, start }];
      });
    for (const absent of announceAbsentMakers(namedStarts, policy.providers)) {
      await probes.record({
        probeEvidenceRef: randomUUID(),
        providerRef: absent.providerRef,
        maker: absent.maker,
        state: "ABSENT",
        modelId: null,
        failureCode: absent.failureCode,
        probedAt: new Date()
      });
    }
    const runtimeEnvironment: AcceptanceEnvironment = {
      DATABASE_URL: database.connectionString,
      API_HOST: ceremony.ACCEPTANCE_API_HOST,
      API_PORT: ceremony.ACCEPTANCE_API_PORT,
      STRANGER_SAMPLE_RATE: ceremony.ACCEPTANCE_STRANGER_SAMPLE_RATE,
      BATTERY_VERSION: ceremony.ACCEPTANCE_BATTERY_VERSION,
      SETTLEMENT_WATCH_HANDLE: ceremony.ACCEPTANCE_SETTLEMENT_WATCH_HANDLE,
      MODEL_BASE_URL: `${shim?.baseUrl ?? "http://127.0.0.1:1"}/v1`
    };
    const runtime = await createAcceptanceRuntime({
      pool: database.pool,
      environment: runtimeEnvironment,
      serviceCredential:parsed.serviceCredential,
      makerRelays: [
        ...(shim === null ? [] : [{
          providerRef: "acceptance:codex-cli",baseUrl: shim.baseUrl,model: shim.model,
          authorizationHeader:shim.authorizationHeader
        }]),
        ...(claudeRelay === null ? [] : [{
          providerRef: "acceptance:claude-cli",baseUrl: claudeRelay.baseUrl,model: claudeRelay.model,
          authorizationHeader:claudeRelay.authorizationHeader
        }]),
        ...(grokRelay === null ? [] : [{
          providerRef: "acceptance:grok-cli",baseUrl: grokRelay.baseUrl,model: grokRelay.model,
          authorizationHeader:grokRelay.authorizationHeader
        }])
      ]
    });
    api = runtime.api;
    await api.listen({ host: runtimeEnvironment.API_HOST, port: runtimeEnvironment.API_PORT });
    const apiBase = `http://${runtimeEnvironment.API_HOST}:${runtimeEnvironment.API_PORT}`;
    const serviceHeaders = acceptanceServiceRequestHeaders(runtime.serviceSession, apiBase, true);
    const acceptedResponse = await fetch(`${apiBase}/v1/asks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...serviceHeaders
      },
      body: JSON.stringify(parsed.ask)
    });
    if (!acceptedResponse.ok) throw new Error(`ACCEPTANCE_ASK_HTTP_${acceptedResponse.status}`);
    const accepted = AskAcceptedSchema.parse(await acceptedResponse.json());
    // EXEC-01: the API-owned dispatcher must drive the same shipped runner.
    // The ceremony observes the database source of record; it never calls the
    // runner behind the dispatch boundary and thereby masks a dead worker.
    for (;;) {
      const work = await database.pool.query<{ state: string; terminal_reason: string | null }>(
        "SELECT state, terminal_reason FROM core.work_item WHERE run_id=$1 ORDER BY created_at_seq",
        [accepted.run_ref]
      );
      const state = work.rows[0];
      if (state === undefined) throw new Error("ACCEPTANCE_WORK_ITEM_MISSING");
      if (state.state === "DONE") break;
      if (state.state === "FAILED") {
        throw new Error(`ACCEPTANCE_RUN_FAILED:${state.terminal_reason ?? "TYPED_REASON_MISSING"}`);
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    const answerResponse = await fetch(`${apiBase}/v1/runs/${accepted.run_ref}/answer`, {
      headers: acceptanceServiceRequestHeaders(runtime.serviceSession, apiBase, false)
    });
    if (!answerResponse.ok) throw new Error(`ACCEPTANCE_ANSWER_HTTP_${answerResponse.status}`);
    const answer = AnswerSchema.parse(await answerResponse.json());
    // FAIR-01: the RUN-LEVEL fair-debate gate (DR-140(b), DR-143 clause 1) —
    // more than one node, more than one persisted maker, a real attack edge,
    // and a proven independence receipt, all read from the recorded run.
    const fairDebate = await assertFairDebate(database.pool, accepted.run_ref);
    const [modelCalls, lineage, reviewLineage, runFacts, probeEvidence, envelopeState] = await Promise.all([
      database.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ledger.ledger_entry
         WHERE run_id=$1 AND action_kind='MODEL_CALL'`,
        [accepted.run_ref]
      ),
      database.pool.query<{
        node_id: string;
        depth: number;
        child_kind: string | null;
        maker: string;
        model_id: string;
        provider_ref: string;
      }>(
        `SELECT node.node_id, node.depth, node.child_kind,
                artifact.maker, artifact.model_id, artifact.provider_ref
         FROM core.node AS node
         JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id=node.provenance_ref
         WHERE node.run_id=$1 ORDER BY node.created_at_seq`,
        [accepted.run_ref]
      ),
      database.pool.query<{
        node_id: string;
        outcome: "agree" | "dispute" | "cannot-assess";
        author_maker: string;
        reviewer_maker: string;
        reviewer_model_id: string;
        reviewer_provider_ref: string;
        review_artifact_ref: string;
      }>(
        `SELECT review.node_id, review.outcome,
                author.maker AS author_maker,
                reviewer.maker AS reviewer_maker,
                reviewer.model_id AS reviewer_model_id,
                reviewer.provider_ref AS reviewer_provider_ref,
                review.review_raw_artifact_ref::text AS review_artifact_ref
         FROM ledger.node_review AS review
         JOIN ledger.raw_artifact AS author ON author.raw_artifact_id=review.author_raw_artifact_ref
         JOIN ledger.raw_artifact AS reviewer ON reviewer.raw_artifact_id=review.review_raw_artifact_ref
         WHERE review.run_id=$1 ORDER BY review.at_seq`,
        [accepted.run_ref]
      ),
      database.pool.query<{ panel_size: number; structural_ceiling: number }>(
        `SELECT jsonb_array_length(discovered_panel)::int AS panel_size,
                (envelope_basis->>'max_model_attempts')::int AS structural_ceiling
         FROM core.run WHERE run_id=$1`,
        [accepted.run_ref]
      ),
      database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM core.provider_probe"
      ),
      /**
       * T17 (goal 285-295 DoD, Global DoD "envelope WITHIN at terminal"): the
       * envelope state as it stands at the TERMINAL, read from the same run's
       * progress stream that `readCurrentState` reads. `DISTINCT ON (kind)
       * ... ORDER BY at_seq DESC` is the last value written, so this is the
       * terminal value and not the WITHIN the run head was seeded with.
       */
      database.pool.query<{ envelope_state: string }>(
        `SELECT DISTINCT ON (kind) value_json #>> '{}' AS envelope_state
         FROM core.run_progress_event
         WHERE run_id=$1 AND kind='ENVELOPE_STATE'
         ORDER BY kind, at_seq DESC`,
        [accepted.run_ref]
      )
    ]);
    const modelCallCount = Number(modelCalls.rows[0]?.count ?? 0);
    const discoveredPanelSize = Number(runFacts.rows[0]?.panel_size);
    const structuralCeilingMaxModelAttempts = Number(runFacts.rows[0]?.structural_ceiling);
    const providerProbeEvidenceCount = Number(probeEvidence.rows[0]?.count ?? 0);
    const terminalEnvelopeState = envelopeState.rows[0]?.envelope_state;
    if (terminalEnvelopeState !== "WITHIN" && terminalEnvelopeState !== "EXHAUSTED") {
      throw new Error(`ACCEPTANCE_TERMINAL_ENVELOPE_STATE_INVALID:${String(terminalEnvelopeState)}`);
    }
    if (!Number.isInteger(discoveredPanelSize) || discoveredPanelSize < 1
      || !Number.isInteger(structuralCeilingMaxModelAttempts) || structuralCeilingMaxModelAttempts < 1) {
      throw new Error("ACCEPTANCE_RUN_DISCOVERY_FACTS_INVALID");
    }
    const nodeMakerLineage = Object.freeze(lineage.rows.map((row) => Object.freeze({
      nodeId: row.node_id,
      depth: Number(row.depth),
      childKind: row.child_kind,
      maker: row.maker,
      modelId: row.model_id,
      providerRef: row.provider_ref
    })));
    const nodeReviewLineage = Object.freeze(reviewLineage.rows.map((row) => Object.freeze({
      nodeId: row.node_id,
      outcome: row.outcome,
      authorMaker: row.author_maker,
      reviewerMaker: row.reviewer_maker,
      reviewerModelId: row.reviewer_model_id,
      reviewerProviderRef: row.reviewer_provider_ref,
      reviewArtifactRef: row.review_artifact_ref
    })));
    const uiUrl = `http://localhost:3000/debate/${accepted.run_ref}`;
    console.info(`ACC-01 run id: ${accepted.run_ref}`);
    console.info(`ACC-01 answer id: ${answer.answer_id}`);
    console.info(`FAIR-01 graph: ${fairDebate.nodeCount} nodes · ${fairDebate.attackEdgeCount} attack edge(s)`);
    console.info(
      `FAIR-01 makers: ${fairDebate.distinctMakers.join(", ")} · ` +
      `independent attack edges: ${fairDebate.independentAttackEdgeCount}`
    );
    console.info(`PRO-01 model calls (all outcomes): ${modelCallCount}`);
    console.info(
      `DISC-01 panel/ceiling/probe evidence: ${discoveredPanelSize} / ` +
      `${structuralCeilingMaxModelAttempts} / ${providerProbeEvidenceCount}`
    );
    console.info(
      `T17 envelope at terminal: ${terminalEnvelopeState} · ` +
      `${modelCallCount}/${structuralCeilingMaxModelAttempts} model attempts (panel included)`
    );
    console.info(`PRO-01 per-node maker lineage: ${JSON.stringify(nodeMakerLineage)}`);
    console.info(`XREV-01 per-node review lineage: ${JSON.stringify(nodeReviewLineage)}`);
    console.info(`ACC-01 UI: ${uiUrl}`);
    /**
     * The definition-of-done facts, from the run's own relations plus the answer
     * just read through the API. The loop bound is the register row this
     * deployment already resolved — never a literal restated here.
     *
     * READ LAST, AND DELIBERATELY SO. This is the only work the ceremony does
     * after its report could have been printed: three more queries, plus four
     * typed refusals of its own. A throw here reaches the `catch` below, which
     * closes the stack and rethrows — so if this ran first, one transient `pg`
     * error on a closing run that had already settled WITHIN would leave
     * `logs/closing-run/ceremony-*.log` with not one line in it, and the W12
     * judge with less evidence than before this block existed. Every
     * established line is above; the new ones follow. O3's refusals are
     * unchanged — they now cost their own lines and nothing else.
     */
    const definitionOfDone = await readDefinitionOfDoneFacts(database.pool, {
      runId: accepted.run_ref,
      answer,
      sealedEvaluatorLoopMaxRounds: policy.synthesisRolePolicy.evaluatorLoopMaxRounds
    });
    // The remaining Global-DoD sub-clauses, one line each, on the same stream
    // `.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh`
    // captures verbatim.
    for (const line of renderDefinitionOfDoneLines(definitionOfDone)) console.info(line);
    const liveDatabase = database;
    const liveShim = shim;
    const liveClaudeRelay = claudeRelay;
    const liveGrokRelay = grokRelay;
    const liveApi = api;
    return Object.freeze({
      runId: accepted.run_ref,
      answerId: answer.answer_id,
      uiUrl,
      fairDebate,
      modelCallCount,
      discoveredPanelSize,
      structuralCeilingMaxModelAttempts,
      terminalEnvelopeState,
      definitionOfDone,
      providerProbeEvidenceCount,
      nodeMakerLineage,
      nodeReviewLineage,
      close: () => closeAll(liveDatabase, liveShim, liveClaudeRelay, liveGrokRelay, liveApi)
    });
  } catch (error) {
    await closeAll(database, shim, claudeRelay, grokRelay, api);
    throw error;
  }
}

async function main(): Promise<void> {
  const parsed = parseAcceptanceArguments(process.argv.slice(2));
  const ceremony = await runAcceptanceCeremony(parsed);
  if (!parsed.serve) {
    await ceremony.close();
    return;
  }
  // TERM-01 rider: --serve keeps DB + shim + API standing after settle so the
  // UI at :3000 browses the settled debate; Ctrl-C stops the stack.
  console.info("ACC-01 --serve: database, model shim, claude relay and API stay standing; press Ctrl-C to stop.");
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await ceremony.close();
  };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
