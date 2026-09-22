import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  AskRefusal,
  askRefusalPublicMessage,
  askRefusalRetryAfter,
  askRefusalStatus,
  evaluateAskAdmission,
  type RunCreationSettings
} from "../../apps/api/src/index.js";
import { dailyCostEnvelopeReached } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";

/**
 * V-28 — THE CONTROLS ARE WIRED INTO BOTH SHIPPED ROOTS.
 *
 * This is the F33 class the mission has paid for five times: a control is built,
 * consumed behind an OPTIONAL setting, wired into ONE deployment entry point and
 * silently absent from the other. The compiler never asks, because the field is
 * optional; no unit test asks, because supplying the setting is what such a test
 * does. It surfaces only as money leaving a live deployment.
 *
 * So the daily gate's own behaviour is exercised through the real admission
 * function, and each entry point's wiring is pinned by name.
 */
function settingsWith(
  extra: Partial<RunCreationSettings> = {}
): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "test",
    settlementWatchHandle: "test",
    resolveDiscoveredPanel: async () => [],
    resolveEnvelopeBasis: async () => ({}),
    resolveRisk: () => ({
      effectiveRiskTier: "casual" as const,
      tierSource: "ASKER" as const,
      tierProvenanceRef: "asker:test"
    }),
    ...extra
  } as RunCreationSettings;
}

const ASK = Object.freeze({
  question_line: "q",
  as_of: new Date().toISOString(),
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker:test",
  composition_budget_tier: "standard",
  depth_params: {},
  decision_scope: {},
  steering_presets: [],
  steering_annotations: []
}) as never;

describe("V-28 a new ask passes the daily envelope before anything is resolved", () => {
  it("asks the daily gate, and asks it FIRST", async () => {
    const order: string[] = [];
    // The admission goes on to refuse this empty fixture panel; what is pinned
    // here is the ORDER, so the refusal is caught and discarded.
    await evaluateAskAdmission(settingsWith({
      assertDailyCostEnvelope: async () => { order.push("daily"); },
      resolveDiscoveredPanel: async () => { order.push("panel"); return []; }
    }), ASK).catch(() => undefined);

    expect(order).toEqual(["daily", "panel"]);
  });

  it("refuses the ask, and never discovers a panel, once the day is spent", async () => {
    let panelDiscovered = false;
    const refusal = await evaluateAskAdmission(settingsWith({
      assertDailyCostEnvelope: async () => {
        throw new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "spent");
      },
      resolveDiscoveredPanel: async () => { panelDiscovered = true; return []; }
    }), ASK).then(() => null, (error: unknown) => error);

    // A REFUSAL, not a fault. The ask surface answers 422 with the typed code
    // for an `AskRefusal` and 500 INTERNAL_ERROR for anything else, so a
    // budget-reached ask that arrived here unwrapped would read to the caller —
    // and to the operator's logs — as the engine having broken.
    expect(refusal).toBeInstanceOf(AskRefusal);
    expect(refusal).toMatchObject({ code: "DAILY_COST_ENVELOPE_REACHED" });
    expect(panelDiscovered).toBe(false);
  });

  it("is INERT when no gate is supplied — local mode admits every ask", async () => {
    let panelDiscovered = false;
    await evaluateAskAdmission(settingsWith({
      resolveDiscoveredPanel: async () => { panelDiscovered = true; return []; }
    }), ASK).catch((error: unknown) => {
      // Whatever else this fixture ask runs into, it must never be the money
      // gate: local mode has no daily envelope to reach.
      expect(error).not.toMatchObject({ code: "DAILY_COST_ENVELOPE_REACHED" });
    });

    expect(panelDiscovered).toBe(true);
  });
});

describe("V-28 both shipped roots carry the envelopes", () => {
  it("the runner gives its gateway the per-run money seam", async () => {
    const source = await readFile(
      new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8"
    );
    expect(source).toContain("CostEnvelopeGuard");
    expect(source).toContain("PostgresModelSpendStore");
    expect(source).toContain("readCostEnvelopePolicy");
    // Wired per target, because the price is the target's.
    expect(source).toContain("providerSeam(");
    expect(source).toContain("providerTargetPrice(");
  });

  it("the API gates a new ask on the daily envelope", async () => {
    const source = await readFile(
      new URL("../../apps/api/src/main.ts", import.meta.url), "utf8"
    );
    expect(source).toContain("CostEnvelopeGuard");
    expect(source).toContain("readCostEnvelopePolicy");
    expect(source).toContain("assertDailyCostEnvelope");
  });

  it("the API refuses to boot hosted without the three support admission scopes", async () => {
    const source = await readFile(
      new URL("../../apps/api/src/main.ts", import.meta.url), "utf8"
    );
    // The amendment: the check is taken where the admission row IN FORCE has
    // been read, which is the earliest point a pool exists to read it with.
    expect(source).toContain("assertHostedSupportAdmissionSealed(");
    expect(source).toContain("admissionPolicy");
  });

  it("the deployment register publishes the cost-envelope row", async () => {
    const source = await readFile(
      new URL("../../apps/runner/src/dev-deployment-register.ts", import.meta.url), "utf8"
    );
    expect(source).toContain("COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW");
  });
});

/**
 * RULING R1 (review round 2) — A DAY-SPENT ASK ANSWERS 429, NOT 422.
 *
 * 422 says "this request is wrong". The request is not wrong: it is well formed,
 * it would have been admitted an hour earlier, and it will be admitted again
 * after midnight. 429 says "not now, try later", and `Retry-After` says exactly
 * when — the next UTC midnight, which is the instant the daily envelope resets,
 * so a caller and any client library built on the header wait the right amount
 * of time instead of hammering or giving up.
 *
 * Every other ask refusal keeps 422: those really are about the ask.
 */
describe("R1 — the day-spent refusal is a retry, not a rejection", () => {
  it("answers 429 for the daily envelope and 422 for every other ask refusal", () => {
    expect(askRefusalStatus("DAILY_COST_ENVELOPE_REACHED")).toBe(429);
    for (const code of [
      "MAKER_INVENTORY_UNSATISFIED",
      "RUN_COST_ENVELOPE_UNRESOLVED",
      "OWNER_PRIVATE_HISTORY_SCAN_SATURATED"
    ]) {
      expect(askRefusalStatus(code)).toBe(422);
    }
  });

  it("names the next UTC midnight, whatever time of day it is asked", () => {
    expect(askRefusalRetryAfter("DAILY_COST_ENVELOPE_REACHED", new Date("2026-09-22T00:00:00.000Z")))
      .toBe("Wed, 23 Sep 2026 00:00:00 GMT");
    expect(askRefusalRetryAfter("DAILY_COST_ENVELOPE_REACHED", new Date("2026-09-22T23:59:59.999Z")))
      .toBe("Wed, 23 Sep 2026 00:00:00 GMT");
    // Across a month end, so the date arithmetic is real and not a +1 on the day.
    expect(askRefusalRetryAfter("DAILY_COST_ENVELOPE_REACHED", new Date("2026-09-30T18:00:00.000Z")))
      .toBe("Thu, 01 Oct 2026 00:00:00 GMT");
  });

  it("sends no Retry-After for a refusal that retrying will not fix", () => {
    expect(askRefusalRetryAfter("MAKER_INVENTORY_UNSATISFIED", new Date())).toBeNull();
  });
});

/**
 * RE-REVIEW I6 — THE 429 BODY WAS TELLING EVERY CALLER WHAT THE DEPLOYMENT
 * SPENDS.
 *
 * `dailyCostEnvelopeReached` builds "spent N of M USD micro-units today" so the
 * operator can see how close the day was, and the ask boundary returns
 * `knownError.message` as the public body for any status below 500. So an
 * anonymous caller who asked once after midnight could read the deployment's
 * daily ceiling, and by asking again could watch the spend climb — a commercial
 * figure, and a capacity oracle for anyone wanting to exhaust it. Same class as
 * the support status-page leak (DL1-F4).
 *
 * The public body carries the CODE and `Retry-After`. The figures stay on the
 * error for the operator's log, which is where they were useful.
 */
describe("I6 — the day-spent body tells the caller nothing about the money", () => {
  it("returns the code, not the message, for the daily refusal", () => {
    const refusal = dailyCostEnvelopeReached({
      kind: "REACHED", spentMicrosToday: 1_999_999, ceilingMicros: 2_000_000
    });

    // The message the operator needs still exists on the error...
    expect(refusal.message).toContain("1999999");
    expect(refusal.message).toContain("2000000");
    // ...and none of it reaches the caller.
    const body = askRefusalPublicMessage(refusal.code, refusal.message);
    expect(body).toBe("DAILY_COST_ENVELOPE_REACHED");
    expect(body).not.toContain("1999999");
    expect(body).not.toContain("2000000");
  });

  it("leaves every other ask refusal's message alone", () => {
    // Those messages describe the ASK, which the caller sent, so withholding
    // them would only make a well-formed refusal unactionable.
    expect(askRefusalPublicMessage("MAKER_INVENTORY_UNSATISFIED", "no healthy maker"))
      .toBe("no healthy maker");
  });
});
