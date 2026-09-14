export interface IncidentForTrace {
  readonly incidentId: string;
  readonly occurrenceId: string;
  readonly fingerprint: string;
  readonly fingerprintVersion: number;
}

export type ExternalBoundary =
  | "provider_http"
  | "postgres_host"
  | "hatchet_engine"
  | "cli_subprocess";

interface TraceEvidence {
  readonly evidenceIds: readonly string[];
  readonly queryCount: number;
}

export type TraceVerdict =
  | (TraceEvidence & {
      readonly verdict: "CODE_ROOT";
      readonly root: { readonly path: string; readonly symbol: string };
    })
  | (TraceEvidence & {
      readonly verdict: "EXTERNAL_ROOT";
      readonly root: { readonly boundary: ExternalBoundary };
    })
  | (TraceEvidence & {
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

export interface TracerHook {
  onIncidentNew(incident: IncidentForTrace): Promise<TraceVerdict>;
}
