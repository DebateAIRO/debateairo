import pg from "pg";
import type {
  Module,
  ModuleStatusProjection,
  ProbeObservation,
  SignalIntent
} from "../../core/types.js";
import { createProviderHealthTracker } from "./tracker.js";
import { PROVIDER_FAILURE_SELECT } from "./queries.js";

export type ProviderCall = Readonly<{
  providerRef: string;
  modelId: string;
  parseStatus: string;
  atSequence: number;
}>;

export type ProviderHealthDependencies = Readonly<{
  readCalls(databaseUrl: string): Promise<readonly ProviderCall[]>;
}>;

async function readCalls(databaseUrl: string): Promise<readonly ProviderCall[]> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query<{
      provider_ref: string; model_id: string; parse_status: string; at_seq: string;
    }>(`SELECT calls.provider_ref,calls.model_id,calls.parse_status,calls.at_seq::text
        FROM obs.provider_call_v AS calls
        JOIN (${PROVIDER_FAILURE_SELECT}) AS aggregate USING (provider_ref)
        ORDER BY calls.at_seq`);
    return Object.freeze(result.rows.map((row) => Object.freeze({
      providerRef: row.provider_ref,
      modelId: row.model_id,
      parseStatus: row.parse_status,
      atSequence: Number(row.at_seq)
    })));
  } finally {
    await pool.end();
  }
}

const productionDependencies: ProviderHealthDependencies = Object.freeze({ readCalls });

function positive(input: unknown, fallback: number): number {
  return typeof input === "number" && Number.isFinite(input) && input > 0 ? input : fallback;
}

function statusToken(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_.-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return (normalized.length === 0 ? "unknown" : normalized).slice(0, 40);
}

export function createProviderHealthModule(
  dependencies: ProviderHealthDependencies = productionDependencies
): Module {
  const tracker = createProviderHealthTracker();
  let pending: readonly SignalIntent[] = Object.freeze([]);
  let lastSequence: number | null = null;
  let observedCalls: Array<Readonly<{ call: ProviderCall; observedAt: Date }>> = [];
  const knownProviders = new Set<string>();
  return Object.freeze({
    name: "provider-health",
    cadence: Object.freeze({ intervalMs: 30_000, timeoutMs: 2_000 }),
    lifecycle: Object.freeze({
      legacyCorrelationKey: tracker.legacyCorrelationKey,
      restore: tracker.restore
    }),
    async probe(ctx): Promise<readonly ProbeObservation[]> {
      const calls = await dependencies.readCalls(ctx.databaseUrl);
      for (const call of calls) {
        if (!Number.isSafeInteger(call.atSequence) || call.atSequence < 0) {
          throw new TypeError("OBSERVATION_PROVIDER_SEQUENCE_INVALID");
        }
        knownProviders.add(call.providerRef);
      }
      const maximumSequence = calls.reduce(
        (maximum, call) => Math.max(maximum, call.atSequence),
        lastSequence ?? 0
      );
      if (lastSequence !== null) {
        observedCalls.push(...calls
          .filter((call) => call.atSequence > lastSequence!)
          .map((call) => Object.freeze({ call, observedAt: ctx.now })));
      }
      lastSequence = maximumSequence;
      const windowMinutes = positive(ctx.thresholds.window_minutes, 5);
      const windowStartedAt = new Date(ctx.now.getTime() - windowMinutes * 60_000);
      observedCalls = observedCalls.filter(({ observedAt }) => observedAt >= windowStartedAt);
      const byProvider = new Map<string, string[]>();
      const byProviderModel = new Map<string, Map<string, string[]>>();
      for (const providerRef of knownProviders) byProvider.set(providerRef, []);
      for (const { call } of observedCalls) {
        const statuses = byProvider.get(call.providerRef) ?? [];
        statuses.push(call.parseStatus);
        byProvider.set(call.providerRef, statuses);
        const models = byProviderModel.get(call.providerRef) ?? new Map<string, string[]>();
        const modelStatuses = models.get(call.modelId) ?? [];
        modelStatuses.push(call.parseStatus);
        models.set(call.modelId, modelStatuses);
        byProviderModel.set(call.providerRef, models);
      }
      const cycle = tracker.observe([...byProvider].map(([providerRef, statuses]) =>
        Object.freeze({ providerRef, statuses: Object.freeze(statuses) })), {
        minimum: positive(ctx.thresholds.minimum_calls, 10),
        ratio: positive(ctx.thresholds.failure_ratio, 0.5),
        windowMinutes,
        windowStartedAt,
        windowEndedAt: ctx.now
      });
      pending = cycle.intents;
      const modelProjections: ModuleStatusProjection[] = [];
      for (const [providerRef, models] of byProviderModel) {
        for (const [modelId, statuses] of models) {
          const key = `provider.${statusToken(providerRef)}.model.${statusToken(modelId)}`;
          const failures = statuses.filter((status) => status !== "PARSED").length;
          modelProjections.push(
            Object.freeze({ kind: "metric", key: `${key}.calls`, value: statuses.length,
              unit: "COUNT", view: "throughput" }),
            Object.freeze({ kind: "metric", key: `${key}.failures`, value: failures,
              unit: "COUNT", view: "throughput" }),
            Object.freeze({ kind: "metric", key: `${key}.ratio`,
              value: statuses.length === 0 ? 0 : failures / statuses.length * 100,
              unit: "PERCENT", view: "throughput" })
          );
        }
      }
      return Object.freeze([Object.freeze({
        component: "provider_panel",
        ok: cycle.intents.every((intent) => intent.state !== "OPEN"),
        class: "PROVIDER_DEGRADED",
        probe: "provider_safe_view",
        lastStatus: calls.length === 0 ? "COLLECTING" : "READY",
        observedAt: ctx.now,
        management: "module",
        statusState: calls.length === 0 ? "COLLECTING" : "CURRENT",
        status: Object.freeze([...cycle.projections, ...modelProjections])
      })]);
    },
    samples(_observations, ctx) {
      return Object.freeze([]);
    },
    signals() {
      const current = pending;
      pending = Object.freeze([]);
      return current;
    }
  });
}

export default createProviderHealthModule();
