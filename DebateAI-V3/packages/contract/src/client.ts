import {
  AnswerSchema,
  AnswerIndexSchema,
  AskAcceptedSchema,
  DeploymentSchema,
  ExecutionLedgerDigestSchema,
  InspectionSchema,
  InvestigationAcceptedSchema,
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
  type InvestigationRequest,
  type Node,
  type RunEvent,
  type RunProjection,
  type Session
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
  init: RequestInit = {}
): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("x-user-dev-token", token);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    response = await fetchImplementation(new URL(path, baseUrl), { ...init, headers, cache: "no-store" });
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

export interface ContractClient {
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

export function createContractClient(baseUrl: string, fetchImplementation: typeof fetch = fetch): ContractClient {
  const root = new URL(baseUrl);
  const versionQuery = (version?: number) => version === undefined ? "" : `?version=${encodeURIComponent(String(version))}`;
  const eventResponse = async (runId: string, token: string, signal?: AbortSignal): Promise<Response> => {
    let response: Response;
    try {
      response = await fetchImplementation(new URL(`/v1/runs/${encodeURIComponent(runId)}/events`, root), {
        headers: { "x-user-dev-token": token },
        cache: "no-store",
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
    submitAsk: (input: AskRequest, token: string) => requestJson(root.href, fetchImplementation, "/v1/asks", token, AskAcceptedSchema, { method: "POST", body: JSON.stringify(input) }),
    readSession: (token: string) => requestJson(root.href, fetchImplementation, "/v1/session", token, SessionSchema),
    readDeployment: (token: string) => requestJson(root.href, fetchImplementation, "/v1/deployment", token, DeploymentSchema),
    readAnswerIndex: (token: string, limit: number, offset: number) => requestJson(root.href, fetchImplementation, `/v1/answers?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`, token, AnswerIndexSchema),
    readAnswer: (answerId: string, token: string, version?: number) => requestJson(root.href, fetchImplementation, `/v1/answers/${encodeURIComponent(answerId)}${versionQuery(version)}`, token, AnswerSchema),
    readRunAnswer: (runId: string, token: string) => requestJson(root.href, fetchImplementation, `/v1/runs/${encodeURIComponent(runId)}/answer`, token, AnswerSchema),
    readRun: (runId: string, token: string) => requestJson(root.href, fetchImplementation, `/v1/runs/${encodeURIComponent(runId)}`, token, RunProjectionSchema),
    readInspection: (answerId: string, token: string, version?: number) => requestJson(root.href, fetchImplementation, `/v1/answers/${encodeURIComponent(answerId)}/inspection${versionQuery(version)}`, token, InspectionSchema),
    readLedgerDigest: (answerId: string, token: string) => requestJson(root.href, fetchImplementation, `/v1/answers/${encodeURIComponent(answerId)}/ledger-digest`, token, ExecutionLedgerDigestSchema),
    readNode: (answerId: string, nodeId: string, token: string) => requestJson(root.href, fetchImplementation, `/v1/answers/${encodeURIComponent(answerId)}/nodes/${encodeURIComponent(nodeId)}`, token, NodeSchema),
    recordInvestigation: (answerId: string, gapRef: string, input: InvestigationRequest, token: string) => requestJson(root.href, fetchImplementation, `/v1/answers/${encodeURIComponent(answerId)}/investigations/${encodeURIComponent(gapRef)}`, token, InvestigationAcceptedSchema, { method: "POST", body: JSON.stringify(input) }),
    unlinkMemory: (answerId: string, token: string) => requestJson(root.href, fetchImplementation, `/v1/answers/${encodeURIComponent(answerId)}/memory-link/unlink`, token, UnlinkSchema, { method: "POST" }),
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
