import { evaluateQuickEntry } from "../../policy/quick-arm.js";
import type { PolicyBundle } from "../../policy/loader.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type QuickOffReason = "QUICK_ARM_OFF" | "QUICK_ON_HALF_GATED";

export interface QuickRouteAuditAction {
  readonly action_kind: "QUICK_ROUTE_REFUSED";
  readonly proposal_id: string;
  readonly incident_id: string;
  readonly configured: "OFF" | "ON";
  readonly effective: "OFF";
  readonly route: "APPROVAL_FIRST";
  readonly reason: QuickOffReason;
}

export async function routeApprovedQuick<Presentation>(input: Readonly<{
  bundle: PolicyBundle;
  proposalId: string;
  incidentId: string;
  actions: Readonly<{
    append(value: QuickRouteAuditAction): Promise<void>;
  }>;
  presentApprovalFirst(reason: QuickOffReason): Promise<Presentation>;
}>): Promise<Readonly<{
  route: "APPROVAL_FIRST";
  reason: QuickOffReason;
  presentation: Presentation;
}>> {
  if (!ID.test(input.proposalId) || !UUID.test(input.incidentId)) {
    throw new TypeError("FIX14_QUICK_ROUTE_INPUT");
  }
  const status = evaluateQuickEntry(input.bundle);
  const reason = status.configured === "OFF"
    ? "QUICK_ARM_OFF" as const
    : "QUICK_ON_HALF_GATED" as const;
  await input.actions.append(Object.freeze({
    action_kind: "QUICK_ROUTE_REFUSED",
    proposal_id: input.proposalId,
    incident_id: input.incidentId,
    configured: status.configured,
    effective: status.effective,
    route: "APPROVAL_FIRST",
    reason,
  }));
  const presentation = await input.presentApprovalFirst(reason);
  return Object.freeze({ route: "APPROVAL_FIRST", reason, presentation });
}
