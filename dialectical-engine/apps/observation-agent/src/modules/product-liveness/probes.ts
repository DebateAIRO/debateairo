import { observationTargetSchema } from "../../core/targets.js";
import type { ProbeObservation } from "../../core/types.js";
import { listSystemProcesses } from "../expectations/process-list.js";

const USER_AGENT = "dialectical-engine-observation-agent";
const SESSION_BODY = '{"error":"SESSION_REQUIRED"}';
const TLS_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
]);

export type ProductProbeDependencies = Readonly<{
  targets: readonly unknown[];
  timeoutMs: number;
  fetch?: typeof fetch;
  listProcesses?: () => Promise<string>;
  monotonicNow?: () => number;
}>;

function metric(component: ProbeObservation["component"], value: number) {
  return Object.freeze({
    kind: "metric" as const,
    key: `probe.${component}.latency_ms`,
    value: Math.max(0, value),
    unit: "MILLISECONDS" as const
  });
}

function requestInit(timeoutMs: number): RequestInit {
  return {
    method: "GET",
    headers: { Connection: "close", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs)
  };
}

function contentType(response: Response): string {
  return response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

async function exactSession(response: Response): Promise<boolean> {
  return response.status === 401
    && contentType(response) === "application/json"
    && await response.text() === SESSION_BODY;
}

function errorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== "object") return undefined;
  const value = error as Readonly<{ code?: unknown; cause?: unknown }>;
  if (typeof value.code === "string") return value.code;
  return errorCode(value.cause);
}

function failedObservation(
  component: Extract<ProbeObservation["component"], "api" | "ui" | "tls_front_door" | "runner" | "kanban">,
  probe: "http_get" | "process_presence",
  target: string,
  lastStatus: string | number,
  latencyMs: number
): ProbeObservation {
  return Object.freeze({
    component,
    ok: false,
    class: "INFRA_DOWN",
    probe,
    target,
    lastStatus,
    status: Object.freeze([metric(component, latencyMs)])
  });
}

export async function runProductLivenessProbes(
  input: ProductProbeDependencies
): Promise<readonly ProbeObservation[]> {
  const fetchImpl = input.fetch ?? fetch;
  const processes = input.listProcesses ?? (() => listSystemProcesses(input.timeoutMs));
  const now = input.monotonicNow ?? (() => performance.now());
  const observations: ProbeObservation[] = [];

  for (const candidate of input.targets) {
    const target = observationTargetSchema.parse(candidate);
    if (target.kind === "fact") continue;
    if (target.kind === "process" && target.component === "runner") {
      const startedAt = now();
      try {
        const output = await processes();
        const latencyMs = now() - startedAt;
        const ok = output.split("\n").some((line) => line.includes(target.command_contains));
        observations.push(Object.freeze({
          component: "runner", ok, class: "INFRA_DOWN", probe: "process_presence",
          target: target.command_contains, lastStatus: ok ? "PRESENT" : "ABSENT",
          status: Object.freeze([metric("runner", latencyMs)])
        }));
      } catch {
        observations.push(failedObservation(
          "runner", "process_presence", target.command_contains, "ABSENT", now() - startedAt
        ));
      }
      continue;
    }
    if (target.kind !== "http"
      || !["api", "ui", "tls_front_door", "kanban"].includes(target.component)) continue;

    const component = target.component as "api" | "ui" | "tls_front_door" | "kanban";
    const startedAt = now();
    try {
      const first = await fetchImpl(target.live_url, requestInit(input.timeoutMs));
      let ok = false;
      let lastStatus = first.status;
      let failedTarget = target.live_url;
      if (component === "api") {
        ok = await exactSession(first);
      } else if (component === "ui") {
        const loginOk = first.status === 200
          && contentType(first) === "text/html"
          && (await first.text()).includes("Back to the graph.");
        if (loginOk) {
          const sessionUrl = new URL("/api/v1/session", target.live_url).toString();
          const session = await fetchImpl(sessionUrl, requestInit(input.timeoutMs));
          lastStatus = session.status;
          failedTarget = sessionUrl;
          ok = await exactSession(session);
        }
      } else if (component === "tls_front_door") {
        ok = first.status === 200;
      } else {
        ok = first.status >= 200 && first.status <= 499;
      }
      const latencyMs = now() - startedAt;
      observations.push(Object.freeze({
        component, ok, class: "INFRA_DOWN", probe: "http_get",
        target: ok ? target.live_url : failedTarget, lastStatus,
        status: Object.freeze([metric(component, latencyMs)])
      }));
    } catch (error) {
      const trustFailure = component === "tls_front_door"
        && TLS_ERROR_CODES.has(errorCode(error) ?? "");
      observations.push(failedObservation(
        component, "http_get", target.live_url, trustFailure ? "TLS_TRUST" : 0,
        now() - startedAt
      ));
    }
  }
  return Object.freeze(observations);
}
