import {
  AccountErasureCancelRequestSchema,
  AccountErasureCancelledSchema,
  AccountErasureStatusSchema,
  AnswerSchema,
  AnswerIndexSchema,
  AskAcceptedSchema,
  DeploymentSchema,
  ExecutionLedgerDigestSchema,
  InspectionSchema,
  InvestigationAcceptedSchema,
  NodeSchema,
  PrivateDebateErasureStatusSchema,
  PublicationTransitionSchema,
  PublicDebateListSchema,
  PublicDebateSchema,
  RunEventSchema,
  RunProjectionSchema,
  RevokeAllSessionsSchema,
  SessionListSchema,
  SessionSchema,
  StepUpResponseSchema,
  type Answer,
  type AnswerIndex,
  type AskAccepted,
  type AskRequest,
  type Deployment,
  type ExecutionLedgerDigest,
  type Inspection,
  type InvestigationAccepted,
  type InvestigationRequest,
  type Node,
  type PublicDebate,
  type RunEvent,
  type RunProjection,
  type Session,
  type SessionList
} from "./index.js";

export type ContractErrorCode =
  | "SESSION_REQUIRED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "MALFORMED_REQUEST"
  | "UNPROCESSABLE"
  | "FORBIDDEN"
  | "SERVER_FAILURE"
  | "NETWORK_FAILURE"
  | "INVALID_RESPONSE";

export class ContractHttpError extends Error {
  constructor(
    readonly code: ContractErrorCode,
    readonly status: number,
    message: string,
    readonly serverCode: string | null = null
  ) {
    super(message);
    this.name = "ContractHttpError";
  }
}

function codeForStatus(status: number): ContractErrorCode {
  if (status === 400) return "MALFORMED_REQUEST";
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 422) return "UNPROCESSABLE";
  if (status === 429) return "RATE_LIMITED";
  return "SERVER_FAILURE";
}

async function contractErrorForResponse(response: Response): Promise<ContractHttpError> {
  let serverCode: string | null = null;
  let serverMessage: string | null = null;
  try {
    const candidate: unknown = await response.json();
    if (typeof candidate === "object" && candidate !== null) {
      const body = candidate as Record<string, unknown>;
      serverCode = typeof body.error === "string" && body.error.trim().length > 0 ? body.error : null;
      serverMessage = typeof body.message === "string" && body.message.trim().length > 0 ? body.message : null;
    }
  } catch {
    // A non-JSON failure still retains its transport status below.
  }
  const detail = serverCode !== null && serverMessage !== null
    ? `${serverCode}: ${serverMessage}`
    : serverCode ?? serverMessage ?? `Contract request failed with ${response.status}`;
  return new ContractHttpError(codeForStatus(response.status), response.status, detail, serverCode);
}

async function requestJson<T>(
  baseUrl: string,
  fetchImplementation: typeof fetch,
  path: string,
  token: string,
  schema: { parse(value: unknown): T },
  init: RequestInit = {},
  auth: ContractClientAuth = { mode: "legacy" }
): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    if (auth.mode === "legacy") {
      headers.set("x-user-dev-token", token);
    } else {
      if (auth.cookieHeader !== undefined) headers.set("cookie", auth.cookieHeader);
      if (auth.userAgent !== undefined) headers.set("user-agent", auth.userAgent);
      if (init.method !== undefined && !["GET", "HEAD"].includes(init.method.toUpperCase())) {
        const csrf = auth.csrfToken?.() ?? browserCsrfToken();
        if (csrf !== null) headers.set("x-csrf-token", csrf);
      }
    }
    if (init.body !== undefined) headers.set("content-type", "application/json");
    response = await fetchImplementation(new URL(path, baseUrl), {
      ...init,
      headers,
      cache: "no-store",
      ...(auth.mode === "cookie" ? { credentials: "same-origin" as const } : {})
    });
  } catch (error) {
    throw new ContractHttpError("NETWORK_FAILURE", 0, error instanceof Error ? error.message : "Network failure");
  }
  if (!response.ok) throw await contractErrorForResponse(response);
  try {
    return schema.parse(await response.json());
  } catch (error) {
    throw new ContractHttpError("INVALID_RESPONSE", response.status, error instanceof Error ? error.message : "Invalid response");
  }
}

async function requestNoContent(
  baseUrl: string,
  fetchImplementation: typeof fetch,
  path: string,
  init: RequestInit,
  auth: ContractClientAuth
): Promise<void> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    if (auth.mode === "cookie") {
      if (auth.cookieHeader !== undefined) headers.set("cookie", auth.cookieHeader);
      if (auth.userAgent !== undefined) headers.set("user-agent", auth.userAgent);
      const csrf = auth.csrfToken?.() ?? browserCsrfToken();
      if (csrf !== null) headers.set("x-csrf-token", csrf);
    }
    response = await fetchImplementation(new URL(path, baseUrl), {
      ...init,
      headers,
      cache: "no-store",
      ...(auth.mode === "cookie" ? { credentials: "same-origin" as const } : {})
    });
  } catch (error) {
    throw new ContractHttpError("NETWORK_FAILURE", 0, error instanceof Error ? error.message : "Network failure");
  }
  if (!response.ok) throw await contractErrorForResponse(response);
  if (response.status !== 204) {
    throw new ContractHttpError("INVALID_RESPONSE", response.status, "Expected an empty session mutation response");
  }
}

export type ContractClientAuth =
  | Readonly<{ mode: "legacy" }>
  | Readonly<{
    mode: "cookie";
    /** Server-side rendering only; browser code relies on the cookie jar. */
    cookieHeader?: string;
    /** Server-side rendering only; preserves the browser UA used to bind the session. */
    userAgent?: string;
    csrfToken?: () => string | null;
  }>;

function browserCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const values = document.cookie.split(";").flatMap((member) => {
    const index = member.indexOf("=");
    if (index < 1 || member.slice(0, index).trim() !== "__Host-debateai-csrf") return [];
    const value = member.slice(index + 1).trim();
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? [value] : [];
  });
  return values.length === 1 ? values[0]! : null;
}

export interface ContractClient {
  beginLogin(email: string, password: string): Promise<{ status: "mfa_required"; challenge_token: string }>;
  completeLogin(challengeToken: string, code: string): Promise<{
    status: "authenticated";
    csrf_token: string;
    session: Session;
    replacement_recovery_code?: string;
  }>;
  logout(): Promise<void>;
  listSessions(): Promise<SessionList>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllSessions(): Promise<{ revoked: number }>;
  stepUp(password: string, code: string, authorization?:
    | Readonly<{
      action: "PUBLISH" | "UNPUBLISH" | "DELETE_PRIVATE_DEBATE";
      target_run_id: string;
    }>
    | Readonly<{ action: "DELETE_ACCOUNT" }>): Promise<{
    status: "step_up_complete";
    csrf_token: string;
    step_up_grant?: ({
      token: string;
      action: "PUBLISH" | "UNPUBLISH" | "DELETE_PRIVATE_DEBATE";
      target_run_id: string;
      expires_at: string;
    } | {
      token: string;
      action: "DELETE_ACCOUNT";
      expires_at: string;
    }) | undefined;
  }>;
  readPublicDebates(limit: number, offset: number): Promise<Readonly<{
    items: readonly Readonly<{
      public_ref: string;
      author_pseudonym: string;
      question: string;
      published_at: string;
      verdict: "SUPPORTED" | "CONTESTED" | "UNSUPPORTED" | null;
      confidence_band: string | null;
    }>[];
    total: number;
  }>>;
  readPublicDebate(publicationRef: string): Promise<PublicDebate>;
  readRunVisibility(runId: string): Promise<{ state: "PRIVATE" | "PUBLISHED"; public_ref: string | null }>;
  publishRun(runId: string, stepUpGrant: string): Promise<{ state: "PRIVATE" | "PUBLISHED"; public_ref: string | null }>;
  unpublishRun(runId: string, stepUpGrant: string): Promise<{ state: "PRIVATE" | "PUBLISHED"; public_ref: string | null }>;
  scheduleAccountErasure(stepUpGrant:string):Promise<{
    status:"SCHEDULED"|"DUE"|"PROCESSING";execute_at:string;cancellation_ref:string;
  }>;
  readAccountErasure():Promise<
    | { status:"NONE" }
    | { status:"SCHEDULED"|"DUE"|"PROCESSING";execute_at:string;cancellation_ref:string }
  >;
  cancelAccountErasure(cancellationRef:string):Promise<{ status:"CANCELLED" }>;
  deletePrivateDebate(runId:string,stepUpGrant:string):Promise<{
    status:"CLEANED"|"PENDING";
  }>;
  submitAsk(input: AskRequest, token: string): Promise<AskAccepted>;
  readSession(token: string): Promise<Session>;
  readDeployment(token: string): Promise<Deployment>;
  readAnswerIndex(token: string, limit: number, offset: number): Promise<AnswerIndex>;
  readAnswer(answerId: string, token: string, version?: number): Promise<Answer>;
  readRunAnswer(runId: string, token: string): Promise<Answer>;
  readRun(runId: string, token: string): Promise<RunProjection>;
  readInspection(answerId: string, token: string, version?: number): Promise<Inspection>;
  readLedgerDigest(answerId: string, token: string): Promise<ExecutionLedgerDigest>;
  readNode(answerId: string, nodeId: string, token: string): Promise<Node>;
  recordInvestigation(answerId: string, gapRef: string, input: InvestigationRequest, token: string): Promise<InvestigationAccepted>;
  unlinkMemory(answerId: string, token: string): Promise<{ memory_link_id: string; state: "UNLINKED" }>;
  readEvents(runId: string, token: string): Promise<readonly RunEvent[]>;
  streamEvents(runId: string, token: string, consume: (event: RunEvent) => void, signal?: AbortSignal): Promise<void>;
}

const UnlinkSchema = { parse(value: unknown) {
  if (typeof value !== "object" || value === null) throw new TypeError("Invalid unlink response");
  const row = value as Record<string, unknown>;
  if (typeof row.memory_link_id !== "string" || row.state !== "UNLINKED") throw new TypeError("Invalid unlink response");
  return { memory_link_id: row.memory_link_id, state: "UNLINKED" as const };
} };

export function createContractClient(
  baseUrl: string,
  fetchImplementation: typeof fetch = fetch,
  auth: ContractClientAuth = { mode: "legacy" }
): ContractClient {
  const root = new URL(baseUrl);
  const versionQuery = (version?: number) => version === undefined ? "" : `?version=${encodeURIComponent(String(version))}`;
  const request = <T>(path: string, token: string, schema: { parse(value: unknown): T }, init: RequestInit = {}) =>
    requestJson(root.href, fetchImplementation, path, token, schema, init, auth);
  const eventResponse = async (runId: string, token: string, signal?: AbortSignal): Promise<Response> => {
    let response: Response;
    try {
      const headers = new Headers();
      if (auth.mode === "legacy") headers.set("x-user-dev-token", token);
      else {
        if (auth.cookieHeader !== undefined) headers.set("cookie", auth.cookieHeader);
        if (auth.userAgent !== undefined) headers.set("user-agent", auth.userAgent);
      }
      response = await fetchImplementation(new URL(`/v1/runs/${encodeURIComponent(runId)}/events`, root), {
        headers,
        cache: "no-store",
        ...(auth.mode === "cookie" ? { credentials: "same-origin" as const } : {}),
        ...(signal === undefined ? {} : { signal })
      });
    } catch (error) {
      if (signal?.aborted === true) throw error;
      throw new ContractHttpError("NETWORK_FAILURE", 0, error instanceof Error ? error.message : "Network failure");
    }
    if (!response.ok) throw await contractErrorForResponse(response);
    return response;
  };
  const parseFrame = (frame: string): RunEvent | null => {
    const data = frame.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (data.length === 0) return null;
    try {
      return RunEventSchema.parse(JSON.parse(data));
    } catch (error) {
      throw new ContractHttpError("INVALID_RESPONSE", 200, error instanceof Error ? error.message : "Invalid event response");
    }
  };
  return Object.freeze({
    beginLogin: (email: string, password: string) => request("/v1/auth/login", "", {
      parse(value: unknown) {
        if (typeof value !== "object" || value === null) throw new TypeError("Invalid login challenge response");
        const row = value as Record<string, unknown>;
        if (row.status !== "mfa_required" || typeof row.challenge_token !== "string") throw new TypeError("Invalid login challenge response");
        return { status: "mfa_required" as const, challenge_token: row.challenge_token };
      }
    }, { method: "POST", body: JSON.stringify({ email, password }) }),
    completeLogin: (challengeToken: string, code: string) => request("/v1/auth/login", "", {
      parse(value: unknown) {
        if (typeof value !== "object" || value === null) throw new TypeError("Invalid login response");
        const row = value as Record<string, unknown>;
        if (row.status !== "authenticated" || typeof row.csrf_token !== "string") throw new TypeError("Invalid login response");
        const session = SessionSchema.parse(row.session);
        return {
          status: "authenticated" as const,
          csrf_token: row.csrf_token,
          session,
          ...(typeof row.replacement_recovery_code === "string"
            ? { replacement_recovery_code: row.replacement_recovery_code } : {})
        };
      }
    }, { method: "POST", body: JSON.stringify({ challenge_token: challengeToken, code }) }),
    async logout() {
      let response: Response;
      const headers = new Headers();
      if (auth.mode === "cookie") {
        if (auth.cookieHeader !== undefined) headers.set("cookie", auth.cookieHeader);
        if (auth.userAgent !== undefined) headers.set("user-agent", auth.userAgent);
        const csrf = auth.csrfToken?.() ?? browserCsrfToken();
        if (csrf !== null) headers.set("x-csrf-token", csrf);
      }
      try {
        response = await fetchImplementation(new URL("/v1/auth/logout", root), {
          method: "POST", headers, cache: "no-store",
          ...(auth.mode === "cookie" ? { credentials: "same-origin" as const } : {})
        });
      } catch (error) {
        throw new ContractHttpError("NETWORK_FAILURE", 0, error instanceof Error ? error.message : "Network failure");
      }
      if (!response.ok) throw await contractErrorForResponse(response);
    },
    listSessions: () => request("/v1/auth/sessions", "", SessionListSchema),
    revokeSession: (sessionId: string) => requestNoContent(
      root.href,
      fetchImplementation,
      `/v1/auth/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
      auth
    ),
    revokeAllSessions: () => request(
      "/v1/auth/sessions", "", RevokeAllSessionsSchema, { method: "DELETE" }
    ),
    stepUp: (password: string, code: string, authorization?:
      | Readonly<{
        action: "PUBLISH" | "UNPUBLISH" | "DELETE_PRIVATE_DEBATE";
        target_run_id: string;
      }>
      | Readonly<{ action: "DELETE_ACCOUNT" }>) => request(
      "/v1/auth/step-up", "", StepUpResponseSchema,
      { method: "POST", body: JSON.stringify({
          password,
          code,
          ...(authorization === undefined ? {} : { authorization })
        }) }
    ),
    readPublicDebates: (limit: number, offset: number) => request(
      `/v1/public/debates?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`,
      "",
      PublicDebateListSchema
    ),
    readPublicDebate: (publicationRef: string) => request(
      `/v1/public/debates/${encodeURIComponent(publicationRef)}`,
      "",
      PublicDebateSchema
    ),
    readRunVisibility: (runId: string) => request(
      `/v1/runs/${encodeURIComponent(runId)}/visibility`,
      "",
      PublicationTransitionSchema
    ),
    publishRun: (runId: string, stepUpGrant: string) => request(
      `/v1/runs/${encodeURIComponent(runId)}/publish`,
      "",
      PublicationTransitionSchema,
      { method: "POST", body: JSON.stringify({
          step_up_grant: stepUpGrant,
          warning_acknowledged: true
        }) }
    ),
    unpublishRun: (runId: string, stepUpGrant: string) => request(
      `/v1/runs/${encodeURIComponent(runId)}/unpublish`,
      "",
      PublicationTransitionSchema,
      { method: "POST", body: JSON.stringify({
          step_up_grant: stepUpGrant,
          copies_may_persist_acknowledged: true
        }) }
    ),
    scheduleAccountErasure:(stepUpGrant:string)=>request(
      "/v1/account","",AccountErasureStatusSchema,
      { method:"DELETE",body:JSON.stringify({
          confirmation:"DELETE MY ACCOUNT",step_up_grant:stepUpGrant
        }) }
    ).then((status)=>{
      if (status.status==="NONE") throw new ContractHttpError(
        "INVALID_RESPONSE",200,"Scheduled deletion returned NONE"
      );
      return status;
    }),
    readAccountErasure:()=>request(
      "/v1/account/erasure","",AccountErasureStatusSchema
    ),
    cancelAccountErasure:(cancellationRef:string)=>request(
      "/v1/account/erasure/cancel","",AccountErasureCancelledSchema,
      { method:"POST",body:JSON.stringify(AccountErasureCancelRequestSchema.parse({
          cancellation_ref:cancellationRef
        })) }
    ),
    deletePrivateDebate:(runId:string,stepUpGrant:string)=>request(
      `/v1/debates/${encodeURIComponent(runId)}`,"",PrivateDebateErasureStatusSchema,
      { method:"DELETE",body:JSON.stringify({ step_up_grant:stepUpGrant }) }
    ),
    submitAsk: (input: AskRequest, token: string) => request("/v1/asks", token, AskAcceptedSchema, { method: "POST", body: JSON.stringify(input) }),
    readSession: (token: string) => request("/v1/session", token, SessionSchema),
    readDeployment: (token: string) => request("/v1/deployment", token, DeploymentSchema),
    readAnswerIndex: (token: string, limit: number, offset: number) => request(`/v1/answers?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`, token, AnswerIndexSchema),
    readAnswer: (answerId: string, token: string, version?: number) => request(`/v1/answers/${encodeURIComponent(answerId)}${versionQuery(version)}`, token, AnswerSchema),
    readRunAnswer: (runId: string, token: string) => request(`/v1/runs/${encodeURIComponent(runId)}/answer`, token, AnswerSchema),
    readRun: (runId: string, token: string) => request(`/v1/runs/${encodeURIComponent(runId)}`, token, RunProjectionSchema),
    readInspection: (answerId: string, token: string, version?: number) => request(`/v1/answers/${encodeURIComponent(answerId)}/inspection${versionQuery(version)}`, token, InspectionSchema),
    readLedgerDigest: (answerId: string, token: string) => request(`/v1/answers/${encodeURIComponent(answerId)}/ledger-digest`, token, ExecutionLedgerDigestSchema),
    readNode: (answerId: string, nodeId: string, token: string) => request(`/v1/answers/${encodeURIComponent(answerId)}/nodes/${encodeURIComponent(nodeId)}`, token, NodeSchema),
    recordInvestigation: (answerId: string, gapRef: string, input: InvestigationRequest, token: string) => request(`/v1/answers/${encodeURIComponent(answerId)}/investigations/${encodeURIComponent(gapRef)}`, token, InvestigationAcceptedSchema, { method: "POST", body: JSON.stringify(input) }),
    unlinkMemory: (answerId: string, token: string) => request(`/v1/answers/${encodeURIComponent(answerId)}/memory-link/unlink`, token, UnlinkSchema, { method: "POST" }),
    async readEvents(runId: string, token: string) {
      const response = await eventResponse(runId, token);
      const text = await response.text();
      return Object.freeze(text.split(/\r?\n\r?\n+/).flatMap((frame) => {
        const event = parseFrame(frame);
        return event === null ? [] : [event];
      }));
    },
    async streamEvents(runId: string, token: string, consume: (event: RunEvent) => void, signal?: AbortSignal) {
      const response = await eventResponse(runId, token, signal);
      if (response.body === null) throw new ContractHttpError("INVALID_RESPONSE", response.status, "Event stream has no body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const event = parseFrame(frame);
          if (event !== null) consume(event);
        }
        if (chunk.done) break;
      }
      const finalEvent = parseFrame(buffer);
      if (finalEvent !== null) consume(finalEvent);
    }
  });
}
