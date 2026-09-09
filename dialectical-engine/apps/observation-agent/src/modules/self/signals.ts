import { signalSchema, type ObservationSignal } from "../../core/signals.js";

type Common = Readonly<{
  seq: number;
  signalId: string;
  now: Date;
  thresholdVersion: number;
}>;

export type SelfEvent = "START" | "STOP" | "JOURNAL_FAILURE";

function base(common: Common): Record<string, unknown> {
  const timestamp = common.now.toISOString();
  return {
    seq: common.seq,
    signal_id: common.signalId,
    state: "OPEN",
    component: "observation_agent",
    first_failed_probe_at: null,
    detected_at: timestamp,
    suspected_defect: false,
    defect_kind: null,
    run_ref: null,
    work_item_ref: null,
    threshold_version: common.thresholdVersion,
    clears_signal_id: null,
    recorded_at: timestamp
  };
}

export function makeSelfSignal(input: Common & Readonly<{
  event: SelfEvent;
  previousExitReason?: "CLEAN" | "UNCLEAN" | "UNKNOWN";
}>): ObservationSignal {
  const properties = input.event === "JOURNAL_FAILURE"
    ? { severity: "SEVERE", impact_code: "IMPACT_AGENT_JOURNAL" }
    : input.event === "START"
      ? { severity: "INFO", impact_code: "IMPACT_AGENT_START" }
      : { severity: "INFO", impact_code: "IMPACT_AGENT_STOP" };
  return Object.freeze(signalSchema.parse({
    ...base(input),
    class: "AGENT_SELF",
    ...properties,
    evidence: {
      reason: input.event,
      ...(input.event === "START" && input.previousExitReason !== undefined
        ? { previous_exit_reason: input.previousExitReason }
        : {})
    }
  }));
}

export function makeThresholdChangedSignal(input: Common & Readonly<{
  previousVersion: number;
  currentVersion: number;
}>): ObservationSignal {
  return Object.freeze(signalSchema.parse({
    ...base(input),
    class: "THRESHOLD_CHANGED",
    severity: "INFO",
    impact_code: "IMPACT_THRESHOLDS",
    evidence: {
      previous_version: input.previousVersion,
      current_version: input.currentVersion
    }
  }));
}
