import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import {
  AnswerSchema,
  AnswerIndexSchema,
  AskAcceptedSchema,
  AskRequestSchema,
  DeploymentSchema,
  EventTypeSchema,
  ExecutionLedgerDigestSchema,
  InspectionSchema,
  InvestigationAcceptedSchema,
  InvestigationRequestSchema,
  NodeSchema,
  RunEventSchema,
  RunProjectionSchema,
  SessionSchema,
  type Answer,
  type AnswerIndex,
  type AskAccepted,
  type AskRequest,
  type Deployment,
  type ExecutionLedgerDigest,
  type Inspection,
  type InvestigationAccepted,
  type Node,
  type RunProjection,
  type Session
} from "@debateai/contract";
import type { Pool } from "pg";
import { createInitialBatteryRows, SplitLifecycleProjection, WorkItemRepository } from "@debateai/battery";
import { RunRepository } from "@debateai/db";
import { ServeRepository, type MemoryQuestionRegistration } from "@debateai/serve";
import { assertMakerAdmission, type DeploymentMakerCapability } from "@debateai/critique";
import { TypedDomainError, type RiskTier, type TierSource } from "@debateai/kernel";
import { LivenessRepository } from "@debateai/liveness";
import type { Hatchet } from "@hatchet-dev/typescript-sdk";

export interface AskApplication {
  submit(ask: AskRequest, session: Session): Promise<AskAccepted>;
  readAnswer(answerId: string, session: Session, version?: number): Promise<Answer | null>;
  readRunAnswer(runId: string, session: Session): Promise<Answer | null>;
  readRun(runId: string, session: Session): Promise<RunProjection | null>;
  readAnswerIndex(session: Session, limit: number, offset: number): Promise<AnswerIndex>;
  readInspection(answerId: string, session: Session, version?: number): Promise<Inspection | null>;
  readLedgerDigest(answerId: string, session: Session): Promise<ExecutionLedgerDigest | null>;
  readNode(answerId: string, nodeId: string, session: Session): Promise<Node | null>;
  recordInvestigation(answerId: string, gapRef: string, userInput: string | null, session: Session): Promise<InvestigationAccepted | null>;
  unlinkMemoryLink(answerId: string, session: Session): Promise<{ readonly memory_link_id: string; readonly state: "UNLINKED" }>;
  readDeployment(session: Session): Promise<Deployment>;
  events(runId: string, session: Session): AsyncIterable<unknown>;
}

export interface ApiOptions {
  readonly application: AskApplication;
}

/**
 * Marks a domain error that was observed while evaluating whether an ask may
 * be admitted. Typed errors from deployment reads or persistence deliberately
 * do not receive this marker and therefore remain internal failures.
 */
export class AskRefusal extends Error {
  readonly code: string;

  constructor(refusal: TypedDomainError) {
    super(refusal.message);
    this.name = "AskRefusal";
    this.code = refusal.code;
  }
}

class MalformedRequestError extends Error {
  constructor(error: Error) {
    super(error.message);
    this.name = "MalformedRequestError";
  }
}

function parseRequest<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      throw new MalformedRequestError(error);
    }
    throw error;
  }
}

function markAskRefusal(error: unknown): never {
  if (error instanceof TypedDomainError) throw new AskRefusal(error);
  throw error;
}

function resolveSession(token: unknown, scope: "ASKER" | "OPERATOR" = "ASKER"): Session | null {
  if (typeof token !== "string" || token.trim().length === 0) return null;
  const tokenDigest = createHash("sha256").update(token).digest("hex");
  return SessionSchema.parse({
    asker_id: `asker:${tokenDigest}`,
    session_id: `session:${tokenDigest}`,
    caller_scope: scope,
    ownership_provenance: scope === "OPERATOR" ? "operator_dev_token" : "user_dev_token",
    provisional_identity_model: true
  });
}

export function buildApi(options: ApiOptions): FastifyInstance {
  const api = Fastify({ logger: false });
  api.setErrorHandler((error, _request, reply) => {
    if (reply.sent || reply.raw.headersSent) {
      // A streaming response has no lawful error envelope left to send. Abort
      // the one connection instead of fabricating a terminal SSE event (DR-115)
      // or letting Fastify attempt a second write and crash the process.
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        try {
          reply.raw.destroy();
        } catch {
          try {
            reply.raw.socket?.destroy();
          } catch {
            // The error handler must remain total even if the transport is
            // already tearing itself down.
          }
        }
      }
      return;
    }
    const knownError = error instanceof Error ? error : new Error(String(error));
    const malformed = knownError instanceof MalformedRequestError || knownError instanceof SyntaxError;
    // Only an error marked at the ask-evaluation stage is a refusal. Register,
    // memory, sequence-allocation and other persistence faults remain 5xx even
    // when they happen behind POST /v1/asks (DR-115).
    const askRefusal = knownError instanceof AskRefusal;
    const statusCode = malformed ? 400 : askRefusal ? 422 : 500;
    return reply.status(statusCode).send({
      error: malformed
        ? "MALFORMED_REQUEST"
        : askRefusal ? knownError.code : "INTERNAL_ERROR",
      message: knownError.message
    });
  });

  api.get("/v1/session", async (request, reply) => {
    const session = resolveSession(request.headers["x-user-dev-token"]);
    if (session === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    return reply.send(session);
  });

  api.get("/v1/deployment", async (request, reply) => {
    const session = resolveSession(request.headers["x-user-dev-token"]);
    if (session === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    return reply.send(DeploymentSchema.parse(await options.application.readDeployment(session)));
  });

  api.post("/v1/asks", async (request, reply) => {
    const session = resolveSession(request.headers["x-user-dev-token"]);
    if (session === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    const ask = parseRequest(AskRequestSchema, request.body);
    const accepted = AskAcceptedSchema.parse(await options.application.submit(ask, session));
    return reply.status(202).send(accepted);
  });

  api.get<{ Querystring: { limit?: string; offset?: string } }>("/v1/answers", async (request, reply) => {
    const session = resolveSession(request.headers["x-user-dev-token"]);
    if (session === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    const limit = Number(request.query.limit);
    const offset = Number(request.query.offset);
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0) {
      return reply.status(400).send({ error: "MALFORMED_REQUEST" });
    }
    return reply.send(AnswerIndexSchema.parse(await options.application.readAnswerIndex(session, limit, offset)));
  });

  api.get<{ Params: { id: string }; Querystring: { version?: string } }>("/v1/answers/:id", async (request, reply) => {
    const session = resolveSession(request.headers["x-user-dev-token"]);
    if (session === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    const rawVersion = request.query.version;
    const version = rawVersion === undefined ? undefined : Number(rawVersion);
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
      return reply.status(400).send({ error: "MALFORMED_REQUEST" });
    }
    const answer = await options.application.readAnswer(request.params.id, session, version);
    return answer === null ? reply.status(404).send({ error: "ANSWER_NOT_FOUND" }) : reply.send(AnswerSchema.parse(answer));
  });

  api.get<{ Params: { id: string }; Querystring: { version?: string } }>("/v1/answers/:id/inspection", async (request, reply) => {
    const asker = resolveSession(request.headers["x-user-dev-token"]);
    if (asker === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    const rawVersion = request.query.version;
    const version = rawVersion === undefined ? undefined : Number(rawVersion);
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
      return reply.status(400).send({ error: "MALFORMED_REQUEST" });
    }
    const inspection = await options.application.readInspection(request.params.id, asker, version);
    return inspection === null
      ? reply.status(404).send({ error: "INSPECTION_NOT_FOUND" })
      : reply.send(InspectionSchema.parse(inspection));
  });

  api.get<{ Params: { id: string } }>("/v1/answers/:id/ledger-digest", async (request, reply) => {
    const asker = resolveSession(request.headers["x-user-dev-token"]);
    if (asker === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    const digest = await options.application.readLedgerDigest(request.params.id, asker);
    return digest === null ? reply.status(404).send({ error: "LEDGER_DIGEST_NOT_FOUND" }) : reply.send(ExecutionLedgerDigestSchema.parse(digest));
  });

  api.get<{ Params: { id: string; nodeId: string } }>("/v1/answers/:id/nodes/:nodeId", async (request, reply) => {
    const session = resolveSession(request.headers["x-user-dev-token"]);
    if (session === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    const node = await options.application.readNode(request.params.id, request.params.nodeId, session);
    return node === null ? reply.status(404).send({ error: "NODE_NOT_FOUND" }) : reply.send(NodeSchema.parse(node));
  });

  api.post<{ Params: { id: string; gapRef: string } }>("/v1/answers/:id/investigations/:gapRef", async (request, reply) => {
    const session = resolveSession(request.headers["x-user-dev-token"]);
    if (session === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    const input = parseRequest(InvestigationRequestSchema, request.body);
    const accepted = await options.application.recordInvestigation(request.params.id, request.params.gapRef, input.user_input, session);
    return accepted === null ? reply.status(404).send({ error: "INVESTIGATION_GAP_NOT_FOUND" }) : reply.status(202).send(InvestigationAcceptedSchema.parse(accepted));
  });

  api.get<{ Params: { id: string } }>("/v1/runs/:id/events", async (request, reply) => {
    const session = resolveSession(request.headers["x-user-dev-token"]);
    if (session === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });
    for await (const candidate of options.application.events(request.params.id, session)) {
      const event = RunEventSchema.parse(candidate);
      reply.raw.write(`id: ${event.event_id}\nevent: ${event.event_type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
    reply.raw.end();
  });
  api.get<{ Params: { id: string } }>("/v1/runs/:id", async (request, reply) => {
    const session = resolveSession(request.headers["x-user-dev-token"]);
    if (session === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    const run = await options.application.readRun(request.params.id, session);
    return run === null ? reply.status(404).send({ error: "RUN_NOT_FOUND" }) : reply.send(RunProjectionSchema.parse(run));
  });
  api.get<{ Params: { id: string } }>("/v1/runs/:id/answer", async (request, reply) => {
    const session = resolveSession(request.headers["x-user-dev-token"]);
    if (session === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    const answer = await options.application.readRunAnswer(request.params.id, session);
    return answer === null ? reply.status(404).send({ error: "ANSWER_NOT_SERVED" }) : reply.send(AnswerSchema.parse(answer));
  });
  api.post<{ Params: { id: string } }>("/v1/answers/:id/memory-link/unlink", async (request, reply) => {
    const session = resolveSession(request.headers["x-user-dev-token"]);
    if (session === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    return reply.send(await options.application.unlinkMemoryLink(request.params.id, session));
  });
  return api;
}

export interface Dispatcher {
  dispatch(input: { readonly runId: string; readonly workItemId: string }): Promise<void>;
}

export class HatchetDispatcher implements Dispatcher {
  constructor(
    private readonly client: Pick<Hatchet, "runNoWait">,
    private readonly workflowName: string
  ) {
    if (workflowName.trim().length === 0) throw new TypeError("Hatchet workflow name must be a register value");
  }

  async dispatch(input: { readonly runId: string; readonly workItemId: string }): Promise<void> {
    await this.client.runNoWait(this.workflowName, {
      runId: input.runId,
      workItemId: input.workItemId
    }, {
      additionalMetadata: {
        v3RunId: input.runId,
        v3WorkItemId: input.workItemId,
        sourceOfRecord: "core.work_item"
      }
    });
  }
}

export interface RunCreationSettings {
  readonly strangerSampleRate: number;
  readonly registerVersion: number;
  readonly batteryVersion: string;
  readonly settlementWatchHandle: string;
  readonly memoryPullPolicy?: MemoryQuestionRegistration["pullPolicy"];
  readonly resolveDeploymentMakerAvailability: () => Promise<DeploymentMakerCapability>;
  readonly resolveEnvelopeBasis: (input: {
    readonly depthParams: Readonly<Record<string, unknown>>;
    readonly riskTier: RiskTier;
  }) => Promise<Readonly<Record<string, unknown>>>;
  readonly resolveRisk: (askerRiskTier: RiskTier, tierSource: AskRequest["tier_source"], provenanceRef: string) => {
    readonly effectiveRiskTier: RiskTier;
    readonly tierSource: TierSource;
    readonly tierProvenanceRef: string;
  };
}

export function preserveSubmittedTierSource<T extends { readonly tierSource: TierSource }>(
  resolved: T,
  submittedTierSource: AskRequest["tier_source"]
): Omit<T, "tierSource"> & { readonly tierSource: TierSource } {
  return {
    ...resolved,
    tierSource: resolved.tierSource === "DEPLOYMENT_POLICY"
      ? "DEPLOYMENT_POLICY"
      : submittedTierSource
  };
}

export async function evaluateAskAdmission(
  settings: RunCreationSettings,
  ask: AskRequest
): Promise<{
  readonly risk: ReturnType<RunCreationSettings["resolveRisk"]>;
  readonly envelopeBasis: Readonly<Record<string, unknown>>;
}> {
  const risk = settings.resolveRisk(ask.risk_tier, ask.tier_source, ask.tier_provenance_ref);
  const makerAvailability = await settings.resolveDeploymentMakerAvailability();
  try {
    assertMakerAdmission(risk.effectiveRiskTier, makerAvailability);
  } catch (error) {
    markAskRefusal(error);
  }
  let envelopeBasis: Readonly<Record<string, unknown>>;
  try {
    envelopeBasis = await settings.resolveEnvelopeBasis({
      depthParams: ask.depth_params,
      riskTier: risk.effectiveRiskTier
    });
  } catch (error) {
    markAskRefusal(error);
  }
  return { risk, envelopeBasis };
}

export class PostgresAskApplication implements AskApplication {
  readonly #runs: RunRepository;
  readonly #work: WorkItemRepository;
  readonly #serve: ServeRepository;
  readonly #splitLifecycle: SplitLifecycleProjection;
  readonly #liveness: LivenessRepository;

  constructor(
    private readonly pool: Pool,
    private readonly dispatcher: Dispatcher,
    private readonly settings: RunCreationSettings
  ) {
    this.#runs = new RunRepository(pool);
    this.#work = new WorkItemRepository(pool);
    this.#serve = new ServeRepository(pool);
    this.#splitLifecycle = new SplitLifecycleProjection(pool);
    this.#liveness = new LivenessRepository(pool);
  }

  async submit(ask: AskRequest, session: Session): Promise<AskAccepted> {
    await this.#liveness.recordQuery(ask.question_line, session.asker_id, new Date(ask.as_of));
    const { risk, envelopeBasis } = await evaluateAskAdmission(this.settings, ask);
    const runId = await this.#runs.startRun({
      questionLine: ask.question_line,
      askerId: session.asker_id,
      sessionId: session.session_id,
      callerScope: ask.caller_scope,
      asOf: new Date(ask.as_of),
      askerRiskTier: ask.risk_tier,
      effectiveRiskTier: risk.effectiveRiskTier,
      tierSource: risk.tierSource,
      tierProvenanceRef: risk.tierProvenanceRef,
      compositionBudgetTier: ask.composition_budget_tier,
      depthParams: ask.depth_params,
      agentCount: ask.agent_count,
      strangerSampleRate: this.settings.strangerSampleRate,
      envelopeBasis,
      registerVersion: this.settings.registerVersion,
      batteryVersion: this.settings.batteryVersion,
      askContract: {
        decision_owner: ask.decision_owner,
        action_owner: ask.action_owner,
        decision_scope: ask.decision_scope,
        steering_presets: ask.steering_presets,
        steering_annotations: ask.steering_annotations
      },
      batteryRows: createInitialBatteryRows({ settlementWatchHandle: this.settings.settlementWatchHandle })
    });
    await this.#serve.recordMemoryQuestion({
      runId,
      questionLine: ask.question_line,
      callerScope: ask.caller_scope,
      askerScope: session.asker_id,
      asOf: ask.as_of,
      policyVersion: this.settings.registerVersion,
      ...(this.settings.memoryPullPolicy === undefined ? {} : { pullPolicy: this.settings.memoryPullPolicy })
    });
    const workItemId = await this.#work.enqueue({
      runId,
      batteryRowId: "Q1",
      nodeSet: [],
      commandKey: `S00:${runId}:Q1`
    });
    await this.dispatcher.dispatch({ runId, workItemId });
    return { run_ref: runId, status: "QUEUED" };
  }

  async unlinkMemoryLink(answerId: string, session: Session): Promise<{ readonly memory_link_id: string; readonly state: "UNLINKED" }> {
    const result = await this.#serve.unlinkMemoryForAnswer(answerId, session.asker_id, `asker:${session.asker_id}`);
    return Object.freeze({ memory_link_id: result.memoryLinkId, state: "UNLINKED" });
  }

  readAnswer(answerId: string, session: Session, version?: number): Promise<Answer | null> {
    return this.#serve.readAnswerProjection(answerId, session.asker_id, version);
  }

  readRunAnswer(runId: string, session: Session): Promise<Answer | null> {
    return this.#serve.readRunAnswerProjection(runId, session.asker_id);
  }

  async readRun(runId: string, session: Session): Promise<RunProjection | null> {
    const run = await this.#runs.readLoadingProjection(runId, session.asker_id);
    return run === null ? null : RunProjectionSchema.parse({
      run_ref: run.runRef,
      question_line: run.questionLine,
      state: run.state,
      terminal_reason: run.terminalReason
    });
  }

  readAnswerIndex(session: Session, limit: number, offset: number): Promise<AnswerIndex> {
    return this.#serve.readAnswerIndex(session.asker_id, limit, offset);
  }

  readInspection(answerId: string, session: Session, version?: number): Promise<Inspection | null> {
    return this.#serve.readInspectionProjection(answerId, session.asker_id, version);
  }

  readLedgerDigest(answerId: string, session: Session): Promise<ExecutionLedgerDigest | null> {
    return this.#serve.readExecutionLedgerDigest(answerId, session.asker_id);
  }

  readNode(answerId: string, nodeId: string, session: Session): Promise<Node | null> {
    return this.#serve.readNodeProjection(answerId, nodeId, session.asker_id);
  }

  recordInvestigation(answerId: string, gapRef: string, userInput: string | null, session: Session): Promise<InvestigationAccepted | null> {
    return this.#serve.recordInvestigationRequest({ answerId, gapRef, askerId: session.asker_id, userInput });
  }

  async readDeployment(session: Session): Promise<Deployment> {
    const version = await this.pool.query<{ register_version: string }>(
      `SELECT register_version FROM register.register_version WHERE sealed ORDER BY register_version DESC LIMIT 1`
    );
    const registerVersion = Number(version.rows[0]?.register_version);
    if (!Number.isInteger(registerVersion) || registerVersion < 1) {
      throw new TypedDomainError("DEPLOYMENT_REGISTER_UNAVAILABLE", "No sealed V3 deployment register exists");
    }
    const [rows, scorecards, ledger] = await Promise.all([
      this.pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(
        `SELECT row_key, value_json, source_ref FROM register.register_row
         WHERE register_version=$1 ORDER BY row_key`, [registerVersion]
      ),
      this.pool.query<{
        model_id: string; model_version: string; provider: string; task_class: string; metric: string;
        value: number | null; basis: Deployment["scorecards"][number]["basis"];
        derivation_hash: string; strategy_source_ref: string; as_of: Date;
      }>(
        `SELECT DISTINCT ON (model_id, model_version, provider, task_class, metric)
                model_id, model_version, provider, task_class, metric, value, basis,
                derivation_hash, strategy_source_ref, as_of
         FROM scorecard.scorecard_cell
         ORDER BY model_id, model_version, provider, task_class, metric, derivation_version DESC`
      ),
      this.pool.query<{
        task_class: string; model_id: string; model_version: string; provider: string; routing_decision_id: string;
      }>(
        `SELECT task_class, model_id, model_version, provider, routing_decision_id
         FROM scorecard.session_assignment WHERE session_id=$1 ORDER BY at_seq`, [session.session_id]
      )
    ]);
    return DeploymentSchema.parse({
      register: {
        register_version: registerVersion,
        rows: rows.rows.map((row) => ({ row_key: row.row_key, value: row.value_json, source_ref: row.source_ref }))
      },
      scorecards: scorecards.rows.map((row) => ({
        model_id: row.model_id, model_version: row.model_version, provider: row.provider,
        task_class: row.task_class, metric: row.metric,
        value: row.value === null ? null : Number(row.value), basis: row.basis,
        derivation_hash: row.derivation_hash, source_ref: row.strategy_source_ref,
        as_of: row.as_of.toISOString()
      })),
      model_ledger: ledger.rows.map((row) => ({
        task_class: row.task_class, model_id: row.model_id, model_version: row.model_version,
        provider: row.provider, routing_decision_ref: row.routing_decision_id
      })),
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    });
  }

  async *events(runId: string, session: Session): AsyncIterable<unknown> {
    const [result, failedWork] = await Promise.all([this.pool.query<{
      event_id: string;
      kind: string;
      at_seq: string;
      value_json: unknown;
    }>(
      `SELECT event.event_id, event.kind, event.at_seq, event.value_json
       FROM core.run_progress_event AS event
       JOIN core.run AS run ON run.run_id = event.run_id
      WHERE event.run_id = $1 AND run.asker_id = $2 ORDER BY event.at_seq`,
      [runId, session.asker_id]
    ), this.pool.query<{
      work_item_id: string;
      created_at_seq: string;
      terminal_reason: string;
    }>(
      `SELECT work.work_item_id, work.created_at_seq, work.terminal_reason
       FROM core.work_item AS work
       JOIN core.run AS run ON run.run_id = work.run_id
       WHERE work.run_id = $1 AND run.asker_id = $2 AND work.state = 'FAILED'
       ORDER BY work.created_at_seq`,
      [runId, session.asker_id]
    )]);
    if (result.rows.length === 0 && failedWork.rows.length === 0) return;
    const projected = await this.#splitLifecycle.read(runId);
    const storedEvents = result.rows.flatMap((row) => {
      const direct = EventTypeSchema.safeParse(row.kind);
      const eventType = direct.success
        ? direct.data
        : row.kind === "PHASE" ? "run.running"
        : row.kind === "TERMINAL" ? "run.terminal"
        : row.kind === "ENVELOPE_STATE" && row.value_json !== "WITHIN" ? "honesty.budget_skip_marked"
        : null;
      if (eventType === null) return [];
      return [{
        event_id: row.event_id,
        event_type: eventType,
        run_ref: runId,
        at_sequence: Number(row.at_seq),
        payload: row.kind === "PHASE" ? { phase: row.value_json }
          : row.kind === "TERMINAL" ? { terminal: row.value_json }
          : row.kind === "ENVELOPE_STATE" ? { state: row.value_json }
          : typeof row.value_json === "object" && row.value_json !== null ? row.value_json as Record<string, unknown>
          : { value: row.value_json }
      }];
    });
    const events = [
      ...storedEvents,
      ...failedWork.rows.map((work) => ({
        event_id: work.work_item_id,
        event_type: "run.terminal" as const,
        run_ref: runId,
        at_sequence: Number(work.created_at_seq),
        payload: { state: "FAILED", reason: work.terminal_reason }
      })),
      ...projected.map((event) => ({
        event_id: event.eventId,
        event_type: event.eventType,
        run_ref: event.runRef,
        subject_ref: event.subjectRef,
        at_sequence: event.atSequence,
        payload: event.payload
      }))
    ].sort((left, right) => left.at_sequence - right.at_sequence);
    for (const event of events) yield event;
  }
}
