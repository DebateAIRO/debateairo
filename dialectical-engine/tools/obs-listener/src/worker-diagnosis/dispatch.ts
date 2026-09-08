import { randomUUID, timingSafeEqual } from "node:crypto";

import type { ProposalNotifier } from "../notify/index.js";
import { IncidentPacketSchema, type IncidentPacket } from "./packet.js";
import type { DiagnosisModelPort } from "./spawn.js";
import { validateProposal, type DiagnosisPolicyBundle } from "./validate.js";

export const DIAGNOSIS_REGISTER_SEEDS = Object.freeze({
  callsPerDay: 20,
  wallClockPerDiagnosisMs: 600_000,
  maxConcurrentDiagnoses: 1,
});

export type DispatchArmState = "OFF" | "REPORT_ONLY_PROPOSAL";

export interface DiagnosisAction {
  readonly kind: "PROPOSAL" | "VIOLATION" | "TELEMETRY_MISSING" | "CAP_REFUSED" | "DIAGNOSIS_FAILED";
  readonly incidentId: string;
  readonly proposalId?: string;
  readonly actionRef?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface DiagnosisActionStore {
  callsToday(): Promise<number>;
  appendAction(action: DiagnosisAction): Promise<void>;
  recordUsage(units: number): Promise<void>;
}

export type DispatchResult =
  | Readonly<{ readonly kind: "OFF" | "INELIGIBLE" | "ALREADY_DISPATCHED" | "TELEMETRY_MISSING" }>
  | Readonly<{ readonly kind: "CAP_REFUSED"; readonly cap: "callsPerDay" | "maxConcurrentDiagnoses" }>
  | Readonly<{ readonly kind: "VIOLATION"; readonly code: string }>
  | Readonly<{ readonly kind: "DIAGNOSIS_FAILED" }>
  | Readonly<{ readonly kind: "PROPOSED"; readonly proposalId: string; readonly hash: string }>;

export interface DiagnosisDispatcher {
  state(): DispatchArmState;
  arm(token: string): Readonly<{ readonly ok: false; readonly code: "REFUSED" }>
    | Readonly<{ readonly ok: true; readonly state: "REPORT_ONLY_PROPOSAL" }>;
  dispatch(packet: IncidentPacket | unknown): Promise<DispatchResult>;
}

export interface DiagnosisDispatcherOptions {
  readonly custodianToken: string;
  readonly bundle: DiagnosisPolicyBundle;
  readonly store: DiagnosisActionStore;
  readonly model: DiagnosisModelPort;
  readonly notifier: ProposalNotifier;
  readonly ticketIdForIncident?: (incidentId: string) => Promise<string>;
  readonly proposalIdFactory?: () => string;
}

function tokensMatch(expected: string, supplied: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length > 0
    && expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}

function eligible(value: unknown): value is IncidentPacket {
  const parsed = IncidentPacketSchema.safeParse(value);
  return parsed.success
    && parsed.data.verdict === "CODE_ROOT"
    && parsed.data.floor === "FLOOR_CLEAR"
    && parsed.data.source !== ("ui_client" as string)
    && parsed.data.frames.every((frame) => frame.kind !== "BOUNDARY" || frame.code !== "ZONE_BOUNDARY");
}

export function createDiagnosisDispatcher(options: DiagnosisDispatcherOptions): DiagnosisDispatcher {
  if (options.custodianToken.length === 0) throw new TypeError("CUSTODIAN_TOKEN_REQUIRED");
  let armState: DispatchArmState = "OFF";
  let active = 0;
  const dispatched = new Set<string>();
  const proposalIdFactory = options.proposalIdFactory ?? randomUUID;

  return Object.freeze({
    state: () => armState,
    arm(token: string) {
      if (!tokensMatch(options.custodianToken, token)) {
        return Object.freeze({ ok: false as const, code: "REFUSED" as const });
      }
      armState = "REPORT_ONLY_PROPOSAL";
      return Object.freeze({ ok: true as const, state: armState });
    },
    async dispatch(candidate: IncidentPacket | unknown): Promise<DispatchResult> {
      if (armState === "OFF") return Object.freeze({ kind: "OFF" });
      if (!eligible(candidate)) return Object.freeze({ kind: "INELIGIBLE" });
      const packet = candidate;
      if (dispatched.has(packet.incidentId)) return Object.freeze({ kind: "ALREADY_DISPATCHED" });
      if (active >= DIAGNOSIS_REGISTER_SEEDS.maxConcurrentDiagnoses) {
        await options.store.appendAction({ kind: "CAP_REFUSED", incidentId: packet.incidentId,
          payload: Object.freeze({ cap: "maxConcurrentDiagnoses" }) });
        return Object.freeze({ kind: "CAP_REFUSED", cap: "maxConcurrentDiagnoses" });
      }
      active += 1;
      try {
        if (await options.store.callsToday() >= DIAGNOSIS_REGISTER_SEEDS.callsPerDay) {
          await options.store.appendAction({ kind: "CAP_REFUSED", incidentId: packet.incidentId,
            payload: Object.freeze({ cap: "callsPerDay" }) });
          return Object.freeze({ kind: "CAP_REFUSED", cap: "callsPerDay" });
        }
        dispatched.add(packet.incidentId);
        let result;
        try {
          result = await options.model.run(packet);
        } catch {
          await options.store.appendAction({ kind: "DIAGNOSIS_FAILED", incidentId: packet.incidentId });
          return Object.freeze({ kind: "DIAGNOSIS_FAILED" });
        }
        if (result.usage === null) {
          armState = "OFF";
          await options.store.appendAction({ kind: "TELEMETRY_MISSING", incidentId: packet.incidentId });
          return Object.freeze({ kind: "TELEMETRY_MISSING" });
        }
        await options.store.recordUsage(result.usage.totalUnits);
        const validation = validateProposal(result.output, packet, options.bundle);
        if (!validation.ok) {
          await options.store.appendAction({ kind: "VIOLATION", incidentId: packet.incidentId,
            payload: Object.freeze({ code: validation.violation }) });
          return Object.freeze({ kind: "VIOLATION", code: validation.violation });
        }
        const proposalId = proposalIdFactory();
        await options.store.appendAction({
          kind: "PROPOSAL",
          incidentId: packet.incidentId,
          proposalId,
          actionRef: validation.hash,
          payload: validation.proposal,
        });
        const ticketId = await (options.ticketIdForIncident?.(packet.incidentId)
          ?? Promise.resolve(packet.incidentId));
        await options.notifier.notify(Object.freeze({
          incidentId: packet.incidentId,
          proposalId,
          ticketId,
          hash: validation.hash,
          proposal: validation.proposal,
        }));
        return Object.freeze({ kind: "PROPOSED", proposalId, hash: validation.hash });
      } finally {
        active -= 1;
      }
    },
  });
}
