import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ObservationError } from "../../core/errors.js";
import { renderImpact, type ObservationSignal } from "../../core/signals.js";
import {
  statusSnapshotSchema,
  type StatusSnapshot,
  type StoredModuleStatusProjection
} from "../../store/status.js";
import { readRoutingState } from "../routing/state.js";

const STATUS_HOST = "127.0.0.1";
const STATUS_PORT = 9797;

export type StatusPageRequest = Readonly<{ method?: string | undefined; url?: string | undefined }>;
export type StatusPageResponse = {
  writeHead(status: number, headers: Readonly<Record<string, string>>): StatusPageResponse;
  end(body?: string): StatusPageResponse;
};
export type StatusPageServer = {
  listen(port: number, host: string, ready: () => void): StatusPageServer;
  close(): StatusPageServer;
  unref?(): StatusPageServer;
  once(event: "error", listener: (error: Error) => void): StatusPageServer;
  removeListener(event: "error", listener: (error: Error) => void): StatusPageServer;
  removeListener(event: "listening", listener: () => void): StatusPageServer;
};
export type StatusPageHandler = (
  request: StatusPageRequest,
  response: StatusPageResponse
) => Promise<void>;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]!);
}

function safeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2).replace(/[<>&\u2028\u2029]/gu, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`)}\n`;
}

export function serializeStatusJson(candidate: unknown): string {
  return safeJson(statusSnapshotSchema.parse(candidate));
}

function projectionText(projection: StoredModuleStatusProjection): string {
  if (projection.kind === "state") return `${projection.key} ${projection.state}`;
  if (projection.kind === "metric") return `${projection.key} ${projection.value} ${projection.unit}`;
  if (projection.kind === "timestamp") return `${projection.key} ${projection.value ?? "NONE"}`;
  if (projection.kind === "channels") return `${projection.key} ${projection.channels.join(",")}`;
  if (projection.kind === "component") return `${projection.key} ${projection.component}`;
  if (projection.kind === "uuid") return `${projection.key} ${projection.value ?? "NONE"}`;
  if (projection.kind === "identifier") return `${projection.key} ${projection.value}`;
  if (projection.kind === "loopback_endpoint") {
    return `${projection.key} http://${STATUS_HOST}:${projection.port}${projection.path}`;
  }
  if (projection.kind === "state_child_path") {
    return `${projection.key} ${projection.segments.join("/")}`;
  }
  if (projection.template === "COUNT_SECONDS_THRESHOLD") {
    return `${projection.key} ${projection.count}/${projection.window_seconds}s`;
  }
  if (projection.template === "COUNT_WINDOW_THRESHOLD") {
    return `${projection.key} ${projection.count}/${projection.window_minutes}m`;
  }
  if (projection.template === "CAPTURE_NOT_WIRED") {
    return `${projection.key} ${projection.count}`;
  }
  if (projection.template === "PERCENT_MINIMUM_THRESHOLD") {
    return `${projection.key} ${projection.percent}% minimum ${projection.minimum}`;
  }
  if (projection.template === "RATIO_WINDOW_STATE") {
    return `${projection.key} ${projection.numerator}/${projection.denominator} ${projection.state}`;
  }
  if (projection.template === "DURATION_WINDOW_STATE") {
    return `${projection.key} ${projection.value_seconds}s ${projection.state}`;
  }
  return `${projection.key} ${projection.template}`;
}

function openSignalText(signal: ObservationSignal): string {
  return [
    signal.signal_id,
    signal.severity,
    signal.class,
    renderImpact(signal)
  ].map(escapeHtml).join("<br>");
}

export function renderStatusHtml(
  candidate: unknown,
  openSignals: readonly ObservationSignal[] = Object.freeze([])
): string {
  const snapshot = statusSnapshotSchema.parse(candidate);
  const signalsById = new Map(openSignals
    .filter((signal) => signal.state === "OPEN")
    .map((signal) => [signal.signal_id, signal]));
  const componentRows = Object.entries(snapshot.components).map(([component, status]) => {
    const signalCopy = status.open_signal_ids.map((signalId) => signalsById.get(signalId))
      .filter((signal): signal is ObservationSignal => signal !== undefined)
      .map(openSignalText);
    return `<tr><td>${escapeHtml(component)}</td><td>${escapeHtml(status.state)}</td>`
      + `<td>${escapeHtml(status.last_probe_at ?? "NONE")}</td>`
      + `<td>${signalCopy.length === 0 ? "NONE" : signalCopy.join("<hr>")}</td></tr>`;
  }).join("");
  const moduleRows = Object.entries(snapshot.modules ?? {}).flatMap(([moduleName, projections]) =>
    projections.map((projection) => `<li>${escapeHtml(moduleName)}: ${escapeHtml(projectionText(projection))}</li>`)
  ).join("");
  const mute = snapshot.mute === null
    ? "mute NONE"
    : `mute ${snapshot.mute.component ?? "all"} until ${snapshot.mute.expires_at}`;
  return "<!doctype html><html><head><meta charset=\"utf-8\">"
    + "<meta http-equiv=\"refresh\" content=\"10\"><title>ObservationAgent status</title></head>"
    + `<body><h1>ObservationAgent ${escapeHtml(snapshot.version)}</h1>`
    + `<p>pid ${snapshot.pid}; thresholds ${snapshot.thresholds_version}; ${escapeHtml(mute)}</p>`
    + "<table><thead><tr><th>component</th><th>state</th><th>last probe</th><th>open signal</th></tr></thead>"
    + `<tbody>${componentRows}</tbody></table><ul>${moduleRows}</ul></body></html>\n`;
}

async function loadSnapshot(stateDir: string): Promise<Readonly<{
  snapshot: StatusSnapshot;
  openSignals: readonly ObservationSignal[];
}>> {
  const snapshot = statusSnapshotSchema.parse(JSON.parse(
    await readFile(join(stateDir, "status.json"), "utf8")
  ));
  const routing = await readRoutingState(stateDir);
  return Object.freeze({
    snapshot,
    openSignals: Object.freeze(Object.values(routing.opens)
      .filter((open) => !open.closed)
      .map((open) => open.signal))
  });
}

export function createStatusPageRequestHandler(input: Readonly<{ stateDir: string }>): StatusPageHandler {
  return async (request, response) => {
    if (request.method !== undefined && request.method !== "GET") {
      response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" }).end("Method Not Allowed\n");
      return;
    }
    if (request.url !== "/status" && request.url !== "/status.json") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not Found\n");
      return;
    }
    try {
      const loaded = await loadSnapshot(input.stateDir);
      if (request.url === "/status.json") {
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }).end(serializeStatusJson(loaded.snapshot));
        return;
      }
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff"
      }).end(renderStatusHtml(loaded.snapshot, loaded.openSignals));
    } catch {
      response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" })
        .end("Status Unavailable\n");
    }
  };
}

function defaultCreateServer(handler: StatusPageHandler): StatusPageServer {
  return createHttpServer((request, response) => {
    void handler(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Status Unavailable\n");
    });
  });
}

function isExpectedBindFailure(error: unknown): boolean {
  return error instanceof Error && "code" in error
    && ["EADDRINUSE", "EACCES", "EPERM"].includes(String(error.code));
}

export async function startStatusPage(input: Readonly<{
  stateDir: string;
  host?: string;
  port?: number;
  createServer?: (handler: StatusPageHandler) => StatusPageServer;
}>): Promise<StatusPageServer> {
  const host = input.host ?? STATUS_HOST;
  const port = input.port ?? STATUS_PORT;
  if (host !== STATUS_HOST || port !== STATUS_PORT) {
    throw new ObservationError("OBSERVATION_STATUS_BIND_INVALID");
  }
  const server = (input.createServer ?? defaultCreateServer)(
    createStatusPageRequestHandler({ stateDir: input.stateDir })
  );
  await new Promise<void>((resolvePromise, rejectPromise) => {
    let settled = false;
    const ready = () => {
      if (settled) return;
      settled = true;
      server.removeListener("error", failed);
      resolvePromise();
    };
    const failed = (error: Error) => {
      if (settled) return;
      settled = true;
      server.removeListener("listening", ready);
      server.removeListener("error", failed);
      try { server.close(); } catch {}
      rejectPromise(isExpectedBindFailure(error)
        ? new ObservationError("OBSERVATION_STATUS_BIND_FAILED", error)
        : error);
    };
    try {
      server.once("error", failed);
      server.listen(port, host, ready);
    } catch (error) {
      settled = true;
      server.removeListener("listening", ready);
      server.removeListener("error", failed);
      try { server.close(); } catch {}
      rejectPromise(isExpectedBindFailure(error)
        ? new ObservationError("OBSERVATION_STATUS_BIND_FAILED", error)
        : error);
    }
  });
  server.unref?.();
  return server;
}
