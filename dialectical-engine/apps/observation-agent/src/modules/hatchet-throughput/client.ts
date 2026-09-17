import { readFile } from "node:fs/promises";
import { parsePrometheusMetrics, type HatchetMetricValues } from "./prometheus.js";

type Fetch = typeof fetch;

async function responseJson(fetcher: Fetch, url: string, token: string, timeoutMs: number): Promise<unknown> {
  const response = await fetcher(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Connection: "close",
      "User-Agent": "dialectical-engine-observation-agent" },
    signal: AbortSignal.timeout(Math.min(2_000, timeoutMs))
  });
  if (!response.ok) throw new TypeError("OBSERVATION_HATCHET_REST_UNAVAILABLE");
  return response.json();
}

function record(input: unknown): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("OBSERVATION_HATCHET_REST_INVALID");
  }
  return input as Readonly<Record<string, unknown>>;
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError("OBSERVATION_HATCHET_REST_INVALID");
  }
  return value;
}

export async function readHatchetRest(input: Readonly<{
  queueUrl: string; tokenPath: string; timeoutMs: number; fetcher?: Fetch;
}>): Promise<HatchetMetricValues> {
  const fetcher = input.fetcher ?? fetch;
  const token = (await readFile(input.tokenPath, "utf8")).trim();
  if (token.length === 0) throw new TypeError("OBSERVATION_HATCHET_TOKEN_INVALID");
  const stepUrl = input.queueUrl.replace(/\/queue-metrics$/u, "/step-run-queue-metrics");
  const workerUrl = input.queueUrl.replace(/\/queue-metrics$/u, "/worker");
  if (stepUrl === input.queueUrl || workerUrl === input.queueUrl) {
    throw new TypeError("OBSERVATION_HATCHET_TARGET_INVALID");
  }
  const [queueInput, stepInput, workerInput] = await Promise.all([
    responseJson(fetcher, input.queueUrl, token, input.timeoutMs),
    responseJson(fetcher, stepUrl, token, input.timeoutMs),
    responseJson(fetcher, workerUrl, token, input.timeoutMs)
  ]);
  const queue = record(queueInput);
  const step = record(stepInput);
  const worker = record(workerInput);
  if (!Array.isArray(worker.workers)) throw new TypeError("OBSERVATION_HATCHET_REST_INVALID");
  return Object.freeze({
    queueDepth: number(queue.queue_depth),
    dispatchP95Seconds: number(step.dispatch_p95_seconds),
    failedTasksTotal: number(step.failed_tasks_total),
    createdTasksTotal: number(step.created_tasks_total)
  });
}

export async function readHatchetPrometheus(input: Readonly<{
  url: string; timeoutMs: number; fetcher?: Fetch;
}>): Promise<HatchetMetricValues> {
  const response = await (input.fetcher ?? fetch)(input.url, {
    method: "GET", headers: { Connection: "close", "User-Agent": "dialectical-engine-observation-agent" },
    signal: AbortSignal.timeout(Math.min(2_000, input.timeoutMs))
  });
  if (!response.ok) throw new TypeError("OBSERVATION_HATCHET_PROMETHEUS_UNAVAILABLE");
  return parsePrometheusMetrics(await response.text());
}
