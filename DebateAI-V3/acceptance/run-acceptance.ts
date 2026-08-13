import { pathToFileURL } from "node:url";
import { AskAcceptedSchema, AskRequestSchema, AnswerSchema, type AskRequest } from "@debateai/contract";
import { startClaudeRelay, type ClaudeRelayHandle } from "./claude-relay.js";
import { assertFairDebate, type FairDebateReport } from "./fair-debate.js";
import {
  createAcceptanceRuntime,
  loadAcceptanceCeremonyEnvironment,
  type AcceptanceEnvironment
} from "./main.js";
import { startModelShim, type ModelShimHandle } from "./model-shim.js";
import { readAcceptanceRuntimePolicy } from "./runtime-policy.js";
import { seedAcceptanceRegister } from "./seed-register.js";
import { startStandingDatabase, type StandingDatabase } from "./standing-db.js";

export interface AcceptanceArguments {
  readonly token: string;
  readonly ask: AskRequest;
  /** TERM-01 rider: keep DB + shim + API standing after settle so the UI at
   * :3000 browses the result (replaces the ad-hoc standing script). */
  readonly serve: boolean;
}

const supportedArguments = new Set([
  "--token",
  "--question",
  "--risk-tier",
  "--tier-provenance-ref",
  "--composition-budget-tier",
  "--depth-params",
  "--agent-count",
  "--decision-owner",
  "--action-owner",
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
  now: Date = new Date()
): AcceptanceArguments {
  // "--serve" is the one value-less flag; extract it before pair parsing.
  const serveCount = arguments_.filter((argument) => argument === "--serve").length;
  if (serveCount > 1) throw new Error("DUPLICATE_ACCEPTANCE_ARGUMENT:--serve");
  const values = argumentMap(arguments_.filter((argument) => argument !== "--serve"));
  const token = values.get("--token");
  if (token === undefined || token.trim().length === 0) throw new Error("ACCEPTANCE_TOKEN_REQUIRED");
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
    agent_count: Number(values.get("--agent-count") ?? "2"),
    decision_owner: values.get("--decision-owner") ?? "acceptance-user",
    action_owner: values.get("--action-owner") ?? "acceptance-user",
    decision_scope: values.get("--decision-scope") ?? "prototype-acceptance",
    caller_scope: "ASKER",
    as_of: values.get("--as-of") ?? now.toISOString(),
    steering_presets: parseJson(values.get("--steering-presets") ?? "[]", "--steering-presets"),
    steering_annotations: parseJson(values.get("--steering-annotations") ?? "[]", "--steering-annotations")
  });
  return Object.freeze({ token, ask, serve: serveCount === 1 });
}

export interface LiveAcceptanceCeremony {
  readonly runId: string;
  readonly answerId: string;
  readonly uiUrl: string;
  /** FAIR-01: the RUN-LEVEL fair-debate report (DR-140(b), DR-143 clause 1). */
  readonly fairDebate: FairDebateReport;
  /** Retry-tolerant run total: failed/timed-out attempts remain counted. */
  readonly modelCallCount: number;
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
  relay: ClaudeRelayHandle | null,
  api: Awaited<ReturnType<typeof createAcceptanceRuntime>>["api"] | null
): Promise<void> {
  await api?.close().catch(() => undefined);
  await relay?.close().catch(() => undefined);
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
  let relay: ClaudeRelayHandle | null = null;
  let api: Awaited<ReturnType<typeof createAcceptanceRuntime>>["api"] | null = null;
  try {
    database = await startStandingDatabase({
      port: ceremony.ACCEPTANCE_DB_PORT,
      ...(options.databaseDataDirectory === undefined ? {} : { dataDirectory: options.databaseDataDirectory })
    });
    await seedAcceptanceRegister(database.pool);
    const policy = await readAcceptanceRuntimePolicy(database.pool);
    shim = await startModelShim({
      port: ceremony.ACCEPTANCE_SHIM_PORT,
      timeoutMs: policy.bounds.JUDGE.deadlineMs
    });
    // FAIR-01 (DR-140(b)): the SECOND real maker — the FAIR-02 claude CLI
    // relay. Its startup handshake proves the CLI is alive and captures the
    // CLI-reported model id (DR-143(2)/(3)); a dead CLI refuses the ceremony.
    relay = await startClaudeRelay({ port: 0, timeoutMs: policy.bounds.JUDGE.deadlineMs });
    const runtimeEnvironment: AcceptanceEnvironment = {
      DATABASE_URL: database.connectionString,
      API_HOST: ceremony.ACCEPTANCE_API_HOST,
      API_PORT: ceremony.ACCEPTANCE_API_PORT,
      STRANGER_SAMPLE_RATE: ceremony.ACCEPTANCE_STRANGER_SAMPLE_RATE,
      BATTERY_VERSION: ceremony.ACCEPTANCE_BATTERY_VERSION,
      SETTLEMENT_WATCH_HANDLE: ceremony.ACCEPTANCE_SETTLEMENT_WATCH_HANDLE,
      MODEL_BASE_URL: `${shim.baseUrl}/v1`
    };
    const runtime = await createAcceptanceRuntime({
      pool: database.pool,
      environment: runtimeEnvironment,
      criticRelay: { baseUrl: relay.baseUrl, model: relay.model }
    });
    api = runtime.api;
    await api.listen({ host: runtimeEnvironment.API_HOST, port: runtimeEnvironment.API_PORT });
    const apiBase = `http://${runtimeEnvironment.API_HOST}:${runtimeEnvironment.API_PORT}`;
    const acceptedResponse = await fetch(`${apiBase}/v1/asks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-dev-token": parsed.token
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
      headers: { "x-user-dev-token": parsed.token }
    });
    if (!answerResponse.ok) throw new Error(`ACCEPTANCE_ANSWER_HTTP_${answerResponse.status}`);
    const answer = AnswerSchema.parse(await answerResponse.json());
    // FAIR-01: the RUN-LEVEL fair-debate gate (DR-140(b), DR-143 clause 1) —
    // more than one node, more than one persisted maker, a real attack edge,
    // and a proven independence receipt, all read from the recorded run.
    const fairDebate = await assertFairDebate(database.pool, accepted.run_ref);
    const [modelCalls, lineage, reviewLineage] = await Promise.all([
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
      )
    ]);
    const modelCallCount = Number(modelCalls.rows[0]?.count ?? 0);
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
    console.info(`PRO-01 per-node maker lineage: ${JSON.stringify(nodeMakerLineage)}`);
    console.info(`XREV-01 per-node review lineage: ${JSON.stringify(nodeReviewLineage)}`);
    console.info(`ACC-01 UI: ${uiUrl}`);
    const liveDatabase = database;
    const liveShim = shim;
    const liveRelay = relay;
    const liveApi = api;
    return Object.freeze({
      runId: accepted.run_ref,
      answerId: answer.answer_id,
      uiUrl,
      fairDebate,
      modelCallCount,
      nodeMakerLineage,
      nodeReviewLineage,
      close: () => closeAll(liveDatabase, liveShim, liveRelay, liveApi)
    });
  } catch (error) {
    await closeAll(database, shim, relay, api);
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
