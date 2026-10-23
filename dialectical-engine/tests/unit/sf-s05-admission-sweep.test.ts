import { describe, expect, it } from "vitest";
import {
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW,
  admissionPolicyFromValue,
  type AdmissionPolicy
} from "@debateai/register";
import {
  AdmissionLimiter,
  SUPPORT_SWEPT_SCOPES,
  type AdmissionScope
} from "../../apps/api/src/admission.js";

const AT_MS = Date.parse("2026-10-23T00:00:00.000Z");
const SUPPORT_SCOPES = [
  "supportReads", "supportSessions", "supportModelCalls", "geoAvailability"
] as const satisfies readonly AdmissionScope[];

function policy(): AdmissionPolicy {
  const deployed = admissionPolicyFromValue(
    ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value,
    ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
  );
  return {
    ...deployed,
    supportReads: { ...deployed.supportReads!, capacity: 65_536 },
    supportSessions: { ...deployed.supportSessions!, capacity: 65_536 },
    supportModelCalls: { ...deployed.supportModelCalls!, capacity: 65_536 },
    geoAvailability: { ...deployed.geoAvailability!, capacity: 65_536 }
  };
}

describe("S05 admission counter sweep", () => {
  it.each(SUPPORT_SCOPES)("%s: removes a single expired key below capacity", (scope) => {
    const configured = policy();
    const limiter = new AdmissionLimiter(configured);
    limiter.decide(scope, "one", new Date(AT_MS));
    const windowMs = configured[scope]!.windowMs;

    expect({
      removed: limiter.sweep(new Date(AT_MS + windowMs), [scope]),
      keys: limiter.keys(scope)
    }).toEqual({ removed: 1, keys: [] });
  });

  it("keeps a key one millisecond before its window ends", () => {
    const configured = policy();
    const limiter = new AdmissionLimiter(configured);
    limiter.decide("supportReads", "live", new Date(AT_MS));
    const removed = limiter.sweep(
      new Date(AT_MS + configured.supportReads!.windowMs - 1), ["supportReads"]
    );
    const keys = limiter.keys("supportReads");

    expect({
      removed, keys, frozen: Object.isFrozen(keys)
    }).toEqual({ removed: 0, keys: ["live"], frozen: true });
  });

  it("leaves an expired asks key outside the supplied scopes", () => {
    const configured = policy();
    const limiter = new AdmissionLimiter(configured);
    limiter.decide("asks", "ask", new Date(AT_MS));
    for (const scope of SUPPORT_SCOPES) {
      limiter.decide(scope, scope, new Date(AT_MS));
    }
    const afterEveryWindow = AT_MS + Math.max(
      configured.asks.windowMs,
      ...SUPPORT_SCOPES.map((scope) => configured[scope]!.windowMs)
    );

    expect({
      removed: limiter.sweep(new Date(afterEveryWindow), SUPPORT_SCOPES),
      asksKeys: limiter.keys("asks")
    }).toEqual({ removed: 4, asksKeys: ["ask"] });
  });

  it("names the four swept support scopes in order as a frozen list", () => {
    expect({ scopes: SUPPORT_SWEPT_SCOPES, frozen: Object.isFrozen(SUPPORT_SWEPT_SCOPES) })
      .toEqual({ scopes: SUPPORT_SCOPES, frozen: true });
  });
});
