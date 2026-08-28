import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export const DEVELOPMENT_LOCAL_PROVIDER_TARGET = Object.freeze({
  providerRef: "development:local-vllm",
  host: "127.0.0.1",
  port: 8_791,
  baseUrl: "http://127.0.0.1:8791/v1",
  model: "qa-deterministic-v1"
} as const);
const LOCAL_PROVIDER_HOST = DEVELOPMENT_LOCAL_PROVIDER_TARGET.host;
const LOCAL_PROVIDER_PORT = DEVELOPMENT_LOCAL_PROVIDER_TARGET.port;
const LOCAL_PROVIDER_MODEL = DEVELOPMENT_LOCAL_PROVIDER_TARGET.model;
const MAX_REQUEST_BYTES = 256 * 1024;

type PromptMessage = Readonly<{ role: string; content: string }>;

function judgeContent(): string {
  return JSON.stringify({
    statement: "The question deserves a cautious answer that weighs the strongest reasons on each side.",
    way_of_knowing: "REASONING",
    locator: null,
    restatement_text: "A careful conclusion should compare the best arguments and remain provisional.",
    restatement_status: "PASS",
    value_laden: false,
    claim_type: "unknown",
    steelman: { summary: "The strongest case is considered before reaching a conclusion.", fidelity: 0.9 },
    critic: {
      summary: "The conclusion could change if stronger contrary evidence appears.",
      counterargumentStrength: 0.6,
      basis: "PLAUSIBLE_COUNTER"
    },
    evidence: { quality: 0, relevance: 0.5 },
    context: { fit: 0.8, ambiguityFlags: ["No independent evidence was supplied."] },
    fallacy: { severity: 0, fatalFlags: [] }
  });
}

export function renderDevelopmentProviderContent(messages: readonly PromptMessage[]): string {
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  const user = messages.find((message) => message.role === "user")?.content ?? "";
  if (user === "DR-181 discovery health probe. Reply exactly: OK") return "OK";
  if (system.includes("Review an existing debate node authored by a different maker")) {
    return JSON.stringify({
      outcome: "agree",
      reasons: ["The position is internally coherent under the available reasoning."]
    });
  }
  if (system.includes("segments array")) {
    return JSON.stringify({
      segments: [{
        segment_id: "provisional-answer",
        text: "The available reasoning supports a provisional, qualified answer.",
        node_refs: ["primary"],
        served_number_refs: []
      }, {
        segment_id: "research-plan",
        text: "Test the key assumptions with independent evidence before treating the conclusion as settled.",
        node_refs: ["primary"],
        served_number_refs: []
      }]
    });
  }
  if (system.includes("{conforms,findings}")) {
    return JSON.stringify({ conforms: true, findings: [] });
  }
  if (system.includes("{pass}")) return JSON.stringify({ pass: true });
  if (system.includes("Return only one JSON object with exactly the following schema")) {
    return judgeContent();
  }
  throw new TypeError("DEV_LOCAL_PROVIDER_PROMPT_UNSUPPORTED");
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > MAX_REQUEST_BYTES) throw new TypeError("DEV_LOCAL_PROVIDER_REQUEST_TOO_LARGE");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function reply(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    reply(response, 404, { error: "NOT_FOUND" });
    return;
  }
  const parsed = JSON.parse(await readRequestBody(request)) as {
    model?: unknown;
    messages?: unknown;
  };
  if (parsed.model !== LOCAL_PROVIDER_MODEL || !Array.isArray(parsed.messages)
    || parsed.messages.some((message) => (
      typeof message !== "object" || message === null
      || typeof (message as { role?: unknown }).role !== "string"
      || typeof (message as { content?: unknown }).content !== "string"
    ))) {
    reply(response, 422, { error: "REQUEST_INVALID" });
    return;
  }
  const content = renderDevelopmentProviderContent(parsed.messages as PromptMessage[]);
  reply(response, 200, {
    id: randomUUID(),
    model: LOCAL_PROVIDER_MODEL,
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    choices: [{ message: { content } }]
  });
}

export type DevelopmentLocalProvider = Readonly<{
  receipt: Readonly<{
    host: typeof LOCAL_PROVIDER_HOST;
    port: number;
    model: typeof LOCAL_PROVIDER_MODEL;
  }>;
  exited: Promise<Readonly<{ code: 0 | 1; signal: null }>>;
  stop(): Promise<void>;
}>;

export class DevelopmentLocalProviderError extends Error {
  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "DevelopmentLocalProviderError";
  }
}

export async function startDevelopmentLocalProvider(
  input: Readonly<{ port?: number }> = {}
): Promise<DevelopmentLocalProvider> {
  const port = input.port ?? LOCAL_PROVIDER_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new DevelopmentLocalProviderError("DEV_LOCAL_PROVIDER_PORT_INVALID");
  }
  let resolveExit!: (value: Readonly<{ code: 0 | 1; signal: null }>) => void;
  const exited = new Promise<Readonly<{ code: 0 | 1; signal: null }>>((resolve) => {
    resolveExit = resolve;
  });
  let listening = false;
  let exitSettled = false;
  const settleExit = (value: Readonly<{ code: 0 | 1; signal: null }>) => {
    if (exitSettled) return;
    exitSettled = true;
    resolveExit(value);
  };
  const server = createServer((request, response) => {
    void handleRequest(request, response).catch(() => {
      if (response.destroyed) return;
      try {
        if (!response.headersSent) reply(response, 422, { error: "REQUEST_UNSUPPORTED" });
        else response.destroy();
      } catch {
        response.destroy();
      }
    });
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  server.on("error", () => {
    if (listening) settleExit(Object.freeze({ code: 1, signal: null }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, LOCAL_PROVIDER_HOST, () => {
      listening = true;
      server.off("error", reject);
      resolve();
    });
  }).catch((error) => {
    throw new DevelopmentLocalProviderError("DEV_LOCAL_PROVIDER_START_FAILED", error);
  });
  server.once("close", () => settleExit(Object.freeze({ code: 0, signal: null })));
  const address = server.address();
  if (address === null || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new DevelopmentLocalProviderError("DEV_LOCAL_PROVIDER_START_FAILED");
  }
  let stopPromise: Promise<void> | undefined;
  return Object.freeze({
    receipt: Object.freeze({
      host: LOCAL_PROVIDER_HOST,
      port: address.port,
      model: LOCAL_PROVIDER_MODEL
    }),
    exited,
    stop() {
      stopPromise ??= new Promise<void>((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
        server.closeAllConnections();
      }).catch((error) => {
        throw new DevelopmentLocalProviderError("DEV_LOCAL_PROVIDER_CLEANUP_FAILED", error);
      });
      return stopPromise;
    }
  });
}
