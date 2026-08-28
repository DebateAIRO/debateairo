import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Correlation values remain opaque in S03b. Durable projection is fail-closed
 * until the separately ruled declared-kind gate exists; no shape matcher is a
 * provenance decision.
 */
export interface ObsContextFields {
  readonly run_ref?: unknown;
  readonly work_item_ref?: unknown;
  readonly node_ref?: unknown;
  readonly attempt_ref?: unknown;
  readonly ledger_ref?: unknown;
  readonly zone_context?: boolean;
  readonly at_seq_watermark?: unknown;
  readonly [field: string]: unknown;
}

export type ObsContext = Readonly<ObsContextFields>;

const OBS_CONTEXT = new AsyncLocalStorage<ObsContext>();

export function runWithObsContext<T>(fields: ObsContext, fn: () => T): T {
  return OBS_CONTEXT.run(fields, fn);
}

export function getObsContext(): ObsContext | undefined {
  return OBS_CONTEXT.getStore();
}

