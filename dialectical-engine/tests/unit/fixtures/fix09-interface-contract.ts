import type {
  IncidentForTrace,
  TraceVerdict,
  TracerHook,
} from "../../../tools/obs-listener/src/daemon/tracer-hook.js";
import type { DispatchArm } from "../../../tools/obs-listener/src/daemon/dispatch-arm.js";

interface FrozenIncidentForTrace {
  readonly incidentId: string;
  readonly occurrenceId: string;
  readonly fingerprint: string;
  readonly fingerprintVersion: number;
}

type FrozenTraceEvidence = {
  readonly evidenceIds: readonly string[];
  readonly queryCount: number;
};

type FrozenTraceVerdict =
  | (FrozenTraceEvidence & {
      readonly verdict: "CODE_ROOT";
      readonly root: { readonly path: string; readonly symbol: string };
    })
  | (FrozenTraceEvidence & {
      readonly verdict: "EXTERNAL_ROOT";
      readonly root: {
        readonly boundary:
          | "provider_http"
          | "postgres_host"
          | "hatchet_engine"
          | "cli_subprocess";
      };
    })
  | (FrozenTraceEvidence & {
      readonly verdict:
        | "ZONE_BOUNDARY"
        | "INSUFFICIENT_EVIDENCE"
        | "CAUSE_CYCLE"
        | "CAUSE_GAP"
        | "CAUSE_DEPTH_EXCEEDED"
        | "CORRUPT_LINEAGE"
        | "REPLAY_UNSUPPORTED"
        | "CAPABILITY_GAP";
      readonly root: null;
    });

interface FrozenTracerHook {
  onIncidentNew(incident: FrozenIncidentForTrace): Promise<FrozenTraceVerdict>;
}

type Exact<Actual, Expected> = (<Value>() =>
  Value extends Actual ? 1 : 2) extends <Value>() =>
  Value extends Expected ? 1 : 2
  ? (<Value>() => Value extends Expected ? 1 : 2) extends <Value>() =>
      Value extends Actual ? 1 : 2
    ? true
    : false
  : false;
type Assert<Condition extends true> = Condition;

type IncidentShapeIsFrozen = Assert<
  Exact<IncidentForTrace, FrozenIncidentForTrace>
>;
type VerdictShapeIsFrozen = Assert<Exact<TraceVerdict, FrozenTraceVerdict>>;
type HookShapeIsFrozen = Assert<Exact<TracerHook, FrozenTracerHook>>;
type DispatchArmIsMemberless = Assert<Exact<keyof DispatchArm, never>>;

export type FrozenInterfaceAssertions = [
  IncidentShapeIsFrozen,
  VerdictShapeIsFrozen,
  HookShapeIsFrozen,
  DispatchArmIsMemberless,
];
